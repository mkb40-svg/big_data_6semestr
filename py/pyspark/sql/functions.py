# -*- coding: utf-8 -*-
"""pyspark.sql.functions — учебный эмулятор (основные функции)."""
import builtins as _b
import datetime as _dt
import math as _math
import re as _re

import numpy as _np
import pandas as _pd

from .column import Column, _c, _colref, _litcol, _isnull, _py, _tidy, _bool, _cast_series
from .types import (StringType, IntegerType, LongType, DoubleType, BooleanType, DateType, TimestampType, ArrayType,
                    _parse_type, DataType)


# ------------------------------------------------------------------ базовые
def col(name):
    return _colref(name)


column = col


def lit(value):
    return _litcol(value)


def expr(sql):
    """SQL-выражение над строками DataFrame (выполняется через SQLite)."""
    s = sql.strip()
    if _re.fullmatch(r"[A-Za-z_][\w.]*", s):
        return col(s)

    def fn(pdf):
        from .session import _sql_rowwise
        return _sql_rowwise(pdf, s)
    return Column(fn, s)


def _map(c, f, name, dtype=None):
    c = _c(c)
    if c._is_agg:
        return Column(None, name, agg=lambda g: (lambda v: None if _isnull(v) else f(v))(c._scalar(g)), dtype=dtype)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: None if _isnull(v) else f(v)).pipe(_tidy), name, dtype=dtype)


# ------------------------------------------------------------------ агрегаты
def _agg(kind, c, name, func, dtype=None):
    inner = None if c is None else _c(c)

    def aggf(g):
        s = inner._eval(g) if inner is not None else None
        return _py(func(g, s))
    col_ = Column(None, name, agg=aggf, dtype=dtype)
    col_._agg_kind = kind
    col_._agg_inner = inner
    return col_


def count(c):
    if isinstance(c, str) and c == "*" or (isinstance(c, Column) and c._ref == "*") or (not isinstance(c, (str, Column))):
        col_ = _agg("count", None, "count(1)", lambda g, s: len(g), LongType())
        col_._nonnull = True
        return col_
    c = _c(c)
    col_ = _agg("count", c, f"count({c._name})", lambda g, s: int(s.notna().sum()), LongType())
    col_._nonnull = True
    return col_


def _num(s):
    return _pd.to_numeric(s, errors="coerce")


def sum(c):
    c = _c(c)
    return _agg("sum", c, f"sum({c._name})", lambda g, s: _num(s).sum(min_count=1))


def avg(c):
    c = _c(c)
    return _agg("avg", c, f"avg({c._name})", lambda g, s: _num(s).mean(), DoubleType())


mean = avg


def max(c):
    c = _c(c)
    return _agg("max", c, f"max({c._name})", lambda g, s: s.dropna().max() if s.notna().any() else None)


def min(c):
    c = _c(c)
    return _agg("min", c, f"min({c._name})", lambda g, s: s.dropna().min() if s.notna().any() else None)


def countDistinct(c, *cols):
    if cols:
        allc = [_c(x) for x in (c,) + cols]
        name = "count(DISTINCT " + ", ".join(x._name for x in allc) + ")"

        def f(g, s):
            frame = _pd.concat([x._eval(g).rename(i) for i, x in enumerate(allc)], axis=1).dropna()
            return len(frame.drop_duplicates())
        return _agg("countDistinct", None, name, f, LongType())
    c = _c(c)
    return _agg("countDistinct", c, f"count(DISTINCT {c._name})", lambda g, s: int(s.dropna().nunique()), LongType())


count_distinct = countDistinct


def approx_count_distinct(c, rsd=None):
    c = _c(c)
    return _agg("countDistinct", c, f"approx_count_distinct({c._name})", lambda g, s: int(s.dropna().nunique()), LongType())


def first(c, ignorenulls=False):
    c = _c(c)
    return _agg("first", c, f"first({c._name})", lambda g, s: (s.dropna() if ignorenulls else s).iloc[0] if len(s.dropna() if ignorenulls else s) else None)


def last(c, ignorenulls=False):
    c = _c(c)
    return _agg("last", c, f"last({c._name})", lambda g, s: (s.dropna() if ignorenulls else s).iloc[-1] if len(s.dropna() if ignorenulls else s) else None)


def collect_list(c):
    c = _c(c)
    return _agg("collect_list", c, f"collect_list({c._name})", lambda g, s: [_py(v) for v in s if not _isnull(v)])


def collect_set(c):
    c = _c(c)
    return _agg("collect_set", c, f"collect_set({c._name})", lambda g, s: list(dict.fromkeys(_py(v) for v in s if not _isnull(v))))


def stddev(c):
    c = _c(c)
    return _agg("stddev", c, f"stddev({c._name})", lambda g, s: _num(s).std(ddof=1), DoubleType())


stddev_samp = stddev
std = stddev


def variance(c):
    c = _c(c)
    return _agg("variance", c, f"variance({c._name})", lambda g, s: _num(s).var(ddof=1), DoubleType())


var_samp = variance


def sum_distinct(c):
    c = _c(c)
    return _agg("sum", c, f"sum(DISTINCT {c._name})", lambda g, s: _num(s.dropna().drop_duplicates()).sum(min_count=1))


sumDistinct = sum_distinct


# ------------------------------------------------------------------ условия и null
def when(condition, value):
    from .column import _build_when
    c = Column()
    c._when = ([(condition, _litcol(value))], None)
    return _build_when(c)


def coalesce(*cols):
    cs = [_c(x) for x in cols]

    def fn(pdf):
        res = cs[0]._eval(pdf).astype(object)
        for x in cs[1:]:
            res = res.where(res.notna(), x._eval(pdf).astype(object))
        return _tidy(res)
    return Column(fn, "coalesce(" + ", ".join(x._name for x in cs) + ")")


def isnull(c):
    return _c(c).isNull()


def isnan(c):
    c = _c(c)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: isinstance(v, float) and _math.isnan(v)), f"isnan({c._name})",
                  dtype=BooleanType())


def nanvl(c1, c2):
    return coalesce(c1, c2)


# ------------------------------------------------------------------ числа
def _half_up(v, scale):
    f = 10 ** scale
    return _math.copysign(_math.floor(_b.abs(v) * f + 0.5 + 1e-9) / f, v)


def round(c, scale=0):
    c = _c(c)
    return _map(c, lambda v: _half_up(float(v), scale) if scale > 0 else float(_half_up(float(v), 0)) if isinstance(v, float) else v,
                f"round({c._name}, {scale})")


def bround(c, scale=0):
    c = _c(c)
    return _map(c, lambda v: _b.round(float(v), scale), f"bround({c._name}, {scale})")


def abs(c):
    c = _c(c)
    return _map(c, lambda v: _b.abs(v), f"abs({c._name})")


def sqrt(c):
    c = _c(c)
    return _map(c, lambda v: _math.sqrt(v) if v >= 0 else None, f"SQRT({c._name})", DoubleType())


def exp(c):
    c = _c(c)
    return _map(c, _math.exp, f"EXP({c._name})", DoubleType())


def log(arg1, arg2=None):
    if arg2 is None:
        c = _c(arg1)
        return _map(c, lambda v: _math.log(v) if v > 0 else None, f"ln({c._name})", DoubleType())
    c = _c(arg2)
    return _map(c, lambda v: _math.log(v, arg1) if v > 0 else None, f"LOG({arg1}, {c._name})", DoubleType())


def log10(c):
    c = _c(c)
    return _map(c, lambda v: _math.log10(v) if v > 0 else None, f"LOG10({c._name})", DoubleType())


def pow(c1, c2):
    a = _c(c1)
    return a.__pow__(c2)


def floor(c):
    c = _c(c)
    return _map(c, lambda v: int(_math.floor(v)), f"FLOOR({c._name})", LongType())


def ceil(c):
    c = _c(c)
    return _map(c, lambda v: int(_math.ceil(v)), f"CEIL({c._name})", LongType())


def greatest(*cols):
    cs = [_c(x) for x in cols]
    return Column(lambda pdf: _pd.concat([x._eval(pdf) for x in cs], axis=1).max(axis=1),
                  "greatest(" + ", ".join(x._name for x in cs) + ")")


def least(*cols):
    cs = [_c(x) for x in cols]
    return Column(lambda pdf: _pd.concat([x._eval(pdf) for x in cs], axis=1).min(axis=1),
                  "least(" + ", ".join(x._name for x in cs) + ")")


def rand(seed=None):
    rng = _np.random.default_rng(seed)
    return Column(lambda pdf: _pd.Series(rng.random(len(pdf)), index=pdf.index), f"rand({seed})", DoubleType())


def monotonically_increasing_id():
    return Column(lambda pdf: _pd.Series(range(len(pdf)), index=pdf.index, dtype="Int64"),
                  "monotonically_increasing_id()", LongType())


# ------------------------------------------------------------------ строки
def lower(c):
    c = _c(c)
    return _map(c, lambda v: str(v).lower(), f"lower({c._name})", StringType())


def upper(c):
    c = _c(c)
    return _map(c, lambda v: str(v).upper(), f"upper({c._name})", StringType())


def initcap(c):
    c = _c(c)
    return _map(c, lambda v: " ".join(w[:1].upper() + w[1:].lower() for w in str(v).split(" ")), f"initcap({c._name})",
                StringType())


def trim(c):
    c = _c(c)
    return _map(c, lambda v: str(v).strip(" "), f"trim({c._name})", StringType())


def ltrim(c):
    c = _c(c)
    return _map(c, lambda v: str(v).lstrip(" "), f"ltrim({c._name})", StringType())


def rtrim(c):
    c = _c(c)
    return _map(c, lambda v: str(v).rstrip(" "), f"rtrim({c._name})", StringType())


def length(c):
    c = _c(c)
    return _map(c, lambda v: len(v) if isinstance(v, (str, list)) else len(str(v)), f"length({c._name})", IntegerType())


char_length = length


def reverse(c):
    c = _c(c)
    return _map(c, lambda v: v[::-1], f"reverse({c._name})")


def _java_repl(rep):
    return _re.sub(r"\$(\d)", r"\\\1", rep)


def regexp_replace(c, pattern, replacement):
    c = _c(c)
    rx = _re.compile(pattern)
    rep = _java_repl(replacement)
    return _map(c, lambda v: rx.sub(rep, str(v)), f"regexp_replace({c._name}, {pattern}, {replacement}, 1)", StringType())


def regexp_extract(c, pattern, idx):
    c = _c(c)
    rx = _re.compile(pattern)

    def f(v):
        m = rx.search(str(v))
        return (m.group(idx) or "") if m else ""
    return _map(c, f, f"regexp_extract({c._name}, {pattern}, {idx})", StringType())


def translate(c, matching, replace):
    c = _c(c)
    table = {ord(a): (replace[i] if i < len(replace) else None) for i, a in enumerate(matching)}
    return _map(c, lambda v: str(v).translate(table), f"translate({c._name}, {matching}, {replace})", StringType())


def substring(c, pos, len):
    return _c(c).substr(pos, len)


def concat(*cols):
    cs = [_c(x) for x in cols]

    def fn(pdf):
        vals = [x._eval(pdf) for x in cs]
        out = []
        for row in zip(*vals):
            if _b.any(_isnull(v) if not isinstance(v, list) else False for v in row):
                out.append(None)
            elif row and isinstance(row[0], list):
                out.append([y for v in row for y in v])
            else:
                out.append("".join(str(v) for v in row))
        return _pd.Series(out, index=pdf.index, dtype=object)
    return Column(fn, "concat(" + ", ".join(x._name for x in cs) + ")")


def concat_ws(sep, *cols):
    cs = [_c(x) for x in cols]

    def fn(pdf):
        vals = [x._eval(pdf) for x in cs]
        out = []
        for row in zip(*vals):
            parts = []
            for v in row:
                if isinstance(v, (list, tuple, _np.ndarray)):
                    parts.extend(str(x) for x in v if not _isnull(x))
                elif not _isnull(v):
                    parts.append(str(v))
            out.append(sep.join(parts))
        return _pd.Series(out, index=pdf.index, dtype=object)
    return Column(fn, f"concat_ws({sep}, " + ", ".join(x._name for x in cs) + ")", StringType())


def lpad(c, len, pad):
    c = _c(c)
    return _map(c, lambda v: (pad * len + str(v))[-len:] if _b.len(str(v)) < len else str(v)[:len], f"lpad({c._name}, {len}, {pad})")


def rpad(c, len, pad):
    c = _c(c)
    return _map(c, lambda v: (str(v) + pad * len)[:len], f"rpad({c._name}, {len}, {pad})")


def instr(c, substr):
    c = _c(c)
    return _map(c, lambda v: str(v).find(substr) + 1, f"instr({c._name}, {substr})", IntegerType())


def split(c, pattern, limit=-1):
    c = _c(c)
    rx = _re.compile(pattern)
    return _map(c, lambda v: rx.split(str(v), maxsplit=limit - 1 if limit > 0 else 0),
                f"split({c._name}, {pattern}, {limit})", ArrayType(StringType()))


def format_number(c, d):
    c = _c(c)
    return _map(c, lambda v: f"{float(v):,.{d}f}", f"format_number({c._name}, {d})", StringType())


def format_string(fmt, *cols):
    cs = [_c(x) for x in cols]

    def fn(pdf):
        vals = [x._eval(pdf) for x in cs]
        return _pd.Series([fmt % tuple(_py(v) for v in row) for row in zip(*vals)], index=pdf.index, dtype=object)
    return Column(fn, f"format_string({fmt}, " + ", ".join(x._name for x in cs) + ")", StringType())


# ------------------------------------------------------------------ массивы
def explode(c):
    c = _c(c)
    out = Column(c._fn, "col")
    out._explode = "inner"
    return out


def explode_outer(c):
    out = explode(c)
    out._explode = "outer"
    return out


def posexplode(c):
    return explode(c)


def size(c):
    c = _c(c)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: len(v) if isinstance(v, (list, tuple, dict, _np.ndarray)) else -1).astype("Int64"),
                  f"size({c._name})", IntegerType())


def array(*cols):
    if len(cols) == 1 and isinstance(cols[0], (list, tuple)):
        cols = cols[0]
    cs = [_c(x) for x in cols]

    def fn(pdf):
        vals = [x._eval(pdf) for x in cs]
        return _pd.Series([[_py(v) for v in row] for row in zip(*vals)], index=pdf.index, dtype=object)
    return Column(fn, "array(" + ", ".join(x._name for x in cs) + ")")


def array_contains(c, value):
    c = _c(c)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: None if not isinstance(v, (list, tuple, _np.ndarray)) else value in list(v)),
                  f"array_contains({c._name}, {value})", BooleanType())


def array_distinct(c):
    c = _c(c)
    return _map(c, lambda v: list(dict.fromkeys(v)), f"array_distinct({c._name})")


def sort_array(c, asc=True):
    c = _c(c)
    return _map(c, lambda v: sorted(v, reverse=not asc), f"sort_array({c._name}, {str(asc).lower()})")


def array_join(c, delimiter, null_replacement=None):
    c = _c(c)
    return _map(c, lambda v: delimiter.join(str(x) if x is not None else (null_replacement or "") for x in v
                                            if x is not None or null_replacement is not None),
                f"array_join({c._name}, {delimiter})", StringType())


def element_at(c, extraction):
    c = _c(c)

    def f(v):
        try:
            if isinstance(v, dict):
                return v.get(extraction)
            return v[extraction - 1] if extraction > 0 else v[extraction]
        except (IndexError, TypeError):
            return None
    return _map(c, f, f"element_at({c._name}, {extraction})")


def struct(*cols):
    cs = [_c(x) for x in (cols[0] if len(cols) == 1 and isinstance(cols[0], (list, tuple)) else cols)]

    def fn(pdf):
        vals = [x._eval(pdf) for x in cs]
        return _pd.Series([{x._name: _py(v) for x, v in zip(cs, row)} for row in zip(*vals)], index=pdf.index, dtype=object)
    return Column(fn, "struct(" + ", ".join(x._name for x in cs) + ")")


# ------------------------------------------------------------------ даты
_JAVA_FMT = [("yyyy", "%Y"), ("yy", "%y"), ("MMMM", "%B"), ("MMM", "%b"), ("MM", "%m"), ("dd", "%d"), ("HH", "%H"),
             ("hh", "%I"), ("mm", "%M"), ("ss", "%S"), ("EEEE", "%A"), ("EEE", "%a"), ("a", "%p")]


def _jfmt(fmt):
    out = fmt
    for j, p in _JAVA_FMT:
        out = out.replace(j, p)
    if "%" not in out and "d" in out:
        out = out.replace("d", "%d")
    return out


def _to_dt(v, fmt=None):
    if _isnull(v):
        return None
    if isinstance(v, _pd.Timestamp):
        return v.to_pydatetime()
    if isinstance(v, _dt.datetime):
        return v
    if isinstance(v, _dt.date):
        return _dt.datetime(v.year, v.month, v.day)
    try:
        if fmt:
            return _dt.datetime.strptime(str(v), _jfmt(fmt))
        return _pd.to_datetime(str(v)).to_pydatetime()
    except (ValueError, TypeError):
        return None


def to_date(c, format=None):
    c = _c(c)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: (lambda d: d.date() if d else None)(_to_dt(v, format))).astype(object),
                  f"to_date({c._name})", DateType())


def to_timestamp(c, format=None):
    c = _c(c)
    return Column(lambda pdf: _pd.to_datetime(c._eval(pdf).map(lambda v: _to_dt(v, format))), f"to_timestamp({c._name})",
                  TimestampType())


def _dpart(c, f, label):
    c = _c(c)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: (lambda d: f(d) if d else None)(_to_dt(v))).astype("Int64"),
                  f"{label}({c._name})", IntegerType())


def year(c): return _dpart(c, lambda d: d.year, "year")
def month(c): return _dpart(c, lambda d: d.month, "month")
def dayofmonth(c): return _dpart(c, lambda d: d.day, "dayofmonth")
def dayofweek(c): return _dpart(c, lambda d: (d.weekday() + 1) % 7 + 1, "dayofweek")
def dayofyear(c): return _dpart(c, lambda d: d.timetuple().tm_yday, "dayofyear")
def hour(c): return _dpart(c, lambda d: d.hour, "hour")
def minute(c): return _dpart(c, lambda d: d.minute, "minute")
def second(c): return _dpart(c, lambda d: d.second, "second")
def weekofyear(c): return _dpart(c, lambda d: d.isocalendar()[1], "weekofyear")
def quarter(c): return _dpart(c, lambda d: (d.month - 1) // 3 + 1, "quarter")


def date_format(c, format):
    c = _c(c)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: (lambda d: d.strftime(_jfmt(format)) if d else None)(_to_dt(v))).astype(object),
                  f"date_format({c._name}, {format})", StringType())


def datediff(end, start):
    e, s = _c(end), _c(start)

    def fn(pdf):
        out = []
        for a, b in zip(e._eval(pdf), s._eval(pdf)):
            da, db = _to_dt(a), _to_dt(b)
            out.append((da.date() - db.date()).days if da and db else None)
        return _pd.Series(out, index=pdf.index, dtype="Int64")
    return Column(fn, f"datediff({e._name}, {s._name})", IntegerType())


def date_add(c, days):
    c = _c(c)
    return Column(lambda pdf: c._eval(pdf).map(lambda v: (lambda d: (d + _dt.timedelta(days=days)).date() if d else None)(_to_dt(v))).astype(object),
                  f"date_add({c._name}, {days})", DateType())


def date_sub(c, days):
    return date_add(c, -days)


def current_date():
    return Column(lambda pdf: _pd.Series([_dt.date.today()] * len(pdf), index=pdf.index, dtype=object), "current_date()", DateType())


def current_timestamp():
    return Column(lambda pdf: _pd.Series([_pd.Timestamp.now()] * len(pdf), index=pdf.index), "current_timestamp()", TimestampType())


# ------------------------------------------------------------------ сортировка
def desc(c):
    return _c(c).desc()


def asc(c):
    return _c(c).asc()


def desc_nulls_last(c):
    return _c(c).desc_nulls_last()


def asc_nulls_first(c):
    return _c(c).asc_nulls_first()


# ------------------------------------------------------------------ окна
def _winfunc(kind, name, arg=None, offset=1, default=None):
    c = Column(None, name)
    c._winfn = (kind, arg, offset, default)
    c._aggfn = None
    return c


def row_number():
    return _winfunc("row_number", "row_number()")


def rank():
    return _winfunc("rank", "RANK()")


def dense_rank():
    return _winfunc("dense_rank", "DENSE_RANK()")


def percent_rank():
    return _winfunc("percent_rank", "PERCENT_RANK()")


def ntile(n):
    return _winfunc("ntile", f"ntile({n})", offset=n)


def lag(c, offset=1, default=None):
    c = _c(c)
    return _winfunc("lag", f"lag({c._name}, {offset}, {default})", c, offset, default)


def lead(c, offset=1, default=None):
    c = _c(c)
    return _winfunc("lead", f"lead({c._name}, {offset}, {default})", c, offset, default)


# ------------------------------------------------------------------ UDF
def udf(f=None, returnType=StringType()):
    if f is None or isinstance(f, (str, DataType)):
        rt = f if f is not None else returnType
        return lambda func: udf(func, rt)
    rt = _parse_type(returnType) if isinstance(returnType, str) else returnType

    def wrapper(*cols):
        cs = [_c(x) for x in cols]

        def fn(pdf):
            vals = [x._eval(pdf) for x in cs]
            res = _pd.Series([f(*[_py(v) for v in row]) for row in zip(*vals)], index=pdf.index, dtype=object)
            return _cast_series(res, rt) if not isinstance(rt, (StringType, ArrayType)) else res
        return Column(fn, f"{getattr(f, '__name__', 'udf')}(" + ", ".join(x._name for x in cs) + ")", rt)
    wrapper.func = f
    wrapper.returnType = rt
    wrapper.__name__ = getattr(f, "__name__", "udf")
    return wrapper


def broadcast(df):
    return df
