/* Учебный эмулятор MongoDB (оболочка mongosh) — работает целиком в браузере.
 * Поддерживает: use/show, insertOne/insertMany, find (фильтры, проекции, sort/limit/skip),
 * updateOne/updateMany/replaceOne, deleteOne/deleteMany, countDocuments, distinct,
 * aggregate ($match, $group, $sort, $project, $unwind, $lookup, ...), индексы, $text.
 * Состояние хранится в localStorage. */
(function () {
  "use strict";
  const LS_KEY = window.BDT_SELFTEST ? "bdt.selftest.mongo" : "bdt.mongo.v1";

  // ------------------------------------------------------------------ типы
  let oidCounter = Math.floor(Math.random() * 0xffffff);
  const oidRand = Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  class ObjectId {
    constructor(hex) {
      if (hex !== undefined && !/^[0-9a-fA-F]{24}$/.test(String(hex))) {
        throw new MongoError("BSONError", "input must be a 24 character hex string, 12 byte Uint8Array, or an integer");
      }
      this.$oid = hex ? String(hex).toLowerCase() : ObjectId.gen();
    }
    static gen() {
      const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
      oidCounter = (oidCounter + 1) % 0xffffff;
      return ts + oidRand + oidCounter.toString(16).padStart(6, "0");
    }
    toString() { return this.$oid; }
    toHexString() { return this.$oid; }
    equals(o) { return o instanceof ObjectId && o.$oid === this.$oid; }
    getTimestamp() { return new Date(parseInt(this.$oid.slice(0, 8), 16) * 1000); }
  }
  function ObjectIdShell(hex) { return new ObjectId(hex); }
  ObjectIdShell.prototype = ObjectId.prototype;
  function ISODate(s) { return s === undefined ? new Date() : new Date(s); }

  class MongoError extends Error {
    constructor(kind, msg, code) { super(msg); this.kind = kind; this.code = code; }
  }

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof ObjectId) && !(v instanceof Date) && !(v instanceof RegExp);

  function clone(v) {
    if (v instanceof ObjectId) return new ObjectId(v.$oid);
    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof RegExp) return v;
    if (Array.isArray(v)) return v.map(clone);
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clone(v[k]); return o; }
    return v;
  }
  function encode(v) {
    if (v instanceof ObjectId) return { $oid: v.$oid };
    if (v instanceof Date) return { $date: v.toISOString() };
    if (v instanceof RegExp) return { $regex: v.source, $options: v.flags };
    if (Array.isArray(v)) return v.map(encode);
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = encode(v[k]); return o; }
    return v;
  }
  function decode(v) {
    if (Array.isArray(v)) return v.map(decode);
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length === 1 && keys[0] === "$oid") return new ObjectId(v.$oid);
      if (keys.length === 1 && keys[0] === "$date") return new Date(v.$date);
      const o = {}; for (const k of keys) o[k] = decode(v[k]); return o;
    }
    return v;
  }

  // ------------------------------------------------------------------ сравнение
  function typeOrder(v) {
    if (v === null || v === undefined) return 1;
    if (typeof v === "number") return 2;
    if (typeof v === "string") return 3;
    if (isObj(v)) return 4;
    if (Array.isArray(v)) return 5;
    if (v instanceof ObjectId) return 7;
    if (typeof v === "boolean") return 8;
    if (v instanceof Date) return 9;
    if (v instanceof RegExp) return 11;
    return 12;
  }
  function cmp(a, b) {
    const ta = typeOrder(a), tb = typeOrder(b);
    if (ta !== tb) return ta - tb;
    switch (ta) {
      case 1: return 0;
      case 2: return a - b;
      case 3: return a < b ? -1 : a > b ? 1 : 0;
      case 7: return a.$oid < b.$oid ? -1 : a.$oid > b.$oid ? 1 : 0;
      case 8: return (a ? 1 : 0) - (b ? 1 : 0);
      case 9: return a.getTime() - b.getTime();
      case 5: {
        for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
        return a.length - b.length;
      }
      case 4: {
        const ka = Object.keys(a), kb = Object.keys(b);
        for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
          if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
          const c = cmp(a[ka[i]], b[kb[i]]); if (c) return c;
        }
        return ka.length - kb.length;
      }
      default: return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    }
  }
  const deepEq = (a, b) => typeOrder(a) === typeOrder(b) && cmp(a, b) === 0;

  // ------------------------------------------------------------------ пути
  function getPathValues(doc, path) {
    let cur = [doc];
    for (const p of path.split(".")) {
      const next = [];
      for (const c of cur) {
        if (c === null || c === undefined) continue;
        if (Array.isArray(c)) {
          if (/^\d+$/.test(p)) { if (c[+p] !== undefined) next.push(c[+p]); }
          else for (const el of c) if (isObj(el) && p in el) next.push(el[p]);
        } else if (isObj(c) && p in c) next.push(c[p]);
      }
      cur = next;
    }
    return cur;
  }
  function getPath(doc, path) {
    let cur = doc;
    for (const p of path.split(".")) {
      if (cur === null || cur === undefined) return undefined;
      if (Array.isArray(cur) && !/^\d+$/.test(p)) {
        const vals = cur.filter(isObj).map((e) => e[p]).filter((x) => x !== undefined);
        return vals;
      }
      cur = cur[p];
    }
    return cur;
  }
  function setPath(doc, path, val) {
    const parts = path.split(".");
    let cur = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] === undefined || cur[p] === null) cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      else if (typeof cur[p] !== "object") throw new MongoError("MongoServerError", `Cannot create field '${parts[i + 1]}' in element {${p}: ${fmt(cur[p])}}`, 28);
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = val;
  }
  function unsetPath(doc, path) {
    const parts = path.split(".");
    let cur = doc;
    for (let i = 0; i < parts.length - 1; i++) { cur = cur && cur[parts[i]]; if (!cur || typeof cur !== "object") return; }
    if (cur) delete cur[parts[parts.length - 1]];
  }

  // ------------------------------------------------------------------ фильтры
  const expand = (vals) => vals.flatMap((v) => (Array.isArray(v) ? [v, ...v] : [v]));
  const isOpObj = (c) => isObj(c) && Object.keys(c).length > 0 && Object.keys(c).every((k) => k.startsWith("$"));

  function toRegex(arg, opts) {
    if (arg instanceof RegExp) return opts ? new RegExp(arg.source, opts) : arg;
    return new RegExp(String(arg), opts || "");
  }
  function matchEq(values, cond) {
    if (cond === null) return values.length === 0 || expand(values).some((v) => v === null || v === undefined);
    if (cond instanceof RegExp) return expand(values).some((v) => typeof v === "string" && cond.test(v));
    return values.some((v) => deepEq(v, cond)) || expand(values).some((v) => deepEq(v, cond));
  }
  const bsonType = (v) => v === null || v === undefined ? "null" : Array.isArray(v) ? "array" : v instanceof ObjectId ? "objectId" : v instanceof Date ? "date" : typeof v === "boolean" ? "bool" : typeof v === "number" ? (Number.isInteger(v) ? "int" : "double") : typeof v === "string" ? "string" : "object";

  function matchCond(values, cond, doc) {
    if (!isOpObj(cond)) return matchEq(values, cond);
    for (const [op, arg] of Object.entries(cond)) {
      let ok;
      const ex = expand(values);
      switch (op) {
        case "$eq": ok = matchEq(values, arg); break;
        case "$ne": ok = !matchEq(values, arg); break;
        case "$gt": ok = ex.some((v) => typeOrder(v) === typeOrder(arg) && cmp(v, arg) > 0); break;
        case "$gte": ok = ex.some((v) => typeOrder(v) === typeOrder(arg) && cmp(v, arg) >= 0); break;
        case "$lt": ok = ex.some((v) => typeOrder(v) === typeOrder(arg) && cmp(v, arg) < 0); break;
        case "$lte": ok = ex.some((v) => typeOrder(v) === typeOrder(arg) && cmp(v, arg) <= 0); break;
        case "$in":
          if (!Array.isArray(arg)) throw new MongoError("MongoServerError", "$in needs an array", 2);
          ok = arg.some((a) => matchEq(values, a)); break;
        case "$nin":
          if (!Array.isArray(arg)) throw new MongoError("MongoServerError", "$nin needs an array", 2);
          ok = !arg.some((a) => matchEq(values, a)); break;
        case "$exists": ok = (values.length > 0) === !!arg; break;
        case "$regex": { const rx = toRegex(arg, cond.$options); ok = ex.some((v) => typeof v === "string" && rx.test(v)); break; }
        case "$options": ok = true; break;
        case "$not": ok = !(arg instanceof RegExp ? matchEq(values, arg) : matchCond(values, arg, doc)); break;
        case "$size": ok = values.some((v) => Array.isArray(v) && v.length === arg); break;
        case "$all": ok = Array.isArray(arg) && arg.every((a) => matchEq(values, a)); break;
        case "$elemMatch":
          ok = values.some((v) => Array.isArray(v) && v.some((el) => (isObj(el) && !isOpObj(arg) ? matchDoc(el, arg) : matchCond([el], arg))));
          break;
        case "$type": { const ts = Array.isArray(arg) ? arg : [arg]; ok = ex.some((v) => ts.some((t) => t === bsonType(v) || (t === "number" && typeof v === "number"))); break; }
        case "$mod": ok = ex.some((v) => typeof v === "number" && v % arg[0] === arg[1]); break;
        default: throw new MongoError("MongoServerError", `unknown operator: ${op}`, 2);
      }
      if (!ok) return false;
    }
    return true;
  }

  function matchDoc(doc, filter) {
    if (!filter) return true;
    if (!isObj(filter)) throw new MongoError("MongoInvalidArgumentError", "Фильтр должен быть объектом, например {age: {$gt: 20}}");
    for (const [k, cond] of Object.entries(filter)) {
      if (k === "$and") { if (!cond.every((f) => matchDoc(doc, f))) return false; }
      else if (k === "$or") { if (!cond.some((f) => matchDoc(doc, f))) return false; }
      else if (k === "$nor") { if (cond.some((f) => matchDoc(doc, f))) return false; }
      else if (k === "$text") continue;
      else if (k === "$expr") { if (!truthy(evalExpr(cond, doc))) return false; }
      else if (k.startsWith("$")) throw new MongoError("MongoServerError", `unknown top level operator: ${k}`, 2);
      else if (!matchCond(getPathValues(doc, k), cond, doc)) return false;
    }
    return true;
  }
  const truthy = (v) => !(v === false || v === null || v === undefined || v === 0);

  // ------------------------------------------------------------------ выражения агрегации
  function num(v) { return typeof v === "number" ? v : v === null || v === undefined ? null : Number(v); }
  function evalExpr(e, doc, vars = {}) {
    if (typeof e === "string") {
      if (e.startsWith("$$")) {
        const [name, ...rest] = e.slice(2).split(".");
        const base = name === "ROOT" || name === "CURRENT" ? doc : vars[name];
        return rest.length ? getPath(base, rest.join(".")) : base;
      }
      if (e.startsWith("$")) return getPath(doc, e.slice(1));
      return e;
    }
    if (Array.isArray(e)) return e.map((x) => evalExpr(x, doc, vars));
    if (!isObj(e)) return e;
    const keys = Object.keys(e);
    if (keys.length === 1 && keys[0].startsWith("$")) {
      const op = keys[0], raw = e[op];
      const args = () => (Array.isArray(raw) ? raw : [raw]).map((x) => evalExpr(x, doc, vars));
      const a = () => evalExpr(raw, doc, vars);
      switch (op) {
        case "$literal": return raw;
        case "$add": { const xs = args(); if (xs.some((x) => x === null || x === undefined)) return null; const d = xs.find((x) => x instanceof Date); const s = xs.reduce((t, x) => t + (x instanceof Date ? x.getTime() : x), 0); return d ? new Date(s) : s; }
        case "$subtract": { const [x, y] = args(); if (x == null || y == null) return null; if (x instanceof Date && y instanceof Date) return x - y; if (x instanceof Date) return new Date(x.getTime() - y); return x - y; }
        case "$multiply": { const xs = args(); return xs.some((x) => x == null) ? null : xs.reduce((t, x) => t * x, 1); }
        case "$divide": { const [x, y] = args(); if (x == null || y == null) return null; if (y === 0) throw new MongoError("MongoServerError", "can't $divide by zero", 2); return x / y; }
        case "$mod": { const [x, y] = args(); return x % y; }
        case "$round": { const [x, p = 0] = args(); if (x == null) return null; const f = Math.pow(10, p); return Math.round(x * f) / f; }
        case "$trunc": { const [x, p = 0] = args(); const f = Math.pow(10, p); return Math.trunc(x * f) / f; }
        case "$abs": return Math.abs(num(a()));
        case "$ceil": return Math.ceil(num(a()));
        case "$floor": return Math.floor(num(a()));
        case "$sqrt": return Math.sqrt(num(a()));
        case "$pow": { const [x, y] = args(); return Math.pow(x, y); }
        case "$concat": { const xs = args(); return xs.some((x) => x === null || x === undefined) ? null : xs.join(""); }
        case "$toUpper": { const v = a(); return v == null ? "" : String(v).toUpperCase(); }
        case "$toLower": { const v = a(); return v == null ? "" : String(v).toLowerCase(); }
        case "$substr": case "$substrCP": case "$substrBytes": { const [s, st, len] = args(); return String(s ?? "").substr(st, len < 0 ? undefined : len); }
        case "$strLenCP": case "$strLenBytes": return [...String(a() ?? "")].length;
        case "$split": { const [s, sep] = args(); return s == null ? null : String(s).split(sep); }
        case "$trim": case "$ltrim": case "$rtrim": { const v = evalExpr(raw.input, doc, vars); if (v == null) return null; return op === "$trim" ? String(v).trim() : op === "$ltrim" ? String(v).trimStart() : String(v).trimEnd(); }
        case "$size": { const v = a(); if (!Array.isArray(v)) throw new MongoError("MongoServerError", `The argument to $size must be an array. Type of argument: ${bsonType(v)}`, 17124); return v.length; }
        case "$ifNull": { const xs = args(); return xs.find((x) => x !== null && x !== undefined) ?? null; }
        case "$cond": {
          const [c, t, f] = Array.isArray(raw) ? raw : [raw.if, raw.then, raw.else];
          return truthy(evalExpr(c, doc, vars)) ? evalExpr(t, doc, vars) : evalExpr(f, doc, vars);
        }
        case "$eq": { const [x, y] = args(); return deepEq(x ?? null, y ?? null); }
        case "$ne": { const [x, y] = args(); return !deepEq(x ?? null, y ?? null); }
        case "$gt": { const [x, y] = args(); return cmp(x, y) > 0; }
        case "$gte": { const [x, y] = args(); return cmp(x, y) >= 0; }
        case "$lt": { const [x, y] = args(); return cmp(x, y) < 0; }
        case "$lte": { const [x, y] = args(); return cmp(x, y) <= 0; }
        case "$cmp": { const [x, y] = args(); return Math.sign(cmp(x, y)); }
        case "$and": return args().every(truthy);
        case "$or": return args().some(truthy);
        case "$not": return !truthy(args()[0]);
        case "$in": { const [x, arr] = args(); return Array.isArray(arr) && arr.some((y) => deepEq(x, y)); }
        case "$year": return new Date(a()).getUTCFullYear();
        case "$month": return new Date(a()).getUTCMonth() + 1;
        case "$dayOfMonth": return new Date(a()).getUTCDate();
        case "$hour": return new Date(a()).getUTCHours();
        case "$dayOfWeek": return new Date(a()).getUTCDay() + 1;
        case "$dateToString": {
          const d = new Date(evalExpr(raw.date, doc, vars)); const f = raw.format || "%Y-%m-%dT%H:%M:%S.%LZ";
          const p = (n, w = 2) => String(n).padStart(w, "0");
          return f.replace("%Y", d.getUTCFullYear()).replace("%m", p(d.getUTCMonth() + 1)).replace("%d", p(d.getUTCDate()))
            .replace("%H", p(d.getUTCHours())).replace("%M", p(d.getUTCMinutes())).replace("%S", p(d.getUTCSeconds())).replace("%L", p(d.getUTCMilliseconds(), 3));
        }
        case "$toDate": return new Date(a());
        case "$toString": { const v = a(); return v == null ? null : v instanceof ObjectId ? v.$oid : v instanceof Date ? v.toISOString() : String(v); }
        case "$toInt": case "$toLong": { const v = a(); return v == null ? null : Math.trunc(Number(v)); }
        case "$toDouble": case "$toDecimal": { const v = a(); return v == null ? null : Number(v); }
        case "$arrayElemAt": { const [arr, i] = args(); if (!Array.isArray(arr)) return null; return i < 0 ? arr[arr.length + i] : arr[i]; }
        case "$first": { const v = a(); return Array.isArray(v) ? v[0] : v; }
        case "$last": { const v = a(); return Array.isArray(v) ? v[v.length - 1] : v; }
        case "$slice": { const [arr, n, m] = args(); if (!Array.isArray(arr)) return null; if (m !== undefined) return arr.slice(n, n + m); return n >= 0 ? arr.slice(0, n) : arr.slice(n); }
        case "$concatArrays": { const xs = args(); return xs.some((x) => x == null) ? null : [].concat(...xs); }
        case "$isArray": return Array.isArray(args()[0]);
        case "$sum": { const v = Array.isArray(raw) ? args() : a(); const arr = Array.isArray(v) ? v : [v]; return arr.filter((x) => typeof x === "number").reduce((t, x) => t + x, 0); }
        case "$avg": { const v = Array.isArray(raw) ? args() : a(); const arr = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "number"); return arr.length ? arr.reduce((t, x) => t + x, 0) / arr.length : null; }
        case "$max": { const v = Array.isArray(raw) ? args() : a(); const arr = (Array.isArray(v) ? v : [v]).filter((x) => x != null); return arr.length ? arr.reduce((m, x) => (cmp(x, m) > 0 ? x : m)) : null; }
        case "$min": { const v = Array.isArray(raw) ? args() : a(); const arr = (Array.isArray(v) ? v : [v]).filter((x) => x != null); return arr.length ? arr.reduce((m, x) => (cmp(x, m) < 0 ? x : m)) : null; }
        case "$filter": { const arr = evalExpr(raw.input, doc, vars) || []; const as = raw.as || "this"; return arr.filter((x) => truthy(evalExpr(raw.cond, doc, { ...vars, [as]: x }))); }
        case "$map": { const arr = evalExpr(raw.input, doc, vars) || []; const as = raw.as || "this"; return arr.map((x) => evalExpr(raw.in, doc, { ...vars, [as]: x })); }
        case "$regexMatch": { const s = evalExpr(raw.input, doc, vars); return typeof s === "string" && toRegex(raw.regex, raw.options).test(s); }
        case "$type": return bsonType(a());
        default: throw new MongoError("MongoServerError", `Invalid $project :: caused by :: Unrecognized expression '${op}'`, 168);
      }
    }
    const o = {};
    for (const k of keys) o[k] = evalExpr(e[k], doc, vars);
    return o;
  }

  // ------------------------------------------------------------------ проекция и сортировка
  function project(doc, proj, score) {
    if (!proj || !Object.keys(proj).length) return doc;
    const isMeta = (v) => isObj(v) && v.$meta;
    const keys = Object.keys(proj).filter((k) => k !== "_id");
    const incl = keys.filter((k) => !isMeta(proj[k]) && (proj[k] === 1 || proj[k] === true || typeof proj[k] === "string" || isObj(proj[k])));
    const excl = keys.filter((k) => proj[k] === 0 || proj[k] === false);
    if (incl.length && excl.length) throw new MongoError("MongoServerError", `Cannot do exclusion on field ${excl[0]} in inclusion projection`, 31254);
    let out;
    if (incl.length || (keys.length && !excl.length && keys.every((k) => isMeta(proj[k])) && false)) {
      out = {};
      if (proj._id !== 0 && proj._id !== false && doc._id !== undefined) out._id = doc._id;
      for (const k of keys) {
        const v = proj[k];
        if (isMeta(v)) out[k] = score;
        else if (v === 1 || v === true) { const val = getPath(doc, k); if (val !== undefined) setPath(out, k, val); }
        else out[k] = evalExpr(v, doc);
      }
    } else {
      out = clone(doc);
      for (const k of excl) unsetPath(out, k);
      if (proj._id === 0 || proj._id === false) delete out._id;
      for (const k of keys) if (isMeta(proj[k])) out[k] = score;
    }
    return out;
  }
  function sortDocs(docs, spec, scoreOf) {
    if (!isObj(spec)) throw new MongoError("MongoInvalidArgumentError", "sort() ожидает объект, например {age: -1}");
    const keys = Object.entries(spec);
    return docs.slice().sort((a, b) => {
      for (const [k, dirRaw] of keys) {
        let va, vb, dir = dirRaw === -1 || dirRaw === "desc" || dirRaw === "descending" ? -1 : 1;
        if (isObj(dirRaw) && dirRaw.$meta) { va = scoreOf(a); vb = scoreOf(b); dir = -1; }
        else {
          const pick = (d) => { const vs = getPathValues(d, k); if (!vs.length) return null; const ex = vs.flatMap((v) => (Array.isArray(v) ? (v.length ? v : [null]) : [v])); return ex.reduce((m, x) => ((dir === 1 ? cmp(x, m) < 0 : cmp(x, m) > 0) ? x : m)); };
          va = pick(a); vb = pick(b);
        }
        const c = cmp(va, vb);
        if (c) return dir * c;
      }
      return 0;
    });
  }

  // ------------------------------------------------------------------ формат вывода (как в mongosh)
  function fmtKey(k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`; }
  function fmtStr(s) { return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`; }
  function fmt(v, ind = 0) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (v instanceof ObjectId) return `ObjectId('${v.$oid}')`;
    if (v instanceof Date) return isNaN(v) ? "Invalid Date" : `ISODate('${v.toISOString()}')`;
    if (v instanceof RegExp) return v.toString();
    if (typeof v === "string") return fmtStr(v);
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : String(v);
    if (typeof v === "boolean") return String(v);
    if (typeof v === "function") return "[Function]";
    if (v && v.__isCursor) return "[Cursor]";
    const pad = " ".repeat(ind + 2), end = " ".repeat(ind);
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      const items = v.map((x) => fmt(x, ind + 2));
      const one = "[ " + items.join(", ") + " ]";
      if (one.length + ind <= 72 && !one.includes("\n")) return one;
      return "[\n" + items.map((i) => pad + i).join(",\n") + "\n" + end + "]";
    }
    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    const items = keys.map((k) => `${fmtKey(k)}: ${fmt(v[k], ind + 2)}`);
    const one = "{ " + items.join(", ") + " }";
    if (one.length + ind <= 72 && !one.includes("\n")) return one;
    return "{\n" + items.map((i) => pad + i).join(",\n") + "\n" + end + "}";
  }

  // ------------------------------------------------------------------ хранилище
  class MongoSim {
    constructor() {
      this.dbs = {};       // {dbName: {collName: {docs: [], indexes: [], textIndex: null}}}
      this.current = "test";
      this.lastCursor = null;
      this.load();
    }
    load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) { const st = JSON.parse(raw); this.dbs = decode(st.dbs) || {}; this.current = st.current || "test"; }
      } catch (e) { this.dbs = {}; }
    }
    save() {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ dbs: encode(this.dbs), current: this.current })); } catch (e) { /* quota */ }
    }
    reset() { this.dbs = {}; this.current = "test"; this.lastCursor = null; this.save(); }

    _coll(db, name, create) {
      if (!this.dbs[db]) { if (!create) return null; this.dbs[db] = {}; }
      if (!this.dbs[db][name]) {
        if (!create) return null;
        this.dbs[db][name] = { docs: [], indexes: [{ v: 2, key: { _id: 1 }, name: "_id_" }], textIndex: null };
      }
      return this.dbs[db][name];
    }
    listDbs() {
      const sys = [["admin", "40.00 KiB"], ["config", "60.00 KiB"], ["local", "72.00 KiB"]];
      const user = Object.keys(this.dbs).filter((d) => Object.keys(this.dbs[d]).length).sort().map((d) => {
        const size = JSON.stringify(encode(this.dbs[d])).length / 1024;
        return [d, Math.max(8, Math.ceil(size / 4) * 4).toFixed(2) + " KiB"];
      });
      return [...sys, ...user].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    }

    // ---------- доступ для проверок
    docs(db, coll) { const c = this._coll(db, coll, false); return c ? c.docs.map(clone) : []; }
    count(db, coll, filter) { return this.docs(db, coll).filter((d) => matchDoc(d, filter)).length; }
    exists(db, coll) { return !!this._coll(db, coll, false); }
    indexes(db, coll) { const c = this._coll(db, coll, false); return c ? clone(c.indexes) : []; }

    async ensureFixtures(list, base) {
      for (const f of list || []) {
        const c = this._coll(f.db, f.coll, false);
        if (c && c.docs.length) continue;
        const r = await fetch(base + f.file);
        const arr = await r.json();
        const coll = this._coll(f.db, f.coll, true);
        for (const d of arr) { let doc = decode(d); if (doc._id === undefined) doc = Object.assign({ _id: new ObjectId() }, doc); coll.docs.push(doc); }
      }
      this.save();
    }
  }

  // ------------------------------------------------------------------ коллекция (API mongosh)
  function makeCollection(sim, dbName, name, out) {
    const full = `${dbName}.${name}`;
    const C = () => sim._coll(dbName, name, false);
    const Cc = () => sim._coll(dbName, name, true);

    function checkUnique(coll, doc, skip) {
      for (const ix of coll.indexes) {
        if (!(ix.unique || ix.name === "_id_")) continue;
        const keys = Object.keys(ix.key);
        const val = keys.map((k) => getPath(doc, k));
        const dup = coll.docs.find((d) => d !== skip && keys.every((k, i) => deepEq(getPath(d, k) ?? null, val[i] ?? null)));
        if (dup) {
          const dk = "{ " + keys.map((k, i) => `${k}: ${fmt(val[i] ?? null)}`).join(", ") + " }";
          throw new MongoError("MongoServerError", `E11000 duplicate key error collection: ${full} index: ${ix.name} dup key: ${dk}`, 11000);
        }
      }
    }
    function prepDoc(doc) {
      if (!isObj(doc)) throw new MongoError("MongoInvalidArgumentError", "Документ должен быть объектом { ... }");
      const d = clone(doc);
      for (const k of Object.keys(d)) if (k.startsWith("$")) throw new MongoError("MongoServerError", `Document can't have $ prefixed field names: ${k}`, 2);
      if (d._id === undefined) return Object.assign({ _id: new ObjectId() }, d);
      return d;
    }
    function textScores(coll, filter) {
      if (!filter || !filter.$text) return null;
      if (!coll || !coll.textIndex) throw new MongoError("MongoServerError", "text index required for $text query", 27);
      const q = String(filter.$text.$search || "");
      const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
      const words = q.replace(/"[^"]+"/g, " ").split(/\s+/).filter(Boolean);
      const neg = words.filter((w) => w.startsWith("-")).map((w) => w.slice(1).toLowerCase());
      const pos = words.filter((w) => !w.startsWith("-")).map((w) => w.toLowerCase());
      const scores = new Map();
      for (const d of coll.docs) {
        const text = coll.textIndex.map((f) => getPathValues(d, f).flat().join(" ")).join(" ").toLowerCase();
        const tokens = text.split(/[^\p{L}\p{N}ʻʼ'‘’`]+/u).filter(Boolean);
        if (neg.some((n) => tokens.some((t) => t.startsWith(n)))) continue;
        if (phrases.some((p) => !text.includes(p))) continue;
        let s = 0;
        for (const w of pos) s += tokens.filter((t) => t === w || (w.length > 3 && t.startsWith(w))).length;
        for (const p of phrases) s += 1;
        if (s > 0) scores.set(d, s / Math.max(1, tokens.length) * 10 + 0.5 * s);
      }
      return scores;
    }
    function matched(filter) {
      const coll = C();
      if (!coll) return { docs: [], scores: null };
      const scores = textScores(coll, filter);
      const docs = coll.docs.filter((d) => (!scores || scores.has(d)) && matchDoc(d, filter));
      return { docs, scores };
    }

    class Cursor {
      constructor(filter, proj) {
        this.__isCursor = true; this._filter = filter || {}; this._proj = proj; this._sort = null; this._limit = 0; this._skip = 0;
        this._res = null; this._pos = 0;
      }
      sort(s) { this._sort = s; return this; }
      limit(n) { this._limit = n; return this; }
      skip(n) { this._skip = n; return this; }
      project(p) { this._proj = p; return this; }
      pretty() { return this; }
      batchSize() { return this; }
      _exec() {
        if (this._res) return this._res;
        const { docs, scores } = matched(this._filter);
        let r = docs;
        if (this._sort) r = sortDocs(r, this._sort, (d) => (scores ? scores.get(d) || 0 : 0));
        if (this._skip) r = r.slice(this._skip);
        if (this._limit) r = r.slice(0, Math.abs(this._limit));
        this._res = r.map((d) => project(clone(d), this._proj, scores ? +(scores.get(d) || 0).toFixed(4) : undefined));
        return this._res;
      }
      toArray() { return this._exec().slice(); }
      forEach(fn) { this._exec().forEach((d) => fn(d)); }
      map(fn) { return this._exec().map((d) => fn(d)); }
      count() { return matched(this._filter).docs.length; }
      size() { return this._exec().length; }
      itcount() { return this._exec().length; }
      hasNext() { return this._pos < this._exec().length; }
      next() { const r = this._exec(); if (this._pos >= r.length) throw new MongoError("MongoCursorExhaustedError", "Cursor is exhausted"); return r[this._pos++]; }
      explain() {
        const coll = C();
        const n = this._exec().length;
        const fields = Object.keys(this._filter).filter((k) => !k.startsWith("$"));
        const ix = coll && coll.indexes.find((i) => fields.length && Object.keys(i.key)[0] === fields[0] && i.name !== "_id_" || (fields[0] === "_id" && i.name === "_id_"));
        const textIx = this._filter.$text && coll && coll.textIndex;
        const stage = textIx ? "TEXT_MATCH" : ix ? "IXSCAN" : "COLLSCAN";
        return {
          queryPlanner: { namespace: full, winningPlan: ix ? { stage: "FETCH", inputStage: { stage, indexName: ix.name } } : { stage } },
          executionStats: { nReturned: n, totalDocsExamined: ix || textIx ? n : (coll ? coll.docs.length : 0), totalKeysExamined: ix ? n : 0 },
        };
      }
      toString() { return "[Cursor]"; }
    }

    const api = {
      __isCollection: true,
      getName: () => name,
      getFullName: () => full,
      toString: () => full,
      insertOne(doc) {
        if (Array.isArray(doc)) throw new MongoInvalidArg("insertOne принимает один документ. Для массива используйте insertMany([...])");
        const coll = Cc(); const d = prepDoc(doc); checkUnique(coll, d); coll.docs.push(d);
        return { acknowledged: true, insertedId: d._id };
      },
      insertMany(docs, opts = {}) {
        if (!Array.isArray(docs)) throw new MongoInvalidArg('Argument "docs" must be an array of documents');
        const coll = Cc(); const ids = {};
        docs.forEach((doc, i) => { const d = prepDoc(doc); checkUnique(coll, d); coll.docs.push(d); ids[String(i)] = d._id; });
        return { acknowledged: true, insertedIds: ids };
      },
      insert(docs) { return Array.isArray(docs) ? api.insertMany(docs) : api.insertOne(docs); },
      find(filter, proj) { return new Cursor(filter, proj); },
      findOne(filter, proj) { const r = new Cursor(filter, proj).limit(1).toArray(); return r.length ? r[0] : null; },
      countDocuments(filter) { return matched(filter || {}).docs.length; },
      count(filter) { return matched(filter || {}).docs.length; },
      estimatedDocumentCount() { const c = C(); return c ? c.docs.length : 0; },
      distinct(field, filter) {
        const vals = [];
        for (const d of matched(filter || {}).docs) for (const v of expand(getPathValues(d, field))) if (!Array.isArray(v) && !vals.some((x) => deepEq(x, v))) vals.push(clone(v));
        return vals.sort(cmp);
      },
      _update(filter, update, opts, many) {
        if (!isObj(update) && !Array.isArray(update)) throw new MongoInvalidArg("Второй аргумент update должен быть объектом, например {$set: {age: 21}}");
        const keys = Object.keys(update);
        if (!keys.length || !keys[0].startsWith("$")) throw new MongoInvalidArg("Update document requires atomic operators (например $set, $inc)");
        const coll = Cc();
        const { docs } = matched(filter || {});
        const targets = many ? docs : docs.slice(0, 1);
        let modified = 0;
        for (const d of targets) {
          const before = JSON.stringify(encode(d));
          const copy = clone(d);
          applyUpdate(copy, update, false);
          if (copy._id !== undefined && !deepEq(copy._id, d._id)) throw new MongoError("MongoServerError", "Performing an update on the path '_id' would modify the immutable field '_id'", 66);
          checkUnique(coll, copy, d);
          if (JSON.stringify(encode(copy)) !== before) { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, copy); modified++; }
        }
        let upsertedId = null;
        if (!targets.length && opts && opts.upsert) {
          const base = {};
          for (const [k, v] of Object.entries(filter || {})) if (!k.startsWith("$") && !isOpObj(v)) setPath(base, k, clone(v));
          applyUpdate(base, update, true);
          const d = prepDoc(base); checkUnique(coll, d); coll.docs.push(d); upsertedId = d._id;
        }
        return { acknowledged: true, insertedId: upsertedId, matchedCount: targets.length, modifiedCount: modified, upsertedCount: upsertedId ? 1 : 0 };
      },
      updateOne(f, u, o) { return api._update(f, u, o, false); },
      updateMany(f, u, o) { return api._update(f, u, o, true); },
      update() { throw new MongoInvalidArg("update() устарел. Используйте updateOne() или updateMany()"); },
      replaceOne(filter, repl, opts) {
        if (!isObj(repl) || Object.keys(repl).some((k) => k.startsWith("$"))) throw new MongoInvalidArg("Replacement document must not contain atomic operators");
        const coll = Cc();
        const { docs } = matched(filter || {});
        if (docs.length) {
          const d = docs[0]; const nd = Object.assign({ _id: d._id }, clone(repl));
          checkUnique(coll, nd, d);
          Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, nd);
          return { acknowledged: true, insertedId: null, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (opts && opts.upsert) { const r = api.insertOne(repl); return { acknowledged: true, insertedId: r.insertedId, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; }
        return { acknowledged: true, insertedId: null, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      },
      findOneAndUpdate(filter, update, opts = {}) {
        const before = api.findOne(filter);
        api.updateOne(filter, update, opts);
        return opts.returnDocument === "after" || opts.returnNewDocument ? api.findOne(before ? { _id: before._id } : filter) : before;
      },
      findOneAndDelete(filter) { const d = api.findOne(filter); if (d) api.deleteOne({ _id: d._id }); return d; },
      _delete(filter, many) {
        if (filter === undefined) throw new MongoInvalidArg("Укажите фильтр. Чтобы удалить всё: deleteMany({})");
        const coll = C();
        if (!coll) return { acknowledged: true, deletedCount: 0 };
        const { docs } = matched(filter);
        const del = new Set(many ? docs : docs.slice(0, 1));
        coll.docs = coll.docs.filter((d) => !del.has(d));
        return { acknowledged: true, deletedCount: del.size };
      },
      deleteOne(f) { return api._delete(f, false); },
      deleteMany(f) { return api._delete(f, true); },
      remove(f) { return api._delete(f || {}, true); },
      aggregate(pipeline) {
        if (!Array.isArray(pipeline)) pipeline = [...arguments];
        const coll = C();
        const res = runPipeline(sim, dbName, coll ? coll.docs : [], pipeline);
        const cur = { __isCursor: true, _res: res, toArray: () => res.slice(), forEach: (fn) => res.forEach(fn), map: (fn) => res.map(fn), itcount: () => res.length, hasNext: () => res.length > 0, next: () => res.shift(), pretty() { return this; } };
        return cur;
      },
      createIndex(keys, opts = {}) {
        if (!isObj(keys)) throw new MongoInvalidArg("createIndex ожидает объект, например {name: 1}");
        const coll = Cc();
        const iname = opts.name || Object.entries(keys).map(([k, v]) => `${k}_${v}`).join("_");
        if (Object.values(keys).includes("text")) {
          const same = coll.indexes.some((i) => i.name === iname);
          if (coll.textIndex && !same) throw new MongoError("MongoServerError", "An equivalent index already exists with a different name and options. Коллекция может иметь только один текстовый индекс", 85);
          if (!same) coll.textIndex = Object.keys(keys).filter((k) => keys[k] === "text");
        }
        if (!coll.indexes.some((i) => i.name === iname)) {
          const ix = { v: 2, key: clone(keys), name: iname };
          if (opts.unique) {
            ix.unique = true;
            const seen = [];
            for (const d of coll.docs) {
              const val = Object.keys(keys).map((k) => getPath(d, k) ?? null);
              if (seen.some((s) => deepEq(s, val))) throw new MongoError("MongoServerError", `Index build failed: E11000 duplicate key error collection: ${full} index: ${iname}`, 11000);
              seen.push(val);
            }
          }
          coll.indexes.push(ix);
        }
        return iname;
      },
      createIndexes(list) { return list.map((k) => api.createIndex(k)); },
      ensureIndex(k, o) { return api.createIndex(k, o); },
      getIndexes() { const c = C(); return c ? clone(c.indexes) : []; },
      dropIndex(n) {
        const c = C(); if (!c) throw new MongoError("MongoServerError", `ns not found ${full}`, 26);
        const i = c.indexes.findIndex((x) => x.name === n || (isObj(n) && deepEq(x.key, n)));
        if (i < 0) throw new MongoError("MongoServerError", `index not found with name [${n}]`, 27);
        if (c.indexes[i].name === "_id_") throw new MongoError("MongoServerError", "cannot drop _id index", 72);
        if (Object.values(c.indexes[i].key).includes("text")) c.textIndex = null;
        c.indexes.splice(i, 1);
        return { nIndexesWas: c.indexes.length + 1, ok: 1 };
      },
      dropIndexes(which) {
        const c = C(); if (!c) throw new MongoError("MongoServerError", `ns not found ${full}`, 26);
        const was = c.indexes.length;
        if (which === undefined || which === "*") {
          c.indexes = c.indexes.filter((x) => x.name === "_id_"); c.textIndex = null;
          return { nIndexesWas: was, msg: "non-_id indexes dropped for collection", ok: 1 };
        }
        (Array.isArray(which) ? which : [which]).forEach((n) => api.dropIndex(n));
        return { nIndexesWas: was, ok: 1 };
      },
      drop() { if (sim.dbs[dbName] && sim.dbs[dbName][name]) { delete sim.dbs[dbName][name]; return true; } return false; },
      renameCollection(newName) {
        const c = C(); if (!c) throw new MongoError("MongoServerError", "source namespace does not exist", 26);
        if (sim.dbs[dbName][newName]) throw new MongoError("MongoServerError", "target namespace exists", 48);
        sim.dbs[dbName][newName] = c; delete sim.dbs[dbName][name]; return { ok: 1 };
      },
      stats() { const c = C(); const n = c ? c.docs.length : 0; return { ns: full, count: n, size: c ? JSON.stringify(encode(c.docs)).length : 0, nindexes: c ? c.indexes.length : 0, ok: 1 }; },
    };
    return api;
  }
  class MongoInvalidArg extends MongoError { constructor(m) { super("MongoInvalidArgumentError", m); } }

  function applyUpdate(doc, update, isInsert) {
    for (const [op, fields] of Object.entries(update)) {
      if (!isObj(fields)) throw new MongoError("MongoServerError", `Modifiers operate on fields but we found type ${bsonType(fields)} instead. For example: {$mod: {<field>: ...}}`, 9);
      for (const [k, v] of Object.entries(fields)) {
        const cur = getPath(doc, k);
        switch (op) {
          case "$set": setPath(doc, k, clone(v)); break;
          case "$setOnInsert": if (isInsert) setPath(doc, k, clone(v)); break;
          case "$unset": unsetPath(doc, k); break;
          case "$inc":
            if (cur !== undefined && typeof cur !== "number") throw new MongoError("MongoServerError", `Cannot apply $inc to a value of non-numeric type. {_id: ${fmt(doc._id)}} has the field '${k}' of non-numeric type ${bsonType(cur)}`, 14);
            setPath(doc, k, (cur || 0) + v); break;
          case "$mul": setPath(doc, k, (cur || 0) * v); break;
          case "$min": if (cur === undefined || cmp(v, cur) < 0) setPath(doc, k, clone(v)); break;
          case "$max": if (cur === undefined || cmp(v, cur) > 0) setPath(doc, k, clone(v)); break;
          case "$rename": if (cur !== undefined) { unsetPath(doc, k); setPath(doc, v, cur); } break;
          case "$currentDate": setPath(doc, k, new Date()); break;
          case "$push": case "$addToSet": {
            const arr = cur === undefined ? [] : cur;
            if (!Array.isArray(arr)) throw new MongoError("MongoServerError", `The field '${k}' must be an array but is of type ${bsonType(arr)} in document {_id: ${fmt(doc._id)}}`, 2);
            const items = isObj(v) && v.$each ? v.$each : [v];
            for (const it of items) if (op === "$push" || !arr.some((x) => deepEq(x, it))) arr.push(clone(it));
            if (isObj(v) && v.$sort !== undefined) arr.sort((a, b) => (isObj(v.$sort) ? sortDocs([a, b], v.$sort, () => 0)[0] === a ? -1 : 1 : v.$sort * cmp(a, b)));
            if (isObj(v) && v.$slice !== undefined) arr.splice(0, arr.length, ...(v.$slice >= 0 ? arr.slice(0, v.$slice) : arr.slice(v.$slice)));
            setPath(doc, k, arr); break;
          }
          case "$pull": if (Array.isArray(cur)) setPath(doc, k, cur.filter((x) => !(isOpObj(v) ? matchCond([x], v) : isObj(v) && isObj(x) ? matchDoc(x, v) : deepEq(x, v)))); break;
          case "$pullAll": if (Array.isArray(cur)) setPath(doc, k, cur.filter((x) => !v.some((y) => deepEq(x, y)))); break;
          case "$pop": if (Array.isArray(cur)) { if (v === -1) cur.shift(); else cur.pop(); } break;
          default: throw new MongoError("MongoServerError", `Unknown modifier: ${op}. Expected a valid update modifier or pipeline-style update specified as an array`, 9);
        }
      }
    }
  }

  function runPipeline(sim, dbName, docs, pipeline) {
    let cur = docs.map(clone);
    for (const stage of pipeline) {
      if (!isObj(stage) || Object.keys(stage).length !== 1) throw new MongoError("MongoServerError", "A pipeline stage specification object must contain exactly one field.", 40323);
      const op = Object.keys(stage)[0], arg = stage[op];
      switch (op) {
        case "$match": cur = cur.filter((d) => matchDoc(d, arg)); break;
        case "$project": cur = cur.map((d) => project(d, arg)); break;
        case "$addFields": case "$set": cur.forEach((d) => { for (const [k, v] of Object.entries(arg)) setPath(d, k, evalExpr(v, d)); }); break;
        case "$unset": cur.forEach((d) => (Array.isArray(arg) ? arg : [arg]).forEach((k) => unsetPath(d, k))); break;
        case "$group": {
          if (!("_id" in arg)) throw new MongoError("MongoServerError", "a group specification must include an _id", 15955);
          const groups = new Map();
          for (const d of cur) {
            const key = evalExpr(arg._id, d) ?? null;
            const ks = JSON.stringify(encode(key));
            if (!groups.has(ks)) groups.set(ks, { _id: key, docs: [] });
            groups.get(ks).docs.push(d);
          }
          const out = [];
          for (const g of groups.values()) {
            const r = { _id: g._id };
            for (const [field, acc] of Object.entries(arg)) {
              if (field === "_id") continue;
              if (!isObj(acc) || Object.keys(acc).length !== 1) throw new MongoError("MongoServerError", `The field '${field}' must be an accumulator object`, 40234);
              const [aop] = Object.keys(acc); const expr = acc[aop];
              const vals = g.docs.map((d) => evalExpr(expr, d));
              const nums = vals.filter((v) => typeof v === "number");
              switch (aop) {
                case "$sum": r[field] = nums.reduce((t, x) => t + x, 0); break;
                case "$avg": r[field] = nums.length ? nums.reduce((t, x) => t + x, 0) / nums.length : null; break;
                case "$min": { const vs = vals.filter((v) => v != null); r[field] = vs.length ? vs.reduce((m, x) => (cmp(x, m) < 0 ? x : m)) : null; break; }
                case "$max": { const vs = vals.filter((v) => v != null); r[field] = vs.length ? vs.reduce((m, x) => (cmp(x, m) > 0 ? x : m)) : null; break; }
                case "$first": r[field] = vals[0] ?? null; break;
                case "$last": r[field] = vals[vals.length - 1] ?? null; break;
                case "$push": r[field] = vals.filter((v) => v !== undefined); break;
                case "$addToSet": { const s = []; vals.forEach((v) => { if (v !== undefined && !s.some((x) => deepEq(x, v))) s.push(v); }); r[field] = s; break; }
                case "$count": r[field] = g.docs.length; break;
                case "$stdDevPop": case "$stdDevSamp": { const n = nums.length; const m = nums.reduce((t, x) => t + x, 0) / (n || 1); const ss = nums.reduce((t, x) => t + (x - m) ** 2, 0); r[field] = n ? Math.sqrt(ss / (aop === "$stdDevPop" ? n : Math.max(1, n - 1))) : null; break; }
                default: throw new MongoError("MongoServerError", `unknown group operator '${aop}'`, 15952);
              }
            }
            out.push(r);
          }
          cur = out; break;
        }
        case "$sort": cur = sortDocs(cur, arg, () => 0); break;
        case "$limit": cur = cur.slice(0, arg); break;
        case "$skip": cur = cur.slice(arg); break;
        case "$count": cur = [{ [arg]: cur.length }]; break;
        case "$sortByCount": {
          const m = new Map();
          for (const d of cur) { const k = evalExpr(arg, d) ?? null; const ks = JSON.stringify(encode(k)); if (!m.has(ks)) m.set(ks, { _id: k, count: 0 }); m.get(ks).count++; }
          cur = [...m.values()].sort((a, b) => b.count - a.count); break;
        }
        case "$unwind": {
          const spec = typeof arg === "string" ? { path: arg } : arg;
          const path = spec.path.replace(/^\$/, "");
          const out = [];
          for (const d of cur) {
            const v = getPath(d, path);
            if (Array.isArray(v) && v.length) v.forEach((x, i) => { const c = clone(d); setPath(c, path, clone(x)); if (spec.includeArrayIndex) c[spec.includeArrayIndex] = i; out.push(c); });
            else if (spec.preserveNullAndEmptyArrays) { const c = clone(d); if (Array.isArray(v)) unsetPath(c, path); out.push(c); }
            else if (v !== undefined && v !== null && !Array.isArray(v)) out.push(d);
          }
          cur = out; break;
        }
        case "$lookup": {
          const other = sim._coll(dbName, arg.from, false);
          const foreign = other ? other.docs : [];
          cur.forEach((d) => {
            const lv = getPathValues(d, arg.localField);
            const lex = expand(lv.length ? lv : [null]);
            d[arg.as] = foreign.filter((f) => { const fv = getPathValues(f, arg.foreignField); const fex = expand(fv.length ? fv : [null]); return fex.some((x) => lex.some((y) => deepEq(x ?? null, y ?? null))); }).map(clone);
          });
          break;
        }
        case "$sample": { const a = cur.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } cur = a.slice(0, arg.size); break; }
        case "$replaceRoot": case "$replaceWith": cur = cur.map((d) => evalExpr(op === "$replaceRoot" ? arg.newRoot : arg, d)); break;
        case "$out": {
          const name = typeof arg === "string" ? arg : arg.coll;
          const coll = sim._coll(dbName, name, true);
          coll.docs = cur.map((d) => (d._id === undefined ? Object.assign({ _id: new ObjectId() }, d) : clone(d)));
          cur = []; break;
        }
        default: throw new MongoError("MongoServerError", `Unrecognized pipeline stage name: '${op}'`, 40324);
      }
    }
    return cur;
  }

  // ------------------------------------------------------------------ разбор скрипта
  const SPECIAL = /^\s*(use\s+\S+|show\s+\w+|it|mongoimport\b.*|exit|quit|cls|help)\s*;?\s*$/;
  function splitStatements(src) {
    const stmts = [];
    let cur = "", depth = 0, i = 0, str = null, prevSig = "";
    const push = () => { if (cur.trim()) stmts.push({ text: cur.trim() }); cur = ""; };
    const lines = () => src.slice(i).split("\n")[0];
    while (i < src.length) {
      const ch = src[i];
      if (!cur.trim() && depth === 0 && !str) {
        const line = lines();
        if (SPECIAL.test(line) && !/^\s*(it|exit|quit|cls|help)\s*\(/.test(line)) {
          stmts.push({ text: line.trim().replace(/;$/, ""), special: true });
          i += line.length; continue;
        }
      }
      if (str) {
        cur += ch;
        if (ch === "\\") { cur += src[i + 1] || ""; i += 2; continue; }
        if (ch === str) str = null;
        i++; continue;
      }
      if (ch === "/" && src[i + 1] === "/") { const end = src.indexOf("\n", i); i = end < 0 ? src.length : end; continue; }
      if (ch === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i + 2); i = end < 0 ? src.length : end + 2; continue; }
      if (ch === "/" && (prevSig === "" || "(,=:[!&|?{};".includes(prevSig))) {
        let j = i + 1, inClass = false;
        while (j < src.length && src[j] !== "\n") {
          if (src[j] === "\\") { j += 2; continue; }
          if (src[j] === "[") inClass = true; else if (src[j] === "]") inClass = false;
          else if (src[j] === "/" && !inClass) break;
          j++;
        }
        j++;
        while (j < src.length && /[gimsuy]/.test(src[j])) j++;
        cur += src.slice(i, j); i = j; prevSig = "/"; continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { str = ch; cur += ch; i++; prevSig = ch; continue; }
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) depth--;
      if (ch === ";" && depth === 0) { push(); i++; prevSig = ";"; continue; }
      if (ch === "\n" && depth <= 0) {
        const rest = src.slice(i + 1);
        const nextTok = rest.match(/^\s*(\S)/);
        const trimmed = cur.trimEnd();
        const cont = (nextTok && ".)]}".includes(nextTok[1]) && !/^\s*\.\.\./.test(rest)) || /[+\-*/,=&|?:(\[{]$/.test(trimmed);
        if (!cont) { push(); i++; prevSig = ""; continue; }
      }
      cur += ch;
      if (!/\s/.test(ch)) prevSig = ch;
      i++;
    }
    push();
    return stmts;
  }

  // ------------------------------------------------------------------ выполнение
  function makeDb(sim, name, out, fixed) {
    const getName = () => (fixed ? name : sim.current);
    const methods = {
      getName: () => getName(),
      toString: () => getName(),
      getCollectionNames: () => Object.keys(sim.dbs[getName()] || {}).sort(),
      getCollectionInfos: () => Object.keys(sim.dbs[getName()] || {}).sort().map((n) => ({ name: n, type: "collection" })),
      createCollection: (n) => {
        if (sim._coll(getName(), n, false)) throw new MongoError("MongoServerError", `Collection ${getName()}.${n} already exists`, 48);
        sim._coll(getName(), n, true); return { ok: 1 };
      },
      getCollection: (n) => makeCollection(sim, getName(), n, out),
      getSiblingDB: (n) => makeDb(sim, n, out, true),
      dropDatabase: () => { const n = getName(); const had = !!sim.dbs[n]; delete sim.dbs[n]; return had ? { ok: 1, dropped: n } : { ok: 1 }; },
      stats: () => {
        const d = sim.dbs[getName()] || {};
        const objects = Object.values(d).reduce((t, c) => t + c.docs.length, 0);
        return { db: getName(), collections: Object.keys(d).length, views: 0, objects, dataSize: JSON.stringify(encode(d)).length, indexes: Object.values(d).reduce((t, c) => t + c.indexes.length, 0), ok: 1 };
      },
      version: () => "7.0.14 (учебный эмулятор)",
      getMongo: () => "mongodb://127.0.0.1:27017/",
    };
    return new Proxy({}, {
      get(_, prop) {
        if (prop === "__isDb") return true;
        if (typeof prop === "symbol") return undefined;
        if (prop in methods) return methods[prop];
        if (prop === "then") return undefined;
        return makeCollection(sim, getName(), prop, out);
      },
    });
  }

  function runScript(sim, src, opts = {}) {
    const out = [];
    const results = [];
    const print = (...a) => out.push({ type: "text", data: a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" ") });
    const printjson = (x) => out.push({ type: "text", data: fmt(x) });
    const showValue = (v) => {
      if (v === undefined) return;
      if (v && v.__isDb) { out.push({ type: "text", data: v.getName() }); return; }
      if (v && v.__isCollection) { out.push({ type: "text", data: v.getFullName() }); return; }
      if (v && v.__isCursor) {
        const arr = typeof v._exec === "function" ? v._exec() : v._res;
        const page = arr.slice(0, 20);
        sim.lastCursor = { arr, pos: 20 };
        results.push(arr.map(clone));
        if (!arr.length) return;
        out.push({ type: "text", data: fmt(page) });
        if (arr.length > 20) out.push({ type: "muted", data: 'Type "it" for more' });
        return;
      }
      results.push(clone(v));
      out.push({ type: "text", data: fmt(v) });
    };
    const special = (line) => {
      const t = line.trim();
      let m;
      if ((m = t.match(/^use\s+(\S+)$/))) {
        const n = m[1].replace(/;$/, "");
        if (!/^[A-Za-z0-9_-]{1,63}$/.test(n)) throw new MongoError("MongoInvalidArgumentError", "Недопустимое имя базы данных");
        if (sim.current === n) { out.push({ type: "text", data: `already on db ${n}` }); }
        else { sim.current = n; out.push({ type: "text", data: `switched to db ${n}` }); }
        results.push({ use: n });
      } else if (/^show\s+(dbs|databases)$/.test(t)) {
        const list = sim.listDbs();
        const w = Math.max(...list.map((x) => x[0].length)) + 2;
        out.push({ type: "text", data: list.map(([n, s]) => n.padEnd(w) + s.padStart(10)).join("\n") });
        results.push(list.map((x) => x[0]));
      } else if (/^show\s+(collections|tables)$/.test(t)) {
        const names = Object.keys(sim.dbs[sim.current] || {}).sort();
        if (names.length) out.push({ type: "text", data: names.join("\n") });
        results.push(names);
      } else if (t === "it") {
        if (!sim.lastCursor || sim.lastCursor.pos >= sim.lastCursor.arr.length) { out.push({ type: "text", data: "no cursor" }); return; }
        const { arr, pos } = sim.lastCursor;
        out.push({ type: "text", data: fmt(arr.slice(pos, pos + 20)) });
        sim.lastCursor.pos += 20;
        if (sim.lastCursor.pos < arr.length) out.push({ type: "muted", data: 'Type "it" for more' });
      } else if (t.startsWith("mongoimport")) {
        const arg = (name) => { const r = new RegExp(`--${name}[ =]("[^"]+"|\\S+)`); const mm = t.match(r); return mm ? mm[1].replace(/"/g, "") : null; };
        const dbn = arg("db") || arg("d") || "test";
        const coll = arg("collection") || arg("c");
        const file = arg("file");
        if (!coll || !file) throw new MongoError("Failed", "mongoimport: укажите --collection и --file");
        const data = (opts.files || {})[file];
        if (!data) throw new MongoError("Failed", `open ${file}: no such file or directory`);
        let docs;
        try {
          if (/--jsonArray/.test(t)) docs = JSON.parse(data);
          else docs = data.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
        } catch (e) {
          throw new MongoError("Failed", /--jsonArray/.test(t) ? "error reading JSON: " + e.message : "cannot decode array into a primitive.D (файл содержит JSON-массив — добавьте флаг --jsonArray)");
        }
        if (/--drop/.test(t) && sim.dbs[dbn]) delete sim.dbs[dbn][coll];
        const c = sim._coll(dbn, coll, true);
        let ok = 0;
        for (const d of docs) { let doc = decode(d); if (doc._id === undefined) doc = Object.assign({ _id: new ObjectId() }, doc); c.docs.push(doc); ok++; }
        const ts = new Date().toISOString().replace("Z", "+0500");
        out.push({ type: "muted", data: `${ts}\tconnected to: mongodb://localhost/\n${ts}\t${ok} document(s) imported successfully. 0 document(s) failed to import.` });
        results.push({ imported: ok, db: dbn, coll });
      } else if (t === "cls") {
        out.length = 0;
      } else if (t === "help") {
        out.push({ type: "text", data: "Команды: use <db>, show dbs, show collections, db.<коллекция>.insertOne({...}), find({...}), updateOne, deleteOne, aggregate([...]), createIndex({...}), it" });
      } else {
        out.push({ type: "muted", data: "(команда пропущена в тренажёре)" });
      }
    };

    const stmts = splitStatements(src);
    const body = stmts.map((s) => {
      if (s.special) return `__special(${JSON.stringify(s.text)});`;
      const t = s.text.replace(/;\s*$/, "");
      if (!t) return "";
      if (/^(var|let|const|function|if|for|while|do|switch|try|class|return|throw|async)\b/.test(t)) return t + ";";
      if (/^(print|printjson|console\.(log|info))\s*\(/.test(t)) return t + ";";
      return `__show((${t}));`;
    }).join("\n");
    let error = null;
    try {
      const fn = new Function("db", "ObjectId", "ISODate", "print", "printjson", "__show", "__special", "console", "NumberInt", "NumberLong", "NumberDecimal", "sleep", body);
      const cons = { log: print, info: print, warn: print, error: print };
      const numf = (x) => Number(x);
      fn(makeDb(sim, sim.current, out, false), ObjectIdShell, ISODate, print, printjson, showValue, special, cons, numf, numf, numf, () => {});
    } catch (e) {
      let msg;
      if (e instanceof MongoError) msg = `${e.kind}: ${e.message}`;
      else if (e instanceof SyntaxError) msg = `SyntaxError: ${e.message}. Проверьте скобки { } [ ] ( ), запятые и кавычки.`;
      else if (e instanceof TypeError && /is not a function/.test(e.message)) msg = `TypeError: ${e.message}. Проверьте имя метода (например, insertOne, find, updateOne).`;
      else if (e instanceof ReferenceError) msg = `ReferenceError: ${e.message}. Строки берите в кавычки: 'Toshkent'.`;
      else msg = `${e.name || "Error"}: ${e.message}`;
      out.push({ type: "error", data: msg });
      error = msg;
    }
    sim.save();
    return { items: out, results, error };
  }

  // Предзагрузка файлов для mongoimport
  async function prefetch(src, base) {
    const files = {};
    for (const m of src.matchAll(/mongoimport[^\n]*--file[ =]("[^"]+"|\S+)/g)) {
      const f = m[1].replace(/"/g, "");
      try { const r = await fetch(base + f); if (r.ok) files[f] = await r.text(); } catch (e) { /* нет файла */ }
    }
    return files;
  }

  const sim = new MongoSim();
  window.Mongo = {
    sim, ObjectId, fmt, matchDoc, splitStatements,
    async run(src) {
      const base = new URL(".", location.href).href;
      const files = await prefetch(src, base);
      return runScript(sim, src, { files });
    },
    reset() { sim.reset(); },
    ensureFixtures(list) { return sim.ensureFixtures(list, new URL(".", location.href).href); },
    summary() {
      return Object.keys(sim.dbs).sort().map((d) => ({ db: d, colls: Object.keys(sim.dbs[d]).sort().map((c) => ({ name: c, count: sim.dbs[d][c].docs.length, indexes: sim.dbs[d][c].indexes.length })) }));
    },
  };
})();
