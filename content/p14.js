/* П14. Визуализация данных: matplotlib, pandas .plot, seaborn, WordCloud. */
const P14_NORM = R`import re, glob
from collections import Counter

def normalize(text):
    """Нижний регистр и единые апострофы: oʻ/gʻ (U+02BB), остальные — ʼ (U+02BC)."""
    text = text.lower()
    for ch in ["'", "\u2018", "\u2019", "\x60", "\u02bb"]:
        text = text.replace(ch, "\u02bc")
    return re.sub("([og])\u02bc", "\\1\u02bb", text)

texts = [open(f, encoding="utf-8").read() for f in sorted(glob.glob("data/corpus_uz/uz_*.txt"))]
stop = set(open("data/stopwords_uz.txt", encoding="utf-8").read().split())
`;

BDT.register({
  id: "p14",
  kind: "practice",
  num: 14,
  title: "Визуализация данных: построение графиков, диаграмм и создание облака слов (Word Cloud)",
  hours: 2,
  env: ["python"],
  goals: [
    "Выбирать тип графика под задачу: сравнение, динамика, распределение, доли, связь величин",
    "Строить графики в matplotlib (bar, line, hist, pie, scatter) с заголовками и подписями осей, объединять их через `subplots`",
    "Быстро строить графики методом pandas `.plot` и статистические диаграммы seaborn",
    "Создавать облако слов (Word Cloud) по частотам корпуса с учётом стоп-слов и апострофов",
  ],
  theory: R`
## Зачем визуализировать данные

Таблица из тысяч строк ничего не говорит человеку, а хороший график показывает закономерность за секунды: пик активности в соцсети, самый популярный факультет, связь посещаемости и оценок. В Big Data визуализация — последний шаг конвейера: сначала данные **агрегируются** (группировка, подсчёт частот), а на график выводится уже компактный результат.

## Анатомия графика matplotlib

**Figure** — весь рисунок, **Axes** — отдельная область с осями (на одном рисунке их может быть несколько).

\`\`\`python
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(8, 4))     # рисунок 8×4 дюйма с одной областью
ax.bar(["A", "B", "C"], [5, 3, 7], color="steelblue")
ax.set_title("Заголовок графика")
ax.set_xlabel("Подпись оси X")
ax.set_ylabel("Подпись оси Y (единицы!)")
plt.show()                                  # показать рисунок
\`\`\`

| Задача | Тип графика | matplotlib |
|---|---|---|
| Сравнить категории | столбчатая | \`ax.bar\`, \`ax.barh\` |
| Показать динамику во времени | линейный | \`ax.plot(x, y, marker="o")\` |
| Увидеть распределение величины | гистограмма | \`ax.hist(x, bins=15)\` |
| Показать доли целого (до 5–6 частей) | круговая | \`ax.pie(values, labels=..., autopct="%1.0f%%")\` |
| Найти связь двух величин | точечная | \`ax.scatter(x, y, alpha=0.6)\` |

## Несколько графиков на одном рисунке

\`\`\`python
fig, axes = plt.subplots(1, 3, figsize=(15, 4))   # 1 строка, 3 столбца
axes[0].hist(df["gpa"], bins=15)
axes[1].scatter(df["attendance"], df["gpa"], alpha=0.5)
axes[2].pie(levels, labels=levels.index, autopct="%1.0f%%")
fig.suptitle("Общий заголовок")
plt.tight_layout()                                 # убрать наложения подписей
\`\`\`

Для сетки \`plt.subplots(2, 2)\` области адресуются двумя индексами: \`axes[0, 1]\` — первая строка, второй столбец.

## Быстрые графики pandas

У Series и DataFrame есть метод \`.plot\` — обёртка над matplotlib:

\`\`\`python
df["city"].value_counts().head(5).plot(kind="barh", title="Топ-5 городов")
table.plot(ax=axes[1], marker="o")      # DataFrame: каждая колонка — отдельная линия с легендой
series.plot(kind="pie", autopct="%1.0f%%")
\`\`\`

Параметр \`ax=\` позволяет нарисовать график pandas в нужной области \`subplots\`.

## seaborn — статистические графики

seaborn строит графики прямо по DataFrame и сам считает средние, квартили, плотности:

\`\`\`python
import seaborn as sns
sns.histplot(data=df, x="gpa", hue="gender", kde=True)    # гистограмма + плотность
sns.boxplot(data=df, x="faculty", y="gpa")                # медиана, квартили, выбросы
sns.barplot(data=df, x="english_level", y="attendance")   # среднее и доверительный интервал
sns.heatmap(df[cols].corr(), annot=True, cmap="coolwarm") # матрица цветом
\`\`\`

> [!NOTE] «Ящик с усами» (boxplot)
> Линия внутри ящика — **медиана**, границы ящика — 1-й и 3-й квартили, «усы» — разброс без выбросов, отдельные точки — выбросы.

## Облако слов (Word Cloud)

Облако слов показывает частые слова корпуса: чем чаще слово, тем крупнее шрифт. Это не точный график, а наглядная иллюстрация темы текста.

\`\`\`python
from wordcloud import WordCloud
from collections import Counter

freq = Counter(words)                         # слова уже очищены от стоп-слов
wc = WordCloud(width=600, height=300, background_color="white",
               max_words=100).generate_from_frequencies(freq)
plt.imshow(wc, interpolation="bilinear")
plt.axis("off")
plt.show()
wc.words_                                     # {слово: относительный размер}
\`\`\`

- **Стоп-слова** (va, bu, bilan, uchun…) обязательно удаляют: иначе они займут всё облако.
- Метод \`generate(text)\` сам разбивает текст и удаляет **английские** стоп-слова; для узбекского надёжнее считать частоты самим и вызывать \`generate_from_frequencies\`.

> [!WARNING] Апострофы и шрифт
> Встроенный шрифт WordCloud не содержит символов ʻ (U+02BB) и ʼ (U+02BC) — вместо них появятся пустые квадраты. Перед построением облака замените их на обычный \`'\`: \`w.replace("ʻ", "'").replace("ʼ", "'")\` — или укажите шрифт с нужными глифами: \`WordCloud(font_path="arial.ttf")\`.

## Правила хорошего графика

1. Заголовок и подписи осей с единицами измерения (сум, млн сум, %, шт.).
2. Столбцы сортируют по величине; длинные подписи — горизонтальная диаграмма \`barh\`.
3. Круговая диаграмма — только для 2–6 долей одного целого.
4. Одна мысль — один график; для сравнения нескольких — \`subplots\` с общей шкалой.
5. Сохранение для отчёта: \`fig.savefig("chart.png", dpi=200, bbox_inches="tight")\`.
`,
  tasks: [
    {
      id: "t1",
      title: "Столбчатая диаграмма",
      text: R`
Постройте **вертикальную** столбчатую диаграмму числа студентов по факультетам (\`data/students.csv\`).

- \`counts\` — Series: число студентов на каждом факультете (\`value_counts\`);
- график \`ax.bar\` с заголовком и подписями обеих осей.
`,
      starter: R`import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/students.csv")
counts = ...      # число студентов по факультетам

fig, ax = plt.subplots(figsize=(8, 4))
ax.bar(counts.index, counts.values, color="steelblue")
# добавьте заголовок и подписи осей

plt.xticks(rotation=15)
plt.show()
`,
      check: R`
import pandas as pd
df = pd.read_csv("data/students.csv")
vc = df["faculty"].value_counts()
c = var("counts", pd.Series)
ok(c.sort_index().to_dict() == vc.sort_index().to_dict(), "counts — число студентов на каждом факультете")
ok(len(figs) >= 1, "Построен график (plt.show())")
if figs:
    ax = figs[0].axes[0]
    ok(len(ax.patches) == len(vc), f"На графике {len(vc)} столбца — по числу факультетов")
    ok(sorted(round(p.get_height()) for p in ax.patches) == sorted(int(v) for v in vc.values), "Высота столбцов равна числу студентов")
    ok(ax.get_title() != "", "У графика есть заголовок (ax.set_title)")
    ok(ax.get_xlabel() != "" and ax.get_ylabel() != "", "Подписаны обе оси (ax.set_xlabel, ax.set_ylabel)")
`,
      hint: "`counts = df[\"faculty\"].value_counts()`; затем `ax.set_title(\"Студенты по факультетам\")`, `ax.set_xlabel(\"Факультет\")`, `ax.set_ylabel(\"Число студентов\")`.",
      solution: R`import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/students.csv")
counts = df["faculty"].value_counts()

fig, ax = plt.subplots(figsize=(8, 4))
ax.bar(counts.index, counts.values, color="steelblue")
ax.set_title("Число студентов по факультетам")
ax.set_xlabel("Факультет")
ax.set_ylabel("Число студентов")

plt.xticks(rotation=15)
plt.show()
`,
    },
    {
      id: "t2",
      title: "Линейный график: активность в соцсетях",
      text: R`
Файл \`data/tweets_stream.csv\` — 30 минут постов в соцсетях (21.03.2026, Навруз). Постройте **линейный** график числа постов по минутам.

1. Удалите дубликаты строк.
2. \`per_min\` — Series: число постов за каждую минуту (индекс — время, по возрастанию). Подойдёт \`tw["timestamp"].dt.floor("min").value_counts().sort_index()\` или \`resample("1min")\`.
3. \`peak\` — минута с максимальным числом постов.
4. Линейный график с маркерами, заголовком и подписями осей.
`,
      starter: R`import pandas as pd
import matplotlib.pyplot as plt

tw = pd.read_csv("data/tweets_stream.csv", parse_dates=["timestamp"])
print("Всего строк:", len(tw))

tw = ...           # без дубликатов
per_min = ...      # постов в минуту
peak = ...         # минута-пик

fig, ax = plt.subplots(figsize=(10, 4))
# ax.plot(...)

plt.show()
print("Пик активности:", peak)
`,
      check: R`
import pandas as pd
t = pd.read_csv("data/tweets_stream.csv", parse_dates=["timestamp"]).drop_duplicates()
e = t["timestamp"].dt.floor("min").value_counts().sort_index()
pm = var("per_min", pd.Series)
ok(int(pm.sum()) == len(t), f"Дубликаты удалены: в per_min учтено {len(t)} постов")
ok(len(pm) == len(e) and [int(v) for v in pm.values] == [int(v) for v in e.values], f"per_min — {len(e)} значений по минутам в хронологическом порядке")
pk = var("peak")
ok(pk is not Ellipsis and pd.Timestamp(pk) == e.idxmax(), f"peak — минута с наибольшим числом постов ({e.idxmax():%H:%M})")
lines = figs[0].axes[0].get_lines() if figs and figs[0].axes else []
ok(len(lines) >= 1, "Построен линейный график (ax.plot)")
if lines:
    ax = figs[0].axes[0]
    ok(any(len(l.get_xdata()) == len(e) for l in lines), f"На линии {len(e)} точек — по одной на минуту")
    ok(ax.get_title() != "" and ax.get_xlabel() != "" and ax.get_ylabel() != "", "Есть заголовок и подписи обеих осей")
`,
      hint: "`tw = tw.drop_duplicates()`; `per_min = tw[\"timestamp\"].dt.floor(\"min\").value_counts().sort_index()`; `peak = per_min.idxmax()`; `ax.plot(per_min.index, per_min.values, marker=\"o\")`.",
      solution: R`import pandas as pd
import matplotlib.pyplot as plt

tw = pd.read_csv("data/tweets_stream.csv", parse_dates=["timestamp"])
print("Всего строк:", len(tw))

tw = tw.drop_duplicates()
per_min = tw["timestamp"].dt.floor("min").value_counts().sort_index()
peak = per_min.idxmax()

fig, ax = plt.subplots(figsize=(10, 4))
ax.plot(per_min.index, per_min.values, marker="o", color="tab:orange")
ax.set_title("Активность в соцсетях 21.03.2026")
ax.set_xlabel("Время")
ax.set_ylabel("Постов в минуту")
ax.grid(alpha=0.3)

plt.show()
print("Пик активности:", peak)
`,
    },
    {
      id: "t3",
      title: "Несколько графиков: hist, scatter, pie",
      text: R`
Соберите «панель» из трёх графиков по \`data/students.csv\` на одном рисунке \`plt.subplots(1, 3)\`:

1. \`axes[0]\` — гистограмма GPA из **15** интервалов (уже готова);
2. \`axes[1]\` — точечная диаграмма: по оси X посещаемость \`attendance\`, по оси Y — \`gpa\`; подпишите оси;
3. \`axes[2]\` — круговая диаграмма долей уровней английского \`levels\` с процентами (\`autopct="%1.0f%%"\`).

У каждого графика должен быть заголовок.
`,
      starter: R`import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/students.csv")
levels = df["english_level"].value_counts().sort_index()

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].hist(df["gpa"], bins=15, color="teal", edgecolor="white")
axes[0].set_title("Распределение GPA")
axes[0].set_xlabel("GPA")
axes[0].set_ylabel("Студентов")

# axes[1]: точечная диаграмма attendance — gpa

# axes[2]: круговая диаграмма levels

fig.suptitle("Студенты: успеваемость и посещаемость")
plt.tight_layout()
plt.show()
`,
      check: R`
import pandas as pd
df = pd.read_csv("data/students.csv")
ok(len(figs) >= 1, "Построен рисунок")
if figs:
    ax = figs[0].axes
    ok(len(ax) == 3, "На рисунке 3 области (plt.subplots(1, 3))")
    if len(ax) == 3:
        ok(len(ax[0].patches) == 15, "Слева — гистограмма GPA из 15 интервалов")
        sc = [c for c in ax[1].collections if len(c.get_offsets()) == len(df)]
        ok(len(sc) >= 1, "В центре — точечная диаграмма из 200 точек (scatter)")
        if sc:
            off = sc[0].get_offsets()
            ok(abs(float(off[:, 0].mean()) - df["attendance"].mean()) < 0.01 and abs(float(off[:, 1].mean()) - df["gpa"].mean()) < 0.01, "По оси X — attendance, по оси Y — gpa")
        ok(ax[1].get_xlabel() != "" and ax[1].get_ylabel() != "", "У точечной диаграммы подписаны оси")
        ok(len(ax[2].patches) == df["english_level"].nunique(), "Справа — круговая диаграмма с 4 секторами")
        ok(len(ax[2].texts) >= 8, "На круговой диаграмме есть подписи уровней и проценты (labels, autopct)")
        ok(all(a.get_title() for a in ax), "У каждой из трёх областей есть заголовок")
`,
      hint: "`axes[1].scatter(df[\"attendance\"], df[\"gpa\"], alpha=0.5)`; `axes[2].pie(levels, labels=levels.index, autopct=\"%1.0f%%\")`; заголовки — `axes[i].set_title(...)`.",
      solution: R`import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/students.csv")
levels = df["english_level"].value_counts().sort_index()

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].hist(df["gpa"], bins=15, color="teal", edgecolor="white")
axes[0].set_title("Распределение GPA")
axes[0].set_xlabel("GPA")
axes[0].set_ylabel("Студентов")

axes[1].scatter(df["attendance"], df["gpa"], alpha=0.5, color="purple")
axes[1].set_title("Посещаемость и успеваемость")
axes[1].set_xlabel("Посещаемость, %")
axes[1].set_ylabel("GPA")

axes[2].pie(levels, labels=levels.index, autopct="%1.0f%%", startangle=90)
axes[2].set_title("Уровень английского")

fig.suptitle("Студенты: успеваемость и посещаемость")
plt.tight_layout()
plt.show()
`,
    },
    {
      id: "t4",
      title: "Графики pandas: продажи книг",
      text: R`
Продажи книжного магазина (\`data/sales.xlsx\`, листы 2025 и 2026) уже объединены в \`sales\`, добавлены \`revenue\` (сум), \`year\` и \`month\`.

1. \`rev_by_cat\` — выручка по категориям в **млн сум**, отсортированная **по возрастанию** (тогда на горизонтальной диаграмме крупнейшая категория окажется вверху).
2. \`by_month\` — таблица выручки (млн сум): строки — месяцы 1…12, столбцы — годы (\`pivot_table\`).
3. Нарисуйте методом pandas \`.plot\` на одном рисунке 1×2: слева \`rev_by_cat\` (\`kind="barh"\`), справа \`by_month\` — две линии с маркерами и легендой. Дайте графикам заголовки.
`,
      starter: R`import pandas as pd
import matplotlib.pyplot as plt

books = pd.read_excel("data/sales.xlsx", sheet_name=None)
sales = pd.concat([books["2025"], books["2026"]], ignore_index=True)
sales["revenue"] = sales["qty"] * sales["price_uzs"]
sales["year"] = sales["date"].dt.year
sales["month"] = sales["date"].dt.month

rev_by_cat = ...
by_month = ...

fig, axes = plt.subplots(1, 2, figsize=(13, 4))
# rev_by_cat.plot(kind="barh", ax=axes[0], ...)
# by_month.plot(ax=axes[1], marker="o", ...)
plt.tight_layout()
plt.show()
`,
      check: R`
import pandas as pd, numpy as np
b = pd.read_excel("data/sales.xlsx", sheet_name=None)
s = pd.concat([b["2025"], b["2026"]], ignore_index=True)
s["rev"] = s["qty"] * s["price_uzs"] / 1e6
e_cat = s.groupby("category")["rev"].sum().sort_values()
e_m = s.pivot_table(index=s["date"].dt.month, columns=s["date"].dt.year, values="rev", aggfunc="sum")
rc = var("rev_by_cat", pd.Series)
ok(set(rc.index) == set(e_cat.index) and np.allclose(rc.reindex(e_cat.index).astype(float).values, e_cat.values, rtol=1e-3), "rev_by_cat — выручка по категориям в млн сум")
ok(list(rc.index) == list(e_cat.index), "rev_by_cat отсортирован по возрастанию")
bm = var("by_month", pd.DataFrame)
ok(bm.shape == e_m.shape, "by_month: 12 строк (месяцы) и 2 столбца (годы)")
ok(bm.shape == e_m.shape and np.allclose(bm.values.astype(float), e_m.values, rtol=1e-3, equal_nan=True), "Значения by_month — выручка в млн сум по месяцам и годам")
ok(uses(".plot("), "Графики построены методом pandas .plot()")
ax = figs[0].axes if figs else []
ok(len(ax) >= 2, "Построен рисунок из двух областей")
if len(ax) >= 2:
    ok(len(ax[0].patches) == len(e_cat), f"Слева — горизонтальная диаграмма из {len(e_cat)} столбцов")
    ok(len(ax[1].get_lines()) == 2, "Справа — две линии: 2025 и 2026 годы")
    ok(ax[1].get_legend() is not None, "На линейном графике есть легенда")
    ok(all(a.get_title() for a in ax[:2]), "У обоих графиков есть заголовки")
`,
      hint: "`rev_by_cat = (sales.groupby(\"category\")[\"revenue\"].sum() / 1e6).sort_values()`; `by_month = sales.pivot_table(index=\"month\", columns=\"year\", values=\"revenue\", aggfunc=\"sum\") / 1e6`.",
      solution: R`import pandas as pd
import matplotlib.pyplot as plt

books = pd.read_excel("data/sales.xlsx", sheet_name=None)
sales = pd.concat([books["2025"], books["2026"]], ignore_index=True)
sales["revenue"] = sales["qty"] * sales["price_uzs"]
sales["year"] = sales["date"].dt.year
sales["month"] = sales["date"].dt.month

rev_by_cat = (sales.groupby("category")["revenue"].sum() / 1e6).sort_values()
by_month = sales.pivot_table(index="month", columns="year", values="revenue", aggfunc="sum") / 1e6

fig, axes = plt.subplots(1, 2, figsize=(13, 4))
rev_by_cat.plot(kind="barh", ax=axes[0], color="darkcyan", title="Выручка по категориям, млн сум")
axes[0].set_xlabel("млн сум")
by_month.plot(ax=axes[1], marker="o", title="Выручка по месяцам, млн сум")
axes[1].set_xlabel("Месяц")
axes[1].set_ylabel("млн сум")
plt.tight_layout()
plt.show()
`,
    },
    {
      id: "t5",
      title: "seaborn: четыре статистических графика",
      text: R`
Постройте по \`data/students.csv\` рисунок 2×2 средствами **seaborn**:

| Область | График |
|---|---|
| \`axes[0, 0]\` | \`sns.histplot\`: GPA с разбивкой по полу и кривой плотности (готово) |
| \`axes[0, 1]\` | \`sns.boxplot\`: GPA по факультетам |
| \`axes[1, 0]\` | \`sns.barplot\`: средняя посещаемость по уровням английского (\`order=["A2", "B1", "B2", "C1"]\`) |
| \`axes[1, 1]\` | \`sns.heatmap\`: матрица корреляций \`corr\` с подписями значений (\`annot=True\`) |

\`corr\` — корреляции между столбцами \`age\`, \`course\`, \`gpa\`, \`attendance\`. Каждому графику дайте заголовок.
`,
      starter: R`import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv("data/students.csv")
corr = ...

fig, axes = plt.subplots(2, 2, figsize=(13, 9))

sns.histplot(data=df, x="gpa", hue="gender", kde=True, ax=axes[0, 0])
axes[0, 0].set_title("GPA: юноши и девушки")

# axes[0, 1]: boxplot
# axes[1, 0]: barplot
# axes[1, 1]: heatmap

plt.tight_layout()
plt.show()
`,
      check: R`
import pandas as pd, numpy as np
df = pd.read_csv("data/students.csv")
cols = ["age", "course", "gpa", "attendance"]
c = var("corr", pd.DataFrame)
ok(c.shape == (4, 4) and set(c.columns) == set(cols) and np.allclose(c.loc[cols, cols].values, df[cols].corr().values), "corr — матрица корреляций 4×4 для age, course, gpa, attendance")
ok(all(uses(f) for f in ["histplot", "boxplot", "barplot", "heatmap"]), "Использованы sns.histplot, sns.boxplot, sns.barplot и sns.heatmap")
axs = figs[0].axes if figs else []
ok(len(axs) >= 4, "Рисунок 2×2 (у тепловой карты есть ещё шкала цвета)")
hm = [a for a in axs if any(type(col).__name__ == "QuadMesh" for col in a.collections)]
ok(len(hm) >= 1, "Тепловая карта построена")
ok(len(hm) >= 1 and len(hm[0].texts) == 16, "На тепловой карте подписаны все 16 значений (annot=True)")
ok(sum(1 for a in axs if a.get_title()) >= 4, "У всех четырёх графиков есть заголовки")
`,
      hint: "`corr = df[[\"age\", \"course\", \"gpa\", \"attendance\"]].corr()`; `sns.boxplot(data=df, x=\"faculty\", y=\"gpa\", ax=axes[0, 1])`; `sns.heatmap(corr, annot=True, fmt=\".2f\", cmap=\"coolwarm\", ax=axes[1, 1])`.",
      solution: R`import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv("data/students.csv")
corr = df[["age", "course", "gpa", "attendance"]].corr()

fig, axes = plt.subplots(2, 2, figsize=(13, 9))

sns.histplot(data=df, x="gpa", hue="gender", kde=True, ax=axes[0, 0])
axes[0, 0].set_title("GPA: юноши и девушки")

sns.boxplot(data=df, x="faculty", y="gpa", ax=axes[0, 1])
axes[0, 1].set_title("GPA по факультетам")
axes[0, 1].tick_params(axis="x", rotation=15)

sns.barplot(data=df, x="english_level", y="attendance", order=["A2", "B1", "B2", "C1"], ax=axes[1, 0])
axes[1, 0].set_title("Посещаемость по уровню английского")

sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", vmin=-1, vmax=1, ax=axes[1, 1])
axes[1, 1].set_title("Корреляции")

plt.tight_layout()
plt.show()
`,
    },
    {
      id: "t6",
      title: "Облако слов по корпусу",
      setup: P14_NORM,
      text: R`
Подготовлены: \`texts\` — 16 новостей на узбекском (\`data/corpus_uz\`, апострофы разные), \`stop\` — стоп-слова, функция \`normalize(text)\` (нижний регистр + канонические апострофы ʻ и ʼ).

1. \`tokens\` — все слова корпуса: \`re.findall(r"\w+", normalize(text))\`, только буквенные (\`w.isalpha()\`), длиной не меньше 3, не входящие в \`stop\`.
2. \`freq = Counter(tokens)\`; выведите 10 самых частых слов.
3. \`freq_ascii\` — те же частоты, но в словах ʻ и ʼ заменены на обычный апостроф \`'\` (шрифт WordCloud не знает ʻ ʼ).
4. \`wc = WordCloud(width=600, height=300, background_color="white", max_words=100).generate_from_frequencies(freq_ascii)\`; покажите облако \`plt.imshow(wc)\` без осей и с заголовком.
`,
      starter: R`from wordcloud import WordCloud
import matplotlib.pyplot as plt

tokens = []
for text in texts:
    for w in re.findall(r"\w+", normalize(text)):
        ...   # добавьте w в tokens, если оно подходит

freq = Counter(tokens)
print(freq.most_common(10))

freq_ascii = Counter()
for w, c in freq.items():
    ...

wc = ...

plt.figure(figsize=(10, 5))
# plt.imshow(...)
plt.show()
`,
      check: P14_NORM + R`
exp = Counter(w for t in texts for w in re.findall(r"\w+", normalize(t)) if w.isalpha() and len(w) >= 3 and w not in stop)
f = var("freq")
ok(isinstance(f, dict) and len(f) > 0, "freq — частотный словарь (Counter) слов корпуса")
ok(not (set(f) & stop), "В freq нет стоп-слов")
ok(all(len(w) >= 3 and str(w).isalpha() for w in f), "В freq только буквенные слова длиной от 3 символов")
top_w, top_c = exp.most_common(1)[0]
ok(f.get(top_w) == top_c, f"Самое частое слово — «{top_w}» ({top_c} раз); все апострофы нормализованы")
ok(abs(len(f) - len(exp)) <= 0.02 * len(exp), f"В словаре около {len(exp)} разных слов (обработаны все 16 текстов)")
wc = var("wc")
ok(type(wc).__name__ == "WordCloud" and len(getattr(wc, "words_", {})) >= 50, "wc — объект WordCloud, построенный по частотам")
if type(wc).__name__ == "WordCloud":
    ok(not any(("ʻ" in w or "ʼ" in w) for w in wc.words_), "В облаке апострофы ʻ ʼ заменены на ASCII '")
    ok(any("'" in w for w in wc.words_), "Слова с апострофом (oʻzbek → o'zbek) сохранены, а не выброшены")
ax = figs[0].axes[0] if figs and figs[0].axes else None
ok(ax is not None and len(ax.images) >= 1, "Облако показано на рисунке (plt.imshow)")
ok(ax is not None and not ax.axison and ax.get_title() != "", "Оси скрыты (plt.axis(\"off\")), есть заголовок")
`,
      hint: "Условие отбора: `if w.isalpha() and len(w) >= 3 and w not in stop: tokens.append(w)`. Замена апострофов: `freq_ascii[w.replace(\"ʻ\", \"'\").replace(\"ʼ\", \"'\")] += c`. Показ: `plt.imshow(wc, interpolation=\"bilinear\")`, `plt.axis(\"off\")`, `plt.title(...)`.",
      solution: R`from wordcloud import WordCloud
import matplotlib.pyplot as plt

tokens = []
for text in texts:
    for w in re.findall(r"\w+", normalize(text)):
        if w.isalpha() and len(w) >= 3 and w not in stop:
            tokens.append(w)

freq = Counter(tokens)
print(freq.most_common(10))

freq_ascii = Counter()
for w, c in freq.items():
    freq_ascii[w.replace("ʻ", "'").replace("ʼ", "'")] += c

wc = WordCloud(width=600, height=300, background_color="white",
               max_words=100, colormap="viridis").generate_from_frequencies(freq_ascii)

plt.figure(figsize=(10, 5))
plt.imshow(wc, interpolation="bilinear")
plt.axis("off")
plt.title("Облако слов: корпус узбекских новостей")
plt.show()
`,
    },
  ],
  quiz: [
    { q: "Какой тип графика лучше всего показывает изменение величины во времени?", options: ["Круговая диаграмма", "Линейный график", "Тепловая карта", "Облако слов"], answer: 1 },
    { q: "Что возвращает `plt.subplots(2, 2)`?", options: ["Один объект Axes", "Кортеж (fig, axes), где axes — массив 2×2 областей", "Список из 4 рисунков", "Ничего, рисует сразу"], answer: 1, explain: "К областям обращаются по двум индексам: `axes[0, 1]` — первая строка, второй столбец." },
    { q: "Что показывает линия внутри «ящика» на `sns.boxplot`?", options: ["Среднее значение", "Медиану", "Максимум", "Стандартное отклонение"], answer: 1, explain: "Ящик — от 1-го до 3-го квартиля, линия внутри — медиана, точки за «усами» — выбросы." },
    { q: "Почему перед построением облака слов удаляют стоп-слова?", options: ["Иначе WordCloud выдаст ошибку", "Служебные слова (va, bu, bilan) самые частые и закроют содержательные слова", "Стоп-слова содержат апострофы", "Чтобы облако было цветным"], answer: 1 },
    { q: "Почему в облаке слов вместо «oʻzbek» видно «o□zbek»?", options: ["Слово написано с ошибкой", "Встроенный шрифт WordCloud не содержит глифа ʻ (U+02BB) — нужно заменить апостроф или указать font_path", "WordCloud не поддерживает узбекский язык", "Нужно увеличить width"], answer: 1 },
    { q: "Как подписать ось X у области `ax`?", options: ["`ax.xlabel(\"...\")`", "`ax.set_xlabel(\"...\")`", "`ax.title(\"...\")`", "`plt.axis(\"...\")`"], answer: 1, explain: "У объекта Axes методы с префиксом set_: `set_title`, `set_xlabel`, `set_ylabel`. Функции `plt.xlabel` работают с текущей областью." },
  ],
  realEnv: R`
## Графики в Jupyter (Anaconda)

\`\`\`bash
conda activate bigdata
conda install -y matplotlib seaborn
conda install -y -c conda-forge wordcloud     # или: pip install wordcloud
\`\`\`

- В Jupyter графики выводятся под ячейкой автоматически (в старых версиях добавьте \`%matplotlib inline\`).
- Для отчёта и презентации сохраняйте рисунки в файл: \`fig.savefig("sales.png", dpi=200, bbox_inches="tight")\`; для статьи — в векторном формате \`.svg\` или \`.pdf\`.
- Шрифт с узбекскими апострофами для облака слов: \`WordCloud(font_path="C:/Windows/Fonts/arial.ttf")\` (Windows) или \`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf\` (Linux, Colab) — тогда заменять ʻ ʼ не нужно.
- Стиль всех графиков: \`sns.set_theme(style="whitegrid")\`; размер шрифтов: \`plt.rcParams["font.size"] = 12\`.

## Визуализация больших данных

- Никогда не рисуйте «сырые» миллионы точек: сначала агрегируйте (группировка в pandas, Spark, MongoDB), затем стройте график по сводной таблице.
- Для интерактивных графиков (наведение, масштаб) используйте **Plotly** (\`pip install plotly\`, \`plotly.express.line(...)\`), для дашбордов — **Streamlit**, Power BI, Tableau, Apache Superset.

> [!TIP] Google Colab
> В Colab matplotlib, seaborn и wordcloud уже установлены. Рисунок можно скачать: \`fig.savefig("chart.png")\`, затем \`from google.colab import files; files.download("chart.png")\`.
`,
  homework: R`
## Самостоятельная работа: «Анализ больших объёмов данных, формируемых в социальных сетях»

По файлу \`data/tweets_stream.csv\` подготовьте мини-дашборд (рисунок 2×2) и короткий вывод (5–7 предложений):

1. Доля постов по платформам (столбчатая или круговая диаграмма).
2. Тепловая карта «платформа × язык поста» (\`pd.crosstab\` + \`sns.heatmap\`).
3. Топ-10 хештегов (\`re.findall(r"#\w+", text)\`) — горизонтальная диаграмма.
4. Облако слов узбекоязычных постов (\`lang == "uz"\`) без стоп-слов.

Дополнительно: сравните среднее число лайков у постов с изображением и без (\`has_image\`) с помощью \`sns.boxplot\`.
`,
});
