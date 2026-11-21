# -*- coding: utf-8 -*-
"""Среда выполнения тренажёра (работает внутри Pyodide).

run_cell(setup, code, check, ctx) выполняет код студента как ячейку Jupyter:
- печать (print) и значение последнего выражения выводятся;
- DataFrame показывается таблицей;
- графики matplotlib превращаются в картинки;
- затем выполняются проверки (check) из описания задания.
"""
import ast, base64, io, json, sys, traceback, types

MAX_TEXT = 60000


class Output:
    def __init__(self):
        self.items = []

    def _text(self, s, kind="text"):
        if not s:
            return
        if self.items and self.items[-1]["type"] == kind:
            self.items[-1]["data"] += s
        else:
            self.items.append({"type": kind, "data": s})

    def display(self, *objs):
        for obj in objs:
            if obj is None:
                continue
            html = None
            if hasattr(obj, "_repr_html_"):
                try:
                    html = obj._repr_html_()
                except Exception:
                    html = None
            if html:
                self.items.append({"type": "html", "data": html})
            elif _is_figure(obj):
                _emit_figure(self, obj)
            else:
                self._text(repr(obj) + "\n")

    def text(self):
        return "".join(i["data"] for i in self.items if i["type"] == "text")


class _Stream(io.TextIOBase):
    def __init__(self, out, kind):
        self.out, self.kind = out, kind

    def write(self, s):
        self.out._text(s, self.kind)
        return len(s)

    def writable(self):
        return True


def _is_figure(obj):
    mpl = sys.modules.get("matplotlib.figure")
    return bool(mpl) and isinstance(obj, mpl.Figure)


def _is_mpl_obj(val):
    """Объекты matplotlib (Axes, Line2D, …) не печатаем — их покажет картинка."""
    probe = val[0] if isinstance(val, (list, tuple)) and val else val
    mod = type(probe).__module__ or ""
    return mod.startswith(("matplotlib", "seaborn", "wordcloud"))


def _emit_figure(out, fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=96, bbox_inches="tight")
    out.items.append({"type": "image", "data": base64.b64encode(buf.getvalue()).decode()})


_state = {"shown": [], "out": None}


def _patched_show(*args, **kwargs):
    import matplotlib.pyplot as plt
    for num in plt.get_fignums():
        fig = plt.figure(num)
        if _state["out"] is not None:
            _emit_figure(_state["out"], fig)
        _state["shown"].append(fig)
    plt.close("all")


def _prepare_matplotlib():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.show = _patched_show
    plt.close("all")


HINTS = {
    "NameError": "Имя не определено: проверьте написание переменной/функции или создайте её раньше.",
    "FileNotFoundError": "Файл не найден: проверьте путь. Учебные данные лежат в папке data/ (например, data/students.csv).",
    "KeyError": "Нет такого ключа или столбца: посмотрите доступные имена (например, df.columns).",
    "SyntaxError": "Синтаксическая ошибка: проверьте скобки, кавычки, двоеточия.",
    "IndentationError": "Ошибка отступов: в Python блоки выделяются одинаковым отступом (4 пробела).",
    "ModuleNotFoundError": "Модуль недоступен в браузерной версии Python. Используйте библиотеки из задания.",
    "AttributeError": "У объекта нет такого атрибута/метода: проверьте название и тип объекта (type(x)).",
    "TypeError": "Неверный тип данных: проверьте, что передаёте в функцию (число, строку, список…).",
    "ValueError": "Неподходящее значение: проверьте формат данных.",
    "ZeroDivisionError": "Деление на ноль.",
    "IndexError": "Индекс вне диапазона: проверьте длину списка/строки.",
    "UnicodeDecodeError": "Ошибка кодировки: попробуйте encoding='utf-8'.",
}


def _format_exc(e, label="<cell>"):
    tb = traceback.extract_tb(e.__traceback__)
    frames = [f for f in tb if f.filename in (label, "<setup>")] or tb[-1:]
    lines = []
    for f in frames[-3:]:
        where = "ваш код" if f.filename == "<cell>" else f.filename
        lines.append(f"  строка {f.lineno} ({where}): {f.line or ''}")
    name = type(e).__name__
    if isinstance(e, SyntaxError):
        msg = f"{name}: {e.msg} (строка {e.lineno})"
        if e.text:
            msg += "\n    " + e.text.rstrip() + "\n    " + " " * max(0, (e.offset or 1) - 1) + "^"
    else:
        msg = f"{name}: {e}"
    hint = HINTS.get(name, "")
    return {"name": name, "message": msg, "trace": "\n".join(lines), "hint": hint}


class CheckFail(Exception):
    pass


def _needs_mpl(src):
    return any(k in src for k in ("matplotlib", "seaborn", "wordcloud", ".plot(", ".hist(", "plt."))


def run_cell(setup, code, check, ctx_json="{}"):
    ctx = json.loads(ctx_json or "{}")
    out = Output()
    _state["out"] = out
    _state["shown"] = []
    ns = {"__name__": "__main__", "display": out.display}
    ns.update(ctx.get("vars", {}))
    result = {"ok": None, "error": None, "checks": [], "items": []}
    all_src = (setup or "") + "\n" + (code or "") + "\n" + (check or "")
    if _needs_mpl(all_src):
        _prepare_matplotlib()
    old = sys.stdout, sys.stderr
    try:
        if setup:
            sys.stdout = sys.stderr = io.StringIO()
            try:
                exec(compile(setup, "<setup>", "exec"), ns)
            except Exception as e:
                result["error"] = _format_exc(e, "<setup>")
                result["error"]["hint"] = "Ошибка в подготовительном коде задания (сообщите преподавателю)."
        if not result["error"]:
            sys.stdout = _Stream(out, "text")
            sys.stderr = _Stream(out, "stderr")
            try:
                tree = ast.parse(code or "", "<cell>")
                last = None
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = tree.body.pop()
                exec(compile(tree, "<cell>", "exec"), ns)
                if last is not None:
                    val = eval(compile(ast.Expression(last.value), "<cell>", "eval"), ns)
                    if val is not None and not _is_mpl_obj(val):
                        out.display(val)
                    ns["_"] = val
            except KeyboardInterrupt:
                result["error"] = {"name": "KeyboardInterrupt", "message": "Выполнение прервано", "trace": "", "hint": ""}
            except BaseException as e:
                if isinstance(e, SystemExit):
                    pass
                else:
                    result["error"] = _format_exc(e)
    finally:
        sys.stdout, sys.stderr = old

    figs = list(_state["shown"])
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        for num in plt.get_fignums():
            fig = plt.figure(num)
            figs.append(fig)
            _emit_figure(out, fig)

    if check and not result["error"]:
        checks = []

        def ok(cond, msg):
            checks.append({"ok": bool(cond), "msg": str(msg)})
            return bool(cond)

        def var(name, typ=None):
            if name not in ns:
                raise CheckFail(f"Не найдена переменная «{name}». Создайте её в своём коде.")
            v = ns[name]
            if typ is not None and not isinstance(v, typ):
                tn = typ.__name__ if isinstance(typ, type) else str(typ)
                raise CheckFail(f"Переменная «{name}» должна иметь тип {tn}, а сейчас {type(v).__name__}.")
            return v

        def uses(*subs):
            return all(s in (code or "") for s in subs)

        cns = {"ns": ns, "out": out.text(), "code": code or "", "figs": figs, "ok": ok, "check": ok,
               "var": var, "uses": uses, "CheckFail": CheckFail}
        try:
            exec(compile(check, "<check>", "exec"), cns)
        except CheckFail as e:
            checks.append({"ok": False, "msg": str(e)})
        except AssertionError as e:
            checks.append({"ok": False, "msg": str(e) or "Проверка не пройдена"})
        except Exception as e:
            checks.append({"ok": False, "msg": f"Проверка не смогла выполниться: {type(e).__name__}: {e}"})
        result["checks"] = checks
        result["ok"] = bool(checks) and all(c["ok"] for c in checks)
    elif check:
        result["ok"] = False

    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        plt.close("all")
    _state["out"] = None
    items = out.items
    total = 0
    for it in items:
        if it["type"] in ("text", "stderr") and len(it["data"]) > MAX_TEXT:
            it["data"] = it["data"][:MAX_TEXT] + "\n… (вывод обрезан)"
        total += len(it["data"])
    result["items"] = items
    return json.dumps(result, ensure_ascii=False, default=str)
