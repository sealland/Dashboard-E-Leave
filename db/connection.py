"""
SQL Server connection helpers for HR_Approve dashboard development.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Generator, Optional
from urllib.parse import quote_plus

import pandas as pd
import pyodbc
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name, str(default)).strip().lower()
    return value in {"1", "true", "yes", "on"}


def build_connection_string() -> str:
    """Build a pyodbc connection string from environment variables."""
    server = os.getenv("DB_SERVER", "localhost")
    port = os.getenv("DB_PORT", "1433")
    database = os.getenv("DB_NAME", "HR_Approve")
    driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")
    encrypt = os.getenv("DB_ENCRYPT", "yes")
    trust_cert = os.getenv("DB_TRUST_SERVER_CERTIFICATE", "yes")

    parts = [
        f"DRIVER={{{driver}}}",
        f"SERVER={server},{port}",
        f"DATABASE={database}",
        f"Encrypt={encrypt}",
        f"TrustServerCertificate={trust_cert}",
    ]

    if _env_bool("DB_TRUSTED_CONNECTION"):
        parts.append("Trusted_Connection=yes")
    else:
        user = os.getenv("DB_USER", "")
        password = os.getenv("DB_PASSWORD", "")
        if not user:
            raise ValueError(
                "DB_USER is required when DB_TRUSTED_CONNECTION is false. "
                "Set credentials in .env or enable Windows Authentication."
            )
        parts.append(f"UID={user}")
        parts.append(f"PWD={password}")

    return ";".join(parts)


def get_connection() -> pyodbc.Connection:
    """Return a raw pyodbc connection."""
    return pyodbc.connect(build_connection_string())


@contextmanager
def connection_scope() -> Generator[pyodbc.Connection, None, None]:
    """Context manager that closes the connection automatically."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def get_engine() -> Engine:
    """Return a SQLAlchemy engine (useful for pandas read_sql)."""
    conn_str = quote_plus(build_connection_string())
    url = f"mssql+pyodbc:///?odbc_connect={conn_str}"
    return create_engine(url, pool_pre_ping=True)


def execute_query(sql: str, params: Optional[dict[str, Any]] = None) -> pd.DataFrame:
    """Run a SELECT query and return results as a DataFrame."""
    engine = get_engine()
    with engine.connect() as conn:
        return pd.read_sql(text(sql), conn, params=params or {})


def list_tables(schema: str = "dbo") -> pd.DataFrame:
    """List tables and row counts in the given schema."""
    sql = """
        SELECT
            t.TABLE_SCHEMA AS [schema],
            t.TABLE_NAME AS [table],
            p.rows AS [row_count]
        FROM INFORMATION_SCHEMA.TABLES t
        INNER JOIN sys.tables st
            ON st.name = t.TABLE_NAME
            AND SCHEMA_NAME(st.schema_id) = t.TABLE_SCHEMA
        INNER JOIN sys.partitions p
            ON st.object_id = p.object_id
            AND p.index_id IN (0, 1)
        WHERE t.TABLE_TYPE = 'BASE TABLE'
          AND t.TABLE_SCHEMA = :schema
        ORDER BY t.TABLE_NAME
    """
    return execute_query(sql, {"schema": schema})


def describe_table(table: str, schema: str = "dbo") -> pd.DataFrame:
    """Return column metadata for a table."""
    sql = """
        SELECT
            c.COLUMN_NAME AS column_name,
            c.DATA_TYPE AS data_type,
            c.CHARACTER_MAXIMUM_LENGTH AS max_length,
            c.IS_NULLABLE AS is_nullable,
            c.COLUMN_DEFAULT AS default_value
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = :schema
          AND c.TABLE_NAME = :table
        ORDER BY c.ORDINAL_POSITION
    """
    return execute_query(sql, {"schema": schema, "table": table})


def sample_table(table: str, schema: str = "dbo", limit: int = 10) -> pd.DataFrame:
    """Return sample rows from a table."""
    qualified = f"[{schema}].[{table}]"
    sql = f"SELECT TOP (:limit) * FROM {qualified}"
    return execute_query(sql, {"limit": limit})
