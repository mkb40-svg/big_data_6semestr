/* Web Worker: Python (Pyodide) для тренажёра.
 * Загружает Pyodide, учебные данные (data/) и модули из py/,
 * затем выполняет ячейки кода по запросу главной страницы. */
const PYODIDE_VERSION = "0.29.5";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
importScripts(INDEX_URL + "pyodide.js");

const PY_FILES = [
  "trainer_rt.py",
  "pyspark/__init__.py", "pyspark/context.py", "pyspark/rdd.py", "pyspark/storagelevel.py",
  "pyspark/errors/__init__.py",
  "pyspark/sql/__init__.py", "pyspark/sql/types.py", "pyspark/sql/column.py", "pyspark/sql/functions.py",
  "pyspark/sql/window.py", "pyspark/sql/dataframe.py", "pyspark/sql/session.py", "pyspark/sql/utils.py",
];

let py = null;
let BASE = "";
const HOME = "/home/pyodide";
const loaded = new Set();
let httpPatched = false;
let RT = null;

function status(text, state) { postMessage({ type: "status", text, state }); }

function mkdirs(path) {
  const parts = path.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += "/" + p;
    try { py.FS.mkdir(cur); } catch (e) { /* exists */ }
  }
}

async function fetchBytes(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function writeFiles(list, urlPrefix, fsPrefix) {
  const queue = list.slice();
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const rel = queue.shift();
      const bytes = await fetchBytes(urlPrefix + rel);
      const full = fsPrefix + "/" + rel;
      mkdirs(full.substring(0, full.lastIndexOf("/")));
      py.FS.writeFile(full, bytes);
    }
  });
  await Promise.all(workers);
}

async function init(base) {
  BASE = base;
  status("Загрузка Python (Pyodide)…", "loading");
  py = await loadPyodide({ indexURL: INDEX_URL });
  status("Загрузка pandas и numpy…", "loading");
  await py.loadPackage(["numpy", "pandas", "micropip"], { messageCallback: () => {} });
  ["numpy", "pandas", "micropip"].forEach((p) => loaded.add(p));
  status("Загрузка учебных данных…", "loading");
  await writeFiles(PY_FILES, BASE + "py/", HOME + "/.trainer");
  const manifest = await (await fetch(BASE + "data/manifest.json", { cache: "no-cache" })).json();
  await writeFiles(manifest.files.map((f) => f.path), BASE + "data/", HOME + "/data");
  py.runPython(`
import os, sys
os.chdir("${HOME}")
sys.path.insert(0, "${HOME}/.trainer")
import trainer_rt
`);
  RT = py.pyimport("trainer_rt");
  status("Python готов", "ready");
}

const NEEDS = [
  [/\bmatplotlib\b|\bseaborn\b|\bwordcloud\b|\.plot\(|\.hist\(|plt\./, ["matplotlib"]],
  [/\brequests\b/, ["requests", "pyodide-http"]],
  [/read_xml|read_html|\blxml\b/, ["lxml"]],
  [/\bpyspark\b|read_sql|\bsqlite3\b/, ["sqlite3"]],
  [/\bbs4\b|BeautifulSoup/, ["beautifulsoup4"]],
  [/\bwordcloud\b|WordCloud/, ["wordcloud"]],
  [/\bsklearn\b/, ["scikit-learn"]],
  [/\bscipy\b/, ["scipy"]],
  [/\bnltk\b/, ["nltk"]],
];
const MICROPIP = [
  [/\bseaborn\b/, "seaborn"],
  [/openpyxl|read_excel|to_excel|ExcelFile|ExcelWriter/, "openpyxl"],
];

async function ensurePackages(src) {
  const want = new Set();
  for (const [rx, pkgs] of NEEDS) if (rx.test(src)) pkgs.forEach((p) => want.add(p));
  const todo = [...want].filter((p) => !loaded.has(p));
  if (todo.length) {
    status("Загрузка пакетов: " + todo.join(", ") + "…", "busy");
    await py.loadPackage(todo, { messageCallback: () => {} });
    todo.forEach((p) => loaded.add(p));
  }
  try { await py.loadPackagesFromImports(src, { messageCallback: () => {} }); } catch (e) { /* unknown imports ok */ }
  const mp = MICROPIP.filter(([rx, name]) => rx.test(src) && !loaded.has(name)).map(([, n]) => n);
  if (mp.length) {
    status("Установка из PyPI: " + mp.join(", ") + "…", "busy");
    const micropip = py.pyimport("micropip");
    try {
      await micropip.install(mp);
      mp.forEach((p) => loaded.add(p));
    } finally { micropip.destroy(); }
  }
  if (want.has("requests") && !httpPatched) {
    py.runPython("import pyodide_http; pyodide_http.patch_all()");
    httpPatched = true;
  }
}

async function run(msg) {
  const { id, setup = "", code = "", check = "", vars = {} } = msg;
  const src = [setup, code, check].join("\n");
  try {
    await ensurePackages(src);
    status("Выполняется…", "busy");
    const ctx = JSON.stringify({ vars });
    const res = RT.run_cell(setup, code, check || "", ctx);
    postMessage({ type: "result", id, result: JSON.parse(res) });
  } catch (e) {
    postMessage({ type: "result", id, result: { ok: false, items: [], checks: [], error: { name: "Ошибка среды", message: String(e && e.message || e), trace: "", hint: "Попробуйте перезапустить Python (кнопка в шапке)." } } });
  }
  status("Python готов", "ready");
}

async function listFiles(msg) {
  const out = py.runPython(`
import os, json
res = []
for root, dirs, files in os.walk("${msg.path || "."}"):
    dirs[:] = [d for d in dirs if not d.startswith(".")]
    for f in files:
        p = os.path.join(root, f)
        res.append([p[2:] if p.startswith("./") else p, os.path.getsize(p)])
json.dumps(sorted(res))
`);
  postMessage({ type: "files", id: msg.id, files: JSON.parse(out) });
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === "init") {
      await init(msg.base);
      postMessage({ type: "ready" });
    } else if (msg.type === "run") {
      await run(msg);
    } else if (msg.type === "files") {
      await listFiles(msg);
    }
  } catch (e) {
    if (msg.type === "init") {
      status("Ошибка загрузки Python: " + (e && e.message || e), "error");
      postMessage({ type: "init-error", message: String(e && e.message || e) });
    } else {
      postMessage({ type: "result", id: msg.id, result: { ok: false, items: [], checks: [], error: { name: "Ошибка", message: String(e), trace: "", hint: "" } } });
    }
  }
};
