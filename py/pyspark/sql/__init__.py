# -*- coding: utf-8 -*-
"""pyspark.sql — учебный эмулятор Spark SQL / DataFrame на базе pandas.

Это НЕ настоящий Apache Spark: вычисления идут в одном процессе браузера.
API и формат вывода повторяют PySpark 3.5, поэтому код переносится в Colab/кластер.
"""
from .types import Row
from .column import Column
from .dataframe import DataFrame, GroupedData, DataFrameWriter, DataFrameNaFunctions
from .session import SparkSession, DataFrameReader
from .window import Window, WindowSpec
from . import functions, types, window

SQLContext = SparkSession

__all__ = ["SparkSession", "DataFrame", "Column", "Row", "GroupedData", "Window", "WindowSpec", "DataFrameReader",
           "DataFrameWriter", "DataFrameNaFunctions", "functions", "types"]
