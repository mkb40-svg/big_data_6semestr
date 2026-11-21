# -*- coding: utf-8 -*-
"""pyspark.sql.window — оконные функции (упрощённо)."""
import sys

import numpy as np
import pandas as pd

from .column import Column, _c, _py, _tidy


class WindowSpec:
    def __init__(self, part=(), order=(), frame=None):
        self._part, self._order, self._frame = list(part), list(order), frame

    def partitionBy(self, *cols):
        cols = cols[0] if len(cols) == 1 and isinstance(cols[0], (list, tuple)) else cols
        return WindowSpec(list(cols), self._order, self._frame)

    def orderBy(self, *cols):
        cols = cols[0] if len(cols) == 1 and isinstance(cols[0], (list, tuple)) else cols
        return WindowSpec(self._part, list(cols), self._frame)

    def rowsBetween(self, start, end):
        return WindowSpec(self._part, self._order, (start, end))

    rangeBetween = rowsBetween


class Window:
    unboundedPreceding = -sys.maxsize
    unboundedFollowing = sys.maxsize
    currentRow = 0

    @staticmethod
    def partitionBy(*cols):
        return WindowSpec().partitionBy(*cols)

    @staticmethod
    def orderBy(*cols):
        return WindowSpec().orderBy(*cols)

    @staticmethod
    def rowsBetween(start, end):
        return WindowSpec(frame=(start, end))


def _apply_window(col, w):
    def fn(pdf):
        tmp = pd.DataFrame(index=pdf.index)
        pkeys, okeys, asc = [], [], []
        for i, p in enumerate(w._part):
            tmp[f"__p{i}"] = _c(p)._eval(pdf).astype(object)
            pkeys.append(f"__p{i}")
        if not pkeys:
            tmp["__p0"] = 0
            pkeys = ["__p0"]
        for i, o in enumerate(w._order):
            o = _c(o)
            tmp[f"__o{i}"] = o._eval(pdf)
            okeys.append(f"__o{i}")
            asc.append(o._order is None or o._order[0] == "asc")
        if col._winfn and col._winfn[1] is not None:
            tmp["__v"] = col._winfn[1]._eval(pdf)
        elif col._agg_kind:
            tmp["__v"] = col._agg_inner._eval(pdf) if col._agg_inner is not None else 1
        tmp["__one"] = 1
        if okeys:
            tmp = tmp.sort_values(okeys, ascending=asc, kind="mergesort")
        grp = tmp.groupby(pkeys, sort=False, dropna=False)
        if col._winfn:
            kind, arg, offset, default = col._winfn
            if kind == "row_number":
                res = grp.cumcount() + 1
            elif kind in ("rank", "dense_rank", "percent_rank"):
                parts = []
                for _, sub in grp:
                    keys = list(zip(*[sub[k] for k in okeys])) if okeys else [0] * len(sub)
                    out, r, dr, prev = [], 0, 0, object()
                    for i, kv in enumerate(keys):
                        if i == 0 or kv != prev:
                            r, dr, prev = i + 1, dr + 1, kv
                        out.append(r if kind != "dense_rank" else dr)
                    if kind == "percent_rank":
                        n = len(out)
                        out = [(x - 1) / (n - 1) if n > 1 else 0.0 for x in out]
                    parts.append(pd.Series(out, index=sub.index))
                res = pd.concat(parts) if parts else pd.Series(dtype="Int64")
            elif kind == "ntile":
                res = grp.cumcount() * offset // grp["__one"].transform("size") + 1
            elif kind in ("lag", "lead"):
                res = grp["__v"].shift(offset if kind == "lag" else -offset)
                if default is not None:
                    res = res.where(res.notna(), default)
            else:
                raise NotImplementedError(kind)
        elif col._agg_kind:
            kind = col._agg_kind
            pdk = {"sum": "sum", "avg": "mean", "max": "max", "min": "min", "count": "count"}
            if kind not in pdk:
                raise NotImplementedError(f"Окно для {kind} не поддерживается эмулятором")
            frame = w._frame
            running = okeys and not (frame and frame[0] == Window.unboundedPreceding and frame[1] == Window.unboundedFollowing)
            if not running:
                res = grp["__v"].transform(pdk[kind])
            else:
                g = grp["__v"]
                if kind == "sum":
                    res = g.cumsum()
                elif kind == "count":
                    res = g.cumcount() + 1
                elif kind == "max":
                    res = g.cummax()
                elif kind == "min":
                    res = g.cummin()
                else:
                    res = g.cumsum() / (g.cumcount() + 1)
        else:
            raise TypeError(f"{col._name} нельзя использовать с over()")
        return _tidy(res.reindex(pdf.index).astype(object).where(res.reindex(pdf.index).notna(), None))

    part = ", ".join(_c(p)._name for p in w._part)
    order = ", ".join(_c(o)._name + (" DESC" if _c(o)._order and _c(o)._order[0] == "desc" else " ASC") for o in w._order)
    spec = (f"PARTITION BY {part} " if part else "") + (f"ORDER BY {order} " if order else "")
    return Column(fn, f"{col._name} OVER ({spec.strip()})")
