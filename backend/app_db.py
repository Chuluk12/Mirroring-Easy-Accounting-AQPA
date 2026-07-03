import os
import re
import sqlite3 as _sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = os.getenv("APP_DB_PATH", str(BASE_DIR / "users.db"))


def _load_env_file():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


_load_env_file()

APP_DB_ENGINE = os.getenv("APP_DB_ENGINE", "sqlite").strip().lower()
DB_PATH = os.getenv("APP_DB_PATH", DB_PATH)
USING_POSTGRES = APP_DB_ENGINE in {"postgres", "postgresql", "pg"}


class DatabaseError(Exception):
    pass


IntegrityError = _sqlite3.IntegrityError


if USING_POSTGRES:
    try:
        import psycopg2
        import psycopg2.errors
    except ImportError as exc:
        raise RuntimeError(
            "APP_DB_ENGINE=postgres membutuhkan package psycopg2-binary. "
            "Install dengan: pip install psycopg2-binary"
        ) from exc

    IntegrityError = psycopg2.IntegrityError


def _postgres_config():
    return {
        "host": os.getenv("APP_DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("APP_DB_PORT", "5432")),
        "dbname": os.getenv("APP_DB_NAME", "easy_dashboard"),
        "user": os.getenv("APP_DB_USER", "postgres"),
        "password": os.getenv("APP_DB_PASSWORD", ""),
    }


def connect(path=None):
    if USING_POSTGRES:
        return PostgresConnection(psycopg2.connect(**_postgres_config()))
    return _sqlite3.connect(path or DB_PATH)


class PostgresConnection:
    def __init__(self, con):
        self._con = con

    def cursor(self):
        return PostgresCursor(self._con.cursor())

    def commit(self):
        return self._con.commit()

    def rollback(self):
        return self._con.rollback()

    def close(self):
        return self._con.close()


class PostgresCursor:
    def __init__(self, cur):
        self._cur = cur
        self._buffer = None

    @property
    def rowcount(self):
        return self._cur.rowcount

    def execute(self, sql, params=None):
        sql = sql.strip()
        pragma_match = re.fullmatch(r"PRAGMA\s+table_info\((\w+)\)", sql, re.IGNORECASE)
        if pragma_match:
            return self._load_table_info(pragma_match.group(1))

        converted = _convert_sql(sql)
        self._buffer = None
        self._cur.execute(converted, params or ())
        return self

    def executemany(self, sql, seq_of_params):
        converted = _convert_sql(sql.strip())
        self._buffer = None
        self._cur.executemany(converted, seq_of_params or [])
        return self

    def fetchone(self):
        if self._buffer is not None:
            return self._buffer.pop(0) if self._buffer else None
        return self._cur.fetchone()

    def fetchall(self):
        if self._buffer is not None:
            rows = self._buffer
            self._buffer = []
            return rows
        return self._cur.fetchall()

    def close(self):
        return self._cur.close()

    def _load_table_info(self, table_name):
        self._cur.execute(
            """
            SELECT ordinal_position - 1, column_name, data_type, is_nullable,
                   column_default, ''
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table_name,),
        )
        self._buffer = self._cur.fetchall()
        return self


def _convert_sql(sql):
    sql = _convert_create_table(sql)
    sql = _convert_insert_or_ignore(sql)
    sql = sql.replace("?", "%s")
    return sql


def _convert_create_table(sql):
    if not re.match(r"CREATE\s+TABLE", sql, re.IGNORECASE):
        return sql
    sql = re.sub(
        r"\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b",
        "SERIAL PRIMARY KEY",
        sql,
        flags=re.IGNORECASE,
    )
    return sql


def _convert_insert_or_ignore(sql):
    if not re.match(r"INSERT\s+OR\s+IGNORE\s+INTO\b", sql, re.IGNORECASE):
        return sql
    sql = re.sub(r"INSERT\s+OR\s+IGNORE\s+INTO", "INSERT INTO", sql, count=1, flags=re.IGNORECASE)
    if re.search(r"\bON\s+CONFLICT\b", sql, re.IGNORECASE):
        return sql
    return f"{sql} ON CONFLICT DO NOTHING"
