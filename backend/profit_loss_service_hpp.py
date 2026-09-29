"""SO-specific repair costs for Profit & Loss; never writes to Easy."""

import re
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP


SERVICE_HPP_ITEMS = {"JASA-REPAIR"}
SO_REFERENCE = re.compile(r"\bAI-PP-\d+\b", re.IGNORECASE)


def _number(value):
    return Decimal(str(value or 0))


def _money(value):
    return float(_number(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _text(value):
    return str(value or "").strip().upper()


def load_service_hpp_sources(cur, rows):
    """Read SO quantities and actual inventory receipts, including outside the report period."""
    targets = {(_text(r.get("no_so")), _text(r.get("no_barang"))) for r in rows
               if _text(r.get("no_barang")) in SERVICE_HPP_ITEMS}
    so_numbers = sorted({so for so, _ in targets if so})
    orders = defaultdict(list)
    receipts = defaultdict(list)
    if not so_numbers:
        return orders, receipts
    for start in range(0, len(so_numbers), 400):
        chunk = so_numbers[start:start + 400]
        placeholders = ",".join("?" for _ in chunk)
        cur.execute(f"""
            SELECT s.SONO, d.ITEMNO, d.QUANTITY, d.ITEMUNIT, d.UNITRATIO
            FROM SO s JOIN SODET d ON d.SOID = s.SOID
            WHERE UPPER(TRIM(s.SONO)) IN ({placeholders})
        """, chunk)
        for so, item, qty, unit, ratio in cur.fetchall():
            key = (_text(so), _text(item))
            if key in targets:
                orders[key].append({"qty": qty, "unit": _text(unit), "ratio": ratio})

    # ITEMHIST is the receipt cost in base currency, after purchase valuation.
    # A vendor bill can point at the same receipt: deduplicate by ITEMHISTID below.
    items = sorted(SERVICE_HPP_ITEMS)
    placeholders = ",".join("?" for _ in items)
    cur.execute(f"""
        SELECT h.ITEMHISTID, h.ITEMNO, h.TXDATE, h.TXTYPE, h.QUANTITY, h.COST,
               a.INVOICENO, p.PONO, d.ITEMRESERVED9, d.ITEMRESERVED10,
               pd.ITEMRESERVED9, pd.ITEMRESERVED10, rd.ITEMRESERVED9,
               d.POID, d.POSEQ
        FROM APITMDET d
        JOIN APINV a ON a.APINVOICEID = d.APINVOICEID
        JOIN ITEMHIST h ON h.ITEMHISTID = d.ITEMHISTID
        LEFT JOIN PO p ON p.POID = d.POID
        LEFT JOIN PODET pd ON pd.POID = d.POID AND pd.SEQ = d.POSEQ
        LEFT JOIN REQUISITIONDET rd ON rd.REQID = pd.REQID AND rd.SEQ = pd.REQSEQ
        WHERE UPPER(TRIM(h.ITEMNO)) IN ({placeholders})
          AND h.TXDATE <= ?
        ORDER BY h.TXDATE, h.ITEMHISTID, a.INVOICEDATE, a.APINVOICEID
    """, items + [max(str(r.get("tgl_faktur") or "") for r in rows)])
    histories = {}
    for result in cur.fetchall():
        hist_id, item, date, kind, qty, cost, receipt, po = result[:8]
        refs = {m.upper() for value in result[8:13] for m in SO_REFERENCE.findall(str(value or ""))}
        entry = histories.setdefault(hist_id, {
            "id": hist_id, "item": _text(item), "date": str(date), "kind": _text(kind),
            "qty": qty, "cost": cost, "receipt": receipt, "po": po,
            "refs": set(), "po_lines": set(),
        })
        entry["refs"].update(refs)
        entry["po_lines"].add((result[13], result[14]))
    for entry in histories.values():
        for so in entry["refs"]:
            key = (so, entry["item"])
            if key in targets:
                receipts[key].append(entry)
    return orders, receipts


def apply_service_hpp(rows, orders, receipts):
    """Allocate completed receipt costs using the full SO quantity, never the page/filter total.

    Partial deliveries/invoices receive only their quantity share. Incomplete receipts,
    reused SO lines, mixed references and returns require review instead of guessing.
    """
    grouped = defaultdict(list)
    for row in rows:
        if _text(row.get("no_barang")) in SERVICE_HPP_ITEMS:
            grouped[(_text(row.get("no_so")), _text(row.get("no_barang")))].append(row)
    for key, group in grouped.items():
        order_lines = orders.get(key, [])
        for row in group:
            original = row["nilai_hpp"]
            row["hpp_reference"] = {
                "status": "review", "source": "HPP Easy (belum dikoreksi)",
                "hpp_easy": original, "no_so": key[0], "details": [],
            }
            reference = row["hpp_reference"]
            reason = ""
            sources = [r for r in receipts.get(key, []) if r["date"] <= str(row.get("tgl_faktur") or "")]
            if not key[0]:
                reason = "Referensi SO belum tersedia."
            elif len(order_lines) != 1:
                reason = "Baris repair pada SO tidak ditemukan atau lebih dari satu."
            elif not sources:
                reason = "Penerimaan pembelian terkait SO belum ditemukan sampai tanggal faktur."
            elif any(r["refs"] != {key[0]} or len(r["po_lines"]) != 1 or not r["po"] for r in sources):
                reason = "Referensi penerimaan/pembelian tidak menunjuk satu SO dan baris PO yang pasti."
            elif any(r["kind"] != "P" or _number(r["qty"]) <= 0 or _number(r["cost"]) <= 0 for r in sources):
                reason = "Ada retur atau nilai penerimaan yang perlu diperiksa."
            if not reason:
                order = order_lines[0]
                ratio = _number(order["ratio"] or 1)
                order_qty = _number(order["qty"])
                received_qty = sum((_number(r["qty"]) for r in sources), Decimal(0))
                row_qty = _number(row.get("_service_hpp_qty", row.get("qty_faktur")))
                group_qty = sum((_number(r.get("_service_hpp_qty", r.get("qty_faktur"))) for r in group), Decimal(0))
                if order_qty <= 0 or ratio <= 0 or _text(row.get("uom")) != order["unit"]:
                    reason = "Kuantitas atau satuan penjualan berbeda dengan SO."
                elif abs(received_qty - order_qty * ratio) > Decimal("0.0001"):
                    reason = "Kuantitas penerimaan belum lengkap atau berbeda dengan SO."
                elif row_qty <= 0 or group_qty > order_qty + Decimal("0.0001"):
                    reason = "Kuantitas faktur melebihi SO atau tidak valid."
                else:
                    total_cost = sum((_number(r["cost"]) for r in sources), Decimal(0))
                    allocated = _money(total_cost * row_qty / order_qty)
                    reference.update({
                        "status": "matched", "source": "Penerimaan pembelian per SO",
                        "qty_so": float(order_qty), "qty_baris": float(row_qty),
                        "total_biaya_penerimaan": _money(total_cost), "nilai_alokasi": allocated,
                        "details": [{"no_po": r["po"], "no_penerimaan": r["receipt"],
                                     "tanggal": r["date"], "qty_dasar": float(r["qty"]),
                                     "nilai": _money(r["cost"])} for r in sources],
                    })
                    row["nilai_hpp"] = allocated
                    row["gross_profit"] = _money(_number(row["jumlah"]) - _number(allocated))
            if reason:
                reference["reason"] = reason
    for row in rows:
        row.pop("_service_hpp_qty", None)
    return rows
