# -*- coding: utf-8 -*-
"""pyspark.RDD — учебный эмулятор (данные хранятся по разделам-спискам)."""
import functools
import itertools
import os
import random
import zlib
from collections import OrderedDict

_ids = itertools.count(0)


def _phash(key):
    return zlib.crc32(repr(key).encode("utf-8"))


class ResultIterable:
    def __init__(self, data):
        self.data = list(data)
        self.maxindex = len(self.data)

    def __iter__(self):
        return iter(self.data)

    def __len__(self):
        return len(self.data)

    def __repr__(self):
        return f"<pyspark.resultiterable.ResultIterable object at {hex(id(self))}>"


class Broadcast:
    def __init__(self, value):
        self.value = value

    def unpersist(self, blocking=False):
        pass

    def destroy(self, blocking=False):
        pass


class Accumulator:
    def __init__(self, value):
        self._value = value

    def add(self, term):
        self._value += term

    def __iadd__(self, term):
        self.add(term)
        return self

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, v):
        self._value = v

    def __repr__(self):
        return f"Accumulator<id=0, value={self._value}>"


class RDD:
    def __init__(self, partitions, ctx=None, kind="PythonRDD"):
        self._parts = [list(p) for p in partitions] or [[]]
        self.ctx = ctx
        self._id = next(_ids)
        self._kind = kind
        self._name = None

    @classmethod
    def _from_list(cls, data, n=1, ctx=None, kind="ParallelCollectionRDD"):
        data = list(data)
        n = max(1, int(n or 1))
        L = len(data)
        parts = [data[(i * L) // n:((i + 1) * L) // n] for i in range(n)]
        return cls(parts, ctx, kind)

    def _new(self, parts):
        return RDD(parts, self.ctx)

    def _all(self):
        return [x for p in self._parts for x in p]

    def __repr__(self):
        if self._kind == "ParallelCollectionRDD":
            return f"ParallelCollectionRDD[{self._id}] at readRDDFromFile at PythonRDD.scala:289"
        if self._kind == "MapPartitionsRDD":
            return f"{self._name or 'data'} MapPartitionsRDD[{self._id}] at textFile at NativeMethodAccessorImpl.java:0"
        return f"PythonRDD[{self._id}] at RDD at PythonRDD.scala:53"

    def id(self):
        return self._id

    def setName(self, name):
        self._name = name
        return self

    def name(self):
        return self._name

    def toDebugString(self):
        return f"({len(self._parts)}) {self!r} []".encode()

    # ------------------------------------------------------------ разделы
    def getNumPartitions(self):
        return len(self._parts)

    def glom(self):
        return self._new([[list(p)] for p in self._parts])

    def repartition(self, numPartitions):
        return RDD._from_list(self._all(), numPartitions, self.ctx, "PythonRDD")

    def coalesce(self, numPartitions, shuffle=False):
        n = max(1, min(numPartitions, len(self._parts)))
        return RDD._from_list(self._all(), n, self.ctx, "PythonRDD")

    def cache(self):
        return self

    def persist(self, storageLevel=None):
        return self

    def unpersist(self, blocking=False):
        return self

    def checkpoint(self):
        pass

    # ------------------------------------------------------------ трансформации
    def map(self, f, preservesPartitioning=False):
        return self._new([[f(x) for x in p] for p in self._parts])

    def flatMap(self, f, preservesPartitioning=False):
        return self._new([[y for x in p for y in f(x)] for p in self._parts])

    def filter(self, f):
        return self._new([[x for x in p if f(x)] for p in self._parts])

    def mapPartitions(self, f, preservesPartitioning=False):
        return self._new([list(f(iter(p))) for p in self._parts])

    def mapPartitionsWithIndex(self, f, preservesPartitioning=False):
        return self._new([list(f(i, iter(p))) for i, p in enumerate(self._parts)])

    def mapValues(self, f):
        return self._new([[(k, f(v)) for k, v in p] for p in self._parts])

    def flatMapValues(self, f):
        return self._new([[(k, y) for k, v in p for y in f(v)] for p in self._parts])

    def keys(self):
        return self.map(lambda kv: kv[0])

    def values(self):
        return self.map(lambda kv: kv[1])

    def keyBy(self, f):
        return self.map(lambda x: (f(x), x))

    def zipWithIndex(self):
        out, i = [], 0
        for p in self._parts:
            q = []
            for x in p:
                q.append((x, i))
                i += 1
            out.append(q)
        return self._new(out)

    def _shuffle(self, pairs_by_part, n):
        buckets = [OrderedDict() for _ in range(n)]
        return buckets

    def reduceByKey(self, func, numPartitions=None, partitionFunc=None):
        n = numPartitions or len(self._parts)
        buckets = [OrderedDict() for _ in range(n)]
        for p in self._parts:
            for k, v in p:
                b = buckets[_phash(k) % n]
                b[k] = func(b[k], v) if k in b else v
        return self._new([list(b.items()) for b in buckets])

    def foldByKey(self, zeroValue, func, numPartitions=None):
        return self.mapValues(lambda v: v).reduceByKey(func, numPartitions).mapValues(lambda v: func(zeroValue, v))

    def groupByKey(self, numPartitions=None):
        n = numPartitions or len(self._parts)
        buckets = [OrderedDict() for _ in range(n)]
        for p in self._parts:
            for k, v in p:
                buckets[_phash(k) % n].setdefault(k, []).append(v)
        return self._new([[(k, ResultIterable(v)) for k, v in b.items()] for b in buckets])

    def groupBy(self, f, numPartitions=None):
        return self.map(lambda x: (f(x), x)).groupByKey(numPartitions)

    def aggregateByKey(self, zeroValue, seqFunc, combFunc, numPartitions=None):
        import copy
        n = numPartitions or len(self._parts)
        buckets = [OrderedDict() for _ in range(n)]
        for p in self._parts:
            for k, v in p:
                b = buckets[_phash(k) % n]
                b[k] = seqFunc(b[k] if k in b else copy.deepcopy(zeroValue), v)
        return self._new([list(b.items()) for b in buckets])

    def combineByKey(self, createCombiner, mergeValue, mergeCombiners, numPartitions=None):
        n = numPartitions or len(self._parts)
        buckets = [OrderedDict() for _ in range(n)]
        for p in self._parts:
            for k, v in p:
                b = buckets[_phash(k) % n]
                b[k] = mergeValue(b[k], v) if k in b else createCombiner(v)
        return self._new([list(b.items()) for b in buckets])

    def distinct(self, numPartitions=None):
        n = numPartitions or len(self._parts)
        buckets = [OrderedDict() for _ in range(n)]
        for x in self._all():
            buckets[_phash(x) % n][x] = None
        return self._new([list(b) for b in buckets])

    def sortBy(self, keyfunc, ascending=True, numPartitions=None):
        data = sorted(self._all(), key=keyfunc, reverse=not ascending)
        return RDD._from_list(data, numPartitions or len(self._parts), self.ctx, "PythonRDD")

    def sortByKey(self, ascending=True, numPartitions=None, keyfunc=lambda x: x):
        return self.sortBy(lambda kv: keyfunc(kv[0]), ascending, numPartitions)

    def union(self, other):
        return self._new(self._parts + other._parts)

    def intersection(self, other):
        o = set(other._all())
        return self.filter(lambda x: x in o).distinct()

    def subtract(self, other, numPartitions=None):
        o = set(other._all())
        return self.filter(lambda x: x not in o)

    def subtractByKey(self, other, numPartitions=None):
        o = {k for k, _ in other._all()}
        return self.filter(lambda kv: kv[0] not in o)

    def cartesian(self, other):
        return RDD._from_list([(a, b) for a in self._all() for b in other._all()], len(self._parts), self.ctx, "PythonRDD")

    def _join(self, other, how):
        right = {}
        for k, v in other._all():
            right.setdefault(k, []).append(v)
        left = {}
        for k, v in self._all():
            left.setdefault(k, []).append(v)
        out = []
        for k, vs in left.items():
            if k in right:
                out.extend((k, (a, b)) for a in vs for b in right[k])
            elif how in ("left", "full"):
                out.extend((k, (a, None)) for a in vs)
        if how in ("right", "full"):
            for k, vs in right.items():
                if k not in left:
                    out.extend((k, (None, b)) for b in vs)
        return RDD._from_list(out, len(self._parts), self.ctx, "PythonRDD")

    def join(self, other, numPartitions=None):
        return self._join(other, "inner")

    def leftOuterJoin(self, other, numPartitions=None):
        return self._join(other, "left")

    def rightOuterJoin(self, other, numPartitions=None):
        return self._join(other, "right")

    def fullOuterJoin(self, other, numPartitions=None):
        return self._join(other, "full")

    def sample(self, withReplacement, fraction, seed=None):
        rng = random.Random(seed)
        return self._new([[x for x in p if rng.random() < fraction] for p in self._parts])

    def randomSplit(self, weights, seed=None):
        rng = random.Random(seed)
        total = float(sum(weights))
        cuts = list(itertools.accumulate(w / total for w in weights))
        outs = [[[] for _ in self._parts] for _ in weights]
        for pi, p in enumerate(self._parts):
            for x in p:
                r = rng.random()
                i = next(j for j, c in enumerate(cuts) if r < c or j == len(cuts) - 1)
                outs[i][pi].append(x)
        return [self._new(o) for o in outs]

    # ------------------------------------------------------------ действия
    def collect(self):
        return self._all()

    def count(self):
        return sum(len(p) for p in self._parts)

    def first(self):
        for p in self._parts:
            if p:
                return p[0]
        raise ValueError("RDD is empty")

    def take(self, num):
        return self._all()[:num]

    def top(self, num, key=None):
        return sorted(self._all(), key=key, reverse=True)[:num]

    def takeOrdered(self, num, key=None):
        return sorted(self._all(), key=key)[:num]

    def takeSample(self, withReplacement, num, seed=None):
        rng = random.Random(seed)
        data = self._all()
        if withReplacement:
            return [rng.choice(data) for _ in range(num)]
        return rng.sample(data, min(num, len(data)))

    def reduce(self, f):
        data = self._all()
        if not data:
            raise ValueError("Can not reduce() empty RDD")
        return functools.reduce(f, data)

    def fold(self, zeroValue, op):
        return functools.reduce(op, self._all(), zeroValue)

    def aggregate(self, zeroValue, seqOp, combOp):
        import copy
        parts = [functools.reduce(seqOp, p, copy.deepcopy(zeroValue)) for p in self._parts]
        return functools.reduce(combOp, parts, copy.deepcopy(zeroValue))

    def sum(self):
        return sum(self._all())

    def mean(self):
        d = self._all()
        return sum(d) / len(d) if d else float("nan")

    def max(self, key=None):
        return max(self._all(), key=key) if key else max(self._all())

    def min(self, key=None):
        return min(self._all(), key=key) if key else min(self._all())

    def stdev(self):
        import statistics
        return statistics.pstdev(self._all())

    def sampleStdev(self):
        import statistics
        return statistics.stdev(self._all())

    def variance(self):
        import statistics
        return statistics.pvariance(self._all())

    def histogram(self, buckets):
        import numpy as np
        counts, edges = np.histogram(self._all(), bins=buckets)
        return [float(e) for e in edges], [int(c) for c in counts]

    def countByKey(self):
        from collections import defaultdict
        d = defaultdict(int)
        for k, _ in self._all():
            d[k] += 1
        return d

    def countByValue(self):
        from collections import defaultdict
        d = defaultdict(int)
        for x in self._all():
            d[x] += 1
        return d

    def collectAsMap(self):
        return dict(self._all())

    def lookup(self, key):
        return [v for k, v in self._all() if k == key]

    def isEmpty(self):
        return self.count() == 0

    def foreach(self, f):
        for x in self._all():
            f(x)

    def foreachPartition(self, f):
        for p in self._parts:
            f(iter(p))

    def saveAsTextFile(self, path, compressionCodecClass=None):
        p = str(path)
        for pre in ("file://", "file:"):
            if p.startswith(pre):
                p = p[len(pre):]
        if os.path.exists(p):
            raise FileExistsError(f"org.apache.hadoop.mapred.FileAlreadyExistsException: Output directory "
                                  f"file:{os.path.abspath(p)} already exists")
        os.makedirs(p)
        for i, part in enumerate(self._parts):
            with open(os.path.join(p, f"part-{i:05d}"), "w", encoding="utf-8") as f:
                for x in part:
                    f.write(str(x) + "\n")
        open(os.path.join(p, "_SUCCESS"), "w").close()

    def toDF(self, schema=None, sampleRatio=None):
        from pyspark.sql.session import SparkSession
        spark = SparkSession._active or SparkSession.builder.getOrCreate()
        return spark.createDataFrame(self, schema)
