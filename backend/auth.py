import sqlite3
import bcrypt
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")

MARKETING_MODULES = [
    "dashboard",
    "stock",
    "penjualan",
    "penjualan_so",
    "penjualan_do",
    "customer",
    "salesman",
    "kolaborasi",
]

ACCOUNTING_ROLE_MODULES = [
    "dashboard",
    "stock",
    "barang-baru",
    "riwayat",
    "pembelian",
    "permintaan",
    "penerimaan",
    "fpb",
    "penjualan",
    "penjualan_so",
    "penjualan_do",
    "invoice",
    "customer",
    "salesman",
    "kolaborasi",
    "project",
    "akuntansi",
]

MARKETING_PEMBELIAN_COLUMNS = [
    "no_pembelian",
    "tgl_pembelian",
    "tgl_ekspetasi",
    "no_permintaan",
    "tgl_permintaan",
    "tgl_target_permintaan",
    "so_no",
    "tgl_so",
    "est_kirim_so",
    "nama_pelanggan_so",
    "no_po_customer_so",
    "salesman_so",
    "no_barang_so",
    "deskripsi_barang_so",
    "qty_so",
    "qty_order_so",
    "qty_shipped_so",
    "sisa_kirim_so",
    "stok_tersedia_so",
    "uom_so",
    "no_pengiriman_so",
    "tgl_kirim_so",
    "note_pengiriman",
    "harga_satuan_penjualan",
    "no_pemasok",
    "nama_pemasok",
    "purchaser",
    "deskripsi",
    "no_barang",
    "deskripsi_barang",
    "qty",
    "uom",
    "note_pesanan",
    "no_penerimaan_barang",
    "tgl_penerimaan_barang",
    "disc_pct",
    "diskon",
    "pph",
    "add_cost",
]


def sync_marketing_permissions(cur):
    placeholders = ", ".join(["?"] * len(MARKETING_MODULES))
    cur.execute(
        f"""
        DELETE FROM roles
        WHERE role = 'marketing'
          AND module NOT IN ({placeholders})
        """,
        MARKETING_MODULES,
    )
    cur.executemany(
        "INSERT OR IGNORE INTO roles (role, module) VALUES (?, ?)",
        [("marketing", module) for module in MARKETING_MODULES],
    )
    cur.execute("DELETE FROM role_column_permissions WHERE role = 'marketing' AND module = 'pembelian'")
    cur.executemany(
        "INSERT OR IGNORE INTO role_column_permissions (role, module, column_key) VALUES (?, ?, ?)",
        [("marketing", "pembelian", column_key) for column_key in MARKETING_PEMBELIAN_COLUMNS],
    )

def ensure_audit_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            name TEXT,
            role TEXT,
            action TEXT NOT NULL,
            module TEXT,
            description TEXT,
            metadata TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL
        )
    """)

def ensure_salesman_targets_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS salesman_monthly_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            salesman_id INTEGER NOT NULL,
            salesman_name TEXT NOT NULL,
            month INTEGER NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            updated_by TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE(year, salesman_id, month)
        )
    """)

def ensure_itemhist_detected_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS itemhist_detected_log (
            itemhistid INTEGER PRIMARY KEY,
            detected_at TEXT NOT NULL
        )
    """)

def ensure_liw_purchase_notes_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS liw_purchase_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            no_permintaan TEXT NOT NULL DEFAULT '',
            so_no TEXT NOT NULL DEFAULT '',
            no_pembelian TEXT NOT NULL DEFAULT '',
            no_barang TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            note_pengiriman TEXT NOT NULL DEFAULT '',
            updated_by TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE(no_permintaan, so_no, no_pembelian, no_barang)
        )
    """)
    cur.execute("PRAGMA table_info(liw_purchase_notes)")
    columns = {row[1] for row in cur.fetchall()}
    if "note_pengiriman" not in columns:
        cur.execute("ALTER TABLE liw_purchase_notes ADD COLUMN note_pengiriman TEXT NOT NULL DEFAULT ''")


def ensure_project_manual_realization_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS project_manual_realization (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_no TEXT NOT NULL,
            account_no TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            updated_by TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE(project_no, account_no)
        )
    """)


def ensure_project_report_notes_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS project_report_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_no TEXT NOT NULL UNIQUE,
            note TEXT NOT NULL DEFAULT '',
            updated_by TEXT,
            updated_at TEXT NOT NULL
        )
    """)

def init_db():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            module TEXT NOT NULL,
            UNIQUE(role, module)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS role_column_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            module TEXT NOT NULL,
            column_key TEXT NOT NULL,
            UNIQUE(role, module, column_key)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS barang_baru_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemid INTEGER UNIQUE NOT NULL,
            itemno TEXT NOT NULL,
            description TEXT,
            description2 TEXT,
            unit TEXT,
            type TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL
        )
    """)
    cur.execute("PRAGMA table_info(barang_baru_log)")
    barang_baru_columns = {row[1] for row in cur.fetchall()}
    if "created_by" not in barang_baru_columns:
        cur.execute("ALTER TABLE barang_baru_log ADD COLUMN created_by TEXT")

    ensure_audit_table(cur)
    ensure_salesman_targets_table(cur)
    ensure_itemhist_detected_table(cur)
    ensure_liw_purchase_notes_table(cur)
    ensure_project_manual_realization_table(cur)
    ensure_project_report_notes_table(cur)

    # ── Permission Matrix ──────────────────────────────────────────────────
    # admin     → semua modul
    # inventory → dashboard, persediaan, permintaan, penerimaan, pengiriman, kolaborasi
    # purchasing→ dashboard, pembelian, kolaborasi
    # marketing → dashboard, stock, penjualan tertentu, daftar pembelian terbatas
    # produksi  → dashboard, stock, spk
    # ppc       → dashboard, stock, spk
    roles = [
        ("admin",      "dashboard"), ("admin",      "stock"),
        ("admin",      "barang-baru"), ("admin",    "riwayat"),
        ("admin",      "pembelian"), ("admin",      "penjualan"),
        ("admin",      "users"),     ("admin",      "spk"),
        ("admin",      "akuntansi"), ("admin",      "audit"),
        ("admin",      "project"),

        ("inventory",  "dashboard"), ("inventory",  "stock"),
        ("inventory",  "barang-baru"), ("inventory","riwayat"),
        ("inventory",  "permintaan"), ("inventory",  "penerimaan"),
        ("inventory",  "penjualan_do"), ("inventory", "kolaborasi"),

        ("purchasing", "dashboard"), ("purchasing", "pembelian"),
        ("purchasing", "kolaborasi"),

        ("marketing",  "dashboard"), ("marketing",  "stock"),
        ("marketing",  "penjualan"), ("marketing",  "pembelian"),
        ("marketing",  "penjualan_so"), ("marketing",  "penjualan_do"),
        ("marketing",  "customer"), ("marketing",  "salesman"),

        ("produksi",   "dashboard"), ("produksi",   "stock"),
        ("produksi",   "spk"),

        ("ppc",        "dashboard"), ("ppc",        "stock"),
        ("ppc",        "spk"),

        *[("akuntansi", module) for module in ACCOUNTING_ROLE_MODULES],
    ]

    # INSERT OR IGNORE = idempotent, aman dijalankan berulang kali
    cur.executemany("INSERT OR IGNORE INTO roles (role, module) VALUES (?, ?)", roles)
    sync_marketing_permissions(cur)

    cur.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
    if cur.fetchone()[0] == 0:
        hashed = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
            ("admin", hashed, "Administrator", "admin")
        )

    con.commit()
    con.close()
    print("Database user siap!")


def get_user(username):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT id, username, password, name, role FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    con.close()
    if row:
        return {"id": row[0], "username": row[1], "password": row[2], "name": row[3], "role": row[4]}
    return None

def get_user_permissions(role):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    if role == "marketing":
        sync_marketing_permissions(cur)
        con.commit()
    cur.execute("SELECT module FROM roles WHERE role = ?", (role,))
    rows = cur.fetchall()
    con.close()
    return [r[0] for r in rows]

def get_all_users():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT id, username, name, role FROM users ORDER BY id")
    rows = cur.fetchall()
    con.close()
    return [{"id": r[0], "username": r[1], "name": r[2], "role": r[3]} for r in rows]

def get_user_by_id(user_id):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT id, username, name, role FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    con.close()
    if row:
        return {"id": row[0], "username": row[1], "name": row[2], "role": row[3]}
    return None

def get_all_roles():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT DISTINCT role FROM roles ORDER BY role")
    all_roles = [r[0] for r in cur.fetchall()]
    result = {}
    for role in all_roles:
        cur.execute("SELECT module FROM roles WHERE role = ? ORDER BY module", (role,))
        result[role] = [r[0] for r in cur.fetchall()]
    con.close()
    return result

def get_all_column_permissions():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
        SELECT role, module, column_key
        FROM role_column_permissions
        ORDER BY role, module, column_key
    """)
    result = {}
    for role, module, column_key in cur.fetchall():
        result.setdefault(role, {}).setdefault(module, []).append(column_key)
    con.close()
    return result

def get_user_column_permissions(role):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
        SELECT module, column_key
        FROM role_column_permissions
        WHERE role = ?
        ORDER BY module, column_key
    """, (role,))
    result = {}
    for module, column_key in cur.fetchall():
        result.setdefault(module, []).append(column_key)
    con.close()
    return result

def upsert_role(role, modules, column_permissions=None):
    role = (role or "").strip().lower()
    clean_modules = sorted({(m or "").strip() for m in modules or [] if (m or "").strip()})
    if not role:
        return False, "Nama role wajib diisi"

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        cur.execute("DELETE FROM roles WHERE role = ?", (role,))
        cur.executemany(
            "INSERT OR IGNORE INTO roles (role, module) VALUES (?, ?)",
            [(role, module) for module in clean_modules]
        )
        if column_permissions is not None:
            cur.execute("DELETE FROM role_column_permissions WHERE role = ?", (role,))
            rows = []
            for module, columns in (column_permissions or {}).items():
                if module not in clean_modules:
                    continue
                for column_key in columns or []:
                    column_key = (column_key or "").strip()
                    if column_key:
                        rows.append((role, module, column_key))
            cur.executemany(
                "INSERT OR IGNORE INTO role_column_permissions (role, module, column_key) VALUES (?, ?, ?)",
                rows
            )
        con.commit()
        return True, "Role berhasil disimpan"
    finally:
        con.close()

def delete_role(role):
    role = (role or "").strip().lower()
    if role == "admin":
        return False, "Role admin tidak dapat dihapus"

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM users WHERE role = ?", (role,))
        if int(cur.fetchone()[0] or 0) > 0:
            return False, "Role masih dipakai user"

        cur.execute("DELETE FROM roles WHERE role = ?", (role,))
        cur.execute("DELETE FROM role_column_permissions WHERE role = ?", (role,))
        deleted = cur.rowcount
        con.commit()
        return deleted > 0, "Role berhasil dihapus" if deleted else "Role tidak ditemukan"
    finally:
        con.close()

def create_user(username, password, name, role):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
            (username, hashed, name, role)
        )
        con.commit()
        return True, "User berhasil dibuat"
    except sqlite3.IntegrityError:
        return False, "Username sudah dipakai"
    finally:
        con.close()

def update_user_password(user_id, password):
    if not password or len(password) < 6:
        return False, "Password minimal 6 karakter"

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute("UPDATE users SET password = ? WHERE id = ?", (hashed, user_id))
        updated = cur.rowcount
        con.commit()
        return updated > 0, "Password berhasil diganti" if updated else "User tidak ditemukan"
    finally:
        con.close()

def delete_user(user_id):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("DELETE FROM users WHERE id = ? AND username != 'admin'", (user_id,))
    deleted = cur.rowcount
    con.commit()
    con.close()
    return deleted > 0

def log_activity(username=None, name=None, role=None, action="", module=None,
                 description=None, metadata=None, ip_address=None, user_agent=None):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
      ensure_audit_table(cur)
      cur.execute("""
          INSERT INTO audit_logs
          (username, name, role, action, module, description, metadata, ip_address, user_agent, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """, (
          username, name, role, action, module, description,
          json.dumps(metadata or {}, ensure_ascii=False),
          ip_address, user_agent, datetime.now().strftime("%Y-%m-%d %H:%M:%S")
      ))
      con.commit()
    except Exception as e:
      print(f"Error log_activity: {e}")
    finally:
      con.close()

def get_audit_logs(search="", action="", module="", date_from=None, date_to=None, limit=100, offset=0):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_audit_table(cur)
    conditions = ["1=1"]
    params = []

    if search:
        conditions.append("""(
            LOWER(username) LIKE LOWER(?)
            OR LOWER(name) LIKE LOWER(?)
            OR LOWER(description) LIKE LOWER(?)
        )""")
        term = f"%{search}%"
        params += [term, term, term]
    if action:
        conditions.append("action = ?")
        params.append(action)
    if module:
        conditions.append("module = ?")
        params.append(module)
    if date_from:
        conditions.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("created_at <= ?")
        params.append(date_to + " 23:59:59")

    where = " AND ".join(conditions)
    cur.execute(f"SELECT COUNT(*) FROM audit_logs WHERE {where}", params)
    total = int(cur.fetchone()[0] or 0)
    cur.execute(f"""
        SELECT id, username, name, role, action, module, description, metadata,
               ip_address, user_agent, created_at
        FROM audit_logs
        WHERE {where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])
    rows = cur.fetchall()
    con.close()
    return {
        "total": total,
        "data": [{
            "id": r[0],
            "username": r[1],
            "name": r[2],
            "role": r[3],
            "action": r[4],
            "module": r[5],
            "description": r[6],
            "metadata": json.loads(r[7] or "{}"),
            "ip_address": r[8],
            "user_agent": r[9],
            "created_at": r[10],
        } for r in rows]
    }

def get_liw_purchase_notes(keys):
    if not keys:
        return {}
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_liw_purchase_notes_table(cur)
    result = {}
    try:
        for key in keys:
            no_permintaan, so_no, no_pembelian, no_barang = key
            cur.execute("""
                SELECT note, note_pengiriman
                FROM liw_purchase_notes
                WHERE no_permintaan = ?
                  AND so_no = ?
                  AND no_pembelian = ?
                  AND no_barang = ?
            """, (no_permintaan, so_no, no_pembelian, no_barang))
            row = cur.fetchone()
            if row:
                result[key] = {"note_pesanan": row[0] or "", "note_pengiriman": row[1] or ""}
        return result
    finally:
        con.close()

def save_liw_purchase_note(no_permintaan, so_no, no_pembelian, no_barang, note, updated_by=None):
    values = (
        (no_permintaan or "").strip(),
        (so_no or "").strip(),
        (no_pembelian or "").strip(),
        (no_barang or "").strip(),
        (note or "").strip(),
        updated_by,
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_liw_purchase_notes_table(cur)
    try:
        cur.execute("""
            INSERT INTO liw_purchase_notes
            (no_permintaan, so_no, no_pembelian, no_barang, note, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(no_permintaan, so_no, no_pembelian, no_barang)
            DO UPDATE SET
              note = excluded.note,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at
        """, values)
        con.commit()
        return True
    finally:
        con.close()

def save_liw_delivery_note(no_permintaan, so_no, no_pembelian, no_barang, note_pengiriman, updated_by=None):
    values = (
        (no_permintaan or "").strip(),
        (so_no or "").strip(),
        (no_pembelian or "").strip(),
        (no_barang or "").strip(),
        (note_pengiriman or "").strip(),
        updated_by,
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_liw_purchase_notes_table(cur)
    try:
        cur.execute("""
            INSERT INTO liw_purchase_notes
            (no_permintaan, so_no, no_pembelian, no_barang, note_pengiriman, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(no_permintaan, so_no, no_pembelian, no_barang)
            DO UPDATE SET
              note_pengiriman = excluded.note_pengiriman,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at
        """, values)
        con.commit()
        return True
    finally:
        con.close()

def verify_password(plain, hashed):
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ─── BARANG BARU LOG ─────────────────────────────────────────────────────────

def get_salesman_targets(year):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_salesman_targets_table(cur)
    cur.execute("""
        SELECT salesman_id, salesman_name, month, amount
        FROM salesman_monthly_targets
        WHERE year = ?
        ORDER BY salesman_name, month
    """, (int(year),))
    result = {}
    for salesman_id, salesman_name, month, amount in cur.fetchall():
        item = result.setdefault(int(salesman_id), {
            "salesman_id": int(salesman_id),
            "salesman_name": salesman_name,
            "targets": {},
        })
        item["targets"][int(month)] = float(amount or 0)
    con.close()
    return result

def save_salesman_targets(year, rows, updated_by=None):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_salesman_targets_table(cur)
    now = datetime.now().isoformat(timespec="seconds")
    payload = []
    for row in rows or []:
        salesman_id = int(row.get("salesman_id") or 0)
        salesman_name = (row.get("salesman_name") or "").strip()
        targets = row.get("targets") or {}
        if not salesman_id or not salesman_name:
            continue
        for month in range(1, 13):
            amount = float(targets.get(str(month), targets.get(month, 0)) or 0)
            payload.append((int(year), salesman_id, salesman_name, month, amount, updated_by, now))

    cur.executemany("""
        INSERT INTO salesman_monthly_targets
            (year, salesman_id, salesman_name, month, amount, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(year, salesman_id, month) DO UPDATE SET
            salesman_name = excluded.salesman_name,
            amount = excluded.amount,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
    """, payload)
    con.commit()
    con.close()
    return len(payload)

def save_barang_baru(item):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        cur.execute("""
            INSERT OR IGNORE INTO barang_baru_log
            (itemid, itemno, description, description2, unit, type, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["itemid"], item["itemno"], item["description"],
            item["description2"], item["unit"], item.get("type", ""),
            item.get("created_by", ""), item["created_at"]
        ))
        if item.get("created_by"):
            cur.execute("""
                UPDATE barang_baru_log
                SET created_by = ?
                WHERE itemid = ?
                  AND (created_by IS NULL OR TRIM(created_by) = '')
            """, (item.get("created_by", ""), item["itemid"]))
        con.commit()
    except Exception as e:
        print(f"Error save_barang_baru: {e}")
    finally:
        con.close()

def get_barang_baru_log(date_from=None, date_to=None):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    conditions = ["1=1"]
    params = []
    if date_from:
        conditions.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("created_at <= ?")
        params.append(date_to + " 23:59:59")
    where = " AND ".join(conditions)
    cur.execute(f"""
        SELECT itemid, itemno, description, description2, unit, type, created_by, created_at
        FROM barang_baru_log WHERE {where} ORDER BY created_at DESC
    """, params)
    rows = cur.fetchall()
    con.close()
    return [{
        "itemid": r[0], "itemno": r[1], "description": r[2],
        "description2": r[3], "unit": r[4], "type": r[5],
        "created_by": r[6], "created_at": r[7]
    } for r in rows]

def get_max_logged_itemid():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT MAX(itemid) FROM barang_baru_log")
    row = cur.fetchone()
    con.close()
    return int(row[0] or 0)


def get_max_logged_itemhistid():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_itemhist_detected_table(cur)
    cur.execute("SELECT MAX(itemhistid) FROM itemhist_detected_log")
    row = cur.fetchone()
    con.close()
    return int(row[0] or 0)


def save_itemhist_detected_ids(itemhistids, detected_at=None, force_update=False):
    ids = [int(itemhistid or 0) for itemhistid in (itemhistids or []) if int(itemhistid or 0) > 0]
    if not ids:
        return 0
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_itemhist_detected_table(cur)
    now = detected_at or datetime.now().isoformat(timespec="seconds")
    if force_update:
        cur.executemany("""
            INSERT INTO itemhist_detected_log (itemhistid, detected_at)
            VALUES (?, ?)
            ON CONFLICT(itemhistid) DO UPDATE SET detected_at = excluded.detected_at
        """, [(itemhistid, now) for itemhistid in ids])
    else:
        cur.executemany(
            "INSERT OR IGNORE INTO itemhist_detected_log (itemhistid, detected_at) VALUES (?, ?)",
            [(itemhistid, now) for itemhistid in ids],
        )
    saved = cur.rowcount
    con.commit()
    con.close()
    return saved


def get_itemhist_detected_ids(date_from=None, date_to=None):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_itemhist_detected_table(cur)
    conditions = ["1=1"]
    params = []
    if date_from:
        conditions.append("SUBSTR(detected_at, 1, 10) >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("SUBSTR(detected_at, 1, 10) <= ?")
        params.append(date_to)
    cur.execute(f"""
        SELECT itemhistid
        FROM itemhist_detected_log
        WHERE {" AND ".join(conditions)}
        ORDER BY itemhistid DESC
    """, params)
    ids = [int(row[0]) for row in cur.fetchall()]
    con.close()
    return ids


def get_project_manual_realizations(project_no):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_project_manual_realization_table(cur)
    cur.execute("""
        SELECT project_no, account_no, amount, note, updated_by, updated_at
        FROM project_manual_realization
        WHERE UPPER(TRIM(project_no)) = UPPER(TRIM(?))
        ORDER BY account_no
    """, (project_no or "",))
    rows = cur.fetchall()
    con.close()
    return {
        str(row[1] or "").strip(): {
            "project_no": row[0],
            "account_no": row[1],
            "amount": float(row[2] or 0),
            "note": row[3] or "",
            "updated_by": row[4] or "",
            "updated_at": row[5] or "",
        }
        for row in rows
    }


def get_project_manual_realizations_for_projects(project_nos):
    normalized_project_nos = sorted({
        str(project_no or "").strip().upper()
        for project_no in project_nos
        if str(project_no or "").strip()
    })
    if not normalized_project_nos:
        return {}

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_project_manual_realization_table(cur)
    results = {}
    for index in range(0, len(normalized_project_nos), 900):
        chunk = normalized_project_nos[index:index + 900]
        placeholders = ", ".join(["?"] * len(chunk))
        cur.execute(f"""
            SELECT project_no, account_no, amount, note, updated_by, updated_at
            FROM project_manual_realization
            WHERE UPPER(TRIM(project_no)) IN ({placeholders})
            ORDER BY project_no, account_no
        """, chunk)
        for row in cur.fetchall():
            project_key = str(row[0] or "").strip().upper()
            account_key = str(row[1] or "").strip()
            results.setdefault(project_key, {})[account_key] = {
                "project_no": row[0],
                "account_no": row[1],
                "amount": float(row[2] or 0),
                "note": row[3] or "",
                "updated_by": row[4] or "",
                "updated_at": row[5] or "",
            }
    con.close()
    return results


def save_project_manual_realization(project_no, account_no, amount, note="", updated_by=None):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_project_manual_realization_table(cur)
    now = datetime.now().isoformat(timespec="seconds")
    cur.execute("""
        INSERT INTO project_manual_realization
            (project_no, account_no, amount, note, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_no, account_no) DO UPDATE SET
            amount = excluded.amount,
            note = excluded.note,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
    """, (
        (project_no or "").strip(),
        (account_no or "").strip(),
        float(amount or 0),
        note or "",
        updated_by,
        now,
    ))
    con.commit()
    con.close()
    return {
        "project_no": (project_no or "").strip(),
        "account_no": (account_no or "").strip(),
        "amount": float(amount or 0),
        "note": note or "",
        "updated_by": updated_by or "",
        "updated_at": now,
    }


def get_project_report_note(project_no):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_project_report_notes_table(cur)
    cur.execute("""
        SELECT project_no, note, updated_by, updated_at
        FROM project_report_notes
        WHERE UPPER(TRIM(project_no)) = UPPER(TRIM(?))
    """, ((project_no or "").strip(),))
    row = cur.fetchone()
    con.close()
    if not row:
        return {"project_no": (project_no or "").strip(), "note": "", "updated_by": "", "updated_at": ""}
    return {
        "project_no": row[0] or "",
        "note": row[1] or "",
        "updated_by": row[2] or "",
        "updated_at": row[3] or "",
    }


def save_project_report_note(project_no, note="", updated_by=None):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    ensure_project_report_notes_table(cur)
    now = datetime.now().isoformat(timespec="seconds")
    cur.execute("""
        INSERT INTO project_report_notes
            (project_no, note, updated_by, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_no) DO UPDATE SET
            note = excluded.note,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
    """, (
        (project_no or "").strip(),
        note or "",
        updated_by,
        now,
    ))
    con.commit()
    con.close()
    return {
        "project_no": (project_no or "").strip(),
        "note": note or "",
        "updated_by": updated_by or "",
        "updated_at": now,
    }
