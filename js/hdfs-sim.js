/* Учебный эмулятор Hadoop HDFS + терминал Linux.
 * Кластер: NameNode + 3 DataNode, блок 128 МБ, репликация 3.
 * Команды: start-dfs.sh, jps, hdfs dfs -ls/-mkdir/-put/-get/-cat/-rm/-du/-setrep/..., hdfs fsck,
 * hdfs dfsadmin -report, а также базовые ls/cd/cat/echo/head/wc/grep с конвейерами | и > .
 * Состояние хранится в localStorage. */
(function () {
  "use strict";
  const LS_KEY = window.BDT_SELFTEST ? "bdt.selftest.hdfs" : "bdt.hdfs.v1";
  const BLOCK = 128 * 1024 * 1024;
  const USER = "student";
  const HOME_LOCAL = "/home/student";
  const HOME_HDFS = "/user/student";
  const DATANODES = [
    { name: "bigdata-dn1", ip: "192.168.10.11" },
    { name: "bigdata-dn2", ip: "192.168.10.12" },
    { name: "bigdata-dn3", ip: "192.168.10.13" },
  ];
  const enc = new TextEncoder();
  const bytes = (s) => enc.encode(s || "").length;
  const now = () => Date.now();

  function dirNode(owner = USER, group = "supergroup", perm = "rwxr-xr-x") {
    return { t: "d", c: {}, owner, group, perm, mtime: now() };
  }
  function fileNode(data, extra = {}) {
    return Object.assign({ t: "f", data: data || "", owner: USER, group: "supergroup", perm: "rw-r--r--", mtime: now() }, extra);
  }
  const nodeSize = (n) => (n.t === "f" ? (n.vsize != null ? n.vsize : bytes(n.data)) : 0);

  // ------------------------------------------------------------------ пути
  function norm(path, cwd) {
    if (!path) return cwd;
    const abs = path.startsWith("/") ? path : cwd.replace(/\/$/, "") + "/" + path;
    const out = [];
    for (const p of abs.split("/")) {
      if (!p || p === ".") continue;
      if (p === "..") out.pop(); else out.push(p);
    }
    return "/" + out.join("/");
  }
  const parent = (p) => (p === "/" ? "/" : p.slice(0, p.lastIndexOf("/")) || "/");
  const base = (p) => p.slice(p.lastIndexOf("/") + 1);

  class FS {
    constructor(root) { this.root = root; }
    get(p) {
      if (p === "/") return this.root;
      let cur = this.root;
      for (const part of p.split("/").filter(Boolean)) {
        if (!cur || cur.t !== "d") return null;
        cur = cur.c[part];
      }
      return cur || null;
    }
    mkdir(p, parents, mk) {
      const parts = p.split("/").filter(Boolean);
      let cur = this.root, path = "";
      for (let i = 0; i < parts.length; i++) {
        path += "/" + parts[i];
        let nxt = cur.c[parts[i]];
        if (!nxt) {
          if (!parents && i < parts.length - 1) return { err: "nodir", path };
          nxt = cur.c[parts[i]] = mk ? mk() : dirNode();
          cur.mtime = now();
        } else if (nxt.t !== "d") return { err: "notdir", path };
        else if (i === parts.length - 1 && !parents) return { err: "exists", path };
        cur = nxt;
      }
      return { ok: true };
    }
    put(p, node) {
      const d = this.get(parent(p));
      if (!d || d.t !== "d") return false;
      d.c[base(p)] = node; d.mtime = now();
      return true;
    }
    remove(p) {
      const d = this.get(parent(p));
      if (!d || !d.c[base(p)]) return false;
      delete d.c[base(p)]; d.mtime = now();
      return true;
    }
    walk(p, fn) {
      const n = this.get(p);
      if (!n) return;
      fn(p, n);
      if (n.t === "d") for (const k of Object.keys(n.c).sort()) this.walk((p === "/" ? "" : p) + "/" + k, fn);
    }
    totals(p) {
      let files = 0, dirs = 0, size = 0, raw = 0;
      this.walk(p, (_, n) => {
        if (n.t === "d") dirs++; else { files++; size += nodeSize(n); raw += nodeSize(n) * (n.rep || 1); }
      });
      return { files, dirs, size, raw };
    }
  }

  function human(n) {
    if (n < 1024) return String(n);
    const u = ["K", "M", "G", "T"];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ".0") + " " + u[i];
  }
  function fmtDate(ms) {
    const d = new Date(ms); const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function permStr(n) { return (n.t === "d" ? "d" : "-") + n.perm; }
  function modeToPerm(mode, old) {
    if (/^[0-7]{3,4}$/.test(mode)) {
      const m = mode.slice(-3);
      return [...m].map((d) => { d = +d; return (d & 4 ? "r" : "-") + (d & 2 ? "w" : "-") + (d & 1 ? "x" : "-"); }).join("");
    }
    // символьный режим u+x, go-w, a+r
    let p = old.split("");
    for (const part of mode.split(",")) {
      const m = part.match(/^([ugoa]*)([+\-=])([rwx]*)$/);
      if (!m) return null;
      const who = (m[1] || "a").replace("a", "ugo");
      for (const w of who) {
        const off = { u: 0, g: 3, o: 6 }[w];
        "rwx".split("").forEach((bit, i) => {
          if (m[2] === "=") p[off + i] = m[3].includes(bit) ? bit : "-";
          else if (m[3].includes(bit)) p[off + i] = m[2] === "+" ? bit : "-";
        });
      }
    }
    return p.join("");
  }

  // ------------------------------------------------------------------ состояние
  function freshState() {
    const local = dirNode(USER, USER);
    const fs = new FS(local);
    fs.mkdir(HOME_LOCAL, true, () => dirNode(USER, USER));
    return {
      local, hdfs: null, cwd: HOME_LOCAL, running: false, yarn: false, formatted: true, safemode: false,
      history: [], blockSeq: 1073741825, genStamp: 1001, seeded: false,
    };
  }
  function freshHdfs(st) {
    const root = dirNode("hdfs", "supergroup");
    const fs = new FS(root);
    fs.mkdir("/tmp", true, () => dirNode("hdfs", "supergroup", "rwxrwxrwt"));
    fs.mkdir("/user", true, () => dirNode("hdfs", "supergroup"));
    fs.mkdir(HOME_HDFS, true, () => dirNode(USER, "supergroup"));
    return root;
  }

  class HdfsSim {
    constructor() {
      this.load();
    }
    load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        this.st = raw ? JSON.parse(raw) : null;
      } catch (e) { this.st = null; }
      if (!this.st) { this.st = freshState(); this.st.hdfs = freshHdfs(this.st); }
      this.L = new FS(this.st.local);
      this.H = new FS(this.st.hdfs);
    }
    save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.st)); } catch (e) { /* quota */ } }
    reset() { localStorage.removeItem(LS_KEY); this.load(); this.st.seeded = false; return this.seed(); }

    async seed() {
      if (this.st.seeded) return;
      const root = new URL(".", location.href).href;
      const get = async (p) => { try { const r = await fetch(root + p); return r.ok ? await r.text() : ""; } catch (e) { return ""; } };
      const L = this.L;
      L.mkdir(HOME_LOCAL + "/corpus", true, () => dirNode(USER, USER));
      L.mkdir(HOME_LOCAL + "/data", true, () => dirNode(USER, USER));
      L.mkdir(HOME_LOCAL + "/logs", true, () => dirNode(USER, USER));
      const texts = await Promise.all(Array.from({ length: 16 }, (_, i) => get(`data/corpus_uz/uz_${String(i + 1).padStart(2, "0")}.txt`)));
      texts.forEach((t, i) => L.put(`${HOME_LOCAL}/corpus/uz_${String(i + 1).padStart(2, "0")}.txt`, fileNode(t, { owner: USER, group: USER })));
      L.put(`${HOME_LOCAL}/data/students.csv`, fileNode(await get("data/students.csv"), { owner: USER, group: USER }));
      L.put(`${HOME_LOCAL}/data/reviews_uz.csv`, fileNode(await get("data/reviews_uz.csv"), { owner: USER, group: USER }));
      const logLines = [];
      const pages = ["/", "/news", "/article/navroz-bayrami.html", "/article/toshkent-metrosi.html", "/login", "/search?q=metro"];
      for (let i = 0; i < 40; i++) {
        const ip = `10.0.${(i * 7) % 255}.${(i * 13) % 255}`;
        logLines.push(`${ip} - - [01/Nov/2026:10:${String(i % 60).padStart(2, "0")}:0${i % 10} +0500] "GET ${pages[i % pages.length]} HTTP/1.1" ${i % 17 === 0 ? 404 : 200} ${1000 + i * 37}`);
      }
      L.put(`${HOME_LOCAL}/logs/access_2026-11.log`, fileNode(logLines.join("\n") + "\n", { owner: USER, group: USER, vsize: 300 * 1024 * 1024 + 4567 }));
      L.put(`${HOME_LOCAL}/notes.txt`, fileNode("Salom, HDFS!\nBu fayl lokal diskda joylashgan.\n", { owner: USER, group: USER }));
      this.st.seeded = true;
      this.save();
    }

    // ---------- для проверок
    api() {
      const H = this.H, L = this.L;
      const wrap = (fs) => ({
        exists: (p) => !!fs.get(p),
        isDir: (p) => { const n = fs.get(p); return !!n && n.t === "d"; },
        isFile: (p) => { const n = fs.get(p); return !!n && n.t === "f"; },
        read: (p) => { const n = fs.get(p); return n && n.t === "f" ? n.data : null; },
        size: (p) => { const n = fs.get(p); return n ? nodeSize(n) : -1; },
        list: (p) => { const n = fs.get(p); return n && n.t === "d" ? Object.keys(n.c).sort() : []; },
        stat: (p) => { const n = fs.get(p); return n ? { type: n.t === "d" ? "dir" : "file", size: nodeSize(n), rep: n.rep || 0, perm: permStr(n), owner: n.owner, group: n.group } : null; },
        count: (p) => fs.totals(p),
      });
      return { hdfs: wrap(H), local: wrap(L), running: () => this.st.running, yarn: () => this.st.yarn, safemode: () => this.st.safemode, history: () => this.st.history.slice() };
    }

    // ------------------------------------------------------------------ выполнение строки
    exec(line) {
      line = line.trim();
      if (!line) return { out: "", code: 0 };
      this.st.history.push(line);
      if (this.st.history.length > 500) this.st.history.shift();
      let out = "", code = 0;
      for (const part of splitAnd(line)) {
        const r = this.execPipeline(part);
        out += r.out;
        code = r.code;
        if (r.clear) { out = ""; this.save(); return { out: "", code, clear: true }; }
        if (code !== 0) break;
      }
      this.lastCode = code;
      this.save();
      return { out, code };
    }

    execPipeline(line) {
      let redirect = null;
      const rm = line.match(/^(.*?)\s(>>?)\s*(\S+)\s*$/);
      if (rm && !/^echo\s+["'][^"']*$/.test(rm[1])) { line = rm[1]; redirect = { append: rm[2] === ">>", path: rm[3] }; }
      const stages = splitPipe(line);
      let input = null, res = { out: "", code: 0 };
      for (const st of stages) {
        res = this.run(tokenize(st), input);
        if (res.clear) return res;
        input = res.out;
      }
      if (redirect) {
        const p = norm(redirect.path, this.st.cwd);
        const ex = this.L.get(p);
        if (ex && ex.t === "d") return { out: `bash: ${redirect.path}: Is a directory\n`, code: 1 };
        const data = (redirect.append && ex ? ex.data : "") + res.out;
        if (!this.L.put(p, fileNode(data, { owner: USER, group: USER }))) return { out: `bash: ${redirect.path}: No such file or directory\n`, code: 1 };
        return { out: res.err || "", code: res.code };
      }
      return { out: res.out + (res.err || ""), code: res.code };
    }

    run(args, input) {
      if (!args.length) return { out: "", code: 0 };
      // как в bash: ~ → домашний каталог; шаблоны * и ? раскрываются по локальной файловой системе
      // (шаблоны в кавычках не раскрываются: hdfs dfs -find corpus -name "*.txt")
      const quoted = args.quoted || new Set();
      args = args.flatMap((a, i) => {
        if (quoted.has(i)) return [a];
        if (/^~(\/|$)/.test(a)) a = HOME_LOCAL + a.slice(1);
        if (!/[*?]/.test(a) || a.startsWith("-")) return [a];
        const abs = norm(a, this.st.cwd);
        const matches = this.expand(this.L, abs);
        if (matches.length === 1 && matches[0] === abs) return [a];
        const dirPart = a.includes("/") ? a.slice(0, a.lastIndexOf("/") + 1) : "";
        return matches.map((m) => dirPart + base(m));
      });
      let [cmd, ...rest] = args;
      if (cmd === "sudo") {
        if (rest[0] === "-u") rest = rest.slice(2);
        [cmd, ...rest] = rest;
      }
      if (cmd === "hadoop" && rest[0] === "fs") return this.dfs(rest.slice(1));
      if (cmd === "hdfs") {
        const sub = rest[0];
        if (sub === "dfs") return this.dfs(rest.slice(1));
        if (sub === "dfsadmin") return this.dfsadmin(rest.slice(1));
        if (sub === "fsck") return this.fsck(rest.slice(1));
        if (sub === "version") return ok(VERSION);
        if (sub === "getconf") return this.getconf(rest.slice(1));
        if (sub === "namenode" && rest[1] === "-format") return this.format(rest.slice(2));
        if (!sub) return ok(HDFS_USAGE);
        return fail(`Error: Could not find or load main class ${sub}\n`);
      }
      if (cmd === "hadoop") {
        if (rest[0] === "version") return ok(VERSION);
        if (rest[0] === "jar") return fail("hadoop jar: запуск MapReduce-задач в эмуляторе не поддерживается (используйте Spark в П10/Л4).\n");
        return ok("Usage: hadoop [--config confdir] COMMAND\n  fs      run a generic filesystem user client\n  version print the version\n");
      }
      const local = LOCAL_CMDS[cmd];
      if (local) return local.call(this, rest, input);
      if (["start-dfs.sh", "stop-dfs.sh", "start-yarn.sh", "stop-yarn.sh", "start-all.sh", "stop-all.sh"].includes(cmd)) return this.service(cmd);
      return fail(`${cmd}: command not found\n`);
    }

    service(cmd) {
      const st = this.st;
      let out = "";
      if (cmd === "start-dfs.sh" || cmd === "start-all.sh") {
        if (st.running) out += "namenode is running as process 2481.  Stop it first and ensure /tmp/hadoop-student-namenode.pid file is empty before retry.\n";
        else {
          out += "Starting namenodes on [bigdata-master]\nStarting datanodes\n" + DATANODES.map((d) => `${d.name}: starting datanode\n`).join("") + "Starting secondary namenodes [bigdata-master]\n";
          st.running = true;
          st.safemode = false;   // ручной safe mode не сохраняется после перезапуска NameNode
        }
      }
      if (cmd === "start-yarn.sh" || cmd === "start-all.sh") {
        out += st.yarn ? "resourcemanager is running as process 3120.\n" : "Starting resourcemanager\nStarting nodemanagers\n";
        st.yarn = true;
      }
      if (cmd === "stop-dfs.sh" || cmd === "stop-all.sh") {
        out += st.running ? "Stopping namenodes on [bigdata-master]\nStopping datanodes\nStopping secondary namenodes [bigdata-master]\n" : "no namenode to stop\n";
        st.running = false;
      }
      if (cmd === "stop-yarn.sh" || cmd === "stop-all.sh") {
        out += st.yarn ? "Stopping nodemanagers\nStopping resourcemanager\n" : "no resourcemanager to stop\n";
        st.yarn = false;
      }
      return ok(out);
    }

    format(args) {
      if (this.st.running) return fail("namenode -format: остановите HDFS перед форматированием (stop-dfs.sh).\n" +
        "java.io.IOException: Cannot remove current directory: /home/student/hadoop/dfs/name/current (NameNode is running)\n");
      this.st.hdfs = dirNode(USER, "supergroup");
      this.H = new FS(this.st.hdfs);
      this.H.mkdir("/tmp", true, () => dirNode(USER, "supergroup", "rwxrwxrwt"));
      return ok("2026-11-21 10:00:00,001 INFO namenode.NameNode: STARTUP_MSG:\n/************************************************************\nSTARTUP_MSG: Starting NameNode\nSTARTUP_MSG:   host = bigdata-master/127.0.1.1\nSTARTUP_MSG:   version = 3.3.6\n************************************************************/\n" +
        "2026-11-21 10:00:02,412 INFO common.Storage: Storage directory /home/student/hadoop/dfs/name has been successfully formatted.\n" +
        "2026-11-21 10:00:02,530 INFO namenode.NameNode: SHUTDOWN_MSG:\n/************************************************************\nSHUTDOWN_MSG: Shutting down NameNode at bigdata-master/127.0.1.1\n************************************************************/\n");
    }

    getconf(args) {
      const key = args[0] === "-confKey" ? args[1] : null;
      const conf = { "dfs.blocksize": "134217728", "dfs.replication": "3", "fs.defaultFS": "hdfs://bigdata-master:9000", "dfs.namenode.http-address": "bigdata-master:9870" };
      if (args[0] === "-namenodes") return ok("bigdata-master\n");
      if (key && conf[key]) return ok(conf[key] + "\n");
      return fail(`Configuration ${key} is missing.\n`);
    }

    connRefused(cmd) {
      return fail(`${cmd}: Call From bigdata-master/127.0.1.1 to bigdata-master:9000 failed on connection exception: java.net.ConnectException: Connection refused; For more details see:  http://wiki.apache.org/hadoop/ConnectionRefused\n` +
        `Подсказка: HDFS не запущен. Выполните start-dfs.sh и проверьте процессы командой jps.\n`);
    }

    hpath(p) {
      if (!p) return HOME_HDFS;
      p = p.replace(/^hdfs:\/\/[^/]+/, "");
      return norm(p, HOME_HDFS);
    }

    // ------------------------------------------------------------------ hdfs dfs
    dfs(args) {
      const op = args[0];
      if (!op || op === "-help" || op === "-usage") return ok(DFS_USAGE);
      if (!op.startsWith("-")) return fail(`${op}: Unknown command\nUsage: hadoop fs [generic options]\n`);
      const name = op.slice(1);
      if (!this.st.running) return this.connRefused(name);
      const { flags, params } = parseFlags(args.slice(1));
      const H = this.H, L = this.L;
      const st = this.st;
      const noSuch = (p) => `${name}: \`${p}': No such file or directory\n`;
      // безопасный режим: NameNode принимает только чтение
      if (st.safemode && SAFEMODE_WRITES[name]) {
        const target = this.hpath(params[params.length - 1] || "");
        return fail(`${name}: Cannot ${SAFEMODE_WRITES[name]} ${target}. Name node is in safe mode.\n` +
          `It was turned on manually. Use "hdfs dfsadmin -safemode leave" to turn safe mode off.\n`);
      }
      switch (name) {
        case "ls": case "lsr": {
          const targets = (params.length ? params : [""]).flatMap((t) => (/[*?]/.test(t) ? this.expand(H, this.hpath(t)) : [t]));
          let out = "", code = 0;
          for (const t of targets) {
            const p = this.hpath(t);
            const n = H.get(p);
            if (!n) { out += noSuch(t || "."); code = 1; continue; }
            const rows = [];
            const row = (path, node) => {
              const size = nodeSize(node);
              rows.push([permStr(node), node.t === "d" ? "-" : String(node.rep || 3), node.owner, node.group,
                flags.h ? human(size) : String(size), fmtDate(node.mtime), path]);
            };
            if (n.t === "f" || flags.d) row(p, n);
            else if (flags.R || name === "lsr") H.walk(p, (pp, nn) => { if (pp !== p) row(pp, nn); });
            else for (const k of Object.keys(n.c).sort()) row((p === "/" ? "" : p) + "/" + k, n.c[k]);
            if (n.t === "d" && !flags.d && !(flags.R || name === "lsr")) out += `Found ${rows.length} items\n`;
            const w = [10, 3, 8, 10, 10, 16];
            for (const r of rows) out += `${r[0]}   ${r[1].padStart(1)} ${r[2].padEnd(7)} ${r[3].padEnd(10)} ${r[4].padStart(10)} ${r[5]} ${r[6]}\n`;
          }
          return { out, code };
        }
        case "mkdir": {
          if (!params.length) return fail("-mkdir: Not enough arguments: expected 1 but got 0\nUsage: hadoop fs [generic options] -mkdir [-p] <path> ...\n");
          let out = "", code = 0;
          for (const t of params) {
            const p = this.hpath(t);
            if (H.get(p)) { if (!flags.p) { out += `mkdir: \`${t}': File exists\n`; code = 1; } continue; }
            const r = H.mkdir(p, !!flags.p, () => dirNode(USER, "supergroup"));
            if (r.err === "nodir") { out += `mkdir: \`${t}': No such file or directory\nПодсказка: чтобы создать вложенные каталоги, используйте флаг -p\n`; code = 1; }
            else if (r.err === "notdir") { out += `mkdir: \`${r.path}': Is not a directory\n`; code = 1; }
          }
          return { out, code };
        }
        case "put": case "copyFromLocal": case "moveFromLocal": {
          if (params.length < 2) return fail(`-${name}: Not enough arguments: expected 2 but got ${params.length}\nUsage: hadoop fs [generic options] -${name} [-f] <localsrc> ... <dst>\n`);
          const dst = this.hpath(params[params.length - 1]);
          const srcs = params.slice(0, -1);
          const dnode = H.get(dst);
          const rawDst = params[params.length - 1];
          if ((srcs.length > 1 || rawDst.endsWith("/")) && (!dnode || dnode.t !== "d")) return fail(`${name}: \`${rawDst}': No such file or directory\nПодсказка: сначала создайте каталог: hdfs dfs -mkdir -p ${rawDst}\n`);
          let out = "", code = 0;
          for (const s of srcs) {
            const lp = norm(s, st.cwd);
            const ln = L.get(lp);
            if (!ln) { out += `${name}: \`${s}': No such file or directory\n`; code = 1; continue; }
            const target = dnode && dnode.t === "d" ? (dst === "/" ? "" : dst) + "/" + base(lp) : dst;
            if (!H.get(parent(target))) { out += `${name}: \`${params[params.length - 1]}': No such file or directory\n`; code = 1; continue; }
            if (H.get(target) && !flags.f) { out += `${name}: \`${target.replace(HOME_HDFS + "/", "")}': File exists\n`; code = 1; continue; }
            this.copyIn(ln, target);
            if (name === "moveFromLocal") L.remove(lp);
          }
          return { out, code };
        }
        case "get": case "copyToLocal": {
          if (params.length < 1) return fail(`-${name}: Not enough arguments\n`);
          const src = this.hpath(params[0]);
          const n = H.get(src);
          if (!n) return fail(noSuch(params[0]));
          let dst = norm(params[1] || ".", st.cwd);
          const dn = L.get(dst);
          if (dn && dn.t === "d") dst = (dst === "/" ? "" : dst) + "/" + base(src);
          if (L.get(dst) && !flags.f) return fail(`${name}: \`${dst}': File exists\n`);
          if (!L.get(parent(dst))) return fail(`${name}: \`${params[1]}': No such file or directory\n`);
          L.put(dst, JSON.parse(JSON.stringify(n)));
          const c = L.get(dst); c.owner = USER; c.group = USER; delete c.rep; delete c.blocks;
          return ok("");
        }
        case "cat": case "text": {
          if (!params.length) return fail("-cat: Not enough arguments: expected 1 but got 0\n");
          let out = "", code = 0;
          for (const t of params) {
            for (const p of this.expand(H, this.hpath(t))) {
              const n = H.get(p);
              if (!n) { out += noSuch(t); code = 1; continue; }
              if (n.t === "d") { out += `cat: \`${t}': Is a directory\n`; code = 1; continue; }
              out += n.data + (n.vsize ? `… (показано начало файла; полный размер ${human(nodeSize(n))}B)\n` : "");
            }
          }
          return { out, code };
        }
        case "head": case "tail": {
          const n = H.get(this.hpath(params[0]));
          if (!n) return fail(noSuch(params[0]));
          if (n.t === "d") return fail(`${name}: \`${params[0]}': Is a directory\n`);
          const b = enc.encode(n.data);
          const sl = name === "head" ? b.slice(0, 1024) : b.slice(Math.max(0, b.length - 1024));
          return ok(new TextDecoder().decode(sl));
        }
        case "rm": case "rmr": case "delete": {
          let out = "", code = 0;
          if (!params.length) return fail("-rm: Not enough arguments: expected 1 but got 0\n");
          for (const t of params) {
            const paths = this.expand(H, this.hpath(t));
            for (const p of paths) {
              const n = H.get(p);
              if (!n) { if (!flags.f) { out += `rm: \`${t}': No such file or directory\n`; code = 1; } continue; }
              if (n.t === "d" && !(flags.r || flags.R || name === "rmr")) { out += `rm: \`${t}': Is a directory\nПодсказка: для удаления каталога используйте -rm -r\n`; code = 1; continue; }
              if (p === "/") { out += "rm: Cannot delete root directory\n"; code = 1; continue; }
              H.remove(p);
              out += `Deleted ${p.replace(HOME_HDFS + "/", "")}\n`;
            }
          }
          return { out, code };
        }
        case "rmdir": {
          let out = "", code = 0;
          for (const t of params) {
            const p = this.hpath(t); const n = H.get(p);
            if (!n) { out += `rmdir: \`${t}': No such file or directory\n`; code = 1; continue; }
            if (n.t !== "d") { out += `rmdir: \`${t}': Is not a directory\n`; code = 1; continue; }
            if (Object.keys(n.c).length && !flags["ignore-fail-on-non-empty"]) { out += `rmdir: \`${t}': Directory is not empty\n`; code = 1; continue; }
            if (!Object.keys(n.c).length) H.remove(p);
          }
          return { out, code };
        }
        case "cp": case "mv": {
          if (params.length < 2) return fail(`-${name}: Not enough arguments\n`);
          const dst = this.hpath(params[params.length - 1]);
          const dnode = H.get(dst);
          let out = "", code = 0;
          for (const t of params.slice(0, -1)) {
            const sp = this.hpath(t); const sn = H.get(sp);
            if (!sn) { out += `${name}: \`${t}': No such file or directory\n`; code = 1; continue; }
            const target = dnode && dnode.t === "d" ? (dst === "/" ? "" : dst) + "/" + base(sp) : dst;
            if (!H.get(parent(target))) { out += `${name}: \`${params[params.length - 1]}': No such file or directory\n`; code = 1; continue; }
            if (H.get(target) && !flags.f) { out += `${name}: \`${params[params.length - 1]}': File exists\n`; code = 1; continue; }
            const copy = JSON.parse(JSON.stringify(sn));
            copy.mtime = now();
            if (name === "cp") this.reblock(copy);
            H.put(target, copy);
            if (name === "mv") H.remove(sp);
          }
          return { out, code };
        }
        case "du": {
          let out = "";
          const targets = params.length ? params : [""];
          if (flags.v) out += "SIZE".padEnd(12) + "DISK_SPACE_CONSUMED_WITH_ALL_REPLICAS".padEnd(40) + "FULL_PATH_NAME\n";
          const f = (x) => (flags.h ? human(x) : String(x));
          for (const t of targets) {
            const p = this.hpath(t); const n = H.get(p);
            if (!n) return fail(`du: \`${t || "."}': No such file or directory\n`);
            const items = flags.s || n.t === "f" ? [[p, n]] : Object.keys(n.c).sort().map((k) => [(p === "/" ? "" : p) + "/" + k, n.c[k]]);
            for (const [pp] of items) { const tt = H.totals(pp); out += `${f(tt.size).padEnd(10)}  ${f(tt.raw).padEnd(10)}  ${pp}\n`; }
          }
          return ok(out);
        }
        case "df": {
          const used = H.totals("/").raw;
          const cap = 3 * 50 * 1024 ** 3;
          const f = (x) => (flags.h ? human(x) : String(x));
          return ok(`Filesystem${" ".repeat(24)}Size     Used  Available  Use%\nhdfs://bigdata-master:9000  ${f(cap).padStart(8)} ${f(used).padStart(8)} ${f(cap - used).padStart(10)}    ${Math.round((used / cap) * 100)}%\n`);
        }
        case "count": {
          let out = flags.v ? "   DIR_COUNT   FILE_COUNT       CONTENT_SIZE PATHNAME\n" : "";
          for (const t of params.length ? params : [""]) {
            const p = this.hpath(t);
            if (!H.get(p)) return fail(`count: \`${t}': No such file or directory\n`);
            const tt = H.totals(p);
            out += `${String(tt.dirs).padStart(12)} ${String(tt.files).padStart(12)} ${(flags.h ? human(tt.size) : String(tt.size)).padStart(18)} ${p}\n`;
          }
          return ok(out);
        }
        case "stat": {
          let fmt = "%y", target = params[0];
          if (params.length > 1) { fmt = params[0]; target = params[1]; }
          const p = this.hpath(target); const n = H.get(p);
          if (!n) return fail(`stat: \`${target}': No such file or directory\n`);
          const d = new Date(n.mtime); const pd = (x) => String(x).padStart(2, "0");
          const ymd = `${d.getFullYear()}-${pd(d.getMonth() + 1)}-${pd(d.getDate())} ${pd(d.getHours())}:${pd(d.getMinutes())}:${pd(d.getSeconds())}`;
          const s = fmt.replace(/%n/g, base(p) || "/").replace(/%b/g, nodeSize(n)).replace(/%r/g, n.rep || 0).replace(/%o/g, n.t === "f" ? BLOCK : 0)
            .replace(/%F/g, n.t === "d" ? "directory" : "regular file").replace(/%u/g, n.owner).replace(/%g/g, n.group).replace(/%y/g, ymd).replace(/%A/g, permStr(n)).replace(/%a/g, permToOct(n.perm));
          return ok(s + "\n");
        }
        case "touchz": case "touch": {
          for (const t of params) {
            const p = this.hpath(t); const n = H.get(p);
            if (n && n.t === "f" && nodeSize(n) > 0 && name === "touchz") return fail(`touchz: \`${t}': Not a zero-length file\n`);
            if (!H.get(parent(p))) return fail(`${name}: \`${t}': No such file or directory\n`);
            if (n) n.mtime = now(); else H.put(p, this.mkHdfsFile(""));
          }
          return ok("");
        }
        case "appendToFile": {
          if (params.length < 2) return fail("-appendToFile: Not enough arguments\n");
          const dst = this.hpath(params[params.length - 1]);
          if (!H.get(parent(dst))) return fail(`appendToFile: \`${params[params.length - 1]}': No such file or directory\n`);
          let n = H.get(dst);
          if (!n) { n = this.mkHdfsFile(""); H.put(dst, n); }
          for (const s of params.slice(0, -1)) {
            const ln = L.get(norm(s, st.cwd));
            if (!ln) return fail(`appendToFile: \`${s}': No such file or directory\n`);
            n.data += ln.data;
          }
          n.mtime = now(); this.reblock(n);
          return ok("");
        }
        case "getmerge": {
          const src = this.hpath(params[0]); const sn = H.get(src);
          if (!sn) return fail(noSuch(params[0]));
          if (!params[1]) return fail("-getmerge: Not enough arguments\n");
          const parts = sn.t === "d" ? Object.keys(sn.c).sort().map((k) => sn.c[k]).filter((x) => x.t === "f") : [sn];
          const data = parts.map((x) => x.data + (flags.nl && !x.data.endsWith("\n") ? "\n" : "")).join("");
          const dst = norm(params[1], st.cwd);
          if (!L.put(dst, fileNode(data, { owner: USER, group: USER }))) return fail(`getmerge: \`${params[1]}': No such file or directory\n`);
          return ok("");
        }
        case "setrep": {
          const rep = parseInt(params[0], 10);
          if (!(rep >= 1)) return fail("-setrep: replication must be >= 1\n");
          let out = "";
          for (const t of params.slice(1)) {
            const p = this.hpath(t); const n = H.get(p);
            if (!n) return fail(`setrep: \`${t}': No such file or directory\n`);
            H.walk(p, (pp, nn) => { if (nn.t === "f") { nn.rep = rep; out += `Replication ${rep} set: ${pp}\n`; } });
            if (rep > DATANODES.length) out += `WARNING: the replication factor ${rep} is larger than the number of datanodes (${DATANODES.length}); блоки будут недореплицированы.\n`;
          }
          if (flags.w) out += "Waiting for " + params.slice(1).join(", ") + " ... done\n";
          return ok(out);
        }
        case "chmod": {
          const mode = params[0];
          for (const t of params.slice(1)) {
            const p = this.hpath(t); const n = H.get(p);
            if (!n) return fail(`chmod: \`${t}': No such file or directory\n`);
            const apply = (nn) => { const np = modeToPerm(mode, nn.perm); if (np) nn.perm = np; };
            if (flags.R) H.walk(p, (_, nn) => apply(nn)); else apply(n);
            if (!modeToPerm(mode, n.perm)) return fail(`chmod: chmod : mode '${mode}' does not match the expected pattern.\n`);
          }
          return ok("");
        }
        case "chown": case "chgrp": {
          const spec = params[0];
          for (const t of params.slice(1)) {
            const p = this.hpath(t); const n = H.get(p);
            if (!n) return fail(`${name}: \`${t}': No such file or directory\n`);
            const apply = (nn) => {
              if (name === "chgrp") nn.group = spec;
              else { const [u, g] = spec.split(":"); if (u) nn.owner = u; if (g) nn.group = g; }
            };
            if (flags.R) H.walk(p, (_, nn) => apply(nn)); else apply(n);
          }
          return ok("");
        }
        case "test": {
          const p = this.hpath(params[0]); const n = H.get(p);
          let r = false;
          if (flags.e) r = !!n;
          else if (flags.d) r = !!n && n.t === "d";
          else if (flags.f) r = !!n && n.t === "f";
          else if (flags.z) r = !!n && nodeSize(n) === 0;
          else if (flags.s) r = !!n && nodeSize(n) > 0;
          return { out: "", code: r ? 0 : 1 };
        }
        case "find": {
          const raw = args.slice(1);
          const p = this.hpath(raw[0] && !raw[0].startsWith("-") ? raw[0] : "/");
          const ni = raw.indexOf("-name"), ini = raw.indexOf("-iname");
          const pat = ni >= 0 ? raw[ni + 1] : ini >= 0 ? raw[ini + 1] : "*";
          const rx = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", ini >= 0 ? "i" : "");
          let out = "";
          H.walk(p, (pp) => { if (rx.test(base(pp))) out += pp + "\n"; });
          return ok(out);
        }
        case "checksum": {
          const p = this.hpath(params[0]); const n = H.get(p);
          if (!n || n.t !== "f") return fail(noSuch(params[0]));
          let h = 0; for (const ch of n.data) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
          return ok(`${p}\tMD5-of-0MD5-of-512CRC32C\t000002000000000000000000${h.toString(16).padStart(8, "0")}${"0".repeat(32)}\n`);
        }
        case "expunge": return ok("");
        default:
          return fail(`-${name}: Unknown command\nВведите hdfs dfs -help для списка команд.\n`);
      }
    }

    expand(fs, p) {
      if (!/[*?]/.test(p)) return [p];
      const dir = parent(p), pat = base(p);
      const rx = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      const d = fs.get(dir);
      if (!d || d.t !== "d") return [p];
      const m = Object.keys(d.c).sort().filter((k) => rx.test(k)).map((k) => (dir === "/" ? "" : dir) + "/" + k);
      return m.length ? m : [p];
    }

    mkHdfsFile(data, vsize) {
      const n = fileNode(data, { owner: USER, group: "supergroup", rep: 3 });
      if (vsize != null) n.vsize = vsize;
      this.reblock(n);
      return n;
    }
    reblock(n) {
      const size = nodeSize(n);
      const cnt = size ? Math.ceil(size / BLOCK) : 0;
      n.blocks = [];
      for (let i = 0; i < cnt; i++) {
        const start = (this.st.blockSeq - 1073741825 + i) % 3;
        n.blocks.push({ id: this.st.blockSeq++, gen: this.st.genStamp++, len: Math.min(BLOCK, size - i * BLOCK), nodes: [0, 1, 2].map((k) => (start + k) % 3) });
      }
    }
    copyIn(localNode, target) {
      if (localNode.t === "d") {
        this.H.mkdir(target, true, () => dirNode(USER, "supergroup"));
        for (const k of Object.keys(localNode.c)) this.copyIn(localNode.c[k], target + "/" + k);
      } else {
        this.H.put(target, this.mkHdfsFile(localNode.data, localNode.vsize));
      }
    }

    // ------------------------------------------------------------------ fsck / dfsadmin
    fsck(args) {
      if (!this.st.running) return this.connRefused("fsck");
      const path = this.hpath(args.find((a) => !a.startsWith("-")) || "/");
      const n = this.H.get(path);
      const showFiles = args.includes("-files"), showBlocks = args.includes("-blocks"), showLoc = args.includes("-locations");
      let out = `Connecting to namenode via http://bigdata-master:9870/fsck?ugi=student${showFiles ? "&files=1" : ""}${showBlocks ? "&blocks=1" : ""}${showLoc ? "&locations=1" : ""}&path=${encodeURIComponent(path)}\n`;
      out += `FSCK started by student (auth:SIMPLE) from /192.168.10.10 for path ${path} at ${new Date().toString().replace(/ GMT.*$/, "")} UZT ${new Date().getFullYear()}\n\n`;
      if (!n) return fail(out + `FSCK ended at ${new Date().toString()}\nPath '${path}' does not exist\n\nFsck on path '${path}' FAILED\n`);
      let files = 0, dirs = 0, totalSize = 0, blocks = 0, under = 0, totalRep = 0, minRepOk = 0;
      this.H.walk(path, (pp, nn) => {
        if (nn.t === "d") { dirs++; if (showFiles) out += `${pp} <dir>\n`; return; }
        files++;
        const size = nodeSize(nn); totalSize += size;
        if (!nn.blocks || (size && !nn.blocks.length)) this.reblock(nn);
        const rep = nn.rep || 3;
        const live = Math.min(rep, DATANODES.length);
        if (rep > live) under += nn.blocks.length;
        blocks += nn.blocks.length; totalRep += nn.blocks.length * live;
        if (showFiles) out += `${pp} ${size} bytes, replicated: replication=${rep}, ${nn.blocks.length} block(s):  ${rep > live ? "Under replicated" : "OK"}\n`;
        if (showBlocks) nn.blocks.forEach((b, i) => {
          out += `${i}. BP-1462871350-192.168.10.10-1763700000000:blk_${b.id}_${b.gen} len=${b.len} Live_repl=${live}`;
          if (showLoc) out += "  [" + b.nodes.slice(0, live).map((k) => `DatanodeInfoWithStorage[${DATANODES[k].ip}:9866,DS-${(b.id + k).toString(16)},DISK]`).join(", ") + "]";
          out += "\n";
        });
        if (showFiles && nn.blocks.length) out += "\n";
      });
      out += `\nStatus: HEALTHY\n Number of data-nodes:\t${DATANODES.length}\n Number of racks:\t\t1\n Total dirs:\t\t\t${dirs}\n Total symlinks:\t\t0\n\nReplicated Blocks:\n Total size:\t${totalSize} B\n Total files:\t${files}\n Total blocks (validated):\t${blocks}${blocks ? ` (avg. block size ${Math.round(totalSize / blocks)} B)` : ""}\n Minimally replicated blocks:\t${blocks} (100.0 %)\n Over-replicated blocks:\t0 (0.0 %)\n Under-replicated blocks:\t${under} (${blocks ? ((under / blocks) * 100).toFixed(1) : "0.0"} %)\n Mis-replicated blocks:\t\t0 (0.0 %)\n Default replication factor:\t3\n Average block replication:\t${blocks ? (totalRep / blocks).toFixed(1) : "0.0"}\n Missing blocks:\t\t0\n Corrupt blocks:\t\t0\n`;
      out += `FSCK ended at ${new Date().toString().replace(/ GMT.*$/, "")} in 7 milliseconds\n\n\nThe filesystem under path '${path}' is HEALTHY\n`;
      this.save();
      return ok(out);
    }

    dfsadmin(args) {
      if (!this.st.running) return this.connRefused("report");
      if (args[0] === "-safemode") {
        const a = args[1];
        if (a === "enter") this.st.safemode = true;
        if (a === "leave") this.st.safemode = false;
        if (!["get", "enter", "leave", "wait"].includes(a)) return fail("Usage: hdfs dfsadmin [-safemode enter | leave | get | wait]\n");
        return ok(`Safe mode is ${this.st.safemode ? "ON" : "OFF"}\n`);
      }
      if (args[0] !== "-report") return fail("Usage: hdfs dfsadmin\n\t[-report [-live] [-dead] [-decommissioning]]\n\t[-safemode <enter | leave | get | wait>]\n");
      const cap = 50 * 1024 ** 3;
      const used = this.H.totals("/").raw;
      const perNode = Math.round(used / DATANODES.length);
      const g = (x) => `${x} (${human(x)}B)`;
      let out = `${this.st.safemode ? "Safe mode is ON\n" : ""}Configured Capacity: ${g(cap * 3)}\nPresent Capacity: ${g(cap * 3 - 6 * 1024 ** 3)}\nDFS Remaining: ${g(cap * 3 - 6 * 1024 ** 3 - used)}\nDFS Used: ${g(used)}\nDFS Used%: ${((used / (cap * 3)) * 100).toFixed(2)}%\nReplicated Blocks:\n\tUnder replicated blocks: 0\n\tBlocks with corrupt replicas: 0\n\tMissing blocks: 0\n\n-------------------------------------------------\nLive datanodes (${DATANODES.length}):\n\n`;
      for (const d of DATANODES) {
        out += `Name: ${d.ip}:9866 (${d.name})\nHostname: ${d.name}\nDecommission Status : Normal\nConfigured Capacity: ${g(cap)}\nDFS Used: ${g(perNode)}\nNon DFS Used: ${g(2 * 1024 ** 3)}\nDFS Remaining: ${g(cap - perNode - 2 * 1024 ** 3)}\nDFS Used%: ${((perNode / cap) * 100).toFixed(2)}%\nXceivers: 1\nLast contact: ${new Date().toString().replace(/ GMT.*$/, "")} UZT\n\n`;
      }
      return ok(out);
    }
  }

  // ------------------------------------------------------------------ локальные команды
  function ok(out) { return { out, code: 0 }; }
  function fail(out) { return { out, code: 1 }; }
  const SAFEMODE_WRITES = {
    mkdir: "create directory", put: "create file", copyFromLocal: "create file", moveFromLocal: "create file",
    appendToFile: "append to file", touchz: "create file", touch: "create file", cp: "create file", mv: "rename",
    rm: "delete", rmr: "delete", delete: "delete", rmdir: "delete", setrep: "set replication for",
    chmod: "set permission for", chown: "set owner for", chgrp: "set owner for",
  };
  function permToOct(p) { return [0, 3, 6].map((o) => (p[o] === "r" ? 4 : 0) + (p[o + 1] === "w" ? 2 : 0) + (p[o + 2] !== "-" ? 1 : 0)).join(""); }

  const LOCAL_CMDS = {
    pwd() { return ok(this.st.cwd + "\n"); },
    whoami() { return ok(USER + "\n"); },
    hostname() { return ok("bigdata-master\n"); },
    date() { return ok(new Date().toString() + "\n"); },
    clear() { return { out: "", code: 0, clear: true }; },
    cls() { return { out: "", code: 0, clear: true }; },
    history() { return ok(this.st.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n") + "\n"); },
    help() { return ok(HELP); },
    jps() {
      if (!this.st.running && !this.st.yarn) return ok("4120 Jps\n");
      let out = "";
      if (this.st.running) out += "2481 NameNode\n2675 DataNode\n2890 SecondaryNameNode\n";
      if (this.st.yarn) out += "3120 ResourceManager\n3305 NodeManager\n";
      return ok(out + "4120 Jps\n");
    },
    cd(a) {
      const p = norm(a[0] === "~" || !a[0] ? HOME_LOCAL : a[0].replace(/^~/, HOME_LOCAL), this.st.cwd);
      const n = this.L.get(p);
      if (!n) return fail(`bash: cd: ${a[0]}: No such file or directory\n`);
      if (n.t !== "d") return fail(`bash: cd: ${a[0]}: Not a directory\n`);
      this.st.cwd = p; return ok("");
    },
    ls(a) {
      const { flags, params } = parseFlags(a);
      const targets = params.length ? params : ["."];
      let out = "", code = 0;
      for (const t of targets) {
        const p = norm(t.replace(/^~/, HOME_LOCAL), this.st.cwd);
        const n = this.L.get(p);
        if (!n) { out += `ls: cannot access '${t}': No such file or directory\n`; code = 1; continue; }
        const entries = n.t === "f" ? [[base(p), n]] : Object.keys(n.c).sort().filter((k) => flags.a || !k.startsWith(".")).map((k) => [k, n.c[k]]);
        if (targets.length > 1 && n.t === "d") out += `${t}:\n`;
        if (flags.l) {
          if (n.t === "d") out += `total ${entries.length * 4}\n`;
          for (const [k, nn] of entries) out += `${permStr(nn)} 1 ${nn.owner.padEnd(7)} ${nn.group.padEnd(7)} ${(flags.h ? human(nodeSize(nn) || 4096) : String(nn.t === "d" ? 4096 : nodeSize(nn))).padStart(9)} ${fmtDate(nn.mtime)} ${k}${nn.t === "d" ? "/" : ""}\n`;
        } else if (entries.length) out += entries.map(([k, nn]) => k + (nn.t === "d" ? "/" : "")).join("  ") + "\n";
      }
      return { out, code };
    },
    mkdir(a) {
      const { flags, params } = parseFlags(a);
      for (const t of params) {
        const p = norm(t, this.st.cwd);
        if (this.L.get(p)) { if (!flags.p) return fail(`mkdir: cannot create directory '${t}': File exists\n`); continue; }
        const r = this.L.mkdir(p, !!flags.p, () => dirNode(USER, USER));
        if (r.err) return fail(`mkdir: cannot create directory '${t}': No such file or directory\n`);
      }
      return ok("");
    },
    touch(a) {
      for (const t of a) {
        const p = norm(t, this.st.cwd); const n = this.L.get(p);
        if (n) n.mtime = now(); else if (!this.L.put(p, fileNode("", { owner: USER, group: USER }))) return fail(`touch: cannot touch '${t}': No such file or directory\n`);
      }
      return ok("");
    },
    cat(a, input) {
      if (!a.length) return ok(input || "");
      let out = "", code = 0;
      for (const t of a) {
        const n = this.L.get(norm(t, this.st.cwd));
        if (!n) { out += `cat: ${t}: No such file or directory\n`; code = 1; continue; }
        if (n.t === "d") { out += `cat: ${t}: Is a directory\n`; code = 1; continue; }
        out += n.data + (n.vsize ? `… (показано начало файла; полный размер ${human(nodeSize(n))}B)\n` : "");
      }
      return { out, code };
    },
    echo(a) { return ok(a.join(" ").replace(/\$\?/g, String(this.lastCode || 0)) + "\n"); },
    rm(a) {
      const { flags, params } = parseFlags(a);
      for (const t of params) {
        const p = norm(t, this.st.cwd); const n = this.L.get(p);
        if (!n) { if (!flags.f) return fail(`rm: cannot remove '${t}': No such file or directory\n`); continue; }
        if (n.t === "d" && !(flags.r || flags.R || flags.rf || flags.fr)) return fail(`rm: cannot remove '${t}': Is a directory\n`);
        this.L.remove(p);
      }
      return ok("");
    },
    cp(a) {
      const { params } = parseFlags(a);
      const [s, d] = params; const sn = this.L.get(norm(s || "", this.st.cwd));
      if (!sn) return fail(`cp: cannot stat '${s}': No such file or directory\n`);
      let dp = norm(d || "", this.st.cwd); const dn = this.L.get(dp);
      if (dn && dn.t === "d") dp += "/" + base(norm(s, this.st.cwd));
      this.L.put(dp, JSON.parse(JSON.stringify(sn))); return ok("");
    },
    mv(a) {
      const [s, d] = a; const sp = norm(s || "", this.st.cwd); const sn = this.L.get(sp);
      if (!sn) return fail(`mv: cannot stat '${s}': No such file or directory\n`);
      let dp = norm(d || "", this.st.cwd); const dn = this.L.get(dp);
      if (dn && dn.t === "d") dp += "/" + base(sp);
      this.L.put(dp, sn); this.L.remove(sp); return ok("");
    },
    head(a, input) { return headTail.call(this, a, input, true); },
    tail(a, input) { return headTail.call(this, a, input, false); },
    wc(a, input) {
      const { flags, params } = parseFlags(a);
      const run = (text, label) => {
        const l = (text.match(/\n/g) || []).length, w = text.split(/\s+/).filter(Boolean).length, c = bytes(text);
        if (flags.l) return `${l}${label ? " " + label : ""}\n`;
        if (flags.w) return `${w}${label ? " " + label : ""}\n`;
        if (flags.c) return `${c}${label ? " " + label : ""}\n`;
        return `${String(l).padStart(4)} ${String(w).padStart(5)} ${String(c).padStart(6)}${label ? " " + label : ""}\n`;
      };
      if (!params.length) return ok(run(input || "", ""));
      let out = "";
      for (const t of params) { const n = this.L.get(norm(t, this.st.cwd)); if (!n) return fail(`wc: ${t}: No such file or directory\n`); out += run(n.data, t); }
      return ok(out);
    },
    grep(a, input) {
      const { flags, params } = parseFlags(a);
      const [pat, file] = params;
      if (!pat) return fail("Usage: grep [OPTION]... PATTERNS [FILE]...\n");
      let text = input || "";
      if (file) { const n = this.L.get(norm(file, this.st.cwd)); if (!n) return fail(`grep: ${file}: No such file or directory\n`); text = n.data; }
      let rx; try { rx = new RegExp(pat, flags.i ? "i" : ""); } catch (e) { rx = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags.i ? "i" : ""); }
      const lines = text.split("\n").filter((l) => l && (rx.test(l) !== !!flags.v));
      if (flags.c) return ok(lines.length + "\n");
      return { out: lines.length ? lines.join("\n") + "\n" : "", code: lines.length ? 0 : 1 };
    },
    sort(a, input) {
      const { flags } = parseFlags(a);
      let lines = (input || "").split("\n").filter(Boolean);
      lines.sort((x, y) => (flags.n ? parseFloat(x) - parseFloat(y) : x.localeCompare(y)));
      if (flags.r) lines.reverse();
      return ok(lines.join("\n") + (lines.length ? "\n" : ""));
    },
    uniq(a, input) {
      const { flags } = parseFlags(a);
      const out = []; let prev = null, cnt = 0;
      for (const l of (input || "").split("\n").filter(Boolean)) {
        if (l === prev) cnt++; else { if (prev !== null) out.push(flags.c ? `${String(cnt).padStart(7)} ${prev}` : prev); prev = l; cnt = 1; }
      }
      if (prev !== null) out.push(flags.c ? `${String(cnt).padStart(7)} ${prev}` : prev);
      return ok(out.join("\n") + (out.length ? "\n" : ""));
    },
    du(a) {
      const { params } = parseFlags(a);
      const p = norm(params[0] || ".", this.st.cwd);
      if (!this.L.get(p)) return fail(`du: cannot access '${params[0]}': No such file or directory\n`);
      return ok(`${human(this.L.totals(p).size)}\t${params[0] || "."}\n`);
    },
    nano() { return fail("nano: в тренажёре редактора нет. Создайте файл так: echo \"текст\" > файл.txt\n"); },
    vim() { return fail("vim: в тренажёре редактора нет. Создайте файл так: echo \"текст\" > файл.txt\n"); },
    python3() { return fail("python3: для Python используйте задания с редактором кода (Pyodide).\n"); },
    python() { return fail("python: для Python используйте задания с редактором кода (Pyodide).\n"); },
    java() { return ok('openjdk version "11.0.24" 2024-07-16\nOpenJDK Runtime Environment (build 11.0.24+8)\n'); },
  };
  LOCAL_CMDS.java = function (a) { return a[0] === "-version" ? ok('openjdk version "11.0.24" 2024-07-16\nOpenJDK Runtime Environment (build 11.0.24+8-post-Ubuntu-1ubuntu124.04)\nOpenJDK 64-Bit Server VM (build 11.0.24+8, mixed mode, sharing)\n') : fail("Usage: java [options] <mainclass> [args...]\n"); };

  function headTail(a, input, head) {
    const { params, nval } = parseFlags(a, true);
    const n = nval || 10;
    let text = input || "";
    if (params[0]) { const nd = this.L.get(norm(params[0], this.st.cwd)); if (!nd) return fail(`${head ? "head" : "tail"}: cannot open '${params[0]}' for reading: No such file or directory\n`); text = nd.data; }
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const sel = head ? lines.slice(0, n) : lines.slice(-n);
    return ok(sel.join("\n") + (sel.length ? "\n" : ""));
  }

  // ------------------------------------------------------------------ разбор командной строки
  function tokenize(s) {
    const out = []; let cur = "", q = null, has = false;
    const quoted = new Set();   // индексы аргументов, записанных в кавычках (в них * и ? не раскрываются)
    const push = () => { if (has) quoted.add(out.length); out.push(cur); };
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
      if (/\s/.test(ch)) { if (cur || has) push(); cur = ""; has = false; continue; }
      cur += ch;
    }
    if (cur || has) push();
    out.quoted = quoted;
    return out;
  }
  function splitOutside(s, sep) {
    const parts = []; let cur = "", q = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === q) q = null; cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (s.startsWith(sep, i) && !(sep === "|" && s[i + 1] === "|")) { parts.push(cur); cur = ""; i += sep.length - 1; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map((x) => x.trim()).filter(Boolean);
  }
  const splitAnd = (s) => splitOutside(s, "&&");
  const splitPipe = (s) => splitOutside(s, "|");
  function parseFlags(args, numeric) {
    const flags = {}, params = []; let nval = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (numeric && a === "-n") { nval = parseInt(args[++i], 10); continue; }
      if (numeric && /^-\d+$/.test(a)) { nval = parseInt(a.slice(1), 10); continue; }
      if (a.startsWith("--")) { flags[a.slice(2)] = true; continue; }
      if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
        if (["skipTrash", "ignore-fail-on-non-empty", "nl"].includes(a.slice(1))) { flags[a.slice(1)] = true; continue; }
        for (const ch of a.slice(1)) flags[ch] = true;
        if (a.length > 2) flags[a.slice(1)] = true;
        continue;
      }
      params.push(a);
    }
    return { flags, params, nval };
  }

  const VERSION = "Hadoop 3.3.6\nSource code repository https://github.com/apache/hadoop.git -r 1be78238728da9266a4f88195058f08fd012bf9c\nCompiled by ubuntu on 2023-06-18T08:22Z\n(учебный эмулятор тренажёра Big Data)\n";
  const HDFS_USAGE = "Usage: hdfs [OPTIONS] SUBCOMMAND [SUBCOMMAND OPTIONS]\n  dfs        run a filesystem command on the file system\n  dfsadmin   run a DFS admin client\n  fsck       run a DFS filesystem checking utility\n  namenode   run the DFS namenode (-format)\n  getconf    get config values from configuration\n  version    print the version\n";
  const DFS_USAGE = `Usage: hadoop fs [generic options]
  [-appendToFile <localsrc> ... <dst>]
  [-cat <src> ...]
  [-checksum <src> ...]
  [-chmod [-R] <MODE> PATH...]
  [-chown [-R] [OWNER][:[GROUP]] PATH...]
  [-copyFromLocal [-f] <localsrc> ... <dst>]
  [-copyToLocal [-f] <src> <localdst>]
  [-count [-h] [-v] <path> ...]
  [-cp [-f] <src> ... <dst>]
  [-df [-h] [<path> ...]]
  [-du [-s] [-h] [-v] <path> ...]
  [-find <path> -name <pattern>]
  [-get [-f] <src> <localdst>]
  [-getmerge [-nl] <src> <localdst>]
  [-head <file>]
  [-ls [-d] [-h] [-R] [<path> ...]]
  [-mkdir [-p] <path> ...]
  [-moveFromLocal <localsrc> ... <dst>]
  [-mv <src> ... <dst>]
  [-put [-f] <localsrc> ... <dst>]
  [-rm [-f] [-r|-R] [-skipTrash] <src> ...]
  [-rmdir [--ignore-fail-on-non-empty] <dir> ...]
  [-setrep [-R] [-w] <rep> <path> ...]
  [-stat [format] <path> ...]
  [-tail [-f] <file>]
  [-test -[defsz] <path>]
  [-text <src> ...]
  [-touchz <path> ...]
`;
  const HELP = `Доступные команды тренажёра:
  Кластер:   start-dfs.sh  stop-dfs.sh  start-yarn.sh  stop-yarn.sh  jps
             hdfs namenode -format   hdfs version   hdfs getconf -confKey dfs.blocksize
  HDFS:      hdfs dfs -ls -mkdir -put -get -cat -head -tail -rm -cp -mv -du -df -count
             -stat -setrep -chmod -chown -touchz -appendToFile -getmerge -test -find   (то же: hadoop fs ...)
             hdfs fsck <путь> -files -blocks -locations     hdfs dfsadmin -report | -safemode get
  Linux:     ls [-l] cd pwd cat head tail wc grep sort uniq echo mkdir rm cp mv touch du history clear
  Также:     конвейеры (cmd | head -5), перенаправление (cmd > файл), цепочки (cmd1 && cmd2)
  Клавиши:   ↑/↓ — история, Tab — дополнение имени файла
`;

  const sim = new HdfsSim();
  window.Hdfs = {
    sim,
    ready: sim.seed(),
    exec: (line) => sim.exec(line),
    prompt: () => `student@bigdata-master:${sim.st.cwd.replace(HOME_LOCAL, "~")}$ `,
    api: () => sim.api(),
    reset: () => sim.reset(),
    complete(line) {
      const m = line.match(/(\S*)$/);
      const word = m ? m[1] : "";
      const isHdfs = /\b(hdfs dfs|hadoop fs)\b/.test(line) && !/-(put|copyFromLocal|moveFromLocal|appendToFile)\s+\S*$/.test(line);
      const fs = isHdfs ? sim.H : sim.L;
      const cwd = isHdfs ? HOME_HDFS : sim.st.cwd;
      const dir = word.includes("/") ? word.slice(0, word.lastIndexOf("/") + 1) : "";
      const pre = word.slice(dir.length);
      const node = fs.get(norm(dir || ".", cwd));
      if (!node || node.t !== "d") return null;
      const opts = Object.keys(node.c).filter((k) => k.startsWith(pre)).sort();
      if (!opts.length) return null;
      if (opts.length === 1) return line.slice(0, line.length - word.length) + dir + opts[0] + (node.c[opts[0]].t === "d" ? "/" : " ");
      let common = opts[0];
      for (const o of opts) while (!o.startsWith(common)) common = common.slice(0, -1);
      return { line: line.slice(0, line.length - word.length) + dir + common, options: opts };
    },
  };
})();
