# Формат занятий тренажёра

Каждое занятие — отдельный файл `content/<id>.js`, который вызывает `BDT.register({...})`.
`id`: `l01`…`l08` — лабораторные работы, `p01`…`p15` — практические занятия.
Файл подключается в `index.html` и `selftest.html` (уже подключены все 23 файла).

Полный рабочий пример: [`p01.js`](p01.js).

## Главное правило про строки

Все многострочные тексты и код оборачиваются тегом **`R`** — `` R`...` ``:

* код Python пишется как есть, без двойного экранирования: `"\n"`, `r"\w+"`, `"ʻ"`;
* обратный апостроф для Markdown внутри текста пишется как `` \` `` (тег превращает его в обычный);
* **нельзя** использовать `${` внутри `` R`...` `` (это подстановка JavaScript);
* в коде Python не используйте символ `` ` `` (обратный апостроф).

Короткие однострочные поля (`title`, `hint` без кода) можно писать обычными строками `"..."`.

## Структура занятия

```js
BDT.register({
  id: "p02",
  kind: "practice",            // "practice" | "lab"
  num: 2,
  title: "Название из учебной программы",
  hours: 2,
  env: ["python"],             // значки сред на карточке: python | mongo | hdfs | spark
  goals: ["цель 1", "цель 2"], // 2–4 пункта
  theory: R`Markdown: краткая теория с примерами кода`,
  tasks: [ /* 5–7 заданий, от простого к сложному */ ],
  quiz: [ { q: "Вопрос?", options: ["a", "b", "c", "d"], answer: 1, explain: "Пояснение" } ],
  realEnv: R`Markdown: как выполнить работу в реальной среде (Anaconda, Docker, Colab, кластер)`,
  homework: R`Markdown: самостоятельная работа (необязательно)`,
});
```

Markdown поддерживает: заголовки `##`, списки, таблицы, блоки кода ```` ```python ````, выноски
`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, ссылки, **жирный**, `код`.

## Типы заданий (`env`)

### Python (`env: "python"`, по умолчанию)

```js
{
  id: "t1",
  title: "Короткое название",
  text: R`Условие (Markdown). Чётко назовите переменные, которые должен создать студент.`,
  setup: R`import pandas as pd
df = pd.read_csv("data/students.csv")`,   // необязательно: выполняется ДО кода студента
  starter: R`# стартовый код с пропусками ...`,
  check: R`
df = var("df", pd.DataFrame)     # var(имя, тип=None) — взять переменную студента или упасть с понятным сообщением
ok(len(df) == 200, "df содержит 200 строк")   # ok(условие, "что должно быть верно")
ok("200" in out, "Число строк выведено на экран")  # out — весь вывод print()
ok(uses("groupby"), "Использован метод groupby")   # uses(...) — подстроки в коде студента
ok(len(figs) >= 1, "Построен график")              # figs — список фигур matplotlib
`,
  hint: "Подсказка (Markdown)",
  solution: R`эталонное решение`,
}
```

* Код студента выполняется как ячейка Jupyter в **новом** пространстве имён (переменные прошлых заданий недоступны) — всё нужное загружайте в `setup` или в стартовом коде.
* В пространстве имён студента есть переменные `SITE` (адрес учебного сайта `data/site/`), `API` (адрес учебного API `data/api/v1/`) и `BASE_URL`.
* Код проверки выполняется в отдельном пространстве: импортируйте `pandas` и др. сами; переменные студента — через `var()` или словарь `ns`.
* Сообщения `ok(...)` формулируйте как требование («В df 200 строк»), а не как ошибку.
* Стартовый код **не должен** проходить проверку (самопроверка это контролирует). Если по замыслу проходит — укажите `starterPasses: true`.
* Доступные библиотеки: pandas, numpy, matplotlib, seaborn, wordcloud, requests, bs4, lxml, sqlite3, scikit-learn, scipy, nltk (без загрузки корпусов `nltk.download`), openpyxl, а также учебный `pyspark`.

### MongoDB (`env: "mongo"`)

Студент пишет скрипт для `mongosh`. Состояние баз сохраняется между заданиями занятия.

```js
{
  id: "t2", env: "mongo", title: "...", text: R`...`,
  fixtures: [{ db: "university", coll: "students", file: "data/mongo/students.json" }], // загрузить, если коллекции нет или она пуста
  starter: R`use university
db.students.find(...)`,
  check: (t) => {
    t.ok(t.db("university").count("students") >= 3, "В коллекции students не меньше 3 документов");
    t.ok(t.uses("insertMany"), "Использован insertMany");
    t.ok(Array.isArray(t.last) && t.last.length === 5, "Последний запрос вернул 5 документов");
  },
  solution: R`...`,
}
```

API проверки `t`: `ok(cond,msg)`, `db(name).count(coll, filter)`, `.docs(coll)`, `.exists(coll)`, `.indexes(coll)`,
`.collections()`, `dbs()`, `current` (текущая БД), `results` (значения всех выведенных выражений), `last` (последнее; для `find` — массив документов),
`output` (текст вывода), `code`, `uses(...)`, `error`.

### HDFS (`env: "hdfs"`)

Студент работает в терминале; проверка выполняется после каждой команды. `solution` — команды по одной в строке
(строки с `#` — комментарии). Кластер в начале **остановлен**: первая команда обычно `start-dfs.sh`.

```js
{
  id: "t3", env: "hdfs", title: "...", text: R`...`,
  check: (t) => {
    t.ok(t.running(), "HDFS запущен (start-dfs.sh)");
    t.ok(t.hdfs.isDir("/user/student/corpus"), "Создан каталог /user/student/corpus");
    t.ok(t.hdfs.list("/user/student/corpus").length >= 3, "В нём не меньше 3 файлов");
    t.ok(t.ran(/hdfs fsck .*-blocks/), "Выполнена команда fsck с ключом -blocks");
  },
  solution: R`start-dfs.sh
hdfs dfs -mkdir -p /user/student/corpus`,
}
```

API: `running()`, `yarn()`, `hdfs.{exists,isDir,isFile,read,size,list,stat,count}(path)`, `local.{...}` (локальная ФС, домашний каталог `/home/student`),
`history()`, `ran(regex|строка)`, `last.{cmd,out,code}`.
Локальные файлы: `/home/student/corpus/uz_01.txt … uz_16.txt`, `/home/student/data/students.csv`, `/home/student/data/reviews_uz.csv`,
`/home/student/logs/access_2026-11.log` (условно 300 МБ → 3 блока), `/home/student/notes.txt`.

### Выбор ответа (`env: "choice"`) и ввод ответа (`env: "answer"`)

```js
{ id: "t4", env: "choice", title: "...", text: R`Вопрос`, options: ["...", "..."], answer: 1 /* или [0, 2] */, explain: R`...` }
{ id: "t5", env: "answer", title: "...", text: R`Сколько блоков займёт файл 300 МБ?`, answers: ["3", "три"], explain: R`...` }
```

## Учебные данные (`data/`)

| Файл | Содержимое |
|---|---|
| `students.csv` | 200 студентов (student_id, full_name, gender, birth_year, age, faculty, group, course, city, gpa, attendance, english_level) |
| `students_dirty.csv` | «грязная» версия: дубликаты, пропуски, разные написания городов, GPA с запятой, выбросы возраста, даты в разных форматах, enroll_date, phone |
| `sales.xlsx` | листы `2025` (240 строк), `2026` (300), `kitoblar` (справочник книг) |
| `books.json` | 16 книг, вложенный JSON (authors[], publisher{}, price{}, reviews[], необязательные isbn/translator) |
| `library.xml` | каталог книг в XML (`<book id lang>` с title, author, year, genre, price currency, copies) |
| `tweets_stream.csv` | 2060 постов соцсетей за 30 минут (21.03.2026): timestamp, user, platform, lang, text, likes, reposts, has_image, location; есть дубли и пропуски |
| `datasets_catalog.csv` | 10 наборов данных с характеристиками для анализа 5V |
| `corpus_uz/uz_01…16.txt` | 16 новостных текстов на узбекском (латиница) с РАЗНЫМИ апострофами: ʻ ʼ / ' / ‘ ’ / \`; `meta.csv` — метаданные |
| `corpus_cyr/*.txt` | 2 текста на узбекском в кириллице (для транслитерации) |
| `stopwords_uz.txt` | стоп-слова узбекского языка (нормализованы: oʻ, gʻ = U+02BB, ʼ = U+02BC) |
| `news_raw.csv` | «грязные» тексты (HTML-теги, ссылки, эмодзи, хештеги, разный регистр и апострофы, дубликаты, кириллица, пустые строки) |
| `reviews_uz.csv` | 180 отзывов о книгах: stars 1–5, text на узбекском, category, city |
| `site/` | учебный новостной сайт «Talaba Yangiliklari»: `index.html`, `page-2.html`, `page-3.html`, `article/<slug>.html` |
| `api/v1/` | учебный REST API: `books/page-1..4.json` (пагинация, поле next), `books/<id>.json`, `authors.json`, `weather/<tashkent|samarkand|bukhara|nukus>.json` |
| `mongo/articles.json`, `mongo/students.json` | данные для `mongoimport --jsonArray` |
| `spark/sales_events.csv`, `spark/students.jsonl` | данные для Spark (3000 продаж; JSON Lines) |

Структура страниц сайта: карточка `article.news-card` → `h2.news-title > a[href]`, `.meta > span.category, time[datetime], span.author`, `p.lead`;
пагинация `div.pagination > a.next`. Страница статьи: `h1.article-title`, `.meta` (+ `span.views`), `div.article-body > p`, `ul.tags > li`, рекламный блок `aside.ads`.

## Самопроверка

Откройте `selftest.html` (или `selftest.html?s=p02,p03`) — страница выполнит все эталонные решения и проверки и покажет таблицу результатов.
