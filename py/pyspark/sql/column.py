# -*- coding: utf-8 -*-
"""pyspark.sql.Column — учебный эмулятор на базе pandas."""
import copy as _copy
import math
import operator
import re

import numpy as np
import pandas as pd

from pyspark.errors import AnalysisException
from .types import (DataType, StringType, IntegerType, LongType, DoubleType, FloatType, BooleanType, DateType,
                    TimestampType, ArrayType, _parse_type, Row)


def _isnull(v):
    if v is None or v is pd.NA or v is pd.NaT:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if isinstance(v, np.floating) and np.isnan(v):
        return True
    return False


def _py(v):
    """numpy/pandas → обычные значения Python (как в Row у Spark)."""
    if isinstance(v, (list, tuple, np.ndarray)) and not isinstance(v, Row):
        return [_py(x) for x in v]
    if isinstance(v, dict):
        return {k: _py(x) for k, x in v.items()}
    if _isnull(v):
        return None
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    if isinstance(v, pd.Timestamp):
        return v.to_pydatetime()
    return v


def _resolve(pdf, name):
    if name in pdf.columns:
        return name
    low = {str(c).lower(): c for c in pdf.columns}
    if str(name).lower() in low:
        return low[str(name).lower()]
    sugg = ", ".join(f"`{c}`" for c in list(pdf.columns)[:10])
    raise AnalysisException(
        f"[UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with name `{name}` cannot be "
        f"resolved. Did you mean one of the following? [{sugg}].")


def _get_path(pdf, name):
    if name in pdf.columns or "." not in name:
        return pdf[_resolve(pdf, name)]
    head, *rest = name.split(".")
    s = pdf[_resolve(pdf, head)]
    for key in rest:
        s = s.map(lambda v, k=key: None if v is None else (v.get(k) if isinstance(v, dict) else getattr(v, k, None)))
    return s


class Column:
    def __init__(self, fn=None, name="", agg=None, dtype=None):
        self._fn = fn
        self._aggfn = agg
        self._name = str(name)
        self._dtype = dtype
        self._order = None
        self._explode = None
        self._eq_pairs = None
        self._ref = None
        self._lit = _NOLIT
        self._when = None
        self._winfn = None
        self._agg_kind = None
        self._agg_inner = None
        self._nonnull = False

    # ---------- служебное
    @property
    def _is_agg(self):
        return self._aggfn is not None

    def _eval(self, pdf):
        if self._winfn is not None:
            raise AnalysisException(f"Оконная функция {self._name} требует .over(Window...)")
        if self._fn is None:
            raise AnalysisException(
                f"[MISSING_GROUP_BY] Агрегатная функция `{self._name}` используется вне agg()/groupBy(). "
                f"Пример: df.groupBy('col').agg({self._name.split('(')[0]}(...))")
        s = self._fn(pdf)
        if not isinstance(s, pd.Series):
            s = pd.Series([s] * len(pdf), index=pdf.index, dtype=object)
        return s

    def _scalar(self, g):
        if self._is_agg:
            return self._aggfn(g)
        if self._lit is not _NOLIT:
            return self._lit
        s = self._eval(g)
        if len(s) and s.nunique(dropna=False) <= 1:
            return _py(s.iloc[0])
        raise AnalysisException(
            f"[MISSING_AGGREGATION] The non-aggregating expression `{self._name}` is based on columns which are "
            f"not participating in the GROUP BY clause.")

    def _copy(self, **kw):
        c = _copy.copy(self)
        c.__dict__.update(kw)
        return c

    def __repr__(self):
        return f"Column<'{self._name}'>"

    def __bool__(self):
        raise ValueError("Cannot convert column into bool: please use '&' for 'and', '|' for 'or', '~' for 'not' "
                         "when building DataFrame boolean expressions.")

    __hash__ = object.__hash__

    def __iter__(self):
        raise TypeError("Column is not iterable")

    # ---------- имя и порядок
    def alias(self, *alias, **kwargs):
        return self._copy(_name=alias[0])

    name = alias

    def asc(self):
        return self._copy(_order=("asc", "first"))

    def desc(self):
        return self._copy(_order=("desc", "last"))

    def asc_nulls_first(self):
        return self._copy(_order=("asc", "first"))

    def asc_nulls_last(self):
        return self._copy(_order=("asc", "last"))

    def desc_nulls_first(self):
        return self._copy(_order=("desc", "first"))

    def desc_nulls_last(self):
        return self._copy(_order=("desc", "last"))

    # ---------- арифметика / сравнение
    def _bin(self, other, op, sym, swap=False, dtype=None):
        o = other if isinstance(other, Column) else _litcol(other)
        a, b = (o, self) if swap else (self, o)
        name = f"({a._name} {sym} {b._name})"
        if a._is_agg or b._is_agg:
            return Column(None, name, agg=lambda g: _safe(op, a._scalar(g), b._scalar(g)), dtype=dtype)

        def fn(pdf):
            return op(a._eval(pdf), b._eval(pdf))
        col = Column(fn, name, dtype=dtype)
        return col

    def __add__(self, o): return self._bin(o, operator.add, "+")
    def __radd__(self, o): return self._bin(o, operator.add, "+", swap=True)
    def __sub__(self, o): return self._bin(o, operator.sub, "-")
    def __rsub__(self, o): return self._bin(o, operator.sub, "-", swap=True)
    def __mul__(self, o): return self._bin(o, operator.mul, "*")
    def __rmul__(self, o): return self._bin(o, operator.mul, "*", swap=True)
    def __truediv__(self, o): return self._bin(o, _div, "/", dtype=DoubleType())
    def __rtruediv__(self, o): return self._bin(o, _div, "/", swap=True, dtype=DoubleType())
    def __mod__(self, o): return self._bin(o, operator.mod, "%")
    def __pow__(self, o): return self._bin(o, operator.pow, "**", dtype=DoubleType())

    def __neg__(self):
        if self._is_agg:
            return Column(None, f"(- {self._name})", agg=lambda g: -self._scalar(g))
        return Column(lambda pdf: -self._eval(pdf), f"(- {self._name})")

    def __eq__(self, o):
        c = self._bin(o, operator.eq, "=", dtype=BooleanType())
        if isinstance(o, Column) and self._ref and o._ref:
            c._eq_pairs = [(self._ref, o._ref)]
        return c

    def __ne__(self, o): return self._bin(o, operator.ne, "!=", dtype=BooleanType())
    def __lt__(self, o): return self._bin(o, operator.lt, "<", dtype=BooleanType())
    def __le__(self, o): return self._bin(o, operator.le, "<=", dtype=BooleanType())
    def __gt__(self, o): return self._bin(o, operator.gt, ">", dtype=BooleanType())
    def __ge__(self, o): return self._bin(o, operator.ge, ">=", dtype=BooleanType())

    def __and__(self, o):
        c = self._bin(o, lambda a, b: _bool(a) & _bool(b), "AND", dtype=BooleanType())
        if isinstance(o, Column) and self._eq_pairs and o._eq_pairs:
            c._eq_pairs = self._eq_pairs + o._eq_pairs
        return c

    def __or__(self, o): return self._bin(o, lambda a, b: _bool(a) | _bool(b), "OR", dtype=BooleanType())
    def __rand__(self, o): return self._bin(o, lambda a, b: _bool(a) & _bool(b), "AND", swap=True)
    def __ror__(self, o): return self._bin(o, lambda a, b: _bool(a) | _bool(b), "OR", swap=True)

    def __invert__(self):
        return Column(lambda pdf: ~_bool(self._eval(pdf)), f"(NOT {self._name})", dtype=BooleanType())

    # ---------- проверки
    def isNull(self):
        return Column(lambda pdf: self._eval(pdf).isna(), f"({self._name} IS NULL)", dtype=BooleanType())

    def isNotNull(self):
        return Column(lambda pdf: self._eval(pdf).notna(), f"({self._name} IS NOT NULL)", dtype=BooleanType())

    def isin(self, *vals):
        if len(vals) == 1 and isinstance(vals[0], (list, tuple, set)):
            vals = list(vals[0])
        vals = list(vals)
        return Column(lambda pdf: self._eval(pdf).isin(vals), f"({self._name} IN ({', '.join(map(str, vals))}))",
                      dtype=BooleanType())

    def between(self, lo, hi):
        return (self >= lo) & (self <= hi)

    def _strpred(self, f, label):
        return Column(lambda pdf: self._eval(pdf).map(lambda v: False if _isnull(v) else bool(f(str(v)))),
                      label, dtype=BooleanType())

    def contains(self, s):
        return self._strpred(lambda v: str(s) in v, f"contains({self._name}, {s})")

    def startswith(self, s):
        return self._strpred(lambda v: v.startswith(s), f"startswith({self._name}, {s})")

    def endswith(self, s):
        return self._strpred(lambda v: v.endswith(s), f"endswith({self._name}, {s})")

    def like(self, pattern):
        rx = re.compile("^" + "".join(".*" if ch == "%" else "." if ch == "_" else re.escape(ch) for ch in pattern) + "$",
                        re.S)
        return self._strpred(lambda v: rx.match(v), f"{self._name} LIKE {pattern}")

    def ilike(self, pattern):
        rx = re.compile("^" + "".join(".*" if ch == "%" else "." if ch == "_" else re.escape(ch) for ch in pattern) + "$",
                        re.S | re.I)
        return self._strpred(lambda v: rx.match(v), f"{self._name} ILIKE {pattern}")

    def rlike(self, regex):
        rx = re.compile(regex)
        return self._strpred(lambda v: rx.search(v), f"{self._name} RLIKE {regex}")

    def substr(self, startPos, length):
        def f(v):
            if _isnull(v):
                return None
            st = max(startPos - 1, 0) if startPos > 0 else len(str(v)) + startPos
            return str(v)[st:st + length]
        return Column(lambda pdf: self._eval(pdf).map(f), f"substr({self._name}, {startPos}, {length})",
                      dtype=StringType())

    def getItem(self, key):
        def f(v):
            if _isnull(v) if not isinstance(v, (list, dict)) else False:
                return None
            try:
                return v[key]
            except (IndexError, KeyError, TypeError):
                return None
        return Column(lambda pdf: self._eval(pdf).map(f), f"{self._name}[{key}]")

    def getField(self, name):
        return self.getItem(name)

    def __getitem__(self, k):
        return self.getItem(k)

    def __getattr__(self, item):
        if item.startswith("_"):
            raise AttributeError(item)
        return self.getItem(item)

    def cast(self, dataType):
        dt = _parse_type(dataType) if isinstance(dataType, str) else dataType
        def fn(pdf):
            return _cast_series(self._eval(pdf), dt)
        if self._is_agg:
            return Column(None, f"CAST({self._name} AS {dt.simpleString().upper()})",
                          agg=lambda g: _py(_cast_series(pd.Series([self._scalar(g)]), dt).iloc[0]), dtype=dt)
        c = Column(fn, self._name if self._ref else f"CAST({self._name} AS {dt.simpleString().upper()})", dtype=dt)
        return c

    astype = cast

    # ---------- CASE WHEN
    def when(self, condition, value):
        if self._when is None:
            raise TypeError("when() можно вызывать только после F.when(...)")
        new = self._copy(_when=(self._when[0] + [(condition, _litcol(value))], self._when[1]))
        return _build_when(new)

    def otherwise(self, value):
        if self._when is None:
            raise TypeError("otherwise() можно вызывать только после F.when(...)")
        new = self._copy(_when=(self._when[0], _litcol(value)))
        return _build_when(new)

    # ---------- окна
    def over(self, window):
        from .window import _apply_window
        return _apply_window(self, window)


_NOLIT = object()


def _bool(s):
    if isinstance(s, pd.Series):
        try:
            return s.astype("boolean").fillna(False).astype(bool)
        except (TypeError, ValueError):
            return s.map(lambda v: bool(v) if not _isnull(v) else False)
    return bool(s)


def _div(a, b):
    if isinstance(a, pd.Series) or isinstance(b, pd.Series):
        a2 = pd.to_numeric(a, errors="coerce") if isinstance(a, pd.Series) else a
        b2 = pd.to_numeric(b, errors="coerce") if isinstance(b, pd.Series) else b
        res = a2 / b2
        if isinstance(res, pd.Series):
            res = res.astype("float64").replace([np.inf, -np.inf], np.nan)
        return res
    if a is None or b is None or b == 0:
        return None
    return a / b


def _safe(op, a, b):
    if a is None or b is None:
        return None
    try:
        return op(a, b)
    except ZeroDivisionError:
        return None


def _build_when(c):
    branches, default = c._when

    def fn(pdf):
        res = default._eval(pdf) if default is not None else pd.Series([None] * len(pdf), index=pdf.index, dtype=object)
        res = res.astype(object)
        for cond, val in reversed(branches):
            mask = _bool(cond._eval(pdf))
            v = val._eval(pdf).astype(object)
            res = res.where(~mask, v)
        return _tidy(res)
    parts = " ".join(f"WHEN {cond._name} THEN {val._name}" for cond, val in branches)
    name = f"CASE {parts}" + (f" ELSE {default._name}" if default is not None else "") + " END"
    out = Column(fn, name)
    out._when = c._when
    return out


def _tidy(s):
    """object-серию с числами превращаем обратно в числовую."""
    vals = s.dropna()
    if len(vals) and all(isinstance(v, (bool, np.bool_)) for v in vals):
        return s
    if len(vals) and all(isinstance(v, (int, np.integer)) and not isinstance(v, (bool, np.bool_)) for v in vals):
        return s.astype("Int64")
    if len(vals) and all(isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_)) for v in vals):
        return s.astype("float64")
    return s


def _cast_series(s, dt):
    if isinstance(dt, (IntegerType, LongType)):
        num = pd.to_numeric(s.map(lambda v: v.strip() if isinstance(v, str) else v), errors="coerce")
        return np.trunc(num).astype("Int64") if num.dtype.kind == "f" else num.astype("Int64")
    if isinstance(dt, (DoubleType, FloatType)):
        return pd.to_numeric(s.map(lambda v: v.strip() if isinstance(v, str) else v), errors="coerce").astype("float64")
    if isinstance(dt, StringType):
        def f(v):
            if _isnull(v):
                return None
            if isinstance(v, (bool, np.bool_)):
                return "true" if v else "false"
            if isinstance(v, float) and v.is_integer() and s.dtype.kind == "f":
                return repr(v)
            return str(v)
        return s.map(f).astype(object)
    if isinstance(dt, BooleanType):
        def b(v):
            if _isnull(v):
                return None
            if isinstance(v, str):
                return {"true": True, "false": False, "1": True, "0": False}.get(v.strip().lower())
            return bool(v)
        return s.map(b).astype(object)
    if isinstance(dt, DateType):
        return pd.to_datetime(s, errors="coerce").map(lambda v: None if _isnull(v) else v.date()).astype(object)
    if isinstance(dt, TimestampType):
        return pd.to_datetime(s, errors="coerce")
    return s


def _c(x):
    """Привести строку/значение к Column."""
    if isinstance(x, Column):
        return x
    if isinstance(x, str):
        return _colref(x)
    return _litcol(x)


def _colref(name):
    if name == "*":
        c = Column(lambda pdf: None, "*")
        c._ref = "*"
        return c

    def fn(pdf):
        return _get_path(pdf, name)
    c = Column(fn, name.split(".")[-1] if "." in name else name)
    c._ref = name
    return c


def _litcol(v):
    if isinstance(v, Column):
        return v
    name = "NULL" if v is None else ("true" if v is True else "false" if v is False else str(v))
    c = Column(lambda pdf: pd.Series([v] * len(pdf), index=pdf.index, dtype=object if not isinstance(v, (int, float)) or isinstance(v, bool) else None),
               name)
    c._lit = v
    return c
