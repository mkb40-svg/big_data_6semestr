/* П13. Частотный анализ слов, биграммы и триграммы */
(function () {
  const BASE = R`import re
import pandas as pd
from collections import Counter

def normalize(text):
    """Все варианты апострофа -> канонические: oʻ/gʻ (U+02BB) и ʼ (U+02BC)."""
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

def tokenize(text):
    """Нормализация + нижний регистр + токены \w+."""
    return re.findall(r"\w+", normalize(text).lower())

df = pd.read_csv("data/corpus_uz/meta.csv")[["file", "category"]]
df["text"] = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in df["file"]]
with open("data/stopwords_uz.txt", encoding="utf-8") as _f:
    STOPWORDS = {w.strip() for w in _f if w.strip()}
`;
  const SENT = R`
def split_sentences(text):
    return [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
`;
  const REF = R`
import re
import pandas as pd
from collections import Counter

def _norm(text):
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

def _tok(text):
    return re.findall(r"\w+", _norm(text).lower())

_meta = pd.read_csv("data/corpus_uz/meta.csv")
_texts = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in _meta["file"]]
_sw = {w.strip() for w in open("data/stopwords_uz.txt", encoding="utf-8") if w.strip()}

def _sng(text, n):
    res = []
    for s in re.split(r"(?<=[.!?])\s+|\n+", text):
        t = _tok(s)
        res += list(zip(*[t[i:] for i in range(n)]))
    return res
`;

  BDT.register({
    id: "p13",
    kind: "practice",
    num: 13,
    title: "Проведение частотного анализа слов, а также анализа биграмм и триграмм",
    hours: 2,
    env: ["python"],
    goals: [
      "Строить частотные словари с помощью `collections.Counter` и частотные таблицы в pandas (абсолютная и относительная частота)",
      "Извлекать биграммы и триграммы (через `zip` и `nltk.util.ngrams`) без пересечения границ предложений",
      "Фильтровать n-граммы со стоп-словами и сравнивать частотные профили двух категорий текстов",
    ],
    theory: R`
## Частотный анализ

**Частотный анализ** — первый шаг исследования любого корпуса: какие слова встречаются чаще всего, какие — редко, чем отличаются тексты разных тем. На частотах построены ключевые слова, тематические модели, языковые модели и поисковые системы.

\`\`\`python
from collections import Counter
tokens = ["talabalar", "va", "oʻqituvchilar", "va", "talabalar"]
freq = Counter(tokens)
freq["talabalar"]          # 2
freq["kitob"]              # 0 — для отсутствующего слова не KeyError, а 0
freq.most_common(2)        # [('talabalar', 2), ('va', 2)]
freq.update(["kitob"])     # дописать новые токены
\`\`\`

> [!TIP] Нормализуйте и запрос
> Слова в частотном словаре записаны канонически (*oʻzbek*). Искать \`freq["o'zbek"]\` бесполезно — получите 0. Пропускайте запрос через ту же нормализацию: \`freq[normalize("o'zbek")]\`.

### Абсолютная и относительная частота

| Мера | Формула | Когда нужна |
|---|---|---|
| абсолютная частота | \`count\` | внутри одного корпуса |
| относительная частота | \`count / N\` | сравнение корпусов разного размера |
| на 1000 слов / **ipm** | \`count / N * 1000\` (или \`* 1 000 000\`) | удобные «человеческие» числа |

Сравнивать *абсолютные* частоты двух категорий некорректно: в большей категории все слова будут «чаще». Поэтому частоты нормируют на размер категории.

\`\`\`python
freq_df = pd.DataFrame(freq.most_common(), columns=["word", "count"])
freq_df["rel_freq"] = freq_df["count"] / freq_df["count"].sum()
freq_df.head(15).plot.barh(x="word", y="count")
\`\`\`

## N-граммы

**N-грамма** — последовательность из *n* соседних токенов: униграммы (1), **биграммы** (2), **триграммы** (3). Они показывают устойчивые сочетания: *sunʼiy intellekt*, *oʻzbek tili*, *katta maʼlumotlar*.

Из \`N\` токенов получается \`N − n + 1\` n-грамм. В Python их удобно строить функцией \`zip\` со сдвигом:

\`\`\`python
toks = ["oʻzbek", "tili", "uchun", "til", "modellari"]
bigrams  = list(zip(toks, toks[1:]))              # [('oʻzbek','tili'), ('tili','uchun'), ...]
trigrams = list(zip(toks, toks[1:], toks[2:]))

from nltk.util import ngrams                      # то же из библиотеки NLTK
list(ngrams(toks, 3))                             # без загрузки корпусов NLTK
\`\`\`

> [!WARNING] Границы предложений
> Если склеить все токены текста в один список, появятся ложные биграммы из конца одного предложения и начала следующего: *«... ochildi. Ochilish ...»* → \`('ochildi', 'ochilish')\`. Правильно — сначала делить текст на предложения и строить n-граммы **внутри** каждого.

\`\`\`python
def sentence_ngrams(text, n):
    result = []
    for sent in split_sentences(text):
        t = tokenize(sent)
        result += list(zip(*[t[i:] for i in range(n)]))   # общий вид для любого n
    return result
\`\`\`

Запись \`zip(*[t[i:] for i in range(n)])\` — то же, что \`zip(t, t[1:], ..., t[n-1:])\`.

## Стоп-слова в n-граммах

Самые частые биграммы почти всегда содержат служебные слова: *(tili, uchun)*, *(qilish, va)*. Для поиска терминов и устойчивых сочетаний отбрасывают биграммы, в которых **хотя бы одно** слово — стоп-слово. Для триграмм служебное слово в **середине** допустимо (*talabalar uchun yangi*), а по краям — нет.

\`\`\`python
content_bigrams = Counter({bg: c for bg, c in bigram_freq.items()
                           if bg[0] not in STOPWORDS and bg[1] not in STOPWORDS})
\`\`\`

## Сравнение категорий

Чтобы сравнить лексику двух групп текстов (например, рубрик *taʼlim* и *turizm*), постройте частоты на 1000 слов для каждой группы и сведите их в одну таблицу:

| слово | taʼlim | turizm |
|---|---|---|
| talabalar | 43.2 | 0.0 |
| sayyohlar | 0.0 | 17.0 |

Слова с высокими частотами в одной группе и нулевыми в другой — **маркеры темы**. Более строгие методы выделения ключевых слов (отношение частот, TF-IDF, PMI) разберём в Л6.

> [!NOTE] Сколько данных нужно
> На 16 коротких текстах большинство n-грамм встречается один раз — статистика «шумная». Устойчивые выводы о сочетаемости слов делают на корпусах в миллионы токенов: там частоты биграмм становятся надёжными.
`,
    tasks: [
      {
        id: "t1",
        title: "Counter и most_common",
        setup: BASE,
        text: R`
В подготовленном коде загружен корпус \`df\` и есть функция \`tokenize(text)\` (нормализация апострофов, нижний регистр, токены \`\w+\`).

1. \`all_tokens\` — все токены корпуса (документы по порядку).
2. \`freq\` — \`Counter\` по \`all_tokens\`.
3. \`top10\` — 10 самых частых слов (\`most_common\`).
4. \`n_va\` — частота союза «va»; \`n_ozbek\` — частота слова «oʻzbek». Чтобы не набирать знак ʻ вручную, ищите \`freq[normalize("o'zbek")]\`.
5. \`share_top10\` — какую долю всех токенов покрывают 10 самых частых слов.
`,
        starter: R`all_tokens = []
for text in df["text"]:
    ...

freq = ...
top10 = ...
n_va = ...
n_ozbek = ...
share_top10 = ...

print(top10)
print("va:", n_va, " oʻzbek:", n_ozbek, " o'zbek без нормализации:", freq["o'zbek"])
print(f"10 слов покрывают {share_top10:.1%} корпуса")
`,
        check: REF + R`
toks = [t for x in _texts for t in _tok(x)]
fr = Counter(toks)
ok(list(var("all_tokens")) == toks, "all_tokens — все токены корпуса по порядку")
f = var("freq")
ok(isinstance(f, Counter) and dict(f) == dict(fr), "freq — Counter частот всех токенов")
t10 = var("top10")
ok(len(t10) == 10 and [c for _, c in t10] == [c for _, c in fr.most_common(10)] and all(fr[w] == c for w, c in t10), "top10 — 10 самых частых слов с частотами")
ok(var("n_va") == fr["va"], "n_va — частота слова va")
ok(var("n_ozbek") == fr[_norm("o'zbek")] and fr[_norm("o'zbek")] > 0, "n_ozbek — частота слова oʻzbek (в канонической записи)")
ok(abs(var("share_top10") - sum(c for _, c in fr.most_common(10)) / len(toks)) < 1e-3, "share_top10 — доля токенов, покрытых 10 самыми частыми словами")
`,
        hint: R`\`all_tokens += tokenize(text)\`; \`freq.most_common(10)\` возвращает список пар (слово, частота); сумма частот топ-10: \`sum(c for w, c in top10)\`.`,
        solution: R`all_tokens = []
for text in df["text"]:
    all_tokens += tokenize(text)

freq = Counter(all_tokens)
top10 = freq.most_common(10)
n_va = freq["va"]
n_ozbek = freq[normalize("o'zbek")]
share_top10 = sum(c for w, c in top10) / len(all_tokens)

print(top10)
print("va:", n_va, " oʻzbek:", n_ozbek, " o'zbek без нормализации:", freq["o'zbek"])
print(f"10 слов покрывают {share_top10:.1%} корпуса")
`,
      },
      {
        id: "t2",
        title: "Частотная таблица в pandas",
        setup: BASE + R`
content_tokens = [t for text in df["text"] for t in tokenize(text) if t not in STOPWORDS]
`,
        text: R`
В \`content_tokens\` — токены корпуса **без стоп-слов**.

1. Постройте \`freq_df\` — DataFrame со столбцами \`word\`, \`count\`, отсортированный по \`count\` по убыванию (одна строка — одно слово).
2. Добавьте столбцы \`rel_freq\` = count / (сумма count) и \`per_1000\` = rel_freq × 1000.
3. Постройте горизонтальную столбчатую диаграмму 15 самых частых слов.
`,
        starter: R`import matplotlib.pyplot as plt

freq_df = pd.DataFrame(..., columns=["word", "count"])
freq_df["rel_freq"] = ...
freq_df["per_1000"] = ...

top15 = freq_df.head(15)
# горизонтальная диаграмма: самые частые слова сверху
...
freq_df.head(10)
`,
        check: REF + R`
cont = [t for x in _texts for t in _tok(x) if t not in _sw]
fr = Counter(cont)
fd = var("freq_df", pd.DataFrame)
ok({"word", "count", "rel_freq", "per_1000"} <= set(fd.columns), "В freq_df есть столбцы word, count, rel_freq, per_1000")
ok(len(fd) == len(fr) and fd["word"].is_unique, f"freq_df — по одной строке на каждое из {len(fr)} слов")
ok(all(fr.get(w, -1) == c for w, c in zip(fd["word"], fd["count"])), "count — частота слова без учёта стоп-слов")
ok(list(fd["count"]) == sorted(fd["count"], reverse=True), "Таблица отсортирована по count по убыванию")
ok("rel_freq" in fd.columns and abs(fd["rel_freq"].sum() - 1) < 1e-6 and ((fd["rel_freq"] - fd["count"] / len(cont)).abs() < 1e-9).all(), "rel_freq = count / сумма count (в сумме 1)")
ok("per_1000" in fd.columns and ((fd["per_1000"] - fd["rel_freq"] * 1000).abs() < 1e-6).all(), "per_1000 = rel_freq × 1000")
ok(len(figs) >= 1, "Построена диаграмма")
`,
        hint: R`\`pd.DataFrame(Counter(content_tokens).most_common(), columns=["word", "count"])\` — сразу отсортировано. Диаграмма: \`top15.plot.barh(x="word", y="count")\`, затем \`plt.gca().invert_yaxis()\` и \`plt.show()\`.`,
        solution: R`import matplotlib.pyplot as plt

freq_df = pd.DataFrame(Counter(content_tokens).most_common(), columns=["word", "count"])
freq_df["rel_freq"] = freq_df["count"] / freq_df["count"].sum()
freq_df["per_1000"] = freq_df["rel_freq"] * 1000

top15 = freq_df.head(15)
ax = top15.plot.barh(x="word", y="count", legend=False, figsize=(7, 5), color="#4c78a8")
ax.invert_yaxis()
ax.set_title("15 самых частых слов (без стоп-слов)")
ax.set_xlabel("частота")
plt.tight_layout()
plt.show()
freq_df.head(10)
`,
      },
      {
        id: "t3",
        title: "Биграммы и триграммы через zip и NLTK",
        setup: BASE + R`
text = open("data/corpus_uz/uz_14.txt", encoding="utf-8").read()
`,
        text: R`
В \`text\` — новость \`uz_14.txt\` о компьютерной лингвистике.

1. \`toks\` — токены текста (\`tokenize\`).
2. \`bigrams\` и \`trigrams\` — списки кортежей, построенные через \`zip\` со сдвигом.
3. \`bigrams_nltk\` — биграммы, полученные функцией \`ngrams\` из \`nltk.util\` (списком). Совпадают ли они с вашими?
4. \`top_bigrams\` — 5 самых частых биграмм текста (\`Counter(...).most_common(5)\`).

Первый импорт \`nltk\` в браузере занимает несколько секунд.
`,
        starter: R`from nltk.util import ngrams

toks = ...
bigrams = ...
trigrams = ...
bigrams_nltk = ...
top_bigrams = ...

print(len(toks), "токенов,", len(bigrams), "биграмм,", len(trigrams), "триграмм")
print("zip == nltk:", bigrams == bigrams_nltk)
print(top_bigrams)
`,
        check: REF + R`
text = open("data/corpus_uz/uz_14.txt", encoding="utf-8").read()
t = _tok(text)
ok(list(var("toks")) == t, "toks — токены текста uz_14")
bg = list(zip(t, t[1:]))
tg = list(zip(t, t[1:], t[2:]))
ok([tuple(x) for x in var("bigrams")] == bg, f"bigrams — {len(bg)} биграмм (N − 1)")
ok([tuple(x) for x in var("trigrams")] == tg, f"trigrams — {len(tg)} триграмм (N − 2)")
bn = var("bigrams_nltk")
ok(isinstance(bn, list) and [tuple(x) for x in bn] == bg, "bigrams_nltk — список биграмм из nltk.util.ngrams")
ok(uses("ngrams("), "Использована функция ngrams из NLTK")
tb = var("top_bigrams")
cb = Counter(bg)
ok(len(tb) == 5 and [c for _, c in tb] == [c for _, c in cb.most_common(5)] and all(cb[tuple(b)] == c for b, c in tb), "top_bigrams — 5 самых частых биграмм с частотами")
`,
        hint: R`\`list(zip(toks, toks[1:]))\` — биграммы, \`list(zip(toks, toks[1:], toks[2:]))\` — триграммы. В NLTK: \`list(ngrams(toks, 2))\` — без \`list\` получится генератор.`,
        solution: R`from nltk.util import ngrams

toks = tokenize(text)
bigrams = list(zip(toks, toks[1:]))
trigrams = list(zip(toks, toks[1:], toks[2:]))
bigrams_nltk = list(ngrams(toks, 2))
top_bigrams = Counter(bigrams).most_common(5)

print(len(toks), "токенов,", len(bigrams), "биграмм,", len(trigrams), "триграмм")
print("zip == nltk:", bigrams == bigrams_nltk)
print(top_bigrams)
`,
      },
      {
        id: "t4",
        title: "N-граммы внутри предложений",
        setup: BASE + SENT,
        text: R`
Функция \`split_sentences(text)\` уже определена (деление по \`. ! ?\` и переводам строк).

1. Напишите \`sentence_ngrams(text, n)\` — список n-грамм (кортежей), построенных **отдельно в каждом предложении**: для каждого предложения возьмите \`tokenize(sent)\` и постройте n-граммы через \`zip\`.
2. \`bigram_freq\`, \`trigram_freq\` — \`Counter\` биграмм и триграмм по всем документам корпуса.
3. \`n_cross\` — сколько «ложных» биграмм появилось бы, если строить биграммы по всему тексту документа без деления на предложения (сумма по корпусу).
`,
        starter: R`def sentence_ngrams(text, n):
    result = []
    for sent in split_sentences(text):
        t = tokenize(sent)
        result += ...
    return result

print(sentence_ngrams("Bugun havo issiq. Ertaga yomg'ir yog'adi!", 2))

bigram_freq = Counter()
trigram_freq = Counter()
for text in df["text"]:
    ...

naive_total = ...       # биграммы по всему документу без деления на предложения
n_cross = ...

print("Биграмм внутри предложений:", sum(bigram_freq.values()))
print("Ложных биграмм на стыках:", n_cross)
print(bigram_freq.most_common(10))
`,
        check: REF + R`
f = var("sentence_ngrams")
O = "\u02bb"
ok([tuple(x) for x in f("Bugun havo issiq. Ertaga yomg'ir yog'adi!", 2)] == [("bugun", "havo"), ("havo", "issiq"), ("ertaga", "yomg" + O + "ir"), ("yomg" + O + "ir", "yog" + O + "adi")], "sentence_ngrams не создаёт биграмм на стыке предложений")
ok([tuple(x) for x in f("Bir ikki uch tort.", 3)] == [("bir", "ikki", "uch"), ("ikki", "uch", "tort")], "sentence_ngrams работает для n = 3")
bf, tf = Counter(), Counter()
for x in _texts:
    bf.update(_sng(x, 2))
    tf.update(_sng(x, 3))
gb, gt = var("bigram_freq"), var("trigram_freq")
ok(dict(gb) == dict(bf), "bigram_freq — частоты биграмм внутри предложений по всему корпусу")
ok(dict(gt) == dict(tf), "trigram_freq — частоты триграмм внутри предложений по всему корпусу")
naive = sum(max(len(_tok(x)) - 1, 0) for x in _texts)
ok(var("n_cross") == naive - sum(bf.values()), "n_cross — разница между «наивным» числом биграмм и числом биграмм внутри предложений")
`,
        hint: R`Внутри цикла: \`result += list(zip(*[t[i:] for i in range(n)]))\`. Для корпуса: \`bigram_freq.update(sentence_ngrams(text, 2))\`. Наивных биграмм в документе \`len(tokenize(text)) - 1\`.`,
        solution: R`def sentence_ngrams(text, n):
    result = []
    for sent in split_sentences(text):
        t = tokenize(sent)
        result += list(zip(*[t[i:] for i in range(n)]))
    return result

print(sentence_ngrams("Bugun havo issiq. Ertaga yomg'ir yog'adi!", 2))

bigram_freq = Counter()
trigram_freq = Counter()
for text in df["text"]:
    bigram_freq.update(sentence_ngrams(text, 2))
    trigram_freq.update(sentence_ngrams(text, 3))

naive_total = sum(len(tokenize(text)) - 1 for text in df["text"])
n_cross = naive_total - sum(bigram_freq.values())

print("Биграмм внутри предложений:", sum(bigram_freq.values()))
print("Ложных биграмм на стыках:", n_cross)
print(bigram_freq.most_common(10))
`,
      },
      {
        id: "t5",
        title: "Фильтрация n-грамм со стоп-словами",
        setup: BASE + SENT + R`
def sentence_ngrams(text, n):
    result = []
    for sent in split_sentences(text):
        t = tokenize(sent)
        result += list(zip(*[t[i:] for i in range(n)]))
    return result

bigram_freq, trigram_freq = Counter(), Counter()
for _t in df["text"]:
    bigram_freq.update(sentence_ngrams(_t, 2))
    trigram_freq.update(sentence_ngrams(_t, 3))
`,
        text: R`
\`bigram_freq\` и \`trigram_freq\` уже посчитаны (внутри предложений), \`STOPWORDS\` загружены. Посмотрите на \`bigram_freq.most_common(10)\` — сколько там служебных слов?

1. \`content_bigrams\` — \`Counter\` только тех биграмм, где **ни одно** слово не стоп-слово.
2. \`content_trigrams\` — \`Counter\` триграмм, у которых **первое и последнее** слова не стоп-слова (середина может быть любой).
3. \`collocations\` — список строк вида \`"sunʼiy intellekt"\` для биграмм из \`content_bigrams\` с частотой **не меньше 3**, по убыванию частоты.
`,
        starter: R`print(bigram_freq.most_common(10))

content_bigrams = Counter({bg: c for bg, c in bigram_freq.items() if ...})
content_trigrams = ...
collocations = ...

print(content_bigrams.most_common(10))
print(content_trigrams.most_common(5))
print(collocations)
`,
        check: REF + R`
bf, tf = Counter(), Counter()
for x in _texts:
    bf.update(_sng(x, 2))
    tf.update(_sng(x, 3))
cb = {k: v for k, v in bf.items() if k[0] not in _sw and k[1] not in _sw}
ct = {k: v for k, v in tf.items() if k[0] not in _sw and k[2] not in _sw}
gb = var("content_bigrams")
ok(dict(gb) == cb, "content_bigrams — биграммы без стоп-слов с исходными частотами")
ok(dict(var("content_trigrams")) == ct, "content_trigrams — триграммы, у которых крайние слова не стоп-слова")
col = list(var("collocations"))
exp = {" ".join(k) for k, v in cb.items() if v >= 3}
ok(set(col) == exp and len(col) == len(exp), f"collocations — {len(exp)} биграмм с частотой ≥ 3 в виде строк «слово1 слово2»")
ok([cb.get(tuple(s.split()), 0) for s in col] == sorted([cb.get(tuple(s.split()), 0) for s in col], reverse=True), "collocations отсортированы по убыванию частоты")
`,
        hint: R`Условие для биграммы: \`bg[0] not in STOPWORDS and bg[1] not in STOPWORDS\`; для триграммы проверяйте \`tg[0]\` и \`tg[2]\`. Строки: \`[" ".join(bg) for bg, c in content_bigrams.most_common() if c >= 3]\`.`,
        solution: R`print(bigram_freq.most_common(10))

content_bigrams = Counter({bg: c for bg, c in bigram_freq.items() if bg[0] not in STOPWORDS and bg[1] not in STOPWORDS})
content_trigrams = Counter({tg: c for tg, c in trigram_freq.items() if tg[0] not in STOPWORDS and tg[2] not in STOPWORDS})
collocations = [" ".join(bg) for bg, c in content_bigrams.most_common() if c >= 3]

print(content_bigrams.most_common(10))
print(content_trigrams.most_common(5))
print(collocations)
`,
      },
      {
        id: "t6",
        title: "Сравнение двух категорий",
        setup: BASE + R`
CAT_A = "ta\u02bclim"   # название категории из meta.csv (со знаком ʼ)
CAT_B = "turizm"
`,
        text: R`
Сравните лексику рубрик \`CAT_A\` («taʼlim», образование) и \`CAT_B\` («turizm»). Названия уже записаны в переменные — обратите внимание, что в \`meta.csv\` слово *taʼlim* записано с канонической ʼ.

1. \`freq_a\`, \`freq_b\` — \`Counter\` токенов **без стоп-слов** всех текстов каждой категории.
2. \`compare\` — DataFrame: индекс — слова, которые встречаются **не меньше 2 раз** хотя бы в одной из категорий; столбцы \`CAT_A\` и \`CAT_B\` — частота слова на 1000 токенов (без стоп-слов) этой категории; отсутствующие слова — 0.
3. \`common\` — отсортированный список слов, которые встречаются в **обеих** категориях.
4. Постройте горизонтальную диаграмму \`compare\` (две полосы для каждого слова).
`,
        starter: R`import matplotlib.pyplot as plt

def category_freq(cat):
    toks = []
    for text in df.loc[df["category"] == cat, "text"]:
        toks += ...
    return Counter(toks)

freq_a = category_freq(CAT_A)
freq_b = category_freq(CAT_B)

words = sorted({w for w, c in freq_a.items() if c >= 2} | ...)
total_a, total_b = sum(freq_a.values()), sum(freq_b.values())
compare = pd.DataFrame({
    CAT_A: [... for w in words],
    CAT_B: [... for w in words],
}, index=words)
common = ...

...
print(common)
compare.sort_values(CAT_A, ascending=False)
`,
        check: REF + R`
A, B = "ta\u02bclim", "turizm"
def cf(cat):
    return Counter(t for x, c in zip(_texts, _meta["category"]) if c == cat for t in _tok(x) if t not in _sw)
fa, fb = cf(A), cf(B)
ok(dict(var("freq_a")) == dict(fa), "freq_a — частоты слов категории taʼlim без стоп-слов")
ok(dict(var("freq_b")) == dict(fb), "freq_b — частоты слов категории turizm без стоп-слов")
cmp = var("compare", pd.DataFrame)
words = {w for w, c in fa.items() if c >= 2} | {w for w, c in fb.items() if c >= 2}
ok(set(cmp.index) == words, f"Индекс compare — {len(words)} слов с частотой ≥ 2 хотя бы в одной категории")
ok(A in cmp.columns and B in cmp.columns, "Столбцы compare называются как категории (CAT_A, CAT_B)")
if A in cmp.columns and B in cmp.columns and set(cmp.index) == words:
    na, nb = sum(fa.values()), sum(fb.values())
    ok(all(abs(cmp.loc[w, A] - fa[w] / na * 1000) < 1e-6 and abs(cmp.loc[w, B] - fb[w] / nb * 1000) < 1e-6 for w in words), "Значения — частоты на 1000 токенов категории, отсутствующие слова — 0")
ok(list(var("common")) == sorted(set(fa) & set(fb)), "common — отсортированный список слов, общих для двух категорий")
ok(len(figs) >= 1, "Построена диаграмма")
`,
        hint: R`Частота на 1000: \`freq_a[w] / total_a * 1000\` (для отсутствующего слова Counter вернёт 0). Общие слова: \`sorted(set(freq_a) & set(freq_b))\`. Диаграмма: \`compare.plot.barh(figsize=(7, 8))\`.`,
        solution: R`import matplotlib.pyplot as plt

def category_freq(cat):
    toks = []
    for text in df.loc[df["category"] == cat, "text"]:
        toks += [t for t in tokenize(text) if t not in STOPWORDS]
    return Counter(toks)

freq_a = category_freq(CAT_A)
freq_b = category_freq(CAT_B)

words = sorted({w for w, c in freq_a.items() if c >= 2} | {w for w, c in freq_b.items() if c >= 2})
total_a, total_b = sum(freq_a.values()), sum(freq_b.values())
compare = pd.DataFrame({
    CAT_A: [freq_a[w] / total_a * 1000 for w in words],
    CAT_B: [freq_b[w] / total_b * 1000 for w in words],
}, index=words)
common = sorted(set(freq_a) & set(freq_b))

compare.sort_values(CAT_A).plot.barh(figsize=(7, 8), title="Частота на 1000 слов")
plt.tight_layout()
plt.show()
print(common)
compare.sort_values(CAT_A, ascending=False)
`,
      },
    ],
    quiz: [
      { q: "Что вернёт `Counter(['a', 'b', 'a'])['c']`?", options: ["KeyError", "None", "0", "-1"], answer: 2, explain: "Counter возвращает 0 для отсутствующих ключей и не добавляет их в словарь." },
      { q: "Сколько биграмм получится из предложения в 8 токенов?", options: ["8", "7", "6", "16"], answer: 1, explain: "Число n-грамм равно N − n + 1 = 8 − 2 + 1 = 7." },
      { q: "Почему n-граммы строят внутри предложений?", options: ["Так быстрее", "Иначе появляются ложные сочетания из конца одного предложения и начала другого", "NLTK не умеет работать с текстами", "Чтобы удалить стоп-слова"], answer: 1, explain: "Последнее слово одного предложения и первое слово следующего не связаны синтаксически, такие пары искажают статистику сочетаемости." },
      { q: "Почему для сравнения двух категорий используют частоты на 1000 слов, а не абсолютные частоты?", options: ["Абсолютные частоты нельзя посчитать", "Категории разного размера: в большей все слова встречаются чаще", "Так требует pandas", "Чтобы убрать стоп-слова"], answer: 1, explain: "Относительная частота (на 1000 слов) делает числа сопоставимыми независимо от объёма категорий." },
      { q: "Какая триграмма останется после фильтра «первое и последнее слово — не стоп-слова»?", options: ["(va, talabalar, uchun)", "(talabalar, uchun, yangi)", "(bu, yangi, va)", "(uchun, va, bilan)"], answer: 1, explain: "Служебное слово uchun в середине допустимо, крайние talabalar и yangi — знаменательные слова." },
      { q: "Что делает `zip(t, t[1:], t[2:])`?", options: ["Сортирует токены", "Строит триграммы — тройки соседних токенов", "Удаляет дубликаты", "Склеивает токены в строку"], answer: 1, explain: "zip идёт параллельно по трём сдвинутым копиям списка и останавливается на самой короткой — получается N − 2 троек соседних токенов." },
    ],
    realEnv: R`
## Частотный анализ в Jupyter и на больших данных

В Anaconda/Colab установите NLTK (\`conda install nltk\` или \`pip install nltk\`). Для частот и n-грамм **не нужно** скачивать корпуса NLTK:

\`\`\`python
import nltk
from nltk.util import ngrams, everygrams
fd = nltk.FreqDist(tokens)            # частотный словарь с методами plot(), hapaxes()
fd.plot(20)
list(everygrams(tokens, 1, 3))        # все n-граммы длины 1..3
\`\`\`

**scikit-learn** строит матрицу «документ × n-грамма» одной строкой — это вход для классификаторов:

\`\`\`python
from sklearn.feature_extraction.text import CountVectorizer
cv = CountVectorizer(ngram_range=(1, 2), token_pattern=r"(?u)\b\w+\b")
X = cv.fit_transform(texts)           # разреженная матрица частот
\`\`\`

**Spark** считает n-граммы на кластере для корпусов в сотни гигабайт: \`pyspark.ml.feature.Tokenizer\` → \`NGram(n=2)\` → \`explode\` → \`groupBy().count()\` (подробнее — в лабораторных по Spark).

### Готовые частотные данные для узбекского

- **Leipzig Corpora Collection** публикует для узбекского языка частотные списки слов и данные о совместной встречаемости;
- по дампам узбекской **Википедии** и веб-корпусам (OSCAR, CC-100) можно построить собственные частотные словари;
- наборы на **HuggingFace** (фильтр по языку *uz*) удобно обрабатывать потоково: \`load_dataset(..., streaming=True)\` и \`Counter.update\` по мере чтения.

> [!TIP] Сохраняйте частоты
> Подсчёт частот по большому корпусу — дорогая операция. Сохраните результат (\`freq_df.to_csv("freq_uz.csv")\`) и переиспользуйте его в следующих задачах.
`,
  });
})();
