BDT.register({
  id: "p11",
  kind: "practice",
  num: 11,
  title: "Очистка и преобразование больших объёмов данных с использованием библиотеки Pandas",
  hours: 2,
  env: ["python"],
  goals: [
    "Находить и исправлять типичные проблемы данных: дубликаты, пропуски, разные написания, неверные типы, выбросы",
    "Приводить к единому виду строки, числа, даты и телефоны с помощью методов `str`, `to_numeric`, `to_datetime`",
    "Экономить память (тип `category`, понижение разрядности) и обрабатывать большие файлы по частям (`chunksize`)",
    "Агрегировать очищенные данные: `groupby`, `transform`, `pivot_table`",
  ],
  theory: R`
## Зачем чистить данные

В реальных проектах на очистку и подготовку данных уходит до 80 % времени. «Грязные» данные дают неверные выводы: если Ташкент записан шестью способами (\`Toshkent\`, \`toshkent\`, \`Toshkent sh.\`, \`Tashkent\`, \`TOSHKENT\`, \`" Toshkent "\`), то в статистике по городам он «развалится» на шесть разных городов.

Файл \`data/students_dirty.csv\` содержит все типичные проблемы:

| Проблема | Пример | Как исправить в pandas |
|---|---|---|
| Дубликаты строк | один студент записан дважды | \`df.duplicated()\`, \`df.drop_duplicates()\` |
| Лишние пробелы, регистр | \`"  MURODOV BEHRUZ "\` | \`str.strip()\`, \`str.split()\`, \`str.capitalize()\` |
| Разные написания | \`Samarkand\` / \`samarqand\` | \`str.lower()\` + словарь замен \`replace({...})\` |
| Разные апострофы | \`Farg‘ona\` / \`Farg'ona\` | \`str.replace("‘", "'")\` |
| Число как строка с запятой | \`"3,9"\` | \`str.replace(",", ".")\` + \`pd.to_numeric\` |
| Пропуски | пустой GPA | \`fillna\`, \`groupby(...).transform("median")\` |
| Выбросы | возраст \`150\`, \`-1\` | \`between\`, \`clip\`, пересчёт из \`birth_year\` |
| Даты в разных форматах | \`2023-09-01\`, \`01.09.2023\`, \`2023/09/01\` | \`pd.to_datetime(..., format="mixed", dayfirst=True)\` |
| Телефоны в разном виде | \`+998963922256\` | регулярные выражения \`str.replace(r"\D", "", regex=True)\` |

## Строки: методы .str

\`\`\`python
df["city"] = (df["city"].str.strip()            # убрать пробелы по краям
                        .str.replace("‘", "'")   # единый апостроф
                        .str.lower()             # единый регистр
                        .replace({"tashkent": "toshkent", "toshkent sh.": "toshkent"})
                        .str.capitalize())       # "toshkent" -> "Toshkent"
\`\`\`

> [!WARNING] str.title() и узбекские имена
> \`"QODIROV ULUG'BEK".title()\` даёт \`"Qodirov Ulug'Bek"\`: после апострофа Python считает, что началось новое слово. Для узбекских имён надёжнее делать заглавной только первую букву каждого слова: \`" ".join(w.capitalize() for w in name.split())\`. Это та же задача **нормализации текста**, что и в компьютерной лингвистике (oʻ, gʻ, ʼ).

## Числа, пропуски и выбросы

\`\`\`python
df["gpa"] = pd.to_numeric(df["gpa"].str.replace(",", "."), errors="coerce")   # плохие значения -> NaN
df["gpa"] = df["gpa"].fillna(df.groupby("faculty")["gpa"].transform("median"))  # медиана своего факультета
bad = ~df["age"].between(16, 60)                 # маска выбросов
df.loc[bad, "age"] = 2026 - df.loc[bad, "birth_year"]
\`\`\`

Метод \`transform\` возвращает Series **той же длины**, что и исходная таблица: каждой строке — значение её группы. Поэтому его удобно использовать для заполнения пропусков и для вычисления отклонений от среднего по группе.

## Даты и телефоны

\`\`\`python
df["enroll_date"] = pd.to_datetime(df["enroll_date"], format="mixed", dayfirst=True)
digits = df["phone"].str.replace(r"\D", "", regex=True)           # только цифры: 998901234567
df["phone"] = digits.str.replace(r"^998(\d{2})(\d{3})(\d{2})(\d{2})$", r"+998 \1 \2-\3-\4", regex=True)
\`\`\`

## Память и большие файлы

Строки в pandas хранятся как объекты Python, и каждая занимает десятки байт. Если значений мало (4 факультета, 12 городов), выгоднее тип **category**: значения хранятся один раз, а в столбце — маленькие целые коды.

\`\`\`python
df.memory_usage(deep=True).sum()                 # память в байтах
df["faculty"] = df["faculty"].astype("category")
df["course"] = df["course"].astype("int8")       # 1..4 помещается в 1 байт вместо 8
df["gpa"] = df["gpa"].astype("float32")

# типы можно задать сразу при чтении
big = pd.read_csv("big.csv", dtype={"faculty": "category", "course": "int8"}, usecols=["faculty", "course", "gpa"])
\`\`\`

Если файл не помещается в память, его читают **по частям**: \`chunksize\` возвращает итератор DataFrame-ов. Каждую часть обрабатывают и сохраняют только агрегаты (суммы и количества), а в конце объединяют:

\`\`\`python
parts = []
for chunk in pd.read_csv("big.csv", chunksize=50_000):
    parts.append(chunk.groupby("faculty")["gpa"].agg(["sum", "count"]))
total = pd.concat(parts).groupby(level=0).sum()
mean_gpa = total["sum"] / total["count"]          # среднее нельзя усреднять по частям — только сумма/количество!
\`\`\`

> [!TIP] Сводные таблицы
> \`pd.pivot_table(df, values="gpa", index="faculty", columns="course", aggfunc="mean")\` — средний GPA в разрезе «факультет × курс», аналог сводной таблицы Excel.
`,
  tasks: [
    {
      id: "t1",
      title: "Разведка: дубликаты и пропуски",
      text: R`
1. Прочитайте \`data/students_dirty.csv\` в \`raw\` и осмотрите его (\`info()\`).
2. \`n_dups\` — число полностью повторяющихся строк; \`missing\` — Series с числом пропусков в каждом столбце; \`n_cities_raw\` — сколько **различных** написаний городов в столбце \`city\`.
3. \`df\` — таблица без дубликатов с заново пронумерованным индексом (\`reset_index(drop=True)\`).
`,
      starter: R`import pandas as pd

raw = ...
raw.info()

n_dups = ...
missing = ...
n_cities_raw = ...

df = ...

print("Дубликатов:", n_dups, "| вариантов города:", n_cities_raw)
print(missing[missing > 0])
print(raw.shape, "->", df.shape)
`,
      check: R`
import pandas as pd
r = pd.read_csv("data/students_dirty.csv")
ok(var("raw", pd.DataFrame).shape == r.shape, f"raw — исходная таблица {r.shape}")
ok(var("n_dups") == r.duplicated().sum(), f"n_dups = {r.duplicated().sum()}")
m = var("missing", pd.Series)
ok(m.get("gpa") == r["gpa"].isna().sum() and m.get("attendance") == r["attendance"].isna().sum(), "missing — число пропусков по столбцам (gpa, attendance)")
ok(var("n_cities_raw") == r["city"].nunique(), f"n_cities_raw = {r['city'].nunique()}")
d = var("df", pd.DataFrame)
e = r.drop_duplicates()
ok(len(d) == len(e) and not d.duplicated().any(), f"В df {len(e)} строк без дубликатов")
ok(list(d.index) == list(range(len(d))), "Индекс df пронумерован заново (0, 1, 2, …)")
`,
      hint: "`raw.duplicated().sum()`, `raw.isna().sum()`, `raw[\"city\"].nunique()`, `raw.drop_duplicates().reset_index(drop=True)`.",
      solution: R`import pandas as pd

raw = pd.read_csv("data/students_dirty.csv")
raw.info()

n_dups = raw.duplicated().sum()
missing = raw.isna().sum()
n_cities_raw = raw["city"].nunique()

df = raw.drop_duplicates().reset_index(drop=True)

print("Дубликатов:", n_dups, "| вариантов города:", n_cities_raw)
print(missing[missing > 0])
print(raw.shape, "->", df.shape)
`,
    },
    {
      id: "t2",
      title: "Нормализация строк: ФИО и города",
      setup: R`import pandas as pd
df = pd.read_csv("data/students_dirty.csv").drop_duplicates().reset_index(drop=True)`,
      text: R`
В \`df\` (уже без дубликатов) приведите к единому виду:

1. \`full_name\` — без лишних пробелов, каждое слово с заглавной буквы: \`"  MURODOV BEHRUZ "\` → \`"Murodov Behruz"\`, а \`"Qodirov Ulug'bek"\` должно остаться как есть (осторожно со \`str.title()\`!).
2. \`city\` — одно каноническое написание для каждого города: \`Toshkent\`, \`Samarqand\`, \`Farg'ona\` (с обычным апострофом \`'\`) и т.д. Посмотрите все варианты: \`df["city"].value_counts()\`.
3. \`n_cities\` — число различных городов после очистки.
`,
      starter: R`print(df["city"].value_counts())

df["full_name"] = ...

fix = {
    "tashkent": "toshkent",
    # допишите остальные варианты (в нижнем регистре)
}
df["city"] = ...

n_cities = df["city"].nunique()
print(df["city"].value_counts())
print("Городов:", n_cities)
`,
      check: R`
import pandas as pd
ref = pd.read_csv("data/students.csv").set_index("student_id")
d = var("df", pd.DataFrame)
ok(len(d) == 160 and "student_id" in d.columns, "df содержит 160 студентов")
exp_name = ref.loc[d["student_id"], "full_name"].tolist()
bad = [a for a, b in zip(d["full_name"], exp_name) if a != b]
ok(not bad, "full_name нормализованы" + (f" (неверно, например: {bad[0]!r})" if bad else ""))
exp_city = ref.loc[d["student_id"], "city"].tolist()
badc = sorted(set(a for a, b in zip(d["city"], exp_city) if a != b))
ok(not badc, "Названия городов приведены к одному виду" + (": осталось " + ", ".join(map(repr, badc[:4])) if badc else ""))
ok(var("n_cities") == ref.loc[d["student_id"], "city"].nunique(), f"n_cities = {ref.loc[d['student_id'], 'city'].nunique()}")
`,
      hint: "ФИО: `df[\"full_name\"].str.split().apply(lambda ws: \" \".join(w.capitalize() for w in ws))`. Город: `.str.strip().str.replace(\"‘\", \"'\").str.lower().replace(fix).str.capitalize()`; в `fix` нужны `\"toshkent sh.\"`, `\"samarkand\"`, `\"fargona\"`.",
      solution: R`print(df["city"].value_counts())

df["full_name"] = df["full_name"].str.split().apply(lambda ws: " ".join(w.capitalize() for w in ws))

fix = {
    "tashkent": "toshkent",
    "toshkent sh.": "toshkent",
    "samarkand": "samarqand",
    "fargona": "farg'ona",
}
df["city"] = (df["city"].str.strip()
                        .str.replace("‘", "'")
                        .str.lower()
                        .replace(fix)
                        .str.capitalize())

n_cities = df["city"].nunique()
print(df["city"].value_counts())
print("Городов:", n_cities)
`,
    },
    {
      id: "t3",
      title: "Числа: GPA, выбросы, пропуски",
      setup: R`import pandas as pd
df = pd.read_csv("data/students_dirty.csv").drop_duplicates().reset_index(drop=True)`,
      text: R`
1. \`gpa\` записан строкой, иногда с запятой (\`"3,9"\`). Преобразуйте столбец в число (float).
2. \`n_gpa_missing\` — сколько GPA пропущено **после** преобразования; заполните пропуски **медианой GPA своего факультета** (\`groupby\` + \`transform\`).
3. В \`age\` есть невозможные значения. \`n_bad_age\` — число строк, где возраст вне диапазона 16–60; для них пересчитайте возраст как \`2026 - birth_year\`.
4. Пропуски в \`attendance\` заполните медианой всего столбца.
`,
      starter: R`df["gpa"] = ...
n_gpa_missing = ...
df["gpa"] = ...

bad = ...
n_bad_age = ...
# исправьте возраст в строках bad

df["attendance"] = ...

print("Пропусков GPA было:", n_gpa_missing, "| выбросов возраста:", n_bad_age)
df[["gpa", "age", "attendance"]].describe()
`,
      check: R`
import pandas as pd
r = pd.read_csv("data/students_dirty.csv").drop_duplicates().reset_index(drop=True)
ref = pd.read_csv("data/students.csv").set_index("student_id")
g = pd.to_numeric(r["gpa"].str.replace(",", "."), errors="coerce")
d = var("df", pd.DataFrame)
ok(pd.api.types.is_float_dtype(d["gpa"]), "gpa — числовой столбец (float)")
ok(var("n_gpa_missing") == g.isna().sum(), f"n_gpa_missing = {g.isna().sum()}")
ok(d["gpa"].notna().all(), "В gpa не осталось пропусков")
known = g.notna()
ok((abs(d.loc[known, "gpa"].values - ref.loc[r.loc[known, "student_id"], "gpa"].values) < 1e-9).all(), "Известные значения GPA преобразованы верно («3,9» → 3.9)")
med = g.groupby(r["faculty"]).transform("median")
ok((abs(d.loc[~known, "gpa"] - med[~known]) < 1e-9).all(), "Пропуски GPA заполнены медианой своего факультета")
ok(var("n_bad_age") == (~r["age"].between(16, 60)).sum(), f"n_bad_age = {(~r['age'].between(16, 60)).sum()}")
ok((d["age"].values == ref.loc[r["student_id"], "age"].values).all(), "Выбросы возраста исправлены (age = 2026 − birth_year)")
ok(d["attendance"].notna().all() and abs(d["attendance"].sum() - r["attendance"].fillna(r["attendance"].median()).sum()) < 1e-6, "Пропуски attendance заполнены медианой")
`,
      hint: "`pd.to_numeric(df[\"gpa\"].str.replace(\",\", \".\"))`; медиана группы: `df.groupby(\"faculty\")[\"gpa\"].transform(\"median\")`; маска выбросов: `bad = ~df[\"age\"].between(16, 60)`, затем `df.loc[bad, \"age\"] = 2026 - df.loc[bad, \"birth_year\"]`.",
      solution: R`df["gpa"] = pd.to_numeric(df["gpa"].str.replace(",", "."), errors="coerce")
n_gpa_missing = df["gpa"].isna().sum()
df["gpa"] = df["gpa"].fillna(df.groupby("faculty")["gpa"].transform("median"))

bad = ~df["age"].between(16, 60)
n_bad_age = bad.sum()
df.loc[bad, "age"] = 2026 - df.loc[bad, "birth_year"]

df["attendance"] = df["attendance"].fillna(df["attendance"].median())

print("Пропусков GPA было:", n_gpa_missing, "| выбросов возраста:", n_bad_age)
df[["gpa", "age", "attendance"]].describe()
`,
    },
    {
      id: "t4",
      title: "Даты и телефоны",
      setup: R`import pandas as pd
df = pd.read_csv("data/students_dirty.csv").drop_duplicates().reset_index(drop=True)`,
      text: R`
1. Столбец \`enroll_date\` содержит даты в трёх форматах: \`2023-09-01\`, \`2023/09/01\`, \`01.09.2023\` (день.месяц.год). Преобразуйте его в datetime. Все студенты поступили **1 сентября**.
2. Приведите все телефоны к виду \`+998 90 123-45-67\`. Сначала оставьте только цифры, затем отформатируйте регулярным выражением.
3. \`n_changed\` — у скольких студентов телефон изменился после нормализации.
4. \`by_year\` — Series: сколько студентов поступило в каждом году (\`dt.year\`), по возрастанию года.
`,
      starter: R`old_phone = df["phone"].copy()

df["enroll_date"] = ...

digits = ...
df["phone"] = ...
n_changed = ...

by_year = ...

print(by_year)
print("Изменено телефонов:", n_changed)
df[["full_name", "enroll_date", "phone"]].head()
`,
      check: R`
import re
import pandas as pd
r = pd.read_csv("data/students_dirty.csv").drop_duplicates().reset_index(drop=True)
d = var("df", pd.DataFrame)
ed = d["enroll_date"]
ok(pd.api.types.is_datetime64_any_dtype(ed), "enroll_date преобразован в datetime")
if pd.api.types.is_datetime64_any_dtype(ed):
    ok(((ed.dt.month == 9) & (ed.dt.day == 1)).all(), "Все даты — 1 сентября (формат день.месяц.год распознан верно)")
    ok((ed.dt.year == 2026 - d["course"]).all(), "Год поступления согласуется с курсом")
pat = re.compile(r"^\+998 \d{2} \d{3}-\d{2}-\d{2}$")
ok(all(isinstance(p, str) and pat.match(p) for p in d["phone"]), "Все телефоны в формате +998 XX XXX-XX-XX")
ok([re.sub(r"\D", "", p) for p in d["phone"]] == [re.sub(r"\D", "", p) for p in r["phone"]], "Цифры номеров не изменились")
nc = sum(a != b for a, b in zip(r["phone"], d["phone"]))
ok(var("n_changed") == nc, f"n_changed = {nc}")
by = var("by_year", pd.Series)
ey = (2026 - r["course"]).value_counts().sort_index()
ok(list(by.index) == list(ey.index) and list(by.values) == list(ey.values), "by_year — число поступивших по годам 2022–2025")
`,
      hint: "Даты: `pd.to_datetime(df[\"enroll_date\"], format=\"mixed\", dayfirst=True)`. Цифры: `df[\"phone\"].str.replace(r\"\\D\", \"\", regex=True)`. Формат: `digits.str.replace(r\"^998(\\d{2})(\\d{3})(\\d{2})(\\d{2})$\", r\"+998 \\1 \\2-\\3-\\4\", regex=True)`.",
      solution: R`old_phone = df["phone"].copy()

df["enroll_date"] = pd.to_datetime(df["enroll_date"], format="mixed", dayfirst=True)

digits = df["phone"].str.replace(r"\D", "", regex=True)
df["phone"] = digits.str.replace(r"^998(\d{2})(\d{3})(\d{2})(\d{2})$", r"+998 \1 \2-\3-\4", regex=True)
n_changed = (df["phone"] != old_phone).sum()

by_year = df["enroll_date"].dt.year.value_counts().sort_index()

print(by_year)
print("Изменено телефонов:", n_changed)
df[["full_name", "enroll_date", "phone"]].head()
`,
    },
    {
      id: "t5",
      title: "Экономия памяти: category и downcast",
      setup: R`import os
import numpy as np
import pandas as pd
BIG = "data/big_students.csv"
if not os.path.exists(BIG):
    _rng = np.random.default_rng(2026)
    _n = 300_000
    _fac = np.array(["Kompyuter lingvistikasi", "Filologiya", "Tarjimonlik", "Xalqaro jurnalistika"])
    _city = np.array(["Toshkent", "Samarqand", "Buxoro", "Andijon", "Namangan", "Farg'ona", "Nukus", "Qarshi"])
    _fi = _rng.integers(0, 4, _n)
    _gpa = np.round(np.clip(_rng.normal(3.9, 0.45, _n) + np.array([0.12, 0.0, -0.05, 0.04])[_fi], 2.0, 5.0), 2)
    _gpa[_rng.random(_n) < 0.02] = np.nan
    pd.DataFrame({
        "student_id": np.arange(1, _n + 1),
        "faculty": _fac[_fi],
        "city": _city[_rng.integers(0, 8, _n)],
        "course": _rng.integers(1, 5, _n),
        "gpa": _gpa,
        "attendance": np.round(_rng.uniform(50, 100, _n), 1),
    }).to_csv(BIG, index=False)
    del _rng, _n, _fac, _city, _fi, _gpa`,
      text: R`
Подготовительный код создал «большой» файл \`data/big_students.csv\` (300 000 студентов, путь — в переменной \`BIG\`).

1. Прочитайте его в \`big\` и посчитайте \`mem_before\` — память в **мегабайтах** (\`memory_usage(deep=True).sum() / 1024**2\`).
2. Создайте \`big_opt\` — копию с оптимальными типами: \`faculty\` и \`city\` → \`category\`, \`course\` → \`int8\`, \`gpa\` и \`attendance\` → \`float32\`, \`student_id\` → \`int32\`.
3. \`mem_after\` — память \`big_opt\` в МБ; \`saving_pct\` — экономия в процентах: \`(1 - mem_after / mem_before) * 100\`.
`,
      starter: R`big = pd.read_csv(BIG)
print(big.dtypes)

mem_before = ...

big_opt = big.astype({
    "faculty": ...,
    # допишите остальные столбцы
})

mem_after = ...
saving_pct = ...

print(big_opt.dtypes)
print(f"{mem_before:.1f} МБ -> {mem_after:.1f} МБ, экономия {saving_pct:.0f}%")
`,
      check: R`
import pandas as pd
b = var("big", pd.DataFrame)
ok(len(b) == 300000, "big — 300 000 строк")
mb = b.memory_usage(deep=True).sum() / 1024 ** 2
ok(abs(float(var("mem_before")) - mb) < 0.01, f"mem_before ≈ {mb:.1f} МБ (deep=True)")
o = var("big_opt", pd.DataFrame)
dt = {c: str(t) for c, t in o.dtypes.items()}
ok(dt.get("faculty") == "category" and dt.get("city") == "category", "faculty и city — category")
ok(dt.get("course") == "int8" and dt.get("student_id") == "int32", "course — int8, student_id — int32")
ok(dt.get("gpa") == "float32" and dt.get("attendance") == "float32", "gpa и attendance — float32")
ma = o.memory_usage(deep=True).sum() / 1024 ** 2
ok(abs(float(var("mem_after")) - ma) < 0.01, f"mem_after ≈ {ma:.1f} МБ")
ok(abs(float(var("saving_pct")) - (1 - ma / mb) * 100) < 0.1 and ma < mb / 2, f"saving_pct ≈ {(1 - ma / mb) * 100:.0f}%")
`,
      hint: "`big.astype({\"faculty\": \"category\", \"city\": \"category\", \"course\": \"int8\", \"gpa\": \"float32\", \"attendance\": \"float32\", \"student_id\": \"int32\"})`.",
      solution: R`big = pd.read_csv(BIG)
print(big.dtypes)

mem_before = big.memory_usage(deep=True).sum() / 1024 ** 2

big_opt = big.astype({
    "faculty": "category",
    "city": "category",
    "course": "int8",
    "gpa": "float32",
    "attendance": "float32",
    "student_id": "int32",
})

mem_after = big_opt.memory_usage(deep=True).sum() / 1024 ** 2
saving_pct = (1 - mem_after / mem_before) * 100

print(big_opt.dtypes)
print(f"{mem_before:.1f} МБ -> {mem_after:.1f} МБ, экономия {saving_pct:.0f}%")
`,
    },
    {
      id: "t6",
      title: "Чтение большого файла по частям",
      setup: R`import os
import numpy as np
import pandas as pd
BIG = "data/big_students.csv"
if not os.path.exists(BIG):
    _rng = np.random.default_rng(2026)
    _n = 300_000
    _fac = np.array(["Kompyuter lingvistikasi", "Filologiya", "Tarjimonlik", "Xalqaro jurnalistika"])
    _city = np.array(["Toshkent", "Samarqand", "Buxoro", "Andijon", "Namangan", "Farg'ona", "Nukus", "Qarshi"])
    _fi = _rng.integers(0, 4, _n)
    _gpa = np.round(np.clip(_rng.normal(3.9, 0.45, _n) + np.array([0.12, 0.0, -0.05, 0.04])[_fi], 2.0, 5.0), 2)
    _gpa[_rng.random(_n) < 0.02] = np.nan
    pd.DataFrame({
        "student_id": np.arange(1, _n + 1),
        "faculty": _fac[_fi],
        "city": _city[_rng.integers(0, 8, _n)],
        "course": _rng.integers(1, 5, _n),
        "gpa": _gpa,
        "attendance": np.round(_rng.uniform(50, 100, _n), 1),
    }).to_csv(BIG, index=False)
    del _rng, _n, _fac, _city, _fi, _gpa`,
      text: R`
Представим, что \`data/big_students.csv\` (\`BIG\`) не помещается в память. Обработайте его **по частям** по 50 000 строк, читая только нужные столбцы (\`usecols\`):

- \`n_chunks\` — сколько частей прочитано; \`total_rows\` — сколько всего строк;
- \`mean_gpa\` — Series: средний GPA по факультетам (пропуски GPA не учитываются). Для каждой части сохраняйте **сумму и количество**, а среднее вычислите в конце;
- \`low_att\` — сколько студентов с посещаемостью ниже 60 %;
- \`best_faculty\` — факультет с наибольшим средним GPA.
`,
      starter: R`n_chunks = 0
total_rows = 0
low_att = 0
parts = []

for chunk in pd.read_csv(BIG, chunksize=..., usecols=["faculty", "gpa", "attendance"]):
    ...

total = ...
mean_gpa = ...
best_faculty = ...

print(n_chunks, "частей,", total_rows, "строк; посещаемость < 60%:", low_att)
print(mean_gpa.round(3))
print("Лучший факультет:", best_faculty)
`,
      check: R`
import pandas as pd
full = pd.read_csv(var("BIG"))
ok(uses("chunksize"), "Файл читается по частям (chunksize)")
ok(uses("usecols"), "Читаются только нужные столбцы (usecols)")
ok(var("n_chunks") == 6, "n_chunks = 6 (300 000 / 50 000)")
ok(var("total_rows") == len(full), f"total_rows = {len(full)}")
em = full.groupby("faculty")["gpa"].mean()
mg = var("mean_gpa", pd.Series)
ok(set(mg.index) == set(em.index) and all(abs(mg[k] - em[k]) < 1e-6 for k in em.index), "mean_gpa — точное среднее по факультетам (сумма / количество)")
ok(var("low_att") == int((full["attendance"] < 60).sum()), f"low_att = {int((full['attendance'] < 60).sum())}")
ok(var("best_faculty") == em.idxmax(), f"best_faculty = {em.idxmax()}")
`,
      hint: "В цикле: `n_chunks += 1`, `total_rows += len(chunk)`, `low_att += (chunk[\"attendance\"] < 60).sum()`, `parts.append(chunk.groupby(\"faculty\")[\"gpa\"].agg([\"sum\", \"count\"]))`. После цикла: `total = pd.concat(parts).groupby(level=0).sum()`, `mean_gpa = total[\"sum\"] / total[\"count\"]`.",
      solution: R`n_chunks = 0
total_rows = 0
low_att = 0
parts = []

for chunk in pd.read_csv(BIG, chunksize=50_000, usecols=["faculty", "gpa", "attendance"]):
    n_chunks += 1
    total_rows += len(chunk)
    low_att += int((chunk["attendance"] < 60).sum())
    parts.append(chunk.groupby("faculty")["gpa"].agg(["sum", "count"]))

total = pd.concat(parts).groupby(level=0).sum()
mean_gpa = total["sum"] / total["count"]
best_faculty = mean_gpa.idxmax()

print(n_chunks, "частей,", total_rows, "строк; посещаемость < 60%:", low_att)
print(mean_gpa.round(3))
print("Лучший факультет:", best_faculty)
`,
    },
    {
      id: "t7",
      title: "Агрегация чистых данных: transform и pivot_table",
      setup: R`import pandas as pd
# полный конвейер очистки из заданий 1–4
df = pd.read_csv("data/students_dirty.csv").drop_duplicates().reset_index(drop=True)
df["full_name"] = df["full_name"].str.split().apply(lambda ws: " ".join(w.capitalize() for w in ws))
df["city"] = (df["city"].str.strip().str.replace("‘", "'").str.lower()
              .replace({"tashkent": "toshkent", "toshkent sh.": "toshkent", "samarkand": "samarqand", "fargona": "farg'ona"})
              .str.capitalize())
df["gpa"] = pd.to_numeric(df["gpa"].str.replace(",", "."))
df["gpa"] = df["gpa"].fillna(df.groupby("faculty")["gpa"].transform("median"))
_bad = ~df["age"].between(16, 60)
df.loc[_bad, "age"] = 2026 - df.loc[_bad, "birth_year"]
df["attendance"] = df["attendance"].fillna(df["attendance"].median())
df["enroll_date"] = pd.to_datetime(df["enroll_date"], format="mixed", dayfirst=True)
del _bad`,
      text: R`
\`df\` — полностью очищенная таблица (см. подготовительный код). Проанализируйте её:

1. \`df["gpa_diff"]\` — отклонение GPA студента от **среднего GPA его группы** (\`group\`), используйте \`transform\`.
2. \`df["rank_in_faculty"]\` — место студента по GPA внутри факультета (1 — лучший; \`groupby(...)["gpa"].rank(ascending=False, method="min")\`).
3. \`pivot\` — сводная таблица среднего GPA: строки — \`faculty\`, столбцы — \`course\` (\`pd.pivot_table\`), округлите до 2 знаков.
4. \`best_cell\` — кортеж \`(факультет, курс)\` с максимальным средним GPA в \`pivot\`.
5. \`leaders\` — DataFrame лучших студентов каждого факультета (\`rank_in_faculty == 1\`) со столбцами \`faculty\`, \`full_name\`, \`gpa\`.
`,
      starter: R`df["gpa_diff"] = ...
df["rank_in_faculty"] = ...

pivot = ...
best_cell = ...

leaders = ...

print("Лучшая комбинация:", best_cell)
print(leaders)
pivot
`,
      check: R`
import pandas as pd
d = var("df", pd.DataFrame)
num = lambda c: c in d.columns and pd.api.types.is_numeric_dtype(d[c])
ok(num("gpa_diff") and (abs(d["gpa_diff"] - (d["gpa"] - d.groupby("group")["gpa"].transform("mean"))) < 1e-9).all(), "gpa_diff — отклонение от среднего GPA своей группы")
er = d.groupby("faculty")["gpa"].rank(ascending=False, method="min")
ok(num("rank_in_faculty") and (d["rank_in_faculty"] == er).all(), "rank_in_faculty — место по GPA внутри факультета")
pv = var("pivot", pd.DataFrame)
ep = pd.pivot_table(d, values="gpa", index="faculty", columns="course", aggfunc="mean").round(2)
ok(pv.shape == ep.shape and list(pv.index) == list(ep.index) and (abs(pv.values - ep.values) < 0.006).all(), "pivot — средний GPA: факультеты × курсы")
bc = var("best_cell")
cell = ep.stack().idxmax()
ok(tuple(bc) == (cell[0], cell[1]), f"best_cell = {cell}")
ld = var("leaders", pd.DataFrame)
el = d[er == 1]
ok({"faculty", "full_name", "gpa"} <= set(ld.columns) and sorted(ld["full_name"]) == sorted(el["full_name"]), f"leaders — {len(el)} лучших студентов факультетов")
`,
      hint: "`df.groupby(\"group\")[\"gpa\"].transform(\"mean\")`; `pd.pivot_table(df, values=\"gpa\", index=\"faculty\", columns=\"course\", aggfunc=\"mean\").round(2)`; ячейка с максимумом: `pivot.stack().idxmax()`.",
      solution: R`df["gpa_diff"] = df["gpa"] - df.groupby("group")["gpa"].transform("mean")
df["rank_in_faculty"] = df.groupby("faculty")["gpa"].rank(ascending=False, method="min")

pivot = pd.pivot_table(df, values="gpa", index="faculty", columns="course", aggfunc="mean").round(2)
best_cell = pivot.stack().idxmax()

leaders = df.loc[df["rank_in_faculty"] == 1, ["faculty", "full_name", "gpa"]]

print("Лучшая комбинация:", best_cell)
print(leaders)
pivot
`,
    },
  ],
  quiz: [
    { q: "Что вернёт `df.groupby(\"faculty\")[\"gpa\"].transform(\"median\")`?", options: ["Таблицу из 4 строк — по одной на факультет", "Series той же длины, что df: каждой строке — медиана её факультета", "Одно число", "Отсортированный df"], answer: 1, explain: "`transform` «растягивает» результат группы на все строки этой группы — удобно для `fillna` и отклонений от среднего." },
    { q: "Почему для узбекских имён опасен `str.title()`?", options: ["После апострофа он делает букву заглавной: Ulug'Bek", "Он удаляет апострофы", "Он не работает с латиницей", "Он меняет порядок слов"], answer: 0 },
    { q: "Как преобразовать строку `\"3,9\"` в число 3.9 для всего столбца?", options: ["`df[\"gpa\"].astype(int)`", "`df[\"gpa\"].round()`", "`df[\"gpa\"].fillna(0)`", "`pd.to_numeric(df[\"gpa\"].str.replace(\",\", \".\"))`"], answer: 3 },
    { q: "Когда тип `category` экономит больше всего памяти?", options: ["Когда все значения уникальны", "Для дробных чисел", "Когда в текстовом столбце мало различных значений и много строк", "Для дат"], answer: 2, explain: "Категории хранят каждое значение один раз, а в столбце — короткие коды. Для уникальных значений (ФИО) выигрыша нет." },
    { q: "Файл читается частями `chunksize=50_000`. Как правильно получить общее среднее GPA?", options: ["Усреднить средние всех частей", "Сложить суммы и количества всех частей, затем поделить", "Взять среднее последней части", "Это невозможно без чтения всего файла"], answer: 1, explain: "Среднее средних неверно, если части разного размера или в них разное число пропусков. Сумма/количество даёт точный результат." },
    { q: "Какой параметр `pd.to_datetime` позволяет разобрать в одном столбце даты разных форматов?", options: ["`format=\"mixed\"`", "`errors=\"ignore\"`", "`unit=\"s\"`", "`utc=True`"], answer: 0, explain: "`format=\"mixed\"` определяет формат для каждого значения отдельно; `dayfirst=True` подсказывает, что в `01.09.2023` первым идёт день." },
  ],
  realEnv: R`
## Как выполнить работу в реальной среде

В **Jupyter** (Anaconda) или **Google Colab** код заданий работает без изменений. Большой файл можно сгенерировать тем же кодом из подготовительной ячейки, увеличив \`_n\` до 5–10 миллионов строк, — тогда разница в памяти и скорости станет по-настоящему заметной.

\`\`\`python
%%time
big = pd.read_csv("big_students.csv")                       # замер времени ячейки в Jupyter
big.info(memory_usage="deep")                                # подробный отчёт о памяти
\`\`\`

### Когда pandas уже не хватает

| Инструмент | Идея | Пример |
|---|---|---|
| \`pandas\` + \`chunksize\` | читать по частям | файлы в несколько ГБ |
| **PyArrow** / Parquet | колоночный формат, сжатие, быстрое чтение | \`df.to_parquet("big.parquet")\` |
| **Dask** | тот же API pandas, но параллельно и по частям | \`dd.read_csv("big_*.csv").groupby("faculty").gpa.mean().compute()\` |
| **Polars** | быстрый DataFrame на Rust | \`pl.scan_csv("big.csv").group_by("faculty").agg(pl.col("gpa").mean())\` |
| **Apache Spark** | распределённая обработка на кластере | терабайты в HDFS |

> [!TIP] Сохраняйте результат очистки
> Очищенную таблицу сохраняйте в **Parquet** (\`df.to_parquet(...)\`, нужен \`pyarrow\`): типы \`category\` и \`datetime\` сохранятся, а файл будет в несколько раз меньше CSV.
`,
  homework: R`
## Самостоятельная работа: «Методы очистки больших объёмов данных» и «Сравнение библиотек NumPy и Dask»

1. Оформите конвейер очистки \`students_dirty.csv\` как функцию \`clean_students(df)\` из маленьких шагов и примените её через \`df.pipe(...)\`. Сохраните результат в CSV и Parquet, сравните размеры файлов.
2. Найдите выбросы GPA и посещаемости методом **межквартильного размаха** (IQR: значения вне \`[Q1 − 1.5·IQR; Q3 + 1.5·IQR]\`) и решите, удалять их или ограничивать (\`clip\`).
3. В Colab установите \`dask\` и сравните время вычисления среднего GPA по факультетам для файла на 5 млн строк тремя способами: pandas целиком, pandas с \`chunksize\`, \`dask.dataframe\`. Объясните, чем Dask отличается от NumPy (ленивые вычисления, граф задач, параллелизм).
`,
});
