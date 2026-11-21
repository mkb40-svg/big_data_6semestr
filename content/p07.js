BDT.register({
  id: "p07",
  kind: "practice",
  num: 7,
  title: "Создание базы данных SQL и работа с данными",
  hours: 2,
  env: ["python"],
  goals: [
    "Создавать базу данных SQLite и таблицы с типами столбцов и первичным ключом",
    "Добавлять данные безопасно — через параметры `?` и `executemany`",
    "Писать запросы SELECT с WHERE, ORDER BY, GROUP BY, HAVING, JOIN, а также UPDATE и DELETE",
    "Связывать SQL и pandas: `pd.read_sql_query` и `DataFrame.to_sql`",
  ],
  theory: R`
## Реляционная база данных

**Реляционная БД** хранит данные в **таблицах** со строгой схемой: у каждого столбца есть имя и тип, у каждой строки — уникальный **первичный ключ** (PRIMARY KEY). Таблицы связываются друг с другом через ключи, а запросы пишутся на языке **SQL**.

**SQLite** — встроенная СУБД: вся база — это один файл (например, \`university.db\`), сервер не нужен. Модуль \`sqlite3\` входит в стандартную библиотеку Python. Для больших промышленных систем используют PostgreSQL, MySQL, а в мире Big Data — SQL-движки поверх кластеров (Hive, Spark SQL), но язык запросов почти тот же.

| Тип SQLite | Что хранит | Пример |
|---|---|---|
| \`INTEGER\` | целые числа | курс, год |
| \`REAL\` | дробные числа | GPA |
| \`TEXT\` | строки | ФИО, город |
| \`BLOB\` | двоичные данные | файл, изображение |
| \`NULL\` | отсутствие значения | пропуск |

## Создание таблицы и вставка

\`\`\`python
import sqlite3

conn = sqlite3.connect("university.db")     # файл создаётся, если его нет
cur = conn.cursor()
cur.execute("""
CREATE TABLE IF NOT EXISTS students (
    student_id TEXT PRIMARY KEY,
    full_name  TEXT NOT NULL,
    faculty    TEXT,
    course     INTEGER,
    gpa        REAL
)""")
cur.execute("INSERT INTO students VALUES (?, ?, ?, ?, ?)",
            ("S0001", "Saidov Otabek", "Kompyuter lingvistikasi", 2, 4.13))
rows = [("S0002", "Tursunova Munisa", "Tarjimonlik", 1, 4.22),
        ("S0003", "Nazarova Sevara", "Xalqaro jurnalistika", 3, 4.6)]
cur.executemany("INSERT INTO students VALUES (?, ?, ?, ?, ?)", rows)
conn.commit()                               # без commit изменения не сохранятся!
\`\`\`

> [!WARNING] Только параметры «?»
> Никогда не вставляйте значения в SQL через f-строки: \`f"... WHERE city = '{city}'"\`. Если в значении окажется кавычка (\`Farg'ona\`!), запрос сломается, а злоумышленник сможет выполнить свой SQL (**SQL-инъекция**). Параметры \`?\` экранируют значения автоматически.

Повторная вставка того же \`student_id\` вызовет \`sqlite3.IntegrityError\` — первичный ключ гарантирует уникальность.

## Запросы SELECT

\`\`\`sql
SELECT full_name, gpa                -- какие столбцы
FROM students                        -- из какой таблицы
WHERE faculty = 'Filologiya'         -- фильтр строк
ORDER BY gpa DESC                    -- сортировка
LIMIT 5;                             -- первые 5

SELECT city, COUNT(*) AS n, AVG(gpa) AS avg_gpa
FROM students
GROUP BY city                        -- группировка
HAVING COUNT(*) >= 15;               -- фильтр групп (после GROUP BY)
\`\`\`

В Python: \`cur.execute(sql, params).fetchall()\` возвращает список кортежей, \`fetchone()\` — один кортеж.

| SQL | pandas |
|---|---|
| \`WHERE gpa > 4\` | \`df[df["gpa"] > 4]\` |
| \`ORDER BY gpa DESC LIMIT 5\` | \`df.nlargest(5, "gpa")\` |
| \`GROUP BY city\` + \`AVG(gpa)\` | \`df.groupby("city")["gpa"].mean()\` |
| \`HAVING COUNT(*) >= 15\` | фильтр после \`groupby\` |
| \`JOIN ... ON\` | \`pd.merge(a, b, on=...)\` |

## JOIN — соединение таблиц

\`\`\`sql
SELECT s.order_id, s.qty, b.category
FROM sales AS s
JOIN books AS b ON s.book = b.book;            -- только совпавшие строки

SELECT b.book FROM books AS b
LEFT JOIN sales AS s ON s.book = b.book
WHERE s.order_id IS NULL;                      -- книги без продаж
\`\`\`

## Изменение и удаление

\`\`\`python
cur.execute("UPDATE students SET gpa = gpa + 0.1 WHERE attendance >= ?", (95,))
print(cur.rowcount)                            # сколько строк изменено
cur.execute("DELETE FROM students WHERE course = ?", (4,))
conn.commit()
\`\`\`

## SQL и pandas вместе

\`\`\`python
import pandas as pd

df = pd.read_csv("data/students.csv")
df.to_sql("students", conn, if_exists="replace", index=False)     # DataFrame → таблица
top = pd.read_sql_query("SELECT * FROM students WHERE gpa >= ?", conn, params=(4.5,))
conn.close()
\`\`\`

> [!NOTE] Как устроен тренажёр
> Файлы, которые создаёт ваш код (например, \`university.db\`), живут в памяти браузера до перезагрузки страницы. Подготовительный код заданий каждый раз пересоздаёт базу, поэтому задания можно запускать повторно.
`,
  tasks: [
    {
      id: "t1",
      title: "Создание базы и таблицы",
      setup: R`import os
if os.path.exists("university.db"):
    os.remove("university.db")`,
      text: R`
Схема таблицы \`students\`:

| Столбец | Тип | Ограничение |
|---|---|---|
| \`student_id\` | TEXT | PRIMARY KEY |
| \`full_name\` | TEXT | NOT NULL |
| \`faculty\` | TEXT | |
| \`course\` | INTEGER | |
| \`city\` | TEXT | |
| \`gpa\` | REAL | |

1. Подключитесь к базе \`university.db\` (\`conn\`) и создайте таблицу \`students\` по этой схеме.
2. Добавьте **три** студента запросом \`INSERT\` с параметрами \`?\` и сохраните изменения (\`commit\`).
3. Попробуйте ещё раз вставить студента с уже существующим \`student_id\`; перехватите \`sqlite3.IntegrityError\` и сохраните текст ошибки в \`err\`.
4. \`n\` — число строк в таблице (\`SELECT COUNT(*)\`). Закройте соединение.
`,
      starter: R`import sqlite3

conn = sqlite3.connect("university.db")
cur = conn.cursor()

cur.execute("""
CREATE TABLE students (
    student_id TEXT PRIMARY KEY
    -- допишите остальные столбцы
)""")

# добавьте трёх студентов через параметры ?

err = None
# попробуйте вставить дубликат student_id и перехватите sqlite3.IntegrityError

n = ...
print("Строк:", n, "| ошибка:", err)
conn.close()
`,
      check: R`
import os, sqlite3
ok(os.path.exists("university.db"), "Создан файл university.db")
c = sqlite3.connect("university.db")
info = {r[1]: (r[2].upper(), r[3], r[5]) for r in c.execute("PRAGMA table_info(students)")}
need = {"student_id": "TEXT", "full_name": "TEXT", "faculty": "TEXT", "course": "INTEGER", "city": "TEXT", "gpa": "REAL"}
ok(all(k in info and info[k][0] == t for k, t in need.items()), "В таблице students есть столбцы student_id, full_name, faculty, course, city, gpa с нужными типами")
ok(info.get("student_id", (0, 0, 0))[2] == 1, "student_id — первичный ключ")
ok(info.get("full_name", (0, 0, 0))[1] == 1, "full_name — NOT NULL")
cnt = c.execute("SELECT COUNT(*) FROM students").fetchone()[0] if info else -1
c.close()
ok(cnt == 3, "В таблице ровно 3 строки (изменения сохранены через commit)")
ok(uses("?"), "Значения передаются через параметры ?")
e = var("err")
ok(e is not None and "UNIQUE" in str(e).upper(), "err — текст ошибки IntegrityError (UNIQUE constraint failed)")
ok(var("n") == 3, "n = 3")
`,
      hint: "Пример вставки: `cur.execute(\"INSERT INTO students VALUES (?, ?, ?, ?, ?, ?)\", (\"S0001\", \"Saidov Otabek\", \"Kompyuter lingvistikasi\", 2, \"Andijon\", 4.13))`. Перехват: `try: ... except sqlite3.IntegrityError as e: err = str(e)`.",
      solution: R`import sqlite3

conn = sqlite3.connect("university.db")
cur = conn.cursor()

cur.execute("""
CREATE TABLE students (
    student_id TEXT PRIMARY KEY,
    full_name  TEXT NOT NULL,
    faculty    TEXT,
    course     INTEGER,
    city       TEXT,
    gpa        REAL
)""")

sql = "INSERT INTO students VALUES (?, ?, ?, ?, ?, ?)"
cur.execute(sql, ("S0001", "Saidov Otabek", "Kompyuter lingvistikasi", 2, "Andijon", 4.13))
cur.execute(sql, ("S0002", "Tursunova Munisa", "Tarjimonlik", 1, "Toshkent", 4.22))
cur.execute(sql, ("S0003", "Nazarova Sevara", "Xalqaro jurnalistika", 3, "Nukus", 4.6))
conn.commit()

err = None
try:
    cur.execute(sql, ("S0001", "Boshqa talaba", "Filologiya", 1, "Buxoro", 3.5))
except sqlite3.IntegrityError as e:
    err = str(e)

n = cur.execute("SELECT COUNT(*) FROM students").fetchone()[0]
print("Строк:", n, "| ошибка:", err)
conn.close()
`,
    },
    {
      id: "t2",
      title: "Массовая загрузка: executemany",
      setup: R`import os, sqlite3
if os.path.exists("university.db"):
    os.remove("university.db")
_c = sqlite3.connect("university.db")
_c.execute("""CREATE TABLE students (
    student_id TEXT PRIMARY KEY, full_name TEXT NOT NULL, gender TEXT,
    faculty TEXT, course INTEGER, city TEXT, gpa REAL, attendance REAL, english_level TEXT)""")
_c.commit()
_c.close()
del _c`,
      text: R`
В базе \`university.db\` уже есть **пустая** таблица \`students\` со столбцами
\`student_id, full_name, gender, faculty, course, city, gpa, attendance, english_level\`.

1. Прочитайте \`data/students.csv\` (pandas или модуль \`csv\`).
2. Подготовьте \`rows\` — список кортежей со значениями этих 9 столбцов **в том же порядке**.
3. Вставьте все строки **одним** вызовом \`executemany\` и выполните \`commit\`.
4. \`n\` — число строк в таблице после загрузки.
`,
      starter: R`import sqlite3
import pandas as pd

cols = ["student_id", "full_name", "gender", "faculty", "course", "city", "gpa", "attendance", "english_level"]
df = pd.read_csv("data/students.csv")

rows = ...

conn = sqlite3.connect("university.db")
# вставьте rows через executemany и сохраните изменения

n = conn.execute("SELECT COUNT(*) FROM students").fetchone()[0]
print("Загружено строк:", n)
conn.close()
`,
      check: R`
import sqlite3
import pandas as pd
s = pd.read_csv("data/students.csv")
r = var("rows")
ok(isinstance(r, (list, tuple)) and len(r) == len(s) and all(len(x) == 9 for x in list(r)[:5]), f"rows — список из {len(s)} кортежей по 9 значений")
c = sqlite3.connect("university.db")
cnt = c.execute("SELECT COUNT(*) FROM students").fetchone()[0]
sg = c.execute("SELECT ROUND(SUM(gpa), 2), SUM(course) FROM students").fetchone()
kl = c.execute("SELECT COUNT(*) FROM students WHERE faculty = 'Kompyuter lingvistikasi' AND city = 'Toshkent'").fetchone()[0]
c.close()
ok(cnt == len(s), f"В таблице {len(s)} строк (commit выполнен)")
ok(sg[0] is not None and abs(sg[0] - s["gpa"].sum()) < 0.01 and sg[1] == s["course"].sum(), "Числовые столбцы gpa и course загружены верно (порядок столбцов соблюдён)")
ok(kl == ((s["faculty"] == "Kompyuter lingvistikasi") & (s["city"] == "Toshkent")).sum(), "Текстовые столбцы faculty и city загружены верно")
ok(uses("executemany"), "Использован executemany")
ok(var("n") == len(s), f"n = {len(s)}")
`,
      hint: "`rows = list(df[cols].itertuples(index=False, name=None))`, затем `conn.executemany(\"INSERT INTO students VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\", rows)` и `conn.commit()`.",
      solution: R`import sqlite3
import pandas as pd

cols = ["student_id", "full_name", "gender", "faculty", "course", "city", "gpa", "attendance", "english_level"]
df = pd.read_csv("data/students.csv")

rows = list(df[cols].itertuples(index=False, name=None))

conn = sqlite3.connect("university.db")
placeholders = ", ".join(["?"] * len(cols))
conn.executemany(f"INSERT INTO students VALUES ({placeholders})", rows)
conn.commit()

n = conn.execute("SELECT COUNT(*) FROM students").fetchone()[0]
print("Загружено строк:", n)
conn.close()
`,
    },
    {
      id: "t3",
      title: "SELECT: WHERE, ORDER BY, LIMIT",
      setup: R`import sqlite3
import pandas as pd
conn = sqlite3.connect(":memory:")
pd.read_csv("data/students.csv").to_sql("students", conn, index=False)
cur = conn.cursor()`,
      text: R`
Соединение \`conn\` с таблицей \`students\` (все 12 столбцов из \`students.csv\`) и курсор \`cur\` уже готовы. Напишите запросы SQL:

- \`top5\` — список кортежей \`(full_name, gpa)\`: пять лучших по GPA студентов факультета **Kompyuter lingvistikasi**, по убыванию GPA (название факультета передайте параметром \`?\`);
- \`n_tash\` — сколько студентов из города **Toshkent** имеют уровень английского \`B2\` или \`C1\` (\`IN (...)\`), одним числом;
- \`by_course\` — список кортежей \`(course, средний gpa)\` по всем курсам, средний GPA округлите до 2 знаков (\`ROUND(AVG(gpa), 2)\`), сортировка по курсу.
`,
      starter: R`top5 = cur.execute("""
    SELECT ...
""").fetchall()

n_tash = ...

by_course = ...

print(top5)
print("Ташкент, B2/C1:", n_tash)
print(by_course)
`,
      check: R`
import pandas as pd
s = pd.read_csv("data/students.csv")
kl = s[s["faculty"] == "Kompyuter lingvistikasi"].sort_values("gpa", ascending=False).head(5)
t5 = var("top5", list)
ok(len(t5) == 5 and all(len(x) == 2 for x in t5), "top5 — список из 5 кортежей (full_name, gpa)")
if len(t5) == 5 and all(len(x) == 2 for x in t5):
    ok([round(x[1], 2) for x in t5] == [round(v, 2) for v in kl["gpa"]], "top5 отсортирован по убыванию GPA и содержит лучших студентов КЛ")
    ok(set(x[0] for x in t5) == set(kl["full_name"]), "В top5 — нужные студенты")
ok(uses("?"), "Название факультета передано параметром ?")
nt = int(((s["city"] == "Toshkent") & s["english_level"].isin(["B2", "C1"])).sum())
v = var("n_tash")
v = v[0] if isinstance(v, (tuple, list)) else v
ok(v == nt, f"n_tash = {nt}")
bc = var("by_course", list)
eb = s.groupby("course")["gpa"].mean()
ok([int(x[0]) for x in bc] == list(eb.index) and all(abs(x[1] - eb[x[0]]) < 0.006 for x in bc), "by_course — (курс, средний GPA) для курсов 1–4 по порядку")
`,
      hint: "`cur.execute(\"SELECT full_name, gpa FROM students WHERE faculty = ? ORDER BY gpa DESC LIMIT 5\", (\"Kompyuter lingvistikasi\",)).fetchall()`. Одно число: `.fetchone()[0]`.",
      solution: R`top5 = cur.execute("""
    SELECT full_name, gpa
    FROM students
    WHERE faculty = ?
    ORDER BY gpa DESC
    LIMIT 5
""", ("Kompyuter lingvistikasi",)).fetchall()

n_tash = cur.execute("""
    SELECT COUNT(*) FROM students
    WHERE city = 'Toshkent' AND english_level IN ('B2', 'C1')
""").fetchone()[0]

by_course = cur.execute("""
    SELECT course, ROUND(AVG(gpa), 2)
    FROM students
    GROUP BY course
    ORDER BY course
""").fetchall()

print(top5)
print("Ташкент, B2/C1:", n_tash)
print(by_course)
`,
    },
    {
      id: "t4",
      title: "GROUP BY и HAVING → DataFrame",
      setup: R`import sqlite3
import pandas as pd
conn = sqlite3.connect(":memory:")
pd.read_csv("data/students.csv").to_sql("students", conn, index=False)`,
      text: R`
С помощью \`pd.read_sql_query\` получите DataFrame \`city_stats\` со столбцами:

- \`city\`, \`n\` — число студентов, \`avg_gpa\` — средний GPA (округлите до 2 знаков);
- только города, где учится **не меньше 15** студентов (\`HAVING\`);
- сортировка по \`avg_gpa\` по убыванию.

Затем получите тот же результат средствами pandas (\`groupby\` + фильтр) в \`pandas_stats\` и убедитесь, что списки городов совпадают.
`,
      starter: R`sql = """
SELECT ...
"""
city_stats = pd.read_sql_query(sql, conn)

df = pd.read_sql_query("SELECT * FROM students", conn)
pandas_stats = ...

print(city_stats)
print("Совпадает:", list(city_stats["city"]) == list(pandas_stats.index))
`,
      check: R`
import pandas as pd
s = pd.read_csv("data/students.csv")
g = s.groupby("city").agg(n=("gpa", "size"), avg_gpa=("gpa", "mean"))
g = g[g["n"] >= 15].sort_values("avg_gpa", ascending=False)
cs = var("city_stats", pd.DataFrame)
ok(list(cs.columns) == ["city", "n", "avg_gpa"], "Столбцы city_stats: city, n, avg_gpa")
if list(cs.columns) == ["city", "n", "avg_gpa"]:
    ok(list(cs["city"]) == list(g.index), "Города с ≥ 15 студентами, по убыванию avg_gpa: " + ", ".join(g.index))
    ok(list(cs["n"]) == list(g["n"]) and all(abs(a - b) < 0.006 for a, b in zip(cs["avg_gpa"], g["avg_gpa"])), "Значения n и avg_gpa верны")
ok(uses("HAVING") or uses("having"), "В запросе использован HAVING")
ps = var("pandas_stats")
idx = list(ps.index) if not isinstance(ps, pd.DataFrame) or "city" not in ps.columns else list(ps["city"])
ok(idx == list(g.index), "pandas_stats — тот же результат средствами pandas (города в том же порядке)")
`,
      hint: "SQL: `SELECT city, COUNT(*) AS n, ROUND(AVG(gpa), 2) AS avg_gpa FROM students GROUP BY city HAVING COUNT(*) >= 15 ORDER BY avg_gpa DESC`. pandas: `df.groupby(\"city\").agg(n=(\"gpa\", \"size\"), avg_gpa=(\"gpa\", \"mean\"))`, затем фильтр `g[g[\"n\"] >= 15]` и `sort_values`.",
      solution: R`sql = """
SELECT city, COUNT(*) AS n, ROUND(AVG(gpa), 2) AS avg_gpa
FROM students
GROUP BY city
HAVING COUNT(*) >= 15
ORDER BY avg_gpa DESC
"""
city_stats = pd.read_sql_query(sql, conn)

df = pd.read_sql_query("SELECT * FROM students", conn)
g = df.groupby("city").agg(n=("gpa", "size"), avg_gpa=("gpa", "mean"))
pandas_stats = g[g["n"] >= 15].sort_values("avg_gpa", ascending=False)

print(city_stats)
print("Совпадает:", list(city_stats["city"]) == list(pandas_stats.index))
`,
    },
    {
      id: "t5",
      title: "JOIN: продажи и каталог книг",
      setup: R`import sqlite3
import pandas as pd
conn = sqlite3.connect(":memory:")
_x = pd.read_excel("data/sales.xlsx", sheet_name=None)
_x["kitoblar"].to_sql("books", conn, index=False)
_s = _x["2026"][["order_id", "date", "book", "qty", "price_uzs", "city"]].copy()
_s["date"] = _s["date"].dt.strftime("%Y-%m-%d")
_s.to_sql("sales", conn, index=False)
del _x, _s`,
      text: R`
В базе (\`conn\`) две таблицы:

- \`books\` — каталог: \`book, author, language, category, year, price_uzs\`;
- \`sales\` — продажи 2026 года: \`order_id, date, book, qty, price_uzs, city\` (категории здесь **нет**).

Напишите запросы с соединением таблиц:

1. \`by_category\` (DataFrame через \`pd.read_sql_query\`) — для каждой категории книг: \`category\`, \`qty\` (сумма проданных экземпляров) и \`revenue\` (сумма \`qty * price_uzs\` из таблицы продаж); сортировка по \`revenue\` по убыванию.
2. \`not_in_nukus\` — список названий книг из каталога, которые **ни разу** не покупали в городе \`Nukus\` (\`LEFT JOIN\` или \`NOT IN\`).
`,
      starter: R`by_category = pd.read_sql_query("""
    SELECT ...
    FROM sales AS s
    JOIN books AS b ON ...
""", conn)

not_in_nukus = ...

print(by_category)
print("Не покупали в Нукусе:", not_in_nukus)
`,
      check: R`
import pandas as pd
x = pd.read_excel("data/sales.xlsx", sheet_name=None)
s = x["2026"][["book", "qty", "price_uzs", "city"]].merge(x["kitoblar"][["book", "category"]], on="book")
s["revenue"] = s["qty"] * s["price_uzs"]
e = s.groupby("category")[["qty", "revenue"]].sum().sort_values("revenue", ascending=False)
bc = var("by_category", pd.DataFrame)
ok({"category", "qty", "revenue"} <= set(bc.columns), "Столбцы by_category: category, qty, revenue")
if {"category", "qty", "revenue"} <= set(bc.columns):
    ok(list(bc["category"]) == list(e.index), "Категории отсортированы по выручке: " + ", ".join(e.index))
    ok(list(bc["qty"]) == list(e["qty"]) and list(bc["revenue"]) == list(e["revenue"]), "Значения qty и revenue верны")
ok(uses("JOIN") or uses("join"), "Использован JOIN")
nn = sorted(set(x["kitoblar"]["book"]) - set(x["2026"].loc[x["2026"]["city"] == "Nukus", "book"]))
v = var("not_in_nukus")
v = list(v.iloc[:, 0]) if isinstance(v, pd.DataFrame) else [r[0] if isinstance(r, tuple) else r for r in v]
ok(sorted(v) == nn, f"not_in_nukus — {len(nn)} книги: " + ", ".join(nn))
`,
      hint: "Выручка: `SUM(s.qty * s.price_uzs) AS revenue`, группировка `GROUP BY b.category`. Книги без продаж в Нукусе: `SELECT b.book FROM books b LEFT JOIN sales s ON s.book = b.book AND s.city = 'Nukus' WHERE s.order_id IS NULL`.",
      solution: R`by_category = pd.read_sql_query("""
    SELECT b.category,
           SUM(s.qty) AS qty,
           SUM(s.qty * s.price_uzs) AS revenue
    FROM sales AS s
    JOIN books AS b ON s.book = b.book
    GROUP BY b.category
    ORDER BY revenue DESC
""", conn)

rows = conn.execute("""
    SELECT b.book
    FROM books AS b
    LEFT JOIN sales AS s ON s.book = b.book AND s.city = ?
    WHERE s.order_id IS NULL
""", ("Nukus",)).fetchall()
not_in_nukus = [r[0] for r in rows]

print(by_category)
print("Не покупали в Нукусе:", not_in_nukus)
`,
    },
    {
      id: "t6",
      title: "UPDATE и DELETE",
      setup: R`import os, sqlite3
import pandas as pd
if os.path.exists("university.db"):
    os.remove("university.db")
_c = sqlite3.connect("university.db")
pd.read_csv("data/students.csv").to_sql("students", _c, index=False)
_c.close()
del _c`,
      text: R`
База \`university.db\` содержит таблицу \`students\` (200 студентов). Выполните **по порядку**:

1. Студентам с посещаемостью \`attendance >= 95\` увеличьте GPA на 0.1, но не выше 5.0 (в SQLite: \`MIN(gpa + 0.1, 5.0)\`). Число изменённых строк сохраните в \`n_updated\` (\`cur.rowcount\`).
2. Удалите студентов **4 курса** с GPA ниже 3.5 (уже после повышения). Число удалённых строк — в \`n_deleted\`.
3. Сохраните изменения (\`commit\`) и запишите в \`n_left\` число оставшихся студентов.

Значения 95, 5.0, 4 и 3.5 передавайте через параметры \`?\`.
`,
      starter: R`import sqlite3

conn = sqlite3.connect("university.db")
cur = conn.cursor()

cur.execute("UPDATE students SET ... WHERE ...", (...))
n_updated = ...

cur.execute("DELETE FROM students WHERE ...", (...))
n_deleted = ...

n_left = ...
print("Изменено:", n_updated, "| удалено:", n_deleted, "| осталось:", n_left)
conn.close()
`,
      check: R`
import sqlite3
import pandas as pd
s = pd.read_csv("data/students.csv")
m = s["attendance"] >= 95
s.loc[m, "gpa"] = (s.loc[m, "gpa"] + 0.1).clip(upper=5.0)
d = (s["course"] == 4) & (s["gpa"] < 3.5)
left = s[~d]
ok(var("n_updated") == int(m.sum()), f"n_updated = {int(m.sum())}")
ok(var("n_deleted") == int(d.sum()), f"n_deleted = {int(d.sum())} (удаление после повышения GPA)")
c = sqlite3.connect("university.db")
db = pd.read_sql_query("SELECT student_id, gpa FROM students", c)
c.close()
ok(len(db) == len(left), f"В базе осталось {len(left)} студентов (изменения сохранены commit)")
mg = db.merge(left[["student_id", "gpa"]], on="student_id", suffixes=("", "_exp"))
ok(len(mg) == len(left) and (abs(mg["gpa"] - mg["gpa_exp"]) < 1e-9).all() and db["gpa"].max() <= 5.0, "GPA обновлён верно и нигде не превышает 5.0")
ok(var("n_left") == len(left), f"n_left = {len(left)}")
ok(uses("?"), "Значения переданы параметрами ?")
`,
      hint: "`cur.execute(\"UPDATE students SET gpa = MIN(gpa + 0.1, ?) WHERE attendance >= ?\", (5.0, 95))`, после него `n_updated = cur.rowcount`. Удаление: `DELETE FROM students WHERE course = ? AND gpa < ?`.",
      solution: R`import sqlite3

conn = sqlite3.connect("university.db")
cur = conn.cursor()

cur.execute("UPDATE students SET gpa = MIN(gpa + 0.1, ?) WHERE attendance >= ?", (5.0, 95))
n_updated = cur.rowcount

cur.execute("DELETE FROM students WHERE course = ? AND gpa < ?", (4, 3.5))
n_deleted = cur.rowcount

conn.commit()
n_left = cur.execute("SELECT COUNT(*) FROM students").fetchone()[0]
print("Изменено:", n_updated, "| удалено:", n_deleted, "| осталось:", n_left)
conn.close()
`,
    },
    {
      id: "t7",
      title: "Поток постов в SQL: to_sql и индекс",
      text: R`
Загрузим «большие» данные в базу и ускорим поиск индексом.

1. Прочитайте \`data/tweets_stream.csv\` и запишите его в таблицу \`posts\` базы \`conn = sqlite3.connect(":memory:")\` методом \`to_sql\` (с \`chunksize=500\` — запись порциями).
2. Создайте индекс \`idx_platform\` по столбцу \`platform\`.
3. \`plan\` — результат \`EXPLAIN QUERY PLAN\` для запроса \`SELECT COUNT(*) FROM posts WHERE platform = 'telegram'\` (\`fetchall()\`); \`uses_index\` — \`True\`, если в плане упоминается \`idx_platform\`.
4. \`per_platform\` (DataFrame) — \`platform\`, \`n\` (число постов), \`avg_likes\` (средние лайки, 1 знак) по убыванию \`n\`.
5. \`per_minute\` (DataFrame) — \`minute\` (часы и минуты \`"10:05"\` — функция \`substr(timestamp, 12, 5)\`) и \`n\`, по возрастанию минуты.
`,
      starter: R`import sqlite3
import pandas as pd

tweets = pd.read_csv("data/tweets_stream.csv")
conn = sqlite3.connect(":memory:")
# запишите tweets в таблицу posts

# создайте индекс idx_platform

plan = ...
uses_index = ...

per_platform = ...
per_minute = ...

print(plan, uses_index)
print(per_platform)
per_minute.head()
`,
      check: R`
import pandas as pd
t = pd.read_csv("data/tweets_stream.csv")
conn = var("conn")
cnt = conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0] if conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").fetchone() else 0
ok(cnt == len(t), f"В таблице posts {len(t)} строк")
ok(uses("chunksize"), "to_sql вызван с chunksize")
idx = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_platform'").fetchone()
ok(idx is not None, "Создан индекс idx_platform")
ok(isinstance(var("plan"), list) and var("uses_index") is True, "План запроса получен, uses_index = True")
pp = var("per_platform", pd.DataFrame)
ep = t.groupby("platform").agg(n=("likes", "size"), avg_likes=("likes", "mean")).sort_values("n", ascending=False)
ok(list(pp.columns[:3]) == ["platform", "n", "avg_likes"] and list(pp["platform"]) == list(ep.index), "per_platform: platform, n, avg_likes по убыванию n")
if "avg_likes" in pp.columns and "n" in pp.columns:
    ok(list(pp["n"]) == list(ep["n"]) and all(abs(a - b) < 0.06 for a, b in zip(pp["avg_likes"], ep["avg_likes"])), "Значения n и avg_likes верны")
pm = var("per_minute", pd.DataFrame)
em = t["timestamp"].str[11:16].value_counts().sort_index()
ok(list(pm.columns[:2]) == ["minute", "n"] and list(pm["minute"]) == list(em.index) and list(pm["n"]) == list(em), f"per_minute: {len(em)} минут по порядку, сумма {len(t)}")
`,
      hint: "`tweets.to_sql(\"posts\", conn, index=False, chunksize=500)`; `conn.execute(\"CREATE INDEX idx_platform ON posts(platform)\")`; `uses_index = any(\"idx_platform\" in str(row) for row in plan)`. Минута: `SELECT substr(timestamp, 12, 5) AS minute, COUNT(*) AS n FROM posts GROUP BY minute ORDER BY minute`.",
      solution: R`import sqlite3
import pandas as pd

tweets = pd.read_csv("data/tweets_stream.csv")
conn = sqlite3.connect(":memory:")
tweets.to_sql("posts", conn, index=False, chunksize=500)

conn.execute("CREATE INDEX idx_platform ON posts(platform)")

plan = conn.execute("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM posts WHERE platform = 'telegram'").fetchall()
uses_index = any("idx_platform" in str(row) for row in plan)

per_platform = pd.read_sql_query("""
    SELECT platform, COUNT(*) AS n, ROUND(AVG(likes), 1) AS avg_likes
    FROM posts
    GROUP BY platform
    ORDER BY n DESC
""", conn)
per_minute = pd.read_sql_query("""
    SELECT substr(timestamp, 12, 5) AS minute, COUNT(*) AS n
    FROM posts
    GROUP BY minute
    ORDER BY minute
""", conn)

print(plan, uses_index)
print(per_platform)
per_minute.head()
`,
    },
  ],
  quiz: [
    { q: "Что гарантирует ограничение PRIMARY KEY?", options: ["Уникальность и наличие значения в каждой строке", "Что столбец числовой", "Автоматическую сортировку", "Шифрование данных"], answer: 0, explain: "Первичный ключ однозначно идентифицирует строку: повторная вставка того же значения вызывает IntegrityError." },
    { q: "Чем HAVING отличается от WHERE?", options: ["Ничем", "WHERE фильтрует строки до группировки, HAVING — группы после GROUP BY", "HAVING работает только с текстом", "WHERE нельзя использовать с JOIN"], answer: 1 },
    { q: "Почему значения в запрос передают через `?`, а не через f-строку?", options: ["Так быстрее печатать", "f-строки не работают в Python", "Защита от SQL-инъекций и ошибок с кавычками (например, Farg'ona)", "Иначе нельзя сделать commit"], answer: 2, explain: "Параметры экранируются драйвером: апостроф в `Farg'ona` не сломает запрос, а вредоносный ввод не выполнится как SQL." },
    { q: "Что произойдёт, если после INSERT не вызвать `conn.commit()` и закрыть соединение?", options: ["Данные сохранятся", "Появится ошибка синтаксиса", "Таблица удалится", "Изменения транзакции будут потеряны"], answer: 3 },
    { q: "Какой JOIN вернёт все книги каталога, даже если у них нет продаж?", options: ["INNER JOIN", "sales LEFT JOIN books", "books LEFT JOIN sales", "CROSS JOIN"], answer: 2, explain: "LEFT JOIN сохраняет все строки левой таблицы; у книг без продаж столбцы sales будут NULL." },
    { q: "Как сохранить DataFrame `df` в таблицу SQLite `students`?", options: ["`df.to_sql(\"students\", conn, index=False)`", "`pd.read_sql_query(df, conn)`", "`conn.save(df)`", "`df.to_csv(\"students.db\")`"], answer: 0 },
  ],
  realEnv: R`
## Как выполнить работу в реальной среде

**Jupyter / Colab.** Модуль \`sqlite3\` уже есть в Python, код заданий работает без изменений. Файл \`university.db\` появится рядом с блокнотом.

**Графический просмотр базы.** Установите бесплатную программу [DB Browser for SQLite](https://sqlitebrowser.org) и откройте в ней \`university.db\`: видны таблицы, их схема, можно выполнять SQL-запросы.

**Магия SQL в Jupyter.** Расширение \`ipython-sql\` позволяет писать запросы прямо в ячейке:

\`\`\`python
!pip install ipython-sql
%load_ext sql
%sql sqlite:///university.db
%sql SELECT city, COUNT(*) FROM students GROUP BY city
\`\`\`

**Серверные СУБД.** Для многопользовательских систем используют PostgreSQL или MySQL. Подключение из pandas через SQLAlchemy:

\`\`\`python
from sqlalchemy import create_engine
engine = create_engine("postgresql://user:password@localhost:5432/university")
df.to_sql("students", engine, if_exists="replace", index=False)
pd.read_sql_query("SELECT * FROM students LIMIT 5", engine)
\`\`\`

> [!TIP] SQL в мире Big Data
> Тот же SQL работает в распределённых системах: **Apache Hive** и **Spark SQL** выполняют запросы \`SELECT … GROUP BY\` над терабайтами данных в HDFS. В лабораторных работах по Spark вы увидите знакомые конструкции.
`,
  homework: R`
## Самостоятельная работа: «Информационная безопасность и конфиденциальность данных в технологиях Big Data»

1. Покажите на примере, как f-строка в SQL приводит к инъекции: функция \`find_student(name)\` с запросом \`f"SELECT * FROM students WHERE full_name = '{name}'"\` и ввод \`' OR '1'='1\`. Перепишите функцию безопасно с параметром \`?\`.
2. Создайте **представление** (\`CREATE VIEW\`) \`students_public\`, в котором нет ФИО и \`student_id\`, а только факультет, курс, город и GPA. Объясните, как представления помогают разграничивать доступ к персональным данным.
3. Сравните скорость запроса с индексом и без него на таблице из 1 000 000 строк (сгенерируйте её с помощью \`numpy\`), используя \`time.perf_counter()\`.
`,
});
