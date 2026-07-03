import sqlite3
from pathlib import Path


DB_PATH = Path(__file__).resolve().parent / "users.db"
def main():
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("PRAGMA writable_schema=ON")
        page_count = int(con.execute("PRAGMA page_count").fetchone()[0] or 0)
        rows = con.execute(
            """
            SELECT type, name, tbl_name, rootpage
            FROM sqlite_master
            WHERE rootpage > ?
               OR name = 'profit_loss_manual_cost'
               OR tbl_name = 'profit_loss_manual_cost'
            """,
            (page_count,),
        ).fetchall()
        broken_tables = sorted({
            row[2] if row[0] == "index" else row[1]
            for row in rows
            if row[2] != "sqlite_sequence"
        })
        for table in broken_tables:
            con.execute(
                "DELETE FROM sqlite_master WHERE type = 'table' AND name = ?",
                (table,),
            )
            con.execute(
                "DELETE FROM sqlite_master WHERE type = 'index' AND tbl_name = ?",
                (table,),
            )
        con.commit()
        con.execute("PRAGMA writable_schema=OFF")
    finally:
        con.close()
    print("SQLite schema repair selesai.")
    if broken_tables:
        print("Tabel rusak yang dilepas:", ", ".join(broken_tables))


if __name__ == "__main__":
    main()
