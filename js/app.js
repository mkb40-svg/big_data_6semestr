/* Тренажёр Big Data — интерфейс: маршруты, задания, проверки, прогресс, отчёт. */
(function () {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const BASE = new URL(".", location.href).href;
  const app = $("#app");

  // ------------------------------------------------------------------ хранилище
  const Store = {
    get(k, d) { try { const v = localStorage.getItem("bdt." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bdt." + k, JSON.stringify(v)); } catch (e) { toast("Не удалось сохранить прогресс (память браузера переполнена)", "error"); } },
    del(k) { try { localStorage.removeItem("bdt." + k); } catch (e) { /* */ } },
  };
  const progress = () => Store.get("progress", {});
  function sessProg(sid) { const p = progress(); return p[sid] || { tasks: {}, quiz: null }; }
  function saveSess(sid, sp) { const p = progress(); p[sid] = sp; Store.set("progress", p); }
  function markTask(sid, tid, patch) {
    const sp = sessProg(sid);
    sp.tasks[tid] = Object.assign({ attempts: 0 }, sp.tasks[tid], patch);
    sp.last = Date.now();
    saveSess(sid, sp);
  }
  function stats(s) {
    const sp = sessProg(s.id);
    const done = s.tasks.filter((t) => sp.tasks[t.id] && sp.tasks[t.id].done).length;
    const quizTotal = s.quiz.length ? 1 : 0;
    const quizDone = s.quiz.length && sp.quiz && sp.quiz.best >= 0.7 ? 1 : 0;
    const total = s.tasks.length + quizTotal;
    const pct = total ? Math.round(((done + quizDone) / total) * 100) : 0;
    const peeked = s.tasks.filter((t) => sp.tasks[t.id] && sp.tasks[t.id].sawSolution).length;
    return { done, tasks: s.tasks.length, quizBest: sp.quiz ? sp.quiz.best : null, quizDone, pct, peeked, last: sp.last };
  }
  const profile = () => Store.get("profile", { name: "", group: "" });
  const codeKey = (sid, tid) => `code.${sid}.${tid}`;

  // ------------------------------------------------------------------ утилиты интерфейса
  function toast(msg, kind = "info") {
    const t = document.createElement("div");
    t.className = `toast toast-${kind}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3200);
  }
  function confirmBox(text) { return window.confirm(text); }
  function download(name, text, type = "text/plain") {
    const blob = new Blob([text], { type: type + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const ENV_LABEL = { python: "Python", mongo: "MongoDB", hdfs: "HDFS", spark: "Spark", choice: "Тест", answer: "Ответ" };
  const kindLabel = (s) => (s.kind === "lab" ? "Лабораторная работа" : "Практическое занятие");
  const code = (s) => (s.kind === "lab" ? "Л" : "П") + s.num;
  function bar(pct) { return `<div class="bar"><span style="width:${pct}%"></span></div>`; }
  const HL_MODES = { python: "python", py: "python", javascript: "javascript", js: "javascript", json: { name: "javascript", json: true }, bash: "shell", sh: "shell", shell: "shell" };
  function wireCopy(root) {
    $$(".copy-btn", root).forEach((b) => b.addEventListener("click", () => {
      const pre = b.parentElement.querySelector("pre");
      navigator.clipboard && navigator.clipboard.writeText(pre.innerText).then(() => toast("Скопировано"));
    }));
    // подсветка синтаксиса в примерах кода (CodeMirror runmode)
    if (window.CodeMirror && CodeMirror.runMode) {
      $$("pre code[class^='lang-']", root).forEach((c) => {
        const mode = HL_MODES[c.className.slice(5)];
        if (!mode || c.dataset.hl) return;
        const text = c.textContent;
        c.textContent = "";
        c.classList.add("cm-s-default");
        CodeMirror.runMode(text, mode, c);
        c.dataset.hl = "1";
      });
    }
  }

  // ------------------------------------------------------------------ редактор
  function makeEditor(el, value, mode, onChange, onRun) {
    if (window.CodeMirror) {
      const cm = window.CodeMirror(el, {
        value, mode: mode === "python" ? "python" : mode === "shell" ? "shell" : "javascript",
        lineNumbers: true, indentUnit: 4, tabSize: 4, matchBrackets: true, autoCloseBrackets: true,
        viewportMargin: Infinity, lineWrapping: false,
        extraKeys: {
          "Ctrl-Enter": () => onRun && onRun(), "Cmd-Enter": () => onRun && onRun(), "Shift-Enter": () => onRun && onRun(),
          Tab: (c) => (c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection(" ".repeat(c.getOption("indentUnit")), "end")),
          "Shift-Tab": (c) => c.indentSelection("subtract"),
          "Ctrl-/": "toggleComment",
        },
      });
      cm.on("change", () => onChange && onChange(cm.getValue()));
      return { getValue: () => cm.getValue(), setValue: (v) => cm.setValue(v), focus: () => cm.focus(), refresh: () => cm.refresh() };
    }
    const ta = document.createElement("textarea");
    ta.className = "fallback-editor"; ta.value = value; ta.spellcheck = false;
    ta.addEventListener("input", () => onChange && onChange(ta.value));
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey || e.shiftKey) && e.key === "Enter") { e.preventDefault(); onRun && onRun(); }
      if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("    ", s, ta.selectionEnd, "end"); }
    });
    el.appendChild(ta);
    return { getValue: () => ta.value, setValue: (v) => { ta.value = v; }, focus: () => ta.focus(), refresh() {} };
  }

  // ------------------------------------------------------------------ вывод Python/Mongo
  function renderItems(items) {
    return (items || []).map((it) => {
      if (it.type === "text") return `<pre class="out-text">${esc(it.data)}</pre>`;
      if (it.type === "muted") return `<pre class="out-text muted">${esc(it.data)}</pre>`;
      if (it.type === "stderr") return `<pre class="out-text out-warn">${esc(it.data)}</pre>`;
      if (it.type === "error") return `<pre class="out-text out-err">${esc(it.data)}</pre>`;
      if (it.type === "html") return `<div class="out-html">${it.data}</div>`;
      if (it.type === "image") return `<div class="out-img"><img src="data:image/png;base64,${it.data}" alt="график"></div>`;
      return "";
    }).join("");
  }
  function renderError(err) {
    if (!err) return "";
    return `<div class="out-error"><div class="err-name">${esc(err.message)}</div>${err.trace ? `<pre>${esc(err.trace)}</pre>` : ""}${err.hint ? `<div class="err-hint">💡 ${esc(err.hint)}</div>` : ""}</div>`;
  }
  function renderChecks(checks, ok) {
    if (!checks || !checks.length) return "";
    return `<div class="checks ${ok ? "checks-ok" : "checks-bad"}"><div class="checks-title">${ok ? "✅ Все проверки пройдены" : "Проверки"}</div><ul>${checks.map((c) => `<li class="${c.ok ? "c-ok" : "c-bad"}"><span>${c.ok ? "✓" : "✗"}</span> ${MD.inline(c.msg)}</li>`).join("")}</ul></div>`;
  }

  // ------------------------------------------------------------------ терминал
  function makeTerminal(el, opts) {
    el.innerHTML = `<div class="term" tabindex="-1"><pre class="term-out"></pre><div class="term-line"><span class="term-prompt"></span><input class="term-input" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Командная строка"></div></div>`;
    const term = $(".term", el), out = $(".term-out", el), input = $(".term-input", el), prompt = $(".term-prompt", el);
    let hist = opts.history ? opts.history() : [], hpos = hist.length;
    const write = (text, cls) => {
      const span = document.createElement("span");
      if (cls) span.className = cls;
      span.textContent = text;
      out.appendChild(span);
      term.scrollTop = term.scrollHeight;
    };
    const setPrompt = () => { prompt.textContent = opts.prompt(); };
    setPrompt();
    if (opts.banner) write(opts.banner, "term-muted");
    term.addEventListener("click", () => { if (!window.getSelection().toString()) input.focus(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const line = input.value;
        write(prompt.textContent + line + "\n", "term-cmd");
        input.value = "";
        const r = opts.exec(line);
        if (r.clear) out.textContent = "";
        else if (r.out) write(r.out, r.code ? "term-err" : "");
        hist = opts.history ? opts.history() : hist.concat(line); hpos = hist.length;
        setPrompt();
        opts.after && opts.after(line, r);
        term.scrollTop = term.scrollHeight;
      } else if (e.key === "ArrowUp") {
        if (hpos > 0) { hpos--; input.value = hist[hpos] || ""; }
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (hpos < hist.length) { hpos++; input.value = hist[hpos] || ""; }
        e.preventDefault();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const r = opts.complete && opts.complete(input.value);
        if (typeof r === "string") input.value = r;
        else if (r) { input.value = r.line; write(prompt.textContent + input.value + "\n" + r.options.join("   ") + "\n", "term-muted"); }
      } else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.textContent = ""; }
    });
    return {
      focus: () => input.focus(),
      type(line) { input.value = line; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); },
      write,
    };
  }

  // ------------------------------------------------------------------ проверки (JS) для mongo/hdfs — см. js/checks.js
  const { runJsCheck, mongoApi, hdfsApi } = window.Checks;

  // ------------------------------------------------------------------ шапка
  function header() {
    const h = $("#topbar");
    h.innerHTML = `
      <a class="brand" href="#/"><span class="logo">BD</span><span class="brand-text">Big Data <small>тренажёр · 6 семестр</small></span></a>
      <nav class="nav">
        <a href="#/" data-nav="home">Занятия</a>
        <a href="#/sandbox/python" data-nav="sandbox">Песочница</a>
        <a href="#/report" data-nav="report">Отчёт</a>
        <a href="#/about" data-nav="about">Справка</a>
      </nav>
      <div class="top-right">
        <button class="py-pill" id="pyPill" title="Состояние Python. Нажмите, чтобы перезапустить."><span class="dot"></span><span class="py-text">Python</span></button>
        <button class="icon-btn" id="themeBtn" title="Светлая/тёмная тема" aria-label="Сменить тему">◐</button>
      </div>`;
    const pill = $("#pyPill");
    Py.onStatus((state, text) => {
      pill.className = "py-pill st-" + state;
      $(".py-text", pill).textContent = state === "ready" ? "Python готов" : state === "idle" ? "Python" : state === "error" ? "Ошибка Python" : text.length > 34 ? text.slice(0, 32) + "…" : text;
      pill.title = text + " (нажмите — перезапуск Python)";
    });
    pill.addEventListener("click", () => {
      if (Py.state === "idle") { Py.start(); return; }
      if (confirmBox("Перезапустить Python? Переменные и созданные файлы будут сброшены.")) Py.restart();
    });
    $("#themeBtn").addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const nxt = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nxt;
      Store.set("theme", nxt);
    });
  }
  function setNav(name) { $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === name)); }

  // ------------------------------------------------------------------ главная
  function viewHome() {
    setNav("home");
    const pr = profile();
    const all = BDT.ordered();
    const labs = all.filter((s) => s.kind === "lab"), prac = all.filter((s) => s.kind === "practice");
    const tot = all.reduce((a, s) => { const st = stats(s); return { d: a.d + st.done + st.quizDone, t: a.t + st.tasks + (s.quiz.length ? 1 : 0) }; }, { d: 0, t: 0 });
    const pct = tot.t ? Math.round((tot.d / tot.t) * 100) : 0;
    const card = (s) => {
      const st = stats(s);
      const envs = (s.env || []).map((e) => `<span class="badge env-${e}">${ENV_LABEL[e] || e}</span>`).join("");
      const status = st.pct === 100 ? `<span class="status done">выполнено</span>` : st.pct > 0 ? `<span class="status wip">${st.pct}%</span>` : "";
      return `<a class="card ${st.pct === 100 ? "card-done" : ""}" href="#/s/${s.id}">
        <div class="card-top"><span class="card-code">${code(s)}</span>${status}</div>
        <div class="card-title">${esc(s.title)}</div>
        <div class="card-meta">${envs}<span class="muted small">${s.tasks.length} зад.${s.quiz.length ? " + тест" : ""}</span></div>
        ${bar(st.pct)}
      </a>`;
    };
    app.innerHTML = `
      <section class="hero">
        <div class="hero-main">
          <div class="eyebrow">Технологии больших данных (Big Data) · Компьютерная лингвистика · 3 курс</div>
          <h1>Тренажёр лабораторных и практических занятий</h1>
          <p class="lead">Python, MongoDB, HDFS и Spark прямо в браузере. Ничего устанавливать не нужно: код запускается во встроенном Python (Pyodide), базы данных и кластер работают в учебных эмуляторах. Каждое задание проверяется автоматически, прогресс сохраняется в браузере.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/s/${(all.find((s) => stats(s).pct < 100) || all[0] || {}).id || ""}">Продолжить</a>
            <a class="btn" href="#/about">Как работать с тренажёром</a>
          </div>
        </div>
        <div class="hero-side">
          <div class="profile">
            <label>ФИО студента<input id="pfName" value="${esc(pr.name)}" placeholder="Фамилия Имя"></label>
            <label>Группа<input id="pfGroup" value="${esc(pr.group)}" placeholder="например, KL-301"></label>
          </div>
          <div class="overall"><div class="overall-num">${pct}%</div><div class="muted small">общий прогресс · ${tot.d} из ${tot.t} пунктов</div>${bar(pct)}</div>
        </div>
      </section>
      <h2 class="sec-title">Лабораторные работы <span class="muted">· 8 работ, 16 часов</span></h2>
      <div class="grid">${labs.map(card).join("") || '<p class="muted">Нет занятий</p>'}</div>
      <h2 class="sec-title">Практические занятия <span class="muted">· 15 занятий, 30 часов</span></h2>
      <div class="grid">${prac.map(card).join("") || '<p class="muted">Нет занятий</p>'}</div>
      <h2 class="sec-title">Песочницы <span class="muted">· свободная практика</span></h2>
      <div class="grid grid-3">
        <a class="card sandbox" href="#/sandbox/python"><div class="card-title">🐍 Python + данные</div><div class="muted small">pandas, numpy, matplotlib, requests, BeautifulSoup, sqlite3, PySpark-эмулятор</div></a>
        <a class="card sandbox" href="#/sandbox/mongo"><div class="card-title">🍃 MongoDB (mongosh)</div><div class="muted small">Документные базы, CRUD, агрегации, индексы</div></a>
        <a class="card sandbox" href="#/sandbox/hdfs"><div class="card-title">🐘 Терминал Hadoop HDFS</div><div class="muted small">Кластер из 3 узлов: hdfs dfs, fsck, dfsadmin</div></a>
      </div>`;
    const savePf = () => Store.set("profile", { name: $("#pfName").value.trim(), group: $("#pfGroup").value.trim() });
    $("#pfName").addEventListener("change", savePf);
    $("#pfGroup").addEventListener("change", savePf);
  }

  // ------------------------------------------------------------------ занятие
  let cleanup = null;
  function viewSession(sid, tab, tnum) {
    setNav("home");
    const s = BDT.get(sid);
    if (!s) { app.innerHTML = `<p>Занятие не найдено. <a href="#/">На главную</a></p>`; return; }
    const sp = sessProg(sid);
    if (!tab) tab = sp.seenTheory || !s.theory ? "task" : "theory";
    if (tab === "theory") { sp.seenTheory = true; saveSess(sid, sp); }
    const st = stats(s);
    const all = BDT.ordered();
    const idx = all.findIndex((x) => x.id === sid);
    const prev = all[idx - 1], next = all[idx + 1];
    const tabs = [["theory", "Теория"], ["task", `Задания <span class="pill-count">${st.done}/${st.tasks}</span>`]];
    if (s.quiz.length) tabs.push(["quiz", `Тест${st.quizBest != null ? ` <span class="pill-count">${Math.round(st.quizBest * 100)}%</span>` : ""}`]);
    if (s.realEnv) tabs.push(["real", "Реальная среда"]);
    app.innerHTML = `
      <div class="crumbs"><a href="#/">Занятия</a> / ${kindLabel(s)} ${s.num}</div>
      <div class="sess-head">
        <div>
          <h1><span class="sess-code">${code(s)}</span> ${esc(s.title)}</h1>
          <div class="sess-meta">${(s.env || []).map((e) => `<span class="badge env-${e}">${ENV_LABEL[e] || e}</span>`).join("")}<span class="muted">${s.hours || 2} ч · ${s.tasks.length} заданий${s.quiz.length ? " · тест " + s.quiz.length + " вопр." : ""}</span></div>
        </div>
        <div class="sess-prog"><div class="muted small">Выполнено ${st.pct}%</div>${bar(st.pct)}</div>
      </div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" class="tab ${k === tab ? "active" : ""}" href="#/s/${sid}/${k}">${l}</a>`).join("")}</div>
      <div id="tabBody"></div>
      <div class="sess-nav">${prev ? `<a class="btn btn-ghost" href="#/s/${prev.id}">← ${code(prev)}. ${esc(prev.title.slice(0, 40))}${prev.title.length > 40 ? "…" : ""}</a>` : "<span></span>"}${next ? `<a class="btn btn-ghost" href="#/s/${next.id}">${code(next)}. ${esc(next.title.slice(0, 40))}${next.title.length > 40 ? "…" : ""} →</a>` : ""}</div>`;
    const body = $("#tabBody");
    if (tab === "theory") {
      body.innerHTML = `<article class="prose">${s.goals ? `<div class="goals"><div class="goals-title">Цели занятия</div><ul>${s.goals.map((g) => `<li>${MD.inline(g)}</li>`).join("")}</ul></div>` : ""}${MD.render(s.theory)}
        <div class="theory-next"><a class="btn btn-primary" href="#/s/${sid}/task/1">Перейти к заданиям →</a></div></article>`;
      wireCopy(body);
    } else if (tab === "quiz") viewQuiz(s, body);
    else if (tab === "real") {
      body.innerHTML = `<article class="prose">${MD.render(s.realEnv)}${colabBlock(s)}${s.homework ? `<h2>Самостоятельная работа</h2>${MD.render(s.homework)}` : ""}</article>`;
      wireCopy(body);
    } else viewTasks(s, body, Math.max(1, Math.min(s.tasks.length, parseInt(tnum || "0", 10) || firstUndone(s))));
  }
  function firstUndone(s) {
    const sp = sessProg(s.id);
    const i = s.tasks.findIndex((t) => !(sp.tasks[t.id] && sp.tasks[t.id].done));
    return i < 0 ? 1 : i + 1;
  }
  function ghRepo() {
    const cfg = window.BDT_CONFIG.github || {};
    if (cfg.owner && cfg.repo) return { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch || "main" };
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
    if (!m) return null;
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return { owner: m[1], repo: seg && !seg.includes(".") ? seg : `${m[1]}.github.io`, branch: cfg.branch || "main" };
  }
  function colabBlock(s) {
    if (!(s.env || []).some((e) => e === "python" || e === "spark")) return "";
    const gh = ghRepo();
    const path = `notebooks/${s.id}.ipynb`;
    if (gh) {
      const url = `https://colab.research.google.com/github/${gh.owner}/${gh.repo}/blob/${gh.branch}/${path}`;
      return `<div class="callout callout-tip"><div class="callout-title">Google Colab</div><p>Этот же набор заданий в виде Jupyter-блокнота: <a class="btn btn-small" target="_blank" rel="noopener" href="${url}">Открыть в Colab</a> &nbsp; <a href="${path}" download>Скачать .ipynb</a></p></div>`;
    }
    return `<div class="callout callout-tip"><div class="callout-title">Jupyter Notebook</div><p>Блокнот с заданиями: <a href="${path}" download>${path}</a>. Откройте его в Jupyter (Anaconda) или загрузите в Google Colab (Файл → Загрузить блокнот).</p></div>`;
  }

  // ------------------------------------------------------------------ задания
  function viewTasks(s, body, n) {
    const sp = sessProg(s.id);
    const t = s.tasks[n - 1];
    if (!t) { body.innerHTML = `<p class="muted">В этом занятии пока нет заданий.</p>`; return; }
    const env = t.env || (s.env || ["python"])[0];
    const list = s.tasks.map((x, i) => {
      const ts = sp.tasks[x.id] || {};
      return `<a class="step ${i + 1 === n ? "active" : ""} ${ts.done ? "done" : ""}" href="#/s/${s.id}/task/${i + 1}"><span class="step-num">${ts.done ? "✓" : i + 1}</span><span class="step-title">${esc(x.title)}</span></a>`;
    }).join("");
    const ts = sp.tasks[t.id] || {};
    body.innerHTML = `
      <div class="task-layout">
        <aside class="steps">${list}${s.quiz.length ? `<a class="step step-quiz" href="#/s/${s.id}/quiz"><span class="step-num">?</span><span class="step-title">Итоговый тест</span></a>` : ""}</aside>
        <section class="task">
          <div class="task-head"><div class="task-no">Задание ${n} из ${s.tasks.length} <span class="badge env-${env}">${ENV_LABEL[env] || env}</span>${ts.done ? '<span class="status done">выполнено</span>' : ""}${ts.sawSolution ? '<span class="status peek" title="Решение было открыто">решение открыто</span>' : ""}</div>
          <h2>${esc(t.title)}</h2></div>
          <div class="prose task-text">${MD.render(t.text)}</div>
          <div id="taskWork"></div>
          <div class="task-foot">
            ${t.hint ? `<details class="hint"><summary>💡 Подсказка</summary><div class="prose">${MD.render(t.hint)}</div></details>` : ""}
            ${t.solution && !["choice", "answer"].includes(env) ? `<details class="solution" id="solBox"><summary>Показать решение</summary><div class="sol-body"></div></details>` : ""}
          </div>
          <div class="task-nav">${n > 1 ? `<a class="btn btn-ghost" href="#/s/${s.id}/task/${n - 1}">← Назад</a>` : "<span></span>"}${n < s.tasks.length ? `<a class="btn ${ts.done ? "btn-primary" : "btn-ghost"}" id="nextTask" href="#/s/${s.id}/task/${n + 1}">Следующее задание →</a>` : s.quiz.length ? `<a class="btn ${ts.done ? "btn-primary" : "btn-ghost"}" id="nextTask" href="#/s/${s.id}/quiz">К тесту →</a>` : ""}</div>
        </section>
      </div>`;
    wireCopy(body);
    const work = $("#taskWork");
    const onDone = (codeText) => {
      const already = (sessProg(s.id).tasks[t.id] || {}).done;
      markTask(s.id, t.id, { done: true, ts: Date.now(), code: codeText });
      if (!already) { toast("Задание выполнено! 🎉", "success"); }
      const nb = $("#nextTask"); if (nb) { nb.classList.add("btn-primary"); nb.classList.remove("btn-ghost"); }
      const step = $$(".step")[n - 1]; if (step) { step.classList.add("done"); $(".step-num", step).textContent = "✓"; }
    };
    const solBox = $("#solBox");
    if (solBox) {
      solBox.addEventListener("toggle", () => {
        if (!solBox.open) return;
        const cur = sessProg(s.id).tasks[t.id] || {};
        if (!cur.sawSolution && !cur.done && !confirmBox("Открыть эталонное решение? Это будет отмечено в отчёте. Сначала попробуйте подсказку.")) { solBox.open = false; return; }
        if (!cur.done) markTask(s.id, t.id, { sawSolution: true });
        $(".sol-body", solBox).innerHTML = `<div class="md-code"><button class="copy-btn">⧉</button><pre><code>${esc(t.solution)}</code></pre></div>${env !== "hdfs" ? '<button class="btn btn-small" id="useSol">Вставить в редактор</button>' : ""}`;
        wireCopy(solBox);
        const us = $("#useSol");
        if (us) us.addEventListener("click", () => { if (work._editor) { work._editor.setValue(t.solution); toast("Решение вставлено в редактор"); } });
      });
    }
    if (env === "python") taskPython(s, t, work, onDone);
    else if (env === "mongo") taskMongo(s, t, work, onDone);
    else if (env === "hdfs") taskHdfs(s, t, work, onDone);
    else if (env === "choice") taskChoice(s, t, work, onDone);
    else if (env === "answer") taskAnswer(s, t, work, onDone);
  }

  function editorBlock(work, s, t, mode, extraButtons = "") {
    const saved = Store.get(codeKey(s.id, t.id), null);
    const initial = saved != null ? saved : t.starter || "";
    work.innerHTML = `
      ${t.setup && t.showSetup !== false && mode === "python" ? `<details class="setup"><summary>Подготовленный код (выполняется перед вашим автоматически)</summary><pre>${esc(t.setup.trim())}</pre></details>` : ""}
      <div class="editor-wrap"><div class="editor" id="editor"></div></div>
      <div class="run-bar">
        <button class="btn btn-primary" id="runBtn">▶ Запустить и проверить <kbd>Ctrl+Enter</kbd></button>
        <button class="btn btn-ghost" id="stopBtn" hidden>■ Стоп</button>
        <button class="btn btn-ghost" id="resetCode" title="Вернуть стартовый код">↺ Сбросить код</button>
        ${extraButtons}
        <span class="run-status muted" id="runStatus"></span>
      </div>
      <div class="output" id="output"></div>`;
    let timer = null;
    const ed = makeEditor($("#editor", work), initial, mode, (v) => {
      clearTimeout(timer); timer = setTimeout(() => Store.set(codeKey(s.id, t.id), v), 400);
    }, () => $("#runBtn", work).click());
    work._editor = ed;
    $("#resetCode", work).addEventListener("click", () => {
      if (!confirmBox("Вернуть стартовый код задания? Ваш текущий код будет заменён.")) return;
      ed.setValue(t.starter || ""); Store.del(codeKey(s.id, t.id));
    });
    return ed;
  }

  function pyVars() {
    return { SITE: BASE + "data/site/", API: BASE + "data/api/v1/", BASE_URL: BASE };
  }

  function taskPython(s, t, work, onDone) {
    const ed = editorBlock(work, s, t, "python");
    const out = $("#output", work), runBtn = $("#runBtn", work), stopBtn = $("#stopBtn", work), status = $("#runStatus", work);
    if (Py.state === "idle") Py.start();
    runBtn.addEventListener("click", async () => {
      if (runBtn.disabled) return;
      runBtn.disabled = true; stopBtn.hidden = false;
      const codeText = ed.getValue();
      Store.set(codeKey(s.id, t.id), codeText);
      out.innerHTML = `<div class="running"><span class="spinner"></span> ${Py.state === "ready" ? "Выполняется…" : "Загрузка Python… первый запуск занимает 10–30 секунд"}</div>`;
      const t0 = performance.now();
      const res = await Py.run({ setup: t.setup || "", code: codeText, check: t.check || "", vars: pyVars() });
      const dt = ((performance.now() - t0) / 1000).toFixed(2);
      runBtn.disabled = false; stopBtn.hidden = true;
      const prev = sessProg(s.id).tasks[t.id] || {};
      markTask(s.id, t.id, { attempts: (prev.attempts || 0) + 1 });
      out.innerHTML = renderItems(res.items) + renderError(res.error) + renderChecks(res.checks, res.ok) +
        (!res.items.length && !res.error && !(res.checks || []).length ? `<div class="muted small">Код выполнен, вывода нет.</div>` : "");
      status.textContent = `${dt} с`;
      if (res.ok) onDone(codeText);
      else if (t.check && !res.error && (!res.checks || !res.checks.length)) out.innerHTML += `<div class="muted small">Проверки не выполнены.</div>`;
    });
    stopBtn.addEventListener("click", () => { Py.restart(); toast("Python перезапущен"); });
  }

  function mongoExplorer(el) {
    const sum = Mongo.summary();
    el.innerHTML = `<div class="explorer-title">Базы данных <button class="link-btn" id="mReset" title="Удалить все базы эмулятора">сбросить</button></div>` +
      (sum.length ? sum.map((d) => `<div class="ex-db ${d.db === Mongo.sim.current ? "cur" : ""}">🗄 ${esc(d.db)}${d.db === Mongo.sim.current ? ' <span class="muted small">(текущая)</span>' : ""}</div>` +
        d.colls.map((c) => `<div class="ex-coll">📄 ${esc(c.name)} <span class="muted small">${c.count} док.</span></div>`).join("")).join("")
        : `<div class="muted small">Пока пусто. Текущая база: <b>${esc(Mongo.sim.current)}</b></div>`);
    $("#mReset", el).addEventListener("click", () => {
      if (!confirmBox("Удалить все базы данных эмулятора MongoDB?")) return;
      Mongo.reset(); mongoExplorer(el); toast("Базы данных очищены");
    });
  }

  function taskMongo(s, t, work, onDone) {
    const ed = editorBlock(work, s, t, "javascript");
    work.classList.add("with-explorer");
    const ex = document.createElement("div");
    ex.className = "explorer";
    $(".editor-wrap", work).appendChild(ex);
    mongoExplorer(ex);
    const out = $("#output", work), runBtn = $("#runBtn", work);
    $("#stopBtn", work).remove();
    runBtn.addEventListener("click", async () => {
      const codeText = ed.getValue();
      Store.set(codeKey(s.id, t.id), codeText);
      if (t.fixtures) await Mongo.ensureFixtures(t.fixtures);
      const res = await Mongo.run(codeText);
      const prev = sessProg(s.id).tasks[t.id] || {};
      markTask(s.id, t.id, { attempts: (prev.attempts || 0) + 1 });
      let chk = { checks: [], ok: false };
      if (t.check) chk = runJsCheck(t.check, mongoApi(res, codeText));
      out.innerHTML = `<div class="mongo-out">${renderItems(res.items) || '<span class="muted small">(нет вывода)</span>'}</div>` + renderChecks(chk.checks, chk.ok);
      mongoExplorer(ex);
      if (chk.ok) onDone(codeText);
    });
  }

  function taskHdfs(s, t, work, onDone) {
    work.innerHTML = `<div class="term-wrap" id="termBox"></div>
      <div class="run-bar"><button class="btn btn-primary" id="chkBtn">✔ Проверить</button><button class="btn btn-ghost" id="hReset" title="Вернуть файловые системы к исходному состоянию">↺ Сбросить кластер</button><span class="muted small">Введите команды в терминале. Подсказка по командам: <code>help</code></span></div>
      <div class="output" id="output"></div>`;
    const out = $("#output", work);
    let lastCmd = "", lastRes = null, done = !!(sessProg(s.id).tasks[t.id] || {}).done;
    const evaluate = (show) => {
      if (!t.check) return;
      const chk = runJsCheck(t.check, hdfsApi(lastCmd, lastRes));
      if (show || chk.ok) out.innerHTML = renderChecks(chk.checks, chk.ok);
      if (chk.ok && !done) { done = true; onDone(Hdfs.api().history().slice(-30).join("\n")); }
    };
    Hdfs.ready.then(() => {
      const term = makeTerminal($("#termBox", work), {
        exec: (line) => Hdfs.exec(line), prompt: Hdfs.prompt, complete: Hdfs.complete,
        history: () => Hdfs.api().history(),
        banner: "Hadoop 3.3.6 · учебный кластер (NameNode + 3 DataNode). Введите help для списка команд.\n",
        after: (line, r) => { lastCmd = line; lastRes = r; const prev = sessProg(s.id).tasks[t.id] || {}; markTask(s.id, t.id, { attempts: (prev.attempts || 0) + 1 }); evaluate(false); },
      });
      term.focus();
    });
    $("#chkBtn", work).addEventListener("click", () => evaluate(true));
    $("#hReset", work).addEventListener("click", async () => {
      if (!confirmBox("Сбросить HDFS и локальные файлы к исходному состоянию? Кластер будет остановлен.")) return;
      await Hdfs.reset(); toast("Кластер сброшен"); route();
    });
  }

  function taskChoice(s, t, work, onDone) {
    const multi = Array.isArray(t.answer);
    work.innerHTML = `<div class="choice">${t.options.map((o, i) => `<label class="opt"><input type="${multi ? "checkbox" : "radio"}" name="ch" value="${i}"> <span>${MD.inline(o)}</span></label>`).join("")}</div>
      <div class="run-bar"><button class="btn btn-primary" id="chkBtn">Проверить ответ</button>${multi ? '<span class="muted small">Выберите все верные варианты</span>' : ""}</div><div class="output" id="output"></div>`;
    $("#chkBtn", work).addEventListener("click", () => {
      const sel = $$("input[name=ch]:checked", work).map((x) => +x.value).sort();
      const ans = (multi ? t.answer.slice() : [t.answer]).sort();
      const ok = sel.length === ans.length && sel.every((v, i) => v === ans[i]);
      const prev = sessProg(s.id).tasks[t.id] || {};
      markTask(s.id, t.id, { attempts: (prev.attempts || 0) + 1 });
      $("#output", work).innerHTML = `<div class="checks ${ok ? "checks-ok" : "checks-bad"}"><div class="checks-title">${ok ? "✅ Верно!" : "✗ Пока неверно — подумайте ещё"}</div>${ok && t.explain ? `<div class="prose">${MD.render(t.explain)}</div>` : ""}</div>`;
      if (ok) onDone(JSON.stringify(sel));
    });
  }

  function taskAnswer(s, t, work, onDone) {
    work.innerHTML = `<div class="answer-row"><input id="ansInput" class="ans-input" placeholder="Ваш ответ" autocomplete="off"><button class="btn btn-primary" id="chkBtn">Проверить</button></div><div class="output" id="output"></div>`;
    const norm = (x) => String(x).trim().toLowerCase().replace(/\s+/g, " ").replace(",", ".").replace(/ʻ|‘|’|`/g, "'");
    const check = () => {
      const v = norm($("#ansInput", work).value);
      const ok = (t.answers || []).some((a) => (typeof a === "number" ? Math.abs(parseFloat(v) - a) <= (t.tolerance || 0) : norm(a) === v));
      const prev = sessProg(s.id).tasks[t.id] || {};
      markTask(s.id, t.id, { attempts: (prev.attempts || 0) + 1 });
      $("#output", work).innerHTML = `<div class="checks ${ok ? "checks-ok" : "checks-bad"}"><div class="checks-title">${ok ? "✅ Верно!" : "✗ Неверно, попробуйте ещё раз"}</div>${ok && t.explain ? `<div class="prose">${MD.render(t.explain)}</div>` : ""}</div>`;
      if (ok) onDone(v);
    };
    $("#chkBtn", work).addEventListener("click", check);
    $("#ansInput", work).addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
  }

  // ------------------------------------------------------------------ тест
  function viewQuiz(s, body) {
    const sp = sessProg(s.id);
    body.innerHTML = `<div class="quiz">${s.quiz.map((q, i) => {
      const multi = Array.isArray(q.answer);
      return `<div class="q" data-i="${i}"><div class="q-text"><b>${i + 1}.</b> ${MD.inline(q.q)}${multi ? ' <span class="muted small">(несколько ответов)</span>' : ""}</div>
        ${q.options.map((o, j) => `<label class="opt"><input type="${multi ? "checkbox" : "radio"}" name="q${i}" value="${j}"> <span>${MD.inline(o)}</span></label>`).join("")}
        <div class="q-explain" hidden></div></div>`;
    }).join("")}
      <div class="run-bar"><button class="btn btn-primary" id="quizBtn">Проверить ответы</button><span id="quizRes" class="quiz-res">${sp.quiz ? `Лучший результат: ${Math.round(sp.quiz.best * 100)}%` : ""}</span></div></div>`;
    $("#quizBtn", body).addEventListener("click", () => {
      let right = 0;
      s.quiz.forEach((q, i) => {
        const el = $(`.q[data-i="${i}"]`, body);
        const sel = $$(`input[name=q${i}]:checked`, el).map((x) => +x.value).sort();
        const ans = (Array.isArray(q.answer) ? q.answer.slice() : [q.answer]).sort();
        const ok = sel.length === ans.length && sel.every((v, k) => v === ans[k]);
        if (ok) right++;
        el.classList.toggle("q-ok", ok); el.classList.toggle("q-bad", !ok);
        $$(".opt", el).forEach((o, j) => o.classList.toggle("opt-right", ans.includes(j)));
        const ex = $(".q-explain", el);
        ex.hidden = false;
        ex.innerHTML = (ok ? "✓ Верно. " : "✗ Неверно. ") + (q.explain ? MD.inline(q.explain) : "");
      });
      const score = right / s.quiz.length;
      const prev = sessProg(s.id);
      prev.quiz = { last: score, best: Math.max(score, prev.quiz ? prev.quiz.best : 0), tries: (prev.quiz ? prev.quiz.tries : 0) + 1, ts: Date.now() };
      prev.last = Date.now();
      saveSess(s.id, prev);
      $("#quizRes", body).innerHTML = `Результат: <b>${right} из ${s.quiz.length}</b> (${Math.round(score * 100)}%). ${score >= 0.7 ? "Тест зачтён ✅" : "Для зачёта нужно ≥ 70%."}`;
    });
  }

  // ------------------------------------------------------------------ песочницы
  const SANDBOX_PY = `import pandas as pd

# Учебные данные лежат в папке data/
df = pd.read_csv("data/students.csv")
print(df.shape)
df.head()
`;
  const SANDBOX_MONGO = `use university
show collections
db.students.countDocuments({})
`;
  function viewSandbox(kind) {
    setNav("sandbox");
    const tabs = [["python", "🐍 Python"], ["mongo", "🍃 MongoDB"], ["hdfs", "🐘 HDFS"]];
    app.innerHTML = `<div class="crumbs"><a href="#/">Занятия</a> / Песочница</div>
      <h1>Песочница</h1><p class="muted">Свободная практика без проверок. Код сохраняется в браузере.</p>
      <div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${k === kind ? "active" : ""}" href="#/sandbox/${k}">${l}</a>`).join("")}</div><div id="sbBody"></div>`;
    const body = $("#sbBody");
    const fake = { id: "sandbox", tasks: [] };
    if (kind === "python") {
      const t = { id: "python", starter: SANDBOX_PY };
      body.innerHTML = `<div class="sb-grid"><div id="taskWork"></div><aside class="files"><div class="explorer-title">Файлы <button class="link-btn" id="refFiles">обновить</button></div><div id="fileList" class="muted small">Запустите код, чтобы загрузить Python…</div>
        <div class="explorer-title" style="margin-top:12px">Переменные</div><div class="muted small">SITE = учебный сайт<br>API = учебный REST API</div></aside></div>`;
      const work = $("#taskWork");
      const ed = editorBlock(work, fake, t, "python");
      const out = $("#output", work), runBtn = $("#runBtn", work), stopBtn = $("#stopBtn", work);
      const listFiles = async () => {
        const files = await Py.files(".");
        $("#fileList").innerHTML = files.filter(([p]) => !p.startsWith(".")).map(([p, sz]) => `<div class="file" title="${esc(p)}">${esc(p)} <span class="muted">${sz > 1024 ? Math.round(sz / 1024) + " КБ" : sz + " Б"}</span></div>`).join("");
      };
      if (Py.state === "idle") Py.start();
      Py.start().then(listFiles).catch(() => {});
      $("#refFiles").addEventListener("click", listFiles);
      runBtn.addEventListener("click", async () => {
        runBtn.disabled = true; stopBtn.hidden = false;
        out.innerHTML = `<div class="running"><span class="spinner"></span> Выполняется…</div>`;
        const res = await Py.run({ code: ed.getValue(), vars: pyVars() });
        runBtn.disabled = false; stopBtn.hidden = true;
        out.innerHTML = renderItems(res.items) + renderError(res.error) || '<span class="muted small">Нет вывода</span>';
        listFiles();
      });
      stopBtn.addEventListener("click", () => Py.restart());
    } else if (kind === "mongo") {
      body.innerHTML = `<div id="taskWork"></div><div class="prose small"><p>Импорт учебных данных: <code>mongoimport --db university --collection students --file data/mongo/students.json --jsonArray</code> (выполняется прямо в редакторе).</p></div>`;
      const work = $("#taskWork");
      const t = { id: "mongo", starter: SANDBOX_MONGO };
      taskMongo(fake, t, work, () => {});
    } else {
      body.innerHTML = `<div id="taskWork"></div>`;
      const work = $("#taskWork");
      work.innerHTML = `<div class="term-wrap tall" id="termBox"></div><div class="run-bar"><button class="btn btn-ghost" id="hReset">↺ Сбросить кластер</button><span class="muted small">Начните с <code>start-dfs.sh</code>, затем <code>jps</code> и <code>hdfs dfs -ls /</code></span></div>`;
      Hdfs.ready.then(() => makeTerminal($("#termBox"), { exec: (l) => Hdfs.exec(l), prompt: Hdfs.prompt, complete: Hdfs.complete, history: () => Hdfs.api().history(), banner: "Hadoop 3.3.6 · учебный кластер. Введите help.\n" }).focus());
      $("#hReset").addEventListener("click", async () => { if (confirmBox("Сбросить кластер?")) { await Hdfs.reset(); route(); } });
    }
  }

  // ------------------------------------------------------------------ отчёт
  function reportData() {
    const pr = profile();
    const rows = BDT.ordered().map((s) => ({ s, st: stats(s), sp: sessProg(s.id) }));
    const totalItems = rows.reduce((a, r) => a + r.st.tasks + (r.s.quiz.length ? 1 : 0), 0);
    const doneItems = rows.reduce((a, r) => a + r.st.done + r.st.quizDone, 0);
    return { pr, rows, totalItems, doneItems, pct: totalItems ? Math.round((doneItems / totalItems) * 100) : 0 };
  }
  function checksum(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase();
  }
  function viewReport() {
    setNav("report");
    const d = reportData();
    const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString("ru-RU") : "—");
    app.innerHTML = `<h1>Отчёт о выполнении</h1>
      <div class="report-head"><div><div class="muted small">Студент</div><div class="big">${esc(d.pr.name || "не указано")}</div></div><div><div class="muted small">Группа</div><div class="big">${esc(d.pr.group || "—")}</div></div><div><div class="muted small">Выполнено</div><div class="big">${d.pct}%</div></div><div><div class="muted small">Пунктов</div><div class="big">${d.doneItems} / ${d.totalItems}</div></div></div>
      ${!d.pr.name ? `<div class="callout callout-warning"><div class="callout-title">Укажите ФИО и группу</div><p>Заполните профиль на <a href="#/">главной странице</a>, чтобы они попали в отчёт.</p></div>` : ""}
      <div class="table-wrap"><table class="report"><thead><tr><th>Занятие</th><th>Задания</th><th>Тест</th><th>Открыто решений</th><th>Последняя активность</th><th>Прогресс</th></tr></thead><tbody>
      ${d.rows.map(({ s, st }) => `<tr><td><a href="#/s/${s.id}">${code(s)}. ${esc(s.title)}</a></td><td>${st.done}/${st.tasks}</td><td>${st.quizBest != null ? Math.round(st.quizBest * 100) + "%" : s.quiz.length ? "—" : "нет"}</td><td>${st.peeked || ""}</td><td class="small">${fmtDate(st.last)}</td><td style="min-width:90px">${bar(st.pct)}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="run-bar wrap">
        <button class="btn btn-primary" id="dlReport">⬇ Скачать отчёт (HTML)</button>
        <button class="btn" id="dlProgress">Экспорт прогресса (JSON)</button>
        <label class="btn">Импорт прогресса<input type="file" id="upProgress" accept=".json" hidden></label>
        <button class="btn btn-danger-ghost" id="rmProgress">Сбросить весь прогресс</button>
      </div>
      <p class="muted small">Отчёт содержит ваш код по каждому выполненному заданию. Отправьте HTML-файл преподавателю (например, в Telegram или по e-mail). Экспорт/импорт JSON позволяет перенести прогресс на другой компьютер.</p>`;
    $("#dlReport").addEventListener("click", () => {
      const html = buildReportHtml(d);
      const nm = (d.pr.name || "student").replace(/[^\p{L}\p{N}]+/gu, "_");
      download(`BigData_otchet_${nm}.html`, html, "text/html");
    });
    $("#dlProgress").addEventListener("click", () => {
      const dump = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("bdt.") && !k.startsWith("bdt.mongo") && !k.startsWith("bdt.hdfs")) dump[k] = localStorage.getItem(k); }
      download(`bigdata_progress_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "bigdata-trainer", version: 1, data: dump }, null, 1), "application/json");
    });
    $("#upProgress").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then((txt) => {
        try {
          const j = JSON.parse(txt);
          if (j.app !== "bigdata-trainer") throw new Error("не тот файл");
          if (!confirmBox("Заменить текущий прогресс данными из файла?")) return;
          Object.entries(j.data).forEach(([k, v]) => localStorage.setItem(k, v));
          toast("Прогресс импортирован", "success"); route();
        } catch (err) { toast("Не удалось импортировать: " + err.message, "error"); }
      });
    });
    $("#rmProgress").addEventListener("click", () => {
      if (!confirmBox("Удалить весь прогресс и сохранённый код? Это действие необратимо.")) return;
      Object.keys(localStorage).filter((k) => k.startsWith("bdt.") && k !== "bdt.theme").forEach((k) => localStorage.removeItem(k));
      toast("Прогресс удалён"); route();
    });
  }
  function buildReportHtml(d) {
    const date = new Date();
    const payload = JSON.stringify(d.rows.map(({ s, st, sp }) => [s.id, st.done, st.quizBest, Object.keys(sp.tasks || {}).filter((k) => sp.tasks[k].done)]));
    const sum = checksum((d.pr.name || "") + "|" + (d.pr.group || "") + "|" + payload);
    const sections = d.rows.filter(({ st }) => st.done || st.quizBest != null).map(({ s, st, sp }) => `
      <h3>${code(s)}. ${esc(s.title)} — ${st.done}/${st.tasks}${st.quizBest != null ? `, тест ${Math.round(st.quizBest * 100)}%` : ""}</h3>
      ${s.tasks.map((t, i) => { const ts = sp.tasks[t.id] || {}; return `<details ${ts.done ? "" : "class='nd'"}><summary>${ts.done ? "✅" : "⬜"} ${i + 1}. ${esc(t.title)}${ts.sawSolution ? " <i>(решение открыто)</i>" : ""}${ts.attempts ? ` · попыток: ${ts.attempts}` : ""}</summary>${ts.code ? `<pre>${esc(ts.code)}</pre>` : "<p>—</p>"}</details>`; }).join("")}`).join("");
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Отчёт Big Data — ${esc(d.pr.name)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#1d2433;background:#fff}h1{font-size:22px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #d5dae3;padding:6px 8px;text-align:left}th{background:#f1f4f9}pre{background:#f6f8fb;border:1px solid #e1e6ee;padding:10px;overflow:auto;font-size:12.5px;white-space:pre-wrap}details{margin:4px 0}summary{cursor:pointer}.nd summary{color:#8a93a6}.meta{color:#5b6478;font-size:14px}.sum{font-family:monospace;background:#eef2f8;padding:2px 6px}</style></head><body>
<h1>Отчёт: Технологии больших данных (Big Data), 6 семестр</h1>
<p class="meta"><b>Студент:</b> ${esc(d.pr.name || "—")} &nbsp; <b>Группа:</b> ${esc(d.pr.group || "—")} &nbsp; <b>Дата:</b> ${date.toLocaleString("ru-RU")}<br><b>Выполнено:</b> ${d.doneItems} из ${d.totalItems} пунктов (${d.pct}%) &nbsp; <b>Контрольная сумма:</b> <span class="sum">${sum}</span></p>
<table><thead><tr><th>Занятие</th><th>Задания</th><th>Тест</th><th>Открыто решений</th></tr></thead><tbody>
${d.rows.map(({ s, st }) => `<tr><td>${code(s)}. ${esc(s.title)}</td><td>${st.done}/${st.tasks}</td><td>${st.quizBest != null ? Math.round(st.quizBest * 100) + "%" : "—"}</td><td>${st.peeked || ""}</td></tr>`).join("")}
</tbody></table>
<h2>Код выполненных заданий</h2>${sections || "<p>Пока нет выполненных заданий.</p>"}
<p class="meta">Сформировано тренажёром Big Data (${esc(location.href.split("#")[0])}).</p></body></html>`;
  }

  // ------------------------------------------------------------------ справка
  function viewAbout() {
    setNav("about");
    const gh = ghRepo();
    app.innerHTML = `<article class="prose about">
      <h1>Как работать с тренажёром</h1>
      <ol>
        <li>На <a href="#/">главной</a> укажите ФИО и группу: они попадут в отчёт.</li>
        <li>Откройте занятие и прочитайте вкладку <b>«Теория»</b>, затем выполняйте <b>«Задания»</b> по порядку.</li>
        <li>Пишите код в редакторе и нажимайте <b>«Запустить и проверить»</b> (<kbd>Ctrl+Enter</kbd>). Под выводом появятся автоматические проверки: ✓ выполнено, ✗ нужно исправить.</li>
        <li>Если не получается, откройте <b>«Подсказку»</b>. Эталонное решение тоже доступно, но факт его просмотра отмечается в отчёте.</li>
        <li>В конце занятия пройдите <b>тест</b> (зачёт от 70%).</li>
        <li>На странице <a href="#/report">«Отчёт»</a> скачайте HTML-отчёт и отправьте его преподавателю.</li>
      </ol>
      <h2>Среды выполнения</h2>
      <table><thead><tr><th>Среда</th><th>Как устроена</th><th>Что важно знать</th></tr></thead><tbody>
      <tr><td><b>Python</b></td><td>Настоящий CPython 3.13 в браузере (Pyodide): pandas, numpy, matplotlib, seaborn, wordcloud, requests, BeautifulSoup, sqlite3, scikit-learn</td><td>Первый запуск загружает ~30 МБ (10–30 с), затем всё работает быстро. Учебные файлы лежат в папке <code>data/</code>. <code>input()</code> не поддерживается.</td></tr>
      <tr><td><b>MongoDB</b></td><td>Учебный эмулятор оболочки <code>mongosh</code></td><td>Поддерживает CRUD, операторы запросов, агрегации, индексы, <code>mongoimport</code>. Данные хранятся в браузере.</td></tr>
      <tr><td><b>HDFS</b></td><td>Учебный эмулятор кластера Hadoop 3.3 (NameNode + 3 DataNode)</td><td>Команды <code>hdfs dfs</code>, <code>fsck</code>, <code>dfsadmin</code>; блоки 128 МБ и репликация 3 моделируются.</td></tr>
      <tr><td><b>Spark</b></td><td>Эмулятор API PySpark 3.5 поверх pandas</td><td>Код <code>from pyspark.sql import SparkSession</code> работает так же, как в Colab; вычисления идут в одном процессе.</td></tr>
      </tbody></table>
      <div class="callout callout-info"><div class="callout-title">Эмулятор ≠ настоящий кластер</div><p>Эмуляторы повторяют команды и формат вывода реальных систем, чтобы вы отработали навыки. На вкладке <b>«Реальная среда»</b> каждого занятия описано, как выполнить ту же работу в Anaconda, Docker или Google Colab.</p></div>
      <h2>Где хранится прогресс</h2>
      <p>В памяти браузера (localStorage) на этом компьютере. Не очищайте данные сайта. Чтобы продолжить на другом компьютере, используйте экспорт и импорт на странице «Отчёт».</p>
      <h2>Для преподавателя</h2>
      <ul>
        <li>Задания описаны в файлах <code>content/*.js</code> (формат описан в <code>content/README.md</code>). После правки запустите <a href="selftest.html">самопроверку заданий</a>: она выполнит все эталонные решения и проверки.</li>
        <li>Учебные данные создаются скриптом <code>tools/gen_data.py</code>; блокноты Colab собираются скриптом <code>tools/build_notebooks.js</code>.</li>
        <li>Отчёт студента — HTML-файл с кодом каждого задания и контрольной суммой.</li>
        ${gh ? `<li>Репозиторий: <a href="https://github.com/${gh.owner}/${gh.repo}" target="_blank" rel="noopener">github.com/${gh.owner}/${gh.repo}</a></li>` : ""}
      </ul>
      <h2>Сброс сред</h2>
      <div class="run-bar wrap"><button class="btn" id="rsPy">Перезапустить Python</button><button class="btn" id="rsMongo">Очистить MongoDB</button><button class="btn" id="rsHdfs">Сбросить HDFS</button></div>
      <p class="muted small">Учебная программа: «Технологии больших данных (Big Data)», УзГУМЯ, направление 60230400 «Компьютерная лингвистика», 6 семестр: 8 лабораторных работ и 15 практических занятий.</p>
    </article>`;
    $("#rsPy").addEventListener("click", () => { Py.restart(); toast("Python перезапущен"); });
    $("#rsMongo").addEventListener("click", () => { if (confirmBox("Удалить все базы эмулятора MongoDB?")) { Mongo.reset(); toast("MongoDB очищена"); } });
    $("#rsHdfs").addEventListener("click", async () => { if (confirmBox("Сбросить HDFS?")) { await Hdfs.reset(); toast("HDFS сброшен"); } });
  }

  // ------------------------------------------------------------------ маршрутизация
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean);
    window.scrollTo(0, 0);
    if (!parts.length) viewHome();
    else if (parts[0] === "s") viewSession(parts[1], parts[2], parts[3]);
    else if (parts[0] === "sandbox") viewSandbox(parts[1] || "python");
    else if (parts[0] === "report") viewReport();
    else if (parts[0] === "about") viewAbout();
    else viewHome();
    document.title = (parts[0] === "s" && BDT.get(parts[1]) ? `${code(BDT.get(parts[1]))}. ${BDT.get(parts[1]).title} — ` : "") + "Big Data тренажёр";
  }

  const th = Store.get("theme", null);
  if (th) document.documentElement.dataset.theme = th;
  header();
  window.addEventListener("hashchange", route);
  route();
  window.BDTApp = { route, stats, Store };
})();
