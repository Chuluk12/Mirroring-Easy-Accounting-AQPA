import argparse
import csv
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import server  # noqa: E402


FIELDS = [
    "tanggal",
    "no_project",
    "nama_project",
    "no_akun",
    "nama_akun",
    "sumber",
    "tipe_transaksi",
    "no_dokumen",
    "deskripsi",
    "nilai",
]


def fetch_rows(date_from: str, date_to: str, include_virtual: bool = True):
    con = server.fdb.connect(**server.DB_CONFIG)
    try:
        cur = con.cursor()
        where_sql, params = server._project_detail_where(
            date_from=date_from,
            date_to=date_to,
        )
        cur.execute(
            f"""
            SELECT
                gh.TRANSDATE,
                p.PROJECTNO,
                p.PROJECTNAME,
                gh.GLACCOUNT,
                ga.ACCOUNTNAME,
                gh.INVOICEID,
                gh.SOURCE,
                gh.TRANSTYPE,
                gh.TRANSDESCRIPTION,
                gh.BASEAMOUNT,
                gh.GLHISTID,
                CASE
                    WHEN gh.SOURCE = 'AR' AND gh.INVOICEID IS NOT NULL THEN (
                        SELECT FIRST 1 ar.INVOICENO
                        FROM ARINV ar
                        WHERE ar.ARINVOICEID = gh.INVOICEID
                    )
                    WHEN gh.SOURCE = 'AP' AND gh.INVOICEID IS NOT NULL THEN (
                        SELECT FIRST 1 ai.INVOICENO
                        FROM APINV ai
                        WHERE ai.APINVOICEID = gh.INVOICEID
                    )
                    ELSE NULL
                END AS DOCNO,
                p.PROJECTID
            FROM GLHIST gh
            JOIN PROJECT p ON p.PROJECTID = gh.PROJECTID
            LEFT JOIN GLACCNT ga ON ga.GLACCOUNT = gh.GLACCOUNT
            WHERE {where_sql}
            ORDER BY gh.TRANSDATE DESC, gh.GLHISTID DESC
            """,
            params,
        )
        source_rows = cur.fetchall()
        rows = server._build_project_detail_rows(source_rows)
        if include_virtual:
            projects = server._project_detail_candidate_projects(cur, source_rows)
            virtual_rows = server._project_detail_virtual_rows(
                cur,
                projects,
                date_from=date_from,
                date_to=date_to,
            )
            rows = server._project_detail_replace_hpp_gl_rows(rows, virtual_rows)
            rows.extend(virtual_rows)
        rows.sort(key=server._project_detail_sort_key, reverse=True)
        # CLI berjalan di luar Flask/JWT context; batasi kolom secara eksplisit.
        return [{field: row.get(field) for field in FIELDS} for row in rows]
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description="Export Detail Project ke CSV.")
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--base-only",
        action="store_true",
        help="Export transaksi jurnal project tanpa baris virtual HPP/manual.",
    )
    args = parser.parse_args()

    rows = fetch_rows(args.date_from, args.date_to, include_virtual=not args.base_only)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    total_value = server._project_detail_total_nilai(rows)
    project_count = len({row.get("no_project") for row in rows if row.get("no_project")})
    print(f"output={args.output.resolve()}")
    print(f"rows={len(rows)}")
    print(f"projects={project_count}")
    print(f"total_value={total_value:.2f}")


if __name__ == "__main__":
    main()
