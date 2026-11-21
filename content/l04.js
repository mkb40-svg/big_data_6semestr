BDT.register({
  id: "l04",
  kind: "lab",
  num: 4,
  title: "Настройка среды Apache Spark и работа с объектами Spark DataFrame",
  hours: 4,
  env: ["python", "spark"],
  goals: [
    "Понять архитектуру Apache Spark: драйвер, исполнители, менеджер кластера, ленивые вычисления",
    "Создать `SparkSession`, прочитать CSV с автоопределением и с явной схемой",
    "Выполнять агрегации DataFrame API и запросы Spark SQL",
    "Посчитать частоты слов узбекского корпуса через RDD и через DataFrame и сохранить результат в Parquet",
  ],
  theory: R`
## Что такое Apache Spark

**Apache Spark** — универсальный движок для распределённой обработки больших данных. В отличие от MapReduce, который после каждого шага пишет промежуточные данные на диск, Spark держит их **в оперативной памяти**, поэтому многошаговые и итеративные задачи (машинное обучение, графы, интерактивный анализ) выполняются в десятки раз быстрее.

| Модуль | Назначение |
|---|---|
| Spark Core (RDD) | базовые распределённые коллекции и планировщик задач |
| **Spark SQL / DataFrame** | таблицы со схемой, SQL-запросы, оптимизатор Catalyst |
| Structured Streaming | обработка потоков данных (Kafka, файлы, сокеты) |
| MLlib | машинное обучение: классификация, кластеризация, TF-IDF, Word2Vec |
| GraphX | графовые алгоритмы |

Программы пишут на Python (**PySpark**), Scala, Java, R или SQL. Spark читает данные из HDFS, S3, баз данных, локальных файлов и может работать поверх YARN.

## Архитектура

\`\`\`text
 +--------------- Driver ----------------+        +------------ Executor 1 ----+
 | ваша программа + SparkSession         | -----> | task  task  [кэш данных]   |
 | строит план (DAG), делит его на этапы |        +----------------------------+
 | (stages) и задачи (tasks)             |        +------------ Executor 2 ----+
 +---------------+-----------------------+ -----> | task  task  [кэш данных]   |
                 |                                +----------------------------+
                 | запрос ресурсов
                 v
      Cluster manager: local / Standalone / YARN / Kubernetes
      (выделяет ресурсы и запускает исполнителей на узлах)
\`\`\`

- **Driver** — процесс, в котором работает ваш код и \`SparkSession\`; он превращает операции в план и раздаёт задачи.
- **Executors** — процессы на узлах кластера, выполняющие задачи и хранящие кэш.
- **Cluster manager** — выделяет ресурсы. Адрес задаётся параметром \`master\`:

| master | Значение |
|---|---|
| \`local\` | один поток на этой машине |
| \`local[4]\` | 4 потока |
| \`local[*]\` | столько потоков, сколько ядер процессора |
| \`yarn\` | кластер Hadoop YARN |
| \`spark://host:7077\` | собственный кластер Spark (Standalone) |

## Ленивые вычисления: трансформации и действия

Операции Spark делятся на два вида:

| Трансформации (ленивые) | Действия (запускают вычисления) |
|---|---|
| \`select\`, \`filter\`, \`withColumn\`, \`groupBy\`, \`join\`, \`orderBy\` | \`show\`, \`count\`, \`collect\`, \`take\`, \`first\` |
| RDD: \`map\`, \`flatMap\`, \`filter\`, \`reduceByKey\` | запись: \`write.parquet(...)\`, \`saveAsTextFile\` |

Трансформация лишь **дописывает шаг в план** и мгновенно возвращает новый DataFrame. Только **действие** запускает задание (job): Spark оптимизирует весь план целиком, делит его на этапы по границам **перемешивания** (shuffle — например, \`groupBy\` или \`reduceByKey\`) и запускает по одной задаче на каждый **раздел** (partition) данных.

## RDD и DataFrame

| | RDD | DataFrame |
|---|---|---|
| Данные | произвольные объекты Python | строки со схемой (столбцы и типы) |
| API | \`map\`, \`flatMap\`, \`reduceByKey\` | \`select\`, \`filter\`, \`groupBy\`, SQL |
| Оптимизация | нет — выполняется как написано | оптимизатор Catalyst + движок Tungsten |
| Когда использовать | неструктурированный текст, нестандартная логика | таблицы, агрегации — почти всегда |

## Первые шаги в PySpark

\`\`\`python
from pyspark.sql import SparkSession, functions as F

spark = (SparkSession.builder
         .appName("UzBigData")
         .master("local[*]")
         .getOrCreate())          # повторный вызов вернёт уже созданную сессию
sc = spark.sparkContext           # «старый» вход для RDD
print(spark.version, sc.master, sc.defaultParallelism)

df = spark.read.csv("data/spark/sales_events.csv", header=True, inferSchema=True)
df.printSchema()
df.groupBy("region").agg(F.sum("qty").alias("items")).orderBy(F.desc("items")).show()
\`\`\`

Схему можно задать явно — это быстрее (не нужен лишний проход по данным) и надёжнее:

\`\`\`python
schema = "event_id INT, event_time TIMESTAMP, region STRING, qty INT, unit_price DOUBLE"
# или StructType([StructField("event_id", IntegerType(), False), ...])
df = spark.read.csv(path, header=True, schema=schema)
\`\`\`

**Spark SQL**: зарегистрируйте DataFrame как временное представление и пишите обычный SQL:

\`\`\`python
df.createOrReplaceTempView("sales")
spark.sql("SELECT region, COUNT(*) AS n FROM sales GROUP BY region ORDER BY n DESC").show()
\`\`\`

**Запись результатов** создаёт не файл, а **каталог** с частями \`part-00000-…\` (по одной на раздел) и пустым маркером \`_SUCCESS\`:

| mode | Если каталог уже есть |
|---|---|
| \`error\` / \`errorifexists\` (по умолчанию) | ошибка |
| \`overwrite\` | перезаписать |
| \`append\` | добавить новые части |
| \`ignore\` | ничего не делать |

\`\`\`python
df.write.mode("overwrite").parquet("output/sales_parquet")
df.write.mode("overwrite").csv("output/sales_csv", header=True)
back = spark.read.parquet("output/sales_parquet")
\`\`\`

**Parquet** — колоночный формат со сжатием и сохранённой схемой; стандарт де-факто для хранения таблиц в Big Data.

## Spark UI

Пока работает приложение, драйвер поднимает веб-интерфейс **http://localhost:4040**: вкладки *Jobs* (задания), *Stages* (этапы и задачи), *Storage* (кэш), *SQL / DataFrame* (планы запросов), *Executors*. Это главный инструмент для поиска «узких мест».

> [!NOTE] Как устроен тренажёр
> В браузере работает **учебный эмулятор PySpark** на основе pandas: API и формат вывода (\`show\`, \`printSchema\`) повторяют PySpark 3.5, но вычисления идут сразу в одном процессе, а Spark UI нет. Активная \`SparkSession\` сохраняется между запусками: \`getOrCreate()\` возвращает уже созданную. Тот же код без изменений работает в Google Colab и на кластере.
`,
  tasks: [
    {
      id: "t1",
      title: "Создание SparkSession",
      text: R`
Создайте сессию Spark с именем приложения **\`UzBigData-L4\`** и мастером, использующим все ядра локальной машины.

Сохраните в переменные:
- \`version\` — версию Spark (\`spark.version\`);
- \`master\` — адрес мастера (\`spark.sparkContext.master\`);
- \`cores\` — параллелизм по умолчанию (\`spark.sparkContext.defaultParallelism\`) — столько задач Spark запускает одновременно.

Выведите их на экран. Последней строкой оставьте \`spark\` — увидите карточку сессии.
`,
      starter: R`from pyspark.sql import SparkSession

# Если сессия уже создана (например, в другом задании), остановим её,
# иначе getOrCreate() вернёт старую сессию со старыми настройками
active = SparkSession.getActiveSession()
if active is not None:
    active.stop()

spark = (SparkSession.builder
         .appName("...")     # TODO: имя приложения
         .master("...")      # TODO: все ядра локальной машины
         .getOrCreate())

version = ...
master = ...
cores = ...

print("Spark:", version)
print("Master:", master)
print("Параллелизм:", cores)
spark
`,
      check: R`
from pyspark.sql import SparkSession
spark = var("spark", SparkSession)
sc = spark.sparkContext
ok(sc.appName == "UzBigData-L4", "Имя приложения — UzBigData-L4 (.appName)")
ok(sc.master == "local[*]", "Мастер — local[*]: все ядра локальной машины (.master)")
ok(var("version") == spark.version, "В version записана версия Spark (spark.version)")
ok(var("master") == sc.master, "В master записан адрес мастера (spark.sparkContext.master)")
ok(var("cores") == sc.defaultParallelism, "В cores записан spark.sparkContext.defaultParallelism")
ok(spark.version in out, "Версия Spark выведена на экран")
`,
      hint: "`.appName(\"UzBigData-L4\").master(\"local[*]\")`; версия — `spark.version`, мастер — `spark.sparkContext.master`.",
      solution: R`from pyspark.sql import SparkSession

active = SparkSession.getActiveSession()
if active is not None:
    active.stop()

spark = (SparkSession.builder
         .appName("UzBigData-L4")
         .master("local[*]")
         .getOrCreate())

version = spark.version
master = spark.sparkContext.master
cores = spark.sparkContext.defaultParallelism

print("Spark:", version)
print("Master:", master)
print("Параллелизм:", cores)
spark
`,
    },
    {
      id: "t2",
      title: "Чтение CSV и схема данных",
      text: R`
Файл \`data/spark/sales_events.csv\` — 3000 продаж магазинов в регионах Узбекистана: \`event_id, event_time, region, product, category, qty, unit_price, payment\`.

1. Прочитайте его в DataFrame \`df\` так, чтобы имена столбцов взялись из первой строки, а типы определились автоматически.
2. Выведите схему (\`printSchema()\`) и первые 5 строк (\`show(5)\`).
3. Сохраните число строк в \`n_rows\`, число столбцов — в \`n_cols\`.

Сначала запустите стартовый код как есть и посмотрите, что получится без параметров.
`,
      starter: R`from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("UzBigData-L4").getOrCreate()

df = spark.read.csv("data/spark/sales_events.csv")   # TODO: добавьте параметры

df.printSchema()
df.show(5)

n_rows = ...
n_cols = ...
print("Строк:", n_rows, "столбцов:", n_cols)
`,
      check: R`
from pyspark.sql import DataFrame
df = var("df", DataFrame)
ok(df.columns == ["event_id", "event_time", "region", "product", "category", "qty", "unit_price", "payment"], "Имена столбцов взяты из заголовка файла (header=True)")
types = dict(df.dtypes)
ok(types.get("qty") == "int" and types.get("unit_price") == "int", "qty и unit_price распознаны как int (inferSchema=True)")
ok(types.get("event_time") == "timestamp", "event_time распознан как timestamp")
ok(var("n_rows") == 3000, "n_rows = 3000 (df.count())")
ok(var("n_cols") == 8, "n_cols = 8 (len(df.columns))")
ok("root" in out and "|-- region: string" in out, "Схема выведена методом printSchema()")
ok("only showing top 5 rows" in out, "Первые 5 строк выведены методом show(5)")
`,
      hint: "`spark.read.csv(путь, header=True, inferSchema=True)`; число строк — действие `df.count()`, столбцов — `len(df.columns)`.",
      solution: R`from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("UzBigData-L4").getOrCreate()

df = spark.read.csv("data/spark/sales_events.csv", header=True, inferSchema=True)

df.printSchema()
df.show(5)

n_rows = df.count()
n_cols = len(df.columns)
print("Строк:", n_rows, "столбцов:", n_cols)
`,
    },
    {
      id: "t3",
      title: "Явная схема и новый столбец",
      text: R`
Автоопределение типов требует лишнего прохода по данным и может ошибиться. Задайте схему явно.

1. Опишите схему \`schema\` для всех 8 столбцов — через \`StructType\` или DDL-строкой. Типы: \`event_id\` и \`qty\` — INT, \`event_time\` — TIMESTAMP, \`unit_price\` — **DOUBLE** (цены бывают дробными), остальные — STRING.
2. Прочитайте файл с этой схемой в DataFrame \`sales\` (\`header=True, schema=schema\`).
3. Добавьте столбец \`revenue = qty * unit_price\` (\`withColumn\`) — сумма продажи в сумах.
4. Выведите схему и 5 строк.
`,
      starter: R`from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StructType, StructField, IntegerType, StringType, DoubleType, TimestampType

spark = SparkSession.builder.getOrCreate()

schema = StructType([
    StructField("event_id", IntegerType(), False),
    StructField("event_time", TimestampType(), True),
    # TODO: region, product, category (строки), qty (int), unit_price (double), payment (строка)
])
# Другой способ — DDL-строка:
# schema = "event_id INT, event_time TIMESTAMP, region STRING, ..."

sales = spark.read.csv("data/spark/sales_events.csv", header=True, schema=schema)
sales = sales   # TODO: добавьте столбец revenue

sales.printSchema()
sales.show(5)
`,
      check: R`
import pandas as pd
from pyspark.sql import DataFrame
from pyspark.sql.types import StructType
sch = var("schema")
ok(isinstance(sch, (StructType, str)), "schema — объект StructType или DDL-строка")
sales = var("sales", DataFrame)
types = dict(sales.dtypes)
ok(all(c in types for c in ["event_id", "event_time", "region", "product", "category", "qty", "unit_price", "payment"]), "В sales все 8 столбцов файла")
ok(types.get("event_id") == "int" and types.get("qty") == "int", "event_id и qty — int")
ok(types.get("unit_price") == "double", "unit_price — double (задано схемой; inferSchema дал бы int)")
ok(types.get("event_time") == "timestamp", "event_time — timestamp")
ok(types.get("region") == "string" and types.get("payment") == "string", "region, product, category, payment — string")
ok("revenue" in sales.columns, "Добавлен столбец revenue")
if "revenue" in sales.columns:
    raw = pd.read_csv("data/spark/sales_events.csv")
    exp = float((raw["qty"] * raw["unit_price"]).sum())
    got = float(sales.toPandas()["revenue"].sum())
    ok(abs(got - exp) < 1, "revenue = qty * unit_price (сумма по всем продажам — " + format(int(exp), ",") + " сум)")
ok(uses("schema=") or uses(".schema("), "Схема передана при чтении (schema=...)")
`,
      hint: "Добавьте поля `StructField(\"region\", StringType(), True)` и т.д.; новый столбец: `sales.withColumn(\"revenue\", F.col(\"qty\") * F.col(\"unit_price\"))`.",
      solution: R`from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StructType, StructField, IntegerType, StringType, DoubleType, TimestampType

spark = SparkSession.builder.getOrCreate()

schema = StructType([
    StructField("event_id", IntegerType(), False),
    StructField("event_time", TimestampType(), True),
    StructField("region", StringType(), True),
    StructField("product", StringType(), True),
    StructField("category", StringType(), True),
    StructField("qty", IntegerType(), True),
    StructField("unit_price", DoubleType(), True),
    StructField("payment", StringType(), True),
])

sales = spark.read.csv("data/spark/sales_events.csv", header=True, schema=schema)
sales = sales.withColumn("revenue", F.col("qty") * F.col("unit_price"))

sales.printSchema()
sales.show(5)
`,
    },
    {
      id: "t4",
      title: "Агрегации: выручка по регионам и способам оплаты",
      setup: R`from pyspark.sql import SparkSession, functions as F
spark = SparkSession.builder.getOrCreate()
sales = (spark.read.csv("data/spark/sales_events.csv", header=True, inferSchema=True)
         .withColumn("revenue", F.col("qty") * F.col("unit_price")))`,
      text: R`
DataFrame \`sales\` со столбцом \`revenue\` уже загружен (см. подготовительный код).

1. \`by_region\` — по каждому региону: \`orders\` — число продаж, \`items\` — сумма \`qty\`, \`revenue\` — сумма выручки. Отсортируйте по убыванию выручки.
2. \`by_payment\` — по каждому способу оплаты (\`payment\`): \`orders\` — число продаж и \`avg_check\` — средняя сумма продажи, округлённая до 2 знаков. Отсортируйте по убыванию \`orders\`.
3. \`top_region\` — **строка** с названием региона с наибольшей выручкой (возьмите из \`by_region\` методом \`first()\`).

Выведите обе таблицы методом \`show()\`.
`,
      starter: R`from pyspark.sql import functions as F

by_region = (sales.groupBy("region")
             .agg(
                 # TODO: F.count(...).alias("orders"), F.sum(...).alias("items"), F.sum(...).alias("revenue")
             ))
by_region.show()

by_payment = ...
# by_payment.show()

top_region = ...
print("Лидер по выручке:", top_region)
`,
      check: R`
import pandas as pd
from pyspark.sql import DataFrame
raw = pd.read_csv("data/spark/sales_events.csv")
raw["revenue"] = raw["qty"] * raw["unit_price"]
er = raw.groupby("region").agg(orders=("event_id", "count"), items=("qty", "sum"), revenue=("revenue", "sum")).sort_values("revenue", ascending=False)
br = var("by_region", DataFrame)
if ok({"region", "orders", "items", "revenue"} <= set(br.columns), "В by_region есть столбцы region, orders, items, revenue"):
    p = br.toPandas()
    ok(len(p) == 8, "by_region: 8 строк — по одной на регион")
    ok(list(p["region"]) == list(er.index), "by_region отсортирован по убыванию выручки")
    g = p.set_index("region")
    ok(all(int(g.loc[r, "orders"]) == int(er.loc[r, "orders"]) and int(g.loc[r, "items"]) == int(er.loc[r, "items"]) and abs(float(g.loc[r, "revenue"]) - float(er.loc[r, "revenue"])) < 1 for r in er.index if r in g.index), "Значения orders, items, revenue посчитаны верно")
ep = raw.groupby("payment").agg(orders=("event_id", "count"), avg_check=("revenue", "mean")).sort_values("orders", ascending=False)
bp = var("by_payment", DataFrame)
if ok({"payment", "orders", "avg_check"} <= set(bp.columns), "В by_payment есть столбцы payment, orders, avg_check"):
    q = bp.toPandas()
    ok(list(q["payment"]) == list(ep.index), "by_payment отсортирован по убыванию числа продаж")
    h = q.set_index("payment")
    ok(all(abs(float(h.loc[k, "avg_check"]) - round(float(ep.loc[k, "avg_check"]), 2)) < 0.011 for k in ep.index if k in h.index), "avg_check — средняя сумма продажи, округлённая до 2 знаков")
ok(var("top_region") == er.index[0], "top_region — регион с наибольшей выручкой (строка)")
`,
      hint: "`sales.groupBy(\"region\").agg(F.count(\"*\").alias(\"orders\"), F.sum(\"qty\").alias(\"items\"), F.sum(\"revenue\").alias(\"revenue\")).orderBy(F.desc(\"revenue\"))`; `top_region = by_region.first()[\"region\"]`.",
      solution: R`from pyspark.sql import functions as F

by_region = (sales.groupBy("region")
             .agg(F.count("*").alias("orders"),
                  F.sum("qty").alias("items"),
                  F.sum("revenue").alias("revenue"))
             .orderBy(F.desc("revenue")))
by_region.show()

by_payment = (sales.groupBy("payment")
              .agg(F.count("*").alias("orders"),
                   F.round(F.avg("revenue"), 2).alias("avg_check"))
              .orderBy(F.desc("orders")))
by_payment.show()

top_region = by_region.first()["region"]
print("Лидер по выручке:", top_region)
`,
    },
    {
      id: "t5",
      title: "Spark SQL: временное представление",
      setup: R`from pyspark.sql import SparkSession
spark = SparkSession.builder.getOrCreate()
sales = spark.read.csv("data/spark/sales_events.csv", header=True, inferSchema=True)`,
      text: R`
Те же данные можно анализировать на чистом SQL.

1. Зарегистрируйте DataFrame \`sales\` как временное представление с именем \`sales\`.
2. \`top_products\` — запрос \`spark.sql(...)\`: для каждого товара (\`product\`) — \`total_qty\` (сумма \`qty\`) и \`revenue\` (сумма \`qty * unit_price\`); 5 товаров с наибольшей выручкой, по убыванию.
3. \`tashkent\` — запрос по продажам **только в регионе Toshkent**: для каждой пары \`category\`, \`payment\` — \`orders\` (число продаж) и \`revenue\`; сортировка по убыванию \`revenue\`.

Выведите оба результата методом \`show()\`.
`,
      starter: R`# 1. временное представление
# sales.createOrReplaceTempView(...)

top_products = spark.sql("""
    SELECT product
    FROM sales
""")   # TODO: допишите запрос
top_products.show()

tashkent = ...
# tashkent.show()
`,
      check: R`
import pandas as pd
from pyspark.sql import DataFrame
raw = pd.read_csv("data/spark/sales_events.csv")
raw["revenue"] = raw["qty"] * raw["unit_price"]
ok(uses("createOrReplaceTempView") or uses("createTempView"), "DataFrame зарегистрирован как временное представление")
ok(uses("spark.sql"), "Запросы выполнены через spark.sql")
tp = var("top_products", DataFrame)
exp = raw.groupby("product").agg(total_qty=("qty", "sum"), revenue=("revenue", "sum")).sort_values("revenue", ascending=False).head(5)
if ok(set(tp.columns) >= {"product", "total_qty", "revenue"}, "В top_products столбцы product, total_qty, revenue"):
    p = tp.toPandas()
    ok(len(p) == 5, "top_products содержит 5 строк (LIMIT 5)")
    ok(list(p["product"]) == list(exp.index), "Товары упорядочены по убыванию выручки: " + ", ".join(exp.index))
    ok(len(p) == 5 and [int(x) for x in p["total_qty"]] == [int(x) for x in exp["total_qty"]], "total_qty = SUM(qty) для каждого товара")
t = var("tashkent", DataFrame)
tr = raw[raw["region"] == "Toshkent"]
et = tr.groupby(["category", "payment"]).agg(orders=("event_id", "count"), revenue=("revenue", "sum")).sort_values("revenue", ascending=False)
if ok(set(t.columns) >= {"category", "payment", "orders", "revenue"}, "В tashkent столбцы category, payment, orders, revenue"):
    q = t.toPandas()
    ok(len(q) == len(et), "tashkent: по строке на каждую пару (category, payment) — " + str(len(et)) + " строк")
    ok(int(q["orders"].sum()) == len(tr), "Учтены только продажи в Toshkent (" + str(len(tr)) + ")")
    ok(list(q["revenue"].astype(float)) == sorted(q["revenue"].astype(float), reverse=True), "Сортировка по убыванию revenue")
`,
      hint: "`sales.createOrReplaceTempView(\"sales\")`; запрос: `SELECT product, SUM(qty) AS total_qty, SUM(qty * unit_price) AS revenue FROM sales GROUP BY product ORDER BY revenue DESC LIMIT 5`. Для Ташкента добавьте `WHERE region = 'Toshkent'` и `GROUP BY category, payment`.",
      solution: R`sales.createOrReplaceTempView("sales")

top_products = spark.sql("""
    SELECT product,
           SUM(qty) AS total_qty,
           SUM(qty * unit_price) AS revenue
    FROM sales
    GROUP BY product
    ORDER BY revenue DESC
    LIMIT 5
""")
top_products.show()

tashkent = spark.sql("""
    SELECT category, payment,
           COUNT(*) AS orders,
           SUM(qty * unit_price) AS revenue
    FROM sales
    WHERE region = 'Toshkent'
    GROUP BY category, payment
    ORDER BY revenue DESC
""")
tashkent.show()
`,
    },
    {
      id: "t6",
      title: "Word count на RDD",
      text: R`
Классическая задача Big Data — **подсчёт частот слов** (word count). Решим её для корпуса узбекских новостей \`data/corpus_uz/*.txt\` на низкоуровневом API RDD.

Функция \`tokens(line)\` уже написана: она переводит строку в нижний регистр, приводит разные апострофы (ʻ ʼ ‘ ’ и обратный) к \`'\` и возвращает список слов.

1. \`words\` — все слова корпуса: \`lines.flatMap(tokens)\`.
2. \`pairs\` — пары \`(слово, 1)\`: \`map\`.
3. \`counts\` — частоты: \`reduceByKey\` складывает единицы для одинаковых ключей.
4. \`top10\` — **список** из 10 самых частых пар \`(слово, частота)\` по убыванию частоты (\`sortBy(..., ascending=False).take(10)\` или \`takeOrdered\`).

Обратите внимание: \`flatMap\`, \`map\` и \`reduceByKey\` — трансформации, вычисления запускают только действия \`count\`, \`take\`, \`collect\`.
`,
      starter: R`import re
from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()
sc = spark.sparkContext

APOS = re.compile("[\u02bb\u02bc\u2018\u2019\u0060]")   # ʻ ʼ ‘ ’ и обратный апостроф

def tokens(line):
    """Строка -> список слов: нижний регистр, единый апостроф, только латинские буквы."""
    line = APOS.sub("'", line.lower())
    return [w.strip("'") for w in re.split("[^a-z']+", line) if w.strip("'")]

lines = sc.textFile("data/corpus_uz/*.txt")
print("Строк:", lines.count(), "| разделов:", lines.getNumPartitions())

words = ...     # TODO: flatMap
pairs = ...     # TODO: map -> (слово, 1)
counts = ...    # TODO: reduceByKey
top10 = ...     # TODO: 10 самых частых

print("Всего слов:", words.count(), "| уникальных:", counts.count())
for w, n in top10:
    print(f"{w:15} {n}")
`,
      check: R`
import re, glob, collections
from pyspark import RDD
APOS = re.compile("[\u02bb\u02bc\u2018\u2019\u0060]")
def tk(line):
    line = APOS.sub("'", line.lower())
    return [w.strip("'") for w in re.split("[^a-z']+", line) if w.strip("'")]
exp = collections.Counter()
for f in sorted(glob.glob("data/corpus_uz/*.txt")):
    with open(f, encoding="utf-8") as fh:
        for line in fh.read().splitlines():
            exp.update(tk(line))
w = var("words", RDD)
ok(w.count() == sum(exp.values()), "words содержит все слова корпуса (" + str(sum(exp.values())) + ")")
counts = var("counts", RDD)
got = dict(counts.collect())
ok(got == dict(exp), "counts — пары (слово, частота) для всех " + str(len(exp)) + " уникальных слов")
top = var("top10")
ok(isinstance(top, list) and len(top) == 10, "top10 — список из 10 пар")
if isinstance(top, list) and len(top) == 10:
    ok([n for _, n in top] == [n for _, n in exp.most_common(10)], "top10 упорядочен по убыванию частоты")
    ok(top[0][0] == exp.most_common(1)[0][0], "Самое частое слово корпуса — «" + exp.most_common(1)[0][0] + "»")
ok(uses("flatMap") and uses("reduceByKey"), "Использованы flatMap и reduceByKey")
`,
      hint: "`words = lines.flatMap(tokens)`, `pairs = words.map(lambda w: (w, 1))`, `counts = pairs.reduceByKey(lambda a, b: a + b)`, `top10 = counts.sortBy(lambda kv: kv[1], ascending=False).take(10)`.",
      solution: R`import re
from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()
sc = spark.sparkContext

APOS = re.compile("[\u02bb\u02bc\u2018\u2019\u0060]")   # ʻ ʼ ‘ ’ и обратный апостроф

def tokens(line):
    """Строка -> список слов: нижний регистр, единый апостроф, только латинские буквы."""
    line = APOS.sub("'", line.lower())
    return [w.strip("'") for w in re.split("[^a-z']+", line) if w.strip("'")]

lines = sc.textFile("data/corpus_uz/*.txt")
print("Строк:", lines.count(), "| разделов:", lines.getNumPartitions())

words = lines.flatMap(tokens)
pairs = words.map(lambda w: (w, 1))
counts = pairs.reduceByKey(lambda a, b: a + b)
top10 = counts.sortBy(lambda kv: kv[1], ascending=False).take(10)

print("Всего слов:", words.count(), "| уникальных:", counts.count())
for w, n in top10:
    print(f"{w:15} {n}")
`,
    },
    {
      id: "t7",
      title: "Word count на DataFrame и запись в Parquet",
      text: R`
Повторите подсчёт частот средствами DataFrame API и сохраните результат.

1. \`spark.read.text(...)\` даёт DataFrame с одним столбцом \`value\` (одна строка файла — одна запись). Стартовый код уже приводит строки к нижнему регистру и унифицирует апострофы.
2. Получите DataFrame \`words\` со столбцом \`word\`: разбейте строку \`F.split(..., "[^a-z']+")\`, разверните массив в строки \`F.explode(...)\`, уберите апострофы по краям слова (\`F.regexp_replace(..., "^'+|'+$", "")\`) и отбросьте пустые строки.
3. \`freq\` — частоты: \`groupBy("word").count()\`, сортировка по убыванию \`count\` (при равенстве — по слову).
4. Сохраните \`freq\` в формате **Parquet** в каталог \`output/word_freq\` в режиме \`overwrite\`, затем прочитайте его обратно в DataFrame \`back\` и сравните число строк.
5. *(По желанию)* Сохраните 20 самых частых слов в CSV с заголовком: \`freq.limit(20).write.mode("overwrite").csv("output/top20", header=True)\`.

Результаты должны совпасть с RDD-версией из прошлого задания.
`,
      starter: R`import os
from pyspark.sql import SparkSession, functions as F

spark = SparkSession.builder.getOrCreate()

text = spark.read.text("data/corpus_uz/*.txt")             # столбец value
APOS = "[\u02bb\u02bc\u2018\u2019\u0060]"

lines = (text
         .select(F.lower(F.col("value")).alias("line"))
         .select(F.regexp_replace("line", APOS, "'").alias("line")))

words = (lines
         # TODO: split -> explode -> alias("word")
         # TODO: убрать апострофы по краям, отбросить пустые слова
        )

freq = ...    # TODO: groupBy("word").count() + сортировка
# freq.show(10)

# TODO: запись в output/word_freq (parquet, overwrite) и чтение обратно в back
`,
      check: R`
import os, re, glob, collections
from pyspark.sql import DataFrame
APOS = re.compile("[\u02bb\u02bc\u2018\u2019\u0060]")
def tk(line):
    line = APOS.sub("'", line.lower())
    return [w.strip("'") for w in re.split("[^a-z']+", line) if w.strip("'")]
exp = collections.Counter()
for f in sorted(glob.glob("data/corpus_uz/*.txt")):
    with open(f, encoding="utf-8") as fh:
        for line in fh.read().splitlines():
            exp.update(tk(line))
words = var("words", DataFrame)
ok("word" in words.columns, "В words есть столбец word")
ok(words.count() == sum(exp.values()), "words — по строке на каждое слово корпуса (" + str(sum(exp.values())) + "), пустых слов нет")
freq = var("freq", DataFrame)
if ok(set(freq.columns) == {"word", "count"}, "В freq два столбца: word и count"):
    p = freq.toPandas()
    ok({w: int(n) for w, n in zip(p["word"], p["count"])} == dict(exp), "freq содержит частоты всех " + str(len(exp)) + " слов (как в RDD-версии)")
    ok(list(p["count"]) == sorted(p["count"], reverse=True), "freq отсортирован по убыванию count")
ok(os.path.exists("output/word_freq/_SUCCESS"), "freq записан в каталог output/word_freq (есть маркер _SUCCESS)")
ok(uses("overwrite"), "Использован режим записи overwrite")
ok(uses("parquet"), "Использован формат parquet")
back = var("back", DataFrame)
ok(back.count() == len(exp) and set(back.columns) == {"word", "count"}, "back прочитан из output/word_freq и содержит " + str(len(exp)) + " строк")
`,
      hint: "`words = lines.select(F.explode(F.split(\"line\", \"[^a-z']+\")).alias(\"word\")).select(F.regexp_replace(\"word\", \"^'+|'+$\", \"\").alias(\"word\")).filter(F.col(\"word\") != \"\")`; `freq = words.groupBy(\"word\").count().orderBy(F.desc(\"count\"), \"word\")`; запись: `freq.write.mode(\"overwrite\").parquet(\"output/word_freq\")`.",
      solution: R`import os
from pyspark.sql import SparkSession, functions as F

spark = SparkSession.builder.getOrCreate()

text = spark.read.text("data/corpus_uz/*.txt")             # столбец value
APOS = "[\u02bb\u02bc\u2018\u2019\u0060]"

lines = (text
         .select(F.lower(F.col("value")).alias("line"))
         .select(F.regexp_replace("line", APOS, "'").alias("line")))

words = (lines
         .select(F.explode(F.split("line", "[^a-z']+")).alias("word"))
         .select(F.regexp_replace("word", "^'+|'+$", "").alias("word"))
         .filter(F.col("word") != ""))

freq = words.groupBy("word").count().orderBy(F.desc("count"), "word")
freq.show(10)

freq.write.mode("overwrite").parquet("output/word_freq")
back = spark.read.parquet("output/word_freq")
print("Записано строк:", freq.count(), "| прочитано:", back.count())
print(sorted(os.listdir("output/word_freq")))

freq.limit(20).write.mode("overwrite").csv("output/top20", header=True)
`,
    },
  ],
  quiz: [
    { q: "Какая из операций Spark является **действием** (action) и запускает вычисления?", options: ["`filter`", "`select`", "`count`", "`withColumn`"], answer: 2, explain: "`filter`, `select`, `withColumn` — ленивые трансформации: они только дописывают шаг в план. `count` возвращает результат в драйвер и запускает задание." },
    { q: "Что означает `master(\"local[*]\")`?", options: ["Подключиться к кластеру YARN", "Запустить Spark на этой машине с числом потоков, равным числу ядер", "Запустить ровно одного исполнителя", "Использовать все машины локальной сети"], answer: 1 },
    { q: "Где выполняются задачи (tasks) Spark?", options: ["В драйвере", "В исполнителях (executors)", "В менеджере кластера", "В NameNode"], answer: 1, explain: "Драйвер строит план и раздаёт задачи, а выполняют их процессы-исполнители на узлах кластера." },
    { q: "Почему на Python операции DataFrame обычно быстрее аналогичных операций RDD?", options: ["DataFrame хранит данные в Excel", "План DataFrame оптимизирует Catalyst, а вычисления идут в JVM без пересылки Python-объектов", "RDD не умеет работать с текстом", "DataFrame всегда выполняется на одном узле"], answer: 1 },
    { q: "Что создаёт `df.write.mode(\"overwrite\").parquet(\"output/res\")`?", options: ["Один файл output/res.parquet", "Каталог output/res с файлами part-… и маркером _SUCCESS", "Таблицу в базе данных", "Ничего, пока не вызвать show()"], answer: 1, explain: "Каждый раздел записывается отдельным файлом-частью; `_SUCCESS` означает, что запись завершилась целиком." },
    { q: "На каком порту по умолчанию работает веб-интерфейс Spark UI запущенного приложения?", options: ["9870", "8088", "4040", "27017"], answer: 2, explain: "9870 — веб-интерфейс NameNode HDFS, 8088 — YARN ResourceManager, 27017 — MongoDB." },
  ],
  realEnv: R`
## Вариант 1. Google Colab (проще всего)

В Colab уже есть Java, достаточно установить PySpark:

\`\`\`python
!pip install -q pyspark
from pyspark.sql import SparkSession
spark = SparkSession.builder.appName("UzBigData-L4").master("local[*]").getOrCreate()
spark
\`\`\`

Данные курса: \`!git clone https://github.com/<владелец>/<репозиторий>.git\` и \`%cd <репозиторий>\` — пути \`data/spark/...\` будут работать так же, как в тренажёре. Кнопка «Открыть в Colab» на странице занятия делает это автоматически.

## Вариант 2. Свой компьютер

1. Установите **Java 11 или 17** (например, [Adoptium Temurin](https://adoptium.net)) и проверьте: \`java -version\`. Переменная \`JAVA_HOME\` должна указывать на папку JDK.
2. Установите PySpark в окружение курса:

\`\`\`bash
conda activate bigdata
pip install pyspark==3.5.1          # или: conda install -c conda-forge pyspark openjdk=17
python -c "import pyspark; print(pyspark.__version__)"
\`\`\`

3. Запустите \`jupyter notebook\` и выполните код заданий. Пока работает \`SparkSession\`, откройте **Spark UI: http://localhost:4040** — после каждого действия (\`count\`, \`show\`, \`write\`) там появляются задания (Jobs), этапы (Stages) и задачи.

> [!WARNING] Windows и запись файлов
> Для \`df.write...\` на Windows Spark требует утилиту \`winutils.exe\` (переменная \`HADOOP_HOME\`). Проще работать в WSL (Ubuntu) или в Colab.

## Вариант 3. Databricks Free Edition

[Databricks](https://www.databricks.com/learn/free-edition) — облачная платформа от создателей Spark. После регистрации создайте блокнот: переменная \`spark\` уже готова. Загрузите CSV через *Catalog → Add data* и читайте его \`spark.read.csv(...)\`; результаты удобно смотреть функцией \`display(df)\`.

## Spark поверх HDFS

На кластере Hadoop пути указывают в HDFS, а мастер — \`yarn\`:

\`\`\`bash
spark-submit --master yarn --deploy-mode cluster wordcount.py
\`\`\`

\`\`\`python
lines = spark.read.text("hdfs:///user/student/corpus/raw/*.txt")
freq.write.mode("overwrite").parquet("hdfs:///user/student/project/results/word_freq")
\`\`\`
`,
  homework: R`
## Самостоятельная работа: «Роль Apache Spark в области Big Data»

1. Сравните **Hadoop MapReduce** и **Spark** по критериям: модель вычислений, работа с памятью, скорость итеративных алгоритмов, языки, потоковая обработка, удобство. Оформите таблицей.
2. Опишите путь одной программы: \`spark-submit\` → драйвер → менеджер кластера (YARN) → исполнители → задания, этапы, задачи. Что такое *shuffle* и почему \`reduceByKey\` создаёт новый этап?
3. Найдите 2–3 примера использования Spark в обработке естественного языка (подготовка корпусов, TF-IDF, Spark NLP) и кратко опишите их.
4. **Практика:** расширьте word count из заданий 6–7 — исключите стоп-слова из \`data/stopwords_uz.txt\` (не забудьте привести апострофы к одному виду) и найдите 20 самых частых **биграмм**. Сохраните результат в Parquet.
`,
});
