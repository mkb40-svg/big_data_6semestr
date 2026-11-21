/* П5. Web Scraping: сбор текстов с учебного новостного сайта «Talaba Yangiliklari». */
const P05_SOUP = R`import time
import requests
import pandas as pd
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def get_soup(url):
    """Скачать страницу и вернуть объект BeautifulSoup."""
    r = requests.get(url)
    r.raise_for_status()
    r.encoding = "utf-8"
    return BeautifulSoup(r.text, "html.parser")
`;

const P05_PARSE_CARDS = R`
def parse_cards(soup, page_url):
    """Список словарей по карточкам новостей одной страницы-списка."""
    rows = []
    for card in soup.select("article.news-card"):
        a = card.select_one("h2.news-title a")
        rows.append({
            "title": a.get_text(strip=True),
            "url": urljoin(page_url, a["href"]),
            "category": card.select_one("span.category").get_text(strip=True),
            "date": card.select_one("time")["datetime"],
            "author": card.select_one("span.author").get_text(strip=True),
        })
    return rows
`;

/* Общая часть проверок: эталон разбирается из локальных файлов data/site/. */
const P05_CHECK_BASE = R`
import pandas as pd
from bs4 import BeautifulSoup
from urllib.parse import urljoin
SITE = ns["SITE"]
def local(path):
    return BeautifulSoup(open("data/site/" + path, encoding="utf-8").read(), "html.parser")
def body_of(path):
    s = local(path)
    return " ".join(" ".join(p.get_text(" ", strip=True) for p in s.select("div.article-body p")).split())
exp_rows = []
for page in ["index.html", "page-2.html", "page-3.html"]:
    s = local(page)
    for card in s.select("article.news-card"):
        a = card.select_one("h2.news-title a")
        exp_rows.append({"title": a.get_text(strip=True), "url": urljoin(SITE + page, a["href"]),
                         "category": card.select_one("span.category").get_text(strip=True),
                         "date": card.select_one("time")["datetime"]})
exp = pd.DataFrame(exp_rows)
`;

BDT.register({
  id: "p05",
  kind: "practice",
  num: 5,
  title: "Сбор текстовых данных с веб-страниц с использованием технологии Web Scraping",
  hours: 2,
  env: ["python"],
  goals: [
    "Знать правовые и этические правила веб-скрейпинга: `robots.txt`, условия сайта, вежливые задержки",
    "Загружать страницы библиотекой `requests`, понимать коды ответа HTTP и роль кодировки",
    "Извлекать данные из HTML с помощью BeautifulSoup: `find`, `find_all`, `select`",
    "Обходить пагинацию и страницы статей, сохранять собранные тексты в DataFrame и CSV",
  ],
  theory: R`
## Что такое веб-скрейпинг

**Web Scraping** (веб-скрейпинг) — автоматический сбор данных с веб-страниц: программа скачивает HTML-код страницы и извлекает из него нужные фрагменты — заголовки, даты, тексты. Для компьютерной лингвистики это основной способ собрать **корпус**: новости, отзывы, форумы на узбекском языке, которых нет в готовых наборах данных.

| Шаг | Инструмент | Результат |
|---|---|---|
| 1. Загрузка | \`requests.get(url)\` | HTML-текст страницы |
| 2. Разбор | \`BeautifulSoup(html, "html.parser")\` | дерево тегов |
| 3. Извлечение | \`find\`, \`find_all\`, \`select\` | заголовки, ссылки, тексты |
| 4. Обход | \`urljoin\`, цикл по ссылкам | все страницы сайта |
| 5. Сохранение | \`pandas\` | CSV / JSON |

## Этика и право

Скрейпинг законен не всегда. Перед сбором данных проверьте:

- **robots.txt** — файл в корне сайта с правилами для роботов. \`Disallow: /admin/\` — туда ходить нельзя, \`Crawl-delay: 1\` — пауза между запросами не меньше 1 секунды;
- **условия использования** сайта (Terms of Service): некоторые сайты прямо запрещают автоматический сбор;
- **авторское право**: тексты принадлежат авторам. Для исследования корпус можно анализировать, но публиковать его целиком без разрешения нельзя;
- **персональные данные** (Закон Республики Узбекистан «О персональных данных»): не собирайте телефоны, e-mail, адреса людей;
- **нагрузку на сервер**: делайте паузы (\`time.sleep\`), не запускайте сотни параллельных запросов; если у сайта есть **API** — используйте его.

\`\`\`text robots.txt учебного сайта
User-agent: *
Allow: /
Crawl-delay: 1
\`\`\`

> [!WARNING] Правило вежливого робота
> Один запрос в 1–2 секунды, понятный User-Agent, соблюдение robots.txt и только те страницы, которые действительно нужны для исследования.

## HTTP-запрос и коды ответа

\`\`\`python
import requests

r = requests.get(SITE + "index.html")
r.status_code                 # 200 — страница получена
r.headers.get("Content-Type") # 'text/html' — кодировка не указана!
r.encoding = "utf-8"          # ОБЯЗАТЕЛЬНО до обращения к r.text
html = r.text
r.raise_for_status()          # исключение, если код 4xx/5xx
\`\`\`

| Код | Значение | Что делать |
|---|---|---|
| 200 | OK | разбирать страницу |
| 301, 302 | перенаправление | \`requests\` переходит сам |
| 403 | доступ запрещён | не обходить защиту |
| 404 | страница не найдена | пропустить ссылку |
| 429 | слишком много запросов | увеличить паузу |
| 500, 503 | ошибка сервера | повторить позже |

> [!NOTE] Почему важна кодировка
> Если сервер не сообщил \`charset\`, \`requests\` считает текст кодировкой ISO-8859-1. Тогда «So‘nggi» превращается в «Soâ€˜nggi», а все узбекские апострофы ‘ ’ — в мусор. Задавайте \`r.encoding = "utf-8"\` или декодируйте байты сами: \`r.content.decode("utf-8")\`.

## BeautifulSoup: поиск по дереву тегов

\`\`\`python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")
soup.title.get_text()                         # текст тега <title>
soup.find("h2", class_="news-title")          # ПЕРВЫЙ подходящий тег или None
soup.find_all("article", class_="news-card")  # СПИСОК всех подходящих тегов
soup.select("h2.news-title a")                # CSS-селектор → список
soup.select_one("div.pagination a.next")      # первый по селектору или None
a = soup.select_one("h2.news-title a")
a["href"], a.get("href"), a.get_text(strip=True)
\`\`\`

| CSS-селектор | Что выбирает |
|---|---|
| \`p\` | все теги p |
| \`.lead\` | теги с классом lead |
| \`h2.news-title\` | h2 с классом news-title |
| \`div.meta span\` | span на любой глубине внутри div.meta |
| \`div.article-body > p\` | p — прямые потомки div.article-body |
| \`time[datetime]\` | time, у которых есть атрибут datetime |

Структура учебного сайта: карточка \`article.news-card\` → \`h2.news-title > a[href]\`, \`.meta\` с \`span.category\`, \`time[datetime]\`, \`span.author\`; пагинация \`div.pagination > a.next\`. На странице статьи: \`h1.article-title\`, \`div.article-body > p\`, \`ul.tags > li\`, \`span.views\` и **рекламный блок** \`aside.ads\`, который в корпус попадать не должен.

## Относительные ссылки и пагинация

Ссылки в карточках относительные: \`article/navroz-bayrami.html\`. Полный адрес строится функцией \`urljoin\` относительно адреса текущей страницы:

\`\`\`python
from urllib.parse import urljoin
import time

url, pages = SITE + "index.html", []
while url:                                   # пока есть «следующая» страница
    soup = get_soup(url)
    pages.append(url)
    nxt = soup.select_one("div.pagination a.next")
    url = urljoin(url, nxt["href"]) if nxt else None
    time.sleep(1)                            # Crawl-delay
\`\`\`

> [!TIP] Паузы в тренажёре
> Учебный сайт работает локально, поэтому в заданиях хватит \`time.sleep(0.05)\`. На реальных сайтах берите значение из \`Crawl-delay\` (обычно 1–3 с).

## Сохранение результата

\`\`\`python
df = pd.DataFrame(rows)                          # rows — список словарей
df.to_csv("news.csv", index=False, encoding="utf-8")
\`\`\`
`,
  tasks: [
    {
      id: "t1",
      title: "robots.txt и первый запрос",
      text: R`
Перед сбором данных прочитайте правила сайта и скачайте его главную страницу.

1. Текст файла \`SITE + "robots.txt"\` уже в переменной \`robots\`. Найдите в нём строку \`Crawl-delay\` и запишите значение **числом** в \`crawl_delay\`.
2. Скачайте главную страницу \`SITE + "index.html"\` в переменную \`r\`, код ответа запишите в \`status\`.
3. Укажите кодировку \`utf-8\` и сохраните HTML-код страницы в \`html\` (строка).
`,
      starter: R`import requests

print("Адрес сайта:", SITE)
robots = requests.get(SITE + "robots.txt").text
print(robots)

crawl_delay = ...   # число из строки "Crawl-delay: ..."

r = requests.get(...)
status = ...
# задайте кодировку до обращения к r.text
html = r.text

print("Код ответа:", status)
print(html[:300])
`,
      check: R`
cd = var("crawl_delay")
ok(isinstance(cd, (int, float)) and not isinstance(cd, bool) and cd == 1, "crawl_delay — число 1 из строки «Crawl-delay: 1»")
ok(var("status") == 200, "status = 200 (страница успешно загружена)")
h = var("html", str)
ok("news-card" in h and "Talaba Yangiliklari" in h, "html содержит код главной страницы")
ok("So‘nggi yangiliklar" in h, "Текст декодирован как UTF-8: видно «So‘nggi yangiliklar», а не «Soâ€˜nggi»")
`,
      hint: "Переберите строки `robots.splitlines()`; у строки, начинающейся с `Crawl-delay`, возьмите часть после двоеточия: `int(line.split(\":\")[1])`. Код ответа — `r.status_code`, кодировка — `r.encoding = \"utf-8\"`.",
      solution: R`import requests

print("Адрес сайта:", SITE)
robots = requests.get(SITE + "robots.txt").text
print(robots)

for line in robots.splitlines():
    if line.lower().startswith("crawl-delay"):
        crawl_delay = int(line.split(":")[1])

r = requests.get(SITE + "index.html")
status = r.status_code
r.encoding = "utf-8"
html = r.text

print("Код ответа:", status)
print(html[:300])
`,
    },
    {
      id: "t2",
      env: "choice",
      title: "Этика веб-скрейпинга",
      text: R`
Вы собираете корпус узбекских новостей для курсовой работы. Какие действия **допустимы**? Выберите все верные варианты.
`,
      options: [
        "Делать паузу между запросами не меньше значения Crawl-delay из robots.txt",
        "Скачивать разделы, закрытые строкой Disallow, если они открываются без пароля",
        "Использовать официальный API сайта вместо разбора HTML, если API есть",
        "Собрать телефоны и e-mail авторов комментариев, чтобы потом сделать рассылку",
        "Запустить 500 параллельных запросов, чтобы собрать корпус за минуту",
        "Сохранять для каждого документа ссылку-источник и дату сбора",
      ],
      answer: [0, 2, 5],
      explain: R`
Правила robots.txt (включая \`Disallow\`) нужно соблюдать, даже если технически страница доступна. Сбор персональных данных для рассылки нарушает закон о персональных данных, а сотни параллельных запросов создают нагрузку, похожую на DoS-атаку. Паузы, API и сохранение источника — признаки корректного исследования.
`,
    },
    {
      id: "t3",
      title: "Разбор HTML: find, find_all, select",
      setup: R`import requests
r = requests.get(SITE + "index.html")
r.encoding = "utf-8"
html = r.text`,
      text: R`
Переменная \`html\` уже содержит главную страницу. Создайте \`soup = BeautifulSoup(html, "html.parser")\` и найдите:

- \`page_title\` — текст тега \`<title>\`;
- \`cards\` — список всех карточек \`article.news-card\` (через \`find_all\`);
- \`titles\` — список заголовков новостей: текст ссылок внутри \`h2.news-title\`, полученных CSS-селектором (\`select\`);
- \`next_href\` — значение атрибута \`href\` у ссылки «Keyingi →» (\`a\` с классом \`next\`).
`,
      starter: R`from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")

page_title = ...
cards = ...
titles = ...
next_href = ...

print(page_title)
print(len(cards), "карточек")
for t in titles:
    print("-", t)
print("Следующая страница:", next_href)
`,
      check: R`
from bs4 import BeautifulSoup
s = BeautifulSoup(open("data/site/index.html", encoding="utf-8").read(), "html.parser")
exp_titles = [a.get_text(strip=True) for a in s.select("h2.news-title a")]
ok(str(var("page_title")).strip() == s.title.get_text(), "page_title = «Bosh sahifa | Talaba Yangiliklari»")
c = var("cards")
ok(isinstance(c, list) and len(c) == 6 and all(getattr(x, "name", "") == "article" for x in c), "cards — список из 6 тегов article.news-card")
t = var("titles")
ok(isinstance(t, list) and [str(x).strip() for x in t] == exp_titles, "titles — список из 6 заголовков (строки) в порядке появления на странице")
ok(var("next_href") == "page-2.html", "next_href = 'page-2.html'")
ok(uses("find_all"), "Карточки найдены методом find_all")
ok(uses("select"), "Использован CSS-селектор (select или select_one)")
`,
      hint: "`soup.title.get_text()`; `soup.find_all(\"article\", class_=\"news-card\")`; `[a.get_text(strip=True) for a in soup.select(\"h2.news-title a\")]`; `soup.select_one(\"a.next\")[\"href\"]`.",
      solution: R`from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")

page_title = soup.title.get_text()
cards = soup.find_all("article", class_="news-card")
titles = [a.get_text(strip=True) for a in soup.select("h2.news-title a")]
next_href = soup.select_one("div.pagination a.next")["href"]

print(page_title)
print(len(cards), "карточек")
for t in titles:
    print("-", t)
print("Следующая страница:", next_href)
`,
    },
    {
      id: "t4",
      title: "Данные из карточек новостей",
      setup: P05_SOUP,
      text: R`
Функция \`get_soup(url)\` уже определена (скачивает страницу с кодировкой UTF-8 и возвращает \`BeautifulSoup\`).

Напишите функцию \`parse_cards(soup, page_url)\`, которая возвращает **список словарей** — по одному на карточку — с ключами:

| Ключ | Откуда взять |
|---|---|
| \`title\` | текст ссылки в \`h2.news-title\` |
| \`url\` | **полный** адрес статьи: \`urljoin(page_url, href)\` |
| \`category\` | текст \`span.category\` |
| \`date\` | атрибут \`datetime\` тега \`time\` (формат \`2026-09-01\`) |
| \`author\` | текст \`span.author\` |

Примените её к главной странице и сохраните результат в DataFrame \`news\`.
`,
      starter: R`page_url = SITE + "index.html"
soup = get_soup(page_url)

def parse_cards(soup, page_url):
    rows = []
    for card in soup.select("article.news-card"):
        a = card.select_one("h2.news-title a")
        rows.append({
            "title": a.get_text(strip=True),
            "url": ...,
            "category": ...,
            "date": ...,
            "author": ...,
        })
    return rows

news = pd.DataFrame(parse_cards(soup, page_url))
news
`,
      check: P05_CHECK_BASE + R`
n = var("news", pd.DataFrame)
e = exp.iloc[:6].reset_index(drop=True)
ok(len(n) == 6, "В news 6 строк — по числу карточек на главной странице")
ok(set(["title", "url", "category", "date", "author"]) <= set(n.columns), "Есть столбцы title, url, category, date, author")
if len(n) == 6 and "url" in n.columns:
    ok(list(n["title"]) == list(e["title"]), "Заголовки извлечены верно")
    ok(list(n["url"]) == list(e["url"]), "url — полные адреса вида SITE + 'article/....html' (urljoin)")
    ok(list(n["category"]) == list(e["category"]), "Категории извлечены из span.category")
    ok([str(x)[:10] for x in n["date"]] == list(e["date"]), "date — значение атрибута datetime (например, 2026-09-01)")
f = var("parse_cards")
ok(callable(f) and len(f(local("page-3.html"), SITE + "page-3.html")) == 4, "parse_cards работает и для других страниц (на page-3.html — 4 карточки)")
`,
      hint: "Атрибут тега — как ключ словаря: `card.select_one(\"time\")[\"datetime\"]`. Полный адрес: `urljoin(page_url, a[\"href\"])`.",
      solution: R`page_url = SITE + "index.html"
soup = get_soup(page_url)

def parse_cards(soup, page_url):
    rows = []
    for card in soup.select("article.news-card"):
        a = card.select_one("h2.news-title a")
        rows.append({
            "title": a.get_text(strip=True),
            "url": urljoin(page_url, a["href"]),
            "category": card.select_one("span.category").get_text(strip=True),
            "date": card.select_one("time")["datetime"],
            "author": card.select_one("span.author").get_text(strip=True),
        })
    return rows

news = pd.DataFrame(parse_cards(soup, page_url))
news
`,
    },
    {
      id: "t5",
      title: "Обход пагинации",
      setup: P05_SOUP + P05_PARSE_CARDS,
      text: R`
Новости разбиты на 3 страницы. Функции \`get_soup\` и \`parse_cards\` уже определены.

Начните с \`SITE + "index.html"\` и в цикле \`while\` переходите по ссылке \`div.pagination a.next\`, пока она есть:

- \`pages\` — список адресов всех посещённых страниц (полные адреса, по порядку);
- \`news\` — DataFrame со всеми карточками со всех страниц;
- между запросами делайте вежливую паузу \`time.sleep(0.05)\`.

Выведите число новостей и распределение по категориям.
`,
      starter: R`url = SITE + "index.html"
pages = []
rows = []

while url:
    soup = get_soup(url)
    pages.append(url)
    rows.extend(parse_cards(soup, url))
    nxt = ...          # ссылка a.next или None
    url = ...          # полный адрес следующей страницы или None
    time.sleep(0.05)
    break              # уберите эту строку, когда допишете цикл

news = pd.DataFrame(rows)
print(len(pages), "страницы,", len(news), "новостей")
news["category"].value_counts()
`,
      check: P05_CHECK_BASE + R`
p = var("pages", list)
ok([str(x) for x in p] == [SITE + "index.html", SITE + "page-2.html", SITE + "page-3.html"], "pages = [SITE+'index.html', SITE+'page-2.html', SITE+'page-3.html']")
n = var("news", pd.DataFrame)
ok(len(n) == 16, "В news 16 новостей со всех трёх страниц")
ok("url" in n.columns and n["url"].nunique() == len(n) and set(n["url"]) == set(exp["url"]), "Каждая статья встречается один раз, адреса полные")
ok(uses("sleep"), "Между запросами есть пауза time.sleep")
ok(uses("next"), "Следующая страница находится по ссылке a.next")
`,
      hint: "`nxt = soup.select_one(\"div.pagination a.next\")`, затем `url = urljoin(url, nxt[\"href\"]) if nxt else None`. Не забудьте удалить `break`.",
      solution: R`url = SITE + "index.html"
pages = []
rows = []

while url:
    soup = get_soup(url)
    pages.append(url)
    rows.extend(parse_cards(soup, url))
    nxt = soup.select_one("div.pagination a.next")
    url = urljoin(url, nxt["href"]) if nxt else None
    time.sleep(0.05)

news = pd.DataFrame(rows)
print(len(pages), "страницы,", len(news), "новостей")
news["category"].value_counts()
`,
    },
    {
      id: "t6",
      title: "Страница статьи: текст без рекламы",
      setup: P05_SOUP,
      text: R`
Разберите статью \`SITE + "article/navroz-bayrami.html"\`:

- \`title\` — заголовок \`h1.article-title\`;
- \`paragraphs\` — список текстов абзацев **только** из \`div.article-body\` (каждый через \`get_text(strip=True)\`);
- \`body\` — абзацы, соединённые через \`"\n"\`;
- \`tags\` — список тегов из \`ul.tags li\`;
- \`views\` — число просмотров (целое) из \`span.views\` («Ko‘rishlar: 4005» → \`4005\`).

Рекламный блок \`aside.ads\` и ссылка «Bosh sahifaga qaytish» в текст попасть не должны.
`,
      starter: R`import re

soup = get_soup(SITE + "article/navroz-bayrami.html")

title = soup.select_one("h1.article-title").get_text(strip=True)
paragraphs = [p.get_text(strip=True) for p in soup.find_all("p")]   # все ли это абзацы статьи?
body = "\n".join(paragraphs)
tags = ...
views = ...

print(title, "|", views, "просмотров |", tags)
print(body)
`,
      check: R`
import re
from bs4 import BeautifulSoup
s = BeautifulSoup(open("data/site/article/navroz-bayrami.html", encoding="utf-8").read(), "html.parser")
exp_par = [p.get_text(strip=True) for p in s.select("div.article-body p")]
ok(var("title") == s.select_one("h1.article-title").get_text(strip=True), "title — заголовок статьи из h1.article-title")
par = var("paragraphs", list)
ok([str(x).strip() for x in par] == exp_par, f"paragraphs — {len(exp_par)} абзаца из div.article-body")
b = var("body", str)
ok(" ".join(b.split()) == " ".join("\n".join(exp_par).split()), "body — абзацы, соединённые переводом строки")
ok("Reklama" not in b and "Bosh sahifaga" not in b, "В body нет рекламы (aside.ads) и навигационной ссылки")
ok(var("tags") == [li.get_text(strip=True) for li in s.select("ul.tags li")], "tags = ['Navro‘z', 'bayram', 'an’ana']")
v = var("views")
ok(isinstance(v, int) and v == 4005, "views — целое число 4005")
`,
      hint: "Селектор `div.article-body p` выбирает только абзацы статьи. Число из строки: `int(re.search(r\"\\d+\", text).group())`.",
      solution: R`import re

soup = get_soup(SITE + "article/navroz-bayrami.html")

title = soup.select_one("h1.article-title").get_text(strip=True)
paragraphs = [p.get_text(strip=True) for p in soup.select("div.article-body p")]
body = "\n".join(paragraphs)
tags = [li.get_text(strip=True) for li in soup.select("ul.tags li")]
views_text = soup.select_one("span.views").get_text()
views = int(re.search(r"\d+", views_text).group())

print(title, "|", views, "просмотров |", tags)
print(body)
`,
    },
    {
      id: "t7",
      title: "Сбор всех статей и сохранение в CSV",
      setup: P05_SOUP + P05_PARSE_CARDS + R`
url, rows = SITE + "index.html", []
while url:
    soup = get_soup(url)
    rows.extend(parse_cards(soup, url))
    nxt = soup.select_one("div.pagination a.next")
    url = urljoin(url, nxt["href"]) if nxt else None
news = pd.DataFrame(rows)
`,
      text: R`
DataFrame \`news\` (16 строк: title, url, category, date, author) уже собран обходом пагинации. Посетите **каждую** статью и дополните таблицу:

- \`text\` — текст статьи: абзацы \`div.article-body p\`, соединённые \`"\n"\` (без рекламы);
- \`views\` — число просмотров (int);
- \`n_words\` — число слов в тексте: \`len(text.split())\`.

Итог сохраните в DataFrame \`articles\` и в файл \`news_site.csv\` (\`index=False\`, кодировка UTF-8). Не забудьте паузу между запросами (\`time.sleep(0.05)\`).
`,
      starter: R`import re

texts, views = [], []
for url in news["url"]:
    soup = get_soup(url)
    # извлеките текст статьи и число просмотров
    ...
    time.sleep(0.05)

articles = news.copy()
# articles["text"] = ...
# articles["views"] = ...
# articles["n_words"] = ...
# сохраните в news_site.csv

articles.head()
`,
      check: P05_CHECK_BASE + R`
import os, re
a = var("articles", pd.DataFrame)
ok(len(a) == 16, "В articles 16 статей")
need = {"url", "title", "category", "text", "views", "n_words"}
ok(need <= set(a.columns), "Есть столбцы url, title, category, text, views, n_words")
if need <= set(a.columns) and len(a) == 16:
    good = all(" ".join(str(t).split()) == body_of(str(u).replace(SITE, "")) for u, t in zip(a["url"], a["text"]))
    ok(good, "text — полный текст каждой статьи из div.article-body")
    ok(not a["text"].astype(str).str.contains("Reklama").any(), "В текстах нет рекламного блока aside.ads")
    exp_views = {SITE + "article/" + f: int(re.search(r"\d+", local("article/" + f).select_one("span.views").get_text()).group()) for f in os.listdir("data/site/article")}
    ok(all(int(v) == exp_views.get(u) for u, v in zip(a["url"], a["views"])), "views — числа просмотров (int) для каждой статьи")
    ok((a["n_words"] == a["text"].astype(str).str.split().str.len()).all(), "n_words = len(text.split())")
ok(os.path.exists("news_site.csv"), "Создан файл news_site.csv")
if os.path.exists("news_site.csv"):
    back = pd.read_csv("news_site.csv")
    ok(len(back) == 16 and "text" in back.columns and "Unnamed: 0" not in back.columns, "Файл читается обратно: 16 строк, столбец text, без лишнего индекса")
ok(uses("sleep"), "Между запросами есть пауза time.sleep")
`,
      hint: "Внутри цикла: `paras = [p.get_text(strip=True) for p in soup.select(\"div.article-body p\")]`, `texts.append(\"\\n\".join(paras))`; просмотры — `int(re.search(r\"\\d+\", soup.select_one(\"span.views\").get_text()).group())`. Сохранение: `articles.to_csv(\"news_site.csv\", index=False, encoding=\"utf-8\")`.",
      solution: R`import re

texts, views = [], []
for url in news["url"]:
    soup = get_soup(url)
    paras = [p.get_text(strip=True) for p in soup.select("div.article-body p")]
    texts.append("\n".join(paras))
    views.append(int(re.search(r"\d+", soup.select_one("span.views").get_text()).group()))
    time.sleep(0.05)

articles = news.copy()
articles["text"] = texts
articles["views"] = views
articles["n_words"] = articles["text"].str.split().str.len()
articles.to_csv("news_site.csv", index=False, encoding="utf-8")

print("Слов в корпусе:", articles["n_words"].sum())
articles[["title", "category", "views", "n_words"]].sort_values("views", ascending=False).head()
`,
    },
  ],
  quiz: [
    { q: "Что означает строка `Crawl-delay: 1` в файле robots.txt?", options: ["Сайт можно скачивать не дольше 1 часа", "Между запросами робота должна быть пауза не меньше 1 секунды", "Разрешено скачать только 1 страницу", "Сайт обновляется раз в сутки"], answer: 1, explain: "Crawl-delay задаёт минимальную паузу (в секундах) между запросами робота. В коде её соблюдают через `time.sleep`." },
    { q: "Сервер вернул код 429. Что это значит?", options: ["Страница не найдена", "Доступ запрещён", "Слишком много запросов — нужно замедлиться", "Внутренняя ошибка сервера"], answer: 2, explain: "429 Too Many Requests: робот слишком часто обращается к сайту. Нужно увеличить паузу между запросами." },
    { q: "Чем `soup.find(...)` отличается от `soup.find_all(...)`?", options: ["Ничем", "`find` возвращает первый подходящий тег (или None), `find_all` — список всех", "`find` ищет по CSS-селектору, `find_all` — по имени тега", "`find_all` работает только с атрибутами"], answer: 1 },
    { q: "Почему для учебного сайта после `requests.get` нужно писать `r.encoding = \"utf-8\"`?", options: ["Иначе запрос не выполнится", "Сервер не указал charset, и requests декодирует текст как ISO-8859-1 — узбекские апострофы ‘ ’ искажаются", "Это ускоряет загрузку", "BeautifulSoup не умеет работать с байтами"], answer: 1, explain: "Без явной кодировки «So‘nggi» превращается в «Soâ€˜nggi». Можно также декодировать байты: `r.content.decode(\"utf-8\")`." },
    { q: "Ссылка в карточке: `article/navroz-bayrami.html`, страница: `SITE + \"page-2.html\"`. Как получить полный адрес статьи?", options: ["`SITE + \"page-2.html/\" + href`", "`urljoin(SITE + \"page-2.html\", href)`", "`href.replace(\"article\", SITE)`", "`requests.get(href)` сработает и так"], answer: 1, explain: "`urljoin` правильно учитывает текущий каталог, `../` и абсолютные ссылки." },
    { q: "Какой селектор выберет абзацы статьи без рекламного блока и навигации?", options: ["`p`", "`aside.ads`", "`div.article-body p`", "`main *`"], answer: 2 },
  ],
  realEnv: R`
## Скрейпинг в Jupyter / Anaconda

\`\`\`bash
conda activate bigdata
pip install requests beautifulsoup4 lxml pandas
\`\`\`

Код заданий работает в Jupyter без изменений, нужно лишь заменить \`SITE\` на адрес реального сайта. Учебный сайт тоже можно запустить локально: в папке репозитория выполните \`python -m http.server 8000\` и используйте \`SITE = "http://localhost:8000/data/site/"\`.

## Правила для реальных сайтов

\`\`\`python
import time, requests
from urllib import robotparser

rp = robotparser.RobotFileParser("https://example.uz/robots.txt")
rp.read()
url = "https://example.uz/news/1"
if rp.can_fetch("UzCorpusBot", url):
    r = requests.get(url, headers={"User-Agent": "UzCorpusBot/0.1 (student project; mail@univer.uz)"}, timeout=10)
    if r.status_code == 429:
        time.sleep(30)          # сервер просит замедлиться
    time.sleep(rp.crawl_delay("UzCorpusBot") or 2)
\`\`\`

- Читайте **Terms of Service**: некоторые СМИ запрещают автоматический сбор; если есть RSS-лента или API — используйте их.
- Храните только то, что нужно для исследования; не публикуйте собранные тексты целиком (авторское право) и не собирайте персональные данные.
- Кэшируйте скачанные страницы на диск, чтобы не загружать их повторно при отладке парсера.

## Инструменты для больших объёмов

| Инструмент | Когда использовать |
|---|---|
| **Scrapy** | промышленный краулер: очередь ссылок, параллельность, \`ROBOTSTXT_OBEY = True\`, \`DOWNLOAD_DELAY\`, AutoThrottle, экспорт в JSON Lines |
| **Selenium / Playwright** | страницы, где текст подгружается JavaScript-ом (бесконечная прокрутка, кнопки «Ещё») |
| **trafilatura**, **newspaper3k** | автоматическое извлечение основного текста статьи без ручных селекторов |

\`\`\`bash
pip install scrapy
scrapy startproject uznews
\`\`\`

> [!TIP] Google Colab
> В Colab \`requests\` и \`bs4\` уже установлены. Учтите, что запросы идут с серверов Google — некоторые сайты их блокируют.
`,
  homework: R`
## Самостоятельная работа

1. **Эссе (1–2 страницы):** «Перспективы применения технологий Big Data в компьютерной лингвистике» — какие узбекские веб-ресурсы (новости, форумы, соцсети) можно использовать как источники корпусов, какие правовые ограничения действуют.
2. Выберите реальный узбекоязычный новостной сайт. Изучите его \`robots.txt\` и условия использования, опишите в таблице CSS-селекторы для заголовка, даты, категории и текста статьи.
3. Если правила сайта это разрешают, соберите 20–30 статей с паузой не меньше 2 секунд и сохраните их в CSV (url, title, date, text). Посчитайте среднюю длину статьи в словах.
`,
});
