# -*- coding: utf-8 -*-
"""pyspark.sql.DataFrame — учебный эмулятор на базе pandas.

Поддерживает основные операции Spark DataFrame API. Вычисления выполняются
сразу (а не лениво), но вывод show()/printSchema() повторяет формат Spark.
"""
import datetime as _dt
import json
import math
import os
import shutil
import uuid

import numpy as np
import pandas as pd

from pyspark.errors import AnalysisException
from .column import Column, _c, _py, _isnull, _resolve, _tidy, _bool, _cast_series, _NOLIT
from .types import (StructType, StructField, StringType, IntegerType, LongType, DoubleType, BooleanType, DateType,
                    TimestampType, ArrayType, Row, _py_type, DataType, NullType)


def _flatten(cols):
    out = []
    for c in cols:
        if isinstance(c, (list, tuple)):
            out.extend(c)
        else:
            out.append(c)
    return out


def _infer_series_type(s):
    k = s.dtype.kind
    if str(s.dtype) == "boolean" or k == "b":
        return BooleanType()
    if k in "iu" or str(s.dtype) in ("Int64", "Int32"):
        return LongType()
    if k == "f":
        return DoubleType()
    if k == "M":
        return TimestampType()
    vals = s.dropna()
    if len(vals) == 0:
        return StringType()
    return _py_type(_py(vals.iloc[0]))


def _java_double(v):
    if v == 0:
        return "0.0"
    if math.isinf(v):
        return "Infinity" if v > 0 else "-Infinity"
    a = abs(v)
    if 1e-3 <= a < 1e7:
        s = repr(float(v))
        return s
    m, e = f"{v:.16e}".split("e")
    m = repr(float(m))
    return f"{m}E{int(e)}"


def _fmt(v):
    if isinstance(v, (list, tuple, np.ndarray)) and not isinstance(v, Row):
        return "[" + ", ".join(_fmt(x) for x in v) + "]"
    if isinstance(v, Row):
        return "{" + ", ".join(_fmt(x) for x in v) + "}"
    if isinstance(v, dict):
        return "{" + ", ".join(_fmt(x) for x in v.values()) + "}"
    if _isnull(v):
        return "null"
    if isinstance(v, (bool, np.bool_)):
        return "true" if v else "false"
    if isinstance(v, (float, np.floating)):
        return _java_double(float(v))
    if isinstance(v, (np.integer,)):
        return str(int(v))
    if isinstance(v, (pd.Timestamp, _dt.datetime)):
        s = v.strftime("%Y-%m-%d %H:%M:%S")
        if v.microsecond:
            s += f".{v.microsecond:06d}".rstrip("0")
        return s
    if isinstance(v, _dt.date):
        return v.isoformat()
    return str(v)


class DataFrame:
    def __init__(self, pdf, session=None, types=None, partitions=1, nonnull=None):
        self._pdf = pdf.reset_index(drop=True)
        self._types = {k: v for k, v in (types or {}).items() if k in self._pdf.columns}
        self._session = session
        self._nparts = partitions
        self._nonnull = set(nonnull or ()) & set(self._pdf.columns)

    # ------------------------------------------------------------ служебное
    @property
    def sparkSession(self):
        if self._session is None:
            from .session import SparkSession
            self._session = SparkSession._active
        return self._session

    def _new(self, pdf, types=None, nonnull=None, partitions=None):
        t = dict(self._types)
        if types:
            t.update(types)
        return DataFrame(pdf, self._session, t, partitions or self._nparts,
                         self._nonnull if nonnull is None else nonnull)

    def _type_of(self, name):
        if name in self._types:
            return self._types[name]
        return _infer_series_type(self._pdf[name])

    # ------------------------------------------------------------ схема
    @property
    def columns(self):
        return [str(c) for c in self._pdf.columns]

    @property
    def schema(self):
        return StructType([StructField(c, self._type_of(c), c not in self._nonnull) for c in self.columns])

    @property
    def dtypes(self):
        return [(c, self._type_of(c).simpleString()) for c in self.columns]

    def printSchema(self, level=None):
        print(self.schema.treeString())

    def __repr__(self):
        return "DataFrame[" + ", ".join(f"{c}: {t}" for c, t in self.dtypes) + "]"

    def __getitem__(self, item):
        if isinstance(item, str):
            _resolve(self._pdf, item.split(".")[0])
            return _c(item)
        if isinstance(item, Column):
            return self.filter(item)
        if isinstance(item, (list, tuple)):
            return self.select(*item)
        if isinstance(item, int):
            return _c(self.columns[item])
        raise TypeError(item)

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        pdf = self.__dict__.get("_pdf")
        if pdf is not None and name in pdf.columns:
            return _c(name)
        raise AttributeError(f"'DataFrame' object has no attribute '{name}'")

    # ------------------------------------------------------------ вывод
    def _show_string(self, n=20, truncate=True, vertical=False):
        n = int(n)
        rows = self._pdf.head(n)
        headers = self.columns
        cells = [[_fmt(v) for v in r] for r in rows.itertuples(index=False, name=None)]
        t = 20 if truncate is True else int(truncate or 0)
        if t > 0:
            def cut(s):
                return s if len(s) <= t else (s[:t - 3] + "..." if t > 3 else s[:t])
            cells = [[cut(x) for x in r] for r in cells]
        if vertical:
            width = max([len(h) for h in headers] + [0])
            out = []
            for i, r in enumerate(cells):
                out.append(f"-RECORD {i}" + "-" * 10)
                for h, x in zip(headers, r):
                    out.append(f" {h.ljust(width)} | {x}")
            if not cells:
                out.append("(0 rows)")
            return "\n".join(out) + "\n"
        widths = [max([3, len(h)] + [len(r[i]) for r in cells]) for i, h in enumerate(headers)]
        pad = (lambda s, w: s.rjust(w)) if t > 0 else (lambda s, w: s.ljust(w))
        sep = "+" + "+".join("-" * w for w in widths) + "+"
        lines = [sep, "|" + "|".join(pad(h, w) for h, w in zip(headers, widths)) + "|", sep]
        for r in cells:
            lines.append("|" + "|".join(pad(x, w) for x, w in zip(r, widths)) + "|")
        lines.append(sep)
        if len(self._pdf) > n:
            lines.append(f"only showing top {n} row" + ("s" if n != 1 else ""))
        return "\n".join(lines) + "\n"

    def show(self, n=20, truncate=True, vertical=False):
        print(self._show_string(n, truncate, vertical))

    def _repr_html_(self):
        return None

    # ------------------------------------------------------------ действия
    def count(self):
        return int(len(self._pdf))

    def _rows(self, pdf=None):
        pdf = self._pdf if pdf is None else pdf
        cols = self.columns
        out = []
        for rec in pdf.itertuples(index=False, name=None):
            out.append(Row(**{c: _py(v) for c, v in zip(cols, rec)}))
        return out

    def collect(self):
        return self._rows()

    def take(self, num):
        return self._rows(self._pdf.head(num))

    def head(self, n=None):
        if n is None:
            r = self.take(1)
            return r[0] if r else None
        return self.take(n)

    def first(self):
        return self.head()

    def tail(self, num):
        return self._rows(self._pdf.tail(num))

    def isEmpty(self):
        return len(self._pdf) == 0

    def toPandas(self):
        return self._pdf.copy()

    def toJSON(self, use_unicode=True):
        from pyspark.rdd import RDD
        recs = [json.dumps({k: v for k, v in r.asDict().items() if v is not None}, ensure_ascii=False, default=str)
                for r in self._rows()]
        return RDD._from_list(recs, self._nparts)

    def foreach(self, f):
        for r in self._rows():
            f(r)

    @property
    def rdd(self):
        from pyspark.rdd import RDD
        return RDD._from_list(self._rows(), self._nparts)

    def cache(self):
        return self

    persist = cache

    def unpersist(self, blocking=False):
        return self

    def checkpoint(self, eager=True):
        return self

    def localCheckpoint(self, eager=True):
        return self

    def explain(self, extended=False, mode=None):
        print("== Physical Plan ==")
        print(f"*(1) Scan ExistingRDD[{','.join(self.columns)}]")
        print("(учебный эмулятор: настоящий Spark строит здесь план выполнения из этапов и задач)")

    # ------------------------------------------------------------ трансформации
    def _eval_cols(self, cols):
        exprs = []
        for c in _flatten(cols):
            if isinstance(c, str) and c == "*":
                exprs.extend(_c(x) for x in self.columns)
            elif isinstance(c, Column) and c._ref == "*":
                exprs.extend(_c(x) for x in self.columns)
            elif isinstance(c, str) and c.endswith(".*"):
                base = c[:-2]
                first = self._pdf[_resolve(self._pdf, base)].dropna()
                keys = list(first.iloc[0].keys()) if len(first) and isinstance(first.iloc[0], dict) else []
                exprs.extend(_c(f"{base}.{k}") for k in keys)
            else:
                exprs.append(_c(c))
        return exprs

    def select(self, *cols):
        exprs = self._eval_cols(cols)
        if any(e._is_agg for e in exprs):
            if not all(e._is_agg or e._lit is not _NOLIT for e in exprs):
                bad = [e._name for e in exprs if not e._is_agg][0]
                raise AnalysisException(
                    f"[MISSING_GROUP_BY] The query does not include a GROUP BY clause. Add GROUP BY or turn "
                    f"`{bad}` into an aggregate function.")
            return self.agg(*exprs)
        data, types, nonnull = {}, {}, set()
        explode = None
        for e in exprs:
            s = e._eval(self._pdf)
            name = e._name
            data[name] = s.reset_index(drop=True)
            if e._ref and e._ref in self._types and e._dtype is None:
                types[name] = self._types[e._ref]
            elif e._dtype is not None:
                types[name] = e._dtype
            if e._ref in self._nonnull:
                nonnull.add(name)
            if e._explode:
                explode = (name, e._explode)
        pdf = pd.DataFrame(data)
        if explode:
            pdf = _do_explode(pdf, *explode)
            types.pop(explode[0], None)
        out = DataFrame(pdf, self._session, types, self._nparts, nonnull)
        return out

    def selectExpr(self, *exprs):
        from .session import _sql_query
        exprs = _flatten(exprs)
        return _sql_query({"__t": self}, f"SELECT {', '.join(exprs)} FROM __t", self._session)

    def filter(self, condition):
        if isinstance(condition, str):
            from .session import _sql_filter_mask
            mask = _sql_filter_mask(self._pdf, condition)
        else:
            if not isinstance(condition, Column):
                raise TypeError("filter() ожидает условие Column или строку SQL, например df.filter(df.age > 20)")
            mask = _bool(condition._eval(self._pdf))
        return self._new(self._pdf[mask.values])

    where = filter

    def withColumn(self, colName, col):
        if not isinstance(col, Column):
            raise TypeError(f"[NOT_COLUMN] Argument `col` should be a Column, got {type(col).__name__}. "
                            f"Используйте F.lit(...) для констант.")
        if col._is_agg:
            raise AnalysisException(f"Агрегат `{col._name}` нельзя использовать в withColumn без окна (over).")
        pdf = self._pdf.copy()
        s = col._eval(self._pdf)
        target = colName
        for c in pdf.columns:
            if c.lower() == colName.lower():
                target = c
        pdf[target] = s.values
        types = dict(self._types)
        types.pop(target, None)
        if col._dtype is not None:
            types[target] = col._dtype
        elif col._ref and col._ref in self._types:
            types[target] = self._types[col._ref]
        if col._explode:
            pdf = _do_explode(pdf, target, col._explode)
        return DataFrame(pdf, self._session, types, self._nparts, self._nonnull - {target})

    def withColumns(self, colsMap):
        df = self
        for k, v in colsMap.items():
            df = df.withColumn(k, v)
        return df

    def withColumnRenamed(self, existing, new):
        if existing not in self._pdf.columns:
            return self
        types = {(new if k == existing else k): v for k, v in self._types.items()}
        nonnull = {(new if k == existing else k) for k in self._nonnull}
        return DataFrame(self._pdf.rename(columns={existing: new}), self._session, types, self._nparts, nonnull)

    def withColumnsRenamed(self, colsMap):
        df = self
        for k, v in colsMap.items():
            df = df.withColumnRenamed(k, v)
        return df

    def toDF(self, *cols):
        if len(cols) != len(self.columns):
            raise ValueError(f"Число новых имён ({len(cols)}) не совпадает с числом столбцов ({len(self.columns)})")
        mapping = dict(zip(self.columns, cols))
        types = {mapping[k]: v for k, v in self._types.items()}
        return DataFrame(self._pdf.set_axis(list(cols), axis=1), self._session, types, self._nparts,
                         {mapping[k] for k in self._nonnull})

    def drop(self, *cols):
        names = []
        for c in _flatten(cols):
            n = c._ref if isinstance(c, Column) else c
            for real in self._pdf.columns:
                if n and real.lower() == str(n).lower():
                    names.append(real)
        return self._new(self._pdf.drop(columns=names))

    def limit(self, num):
        return self._new(self._pdf.head(num))

    def _hashable(self, pdf):
        try:
            return pdf.map(lambda v: tuple(v) if isinstance(v, list) else (json.dumps(v, sort_keys=True, default=str) if isinstance(v, dict) else v))
        except AttributeError:
            return pdf.applymap(lambda v: tuple(v) if isinstance(v, list) else v)

    def distinct(self):
        mask = ~self._hashable(self._pdf).duplicated()
        return self._new(self._pdf[mask.values])

    def dropDuplicates(self, subset=None):
        subset = _flatten([subset]) if subset else None
        h = self._hashable(self._pdf)
        mask = ~h.duplicated(subset=subset)
        return self._new(self._pdf[mask.values])

    drop_duplicates = dropDuplicates

    def orderBy(self, *cols, ascending=None):
        cols = _flatten(cols)
        if not cols:
            return self
        tmp = self._pdf.copy()
        keys, asc, nulls = [], [], []
        for i, c in enumerate(cols):
            c = _c(c)
            k = f"__s{i}"
            tmp[k] = c._eval(self._pdf).values
            keys.append(k)
            asc.append(c._order is None or c._order[0] == "asc")
            nulls.append(c._order[1] if c._order else "first")
        if ascending is not None:
            asc = list(ascending) if isinstance(ascending, (list, tuple)) else [bool(ascending)] * len(keys)
            asc = [bool(a) for a in asc]
            nulls = ["first" if a else "last" for a in asc]
        try:
            tmp = tmp.sort_values(keys, ascending=asc, kind="mergesort", na_position=nulls[0])
        except TypeError:
            for k in keys:
                tmp[k] = tmp[k].map(lambda v: (0, "") if _isnull(v) else (1, str(v)))
            tmp = tmp.sort_values(keys, ascending=asc, kind="mergesort")
        return self._new(tmp.drop(columns=keys))

    sort = orderBy

    def sortWithinPartitions(self, *cols, **kw):
        return self.orderBy(*cols, **kw)

    def groupBy(self, *cols):
        return GroupedData(self, _flatten(cols))

    groupby = groupBy

    def rollup(self, *cols):
        return GroupedData(self, _flatten(cols))

    def agg(self, *exprs):
        return GroupedData(self, []).agg(*exprs)

    def describe(self, *cols):
        cols = _flatten(cols) or [c for c in self.columns if not isinstance(self._type_of(c), (ArrayType, StructType))]
        stats = ["count", "mean", "stddev", "min", "max"]
        res = {"summary": stats}
        for c in cols:
            s = self._pdf[c]
            numeric = s.dtype.kind in "iuf" or str(s.dtype) in ("Int64",)
            nn = s.dropna()
            vals = [str(int(nn.count()))]
            if numeric and len(nn):
                vals += [_fmt(float(nn.mean())), _fmt(float(nn.std(ddof=1))) if len(nn) > 1 else None,
                         _fmt(_py(nn.min())), _fmt(_py(nn.max()))]
            else:
                strs = nn.map(_fmt)
                vals += [None, None, strs.min() if len(strs) else None, strs.max() if len(strs) else None]
            res[c] = vals
        return DataFrame(pd.DataFrame(res), self._session, {k: StringType() for k in res})

    def summary(self, *statistics):
        return self.describe()

    def join(self, other, on=None, how=None):
        how = (how or "inner").lower().replace("_", "")
        hmap = {"inner": "inner", "left": "left", "leftouter": "left", "right": "right", "rightouter": "right",
                "outer": "outer", "full": "outer", "fullouter": "outer", "cross": "cross", "leftsemi": "semi",
                "semi": "semi", "leftanti": "anti", "anti": "anti"}
        if how not in hmap:
            raise ValueError(f"Неизвестный тип соединения: {how}")
        how = hmap[how]
        L, Rr = self._pdf, other._pdf
        types = dict(other._types)
        types.update(self._types)
        if on is None:
            merged = L.merge(Rr, how="cross", suffixes=("", "_right"))
            return DataFrame(merged, self._session, types)
        if isinstance(on, Column):
            if not on._eq_pairs:
                raise AnalysisException("Эмулятор поддерживает условия вида df1.a == df2.b (можно объединять через &).")
            left_on, right_on = [], []
            for a, b in on._eq_pairs:
                if a in L.columns and b in Rr.columns:
                    left_on.append(a); right_on.append(b)
                else:
                    left_on.append(b); right_on.append(a)
        else:
            on = [on] if isinstance(on, str) else list(on)
            left_on = right_on = on
        if how in ("semi", "anti"):
            keys = set(map(tuple, Rr[right_on].astype(object).values.tolist()))
            m = [tuple(r) in keys for r in L[left_on].astype(object).values.tolist()]
            m = np.array(m, dtype=bool)
            return self._new(L[m if how == "semi" else ~m])
        if left_on is right_on:
            merged = L.merge(Rr, on=left_on, how=how, suffixes=("", "_right"))
        else:
            merged = L.merge(Rr, left_on=left_on, right_on=right_on, how=how, suffixes=("", "_right"))
        for c in merged.columns:
            if merged[c].dtype.kind == "f" and ((c in L.columns and str(L[c].dtype) == "Int64") or (c in Rr.columns and str(Rr[c].dtype) == "Int64")):
                merged[c] = merged[c].astype("Int64")
        return DataFrame(merged, self._session, types)

    def crossJoin(self, other):
        return self.join(other, None, "cross")

    def union(self, other):
        if len(other.columns) != len(self.columns):
            raise AnalysisException(f"[NUM_COLUMNS_MISMATCH] UNION can only be performed on inputs with the same "
                                    f"number of columns, but the first input has {len(self.columns)} columns and the "
                                    f"second input has {len(other.columns)} columns.")
        o = other._pdf.set_axis(self.columns, axis=1)
        return self._new(pd.concat([self._pdf, o], ignore_index=True), partitions=self._nparts + other._nparts)

    unionAll = union

    def unionByName(self, other, allowMissingColumns=False):
        missing = set(self.columns) ^ set(other.columns)
        if missing and not allowMissingColumns:
            raise AnalysisException(f"[NUM_COLUMNS_MISMATCH] Столбцы не совпадают: {sorted(missing)}")
        return self._new(pd.concat([self._pdf, other._pdf], ignore_index=True))

    def intersect(self, other):
        o = set(map(tuple, other._pdf.astype(object).values.tolist()))
        m = np.array([tuple(r) in o for r in self._pdf.astype(object).values.tolist()], dtype=bool)
        return self._new(self._pdf[m]).distinct()

    def subtract(self, other):
        o = set(map(tuple, other._pdf.astype(object).values.tolist()))
        m = np.array([tuple(r) not in o for r in self._pdf.astype(object).values.tolist()], dtype=bool)
        return self._new(self._pdf[m]).distinct()

    exceptAll = subtract

    def sample(self, withReplacement=None, fraction=None, seed=None):
        if isinstance(withReplacement, float):
            withReplacement, fraction, seed = False, withReplacement, fraction
        return self._new(self._pdf.sample(frac=fraction, replace=bool(withReplacement), random_state=seed))

    def randomSplit(self, weights, seed=None):
        rng = np.random.default_rng(seed)
        r = rng.random(len(self._pdf))
        total = float(sum(weights))
        bounds = np.cumsum([0] + [w / total for w in weights])
        return [self._new(self._pdf[(r >= bounds[i]) & (r < bounds[i + 1])]) for i in range(len(weights))]

    def repartition(self, numPartitions, *cols):
        if isinstance(numPartitions, (str, Column)):
            return self._new(self._pdf, partitions=self._nparts)
        return self._new(self._pdf, partitions=int(numPartitions))

    def coalesce(self, numPartitions):
        return self._new(self._pdf, partitions=min(int(numPartitions), self._nparts))

    def transform(self, func, *args, **kwargs):
        return func(self, *args, **kwargs)

    def alias(self, alias):
        return self

    def hint(self, *a, **k):
        return self

    # ------------------------------------------------------------ пропуски
    @property
    def na(self):
        return DataFrameNaFunctions(self)

    def dropna(self, how="any", thresh=None, subset=None):
        subset = [subset] if isinstance(subset, str) else subset
        if thresh is not None:
            return self._new(self._pdf.dropna(thresh=thresh, subset=subset))
        return self._new(self._pdf.dropna(how=how, subset=subset))

    def fillna(self, value, subset=None):
        subset = [subset] if isinstance(subset, str) else subset
        pdf = self._pdf.copy()
        if isinstance(value, dict):
            for k, v in value.items():
                k = _resolve(pdf, k)
                pdf[k] = pdf[k].where(pdf[k].notna(), v)
            return self._new(pdf)
        cols = subset or list(pdf.columns)
        for c in cols:
            s = pdf[c]
            t = self._type_of(c)
            ok = (isinstance(value, bool) and isinstance(t, BooleanType)) or \
                 (isinstance(value, (int, float)) and not isinstance(value, bool) and isinstance(t, (IntegerType, LongType, DoubleType))) or \
                 (isinstance(value, str) and isinstance(t, StringType))
            if ok:
                if isinstance(t, (IntegerType, LongType)) and isinstance(value, float):
                    value_c = int(value)
                else:
                    value_c = value
                pdf[c] = s.where(s.notna(), value_c)
                if isinstance(t, (IntegerType, LongType)):
                    pdf[c] = pdf[c].astype("Int64")
        return self._new(pdf)

    def replace(self, to_replace, value=None, subset=None):
        subset = [subset] if isinstance(subset, str) else subset
        pdf = self._pdf.copy()
        cols = subset or list(pdf.columns)
        if isinstance(to_replace, dict):
            mapping = to_replace
        elif isinstance(to_replace, (list, tuple)):
            vals = value if isinstance(value, (list, tuple)) else [value] * len(to_replace)
            mapping = dict(zip(to_replace, vals))
        else:
            mapping = {to_replace: value}
        for c in cols:
            pdf[c] = pdf[c].map(lambda v: mapping.get(v, v) if not isinstance(v, (list, dict)) and not _isnull(v) else v)
        return self._new(pdf)

    # ------------------------------------------------------------ SQL / запись
    def createOrReplaceTempView(self, name):
        self.sparkSession._views[name.lower()] = self

    createTempView = createOrReplaceTempView
    createOrReplaceGlobalTempView = createOrReplaceTempView
    createGlobalTempView = createOrReplaceTempView
    registerTempTable = createOrReplaceTempView

    @property
    def write(self):
        return DataFrameWriter(self)

    @property
    def stat(self):
        return self

    def corr(self, col1, col2, method=None):
        return float(pd.to_numeric(self._pdf[col1]).corr(pd.to_numeric(self._pdf[col2])))

    def approxQuantile(self, col, probabilities, relativeError):
        s = pd.to_numeric(self._pdf[col]).dropna()
        return [float(s.quantile(p)) for p in probabilities]

    def crosstab(self, col1, col2):
        t = pd.crosstab(self._pdf[col1], self._pdf[col2]).reset_index()
        t.columns = [f"{col1}_{col2}"] + [str(c) for c in t.columns[1:]]
        return DataFrame(t, self._session)

    def freqItems(self, cols, support=None):
        return self


def _do_explode(pdf, name, mode):
    pdf = pdf.copy()
    if mode == "inner":
        pdf = pdf[pdf[name].map(lambda v: isinstance(v, (list, tuple, np.ndarray)) and len(v) > 0)]
    pdf[name] = pdf[name].map(lambda v: list(v) if isinstance(v, (list, tuple, np.ndarray)) else v)
    pdf = pdf.explode(name, ignore_index=True)
    pdf[name] = _tidy(pdf[name].astype(object))
    return pdf


class GroupedData:
    def __init__(self, df, keys):
        self._df = df
        self._keys = [_c(k) for k in keys]

    def __repr__(self):
        return f"GroupedData[grouping expressions: [{', '.join(k._name for k in self._keys)}], value: {self._df!r}, type: GroupBy]"

    def agg(self, *exprs):
        if len(exprs) == 1 and isinstance(exprs[0], dict):
            from . import functions as F
            fmap = {"avg": F.avg, "mean": F.avg, "sum": F.sum, "max": F.max, "min": F.min, "count": F.count,
                    "first": F.first, "last": F.last, "collect_list": F.collect_list}
            exprs = [fmap[f.lower()](c) for c, f in exprs[0].items()]
        exprs = _flatten(exprs)
        for e in exprs:
            if not isinstance(e, Column) or not e._is_agg:
                raise AnalysisException(
                    f"[MISSING_AGGREGATION] В agg() нужны агрегатные функции (F.count, F.sum, F.avg, ...), "
                    f"получено: {getattr(e, '_name', e)}")
        src = self._df._pdf
        keynames = [k._name for k in self._keys]
        types = {}
        nonnull = set()
        if not self._keys:
            row = {e._name: e._aggfn(src) for e in exprs}
            for e in exprs:
                if e._dtype is not None:
                    types[e._name] = e._dtype
                if e._nonnull:
                    nonnull.add(e._name)
            pdf = pd.DataFrame([row])
            for c in pdf.columns:
                pdf[c] = _tidy(pdf[c].astype(object))
            return DataFrame(pdf, self._df._session, types, 1, nonnull)
        tmp = src.copy()
        kcols = []
        for i, k in enumerate(self._keys):
            kc = f"__k{i}"
            tmp[kc] = k._eval(src).astype(object).values
            kcols.append(kc)
            if k._ref and k._ref in self._df._types:
                types[k._name] = self._df._types[k._ref]
            elif k._dtype is not None:
                types[k._name] = k._dtype
        rows = []
        for key, g in tmp.groupby(kcols, sort=False, dropna=False):
            key = key if isinstance(key, tuple) else (key,)
            g = g.drop(columns=kcols)
            rows.append(list(_py(v) for v in key) + [e._aggfn(g) for e in exprs])
        pdf = pd.DataFrame(rows, columns=keynames + [e._name for e in exprs]) if rows else \
            pd.DataFrame(columns=keynames + [e._name for e in exprs])
        for c in pdf.columns:
            pdf[c] = _tidy(pdf[c].astype(object))
        for e in exprs:
            if e._dtype is not None:
                types[e._name] = e._dtype
            if e._nonnull:
                nonnull.add(e._name)
        return DataFrame(pdf, self._df._session, types, self._df._nparts, nonnull)

    def count(self):
        from . import functions as F
        return self.agg(F.count("*").alias("count"))

    def _multi(self, fname, cols):
        from . import functions as F
        f = getattr(F, fname)
        if not cols:
            cols = [c for c in self._df.columns if self._df._pdf[c].dtype.kind in "iuf" or str(self._df._pdf[c].dtype) == "Int64"]
            cols = [c for c in cols if c not in [k._name for k in self._keys]]
        return self.agg(*[f(c) for c in cols])

    def sum(self, *cols): return self._multi("sum", cols)
    def avg(self, *cols): return self._multi("avg", cols)
    mean = avg
    def max(self, *cols): return self._multi("max", cols)
    def min(self, *cols): return self._multi("min", cols)

    def pivot(self, pivot_col, values=None):
        return _Pivot(self, pivot_col, values)

    def applyInPandas(self, func, schema):
        parts = []
        src = self._df._pdf
        for _, g in src.groupby([k._name for k in self._keys], sort=False):
            parts.append(func(g.reset_index(drop=True)))
        return DataFrame(pd.concat(parts, ignore_index=True), self._df._session)


class _Pivot:
    def __init__(self, gd, col, values):
        self.gd, self.col, self.values = gd, col, values

    def _run(self, expr):
        df = self.gd._df
        vals = self.values or sorted(df._pdf[self.col].dropna().unique().tolist(), key=str)
        keys = [k._name for k in self.gd._keys]
        out = None
        for v in vals:
            part = df.filter(_c(self.col) == v).groupBy(*keys).agg(expr.alias(str(v)))
            out = part if out is None else out.join(part, keys, "outer")
        return out

    def agg(self, expr):
        return self._run(expr)

    def count(self):
        from . import functions as F
        return self._run(F.count("*"))

    def sum(self, c):
        from . import functions as F
        return self._run(F.sum(c))

    def avg(self, c):
        from . import functions as F
        return self._run(F.avg(c))


class DataFrameNaFunctions:
    def __init__(self, df):
        self.df = df

    def drop(self, how="any", thresh=None, subset=None):
        return self.df.dropna(how, thresh, subset)

    def fill(self, value, subset=None):
        return self.df.fillna(value, subset)

    def replace(self, to_replace, value=None, subset=None):
        return self.df.replace(to_replace, value, subset)


# ---------------------------------------------------------------- запись
def _strip_scheme(path):
    p = str(path)
    for pre in ("file://", "file:"):
        if p.startswith(pre):
            return p[len(pre):]
    if p.startswith("hdfs://"):
        raise AnalysisException("Эмулятор Spark работает с локальными файлами браузера. Уберите префикс hdfs:// "
                                "(в настоящем кластере путь hdfs://... работал бы).")
    return p


class DataFrameWriter:
    def __init__(self, df):
        self._df = df
        self._mode = "errorifexists"
        self._format = "parquet"
        self._opts = {}
        self._partition_by = []

    def mode(self, saveMode):
        self._mode = (saveMode or "errorifexists").lower()
        return self

    def format(self, source):
        self._format = source.lower()
        return self

    def option(self, key, value):
        self._opts[key.lower()] = value
        return self

    def options(self, **opts):
        for k, v in opts.items():
            self.option(k, v)
        return self

    def partitionBy(self, *cols):
        self._partition_by = _flatten(cols)
        return self

    def csv(self, path, mode=None, header=None, sep=None, **kw):
        if header is not None:
            self._opts["header"] = header
        if sep is not None:
            self._opts["sep"] = sep
        self._save(path, "csv", mode)

    def json(self, path, mode=None, **kw):
        self._save(path, "json", mode)

    def parquet(self, path, mode=None, **kw):
        self._save(path, "parquet", mode)

    def orc(self, path, mode=None, **kw):
        self._save(path, "parquet", mode)

    def text(self, path, **kw):
        self._save(path, "text", None)

    def save(self, path=None, format=None, mode=None, **options):
        self.options(**options)
        self._save(path, (format or self._format), mode)

    def saveAsTable(self, name, format=None, mode=None, **options):
        self._df.createOrReplaceTempView(name)

    insertInto = saveAsTable

    def _save(self, path, fmt, mode):
        if mode:
            self._mode = mode.lower()
        path = _strip_scheme(path)
        if os.path.exists(path):
            if self._mode in ("errorifexists", "error", "default"):
                raise AnalysisException(f"[PATH_ALREADY_EXISTS] Path file:{os.path.abspath(path)} already exists. "
                                        f"Set mode as \"overwrite\" to overwrite the existing path.")
            if self._mode == "ignore":
                return
            if self._mode == "overwrite":
                shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
        os.makedirs(path, exist_ok=True)
        df = self._df
        if self._partition_by:
            pc = self._partition_by
            for key, g in df._pdf.groupby(pc, dropna=False):
                key = key if isinstance(key, tuple) else (key,)
                sub = os.path.join(path, *[f"{c}={'__HIVE_DEFAULT_PARTITION__' if _isnull(v) else v}" for c, v in zip(pc, key)])
                os.makedirs(sub, exist_ok=True)
                self._write_parts(df._new(g.drop(columns=pc)), sub, fmt)
        else:
            self._write_parts(df, path, fmt)
        open(os.path.join(path, "_SUCCESS"), "w").close()

    def _write_parts(self, df, path, fmt):
        n = max(1, df._nparts)
        uid = uuid.uuid4()
        chunks = np.array_split(np.arange(len(df._pdf)), n) if len(df._pdf) else [np.arange(0)]
        ext = {"csv": "csv", "json": "json", "parquet": "snappy.parquet", "text": "txt"}.get(fmt, fmt)
        for i, idx in enumerate(chunks):
            part = df._pdf.iloc[idx]
            fname = os.path.join(path, f"part-{i:05d}-{uid}-c000.{ext}")
            if fmt == "csv":
                header = str(self._opts.get("header", "false")).lower() == "true"
                sep = self._opts.get("sep", self._opts.get("delimiter", ","))
                out = part.copy()
                for c in out.columns:
                    out[c] = out[c].map(lambda v: "" if _isnull(v) else _fmt(v))
                out.to_csv(fname, index=False, header=header, sep=sep)
            elif fmt in ("json", "parquet"):
                with open(fname, "w", encoding="utf-8") as f:
                    for r in df._rows(part):
                        f.write(json.dumps({k: v for k, v in r.asDict().items() if v is not None},
                                           ensure_ascii=False, default=str) + "\n")
                if fmt == "parquet":
                    with open(os.path.join(path, "_schema.json"), "w", encoding="utf-8") as f:
                        json.dump({c: t for c, t in df.dtypes}, f)
            elif fmt == "text":
                if len(df.columns) != 1:
                    raise AnalysisException("Text data source supports only a single column.")
                with open(fname, "w", encoding="utf-8") as f:
                    for v in part.iloc[:, 0]:
                        f.write(("" if _isnull(v) else str(v)) + "\n")
            else:
                raise ValueError(f"Формат {fmt} не поддерживается эмулятором")
