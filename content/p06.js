BDT.register({
  id: "p06",
  kind: "practice",
  num: 6,
  title: "Получение данных через API и их сохранение в виде DataFrame библиотеки Pandas",
  hours: 2,
  env: ["python"],
  goals: [
    "Понять, как устроены REST API: адрес ресурса, метод GET, код ответа, JSON в теле ответа",
    "Научиться отправлять запросы библиотекой `requests`, обходить постраничную выдачу (пагинацию) и обрабатывать ошибки",
    "Преобразовывать ответы API во вложенном JSON в DataFrame (`pd.json_normalize`) и сохранять их в CSV и JSON",
  ],
  theory: R`
## Что такое API

**API** (Application Programming Interface) — способ, которым программа получает данные у другой программы. Веб-API работают поверх HTTP: клиент отправляет **запрос** на адрес (URL), сервер возвращает **ответ** — обычно в формате JSON. Так собирают данные из соцсетей, погодных сервисов, онлайн-библиотек, курсов валют ЦБ и т.д.

В тренажёре есть учебный API библиотеки «Talaba Kutubxona». Его адрес хранится в переменной \`API\`:

| Ресурс | Что возвращает |
|---|---|
| \`API + "books/page-1.json"\` … \`page-4.json\` | книги порциями по 5 (поля \`page\`, \`total\`, \`next\`, \`results\`) |
| \`API + "books/7.json"\` | одна книга с отзывами (\`reviews\`) |
| \`API + "authors.json"\` | авторы и номера их книг |
| \`API + "weather/tashkent.json"\` | погода за март: также \`samarkand\`, \`bukhara\`, \`nukus\` |

## Запрос с requests

\`\`\`python
import requests

r = requests.get(API + "books/page-1.json")
r.status_code                  # 200 — успех
r.headers["Content-Type"]      # application/json
r.encoding = "utf-8"           # кодировка текста ответа — задаём явно!
print(r.text[:200])            # тело ответа как строка
data = r.json()                # тело ответа как dict/list Python
\`\`\`

> [!WARNING] Кодировка ответа
> Если сервер не указал \`charset\` в заголовке \`Content-Type\`, \`requests\` может решить, что текст в кодировке ISO-8859-1, и узбекские буквы \`oʻ, gʻ\` или кириллица превратятся в «кракозябры». Поэтому перед \`r.text\` всегда пишите \`r.encoding = "utf-8"\`. Метод \`r.json()\` сам определяет UTF-8.

### Параметры и заголовки запроса

Настоящие API принимают **параметры** в строке запроса (\`?city=Toshkent&page=2\`) и часто требуют **ключ** в заголовке. В \`requests\` их не склеивают вручную, а передают словарями — библиотека сама закодирует пробелы, апострофы и кириллицу:

\`\`\`python
r = requests.get("https://example.org/api/search",
                 params={"q": "Navoiy", "lang": "uz", "page": 2},     # -> ?q=Navoiy&lang=uz&page=2
                 headers={"Authorization": "Bearer <ваш_токен>"},
                 timeout=10)
r.url                          # итоговый адрес с параметрами
\`\`\`

## Коды ответа HTTP

| Код | Значение |
|---|---|
| **200** OK | всё хорошо |
| **301/302** | ресурс переехал (requests сам перейдёт по новому адресу) |
| **400** Bad Request | неверные параметры запроса |
| **401/403** | нужна авторизация (API-ключ) / доступ запрещён |
| **404** Not Found | ресурса нет |
| **429** Too Many Requests | превышен лимит запросов — нужно подождать |
| **500** и выше | ошибка на сервере |

\`\`\`python
r = requests.get(API + "books/99.json")
r.status_code              # 404
r.ok                       # False (True для кодов < 400)
try:
    r.raise_for_status()   # бросает исключение для кодов 4xx и 5xx
except requests.HTTPError as e:
    print("Ошибка:", e)
\`\`\`

## Пагинация

Большие наборы API отдаёт **страницами**. Ответ содержит ссылку на следующую страницу (\`next\`); на последней странице \`next\` равен \`null\` (в Python — \`None\`).

\`\`\`python
url = API + "books/page-1.json"
items = []
while url:                                   # пока есть следующая страница
    data = requests.get(url).json()
    items.extend(data["results"])
    url = API + "books/" + data["next"] if data["next"] else None
\`\`\`

## Из JSON в DataFrame

\`\`\`python
import pandas as pd

books = pd.json_normalize(items)             # publisher.name, price.amount, ...
d = requests.get(API + "weather/nukus.json").json()
nukus = pd.json_normalize(d, record_path="daily", meta=["city"])   # строка на каждый день

books.to_csv("books.csv", index=False)
books.to_json("books.json", orient="records", force_ascii=False, indent=2)
\`\`\`

> [!TIP] Вежливость к API
> Настоящие API ограничивают число запросов. Делайте паузы (\`time.sleep(1)\`), сохраняйте полученные данные в файл, чтобы не скачивать их повторно, и передавайте \`timeout=10\`, чтобы программа не «зависла» при сбое сети.
`,
  tasks: [
    {
      id: "t1",
      title: "Первый запрос к API",
      text: R`
Отправьте GET-запрос к первой странице каталога книг \`API + "books/page-1.json"\`.

- \`r\` — объект ответа; \`status\` — код ответа; \`ctype\` — значение заголовка \`Content-Type\`;
- задайте \`r.encoding = "utf-8"\` и выведите первые 200 символов текста ответа;
- \`data\` — ответ, преобразованный в словарь (\`r.json()\`);
- \`n_results\` — сколько книг на этой странице, \`total\` — сколько книг всего (поле \`total\`), \`next_page\` — значение поля \`next\`.
`,
      starter: R`import requests

r = ...
status = ...
ctype = ...

r.encoding = "utf-8"
print(r.text[:200])

data = ...
n_results = ...
total = ...
next_page = ...

print(status, ctype)
print(f"На странице {n_results} книг из {total}; дальше: {next_page}")
`,
      check: R`
import requests
d = requests.get(ns["API"] + "books/page-1.json").json()
ok(isinstance(var("r"), requests.Response), "r — ответ requests.get")
ok(var("status") == 200, "status = 200")
ok("json" in str(var("ctype")), "ctype — заголовок Content-Type (application/json)")
data = var("data", dict)
ok(data.get("page") == 1 and "results" in data, "data — словарь из r.json()")
ok(var("n_results") == len(d["results"]), f"n_results = {len(d['results'])}")
ok(var("total") == d["total"], f"total = {d['total']}")
ok(var("next_page") == d["next"], f"next_page = {d['next']!r}")
`,
      hint: "`r = requests.get(API + \"books/page-1.json\")`, заголовок: `r.headers[\"Content-Type\"]`, книги на странице: `len(data[\"results\"])`.",
      solution: R`import requests

r = requests.get(API + "books/page-1.json")
status = r.status_code
ctype = r.headers["Content-Type"]

r.encoding = "utf-8"
print(r.text[:200])

data = r.json()
n_results = len(data["results"])
total = data["total"]
next_page = data["next"]

print(status, ctype)
print(f"На странице {n_results} книг из {total}; дальше: {next_page}")
`,
    },
    {
      id: "t2",
      title: "Пагинация: все страницы",
      text: R`
Соберите **все** книги каталога, переходя по ссылке \`next\`, пока она не станет \`None\`:

- \`all_books\` — список словарей всех книг со всех страниц;
- \`pages\` — сколько страниц было загружено.

Адрес следующей страницы: \`API + "books/" + data["next"]\`.
`,
      starter: R`import requests

url = API + "books/page-1.json"
all_books = []
pages = 0

while url:
    r = requests.get(url)
    data = r.json()
    # 1) добавьте книги data["results"] в all_books
    # 2) увеличьте счётчик pages
    # 3) вычислите адрес следующей страницы (или None, если next пуст)
    url = None   # замените эту строку

print("Страниц:", pages, "книг:", len(all_books))
print([b["title"] for b in all_books])
`,
      check: R`
import requests
ab = var("all_books", list)
ok(len(ab) == 16, "all_books содержит 16 книг")
ok(sorted(b.get("id") for b in ab if isinstance(b, dict)) == list(range(1, 17)), "В all_books книги с id 1…16 без повторов")
ok(var("pages") == 4, "pages = 4")
ok(uses("next"), "Адрес следующей страницы берётся из поля next")
`,
      hint: "`all_books.extend(data[\"results\"])`; `pages += 1`; `url = API + \"books/\" + data[\"next\"] if data[\"next\"] else None`.",
      solution: R`import requests

url = API + "books/page-1.json"
all_books = []
pages = 0

while url:
    r = requests.get(url)
    r.raise_for_status()
    data = r.json()
    all_books.extend(data["results"])
    pages += 1
    url = API + "books/" + data["next"] if data["next"] else None

print("Страниц:", pages, "книг:", len(all_books))
print([b["title"] for b in all_books])
`,
    },
    {
      id: "t3",
      title: "Вложенный JSON → DataFrame",
      setup: R`import requests
import pandas as pd
all_books, url = [], API + "books/page-1.json"
while url:
    _d = requests.get(url).json()
    all_books.extend(_d["results"])
    url = API + "books/" + _d["next"] if _d["next"] else None
del _d`,
      text: R`
Список \`all_books\` (16 книг из API) уже загружен. Постройте удобную таблицу \`books\`:

1. Примените \`pd.json_normalize(all_books)\`.
2. Добавьте столбец \`author\` — имена всех авторов книги через \`", "\` (в исходных данных \`authors\` — список словарей), затем удалите столбец \`authors\`.
3. Превратите \`genres\` (список) в строку через \`", "\`.
4. Переименуйте \`publisher.name\` → \`publisher\`, \`price.amount\` → \`price\`.

Затем посчитайте:
- \`by_lang\` — Series: средняя цена по языку;
- \`n_no_isbn\` — у скольких книг нет ISBN (поле необязательное — в таблице будет пропуск).
`,
      starter: R`books = ...

books["author"] = ...
books = books.drop(columns=["authors"])
books["genres"] = ...
books = books.rename(columns={...})

by_lang = ...
n_no_isbn = ...

print(by_lang)
print("Без ISBN:", n_no_isbn)
books[["id", "title", "author", "genres", "publisher", "price", "language"]]
`,
      check: R`
import requests
import pandas as pd
items, url = [], ns["API"] + "books/page-1.json"
while url:
    d = requests.get(url).json()
    items.extend(d["results"])
    url = ns["API"] + "books/" + d["next"] if d["next"] else None
e = pd.json_normalize(items)
b = var("books", pd.DataFrame)
ok(len(b) == 16, "В books 16 строк")
ok("authors" not in b.columns, "Столбец authors удалён")
if "author" in b.columns and "id" in b.columns:
    exp = {x["id"]: ", ".join(a["name"] for a in x["authors"]) for x in items}
    ok(all(exp[i] == a for i, a in zip(b["id"], b["author"])), "author — имена авторов через «, » (у книг 15 и 16 по два автора)")
else:
    ok(False, "В books есть столбцы id и author")
ok("genres" in b.columns and all(isinstance(g, str) for g in b["genres"]) and "roman, klassika" in set(b["genres"]), "genres — строка с жанрами через «, »")
ok("publisher" in b.columns and "price" in b.columns and "price.amount" not in b.columns, "Столбцы переименованы: publisher, price")
bl = var("by_lang", pd.Series)
el = e.groupby("language")["price.amount"].mean()
ok(set(bl.index) == set(el.index) and all(abs(bl[k] - el[k]) < 0.01 for k in el.index), "by_lang — средняя цена по языкам")
ok(var("n_no_isbn") == int(e["isbn"].isna().sum()), f"n_no_isbn = {int(e['isbn'].isna().sum())}")
`,
      hint: "Авторы: `books[\"authors\"].apply(lambda lst: \", \".join(a[\"name\"] for a in lst))`. Жанры: `books[\"genres\"].str.join(\", \")`. Пропуски: `books[\"isbn\"].isna().sum()`.",
      solution: R`books = pd.json_normalize(all_books)

books["author"] = books["authors"].apply(lambda lst: ", ".join(a["name"] for a in lst))
books = books.drop(columns=["authors"])
books["genres"] = books["genres"].str.join(", ")
books = books.rename(columns={"publisher.name": "publisher", "price.amount": "price"})

by_lang = books.groupby("language")["price"].mean()
n_no_isbn = books["isbn"].isna().sum()

print(by_lang)
print("Без ISBN:", n_no_isbn)
books[["id", "title", "author", "genres", "publisher", "price", "language"]]
`,
    },
    {
      id: "t4",
      title: "Запросы к отдельным ресурсам: отзывы",
      text: R`
Списки страниц не содержат отзывов — они есть только в карточке книги \`API + "books/<id>.json"\`.

1. Загрузите карточки всех книг с id от 1 до 16 в список \`details\` (16 запросов).
2. \`reviews\` — DataFrame: одна строка на отзыв, со столбцами \`user\`, \`stars\`, \`text\`, а также \`id\` и \`title\` книги (\`json_normalize\` с \`record_path\` и \`meta\`).
3. \`n_reviews\` — общее число отзывов; \`most_reviewed\` — название книги с наибольшим числом отзывов.
4. \`no_reviews\` — список названий книг, у которых отзывов нет (их не будет в \`reviews\` — сравните с \`details\`).
`,
      starter: R`import requests
import pandas as pd

details = []
for book_id in range(1, 17):
    ...

reviews = ...
n_reviews = ...
most_reviewed = ...
no_reviews = ...

print("Отзывов:", n_reviews, "| больше всех:", most_reviewed, "| без отзывов:", no_reviews)
reviews.head()
`,
      check: R`
import json
import pandas as pd
import requests
bs = [requests.get(ns["API"] + f"books/{i}.json").json() for i in range(1, 17)]
e = pd.json_normalize(bs, record_path="reviews", meta=["id", "title"])
d = var("details", list)
ok(len(d) == 16 and all(isinstance(x, dict) and "reviews" in x for x in d), "details — 16 карточек книг (словари с полем reviews)")
rv = var("reviews", pd.DataFrame)
ok(len(rv) == len(e) and {"user", "stars", "text", "id", "title"} <= set(rv.columns), f"reviews — {len(e)} отзывов со столбцами user, stars, text, id, title")
ok(var("n_reviews") == len(e), f"n_reviews = {len(e)}")
mr = e["title"].value_counts().idxmax()
ok(var("most_reviewed") == mr, f"most_reviewed = «{mr}»")
nr = [b["title"] for b in bs if not b.get("reviews")]
ok(sorted(var("no_reviews")) == sorted(nr), "no_reviews — книги без отзывов")
`,
      hint: "В цикле: `details.append(requests.get(API + f\"books/{book_id}.json\").json())`. Таблица: `pd.json_normalize(details, record_path=\"reviews\", meta=[\"id\", \"title\"])`. Без отзывов: `[b[\"title\"] for b in details if not b[\"reviews\"]]`.",
      solution: R`import requests
import pandas as pd

details = []
for book_id in range(1, 17):
    r = requests.get(API + f"books/{book_id}.json")
    r.raise_for_status()
    details.append(r.json())

reviews = pd.json_normalize(details, record_path="reviews", meta=["id", "title"])
n_reviews = len(reviews)
most_reviewed = reviews["title"].value_counts().idxmax()
no_reviews = [b["title"] for b in details if not b.get("reviews")]

print("Отзывов:", n_reviews, "| больше всех:", most_reviewed, "| без отзывов:", no_reviews)
reviews.head()
`,
    },
    {
      id: "t5",
      title: "Погода в 4 городах → один DataFrame",
      text: R`
Эндпоинты \`API + "weather/<город>.json"\` для \`tashkent\`, \`samarkand\`, \`bukhara\`, \`nukus\` возвращают погоду за март 2026 (массив \`daily\` и поле \`city\`).

1. \`weather\` — **одна** таблица для всех четырёх городов: строка на каждый день каждого города, со столбцом \`city\` (\`json_normalize\` + \`pd.concat\`).
2. Преобразуйте \`date\` в datetime и добавьте \`t_mean = (t_min + t_max) / 2\`.
3. \`summary\` — DataFrame с индексом \`city\` и столбцами \`t_mean\` (средняя температура) и \`rain\` (сумма \`precipitation_mm\`).
4. \`warmest\` — самый тёплый город (по средней \`t_mean\`).
5. Сохраните \`weather\` в \`weather_march.csv\` (без индекса) и \`weather_march.json\` (\`orient="records"\`, \`force_ascii=False\`, \`date_format="iso"\`).
`,
      starter: R`import requests
import pandas as pd

cities = ["tashkent", "samarkand", "bukhara", "nukus"]
frames = []
for c in cities:
    ...

weather = ...
weather["date"] = ...
weather["t_mean"] = ...

summary = ...
warmest = ...

# сохраните weather в CSV и JSON

print(summary.round(1))
print("Самый тёплый город:", warmest)
`,
      check: R`
import os, json
import pandas as pd
import requests
fr = []
for c in ["tashkent", "samarkand", "bukhara", "nukus"]:
    fr.append(pd.json_normalize(requests.get(ns["API"] + f"weather/{c}.json").json(), record_path="daily", meta=["city"]))
e = pd.concat(fr, ignore_index=True)
e["t_mean"] = (e["t_min"] + e["t_max"]) / 2
w = var("weather", pd.DataFrame)
ok(len(w) == len(e), f"В weather {len(e)} строк (4 города × 31 день)")
ok("city" in w.columns and set(w["city"]) == set(e["city"]), "Столбец city содержит 4 города: " + ", ".join(sorted(set(e["city"]))))
ok("date" in w.columns and pd.api.types.is_datetime64_any_dtype(w["date"]), "date преобразован в datetime")
ok("t_mean" in w.columns and abs(w["t_mean"].sum() - e["t_mean"].sum()) < 0.01, "t_mean = (t_min + t_max) / 2")
s = var("summary", pd.DataFrame)
es = e.groupby("city").agg(t_mean=("t_mean", "mean"), rain=("precipitation_mm", "sum"))
ok({"t_mean", "rain"} <= set(s.columns) and set(s.index) == set(es.index), "summary: индекс city, столбцы t_mean и rain")
if {"t_mean", "rain"} <= set(s.columns) and set(s.index) == set(es.index):
    ok(all(abs(s.loc[k, "t_mean"] - es.loc[k, "t_mean"]) < 0.01 and abs(s.loc[k, "rain"] - es.loc[k, "rain"]) < 0.01 for k in es.index), "Значения summary посчитаны верно")
ok(var("warmest") == es["t_mean"].idxmax(), f"warmest = {es['t_mean'].idxmax()}")
ok(os.path.exists("weather_march.csv") and len(pd.read_csv("weather_march.csv")) == len(e), "Создан weather_march.csv со всеми строками")
if os.path.exists("weather_march.json"):
    with open("weather_march.json", encoding="utf-8") as f:
        j = json.load(f)
    ok(isinstance(j, list) and len(j) == len(e) and "city" in j[0], "weather_march.json — список записей (orient='records')")
else:
    ok(False, "Создан файл weather_march.json")
`,
      hint: "В цикле: `d = requests.get(API + f\"weather/{c}.json\").json()` и `frames.append(pd.json_normalize(d, record_path=\"daily\", meta=[\"city\"]))`. Сводка: `weather.groupby(\"city\").agg(t_mean=(\"t_mean\", \"mean\"), rain=(\"precipitation_mm\", \"sum\"))`.",
      solution: R`import requests
import pandas as pd

cities = ["tashkent", "samarkand", "bukhara", "nukus"]
frames = []
for c in cities:
    r = requests.get(API + f"weather/{c}.json")
    r.raise_for_status()
    d = r.json()
    frames.append(pd.json_normalize(d, record_path="daily", meta=["city"]))

weather = pd.concat(frames, ignore_index=True)
weather["date"] = pd.to_datetime(weather["date"])
weather["t_mean"] = (weather["t_min"] + weather["t_max"]) / 2

summary = weather.groupby("city").agg(t_mean=("t_mean", "mean"), rain=("precipitation_mm", "sum"))
warmest = summary["t_mean"].idxmax()

weather.to_csv("weather_march.csv", index=False)
weather.to_json("weather_march.json", orient="records", force_ascii=False, date_format="iso")

print(summary.round(1))
print("Самый тёплый город:", warmest)
`,
    },
    {
      id: "t6",
      title: "Коды ответа и обработка ошибок",
      text: R`
Не каждый запрос успешен. Напишите надёжную функцию загрузки.

1. \`fetch_json(url)\` — делает GET-запрос; если код ответа ошибочный (4xx/5xx) или произошла сетевая ошибка, печатает сообщение и возвращает \`None\`, иначе возвращает \`r.json()\`. Используйте \`raise_for_status()\` и \`try/except requests.exceptions.RequestException\`.
2. \`codes\` — словарь \`{эндпоинт: код ответа}\` для всех эндпоинтов из списка \`endpoints\`.
3. \`loaded\` — сколько эндпоинтов из списка функция \`fetch_json\` загрузила успешно (вернула не \`None\`).
`,
      starter: R`import requests

endpoints = ["books/1.json", "books/99.json", "authors.json",
             "weather/tashkent.json", "weather/andijan.json", "books/page-5.json"]

def fetch_json(url):
    r = requests.get(url, timeout=10)
    return r.json()

codes = {}
for ep in endpoints:
    ...

loaded = ...

print(codes)
print("Загружено успешно:", loaded, "из", len(endpoints))
`,
      check: R`
import requests
api = ns["API"]
eps = ["books/1.json", "books/99.json", "authors.json", "weather/tashkent.json", "weather/andijan.json", "books/page-5.json"]
exp = {ep: requests.get(api + ep).status_code for ep in eps}
fj = var("fetch_json")
ok(callable(fj), "fetch_json — функция")
try:
    bad = fj(api + "books/99.json")
    ok(bad is None, "fetch_json возвращает None для отсутствующего ресурса (404)")
except Exception as ex:
    ok(False, f"fetch_json не должна падать на 404, а сейчас: {type(ex).__name__}")
good = fj(api + "books/1.json")
ok(isinstance(good, dict) and good.get("id") == 1, "fetch_json возвращает словарь для существующего ресурса")
ok(uses("raise_for_status") or uses("status_code") or uses(".ok"), "Код ответа проверяется (raise_for_status или status_code)")
ok(var("codes", dict) == exp, f"codes — коды ответа: {exp}")
ok(var("loaded") == sum(v == 200 for v in exp.values()), f"loaded = {sum(v == 200 for v in exp.values())}")
`,
      hint: "Шаблон: `try: r = requests.get(url, timeout=10); r.raise_for_status(); return r.json()` и `except requests.exceptions.RequestException as e: print(\"Ошибка:\", e); return None`. Подсчёт: `sum(fetch_json(API + ep) is not None for ep in endpoints)`.",
      solution: R`import requests

endpoints = ["books/1.json", "books/99.json", "authors.json",
             "weather/tashkent.json", "weather/andijan.json", "books/page-5.json"]

def fetch_json(url):
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        r.encoding = "utf-8"
        return r.json()
    except requests.exceptions.RequestException as e:
        print("Ошибка:", e)
        return None

codes = {}
for ep in endpoints:
    codes[ep] = requests.get(API + ep).status_code

loaded = sum(fetch_json(API + ep) is not None for ep in endpoints)

print(codes)
print("Загружено успешно:", loaded, "из", len(endpoints))
`,
    },
  ],
  quiz: [
    { q: "Какой код HTTP означает, что запрошенный ресурс не найден?", options: ["200", "301", "404", "500"], answer: 2, explain: "4xx — ошибки клиента (404 — нет такого ресурса), 5xx — ошибки сервера." },
    { q: "Что делает `r.raise_for_status()`?", options: ["Бросает исключение HTTPError, если код ответа 4xx или 5xx", "Повторяет запрос", "Печатает код ответа", "Меняет кодировку"], answer: 0 },
    { q: "Зачем перед `r.text` писать `r.encoding = \"utf-8\"`?", options: ["Чтобы ускорить загрузку", "Чтобы получить JSON", "Это обязательный параметр запроса", "Чтобы узбекские и русские буквы не превратились в «кракозябры», если сервер не указал charset"], answer: 3, explain: "Без charset в заголовке `requests` может выбрать ISO-8859-1 и неверно декодировать текст." },
    { q: "Как понять, что страница пагинации последняя?", options: ["Код ответа 404", "Поле `next` равно null (None)", "Список results пуст", "Поле page равно 1"], answer: 1, explain: "Учебный API, как и многие настоящие, сообщает адрес следующей страницы; на последней странице он пуст." },
    { q: "Какой вызов развернёт массив `daily` из ответа погодного API в строки таблицы, добавив поле `city`?", options: ["`pd.DataFrame(d)`", "`pd.read_json(d)`", "`pd.json_normalize(d, record_path=\"daily\", meta=[\"city\"])`", "`pd.concat(d[\"daily\"])`"], answer: 2 },
    { q: "Что вернёт `r.json()`?", options: ["Строку с JSON", "Объект Python: словарь или список", "DataFrame", "Байты"], answer: 1, explain: "`r.json()` разбирает тело ответа (как `json.loads(r.text)`) и возвращает dict или list." },
  ],
  realEnv: R`
## Как выполнить работу с настоящими API

В **Jupyter** или **Colab** код работает так же, нужно лишь заменить \`API\` на адрес реального сервиса. Примеры бесплатных API без ключа:

\`\`\`python
import requests
import pandas as pd

# Погода в Ташкенте (Open-Meteo, без ключа)
url = "https://api.open-meteo.com/v1/forecast"
params = {"latitude": 41.31, "longitude": 69.28, "daily": "temperature_2m_max,temperature_2m_min",
          "timezone": "Asia/Tashkent"}
r = requests.get(url, params=params, timeout=10)   # params собирает строку ?latitude=...&...
r.raise_for_status()
d = r.json()
df = pd.DataFrame(d["daily"])

# Курсы валют Центрального банка Узбекистана
rates = pd.DataFrame(requests.get("https://cbu.uz/uz/arkhiv-kursov-valyut/json/", timeout=10).json())
\`\`\`

| API | Что даёт | Ключ |
|---|---|---|
| [open-meteo.com](https://open-meteo.com) | погода и прогноз по координатам | не нужен |
| [cbu.uz — курсы валют](https://cbu.uz/uz/arkhiv-kursov-valyut/) | курсы ЦБ Узбекистана в JSON | не нужен |
| [Wikipedia API](https://uz.wikipedia.org/w/api.php) | статьи узбекской Википедии | не нужен |
| [openlibrary.org](https://openlibrary.org/developers/api) | каталог книг | не нужен |
| Telegram Bot API, X API | сообщения, посты | нужен токен |

> [!WARNING] Ключи API
> Токены и ключи нельзя писать прямо в код и выкладывать на GitHub. Храните их в переменных окружения: \`os.environ["API_KEY"]\` или в файле \`.env\`, добавленном в \`.gitignore\`.
`,
  homework: R`
## Самостоятельная работа: «Изучение возможностей библиотеки Pandas»

1. Загрузите \`API + "authors.json"\` и объедините его с таблицей книг (\`books\` из задания 3) так, чтобы у каждой книги появилась страна автора (\`explode\` по списку \`books\` автора и \`merge\` по id).
2. Через Open-Meteo в Colab получите прогноз на неделю для Ташкента, Самарканда, Бухары и Нукуса одним циклом и постройте линейный график максимальной температуры.
3. Напишите функцию \`fetch_all(first_url)\`, которая обходит любую пагинацию с полем \`next\` и возвращает DataFrame; добавьте паузу \`time.sleep(0.5)\` между запросами и повтор запроса (до 3 раз) при коде 429 или 5xx.
`,
});
