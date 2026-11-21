BDT.register({
  id: "p09",
  kind: "practice",
  num: 9,
  title: "Загрузка, просмотр и управление файлами с использованием команд HDFS",
  hours: 2,
  env: ["hdfs"],
  goals: [
    "Освоить синтаксис `hdfs dfs` и различать локальную файловую систему и HDFS",
    "Научиться загружать файлы в HDFS и скачивать их обратно (`-put`, `-get`, шаблоны `*` и `?`)",
    "Просматривать, копировать, перемещать, удалять и дописывать файлы в HDFS",
    "Организовать текстовый корпус по зонам raw / clean / archive",
  ],
  theory: R`
## Две файловые системы

Работая с Hadoop, вы всегда имеете дело с **двумя** файловыми системами:

\`\`\`text
  Локальная ФС (диск машины)                    HDFS (кластер)
  /home/student/                                /user/student/
  |-- corpus/uz_01.txt  ---- hdfs dfs -put ---> |-- corpus/raw/uz_01.txt
  |-- data/students.csv                         |-- tables/students.csv
  +-- downloads/        <--- hdfs dfs -get ---- +-- corpus/archive/uz_16.txt
\`\`\`

- обычные команды Linux (\`ls\`, \`cat\`, \`mkdir\`) работают с **локальным** диском;
- команды \`hdfs dfs -<команда>\` (или синоним \`hadoop fs -<команда>\`) работают с **HDFS**.

**Пути в HDFS.** Абсолютный путь начинается с \`/\`: \`/user/student/corpus\`. Относительный путь отсчитывается от домашнего каталога пользователя \`/user/<имя>\`: команда \`hdfs dfs -ls corpus\` покажет \`/user/student/corpus\`. Полная форма с адресом NameNode: \`hdfs://bigdata-master:9000/user/student/corpus\`.

## Основные команды

| Группа | Команды | Пример |
|---|---|---|
| Навигация | \`-ls\`, \`-ls -R\`, \`-ls -h\`, \`-count\`, \`-du -h\` | \`hdfs dfs -ls -R corpus\` |
| Каталоги | \`-mkdir -p\`, \`-rmdir\` | \`hdfs dfs -mkdir -p corpus/raw\` |
| Загрузка в HDFS | \`-put\` (= \`-copyFromLocal\`), \`-moveFromLocal\`, \`-appendToFile\` | \`hdfs dfs -put data/students.csv tables/\` |
| Скачивание | \`-get\` (= \`-copyToLocal\`), \`-getmerge\` | \`hdfs dfs -get corpus/raw/uz_01.txt downloads/\` |
| Просмотр | \`-cat\`, \`-head\`, \`-tail\`, \`-text\` | \`hdfs dfs -head corpus/raw/uz_02.txt\` |
| Управление | \`-cp\`, \`-mv\`, \`-rm\`, \`-rm -r\` | \`hdfs dfs -mv a.txt archive/\` |
| Проверки и поиск | \`-test -e/-d/-f/-z/-s\`, \`-find\`, \`-stat\` | \`hdfs dfs -find corpus -name "*.txt"\` |

Полезные ключи:

- \`-mkdir -p\` — создать и все родительские каталоги, без ошибки, если каталог уже есть;
- \`-put -f\` / \`-get -f\` / \`-cp -f\` — перезаписать существующий файл;
- \`-ls -h\` — размеры в КБ/МБ/ГБ; \`-ls -R\` — рекурсивно; \`-ls -d\` — сведения о самом каталоге;
- \`-rm -r\` — удалить каталог со всем содержимым; \`-skipTrash\` — сразу, минуя корзину.

## Вывод команды -ls

\`\`\`text
Found 2 items
drwxr-xr-x   - student supergroup          0 2026-11-21 10:15 corpus/raw
-rw-r--r--   3 student supergroup       4096 2026-11-21 10:16 corpus/raw/uz_01.txt
\`\`\`

Столбцы: права, **фактор репликации** (у каталогов — \`-\`), владелец, группа, размер в байтах, дата изменения, путь.

## Шаблоны имён: * и ?

\`*\` — любая последовательность символов, \`?\` — ровно один символ. Важно, **кто** раскрывает шаблон:

- в \`hdfs dfs -put corpus/uz_*.txt corpus/raw/\` шаблон относится к **локальным** файлам — его раскрывает оболочка bash;
- в \`hdfs dfs -ls 'corpus/raw/uz_1*'\` или \`hdfs dfs -find corpus -name "*.txt"\` шаблон должен дойти до HDFS, поэтому его **берут в кавычки** — иначе bash попытается подставить локальные файлы.

## Конвейеры и коды возврата

Вывод \`hdfs dfs\` можно передавать обычным командам Linux:

\`\`\`bash
hdfs dfs -cat tables/students.csv | head -3        # первые 3 строки
hdfs dfs -cat corpus/raw/uz_01.txt | wc -w         # число слов
hdfs dfs -find corpus -name "*.txt" > list.txt     # сохранить список в локальный файл
\`\`\`

Команда \`-test\` ничего не печатает: результат — **код возврата** (\`0\` — истина, \`1\` — ложь). Его можно посмотреть через \`echo $?\` или использовать в цепочке: \`hdfs dfs -test -e файл && echo "bor"\`.

## Дозапись вместо изменения

Файлы в HDFS **нельзя изменить в середине** (модель *write once, read many*). Разрешено только дописывать в конец: \`hdfs dfs -appendToFile локальный.txt файл_в_hdfs\`. Так ведут журналы и накапливают поступающие данные.

## Организация данных: зоны raw / clean / archive

В «озёрах данных» (data lake) файлы раскладывают по зонам:

| Зона | Что лежит | Правило |
|---|---|---|
| \`raw\` | исходные данные «как есть» | только добавлять, никогда не исправлять |
| \`clean\` | очищенные и проверенные данные | результат обработки raw |
| \`archive\` | устаревшие данные | хранить дёшево (например, с меньшей репликацией) |

> [!TIP] Автодополнение и история
> В терминале тренажёра работают клавиши ↑/↓ (история команд) и Tab (дополнение имён файлов — локальных или HDFS, в зависимости от команды). Список поддерживаемых команд — \`help\`.

> [!NOTE] Состояние сохраняется
> Кластер и файлы сохраняются между занятиями. Если что-то пошло не так, нажмите «Сбросить кластер» — HDFS и локальные файлы вернутся в исходное состояние (кластер будет остановлен).
`,
  tasks: [
    {
      id: "t1",
      env: "hdfs",
      title: "Запуск и первый взгляд на HDFS",
      text: R`
1. Запустите HDFS: \`start-dfs.sh\`. Если кластер уже работает (вы запускали его на другом занятии), команда об этом сообщит — это нормально.
2. Посмотрите корень файловой системы HDFS: \`hdfs dfs -ls /\`.
3. Посмотрите каталог пользователей \`hdfs dfs -ls /user\` и свой домашний каталог: \`hdfs dfs -ls\` (без пути — это \`/user/student\`).
4. Сравните с локальной файловой системой: \`ls\` и \`ls corpus\` — это файлы на диске клиентской машины, а не в HDFS.
`,
      check: (t) => {
        t.ok(t.running(), "HDFS запущен (start-dfs.sh)");
        t.ok(t.ran(/^(hdfs dfs|hadoop fs)\s+-ls\s+\/\s*$/), "Просмотрен корень HDFS: hdfs dfs -ls /");
        t.ok(t.ran(/^(hdfs dfs|hadoop fs)\s+-ls\s+\/user\/?\s*$/), "Просмотрен каталог /user: hdfs dfs -ls /user");
        t.ok(t.ran(/^ls(\s|$)/), "Просмотрена локальная файловая система командой ls");
      },
      hint: "Сначала `start-dfs.sh`, затем по очереди `hdfs dfs -ls /`, `hdfs dfs -ls /user`, `hdfs dfs -ls` и локальная `ls corpus`.",
      solution: R`start-dfs.sh
hdfs dfs -ls /
hdfs dfs -ls /user
hdfs dfs -ls
ls corpus`,
    },
    {
      id: "t2",
      env: "hdfs",
      title: "Каталоги для корпуса",
      text: R`
Создайте в HDFS структуру хранения корпуса узбекских новостей:

\`\`\`text
/user/student/corpus/raw       <- исходные тексты
/user/student/corpus/clean     <- очищенные тексты
/user/student/corpus/archive   <- архив
\`\`\`

1. Создайте все три каталога **одной** командой \`hdfs dfs -mkdir -p\` (пути перечисляются через пробел; можно относительные — \`corpus/raw\`).
2. Проверьте результат: \`hdfs dfs -ls corpus\`.

> [!TIP] Эксперимент
> Попробуйте создать вложенный каталог без ключа \`-p\`, например \`hdfs dfs -mkdir test/a/b\`, и прочитайте сообщение об ошибке.
`,
      check: (t) => {
        const C = "/user/student/corpus";
        t.ok(["raw", "clean", "archive"].every((d) => t.hdfs.isDir(C + "/" + d)), "Созданы каталоги corpus/raw, corpus/clean и corpus/archive");
        t.ok(t.ran(/\s-ls\s+(-\S+\s+)*(\/user\/student\/)?corpus\/?\s*$/), "Содержимое каталога просмотрено: hdfs dfs -ls corpus");
      },
      hint: "`hdfs dfs -mkdir -p corpus/raw corpus/clean corpus/archive`",
      solution: R`hdfs dfs -mkdir -p corpus/raw corpus/clean corpus/archive
hdfs dfs -ls corpus`,
    },
    {
      id: "t3",
      env: "hdfs",
      title: "Загрузка файлов по шаблону",
      text: R`
1. Загрузите **все 16** текстов \`~/corpus/uz_*.txt\` в \`corpus/raw\` одной командой \`-put\`. Шаблон \`*\` раскроет оболочка по локальным файлам. Если часть файлов уже загружена, добавьте ключ \`-f\` (перезапись).
2. Создайте в HDFS каталог \`tables\` и загрузите в него таблицу \`~/data/students.csv\` командой-синонимом \`-copyFromLocal\`.
3. Посмотрите всё дерево корпуса: \`hdfs dfs -ls -R corpus\`, а размеры файлов в удобном виде — \`hdfs dfs -ls -h corpus/raw\`.
4. Посчитайте каталоги, файлы и общий объём корпуса: \`hdfs dfs -count -v -h corpus\`.
`,
      check: (t) => {
        const raw = t.hdfs.list("/user/student/corpus/raw").filter((f) => /^uz_\d\d\.txt$/.test(f));
        t.ok(raw.length >= 14, "В corpus/raw загружены тексты uz_01…uz_16 (сейчас: " + raw.length + ")");
        t.ok(t.hdfs.isFile("/user/student/tables/students.csv"), "Таблица загружена: /user/student/tables/students.csv");
        t.ok(t.ran(/-copyFromLocal\s/), "Использована команда -copyFromLocal");
        t.ok(t.ran(/-ls\b[^|]*\s-R\b/) || t.ran(/-lsr\b/), "Дерево просмотрено командой hdfs dfs -ls -R");
        t.ok(t.ran(/\s-count\b/), "Выполнена команда hdfs dfs -count");
      },
      hint: "`hdfs dfs -put corpus/uz_*.txt corpus/raw/`, затем `hdfs dfs -mkdir -p tables` и `hdfs dfs -copyFromLocal data/students.csv tables/`.",
      solution: R`hdfs dfs -put -f corpus/uz_*.txt corpus/raw/
hdfs dfs -mkdir -p tables
hdfs dfs -copyFromLocal -f data/students.csv tables/
hdfs dfs -ls -R corpus
hdfs dfs -ls -h corpus/raw
hdfs dfs -count -v -h corpus`,
    },
    {
      id: "t4",
      env: "hdfs",
      title: "Просмотр содержимого файлов",
      text: R`
1. Выведите целиком текст \`corpus/raw/uz_01.txt\` (\`-cat\`).
2. Посмотрите начало файла \`uz_02.txt\` (\`-head\` выводит первый килобайт) и конец файла \`uz_03.txt\` (\`-tail\` — последний килобайт).
3. Конвейеры работают и с HDFS: выведите **первые 3 строки** таблицы \`tables/students.csv\` — \`hdfs dfs -cat ... | head -3\`.
4. Посчитайте, сколько слов в \`uz_01.txt\`: \`hdfs dfs -cat corpus/raw/uz_01.txt | wc -w\`.
5. *(По желанию)* Найдите строки текста со словом «IT»: \`... | grep IT\`.
`,
      check: (t) => {
        t.ok(t.ran(/\s-(cat|text)\s+\S*uz_01\.txt/), "Текст uz_01.txt выведен командой -cat");
        t.ok(t.ran(/\s-head\s+\S*uz_02\.txt/), "Начало uz_02.txt выведено командой -head");
        t.ok(t.ran(/\s-tail\s+\S*uz_03\.txt/), "Конец uz_03.txt выведен командой -tail");
        t.ok(t.ran(/-cat\s+\S*students\.csv\s*\|\s*head\b/), "Первые строки таблицы выведены конвейером -cat ... | head -3");
        t.ok(t.ran(/-cat\s+\S*uz_01\.txt\s*\|\s*wc\s+-w/), "Слова в uz_01.txt посчитаны конвейером -cat ... | wc -w");
      },
      hint: "Например: `hdfs dfs -cat tables/students.csv | head -3` и `hdfs dfs -cat corpus/raw/uz_01.txt | wc -w`.",
      solution: R`hdfs dfs -cat corpus/raw/uz_01.txt
hdfs dfs -head corpus/raw/uz_02.txt
hdfs dfs -tail corpus/raw/uz_03.txt
hdfs dfs -cat tables/students.csv | head -3
hdfs dfs -cat corpus/raw/uz_01.txt | wc -w
hdfs dfs -cat corpus/raw/uz_01.txt | grep IT`,
    },
    {
      id: "t5",
      env: "hdfs",
      title: "Копирование, перемещение и удаление",
      text: R`
Наведём порядок в корпусе.

1. **Скопируйте** в \`corpus/clean\` тексты \`uz_01.txt\`, \`uz_02.txt\` и \`uz_03.txt\` из \`corpus/raw\` одной командой \`-cp\` (источников может быть несколько, последний аргумент — каталог назначения).
2. Тексты \`uz_15.txt\` и \`uz_16.txt\` устарели: **переместите** их из \`raw\` в \`archive\` (\`-mv\`).
3. **Переименуйте** \`corpus/clean/uz_03.txt\` в \`corpus/clean/uz_03_clean.txt\` — переименование в HDFS тоже делается командой \`-mv\`.
4. Создайте временный каталог \`corpus/tmp\`, скопируйте туда любой файл, а затем удалите каталог целиком: \`hdfs dfs -rm -r corpus/tmp\`.
5. Проверьте итог: \`hdfs dfs -ls -R corpus\`.

> [!NOTE] Корзина
> В настоящем кластере при включённой корзине (\`fs.trash.interval > 0\`) удалённые файлы попадают в \`/user/student/.Trash\` и хранятся там заданное время. Ключ \`-skipTrash\` удаляет сразу и безвозвратно.
`,
      check: (t) => {
        const C = "/user/student/corpus";
        const clean = t.hdfs.list(C + "/clean");
        t.ok(clean.includes("uz_01.txt") && clean.includes("uz_02.txt"), "В corpus/clean скопированы uz_01.txt и uz_02.txt");
        t.ok(clean.includes("uz_03_clean.txt") && !clean.includes("uz_03.txt"), "В corpus/clean файл uz_03.txt переименован в uz_03_clean.txt");
        t.ok(t.hdfs.isFile(C + "/raw/uz_01.txt") && t.hdfs.isFile(C + "/raw/uz_03.txt"), "Исходные uz_01.txt и uz_03.txt остались в raw (копирование, а не перемещение)");
        const arch = t.hdfs.list(C + "/archive");
        t.ok(arch.includes("uz_15.txt") && arch.includes("uz_16.txt"), "uz_15.txt и uz_16.txt лежат в corpus/archive");
        t.ok(!t.hdfs.exists(C + "/raw/uz_15.txt") && !t.hdfs.exists(C + "/raw/uz_16.txt"), "В corpus/raw больше нет uz_15.txt и uz_16.txt (перемещены, а не скопированы)");
        t.ok(t.ran(/-mkdir\s.*corpus\/tmp/) && t.ran(/\s-rm\s.*-[rR]\b/) && !t.hdfs.exists(C + "/tmp"), "Каталог corpus/tmp создан и удалён командой -rm -r");
      },
      hint: "`hdfs dfs -cp corpus/raw/uz_01.txt corpus/raw/uz_02.txt corpus/raw/uz_03.txt corpus/clean/`; `hdfs dfs -mv corpus/raw/uz_15.txt corpus/raw/uz_16.txt corpus/archive/`; `hdfs dfs -mv corpus/clean/uz_03.txt corpus/clean/uz_03_clean.txt`.",
      solution: R`hdfs dfs -cp corpus/raw/uz_01.txt corpus/raw/uz_02.txt corpus/raw/uz_03.txt corpus/clean/
hdfs dfs -mv corpus/raw/uz_15.txt corpus/raw/uz_16.txt corpus/archive/
hdfs dfs -mv corpus/clean/uz_03.txt corpus/clean/uz_03_clean.txt
hdfs dfs -mkdir -p corpus/tmp
hdfs dfs -cp corpus/raw/uz_04.txt corpus/tmp/
hdfs dfs -rm -r corpus/tmp
hdfs dfs -ls -R corpus`,
    },
    {
      id: "t6",
      env: "hdfs",
      title: "Скачивание и дозапись",
      text: R`
1. Создайте **локальный** каталог \`~/downloads\` (\`mkdir -p downloads\`) и скачайте в него из HDFS архивный файл \`corpus/archive/uz_16.txt\` командой \`-get\`. Проверьте: \`ls downloads\`.
2. HDFS не позволяет менять файл в середине, но позволяет **дописывать в конец**. Создайте в HDFS журнал обработки \`corpus/journal.txt\` из локального файла \`notes.txt\`:
   \`hdfs dfs -appendToFile notes.txt corpus/journal.txt\` — если файла ещё нет, он будет создан.
3. Подготовьте локально ещё одну строку: \`echo "uz_15 va uz_16 arxivlandi" > step.txt\` — и допишите её в журнал второй командой \`-appendToFile\`.
4. Проверьте журнал: \`hdfs dfs -cat corpus/journal.txt\`.
`,
      check: (t) => {
        const got = t.local.read("/home/student/downloads/uz_16.txt");
        const orig = t.hdfs.read("/user/student/corpus/archive/uz_16.txt");
        t.ok(got != null && got.length > 0, "Файл uz_16.txt скачан в локальный каталог ~/downloads");
        t.ok(got != null && orig != null && got === orig, "Скачанный файл совпадает с corpus/archive/uz_16.txt в HDFS");
        const j = t.hdfs.read("/user/student/corpus/journal.txt") || "";
        t.ok(j.includes("Salom, HDFS!"), "corpus/journal.txt содержит текст из notes.txt");
        t.ok(j.length > "Salom, HDFS!\nBu fayl lokal diskda joylashgan.\n".length, "В журнал дописана ещё как минимум одна строка (второй -appendToFile)");
      },
      hint: "`mkdir -p downloads`, `hdfs dfs -get corpus/archive/uz_16.txt downloads/`, затем `hdfs dfs -appendToFile notes.txt corpus/journal.txt` и `hdfs dfs -appendToFile step.txt corpus/journal.txt`.",
      solution: R`mkdir -p downloads
hdfs dfs -get corpus/archive/uz_16.txt downloads/
ls downloads
hdfs dfs -appendToFile notes.txt corpus/journal.txt
echo "uz_15 va uz_16 arxivlandi" > step.txt
hdfs dfs -appendToFile step.txt corpus/journal.txt
hdfs dfs -cat corpus/journal.txt`,
    },
    {
      id: "t7",
      env: "hdfs",
      title: "Проверки и поиск файлов",
      text: R`
1. Команда \`-test\` ничего не выводит, а сообщает результат **кодом возврата** (0 — да, 1 — нет). Проверьте:
   - существует ли \`corpus/raw/uz_05.txt\`: \`hdfs dfs -test -e corpus/raw/uz_05.txt && echo "bor"\`;
   - является ли \`corpus/archive\` каталогом: \`hdfs dfs -test -d corpus/archive && echo "katalog"\`;
   - остался ли в \`raw\` файл \`uz_16.txt\`: выполните \`hdfs dfs -test -e corpus/raw/uz_16.txt\`, а затем \`echo $?\` — какой код вы получили и почему?
2. Найдите все текстовые файлы корпуса: \`hdfs dfs -find corpus -name "*.txt"\`. Шаблон возьмите в кавычки, чтобы его не раскрыла локальная оболочка.
3. Сохраните найденный список в **локальный** файл \`~/corpus_files.txt\` (перенаправление \`>\`) и посчитайте в нём строки: \`wc -l corpus_files.txt\`.
`,
      check: (t) => {
        t.ok(t.ran(/\s-test\s+-e\s/), "Выполнена проверка существования: hdfs dfs -test -e");
        t.ok(t.ran(/\s-test\s+-d\s/), "Выполнена проверка каталога: hdfs dfs -test -d");
        t.ok(t.ran(/\s-find\s.*-i?name\s/), "Выполнен поиск: hdfs dfs -find ... -name");
        const lines = (t.local.read("/home/student/corpus_files.txt") || "").split("\n").filter((l) => /^\/user\/student\/corpus\/.*\.txt$/.test(l.trim()));
        t.ok(lines.length >= 16, "В ~/corpus_files.txt сохранён список .txt-файлов корпуса (найдено путей: " + lines.length + ")");
      },
      hint: "`hdfs dfs -find corpus -name \"*.txt\" > corpus_files.txt`, затем `wc -l corpus_files.txt`.",
      solution: R`hdfs dfs -test -e corpus/raw/uz_05.txt && echo "bor"
hdfs dfs -test -d corpus/archive && echo "katalog"
hdfs dfs -test -e corpus/raw/uz_16.txt
echo $?
hdfs dfs -find corpus -name "*.txt"
hdfs dfs -find corpus -name "*.txt" > corpus_files.txt
wc -l corpus_files.txt`,
    },
  ],
  quiz: [
    { q: "Что делает команда `hdfs dfs -put report.csv /data/`?", options: ["Скачивает report.csv из HDFS на локальный диск", "Копирует локальный файл report.csv в каталог /data в HDFS", "Перемещает файл внутри HDFS", "Выводит содержимое файла"], answer: 1, explain: "`-put` (синоним `-copyFromLocal`) копирует локальные файлы в HDFS; обратная операция — `-get`." },
    { q: "Чем `hdfs dfs -mkdir -p a/b/c` отличается от `hdfs dfs -mkdir a/b/c`?", options: ["Ничем", "С `-p` создаются отсутствующие родительские каталоги и нет ошибки, если каталог уже есть", "С `-p` каталог создаётся с правами 777", "`-p` означает private — каталог видит только владелец"], answer: 1 },
    { q: "Как удалить из HDFS непустой каталог `corpus/tmp`?", options: ["`hdfs dfs -rmdir corpus/tmp`", "`hdfs dfs -rm corpus/tmp`", "`hdfs dfs -rm -r corpus/tmp`", "`rm -r corpus/tmp`"], answer: 2, explain: "`-rmdir` удаляет только пустые каталоги, `-rm` без `-r` не удаляет каталоги, а `rm -r` — локальная команда Linux." },
    { q: "Что выведет `echo $?` сразу после `hdfs dfs -test -e /net/takogo/fayla`?", options: ["0", "1", "false", "No such file or directory"], answer: 1, explain: "`-test` ничего не печатает и возвращает код: 0 — условие истинно, 1 — ложно." },
    { q: "Почему в `hdfs dfs -find corpus -name \"*.txt\"` шаблон берут в кавычки?", options: ["Так требует синтаксис Java", "Без кавычек bash раскроет `*.txt` по локальным файлам, и в HDFS уйдёт не шаблон, а их имена", "Кавычки ускоряют поиск", "Без кавычек поиск будет нечувствителен к регистру"], answer: 1 },
    { q: "Можно ли в HDFS исправить строку в середине уже записанного файла?", options: ["Да, командой -edit", "Да, командой -put без ключей", "Нет: файлы неизменяемы, разрешена только дозапись в конец (-appendToFile) или перезапись целиком (-put -f)", "Да, если у файла репликация 1"], answer: 2, explain: "Модель HDFS — write once, read many. Это упрощает согласованность реплик на разных DataNode." },
  ],
  realEnv: R`
## Работа с настоящим HDFS

Поднимите кластер по инструкции из **Лабораторной работы 3** (Docker \`apache/hadoop:3\` или однонодовая установка) и выполните команды этого занятия.

\`\`\`bash
# Docker: скопировать корпус в контейнер и войти в него
docker compose cp ./data/corpus_uz namenode:/tmp/corpus
docker compose exec namenode bash

# внутри контейнера
hdfs dfs -mkdir -p /user/$(whoami)/corpus/raw
cd /tmp/corpus
hdfs dfs -put uz_*.txt corpus/raw/
hdfs dfs -ls -h corpus/raw
\`\`\`

## Браузер файловой системы

В веб-интерфейсе NameNode **http://localhost:9870** откройте *Utilities → Browse the file system*: здесь можно перемещаться по каталогам, смотреть размер, репликацию и блоки файлов, а также загружать и скачивать файлы мышкой.

## Доступ к HDFS из Python

Через REST-интерфейс **WebHDFS** (тот же порт 9870):

\`\`\`bash
curl -s "http://localhost:9870/webhdfs/v1/user/root/corpus/raw?op=LISTSTATUS"
\`\`\`

\`\`\`python
# pip install hdfs
from hdfs import InsecureClient

client = InsecureClient("http://localhost:9870", user="root")
print(client.list("/user/root/corpus/raw"))
with client.read("/user/root/corpus/raw/uz_01.txt", encoding="utf-8") as f:
    print(f.read()[:200])
\`\`\`

> [!TIP] Windows
> Команды \`hdfs dfs\` выполняются внутри контейнера или WSL. Из Windows с кластером удобно работать через WebHDFS или веб-интерфейс.
`,
  homework: R`
## Самостоятельная работа: «Изучение компонентов экосистемы Hadoop»

1. Заполните таблицу для компонентов **HDFS, YARN, MapReduce, Hive, HBase, Sqoop, Flume, Kafka, ZooKeeper, Oozie, Spark**: назначение, тип (хранение / обработка / загрузка / координация), пример задачи из компьютерной лингвистики (например, Hive — SQL-запросы к частотным словарям корпуса).
2. Нарисуйте схему конвейера: сбор новостей (Flume или Kafka) → HDFS (\`raw\`) → очистка (Spark) → \`clean\` → аналитика (Hive) → отчёт.
3. Напишите последовательность команд \`hdfs dfs\`, которая раскладывает корпус по зонам \`raw/clean/archive\` с подкаталогами по месяцам (\`raw/2026-11\`, \`raw/2026-12\`) и выдаёт итоговый отчёт \`-count -v -h\`. Проверьте её в тренажёре.
`,
});
