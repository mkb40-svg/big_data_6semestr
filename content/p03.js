BDT.register({
  id: "p03",
  kind: "practice",
  num: 3,
  title: "Работа со структурированными, полуструктурированными и неструктурированными данными (CSV, JSON, XML)",
  hours: 2,
  env: ["python"],
  goals: [
    "Различать структурированные, полуструктурированные и неструктурированные данные",
    "Читать и записывать CSV, JSON и XML средствами Python (`csv`/`pandas`, `json`, `xml.etree.ElementTree`)",
    "Превращать вложенный JSON и XML в плоские таблицы (`pd.json_normalize`, `pd.read_xml`)",
    "Извлекать структуру из неструктурированного текста: заголовок, число символов и слов",
  ],
  theory: R`
## Три вида данных

| Вид | Признаки | Примеры | Чем читать в Python |
|---|---|---|---|
| **Структурированные** (structured) | жёсткая схема: строки и столбцы, у каждого столбца один тип | CSV, Excel, таблицы SQL | \`pd.read_csv\`, \`pd.read_excel\`, \`sqlite3\` |
| **Полуструктурированные** (semi-structured) | данные сами описывают себя ключами или тегами; бывают вложенность и необязательные поля | JSON, XML, HTML, JSON Lines, логи | \`json\`, \`xml.etree.ElementTree\`, \`pd.json_normalize\`, \`pd.read_xml\` |
| **Неструктурированные** (unstructured) | нет заранее заданной схемы | тексты, PDF, изображения, аудио, видео | \`open().read()\`, регулярные выражения, NLP |

По оценкам аналитиков, 80–90 % всех данных в мире — неструктурированные. Для компьютерного лингвиста это основной материал: корпуса новостей, посты, расшифровки речи. Размеченный корпус (например, в формате TEI XML или CoNLL-U) уже становится полуструктурированным.

### Schema-on-write и schema-on-read

Классическая база данных проверяет схему **при записи** (*schema-on-write*): строку с неверным типом просто не дадут сохранить. В системах Big Data (HDFS, озёра данных, MongoDB) данные часто сохраняют «как есть», а схему накладывают **при чтении** (*schema-on-read*). Это гибко — можно принять JSON с новыми полями, — но вся проверка и приведение типов ложится на код анализа. Именно этим вы займётесь в заданиях: превратите вложенный JSON, XML и текст в аккуратные таблицы с правильными типами.

## CSV — структурированные данные

\`\`\`python
import pandas as pd

students = pd.read_csv("data/students.csv")              # разделитель по умолчанию — запятая
kl = students[students["faculty"] == "Kompyuter lingvistikasi"]
kl.to_csv("kl_students.csv", index=False, sep=";")       # без столбца индекса, через «;»
back = pd.read_csv("kl_students.csv", sep=";")           # читать нужно с тем же разделителем
\`\`\`

> [!TIP] index=False
> Если забыть \`index=False\`, в файл попадёт индекс DataFrame, а при чтении появится лишний столбец \`Unnamed: 0\`.

## JSON — модуль json

JSON состоит из объектов \`{"ключ": значение}\` и массивов \`[...]\`. В Python они становятся словарями (\`dict\`) и списками (\`list\`).

\`\`\`python
import json

with open("data/books.json", encoding="utf-8") as f:
    books = json.load(f)                 # список словарей

book = books[0]
book["title"]                            # "O'tkan kunlar"
book["publisher"]["city"]                # вложенный объект
book["authors"][0]["name"]               # массив объектов
book.get("isbn", "нет")                  # необязательное поле: get вместо []

with open("out.json", "w", encoding="utf-8") as f:
    json.dump(books, f, ensure_ascii=False, indent=2)
\`\`\`

Параметр \`ensure_ascii=False\` сохраняет кириллицу и символы вроде \`ʻ\` как есть; без него «Мастер» превратится в \`\u041c\u0430...\`.

## JSON → таблица: json_normalize

\`\`\`python
df = pd.json_normalize(books)            # publisher.name, price.amount, ... — вложенные поля через точку
reviews = pd.json_normalize(books, record_path="reviews", meta=["id", "title"])
# одна строка на каждый отзыв + столбцы id и title книги
\`\`\`

Списки внутри записей (\`authors\`, \`reviews\`) \`json_normalize\` по умолчанию оставляет как есть; чтобы развернуть их в строки, укажите \`record_path\`.

## XML — ElementTree

\`\`\`xml
<library name="Universitet kutubxonasi">
  <book id="1" lang="uz">
    <title>O'tkan kunlar</title>
    <price currency="UZS">65000</price>
  </book>
</library>
\`\`\`

\`\`\`python
import xml.etree.ElementTree as ET

root = ET.parse("data/library.xml").getroot()
root.get("name")                         # атрибут корня
for book in root.findall("book"):        # все дочерние элементы <book>
    book.get("id")                       # атрибут — всегда строка!
    book.findtext("title")               # текст вложенного элемента
    book.find("price").get("currency")   # атрибут вложенного элемента
\`\`\`

Для простых плоских XML есть \`pd.read_xml("data/library.xml")\`: каждый \`<book>\` станет строкой, а атрибуты и дочерние элементы — столбцами (атрибуты вложенных элементов, например \`currency\`, при этом теряются).

## Текст — неструктурированные данные

\`\`\`python
with open("data/corpus_uz/uz_01.txt", encoding="utf-8") as f:
    text = f.read()
title = text.split("\n")[0]       # первая строка — заголовок
words = text.split()              # простейшая токенизация по пробелам
len(text), len(words)
\`\`\`

> [!NOTE] Из текста — в таблицу
> Типичный конвейер Big Data: собрать тысячи текстов, для каждого вычислить признаки (длина, число слов, язык, тема) и сохранить их в **структурированную** таблицу. Дальше с ней работают как с обычным CSV.
`,
  tasks: [
    {
      id: "t1",
      title: "CSV: чтение, фильтр, запись",
      text: R`
1. Прочитайте \`data/students.csv\` в \`students\`.
2. Отберите студентов факультета **Kompyuter lingvistikasi** в \`kl\`.
3. Сохраните \`kl\` в файл \`kl_students.csv\` **без индекса** и с разделителем \`;\`.
4. Прочитайте файл обратно в \`kl2\` (не забудьте про разделитель) и выведите \`kl2.shape\`.
`,
      starter: R`import pandas as pd

students = ...
kl = ...

# сохраните kl в kl_students.csv

kl2 = ...
print(kl2.shape)
kl2.head()
`,
      check: R`
import os
import pandas as pd
s = pd.read_csv("data/students.csv")
n = int((s["faculty"] == "Kompyuter lingvistikasi").sum())
ok(len(var("students", pd.DataFrame)) == len(s), f"students содержит {len(s)} строк")
kl = var("kl", pd.DataFrame)
ok(len(kl) == n and (kl["faculty"] == "Kompyuter lingvistikasi").all(), f"В kl {n} студентов факультета Kompyuter lingvistikasi")
ok(os.path.exists("kl_students.csv"), "Создан файл kl_students.csv")
if os.path.exists("kl_students.csv"):
    with open("kl_students.csv", encoding="utf-8") as f:
        head = f.readline()
    ok(head.startswith("student_id;"), "Файл сохранён без индекса и с разделителем «;»")
k2 = var("kl2", pd.DataFrame)
ok(k2.shape == (n, s.shape[1]), f"kl2 прочитан с sep=';': {n} строк, {s.shape[1]} столбцов")
`,
      hint: "Запись: `kl.to_csv(\"kl_students.csv\", index=False, sep=\";\")`. Чтение: `pd.read_csv(\"kl_students.csv\", sep=\";\")`.",
      solution: R`import pandas as pd

students = pd.read_csv("data/students.csv")
kl = students[students["faculty"] == "Kompyuter lingvistikasi"]

kl.to_csv("kl_students.csv", index=False, sep=";")

kl2 = pd.read_csv("kl_students.csv", sep=";")
print(kl2.shape)
kl2.head()
`,
    },
    {
      id: "t2",
      title: "JSON: модуль json",
      text: R`
Файл \`data/books.json\` — список из 16 книг со вложенными полями. Используйте модуль \`json\` (без pandas):

- \`books\` — загруженный список;
- \`titles_uz\` — список названий книг на узбекском (\`language == "uz"\`);
- \`no_isbn\` — список названий книг, у которых **нет** поля \`isbn\` (необязательное поле!);
- \`n_reviews\` — общее число отзывов (\`reviews\`) по всем книгам;
- сохраните в файл \`books_short.json\` список словарей \`{"title": ..., "language": ...}\` для всех книг — с \`ensure_ascii=False\` и \`indent=2\`.
`,
      starter: R`import json

with open("data/books.json", encoding="utf-8") as f:
    books = ...

titles_uz = ...
no_isbn = ...
n_reviews = ...

short = ...
# сохраните short в books_short.json

print(len(books), "книг; на узбекском:", len(titles_uz))
print("Без ISBN:", no_isbn)
print("Отзывов:", n_reviews)
`,
      check: R`
import json, os
with open("data/books.json", encoding="utf-8") as f:
    b = json.load(f)
bk = var("books", list)
ok(len(bk) == len(b), f"books — список из {len(b)} книг")
tu = var("titles_uz", list)
ok(tu == [x["title"] for x in b if x["language"] == "uz"], "titles_uz — названия узбекских книг (в исходном порядке)")
ni = var("no_isbn", list)
ok(sorted(ni) == sorted(x["title"] for x in b if "isbn" not in x), "no_isbn — книги без поля isbn")
ok(var("n_reviews") == sum(len(x.get("reviews", [])) for x in b), "n_reviews — общее число отзывов")
ok(os.path.exists("books_short.json"), "Создан файл books_short.json")
if os.path.exists("books_short.json"):
    with open("books_short.json", encoding="utf-8") as f:
        raw = f.read()
    data = json.loads(raw)
    ok(isinstance(data, list) and len(data) == len(b) and set(data[0].keys()) == {"title", "language"}, "В books_short.json список словарей с ключами title и language")
    ok("Мастер и Маргарита" in raw, "Кириллица сохранена как есть (ensure_ascii=False)")
    ok("\n  " in raw, "Файл записан с отступами (indent=2)")
`,
      hint: "Отсутствие ключа проверяется так: `\"isbn\" not in b`. Сумма: `sum(len(b.get(\"reviews\", [])) for b in books)`. Запись: `json.dump(short, f, ensure_ascii=False, indent=2)` в файле, открытом с `\"w\"`.",
      solution: R`import json

with open("data/books.json", encoding="utf-8") as f:
    books = json.load(f)

titles_uz = [b["title"] for b in books if b["language"] == "uz"]
no_isbn = [b["title"] for b in books if "isbn" not in b]
n_reviews = sum(len(b.get("reviews", [])) for b in books)

short = [{"title": b["title"], "language": b["language"]} for b in books]
with open("books_short.json", "w", encoding="utf-8") as f:
    json.dump(short, f, ensure_ascii=False, indent=2)

print(len(books), "книг; на узбекском:", len(titles_uz))
print("Без ISBN:", no_isbn)
print("Отзывов:", n_reviews)
`,
    },
    {
      id: "t3",
      title: "Вложенный JSON → таблицы (json_normalize)",
      setup: R`import json
import pandas as pd
with open("data/books.json", encoding="utf-8") as f:
    books = json.load(f)`,
      text: R`
Список \`books\` уже загружен. С помощью \`pd.json_normalize\`:

1. \`df\` — плоская таблица книг (вложенные поля станут столбцами \`publisher.name\`, \`price.amount\`, …).
2. \`avg_price\` — Series: средняя цена (\`price.amount\`) по языку книги (\`language\`).
3. \`authors\` — таблица авторов: одна строка на каждого автора каждой книги, плюс столбцы \`id\` и \`title\` книги (\`record_path\` и \`meta\`).
4. \`reviews\` — таблица отзывов аналогично (\`record_path="reviews"\`).
5. \`mean_stars\` — Series: средняя оценка \`stars\` для каждой книги (\`title\`).
`,
      starter: R`df = ...
print(df.columns.tolist())

avg_price = ...

authors = ...
reviews = ...
mean_stars = ...

print(avg_price)
print(len(authors), "авторов,", len(reviews), "отзывов")
mean_stars.sort_values(ascending=False).head()
`,
      check: R`
import json
import pandas as pd
with open("data/books.json", encoding="utf-8") as f:
    b = json.load(f)
e = pd.json_normalize(b)
d = var("df", pd.DataFrame)
ok(len(d) == len(b) and "publisher.name" in d.columns and "price.amount" in d.columns, "df — плоская таблица из 16 книг со столбцами publisher.name и price.amount")
ap = var("avg_price", pd.Series)
ea = e.groupby("language")["price.amount"].mean()
ok(set(ap.index) == set(ea.index) and all(abs(ap[k] - ea[k]) < 0.01 for k in ea.index), "avg_price — средняя цена по языкам")
a = var("authors", pd.DataFrame)
ok(len(a) == sum(len(x["authors"]) for x in b) and {"name", "id", "title"} <= set(a.columns), "authors — одна строка на автора, есть столбцы name, id, title")
r = var("reviews", pd.DataFrame)
er = pd.json_normalize(b, record_path="reviews", meta=["id", "title"])
ok(len(r) == len(er) and {"stars", "id", "title"} <= set(r.columns), f"reviews — {len(er)} отзывов со столбцами stars, id, title")
ms = var("mean_stars", pd.Series)
em = er.groupby("title")["stars"].mean()
ok(len(ms) == len(em) and all(abs(ms[k] - em[k]) < 0.01 for k in em.index), "mean_stars — средняя оценка каждой книги")
`,
      hint: "`pd.json_normalize(books, record_path=\"authors\", meta=[\"id\", \"title\"])`. Средние: `groupby(\"language\")[\"price.amount\"].mean()`.",
      solution: R`df = pd.json_normalize(books)
print(df.columns.tolist())

avg_price = df.groupby("language")["price.amount"].mean()

authors = pd.json_normalize(books, record_path="authors", meta=["id", "title"])
reviews = pd.json_normalize(books, record_path="reviews", meta=["id", "title"])
mean_stars = reviews.groupby("title")["stars"].mean()

print(avg_price)
print(len(authors), "авторов,", len(reviews), "отзывов")
mean_stars.sort_values(ascending=False).head()
`,
    },
    {
      id: "t4",
      title: "XML: разбор с ElementTree",
      text: R`
Разберите каталог \`data/library.xml\` модулем \`xml.etree.ElementTree\`:

- \`lib_name\` — значение атрибута \`name\` корневого элемента;
- \`lib\` — DataFrame, одна строка на каждый \`<book>\`, столбцы: \`id\`, \`lang\` (атрибуты), \`title\`, \`author\`, \`year\`, \`genre\`, \`price\`, \`currency\` (атрибут элемента \`<price>\`), \`copies\`. Столбцы \`id\`, \`year\`, \`price\`, \`copies\` должны быть **целыми числами** (в XML всё — строки!);
- \`total_copies\` — общее число экземпляров;
- \`not_available\` — список названий книг, у которых \`copies == 0\`.
`,
      starter: R`import xml.etree.ElementTree as ET
import pandas as pd

root = ET.parse("data/library.xml").getroot()
lib_name = ...

rows = []
for book in root.findall("book"):
    rows.append({
        "id": ...,
        "lang": book.get("lang"),
        "title": book.findtext("title"),
        # author, year, genre, price, currency, copies
    })

lib = pd.DataFrame(rows)
total_copies = ...
not_available = ...

print(lib_name, "| экземпляров:", total_copies, "| нет в наличии:", not_available)
lib.head()
`,
      check: R`
import xml.etree.ElementTree as ET
import pandas as pd
root = ET.parse("data/library.xml").getroot()
bs = root.findall("book")
ok(var("lib_name") == root.get("name"), f"lib_name = {root.get('name')}")
lib = var("lib", pd.DataFrame)
need = ["id", "lang", "title", "author", "year", "genre", "price", "currency", "copies"]
ok(len(lib) == len(bs), f"В lib {len(bs)} строк")
ok(all(c in lib.columns for c in need), "В lib есть столбцы: " + ", ".join(need))
if all(c in lib.columns for c in need):
    ok(all(pd.api.types.is_integer_dtype(lib[c]) for c in ["id", "year", "price", "copies"]), "id, year, price, copies — целые числа")
    ok(set(lib["currency"]) == set(b.find("price").get("currency") for b in bs), "currency взят из атрибута <price>")
    ok(list(lib["title"]) == [b.findtext("title") for b in bs], "Названия книг извлечены верно")
tc = sum(int(b.findtext("copies")) for b in bs)
ok(var("total_copies") == tc, f"total_copies = {tc}")
na = [b.findtext("title") for b in bs if int(b.findtext("copies")) == 0]
ok(sorted(var("not_available")) == sorted(na), "not_available — книги без экземпляров")
`,
      hint: "Атрибут: `book.get(\"id\")`, текст: `book.findtext(\"year\")`, атрибут вложенного элемента: `book.find(\"price\").get(\"currency\")`. Не забудьте `int(...)`.",
      solution: R`import xml.etree.ElementTree as ET
import pandas as pd

root = ET.parse("data/library.xml").getroot()
lib_name = root.get("name")

rows = []
for book in root.findall("book"):
    price = book.find("price")
    rows.append({
        "id": int(book.get("id")),
        "lang": book.get("lang"),
        "title": book.findtext("title"),
        "author": book.findtext("author"),
        "year": int(book.findtext("year")),
        "genre": book.findtext("genre"),
        "price": int(price.text),
        "currency": price.get("currency"),
        "copies": int(book.findtext("copies")),
    })

lib = pd.DataFrame(rows)
total_copies = lib["copies"].sum()
not_available = lib.loc[lib["copies"] == 0, "title"].tolist()

print(lib_name, "| экземпляров:", total_copies, "| нет в наличии:", not_available)
lib.head()
`,
    },
    {
      id: "t5",
      title: "read_xml и конвертация форматов",
      text: R`
1. Прочитайте \`data/library.xml\` одной командой \`pd.read_xml\` в \`lib2\`.
2. Сохраните \`lib2\` в \`library.csv\` (без индекса) и в \`library.json\` — список записей (\`orient="records"\`, \`force_ascii=False\`).
3. \`sizes\` — словарь размеров трёх файлов в байтах: \`{"xml": ..., "csv": ..., "json": ...}\` (\`os.path.getsize\`).
4. \`smallest\` — ключ самого компактного формата.

Подумайте: почему CSV получился компактнее JSON и XML?
`,
      starter: R`import os
import pandas as pd

lib2 = ...
print(lib2.dtypes)

# сохраните library.csv и library.json

sizes = {
    "xml": os.path.getsize("data/library.xml"),
    "csv": ...,
    "json": ...,
}
smallest = ...
print(sizes, "->", smallest)
`,
      check: R`
import os, json
import pandas as pd
l2 = var("lib2", pd.DataFrame)
ok(l2.shape[0] == 16 and "title" in l2.columns and "copies" in l2.columns, "lib2 — 16 книг, прочитанных из XML")
ok(os.path.exists("library.csv") and os.path.exists("library.json"), "Созданы файлы library.csv и library.json")
if os.path.exists("library.csv") and os.path.exists("library.json"):
    c = pd.read_csv("library.csv")
    ok(len(c) == 16 and "Unnamed: 0" not in c.columns, "library.csv: 16 строк без столбца индекса")
    with open("library.json", encoding="utf-8") as f:
        raw = f.read()
    j = json.loads(raw)
    ok(isinstance(j, list) and len(j) == 16 and "title" in j[0], "library.json — список из 16 записей (orient='records')")
    ok("Мастер и Маргарита" in raw, "Кириллица в JSON сохранена как есть (force_ascii=False)")
    exp = {"xml": os.path.getsize("data/library.xml"), "csv": os.path.getsize("library.csv"), "json": os.path.getsize("library.json")}
    sz = var("sizes", dict)
    ok(sz == exp, f"sizes — размеры файлов в байтах: {exp}")
    ok(var("smallest") == min(exp, key=exp.get), "smallest — самый компактный формат")
`,
      hint: "`lib2.to_json(\"library.json\", orient=\"records\", force_ascii=False)`; минимум по значениям словаря: `min(sizes, key=sizes.get)`.",
      solution: R`import os
import pandas as pd

lib2 = pd.read_xml("data/library.xml")
print(lib2.dtypes)

lib2.to_csv("library.csv", index=False)
lib2.to_json("library.json", orient="records", force_ascii=False, indent=2)

sizes = {
    "xml": os.path.getsize("data/library.xml"),
    "csv": os.path.getsize("library.csv"),
    "json": os.path.getsize("library.json"),
}
smallest = min(sizes, key=sizes.get)
print(sizes, "->", smallest)
`,
    },
    {
      id: "t6",
      title: "Текст → таблица признаков",
      text: R`
Тексты корпуса \`data/corpus_uz/uz_01.txt … uz_16.txt\` — неструктурированные данные. Превратите их в структурированную таблицу.

1. Прочитайте \`data/corpus_uz/uz_14.txt\` в строку \`text\`; \`title\` — первая строка текста; \`n_chars\` — число символов; \`n_words\` — число слов при разбиении \`text.split()\`.
2. Для **всех** 16 файлов \`.txt\` из папки соберите DataFrame \`corpus\` со столбцами \`file\` (имя файла, например \`"uz_01.txt"\`), \`title\`, \`n_chars\`, \`n_words\`, упорядоченный по \`file\`.
3. \`longest\` — заголовок текста с наибольшим числом слов.

Файл \`meta.csv\` в той же папке — не текст корпуса, его нужно пропустить.
`,
      starter: R`import os
import pandas as pd

with open("data/corpus_uz/uz_14.txt", encoding="utf-8") as f:
    text = ...
title = ...
n_chars = ...
n_words = ...
print(title, n_chars, n_words)

rows = []
for name in sorted(os.listdir("data/corpus_uz")):
    ...

corpus = pd.DataFrame(rows)
longest = ...
print("Самый длинный:", longest)
corpus
`,
      check: R`
import os
import pandas as pd
def feats(p):
    with open(p, encoding="utf-8") as f:
        t = f.read()
    return t.split("\n")[0].strip(), len(t), len(t.split())
t14, c14, w14 = feats("data/corpus_uz/uz_14.txt")
ok(var("title", str).strip() == t14, "title — первая строка uz_14.txt")
ok(var("n_chars") == c14, f"n_chars = {c14}")
ok(var("n_words") == w14, f"n_words = {w14}")
files = sorted(f for f in os.listdir("data/corpus_uz") if f.endswith(".txt"))
c = var("corpus", pd.DataFrame)
ok(len(c) == len(files), f"В corpus {len(files)} строк (meta.csv пропущен)")
ok({"file", "title", "n_chars", "n_words"} <= set(c.columns), "В corpus есть столбцы file, title, n_chars, n_words")
if {"file", "title", "n_chars", "n_words"} <= set(c.columns) and len(c) == len(files):
    ok([os.path.basename(str(x)) for x in c["file"]] == files, "Строки упорядочены по имени файла, file — имя файла")
    ex = [feats("data/corpus_uz/" + f) for f in files]
    ok(list(c["n_words"]) == [e[2] for e in ex] and list(c["n_chars"]) == [e[1] for e in ex], "n_chars и n_words посчитаны для каждого файла")
    best = max(ex, key=lambda e: e[2])[0]
    ok(str(var("longest")).strip() == best, f"longest = «{best}»")
`,
      hint: "Первая строка: `text.split(\"\\n\")[0]`. В цикле пропускайте файлы, которые не заканчиваются на `.txt`: `if not name.endswith(\".txt\"): continue`. Самый длинный: `corpus.loc[corpus[\"n_words\"].idxmax(), \"title\"]`.",
      solution: R`import os
import pandas as pd

with open("data/corpus_uz/uz_14.txt", encoding="utf-8") as f:
    text = f.read()
title = text.split("\n")[0]
n_chars = len(text)
n_words = len(text.split())
print(title, n_chars, n_words)

rows = []
for name in sorted(os.listdir("data/corpus_uz")):
    if not name.endswith(".txt"):
        continue
    with open("data/corpus_uz/" + name, encoding="utf-8") as f:
        t = f.read()
    rows.append({"file": name, "title": t.split("\n")[0], "n_chars": len(t), "n_words": len(t.split())})

corpus = pd.DataFrame(rows)
longest = corpus.loc[corpus["n_words"].idxmax(), "title"]
print("Самый длинный:", longest)
corpus
`,
    },
    {
      id: "t7",
      title: "Классификатор файлов по виду данных",
      text: R`
Напишите функцию \`classify(filename)\`, которая по **расширению** файла (регистр не важен) возвращает вид данных:

| Расширения | Результат |
|---|---|
| \`.csv\`, \`.xlsx\`, \`.xls\`, \`.parquet\`, \`.db\`, \`.sqlite\` | \`"structured"\` |
| \`.json\`, \`.jsonl\`, \`.xml\`, \`.html\` | \`"semi-structured"\` |
| все остальные (\`.txt\`, \`.pdf\`, \`.jpg\`, \`.mp3\`, …) | \`"unstructured"\` |

Затем обойдите **всю** папку \`data/\` вместе с подпапками (\`os.walk\`) и посчитайте, сколько файлов каждого вида: \`counts\` — словарь \`{"structured": ..., "semi-structured": ..., "unstructured": ...}\`.
`,
      starter: R`import os

STRUCTURED = {".csv", ".xlsx", ".xls", ".parquet", ".db", ".sqlite"}
SEMI = {".json", ".jsonl", ".xml", ".html"}

def classify(filename):
    ext = os.path.splitext(filename)[1].lower()
    ...

counts = {"structured": 0, "semi-structured": 0, "unstructured": 0}
for root, dirs, files in os.walk("data"):
    for name in files:
        ...

print(classify("students.csv"), classify("books.json"), classify("uz_01.txt"))
print(counts)
`,
      check: R`
import os
cl = var("classify")
ok(callable(cl), "classify — функция")
cases = {"students.csv": "structured", "SALES.XLSX": "structured", "university.db": "structured",
         "books.json": "semi-structured", "library.xml": "semi-structured", "index.HTML": "semi-structured",
         "events.jsonl": "semi-structured", "uz_01.txt": "unstructured", "scan.pdf": "unstructured",
         "photo.jpg": "unstructured", "archive.tar.gz": "unstructured"}
bad = [k for k, v in cases.items() if cl(k) != v]
ok(not bad, "classify верно определяет вид по расширению" + (": ошибка для " + ", ".join(bad) if bad else ""))
S = {".csv", ".xlsx", ".xls", ".parquet", ".db", ".sqlite"}
M = {".json", ".jsonl", ".xml", ".html"}
exp = {"structured": 0, "semi-structured": 0, "unstructured": 0}
for r, d, fs in os.walk("data"):
    for f in fs:
        e = os.path.splitext(f)[1].lower()
        exp["structured" if e in S else "semi-structured" if e in M else "unstructured"] += 1
c = var("counts", dict)
ok(c == exp, f"counts — число файлов каждого вида в data/: {exp}")
`,
      hint: "В функции: `if ext in STRUCTURED: return \"structured\"`, затем проверка SEMI, иначе `\"unstructured\"`. В цикле: `counts[classify(name)] += 1`.",
      solution: R`import os

STRUCTURED = {".csv", ".xlsx", ".xls", ".parquet", ".db", ".sqlite"}
SEMI = {".json", ".jsonl", ".xml", ".html"}

def classify(filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext in STRUCTURED:
        return "structured"
    if ext in SEMI:
        return "semi-structured"
    return "unstructured"

counts = {"structured": 0, "semi-structured": 0, "unstructured": 0}
for root, dirs, files in os.walk("data"):
    for name in files:
        counts[classify(name)] += 1

print(classify("students.csv"), classify("books.json"), classify("uz_01.txt"))
print(counts)
`,
    },
  ],
  quiz: [
    { q: "К какому виду данных относится JSON-файл с вложенными объектами и необязательными полями?", options: ["Структурированные", "Полуструктурированные", "Неструктурированные", "Бинарные"], answer: 1, explain: "JSON и XML описывают себя ключами/тегами, но не требуют жёсткой схемы: у разных записей могут быть разные поля." },
    { q: "Что делает параметр `ensure_ascii=False` в `json.dump`?", options: ["Сохраняет не-ASCII символы (кириллицу, ʻ) как есть", "Сжимает файл", "Проверяет корректность JSON", "Сортирует ключи"], answer: 0, explain: "По умолчанию все не-ASCII символы записываются escape-последовательностями `\\uXXXX`, что неудобно читать." },
    { q: "Как получить таблицу, где каждая строка — отдельный отзыв из массива `reviews` внутри каждой книги?", options: ["`pd.json_normalize(books)`", "`pd.DataFrame(books)[\"reviews\"]`", "`json.loads(books)`", "`pd.json_normalize(books, record_path=\"reviews\", meta=[\"title\"])`"], answer: 3, explain: "`record_path` указывает массив, который нужно развернуть в строки, а `meta` — поля родителя, которые нужно скопировать в каждую строку." },
    { q: "Что вернёт `book.get(\"id\")` для элемента `<book id=\"7\">` в ElementTree?", options: ["Число 7", "Строку \"7\"", "Элемент <id>", "None"], answer: 1, explain: "Атрибуты и текст XML — всегда строки; для вычислений их нужно преобразовать `int(...)`." },
    { q: "Почему при чтении CSV появляется столбец `Unnamed: 0`?", options: ["Неверная кодировка", "В файле нет заголовка", "Файл был сохранён с индексом (без index=False)", "Файл повреждён"], answer: 2 },
    { q: "Какие данные являются неструктурированными?", options: ["Таблица SQL со студентами", "XML-каталог библиотеки", "Новостная статья в .txt", "CSV с продажами"], answer: 2, explain: "Простой текст не имеет схемы: заголовок, абзацы и слова приходится выделять программно." },
  ],
  realEnv: R`
## Как выполнить работу в реальной среде

В **Jupyter** (Anaconda) или **Google Colab** весь код работает без изменений: модули \`json\`, \`csv\` и \`xml.etree.ElementTree\` входят в стандартную библиотеку Python, \`pd.read_xml\` требует пакет \`lxml\` (в Anaconda он уже есть; в другом окружении: \`pip install lxml\`).

### Полезные приёмы для больших файлов

| Задача | Решение |
|---|---|
| JSON на несколько ГБ | формат **JSON Lines** (одна запись в строке) и \`pd.read_json(path, lines=True, chunksize=10000)\` |
| Огромный XML (дамп Википедии) | потоковый разбор \`ET.iterparse(path)\` с очисткой \`elem.clear()\` — файл не грузится в память целиком |
| Много текстов | читать файлы по одному в цикле и сразу сохранять признаки в таблицу |

\`\`\`python
import xml.etree.ElementTree as ET

# потоковый разбор: память не растёт, даже если файл весит гигабайты
for event, elem in ET.iterparse("uzwiki-latest-pages-articles.xml"):
    if elem.tag.endswith("title"):
        print(elem.text)
    elem.clear()
\`\`\`

> [!TIP] Реальные источники
> Дамп узбекской Википедии (XML) — [dumps.wikimedia.org/uzwiki](https://dumps.wikimedia.org/uzwiki/); открытые данные Узбекистана в CSV/JSON/XML — [data.egov.uz](https://data.egov.uz); корпуса в формате CoNLL-U — [universaldependencies.org](https://universaldependencies.org).
`,
  homework: R`
## Самостоятельная работа: «Изучение возможностей библиотеки Pandas»

1. Прочитайте \`data/spark/students.jsonl\` (формат JSON Lines) функцией \`pd.read_json(..., lines=True)\`. Чем этот формат удобнее обычного JSON для больших данных?
2. Сохраните таблицу \`lib\` из задания 4 обратно в XML методом \`DataFrame.to_xml\` (корень \`library\`, строки \`book\`) и сравните с исходным файлом.
3. Для всех текстов корпуса посчитайте долю слов с апострофом (\`oʻ\`, \`gʻ\`, \`ʼ\`) и добавьте этот признак в таблицу \`corpus\`.
`,
});
