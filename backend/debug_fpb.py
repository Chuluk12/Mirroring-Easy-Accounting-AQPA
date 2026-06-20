import fdb

fdb.load_api("C:/Program Files/Firebird/Firebird_3_0/fbclient.dll")
con = fdb.connect(host="127.0.0.1", port=3999,
    database="D:/EASY/GTE.EASY6", user="SYSDBA", password="NewPassword123")
cur = con.cursor()

print("=" * 60)
print("TEST 1 — Distribusi ISDP dan INVOICETYPE di APINV")
print("=" * 60)
cur.execute("""
    SELECT ISDP, INVOICETYPE, COUNT(*) as JUMLAH
    FROM APINV
    GROUP BY ISDP, INVOICETYPE
    ORDER BY ISDP, INVOICETYPE
""")
for r in cur.fetchall():
    print(f"  ISDP={r[0]} | INVOICETYPE={r[1]} | Jumlah={r[2]}")

print()
print("=" * 60)
print("TEST 2 — Sample 5 baris APINV tanpa filter (lihat ISDP & INVOICETYPE)")
print("=" * 60)
cur.execute("""
    SELECT FIRST 5
        INVOICENO, INVOICEDATE, ISDP, INVOICETYPE,
        INVOICEAMOUNT, OWING, BILL, GETFROMRI, GETFROMPO
    FROM APINV
    ORDER BY INVOICEDATE DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]} | {r[1]} | ISDP={r[2]} | TYPE={r[3]} | BILL={r[6]} | RI={r[7]} | PO={r[8]}")

print()
print("=" * 60)
print("TEST 3 — Coba query dengan BILL=1 (faktur dari penerimaan barang)")
print("=" * 60)
cur.execute("""
    SELECT COUNT(*) FROM APINV
    WHERE BILL = 1
""")
print(f"  BILL=1: {cur.fetchone()[0]} baris")

cur.execute("""
    SELECT COUNT(*) FROM APINV
    WHERE GETFROMRI = 1
""")
print(f"  GETFROMRI=1: {cur.fetchone()[0]} baris")

cur.execute("""
    SELECT COUNT(*) FROM APINV
    WHERE GETFROMPO = 1
""")
print(f"  GETFROMPO=1: {cur.fetchone()[0]} baris")

print()
print("=" * 60)
print("TEST 4 — Query FPB dengan TERMID fix + coba tanpa filter ISDP")
print("=" * 60)
try:
    cur.execute("""
        SELECT FIRST 5
            ai.INVOICENO,
            ai.INVOICEDATE,
            ai.INVOICEAMOUNT,
            ai.DPUSED,
            ai.PAIDAMOUNT,
            ai.OWING,
            COALESCE(tm.NETDAYS, 30),
            pd.NAME,
            ai.ISDP,
            ai.INVOICETYPE
        FROM APINV ai
        LEFT JOIN PERSONDATA pd ON pd.ID     = ai.VENDORID
        LEFT JOIN TERMOPMT   tm ON tm.TERMID = ai.TERMSID
        WHERE ai.BILL = 1
        ORDER BY ai.INVOICEDATE DESC
    """)
    rows = cur.fetchall()
    print(f"  Jumlah (BILL=1): {len(rows)}")
    for r in rows:
        print(f"  {r[0]} | {r[1]} | Inv:{r[2]} | Owing:{r[5]} | NetDays:{r[6]} | Vendor:{r[7]} | ISDP:{r[8]} | TYPE:{r[9]}")
except Exception as e:
    print(f"  ERROR: {e}")

print()
print("=" * 60)
print("TEST 5 — Cek apakah NOFORM (No Faktur UM) ada di APINV sendiri")
print("=" * 60)
cur.execute("""
    SELECT FIRST 5
        INVOICENO, NOFORM, DPUSED, ISDP
    FROM APINV
    WHERE DPUSED > 0
    ORDER BY INVOICEDATE DESC
""")
rows = cur.fetchall()
print(f"  Faktur dengan DPUSED > 0: {len(rows)} sample")
for r in rows:
    print(f"  InvNo:{r[0]} | NOFORM:{r[1]} | DPUSED:{r[2]} | ISDP:{r[3]}")

con.close()
print("\n✅ Selesai.")