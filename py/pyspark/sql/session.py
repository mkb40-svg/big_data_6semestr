# -*- coding: utf-8 -*-
"""SparkSession, чтение данных и SQL (через SQLite) — учебный эмулятор."""
import datetime as _dt
import glob
import json
import os
import re
from collections import namedtuple

import numpy as np
import pandas as pd

from pyspark.errors import AnalysisException
from pyspark.context import SparkContext, SparkConf
from .column import _isnull, _py, _cast_series, _tidy
from .dataframe import DataFrame, _strip_scheme, _flatten
from .types import (StructType, StructField, DataType, StringType, IntegerType, LongType, DoubleType, BooleanType,
                    DateType, TimestampType, ArrayType, Row, _parse_ddl, _parse_type)


class _classproperty:
    def __init__(self, f):
        self.f = f

    def __get__(self, obj, owner):
        return self.f(owner)


def _truthy(v):
    return str(v).strip().lower() in ("true", "1", "yes")


def _normalize(s):
    vals = s.dropna()
    if len(vals) == 0:
        return s.astype(object).where(s.notna(), None)
    if all(isinstance(v, (bool, np.bool_)) for v in vals):
        return s.astype(object).where(s.notna(), None)
    if all(isinstance(v, (int, np.integer)) and not isinstance(v, (bool, np.bool_)) for v in vals):
        return s.astype("Int64")
    if all(isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_)) for v in vals):
        return s.astype("float64")
    if s.dtype.kind == "M":
        return s
    return s.astype(object).where(s.notna(), None)


Table = namedtuple("Table", "name catalog namespace description tableType isTemporary")
Database = namedtuple("Database", "name catalog description locationUri")


class RuntimeConfig:
    def __init__(self, values):
        self._v = dict(values)

    def get(self, key, default=None):
        return self._v.get(key, default)

    def set(self, key, value):
        self._v[key] = str(value)

    def unset(self, key):
        self._v.pop(key, None)

    def isModifiable(self, key):
        return key.startswith("spark.sql.")

    def getAll(self):
        return dict(self._v)


class Catalog:
    def __init__(self, spark):
        self._spark = spark

    def listTables(self, dbName=None, pattern=None):
        return [Table(n, None, [], None, "TEMPORARY", True) for n in sorted(self._spark._views)]

    def listDatabases(self, pattern=None):
        return [Database("default", "spark_catalog", "default database", "file:/home/pyodide/spark-warehouse")]

    def currentDatabase(self):
        return "default"

    def tableExists(self, tableName, dbName=None):
        return tableName.lower() in self._spark._views

    def dropTempView(self, viewName):
        return self._spark._views.pop(viewName.lower(), None) is not None

    dropGlobalTempView = dropTempView

    def listColumns(self, tableName, dbName=None):
        df = self._spark.table(tableName)
        Col = namedtuple("Column", "name description dataType nullable isPartition isBucket")
        return [Col(f.name, None, f.dataType.simpleString(), f.nullable, False, False) for f in df.schema]

    def cacheTable(self, *a, **k):
        pass

    def uncacheTable(self, *a, **k):
        pass

    def isCached(self, *a, **k):
        return False

    def clearCache(self):
        pass


class UDFRegistration:
    def __init__(self, spark):
        self._spark = spark

    def register(self, name, f, returnType=None):
        from . import functions as F
        self._spark._udfs[name] = f
        return F.udf(f, returnType or StringType())


class SparkSession:
    _active = None

    class Builder:
        def __init__(self):
            self._opts = {}

        def appName(self, name):
            self._opts["spark.app.name"] = name
            return self

        def master(self, master):
            self._opts["spark.master"] = master
            return self

        def config(self, key=None, value=None, conf=None, map=None):
            if conf is not None:
                for k, v in conf.getAll():
                    self._opts[k] = v
            if map:
                self._opts.update({k: str(v) for k, v in map.items()})
            if key is not None:
                self._opts[key] = str(value)
            return self

        def enableHiveSupport(self):
            return self

        def remote(self, url):
            return self

        def getOrCreate(self):
            s = SparkSession._active
            if s is None or s._stopped:
                s = SparkSession(self._opts)
                SparkSession._active = s
            else:
                for k, v in self._opts.items():
                    if k.startswith("spark.sql."):
                        s.conf.set(k, v)
            return s

        create = getOrCreate

    builder = _classproperty(lambda cls: cls.Builder())

    def __init__(self, opts=None, sparkContext=None):
        opts = dict(opts or {})
        conf = SparkConf()
        conf.set("spark.app.name", opts.get("spark.app.name", "pyspark-shell"))
        conf.set("spark.master", opts.get("spark.master", "local[*]"))
        for k, v in opts.items():
            conf.set(k, v)
        self._sc = sparkContext or SparkContext.getOrCreate(conf)
        defaults = {"spark.sql.shuffle.partitions": "200", "spark.driver.memory": "1g",
                    "spark.executor.memory": "1g", "spark.sql.adaptive.enabled": "true",
                    "spark.app.name": self._sc.appName, "spark.master": self._sc.master}
        defaults.update(opts)
        self.conf = RuntimeConfig(defaults)
        self._views = {}
        self._udfs = {}
        self._stopped = False
        self.catalog = Catalog(self)
        self.udf = UDFRegistration(self)

    # -------------------------------------------------------------- свойства
    @property
    def sparkContext(self):
        return self._sc

    @property
    def version(self):
        return "3.5.1"

    @property
    def read(self):
        return DataFrameReader(self)

    @property
    def readStream(self):
        raise NotImplementedError("Structured Streaming не поддерживается учебным эмулятором")

    @classmethod
    def getActiveSession(cls):
        return cls._active

    @classmethod
    def active(cls):
        return cls._active

    def newSession(self):
        s = SparkSession(self.conf.getAll(), self._sc)
        return s

    def stop(self):
        self._stopped = True
        self._sc.stop()
        if SparkSession._active is self:
            SparkSession._active = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.stop()

    def _repr_html_(self):
        return (f"<div><p><b>SparkSession - in-memory</b> <small>(учебный эмулятор)</small></p>"
                f"<div><p><b>SparkContext</b></p><p><a href='#' onclick='return false'>Spark UI</a> "
                f"<small>(http://localhost:4040 в настоящем Spark)</small></p>"
                f"<dl><dt>Version</dt><dd><code>v{self.version}</code></dd>"
                f"<dt>Master</dt><dd><code>{self._sc.master}</code></dd>"
                f"<dt>AppName</dt><dd><code>{self._sc.appName}</code></dd></dl></div></div>")

    def __repr__(self):
        return f"<pyspark.sql.session.SparkSession object (master={self._sc.master}, app={self._sc.appName})>"

    # -------------------------------------------------------------- DataFrame
    def createDataFrame(self, data, schema=None, samplingRatio=None, verifySchema=True):
        from pyspark.rdd import RDD
        st, names = None, None
        if isinstance(schema, str):
            try:
                st = _parse_ddl(schema)
                if len(st.fields) == 1 and " " not in schema.strip() and ":" not in schema:
                    st = StructType([StructField("value", _parse_type(schema))])
            except Exception:
                st = StructType([StructField("value", _parse_type(schema))])
        elif isinstance(schema, StructType):
            st = schema
        elif isinstance(schema, DataType):
            st = StructType([StructField("value", schema)])
        elif isinstance(schema, (list, tuple)):
            names = list(schema)

        if isinstance(data, RDD):
            data = data.collect()
        if isinstance(data, pd.DataFrame):
            pdf = data.copy()
            if names:
                pdf.columns = names
            elif st:
                pdf.columns = st.fieldNames()
        else:
            data = list(data)
            if not data and st is None and names is None:
                raise ValueError("[CANNOT_INFER_EMPTY_SCHEMA] Can not infer schema from an empty dataset.")
            first = data[0] if data else None
            if isinstance(first, Row) and first.__dict__.get("__fields__"):
                keys = list(first.__fields__)
                records = [list(r) for r in data]
            elif isinstance(first, dict):
                keys = []
                for d in data:
                    for k in d:
                        if k not in keys:
                            keys.append(k)
                records = [[d.get(k) for k in keys] for d in data]
            elif isinstance(first, (list, tuple)):
                records = [list(r) for r in data]
                keys = [f"_{i + 1}" for i in range(len(first))]
            elif first is None and not data:
                records, keys = [], []
            else:
                if st is None:
                    raise TypeError(f"[CANNOT_INFER_SCHEMA_FOR_TYPE] Can not infer schema for type: "
                                    f"`{type(first).__name__}`. Подсказка: передайте список кортежей [(1,), (2,)] "
                                    f"или укажите схему, например schema='int'.")
                records = [[v] for v in data]
                keys = ["value"]
            if st is not None:
                if records and len(st.fields) != len(records[0]):
                    raise ValueError(f"[LENGTH_SHOULD_BE_THE_SAME] schema и данные: {len(st.fields)} vs {len(records[0])}")
                if isinstance(first, dict):
                    records = [[d.get(k) for k in st.fieldNames()] for d in data]
                keys = st.fieldNames()
            elif names:
                if records and len(names) != len(records[0]):
                    raise ValueError(f"[LENGTH_SHOULD_BE_THE_SAME] names и данные: {len(names)} vs {len(records[0])}")
                if isinstance(first, dict):
                    records = [[d.get(k) for k in names] for d in data]
                keys = names
            pdf = pd.DataFrame(records, columns=keys, dtype=object) if records else pd.DataFrame(columns=keys)
        types, nonnull = {}, set()
        for c in pdf.columns:
            pdf[c] = _normalize(pdf[c])
        if st is not None:
            for f in st.fields:
                types[f.name] = f.dataType
                if not f.nullable:
                    nonnull.add(f.name)
                if not isinstance(f.dataType, (ArrayType, StructType)) and f.name in pdf.columns:
                    pdf[f.name] = _cast_series(pdf[f.name], f.dataType)
        return DataFrame(pdf, self, types, self._sc.defaultParallelism, nonnull)

    def range(self, start, end=None, step=1, numPartitions=None):
        if end is None:
            start, end = 0, start
        pdf = pd.DataFrame({"id": pd.Series(range(start, end, step), dtype="Int64")})
        return DataFrame(pdf, self, {"id": LongType()}, numPartitions or self._sc.defaultParallelism, {"id"})

    def table(self, tableName):
        df = self._views.get(tableName.lower())
        if df is None:
            raise AnalysisException(f"[TABLE_OR_VIEW_NOT_FOUND] The table or view `{tableName}` cannot be found.")
        return df

    def sql(self, sqlQuery, args=None, **kwargs):
        q = sqlQuery.strip().rstrip(";")
        low = q.lower()
        if re.match(r"^show\s+(tables|views)", low):
            names = sorted(self._views)
            return DataFrame(pd.DataFrame({"namespace": [""] * len(names), "tableName": names,
                                           "isTemporary": [True] * len(names)}), self)
        m = re.match(r"^(describe|desc)\s+(table\s+)?`?(\w+)`?$", low)
        if m:
            df = self.table(m.group(3))
            return DataFrame(pd.DataFrame({"col_name": df.columns, "data_type": [t for _, t in df.dtypes],
                                           "comment": [None] * len(df.columns)}), self)
        m = re.match(r"^create\s+(or\s+replace\s+)?(temporary\s+|temp\s+)?view\s+`?(\w+)`?\s+as\s+(.*)$", q, re.I | re.S)
        if m:
            df = _sql_query(self._views, m.group(4), self)
            self._views[m.group(3).lower()] = df
            return DataFrame(pd.DataFrame(), self)
        m = re.match(r"^drop\s+view\s+(if\s+exists\s+)?`?(\w+)`?$", low)
        if m:
            self._views.pop(m.group(2), None)
            return DataFrame(pd.DataFrame(), self)
        return _sql_query(self._views, q, self)


# ------------------------------------------------------------------ SQL через SQLite
def _translate(q):
    q = re.sub(r"\bAS\s+STRING\b", "AS TEXT", q, flags=re.I)
    q = re.sub(r"\bAS\s+DOUBLE\b", "AS REAL", q, flags=re.I)
    q = re.sub(r"\bAS\s+(BIGINT|LONG|INT)\b", "AS INTEGER", q, flags=re.I)
    q = re.sub(r"\bAS\s+BOOLEAN\b", "AS INTEGER", q, flags=re.I)
    q = re.sub(r"\bRLIKE\b", "REGEXP", q, flags=re.I)
    q = re.sub(r"\bILIKE\b", "LIKE", q, flags=re.I)
    return q


class _CollectList:
    def __init__(self):
        self.items = []

    def step(self, v):
        if v is not None:
            self.items.append(v)

    def finalize(self):
        return json.dumps(self.items, ensure_ascii=False)


class _CollectSet(_CollectList):
    def finalize(self):
        return json.dumps(list(dict.fromkeys(self.items)), ensure_ascii=False)


class _Std:
    def __init__(self):
        self.v = []

    def step(self, x):
        if x is not None:
            self.v.append(float(x))

    def finalize(self):
        return float(np.std(self.v, ddof=1)) if len(self.v) > 1 else None


def _d(v):
    if v is None:
        return None
    try:
        return pd.to_datetime(v)
    except Exception:
        return None


def _conn(session=None):
    import sqlite3
    conn = sqlite3.connect(":memory:")
    f = conn.create_function
    f("year", 1, lambda v: (lambda d: d.year if d is not None else None)(_d(v)))
    f("month", 1, lambda v: (lambda d: d.month if d is not None else None)(_d(v)))
    f("day", 1, lambda v: (lambda d: d.day if d is not None else None)(_d(v)))
    f("dayofmonth", 1, lambda v: (lambda d: d.day if d is not None else None)(_d(v)))
    f("hour", 1, lambda v: (lambda d: d.hour if d is not None else None)(_d(v)))
    f("to_date", 1, lambda v: (lambda d: d.date().isoformat() if d is not None else None)(_d(v)))
    f("concat", -1, lambda *a: None if any(x is None for x in a) else "".join(str(x) for x in a))
    f("concat_ws", -1, lambda sep, *a: sep.join(str(x) for x in a if x is not None))
    f("regexp", 2, lambda p, s: 1 if s is not None and re.search(p, str(s)) else 0)
    f("regexp_replace", 3, lambda s, p, r: None if s is None else re.sub(p, re.sub(r"\$(\d)", r"\\\1", r), str(s)))
    f("initcap", 1, lambda s: None if s is None else " ".join(w[:1].upper() + w[1:].lower() for w in str(s).split(" ")))
    f("split", 2, lambda s, p: None if s is None else json.dumps(re.split(p, str(s)), ensure_ascii=False))
    f("size", 1, lambda s: len(json.loads(s)) if s else -1)
    f("sqrt", 1, lambda v: None if v is None or v < 0 else float(np.sqrt(v)))
    f("pow", 2, lambda a, b: None if a is None or b is None else float(a) ** float(b))
    f("power", 2, lambda a, b: None if a is None or b is None else float(a) ** float(b))
    f("ln", 1, lambda v: None if not v or v <= 0 else float(np.log(v)))
    f("log10", 1, lambda v: None if not v or v <= 0 else float(np.log10(v)))
    f("floor", 1, lambda v: None if v is None else int(np.floor(v)))
    f("ceil", 1, lambda v: None if v is None else int(np.ceil(v)))
    conn.create_aggregate("collect_list", 1, _CollectList)
    conn.create_aggregate("collect_set", 1, _CollectSet)
    conn.create_aggregate("stddev", 1, _Std)
    conn.create_aggregate("std", 1, _Std)
    if session is not None:
        for name, fn in session._udfs.items():
            f(name, -1, fn)
    return conn


def _to_sql_frame(pdf):
    out = pd.DataFrame(index=pdf.index)
    for c in pdf.columns:
        s = pdf[c]
        if s.dtype.kind == "M":
            out[c] = s.map(lambda v: None if _isnull(v) else v.strftime("%Y-%m-%d %H:%M:%S"))
        elif s.dtype == object:
            def conv(v):
                if isinstance(v, (list, dict)):
                    return json.dumps(_py(v), ensure_ascii=False, default=str)
                if _isnull(v):
                    return None
                if isinstance(v, (bool, np.bool_)):
                    return int(v)
                if isinstance(v, (_dt.date, _dt.datetime)):
                    return v.isoformat(sep=" ") if isinstance(v, _dt.datetime) else v.isoformat()
                return v
            out[c] = s.map(conv).astype(object)
        elif str(s.dtype) == "Int64":
            out[c] = s.astype(object).where(s.notna(), None)
        elif str(s.dtype) == "boolean":
            out[c] = s.astype(object).map(lambda v: None if _isnull(v) else int(v))
        else:
            out[c] = s
    return out


def _nice_name(n):
    n = re.sub(r"\bCOUNT\(\s*\*\s*\)", "count(1)", n, flags=re.I)
    return re.sub(r"\b([A-Za-z_]+)\(", lambda m: m.group(1).lower() + "(", n)


def _sql_query(views, query, session=None):
    import sqlite3
    conn = _conn(session)
    srcs = {}
    for name, df in views.items():
        _to_sql_frame(df._pdf).to_sql(name, conn, index=False)
        srcs[name] = df
    try:
        cur = conn.execute(_translate(query))
    except sqlite3.Error as e:
        raise AnalysisException(
            f"[SQL_ERROR] {e}. Проверьте запрос: имена таблиц (createOrReplaceTempView), столбцов и синтаксис. "
            f"Доступные представления: {', '.join(sorted(views)) or 'нет'}") from None
    if cur.description is None:
        return DataFrame(pd.DataFrame(), session)
    cols = [_nice_name(d[0]) for d in cur.description]
    rows = cur.fetchall()
    pdf = pd.DataFrame(rows, columns=cols) if rows else pd.DataFrame(columns=cols)
    types = {}
    for c in pdf.columns:
        for df in srcs.values():
            if c in df._types:
                t = df._types[c]
                types[c] = t
                if isinstance(t, (DateType, TimestampType)):
                    pdf[c] = _cast_series(pdf[c], t)
                break
            if c in df._pdf.columns and isinstance(df._type_of(c), (DateType, TimestampType, BooleanType)):
                t = df._type_of(c)
                types[c] = t
                pdf[c] = _cast_series(pdf[c], t)
                break
        if c not in types:
            pdf[c] = _normalize(pdf[c])
    conn.close()
    return DataFrame(pdf, session, types)


def _sql_filter_mask(pdf, cond):
    import sqlite3
    conn = _conn()
    t = _to_sql_frame(pdf)
    t["__rid"] = range(len(t))
    t.to_sql("__t", conn, index=False)
    try:
        ids = {r[0] for r in conn.execute(f"SELECT __rid FROM __t WHERE {_translate(cond)}")}
    except sqlite3.Error as e:
        raise AnalysisException(f"[SQL_ERROR] Не удалось разобрать условие «{cond}»: {e}") from None
    return pd.Series([i in ids for i in range(len(t))], index=pdf.index)


def _sql_rowwise(pdf, expr):
    import sqlite3
    conn = _conn()
    t = _to_sql_frame(pdf)
    t["__rid"] = range(len(t))
    t.to_sql("__t", conn, index=False)
    try:
        vals = [r[0] for r in conn.execute(f"SELECT {_translate(expr)} AS __v FROM __t ORDER BY __rid")]
    except sqlite3.Error as e:
        raise AnalysisException(f"[SQL_ERROR] Не удалось вычислить выражение «{expr}»: {e}") from None
    if len(vals) != len(pdf):
        raise AnalysisException(f"Выражение «{expr}» похоже на агрегат; используйте его в agg() или spark.sql().")
    return _normalize(pd.Series(vals, index=pdf.index, dtype=object))


# ------------------------------------------------------------------ чтение файлов
_INT = re.compile(r"^[+-]?\d+$")
_FLOAT = re.compile(r"^[+-]?((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?|NaN|Infinity)$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TS = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$")


def _infer_col(s):
    vals = s.dropna()
    vals = vals[vals.map(lambda v: str(v).strip() != "")]
    if not len(vals):
        return s.astype(object).where(s.notna(), None), StringType()
    sv = vals.map(lambda v: str(v).strip())
    if sv.map(lambda v: bool(_INT.match(v))).all():
        n = pd.to_numeric(s.map(lambda v: None if _isnull(v) or str(v).strip() == "" else str(v).strip())).astype("Int64")
        big = n.dropna().abs().max() if n.notna().any() else 0
        return n, (IntegerType() if big < 2 ** 31 else LongType())
    if sv.map(lambda v: bool(_FLOAT.match(v))).all():
        return pd.to_numeric(s, errors="coerce").astype("float64"), DoubleType()
    if sv.map(lambda v: v.lower() in ("true", "false")).all():
        return s.map(lambda v: None if _isnull(v) else str(v).strip().lower() == "true").astype(object), BooleanType()
    if sv.map(lambda v: bool(_DATE.match(v))).all():
        return _cast_series(s, DateType()), DateType()
    if sv.map(lambda v: bool(_TS.match(v))).all():
        return pd.to_datetime(s, errors="coerce"), TimestampType()
    return s.astype(object).where(s.notna(), None), StringType()


def _files(path):
    paths = path if isinstance(path, (list, tuple)) else [path]
    out = []
    for p in paths:
        p = _strip_scheme(p)
        matches = sorted(glob.glob(p)) if any(ch in p for ch in "*?[") else [p]
        if not matches or not os.path.exists(matches[0]):
            raise AnalysisException(f"[PATH_NOT_FOUND] Path does not exist: file:{os.path.abspath(p)}.")
        for m in matches:
            if os.path.isdir(m):
                for root, dirs, files in os.walk(m):
                    dirs.sort()
                    for fn in sorted(files):
                        if fn.startswith(("_", ".")) or fn.endswith(".crc"):
                            continue
                        rel = os.path.relpath(root, m)
                        parts = {}
                        if rel != ".":
                            for seg in rel.split(os.sep):
                                if "=" in seg:
                                    k, v = seg.split("=", 1)
                                    parts[k] = None if v == "__HIVE_DEFAULT_PARTITION__" else v
                        out.append((os.path.join(root, fn), parts))
            else:
                out.append((m, {}))
    return out


class DataFrameReader:
    def __init__(self, spark):
        self._spark = spark
        self._format = "parquet"
        self._opts = {}
        self._schema = None

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

    def schema(self, schema):
        self._schema = schema
        return self

    def load(self, path=None, format=None, schema=None, **options):
        self.options(**options)
        if schema is not None:
            self._schema = schema
        fmt = (format or self._format).lower()
        if fmt == "csv":
            return self.csv(path)
        if fmt == "json":
            return self.json(path)
        if fmt == "text":
            return self.text(path)
        if fmt in ("parquet", "orc"):
            return self.parquet(path)
        raise ValueError(f"Формат {fmt} не поддерживается эмулятором (доступны csv, json, text, parquet)")

    def _finish(self, pdf, types, files_parts, nparts=1):
        if any(p for _, p in files_parts):
            pass
        return DataFrame(pdf, self._spark, types, nparts)

    def csv(self, path, schema=None, sep=None, header=None, inferSchema=None, nullValue=None, encoding=None,
            quote=None, escape=None, comment=None, multiLine=None, mode=None, delimiter=None, **kw):
        for k, v in dict(sep=sep, header=header, inferschema=inferSchema, nullvalue=nullValue, encoding=encoding,
                         quote=quote, comment=comment, delimiter=delimiter).items():
            if v is not None:
                self._opts[k] = v
        if schema is not None:
            self._schema = schema
        o = self._opts
        hdr = _truthy(o.get("header", False))
        sep_ = o.get("sep", o.get("delimiter", ","))
        frames = []
        for f, parts in _files(path):
            na = [o["nullvalue"]] if "nullvalue" in o else [""]
            d = pd.read_csv(f, sep=sep_, header=0 if hdr else None, dtype=str, keep_default_na=False, na_values=na,
                            quotechar=o.get("quote", '"'), comment=o.get("comment"), encoding=o.get("encoding", "utf-8"))
            for k, v in parts.items():
                d[k] = v
            frames.append(d)
        pdf = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        if not hdr:
            pdf.columns = [f"_c{i}" for i in range(len(pdf.columns))]
        types = {}
        sch = self._schema
        if sch is not None:
            st = _parse_ddl(sch) if isinstance(sch, str) else sch
            names = st.fieldNames()
            pdf = pdf.iloc[:, :len(names)]
            pdf.columns = names[:len(pdf.columns)]
            for fld in st.fields:
                if fld.name in pdf.columns:
                    pdf[fld.name] = _cast_series(pdf[fld.name], fld.dataType)
                    types[fld.name] = fld.dataType
        elif _truthy(o.get("inferschema", False)):
            for c in pdf.columns:
                pdf[c], types[c] = _infer_col(pdf[c])
        else:
            for c in pdf.columns:
                pdf[c] = pdf[c].astype(object).where(pdf[c].notna(), None)
                types[c] = StringType()
        return DataFrame(pdf, self._spark, types, max(1, len(frames)))

    def json(self, path, schema=None, multiLine=None, **kw):
        if multiLine is not None:
            self._opts["multiline"] = multiLine
        if schema is not None:
            self._schema = schema
        ml = _truthy(self._opts.get("multiline", False))
        records = []
        fcount = 0
        for f, parts in _files(path):
            fcount += 1
            with open(f, encoding="utf-8") as fh:
                text = fh.read()
            if ml:
                obj = json.loads(text)
                recs = obj if isinstance(obj, list) else [obj]
            else:
                recs = []
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        r = json.loads(line)
                        recs.append(r if isinstance(r, dict) else {"_corrupt_record": line})
                    except json.JSONDecodeError:
                        recs.append({"_corrupt_record": line})
            for r in recs:
                r.update(parts)
            records.extend(recs)
        keys = sorted({k for r in records for k in r})
        pdf = pd.DataFrame([[r.get(k) for k in keys] for r in records], columns=keys)
        for c in pdf.columns:
            pdf[c] = _normalize(pdf[c])
        types = {}
        if self._schema is not None:
            st = _parse_ddl(self._schema) if isinstance(self._schema, str) else self._schema
            for fld in st.fields:
                if fld.name not in pdf.columns:
                    pdf[fld.name] = None
                if not isinstance(fld.dataType, (ArrayType, StructType)):
                    pdf[fld.name] = _cast_series(pdf[fld.name], fld.dataType)
                types[fld.name] = fld.dataType
            pdf = pdf[st.fieldNames()]
        return DataFrame(pdf, self._spark, types, max(1, fcount))

    def text(self, paths, wholetext=False, lineSep=None, **kw):
        rows = []
        for f, parts in _files(paths):
            with open(f, encoding="utf-8") as fh:
                t = fh.read()
            if wholetext:
                rows.append(t)
            else:
                rows.extend(t.split(lineSep) if lineSep else t.splitlines())
        return DataFrame(pd.DataFrame({"value": pd.Series(rows, dtype=object)}), self._spark, {"value": StringType()})

    def parquet(self, *paths, **kw):
        records = []
        types = {}
        for p in paths:
            base = _strip_scheme(p)
            sch = os.path.join(base, "_schema.json")
            if os.path.exists(sch):
                with open(sch, encoding="utf-8") as fh:
                    types.update({k: _parse_type(v) for k, v in json.load(fh).items()})
            for f, parts in _files(p):
                with open(f, encoding="utf-8") as fh:
                    for line in fh:
                        if line.strip():
                            r = json.loads(line)
                            r.update(parts)
                            records.append(r)
        keys = list(types) or sorted({k for r in records for k in r})
        for r in records:
            for k in r:
                if k not in keys:
                    keys.append(k)
        pdf = pd.DataFrame([[r.get(k) for k in keys] for r in records], columns=keys)
        for c in pdf.columns:
            pdf[c] = _normalize(pdf[c])
            if c in types and not isinstance(types[c], (ArrayType, StructType)):
                pdf[c] = _cast_series(pdf[c], types[c])
        return DataFrame(pdf, self._spark, types)

    orc = parquet

    def table(self, tableName):
        return self._spark.table(tableName)
