(function () {
  // Список баз из команды show dbs (в результатах — массив имён, всегда есть admin)
  const isDbList = (r) => Array.isArray(r) && r.includes("admin") && r.every((x) => typeof x === "string");
  const isPlainObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

  BDT.register({
    id: "l01",
    kind: "lab",
    num: 1,
    title: "Установка среды MongoDB и создание документоориентированных баз данных",
    hours: 2,
    env: ["mongo"],
    goals: [
      "Понять, чем документная модель MongoDB отличается от реляционной: базы, коллекции, документы, BSON",
      "Научиться работать в оболочке `mongosh`: `use`, `show dbs`, `createCollection`, `insertOne`, `insertMany`, `find`",
      "Разобраться с полем `_id`, типом `ObjectId` и ошибкой дублирования ключа E11000",
      "Спроектировать документ для лингвистического ресурса и импортировать набор данных через `mongoimport`",
    ],
    theory: R`
## Документоориентированные базы данных

Реляционные СУБД (PostgreSQL, MySQL) хранят данные в **таблицах** с заранее заданной схемой: у каждой строки одинаковый набор столбцов. Для Big Data и быстро меняющихся данных это неудобно: тексты, словари, профили пользователей и логи имеют разную структуру, вложенные списки и необязательные поля. Так появились **NoSQL**-системы:

| Тип NoSQL | Примеры | Единица хранения |
|---|---|---|
| Ключ–значение | Redis, Riak | пара «ключ → значение» |
| **Документный** | **MongoDB**, CouchDB | документ JSON/BSON |
| Колоночный | Cassandra, HBase | семейство столбцов |
| Графовый | Neo4j | вершины и рёбра |

**MongoDB** — самая популярная документоориентированная СУБД. Данные хранятся как **документы** — JSON-подобные объекты, внутри которых могут быть вложенные объекты и массивы. MongoDB масштабируется горизонтально (шардинг) и реплицируется (replica set), поэтому её используют в системах с большими объёмами данных.

### Термины: SQL и MongoDB

| Реляционная БД | MongoDB |
|---|---|
| база данных | база данных (database) |
| таблица | **коллекция** (collection) |
| строка | **документ** (document) |
| столбец | **поле** (field) |
| первичный ключ | поле \`_id\` (есть в каждом документе) |
| \`CREATE TABLE\` со схемой | гибкая схема: документы одной коллекции могут различаться |
| \`JOIN\` нескольких таблиц | вложенные документы или этап \`$lookup\` |

### Одна сущность — один документ

В реляционной модели словарная статья «kitob» заняла бы три таблицы (слова, переводы, примеры) и потребовала бы \`JOIN\`. В MongoDB это **один документ**:

\`\`\`javascript Документ коллекции dictionary
{
  _id: ObjectId("6740a1f2c3d4e5f6a7b8c9d0"),
  word: "kitob",
  pos: "ot",
  translations: [
    { lang: "ru", text: "книга" },
    { lang: "en", text: "book" }
  ],
  examples: ["Bu kitob juda qiziqarli."],
  meta: { source: "Oʻzbek tilining izohli lugʻati", added: ISODate("2026-11-21") }
}
\`\`\`

> [!TIP] Правило моделирования
> «Что читается вместе — хранится вместе». Вкладывайте в документ данные, которые принадлежат сущности и нужны вместе с ней (переводы слова, контакты студента). Выносите в отдельную коллекцию то, что растёт без ограничений или используется многими документами (комментарии к популярной статье, справочник авторов).

### JSON и BSON

На диске и по сети MongoDB передаёт документы в формате **BSON** (Binary JSON). Он быстрее разбирается и поддерживает больше типов, чем JSON:

| Тип BSON | Пример в mongosh |
|---|---|
| String | \`"Toshkent"\` |
| Int32 / Int64 / Double | \`21\`, \`NumberLong(9000000000)\`, \`4.27\` |
| Boolean | \`true\` |
| Date | \`ISODate("2026-11-21T10:00:00Z")\` |
| ObjectId | \`ObjectId("6740a1f2c3d4e5f6a7b8c9d0")\` |
| Array | \`["NLP", "Python"]\` |
| Object (вложенный документ) | \`{ email: "...", phone: "..." }\` |
| Null | \`null\` |

Максимальный размер одного документа — **16 МБ**.

### Поле _id и ObjectId

У каждого документа есть поле \`_id\` — уникальный ключ внутри коллекции. Если его не указать, драйвер создаст **ObjectId** — 12 байт: 4 байта времени создания, 5 случайных байт и 3 байта счётчика. Поэтому ObjectId уникален без центрального счётчика и хранит время создания документа. Можно задать свой \`_id\` (строку, число), но повторить его нельзя — сервер вернёт ошибку **E11000 duplicate key error**.

\`\`\`javascript
const id = ObjectId()
id.getTimestamp()
db.langs.insertOne({ _id: "uz", name: "oʻzbek tili" })
// повтор того же _id: MongoServerError: E11000 duplicate key error
db.langs.insertOne({ _id: "uz", name: "uzbek" })
\`\`\`

### Первые команды mongosh

\`\`\`javascript
// список баз данных
show dbs
// переключиться на базу lingvo
use lingvo
// явно создать коллекцию
db.createCollection("texts")
show collections
db.texts.insertOne({ title: "Navroʻz bayrami", lang: "uz", tags: ["bayram"] })
db.texts.insertMany([{ title: "Orol dengizi", lang: "uz" }, { title: "Метро", lang: "ru" }])
db.texts.find()                    // все документы
db.texts.findOne({ lang: "uz" })   // первый подходящий
db.texts.countDocuments()          // сколько документов
db.texts.drop()                    // удалить коллекцию
db.dropDatabase()                  // удалить текущую базу
\`\`\`

> [!NOTE] Ленивое создание
> Команда \`use lingvo\` только переключает контекст — база ещё не существует. Она появится в \`show dbs\`, когда в ней будут данные: после первой вставки документа или \`db.createCollection(...)\`. Коллекция тоже создаётся автоматически при первой вставке.

### Импорт данных: mongoimport

\`mongoimport\` — утилита командной строки из пакета **MongoDB Database Tools**:

\`\`\`bash
mongoimport --db university --collection students --file data/mongo/students.json --jsonArray --drop
\`\`\`

| Флаг | Значение |
|---|---|
| \`--db\`, \`--collection\` | куда импортировать |
| \`--file\` | путь к файлу |
| \`--jsonArray\` | файл — один JSON-массив \`[ {...}, {...} ]\`; без флага ожидается по одному документу в строке (JSON Lines) |
| \`--drop\` | удалить коллекцию перед импортом (повторный импорт не создаст дубликаты) |

### Из чего состоит среда MongoDB

- **MongoDB Community Server** — сервер \`mongod\`, по умолчанию слушает порт **27017**;
- **mongosh** — интерактивная оболочка на JavaScript;
- **MongoDB Compass** — графический клиент (просмотр, фильтры, импорт, индексы);
- **Database Tools** — \`mongoimport\`, \`mongoexport\`, \`mongodump\`, \`mongorestore\`;
- **Docker**: \`docker run -d -p 27017:27017 --name mongo mongo:7\` — сервер за одну команду;
- **MongoDB Atlas** — облачный сервис с бесплатным кластером M0 (512 МБ).

Пошаговая установка — во вкладке «Реальная среда».

> [!NOTE] Как устроен этот тренажёр
> Задания выполняются в учебном эмуляторе \`mongosh\` прямо в браузере. Код — это скрипт: каждая строка выполняется как команда, значение каждой команды выводится, как в mongosh. Строку \`mongoimport ...\` здесь можно писать прямо в скрипте (в реальной среде она запускается в обычном терминале). Базы сохраняются между заданиями, панель справа показывает их содержимое.
`,
    tasks: [
      {
        id: "t1",
        env: "mongo",
        title: "Первая база данных",
        text: R`
В MongoDB база данных создаётся «лениво». Проверьте это сами:

1. Переключитесь на базу \`lingvo\`: \`use lingvo\`.
2. Удалите её: \`db.dropDatabase()\` — так опыт будет начинаться с чистого листа при каждом запуске.
3. Выполните \`show dbs\` — базы \`lingvo\` в списке ещё нет.
4. Вставьте в коллекцию \`notes\` один документ, например \`{ text: "Salom, MongoDB!" }\`.
5. Снова выполните \`show dbs\` и \`show collections\` — база и коллекция появились.

> [!WARNING] Комментарии
> Команды \`use\` и \`show\` пишите на отдельной строке без комментариев в конце; комментарий \`// ...\` ставьте строкой выше.
`,
        starter: R`use lingvo
db.dropDatabase()
show dbs

// вставьте документ в коллекцию notes


show dbs
show collections
`,
        check: (t) => {
          const lists = t.results.filter(isDbList);
          const i = lists.findIndex((l) => !l.includes("lingvo"));
          const j = lists.findIndex((l, k) => k > i && l.includes("lingvo"));
          t.ok(t.current === "lingvo", "Текущая база — lingvo (use lingvo)");
          t.ok(i >= 0, "Выполнен show dbs, пока база lingvo пуста (её нет в списке)");
          t.ok(i >= 0 && j > i, "После вставки документа show dbs показывает базу lingvo");
          t.ok(t.db("lingvo").count("notes") >= 1, "В коллекции lingvo.notes есть хотя бы один документ");
        },
        hint: "Вставка одного документа: `db.notes.insertOne({ text: \"Salom, MongoDB!\" })`. Коллекция `notes` создастся автоматически.",
        solution: R`use lingvo
db.dropDatabase()
show dbs

// вставьте документ в коллекцию notes
db.notes.insertOne({ text: "Salom, MongoDB!", created: new Date() })

show dbs
show collections
`,
      },
      {
        id: "t2",
        env: "mongo",
        title: "Коллекция и документ с вложенными полями",
        text: R`
Создадим корпус текстов. Каждый текст — документ коллекции \`texts\` в базе \`lingvo\`.

1. Удалите коллекцию (\`db.texts.drop()\`) — для повторных запусков — и создайте её явно: \`db.createCollection("texts")\`.
2. Проверьте список коллекций: \`show collections\`.
3. Вставьте документ (\`insertOne\`) с полями:
   - \`title\` — заголовок, \`lang: "uz"\`;
   - \`meta\` — **вложенный объект** с полями \`source\` (источник) и \`year\` (год);
   - \`tags\` — **массив** не меньше чем из двух тегов.
4. Посмотрите результат: \`db.texts.findOne()\`.
`,
        starter: R`use lingvo
db.texts.drop()
db.createCollection("texts")
show collections

db.texts.insertOne({
  title: "Navroʻz bayrami",
  lang: "uz"
  // добавьте вложенный объект meta: { source: ..., year: ... }
  // и массив tags: [ ... ]
})

db.texts.findOne()
`,
        check: (t) => {
          const docs = t.db("lingvo").docs("texts");
          t.ok(t.uses("createCollection"), "Коллекция создана командой db.createCollection(\"texts\")");
          t.ok(t.db("lingvo").exists("texts"), "Коллекция lingvo.texts существует");
          t.ok(docs.some((x) => typeof x.title === "string" && x.lang === "uz"), "Есть документ с полями title и lang: \"uz\"");
          const d = docs.find((x) => isPlainObj(x.meta));
          t.ok(!!d, "У документа есть вложенный объект meta");
          t.ok(!!d && d.meta.source !== undefined && d.meta.year !== undefined, "В meta есть поля source и year");
          t.ok(docs.some((x) => Array.isArray(x.tags) && x.tags.length >= 2), "У документа есть массив tags (не меньше двух тегов)");
        },
        hint: "Вложенный объект пишется в фигурных скобках, массив — в квадратных: `meta: { source: \"kun.uz\", year: 2026 }, tags: [\"bayram\", \"madaniyat\"]`. Не забудьте запятую после `lang: \"uz\"`.",
        solution: R`use lingvo
db.texts.drop()
db.createCollection("texts")
show collections

db.texts.insertOne({
  title: "Navroʻz bayrami",
  lang: "uz",
  meta: { source: "kun.uz", year: 2026, words: 106 },
  tags: ["bayram", "madaniyat", "anʼana"]
})

db.texts.findOne()
`,
      },
      {
        id: "t3",
        env: "mongo",
        title: "insertMany и просмотр данных",
        text: R`
Добавьте в \`texts\` **одним вызовом** \`insertMany\` ещё три текста — на узбекском (\`lang: "uz"\`), русском (\`"ru"\`) и английском (\`"en"\`). Структура — как в прошлом задании: \`title\`, \`lang\`, \`meta\`, \`tags\`.

Затем:

- выведите все документы: \`db.texts.find()\`;
- посчитайте все документы: \`db.texts.countDocuments()\`;
- **последней командой** посчитайте тексты на узбекском: \`db.texts.countDocuments({ lang: "uz" })\`.

> [!NOTE] Повторный запуск
> Если запустить код ещё раз, документы добавятся снова. Для MongoDB это не ошибка: каждый новый документ получает новый уникальный \`_id\`.
`,
        starter: R`use lingvo
db.texts.insertMany([
  { title: "Samarqand - Sharqning durdonasi", lang: "uz", meta: { source: "uza.uz", year: 2026 }, tags: ["turizm", "tarix"] }
  // добавьте через запятую тексты на русском (lang: "ru") и английском (lang: "en")
])

// выведите все документы

// посчитайте все документы, а последней командой — тексты на узбекском

`,
        check: (t) => {
          const n = t.db("lingvo").count("texts");
          const langs = new Set(t.db("lingvo").docs("texts").map((d) => d.lang));
          t.ok(t.uses("insertMany"), "Использован insertMany");
          t.ok(n >= 4, "В коллекции texts не меньше 4 документов");
          t.ok(["uz", "ru", "en"].every((l) => langs.has(l)), "Есть тексты на языках uz, ru и en");
          t.ok(t.results.some((r) => Array.isArray(r) && r.length === n), "Выведены все документы коллекции (find())");
          t.ok(t.results.includes(n), "Выведено общее число документов (countDocuments())");
          t.ok(t.last === t.db("lingvo").count("texts", { lang: "uz" }), "Последняя команда выводит число текстов на узбекском (countDocuments({ lang: \"uz\" }))");
        },
        hint: "`insertMany` принимает **массив** документов: `db.texts.insertMany([ {...}, {...}, {...} ])`. Документы разделяются запятыми.",
        solution: R`use lingvo
db.texts.insertMany([
  { title: "Samarqand - Sharqning durdonasi", lang: "uz", meta: { source: "uza.uz", year: 2026 }, tags: ["turizm", "tarix"] },
  { title: "Метро Ташкента", lang: "ru", meta: { source: "gazeta.uz", year: 2025 }, tags: ["транспорт", "Ташкент"] },
  { title: "The Aral Sea crisis", lang: "en", meta: { source: "unesco.org", year: 2024 }, tags: ["ecology", "water"] }
])

db.texts.find()

db.texts.countDocuments()
db.texts.countDocuments({ lang: "uz" })
`,
      },
      {
        id: "t4",
        env: "mongo",
        title: "_id, ObjectId и ошибка E11000",
        text: R`
1. Создайте новый ObjectId и узнайте время его создания:
   \`const id = ObjectId()\`, затем отдельными строками \`id\` и \`id.getTimestamp()\`.
2. Создайте справочник языков \`langs\`, где \`_id\` — код языка. Сначала удалите коллекцию (\`db.langs.drop()\`), затем вставьте \`uz\` через \`insertOne\`, а \`ru\` и \`en\` — одним \`insertMany\` (поля \`name\` и \`family\`).
3. Выведите справочник: \`db.langs.find()\`.
4. **Последней командой** попробуйте вставить ещё один документ с \`_id: "uz"\` и прочитайте ошибку.

> [!NOTE] Ошибка останавливает скрипт
> После ошибки следующие команды не выполняются, поэтому вставка дубликата должна быть последней.
`,
        starter: R`use lingvo
const id = ObjectId()
id
id.getTimestamp()

db.langs.drop()
db.langs.insertOne({ _id: "uz", name: "oʻzbek tili", family: "turkiy" })
// добавьте языки ru и en одним insertMany


db.langs.find()

// вставьте документ с уже существующим _id: "uz"

`,
        check: (t) => {
          const docs = t.db("lingvo").docs("langs");
          const ids = docs.map((d) => String(d._id)).sort();
          t.ok(t.results.some((r) => r instanceof Date), "Показано время создания ObjectId (getTimestamp())");
          t.ok(ids.length === 3 && ids.join(",") === "en,ru,uz", "В коллекции langs ровно 3 документа с _id: uz, ru, en");
          t.ok(t.uses("insertMany"), "Языки ru и en добавлены через insertMany");
          t.ok(/E11000/.test(t.error || "") || /E11000/.test(t.output), "Получена ошибка E11000 duplicate key error");
        },
        hint: "`db.langs.insertMany([{ _id: \"ru\", name: \"rus tili\", family: \"slavyan\" }, { _id: \"en\", ... }])`. Дубликат: `db.langs.insertOne({ _id: \"uz\", name: \"uzbek\" })`.",
        solution: R`use lingvo
const id = ObjectId()
id
id.getTimestamp()

db.langs.drop()
db.langs.insertOne({ _id: "uz", name: "oʻzbek tili", family: "turkiy" })
db.langs.insertMany([
  { _id: "ru", name: "rus tili", family: "slavyan" },
  { _id: "en", name: "ingliz tili", family: "german" }
])

db.langs.find()

db.langs.insertOne({ _id: "uz", name: "uzbek" })
`,
      },
      {
        id: "t5",
        env: "choice",
        title: "Документ или таблицы?",
        text: R`
Для электронного словаря нужно хранить слово, часть речи, **от 1 до 10 переводов** и несколько **примеров употребления**. Статью почти всегда открывают целиком: слово вместе со всеми переводами и примерами.

Какая модель данных лучше всего подходит для MongoDB?
`,
        options: [
          "Три коллекции `words`, `translations`, `examples` со ссылками по `word_id` — как три таблицы в SQL",
          "Один документ на слово: `translations` и `examples` — массивы внутри документа",
          "Один документ с полями `translation1`, `translation2`, …, `translation10`",
          "Вся статья одной строкой в поле `data`, а разбор — в коде приложения",
        ],
        answer: 1,
        explain: R`
Переводы и примеры **принадлежат** слову, их немного и читают их вместе со словом — значит, их нужно **вкладывать** в документ массивами. Одно чтение возвращает всю статью без \`JOIN\`/\`$lookup\`, а по элементам массивов можно искать: \`find({ "translations.text": "book" })\`.

Отдельные коллекции (вариант 1) — это перенос реляционной модели: каждое открытие статьи требует соединения. Поля \`translation1…10\` (вариант 3) — антипаттерн «повторяющихся столбцов». Строка в поле \`data\` (вариант 4) лишает базу возможности искать и индексировать данные.
`,
      },
      {
        id: "t6",
        env: "mongo",
        title: "Проектирование документа: словарная статья",
        text: R`
Спроектируйте коллекцию \`dictionary\` (база \`lingvo\`) для узбекско-русско-английского словаря. Каждая статья — один документ:

| Поле | Тип | Пример |
|---|---|---|
| \`word\` | строка | \`"kitob"\` |
| \`pos\` | строка — часть речи | \`"ot"\` (сущ.), \`"feʼl"\` (глагол), \`"sifat"\` (прил.) |
| \`translations\` | массив объектов \`{ lang, text }\`, не меньше двух | \`[{ lang: "ru", text: "книга" }, { lang: "en", text: "book" }]\` |
| \`examples\` | массив строк, не меньше одной | \`["Bu kitob juda qiziqarli."]\` |

1. Удалите коллекцию (\`db.dictionary.drop()\`) и вставьте **не меньше 3 статей** хотя бы **двух разных частей речи**. Можно добавлять и свои поля (\`synonyms\`, \`frequency\`, \`audio\`…) — схема гибкая.
2. **Последней командой** найдите статью по переводу. Точечная нотация работает и внутри массивов объектов: \`db.dictionary.find({ "translations.text": "book" })\`.
`,
        starter: R`use lingvo
db.dictionary.drop()
db.dictionary.insertMany([
  {
    word: "kitob",
    pos: "ot",
    translations: [
      { lang: "ru", text: "книга" },
      { lang: "en", text: "book" }
    ],
    examples: ["Bu kitob juda qiziqarli."]
  }
  // добавьте ещё минимум две статьи, например глагол «oʻqimoq» и прилагательное «chiroyli»
])

// найдите статью по английскому переводу

`,
        check: (t) => {
          const docs = t.db("lingvo").docs("dictionary");
          const valid = (d) => typeof d.word === "string" && typeof d.pos === "string" &&
            Array.isArray(d.translations) && d.translations.length >= 2 &&
            d.translations.every((tr) => isPlainObj(tr) && typeof tr.lang === "string" && typeof tr.text === "string") &&
            Array.isArray(d.examples) && d.examples.length >= 1 && d.examples.every((e) => typeof e === "string");
          const bad = docs.filter((d) => !valid(d));
          t.ok(docs.length >= 3, "В коллекции dictionary не меньше 3 статей");
          t.ok(docs.length > 0 && !bad.length, bad.length
            ? "Статья «" + bad[0].word + "» не соответствует схеме: нужны word, pos, translations (≥ 2 объектов { lang, text }), examples (≥ 1 строки)"
            : "Все статьи соответствуют схеме: word, pos, translations, examples");
          t.ok(new Set(docs.map((d) => d.pos)).size >= 2, "Есть статьи хотя бы двух разных частей речи (pos)");
          t.ok(t.uses("translations.") || t.uses("$elemMatch"), "Запрос ищет по полю внутри массива translations (\"translations.text\")");
          t.ok(Array.isArray(t.last) && t.last.length >= 1 && t.last.every((d) => Array.isArray(d.translations)), "Последний запрос find нашёл хотя бы одну статью словаря");
        },
        hint: "Каждая статья — объект в массиве `insertMany([ {...}, {...}, {...} ])`. Поиск по переводу: `db.dictionary.find({ \"translations.text\": \"book\" })` — имя поля с точкой обязательно в кавычках.",
        solution: R`use lingvo
db.dictionary.drop()
db.dictionary.insertMany([
  {
    word: "kitob",
    pos: "ot",
    translations: [
      { lang: "ru", text: "книга" },
      { lang: "en", text: "book" }
    ],
    examples: ["Bu kitob juda qiziqarli."]
  },
  {
    word: "oʻqimoq",
    pos: "feʼl",
    translations: [
      { lang: "ru", text: "читать" },
      { lang: "en", text: "to read" }
    ],
    examples: ["Men har kuni kitob oʻqiyman.", "U gazeta oʻqidi."],
    forms: ["oʻqiyman", "oʻqiding", "oʻqidi"]
  },
  {
    word: "chiroyli",
    pos: "sifat",
    translations: [
      { lang: "ru", text: "красивый" },
      { lang: "en", text: "beautiful" }
    ],
    examples: ["Samarqand - chiroyli shahar."],
    synonyms: ["goʻzal"]
  }
])

db.dictionary.find({ "translations.text": "book" })
`,
      },
      {
        id: "t7",
        env: "mongo",
        title: "Импорт набора данных: mongoimport",
        text: R`
Импортируйте файл \`data/mongo/students.json\` (40 студентов) в базу \`university\`, коллекцию \`students\`.

- Файл — это один JSON-массив, поэтому нужен флаг \`--jsonArray\`. Запустите стартовый код без него и прочитайте ошибку.
- Добавьте \`--drop\`, чтобы повторный импорт не создавал дубликаты.

Затем переключитесь на \`university\` и выведите:

- список коллекций (\`show collections\`);
- число документов (\`countDocuments()\`);
- студента \`S0004\` (\`findOne({ student_id: "S0004" })\`) — обратите внимание на вложенный объект \`contacts\` и массив \`skills\`.
`,
        starter: R`mongoimport --db university --collection students --file data/mongo/students.json

use university
// список коллекций, число документов и студент S0004

`,
        check: (t) => {
          const n = t.db("university").count("students");
          t.ok(t.uses("mongoimport") && t.uses("--jsonArray"), "Выполнен mongoimport с флагом --jsonArray");
          t.ok(n === 40, n > 40 ? "В university.students " + n + " документов вместо 40 — добавьте флаг --drop" : "В university.students 40 документов");
          t.ok(t.current === "university", "Текущая база — university");
          t.ok(t.results.includes(40), "Выведено число документов (countDocuments())");
          t.ok(t.results.some((r) => r && r.student_id === "S0004"), "Выведен студент S0004 (findOne)");
        },
        hint: "Полная команда: `mongoimport --db university --collection students --file data/mongo/students.json --jsonArray --drop`.",
        solution: R`mongoimport --db university --collection students --file data/mongo/students.json --jsonArray --drop

use university
show collections
db.students.countDocuments()
db.students.findOne({ student_id: "S0004" })
`,
      },
    ],
    quiz: [
      { q: "Что в MongoDB соответствует **строке** таблицы реляционной БД?", options: ["Коллекция", "Документ", "Поле", "Индекс"], answer: 1, explain: "Таблица ↔ коллекция, строка ↔ документ, столбец ↔ поле." },
      { q: "Когда база `lingvo` появится в выводе `show dbs`?", options: ["Сразу после `use lingvo`", "Когда в ней появятся данные: вставлен документ или создана коллекция", "Только после перезапуска сервера", "После команды `db.createDatabase(\"lingvo\")`"], answer: 1, explain: "`use` лишь переключает контекст. База создаётся лениво — при первой записи. Команды `createDatabase` в mongosh нет." },
      { q: "Что произойдёт при вставке документа **без** поля `_id`?", options: ["Ошибка: `_id` обязателен", "Будет автоматически добавлен `_id` типа ObjectId", "Документ сохранится без `_id`", "`_id` станет порядковым номером 1, 2, 3…"], answer: 1, explain: "Драйвер (или сервер) генерирует ObjectId: 4 байта времени, 5 случайных байт и 3 байта счётчика." },
      { q: "В каком формате MongoDB хранит документы?", options: ["CSV", "XML", "BSON", "YAML"], answer: 2, explain: "BSON — двоичный JSON с дополнительными типами (Date, ObjectId, Int64, Decimal128 и др.)." },
      { q: "Файл содержит JSON-массив `[ {...}, {...} ]`. Какой флаг нужен `mongoimport`?", options: ["`--array`", "`--jsonArray`", "`--type=json`", "`--multi`"], answer: 1, explain: "Без `--jsonArray` mongoimport ожидает по одному JSON-документу в строке (JSON Lines)." },
      { q: "Что вернёт сервер при вставке второго документа с тем же `_id`?", options: ["Ошибку E11000 duplicate key error", "Старый документ будет перезаписан", "Появятся два документа с одинаковым `_id`", "Документу будет присвоен новый `_id`"], answer: 0, explain: "Индекс по `_id` всегда уникальный; для замены документа есть `replaceOne`/`updateOne`." },
    ],
    realEnv: R`
## Вариант 1. Установка на Windows

1. Скачайте **MongoDB Community Server** (MSI) с [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community). При установке выберите **Complete**, оставьте галочку **Install MongoD as a Service** (сервер будет запускаться автоматически) и, по желанию, **Install MongoDB Compass**.
2. Скачайте **mongosh** с [mongodb.com/try/download/shell](https://www.mongodb.com/try/download/shell) и **MongoDB Database Tools** (там \`mongoimport\`) с [mongodb.com/try/download/database-tools](https://www.mongodb.com/try/download/database-tools). Распакуйте их и добавьте папки \`bin\` в переменную среды **PATH**.
3. Проверьте в командной строке (cmd/PowerShell):

\`\`\`bash
mongosh --version
mongoimport --version
mongosh "mongodb://localhost:27017"
\`\`\`

4. Импорт учебных данных (из папки распакованного репозитория тренажёра):

\`\`\`bash
mongoimport --db university --collection students --file data/mongo/students.json --jsonArray --drop
\`\`\`

## Вариант 2. Docker

\`\`\`bash
docker run -d -p 27017:27017 --name mongo mongo:7
docker exec -it mongo mongosh
docker cp data/mongo/students.json mongo:/tmp/students.json
docker exec mongo mongoimport --db university --collection students --file /tmp/students.json --jsonArray --drop
\`\`\`

Контейнер останавливается командой \`docker stop mongo\` и снова запускается \`docker start mongo\`. Чтобы данные переживали удаление контейнера, добавьте том: \`-v mongo-data:/data/db\`.

## Вариант 3. MongoDB Atlas (облако, бесплатно)

1. Зарегистрируйтесь на [mongodb.com/atlas](https://www.mongodb.com/atlas) и создайте кластер **M0 Free**.
2. В разделе **Database Access** создайте пользователя, в **Network Access** разрешите свой IP-адрес.
3. Кнопка **Connect** покажет строку подключения вида \`mongodb+srv://user:ПАРОЛЬ@cluster0.xxxxx.mongodb.net/\` — её используют mongosh, Compass и Python.

## MongoDB Compass

Compass — графический клиент: **New connection** → \`mongodb://localhost:27017\` → **Connect**. Слева — базы и коллекции, вкладка **Documents** показывает документы, кнопка **Add data → Import JSON or CSV file** заменяет \`mongoimport\`. Внизу окна Compass есть встроенный mongosh.

## Python: pymongo

\`\`\`bash
pip install pymongo
\`\`\`

\`\`\`python
from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")
db = client["lingvo"]

db.texts.insert_one({"title": "Navroʻz bayrami", "lang": "uz", "tags": ["bayram", "madaniyat"]})
db.texts.insert_many([
    {"title": "Orol dengizi", "lang": "uz", "meta": {"year": 2026}},
    {"title": "Метро Ташкента", "lang": "ru"},
])

print(client.list_database_names())
print(db.list_collection_names())
print(db.texts.count_documents({}))
for doc in db.texts.find({"lang": "uz"}):
    print(doc["_id"], doc["title"])
\`\`\`

> [!TIP] Отличия синтаксиса
> В Python имена полей и операторов — строки в кавычках (\`{"lang": "uz"}\`), методы пишутся через подчёркивание: \`insert_one\`, \`count_documents\`. Документы возвращаются как словари \`dict\`, \`_id\` — объект \`bson.ObjectId\`.
`,
    homework: R`
**Мини-проект по работе с MongoDB. Этап 1 — модель данных.**

Выберите лингвистический ресурс для мини-проекта: корпус новостей, частотный словарь, словарь терминов, база отзывов, коллекция пословиц и т. п.

1. Опишите сущности и решите, что вкладывать в документ, а что выносить в отдельные коллекции (правило «что читается вместе — хранится вместе»).
2. Создайте базу и 2–3 коллекции, вставьте 10–20 документов с вложенными объектами и массивами.
3. Подготовьте JSON-файл (массив) и импортируйте его через \`mongoimport --jsonArray\`.
4. Сдайте скрипт \`mongosh\` с командами создания и короткое описание схемы (поля, типы, пример документа).
`,
  });
})();
