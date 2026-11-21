/* Реестр занятий. Каждый файл content/*.js вызывает BDT.register({...}). */
window.BDT = {
  sessions: [],
  register(s) {
    if (this.sessions.some((x) => x.id === s.id)) console.warn("Повтор id занятия:", s.id);
    s.tasks = s.tasks || [];
    s.quiz = s.quiz || [];
    this.sessions.push(s);
  },
  get(id) { return this.sessions.find((s) => s.id === id); },
  ordered() {
    const key = (s) => (s.kind === "lab" ? 0 : 1) * 100 + s.num;
    return this.sessions.slice().sort((a, b) => key(a) - key(b));
  },
};
window.BDT_CONFIG = window.BDT_CONFIG || {};

/* Тег для текстов заданий: R`...` сохраняет обратные слэши как есть
 * (код Python пишется без двойного экранирования: "\n", r"\w+"),
 * а \` превращает в обычный обратный апостроф (для `кода` в Markdown). */
window.R = function (strings, ...vals) {
  return String.raw(strings, ...vals).replace(/\\`/g, "`");
};
