(function () {
  const FIX = [{ db: "news", coll: "articles", file: "data/mongo/articles.json" }];
  const arts = (t) => t.db("news").docs("articles");
  const where = (t, filter) => arts(t).filter((d) => t.match(d, filter));
  // Учебные данные на месте? Если нет — подсказать, как восстановить коллекцию
  const dataOk = (t) => t.ok(t.db("news").count("articles", { category: { $exists: true }, views: { $exists: true } }) >= 16,
    "В news.articles есть 16 учебных статей. Если нет — выполните задание 1 (mongoimport ... --drop)");
  const titles = (r) => (Array.isArray(r) ? r.map((d) => d && d.title) : []);
  const sameSet = (a, b) => a.length === b.length && a.slice().sort().join("|") === b.slice().sort().join("|");
  const sameSeq = (a, b) => a.length === b.length && a.join("|") === b.join("|");
  const tokens = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}ʻʼ'‘’`]+/u).filter(Boolean);

  BDT.register({
    id: "p08",
    kind: "practice",
    num: 8,
    title: "Хранение и поиск данных в документо-ориентированной базе данных MongoDB",
    hours: 2,
    env: ["mongo"],
    goals: [
      "Искать документы корпуса новостей по полям, диапазонам, массивам и регулярным выражениям",
      "Создавать текстовый индекс и выполнять полнотекстовый поиск `$text` с ранжированием по `textScore`",
      "Оценивать запросы с помощью индексов и `explain()`: COLLSCAN и IXSCAN",
      "Строить конвейеры агрегации: `$group`, `$unwind`, `$sortByCount`, `$project`, `$lookup`",
    ],
    theory: R`
## Корпус текстов в MongoDB

Документная модель удобна для текстовых данных: статья вместе с метаданными, тегами и комментариями хранится одним документом.

\`\`\`javascript Документ коллекции news.articles
{
  article_id: 6,
  title: "Orol dengizi muammosi va yechimlari",
  category: "ekologiya",
  date: "2026-04-08",
  author: "Nilufar Qodirova",
  tags: ["Orol", "ekologiya", "suv"],
  views: 23659, likes: 832, words: 107,
  comments: [{ user: "user_119", text: "Rahmat, foydali maʼlumot" }],
  text: "Orol dengizining qurishi ..."
}
\`\`\`

> [!NOTE] Даты
> Строки в формате ISO (\`"2026-04-08"\`) сравниваются и сортируются правильно, поэтому диапазон \`{ $gte: "2026-04-01", $lt: "2026-05-01" }\` работает. В рабочих системах даты лучше хранить типом **Date** (\`ISODate("2026-04-08")\`): тогда доступны операторы \`$year\`, \`$month\`, \`$dateToString\` и часовые пояса.

## Поиск по полям

\`\`\`javascript
db.articles.find({ category: "turizm" })
// элемент массива
db.articles.find({ tags: "Toshkent" })
// диапазон дат-строк
db.articles.find({ date: { $gte: "2026-04-01", $lt: "2026-05-01" } }).sort({ date: 1 })
db.articles.find({ views: { $gt: 15000 } }, { _id: 0, title: 1, views: 1 }).sort({ views: -1 })
// поле внутри массива объектов
db.articles.find({ "comments.user": "user_75" })
\`\`\`

## Регулярные выражения и полнотекстовый поиск

| | \`$regex\` / \`/.../\` | \`$text\` |
|---|---|---|
| Что ищет | шаблон символов в одном поле | слова (токены) в нескольких полях |
| Индекс | обычный; эффективен только для \`/^префикс/\` | обязателен текстовый индекс |
| Регистр | флаг \`i\` | не учитывается |
| Релевантность | нет | оценка \`textScore\` |
| Морфология | вручную через шаблон | стемминг для поддерживаемых языков |

\`\`\`javascript
// заголовки, содержащие «raqam» в любом регистре
db.articles.find({ title: /raqam/i })

// текстовый индекс: один на коллекцию, может охватывать несколько полей
db.articles.createIndex({ title: "text", text: "text" }, { default_language: "none" })

// любое из слов (ИЛИ)
db.articles.find({ $text: { $search: "talabalar yoshlar" } })
// исключить слово
db.articles.find({ $text: { $search: "turizm -Buxoro" } })
// ранжирование по релевантности
db.articles.find(
  { $text: { $search: "talabalar" } },
  { title: 1, score: { $meta: "textScore" } }
).sort({ score: { $meta: "textScore" } })
\`\`\`

> [!NOTE] Узбекский язык и текстовый индекс
> Стемминг MongoDB поддерживает около 15 языков (english, russian, turkish и др.), узбекского среди них нет. Опция \`default_language: "none"\` отключает стемминг и стоп-слова: слова сравниваются точно, без учёта регистра. Поэтому «talaba» не найдёт «talabalar». Для морфологического поиска лемматизируйте тексты на Python и храните леммы в отдельном поле или используйте Atlas Search с собственными анализаторами.

## Индексы и explain()

Без индекса сервер читает **все** документы коллекции (**COLLSCAN**). Индекс — упорядоченная структура (B-дерево) из значений поля и ссылок на документы; по нему сервер сразу находит нужные ключи (**IXSCAN**).

\`\`\`javascript
db.articles.createIndex({ category: 1 })
// составной индекс: фильтр по category + сортировка по views
db.articles.createIndex({ category: 1, views: -1 })
db.articles.createIndex({ article_id: 1 }, { unique: true })
db.articles.getIndexes()
db.articles.dropIndex("category_1")
db.articles.find({ category: "turizm" }).explain("executionStats")
\`\`\`

| Поле \`explain()\` | Смысл |
|---|---|
| \`queryPlanner.winningPlan.stage\` | \`COLLSCAN\` — полный просмотр; \`FETCH\` с \`inputStage.stage: "IXSCAN"\` — поиск по индексу |
| \`executionStats.nReturned\` | сколько документов вернул запрос |
| \`executionStats.totalDocsExamined\` | сколько документов прочитано |
| \`executionStats.totalKeysExamined\` | сколько ключей индекса просмотрено |

> [!TIP] Хороший запрос
> \`totalDocsExamined\` близко к \`nReturned\`. Индексы ускоряют чтение, но замедляют каждую запись и занимают память, поэтому индексируют поля частых фильтров и сортировок, а не все подряд.

## Конвейер агрегации

\`aggregate([...])\` пропускает документы через последовательность **этапов**; выход одного этапа — вход следующего.

| Этап | Аналог в SQL | Назначение |
|---|---|---|
| \`$match\` | \`WHERE\` | фильтр |
| \`$group\` | \`GROUP BY\` | группы и агрегаты: \`$sum\`, \`$avg\`, \`$min\`, \`$max\`, \`$push\` |
| \`$sort\`, \`$limit\`, \`$skip\` | \`ORDER BY\`, \`LIMIT\`, \`OFFSET\` | порядок и размер результата |
| \`$project\`, \`$addFields\` | выражения в \`SELECT\` | выбор и вычисление полей |
| \`$unwind\` | — | один документ на каждый элемент массива |
| \`$sortByCount\` | \`GROUP BY\` + \`ORDER BY COUNT(*)\` | частоты значений |
| \`$lookup\` | \`LEFT JOIN\` | присоединить документы другой коллекции |
| \`$out\` | \`INSERT INTO ... SELECT\` | сохранить результат в коллекцию |

\`\`\`javascript
db.articles.aggregate([
  { $match: { date: { $gte: "2026-03-01" } } },
  { $group: { _id: "$category", articles: { $sum: 1 }, views: { $sum: "$views" } } },
  { $sort: { views: -1 } },
  { $limit: 3 }
])
\`\`\`

Строка со знаком доллара (\`"$views"\`) означает **значение поля** документа, \`{ $sum: 1 }\` считает документы. Частотный словарь тегов строится двумя этапами: \`{ $unwind: "$tags" }\` и \`{ $sortByCount: "$tags" }\`. Длина массива вычисляется выражением \`{ $size: "$comments" }\`, а соединение с другой коллекцией выглядит так:

\`\`\`javascript
{ $lookup: { from: "authors", localField: "author", foreignField: "name", as: "author_info" } }
\`\`\`
`,
    tasks: [
      {
        id: "t1",
        env: "mongo",
        title: "Импорт корпуса новостей",
        text: R`
Файл \`data/mongo/articles.json\` — 16 новостных статей на узбекском языке:

| Поле | Пример |
|---|---|
| \`article_id\`, \`title\` | \`1\`, \`"Toshkentda yangi IT-park ochildi"\` |
| \`category\`, \`date\`, \`author\` | \`"texnologiya"\`, \`"2026-01-14"\`, \`"Dilnoza Karimova"\` |
| \`tags\` | \`["IT", "startap", "Toshkent"]\` |
| \`views\`, \`likes\`, \`words\` | \`5339\`, \`578\`, \`114\` |
| \`comments\` | \`[{ user: "user_275", text: "Qoʻshilaman" }, ...]\` |
| \`text\` | полный текст статьи |

1. Импортируйте файл в базу \`news\`, коллекцию \`articles\`. Добавьте \`--drop\`, чтобы повторный запуск не создавал дубликаты.
2. Переключитесь на \`news\` и выведите число документов.
3. Выведите список различных категорий (\`distinct\`).
4. **Последней командой** выведите статью с \`article_id: 14\` — только поля \`title\`, \`author\`, \`tags\`, \`words\` (без длинного \`text\`).
`,
        starter: R`mongoimport --db news --collection articles --file data/mongo/articles.json --jsonArray

use news
// 2. Число документов

// 3. Различные категории

// 4. Статья 14 с проекцией

`,
        check: (t) => {
          const n = t.db("news").count("articles");
          t.ok(t.uses("mongoimport"), "Выполнен mongoimport");
          t.ok(n === 16, n > 16 ? "В news.articles " + n + " документов вместо 16 — добавьте флаг --drop" : "В news.articles 16 документов");
          t.ok(t.current === "news", "Текущая база — news");
          t.ok(t.results.includes(16), "Выведено число документов (16)");
          const cats = [...new Set(arts(t).map((d) => d.category))];
          t.ok(t.results.some((r) => Array.isArray(r) && r.every((x) => typeof x === "string") && sameSet(r, cats)), "Выведен список из " + cats.length + " различных категорий (distinct)");
          const a14 = arts(t).find((d) => d.article_id === 14) || {};
          const L = t.last;
          t.ok(!!L && !Array.isArray(L) && L.title === a14.title && L.author !== undefined && L.tags !== undefined, "Последняя команда выводит статью 14 с полями title, author, tags, words");
          t.ok(!!L && L.text === undefined && L.views === undefined, "В проекции нет лишних полей (text, views и др.)");
        },
        hint: "Проекция — второй аргумент: `db.articles.findOne({ article_id: 14 }, { title: 1, author: 1, tags: 1, words: 1 })`. Различные значения: `db.articles.distinct(\"category\")`.",
        solution: R`mongoimport --db news --collection articles --file data/mongo/articles.json --jsonArray --drop

use news
db.articles.countDocuments()
db.articles.distinct("category")
db.articles.findOne({ article_id: 14 }, { title: 1, author: 1, tags: 1, words: 1 })
`,
      },
      {
        id: "t2",
        env: "mongo",
        title: "Поиск по полям, массивам и диапазонам",
        fixtures: FIX,
        text: R`
В каждом запросе выводите поле \`title\` (проекция \`_id: 0, title: 1, ...\`).

1. Статьи с тегом **Toshkent** (поле \`tags\` — массив).
2. Статьи за **апрель 2026** года по возрастанию даты. Поле \`date\` — строка вида \`"2026-04-08"\`, поэтому подойдёт диапазон строк \`$gte\` / \`$lt\`.
3. **Последним запросом**: популярные статьи категорий **turizm**, **madaniyat** и **ekologiya** (\`$in\`) с числом просмотров **больше 15000**, по убыванию просмотров. Выведите \`title\`, \`category\`, \`views\` без \`_id\`.
`,
        starter: R`use news

// 1. Тег Toshkent
db.articles.find({}, { _id: 0, title: 1, tags: 1 })

// 2. Апрель 2026, по возрастанию даты


// 3. Популярные статьи трёх категорий

`,
        check: (t) => {
          dataOk(t);
          const exp1 = titles(where(t, { tags: "Toshkent" }));
          t.ok(t.results.some((r) => Array.isArray(r) && sameSet(titles(r), exp1)), "Найдены статьи с тегом Toshkent (" + exp1.length + ")");
          const exp2 = titles(where(t, { date: { $gte: "2026-04-01", $lt: "2026-05-01" } }).sort((a, b) => (a.date < b.date ? -1 : 1)));
          t.ok(t.results.some((r) => Array.isArray(r) && sameSeq(titles(r), exp2)), "Найдены статьи за апрель 2026 по возрастанию даты (" + exp2.length + ")");
          const exp3 = where(t, { category: { $in: ["turizm", "madaniyat", "ekologiya"] }, views: { $gt: 15000 } }).sort((a, b) => b.views - a.views);
          t.ok(t.uses("$in") && t.uses("$gt"), "Использованы операторы $in и $gt");
          t.ok(Array.isArray(t.last) && sameSeq(titles(t.last), titles(exp3)), "Последний запрос вернул " + exp3.length + " статьи по убыванию просмотров");
          t.ok(Array.isArray(t.last) && t.last.length > 0 && t.last.every((d) => d._id === undefined && d.views !== undefined && d.category !== undefined && d.text === undefined),
            "В результате только title, category, views без _id");
        },
        hint: "Апрель: `{ date: { $gte: \"2026-04-01\", $lt: \"2026-05-01\" } }` и `.sort({ date: 1 })`. Третий запрос: `{ category: { $in: [...] }, views: { $gt: 15000 } }` и `.sort({ views: -1 })`.",
        solution: R`use news

db.articles.find({ tags: "Toshkent" }, { _id: 0, title: 1, tags: 1 })

db.articles.find(
  { date: { $gte: "2026-04-01", $lt: "2026-05-01" } },
  { _id: 0, title: 1, date: 1 }
).sort({ date: 1 })

db.articles.find(
  { category: { $in: ["turizm", "madaniyat", "ekologiya"] }, views: { $gt: 15000 } },
  { _id: 0, title: 1, category: 1, views: 1 }
).sort({ views: -1 })
`,
      },
      {
        id: "t3",
        env: "mongo",
        title: "Регулярные выражения и текстовый индекс",
        fixtures: FIX,
        text: R`
1. Найдите статьи, в **заголовке** которых встречается «raqam» в любом регистре (регулярное выражение с флагом \`i\`). Выведите только \`title\`.
2. Создайте **текстовый индекс** по полям \`title\` и \`text\` с опцией \`{ default_language: "none" }\` (для узбекского языка в MongoDB нет стеммера).
3. **Последним запросом** выполните полнотекстовый поиск статей со словами **talabalar** или **yoshlar**. Выведите \`title\` и оценку релевантности \`score: { $meta: "textScore" }\`, отсортируйте по ней.

Сравните: регулярное выражение ищет подстроку в одном поле, а \`$text\` — целые слова сразу в двух полях и ранжирует результаты.
`,
        starter: R`use news

// 1. «raqam» в заголовке


// 2. Текстовый индекс по title и text


// 3. Полнотекстовый поиск с оценкой релевантности
db.articles.find(
  { $text: { $search: "talabalar yoshlar" } }
)
`,
        check: (t) => {
          dataOk(t);
          const exp1 = titles(where(t, { title: /raqam/i }));
          t.ok(t.results.slice(0, -1).some((r) => Array.isArray(r) && sameSet(titles(r), exp1)), "Найдены статьи с «raqam» в заголовке (" + exp1.length + ")");
          const tix = t.db("news").indexes("articles").find((i) => Object.values(i.key).includes("text"));
          t.ok(!!tix, "Создан текстовый индекс");
          t.ok(!!tix && tix.key.title === "text" && tix.key.text === "text", "Текстовый индекс охватывает поля title и text");
          const must = titles(arts(t).filter((d) => { const w = tokens(d.title + " " + d.text); return w.includes("talabalar") || w.includes("yoshlar"); }));
          const got = titles(t.last);
          t.ok(t.uses("$text") && Array.isArray(t.last) && must.every((x) => got.includes(x)), "Последний запрос $text нашёл все статьи со словами talabalar или yoshlar (" + must.length + ")");
          const L = Array.isArray(t.last) ? t.last : [];
          t.ok(L.length > 0 && L.every((d) => typeof d.score === "number"), "У найденных документов есть поле score (textScore)");
          t.ok(L.length > 0 && L.every((d, i) => i === 0 || L[i - 1].score >= d.score), "Результаты отсортированы по убыванию score");
        },
        hint: "Регулярное выражение: `{ title: /raqam/i }`. Индекс: `db.articles.createIndex({ title: \"text\", text: \"text\" }, { default_language: \"none\" })`. Оценка: проекция `{ title: 1, score: { $meta: \"textScore\" } }` и `.sort({ score: { $meta: \"textScore\" } })`.",
        solution: R`use news

db.articles.find({ title: /raqam/i }, { _id: 0, title: 1 })

db.articles.createIndex({ title: "text", text: "text" }, { default_language: "none" })

db.articles.find(
  { $text: { $search: "talabalar yoshlar" } },
  { title: 1, score: { $meta: "textScore" } }
).sort({ score: { $meta: "textScore" } })
`,
      },
      {
        id: "t4",
        env: "mongo",
        title: "Индексы и explain(): COLLSCAN и IXSCAN",
        fixtures: FIX,
        text: R`
Сравните план выполнения одного и того же запроса без индекса и с индексом.

1. Стартовый код удаляет все индексы, кроме \`_id\` (\`dropIndexes()\`; текстовый индекс из задания 3 тоже удалится), и выводит план запроса \`find({ category: "turizm" })\`. Найдите в нём \`winningPlan.stage\` и \`totalDocsExamined\`.
2. Создайте индекс по полю \`category\` (по возрастанию) и выведите список индексов (\`getIndexes()\`).
3. Снова выведите \`explain("executionStats")\` для того же запроса и сравните: какой теперь этап (\`inputStage.stage\`) и сколько документов прочитано?
`,
        starter: R`use news
db.articles.dropIndexes()

// 1. План без индекса
db.articles.find({ category: "turizm" }).explain("executionStats")

// 2. Индекс по category и список индексов


// 3. План с индексом

`,
        check: (t) => {
          dataOk(t);
          const total = t.db("news").count("articles");
          const ix = t.db("news").indexes("articles").find((i) => i.key && i.key.category === 1 && Object.keys(i.key).length === 1);
          t.ok(!!ix, "Создан индекс { category: 1 }");
          const plans = t.results.filter((r) => r && r.queryPlanner && r.executionStats);
          const wp = (p) => p.queryPlanner.winningPlan || {};
          const i1 = plans.findIndex((p) => wp(p).stage === "COLLSCAN" && p.executionStats.totalDocsExamined === total);
          t.ok(i1 >= 0, "Выведен план без индекса: COLLSCAN, просмотрено " + total + " документов");
          const i2 = plans.findIndex((p, k) => k > i1 && wp(p).inputStage && wp(p).inputStage.stage === "IXSCAN");
          t.ok(i1 >= 0 && i2 > i1, "После создания индекса план использует IXSCAN");
          t.ok(i2 > i1 && plans[i2].executionStats.totalDocsExamined === plans[i2].executionStats.nReturned, "С индексом прочитано столько документов, сколько найдено (totalDocsExamined = nReturned)");
          t.ok(t.results.some((r) => Array.isArray(r) && r.some((i) => i && i.name === "_id_")), "Выведен список индексов (getIndexes())");
        },
        hint: "`db.articles.createIndex({ category: 1 })`, затем `db.articles.getIndexes()` и тот же `find(...).explain(\"executionStats\")`. В выводе смотрите `winningPlan.inputStage.stage` и `executionStats.totalDocsExamined`.",
        solution: R`use news
db.articles.dropIndexes()

db.articles.find({ category: "turizm" }).explain("executionStats")

db.articles.createIndex({ category: 1 })
db.articles.getIndexes()

db.articles.find({ category: "turizm" }).explain("executionStats")
`,
      },
      {
        id: "t5",
        env: "mongo",
        title: "Агрегация: статистика по категориям",
        fixtures: FIX,
        text: R`
Постройте конвейер агрегации — сводку по категориям новостей:

1. \`$group\` по полю \`category\`: число статей \`articles\`, сумма просмотров \`totalViews\`, средняя длина \`avgWords\` (среднее поля \`words\`).
2. \`$project\`: оставьте \`articles\` и \`totalViews\`, а \`avgWords\` округлите до одного знака: \`{ $round: ["$avgWords", 1] }\`.
3. \`$sort\`: по убыванию \`totalViews\`.

Результат — по одному документу на категорию: \`{ _id: "ekologiya", articles: 1, totalViews: 23659, avgWords: 107 }\`.
`,
        starter: R`use news

db.articles.aggregate([
  { $group: {
      _id: "$category",
      articles: { $sum: 1 }
      // добавьте totalViews и avgWords
  } }
  // добавьте этапы $project и $sort
])
`,
        check: (t) => {
          dataOk(t);
          const groups = {};
          arts(t).forEach((d) => {
            const g = groups[d.category] || (groups[d.category] = { n: 0, views: 0, words: 0 });
            g.n++; g.views += d.views; g.words += d.words;
          });
          const cats = Object.keys(groups);
          const L = Array.isArray(t.last) ? t.last : [];
          t.ok(t.uses("$group"), "Использован этап $group");
          t.ok(L.length === cats.length && sameSet(L.map((d) => d._id), cats), "Результат содержит по одному документу на каждую из " + cats.length + " категорий");
          const by = (c) => L.find((d) => d._id === c) || {};
          t.ok(L.length > 0 && cats.every((c) => by(c).articles === groups[c].n), "articles — число статей в категории");
          t.ok(L.length > 0 && cats.every((c) => by(c).totalViews === groups[c].views), "totalViews — сумма просмотров категории");
          t.ok(L.length > 0 && cats.every((c) => Math.abs(by(c).avgWords - Math.round(groups[c].words / groups[c].n * 10) / 10) < 1e-9), "avgWords — среднее число слов, округлённое до 1 знака");
          t.ok(L.length > 0 && L.every((d, i) => i === 0 || L[i - 1].totalViews >= d.totalViews), "Категории отсортированы по убыванию totalViews");
        },
        hint: "Аккумуляторы: `totalViews: { $sum: \"$views\" }`, `avgWords: { $avg: \"$words\" }`. Затем `{ $project: { articles: 1, totalViews: 1, avgWords: { $round: [\"$avgWords\", 1] } } }` и `{ $sort: { totalViews: -1 } }`.",
        solution: R`use news

db.articles.aggregate([
  { $group: {
      _id: "$category",
      articles: { $sum: 1 },
      totalViews: { $sum: "$views" },
      avgWords: { $avg: "$words" }
  } },
  { $project: { articles: 1, totalViews: 1, avgWords: { $round: ["$avgWords", 1] } } },
  { $sort: { totalViews: -1 } }
])
`,
      },
      {
        id: "t6",
        env: "mongo",
        title: "Агрегация: частотность тегов и обсуждаемость",
        fixtures: FIX,
        text: R`
1. **Частотный словарь тегов**: разверните массив \`tags\` (\`$unwind\`), посчитайте частоты (\`$sortByCount\`) и оставьте 5 самых частых. Результат — документы вида \`{ _id: "turizm", count: 2 }\`.
2. **Последним запросом** найдите 3 самые обсуждаемые статьи: в \`$project\` выведите \`title\` и число комментариев \`commentsCount\` (длина массива — \`{ $size: "$comments" }\`), без \`_id\`; отсортируйте по убыванию \`commentsCount\` и оставьте 3.
`,
        starter: R`use news

// 1. Топ-5 тегов
db.articles.aggregate([
  { $unwind: "$tags" }
])

// 2. Топ-3 по числу комментариев
db.articles.aggregate([
  { $project: { _id: 0, title: 1 } }
])
`,
        check: (t) => {
          dataOk(t);
          const freq = {};
          arts(t).forEach((d) => (d.tags || []).forEach((g) => (freq[g] = (freq[g] || 0) + 1)));
          const maxF = Math.max(...Object.values(freq));
          t.ok(t.uses("$unwind"), "Использован этап $unwind");
          const tagRes = t.results.find((r) => Array.isArray(r) && r.length === 5 && r.every((d) => d && typeof d._id === "string" && typeof d.count === "number"));
          t.ok(!!tagRes, "Выведены 5 тегов в виде { _id: тег, count: частота }");
          t.ok(!!tagRes && tagRes.every((d) => freq[d._id] === d.count) && tagRes[0].count === maxF && tagRes.every((d, i) => i === 0 || tagRes[i - 1].count >= d.count),
            "Частоты тегов посчитаны верно и отсортированы по убыванию");
          const cc = arts(t).map((d) => d.comments.length).sort((a, b) => b - a).slice(0, 3);
          const real = {};
          arts(t).forEach((d) => (real[d.title] = d.comments.length));
          const L = Array.isArray(t.last) ? t.last : [];
          t.ok(t.uses("$size"), "Число комментариев вычислено выражением $size");
          t.ok(L.length === 3 && L.every((d) => d.title !== undefined && real[d.title] === d.commentsCount), "Последний запрос: 3 статьи с полями title и commentsCount");
          t.ok(L.length === 3 && sameSeq(L.map((d) => d.commentsCount), cc), "Это самые обсуждаемые статьи (по " + cc.join(", ") + " комментария), по убыванию commentsCount");
          t.ok(L.length === 3 && L.every((d) => d._id === undefined), "В результате нет поля _id");
        },
        hint: "Теги: `[{ $unwind: \"$tags\" }, { $sortByCount: \"$tags\" }, { $limit: 5 }]`. Комментарии: `{ $project: { _id: 0, title: 1, commentsCount: { $size: \"$comments\" } } }`, затем `{ $sort: { commentsCount: -1 } }` и `{ $limit: 3 }`.",
        solution: R`use news

db.articles.aggregate([
  { $unwind: "$tags" },
  { $sortByCount: "$tags" },
  { $limit: 5 }
])

db.articles.aggregate([
  { $project: { _id: 0, title: 1, commentsCount: { $size: "$comments" } } },
  { $sort: { commentsCount: -1 } },
  { $limit: 3 }
])
`,
      },
      {
        id: "t7",
        env: "mongo",
        title: "$lookup: статьи и авторы",
        fixtures: FIX,
        text: R`
Справочник авторов хранится в отдельной коллекции \`authors\` (стартовый код создаёт её заново: имя, город, стаж). В справочнике есть не все авторы статей.

Постройте конвейер по коллекции \`articles\`:

1. \`$lookup\` — присоедините документ автора из \`authors\`: поле статьи \`author\` ↔ поле \`name\` справочника, результат в массив \`author_info\`.
2. \`$unwind: "$author_info"\` — статьи, автора которых нет в справочнике (пустой массив), отбросятся.
3. \`$group\` по городу автора (\`"$author_info.city"\`): число статей \`articles\` и сумма просмотров \`totalViews\`.
4. \`$sort\` по убыванию \`totalViews\`.

Какой город даёт больше всего просмотров?
`,
        starter: R`use news
db.authors.drop()
db.authors.insertMany([
  { name: "Dilnoza Karimova", city: "Toshkent", experience: 8 },
  { name: "Bobur Rahimov", city: "Samarqand", experience: 5 },
  { name: "Sardor Yusupov", city: "Buxoro", experience: 11 },
  { name: "Madina Sobirova", city: "Toshkent", experience: 3 },
  { name: "Nilufar Qodirova", city: "Nukus", experience: 7 },
  { name: "Otabek Nazarov", city: "Toshkent", experience: 6 }
])

db.articles.aggregate([
  // 1. $lookup из authors (author -> name), массив author_info

  // 2. $unwind по author_info

  // 3. $group по городу автора: articles, totalViews

  // 4. $sort по убыванию totalViews
])
`,
        check: (t) => {
          dataOk(t);
          const authors = t.db("news").docs("authors");
          t.ok(authors.length > 0, "Коллекция authors заполнена");
          const exp = {};
          arts(t).forEach((a) => {
            authors.filter((au) => au.name === a.author).forEach((au) => {
              const g = exp[au.city] || (exp[au.city] = { n: 0, views: 0 });
              g.n++; g.views += a.views;
            });
          });
          const cities = Object.keys(exp);
          const L = Array.isArray(t.last) ? t.last : [];
          t.ok(t.uses("$lookup"), "Использован этап $lookup");
          t.ok(L.length === cities.length && sameSet(L.map((d) => d._id), cities), "Результат содержит по документу на каждый город авторов (" + cities.join(", ") + ")");
          t.ok(L.length > 0 && L.every((d) => exp[d._id] && d.articles === exp[d._id].n && d.totalViews === exp[d._id].views), "articles и totalViews посчитаны верно для каждого города");
          t.ok(L.length > 0 && L.every((d, i) => i === 0 || L[i - 1].totalViews >= d.totalViews), "Города отсортированы по убыванию totalViews");
        },
        hint: "Этапы: `{ $lookup: { from: \"authors\", localField: \"author\", foreignField: \"name\", as: \"author_info\" } }`, `{ $unwind: \"$author_info\" }`, `{ $group: { _id: \"$author_info.city\", articles: { $sum: 1 }, totalViews: { $sum: \"$views\" } } }`, `{ $sort: { totalViews: -1 } }`.",
        solution: R`use news
db.authors.drop()
db.authors.insertMany([
  { name: "Dilnoza Karimova", city: "Toshkent", experience: 8 },
  { name: "Bobur Rahimov", city: "Samarqand", experience: 5 },
  { name: "Sardor Yusupov", city: "Buxoro", experience: 11 },
  { name: "Madina Sobirova", city: "Toshkent", experience: 3 },
  { name: "Nilufar Qodirova", city: "Nukus", experience: 7 },
  { name: "Otabek Nazarov", city: "Toshkent", experience: 6 }
])

db.articles.aggregate([
  { $lookup: { from: "authors", localField: "author", foreignField: "name", as: "author_info" } },
  { $unwind: "$author_info" },
  { $group: { _id: "$author_info.city", articles: { $sum: 1 }, totalViews: { $sum: "$views" } } },
  { $sort: { totalViews: -1 } }
])
`,
      },
    ],
    quiz: [
      { q: "Что означает этап `COLLSCAN` в выводе `explain()`?", options: ["Запрос выполнен по индексу", "Сервер просмотрел все документы коллекции", "Коллекция заблокирована", "Запрос вернул пустой результат"], answer: 1, explain: "COLLSCAN — полный просмотр коллекции. При поиске по индексу в плане будет IXSCAN, а `totalDocsExamined` станет близким к `nReturned`." },
      { q: "Сколько текстовых индексов может быть у одной коллекции?", options: ["Ни одного — нужен Atlas", "Один, но он может охватывать несколько полей", "По одному на каждое поле", "Не больше трёх"], answer: 1, explain: "Текстовый индекс один на коллекцию: `createIndex({ title: \"text\", text: \"text\" })`." },
      { q: "Как отсортировать результаты `$text` по релевантности?", options: ["`.sort({ score: -1 })` без проекции", "`.sort({ score: { $meta: \"textScore\" } })`", "`.sort({ $text: 1 })`", "Результаты всегда уже отсортированы"], answer: 1, explain: "Оценка релевантности берётся из метаданных: `{ $meta: \"textScore\" }` — и в проекции, и в сортировке." },
      { q: "Что делает этап `$unwind: \"$tags\"`?", options: ["Удаляет поле tags", "Создаёт по документу на каждый элемент массива tags", "Сортирует теги", "Объединяет теги всех документов в один массив"], answer: 1, explain: "Статья с тремя тегами превращается в три документа — после этого теги можно группировать и считать." },
      { q: "Какой этап агрегации соответствует SQL `GROUP BY`?", options: ["`$match`", "`$project`", "`$group`", "`$lookup`"], answer: 2, explain: "`$match` ↔ WHERE, `$project` ↔ SELECT, `$lookup` ↔ LEFT JOIN, `$group` ↔ GROUP BY." },
      { q: "Почему запрос `{ title: /raqam/i }` на большой коллекции работает медленно даже при индексе по title?", options: ["Регулярные выражения в MongoDB запрещены", "Индекс эффективен только для регулярных выражений с префиксом `/^.../` с учётом регистра; иначе просматриваются все ключи", "Флаг i удаляет индекс", "Индексы не работают со строками"], answer: 1, explain: "Префиксный шаблон `/^Raqam/` сужает диапазон ключей B-дерева; подстрока в середине или флаг `i` требуют проверить все значения." },
    ],
    realEnv: R`
## Поиск и аналитика в реальной MongoDB

\`\`\`bash
mongoimport --db news --collection articles --file data/mongo/articles.json --jsonArray --drop
mongosh "mongodb://localhost:27017/news"
\`\`\`

Все запросы заданий выполняются в \`mongosh\` без изменений. В настоящем \`explain("executionStats")\` есть ещё \`executionTimeMillis\` — время выполнения; на 16 документах разница незаметна, а на миллионах — огромна.

## MongoDB Compass

- Вкладка **Indexes**: создание индекса кнопкой **Create Index**, размер и число использований каждого индекса.
- Вкладка **Explain Plan**: план запроса в виде дерева этапов (COLLSCAN, IXSCAN, FETCH) с числом прочитанных документов.
- Вкладка **Aggregations**: конструктор конвейера — этапы добавляются по одному, под каждым виден промежуточный результат. Кнопка **Export to Language** переводит конвейер в код на Python.

## Python: pymongo и pandas

\`\`\`python
from pymongo import MongoClient, ASCENDING, TEXT
import pandas as pd

db = MongoClient("mongodb://localhost:27017")["news"]
arts = db["articles"]

# индексы
arts.create_index([("category", ASCENDING)])
arts.create_index([("title", TEXT), ("text", TEXT)], default_language="none")

plan = arts.find({"category": "turizm"}).explain()
print(plan["queryPlanner"]["winningPlan"])

# полнотекстовый поиск
hits = (arts.find({"$text": {"$search": "talabalar yoshlar"}},
                  {"title": 1, "score": {"$meta": "textScore"}})
            .sort([("score", {"$meta": "textScore"})]))
for h in hits:
    print(round(h["score"], 2), h["title"])

# агрегация в DataFrame
pipeline = [
    {"$group": {"_id": "$category", "articles": {"$sum": 1}, "totalViews": {"$sum": "$views"}}},
    {"$sort": {"totalViews": -1}},
]
df = pd.DataFrame(arts.aggregate(pipeline)).rename(columns={"_id": "category"})
print(df)
df.plot.barh(x="category", y="totalViews")
\`\`\`

> [!TIP] Узбекская морфология
> Для поиска по словоформам добавьте в документы поле \`lemmas\` — список лемм, полученный на Python (например, отсечением аффиксов), и стройте текстовый индекс по нему. В Atlas доступен **Atlas Search** (на основе Apache Lucene) с настраиваемыми анализаторами текста.
`,
    homework: R`
**Мини-проект по работе с MongoDB. Этап 3 — поиск и аналитика.**

Для коллекций своего мини-проекта (этапы 1–2):

1. Создайте текстовый индекс и напишите 3 поисковых запроса: по слову, по фразе в кавычках, с исключением слова; отсортируйте по \`textScore\`.
2. Подберите 2 индекса под частые запросы и покажите \`explain("executionStats")\` до и после их создания (COLLSCAN → IXSCAN, \`totalDocsExamined\`).
3. Постройте 3 конвейера агрегации: сводка с \`$group\`, частотный словарь с \`$unwind\` + \`$sortByCount\`, соединение двух коллекций через \`$lookup\`; результат одного сохраните через \`$out\`.
4. Повторите одну агрегацию в \`pymongo\`, загрузите результат в \`pandas\` и постройте диаграмму.
5. Сдайте скрипт \`search.js\`, блокнот Python и краткий отчёт (1–2 страницы) с выводами.
`,
  });
})();
