/* П4. Небольшой текстовый корпус на узбекском языке и его статистические характеристики */
(function () {
  // Общий подготовительный код: функция нормализации апострофов и таблица корпуса
  const NORMALIZE = R`import re
import pandas as pd

def normalize(text):
    """Все варианты апострофа -> канонические: oʻ/gʻ (U+02BB) и ʼ (U+02BC)."""
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)
`;
  const SETUP_DF = NORMALIZE + R`
df = pd.read_csv("data/corpus_uz/meta.csv")[["file", "title", "category"]]
df["text"] = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in df["file"]]
`;
  // Эталонные вычисления для проверок
  const CHECK_REF = R`
import re
import pandas as pd
from collections import Counter

def _norm(text):
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

_meta = pd.read_csv("data/corpus_uz/meta.csv")
_texts = [open("data/corpus_uz/" + f, encoding="utf-8").read() for f in _meta["file"]]
_toks = [re.findall(r"\w+", _norm(t).lower()) for t in _texts]
`;

  BDT.register({
    id: "p04",
    kind: "practice",
    num: 4,
    title: "Создание небольшого текстового корпуса на узбекском языке и вычисление статистических характеристик корпуса",
    hours: 2,
    env: ["python"],
    goals: [
      "Собрать корпус из текстовых файлов и метаданных в удобную структуру: словарь и `DataFrame`",
      "Вычислить основные характеристики корпуса: символы, предложения, токены, типы, TTR, гапаксы, средние длины",
      "Сравнить характеристики по категориям текстов и сохранить корпус в форматах CSV и JSON Lines",
    ],
    theory: R`
## Что такое корпус

**Корпус** — это собрание текстов, отобранных по понятным правилам и снабжённых **метаданными** (автор, дата, жанр, источник). Именно метаданные отличают корпус от «папки с файлами»: благодаря им можно сравнивать, например, язык спортивных и научных новостей.

Крупные корпуса — Британский национальный корпус, Национальный корпус русского языка, трибанки Universal Dependencies — содержат миллионы и миллиарды словоупотреблений. Принципы работы с ними те же, что и с нашим учебным корпусом из 16 новостей; меняются только объём и инструменты.

| Файл | Содержимое |
|---|---|
| \`data/corpus_uz/uz_01.txt … uz_16.txt\` | новостные тексты на узбекском (латиница); первая строка — заголовок |
| \`data/corpus_uz/meta.csv\` | file, title, category, date, author, apostrophe_style, url |

## Чтение корпуса в Python

\`\`\`python
import glob, os
import pandas as pd

corpus = {}
for path in sorted(glob.glob("data/corpus_uz/uz_*.txt")):
    with open(path, encoding="utf-8") as f:      # всегда указывайте кодировку
        corpus[os.path.basename(path)] = f.read()

meta = pd.read_csv("data/corpus_uz/meta.csv")
meta["text"] = meta["file"].map(corpus)           # корпус = метаданные + тексты
\`\`\`

> [!WARNING] Порядок файлов
> \`os.listdir\` и \`glob.glob\` **не гарантируют** порядок файлов (он зависит от файловой системы). Чтобы результаты были воспроизводимыми, всегда сортируйте список: \`sorted(...)\`.

## Ловушка узбекской латиницы: апострофы

В официальной латинице буквы **oʻ** и **gʻ** пишутся со знаком ʻ (U+02BB), а разделительный знак *tutuq belgisi* — ʼ (U+02BC). На практике в текстах встречаются ASCII \`'\`, типографские \`‘ ’\` и даже обратный апостроф. Файлы нашего корпуса специально записаны **разными** способами:

| Вариант | Пример | \`re.findall(r"\w+", ...)\` |
|---|---|---|
| канонический | oʻzbek, maʼlumot | \`['oʻzbek']\` |
| ASCII | o'zbek, ma'lumot | \`['o', 'zbek']\` — слово разорвано! |
| типографский | o‘zbek, ma’lumot | \`['o', 'zbek']\` |

Знаки ʻ и ʼ относятся к категории Unicode **Lm** (буква-модификатор), поэтому \`\w\` считает их частью слова. Значит, достаточно привести все варианты к каноническим — и простая регулярка \`\w+\` будет правильно делить текст на слова:

\`\`\`python
import re
def normalize(text):
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)

tokens = re.findall(r"\w+", normalize(text).lower())
\`\`\`

Подробно нормализацию разберём в П12, а здесь будем пользоваться готовой функцией.

## Статистические характеристики корпуса

| Величина | Как считать | Что показывает |
|---|---|---|
| символы | \`len(text)\` | объём «сырого» текста |
| предложения | деление по \`. ! ?\` и переводам строк | синтаксическую «плотность» |
| **токены** (словоупотребления) | \`len(tokens)\` | объём корпуса в словах |
| **типы** (словоформы) | \`len(set(tokens))\` | размер словаря |
| **TTR** (type-token ratio) | типы / токены | лексическое разнообразие |
| **гапаксы** (hapax legomena) | слова с частотой 1 | «длинный хвост» словаря |
| средняя длина слова | \`sum(map(len, tokens)) / len(tokens)\` | у агглютинативных языков она больше |
| средняя длина предложения | токены / предложения | сложность синтаксиса |

\`\`\`python
from collections import Counter
freq = Counter(tokens)
n_tokens, n_types = len(tokens), len(freq)
ttr = n_types / n_tokens
hapax = [w for w, c in freq.items() if c == 1]
\`\`\`

Узбекский язык **агглютинативный**: к корню присоединяются цепочки суффиксов (*kitob → kitoblar → kitoblarimizdan*). Поэтому одна лексема даёт десятки словоформ: словарь растёт быстрее, TTR и доля гапаксов выше, чем, например, в английском тексте того же объёма.

> [!NOTE] TTR зависит от длины текста
> Чем длиннее текст, тем чаще повторяются слова и тем ниже TTR (рост словаря замедляется — закон Хипса). Поэтому TTR сравнивают только у текстов **одинаковой длины** или считают на выборках фиксированного размера.

## Группировка по метаданным

\`\`\`python
df.groupby("category")["n_tokens"].sum()          # токены по категориям
\`\`\`

TTR категории нужно считать по **объединённым** текстам категории (типы всех её текстов / токены всех её текстов), а не как среднее TTR документов.

## Сохранение корпуса

- **CSV** — таблица, удобна для Excel и pandas, но длинные тексты с переводами строк и кавычками экранируются.
- **JSON Lines** (\`.jsonl\`) — одна строка = один JSON-документ. Стандарт для больших корпусов (HuggingFace datasets, Spark): файл можно читать построчно, не загружая целиком.

\`\`\`python
df.to_csv("corpus.csv", index=False)
df.to_json("corpus.jsonl", orient="records", lines=True, force_ascii=False)
back = pd.read_json("corpus.jsonl", lines=True)
\`\`\`

> [!TIP] force_ascii=False
> Без этого параметра каждая буква ʻ превратится в шестисимвольную последовательность \`\u02bb\`: файл станет больше и нечитаемым для человека.
`,
    tasks: [
      {
        id: "t1",
        title: "Чтение одного текста",
        text: R`
Откройте файл \`data/corpus_uz/uz_04.txt\` (кодировка UTF-8) и прочитайте его целиком в переменную \`text\`. Первая строка файла — заголовок новости.

Создайте переменные:
- \`title\` — первая строка без пробелов по краям;
- \`body\` — весь остальной текст без пробелов и пустых строк по краям (\`.strip()\`);
- \`n_chars\` — число символов в \`body\`;
- \`n_paragraphs\` — число непустых строк (абзацев) в \`body\`.
`,
        starter: R`with open("data/corpus_uz/uz_04.txt", encoding="utf-8") as f:
    text = ...

lines = text.split("\n")
title = ...
body = ...
n_chars = ...
n_paragraphs = ...

print(title)
print("Символов:", n_chars, "абзацев:", n_paragraphs)
`,
        check: R`
raw = open("data/corpus_uz/uz_04.txt", encoding="utf-8").read()
ok(var("text") == raw, "text — полное содержимое файла uz_04.txt")
ok(var("title") == raw.split("\n")[0].strip(), "title — первая строка файла (заголовок «Navroʻz bayrami: ...»)")
body = raw.split("\n", 1)[1].strip()
ok(var("body") == body, "body — текст после заголовка без пробелов и пустых строк по краям")
ok(var("n_chars") == len(body), "n_chars = len(body)")
ok(var("n_paragraphs") == len([l for l in body.split("\n") if l.strip()]), "n_paragraphs — число непустых строк в body")
`,
        hint: R`\`f.read()\` читает файл целиком. Строки без первой: \`"\n".join(lines[1:])\`. Непустые строки: \`[l for l in body.split("\n") if l.strip()]\`.`,
        solution: R`with open("data/corpus_uz/uz_04.txt", encoding="utf-8") as f:
    text = f.read()

lines = text.split("\n")
title = lines[0].strip()
body = "\n".join(lines[1:]).strip()
n_chars = len(body)
n_paragraphs = len([line for line in body.split("\n") if line.strip()])

print(title)
print("Символов:", n_chars, "абзацев:", n_paragraphs)
`,
      },
      {
        id: "t2",
        title: "Корпус как словарь",
        text: R`
Прочитайте все 16 файлов \`uz_*.txt\` из папки \`data/corpus_uz/\` в словарь \`corpus = {имя_файла: текст}\`. Ключ — имя файла **без пути** (например, \`"uz_01.txt"\`), значение — полный текст.

Ключи должны идти по порядку \`uz_01.txt … uz_16.txt\` — используйте \`sorted(glob.glob(...))\`.

Посчитайте \`total_chars\` — суммарное число символов во всех текстах — и выведите на экран число документов.
`,
        starter: R`import glob, os

paths = ...          # отсортированный список путей к файлам uz_*.txt
corpus = {}
for path in paths:
    name = ...       # имя файла без папки
    with open(path, encoding="utf-8") as f:
        corpus[name] = ...

total_chars = ...
print("Документов:", len(corpus))
print("Символов:", total_chars)
`,
        check: R`
import glob, os
files = sorted(glob.glob("data/corpus_uz/uz_*.txt"))
names = [os.path.basename(f) for f in files]
texts = [open(f, encoding="utf-8").read() for f in files]
c = var("corpus", dict)
ok(len(c) == 16, "В corpus 16 документов")
ok(list(c.keys()) == names, "Ключи — имена файлов (uz_01.txt …) в отсортированном порядке")
ok(all(str(c.get(n, "")).strip() == t.strip() for n, t in zip(names, texts)), "Значения — полные тексты соответствующих файлов")
tc = var("total_chars")
ok(tc in (sum(map(len, texts)), sum(len(t.strip()) for t in texts)), "total_chars — суммарная длина всех текстов")
ok("16" in out, "Число документов выведено на экран")
`,
        hint: R`\`glob.glob("data/corpus_uz/uz_*.txt")\` возвращает пути в произвольном порядке — оберните в \`sorted()\`. Имя файла: \`os.path.basename(path)\`. Сумма длин: \`sum(len(t) for t in corpus.values())\`.`,
        solution: R`import glob, os

paths = sorted(glob.glob("data/corpus_uz/uz_*.txt"))
corpus = {}
for path in paths:
    name = os.path.basename(path)
    with open(path, encoding="utf-8") as f:
        corpus[name] = f.read()

total_chars = sum(len(t) for t in corpus.values())
print("Документов:", len(corpus))
print("Символов:", total_chars)
`,
      },
      {
        id: "t3",
        title: "Корпус с метаданными в DataFrame",
        text: R`
Метаданные корпуса лежат в \`data/corpus_uz/meta.csv\` (столбцы file, title, category, date, author, apostrophe_style, url).

1. Прочитайте meta.csv в \`df\`.
2. Добавьте столбец \`text\` — текст файла, указанного в столбце \`file\` (файлы лежат в той же папке).
3. Добавьте столбец \`n_chars\` — длина текста в символах.
4. Сохраните в \`cat_counts\` число документов в каждой категории (\`value_counts\`).
`,
        starter: R`import pandas as pd

df = ...

def read_text(name):
    with open("data/corpus_uz/" + name, encoding="utf-8") as f:
        return f.read()

df["text"] = ...
df["n_chars"] = ...
cat_counts = ...

print(cat_counts)
df[["file", "title", "category", "n_chars"]]
`,
        check: R`
import pandas as pd
meta = pd.read_csv("data/corpus_uz/meta.csv")
df = var("df", pd.DataFrame)
ok(len(df) == 16 and "file" in df.columns and "category" in df.columns, "df — 16 строк из meta.csv")
ok("text" in df.columns and all(str(t).strip() == open("data/corpus_uz/" + f, encoding="utf-8").read().strip() for f, t in zip(df["file"], df["text"])), "Столбец text содержит текст файла из столбца file")
ok("n_chars" in df.columns and (df["n_chars"] == df["text"].str.len()).all(), "n_chars — длина text")
cc = var("cat_counts")
ok(isinstance(cc, pd.Series) and {str(k): int(v) for k, v in cc.items()} == meta["category"].value_counts().to_dict(), "cat_counts — число документов по категориям")
`,
        hint: R`\`df["file"].apply(read_text)\` применит функцию к каждому имени файла; длина строк — \`df["text"].str.len()\`.`,
        solution: R`import pandas as pd

df = pd.read_csv("data/corpus_uz/meta.csv")

def read_text(name):
    with open("data/corpus_uz/" + name, encoding="utf-8") as f:
        return f.read()

df["text"] = df["file"].apply(read_text)
df["n_chars"] = df["text"].str.len()
cat_counts = df["category"].value_counts()

print(cat_counts)
df[["file", "title", "category", "n_chars"]]
`,
      },
      {
        id: "t4",
        title: "Токены, типы, TTR и гапаксы",
        setup: SETUP_DF,
        text: R`
В подготовленном коде загружена таблица \`df\` (столбцы file, title, category, text) и функция \`normalize(text)\`, которая приводит все варианты апострофа к каноническим ʻ и ʼ.

Токенизируйте **весь корпус** (документы по порядку) так: \`re.findall(r"\w+", normalize(text).lower())\` и вычислите:
- \`tokens\` — список всех токенов корпуса;
- \`n_tokens\` и \`n_types\` — число токенов и типов (уникальных словоформ);
- \`ttr\` — type-token ratio = \`n_types / n_tokens\`;
- \`hapax\` — **множество** слов, встретившихся ровно один раз, и \`hapax_share\` — их доля среди типов;
- \`n_tokens_raw\` — число токенов при такой же токенизации, но **без** \`normalize\`. Почему оно больше?
`,
        starter: R`import re
from collections import Counter

tokens = []
for text in df["text"]:
    tokens += ...

freq = Counter(tokens)
n_tokens = ...
n_types = ...
ttr = ...
hapax = ...
hapax_share = ...

n_tokens_raw = ...

print(f"Токенов: {n_tokens}, типов: {n_types}, TTR = {ttr}")
print("Гапаксов:", len(hapax), "доля:", hapax_share)
print("Без нормализации:", n_tokens_raw)
`,
        check: CHECK_REF + R`
toks = [t for doc in _toks for t in doc]
freq = Counter(toks)
ok(list(var("tokens")) == toks, "tokens — все токены корпуса по порядку документов")
ok(var("n_tokens") == len(toks), "n_tokens — число токенов")
ok(var("n_types") == len(freq), "n_types — число уникальных токенов")
ok(abs(var("ttr") - len(freq) / len(toks)) < 1e-3, "ttr = n_types / n_tokens")
hp = {w for w, c in freq.items() if c == 1}
ok(set(var("hapax")) == hp, "hapax — множество слов с частотой 1")
ok(abs(var("hapax_share") - len(hp) / len(freq)) < 1e-3, "hapax_share = len(hapax) / n_types")
raw = sum(len(re.findall(r"\w+", t.lower())) for t in _texts)
ok(var("n_tokens_raw") == raw, f"n_tokens_raw = {raw}: без нормализации o'zbek рвётся на o + zbek")
`,
        hint: R`Частоты даёт \`Counter(tokens)\`; гапаксы — \`{w for w, c in freq.items() if c == 1}\`. Для \`n_tokens_raw\` повторите токенизацию для \`text.lower()\` без \`normalize\`.`,
        solution: R`import re
from collections import Counter

tokens = []
for text in df["text"]:
    tokens += re.findall(r"\w+", normalize(text).lower())

freq = Counter(tokens)
n_tokens = len(tokens)
n_types = len(freq)
ttr = n_types / n_tokens
hapax = {w for w, c in freq.items() if c == 1}
hapax_share = len(hapax) / n_types

n_tokens_raw = sum(len(re.findall(r"\w+", text.lower())) for text in df["text"])

print(f"Токенов: {n_tokens}, типов: {n_types}, TTR = {ttr:.3f}")
print(f"Гапаксов: {len(hapax)} ({hapax_share:.1%} словаря)")
print("Без нормализации:", n_tokens_raw)
`,
      },
      {
        id: "t5",
        title: "Характеристики каждого документа",
        setup: SETUP_DF,
        text: R`
Добавьте в таблицу \`df\` столбцы с характеристиками **каждого** документа:

- \`n_tokens\`, \`n_types\`, \`ttr\` — как в прошлом задании, но для одного текста;
- \`n_sents\` — число предложений. Делите текст так: \`re.split(r"(?<=[.!?])\s+|\n+", text.strip())\` и отбрасывайте пустые части (заголовок считается отдельным предложением);
- \`avg_word_len\` — средняя длина токена (после нормализации) в символах;
- \`avg_sent_len\` — среднее число токенов в предложении: \`n_tokens / n_sents\`.

Строки \`df\` не удаляйте. Выведите таблицу, отсортированную по \`ttr\`: у каких текстов словарь разнообразнее?
`,
        starter: R`def doc_stats(text):
    toks = re.findall(r"\w+", normalize(text).lower())
    sents = ...
    return pd.Series({
        "n_tokens": len(toks),
        "n_types": ...,
        "ttr": ...,
        "n_sents": ...,
        "avg_word_len": ...,
        "avg_sent_len": ...,
    })

stats = df["text"].apply(doc_stats)
df = pd.concat([df, stats], axis=1)
df[["file", "category", "n_tokens", "n_types", "ttr", "n_sents", "avg_word_len", "avg_sent_len"]].sort_values("ttr")
`,
        check: CHECK_REF + R`
d = var("df", pd.DataFrame)
cols = ["n_tokens", "n_types", "ttr", "n_sents", "avg_word_len", "avg_sent_len"]
miss = [c for c in cols if c not in d.columns]
ok(not miss, "В df есть столбцы " + ", ".join(cols))
ok(len(d) == 16 and "file" in d.columns, "В df по-прежнему 16 документов")
if not miss and "file" in d.columns:
    d = d.set_index("file")
    ref = {}
    for f, text, toks in zip(_meta["file"], _texts, _toks):
        sents = [s for s in re.split(r"(?<=[.!?])\s+|\n+", text.strip()) if s.strip()]
        ref[f] = {"n_tokens": len(toks), "n_types": len(set(toks)), "ttr": len(set(toks)) / len(toks),
                  "n_sents": len(sents), "avg_word_len": sum(map(len, toks)) / len(toks),
                  "avg_sent_len": len(toks) / len(sents)}
    def good(col):
        return all(abs(float(d.loc[f, col]) - r[col]) < 1e-3 for f, r in ref.items())
    ok(good("n_tokens") and good("n_types"), "n_tokens и n_types посчитаны для каждого документа")
    ok(good("ttr"), "ttr = n_types / n_tokens для каждого документа")
    ok(good("n_sents"), "n_sents — число предложений по заданному правилу деления")
    ok(good("avg_word_len"), "avg_word_len — средняя длина токена")
    ok(good("avg_sent_len"), "avg_sent_len = n_tokens / n_sents")
`,
        hint: R`Предложения: \`[s for s in re.split(r"(?<=[.!?])\s+|\n+", text.strip()) if s.strip()]\`. Средняя длина слова: \`sum(len(t) for t in toks) / len(toks)\`.`,
        solution: R`def doc_stats(text):
    toks = re.findall(r"\w+", normalize(text).lower())
    sents = [s for s in re.split(r"(?<=[.!?])\s+|\n+", text.strip()) if s.strip()]
    return pd.Series({
        "n_tokens": len(toks),
        "n_types": len(set(toks)),
        "ttr": len(set(toks)) / len(toks),
        "n_sents": len(sents),
        "avg_word_len": sum(len(t) for t in toks) / len(toks),
        "avg_sent_len": len(toks) / len(sents),
    })

stats = df["text"].apply(doc_stats)
df = pd.concat([df, stats], axis=1)
df[["file", "category", "n_tokens", "n_types", "ttr", "n_sents", "avg_word_len", "avg_sent_len"]].sort_values("ttr")
`,
      },
      {
        id: "t6",
        title: "Статистика по категориям",
        setup: SETUP_DF + R`
df["tokens"] = df["text"].apply(lambda t: re.findall(r"\w+", normalize(t).lower()))
`,
        text: R`
В \`df\` уже есть столбец \`tokens\` — список токенов каждого документа.

Постройте таблицу \`cat_stats\` (индекс — \`category\`) со столбцами:
- \`docs\` — число документов категории;
- \`tokens\` — общее число токенов;
- \`types\` — число **уникальных** слов во всех текстах категории вместе;
- \`ttr\` — \`types / tokens\` (TTR объединённого текста категории, а **не** среднее TTR документов!).

Отсортируйте таблицу по \`tokens\` по убыванию и постройте столбчатую диаграмму числа токенов по категориям.
`,
        starter: R`import matplotlib.pyplot as plt

rows = []
for cat, group in df.groupby("category"):
    all_toks = ...      # все токены документов категории одним списком
    rows.append({"category": cat, "docs": ..., "tokens": ..., "types": ...})

cat_stats = pd.DataFrame(rows).set_index("category")
cat_stats["ttr"] = ...
cat_stats = ...

# диаграмма
...
cat_stats
`,
        check: CHECK_REF + R`
cs = var("cat_stats", pd.DataFrame)
ref = {}
for cat, toks in zip(_meta["category"], _toks):
    r = ref.setdefault(cat, {"docs": 0, "toks": []})
    r["docs"] += 1
    r["toks"] += toks
cats = set(ref)
ok(set(map(str, cs.index)) == cats, "Индекс cat_stats — все категории (" + str(len(cats)) + ")")
need = ["docs", "tokens", "types", "ttr"]
ok(all(c in cs.columns for c in need), "Есть столбцы docs, tokens, types, ttr")
if set(map(str, cs.index)) == cats and all(c in cs.columns for c in need):
    ok(all(int(cs.loc[c, "docs"]) == r["docs"] for c, r in ref.items()), "docs — число документов в категории")
    ok(all(int(cs.loc[c, "tokens"]) == len(r["toks"]) for c, r in ref.items()), "tokens — сумма токенов категории")
    ok(all(int(cs.loc[c, "types"]) == len(set(r["toks"])) for c, r in ref.items()), "types — уникальные слова всех текстов категории вместе")
    ok(all(abs(float(cs.loc[c, "ttr"]) - len(set(r["toks"])) / len(r["toks"])) < 1e-3 for c, r in ref.items()), "ttr = types / tokens для категории")
    ok(list(cs["tokens"]) == sorted(cs["tokens"], reverse=True), "Таблица отсортирована по tokens по убыванию")
ok(len(figs) >= 1, "Построена диаграмма")
`,
        hint: R`Все токены группы: \`[t for toks in group["tokens"] for t in toks]\`. Сортировка: \`cat_stats.sort_values("tokens", ascending=False)\`. Диаграмма: \`cat_stats["tokens"].plot(kind="bar")\` и \`plt.show()\`.`,
        solution: R`import matplotlib.pyplot as plt

rows = []
for cat, group in df.groupby("category"):
    all_toks = [t for toks in group["tokens"] for t in toks]
    rows.append({"category": cat, "docs": len(group), "tokens": len(all_toks), "types": len(set(all_toks))})

cat_stats = pd.DataFrame(rows).set_index("category")
cat_stats["ttr"] = cat_stats["types"] / cat_stats["tokens"]
cat_stats = cat_stats.sort_values("tokens", ascending=False)

cat_stats["tokens"].plot(kind="bar", figsize=(8, 4), color="#4c78a8", title="Объём категорий корпуса")
plt.ylabel("токенов")
plt.tight_layout()
plt.show()
cat_stats
`,
      },
      {
        id: "t7",
        title: "Сохранение корпуса: CSV и JSON Lines",
        setup: SETUP_DF + R`
import os
for _f in ["corpus_uz.csv", "corpus_uz.jsonl"]:
    if os.path.exists(_f):
        os.remove(_f)
`,
        text: R`
Сохраните подготовленный корпус для дальнейшей работы.

1. Замените столбец \`text\` в \`df\` его нормализованной версией (\`normalize\`) и добавьте столбец \`n_tokens\` (токены — как раньше, \`\w+\` после \`.lower()\`).
2. Сохраните \`df\` в \`corpus_uz.csv\` (без индекса).
3. Сохраните \`df\` в \`corpus_uz.jsonl\` в формате JSON Lines: \`orient="records", lines=True, force_ascii=False\`.
4. Прочитайте JSONL обратно в \`back\` (\`pd.read_json(..., lines=True)\`) и выведите размеры обоих файлов в байтах (\`os.path.getsize\`).
`,
        starter: R`import os

df["text"] = ...
df["n_tokens"] = ...

# 1) CSV
...
# 2) JSON Lines
...

back = ...
print("CSV:", os.path.getsize("corpus_uz.csv"), "байт")
print("JSONL:", os.path.getsize("corpus_uz.jsonl"), "байт")
back.head(3)
`,
        check: R`
import os, re, json
import pandas as pd
has_csv, has_jl = os.path.exists("corpus_uz.csv"), os.path.exists("corpus_uz.jsonl")
ok(has_csv, "Создан файл corpus_uz.csv")
ok(has_jl, "Создан файл corpus_uz.jsonl")
if has_csv:
    c = pd.read_csv("corpus_uz.csv")
    ok(len(c) == 16 and "text" in c.columns and "n_tokens" in c.columns, "В CSV 16 строк и столбцы text, n_tokens (без столбца индекса)")
    ok(not any(str(x).startswith("Unnamed") for x in c.columns), "CSV сохранён без индекса (index=False)")
if has_jl:
    raw = open("corpus_uz.jsonl", encoding="utf-8").read()
    lines = [l for l in raw.split("\n") if l.strip()]
    try:
        recs = [json.loads(l) for l in lines]
    except Exception:
        recs = []
    ok(len(recs) == 16 and all("text" in r and "n_tokens" in r for r in recs), "JSONL: 16 строк, каждая — JSON-объект с полями text и n_tokens")
    if recs:
        texts = [r["text"] for r in recs]
        ok(not any(ch in t for t in texts for ch in "'\u2018\u2019\u0060"), "Тексты нормализованы: остались только знаки ʻ и ʼ")
        ok(all(r["n_tokens"] == len(re.findall(r"\w+", r["text"].lower())) for r in recs), "n_tokens — число токенов нормализованного текста")
        ok("\u02bb" in raw and "\\u02bb" not in raw, "Файл записан с force_ascii=False (буква ʻ без \\u-экранирования)")
        b = var("back", pd.DataFrame)
        ok(len(b) == 16 and list(b["text"]) == texts, "back — корпус, прочитанный из JSONL")
`,
        hint: R`\`df.to_json("corpus_uz.jsonl", orient="records", lines=True, force_ascii=False)\`; число токенов: \`df["text"].str.lower().str.findall(r"\w+").str.len()\`.`,
        solution: R`import os

df["text"] = df["text"].apply(normalize)
df["n_tokens"] = df["text"].str.lower().str.findall(r"\w+").str.len()

df.to_csv("corpus_uz.csv", index=False)
df.to_json("corpus_uz.jsonl", orient="records", lines=True, force_ascii=False)

back = pd.read_json("corpus_uz.jsonl", lines=True)
print("Тексты совпадают:", (back["text"] == df["text"]).all())
print("CSV:", os.path.getsize("corpus_uz.csv"), "байт")
print("JSONL:", os.path.getsize("corpus_uz.jsonl"), "байт")
back.head(3)
`,
      },
    ],
    quiz: [
      { q: "В предложении «Kitob kitob emas, kitob — doʻst» сколько токенов и типов (без учёта регистра и пунктуации)?", options: ["5 токенов, 5 типов", "5 токенов, 3 типа", "3 токена, 5 типов", "4 токена, 3 типа"], answer: 1, explain: "Токены: kitob, kitob, emas, kitob, doʻst (5). Типы — уникальные: kitob, emas, doʻst (3)." },
      { q: "Что такое hapax legomena?", options: ["Самые частые слова корпуса", "Слова, встретившиеся в корпусе ровно один раз", "Стоп-слова", "Слова длиннее 10 букв"], answer: 1, explain: "Гапаксы — слова с частотой 1. В небольших корпусах они составляют большую часть словаря." },
      { q: "Почему нельзя напрямую сравнивать TTR короткого и длинного текста?", options: ["TTR не зависит от длины, сравнивать можно", "С ростом длины текста TTR обычно уменьшается: слова начинают повторяться", "TTR длинных текстов всегда больше 1", "TTR считается только для одного предложения"], answer: 1, explain: "Словарь растёт медленнее, чем число токенов (закон Хипса), поэтому TTR сравнивают на отрезках одинаковой длины." },
      { q: "Почему `re.findall(r\"\\w+\", \"o'zbek\")` возвращает `['o', 'zbek']`, а для «oʻzbek» с U+02BB — одно слово?", options: ["ASCII-апостроф — знак пунктуации, а ʻ (U+02BB) — буква-модификатор (категория Lm)", "U+02BB — это цифра", "Регулярные выражения не работают с ASCII", "Из-за кодировки файла"], answer: 0, explain: "\\w совпадает с буквами и цифрами Unicode; ʻ и ʼ относятся к категории Lm, а ' — к пунктуации (Po)." },
      { q: "Зачем писать `sorted(glob.glob(...))` при чтении корпуса?", options: ["glob работает только с отсортированным списком", "Порядок файлов в glob/listdir не гарантирован, а результаты должны быть воспроизводимыми", "Так быстрее", "Чтобы удалить дубликаты"], answer: 1, explain: "Порядок, который возвращает файловая система, может отличаться на разных компьютерах; без сортировки меняются порядок токенов и результаты." },
      { q: "Чем удобен формат JSON Lines для больших корпусов?", options: ["Он всегда меньше CSV", "Каждая строка — отдельный JSON-документ, файл можно читать и дописывать построчно", "Он хранит только числа", "Его можно открыть только в Spark"], answer: 1, explain: "JSONL читается потоково (по строке), его понимают pandas, Spark, HuggingFace datasets." },
    ],
    realEnv: R`
## Корпус в Jupyter и реальные узбекские ресурсы

В Anaconda (Jupyter Notebook) или Google Colab код занятия работает без изменений: скачайте репозиторий тренажёра и откройте блокнот в его корне, чтобы пути \`data/corpus_uz/...\` совпадали. Для работы с путями удобен модуль \`pathlib\`:

\`\`\`python
from pathlib import Path
corpus = {p.name: p.read_text(encoding="utf-8") for p in sorted(Path("data/corpus_uz").glob("uz_*.txt"))}
\`\`\`

**Большой корпус не нужно держать в памяти целиком.** Читайте его генератором и считайте статистику «на лету»:

\`\`\`python
from collections import Counter
freq = Counter()
for path in sorted(Path("my_corpus").rglob("*.txt")):
    with open(path, encoding="utf-8") as f:
        for line in f:                       # построчно
            freq.update(re.findall(r"\w+", normalize(line).lower()))
\`\`\`

### Где взять узбекские тексты

- **Википедия** на узбекском (uz.wikipedia.org): дампы статей на dumps.wikimedia.org;
- **Leipzig Corpora Collection** — готовые корпуса предложений и частотные списки для узбекского языка;
- многоязычные веб-корпуса **OSCAR** и **CC-100** содержат узбекскую часть;
- **HuggingFace Datasets** (huggingface.co/datasets, фильтр по языку *uz*): наборы новостей, книг, веб-текстов; загружаются библиотекой \`datasets\`, в том числе в потоковом режиме \`streaming=True\`;
- **Universal Dependencies** (universaldependencies.org) — размеченный трибанк узбекского языка в формате CoNLL-U (токены, леммы, части речи).

> [!TIP] Метаданные — сразу
> Собирая собственный корпус (например, новости сайтов kun.uz, gazeta.uz), сохраняйте вместе с текстом адрес, дату, рубрику и **письменность** (латиница/кириллица). Без метаданных позднее невозможно сравнивать подкорпуса.
`,
    homework: R`
**Тема для самостоятельной работы: «Перспективы применения технологий Big Data в компьютерной лингвистике».**

1. Соберите собственный мини-корпус из 20–30 узбекских текстов одного жанра (новости, отзывы, посты) с файлом метаданных.
2. Посчитайте для него все характеристики из занятия и сравните с учебным корпусом.
3. Напишите короткое эссе (1–2 страницы): какие задачи компьютерной лингвистики требуют корпусов в миллиарды токенов и какие технологии Big Data (HDFS, Spark, JSON Lines, потоковая обработка) для этого нужны.
`,
  });
})();
