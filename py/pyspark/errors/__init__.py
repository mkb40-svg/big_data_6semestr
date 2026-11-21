# -*- coding: utf-8 -*-
"""pyspark.errors — исключения (учебный эмулятор)."""


class PySparkException(Exception):
    pass


class AnalysisException(PySparkException):
    """Ошибка анализа запроса: нет такого столбца/таблицы, неверный SQL и т.п."""


class ParseException(AnalysisException):
    pass


class PySparkTypeError(PySparkException, TypeError):
    pass


class PySparkValueError(PySparkException, ValueError):
    pass


class IllegalArgumentException(PySparkException):
    pass
