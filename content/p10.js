BDT.register({
  id: "p10",
  kind: "practice",
  num: 10,
  title: "Создание объектов Spark DataFrame и выполнение основных операций в Apache Spark",
  hours: 2,
  env: ["python", "spark"],
  goals: [
    "Создавать Spark DataFrame из списков, словарей, объектов `Row`, pandas и с явной схемой `StructType`",
    "Выбирать и фильтровать данные: `select`, `alias`, `filter`/`where` с условиями `&`, `|`, `~`",
    "Добавлять, переименовывать и удалять столбцы: `withColumn`, `when`/`otherwise`, `lit`, `withColumnRenamed`, `drop`",
    "Группировать, сортировать и соединять таблицы, получать результаты в Python: `groupBy().agg`, `join`, `collect`, `first`",
  ],
  theory: R`
## Способы создать DataFrame

Spark DataFrame — распределённая таблица со **схемой**: у каждого столбца есть имя и тип. Создать её можно из обычных объектов Python:

| Источник | Пример | Имена столбцов |
|---|---|---|
| список кортежей + имена | \`spark.createDataFrame([("Aziza", 3)], ["name", "course"])\` | из списка имён |
| список словарей | \`spark.createDataFrame([{"city": "Toshkent", "population": 3040000}])\` | ключи словаря |
| объекты \`Row\` | \`spark.createDataFrame([Row(title="O'tkan kunlar", year=1926)])\` | поля Row |
| схема \`StructType\` | \`spark.createDataFrame(rows, schema)\` | из схемы, типы строго заданы |
| DDL-строка | \`spark.createDataFrame(rows, "id INT, name STRING")\` | из строки |
| pandas DataFrame | \`spark.createDataFrame(pdf)\` | столбцы pandas |
| файл | \`spark.read.csv(...)\`, \`spark.read.json(...)\` | заголовок / ключи JSON |

Если схема не задана, Spark **выводит типы** по значениям: \`int\` Python → \`bigint\` (LongType), \`float\` → \`double\`, \`str\` → \`string\`, \`datetime.date\` → \`date\`.

\`\`\`python
from pyspark.sql.types import StructType, StructField, IntegerType, StringType, DoubleType

schema = StructType([
    StructField("id", IntegerType(), nullable=False),   # NOT NULL
    StructField("name", StringType(), True),
    StructField("gpa", DoubleType(), True),
])
df = spark.createDataFrame([(1, "Aziza Karimova", 4.62)], schema)
df.printSchema()
\`\`\`

## Обращение к столбцам

Четыре равноценные записи: \`"gpa"\`, \`F.col("gpa")\`, \`df.gpa\`, \`df["gpa"]\`. Строку можно передавать в \`select\`, \`groupBy\`, \`orderBy\`; для выражений (арифметика, сравнения) нужен объект **Column** — \`F.col("gpa") * 25\`.

## Основные операции

| Операция | Пример |
|---|---|
| выбор и переименование | \`df.select("name", F.col("gpa").alias("ball"))\` |
| фильтр | \`df.filter(F.col("gpa") >= 4)\` или \`df.where("gpa >= 4")\` |
| новый столбец | \`df.withColumn("gpa100", F.col("gpa") / 5 * 100)\` |
| константа | \`df.withColumn("year", F.lit("2025/2026"))\` |
| условие CASE WHEN | \`F.when(F.col("gpa") >= 4.5, "a'lo").otherwise("yaxshi")\` |
| переименование | \`df.withColumnRenamed("name", "full_name")\` |
| удаление столбцов | \`df.drop("city")\` |
| уникальные строки | \`df.select("faculty").distinct()\` |
| сортировка | \`df.orderBy(F.desc("gpa"), "name")\` |
| первые N строк | \`df.limit(3)\` |
| группировка | \`df.groupBy("faculty").agg(F.count("*").alias("n"), F.avg("gpa"))\` |
| соединение | \`students.join(faculties, on="faculty_id", how="left")\` |

> [!WARNING] Логические операции над столбцами
> В условиях используют \`&\` (и), \`|\` (или), \`~\` (не), а **каждое сравнение берут в скобки**:
> \`df.filter((F.col("gpa") >= 4) & (F.col("course") == 3))\`.
> Слова \`and\`, \`or\`, \`not\` со столбцами не работают — Python попытается превратить Column в True/False и выдаст ошибку.

## Неизменяемость

DataFrame **неизменяем**: каждая трансформация возвращает **новый** DataFrame, а исходный остаётся прежним. Поэтому результат нужно присвоить переменной, а операции удобно записывать цепочкой:

\`\`\`python
report = (students
          .withColumn("gpa100", F.round(F.col("gpa") / 5 * 100, 1))
          .withColumnRenamed("name", "full_name")
          .drop("city")
          .orderBy(F.desc("gpa")))
\`\`\`

## Соединения (join)

| how | Что остаётся |
|---|---|
| \`inner\` (по умолчанию) | только пары с совпадающим ключом |
| \`left\` | все строки левой таблицы; нет пары → \`null\` |
| \`right\` | все строки правой таблицы |
| \`outer\` / \`full\` | все строки обеих таблиц |
| \`left_anti\` | строки левой таблицы, у которых **нет** пары |

## Из Spark в Python

Действия возвращают данные в драйвер:

- \`df.collect()\` — **список** объектов \`Row\` (осторожно с большими таблицами — всё попадёт в память драйвера!);
- \`df.first()\` / \`df.head()\` — одна строка \`Row\`; \`df.take(5)\` — список из 5 строк;
- \`df.count()\` — число строк;
- \`df.toPandas()\` — pandas DataFrame (тоже только для небольших результатов).

Поле \`Row\` читается по имени (\`row["name"]\` или \`row.name\`) или по номеру (\`row[0]\`); \`row.asDict()\` превращает строку в словарь.

\`\`\`python
best = df.orderBy(F.desc("gpa")).first()
print(best["name"], best.gpa)
names = [r["name"] for r in df.select("name").collect()]
\`\`\`

> [!NOTE] Тренажёр
> Задания выполняются в учебном эмуляторе PySpark (тот же API, что в PySpark 3.5). Обратите внимание: в настоящем Spark DataFrame из **словарей** получает столбцы в алфавитном порядке ключей.
`,
  tasks: [
    {
      id: "t1",
      title: "DataFrame из списка кортежей",
      text: R`
Создайте DataFrame \`students\` из списка кортежей \`data\` и списка имён столбцов: \`name\`, \`faculty\`, \`course\`, \`gpa\`.

Выведите таблицу (\`show()\`) и схему (\`printSchema()\`), сохраните число строк в \`n\`. Посмотрите, какие типы Spark выбрал для \`course\` и \`gpa\`.
`,
      starter: R`from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("UzBigData-P10").getOrCreate()

data = [
    ("Aziza Karimova", "Kompyuter lingvistikasi", 3, 4.62),
    ("Jasur Toshmatov", "Tarjimonlik", 2, 3.85),
    ("Malika Rahimova", "Filologiya", 3, 4.10),
    ("Otabek Saidov", "Kompyuter lingvistikasi", 1, 3.40),
    ("Dilnoza Yusupova", "Xalqaro jurnalistika", 4, 4.95),
    ("Sardor Aliyev", "Tarjimonlik", 3, 2.90),
]
columns = ...     # TODO: список имён столбцов

students = ...    # TODO: spark.createDataFrame(...)
students.show()
students.printSchema()

n = ...
print("Студентов:", n)
`,
      check: R`
from pyspark.sql import DataFrame
s = var("students", DataFrame)
ok(s.columns == ["name", "faculty", "course", "gpa"], "Столбцы students: name, faculty, course, gpa")
ok(s.count() == 6, "В students 6 строк")
t = dict(s.dtypes)
ok(t.get("course") == "bigint" and t.get("gpa") == "double", "Типы выведены автоматически: course — bigint, gpa — double")
ok(var("n") == 6, "n = 6 (students.count())")
ok("root" in out and "Aziza Karimova" in out, "Выведены таблица (show) и схема (printSchema)")
`,
      hint: "`columns = [\"name\", \"faculty\", \"course\", \"gpa\"]`, `students = spark.createDataFrame(data, columns)`, `n = students.count()`.",
      solution: R`from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("UzBigData-P10").getOrCreate()

data = [
    ("Aziza Karimova", "Kompyuter lingvistikasi", 3, 4.62),
    ("Jasur Toshmatov", "Tarjimonlik", 2, 3.85),
    ("Malika Rahimova", "Filologiya", 3, 4.10),
    ("Otabek Saidov", "Kompyuter lingvistikasi", 1, 3.40),
    ("Dilnoza Yusupova", "Xalqaro jurnalistika", 4, 4.95),
    ("Sardor Aliyev", "Tarjimonlik", 3, 2.90),
]
columns = ["name", "faculty", "course", "gpa"]

students = spark.createDataFrame(data, columns)
students.show()
students.printSchema()

n = students.count()
print("Студентов:", n)
`,
    },
    {
      id: "t2",
      title: "Из словарей, Row и pandas",
      text: R`
Создайте три DataFrame разными способами:

1. \`df_dict\` — из списка словарей \`cities\` (города Узбекистана).
2. \`df_row\` — из списка объектов \`Row\` \`books\` (узбекская классика). \`Book = Row("title", "author", "year")\` — это «шаблон» строки с именованными полями.
3. \`df_pd\` — из pandas DataFrame \`pdf\` (частоты слов).

Для каждого выведите \`show()\` и список типов \`dtypes\`.
`,
      starter: R`import pandas as pd
from pyspark.sql import SparkSession, Row

spark = SparkSession.builder.getOrCreate()

cities = [
    {"city": "Toshkent", "region": "Toshkent shahri", "population": 3040000},
    {"city": "Samarqand", "region": "Samarqand", "population": 573000},
    {"city": "Buxoro", "region": "Buxoro", "population": 285000},
    {"city": "Nukus", "region": "Qoraqalpog'iston", "population": 330000},
]
df_dict = ...

Book = Row("title", "author", "year")
books = [
    Book("O'tkan kunlar", "Abdulla Qodiriy", 1926),
    Book("Mehrobdan chayon", "Abdulla Qodiriy", 1929),
    Book("Kecha va kunduz", "Cho'lpon", 1936),
]
df_row = ...

pdf = pd.DataFrame({"word": ["kitob", "maktab", "talaba", "ilm"], "freq": [42, 35, 28, 19]})
df_pd = ...

for df in [df_dict, df_row, df_pd]:
    df.show()
    print(df.dtypes)
`,
      check: R`
from pyspark.sql import DataFrame
d = var("df_dict", DataFrame)
ok(set(d.columns) == {"city", "region", "population"} and d.count() == 4, "df_dict: 4 города, столбцы city, region, population")
ok(dict(d.dtypes).get("population") == "bigint", "population имеет тип bigint")
r = var("df_row", DataFrame)
ok(r.columns == ["title", "author", "year"] and r.count() == 3, "df_row: 3 книги, столбцы title, author, year")
ok("O'tkan kunlar" in [x["title"] for x in r.collect()], "В df_row есть книга «O'tkan kunlar»")
p = var("df_pd", DataFrame)
ok(p.columns == ["word", "freq"] and p.count() == 4, "df_pd: 4 строки, столбцы word и freq")
ok(uses("createDataFrame(cities") or uses("createDataFrame(data=cities"), "df_dict создан из списка cities")
`,
      hint: "Во всех трёх случаях подходит `spark.createDataFrame(...)`: `spark.createDataFrame(cities)`, `spark.createDataFrame(books)`, `spark.createDataFrame(pdf)`.",
      solution: R`import pandas as pd
from pyspark.sql import SparkSession, Row

spark = SparkSession.builder.getOrCreate()

cities = [
    {"city": "Toshkent", "region": "Toshkent shahri", "population": 3040000},
    {"city": "Samarqand", "region": "Samarqand", "population": 573000},
    {"city": "Buxoro", "region": "Buxoro", "population": 285000},
    {"city": "Nukus", "region": "Qoraqalpog'iston", "population": 330000},
]
df_dict = spark.createDataFrame(cities)

Book = Row("title", "author", "year")
books = [
    Book("O'tkan kunlar", "Abdulla Qodiriy", 1926),
    Book("Mehrobdan chayon", "Abdulla Qodiriy", 1929),
    Book("Kecha va kunduz", "Cho'lpon", 1936),
]
df_row = spark.createDataFrame(books)

pdf = pd.DataFrame({"word": ["kitob", "maktab", "talaba", "ilm"], "freq": [42, 35, 28, 19]})
df_pd = spark.createDataFrame(pdf)

for df in [df_dict, df_row, df_pd]:
    df.show()
    print(df.dtypes)
`,
    },
    {
      id: "t3",
      title: "Явная схема: StructType и DDL",
      text: R`
Когда типы важны (например, \`id\` должен быть 32-битным \`int\` без пропусков, а дата — типом \`date\`), схему задают явно.

1. Опишите \`schema\` через \`StructType\`: \`id\` — \`IntegerType\`, **not null** (\`nullable=False\`); \`name\` — \`StringType\`; \`birth_date\` — \`DateType\`; \`gpa\` — \`DoubleType\`.
2. Создайте \`df\` из списка \`rows\` с этой схемой и выведите \`printSchema()\`.
3. Создайте такой же \`df_ddl\`, задав схему DDL-строкой \`"id INT, name STRING, birth_date DATE, gpa DOUBLE"\`.
`,
      starter: R`import datetime as dt
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, IntegerType, StringType, DateType, DoubleType

spark = SparkSession.builder.getOrCreate()

rows = [
    (1, "Aziza Karimova", dt.date(2005, 3, 14), 4.62),
    (2, "Jasur Toshmatov", dt.date(2006, 7, 2), 3.85),
    (3, "Malika Rahimova", dt.date(2005, 11, 23), 4.10),
    (4, "Otabek Saidov", dt.date(2007, 1, 9), 3.40),
    (5, "Dilnoza Yusupova", dt.date(2004, 5, 30), 4.95),
]

schema = StructType([
    # TODO: 4 поля StructField(имя, тип, nullable)
])
df = ...
# df.printSchema()

df_ddl = ...
`,
      check: R`
from pyspark.sql import DataFrame
from pyspark.sql.types import StructType
sch = var("schema", StructType)
df = var("df", DataFrame)
ok(df.dtypes == [("id", "int"), ("name", "string"), ("birth_date", "date"), ("gpa", "double")], "Типы df: id int, name string, birth_date date, gpa double")
ok(df.count() == 5, "В df 5 строк")
ok(df.schema["id"].nullable is False if "id" in df.columns else False, "Поле id объявлено как not null (nullable=False)")
ok("birth_date: date" in out, "Схема выведена методом printSchema()")
d2 = var("df_ddl", DataFrame)
ok(d2.dtypes == [("id", "int"), ("name", "string"), ("birth_date", "date"), ("gpa", "double")] and d2.count() == 5, "df_ddl создан по DDL-строке с теми же типами")
`,
      hint: "`StructField(\"id\", IntegerType(), False)`, `StructField(\"birth_date\", DateType(), True)`; `df = spark.createDataFrame(rows, schema)`, `df_ddl = spark.createDataFrame(rows, \"id INT, name STRING, birth_date DATE, gpa DOUBLE\")`.",
      solution: R`import datetime as dt
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, IntegerType, StringType, DateType, DoubleType

spark = SparkSession.builder.getOrCreate()

rows = [
    (1, "Aziza Karimova", dt.date(2005, 3, 14), 4.62),
    (2, "Jasur Toshmatov", dt.date(2006, 7, 2), 3.85),
    (3, "Malika Rahimova", dt.date(2005, 11, 23), 4.10),
    (4, "Otabek Saidov", dt.date(2007, 1, 9), 3.40),
    (5, "Dilnoza Yusupova", dt.date(2004, 5, 30), 4.95),
]

schema = StructType([
    StructField("id", IntegerType(), False),
    StructField("name", StringType(), True),
    StructField("birth_date", DateType(), True),
    StructField("gpa", DoubleType(), True),
])
df = spark.createDataFrame(rows, schema)
df.printSchema()
df.show()

df_ddl = spark.createDataFrame(rows, "id INT, name STRING, birth_date DATE, gpa DOUBLE")
df_ddl.printSchema()
`,
    },
    {
      id: "t4",
      title: "select и filter: выбор строк и столбцов",
      setup: R`from pyspark.sql import SparkSession, functions as F
spark = SparkSession.builder.getOrCreate()
students = spark.createDataFrame([
    (1, "Aziza Karimova", "Kompyuter lingvistikasi", 3, 4.62, "Toshkent"),
    (2, "Jasur Toshmatov", "Tarjimonlik", 2, 3.85, "Samarqand"),
    (3, "Malika Rahimova", "Filologiya", 3, 4.10, "Buxoro"),
    (4, "Otabek Saidov", "Kompyuter lingvistikasi", 1, 3.40, "Andijon"),
    (5, "Dilnoza Yusupova", "Xalqaro jurnalistika", 4, 4.95, "Toshkent"),
    (6, "Sardor Aliyev", "Tarjimonlik", 3, 2.90, "Namangan"),
    (7, "Nodira Ergasheva", "Filologiya", 2, 4.48, "Samarqand"),
    (8, "Bekzod Nazarov", "Kompyuter lingvistikasi", 4, 3.95, "Farg'ona"),
    (9, "Gulnoza Qodirova", "Xalqaro jurnalistika", 1, 4.20, "Toshkent"),
    (10, "Ulug'bek Mirzayev", "Kompyuter lingvistikasi", 2, 4.75, "Xorazm"),
], ["id", "name", "faculty", "course", "gpa", "city"])`,
      text: R`
DataFrame \`students\` (10 студентов: \`id, name, faculty, course, gpa, city\`) уже создан в подготовительном коде.

1. \`names\` — только два столбца: \`name\` под новым именем **\`talaba\`** (\`alias\`) и \`faculty\`.
2. \`excellent\` — отличники: \`gpa\` не ниже 4.5 (\`filter\`).
3. \`kl_senior\` — студенты факультета \`Kompyuter lingvistikasi\` **и** со 2-го курса и старше (\`where\`, оператор \`&\`).
4. \`tash_sam\` — студенты из Ташкента **или** Самарканда (оператор \`|\`, города: \`Toshkent\`, \`Samarqand\`).

Выведите каждый результат методом \`show()\`.
`,
      starter: R`from pyspark.sql import functions as F

names = students.select(...)
excellent = ...
kl_senior = ...
tash_sam = ...

for df in [names, excellent, kl_senior, tash_sam]:
    df.show()
`,
      check: R`
from pyspark.sql import DataFrame
nm = var("names", DataFrame)
ok(nm.columns == ["talaba", "faculty"], "В names столбцы talaba (переименованный name) и faculty")
ok(nm.count() == 10, "names содержит всех 10 студентов")
ids = lambda name: sorted(r["id"] for r in var(name, DataFrame).collect())
ok(ids("excellent") == [1, 5, 10], "excellent: студенты с gpa >= 4.5 (id 1, 5, 10)")
ok(ids("kl_senior") == [1, 8, 10], "kl_senior: Kompyuter lingvistikasi и курс >= 2 (id 1, 8, 10)")
ok(ids("tash_sam") == [1, 2, 5, 7, 9], "tash_sam: студенты из Toshkent или Samarqand (id 1, 2, 5, 7, 9)")
ok(uses("&") and uses("|"), "В условиях использованы операторы & и |")
`,
      hint: "`students.select(F.col(\"name\").alias(\"talaba\"), \"faculty\")`; `students.where((F.col(\"faculty\") == \"Kompyuter lingvistikasi\") & (F.col(\"course\") >= 2))` — каждое сравнение в скобках.",
      solution: R`from pyspark.sql import functions as F

names = students.select(F.col("name").alias("talaba"), "faculty")
excellent = students.filter(F.col("gpa") >= 4.5)
kl_senior = students.where((F.col("faculty") == "Kompyuter lingvistikasi") & (F.col("course") >= 2))
tash_sam = students.filter((F.col("city") == "Toshkent") | (F.col("city") == "Samarqand"))

for df in [names, excellent, kl_senior, tash_sam]:
    df.show()
`,
    },
    {
      id: "t5",
      title: "Новые столбцы: withColumn, when, lit",
      setup: R`from pyspark.sql import SparkSession, functions as F
spark = SparkSession.builder.getOrCreate()
students = spark.createDataFrame([
    (1, "Aziza Karimova", "Kompyuter lingvistikasi", 3, 4.62, "Toshkent"),
    (2, "Jasur Toshmatov", "Tarjimonlik", 2, 3.85, "Samarqand"),
    (3, "Malika Rahimova", "Filologiya", 3, 4.10, "Buxoro"),
    (4, "Otabek Saidov", "Kompyuter lingvistikasi", 1, 3.40, "Andijon"),
    (5, "Dilnoza Yusupova", "Xalqaro jurnalistika", 4, 4.95, "Toshkent"),
    (6, "Sardor Aliyev", "Tarjimonlik", 3, 2.90, "Namangan"),
    (7, "Nodira Ergasheva", "Filologiya", 2, 4.48, "Samarqand"),
    (8, "Bekzod Nazarov", "Kompyuter lingvistikasi", 4, 3.95, "Farg'ona"),
    (9, "Gulnoza Qodirova", "Xalqaro jurnalistika", 1, 4.20, "Toshkent"),
    (10, "Ulug'bek Mirzayev", "Kompyuter lingvistikasi", 2, 4.75, "Xorazm"),
], ["id", "name", "faculty", "course", "gpa", "city"])`,
      text: R`
Подготовьте из \`students\` ведомость стипендий \`report\` — одной цепочкой преобразований:

1. \`gpa_100\` — балл по 100-балльной шкале: \`gpa / 5 * 100\`, округлённый до 1 знака (\`F.round\`).
2. \`stipend\` — стипендия в сумах: при \`gpa >= 4.5\` — **1 500 000**, при \`gpa >= 4.0\` — **1 000 000**, иначе **0** (\`F.when(...).when(...).otherwise(...)\`).
3. \`academic_year\` — одинаковое для всех значение \`"2025/2026"\` (\`F.lit\`).
4. Переименуйте \`name\` в \`full_name\` и удалите столбец \`city\`.

Выведите \`report.show()\`.
`,
      starter: R`from pyspark.sql import functions as F

report = (students
          .withColumn("gpa_100", ...)
          # TODO: stipend, academic_year, переименование, удаление city
         )
report.show()
`,
      check: R`
from pyspark.sql import DataFrame
rep = var("report", DataFrame)
cols = set(rep.columns)
ok({"id", "full_name", "faculty", "course", "gpa", "gpa_100", "stipend", "academic_year"} <= cols, "В report есть столбцы full_name, gpa_100, stipend, academic_year")
ok("name" not in cols and "city" not in cols, "Столбец name переименован, столбец city удалён")
if {"id", "gpa_100", "stipend", "academic_year"} <= cols:
    rows = {r["id"]: r for r in rep.collect()}
    ok(rep.count() == 10, "В report 10 строк")
    ok(rows.get(1) is not None and abs(rows[1]["gpa_100"] - 92.4) < 1e-6 and abs(rows[5]["gpa_100"] - 99.0) < 1e-6, "gpa_100 = round(gpa / 5 * 100, 1): у id 1 — 92.4, у id 5 — 99.0")
    exp = {1: 1500000, 2: 0, 3: 1000000, 4: 0, 5: 1500000, 6: 0, 7: 1000000, 8: 0, 9: 1000000, 10: 1500000}
    ok(all(rows.get(k) is not None and rows[k]["stipend"] == v for k, v in exp.items()), "stipend: 1 500 000 (gpa >= 4.5), 1 000 000 (gpa >= 4.0), иначе 0")
    ok(all(r["academic_year"] == "2025/2026" for r in rows.values()), "academic_year = \"2025/2026\" во всех строках")
ok(uses("when") and uses("otherwise") and uses("lit("), "Использованы F.when/otherwise и F.lit")
`,
      hint: "`.withColumn(\"stipend\", F.when(F.col(\"gpa\") >= 4.5, 1500000).when(F.col(\"gpa\") >= 4.0, 1000000).otherwise(0))`, `.withColumn(\"academic_year\", F.lit(\"2025/2026\"))`, `.withColumnRenamed(\"name\", \"full_name\").drop(\"city\")`.",
      solution: R`from pyspark.sql import functions as F

report = (students
          .withColumn("gpa_100", F.round(F.col("gpa") / 5 * 100, 1))
          .withColumn("stipend", F.when(F.col("gpa") >= 4.5, 1500000)
                                  .when(F.col("gpa") >= 4.0, 1000000)
                                  .otherwise(0))
          .withColumn("academic_year", F.lit("2025/2026"))
          .withColumnRenamed("name", "full_name")
          .drop("city"))
report.show()
`,
    },
    {
      id: "t6",
      title: "distinct, orderBy и groupBy().agg",
      setup: R`from pyspark.sql import SparkSession, functions as F
spark = SparkSession.builder.getOrCreate()
students = spark.createDataFrame([
    (1, "Aziza Karimova", "Kompyuter lingvistikasi", 3, 4.62, "Toshkent"),
    (2, "Jasur Toshmatov", "Tarjimonlik", 2, 3.85, "Samarqand"),
    (3, "Malika Rahimova", "Filologiya", 3, 4.10, "Buxoro"),
    (4, "Otabek Saidov", "Kompyuter lingvistikasi", 1, 3.40, "Andijon"),
    (5, "Dilnoza Yusupova", "Xalqaro jurnalistika", 4, 4.95, "Toshkent"),
    (6, "Sardor Aliyev", "Tarjimonlik", 3, 2.90, "Namangan"),
    (7, "Nodira Ergasheva", "Filologiya", 2, 4.48, "Samarqand"),
    (8, "Bekzod Nazarov", "Kompyuter lingvistikasi", 4, 3.95, "Farg'ona"),
    (9, "Gulnoza Qodirova", "Xalqaro jurnalistika", 1, 4.20, "Toshkent"),
    (10, "Ulug'bek Mirzayev", "Kompyuter lingvistikasi", 2, 4.75, "Xorazm"),
], ["id", "name", "faculty", "course", "gpa", "city"])`,
      text: R`
1. \`faculties\` — список **различных** факультетов (один столбец \`faculty\`, \`distinct\`).
2. \`n_cities\` — **число** различных городов (целое число Python).
3. \`top3\` — 3 студента с наибольшим GPA (\`orderBy\` по убыванию + \`limit\`).
4. \`stats\` — по каждому факультету: \`n\` — число студентов, \`avg_gpa\` — средний GPA, округлённый до 2 знаков, \`max_gpa\` — максимальный GPA. Сортировка — по убыванию \`avg_gpa\`.

Выведите результаты.
`,
      starter: R`from pyspark.sql import functions as F

faculties = ...
n_cities = ...
top3 = ...
stats = (students.groupBy("faculty")
         .agg(
             # TODO: F.count(...).alias("n"), ...
         ))

faculties.show()
print("Городов:", n_cities)
top3.show()
stats.show()
`,
      check: R`
import pandas as pd
from pyspark.sql import DataFrame
src = var("students", DataFrame).toPandas()
f = var("faculties", DataFrame)
ok(f.columns == ["faculty"] and f.count() == src["faculty"].nunique(), "faculties: " + str(src["faculty"].nunique()) + " различных факультета в одном столбце faculty")
nc = var("n_cities")
ok(isinstance(nc, int) and nc == src["city"].nunique(), "n_cities = " + str(src["city"].nunique()) + " (целое число: .distinct().count())")
t3 = var("top3", DataFrame)
ok([r["id"] for r in t3.collect()] == [5, 10, 1], "top3: id 5, 10, 1 — по убыванию gpa")
st = var("stats", DataFrame)
exp = src.groupby("faculty").agg(n=("id", "count"), avg_gpa=("gpa", "mean"), max_gpa=("gpa", "max")).sort_values("avg_gpa", ascending=False)
if ok({"faculty", "n", "avg_gpa", "max_gpa"} <= set(st.columns), "В stats столбцы faculty, n, avg_gpa, max_gpa"):
    p = st.toPandas()
    ok(list(p["faculty"]) == list(exp.index), "stats отсортирован по убыванию avg_gpa")
    g = p.set_index("faculty")
    ok(all(k in g.index and int(g.loc[k, "n"]) == int(exp.loc[k, "n"]) and abs(float(g.loc[k, "avg_gpa"]) - round(float(exp.loc[k, "avg_gpa"]), 2)) < 0.011 and abs(float(g.loc[k, "max_gpa"]) - float(exp.loc[k, "max_gpa"])) < 1e-9 for k in exp.index), "Значения n, avg_gpa (2 знака) и max_gpa посчитаны верно")
`,
      hint: "`students.select(\"faculty\").distinct()`; `students.select(\"city\").distinct().count()`; `students.orderBy(F.desc(\"gpa\")).limit(3)`; `.agg(F.count(\"*\").alias(\"n\"), F.round(F.avg(\"gpa\"), 2).alias(\"avg_gpa\"), F.max(\"gpa\").alias(\"max_gpa\")).orderBy(F.desc(\"avg_gpa\"))`.",
      solution: R`from pyspark.sql import functions as F

faculties = students.select("faculty").distinct()
n_cities = students.select("city").distinct().count()
top3 = students.orderBy(F.desc("gpa")).limit(3)
stats = (students.groupBy("faculty")
         .agg(F.count("*").alias("n"),
              F.round(F.avg("gpa"), 2).alias("avg_gpa"),
              F.max("gpa").alias("max_gpa"))
         .orderBy(F.desc("avg_gpa")))

faculties.show()
print("Городов:", n_cities)
top3.show()
stats.show()
`,
    },
    {
      id: "t7",
      title: "join студентов и факультетов, collect и first",
      setup: R`from pyspark.sql import SparkSession, functions as F
spark = SparkSession.builder.getOrCreate()
students = spark.createDataFrame([
    (1, "Aziza Karimova", 101, 4.62),
    (2, "Jasur Toshmatov", 102, 3.85),
    (3, "Malika Rahimova", 103, 4.10),
    (4, "Otabek Saidov", 101, 3.40),
    (5, "Dilnoza Yusupova", 104, 4.95),
    (6, "Sardor Aliyev", 102, 2.90),
    (7, "Nodira Ergasheva", 105, 4.48),
], ["id", "name", "faculty_id", "gpa"])
faculties = spark.createDataFrame([
    (101, "Kompyuter lingvistikasi", "A bino"),
    (102, "Tarjimonlik", "B bino"),
    (103, "Filologiya", "B bino"),
    (104, "Xalqaro jurnalistika", "C bino"),
    (106, "Sharqshunoslik", "D bino"),
], ["faculty_id", "faculty_name", "building"])`,
      text: R`
Даны две таблицы (см. подготовительный код): \`students\` (\`id, name, faculty_id, gpa\`) и справочник \`faculties\` (\`faculty_id, faculty_name, building\`). У студентки \`Nodira Ergasheva\` код факультета 105, которого нет в справочнике, а на факультете 106 нет студентов.

1. \`inner\` — внутреннее соединение по \`faculty_id\`.
2. \`left\` — левое соединение: остаются **все** студенты.
3. \`no_faculty\` — **список Python** имён студентов, для которых факультет не найден (в \`left\` у них \`faculty_name\` равен \`null\` → \`isNull()\`, затем \`collect()\`).
4. \`best\` — строка (\`Row\`) студента с наибольшим GPA из \`inner\` (\`first()\`); \`best_name\` и \`best_faculty\` — его имя и название факультета.
5. \`by_building\` — по каждому корпусу (\`building\`) из \`inner\`: \`students\` — число студентов, \`avg_gpa\` — средний GPA (2 знака); сортировка по \`building\`.
`,
      starter: R`from pyspark.sql import functions as F

inner = ...
left = ...

no_faculty = ...     # список строк Python

best = ...
best_name = ...
best_faculty = ...

by_building = ...

inner.show()
left.show()
print("Без факультета:", no_faculty)
print("Лучший студент:", best_name, "-", best_faculty)
`,
      check: R`
from pyspark.sql import DataFrame, Row
i = var("inner", DataFrame)
ok(i.count() == 6 and {"name", "faculty_name", "building"} <= set(i.columns), "inner: 6 студентов, у которых найден факультет; есть столбцы faculty_name и building")
l = var("left", DataFrame)
ok(l.count() == 7, "left: все 7 студентов")
nf = var("no_faculty")
ok(nf == ["Nodira Ergasheva"], "no_faculty — список ['Nodira Ergasheva']")
b = var("best")
ok(isinstance(b, Row), "best — объект Row (результат first())")
ok(var("best_name") == "Dilnoza Yusupova", "best_name = 'Dilnoza Yusupova'")
ok(var("best_faculty") == "Xalqaro jurnalistika", "best_faculty = 'Xalqaro jurnalistika'")
bb = var("by_building", DataFrame)
if ok({"building", "students", "avg_gpa"} <= set(bb.columns), "В by_building столбцы building, students, avg_gpa"):
    rows = [(r["building"], r["students"], r["avg_gpa"]) for r in bb.collect()]
    ok([x[0] for x in rows] == ["A bino", "B bino", "C bino"], "by_building отсортирован по building: A, B, C")
    ok([x[1] for x in rows] == [2, 3, 1], "Число студентов по корпусам: 2, 3, 1")
    ok(len(rows) == 3 and abs(rows[0][2] - 4.01) < 0.006 and abs(rows[1][2] - 3.62) < 0.006, "avg_gpa: A bino — 4.01, B bino — 3.62")
ok(uses("join"), "Использован метод join")
`,
      hint: "`students.join(faculties, on=\"faculty_id\", how=\"inner\")`, для left — `how=\"left\"`; `[r[\"name\"] for r in left.filter(F.col(\"faculty_name\").isNull()).select(\"name\").collect()]`; `best = inner.orderBy(F.desc(\"gpa\")).first()`.",
      solution: R`from pyspark.sql import functions as F

inner = students.join(faculties, on="faculty_id", how="inner")
left = students.join(faculties, on="faculty_id", how="left")

no_faculty = [r["name"] for r in left.filter(F.col("faculty_name").isNull()).select("name").collect()]

best = inner.orderBy(F.desc("gpa")).first()
best_name = best["name"]
best_faculty = best["faculty_name"]

by_building = (inner.groupBy("building")
               .agg(F.count("*").alias("students"),
                    F.round(F.avg("gpa"), 2).alias("avg_gpa"))
               .orderBy("building"))

inner.show()
left.show()
by_building.show()
print("Без факультета:", no_faculty)
print("Лучший студент:", best_name, "-", best_faculty)
`,
    },
  ],
  quiz: [
    { q: "Как правильно записать условие «GPA не ниже 4 **и** 3-й курс»?", options: ["`df.filter(F.col(\"gpa\") >= 4 and F.col(\"course\") == 3)`", "`df.filter((F.col(\"gpa\") >= 4) & (F.col(\"course\") == 3))`", "`df.filter(F.col(\"gpa\") >= 4 & F.col(\"course\") == 3)`", "`df.filter([\"gpa >= 4\", \"course == 3\"])`"], answer: 1, explain: "Для столбцов используются `&`, `|`, `~`, а каждое сравнение берётся в скобки: у `&` приоритет выше, чем у `>=` и `==`." },
    { q: "Что возвращает `df.collect()`?", options: ["Новый DataFrame", "Список объектов Row в памяти драйвера", "pandas DataFrame", "Число строк"], answer: 1, explain: "`collect()` — действие: все строки переносятся в драйвер. Для больших таблиц используйте `take(n)` или агрегаты." },
    { q: "Какой тип получит столбец из целых чисел Python, если схема не задана?", options: ["int", "bigint (LongType)", "double", "string"], answer: 1 },
    { q: "Что выполняет `F.when(F.col(\"gpa\") >= 4.5, \"a'lo\").otherwise(\"yaxshi\")`?", options: ["Фильтрует строки", "Вычисляет значение по условию, как CASE WHEN … THEN … ELSE … END в SQL", "Переименовывает столбец", "Сортирует по gpa"], answer: 1 },
    { q: "Что будет со студентом без пары в справочнике при `students.join(faculties, \"faculty_id\", \"left\")`?", options: ["Строка пропадёт", "Строка останется, столбцы справочника будут null", "Возникнет ошибка", "Студент получит первый факультет из справочника"], answer: 1, explain: "Левое соединение сохраняет все строки левой таблицы; чтобы найти строки без пары, удобно использовать `isNull()` или `how=\"left_anti\"`." },
    { q: "Почему после `df.withColumn(\"x\", F.lit(1))` в `df` нет столбца `x`?", options: ["withColumn работает только с SQL", "DataFrame неизменяем: метод вернул новый DataFrame, его нужно присвоить переменной", "Нужно вызвать df.commit()", "lit не создаёт столбцов"], answer: 1 },
  ],
  realEnv: R`
## Выполнение в настоящем PySpark

Код заданий без изменений работает в Google Colab, Jupyter (Anaconda) и Databricks — инструкции по установке см. в **Лабораторной работе 4**. Кратко для Colab:

\`\`\`python
!pip install -q pyspark
from pyspark.sql import SparkSession, Row, functions as F
spark = SparkSession.builder.appName("UzBigData-P10").getOrCreate()
\`\`\`

## Что будет выглядеть иначе

- **Порядок столбцов из словарей.** \`spark.createDataFrame(cities)\` в настоящем Spark упорядочит столбцы по алфавиту: \`city, population, region\`. Если важен порядок — задайте схему или вызовите \`select\`.
- **Ленивость.** Каждая трансформация выполняется мгновенно, а работа начинается только на \`show\`, \`count\`, \`collect\`. Откройте Spark UI (**http://localhost:4040**) и посмотрите, сколько заданий (Jobs) запустил один вызов \`show()\`.
- **Планы запросов.** \`df.explain()\` печатает физический план, который построил оптимизатор Catalyst, — сравните планы для \`filter\` до и после \`join\`.

## Databricks

В блокноте Databricks переменная \`spark\` уже создана, а вместо \`show()\` удобно использовать \`display(df)\` — интерактивную таблицу с сортировкой и встроенными графиками.
`,
  homework: R`
## Самостоятельная работа: «Изучение возможностей Spark DataFrame»

1. Составьте шпаргалку по 20 функциям модуля \`pyspark.sql.functions\` (строковые, даты, массивы, условия, агрегаты) — с примером на данных студентов.
2. Изучите оконные функции (\`Window.partitionBy(...).orderBy(...)\`, \`row_number\`, \`rank\`, \`lag\`) и найдите лучшего студента **на каждом факультете**.
3. Сравните три способа сделать одно и то же — DataFrame API, \`spark.sql\` и \`selectExpr\` — на задаче «средний GPA по факультетам» и посмотрите \`explain()\` для каждого.
4. **Практика:** загрузите \`data/spark/students.jsonl\` (\`spark.read.json\`), соедините с таблицей факультетов, придуманной вами, и сохраните отчёт в Parquet с разбиением по факультету: \`df.write.partitionBy("faculty").parquet(...)\`.
`,
});
