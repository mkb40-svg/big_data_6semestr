/* Л7. Визуализация текстовых данных: частоты, закон Ципфа, длины, тепловые карты, облака слов. */
const L07_CORPUS = R`import re
from collections import Counter
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

def normalize(text):
    """Нижний регистр и единые апострофы: oʻ/gʻ (U+02BB), остальные — ʼ (U+02BC)."""
    text = text.lower()
    for ch in ["'", "\u2018", "\u2019", "\x60", "\u02bb"]:
        text = text.replace(ch, "\u02bc")
    return re.sub("([og])\u02bc", "\\1\u02bb", text)

def tokenize(text):
    """Список буквенных слов нормализованного текста."""
    return [w for w in re.findall(r"\w+", normalize(text)) if w.isalpha()]

stop = set(open("data/stopwords_uz.txt", encoding="utf-8").read().split())
docs = pd.read_csv("data/corpus_uz/meta.csv")
docs["text"] = [open("data/corpus_uz/" + f, encoding="utf-8").read().split("\n", 1)[1].strip() for f in docs["file"]]
docs["tokens"] = docs["text"].apply(tokenize)
`;

const L07_FREQ = R`
freq = Counter(w for toks in docs["tokens"] for w in toks if w not in stop and len(w) >= 3)
`;

BDT.register({
  id: "l07",
  kind: "lab",
  num: 7,
  title: "Визуализация текстовых данных (Matplotlib, Seaborn, WordCloud)",
  hours: 4,
  env: ["python"],
  goals: [
    "Превращать текст в числа, пригодные для графиков: частоты слов, длины предложений, матрицы «слово × категория»",
    "Строить частотные диаграммы top-N и проверять закон Ципфа на двойной логарифмической шкале",
    "Сравнивать категории текстов с помощью boxplot, тепловых карт и облаков слов в subplots",
    "Связывать оценку (звёзды отзыва) с характеристиками текста",
  ],
  theory: R`
## Как визуализировать текст

График строится по числам, поэтому сначала текст превращают в **признаки**: частоты слов, длины предложений и документов, матрицы встречаемости. Перед подсчётом текст нормализуют — иначе \`oʻzbek\`, \`o'zbek\` и \`o‘zbek\` будут посчитаны как три разных слова, и частоты «размажутся».

| Вопрос исследователя | Визуализация | Инструмент |
|---|---|---|
| Какие слова самые частые? | горизонтальная диаграмма top-N | \`ax.barh\` |
| Подчиняется ли корпус закону Ципфа? | ранг–частота в log-log | \`ax.loglog\` |
| Различаются ли тексты по длине? | «ящик с усами» по группам | \`sns.boxplot\` |
| Какие слова характерны для категорий? | тепловая карта | \`sns.heatmap\` |
| О чём категория? | облако слов | \`WordCloud\` + \`subplots\` |
| Связана ли оценка с текстом? | распределение и средние по группам | \`sns.countplot\`, \`sns.barplot\` |

## Частотная диаграмма top-N

\`\`\`python
from collections import Counter
freq = Counter(w for toks in docs["tokens"] for w in toks if w not in stop and len(w) >= 3)
top = freq.most_common(20)
words, counts = zip(*top[::-1])          # переворачиваем: самое частое слово окажется вверху
fig, ax = plt.subplots(figsize=(7, 6))
bars = ax.barh(words, counts)
ax.bar_label(bars, padding=2)             # числа у столбцов
ax.set_title("Топ-20 слов корпуса"); ax.set_xlabel("Частота")
\`\`\`

Горизонтальные столбцы удобнее вертикальных: длинные слова читаются без поворота.

## Закон Ципфа

Если упорядочить слова по убыванию частоты, то частота слова примерно обратно пропорциональна его **рангу** r:

f(r) ≈ C / r^a, где a ≈ 1.

После логарифмирования: log f = log C − a · log r — это **прямая** с наклоном −a на двойной логарифмической шкале.

\`\`\`python
import numpy as np
freqs = np.array(sorted(all_freq.values(), reverse=True))
ranks = np.arange(1, len(freqs) + 1)
ax.loglog(ranks, freqs, ".", label="корпус")            # обе оси логарифмические
ax.loglog(ranks, freqs[0] / ranks, "--", label="Ципф: C/r")
slope, intercept = np.polyfit(np.log10(ranks), np.log10(freqs), 1)
\`\`\`

> [!NOTE] Маленький корпус
> В 16 коротких новостях много слов встречается 1 раз (**гапаксы**), поэтому «хвост» графика превращается в горизонтальные ступеньки, а наклон получается меньше 1 по модулю. На миллионах слов закон выполняется намного точнее.

## Распределения по группам: boxplot

\`\`\`python
import seaborn as sns
sns.boxplot(data=sent_df, x="n_words", y="category", order=order)   # горизонтальные ящики
\`\`\`

Ящики удобно упорядочить по медиане (\`order=\`), а при большом числе категорий располагать их по оси Y.

## Матрица «слово × категория»: heatmap

\`\`\`python
long = docs[["category", "tokens"]].explode("tokens")      # одна строка = одно слово
mat = pd.crosstab(long["tokens"], long["category"]).loc[top10]
sns.heatmap(mat, annot=True, fmt="d", cmap="YlGnBu")
\`\`\`

Если категории сильно различаются по объёму, сравнивайте не абсолютные частоты, а **относительные** (на 1000 слов): \`mat / mat.sum() * 1000\`.

## Облака слов для нескольких категорий

\`\`\`python
fig, axes = plt.subplots(2, 2, figsize=(12, 7))
for ax, cat in zip(axes.flat, cats):
    wc = WordCloud(width=400, height=250, background_color="white").generate_from_frequencies(f[cat])
    ax.imshow(wc); ax.set_title(cat); ax.axis("off")
\`\`\`

\`axes.flat\` перебирает все области сетки по порядку. Не забудьте заменить ʻ ʼ на \`'\` (встроенный шрифт WordCloud их не содержит).

## Типичные ошибки

> [!WARNING] Проверьте перед выводами
> - стоп-слова не удалены — в топе одни \`va\`, \`bu\`, \`bilan\`;
> - апострофы не нормализованы — одно слово разбито на несколько;
> - мало данных: категория из 1–2 текстов не позволяет делать статистических выводов;
> - облако слов — иллюстрация, а не измерение: точные значения показывайте столбчатой диаграммой.
`,
  tasks: [
    {
      id: "t1",
      title: "Топ-20 слов: горизонтальная диаграмма",
      setup: L07_CORPUS,
      text: R`
Подготовлены: \`docs\` — 16 новостей (\`file, title, category, …, text, tokens\`; \`tokens\` — нормализованные буквенные слова), \`stop\` — стоп-слова.

1. \`freq\` — Counter содержательных слов всего корпуса: не из \`stop\` и длиной не меньше 3.
2. \`top20 = freq.most_common(20)\`.
3. Горизонтальная диаграмма: **самое частое слово — вверху**, заголовок и подпись оси X. По желанию подпишите значения (\`ax.bar_label\`).
`,
      starter: R`freq = Counter()
for toks in docs["tokens"]:
    ...

top20 = freq.most_common(20)
print(top20[:5])

words = [w for w, c in top20]
counts = [c for w, c in top20]

fig, ax = plt.subplots(figsize=(7, 6))
ax.barh(words, counts, color="steelblue")
plt.show()
`,
      check: L07_CORPUS + L07_FREQ + R`
t = var("top20", list)
ok(len(t) == 20 and [c for _, c in t] == [c for _, c in freq.most_common(20)], "top20 — 20 самых частых содержательных слов (без стоп-слов, длина ≥ 3)")
ok(len(t) == 20 and all(freq[w] == c for w, c in t), "Частоты в top20 посчитаны по всем 16 текстам")
ax = figs[0].axes[0] if figs and figs[0].axes else None
ok(ax is not None and len(ax.patches) == 20, "На диаграмме 20 столбцов")
if ax is not None and len(ax.patches) == 20:
    bars = ax.patches
    ok(sorted(round(p.get_width()) for p in bars) == sorted(c for _, c in freq.most_common(20)), "Диаграмма горизонтальная (barh): длина столбца = частота")
    mx = max(p.get_width() for p in bars)
    ok(max(p.get_y() for p in bars if p.get_width() == mx) >= max(p.get_y() for p in bars) - 1e-9, "Самое частое слово — вверху диаграммы")
    ok(ax.get_title() != "" and ax.get_xlabel() != "", "Есть заголовок и подпись оси X")
`,
      hint: "В цикле: `freq.update(w for w in toks if w not in stop and len(w) >= 3)`. Чтобы самое частое слово было вверху, переверните списки: `ax.barh(words[::-1], counts[::-1])`.",
      solution: R`freq = Counter()
for toks in docs["tokens"]:
    freq.update(w for w in toks if w not in stop and len(w) >= 3)

top20 = freq.most_common(20)
print(top20[:5])

words = [w for w, c in top20][::-1]
counts = [c for w, c in top20][::-1]

fig, ax = plt.subplots(figsize=(7, 6))
bars = ax.barh(words, counts, color="steelblue")
ax.bar_label(bars, padding=2)
ax.set_title("Топ-20 слов корпуса узбекских новостей")
ax.set_xlabel("Частота")
plt.show()
`,
    },
    {
      id: "t2",
      title: "Закон Ципфа: ранг–частота",
      setup: L07_CORPUS,
      text: R`
Проверьте закон Ципфа на корпусе. Здесь учитываются **все** слова, включая стоп-слова.

1. \`all_freq\` — Counter всех токенов из \`docs["tokens"]\`.
2. \`freqs\` — массив numpy частот по убыванию, \`ranks\` — ранги \`1, 2, …, len(freqs)\`.
3. \`slope\` — наклон прямой \`np.polyfit(np.log10(ranks), np.log10(freqs), 1)\`.
4. График в **двойной логарифмической** шкале: точки корпуса и пунктир идеального закона \`freqs[0] / ranks\`; заголовок, подписи осей, легенда.
`,
      starter: R`all_freq = ...
freqs = ...
ranks = ...
slope, intercept = ...

print("Разных слов:", len(freqs), "наклон:", slope)

fig, ax = plt.subplots(figsize=(7, 5))
ax.plot(ranks, freqs, ".", label="корпус")
plt.show()
`,
      check: L07_CORPUS + R`
af = Counter(w for toks in docs["tokens"] for w in toks)
ef = np.array(sorted(af.values(), reverse=True))
er = np.arange(1, len(ef) + 1)
es = np.polyfit(np.log10(er), np.log10(ef), 1)[0]
f = np.asarray(var("freqs"))
ok(f.shape == ef.shape and (f == ef).all(), f"freqs — {len(ef)} частот всех слов по убыванию")
ok(np.array_equal(np.asarray(var("ranks")), er), "ranks = 1, 2, …, len(freqs)")
s = var("slope")
ok(isinstance(s, (float, np.floating)) and abs(float(s) - es) < 0.01, f"slope ≈ {es:.3f} (наклон прямой в log-log)")
ax = figs[0].axes[0] if figs and figs[0].axes else None
ok(ax is not None and ax.get_xscale() == "log" and ax.get_yscale() == "log", "Обе оси логарифмические (loglog)")
if ax is not None:
    ok(any(len(l.get_xdata()) == len(ef) for l in ax.get_lines()), "На графике все точки «ранг–частота»")
    ok(len(ax.get_lines()) >= 2, "Добавлена линия идеального закона Ципфа")
    ok(ax.get_title() != "" and ax.get_xlabel() != "" and ax.get_ylabel() != "", "Есть заголовок и подписи осей")
    ok(ax.get_legend() is not None, "Есть легенда")
`,
      hint: "`all_freq = Counter(w for toks in docs[\"tokens\"] for w in toks)`; `freqs = np.array(sorted(all_freq.values(), reverse=True))`; `ranks = np.arange(1, len(freqs) + 1)`; `ax.loglog(...)` или `ax.set_xscale(\"log\")`, `ax.set_yscale(\"log\")`.",
      solution: R`all_freq = Counter(w for toks in docs["tokens"] for w in toks)
freqs = np.array(sorted(all_freq.values(), reverse=True))
ranks = np.arange(1, len(freqs) + 1)
slope, intercept = np.polyfit(np.log10(ranks), np.log10(freqs), 1)

print("Разных слов:", len(freqs), "наклон:", round(slope, 3))
print("Топ-5:", all_freq.most_common(5))

fig, ax = plt.subplots(figsize=(7, 5))
ax.loglog(ranks, freqs, ".", label="корпус")
ax.loglog(ranks, freqs[0] / ranks, "--", color="red", label="Ципф: C / r")
ax.set_title("Закон Ципфа для корпуса узбекских новостей")
ax.set_xlabel("Ранг слова (log)")
ax.set_ylabel("Частота (log)")
ax.legend()
plt.show()
`,
    },
    {
      id: "t3",
      title: "Длина предложений по категориям (boxplot)",
      setup: L07_CORPUS + R`import seaborn as sns
`,
      text: R`
Сравните длину предложений в разных категориях новостей.

1. Разбейте \`text\` каждой статьи на предложения: \`re.split(r"(?<=[.!?])\s+", text)\`. Для каждого предложения посчитайте число слов \`len(tokenize(s))\` (пустые пропустите).
2. \`sent_df\` — DataFrame со столбцами \`category\` и \`n_words\` (одна строка = одно предложение).
3. \`med\` — медиана \`n_words\` по категориям, по убыванию.
4. \`sns.boxplot\` с горизонтальными ящиками (категории по оси Y) в порядке \`med.index\`, заголовок и подпись оси X.
`,
      starter: R`rows = []
for cat, text in zip(docs["category"], docs["text"]):
    for s in re.split(r"(?<=[.!?])\s+", text):
        ...

sent_df = pd.DataFrame(rows)
med = ...

fig, ax = plt.subplots(figsize=(8, 6))
# sns.boxplot(...)
plt.show()
`,
      check: L07_CORPUS + R`
n_exp = sum(1 for t in docs["text"] for s in re.split(r"(?<=[.!?])\s+", t) if tokenize(s))
sd = var("sent_df", pd.DataFrame)
ok({"category", "n_words"} <= set(sd.columns), "В sent_df есть столбцы category и n_words")
ok(abs(len(sd) - n_exp) <= 0.1 * n_exp, f"В sent_df около {n_exp} предложений")
if {"category", "n_words"} <= set(sd.columns):
    ok(sd["category"].nunique() == docs["category"].nunique(), "Представлены все 12 категорий")
    ok((sd["n_words"] > 0).all(), "Пустые предложения пропущены (n_words > 0)")
    m = var("med", pd.Series)
    e = sd.groupby("category")["n_words"].median()
    ok(set(m.index) == set(e.index) and all(abs(m[k] - e[k]) < 1e-9 for k in e.index), "med — медиана длины предложения по категориям")
    ok(list(m.values) == sorted(m.values, reverse=True), "med отсортирован по убыванию")
ax = figs[0].axes[0] if figs and figs[0].axes else None
ok(uses("boxplot") and ax is not None and len(ax.patches) >= 12, "Построен sns.boxplot: по ящику на каждую из 12 категорий")
if ax is not None and isinstance(var("med"), pd.Series):
    labels = [t.get_text() for t in ax.get_yticklabels()]
    ok(labels == [str(x) for x in var("med").index], "Категории по оси Y в порядке убывания медианы (order=med.index)")
    ok(ax.get_title() != "" and ax.get_xlabel() != "", "Есть заголовок и подпись оси X")
`,
      hint: "В цикле: `n = len(tokenize(s))`, и если `n > 0`: `rows.append({\"category\": cat, \"n_words\": n})`. Медиана: `sent_df.groupby(\"category\")[\"n_words\"].median().sort_values(ascending=False)`. График: `sns.boxplot(data=sent_df, x=\"n_words\", y=\"category\", order=med.index, ax=ax)`.",
      solution: R`rows = []
for cat, text in zip(docs["category"], docs["text"]):
    for s in re.split(r"(?<=[.!?])\s+", text):
        n = len(tokenize(s))
        if n > 0:
            rows.append({"category": cat, "n_words": n})

sent_df = pd.DataFrame(rows)
med = sent_df.groupby("category")["n_words"].median().sort_values(ascending=False)
print(len(sent_df), "предложений")
print(med.head(3))

fig, ax = plt.subplots(figsize=(8, 6))
sns.boxplot(data=sent_df, x="n_words", y="category", order=med.index, color="lightblue", ax=ax)
ax.set_title("Длина предложений по категориям")
ax.set_xlabel("Слов в предложении")
ax.set_ylabel("Категория")
plt.show()
`,
    },
    {
      id: "t4",
      title: "Тепловая карта «слово × категория»",
      setup: L07_CORPUS + L07_FREQ + R`import seaborn as sns
`,
      text: R`
\`freq\` — Counter содержательных слов корпуса (как в задании 1).

1. \`top10\` — список 10 самых частых слов из \`freq\`.
2. \`mat\` — DataFrame: строки — слова \`top10\`, столбцы — все 12 категорий, значения — сколько раз слово встречается в статьях категории (целые числа).
3. Тепловая карта \`sns.heatmap\` с подписями значений (\`annot=True, fmt="d"\`) и заголовком.

Какие слова «привязаны» к одной категории, а какие встречаются везде?
`,
      starter: R`top10 = ...
cats = sorted(docs["category"].unique())

mat = pd.DataFrame(0, index=top10, columns=cats)
for cat, toks in zip(docs["category"], docs["tokens"]):
    c = Counter(toks)
    ...

fig, ax = plt.subplots(figsize=(12, 5))
# sns.heatmap(...)
plt.show()
`,
      check: L07_CORPUS + L07_FREQ + R`
m = var("mat", pd.DataFrame)
cats = set(docs["category"])
ok(m.shape == (10, 12) and set(m.columns) == cats, "mat: 10 строк (слова) × 12 столбцов (категории)")
tenth = freq.most_common(10)[-1][1]
ok(len(m) == 10 and all(freq.get(w, 0) >= tenth for w in m.index), "Строки mat — 10 самых частых слов")
per_cat = {c: Counter() for c in cats}
for c, toks in zip(docs["category"], docs["tokens"]):
    per_cat[c].update(toks)
good = m.shape == (10, 12) and set(m.columns) == cats and all(int(m.loc[w, c]) == per_cat[c][w] for w in m.index for c in m.columns)
ok(good, "Значения mat — частоты слов в каждой категории")
axs = figs[0].axes if figs else []
hm = [a for a in axs if any(type(col).__name__ == "QuadMesh" for col in a.collections)]
ok(len(hm) >= 1, "Построена тепловая карта (sns.heatmap)")
ok(len(hm) >= 1 and len(hm[0].texts) == 120, "В ячейках подписаны значения (annot=True)")
ok(len(hm) >= 1 and hm[0].get_title() != "", "У тепловой карты есть заголовок")
`,
      hint: "`top10 = [w for w, _ in freq.most_common(10)]`; внутри цикла: `for w in top10: mat.loc[w, cat] += c[w]`. Другой путь: `long = docs[[\"category\", \"tokens\"]].explode(\"tokens\")`, `pd.crosstab(long[\"tokens\"], long[\"category\"]).loc[top10]`.",
      solution: R`top10 = [w for w, _ in freq.most_common(10)]
cats = sorted(docs["category"].unique())

mat = pd.DataFrame(0, index=top10, columns=cats)
for cat, toks in zip(docs["category"], docs["tokens"]):
    c = Counter(toks)
    for w in top10:
        mat.loc[w, cat] += c[w]

fig, ax = plt.subplots(figsize=(12, 5))
sns.heatmap(mat, annot=True, fmt="d", cmap="YlGnBu", linewidths=0.5, ax=ax)
ax.set_title("Частота топ-10 слов по категориям")
ax.set_xlabel("Категория")
ax.set_ylabel("Слово")
plt.show()
`,
    },
    {
      id: "t5",
      title: "Облака слов по категориям",
      setup: L07_CORPUS + R`from wordcloud import WordCloud
`,
      text: R`
Постройте облака слов для четырёх категорий, в которых по две статьи: \`cats4 = ["jamiyat", "taʼlim", "texnologiya", "turizm"]\`.

1. Для каждой категории посчитайте частоты содержательных слов (не из \`stop\`, длина ≥ 3) и замените в словах ʻ и ʼ на \`'\`.
2. Постройте \`WordCloud(width=400, height=250, background_color="white", max_words=40)\` по этим частотам.
3. Сохраните облака в словарь \`clouds\` (\`{категория: WordCloud}\`) и покажите их на рисунке 2×2: в каждой области — облако, заголовок = название категории, оси скрыты.
`,
      starter: R`cats4 = ["jamiyat", "taʼlim", "texnologiya", "turizm"]
clouds = {}

fig, axes = plt.subplots(2, 2, figsize=(12, 7))
for ax, cat in zip(axes.flat, cats4):
    f = Counter()
    for toks in docs.loc[docs["category"] == cat, "tokens"]:
        ...
    # clouds[cat] = WordCloud(...).generate_from_frequencies(f)
    # ax.imshow(...); ax.set_title(cat); ax.axis("off")

plt.tight_layout()
plt.show()
`,
      check: L07_CORPUS + R`
cats4 = ["jamiyat", "taʼlim", "texnologiya", "turizm"]
cl = var("clouds", dict)
ok(set(cl) == set(cats4), "clouds — словарь с 4 категориями: jamiyat, taʼlim, texnologiya, turizm")
for cat in cats4:
    wc = cl.get(cat)
    if wc is None or not hasattr(wc, "words_"):
        ok(False, f"clouds['{cat}'] — объект WordCloud, построенный методом generate_from_frequencies")
        continue
    f = Counter()
    for toks in docs.loc[docs["category"] == cat, "tokens"]:
        f.update(w.replace("ʻ", "'").replace("ʼ", "'") for w in toks if w not in stop and len(w) >= 3)
    best = max(wc.words_, key=wc.words_.get)
    ok(f.get(best, 0) == f.most_common(1)[0][1] and not any(("ʻ" in w or "ʼ" in w) for w in wc.words_), f"Облако «{cat}»: частоты только этой категории, без стоп-слов, апострофы заменены на '")
axs = figs[0].axes if figs else []
ok(len(axs) == 4 and all(len(a.images) >= 1 for a in axs), "Рисунок 2×2: в каждой области показано облако (imshow)")
ok({a.get_title() for a in axs} == set(cats4), "Заголовки областей — названия категорий")
ok(len(axs) == 4 and not any(a.axison for a in axs), "Оси скрыты (ax.axis(\"off\"))")
`,
      hint: "В цикле по статьям: `f.update(w.replace(\"ʻ\", \"'\").replace(\"ʼ\", \"'\") for w in toks if w not in stop and len(w) >= 3)`. Затем `clouds[cat] = WordCloud(...).generate_from_frequencies(f)`, `ax.imshow(clouds[cat])`.",
      solution: R`cats4 = ["jamiyat", "taʼlim", "texnologiya", "turizm"]
clouds = {}

fig, axes = plt.subplots(2, 2, figsize=(12, 7))
for ax, cat in zip(axes.flat, cats4):
    f = Counter()
    for toks in docs.loc[docs["category"] == cat, "tokens"]:
        f.update(w.replace("ʻ", "'").replace("ʼ", "'") for w in toks if w not in stop and len(w) >= 3)
    clouds[cat] = WordCloud(width=400, height=250, background_color="white",
                            max_words=40, colormap="tab10").generate_from_frequencies(f)
    ax.imshow(clouds[cat], interpolation="bilinear")
    ax.set_title(cat)
    ax.axis("off")

plt.tight_layout()
plt.show()
`,
    },
    {
      id: "t6",
      title: "Отзывы: звёзды и длина текста",
      setup: R`import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
`,
      text: R`
Файл \`data/reviews_uz.csv\` — 180 отзывов о книгах (\`stars\` 1–5, \`text\` на узбекском).

1. Прочитайте его в \`rev\` и добавьте столбец \`n_words\` — число слов в тексте (\`str.split\`).
2. \`stars_counts\` — число отзывов с каждой оценкой (по возрастанию звёзд).
3. \`len_by_stars\` — средняя длина отзыва в словах для каждой оценки.
4. Рисунок 1×2: слева — распределение оценок (\`sns.countplot\` или \`bar\`), справа — средняя длина по оценкам (\`sns.barplot\`). Заголовки и подписи осей обязательны.

Пишут ли недовольные покупатели длиннее довольных?
`,
      starter: R`rev = pd.read_csv("data/reviews_uz.csv")
rev["n_words"] = ...

stars_counts = ...
len_by_stars = ...
print(stars_counts)
print(len_by_stars)

fig, axes = plt.subplots(1, 2, figsize=(12, 4))
# слева: распределение оценок
# справа: средняя длина по оценкам
plt.tight_layout()
plt.show()
`,
      check: R`
import pandas as pd
r = pd.read_csv("data/reviews_uz.csv")
r["n"] = r["text"].str.split().str.len()
e_cnt = r["stars"].value_counts().sort_index()
e_len = r.groupby("stars")["n"].mean()
rv = var("rev", pd.DataFrame)
ok(len(rv) == 180 and "n_words" in rv.columns and (rv["n_words"].values == r["n"].values).all(), "rev: 180 отзывов, столбец n_words — число слов")
sc = var("stars_counts", pd.Series)
ok([int(i) for i in sc.index] == [1, 2, 3, 4, 5] and [int(v) for v in sc.values] == [int(v) for v in e_cnt.values], "stars_counts — число отзывов по оценкам 1…5")
lb = var("len_by_stars", pd.Series)
ok(len(lb) == 5 and all(abs(float(lb[k]) - e_len[k]) < 0.01 for k in e_len.index), "len_by_stars — средняя длина отзыва в словах")
axs = figs[0].axes if figs else []
ok(len(axs) >= 2, "Рисунок из двух областей")
if len(axs) >= 2:
    ok(len(axs[0].patches) == 5 and sorted(round(p.get_height()) for p in axs[0].patches) == sorted(int(v) for v in e_cnt.values), "Слева — 5 столбцов с числом отзывов")
    ok(len(axs[1].patches) == 5, "Справа — 5 столбцов средней длины")
    ok(all(a.get_title() and a.get_xlabel() and a.get_ylabel() for a in axs[:2]), "У обоих графиков есть заголовки и подписи осей")
`,
      hint: "`rev[\"n_words\"] = rev[\"text\"].str.split().str.len()`; `stars_counts = rev[\"stars\"].value_counts().sort_index()`; `len_by_stars = rev.groupby(\"stars\")[\"n_words\"].mean()`; `sns.countplot(data=rev, x=\"stars\", ax=axes[0])`, `sns.barplot(data=rev, x=\"stars\", y=\"n_words\", ax=axes[1])`.",
      solution: R`rev = pd.read_csv("data/reviews_uz.csv")
rev["n_words"] = rev["text"].str.split().str.len()

stars_counts = rev["stars"].value_counts().sort_index()
len_by_stars = rev.groupby("stars")["n_words"].mean()
print(stars_counts)
print(len_by_stars.round(2))

fig, axes = plt.subplots(1, 2, figsize=(12, 4))
sns.countplot(data=rev, x="stars", color="goldenrod", ax=axes[0])
axes[0].set_title("Распределение оценок")
axes[0].set_xlabel("Звёзды")
axes[0].set_ylabel("Число отзывов")

sns.barplot(data=rev, x="stars", y="n_words", color="seagreen", ax=axes[1])
axes[1].set_title("Средняя длина отзыва по оценкам")
axes[1].set_xlabel("Звёзды")
axes[1].set_ylabel("Слов в отзыве")
plt.tight_layout()
plt.show()
`,
    },
  ],
  quiz: [
    { q: "Как выглядит закон Ципфа на графике ранг–частота в двойной логарифмической шкале?", options: ["Как парабола", "Примерно как прямая с наклоном около −1", "Как горизонтальная линия", "Как синусоида"], answer: 1, explain: "f(r) ≈ C / r, значит log f = log C − log r — прямая с наклоном −1." },
    { q: "Почему для топ-слов удобнее горизонтальная диаграмма (`barh`)?", options: ["Она строится быстрее", "Длинные слова читаются без поворота подписей", "matplotlib не умеет вертикальные столбцы", "Так меньше цветов"], answer: 1 },
    { q: "Что произойдёт, если не нормализовать апострофы перед подсчётом частот?", options: ["Ничего", "Одно слово (oʻzbek, o'zbek, o‘zbek) будет посчитано как несколько разных — частоты занизятся", "Программа упадёт с ошибкой", "Стоп-слова удалятся сами"], answer: 1 },
    { q: "Что показывает тепловая карта «слово × категория»?", options: ["Порядок слов в предложении", "Частоту каждого слова в каждой категории цветом ячейки", "Длину текстов", "Количество категорий"], answer: 1 },
    { q: "Категория А содержит 5000 слов, категория Б — 500. Как корректно сравнить частоту слова в них?", options: ["По абсолютным частотам", "По относительным частотам, например на 1000 слов", "Удалить категорию Б", "Построить облако слов"], answer: 1, explain: "Абсолютные частоты зависят от объёма категории, поэтому используют нормировку: `count / total * 1000`." },
    { q: "Как перебрать все области сетки `fig, axes = plt.subplots(2, 2)` одним циклом?", options: ["`for ax in axes:`", "`for ax in axes.flat:`", "`for ax in fig:`", "`for ax in range(4):`"], answer: 1, explain: "`axes` — двумерный массив 2×2; `axes.flat` перебирает его элементы по порядку." },
  ],
  realEnv: R`
## Выполнение в Jupyter

\`\`\`bash
conda activate bigdata
conda install -y matplotlib seaborn
conda install -y -c conda-forge wordcloud
\`\`\`

- Скопируйте папку \`data/\` рядом с блокнотом: код заданий (включая подготовленный) работает без изменений.
- Для отчёта сохраняйте каждый рисунок: \`fig.savefig("zipf.png", dpi=200, bbox_inches="tight")\`.
- В облаке слов можно оставить узбекские апострофы, если указать шрифт с глифами ʻ ʼ: \`WordCloud(font_path="C:/Windows/Fonts/arial.ttf")\`.

## Визуализация больших корпусов

- Частоты миллионов документов считают распределённо (MapReduce, Spark: \`flatMap → map → reduceByKey\`), а в pandas и matplotlib передают только итоговую таблицу top-N.
- Для закона Ципфа на большом корпусе достаточно взять каждую 10-ю или 100-ю точку — график не изменится, а рисунок станет лёгким.
- Интерактивные графики: **Plotly** (\`px.bar\`, \`px.imshow\` для тепловых карт), сравнение лексики двух групп текстов — библиотека **scattertext**.

> [!TIP] Google Colab
> В Colab все библиотеки уже установлены. Шрифт с узбекскими символами: \`font_path="/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"\`.
`,
  homework: R`
## Самостоятельная работа

1. Постройте график Ципфа для отзывов \`reviews_uz.csv\` и сравните наклон с корпусом новостей. Почему он отличается? (Подсказка: отзывы собраны из повторяющихся шаблонных фраз.)
2. Для корпуса новостей постройте тепловую карту **относительных** частот (на 1000 слов категории) и сравните её с абсолютной.
3. Тема для доклада: «Анализ больших объёмов данных, формируемых в социальных сетях» — какие визуализации подходят для потока постов (\`data/tweets_stream.csv\`): динамика по минутам, хештеги, облако слов, тепловая карта «платформа × язык».
`,
});
