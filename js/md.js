/* Мини-Markdown для текстов заданий: заголовки, списки, код, таблицы, цитаты/выноски, ссылки. */
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`);
    s = s.replace(/\*\*(?!\s)(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/(^|\W)_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
    return s;
  }

  function render(src) {
    if (!src) return "";
    const lines = src.replace(/\r/g, "").split("\n");
    // общий отступ (из-за шаблонных строк в JS)
    const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    const L = lines.map((l) => l.slice(Number.isFinite(ind) ? ind : 0));
    let html = "", i = 0;
    while (i < L.length) {
      const line = L[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = line.match(/^```(\w*)\s*(.*)$/))) {
        const lang = m[1], title = m[2];
        const buf = [];
        i++;
        while (i < L.length && !/^```\s*$/.test(L[i])) buf.push(L[i++]);
        i++;
        html += `<div class="md-code">${title ? `<div class="md-code-title">${esc(title)}</div>` : ""}<button class="copy-btn" title="Копировать">⧉</button><pre><code class="lang-${lang}">${esc(buf.join("\n"))}</code></pre></div>`;
        continue;
      }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        const lvl = m[1].length + 1;
        html += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
        i++; continue;
      }
      if (/^---+\s*$/.test(line)) { html += "<hr>"; i++; continue; }
      if (/^\s*</.test(line) && !/^\s*<(https?:)/.test(line)) {
        const buf = [];
        while (i < L.length && L[i].trim()) buf.push(L[i++]);
        html += buf.join("\n");
        continue;
      }
      if (/^>/.test(line)) {
        const buf = [];
        while (i < L.length && /^>/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, ""));
        let cls = "note", title = "";
        const t = buf[0] && buf[0].match(/^\[!(NOTE|TIP|WARNING|IMPORTANT|INFO)\]\s*(.*)$/i);
        if (t) {
          cls = t[1].toLowerCase(); title = t[2]; buf.shift();
        }
        const names = { note: "Заметка", tip: "Совет", warning: "Внимание", important: "Важно", info: "Справка" };
        html += `<div class="callout callout-${cls}"><div class="callout-title">${inline(title || names[cls])}</div>${render(buf.join("\n"))}</div>`;
        continue;
      }
      if (/^\|/.test(line)) {
        const rows = [];
        while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const hasHead = rows[1] && /^\|?\s*:?-{2,}/.test(rows[1]);
        let t = '<div class="table-wrap"><table>';
        if (hasHead) {
          t += "<thead><tr>" + cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>";
          rows.splice(0, 2);
        }
        t += "<tbody>" + rows.map((r) => "<tr>" + cells(r).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
        html += t;
        continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < L.length && (/^\s*([-*]|\d+\.)\s+/.test(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) {
          const l = L[i];
          if (/^\s{2,}([-*]|\d+\.)\s+/.test(l) && items.length) items[items.length - 1].sub.push(l.trim());
          else if (/^\s{2,}\S/.test(l) && !/^\s*([-*]|\d+\.)\s+/.test(l)) items[items.length - 1].text += " " + l.trim();
          else items.push({ text: l.replace(/^\s*([-*]|\d+\.)\s+/, ""), sub: [] });
          i++;
        }
        const tag = ordered ? "ol" : "ul";
        html += `<${tag}>` + items.map((it) => `<li>${inline(it.text)}${it.sub.length ? render(it.sub.join("\n")) : ""}</li>`).join("") + `</${tag}>`;
        continue;
      }
      const buf = [];
      while (i < L.length && L[i].trim() && !/^(```|#{1,4}\s|>|\||\s*([-*]|\d+\.)\s+|---+\s*$)/.test(L[i])) buf.push(L[i++]);
      html += `<p>${inline(buf.join(" "))}</p>`;
    }
    return html;
  }

  window.MD = { render, inline, esc };
})();
