BDT.register({
  id: "l03",
  kind: "lab",
  num: 3,
  title: "Работа с распределенной файловой системой Hadoop (HDFS) и управление файлами",
  hours: 4,
  env: ["hdfs"],
  goals: [
    "Понять архитектуру HDFS: NameNode, DataNode, SecondaryNameNode, блоки и репликацию",
    "Научиться запускать кластер и проверять его состояние: `jps`, `dfsadmin -report`, `fsck`",
    "Управлять файлами в HDFS: структура каталогов, фактор репликации, место на дисках, права доступа",
    "Разобраться с безопасным режимом (safe mode) NameNode",
  ],
  theory: R`
## Зачем нужна HDFS

**Hadoop** — экосистема для хранения и обработки больших данных на кластере из обычных («commodity») серверов. Её основа:

| Компонент | Назначение |
|---|---|
| **HDFS** (Hadoop Distributed File System) | распределённое хранение файлов |
| **YARN** | распределение ресурсов кластера (CPU, память) между задачами |
| **MapReduce** | модель пакетной обработки данных |
| Hive, HBase, Spark, Sqoop, Kafka… | надстройки: SQL, NoSQL, быстрые вычисления, загрузка данных |

HDFS рассчитана на **очень большие файлы** (гигабайты и терабайты), которые **записываются один раз и читаются много раз** (write once, read many). Отказ отдельного диска или сервера — нормальная ситуация, поэтому данные хранятся в нескольких копиях.

## Архитектура: master и workers

\`\`\`text
                       +---------------------------+
   клиент -- запрос -->|         NameNode          |  метаданные в памяти:
   (hdfs dfs ...)      |  /user/student/a.log ->   |  дерево каталогов, права,
        |              |  blk_1, blk_2, blk_3      |  файл -> блоки -> DataNode
        |              +---------------------------+
        |                    ^ heartbeat (каждые 3 с) + block report
        | данные             |
        v                    |
  +------------+     +------------+     +------------+
  | DataNode 1 |     | DataNode 2 |     | DataNode 3 |
  | blk_1 blk_2|     | blk_1 blk_3|     | blk_2 blk_3|   ...
  +------------+     +------------+     +------------+
\`\`\`

| Процесс | Роль |
|---|---|
| **NameNode** | «главный» узел. Хранит **только метаданные**: пространство имён (каталоги, файлы, права) и карту «блок → DataNode». Сохраняет их на диск в виде снимка \`fsimage\` и журнала изменений \`edits\` |
| **DataNode** | «рабочие» узлы. Хранят **сами блоки** на локальных дисках, регулярно отправляют NameNode сигнал жизни (heartbeat) и список своих блоков (block report) |
| **SecondaryNameNode** | периодически объединяет \`fsimage\` и \`edits\` в новый снимок (**checkpoint**). Это **не** резервный NameNode! Для отказоустойчивости используют режим HA: Active + Standby NameNode |

## Блоки

Каждый файл делится на **блоки** фиксированного размера — по умолчанию **128 МБ** (\`dfs.blocksize\`). Блоки разных файлов разбрасываются по разным DataNode.

| Размер файла | Блоки (128 МБ) |
|---|---|
| 1 КБ | 1 блок, на диске занимает 1 КБ (а не 128 МБ!) |
| 300 МБ | 128 + 128 + 44 → **3 блока** |
| 1 ГБ | 8 блоков |

Число блоков = ⌈размер / 128 МБ⌉. Большой размер блока уменьшает объём метаданных в памяти NameNode и время на поиск по диску. Обратная сторона — **проблема мелких файлов**: каждый файл и блок занимает ~150 байт памяти NameNode, поэтому миллионы файлов по 1 КБ «съедают» её быстрее, чем терабайты в больших файлах.

## Репликация и rack awareness

Каждый блок хранится в нескольких **репликах** — по умолчанию **3** (\`dfs.replication\`). Если DataNode перестал присылать heartbeat (≈ 10 минут), NameNode считает его «мёртвым» и создаёт недостающие реплики на других узлах.

Политика размещения с учётом стоек (**rack awareness**):

1. первая реплика — на узле, где работает клиент (или на случайном узле);
2. вторая — на узле **другой стойки** (переживёт отказ целой стойки);
3. третья — на другом узле **той же стойки**, что и вторая (экономия межстоечного трафика).

Место на дисках = размер × фактор репликации: файл 300 МБ при репликации 3 занимает ≈ 900 МБ. Фактор можно менять для отдельных файлов: \`hdfs dfs -setrep 2 файл\`.

## Как идут запись и чтение

**Запись:** клиент просит NameNode создать файл → NameNode проверяет права и выдаёт список DataNode для очередного блока → клиент передаёт данные пакетами по **конвейеру** DataNode 1 → 2 → 3, подтверждения идут обратно → после последнего блока NameNode фиксирует файл.

**Чтение:** клиент получает у NameNode адреса блоков (ближайшие реплики первыми) и читает их **напрямую с DataNode**; при сбое переходит к другой реплике, целостность проверяется по контрольным суммам.

> [!IMPORTANT] Данные не проходят через NameNode
> NameNode только «знает», где что лежит. Поток данных идёт между клиентом и DataNode — поэтому один NameNode обслуживает тысячи узлов.

## Команды администрирования

| Команда | Что делает |
|---|---|
| \`start-dfs.sh\`, \`stop-dfs.sh\` | запуск и остановка NameNode, DataNode, SecondaryNameNode |
| \`jps\` | список Java-процессов на машине |
| \`hdfs getconf -confKey dfs.blocksize\` | значение параметра конфигурации |
| \`hdfs dfsadmin -report\` | ёмкость кластера, живые и мёртвые DataNode |
| \`hdfs fsck /путь -files -blocks -locations\` | здоровье файлов, их блоки и узлы с репликами |
| \`hdfs dfs -setrep -w 2 файл\` | изменить фактор репликации (\`-w\` — дождаться) |
| \`hdfs dfs -stat "%r %o %b" файл\` | репликация, размер блока, размер файла |
| \`hdfs dfs -du -s -h\`, \`-df -h\`, \`-count -v\` | занятое место, ёмкость ФС, число файлов |
| \`hdfs dfs -chmod 750\`, \`-chown user:group\` | права доступа и владелец |
| \`hdfs dfs -getmerge -nl каталог локальный_файл\` | склеить файлы каталога в один локальный |
| \`hdfs dfsadmin -safemode get / enter / leave\` | безопасный режим NameNode |

**Права доступа** в HDFS устроены как в Linux: владелец, группа, остальные; \`r\` — чтение, \`w\` — запись, \`x\` — для каталога вход в него. Менять владельца может только **суперпользователь** — тот, от чьего имени запущен NameNode (обычно \`hdfs\`).

**Safe mode** — режим «только чтение». NameNode входит в него сам при старте, пока DataNode не сообщат о достаточном числе блоков, а администратор включает его вручную перед обслуживанием кластера.

> [!WARNING] hdfs namenode -format
> Форматирование стирает все метаданные: файлы в HDFS «исчезнут». Его выполняют один раз при установке кластера.

> [!NOTE] Как устроен тренажёр
> Терминал — учебный эмулятор кластера Hadoop 3.3: NameNode и 3 DataNode, блок 128 МБ, репликация 3. Журнал \`~/logs/access_2026-11.log\` условно имеет размер 300 МБ, чтобы на нём были видны несколько блоков. Состояние кластера сохраняется между занятиями.
`,
  tasks: [
    {
      id: "t1",
      env: "hdfs",
      title: "Запуск кластера и проверка процессов",
      text: R`
Кластер изначально **остановлен**.

1. Запустите HDFS: \`start-dfs.sh\`.
2. Проверьте Java-процессы командой \`jps\` — должны появиться \`NameNode\`, \`DataNode\` и \`SecondaryNameNode\`.
3. Узнайте из конфигурации размер блока и фактор репликации:
   \`hdfs getconf -confKey dfs.blocksize\` и \`hdfs getconf -confKey dfs.replication\`.

Убедитесь, что 134217728 байт — это ровно 128 × 1024 × 1024, то есть 128 МБ.
`,
      check: (t) => {
        t.ok(t.running(), "HDFS запущен (start-dfs.sh)");
        t.ok(t.ran(/^(sudo\s+)?jps\b/), "Процессы проверены командой jps");
        t.ok(t.ran(/getconf\s+-confKey\s+dfs\.blocksize/), "Размер блока узнан: hdfs getconf -confKey dfs.blocksize");
        t.ok(t.ran(/getconf\s+-confKey\s+dfs\.replication/), "Фактор репликации узнан: hdfs getconf -confKey dfs.replication");
      },
      hint: "Команды вводятся по одной: `start-dfs.sh`, затем `jps`, затем две команды `hdfs getconf -confKey ...`.",
      solution: R`start-dfs.sh
jps
hdfs getconf -confKey dfs.blocksize
hdfs getconf -confKey dfs.replication`,
    },
    {
      id: "t2",
      env: "answer",
      title: "Отчёт о состоянии кластера",
      text: R`
Выполните в терминале (на странице задания 1 или в разделе «Песочница» → «HDFS») команду

\`\`\`bash
hdfs dfsadmin -report
\`\`\`

Изучите отчёт: общая ёмкость (*Configured Capacity*), занятое место (*DFS Used*), сведения о каждом узле.

**Сколько живых DataNode (*Live datanodes*) в кластере?** Введите число.
`,
      answers: ["3", "три", "uch"],
      explain: R`В отчёте есть строка \`Live datanodes (3)\`, а ниже — блок сведений о каждом узле (\`bigdata-dn1\`…\`bigdata-dn3\`). Каждый DataNode раз в 3 секунды присылает NameNode heartbeat; если сигнала нет около 10 минут, узел попадает в список *Dead datanodes*, и NameNode восстанавливает его блоки из других реплик.`,
    },
    {
      id: "t3",
      env: "hdfs",
      title: "Структура каталогов проекта",
      text: R`
Создайте в домашнем каталоге HDFS (\`/user/student\`, относительные пути отсчитываются от него) структуру учебного проекта:

\`\`\`text
project/
|-- raw/        <- исходные тексты
|-- logs/       <- журналы веб-сервера
|-- results/    <- результаты обработки
+-- archive/    <- архив
\`\`\`

1. Создайте все четыре каталога **одной** командой \`hdfs dfs -mkdir -p\` (можно перечислить несколько путей через пробел).
2. Загрузите в \`project/raw\` тексты \`uz_01.txt … uz_09.txt\` из локального каталога \`~/corpus\`, используя шаблон \`corpus/uz_0?.txt\` (знак \`?\` — ровно один любой символ). Если файлы уже загружены, добавьте ключ \`-f\`.
3. Посмотрите результат рекурсивно: \`hdfs dfs -ls -R project\`.
4. Склейте все тексты из \`project/raw\` в **один локальный файл** \`~/raw_merged.txt\` командой \`hdfs dfs -getmerge -nl\` (ключ \`-nl\` добавляет перевод строки после каждого файла) и посчитайте его строки: \`wc -l raw_merged.txt\`.
`,
      check: (t) => {
        const P = "/user/student/project";
        t.ok(["raw", "logs", "results", "archive"].every((d) => t.hdfs.isDir(P + "/" + d)), "Созданы каталоги project/raw, project/logs, project/results, project/archive");
        const raw = t.hdfs.list(P + "/raw").filter((f) => /^uz_0\d\.txt$/.test(f));
        t.ok(raw.length >= 9, "В project/raw загружены тексты uz_01.txt … uz_09.txt (сейчас: " + raw.length + ")");
        t.ok(t.ran(/-ls\b[^|]*\s-R\b/) || t.ran(/-lsr\b/), "Дерево каталогов просмотрено командой hdfs dfs -ls -R");
        const merged = t.local.read("/home/student/raw_merged.txt") || "";
        const u9 = t.hdfs.read(P + "/raw/uz_09.txt") || "";
        t.ok(merged.length > 0 && u9.length > 0 && merged.includes(u9.slice(0, 40)), "Тексты из project/raw склеены в локальный файл ~/raw_merged.txt (-getmerge)");
      },
      hint: "`hdfs dfs -mkdir -p project/raw project/logs project/results project/archive`, затем `hdfs dfs -put corpus/uz_0?.txt project/raw/`. Склейка: `hdfs dfs -getmerge -nl project/raw ~/raw_merged.txt`.",
      solution: R`hdfs dfs -mkdir -p project/raw project/logs project/results project/archive
hdfs dfs -put -f corpus/uz_0?.txt project/raw/
hdfs dfs -ls -R project
hdfs dfs -getmerge -nl project/raw ~/raw_merged.txt
wc -l raw_merged.txt`,
    },
    {
      id: "t4",
      env: "hdfs",
      title: "Большой файл: блоки и их размещение",
      text: R`
Локальный файл \`~/logs/access_2026-11.log\` — журнал веб-сервера объёмом около **300 МБ**.

1. Загрузите его в каталог \`project/logs\`.
2. Посмотрите размер в удобных единицах: \`hdfs dfs -ls -h project/logs\`.
3. Выясните, на какие блоки HDFS разбил файл и на каких DataNode лежат реплики:

\`\`\`bash
hdfs fsck /user/student/project/logs/access_2026-11.log -files -blocks -locations
\`\`\`

В выводе найдите строки вида \`0. BP-...:blk_1073741834_1010 len=134217728 Live_repl=3 [DatanodeInfoWithStorage[192.168.10.11:9866,...], ...]\` — это номер блока, его длина, число живых реплик и адреса DataNode. В конце отчёта — сводка: \`Total blocks\`, \`Average block replication\`, \`Status: HEALTHY\`.
`,
      check: (t) => {
        const f = "/user/student/project/logs/access_2026-11.log";
        t.ok(t.hdfs.isFile(f), "Файл загружен: project/logs/access_2026-11.log");
        t.ok(t.hdfs.size(f) > 300 * 1024 * 1024, "Размер файла в HDFS ≈ 300 МБ");
        t.ok(t.ran(/^hdfs fsck\s.*project\/logs/), "Выполнена проверка hdfs fsck для файла (или каталога) project/logs");
        t.ok(t.ran(/^hdfs fsck\s(?=.*\s-files\b)(?=.*\s-blocks\b)(?=.*\s-locations\b)/), "fsck запущен с ключами -files -blocks -locations");
      },
      hint: "`hdfs dfs -put logs/access_2026-11.log project/logs/`, затем команда `hdfs fsck` из условия.",
      solution: R`hdfs dfs -put -f logs/access_2026-11.log project/logs/
hdfs dfs -ls -h project/logs
hdfs fsck /user/student/project/logs/access_2026-11.log -files -blocks -locations`,
    },
    {
      id: "t5",
      env: "answer",
      title: "Сколько блоков у файла?",
      text: R`
По выводу \`fsck\` из прошлого задания ответьте: **на сколько блоков HDFS разбил файл \`access_2026-11.log\`?**

Подсказка: размер файла ≈ 300 МБ, размер блока — 128 МБ. Введите число.
`,
      answers: ["3", "три", "uch"],
      explain: R`300 МБ = 128 + 128 + 44 МБ → **3 блока** (\`Total blocks (validated): 3\`). Последний блок занимает на диске только 44 МБ, а не 128. При репликации 3 в кластере хранятся 3 × 3 = 9 реплик блоков, а на дисках занято ≈ 900 МБ.`,
    },
    {
      id: "t6",
      env: "hdfs",
      title: "Репликация и занятое место",
      text: R`
Журналы прошлого месяца читают редко, поэтому для экономии места уменьшим их фактор репликации до **2**.

1. Посмотрите, сколько места занимает каталог: \`hdfs dfs -du -s -h project/logs\`. Первое число — размер данных, второе — место на дисках **с учётом всех реплик**.
2. Измените репликацию файла: \`hdfs dfs -setrep -w 2 project/logs/access_2026-11.log\` (ключ \`-w\` ждёт, пока лишние реплики будут удалены).
3. Проверьте результат: \`hdfs dfs -stat "%r" project/logs/access_2026-11.log\`. В формат можно добавить \`%o\` (размер блока), \`%b\` (размер файла), \`%n\` (имя).
4. Снова выполните \`-du -s -h\` — как изменилось второе число?
5. Оцените общее состояние: \`hdfs dfs -df -h\` (ёмкость и заполненность всей ФС) и \`hdfs dfs -count -v -h project\` (число каталогов, файлов и объём данных проекта).
`,
      check: (t) => {
        const s = t.hdfs.stat("/user/student/project/logs/access_2026-11.log");
        t.ok(s && s.rep === 2, "Фактор репликации access_2026-11.log равен 2" + (s ? " (сейчас: " + s.rep + ")" : " (файл не найден — выполните задание 4)"));
        t.ok(t.ran(/\s-stat\s+\S*%r/), "Репликация проверена командой hdfs dfs -stat \"%r\" ...");
        t.ok(t.ran(/\s-du\s/), "Занятое место оценено командой hdfs dfs -du");
        t.ok(t.ran(/\s-df\b/), "Ёмкость файловой системы оценена командой hdfs dfs -df");
        t.ok(t.ran(/\s-count\b/), "Выполнена команда hdfs dfs -count");
      },
      hint: "`hdfs dfs -setrep -w 2 project/logs/access_2026-11.log`, затем `hdfs dfs -stat \"%r\" project/logs/access_2026-11.log`. После этого второе число в `-du` станет ≈ 600 МБ вместо ≈ 900 МБ.",
      solution: R`hdfs dfs -du -s -h project/logs
hdfs dfs -setrep -w 2 project/logs/access_2026-11.log
hdfs dfs -stat "%r %o %b %n" project/logs/access_2026-11.log
hdfs dfs -du -s -h project/logs
hdfs dfs -df -h
hdfs dfs -count -v -h project`,
    },
    {
      id: "t7",
      env: "hdfs",
      title: "Права доступа и безопасный режим",
      text: R`
**Часть 1. Права доступа.** Каталог \`project/results\` должен быть доступен полностью владельцу, на чтение — группе аналитиков \`analysts\`, а остальным — закрыт.

1. Установите права \`750\` (\`rwxr-x---\`) рекурсивно: \`hdfs dfs -chmod -R 750 project/results\`.
2. Владельца и группу меняет только суперпользователь HDFS (тот, кто запустил NameNode, — \`hdfs\`), поэтому выполните команду от его имени:
   \`sudo -u hdfs hdfs dfs -chown -R student:analysts project/results\`.
3. Проверьте: \`hdfs dfs -ls -d project/results\` — ожидается \`drwxr-x---   - student analysts ...\`.

**Часть 2. Safe mode.** Перед обслуживанием кластера администратор переводит NameNode в безопасный режим — только чтение.

1. Включите его: \`hdfs dfsadmin -safemode enter\` и проверьте: \`hdfs dfsadmin -safemode get\`.
2. Попробуйте создать каталог \`hdfs dfs -mkdir project/tmp\` — прочитайте сообщение об ошибке. Убедитесь, что чтение (\`hdfs dfs -ls project\`) при этом работает.
3. Выключите безопасный режим (\`-safemode leave\`) и снова создайте каталог \`project/tmp\`.
`,
      check: (t) => {
        const r = t.hdfs.stat("/user/student/project/results");
        t.ok(r && r.perm === "drwxr-x---", "Права project/results: drwxr-x--- (750)" + (r ? ", сейчас " + r.perm : ""));
        t.ok(r && r.group === "analysts", "Группа владельцев project/results — analysts (-chown student:analysts)");
        t.ok(t.ran(/dfsadmin\s+-safemode\s+enter/), "NameNode переводился в безопасный режим (-safemode enter)");
        t.ok(t.ran(/dfsadmin\s+-safemode\s+leave/) && !t.safemode(), "Безопасный режим выключен (-safemode leave)");
        t.ok(t.hdfs.isDir("/user/student/project/tmp"), "После выхода из safe mode создан каталог project/tmp");
      },
      hint: "Порядок: `-chmod -R 750`, `sudo -u hdfs hdfs dfs -chown -R student:analysts project/results`, `hdfs dfsadmin -safemode enter`, попытка `-mkdir`, `hdfs dfsadmin -safemode leave`, снова `-mkdir`.",
      solution: R`hdfs dfs -chmod -R 750 project/results
sudo -u hdfs hdfs dfs -chown -R student:analysts project/results
hdfs dfs -ls -d project/results
hdfs dfsadmin -safemode enter
hdfs dfsadmin -safemode get
hdfs dfs -mkdir project/tmp
hdfs dfs -ls project
hdfs dfsadmin -safemode leave
hdfs dfs -mkdir -p project/tmp`,
    },
  ],
  quiz: [
    { q: "Какой процесс хранит метаданные HDFS: дерево каталогов, права и соответствие «файл → блоки → DataNode»?", options: ["NameNode", "DataNode", "SecondaryNameNode", "ResourceManager"], answer: 0, explain: "NameNode держит пространство имён и карту блоков в памяти. DataNode хранят сами блоки, ResourceManager — компонент YARN." },
    { q: "Что делает SecondaryNameNode?", options: ["Автоматически заменяет NameNode при сбое", "Периодически объединяет fsimage и журнал edits (checkpoint)", "Хранит третью реплику каждого блока", "Распределяет задачи MapReduce"], answer: 1, explain: "SecondaryNameNode — помощник для контрольных точек, а не горячий резерв. Автоматическое переключение обеспечивает режим HA со Standby NameNode." },
    { q: "Файл 1 ГБ, размер блока 128 МБ, репликация 3. Сколько реплик блоков этого файла хранится в кластере?", options: ["8", "24", "3", "1024"], answer: 1, explain: "1024 / 128 = 8 блоков, каждый в 3 копиях: 8 × 3 = 24 реплики (≈ 3 ГБ на дисках)." },
    { q: "Как по умолчанию размещаются 3 реплики блока с учётом стоек (rack awareness)?", options: ["Все три — на одном узле", "На трёх узлах одной стойки", "1-я — на узле клиента, 2-я — в другой стойке, 3-я — на другом узле той же стойки, что и 2-я", "Каждая — в отдельном дата-центре"], answer: 2, explain: "Так данные переживут отказ целой стойки, а межстоечного трафика будет меньше, чем при трёх разных стойках." },
    { q: "Через какой узел проходят данные, когда клиент читает файл из HDFS?", options: ["Через NameNode", "Напрямую с DataNode; NameNode лишь сообщает адреса блоков", "Через SecondaryNameNode", "Через ResourceManager"], answer: 1, explain: "NameNode выдаёт клиенту список блоков и DataNode, а данные клиент читает напрямую с ближайших DataNode." },
    { q: "Какая команда изменит фактор репликации уже записанного файла?", options: ["`hdfs dfs -setrep 2 /data/file.log`", "`hdfs dfs -chmod 2 /data/file.log`", "`hdfs dfsadmin -replication 2`", "`hdfs getconf -confKey dfs.replication=2`"], answer: 0, explain: "`-setrep` меняет репликацию существующих файлов (для каталога — всех файлов в нём). Параметр `dfs.replication` действует только на новые файлы." },
  ],
  realEnv: R`
## Вариант 1. Кластер в Docker (рекомендуется)

Нужен [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) или Docker Engine (Linux). Создайте папку \`hadoop\` и в ней два файла.

\`\`\`yaml docker-compose.yml
services:
  namenode:
    image: apache/hadoop:3
    hostname: namenode
    command: ["hdfs", "namenode"]
    ports:
      - 9870:9870
    env_file: ./config
    environment:
      ENSURE_NAMENODE_DIR: "/tmp/hadoop-root/dfs/name"
  datanode:
    image: apache/hadoop:3
    command: ["hdfs", "datanode"]
    env_file: ./config
\`\`\`

\`\`\`text config
CORE-SITE.XML_fs.defaultFS=hdfs://namenode
HDFS-SITE.XML_dfs.namenode.rpc-address=namenode:8020
HDFS-SITE.XML_dfs.replication=3
\`\`\`

\`\`\`bash
docker compose up -d --scale datanode=3      # NameNode + 3 DataNode
docker compose exec namenode bash            # терминал внутри кластера
hdfs dfsadmin -report                        # Live datanodes (3)
\`\`\`

Чтобы загрузить свои файлы, скопируйте их в контейнер: \`docker compose cp corpus namenode:/tmp/corpus\`, затем внутри — \`hdfs dfs -put /tmp/corpus/*.txt ...\`.

## Вариант 2. Однонодовая установка (Ubuntu или WSL в Windows)

\`\`\`bash
sudo apt update && sudo apt install -y openjdk-11-jdk ssh
wget https://dlcdn.apache.org/hadoop/common/hadoop-3.3.6/hadoop-3.3.6.tar.gz
tar -xzf hadoop-3.3.6.tar.gz && mv hadoop-3.3.6 ~/hadoop
echo 'export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64' >> ~/.bashrc
echo 'export HADOOP_HOME=~/hadoop' >> ~/.bashrc
echo 'export PATH=$PATH:$HADOOP_HOME/bin:$HADOOP_HOME/sbin' >> ~/.bashrc
source ~/.bashrc
ssh-keygen -t rsa -P "" -f ~/.ssh/id_rsa && cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
\`\`\`

Настройте два файла в \`~/hadoop/etc/hadoop/\` (и строку \`export JAVA_HOME=...\` в \`hadoop-env.sh\`):

\`\`\`xml core-site.xml
<configuration>
  <property>
    <name>fs.defaultFS</name>
    <value>hdfs://localhost:9000</value>
  </property>
</configuration>
\`\`\`

\`\`\`xml hdfs-site.xml
<configuration>
  <property>
    <name>dfs.replication</name>
    <value>1</value>   <!-- один узел — одна реплика -->
  </property>
</configuration>
\`\`\`

\`\`\`bash
hdfs namenode -format        # один раз!
start-dfs.sh
jps                          # NameNode, DataNode, SecondaryNameNode
hdfs dfs -mkdir -p /user/$USER
\`\`\`

## Веб-интерфейс NameNode

Откройте **http://localhost:9870**: вкладка *Overview* — ёмкость и safe mode, *Datanodes* — список узлов, *Utilities → Browse the file system* — файлы, их блоки и реплики (то же, что \`fsck\`, но мышкой).

> [!TIP] Сравните с тренажёром
> Выполните на настоящем кластере команды этой работы: \`fsck\` покажет реальные идентификаторы блоков, а в однонодовой установке \`Live_repl=1\` — потому что DataNode всего один.
`,
  homework: R`
## Самостоятельная работа: «Архитектура HDFS и принципы её функционирования»

Подготовьте конспект (2–3 страницы) или схему с пояснениями:

1. Пошагово опишите **запись** файла 300 МБ в HDFS (запросы к NameNode, конвейер DataNode, подтверждения) и **чтение** этого файла.
2. Что хранится в \`fsimage\` и \`edits\`, как SecondaryNameNode делает checkpoint и чем он отличается от **Standby NameNode** в режиме HA (роль JournalNode и ZooKeeper).
3. Как NameNode обнаруживает отказ DataNode и восстанавливает реплики. Что такое under-replicated и corrupt blocks в отчёте \`fsck\`?
4. **Erasure Coding** в Hadoop 3 (схема RS-6-3): почему он требует ≈ 1,5× места вместо 3× при репликации и где его выгодно применять.
5. Проблема мелких файлов: оцените, сколько памяти NameNode займут 10 млн файлов по 1 КБ (≈ 150 байт на файл и на блок) и какие есть решения (HAR, SequenceFile, Parquet).
`,
});
