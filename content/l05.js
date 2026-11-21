/* Л5. Очистка и нормализация больших объёмов текстовых данных */
(function () {
  const LOAD = R`import re, html, time
import pandas as pd
from collections import Counter

raw = pd.read_csv("data/news_raw.csv")
`;
  const NORMALIZE = R`
def normalize(text):
    """Все варианты апострофа -> канонические: oʻ/gʻ (U+02BB) и ʼ (U+02BC)."""
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)
`;
  const CLEAN = NORMALIZE + R`
TAG = re.compile(r"<[^>]+>")                                                  # HTML-теги
BOILER = re.compile(r"\(manba:[^)]*\)|Batafsil:|YANGILIK:", re.IGNORECASE)   # служебные фразы
URL = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)                     # ссылки
HASHTAG = re.compile(r"#\w+")                                                 # хештеги
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")                   # эмодзи

def clean_text(text):
    """Полная очистка одного текста (эталон задания 3)."""
    if not isinstance(text, str):
        return ""
    text = html.unescape(text)
    for rx in (TAG, BOILER, URL, HASHTAG, EMOJI):
        text = rx.sub(" ", text)
    text = normalize(text).lower()
    return re.sub(r"\s+", " ", text).strip()
`;
  // «Перепосты»: те же новости с другим оформлением (для поиска нечётких дубликатов)
  const REPOSTS = R`
_ok = raw["raw_text"].notna() & ~raw["raw_text"].fillna("").str.contains("&") & (raw["raw_text"].fillna("").str.len() > 30)
_src = raw[_ok].drop_duplicates("raw_text").sample(20, random_state=5)
_noise = [lambda t: "<p>" + t.upper() + "</p> " + chr(0x1F525),
          lambda t: "  " + t.replace("'", "\u2019") + "  #yangilik",
          lambda t: "<div>" + t + "</div> https://t.me/uz_news",
          lambda t: t.lower() + " " + chr(0x1F60A)]
_rep = _src.copy()
_rep["raw_text"] = [_noise[i % 4](t) for i, t in enumerate(_src["raw_text"])]
_rep["id"] = range(2001, 2001 + len(_rep))
_rep["source"] = "repost"
news = pd.concat([raw, _rep], ignore_index=True)
`;
  // Эталон для проверок (отдельные имена, чтобы не путать с переменными студента)
  const REF = R`
import re, html
import pandas as pd
from collections import Counter
_TAG = re.compile(r"<[^>]+>")
_BOILER = re.compile(r"\(manba:[^)]*\)|Batafsil:|YANGILIK:", re.IGNORECASE)
_URL = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
_HASH = re.compile(r"#\w+")
_EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")
def _norm(text):
    text = re.sub(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", text)
    return re.sub(r"['\u2018\u2019\u0060]", "\u02bc", text)
def _clean(text):
    if not isinstance(text, str):
        return ""
    text = html.unescape(text)
    for rx in (_TAG, _BOILER, _URL, _HASH, _EMOJI):
        text = rx.sub(" ", text)
    return re.sub(r"\s+", " ", _norm(text).lower()).strip()
_raw = pd.read_csv("data/news_raw.csv")
`;
  const BIG = R`
big = raw.sample(100_000, replace=True, random_state=42).reset_index(drop=True)
`;

  BDT.register({
    id: "l05",
    kind: "lab",
    num: 5,
    title: "Очистка и нормализация больших объемов текстовых данных",
    hours: 4,
    env: ["python"],
    goals: [
      "Очищать «грязные» тексты из веба и соцсетей: HTML-теги и сущности, ссылки, хештеги, эмодзи, служебные фразы",
      "Нормализовать регистр, пробелы и апострофы, удалять пустые строки, точные и нечёткие дубликаты",
      "Транслитерировать узбекский текст с кириллицы на латиницу по официальным правилам",
      "Обрабатывать 100 000 строк эффективно: векторные методы `.str`, обработка уникальных значений, чтение по частям",
    ],
    theory: R`
## Откуда берётся «грязь»

Тексты для Big Data собирают с сайтов, из Telegram-каналов и соцсетей. В них много того, что мешает анализу. Файл \`data/news_raw.csv\` (столбцы id, source, date, raw_text) содержит типичные проблемы:

| Проблема | Пример из данных | Решение |
|---|---|---|
| HTML-теги и сущности | \`<p>\`, \`<b>YANGILIK:</b>\`, \`&nbsp;\` | \`html.unescape\` + регулярка или BeautifulSoup |
| ссылки | \`Batafsil: https://t.me/...\` | \`https?://\S+\` и \`www\.\S+\` |
| хештеги, эмодзи | \`#yangilik\`, 👍 🔥 | \`#\w+\`, диапазоны Unicode эмодзи |
| служебные фразы | \`(manba: www.talaba-news.uz)\` | список шаблонов для источника |
| регистр, пробелы | \`SUN'IY  INTELLEKT\`, табуляция | \`.lower()\`, \`\s+\` → пробел |
| апострофы | o'zbek / o‘zbek / oʻzbek | нормализация к ʻ и ʼ |
| пустые строки, дубликаты | \`""\`, \`"   "\`, повторы, перепосты | фильтр и \`drop_duplicates\` |
| другая письменность | Ўзбек тили… | транслитерация |

## Порядок шагов важен

\`\`\`python
def clean_text(text):
    if not isinstance(text, str):          # NaN -> ""
        return ""
    text = html.unescape(text)              # 1. &nbsp; &amp; -> символы
    for rx in (TAG, BOILER, URL, HASHTAG, EMOJI):
        text = rx.sub(" ", text)            # 2. мусор -> ПРОБЕЛ (не пустая строка!)
    text = normalize(text).lower()          # 3. апострофы, регистр
    return re.sub(r"\s+", " ", text).strip()  # 4. пробелы — в самом конце
\`\`\`

- Служебные фразы удаляются **до** ссылок: шаблон \`(manba: ...)\` содержит адрес, и если сначала удалить ссылку, останется обрывок «(manba: ».
- Мусор заменяется **пробелом**, иначе слова склеятся: \`<p>Salom</p><p>Dunyo\` → «SalomDunyo».
- Пробелы схлопываются **последними**: после удаления тегов и эмодзи остаются лишние пробелы. Шаблон \`\s\` в Python понимает и неразрывный пробел \`\xa0\`, который получается из \`&nbsp;\`.

### Регулярные выражения или BeautifulSoup?

\`BeautifulSoup(text, "html.parser").get_text(" ")\` корректно разбирает любой HTML, включая вложенные и «сломанные» теги, комментарии, скрипты. Регулярка \`<[^>]+>\` намного быстрее, но ошибается на сложной разметке (например, \`>\` внутри атрибута). Для коротких фрагментов из соцсетей хватает регулярки; для целых веб-страниц используйте парсер.

## Дубликаты: точные и нечёткие

\`\`\`python
df = df[df["clean"] != ""]                        # пустые после очистки
df = df.drop_duplicates(subset="raw_text")        # точные копии
df = df.drop_duplicates(subset="clean")           # совпадают после нормализации
\`\`\`

**Нечёткие дубликаты** (перепосты с другим оформлением) находятся только после нормализации: «<p>BU YANGILIK 🔥» и «bu yangilik #news» дают одинаковый \`clean\`. На миллиардах документов сравнивают не строки, а **хеши** (\`hashlib.md5(clean)\`), а похожие, но не одинаковые тексты ищут методами **MinHash / LSH**.

## Транслитерация кириллица → латиница

Официальный алфавит 1995 года (с правками): большинство букв переводится один к одному, особые случаи:

| Кириллица | Латиница | Кириллица | Латиница |
|---|---|---|---|
| ў | oʻ | ш | sh |
| ғ | gʻ | ч | ch |
| қ | q | ё / ю / я | yo / yu / ya |
| ҳ | h | х | x |
| ъ | ʼ | ь | (не пишется) |
| **е** | **ye** в начале слова и после гласной, иначе **e** | **ц** | **ts** после гласной, иначе **s** |

*Ер → Yer, поезд → poyezd, келди → keldi; Транслитерация → Transliteratsiya, цирк → sirk.* Заглавная буква даёт заглавную первую букву сочетания: *Ш → Sh, Ў → Oʻ*.

## Масштаб: 100 000 строк и больше

| Способ | Идея | Скорость |
|---|---|---|
| цикл \`for i, row in df.iterrows()\` | построчно, с созданием объекта Series на каждую строку | очень медленно |
| \`s.apply(f)\` / \`s.map(f)\` | функция Python для каждого значения | приемлемо |
| \`s.str.replace(...)\`, \`s.str.lower()\` | «векторные» строковые методы pandas | так же или немного быстрее, короче код |
| **\`unique\` + \`map(dict)\`** | обработать только уникальные тексты и разнести результат | в десятки раз быстрее при повторах |

> [!NOTE] Строки в pandas — не numpy
> Для чисел векторные операции выполняются в C и ускоряют код в сотни раз. Строки (тип object) pandas всё равно обрабатывает циклом Python, поэтому \`.str\` даёт удобство, а не чудо-скорость. Настоящее ускорение — не делать лишнюю работу: в потоках соцсетей много повторов (репосты, шаблонные сообщения), и чистить каждый уникальный текст достаточно **один раз**.

Если данные не помещаются в память, читайте их **по частям** и обрабатывайте генератором:

\`\`\`python
def clean_chunks(path, chunksize=20_000):
    for chunk in pd.read_csv(path, chunksize=chunksize):   # не весь файл сразу
        chunk["clean"] = chunk["raw_text"].map(clean_text)
        yield chunk                                         # отдаём часть и «засыпаем»

for i, chunk in enumerate(clean_chunks("big.csv")):
    chunk.to_csv("clean.csv", mode="a", header=(i == 0), index=False)
\`\`\`

Так же устроены Spark и Dask: данные делятся на **партиции**, каждая обрабатывается независимо, а результат собирается в конце.
`,
    tasks: [
      {
        id: "t1",
        title: "Осмотр грязных данных",
        text: R`
Прочитайте \`data/news_raw.csv\` в \`raw\` и оцените масштаб проблем в столбце \`raw_text\`. Посчитайте число строк:

- \`n_rows\` — всего;
- \`n_empty\` — пустых: NaN или только пробельные символы;
- \`n_html\` — с HTML-тегом (шаблон \`<[^>]+>\`);
- \`n_urls\` — со ссылкой (\`https?://\` или \`www.\`);
- \`n_emoji\` — с эмодзи (шаблон \`EMOJI_RE\` в стартовом коде);
- \`n_cyr\` — с кириллицей (шаблон \`CYR_RE\`);
- \`n_dup\` — полных дубликатов текста (\`duplicated(subset="raw_text")\`).

Для поиска используйте \`raw["raw_text"].str.contains(шаблон, na=False)\`.
`,
        starter: R`import pandas as pd

EMOJI_RE = "[\U0001F300-\U0001FAFF\u2600-\u27BF]"     # диапазоны эмодзи
CYR_RE = "[а-яёўқғҳА-ЯЁЎҚҒҲ]"                          # кириллица с узбекскими буквами

raw = ...
text = raw["raw_text"]

n_rows = ...
n_empty = ...
n_html = ...
n_urls = ...
n_emoji = ...
n_cyr = ...
n_dup = ...

report = pd.Series({"строк": n_rows, "пустых": n_empty, "с HTML": n_html, "со ссылками": n_urls,
                    "с эмодзи": n_emoji, "кириллица": n_cyr, "дубликатов": n_dup})
print(report)
raw.head(10)
`,
        check: R`
import pandas as pd
raw = pd.read_csv("data/news_raw.csv")
t = raw["raw_text"]
r = var("raw", pd.DataFrame)
ok(len(r) == len(raw) and "raw_text" in r.columns, "raw — таблица из data/news_raw.csv")
ok(var("n_rows") == len(raw), "n_rows — число строк")
ok(var("n_empty") == int(t.fillna("").str.strip().eq("").sum()), "n_empty — NaN или строки только из пробелов")
ok(var("n_html") == int(t.str.contains(r"<[^>]+>", na=False).sum()), "n_html — строки с HTML-тегами")
ok(var("n_urls") == int(t.str.contains(r"https?://|www\.", na=False).sum()), "n_urls — строки со ссылками")
ok(var("n_emoji") == int(t.str.contains("[\U0001F300-\U0001FAFF\u2600-\u27BF]", na=False).sum()), "n_emoji — строки с эмодзи")
ok(var("n_cyr") == int(t.str.contains("[а-яёўқғҳА-ЯЁЎҚҒҲ]", na=False).sum()), "n_cyr — строки с кириллицей")
ok(var("n_dup") == int(raw.duplicated(subset="raw_text").sum()), "n_dup — полные дубликаты raw_text")
`,
        hint: R`Пустые: \`text.fillna("").str.strip().eq("").sum()\`. Ссылки: \`text.str.contains(r"https?://|www\.", na=False).sum()\`. \`na=False\` нужен, чтобы NaN считались как «нет совпадения».`,
        solution: R`import pandas as pd

EMOJI_RE = "[\U0001F300-\U0001FAFF\u2600-\u27BF]"     # диапазоны эмодзи
CYR_RE = "[а-яёўқғҳА-ЯЁЎҚҒҲ]"                          # кириллица с узбекскими буквами

raw = pd.read_csv("data/news_raw.csv")
text = raw["raw_text"]

n_rows = len(raw)
n_empty = int(text.fillna("").str.strip().eq("").sum())
n_html = int(text.str.contains(r"<[^>]+>", na=False).sum())
n_urls = int(text.str.contains(r"https?://|www\.", na=False).sum())
n_emoji = int(text.str.contains(EMOJI_RE, na=False).sum())
n_cyr = int(text.str.contains(CYR_RE, na=False).sum())
n_dup = int(raw.duplicated(subset="raw_text").sum())

report = pd.Series({"строк": n_rows, "пустых": n_empty, "с HTML": n_html, "со ссылками": n_urls,
                    "с эмодзи": n_emoji, "кириллица": n_cyr, "дубликатов": n_dup})
print(report)
raw.head(10)
`,
      },
      {
        id: "t2",
        title: "HTML: регулярное выражение или BeautifulSoup",
        setup: LOAD,
        text: R`
Напишите две функции удаления HTML (таблица \`raw\` уже загружена):

1. \`strip_html_re(text)\`: \`html.unescape\` (превращает \`&nbsp;\` и другие сущности в символы), затем каждый тег \`<...>\` заменяется **пробелом**, затем пробельные символы схлопываются в один пробел и обрезаются по краям (удобно: \`" ".join(text.split())\`).
2. \`strip_html_bs(text)\`: \`BeautifulSoup(text, "html.parser").get_text(" ")\` и такое же схлопывание пробелов.

Примените обе к \`raw["raw_text"].fillna("")\`: результаты — Series \`html_re\` и \`html_bs\`; \`n_same\` — в скольких строках они совпали.
`,
        starter: R`from bs4 import BeautifulSoup

def strip_html_re(text):
    text = html.unescape(text)
    text = ...
    return ...

def strip_html_bs(text):
    text = BeautifulSoup(text, "html.parser").get_text(" ")
    return ...

sample = "<p>Salom&nbsp;<b>dunyo</b>!</p>"
print(repr(strip_html_re(sample)), repr(strip_html_bs(sample)))

texts = raw["raw_text"].fillna("")
html_re = ...
html_bs = ...
n_same = ...
print("Совпадают:", n_same, "из", len(texts))
html_re.head(10)
`,
        check: REF + R`
f1, f2 = var("strip_html_re"), var("strip_html_bs")
s = "<p>Salom&nbsp;<b>dunyo</b>!</p>"
ok(f1(s) in ("Salom dunyo !", "Salom dunyo!"), "strip_html_re удаляет теги и &nbsp;")
ok(f2(s) in ("Salom dunyo !", "Salom dunyo!"), "strip_html_bs удаляет теги и &nbsp;")
ok(f1('<div class="text">Bir  ikki</div>' + chr(9) + "uch ") == "Bir ikki uch", "strip_html_re заменяет теги пробелом, схлопывает пробелы и обрезает края")
hr, hb = var("html_re", pd.Series), var("html_bs", pd.Series)
ok(len(hr) == len(_raw) and len(hb) == len(_raw), "html_re и html_bs — по значению на каждую строку raw")
def bad(s):
    return s.str.contains("<[^>]+>|&nbsp;|" + chr(160) + "|  ", regex=True).any()
ok(not bad(hr) and not bad(hb), "В результатах нет тегов, &nbsp;, неразрывных и двойных пробелов")
exp = [re.findall(r"\w+", _TAG.sub(" ", html.unescape(t))) for t in _raw["raw_text"].fillna("")]
ok(all(re.findall(r"\w+", a) == e for a, e in zip(hr, exp)), "Текст после удаления HTML не потерян и не склеен")
ok(var("n_same") == int((hr == hb).sum()), "n_same — число строк, где оба способа дали одинаковый результат")
`,
        hint: R`Регулярка: \`re.sub(r"<[^>]+>", " ", text)\`. Схлопывание: \`" ".join(text.split())\` — \`split()\` без аргументов делит по любым пробелам, включая неразрывный. Применение: \`texts.map(strip_html_re)\`; совпадения: \`(html_re == html_bs).sum()\`.`,
        solution: R`from bs4 import BeautifulSoup

def strip_html_re(text):
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split())

def strip_html_bs(text):
    text = BeautifulSoup(text, "html.parser").get_text(" ")
    return " ".join(text.split())

sample = "<p>Salom&nbsp;<b>dunyo</b>!</p>"
print(repr(strip_html_re(sample)), repr(strip_html_bs(sample)))

texts = raw["raw_text"].fillna("")
html_re = texts.map(strip_html_re)
html_bs = texts.map(strip_html_bs)
n_same = int((html_re == html_bs).sum())
print("Совпадают:", n_same, "из", len(texts))
html_re.head(10)
`,
      },
      {
        id: "t3",
        title: "Функция полной очистки clean_text",
        setup: LOAD + NORMALIZE,
        text: R`
Соберите функцию \`clean_text(text)\`. Регулярные выражения уже даны в стартовом коде, функция \`normalize\` — в подготовленном. Порядок шагов:

1. не строка (NaN) → вернуть \`""\`;
2. \`html.unescape\`;
3. заменить **пробелом** по очереди: теги \`TAG\`, служебные фразы \`BOILER\`, ссылки \`URL\`, хештеги \`HASHTAG\`, эмодзи \`EMOJI\`;
4. \`normalize\` (апострофы) и \`.lower()\`;
5. схлопнуть пробельные символы в один пробел, обрезать края.

Примените функцию ко всей таблице: \`raw["clean"] = raw["raw_text"].map(clean_text)\`.
`,
        starter: R`TAG = re.compile(r"<[^>]+>")                                                  # HTML-теги
BOILER = re.compile(r"\(manba:[^)]*\)|Batafsil:|YANGILIK:", re.IGNORECASE)   # служебные фразы
URL = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)                     # ссылки
HASHTAG = re.compile(r"#\w+")                                                 # хештеги
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")                   # эмодзи

def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = html.unescape(text)
    ...
    return text

tests = ['<p>Toshkentdagi  "Milliy"  stadionida o\u0060tgan uchrashuv. #yangilik ' + chr(0x1F44D) + "</p>",
         "<b>YANGILIK:</b> SUN\u2019IY INTELLEKT FANLARI. Batafsil: https://t.me/yangiliklar_uz",
         "&nbsp;Bu yil hosil mo\u2018l bo\u2018ladi (manba: www.talaba-news.uz)"]
for t in tests:
    print(repr(clean_text(t)))

raw["clean"] = ...
raw[["raw_text", "clean"]].head(15)
`,
        check: REF + R`
f = var("clean_text")
O, T = "\u02bb", "\u02bc"
ok(f('<p>Toshkentdagi  "Milliy"  stadionida o\u0060tgan uchrashuv. #yangilik ' + chr(0x1F44D) + "</p>") == 'toshkentdagi "milliy" stadionida o' + O + "tgan uchrashuv.", "Удаляются теги, хештеги, эмодзи; апострофы нормализуются; регистр нижний; пробелы схлопнуты")
ok(f("<b>YANGILIK:</b> SUN\u2019IY INTELLEKT FANLARI. Batafsil: https://t.me/yangiliklar_uz") == "sun" + T + "iy intellekt fanlari.", "Удаляются служебные фразы YANGILIK:/Batafsil: и ссылки")
ok(f("&nbsp;Bu yil hosil mo\u2018l bo\u2018ladi (manba: www.talaba-news.uz)") == "bu yil hosil mo" + O + "l bo" + O + "ladi", "Удаляются &nbsp; и «(manba: ...)» целиком, без обрывков")
ok(f(float("nan")) == "" and f(chr(0x1F44D) * 3) == "", "NaN и строка из одних эмодзи дают пустую строку")
r = var("raw", pd.DataFrame)
ok("clean" in r.columns and len(r) == len(_raw), "В raw добавлен столбец clean")
if "clean" in r.columns and len(r) == len(_raw):
    c = r["clean"].fillna("")
    ok(all(re.findall(r"\w+", a) == re.findall(r"\w+", _clean(b)) for a, b in zip(c, _raw["raw_text"])), "Столбец clean совпадает с эталонной очисткой (по словам)")
    ok((c == c.str.lower()).all() and not c.str.contains(r"<|http|www\.|#|  |['\u2018\u2019\u0060]", regex=True).any(), "В clean нет заглавных букв, тегов, ссылок, хештегов, ASCII-апострофов и двойных пробелов")
`,
        hint: R`Цикл по шаблонам: \`for rx in (TAG, BOILER, URL, HASHTAG, EMOJI): text = rx.sub(" ", text)\`. Затем \`text = normalize(text).lower()\` и \`re.sub(r"\s+", " ", text).strip()\`.`,
        solution: R`TAG = re.compile(r"<[^>]+>")                                                  # HTML-теги
BOILER = re.compile(r"\(manba:[^)]*\)|Batafsil:|YANGILIK:", re.IGNORECASE)   # служебные фразы
URL = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)                     # ссылки
HASHTAG = re.compile(r"#\w+")                                                 # хештеги
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")                   # эмодзи

def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = html.unescape(text)
    for rx in (TAG, BOILER, URL, HASHTAG, EMOJI):
        text = rx.sub(" ", text)
    text = normalize(text).lower()
    text = re.sub(r"\s+", " ", text).strip()
    return text

tests = ['<p>Toshkentdagi  "Milliy"  stadionida o\u0060tgan uchrashuv. #yangilik ' + chr(0x1F44D) + "</p>",
         "<b>YANGILIK:</b> SUN\u2019IY INTELLEKT FANLARI. Batafsil: https://t.me/yangiliklar_uz",
         "&nbsp;Bu yil hosil mo\u2018l bo\u2018ladi (manba: www.talaba-news.uz)"]
for t in tests:
    print(repr(clean_text(t)))

raw["clean"] = raw["raw_text"].map(clean_text)
raw[["raw_text", "clean"]].head(15)
`,
      },
      {
        id: "t4",
        title: "Пустые строки, точные и нечёткие дубликаты",
        setup: LOAD + CLEAN + REPOSTS,
        text: R`
В таблицу \`news\` к исходным данным добавлены 20 «перепостов» (\`source == "repost"\`): те же новости, но с другим HTML, регистром, апострофами, эмодзи и ссылками. Функция \`clean_text\` уже определена.

Выполните дедупликацию строго в таком порядке и посчитайте, сколько строк удалил каждый шаг:

1. \`news["clean"]\` = \`clean_text\` от \`raw_text\`;
2. удалить строки с пустым \`clean\` → \`n_empty\`;
3. удалить точные дубликаты по \`raw_text\` (оставляя первое вхождение) → \`n_dup_exact\`;
4. удалить дубликаты по \`clean\` → \`n_dup_norm\`; результат — \`news_dedup\`;
5. \`n_reposts_caught\` — сколько из удалённых на шаге 4 строк — перепосты.
`,
        starter: R`news["clean"] = ...

step1 = news[...]
n_empty = len(news) - len(step1)

step2 = ...
n_dup_exact = ...

news_dedup = ...
n_dup_norm = ...

removed = step2[step2.duplicated(subset="clean")]
n_reposts_caught = ...

print(f"Было {len(news)}: пустых {n_empty}, точных дублей {n_dup_exact}, нечётких {n_dup_norm} -> осталось {len(news_dedup)}")
print("Найдено перепостов:", n_reposts_caught)
removed[["source", "raw_text", "clean"]].head(8)
`,
        check: REF + R`
raw = _raw
` + REPOSTS + R`
news["clean"] = news["raw_text"].map(_clean)
s1 = news[news["clean"] != ""]
s2 = s1.drop_duplicates(subset="raw_text")
s3 = s2.drop_duplicates(subset="clean")
rem = s2[s2.duplicated(subset="clean")]
ok(var("n_empty") == len(news) - len(s1), "n_empty — строки, ставшие пустыми после очистки")
ok(var("n_dup_exact") == len(s1) - len(s2), "n_dup_exact — точные дубликаты raw_text (после удаления пустых)")
ok(var("n_dup_norm") == len(s2) - len(s3), "n_dup_norm — дубликаты, найденные только после нормализации")
nd = var("news_dedup", pd.DataFrame)
ok(len(nd) == len(s3) and set(nd["id"]) == set(s3["id"]), f"news_dedup — {len(s3)} уникальных новостей (первые вхождения)")
ok(var("n_reposts_caught") == int((rem["source"] == "repost").sum()), "n_reposts_caught — перепосты среди удалённых на последнем шаге")
`,
        hint: R`\`step1 = news[news["clean"] != ""]\`; \`step2 = step1.drop_duplicates(subset="raw_text")\`; \`news_dedup = step2.drop_duplicates(subset="clean")\`. Перепосты: \`(removed["source"] == "repost").sum()\`.`,
        solution: R`news["clean"] = news["raw_text"].map(clean_text)

step1 = news[news["clean"] != ""]
n_empty = len(news) - len(step1)

step2 = step1.drop_duplicates(subset="raw_text")
n_dup_exact = len(step1) - len(step2)

news_dedup = step2.drop_duplicates(subset="clean")
n_dup_norm = len(step2) - len(news_dedup)

removed = step2[step2.duplicated(subset="clean")]
n_reposts_caught = int((removed["source"] == "repost").sum())

print(f"Было {len(news)}: пустых {n_empty}, точных дублей {n_dup_exact}, нечётких {n_dup_norm} -> осталось {len(news_dedup)}")
print("Найдено перепостов:", n_reposts_caught)
removed[["source", "raw_text", "clean"]].head(8)
`,
      },
      {
        id: "t5",
        title: "Транслитерация: кириллица → латиница",
        setup: LOAD,
        text: R`
Напишите функцию \`cyr2lat(text)\` по официальным правилам (таблица в теории). Допишите словарь \`CYR2LAT\` (буквы ў, ғ, қ, ҳ, ш, ч, ё, ю, я) и обработайте особые случаи:

- **е** → \`ye\` в начале слова (предыдущий символ — не буква), после гласной (\`VOWELS\`) и после ъ/ь; иначе \`e\`;
- **ц** → \`ts\` после гласной, иначе \`s\`;
- заглавная кириллическая буква → первая буква латинского сочетания заглавная (Ш → Sh, Ў → Oʻ);
- остальные символы (латиница, цифры, пунктуация) не меняются.

Затем:
- \`lat_texts\` — словарь \`{имя_файла: латинский текст}\` для файлов \`data/corpus_cyr/*.txt\`;
- \`n_cyr_rows\` — число строк \`raw\` с кириллицей; \`raw["text_lat"]\` — \`cyr2lat\` от \`raw_text\` (NaN → \`""\`).
`,
        starter: R`import glob, os

OK, TUTUQ = "\u02bb", "\u02bc"
CYR2LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ж": "j", "з": "z", "и": "i", "й": "y",
    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
    "у": "u", "ф": "f", "х": "x", "э": "e", "ъ": TUTUQ, "ь": "",
    # допишите: ў, ғ, қ, ҳ, ш, ч, ё, ю, я   (е и ц обрабатываются отдельно)
}
VOWELS = "аеёиоуэюяў"

def cyr2lat(text):
    out = []
    for i, ch in enumerate(text):
        low = ch.lower()
        prev = text[i - 1].lower() if i > 0 else " "
        if low == "е":
            lat = ...
        elif low == "ц":
            lat = ...
        elif low in CYR2LAT:
            lat = CYR2LAT[low]
        else:
            out.append(ch)          # не кириллица — без изменений
            continue
        if ch != low and lat:       # заглавная буква
            lat = ...
        out.append(lat)
    return "".join(out)

for w in ["Ўзбекистон", "ғалаба", "Ёшлар", "поезд", "келди", "Транслитерация", "цирк", "маъно"]:
    print(w, "->", cyr2lat(w))

lat_texts = ...
n_cyr_rows = ...
raw["text_lat"] = ...
print(lat_texts["ozbek_tili_raqamli.txt"])
`,
        check: R`
import glob, os, re
import pandas as pd
O, T = "\u02bb", "\u02bc"
f = var("cyr2lat")
battery = {"Ўзбекистон": "O" + O + "zbekiston", "ғалаба": "g" + O + "alaba", "Ёшлар": "Yoshlar", "қишлоқ": "qishloq",
           "ҳаёт": "hayot", "Шаҳар": "Shahar", "Чой": "Choy", "юлдуз": "yulduz", "маъно": "ma" + T + "no", "мебель": "mebel"}
ok(all(f(k) == v for k, v in battery.items()), "Буквы ў, ғ, ё, қ, ҳ, ш, ч, ю, ъ, ь и заглавные переводятся по таблице")
ok(f("ер") == "yer" and f("Ер") == "Yer" and f("поезд") == "poyezd" and f("келди") == "keldi" and f("съезд") == "s" + T + "yezd", "е → ye в начале слова, после гласной и после ъ; иначе e")
ok(f("Транслитерация") == "Transliteratsiya" and f("цирк") == "sirk", "ц → ts после гласной, иначе s")
ok(f("IT-park, 2026 yil!") == "IT-park, 2026 yil!", "Латиница, цифры и пунктуация не меняются")
TAB = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
       "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "э": "e", "ъ": T, "ь": "",
       "ў": "o" + O, "ғ": "g" + O, "қ": "q", "ҳ": "h", "ш": "sh", "ч": "ch", "ё": "yo", "ю": "yu", "я": "ya"}
V = "аеёиоуэюяў"
def ref(text):
    out = []
    for i, ch in enumerate(text):
        low = ch.lower()
        prev = text[i - 1].lower() if i > 0 else " "
        if low == "е":
            lat = "ye" if (not prev.isalpha() or prev in V or prev in "ъь") else "e"
        elif low == "ц":
            lat = "ts" if prev in V else "s"
        elif low in TAB:
            lat = TAB[low]
        else:
            out.append(ch)
            continue
        if ch != low and lat:
            lat = lat[0].upper() + lat[1:]
        out.append(lat)
    return "".join(out)
files = sorted(glob.glob("data/corpus_cyr/*.txt"))
lt = var("lat_texts", dict)
ok(set(lt) == {os.path.basename(p) for p in files}, "lat_texts — ключи: имена файлов из data/corpus_cyr")
ok(all(lt.get(os.path.basename(p)) == ref(open(p, encoding="utf-8").read()) for p in files), "Тексты транслитерированы целиком и верно")
CYR = "[а-яёўқғҳА-ЯЁЎҚҒҲ]"
raw = pd.read_csv("data/news_raw.csv")
has = raw["raw_text"].str.contains(CYR, na=False)
ok(var("n_cyr_rows") == int(has.sum()), "n_cyr_rows — строки raw с кириллицей")
r = var("raw", pd.DataFrame)
ok("text_lat" in r.columns and not r["text_lat"].fillna("").str.contains(CYR).any(), "В raw['text_lat'] не осталось кириллицы")
if "text_lat" in r.columns:
    ok((r.loc[~has, "text_lat"].fillna("") == raw.loc[~has, "raw_text"].fillna("")).all(), "Строки на латинице в text_lat не изменились")
`,
        hint: R`Для е: \`"ye" if (not prev.isalpha() or prev in VOWELS or prev in "ъь") else "e"\`; для ц: \`"ts" if prev in VOWELS else "s"\`. Заглавная: \`lat[0].upper() + lat[1:]\`. Файлы: \`{os.path.basename(p): cyr2lat(open(p, encoding="utf-8").read()) for p in sorted(glob.glob("data/corpus_cyr/*.txt"))}\`.`,
        solution: R`import glob, os

OK, TUTUQ = "\u02bb", "\u02bc"
CYR2LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ж": "j", "з": "z", "и": "i", "й": "y",
    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
    "у": "u", "ф": "f", "х": "x", "э": "e", "ъ": TUTUQ, "ь": "",
    "ў": "o" + OK, "ғ": "g" + OK, "қ": "q", "ҳ": "h", "ш": "sh", "ч": "ch", "ё": "yo", "ю": "yu", "я": "ya",
}
VOWELS = "аеёиоуэюяў"

def cyr2lat(text):
    out = []
    for i, ch in enumerate(text):
        low = ch.lower()
        prev = text[i - 1].lower() if i > 0 else " "
        if low == "е":
            lat = "ye" if (not prev.isalpha() or prev in VOWELS or prev in "ъь") else "e"
        elif low == "ц":
            lat = "ts" if prev in VOWELS else "s"
        elif low in CYR2LAT:
            lat = CYR2LAT[low]
        else:
            out.append(ch)          # не кириллица — без изменений
            continue
        if ch != low and lat:       # заглавная буква
            lat = lat[0].upper() + lat[1:]
        out.append(lat)
    return "".join(out)

for w in ["Ўзбекистон", "ғалаба", "Ёшлар", "поезд", "келди", "Транслитерация", "цирк", "маъно"]:
    print(w, "->", cyr2lat(w))

lat_texts = {}
for path in sorted(glob.glob("data/corpus_cyr/*.txt")):
    with open(path, encoding="utf-8") as f:
        lat_texts[os.path.basename(path)] = cyr2lat(f.read())

CYR_RE = "[а-яёўқғҳА-ЯЁЎҚҒҲ]"
n_cyr_rows = int(raw["raw_text"].str.contains(CYR_RE, na=False).sum())
raw["text_lat"] = raw["raw_text"].fillna("").map(cyr2lat)
print(lat_texts["ozbek_tili_raqamli.txt"])
`,
      },
      {
        id: "t6",
        title: "100 000 строк: apply, .str и уникальные значения",
        setup: LOAD + CLEAN + BIG,
        text: R`
В \`big\` — 100 000 строк (выборка с повторами из \`news_raw\`, как реальный поток постов, где тексты часто повторяются). Функция \`clean_text\` и шаблоны \`TAG, BOILER, URL, HASHTAG, EMOJI\` уже определены. Сравните три способа очистки столбца \`big["raw_text"]\` и замерьте время каждого (\`time.perf_counter()\`):

1. \`res_apply\` — \`.map(clean_text)\` для каждой строки; время — \`t_apply\`;
2. \`res_vec\` — функция \`clean_vec(s)\`, которая делает те же шаги **только методами \`.str\`** (\`fillna\`, \`.str.replace(..., regex=True)\`, \`.str.lower()\`, \`.str.strip()\`); сущности вида \`&nbsp;\` замените пробелом шаблоном \`&\w+;\`; время — \`t_vec\`;
3. \`res_unique\` — очистить только **уникальные** тексты (\`unique()\`), сложить результаты в словарь и разнести через \`.map(словарь)\`; время — \`t_unique\`.

Результаты должны совпадать. Выведите время и ускорение \`t_apply / t_unique\`.
`,
        starter: R`s = big["raw_text"]
print("Строк:", len(s), "уникальных текстов:", s.nunique())

t0 = time.perf_counter()
res_apply = ...
t_apply = time.perf_counter() - t0

def clean_vec(s):
    s = s.fillna("")
    s = s.str.replace(r"&\w+;", " ", regex=True)
    for rx in (TAG, BOILER, URL, HASHTAG, EMOJI):
        s = ...
    s = s.str.replace(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", regex=True)
    s = ...                      # остальные апострофы -> ʼ
    s = ...                      # нижний регистр
    s = ...                      # пробелы
    return s

t0 = time.perf_counter()
res_vec = clean_vec(s)
t_vec = time.perf_counter() - t0

t0 = time.perf_counter()
uniq = s.fillna("").unique()
mapping = ...
res_unique = ...
t_unique = time.perf_counter() - t0

print(f"apply: {t_apply:.2f} c, .str: {t_vec:.2f} c, unique+map: {t_unique:.3f} c")
print("Совпадают:", (res_apply == res_vec).mean(), (res_apply == res_unique).all())
print(f"Ускорение unique+map: в {t_apply / t_unique:.0f} раз")
`,
        check: REF + R`
raw = _raw
` + BIG + R`
vc = big["raw_text"].fillna("")
m = {x: _clean(x) for x in vc.unique()}
exp = vc.map(m)
ra, rv, ru = var("res_apply", pd.Series), var("res_vec", pd.Series), var("res_unique", pd.Series)
ok(len(ra) == len(big) and (ra.values == exp.values).all(), "res_apply — clean_text для каждой из 100 000 строк")
ok(len(rv) == len(big) and (rv.values == ra.values).mean() >= 0.99, "res_vec совпадает с res_apply (не меньше 99 % строк)")
ok(uses(".str.replace") and uses(".str.lower"), "clean_vec использует векторные методы .str")
ok(len(ru) == len(big) and (ru.values == ra.values).all(), "res_unique совпадает с res_apply")
ok(uses("unique("), "Использованы уникальные значения (unique)")
ta, tv, tu = var("t_apply"), var("t_vec"), var("t_unique")
ok(all(isinstance(x, float) and x > 0 for x in (ta, tv, tu)), "t_apply, t_vec, t_unique — измеренное время в секундах")
ok(tu < ta, "Способ unique + map быстрее, чем apply для каждой строки")
`,
        hint: R`В цикле: \`s = s.str.replace(rx, " ", regex=True)\` (можно передавать скомпилированный шаблон). Апострофы: \`s.str.replace(r"['\u2018\u2019\u0060]", "\u02bc", regex=True)\`. Пробелы: \`s.str.replace(r"\s+", " ", regex=True).str.strip()\`. Словарь: \`{t: clean_text(t) for t in uniq}\`, затем \`s.fillna("").map(mapping)\`.`,
        solution: R`s = big["raw_text"]
print("Строк:", len(s), "уникальных текстов:", s.nunique())

t0 = time.perf_counter()
res_apply = s.map(clean_text)
t_apply = time.perf_counter() - t0

def clean_vec(s):
    s = s.fillna("")
    s = s.str.replace(r"&\w+;", " ", regex=True)
    for rx in (TAG, BOILER, URL, HASHTAG, EMOJI):
        s = s.str.replace(rx, " ", regex=True)
    s = s.str.replace(r"([oOgG])['\u2018\u2019\u0060]", lambda m: m.group(1) + "\u02bb", regex=True)
    s = s.str.replace(r"['\u2018\u2019\u0060]", "\u02bc", regex=True)
    s = s.str.lower()
    s = s.str.replace(r"\s+", " ", regex=True).str.strip()
    return s

t0 = time.perf_counter()
res_vec = clean_vec(s)
t_vec = time.perf_counter() - t0

t0 = time.perf_counter()
uniq = s.fillna("").unique()
mapping = {t: clean_text(t) for t in uniq}
res_unique = s.fillna("").map(mapping)
t_unique = time.perf_counter() - t0

print(f"apply: {t_apply:.2f} c, .str: {t_vec:.2f} c, unique+map: {t_unique:.3f} c")
print("Совпадают:", (res_apply == res_vec).mean(), (res_apply == res_unique).all())
print(f"Ускорение unique+map: в {t_apply / t_unique:.0f} раз")
`,
      },
      {
        id: "t7",
        title: "Обработка по частям: chunksize и генератор",
        setup: LOAD + CLEAN + R`
import os
if not os.path.exists("news_100k.csv"):          # файл ~12 МБ, 100 000 строк
    raw.sample(100_000, replace=True, random_state=42).to_csv("news_100k.csv", index=False)
if os.path.exists("news_100k_clean.csv"):
    os.remove("news_100k_clean.csv")
`,
        text: R`
Представьте, что файл \`news_100k.csv\` (100 000 строк) не помещается в память. Обработайте его по частям.

1. Напишите **генератор** \`clean_chunks(path, chunksize=20_000)\`: читает файл через \`pd.read_csv(path, chunksize=chunksize)\`, в каждой части добавляет столбец \`clean\` (используйте приём «уникальные значения + map» из прошлого задания) и отдаёт часть через \`yield\`.
2. Пройдите по всем частям и:
   - посчитайте \`n_chunks\` и \`n_rows\`;
   - накопите частоты слов \`word_freq\` (\`Counter\`) по токенам \`\w+\` столбца \`clean\`;
   - допишите столбцы \`id\` и \`clean\` каждой части в \`news_100k_clean.csv\` (\`mode="a"\`, заголовок только у первой части, без индекса).
3. Выведите 10 самых частых слов.
`,
        starter: R`def clean_chunks(path, chunksize=20_000):
    for chunk in ...:
        texts = chunk["raw_text"].fillna("")
        mapping = ...
        chunk["clean"] = ...
        ...

n_chunks = 0
n_rows = 0
word_freq = Counter()
for i, chunk in enumerate(clean_chunks("news_100k.csv")):
    n_chunks += 1
    n_rows += ...
    words = chunk["clean"].str.findall(r"\w+").explode().dropna()
    word_freq.update(...)
    ...                      # дописать chunk[["id", "clean"]] в news_100k_clean.csv

print("Частей:", n_chunks, "строк:", n_rows)
print(word_freq.most_common(10))
`,
        check: REF + R`
import os
ok(uses("yield") and uses("chunksize"), "clean_chunks — генератор (yield), файл читается по частям (chunksize)")
ok(var("n_chunks") == 5, "n_chunks = 5 (100 000 строк по 20 000)")
ok(var("n_rows") == 100000, "n_rows = 100 000")
vc = pd.read_csv("news_100k.csv", usecols=["raw_text"])["raw_text"].fillna("").value_counts()
ref = Counter()
for txt, c in vc.items():
    for w in re.findall(r"\w+", _clean(txt)):
        ref[w] += c
wf = var("word_freq")
ok(dict(wf) == dict(ref), "word_freq — частоты слов по всему файлу (сумма по частям)")
ok(os.path.exists("news_100k_clean.csv"), "Создан файл news_100k_clean.csv")
if os.path.exists("news_100k_clean.csv"):
    bc = pd.read_csv("news_100k_clean.csv")
    ok(list(bc.columns) == ["id", "clean"] and len(bc) == 100000, "В news_100k_clean.csv один заголовок и 100 000 строк со столбцами id, clean")
`,
        hint: R`Генератор: \`for chunk in pd.read_csv(path, chunksize=chunksize): ... yield chunk\`. Частоты: \`word_freq.update(words.value_counts().to_dict())\`. Запись: \`chunk[["id", "clean"]].to_csv("news_100k_clean.csv", mode="a", header=(i == 0), index=False)\`.`,
        solution: R`def clean_chunks(path, chunksize=20_000):
    for chunk in pd.read_csv(path, chunksize=chunksize):
        texts = chunk["raw_text"].fillna("")
        mapping = {t: clean_text(t) for t in texts.unique()}
        chunk["clean"] = texts.map(mapping)
        yield chunk

n_chunks = 0
n_rows = 0
word_freq = Counter()
for i, chunk in enumerate(clean_chunks("news_100k.csv")):
    n_chunks += 1
    n_rows += len(chunk)
    words = chunk["clean"].str.findall(r"\w+").explode().dropna()
    word_freq.update(words.value_counts().to_dict())
    chunk[["id", "clean"]].to_csv("news_100k_clean.csv", mode="a", header=(i == 0), index=False)

print("Частей:", n_chunks, "строк:", n_rows)
print(word_freq.most_common(10))
`,
      },
    ],
    quiz: [
      { q: "Почему при удалении тегов их заменяют пробелом, а не пустой строкой?", options: ["Так быстрее", "Иначе слова из соседних тегов склеятся: <p>Salom</p><p>Dunyo → SalomDunyo", "Пустую строку нельзя передать в re.sub", "Чтобы сохранить HTML"], answer: 1, explain: "Теги часто стоят между словами без пробелов, поэтому их заменяют пробелом, а лишние пробелы схлопывают в конце." },
      { q: "Что делает `html.unescape(\"Bu&nbsp;yil &amp; keyin\")`?", options: ["Удаляет все теги", "Заменяет сущности символами: неразрывный пробел и &", "Переводит текст в нижний регистр", "Ничего"], answer: 1, explain: "html.unescape заменяет HTML-сущности символами: &nbsp; — неразрывный пробел (\\xa0), &amp; — знак &. Теги при этом остаются." },
      { q: "Какие дубликаты находит `drop_duplicates(subset=\"clean\")`, но не находит `drop_duplicates(subset=\"raw_text\")`?", options: ["Никакие", "Тексты, отличающиеся только оформлением: регистром, тегами, эмодзи, апострофами", "Пустые строки", "Тексты на кириллице"], answer: 1, explain: "Это нечёткие дубликаты (перепосты): после нормализации они становятся одинаковыми." },
      { q: "Как транслитерируется «поезд» по официальным правилам?", options: ["poezd", "poyezd", "poyozd", "pojezd"], answer: 1, explain: "е после гласной о передаётся как ye." },
      { q: "Почему приём «unique + map» так ускоряет очистку 100 000 постов?", options: ["Он использует GPU", "Каждый уникальный текст очищается один раз, а повторы получают готовый результат из словаря", "Он пропускает часть строк", "Он не использует регулярные выражения"], answer: 1, explain: "В потоке 100 000 постов всего около 170 уникальных текстов: дорогая очистка выполняется 170 раз вместо 100 000." },
      { q: "Зачем `pd.read_csv(..., chunksize=20000)`?", options: ["Чтобы прочитать только первые 20 000 строк", "Чтобы читать файл частями и не держать его в памяти целиком", "Чтобы ускорить запись", "Чтобы удалить дубликаты"], answer: 1, explain: "Функция возвращает итератор по частям (DataFrame по 20 000 строк)." },
    ],
    realEnv: R`
## Очистка текстов в реальных проектах

В Jupyter (Anaconda) или Colab код лабораторной работает без изменений. Для настоящих объёмов полезны:

- **Строки на Apache Arrow** в pandas: \`df["text"].astype("string[pyarrow]")\` — компактнее в памяти, многие методы \`.str\` выполняются в C++ (нужен пакет \`pyarrow\`).
- **Dask** — тот же API pandas, но с партициями и параллельной обработкой: \`dd.read_csv("posts-*.csv").raw_text.map(clean_text)\`.
- **PySpark** — очистка на кластере функциями \`regexp_replace\`, \`lower\`, \`trim\`, \`dropDuplicates\`:

\`\`\`python
from pyspark.sql import functions as F
df = spark.read.csv("hdfs:///data/news_raw/*.csv", header=True)
clean = (df.withColumn("t", F.regexp_replace("raw_text", "<[^>]+>", " "))
           .withColumn("t", F.regexp_replace("t", "https?://\\S+", " "))
           .withColumn("t", F.lower(F.trim(F.regexp_replace("t", "\\s+", " "))))
           .dropDuplicates(["t"]))
\`\`\`

- **Нечёткие дубликаты** на миллионах документов ищут MinHash + LSH (библиотека \`datasketch\`), а точные — по хешу нормализованного текста.
- Специализированные пакеты: \`ftfy\` (исправляет «кракозябры» после неправильной кодировки), \`emoji\` (полный список эмодзи), транслитераторы узбекского языка на PyPI и GitHub.

> [!TIP] Сохраняйте и сырые, и чистые данные
> Конвейер очистки меняется: завтра понадобится сохранить эмодзи для анализа тональности. Храните исходный \`raw_text\` и версию конвейера рядом с результатом.
`,
    homework: R`
**Тема для самостоятельной работы: «Методы очистки больших объёмов данных».**

1. Сравните скорость регулярных выражений и BeautifulSoup на 10 000 HTML-страниц (сгенерируйте их или скачайте), сделайте вывод, когда что применять.
2. Реализуйте поиск нечётких дубликатов через хеширование нормализованного текста (\`hashlib.md5\`) и оцените, сколько памяти экономит хранение хешей вместо строк.
3. Напишите обратную транслитерацию латиница → кириллица и проверьте, что \`lat2cyr(cyr2lat(text)) == text\` для текстов \`data/corpus_cyr\`. Какие случаи неоднозначны (например, sh — это ш или с+ҳ)?
`,
  });
})();
