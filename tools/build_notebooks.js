#!/usr/bin/env node
/* Сборка Jupyter-блокнотов (notebooks/<id>.ipynb) из файлов content/*.js.
 *
 * Запуск из корня репозитория:
 *   node tools/build_notebooks.js                 — адрес репозитория берётся из config.js
 *   node tools/build_notebooks.js owner/repo      — или указывается явно
 *
 * Блокноты нужны для работы в Google Colab / Anaconda: в них теория, условия заданий,
 * подготовительный и стартовый код. Автопроверки работают только в тренажёре. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
load("config.js");
load("js/registry.js");
for (const f of fs.readdirSync(path.join(ROOT, "content")).filter((x) => /^[lp]\d\d\.js$/.test(x)).sort()) load("content/" + f);

let repo = process.argv[2];
if (!repo) {
  const gh = (ctx.BDT_CONFIG && ctx.BDT_CONFIG.github) || {};
  repo = gh.owner && gh.repo ? `${gh.owner}/${gh.repo}` : "OWNER/REPO";
}
const branch = ((ctx.BDT_CONFIG && ctx.BDT_CONFIG.github) || {}).branch || "main";

function dedent(s) {
  const lines = String(s || "").replace(/\r/g, "").split("\n");
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(Number.isFinite(ind) ? ind : 0)).join("\n").trim();
}
function mdForJupyter(s) {
  const names = { NOTE: "Заметка", TIP: "Совет", WARNING: "Внимание", IMPORTANT: "Важно", INFO: "Справка" };
  return dedent(s)
    .replace(/^> \[!(NOTE|TIP|WARNING|IMPORTANT|INFO)\]\s*(.*)$/gim, (_, k, t) => `> **${names[k.toUpperCase()]}${t ? ": " + t : ""}**  `)
    .replace(/^```(\w+)[ \t]+(.+)$/gm, "**$2**\n\n```$1");
}
const src = (text) => {
  const lines = text.split("\n");
  return lines.map((l, i) => (i < lines.length - 1 ? l + "\n" : l));
};
const md = (text) => ({ cell_type: "markdown", metadata: {}, source: src(text) });
const code = (text) => ({ cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: src(text) });

const SETUP = (usesSpark) => `# ▶ Подготовка среды: выполните эту ячейку первой.
# Загружает учебные данные из репозитория тренажёра и запускает локальный веб-сервер
# (нужен для заданий с requests: учебный сайт SITE и учебный API).
import os, sys, subprocess, time

REPO = "https://github.com/${repo}.git"
if not os.path.exists("data/manifest.json"):
    if "OWNER/REPO" in REPO:
        raise SystemExit("Укажите в REPO адрес репозитория тренажёра на GitHub, например https://github.com/<логин>/bigdata-trainer.git")
    if not os.path.exists("bigdata-trainer"):
        subprocess.run(["git", "clone", "-q", "--depth", "1", REPO, "bigdata-trainer"], check=True)
    os.chdir("bigdata-trainer")

subprocess.Popen([sys.executable, "-m", "http.server", "8765"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
BASE_URL = "http://localhost:8765/"
SITE = BASE_URL + "data/site/"
API = BASE_URL + "data/api/v1/"
${usesSpark ? '\n# Для заданий по Spark нужен настоящий PySpark (в Colab ставится за ~1 минуту)\nsubprocess.run([sys.executable, "-m", "pip", "install", "-q", "pyspark", "openpyxl", "wordcloud", "seaborn"])\n' : 'subprocess.run([sys.executable, "-m", "pip", "install", "-q", "openpyxl", "wordcloud", "seaborn"])\n'}print("Готово. Рабочая папка:", os.getcwd())`;

fs.mkdirSync(path.join(ROOT, "notebooks"), { recursive: true });
let n = 0;
for (const s of ctx.BDT.ordered()) {
  const pyTasks = s.tasks.filter((t) => (t.env || (s.env || ["python"])[0]) === "python");
  if (!pyTasks.length) continue;
  const label = (s.kind === "lab" ? "Лабораторная работа " : "Практическое занятие ") + s.num;
  const cells = [];
  const colab = `https://colab.research.google.com/github/${repo}/blob/${branch}/notebooks/${s.id}.ipynb`;
  cells.push(md(`# ${label}. ${s.title}\n\n**Технологии больших данных (Big Data)**, 6 семестр.\n\n[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](${colab})\n\n` +
    (s.goals ? "**Цели занятия:**\n\n" + s.goals.map((g) => "- " + g).join("\n") : "") +
    "\n\n> Автоматическая проверка заданий доступна в веб-тренажёре. В блокноте выполняйте код и сверяйте результат с условием."));
  cells.push(code(SETUP((s.env || []).includes("spark") || pyTasks.some((t) => /pyspark/.test(t.starter + t.solution)))));
  if (s.theory) cells.push(md("## Теория\n\n" + mdForJupyter(s.theory)));
  s.tasks.forEach((t, i) => {
    const env = t.env || (s.env || ["python"])[0];
    if (env !== "python") {
      cells.push(md(`## Задание ${i + 1}. ${t.title}\n\n_Это задание выполняется в веб-тренажёре (${env === "mongo" ? "MongoDB" : env === "hdfs" ? "терминал HDFS" : "вопрос"})._\n\n` + mdForJupyter(t.text || "")));
      return;
    }
    cells.push(md(`## Задание ${i + 1}. ${t.title}\n\n` + mdForJupyter(t.text || "") + (t.hint ? `\n\n<details><summary>💡 Подсказка</summary>\n\n${mdForJupyter(t.hint)}\n\n</details>` : "")));
    if (t.setup) cells.push(code("# Подготовительный код задания\n" + dedent(t.setup)));
    cells.push(code(dedent(t.starter || "# ваш код")));
  });
  if (s.homework) cells.push(md("## Самостоятельная работа\n\n" + mdForJupyter(s.homework)));
  const nb = {
    cells,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
      colab: { provenance: [], toc_visible: true },
    },
    nbformat: 4, nbformat_minor: 5,
  };
  fs.writeFileSync(path.join(ROOT, "notebooks", `${s.id}.ipynb`), JSON.stringify(nb, null, 1) + "\n");
  n++;
}
console.log(`Создано блокнотов: ${n} (репозиторий: ${repo})`);
if (repo === "OWNER/REPO") console.log("Подсказка: укажите репозиторий: node tools/build_notebooks.js <владелец>/<репозиторий>");
