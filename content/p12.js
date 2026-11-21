/* П12. Предварительная обработка текстовых данных: токенизация, нормализация, стоп-слова */
(function () {
  const NORMALIZE = R`import re
import pandas as pd
from collections import Counter

def normalize(text):
    """Все варианты апострофа -> канонические: oʻ/gʻ (U+02BB) и ʼ (U+02BC)."""
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)
`;
  const LOAD_DF = R`
df = pd.read_csv("data/corpus_uz/meta.csv")[["file", "category"]]
df["text"] = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in df["file"]]
`;
  const LOAD_SW = R`
with open("data/stopwords_uz.txt", encoding="utf-8") as _f:
    STOPWORDS = {w.strip() for w in _f if w.strip()}
`;
  // Эталон для проверок
  const REF = R`
import re
import pandas as pd
from collections import Counter

def _norm(text):
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

_meta = pd.read_csv("data/corpus_uz/meta.csv")
_texts = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in _meta["file"]]
_sw = {w.strip() for w in open("data/stopwords_uz.txt", encoding="utf-8") if w.strip()}

def _prep(text):
    return [t for t in re.findall(r"\w+", _norm(text).lower()) if t not in _sw and len(t) >= 2 and not t.isdigit()]
`;
  const SUFFIXES = R`
SUFFIXES = ["lar", "ning", "ni", "ga", "da", "dan", "dagi", "lik", "chi", "si",
            "imiz", "ingiz", "moqda", "gan", "di", "adi", "ish", "ib"]
`;

  BDT.register({
    id: "p12",
    kind: "practice",
    num: 12,
    title: "Предварительная обработка текстовых данных: токенизация, нормализация и удаление стоп-слов",
    hours: 2,
    env: ["python"],
    goals: [
      "Освоить шаги предобработки текста: нормализация апострофов и регистра, удаление пунктуации, токенизация, деление на предложения",
      "Научиться удалять стоп-слова узбекского языка и оценивать, как предобработка меняет объём данных",
      "Собрать переиспользуемую функцию-конвейер `preprocess(text)` и простой стеммер для агглютинативной морфологии",
    ],
    theory: R`
## Зачем нужна предобработка

Компьютер видит текст как последовательность символов. Для него «Oʻzbekiston», «O'zbekiston» и «OʻZBEKISTON» — три разных строки, а «kitob.» и «kitob» — разные слова. **Предобработка** приводит текст к единому виду, чтобы подсчёты частот, поиск и машинное обучение работали с *языковыми* единицами, а не со случайностями набора.

Типичный конвейер (pipeline):

1. **очистка** — HTML-теги, ссылки, эмодзи (подробно — в Л5);
2. **нормализация** — единые апострофы, Unicode-форма NFC, регистр;
3. **сегментация** — деление на предложения;
4. **токенизация** — деление на слова;
5. **фильтрация** — стоп-слова, числа, слишком короткие токены;
6. **стемминг/лемматизация** — сведение словоформ к основе.

## Нормализация апострофов

| Знак | Код | Где встречается |
|---|---|---|
| ʻ | U+02BB | канон: **oʻ**, **gʻ** |
| ʼ | U+02BC | канон: *tutuq belgisi* — taʼlim, maʼlumot |
| ' | U+0027 | клавиатура (ASCII) |
| ‘ ’ | U+2018, U+2019 | автозамена в текстовых редакторах |
| обратный апостроф | U+0060 | «быстрый» набор на клавиатуре |

Правило: после **o** и **g** любой вариант превращается в ʻ, все остальные — в ʼ.

\`\`\`python
import re
def normalize(text):
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

normalize("O'zbekiston ta’limi")     # 'Oʻzbekiston taʼlimi'
\`\`\`

> [!WARNING] Ограничение правила
> Знак после **o/g** может быть и *tutuq belgisi*: «moʼjiza», «moʼtadil». Простое правило запишет их как «moʻjiza». Точная нормализация требует словаря исключений — это типичная ситуация в обработке языка: правила дают 95–99 %, остальное — словари и статистика.

Для «невидимых» различий Unicode (одна буква может быть записана одним или двумя кодами) используйте \`unicodedata.normalize("NFC", text)\`.

**Регистр**: \`text.lower()\`. Для узбекской латиницы проблем нет, кириллица тоже понижается корректно.

## Токенизация регулярными выражениями

| Шаблон | Значение |
|---|---|
| \`\w\` | буква, цифра или \`_\` (с учётом Unicode, включая ʻ и ʼ) |
| \`\s\` | пробельный символ (пробел, табуляция, перевод строки) |
| \`[^\w\s]\` | всё, что не буква и не пробел, — пунктуация |
| \`\w+(?:-\w+)*\` | слово, возможно с дефисами: *IT-park*, *qoʻllab-quvvatlash* |
| \`(?<=[.!?])\s+\` | пробелы **после** знака конца предложения (просмотр назад) |

\`\`\`python
text = "Bino zamonaviy texnologiyalar bilan jihozlangan bo'lib, unda IT-park bor."
text.split()                          # [..., "bo'lib,", ..., 'bor.'] — пунктуация прилипла
re.findall(r"\w+", text.lower())      # [..., 'bo', 'lib', ..., 'it', 'park', 'bor'] — апостроф порвал слово
re.findall(r"\w+", normalize(text).lower())   # [..., 'boʻlib', ...] — верно
\`\`\`

**Предложения** делим по \`. ! ?\`, за которыми идёт пробел, и по переводам строк:

\`\`\`python
sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
\`\`\`

Сокращения («va h.k.», «t.y.») и инициалы ломают такое правило — в серьёзных системах используют обученные сегментаторы.

## Стоп-слова

**Стоп-слова** — частые служебные слова (*va, bilan, uchun, bu, ham*), которые почти не несут темы текста. Их удаляют перед частотным анализом, поиском ключевых слов, тематическим моделированием.

\`\`\`python
with open("data/stopwords_uz.txt", encoding="utf-8") as f:
    stopwords = {w.strip() for w in f if w.strip()}      # множество: проверка "in" за O(1)
content = [t for t in tokens if t not in stopwords]
\`\`\`

> [!NOTE] Список стоп-слов нормализован
> В файле слова записаны канонически (*boʻlib, koʻp*). Если текст не нормализован, «bo'lib» не найдётся в списке и останется в данных.

> [!TIP] Не удаляйте стоп-слова вслепую
> Для анализа тональности слово **emas** («не») критично: «yaxshi emas» — отрицательный отзыв. Для n-грамм и синтаксического анализа стоп-слова тоже нужны.

## Стемминг агглютинативных слов

Узбекское слово — это корень + цепочка суффиксов: *kitob + lar + imiz + dan* = «из наших книг». **Стеммер** отрезает известные суффиксы и оставляет основу:

\`\`\`python
SUFFIXES = ["lar", "ning", "dan", "dagi", "imiz"]
def stem(word):
    changed = True
    while changed:                                   # повторяем, пока что-то отрезается
        changed = False
        for suf in sorted(SUFFIXES, key=len, reverse=True):   # сначала длинные
            if word.endswith(suf) and len(word) - len(suf) >= 3:
                word, changed = word[:-len(suf)], True
                break
    return word

stem("kitoblarimizdan")     # 'kitob'
\`\`\`

Ошибки стеммера: **перестемминг** (*maydoni → maydo*: «ni» отрезано у корня *maydon*) и **недостемминг** (редкие суффиксы не учтены). Точнее работают морфологические анализаторы и **лемматизаторы**, опирающиеся на словарь корней.
`,
    tasks: [
      {
        id: "t1",
        title: "Нормализация апострофов",
        setup: NORMALIZE.split("\ndef normalize")[0] + LOAD_DF,
        text: R`
Напишите функцию \`normalize_apostrophes(text)\`:
1. после букв **o, O, g, G** любой из вариантов \`' ‘ ’\` или обратный апостроф заменяется на ʻ (U+02BB);
2. все остальные такие знаки заменяются на ʼ (U+02BC);
3. канонические ʻ и ʼ остаются без изменений.

Затем посчитайте, какие апострофы встречаются в корпусе (таблица \`df\` уже загружена): \`before\` — \`Counter\` символов из \`ALL_APOS\` по всем текстам **до** нормализации, \`after\` — то же **после**.
`,
        starter: R`OK = "\u02bb"       # ʻ — для oʻ, gʻ
TUTUQ = "\u02bc"    # ʼ — tutuq belgisi
VARIANTS = "'\u2018\u2019\u0060"     # ' ‘ ’ и обратный апостроф
ALL_APOS = VARIANTS + OK + TUTUQ

def normalize_apostrophes(text):
    text = re.sub("([oOgG])[" + VARIANTS + "]", ..., text)
    text = ...
    return text

print(normalize_apostrophes("O'zbekiston, g\u0060alaba, so\u2018nggi, ta\u2019lim, ma'lumot"))

before = Counter(ch for text in df["text"] for ch in text if ch in ALL_APOS)
after = ...
print(before)
print(after)
`,
        check: R`
import re
from collections import Counter
f = var("normalize_apostrophes")
O, T = "\u02bb", "\u02bc"
tests = {
    "O'zbekiston": "O" + O + "zbekiston",
    "g\u0060alaba": "g" + O + "alaba",
    "so\u2018nggi": "so" + O + "nggi",
    "ta\u2019lim": "ta" + T + "lim",
    "ma'lumot": "ma" + T + "lumot",
    "san\u0060at": "san" + T + "at",
    "O'ZBEKISTON BOG'I": "O" + O + "ZBEKISTON BOG" + O + "I",
    "o" + O + "qish ta" + T + "lim": "o" + O + "qish ta" + T + "lim",
}
res = {k: f(k) for k in tests}
ok(res["O'zbekiston"] == tests["O'zbekiston"] and res["g\u0060alaba"] == tests["g\u0060alaba"] and res["so\u2018nggi"] == tests["so\u2018nggi"], "После o/g любой вариант апострофа становится ʻ (U+02BB)")
ok(res["O'ZBEKISTON BOG'I"] == tests["O'ZBEKISTON BOG'I"], "Правило работает и для заглавных O, G")
ok(all(res[k] == tests[k] for k in ["ta\u2019lim", "ma'lumot", "san\u0060at"]), "Остальные варианты становятся ʼ (U+02BC)")
canon = "o" + O + "qish ta" + T + "lim"
ok(res[canon] == canon, "Канонический текст (oʻqish taʼlim) не меняется")
import pandas as pd
texts = [open("data/corpus_uz/" + x, encoding="utf-8").read() for x in pd.read_csv("data/corpus_uz/meta.csv")["file"]]
A = "'\u2018\u2019\u0060" + O + T
b = Counter(ch for t in texts for ch in t if ch in A)
ok(dict(var("before")) == dict(b), "before — частоты всех вариантов апострофа в исходном корпусе")
a = var("after")
ok(set(dict(a)) <= {O, T} and sum(dict(a).values()) == sum(b.values()), "after: после нормализации остались только ʻ и ʼ, а их общее число не изменилось")
`,
        hint: R`Вторым аргументом \`re.sub\` может быть функция: \`lambda m: m.group(1) + OK\`. Второй шаг: \`re.sub("[" + VARIANTS + "]", TUTUQ, text)\`. Для \`after\` нормализуйте каждый текст перед подсчётом.`,
        solution: R`OK = "\u02bb"       # ʻ — для oʻ, gʻ
TUTUQ = "\u02bc"    # ʼ — tutuq belgisi
VARIANTS = "'\u2018\u2019\u0060"     # ' ‘ ’ и обратный апостроф
ALL_APOS = VARIANTS + OK + TUTUQ

def normalize_apostrophes(text):
    text = re.sub("([oOgG])[" + VARIANTS + "]", lambda m: m.group(1) + OK, text)
    text = re.sub("[" + VARIANTS + "]", TUTUQ, text)
    return text

print(normalize_apostrophes("O'zbekiston, g\u0060alaba, so\u2018nggi, ta\u2019lim, ma'lumot"))

before = Counter(ch for text in df["text"] for ch in text if ch in ALL_APOS)
after = Counter(ch for text in df["text"] for ch in normalize_apostrophes(text) if ch in ALL_APOS)
print(before)
print(after)
`,
      },
      {
        id: "t2",
        title: "Три способа токенизации",
        setup: NORMALIZE + R`
text = open("data/corpus_uz/uz_01.txt", encoding="utf-8").read()
`,
        text: R`
В переменной \`text\` — новость \`uz_01.txt\` (апострофы ASCII). Функция \`normalize\` уже определена. Сравните способы токенизации:

- \`tokens_split\` — \`text.split()\`;
- \`tokens_raw\` — \`re.findall(r"\w+", text.lower())\` (без нормализации);
- \`tokens_norm\` — \`\w+\` по \`normalize(text).lower()\`;
- \`tokens_hyph\` — шаблон \`\w+(?:-\w+)*\` по \`normalize(text).lower()\` (слова с дефисом не рвутся);
- \`broken\` — **множество** «обрывков»: токены из \`tokens_raw\`, которых нет среди \`tokens_norm\`.

Выведите длины всех списков и \`broken\`.
`,
        starter: R`tokens_split = ...
tokens_raw = ...
tokens_norm = ...
tokens_hyph = ...
broken = ...

for name, toks in [("split", tokens_split), ("raw", tokens_raw), ("norm", tokens_norm), ("hyph", tokens_hyph)]:
    print(name, len(toks), toks[:8])
print("Обрывки:", sorted(broken))
`,
        check: R`
import re
def _norm(t):
    t = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", t)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", t)
text = open("data/corpus_uz/uz_01.txt", encoding="utf-8").read()
ok(list(var("tokens_split")) == text.split(), "tokens_split = text.split()")
raw = re.findall(r"\w+", text.lower())
ok(list(var("tokens_raw")) == raw, "tokens_raw — \\w+ по тексту без нормализации (в нижнем регистре)")
norm = re.findall(r"\w+", _norm(text).lower())
ok(list(var("tokens_norm")) == norm, "tokens_norm — \\w+ по нормализованному тексту в нижнем регистре")
hyph = re.findall(r"\w+(?:-\w+)*", _norm(text).lower())
ok(list(var("tokens_hyph")) == hyph, "tokens_hyph — слова с дефисом (it-park) остаются целыми")
ok(set(var("broken")) == set(raw) - set(norm), "broken — обрывки слов: токены tokens_raw, которых нет в tokens_norm")
`,
        hint: R`Множество обрывков: \`set(tokens_raw) - set(tokens_norm)\`. Не забудьте \`.lower()\` во всех вариантах, кроме \`split\`.`,
        solution: R`tokens_split = text.split()
tokens_raw = re.findall(r"\w+", text.lower())
tokens_norm = re.findall(r"\w+", normalize(text).lower())
tokens_hyph = re.findall(r"\w+(?:-\w+)*", normalize(text).lower())
broken = set(tokens_raw) - set(tokens_norm)

for name, toks in [("split", tokens_split), ("raw", tokens_raw), ("norm", tokens_norm), ("hyph", tokens_hyph)]:
    print(name, len(toks), toks[:8])
print("Обрывки:", sorted(broken))
`,
      },
      {
        id: "t3",
        title: "Пунктуация и предложения",
        setup: NORMALIZE + R`
text = normalize(open("data/corpus_uz/uz_05.txt", encoding="utf-8").read())
`,
        text: R`
Напишите две функции:

1. \`remove_punct(text)\` — заменяет каждый символ, который не является буквой/цифрой и не пробел (шаблон \`[^\w\s]\`), на пробел, затем схлопывает все пробельные символы в один пробел и убирает пробелы по краям.
   Пример: \`remove_punct('"Salom", dedi u. Oʻzbek-tili!')\` → \`'Salom dedi u Oʻzbek tili'\`.
2. \`split_sentences(text)\` — список предложений: деление после \`. ! ?\` с пробелами и по переводам строк; знак конца остаётся в предложении, пробелы по краям убраны, пустых элементов нет.
   Пример: \`"Salom! Qalaysiz? Yaxshi.\n\nRahmat"\` → \`['Salom!', 'Qalaysiz?', 'Yaxshi.', 'Rahmat']\`.

Примените \`split_sentences\` к тексту \`uz_05\` (переменная \`text\`, уже нормализован): сохраните список в \`sents\`, а самое длинное по числу токенов предложение — в \`longest\`.
`,
        starter: R`def remove_punct(text):
    text = re.sub(..., " ", text)
    text = ...          # схлопнуть пробелы
    return text.strip()

def split_sentences(text):
    parts = re.split(..., text)
    return ...

print(remove_punct('"Salom", dedi u. O\u02bbzbek-tili!'))
print(split_sentences("Salom! Qalaysiz? Yaxshi.\n\nRahmat"))

sents = ...
longest = ...
print(len(sents), "предложений")
print("Самое длинное:", longest)
`,
        check: R`
import re
rp = var("remove_punct")
ss = var("split_sentences")
ok(rp('"Salom", dedi u. O\u02bbzbek-tili!') == "Salom dedi u O\u02bbzbek tili", "remove_punct удаляет пунктуацию и лишние пробелы, буква ʻ сохраняется")
ok(rp("  Bir,  ikki;\n\tuch...  ") == "Bir ikki uch", "remove_punct схлопывает пробелы, табуляцию и переводы строк")
ok(ss("Salom! Qalaysiz? Yaxshi.\n\nRahmat") == ["Salom!", "Qalaysiz?", "Yaxshi.", "Rahmat"], "split_sentences делит по . ! ? и переводам строк, знаки конца сохраняются")
ok(ss("  Bir gap.   Ikkinchi gap.  ") == ["Bir gap.", "Ikkinchi gap."], "Пробелы по краям предложений убраны, пустых элементов нет")
def _norm(t):
    t = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", t)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", t)
text = _norm(open("data/corpus_uz/uz_05.txt", encoding="utf-8").read())
ref = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
ok(list(var("sents")) == ref, f"sents — {len(ref)} предложений текста uz_05 (первое — заголовок)")
mx = max(len(re.findall(r"\w+", s)) for s in ref)
lg = var("longest")
ok(isinstance(lg, str) and lg in ref and len(re.findall(r"\w+", lg)) == mx, "longest — предложение с наибольшим числом токенов")
`,
        hint: R`Пробелы: \`re.sub(r"\s+", " ", text)\`. Предложения: \`re.split(r"(?<=[.!?])\s+|\n+", text)\`, затем \`[s.strip() for s in parts if s.strip()]\`. Самое длинное: \`max(sents, key=lambda s: len(re.findall(r"\w+", s)))\`.`,
        solution: R`def remove_punct(text):
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def split_sentences(text):
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]

print(remove_punct('"Salom", dedi u. O\u02bbzbek-tili!'))
print(split_sentences("Salom! Qalaysiz? Yaxshi.\n\nRahmat"))

sents = split_sentences(text)
longest = max(sents, key=lambda s: len(re.findall(r"\w+", s)))
print(len(sents), "предложений")
print("Самое длинное:", longest)
`,
      },
      {
        id: "t4",
        title: "Удаление стоп-слов",
        setup: NORMALIZE + LOAD_DF + R`
tokens = [t for text in df["text"] for t in re.findall(r"\w+", normalize(text).lower())]
`,
        text: R`
В \`tokens\` — все токены корпуса (нормализованы, в нижнем регистре).

1. Прочитайте \`data/stopwords_uz.txt\` (по слову в строке) в **множество** \`stopwords\` (без пустых строк и пробелов по краям).
2. \`content\` — токены без стоп-слов (порядок сохраняется).
3. \`stop_share\` — доля токенов корпуса, которые оказались стоп-словами.
4. \`top_before\` и \`top_after\` — 10 самых частых слов до и после удаления стоп-слов (\`Counter(...).most_common(10)\`).
`,
        starter: R`with open("data/stopwords_uz.txt", encoding="utf-8") as f:
    stopwords = ...

content = ...
stop_share = ...
top_before = ...
top_after = ...

print("Стоп-слов в списке:", len(stopwords))
print(f"Доля стоп-слов в корпусе: {stop_share:.1%}")
print("До:   ", top_before)
print("После:", top_after)
`,
        check: REF + R`
toks = [t for x in _texts for t in re.findall(r"\w+", _norm(x).lower())]
sw = var("stopwords")
ok(isinstance(sw, (set, frozenset)), "stopwords — множество (set)")
ok(set(sw) == _sw, f"stopwords — все {len(_sw)} слов из файла без пробелов и пустых строк")
cont = [t for t in toks if t not in _sw]
ok(list(var("content")) == cont, "content — токены корпуса без стоп-слов в исходном порядке")
ok(abs(var("stop_share") - (1 - len(cont) / len(toks))) < 1e-3, "stop_share — доля стоп-слов среди всех токенов")
tb, ta = var("top_before"), var("top_after")
ok([c for _, c in tb] == [c for _, c in Counter(toks).most_common(10)] and all(Counter(toks)[w] == c for w, c in tb), "top_before — 10 самых частых токенов корпуса")
ok([c for _, c in ta] == [c for _, c in Counter(cont).most_common(10)] and not any(w in _sw for w, _ in ta), "top_after — 10 самых частых слов без стоп-слов")
`,
        hint: R`\`{w.strip() for w in f if w.strip()}\` — множество из строк файла. Фильтр: \`[t for t in tokens if t not in stopwords]\`.`,
        solution: R`with open("data/stopwords_uz.txt", encoding="utf-8") as f:
    stopwords = {w.strip() for w in f if w.strip()}

content = [t for t in tokens if t not in stopwords]
stop_share = 1 - len(content) / len(tokens)
top_before = Counter(tokens).most_common(10)
top_after = Counter(content).most_common(10)

print("Стоп-слов в списке:", len(stopwords))
print(f"Доля стоп-слов в корпусе: {stop_share:.1%}")
print("До:   ", top_before)
print("После:", top_after)
`,
      },
      {
        id: "t5",
        title: "Конвейер preprocess(text)",
        setup: NORMALIZE + LOAD_DF + LOAD_SW,
        text: R`
Соберите шаги в одну переиспользуемую функцию \`preprocess(text)\`, которая возвращает **список токенов**:

1. нормализация апострофов (\`normalize\` уже есть);
2. нижний регистр;
3. токенизация \`\w+\`;
4. удаление стоп-слов (множество \`STOPWORDS\` уже загружено);
5. удаление токенов короче 2 символов и токенов, состоящих только из цифр.

Примените её ко всему корпусу:
- \`df["tokens"]\` — результат \`preprocess\` для каждого текста;
- \`df["n_raw"]\` — число «слов» исходного текста по \`text.split()\`;
- \`df["n_clean"]\` — длина списка \`tokens\`;
- \`reduction\` — на какую долю уменьшился объём корпуса: \`1 - сумма n_clean / сумма n_raw\`.
`,
        starter: R`def preprocess(text):
    text = normalize(text)
    ...
    return tokens

print(preprocess("O'zbekiston va O\u02bbzbekistonda 2026-yil ham!"))

df["tokens"] = ...
df["n_raw"] = ...
df["n_clean"] = ...
reduction = ...

print(f"Объём уменьшился на {reduction:.1%}")
df[["file", "category", "n_raw", "n_clean"]]
`,
        check: REF + R`
pp = var("preprocess")
O = "\u02bb"
ok(pp("O'zbekiston va O" + O + "zbekistonda 2026-yil ham!") == ["o" + O + "zbekiston", "o" + O + "zbekistonda", "yil"], "preprocess: нормализация, регистр, удаление стоп-слов и чисел")
ok(pp("Bu kitob juda yaxshi, u menga yoqdi.") == ["kitob", "yaxshi", "menga", "yoqdi"], "preprocess удаляет стоп-слова и пунктуацию")
ok(pp("x y z 7 Ta'lim") == ["ta\u02bclim"], "preprocess удаляет токены короче 2 символов и числа")
d = var("df", pd.DataFrame)
ok("tokens" in d.columns and all(list(a) == _prep(t) for a, t in zip(d["tokens"], _texts)), "df['tokens'] — результат preprocess для каждого документа")
ok("n_raw" in d.columns and all(int(a) == len(t.split()) for a, t in zip(d["n_raw"], _texts)), "df['n_raw'] — число слов по text.split()")
ok("n_clean" in d.columns and all(int(a) == len(_prep(t)) for a, t in zip(d["n_clean"], _texts)), "df['n_clean'] — число токенов после предобработки")
exp = 1 - sum(len(_prep(t)) for t in _texts) / sum(len(t.split()) for t in _texts)
ok(abs(var("reduction") - exp) < 1e-3, "reduction = 1 - сумма n_clean / сумма n_raw")
`,
        hint: R`Внутри функции: \`tokens = re.findall(r"\w+", text.lower())\`, затем \`[t for t in tokens if t not in STOPWORDS and len(t) >= 2 and not t.isdigit()]\`. Длина списков в столбце: \`df["tokens"].str.len()\`.`,
        solution: R`def preprocess(text):
    text = normalize(text)
    text = text.lower()
    tokens = re.findall(r"\w+", text)
    tokens = [t for t in tokens if t not in STOPWORDS and len(t) >= 2 and not t.isdigit()]
    return tokens

print(preprocess("O'zbekiston va O\u02bbzbekistonda 2026-yil ham!"))

df["tokens"] = df["text"].apply(preprocess)
df["n_raw"] = df["text"].str.split().str.len()
df["n_clean"] = df["tokens"].str.len()
reduction = 1 - df["n_clean"].sum() / df["n_raw"].sum()

print(f"Объём уменьшился на {reduction:.1%}")
df[["file", "category", "n_raw", "n_clean"]]
`,
      },
      {
        id: "t6",
        title: "Простой стеммер для узбекского (продвинутое)",
        setup: NORMALIZE + LOAD_DF + LOAD_SW + SUFFIXES + R`
def preprocess(text):
    tokens = re.findall(r"\w+", normalize(text).lower())
    return [t for t in tokens if t not in STOPWORDS and len(t) >= 2 and not t.isdigit()]

content_tokens = [t for text in df["text"] for t in preprocess(text)]
`,
        text: R`
Напишите функцию \`stem(word)\` для списка суффиксов \`SUFFIXES\` (уже задан):

- найдите **самый длинный** суффикс из списка, на который оканчивается слово, при условии, что после отрезания останется **не меньше 3 символов**;
- отрежьте его и повторяйте, пока что-то отрезается.

Пример: \`kitoblarimizdan → kitoblarimiz → kitoblar → kitob\`.

Затем для \`content_tokens\` (все токены корпуса после \`preprocess\`):
- \`stems\` — список основ (\`stem\` от каждого токена);
- \`n_types_before\`, \`n_types_after\` — число уникальных словоформ и уникальных основ;
- \`families\` — словарь \`{основа: отсортированный список разных словоформ}\` только для основ, у которых **3 и больше** разных словоформ.
`,
        starter: R`print(SUFFIXES)

def stem(word):
    changed = True
    while changed:
        changed = False
        for suf in ...:          # сначала самые длинные суффиксы
            if ...:
                word = ...
                changed = True
                break
    return word

for w in ["kitoblarimizdan", "talabalarning", "rivojlanmoqda", "dasturchilar", "maydoni"]:
    print(w, "->", stem(w))

stems = ...
n_types_before = ...
n_types_after = ...
families = ...

print("Словоформ:", n_types_before, "основ:", n_types_after)
for s, forms in sorted(families.items(), key=lambda x: -len(x[1]))[:10]:
    print(s, forms)
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
st = var("stem")
battery = {"kitoblarimizdan": "kitob", "talabalarning": "talaba", "rivojlanmoqda": "rivojlan", "shaharlardagi": "shahar",
           "dasturchilar": "dastur", "beradi": "ber", "dedi": "dedi", "kitob": "kitob", "ishga": "ish"}
ok(st("kitoblarimizdan") == "kitob", "stem('kitoblarimizdan') = 'kitob' (суффиксы отрезаются повторно)")
ok(st("rivojlanmoqda") == "rivojlan" and st("shaharlardagi") == "shahar", "Отрезается самый длинный подходящий суффикс (moqda, а не da)")
ok(st("dedi") == "dedi" and st("ishga") == "ish", "После отрезания остаётся не меньше 3 символов")
ok(all(st(k) == v for k, v in battery.items()), "stem правильно работает на контрольных словах")
ct = [t for x in _texts for t in _prep(x)]
types = sorted(set(ct))
agree = sum(st(w) == _stem(w) for w in types) / len(types)
ok(agree >= 0.98, f"stem совпадает с эталоном на словаре корпуса (совпадение {agree:.1%})")
stems = list(var("stems"))
ok(len(stems) == len(ct) and stems == [st(w) for w in ct], "stems — основы всех content_tokens по порядку")
ok(var("n_types_before") == len(types), "n_types_before — число уникальных словоформ")
ok(var("n_types_after") == len(set(stems)) and len(set(stems)) < len(types), "n_types_after — число уникальных основ (меньше, чем словоформ)")
fam = {}
for w in types:
    fam.setdefault(st(w), set()).add(w)
fam = {s: sorted(v) for s, v in fam.items() if len(v) >= 3}
got = var("families", dict)
ok(set(got) == set(fam) and all(sorted(got[s]) == fam[s] for s in fam), "families — основы с 3+ словоформами и их формы")
`,
        hint: R`Перебор: \`for suf in sorted(SUFFIXES, key=len, reverse=True)\`; условие: \`word.endswith(suf) and len(word) - len(suf) >= 3\`. Для families сначала соберите \`{основа: set(словоформ)}\`, затем оставьте основы с \`len(forms) >= 3\`.`,
        solution: R`print(SUFFIXES)

def stem(word):
    changed = True
    while changed:
        changed = False
        for suf in sorted(SUFFIXES, key=len, reverse=True):
            if word.endswith(suf) and len(word) - len(suf) >= 3:
                word = word[:-len(suf)]
                changed = True
                break
    return word

for w in ["kitoblarimizdan", "talabalarning", "rivojlanmoqda", "dasturchilar", "maydoni"]:
    print(w, "->", stem(w))

stems = [stem(t) for t in content_tokens]
n_types_before = len(set(content_tokens))
n_types_after = len(set(stems))

groups = {}
for w in set(content_tokens):
    groups.setdefault(stem(w), set()).add(w)
families = {s: sorted(forms) for s, forms in groups.items() if len(forms) >= 3}

print("Словоформ:", n_types_before, "основ:", n_types_after)
for s, forms in sorted(families.items(), key=lambda x: -len(x[1]))[:10]:
    print(s, forms)
`,
      },
    ],
    quiz: [
      { q: "Какое правило нормализации апострофов используется в занятии?", options: ["Все апострофы удаляются", "После o/g любой вариант → ʻ (U+02BB), остальные → ʼ (U+02BC)", "Все апострофы заменяются на ASCII '", "Апострофы заменяются пробелом"], answer: 1, explain: "Так получаем канонические oʻ, gʻ и tutuq belgisi; оба знака — буквы Unicode (Lm), поэтому \\w+ не рвёт слова." },
      { q: "Что найдёт шаблон `[^\\w\\s]`?", options: ["Буквы и цифры", "Пробелы", "Символы, которые не буквы/цифры и не пробелы, — пунктуацию", "Только точки"], answer: 2, explain: "Символ ^ внутри квадратных скобок означает отрицание: всё, кроме букв/цифр (\\w) и пробельных символов (\\s). Буквы ʻ и ʼ входят в \\w и сохраняются." },
      { q: "Почему стоп-слова хранят в множестве (set), а не в списке?", options: ["Множество занимает меньше места на диске", "Проверка `t in stopwords` для множества выполняется за O(1), для списка — за O(n)", "Список нельзя прочитать из файла", "Множество сохраняет порядок"], answer: 1, explain: "На миллионах токенов разница между O(1) и O(n) огромна." },
      { q: "В какой задаче удалять слово «emas» (не) опасно?", options: ["Подсчёт объёма корпуса", "Анализ тональности отзывов", "Подсчёт символов", "Сортировка файлов"], answer: 1, explain: "«yaxshi emas» — отрицательная оценка; без «emas» отзыв станет положительным." },
      { q: "Стеммер превратил «maydoni» в «maydo». Как называется такая ошибка?", options: ["Недостемминг", "Перестемминг (отрезано слишком много)", "Лемматизация", "Токенизация"], answer: 1, explain: "Суффикс «ni» совпал с концом сочетания корня maydon и суффикса -i. Такие ошибки исправляют словари корней." },
      { q: "Чем лемматизация отличается от стемминга?", options: ["Ничем", "Лемматизация приводит слово к словарной форме с учётом морфологии и словаря, стемминг просто отрезает окончания по правилам", "Стемминг всегда точнее", "Лемматизация удаляет стоп-слова"], answer: 1, explain: "Лемматизатор знает, что «kitoblarimizdan» — форма слова «kitob», и не отрежет лишнего у «maydoni»; стеммер работает только по правилам и ошибается чаще." },
    ],
    realEnv: R`
## Предобработка в реальных проектах

В Jupyter (Anaconda) или Colab код занятия работает без изменений. Функцию \`preprocess\` удобно вынести в модуль \`textprep.py\` рядом с блокнотом и импортировать: \`from textprep import preprocess\` — тогда одна и та же обработка применяется в обучении модели и в продакшене.

**Масштабирование.** Для миллионов документов:

\`\`\`python
# pandas: обработка по частям, чтобы не держать всё в памяти
for chunk in pd.read_csv("news_big.csv", chunksize=100_000):
    chunk["tokens"] = chunk["text"].map(preprocess)
    chunk.to_parquet(f"tokens_{chunk.index[0]}.parquet")
\`\`\`

\`\`\`python
# PySpark: та же функция как UDF на кластере
from pyspark.sql import functions as F, types as T
prep_udf = F.udf(preprocess, T.ArrayType(T.StringType()))
df = spark.read.json("corpus.jsonl").withColumn("tokens", prep_udf("text"))
\`\`\`

**Инструменты для узбекского языка** (проверьте актуальность версий на PyPI и GitHub):

- морфологические анализаторы и стеммеры для узбекского (например, пакет *UzMorphAnalyser*), транслитераторы латиница ↔ кириллица (*UzTransliterator*);
- готовые списки стоп-слов узбекского языка публикуются в открытых репозиториях на GitHub;
- **Universal Dependencies** содержит трибанк узбекского с леммами и морфологическими признаками — на нём можно проверить качество своего стеммера;
- токенизаторы современных моделей (BPE, SentencePiece) в библиотеке \`transformers\` делят слова на подслова и частично решают проблему агглютинации без ручных правил.

> [!TIP] Сохраняйте исходный текст
> Предобработка теряет информацию (регистр, пунктуацию, стоп-слова). Храните «сырой» текст рядом с обработанным, чтобы можно было переделать конвейер.
`,
    homework: R`
**Тема для самостоятельной работы: «Изучение методов предварительной обработки текстовых данных».**

1. Добавьте в \`preprocess\` параметры \`remove_stop=True\`, \`min_len=2\`, \`stem=False\` и сравните объём словаря корпуса при разных настройках.
2. Найдите в корпусе не менее 10 ошибок вашего стеммера (перестемминг и недостемминг) и предложите правила или словарь исключений.
3. Сравните предобработку для двух задач — поиска ключевых слов и анализа тональности: какие шаги в них должны отличаться и почему?
`,
  });
})();
