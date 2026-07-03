import os
import sqlite3
import sys
from pathlib import Path

import app_db
from auth import init_db


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_PATH = BASE_DIR / "users.db"


def sqlite_tables(con):
    cur = con.cursor()
    cur.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """)
    return [row[0] for row in cur.fetchall()]


def table_columns(con, table):
    cur = con.cursor()
    cur.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cur.fetchall()]


def row_count(con, table):
    cur = con.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return int(cur.fetchone()[0] or 0)


def migrate_table(sqlite_con, pg_con, table):
    columns = table_columns(sqlite_con, table)
    if not columns:
        return 0

    quoted_columns = ", ".join(columns)
    placeholders = ", ".join(["?"] * len(columns))
    sqlite_cur = sqlite_con.cursor()
    sqlite_cur.execute(f"SELECT {quoted_columns} FROM {table}")
    rows = sqlite_cur.fetchall()
    if not rows:
        return 0

    pg_cur = pg_con.cursor()
    pg_cur.executemany(
        f"""
        INSERT INTO {table} ({quoted_columns})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
        """,
        rows,
    )
    if "id" in columns:
        pg_cur.execute(
            f"""
            SELECT setval(
                pg_get_serial_sequence(%s, %s),
                COALESCE((SELECT MAX(id) FROM {table}), 1),
                true
            )
            """,
            (table, "id"),
        )
    return len(rows)


def clear_postgres_tables(pg_con, tables):
    cur = pg_con.cursor()
    for table in reversed(tables):
        cur.execute(f"DELETE FROM {table}")
    pg_con.commit()


def main():
    if not app_db.USING_POSTGRES:
        print("Set APP_DB_ENGINE=postgres di backend/.env sebelum menjalankan migrasi.")
        return 1

    sqlite_path = Path(os.getenv("SQLITE_SOURCE_PATH", str(DEFAULT_SQLITE_PATH)))
    if len(sys.argv) > 1:
        sqlite_path = Path(sys.argv[1])
    if not sqlite_path.exists():
        print(f"SQLite source tidak ditemukan: {sqlite_path}")
        return 1

    print(f"Source SQLite: {sqlite_path}")
    print("Menyiapkan schema PostgreSQL...")
    init_db()

    sqlite_con = sqlite3.connect(sqlite_path)
    pg_con = app_db.connect()
    try:
        tables = sqlite_tables(sqlite_con)
        print("Mengosongkan tabel custom di PostgreSQL agar isi sama dengan SQLite source...")
        clear_postgres_tables(pg_con, tables)
        for table in tables:
            try:
                before = row_count(sqlite_con, table)
                copied = migrate_table(sqlite_con, pg_con, table)
                pg_con.commit()
                print(f"{table}: {copied}/{before} row diproses")
            except sqlite3.DatabaseError as exc:
                pg_con.rollback()
                print(f"{table}: dilewati karena SQLite rusak ({exc})")
    finally:
        sqlite_con.close()
        pg_con.close()

    print("Migrasi selesai. Simpan file SQLite lama sebagai backup sampai data PostgreSQL sudah dicek.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
