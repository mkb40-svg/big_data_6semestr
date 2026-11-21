# -*- coding: utf-8 -*-
"""SparkConf и SparkContext — учебный эмулятор."""
import os
import time

from .rdd import RDD, Broadcast, Accumulator


class SparkConf:
    def __init__(self, loadDefaults=True):
        self._conf = {}

    def set(self, key, value):
        self._conf[key] = str(value)
        return self

    def setIfMissing(self, key, value):
        self._conf.setdefault(key, str(value))
        return self

    def setAppName(self, value):
        return self.set("spark.app.name", value)

    def setMaster(self, value):
        return self.set("spark.master", value)

    def setAll(self, pairs):
        for k, v in pairs:
            self.set(k, v)
        return self

    def get(self, key, defaultValue=None):
        return self._conf.get(key, defaultValue)

    def getAll(self):
        return list(self._conf.items())

    def contains(self, key):
        return key in self._conf

    def toDebugString(self):
        return "\n".join(f"{k}={v}" for k, v in self._conf.items())


class SparkContext:
    _active = None

    def __init__(self, master=None, appName=None, conf=None, **kwargs):
        if SparkContext._active is not None:
            a = SparkContext._active
            raise ValueError(f"Cannot run multiple SparkContexts at once; existing SparkContext(app={a.appName}, "
                             f"master={a.master}) created by getOrCreate. Используйте SparkContext.getOrCreate() "
                             f"или spark.sparkContext.")
        self._conf = conf or SparkConf()
        if master:
            self._conf.setMaster(master)
        if appName:
            self._conf.setAppName(appName)
        self._conf.setIfMissing("spark.master", "local[*]")
        self._conf.setIfMissing("spark.app.name", "pyspark-shell")
        self.startTime = int(time.time() * 1000)
        self._log = "WARN"
        SparkContext._active = self

    @classmethod
    def getOrCreate(cls, conf=None):
        if cls._active is None:
            cls(conf=conf)
        return cls._active

    @property
    def master(self):
        return self._conf.get("spark.master")

    @property
    def appName(self):
        return self._conf.get("spark.app.name")

    @property
    def version(self):
        return "3.5.1"

    @property
    def applicationId(self):
        return f"local-{self.startTime}"

    @property
    def uiWebUrl(self):
        return "http://localhost:4040"

    @property
    def defaultParallelism(self):
        m = self.master or "local[*]"
        if m.startswith("local["):
            inner = m[6:-1]
            return 4 if inner == "*" else max(1, int(inner))
        if m == "local":
            return 1
        return 4

    @property
    def defaultMinPartitions(self):
        return min(self.defaultParallelism, 2)

    def getConf(self):
        return self._conf

    def setLogLevel(self, logLevel):
        self._log = logLevel

    def stop(self):
        if SparkContext._active is self:
            SparkContext._active = None

    def __repr__(self):
        return f"<SparkContext master={self.master} appName={self.appName}>"

    def _repr_html_(self):
        return (f"<div><p><b>SparkContext</b> <small>(учебный эмулятор)</small></p>"
                f"<dl><dt>Version</dt><dd><code>v{self.version}</code></dd><dt>Master</dt><dd><code>{self.master}</code>"
                f"</dd><dt>AppName</dt><dd><code>{self.appName}</code></dd></dl></div>")

    # ------------------------------------------------------------ создание RDD
    def parallelize(self, c, numSlices=None):
        return RDD._from_list(list(c), numSlices or self.defaultParallelism, self)

    def range(self, start, end=None, step=1, numSlices=None):
        if end is None:
            start, end = 0, start
        return self.parallelize(range(start, end, step), numSlices)

    def emptyRDD(self):
        return RDD([[]], self)

    def _paths(self, name):
        from pyspark.sql.session import _files
        return [f for f, _ in _files(name)]

    def textFile(self, name, minPartitions=None, use_unicode=True):
        lines = []
        files = self._paths(name)
        for f in files:
            with open(f, encoding="utf-8") as fh:
                lines.extend(fh.read().splitlines())
        n = max(minPartitions or self.defaultMinPartitions, len(files))
        rdd = RDD._from_list(lines, n, self, "MapPartitionsRDD")
        rdd._name = name
        return rdd

    def wholeTextFiles(self, path, minPartitions=None, use_unicode=True):
        out = []
        for f in self._paths(path):
            with open(f, encoding="utf-8") as fh:
                out.append(("file:" + os.path.abspath(f), fh.read()))
        return RDD._from_list(out, minPartitions or self.defaultMinPartitions, self)

    def union(self, rdds):
        parts = []
        for r in rdds:
            parts.extend(r._parts)
        return RDD(parts, self)

    def broadcast(self, value):
        return Broadcast(value)

    def accumulator(self, value, accum_param=None):
        return Accumulator(value)
