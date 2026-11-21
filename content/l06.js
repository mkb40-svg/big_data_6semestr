/* Л6. Анализ частотности слов и N-грамм в корпусах текстов на узбекском языке */
(function () {
  const BASE = R`import re
import numpy as np
import pandas as pd
from collections import Counter

def normalize(text):
    """Все варианты апострофа -> канонические: oʻ/gʻ (U+02BB) и ʼ (U+02BC)."""
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

def tokenize(text):
    return re.findall(r"\w+", normalize(text).lower())

df = pd.read_csv("data/corpus_uz/meta.csv")[["file", "title", "category"]]
df["text"] = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in df["file"]]
df["tokens"] = df["text"].apply(tokenize)
with open("data/stopwords_uz.txt", encoding="utf-8") as _f:
    STOPWORDS = {w.strip() for w in _f if w.strip()}
`;
  const FREQ_DF = R`
freq = Counter(t for toks in df["tokens"] for t in toks)
freq_df = pd.DataFrame(freq.most_common(), columns=["word", "count"])
freq_df["rank"] = np.arange(1, len(freq_df) + 1)
`;
  const CONTENT = R`
content_tokens = [t for toks in df["tokens"] for t in toks if t not in STOPWORDS]
`;
  const REF = R`
import re
import numpy as np
import pandas as pd
from collections import Counter

def _norm(text):
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

def _tok(text):
    return re.findall(r"\w+", _norm(text).lower())

_meta = pd.read_csv("data/corpus_uz/meta.csv")
_texts = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in _meta["file"]]
_toks = [_tok(t) for t in _texts]
_all = [t for d in _toks for t in d]
_freq = Counter(_all)
_sw = {w.strip() for w in open("data/stopwords_uz.txt", encoding="utf-8") if w.strip()}
_content = [t for t in _all if t not in _sw]
`;

  BDT.register({
    id: "l06",
    kind: "lab",
    num: 6,
    title: "Анализ частотности слов и N-грамм в корпусах текстов на узбекском языке",
    hours: 4,
    env: ["python"],
    goals: [
      "Построить частотный словарь корпуса и проверить закон Ципфа (ранг × частота, наклон в логарифмических осях)",
      "Сравнить частотность слов по категориям и выделить ключевые слова категорий методом TF-IDF",
      "Найти устойчивые словосочетания (коллокации) с помощью PMI",
      "Исследовать агглютинативную морфологию: частоты суффиксов и самые частые корни после стемминга",
    ],
    theory: R`
## Частотный словарь и закон Ципфа

**Частотный словарь** — список слов корпуса, упорядоченный по убыванию частоты. Номер слова в этом списке — его **ранг** *r* (1 — самое частое слово).

Американский лингвист Дж. Ципф заметил, что частота слова обратно пропорциональна его рангу:

\`\`\`
f(r) ≈ C / r^a,   a ≈ 1      →      log f = log C − a · log r
\`\`\`

Отсюда два практических следствия:

- произведение **ранг × частота** примерно постоянно для слов «средней» частоты;
- в логарифмических осях (log r, log f) точки ложатся почти на **прямую** с наклоном ≈ −1. Наклон находят линейной регрессией:

\`\`\`python
slope, intercept = np.polyfit(np.log10(freq_df["rank"]), np.log10(freq_df["count"]), 1)
plt.loglog(freq_df["rank"], freq_df["count"], ".")
\`\`\`

Закон Ципфа объясняет, почему Big Data в лингвистике неизбежна: несколько сотен самых частых слов покрывают половину любого текста, а остальной словарь — это «длинный хвост» редких слов, и чтобы увидеть каждое из них хотя бы несколько раз, нужны миллионы токенов.

> [!NOTE] Маленький корпус — «плоский хвост»
> В нашем корпусе (~1 600 токенов) больше трёх четвертей словаря — **гапаксы** (частота 1). Они образуют горизонтальную «ступеньку» в конце графика и делают наклон более пологим. Поэтому наклон часто оценивают только по словам с частотой ≥ 2.

## Частотность по категориям и ключевые слова

Длинную таблицу «один токен — одна строка» удобно получить методом \`explode\`, а матрицу «слово × категория» — функцией \`pd.crosstab\`:

\`\`\`python
tok_df = df[["category", "tokens"]].explode("tokens").rename(columns={"tokens": "word"})
cat_counts = pd.crosstab(tok_df["word"], tok_df["category"])
\`\`\`

**Ключевые слова** категории — слова, частые в ней и редкие в остальных. Два популярных способа:

| Метод | Формула | Идея |
|---|---|---|
| отношение относительных частот | \`(f_кат / N_кат) / (f_корп / N_корп)\` | во сколько раз слово «чаще обычного» |
| **TF-IDF** | \`tf(слово, док) × idf(слово)\`, \`idf = ln((1 + n) / (1 + df)) + 1\` | частое в документе, но встречается в немногих документах |

\`\`\`python
from sklearn.feature_extraction.text import TfidfVectorizer
vec = TfidfVectorizer(stop_words=STOP_LIST)       # по умолчанию: lowercase, L2-нормировка
X = vec.fit_transform(cat_docs)                    # строки — категории, столбцы — слова
tfidf = pd.DataFrame(X.toarray(), index=cat_docs.index, columns=vec.get_feature_names_out())
tfidf.loc["sport"].nlargest(5)
\`\`\`

Шаблон токенов sklearn по умолчанию \`(?u)\b\w\w+\b\` правильно работает с узбекскими словами: знаки ʻ и ʼ — буквы, поэтому *oʻzbek* остаётся одним токеном.

## Коллокации и PMI

**Коллокация** — устойчивое сочетание, слова которого встречаются вместе чаще, чем случайно: *sunʼiy intellekt*, *terma jamoa*. Самые частые биграммы — не обязательно коллокации (*tili uchun* частая, но случайная). Мера **PMI** (pointwise mutual information) сравнивает реальную частоту пары с ожидаемой при независимости слов:

\`\`\`
PMI(x, y) = log2( P(x, y) / (P(x) · P(y)) ) ≈ log2( c(x, y) · N / (c(x) · c(y)) )
\`\`\`

PMI = 0 — слова независимы, PMI > 0 — притягиваются. Недостаток: у редких пар PMI завышен (пара из двух гапаксов, встретившаяся один раз, получает максимальный PMI). Поэтому вводят **порог частоты** (например, \`c(x, y) ≥ 2\`) и отбрасывают пары со стоп-словами. Более устойчивые меры — t-score и log-likelihood (\`nltk.collocations.BigramAssocMeasures\`).

## Морфология агглютинативного языка в цифрах

В узбекском грамматические значения выражаются цепочками суффиксов, поэтому частоты **суффиксов** многое говорят о текстах:

| Суффикс | Значение | Пример |
|---|---|---|
| -lar | множественное число | talaba**lar** |
| -ning | родительный падеж | talabalar**ning** |
| -ni | винительный падеж | kitob**ni** |
| -ga | дательный падеж | maktab**ga** |
| -da | местный падеж | Toshkent**da** |
| -dan | исходный падеж | yil**dan** |
| -dagi | признак по месту | shahar**dagi** |
| -lik, -chi | словообразование: свойство, деятель | kitobxon**lik**, dastur**chi** |
| -moqda, -gan, -di | время глагола | rivojlan**moqda**, boʻl**gan**, ochil**di** |

Простой подсчёт «слово оканчивается на суффикс» даёт приблизительную картину: *qanday* не содержит суффикса -da, хотя оканчивается на «-day». Для надёжной оценки нужны морфологический анализатор и словарь корней. **Стемминг** объединяет словоформы одного корня (*yil, yilda, yildan, yilga, yilning* → *yil*), и частотный список основ показывает **темы** корпуса точнее, чем список словоформ.
`,
    tasks: [
      {
        id: "t1",
        title: "Частотный словарь корпуса",
        setup: BASE,
        text: R`
В \`df["tokens"]\` — токены каждого документа (нормализованы, в нижнем регистре).

1. \`freq\` — \`Counter\` по всем токенам корпуса.
2. \`freq_df\` — DataFrame со столбцами \`word\`, \`count\`, отсортированный по убыванию частоты, и столбцом \`rank\` = 1, 2, 3, … (номер строки).
3. \`hapax_share\` — доля слов словаря с частотой 1.
4. \`coverage_100\` — доля всех токенов, которую покрывают 100 самых частых слов.
5. \`n_for_half\` — **минимальное** число самых частых слов, которые вместе покрывают не меньше 50 % токенов (подсказка: \`cumsum\`).
`,
        starter: R`freq = ...
freq_df = pd.DataFrame(..., columns=["word", "count"])
freq_df["rank"] = ...

hapax_share = ...
coverage_100 = ...

cum_share = freq_df["count"].cumsum() / freq_df["count"].sum()
n_for_half = ...

print(f"Словарь: {len(freq_df)} слов, гапаксов {hapax_share:.1%}")
print(f"Топ-100 покрывают {coverage_100:.1%} токенов; половину текста дают {n_for_half} слов")
freq_df.head(15)
`,
        check: REF + R`
f = var("freq")
ok(dict(f) == dict(_freq), "freq — частоты всех токенов корпуса")
fd = var("freq_df", pd.DataFrame)
ok({"word", "count", "rank"} <= set(fd.columns) and len(fd) == len(_freq), "freq_df: столбцы word, count, rank; по строке на слово")
if {"word", "count", "rank"} <= set(fd.columns):
    ok(list(fd["count"]) == sorted(_freq.values(), reverse=True) and all(_freq[w] == c for w, c in zip(fd["word"], fd["count"])), "freq_df отсортирован по убыванию частоты")
    ok(list(fd["rank"]) == list(range(1, len(fd) + 1)), "rank — номер строки: 1, 2, 3, …")
ok(abs(var("hapax_share") - sum(1 for c in _freq.values() if c == 1) / len(_freq)) < 1e-3, "hapax_share — доля слов с частотой 1")
top = sorted(_freq.values(), reverse=True)
ok(abs(var("coverage_100") - sum(top[:100]) / len(_all)) < 1e-3, "coverage_100 — доля токенов, покрытых 100 самыми частыми словами")
cs = np.cumsum(top) / len(_all)
ok(var("n_for_half") == int(np.argmax(cs >= 0.5)) + 1, "n_for_half — минимальное число слов, покрывающих ≥ 50 % токенов")
`,
        hint: R`\`freq.most_common()\` без аргумента возвращает все слова по убыванию. Ранг: \`np.arange(1, len(freq_df) + 1)\`. Минимальное число слов: \`int((cum_share < 0.5).sum()) + 1\`.`,
        solution: R`freq = Counter(t for toks in df["tokens"] for t in toks)
freq_df = pd.DataFrame(freq.most_common(), columns=["word", "count"])
freq_df["rank"] = np.arange(1, len(freq_df) + 1)

hapax_share = (freq_df["count"] == 1).mean()
coverage_100 = freq_df["count"].head(100).sum() / freq_df["count"].sum()

cum_share = freq_df["count"].cumsum() / freq_df["count"].sum()
n_for_half = int((cum_share < 0.5).sum()) + 1

print(f"Словарь: {len(freq_df)} слов, гапаксов {hapax_share:.1%}")
print(f"Топ-100 покрывают {coverage_100:.1%} токенов; половину текста дают {n_for_half} слов")
freq_df.head(15)
`,
      },
      {
        id: "t2",
        title: "Проверка закона Ципфа",
        setup: BASE + FREQ_DF,
        text: R`
Таблица \`freq_df\` (word, count, rank) уже построена; \`rank\` — номер строки в отсортированном списке.

1. Добавьте столбец \`rf\` = rank × count и посмотрите на него для рангов 1–20 и 50–100: постоянно ли произведение?
2. Найдите наклон прямой в логарифмических осях: \`slope_all\` — \`np.polyfit(np.log10(rank), np.log10(count), 1)[0]\` по **всем** словам; \`slope_top\` — то же только для слов с частотой **≥ 2**.
3. Постройте график частоты от ранга в логарифмических осях (\`plt.loglog\` или \`set_xscale("log")\` и \`set_yscale("log")\`) и добавьте на него прямую регрессии для \`slope_top\`.
`,
        starter: R`import matplotlib.pyplot as plt

freq_df["rf"] = ...
print(freq_df.iloc[list(range(0, 20)) + list(range(49, 100)), :].to_string(max_rows=30))

slope_all, b_all = np.polyfit(..., ..., 1)
top = freq_df[freq_df["count"] >= 2]
slope_top, b_top = ...

print(f"Наклон по всем словам: {slope_all:.2f}, по словам с частотой ≥ 2: {slope_top:.2f}")

fig, ax = plt.subplots(figsize=(7, 5))
...
plt.show()
`,
        check: REF + R`
fd = var("freq_df", pd.DataFrame)
ok("rf" in fd.columns and (fd["rf"] == fd["rank"] * fd["count"]).all(), "Столбец rf = rank × count")
cnt = np.array(sorted(_freq.values(), reverse=True), dtype=float)
rk = np.arange(1, len(cnt) + 1)
sa = np.polyfit(np.log10(rk), np.log10(cnt), 1)[0]
m = cnt >= 2
st = np.polyfit(np.log10(rk[m]), np.log10(cnt[m]), 1)[0]
ok(abs(float(var("slope_all")) - sa) < 0.01, "slope_all — наклон по всем словам в log-log осях")
ok(abs(float(var("slope_top")) - st) < 0.01, "slope_top — наклон только по словам с частотой ≥ 2")
ok(var("slope_top") < var("slope_all") < 0, "Без гапаксов наклон круче (ближе к −1)")
ok(len(figs) >= 1, "Построен график")
if figs:
    ax0 = figs[-1].axes[0]
    ok(ax0.get_xscale() == "log" and ax0.get_yscale() == "log", "Обе оси графика логарифмические")
    ok(len(ax0.get_lines()) + len(ax0.collections) >= 2, "На графике есть точки и прямая регрессии")
`,
        hint: R`\`np.polyfit(np.log10(freq_df["rank"]), np.log10(freq_df["count"]), 1)\` возвращает \`[наклон, сдвиг]\`. Прямая: \`ax.loglog(top["rank"], 10 ** (b_top + slope_top * np.log10(top["rank"])))\`.`,
        solution: R`import matplotlib.pyplot as plt

freq_df["rf"] = freq_df["rank"] * freq_df["count"]
print(freq_df.iloc[list(range(0, 20)) + list(range(49, 100)), :].to_string(max_rows=30))

slope_all, b_all = np.polyfit(np.log10(freq_df["rank"]), np.log10(freq_df["count"]), 1)
top = freq_df[freq_df["count"] >= 2]
slope_top, b_top = np.polyfit(np.log10(top["rank"]), np.log10(top["count"]), 1)

print(f"Наклон по всем словам: {slope_all:.2f}, по словам с частотой ≥ 2: {slope_top:.2f}")

fig, ax = plt.subplots(figsize=(7, 5))
ax.loglog(freq_df["rank"], freq_df["count"], ".", alpha=0.6, label="слова корпуса")
ax.loglog(top["rank"], 10 ** (b_top + slope_top * np.log10(top["rank"])), "r-", label=f"регрессия, наклон {slope_top:.2f}")
ax.set_xlabel("ранг")
ax.set_ylabel("частота")
ax.set_title("Закон Ципфа для узбекского корпуса")
ax.legend()
plt.show()
`,
      },
      {
        id: "t3",
        title: "Частотность по категориям",
        setup: BASE,
        text: R`
Используйте метаданные (\`category\`), чтобы сравнить лексику рубрик.

1. \`tok_df\` — длинная таблица со столбцами \`category\`, \`file\`, \`word\`: одна строка — один токен **без стоп-слов** (метод \`explode\`).
2. \`cat_counts\` — матрица «слово × категория» с частотами: \`pd.crosstab(tok_df["word"], tok_df["category"])\`.
3. \`spread\` — Series: в скольких категориях встречается каждое слово.
4. \`universal\` — отсортированный список слов, которые встречаются **не меньше чем в 4** категориях. Это общая новостная лексика, а не тематическая.
`,
        starter: R`tok_df = df[["category", "file", "tokens"]].explode("tokens").rename(columns={"tokens": "word"})
tok_df = ...          # убрать стоп-слова (и пустые значения)

cat_counts = ...
spread = ...
universal = ...

print(cat_counts.shape)
print(universal)
cat_counts.loc[["talabalar", "yangi", "katta"]]
`,
        check: REF + R`
rows = [(c, f, w) for c, f, toks in zip(_meta["category"], _meta["file"], _toks) for w in toks if w not in _sw]
td = var("tok_df", pd.DataFrame)
ok({"category", "file", "word"} <= set(td.columns), "В tok_df есть столбцы category, file, word")
if {"category", "file", "word"} <= set(td.columns):
    ok(len(td) == len(rows) and Counter(zip(td["category"], td["file"], td["word"])) == Counter(rows), "tok_df — по строке на каждый токен без стоп-слов")
ref = pd.crosstab(pd.Series([r[2] for r in rows], name="word"), pd.Series([r[0] for r in rows], name="category"))
cc = var("cat_counts", pd.DataFrame)
ok(cc.shape == ref.shape and set(cc.index) == set(ref.index) and set(cc.columns) == set(ref.columns), f"cat_counts — матрица {ref.shape[0]} слов × {ref.shape[1]} категорий")
if cc.shape == ref.shape and set(cc.index) == set(ref.index) and set(cc.columns) == set(ref.columns):
    ok((cc.loc[ref.index, ref.columns].values == ref.values).all(), "Значения cat_counts — частоты слова в категории")
sp = (ref > 0).sum(axis=1)
s = var("spread", pd.Series)
ok(len(s) == len(sp) and all(int(s[w]) == int(sp[w]) for w in sp.index), "spread — число категорий, в которых встречается слово")
ok(list(var("universal")) == sorted(sp[sp >= 4].index), "universal — слова, встречающиеся в 4 и более категориях")
`,
        hint: R`Фильтр: \`tok_df[~tok_df["word"].isin(STOPWORDS) & tok_df["word"].notna()]\`. Число категорий: \`(cat_counts > 0).sum(axis=1)\`. Список: \`sorted(spread[spread >= 4].index)\`.`,
        solution: R`tok_df = df[["category", "file", "tokens"]].explode("tokens").rename(columns={"tokens": "word"})
tok_df = tok_df[tok_df["word"].notna() & ~tok_df["word"].isin(STOPWORDS)]

cat_counts = pd.crosstab(tok_df["word"], tok_df["category"])
spread = (cat_counts > 0).sum(axis=1)
universal = sorted(spread[spread >= 4].index)

print(cat_counts.shape)
print(universal)
cat_counts.loc[["talabalar", "yangi", "katta"]]
`,
      },
      {
        id: "t4",
        title: "Ключевые слова категорий: TF-IDF",
        setup: BASE + R`
STOP_LIST = sorted(w for w in STOPWORDS if "-" not in w)   # без слов с дефисом (ham-da)
`,
        text: R`
Найдите ключевые слова каждой рубрики методом TF-IDF.

1. \`cat_docs\` — Series: индекс — категория, значение — **все тексты категории**, нормализованные (\`normalize\`), в нижнем регистре и склеенные через пробел. Получится 12 «документов».
2. \`TfidfVectorizer(stop_words=STOP_LIST)\` с остальными параметрами по умолчанию: обучите на \`cat_docs\` и постройте DataFrame \`tfidf\` (строки — категории в порядке \`cat_docs.index\`, столбцы — слова, \`get_feature_names_out()\`).
3. \`keywords\` — словарь \`{категория: список 5 слов с наибольшим TF-IDF}\`.
`,
        starter: R`from sklearn.feature_extraction.text import TfidfVectorizer

cat_docs = df.groupby("category")["text"].apply(lambda texts: ...)

vec = ...
X = ...
tfidf = pd.DataFrame(X.toarray(), index=cat_docs.index, columns=...)

keywords = {cat: ... for cat in tfidf.index}

for cat, words in keywords.items():
    print(f"{cat:12} {', '.join(words)}")
`,
        check: REF + R`
from sklearn.feature_extraction.text import TfidfVectorizer
cd = {}
for c, t in zip(_meta["category"], _texts):
    cd.setdefault(c, []).append(_norm(t).lower())
cats = sorted(cd)
docs = [" ".join(cd[c]) for c in cats]
sl = sorted(w for w in _sw if "-" not in w)
v = TfidfVectorizer(stop_words=sl)
X = v.fit_transform(docs).toarray()
ref = pd.DataFrame(X, index=cats, columns=v.get_feature_names_out())
cdoc = var("cat_docs", pd.Series)
ok(sorted(map(str, cdoc.index)) == cats and all(" ".join(cdoc[c].split()) == " ".join(" ".join(cd[c]).split()) for c in cats), "cat_docs — нормализованные тексты категорий, склеенные через пробел")
tf = var("tfidf", pd.DataFrame)
ok(tf.shape == ref.shape and set(tf.columns) == set(ref.columns), f"tfidf — матрица {ref.shape[0]} категорий × {ref.shape[1]} слов")
if tf.shape == ref.shape and set(tf.columns) == set(ref.columns) and set(map(str, tf.index)) == set(cats):
    ok(np.allclose(tf.loc[cats, ref.columns].values, ref.values, atol=1e-6), "Значения tfidf совпадают с TfidfVectorizer(stop_words=STOP_LIST)")
kw = var("keywords", dict)
good = set(kw) == set(cats)
for c in cats:
    if c in kw:
        words = list(kw[c])
        thr = ref.loc[c].nlargest(5).iloc[-1]
        good = good and len(words) == 5 and len(set(words)) == 5 and all(w in ref.columns and ref.loc[c, w] >= thr - 1e-9 for w in words)
ok(good, "keywords — для каждой категории 5 слов с наибольшим TF-IDF")
`,
        hint: R`Склейка: \`lambda texts: " ".join(normalize(t).lower() for t in texts)\`. Обучение: \`X = vec.fit_transform(cat_docs)\`; слова: \`vec.get_feature_names_out()\`. Топ-5: \`tfidf.loc[cat].nlargest(5).index.tolist()\`.`,
        solution: R`from sklearn.feature_extraction.text import TfidfVectorizer

cat_docs = df.groupby("category")["text"].apply(lambda texts: " ".join(normalize(t).lower() for t in texts))

vec = TfidfVectorizer(stop_words=STOP_LIST)
X = vec.fit_transform(cat_docs)
tfidf = pd.DataFrame(X.toarray(), index=cat_docs.index, columns=vec.get_feature_names_out())

keywords = {cat: tfidf.loc[cat].nlargest(5).index.tolist() for cat in tfidf.index}

for cat, words in keywords.items():
    print(f"{cat:12} {', '.join(words)}")
`,
      },
      {
        id: "t5",
        title: "Коллокации: PMI биграмм",
        setup: BASE + R`
def split_sentences(text):
    return [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]

sent_tokens = [tokenize(s) for text in df["text"] for s in split_sentences(text)]
freq = Counter(t for toks in df["tokens"] for t in toks)
N = sum(freq.values())
`,
        text: R`
В \`sent_tokens\` — списки токенов каждого предложения корпуса, в \`freq\` — частоты слов, \`N\` — число токенов.

1. \`bigram_freq\` — \`Counter\` биграмм **внутри предложений**.
2. Для биграмм с частотой **≥ 2**, в которых **нет стоп-слов**, посчитайте
   \`PMI = log2( c(x, y) · N / (c(x) · c(y)) )\`, где \`c(x)\`, \`c(y)\` — частоты слов из \`freq\`.
3. \`pmi_df\` — DataFrame со столбцами \`w1\`, \`w2\`, \`count\`, \`pmi\`, отсортированный по \`pmi\` по убыванию.
4. Сравните: какие пары в начале списка по PMI и какие — по частоте?
`,
        starter: R`bigram_freq = Counter()
for toks in sent_tokens:
    ...

rows = []
for (w1, w2), c in bigram_freq.items():
    if ...:
        pmi = ...
        rows.append({"w1": w1, "w2": w2, "count": c, "pmi": pmi})

pmi_df = ...

print("По частоте:", pmi_df.sort_values("count", ascending=False).head(5)[["w1", "w2", "count"]].values.tolist())
pmi_df.head(15)
`,
        check: REF + R`
bf = Counter()
for t in _texts:
    for s in re.split(r"(?<=[.!?])\s+|\n+", t):
        tk = _tok(s)
        bf.update(zip(tk, tk[1:]))
gb = var("bigram_freq")
ok(dict(gb) == dict(bf), "bigram_freq — частоты биграмм внутри предложений")
N = len(_all)
ref = {(a, b): np.log2(c * N / (_freq[a] * _freq[b])) for (a, b), c in bf.items() if c >= 2 and a not in _sw and b not in _sw}
pd_ = var("pmi_df", pd.DataFrame)
ok({"w1", "w2", "count", "pmi"} <= set(pd_.columns), "В pmi_df есть столбцы w1, w2, count, pmi")
if {"w1", "w2", "count", "pmi"} <= set(pd_.columns):
    pairs = list(zip(pd_["w1"], pd_["w2"]))
    ok(set(pairs) == set(ref) and len(pairs) == len(ref), f"pmi_df — {len(ref)} биграмм с частотой ≥ 2 без стоп-слов")
    ok(all(bf.get(p, -1) == c for p, c in zip(pairs, pd_["count"])), "count — частота биграммы")
    ok(all(p in ref and abs(v - ref[p]) < 1e-6 for p, v in zip(pairs, pd_["pmi"])), "pmi = log2(c(x,y)·N / (c(x)·c(y)))")
    ok(list(pd_["pmi"]) == sorted(pd_["pmi"], reverse=True), "pmi_df отсортирован по pmi по убыванию")
`,
        hint: R`Биграммы предложения: \`bigram_freq.update(zip(toks, toks[1:]))\`. Условие: \`c >= 2 and w1 not in STOPWORDS and w2 not in STOPWORDS\`. PMI: \`np.log2(c * N / (freq[w1] * freq[w2]))\`. Сортировка: \`pd.DataFrame(rows).sort_values("pmi", ascending=False)\`.`,
        solution: R`bigram_freq = Counter()
for toks in sent_tokens:
    bigram_freq.update(zip(toks, toks[1:]))

rows = []
for (w1, w2), c in bigram_freq.items():
    if c >= 2 and w1 not in STOPWORDS and w2 not in STOPWORDS:
        pmi = np.log2(c * N / (freq[w1] * freq[w2]))
        rows.append({"w1": w1, "w2": w2, "count": c, "pmi": pmi})

pmi_df = pd.DataFrame(rows).sort_values("pmi", ascending=False).reset_index(drop=True)

print("По частоте:", pmi_df.sort_values("count", ascending=False).head(5)[["w1", "w2", "count"]].values.tolist())
pmi_df.head(15)
`,
      },
      {
        id: "t6",
        title: "Частоты суффиксов агглютинативной морфологии",
        setup: BASE + CONTENT + R`
SUFFIXES = ["lar", "ning", "ni", "ga", "da", "dan", "dagi", "lik", "chi", "moqda", "gan", "di", "ish", "si"]
`,
        text: R`
В \`content_tokens\` — токены корпуса без стоп-слов, в \`SUFFIXES\` — список суффиксов.

1. \`suffix_freq\` — Series (индекс — суффикс): сколько токенов (с повторами) **оканчивается** на этот суффикс так, что перед ним остаётся **не меньше 3 символов** (\`t.endswith(suf) and len(t) - len(suf) >= 3\`). Одно слово может засчитываться нескольким суффиксам. Отсортируйте по убыванию.
2. \`plural_share\` — доля токенов, в которых показатель множественного числа «lar» стоит **не в начале** слова: \`t.find("lar", 3) != -1\` (учитываются и *talabalar*, и *talabalarning*).
3. \`top_case\` — самый частый падежный суффикс из \`["ning", "ni", "ga", "da", "dan"]\` (строка).
4. Постройте столбчатую диаграмму \`suffix_freq\`.
`,
        starter: R`import matplotlib.pyplot as plt

suffix_freq = pd.Series({suf: ... for suf in SUFFIXES})
suffix_freq = ...

plural_share = ...
top_case = ...

...
print(f"Множественное число (-lar): {plural_share:.1%} токенов; самый частый падеж: -{top_case}")
suffix_freq
`,
        check: REF + R`
SUF = ["lar", "ning", "ni", "ga", "da", "dan", "dagi", "lik", "chi", "moqda", "gan", "di", "ish", "si"]
ref = {s: sum(1 for t in _content if t.endswith(s) and len(t) - len(s) >= 3) for s in SUF}
sf = var("suffix_freq", pd.Series)
ok(set(sf.index) == set(SUF), "Индекс suffix_freq — все суффиксы из SUFFIXES")
ok(all(int(sf.get(s, -1)) == v for s, v in ref.items()), "Значения — число токенов, оканчивающихся на суффикс (основа ≥ 3 символов)")
ok(list(sf.values) == sorted(sf.values, reverse=True), "suffix_freq отсортирован по убыванию")
ps = sum(1 for t in _content if t.find("lar", 3) != -1) / len(_content)
ok(abs(var("plural_share") - ps) < 1e-3, "plural_share — доля токенов с -lar не в начале слова")
cases = ["ning", "ni", "ga", "da", "dan"]
ok(var("top_case") == max(cases, key=lambda s: ref[s]), "top_case — самый частый падежный суффикс")
ok(len(figs) >= 1, "Построена диаграмма")
`,
        hint: R`Счёт: \`sum(1 for t in content_tokens if t.endswith(suf) and len(t) - len(suf) >= 3)\`. Сортировка: \`.sort_values(ascending=False)\`. Падеж: \`suffix_freq[["ning", "ni", "ga", "da", "dan"]].idxmax()\`.`,
        solution: R`import matplotlib.pyplot as plt

suffix_freq = pd.Series({suf: sum(1 for t in content_tokens if t.endswith(suf) and len(t) - len(suf) >= 3)
                         for suf in SUFFIXES})
suffix_freq = suffix_freq.sort_values(ascending=False)

plural_share = sum(1 for t in content_tokens if t.find("lar", 3) != -1) / len(content_tokens)
top_case = suffix_freq[["ning", "ni", "ga", "da", "dan"]].idxmax()

ax = suffix_freq.plot(kind="bar", figsize=(8, 4), color="#4c78a8", title="Частоты суффиксов в корпусе")
ax.set_ylabel("токенов")
plt.tight_layout()
plt.show()
print(f"Множественное число (-lar): {plural_share:.1%} токенов; самый частый падеж: -{top_case}")
suffix_freq
`,
      },
      {
        id: "t7",
        title: "Самые частые корни после стемминга",
        setup: BASE + CONTENT + R`
SUFFIXES = ["lar", "ning", "ni", "ga", "da", "dan", "dagi", "lik", "chi", "si",
            "imiz", "ingiz", "moqda", "gan", "di", "adi", "ish", "ib"]

def stem(word):
    """Стеммер из П12: отрезает самый длинный суффикс, пока основа ≥ 3 символов."""
    changed = True
    while changed:
        changed = False
        for suf in sorted(SUFFIXES, key=len, reverse=True):
            if word.endswith(suf) and len(word) - len(suf) >= 3:
                word, changed = word[:-len(suf)], True
                break
    return word
`,
        text: R`
Функция \`stem(word)\` (стеммер из П12) и \`content_tokens\` уже готовы.

1. \`stem_freq\` — \`Counter\` основ всех \`content_tokens\`.
2. \`top_stems\` — 10 самых частых основ (\`most_common(10)\`).
3. \`forms\` — словарь \`{основа: отсортированный список разных словоформ корпуса с этой основой}\` для каждой основы из \`top_stems\`.
4. \`stripped_share\` — доля токенов, у которых стеммер что-то отрезал (\`stem(t) != t\`): насколько «суффиксален» текст.
5. Сравните \`top_stems\` с 10 самыми частыми **словоформами**: какие темы корпуса стали заметнее?
`,
        starter: R`stem_freq = ...
top_stems = ...
forms = {}
for s, c in top_stems:
    forms[s] = ...

stripped_share = ...

print("Словоформы:", Counter(content_tokens).most_common(10))
print("Основы:    ", top_stems)
for s, f in forms.items():
    print(f"{s:12} {f}")
print(f"Стеммер изменил {stripped_share:.1%} токенов")
`,
        check: REF + R`
SUF = ["lar", "ning", "ni", "ga", "da", "dan", "dagi", "lik", "chi", "si", "imiz", "ingiz", "moqda", "gan", "di", "adi", "ish", "ib"]
def _stem(w):
    changed = True
    while changed:
        changed = False
        for s in sorted(SUF, key=len, reverse=True):
            if w.endswith(s) and len(w) - len(s) >= 3:
                w, changed = w[:-len(s)], True
                break
    return w
sf = Counter(_stem(t) for t in _content)
ok(dict(var("stem_freq")) == dict(sf), "stem_freq — частоты основ всех content_tokens")
ts = var("top_stems")
ok(len(ts) == 10 and [c for _, c in ts] == [c for _, c in sf.most_common(10)] and all(sf[s] == c for s, c in ts), "top_stems — 10 самых частых основ с частотами")
fm = var("forms", dict)
types = set(_content)
ok(set(fm) == {s for s, _ in ts} and all(list(fm[s]) == sorted(w for w in types if _stem(w) == s) for s in fm), "forms — все словоформы корпуса для каждой основы из top_stems")
ok(abs(var("stripped_share") - sum(1 for t in _content if _stem(t) != t) / len(_content)) < 1e-3, "stripped_share — доля токенов, изменённых стеммером")
`,
        hint: R`\`Counter(stem(t) for t in content_tokens)\`. Формы: \`sorted({w for w in content_tokens if stem(w) == s})\`. Доля: \`sum(stem(t) != t for t in content_tokens) / len(content_tokens)\`.`,
        solution: R`stem_freq = Counter(stem(t) for t in content_tokens)
top_stems = stem_freq.most_common(10)
forms = {}
for s, c in top_stems:
    forms[s] = sorted({w for w in content_tokens if stem(w) == s})

stripped_share = sum(stem(t) != t for t in content_tokens) / len(content_tokens)

print("Словоформы:", Counter(content_tokens).most_common(10))
print("Основы:    ", top_stems)
for s, f in forms.items():
    print(f"{s:12} {f}")
print(f"Стеммер изменил {stripped_share:.1%} токенов")
`,
      },
    ],
    quiz: [
      { q: "Что утверждает закон Ципфа?", options: ["Все слова встречаются одинаково часто", "Частота слова примерно обратно пропорциональна его рангу", "Длина слова пропорциональна частоте", "Словарь растёт линейно с объёмом корпуса"], answer: 1, explain: "f(r) ≈ C / r: второе по частоте слово встречается примерно вдвое реже первого, третье — втрое и т. д." },
      { q: "Какой наклон прямой ожидается в осях log(ранг) — log(частота) для большого корпуса?", options: ["около +1", "около 0", "около −1", "около −10"], answer: 2, explain: "log f = log C − a·log r при a ≈ 1. В маленьком корпусе наклон положе из-за «хвоста» гапаксов." },
      { q: "Почему у редких пар слов PMI завышен?", options: ["Из-за логарифма по основанию 2", "Пара из двух редких слов, встретившаяся один раз, выглядит «неслучайной»: знаменатель c(x)·c(y) очень мал", "PMI не зависит от частоты", "Из-за стоп-слов"], answer: 1, explain: "Поэтому вводят порог частоты (c(x,y) ≥ 2 или больше) или используют t-score / log-likelihood." },
      { q: "Чем TF-IDF отличается от простой частоты при поиске ключевых слов?", options: ["Ничем", "Понижает вес слов, которые встречаются во многих документах (категориях)", "Учитывает только стоп-слова", "Считает только биграммы"], answer: 1, explain: "Множитель idf = ln((1 + n)/(1 + df)) + 1 мал для слов, встречающихся почти во всех документах (yangi, katta), и велик для тематических слов." },
      { q: "Что делает `pd.crosstab(tok_df[\"word\"], tok_df[\"category\"])`?", options: ["Удаляет дубликаты слов", "Строит таблицу частот: строки — слова, столбцы — категории", "Сортирует слова по алфавиту", "Считает TF-IDF"], answer: 1, explain: "crosstab считает, сколько раз встречается каждая пара значений двух столбцов — получается матрица «слово × категория»." },
      { q: "Почему частотный список основ (после стемминга) полезнее списка словоформ для узбекского языка?", options: ["Он короче", "Формы одного слова (yil, yilda, yildan, yilga) объединяются, и частота понятия не «размазывается» по десяткам форм", "Он не содержит стоп-слов", "Его быстрее сортировать"], answer: 1, explain: "В агглютинативном языке одно понятие представлено многими формами; после стемминга их частоты складываются и тема становится заметнее." },
    ],
    realEnv: R`
## Частотный анализ больших узбекских корпусов

В Jupyter (Anaconda) или Colab код работает без изменений. Для больших данных:

- **Частоты по потоку.** Для корпуса в десятки гигабайт используйте \`Counter.update\` при построчном чтении или Spark: \`spark.read.text(...)\` → \`split\` → \`explode\` → \`groupBy("word").count()\`.
- **Коллокации в NLTK** (без загрузки корпусов):

\`\`\`python
from nltk.collocations import BigramCollocationFinder, BigramAssocMeasures
finder = BigramCollocationFinder.from_documents(sent_tokens)   # учитывает границы предложений
finder.apply_freq_filter(3)
finder.apply_word_filter(lambda w: w in STOPWORDS)
finder.nbest(BigramAssocMeasures.pmi, 20)
finder.nbest(BigramAssocMeasures.likelihood_ratio, 20)
\`\`\`

- **TF-IDF на кластере:** \`pyspark.ml.feature.HashingTF\` + \`IDF\` — работает с миллионами документов без построения словаря в памяти.
- **Закон Ципфа на реальных данных.** Возьмите дамп узбекской Википедии или узбекскую часть веб-корпусов (OSCAR, CC-100, Leipzig Corpora Collection): на миллионах токенов наклон приближается к −1, а доля гапаксов в словаре остаётся высокой из-за агглютинации.
- **Морфология.** Для узбекского существуют морфологические анализаторы и лемматизаторы (ищите на PyPI и GitHub по запросам *Uzbek morphological analyzer*, *Uzbek stemmer*), а трибанк узбекского языка в **Universal Dependencies** содержит разметку лемм — с ним можно сравнить качество простого стеммера.
- **Готовые модели.** Субсловные токенизаторы (BPE, SentencePiece) многоязычных моделей на HuggingFace сами выделяют частые «куски» слов — часто они совпадают с суффиксами *-lar*, *-ning*, *-dagi*.

> [!TIP] Визуализация
> Облако слов для категории: \`from wordcloud import WordCloud; WordCloud().generate_from_frequencies(dict(freq_a))\` — наглядно, но для выводов используйте таблицы и меры (TF-IDF, PMI).
`,
    homework: R`
**Тема для самостоятельной работы: «Перспективы применения технологий Big Data в компьютерной лингвистике».**

1. Соберите узбекский корпус объёмом не менее 1 млн токенов (Википедия, новости) и повторите анализ: закон Ципфа, ключевые слова, коллокации. Как изменился наклон и доля гапаксов?
2. Сравните коллокации по PMI, t-score и log-likelihood (\`nltk.collocations\`). Какая мера даёт более осмысленные сочетания?
3. Подготовьте доклад: какие задачи узбекской компьютерной лингвистики (машинный перевод, поиск, распознавание речи) упираются в объём данных и как Big Data-технологии помогают их решать.
`,
  });
})();
