# -*- coding: utf-8 -*-
"""Учебный эмулятор PySpark для тренажёра Big Data.

Повторяет основной API PySpark 3.5 (SparkSession, DataFrame, functions, RDD),
но работает внутри браузера (Pyodide) поверх pandas. Для работы с настоящим
Spark используйте Google Colab:  !pip install pyspark
"""
__version__ = "3.5.1"
from .context import SparkContext, SparkConf
from .rdd import RDD, Broadcast, Accumulator
from .storagelevel import StorageLevel

__all__ = ["SparkContext", "SparkConf", "RDD", "Broadcast", "Accumulator", "StorageLevel"]
