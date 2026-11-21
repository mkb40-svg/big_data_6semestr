/* Самопроверка заданий: выполняет эталонные решения и проверки всех (или выбранных) занятий.
 * selftest.html?s=p02,l03 — только указанные занятия; &starter=0 — не проверять стартовый код. */
(async function () {
  const params = new URLSearchParams(location.search);
  const only = (params.get("s") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const checkStarter = params.get("starter") !== "0";
  const sessions = BDT.ordered().filter((s) => !only.length || only.includes(s.id));
  const tbody = document.querySelector("#res tbody");
  const summary = document.querySelector("#summary");
  const results = [];
  const BASE = new URL(".", location.href).href;
  const vars = { SITE: BASE + "data/site/", API: BASE + "data/api/v1/", BASE_URL: BASE };
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

  function add(s, t, kind, ok, detail) {
    results.push({ session: s.id, task: t ? t.id : "-", kind, ok, detail: detail || "" });
    const tr = document.createElement("tr");
    tr.className = ok ? "ok" : "bad";
    tr.innerHTML = `<td>${s.id}</td><td>${t ? esc(t.id + " " + t.title) : "—"}</td><td>${kind}</td><td>${ok ? "✓" : "✗"}</td><td><pre>${esc(detail)}</pre></td>`;
    tbody.appendChild(tr);
    summary.textContent = `Проверено: ${results.length}, ошибок: ${results.filter((r) => !r.ok).length}`;
  }
  const failedChecks = (checks) => (checks || []).filter((c) => !c.ok).map((c) => "✗ " + c.msg).join("\n");

  for (const s of sessions) {
    // структура занятия
    const probs = [];
    if (!s.title) probs.push("нет title");
    if (!s.theory) probs.push("нет theory");
    if (!s.tasks.length) probs.push("нет заданий");
    s.quiz.forEach((q, i) => {
      const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
      if (!q.options || ans.some((a) => !(a >= 0 && a < q.options.length))) probs.push(`тест: вопрос ${i + 1} — неверный answer`);
    });
    const ids = new Set();
    s.tasks.forEach((t) => { if (ids.has(t.id)) probs.push("повтор id задания " + t.id); ids.add(t.id); });
    add(s, null, "структура", !probs.length, probs.join("; ") || `${s.tasks.length} заданий, тест ${s.quiz.length} вопр.`);

    let mongoReset = false, hdfsReset = false;
    for (const t of s.tasks) {
      const env = t.env || (s.env || ["python"])[0];
      try {
        if (env === "python") {
          const miss = ["title", "text", "starter", "check", "solution"].filter((k) => !t[k]);
          if (miss.length) { add(s, t, "python", false, "нет полей: " + miss.join(", ")); continue; }
          const r = await Py.run({ setup: t.setup || "", code: t.solution, check: t.check, vars });
          const out = (r.items || []).filter((i) => i.type === "text" || i.type === "stderr").map((i) => i.data).join("").slice(0, 400);
          add(s, t, "решение", !!r.ok, r.ok ? "" : (r.error ? r.error.message + "\n" + (r.error.trace || "") : failedChecks(r.checks)) + "\n--- вывод ---\n" + out);
          if (checkStarter && !t.starterPasses) {
            const r2 = await Py.run({ setup: t.setup || "", code: t.starter, check: t.check, vars });
            add(s, t, "старт ≠ решено", !r2.ok, r2.ok ? "Стартовый код уже проходит проверку — усилите check" : "");
          }
        } else if (env === "mongo") {
          if (!mongoReset) { Mongo.reset(); mongoReset = true; }
          if (t.fixtures) await Mongo.ensureFixtures(t.fixtures);
          const res = await Mongo.run(t.solution || "");
          const chk = Checks.runJsCheck(t.check, Checks.mongoApi(res, t.solution));
          add(s, t, "mongo", chk.ok, chk.ok ? "" : (res.error || "") + "\n" + failedChecks(chk.checks) + "\n--- вывод ---\n" + (res.items || []).map((i) => i.data).join("\n").slice(0, 600));
        } else if (env === "hdfs") {
          if (!hdfsReset) { await Hdfs.reset(); hdfsReset = true; }
          let last = "", lastRes = null, log = "";
          for (const line of (t.solution || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
            last = line; lastRes = Hdfs.exec(line); log += "$ " + line + "\n" + lastRes.out;
          }
          const chk = Checks.runJsCheck(t.check, Checks.hdfsApi(last, lastRes));
          add(s, t, "hdfs", chk.ok, chk.ok ? "" : failedChecks(chk.checks) + "\n--- вывод ---\n" + log.slice(-800));
        } else if (env === "choice") {
          const ans = Array.isArray(t.answer) ? t.answer : [t.answer];
          add(s, t, "choice", t.options && ans.every((a) => a >= 0 && a < t.options.length), "");
        } else if (env === "answer") {
          add(s, t, "answer", Array.isArray(t.answers) && t.answers.length > 0, "");
        } else add(s, t, env, false, "неизвестная среда");
      } catch (e) {
        add(s, t, env, false, "Исключение: " + (e && e.stack || e));
      }
    }
  }
  window.__selftest = { done: true, total: results.length, failed: results.filter((r) => !r.ok), results };
  summary.textContent += " — готово";
  document.title = (window.__selftest.failed.length ? "✗ " : "✓ ") + document.title;
})();
