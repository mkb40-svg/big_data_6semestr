BDT.register({
  id: "p01",
  kind: "practice",
  num: 1,
  title: "Настройка среды Python, Anaconda и Jupyter Notebook. Загрузка и просмотр CSV и Excel",
  hours: 2,
  env: ["python"],
  goals: [
    "Понять, из чего состоит рабочая среда аналитика данных: Python, Anaconda, Jupyter",
    "Научиться читать CSV и Excel с помощью `pandas`",
    "Освоить первичный осмотр набора данных: `head`, `shape`, `info`, `describe`",
  ],
  theory: R`
## Рабочая среда для Big Data на Python

**Python** — основной язык анализа данных. Вокруг него выросла экосистема библиотек:

| Библиотека | Назначение |
|---|---|
| \`pandas\` | таблицы (DataFrame): чтение, очистка, группировка |
| \`numpy\` | быстрые вычисления над массивами |
| \`matplotlib\`, \`seaborn\` | графики |
| \`openpyxl\` | чтение и запись Excel (.xlsx) |

**Anaconda** — дистрибутив Python для науки о данных. В него входят сам Python, менеджер пакетов **conda** и сотни библиотек. Conda создаёт изолированные **окружения**: в каждом свои версии пакетов.

\`\`\`bash Команды conda (Anaconda Prompt / терминал)
conda create -n bigdata python=3.11      # создать окружение
conda activate bigdata                   # активировать его
conda install pandas numpy matplotlib openpyxl jupyter
conda env list                           # список окружений
jupyter notebook                         # запустить Jupyter в браузере
\`\`\`

**Jupyter Notebook** — интерактивный блокнот. Код пишется в **ячейках**, а результат (таблицы, графики) появляется сразу под ячейкой:

- <kbd>Shift+Enter</kbd> — выполнить ячейку и перейти к следующей;
- ячейки бывают типа *Code* и *Markdown*;
- значение **последнего выражения** в ячейке выводится автоматически, без \`print\`;
- переменные живут в **ядре** (kernel), пока его не перезапустили.

> [!NOTE] Как устроен этот тренажёр
> Редактор задания работает как ячейка Jupyter: последнее выражение выводится, DataFrame показывается таблицей. Python здесь настоящий (CPython в браузере через Pyodide), учебные файлы лежат в папке \`data/\`.

## Чтение данных в pandas

\`\`\`python
import pandas as pd

df = pd.read_csv("data/students.csv")   # CSV → DataFrame
df.head()          # первые 5 строк
df.tail(3)         # последние 3 строки
df.shape           # (число строк, число столбцов)
df.columns         # названия столбцов
df.dtypes          # типы столбцов
df.info()          # сводка: типы, непустые значения, память
df.describe()      # статистика по числовым столбцам
df["city"].value_counts()   # частоты значений
\`\`\`

Excel-файл может содержать несколько **листов**:

\`\`\`python
xl = pd.ExcelFile("data/sales.xlsx")
xl.sheet_names                                    # список листов
df26 = pd.read_excel("data/sales.xlsx", sheet_name="2026")
all_sheets = pd.read_excel("data/sales.xlsx", sheet_name=None)  # словарь {лист: DataFrame}
\`\`\`

> [!TIP] Полезные параметры read_csv
> \`sep=";"\` — другой разделитель, \`encoding="utf-8"\` — кодировка, \`usecols=[...]\` — только нужные столбцы, \`nrows=1000\` — прочитать первые строки большого файла.

### Учебные наборы данных

| Файл | Что внутри |
|---|---|
| \`data/students.csv\` | 200 студентов: факультет, группа, город, GPA, посещаемость |
| \`data/sales.xlsx\` | продажи книжного магазина: листы \`2025\`, \`2026\`, \`kitoblar\` |
`,
  tasks: [
    {
      id: "t1",
      title: "Проверка среды",
      text: R`
Убедитесь, что среда работает, и узнайте версии инструментов.

1. Сохраните версию Python в переменную \`py_version\` строкой вида \`"3.13.2"\` (подойдёт \`platform.python_version()\`).
2. Выведите на экран версии \`pandas\` и \`numpy\` (атрибут \`__version__\`).
`,
      starter: R`import platform
import pandas as pd
import numpy as np

py_version = ...   # версия Python строкой

print("Python:", py_version)
print("pandas:", ...)
print("numpy:", ...)
`,
      check: R`
import pandas as pd, numpy as np, platform
v = var("py_version")
ok(isinstance(v, str) and v == platform.python_version(), "В py_version записана версия Python, например «3.13.2»")
ok(pd.__version__ in out, "На экран выведена версия pandas")
ok(np.__version__ in out, "На экран выведена версия numpy")
`,
      hint: "Версия библиотеки хранится в атрибуте `__version__`: `pd.__version__`.",
      solution: R`import platform
import pandas as pd
import numpy as np

py_version = platform.python_version()

print("Python:", py_version)
print("pandas:", pd.__version__)
print("numpy:", np.__version__)
`,
    },
    {
      id: "t2",
      title: "Чтение CSV-файла",
      text: R`
Прочитайте файл \`data/students.csv\` в переменную \`df\` и выведите его размер (\`df.shape\`).
Последней строкой ячейки оставьте \`df.head()\`, чтобы увидеть таблицу.
`,
      starter: R`import pandas as pd

df = ...
print(df.shape)
df.head()
`,
      check: R`
import pandas as pd
df = var("df", pd.DataFrame)
ok(df.shape == (200, 12), "df содержит 200 строк и 12 столбцов")
ok("(200, 12)" in out, "Размер таблицы выведен на экран")
`,
      hint: "Используйте `pd.read_csv(\"data/students.csv\")`.",
      solution: R`import pandas as pd

df = pd.read_csv("data/students.csv")
print(df.shape)
df.head()
`,
    },
    {
      id: "t3",
      title: "Структура таблицы",
      setup: R`import pandas as pd
df = pd.read_csv("data/students.csv")`,
      text: R`
Таблица \`df\` уже загружена (см. подготовленный код). Изучите её структуру:

- \`n_rows\` — число строк, \`n_cols\` — число столбцов;
- \`numeric_cols\` — **список** названий числовых столбцов (подсказка: \`select_dtypes\`);
- вызовите \`df.info()\`, чтобы увидеть типы и пропуски.
`,
      starter: R`n_rows = ...
n_cols = ...
numeric_cols = ...

df.info()
print(n_rows, n_cols, numeric_cols)
`,
      check: R`
import pandas as pd
df = pd.read_csv("data/students.csv")
ok(var("n_rows") == 200, "n_rows = 200")
ok(var("n_cols") == 12, "n_cols = 12")
nc = var("numeric_cols")
ok(isinstance(nc, list), "numeric_cols — это список (list)")
ok(sorted(nc) == sorted(df.select_dtypes("number").columns.tolist()), "numeric_cols содержит все числовые столбцы: birth_year, age, course, gpa, attendance")
ok("RangeIndex" in out or "Data columns" in out, "Вызван df.info()")
`,
      hint: "`df.shape[0]` — строки, `df.shape[1]` — столбцы. Числовые столбцы: `df.select_dtypes(\"number\").columns.tolist()`.",
      solution: R`n_rows = df.shape[0]
n_cols = df.shape[1]
numeric_cols = df.select_dtypes("number").columns.tolist()

df.info()
print(n_rows, n_cols, numeric_cols)
`,
    },
    {
      id: "t4",
      title: "Первичная статистика",
      setup: R`import pandas as pd
df = pd.read_csv("data/students.csv")`,
      text: R`
Ответьте на вопросы о студентах с помощью pandas:

- \`mean_gpa\` — средний GPA, округлённый до 2 знаков (\`round(..., 2)\`);
- \`top_city\` — город, из которого больше всего студентов;
- \`n_faculties\` — количество различных факультетов;
- \`gpa_stats\` — результат \`df["gpa"].describe()\`.
`,
      starter: R`mean_gpa = ...
top_city = ...
n_faculties = ...
gpa_stats = ...

print("Средний GPA:", mean_gpa)
print("Самый частый город:", top_city)
print("Факультетов:", n_faculties)
gpa_stats
`,
      check: R`
import pandas as pd
df = pd.read_csv("data/students.csv")
ok(var("mean_gpa") == round(df["gpa"].mean(), 2), "mean_gpa — среднее GPA с 2 знаками после запятой")
ok(var("top_city") == df["city"].value_counts().idxmax(), "top_city определён верно")
ok(var("n_faculties") == df["faculty"].nunique(), "n_faculties — число уникальных факультетов")
g = var("gpa_stats")
ok(isinstance(g, pd.Series) and "mean" in g.index, "gpa_stats — результат describe() для столбца gpa")
`,
      hint: "`df[\"city\"].value_counts().idxmax()` возвращает самое частое значение; `nunique()` считает уникальные.",
      solution: R`mean_gpa = round(df["gpa"].mean(), 2)
top_city = df["city"].value_counts().idxmax()
n_faculties = df["faculty"].nunique()
gpa_stats = df["gpa"].describe()

print("Средний GPA:", mean_gpa)
print("Самый частый город:", top_city)
print("Факультетов:", n_faculties)
gpa_stats
`,
    },
    {
      id: "t5",
      title: "Чтение Excel: листы",
      text: R`
Файл \`data/sales.xlsx\` содержит несколько листов.

1. Получите список листов в переменную \`sheets\` (через \`pd.ExcelFile\`).
2. Прочитайте лист **2026** в переменную \`sales26\` и выведите число строк.
`,
      starter: R`import pandas as pd

xl = ...
sheets = ...
print(sheets)

sales26 = ...
print(len(sales26))
sales26.head()
`,
      check: R`
import pandas as pd
ok(var("sheets") == ["2025", "2026", "kitoblar"], "sheets = ['2025', '2026', 'kitoblar']")
s = var("sales26", pd.DataFrame)
ok(len(s) == 300, "В sales26 300 строк (лист 2026)")
ok("price_uzs" in s.columns, "Столбцы прочитаны из заголовка листа")
`,
      hint: "`xl = pd.ExcelFile(\"data/sales.xlsx\")`, затем `xl.sheet_names`. Лист читается так: `pd.read_excel(путь, sheet_name=\"2026\")`.",
      solution: R`import pandas as pd

xl = pd.ExcelFile("data/sales.xlsx")
sheets = xl.sheet_names
print(sheets)

sales26 = pd.read_excel("data/sales.xlsx", sheet_name="2026")
print(len(sales26))
sales26.head()
`,
    },
    {
      id: "t6",
      title: "Объединение листов и выручка",
      text: R`
Прочитайте **все** листы файла одним вызовом (\`sheet_name=None\` возвращает словарь). Объедините листы \`2025\` и \`2026\` в один DataFrame \`sales_all\` (\`pd.concat\`, \`ignore_index=True\`).

Добавьте столбец \`revenue = qty * price_uzs\` и посчитайте общую выручку \`total_revenue\` (целое число).
`,
      starter: R`import pandas as pd

books = pd.read_excel("data/sales.xlsx", sheet_name=None)
print(books.keys())

sales_all = ...
sales_all["revenue"] = ...
total_revenue = ...

print(f"Продаж: {len(sales_all)}, выручка: {total_revenue:,} сум")
`,
      check: R`
import pandas as pd
s = var("sales_all", pd.DataFrame)
ok(len(s) == 540, "sales_all содержит 540 строк (240 + 300)")
ok(list(s.index[:3]) == [0, 1, 2] and s.index.is_unique, "Индекс непрерывный (ignore_index=True)")
ok("revenue" in s.columns and (s["revenue"] == s["qty"] * s["price_uzs"]).all(), "Столбец revenue = qty * price_uzs")
exp = int((s["qty"] * s["price_uzs"]).sum())
ok(int(var("total_revenue")) == exp, f"total_revenue = {exp:,}")
`,
      hint: "`pd.concat([books[\"2025\"], books[\"2026\"]], ignore_index=True)`; сумма — `sales_all[\"revenue\"].sum()`.",
      solution: R`import pandas as pd

books = pd.read_excel("data/sales.xlsx", sheet_name=None)
print(books.keys())

sales_all = pd.concat([books["2025"], books["2026"]], ignore_index=True)
sales_all["revenue"] = sales_all["qty"] * sales_all["price_uzs"]
total_revenue = int(sales_all["revenue"].sum())

print(f"Продаж: {len(sales_all)}, выручка: {total_revenue:,} сум")
`,
    },
  ],
  quiz: [
    { q: "Какая команда создаёт новое окружение conda с Python 3.11?", options: ["`pip install python==3.11`", "`conda create -n bigdata python=3.11`", "`conda activate python3.11`", "`jupyter new bigdata`"], answer: 1, explain: "`conda create -n <имя> python=<версия>` создаёт окружение, `conda activate` — включает его." },
    { q: "Какое сочетание клавиш выполняет ячейку Jupyter и переходит к следующей?", options: ["Ctrl+S", "Alt+Enter", "Shift+Enter", "Ctrl+Z"], answer: 2 },
    { q: "Что возвращает `df.shape`?", options: ["Список столбцов", "Кортеж (строки, столбцы)", "Типы данных", "Первые 5 строк"], answer: 1 },
    { q: "Как прочитать все листы Excel-файла сразу?", options: ["`pd.read_excel(f, sheet_name=None)`", "`pd.read_excel(f, all=True)`", "`pd.read_csv(f)`", "`pd.ExcelFile(f).read()`"], answer: 0, explain: "При `sheet_name=None` возвращается словарь `{имя_листа: DataFrame}`." },
    { q: "Какой метод показывает типы столбцов, количество непустых значений и объём памяти?", options: ["`df.describe()`", "`df.head()`", "`df.info()`", "`df.columns`"], answer: 2 },
  ],
  realEnv: R`
## Установка Anaconda и запуск Jupyter

1. Скачайте Anaconda Distribution с сайта [anaconda.com/download](https://www.anaconda.com/download) (Windows, 64-bit) и установите с настройками по умолчанию.
2. Откройте **Anaconda Prompt** и создайте окружение курса:

\`\`\`bash
conda create -n bigdata python=3.11 -y
conda activate bigdata
conda install -y pandas numpy matplotlib seaborn openpyxl jupyter requests beautifulsoup4
pip install wordcloud pymongo pyspark
\`\`\`

3. Скачайте учебные данные: на GitHub откройте репозиторий тренажёра → **Code → Download ZIP** и распакуйте. Папка \`data/\` содержит все файлы.
4. Перейдите в папку с распакованным репозиторием и запустите Jupyter:

\`\`\`bash
cd C:\Users\Имя\Downloads\bigdata-trainer
jupyter notebook
\`\`\`

5. Создайте блокнот (**New → Python 3**) и выполните код заданий. Пути \`data/...\` будут работать так же, как в тренажёре.

> [!TIP] Google Colab
> Без установки можно работать в [Google Colab](https://colab.research.google.com): это Jupyter в облаке. Скачать данные в Colab можно командой
> \`!git clone https://github.com/<владелец>/<репозиторий>.git\` и затем \`%cd <репозиторий>\`.
`,
});
