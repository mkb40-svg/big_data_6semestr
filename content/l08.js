/* Л8. Мини-проект «Анализ отзывов о книгах на узбекском языке»: от постановки задачи до презентации. */
const L08_LOAD = R`import re
from collections import Counter
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/reviews_uz.csv")

def normalize(text):
    """Нижний регистр и единые апострофы: oʻ/gʻ (U+02BB), остальные — ʼ (U+02BC)."""
    text = text.lower()
    for ch in ["'", "\u2018", "\u2019", "\x60", "\u02bb"]:
        text = text.replace(ch, "\u02bc")
    return re.sub("([og])\u02bc", "\\1\u02bb", text)

stop = set(open("data/stopwords_uz.txt", encoding="utf-8").read().split())
`;

const L08_CLEAN = R`
def tokenize(text):
    return [w for w in re.findall(r"\w+", normalize(text)) if w.isalpha()]

df["tokens"] = df["text"].apply(tokenize)
df["n_words"] = df["tokens"].str.len()
df["label"] = df["stars"].apply(lambda s: "pos" if s >= 4 else ("neg" if s <= 2 else "neu"))
`;

const L08_LEXICON = R`POS = {"ajoyib", "aʼlo", "chiroyli", "xushmuomala", "tez", "tavsiya", "arzon", "sifatli", "qiziqarli"}
NEG = {"yomon", "qimmat", "kechikdi", "berishmadi", "yirtilgan", "notoʻgʻri"}
`;

const L08_SENT = "\n" + L08_LEXICON + R`
def sentiment(tokens):
    score = 0
    for i, w in enumerate(tokens):
        if i + 1 < len(tokens) and tokens[i + 1] == "emas":
            continue
        if w in POS:
            score += 1
        elif w in NEG:
            score -= 1
    return score

df["score"] = df["tokens"].apply(sentiment)
df["pred"] = df["score"].apply(lambda s: "pos" if s > 0 else ("neg" if s < 0 else "neu"))
accuracy = round((df["pred"] == df["label"]).mean(), 3)
`;

const L08_CMP = R`
def summarize(col):
    return (df.groupby(col)
              .agg(n=("stars", "size"), mean_stars=("stars", "mean"),
                   share_neg=("label", lambda s: (s == "neg").mean()), mean_score=("score", "mean"))
              .round(2).sort_values("mean_stars", ascending=False))

by_cat = summarize("category")
by_city = summarize("city")
pivot = df.pivot_table(index="city", columns="category", values="stars", aggfunc="mean").round(2)
`;

BDT.register({
  id: "l08",
  kind: "lab",
  num: 8,
  title: "Разработка мини-проекта на основе больших данных в сфере компьютерной лингвистики и презентация результатов",
  hours: 4,
  env: ["python"],
  goals: [
    "Освоить методологию проекта по анализу данных: проблема → данные → конвейер → анализ → визуализация → выводы → презентация",
    "Выполнить мини-проект «Анализ отзывов о книгах на узбекском языке»: очистка, ключевые слова, словарная тональность, сравнение групп",
    "Оценить качество метода (accuracy, матрица ошибок) и честно описать ограничения",
    "Оформить результаты в отчёт и спланировать презентацию по критериям оценивания",
  ],
  theory: R`
## Методология мини-проекта

Проект по анализу данных — это не «написать код», а ответить на **вопрос** с помощью данных и убедительно показать ответ. Каждый этап оставляет **артефакт**, который войдёт в отчёт и презентацию.

| Этап | Ключевой вопрос | Артефакт |
|---|---|---|
| 1. Проблема | Что и зачем мы хотим узнать? | цель, исследовательские вопросы, гипотезы |
| 2. Данные | Откуда данные, сколько их, какого качества? | описание набора, разведочный анализ (EDA) |
| 3. Конвейер | Как из сырых текстов получить признаки? | код очистки, нормализации, токенизации |
| 4. Анализ | Какие закономерности видны? | таблицы, метрики, ключевые слова |
| 5. Визуализация | Как показать результат за 5 секунд? | 2–4 графика с выводом в заголовке |
| 6. Выводы | Что ответили на вопрос? Где границы метода? | выводы, ограничения, дальнейшие шаги |
| 7. Презентация | Как убедить слушателей? | 8–10 слайдов, 7 минут доклада |

## Учебный проект: «Анализ отзывов о книгах на узбекском языке»

**Проблема.** Интернет-магазин получает тысячи отзывов, читать их вручную невозможно. Нужно автоматически понять, чем довольны и недовольны покупатели.

**Вопросы:** 1) как распределены оценки? 2) какие слова характерны для положительных и отрицательных отзывов? 3) может ли простой словарный метод определить тональность текста? 4) различаются ли категории книг и города?

**Данные:** \`data/reviews_uz.csv\` — 180 отзывов: \`stars\` (1–5), \`text\` (узбекский), \`book\`, \`category\`, \`city\`, \`date\`. Метка тональности строится по звёздам: 4–5 → \`pos\`, 3 → \`neu\`, 1–2 → \`neg\`.

## Шаблон проекта

\`\`\`text Структура папки проекта
reviews_project/
├── data/            # исходные данные (не изменяем!)
├── notebooks/       # 01_eda.ipynb, 02_analysis.ipynb
├── reports/         # графики .png, report.md
├── README.md        # цель, данные, как запустить, выводы
└── requirements.txt # pandas, matplotlib, seaborn
\`\`\`

## Словарный (лексиконный) анализ тональности

Самый простой и прозрачный метод: составить словари положительных (\`ajoyib\`, \`aʼlo\`, \`tavsiya\`) и отрицательных (\`yomon\`, \`qimmat\`, \`kechikdi\`) слов и посчитать **score = (число позитивных) − (число негативных)**.

\`\`\`python
def sentiment(tokens):
    score = 0
    for i, w in enumerate(tokens):
        if i + 1 < len(tokens) and tokens[i + 1] == "emas":   # «yomon emas» — не «плохо»
            continue
        if w in POS:
            score += 1
        elif w in NEG:
            score -= 1
    return score
\`\`\`

> [!NOTE] Отрицание в узбекском
> Частица **emas** стоит после слова: «yomon emas» — «неплохо». Без учёта отрицания такие отзывы ошибочно попадут в негативные. Аналогично работают аффиксы отрицания глагола (\`-ma-\`: kelmadi, berishmadi) — их лучше заносить в словарь целыми формами.

**Оценка качества** — сравнение предсказаний с метками по звёздам:

\`\`\`python
accuracy = (df["pred"] == df["label"]).mean()          # доля верных ответов
pd.crosstab(df["label"], df["pred"])                   # матрица ошибок: где метод путается
\`\`\`

## Критерии оценивания мини-проекта

| Критерий | Баллы | Что оценивается |
|---|---|---|
| Постановка задачи | 10 | ясная цель, исследовательские вопросы, актуальность |
| Данные | 15 | источник, объём, качество, этика (персональные данные, лицензия) |
| Обработка и код | 25 | воспроизводимый конвейер, нормализация, отсутствие «ручных» правок |
| Анализ и метрики | 20 | корректные расчёты, оценка качества метода, интерпретация |
| Визуализация | 15 | 2–4 понятных графика: заголовки, подписи осей, вывод на слайде |
| Презентация | 15 | структура, регламент 7 минут, ответы на вопросы |
| **Итого** | **100** | 86–100 — «отлично», 71–85 — «хорошо», 55–70 — «удовлетворительно» |

## План презентации (8–10 слайдов, 7 минут)

1. **Титульный**: тема, автор, группа, руководитель.
2. **Проблема и цель**: почему это важно, исследовательские вопросы.
3. **Данные**: источник, объём, пример записи, распределение оценок.
4. **Методы**: схема конвейера (загрузка → очистка → токены → словарь тональности → метрики).
5. **Результаты** (2–3 слайда): по одному графику на слайд; заголовок слайда — это вывод («Негативные отзывы связаны с доставкой и упаковкой»), а не «График 2».
6. **Выводы и ограничения**: ответы на вопросы, размер выборки, простота метода.
7. **Дальнейшее развитие**: больше данных, машинное обучение, лемматизация.
8. **Спасибо! Вопросы.**

> [!TIP] Правила слайдов
> Один слайд — одна мысль; не больше 6 строк текста; шрифт не меньше 24 pt; числа округлены; код на слайды не выносится (только в приложение или репозиторий).
`,
  tasks: [
    {
      id: "t1",
      title: "Шаг 1. Данные и разведочный анализ",
      text: R`
Начните проект с разведочного анализа (EDA) файла \`data/reviews_uz.csv\`:

- \`df\` — таблица отзывов;
- \`n_reviews\` — число отзывов, \`n_books\` — число разных книг;
- \`stars_dist\` — число отзывов по оценкам 1…5 (по возрастанию звёзд);
- \`mean_stars\` — средняя оценка (2 знака);
- \`share_pos\` — доля отзывов с оценкой 4–5 (3 знака).

Выведите краткую сводку: этими числами начнётся слайд «Данные».
`,
      starter: R`import pandas as pd

df = pd.read_csv("data/reviews_uz.csv")
print(df.shape)
print(df.head())

n_reviews = ...
n_books = ...
stars_dist = ...
mean_stars = ...
share_pos = ...

print(f"Отзывов: {n_reviews}, книг: {n_books}, средняя оценка: {mean_stars}, доля 4–5★: {share_pos}")
stars_dist
`,
      check: R`
import pandas as pd
r = pd.read_csv("data/reviews_uz.csv")
ok(len(var("df", pd.DataFrame)) == 180, "df — 180 отзывов")
ok(var("n_reviews") == 180, "n_reviews = 180")
ok(var("n_books") == r["book"].nunique(), f"n_books = {r['book'].nunique()}")
sd = var("stars_dist", pd.Series)
e = r["stars"].value_counts().sort_index()
ok([int(i) for i in sd.index] == [1, 2, 3, 4, 5] and [int(v) for v in sd.values] == [int(v) for v in e.values], "stars_dist — число отзывов по оценкам 1…5")
ok(var("mean_stars") == round(r["stars"].mean(), 2), f"mean_stars = {round(r['stars'].mean(), 2)}")
ok(var("share_pos") == round((r["stars"] >= 4).mean(), 3), f"share_pos = {round((r['stars'] >= 4).mean(), 3)}")
`,
      hint: "`len(df)`, `df[\"book\"].nunique()`, `df[\"stars\"].value_counts().sort_index()`, `round(df[\"stars\"].mean(), 2)`, `round((df[\"stars\"] >= 4).mean(), 3)`.",
      solution: R`import pandas as pd

df = pd.read_csv("data/reviews_uz.csv")
print(df.shape)
print(df.head())

n_reviews = len(df)
n_books = df["book"].nunique()
stars_dist = df["stars"].value_counts().sort_index()
mean_stars = round(df["stars"].mean(), 2)
share_pos = round((df["stars"] >= 4).mean(), 3)

print(f"Отзывов: {n_reviews}, книг: {n_books}, средняя оценка: {mean_stars}, доля 4–5★: {share_pos}")
stars_dist
`,
    },
    {
      id: "t2",
      title: "Шаг 2. Очистка, метки и ключевые слова",
      setup: L08_LOAD,
      text: R`
Подготовлены \`df\`, функция \`normalize(text)\` (регистр + апострофы) и стоп-слова \`stop\`.

1. Напишите \`tokenize(text)\`: слова \`re.findall(r"\w+", normalize(text))\`, только буквенные.
2. Добавьте столбцы \`tokens\`, \`n_words\` (число токенов) и \`label\`: \`"pos"\` для 4–5★, \`"neu"\` для 3★, \`"neg"\` для 1–2★.
3. \`top_pos\` и \`top_neg\` — по 5 самых частых **содержательных** слов (не из \`stop\`, длина ≥ 3) в положительных и отрицательных отзывах: списки пар \`(слово, частота)\`.

Какие темы волнуют недовольных покупателей?
`,
      starter: R`def tokenize(text):
    ...

df["tokens"] = df["text"].apply(tokenize)
df["n_words"] = ...
df["label"] = ...

def top_words(tokens_series, n=5):
    c = Counter()
    for toks in tokens_series:
        c.update(w for w in toks if w not in stop and len(w) >= 3)
    return c.most_common(n)

top_pos = ...
top_neg = ...
print("Положительные:", top_pos)
print("Отрицательные:", top_neg)
df["label"].value_counts()
`,
      check: L08_LOAD.replace("df = pd.read_csv", "r = pd.read_csv") + R`
def ref_tok(text):
    return [w for w in re.findall(r"\w+", normalize(text)) if w.isalpha()]
r["tok"] = r["text"].apply(ref_tok)
r["lab"] = r["stars"].apply(lambda s: "pos" if s >= 4 else ("neg" if s <= 2 else "neu"))
d = var("df", pd.DataFrame)
tk = var("tokenize")
ok(callable(tk) and tk("Yetkazib berish tez bo'ldi! 5+") == ["yetkazib", "berish", "tez", "boʻldi"], "tokenize: «Yetkazib berish tez bo'ldi! 5+» → ['yetkazib', 'berish', 'tez', 'boʻldi']")
def col_as(name, conv):
    try:
        return [conv(x) for x in d[name]]
    except Exception:
        return None
ok("tokens" in d.columns and col_as("tokens", list) == list(r["tok"]), "Столбец tokens — нормализованные слова каждого отзыва")
ok("n_words" in d.columns and col_as("n_words", int) == [len(t) for t in r["tok"]], "n_words — число токенов")
ok("label" in d.columns and list(d["label"]) == list(r["lab"]), "label: pos (4–5★), neu (3★), neg (1–2★)")
for name, lab in [("top_pos", "pos"), ("top_neg", "neg")]:
    c = Counter(w for t in r.loc[r["lab"] == lab, "tok"] for w in t if w not in stop and len(w) >= 3)
    v = var(name)
    good = isinstance(v, list) and len(v) == 5 and [int(n) for _, n in v] == [n for _, n in c.most_common(5)] and all(c[w] == n for w, n in v)
    ok(good, f"{name} — 5 самых частых содержательных слов в отзывах «{lab}»: " + ", ".join(w for w, _ in c.most_common(5)))
`,
      hint: "`return [w for w in re.findall(r\"\\w+\", normalize(text)) if w.isalpha()]`; метка: `df[\"stars\"].apply(lambda s: \"pos\" if s >= 4 else (\"neg\" if s <= 2 else \"neu\"))`; `top_pos = top_words(df.loc[df[\"label\"] == \"pos\", \"tokens\"])`.",
      solution: R`def tokenize(text):
    return [w for w in re.findall(r"\w+", normalize(text)) if w.isalpha()]

df["tokens"] = df["text"].apply(tokenize)
df["n_words"] = df["tokens"].str.len()
df["label"] = df["stars"].apply(lambda s: "pos" if s >= 4 else ("neg" if s <= 2 else "neu"))

def top_words(tokens_series, n=5):
    c = Counter()
    for toks in tokens_series:
        c.update(w for w in toks if w not in stop and len(w) >= 3)
    return c.most_common(n)

top_pos = top_words(df.loc[df["label"] == "pos", "tokens"])
top_neg = top_words(df.loc[df["label"] == "neg", "tokens"])
print("Положительные:", top_pos)
print("Отрицательные:", top_neg)
df["label"].value_counts()
`,
    },
    {
      id: "t3",
      title: "Шаг 3. Словарная тональность и её качество",
      setup: L08_LOAD + L08_CLEAN,
      text: R`
В \`df\` есть \`tokens\` и \`label\`. Словари \`POS\` и \`NEG\` даны в стартовом коде (их можно расширить).

1. Напишите \`sentiment(tokens)\`: +1 за каждое слово из \`POS\`, −1 за слово из \`NEG\`; если **следующее** слово — \`emas\`, текущее оценочное слово не учитывается («yomon emas» → 0).
2. \`df["score"]\` — оценка каждого отзыва; \`df["pred"]\` — \`"pos"\` при score > 0, \`"neg"\` при score < 0, иначе \`"neu"\`.
3. \`accuracy\` — доля совпадений \`pred\` и \`label\` (3 знака); \`confusion\` — матрица ошибок \`pd.crosstab(df["label"], df["pred"])\`.

Добейтесь \`accuracy\` не ниже 0.95. Какие отзывы метод всё ещё путает?
`,
      starter: R`POS = {"ajoyib", "aʼlo", "chiroyli", "xushmuomala", "tez", "tavsiya", "arzon", "sifatli", "qiziqarli"}
NEG = {"yomon", "qimmat", "kechikdi", "berishmadi", "yirtilgan", "notoʻgʻri"}

def sentiment(tokens):
    score = 0
    for i, w in enumerate(tokens):
        if w in POS:
            score += 1
        elif w in NEG:
            score -= 1
    return score

df["score"] = df["tokens"].apply(sentiment)
df["pred"] = ...
accuracy = ...
confusion = ...

print("accuracy =", accuracy)
confusion
`,
      check: R`
import pandas as pd
d = var("df", pd.DataFrame)
f = var("sentiment")
P, N = ns.get("POS", set()), ns.get("NEG", set())
ok(callable(f) and f(["sifati", "aʼlo"]) == 1 and f(["narxi", "juda", "qimmat"]) == -1, "sentiment: «sifati aʼlo» → 1, «narxi juda qimmat» → −1")
ok(callable(f) and f(["yomon", "emas"]) == 0 and f(["ajoyib", "xizmat", "yomon", "emas"]) == 1, "Отрицание учтено: «yomon emas» → 0")
def ref(tokens):
    s = 0
    for i, w in enumerate(tokens):
        if i + 1 < len(tokens) and tokens[i + 1] == "emas":
            continue
        s += (w in P) - (w in N and w not in P)
    return s
ok("score" in d.columns and [int(x) for x in d["score"]] == [ref(list(t)) for t in d["tokens"]], "score — результат sentiment для каждого отзыва")
exp_pred = ["pos" if s > 0 else ("neg" if s < 0 else "neu") for s in d["score"]] if "score" in d.columns else []
ok("pred" in d.columns and list(d["pred"]) == exp_pred, "pred: pos (score > 0), neg (score < 0), neu (0)")
acc = var("accuracy")
ok("pred" in d.columns and isinstance(acc, float) and acc == round((d["pred"] == d["label"]).mean(), 3), "accuracy — доля совпадений pred и label (3 знака)")
ok(isinstance(acc, float) and acc >= 0.95, "accuracy ≥ 0.95")
cf = var("confusion", pd.DataFrame)
ok(int(cf.values.sum()) == 180 and "neu" in cf.index, "confusion — матрица ошибок label × pred по 180 отзывам")
`,
      hint: "В начале цикла: `if i + 1 < len(tokens) and tokens[i + 1] == \"emas\": continue`. `df[\"pred\"] = df[\"score\"].apply(lambda s: \"pos\" if s > 0 else (\"neg\" if s < 0 else \"neu\"))`; `accuracy = round((df[\"pred\"] == df[\"label\"]).mean(), 3)`.",
      solution: R`POS = {"ajoyib", "aʼlo", "chiroyli", "xushmuomala", "tez", "tavsiya", "arzon", "sifatli", "qiziqarli"}
NEG = {"yomon", "qimmat", "kechikdi", "berishmadi", "yirtilgan", "notoʻgʻri"}

def sentiment(tokens):
    score = 0
    for i, w in enumerate(tokens):
        if i + 1 < len(tokens) and tokens[i + 1] == "emas":
            continue
        if w in POS:
            score += 1
        elif w in NEG:
            score -= 1
    return score

df["score"] = df["tokens"].apply(sentiment)
df["pred"] = df["score"].apply(lambda s: "pos" if s > 0 else ("neg" if s < 0 else "neu"))
accuracy = round(float((df["pred"] == df["label"]).mean()), 3)
confusion = pd.crosstab(df["label"], df["pred"])

print("accuracy =", accuracy)
print(df.loc[df["pred"] != df["label"], ["stars", "text"]].head())
confusion
`,
    },
    {
      id: "t4",
      title: "Шаг 4. Сравнение категорий и городов",
      setup: L08_LOAD + L08_CLEAN + L08_SENT,
      text: R`
В \`df\` есть \`stars\`, \`label\`, \`score\`, \`category\`, \`city\`.

1. \`by_cat\` — таблица по категориям книг со столбцами \`n\` (число отзывов), \`mean_stars\`, \`share_neg\` (доля \`label == "neg"\`), \`mean_score\`; значения округлены до 2 знаков, сортировка по \`mean_stars\` по убыванию.
2. \`by_city\` — такая же таблица по городам.
3. \`best_city\` — город с самой высокой средней оценкой, \`worst_category\` — категория с самой низкой.
4. \`pivot\` — сводная таблица средней оценки: строки — города, столбцы — категории.

Помните: если в группе 6 отзывов, её среднее ненадёжно. Учитывайте \`n\` при выводах.
`,
      starter: R`def summarize(col):
    return (df.groupby(col)
              .agg(n=("stars", "size"),
                   mean_stars=...,
                   share_neg=("label", lambda s: (s == "neg").mean()),
                   mean_score=...)
              .round(2)
              .sort_values(...))

by_cat = summarize("category")
by_city = ...
best_city = ...
worst_category = ...
pivot = ...

print("Лучший город:", best_city, "| худшая категория:", worst_category)
by_cat
`,
      check: R`
import pandas as pd
d = ns["df"]
for name, col in [("by_cat", "category"), ("by_city", "city")]:
    t = var(name, pd.DataFrame)
    g = d.groupby(col)
    ok(set(t.index) == set(d[col]) and {"n", "mean_stars", "share_neg", "mean_score"} <= set(t.columns), f"{name}: по строке на каждое значение {col}, столбцы n, mean_stars, share_neg, mean_score")
    if {"n", "mean_stars", "share_neg", "mean_score"} <= set(t.columns) and set(t.index) == set(d[col]):
        good = all(int(t.loc[k, "n"]) == len(v) and abs(t.loc[k, "mean_stars"] - v["stars"].mean()) <= 0.006
                   and abs(t.loc[k, "share_neg"] - (v["label"] == "neg").mean()) <= 0.006
                   and abs(t.loc[k, "mean_score"] - v["score"].mean()) <= 0.006 for k, v in g)
        ok(good, f"{name}: значения посчитаны верно (2 знака)")
        ok(list(t["mean_stars"]) == sorted(t["mean_stars"], reverse=True), f"{name} отсортирован по mean_stars по убыванию")
ms_city = d.groupby("city")["stars"].mean()
ms_cat = d.groupby("category")["stars"].mean()
bc, wc = var("best_city"), var("worst_category")
ok(bc in ms_city.index and abs(ms_city[bc] - ms_city.max()) < 0.006, f"best_city = {ms_city.idxmax()}")
ok(wc in ms_cat.index and abs(ms_cat[wc] - ms_cat.min()) < 0.006, f"worst_category = {ms_cat.idxmin()}")
pv = var("pivot", pd.DataFrame)
ok(set(pv.index) == set(d["city"]) and set(pv.columns) == set(d["category"]), "pivot: строки — города, столбцы — категории")
e = d.pivot_table(index="city", columns="category", values="stars", aggfunc="mean")
ok(set(pv.index) == set(d["city"]) and set(pv.columns) == set(d["category"]) and ((pv.loc[e.index, e.columns] - e).abs().fillna(0) <= 0.006).all().all(), "pivot — средние оценки для пар «город × категория»")
`,
      hint: "`mean_stars=(\"stars\", \"mean\")`, `mean_score=(\"score\", \"mean\")`, `.sort_values(\"mean_stars\", ascending=False)`; `best_city = by_city[\"mean_stars\"].idxmax()`; `pivot = df.pivot_table(index=\"city\", columns=\"category\", values=\"stars\", aggfunc=\"mean\").round(2)`.",
      solution: R`def summarize(col):
    return (df.groupby(col)
              .agg(n=("stars", "size"),
                   mean_stars=("stars", "mean"),
                   share_neg=("label", lambda s: (s == "neg").mean()),
                   mean_score=("score", "mean"))
              .round(2)
              .sort_values("mean_stars", ascending=False))

by_cat = summarize("category")
by_city = summarize("city")
best_city = by_city["mean_stars"].idxmax()
worst_category = by_cat["mean_stars"].idxmin()
pivot = df.pivot_table(index="city", columns="category", values="stars", aggfunc="mean").round(2)

print("Лучший город:", best_city, "| худшая категория:", worst_category)
by_cat
`,
    },
    {
      id: "t5",
      title: "Шаг 5. Графики для презентации",
      setup: L08_LOAD + L08_CLEAN + L08_SENT + L08_CMP + R`import seaborn as sns
`,
      text: R`
Подготовьте рисунок для слайдов «Результаты» — **три** графика на одной строке (\`plt.subplots(1, 3)\`):

1. распределение оценок 1…5 (5 столбцов);
2. средняя оценка по категориям книг — горизонтальная диаграмма \`by_cat["mean_stars"]\` (6 столбцов);
3. тепловая карта \`pivot\` (город × категория) с подписями значений.

У каждого графика — заголовок-**вывод** (например, «Детские книги оценивают выше всех»), у столбчатых — подписи осей. Сохраните рисунок в \`project_charts.png\`.
`,
      starter: R`fig, axes = plt.subplots(1, 3, figsize=(18, 5))

stars = df["stars"].value_counts().sort_index()
axes[0].bar(stars.index, stars.values, color="goldenrod")
axes[0].set_title("Большинство отзывов — 4 и 5 звёзд")
axes[0].set_xlabel("Звёзды")
axes[0].set_ylabel("Число отзывов")

# axes[1]: by_cat["mean_stars"] — горизонтальная диаграмма
# axes[2]: sns.heatmap(pivot, annot=True, ...)

plt.tight_layout()
plt.show()
`,
      check: R`
import os
axs = figs[0].axes if figs else []
main = [a for a in axs if a.get_title()]
ok(len(main) >= 3, "Три графика с заголовками")
ok(any(len(a.patches) == 5 for a in axs), "Есть диаграмма распределения оценок (5 столбцов)")
cat_ax = [a for a in axs if len(a.patches) == 6]
ok(bool(cat_ax), "Есть диаграмма средней оценки по 6 категориям")
if cat_ax:
    a = cat_ax[0]
    widths = sorted(round(p.get_width(), 2) for p in a.patches)
    ok(widths == sorted(round(v, 2) for v in ns["by_cat"]["mean_stars"]), "Диаграмма категорий горизонтальная (barh): длина столбца = средняя оценка")
    ok(a.get_xlabel() != "", "У диаграммы категорий подписана ось значений")
hm = [a for a in axs if any(type(c).__name__ == "QuadMesh" for c in a.collections)]
ok(bool(hm) and len(hm[0].texts) >= 20, "Тепловая карта pivot с подписями значений (annot=True)")
ok(os.path.exists("project_charts.png") and uses("savefig"), "Рисунок сохранён в project_charts.png")
`,
      hint: "`by_cat[\"mean_stars\"].sort_values().plot(kind=\"barh\", ax=axes[1])` (или `axes[1].barh(...)`); `sns.heatmap(pivot, annot=True, fmt=\".1f\", cmap=\"RdYlGn\", ax=axes[2])`; `fig.savefig(\"project_charts.png\", dpi=150, bbox_inches=\"tight\")` перед `plt.show()`.",
      solution: R`fig, axes = plt.subplots(1, 3, figsize=(18, 5))

stars = df["stars"].value_counts().sort_index()
axes[0].bar(stars.index, stars.values, color="goldenrod")
axes[0].set_title("Большинство отзывов — 4 и 5 звёзд")
axes[0].set_xlabel("Звёзды")
axes[0].set_ylabel("Число отзывов")

by_cat["mean_stars"].sort_values().plot(kind="barh", ax=axes[1], color="seagreen")
axes[1].set_title(f"Выше всех оценивают: {by_cat.index[0]}")
axes[1].set_xlabel("Средняя оценка")
axes[1].set_ylabel("Категория")
axes[1].set_xlim(1, 5)

sns.heatmap(pivot, annot=True, fmt=".1f", cmap="RdYlGn", vmin=1, vmax=5, ax=axes[2])
axes[2].set_title("Оценки по городам и категориям")
axes[2].set_xlabel("Категория")
axes[2].set_ylabel("Город")
axes[2].tick_params(axis="y", rotation=0)

plt.tight_layout()
fig.savefig("project_charts.png", dpi=150, bbox_inches="tight")
plt.show()
`,
    },
    {
      id: "t6",
      title: "Шаг 6. Отчёт по проекту",
      setup: L08_LOAD + L08_CLEAN + L08_SENT + L08_CMP,
      text: R`
Соберите итоги проекта в словарь \`report\` с ключами:

| Ключ | Содержимое |
|---|---|
| \`title\` | название проекта (строка) |
| \`problem\` | проблема и цель (строка) |
| \`data\` | описание данных (строка) |
| \`methods\` | список применённых методов (не меньше 3 пунктов) |
| \`metrics\` | словарь: \`n_reviews\`, \`mean_stars\` (2 знака), \`share_pos\` (3 знака), \`accuracy\` |
| \`findings\` | список выводов (не меньше 3), числа — из переменных |
| \`limitations\` | список ограничений (не меньше 1) |

Затем сгенерируйте из словаря Markdown-строку \`report_md\`: заголовок \`# title\`, разделы \`## ...\` (не меньше 4), выводы и ограничения — пунктами списка. Выведите отчёт.
`,
      starter: R`report = {
    "title": "Анализ отзывов о книгах на узбекском языке",
    "problem": "...",
    "data": "...",
    "methods": [],
    "metrics": {},
    "findings": [],
    "limitations": [],
}

report_md = "# " + report["title"] + "\n"
# добавьте разделы ## Проблема, ## Данные, ## Методы, ## Результаты, ## Ограничения

print(report_md)
`,
      check: R`
d = ns["df"]
rp = var("report", dict)
need = ["title", "problem", "data", "methods", "metrics", "findings", "limitations"]
ok(all(k in rp for k in need), "В report есть ключи: " + ", ".join(need))
ok(all(isinstance(rp.get(k), str) and len(rp.get(k, "")) > 10 and "..." not in rp.get(k, "") for k in ["title", "problem", "data"]), "title, problem, data — осмысленные строки")
ok(isinstance(rp.get("methods"), list) and len(rp["methods"]) >= 3, "methods — не меньше 3 методов")
m = rp.get("metrics", {})
ok(isinstance(m, dict) and m.get("n_reviews") == len(d), "metrics['n_reviews'] = 180")
ok(isinstance(m, dict) and m.get("mean_stars") == round(d["stars"].mean(), 2) and m.get("share_pos") == round((d["stars"] >= 4).mean(), 3), "metrics: mean_stars (2 знака) и share_pos (3 знака)")
ok(isinstance(m, dict) and m.get("accuracy") == ns["accuracy"], f"metrics['accuracy'] = {ns['accuracy']}")
f = rp.get("findings", [])
ok(isinstance(f, list) and len(f) >= 3 and all(isinstance(x, str) and len(x) > 10 for x in f), "findings — не меньше 3 выводов (строки)")
ok(isinstance(rp.get("limitations"), list) and len(rp["limitations"]) >= 1, "limitations — не меньше одного ограничения")
md = var("report_md", str)
ok(md.lstrip().startswith("# " + str(rp.get("title", ""))), "report_md начинается с «# » и названия проекта")
ok(sum(1 for l in md.splitlines() if l.startswith("## ")) >= 4, "В report_md не меньше 4 разделов «## »")
ok(isinstance(f, list) and len(f) > 0 and all(str(x) in md for x in f), "Все выводы findings вошли в report_md")
ok(str(ns["accuracy"]) in md, "В report_md указана точность метода (accuracy)")
`,
      hint: "Выводы собирайте f-строками: `f\"Доля положительных отзывов — {share_pos:.0%}\"`. Markdown: `report_md += \"\\n## Результаты\\n\" + \"\\n\".join(\"- \" + x for x in report[\"findings\"])`.",
      solution: R`share_pos = round(float((df["stars"] >= 4).mean()), 3)
neg_words = Counter(w for t in df.loc[df["label"] == "neg", "tokens"] for w in t if w not in stop and len(w) >= 3)

report = {
    "title": "Анализ отзывов о книгах на узбекском языке",
    "problem": "Автоматически определить, чем довольны и недовольны покупатели книжного интернет-магазина.",
    "data": f"{len(df)} отзывов (reviews_uz.csv): оценка 1–5, текст на узбекском, категория книги, город.",
    "methods": [
        "нормализация регистра и апострофов, токенизация",
        "частотный анализ ключевых слов по группам отзывов",
        "словарный анализ тональности с учётом отрицания emas",
        "сравнение категорий и городов (groupby, pivot_table)",
    ],
    "metrics": {
        "n_reviews": len(df),
        "mean_stars": round(df["stars"].mean(), 2),
        "share_pos": share_pos,
        "accuracy": accuracy,
    },
    "findings": [
        f"Положительных отзывов (4–5★) — {share_pos:.0%}, средняя оценка {df['stars'].mean():.2f}.",
        f"Словарный метод совпадает с оценкой покупателя в {accuracy:.1%} случаев.",
        "В негативных отзывах чаще всего: " + ", ".join(w for w, _ in neg_words.most_common(3)) + ".",
        f"Выше всех оценивают категорию «{by_cat.index[0]}», ниже всех — «{by_cat.index[-1]}».",
        f"Самые довольные покупатели — в городе {by_city.index[0]}.",
    ],
    "limitations": [
        "Небольшая выборка (180 отзывов), в некоторых категориях меньше 20 отзывов.",
        "Словарь тональности составлен вручную и не покрывает новые слова.",
    ],
}

report_md = "# " + report["title"] + "\n"
report_md += "\n## Проблема\n" + report["problem"] + "\n"
report_md += "\n## Данные\n" + report["data"] + "\n"
report_md += "\n## Методы\n" + "\n".join("- " + x for x in report["methods"]) + "\n"
report_md += "\n## Метрики\n" + "\n".join(f"- {k}: {v}" for k, v in report["metrics"].items()) + "\n"
report_md += "\n## Выводы\n" + "\n".join("- " + x for x in report["findings"]) + "\n"
report_md += "\n## Ограничения\n" + "\n".join("- " + x for x in report["limitations"]) + "\n"

print(report_md)
`,
    },
    {
      id: "t7",
      env: "choice",
      title: "Шаг 7. Структура презентации",
      text: R`
У вас 7 минут на защиту мини-проекта. Какой порядок слайдов правильный?
`,
      options: [
        "Код программы → Графики → Данные → Цель → Выводы",
        "Титульный → Проблема и цель → Данные → Методы (конвейер) → Результаты (графики с выводами в заголовках) → Выводы и ограничения → Вопросы",
        "Титульный → Выводы → Благодарности → Данные → Код",
        "Титульный → Теория Big Data (10 слайдов) → Результаты → Вопросы",
      ],
      answer: 1,
      explain: R`
Презентация повторяет логику исследования: зачем (проблема) → на чём (данные) → как (методы) → что получилось (результаты) → что это значит (выводы и ограничения). Код на слайды не выносят — его показывают в репозитории или приложении, а общую теорию дают в 1–2 предложениях, а не на десяти слайдах.
`,
    },
  ],
  quiz: [
    { q: "С чего начинается мини-проект по анализу данных?", options: ["С выбора библиотеки для графиков", "С формулировки проблемы, цели и исследовательских вопросов", "С написания презентации", "С обучения нейросети"], answer: 1, explain: "Без вопроса нельзя выбрать ни данные, ни методы, ни графики." },
    { q: "Почему «yomon emas» нельзя считать негативным отзывом?", options: ["Это опечатка", "Частица emas отрицает предыдущее слово: «неплохо»", "Слово yomon положительное", "emas — стоп-слово"], answer: 1 },
    { q: "Что показывает матрица ошибок `pd.crosstab(label, pred)`?", options: ["Только общую точность", "Сколько отзывов каждого истинного класса отнесено к каждому предсказанному классу", "Корреляцию звёзд и длины текста", "Список ошибок в коде"], answer: 1, explain: "По диагонали — верные ответы, вне диагонали — конкретные виды ошибок (например, neu → pos)." },
    { q: "В категории 6 отзывов со средней оценкой 4.67, в другой — 78 отзывов со средней 4.17. Какой вывод корректен?", options: ["Первая категория точно лучше", "Разница может быть случайной: в первой группе слишком мало отзывов", "Вторая категория хуже на 12%", "Нужно удалить маленькую категорию из данных без упоминания"], answer: 1 },
    { q: "Какой заголовок слайда с графиком лучше?", options: ["«График 3»", "«Результаты»", "«Негативные отзывы связаны с доставкой и упаковкой»", "«sns.barplot»"], answer: 2, explain: "Заголовок-вывод сразу сообщает слушателю главную мысль слайда." },
    { q: "Сколько слайдов оптимально для 7-минутной защиты?", options: ["2–3", "8–10", "25–30", "Чем больше, тем лучше"], answer: 1 },
  ],
  realEnv: R`
## Как оформить проект в реальной среде

1. **Jupyter / Anaconda**: создайте папку по шаблону (\`data/\`, \`notebooks/\`, \`reports/\`), окружение \`conda create -n reviews python=3.11 pandas matplotlib seaborn jupyter\` и зафиксируйте версии: \`pip freeze > requirements.txt\`.
2. **Воспроизводимость**: блокнот должен выполняться сверху вниз после *Kernel → Restart & Run All*; исходные данные не изменяются вручную, все преобразования — в коде.
3. **GitHub**: опубликуйте репозиторий с \`README.md\` (цель, данные, как запустить, главные выводы и 1–2 графика). Большие данные в Git не кладут — дайте ссылку или скрипт загрузки.
4. **Google Colab**: откройте блокнот из GitHub (*File → Open notebook → GitHub*) и дайте преподавателю ссылку с доступом на просмотр.

## Презентация

- Графики сохраняйте с \`dpi=200\` и вставляйте в PowerPoint / Google Slides / Canva.
- Из Jupyter можно сделать слайды напрямую: разметьте ячейки (*View → Cell Toolbar → Slideshow*) и выполните \`jupyter nbconvert reviews.ipynb --to slides --post serve\` (или расширение RISE).
- Отрепетируйте доклад с таймером: 7 минут ≈ 1 минута на 1–1,5 слайда.

## Как масштабировать проект на Big Data

- Миллионы отзывов храните в **MongoDB** или **HDFS** (JSON Lines), считайте частоты и средние в **Spark** (\`groupBy\`, \`agg\`), а в pandas загружайте только агрегаты.
- Вместо ручного словаря обучите классификатор (\`scikit-learn\`: TF-IDF + логистическая регрессия) и сравните его accuracy со словарным методом.
`,
  homework: R`
## Самостоятельная работа: выберите тему собственного мини-проекта

Выполните проект по той же методологии (проблема → данные → конвейер → анализ → 2–4 графика → отчёт → презентация 7 минут):

1. **«Тематика узбекских новостей»** — \`data/corpus_uz/\`, \`data/news_raw.csv\` и статьи учебного сайта: очистка, ключевые слова и облака слов по категориям, сравнение лексического разнообразия.
2. **«Анализ больших объёмов данных, формируемых в социальных сетях»** — \`data/tweets_stream.csv\`: динамика постов во время Навруза, платформы и языки, хештеги, тональность узбекских постов.
3. **«Читательские предпочтения»** — \`data/sales.xlsx\` + \`data/reviews_uz.csv\`: связь продаж, цены и оценок книг, сезонность.
4. **«Успеваемость студентов-лингвистов»** — \`data/students.csv\`: факторы GPA (посещаемость, уровень английского, город, курс).
5. **«Латиница и кириллица в узбекских текстах»** — \`data/corpus_cyr/\` и \`data/news_raw.csv\`: доля текстов в каждой письменности, транслитерация, частотные различия.

Тема для эссе: «Перспективы применения технологий Big Data в компьютерной лингвистике».
`,
});
