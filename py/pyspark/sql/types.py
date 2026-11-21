# -*- coding: utf-8 -*-
"""pyspark.sql.types — учебный эмулятор (совместимые имена и вывод)."""
import datetime as _dt

__all__ = ["DataType", "StringType", "IntegerType", "LongType", "ShortType", "DoubleType", "FloatType",
           "BooleanType", "DateType", "TimestampType", "NullType", "ArrayType", "MapType", "StructField",
           "StructType", "Row", "DecimalType", "BinaryType"]


class DataType:
    _type_name = "data"
    _simple = "data"

    def typeName(self):
        return self._type_name

    def simpleString(self):
        return self._simple

    def __repr__(self):
        return type(self).__name__ + "()"

    def __eq__(self, other):
        return isinstance(other, DataType) and repr(self) == repr(other)

    def __hash__(self):
        return hash(repr(self))


class StringType(DataType):
    _type_name, _simple = "string", "string"


class IntegerType(DataType):
    _type_name, _simple = "integer", "int"


class ShortType(DataType):
    _type_name, _simple = "short", "smallint"


class LongType(DataType):
    _type_name, _simple = "long", "bigint"


class DoubleType(DataType):
    _type_name, _simple = "double", "double"


class FloatType(DataType):
    _type_name, _simple = "float", "float"


class DecimalType(DataType):
    _type_name = "decimal"

    def __init__(self, precision=10, scale=0):
        self.precision, self.scale = precision, scale

    def simpleString(self):
        return f"decimal({self.precision},{self.scale})"

    def typeName(self):
        return self.simpleString()

    def __repr__(self):
        return f"DecimalType({self.precision}, {self.scale})"


class BooleanType(DataType):
    _type_name, _simple = "boolean", "boolean"


class BinaryType(DataType):
    _type_name, _simple = "binary", "binary"


class DateType(DataType):
    _type_name, _simple = "date", "date"


class TimestampType(DataType):
    _type_name, _simple = "timestamp", "timestamp"


class NullType(DataType):
    _type_name, _simple = "void", "void"


class ArrayType(DataType):
    _type_name = "array"

    def __init__(self, elementType=None, containsNull=True):
        self.elementType = elementType or StringType()
        self.containsNull = containsNull

    def simpleString(self):
        return f"array<{self.elementType.simpleString()}>"

    def __repr__(self):
        return f"ArrayType({self.elementType!r}, {self.containsNull})"


class MapType(DataType):
    _type_name = "map"

    def __init__(self, keyType=None, valueType=None, valueContainsNull=True):
        self.keyType = keyType or StringType()
        self.valueType = valueType or StringType()
        self.valueContainsNull = valueContainsNull

    def simpleString(self):
        return f"map<{self.keyType.simpleString()},{self.valueType.simpleString()}>"

    def __repr__(self):
        return f"MapType({self.keyType!r}, {self.valueType!r}, {self.valueContainsNull})"


class StructField(DataType):
    def __init__(self, name, dataType, nullable=True, metadata=None):
        self.name, self.dataType, self.nullable = name, dataType, nullable
        self.metadata = metadata or {}

    def simpleString(self):
        return f"{self.name}:{self.dataType.simpleString()}"

    def __repr__(self):
        return f"StructField('{self.name}', {self.dataType!r}, {self.nullable})"


class StructType(DataType):
    _type_name = "struct"

    def __init__(self, fields=None):
        self.fields = list(fields or [])

    def add(self, field, data_type=None, nullable=True, metadata=None):
        if isinstance(field, StructField):
            self.fields.append(field)
        else:
            if isinstance(data_type, str):
                data_type = _parse_type(data_type)
            self.fields.append(StructField(field, data_type, nullable, metadata))
        return self

    def fieldNames(self):
        return [f.name for f in self.fields]

    @property
    def names(self):
        return self.fieldNames()

    def __iter__(self):
        return iter(self.fields)

    def __len__(self):
        return len(self.fields)

    def __getitem__(self, key):
        if isinstance(key, str):
            for f in self.fields:
                if f.name == key:
                    return f
            raise KeyError(f"No StructField named {key}")
        return self.fields[key]

    def simpleString(self):
        return "struct<" + ",".join(f.simpleString() for f in self.fields) + ">"

    def __repr__(self):
        return "StructType([" + ", ".join(repr(f) for f in self.fields) + "])"

    def treeString(self):
        lines = ["root"]
        for f in self.fields:
            _tree(f.name, f.dataType, f.nullable, 1, lines)
        return "\n".join(lines) + "\n"


def _tree(name, dt, nullable, level, lines):
    pre = " |   " * (level - 1) + " |-- "
    lines.append(f"{pre}{name}: {dt.typeName()} (nullable = {str(nullable).lower()})")
    if isinstance(dt, StructType):
        for f in dt.fields:
            _tree(f.name, f.dataType, f.nullable, level + 1, lines)
    elif isinstance(dt, ArrayType):
        pre2 = " |   " * level + " |-- "
        lines.append(f"{pre2}element: {dt.elementType.typeName()} (containsNull = {str(dt.containsNull).lower()})")


_DDL = {"string": StringType, "str": StringType, "varchar": StringType, "char": StringType, "int": IntegerType,
        "integer": IntegerType, "bigint": LongType, "long": LongType, "smallint": ShortType, "short": ShortType,
        "double": DoubleType, "float": FloatType, "real": FloatType, "boolean": BooleanType, "bool": BooleanType,
        "date": DateType, "timestamp": TimestampType, "binary": BinaryType}


def _split_top(s, sep=","):
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch in "<(":
            depth += 1
        elif ch in ">)":
            depth -= 1
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    return out


def _parse_type(s):
    if isinstance(s, DataType):
        return s
    t = s.strip().lower()
    if t.startswith("array<") and t.endswith(">"):
        return ArrayType(_parse_type(s.strip()[6:-1]))
    if t.startswith("map<") and t.endswith(">"):
        k, v = _split_top(s.strip()[4:-1])
        return MapType(_parse_type(k), _parse_type(v))
    if t.startswith("decimal"):
        return DecimalType()
    if t not in _DDL:
        raise ValueError(f"Неизвестный тип данных: {s}")
    return _DDL[t]()


def _parse_ddl(ddl):
    st = StructType()
    for part in _split_top(ddl):
        part = part.strip().replace(":", " ", 1) if ":" in part.split(" ")[0] else part.strip()
        name, typ = part.split(None, 1)
        typ = typ.replace("NOT NULL", "").replace("not null", "").strip()
        st.add(name.strip("`"), _parse_type(typ))
    return st


class Row(tuple):
    """Строка DataFrame: Row(name='Ali', age=20)."""

    def __new__(cls, *args, **kwargs):
        if args and kwargs:
            raise ValueError("Can not use both args and kwargs to create Row")
        if kwargs:
            r = tuple.__new__(cls, list(kwargs.values()))
            r.__fields__ = list(kwargs.keys())
            return r
        r = tuple.__new__(cls, args)
        r.__fields__ = None
        return r

    def __call__(self, *values):
        if self.__fields__ is not None:
            raise TypeError("Row is not callable")
        return Row(**dict(zip(list(self), values)))

    def asDict(self, recursive=False):
        if self.__fields__ is None:
            raise TypeError("Cannot convert a Row class into dict")
        d = dict(zip(self.__fields__, self))
        if recursive:
            d = {k: (v.asDict(True) if isinstance(v, Row) else v) for k, v in d.items()}
        return d

    def __getattr__(self, item):
        if item.startswith("__"):
            raise AttributeError(item)
        fields = self.__dict__.get("__fields__")
        if fields and item in fields:
            return self[fields.index(item)]
        raise AttributeError(item)

    def __getitem__(self, item):
        if isinstance(item, str):
            fields = self.__dict__.get("__fields__") or []
            if item in fields:
                return tuple.__getitem__(self, fields.index(item))
            raise ValueError(item)
        return tuple.__getitem__(self, item)

    def __contains__(self, item):
        fields = self.__dict__.get("__fields__")
        return item in fields if fields else tuple.__contains__(self, item)

    def __repr__(self):
        fields = self.__dict__.get("__fields__")
        if fields is not None:
            return "Row(" + ", ".join(f"{k}={v!r}" for k, v in zip(fields, self)) + ")"
        return "<Row(" + ", ".join(repr(v) for v in self) + ")>"

    def __reduce__(self):
        return (Row, tuple(self))


def _py_type(v):
    """Тип Spark для одиночного Python-значения."""
    import numpy as np
    if isinstance(v, (bool, np.bool_)):
        return BooleanType()
    if isinstance(v, (int, np.integer)):
        return LongType()
    if isinstance(v, (float, np.floating)):
        return DoubleType()
    if isinstance(v, str):
        return StringType()
    if isinstance(v, _dt.datetime):
        return TimestampType()
    if isinstance(v, _dt.date):
        return DateType()
    if isinstance(v, Row) and v.__dict__.get("__fields__"):
        return StructType([StructField(k, _py_type(x)) for k, x in zip(v.__fields__, v)])
    if isinstance(v, dict):
        return StructType([StructField(str(k), _py_type(x)) for k, x in v.items()])
    if isinstance(v, (list, tuple)):
        el = next((x for x in v if x is not None), None)
        return ArrayType(_py_type(el) if el is not None else StringType())
    return StringType()
