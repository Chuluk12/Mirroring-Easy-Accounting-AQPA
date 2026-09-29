import copy
import ast
import unittest
from pathlib import Path

from profit_loss_service_hpp import apply_service_hpp, load_service_hpp_sources


KEY = ("AI-PP-261255", "JASA-REPAIR")


def sale(qty=1, date="2026-09-01", so=KEY[0]):
    return {"no_so": so, "no_barang": KEY[1], "tgl_faktur": date, "uom": "PCS",
            "qty_faktur": qty, "jumlah": 223500000 * qty, "nilai_hpp": 158800,
            "gross_profit": 223500000 * qty - 158800}


def receipt(qty=1, cost=191000000, **overrides):
    return {"id": 253000, "date": "2026-08-01", "kind": "P", "qty": qty,
            "cost": cost, "receipt": "DO.2026.08.00002", "po": "AI-S-262159",
            "refs": {KEY[0]}, "po_lines": {(28519, 1)}, **overrides}


class ServiceHppTests(unittest.TestCase):
    def apply(self, rows, qty=1, sources=None, order_lines=None):
        orders = {KEY: order_lines if order_lines is not None else [{"qty": qty, "unit": "PCS", "ratio": 1}]}
        apply_service_hpp(rows, orders, {KEY: [receipt()] if sources is None else sources})
        return rows

    def test_reported_invoice(self):
        row = self.apply([sale()])[0]
        self.assertEqual(row["nilai_hpp"], 191000000)
        self.assertEqual(row["gross_profit"], 32500000)
        self.assertEqual(row["hpp_reference"]["hpp_easy"], 158800)
        self.assertEqual(row["hpp_reference"]["details"][0]["no_po"], "AI-S-262159")

    def test_partial_invoices_are_independent_of_report_period(self):
        first, second = sale(1), sale(3, "2026-10-01")
        sources = [receipt(qty=4, cost=191000000)]
        together = self.apply([copy.deepcopy(first), copy.deepcopy(second)], qty=4, sources=sources)
        separate = [self.apply([r], qty=4, sources=sources)[0] for r in [first, second]]
        self.assertEqual([r["nilai_hpp"] for r in together], [47750000, 143250000])
        self.assertEqual([r["nilai_hpp"] for r in together], [r["nilai_hpp"] for r in separate])
        self.assertEqual(sum(r["nilai_hpp"] for r in separate), 191000000)

    def test_same_item_other_so_cannot_borrow_cost(self):
        rows = self.apply([sale(), sale(so="AI-PP-999999")])
        self.assertEqual(rows[0]["nilai_hpp"], 191000000)
        self.assertEqual(rows[1]["nilai_hpp"], 158800)
        self.assertEqual(rows[1]["hpp_reference"]["status"], "review")

    def test_multiple_receipts_for_one_job_are_added(self):
        rows = self.apply([sale(2)], qty=2, sources=[receipt(cost=90000000), receipt(cost=101000000, id=253001)])
        self.assertEqual(rows[0]["nilai_hpp"], 191000000)

    def test_uncertain_sources_keep_easy_and_explain(self):
        cases = [[], [receipt(refs={KEY[0], "AI-PP-261312"})],
                 [receipt(qty=.5)], [receipt(cost=0)], [receipt(kind="R", qty=-1)],
                 [receipt(date="2026-10-01")], [receipt(po_lines={(1, 1), (2, 1)})]]
        for sources in cases:
            with self.subTest(sources=sources):
                row = self.apply([sale()], sources=sources)[0]
                self.assertEqual(row["nilai_hpp"], 158800)
                self.assertEqual(row["hpp_reference"]["status"], "review")
                self.assertTrue(row["hpp_reference"]["reason"])

    def test_repeated_repair_lines_on_same_so_require_review(self):
        order = {"qty": 1, "unit": "PCS", "ratio": 1}
        row = self.apply([sale()], order_lines=[order, order])[0]
        self.assertEqual(row["hpp_reference"]["status"], "review")

    def test_excess_invoice_qty_and_wrong_unit_require_review(self):
        row = self.apply([sale(2)])[0]
        self.assertEqual(row["hpp_reference"]["status"], "review")
        row = sale(); row["uom"] = "BOX"
        self.apply([row])
        self.assertEqual(row["hpp_reference"]["status"], "review")

    def test_discount_does_not_reduce_actual_repair_cost(self):
        row = sale(.9); row["_service_hpp_qty"] = 1
        self.apply([row])
        self.assertEqual(row["nilai_hpp"], 191000000)
        self.assertNotIn("_service_hpp_qty", row)

    def test_other_items_unchanged(self):
        row = sale(); row["no_barang"] = "PUMP-001"
        expected = copy.deepcopy(row)
        self.apply([row])
        self.assertEqual(row, expected)

    def test_receipt_and_bill_sharing_item_history_are_not_counted_twice(self):
        class Cursor:
            def execute(self, sql, params):
                self.order_query = "FROM SO s" in sql

            def fetchall(self):
                if self.order_query:
                    return [(KEY[0], KEY[1], 1, "PCS", 1)]
                base = (253000, KEY[1], "2026-08-01", "P", 1, 191000000)
                tail = ("AI-S-262159", None, None, KEY[0], KEY[0], KEY[0], 28519, 1)
                return [base + ("RECEIPT",) + tail, base + ("BILL",) + tail]

        rows = [sale()]
        orders, receipts = load_service_hpp_sources(Cursor(), rows)
        self.assertEqual(len(receipts[KEY]), 1)
        apply_service_hpp(rows, orders, receipts)
        self.assertEqual(rows[0]["nilai_hpp"], 191000000)

    def test_summary_export_and_hpp_permission(self):
        # Load only pure reporting functions, without starting the server or its sync jobs.
        names = {"_profit_loss_summary", "_profit_loss_export_rows", "filter_record_columns"}
        tree = ast.parse(Path(__file__).with_name("server.py").read_text(encoding="utf-8"))
        namespace = {"MODULE_REQUIRED_RESPONSE_KEYS": {},
                     "PROFIT_LOSS_EXPORT_COLUMNS": {"nilai_hpp", "gross_profit"}}
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name in names:
                exec(compile(ast.Module(body=[node], type_ignores=[]), "server.py", "exec"), namespace)
        rows = self.apply([sale()])
        summary = namespace["_profit_loss_summary"](rows)
        self.assertEqual(summary["total_hpp"], 191000000)
        self.assertEqual(summary["gross_profit"], 32500000)
        exported = namespace["_profit_loss_export_rows"](rows)[0]
        self.assertEqual(exported["nilai_hpp"], 191000000)
        self.assertEqual(exported["hpp_easy"], 158800)
        self.assertEqual(exported["hpp_source"], "Penerimaan pembelian per SO")
        namespace["get_user_column_permissions"] = lambda role: {"profit_loss": ["nilai_hpp"]}
        visible = namespace["filter_record_columns"]("profit_loss", rows, {"role": "viewer"})[0]
        self.assertIn("hpp_reference", visible)
        namespace["get_user_column_permissions"] = lambda role: {"profit_loss": ["no_barang", "hpp_reference"]}
        hidden = namespace["filter_record_columns"]("profit_loss", rows, {"role": "viewer"})[0]
        self.assertNotIn("hpp_reference", hidden)


if __name__ == "__main__":
    unittest.main()
