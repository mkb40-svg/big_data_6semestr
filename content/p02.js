BDT.register({
  id: "p02",
  kind: "practice",
  num: 2,
  title: "Анализ модели 5V Big Data на примере различных наборов данных",
  hours: 2,
  env: ["python"],
  goals: [
    "Понять, что означает каждая из пяти характеристик Big Data: Volume, Velocity, Variety, Veracity, Value",
    "Научиться измерять характеристики 5V с помощью `pandas`: размер, скорость поступления, разнообразие, качество",
    "Оценить реальные наборы данных по модели 5V и решить, какие из них действительно относятся к Big Data",
  ],
  theory: R`
## Модель 5V

«Большие данные» — это не просто «много данных». Набор данных относят к Big Data, когда обычные инструменты (Excel, одна база данных на ноутбуке) перестают справляться с ним сразу по нескольким причинам. Эти причины описывает модель **5V**:

| V | Вопрос | Как измерить | Инструмент pandas |
|---|---|---|---|
| **Volume** (объём) | Сколько данных? | байты, строки, рост за год | \`os.path.getsize\`, \`len(df)\`, \`df.memory_usage(deep=True)\` |
| **Velocity** (скорость) | Как быстро поступают? | записей в секунду/минуту, пиковая нагрузка | \`pd.to_datetime\`, \`resample\`, \`dt.floor\` |
| **Variety** (разнообразие) | Насколько они разные? | число форматов, источников, языков, платформ | \`value_counts\`, \`nunique\`, \`str.split\` |
| **Veracity** (достоверность) | Можно ли им доверять? | % пропусков, дубликатов, ошибок | \`isna().mean()\`, \`duplicated()\` |
| **Value** (ценность) | Какую пользу можно извлечь? | ответы на бизнес-вопросы | \`groupby\`, \`str.findall\`, сводные таблицы |

Иногда добавляют ещё **Variability** (изменчивость смысла и формата) и **Visualization**, получая модель 7V, но основу составляют пять перечисленных.

> [!NOTE] Big Data — это не только размер
> Поток постов из Telegram за полчаса весит меньше мегабайта, но поступает непрерывно, на трёх языках и в двух алфавитах, с дублями и пропусками. Для компьютерного лингвиста такой поток — типичная Big Data-задача: важны скорость и разнообразие, а не только объём.

## Volume: объём

\`\`\`python
import os
import pandas as pd

size_bytes = os.path.getsize("data/tweets_stream.csv")   # размер файла на диске
tweets = pd.read_csv("data/tweets_stream.csv")
mem = tweets.memory_usage(deep=True).sum()              # память в ОЗУ, байт
print(size_bytes / 1024, "КБ на диске;", mem / 1024, "КБ в памяти")
\`\`\`

Параметр \`deep=True\` обязателен: без него pandas не учитывает реальную длину строк, и объём текстовых столбцов сильно занижается. Единицы: 1 КБ = 1024 байта, 1 МБ = 1024 КБ, 1 ГБ = 1024 МБ, 1 ТБ = 1024 ГБ.

Объём полезно **экстраполировать**: если за 30 минут пришло \`N\` постов, то за сутки придёт \`N * 2 * 24\`, а за год — \`N * 2 * 24 * 365\`.

## Velocity: скорость

\`\`\`python
tweets["timestamp"] = pd.to_datetime(tweets["timestamp"])
duration = tweets["timestamp"].max() - tweets["timestamp"].min()   # Timedelta
per_second = len(tweets) / duration.total_seconds()

# число постов в каждую минуту — два равноценных способа
per_minute = tweets.set_index("timestamp").resample("1min").size()
per_minute = tweets["timestamp"].dt.floor("min").value_counts().sort_index()
per_minute.max(), per_minute.idxmax()                              # пик нагрузки
\`\`\`

Систему проектируют под **пиковую**, а не среднюю нагрузку: если в праздник Навруз число постов выросло в 10 раз, сервер не должен «упасть».

## Variety: разнообразие

\`\`\`python
tweets["platform"].value_counts(normalize=True) * 100   # доли платформ в %
tweets["lang"].nunique()                                # число языков
tweets["text"].str.contains("[А-Яа-яЁё]", na=False)      # текст на кириллице?

catalog = pd.read_csv("data/datasets_catalog.csv")
catalog["formats"].str.split(", ")                      # "CSV, Parquet" -> ["CSV", "Parquet"]
\`\`\`

Для узбекского языка разнообразие особенно заметно: одни и те же слова пишут латиницей и кириллицей, апостроф в *oʻ, gʻ* набирают пятью разными символами.

## Veracity: достоверность

\`\`\`python
tweets.isna().mean() * 100        # % пропусков в каждом столбце
tweets.duplicated().sum()         # число полностью повторяющихся строк
clean = tweets.drop_duplicates().dropna(subset=["text"])
\`\`\`

Пропуски и дубликаты искажают статистику: повторённый пост «накручивает» популярность хештега, а пустой текст бесполезен для лингвистического анализа.

## Value: ценность

Ценность — это ответ на конкретный вопрос: какие темы обсуждают, на какой платформе аудитория активнее, из каких городов пишут. Например, хештеги извлекаются регулярным выражением:

\`\`\`python
tags = clean["text"].str.findall(r"#\w+").explode().value_counts()
tags.head()      # самые популярные хештеги
\`\`\`

> [!TIP] Каталог наборов данных
> Файл \`data/datasets_catalog.csv\` описывает 10 наборов: от журнала турникетов Ташкентского метро до оценок одной студенческой группы. Столбцы: \`size_gb\`, \`records\`, \`update_freq\`, \`formats\`, \`sources\`, \`missing_pct\`, \`duplicates_pct\`, \`value\`. По ним можно сравнить наборы по модели 5V.
`,
  tasks: [
    {
      id: "t1",
      env: "choice",
      title: "Какая это V?",
      text: R`
Ниже перечислены факты о потоке постов \`data/tweets_stream.csv\`. Какие из них относятся к характеристике **Veracity** (достоверность)? Выберите все подходящие варианты.
`,
      options: [
        "60 строк полностью повторяют другие посты",
        "У 322 постов не заполнено поле location",
        "Посты написаны на трёх языках: uz, ru, en",
        "В среднем приходит около 69 постов в минуту",
        "Часть постов содержит изображения",
      ],
      answer: [0, 1],
      explain: R`Дубликаты и пропуски снижают **достоверность** данных (Veracity). Три языка и картинки — это **Variety**, 69 постов в минуту — **Velocity**.`,
    },
    {
      id: "t2",
      title: "Volume: объём потока",
      text: R`
Файл \`data/tweets_stream.csv\` содержит посты из соцсетей за **30 минут**. Оцените его объём:

- \`tweets\` — DataFrame с данными файла, \`n_rows\` — число строк;
- \`file_kb\` — размер файла на диске в килобайтах (\`os.path.getsize(...) / 1024\`), округлите до 1 знака;
- \`mem_kb\` — объём DataFrame в памяти в килобайтах (\`memory_usage(deep=True).sum() / 1024\`), до 1 знака;
- \`bytes_per_post\` — сколько байт файла приходится в среднем на один пост;
- \`year_gb\` — прогноз: сколько **гигабайт** накопится за год, если посты будут поступать с той же скоростью (за год пройдёт \`2 * 24 * 365\` таких получасовых интервалов). Округлите до 2 знаков.
`,
      starter: R`import os
import pandas as pd

tweets = ...
n_rows = ...
file_kb = ...
mem_kb = ...
bytes_per_post = ...
year_gb = ...

print(f"Постов: {n_rows}, файл: {file_kb} КБ, в памяти: {mem_kb} КБ")
print(f"В среднем {bytes_per_post} байт на пост")
print(f"За год: {year_gb} ГБ; 1000 таких каналов: {year_gb * 1000 / 1024:.1f} ТБ")
`,
      check: R`
import os
import pandas as pd
t = pd.read_csv("data/tweets_stream.csv")
size = os.path.getsize("data/tweets_stream.csv")
tw = var("tweets", pd.DataFrame)
ok(tw.shape == t.shape, f"tweets содержит {t.shape[0]} строк и {t.shape[1]} столбцов")
ok(var("n_rows") == len(t), f"n_rows = {len(t)}")
ok(abs(float(var("file_kb")) - size / 1024) <= 0.06, f"file_kb ≈ {size / 1024:.1f}")
mem = t.memory_usage(deep=True).sum() / 1024
ok(abs(float(var("mem_kb")) - mem) <= 0.06, f"mem_kb ≈ {mem:.1f} (memory_usage с deep=True)")
ok(abs(float(var("bytes_per_post")) - size / len(t)) <= 0.06, f"bytes_per_post ≈ {size / len(t):.1f}")
yg = size * 2 * 24 * 365 / 1024 ** 3
ok(abs(float(var("year_gb")) - yg) <= 0.006, f"year_gb ≈ {yg:.2f}")
`,
      hint: "`os.path.getsize(путь)` возвращает байты. Годовой объём: `bytes_per_post * n_rows * 2 * 24 * 365 / 1024**3`.",
      solution: R`import os
import pandas as pd

tweets = pd.read_csv("data/tweets_stream.csv")
n_rows = len(tweets)
size = os.path.getsize("data/tweets_stream.csv")
file_kb = round(size / 1024, 1)
mem_kb = round(tweets.memory_usage(deep=True).sum() / 1024, 1)
bytes_per_post = size / n_rows
year_gb = round(bytes_per_post * n_rows * 2 * 24 * 365 / 1024 ** 3, 2)

print(f"Постов: {n_rows}, файл: {file_kb} КБ, в памяти: {mem_kb} КБ")
print(f"В среднем {bytes_per_post:.1f} байт на пост")
print(f"За год: {year_gb} ГБ; 1000 таких каналов: {year_gb * 1000 / 1024:.1f} ТБ")
`,
    },
    {
      id: "t3",
      title: "Velocity: скорость поступления",
      setup: R`import pandas as pd
tweets = pd.read_csv("data/tweets_stream.csv")`,
      text: R`
DataFrame \`tweets\` уже загружен. Измерьте скорость потока:

1. Преобразуйте столбец \`timestamp\` в тип datetime (\`pd.to_datetime\`).
2. \`duration_min\` — длительность наблюдения в минутах (разница между последним и первым постом).
3. \`per_second\` — среднее число постов в секунду.
4. \`per_minute\` — Series: сколько постов пришло в **каждую минуту** (индекс — минута, значение — число постов).
5. \`peak_count\` — максимальное число постов за минуту, \`peak_minute\` — минута, когда он был достигнут.
6. Постройте линейный график \`per_minute\` (\`per_minute.plot()\`).

Обратите внимание: последняя минута (10:30) неполная — в неё попал всего один пост.
`,
      starter: R`import matplotlib.pyplot as plt

tweets["timestamp"] = ...
duration_min = ...
per_second = ...

per_minute = ...
peak_count = ...
peak_minute = ...

print(f"Наблюдение: {duration_min:.1f} мин, {per_second:.2f} поста/с")
print("Пик:", peak_minute, peak_count)
`,
      check: R`
import pandas as pd
t = pd.read_csv("data/tweets_stream.csv")
ts = pd.to_datetime(t["timestamp"])
dur = (ts.max() - ts.min()).total_seconds()
tw = var("tweets", pd.DataFrame)
ok(pd.api.types.is_datetime64_any_dtype(tw["timestamp"]), "Столбец timestamp преобразован в datetime")
ok(abs(float(var("duration_min")) - dur / 60) < 0.02, f"duration_min ≈ {dur / 60:.2f}")
ok(abs(float(var("per_second")) - len(t) / dur) < 0.006, f"per_second ≈ {len(t) / dur:.2f}")
pm = var("per_minute", pd.Series)
exp = ts.dt.floor("min").value_counts()
ok(int(pm.sum()) == len(t) and int(pm.max()) == int(exp.max()), "per_minute — число постов по минутам (сумма = числу постов, максимум = 71)")
ok(int(var("peak_count")) == int(exp.max()), f"peak_count = {int(exp.max())}")
pk = var("peak_minute")
peaks = exp[exp == exp.max()].index
ok(any(str(pk) in (str(p), p.strftime("%H:%M"), p.strftime("%Y-%m-%d %H:%M")) for p in peaks), "peak_minute — минута с максимальным числом постов")
ok(len(figs) >= 1, "Построен график per_minute")
`,
      hint: "Длительность: `(tweets[\"timestamp\"].max() - tweets[\"timestamp\"].min()).total_seconds()`. Посты по минутам: `tweets.set_index(\"timestamp\").resample(\"1min\").size()`; пик — `max()` и `idxmax()`.",
      solution: R`import matplotlib.pyplot as plt

tweets["timestamp"] = pd.to_datetime(tweets["timestamp"])
seconds = (tweets["timestamp"].max() - tweets["timestamp"].min()).total_seconds()
duration_min = seconds / 60
per_second = len(tweets) / seconds

per_minute = tweets.set_index("timestamp").resample("1min").size()
peak_count = per_minute.max()
peak_minute = per_minute.idxmax()

print(f"Наблюдение: {duration_min:.1f} мин, {per_second:.2f} поста/с")
print("Пик:", peak_minute, peak_count)

per_minute.plot(title="Постов в минуту", marker="o")
plt.ylabel("постов")
plt.show()
`,
    },
    {
      id: "t4",
      title: "Variety: платформы, языки, форматы",
      setup: R`import pandas as pd
tweets = pd.read_csv("data/tweets_stream.csv")
catalog = pd.read_csv("data/datasets_catalog.csv")`,
      text: R`
Загружены \`tweets\` (поток постов) и \`catalog\` (каталог из 10 наборов данных). Оцените разнообразие:

- \`platform_share\` — доля каждой платформы в процентах (Series, сумма ≈ 100);
- \`n_platforms\` и \`n_langs\` — число различных платформ и языков;
- \`n_cyr\` — сколько постов содержат буквы **кириллицы** (регулярное выражение \`[А-Яа-яЁё]\`, пропуски не считать);
- столбец \`catalog["n_formats"]\` — сколько форматов указано у каждого набора (форматы перечислены через \`", "\`);
- \`all_formats\` — **множество** (set) всех различных форматов, встречающихся в каталоге.
`,
      starter: R`platform_share = ...
n_platforms = ...
n_langs = ...
n_cyr = ...

catalog["n_formats"] = ...
all_formats = ...

print(platform_share.round(1))
print("Платформ:", n_platforms, "языков:", n_langs, "постов кириллицей:", n_cyr)
print(len(all_formats), "форматов:", sorted(all_formats))
catalog[["name", "formats", "n_formats"]]
`,
      check: R`
import pandas as pd
t = pd.read_csv("data/tweets_stream.csv")
c = pd.read_csv("data/datasets_catalog.csv")
ps = var("platform_share", pd.Series)
exp = t["platform"].value_counts(normalize=True) * 100
ok(abs(ps.sum() - 100) < 0.5 and abs(float(ps.get("telegram", 0)) - exp["telegram"]) < 0.06, f"platform_share — доли платформ в % (telegram ≈ {exp['telegram']:.1f})")
ok(var("n_platforms") == t["platform"].nunique(), f"n_platforms = {t['platform'].nunique()}")
ok(var("n_langs") == t["lang"].nunique(), f"n_langs = {t['lang'].nunique()}")
c1 = int(t["text"].str.contains("[А-Яа-яЁё]", na=False).sum())
c2 = int(t["text"].str.contains("[А-Яа-яЁёЎўҚқҒғҲҳ]", na=False).sum())
ok(var("n_cyr") in (c1, c2), f"n_cyr = {c1}")
cat = var("catalog", pd.DataFrame)
nf = c["formats"].str.split(",").apply(len)
ok("n_formats" in cat.columns and list(cat["n_formats"].astype(int)) == list(nf), "Столбец n_formats — число форматов каждого набора")
fs = set(x.strip() for s in c["formats"] for x in s.split(","))
af = var("all_formats")
ok(isinstance(af, set), "all_formats — множество (set)")
ok(set(str(x).strip() for x in af) == fs, f"all_formats содержит {len(fs)} различных форматов (без пробелов)")
`,
      hint: "`value_counts(normalize=True) * 100` даёт проценты. Форматы: `catalog[\"formats\"].str.split(\", \")` — списки; длина — `.str.len()`; множество — `set(catalog[\"formats\"].str.split(\", \").explode())`.",
      solution: R`platform_share = tweets["platform"].value_counts(normalize=True) * 100
n_platforms = tweets["platform"].nunique()
n_langs = tweets["lang"].nunique()
n_cyr = tweets["text"].str.contains("[А-Яа-яЁё]", na=False).sum()

parts = catalog["formats"].str.split(", ")
catalog["n_formats"] = parts.str.len()
all_formats = set(parts.explode())

print(platform_share.round(1))
print("Платформ:", n_platforms, "языков:", n_langs, "постов кириллицей:", n_cyr)
print(len(all_formats), "форматов:", sorted(all_formats))
catalog[["name", "formats", "n_formats"]]
`,
    },
    {
      id: "t5",
      title: "Veracity: пропуски и дубликаты",
      setup: R`import pandas as pd
tweets = pd.read_csv("data/tweets_stream.csv")`,
      text: R`
Оцените достоверность потока \`tweets\` и подготовьте чистую версию:

- \`missing_pct\` — Series: процент пропусков в каждом столбце;
- \`n_dups\` — число строк, которые полностью повторяют предыдущие;
- \`clean\` — копия без дубликатов и без постов с пустым \`text\`; пропуски в \`location\` замените строкой \`"noma'lum"\` («неизвестно»);
- \`quality\` — какой процент исходных строк остался в \`clean\` (округлите до 1 знака).
`,
      starter: R`missing_pct = ...
n_dups = ...

clean = ...

quality = ...

print(missing_pct.round(1))
print("Дубликатов:", n_dups)
print(f"Осталось {len(clean)} из {len(tweets)} строк ({quality}%)")
`,
      check: R`
import pandas as pd
t = pd.read_csv("data/tweets_stream.csv")
mp = var("missing_pct", pd.Series)
exp = t.isna().mean() * 100
ok(abs(float(mp.get("location", -1)) - exp["location"]) < 0.06 and abs(float(mp.get("text", -1)) - exp["text"]) < 0.06, f"missing_pct — % пропусков (location ≈ {exp['location']:.1f}%, text ≈ {exp['text']:.1f}%)")
ok(var("n_dups") == t.duplicated().sum(), f"n_dups = {t.duplicated().sum()}")
cl = var("clean", pd.DataFrame)
e = t.drop_duplicates().dropna(subset=["text"])
ok(not cl.duplicated().any(), "В clean нет дубликатов")
ok(cl["text"].notna().all(), "В clean нет постов без текста")
ok(cl["location"].notna().all() and (cl["location"] == "noma'lum").sum() == e["location"].isna().sum(), "Пропуски location заменены на «noma'lum»")
ok(len(cl) == len(e), f"В clean {len(e)} строк")
q = len(e) / len(t) * 100
ok(abs(float(var("quality")) - q) <= 0.06, f"quality ≈ {q:.1f}")
`,
      hint: "`tweets.isna().mean() * 100`, `tweets.duplicated().sum()`. Цепочка: `tweets.drop_duplicates().dropna(subset=[\"text\"])`, затем `clean[\"location\"] = clean[\"location\"].fillna(\"noma'lum\")`.",
      solution: R`missing_pct = tweets.isna().mean() * 100
n_dups = tweets.duplicated().sum()

clean = tweets.drop_duplicates().dropna(subset=["text"]).copy()
clean["location"] = clean["location"].fillna("noma'lum")

quality = round(len(clean) / len(tweets) * 100, 1)

print(missing_pct.round(1))
print("Дубликатов:", n_dups)
print(f"Осталось {len(clean)} из {len(tweets)} строк ({quality}%)")
`,
    },
    {
      id: "t6",
      title: "Value: что обсуждают и где",
      setup: R`import pandas as pd
tweets = pd.read_csv("data/tweets_stream.csv")
clean = tweets.drop_duplicates().dropna(subset=["text"]).copy()`,
      text: R`
Из очищенного потока \`clean\` извлеките полезные знания:

- \`hashtags\` — Series: частоты хештегов по убыванию (хештег — \`#\` и следующие за ним буквы/цифры, регулярное выражение \`#\w+\`);
- \`top_tag\` — самый популярный хештег;
- добавьте столбец \`engagement = likes + 2 * reposts\` (репост ценнее лайка);
- \`best_platform\` — платформа с наибольшим **средним** \`engagement\`;
- \`top_city\` — город (\`location\`), откуда пришло больше всего постов.
`,
      starter: R`hashtags = ...
top_tag = ...

clean["engagement"] = ...
best_platform = ...
top_city = ...

print(hashtags.head())
print("Тренд:", top_tag, "| платформа:", best_platform, "| город:", top_city)
`,
      check: R`
import pandas as pd
t = pd.read_csv("data/tweets_stream.csv")
c = t.drop_duplicates().dropna(subset=["text"]).copy()
tags = c["text"].str.findall(r"#\w+").explode().dropna().value_counts()
h = var("hashtags", pd.Series)
ok(int(h.max()) == int(tags.max()) and len(h) >= len(tags), f"hashtags — частоты хештегов (лидер встречается {int(tags.max())} раз)")
ok(str(var("top_tag")).lstrip("#") == tags.index[0].lstrip("#"), f"top_tag = {tags.index[0]}")
cl = var("clean", pd.DataFrame)
ok("engagement" in cl.columns and (cl["engagement"] == cl["likes"] + 2 * cl["reposts"]).all(), "Столбец engagement = likes + 2 * reposts")
c["engagement"] = c["likes"] + 2 * c["reposts"]
bp = c.groupby("platform")["engagement"].mean().idxmax()
ok(var("best_platform") == bp, f"best_platform = {bp}")
ok(var("top_city") == c["location"].value_counts().idxmax(), "top_city определён верно")
`,
      hint: "`clean[\"text\"].str.findall(r\"#\\w+\")` возвращает списки хештегов; `.explode().value_counts()` превращает их в частоты. Среднее по группам: `groupby(\"platform\")[\"engagement\"].mean().idxmax()`.",
      solution: R`hashtags = clean["text"].str.findall(r"#\w+").explode().value_counts()
top_tag = hashtags.index[0]

clean["engagement"] = clean["likes"] + 2 * clean["reposts"]
best_platform = clean.groupby("platform")["engagement"].mean().idxmax()
top_city = clean["location"].value_counts().idxmax()

print(hashtags.head())
print("Тренд:", top_tag, "| платформа:", best_platform, "| город:", top_city)
`,
    },
    {
      id: "t7",
      title: "Оценка наборов данных по 5V",
      setup: R`import pandas as pd
catalog = pd.read_csv("data/datasets_catalog.csv")`,
      text: R`
Оцените 10 наборов из \`catalog\` по трём «техническим» V. Добавьте столбцы со значениями 0 или 1:

| Столбец | 1, если… |
|---|---|
| \`volume\` | \`size_gb\` не меньше 100 |
| \`velocity\` | данные обновляются не реже раза в час: \`update_freq\` — одно из \`"real-time"\`, \`"har 10 daqiqa"\`, \`"har soat"\` |
| \`variety\` | в \`formats\` указано два формата или больше |

Затем:

- \`score\` = \`volume + velocity + variety\`;
- \`big_data\` — **список** названий (\`name\`) наборов с \`score\` ≥ 2;
- выведите таблицу, отсортированную по \`score\` по убыванию.
`,
      starter: R`fast = ["real-time", "har 10 daqiqa", "har soat"]

catalog["volume"] = ...
catalog["velocity"] = ...
catalog["variety"] = ...
catalog["score"] = ...

big_data = ...

print("Big Data:", big_data)
catalog.sort_values("score", ascending=False)[["name", "volume", "velocity", "variety", "score", "value"]]
`,
      check: R`
import pandas as pd
c = pd.read_csv("data/datasets_catalog.csv")
vol = (c["size_gb"] >= 100).astype(int)
vel = c["update_freq"].isin(["real-time", "har 10 daqiqa", "har soat"]).astype(int)
vrt = (c["formats"].str.split(",").str.len() >= 2).astype(int)
sc = vol + vel + vrt
cat = var("catalog", pd.DataFrame).sort_index()
for col, e in [("volume", vol), ("velocity", vel), ("variety", vrt), ("score", sc)]:
    ok(col in cat.columns and list(cat[col].astype(int)) == list(e), f"Столбец {col} рассчитан верно")
bd = var("big_data")
ok(isinstance(bd, list), "big_data — список")
ok(sorted(bd) == sorted(c.loc[sc >= 2, "name"]), f"big_data содержит {int((sc >= 2).sum())} набора(ов) со score ≥ 2")
`,
      hint: "Условие превращается в 0/1 так: `(catalog[\"size_gb\"] >= 100).astype(int)`. Для частоты — `catalog[\"update_freq\"].isin(fast)`. Список имён: `catalog.loc[catalog[\"score\"] >= 2, \"name\"].tolist()`.",
      solution: R`fast = ["real-time", "har 10 daqiqa", "har soat"]

catalog["volume"] = (catalog["size_gb"] >= 100).astype(int)
catalog["velocity"] = catalog["update_freq"].isin(fast).astype(int)
catalog["variety"] = (catalog["formats"].str.split(", ").str.len() >= 2).astype(int)
catalog["score"] = catalog["volume"] + catalog["velocity"] + catalog["variety"]

big_data = catalog.loc[catalog["score"] >= 2, "name"].tolist()

print("Big Data:", big_data)
catalog.sort_values("score", ascending=False)[["name", "volume", "velocity", "variety", "score", "value"]]
`,
    },
  ],
  quiz: [
    { q: "Какая характеристика Big Data описывает скорость поступления и обработки данных?", options: ["Volume", "Velocity", "Variety", "Value"], answer: 1, explain: "Velocity — скорость: сколько записей приходит в секунду и как быстро их нужно обработать (например, проверка банковской транзакции за доли секунды)." },
    { q: "Почему в `df.memory_usage()` указывают `deep=True`?", options: ["Чтобы ускорить подсчёт", "Чтобы удалить пустые столбцы", "Чтобы получить результат в мегабайтах", "Чтобы учесть реальный размер строк в текстовых столбцах"], answer: 3, explain: "Без `deep=True` для столбцов типа object считается только размер ссылок (8 байт), а не самих строк." },
    { q: "Каталог больницы хранит данные в форматах HL7, DICOM, PDF и CSV из 320 источников. Какая V здесь особенно выражена?", options: ["Variety", "Velocity", "Value", "Ни одна"], answer: 0, explain: "Много форматов и источников — это разнообразие (Variety): структурированные таблицы, снимки, документы." },
    { q: "Какое выражение даёт процент пропусков в каждом столбце DataFrame?", options: ["`df.isna().sum()`", "`df.dropna()`", "`df.isna().mean() * 100`", "`df.count() / 100`"], answer: 2, explain: "`isna()` даёт True/False, среднее по столбцу — доля True; умножив на 100, получаем проценты. `sum()` даёт количество, а не процент." },
    { q: "Как получить число постов в каждую минуту, если `timestamp` уже имеет тип datetime?", options: ["`df.groupby(\"timestamp\").size()`", "`df.set_index(\"timestamp\").resample(\"1min\").size()`", "`df[\"timestamp\"].nunique()`", "`df.resample(\"timestamp\")`"], answer: 1, explain: "`resample` группирует строки по интервалам времени; группировка по самому timestamp дала бы счёт по секундам." },
    { q: "Сколько гигабайт в одном терабайте (в двоичной системе единиц, как в `/ 1024 ** 3`)?", options: ["100", "1000", "1024", "8"], answer: 2 },
  ],
  realEnv: R`
## Как выполнить работу в реальной среде

1. Запустите **Jupyter Notebook** (Anaconda) или откройте **Google Colab**. Скачайте папку \`data/\` из репозитория тренажёра и положите рядом с блокнотом.
2. Код заданий работает без изменений: \`pd.read_csv("data/tweets_stream.csv")\`, \`os.path.getsize(...)\`.

### Где взять настоящие большие данные

| Источник | Что там | Какие V проявляются |
|---|---|---|
| [data.egov.uz](https://data.egov.uz) | Портал открытых данных Узбекистана (CSV, JSON, XML) | Variety, Value |
| [dumps.wikimedia.org/uzwiki](https://dumps.wikimedia.org/uzwiki/) | Дампы узбекской Википедии (XML, сотни МБ) | Volume, Variety |
| [Kaggle Datasets](https://www.kaggle.com/datasets) | Тысячи наборов: отзывы, твиты, транзакции | все пять |
| [Common Crawl](https://commoncrawl.org) | Петабайты веб-страниц, в т.ч. на узбекском | Volume, Veracity |

> [!WARNING] Настоящие потоки
> Посты из Telegram или X собирают через официальные API (например, библиотека \`telethon\` для Telegram). Соблюдайте правила платформ и законы о персональных данных: храните только то, что нужно для исследования, и обезличивайте имена пользователей.

Для настоящего потока (Velocity) данные обычно принимают через брокер сообщений **Apache Kafka**, а обрабатывают в **Spark Structured Streaming** — с этими инструментами вы познакомитесь в следующих работах.
`,
  homework: R`
## Самостоятельная работа: «Информационная безопасность и конфиденциальность данных в технологиях Big Data»

1. В \`tweets_stream.csv\` столбец \`user\` — это идентификатор человека. Замените его **псевдонимом**: хешем SHA-256 с «солью» (\`hashlib.sha256((salt + user).encode()).hexdigest()[:12]\`). Проверьте, что число уникальных пользователей не изменилось.
2. Подумайте, какие ещё столбцы могут раскрыть личность (\`location\`, текст поста). Как их обобщить (город → регион) без потери ценности (Value)?
3. Выберите любой набор из \`datasets_catalog.csv\` и напишите 5–7 предложений: какие риски конфиденциальности в нём есть и какие меры защиты (шифрование, разграничение доступа, анонимизация) вы бы применили.
`,
});
