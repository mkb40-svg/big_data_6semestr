(function () {
  const FIX = [{ db: "university", coll: "students", file: "data/mongo/students.json" }];
  const isPlainObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

  // Совпадает ли набор документов результата с ожидаемым (сравнение по student_id, _id или name — что есть в результате)
  function sameDocs(res, exp) {
    if (!Array.isArray(res) || res.length !== exp.length) return false;
    if (!res.length) return true;
    const s = res[0] || {};
    const key = s.student_id !== undefined ? (d) => d.student_id : s._id !== undefined ? (d) => String(d._id) : (d) => d.name;
    const a = res.map(key).sort(), b = exp.map(key).sort();
    return a.every((x, i) => x === b[i]);
  }
  const students = (t) => t.db("university").docs("students");
  const where = (t, filter) => students(t).filter((d) => t.match(d, filter));
  // Учебные данные на месте? Если студент экспериментировал с коллекцией — подсказать, как её восстановить
  const dataOk = (t) => t.ok(t.db("university").count("students", { faculty: { $exists: true }, gpa: { $exists: true } }) >= 30,
    "В university.students есть учебные данные (не меньше 30 студентов). Если нет — выполните задание 1 (mongoimport ... --drop)");

  BDT.register({
    id: "l02",
    kind: "lab",
    num: 2,
    title: "Создание коллекций MongoDB и выполнение CRUD-операций",
    hours: 2,
    env: ["mongo"],
    goals: [
      "Освоить четыре операции CRUD в MongoDB и их соответствие SQL: INSERT, SELECT, UPDATE, DELETE",
      "Составлять фильтры с операторами сравнения, логики, массивов, регулярных выражений и точечной нотацией",
      "Управлять результатом запроса: проекция, сортировка, `limit`, `skip`",
      "Изменять документы операторами `$set`, `$inc`, `$push`, `$addToSet`, `$unset`, применять `updateMany` и `upsert`",
    ],
    theory: R`
## CRUD: четыре базовые операции

Любая работа с данными сводится к четырём операциям — **C**reate, **R**ead, **U**pdate, **D**elete. В MongoDB это методы коллекции:

| Операция | SQL | MongoDB |
|---|---|---|
| Create | \`INSERT INTO students VALUES (...)\` | \`db.students.insertOne({...})\`, \`insertMany([...])\` |
| Read | \`SELECT * FROM students WHERE ...\` | \`db.students.find({...})\`, \`findOne({...})\` |
| Update | \`UPDATE students SET ... WHERE ...\` | \`db.students.updateOne(фильтр, изменение)\`, \`updateMany\` |
| Delete | \`DELETE FROM students WHERE ...\` | \`db.students.deleteOne(фильтр)\`, \`deleteMany\` |

Почти все методы принимают первым аргументом **фильтр** — документ-образец, которому должны соответствовать нужные документы.

## Create

\`\`\`javascript
db.students.insertOne({ student_id: "S0041", name: "Aziza Karimova", gpa: 4.21, skills: ["NLP"] })
db.students.insertMany([
  { student_id: "S0042", name: "Javlon Tursunov", gpa: 3.95 },
  { student_id: "S0043", name: "Shahzoda Olimova", gpa: 4.4 }
])
\`\`\`

Ответ сервера содержит \`acknowledged: true\` и \`insertedId\` / \`insertedIds\`.

## Read: find(фильтр, проекция)

\`\`\`javascript
db.students.find({ city: "Toshkent" })
db.students.find({ gpa: { $gte: 4.0 } })
db.students.find({ city: "Toshkent", course: 3 })
db.students.find({ $or: [{ city: "Buxoro" }, { gpa: { $gt: 4.5 } }] })
db.students.countDocuments({ scholarship: true })
db.students.distinct("city")
\`\`\`

Несколько условий через запятую объединяются по **И** (неявный \`$and\`).

| MongoDB | SQL | Смысл |
|---|---|---|
| \`$eq\`, \`$ne\` | \`=\`, \`<>\` | равно / не равно |
| \`$gt\`, \`$gte\` | \`>\`, \`>=\` | больше / не меньше |
| \`$lt\`, \`$lte\` | \`<\`, \`<=\` | меньше / не больше |
| \`$in\`, \`$nin\` | \`IN\`, \`NOT IN\` | значение из списка |
| \`$and\`, \`$or\`, \`$nor\`, \`$not\` | \`AND\`, \`OR\`, \`NOT\` | логические связки |
| \`$exists\` | \`IS NOT NULL\` | поле присутствует |
| \`/ova$/\`, \`$regex\` | \`LIKE '%ova'\` | регулярное выражение |

### Массивы, вложенные поля, регулярные выражения

\`\`\`javascript
// массив содержит элемент
db.students.find({ skills: "NLP" })
// содержит все перечисленные
db.students.find({ skills: { $all: ["Python", "NLP"] } })
// ровно 4 элемента
db.students.find({ skills: { $size: 4 } })
// точечная нотация: имя поля в кавычках
db.students.find({ "contacts.email": "nodira.rahimova3@talaba.uz" })
// фамилии на -ova
db.students.find({ name: /ova$/ })
// начинается с sard, без учёта регистра
db.students.find({ name: { $regex: "^sard", $options: "i" } })
\`\`\`

> [!TIP] Регулярные выражения для лингвиста
> \`^\` — начало строки, \`$\` — конец, \`.\` — любой символ, \`\d\` — цифра, флаг \`i\` — без учёта регистра. Запрос \`{ name: /ova$/ }\` находит женские фамилии на «-ova» — так удобно искать словоформы по суффиксам.

### Проекция, сортировка, лимит

| SQL | MongoDB |
|---|---|
| \`SELECT name, gpa\` | \`find({}, { name: 1, gpa: 1, _id: 0 })\` |
| \`ORDER BY gpa DESC\` | \`.sort({ gpa: -1 })\` |
| \`LIMIT 5\` | \`.limit(5)\` |
| \`OFFSET 10\` | \`.skip(10)\` |
| \`COUNT(*)\` | \`countDocuments({...})\` |
| \`SELECT DISTINCT city\` | \`distinct("city")\` |

\`\`\`javascript
db.students.find({}, { _id: 0, name: 1, gpa: 1 }).sort({ gpa: -1 }).skip(10).limit(5)
\`\`\`

Страница номер N по K документов: \`.skip((N - 1) * K).limit(K)\`. Поле \`_id\` выводится всегда, если явно не указать \`_id: 0\`.

## Update

\`updateOne(фильтр, изменение, опции)\` меняет первый подходящий документ, \`updateMany\` — все подходящие. Изменение описывается **операторами**:

| Оператор | Действие | Пример |
|---|---|---|
| \`$set\` | установить значение | \`{ $set: { city: "Toshkent" } }\` |
| \`$unset\` | удалить поле | \`{ $unset: { "contacts.phone": "" } }\` |
| \`$inc\` | прибавить число | \`{ $inc: { awards: 1 } }\` |
| \`$mul\` | умножить | \`{ $mul: { gpa: 1.05 } }\` |
| \`$rename\` | переименовать поле | \`{ $rename: { city: "town" } }\` |
| \`$min\`, \`$max\` | записать, если меньше / больше | \`{ $max: { gpa: 4.0 } }\` |
| \`$push\` | добавить элемент в массив | \`{ $push: { skills: "SQL" } }\` |
| \`$addToSet\` | добавить, если такого ещё нет | \`{ $addToSet: { skills: "SQL" } }\` |
| \`$pull\` | убрать элементы по условию | \`{ $pull: { skills: "Excel" } }\` |

\`\`\`javascript
db.students.updateOne({ student_id: "S0003" }, { $set: { city: "Toshkent", "contacts.phone": "+998901234567" } })
db.students.updateMany({ course: 4 }, { $set: { status: "bitiruvchi" } })
db.students.updateOne({ student_id: "S0050" }, { $set: { name: "Test Talaba" } }, { upsert: true })
\`\`\`

Ответ: \`matchedCount\` — сколько документов подошло, \`modifiedCount\` — сколько реально изменилось. Опция **\`upsert: true\`** вставляет новый документ, если ничего не найдено. \`replaceOne\` заменяет документ целиком (кроме \`_id\`).

> [!WARNING] Вложенные объекты
> \`{ $set: { contacts: { phone: "..." } } }\` заменит **весь** объект \`contacts\` — email пропадёт. Чтобы изменить одно вложенное поле, используйте точечную нотацию: \`{ $set: { "contacts.phone": "..." } }\`.

## Delete

\`\`\`javascript
db.students.deleteOne({ student_id: "S0050" })
db.students.deleteMany({ gpa: { $lt: 3.5 } })
\`\`\`

> [!WARNING] Осторожно с удалением
> \`deleteMany({})\` удаляет **все** документы коллекции, а отменить удаление нельзя. Сначала выполните \`find\` с тем же фильтром и убедитесь, что он выбирает именно то, что нужно.
`,
    tasks: [
      {
        id: "t1",
        env: "mongo",
        title: "Create: новые студенты",
        text: R`
Работаем с базой \`university\`, коллекция \`students\` (40 студентов).

1. Первая строка стартового кода восстанавливает исходные данные (\`mongoimport ... --drop\`) — благодаря ей задание можно запускать повторно.
2. Студент **S0041** добавляется через \`insertOne\` — изучите структуру документа.
3. Добавьте студентов **S0042** и **S0043** **одним** вызовом \`insertMany\`. Заполните все поля, как у остальных: \`student_id\`, \`name\`, \`gender\`, \`age\`, \`faculty\`, \`course\`, \`city\`, \`gpa\` (число), \`skills\` (массив), \`contacts\` (объект с \`email\` и \`phone\`), \`scholarship\`.
4. **Последней командой** выведите число документов коллекции.
`,
        starter: R`mongoimport --db university --collection students --file data/mongo/students.json --jsonArray --drop
use university

db.students.insertOne({
  student_id: "S0041",
  name: "Aziza Karimova",
  gender: "F",
  age: 19,
  faculty: "Kompyuter lingvistikasi",
  course: 2,
  city: "Toshkent",
  gpa: 4.21,
  skills: ["Python", "NLP"],
  contacts: { email: "aziza.karimova41@talaba.uz", phone: "+998901112233" },
  scholarship: false
})

// добавьте S0042 и S0043 одним insertMany


// число документов

`,
        check: (t) => {
          const ids = ["S0041", "S0042", "S0043"];
          t.ok(t.uses("insertOne") && t.uses("insertMany"), "Использованы insertOne и insertMany");
          ids.forEach((id) => {
            const c = t.db("university").count("students", { student_id: id });
            t.ok(c === 1, c > 1 ? "Студент " + id + " добавлен " + c + " раз(а) — оставьте первую строку с mongoimport --drop" : "Студент " + id + " есть в коллекции");
          });
          const req = ["name", "gender", "age", "faculty", "course", "city", "gpa", "skills", "contacts", "scholarship"];
          const docs = students(t).filter((d) => ids.includes(d.student_id));
          const bad = docs.find((d) => req.some((k) => d[k] === undefined) || !Array.isArray(d.skills) || !isPlainObj(d.contacts) || typeof d.gpa !== "number");
          t.ok(docs.length >= 3 && !bad, bad
            ? "У студента " + bad.student_id + " не хватает полей или неверный тип (skills — массив, contacts — объект, gpa — число)"
            : "У новых студентов есть все поля: skills — массив, contacts — объект, gpa — число");
          t.ok(t.last === t.db("university").count("students"), "Последняя команда выводит число документов (countDocuments())");
        },
        hint: "`db.students.insertMany([ { student_id: \"S0042\", ... }, { student_id: \"S0043\", ... } ])` — массив из двух объектов той же структуры, что и S0041.",
        solution: R`mongoimport --db university --collection students --file data/mongo/students.json --jsonArray --drop
use university

db.students.insertOne({
  student_id: "S0041",
  name: "Aziza Karimova",
  gender: "F",
  age: 19,
  faculty: "Kompyuter lingvistikasi",
  course: 2,
  city: "Toshkent",
  gpa: 4.21,
  skills: ["Python", "NLP"],
  contacts: { email: "aziza.karimova41@talaba.uz", phone: "+998901112233" },
  scholarship: false
})

db.students.insertMany([
  {
    student_id: "S0042", name: "Javlon Tursunov", gender: "M", age: 20,
    faculty: "Tarjimonlik", course: 2, city: "Samarqand", gpa: 3.95,
    skills: ["Ingliz tili", "Excel"],
    contacts: { email: "javlon.tursunov42@talaba.uz", phone: "+998903334455" },
    scholarship: false
  },
  {
    student_id: "S0043", name: "Shahzoda Olimova", gender: "F", age: 18,
    faculty: "Filologiya", course: 1, city: "Buxoro", gpa: 4.4,
    skills: ["Arab tili", "NLP", "Python"],
    contacts: { email: "shahzoda.olimova43@talaba.uz", phone: "+998905556677" },
    scholarship: true
  }
])

db.students.countDocuments()
`,
      },
      {
        id: "t2",
        env: "mongo",
        title: "Read: сравнение и логические операторы",
        fixtures: FIX,
        text: R`
1. Сколько студентов в возрасте **от 19 до 21 года включительно**? Используйте \`countDocuments\` с операторами \`$gte\` и \`$lte\`.
2. **Последним запросом** (\`find\`) найдите студентов, у которых одновременно:
   - факультет «Kompyuter lingvistikasi» **или** «Filologiya» (оператор \`$in\`);
   - GPA **больше** 4.2;
   - город Toshkent **или** есть стипендия (\`scholarship: true\`) — оператор \`$or\`.

> [!NOTE] Данные
> Задания 2–7 работают с коллекцией \`university.students\` после задания 1. Если коллекция пуста, тренажёр загрузит 40 студентов сам; если вы её «испортили» экспериментами — запустите задание 1 ещё раз (\`mongoimport ... --drop\`). Проверки считают правильный ответ по текущему содержимому коллекции.
`,
        starter: R`use university

// 1. Студенты 19–21 года
db.students.countDocuments({ age: {} })

// 2. Факультет, GPA и «город или стипендия»
db.students.find({

})
`,
        check: (t) => {
          dataOk(t);
          const n = where(t, { age: { $gte: 19, $lte: 21 } }).length;
          t.ok(t.uses("$gte") && t.uses("$lte"), "Для возраста использованы $gte и $lte");
          t.ok(t.results.includes(n), "Выведено число студентов от 19 до 21 года (" + n + ")");
          t.ok(t.uses("$in") && t.uses("$or"), "В запросе использованы операторы $in и $or");
          const exp = where(t, { faculty: { $in: ["Kompyuter lingvistikasi", "Filologiya"] }, gpa: { $gt: 4.2 }, $or: [{ city: "Toshkent" }, { scholarship: true }] });
          t.ok(sameDocs(t.last, exp), "Последний запрос вернул " + exp.length + " студентов, удовлетворяющих всем трём условиям");
        },
        hint: "Диапазон: `{ age: { $gte: 19, $lte: 21 } }`. Условие «или» по разным полям: `$or: [{ city: \"Toshkent\" }, { scholarship: true }]` — ставится рядом с остальными условиями в том же объекте фильтра.",
        solution: R`use university

db.students.countDocuments({ age: { $gte: 19, $lte: 21 } })

db.students.find({
  faculty: { $in: ["Kompyuter lingvistikasi", "Filologiya"] },
  gpa: { $gt: 4.2 },
  $or: [{ city: "Toshkent" }, { scholarship: true }]
})
`,
      },
      {
        id: "t3",
        env: "mongo",
        title: "Read: массивы, регулярные выражения, вложенные поля",
        fixtures: FIX,
        text: R`
1. Найдите студентов, у которых в \`skills\` есть **и** «Pandas», **и** «MongoDB» (\`$all\`). Выведите \`student_id\`, \`name\`, \`skills\` без \`_id\`.
2. Посчитайте студентов с фамилией на **-ova** (регулярное выражение по полю \`name\`, якорь конца строки \`$\`).
3. **Последним запросом** найдите студентов, чей e-mail (\`contacts.email\`) **начинается** с «sardor». Выведите только \`student_id\`, \`name\` и \`contacts.email\` (без \`_id\`).
`,
        starter: R`use university

// 1. И Pandas, и MongoDB
db.students.find({ skills: "Pandas" }, { _id: 0, student_id: 1, name: 1, skills: 1 })

// 2. Фамилии на -ova


// 3. E-mail начинается с sardor (точечная нотация + регулярное выражение)

`,
        check: (t) => {
          dataOk(t);
          const exp1 = where(t, { skills: { $all: ["Pandas", "MongoDB"] } });
          t.ok(t.uses("$all"), "Использован оператор $all");
          t.ok(t.results.some((r) => sameDocs(r, exp1)), "Найдены " + exp1.length + " студентов с навыками Pandas и MongoDB");
          const n2 = where(t, { name: /ova$/ }).length;
          t.ok(t.results.includes(n2), "Выведено число студентов с фамилией на -ova (" + n2 + ")");
          const exp3 = where(t, { "contacts.email": /^sardor/ });
          t.ok(t.uses("contacts.email"), "Использована точечная нотация \"contacts.email\"");
          t.ok(sameDocs(t.last, exp3), "Последний запрос вернул " + exp3.length + " студентов с e-mail на sardor…");
          t.ok(Array.isArray(t.last) && t.last.length > 0 && t.last.every((d) => d._id === undefined && d.contacts && d.contacts.email && d.gpa === undefined && d.name),
            "В результате только student_id, name и contacts.email, без _id");
        },
        hint: "`{ skills: { $all: [\"Pandas\", \"MongoDB\"] } }`; `countDocuments({ name: /ova$/ })`; e-mail: `find({ \"contacts.email\": /^sardor/ }, { _id: 0, student_id: 1, name: 1, \"contacts.email\": 1 })`.",
        solution: R`use university

db.students.find({ skills: { $all: ["Pandas", "MongoDB"] } }, { _id: 0, student_id: 1, name: 1, skills: 1 })

db.students.countDocuments({ name: /ova$/ })

db.students.find(
  { "contacts.email": /^sardor/ },
  { _id: 0, student_id: 1, name: 1, "contacts.email": 1 }
)
`,
      },
      {
        id: "t4",
        env: "mongo",
        title: "Проекция, сортировка, limit и skip",
        fixtures: FIX,
        text: R`
Составим рейтинг студентов по GPA.

1. Выведите список различных городов: \`distinct("city")\`.
2. **Топ-5**: пять студентов с самым высоким GPA. Выведите только \`name\`, \`faculty\`, \`gpa\` (без \`_id\`).
3. **Последним запросом** выведите **вторую страницу** рейтинга — места с 6-го по 10-е (\`skip\` + \`limit\`), с той же проекцией.
`,
        starter: R`use university

// 1. Различные города


// 2. Топ-5 по GPA
db.students.find({}, { _id: 0, name: 1, faculty: 1, gpa: 1 })

// 3. Места 6–10

`,
        check: (t) => {
          dataOk(t);
          const all = students(t);
          const g = all.map((d) => d.gpa).sort((a, b) => b - a);
          const cities = [...new Set(all.map((d) => d.city))].sort();
          const gp = (r) => r.map((d) => d.gpa).join(",");
          const okFields = (r) => r.every((d) => d._id === undefined && d.name !== undefined && d.gpa !== undefined && d.student_id === undefined && d.skills === undefined);
          t.ok(t.results.some((r) => Array.isArray(r) && r.length === cities.length && r.slice().sort().join("|") === cities.join("|")), "Выведен список различных городов (distinct)");
          const top = t.results.slice(0, -1).find((r) => Array.isArray(r) && r.length === 5 && gp(r) === g.slice(0, 5).join(","));
          t.ok(!!top, "Выведен топ-5 студентов по убыванию GPA (sort + limit)");
          t.ok(!!top && okFields(top), "В топ-5 только name, faculty, gpa (без _id)");
          t.ok(t.uses("skip"), "Использован skip");
          t.ok(Array.isArray(t.last) && t.last.length === 5 && gp(t.last) === g.slice(5, 10).join(","), "Последний запрос — места 6–10 рейтинга (GPA: " + g.slice(5, 10).join(", ") + ")");
          t.ok(Array.isArray(t.last) && okFields(t.last), "Во второй странице та же проекция: name, faculty, gpa без _id");
        },
        hint: "Сортировка по убыванию: `.sort({ gpa: -1 })`. Вторая страница: `.sort({ gpa: -1 }).skip(5).limit(5)`.",
        solution: R`use university

db.students.distinct("city")

db.students.find({}, { _id: 0, name: 1, faculty: 1, gpa: 1 }).sort({ gpa: -1 }).limit(5)

db.students.find({}, { _id: 0, name: 1, faculty: 1, gpa: 1 })
  .sort({ gpa: -1 })
  .skip(5)
  .limit(5)
`,
      },
      {
        id: "t5",
        env: "mongo",
        title: "Update: операторы изменения",
        fixtures: FIX,
        text: R`
Внесите изменения командами \`updateOne\`:

| Студент | Что произошло | Оператор |
|---|---|---|
| S0003 | переехала в Toshkent, новый телефон \`+998901234567\` | \`$set\` (телефон — через \`"contacts.phone"\`) |
| S0004 | освоил MongoDB | \`$addToSet\` в \`skills\` |
| S0001 | получил грамоту: поле \`awards\` увеличить на 1 | \`$inc\` |
| S0002 | получил оценку: в массив \`grades\` добавить \`{ subject: "Big Data", score: 92 }\` | \`$push\` |
| S0005 | попросила не хранить телефон: удалить \`contacts.phone\` | \`$unset\` |

**Последней командой** выведите этих пятерых студентов (\`$in\` по \`student_id\`).

> [!TIP] Повторный запуск
> \`$addToSet\` не добавит «MongoDB» второй раз, а \`$inc\` и \`$push\` при каждом запуске изменяют документ снова — сравните результаты \`modifiedCount\`.
`,
        starter: R`use university

db.students.updateOne(
  { student_id: "S0003" },
  { $set: { city: "Toshkent" } }
)

// S0004: освоил MongoDB

// S0001: грамота (awards + 1)

// S0002: оценка по Big Data

// S0005: удалить телефон


db.students.find({ student_id: { $in: ["S0001", "S0002", "S0003", "S0004", "S0005"] } })
`,
        check: (t) => {
          dataOk(t);
          const get = (id) => students(t).find((d) => d.student_id === id) || {};
          const s3 = get("S0003"), s4 = get("S0004"), s1 = get("S0001"), s2 = get("S0002"), s5 = get("S0005");
          t.ok(s3.city === "Toshkent" && s3.contacts && s3.contacts.phone === "+998901234567", "S0003: city = Toshkent, contacts.phone = +998901234567");
          t.ok(s3.contacts && !!s3.contacts.email, "S0003: contacts.email сохранился (меняйте телефон через \"contacts.phone\")");
          t.ok(Array.isArray(s4.skills) && s4.skills.filter((x) => x === "MongoDB").length === 1, "S0004: в skills ровно один раз есть «MongoDB»");
          t.ok(typeof s1.awards === "number" && s1.awards >= 1, "S0001: поле awards увеличено ($inc)");
          t.ok(Array.isArray(s2.grades) && s2.grades.some((g) => g && g.subject === "Big Data" && g.score === 92), "S0002: в grades есть { subject: \"Big Data\", score: 92 }");
          t.ok(s5.contacts && s5.contacts.phone === undefined && !!s5.contacts.email, "S0005: удалён только contacts.phone, e-mail остался");
          t.ok(t.uses("$addToSet") && t.uses("$inc") && t.uses("$push") && t.uses("$unset"), "Использованы $addToSet, $inc, $push и $unset");
          t.ok(Array.isArray(t.last) && t.last.length === 5, "Последний запрос выводит пятерых студентов");
        },
        hint: "Пример: `db.students.updateOne({ student_id: \"S0005\" }, { $unset: { \"contacts.phone\": \"\" } })`. Имя поля с точкой всегда пишите в кавычках.",
        solution: R`use university

db.students.updateOne(
  { student_id: "S0003" },
  { $set: { city: "Toshkent", "contacts.phone": "+998901234567" } }
)
db.students.updateOne({ student_id: "S0004" }, { $addToSet: { skills: "MongoDB" } })
db.students.updateOne({ student_id: "S0001" }, { $inc: { awards: 1 } })
db.students.updateOne({ student_id: "S0002" }, { $push: { grades: { subject: "Big Data", score: 92 } } })
db.students.updateOne({ student_id: "S0005" }, { $unset: { "contacts.phone": "" } })

db.students.find({ student_id: { $in: ["S0001", "S0002", "S0003", "S0004", "S0005"] } })
`,
      },
      {
        id: "t6",
        env: "mongo",
        title: "updateMany и upsert",
        fixtures: FIX,
        text: R`
1. Всем студентам **4 курса** установите поле \`status: "bitiruvchi"\` (выпускник) — одной командой \`updateMany\`.
2. Всем студентам с GPA **не ниже 4.5** назначьте стипендию (\`scholarship: true\`).
3. Добавьте или обновите тестовую запись **S0050** командой \`updateOne\` с опцией \`{ upsert: true }\`: \`name: "Test Talaba"\`, \`faculty: "Kompyuter lingvistikasi"\`, \`course: 1\`, \`gpa: 4.0\`. Запустите код дважды и сравните ответы: в первый раз документ вставляется (\`upsertedCount: 1\`), во второй — находится (\`matchedCount: 1\`).
4. **Последней командой** посчитайте выпускников.
`,
        starter: R`use university

// 1. status: "bitiruvchi" для 4 курса


// 2. стипендия для GPA >= 4.5


// 3. Запись S0050: добавьте третий аргумент с опцией
db.students.updateOne(
  { student_id: "S0050" },
  { $set: { name: "Test Talaba" } }
)

// 4. число выпускников

`,
        check: (t) => {
          dataOk(t);
          const c = (f) => t.db("university").count("students", f);
          t.ok(t.uses("updateMany"), "Использован updateMany");
          t.ok(c({ status: "bitiruvchi" }) > 0 && c({ course: 4, status: { $ne: "bitiruvchi" } }) === 0, "У всех студентов 4 курса status: \"bitiruvchi\"");
          t.ok(c({ course: { $ne: 4 }, status: "bitiruvchi" }) === 0, "Статус выпускника есть только у студентов 4 курса");
          t.ok(c({ gpa: { $gte: 4.5 }, scholarship: { $ne: true } }) === 0, "Все студенты с GPA ≥ 4.5 получают стипендию");
          t.ok(t.uses("upsert"), "Использована опция upsert: true");
          const s50 = students(t).filter((d) => d.student_id === "S0050");
          t.ok(s50.length === 1 && s50[0].name === "Test Talaba" && s50[0].course === 1, "Запись S0050 существует ровно один раз: name «Test Talaba», course 1");
          t.ok(t.last === c({ status: "bitiruvchi" }), "Последняя команда выводит число выпускников");
        },
        hint: "`db.students.updateMany({ course: 4 }, { $set: { status: \"bitiruvchi\" } })`. Опции — третий аргумент: `updateOne(фильтр, { $set: {...} }, { upsert: true })`.",
        solution: R`use university

db.students.updateMany({ course: 4 }, { $set: { status: "bitiruvchi" } })

db.students.updateMany({ gpa: { $gte: 4.5 } }, { $set: { scholarship: true } })

db.students.updateOne(
  { student_id: "S0050" },
  { $set: { name: "Test Talaba", faculty: "Kompyuter lingvistikasi", course: 1, gpa: 4.0 } },
  { upsert: true }
)

db.students.countDocuments({ status: "bitiruvchi" })
`,
      },
      {
        id: "t7",
        env: "mongo",
        title: "Delete и итоговое задание",
        fixtures: FIX,
        text: R`
Семестр закончился — наведём порядок в базе.

1. Удалите тестовую запись **S0050** (\`deleteOne\`).
2. Перенесите в коллекцию \`archive\` студентов с GPA **ниже 3.5**: получите их массивом (\`find(...).toArray()\`), вставьте в \`archive\` через \`insertMany\`, затем удалите из \`students\` (\`deleteMany\`).
3. Выведите архив: только \`name\` и \`gpa\`.
4. **Последним запросом** выведите стипендиатов факультета «Kompyuter lingvistikasi»: \`student_id\`, \`name\`, \`gpa\` без \`_id\`, по убыванию GPA.

> [!NOTE] Пустой массив
> В реальной MongoDB \`insertMany([])\` вызывает ошибку, поэтому вставку стоит выполнять, только если массив не пуст: \`if (low.length > 0) db.archive.insertMany(low)\`.
`,
        starter: R`use university

// 1. Удалите S0050


// 2. Архив: студенты с GPA < 3.5
const low = db.students.find({ gpa: { $lt: 3.5 } }).toArray()
low.length


// 3. Содержимое архива


// 4. Стипендиаты Kompyuter lingvistikasi по убыванию GPA

`,
        check: (t) => {
          dataOk(t);
          const c = (coll, f) => t.db("university").count(coll, f);
          t.ok(t.uses("deleteOne") && t.uses("deleteMany"), "Использованы deleteOne и deleteMany");
          t.ok(c("students", { student_id: "S0050" }) === 0, "Тестовая запись S0050 удалена");
          t.ok(c("students", { gpa: { $lt: 3.5 } }) === 0, "В students не осталось студентов с GPA < 3.5");
          t.ok(c("archive", { gpa: { $lt: 3.5 } }) >= 1 && c("archive", { gpa: { $gte: 3.5 } }) === 0, "В archive перенесены студенты с GPA < 3.5 (и только они)");
          t.ok(c("students", {}) >= 30, "Остальные студенты на месте — лишнего не удалено");
          const exp = where(t, { faculty: "Kompyuter lingvistikasi", scholarship: true });
          const last = t.last;
          t.ok(sameDocs(last, exp), "Последний запрос вернул " + exp.length + " стипендиатов факультета Kompyuter lingvistikasi");
          t.ok(Array.isArray(last) && last.length > 0 && last.every((d, i) => i === 0 || last[i - 1].gpa >= d.gpa), "Результат отсортирован по убыванию GPA");
          t.ok(Array.isArray(last) && last.length > 0 && last.every((d) => d._id === undefined && d.name && d.gpa !== undefined && d.faculty === undefined), "В результате только student_id, name и gpa (без _id)");
        },
        hint: "Порядок: `deleteOne({ student_id: \"S0050\" })` → `const low = ...toArray()` → `if (low.length > 0) db.archive.insertMany(low)` → `deleteMany({ gpa: { $lt: 3.5 } })` → `find(...).sort({ gpa: -1 })`.",
        solution: R`use university

db.students.deleteOne({ student_id: "S0050" })

const low = db.students.find({ gpa: { $lt: 3.5 } }).toArray()
low.length
if (low.length > 0) db.archive.insertMany(low)
db.students.deleteMany({ gpa: { $lt: 3.5 } })

db.archive.find({}, { _id: 0, name: 1, gpa: 1 })

db.students.find(
  { faculty: "Kompyuter lingvistikasi", scholarship: true },
  { _id: 0, student_id: 1, name: 1, gpa: 1 }
).sort({ gpa: -1 })
`,
      },
    ],
    quiz: [
      { q: "Какой фильтр найдёт студентов с GPA **не ниже** 4.0?", options: ["`{ gpa: { $gt: 4.0 } }`", "`{ gpa: { $gte: 4.0 } }`", "`{ gpa: \">= 4.0\" }`", "`{ $gte: { gpa: 4.0 } }`"], answer: 1, explain: "`$gte` — «больше или равно». Оператор пишется внутри условия поля: `{ поле: { $оператор: значение } }`." },
      { q: "Какой запрос соответствует SQL `SELECT name, gpa FROM students ORDER BY gpa DESC LIMIT 5`?", options: ["`db.students.find({ name: 1, gpa: 1 }).sort({ gpa: 1 }).limit(5)`", "`db.students.find({}, { name: 1, gpa: 1, _id: 0 }).sort({ gpa: -1 }).limit(5)`", "`db.students.find().limit(5).sort(\"gpa DESC\")`", "`db.students.select(\"name, gpa\").top(5)`"], answer: 1, explain: "Первый аргумент `find` — фильтр (здесь пустой), второй — проекция; `-1` в `sort` означает убывание." },
      { q: "Что найдёт `db.students.find({ skills: \"NLP\" })`, если `skills` — массив?", options: ["Только документы, где `skills` равно строке \"NLP\"", "Документы, в массиве `skills` которых есть элемент \"NLP\"", "Ничего — для массивов нужен `$elemMatch`", "Ошибку типа"], answer: 1, explain: "Условие на равенство для массива проверяет каждый его элемент." },
      { q: "Чем `$addToSet` отличается от `$push`?", options: ["Ничем, это синонимы", "`$addToSet` добавляет элемент, только если его ещё нет в массиве", "`$addToSet` заменяет массив целиком", "`$push` работает только с числами"], answer: 1, explain: "`$addToSet` превращает массив во множество: повторный запуск не создаёт дубликатов." },
      { q: "Что сделает `updateOne(фильтр, { $set: {...} }, { upsert: true })`, если ни один документ не подошёл под фильтр?", options: ["Вернёт ошибку", "Ничего не сделает", "Вставит новый документ из полей фильтра и `$set`", "Обновит первый документ коллекции"], answer: 2, explain: "upsert = update + insert: при отсутствии совпадений создаётся новый документ, в ответе `upsertedCount: 1`." },
      { q: "Что произойдёт после `updateOne({ student_id: \"S0003\" }, { $set: { contacts: { phone: \"+998...\" } } })`?", options: ["Изменится только телефон", "Объект `contacts` заменится целиком — e-mail пропадёт", "Будет ошибка", "Появится второй объект contacts"], answer: 1, explain: "`$set` заменяет значение поля целиком. Для одного вложенного поля используйте точечную нотацию: `\"contacts.phone\"`." },
    ],
    realEnv: R`
## CRUD в реальной среде

Подключитесь к серверу (локальному, в Docker или в Atlas — см. лабораторную работу 1) и импортируйте данные:

\`\`\`bash
mongoimport --db university --collection students --file data/mongo/students.json --jsonArray --drop
mongosh "mongodb://localhost:27017/university"
\`\`\`

Все команды заданий работают в \`mongosh\` без изменений. Многострочные команды можно вставлять целиком; редактор для длинных скриптов открывает команда \`.editor\` (завершение — Ctrl+D). Скрипт из файла выполняется командой \`load("crud.js")\` или \`mongosh university crud.js\`.

## MongoDB Compass

- **Documents → Filter**: вводите фильтр \`{ gpa: { $gte: 4.5 } }\`, в **Options** — \`Project\`, \`Sort\`, \`Skip\`, \`Limit\`.
- **Add data → Insert document** — вставка документа; карандаш на документе — редактирование, корзина — удаление.
- Кнопки **Update** и **Delete** над списком применяют \`updateMany\`/\`deleteMany\` к документам, подходящим под фильтр.

## Python: pymongo

\`\`\`python
from pymongo import MongoClient, DESCENDING
import pandas as pd

db = MongoClient("mongodb://localhost:27017")["university"]
students = db["students"]

# Create
students.insert_one({"student_id": "S0041", "name": "Aziza Karimova", "gpa": 4.21, "skills": ["Python", "NLP"]})

# Read: фильтр, проекция, сортировка, лимит
cursor = (students.find({"gpa": {"$gte": 4.0}, "city": {"$in": ["Toshkent", "Samarqand"]}},
                        {"_id": 0, "name": 1, "gpa": 1})
          .sort("gpa", DESCENDING).limit(5))
for s in cursor:
    print(s["name"], s["gpa"])

# Update
r = students.update_many({"course": 4}, {"$set": {"status": "bitiruvchi"}})
print(r.matched_count, r.modified_count)
students.update_one({"student_id": "S0050"}, {"$set": {"name": "Test Talaba"}}, upsert=True)

# Delete
print(students.delete_many({"gpa": {"$lt": 3.5}}).deleted_count)

# Результат запроса — в pandas
df = pd.DataFrame(students.find({}, {"_id": 0, "name": 1, "faculty": 1, "gpa": 1}))
print(df.groupby("faculty")["gpa"].mean().round(2))
\`\`\`

> [!TIP] Операторы в Python
> Имена операторов — обычные строки: \`{"$set": {...}}\`. Регулярные выражения: \`{"name": {"$regex": "ova$"}}\` или \`re.compile("ova$")\`.
`,
    homework: R`
**Мини-проект по работе с MongoDB. Этап 2 — CRUD.**

Для базы своего мини-проекта (этап 1) напишите скрипт \`crud.js\`:

1. Вставка 5 новых документов (\`insertOne\` и \`insertMany\`).
2. Пять запросов на чтение с разными операторами: сравнение, \`$in\`, \`$or\`, массивы (\`$all\`/\`$size\`), регулярное выражение, точечная нотация; хотя бы в двух — проекция, сортировка и \`limit\`.
3. Три обновления (\`$set\` с точечной нотацией, \`$addToSet\`/\`$push\`, \`updateMany\`) и одно \`upsert\`.
4. Удаление с переносом документов в архивную коллекцию.
5. Повторите 2–3 запроса через \`pymongo\` и загрузите результат в \`pandas.DataFrame\`.
`,
  });
})();
