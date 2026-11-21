/* П15. Сбор текстового корпуса на узбекском языке, его анализ и представление результатов. */
const P15_FETCH = R`import re, time, json, os
from collections import Counter
import requests
import pandas as pd
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def get_soup(url):
    """Скачать страницу (UTF-8) и вернуть BeautifulSoup."""
    r = requests.get(url)
    r.raise_for_status()
    r.encoding = "utf-8"
    return BeautifulSoup(r.text, "html.parser")
`;

const P15_LINKS = R`
links, url = [], SITE + "index.html"
while url:
    soup = get_soup(url)
    links += [urljoin(url, a["href"]) for a in soup.select("h2.news-title a")]
    nxt = soup.select_one("div.pagination a.next")
    url = urljoin(url, nxt["href"]) if nxt else None
`;

const P15_CORPUS = R`
def parse_article(url):
    s = get_soup(url)
    meta = s.select_one("div.meta")
    return {
        "url": url,
        "title": s.select_one("h1.article-title").get_text(strip=True),
        "category": meta.select_one("span.category").get_text(strip=True),
        "date": meta.select_one("time")["datetime"],
        "author": meta.select_one("span.author").get_text(strip=True),
        "views": int(re.search(r"\d+", meta.select_one("span.views").get_text()).group()),
        "text": "\n".join(p.get_text(strip=True) for p in s.select("div.article-body p")),
    }

corpus = pd.DataFrame([parse_article(u) for u in links])
`;

const P15_NORM = R`
def normalize(text):
    """Нижний регистр и единые апострофы: oʻ/gʻ (U+02BB), остальные — ʼ (U+02BC)."""
    text = text.lower()
    for ch in ["'", "\u2018", "\u2019", "\x60", "\u02bb"]:
        text = text.replace(ch, "\u02bc")
    return re.sub("([og])\u02bc", "\\1\u02bb", text)

def tokenize(text):
    return [w for w in re.findall(r"\w+", normalize(text)) if w.isalpha()]

stop = set(open("data/stopwords_uz.txt", encoding="utf-8").read().split())
`;

const P15_NLP = P15_NORM + R`
corpus["category"] = corpus["category"].apply(normalize)
corpus["tokens"] = corpus["text"].apply(tokenize)
corpus["n_tokens"] = corpus["tokens"].str.len()
corpus["n_types"] = corpus["tokens"].apply(lambda t: len(set(t)))
total_tokens = int(corpus["n_tokens"].sum())
vocab_size = len(set(w for t in corpus["tokens"] for w in t))
`;

const P15_STATS = R`
stats = corpus.groupby("category").agg(docs=("url", "count"), tokens=("n_tokens", "sum"))
stats["types"] = corpus.groupby("category")["tokens"].apply(lambda s: len(set(w for t in s for w in t)))
stats["avg_tokens"] = (stats["tokens"] / stats["docs"]).round(1)
stats = stats.sort_values("tokens", ascending=False)
content = Counter(w for t in corpus["tokens"] for w in t if w not in stop and len(w) >= 3)
top_words = content.most_common(15)
`;

/* Эталон для проверок: корпус из локальных файлов сайта (без сети). */
const P15_CHECK_REF = R`
import re, os
import pandas as pd
from bs4 import BeautifulSoup
from collections import Counter
SITE = ns["SITE"]
def local(path):
    return BeautifulSoup(open("data/site/" + path, encoding="utf-8").read(), "html.parser")
ref = {}
for f in sorted(os.listdir("data/site/article")):
    s = local("article/" + f)
    ref[SITE + "article/" + f] = {
        "title": s.select_one("h1.article-title").get_text(strip=True),
        "category": s.select_one("span.category").get_text(strip=True),
        "date": s.select_one("time")["datetime"],
        "views": int(re.search(r"\d+", s.select_one("span.views").get_text()).group()),
        "text": "\n".join(p.get_text(strip=True) for p in s.select("div.article-body p")),
    }
`;

BDT.register({
  id: "p15",
  kind: "practice",
  num: 15,
  title: "Сбор текстового корпуса на узбекском языке, его анализ и представление результатов исследования",
  hours: 2,
  env: ["python"],
  goals: [
    "Пройти полный цикл корпусного исследования: сбор → очистка → анализ → визуализация → отчёт",
    "Собрать с веб-сайта корпус узбекских текстов с метаданными (категория, дата, автор)",
    "Рассчитать корпусные показатели: токены, словарь, TTR, статистика по категориям, частотные слова",
    "Сохранить корпус в форматах JSON Lines и CSV и представить результаты в виде отчёта на Markdown",
  ],
  theory: R`
## Корпусное исследование как конвейер

**Текстовый корпус** — собранная по определённым правилам коллекция текстов с **метаданными** (источник, дата, автор, жанр/категория). Корпус — основной инструмент компьютерной лингвистики: на нём изучают лексику, обучают модели, проверяют гипотезы. Для узбекского языка готовых корпусов мало, поэтому умение собрать свой корпус особенно важно.

| Этап | Что делаем | Инструменты |
|---|---|---|
| 1. Сбор | обход сайта, извлечение текстов и метаданных | \`requests\`, \`BeautifulSoup\` |
| 2. Очистка | удаление рекламы и навигации, нормализация апострофов и регистра | \`re\`, \`str\` |
| 3. Токенизация | разбиение на слова | \`re.findall(r"\w+", ...)\` |
| 4. Анализ | объём, словарь, частоты, сравнение категорий | \`pandas\`, \`Counter\` |
| 5. Визуализация | диаграммы частот и объёмов | \`matplotlib\` |
| 6. Хранение | корпус в стандартном формате | JSON Lines, CSV |
| 7. Отчёт | цель, данные, методы, результаты, выводы | Markdown |

## Требования к корпусу

- **Репрезентативность**: тексты разных категорий, авторов и дат, а не 100 статей одной рубрики.
- **Метаданные** у каждого документа: \`url\`, \`title\`, \`category\`, \`date\`, \`author\` — без них нельзя сравнивать подкорпуса.
- **Чистота**: только основной текст (\`div.article-body p\`), без рекламы \`aside.ads\`, меню и подвала.
- **Единая орфография**: узбекские апострофы приводятся к стандарту — oʻ, gʻ (U+02BB) и ʼ (U+02BC).
- **Документация**: откуда и когда собраны тексты, на каких условиях их можно использовать.

## Корпусные показатели

| Показатель | Определение | Как посчитать |
|---|---|---|
| Токены (tokens) | все словоупотребления | \`len(tokens)\` |
| Типы (types), словарь | разные слова | \`len(set(tokens))\` |
| TTR (type/token ratio) | лексическое разнообразие | \`types / tokens\` |
| Гапаксы | слова, встретившиеся 1 раз | \`sum(1 for c in freq.values() if c == 1)\` |
| Средняя длина документа | токенов на текст | \`tokens / docs\` |

> [!NOTE] TTR зависит от объёма
> Чем больше текст, тем ниже TTR: частые слова повторяются, а новых становится всё меньше. Поэтому TTR сравнивают только для выборок одинакового размера.

## Статистика по подкорпусам

\`\`\`python
stats = corpus.groupby("category").agg(docs=("url", "count"),
                                       tokens=("n_tokens", "sum"))
stats["avg_tokens"] = (stats["tokens"] / stats["docs"]).round(1)
stats.sort_values("tokens", ascending=False)
\`\`\`

## Форматы хранения корпуса

| Формат | Плюсы | Минусы |
|---|---|---|
| CSV | открывается в Excel, компактный | неудобен для длинных текстов и списков |
| **JSON Lines** (\`.jsonl\`) | одна строка = один документ; дописывается построчно; читается потоково Spark, MongoDB, Hugging Face | не открывается в Excel |
| TXT + \`meta.csv\` | просто для ручного чтения | метаданные отдельно от текста |

\`\`\`python
corpus.to_json("corpus.jsonl", orient="records", lines=True, force_ascii=False)
back = pd.read_json("corpus.jsonl", lines=True)
\`\`\`

> [!WARNING] force_ascii=False
> По умолчанию pandas записывает не-ASCII символы как \`\u02bb\`. Файл остаётся корректным, но человек его не прочитает. С \`force_ascii=False\` узбекские буквы сохраняются как есть (в UTF-8).

## Отчёт об исследовании

Отчёт — это короткий документ, по которому коллега поймёт, что сделано и что получилось. Удобно собирать его автоматически из переменных с помощью f-строк, чтобы числа в отчёте всегда совпадали с расчётами:

\`\`\`python
report = f"""# Корпус узбекских новостей
## Данные
- Документов: {len(corpus)}
- Токенов: {total_tokens}
## Результаты
- Самая крупная категория: {stats.index[0]}
"""
open("report.md", "w", encoding="utf-8").write(report)
\`\`\`

Структура: **цель** → **данные** (источник, объём, период) → **методы** (очистка, токенизация, стоп-слова) → **результаты** (таблицы, графики, числа) → **выводы и ограничения** (маленький объём, одна редакция, неравные категории).
`,
  tasks: [
    {
      id: "t1",
      title: "Шаг 1. Список статей сайта",
      setup: P15_FETCH,
      text: R`
Начните сбор корпуса с учебного сайта \`SITE\`. Функция \`get_soup(url)\` уже определена.

Обойдите все страницы списка новостей, начиная с \`SITE + "index.html"\` и переходя по ссылке \`a.next\`:

- \`links\` — список **полных** адресов всех статей (16 штук, без повторов, в порядке появления);
- \`n_pages\` — сколько страниц списка вы посетили;
- между запросами — пауза \`time.sleep(0.05)\`.
`,
      starter: R`links = []
n_pages = 0
url = SITE + "index.html"

while url:
    soup = get_soup(url)
    n_pages += 1
    # добавьте в links полные адреса статей с этой страницы
    ...
    # перейдите на следующую страницу (или url = None)
    url = None
    time.sleep(0.05)

print(n_pages, "страницы,", len(links), "статей")
links[:3]
`,
      check: P15_CHECK_REF + R`
l = var("links", list)
ok(len(l) == 16, "В links 16 адресов статей")
ok(set(map(str, l)) == set(ref), "links — полные адреса вида SITE + 'article/<slug>.html' (urljoin)")
ok(len(set(map(str, l))) == len(l), "Адреса не повторяются")
ok(var("n_pages") == 3, "n_pages = 3: обойдены все страницы списка")
ok(uses("sleep"), "Есть вежливая пауза time.sleep")
`,
      hint: "`links += [urljoin(url, a[\"href\"]) for a in soup.select(\"h2.news-title a\")]`; следующая страница: `nxt = soup.select_one(\"a.next\")`, `url = urljoin(url, nxt[\"href\"]) if nxt else None`.",
      solution: R`links = []
n_pages = 0
url = SITE + "index.html"

while url:
    soup = get_soup(url)
    n_pages += 1
    links += [urljoin(url, a["href"]) for a in soup.select("h2.news-title a")]
    nxt = soup.select_one("div.pagination a.next")
    url = urljoin(url, nxt["href"]) if nxt else None
    time.sleep(0.05)

print(n_pages, "страницы,", len(links), "статей")
links[:3]
`,
    },
    {
      id: "t2",
      title: "Шаг 2. Корпус с метаданными",
      setup: P15_FETCH + P15_LINKS,
      text: R`
Список \`links\` (16 адресов) готов. Напишите функцию \`parse_article(url)\`, которая возвращает словарь:

| Ключ | Источник на странице статьи |
|---|---|
| \`url\` | адрес статьи |
| \`title\` | \`h1.article-title\` |
| \`category\`, \`author\` | \`span.category\`, \`span.author\` |
| \`date\` | атрибут \`datetime\` тега \`time\` |
| \`views\` | число из \`span.views\` (int) |
| \`text\` | абзацы \`div.article-body p\`, соединённые \`"\n"\` |

Соберите DataFrame \`corpus\` по всем статьям (с паузой \`time.sleep(0.05)\`) и выведите число документов и символов.
`,
      starter: R`def parse_article(url):
    s = get_soup(url)
    return {
        "url": url,
        "title": s.select_one("h1.article-title").get_text(strip=True),
        "category": ...,
        "date": ...,
        "author": ...,
        "views": ...,
        "text": ...,
    }

rows = []
for u in links:
    rows.append(parse_article(u))
    time.sleep(0.05)

corpus = pd.DataFrame(rows)
print(len(corpus), "документов,", corpus["text"].str.len().sum(), "символов")
corpus.head(3)
`,
      check: P15_CHECK_REF + R`
c = var("corpus", pd.DataFrame)
need = ["url", "title", "category", "date", "author", "views", "text"]
ok(len(c) == 16, "В corpus 16 документов")
ok(set(need) <= set(c.columns), "Столбцы: url, title, category, date, author, views, text")
if set(need) <= set(c.columns) and len(c) == 16:
    rows = [(ref.get(str(u)), r) for u, r in zip(c["url"], c.to_dict("records"))]
    ok(all(e is not None for e, _ in rows), "url — полные адреса статей")
    rows = [(e, r) for e, r in rows if e is not None]
    ok(all(r["title"] == e["title"] and r["category"] == e["category"] for e, r in rows), "title и category извлечены верно")
    ok(all(str(r["date"])[:10] == e["date"] for e, r in rows), "date — значение атрибута datetime")
    ok(all(isinstance(r["views"], int) and r["views"] == e["views"] for e, r in rows), "views — целое число просмотров")
    ok(all(" ".join(str(r["text"]).split()) == " ".join(e["text"].split()) for e, r in rows), "text — абзацы div.article-body без рекламы и навигации")
`,
      hint: "Внутри функции: `s.select_one(\"span.category\").get_text(strip=True)`, `s.select_one(\"time\")[\"datetime\"]`, `int(re.search(r\"\\d+\", s.select_one(\"span.views\").get_text()).group())`, `\"\\n\".join(p.get_text(strip=True) for p in s.select(\"div.article-body p\"))`.",
      solution: R`def parse_article(url):
    s = get_soup(url)
    return {
        "url": url,
        "title": s.select_one("h1.article-title").get_text(strip=True),
        "category": s.select_one("span.category").get_text(strip=True),
        "date": s.select_one("time")["datetime"],
        "author": s.select_one("span.author").get_text(strip=True),
        "views": int(re.search(r"\d+", s.select_one("span.views").get_text()).group()),
        "text": "\n".join(p.get_text(strip=True) for p in s.select("div.article-body p")),
    }

rows = []
for u in links:
    rows.append(parse_article(u))
    time.sleep(0.05)

corpus = pd.DataFrame(rows)
print(len(corpus), "документов,", corpus["text"].str.len().sum(), "символов")
corpus.head(3)
`,
    },
    {
      id: "t3",
      title: "Шаг 3. Нормализация и токенизация",
      setup: P15_FETCH + P15_LINKS + P15_CORPUS + R`
stop = set(open("data/stopwords_uz.txt", encoding="utf-8").read().split())
`,
      text: R`
DataFrame \`corpus\` собран (на сайте апострофы типографские: ‘ ’).

1. Напишите \`normalize(text)\`: нижний регистр; все варианты апострофа (\`'\`, ‘, ’, обратный апостроф, ʻ, ʼ) после **o** и **g** → ʻ (U+02BB), в остальных местах → ʼ (U+02BC).
2. Напишите \`tokenize(text)\` → список слов: \`re.findall(r"\w+", normalize(text))\`, только буквенные (\`w.isalpha()\`).
3. Нормализуйте столбец \`category\` (ta’lim → taʼlim) и добавьте столбцы \`tokens\`, \`n_tokens\` (число токенов), \`n_types\` (число разных слов).
4. Посчитайте \`total_tokens\`, \`vocab_size\` (разных слов во всём корпусе) и \`ttr = round(vocab_size / total_tokens, 3)\`.
`,
      starter: R`def normalize(text):
    text = text.lower()
    # 1) все апострофы -> "\u02bc";  2) после o/g -> "\u02bb"
    ...
    return text

def tokenize(text):
    return re.findall(r"\w+", normalize(text))

print(normalize("O‘zbekiston ta’limi: G'alaba!"))

corpus["category"] = corpus["category"].apply(normalize)
corpus["tokens"] = corpus["text"].apply(tokenize)
corpus["n_tokens"] = ...
corpus["n_types"] = ...

total_tokens = ...
vocab_size = ...
ttr = ...
print(total_tokens, vocab_size, ttr)
corpus[["title", "category", "n_tokens", "n_types"]]
`,
      check: P15_CHECK_REF + R`
def ref_normalize(text):
    text = text.lower()
    for ch in ["'", "\u2018", "\u2019", "\x60", "\u02bb"]:
        text = text.replace(ch, "\u02bc")
    return re.sub("([og])\u02bc", "\\1\u02bb", text)

def ref_tokenize(text):
    return [w for w in re.findall(r"\w+", ref_normalize(text)) if w.isalpha()]

f = var("normalize")
ok(callable(f) and f("O‘zbekiston G'alaba ta’lim BO" + chr(96) + "LDI") == "oʻzbekiston gʻalaba taʼlim boʻldi", "normalize: «O‘zbekiston G'alaba ta’lim BO\x60LDI» → «oʻzbekiston gʻalaba taʼlim boʻldi»")
ok(callable(f) and f("Sunʼiy maʻlumot") == "sunʼiy maʼlumot", "normalize: апостроф не после o/g → ʼ (U+02BC)")
tk = var("tokenize")
ok(callable(tk) and tk("2026-yil: O‘zbek tili!") == ["yil", "oʻzbek", "tili"], "tokenize оставляет только буквенные слова: «2026-yil: O‘zbek tili!» → ['yil', 'oʻzbek', 'tili']")
c = var("corpus", pd.DataFrame)
exp_tok = [ref_tokenize(t) for t in c["text"]] if "text" in c.columns else []
def col_as(name, conv):
    try:
        return [conv(x) for x in c[name]]
    except Exception:
        return None
ok("tokens" in c.columns and col_as("tokens", list) == exp_tok, "Столбец tokens — результат tokenize для каждого текста")
ok("n_tokens" in c.columns and col_as("n_tokens", int) == [len(t) for t in exp_tok], "n_tokens — число токенов")
ok("n_types" in c.columns and col_as("n_types", int) == [len(set(t)) for t in exp_tok], "n_types — число разных слов в документе")
ok("taʼlim" in set(c["category"]) and "ta’lim" not in set(c["category"]), "Категории нормализованы: taʼlim")
tt = sum(len(t) for t in exp_tok)
vs = len(set(w for t in exp_tok for w in t))
ok(var("total_tokens") == tt, f"total_tokens = {tt}")
ok(var("vocab_size") == vs, f"vocab_size = {vs}")
ok(var("ttr") == round(vs / tt, 3), f"ttr = {round(vs / tt, 3)}")
`,
      hint: "В normalize: `for ch in [\"'\", \"‘\", \"’\", \"\\x60\", \"ʻ\"]: text = text.replace(ch, \"ʼ\")`, затем `re.sub(\"([og])ʼ\", \"\\\\1ʻ\", text)`. В tokenize добавьте фильтр `if w.isalpha()`. Счётчики: `corpus[\"tokens\"].str.len()`, `corpus[\"tokens\"].apply(lambda t: len(set(t)))`.",
      solution: R`def normalize(text):
    text = text.lower()
    for ch in ["'", "\u2018", "\u2019", "\x60", "\u02bb"]:
        text = text.replace(ch, "\u02bc")
    return re.sub("([og])\u02bc", "\\1\u02bb", text)

def tokenize(text):
    return [w for w in re.findall(r"\w+", normalize(text)) if w.isalpha()]

print(normalize("O‘zbekiston ta’limi: G'alaba!"))

corpus["category"] = corpus["category"].apply(normalize)
corpus["tokens"] = corpus["text"].apply(tokenize)
corpus["n_tokens"] = corpus["tokens"].str.len()
corpus["n_types"] = corpus["tokens"].apply(lambda t: len(set(t)))

total_tokens = int(corpus["n_tokens"].sum())
vocab_size = len(set(w for t in corpus["tokens"] for w in t))
ttr = round(vocab_size / total_tokens, 3)
print(total_tokens, vocab_size, ttr)
corpus[["title", "category", "n_tokens", "n_types"]]
`,
    },
    {
      id: "t4",
      title: "Шаг 4. Статистика по категориям",
      setup: P15_FETCH + P15_LINKS + P15_CORPUS + P15_NLP,
      text: R`
В \`corpus\` есть нормализованные \`category\`, \`tokens\`, \`n_tokens\`, \`n_types\`.

Постройте таблицу \`stats\` (индекс — категория) со столбцами:

- \`docs\` — число документов;
- \`tokens\` — сумма токенов;
- \`types\` — число **разных** слов во всех текстах категории;
- \`avg_tokens\` — средняя длина документа в токенах (округлить до 1 знака).

Отсортируйте по \`tokens\` по убыванию. Какая категория крупнейшая? Почему сравнивать TTR категорий здесь некорректно?
`,
      starter: R`stats = corpus.groupby("category").agg(
    docs=("url", "count"),
    tokens=...,
)
stats["types"] = ...
stats["avg_tokens"] = ...
stats = stats.sort_values(...)
stats
`,
      check: R`
import pandas as pd
c = ns["corpus"]
s = var("stats", pd.DataFrame)
g = c.groupby("category")
ok(set(s.index) == set(c["category"]) and len(s) == 12, "stats: 12 строк — по одной на категорию")
ok({"docs", "tokens", "types", "avg_tokens"} <= set(s.columns), "Столбцы docs, tokens, types, avg_tokens")
if {"docs", "tokens", "types", "avg_tokens"} <= set(s.columns) and len(s) == 12:
    ok(all(int(s.loc[k, "docs"]) == len(v) for k, v in g), "docs — число документов категории")
    ok(all(int(s.loc[k, "tokens"]) == int(v["n_tokens"].sum()) for k, v in g), "tokens — сумма токенов категории")
    ok(all(int(s.loc[k, "types"]) == len(set(w for t in v["tokens"] for w in t)) for k, v in g), "types — число разных слов во всех текстах категории")
    ok(all(abs(float(s.loc[k, "avg_tokens"]) - round(v["n_tokens"].sum() / len(v), 1)) < 1e-9 for k, v in g), "avg_tokens — среднее число токенов на документ (1 знак)")
    ok(list(s["tokens"]) == sorted(s["tokens"], reverse=True), "Таблица отсортирована по tokens по убыванию")
`,
      hint: "`tokens=(\"n_tokens\", \"sum\")`; разные слова: `corpus.groupby(\"category\")[\"tokens\"].apply(lambda s: len(set(w for t in s for w in t)))`; `(stats[\"tokens\"] / stats[\"docs\"]).round(1)`; `sort_values(\"tokens\", ascending=False)`.",
      solution: R`stats = corpus.groupby("category").agg(
    docs=("url", "count"),
    tokens=("n_tokens", "sum"),
)
stats["types"] = corpus.groupby("category")["tokens"].apply(lambda s: len(set(w for t in s for w in t)))
stats["avg_tokens"] = (stats["tokens"] / stats["docs"]).round(1)
stats = stats.sort_values("tokens", ascending=False)
stats
`,
    },
    {
      id: "t5",
      title: "Шаг 5. Частотные слова и графики",
      setup: P15_FETCH + P15_LINKS + P15_CORPUS + P15_NLP + R`
stats = corpus.groupby("category").agg(docs=("url", "count"), tokens=("n_tokens", "sum")).sort_values("tokens", ascending=False)
`,
      text: R`
1. \`top_words\` — 15 самых частых **содержательных** слов корпуса (не из \`stop\`, длина ≥ 3): список пар \`(слово, частота)\`.
2. Рисунок 1×2:
   - слева — горизонтальная диаграмма \`top_words\` (самое частое слово вверху);
   - справа — столбчатая диаграмма числа токенов по категориям (\`stats["tokens"]\`).
3. Заголовки у обоих графиков, подписи осей с частотами/токенами. Сохраните рисунок в файл \`corpus_charts.png\` (\`fig.savefig\`).
`,
      starter: R`import matplotlib.pyplot as plt

content = Counter()
for toks in corpus["tokens"]:
    ...
top_words = content.most_common(15)
print(top_words[:5])

fig, axes = plt.subplots(1, 2, figsize=(14, 5))
# слева: barh по top_words
# справа: stats["tokens"].plot(kind="bar", ax=axes[1])
plt.tight_layout()
plt.show()
`,
      check: R`
import os
from collections import Counter
c = ns["corpus"]
st = ns["stop"]
exp = Counter(w for t in c["tokens"] for w in t if w not in st and len(w) >= 3)
tw = var("top_words", list)
ok(len(tw) == 15 and [int(n) for _, n in tw] == [n for _, n in exp.most_common(15)] and all(exp[w] == n for w, n in tw), "top_words — 15 самых частых слов без стоп-слов (длина ≥ 3)")
axs = figs[0].axes if figs else []
ok(len(axs) >= 2, "Рисунок из двух областей")
if len(axs) >= 2:
    a0, a1 = axs[0], axs[1]
    ok(len(a0.patches) == 15 and sorted(round(p.get_width()) for p in a0.patches) == sorted(n for _, n in exp.most_common(15)), "Слева — горизонтальная диаграмма 15 слов")
    if len(a0.patches) == 15:
        mx = max(p.get_width() for p in a0.patches)
        ok(max(p.get_y() for p in a0.patches if p.get_width() == mx) >= max(p.get_y() for p in a0.patches) - 1e-9, "Самое частое слово — вверху")
    ok(len(a1.patches) == 12, "Справа — 12 столбцов (категории)")
    ok(all(a.get_title() for a in (a0, a1)), "У обоих графиков есть заголовки")
ok(os.path.exists("corpus_charts.png") and uses("savefig"), "Рисунок сохранён в corpus_charts.png")
`,
      hint: "`content.update(w for w in toks if w not in stop and len(w) >= 3)`; слева: `words, counts = zip(*top_words[::-1])`, `axes[0].barh(words, counts)`; справа: `stats[\"tokens\"].plot(kind=\"bar\", ax=axes[1])`; `fig.savefig(\"corpus_charts.png\", dpi=150, bbox_inches=\"tight\")` — до `plt.show()`.",
      solution: R`import matplotlib.pyplot as plt

content = Counter()
for toks in corpus["tokens"]:
    content.update(w for w in toks if w not in stop and len(w) >= 3)
top_words = content.most_common(15)
print(top_words[:5])

fig, axes = plt.subplots(1, 2, figsize=(14, 5))
words, counts = zip(*top_words[::-1])
axes[0].barh(words, counts, color="teal")
axes[0].set_title("15 самых частых слов корпуса")
axes[0].set_xlabel("Частота")

stats["tokens"].plot(kind="bar", ax=axes[1], color="slateblue")
axes[1].set_title("Объём категорий")
axes[1].set_xlabel("Категория")
axes[1].set_ylabel("Токенов")
axes[1].tick_params(axis="x", rotation=45)

plt.tight_layout()
fig.savefig("corpus_charts.png", dpi=150, bbox_inches="tight")
plt.show()
`,
    },
    {
      id: "t6",
      title: "Шаг 6. Сохранение корпуса: JSON Lines и CSV",
      setup: P15_FETCH + P15_LINKS + P15_CORPUS + P15_NLP,
      text: R`
Сохраните корпус в двух форматах:

1. \`corpus_uz.jsonl\` — JSON Lines (\`orient="records", lines=True\`), **узбекские символы без экранирования** (\`force_ascii=False\`). Сохраните все столбцы, кроме \`tokens\`.
2. \`corpus_uz.csv\` — CSV без индекса, кодировка UTF-8, тоже без \`tokens\`.
3. Прочитайте JSON Lines обратно в \`back\` и убедитесь, что тексты совпадают. Выведите первую строку файла.
`,
      starter: R`out = corpus.drop(columns=["tokens"])

out.to_json("corpus_uz.jsonl", orient="records", lines=True)
# сохраните CSV

back = ...
print(len(back), "документов прочитано")
print(open("corpus_uz.jsonl", encoding="utf-8").readline()[:300])
`,
      check: R`
import os, json
import pandas as pd
c = ns["corpus"]
ok(os.path.exists("corpus_uz.jsonl"), "Создан файл corpus_uz.jsonl")
if os.path.exists("corpus_uz.jsonl"):
    lines = [l for l in open("corpus_uz.jsonl", encoding="utf-8").read().splitlines() if l.strip()]
    ok(len(lines) == 16, "В JSON Lines 16 строк — по одному документу на строку")
    try:
        recs = [json.loads(l) for l in lines]
    except Exception:
        recs = []
    ok(len(recs) == 16 and all({"url", "title", "category", "text"} <= set(r) for r in recs), "Каждая строка — JSON-объект с url, title, category, text")
    ok(len(recs) == 16 and all("tokens" not in r for r in recs), "Столбец tokens в файл не записан")
    raw = "\n".join(lines)
    ok("\\u" not in raw and ("‘" in raw or "ʻ" in raw), "Узбекские символы записаны как есть (force_ascii=False), без \\uXXXX")
ok(os.path.exists("corpus_uz.csv"), "Создан файл corpus_uz.csv")
if os.path.exists("corpus_uz.csv"):
    cs = pd.read_csv("corpus_uz.csv")
    ok(len(cs) == 16 and "text" in cs.columns and "tokens" not in cs.columns and "Unnamed: 0" not in cs.columns, "CSV: 16 строк, есть text, нет tokens и лишнего индекса")
b = var("back", pd.DataFrame)
ok(len(b) == 16 and "text" in b.columns and list(b["text"]) == list(c["text"]), "back — корпус, прочитанный из JSON Lines; тексты совпадают")
`,
      hint: "`out.to_json(\"corpus_uz.jsonl\", orient=\"records\", lines=True, force_ascii=False)`; `out.to_csv(\"corpus_uz.csv\", index=False, encoding=\"utf-8\")`; `back = pd.read_json(\"corpus_uz.jsonl\", lines=True)`.",
      solution: R`out = corpus.drop(columns=["tokens"])

out.to_json("corpus_uz.jsonl", orient="records", lines=True, force_ascii=False)
out.to_csv("corpus_uz.csv", index=False, encoding="utf-8")

back = pd.read_json("corpus_uz.jsonl", lines=True)
print(len(back), "документов прочитано")
print("Тексты совпадают:", (back["text"] == corpus["text"]).all())
print(open("corpus_uz.jsonl", encoding="utf-8").readline()[:300])
`,
    },
    {
      id: "t7",
      title: "Шаг 7. Отчёт об исследовании",
      setup: P15_FETCH + P15_LINKS + P15_CORPUS + P15_NLP + P15_STATS + R`
ttr = round(vocab_size / total_tokens, 3)
`,
      text: R`
Все результаты готовы: \`corpus\`, \`total_tokens\`, \`vocab_size\`, \`ttr\`, \`stats\` (по категориям, по убыванию токенов), \`top_words\` (15 пар «слово, частота»).

Сформируйте строку \`report\` в формате Markdown (через f-строку), чтобы числа подставлялись из переменных:

- заголовок первого уровня (\`# ...\`);
- не меньше трёх разделов второго уровня (\`## Данные\`, \`## Результаты\`, \`## Выводы\`);
- в отчёте: число документов и категорий, \`total_tokens\`, \`vocab_size\`, \`ttr\`, крупнейшая категория (\`stats.index[0]\`) и **топ-3 слова**;
- не меньше трёх пунктов списка (\`- ...\`).

Сохраните отчёт в \`report.md\` и выведите его.
`,
      starter: R`top3 = ", ".join(w for w, _ in top_words[:3])

report = f"""# Корпус ...

## Данные
- Источник: учебный сайт «Talaba Yangiliklari»
- Документов: ...

## Результаты
...

## Выводы
...
"""

print(report)
`,
      check: R`
import os
rep = var("report", str)
tt, vs, tr = ns["total_tokens"], ns["vocab_size"], ns["ttr"]
st, tw, c = ns["stats"], ns["top_words"], ns["corpus"]
def has_num(n):
    return any(x in rep for x in {str(n), f"{n:,}", f"{n:,}".replace(",", " ")})
ok(rep.lstrip().startswith("# "), "Отчёт начинается с заголовка первого уровня «# »")
ok(sum(1 for l in rep.splitlines() if l.startswith("## ")) >= 3, "Не меньше трёх разделов «## »")
ok(sum(1 for l in rep.splitlines() if l.lstrip().startswith(("- ", "* "))) >= 3, "Не меньше трёх пунктов списка")
ok(has_num(len(c)) and has_num(c["category"].nunique()), "Указаны число документов (16) и категорий (12)")
ok(has_num(tt), f"Указано число токенов ({tt})")
ok(has_num(vs), f"Указан размер словаря ({vs})")
ok(str(tr) in rep, f"Указан TTR ({tr})")
ok(str(st.index[0]) in rep, f"Названа крупнейшая категория ({st.index[0]})")
ok(all(w in rep for w, _ in tw[:3]), "Перечислены топ-3 слова: " + ", ".join(w for w, _ in tw[:3]))
ok(os.path.exists("report.md") and open("report.md", encoding="utf-8").read() == rep, "Отчёт сохранён в report.md")
`,
      hint: "Подставляйте значения в f-строку: `{len(corpus)}`, `{corpus['category'].nunique()}`, `{total_tokens}`, `{vocab_size}`, `{ttr}`, `{stats.index[0]}`, `{top3}`. Сохранение: `open(\"report.md\", \"w\", encoding=\"utf-8\").write(report)`.",
      solution: R`top3 = ", ".join(w for w, _ in top_words[:3])
biggest = stats.index[0]

report = f"""# Корпус узбекских новостей «Talaba Yangiliklari»

## Данные
- Источник: учебный сайт «Talaba Yangiliklari» (3 страницы списка, веб-скрейпинг)
- Документов: {len(corpus)}, категорий: {corpus['category'].nunique()}
- Период: {corpus['date'].min()} — {corpus['date'].max()}

## Методы
- Извлечение текста из div.article-body p без рекламы
- Нормализация регистра и апострофов (oʻ, gʻ, ʼ), токенизация регулярным выражением
- Удаление стоп-слов при частотном анализе

## Результаты
- Токенов: {total_tokens}, словарь: {vocab_size} слов, TTR = {ttr}
- Крупнейшая категория: {biggest} ({stats.loc[biggest, 'tokens']} токенов, {stats.loc[biggest, 'docs']} док.)
- Самые частые слова: {top3}

## Выводы
- Корпус небольшой и неравномерный: в 8 категориях всего по одной статье
- Частотные слова отражают тематику сайта (образование, город, технологии)
- Для надёжных выводов корпус нужно расширить до тысяч документов
"""

open("report.md", "w", encoding="utf-8").write(report)
print(report)
`,
    },
  ],
  quiz: [
    { q: "Что такое метаданные корпуса?", options: ["Самые частые слова", "Сведения о каждом документе: источник, дата, автор, категория", "Стоп-слова", "Размер файла"], answer: 1, explain: "Метаданные позволяют делить корпус на подкорпуса и сравнивать их (по категориям, авторам, годам)." },
    { q: "В тексте 1000 токенов и 400 разных слов. Чему равен TTR?", options: ["2.5", "0.4", "600", "1400"], answer: 1, explain: "TTR = types / tokens = 400 / 1000 = 0.4." },
    { q: "Почему нельзя напрямую сравнивать TTR категории из 1 статьи и категории из 50 статей?", options: ["TTR падает с ростом объёма текста", "TTR не зависит от объёма", "TTR считается только для английского", "Можно, это корректно"], answer: 0, explain: "Частые слова повторяются, новых слов становится всё меньше, поэтому у большого подкорпуса TTR ниже. Сравнивают выборки одинакового размера." },
    { q: "Чем удобен формат JSON Lines для корпуса?", options: ["Открывается в Excel", "Одна строка = один документ: файл можно дописывать и читать потоково (Spark, MongoDB, Hugging Face)", "Он сжимает текст в 10 раз", "Не требует кодировки"], answer: 1 },
    { q: "Зачем `force_ascii=False` в `to_json`?", options: ["Чтобы файл был меньше и читался человеком: ʻ, ʼ и кириллица сохраняются как есть, а не как \\uXXXX", "Чтобы удалить апострофы", "Чтобы записать CSV", "Без него будет ошибка"], answer: 0 },
    { q: "Какой порядок разделов отчёта об исследовании правильный?", options: ["Выводы → Данные → Цель → Методы", "Цель → Данные → Методы → Результаты → Выводы", "Результаты → Цель → Методы", "Методы → Выводы → Данные"], answer: 1 },
  ],
  realEnv: R`
## Собственный корпус в Jupyter

1. Создайте проект: \`corpus_project/\` с подпапками \`raw/\` (скачанные HTML), \`data/\` (corpus.jsonl), \`reports/\` (графики и report.md) и блокнотом \`corpus.ipynb\`.
2. Кэшируйте HTML: сохраняйте каждую страницу в \`raw/\` и при повторном запуске читайте с диска — так вы не нагружаете сайт во время отладки.
3. Соблюдайте robots.txt, делайте паузы 1–3 с, сохраняйте \`url\` и дату сбора для каждого документа.

\`\`\`python
import pathlib, hashlib
def cached_get(url):
    path = pathlib.Path("raw") / (hashlib.md5(url.encode()).hexdigest() + ".html")
    if path.exists():
        return path.read_text(encoding="utf-8")
    r = requests.get(url, timeout=10); r.encoding = "utf-8"
    path.write_text(r.text, encoding="utf-8")
    time.sleep(2)
    return r.text
\`\`\`

## Масштабирование

- Тысячи сайтов и миллионы страниц собирают **Scrapy** (экспорт сразу в JSON Lines: \`scrapy crawl news -O corpus.jsonl\`).
- Корпус в JSON Lines загружается в **MongoDB** (\`mongoimport --file corpus.jsonl\`), в **HDFS** (\`hdfs dfs -put\`) и читается **Spark** (\`spark.read.json("corpus.jsonl")\`) — частоты считаются распределённо.
- Для лемматизации и морфологического анализа узбекского языка изучите открытые инструменты (например, UzMorphAnalyser) и корпуса проекта Uzbek NLP.
- Отчёт удобно оформить прямо в Jupyter (Markdown-ячейки + графики) и экспортировать: **File → Save and Export Notebook As → HTML/PDF**.
`,
  homework: R`
## Самостоятельная работа

1. Расширьте корпус: добавьте тексты из \`data/corpus_uz/\` и \`data/news_raw.csv\` (после очистки), объедините с собранными статьями без дубликатов и пересчитайте показатели.
2. Посчитайте число гапаксов и постройте кривую роста словаря (число разных слов в зависимости от числа токенов) — закон Хипса.
3. Подготовьте доклад на 5 минут по теме «Перспективы применения технологий Big Data в компьютерной лингвистике» на примере вашего корпуса: какие задачи (поиск, классификация, языковые модели) можно решать на корпусе в 1000 раз большем.
`,
});
