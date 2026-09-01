import json
from datetime import datetime

import app_db as db


def ensure_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quotation_no TEXT NOT NULL UNIQUE,
            quotation_date TEXT NOT NULL,
            valid_until TEXT NOT NULL DEFAULT '',
            revision INTEGER NOT NULL DEFAULT 0,
            customer_source TEXT NOT NULL DEFAULT 'manual',
            customer_no TEXT NOT NULL DEFAULT '',
            customer_name TEXT NOT NULL,
            customer_address TEXT NOT NULL DEFAULT '',
            attention TEXT NOT NULL DEFAULT '',
            delivery_to TEXT NOT NULL DEFAULT '',
            subject TEXT NOT NULL DEFAULT '',
            items_json TEXT NOT NULL DEFAULT '[]',
            discount_type TEXT NOT NULL DEFAULT 'percentage',
            discount_value REAL NOT NULL DEFAULT 0,
            vat_enabled INTEGER NOT NULL DEFAULT 0,
            vat_rate REAL NOT NULL DEFAULT 11,
            delivery_term TEXT NOT NULL DEFAULT '',
            payment_terms TEXT NOT NULL DEFAULT '',
            delivery_time TEXT NOT NULL DEFAULT '',
            scope_of_works TEXT NOT NULL DEFAULT '',
            price_validity TEXT NOT NULL DEFAULT '',
            cf_cost REAL NOT NULL DEFAULT 0,
            mf_cost REAL NOT NULL DEFAULT 0,
            installation_cost REAL NOT NULL DEFAULT 0,
            shipping_cost REAL NOT NULL DEFAULT 0,
            packing_cost REAL NOT NULL DEFAULT 0,
            other_cost REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            created_by TEXT NOT NULL,
            created_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            reviewed_by TEXT,
            reviewed_at TEXT,
            review_note TEXT NOT NULL DEFAULT '',
            marketing_phone TEXT NOT NULL DEFAULT '',
            base_quotation_no TEXT NOT NULL DEFAULT '',
            parent_id INTEGER,
            target_margin_type TEXT NOT NULL DEFAULT 'percentage',
            target_margin_value REAL NOT NULL DEFAULT 0,
            auto_price INTEGER NOT NULL DEFAULT 1,
            submitted_by TEXT NOT NULL DEFAULT '',
            submitted_name TEXT NOT NULL DEFAULT '',
            submitted_at TEXT
        )
    """)
    columns = {row[1] for row in cur.execute("PRAGMA table_info(quotations)").fetchall()}
    if "marketing_phone" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN marketing_phone TEXT NOT NULL DEFAULT ''")
    if "base_quotation_no" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN base_quotation_no TEXT NOT NULL DEFAULT ''")
    if "parent_id" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN parent_id INTEGER")
    if "target_margin_type" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN target_margin_type TEXT NOT NULL DEFAULT 'percentage'")
    if "target_margin_value" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN target_margin_value REAL NOT NULL DEFAULT 0")
    if "auto_price" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN auto_price INTEGER NOT NULL DEFAULT 1")
    if "submitted_by" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN submitted_by TEXT NOT NULL DEFAULT ''")
    if "submitted_name" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN submitted_name TEXT NOT NULL DEFAULT ''")
    if "submitted_at" not in columns:
        cur.execute("ALTER TABLE quotations ADD COLUMN submitted_at TEXT")
    cur.execute("UPDATE quotations SET base_quotation_no=quotation_no WHERE base_quotation_no='' OR base_quotation_no IS NULL")


def _record(row):
    keys = [
        "id", "quotation_no", "quotation_date", "valid_until", "revision",
        "customer_source", "customer_no", "customer_name", "customer_address",
        "attention", "delivery_to", "subject", "items_json", "discount_type",
        "discount_value", "vat_enabled", "vat_rate", "delivery_term",
        "payment_terms", "delivery_time", "scope_of_works", "price_validity",
        "cf_cost", "mf_cost", "installation_cost", "shipping_cost", "packing_cost",
        "other_cost", "status", "created_by", "created_name", "created_at",
        "updated_at", "reviewed_by", "reviewed_at", "review_note", "marketing_phone",
        "base_quotation_no", "parent_id", "target_margin_type", "target_margin_value",
        "auto_price", "submitted_by", "submitted_name", "submitted_at",
    ]
    data = dict(zip(keys, row))
    if not data.get("submitted_name") and data.get("status") != "draft":
        data["submitted_name"] = data.get("created_name") or data.get("created_by") or "-"
    data["items"] = json.loads(data.pop("items_json") or "[]")
    subtotal = sum(float(item.get("qty") or 0) * float(item.get("unit_price") or 0) for item in data["items"])
    hpp = sum(float(item.get("qty") or 0) * float(item.get("hpp") or 0) for item in data["items"])
    discount = subtotal * float(data["discount_value"] or 0) / 100 if data["discount_type"] == "percentage" else float(data["discount_value"] or 0)
    net_sales = max(subtotal - discount, 0)
    vat = net_sales * float(data["vat_rate"] or 0) / 100 if data["vat_enabled"] else 0
    internal = sum(float(data[key] or 0) for key in ("cf_cost", "mf_cost", "installation_cost", "shipping_cost", "packing_cost", "other_cost"))
    margin = net_sales - hpp - internal
    data.update({
        "customer_status": "Pelanggan Lama" if data["customer_source"] == "easy" else "Pelanggan Baru",
        "subtotal": subtotal, "discount_amount": discount, "vat_amount": vat,
        "total_amount": net_sales + vat, "total_hpp": hpp,
        "total_internal_cost": internal, "planned_margin": margin,
        "margin_pct": margin / net_sales * 100 if net_sales else 0,
    })
    return data


def list_quotations():
    con = db.connect()
    cur = con.cursor()
    ensure_tables(cur)
    cur.execute("SELECT * FROM quotations ORDER BY created_at DESC, id DESC")
    data = [_record(row) for row in cur.fetchall()]
    con.commit()
    con.close()
    return data


def save_quotation(payload, username, name, quotation_id=None, allow_submitted=False):
    now = datetime.now().isoformat(timespec="seconds")
    con = db.connect()
    cur = con.cursor()
    ensure_tables(cur)
    items = payload.get("items") or []
    if quotation_id:
        cur.execute("SELECT status, created_by FROM quotations WHERE id=?", (quotation_id,))
        existing = cur.fetchone()
        editable_statuses = ("draft", "rejected", "submitted") if allow_submitted else ("draft", "rejected")
        if not existing or existing[0] not in editable_statuses:
            con.close()
            return None
        quotation_no = payload.get("quotation_no")
    else:
        temp_no = f"TMP-{username}-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        quotation_no = temp_no
    customer_no = str(payload.get("customer_no") or "").strip()
    customer_source = "easy" if str(payload.get("customer_source") or "").lower() == "easy" and customer_no else "manual"
    values = (
        str(payload.get("quotation_date") or ""), str(payload.get("valid_until") or ""),
        customer_source, customer_no if customer_source == "easy" else "",
        str(payload.get("customer_name") or "").strip(), str(payload.get("customer_address") or "").strip(),
        str(payload.get("attention") or "").strip(), str(payload.get("delivery_to") or "").strip(),
        str(payload.get("subject") or "").strip(), json.dumps(items, ensure_ascii=False),
        str(payload.get("discount_type") or "percentage"), float(payload.get("discount_value") or 0),
        1 if payload.get("vat_enabled") else 0, float(payload.get("vat_rate") or 0),
        str(payload.get("delivery_term") or ""), str(payload.get("payment_terms") or ""),
        str(payload.get("delivery_time") or ""), str(payload.get("scope_of_works") or ""),
        str(payload.get("price_validity") or ""), float(payload.get("cf_cost") or 0),
        float(payload.get("mf_cost") or 0), float(payload.get("installation_cost") or 0),
        float(payload.get("shipping_cost") or 0), float(payload.get("packing_cost") or 0),
        float(payload.get("other_cost") or 0), str(payload.get("marketing_phone") or "").strip(),
        str(payload.get("target_margin_type") or "percentage"),
        float(payload.get("target_margin_value") or 0),
        1 if payload.get("auto_price", True) else 0, now,
    )
    if quotation_id:
        cur.execute("""
            UPDATE quotations SET quotation_date=?, valid_until=?, customer_source=?,
            customer_no=?, customer_name=?, customer_address=?, attention=?, delivery_to=?,
            subject=?, items_json=?, discount_type=?, discount_value=?, vat_enabled=?, vat_rate=?,
            delivery_term=?, payment_terms=?, delivery_time=?, scope_of_works=?, price_validity=?,
            cf_cost=?, mf_cost=?, installation_cost=?, shipping_cost=?, packing_cost=?, other_cost=?,
            marketing_phone=?, target_margin_type=?, target_margin_value=?, auto_price=?,
            status='draft', review_note='', updated_at=? WHERE id=?
        """, values + (quotation_id,))
    else:
        cur.execute("""
            INSERT INTO quotations (quotation_no, quotation_date, valid_until, customer_source,
            customer_no, customer_name, customer_address, attention, delivery_to, subject,
            items_json, discount_type, discount_value, vat_enabled, vat_rate, delivery_term,
            payment_terms, delivery_time, scope_of_works, price_validity, cf_cost, mf_cost,
            installation_cost, shipping_cost, packing_cost, other_cost, marketing_phone,
            target_margin_type, target_margin_value, auto_price, status, created_by,
            created_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    'draft', ?, ?, ?, ?)
        """, (quotation_no,) + values[:-1] + (username, name, now, now))
        cur.execute("SELECT id FROM quotations WHERE quotation_no=?", (quotation_no,))
        quotation_id = int(cur.fetchone()[0])
        quotation_no = f"QTN-{datetime.now().strftime('%y%m')}-{quotation_id:04d}"
        cur.execute("UPDATE quotations SET quotation_no=?, base_quotation_no=? WHERE id=?", (quotation_no, quotation_no, quotation_id))
    con.commit()
    con.close()
    return quotation_id


def delete_quotation(quotation_id, username, is_admin=False):
    con = db.connect()
    cur = con.cursor()
    ensure_tables(cur)
    cur.execute("SELECT created_by, status FROM quotations WHERE id=?", (quotation_id,))
    row = cur.fetchone()
    if not row:
        con.close()
        return "not_found"
    if not is_admin and (row[0] != username or row[1] not in ("draft", "rejected")):
        con.close()
        return "forbidden"
    cur.execute("DELETE FROM quotations WHERE id=?", (quotation_id,))
    con.commit()
    con.close()
    return "deleted"


def create_revision(quotation_id, username, name, is_admin=False):
    now = datetime.now().isoformat(timespec="seconds")
    con = db.connect()
    cur = con.cursor()
    ensure_tables(cur)
    cur.execute("SELECT * FROM quotations WHERE id=?", (quotation_id,))
    row = cur.fetchone()
    if not row:
        con.close()
        return "not_found", None
    columns = [description[0] for description in cur.description]
    source = dict(zip(columns, row))
    if source["status"] != "approved" or (not is_admin and source["created_by"] != username):
        con.close()
        return "forbidden", None
    base_no = source.get("base_quotation_no") or source["quotation_no"]
    cur.execute("""
        SELECT id FROM quotations
        WHERE base_quotation_no=? AND status IN ('draft','submitted','rejected')
        LIMIT 1
    """, (base_no,))
    if cur.fetchone():
        con.close()
        return "open_revision", None
    cur.execute("SELECT COALESCE(MAX(revision), 0) FROM quotations WHERE base_quotation_no=?", (base_no,))
    next_revision = int(cur.fetchone()[0] or 0) + 1
    revision_no = f"{base_no}-R{next_revision}"
    copied_columns = [
        "quotation_date", "valid_until", "customer_source", "customer_no",
        "customer_name", "customer_address", "attention", "delivery_to", "subject",
        "items_json", "discount_type", "discount_value", "vat_enabled", "vat_rate",
        "delivery_term", "payment_terms", "delivery_time", "scope_of_works",
        "price_validity", "cf_cost", "mf_cost", "installation_cost", "shipping_cost",
        "packing_cost", "other_cost", "marketing_phone",
        "target_margin_type", "target_margin_value", "auto_price",
    ]
    insert_columns = [
        "quotation_no", "revision", *copied_columns, "status", "created_by",
        "created_name", "created_at", "updated_at", "base_quotation_no", "parent_id",
    ]
    values = [
        revision_no, next_revision, *(source[column] for column in copied_columns),
        "draft", username, name, now, now, base_no, quotation_id,
    ]
    placeholders = ",".join("?" for _ in insert_columns)
    cur.execute(
        f"INSERT INTO quotations ({','.join(insert_columns)}) VALUES ({placeholders})",
        values,
    )
    new_id = int(cur.lastrowid)
    con.commit()
    con.close()
    return "created", {"id": new_id, "revision": next_revision, "base_quotation_no": base_no}


def change_status(quotation_id, action, username, name="", note=""):
    mapping = {"submit": ("draft", "submitted"), "approve": ("submitted", "approved"), "reject": ("submitted", "rejected")}
    source, target = mapping[action]
    con = db.connect()
    cur = con.cursor()
    ensure_tables(cur)
    now = datetime.now().isoformat(timespec="seconds")
    if action == "submit":
        cur.execute(
            "UPDATE quotations SET status=?, submitted_by=?, submitted_name=?, submitted_at=?, updated_at=? WHERE id=? AND status IN ('draft','rejected')",
            (target, username, name or username, now, now, quotation_id),
        )
        ok = cur.rowcount > 0
    else:
        cur.execute("UPDATE quotations SET status=?, reviewed_by=?, reviewed_at=?, review_note=?, updated_at=? WHERE id=? AND status=?", (target, username, now, note, now, quotation_id, source))
        ok = cur.rowcount > 0
        if action == "approve" and ok:
            cur.execute("SELECT base_quotation_no, revision FROM quotations WHERE id=?", (quotation_id,))
            approved = cur.fetchone()
            if approved and int(approved[1] or 0) > 0:
                cur.execute("""
                    UPDATE quotations SET status='superseded', updated_at=?
                    WHERE id<>? AND base_quotation_no=? AND status='approved'
                """, (now, quotation_id, approved[0]))
    con.commit()
    con.close()
    return ok
