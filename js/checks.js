/* Общие функции проверок для заданий MongoDB и HDFS (используются тренажёром и самопроверкой). */
(function () {
  function runJsCheck(fn, apiExtra) {
    const checks = [];
    const t = Object.assign({ ok(cond, msg) { checks.push({ ok: !!cond, msg }); return !!cond; } }, apiExtra);
    try { fn(t); } catch (e) { checks.push({ ok: false, msg: "Проверка: " + (e.message || e) }); }
    return { checks, ok: checks.length > 0 && checks.every((c) => c.ok) };
  }

  /* API для проверки заданий MongoDB: t.db("university").count("students", {age: {$gt: 20}}) и т.п. */
  function mongoApi(res, codeText) {
    const sim = Mongo.sim;
    const textOut = (res.items || []).map((i) => i.data).join("\n");
    const results = res.results || [];
    return {
      db: (name) => ({
        count: (coll, filter) => sim.count(name, coll, filter || {}),
        docs: (coll) => sim.docs(name, coll),
        exists: (coll) => sim.exists(name, coll),
        indexes: (coll) => sim.indexes(name, coll),
        collections: () => Object.keys(sim.dbs[name] || {}),
      }),
      dbs: () => Object.keys(sim.dbs).filter((d) => Object.keys(sim.dbs[d]).length),
      current: sim.current,
      results,
      last: results[results.length - 1],
      output: textOut,
      code: codeText || "",
      error: res.error,
      uses: (...subs) => subs.every((s) => (codeText || "").includes(s)),
      match: (doc, filter) => Mongo.matchDoc(doc, filter),
    };
  }

  /* API для проверки заданий HDFS: t.hdfs.isDir("/user/student/x"), t.local.read(...), t.ran(/fsck/) */
  function hdfsApi(lastCmd, lastRes) {
    const a = Hdfs.api();
    return Object.assign(a, {
      last: { cmd: lastCmd || "", out: lastRes ? lastRes.out : "", code: lastRes ? lastRes.code : 0 },
      ran: (rx) => a.history().some((h) => (rx instanceof RegExp ? rx.test(h) : h.includes(rx))),
    });
  }

  window.Checks = { runJsCheck, mongoApi, hdfsApi };
})();
