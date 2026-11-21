/* Управление фоновым Python (Pyodide в Web Worker). */
(function () {
  class PyRunner {
    constructor() {
      this.worker = null;
      this.readyPromise = null;
      this.state = "idle"; // idle | loading | ready | busy | error
      this.text = "Python не запущен";
      this.listeners = new Set();
      this.pending = new Map();
      this.seq = 0;
      this.base = new URL(".", location.href).href;
    }

    onStatus(fn) { this.listeners.add(fn); fn(this.state, this.text); return () => this.listeners.delete(fn); }

    _emit(state, text) {
      this.state = state; this.text = text;
      this.listeners.forEach((fn) => { try { fn(state, text); } catch (e) { console.error(e); } });
    }

    start() {
      if (this.readyPromise) return this.readyPromise;
      this.worker = new Worker(this.base + "js/py-worker.js?v=" + (window.BDT_VERSION || "0"));
      this._emit("loading", "Загрузка Python…");
      this.readyPromise = new Promise((resolve, reject) => {
        this.worker.onmessage = (ev) => {
          const m = ev.data;
          if (m.type === "status") this._emit(m.state === "ready" ? "ready" : m.state, m.text);
          else if (m.type === "ready") { this._emit("ready", "Python готов"); resolve(); }
          else if (m.type === "init-error") { this._emit("error", "Не удалось загрузить Python: " + m.message); reject(new Error(m.message)); }
          else if (m.type === "result" || m.type === "files") {
            const p = this.pending.get(m.id);
            if (p) { this.pending.delete(m.id); p.resolve(m.type === "files" ? m.files : m.result); }
          }
        };
        this.worker.onerror = (e) => {
          this._emit("error", "Ошибка Python: " + (e.message || "см. консоль"));
          reject(e);
        };
        this.worker.postMessage({ type: "init", base: this.base });
      });
      this.readyPromise.catch(() => { this.readyPromise = null; });
      return this.readyPromise;
    }

    async run({ setup = "", code = "", check = "", vars = {} }) {
      await this.start();
      const id = ++this.seq;
      return new Promise((resolve) => {
        this.pending.set(id, { resolve });
        this.worker.postMessage({ type: "run", id, setup, code, check, vars });
      });
    }

    async files(path = "data") {
      await this.start();
      const id = ++this.seq;
      return new Promise((resolve) => {
        this.pending.set(id, { resolve });
        this.worker.postMessage({ type: "files", id, path });
      });
    }

    /* Прервать выполнение: завершаем worker и создаём новый при следующем запуске. */
    restart() {
      if (this.worker) this.worker.terminate();
      this.worker = null;
      this.readyPromise = null;
      for (const [, p] of this.pending) {
        p.resolve({ ok: false, items: [], checks: [], error: { name: "Остановлено", message: "Выполнение прервано, Python перезапускается.", trace: "", hint: "Переменные и созданные файлы сброшены." } });
      }
      this.pending.clear();
      this._emit("idle", "Python перезапущен");
      return this.start();
    }

    get busy() { return this.pending.size > 0; }
  }

  window.Py = new PyRunner();
})();
