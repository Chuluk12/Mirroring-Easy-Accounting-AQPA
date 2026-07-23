from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required,
    get_jwt_identity, get_jwt
)
from datetime import datetime, timedelta
from pathlib import Path
from auth import (
    init_db, get_user, get_user_permissions,
    get_all_users, get_user_by_id, create_user, delete_user, update_user_password, verify_password,
    upsert_role, delete_role, get_all_column_permissions, get_user_column_permissions,
    save_barang_baru, get_barang_baru_log, get_max_logged_itemid, get_logged_itemnos,
    is_excluded_barang_baru,
    log_activity, get_audit_logs, get_salesman_targets, save_salesman_targets,
    get_max_logged_itemhistid, save_itemhist_detected_ids, get_itemhist_detected_ids,
    get_liw_purchase_notes, save_liw_purchase_note, save_liw_delivery_note,
    get_project_manual_realizations, get_project_manual_realizations_for_projects, save_project_manual_realization,
    get_project_report_note, save_project_report_note,
    get_project_remarks_for_projects, save_project_remark,
    get_profit_loss_manual_costs, save_profit_loss_manual_cost,
    get_sales_document_checklists, save_sales_document_checklist,
    delete_sales_custom_document,
    get_customer_registration_document_checklists, save_customer_registration_document_checklist,
    delete_customer_registration_custom_document,
    get_customer_part_numbers, get_vendor_part_numbers, save_part_number,
    get_purchase_request_remarks, save_purchase_request_remark,
    get_sales_delivery_remarks, save_sales_delivery_remark,
    get_delivery_time_tracking, save_delivery_time_tracking
    , get_fee_submissions, save_fee_submission, review_fee_submission, delete_fee_submission,
    create_fee_submission_batch,
    update_user_salesman
)
from integration import create_integration_blueprint
import fdb
import hmac
import os
import re
import threading
import time
import uuid

app = Flask(__name__)
CORS(app)
app.config["JWT_SECRET_KEY"] = "easy-dashboard-secret-2026"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)

jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=50*1024*1024)

if os.name == 'nt':
    fdb.load_api("C:/Program Files/Firebird/Firebird_3_0/fbclient.dll")
else:
    # Try different possible locations for Linux
    possible_paths = [
        "libfbclient.so.2",
        "libfbclient.so",
        "/usr/lib/x86_64-linux-gnu/libfbclient.so.2",
        "/usr/lib/x86_64-linux-gnu/libfbclient.so"
    ]
    loaded = False
    for path in possible_paths:
        try:
            fdb.load_api(path)
            loaded = True
            break
        except Exception:
            continue
    if not loaded:
        raise Exception("Firebird Client Library not found. Please install libfbclient2.")

def load_env_file(path):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


load_env_file(Path(__file__).with_name(".env"))

DRIVER_INTEGRATION_API_KEY = os.getenv("DRIVER_INTEGRATION_API_KEY", "").strip()

DB_CONFIG = {
    "host": os.getenv("EASY_DB_HOST", "192.168.10.5"),
    "port": int(os.getenv("EASY_DB_PORT", "3999")),
    "database": os.getenv("EASY_DB_PATH", "E:/EASY/AQPA.EASY6"),
    "user": os.getenv("EASY_DB_USER", "SYSDBA"),
    "password": os.getenv("EASY_DB_PASSWORD", "NewPassword123"),
    "charset": os.getenv("EASY_DB_CHARSET", "UTF8")
}

# DB_CONFIG = {
#     "host": os.getenv("EASY_DB_HOST", "127.0.0.1"),
#     "port": int(os.getenv("EASY_DB_PORT", "3999")),
#     "database": os.getenv("EASY_DB_PATH", "D:/EASY/AQPA.EASY6"),
#     "user": os.getenv("EASY_DB_USER", "SYSDBA"),
#     "password": os.getenv("EASY_DB_PASSWORD", "NewPassword123")
# }


BACKEND_PORT = int(os.getenv("EASY_BACKEND_PORT", "5000"))
INTEGRATION_API_KEY = os.getenv("EASY_INTEGRATION_API_KEY", "")

MODULE_COLUMNS = {
    "stock": [
        "itemno", "description", "description2", "quantity", "stock_sistem", "stock_centre", "minimum_qty", "unit", "category",
        "cost_description", "stock_note", "code_product",
    ],
    "siinas": [
        "no_urut", "no_barang", "deskripsi_persediaan", "kode_barang_jadi",
        "jenis_barang_jadi", "fsa", "hs_code", "kbli", "barang_jadi",
        "jenis_persediaan", "akun_persediaan", "nama_pemasok_barang",
        "unit_1", "rasio_2_barang", "unit_2", "rasio_3_barang", "unit_3",
        "tgl_faktur", "no_faktur", "deskripsi_barang", "tipe_transaksi", "masuk", "keluar",
        "nama_pelanggan_pemasok", "negara_pelanggan_pemasok", "tipe_persediaan_barang",
        "akun_persediaan_barang",
    ],
    "barang-baru": [
        "created_at", "itemno", "description", "description2", "unit",
    ],
    "riwayat": [
        "itemhistid", "txdate", "itemno", "description", "txtype", "quantity", "unit",
        "keterangan", "status_lacak", "is_backdate_detected",
    ],
    "permintaan": [
        "no_permintaan", "tgl_permintaan", "tgl_target", "no_so", "deskripsi", "no_barang",
        "deskripsi_barang", "qty", "qty_ordered", "qty_received", "unit", "no_po",
        "tgl_pesanan_po", "estimasi_po", "vendor", "qty_po",
        "aging", "status_dt_po", "remark", "remark_updated_by", "remark_updated_at",
        "row_key", "status", "status_color",
    ],
    "pembelian": [
        "no_pembelian", "tgl_pembelian", "tgl_ekspetasi", "top",
        "no_permintaan", "tgl_permintaan", "tgl_target_permintaan",
        "so_no", "tgl_so", "est_kirim_so", "nama_pelanggan_so",
        "no_po_customer_so", "salesman_so", "no_barang_so", "deskripsi_barang_so",
        "qty_so", "qty_order_so", "qty_shipped_so", "sisa_kirim_so",
        "stok_tersedia_so", "stock_sistem_so", "uom_so",
        "no_pengiriman_so", "tgl_kirim_so", "note_pengiriman", "harga_satuan_penjualan",
        "no_pemasok", "nama_pemasok", "purchaser",
        "deskripsi", "no_barang", "deskripsi_barang", "qty", "uom", "note_pesanan",
        "no_penerimaan_barang", "tgl_penerimaan_barang",
        "price", "disc_pct", "diskon", "ppn_kode", "ppn_rate", "ppn_amount", "pph", "add_cost", "dpp", "amount",
        "nilai_po", "uang_muka", "sisa_po", "status_pembayaran",
        "no_faktur_pengajuan", "pengajuan_bayar", "dibayar_fat", "sisa_hutang_fat", "status_fat",
        "total_easy",
    ],
    "penerimaan": [
        "no_penerimaan", "no_formulir", "tgl_penerimaan", "no_pemasok", "nama_pemasok",
        "deskripsi", "no_barang", "deskripsi_barang", "qty", "unit", "harga",
        "no_pesanan", "no_permintaan",
    ],
    "fpb": [
        "no_faktur", "no_faktur_dp", "tgl_faktur_dp", "tgl_faktur", "no_pemasok",
        "nama_pemasok", "nilai_faktur", "uang_muka", "nilai_terbayar", "terhutang",
        "jatuh_tempo", "deskripsi", "no_po", "status", "overdue",
    ],
    "penjualan_so": [
        "no_so", "tgl_so", "tgl_estimasi", "no_pelanggan", "nama_pelanggan",
        "no_po_customer", "nama_salesman", "no_barang", "deskripsi_barang", "qty",
        "category_produk", "qty_shipped", "sisa_kirim", "stok_tersedia", "uom", "unit_price", "disc_pct",
        "disc_header_pct", "disc_header_amount", "discount_amount", "ppn_rate",
        "ppn_amount", "subtotal", "amount", "no_pengiriman", "tgl_pengiriman",
        "status", "shipto", "deskripsi_so",
    ],
    "penjualan": [
        "no_penjualan", "tgl_penjualan", "no_pelanggan", "nama_pelanggan", "no_po",
        "deskripsi", "no_barang", "deskripsi_barang", "qty", "uom", "price",
        "disc_pct", "ppn_kode", "ppn_rate", "ppn_amount", "amount",
    ],
    "penjualan_do": [
        "marketing", "no_pesanan", "tgl_pesanan", "tgl_estimasi_so",
        "no_pelanggan", "nama_pelanggan", "no_po",
        "no_pengiriman", "tgl_pengiriman", "no_barang", "deskripsi_barang",
        "qty_so", "qty_shipped", "stok_barang", "uom", "no_do", "deskripsi",
        "status_so", "status_do", "umur", "keterangan_so", "remark", "row_key",
    ],
    "waktu_pengiriman": [
        "arinvoice_id", "no_pengiriman", "tgl_pengiriman", "no_so", "no_po",
        "customer", "jenis_dokumen", "remarks_do", "expedition",
        "ket_pengiriman", "resi", "etd", "eta_cust", "receive_date",
        "status_pengiriman",
        "target_do_kembali", "do_kembali", "status_do_kembali",
        "isue_pengiriman", "updated_by", "updated_at",
    ],
    "invoice": [
        "no_faktur", "tgl_faktur", "no_po", "no_pesanan", "no_pengiriman",
        "no_pelanggan", "nama_pelanggan", "nilai_faktur", "uang_muka",
        "nilai_terbayar", "terhutang", "umur_hari", "umur_label", "umur_color",
        "deskripsi",
    ],
    "salesman": [
        "salesman_id", "nama_lengkap", "targets", "total_target",
    ],
    "customer": [
        "customer_id", "no_pelanggan", "nama_pelanggan", "alamat", "kota",
        "provinsi", "kode_pos", "negara", "kontak", "telepon", "fax", "email",
        "webpage", "salesman_id", "nama_salesman", "credit_limit", "balance",
        "status", "suspended", "catatan",
    ],
    "fee_submission": [
        "so_no", "so_date", "customer_no", "customer_name", "salesman_id",
        "salesman_name", "dpp", "mf_rate_pct", "mf_amount", "mf_status",
        "mf_submitted_at", "mf_transaction_date", "cf_enabled", "cf_rate_pct", "cf_amount", "cf_status",
        "cf_submitted_at", "cf_transaction_date", "actual_mf",
        "actual_cf", "submission_id", "fee_type", "status", "submitted_at", "transaction_date",
        "submitted_by", "reviewed_by", "reviewed_at", "review_note",
        "batch_id", "batch_no", "customer_no", "customer_name", "customer_po",
    ],
    "customer_registration_documents": [
        "customer_no", "no_pelanggan", "nama_pelanggan", "kontak", "telepon",
        "kota", "nama_salesman", "status", "documents", "custom_documents",
        "required_count", "completed_count", "progress_pct",
    ],
    "spk": [
        "no_spk", "tanggal", "estimasi", "tgl_selesai", "deskripsi", "no_barang",
        "nama_barang", "job_desc", "qty", "uom", "status_barang", "tipe_persediaan",
        "no_pesanan", "no_po", "total_mat_plan", "total_mat_keluar",
        "material_progress", "production_status",
    ],
    "formula": [
        "formula_id", "no_formula", "kategori_produk", "deskripsi_formula",
        "no_barang", "spesifikasi_produk", "qty_build", "unit", "status",
        "status_code", "total_material",
    ],
    "monitoring_formula": [
        "wodet_id", "no_spk", "tanggal", "no_barang", "nama_barang", "qty_spk",
        "uom", "no_formula", "formula_material_count", "spk_material_count",
        "spm_material_count", "formula_vs_spk_status", "spk_vs_spm_status",
        "material_stock_status", "material_stock_shortage_count",
        "formula_material_cost", "formula_production_cost", "formula_total_cost",
        "spk_material_cost", "spk_production_cost", "spk_total_cost",
        "hpp_total_actual", "hpp_per_unit", "hpp_per_unit_spk", "hpp_status",
        "material_cost_diff", "production_cost_diff", "total_cost_diff",
        "no_pesanan", "no_po", "wip_reconciliation",
    ],
    "spm": [
        "no_pengeluaran", "tgl_pengeluaran", "no_pk", "tgl_pk", "deskripsi",
        "no_barang", "deskripsi_barang", "qty_keluar", "qty_plan", "satuan",
        "persentase", "status",
    ],
    "gp": [
        "no_hasil", "tgl_hasil", "no_spk", "no_spm", "deskripsi", "no_barang",
        "deskripsi_barang", "qty_jadi", "qty_plan", "uom", "persentase", "status",
    ],
    "hpp": [
        "no_barang", "deskripsi_barang", "qty_produksi", "qty_terjual",
        "hpp_total", "hpp_per_unit", "harga_jual_rata", "nilai_jual",
        "laba_rugi", "margin_pct", "status", "sales_details",
    ],
    "profit_loss": [
        "no_faktur", "no_do", "no_so", "tgl_faktur", "no_barang", "deskripsi_barang",
        "qty_faktur", "uom", "harga_satuan", "jumlah", "nilai_hpp",
        "delivery", "delivery_details", "delivery_ju", "delivery_ju_details",
        "cf", "cf_pct", "cf_details", "mf", "mf_pct", "mf_details",
        "biaya_project", "biaya_project_details", "total_biaya", "laba_operasi",
        "gross_profit", "margin_pct", "no_pelanggan", "nama_pelanggan",
        "no_po", "marketing", "no_delivery", "no_jurnal_delivery_ju",
        "manual_cost_key",
    ],
    "aset": [
        "no_aktiva", "nama_aktiva", "tanggal_aktiva", "nilai_aktiva",
        "deskripsi",
    ],
    "aset_bangunan": [
        "tanggal", "no_project", "nama_project", "no_akun", "nama_akun",
        "no_dokumen", "deskripsi", "nilai",
    ],
    "project": [
        "project_id", "no_project", "nama_project", "nama_kontak",
        "tanggal_mulai", "tanggal_selesai", "komplit", "deskripsi",
        "rab", "realisasi", "selisih", "value_profit_rab", "profit_rab",
        "value_profit_realisasi", "profit_realisasi", "remarks",
        "remarks_updated_by", "remarks_updated_at", "average_pct", "status",
        "dihentikan",
    ],
    "project_report": [
        "no_akun", "manual_account_key", "nama_akun", "rab", "realisasi", "is_manual",
        "manual_note", "manual_updated_by", "manual_updated_at", "has_easy_realization",
        "is_total", "is_percentage", "show_rab_percentage", "show_realisasi_percentage",
        "realization_source", "source_references", "fee_details",
    ],
    "project_detail": [
        "tanggal", "no_project", "nama_project", "no_akun", "nama_akun",
        "sumber", "tipe_transaksi", "no_dokumen", "deskripsi", "nilai",
    ],
    "beban_gaji": [
        "tanggal", "no_akun", "nama_akun", "sumber", "tipe_transaksi",
        "no_dokumen", "deskripsi", "nilai",
    ],
    "beban_etoll": [
        "tanggal", "no_akun", "nama_akun", "sumber", "tipe_transaksi",
        "no_dokumen", "deskripsi", "nilai",
    ],
    "beban_transport": [
        "tanggal", "no_akun", "nama_akun", "sumber", "tipe_transaksi",
        "no_dokumen", "deskripsi", "nilai",
    ],
    "beban_utilitas": [
        "tanggal", "no_akun", "nama_akun", "sumber", "tipe_transaksi",
        "no_dokumen", "deskripsi", "nilai",
    ],
}

MODULE_COLUMN_PARENTS = {
    "stock": "stock",
    "siinas": "siinas",
    "barang-baru": "barang-baru",
    "riwayat": "riwayat",
    "permintaan": "pembelian",
    "pembelian": "pembelian",
    "penerimaan": "pembelian",
    "fpb": "pembelian",
    "penjualan_so": "penjualan",
    "penjualan": "penjualan",
    "penjualan_do": "penjualan",
    "waktu_pengiriman": "penjualan",
    "invoice": "penjualan",
    "salesman": "penjualan",
    "fee_submission": "penjualan",
    "customer": "penjualan",
    "customer_registration_documents": "penjualan",
    "spk": "spk",
    "formula": "spk",
    "monitoring_formula": "spk",
    "spm": "spk",
    "gp": "spk",
    "hpp": "akuntansi",
    "profit_loss": "akuntansi",
    "aset": "akuntansi",
    "aset_bangunan": "akuntansi",
    "project_report": "project",
    "beban_gaji": "akuntansi",
    "beban_etoll": "akuntansi",
    "beban_transport": "akuntansi",
    "beban_utilitas": "akuntansi",
}

MODULE_REQUIRED_RESPONSE_KEYS = {
    "stock": ["itemno"],
    "siinas": ["no_barang"],
    "barang-baru": ["log_id", "itemno"],
    "riwayat": ["itemhistid", "itemno"],
    "permintaan": ["no_permintaan", "no_barang"],
    "pembelian": ["no_pembelian", "no_barang"],
    "penerimaan": ["no_penerimaan", "no_barang"],
    "fpb": ["no_faktur"],
    "penjualan_so": ["no_so", "no_barang"],
    "penjualan": ["no_penjualan", "no_barang"],
    "penjualan_do": ["no_pengiriman", "no_barang"],
    "waktu_pengiriman": ["arinvoice_id", "no_pengiriman"],
    "invoice": ["no_faktur"],
    "salesman": ["salesman_id", "targets"],
    "fee_submission": ["so_no", "salesman_id", "status"],
    "customer": ["customer_id", "no_pelanggan", "nama_pelanggan"],
    "customer_registration_documents": ["customer_no", "no_pelanggan", "nama_pelanggan", "documents", "custom_documents"],
    "spk": ["wodet_id", "no_spk", "no_barang"],
    "formula": ["formula_id", "no_formula", "no_barang"],
    "monitoring_formula": [
        "wodet_id", "no_spk", "no_barang", "materials", "production_details",
        "tgl_selesai", "qty_hasil_produksi", "production_progress", "production_results",
        "qty_berhenti_produksi",
        "total_mat_plan", "total_mat_keluar", "material_progress", "production_status",
        "hpp_total_actual", "hpp_per_unit", "hpp_per_unit_spk", "hpp_status",
        "wip_reconciliation",
    ],
    "spm": ["no_pengeluaran", "no_barang"],
    "gp": ["no_hasil", "no_barang"],
    "hpp": ["no_barang", "sales_details"],
    "profit_loss": [
        "no_faktur", "no_barang", "no_so", "delivery_details", "delivery_ju_details",
        "cf_pct", "cf_details", "mf_pct", "mf_details", "biaya_project_details",
    ],
    "aset": ["no_aktiva"],
    "aset_bangunan": ["tanggal", "no_project", "nilai"],
    "project": ["project_id", "no_project", "nama_project"],
    "project_report": ["no_akun", "manual_account_key", "nama_akun", "is_total", "is_percentage", "show_rab_percentage", "show_realisasi_percentage"],
    "project_detail": ["tanggal", "no_project", "no_akun", "nilai"],
    "beban_gaji": ["tanggal", "nilai"],
    "beban_etoll": ["tanggal", "nilai"],
    "beban_transport": ["tanggal", "nilai"],
    "beban_utilitas": ["tanggal", "nilai"],
}

MODULE_PERMISSION_PARENTS = {
    "permintaan": "pembelian",
    "penerimaan": "pembelian",
    "fpb": "pembelian",
    "salesman": "penjualan",
    "customer": "penjualan",
    "customer_registration_documents": "penjualan",
    "waktu_pengiriman": "penjualan_do",
}

def filter_record_columns(module, rows, user=None):
    user = user or get_current_user()
    if user.get("role") == "admin":
        return rows
    allowed = get_user_column_permissions(user.get("role")).get(module)
    if not allowed:
        return rows
    allowed_set = set(allowed) | set(MODULE_REQUIRED_RESPONSE_KEYS.get(module, []))
    return [{key: value for key, value in row.items() if key in allowed_set} for row in rows]


def _get_purchase_sales_reference_map(cur, rows, so_no_index=19, itemno_index=6):
    keys = []
    seen = set()
    for row in rows:
        so_no = str(row[so_no_index] or "").strip()
        itemno = str(row[itemno_index] or "").strip()
        if not so_no or not itemno:
            continue
        if len(so_no) > 50:
            continue
        if len(itemno) > 50:
            continue
        key = (so_no.upper(), itemno)
        if key not in seen:
            seen.add(key)
            keys.append(key)

    if not keys:
        return {}

    so_conditions = []
    params = []
    for so_no, itemno in keys:
        so_conditions.append("UPPER(TRIM(so.SONO)) = CAST(? AS VARCHAR(255))")
        params.append(so_no)

    cur.execute(f"""
        SELECT
            so.SONO,
            det.ITEMNO,
            so.SODATE,
            so.ESTSHIPDATE,
            pd.NAME,
            so.PONO,
            COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''),
            COALESCE(det.ITEMOVDESC, i.ITEMDESCRIPTION),
            det.QUANTITY,
            det.QTYSHIPPED,
            (
                COALESCE((
                    SELECT SUM(h.QUANTITY)
                    FROM ITEMHIST h
                    JOIN WAREHS wh ON wh.WAREHOUSEID = h.WAREHOUSEID
                    WHERE h.ITEMNO = det.ITEMNO
                      AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
                ), 0)
                + COALESCE((
                    SELECT SUM(
                        CASE
                            WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                            WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                            ELSE 0
                        END
                    )
                    FROM WTRANDET wd
                    JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
                    JOIN WAREHS wh ON UPPER(TRIM(wh.NAME)) = 'CENTRE'
                    WHERE wd.ITEMNO = det.ITEMNO
                      AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
                ), 0)
            ),
            (
                COALESCE((
                    SELECT SUM(h.QUANTITY)
                    FROM ITEMHIST h
                    JOIN WAREHS wh ON wh.WAREHOUSEID = h.WAREHOUSEID
                    WHERE h.ITEMNO = det.ITEMNO
                      AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
                      AND (h.TXDATE IS NULL OR h.TXDATE <= CURRENT_DATE)
                ), 0)
                + COALESCE((
                    SELECT SUM(
                        CASE
                            WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                            WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                            ELSE 0
                        END
                    )
                    FROM WTRANDET wd
                    JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
                    JOIN WAREHS wh ON UPPER(TRIM(wh.NAME)) = 'CENTRE'
                    WHERE wd.ITEMNO = det.ITEMNO
                      AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
                      AND (wt.TRANSFERDATE IS NULL OR wt.TRANSFERDATE <= CURRENT_DATE)
                ), 0)
            ),
            det.ITEMUNIT,
            (SELECT LIST(DISTINCT delivery_docs.INVOICENO, ', ')
             FROM (
                SELECT ar_do.INVOICENO
                FROM ARINV ar_do
                JOIN ARINVDET ardet_do ON ardet_do.ARINVOICEID = ar_do.ARINVOICEID
                WHERE ar_do.DELIVERYORDER IS NOT NULL
                  AND TRIM(ar_do.DELIVERYORDER) <> ''
                  AND ardet_do.SOID = so.SOID
                  AND ardet_do.ITEMNO = det.ITEMNO
                UNION
                SELECT ar_temp.INVOICENO
                FROM ARINV_TEMP ar_temp
                JOIN ARINVDET_TEMP ardet_temp ON ardet_temp.ARINVOICEID_TEMP = ar_temp.ARINVOICEID_TEMP
                WHERE ardet_temp.SOID = so.SOID
                  AND ardet_temp.SOSEQ = det.SEQ
                  AND ardet_temp.ITEMNO = det.ITEMNO
             ) delivery_docs
            ),
            (SELECT MAX(delivery_dates.INVOICEDATE)
             FROM (
                SELECT ar_do.INVOICEDATE
                FROM ARINV ar_do
                JOIN ARINVDET ardet_do ON ardet_do.ARINVOICEID = ar_do.ARINVOICEID
                WHERE ar_do.DELIVERYORDER IS NOT NULL
                  AND TRIM(ar_do.DELIVERYORDER) <> ''
                  AND ardet_do.SOID = so.SOID
                  AND ardet_do.ITEMNO = det.ITEMNO
                UNION
                SELECT ar_temp.INVOICEDATE
                FROM ARINV_TEMP ar_temp
                JOIN ARINVDET_TEMP ardet_temp ON ardet_temp.ARINVOICEID_TEMP = ar_temp.ARINVOICEID_TEMP
                WHERE ardet_temp.SOID = so.SOID
                  AND ardet_temp.SOSEQ = det.SEQ
                  AND ardet_temp.ITEMNO = det.ITEMNO
             ) delivery_dates
            ),
            det.UNITPRICE
        FROM SO so
        LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
        LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
        JOIN SODET det ON det.SOID = so.SOID
        LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
        WHERE {' OR '.join(so_conditions)}
        ORDER BY so.SODATE DESC, so.SONO, det.SEQ
    """, params)

    refs = {}
    fallback_refs = {}
    requested_keys = set(keys)

    def build_ref(row):
        qty_order = float(row[8] or 0)
        qty_shipped = float(row[9] or 0)
        return {
            "tgl_so": str(row[2]) if row[2] else "",
            "est_kirim_so": str(row[3]) if row[3] else "",
            "nama_pelanggan_so": str(row[4] or "").strip(),
            "no_po_customer_so": str(row[5] or "").strip(),
            "salesman_so": str(row[6] or "").strip(),
            "no_barang_so": str(row[1] or "").strip(),
            "deskripsi_barang_so": str(row[7] or "").strip(),
            "qty_so": qty_order,
            "qty_order_so": qty_order,
            "qty_shipped_so": qty_shipped,
            "sisa_kirim_so": max(qty_order - qty_shipped, 0),
            "stok_tersedia_so": float(row[10] or 0),
            "stock_sistem_so": float(row[11] or 0),
            "uom_so": str(row[12] or "").strip(),
            "no_pengiriman_so": str(row[13] or "").strip(),
            "tgl_kirim_so": str(row[14]) if row[14] else "",
            "harga_satuan_penjualan": float(row[15] or 0),
        }

    for row in cur.fetchall():
        so_no = str(row[0] or "").strip().upper()
        itemno = str(row[1] or "").strip()
        key = (so_no, itemno)
        ref = build_ref(row)
        if so_no and so_no not in fallback_refs:
            fallback_refs[so_no] = ref
        if key in requested_keys and key not in refs:
            refs[key] = ref

    for key in keys:
        if key not in refs:
            fallback_ref = fallback_refs.get(key[0])
            if fallback_ref:
                refs[key] = fallback_ref
    return refs


def _append_unique_csv(existing, value):
    items = []
    seen = set()
    for raw in (existing, value):
        for item in str(raw or "").split(","):
            text = item.strip()
            if text and text.upper() not in seen:
                seen.add(text.upper())
                items.append(text)
    return ", ".join(items)


def _latest_date(existing, value):
    existing = str(existing or "").strip()
    value = str(value or "").strip()
    if not existing:
        return value
    if not value:
        return existing
    return max(existing, value)


def _merge_partial_purchase_rows(rows):
    merged = {}
    order = []
    for row in rows:
        key = (
            row.get("no_permintaan", ""),
            row.get("so_no", ""),
            row.get("no_barang", ""),
            row.get("tgl_target_permintaan", ""),
        )
        if key not in merged:
            merged[key] = dict(row)
            order.append(key)
            continue

        target = merged[key]
        for field in ("no_pembelian", "no_penerimaan_barang", "no_pemasok", "nama_pemasok"):
            target[field] = _append_unique_csv(target.get(field), row.get(field))
        for field in ("tgl_pembelian", "tgl_ekspetasi", "tgl_penerimaan_barang"):
            target[field] = _latest_date(target.get(field), row.get(field))
        target["qty"] = round(float(target.get("qty") or 0) + float(row.get("qty") or 0), 4)
        target["price"] = max(float(target.get("price") or 0), float(row.get("price") or 0))
        target["amount"] = round(float(target.get("amount") or 0) + float(row.get("amount") or 0), 2)
        target["diskon"] = round(float(target.get("diskon") or 0) + float(row.get("diskon") or 0), 2)
        target["dpp"] = round(float(target.get("dpp") or 0) + float(row.get("dpp") or 0), 2)
        target["ppn_amount"] = round(float(target.get("ppn_amount") or 0) + float(row.get("ppn_amount") or 0), 2)

    return [merged[key] for key in order]


def _safe_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _purchase_amounts(qty, price, line_disc_pc, order_subtotal, cash_discount, cash_disc_pc):
    gross_amount = _safe_float(qty) * _safe_float(price)
    line_discount = gross_amount * _safe_float(line_disc_pc) / 100
    amount_after_line_discount = max(gross_amount - line_discount, 0)
    order_subtotal = _safe_float(order_subtotal)
    cash_discount = _safe_float(cash_discount)
    cash_disc_pc = _safe_float(cash_disc_pc)
    header_discount = cash_discount if cash_discount else order_subtotal * cash_disc_pc / 100
    header_discount_amount = 0

    if order_subtotal > 0 and header_discount > 0 and amount_after_line_discount > 0:
        header_discount_amount = amount_after_line_discount * (header_discount / order_subtotal)

    discount_amount = min(line_discount + header_discount_amount, gross_amount)
    dpp_amount = max(gross_amount - discount_amount, 0)

    return {
        "amount": round(gross_amount, 2),
        "diskon": round(discount_amount, 2),
        "dpp": round(dpp_amount, 2),
    }

# ─── HELPER ──────────────────────────────────────────────────────────────────

def _get_purchase_payment_map(cur, po_refs, include_invoice_number_fallback=False):
    normalized_refs = []
    for poid, pono in po_refs:
        poid = int(poid or 0)
        pono = str(pono or "").strip()
        if poid:
            normalized_refs.append((poid, pono))
    normalized_poids = sorted({poid for poid, _ in normalized_refs})
    if not normalized_poids:
        return {}

    result = {poid: {
        "invoices": [],
        "pengajuan_bayar": 0.0,
        "dibayar_fat": 0.0,
        "sisa_hutang_fat": 0.0,
        "uang_muka": 0.0,
        "_seen": set(),
    } for poid in normalized_poids}

    pono_to_poids = {}
    for poid, pono in normalized_refs:
        normalized_pono = pono.upper()
        if normalized_pono:
            pono_to_poids.setdefault(normalized_pono, set()).add(poid)

    def add_payment(poid, row):
        poid = int(poid or 0)
        invoice_id = int(row[0] or 0)
        if not poid or not invoice_id:
            return
        entry = result.setdefault(poid, {
            "invoices": [],
            "pengajuan_bayar": 0.0,
            "dibayar_fat": 0.0,
            "sisa_hutang_fat": 0.0,
            "uang_muka": 0.0,
            "_seen": set(),
        })
        if invoice_id in entry["_seen"]:
            return
        entry["_seen"].add(invoice_id)
        invoice_no = str(row[1] or "").strip()
        if invoice_no:
            entry["invoices"].append(invoice_no)
        invoice_amount = _to_float(row[2])
        entry["pengajuan_bayar"] += invoice_amount
        entry["dibayar_fat"] += _to_float(row[3])
        entry["sisa_hutang_fat"] += _to_float(row[4])
        if int(row[5] or 0) == 1:
            entry["uang_muka"] += invoice_amount

    for index in range(0, len(normalized_poids), 900):
        chunk = normalized_poids[index:index + 900]
        placeholders = ", ".join(["?"] * len(chunk))
        cur.execute(f"""
            SELECT
                apdet_pay.POID,
                ai.APINVOICEID,
                ai.INVOICENO,
                ai.INVOICEAMOUNT,
                ai.PAIDAMOUNT,
                ai.OWING,
                ai.ISDP
            FROM APITMDET apdet_pay
            JOIN APINV ai ON ai.APINVOICEID = apdet_pay.APINVOICEID
            WHERE apdet_pay.POID IN ({placeholders})
        """, chunk)
        for row in cur.fetchall():
            add_payment(row[0], row[1:])

        cur.execute(f"""
            SELECT
                apdp_pay.POID,
                ai.APINVOICEID,
                ai.INVOICENO,
                ai.INVOICEAMOUNT,
                ai.PAIDAMOUNT,
                ai.OWING,
                ai.ISDP
            FROM APDPDET apdp_pay
            JOIN APINV ai ON ai.APINVOICEID = apdp_pay.DPID
            WHERE apdp_pay.POID IN ({placeholders})
        """, chunk)
        for row in cur.fetchall():
            add_payment(row[0], row[1:])

    if not include_invoice_number_fallback:
        for entry in result.values():
            entry.pop("_seen", None)
        return result

    normalized_ponos = sorted(pono_to_poids.keys())
    for index in range(0, len(normalized_ponos), 100):
        chunk = normalized_ponos[index:index + 100]
        placeholders = ", ".join(["?"] * len(chunk))
        cur.execute(f"""
            SELECT
                UPPER(TRIM(COALESCE(ai.PURCHASEORDERNO, ''))),
                ai.APINVOICEID,
                ai.INVOICENO,
                ai.INVOICEAMOUNT,
                ai.PAIDAMOUNT,
                ai.OWING,
                ai.ISDP
            FROM APINV ai
            WHERE UPPER(TRIM(COALESCE(ai.PURCHASEORDERNO, ''))) IN ({placeholders})
        """, chunk)
        for row in cur.fetchall():
            for poid in pono_to_poids.get(str(row[0] or "").strip().upper(), []):
                add_payment(poid, row[1:])

        cur.execute(f"""
            SELECT
                UPPER(TRIM(ai.INVOICENO)),
                ai.APINVOICEID,
                ai.INVOICENO,
                ai.INVOICEAMOUNT,
                ai.PAIDAMOUNT,
                ai.OWING,
                ai.ISDP
            FROM APINV ai
            WHERE ai.ISDP = 1
              AND UPPER(TRIM(ai.INVOICENO)) IN ({placeholders})
        """, chunk)
        for row in cur.fetchall():
            for poid in pono_to_poids.get(str(row[0] or "").strip().upper(), []):
                add_payment(poid, row[1:])

        starting_conditions = " OR ".join(["UPPER(TRIM(ai.INVOICENO)) STARTING WITH ?"] * len(chunk))
        cur.execute(f"""
            SELECT
                UPPER(TRIM(ai.INVOICENO)),
                ai.APINVOICEID,
                ai.INVOICENO,
                ai.INVOICEAMOUNT,
                ai.PAIDAMOUNT,
                ai.OWING,
                ai.ISDP
            FROM APINV ai
            WHERE ai.ISDP = 1
              AND ({starting_conditions})
        """, [f"{pono}-" for pono in chunk])
        for row in cur.fetchall():
            invoice_no = str(row[0] or "").strip().upper()
            for pono, poids in pono_to_poids.items():
                if invoice_no.startswith(f"{pono}-"):
                    for poid in poids:
                        add_payment(poid, row[1:])

    for entry in result.values():
        entry.pop("_seen", None)
    return result


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username", "")
    password = data.get("password", "")
    user = get_user(username)
    if not user or not verify_password(password, user["password"]):
        log_activity(
            username=username,
            action="login_failed",
            module="auth",
            description=f"Login gagal untuk username {username}",
            ip_address=get_request_ip(),
            user_agent=request.headers.get("User-Agent"),
        )
        return jsonify({"message": "Username atau password salah"}), 401
    permissions = get_user_permissions(user["role"])
    column_permissions = get_user_column_permissions(user["role"])
    additional_claims = {
        "id": user["id"], "name": user["name"],
        "role": user["role"], "permissions": permissions,
        "salesman_id": user.get("salesman_id"), "salesman_name": user.get("salesman_name", ""),
    }
    token = create_access_token(identity=user["username"], additional_claims=additional_claims)
    log_activity(
        username=user["username"],
        name=user["name"],
        role=user["role"],
        action="login",
        module="auth",
        description=f"{user['name']} login ke aplikasi",
        ip_address=get_request_ip(),
        user_agent=request.headers.get("User-Agent"),
    )
    return jsonify({
        "token": token,
        "user": {
            "id": user["id"], "username": user["username"],
            "name": user["name"], "role": user["role"],
            "salesman_id": user.get("salesman_id"), "salesman_name": user.get("salesman_name", ""),
            "permissions": permissions,
            "column_permissions": column_permissions,
        }
    })

@app.route("/api/me")
@jwt_required()
def me():
    username = get_jwt_identity()
    claims = get_jwt()
    role = claims.get("role")
    return jsonify({
        "username": username, "id": claims.get("id"),
        "name": claims.get("name"), "role": role,
        "salesman_id": claims.get("salesman_id"), "salesman_name": claims.get("salesman_name", ""),
        "permissions": get_user_permissions(role),
        "column_permissions": get_user_column_permissions(role),
    })

def get_current_user():
    username = get_jwt_identity()
    claims = get_jwt()
    role = claims.get("role")
    return {
        "username": username, "id": claims.get("id"),
        "name": claims.get("name"), "role": role,
        "salesman_id": claims.get("salesman_id"), "salesman_name": claims.get("salesman_name", ""),
        "permissions": get_user_permissions(role),
        "column_permissions": get_user_column_permissions(role),
    }

def check_permission(required_module):
    user = get_current_user()
    if user["role"] == "admin":
        return True
    if user["role"] == "marketing" and required_module in {"permintaan", "penerimaan", "fpb"}:
        return False
    permissions = user.get("permissions", [])
    parent_module = MODULE_PERMISSION_PARENTS.get(required_module)
    return required_module in permissions or (parent_module and parent_module in permissions)

def can_access_pembelian_request():
    user = get_current_user()
    if user["role"] == "admin":
        return True
    permissions = user.get("permissions", [])
    if "pembelian" in permissions:
        return True
    return (
        request.args.get("exclude_internal_so") in ("1", "true", "yes")
        and "kolaborasi" in permissions
    )

def build_liw_pur_mkt_rows(cur, search="", date_from="", date_to="", po_type="", offset=None, limit=None):
    conditions = ["UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP'"]
    params_where = []

    if search:
        cur.execute("""
            SELECT DISTINCT ardet_temp.SOID, ardet_temp.SOSEQ, ardet_temp.ITEMNO
            FROM ARINV_TEMP ar_temp
            JOIN ARINVDET_TEMP ardet_temp
              ON ardet_temp.ARINVOICEID_TEMP = ar_temp.ARINVOICEID_TEMP
            WHERE UPPER(TRIM(COALESCE(ar_temp.INVOICENO, ''))) STARTING WITH 'AI-TDO-'
              AND LOWER(ar_temp.INVOICENO) CONTAINING LOWER(?)
        """, [search])
        temp_search_keys = [
            (int(row[0]), int(row[1]), str(row[2] or "").strip())
            for row in cur.fetchall()
        ]
        search_parts = ["""(
            LOWER(so.SONO) CONTAINING LOWER(?)
            OR LOWER(pd.NAME) CONTAINING LOWER(?)
            OR LOWER(sodet.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(sodet.ITEMOVDESC, i.ITEMDESCRIPTION)) CONTAINING LOWER(?)
            OR LOWER(rq.REQNO) CONTAINING LOWER(?)
            OR LOWER(po.PONO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(delivery_docs.INVOICENO, '')) CONTAINING LOWER(?)
        )"""]
        params_where += [search, search, search, search, search, search, search]
        if temp_search_keys:
            temp_key_parts = []
            for soid, soseq, itemno in temp_search_keys:
                temp_key_parts.append("(so.SOID = ? AND sodet.SEQ = ? AND sodet.ITEMNO = ?)")
                params_where += [soid, soseq, itemno]
            search_parts.append("(" + " OR ".join(temp_key_parts) + ")")
        conditions.append("(" + " OR ".join(search_parts) + ")")

    if date_from:
        conditions.append("so.SODATE >= ?")
        params_where.append(date_from)
    if date_to:
        conditions.append("so.SODATE <= ?")
        params_where.append(date_to)

    po_type_prefixes = {
        "AI-S": "AI-S-",
        "AI-SRV": "AI-SRV",
        "AI-BM": "AI-BM",
        "AI-A": "AI-A",
    }
    if po_type in po_type_prefixes:
        conditions.append("UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH ?")
        params_where.append(po_type_prefixes[po_type])

    where_sql = " AND ".join(conditions)
    from_sql = """
        FROM SO so
        JOIN SODET sodet ON sodet.SOID = so.SOID
        LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
        LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
        LEFT JOIN ITEM i ON i.ITEMNO = sodet.ITEMNO
        LEFT JOIN REQUISITIONDET rd
          ON UPPER(TRIM(COALESCE(rd.ITEMRESERVED9, ''))) = UPPER(TRIM(so.SONO))
         AND rd.ITEMNO = sodet.ITEMNO
        LEFT JOIN REQUISITION rq ON rq.REQID = rd.REQID
        LEFT JOIN PODET podet ON podet.REQID = rd.REQID AND podet.REQSEQ = rd.SEQ
        LEFT JOIN PO po ON po.POID = podet.POID
        LEFT JOIN USERS u ON u.USERID = po.USERID
        LEFT JOIN PERSONDATA vendor ON vendor.ID = po.VENDORID
        LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
        LEFT JOIN (
            SELECT
                ardet.SOID,
                ardet.SOSEQ,
                ardet.ITEMNO,
                LIST(DISTINCT ar.INVOICENO, ', ') AS INVOICENO,
                MAX(ar.INVOICEDATE) AS INVOICEDATE
            FROM ARINV ar
            JOIN ARINVDET ardet ON ardet.ARINVOICEID = ar.ARINVOICEID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(ar.DELIVERYORDER) <> ''
            GROUP BY ardet.SOID, ardet.SOSEQ, ardet.ITEMNO
        ) delivery_docs
          ON delivery_docs.SOID = so.SOID
         AND delivery_docs.SOSEQ = sodet.SEQ
         AND delivery_docs.ITEMNO = sodet.ITEMNO
    """

    cur.execute(f"""
        SELECT COUNT(*)
        {from_sql}
        WHERE {where_sql}
    """, params_where)
    total_rows = int((cur.fetchone() or [0])[0] or 0)

    limit_sql = ""
    query_params = list(params_where)
    if limit is not None and offset is not None:
        limit_sql = "FIRST ? SKIP ?"
        query_params = [limit, offset] + query_params

    cur.execute(f"""
        SELECT {limit_sql}
            so.SONO,
            so.SODATE,
            so.ESTSHIPDATE,
            pd.NAME,
            so.PONO,
            COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''),
            sodet.ITEMNO,
            COALESCE(NULLIF(TRIM(sodet.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
            sodet.QUANTITY,
            sodet.QTYSHIPPED,
            (
                COALESCE((
                    SELECT SUM(h.QUANTITY)
                    FROM ITEMHIST h
                    JOIN WAREHS wh ON wh.WAREHOUSEID = h.WAREHOUSEID
                    WHERE h.ITEMNO = sodet.ITEMNO
                      AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
                ), 0)
                + COALESCE((
                    SELECT SUM(
                        CASE
                            WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                            WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                            ELSE 0
                        END
                    )
                    FROM WTRANDET wd
                    JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
                    JOIN WAREHS wh ON UPPER(TRIM(wh.NAME)) = 'CENTRE'
                    WHERE wd.ITEMNO = sodet.ITEMNO
                      AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
                ), 0)
            ),
            (
                COALESCE((
                    SELECT SUM(h.QUANTITY)
                    FROM ITEMHIST h
                    JOIN WAREHS wh ON wh.WAREHOUSEID = h.WAREHOUSEID
                    WHERE h.ITEMNO = sodet.ITEMNO
                      AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
                      AND (h.TXDATE IS NULL OR h.TXDATE <= CURRENT_DATE)
                ), 0)
                + COALESCE((
                    SELECT SUM(
                        CASE
                            WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                            WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                            ELSE 0
                        END
                    )
                    FROM WTRANDET wd
                    JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
                    JOIN WAREHS wh ON UPPER(TRIM(wh.NAME)) = 'CENTRE'
                    WHERE wd.ITEMNO = sodet.ITEMNO
                      AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
                      AND (wt.TRANSFERDATE IS NULL OR wt.TRANSFERDATE <= CURRENT_DATE)
                ), 0)
            ),
            sodet.ITEMUNIT,
            sodet.UNITPRICE,
            rq.REQNO,
            rq.REQDATE,
            rd.REQDATE,
            po.PONO,
            po.PODATE,
            po.EXPECTED,
            COALESCE(po.DESCRIPTION, rq.DESCRIPTION),
            COALESCE(rd.ITEMNO, podet.ITEMNO, sodet.ITEMNO),
            COALESCE(NULLIF(TRIM(rd.ITEMOVDESC), ''), NULLIF(TRIM(podet.ITEMOVDESC), ''), NULLIF(TRIM(sodet.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
            COALESCE(podet.QUANTITY, rd.QUANTITY, sodet.QUANTITY),
            COALESCE(podet.ITEMUNIT, rd.ITEMUNIT, sodet.ITEMUNIT),
            COALESCE(podet.UNITPRICE, 0),
            vendor.PERSONNO,
            vendor.NAME,
            podet.ITEMRESERVED6,
            (SELECT LIST(DISTINCT ai_recv.INVOICENO, ', ')
             FROM APINV ai_recv
             JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
             WHERE apdet_recv.POID = podet.POID
               AND apdet_recv.POSEQ = podet.SEQ
            ),
            (SELECT MAX(ai_recv.INVOICEDATE)
             FROM APINV ai_recv
             JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
             WHERE apdet_recv.POID = podet.POID
               AND apdet_recv.POSEQ = podet.SEQ
            ),
            delivery_docs.INVOICENO,
            delivery_docs.INVOICEDATE,
            tm.TERMNAME,
            tm.NETDAYS,
            so.SOID,
            sodet.SEQ
        {from_sql}
        WHERE {where_sql}
        ORDER BY so.SODATE DESC, so.SONO, sodet.SEQ, rq.REQNO, po.PONO
    """, query_params)

    data = []
    for row in cur.fetchall():
        qty_order = _to_float(row[8])
        qty_shipped = _to_float(row[9])
        data.append({
            "no_pembelian": str(row[17] or "").strip(),
            "tgl_pembelian": str(row[18]) if row[18] else "",
            "tgl_ekspetasi": str(row[19]) if row[19] else "",
            "top": str(row[33] or "").strip() if row[33] else (f"{int(row[34])} Hari" if row[34] is not None else ""),
            "no_permintaan": str(row[14] or "").strip(),
            "tgl_permintaan": str(row[15]) if row[15] else "",
            "tgl_target_permintaan": str(row[16]) if row[16] else "",
            "so_no": str(row[0] or "").strip(),
            "tgl_so": str(row[1]) if row[1] else "",
            "est_kirim_so": str(row[2]) if row[2] else "",
            "nama_pelanggan_so": str(row[3] or "").strip(),
            "no_po_customer_so": str(row[4] or "").strip(),
            "salesman_so": str(row[5] or "").strip(),
            "no_barang_so": str(row[6] or "").strip(),
            "deskripsi_barang_so": str(row[7] or "").strip(),
            "qty_so": qty_order,
            "qty_order_so": qty_order,
            "qty_shipped_so": qty_shipped,
            "sisa_kirim_so": max(qty_order - qty_shipped, 0),
            "stok_tersedia_so": _to_float(row[10]),
            "stock_sistem_so": _to_float(row[11]),
            "uom_so": str(row[12] or "").strip(),
            "harga_satuan_penjualan": _to_float(row[13]),
            "no_penerimaan_barang": str(row[29] or "").strip(),
            "tgl_penerimaan_barang": str(row[30]) if row[30] else "",
            "no_pengiriman_so": str(row[31] or "").strip(),
            "tgl_kirim_so": str(row[32]) if row[32] else "",
            "no_pemasok": str(row[26] or "").strip(),
            "nama_pemasok": str(row[27] or "").strip(),
            "purchaser": str(row[28] or "").strip(),
            "deskripsi": str(row[20] or "").strip(),
            "no_barang": str(row[21] or "").strip(),
            "deskripsi_barang": str(row[22] or "").strip(),
            "qty": _to_float(row[23]),
            "uom": str(row[24] or "").strip(),
            "price": _to_float(row[25]),
            "disc_pct": 0,
            "diskon": 0,
            "ppn_kode": "",
            "ppn_rate": 0,
            "ppn_amount": 0,
            "pph": 0,
            "add_cost": 0,
            "dpp": 0,
            "amount": 0,
            "nilai_po": 0,
            "uang_muka": 0,
            "sisa_po": 0,
            "status_pembayaran": "Belum DP",
            "no_faktur_pengajuan": "",
            "pengajuan_bayar": 0,
            "dibayar_fat": 0,
            "sisa_hutang_fat": 0,
            "status_fat": "Belum Diajukan",
            "total_easy": 0,
            "_soid": int(row[35]),
            "_soseq": int(row[36]),
        })

    temp_delivery_map = {}
    soids = sorted({row["_soid"] for row in data})
    for chunk_start in range(0, len(soids), 200):
        soid_chunk = soids[chunk_start:chunk_start + 200]
        placeholders = ", ".join("?" for _ in soid_chunk)
        cur.execute(f"""
            SELECT
                ardet_temp.SOID,
                ardet_temp.SOSEQ,
                ardet_temp.ITEMNO,
                ar_temp.INVOICENO,
                ar_temp.INVOICEDATE
            FROM ARINV_TEMP ar_temp
            JOIN ARINVDET_TEMP ardet_temp
              ON ardet_temp.ARINVOICEID_TEMP = ar_temp.ARINVOICEID_TEMP
            WHERE ardet_temp.SOID IN ({placeholders})
              AND UPPER(TRIM(COALESCE(ar_temp.INVOICENO, ''))) STARTING WITH 'AI-TDO-'
            ORDER BY ar_temp.INVOICEDATE, ar_temp.INVOICENO
        """, soid_chunk)
        for temp_row in cur.fetchall():
            key = (
                int(temp_row[0]),
                int(temp_row[1]),
                str(temp_row[2] or "").strip(),
            )
            entry = temp_delivery_map.setdefault(key, {"numbers": [], "date": ""})
            invoice_no = str(temp_row[3] or "").strip()
            if invoice_no and invoice_no not in entry["numbers"]:
                entry["numbers"].append(invoice_no)
            if temp_row[4]:
                entry["date"] = str(temp_row[4])

    for row in data:
        if not row["no_pengiriman_so"]:
            temp_delivery = temp_delivery_map.get(
                (row["_soid"], row["_soseq"], row["no_barang_so"])
            )
            if temp_delivery:
                row["no_pengiriman_so"] = ", ".join(temp_delivery["numbers"])
                row["tgl_kirim_so"] = temp_delivery["date"]
        row.pop("_soid", None)
        row.pop("_soseq", None)

    note_keys = [
        (
            row.get("no_permintaan", ""),
            row.get("so_no", ""),
            row.get("no_pembelian", ""),
            row.get("no_barang", ""),
        )
        for row in data
    ]
    note_map = get_liw_purchase_notes(note_keys)
    for row in data:
        key = (
            row.get("no_permintaan", ""),
            row.get("so_no", ""),
            row.get("no_pembelian", ""),
            row.get("no_barang", ""),
        )
        notes = note_map.get(key, {})
        row["note_pesanan"] = notes.get("note_pesanan", "") if isinstance(notes, dict) else ""
        row["note_pengiriman"] = notes.get("note_pengiriman", "") if isinstance(notes, dict) else ""

    return data, total_rows

def get_request_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr

def audit_current_user(action, module=None, description=None, metadata=None):
    user = get_current_user()
    log_activity(
        username=user.get("username"),
        name=user.get("name"),
        role=user.get("role"),
        action=action,
        module=module,
        description=description,
        metadata=metadata,
        ip_address=get_request_ip(),
        user_agent=request.headers.get("User-Agent"),
    )


def sql_number_expr(field, width=64):
    raw_value = f"NULLIF(TRIM(CAST({field} AS VARCHAR({width}))), '')"
    return f"""
        CASE
            WHEN {raw_value} IS NULL OR {raw_value} CONTAINING '#'
                THEN NULL
            ELSE CAST({raw_value} AS DOUBLE PRECISION)
        END
    """


@app.route("/api/health")
def api_health():
    return jsonify({
        "status": "ok",
        "service": "easy-dashboard-backend",
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })


# ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

@app.route("/api/users", methods=["GET"])
@jwt_required()
def list_users():
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    return jsonify(get_all_users())

@app.route("/api/users", methods=["POST"])
@jwt_required()
def add_user():
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    data = request.get_json()
    ok, msg = create_user(
        data.get("username"), data.get("password"), data.get("name"), data.get("role"),
        data.get("salesman_id"), data.get("salesman_name", ""),
    )
    if ok:
        audit_current_user(
            "create_user",
            "users",
            f"Menambahkan user {data.get('username')} ({data.get('name')})",
            {"target_username": data.get("username"), "target_name": data.get("name"), "target_role": data.get("role")},
        )
    return jsonify({"message": msg}), 200 if ok else 400


@app.route("/api/users/<int:user_id>/salesman", methods=["PUT"])
@jwt_required()
def change_user_salesman(user_id):
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    data = request.get_json(silent=True) or {}
    salesman_id = data.get("salesman_id")
    salesman_name = str(data.get("salesman_name") or "").strip()
    if salesman_id in (None, ""):
        salesman_id = None
        salesman_name = ""
    else:
        try:
            salesman_id = int(salesman_id)
        except (TypeError, ValueError):
            return jsonify({"message": "Salesman tidak valid"}), 400
    if not update_user_salesman(user_id, salesman_id, salesman_name):
        return jsonify({"message": "User tidak ditemukan"}), 404
    audit_current_user(
        "assign_user_salesman", "users", f"Menghubungkan user {user_id} ke salesman {salesman_name}",
        {"target_user_id": user_id, "salesman_id": salesman_id, "salesman_name": salesman_name},
    )
    return jsonify({"message": "Salesman user berhasil disimpan"})

@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@jwt_required()
def remove_user(user_id):
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    target_user = get_user_by_id(user_id)
    deleted = delete_user(user_id)
    if target_user and deleted:
        audit_current_user(
            "delete_user",
            "users",
            f"Menghapus user {target_user.get('username')} ({target_user.get('name')})",
            {"target_user_id": user_id, "target_username": target_user.get("username"), "target_role": target_user.get("role")},
        )
    if not deleted:
        return jsonify({"message": "User tidak dapat dihapus"}), 400
    return jsonify({"message": "User dihapus"})

@app.route("/api/users/<int:user_id>/password", methods=["PUT"])
@jwt_required()
def change_user_password(user_id):
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    data = request.get_json() or {}
    password = data.get("password", "")
    target_user = get_user_by_id(user_id)
    ok, msg = update_user_password(user_id, password)
    if ok and target_user:
        audit_current_user(
            "change_password",
            "users",
            f"Mengganti password user {target_user.get('username')} ({target_user.get('name')})",
            {"target_user_id": user_id, "target_username": target_user.get("username"), "target_role": target_user.get("role")},
        )
    return jsonify({"message": msg}), 200 if ok else 400

@app.route("/api/audit/event", methods=["POST"])
@jwt_required()
def audit_event():
    data = request.get_json() or {}
    audit_current_user(
        data.get("action", "activity"),
        data.get("module"),
        data.get("description"),
        data.get("metadata"),
    )
    return jsonify({"message": "Aktivitas dicatat"})

@app.route("/api/audit-logs")
@jwt_required()
def api_audit_logs():
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    result = get_audit_logs(
        search=request.args.get("search", ""),
        action=request.args.get("action", ""),
        module=request.args.get("module", ""),
        date_from=request.args.get("date_from") or None,
        date_to=request.args.get("date_to") or None,
        limit=int(request.args.get("limit", 100)),
        offset=int(request.args.get("offset", 0)),
    )
    return jsonify(result)

@app.route("/api/roles", methods=["GET"])
@jwt_required()
def list_roles():
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    from auth import get_all_roles
    return jsonify(get_all_roles())

@app.route("/api/column-permissions", methods=["GET"])
@jwt_required()
def list_column_permissions():
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    return jsonify({
        "available": MODULE_COLUMNS,
        "parents": MODULE_COLUMN_PARENTS,
        "permissions": get_all_column_permissions(),
    })

@app.route("/api/roles", methods=["POST"])
@jwt_required()
def save_role():
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403

    data = request.get_json() or {}
    role = data.get("role", "")
    modules = data.get("modules", [])
    column_permissions = data.get("column_permissions", None)
    ok, msg = upsert_role(role, modules, column_permissions)
    if ok:
        audit_current_user(
            "save_role",
            "users",
            f"Menyimpan role {role}",
            {"target_role": role, "modules": modules, "column_permissions": column_permissions},
        )
    return jsonify({"message": msg}), 200 if ok else 400

@app.route("/api/roles/<role>", methods=["DELETE"])
@jwt_required()
def remove_role(role):
    identity = get_current_user()
    if identity["role"] != "admin":
        return jsonify({"message": "Akses ditolak"}), 403

    ok, msg = delete_role(role)
    if ok:
        audit_current_user(
            "delete_role",
            "users",
            f"Menghapus role {role}",
            {"target_role": role},
        )
    return jsonify({"message": msg}), 200 if ok else 400


# ─── STOCK ───────────────────────────────────────────────────────────────────

def _split_filter_values(value):
    if not value:
        return []
    return [item for item in str(value).split("||") if item]


def _first_filter_text(filters, key):
    values = filters.get(key) or []
    return str(values[0] or "").strip() if values else ""


STOCK_CODE_PRODUCT_CANDIDATES = (
    "ITEMRESERVED1", "RESERVED1", "USERFIELD1", "CUSTOMFIELD1",
    "CODEPRODUCT", "CODE_PRODUCT",
)


def _split_code_product_tokens(value):
    tokens = []
    seen = set()
    for token in str(value or "").replace(";", ",").split(","):
        clean = token.strip().upper()
        if clean and clean not in seen:
            seen.add(clean)
            tokens.append(clean)
    return tokens


def _stock_code_product_expr(cur):
    columns = set(_get_table_columns(cur, "ITEM"))
    column = _match_column(columns, STOCK_CODE_PRODUCT_CANDIDATES)
    return f"i.{column}" if column else "CAST('' AS VARCHAR(255))"


def _centre_stock_expr(item_expr="i.ITEMNO", through_today=False):
    item_expr = item_expr or "i.ITEMNO"
    itemhist_date_clause = " AND (h.TXDATE IS NULL OR h.TXDATE <= CURRENT_DATE)" if through_today else ""
    transfer_date_clause = " AND (wt.TRANSFERDATE IS NULL OR wt.TRANSFERDATE <= CURRENT_DATE)" if through_today else ""
    return f"""
        (
            COALESCE((
                SELECT SUM(h.QUANTITY)
                FROM ITEMHIST h
                JOIN WAREHS wh ON wh.WAREHOUSEID = h.WAREHOUSEID
                WHERE h.ITEMNO = {item_expr}
                  AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
                  {itemhist_date_clause}
            ), 0)
            + COALESCE((
                SELECT SUM(
                    CASE
                        WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                        WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                        ELSE 0
                    END
                )
                FROM WTRANDET wd
                JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
                JOIN WAREHS wh ON UPPER(TRIM(wh.NAME)) = 'CENTRE'
                WHERE wd.ITEMNO = {item_expr}
                  AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
                  {transfer_date_clause}
            ), 0)
        )
    """


def _easy_stock_expr(item_expr="i.ITEMNO", through_today=False):
    """Return Easy Accounting's total item balance across all warehouses.

    SALDO_WHS is Easy's authoritative per-warehouse balance. It can already
    include posted transactions with a future transaction date, so the
    through-today variant reverses those future ITEMHIST movements.
    Warehouse transfers do not need a separate adjustment here because their
    net effect across all warehouses is zero.
    """
    item_expr = item_expr or "i.ITEMNO"
    saldo_expr = f"""
        COALESCE((
            SELECT SUM(sw.QTY)
            FROM SALDO_WHS sw
            WHERE sw.ITEMNO = {item_expr}
        ), 0)
    """
    if not through_today:
        return f"({saldo_expr})"
    return f"""
        (
            {saldo_expr}
            - COALESCE((
                SELECT SUM(h.QUANTITY)
                FROM ITEMHIST h
                WHERE h.ITEMNO = {item_expr}
                  AND h.TXDATE > CURRENT_DATE
            ), 0)
        )
    """


def _centre_saldo_expr(item_expr="i.ITEMNO", through_today=False):
    """Return the authoritative SALDO_WHS balance for warehouse CENTRE."""
    item_expr = item_expr or "i.ITEMNO"
    saldo_expr = f"""
        COALESCE((
            SELECT SUM(sw.QTY)
            FROM SALDO_WHS sw
            JOIN WAREHS wh ON wh.WAREHOUSEID = sw.WAREHOUSEID
            WHERE sw.ITEMNO = {item_expr}
              AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
        ), 0)
    """
    if not through_today:
        return f"({saldo_expr})"
    return f"""
        (
            {saldo_expr}
            - COALESCE((
                SELECT SUM(h.QUANTITY)
                FROM ITEMHIST h
                JOIN WAREHS wh ON wh.WAREHOUSEID = h.WAREHOUSEID
                WHERE h.ITEMNO = {item_expr}
                  AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
                  AND h.TXDATE > CURRENT_DATE
            ), 0)
            - COALESCE((
                SELECT SUM(
                    CASE
                        WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                        WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                        ELSE 0
                    END
                )
                FROM WTRANDET wd
                JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
                JOIN WAREHS wh ON UPPER(TRIM(wh.NAME)) = 'CENTRE'
                WHERE wd.ITEMNO = {item_expr}
                  AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
                  AND wt.TRANSFERDATE > CURRENT_DATE
            ), 0)
        )
    """


def _stock_warehouse_rows(cur, item_no):
    normalized_item_no = str(item_no or "").strip()
    if not normalized_item_no:
        return []
    cur.execute("""
        SELECT FIRST 1
            i.ITEMNO,
            i.ITEMDESCRIPTION,
            i.ITEMDESCRIPTION2,
            i.UNIT1
        FROM ITEM i
        WHERE UPPER(TRIM(i.ITEMNO)) = UPPER(TRIM(?))
    """, [normalized_item_no])
    item = cur.fetchone()
    if not item:
        return []

    cur.execute("""
        SELECT
            wh.WAREHOUSEID,
            wh.NAME,
            COALESCE((
                SELECT SUM(sw.QTY)
                FROM SALDO_WHS sw
                WHERE sw.WAREHOUSEID = wh.WAREHOUSEID
                  AND UPPER(TRIM(sw.ITEMNO)) = UPPER(TRIM(?))
            ), 0)
            - COALESCE((
                SELECT SUM(h.QUANTITY)
                FROM ITEMHIST h
                WHERE h.WAREHOUSEID = wh.WAREHOUSEID
                  AND UPPER(TRIM(h.ITEMNO)) = UPPER(TRIM(?))
                  AND h.TXDATE > CURRENT_DATE
            ), 0)
            - COALESCE((
                SELECT SUM(
                    CASE
                        WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                        WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                        ELSE 0
                    END
                )
                FROM WTRANDET wd
                JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
                WHERE UPPER(TRIM(wd.ITEMNO)) = UPPER(TRIM(?))
                  AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
                  AND wt.TRANSFERDATE > CURRENT_DATE
            ), 0) AS QTY
        FROM WAREHS wh
        WHERE wh.WAREHOUSEID IS NOT NULL
        ORDER BY
            CASE WHEN UPPER(TRIM(wh.NAME)) = 'CENTRE' THEN 0 ELSE 1 END,
            wh.NAME
    """, [normalized_item_no, normalized_item_no, normalized_item_no])
    warehouses = [
        {
            "warehouse_id": int(row[0] or 0),
            "warehouse_name": str(row[1] or "").strip(),
            "quantity": round(_to_float(row[2]), 4),
        }
        for row in cur.fetchall()
    ]
    total_quantity = round(sum(row["quantity"] for row in warehouses), 4)
    nonzero_warehouses = [row for row in warehouses if abs(row["quantity"]) > 0.000001]
    return {
        "itemno": str(item[0] or "").strip(),
        "description": str(item[1] or "").strip(),
        "description2": str(item[2] or "").strip(),
        "unit": str(item[3] or "").strip(),
        "total_quantity": total_quantity,
        "warehouses": warehouses,
        "nonzero_warehouses": nonzero_warehouses,
    }


def _stock_code_product_filter_clause(filters, code_product_expr):
    code_values = (filters or {}).get("code_product") or []
    code_tokens = []
    for value in code_values:
        if value == "__EMPTY__":
            continue
        code_tokens.extend(_split_code_product_tokens(value))

    conditions = []
    params = []
    if code_tokens:
        normalized_expr = f"(',' || REPLACE(UPPER(COALESCE({code_product_expr}, '')), ' ', '') || ',')"
        token_conditions = []
        for token in code_tokens:
            token_conditions.append(f"{normalized_expr} CONTAINING ?")
            params.append(f",{token.replace(' ', '')},")
        conditions.append(f"({' OR '.join(token_conditions)})")
    if "__EMPTY__" in code_values:
        conditions.append(f"COALESCE(TRIM({code_product_expr}), '') = ''")

    return conditions, params


def _stock_where_clause(search="", filters=None, code_product_expr="CAST('' AS VARCHAR(255))"):
    filters = filters or {}
    conditions = []
    if not search:
        conditions.extend([
            "COALESCE(i.ITEMTYPE, 0) = 0",
            "COALESCE(i.SUSPENDED, 0) = 0",
            "COALESCE(UPPER(TRIM(c.NAME)), '') NOT IN ('CF', 'MF')",
        ])
    else:
        conditions.append("i.ITEMNO IS NOT NULL")
    params = []
    stock_qty_expr = _easy_stock_expr("i.ITEMNO")
    stock_centre_expr = _centre_saldo_expr("i.ITEMNO", through_today=True)

    if search:
        search_parts = [f"""(
            LOWER(i.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
            OR LOWER(i.ITEMDESCRIPTION2) CONTAINING LOWER(?)
            OR LOWER({code_product_expr}) CONTAINING LOWER(?)
            OR LOWER(i.UNIT1) CONTAINING LOWER(?)
            OR LOWER(COALESCE(c.NAME, '')) CONTAINING LOWER(?)
            OR CAST(COALESCE(i.MINIMUMQTY, 0) AS VARCHAR(50)) CONTAINING ?
            OR CAST({stock_qty_expr} AS VARCHAR(50)) CONTAINING ?
            OR (? CONTAINING 'stok' AND COALESCE(i.MINIMUMQTY, 0) > 0 AND {stock_centre_expr} < COALESCE(i.MINIMUMQTY, 0))
            OR (? CONTAINING 'fifo' AND NOT EXISTS (
                SELECT 1
                FROM STANDARBIAYABRGDET sd
                WHERE sd.ITEMNO = i.ITEMNO
                  AND COALESCE(sd.NEWCOST, 0) > 0
            ) AND EXISTS (
                SELECT 1
                FROM ITEMHIST ih
                WHERE ih.ITEMNO = i.ITEMNO
                  AND COALESCE(ih.COST, 0) > 0
            ))
            OR (? CONTAINING 'standarisasi' AND EXISTS (
                SELECT 1
                FROM STANDARBIAYABRGDET sd
                WHERE sd.ITEMNO = i.ITEMNO
                  AND COALESCE(sd.NEWCOST, 0) > 0
            ))
            OR EXISTS (
                SELECT 1
                FROM STANDARBIAYABRGDET sd
                WHERE sd.ITEMNO = i.ITEMNO
                  AND COALESCE(sd.NEWCOST, 0) > 0
                  AND LOWER(sd.NOSTANDARBRG) CONTAINING LOWER(?)
            )
        )"""]
        params.extend([search, search, search, search, search, search, search, search, search.lower(), search.lower(), search.lower(), search])

        search_tokens = [
            token for token in "".join(ch if ch.isalnum() else " " for ch in str(search)).split()
            if len(token) >= 2
        ]
        if len(search_tokens) >= 2:
            token_fields = " || ' ' || ".join([
                "COALESCE(i.ITEMNO, '')",
                "COALESCE(i.ITEMDESCRIPTION, '')",
                "COALESCE(i.ITEMDESCRIPTION2, '')",
                f"COALESCE({code_product_expr}, '')",
            ])
            token_conditions = []
            for token in search_tokens:
                token_conditions.append(f"LOWER({token_fields}) CONTAINING LOWER(?)")
                params.append(token)
            search_parts.append(f"({' AND '.join(token_conditions)})")
        conditions.append(f"({' OR '.join(search_parts)})")

    text_filter_map = {
        "itemno": "i.ITEMNO",
        "description": "i.ITEMDESCRIPTION",
        "description2": "i.ITEMDESCRIPTION2",
        "code_product": code_product_expr,
        "unit": "i.UNIT1",
    }
    for filter_key, column_expr in text_filter_map.items():
        if filter_key == "code_product":
            continue
        filter_text = _first_filter_text(filters, filter_key)
        if filter_text:
            conditions.append(f"LOWER({column_expr}) CONTAINING LOWER(?)")
            params.append(filter_text)

    code_conditions, code_params = _stock_code_product_filter_clause(filters, code_product_expr)
    conditions.extend(code_conditions)
    params.extend(code_params)

    quantity_text = _first_filter_text(filters, "quantity")
    if quantity_text:
        conditions.append(f"CAST({stock_qty_expr} AS VARCHAR(50)) CONTAINING ?")
        params.append(quantity_text)

    minimum_values = filters.get("minimum_qty") or []
    if minimum_values:
        parsed_minimum_values = []
        for value in minimum_values:
            try:
                parsed_minimum_values.append(float(value))
            except (TypeError, ValueError):
                pass
        if parsed_minimum_values:
            conditions.append(f"COALESCE(i.MINIMUMQTY, 0) IN ({_build_in_clause(parsed_minimum_values)})")
            params.extend(parsed_minimum_values)

    note_values = filters.get("stock_note") or []
    if note_values:
        note_conditions = []
        if "Stok di bawah minimum" in note_values:
            note_conditions.append(f"(COALESCE(i.MINIMUMQTY, 0) > 0 AND {stock_centre_expr} < COALESCE(i.MINIMUMQTY, 0))")
        if "__EMPTY__" in note_values:
            note_conditions.append(f"NOT (COALESCE(i.MINIMUMQTY, 0) > 0 AND {stock_centre_expr} < COALESCE(i.MINIMUMQTY, 0))")
        if note_conditions:
            conditions.append(f"({' OR '.join(note_conditions)})")

    category_values = filters.get("category") or []
    if category_values:
        category_conditions = []
        normal_categories = [value for value in category_values if value != "__EMPTY__"]
        if normal_categories:
            category_conditions.append(f"COALESCE(c.NAME, '') IN ({_build_in_clause(normal_categories)})")
            params.extend(normal_categories)
        if "__EMPTY__" in category_values:
            category_conditions.append("COALESCE(c.NAME, '') = ''")
        if category_conditions:
            conditions.append(f"({' OR '.join(category_conditions)})")

    cost_values = filters.get("cost_description") or []
    if cost_values:
        cost_conditions = []
        stb_values = []
        for value in cost_values:
            if value == "HPP Metode FIFO":
                cost_conditions.append("""
                    NOT EXISTS (
                        SELECT 1
                        FROM STANDARBIAYABRGDET sd
                        WHERE sd.ITEMNO = i.ITEMNO
                          AND COALESCE(sd.NEWCOST, 0) > 0
                    )
                    AND EXISTS (
                        SELECT 1
                        FROM ITEMHIST ih
                        WHERE ih.ITEMNO = i.ITEMNO
                          AND COALESCE(ih.COST, 0) > 0
                    )
                """)
            elif value == "__EMPTY__":
                cost_conditions.append("""
                    NOT EXISTS (
                        SELECT 1
                        FROM STANDARBIAYABRGDET sd
                        WHERE sd.ITEMNO = i.ITEMNO
                          AND COALESCE(sd.NEWCOST, 0) > 0
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM ITEMHIST ih
                        WHERE ih.ITEMNO = i.ITEMNO
                          AND COALESCE(ih.COST, 0) > 0
                    )
                """)
            elif value.startswith("Standarisasi No :"):
                stb_values.append(value.replace("Standarisasi No :", "", 1).strip())
            else:
                lowered_value = str(value or "").strip().lower()
                if lowered_value:
                    if lowered_value in "hpp metode fifo":
                        cost_conditions.append("""
                            NOT EXISTS (
                                SELECT 1
                                FROM STANDARBIAYABRGDET sd
                                WHERE sd.ITEMNO = i.ITEMNO
                                  AND COALESCE(sd.NEWCOST, 0) > 0
                            )
                            AND EXISTS (
                                SELECT 1
                                FROM ITEMHIST ih
                                WHERE ih.ITEMNO = i.ITEMNO
                                  AND COALESCE(ih.COST, 0) > 0
                            )
                        """)
                    if lowered_value in "standarisasi no :" or lowered_value in "stb":
                        cost_conditions.append("""
                            EXISTS (
                                SELECT 1
                                FROM STANDARBIAYABRGDET sd
                                WHERE sd.ITEMNO = i.ITEMNO
                                  AND COALESCE(sd.NEWCOST, 0) > 0
                            )
                        """)
                    cost_conditions.append("""
                        EXISTS (
                            SELECT 1
                            FROM STANDARBIAYABRGDET sd
                            WHERE sd.ITEMNO = i.ITEMNO
                              AND COALESCE(sd.NEWCOST, 0) > 0
                              AND LOWER(sd.NOSTANDARBRG) CONTAINING LOWER(?)
                        )
                    """)
                    params.append(value)
        if stb_values:
            cost_conditions.append(f"""
                EXISTS (
                    SELECT 1
                    FROM STANDARBIAYABRGDET sd
                    WHERE sd.ITEMNO = i.ITEMNO
                      AND COALESCE(sd.NEWCOST, 0) > 0
                      AND sd.NOSTANDARBRG IN ({_build_in_clause(stb_values)})
                )
            """)
            params.extend(stb_values)
        if cost_conditions:
            conditions.append(f"({' OR '.join(cost_conditions)})")

    return " AND ".join(conditions), params


def _stock_order_clause(sort_field="", sort_order="", code_product_expr="CAST('' AS VARCHAR(255))"):
    direction = "DESC" if sort_order == "descend" else "ASC"
    stock_qty_expr = _easy_stock_expr("i.ITEMNO")
    stock_system_expr = _easy_stock_expr("i.ITEMNO", through_today=True)
    stock_centre_expr = _centre_saldo_expr("i.ITEMNO", through_today=True)
    stock_note_expr = f"CASE WHEN COALESCE(i.MINIMUMQTY, 0) > 0 AND {stock_centre_expr} < COALESCE(i.MINIMUMQTY, 0) THEN 0 ELSE 1 END"
    cost_description_expr = """
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM STANDARBIAYABRGDET sd
                WHERE sd.ITEMNO = i.ITEMNO
                  AND COALESCE(sd.NEWCOST, 0) > 0
            ) THEN 0
            WHEN EXISTS (
                SELECT 1
                FROM ITEMHIST ih
                WHERE ih.ITEMNO = i.ITEMNO
                  AND COALESCE(ih.COST, 0) > 0
            ) THEN 1
            ELSE 2
        END
    """
    order_map = {
        "itemno": "i.ITEMNO",
        "description": "i.ITEMDESCRIPTION",
        "description2": "i.ITEMDESCRIPTION2",
        "quantity": stock_qty_expr,
        "stock_sistem": stock_system_expr,
        "stock_centre": stock_centre_expr,
        "minimum_qty": "COALESCE(i.MINIMUMQTY, 0)",
        "stock_note": stock_note_expr,
        "cost_description": cost_description_expr,
        "code_product": code_product_expr,
        "unit": "i.UNIT1",
        "category": "c.NAME",
    }
    if sort_field not in order_map:
        return "i.ITEMNO"
    return f"{order_map[sort_field]} {direction}, i.ITEMNO ASC"


def _stock_rows_to_records(rows, cost_description_by_item=None):
    cost_description_by_item = cost_description_by_item or {}
    data = []
    for r in rows:
        item_no = str(r[0] or "").strip()
        minimum_qty = float(r[6] or 0)
        quantity = float(r[7] or 0)
        stock_sistem = float(r[8] or 0)
        stock_centre = float(r[9] or 0)
        stock_below_minimum = minimum_qty > 0 and stock_centre < minimum_qty
        data.append({
            "itemno": item_no,
            "description": str(r[1] or "").strip(),
            "description2": str(r[2] or "").strip(),
            "unit": str(r[3] or "").strip(),
            "type": str(r[4] or "").strip(),
            "category": str(r[5] or "").strip(),
            "minimum_qty": minimum_qty,
            "quantity": quantity,
            "stock_sistem": stock_sistem,
            "stock_centre": stock_centre,
            "cost_description": cost_description_by_item.get(item_no, ""),
            "stock_note": "Stok di bawah minimum" if stock_below_minimum else "",
            "code_product": str(r[10] or "").strip(),
        })
    return data


def _get_stock_search_fallback(cur, search, limit, offset, code_product_expr, filters=None):
    search = str(search or "").strip()
    if not search:
        return [], 0
    cur.execute("""
        SELECT FIRST 1 1
        FROM ITEM i
        WHERE COALESCE(i.SUSPENDED, 0) = 0
          AND UPPER(TRIM(i.ITEMNO)) = UPPER(TRIM(?))
    """, [search])
    has_exact_itemno = cur.fetchone() is not None

    token_values = [
        token for token in "".join(ch if ch.isalnum() else " " for ch in search).split()
        if len(token) >= 2
    ]
    token_condition = ""
    token_params = []
    if token_values:
        token_fields = " || ' ' || ".join([
            "COALESCE(i.ITEMNO, '')",
            "COALESCE(i.ITEMDESCRIPTION, '')",
            "COALESCE(i.ITEMDESCRIPTION2, '')",
            f"COALESCE({code_product_expr}, '')",
        ])
        token_condition = " OR (" + " AND ".join([f"LOWER({token_fields}) CONTAINING LOWER(?)" for _ in token_values]) + ")"
        token_params = token_values

    code_filter_conditions, code_filter_params = _stock_code_product_filter_clause(filters, code_product_expr)
    extra_conditions = ""
    if code_filter_conditions:
        extra_conditions = " AND " + " AND ".join(code_filter_conditions)

    if has_exact_itemno:
        where_sql = f"""
            COALESCE(i.SUSPENDED, 0) = 0
            {extra_conditions}
            AND UPPER(TRIM(i.ITEMNO)) = UPPER(TRIM(?))
        """
        params = code_filter_params + [search]
    else:
        where_sql = f"""
            i.ITEMNO IS NOT NULL
            AND COALESCE(i.SUSPENDED, 0) = 0
            {extra_conditions}
            AND (
                LOWER(i.ITEMNO) CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION2) CONTAINING LOWER(?)
                OR LOWER({code_product_expr}) CONTAINING LOWER(?)
                {token_condition}
            )
        """
        params = code_filter_params + [search, search, search, search] + token_params
    stock_qty_expr = _easy_stock_expr("i.ITEMNO")
    stock_system_expr = _easy_stock_expr("i.ITEMNO", through_today=True)
    stock_centre_expr = _centre_saldo_expr("i.ITEMNO", through_today=True)
    cur.execute(f"""
        SELECT COUNT(*)
        FROM ITEM i
        LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
        WHERE {where_sql}
    """, params)
    total = int(cur.fetchone()[0] or 0)
    cur.execute(f"""
        SELECT FIRST ? SKIP ?
            i.ITEMNO, i.ITEMDESCRIPTION, i.ITEMDESCRIPTION2,
            i.UNIT1, i.TIPEPERSEDIAAN, c.NAME, i.MINIMUMQTY,
            {stock_qty_expr},
            {stock_system_expr},
            {stock_centre_expr},
            {code_product_expr}
        FROM ITEM i
        LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
        WHERE {where_sql}
        ORDER BY i.ITEMNO
    """, [limit, offset] + params)
    return cur.fetchall(), total


def get_stock_data(search="", offset=0, limit=50, filters=None, include_total=False, sort_field="", sort_order=""):
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        code_product_expr = _stock_code_product_expr(cur)
        where_sql, where_params = _stock_where_clause(search, filters, code_product_expr)

        if search:
            rows, total = _get_stock_search_fallback(cur, search, limit, offset, code_product_expr, filters)
            con.close()
            data = _stock_rows_to_records(rows, {})
            if include_total:
                return {"data": data, "total": total}
            return data

        total = None
        if include_total:
            cur.execute(f"""
                SELECT COUNT(*)
                FROM ITEM i
                LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
                WHERE {where_sql}
            """, where_params)
            total = int(cur.fetchone()[0] or 0)

        order_sql = _stock_order_clause(sort_field, sort_order, code_product_expr)
        stock_qty_expr = _easy_stock_expr("i.ITEMNO")
        stock_system_expr = _easy_stock_expr("i.ITEMNO", through_today=True)
        stock_centre_expr = _centre_saldo_expr("i.ITEMNO", through_today=True)
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                i.ITEMNO, i.ITEMDESCRIPTION, i.ITEMDESCRIPTION2,
                i.UNIT1, i.TIPEPERSEDIAAN, c.NAME, i.MINIMUMQTY,
                {stock_qty_expr},
                {stock_system_expr},
                {stock_centre_expr},
                {code_product_expr}
            FROM ITEM i
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            WHERE {where_sql}
            ORDER BY {order_sql}
        """, [limit, offset] + where_params)
        rows = cur.fetchall()
        if search and not rows:
            rows, total = _get_stock_search_fallback(cur, search, limit, offset, code_product_expr, filters)
        item_nos = [str(r[0] or "").strip() for r in rows if str(r[0] or "").strip()]
        cost_description_by_item = {}
        if item_nos:
            for start in range(0, len(item_nos), 900):
                item_chunk = item_nos[start:start + 900]
                in_clause = _build_in_clause(item_chunk)
                cur.execute(f"""
                    SELECT d.ITEMNO, s.NOSTANDARBRG, s.TGLMULAIBRG, s.TGLSTANDARBRG
                    FROM STANDARBIAYABRG s
                    JOIN STANDARBIAYABRGDET d ON d.NOSTANDARBRG = s.NOSTANDARBRG
                    WHERE d.ITEMNO IN ({in_clause})
                      AND COALESCE(d.NEWCOST, 0) > 0
                    ORDER BY d.ITEMNO, s.TGLMULAIBRG DESC, s.TGLSTANDARBRG DESC, s.NOSTANDARBRG DESC
                """, item_chunk)
                for item_no, standard_no, _effective_date, _standard_date in cur.fetchall():
                    key = str(item_no or "").strip()
                    if key and key not in cost_description_by_item:
                        cost_description_by_item[key] = f"Standarisasi No :{str(standard_no or '').strip()}"

                cur.execute(f"""
                    SELECT ITEMNO, TXDATE, ITEMHISTID
                    FROM ITEMHIST
                    WHERE ITEMNO IN ({in_clause})
                      AND COALESCE(COST, 0) > 0
                    ORDER BY ITEMNO, TXDATE DESC, ITEMHISTID DESC
                """, item_chunk)
                for item_no, _tx_date, _itemhist_id in cur.fetchall():
                    key = str(item_no or "").strip()
                    if key and key not in cost_description_by_item:
                        cost_description_by_item[key] = "HPP Metode FIFO"
        con.close()
        data = _stock_rows_to_records(rows, cost_description_by_item)
        if include_total:
            return {"data": data, "total": total if total is not None else len(data)}
        return data
    except Exception as e:
        print(f"Error get_stock_data: {e}")
        return {"data": [], "total": 0} if include_total else []


_STOCK_SUMMARY_CACHE = {}


def get_stock_summary(include_standardized=True):
    cache_key = "full" if include_standardized else "dashboard"
    cached = _STOCK_SUMMARY_CACHE.get(cache_key)
    if cached and time.time() < cached.get("expires_at", 0):
        return cached["data"]

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        base_where = """
            COALESCE(i.ITEMTYPE, 0) = 0
            AND COALESCE(i.SUSPENDED, 0) = 0
            AND COALESCE(UPPER(TRIM(c.NAME)), '') NOT IN ('CF', 'MF')
        """

        cur.execute(f"""
            SELECT COUNT(*)
            FROM ITEM i
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            WHERE {base_where}
        """)
        total_items = int(cur.fetchone()[0] or 0)

        cur.execute(f"""
            SELECT COALESCE(c.NAME, 'Tanpa Kategori'), COUNT(*)
            FROM ITEM i
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            WHERE {base_where}
            GROUP BY COALESCE(c.NAME, 'Tanpa Kategori')
            ORDER BY COUNT(*) DESC, COALESCE(c.NAME, 'Tanpa Kategori')
        """)
        categories = [
            {"category": str(category or "Tanpa Kategori").strip(), "count": int(count or 0)}
            for category, count in cur.fetchall()
        ]

        standardized_items = 0
        if include_standardized:
            cur.execute(f"""
                SELECT COUNT(DISTINCT i.ITEMNO)
                FROM ITEM i
                LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
                JOIN STANDARBIAYABRGDET d ON d.ITEMNO = i.ITEMNO
                WHERE {base_where}
                  AND COALESCE(d.NEWCOST, 0) > 0
            """)
            standardized_items = int(cur.fetchone()[0] or 0)

        below_minimum_items = None
        if include_standardized:
            cur.execute(f"""
                SELECT COUNT(*)
                FROM ITEM i
                LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
                LEFT JOIN (
                    SELECT sw.ITEMNO, SUM(sw.QTY) AS QTY
                    FROM SALDO_WHS sw
                    JOIN WAREHS wh ON wh.WAREHOUSEID = sw.WAREHOUSEID
                    WHERE UPPER(TRIM(wh.NAME)) = 'CENTRE'
                    GROUP BY sw.ITEMNO
                ) saldo ON saldo.ITEMNO = i.ITEMNO
                WHERE {base_where}
                  AND COALESCE(i.MINIMUMQTY, 0) > 0
                  AND COALESCE(saldo.QTY, 0) < COALESCE(i.MINIMUMQTY, 0)
            """)
            below_minimum_items = int(cur.fetchone()[0] or 0)

        con.close()
        result = {
            "total_items": total_items,
            "category_count": len(categories),
            "categories": categories,
            "standardized_items": standardized_items,
                "below_minimum_items": int(below_minimum_items or 0) if below_minimum_items is not None else None,
        }
        _STOCK_SUMMARY_CACHE[cache_key] = {
            "expires_at": time.time() + 180,
            "data": result,
        }
        return result
    except Exception as e:
        print(f"Error get_stock_summary: {e}")
        return {
            "total_items": 0,
            "category_count": 0,
            "categories": [],
            "standardized_items": 0,
            "below_minimum_items": 0,
        }


_STOCK_FILTER_OPTIONS_CACHE = {"expires_at": 0, "data": None}


def get_stock_filter_options():
    now = time.time()
    cached_options = _STOCK_FILTER_OPTIONS_CACHE.get("data")
    if cached_options and now < float(_STOCK_FILTER_OPTIONS_CACHE.get("expires_at") or 0):
        return cached_options

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        options = {
            "itemno": [],
            "description": [],
            "description2": [],
            "quantity": [],
            "minimum_qty": [],
            "code_product": [],
            "stock_note": [
                {"text": "Stok di bawah minimum", "value": "Stok di bawah minimum"},
                {"text": "(Kosong)", "value": "__EMPTY__"},
            ],
            "cost_description": [
                {"text": "HPP Metode FIFO", "value": "HPP Metode FIFO"},
                {"text": "Standarisasi", "value": "Standarisasi"},
                {"text": "(Kosong)", "value": "__EMPTY__"},
            ],
            "unit": [],
            "category": [],
        }

        code_product_expr = _stock_code_product_expr(cur)
        cur.execute(f"""
            SELECT DISTINCT {code_product_expr}
            FROM ITEM i
            WHERE COALESCE(i.SUSPENDED, 0) = 0
              AND COALESCE(TRIM({code_product_expr}), '') <> ''
        """)
        token_values = set()
        for row in cur.fetchall():
            token_values.update(_split_code_product_tokens(row[0]))
        options["code_product"] = [
            {"text": token, "value": token}
            for token in sorted(token_values)
        ]

        cur.execute("""
            SELECT DISTINCT COALESCE(i.MINIMUMQTY, 0)
            FROM ITEM i
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            WHERE COALESCE(i.ITEMTYPE, 0) = 0
              AND COALESCE(i.SUSPENDED, 0) = 0
              AND COALESCE(UPPER(TRIM(c.NAME)), '') NOT IN ('CF', 'MF')
            ORDER BY 1
        """)
        options["minimum_qty"] = [
            {"text": f"{float(row[0] or 0):.2f}", "value": f"{float(row[0] or 0):.2f}"}
            for row in cur.fetchall()
        ]

        con.close()
        _STOCK_FILTER_OPTIONS_CACHE["data"] = options
        _STOCK_FILTER_OPTIONS_CACHE["expires_at"] = time.time() + 30
        return options
    except Exception as e:
        print(f"Error get_stock_filter_options: {e}")
        return {}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stock")
@jwt_required()
def api_stock():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    search = request.args.get("search", "")
    offset = int(request.args.get("offset", 0))
    limit  = int(request.args.get("limit", 50))
    include_total = request.args.get("include_total") in ("1", "true", "yes")
    filters = {
        "itemno": _split_filter_values(request.args.get("itemno")),
        "description": _split_filter_values(request.args.get("description")),
        "description2": _split_filter_values(request.args.get("description2")),
        "quantity": _split_filter_values(request.args.get("quantity")),
        "minimum_qty": _split_filter_values(request.args.get("minimum_qty")),
        "stock_note": _split_filter_values(request.args.get("stock_note")),
        "code_product": _split_filter_values(request.args.get("code_product")),
        "cost_description": _split_filter_values(request.args.get("cost_description")),
        "unit": _split_filter_values(request.args.get("unit")),
        "category": _split_filter_values(request.args.get("category")),
    }
    sort_field = request.args.get("sort_field", "")
    sort_order = request.args.get("sort_order", "")
    result = get_stock_data(
        search=search,
        offset=offset,
        limit=limit,
        filters=filters,
        include_total=include_total,
        sort_field=sort_field,
        sort_order=sort_order,
    )
    if include_total:
        return jsonify({
            "data": filter_record_columns("stock", result.get("data", [])),
            "total": int(result.get("total") or 0),
        })
    return jsonify(filter_record_columns("stock", result))


@app.route("/api/stock/export")
@jwt_required()
def api_stock_export():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    search = request.args.get("search", "")
    filters = {
        "itemno": _split_filter_values(request.args.get("itemno")),
        "description": _split_filter_values(request.args.get("description")),
        "description2": _split_filter_values(request.args.get("description2")),
        "quantity": _split_filter_values(request.args.get("quantity")),
        "minimum_qty": _split_filter_values(request.args.get("minimum_qty")),
        "stock_note": _split_filter_values(request.args.get("stock_note")),
        "code_product": _split_filter_values(request.args.get("code_product")),
        "cost_description": _split_filter_values(request.args.get("cost_description")),
        "unit": _split_filter_values(request.args.get("unit")),
        "category": _split_filter_values(request.args.get("category")),
    }
    result = get_stock_data(
        search=search,
        offset=0,
        limit=500000,
        filters=filters,
        include_total=False,
        sort_field=request.args.get("sort_field", ""),
        sort_order=request.args.get("sort_order", ""),
    )
    data = filter_record_columns("stock", result)
    return jsonify({"data": data, "total_rows": len(data)})


@app.route("/api/stock/summary")
@jwt_required()
def api_stock_summary():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    return jsonify(get_stock_summary())


@app.route("/api/stock/filter-options")
@jwt_required()
def api_stock_filter_options():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    return jsonify(get_stock_filter_options())


@app.route("/api/stock/warehouses")
@jwt_required()
def api_stock_warehouses():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    item_no = request.args.get("itemno", "").strip()
    if not item_no:
        return jsonify({"message": "No barang wajib diisi", "data": None}), 400
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data = _stock_warehouse_rows(cur, item_no)
        con.close()
        if not data:
            return jsonify({"message": "Barang tidak ditemukan", "data": None}), 404
        return jsonify({"data": data})
    except Exception as e:
        print(f"Error api_stock_warehouses: {e}")
        return jsonify({"message": "Gagal memuat stok gudang", "error": str(e), "data": None}), 500


@app.route("/api/stock/debug-item")
@jwt_required()
def api_stock_debug_item():
    user = get_current_user()
    if user.get("role") != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    item_no = request.args.get("itemno", "").strip()
    if not item_no:
        return jsonify({"message": "itemno wajib diisi"}), 400
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        code_expr = _stock_code_product_expr(cur)
        cur.execute(f"""
            SELECT FIRST 1
                i.ITEMNO,
                i.ITEMDESCRIPTION,
                i.ITEMDESCRIPTION2,
                i.ITEMTYPE,
                i.SUSPENDED,
                c.NAME,
                i.UNIT1,
                {code_expr},
                COALESCE((SELECT SUM(h.QUANTITY) FROM ITEMHIST h WHERE h.ITEMNO = i.ITEMNO), 0)
            FROM ITEM i
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            WHERE UPPER(i.ITEMNO) = UPPER(?)
        """, [item_no])
        row = cur.fetchone()
        con.close()
        if not row:
            return jsonify({"found": False, "itemno": item_no})
        category = str(row[5] or "").strip()
        return jsonify({
            "found": True,
            "itemno": str(row[0] or "").strip(),
            "description": str(row[1] or "").strip(),
            "description2": str(row[2] or "").strip(),
            "itemtype": row[3],
            "suspended": row[4],
            "category": category,
            "unit": str(row[6] or "").strip(),
            "code_product": str(row[7] or "").strip(),
            "quantity": float(row[8] or 0),
            "included_when_searching": int(row[3] or 0) == 0 and int(row[4] or 0) == 0,
            "excluded_from_default_list": category.upper() in ("CF", "MF"),
        })
    except Exception as e:
        print(f"Error api_stock_debug_item: {e}")
        return jsonify({"message": str(e)}), 500


# ─── SIINAS ──────────────────────────────────────────────────────────────────

SIINAS_EXTRA_FIELD_LABELS = {
    "ITEMRESERVED1": "Code Product",
    "ITEMRESERVED2": "Category Product",
    "ITEMRESERVED3": "FSA",
    "ITEMRESERVED4": "HS Code",
    "ITEMRESERVED5": "KBLI",
    "ITEMRESERVED6": "Product",
    "RESERVED1": "Code Product",
    "RESERVED2": "Category Product",
    "RESERVED3": "FSA",
    "RESERVED4": "HS Code",
    "RESERVED5": "KBLI",
    "RESERVED6": "Product",
}


def _siinas_pick_column(columns, candidates):
    column_set = set(columns)
    return next((column for column in candidates if column in column_set), None)


def _siinas_extra_columns(columns):
    extras = []
    for column in columns:
        upper = column.upper()
        if (
            upper.startswith("ITEMRESERVED")
            or upper.startswith("RESERVED")
            or upper.startswith("USERFIELD")
            or upper.startswith("CUSTOMFIELD")
            or upper in ("FSA", "HSCODE", "HS_CODE", "KBLI", "CODEPRODUCT", "CATEGORYPRODUCT", "PRODUCT")
        ):
            extras.append(column)
    return extras


def _siinas_extra_key(column):
    return f"extra_{str(column or '').strip().lower()}"


def _siinas_extra_label(column):
    upper = str(column or "").strip().upper()
    return SIINAS_EXTRA_FIELD_LABELS.get(upper, upper.replace("_", " ").title())


def _siinas_value(row_map, *columns):
    for column in columns:
        if column and column in row_map:
            value = str(row_map.get(column) or "").strip()
            if value:
                return value
    return ""


def _siinas_barang_order_clause(sort_field, sort_order, mapping):
    direction = "DESC" if sort_order == "descend" else "ASC"
    order_map = {
        "no_urut": "i.ITEMNO",
        "no_barang": "i.ITEMNO",
        "deskripsi_persediaan": "i.ITEMDESCRIPTION",
        "kode_barang_jadi": mapping.get("code_product_expr"),
        "jenis_barang_jadi": mapping.get("category_product_expr"),
        "fsa": mapping.get("fsa_expr"),
        "hs_code": mapping.get("hs_code_expr"),
        "kbli": mapping.get("kbli_expr"),
        "barang_jadi": mapping.get("product_expr"),
        "jenis_persediaan": "c.NAME",
        "akun_persediaan": mapping.get("account_name_expr"),
        "nama_pemasok_barang": mapping.get("supplier_expr"),
        "unit_1": "i.UNIT1",
        "rasio_2_barang": mapping.get("ratio2_expr"),
        "unit_2": mapping.get("unit2_expr"),
        "rasio_3_barang": mapping.get("ratio3_expr"),
        "unit_3": mapping.get("unit3_expr"),
    }
    expr = order_map.get(sort_field) or "i.ITEMNO"
    return f"{expr} {direction}, i.ITEMNO ASC"


def _siinas_add_resolver(resolvers, cur, table_name, required_columns, sql, source):
    if _table_has_columns(cur, table_name, required_columns):
        resolvers.append((source, sql))


def _siinas_build_doc_resolvers(cur):
    itemhist_resolvers = []
    invoice_resolvers = []

    if _table_has_columns(cur, "PRODRESULTDET", ("ITEMHISTID", "PRODRESULTID")) and _table_has_columns(cur, "PRODRESULT", ("ID", "RESULTNO")):
        itemhist_resolvers.append(("PRODRESULT", """
            SELECT FIRST 1 pr.RESULTNO
            FROM PRODRESULTDET prd
            JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
            WHERE prd.ITEMHISTID = ?
            ORDER BY pr.RESULTDATE DESC, pr.RESULTNO DESC
        """))

    if _table_has_columns(cur, "ARINVDET", ("ITEMHISTID", "ARINVOICEID")) and _table_has_columns(cur, "ARINV", ("ARINVOICEID", "INVOICENO")):
        itemhist_resolvers.append(("ARINV", """
            SELECT FIRST 1 ar.INVOICENO
            FROM ARINVDET det
            JOIN ARINV ar ON ar.ARINVOICEID = det.ARINVOICEID
            WHERE det.ITEMHISTID = ?
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO DESC
        """))

    if _table_has_columns(cur, "MATRLSDET", ("ITEMHISTID", "MATRLSID")) and _table_has_columns(cur, "MATRLS", ("ID", "RELEASENO")):
        itemhist_resolvers.append(("MATRLS", """
            SELECT FIRST 1 m.RELEASENO
            FROM MATRLSDET det
            JOIN MATRLS m ON m.ID = det.MATRLSID
            WHERE det.ITEMHISTID = ?
            ORDER BY m.RELEASEDATE DESC, m.RELEASENO DESC
        """))

    if _table_has_columns(cur, "APITMDET", ("ITEMHISTID", "APINVOICEID")) and _table_has_columns(cur, "APINV", ("APINVOICEID", "INVOICENO")):
        itemhist_resolvers.append(("APINV", """
            SELECT FIRST 1 ai.INVOICENO
            FROM APITMDET det
            JOIN APINV ai ON ai.APINVOICEID = det.APINVOICEID
            WHERE det.ITEMHISTID = ?
            ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO DESC
        """))

    if _table_has_columns(cur, "ITEMADJDET", ("ITEMHISTID", "ITEMADJID")):
        for doc_column in ("ADJNO", "ADJUSTNO", "FORMNO", "NOFORM", "TRANSACTIONNO"):
            if _table_has_columns(cur, "ITEMADJ", ("ID", doc_column)):
                itemhist_resolvers.append(("ITEMADJ", f"""
                    SELECT FIRST 1 adj.{doc_column}
                    FROM ITEMADJDET det
                    JOIN ITEMADJ adj ON adj.ID = det.ITEMADJID
                    WHERE det.ITEMHISTID = ?
                    ORDER BY adj.ID DESC
                """))
                break

    if _table_has_columns(cur, "ARINV", ("ARINVOICEID", "INVOICENO")):
        invoice_resolvers.append(("ARINV_HEADER", """
            SELECT FIRST 1 ar.INVOICENO
            FROM ARINV ar
            WHERE ar.ARINVOICEID = ?
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO DESC
        """))
        for det_id_column in ("ID", "ARINVDETID"):
            if _table_has_columns(cur, "ARINVDET", (det_id_column, "ARINVOICEID")):
                invoice_resolvers.append(("ARINV_DET", f"""
                    SELECT FIRST 1 ar.INVOICENO
                    FROM ARINVDET det
                    JOIN ARINV ar ON ar.ARINVOICEID = det.ARINVOICEID
                    WHERE det.{det_id_column} = ?
                    ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO DESC
                """))
                break
    if _table_has_columns(cur, "APINV", ("APINVOICEID", "INVOICENO")):
        invoice_resolvers.append(("APINV_HEADER", """
            SELECT FIRST 1 ai.INVOICENO
            FROM APINV ai
            WHERE ai.APINVOICEID = ?
            ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO DESC
        """))
        for det_id_column in ("ID", "APITMDETID"):
            if _table_has_columns(cur, "APITMDET", (det_id_column, "APINVOICEID")):
                invoice_resolvers.append(("APINV_DET", f"""
                    SELECT FIRST 1 ai.INVOICENO
                    FROM APITMDET det
                    JOIN APINV ai ON ai.APINVOICEID = det.APINVOICEID
                    WHERE det.{det_id_column} = ?
                    ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO DESC
                """))
                break
    if _table_has_columns(cur, "PRODRESULTDET", ("ID", "PRODRESULTID")) and _table_has_columns(cur, "PRODRESULT", ("ID", "RESULTNO")):
        invoice_resolvers.append(("PRODRESULT_DET", """
            SELECT FIRST 1 pr.RESULTNO
            FROM PRODRESULTDET prd
            JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
            WHERE prd.ID = ?
            ORDER BY pr.RESULTDATE DESC, pr.RESULTNO DESC
        """))
    if _table_has_columns(cur, "MATRLSDET", ("ID", "MATRLSID")) and _table_has_columns(cur, "MATRLS", ("ID", "RELEASENO")):
        invoice_resolvers.append(("MATRLS_DET", """
            SELECT FIRST 1 m.RELEASENO
            FROM MATRLSDET det
            JOIN MATRLS m ON m.ID = det.MATRLSID
            WHERE det.ID = ?
            ORDER BY m.RELEASEDATE DESC, m.RELEASENO DESC
        """))

    return itemhist_resolvers, invoice_resolvers


def _siinas_resolve_doc_no(cur, itemhist_resolvers, invoice_resolvers, itemhist_id, invoice_id, description):
    for source_id, source_value in (("ITEMHISTID", itemhist_id), ("INVOICEID", invoice_id)):
        if not source_value:
            continue
        resolvers = itemhist_resolvers if source_id == "ITEMHISTID" else invoice_resolvers
        for source, sql in resolvers:
            try:
                cur.execute(sql, [source_value])
                row = cur.fetchone()
                value = str(row[0] or "").strip() if row else ""
                if value:
                    return value
            except Exception as resolver_error:
                print(f"Error resolve siinas doc no {source}: {resolver_error}")
    return _extract_easy_doc_no(description)


def _siinas_person_country_expr(person_columns, alias="pd"):
    country_col = _match_column(person_columns, (
        "COUNTRY", "COUNTRYNAME", "NEGARA", "NATION", "NATIONALITY",
        "BILLTOCOUNTRY", "SHIPTOCOUNTRY",
    ))
    return f"CAST({alias}.{_identifier(country_col)} AS VARCHAR(255))" if country_col else "''"


def _siinas_resolve_party_by_doc_no(cur, doc_no):
    doc_no = str(doc_no or "").strip()
    if not doc_no or not _table_exists(cur, "PERSONDATA"):
        return "", ""

    person_columns = _get_table_columns(cur, "PERSONDATA")
    person_name_col = _match_column(person_columns, ("NAME", "PERSONNAME", "COMPANYNAME"))
    if not person_name_col:
        return "", ""
    country_expr = _siinas_person_country_expr(person_columns)

    lookups = []
    if _table_has_columns(cur, "ARINV", ("INVOICENO", "CUSTOMERID")):
        lookups.append(("""
            SELECT FIRST 1 pd.{name_col}, {country_expr}
            FROM ARINV ar
            LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
            WHERE ar.INVOICENO = ?
            ORDER BY ar.INVOICEDATE DESC
        """, [doc_no]))
    if _table_has_columns(cur, "APINV", ("INVOICENO", "VENDORID")):
        lookups.append(("""
            SELECT FIRST 1 pd.{name_col}, {country_expr}
            FROM APINV ai
            LEFT JOIN PERSONDATA pd ON pd.ID = ai.VENDORID
            WHERE ai.INVOICENO = ?
            ORDER BY ai.INVOICEDATE DESC
        """, [doc_no]))

    safe_name_col = _identifier(person_name_col)
    for sql_template, params in lookups:
        try:
            cur.execute(sql_template.format(name_col=safe_name_col, country_expr=country_expr), params)
            row = cur.fetchone()
            if row:
                return str(row[0] or "").strip(), str(row[1] or "").strip()
        except Exception as party_error:
            print(f"Error resolve siinas party {doc_no}: {party_error}")
    return "", ""


def _get_siinas_barang(search="", offset=0, limit=50, sort_field="", sort_order=""):
    con = fdb.connect(**DB_CONFIG)
    cur = con.cursor()
    try:
        item_columns = _get_table_columns(cur, "ITEM")
        extra_columns = _siinas_extra_columns(item_columns)

        unit2_col = _siinas_pick_column(item_columns, ("UNIT2", "ITEMUNIT2", "SECONDUNIT"))
        unit3_col = _siinas_pick_column(item_columns, ("UNIT3", "ITEMUNIT3", "THIRDUNIT"))
        ratio2_col = _siinas_pick_column(item_columns, ("RATIO2", "UNITRATIO2", "RATIOUNIT2"))
        ratio3_col = _siinas_pick_column(item_columns, ("RATIO3", "UNITRATIO3", "RATIOUNIT3"))
        account_col = _siinas_pick_column(item_columns, (
            "INVENTORYACCOUNT", "INVENTORYACCOUNTNO", "INVENTORYGLACCOUNT",
            "INVENTORYGLACCOUNTNO", "INVENTORYGLACCNT", "INVENTORYACCNT",
            "INVACCOUNT", "INVACCOUNTNO", "INVGLACCOUNT", "INVGLACCOUNTNO",
            "GLACCOUNT", "ACCOUNTNO", "ACCOUNTID", "INVENTORYACCOUNTID",
            "INVACCOUNTID", "GLACCOUNTID",
        ))
        supplier_col = _siinas_pick_column(item_columns, (
            "VENDORNAME", "SUPPLIERNAME", "PREFERREDVENDOR", "PREFEREDVENDOR",
            "PREFERREDVENDORID", "PREFEREDVENDORID", "PREFERREDVENDORNO", "PREFEREDVENDORNO",
            "PREFERREDVENDORCODE", "PREFEREDVENDORCODE", "PREFERREDVENDORSUPPLIER",
            "PREFERREDVENDORSUPPLIERID", "PREFERREDVENDORSUPPLIERNO",
            "PREFERREDSUPPLIER", "PREFEREDSUPPLIER", "PREFERREDSUPPLIERID",
            "PREFEREDSUPPLIERID", "PREFERREDSUPPLIERNO", "PREFEREDSUPPLIERNO",
            "PREFVENDORID", "PREFVENDORNO", "DEFAULTVENDORID", "DEFAULTVENDORNO",
            "PREFSUPPLIERID", "PREFSUPPLIERNO", "DEFAULTSUPPLIERID", "DEFAULTSUPPLIERNO",
            "VENDOR", "VENDORID", "VENDORNO", "SUPPLIER", "SUPPLIERID", "SUPPLIERNO",
            "PERSONID", "PERSONNO",
        ))
        account_name_expr = "NULL"
        account_joins = []
        if account_col and _table_exists(cur, "GLACCNT"):
            glaccnt_columns = _get_table_columns(cur, "GLACCNT")
            account_name_col = _match_column(glaccnt_columns, ("ACCOUNTNAME", "GLACCOUNTNAME", "NAME", "DESCRIPTION"))
            account_no_col = _match_column(glaccnt_columns, ("GLACCOUNT", "ACCOUNTNO", "GLACCOUNTNO", "CODE"))
            account_id_col = _match_column(glaccnt_columns, ("GLACCOUNTID", "ACCOUNTID", "ID"))
            if account_name_col and (account_no_col or account_id_col):
                join_col = account_id_col if account_col.upper().endswith("ID") and account_id_col else account_no_col
                account_name_expr = f"ga.{_identifier(account_name_col)}"
                account_joins.append(
                    "LEFT JOIN GLACCNT ga ON CAST(ga.%s AS VARCHAR(255)) = CAST(i.%s AS VARCHAR(255))"
                    % (_identifier(join_col), _identifier(account_col))
                )

        def col_expr(column):
            return f"CAST(i.{_identifier(column)} AS VARCHAR(255))" if column else "''"

        supplier_expr = col_expr(supplier_col)

        dynamic_columns = [
            column for column in [unit2_col, unit3_col, ratio2_col, ratio3_col, account_col, supplier_col]
            if column
        ]
        for column in extra_columns:
            if column not in dynamic_columns:
                dynamic_columns.append(column)

        dynamic_select = [
            f"CAST(i.{_identifier(column)} AS VARCHAR(255)) AS {_identifier(column)}"
            for column in dynamic_columns
        ]
        select_sql = ",\n                ".join(dynamic_select)
        if select_sql:
            select_sql = ",\n                " + select_sql

        account_display_expr = f"""
            COALESCE(
                NULLIF(TRIM(CAST(({account_name_expr}) AS VARCHAR(255))), ''),
                CASE
                    WHEN NULLIF(TRIM(COALESCE(c.NAME, '')), '') IS NOT NULL
                    THEN 'Persediaan ' || TRIM(c.NAME)
                    ELSE ''
                END
            )
        """
        order_mapping = {
            "code_product_expr": col_expr(_siinas_pick_column(item_columns, ("CODEPRODUCT", "ITEMRESERVED1", "RESERVED1"))),
            "category_product_expr": col_expr(_siinas_pick_column(item_columns, ("CATEGORYPRODUCT", "ITEMRESERVED2", "RESERVED2"))),
            "fsa_expr": col_expr(_siinas_pick_column(item_columns, ("FSA", "ITEMRESERVED3", "RESERVED3"))),
            "hs_code_expr": col_expr(_siinas_pick_column(item_columns, ("HSCODE", "HS_CODE", "ITEMRESERVED4", "RESERVED4"))),
            "kbli_expr": col_expr(_siinas_pick_column(item_columns, ("KBLI", "ITEMRESERVED5", "RESERVED5"))),
            "product_expr": col_expr(_siinas_pick_column(item_columns, ("PRODUCT", "ITEMRESERVED6", "RESERVED6"))),
            "account_name_expr": account_display_expr,
            "supplier_expr": col_expr(supplier_col),
            "unit2_expr": col_expr(unit2_col),
            "unit3_expr": col_expr(unit3_col),
            "ratio2_expr": col_expr(ratio2_col),
            "ratio3_expr": col_expr(ratio3_col),
        }

        where_sql = "COALESCE(i.ITEMTYPE, 0) = 0 AND COALESCE(i.SUSPENDED, 0) = 0"
        params = []
        if search:
            search_clauses = [
                "LOWER(i.ITEMNO) CONTAINING LOWER(?)",
                "LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)",
                "LOWER(i.ITEMDESCRIPTION2) CONTAINING LOWER(?)",
                "LOWER(COALESCE(c.NAME, '')) CONTAINING LOWER(?)",
            ]
            params.extend([search, search, search, search])
            for column in dynamic_columns:
                search_clauses.append(f"LOWER(CAST(i.{_identifier(column)} AS VARCHAR(255))) CONTAINING LOWER(?)")
                params.append(search)
            where_sql += f" AND ({' OR '.join(search_clauses)})"

        cur.execute(f"""
            SELECT COUNT(*)
            FROM ITEM i
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            {' '.join(account_joins)}
            WHERE {where_sql}
        """, params)
        total = int(cur.fetchone()[0] or 0)

        order_sql = _siinas_barang_order_clause(sort_field, sort_order, order_mapping)
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                i.ITEMNO,
                i.ITEMDESCRIPTION,
                i.ITEMDESCRIPTION2,
                i.UNIT1,
                c.NAME,
                {account_display_expr} AS AKUNPERSEDIAAN,
                {supplier_expr} AS NAMAPEMASOKBARANG
                {select_sql}
            FROM ITEM i
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            {' '.join(account_joins)}
            WHERE {where_sql}
            ORDER BY {order_sql}
        """, [limit, offset] + params)

        rows = cur.fetchall()
        supplier_name_by_ref = {}
        if supplier_col:
            supplier_refs = []
            for row in rows:
                supplier_ref = str(row[6] or "").strip()
                if supplier_ref and supplier_ref not in supplier_refs:
                    supplier_refs.append(supplier_ref)
            if supplier_refs and _table_exists(cur, "PERSONDATA"):
                try:
                    person_columns = _get_table_columns(cur, "PERSONDATA")
                    person_name_col = _match_column(person_columns, ("NAME", "PERSONNAME", "COMPANYNAME"))
                    person_no_col = _match_column(person_columns, ("PERSONNO", "VENDORNO", "SUPPLIERNO", "CODE"))
                    person_id_col = _match_column(person_columns, ("ID", "PERSONID", "VENDORID", "SUPPLIERID"))
                    lookup_conditions = []
                    lookup_params = []
                    for chunk in [supplier_refs[start:start + 900] for start in range(0, len(supplier_refs), 900)]:
                        if not chunk or not person_name_col:
                            continue
                        lookup_conditions = []
                        lookup_params = []
                        if person_no_col:
                            lookup_conditions.append(f"CAST({_identifier(person_no_col)} AS VARCHAR(255)) IN ({_build_in_clause(chunk)})")
                            lookup_params.extend(chunk)
                        if person_id_col:
                            lookup_conditions.append(f"CAST({_identifier(person_id_col)} AS VARCHAR(255)) IN ({_build_in_clause(chunk)})")
                            lookup_params.extend(chunk)
                        if not lookup_conditions:
                            continue
                        select_no = _identifier(person_no_col) if person_no_col else "NULL"
                        select_id = _identifier(person_id_col) if person_id_col else "NULL"
                        cur.execute(f"""
                            SELECT CAST({select_no} AS VARCHAR(255)), CAST({select_id} AS VARCHAR(255)), {_identifier(person_name_col)}
                            FROM PERSONDATA
                            WHERE {' OR '.join(lookup_conditions)}
                        """, lookup_params)
                        for person_no, person_id, person_name in cur.fetchall():
                            name = str(person_name or "").strip()
                            if not name:
                                continue
                            for ref in (str(person_no or "").strip(), str(person_id or "").strip()):
                                if ref:
                                    supplier_name_by_ref[ref] = name
                except Exception as supplier_error:
                    print(f"Error resolve siinas supplier: {supplier_error}")
        data = []
        for index, row in enumerate(rows, start=offset + 1):
            base_len = 7
            row_map = {
                column: row[base_len + column_index]
                for column_index, column in enumerate(dynamic_columns)
            }
            fsa = _siinas_value(row_map, "FSA", "ITEMRESERVED3", "RESERVED3")
            hs_code = _siinas_value(row_map, "HSCODE", "HS_CODE", "ITEMRESERVED4", "RESERVED4")
            kbli = _siinas_value(row_map, "KBLI", "ITEMRESERVED5", "RESERVED5")
            code_product = _siinas_value(row_map, "CODEPRODUCT", "ITEMRESERVED1", "RESERVED1")
            category_product = _siinas_value(row_map, "CATEGORYPRODUCT", "ITEMRESERVED2", "RESERVED2")
            product = _siinas_value(row_map, "PRODUCT", "ITEMRESERVED6", "RESERVED6")

            record = {
                "no_urut": index,
                "no_barang": str(row[0] or "").strip(),
                "deskripsi_persediaan": str(row[1] or "").strip(),
                "kode_barang_jadi": code_product,
                "jenis_barang_jadi": category_product,
                "fsa": fsa,
                "hs_code": hs_code,
                "kbli": kbli,
                "barang_jadi": product,
                "jenis_persediaan": str(row[4] or "").strip(),
                "akun_persediaan": str(row[5] or "").strip(),
                "nama_pemasok_barang": supplier_name_by_ref.get(str(row[6] or "").strip(), str(row[6] or "").strip()),
                "unit_1": str(row[3] or "").strip(),
                "rasio_2_barang": _siinas_value(row_map, ratio2_col),
                "unit_2": _siinas_value(row_map, unit2_col),
                "rasio_3_barang": _siinas_value(row_map, ratio3_col),
                "unit_3": _siinas_value(row_map, unit3_col),
            }
            for column in extra_columns:
                record[_siinas_extra_key(column)] = str(row_map.get(column) or "").strip()
            data.append(record)

        metadata = [
            {"key": _siinas_extra_key(column), "label": _siinas_extra_label(column)}
            for column in extra_columns
        ]
        return {"data": data, "total": total, "extra_columns": metadata}
    finally:
        con.close()


def _get_siinas_valuasi_rinci(search="", offset=0, limit=50, date_from="", date_to=""):
    tx_type_map = {
        "S": "Pengiriman Barang",
        "P": "Penerimaan Barang",
        "AV": "Penyesuaian Persediaan",
        "A": "Penyesuaian Persediaan",
        "AD": "Penyesuaian Persediaan",
        "ADJ": "Penyesuaian Persediaan",
        "TR": "Transfer",
        "R": "Retur",
        "RP": "Retur Pembelian",
        "RS": "Retur Penjualan",
        "WO": "Work Order",
        "FIN": "Hasil Produksi",
        "J": "Job Order",
    }
    con = fdb.connect(**DB_CONFIG)
    meta_cur = con.cursor()
    query_cur = con.cursor()
    resolver_cur = con.cursor()
    try:
        has_invoice_id = _table_has_columns(meta_cur, "ITEMHIST", ("INVOICEID",))
        invoice_id_expr = "h.INVOICEID" if has_invoice_id else "NULL"
        itemhist_resolvers, invoice_resolvers = _siinas_build_doc_resolvers(meta_cur)
        item_columns = _get_table_columns(meta_cur, "ITEM")
        unit3_col = _siinas_pick_column(item_columns, ("UNIT3", "ITEMUNIT3", "THIRDUNIT"))
        ratio3_col = _siinas_pick_column(item_columns, ("RATIO3", "UNITRATIO3", "RATIOUNIT3"))
        account_col = _siinas_pick_column(item_columns, (
            "INVENTORYACCOUNT", "INVENTORYACCOUNTNO", "INVENTORYGLACCOUNT",
            "INVENTORYGLACCOUNTNO", "INVENTORYGLACCNT", "INVENTORYACCNT",
            "INVACCOUNT", "INVACCOUNTNO", "INVGLACCOUNT", "INVGLACCOUNTNO",
            "GLACCOUNT", "ACCOUNTNO", "ACCOUNTID", "INVENTORYACCOUNTID",
            "INVACCOUNTID", "GLACCOUNTID",
        ))
        account_name_expr = "NULL"
        account_joins = []
        if account_col and _table_exists(meta_cur, "GLACCNT"):
            glaccnt_columns = _get_table_columns(meta_cur, "GLACCNT")
            account_name_col = _match_column(glaccnt_columns, ("ACCOUNTNAME", "GLACCOUNTNAME", "NAME", "DESCRIPTION"))
            account_no_col = _match_column(glaccnt_columns, ("GLACCOUNT", "ACCOUNTNO", "GLACCOUNTNO", "CODE"))
            account_id_col = _match_column(glaccnt_columns, ("GLACCOUNTID", "ACCOUNTID", "ID"))
            if account_name_col and (account_no_col or account_id_col):
                join_col = account_id_col if account_col.upper().endswith("ID") and account_id_col else account_no_col
                account_name_expr = f"ga.{_identifier(account_name_col)}"
                account_joins.append(
                    "LEFT JOIN GLACCNT ga ON CAST(ga.%s AS VARCHAR(255)) = CAST(i.%s AS VARCHAR(255))"
                    % (_identifier(join_col), _identifier(account_col))
                )

        def item_col_expr(column):
            return f"CAST(i.{_identifier(column)} AS VARCHAR(255))" if column else "''"

        account_display_expr = f"""
            COALESCE(
                NULLIF(TRIM(CAST(({account_name_expr}) AS VARCHAR(255))), ''),
                CASE
                    WHEN NULLIF(TRIM(COALESCE(c.NAME, '')), '') IS NOT NULL
                    THEN 'Persediaan ' || TRIM(c.NAME)
                    ELSE ''
                END
            )
        """
        where_sql = "h.ITEMNO IS NOT NULL"
        params = []
        if date_from:
            where_sql += " AND h.TXDATE >= ?"
            params.append(date_from)
        if date_to:
            where_sql += " AND h.TXDATE <= ?"
            params.append(date_to)
        if search:
            where_sql += " AND LOWER(h.ITEMNO) CONTAINING LOWER(?)"
            params.append(search)

        query_cur.execute(f"""
            SELECT COUNT(*)
            FROM ITEMHIST h
            LEFT JOIN ITEM i ON i.ITEMNO = h.ITEMNO
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            {' '.join(account_joins)}
            WHERE {where_sql}
        """, params)
        total = int(query_cur.fetchone()[0] or 0)

        query_cur.execute(f"""
            SELECT FIRST ? SKIP ?
                h.TXDATE,
                h.ITEMNO,
                i.ITEMDESCRIPTION,
                h.DESCRIPTION,
                h.TXTYPE,
                h.QUANTITY,
                h.ITEMHISTID,
                {invoice_id_expr},
                {item_col_expr(_siinas_pick_column(item_columns, ("CODEPRODUCT", "ITEMRESERVED1", "RESERVED1")))},
                {item_col_expr(_siinas_pick_column(item_columns, ("CATEGORYPRODUCT", "ITEMRESERVED2", "RESERVED2")))},
                {item_col_expr(_siinas_pick_column(item_columns, ("FSA", "ITEMRESERVED3", "RESERVED3")))},
                {item_col_expr(_siinas_pick_column(item_columns, ("HSCODE", "HS_CODE", "ITEMRESERVED4", "RESERVED4")))},
                {item_col_expr(_siinas_pick_column(item_columns, ("KBLI", "ITEMRESERVED5", "RESERVED5")))},
                {item_col_expr(_siinas_pick_column(item_columns, ("PRODUCT", "ITEMRESERVED6", "RESERVED6")))},
                i.UNIT1,
                c.NAME,
                {account_display_expr},
                {item_col_expr(ratio3_col)}
            FROM ITEMHIST h
            LEFT JOIN ITEM i ON i.ITEMNO = h.ITEMNO
            LEFT JOIN ITEMCATEGORY c ON c.CATEGORYID = i.CATEGORYID
            {' '.join(account_joins)}
            WHERE {where_sql}
            ORDER BY h.TXDATE DESC, h.ITEMHISTID DESC
        """, [limit, offset] + params)

        data = []
        rows = query_cur.fetchall()
        party_by_doc = {}
        for row in rows:
            quantity = float(row[5] or 0)
            tx_type = str(row[4] or "").strip()
            doc_no = _siinas_resolve_doc_no(resolver_cur, itemhist_resolvers, invoice_resolvers, row[6], row[7], row[3])
            if doc_no not in party_by_doc:
                party_by_doc[doc_no] = _siinas_resolve_party_by_doc_no(resolver_cur, doc_no)
            party_name, party_country = party_by_doc.get(doc_no, ("", ""))
            data.append({
                "tgl_faktur": str(row[0]) if row[0] else "",
                "no_barang": str(row[1] or "").strip(),
                "deskripsi_barang": str(row[2] or "").strip(),
                "kode_barang_jadi": str(row[8] or "").strip(),
                "jenis_barang_jadi": str(row[9] or "").strip(),
                "fsa": str(row[10] or "").strip(),
                "hs_code": str(row[11] or "").strip(),
                "kbli": str(row[12] or "").strip(),
                "barang_jadi": str(row[13] or "").strip(),
                "no_faktur": doc_no,
                "tipe_transaksi": tx_type_map.get(tx_type, tx_type),
                "unit_1": str(row[14] or "").strip(),
                "masuk": quantity if quantity > 0 else 0,
                "keluar": abs(quantity) if quantity < 0 else 0,
                "nama_pelanggan_pemasok": party_name,
                "negara_pelanggan_pemasok": party_country,
                "tipe_persediaan_barang": str(row[15] or "").strip(),
                "akun_persediaan_barang": str(row[16] or "").strip(),
                "rasio_3_barang": str(row[17] or "").strip(),
            })
        return {"data": data, "total": total}
    finally:
        try:
            con.close()
        except Exception as close_error:
            print(f"Error close siinas valuasi connection: {close_error}")


@app.route("/api/siinas/barang")
@jwt_required()
def api_siinas_barang():
    if not check_permission("siinas"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))
        sort_field = request.args.get("sort_field", "")
        sort_order = request.args.get("sort_order", "")
        return jsonify(_get_siinas_barang(
            search=search,
            offset=offset,
            limit=limit,
            sort_field=sort_field,
            sort_order=sort_order,
        ))
    except Exception as e:
        print(f"Error api_siinas_barang: {e}")
        return jsonify({"data": [], "total": 0, "extra_columns": [], "error": str(e)}), 500


@app.route("/api/siinas/valuasi-rinci")
@jwt_required()
def api_siinas_valuasi_rinci():
    if not check_permission("siinas"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        return jsonify(_get_siinas_valuasi_rinci(
            search=search,
            offset=offset,
            limit=limit,
            date_from=date_from,
            date_to=date_to,
        ))
    except Exception as e:
        print(f"Error api_siinas_valuasi_rinci: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)}), 500

def _row_values(cur, sql, params, defaults):
    cur.execute(sql, params or [])
    row = cur.fetchone()
    if not row:
        return defaults
    return [
        row[i] if i < len(row) and row[i] is not None else defaults[i]
        for i in range(len(defaults))
    ]


def _dashboard_delivery_history(cur, date_from, date_to):
    period_filter = "{field} >= ? AND {field} <= ?"
    delivery_do_count, delivery_do_amount = _row_values(cur, f"""
        SELECT
            COUNT(DISTINCT ar.ARINVOICEID),
            SUM(COALESCE(ar.INVOICEAMOUNT, 0))
        FROM ARINV ar
        WHERE ar.DELIVERYORDER IS NOT NULL
          AND TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) <> ''
          AND {period_filter.format(field="ar.INVOICEDATE")}
    """, [date_from, date_to], [0, 0])

    mfsht_cost_expr = "COALESCE(m.ITEMAMOUNT, 0) + COALESCE(m.ACCOUNTAMOUNT, 0)"
    gr_count, gr_amount = _row_values(cur, f"""
        SELECT COUNT(*), SUM({mfsht_cost_expr})
        FROM MFSHT m
        WHERE {period_filter.format(field="m.SHEETDATE")}
          AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) STARTING WITH 'GR'
    """, [date_from, date_to], [0, 0])
    sr_count, sr_amount = _row_values(cur, f"""
        SELECT COUNT(*), SUM({mfsht_cost_expr})
        FROM MFSHT m
        WHERE {period_filter.format(field="m.SHEETDATE")}
          AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SR'
    """, [date_from, date_to], [0, 0])
    packing_count, packing_amount = _row_values(cur, f"""
        SELECT COUNT(*), SUM({mfsht_cost_expr})
        FROM MFSHT m
        WHERE {period_filter.format(field="m.SHEETDATE")}
          AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SUPPORT PACKAG'
    """, [date_from, date_to], [0, 0])
    pemasangan_count, pemasangan_amount = _row_values(cur, f"""
        SELECT COUNT(*), SUM({mfsht_cost_expr})
        FROM MFSHT m
        WHERE {period_filter.format(field="m.SHEETDATE")}
          AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'LTK'
    """, [date_from, date_to], [0, 0])

    cur.execute(f"""
        SELECT FIRST 100
            ar.INVOICENO,
            ar.INVOICEDATE,
            ar.PURCHASEORDERNO,
            pd.NAME,
            ar.DESCRIPTION
        FROM ARINV ar
        LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
        WHERE ar.DELIVERYORDER IS NOT NULL
          AND TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) <> ''
          AND {period_filter.format(field="ar.INVOICEDATE")}
        ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO DESC
    """, [date_from, date_to])
    delivery_do_rows = [
        {
            "no": str(row[0] or "").strip(),
            "tanggal": str(row[1]) if row[1] else "",
            "no_po": str(row[2] or "").strip(),
            "nama": str(row[3] or "").strip(),
            "deskripsi": str(row[4] or "").strip(),
        }
        for row in cur.fetchall()
    ]

    def mfsht_history_rows(condition_sql):
        cur.execute(f"""
            SELECT FIRST 100
                m.MFNO,
                m.SHEETDATE,
                m.DESCRIPTION,
                m.FINISHED
            FROM MFSHT m
            WHERE {period_filter.format(field="m.SHEETDATE")}
              AND {condition_sql}
            ORDER BY m.SHEETDATE DESC, m.MFNO DESC
        """, [date_from, date_to])
        return [
            {
                "no": str(row[0] or "").strip(),
                "tanggal": str(row[1]) if row[1] else "",
                "deskripsi": str(row[2] or "").strip(),
                "status": "Selesai" if int(row[3] or 0) else "Dalam Proses",
            }
            for row in cur.fetchall()
        ]

    return {
        "date_from": date_from,
        "date_to": date_to,
        "do_count": int(delivery_do_count or 0),
        "do_amount": round(float(delivery_do_amount or 0), 2),
        "gr_count": int(gr_count or 0),
        "gr_amount": round(float(gr_amount or 0), 2),
        "sr_count": int(sr_count or 0),
        "sr_amount": round(float(sr_amount or 0), 2),
        "packing_count": int(packing_count or 0),
        "packing_amount": round(float(packing_amount or 0), 2),
        "pemasangan_count": int(pemasangan_count or 0),
        "pemasangan_amount": round(float(pemasangan_amount or 0), 2),
        "do_rows": delivery_do_rows,
        "gr_rows": mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) STARTING WITH 'GR'"),
        "sr_rows": mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SR'"),
        "packing_rows": mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SUPPORT PACKAG'"),
        "pemasangan_rows": mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'LTK'"),
    }


@app.route("/api/dashboard-delivery-history")
@jwt_required()
def api_dashboard_delivery_history():
    if not check_permission("dashboard"):
        return jsonify({"message": "Akses ditolak"}), 403
    date_from = request.args.get("date_from") or datetime.now().replace(day=1).strftime("%Y-%m-%d")
    date_to = request.args.get("date_to") or datetime.now().strftime("%Y-%m-%d")
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data = _dashboard_delivery_history(cur, date_from, date_to)
        con.close()
        return jsonify(data)
    except Exception as e:
        print(f"Error api_dashboard_delivery_history: {e}")
        return jsonify({"message": "Gagal memuat riwayat barang keluar.", "error": str(e)}), 500


@app.route("/api/dashboard-summary")
@jwt_required()
def api_dashboard_summary():
    if not check_permission("dashboard"):
        return jsonify({"message": "Akses ditolak"}), 403

    def one(cur, sql, params=None, default=0):
        cur.execute(sql, params or [])
        row = cur.fetchone()
        return row[0] if row and row[0] is not None else default

    def row_values(cur, sql, params, defaults):
        return _row_values(cur, sql, params, defaults)

    date_from = request.args.get("date_from") or datetime.now().replace(day=1).strftime("%Y-%m-%d")
    date_to = request.args.get("date_to") or datetime.now().strftime("%Y-%m-%d")
    fast_mode = request.args.get("fast") in ("1", "true", "yes")
    period_filter = "{field} >= ? AND {field} <= ?"
    det_discpc = sql_number_expr("det.DISCPC")
    det_disc_discpc = sql_number_expr("det_disc.DISCPC")
    so_cash_discount = sql_number_expr("so.CASHDISCOUNT")
    so_cash_discpc = sql_number_expr("so.CASHDISCPC")
    po_line_discpc = sql_number_expr("podet_sum.ITEMDISCPC")
    po_cash_discount = sql_number_expr("po.CASHDISCOUNT")
    po_cash_discpc = sql_number_expr("po.CASHDISCPC")
    sales_line_subtotal_expr = """
        COALESCE(det.QUANTITY, 0)
        * COALESCE(det.UNITPRICE, 0)
        * (1 - COALESCE({det_discpc}, 0) / 100)
    """.format(det_discpc=det_discpc)
    sales_order_subtotal_expr = f"""
        (
            SELECT SUM(
                COALESCE(det_disc.QUANTITY, 0)
                * COALESCE(det_disc.UNITPRICE, 0)
                * (1 - COALESCE({det_disc_discpc}, 0) / 100)
            )
            FROM SODET det_disc
            WHERE det_disc.SOID = so.SOID
              AND det_disc.ITEMNO IS NOT NULL
        )
    """
    sales_order_discount_expr = f"""
        CASE
            WHEN COALESCE({so_cash_discount}, 0) <> 0
                THEN COALESCE({so_cash_discount}, 0)
            ELSE COALESCE({sales_order_subtotal_expr}, 0)
                * COALESCE({so_cash_discpc}, 0) / 100
        END
    """
    sales_amount_expr = f"""
        ({sales_line_subtotal_expr})
        * (
            1 - CASE
                WHEN COALESCE({sales_order_subtotal_expr}, 0) > 0
                    THEN COALESCE({sales_order_discount_expr}, 0) / COALESCE({sales_order_subtotal_expr}, 0)
                ELSE 0
            END
        )
    """

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        stock_summary = get_stock_summary(include_standardized=not fast_mode)

        po_period = one(cur, f"""
            SELECT COUNT(*)
            FROM PO po
            WHERE {period_filter.format(field="po.PODATE")}
        """, [date_from, date_to])

        purchase_item_period = one(cur, f"""
            SELECT COUNT(*)
            FROM PO po
            LEFT JOIN PODET det ON det.POID = po.POID
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="po.PODATE")}
        """, [date_from, date_to])

        purchase_total_easy, purchase_discount, purchase_grand_total = row_values(cur, f"""
            SELECT
                SUM(x.total_easy),
                SUM(x.discount_amount),
                SUM(x.grand_total)
            FROM (
                SELECT
                    po.POID,
                    COALESCE(SUM(
                        COALESCE(podet_sum.QUANTITY, 0)
                        * COALESCE(podet_sum.UNITPRICE, 0)
                        * (1 - COALESCE({po_line_discpc}, 0) / 100)
                    ), 0) AS total_easy,
                    COALESCE(SUM(
                        COALESCE(podet_sum.QUANTITY, 0)
                        * COALESCE(podet_sum.UNITPRICE, 0)
                        * COALESCE({po_line_discpc}, 0) / 100
                    ), 0)
                    + CASE
                        WHEN COALESCE({po_cash_discount}, 0) <> 0 THEN COALESCE({po_cash_discount}, 0)
                        ELSE COALESCE(SUM(
                            COALESCE(podet_sum.QUANTITY, 0)
                            * COALESCE(podet_sum.UNITPRICE, 0)
                            * (1 - COALESCE({po_line_discpc}, 0) / 100)
                        ), 0) * COALESCE({po_cash_discpc}, 0) / 100
                    END AS discount_amount,
                    COALESCE(po.POAMOUNT, 0) AS grand_total
                FROM PO po
                LEFT JOIN PODET podet_sum ON podet_sum.POID = po.POID
                WHERE {period_filter.format(field="po.PODATE")}
                GROUP BY po.POID, po.POAMOUNT, po.CASHDISCOUNT, po.CASHDISCPC
            ) x
        """, [date_from, date_to], [0, 0, 0])

        purchase_vendor_total, purchase_vendor_ppn, purchase_vendor_non_ppn = row_values(cur, f"""
            SELECT
                COUNT(DISTINCT po.VENDORID),
                COUNT(DISTINCT CASE
                    WHEN COALESCE(po.VENDORISTAXABLE, 0) <> 0
                      OR COALESCE(po.TAX1AMOUNT, 0) <> 0
                      OR COALESCE(po.TAX2AMOUNT, 0) <> 0
                    THEN po.VENDORID
                    ELSE NULL
                END),
                COUNT(DISTINCT CASE
                    WHEN COALESCE(po.VENDORISTAXABLE, 0) = 0
                     AND COALESCE(po.TAX1AMOUNT, 0) = 0
                     AND COALESCE(po.TAX2AMOUNT, 0) = 0
                    THEN po.VENDORID
                    ELSE NULL
                END)
            FROM PO po
            WHERE po.VENDORID IS NOT NULL
              AND {period_filter.format(field="po.PODATE")}
        """, [date_from, date_to], [0, 0, 0])
        purchase_vendor_ppn_pct = round((float(purchase_vendor_ppn or 0) / float(purchase_vendor_total or 0)) * 100, 1) if purchase_vendor_total else 0
        purchase_vendor_non_ppn_pct = round((float(purchase_vendor_non_ppn or 0) / float(purchase_vendor_total or 0)) * 100, 1) if purchase_vendor_total else 0

        (
            purchase_pb_total,
            purchase_pb_received,
            purchase_pb_late,
            purchase_pb_on_time,
            purchase_pb_avg_late_days,
            purchase_pb_max_late_days,
        ) = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN recv.pb_date IS NOT NULL THEN 1 ELSE 0 END),
                SUM(CASE WHEN recv.pb_date > po.EXPECTED THEN 1 ELSE 0 END),
                SUM(CASE WHEN recv.pb_date IS NOT NULL AND recv.pb_date <= po.EXPECTED THEN 1 ELSE 0 END),
                AVG(CASE WHEN recv.pb_date > po.EXPECTED THEN recv.pb_date - po.EXPECTED ELSE NULL END),
                MAX(CASE WHEN recv.pb_date > po.EXPECTED THEN recv.pb_date - po.EXPECTED ELSE 0 END)
            FROM PO po
            LEFT JOIN PODET det ON det.POID = po.POID
            LEFT JOIN (
                SELECT
                    apdet.POID,
                    apdet.POSEQ,
                    MAX(ai.INVOICEDATE) AS pb_date
                FROM APITMDET apdet
                JOIN APINV ai ON ai.APINVOICEID = apdet.APINVOICEID
                GROUP BY apdet.POID, apdet.POSEQ
            ) recv ON recv.POID = det.POID AND recv.POSEQ = det.SEQ
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="po.PODATE")}
        """, [date_from, date_to], [0, 0, 0, 0, 0, 0])
        purchase_pb_pending = max(int(purchase_pb_total or 0) - int(purchase_pb_received or 0), 0)
        purchase_pb_late_pct = round((float(purchase_pb_late or 0) / float(purchase_pb_received or 0)) * 100, 1) if purchase_pb_received else 0
        purchase_pb_on_time_pct = round((float(purchase_pb_on_time or 0) / float(purchase_pb_received or 0)) * 100, 1) if purchase_pb_received else 0

        so_period = one(cur, f"""
            SELECT COUNT(*)
            FROM SO so
            WHERE {period_filter.format(field="so.SODATE")}
        """, [date_from, date_to])

        do_period = one(cur, f"""
            SELECT COUNT(DISTINCT ar.ARINVOICEID)
            FROM SO so
            JOIN ARINVDET det_do ON det_do.SOID = so.SOID
            JOIN ARINV ar ON ar.ARINVOICEID = det_do.ARINVOICEID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(ar.DELIVERYORDER) <> ''
              AND {period_filter.format(field="so.SODATE")}
        """, [date_from, date_to])

        delivery_do_count, delivery_do_amount = row_values(cur, f"""
            SELECT
                COUNT(DISTINCT ar.ARINVOICEID),
                SUM(COALESCE(ar.INVOICEAMOUNT, 0))
            FROM ARINV ar
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) <> ''
              AND {period_filter.format(field="ar.INVOICEDATE")}
        """, [date_from, date_to], [0, 0])

        mfsht_cost_expr = "COALESCE(m.ITEMAMOUNT, 0) + COALESCE(m.ACCOUNTAMOUNT, 0)"

        gr_count, gr_amount = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM({mfsht_cost_expr})
            FROM MFSHT m
            WHERE {period_filter.format(field="m.SHEETDATE")}
              AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) STARTING WITH 'GR'
        """, [date_from, date_to], [0, 0])

        sr_count, sr_amount = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM({mfsht_cost_expr})
            FROM MFSHT m
            WHERE {period_filter.format(field="m.SHEETDATE")}
              AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SR'
        """, [date_from, date_to], [0, 0])

        packing_count, packing_amount = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM({mfsht_cost_expr})
            FROM MFSHT m
            WHERE {period_filter.format(field="m.SHEETDATE")}
              AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SUPPORT PACKAG'
        """, [date_from, date_to], [0, 0])

        pemasangan_count, pemasangan_amount = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM({mfsht_cost_expr})
            FROM MFSHT m
            WHERE {period_filter.format(field="m.SHEETDATE")}
              AND UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'LTK'
        """, [date_from, date_to], [0, 0])

        cur.execute(f"""
            SELECT FIRST 100
                ar.INVOICENO,
                ar.INVOICEDATE,
                ar.PURCHASEORDERNO,
                pd.NAME,
                ar.DESCRIPTION
            FROM ARINV ar
            LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) <> ''
              AND {period_filter.format(field="ar.INVOICEDATE")}
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO DESC
        """, [date_from, date_to])
        delivery_do_rows = [
            {
                "no": str(row[0] or "").strip(),
                "tanggal": str(row[1]) if row[1] else "",
                "no_po": str(row[2] or "").strip(),
                "nama": str(row[3] or "").strip(),
                "deskripsi": str(row[4] or "").strip(),
            }
            for row in cur.fetchall()
        ]

        def mfsht_history_rows(condition_sql):
            cur.execute(f"""
                SELECT FIRST 100
                    m.MFNO,
                    m.SHEETDATE,
                    m.DESCRIPTION,
                    m.FINISHED
                FROM MFSHT m
                WHERE {period_filter.format(field="m.SHEETDATE")}
                  AND {condition_sql}
                ORDER BY m.SHEETDATE DESC, m.MFNO DESC
            """, [date_from, date_to])
            return [
                {
                    "no": str(row[0] or "").strip(),
                    "tanggal": str(row[1]) if row[1] else "",
                    "deskripsi": str(row[2] or "").strip(),
                    "status": "Selesai" if int(row[3] or 0) else "Dalam Proses",
                }
                for row in cur.fetchall()
            ]

        gr_rows = mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) STARTING WITH 'GR'")
        sr_rows = mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SR'")
        packing_rows = mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'SUPPORT PACKAG'")
        pemasangan_rows = mfsht_history_rows("UPPER(TRIM(COALESCE(m.DESCRIPTION, ''))) CONTAINING 'LTK'")

        sales_amount_period = one(cur, f"""
            SELECT SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
        """, [date_from, date_to])

        current_from = datetime.strptime(date_from, "%Y-%m-%d").date()
        current_to = datetime.strptime(date_to, "%Y-%m-%d").date()
        period_days = max((current_to - current_from).days + 1, 1)
        prev_to = current_from - timedelta(days=1)
        prev_from = prev_to - timedelta(days=period_days - 1)
        first_this_month = current_from.replace(day=1)
        prev_month_to = first_this_month - timedelta(days=1)
        prev_month_from = prev_month_to.replace(day=1)
        prev_period_sales_amount = one(cur, f"""
            SELECT SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
        """, [prev_from.isoformat(), prev_to.isoformat()])
        target_month_from = current_from.replace(year=current_from.year - 1, day=1)
        if target_month_from.month == 12:
            target_next_month = target_month_from.replace(year=target_month_from.year + 1, month=1, day=1)
        else:
            target_next_month = target_month_from.replace(month=target_month_from.month + 1, day=1)
        target_month_to = target_next_month - timedelta(days=1)
        target_sales_amount = one(cur, f"""
            SELECT SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
        """, [target_month_from.isoformat(), target_month_to.isoformat()])
        target_source_label = f"DPP - diskon {target_month_from.strftime('%m/%Y')}"
        prev_so_count = one(cur, f"""
            SELECT COUNT(*)
            FROM SO so
            WHERE {period_filter.format(field="so.SODATE")}
        """, [prev_from.isoformat(), prev_to.isoformat()])

        line_closed_expr = _so_line_closed_expr(cur)
        so_where_sql, so_params = _so_where_clause("", date_from, date_to, "", line_closed_expr)

        cur.execute(f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN x.status_key = 'open' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'process' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'received' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'closed' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.has_do = 0 THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    y.SOID,
                    y.has_do,
                    CASE
                        WHEN y.header_closed <> 0 AND y.progress_qty < y.qty_order THEN 'closed'
                        WHEN y.progress_qty > 0 AND y.progress_qty < y.qty_order THEN 'process'
                        WHEN y.has_do <> 0 THEN 'received'
                        WHEN y.progress_qty <= 0 THEN 'open'
                        ELSE 'received'
                    END AS status_key
                FROM (
                    SELECT
                        so.SOID,
                        SUM(COALESCE(det.QUANTITY, 0)) AS qty_order,
                        SUM(COALESCE(det.QTYSHIPPED, 0)) AS qty_shipped,
                        SUM(CASE WHEN COALESCE(det.QTYSHIPPED, 0) > COALESCE(det.QUANTITY_TEMP, 0) THEN COALESCE(det.QTYSHIPPED, 0) ELSE COALESCE(det.QUANTITY_TEMP, 0) END) AS progress_qty,
                        SUM(CASE WHEN COALESCE(det.QTYSHIPPED, 0) <= 0 AND COALESCE(det.QUANTITY_TEMP, 0) < COALESCE(det.QUANTITY, 0) THEN 1 ELSE 0 END) AS zero_lines,
                        SUM(CASE WHEN COALESCE(det.QTYSHIPPED, 0) > 0 OR COALESCE(det.QUANTITY_TEMP, 0) >= COALESCE(det.QUANTITY, 0) THEN 1 ELSE 0 END) AS shipped_lines,
                        MAX(COALESCE(so.CLOSED, 0)) AS header_closed,
                        CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM ARINV arx
                                JOIN ARINVDET adx ON adx.ARINVOICEID = arx.ARINVOICEID
                                WHERE adx.SOID = so.SOID
                                  AND arx.DELIVERYORDER IS NOT NULL
                                  AND TRIM(arx.DELIVERYORDER) <> ''
                            ) THEN 1
                            ELSE 0
                        END AS has_do
                    {_SO_FROM}
                    WHERE {so_where_sql}
                    GROUP BY so.SOID
                ) y
            ) x
        """, so_params)
        so_status_row = cur.fetchone() or [0, 0, 0, 0, 0, 0]

        today = datetime.now().date()
        month_start = today.replace(day=1)
        month_from = month_start.isoformat()
        month_to = today.isoformat()
        month_so_where_sql, month_so_params = _so_where_clause("", month_from, month_to, "", line_closed_expr)

        cur.execute(f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN x.status_key = 'open' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'process' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'received' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'closed' THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    y.SOID,
                    CASE
                        WHEN y.header_closed <> 0 AND y.progress_qty < y.qty_order THEN 'closed'
                        WHEN y.progress_qty > 0 AND y.progress_qty < y.qty_order THEN 'process'
                        WHEN y.has_do <> 0 THEN 'received'
                        WHEN y.progress_qty <= 0 THEN 'open'
                        ELSE 'received'
                    END AS status_key
                FROM (
                    SELECT
                        so.SOID,
                        SUM(COALESCE(det.QUANTITY, 0)) AS qty_order,
                        SUM(COALESCE(det.QTYSHIPPED, 0)) AS qty_shipped,
                        SUM(CASE WHEN COALESCE(det.QTYSHIPPED, 0) > COALESCE(det.QUANTITY_TEMP, 0) THEN COALESCE(det.QTYSHIPPED, 0) ELSE COALESCE(det.QUANTITY_TEMP, 0) END) AS progress_qty,
                        SUM(CASE WHEN COALESCE(det.QTYSHIPPED, 0) <= 0 AND COALESCE(det.QUANTITY_TEMP, 0) < COALESCE(det.QUANTITY, 0) THEN 1 ELSE 0 END) AS zero_lines,
                        SUM(CASE WHEN COALESCE(det.QTYSHIPPED, 0) > 0 OR COALESCE(det.QUANTITY_TEMP, 0) >= COALESCE(det.QUANTITY, 0) THEN 1 ELSE 0 END) AS shipped_lines,
                        MAX(COALESCE(so.CLOSED, 0)) AS header_closed,
                        CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM ARINV arx
                                JOIN ARINVDET adx ON adx.ARINVOICEID = arx.ARINVOICEID
                                WHERE adx.SOID = so.SOID
                                  AND arx.DELIVERYORDER IS NOT NULL
                                  AND TRIM(arx.DELIVERYORDER) <> ''
                            ) THEN 1
                            ELSE 0
                        END AS has_do
                    {_SO_FROM}
                    WHERE {month_so_where_sql}
                    GROUP BY so.SOID
                ) y
            ) x
        """, month_so_params)
        so_month_status_row = cur.fetchone() or [0, 0, 0, 0, 0]

        cur.execute("""
            SELECT
                COUNT(*),
                SUM(CASE WHEN x.so_count >= 2 THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.previous_so_count = 0 THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    so.CUSTOMERID,
                    COUNT(DISTINCT so.SOID) AS so_count,
                    (
                        SELECT COUNT(*)
                        FROM SO prev_so
                        WHERE prev_so.CUSTOMERID = so.CUSTOMERID
                          AND prev_so.SODATE < CAST(? AS DATE)
                    ) AS previous_so_count
                FROM SO so
                WHERE so.CUSTOMERID IS NOT NULL
                  AND so.SODATE >= CAST(? AS DATE)
                  AND so.SODATE <= CAST(? AS DATE)
                GROUP BY so.CUSTOMERID
            ) x
        """, [month_from, month_from, month_to])
        so_frequency_row = cur.fetchone() or [0, 0, 0]

        monthly_so_invoice_from = """
            FROM SO so
            JOIN ARINVDET do_det ON do_det.SOID = so.SOID
            JOIN ARINV do_doc ON do_doc.ARINVOICEID = do_det.ARINVOICEID
            JOIN ARINV inv ON inv.CUSTOMERID = do_doc.CUSTOMERID
              AND inv.PURCHASEORDERNO = do_doc.PURCHASEORDERNO
              AND inv.GETFROMDO = 1
              AND inv.INVOICETYPE = 1
              AND (inv.ISDP IS NULL OR inv.ISDP = 0)
            WHERE do_doc.DELIVERYORDER IS NOT NULL
              AND TRIM(CAST(do_doc.DELIVERYORDER AS VARCHAR(32))) <> ''
              AND so.SODATE >= CAST(? AS DATE)
              AND so.SODATE <= CAST(? AS DATE)
        """
        monthly_invoiced_so, monthly_paid_so = row_values(cur, f"""
            SELECT
                COUNT(DISTINCT so.SOID),
                COUNT(DISTINCT CASE
                    WHEN COALESCE(inv.PAIDAMOUNT, 0) > 0 THEN so.SOID
                END)
            {monthly_so_invoice_from}
        """, [month_from, month_to], [0, 0])
        (
            monthly_invoice_count,
            monthly_invoiced_amount,
            monthly_paid_amount,
            monthly_paid_invoice_count,
        ) = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM(x.INVOICEAMOUNT),
                SUM(x.PAIDAMOUNT),
                SUM(CASE WHEN x.PAIDAMOUNT > 0 THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    inv.ARINVOICEID,
                    MAX(COALESCE(inv.INVOICEAMOUNT, 0)) AS INVOICEAMOUNT,
                    MAX(COALESCE(inv.PAIDAMOUNT, 0)) AS PAIDAMOUNT
                {monthly_so_invoice_from}
                GROUP BY inv.ARINVOICEID
            ) x
        """, [month_from, month_to], [0, 0, 0, 0])

        on_time_do, linked_do = row_values(cur, f"""
            SELECT
                COUNT(DISTINCT CASE
                    WHEN so.ESTSHIPDATE IS NOT NULL
                     AND ar.INVOICEDATE <= so.ESTSHIPDATE
                    THEN ar.ARINVOICEID
                END),
                COUNT(DISTINCT ar.ARINVOICEID)
            FROM ARINV ar
            JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            JOIN SO so ON so.SOID = det.SOID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(ar.DELIVERYORDER) <> ''
              AND {period_filter.format(field="ar.INVOICEDATE")}
        """, [date_from, date_to], [0, 0])
        on_time_delivery_pct = round((float(on_time_do or 0) / float(linked_do or 0) * 100), 1) if linked_do else 0

        cur.execute(f"""
            SELECT FIRST 3
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                SUM(COALESCE(det.QUANTITY, 0)) AS total_qty,
                SUM({sales_amount_expr}) AS sales_amount
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
            GROUP BY det.ITEMNO, COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION)
            ORDER BY 4 DESC
        """, [date_from, date_to])
        top_products = [
            {
                "itemno": str(row[0] or "").strip(),
                "description": str(row[1] or "").strip(),
                "qty": float(row[2] or 0),
                "amount": float(row[3] or 0),
            }
            for row in cur.fetchall()
        ]

        cur.execute(f"""
            SELECT FIRST 3
                x.ITEMNO,
                x.ITEMDESCRIPTION,
                x.ORDER_COUNT,
                x.TOTAL_QTY,
                x.SALES_AMOUNT
            FROM (
                SELECT
                    det.ITEMNO,
                    COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION) AS ITEMDESCRIPTION,
                    COUNT(DISTINCT so.SOID) AS ORDER_COUNT,
                    SUM(COALESCE(det.QUANTITY, 0)) AS TOTAL_QTY,
                    SUM({sales_line_subtotal_expr}) AS SALES_AMOUNT
                FROM SO so
                LEFT JOIN SODET det ON det.SOID = so.SOID
                LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
                WHERE det.ITEMNO IS NOT NULL
                  AND {period_filter.format(field="so.SODATE")}
                GROUP BY det.ITEMNO, COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION)
            ) x
            ORDER BY x.ORDER_COUNT DESC, x.SALES_AMOUNT DESC
        """, [date_from, date_to])
        top_qty_products = [
            {
                "itemno": str(row[0] or "").strip(),
                "description": str(row[1] or "").strip(),
                "order_count": int(row[2] or 0),
                "qty": float(row[3] or 0),
                "amount": float(row[4] or 0),
            }
            for row in cur.fetchall()
        ]
        top_qty_product = top_qty_products[0] if top_qty_products else {
            "itemno": "",
            "description": "",
            "order_count": 0,
            "qty": 0,
            "amount": 0,
        }

        cur.execute(f"""
            SELECT FIRST 3
                pd.ID,
                pd.PERSONNO,
                pd.NAME,
                COUNT(DISTINCT so.SOID),
                SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
            GROUP BY pd.ID, pd.PERSONNO, pd.NAME
            ORDER BY 5 DESC
        """, [date_from, date_to])
        top_customers = [
            {
                "customer_id": int(row[0] or 0),
                "customerno": str(row[1] or "").strip(),
                "name": str(row[2] or "").strip(),
                "so_count": int(row[3] or 0),
                "amount": float(row[4] or 0),
            }
            for row in cur.fetchall()
        ]

        cur.execute(f"""
            SELECT FIRST 5
                sm.SALESMANID,
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman'),
                COUNT(DISTINCT so.SOID),
                SUM(COALESCE(det.QUANTITY, 0)),
                SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
            GROUP BY sm.SALESMANID, COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman')
            ORDER BY 5 DESC, 3 DESC
        """, [date_from, date_to])
        top_salesmen = [
            {
                "salesman_id": int(row[0] or 0),
                "name": str(row[1] or "").strip(),
                "so_count": int(row[2] or 0),
                "qty": float(row[3] or 0),
                "amount": float(row[4] or 0),
            }
            for row in cur.fetchall()
        ]

        salesman_yearly = []
        marketing_customer_yearly = []
        if not fast_mode:
            salesman_year = current_to.year
            salesman_current_month = current_to.month
            salesman_from = current_to.replace(year=salesman_year - 1, month=1, day=1)
            cur.execute(f"""
                SELECT
                    so.SALESMANID,
                    COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman'),
                    EXTRACT(YEAR FROM so.SODATE),
                    EXTRACT(MONTH FROM so.SODATE),
                    COUNT(DISTINCT so.SOID),
                    SUM(COALESCE(det.QUANTITY, 0)),
                    SUM({sales_amount_expr})
                FROM SO so
                LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
                LEFT JOIN SODET det ON det.SOID = so.SOID
                WHERE det.ITEMNO IS NOT NULL
                  AND COALESCE(sm.SUSPENDED, 0) = 0
                  AND so.SODATE >= ?
                  AND so.SODATE <= ?
                GROUP BY
                    so.SALESMANID,
                    COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman'),
                    EXTRACT(YEAR FROM so.SODATE),
                    EXTRACT(MONTH FROM so.SODATE)
                ORDER BY 7 DESC
            """, [salesman_from.isoformat(), current_to.isoformat()])
            salesman_sales_rows = cur.fetchall()
            cur.execute("""
                SELECT
                    sm.SALESMANID,
                    COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman')
                FROM SALESMAN sm
                WHERE sm.SALESMANID IS NOT NULL
                  AND COALESCE(sm.SUSPENDED, 0) = 0
            """)
            active_salesman_names = {
                str(row[0]): str(row[1] or "Tanpa Salesman").strip()
                for row in cur.fetchall()
            }
            salesman_map = {}
            for row in salesman_sales_rows:
                salesman_key = str(row[0] if row[0] is not None else "none")
                if salesman_key not in active_salesman_names:
                    continue
                salesman_data = salesman_map.setdefault(salesman_key, {
                    "id": salesman_key,
                    "name": active_salesman_names.get(salesman_key) or str(row[1] or "Tanpa Salesman").strip(),
                    "raw_months": {},
                })
                month_key = f"{int(row[2])}-{int(row[3])}"
                salesman_data["raw_months"][month_key] = {
                    "so_count": int(row[4] or 0),
                    "qty": float(row[5] or 0),
                    "amount": float(row[6] or 0),
                }

            salesman_target_map = get_salesman_targets(salesman_year)
            for target_item in salesman_target_map.values():
                target_id = str(target_item.get("salesman_id") or "")
                if target_id and target_id in active_salesman_names and target_id not in salesman_map:
                    salesman_map[target_id] = {
                        "id": target_id,
                        "name": active_salesman_names[target_id],
                        "raw_months": {},
                    }
            for salesman_data in salesman_map.values():
                months = []
                total_actual = 0.0
                total_target = 0.0
                total_previous_actual = 0.0
                total_so = 0
                total_qty = 0.0
                for month in range(1, salesman_current_month + 1):
                    current_key = f"{salesman_year}-{month}"
                    previous_key = f"{salesman_year - 1}-{month}"
                    current_month_data = salesman_data["raw_months"].get(current_key, {})
                    previous_month_data = salesman_data["raw_months"].get(previous_key, {})
                    actual = float(current_month_data.get("amount") or 0)
                    previous_actual = float(previous_month_data.get("amount") or 0)
                    target_data = salesman_target_map.get(int(salesman_data["id"])) if str(salesman_data["id"]).isdigit() else {}
                    target = float((target_data.get("targets") or {}).get(month, 0) or 0)
                    so_count_month = int(current_month_data.get("so_count") or 0)
                    qty_month = float(current_month_data.get("qty") or 0)
                    achievement_pct = round((actual / target * 100), 1) if target else (100 if actual > 0 else 0)
                    previous_achievement_pct = round((actual / previous_actual * 100), 1) if previous_actual else (100 if actual > 0 else 0)
                    months.append({
                        "month": month,
                        "actual": actual,
                        "target": target,
                        "previous_actual": previous_actual,
                        "achievement_pct": achievement_pct,
                        "previous_achievement_pct": previous_achievement_pct,
                        "so_count": so_count_month,
                        "qty": qty_month,
                    })
                    total_actual += actual
                    total_target += target
                    total_previous_actual += previous_actual
                    total_so += so_count_month
                    total_qty += qty_month
                salesman_yearly.append({
                    "id": salesman_data["id"],
                    "name": salesman_data["name"],
                    "year": salesman_year,
                    "months": months,
                    "total_actual": total_actual,
                    "total_target": total_target,
                    "total_previous_actual": total_previous_actual,
                    "achievement_pct": round((total_actual / total_target * 100), 1) if total_target else (100 if total_actual > 0 else 0),
                    "previous_achievement_pct": round((total_actual / total_previous_actual * 100), 1) if total_previous_actual else (100 if total_actual > 0 else 0),
                    "gap_amount": total_actual - total_target,
                    "previous_gap_amount": total_actual - total_previous_actual,
                    "so_count": total_so,
                    "qty": total_qty,
                })
            salesman_yearly.sort(key=lambda row: row["total_actual"], reverse=True)

            comparison_year = current_to.year
            previous_year = comparison_year - 1
            current_ytd_from = current_to.replace(month=1, day=1)
            previous_year_from = current_to.replace(year=previous_year, month=1, day=1)
            previous_year_to = current_to.replace(year=previous_year, month=12, day=31)

            cur.execute("""
                SELECT
                    pd.ID,
                    pd.PERSONNO,
                    pd.NAME,
                    pd.SALESMANID,
                    COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman')
                FROM PERSONDATA pd
                LEFT JOIN SALESMAN sm ON sm.SALESMANID = pd.SALESMANID
                WHERE pd.PERSONTYPE = 0
                  AND COALESCE(pd.SUSPENDED, 0) = 0
            """)
            marketing_map = {}
            customer_lookup = {}
            customer_target_map = get_salesman_targets(comparison_year)
            for customer_id, customer_no, customer_name, salesman_id, salesman_name in cur.fetchall():
                salesman_key = str(salesman_id if salesman_id is not None else "none")
                target_data = customer_target_map.get(int(salesman_id or 0), {}) if salesman_id is not None else {}
                monthly_targets = {
                    month: float((target_data.get("targets") or {}).get(month, 0) or 0)
                    for month in range(1, 13)
                }
                marketing = marketing_map.setdefault(salesman_key, {
                    "id": salesman_key,
                    "name": str(salesman_name or "Tanpa Salesman").strip() or "Tanpa Salesman",
                    "year": comparison_year,
                    "previous_year": previous_year,
                    "current_from": current_ytd_from.isoformat(),
                    "current_to": current_to.isoformat(),
                    "previous_from": previous_year_from.isoformat(),
                    "previous_to": previous_year_to.isoformat(),
                    "targets": monthly_targets,
                    "target_ytd": sum(monthly_targets.get(month, 0) for month in range(1, current_to.month + 1)),
                    "target_year_total": sum(monthly_targets.values()),
                    "customers": {},
                })
                customer_key = int(customer_id or 0)
                customer = {
                    "customer_id": customer_key,
                    "customer_no": str(customer_no or "").strip(),
                    "customer_name": str(customer_name or "Tanpa Customer").strip() or "Tanpa Customer",
                    "previous_amount": 0.0,
                    "current_amount": 0.0,
                    "previous_so_count": 0,
                    "current_so_count": 0,
                    "previous_qty": 0.0,
                    "current_qty": 0.0,
                }
                marketing["customers"][customer_key] = customer
                customer_lookup[customer_key] = customer

            for target_item in customer_target_map.values():
                target_id = str(target_item.get("salesman_id") or "")
                if not target_id or target_id in marketing_map or target_id not in active_salesman_names:
                    continue
                monthly_targets = {
                    month: float((target_item.get("targets") or {}).get(month, 0) or 0)
                    for month in range(1, 13)
                }
                marketing_map[target_id] = {
                    "id": target_id,
                    "name": active_salesman_names[target_id],
                    "year": comparison_year,
                    "previous_year": previous_year,
                    "current_from": current_ytd_from.isoformat(),
                    "current_to": current_to.isoformat(),
                    "previous_from": previous_year_from.isoformat(),
                    "previous_to": previous_year_to.isoformat(),
                    "targets": monthly_targets,
                    "target_ytd": sum(monthly_targets.get(month, 0) for month in range(1, current_to.month + 1)),
                    "target_year_total": sum(monthly_targets.values()),
                    "customers": {},
                }

            cur.execute("""
                SELECT
                    pd.SALESMANID,
                    COUNT(*)
                FROM PERSONDATA pd
                WHERE pd.PERSONTYPE = 0
                  AND COALESCE(pd.SUSPENDED, 0) <> 0
                GROUP BY pd.SALESMANID
            """)
            inactive_customer_count_map = {
                str(salesman_id if salesman_id is not None else "none"): int(customer_count or 0)
                for salesman_id, customer_count in cur.fetchall()
            }

            def apply_customer_sales_period(period_key, period_start, period_end):
                cur.execute(f"""
                    SELECT
                        so.CUSTOMERID,
                        COUNT(DISTINCT so.SOID),
                        SUM(COALESCE(det.QUANTITY, 0)),
                        SUM({sales_amount_expr})
                    FROM SO so
                    JOIN SODET det ON det.SOID = so.SOID
                    WHERE det.ITEMNO IS NOT NULL
                      AND so.CUSTOMERID IS NOT NULL
                      AND so.SODATE >= ?
                      AND so.SODATE <= ?
                    GROUP BY so.CUSTOMERID
                """, [period_start, period_end])
                for customer_id, so_count, qty, amount in cur.fetchall():
                    customer = customer_lookup.get(int(customer_id or 0))
                    if not customer:
                        continue
                    customer[f"{period_key}_amount"] = float(amount or 0)
                    customer[f"{period_key}_so_count"] = int(so_count or 0)
                    customer[f"{period_key}_qty"] = float(qty or 0)

            apply_customer_sales_period("previous", previous_year_from.isoformat(), previous_year_to.isoformat())
            apply_customer_sales_period("current", current_ytd_from.isoformat(), current_to.isoformat())

            for marketing in marketing_map.values():
                customers = []
                total_previous = 0.0
                total_current = 0.0
                achieved_count = 0
                progress_count = 0
                zero_with_previous_count = 0
                new_sales_count = 0
                previous_order_customer_count = 0
                current_order_customer_count = 0
                for customer in marketing["customers"].values():
                    previous_amount = float(customer.get("previous_amount") or 0)
                    current_amount = float(customer.get("current_amount") or 0)
                    if int(customer.get("previous_so_count") or 0) > 0:
                        previous_order_customer_count += 1
                    if int(customer.get("current_so_count") or 0) > 0:
                        current_order_customer_count += 1
                    diff_amount = current_amount - previous_amount
                    diff_pct = round((diff_amount / previous_amount * 100), 1) if previous_amount else (100 if current_amount > 0 else 0)
                    achievement_pct = round((current_amount / previous_amount * 100), 1) if previous_amount else (100 if current_amount > 0 else 0)
                    if previous_amount > 0 and current_amount >= previous_amount:
                        status = "Achieved"
                        achieved_count += 1
                    elif previous_amount > 0 and current_amount > 0:
                        status = "Progress"
                        progress_count += 1
                    elif previous_amount > 0:
                        status = "Belum Ada Sales"
                        zero_with_previous_count += 1
                    elif current_amount > 0:
                        status = "New Sales"
                        new_sales_count += 1
                    else:
                        status = "Tidak Ada Sales"
                    customer.update({
                        "diff_amount": diff_amount,
                        "diff_pct": diff_pct,
                        "achievement_pct": achievement_pct,
                        "status": status,
                    })
                    total_previous += previous_amount
                    total_current += current_amount
                    customers.append(customer)

                total_diff = total_current - total_previous
                target_ytd = float(marketing.get("target_ytd") or 0)
                target_gap = total_current - target_ytd
                marketing_customer_yearly.append({
                    "id": marketing["id"],
                    "name": marketing["name"],
                    "year": marketing["year"],
                    "previous_year": marketing["previous_year"],
                    "current_from": marketing["current_from"],
                    "current_to": marketing["current_to"],
                    "previous_from": marketing["previous_from"],
                    "previous_to": marketing["previous_to"],
                    "targets": marketing.get("targets") or {},
                    "target_ytd": target_ytd,
                    "target_year_total": float(marketing.get("target_year_total") or 0),
                    "target_achievement_pct": round((total_current / target_ytd * 100), 1) if target_ytd else (100 if total_current > 0 else 0),
                    "target_gap_amount": target_gap,
                    "customer_count": len(customers),
                    "active_customer_count": len(customers),
                    "inactive_customer_count": inactive_customer_count_map.get(marketing["id"], 0),
                    "previous_order_customer_count": previous_order_customer_count,
                    "current_order_customer_count": current_order_customer_count,
                    "current_no_order_customer_count": len(customers) - current_order_customer_count,
                    "previous_amount": total_previous,
                    "current_amount": total_current,
                    "diff_amount": total_diff,
                    "diff_pct": round((total_diff / total_previous * 100), 1) if total_previous else (100 if total_current > 0 else 0),
                    "achievement_pct": round((total_current / total_previous * 100), 1) if total_previous else (100 if total_current > 0 else 0),
                    "achieved_count": achieved_count,
                    "progress_count": progress_count,
                    "zero_with_previous_count": zero_with_previous_count,
                    "new_sales_count": new_sales_count,
                    "customers": sorted(
                        customers,
                        key=lambda item: (
                            item.get("status") != "Belum Ada Sales",
                            -float(item.get("previous_amount") or 0),
                            str(item.get("customer_name") or ""),
                        ),
                    ),
                })
            marketing_customer_yearly.sort(key=lambda row: row["current_amount"], reverse=True)

        cur.execute(f"""
            SELECT FIRST 6
                CASE
                    WHEN NULLIF(TRIM(i.RESERVED9), '') IS NULL
                         OR (
                            UPPER(TRIM(i.RESERVED9)) CONTAINING 'TANPA'
                            AND UPPER(TRIM(i.RESERVED9)) CONTAINING 'CATEGORY'
                         )
                    THEN 'NON GTE'
                    ELSE TRIM(i.RESERVED9)
                END,
                SUM(COALESCE(det.QUANTITY, 0)),
                SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
            GROUP BY CASE
                WHEN NULLIF(TRIM(i.RESERVED9), '') IS NULL
                     OR (
                        UPPER(TRIM(i.RESERVED9)) CONTAINING 'TANPA'
                        AND UPPER(TRIM(i.RESERVED9)) CONTAINING 'CATEGORY'
                     )
                THEN 'NON GTE'
                ELSE TRIM(i.RESERVED9)
            END
            ORDER BY 2 DESC, 3 DESC
        """, [date_from, date_to])
        sold_by_category = [
            {
                "label": str(row[0] or "").strip(),
                "qty": float(row[1] or 0),
                "amount": float(row[2] or 0),
            }
            for row in cur.fetchall()
        ]

        cur.execute(f"""
            SELECT FIRST 6
                COALESCE(NULLIF(TRIM(i.RESERVED8), ''), 'Tanpa Code Product'),
                SUM(COALESCE(det.QUANTITY, 0)),
                SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE det.ITEMNO IS NOT NULL
              AND {period_filter.format(field="so.SODATE")}
            GROUP BY COALESCE(NULLIF(TRIM(i.RESERVED8), ''), 'Tanpa Code Product')
            ORDER BY 2 DESC, 3 DESC
        """, [date_from, date_to])
        sold_by_code_product = [
            {
                "label": str(row[0] or "").strip(),
                "qty": float(row[1] or 0),
                "amount": float(row[2] or 0),
            }
            for row in cur.fetchall()
        ]

        cur.execute("""
            SELECT
                COALESCE(NULLIF(TRIM(pd.STATEPROV), ''), 'Belum diinput') AS PROVINCE_NAME,
                COALESCE(NULLIF(TRIM(pd.CITY), ''), 'Belum diinput') AS CITY_NAME,
                COUNT(*) AS CUSTOMER_COUNT
            FROM PERSONDATA pd
            WHERE pd.PERSONTYPE = 0
            GROUP BY
                COALESCE(NULLIF(TRIM(pd.STATEPROV), ''), 'Belum diinput'),
                COALESCE(NULLIF(TRIM(pd.CITY), ''), 'Belum diinput')
            ORDER BY 1 ASC, 3 DESC, 2 ASC
        """)
        customer_province_map = {}
        for row in cur.fetchall():
            province_name = str(row[0] or "Belum diinput").strip() or "Belum diinput"
            city_name = str(row[1] or "Belum diinput").strip() or "Belum diinput"
            customer_count = int(row[2] or 0)
            province_entry = customer_province_map.setdefault(province_name, {
                "province": province_name,
                "count": 0,
                "cities": [],
                "is_empty": province_name.lower() == "belum diinput",
            })
            province_entry["count"] += customer_count
            province_entry["cities"].append({
                "city": city_name,
                "count": customer_count,
                "is_empty": city_name.lower() == "belum diinput",
            })
        customer_cities = sorted(
            customer_province_map.values(),
            key=lambda item: (1 if item.get("is_empty") else 0, -item.get("count", 0), item.get("province", "")),
        )

        cur.execute(f"""
            SELECT
                pd.NAME,
                sm.SALESMANID,
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing'),
                ar.INVOICENO,
                ar.PURCHASEORDERNO,
                COALESCE(
                    (SELECT FIRST 1 so1.SONO
                     FROM ARINV do2
                     JOIN ARINVDET det2 ON det2.ARINVOICEID = do2.ARINVOICEID
                     JOIN SO so1        ON so1.SOID = det2.SOID
                     WHERE do2.CUSTOMERID      = ar.CUSTOMERID
                       AND do2.PURCHASEORDERNO = ar.PURCHASEORDERNO
                       AND do2.DELIVERYORDER   = 1
                       AND do2.INVOICETYPE     = 1
                    ORDER BY do2.INVOICEDATE DESC),
                    ar.PURCHASEORDERNO
                ) AS NO_PESANAN,
                ar.OWING,
                ar.INVOICEDATE + COALESCE(term.NETDAYS, 0) AS DUE_DATE,
                CAST(? AS DATE) - (ar.INVOICEDATE + COALESCE(term.NETDAYS, 0)) AS OVERDUE_DAYS
            FROM ARINV ar
            LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = ar.SALESMANID
            LEFT JOIN TERMOPMT term ON term.TERMID = ar.TERMSID
            WHERE ar.DELIVERYORDER = '0'
              AND ar.INVOICETYPE = 1
              AND (ar.ISDP IS NULL OR ar.ISDP = 0)
              AND COALESCE(ar.OWING, 0) > 0
              AND ar.INVOICEDATE <= CAST(? AS DATE)
            ORDER BY ar.INVOICEDATE + COALESCE(term.NETDAYS, 0), ar.OWING DESC
        """, [date_to, date_to])
        outstanding_receivables = []
        receivable_aging_map = {
            "0_30": {"range": "0 - 30 hari", "amount": 0.0, "invoice_count": 0, "customers": []},
            "31_60": {"range": "31 - 60 hari", "amount": 0.0, "invoice_count": 0, "customers": []},
            "61_90": {"range": "61 - 90 hari", "amount": 0.0, "invoice_count": 0, "customers": []},
            "gt_90": {"range": "> 90 hari", "amount": 0.0, "invoice_count": 0, "customers": []},
        }
        receivable_customer_maps = {key: {} for key in receivable_aging_map}
        for row in cur.fetchall():
            overdue_days = int(row[8] or 0)
            aging_days = max(overdue_days, 0)
            if aging_days > 90:
                aging_key = "gt_90"
            elif aging_days > 60:
                aging_key = "61_90"
            elif aging_days > 30:
                aging_key = "31_60"
            else:
                aging_key = "0_30"
            owing_amount = float(row[6] or 0)
            customer_name = str(row[0] or "Tanpa Customer").strip() or "Tanpa Customer"
            salesman_id = int(row[1] or 0)
            salesman_name = str(row[2] or "Tanpa Marketing").strip() or "Tanpa Marketing"
            no_invoice = str(row[3] or "").strip()
            no_po = str(row[4] or "").strip()
            no_pesanan = str(row[5] or "").strip()
            due_date = str(row[7]) if row[7] else ""
            receivable_aging_map[aging_key]["amount"] += owing_amount
            receivable_aging_map[aging_key]["invoice_count"] += 1
            customer_entry = receivable_customer_maps[aging_key].setdefault(customer_name, {
                "customer": customer_name,
                "amount": 0.0,
                "invoice_count": 0,
                "po_count": 0,
                "pos": [],
                "_po_seen": set(),
            })
            customer_entry["amount"] += owing_amount
            customer_entry["invoice_count"] += 1
            po_key = no_po or no_pesanan or no_invoice
            if po_key not in customer_entry["_po_seen"]:
                customer_entry["_po_seen"].add(po_key)
                customer_entry["po_count"] += 1
            customer_entry["pos"].append({
                "no_po": no_po,
                "no_pesanan": no_pesanan,
                "no_faktur": no_invoice,
                "salesman_id": salesman_id,
                "salesman_name": salesman_name,
                "amount": owing_amount,
                "due_date": due_date,
                "overdue_days": overdue_days,
            })

            if overdue_days > 0:
                status_label = f"Jatuh tempo {overdue_days} hari"
                status = "overdue"
            elif overdue_days == 0:
                status_label = "Jatuh tempo hari ini"
                status = "today"
            else:
                status_label = f"{abs(overdue_days)} hari lagi"
                status = "upcoming"
            if len(outstanding_receivables) < 5:
                outstanding_receivables.append({
                    "customer": customer_name,
                    "no_po": no_po,
                    "no_pesanan": no_pesanan,
                    "amount": owing_amount,
                    "due_date": due_date,
                    "overdue_days": overdue_days,
                    "status": status,
                    "status_label": status_label,
                })
        for aging_key, customer_map in receivable_customer_maps.items():
            customers = []
            for customer in customer_map.values():
                customer.pop("_po_seen", None)
                customer["amount"] = round(customer["amount"], 2)
                customer["pos"].sort(key=lambda item: item.get("amount", 0), reverse=True)
                customers.append(customer)
            customers.sort(key=lambda item: item.get("amount", 0), reverse=True)
            receivable_aging_map[aging_key]["customers"] = customers
        receivable_aging = [
            {"key": key, **value}
            for key, value in receivable_aging_map.items()
        ]

        cur.execute(f"""
            SELECT FIRST 5
                pd.NAME,
                COUNT(*),
                SUM(ar.OWING),
                MAX(CAST(? AS DATE) - (ar.INVOICEDATE + COALESCE(term.NETDAYS, 0)))
            FROM ARINV ar
            LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
            LEFT JOIN TERMOPMT term ON term.TERMID = ar.TERMSID
            WHERE ar.DELIVERYORDER = '0'
              AND ar.INVOICETYPE = 1
              AND (ar.ISDP IS NULL OR ar.ISDP = 0)
              AND COALESCE(ar.OWING, 0) > 0
              AND ar.INVOICEDATE <= CAST(? AS DATE)
            GROUP BY pd.NAME
            ORDER BY 4 DESC, 3 DESC
        """, [date_to, date_to])
        receivables_by_customer = []
        for row in cur.fetchall():
            oldest_days = int(row[3] or 0)
            if oldest_days > 365:
                urgency = "> 1 tahun"
            elif oldest_days > 30:
                urgency = "> 30 hari"
            elif oldest_days > 0:
                urgency = "< 30 hari"
            else:
                urgency = "belum tempo"
            receivables_by_customer.append({
                "customer": str(row[0] or "").strip(),
                "invoice_count": int(row[1] or 0),
                "amount": float(row[2] or 0),
                "oldest_days": oldest_days,
                "urgency": urgency,
            })

        sales_receivables_by_salesman = []
        if not fast_mode:
            cur.execute(f"""
                SELECT
                    COALESCE(ar.SALESMANID, pd.SALESMANID, 0) AS SALESMAN_ID,
                    COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing') AS SALESMAN_NAME,
                    pd.ID AS CUSTOMER_ID,
                    pd.PERSONNO,
                    pd.NAME,
                    ar.ARINVOICEID,
                    ar.INVOICENO,
                    ar.INVOICEDATE,
                    ar.PURCHASEORDERNO,
                    (SELECT FIRST 1 do1.INVOICENO
                     FROM ARINV do1
                     WHERE do1.CUSTOMERID      = ar.CUSTOMERID
                       AND do1.PURCHASEORDERNO = ar.PURCHASEORDERNO
                       AND do1.DELIVERYORDER   = 1
                       AND do1.INVOICETYPE     = 1
                     ORDER BY do1.INVOICEDATE DESC) AS NO_PENGIRIMAN,
                    COALESCE(
                        (SELECT FIRST 1 so1.SONO
                         FROM ARINV do2
                         JOIN ARINVDET det2 ON det2.ARINVOICEID = do2.ARINVOICEID
                         JOIN SO so1        ON so1.SOID = det2.SOID
                         WHERE do2.CUSTOMERID      = ar.CUSTOMERID
                           AND do2.PURCHASEORDERNO = ar.PURCHASEORDERNO
                           AND do2.DELIVERYORDER   = 1
                           AND do2.INVOICETYPE     = 1
                         ORDER BY do2.INVOICEDATE DESC),
                        ar.PURCHASEORDERNO
                    ) AS NO_PESANAN,
                    ar.INVOICEAMOUNT,
                    ar.PAIDAMOUNT,
                    ar.OWING,
                    ar.INVOICEDATE + COALESCE(term.NETDAYS, 0) AS DUE_DATE,
                    CAST(? AS DATE) - (ar.INVOICEDATE + COALESCE(term.NETDAYS, 0)) AS OVERDUE_DAYS
                FROM ARINV ar
                LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
                LEFT JOIN SALESMAN sm ON sm.SALESMANID = COALESCE(ar.SALESMANID, pd.SALESMANID, 0)
                LEFT JOIN TERMOPMT term ON term.TERMID = ar.TERMSID
                WHERE ar.DELIVERYORDER = '0'
                  AND ar.INVOICETYPE = 1
                  AND (ar.ISDP IS NULL OR ar.ISDP = 0)
                  AND COALESCE(ar.OWING, 0) > 0
                  AND ar.INVOICEDATE <= CAST(? AS DATE)
                ORDER BY SALESMAN_NAME, pd.NAME, ar.INVOICEDATE + COALESCE(term.NETDAYS, 0), ar.OWING DESC
            """, [date_to, date_to])
            receivable_sales_map = {}
            for row in cur.fetchall():
                salesman_id = int(row[0] or 0)
                salesman_name = str(row[1] or "Tanpa Marketing").strip() or "Tanpa Marketing"
                customer_id = int(row[2] or 0)
                customer_no = str(row[3] or "").strip()
                customer_name = str(row[4] or "Tanpa Customer").strip() or "Tanpa Customer"
                invoice_id = int(row[5] or 0)
                no_invoice = str(row[6] or "").strip()
                invoice_date = str(row[7]) if row[7] else ""
                no_po = str(row[8] or "").strip()
                no_pengiriman = str(row[9] or "").strip()
                no_pesanan = str(row[10] or "").strip()
                invoice_amount = float(row[11] or 0)
                paid_amount = float(row[12] or 0)
                owing_amount = float(row[13] or 0)
                due_date = str(row[14]) if row[14] else ""
                overdue_days = int(row[15] or 0)
                is_due = overdue_days >= 0
                po_key = no_po or no_pesanan or no_invoice or str(invoice_id)

                sales_key = str(salesman_id)
                sales_entry = receivable_sales_map.setdefault(sales_key, {
                    "salesman_id": salesman_id,
                    "salesman_name": salesman_name,
                    "amount": 0.0,
                    "due_amount": 0.0,
                    "not_due_amount": 0.0,
                    "invoice_count": 0,
                    "due_invoice_count": 0,
                    "not_due_invoice_count": 0,
                    "po_count": 0,
                    "customer_count": 0,
                    "oldest_overdue_days": 0,
                    "customers": {},
                    "_po_seen": set(),
                })
                customer_key = str(customer_id or customer_name)
                customer_entry = sales_entry["customers"].setdefault(customer_key, {
                    "customer_id": customer_id,
                    "customer_no": customer_no,
                    "customer_name": customer_name,
                    "amount": 0.0,
                    "due_amount": 0.0,
                    "not_due_amount": 0.0,
                    "invoice_count": 0,
                    "due_invoice_count": 0,
                    "not_due_invoice_count": 0,
                    "po_count": 0,
                    "oldest_overdue_days": 0,
                    "invoices": [],
                    "_po_seen": set(),
                })

                sales_entry["amount"] += owing_amount
                customer_entry["amount"] += owing_amount
                sales_entry["invoice_count"] += 1
                customer_entry["invoice_count"] += 1
                if po_key not in sales_entry["_po_seen"]:
                    sales_entry["_po_seen"].add(po_key)
                    sales_entry["po_count"] += 1
                if po_key not in customer_entry["_po_seen"]:
                    customer_entry["_po_seen"].add(po_key)
                    customer_entry["po_count"] += 1
                if is_due:
                    sales_entry["due_amount"] += owing_amount
                    customer_entry["due_amount"] += owing_amount
                    sales_entry["due_invoice_count"] += 1
                    customer_entry["due_invoice_count"] += 1
                    sales_entry["oldest_overdue_days"] = max(sales_entry["oldest_overdue_days"], overdue_days)
                    customer_entry["oldest_overdue_days"] = max(customer_entry["oldest_overdue_days"], overdue_days)
                else:
                    sales_entry["not_due_amount"] += owing_amount
                    customer_entry["not_due_amount"] += owing_amount
                    sales_entry["not_due_invoice_count"] += 1
                    customer_entry["not_due_invoice_count"] += 1

                if overdue_days > 0:
                    status = "overdue"
                    status_label = f"Jatuh tempo {overdue_days} hari"
                elif overdue_days == 0:
                    status = "today"
                    status_label = "Jatuh tempo hari ini"
                else:
                    status = "upcoming"
                    status_label = f"{abs(overdue_days)} hari lagi"
                customer_entry["invoices"].append({
                    "invoice_id": invoice_id,
                    "no_faktur": no_invoice,
                    "tgl_faktur": invoice_date,
                    "no_po": no_po,
                    "no_pengiriman": no_pengiriman,
                    "no_pesanan": no_pesanan,
                    "nilai_faktur": round(invoice_amount, 2),
                    "nilai_terbayar": round(paid_amount, 2),
                    "terhutang": round(owing_amount, 2),
                    "due_date": due_date,
                    "overdue_days": overdue_days,
                    "status": status,
                    "status_label": status_label,
                })

            for sales_entry in receivable_sales_map.values():
                customer_rows = []
                for customer_entry in sales_entry["customers"].values():
                    customer_entry.pop("_po_seen", None)
                    customer_entry["amount"] = round(customer_entry["amount"], 2)
                    customer_entry["due_amount"] = round(customer_entry["due_amount"], 2)
                    customer_entry["not_due_amount"] = round(customer_entry["not_due_amount"], 2)
                    customer_entry["invoices"].sort(key=lambda item: (item.get("overdue_days", 0), item.get("terhutang", 0)), reverse=True)
                    customer_rows.append(customer_entry)
                customer_rows.sort(key=lambda item: (item.get("due_amount", 0), item.get("amount", 0)), reverse=True)
                sales_entry.pop("_po_seen", None)
                sales_entry["customers"] = customer_rows
                sales_entry["customer_count"] = len(customer_rows)
                sales_entry["amount"] = round(sales_entry["amount"], 2)
                sales_entry["due_amount"] = round(sales_entry["due_amount"], 2)
                sales_entry["not_due_amount"] = round(sales_entry["not_due_amount"], 2)
                sales_receivables_by_salesman.append(sales_entry)
            sales_receivables_by_salesman.sort(key=lambda item: (item.get("due_amount", 0), item.get("amount", 0)), reverse=True)

        invoice_period, invoice_amount_period = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM(COALESCE(ar.INVOICEAMOUNT, 0))
            FROM ARINV ar
            WHERE ar.GETFROMDO = 1
              AND ar.INVOICETYPE = 1
              AND (ar.ISDP IS NULL OR ar.ISDP = 0)
              AND {period_filter.format(field="ar.INVOICEDATE")}
        """, [date_from, date_to], [0, 0])

        spk_total_period, spk_finished_period, spk_active_period = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN x.spk_status = 2 THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.spk_status <> 2 THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    w.ID,
                    MIN(COALESCE(det.STATUS, 0)) AS spk_status
                FROM WO w
                LEFT JOIN WODET det ON det.WOID = w.ID
                WHERE {period_filter.format(field="w.WODATE")}
                GROUP BY w.ID
            ) x
        """, [date_from, date_to], [0, 0, 0])

        spm_total_period, spm_done_period, spm_partial_period, spm_open_period = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN x.pct >= 100 THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.pct > 0 AND x.pct < 100 THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.pct <= 0 THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    CASE
                        WHEN COALESCE(wdm.QUANTITY, 0) > 0
                            THEN (COALESCE(COALESCE(wdm.QTYTAKEN, det.QUANTITY), 0) / wdm.QUANTITY) * 100
                        ELSE 0
                    END AS pct
                FROM MATRLS m
                LEFT JOIN MATRLSDET det ON det.MATRLSID = m.ID
                LEFT JOIN WODETMAT wdm  ON wdm.ID = det.WODETID
                WHERE det.ITEMNO IS NOT NULL
                  AND {period_filter.format(field="m.RELEASEDATE")}
            ) x
        """, [date_from, date_to], [0, 0, 0, 0])

        gp_total_period, gp_done_period, gp_partial_period, gp_open_period = row_values(cur, f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN x.pct >= 100 THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.pct > 0 AND x.pct < 100 THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.pct <= 0 THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    CASE
                        WHEN COALESCE(wd.QUANTITY, 0) > 0
                            THEN (COALESCE(prd.QUANTITY, 0) / wd.QUANTITY) * 100
                        WHEN COALESCE(prd.QUANTITY, 0) > 0
                            THEN 100
                        ELSE 0
                    END AS pct
                FROM PRODRESULT pr
                LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
                LEFT JOIN WODET wd          ON wd.ID = prd.WODETID
                WHERE prd.ITEMNO IS NOT NULL
                  AND {period_filter.format(field="pr.RESULTDATE")}
            ) x
        """, [date_from, date_to], [0, 0, 0, 0])

        try:
            hpp_rows = _build_hpp_rows(cur, date_from, date_to, "")
        except Exception as hpp_error:
            print(f"Error dashboard hpp summary: {hpp_error}")
            hpp_rows = []

        try:
            aset_rows, aset_total, _ = _build_aset_rows(cur, "", date_from, date_to, 0, 99999)
        except Exception as aset_error:
            print(f"Error dashboard aset summary: {aset_error}")
            aset_rows, aset_total = [], 0

        con.close()

        def pct(done, total):
            return round((float(done or 0) / float(total or 0)) * 100, 1) if total else 0

        hpp_total = round(sum(row.get("hpp_total", 0) for row in hpp_rows), 2)
        nilai_jual = round(sum(row.get("nilai_jual", 0) for row in hpp_rows), 2)
        laba_rugi = round(sum(row.get("laba_rugi", 0) for row in hpp_rows), 2)
        margin_pct = round((laba_rugi / nilai_jual * 100) if nilai_jual else 0, 2)
        sales_amount_period = float(sales_amount_period or 0)
        prev_period_sales_amount = float(prev_period_sales_amount or 0)
        target_sales_amount = float(target_sales_amount or 0)
        prev_sales_amount = prev_period_sales_amount
        sales_change_pct = round(((sales_amount_period - prev_sales_amount) / prev_sales_amount * 100), 2) if prev_sales_amount else (100 if sales_amount_period > 0 else 0)
        do_vs_so_pct = round((float(do_period or 0) / float(so_period or 0) * 100), 1) if so_period else 0
        target_achievement_pct = round((sales_amount_period / target_sales_amount * 100), 1) if target_sales_amount else 0
        avg_per_so = round((sales_amount_period / float(so_period or 0)), 2) if so_period else 0
        prev_avg_per_so = round((prev_period_sales_amount / float(prev_so_count or 0)), 2) if prev_so_count else 0
        avg_per_so_change_pct = round(((avg_per_so - prev_avg_per_so) / prev_avg_per_so * 100), 2) if prev_avg_per_so else (100 if avg_per_so > 0 else 0)
        stock_below_minimum = stock_summary.get("below_minimum_items")

        return jsonify({
            "generated_at": datetime.now().isoformat(),
            "period": {
                "date_from": date_from,
                "date_to": date_to,
            },
            "stock": {
                "total": int(stock_summary.get("total_items") or 0),
                "kosong": int(stock_below_minimum or 0) if stock_below_minimum is not None else None,
                "ada": int((stock_summary.get("total_items") or 0) - (stock_below_minimum or 0)) if stock_below_minimum is not None else int(stock_summary.get("total_items") or 0),
                "total_items": int(stock_summary.get("total_items") or 0),
                "category_count": int(stock_summary.get("category_count") or 0),
                "categories": stock_summary.get("categories") or [],
                "standardized_items": int(stock_summary.get("standardized_items") or 0),
                "below_minimum_items": int(stock_below_minimum or 0) if stock_below_minimum is not None else None,
            },
            "purchasing": {
                "po_period": int(po_period or 0),
                "po_month": int(po_period or 0),
                "item_period": int(purchase_item_period or 0),
                "item_month": int(purchase_item_period or 0),
                "total_easy": round(float(purchase_total_easy or 0), 2),
                "discount": round(float(purchase_discount or 0), 2),
                "grand_total": round(float(purchase_grand_total or 0), 2),
                "vendor_total": int(purchase_vendor_total or 0),
                "vendor_ppn": int(purchase_vendor_ppn or 0),
                "vendor_non_ppn": int(purchase_vendor_non_ppn or 0),
                "vendor_ppn_pct": purchase_vendor_ppn_pct,
                "vendor_non_ppn_pct": purchase_vendor_non_ppn_pct,
                "pb_total": int(purchase_pb_total or 0),
                "pb_received": int(purchase_pb_received or 0),
                "pb_pending": purchase_pb_pending,
                "pb_late": int(purchase_pb_late or 0),
                "pb_on_time": int(purchase_pb_on_time or 0),
                "pb_late_pct": purchase_pb_late_pct,
                "pb_on_time_pct": purchase_pb_on_time_pct,
                "pb_avg_late_days": round(float(purchase_pb_avg_late_days or 0), 1),
                "pb_max_late_days": int(purchase_pb_max_late_days or 0),
            },
            "sales": {
                "so_period": int(so_period or 0),
                "so_month": int(so_period or 0),
                "do_period": int(do_period or 0),
                "do_month": int(do_period or 0),
                "do_vs_so_pct": do_vs_so_pct,
                "sales_amount_period": sales_amount_period,
                "sales_amount_previous": prev_sales_amount,
                "sales_amount_change_pct": sales_change_pct,
                "sales_amount_direction": "up" if sales_change_pct >= 0 else "down",
                "target_sales_amount": target_sales_amount,
                "target_source_label": target_source_label,
                "target_achievement_pct": target_achievement_pct,
                "target_remaining_amount": max(target_sales_amount - sales_amount_period, 0),
                "avg_per_so": avg_per_so,
                "avg_per_so_change_pct": avg_per_so_change_pct,
                "avg_per_so_direction": "up" if avg_per_so_change_pct >= 0 else "down",
                "pending_delivery_so": int(so_status_row[5] or 0),
                "on_time_delivery_pct": on_time_delivery_pct,
                "delivery_history": {
                    "do_count": int(delivery_do_count or 0),
                    "do_amount": round(float(delivery_do_amount or 0), 2),
                    "gr_count": int(gr_count or 0),
                    "gr_amount": round(float(gr_amount or 0), 2),
                    "sr_count": int(sr_count or 0),
                    "sr_amount": round(float(sr_amount or 0), 2),
                    "packing_count": int(packing_count or 0),
                    "packing_amount": round(float(packing_amount or 0), 2),
                    "pemasangan_count": int(pemasangan_count or 0),
                    "pemasangan_amount": round(float(pemasangan_amount or 0), 2),
                    "do_rows": delivery_do_rows,
                    "gr_rows": gr_rows,
                    "sr_rows": sr_rows,
                    "packing_rows": packing_rows,
                    "pemasangan_rows": pemasangan_rows,
                },
                "so_status": {
                    "total": int(so_status_row[0] or 0),
                    "open": int(so_status_row[1] or 0),
                    "process": int(so_status_row[2] or 0),
                    "received": int(so_status_row[3] or 0),
                    "closed": int(so_status_row[4] or 0),
                },
                "so_month_status": {
                    "date_from": month_from,
                    "date_to": month_to,
                    "total": int(so_month_status_row[0] or 0),
                    "open": int(so_month_status_row[1] or 0),
                    "process": int(so_month_status_row[2] or 0),
                    "received": int(so_month_status_row[3] or 0),
                    "closed": int(so_month_status_row[4] or 0),
                    "active_customers": int(so_frequency_row[0] or 0),
                    "repeat_customers": int(so_frequency_row[1] or 0),
                    "new_customers": int(so_frequency_row[2] or 0),
                    "invoiced_so": int(monthly_invoiced_so or 0),
                    "invoice_count": int(monthly_invoice_count or 0),
                    "invoiced_amount": float(monthly_invoiced_amount or 0),
                    "paid_so": int(monthly_paid_so or 0),
                    "paid_invoice_count": int(monthly_paid_invoice_count or 0),
                    "paid_amount": float(monthly_paid_amount or 0),
                },
                "top_products": top_products,
                "top_qty_product": top_qty_product,
                "top_qty_products": top_qty_products,
                "top_customers": top_customers,
                "top_salesmen": top_salesmen,
                "salesman_yearly": salesman_yearly,
                "marketing_customer_yearly": marketing_customer_yearly,
                "sales_receivables_by_salesman": sales_receivables_by_salesman,
                "sold_by_category": sold_by_category,
                "sold_by_code_product": sold_by_code_product,
                "customer_cities": customer_cities,
                "outstanding_receivables": outstanding_receivables,
                "receivable_aging": receivable_aging,
                "receivables_by_customer": receivables_by_customer,
                "invoice_period": int(invoice_period or 0),
                "invoice_month": int(invoice_period or 0),
                "invoice_amount_period": float(invoice_amount_period or 0),
                "invoice_amount_month": float(invoice_amount_period or 0),
            },
            "production": {
                "spk_total_month": int(spk_total_period or 0),
                "spk_finished_month": int(spk_finished_period or 0),
                "spk_active_month": int(spk_active_period or 0),
                "spk_progress_percent": pct(spk_finished_period, spk_total_period),
                "spm_total_month": int(spm_total_period or 0),
                "spm_done_month": int(spm_done_period or 0),
                "spm_partial_month": int(spm_partial_period or 0),
                "spm_open_month": int(spm_open_period or 0),
                "spm_progress_percent": pct(spm_done_period, spm_total_period),
                "gp_total_month": int(gp_total_period or 0),
                "gp_done_month": int(gp_done_period or 0),
                "gp_partial_month": int(gp_partial_period or 0),
                "gp_open_month": int(gp_open_period or 0),
                "gp_progress_percent": pct(gp_done_period, gp_total_period),
            },
            "accounting": {
                "hpp_total": hpp_total,
                "nilai_jual": nilai_jual,
                "laba_rugi": laba_rugi,
                "margin_pct": margin_pct,
                "profit_products": len([row for row in hpp_rows if row.get("laba_rugi", 0) > 0]),
                "loss_products": len([row for row in hpp_rows if row.get("laba_rugi", 0) < 0]),
                "asset_purchase_amount": round(sum(row.get("nilai_aktiva", 0) for row in aset_rows), 2),
                "asset_purchase_count": int(aset_total or 0),
            },
        })
    except Exception as e:
        print(f"Error api_dashboard_summary: {e}")
        return jsonify({"error": str(e)}), 500


# ─── RIWAYAT ─────────────────────────────────────────────────────────────────
PART_NUMBER_UNCATEGORIZED = "Belum Ada Category"


def _part_number_category_expr():
    return f"COALESCE(NULLIF(TRIM(i.RESERVED9), ''), '{PART_NUMBER_UNCATEGORIZED}')"


@app.route("/api/part-number-history/categories")
@jwt_required()
def api_part_number_history_categories():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = str(request.args.get("search", "") or "").strip()
        category_expr = _part_number_category_expr()
        params = []
        search_sql = ""
        if search:
            search_sql = f"""AND (
                LOWER({category_expr}) CONTAINING LOWER(?)
                OR LOWER(d.ITEMNO) CONTAINING LOWER(?)
                OR LOWER(COALESCE(i.ITEMDESCRIPTION, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(pd.NAME, '')) CONTAINING LOWER(?)
            )"""
            params = [search, search, search, search]
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT {category_expr}, COUNT(DISTINCT d.ITEMNO),
                   COUNT(DISTINCT so.CUSTOMERID), COUNT(DISTINCT so.SOID),
                   MAX(so.SODATE)
            FROM SO so
            JOIN SODET d ON d.SOID = so.SOID
            JOIN ITEM i ON i.ITEMNO = d.ITEMNO
            LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            WHERE UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'
              {search_sql}
            GROUP BY {category_expr}
            ORDER BY {category_expr}
        """, params)
        rows = cur.fetchall()
        cur.execute(f"""
            SELECT
                COUNT(DISTINCT {category_expr}),
                COUNT(DISTINCT d.ITEMNO),
                COUNT(DISTINCT so.CUSTOMERID),
                COUNT(DISTINCT so.SOID),
                COUNT(DISTINCT CASE
                    WHEN {category_expr} = '{PART_NUMBER_UNCATEGORIZED}' THEN d.ITEMNO
                END),
                MAX(so.SODATE)
            FROM SO so
            JOIN SODET d ON d.SOID = so.SOID
            JOIN ITEM i ON i.ITEMNO = d.ITEMNO
            LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            WHERE UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'
              {search_sql}
        """, params)
        summary_row = cur.fetchone() or [0, 0, 0, 0, 0, None]
        con.close()
        data = [{
            "category": str(row[0] or PART_NUMBER_UNCATEGORIZED).strip(),
            "item_count": int(row[1] or 0),
            "customer_count": int(row[2] or 0),
            "order_count": int(row[3] or 0),
            "last_order_date": str(row[4]) if row[4] else "",
        } for row in rows]
        data.sort(key=lambda row: (
            row["category"] == PART_NUMBER_UNCATEGORIZED,
            row["category"],
        ))
        return jsonify({
            "data": data,
            "summary": {
                "category_count": int(summary_row[0] or 0),
                "item_count": int(summary_row[1] or 0),
                "customer_count": int(summary_row[2] or 0),
                "order_count": int(summary_row[3] or 0),
                "uncategorized_item_count": int(summary_row[4] or 0),
                "last_order_date": str(summary_row[5]) if summary_row[5] else "",
            },
        })
    except Exception as e:
        print(f"Error api_part_number_history_categories: {e}")
        return jsonify({"data": [], "error": str(e)}), 500


@app.route("/api/part-number-history")
@jwt_required()
def api_part_number_history():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        category = str(request.args.get("category", "") or "").strip()
        search = str(request.args.get("search", "") or "").strip()
        grouped = str(request.args.get("grouped", "") or "").strip().lower() in ("1", "true", "yes")
        offset = max(int(request.args.get("offset", 0)), 0)
        limit = min(max(int(request.args.get("limit", 50)), 1), 200)
        category_expr = _part_number_category_expr()
        conditions = ["UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'"]
        params = []
        if category:
            conditions.append(f"{category_expr} = ?")
            params.append(category)
        if search:
            conditions.append("""(
                LOWER(d.ITEMNO) CONTAINING LOWER(?)
                OR LOWER(COALESCE(i.ITEMDESCRIPTION, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(pd.PERSONNO, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(pd.NAME, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(so.SONO, '')) CONTAINING LOWER(?)
            )""")
            params += [search, search, search, search, search]
        where_sql = " AND ".join(conditions)
        grouped_fields = f"{category_expr}, d.ITEMNO, i.ITEMDESCRIPTION, pd.PERSONNO, pd.NAME"
        grouped_fields_aliased = f"""
            {category_expr} AS CATEGORY_NAME,
            d.ITEMNO AS ITEM_NO,
            i.ITEMDESCRIPTION AS ITEM_DESCRIPTION,
            pd.PERSONNO AS CUSTOMER_NO,
            pd.NAME AS CUSTOMER_NAME
        """
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        if grouped:
            cur.execute(f"""
                SELECT COUNT(*) FROM (
                    SELECT d.ITEMNO
                    FROM SO so
                    JOIN SODET d ON d.SOID = so.SOID
                    JOIN ITEM i ON i.ITEMNO = d.ITEMNO
                    JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
                    WHERE {where_sql}
                    GROUP BY d.ITEMNO
                ) grouped_items
            """, params)
            total = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(f"""
                SELECT FIRST ? SKIP ? d.ITEMNO, MAX(so.SODATE)
                FROM SO so
                JOIN SODET d ON d.SOID = so.SOID
                JOIN ITEM i ON i.ITEMNO = d.ITEMNO
                JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
                WHERE {where_sql}
                GROUP BY d.ITEMNO
                ORDER BY MAX(so.SODATE) DESC, d.ITEMNO
            """, [limit, offset] + params)
            page_item_numbers = [str(row[0] or "").strip() for row in cur.fetchall()]
            if page_item_numbers:
                item_placeholders = ", ".join(["?"] * len(page_item_numbers))
                cur.execute(f"""
                    SELECT {grouped_fields},
                           COUNT(DISTINCT so.SOID), MIN(so.SODATE), MAX(so.SODATE),
                           LIST(DISTINCT so.SONO, ', ')
                    FROM SO so
                    JOIN SODET d ON d.SOID = so.SOID
                    JOIN ITEM i ON i.ITEMNO = d.ITEMNO
                    JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
                    WHERE {where_sql}
                      AND d.ITEMNO IN ({item_placeholders})
                    GROUP BY {grouped_fields}
                    ORDER BY MAX(so.SODATE) DESC, d.ITEMNO, pd.NAME
                """, params + page_item_numbers)
                rows = cur.fetchall()
            else:
                rows = []
        else:
            cur.execute(f"""
                SELECT COUNT(*) FROM (
                    SELECT {grouped_fields_aliased}
                    FROM SO so
                    JOIN SODET d ON d.SOID = so.SOID
                    JOIN ITEM i ON i.ITEMNO = d.ITEMNO
                    JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
                    WHERE {where_sql}
                    GROUP BY {grouped_fields}
                ) grouped_history
            """, params)
            total = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(f"""
                SELECT FIRST ? SKIP ? {grouped_fields},
                       COUNT(DISTINCT so.SOID), MIN(so.SODATE), MAX(so.SODATE),
                       LIST(DISTINCT so.SONO, ', ')
                FROM SO so
                JOIN SODET d ON d.SOID = so.SOID
                JOIN ITEM i ON i.ITEMNO = d.ITEMNO
                JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
                WHERE {where_sql}
                GROUP BY {grouped_fields}
                ORDER BY MAX(so.SODATE) DESC, d.ITEMNO, pd.NAME
            """, [limit, offset] + params)
            rows = cur.fetchall()
        cur.execute(f"""
            SELECT d.ITEMNO, pd.PERSONNO, COUNT(DISTINCT so.SOID)
            FROM SO so
            JOIN SODET d ON d.SOID = so.SOID
            JOIN ITEM i ON i.ITEMNO = d.ITEMNO
            JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            WHERE {where_sql}
            GROUP BY d.ITEMNO, pd.PERSONNO
        """, params)
        summary_relations = cur.fetchall()
        cur.execute(f"""
            SELECT COUNT(DISTINCT d.ITEMNO), COUNT(DISTINCT so.CUSTOMERID),
                   COUNT(DISTINCT so.SOID), MAX(so.SODATE)
            FROM SO so
            JOIN SODET d ON d.SOID = so.SOID
            JOIN ITEM i ON i.ITEMNO = d.ITEMNO
            JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            WHERE {where_sql}
        """, params)
        summary_row = cur.fetchone() or [0, 0, 0, None]
        con.close()
        keys = [(str(row[1] or "").strip(), str(row[3] or "").strip()) for row in rows]
        manual_map = get_customer_part_numbers(keys)
        data = []
        for row in rows:
            item_no = str(row[1] or "").strip()
            customer_no = str(row[3] or "").strip()
            manual = manual_map.get((item_no, customer_no), {})
            data.append({
                "category": str(row[0] or PART_NUMBER_UNCATEGORIZED).strip(),
                "item_no": item_no,
                "description": str(row[2] or "").strip(),
                "customer_no": customer_no,
                "customer_name": str(row[4] or "").strip(),
                "order_count": int(row[5] or 0),
                "first_order_date": str(row[6]) if row[6] else "",
                "last_order_date": str(row[7]) if row[7] else "",
                "so_numbers": str(row[8] or "").strip(),
                "customer_part_number": manual.get("part_number", ""),
                "customer_pn_updated_by": manual.get("updated_by", ""),
                "customer_pn_updated_at": manual.get("updated_at", ""),
            })
        all_relation_keys = [
            (str(row[0] or "").strip(), str(row[1] or "").strip())
            for row in summary_relations
        ]
        all_manual_map = get_customer_part_numbers(all_relation_keys)
        return jsonify({
            "data": data,
            "total": total,
            "summary": {
                "item_count": int(summary_row[0] or 0),
                "customer_count": int(summary_row[1] or 0),
                "order_count": int(summary_row[2] or 0),
                "relation_count": len(summary_relations),
                "repeat_relation_count": sum(
                    1 for row in summary_relations if int(row[2] or 0) > 1
                ),
                "customer_pn_count": sum(
                    1 for value in all_manual_map.values()
                    if str(value.get("part_number") or "").strip()
                ),
                "last_order_date": str(summary_row[3]) if summary_row[3] else "",
            },
        })
    except Exception as e:
        print(f"Error api_part_number_history: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)}), 500


@app.route("/api/part-number-history/vendors")
@jwt_required()
def api_part_number_history_vendors():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        item_no = str(request.args.get("item_no", "") or "").strip()
        if not item_no:
            return jsonify({"data": []})
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT pd.PERSONNO, pd.NAME, COUNT(DISTINCT po.POID),
                   MIN(po.PODATE), MAX(po.PODATE), LIST(DISTINCT po.PONO, ', ')
            FROM PO po
            JOIN PODET d ON d.POID = po.POID
            JOIN PERSONDATA pd ON pd.ID = po.VENDORID
            WHERE d.ITEMNO = ?
            GROUP BY pd.PERSONNO, pd.NAME
            ORDER BY MAX(po.PODATE) DESC, pd.NAME
        """, [item_no])
        rows = cur.fetchall()
        con.close()
        keys = [(item_no, str(row[0] or "").strip()) for row in rows]
        manual_map = get_vendor_part_numbers(keys)
        data = []
        for row in rows:
            vendor_no = str(row[0] or "").strip()
            manual = manual_map.get((item_no, vendor_no), {})
            data.append({
                "item_no": item_no,
                "vendor_no": vendor_no,
                "vendor_name": str(row[1] or "").strip(),
                "purchase_count": int(row[2] or 0),
                "first_purchase_date": str(row[3]) if row[3] else "",
                "last_purchase_date": str(row[4]) if row[4] else "",
                "po_numbers": str(row[5] or "").strip(),
                "vendor_part_number": manual.get("part_number", ""),
                "vendor_pn_updated_by": manual.get("updated_by", ""),
                "vendor_pn_updated_at": manual.get("updated_at", ""),
            })
        return jsonify({"data": data})
    except Exception as e:
        print(f"Error api_part_number_history_vendors: {e}")
        return jsonify({"data": [], "error": str(e)}), 500


@app.route("/api/part-number-history/part-number", methods=["POST"])
@jwt_required()
def api_part_number_history_save():
    if not check_permission("stock"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        payload = request.get_json(silent=True) or {}
        kind = str(payload.get("kind") or "").strip().lower()
        item_no = str(payload.get("item_no") or "").strip()
        party_no = str(payload.get("party_no") or "").strip()
        part_number = str(payload.get("part_number") or "").strip()
        if kind not in ("customer", "vendor") or not item_no or not party_no:
            return jsonify({"message": "Jenis, barang, atau relasi tidak valid."}), 400
        if len(part_number) > 150:
            return jsonify({"message": "Part number maksimal 150 karakter."}), 400
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        if kind == "customer":
            cur.execute("""
                SELECT FIRST 1 so.SOID
                FROM SO so
                JOIN SODET d ON d.SOID = so.SOID
                JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
                WHERE d.ITEMNO = ? AND pd.PERSONNO = ?
                  AND UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'
            """, [item_no, party_no])
        else:
            cur.execute("""
                SELECT FIRST 1 po.POID
                FROM PO po
                JOIN PODET d ON d.POID = po.POID
                JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                WHERE d.ITEMNO = ? AND pd.PERSONNO = ?
            """, [item_no, party_no])
        exists = cur.fetchone()
        con.close()
        if not exists:
            return jsonify({"message": "Riwayat transaksi barang dan relasi tidak ditemukan."}), 404
        user = get_current_user()
        saved = save_part_number(kind, item_no, party_no, part_number, user.get("username"))
        audit_current_user(
            "part_number_history_update", "stock",
            f"Update PN {kind} {item_no} / {party_no}", saved,
        )
        return jsonify({"message": "Part number disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_part_number_history_save: {e}")
        return jsonify({"message": "Gagal menyimpan part number.", "error": str(e)}), 500


@app.route("/api/dashboard-product-transactions")
@jwt_required()
def api_dashboard_product_transactions():
    if not check_permission("penjualan"):
        return jsonify({"message": "Akses ditolak"}), 403

    itemno = request.args.get("itemno", "").strip()
    date_from = request.args.get("date_from") or datetime.now().replace(day=1).strftime("%Y-%m-%d")
    date_to = request.args.get("date_to") or datetime.now().strftime("%Y-%m-%d")
    if not itemno:
        return jsonify({"data": [], "summary": {"order_count": 0, "qty": 0, "amount": 0}})

    det_discpc = sql_number_expr("det.DISCPC")
    det_disc_discpc = sql_number_expr("det_disc.DISCPC")
    so_cash_discount = sql_number_expr("so.CASHDISCOUNT")
    so_cash_discpc = sql_number_expr("so.CASHDISCPC")
    sales_line_subtotal_expr = """
        COALESCE(det.QUANTITY, 0)
        * COALESCE(det.UNITPRICE, 0)
        * (1 - COALESCE({det_discpc}, 0) / 100)
    """.format(det_discpc=det_discpc)
    sales_order_subtotal_expr = f"""
        (
            SELECT SUM(
                COALESCE(det_disc.QUANTITY, 0)
                * COALESCE(det_disc.UNITPRICE, 0)
                * (1 - COALESCE({det_disc_discpc}, 0) / 100)
            )
            FROM SODET det_disc
            WHERE det_disc.SOID = so.SOID
              AND det_disc.ITEMNO IS NOT NULL
        )
    """
    sales_order_discount_expr = f"""
        CASE
            WHEN COALESCE({so_cash_discount}, 0) <> 0
                THEN COALESCE({so_cash_discount}, 0)
            ELSE COALESCE({sales_order_subtotal_expr}, 0)
                * COALESCE({so_cash_discpc}, 0) / 100
        END
    """
    sales_amount_expr = f"""
        ({sales_line_subtotal_expr})
        * (
            1 - CASE
                WHEN COALESCE({sales_order_subtotal_expr}, 0) > 0
                    THEN COALESCE({sales_order_discount_expr}, 0) / COALESCE({sales_order_subtotal_expr}, 0)
                ELSE 0
            END
        )
    """

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT
                so.SONO,
                so.SODATE,
                so.PONO,
                pd.PERSONNO,
                pd.NAME,
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman'),
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                {sales_amount_expr}
            FROM SO so
            LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
            LEFT JOIN SODET det ON det.SOID = so.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE UPPER(TRIM(det.ITEMNO)) = UPPER(TRIM(?))
              AND so.SODATE >= CAST(? AS DATE)
              AND so.SODATE <= CAST(? AS DATE)
            ORDER BY so.SODATE DESC, so.SONO, det.SEQ
        """, [itemno, date_from, date_to])
        rows = cur.fetchall()
        con.close()

        data = []
        seen_so = set()
        total_qty = 0.0
        total_amount = 0.0
        for row in rows:
            so_no = str(row[0] or "").strip()
            qty = float(row[8] or 0)
            amount = float(row[11] or 0)
            seen_so.add(so_no)
            total_qty += qty
            total_amount += amount
            data.append({
                "so_no": so_no,
                "so_date": str(row[1]) if row[1] else "",
                "po_no": str(row[2] or "").strip(),
                "customer_no": str(row[3] or "").strip(),
                "customer_name": str(row[4] or "").strip(),
                "salesman": str(row[5] or "").strip(),
                "itemno": str(row[6] or "").strip(),
                "description": str(row[7] or "").strip(),
                "qty": qty,
                "unit": str(row[9] or "").strip(),
                "unit_price": float(row[10] or 0),
                "amount": amount,
            })

        return jsonify({
            "data": data,
            "summary": {
                "order_count": len(seen_so),
                "qty": round(total_qty, 2),
                "amount": round(total_amount, 2),
            },
        })
    except Exception as e:
        print(f"Error api_dashboard_product_transactions: {e}")
        return jsonify({"data": [], "summary": {"order_count": 0, "qty": 0, "amount": 0}, "error": str(e)}), 500


@app.route("/api/dashboard-party-transactions")
@jwt_required()
def api_dashboard_party_transactions():
    if not check_permission("penjualan"):
        return jsonify({"message": "Akses ditolak"}), 403

    party_type = request.args.get("type", "").strip().lower()
    party_id = request.args.get("id", "").strip()
    date_from = request.args.get("date_from") or datetime.now().replace(day=1).strftime("%Y-%m-%d")
    date_to = request.args.get("date_to") or datetime.now().strftime("%Y-%m-%d")
    if party_type not in ("customer", "salesman") or not party_id.isdigit():
        return jsonify({"message": "Parameter jenis atau ID tidak valid"}), 400

    det_discpc = sql_number_expr("det.DISCPC")
    det_disc_discpc = sql_number_expr("det_disc.DISCPC")
    so_cash_discount = sql_number_expr("so.CASHDISCOUNT")
    so_cash_discpc = sql_number_expr("so.CASHDISCPC")
    sales_line_subtotal_expr = """
        COALESCE(det.QUANTITY, 0)
        * COALESCE(det.UNITPRICE, 0)
        * (1 - COALESCE({det_discpc}, 0) / 100)
    """.format(det_discpc=det_discpc)
    sales_order_subtotal_expr = f"""
        (
            SELECT SUM(
                COALESCE(det_disc.QUANTITY, 0)
                * COALESCE(det_disc.UNITPRICE, 0)
                * (1 - COALESCE({det_disc_discpc}, 0) / 100)
            )
            FROM SODET det_disc
            WHERE det_disc.SOID = so.SOID
              AND det_disc.ITEMNO IS NOT NULL
        )
    """
    sales_order_discount_expr = f"""
        CASE
            WHEN COALESCE({so_cash_discount}, 0) <> 0
                THEN COALESCE({so_cash_discount}, 0)
            ELSE COALESCE({sales_order_subtotal_expr}, 0)
                * COALESCE({so_cash_discpc}, 0) / 100
        END
    """
    sales_amount_expr = f"""
        ({sales_line_subtotal_expr})
        * (
            1 - CASE
                WHEN COALESCE({sales_order_subtotal_expr}, 0) > 0
                    THEN COALESCE({sales_order_discount_expr}, 0) / COALESCE({sales_order_subtotal_expr}, 0)
                ELSE 0
            END
        )
    """
    party_filter = "so.CUSTOMERID = ?" if party_type == "customer" else "so.SALESMANID = ?"

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT
                so.SONO,
                so.SODATE,
                so.PONO,
                pd.PERSONNO,
                pd.NAME,
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman'),
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                {sales_amount_expr}
            FROM SO so
            LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
            LEFT JOIN SODET det ON det.SOID = so.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE {party_filter}
              AND det.ITEMNO IS NOT NULL
              AND so.SODATE >= CAST(? AS DATE)
              AND so.SODATE <= CAST(? AS DATE)
            ORDER BY so.SODATE DESC, so.SONO, det.SEQ
        """, [int(party_id), date_from, date_to])
        rows = cur.fetchall()
        con.close()

        data = []
        seen_so = set()
        total_qty = 0.0
        total_amount = 0.0
        for row in rows:
            so_no = str(row[0] or "").strip()
            qty = float(row[8] or 0)
            amount = float(row[11] or 0)
            seen_so.add(so_no)
            total_qty += qty
            total_amount += amount
            data.append({
                "so_no": so_no,
                "so_date": str(row[1]) if row[1] else "",
                "po_no": str(row[2] or "").strip(),
                "customer_no": str(row[3] or "").strip(),
                "customer_name": str(row[4] or "").strip(),
                "salesman": str(row[5] or "").strip(),
                "itemno": str(row[6] or "").strip(),
                "description": str(row[7] or "").strip(),
                "qty": qty,
                "unit": str(row[9] or "").strip(),
                "unit_price": float(row[10] or 0),
                "amount": amount,
            })

        return jsonify({
            "data": data,
            "summary": {
                "order_count": len(seen_so),
                "qty": round(total_qty, 2),
                "amount": round(total_amount, 2),
            },
        })
    except Exception as e:
        print(f"Error api_dashboard_party_transactions: {e}")
        return jsonify({"data": [], "summary": {"order_count": 0, "qty": 0, "amount": 0}, "error": str(e)}), 500


@app.route("/api/dashboard-group-transactions")
@jwt_required()
def api_dashboard_group_transactions():
    if not check_permission("penjualan"):
        return jsonify({"message": "Akses ditolak"}), 403

    group_type = request.args.get("type", "").strip().lower()
    label = request.args.get("label", "").strip()
    date_from = request.args.get("date_from") or datetime.now().replace(day=1).strftime("%Y-%m-%d")
    date_to = request.args.get("date_to") or datetime.now().strftime("%Y-%m-%d")
    if group_type not in ("category", "code_product") or not label:
        return jsonify({"message": "Parameter jenis atau label tidak valid"}), 400

    det_discpc = sql_number_expr("det.DISCPC")
    det_disc_discpc = sql_number_expr("det_disc.DISCPC")
    so_cash_discount = sql_number_expr("so.CASHDISCOUNT")
    so_cash_discpc = sql_number_expr("so.CASHDISCPC")
    sales_line_subtotal_expr = """
        COALESCE(det.QUANTITY, 0)
        * COALESCE(det.UNITPRICE, 0)
        * (1 - COALESCE({det_discpc}, 0) / 100)
    """.format(det_discpc=det_discpc)
    sales_order_subtotal_expr = f"""
        (
            SELECT SUM(
                COALESCE(det_disc.QUANTITY, 0)
                * COALESCE(det_disc.UNITPRICE, 0)
                * (1 - COALESCE({det_disc_discpc}, 0) / 100)
            )
            FROM SODET det_disc
            WHERE det_disc.SOID = so.SOID
              AND det_disc.ITEMNO IS NOT NULL
        )
    """
    sales_order_discount_expr = f"""
        CASE
            WHEN COALESCE({so_cash_discount}, 0) <> 0
                THEN COALESCE({so_cash_discount}, 0)
            ELSE COALESCE({sales_order_subtotal_expr}, 0)
                * COALESCE({so_cash_discpc}, 0) / 100
        END
    """
    sales_amount_expr = f"""
        ({sales_line_subtotal_expr})
        * (
            1 - CASE
                WHEN COALESCE({sales_order_subtotal_expr}, 0) > 0
                    THEN COALESCE({sales_order_discount_expr}, 0) / COALESCE({sales_order_subtotal_expr}, 0)
                ELSE 0
            END
        )
    """
    if group_type == "category":
        group_expr = """
            CASE
                WHEN NULLIF(TRIM(i.RESERVED9), '') IS NULL
                     OR (
                        UPPER(TRIM(i.RESERVED9)) CONTAINING 'TANPA'
                        AND UPPER(TRIM(i.RESERVED9)) CONTAINING 'CATEGORY'
                     )
                THEN 'NON GTE'
                ELSE TRIM(i.RESERVED9)
            END
        """
    else:
        group_expr = "COALESCE(NULLIF(TRIM(i.RESERVED8), ''), 'Tanpa Code Product')"

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT
                so.SONO,
                so.SODATE,
                so.PONO,
                pd.PERSONNO,
                pd.NAME,
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Salesman'),
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                {sales_amount_expr}
            FROM SO so
            LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
            LEFT JOIN SODET det ON det.SOID = so.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE UPPER({group_expr}) = UPPER(?)
              AND det.ITEMNO IS NOT NULL
              AND so.SODATE >= CAST(? AS DATE)
              AND so.SODATE <= CAST(? AS DATE)
            ORDER BY so.SODATE DESC, so.SONO, det.SEQ
        """, [label, date_from, date_to])
        rows = cur.fetchall()
        con.close()

        data = []
        seen_so = set()
        seen_items = set()
        total_qty = 0.0
        total_amount = 0.0
        for row in rows:
            so_no = str(row[0] or "").strip()
            itemno = str(row[6] or "").strip()
            qty = float(row[8] or 0)
            amount = float(row[11] or 0)
            seen_so.add(so_no)
            seen_items.add(itemno)
            total_qty += qty
            total_amount += amount
            data.append({
                "so_no": so_no,
                "so_date": str(row[1]) if row[1] else "",
                "po_no": str(row[2] or "").strip(),
                "customer_no": str(row[3] or "").strip(),
                "customer_name": str(row[4] or "").strip(),
                "salesman": str(row[5] or "").strip(),
                "itemno": itemno,
                "description": str(row[7] or "").strip(),
                "qty": qty,
                "unit": str(row[9] or "").strip(),
                "unit_price": float(row[10] or 0),
                "amount": amount,
            })

        return jsonify({
            "data": data,
            "summary": {
                "order_count": len(seen_so),
                "item_count": len(seen_items),
                "qty": round(total_qty, 2),
                "amount": round(total_amount, 2),
            },
        })
    except Exception as e:
        print(f"Error api_dashboard_group_transactions: {e}")
        return jsonify({
            "data": [],
            "summary": {"order_count": 0, "item_count": 0, "qty": 0, "amount": 0},
            "error": str(e),
        }), 500


@app.route("/api/dashboard-salesman-month-comparison")
@jwt_required()
def api_dashboard_salesman_month_comparison():
    if not check_permission("dashboard"):
        return jsonify({"message": "Akses ditolak"}), 403

    try:
        salesman_id = request.args.get("salesman_id", "").strip()
        year = int(request.args.get("year", datetime.now().year))
        month = int(request.args.get("month", datetime.now().month))
        if not salesman_id or not salesman_id.isdigit() or month < 1 or month > 12:
            return jsonify({"message": "Parameter salesman, tahun, atau bulan tidak valid"}), 400

        today = datetime.now().date()

        def month_range(target_year, target_month):
            start = datetime(target_year, target_month, 1).date()
            if target_month == 12:
                next_month = datetime(target_year + 1, 1, 1).date()
            else:
                next_month = datetime(target_year, target_month + 1, 1).date()
            end = next_month - timedelta(days=1)
            if target_year == today.year and target_month == today.month:
                end = min(end, today)
            return start, end

        current_from, current_to = month_range(year, month)
        previous_from, previous_to = month_range(year - 1, month)

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        det_discpc = sql_number_expr("det.DISCPC")
        det_disc_discpc = sql_number_expr("det_disc.DISCPC")
        so_cash_discount = sql_number_expr("so.CASHDISCOUNT")
        so_cash_discpc = sql_number_expr("so.CASHDISCPC")
        sales_line_subtotal_expr = """
            COALESCE(det.QUANTITY, 0)
            * COALESCE(det.UNITPRICE, 0)
            * (1 - COALESCE({det_discpc}, 0) / 100)
        """.format(det_discpc=det_discpc)
        sales_order_subtotal_expr = f"""
            (
                SELECT SUM(
                    COALESCE(det_disc.QUANTITY, 0)
                    * COALESCE(det_disc.UNITPRICE, 0)
                    * (1 - COALESCE({det_disc_discpc}, 0) / 100)
                )
                FROM SODET det_disc
                WHERE det_disc.SOID = so.SOID
                  AND det_disc.ITEMNO IS NOT NULL
            )
        """
        sales_order_discount_expr = f"""
            CASE
                WHEN COALESCE({so_cash_discount}, 0) <> 0
                    THEN COALESCE({so_cash_discount}, 0)
                ELSE COALESCE({sales_order_subtotal_expr}, 0)
                    * COALESCE({so_cash_discpc}, 0) / 100
            END
        """
        sales_amount_expr = f"""
            ({sales_line_subtotal_expr})
            * (
                1 - CASE
                    WHEN COALESCE({sales_order_subtotal_expr}, 0) > 0
                        THEN COALESCE({sales_order_discount_expr}, 0) / COALESCE({sales_order_subtotal_expr}, 0)
                    ELSE 0
                END
            )
        """

        cur.execute(f"""
            SELECT
                EXTRACT(YEAR FROM so.SODATE),
                COALESCE(NULLIF(TRIM(pd.PERSONNO), ''), ''),
                COALESCE(NULLIF(TRIM(pd.NAME), ''), 'Tanpa Customer'),
                COALESCE(NULLIF(TRIM(so.SONO), ''), ''),
                COALESCE(NULLIF(TRIM(so.PONO), ''), ''),
                MIN(so.SODATE),
                COUNT(DISTINCT so.SOID),
                SUM(COALESCE(det.QUANTITY, 0)),
                SUM({sales_amount_expr})
            FROM SO so
            LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND so.SALESMANID = ?
              AND (
                (so.SODATE >= ? AND so.SODATE <= ?)
                OR (so.SODATE >= ? AND so.SODATE <= ?)
              )
            GROUP BY
                EXTRACT(YEAR FROM so.SODATE),
                COALESCE(NULLIF(TRIM(pd.PERSONNO), ''), ''),
                COALESCE(NULLIF(TRIM(pd.NAME), ''), 'Tanpa Customer'),
                COALESCE(NULLIF(TRIM(so.SONO), ''), ''),
                COALESCE(NULLIF(TRIM(so.PONO), ''), '')
            ORDER BY 9 DESC
        """, [
            int(salesman_id),
            current_from.isoformat(), current_to.isoformat(),
            previous_from.isoformat(), previous_to.isoformat(),
        ])

        customer_map = {}
        totals = {
            "current_amount": 0.0,
            "previous_amount": 0.0,
            "current_so_count": 0,
            "previous_so_count": 0,
            "current_qty": 0.0,
            "previous_qty": 0.0,
        }

        for row in cur.fetchall():
            row_year = int(row[0] or 0)
            customer_no = str(row[1] or "").strip()
            customer_name = str(row[2] or "Tanpa Customer").strip()
            customer_key = f"{customer_no}|{customer_name}"
            customer = customer_map.setdefault(customer_key, {
                "customer_no": customer_no,
                "customer_name": customer_name,
                "current_amount": 0.0,
                "previous_amount": 0.0,
                "current_so_count": 0,
                "previous_so_count": 0,
                "current_qty": 0.0,
                "previous_qty": 0.0,
                "pos": [],
            })
            amount = float(row[8] or 0)
            so_count = int(row[6] or 0)
            qty = float(row[7] or 0)
            period_key = "current" if row_year == year else "previous"
            customer[f"{period_key}_amount"] += amount
            customer[f"{period_key}_so_count"] += so_count
            customer[f"{period_key}_qty"] += qty
            totals[f"{period_key}_amount"] += amount
            totals[f"{period_key}_so_count"] += so_count
            totals[f"{period_key}_qty"] += qty
            customer["pos"].append({
                "year": row_year,
                "so_no": str(row[3] or "").strip(),
                "po_no": str(row[4] or "").strip(),
                "so_date": str(row[5]) if row[5] else "",
                "so_count": so_count,
                "qty": qty,
                "amount": amount,
            })

        customers = []
        for customer in customer_map.values():
            current_amount = float(customer["current_amount"] or 0)
            previous_amount = float(customer["previous_amount"] or 0)
            diff_amount = current_amount - previous_amount
            if previous_amount:
                growth_pct = round((diff_amount / previous_amount) * 100, 1)
            elif current_amount:
                growth_pct = 100.0
            else:
                growth_pct = 0.0
            customer["diff_amount"] = diff_amount
            customer["growth_pct"] = growth_pct
            customer["status"] = "up" if diff_amount > 0 else "down" if diff_amount < 0 else "flat"
            customer["pos"].sort(key=lambda item: (item["year"], item["amount"]), reverse=True)
            customers.append(customer)

        customers.sort(key=lambda item: abs(float(item.get("diff_amount") or 0)), reverse=True)
        total_diff = totals["current_amount"] - totals["previous_amount"]
        total_growth_pct = round((total_diff / totals["previous_amount"]) * 100, 1) if totals["previous_amount"] else (100.0 if totals["current_amount"] else 0.0)

        con.close()
        return jsonify({
            "salesman_id": int(salesman_id),
            "year": year,
            "previous_year": year - 1,
            "month": month,
            "period": {
                "current_from": current_from.isoformat(),
                "current_to": current_to.isoformat(),
                "previous_from": previous_from.isoformat(),
                "previous_to": previous_to.isoformat(),
            },
            "totals": {
                **totals,
                "diff_amount": total_diff,
                "growth_pct": total_growth_pct,
            },
            "customers": customers,
        })
    except Exception as e:
        print(f"Error api_dashboard_salesman_month_comparison: {e}")
        return jsonify({"message": "Gagal memuat detail perbandingan salesman", "error": str(e)}), 500


def sync_itemhist_detected_today(cur):
    max_logged = get_max_logged_itemhistid()
    cur.execute("SELECT MAX(ITEMHISTID) FROM ITEMHIST")
    current_max = int((cur.fetchone() or [0])[0] or 0)
    if max_logged <= 0:
        if current_max:
            save_itemhist_detected_ids([current_max], "2000-01-01T00:00:00")
        max_logged = current_max

    cur.execute("""
        SELECT FIRST 5000 ITEMHISTID
        FROM ITEMHIST
        WHERE ITEMHISTID > ?
        ORDER BY ITEMHISTID ASC
    """, [max_logged])
    new_ids = [int(row[0] or 0) for row in cur.fetchall()]
    saved = save_itemhist_detected_ids(new_ids)

    if current_max:
        cur.execute("""
            SELECT FIRST 200 ITEMHISTID
            FROM ITEMHIST
            WHERE ITEMHISTID >= ?
              AND TXDATE >= DATEADD(-1 DAY TO CURRENT_DATE)
              AND TXDATE <= CURRENT_DATE
            ORDER BY ITEMHISTID DESC
        """, [max(current_max - 300, 0)])
        recent_backdate_ids = [int(row[0] or 0) for row in cur.fetchall()]
        saved += save_itemhist_detected_ids(recent_backdate_ids, force_update=True)

    return saved


def build_riwayat_where(search="", detected_ids=None):
    detected_ids = detected_ids or []
    params = []
    base_conditions = ["h.TXDATE = CURRENT_DATE"]
    if detected_ids:
        placeholders = ", ".join(["?"] * len(detected_ids))
        base_conditions.append(f"h.ITEMHISTID IN ({placeholders})")
        params.extend(detected_ids)

    conditions = [f"({' OR '.join(base_conditions)})"]
    if search:
        conditions.append("""(
            LOWER(h.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
        )""")
        params += [search, search]

    return " AND ".join(conditions), params


def riwayat_rows_to_records(rows, detected_ids=None):
    detected_set = set(detected_ids or [])
    today = datetime.now().date().isoformat()
    tx_type_map = {
        'S': 'Penjualan', 'P': 'Pembelian', 'AV': 'Penyesuaian', 'A': 'Penyesuaian',
        'TR': 'Transfer', 'AD': 'Adjustment', 'R': 'Retur',
        'RP': 'Retur Pembelian', 'RS': 'Retur Penjualan',
        'WO': 'Work Order', 'FIN': 'Hasil Produksi', 'J': 'Job Order',
    }
    data = []
    for row in rows:
        itemhistid = int(row[0] or 0)
        txdate = str(row[3]) if row[3] else ""
        is_backdate_detected = itemhistid in detected_set and txdate != today
        data.append({
            "itemhistid": itemhistid,
            "itemno": str(row[1] or "").strip(),
            "description": str(row[2] or "").strip(),
            "txdate": txdate,
            "txtype": tx_type_map.get(str(row[4] or "").strip(), str(row[4] or "").strip()),
            "quantity": float(row[5] or 0),
            "keterangan": str(row[6] or "").strip(),
            "unit": str(row[7] or "").strip(),
            "status_lacak": "Backdate dibuat hari ini" if is_backdate_detected else "Tanggal hari ini",
            "is_backdate_detected": is_backdate_detected,
        })
    return data


@app.route("/api/riwayat")
@jwt_required()
def api_riwayat():
    if not check_permission("riwayat"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        offset = int(request.args.get("offset", 0))
        limit  = int(request.args.get("limit", 50))
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        sync_itemhist_detected_today(cur)
        today = datetime.now().date().isoformat()
        detected_ids = get_itemhist_detected_ids(today, today)
        where_sql, params = build_riwayat_where(search, detected_ids)
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                h.ITEMHISTID, h.ITEMNO, i.ITEMDESCRIPTION, h.TXDATE,
                h.TXTYPE, h.QUANTITY, h.DESCRIPTION, i.UNIT1
            FROM ITEMHIST h LEFT JOIN ITEM i ON i.ITEMNO = h.ITEMNO
            WHERE {where_sql}
            ORDER BY h.ITEMHISTID DESC
        """, [limit, offset] + params)
        rows = cur.fetchall()
        cur2 = con.cursor()
        count_where_sql, count_params = build_riwayat_where("", detected_ids)
        cur2.execute(f"SELECT COUNT(*) FROM ITEMHIST h LEFT JOIN ITEM i ON i.ITEMNO = h.ITEMNO WHERE {count_where_sql}", count_params)
        today_count = int(cur2.fetchone()[0] or 0)
        con.close()
        data = riwayat_rows_to_records(rows, detected_ids)
        return jsonify({"data": filter_record_columns("riwayat", data), "today_count": today_count})
    except Exception as e:
        print(f"Error riwayat: {e}")
        return jsonify({"data": [], "today_count": 0})


@app.route("/api/riwayat/export")
@jwt_required()
def api_riwayat_export():
    if not check_permission("riwayat"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        sync_itemhist_detected_today(cur)
        today = datetime.now().date().isoformat()
        detected_ids = get_itemhist_detected_ids(today, today)
        where_sql, params = build_riwayat_where(search, detected_ids)
        cur.execute(f"""
            SELECT
                h.ITEMHISTID, h.ITEMNO, i.ITEMDESCRIPTION, h.TXDATE,
                h.TXTYPE, h.QUANTITY, h.DESCRIPTION, i.UNIT1
            FROM ITEMHIST h
            LEFT JOIN ITEM i ON i.ITEMNO = h.ITEMNO
            WHERE {where_sql}
            ORDER BY h.ITEMHISTID DESC
        """, params)
        rows = cur.fetchall()
        con.close()
        data = riwayat_rows_to_records(rows, detected_ids)
        data = filter_record_columns("riwayat", data)
        return jsonify({"data": data, "total_rows": len(data)})
    except Exception as e:
        print(f"Error api_riwayat_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


# ─── BARANG BARU ─────────────────────────────────────────────────────────────

max_itemid_at_start = 0


def get_item_source_key():
    return f"{DB_CONFIG['host']}:{DB_CONFIG['port']}|{DB_CONFIG['database']}".lower()

def init_baseline():
    global max_itemid_at_start
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("SELECT MAX(ITEMID) FROM ITEM")
        row = cur.fetchone()
        max_easy = int(row[0] or 0)
        source_key = get_item_source_key()
        max_logged = get_max_logged_itemid(source_key)
        if max_logged:
            max_itemid_at_start = min(max_easy, max_logged)
        else:
            logged_itemnos = get_logged_itemnos()
            matching_ids = []
            for index in range(0, len(logged_itemnos), 500):
                chunk = logged_itemnos[index:index + 500]
                placeholders = ", ".join(["?"] * len(chunk))
                cur.execute(
                    f"SELECT MAX(ITEMID) FROM ITEM WHERE ITEMNO IN ({placeholders})",
                    chunk,
                )
                matching_ids.append(int((cur.fetchone() or [0])[0] or 0))
            max_itemid_at_start = max(matching_ids, default=max_easy) or max_easy
        con.close()
        print(f"Baseline ITEMID: {max_itemid_at_start}")
    except Exception as e:
        print(f"Error init_baseline: {e}")

def check_new_items():
    global max_itemid_at_start
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT ITEMID, ITEMNO, ITEMDESCRIPTION, ITEMDESCRIPTION2, UNIT1, TIPEPERSEDIAAN
            FROM ITEM WHERE ITEMID > ? ORDER BY ITEMID ASC
        """, (max_itemid_at_start,))
        rows = cur.fetchall()
        con.close()
        for row in rows:
            item_id = int(row[0] or 0)
            itemno = str(row[1] or "").strip()
            max_itemid_at_start = max(max_itemid_at_start, item_id)
            if is_excluded_barang_baru(itemno):
                continue
            item = {
                "source_key": get_item_source_key(),
                "itemid": item_id, "itemno": itemno,
                "description": str(row[2] or "").strip(), "description2": str(row[3] or "").strip(),
                "unit": str(row[4] or "").strip(), "type": str(row[5] or "").strip(),
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            save_barang_baru(item)
            print(f"Barang baru: {row[1]}")
    except Exception as e:
        print(f"Error check_new_items: {e}")

@app.route("/api/barang-baru")
@jwt_required()
def api_barang_baru():
    if not check_permission("barang-baru"):
        return jsonify({"message": "Akses ditolak"}), 403
    date_from = request.args.get("date_from", "")
    date_to   = request.args.get("date_to", "")
    data = get_barang_baru_log(
        date_from=date_from if date_from else None,
        date_to=date_to if date_to else None
    )
    return jsonify({"data": filter_record_columns("barang-baru", data), "count": len(data)})


# ─── PEMBELIAN ────────────────────────────────────────────────────────────────

# ─── DAFTAR PERMINTAAN ───────────────────────────────────────────────────────
# Tambahkan endpoint ini ke server.py sebelum background_sync()
# Tabel: REQUISITION + REQUISITIONDET + ITEM
# Status: Menunggu / Sudah Dipesan / Sudah Diterima

def _purchase_request_aging(expected_date):
    if not expected_date:
        return None
    return (expected_date - datetime.now().date()).days


def _purchase_request_dt_status(aging):
    if aging is None:
        return ""
    if aging < 0:
        return "LATE"
    if aging == 0:
        return "DT Hari Ini"
    if aging == 1:
        return "DT Besok"
    return "On Proses"


def _purchase_request_status(no_po, qty_received):
    if float(qty_received or 0) > 0:
        return "Diterima"
    if str(no_po or "").strip():
        return "Diproses"
    return "Menunggu"


@app.route("/api/permintaan")
@jwt_required()
def api_permintaan():
    if not check_permission("permintaan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")  # menunggu / dipesan / diterima
        vendor_filter = request.args.get("vendor", "").strip()
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions = ["""EXISTS (
            SELECT 1 FROM USERS creator
            WHERE creator.USERID = r.USERID
              AND UPPER(TRIM(creator.USERNAME)) = 'ALIKA'
        )"""]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(r.REQNO)         CONTAINING LOWER(?)
                OR LOWER(r.DESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(rd.ITEMNO)    CONTAINING LOWER(?)
                OR LOWER(rd.ITEMOVDESC) CONTAINING LOWER(?)
                OR LOWER(COALESCE(rd.ITEMRESERVED9, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(po.PONO, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(vendor.NAME, '')) CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search, search, search]

        if date_from:
            conditions.append("r.REQDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("r.REQDATE <= ?")
            params_where.append(date_to)

        if vendor_filter:
            conditions.append("UPPER(TRIM(COALESCE(vendor.NAME, ''))) = UPPER(TRIM(?))")
            params_where.append(vendor_filter)

        # Filter status
        if status == "menunggu":
            conditions.append("po.PONO IS NULL AND COALESCE(rd.QTYRECEIVED, 0) = 0")
        elif status in ("dipesan", "diproses"):
            conditions.append("po.PONO IS NOT NULL AND COALESCE(rd.QTYRECEIVED, 0) = 0")
        elif status == "diterima":
            conditions.append("COALESCE(rd.QTYRECEIVED, 0) > 0")

        where_sql = " AND ".join(conditions)

        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                r.REQNO,
                r.REQDATE,
                rd.REQDATE         AS TARGET_DATE,
                r.DESCRIPTION,
                rd.ITEMNO,
                rd.ITEMOVDESC,
                rd.QUANTITY,
                rd.QTYORDERED,
                rd.QTYRECEIVED,
                rd.CLOSED,
                i.ITEMDESCRIPTION,
                i.UNIT1,
                po.PONO,
                rd.ITEMRESERVED9,
                po.PODATE,
                po.EXPECTED,
                vendor.NAME,
                pd.QUANTITY,
                r.REQID,
                rd.SEQ
            FROM REQUISITION r
            LEFT JOIN REQUISITIONDET rd  ON rd.REQID   = r.REQID
            LEFT JOIN ITEM i             ON i.ITEMNO   = rd.ITEMNO
            LEFT JOIN PODET pd           ON pd.REQID   = r.REQID AND pd.REQSEQ = rd.SEQ
            LEFT JOIN PO po              ON po.POID    = pd.POID
            LEFT JOIN PERSONDATA vendor  ON vendor.ID  = po.VENDORID
            WHERE {where_sql}
              AND rd.ITEMNO IS NOT NULL
            ORDER BY r.REQDATE DESC, r.REQNO, rd.SEQ
        """, [limit, offset] + params_where)

        rows = cur.fetchall()
        con.close()

        def get_status_color(status):
            return {
                "Diterima": "success",
                "Diproses": "processing",
                "Menunggu": "warning",
            }.get(status, "default")

        data = []
        for row in rows:
            st = _purchase_request_status(row[12], row[8])
            aging = _purchase_request_aging(row[15])
            data.append({
                "no_permintaan":    str(row[0] or "").strip(),
                "tgl_permintaan":   str(row[1]) if row[1] else "",
                "tgl_target":       str(row[2]) if row[2] else "",
                "deskripsi":        str(row[3] or "").strip(),
                "no_barang":        str(row[4] or "").strip(),
                "deskripsi_barang": str(row[5] or str(row[10] or "")).strip(),
                "qty":              float(row[6] or 0),
                "qty_ordered":      float(row[7] or 0),
                "qty_received":     float(row[8] or 0),
                "unit":             str(row[11] or "").strip(),
                "no_po":            str(row[12] or "").strip(),
                "no_so":            str(row[13] or "").strip(),
                "tgl_pesanan_po":   str(row[14]) if row[14] else "",
                "estimasi_po":      str(row[15]) if row[15] else "",
                "vendor":           str(row[16] or "").strip(),
                "qty_po":           float(row[17] or 0),
                "aging":            aging,
                "status_dt_po":     _purchase_request_dt_status(aging),
                "row_key":          f"{int(row[18])}:{int(row[19])}",
                "status":           st,
                "status_color":     get_status_color(st),
            })

        remark_map = get_purchase_request_remarks([row["row_key"] for row in data])
        for row in data:
            remark = remark_map.get(row["row_key"], {})
            row["remark"] = remark.get("remark", "")
            row["remark_updated_by"] = remark.get("updated_by", "")
            row["remark_updated_at"] = remark.get("updated_at", "")

        return jsonify({"data": filter_record_columns("permintaan", data), "total": len(data)})

    except Exception as e:
        print(f"Error api_permintaan: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


@app.route("/api/permintaan/remark", methods=["POST"])
@jwt_required()
def api_permintaan_remark_save():
    if not check_permission("permintaan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        payload = request.get_json(silent=True) or {}
        row_key = str(payload.get("row_key") or "").strip()
        remark = str(payload.get("remark") or "").strip()
        if not re.fullmatch(r"\d+:\d+", row_key):
            return jsonify({"message": "Identitas baris permintaan tidak valid."}), 400
        if len(remark) > 500:
            return jsonify({"message": "Remark maksimal 500 karakter."}), 400

        reqid, reqseq = [int(value) for value in row_key.split(":", 1)]
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 r.REQNO
            FROM REQUISITION r
            JOIN REQUISITIONDET rd ON rd.REQID = r.REQID
            WHERE r.REQID = ? AND rd.SEQ = ?
              AND EXISTS (
                  SELECT 1 FROM USERS creator
                  WHERE creator.USERID = r.USERID
                    AND UPPER(TRIM(creator.USERNAME)) = 'ALIKA'
              )
        """, [reqid, reqseq])
        valid_row = cur.fetchone()
        con.close()
        if not valid_row:
            return jsonify({"message": "Baris permintaan tidak ditemukan."}), 404

        user = get_current_user()
        saved = save_purchase_request_remark(
            row_key, remark, user.get("username")
        )
        audit_current_user(
            "purchase_request_remark_update",
            "permintaan",
            f"Update remark {str(valid_row[0] or '').strip()} baris {reqseq}",
            saved,
        )
        return jsonify({"message": "Remark disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_permintaan_remark_save: {e}")
        return jsonify({"message": "Gagal menyimpan remark.", "error": str(e)}), 500


@app.route("/api/liw-pur-mkt/note", methods=["POST"])
@jwt_required()
def api_liw_pur_mkt_note():
    user = get_current_user()
    permissions = user.get("permissions", [])
    if user.get("role") != "admin" and "kolaborasi" not in permissions and "pembelian" not in permissions:
        return jsonify({"message": "Akses ditolak"}), 403

    data = request.get_json() or {}
    note = str(data.get("note", "") or "")
    if len(note) > 500:
        return jsonify({"message": "Note maksimal 500 karakter"}), 400

    save_liw_purchase_note(
        data.get("no_permintaan", ""),
        data.get("so_no", ""),
        data.get("no_pembelian", ""),
        data.get("no_barang", ""),
        note,
        user.get("username"),
    )
    audit_current_user(
        action="update_note",
        module="kolaborasi",
        description=f"Update note LIW {data.get('so_no', '')} / {data.get('no_pembelian', '')}",
        metadata={
            "no_permintaan": data.get("no_permintaan", ""),
            "so_no": data.get("so_no", ""),
            "no_pembelian": data.get("no_pembelian", ""),
            "no_barang": data.get("no_barang", ""),
        },
    )
    return jsonify({"message": "Note tersimpan", "note": note.strip()})


@app.route("/api/liw-pur-mkt/delivery-note", methods=["POST"])
@jwt_required()
def api_liw_pur_mkt_delivery_note():
    user = get_current_user()
    permissions = user.get("permissions", [])
    if user.get("role") != "admin" and "kolaborasi" not in permissions and "pembelian" not in permissions:
        return jsonify({"message": "Akses ditolak"}), 403

    data = request.get_json() or {}
    note = str(data.get("note", "") or "")
    if len(note) > 500:
        return jsonify({"message": "Note maksimal 500 karakter"}), 400

    save_liw_delivery_note(
        data.get("no_permintaan", ""),
        data.get("so_no", ""),
        data.get("no_pembelian", ""),
        data.get("no_barang", ""),
        note,
        user.get("username"),
    )
    audit_current_user(
        action="update_delivery_note",
        module="kolaborasi",
        description=f"Update note pengiriman LIW {data.get('so_no', '')} / {data.get('no_pembelian', '')}",
        metadata={
            "no_permintaan": data.get("no_permintaan", ""),
            "so_no": data.get("so_no", ""),
            "no_pembelian": data.get("no_pembelian", ""),
            "no_barang": data.get("no_barang", ""),
        },
    )
    return jsonify({"message": "Note pengiriman tersimpan", "note": note.strip()})


@app.route("/api/liw-pur-mkt/stock-history")
@jwt_required()
def api_liw_pur_mkt_stock_history():
    user = get_current_user()
    permissions = user.get("permissions", [])
    if user.get("role") != "admin" and "kolaborasi" not in permissions and "pembelian" not in permissions:
        return jsonify({"message": "Akses ditolak"}), 403

    itemno = request.args.get("itemno", "").strip()
    if not itemno:
        return jsonify({"message": "No barang wajib diisi."}), 400
    today = datetime.today()
    date_from = request.args.get("date_from", "").strip() or today.replace(day=1).strftime("%Y-%m-%d")
    date_to = request.args.get("date_to", "").strip() or today.strftime("%Y-%m-%d")

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT
                ar.INVOICENO,
                ar.INVOICEDATE,
                pd.PERSONNO,
                pd.NAME,
                ar.PURCHASEORDERNO,
                so.SONO,
                so.SODATE,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                ar.DESCRIPTION,
                CASE WHEN ar.INVOICEDATE > CURRENT_DATE THEN 1 ELSE 0 END
            FROM ARINV ar
            LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
            LEFT JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            LEFT JOIN SO so ON so.SOID = det.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) <> ''
              AND det.ITEMNO = ?
              AND ar.INVOICEDATE >= ?
              AND ar.INVOICEDATE <= ?
            ORDER BY
                CASE WHEN ar.INVOICEDATE > CURRENT_DATE THEN 0 ELSE 1 END,
                ar.INVOICEDATE DESC,
                ar.INVOICENO,
                det.SEQ
        """, [itemno, date_from, date_to])
        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            data.append({
                "no_pengiriman": str(row[0] or "").strip(),
                "tgl_pengiriman": str(row[1]) if row[1] else "",
                "no_pelanggan": str(row[2] or "").strip(),
                "nama_pelanggan": str(row[3] or "").strip(),
                "no_po": str(row[4] or "").strip(),
                "no_so": str(row[5] or "").strip(),
                "tgl_so": str(row[6]) if row[6] else "",
                "deskripsi_barang": str(row[7] or "").strip(),
                "qty": _to_float(row[8]),
                "uom": str(row[9] or "").strip(),
                "deskripsi": str(row[10] or "").strip(),
                "is_future": bool(int(row[11] or 0)),
            })

        return jsonify({
            "itemno": itemno,
            "date_from": date_from,
            "date_to": date_to,
            "data": data,
            "total_rows": len(data),
            "summary": {
                "qty_total": round(sum(_to_float(row.get("qty")) for row in data), 2),
                "qty_future": round(sum(_to_float(row.get("qty")) for row in data if row.get("is_future")), 2),
            },
        })
    except Exception as e:
        print(f"Error api_liw_pur_mkt_stock_history: {e}")
        return jsonify({"data": [], "total_rows": 0, "summary": {}, "error": str(e)}), 500


@app.route("/api/permintaan/summary")
@jwt_required()
def api_permintaan_summary():
    if not check_permission("permintaan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        vendor_filter = request.args.get("vendor", "").strip()

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions = [
            "rd.ITEMNO IS NOT NULL",
            """EXISTS (
                SELECT 1 FROM USERS creator
                WHERE creator.USERID = r.USERID
                  AND UPPER(TRIM(creator.USERNAME)) = 'ALIKA'
            )""",
        ]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(r.REQNO)         CONTAINING LOWER(?)
                OR LOWER(r.DESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(rd.ITEMNO)    CONTAINING LOWER(?)
                OR LOWER(rd.ITEMOVDESC) CONTAINING LOWER(?)
                OR LOWER(COALESCE(rd.ITEMRESERVED9, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(po.PONO, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(vendor.NAME, '')) CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search, search, search]

        if date_from:
            conditions.append("r.REQDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("r.REQDATE <= ?")
            params_where.append(date_to)

        if vendor_filter:
            conditions.append("UPPER(TRIM(COALESCE(vendor.NAME, ''))) = UPPER(TRIM(?))")
            params_where.append(vendor_filter)

        where_sql = " AND ".join(conditions)
        cur.execute(f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN po.PONO IS NULL AND COALESCE(rd.QTYRECEIVED, 0) = 0 THEN 1 ELSE 0 END),
                SUM(CASE WHEN po.PONO IS NOT NULL AND COALESCE(rd.QTYRECEIVED, 0) = 0 THEN 1 ELSE 0 END),
                SUM(CASE WHEN COALESCE(rd.QTYRECEIVED, 0) > 0 THEN 1 ELSE 0 END),
                SUM(CASE WHEN po.EXPECTED = DATEADD(1 DAY TO CURRENT_DATE) THEN 1 ELSE 0 END),
                SUM(CASE WHEN po.EXPECTED < CURRENT_DATE THEN 1 ELSE 0 END),
                SUM(CASE WHEN po.EXPECTED > DATEADD(1 DAY TO CURRENT_DATE) THEN 1 ELSE 0 END)
            FROM REQUISITION r
            LEFT JOIN REQUISITIONDET rd ON rd.REQID = r.REQID
            LEFT JOIN PODET pd ON pd.REQID = r.REQID AND pd.REQSEQ = rd.SEQ
            LEFT JOIN PO po ON po.POID = pd.POID
            LEFT JOIN PERSONDATA vendor ON vendor.ID = po.VENDORID
            WHERE {where_sql}
        """, params_where)
        row = cur.fetchone()
        con.close()

        return jsonify({
            "total": int(row[0] or 0),
            "menunggu": int(row[1] or 0),
            "dipesan": int(row[2] or 0),
            "diterima": int(row[3] or 0),
            "dt_besok": int(row[4] or 0),
            "late": int(row[5] or 0),
            "on_proses": int(row[6] or 0),
        })

    except Exception as e:
        print(f"Error api_permintaan_summary: {e}")
        return jsonify({
            "total": 0, "menunggu": 0, "dipesan": 0, "diterima": 0,
            "dt_besok": 0, "late": 0, "on_proses": 0, "error": str(e),
        })


@app.route("/api/permintaan/vendor-options")
@jwt_required()
def api_permintaan_vendor_options():
    if not check_permission("permintaan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        conditions = [
            "rd.ITEMNO IS NOT NULL",
            "vendor.NAME IS NOT NULL",
            "TRIM(vendor.NAME) <> ''",
            """EXISTS (
                SELECT 1 FROM USERS creator
                WHERE creator.USERID = r.USERID
                  AND UPPER(TRIM(creator.USERNAME)) = 'ALIKA'
            )""",
        ]
        params = []
        if date_from:
            conditions.append("r.REQDATE >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("r.REQDATE <= ?")
            params.append(date_to)

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT DISTINCT TRIM(vendor.NAME)
            FROM REQUISITION r
            JOIN REQUISITIONDET rd ON rd.REQID = r.REQID
            LEFT JOIN PODET pd ON pd.REQID = r.REQID AND pd.REQSEQ = rd.SEQ
            LEFT JOIN PO po ON po.POID = pd.POID
            LEFT JOIN PERSONDATA vendor ON vendor.ID = po.VENDORID
            WHERE {" AND ".join(conditions)}
            ORDER BY 1
        """, params)
        vendors = [str(row[0] or "").strip() for row in cur.fetchall()]
        con.close()
        return jsonify({"data": vendors})
    except Exception as e:
        print(f"Error api_permintaan_vendor_options: {e}")
        return jsonify({"data": [], "error": str(e)}), 500


@app.route("/api/permintaan/export")
@jwt_required()
def api_permintaan_export():
    if not check_permission("permintaan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        vendor_filter = request.args.get("vendor", "").strip()

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions = [
            "rd.ITEMNO IS NOT NULL",
            """EXISTS (
                SELECT 1 FROM USERS creator
                WHERE creator.USERID = r.USERID
                  AND UPPER(TRIM(creator.USERNAME)) = 'ALIKA'
            )""",
        ]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(r.REQNO)         CONTAINING LOWER(?)
                OR LOWER(r.DESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(rd.ITEMNO)    CONTAINING LOWER(?)
                OR LOWER(rd.ITEMOVDESC) CONTAINING LOWER(?)
                OR LOWER(COALESCE(rd.ITEMRESERVED9, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(po.PONO, '')) CONTAINING LOWER(?)
                OR LOWER(COALESCE(vendor.NAME, '')) CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search, search, search]

        if date_from:
            conditions.append("r.REQDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("r.REQDATE <= ?")
            params_where.append(date_to)

        if vendor_filter:
            conditions.append("UPPER(TRIM(COALESCE(vendor.NAME, ''))) = UPPER(TRIM(?))")
            params_where.append(vendor_filter)

        if status == "menunggu":
            conditions.append("po.PONO IS NULL AND COALESCE(rd.QTYRECEIVED, 0) = 0")
        elif status in ("dipesan", "diproses"):
            conditions.append("po.PONO IS NOT NULL AND COALESCE(rd.QTYRECEIVED, 0) = 0")
        elif status == "diterima":
            conditions.append("COALESCE(rd.QTYRECEIVED, 0) > 0")

        where_sql = " AND ".join(conditions)
        cur.execute(f"""
            SELECT
                r.REQNO,
                r.REQDATE,
                rd.REQDATE,
                r.DESCRIPTION,
                rd.ITEMNO,
                rd.ITEMOVDESC,
                rd.QUANTITY,
                rd.QTYORDERED,
                rd.QTYRECEIVED,
                rd.CLOSED,
                i.ITEMDESCRIPTION,
                i.UNIT1,
                po.PONO,
                rd.ITEMRESERVED9,
                po.PODATE,
                po.EXPECTED,
                vendor.NAME,
                pd.QUANTITY,
                r.REQID,
                rd.SEQ
            FROM REQUISITION r
            LEFT JOIN REQUISITIONDET rd  ON rd.REQID   = r.REQID
            LEFT JOIN ITEM i             ON i.ITEMNO   = rd.ITEMNO
            LEFT JOIN PODET pd           ON pd.REQID   = r.REQID AND pd.REQSEQ = rd.SEQ
            LEFT JOIN PO po              ON po.POID    = pd.POID
            LEFT JOIN PERSONDATA vendor  ON vendor.ID  = po.VENDORID
            WHERE {where_sql}
            ORDER BY r.REQDATE DESC, r.REQNO, rd.SEQ
        """, params_where)
        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            st = _purchase_request_status(row[12], row[8])
            aging = _purchase_request_aging(row[15])
            data.append({
                "no_permintaan":    str(row[0] or "").strip(),
                "tgl_permintaan":   str(row[1]) if row[1] else "",
                "tgl_target":       str(row[2]) if row[2] else "",
                "deskripsi":        str(row[3] or "").strip(),
                "no_barang":        str(row[4] or "").strip(),
                "deskripsi_barang": str(row[5] or str(row[10] or "")).strip(),
                "qty":              float(row[6] or 0),
                "qty_ordered":      float(row[7] or 0),
                "qty_received":     float(row[8] or 0),
                "unit":             str(row[11] or "").strip(),
                "no_po":            str(row[12] or "").strip(),
                "no_so":            str(row[13] or "").strip(),
                "tgl_pesanan_po":   str(row[14]) if row[14] else "",
                "estimasi_po":      str(row[15]) if row[15] else "",
                "vendor":           str(row[16] or "").strip(),
                "qty_po":           float(row[17] or 0),
                "aging":            aging,
                "status_dt_po":     _purchase_request_dt_status(aging),
                "row_key":          f"{int(row[18])}:{int(row[19])}",
                "status":           st,
            })

        remark_map = get_purchase_request_remarks([row["row_key"] for row in data])
        for row in data:
            remark = remark_map.get(row["row_key"], {})
            row["remark"] = remark.get("remark", "")
            row["remark_updated_by"] = remark.get("updated_by", "")
            row["remark_updated_at"] = remark.get("updated_at", "")

        return jsonify({"data": filter_record_columns("permintaan", data), "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_permintaan_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/spm/export")
@jwt_required()
def api_spm_export():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions   = ["det.ITEMNO IS NOT NULL"]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(m.RELEASENO)     CONTAINING LOWER(?)
                OR LOWER(wo.WONO)      CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)   CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(m.DESCRIPTION) CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search]

        if date_from:
            conditions.append("m.RELEASEDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("m.RELEASEDATE <= ?")
            params_where.append(date_to)

        pct_expr = """
            CASE
                WHEN COALESCE(wdm.QUANTITY, 0) > 0 THEN
                    CASE
                        WHEN wdm.QTYTAKEN IS NOT NULL THEN COALESCE(wdm.QTYTAKEN, 0) / wdm.QUANTITY
                        ELSE COALESCE(det.QUANTITY, 0) / wdm.QUANTITY
                    END
                ELSE 0
            END
        """
        if status == "selesai":
            conditions.append(f"({pct_expr}) >= 1")
        elif status == "sebagian":
            conditions.append(f"({pct_expr}) > 0 AND ({pct_expr}) < 1")
        elif status == "belum":
            conditions.append(f"({pct_expr}) <= 0")

        where_sql = " AND ".join(conditions)

        cur.execute(f"""
            SELECT
                m.RELEASENO,
                m.RELEASEDATE,
                wo.WONO,
                wo.WODATE,
                m.DESCRIPTION,
                det.ITEMNO,
                i.ITEMDESCRIPTION,
                det.UNIT,
                det.QUANTITY,
                wdm.QUANTITY,
                wdm.QTYTAKEN
            FROM MATRLS m
            LEFT JOIN WO wo          ON wo.ID        = m.WOID
            LEFT JOIN MATRLSDET det  ON det.MATRLSID = m.ID
            LEFT JOIN WODETMAT wdm   ON wdm.ID       = det.WODETID
            LEFT JOIN ITEM i         ON i.ITEMNO     = det.ITEMNO
            WHERE {where_sql}
            ORDER BY m.RELEASEDATE DESC, m.RELEASENO, det.ID
        """, params_where)

        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            qty_keluar = float(row[8] or 0)
            qty_plan = float(row[9] or 0)
            qty_taken = float(row[10] or 0)
            if qty_plan > 0:
                pct = round(((qty_taken if row[10] is not None else qty_keluar) / qty_plan) * 100, 1)
                pct = min(pct, 100.0)
            else:
                pct = 0.0
            if pct >= 100:
                row_status = "Selesai"
            elif pct > 0:
                row_status = "Sebagian"
            else:
                row_status = "Belum Keluar"
            data.append({
                "no_pengeluaran": str(row[0] or "").strip(),
                "tgl_pengeluaran": str(row[1]) if row[1] else "",
                "no_pk": str(row[2] or "").strip(),
                "tgl_pk": str(row[3]) if row[3] else "",
                "deskripsi": str(row[4] or "").strip(),
                "no_barang": str(row[5] or "").strip(),
                "deskripsi_barang": str(row[6] or "").strip(),
                "satuan": str(row[7] or "").strip(),
                "qty_keluar": qty_keluar,
                "qty_plan": qty_plan,
                "persentase": pct,
                "status": row_status,
            })

        data = filter_record_columns("spm", data)
        return jsonify({"data": data, "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_spm_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})
    
    # ─── DAFTAR PENERIMAAN ───────────────────────────────────────────────────────
# Tabel: APINV + APITMDET + PERSONDATA + PO

@app.route("/api/penerimaan")
@jwt_required()
def api_penerimaan():
    if not check_permission("penerimaan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions   = ["1=1", "det.ITEMNO IS NOT NULL"]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(ai.INVOICENO)      CONTAINING LOWER(?)
                OR LOWER(ai.NOFORM)      CONTAINING LOWER(?)
                OR LOWER(pd.PERSONNO)    CONTAINING LOWER(?)
                OR LOWER(pd.NAME)        CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)     CONTAINING LOWER(?)
                OR LOWER(det.ITEMOVDESC) CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search, search]

        if date_from:
            conditions.append("ai.INVOICEDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("ai.INVOICEDATE <= ?")
            params_where.append(date_to)

        where_sql = " AND ".join(conditions)

        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                ai.INVOICENO,
                ai.NOFORM,
                ai.INVOICEDATE,
                pd.PERSONNO,
                pd.NAME,
                ai.DESCRIPTION,
                det.ITEMNO,
                det.ITEMOVDESC,
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                po.PONO,
                rq.REQNO
            FROM APINV ai
            LEFT JOIN PERSONDATA pd  ON pd.ID         = ai.VENDORID
            LEFT JOIN APITMDET det   ON det.APINVOICEID = ai.APINVOICEID
            LEFT JOIN PO po          ON po.POID        = det.POID
            LEFT JOIN PODET podet    ON podet.POID     = det.POID AND podet.SEQ = det.POSEQ
            LEFT JOIN REQUISITION rq ON rq.REQID       = podet.REQID
            WHERE {where_sql}
            ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO, det.SEQ
        """, [limit, offset] + params_where)

        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            data.append({
                "no_penerimaan":    str(row[0] or "").strip(),
                "no_formulir":      str(row[1] or "").strip(),
                "tgl_penerimaan":   str(row[2]) if row[2] else "",
                "no_pemasok":       str(row[3] or "").strip(),
                "nama_pemasok":     str(row[4] or "").strip(),
                "deskripsi":        str(row[5] or "").strip(),
                "no_barang":        str(row[6] or "").strip(),
                "deskripsi_barang": str(row[7] or "").strip(),
                "qty":              float(row[8] or 0),
                "unit":             str(row[9] or "").strip(),
                "harga":            float(row[10] or 0),
                "no_pesanan":       str(row[11] or "").strip(),
                "no_permintaan":    str(row[12] or "").strip(),
            })

        return jsonify({"data": filter_record_columns("penerimaan", data), "total": len(data)})

    except Exception as e:
        print(f"Error api_penerimaan: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


@app.route("/api/penerimaan/export")
@jwt_required()
def api_penerimaan_export():
    if not check_permission("penerimaan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions   = ["det.ITEMNO IS NOT NULL"]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(ai.INVOICENO)      CONTAINING LOWER(?)
                OR LOWER(ai.NOFORM)      CONTAINING LOWER(?)
                OR LOWER(pd.PERSONNO)    CONTAINING LOWER(?)
                OR LOWER(pd.NAME)        CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)     CONTAINING LOWER(?)
                OR LOWER(det.ITEMOVDESC) CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search, search]

        if date_from:
            conditions.append("ai.INVOICEDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("ai.INVOICEDATE <= ?")
            params_where.append(date_to)

        where_sql = " AND ".join(conditions)
        cur.execute(f"""
            SELECT
                ai.INVOICENO,
                ai.NOFORM,
                ai.INVOICEDATE,
                pd.PERSONNO,
                pd.NAME,
                ai.DESCRIPTION,
                det.ITEMNO,
                det.ITEMOVDESC,
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                po.PONO,
                rq.REQNO
            FROM APINV ai
            LEFT JOIN PERSONDATA pd  ON pd.ID           = ai.VENDORID
            LEFT JOIN APITMDET det   ON det.APINVOICEID = ai.APINVOICEID
            LEFT JOIN PO po          ON po.POID         = det.POID
            LEFT JOIN PODET podet    ON podet.POID      = det.POID AND podet.SEQ = det.POSEQ
            LEFT JOIN REQUISITION rq ON rq.REQID        = podet.REQID
            WHERE {where_sql}
            ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO, det.SEQ
        """, params_where)
        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            data.append({
                "no_penerimaan":    str(row[0] or "").strip(),
                "no_formulir":      str(row[1] or "").strip(),
                "tgl_penerimaan":   str(row[2]) if row[2] else "",
                "no_pemasok":       str(row[3] or "").strip(),
                "nama_pemasok":     str(row[4] or "").strip(),
                "deskripsi":        str(row[5] or "").strip(),
                "no_barang":        str(row[6] or "").strip(),
                "deskripsi_barang": str(row[7] or "").strip(),
                "qty":              float(row[8] or 0),
                "unit":             str(row[9] or "").strip(),
                "harga":            float(row[10] or 0),
                "no_pesanan":       str(row[11] or "").strip(),
                "no_permintaan":    str(row[12] or "").strip(),
            })

        return jsonify({"data": filter_record_columns("penerimaan", data), "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_penerimaan_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/pembelian")
@jwt_required()
def api_pembelian():
    if not can_access_pembelian_request():
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        po_type   = request.args.get("po_type", "").strip().upper()
        exclude_internal_so = request.args.get("exclude_internal_so") in ("1", "true", "yes")
        include_payment = request.args.get("include_payment", "1").lower() not in ("0", "false", "no")
        summary_only = request.args.get("summary_only") in ("1", "true", "yes")
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        if exclude_internal_so:
            data, total_rows = build_liw_pur_mkt_rows(
                cur,
                search=search,
                date_from=date_from,
                date_to=date_to,
                po_type=po_type,
                offset=offset,
                limit=limit,
            )
            con.close()
            return jsonify({"data": filter_record_columns("pembelian", data), "total": total_rows, "total_rows": total_rows})

        conditions   = ["1=1"]
        params_where = []
        if search:
            if exclude_internal_so:
                conditions.append("""(
                    LOWER(po.PONO) CONTAINING LOWER(?) OR LOWER(pd.NAME) CONTAINING LOWER(?)
                    OR LOWER(rd.ITEMNO) CONTAINING LOWER(?) OR LOWER(rd.ITEMOVDESC) CONTAINING LOWER(?)
                    OR LOWER(rq.REQNO) CONTAINING LOWER(?)
                    OR LOWER(rd.ITEMRESERVED9) CONTAINING LOWER(?)
                )""")
            else:
                conditions.append("""(
                    LOWER(po.PONO) CONTAINING LOWER(?) OR LOWER(pd.NAME) CONTAINING LOWER(?)
                    OR LOWER(det.ITEMNO) CONTAINING LOWER(?) OR LOWER(det.ITEMOVDESC) CONTAINING LOWER(?)
                    OR LOWER(rq.REQNO) CONTAINING LOWER(?)
                    OR LOWER(det.ITEMRESERVED9) CONTAINING LOWER(?)
                )""")
            params_where += [search, search, search, search, search, search]
        if date_from:
            conditions.append("rq.REQDATE >= ?" if exclude_internal_so else "po.PODATE >= ?")
            params_where.append(date_from)
        if date_to:
            conditions.append("rq.REQDATE <= ?" if exclude_internal_so else "po.PODATE <= ?")
            params_where.append(date_to)
        po_type_prefixes = {
            "AI-S": "AI-S-",
            "AI-SRV": "AI-SRV",
            "AI-BM": "AI-BM",
            "AI-A": "AI-A",
        }
        if po_type in po_type_prefixes:
            conditions.append("UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH ?")
            params_where.append(po_type_prefixes[po_type])
        if exclude_internal_so:
            conditions.append("UPPER(TRIM(COALESCE(rd.ITEMRESERVED9, ''))) STARTING WITH 'AI-PP'")
        where_sql = " AND ".join(conditions)
        if summary_only and not exclude_internal_so:
            summary_line_discpc = sql_number_expr("det_sum.ITEMDISCPC")
            cur.execute(f"""
                SELECT
                    po.POID,
                    po.PONO,
                    det.QUANTITY,
                    det.UNITPRICE,
                    det.ITEMDISCPC,
                    det.TAXCODES,
                    det.TAXABLEAMOUNT1,
                    po.CASHDISCOUNT,
                    po.CASHDISCPC,
                    (SELECT SUM(
                        COALESCE(det_sum.QUANTITY, 0) * COALESCE(det_sum.UNITPRICE, 0) *
                        (1 - COALESCE({summary_line_discpc}, 0) / 100)
                     )
                     FROM PODET det_sum
                     WHERE det_sum.POID = po.POID),
                    po.TAX2AMOUNT,
                    po.FREIGHT,
                    CASE WHEN EXISTS (
                        SELECT 1
                        FROM APITMDET apdet_recv
                        WHERE apdet_recv.POID = det.POID
                          AND apdet_recv.POSEQ = det.SEQ
                    ) THEN 1 ELSE 0 END
                FROM PO po
                LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                LEFT JOIN PODET det ON det.POID = po.POID
                LEFT JOIN REQUISITION rq ON rq.REQID = det.REQID
                LEFT JOIN REQUISITIONDET rd ON rd.REQID = det.REQID AND rd.SEQ = det.REQSEQ
                LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
                WHERE {where_sql}
            """, params_where)
            summary_rows = cur.fetchall()
            con.close()

            po_map = {}
            gross_amount = 0.0
            discount_amount = 0.0
            grand_total = 0.0
            for row in summary_rows:
                poid = int(row[0] or 0)
                po_entry = po_map.setdefault(poid, {
                    "total": 0,
                    "received": 0,
                    "gross_added": False,
                    "header_added": False,
                })
                po_entry["total"] += 1
                if row[12]:
                    po_entry["received"] += 1

                amounts = _purchase_amounts(
                    row[2], row[3], row[4], row[9], row[7], row[8]
                )
                discount_amount += amounts["diskon"]
                grand_total += (
                    amounts["amount"]
                    - amounts["diskon"]
                    + (_to_float(row[6]) if str(row[5] or "").strip() else 0)
                )
                if not po_entry["gross_added"]:
                    gross_amount += _to_float(row[9])
                    po_entry["gross_added"] = True
                if not po_entry["header_added"]:
                    grand_total += _to_float(row[10]) + _to_float(row[11])
                    po_entry["header_added"] = True

            po_status = {"menunggu": 0, "diproses": 0, "diterima": 0}
            for item in po_map.values():
                if item["received"] <= 0:
                    po_status["menunggu"] += 1
                elif item["received"] >= item["total"]:
                    po_status["diterima"] += 1
                else:
                    po_status["diproses"] += 1

            received_items = sum(1 for row in summary_rows if row[12])
            return jsonify({
                "summary": {
                    "po": {"total": len(po_map), **po_status},
                    "items": {
                        "total": len(summary_rows),
                        "belum": max(len(summary_rows) - received_items, 0),
                        "diterima": received_items,
                    },
                    "grossAmount": round(gross_amount, 2),
                    "discountAmount": round(discount_amount, 2),
                    "amount": round(grand_total, 2),
                }
            })

        if exclude_internal_so:
            cur.execute(f"""
                SELECT COUNT(*)
                FROM REQUISITION rq
                LEFT JOIN REQUISITIONDET rd ON rd.REQID = rq.REQID
                LEFT JOIN PODET det ON det.REQID = rq.REQID AND det.REQSEQ = rd.SEQ
                LEFT JOIN PO po ON po.POID = det.POID
                LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
                LEFT JOIN ITEM i ON i.ITEMNO = rd.ITEMNO
                WHERE {where_sql}
                  AND rd.ITEMNO IS NOT NULL
            """, params_where)
            total_rows = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(f"""
                SELECT FIRST ? SKIP ?
                    po.PONO, po.PODATE, po.EXPECTED,
                    pd.PERSONNO, pd.NAME, COALESCE(po.DESCRIPTION, rq.DESCRIPTION),
                    rd.ITEMNO, COALESCE(rd.ITEMOVDESC, i.ITEMDESCRIPTION), COALESCE(det.QUANTITY, rd.QUANTITY),
                    rd.ITEMUNIT, det.UNITPRICE, det.ITEMDISCPC,
                    det.TAXCODES, det.TAXABLEAMOUNT1, po.TAX1RATE,
                    COALESCE(det.QUANTITY, rd.QUANTITY) * COALESCE(det.UNITPRICE, 0) AS SUBTOTAL,
                    rq.REQNO,
                    rq.REQDATE,
                    rd.REQDATE AS TARGET_RECEIVED,
                    rd.ITEMRESERVED9,
                    (SELECT LIST(DISTINCT ai_recv.INVOICENO, ', ')
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    (SELECT MAX(ai_recv.INVOICEDATE)
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    det.ITEMRESERVED6,
                    po.CASHDISCOUNT,
                    po.CASHDISCPC,
                    (SELECT SUM(
                        COALESCE(det_sum.QUANTITY, 0) * COALESCE(det_sum.UNITPRICE, 0) *
                        (1 - (
                            CASE
                                WHEN TRIM(CAST(det_sum.ITEMDISCPC AS VARCHAR(32))) = '' THEN 0
                                ELSE COALESCE(CAST(det_sum.ITEMDISCPC AS DOUBLE PRECISION), 0)
                            END
                        ) / 100)
                     )
                     FROM PODET det_sum
                     WHERE det_sum.POID = po.POID),
                    po.TAX1AMOUNT,
                    po.TAX2AMOUNT,
                    po.FREIGHT,
                    tm.TERMNAME,
                    tm.NETDAYS,
                    po.POID
                FROM REQUISITION rq
                LEFT JOIN REQUISITIONDET rd ON rd.REQID = rq.REQID
                LEFT JOIN PODET det ON det.REQID = rq.REQID AND det.REQSEQ = rd.SEQ
                LEFT JOIN PO po ON po.POID = det.POID
                LEFT JOIN USERS u ON u.USERID = po.USERID
                LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
                LEFT JOIN ITEM i ON i.ITEMNO = rd.ITEMNO
                WHERE {where_sql}
                  AND rd.ITEMNO IS NOT NULL
                ORDER BY rq.REQDATE DESC, rq.REQNO, rd.SEQ
            """, [limit, offset] + params_where)
        else:
            cur.execute(f"""
                SELECT COUNT(*)
                FROM PO po
                LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                LEFT JOIN PODET det     ON det.POID = po.POID
                LEFT JOIN REQUISITION rq ON rq.REQID = det.REQID
                LEFT JOIN REQUISITIONDET rd ON rd.REQID = det.REQID AND rd.SEQ = det.REQSEQ
                LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
                WHERE {where_sql}
            """, params_where)
            total_rows = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(f"""
                SELECT FIRST ? SKIP ?
                    po.PONO, po.PODATE, po.EXPECTED,
                    pd.PERSONNO, pd.NAME, po.DESCRIPTION,
                    det.ITEMNO, det.ITEMOVDESC, det.QUANTITY,
                    det.ITEMUNIT, det.UNITPRICE, det.ITEMDISCPC,
                    det.TAXCODES, det.TAXABLEAMOUNT1, po.TAX1RATE,
                    det.QUANTITY * det.UNITPRICE AS SUBTOTAL,
                    rq.REQNO,
                    rq.REQDATE,
                    rd.REQDATE AS TARGET_RECEIVED,
                    det.ITEMRESERVED9,
                    (SELECT LIST(DISTINCT ai_recv.INVOICENO, ', ')
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    (SELECT MAX(ai_recv.INVOICEDATE)
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    det.ITEMRESERVED6,
                    po.CASHDISCOUNT,
                    po.CASHDISCPC,
                    (SELECT SUM(
                        COALESCE(det_sum.QUANTITY, 0) * COALESCE(det_sum.UNITPRICE, 0) *
                        (1 - (
                            CASE
                                WHEN TRIM(CAST(det_sum.ITEMDISCPC AS VARCHAR(32))) = '' THEN 0
                                ELSE COALESCE(CAST(det_sum.ITEMDISCPC AS DOUBLE PRECISION), 0)
                            END
                        ) / 100)
                     )
                     FROM PODET det_sum
                     WHERE det_sum.POID = po.POID),
                    po.TAX1AMOUNT,
                    po.TAX2AMOUNT,
                    po.FREIGHT,
                    tm.TERMNAME,
                    tm.NETDAYS,
                    po.POID
                FROM PO po
                LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                LEFT JOIN USERS u ON u.USERID = po.USERID
                LEFT JOIN PODET det     ON det.POID = po.POID
                LEFT JOIN REQUISITION rq ON rq.REQID = det.REQID
                LEFT JOIN REQUISITIONDET rd ON rd.REQID = det.REQID AND rd.SEQ = det.REQSEQ
                LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
                WHERE {where_sql}
                ORDER BY po.PODATE DESC, po.PONO, det.SEQ
            """, [limit, offset] + params_where)
        rows = cur.fetchall()
        sales_refs = _get_purchase_sales_reference_map(cur, rows) if exclude_internal_so else {}
        payment_map = _get_purchase_payment_map(cur, [(row[31], row[0]) for row in rows]) if include_payment else {}
        con.close()
        data = []
        for row in rows:
            qty = float(row[8] or 0); price = float(row[10] or 0)
            disc_pc = float(row[11] or 0); tax_rate = float(row[14] or 0)
            amounts = _purchase_amounts(qty, price, disc_pc, row[25] if len(row) > 25 else 0, row[23] if len(row) > 23 else 0, row[24] if len(row) > 24 else 0)
            ppn_amt  = float(row[13] or 0) if row[12] and row[12].strip() else 0
            nilai_po = (
                float(row[25] or 0)
                + (float(row[26] or 0) if len(row) > 26 else 0)
                + (float(row[27] or 0) if len(row) > 27 else 0)
                + (float(row[28] or 0) if len(row) > 28 else 0)
            )
            poid = int(row[31] or 0) if len(row) > 31 else 0
            payment = payment_map.get(poid, {})
            uang_muka = _to_float(payment.get("uang_muka")) if include_payment else 0
            sisa_po = max(nilai_po - uang_muka, 0)
            no_faktur_pengajuan = ", ".join(payment.get("invoices", [])) if include_payment else ""
            pengajuan_bayar = _to_float(payment.get("pengajuan_bayar")) if include_payment else 0
            dibayar_fat = _to_float(payment.get("dibayar_fat")) if include_payment else 0
            sisa_hutang_fat = max(_to_float(payment.get("sisa_hutang_fat")), 0) if include_payment else 0
            if pengajuan_bayar <= 0.5:
                status_fat = "Belum Diajukan"
            elif sisa_hutang_fat <= 0.5:
                status_fat = "Lunas"
            elif dibayar_fat > 0.5:
                status_fat = "Dibayar Sebagian"
            else:
                status_fat = "Belum Dibayar FAT"
            sales_ref = sales_refs.get((str(row[19] or "").strip().upper(), str(row[6] or "").strip()), {})
            data.append({
                "no_pembelian": str(row[0] or "").strip(), "tgl_pembelian": str(row[1]) if row[1] else "",
                "tgl_ekspetasi": str(row[2]) if row[2] else "",
                "top": str(row[29] or "").strip() if len(row) > 29 and row[29] else (f"{int(row[30])} Hari" if len(row) > 30 and row[30] is not None else ""),
                "no_permintaan": str(row[16] or "").strip(), "tgl_permintaan": str(row[17]) if row[17] else "",
                "tgl_target_permintaan": str(row[18]) if row[18] else "",
                "so_no": str(row[19] or "").strip(),
                "no_penerimaan_barang": str(row[20] or "").strip(),
                "tgl_penerimaan_barang": str(row[21]) if row[21] else "",
                **sales_ref,
                "no_pemasok": str(row[3] or "").strip(), "nama_pemasok": str(row[4] or "").strip(),
                "purchaser": str(row[22] or "").strip() if len(row) > 22 else "",
                "deskripsi": str(row[5] or "").strip(), "no_barang": str(row[6] or "").strip(),
                "deskripsi_barang": str(row[7] or "").strip(), "qty": qty,
                "uom": str(row[9] or "").strip(), "price": price, "disc_pct": disc_pc,
                "diskon": amounts["diskon"],
                "ppn_kode": str(row[12] or "").strip(), "ppn_rate": tax_rate,
                "ppn_amount": round(ppn_amt, 2),
                "pph": float(row[27] or 0) if len(row) > 27 else 0,
                "add_cost": float(row[28] or 0) if len(row) > 28 else 0,
                "dpp": amounts["dpp"],
                "amount": amounts["amount"],
                "nilai_po": round(nilai_po, 2),
                "uang_muka": round(uang_muka, 2),
                "sisa_po": round(sisa_po, 2),
                "status_pembayaran": "Lunas" if nilai_po > 0 and sisa_po <= 0.5 else ("DP" if uang_muka > 0 else "Belum DP"),
                "no_faktur_pengajuan": no_faktur_pengajuan,
                "pengajuan_bayar": round(pengajuan_bayar, 2),
                "dibayar_fat": round(dibayar_fat, 2),
                "sisa_hutang_fat": round(sisa_hutang_fat, 2),
                "status_fat": status_fat,
                "total_easy": round(float(row[25] or 0), 2) if len(row) > 25 else amounts["amount"],
            })
        if exclude_internal_so:
            note_keys = [
                (
                    row.get("no_permintaan", ""),
                    row.get("so_no", ""),
                    row.get("no_pembelian", ""),
                    row.get("no_barang", ""),
                )
                for row in data
            ]
            note_map = get_liw_purchase_notes(note_keys)
            for row in data:
                key = (
                    row.get("no_permintaan", ""),
                    row.get("so_no", ""),
                    row.get("no_pembelian", ""),
                    row.get("no_barang", ""),
                )
                notes = note_map.get(key, {})
                row["note_pesanan"] = notes.get("note_pesanan", "") if isinstance(notes, dict) else ""
                row["note_pengiriman"] = notes.get("note_pengiriman", "") if isinstance(notes, dict) else ""
        return jsonify({"data": filter_record_columns("pembelian", data), "total": total_rows, "total_rows": total_rows})
    except Exception as e:
        print(f"Error api_pembelian: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


# ─── PENJUALAN ───────────────────────────────────────────────────────────────
#
# Query menggabungkan:
#   ARINV      → header invoice penjualan (No Invoice, Tgl, Customer, PO No)
#   ARINVDET   → detail item (No Barang, Deskripsi, Qty, UoM, Price, Disc)
#   PERSONDATA → Nama Pelanggan (PERSONTYPE=0 = customer di database AQPA)
#
# Field output:
#   no_penjualan, tgl_penjualan, no_pelanggan, nama_pelanggan,
#   no_po, deskripsi, no_barang, deskripsi_barang,
#   qty, uom, price, ppn_rate, ppn_amount, amount

@app.route("/api/penjualan")
@jwt_required()
def api_penjualan():
    if not check_permission("invoice"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        # Filter utama berdasarkan debug data:
        # DELIVERYORDER = '0' → invoice asli (GTE-2026-xxxx)
        # DELIVERYORDER = '1' → dokumen pengiriman DO (GTE-DO-xxxx)
        # INVOICETYPE = 1     → faktur biasa
        # ISDP IS NULL/0      → bukan uang muka
        conditions = [
            "ar.DELIVERYORDER = '0'",
            "ar.INVOICETYPE = 1",
            "(ar.ISDP IS NULL OR ar.ISDP = 0)",
        ]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(ar.INVOICENO)          CONTAINING LOWER(?)
                OR LOWER(pd.PERSONNO)        CONTAINING LOWER(?)
                OR LOWER(pd.NAME)            CONTAINING LOWER(?)
                OR LOWER(ar.PURCHASEORDERNO) CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)         CONTAINING LOWER(?)
                OR LOWER(det.ITEMOVDESC)     CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search, search]

        if date_from:
            conditions.append("ar.INVOICEDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("ar.INVOICEDATE <= ?")
            params_where.append(date_to)

        where_sql = " AND ".join(conditions)

        sql = f"""
            SELECT FIRST ? SKIP ?
                ar.INVOICENO,
                ar.INVOICEDATE,
                pd.PERSONNO,
                pd.NAME,
                ar.PURCHASEORDERNO,
                ar.DESCRIPTION,
                det.ITEMNO,
                det.ITEMOVDESC,
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                det.ITEMDISCPC,
                det.TAXCODES,
                ar.TAX1RATE,
                det.TAXABLEAMOUNT1,
                det.QUANTITY * det.UNITPRICE AS SUBTOTAL
            FROM ARINV ar
            LEFT JOIN PERSONDATA pd  ON pd.ID = ar.CUSTOMERID
            LEFT JOIN ARINVDET det   ON det.ARINVOICEID = ar.ARINVOICEID
            WHERE {where_sql}
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO, det.SEQ
        """

        cur.execute(sql, [limit, offset] + params_where)
        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            qty      = float(row[8] or 0)
            price    = float(row[10] or 0)
            disc_pc  = float(row[11] or 0)
            tax_rate = float(row[13] or 0)
            subtotal = qty * price * (1 - disc_pc / 100)
            ppn_amt  = subtotal * tax_rate / 100 if row[12] and row[12].strip() else 0

            data.append({
                "no_penjualan":    str(row[0] or "").strip(),
                "tgl_penjualan":   str(row[1]) if row[1] else "",
                "no_pelanggan":    str(row[2] or "").strip(),
                "nama_pelanggan":  str(row[3] or "").strip(),
                "no_po":           str(row[4] or "").strip(),
                "deskripsi":       str(row[5] or "").strip(),
                "no_barang":       str(row[6] or "").strip(),
                "deskripsi_barang": str(row[7] or "").strip(),
                "qty":             qty,
                "uom":             str(row[9] or "").strip(),
                "price":           price,
                "disc_pct":        disc_pc,
                "ppn_kode":        str(row[12] or "").strip(),
                "ppn_rate":        tax_rate,
                "ppn_amount":      round(ppn_amt, 2),
                "amount":          round(subtotal + ppn_amt, 2),
            })

        return jsonify({"data": filter_record_columns("penjualan", data), "total": len(data)})

    except Exception as e:
        print(f"Error api_penjualan: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


# ─── PENJUALAN SO (Sales Order) ──────────────────────────────────────────────
#
# Query menggabungkan:
#   SO         → header Sales Order (No SO, Tgl, Customer, PO No, Status)
#   SODET      → detail item (No Barang, Qty, QtyShipped, Price, Disc)
#   PERSONDATA → Nama Pelanggan
#   SALESMAN   → Nama Salesman
#   ITEM       → Deskripsi Barang
#
# Status SO per baris barang:
#   Menunggu: belum dikirim sama sekali
#   Diproses: dikirim sebagian
#   Diterima: sudah dikirim semua
#   Ditutup: tidak jadi kirim

def _salesman_where_clause(search="", suspended="all"):
    conditions = ["sm.SALESMANID IS NOT NULL"]
    params = []

    if search:
        conditions.append("""(
            LOWER(sm.FIRSTNAME) CONTAINING LOWER(?)
            OR LOWER(sm.LASTNAME) CONTAINING LOWER(?)
        )""")
        params += [search, search]

    if suspended == "yes":
        conditions.append("COALESCE(sm.SUSPENDED, 0) <> 0")
    elif suspended == "no":
        conditions.append("COALESCE(sm.SUSPENDED, 0) = 0")

    return " AND ".join(conditions), params


def _salesman_order_clause(sort_field="", sort_order=""):
    direction = "DESC" if sort_order == "descend" else "ASC"
    order_map = {
        "salesman_id": "sm.SALESMANID",
        "nama_lengkap": "sm.FIRSTNAME || ' ' || sm.LASTNAME",
    }
    if sort_field not in order_map:
        return "COALESCE(sm.SUSPENDED, 0) ASC, sm.FIRSTNAME ASC, sm.LASTNAME ASC"
    return f"{order_map[sort_field]} {direction}, sm.FIRSTNAME ASC, sm.LASTNAME ASC"


def _salesman_rows_to_records(rows):
    data = []
    for row in rows:
        first_name = str(row[1] or "").strip()
        last_name = str(row[2] or "").strip()
        data.append({
            "salesman_id": int(row[0] or 0),
            "nama_lengkap": " ".join([part for part in [first_name, last_name] if part]).strip(),
        })
    return data


def get_salesman_data(search="", offset=0, limit=1000, suspended="no", include_total=False, sort_field="", sort_order="", year=None):
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params = _salesman_where_clause(search, suspended)

        total = None
        if include_total:
            cur.execute(f"SELECT COUNT(*) FROM SALESMAN sm WHERE {where_sql}", params)
            total = int(cur.fetchone()[0] or 0)

        order_sql = _salesman_order_clause(sort_field, sort_order)
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                sm.SALESMANID,
                sm.FIRSTNAME,
                sm.LASTNAME
            FROM SALESMAN sm
            WHERE {where_sql}
            ORDER BY {order_sql}
        """, [limit, offset] + params)
        rows = cur.fetchall()
        con.close()
        data = _salesman_rows_to_records(rows)
        if year:
            target_map = get_salesman_targets(year)
            for item in data:
                stored = target_map.get(item["salesman_id"], {})
                targets = {month: float((stored.get("targets") or {}).get(month, 0) or 0) for month in range(1, 13)}
                item["targets"] = targets
                item["total_target"] = sum(targets.values())
        if include_total:
            return {"data": data, "total": total if total is not None else len(data)}
        return data
    except Exception as e:
        print(f"Error get_salesman_data: {e}")
        return {"data": [], "total": 0} if include_total else []


def _customer_where_clause(search="", status="active"):
    conditions = ["pd.PERSONTYPE = 0"]
    params = []

    if search:
        conditions.append("""(
            LOWER(pd.PERSONNO) CONTAINING LOWER(?)
            OR LOWER(pd.NAME) CONTAINING LOWER(?)
            OR LOWER(pd.CITY) CONTAINING LOWER(?)
            OR LOWER(pd.CONTACT) CONTAINING LOWER(?)
            OR LOWER(pd.PHONE) CONTAINING LOWER(?)
            OR LOWER(pd.EMAIL) CONTAINING LOWER(?)
        )""")
        params += [search] * 6

    if status == "active":
        conditions.append("COALESCE(pd.SUSPENDED, 0) = 0")
    elif status == "inactive":
        conditions.append("COALESCE(pd.SUSPENDED, 0) <> 0")

    return " AND ".join(conditions), params


def _customer_order_clause(sort_field="", sort_order=""):
    direction = "DESC" if sort_order == "descend" else "ASC"
    order_map = {
        "no_pelanggan": "pd.PERSONNO",
        "nama_pelanggan": "pd.NAME",
        "kota": "pd.CITY",
        "nama_salesman": "sm.FIRSTNAME || ' ' || sm.LASTNAME",
        "balance": "pd.BALANCE",
        "credit_limit": "pd.CREDITLIMIT",
        "status": "pd.SUSPENDED",
    }
    if sort_field not in order_map:
        return "COALESCE(pd.SUSPENDED, 0) ASC, pd.NAME ASC, pd.PERSONNO ASC"
    return f"{order_map[sort_field]} {direction}, pd.NAME ASC, pd.PERSONNO ASC"


def _customer_rows_to_records(rows):
    data = []
    for row in rows:
        first_name = str(row[15] or "").strip()
        last_name = str(row[16] or "").strip()
        suspended = int(row[18] or 0)
        data.append({
            "customer_id": int(row[0] or 0),
            "no_pelanggan": str(row[1] or "").strip(),
            "nama_pelanggan": str(row[2] or "").strip(),
            "alamat": " ".join(str(part or "").strip() for part in [row[3], row[4]] if str(part or "").strip()),
            "kota": str(row[5] or "").strip(),
            "provinsi": str(row[6] or "").strip(),
            "kode_pos": str(row[7] or "").strip(),
            "negara": str(row[8] or "").strip(),
            "kontak": str(row[9] or "").strip(),
            "telepon": str(row[10] or "").strip(),
            "fax": str(row[11] or "").strip(),
            "email": str(row[12] or "").strip(),
            "webpage": str(row[13] or "").strip(),
            "salesman_id": int(row[14] or 0) if row[14] is not None else None,
            "nama_salesman": " ".join(part for part in [first_name, last_name] if part).strip(),
            "credit_limit": float(row[17] or 0),
            "balance": float(row[19] or 0),
            "status": "Nonaktif" if suspended else "Aktif",
            "suspended": suspended,
            "catatan": str(row[20] or "").strip(),
        })
    return data


def get_customer_data(search="", offset=0, limit=1000, status="active", include_total=False, sort_field="", sort_order=""):
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params = _customer_where_clause(search, status)

        total = None
        if include_total:
            cur.execute(f"SELECT COUNT(*) FROM PERSONDATA pd WHERE {where_sql}", params)
            total = int(cur.fetchone()[0] or 0)

        order_sql = _customer_order_clause(sort_field, sort_order)
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                pd.ID,
                pd.PERSONNO,
                pd.NAME,
                pd.ADDRESSLINE1,
                pd.ADDRESSLINE2,
                pd.CITY,
                pd.STATEPROV,
                pd.ZIPCODE,
                pd.COUNTRY,
                pd.CONTACT,
                pd.PHONE,
                pd.FAX,
                pd.EMAIL,
                pd.WEBPAGE,
                pd.SALESMANID,
                sm.FIRSTNAME,
                sm.LASTNAME,
                pd.CREDITLIMIT,
                pd.SUSPENDED,
                pd.BALANCE,
                pd.NOTES
            FROM PERSONDATA pd
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = pd.SALESMANID
            WHERE {where_sql}
            ORDER BY {order_sql}
        """, [limit, offset] + params)
        rows = cur.fetchall()
        con.close()
        data = _customer_rows_to_records(rows)
        if include_total:
            return {"data": data, "total": total if total is not None else len(data)}
        return data
    except Exception as e:
        print(f"Error get_customer_data: {e}")
        return {"data": [], "total": 0} if include_total else []


@app.route("/api/customer")
@jwt_required()
def api_customer():
    if not check_permission("customer"):
        return jsonify({"message": "Akses ditolak"}), 403
    result = get_customer_data(
        search=request.args.get("search", "").strip(),
        offset=int(request.args.get("offset", 0)),
        limit=int(request.args.get("limit", 1000)),
        status=request.args.get("status", "active"),
        include_total=True,
        sort_field=request.args.get("sort_field", ""),
        sort_order=request.args.get("sort_order", ""),
    )
    return jsonify({
        "data": filter_record_columns("customer", result["data"]),
        "total": result["total"],
    })


@app.route("/api/customer/export")
@jwt_required()
def api_customer_export():
    if not check_permission("customer"):
        return jsonify({"message": "Akses ditolak"}), 403
    data = get_customer_data(
        search=request.args.get("search", "").strip(),
        offset=0,
        limit=100000,
        status=request.args.get("status", "active"),
        sort_field=request.args.get("sort_field", ""),
        sort_order=request.args.get("sort_order", ""),
    )
    return jsonify({"data": filter_record_columns("customer", data), "total_rows": len(data)})


@app.route("/api/customer/summary")
@jwt_required()
def api_customer_summary():
    if not check_permission("customer"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT
                COUNT(*),
                SUM(CASE WHEN COALESCE(SUSPENDED, 0) = 0 THEN 1 ELSE 0 END),
                SUM(CASE WHEN COALESCE(SUSPENDED, 0) <> 0 THEN 1 ELSE 0 END),
                SUM(COALESCE(BALANCE, 0))
            FROM PERSONDATA
            WHERE PERSONTYPE = 0
        """)
        row = cur.fetchone() or [0, 0, 0, 0]
        con.close()
        return jsonify({
            "total": int(row[0] or 0),
            "aktif": int(row[1] or 0),
            "nonaktif": int(row[2] or 0),
            "saldo": float(row[3] or 0),
        })
    except Exception as e:
        print(f"Error api_customer_summary: {e}")
        return jsonify({"total": 0, "aktif": 0, "nonaktif": 0, "saldo": 0}), 500


CUSTOMER_REGISTRATION_DOCUMENT_TYPES = [
    {"key": "npwp", "label": "NPWP", "department": "MKT"},
    {"key": "alamat_ho", "label": "Alamat HO", "department": "MKT"},
    {"key": "alamat_kirim", "label": "Alamat Kirim", "department": "MKT"},
    {"key": "alamat_pajak", "label": "Alamat Pajak", "department": "MKT"},
    {"key": "pic_po", "label": "PIC PO", "department": "MKT"},
    {"key": "pic_invoicing", "label": "PIC Invoicing", "department": "MKT"},
    {"key": "top", "label": "TOP", "department": "MKT"},
]
CUSTOMER_REGISTRATION_DOCUMENT_KEYS = {
    item["key"] for item in CUSTOMER_REGISTRATION_DOCUMENT_TYPES
}


def _document_checklist_status(documents):
    required_count = sum(1 for doc in documents.values() if doc["required"])
    completed_count = sum(
        1 for doc in documents.values()
        if doc["required"] and doc["completed"]
    )
    if required_count == 0:
        status = "unconfigured"
    elif completed_count == required_count:
        status = "complete"
    else:
        status = "incomplete"
    return {
        "status": status,
        "required_count": required_count,
        "completed_count": completed_count,
        "progress_pct": round(completed_count / required_count * 100) if required_count else 0,
    }


@app.route("/api/customer-registration-document-completeness")
@jwt_required()
def api_customer_registration_document_completeness():
    if not check_permission("customer_registration_documents"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = str(request.args.get("search", "") or "").strip()
        status = str(request.args.get("customer_status", "active") or "active").strip().lower()
        status_filter = str(request.args.get("status", "") or "").strip().lower()
        offset = max(int(request.args.get("offset", 0)), 0)
        limit = min(max(int(request.args.get("limit", 50)), 1), 200)

        customers = get_customer_data(
            search=search,
            offset=0,
            limit=100000,
            status=status,
            sort_field="nama_pelanggan",
            sort_order="ascend",
        )
        checklist_map = get_customer_registration_document_checklists(
            [row.get("no_pelanggan") for row in customers]
        )

        all_data = []
        for row in customers:
            customer_no = str(row.get("no_pelanggan") or "").strip()
            saved_documents = checklist_map.get(customer_no, {})
            documents = {}
            for document in CUSTOMER_REGISTRATION_DOCUMENT_TYPES:
                saved = saved_documents.get(document["key"], {})
                documents[document["key"]] = {
                    **document,
                    "required": bool(saved.get("required", True)),
                    "completed": bool(saved.get("completed", False)),
                    "updated_by": saved.get("updated_by", ""),
                    "updated_at": saved.get("updated_at", ""),
                    "validated_by": saved.get("validated_by", ""),
                    "validated_at": saved.get("validated_at", ""),
                    "is_custom": False,
                }
            custom_documents = []
            for document_key, saved in saved_documents.items():
                if not saved.get("is_custom"):
                    continue
                custom_document = {
                    "key": document_key,
                    "label": saved.get("label") or "Dokumen Tambahan",
                    "department": saved.get("department") or "LAINNYA",
                    "required": bool(saved.get("required", False)),
                    "completed": bool(saved.get("completed", False)),
                    "updated_by": saved.get("updated_by", ""),
                    "updated_at": saved.get("updated_at", ""),
                    "validated_by": saved.get("validated_by", ""),
                    "validated_at": saved.get("validated_at", ""),
                    "is_custom": True,
                }
                documents[document_key] = custom_document
                custom_documents.append(custom_document)

            progress = _document_checklist_status(documents)
            all_data.append({
                **row,
                "customer_no": customer_no,
                "documents": documents,
                "custom_documents": custom_documents,
                **progress,
            })

        summary = {
            "total": len(all_data),
            "complete": sum(1 for row in all_data if row["status"] == "complete"),
            "incomplete": sum(1 for row in all_data if row["status"] == "incomplete"),
            "unconfigured": sum(1 for row in all_data if row["status"] == "unconfigured"),
        }
        data = [
            row for row in all_data
            if not status_filter or row["status"] == status_filter
        ]
        return jsonify({
            "data": data[offset:offset + limit],
            "total": len(data),
            "summary": summary,
            "document_types": CUSTOMER_REGISTRATION_DOCUMENT_TYPES,
        })
    except Exception as e:
        print(f"Error api_customer_registration_document_completeness: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)}), 500


@app.route("/api/customer-registration-document-completeness/checklist", methods=["POST"])
@jwt_required()
def api_customer_registration_document_completeness_save():
    if not check_permission("customer_registration_documents"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = get_current_user()
    if user.get("role") not in ("admin", "marketing"):
        return jsonify({"message": "Checklist hanya dapat dikelola oleh MKT."}), 403
    try:
        payload = request.get_json(silent=True) or {}
        customer_no = str(payload.get("customer_no") or "").strip()
        document_key = str(payload.get("document_key") or "").strip().lower()
        saved_documents = get_customer_registration_document_checklists([customer_no]).get(customer_no, {})
        is_saved_custom = bool(saved_documents.get(document_key, {}).get("is_custom"))
        if not customer_no or (document_key not in CUSTOMER_REGISTRATION_DOCUMENT_KEYS and not is_saved_custom):
            return jsonify({"message": "Customer atau jenis dokumen tidak valid."}), 400

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 pd.PERSONNO
            FROM PERSONDATA pd
            WHERE UPPER(TRIM(pd.PERSONNO)) = UPPER(TRIM(?))
              AND pd.PERSONTYPE = 0
        """, [customer_no])
        valid_customer = cur.fetchone()
        con.close()
        if not valid_customer:
            return jsonify({"message": "Customer tidak ditemukan di Easy Accounting."}), 404

        saved = save_customer_registration_document_checklist(
            customer_no=customer_no,
            document_key=document_key,
            is_required=bool(payload.get("required")),
            is_completed=bool(payload.get("completed")),
            updated_by=user.get("username"),
            document_label=saved_documents.get(document_key, {}).get("label", ""),
            department=saved_documents.get(document_key, {}).get("department", ""),
            is_custom=is_saved_custom,
        )
        audit_current_user(
            "customer_registration_document_checklist_update",
            "customer_registration_documents",
            f"Update kelengkapan dokumen registrasi customer {customer_no} / {document_key}",
            saved,
        )
        return jsonify({"message": "Checklist dokumen disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_customer_registration_document_completeness_save: {e}")
        return jsonify({"message": "Gagal menyimpan checklist.", "error": str(e)}), 500


@app.route("/api/customer-registration-document-completeness/custom-document", methods=["POST"])
@jwt_required()
def api_customer_registration_custom_document_create():
    if not check_permission("customer_registration_documents"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = get_current_user()
    if user.get("role") not in ("admin", "marketing"):
        return jsonify({"message": "Dokumen tambahan hanya dapat dibuat oleh MKT."}), 403
    try:
        payload = request.get_json(silent=True) or {}
        customer_no = str(payload.get("customer_no") or "").strip()
        label = str(payload.get("label") or "").strip()
        department = str(payload.get("department") or "").strip().upper()
        if not customer_no or not label or not department:
            return jsonify({"message": "Customer, nama dokumen, dan departemen wajib diisi."}), 400
        if len(label) > 100 or len(department) > 20:
            return jsonify({"message": "Nama dokumen atau departemen terlalu panjang."}), 400

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 pd.PERSONNO
            FROM PERSONDATA pd
            WHERE UPPER(TRIM(pd.PERSONNO)) = UPPER(TRIM(?))
              AND pd.PERSONTYPE = 0
        """, [customer_no])
        valid_customer = cur.fetchone()
        con.close()
        if not valid_customer:
            return jsonify({"message": "Customer tidak ditemukan di Easy Accounting."}), 404

        document_key = f"custom_{uuid.uuid4().hex}"
        saved = save_customer_registration_document_checklist(
            customer_no=customer_no,
            document_key=document_key,
            is_required=False,
            is_completed=False,
            updated_by=user.get("username"),
            document_label=label,
            department=department,
            is_custom=True,
        )
        audit_current_user(
            "customer_registration_custom_document_create",
            "customer_registration_documents",
            f"Tambah dokumen registrasi {label} untuk {customer_no}",
            saved,
        )
        return jsonify({"message": "Dokumen tambahan dibuat.", "data": saved})
    except Exception as e:
        print(f"Error api_customer_registration_custom_document_create: {e}")
        return jsonify({"message": "Gagal membuat dokumen tambahan.", "error": str(e)}), 500


@app.route("/api/customer-registration-document-completeness/custom-document", methods=["DELETE"])
@jwt_required()
def api_customer_registration_custom_document_delete():
    if not check_permission("customer_registration_documents"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = get_current_user()
    if user.get("role") not in ("admin", "marketing"):
        return jsonify({"message": "Dokumen tambahan hanya dapat dihapus oleh MKT."}), 403
    try:
        payload = request.get_json(silent=True) or {}
        customer_no = str(payload.get("customer_no") or "").strip()
        document_key = str(payload.get("document_key") or "").strip().lower()
        deleted = delete_customer_registration_custom_document(customer_no, document_key)
        if not deleted:
            return jsonify({"message": "Dokumen tambahan tidak ditemukan."}), 404
        audit_current_user(
            "customer_registration_custom_document_delete",
            "customer_registration_documents",
            f"Hapus dokumen registrasi tambahan {customer_no} / {document_key}",
            {"customer_no": customer_no, "document_key": document_key},
        )
        return jsonify({"message": "Dokumen tambahan dihapus."})
    except Exception as e:
        print(f"Error api_customer_registration_custom_document_delete: {e}")
        return jsonify({"message": "Gagal menghapus dokumen tambahan.", "error": str(e)}), 500


@app.route("/api/salesman")
@jwt_required()
def api_salesman():
    if not check_permission("salesman"):
        return jsonify({"message": "Akses ditolak"}), 403
    year = int(request.args.get("year", datetime.now().year))
    result = get_salesman_data(
        search=request.args.get("search", "").strip(),
        offset=int(request.args.get("offset", 0)),
        limit=int(request.args.get("limit", 1000)),
        suspended=request.args.get("suspended", "no"),
        include_total=request.args.get("include_total") in ("1", "true", "yes"),
        sort_field=request.args.get("sort_field", ""),
        sort_order=request.args.get("sort_order", ""),
        year=year,
    )
    if isinstance(result, dict):
        return jsonify({
            "data": filter_record_columns("salesman", result["data"]),
            "total": result["total"],
        })
    return jsonify(filter_record_columns("salesman", result))


@app.route("/api/salesman/export")
@jwt_required()
def api_salesman_export():
    if not check_permission("salesman"):
        return jsonify({"message": "Akses ditolak"}), 403
    year = int(request.args.get("year", datetime.now().year))
    data = get_salesman_data(
        search=request.args.get("search", "").strip(),
        offset=0,
        limit=100000,
        suspended=request.args.get("suspended", "no"),
        sort_field=request.args.get("sort_field", ""),
        sort_order=request.args.get("sort_order", ""),
        year=year,
    )
    return jsonify({"data": filter_record_columns("salesman", data), "total_rows": len(data)})


@app.route("/api/salesman/targets", methods=["POST"])
@jwt_required()
def api_salesman_save_targets():
    if not check_permission("salesman"):
        return jsonify({"message": "Akses ditolak"}), 403
    data = request.get_json() or {}
    year = int(data.get("year") or datetime.now().year)
    rows = data.get("rows") or []
    saved = save_salesman_targets(year, rows, get_current_user().get("username"))
    audit_current_user(
        "save_targets",
        "salesman",
        f"Simpan target salesman tahun {year}",
        {"year": year, "rows": len(rows), "saved_cells": saved},
    )
    return jsonify({"message": "Target salesman berhasil disimpan", "saved_cells": saved})


@app.route("/api/salesman/summary")
@jwt_required()
def api_salesman_summary():
    if not check_permission("salesman"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT
                COUNT(*),
                SUM(CASE WHEN COALESCE(SUSPENDED, 0) = 0 THEN 1 ELSE 0 END),
                SUM(CASE WHEN COALESCE(SUSPENDED, 0) <> 0 THEN 1 ELSE 0 END)
            FROM SALESMAN
        """)
        row = cur.fetchone() or [0, 0, 0]
        con.close()
        return jsonify({
            "total": int(row[0] or 0),
            "aktif": int(row[1] or 0),
            "dihentikan": int(row[2] or 0),
        })
    except Exception as e:
        print(f"Error api_salesman_summary: {e}")
        return jsonify({"total": 0, "aktif": 0, "dihentikan": 0}), 500


def _so_line_closed_expr(cur):
    det_columns = set(_get_table_columns(cur, "SODET"))
    det_closed_col = _match_column(det_columns, ("CLOSED", "ISCLOSED", "CLOSE", "CANCELLED", "CANCELED"))
    if det_closed_col:
        return f"COALESCE(det.{_identifier(det_closed_col)}, 0)"
    return "COALESCE(so.CLOSED, 0)"


def _so_select_sql(line_closed_expr):
    return f"""
        {_SO_SELECT},
        {line_closed_expr} AS LINE_CLOSED
    """


def _so_net_dpp_amount(subtotal, order_subtotal, cash_discount, cash_disc_pc):
    """DPP baris setelah diskon header, tanpa PPN/PPH."""
    subtotal = float(subtotal or 0)
    order_subtotal = float(order_subtotal or 0)
    cash_discount = float(cash_discount or 0)
    cash_disc_pc = float(cash_disc_pc or 0)
    header_discount = cash_discount if cash_discount else order_subtotal * cash_disc_pc / 100
    if order_subtotal <= 0 or header_discount <= 0:
        return subtotal
    return subtotal * max(1 - (header_discount / order_subtotal), 0)


def _so_where_clause(search, date_from, date_to, status, line_closed_expr="COALESCE(so.CLOSED, 0)"):
    """Buat WHERE clause + params untuk SO query."""
    conditions = ["det.ITEMNO IS NOT NULL"]
    params = []

    if search:
        conditions.append("""(
            LOWER(so.SONO)            CONTAINING LOWER(?)
            OR LOWER(pd.NAME)         CONTAINING LOWER(?)
            OR LOWER(so.PONO)         CONTAINING LOWER(?)
            OR LOWER(det.ITEMNO)      CONTAINING LOWER(?)
            OR LOWER(det.ITEMOVDESC)  CONTAINING LOWER(?)
            OR LOWER(i.RESERVED9)     CONTAINING LOWER(?)
            OR (LOWER(?) = 'non gte' AND (
                NULLIF(TRIM(i.RESERVED9), '') IS NULL
                OR (
                    UPPER(TRIM(i.RESERVED9)) CONTAINING 'TANPA'
                    AND UPPER(TRIM(i.RESERVED9)) CONTAINING 'CATEGORY'
                )
            ))
        )""")
        params += [search, search, search, search, search, search, search]

    if date_from:
        conditions.append("so.SODATE >= ?")
        params.append(date_from)

    if date_to:
        conditions.append("so.SODATE <= ?")
        params.append(date_to)

    if status == "waiting":
        conditions.append(f"{line_closed_expr} = 0 AND COALESCE(det.QTYSHIPPED, 0) <= 0")
    elif status == "process":
        conditions.append(f"{line_closed_expr} = 0 AND COALESCE(det.QTYSHIPPED, 0) > 0 AND COALESCE(det.QTYSHIPPED, 0) < COALESCE(det.QUANTITY, 0)")
    elif status == "received":
        conditions.append("COALESCE(det.QUANTITY, 0) > 0 AND COALESCE(det.QTYSHIPPED, 0) >= COALESCE(det.QUANTITY, 0)")
    elif status == "closed":
        conditions.append(f"{line_closed_expr} <> 0 AND (COALESCE(det.QUANTITY, 0) <= 0 OR COALESCE(det.QTYSHIPPED, 0) < COALESCE(det.QUANTITY, 0))")

    return " AND ".join(conditions), params


def _build_so_rows(rows, delivery_map=None):
    """Convert raw DB rows ke list dict untuk SO."""
    delivery_map = delivery_map or {}
    data = []
    for row in rows:
        qty           = float(row[9]  or 0)
        qty_shipped   = float(row[10] or 0)
        unit_price    = float(row[11] or 0)
        disc_pc       = float(row[12] or 0)
        tax_rate      = float(row[19] or 0)
        order_subtotal = float(row[23] or 0)
        cash_discount = float(row[24] or 0)
        cash_disc_pc = float(row[25] or 0)
        stok_tersedia = float(row[26] or 0)
        delivery = delivery_map.get((int(row[27] or 0), str(row[8] or "").strip()), {})
        category_produk = str(row[28] or "").strip() if len(row) > 28 else ""
        normalized_category = category_produk.upper().replace("\u00a0", " ")
        if (
            not category_produk
            or category_produk.upper() == "TANPA CATEGORY"
            or ("TANPA" in normalized_category and "CATEGORY" in normalized_category)
        ):
            category_produk = "NON GTE"
        line_closed = int(row[29] or 0) if len(row) > 29 else 0

        subtotal  = qty * unit_price * (1 - disc_pc / 100)
        net_dpp_amount = _so_net_dpp_amount(subtotal, order_subtotal, cash_discount, cash_disc_pc)
        discount_amount = max(subtotal - net_dpp_amount, 0)
        ppn_amt   = subtotal * tax_rate / 100 if tax_rate > 0 else 0
        sisa_kirim = max(qty - qty_shipped, 0)

        if qty > 0 and qty_shipped >= qty:
            status_label = "Diterima"
        elif line_closed:
            status_label = "Ditutup"
        elif qty_shipped > 0:
            status_label = "Diproses"
        else:
            status_label = "Menunggu"

        data.append({
            "no_so":            str(row[0]  or "").strip(),
            "tgl_so":           str(row[1])  if row[1]  else "",
            "tgl_estimasi":     str(row[2])  if row[2]  else "",
            "no_pelanggan":     str(row[3]  or "").strip(),
            "nama_pelanggan":   str(row[4]  or "").strip(),
            "no_po_customer":   str(row[5]  or "").strip(),
            "deskripsi_so":     str(row[6]  or "").strip(),
            "nama_salesman":    str(row[7]  or "").strip(),
            "no_barang":        str(row[8]  or "").strip(),
            "deskripsi_barang": str(row[13] or "").strip(),
            "category_produk":  category_produk,
            "qty":              qty,
            "qty_shipped":      qty_shipped,
            "sisa_kirim":       sisa_kirim,
            "stok_tersedia":    stok_tersedia,
            "uom":              str(row[14] or "").strip(),
            "unit_price":       unit_price,
            "disc_pct":         disc_pc,
            "disc_header_pct":  cash_disc_pc,
            "disc_header_amount": round(cash_discount, 2),
            "discount_amount":  round(discount_amount, 2),
            "ppn_rate":         tax_rate,
            "ppn_amount":       round(ppn_amt, 2),
            "subtotal":         round(subtotal, 2),
            "amount":           round(net_dpp_amount, 2),
            "no_pengiriman":    delivery.get("no_pengiriman", ""),
            "tgl_pengiriman":   delivery.get("tgl_pengiriman", ""),
            "status":           status_label,
            "shipto":           str(row[15] or "").strip(),
            "glperiod":         int(row[16] or 0),
            "glyear":           int(row[17] or 0),
            "invamount":        float(row[18] or 0),
            "_status_debug": {
                "line_closed": line_closed,
                "qty": qty,
                "qty_shipped": qty_shipped,
            },
        })
    return data


_SO_SELECT = """
    so.SONO,
    so.SODATE,
    so.ESTSHIPDATE,
    pd.PERSONNO,
    pd.NAME,
    so.PONO,
    so.DESCRIPTION,
    COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''),
    det.ITEMNO,
    det.QUANTITY,
    det.QTYSHIPPED,
    det.UNITPRICE,
    det.DISCPC,
    COALESCE(det.ITEMOVDESC, i.ITEMDESCRIPTION),
    det.ITEMUNIT,
    so.SHIPTO1,
    so.GLPERIOD,
    so.GLYEAR,
    so.INVAMOUNT,
    so.TAX1RATE,
    so.APPROVED,
    so.CLOSED,
    so.PROCEED,
    (SELECT SUM(
        COALESCE(det_sub.QUANTITY, 0)
        * COALESCE(det_sub.UNITPRICE, 0)
        * (1 - COALESCE(CAST(det_sub.DISCPC AS DOUBLE PRECISION), 0) / 100)
     )
     FROM SODET det_sub
     WHERE det_sub.SOID = so.SOID
       AND det_sub.ITEMNO IS NOT NULL),
    so.CASHDISCOUNT,
    so.CASHDISCPC,
    (
        COALESCE((
            SELECT SUM(h.QUANTITY)
            FROM ITEMHIST h
            JOIN WAREHS wh ON wh.WAREHOUSEID = h.WAREHOUSEID
            WHERE h.ITEMNO = det.ITEMNO
              AND UPPER(TRIM(wh.NAME)) = 'CENTRE'
        ), 0)
        + COALESCE((
            SELECT SUM(
                CASE
                    WHEN wt.TOWHID = wh.WAREHOUSEID THEN wd.QUANTITY
                    WHEN wt.FROMWHID = wh.WAREHOUSEID THEN -wd.QUANTITY
                    ELSE 0
                END
            )
            FROM WTRANDET wd
            JOIN WTRAN wt ON wt.TRANSFERID = wd.TRANSFERID
            JOIN WAREHS wh ON UPPER(TRIM(wh.NAME)) = 'CENTRE'
            WHERE wd.ITEMNO = det.ITEMNO
              AND (wt.TOWHID = wh.WAREHOUSEID OR wt.FROMWHID = wh.WAREHOUSEID)
        ), 0)
    ),
    so.SOID,
    CASE
        WHEN NULLIF(TRIM(i.RESERVED9), '') IS NULL
             OR (
                UPPER(TRIM(i.RESERVED9)) CONTAINING 'TANPA'
                AND UPPER(TRIM(i.RESERVED9)) CONTAINING 'CATEGORY'
             )
        THEN 'NON GTE'
        ELSE TRIM(i.RESERVED9)
    END
"""

_SO_FROM = """
    FROM SO so
    LEFT JOIN PERSONDATA pd  ON pd.ID = so.CUSTOMERID
    LEFT JOIN SALESMAN   sm  ON sm.SALESMANID = so.SALESMANID
    LEFT JOIN SODET      det ON det.SOID = so.SOID
    LEFT JOIN ITEM       i   ON i.ITEMNO = det.ITEMNO
"""


def _get_so_delivery_map(cur, rows):
    soids = []
    seen = set()
    for row in rows:
        soid = int(row[27] or 0)
        if not soid:
            continue
        if soid not in seen:
            seen.add(soid)
            soids.append(soid)

    if not soids:
        return {}

    delivery_map = {}
    chunk_size = 500
    for start in range(0, len(soids), chunk_size):
        chunk = soids[start:start + chunk_size]
        placeholders = ",".join(["?"] * len(chunk))

        cur.execute(f"""
            SELECT
                ard.SOID,
                ard.ITEMNO,
                LIST(DISTINCT ar.INVOICENO, ', '),
                MAX(ar.INVOICEDATE)
            FROM ARINV ar
            LEFT JOIN ARINVDET ard ON ard.ARINVOICEID = ar.ARINVOICEID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(ar.DELIVERYORDER) <> ''
              AND ard.SOID IN ({placeholders})
            GROUP BY ard.SOID, ard.ITEMNO
        """, chunk)

        for soid, itemno, no_pengiriman, tgl_pengiriman in cur.fetchall():
            delivery_map[(int(soid or 0), str(itemno or "").strip())] = {
                "no_pengiriman": str(no_pengiriman or "").strip(),
                "tgl_pengiriman": str(tgl_pengiriman) if tgl_pengiriman else "",
            }
    return delivery_map


def _status_rank(status):
    return {
        "Menunggu": 0,
        "Diproses": 1,
        "Diterima": 2,
        "Ditutup": 3,
    }.get(status, 0)


def _build_sales_daily_report(rows):
    so_map = {}
    marketing_map = {}
    category_map = {}
    category_keys = ["EJF", "GPP", "OTM", "SWG", "NON GTE"]

    for row in rows:
        no_so = row.get("no_so") or "-"
        entry = so_map.setdefault(no_so, {
            "key": no_so,
            "penjual": row.get("nama_salesman") or "Tanpa Marketing",
            "no_customer": row.get("no_pelanggan") or "",
            "customer": row.get("nama_pelanggan") or "",
            "no_so": no_so,
            "no_po": row.get("no_po_customer") or "",
            "tgl_so": row.get("tgl_so") or "",
            "target_kirim": row.get("tgl_estimasi") or "",
            "sub_total": 0.0,
            "nilai_faktur": 0.0,
            "jumlah_faktur": 0.0,
            "status_faktur": row.get("status") or "Menunggu",
            "line_count": 0,
        })
        amount = float(row.get("amount") or 0)
        ppn_amount = float(row.get("ppn_amount") or 0)
        entry["sub_total"] += amount
        entry["nilai_faktur"] += amount
        entry["jumlah_faktur"] += amount + ppn_amount
        entry["line_count"] += 1
        if row.get("no_po_customer") and not entry["no_po"]:
            entry["no_po"] = row.get("no_po_customer")
        if _status_rank(row.get("status")) > _status_rank(entry["status_faktur"]):
            entry["status_faktur"] = row.get("status")

        marketing_name = entry["penjual"]
        marketing = marketing_map.setdefault(marketing_name, {
            "key": marketing_name,
            "marketing": marketing_name,
            "so_seen": set(),
            "total_so": 0,
            "total_faktur": 0.0,
        })
        marketing["so_seen"].add(no_so)
        marketing["total_faktur"] += amount + ppn_amount

        category = (row.get("code_product") or "").strip().upper()
        if not category or category not in category_keys:
            category = "NON GTE"
        qty = float(row.get("qty") or 0)
        qty_entry = category_map.setdefault(marketing_name, {
            "key": marketing_name,
            "marketing": marketing_name,
            **{key: 0.0 for key in category_keys},
            "grand_total": 0.0,
        })
        qty_entry[category] += qty
        qty_entry["grand_total"] += qty

    so_rows = sorted(so_map.values(), key=lambda row: (row.get("tgl_so") or "", row.get("no_so") or ""), reverse=True)
    for row in so_rows:
        row["sub_total"] = round(row["sub_total"], 2)
        row["nilai_faktur"] = round(row["nilai_faktur"], 2)
        row["jumlah_faktur"] = round(row["jumlah_faktur"], 2)

    marketing_rows = []
    for item in marketing_map.values():
        item["total_so"] = len(item.pop("so_seen"))
        item["total_faktur"] = round(item["total_faktur"], 2)
        marketing_rows.append(item)
    marketing_rows.sort(key=lambda row: row["total_faktur"], reverse=True)

    quantity_rows = list(category_map.values())
    quantity_rows.sort(key=lambda row: row["grand_total"], reverse=True)

    totals = {
        "total_so": len(so_rows),
        "total_faktur": round(sum(row["jumlah_faktur"] for row in so_rows), 2),
        "quantity": {key: round(sum(row[key] for row in quantity_rows), 2) for key in category_keys},
    }
    totals["quantity"]["grand_total"] = round(sum(row["grand_total"] for row in quantity_rows), 2)

    return {
        "rows": so_rows,
        "marketing_summary": marketing_rows,
        "quantity_summary": quantity_rows,
        "totals": totals,
        "category_keys": category_keys,
    }


@app.route("/api/dashboard-sales-daily-report")
@jwt_required()
def api_dashboard_sales_daily_report():
    if not check_permission("penjualan"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        if not date_from or not date_to:
            today = datetime.now().date()
            date_from = date_from or today.isoformat()
            date_to = date_to or today.isoformat()

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        line_closed_expr = _so_line_closed_expr(cur)
        where_sql, params_where = _so_where_clause("", date_from, date_to, "", line_closed_expr)
        so_select = _so_select_sql(line_closed_expr)

        cur.execute(f"""
            SELECT
                {so_select},
                COALESCE(NULLIF(TRIM(i.RESERVED8), ''), 'NON GTE') AS CODE_PRODUCT
            {_SO_FROM}
            WHERE {where_sql}
            ORDER BY so.SODATE DESC, so.SONO, det.SEQ
        """, params_where)
        raw_rows = cur.fetchall()
        delivery_map = _get_so_delivery_map(cur, raw_rows)
        con.close()

        rows = _build_so_rows(raw_rows, delivery_map)
        for index, row in enumerate(rows):
            row["code_product"] = str(raw_rows[index][29] or "NON GTE").strip() if len(raw_rows[index]) > 29 else "NON GTE"

        report = _build_sales_daily_report(rows)
        return jsonify({
            "period": {"date_from": date_from, "date_to": date_to},
            **report,
        })
    except Exception as e:
        print(f"Error api_dashboard_sales_daily_report: {e}")
        return jsonify({
            "rows": [],
            "marketing_summary": [],
            "quantity_summary": [],
            "totals": {"total_so": 0, "total_faktur": 0, "quantity": {}},
            "category_keys": ["EJF", "GPP", "OTM", "SWG", "NON GTE"],
            "error": str(e),
        }), 500


@app.route("/api/penjualan-flow-summary")
@app.route("/api/penjualan/flow-summary")
@jwt_required()
def api_penjualan_flow_summary():
    """Ringkasan alur penjualan: jumlah dokumen SO, status SO, dan DO."""
    if not (check_permission("penjualan") or check_permission("penjualan_do")):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")

        if not date_from or not date_to:
            today = datetime.now().date()
            period = request.args.get("period", "month")
            start = today - timedelta(days=today.weekday()) if period == "week" else today.replace(day=1)
            date_from = date_from or start.isoformat()
            date_to = date_to or today.isoformat()

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        det_discpc = sql_number_expr("det.DISCPC")
        so_cash_discount = sql_number_expr("so.CASHDISCOUNT")
        so_cash_discpc = sql_number_expr("so.CASHDISCPC")
        line_closed_expr = _so_line_closed_expr(cur)
        so_where_sql, so_params = _so_where_clause("", date_from, date_to, "", line_closed_expr)

        cur.execute(f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN COALESCE(det.QUANTITY, 0) > 0 AND COALESCE(det.QTYSHIPPED, 0) >= COALESCE(det.QUANTITY, 0) THEN 1 ELSE 0 END),
                SUM(CASE WHEN {line_closed_expr} = 0 AND COALESCE(det.QTYSHIPPED, 0) > 0 AND COALESCE(det.QTYSHIPPED, 0) < COALESCE(det.QUANTITY, 0) THEN 1 ELSE 0 END),
                SUM(CASE WHEN {line_closed_expr} <> 0 AND (COALESCE(det.QUANTITY, 0) <= 0 OR COALESCE(det.QTYSHIPPED, 0) < COALESCE(det.QUANTITY, 0)) THEN 1 ELSE 0 END),
                SUM(CASE WHEN {line_closed_expr} = 0 AND COALESCE(det.QTYSHIPPED, 0) <= 0 THEN 1 ELSE 0 END),
                SUM(CASE WHEN {line_closed_expr} = 0 AND COALESCE(det.QUANTITY, 0) > COALESCE(det.QTYSHIPPED, 0) THEN 1 ELSE 0 END),
                SUM(COALESCE(det.QUANTITY, 0)),
                SUM(COALESCE(det.QTYSHIPPED, 0))
            {_SO_FROM}
            WHERE {so_where_sql}
        """, so_params)
        so_item_row = cur.fetchone() or [0, 0, 0, 0, 0, 0, 0, 0]

        cur.execute(f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN x.status_key = 'received' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'process' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'closed' THEN 1 ELSE 0 END),
                SUM(CASE WHEN x.status_key = 'waiting' THEN 1 ELSE 0 END),
                SUM(x.pending_delivery),
                SUM(x.qty_order),
                SUM(x.qty_shipped),
                SUM(x.sales_amount)
            FROM (
                SELECT
                    y.SOID,
                    y.qty_order,
                    y.qty_shipped,
                    y.sales_amount,
                    CASE
                        WHEN y.header_closed <> 0 THEN 'closed'
                        WHEN y.qty_order > 0 AND y.qty_shipped >= y.qty_order THEN 'received'
                        WHEN y.qty_shipped > 0 THEN 'process'
                        ELSE 'waiting'
                    END AS status_key,
                    CASE WHEN y.header_closed = 0 AND y.qty_order > y.qty_shipped THEN 1 ELSE 0 END AS pending_delivery
                FROM (
                    SELECT
                        so.SOID,
                        SUM(COALESCE(det.QUANTITY, 0)) AS qty_order,
                        SUM(COALESCE(det.QTYSHIPPED, 0)) AS qty_shipped,
                        SUM(
                            COALESCE(det.QUANTITY, 0)
                            * COALESCE(det.UNITPRICE, 0)
                            * (1 - COALESCE({det_discpc}, 0) / 100)
                        )
                        - CASE
                            WHEN COALESCE(MAX({so_cash_discount}), 0) <> 0
                                THEN COALESCE(MAX({so_cash_discount}), 0)
                            ELSE
                                SUM(
                                    COALESCE(det.QUANTITY, 0)
                                    * COALESCE(det.UNITPRICE, 0)
                                    * (1 - COALESCE({det_discpc}, 0) / 100)
                                ) * COALESCE(MAX({so_cash_discpc}), 0) / 100
                          END AS sales_amount,
                        MAX(COALESCE(so.CLOSED, 0)) AS header_closed,
                        MAX({line_closed_expr}) AS any_closed
                    {_SO_FROM}
                    WHERE {so_where_sql}
                    GROUP BY so.SOID
                ) y
            ) x
        """, so_params)
        so_row = cur.fetchone() or [0, 0, 0, 0, 0, 0, 0, 0, 0]

        period = request.args.get("period", "month")
        current_from = datetime.strptime(date_from, "%Y-%m-%d").date()
        current_to = datetime.strptime(date_to, "%Y-%m-%d").date()
        if period == "week":
            prev_from = current_from - timedelta(days=7)
            prev_to = current_to - timedelta(days=7)
        elif period == "month":
            first_this_month = current_from.replace(day=1)
            prev_to = first_this_month - timedelta(days=1)
            prev_from = prev_to.replace(day=1)
        else:
            period_days = max((current_to - current_from).days + 1, 1)
            prev_to = current_from - timedelta(days=1)
            prev_from = prev_to - timedelta(days=period_days - 1)

        prev_so_where_sql, prev_so_params = _so_where_clause("", prev_from.isoformat(), prev_to.isoformat(), "", line_closed_expr)
        cur.execute(f"""
            SELECT SUM(x.sales_amount)
            FROM (
                SELECT
                    SUM(
                        COALESCE(det.QUANTITY, 0)
                        * COALESCE(det.UNITPRICE, 0)
                        * (1 - COALESCE({det_discpc}, 0) / 100)
                    )
                    - CASE
                        WHEN COALESCE(MAX({so_cash_discount}), 0) <> 0
                            THEN COALESCE(MAX({so_cash_discount}), 0)
                        ELSE
                            SUM(
                                COALESCE(det.QUANTITY, 0)
                                * COALESCE(det.UNITPRICE, 0)
                                * (1 - COALESCE({det_discpc}, 0) / 100)
                            ) * COALESCE(MAX({so_cash_discpc}), 0) / 100
                      END AS sales_amount
                {_SO_FROM}
                WHERE {prev_so_where_sql}
                GROUP BY so.SOID
            ) x
        """, prev_so_params)
        prev_sales_amount = float((cur.fetchone() or [0])[0] or 0)

        target_map = get_salesman_targets(current_from.year)
        monthly_target_amount = sum(
            float((item.get("targets") or {}).get(current_from.month, 0) or 0)
            for item in target_map.values()
        )
        target_month_from = current_from.replace(day=1)
        target_month_to = current_to

        do_where_sql, do_params = _do_where_clause("", date_from, date_to)
        cur.execute(f"""
            SELECT
                COUNT(DISTINCT ar.ARINVOICEID),
                COUNT(*)
            {_DO_FROM}
            WHERE {do_where_sql}
        """, do_params)
        do_row = cur.fetchone() or [0, 0]
        con.close()

        total_qty = float(so_row[6] or 0)
        shipped_qty = float(so_row[7] or 0)
        sales_amount = float(so_row[8] or 0)
        if prev_sales_amount:
            sales_change_pct = ((sales_amount - prev_sales_amount) / prev_sales_amount) * 100
        elif sales_amount > 0:
            sales_change_pct = 100
        else:
            sales_change_pct = 0
        target_achievement_pct = (sales_amount / monthly_target_amount * 100) if monthly_target_amount else 0
        item_total_qty = float(so_item_row[6] or 0)
        item_shipped_qty = float(so_item_row[7] or 0)
        menunggu = int(so_row[4] or 0)
        diproses = int(so_row[2] or 0)
        diterima = int(so_row[1] or 0)
        ditutup = int(so_row[3] or 0)
        pending_delivery = int(so_row[5] or 0)

        return jsonify({
            "period": request.args.get("period", "month"),
            "date_from": date_from,
            "date_to": date_to,
            "sales": {
                "current_amount": sales_amount,
                "previous_amount": prev_sales_amount,
                "change_pct": round(sales_change_pct, 2),
                "direction": "up" if sales_change_pct >= 0 else "down",
                "comparison_label": "minggu lalu" if period == "week" else ("bulan lalu" if period == "month" else "periode lalu"),
                "monthly_target_amount": monthly_target_amount,
                "target_achievement_pct": round(target_achievement_pct, 1),
                "target_month_from": target_month_from.isoformat(),
                "target_month_to": target_month_to.isoformat(),
            },
            "so": {
                "total": int(so_row[0] or 0),
                "waiting": menunggu,
                "process": diproses,
                "received": diterima,
                "closed": ditutup,
                "pending_delivery": pending_delivery,
                "menunggu": menunggu,
                "diproses": diproses,
                "diterima": diterima,
                "ditutup": ditutup,
                "qty_order": total_qty,
                "qty_shipped": shipped_qty,
                "qty_belum_dikirim": max(total_qty - shipped_qty, 0),
                "sales_amount": sales_amount,
            },
            "so_items": {
                "total": int(so_item_row[0] or 0),
                "waiting": int(so_item_row[4] or 0),
                "process": int(so_item_row[2] or 0),
                "received": int(so_item_row[1] or 0),
                "closed": int(so_item_row[3] or 0),
                "pending_delivery": int(so_item_row[5] or 0),
                "menunggu": int(so_item_row[4] or 0),
                "diproses": int(so_item_row[2] or 0),
                "diterima": int(so_item_row[1] or 0),
                "ditutup": int(so_item_row[3] or 0),
                "qty_order": item_total_qty,
                "qty_shipped": item_shipped_qty,
                "qty_belum_dikirim": max(item_total_qty - item_shipped_qty, 0),
            },
            "do": {
                "total": int(do_row[0] or 0),
                "lines": int(do_row[1] or 0),
                "pending_delivery": pending_delivery,
                "belum_dikirim": pending_delivery,
            },
        })

    except Exception as e:
        print(f"Error api_penjualan_flow_summary: {e}")
        return jsonify({
            "period": request.args.get("period", "month"),
            "date_from": request.args.get("date_from", ""),
            "date_to": request.args.get("date_to", ""),
            "sales": {
                "current_amount": 0, "previous_amount": 0, "change_pct": 0,
                "direction": "up", "comparison_label": "periode lalu",
                "monthly_target_amount": 0, "target_achievement_pct": 0,
                "target_month_from": "", "target_month_to": "",
            },
            "so": {
                "total": 0, "waiting": 0, "process": 0, "received": 0, "closed": 0,
                "pending_delivery": 0, "menunggu": 0, "diproses": 0, "diterima": 0,
                "ditutup": 0, "qty_order": 0, "qty_shipped": 0, "qty_belum_dikirim": 0,
            },
            "so_items": {
                "total": 0, "waiting": 0, "process": 0, "received": 0, "closed": 0,
                "pending_delivery": 0, "menunggu": 0, "diproses": 0, "diterima": 0,
                "ditutup": 0, "qty_order": 0, "qty_shipped": 0, "qty_belum_dikirim": 0,
            },
            "do": {"total": 0, "lines": 0, "pending_delivery": 0, "belum_dikirim": 0},
            "error": str(e),
        }), 500


def _get_penjualan_so_data(options=None):
    options = options or request.args
    search = options.get("search", "")
    date_from = options.get("date_from", "")
    date_to = options.get("date_to", "")
    status = options.get("status", "")
    offset = int(options.get("offset", 0))
    limit = int(options.get("limit", 50))
    if offset < 0 or not 1 <= limit <= 1000:
        raise ValueError("offset minimal 0 dan limit harus antara 1-1000")

    sort_columns = {
        "no_so": "so.SONO",
        "tgl_so": "so.SODATE",
        "tgl_estimasi": "so.ESTSHIPDATE",
        "no_pelanggan": "pd.PERSONNO",
        "nama_pelanggan": "pd.NAME",
        "no_po_customer": "so.PONO",
        "no_barang": "det.ITEMNO",
        "qty": "det.QUANTITY",
        "qty_shipped": "det.QTYSHIPPED",
        "unit_price": "det.UNITPRICE",
    }
    sortby = options.get("sortby", "tgl_so")
    sort_order = str(options.get("sort_order", "desc")).lower()
    if sortby not in sort_columns:
        raise ValueError(f"sortby tidak valid: {sortby}")
    if sort_order not in {"asc", "desc"}:
        raise ValueError("sort_order harus asc atau desc")
    order_sql = f"{sort_columns[sortby]} {sort_order.upper()}, so.SONO, det.SEQ"

    con = fdb.connect(**DB_CONFIG)
    try:
        cur = con.cursor()
        line_closed_expr = _so_line_closed_expr(cur)
        where_sql, params_where = _so_where_clause(search, date_from, date_to, status, line_closed_expr)
        so_select = _so_select_sql(line_closed_expr)
        sql = f"""
            SELECT FIRST ? SKIP ?
                {so_select}
            {_SO_FROM}
            WHERE {where_sql}
            ORDER BY {order_sql}
        """
        cur.execute(sql, [limit, offset] + params_where)
        rows = cur.fetchall()
        sql_count = f"""
            SELECT
                COUNT(*),
                COUNT(DISTINCT so.SOID)
            {_SO_FROM}
            WHERE {where_sql}
        """
        cur.execute(sql_count, params_where)
        count_row = cur.fetchone()
        total_rows = int(count_row[0] or 0)
        total_so = int(count_row[1] or 0)

        delivery_map = _get_so_delivery_map(cur, rows)
        data = _build_so_rows(rows, delivery_map)
        return {
            "data": data,
            "total_rows": total_rows,
            "total_so": total_so,
            "total_amount": sum(row.get("amount", 0) for row in data),
        }
    finally:
        con.close()


@app.route("/api/penjualan-so")
@jwt_required()
def api_penjualan_so():
    """Endpoint utama SO dengan pagination."""
    if not check_permission("penjualan_so"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        result = _get_penjualan_so_data()
        result["data"] = filter_record_columns("penjualan_so", result["data"])
        return jsonify(result)
    except Exception as e:
        print(f"Error api_penjualan_so: {e}")
        return jsonify({"data": [], "total_rows": 0, "total_so": 0, "error": str(e)})


app.register_blueprint(create_integration_blueprint(
    _get_penjualan_so_data,
    INTEGRATION_API_KEY,
    MODULE_COLUMNS["penjualan_so"],
))


@app.route("/api/penjualan-so/debug-status")
@jwt_required()
def api_penjualan_so_debug_status():
    if not check_permission("penjualan_so"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        line_closed_expr = _so_line_closed_expr(cur)

        conditions = ["det.ITEMNO IS NOT NULL"]
        params = []
        if date_from:
            conditions.append("so.SODATE >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("so.SODATE <= ?")
            params.append(date_to)
        where_sql = " AND ".join(conditions)

        cur.execute(f"""
            SELECT FIRST 30
                so.SONO,
                so.SODATE,
                det.ITEMNO,
                det.QUANTITY,
                det.QTYSHIPPED,
                {line_closed_expr} AS LINE_CLOSED
            {_SO_FROM}
            WHERE {where_sql}
            ORDER BY so.SODATE DESC, so.SONO
        """, params)

        rows = []
        for row in cur.fetchall():
            qty = float(row[3] or 0)
            qty_shipped = float(row[4] or 0)
            line_closed = int(row[5] or 0)
            if qty > 0 and qty_shipped >= qty:
                status_label = "Diterima"
            elif line_closed:
                status_label = "Ditutup"
            elif qty_shipped > 0:
                status_label = "Diproses"
            else:
                status_label = "Menunggu"
            rows.append({
                "no_so": str(row[0] or "").strip(),
                "tgl_so": str(row[1]) if row[1] else "",
                "itemno": str(row[2] or "").strip(),
                "qty": qty,
                "qty_shipped": qty_shipped,
                "line_closed": line_closed,
                "status_label": status_label,
            })
        con.close()

        return jsonify({"line_closed_expr": line_closed_expr, "rows": rows})

    except Exception as e:
        print(f"Error api_penjualan_so_debug_status: {e}")
        return jsonify({"line_closed_expr": None, "rows": [], "error": str(e)}), 500


@app.route("/api/penjualan-so/export")
@jwt_required()
def api_penjualan_so_export():
    """Export SEMUA data SO tanpa limit — untuk download Excel."""
    if not check_permission("penjualan_so"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        line_closed_expr = _so_line_closed_expr(cur)
        where_sql, params_where = _so_where_clause(search, date_from, date_to, status, line_closed_expr)
        so_select = _so_select_sql(line_closed_expr)

        # Tidak pakai FIRST/SKIP — ambil semua
        sql = f"""
            SELECT {so_select}
            {_SO_FROM}
            WHERE {where_sql}
            ORDER BY so.SODATE DESC, so.SONO, det.SEQ
        """
        cur.execute(sql, params_where)
        rows = cur.fetchall()
        delivery_map = _get_so_delivery_map(cur, rows)
        con.close()

        data = _build_so_rows(rows, delivery_map)
        return jsonify({"data": filter_record_columns("penjualan_so", data), "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_penjualan_so_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/penjualan/export")
@jwt_required()
def api_penjualan_export():
    """Export SEMUA data Invoice Penjualan (ARINV) tanpa limit."""
    if not check_permission("invoice"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions = [
            "ar.DELIVERYORDER = '0'",
            "ar.INVOICETYPE = 1",
            "(ar.ISDP IS NULL OR ar.ISDP = 0)",
        ]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(ar.INVOICENO)          CONTAINING LOWER(?)
                OR LOWER(pd.NAME)            CONTAINING LOWER(?)
                OR LOWER(ar.PURCHASEORDERNO) CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)         CONTAINING LOWER(?)
                OR LOWER(det.ITEMOVDESC)     CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search]

        if date_from:
            conditions.append("ar.INVOICEDATE >= ?")
            params_where.append(date_from)
        if date_to:
            conditions.append("ar.INVOICEDATE <= ?")
            params_where.append(date_to)

        where_sql = " AND ".join(conditions)

        sql = f"""
            SELECT
                ar.INVOICENO,
                ar.INVOICEDATE,
                pd.PERSONNO,
                pd.NAME,
                ar.PURCHASEORDERNO,
                ar.DESCRIPTION,
                det.ITEMNO,
                det.ITEMOVDESC,
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                det.ITEMDISCPC,
                det.TAXCODES,
                ar.TAX1RATE,
                det.TAXABLEAMOUNT1,
                det.QUANTITY * det.UNITPRICE AS SUBTOTAL
            FROM ARINV ar
            LEFT JOIN PERSONDATA pd  ON pd.ID = ar.CUSTOMERID
            LEFT JOIN ARINVDET det   ON det.ARINVOICEID = ar.ARINVOICEID
            WHERE {where_sql}
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO, det.SEQ
        """

        cur.execute(sql, params_where)
        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            qty      = float(row[8]  or 0)
            price    = float(row[10] or 0)
            disc_pc  = float(row[11] or 0)
            tax_rate = float(row[13] or 0)
            subtotal = qty * price * (1 - disc_pc / 100)
            ppn_amt  = subtotal * tax_rate / 100 if row[12] and str(row[12]).strip() else 0
            data.append({
                "no_penjualan":     str(row[0] or "").strip(),
                "tgl_penjualan":    str(row[1]) if row[1] else "",
                "no_pelanggan":     str(row[2] or "").strip(),
                "nama_pelanggan":   str(row[3] or "").strip(),
                "no_po":            str(row[4] or "").strip(),
                "deskripsi":        str(row[5] or "").strip(),
                "no_barang":        str(row[6] or "").strip(),
                "deskripsi_barang": str(row[7] or "").strip(),
                "qty":              qty,
                "uom":              str(row[9] or "").strip(),
                "price":            price,
                "disc_pct":         disc_pc,
                "ppn_kode":         str(row[12] or "").strip(),
                "ppn_rate":         tax_rate,
                "ppn_amount":       round(ppn_amt, 2),
                "amount":           round(subtotal + ppn_amt, 2),
            })

        return jsonify({"data": filter_record_columns("penjualan", data), "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_penjualan_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


# ─── SPK (Surat Perintah Kerja / Work Order) ──────────────────────────────────
#
# Tabel:
#   WO       → header SPK  (ID, WONO, WODATE, EXPECTEDDATE, DESCRIPTION)
#   WODET    → detail item (WOID=WO.ID, ITEMNO, QUANTITY, UNIT, STATUS, NOJOB, JOBDESCRIPTION)
#   SO       → pesanan     (SOID=WODET.SOID → SO.SONO no pesanan, SO.PONO no PO customer)
#   ITEM     → info barang (ITEMDESCRIPTION, TIPEPERSEDIAAN)
#   ITEMHIST → tgl selesai (TXTYPE='FIN', INVOICEID=WODET.ID → MAX(TXDATE))
#
# Join key : WO.ID → WODET.WOID   (bukan WO.WOID)
# No Pesanan: WODET.SOID → SO.SOID → SO.SONO  (NULL = SPK internal)
# Tgl Selesai: MAX(ITEMHIST.TXDATE) WHERE TXTYPE='FIN' AND INVOICEID=WODET.ID
#
# STATUS WODET di database ini: 0=Diproses, 1=Ditutup, 2=Selesai
# TIPEPERSEDIAAN: 0=Non-Persediaan 1=Bahan Baku 2=Barang Jadi 3=WIP 4=Lainnya

# ─── FORMULA PRODUK (BOM) ────────────────────────────────────────────────────
def _formula_where_clause(search="", category="", status=""):
    conditions = ["1=1"]
    params = []

    if search:
        conditions.append("""(
            LOWER(b.BOMNO) CONTAINING LOWER(?)
            OR LOWER(b.DESCRIPTION) CONTAINING LOWER(?)
            OR LOWER(b.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
            OR LOWER(c.DESCRIPTION) CONTAINING LOWER(?)
        )""")
        params += [search] * 5

    if category:
        conditions.append("b.CATEGORYID = ?")
        params.append(category)

    if status == "active":
        conditions.append("COALESCE(b.SUSPENDED, 0) = 0")
    elif status == "inactive":
        conditions.append("COALESCE(b.SUSPENDED, 0) <> 0")

    return " AND ".join(conditions), params


def _build_formula_rows(rows):
    return [{
        "formula_id": int(row[0] or 0),
        "no_formula": str(row[1] or "").strip(),
        "kategori_produk": str(row[2] or "").strip(),
        "deskripsi_formula": str(row[3] or "").strip(),
        "no_barang": str(row[4] or "").strip(),
        "spesifikasi_produk": str(row[5] or "").strip(),
        "qty_build": float(row[6] or 0),
        "unit": str(row[7] or "").strip(),
        "status_code": int(row[8] or 0),
        "status": "Tidak Aktif" if int(row[8] or 0) else "Aktif",
        "total_material": int(row[9] or 0),
    } for row in rows]


_FORMULA_SELECT = """
    b.BOMID,
    b.BOMNO,
    c.DESCRIPTION AS CATEGORY,
    b.DESCRIPTION,
    b.ITEMNO,
    i.ITEMDESCRIPTION,
    b.QTYBUILD,
    b.UNIT,
    b.SUSPENDED,
    (SELECT COUNT(*) FROM BOMMATDET m WHERE m.BOMID = b.BOMID) AS TOTAL_MATERIAL
"""

_FORMULA_FROM = """
    FROM BOM b
    LEFT JOIN BOMCATEGORY c ON c.CATEGORYID = b.CATEGORYID
    LEFT JOIN ITEM i ON i.ITEMNO = b.ITEMNO
"""


@app.route("/api/formula")
@jwt_required()
def api_formula():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        category = request.args.get("category", "")
        status = request.args.get("status", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params_where = _formula_where_clause(search, category, status)

        cur.execute(f"""
            SELECT COUNT(*)
            {_FORMULA_FROM}
            WHERE {where_sql}
        """, params_where)
        total_rows = int(cur.fetchone()[0] or 0)

        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                {_FORMULA_SELECT}
            {_FORMULA_FROM}
            WHERE {where_sql}
            ORDER BY b.BOMNO
        """, [limit, offset] + params_where)
        data = _build_formula_rows(cur.fetchall())

        cur.execute("""
            SELECT CATEGORYID, DESCRIPTION
            FROM BOMCATEGORY
            ORDER BY DESCRIPTION
        """)
        categories = [
            {"value": str(row[0]), "label": str(row[1] or "").strip()}
            for row in cur.fetchall()
        ]

        con.close()
        return jsonify({
            "data": filter_record_columns("formula", data),
            "total": total_rows,
            "categories": categories,
        })
    except Exception as e:
        print(f"Error api_formula: {e}")
        return jsonify({"data": [], "total": 0, "categories": [], "error": str(e)})


@app.route("/api/formula/export")
@jwt_required()
def api_formula_export():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        category = request.args.get("category", "")
        status = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params_where = _formula_where_clause(search, category, status)
        cur.execute(f"""
            SELECT {_FORMULA_SELECT}
            {_FORMULA_FROM}
            WHERE {where_sql}
            ORDER BY b.BOMNO
        """, params_where)
        data = _build_formula_rows(cur.fetchall())
        con.close()
        return jsonify({"data": filter_record_columns("formula", data), "total": len(data)})
    except Exception as e:
        print(f"Error api_formula_export: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


@app.route("/api/formula/<int:formula_id>/materials")
@jwt_required()
def api_formula_materials(formula_id):
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT
                m.SEQ,
                m.MATERIALNO,
                i.ITEMDESCRIPTION,
                m.MATERIALQTY,
                m.ITEMUNIT,
                m.COST,
                m.KETERANGAN
            FROM BOMMATDET m
            LEFT JOIN ITEM i ON i.ITEMNO = m.MATERIALNO
            WHERE m.BOMID = ?
            ORDER BY m.SEQ
        """, [formula_id])
        data = [{
            "seq": int(row[0] or 0) + 1,
            "no_barang": str(row[1] or "").strip(),
            "nama_barang": str(row[2] or "").strip(),
            "qty": float(row[3] or 0),
            "unit": str(row[4] or "").strip(),
            "cost": float(row[5] or 0),
            "keterangan": str(row[6] or "").strip(),
        } for row in cur.fetchall()]
        con.close()
        return jsonify({"data": data, "total": len(data)})
    except Exception as e:
        print(f"Error api_formula_materials: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


def _monitoring_formula_where_clause(search="", date_from="", date_to="", wodet_id=""):
    conditions = ["1=1"]
    params = []

    if search:
        conditions.append("""(
            LOWER(w.WONO) CONTAINING LOWER(?)
            OR LOWER(det.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(det.JOBDESCRIPTION) CONTAINING LOWER(?)
            OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
            OR LOWER(so.SONO) CONTAINING LOWER(?)
            OR LOWER(so.PONO) CONTAINING LOWER(?)
        )""")
        params += [search] * 6

    if date_from:
        conditions.append("w.WODATE >= ?")
        params.append(date_from)

    if date_to:
        conditions.append("w.WODATE <= ?")
        params.append(date_to)

    if wodet_id:
        conditions.append("det.ID = ?")
        params.append(int(wodet_id))

    return " AND ".join(conditions), params


def _qty_match(left, right):
    return abs(float(left or 0) - float(right or 0)) <= 0.0001


def _compare_material_map(source, target, missing_label="Berkurang", extra_label="Bertambah"):
    material_nos = set(source) | set(target)
    if not material_nos:
        return "Tidak Ada Material"

    has_missing = any(no in source and no not in target for no in material_nos)
    has_extra = any(no not in source and no in target for no in material_nos)
    has_qty_diff = any(
        no in source and no in target and not _qty_match(source[no].get("qty"), target[no].get("qty"))
        for no in material_nos
    )

    if not has_missing and not has_extra and not has_qty_diff:
        return "Sesuai"
    if has_missing and not has_extra and not has_qty_diff:
        return missing_label
    if has_extra and not has_missing and not has_qty_diff:
        return extra_label
    return "Berbeda"


def _material_status(formula_qty, spk_qty, spm_qty):
    has_formula = formula_qty is not None
    has_spk = spk_qty is not None
    has_spm = spm_qty is not None

    if has_formula and has_spk:
        if _qty_match(formula_qty, spk_qty):
            formula_spk = "Sesuai"
        elif float(spk_qty or 0) > float(formula_qty or 0):
            formula_spk = "SPK Bertambah"
        else:
            formula_spk = "SPK Berkurang"
    elif has_formula and not has_spk:
        formula_spk = "Tidak Ada di SPK"
    elif not has_formula and has_spk:
        formula_spk = "Tambahan di SPK"
    else:
        formula_spk = "-"

    if has_spk and has_spm:
        if _qty_match(spk_qty, spm_qty):
            spk_spm = "Sesuai"
        elif float(spm_qty or 0) > float(spk_qty or 0):
            spk_spm = "SPM Bertambah"
        else:
            spk_spm = "SPM Berkurang"
    elif has_spk and not has_spm:
        spk_spm = "Belum Ditarik"
    elif not has_spk and has_spm:
        spk_spm = "Tambahan di SPM"
    else:
        spk_spm = "-"

    return formula_spk, spk_spm


def _formula_spk_status_from_materials(materials):
    statuses = [
        item.get("formula_spk_status")
        for item in materials
        if item.get("formula_spk_status") and item.get("formula_spk_status") != "-"
    ]
    if not statuses:
        return "Tidak Ada Material"
    if all(status == "Sesuai" for status in statuses):
        return "Sesuai"

    non_match_statuses = {status for status in statuses if status != "Sesuai"}
    if len(non_match_statuses) == 1:
        return next(iter(non_match_statuses))
    return "Berbeda"


def _cost_status(formula_cost, spk_cost):
    if formula_cost is None and spk_cost is None:
        return "-"
    if formula_cost is not None and spk_cost is None:
        return "Tidak Ada di SPK"
    if formula_cost is None and spk_cost is not None:
        return "Tambahan di SPK"
    if _qty_match(float(formula_cost or 0), float(spk_cost or 0)):
        return "Sesuai"
    if float(spk_cost or 0) > float(formula_cost or 0):
        return "SPK Bertambah"
    return "SPK Berkurang"


def _fetch_material_maps(cur, wodet_id, item_no, qty_spk):
    cur.execute("""
        SELECT FIRST 1 BOMID, BOMNO, QTYBUILD
        FROM BOM
        WHERE ITEMNO = ?
        ORDER BY SUSPENDED, BOMNO
    """, [item_no])
    formula_row = cur.fetchone()
    formula_id = int(formula_row[0] or 0) if formula_row else 0
    no_formula = str(formula_row[1] or "").strip() if formula_row else ""
    qty_build = float(formula_row[2] or 1) if formula_row else 1
    multiplier = float(qty_spk or 0) / qty_build if qty_build else float(qty_spk or 0)

    formula_map = {}
    if formula_id:
        cur.execute("""
            SELECT m.MATERIALNO, m.MATERIALQTY, m.ITEMUNIT, i.ITEMDESCRIPTION
            FROM BOMMATDET m
            LEFT JOIN ITEM i ON i.ITEMNO = m.MATERIALNO
            WHERE m.BOMID = ?
            ORDER BY m.MATERIALNO
        """, [formula_id])
        for material_no, qty, unit, name in cur.fetchall():
            key = str(material_no or "").strip()
            if not key:
                continue
            formula_map[key] = {
                "qty": float(qty or 0) * multiplier,
                "unit": str(unit or "").strip(),
                "name": str(name or "").strip(),
            }

    cur.execute("""
        SELECT w.ITEMNO, SUM(w.QUANTITY), MAX(w.UNIT), MAX(i.ITEMDESCRIPTION)
        FROM WODETMAT w
        LEFT JOIN ITEM i ON i.ITEMNO = w.ITEMNO
        WHERE w.WODETID = ?
        GROUP BY w.ITEMNO
        ORDER BY w.ITEMNO
    """, [wodet_id])
    spk_map = {
        str(row[0] or "").strip(): {
            "qty": float(row[1] or 0),
            "unit": str(row[2] or "").strip(),
            "name": str(row[3] or "").strip(),
        }
        for row in cur.fetchall()
        if str(row[0] or "").strip()
    }

    cur.execute("""
        SELECT md.ITEMNO, SUM(md.QUANTITY), MAX(md.UNIT), MAX(i.ITEMDESCRIPTION)
        FROM MATRLSDET md
        LEFT JOIN ITEM i ON i.ITEMNO = md.ITEMNO
        WHERE md.WODETID = ?
           OR md.WODETID IN (SELECT w.ID FROM WODETMAT w WHERE w.WODETID = ?)
        GROUP BY md.ITEMNO
        ORDER BY md.ITEMNO
    """, [wodet_id, wodet_id])
    spm_map = {
        str(row[0] or "").strip(): {
            "qty": float(row[1] or 0),
            "unit": str(row[2] or "").strip(),
            "name": str(row[3] or "").strip(),
        }
        for row in cur.fetchall()
        if str(row[0] or "").strip()
    }

    return no_formula, formula_map, spk_map, spm_map


def _build_in_clause(values):
    return ",".join(["?"] * len(values))


def _fetch_material_maps_batch(cur, work_rows):
    result = {
        row["wodet_id"]: {
            "no_formula": "",
            "formula_map": {},
            "spk_map": {},
            "spm_map": {},
            "stock_map": {},
            "formula_production_map": {},
            "spk_production_map": {},
            "qty_build": 1.0,
            "formula_material_cost": 0.0,
            "formula_production_cost": 0.0,
            "spk_material_cost": 0.0,
            "spk_production_cost": 0.0,
        }
        for row in work_rows
    }
    if not work_rows:
        return result

    item_nos = sorted({row["item_no"] for row in work_rows if row["item_no"]})
    wodet_ids = [row["wodet_id"] for row in work_rows if row["wodet_id"]]
    qty_by_wodet = {row["wodet_id"]: row["qty_spk"] for row in work_rows if row["wodet_id"]}
    work_date_by_wodet = {row["wodet_id"]: row.get("tanggal") for row in work_rows if row["wodet_id"]}
    wodet_by_item = {}
    for row in work_rows:
        wodet_by_item.setdefault(row["item_no"], []).append(row["wodet_id"])

    bom_by_item = {}
    if item_nos:
        cur.execute(f"""
            SELECT ITEMNO, BOMID, BOMNO, QTYBUILD, MATCOST, DLABORCOST, MOHCOST, EXPENSECOST, UPDATEDATE
            FROM BOM
            WHERE ITEMNO IN ({_build_in_clause(item_nos)})
            ORDER BY ITEMNO, SUSPENDED, BOMNO
        """, item_nos)
        for item_no, bom_id, bom_no, qty_build, mat_cost, dlabor_cost, moh_cost, expense_cost, update_date in cur.fetchall():
            item_key = str(item_no or "").strip()
            if item_key in bom_by_item:
                continue
            bom_by_item[item_key] = {
                "bom_id": int(bom_id or 0),
                "bom_no": str(bom_no or "").strip(),
                "updatedate": update_date,
                "qty_build": float(qty_build or 1) or 1,
                "material_cost": float(mat_cost or 0),
                "production_cost": float(dlabor_cost or 0) + float(moh_cost or 0) + float(expense_cost or 0),
            }

    bom_ids = sorted({bom["bom_id"] for bom in bom_by_item.values() if bom["bom_id"]})
    formula_materials_by_bom = {}
    if bom_ids:
        cur.execute(f"""
            SELECT
                m.BOMID,
                m.MATERIALNO,
                SUM(m.MATERIALQTY),
                MAX(m.ITEMUNIT),
                MAX(i.ITEMDESCRIPTION),
                SUM(
                    COALESCE(m.MATERIALQTY, 0) *
                    COALESCE(NULLIF(m.COSTUNIT, 0), NULLIF(m.COST, 0), 0)
                )
            FROM BOMMATDET m
            LEFT JOIN ITEM i ON i.ITEMNO = m.MATERIALNO
            WHERE m.BOMID IN ({_build_in_clause(bom_ids)})
            GROUP BY m.BOMID, m.MATERIALNO
            ORDER BY m.MATERIALNO
        """, bom_ids)
        for bom_id, material_no, qty, unit, name, cost in cur.fetchall():
            key = str(material_no or "").strip()
            if not key:
                continue
            formula_materials_by_bom.setdefault(int(bom_id or 0), {})[key] = {
                "qty": float(qty or 0),
                "unit": str(unit or "").strip(),
                "name": str(name or "").strip(),
                "cost": float(cost or 0),
            }

    formula_production_by_bom = {}
    if bom_ids:
        cur.execute(f"""
            SELECT
                x.BOMID,
                x.COSTNO,
                MAX(x.DESCRIPTION),
                SUM(x.QTY),
                MAX(x.UNIT_COST),
                SUM(x.QTY * x.UNIT_COST),
                MAX(x.CATEGORY)
            FROM (
                SELECT
                    d.BOMID,
                    d.DLABORNO AS COSTNO,
                    COALESCE(l.DESCRIPTION, d.DLABORNO) AS DESCRIPTION,
                    COALESCE(d.DLABORQTY, 0) AS QTY,
                    COALESCE(NULLIF(d.COST, 0), NULLIF(l.COST, 0), 0) AS UNIT_COST,
                    'Tenaga Kerja' AS CATEGORY
                FROM BOMDLABORDET d
                LEFT JOIN DLABOR l ON l.DLABORNO = d.DLABORNO
                WHERE d.BOMID IN ({_build_in_clause(bom_ids)})

                UNION ALL

                SELECT
                    m.BOMID,
                    m.MOHNO AS COSTNO,
                    COALESCE(h.DESCRIPTION, m.MOHNO) AS DESCRIPTION,
                    COALESCE(m.MOHQTY, 0) AS QTY,
                    COALESCE(NULLIF(m.COST, 0), NULLIF(h.COST, 0), 0) AS UNIT_COST,
                    'Overhead' AS CATEGORY
                FROM BOMMOHDET m
                LEFT JOIN MOH h ON h.MOHNO = m.MOHNO
                WHERE m.BOMID IN ({_build_in_clause(bom_ids)})
            ) x
            GROUP BY x.BOMID, x.COSTNO
            ORDER BY x.BOMID, x.COSTNO
        """, bom_ids + bom_ids)
        for bom_id, cost_no, description, qty, unit_cost, total_cost, category in cur.fetchall():
            key = str(cost_no or "").strip()
            if not key:
                continue
            formula_production_by_bom.setdefault(int(bom_id or 0), {})[key] = {
                "cost_no": key,
                "description": str(description or "").strip(),
                "qty": float(qty or 0),
                "unit_cost": float(unit_cost or 0),
                "cost": float(total_cost or 0),
                "category": str(category or "").strip(),
            }

    material_standard_cost_by_item = {}
    material_cost_by_item = {}
    material_nos = sorted({
        material_no
        for materials in formula_materials_by_bom.values()
        for material_no in materials
    })
    if material_nos:
        cur.execute(f"""
            SELECT d.ITEMNO, s.TGLMULAIBRG, s.TGLSTANDARBRG, s.NOSTANDARBRG, d.NEWCOST
            FROM STANDARBIAYABRG s
            JOIN STANDARBIAYABRGDET d ON d.NOSTANDARBRG = s.NOSTANDARBRG
            WHERE d.ITEMNO IN ({_build_in_clause(material_nos)})
              AND COALESCE(d.NEWCOST, 0) > 0
            ORDER BY d.ITEMNO, s.TGLMULAIBRG DESC, s.TGLSTANDARBRG DESC, s.NOSTANDARBRG DESC
        """, material_nos)
        for material_no, effective_date, standard_date, standard_no, cost in cur.fetchall():
            key = str(material_no or "").strip()
            if key:
                material_standard_cost_by_item.setdefault(key, []).append({
                    "effective_date": effective_date or standard_date,
                    "cost": float(cost or 0),
                    "standard_no": str(standard_no or "").strip(),
                })

        cur.execute(f"""
            SELECT ITEMNO, TXDATE, TXTYPE, QUANTITY, COST
            FROM ITEMHIST
            WHERE ITEMNO IN ({_build_in_clause(material_nos)})
              AND COALESCE(COST, 0) > 0
            ORDER BY ITEMNO, CASE WHEN QUANTITY < 0 THEN 0 ELSE 1 END, TXDATE DESC, ITEMHISTID DESC
        """, material_nos)
        for material_no, tx_date, tx_type, quantity, cost in cur.fetchall():
            key = str(material_no or "").strip()
            if not key:
                continue
            qty = float(quantity or 0)
            row_cost = float(cost or 0)
            unit_cost = row_cost / abs(qty) if qty < 0 and qty else row_cost
            material_cost_by_item.setdefault(key, []).append({
                "tx_date": tx_date,
                "cost": unit_cost,
            })

    for item_no, bom in bom_by_item.items():
        for wodet_id in wodet_by_item.get(item_no, []):
            multiplier = float(qty_by_wodet.get(wodet_id) or 0) / bom["qty_build"]
            result[wodet_id]["no_formula"] = bom["bom_no"]
            result[wodet_id]["qty_build"] = bom["qty_build"]
            result[wodet_id]["formula_material_cost"] = bom["material_cost"]
            result[wodet_id]["formula_production_cost"] = bom["production_cost"]
            bom_materials = formula_materials_by_bom.get(bom["bom_id"], {})
            for material_no, material in formula_materials_by_bom.get(bom["bom_id"], {}).items():
                raw_cost = float(material.get("cost") or 0)
                allocated_cost = raw_cost
                bom_date = bom.get("updatedate")
                standard_cost = 0.0
                for standard_row in material_standard_cost_by_item.get(material_no, []):
                    effective_date = standard_row.get("effective_date")
                    if not bom_date or not effective_date or effective_date <= bom_date:
                        standard_cost = float(standard_row.get("cost") or 0)
                        break
                fifo_cost = 0.0
                for fifo_row in material_cost_by_item.get(material_no, []):
                    tx_date = fifo_row.get("tx_date")
                    if not bom_date or not tx_date or tx_date <= bom_date:
                        fifo_cost = float(fifo_row.get("cost") or 0)
                        break
                if not allocated_cost and standard_cost:
                    allocated_cost = standard_cost * float(material.get("qty") or 0)
                elif not allocated_cost and fifo_cost:
                    allocated_cost = fifo_cost * float(material.get("qty") or 0)
                result[wodet_id]["formula_map"][material_no] = {
                    **material,
                    "qty": material["qty"],
                    "cost": allocated_cost,
                    "cost_estimated": not raw_cost and not standard_cost and not fifo_cost and bool(allocated_cost),
                }
            for cost_no, production in formula_production_by_bom.get(bom["bom_id"], {}).items():
                result[wodet_id]["formula_production_map"][cost_no] = {
                    **production,
                    "qty": production["qty"],
                    "cost": production["cost"],
                }

    if wodet_ids:
        wodetmat_columns = set(_get_table_columns(cur, "WODETMAT"))
        cost_description_column = _match_column(wodetmat_columns, (
            "COSTDESCRIPTION", "COSTDESC", "COST_DESCR", "COST_DESCRIP",
            "COSTMETHOD", "COSTSOURCE", "HPPMETHOD", "HPPDESC",
            "DESKRIPSIBIAYA", "BIAYADESC",
        ))
        cost_description_expr = (
            f"MAX(CAST(w.{cost_description_column} AS VARCHAR(255)))"
            if cost_description_column else "NULL"
        )
        cur.execute(f"""
            SELECT
                w.WODETID,
                w.ITEMNO,
                SUM(w.QUANTITY),
                MAX(w.UNIT),
                MAX(i.ITEMDESCRIPTION),
                MAX(i.MINIMUMQTY),
                MAX(
                    CASE
                        WHEN COALESCE(w.COSTUNIT, 0) > 0
                        THEN COALESCE(w.COSTUNIT, 0)
                        WHEN COALESCE(w.QUANTITY, 0) <> 0
                        THEN COALESCE(w.COST, 0) / w.QUANTITY
                        ELSE 0
                    END
                ),
                {cost_description_expr},
                SUM(
                    CASE
                        WHEN COALESCE(w.COSTUNIT, 0) > 0
                        THEN COALESCE(w.QUANTITY, 0) * COALESCE(w.COSTUNIT, 0)
                        ELSE COALESCE(w.COST, 0)
                    END
                )
            FROM WODETMAT w
            LEFT JOIN ITEM i ON i.ITEMNO = w.ITEMNO
            WHERE w.WODETID IN ({_build_in_clause(wodet_ids)})
            GROUP BY w.WODETID, w.ITEMNO
            ORDER BY w.WODETID, w.ITEMNO
        """, wodet_ids)
        spk_material_sources = []
        for wodet_id, item_no, qty, unit, name, minimum_qty, unit_cost, cost_description, cost in cur.fetchall():
            key = str(item_no or "").strip()
            target_id = int(wodet_id or 0)
            if target_id not in result or not key:
                continue
            result[target_id]["spk_material_cost"] += float(cost or 0)
            spk_material_sources.append({
                "wodet_id": target_id,
                "item_no": key,
                "unit_cost": float(unit_cost or 0),
                "work_date": work_date_by_wodet.get(target_id),
            })
            result[target_id]["spk_map"][key] = {
                "qty": float(qty or 0),
                "unit": str(unit or "").strip(),
                "name": str(name or "").strip(),
                "minimum_qty": float(minimum_qty or 0),
                "unit_cost": float(unit_cost or 0),
                "cost": float(cost or 0),
                "cost_description": str(cost_description or "").strip(),
            }

        spk_material_nos = sorted({row["item_no"] for row in spk_material_sources if row["item_no"]})
        standard_rows_by_item = {}
        if spk_material_nos:
            cur.execute(f"""
                SELECT d.ITEMNO, s.TGLMULAIBRG, s.TGLSTANDARBRG, s.NOSTANDARBRG, d.NEWCOST
                FROM STANDARBIAYABRG s
                JOIN STANDARBIAYABRGDET d ON d.NOSTANDARBRG = s.NOSTANDARBRG
                WHERE d.ITEMNO IN ({_build_in_clause(spk_material_nos)})
                  AND COALESCE(d.NEWCOST, 0) > 0
                ORDER BY d.ITEMNO, s.TGLMULAIBRG DESC, s.TGLSTANDARBRG DESC, s.NOSTANDARBRG DESC
            """, spk_material_nos)
            for material_no, effective_date, standard_date, standard_no, cost in cur.fetchall():
                key = str(material_no or "").strip()
                if key:
                    standard_rows_by_item.setdefault(key, []).append({
                        "effective_date": effective_date or standard_date,
                        "standard_no": str(standard_no or "").strip(),
                        "cost": float(cost or 0),
                    })

        for source in spk_material_sources:
            target_id = source["wodet_id"]
            item_key = source["item_no"]
            material = result.get(target_id, {}).get("spk_map", {}).get(item_key)
            if not material or material.get("cost_description"):
                continue
            unit_cost = float(source.get("unit_cost") or 0)
            work_date = source.get("work_date")
            standard_no = ""
            for standard_row in standard_rows_by_item.get(item_key, []):
                effective_date = standard_row.get("effective_date")
                if work_date and effective_date and str(effective_date) > str(work_date):
                    continue
                if abs(float(standard_row.get("cost") or 0) - unit_cost) < 0.0001:
                    standard_no = standard_row.get("standard_no", "")
                    break
            material["cost_description"] = (
                f"Standarisasi No :{standard_no}" if standard_no else ("HPP Metode FIFO" if unit_cost else "")
            )

        cur.execute(f"""
            SELECT WODETID, SUM(COALESCE(QUANTITY, 0) * COALESCE(STANDARDCOST, 0))
            FROM WODETEXPENSE
            WHERE WODETID IN ({_build_in_clause(wodet_ids)})
            GROUP BY WODETID
        """, wodet_ids)
        for wodet_id, production_cost in cur.fetchall():
            target_id = int(wodet_id or 0)
            if target_id in result:
                result[target_id]["spk_production_cost"] = float(production_cost or 0)

        cur.execute(f"""
            SELECT
                e.WODETID,
                e.DLBORNO,
                COALESCE(MAX(l.DESCRIPTION), MAX(h.DESCRIPTION), e.DLBORNO),
                SUM(COALESCE(e.QUANTITY, 0)),
                MAX(COALESCE(e.STANDARDCOST, 0)),
                SUM(COALESCE(e.QUANTITY, 0) * COALESCE(e.STANDARDCOST, 0)),
                CASE WHEN MAX(h.MOHNO) IS NOT NULL THEN 'Overhead' ELSE 'Tenaga Kerja' END
            FROM WODETEXPENSE e
            LEFT JOIN DLABOR l ON l.DLABORNO = e.DLBORNO
            LEFT JOIN MOH h ON h.MOHNO = e.DLBORNO
            WHERE e.WODETID IN ({_build_in_clause(wodet_ids)})
            GROUP BY e.WODETID, e.DLBORNO
            ORDER BY e.WODETID, e.DLBORNO
        """, wodet_ids)
        for wodet_id, cost_no, description, qty, unit_cost, total_cost, category in cur.fetchall():
            key = str(cost_no or "").strip()
            target_id = int(wodet_id or 0)
            if target_id not in result or not key:
                continue
            result[target_id]["spk_production_map"][key] = {
                "cost_no": key,
                "description": str(description or "").strip(),
                "qty": float(qty or 0),
                "unit_cost": float(unit_cost or 0),
                "cost": float(total_cost or 0),
                "category": str(category or "").strip(),
            }

        in_clause = _build_in_clause(wodet_ids)
        cur.execute(f"""
            SELECT target_wodet_id, item_no, SUM(qty), MAX(unit), MAX(item_name)
            FROM (
                SELECT md.WODETID AS target_wodet_id,
                       md.ITEMNO AS item_no,
                       md.QUANTITY AS qty,
                       md.UNIT AS unit,
                       i.ITEMDESCRIPTION AS item_name
                FROM MATRLSDET md
                LEFT JOIN ITEM i ON i.ITEMNO = md.ITEMNO
                WHERE md.WODETID IN ({in_clause})

                UNION ALL

                SELECT wm.WODETID AS target_wodet_id,
                       md.ITEMNO AS item_no,
                       md.QUANTITY AS qty,
                       md.UNIT AS unit,
                       i.ITEMDESCRIPTION AS item_name
                FROM MATRLSDET md
                JOIN WODETMAT wm ON wm.ID = md.WODETID
                LEFT JOIN ITEM i ON i.ITEMNO = md.ITEMNO
                WHERE wm.WODETID IN ({in_clause})
            ) x
            GROUP BY target_wodet_id, item_no
            ORDER BY target_wodet_id, item_no
        """, wodet_ids + wodet_ids)
        for wodet_id, item_no, qty, unit, name in cur.fetchall():
            key = str(item_no or "").strip()
            target_id = int(wodet_id or 0)
            if target_id not in result or not key:
                continue
            result[target_id]["spm_map"][key] = {
                "qty": float(qty or 0),
                "unit": str(unit or "").strip(),
                "name": str(name or "").strip(),
            }

    material_nos = sorted({
        material_no
        for maps in result.values()
        for material_no in (
            set(maps["formula_map"]) | set(maps["spk_map"]) | set(maps["spm_map"])
        )
    })
    if material_nos:
        cur.execute(f"""
            SELECT i.ITEMNO, COALESCE(SUM(h.QUANTITY), 0)
            FROM ITEM i
            LEFT JOIN ITEMHIST h ON h.ITEMNO = i.ITEMNO
            WHERE i.ITEMNO IN ({_build_in_clause(material_nos)})
            GROUP BY i.ITEMNO
        """, material_nos)
        stock_map = {
            str(item_no or "").strip(): {"quantity": float(qty or 0), "minimum_qty": 0.0}
            for item_no, qty in cur.fetchall()
        }
        cur.execute(f"""
            SELECT ITEMNO, MINIMUMQTY
            FROM ITEM
            WHERE ITEMNO IN ({_build_in_clause(material_nos)})
        """, material_nos)
        for item_no, minimum_qty in cur.fetchall():
            key = str(item_no or "").strip()
            if key in stock_map:
                stock_map[key]["minimum_qty"] = float(minimum_qty or 0)
        for maps in result.values():
            maps["stock_map"] = stock_map

    return result


def _sum_wip_gl_amount_for_doc(cur, doc_no):
    doc_no = str(doc_no or "").strip()
    if not doc_no or not _table_exists(cur, "GLHIST") or not _table_has_columns(cur, "GLHIST", ("BASEAMOUNT", "TRANSDESCRIPTION")):
        return None

    glhist_columns = set(_get_table_columns(cur, "GLHIST"))
    joins = []
    account_conditions = []
    if _table_exists(cur, "GLACCNT") and _table_has_columns(cur, "GLACCNT", ("GLACCOUNT", "ACCOUNTNAME")):
        joins.append("LEFT JOIN GLACCNT ga ON ga.GLACCOUNT = gh.GLACCOUNT")
        account_conditions.extend([
            "UPPER(CAST(ga.ACCOUNTNAME AS VARCHAR(255))) CONTAINING 'WIP'",
            "UPPER(CAST(ga.ACCOUNTNAME AS VARCHAR(255))) CONTAINING 'BARANG DALAM PROSES'",
            "UPPER(CAST(ga.ACCOUNTNAME AS VARCHAR(255))) CONTAINING 'PEKERJAAN DALAM PROSES'",
        ])
    if "GLACCOUNT" in glhist_columns:
        account_conditions.append("UPPER(CAST(gh.GLACCOUNT AS VARCHAR(255))) CONTAINING 'WIP'")

    if not account_conditions:
        return None

    doc_conditions = ["UPPER(CAST(gh.TRANSDESCRIPTION AS VARCHAR(255))) CONTAINING UPPER(?)"]
    params = [doc_no]
    if "SOURCE" in glhist_columns:
        doc_conditions.append("UPPER(CAST(gh.SOURCE AS VARCHAR(255))) CONTAINING UPPER(?)")
        params.append(doc_no)
    if "TRANSTYPE" in glhist_columns:
        doc_conditions.append("UPPER(CAST(gh.TRANSTYPE AS VARCHAR(255))) CONTAINING UPPER(?)")
        params.append(doc_no)

    cur.execute(f"""
        SELECT COALESCE(SUM(gh.BASEAMOUNT), 0), COUNT(*)
        FROM GLHIST gh
        {' '.join(joins)}
        WHERE ({' OR '.join(account_conditions)})
          AND ({' OR '.join(doc_conditions)})
    """, params)
    amount, count = cur.fetchone()
    if int(count or 0) == 0:
        return None
    return float(amount or 0)


def _build_wip_reconciliation(cur, work_row, maps, production_results, spk_total_cost, spk_production_cost, hpp_per_unit_spk):
    wodet_id = int(work_row.get("wodet_id") or 0)
    no_spk = work_row.get("no_spk", "")
    job_desc = work_row.get("item_name", "")
    uom = work_row.get("uom", "")
    qty_spk = float(work_row.get("qty_spk") or 0)
    qty_hasil = float(work_row.get("qty_hasil_produksi") or 0)
    is_work_order_closed = bool(work_row.get("is_work_order_closed"))
    spk_map = maps.get("spk_map", {})
    material_unit_cost = {
        material_no: (float(material.get("cost") or 0) / float(material.get("qty") or 0))
        for material_no, material in spk_map.items()
        if float(material.get("qty") or 0)
    }

    rows = []
    if wodet_id:
        has_itemhist_cost = (
            _table_has_columns(cur, "MATRLSDET", ("ITEMHISTID",))
            and _table_has_columns(cur, "ITEMHIST", ("ITEMHISTID", "COST"))
        )
        has_material_release_cost = _table_has_columns(cur, "MATRLSDET", ("COST",))
        valuation_join = "LEFT JOIN ITEMHIST h ON h.ITEMHISTID = md.ITEMHISTID" if has_itemhist_cost else ""
        if has_itemhist_cost:
            valuation_expr = "ABS(COALESCE(h.COST, 0))"
            valuation_source = "FIFO ITEMHIST"
        elif has_material_release_cost:
            valuation_expr = "ABS(COALESCE(md.COST, 0))"
            valuation_source = "Biaya aktual SPM"
        else:
            valuation_expr = "0"
            valuation_source = "Estimasi dari biaya material SPK"

        cur.execute(f"""
            SELECT target_release_no, target_release_date, item_no, SUM(qty), SUM(actual_wip)
            FROM (
                SELECT m.RELEASENO AS target_release_no,
                       m.RELEASEDATE AS target_release_date,
                       md.ITEMNO AS item_no,
                       md.QUANTITY AS qty,
                       {valuation_expr} AS actual_wip
                FROM MATRLSDET md
                JOIN MATRLS m ON m.ID = md.MATRLSID
                {valuation_join}
                WHERE md.WODETID = ?

                UNION ALL

                SELECT m.RELEASENO AS target_release_no,
                       m.RELEASEDATE AS target_release_date,
                       md.ITEMNO AS item_no,
                       md.QUANTITY AS qty,
                       {valuation_expr} AS actual_wip
                FROM MATRLSDET md
                JOIN MATRLS m ON m.ID = md.MATRLSID
                JOIN WODETMAT wm ON wm.ID = md.WODETID
                {valuation_join}
                WHERE wm.WODETID = ?
            ) x
            GROUP BY target_release_no, target_release_date, item_no
            ORDER BY target_release_date, target_release_no, item_no
        """, [wodet_id, wodet_id])

        release_rows = {}
        for release_no, release_date, item_no, qty, actual_wip in cur.fetchall():
            release_key = str(release_no or "").strip()
            if not release_key:
                continue
            item_key = str(item_no or "").strip()
            inv_amount = float(qty or 0) * float(material_unit_cost.get(item_key, 0))
            release = release_rows.setdefault(release_key, {
                "no_perintah_kerja": no_spk,
                "pengeluaran_bahan": release_key,
                "produksi_hasil": "",
                "tanggal": str(release_date) if release_date else "",
                "tipe": "Pengeluaran Bahan",
                "desk_pekerjaan": job_desc,
                "total_wip": 0.0,
                "total_wip_inv": 0.0,
                "source": valuation_source,
            })
            release["total_wip"] += float(actual_wip or 0)
            release["total_wip_inv"] += inv_amount

        total_release_inv = sum(float(release.get("total_wip_inv") or 0) for release in release_rows.values())
        target_material_spk = float(maps.get("spk_material_cost") or 0)
        if total_release_inv and target_material_spk:
            for release in release_rows.values():
                release["total_wip_inv"] = release["total_wip_inv"] / total_release_inv * target_material_spk

        for release in release_rows.values():
            if not release["total_wip"] and valuation_source == "Estimasi dari biaya material SPK":
                release["total_wip"] = release["total_wip_inv"]
            release["selisih"] = release["total_wip"] - release["total_wip_inv"]
            rows.append(release)

    for result in production_results or []:
        result_no = str(result.get("no_hasil") or "").strip()
        qty_result = float(result.get("qty") or 0)
        result_total_cost = float(result.get("total_cost") or 0)
        inv_amount = -(result_total_cost if result_total_cost > 0 else qty_result * float(hpp_per_unit_spk or 0))
        rows.append({
            "no_perintah_kerja": no_spk,
            "pengeluaran_bahan": "",
            "produksi_hasil": result_no,
            "tanggal": result.get("tanggal", ""),
            "tipe": "Hasil Produksi",
            "desk_pekerjaan": job_desc,
            "total_wip": inv_amount,
            "total_wip_inv": inv_amount,
            "selisih": 0.0,
            "source": "Biaya hasil produksi" if result_total_cost > 0 else "Estimasi dari HPP/unit SPK",
        })

    if is_work_order_closed and qty_spk > 0 and qty_hasil + 0.0001 < qty_spk:
        rows.append({
            "no_perintah_kerja": no_spk,
            "pengeluaran_bahan": "",
            "produksi_hasil": "",
            "tanggal": "",
            "tipe": "Berhenti Produksi",
            "desk_pekerjaan": job_desc,
            "total_wip": 0.0,
            "total_wip_inv": 0.0,
            "selisih": 0.0,
            "source": "SPK ditutup sebelum qty penuh",
        })

    produced_qty = min(max(qty_hasil, 0), qty_spk) if qty_spk > 0 else max(qty_hasil, 0)
    if produced_qty > 0 and qty_spk > 0 and spk_production_cost:
        inv_amount = float(spk_production_cost or 0)
        rows.append({
            "no_perintah_kerja": no_spk,
            "pengeluaran_bahan": "",
            "produksi_hasil": "",
            "tanggal": "",
            "tipe": "Akhir Periode",
            "desk_pekerjaan": job_desc,
            "total_wip": 0.0,
            "total_wip_inv": inv_amount,
            "selisih": -inv_amount,
            "source": "Biaya produksi SPK",
        })

    totals = {
        "total_wip": sum(float(row.get("total_wip") or 0) for row in rows),
        "total_wip_inv": sum(float(row.get("total_wip_inv") or 0) for row in rows),
    }
    totals["selisih"] = totals["total_wip"] - totals["total_wip_inv"]
    return {"rows": rows, "totals": totals}


def _interesting_status_snapshot(cur, table_name, alias, row_id_column, join_sql, where_sql, params):
    columns = _get_table_columns(cur, table_name)
    interesting = [
        column for column in columns
        if any(token in column for token in ("STATUS", "CLOSE", "CLOSED", "FINISH", "DONE", "STOP", "TUTUP"))
    ]
    select_columns = [row_id_column] + [f"{alias}.{column}" for column in interesting]
    cur.execute(f"""
        SELECT {', '.join(select_columns)}
        {join_sql}
        WHERE {where_sql}
    """, params)
    rows = []
    for raw in cur.fetchall():
        row = {"id": raw[0]}
        for index, column in enumerate(interesting, start=1):
            value = raw[index]
            row[column] = str(value).strip() if value is not None else None
        rows.append(row)
    return {"columns": interesting, "rows": rows}


@app.route("/api/monitoring-formula/debug-status")
@jwt_required()
def api_monitoring_formula_debug_status():
    user = get_current_user()
    if user.get("role") != "admin":
        return jsonify({"message": "Akses ditolak"}), 403
    no_spk = request.args.get("no_spk", "").strip()
    if not no_spk:
        return jsonify({"message": "no_spk wajib diisi"}), 400
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        wo_snapshot = _interesting_status_snapshot(
            cur,
            "WO",
            "w",
            "w.ID",
            "FROM WO w",
            "w.WONO = ?",
            [no_spk],
        )
        wodet_snapshot = _interesting_status_snapshot(
            cur,
            "WODET",
            "det",
            "det.ID",
            "FROM WO w JOIN WODET det ON det.WOID = w.ID",
            "w.WONO = ?",
            [no_spk],
        )
        con.close()
        return jsonify({"no_spk": no_spk, "wo": wo_snapshot, "wodet": wodet_snapshot})
    except Exception as e:
        print(f"Error api_monitoring_formula_debug_status: {e}")
        return jsonify({"message": str(e)}), 500


@app.route("/api/monitoring-formula")
@jwt_required()
def api_monitoring_formula():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        status = request.args.get("status", "").strip()
        wodet_id_filter = request.args.get("wodet_id", "").strip()
        offset = int(request.args.get("offset", 0))
        requested_limit = int(request.args.get("limit", 10))
        qty_only = request.args.get("qty_only", "").lower() in ("1", "true", "yes")
        include_wip = request.args.get("include_wip", "").lower() in ("1", "true", "yes")
        skip_count = request.args.get("skip_count", "").lower() in ("1", "true", "yes")
        max_limit = 50 if skip_count else 10
        limit = max(1, min(requested_limit, max_limit)) if not search else max(1, requested_limit)
        query_limit = limit + 1 if skip_count else limit

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params_where = _monitoring_formula_where_clause(search, date_from, date_to, wodet_id_filter)
        wodet_columns = set(_get_table_columns(cur, "WODET"))
        def _truthy_sql_expr(alias, column):
            return f"UPPER(TRIM(CAST({alias}.{column} AS VARCHAR(20)))) NOT IN ('', '0', 'N', 'NO', 'F', 'FALSE')"

        wodet_closed_columns = [
            column for column in (
                "CLOSED", "ISCLOSED", "IS_CLOSED", "CLOSE", "CLOSEDMANUAL",
                "STOPPED", "ISSTOPPED", "IS_STOPPED", "FINISHED", "ISFINISHED",
                "ISFINISH", "DONE", "ISDONE", "IS_DONE", "DITUTUP",
                "STOPPRODUCTION", "STOP_PRODUCTION", "STOPPROD", "STOP_PROD",
            )
            if column in wodet_columns
        ]
        wo_columns = set(_get_table_columns(cur, "WO"))
        wo_closed_columns = [
            column for column in (
                "CLOSED", "ISCLOSED", "IS_CLOSED", "CLOSE", "CLOSEDMANUAL",
                "STOPPED", "ISSTOPPED", "IS_STOPPED", "FINISHED", "ISFINISHED",
                "ISFINISH", "DONE", "ISDONE", "IS_DONE", "DITUTUP",
                "STOPPRODUCTION", "STOP_PRODUCTION", "STOPPROD", "STOP_PROD",
            )
            if column in wo_columns
        ]
        wodet_closed_conditions = ["COALESCE(det.STATUS, 0) IN (1, 2)"]
        if "STATUS" in wo_columns:
            wodet_closed_conditions.extend([
                "UPPER(TRIM(CAST(w.STATUS AS VARCHAR(50)))) CONTAINING 'DITUTUP'",
                "UPPER(TRIM(CAST(w.STATUS AS VARCHAR(50)))) CONTAINING 'CLOSED'",
                "UPPER(TRIM(CAST(w.STATUS AS VARCHAR(50)))) CONTAINING 'SELESAI'",
                "TRIM(CAST(w.STATUS AS VARCHAR(50))) IN ('2', '3')",
            ])
        wodet_closed_conditions.extend(_truthy_sql_expr("det", column) for column in wodet_closed_columns)
        wodet_closed_conditions.extend(_truthy_sql_expr("w", column) for column in wo_closed_columns)
        wodet_closed_expr = f"CASE WHEN {' OR '.join(wodet_closed_conditions)} THEN 1 ELSE 0 END"

        total_rows = None
        if not skip_count:
            cur.execute(f"""
                SELECT COUNT(*)
                FROM WO w
                JOIN WODET det ON det.WOID = w.ID
                LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
                LEFT JOIN SO so ON so.SOID = det.SOID
                WHERE {where_sql}
            """, params_where)
            total_rows = int(cur.fetchone()[0] or 0)

        cur.execute(f"""
            WITH
            page_rows AS (
                SELECT FIRST ? SKIP ?
                    det.ID AS WODET_ID,
                    w.WONO,
                    w.WODATE,
                    det.ITEMNO,
                    COALESCE(i.ITEMDESCRIPTION, det.JOBDESCRIPTION) AS ITEM_NAME,
                    det.QUANTITY,
                    det.UNIT,
                    so.SONO,
                    so.PONO,
                    det.STATUS AS WODET_STATUS,
                    {wodet_closed_expr} AS IS_WORK_ORDER_CLOSED
                FROM WO w
                JOIN WODET det ON det.WOID = w.ID
                LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
                LEFT JOIN SO so ON so.SOID = det.SOID
                WHERE {where_sql}
                ORDER BY w.WODATE DESC, w.WONO, det.ITEMNO
            ),
            result_agg AS (
                SELECT
                    prd.WODETID,
                    MAX(pr.RESULTDATE) AS TGL_SELESAI,
                    SUM(COALESCE(prd.QUANTITY, 0)) AS TOTAL_QTY_HASIL
                FROM PRODRESULTDET prd
                JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
                JOIN page_rows p ON p.WODET_ID = prd.WODETID
                GROUP BY prd.WODETID
            ),
            mat_agg AS (
                SELECT
                    wdm.WODETID,
                    SUM(wdm.QUANTITY) AS TOTAL_MAT_PLAN,
                    SUM(COALESCE(wdm.QTYTAKEN, 0)) AS TOTAL_QTYTAKEN
                FROM WODETMAT wdm
                JOIN page_rows p ON p.WODET_ID = wdm.WODETID
                GROUP BY wdm.WODETID
            ),
            release_by_material AS (
                SELECT
                    wdm.WODETID,
                    SUM(md.QUANTITY) AS TOTAL_MAT_KELUAR
                FROM WODETMAT wdm
                JOIN page_rows p ON p.WODET_ID = wdm.WODETID
                JOIN MATRLSDET md ON md.WODETID = wdm.ID
                GROUP BY wdm.WODETID
            ),
            release_by_wodet AS (
                SELECT
                    md.WODETID,
                    SUM(md.QUANTITY) AS TOTAL_MAT_KELUAR
                FROM MATRLSDET md
                JOIN page_rows p ON p.WODET_ID = md.WODETID
                GROUP BY md.WODETID
            )
            SELECT
                p.WODET_ID,
                p.WONO,
                p.WODATE,
                p.ITEMNO,
                p.ITEM_NAME,
                p.QUANTITY,
                p.UNIT,
                p.SONO,
                p.PONO,
                ra.TGL_SELESAI,
                ra.TOTAL_QTY_HASIL,
                ma.TOTAL_MAT_PLAN,
                ma.TOTAL_QTYTAKEN,
                COALESCE(rbm.TOTAL_MAT_KELUAR, rbw.TOTAL_MAT_KELUAR, 0) AS TOTAL_MAT_KELUAR
                ,p.WODET_STATUS,
                p.IS_WORK_ORDER_CLOSED
            FROM page_rows p
            LEFT JOIN result_agg ra           ON ra.WODETID  = p.WODET_ID
            LEFT JOIN mat_agg ma              ON ma.WODETID  = p.WODET_ID
            LEFT JOIN release_by_material rbm ON rbm.WODETID = p.WODET_ID
            LEFT JOIN release_by_wodet rbw    ON rbw.WODETID = p.WODET_ID
            ORDER BY p.WODATE DESC, p.WONO, p.ITEMNO
        """, [query_limit, offset] + params_where)

        work_rows = []
        for row in cur.fetchall():
            qty_spk = float(row[5] or 0)
            total_qty_hasil = float(row[10] or 0)
            total_mat_plan = float(row[11] or 0)
            total_qtytaken = float(row[12] or 0)
            total_keluar = float(row[13] or 0)
            wodet_status = int(row[14] or 0)
            is_work_order_closed = bool(int(row[15] or 0))
            total_processed = max(total_qtytaken, total_keluar)
            material_progress = round(min((total_processed / total_mat_plan) * 100, 100.0), 1) if total_mat_plan > 0 else 0.0
            is_partial_closed_by_progress = (
                material_progress >= 100
                and total_qty_hasil > 0
                and qty_spk > 0
                and total_qty_hasil + 0.0001 < qty_spk
            )
            is_work_order_closed = is_work_order_closed or is_partial_closed_by_progress
            is_production_done = qty_spk <= 0 or total_qty_hasil + 0.0001 >= qty_spk or is_work_order_closed
            production_progress = (
                100.0 if is_work_order_closed and total_qty_hasil > 0
                else round(min((total_qty_hasil / qty_spk) * 100, 100.0), 1) if qty_spk > 0
                else (100.0 if total_qty_hasil > 0 else 0.0)
            )
            tgl_selesai = str(row[9]) if row[9] and is_production_done else ""
            if is_production_done and total_qty_hasil > 0:
                production_status = "Selesai"
            elif total_qty_hasil > 0 or material_progress > 0:
                production_status = "In Progress"
            else:
                production_status = "Belum Mulai"
            work_rows.append({
                "wodet_id": int(row[0] or 0),
                "no_spk": str(row[1] or "").strip(),
                "tanggal": str(row[2]) if row[2] else "",
                "item_no": str(row[3] or "").strip(),
                "item_name": str(row[4] or "").strip(),
                "qty_spk": qty_spk,
                "uom": str(row[6] or "").strip(),
                "no_pesanan": str(row[7] or "").strip(),
                "no_po": str(row[8] or "").strip(),
                "tgl_selesai": tgl_selesai,
                "qty_hasil_produksi": total_qty_hasil,
                "production_progress": production_progress,
                "total_mat_plan": total_mat_plan,
                "total_mat_keluar": total_processed,
                "material_progress": material_progress,
                "production_status": production_status,
                "wodet_status": wodet_status,
                "is_work_order_closed": is_work_order_closed,
                "qty_berhenti_produksi": max(qty_spk - total_qty_hasil, 0) if is_work_order_closed else 0.0,
            })

        if status:
            work_rows = [row for row in work_rows if row.get("production_status") == status]

        has_more = skip_count and len(work_rows) > limit
        if skip_count:
            work_rows = work_rows[:limit]
            total_rows = offset + len(work_rows) + (1 if has_more else 0)

        production_results_map = {row["wodet_id"]: [] for row in work_rows}
        wodet_ids = [row["wodet_id"] for row in work_rows if row["wodet_id"]]
        if wodet_ids:
            cur.execute(f"""
                SELECT
                    prd.WODETID,
                    pr.RESULTNO,
                    pr.RESULTDATE,
                    prd.QUANTITY,
                    prd.UNIT,
                    prd.COST,
                    prd.PORTION
                FROM PRODRESULTDET prd
                JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
                WHERE prd.WODETID IN ({_build_in_clause(wodet_ids)})
                ORDER BY pr.RESULTDATE, pr.RESULTNO, prd.ID
            """, wodet_ids)
            for prod_row in cur.fetchall():
                target_wodet_id = int(prod_row[0] or 0)
                production_results_map.setdefault(target_wodet_id, []).append({
                    "no_hasil": str(prod_row[1] or "").strip(),
                    "tanggal": str(prod_row[2]) if prod_row[2] else "",
                    "qty": float(prod_row[3] or 0),
                    "unit": str(prod_row[4] or "").strip(),
                    "unit_cost": float(prod_row[5] or 0),
                    "portion": float(prod_row[6] or 0),
                    "total_cost": float(prod_row[3] or 0) * float(prod_row[5] or 0),
                })

        material_maps = _fetch_material_maps_batch(cur, work_rows)
        data = []
        for row in work_rows:
            wodet_id = row["wodet_id"]
            maps = material_maps.get(wodet_id, {})
            no_formula = maps.get("no_formula", "")
            formula_map = maps.get("formula_map", {})
            spk_map = maps.get("spk_map", {})
            spm_map = maps.get("spm_map", {})
            stock_map = maps.get("stock_map", {})
            formula_production_map = maps.get("formula_production_map", {})
            spk_production_map = maps.get("spk_production_map", {})
            formula_material_cost = 0.0
            formula_production_cost = 0.0
            formula_total_cost = 0.0
            spk_material_cost = 0.0
            spk_production_cost = 0.0
            spk_total_cost = 0.0
            material_nos = sorted(set(formula_map) | set(spk_map) | set(spm_map))
            materials = []
            stock_shortage_count = 0
            stock_checked_count = 0
            for material_no in material_nos:
                formula = formula_map.get(material_no)
                spk = spk_map.get(material_no)
                spm = spm_map.get(material_no)
                formula_qty = formula.get("qty") if formula else None
                spk_qty = spk.get("qty") if spk else None
                spm_qty = spm.get("qty") if spm else None
                required_qty = spk_qty if spk_qty is not None else formula_qty
                stock_info = stock_map.get(material_no) or {}
                stock_qty = stock_info.get("quantity") if isinstance(stock_info, dict) else stock_info
                minimum_qty = stock_info.get("minimum_qty") if isinstance(stock_info, dict) else None
                if minimum_qty is None:
                    minimum_qty = spk.get("minimum_qty") if spk else 0
                shortage_qty = None
                stock_status = "Tidak Dicek"
                if stock_qty is not None and required_qty is not None:
                    stock_checked_count += 1
                    shortage_qty = max(float(required_qty or 0) - float(stock_qty or 0), 0)
                    if shortage_qty > 0:
                        stock_shortage_count += 1
                        stock_status = "Kurang"
                    else:
                        stock_status = "Aman"
                _, spk_spm_status = _material_status(formula_qty, spk_qty, spm_qty)
                info = formula or spk or spm or {}
                formula_cost_for_spk_qty = (
                    float(formula.get("cost") or 0) * (float(row["qty_spk"] or 0) / float(maps.get("qty_build") or 1))
                ) if formula else None
                formula_qty_for_spk_qty = (
                    float(formula.get("qty") or 0) * (float(row["qty_spk"] or 0) / float(maps.get("qty_build") or 1))
                ) if formula else None
                spk_cost_value = float(spk.get("cost") or 0) if spk else None
                materials.append({
                    "material_no": material_no,
                    "material_name": info.get("name", ""),
                    "formula_qty": formula_qty,
                    "formula_qty_for_spk_qty": formula_qty_for_spk_qty,
                    "spk_qty": spk_qty,
                    "spm_qty": spm_qty,
                    "formula_cost": float(formula.get("cost") or 0) if formula else None,
                    "formula_cost_for_spk_qty": formula_cost_for_spk_qty,
                    "formula_cost_estimated": bool(formula.get("cost_estimated")) if formula else False,
                    "spk_cost": spk_cost_value,
                    "material_cost_diff": spk_cost_value - formula_cost_for_spk_qty if formula_cost_for_spk_qty is not None and spk_cost_value is not None else None,
                    "required_qty": required_qty,
                    "stock_qty": stock_qty,
                    "minimum_qty": minimum_qty,
                    "shortage_qty": shortage_qty,
                    "stock_status": stock_status,
                    "cost_description": spk.get("cost_description", "") if spk else "",
                    "unit": info.get("unit", ""),
                    "formula_spk_status": _material_status(formula_qty_for_spk_qty, spk_qty, spm_qty)[0],
                    "spk_spm_status": spk_spm_status,
                })
            production_nos = sorted(set(formula_production_map) | set(spk_production_map))
            production_details = []
            for cost_no in production_nos:
                formula_prod = formula_production_map.get(cost_no)
                spk_prod = spk_production_map.get(cost_no)
                info = formula_prod or spk_prod or {}
                formula_prod_cost = float(formula_prod.get("cost") or 0) if formula_prod else None
                formula_prod_qty_for_spk_qty = (
                    float(formula_prod.get("qty") or 0) * (float(row["qty_spk"] or 0) / float(maps.get("qty_build") or 1))
                ) if formula_prod else None
                formula_prod_cost_for_spk_qty = (
                    float(formula_prod.get("cost") or 0) * (float(row["qty_spk"] or 0) / float(maps.get("qty_build") or 1))
                ) if formula_prod else None
                spk_prod_cost = float(spk_prod.get("cost") or 0) if spk_prod else None
                production_details.append({
                    "cost_no": cost_no,
                    "description": info.get("description", ""),
                    "category": info.get("category", ""),
                    "formula_qty": formula_prod.get("qty") if formula_prod else None,
                    "formula_qty_for_spk_qty": formula_prod_qty_for_spk_qty,
                    "spk_qty": spk_prod.get("qty") if spk_prod else None,
                    "formula_unit_cost": formula_prod.get("unit_cost") if formula_prod else None,
                    "spk_unit_cost": spk_prod.get("unit_cost") if spk_prod else None,
                    "formula_cost": formula_prod_cost if formula_prod_cost is not None else None,
                    "formula_cost_for_spk_qty": formula_prod_cost_for_spk_qty,
                    "spk_cost": spk_prod_cost if spk_prod_cost is not None else None,
                    "production_cost_diff": spk_prod_cost - formula_prod_cost_for_spk_qty if formula_prod_cost_for_spk_qty is not None and spk_prod_cost is not None else None,
                })
            formula_material_cost = sum(float(item.get("formula_cost_for_spk_qty") or 0) for item in materials)
            formula_material_cost_for_spk_qty = sum(float(item.get("formula_cost_for_spk_qty") or 0) for item in materials)
            spk_material_cost = sum(float(item.get("spk_cost") or 0) for item in materials)
            formula_production_cost = sum(float(item.get("formula_cost_for_spk_qty") or 0) for item in production_details)
            spk_production_cost = sum(float(item.get("spk_cost") or 0) for item in production_details)
            formula_total_cost = formula_material_cost + formula_production_cost
            spk_total_cost = spk_material_cost + spk_production_cost
            qty_hasil_produksi = float(row["qty_hasil_produksi"] or 0)
            qty_spk = float(row["qty_spk"] or 0)
            hpp_total_actual = spk_total_cost if qty_hasil_produksi > 0 else 0.0
            hpp_per_unit = hpp_total_actual / qty_hasil_produksi if qty_hasil_produksi > 0 else 0.0
            hpp_per_unit_spk = spk_total_cost / qty_spk if qty_spk > 0 else 0.0
            hpp_status = "Final" if row["production_status"] == "Selesai" and qty_hasil_produksi > 0 else ("Estimasi" if qty_hasil_produksi > 0 else "Belum Ada")
            wip_reconciliation = (
                _build_wip_reconciliation(
                    cur,
                    row,
                    maps,
                    production_results_map.get(wodet_id, []),
                    spk_total_cost,
                    spk_production_cost,
                    hpp_per_unit_spk,
                )
                if include_wip
                else {"rows": [], "totals": {"total_wip": 0.0, "total_wip_inv": 0.0, "selisih": 0.0}}
            )
            if stock_checked_count == 0:
                material_stock_status = "Tidak Dicek"
            elif stock_shortage_count > 0:
                material_stock_status = "Kurang"
            else:
                material_stock_status = "Aman"

            data.append({
                "wodet_id": wodet_id,
                "no_spk": row["no_spk"],
                "tanggal": row["tanggal"],
                "no_barang": row["item_no"],
                "nama_barang": row["item_name"],
                "qty_spk": row["qty_spk"],
                "uom": row["uom"],
                "no_pesanan": row["no_pesanan"],
                "no_po": row["no_po"],
                "tgl_selesai": row["tgl_selesai"],
                "qty_hasil_produksi": row["qty_hasil_produksi"],
                "qty_berhenti_produksi": row["qty_berhenti_produksi"],
                "production_progress": row["production_progress"],
                "production_results": production_results_map.get(wodet_id, []),
                "total_mat_plan": row["total_mat_plan"],
                "total_mat_keluar": row["total_mat_keluar"],
                "material_progress": row["material_progress"],
                "production_status": row["production_status"],
                "no_formula": no_formula,
                "formula_material_count": len(formula_map),
                "spk_material_count": len(spk_map),
                "spm_material_count": len(spm_map),
                "formula_material_cost": formula_material_cost,
                "formula_production_cost": formula_production_cost,
                "formula_total_cost": formula_total_cost,
                "spk_material_cost": spk_material_cost,
                "spk_production_cost": spk_production_cost,
                "spk_total_cost": spk_total_cost,
                "hpp_total_actual": hpp_total_actual,
                "hpp_per_unit": hpp_per_unit,
                "hpp_per_unit_spk": hpp_per_unit_spk,
                "hpp_status": hpp_status,
                "material_cost_diff": spk_material_cost - formula_material_cost_for_spk_qty,
                "production_cost_diff": spk_production_cost - formula_production_cost,
                "total_cost_diff": spk_total_cost - formula_total_cost,
                "formula_vs_spk_status": _formula_spk_status_from_materials(materials),
                "spk_vs_spm_status": _compare_material_map(spk_map, spm_map, missing_label="Belum Ditarik", extra_label="Tambahan SPM"),
                "material_stock_status": material_stock_status,
                "material_stock_shortage_count": stock_shortage_count,
                "wip_reconciliation": wip_reconciliation,
                "materials": materials,
                "production_details": production_details,
            })

        if qty_only:
            money_keys = {
                "formula_material_cost", "formula_production_cost", "formula_total_cost",
                "spk_material_cost", "spk_production_cost", "spk_total_cost",
                "hpp_total_actual", "hpp_per_unit", "hpp_per_unit_spk",
                "material_cost_diff", "production_cost_diff", "total_cost_diff",
                "formula_cost", "formula_cost_for_spk_qty", "spk_cost",
                "formula_unit_cost", "spk_unit_cost", "unit_cost", "total_cost",
                "cost_description", "wip_reconciliation",
            }
            for item in data:
                for key in money_keys:
                    item.pop(key, None)
                item["materials"] = [
                    {key: value for key, value in material.items() if key not in money_keys}
                    for material in item.get("materials", [])
                ]
                item["production_details"] = [
                    {key: value for key, value in production.items() if key not in money_keys}
                    for production in item.get("production_details", [])
                ]
                item["production_results"] = [
                    {key: value for key, value in result.items() if key not in money_keys}
                    for result in item.get("production_results", [])
                ]

        con.close()
        return jsonify({
            "data": filter_record_columns("monitoring_formula", data),
            "total": total_rows,
        })
    except Exception as e:
        print(f"Error api_monitoring_formula: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)}), 500


@app.route("/api/spk")
@jwt_required()
def api_spk():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions   = ["1=1"]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(w.WONO)               CONTAINING LOWER(?)
                OR LOWER(w.DESCRIPTION)     CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)        CONTAINING LOWER(?)
                OR LOWER(det.JOBDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(so.SONO)           CONTAINING LOWER(?)
                OR LOWER(so.PONO)           CONTAINING LOWER(?)
            )""")
            params_where += [search] * 7

        if date_from:
            conditions.append("w.WODATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("w.WODATE <= ?")
            params_where.append(date_to)

        status_condition = _spk_item_status_condition(status)
        if status_condition:
            conditions.append(status_condition)

        where_sql = " AND ".join(conditions)

        # Count distinct SPK untuk summary
        cur.execute(f"""
            SELECT COUNT(DISTINCT w.ID)
            FROM WO w
            LEFT JOIN WODET det ON det.WOID  = w.ID
            LEFT JOIN SO so     ON so.SOID   = det.SOID
            LEFT JOIN ITEM i    ON i.ITEMNO  = det.ITEMNO
            WHERE {where_sql}
        """, params_where)
        total_spk = int(cur.fetchone()[0] or 0)

        # Count total rows
        cur.execute(f"""
            SELECT COUNT(*)
            FROM WO w
            LEFT JOIN WODET det ON det.WOID  = w.ID
            LEFT JOIN SO so     ON so.SOID   = det.SOID
            LEFT JOIN ITEM i    ON i.ITEMNO  = det.ITEMNO
            WHERE {where_sql}
        """, params_where)
        total_rows = int(cur.fetchone()[0] or 0)

        cur.execute(f"""
            SELECT
                SUM(CASE WHEN spk_status = 2 THEN 1 ELSE 0 END),
                SUM(CASE WHEN spk_status <> 2 THEN 1 ELSE 0 END)
            FROM (
                SELECT
                    w.ID,
                    MIN(COALESCE(det.STATUS, 0)) AS spk_status
                FROM WO w
                LEFT JOIN WODET det ON det.WOID  = w.ID
                LEFT JOIN SO so     ON so.SOID   = det.SOID
                LEFT JOIN ITEM i    ON i.ITEMNO  = det.ITEMNO
                WHERE {where_sql}
                GROUP BY w.ID
            ) x
        """, params_where)
        status_row = cur.fetchone()
        spk_selesai = int(status_row[0] or 0)
        spk_berjalan = int(status_row[1] or 0)

        cur.execute(f"""
            SELECT COUNT(*)
            FROM WO w
            LEFT JOIN WODET det ON det.WOID  = w.ID
            LEFT JOIN SO so     ON so.SOID   = det.SOID
            LEFT JOIN ITEM i    ON i.ITEMNO  = det.ITEMNO
            WHERE {where_sql}
              AND EXISTS (
                  SELECT 1
                  FROM PRODRESULTDET prd
                  JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
                  WHERE prd.WODETID = det.ID
              )
        """, params_where)
        item_selesai_gp = int(cur.fetchone()[0] or 0)

        # Query utama
        # Tgl Selesai: PRODRESULTDET.WODETID = WODET.ID
        #              → PRODRESULT.ID = PRODRESULTDET.PRODRESULTID
        #              → MAX(PRODRESULT.RESULTDATE)
        cur.execute(f"""
            WITH
            page_rows AS (
                SELECT FIRST ? SKIP ?
                    det.ID AS WODET_ID,
                    w.WONO,
                    w.WODATE,
                    w.EXPECTEDDATE,
                    w.DESCRIPTION,
                    det.ITEMNO,
                    det.JOBDESCRIPTION,
                    det.QUANTITY,
                    det.UNIT,
                    det.STATUS,
                    i.ITEMDESCRIPTION,
                    i.TIPEPERSEDIAAN,
                    so.SONO,
                    so.PONO,
                    det.NOJOB
                FROM WO w
                LEFT JOIN WODET det ON det.WOID  = w.ID
                LEFT JOIN SO so     ON so.SOID   = det.SOID
                LEFT JOIN ITEM i    ON i.ITEMNO  = det.ITEMNO
                WHERE {where_sql}
                ORDER BY w.WODATE DESC, w.WONO, det.NOJOB
            ),
            result_agg AS (
                SELECT
                    prd.WODETID,
                    MAX(pr.RESULTDATE) AS TGL_SELESAI,
                    SUM(COALESCE(prd.QUANTITY, 0)) AS TOTAL_QTY_HASIL
                FROM PRODRESULTDET prd
                JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
                JOIN page_rows p ON p.WODET_ID = prd.WODETID
                GROUP BY prd.WODETID
            ),
            mat_agg AS (
                SELECT
                    wdm.WODETID,
                    SUM(wdm.QUANTITY) AS TOTAL_MAT_PLAN,
                    SUM(COALESCE(wdm.QTYTAKEN, 0)) AS TOTAL_QTYTAKEN
                FROM WODETMAT wdm
                JOIN page_rows p ON p.WODET_ID = wdm.WODETID
                GROUP BY wdm.WODETID
            ),
            release_by_material AS (
                SELECT
                    wdm.WODETID,
                    SUM(md.QUANTITY) AS TOTAL_MAT_KELUAR
                FROM WODETMAT wdm
                JOIN page_rows p ON p.WODET_ID = wdm.WODETID
                JOIN MATRLSDET md ON md.WODETID = wdm.ID
                GROUP BY wdm.WODETID
            ),
            release_by_wodet AS (
                SELECT
                    md.WODETID,
                    SUM(md.QUANTITY) AS TOTAL_MAT_KELUAR
                FROM MATRLSDET md
                JOIN page_rows p ON p.WODET_ID = md.WODETID
                GROUP BY md.WODETID
            )
            SELECT
                p.WODET_ID,
                p.WONO,
                p.WODATE,
                p.EXPECTEDDATE,
                p.DESCRIPTION,
                p.ITEMNO,
                p.JOBDESCRIPTION,
                p.QUANTITY,
                p.UNIT,
                p.STATUS,
                p.ITEMDESCRIPTION,
                p.TIPEPERSEDIAAN,
                p.SONO,
                p.PONO,
                ra.TGL_SELESAI,
                ra.TOTAL_QTY_HASIL,
                ma.TOTAL_MAT_PLAN,
                ma.TOTAL_QTYTAKEN,
                COALESCE(rbm.TOTAL_MAT_KELUAR, rbw.TOTAL_MAT_KELUAR, 0) AS TOTAL_MAT_KELUAR
            FROM page_rows p
            LEFT JOIN result_agg ra           ON ra.WODETID  = p.WODET_ID
            LEFT JOIN mat_agg ma              ON ma.WODETID  = p.WODET_ID
            LEFT JOIN release_by_material rbm ON rbm.WODETID = p.WODET_ID
            LEFT JOIN release_by_wodet rbw    ON rbw.WODETID = p.WODET_ID
            ORDER BY p.WODATE DESC, p.WONO, p.NOJOB
        """, [limit, offset] + params_where)

        rows = cur.fetchall()
        con.close()

        data = []
        for r in rows:
            qty_spk = float(r[7] or 0)
            total_qty_hasil = float(r[15] or 0)
            total_mat_plan = float(r[16] or 0)
            total_qtytaken = float(r[17] or 0)
            total_keluar   = float(r[18] or 0)
            total_processed = max(total_qtytaken, total_keluar)
            material_progress = round(min((total_processed / total_mat_plan) * 100, 100.0), 1) if total_mat_plan > 0 else 0.0
            is_production_done = qty_spk <= 0 or total_qty_hasil + 0.0001 >= qty_spk
            tgl_selesai = str(r[14]) if r[14] and is_production_done else ""

            if is_production_done and total_qty_hasil > 0:
                production_status = "Selesai"
            elif total_qty_hasil > 0 or material_progress > 0:
                production_status = "In Progress"
            else:
                production_status = "Belum Mulai"

            data.append({
                "wodet_id":           int(r[0] or 0),
                "no_spk":             str(r[1]  or "").strip(),
                "tanggal":            str(r[2])  if r[2] else "",
                "estimasi":           str(r[3])  if r[3] else "",
                "deskripsi":          str(r[4]  or "").strip(),
                "no_barang":          str(r[5]  or "").strip(),
                "job_desc":           str(r[6]  or "").strip(),
                "qty":                qty_spk,
                "uom":                str(r[8]  or "").strip(),
                "status_barang":      int(r[9]  or 0),
                "nama_barang":        str(r[10] or "").strip(),
                "tipe_persediaan":    str(r[11] or "").strip(),
                "no_pesanan":         str(r[11] or "").strip(),   # SO.SONO — kosong jika SPK internal
                "no_po":              str(r[12] or "").strip(),   # SO.PONO — No PO dari customer
                "no_pesanan":         str(r[12] or "").strip(),
                "no_po":              str(r[13] or "").strip(),
                "tgl_selesai":        tgl_selesai,                # Terisi hanya jika total hasil produksi sudah memenuhi qty SPK
                "qty_hasil_produksi": total_qty_hasil,
                "total_mat_plan":     total_mat_plan,
                "total_mat_keluar":   total_processed,
                "material_progress":  material_progress,
                "production_status":  production_status,
            })

        return jsonify({
            "data":       filter_record_columns("spk", data),
            "total":      total_rows,
            "total_spk":  total_spk,
            "total_item": total_rows,
            "spk_selesai": spk_selesai,
            "spk_berjalan": spk_berjalan,
            "item_selesai_gp": item_selesai_gp,
        })

    except Exception as e:
        print(f"Error api_spk: {e}")
        return jsonify({"data": [], "total": 0, "total_spk": 0, "total_item": 0, "error": str(e)})

# ─── DAFTAR SPM (Surat Pengeluaran Material) ─────────────────────────────────
# Tambahkan endpoint ini ke server.py sebelum background_sync()
#
# Tabel:
#   MATRLS     → header SPM (No Pengeluaran, Tgl, Deskripsi)
#   MATRLSDET  → detail item (No Barang, Qty Keluar, Satuan)
#   WO         → Work Order (No Perintah Kerja, Tgl PK)
#   WODETMAT   → qty yang direncanakan + qty yang sudah diambil (untuk % )
#   ITEM       → deskripsi barang
#
# Persentase = (QTYTAKEN / QUANTITY) * 100 dari WODETMAT
# Jika QTYTAKEN NULL → hitung dari total qty keluar di MATRLSDET vs QUANTITY plan

def _spk_item_status_condition(status):
    has_gp = """
        EXISTS (
            SELECT 1
            FROM PRODRESULTDET prd
            JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
            WHERE prd.WODETID = det.ID
        )
    """
    has_material_progress = """
        (
            EXISTS (
                SELECT 1
                FROM WODETMAT wdm
                WHERE wdm.WODETID = det.ID
                  AND COALESCE(wdm.QTYTAKEN, 0) > 0
            )
            OR EXISTS (
                SELECT 1
                FROM MATRLSDET md
                JOIN WODETMAT wdm2 ON wdm2.ID = md.WODETID
                WHERE wdm2.WODETID = det.ID
                  AND COALESCE(md.QUANTITY, 0) > 0
            )
            OR EXISTS (
                SELECT 1
                FROM MATRLSDET md
                WHERE md.WODETID = det.ID
                  AND COALESCE(md.QUANTITY, 0) > 0
            )
        )
    """
    if status == "Selesai":
        return has_gp
    if status == "In Progress":
        return f"NOT {has_gp} AND {has_material_progress}"
    if status == "Belum Mulai":
        return f"NOT {has_gp} AND NOT {has_material_progress}"
    return None

@app.route("/api/spk/export")
@jwt_required()
def api_spk_export():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions = ["1=1"]
        params_where = []
        if search:
            conditions.append("""(
                LOWER(w.WONO)               CONTAINING LOWER(?)
                OR LOWER(w.DESCRIPTION)     CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)        CONTAINING LOWER(?)
                OR LOWER(det.JOBDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(so.SONO)           CONTAINING LOWER(?)
                OR LOWER(so.PONO)           CONTAINING LOWER(?)
            )""")
            params_where += [search] * 7
        if date_from:
            conditions.append("w.WODATE >= ?")
            params_where.append(date_from)
        if date_to:
            conditions.append("w.WODATE <= ?")
            params_where.append(date_to)
        status_condition = _spk_item_status_condition(status)
        if status_condition:
            conditions.append(status_condition)

        where_sql = " AND ".join(conditions)
        cur.execute(f"""
            WITH
            page_rows AS (
                SELECT
                    det.ID AS WODET_ID,
                    w.WONO,
                    w.WODATE,
                    w.EXPECTEDDATE,
                    w.DESCRIPTION,
                    det.ITEMNO,
                    det.JOBDESCRIPTION,
                    det.QUANTITY,
                    det.UNIT,
                    det.STATUS,
                    i.ITEMDESCRIPTION,
                    i.TIPEPERSEDIAAN,
                    so.SONO,
                    so.PONO,
                    det.NOJOB
                FROM WO w
                LEFT JOIN WODET det ON det.WOID = w.ID
                LEFT JOIN SO so ON so.SOID = det.SOID
                LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
                WHERE {where_sql}
            ),
            result_agg AS (
                SELECT
                    prd.WODETID,
                    MAX(pr.RESULTDATE) AS TGL_SELESAI,
                    SUM(COALESCE(prd.QUANTITY, 0)) AS TOTAL_QTY_HASIL
                FROM PRODRESULTDET prd
                JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
                JOIN page_rows p ON p.WODET_ID = prd.WODETID
                GROUP BY prd.WODETID
            ),
            mat_agg AS (
                SELECT
                    wdm.WODETID,
                    SUM(wdm.QUANTITY) AS TOTAL_MAT_PLAN,
                    SUM(COALESCE(wdm.QTYTAKEN, 0)) AS TOTAL_QTYTAKEN
                FROM WODETMAT wdm
                JOIN page_rows p ON p.WODET_ID = wdm.WODETID
                GROUP BY wdm.WODETID
            ),
            release_by_material AS (
                SELECT
                    wdm.WODETID,
                    SUM(md.QUANTITY) AS TOTAL_MAT_KELUAR
                FROM WODETMAT wdm
                JOIN page_rows p ON p.WODET_ID = wdm.WODETID
                JOIN MATRLSDET md ON md.WODETID = wdm.ID
                GROUP BY wdm.WODETID
            ),
            release_by_wodet AS (
                SELECT
                    md.WODETID,
                    SUM(md.QUANTITY) AS TOTAL_MAT_KELUAR
                FROM MATRLSDET md
                JOIN page_rows p ON p.WODET_ID = md.WODETID
                GROUP BY md.WODETID
            )
            SELECT
                p.WODET_ID,
                p.WONO,
                p.WODATE,
                p.EXPECTEDDATE,
                p.DESCRIPTION,
                p.ITEMNO,
                p.JOBDESCRIPTION,
                p.QUANTITY,
                p.UNIT,
                p.STATUS,
                p.ITEMDESCRIPTION,
                p.TIPEPERSEDIAAN,
                p.SONO,
                p.PONO,
                ra.TGL_SELESAI,
                ra.TOTAL_QTY_HASIL,
                ma.TOTAL_MAT_PLAN,
                ma.TOTAL_QTYTAKEN,
                COALESCE(rbm.TOTAL_MAT_KELUAR, rbw.TOTAL_MAT_KELUAR, 0) AS TOTAL_MAT_KELUAR
            FROM page_rows p
            LEFT JOIN result_agg ra ON ra.WODETID = p.WODET_ID
            LEFT JOIN mat_agg ma ON ma.WODETID = p.WODET_ID
            LEFT JOIN release_by_material rbm ON rbm.WODETID = p.WODET_ID
            LEFT JOIN release_by_wodet rbw ON rbw.WODETID = p.WODET_ID
            ORDER BY p.WODATE DESC, p.WONO, p.NOJOB
        """, params_where)

        rows = cur.fetchall()
        con.close()

        data = []
        for r in rows:
            qty_spk = float(r[7] or 0)
            total_qty_hasil = float(r[15] or 0)
            total_mat_plan = float(r[16] or 0)
            total_qtytaken = float(r[17] or 0)
            total_keluar = float(r[18] or 0)
            total_processed = max(total_qtytaken, total_keluar)
            material_progress = round(min((total_processed / total_mat_plan) * 100, 100.0), 1) if total_mat_plan > 0 else 0.0
            is_production_done = qty_spk <= 0 or total_qty_hasil + 0.0001 >= qty_spk
            if is_production_done and total_qty_hasil > 0:
                production_status = "Selesai"
            elif total_qty_hasil > 0 or material_progress > 0:
                production_status = "In Progress"
            else:
                production_status = "Belum Mulai"
            data.append({
                "wodet_id": int(r[0] or 0),
                "no_spk": str(r[1] or "").strip(),
                "tanggal": str(r[2]) if r[2] else "",
                "estimasi": str(r[3]) if r[3] else "",
                "deskripsi": str(r[4] or "").strip(),
                "no_barang": str(r[5] or "").strip(),
                "job_desc": str(r[6] or "").strip(),
                "qty": qty_spk,
                "uom": str(r[8] or "").strip(),
                "status_barang": int(r[9] or 0),
                "nama_barang": str(r[10] or "").strip(),
                "tipe_persediaan": str(r[11] or "").strip(),
                "no_pesanan": str(r[12] or "").strip(),
                "no_po": str(r[13] or "").strip(),
                "tgl_selesai": str(r[14]) if r[14] and is_production_done else "",
                "qty_hasil_produksi": total_qty_hasil,
                "total_mat_plan": total_mat_plan,
                "total_mat_keluar": total_processed,
                "material_progress": material_progress,
                "production_status": production_status,
            })

        data = filter_record_columns("spk", data)
        return jsonify({"data": data, "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_spk_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/spm")
@jwt_required()
def api_spm():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions   = ["det.ITEMNO IS NOT NULL"]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(m.RELEASENO)     CONTAINING LOWER(?)
                OR LOWER(wo.WONO)      CONTAINING LOWER(?)
                OR LOWER(det.ITEMNO)   CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(m.DESCRIPTION) CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search]

        if date_from:
            conditions.append("m.RELEASEDATE >= ?")
            params_where.append(date_from)

        if date_to:
            conditions.append("m.RELEASEDATE <= ?")
            params_where.append(date_to)

        pct_expr = """
            CASE
                WHEN COALESCE(wdm.QUANTITY, 0) > 0 THEN
                    CASE
                        WHEN wdm.QTYTAKEN IS NOT NULL THEN COALESCE(wdm.QTYTAKEN, 0) / wdm.QUANTITY
                        ELSE COALESCE(det.QUANTITY, 0) / wdm.QUANTITY
                    END
                ELSE 0
            END
        """
        if status == "selesai":
            conditions.append(f"({pct_expr}) >= 1")
        elif status == "sebagian":
            conditions.append(f"({pct_expr}) > 0 AND ({pct_expr}) < 1")
        elif status == "belum":
            conditions.append(f"({pct_expr}) <= 0")

        where_sql = " AND ".join(conditions)

        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                m.RELEASENO,
                m.RELEASEDATE,
                wo.WONO,
                wo.WODATE,
                m.DESCRIPTION,
                det.ITEMNO,
                i.ITEMDESCRIPTION,
                det.UNIT,
                det.QUANTITY        AS QTY_KELUAR,
                wdm.QUANTITY        AS QTY_PLAN,
                wdm.QTYTAKEN        AS QTY_TAKEN
            FROM MATRLS m
            LEFT JOIN WO wo          ON wo.ID        = m.WOID
            LEFT JOIN MATRLSDET det  ON det.MATRLSID = m.ID
            LEFT JOIN WODETMAT wdm   ON wdm.ID       = det.WODETID
            LEFT JOIN ITEM i         ON i.ITEMNO     = det.ITEMNO
            WHERE {where_sql}
            ORDER BY m.RELEASEDATE DESC, m.RELEASENO, det.ID
        """, [limit, offset] + params_where)

        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            qty_keluar = float(row[8] or 0)
            qty_plan   = float(row[9] or 0)
            qty_taken  = float(row[10] or 0)

            # Hitung persentase
            # Jika QTYTAKEN tersedia → pakai itu
            # Jika tidak → pakai qty_keluar vs qty_plan
            if qty_plan > 0:
                if row[10] is not None:
                    pct = round((qty_taken / qty_plan) * 100, 1)
                else:
                    pct = round((qty_keluar / qty_plan) * 100, 1)
                pct = min(pct, 100.0)  # cap 100%
            else:
                pct = 0.0

            # Status berdasarkan persentase
            if pct >= 100:
                status = "Selesai"
            elif pct > 0:
                status = "Sebagian"
            else:
                status = "Belum Keluar"

            data.append({
                "no_pengeluaran":  str(row[0] or "").strip(),
                "tgl_pengeluaran": str(row[1]) if row[1] else "",
                "no_pk":           str(row[2] or "").strip(),
                "tgl_pk":          str(row[3]) if row[3] else "",
                "deskripsi":       str(row[4] or "").strip(),
                "no_barang":       str(row[5] or "").strip(),
                "deskripsi_barang":str(row[6] or "").strip(),
                "satuan":          str(row[7] or "").strip(),
                "qty_keluar":      qty_keluar,
                "qty_plan":        qty_plan,
                "persentase":      pct,
                "status":          status,
            })

        return jsonify({"data": filter_record_columns("spm", data), "total": len(data)})

    except Exception as e:
        print(f"Error api_spm: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})

# ─── GP (Goods Production / Hasil Produksi) ──────────────────────────────────
#
# Tabel:
#   FNSHGOOD      → header GP (No Hasil Produksi, Tgl, WOID, Deskripsi)
#   FNSHGOODDET   → detail barang jadi (No Barang, Qty Jadi, UoM)  [belum tentu ada]
#   PRODRESULT    → hasil produksi aktual per WO (alternatif jika FNSHGOODDET kosong)
#   PRODRESULTDET → detail barang per hasil produksi
#   WO            → header SPK (No SPK, WOID)
#   MATRLS        → header SPM (No SPM, WOID)
#   ITEM          → deskripsi barang
#
# Qty Plan  = WODET.QUANTITY  (qty yang dipesan di SPK)
# Qty Jadi  = PRODRESULTDET.QUANTITY (qty yang sudah selesai diproduksi)
# Persentase = (qty_jadi / qty_plan) * 100

def _gp_status_condition(status):
    status_rules = {
        "Selesai": """
            (
                (COALESCE(wd.QUANTITY, 0) > 0 AND COALESCE(prd.QUANTITY, 0) >= COALESCE(wd.QUANTITY, 0))
                OR (COALESCE(wd.QUANTITY, 0) <= 0 AND COALESCE(prd.QUANTITY, 0) > 0)
            )
        """,
        "Sebagian": """
            (
                COALESCE(wd.QUANTITY, 0) > 0
                AND COALESCE(prd.QUANTITY, 0) > 0
                AND COALESCE(prd.QUANTITY, 0) < COALESCE(wd.QUANTITY, 0)
            )
        """,
        "Belum Jadi": "COALESCE(prd.QUANTITY, 0) <= 0",
    }
    return status_rules.get(status)

@app.route("/api/gp")
@jwt_required()
def api_gp():
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        # WHERE hanya di tabel utama — tidak include MATRLS di WHERE
        # karena MATRLS diambil via subquery untuk hindari row multiplication
        conditions   = ["prd.ITEMNO IS NOT NULL"]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(pr.RESULTNO)          CONTAINING LOWER(?)
                OR LOWER(wo.WONO)           CONTAINING LOWER(?)
                OR LOWER(prd.ITEMNO)        CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(pr.DESCRIPTION)    CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search]

        if date_from:
            conditions.append("pr.RESULTDATE >= ?")
            params_where.append(date_from)
        if date_to:
            conditions.append("pr.RESULTDATE <= ?")
            params_where.append(date_to)

        status_condition = _gp_status_condition(status)
        if status_condition:
            conditions.append(status_condition)

        where_sql = " AND ".join(conditions)

        # Kolom PRODRESULTDET yang valid (dari hasil cek):
        #   ID, PRODRESULTID, WODETID, ITEMNO, QUANTITY, UNIT, UNITRATIO,
        #   PORTION, COST, WAREHOUSEID, ITEMHISTID, ITEMRESERVED1..10, NOTES
        # TIDAK ada: ITEMOVDESC, SEQ
        #
        # Qty Plan diambil dari WODET berdasarkan WODETID (lebih akurat dari ITEMNO)
        # SPM diambil via subquery untuk hindari row multiplication
        sql = f"""
            SELECT FIRST ? SKIP ?
                pr.RESULTNO,
                pr.RESULTDATE,
                wo.WONO,
                (SELECT FIRST 1 m2.RELEASENO
                 FROM MATRLS m2
                 WHERE m2.WOID = pr.WOID
                 ORDER BY m2.RELEASEDATE),
                pr.DESCRIPTION,
                prd.ITEMNO,
                i.ITEMDESCRIPTION,
                prd.QUANTITY        AS QTY_JADI,
                prd.UNIT,
                wd.QUANTITY         AS QTY_PLAN
            FROM PRODRESULT pr
            LEFT JOIN WO wo             ON wo.ID          = pr.WOID
            LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
            LEFT JOIN ITEM i            ON i.ITEMNO       = prd.ITEMNO
            LEFT JOIN WODET wd          ON wd.ID          = prd.WODETID
            WHERE {where_sql}
            ORDER BY pr.RESULTDATE DESC, pr.RESULTNO, prd.ID
        """
        cur.execute(sql, [limit, offset] + params_where)
        rows = cur.fetchall()

        # Count distinct GP header
        sql_count = f"""
            SELECT COUNT(DISTINCT pr.ID)
            FROM PRODRESULT pr
            LEFT JOIN WO wo             ON wo.ID          = pr.WOID
            LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
            LEFT JOIN ITEM i            ON i.ITEMNO       = prd.ITEMNO
            LEFT JOIN WODET wd          ON wd.ID          = prd.WODETID
            WHERE {where_sql}
        """
        cur.execute(sql_count, params_where)
        total_gp = int(cur.fetchone()[0] or 0)

        sql_stats = f"""
            SELECT
                SUM(CASE WHEN {_gp_status_condition("Selesai")} THEN 1 ELSE 0 END),
                SUM(CASE WHEN {_gp_status_condition("Sebagian")} THEN 1 ELSE 0 END),
                SUM(CASE WHEN {_gp_status_condition("Belum Jadi")} THEN 1 ELSE 0 END)
            FROM PRODRESULT pr
            LEFT JOIN WO wo             ON wo.ID          = pr.WOID
            LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
            LEFT JOIN ITEM i            ON i.ITEMNO       = prd.ITEMNO
            LEFT JOIN WODET wd          ON wd.ID          = prd.WODETID
            WHERE {where_sql}
        """
        cur.execute(sql_stats, params_where)
        stats_row = cur.fetchone()

        con.close()

        data = []
        for row in rows:
            qty_jadi = float(row[7] or 0)
            qty_plan = float(row[9] or 0)

            if qty_plan > 0:
                pct = round(min((qty_jadi / qty_plan) * 100, 100.0), 1)
            else:
                pct = 100.0 if qty_jadi > 0 else 0.0

            if pct >= 100:
                status = "Selesai"
            elif pct > 0:
                status = "Sebagian"
            else:
                status = "Belum Jadi"

            data.append({
                "no_hasil":         str(row[0] or "").strip(),
                "tgl_hasil":        str(row[1]) if row[1] else "",
                "no_spk":           str(row[2] or "").strip(),
                "no_spm":           str(row[3] or "").strip(),
                "deskripsi":        str(row[4] or "").replace('\r\n', ' ').replace('\n', ' ').strip(),
                "no_barang":        str(row[5] or "").strip(),
                "deskripsi_barang": str(row[6] or "").strip(),
                "qty_jadi":         qty_jadi,
                "qty_plan":         qty_plan,
                "uom":              str(row[8] or "").strip(),
                "persentase":       pct,
                "status":           status,
            })

        return jsonify({
            "data":     filter_record_columns("gp", data),
            "total":    len(data),
            "total_gp": total_gp,
            "stats": {
                "selesai":  int(stats_row[0] or 0),
                "sebagian": int(stats_row[1] or 0),
                "belum":    int(stats_row[2] or 0),
            },
        })

    except Exception as e:
        print(f"Error api_gp: {e}")
        return jsonify({"data": [], "total": 0, "total_gp": 0, "error": str(e)})


@app.route("/api/gp/export")
@jwt_required()
def api_gp_export():
    """Export SEMUA data GP tanpa limit."""
    if not check_permission("spk"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        conditions   = ["prd.ITEMNO IS NOT NULL"]
        params_where = []

        if search:
            conditions.append("""(
                LOWER(pr.RESULTNO)          CONTAINING LOWER(?)
                OR LOWER(wo.WONO)           CONTAINING LOWER(?)
                OR LOWER(prd.ITEMNO)        CONTAINING LOWER(?)
                OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
                OR LOWER(pr.DESCRIPTION)    CONTAINING LOWER(?)
            )""")
            params_where += [search, search, search, search, search]

        if date_from:
            conditions.append("pr.RESULTDATE >= ?")
            params_where.append(date_from)
        if date_to:
            conditions.append("pr.RESULTDATE <= ?")
            params_where.append(date_to)

        status_condition = _gp_status_condition(status)
        if status_condition:
            conditions.append(status_condition)

        where_sql = " AND ".join(conditions)

        sql = f"""
            SELECT
                pr.RESULTNO,
                pr.RESULTDATE,
                wo.WONO,
                (SELECT FIRST 1 m2.RELEASENO
                 FROM MATRLS m2
                 WHERE m2.WOID = pr.WOID
                 ORDER BY m2.RELEASEDATE),
                pr.DESCRIPTION,
                prd.ITEMNO,
                i.ITEMDESCRIPTION,
                prd.QUANTITY,
                prd.UNIT,
                wd.QUANTITY AS QTY_PLAN
            FROM PRODRESULT pr
            LEFT JOIN WO wo             ON wo.ID          = pr.WOID
            LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
            LEFT JOIN ITEM i            ON i.ITEMNO       = prd.ITEMNO
            LEFT JOIN WODET wd          ON wd.ID          = prd.WODETID
            WHERE {where_sql}
            ORDER BY pr.RESULTDATE DESC, pr.RESULTNO, prd.ID
        """
        cur.execute(sql, params_where)
        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            qty_jadi = float(row[7] or 0)
            qty_plan = float(row[9] or 0)
            pct = round(min((qty_jadi / qty_plan) * 100, 100.0), 1) if qty_plan > 0 else (100.0 if qty_jadi > 0 else 0.0)
            data.append({
                "no_hasil":         str(row[0] or "").strip(),
                "tgl_hasil":        str(row[1]) if row[1] else "",
                "no_spk":           str(row[2] or "").strip(),
                "no_spm":           str(row[3] or "").strip(),
                "deskripsi":        str(row[4] or "").replace('\r\n', ' ').replace('\n', ' ').strip(),
                "no_barang":        str(row[5] or "").strip(),
                "deskripsi_barang": str(row[6] or "").strip(),
                "qty_jadi":         qty_jadi,
                "qty_plan":         qty_plan,
                "uom":              str(row[8] or "").strip(),
                "persentase":       pct,
                "status":           "Selesai" if pct >= 100 else ("Sebagian" if pct > 0 else "Belum Jadi"),
            })

        return jsonify({"data": filter_record_columns("gp", data), "total": len(data)})

    except Exception as e:
        print(f"Error api_gp_export: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


# ─── DAFTAR FPB (Faktur Penerimaan Barang / AP Invoice) ──────────────────────
#
def _build_hpp_rows(cur, date_from="", date_to="", search=""):
    production_conditions = ["prd.ITEMNO IS NOT NULL"]
    production_params = []
    sales_conditions = [
        "ar.DELIVERYORDER IS NOT NULL AND TRIM(ar.DELIVERYORDER) <> ''",
        "ar.INVOICETYPE = 1",
        "det.ITEMNO IS NOT NULL",
    ]
    sales_params = []

    if date_from:
        production_conditions.append("pr.RESULTDATE >= ?")
        production_params.append(date_from)
        sales_conditions.append("ar.INVOICEDATE >= ?")
        sales_params.append(date_from)
    if date_to:
        production_conditions.append("pr.RESULTDATE <= ?")
        production_params.append(date_to)
        sales_conditions.append("ar.INVOICEDATE <= ?")
        sales_params.append(date_to)
    if search:
        production_conditions.append("""(
            LOWER(prd.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(i.ITEMDESCRIPTION) CONTAINING LOWER(?)
        )""")
        production_params += [search, search]
        sales_conditions.append("""(
            LOWER(det.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(det.ITEMOVDESC, i.ITEMDESCRIPTION)) CONTAINING LOWER(?)
        )""")
        sales_params += [search, search]

    cur.execute(f"""
        SELECT
            prd.ITEMNO,
            MAX(i.ITEMDESCRIPTION),
            SUM(COALESCE(prd.QUANTITY, 0)),
            SUM(COALESCE(prd.COST, 0) * COALESCE(prd.QUANTITY, 0))
        FROM PRODRESULT pr
        LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
        LEFT JOIN ITEM i            ON i.ITEMNO = prd.ITEMNO
        WHERE {" AND ".join(production_conditions)}
        GROUP BY prd.ITEMNO
    """, production_params)

    rows_by_item = {}
    for itemno, item_name, qty_produksi, hpp_produksi_total in cur.fetchall():
        item_key = str(itemno or "").strip()
        if not item_key:
            continue
        rows_by_item[item_key] = {
            "no_barang": item_key,
            "deskripsi_barang": str(item_name or "").strip(),
            "qty_produksi": float(qty_produksi or 0),
            "qty_terjual": 0.0,
            "hpp_produksi_total": float(hpp_produksi_total or 0),
            "nilai_jual": 0.0,
        }

    cur.execute(f"""
        SELECT
            det.ITEMNO,
            MAX(COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION)),
            SUM(COALESCE(det.QUANTITY, 0)),
            SUM(
                COALESCE(det.QUANTITY, 0)
                * COALESCE(det.UNITPRICE, 0)
                * (1 - COALESCE(CAST(det.ITEMDISCPC AS DOUBLE PRECISION), 0) / 100)
            )
        FROM ARINV ar
        LEFT JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
        LEFT JOIN ITEM i       ON i.ITEMNO = det.ITEMNO
        WHERE {" AND ".join(sales_conditions)}
        GROUP BY det.ITEMNO
    """, sales_params)

    for itemno, item_name, qty_terjual, nilai_jual in cur.fetchall():
        item_key = str(itemno or "").strip()
        if not item_key:
            continue
        row = rows_by_item.setdefault(item_key, {
            "no_barang": item_key,
            "deskripsi_barang": str(item_name or "").strip(),
            "qty_produksi": 0.0,
            "qty_terjual": 0.0,
            "hpp_produksi_total": 0.0,
            "nilai_jual": 0.0,
        })
        if not row.get("deskripsi_barang"):
            row["deskripsi_barang"] = str(item_name or "").strip()
        row["qty_terjual"] = float(qty_terjual or 0)
        row["nilai_jual"] = float(nilai_jual or 0)

    so_conditions = ["det.ITEMNO IS NOT NULL"]
    so_params = []
    if date_from:
        so_conditions.append("so.SODATE >= ?")
        so_params.append(date_from)
    if date_to:
        so_conditions.append("so.SODATE <= ?")
        so_params.append(date_to)
    if search:
        so_conditions.append("""(
            LOWER(det.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(det.ITEMOVDESC, i.ITEMDESCRIPTION)) CONTAINING LOWER(?)
        )""")
        so_params += [search, search]

    cur.execute(f"""
        SELECT
            det.ITEMNO,
            MAX(COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION)),
            SUM(COALESCE(NULLIF(det.QTYSHIPPED, 0), det.QUANTITY, 0)),
            SUM(
                COALESCE(NULLIF(det.QTYSHIPPED, 0), det.QUANTITY, 0)
                * COALESCE(det.UNITPRICE, 0)
                * (1 - COALESCE(CAST(det.DISCPC AS DOUBLE PRECISION), 0) / 100)
            )
        FROM SO so
        LEFT JOIN SODET det ON det.SOID = so.SOID
        LEFT JOIN ITEM i    ON i.ITEMNO = det.ITEMNO
        WHERE {" AND ".join(so_conditions)}
        GROUP BY det.ITEMNO
    """, so_params)

    for itemno, item_name, qty_terjual, nilai_jual in cur.fetchall():
        item_key = str(itemno or "").strip()
        if not item_key:
            continue
        row = rows_by_item.setdefault(item_key, {
            "no_barang": item_key,
            "deskripsi_barang": str(item_name or "").strip(),
            "qty_produksi": 0.0,
            "qty_terjual": 0.0,
            "hpp_produksi_total": 0.0,
            "nilai_jual": 0.0,
        })
        if row.get("qty_terjual") or row.get("nilai_jual"):
            continue
        if not row.get("deskripsi_barang"):
            row["deskripsi_barang"] = str(item_name or "").strip()
        row["qty_terjual"] = float(qty_terjual or 0)
        row["nilai_jual"] = float(nilai_jual or 0)

    data = []
    for row in rows_by_item.values():
        qty_produksi = float(row["qty_produksi"] or 0)
        qty_terjual = float(row["qty_terjual"] or 0)
        hpp_produksi_total = float(row["hpp_produksi_total"] or 0)
        nilai_jual = float(row["nilai_jual"] or 0)
        hpp_per_unit = hpp_produksi_total / qty_produksi if qty_produksi else 0
        hpp_total = hpp_per_unit * (qty_terjual if qty_terjual else qty_produksi)
        harga_jual_rata = nilai_jual / qty_terjual if qty_terjual else 0
        laba_rugi = nilai_jual - hpp_total
        margin_pct = (laba_rugi / nilai_jual * 100) if nilai_jual else 0
        status = "Laba" if laba_rugi > 0 else "Rugi" if laba_rugi < 0 else "Impas"

        data.append({
            "no_barang": row["no_barang"],
            "deskripsi_barang": row["deskripsi_barang"],
            "qty_produksi": round(qty_produksi, 4),
            "qty_terjual": round(qty_terjual, 4),
            "hpp_total": round(hpp_total, 2),
            "hpp_per_unit": round(hpp_per_unit, 2),
            "harga_jual_rata": round(harga_jual_rata, 2),
            "nilai_jual": round(nilai_jual, 2),
            "laba_rugi": round(laba_rugi, 2),
            "margin_pct": round(margin_pct, 2),
            "status": status,
        })

    return sorted(data, key=lambda item: item["laba_rugi"], reverse=True)


def _profit_loss_invoice_where(date_from="", date_to=""):
    conditions = [
        "ar.DELIVERYORDER = '0'",
        "ar.INVOICETYPE = 1",
        "(ar.ISDP IS NULL OR ar.ISDP = 0)",
    ]
    params = []
    if date_from:
        conditions.append("ar.INVOICEDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("ar.INVOICEDATE <= ?")
        params.append(date_to)
    return " AND ".join(conditions), params


def _profit_loss_effective_period(cur, date_from="", date_to=""):
    effective_to = date_to or datetime.now().date().isoformat()
    effective_from = date_from or datetime.now().date().replace(day=1).isoformat()
    return {
        "date_from": effective_from,
        "date_to": effective_to,
    }


def _profit_loss_allocate_lines(source_lines, target_amount, target_hpp):
    target_amount = max(float(target_amount or 0), 0)
    target_hpp = max(float(target_hpp or 0), 0)

    allocated = []
    for source in source_lines:
        row = dict(source)
        row["qty_faktur"] = float(row.get("qty_faktur") or 0)
        row["jumlah"] = max(float(row.get("jumlah") or 0), 0)
        row["_source_hpp"] = max(float(row.get("_source_hpp") or 0), 0)
        allocated.append(row)

    if not allocated:
        return []

    allocated_amount = sum(max(float(row.get("jumlah") or 0), 0) for row in allocated)
    if allocated_amount > 0 and target_amount > 0 and allocated_amount > target_amount + 0.005:
        amount_scale = target_amount / allocated_amount
        for row in allocated:
            original_amount = float(row.get("jumlah") or 0)
            row["qty_faktur"] = float(row.get("qty_faktur") or 0) * amount_scale
            row["jumlah"] = round(original_amount * amount_scale, 2)

    hpp_weight_total = sum(row["_source_hpp"] for row in allocated)
    amount_weight_total = sum(row["jumlah"] for row in allocated)
    for row in allocated:
        if hpp_weight_total > 0:
            nilai_hpp = row["_source_hpp"]
        elif amount_weight_total > 0:
            nilai_hpp = target_hpp * row["jumlah"] / amount_weight_total
        else:
            nilai_hpp = target_hpp / len(allocated) if allocated else 0
        row.pop("_source_hpp", None)
        row["nilai_hpp"] = nilai_hpp
        row["gross_profit"] = row["jumlah"] - nilai_hpp
        row["margin_pct"] = (row["gross_profit"] / row["jumlah"] * 100) if row["jumlah"] else 0
    return allocated


def _profit_loss_delivery_map(cur, no_sos):
    delivery_purchase_item_no = "6.00.00.006"
    normalized_no_sos = sorted({
        str(no_so or "").strip().upper()
        for no_so in no_sos
        if str(no_so or "").strip()
    })
    result = {}
    if not normalized_no_sos:
        return result

    for start in range(0, len(normalized_no_sos), 500):
        chunk = normalized_no_sos[start:start + 500]
        placeholders = ",".join(["?"] * len(chunk))
        line_discpc = sql_number_expr("det.ITEMDISCPC")
        cur.execute(f"""
            SELECT
                UPPER(TRIM(COALESCE(
                    NULLIF(TRIM(rd.ITEMRESERVED9), ''),
                    NULLIF(TRIM(det.ITEMRESERVED9), '')
                ))),
                po.PONO,
                po.PODATE,
                pd.NAME,
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.UNITPRICE,
                {line_discpc},
                po.CASHDISCOUNT,
                po.CASHDISCPC,
                (
                    SELECT SUM(
                        COALESCE(det_sum.QUANTITY, 0)
                        * COALESCE(det_sum.UNITPRICE, 0)
                        * (
                            1 - COALESCE({sql_number_expr("det_sum.ITEMDISCPC")}, 0) / 100
                        )
                    )
                    FROM PODET det_sum
                    WHERE det_sum.POID = po.POID
                )
            FROM PO po
            JOIN PODET det ON det.POID = po.POID
            LEFT JOIN REQUISITIONDET rd ON rd.REQID = det.REQID AND rd.SEQ = det.REQSEQ
            LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            WHERE UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH 'AI-SRV'
              AND UPPER(TRIM(COALESCE(
                    NULLIF(TRIM(rd.ITEMRESERVED9), ''),
                    NULLIF(TRIM(det.ITEMRESERVED9), '')
                  ))) IN ({placeholders})
              AND UPPER(TRIM(COALESCE(det.ITEMNO, ''))) = ?
        """, chunk + [delivery_purchase_item_no])
        for row in cur.fetchall():
            no_so = str(row[0] or "").strip().upper()
            amounts = _purchase_amounts(row[6], row[7], row[8], row[11], row[9], row[10])
            entry = result.setdefault(no_so, {"amount": 0.0, "po_numbers": [], "details": []})
            entry["amount"] += amounts["dpp"]
            no_delivery = str(row[1] or "").strip()
            if no_delivery and no_delivery not in entry["po_numbers"]:
                entry["po_numbers"].append(no_delivery)
            entry["details"].append({
                "no_transaksi": no_delivery,
                "tanggal": str(row[2]) if row[2] else "",
                "nama_vendor": str(row[3] or "").strip(),
                "no_barang": str(row[4] or "").strip(),
                "deskripsi_barang": str(row[5] or "").strip(),
                "qty": round(_to_float(row[6]), 4),
                "harga": round(_to_float(row[7]), 2),
                "nilai_dpp": round(_to_float(amounts.get("dpp")), 2),
                "source_type": "item",
            })

        cur.execute(f"""
            SELECT
                UPPER(TRIM(COALESCE(
                    NULLIF(TRIM(det.ITEMRESERVED10), ''),
                    NULLIF(TRIM(det.ITEMRESERVED9), ''),
                    NULLIF(TRIM(rd.ITEMRESERVED9), '')
                ))),
                po.PONO,
                po.PODATE,
                pd.NAME,
                MAX(rq.REQNO),
                COALESCE(po.FREIGHT, 0),
                (
                    SELECT COUNT(DISTINCT UPPER(TRIM(COALESCE(
                        NULLIF(TRIM(det_ref.ITEMRESERVED10), ''),
                        NULLIF(TRIM(det_ref.ITEMRESERVED9), ''),
                        NULLIF(TRIM(rd_ref.ITEMRESERVED9), '')
                    ))))
                    FROM PODET det_ref
                    LEFT JOIN REQUISITIONDET rd_ref
                      ON rd_ref.REQID = det_ref.REQID
                     AND rd_ref.SEQ = det_ref.REQSEQ
                    WHERE det_ref.POID = po.POID
                      AND TRIM(COALESCE(
                            NULLIF(TRIM(det_ref.ITEMRESERVED10), ''),
                            NULLIF(TRIM(det_ref.ITEMRESERVED9), ''),
                            NULLIF(TRIM(rd_ref.ITEMRESERVED9), '')
                          )) <> ''
                )
            FROM PO po
            LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
            LEFT JOIN PODET det ON det.POID = po.POID
            LEFT JOIN REQUISITION rq ON rq.REQID = det.REQID
            LEFT JOIN REQUISITIONDET rd ON rd.REQID = det.REQID AND rd.SEQ = det.REQSEQ
            WHERE UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH 'AI-SRV'
              AND COALESCE(po.FREIGHT, 0) <> 0
              AND UPPER(TRIM(COALESCE(
                    NULLIF(TRIM(det.ITEMRESERVED10), ''),
                    NULLIF(TRIM(det.ITEMRESERVED9), ''),
                    NULLIF(TRIM(rd.ITEMRESERVED9), '')
                  ))) IN ({placeholders})
            GROUP BY
                UPPER(TRIM(COALESCE(
                    NULLIF(TRIM(det.ITEMRESERVED10), ''),
                    NULLIF(TRIM(det.ITEMRESERVED9), ''),
                    NULLIF(TRIM(rd.ITEMRESERVED9), '')
                ))),
                po.PONO,
                po.POID,
                po.PODATE,
                pd.NAME,
                po.FREIGHT
        """, chunk)
        seen_add_cost = set()
        for row in cur.fetchall():
            no_so = str(row[0] or "").strip().upper()
            no_delivery = str(row[1] or "").strip()
            reference_count = max(int(row[6] or 0), 1)
            add_cost = round(abs(_to_float(row[5])) / reference_count, 2)
            detail_key = (no_so, no_delivery, add_cost)
            if not no_so or not add_cost or detail_key in seen_add_cost:
                continue
            seen_add_cost.add(detail_key)
            entry = result.setdefault(no_so, {"amount": 0.0, "po_numbers": [], "details": []})
            entry["amount"] += add_cost
            if no_delivery and no_delivery not in entry["po_numbers"]:
                entry["po_numbers"].append(no_delivery)
            entry["details"].append({
                "no_transaksi": no_delivery,
                "tanggal": str(row[2]) if row[2] else "",
                "nama_vendor": str(row[3] or "").strip(),
                "no_barang": "ADD. COST",
                "deskripsi_barang": "Add Cost Pembelian",
                "qty": 0,
                "harga": 0,
                "nilai_dpp": add_cost,
                "no_pr": str(row[4] or "").strip(),
                "source_type": "add_cost",
            })

    for entry in result.values():
        entry["amount"] = round(entry["amount"], 2)
    return result


def _profit_loss_delivery_detail_amount(detail):
    return round(_to_float((detail or {}).get("nilai_dpp")), 2)


def _profit_loss_delivery_detail_key(detail):
    detail = detail or {}
    return (
        str(detail.get("no_transaksi") or "").strip(),
        str(detail.get("no_barang") or "").strip().upper(),
        round(_to_float(detail.get("qty")), 4),
        _profit_loss_delivery_detail_amount(detail),
    )


def _profit_loss_apply_delivery(rows, delivery_map):
    rows_by_so = {}
    for row in rows:
        row["delivery"] = 0.0
        row["no_delivery"] = ""
        row["delivery_details"] = []
        no_so = str(row.get("no_so") or "").strip().upper()
        if no_so:
            rows_by_so.setdefault(no_so, []).append(row)

    for no_so, grouped_rows in rows_by_so.items():
        delivery = delivery_map.get(no_so)
        if not delivery:
            continue

        details = list(delivery.get("details") or [])
        target_amount = round(float(delivery.get("amount") or 0), 2)
        total_weight = sum(max(float(row.get("jumlah") or 0), 0) for row in grouped_rows)
        allocated_amount = 0.0
        for index, row in enumerate(grouped_rows):
            if index == len(grouped_rows) - 1:
                row_delivery = round(target_amount - allocated_amount, 2)
            elif total_weight > 0:
                row_delivery = round(
                    target_amount * max(float(row.get("jumlah") or 0), 0) / total_weight,
                    2,
                )
            else:
                row_delivery = round(target_amount / len(grouped_rows), 2)
            row["delivery"] = row_delivery
            row["no_delivery"] = ", ".join(delivery.get("po_numbers") or [])
            row["delivery_details"] = delivery.get("details", [])
            allocated_amount += row_delivery
    return rows


def _profit_loss_extract_do_numbers(description):
    text = str(description or "").strip().upper()
    result = []
    for match in re.finditer(r"\bAI-DO-(\d+(?:\s*,\s*\d+)*)", text):
        for number in re.split(r"\s*,\s*", match.group(1)):
            no_do = f"AI-DO-{number}"
            if no_do not in result:
                result.append(no_do)
    return result


def _profit_loss_delivery_ju_map(cur):
    required_jvdet = ("JVID", "GLACCOUNT", "GLAMOUNT", "DESCRIPTION")
    required_jv = ("JVID", "JVNUMBER")
    if (
        not _table_exists(cur, "JVDET")
        or not _table_exists(cur, "JV")
        or not _table_has_columns(cur, "JVDET", required_jvdet)
        or not _table_has_columns(cur, "JV", required_jv)
    ):
        return {}

    cur.execute("""
        SELECT
            d.GLAMOUNT,
            d.DESCRIPTION,
            j.JVNUMBER
        FROM JVDET d
        JOIN JV j ON j.JVID = d.JVID
        WHERE CAST(d.GLACCOUNT AS VARCHAR(30)) = '6.00.00.006'
          AND UPPER(CAST(d.DESCRIPTION AS VARCHAR(255))) CONTAINING 'AI-DO-'
    """)

    result = {}
    for amount, description, journal_no in cur.fetchall():
        no_dos = _profit_loss_extract_do_numbers(description)
        if not no_dos:
            continue
        amount_per_do = abs(float(amount or 0)) / len(no_dos)
        for no_do in no_dos:
            entry = result.setdefault(no_do, {"amount": 0.0, "journal_numbers": [], "details": []})
            entry["amount"] += amount_per_do
            normalized_journal_no = str(journal_no or "").strip()
            if normalized_journal_no and normalized_journal_no not in entry["journal_numbers"]:
                entry["journal_numbers"].append(normalized_journal_no)
            entry["details"].append({
                "no_transaksi": normalized_journal_no,
                "no_do": no_do,
                "deskripsi": str(description or "").strip(),
                "nilai_jurnal": round(abs(float(amount or 0)), 2),
                "nilai_alokasi": round(amount_per_do, 2),
            })

    for entry in result.values():
        entry["amount"] = round(entry["amount"], 2)
    return result


def _profit_loss_apply_delivery_ju(rows, delivery_ju_map):
    rows_by_do = {}
    for row in rows:
        row["delivery_ju"] = 0.0
        row["no_jurnal_delivery_ju"] = ""
        row["delivery_ju_details"] = []
        no_do = str(row.get("no_do") or "").strip().upper()
        if no_do:
            rows_by_do.setdefault(no_do, []).append(row)

    for no_do, grouped_rows in rows_by_do.items():
        delivery_ju = delivery_ju_map.get(no_do)
        if not delivery_ju:
            continue

        target_amount = round(float(delivery_ju.get("amount") or 0), 2)
        total_weight = sum(max(float(row.get("jumlah") or 0), 0) for row in grouped_rows)
        allocated_amount = 0.0
        for index, row in enumerate(grouped_rows):
            if index == len(grouped_rows) - 1:
                row_delivery_ju = round(target_amount - allocated_amount, 2)
            elif total_weight > 0:
                row_delivery_ju = round(
                    target_amount * max(float(row.get("jumlah") or 0), 0) / total_weight,
                    2,
                )
            else:
                row_delivery_ju = round(target_amount / len(grouped_rows), 2)
            row["delivery_ju"] = row_delivery_ju
            row["no_jurnal_delivery_ju"] = ", ".join(delivery_ju.get("journal_numbers") or [])
            row["delivery_ju_details"] = delivery_ju.get("details", [])
            allocated_amount += row_delivery_ju
    return rows


def _profit_loss_mf_map(cur, no_sos):
    """Ambil MF aktual per SO dari amount AI-MF setelah diskon header, sebelum PPh."""
    normalized_no_sos = sorted({
        str(no_so or "").strip().upper()
        for no_so in no_sos
        if str(no_so or "").strip()
    })
    result = {}
    if not normalized_no_sos:
        return result

    line_discpc = sql_number_expr("det.ITEMDISCPC")
    total_line_discpc = sql_number_expr("det_total.ITEMDISCPC")
    line_amount = f"""
        COALESCE(det.QUANTITY, 0)
        * COALESCE(det.UNITPRICE, 0)
        * (1 - COALESCE({line_discpc}, 0) / 100)
    """
    total_amount = f"""
        COALESCE(det_total.QUANTITY, 0)
        * COALESCE(det_total.UNITPRICE, 0)
        * (1 - COALESCE({total_line_discpc}, 0) / 100)
    """

    for start in range(0, len(normalized_no_sos), 500):
        chunk = normalized_no_sos[start:start + 500]
        mf_references = [f"MF-{no_so}" for no_so in chunk]
        placeholders = ",".join(["?"] * len(mf_references))
        cur.execute(f"""
            SELECT
                SUBSTRING(UPPER(TRIM(det.ITEMNO)) FROM 4),
                ai.APINVOICEID,
                {line_amount},
                COALESCE(ai.CASHDISCOUNT, 0),
                ai.INVOICENO,
                ai.INVOICEDATE,
                det.ITEMNO
            FROM APINV ai
            JOIN APITMDET det ON det.APINVOICEID = ai.APINVOICEID
            WHERE UPPER(TRIM(COALESCE(ai.INVOICENO, ''))) STARTING WITH 'AI-MF-'
              AND COALESCE(ai.INVOICETYPE, 1) = 1
              AND (ai.ISDP IS NULL OR ai.ISDP = 0)
              AND UPPER(TRIM(COALESCE(det.ITEMNO, ''))) IN ({placeholders})
        """, mf_references)
        matched_lines = cur.fetchall()
        invoice_ids = sorted({int(row[1]) for row in matched_lines})
        if not invoice_ids:
            continue

        invoice_placeholders = ",".join(["?"] * len(invoice_ids))
        cur.execute(f"""
            SELECT det_total.APINVOICEID, SUM({total_amount})
            FROM APITMDET det_total
            WHERE det_total.APINVOICEID IN ({invoice_placeholders})
            GROUP BY det_total.APINVOICEID
        """, invoice_ids)
        invoice_totals = {
            int(invoice_id): max(float(amount or 0), 0)
            for invoice_id, amount in cur.fetchall()
        }

        for no_so, invoice_id, source_amount, cash_discount, invoice_no, invoice_date, item_no in matched_lines:
            source_amount = max(float(source_amount or 0), 0)
            invoice_total = invoice_totals.get(int(invoice_id or 0), 0)
            cash_discount = max(float(cash_discount or 0), 0)
            if invoice_total <= 0:
                continue
            mf_ratio = max(min((invoice_total - cash_discount) / invoice_total, 1), 0)
            normalized_no_so = str(no_so or "").strip().upper()
            fee_amount = source_amount * mf_ratio
            entry = result.setdefault(normalized_no_so, {"amount": 0.0, "rates": [], "details": []})
            entry["amount"] += fee_amount
            rate_pct = mf_ratio * 100
            if not any(abs(existing - rate_pct) < 0.000001 for existing in entry["rates"]):
                entry["rates"].append(rate_pct)
            entry["details"].append({
                "no_transaksi": str(invoice_no or "").strip(),
                "tanggal": str(invoice_date) if invoice_date else "",
                "part_number": str(item_no or "").strip(),
                "amount_asal": round(source_amount, 2),
                "persentase": _profit_loss_fee_percentage_label([rate_pct]),
                "nilai_fee": round(fee_amount, 2),
            })

    return {
        no_so: {
            "amount": round(entry["amount"], 2),
            "percentage": _profit_loss_fee_percentage_label(entry["rates"]),
            "details": entry["details"],
        }
        for no_so, entry in result.items()
    }


def _profit_loss_apply_mf(rows, mf_map):
    """Alokasikan MF satu kali per SO agar SO dengan banyak item tidak terduplikasi."""
    rows_by_so = {}
    for row in rows:
        row["mf"] = 0.0
        row["mf_pct"] = ""
        row["mf_details"] = []
        no_so = str(row.get("no_so") or "").strip().upper()
        if no_so:
            rows_by_so.setdefault(no_so, []).append(row)

    for no_so, grouped_rows in rows_by_so.items():
        fee = mf_map.get(no_so) or {}
        target_amount = round(float(fee.get("amount") or 0), 2)
        if not target_amount:
            continue
        total_weight = sum(max(float(row.get("jumlah") or 0), 0) for row in grouped_rows)
        allocated_amount = 0.0
        for index, row in enumerate(grouped_rows):
            if index == len(grouped_rows) - 1:
                row_mf = round(target_amount - allocated_amount, 2)
            elif total_weight > 0:
                row_mf = round(
                    target_amount * max(float(row.get("jumlah") or 0), 0) / total_weight,
                    2,
                )
            else:
                row_mf = round(target_amount / len(grouped_rows), 2)
            row["mf"] = row_mf
            row["mf_pct"] = fee.get("percentage", "")
            row["mf_details"] = fee.get("details", [])
            allocated_amount += row_mf
    return rows


def _profit_loss_fee_percentage_label(rates):
    labels = []
    for rate in sorted(float(value or 0) for value in rates):
        number = f"{rate:.4f}".rstrip("0").rstrip(".")
        labels.append(f"{number}%")
    return " + ".join(labels)


def _profit_loss_cf_map(cur, no_sos):
    """Ambil CF aktual per SO dari amount AI-CF setelah diskon header, sebelum PPh."""
    normalized_no_sos = sorted({
        str(no_so or "").strip().upper()
        for no_so in no_sos
        if str(no_so or "").strip()
    })
    result = {}
    if not normalized_no_sos:
        return result

    line_discpc = sql_number_expr("det.ITEMDISCPC")
    total_line_discpc = sql_number_expr("det_total.ITEMDISCPC")
    line_amount = f"""
        COALESCE(det.QUANTITY, 0)
        * COALESCE(det.UNITPRICE, 0)
        * (1 - COALESCE({line_discpc}, 0) / 100)
    """
    total_amount = f"""
        COALESCE(det_total.QUANTITY, 0)
        * COALESCE(det_total.UNITPRICE, 0)
        * (1 - COALESCE({total_line_discpc}, 0) / 100)
    """

    for start in range(0, len(normalized_no_sos), 500):
        chunk = normalized_no_sos[start:start + 500]
        cf_references = [f"CF-{no_so}" for no_so in chunk]
        placeholders = ",".join(["?"] * len(cf_references))
        cur.execute(f"""
            SELECT
                SUBSTRING(UPPER(TRIM(det.ITEMNO)) FROM 4),
                ai.APINVOICEID,
                {line_amount},
                COALESCE(ai.CASHDISCOUNT, 0),
                ai.INVOICENO,
                ai.INVOICEDATE,
                det.ITEMNO
            FROM APINV ai
            JOIN APITMDET det ON det.APINVOICEID = ai.APINVOICEID
            WHERE UPPER(TRIM(COALESCE(ai.INVOICENO, ''))) STARTING WITH 'AI-CF-'
              AND COALESCE(ai.INVOICETYPE, 1) = 1
              AND (ai.ISDP IS NULL OR ai.ISDP = 0)
              AND UPPER(TRIM(COALESCE(det.ITEMNO, ''))) IN ({placeholders})
        """, cf_references)
        matched_lines = cur.fetchall()
        invoice_ids = sorted({int(row[1]) for row in matched_lines})
        if not invoice_ids:
            continue

        invoice_placeholders = ",".join(["?"] * len(invoice_ids))
        cur.execute(f"""
            SELECT det_total.APINVOICEID, SUM({total_amount})
            FROM APITMDET det_total
            WHERE det_total.APINVOICEID IN ({invoice_placeholders})
            GROUP BY det_total.APINVOICEID
        """, invoice_ids)
        invoice_totals = {
            int(invoice_id): max(float(amount or 0), 0)
            for invoice_id, amount in cur.fetchall()
        }

        for no_so, invoice_id, source_amount, cash_discount, invoice_no, invoice_date, item_no in matched_lines:
            source_amount = max(float(source_amount or 0), 0)
            invoice_total = invoice_totals.get(int(invoice_id or 0), 0)
            cash_discount = max(float(cash_discount or 0), 0)
            if invoice_total <= 0:
                continue
            cf_ratio = max(min((invoice_total - cash_discount) / invoice_total, 1), 0)
            normalized_no_so = str(no_so or "").strip().upper()
            fee_amount = source_amount * cf_ratio
            entry = result.setdefault(normalized_no_so, {"amount": 0.0, "rates": [], "details": []})
            entry["amount"] += fee_amount
            rate_pct = cf_ratio * 100
            if not any(abs(existing - rate_pct) < 0.000001 for existing in entry["rates"]):
                entry["rates"].append(rate_pct)
            entry["details"].append({
                "no_transaksi": str(invoice_no or "").strip(),
                "tanggal": str(invoice_date) if invoice_date else "",
                "part_number": str(item_no or "").strip(),
                "amount_asal": round(source_amount, 2),
                "persentase": _profit_loss_fee_percentage_label([rate_pct]),
                "nilai_fee": round(fee_amount, 2),
            })

    return {
        no_so: {
            "amount": round(entry["amount"], 2),
            "percentage": _profit_loss_fee_percentage_label(entry["rates"]),
            "details": entry["details"],
        }
        for no_so, entry in result.items()
    }


def _profit_loss_apply_cf(rows, cf_map):
    """Alokasikan CF satu kali per SO agar SO dengan banyak item tidak terduplikasi."""
    rows_by_so = {}
    for row in rows:
        row["cf"] = 0.0
        row["cf_pct"] = ""
        row["cf_details"] = []
        no_so = str(row.get("no_so") or "").strip().upper()
        if no_so:
            rows_by_so.setdefault(no_so, []).append(row)

    for no_so, grouped_rows in rows_by_so.items():
        fee = cf_map.get(no_so) or {}
        target_amount = round(float(fee.get("amount") or 0), 2)
        if not target_amount:
            continue
        total_weight = sum(max(float(row.get("jumlah") or 0), 0) for row in grouped_rows)
        allocated_amount = 0.0
        for index, row in enumerate(grouped_rows):
            if index == len(grouped_rows) - 1:
                row_cf = round(target_amount - allocated_amount, 2)
            elif total_weight > 0:
                row_cf = round(
                    target_amount * max(float(row.get("jumlah") or 0), 0) / total_weight,
                    2,
                )
            else:
                row_cf = round(target_amount / len(grouped_rows), 2)
            row["cf"] = row_cf
            row["cf_pct"] = fee.get("percentage", "")
            row["cf_details"] = fee.get("details", [])
            allocated_amount += row_cf
    return rows


PROJECT_REFERENCE_PATTERN = re.compile(r"\bAI-PP-\d+\b", re.IGNORECASE)


def _profit_loss_project_references(*values):
    references = []
    seen = set()
    for value in values:
        for match in PROJECT_REFERENCE_PATTERN.findall(str(value or "")):
            reference = match.upper()
            if reference not in seen:
                seen.add(reference)
                references.append(reference)
    return references


def _profit_loss_project_cost_map(cur, rows):
    row_refs = {}
    needed_refs = set()
    for index, row in enumerate(rows):
        refs = _profit_loss_project_references(
            row.get("no_po"),
            row.get("no_so"),
            row.get("no_do"),
            row.get("no_barang"),
            row.get("deskripsi_barang"),
        )
        if refs:
            row_refs[index] = refs
            needed_refs.update(refs)
    if not needed_refs:
        return {}

    where_sql, params = _project_where("", "active", "mkt", "", "")
    cur.execute(f"""
        SELECT
            p.PROJECTID,
            p.PROJECTNO,
            p.PROJECTNAME,
            p.CONTACTNAME,
            p.START_DATE,
            p.FINSHED_DATE,
            p.PERCENTCOMPLETED,
            p.SUSPENDED,
            p.DESCRIPTION
        FROM PROJECT p
        WHERE {where_sql}
    """, params)
    project_rows = cur.fetchall()
    if not project_rows:
        return {}

    project_rows = _with_project_base_metrics(project_rows, _project_base_metric_map(cur, project_rows))
    project_metrics = _build_project_metric_map(cur, project_rows)
    projects = _build_project_rows(project_rows, project_metrics)

    amount_by_ref = {}
    details_by_ref = {}
    for project in projects:
        refs = [
            ref for ref in _profit_loss_project_references(
                project.get("no_project"),
                project.get("nama_project"),
                project.get("deskripsi"),
                project.get("remarks"),
            )
            if ref in needed_refs
        ]
        if not refs:
            continue
        amount = float(project.get("realisasi") or 0)
        if not amount:
            continue
        share = amount / len(refs)
        for ref in refs:
            amount_by_ref[ref] = amount_by_ref.get(ref, 0.0) + share
            details_by_ref.setdefault(ref, []).append({
                "referensi": ref,
                "no_project": project.get("no_project", ""),
                "nama_project": project.get("nama_project", ""),
                "nama_kontak": project.get("nama_kontak", ""),
                "realisasi_project": round(amount, 2),
                "jumlah_referensi_project": len(refs),
                "nilai_referensi": round(share, 2),
            })

    if not amount_by_ref:
        return {}

    row_indices_by_ref = {}
    for index, refs in row_refs.items():
        for ref in refs:
            if ref in amount_by_ref:
                row_indices_by_ref.setdefault(ref, []).append(index)

    project_costs = {index: {"amount": 0.0, "details": []} for index in row_refs}
    for ref, indices in row_indices_by_ref.items():
        amount = amount_by_ref.get(ref, 0.0)
        if not amount or not indices:
            continue
        weights = {
            index: abs(float(rows[index].get("jumlah") or 0))
            for index in indices
        }
        total_weight = sum(weights.values())
        if total_weight <= 0:
            share = amount / len(indices)
            for index in indices:
                entry = project_costs.setdefault(index, {"amount": 0.0, "details": []})
                entry["amount"] += share
                for detail in details_by_ref.get(ref, []):
                    entry["details"].append({
                        **detail,
                        "basis_alokasi": "Rata-rata baris",
                        "jumlah_baris": round(float(rows[index].get("jumlah") or 0), 2),
                        "total_jumlah_referensi": round(total_weight, 2),
                        "nilai_alokasi": round(share, 2),
                    })
            continue
        for index, weight in weights.items():
            allocated = amount * weight / total_weight
            entry = project_costs.setdefault(index, {"amount": 0.0, "details": []})
            entry["amount"] += allocated
            for detail in details_by_ref.get(ref, []):
                entry["details"].append({
                    **detail,
                    "basis_alokasi": "Prorata jumlah penjualan",
                    "jumlah_baris": round(float(rows[index].get("jumlah") or 0), 2),
                    "total_jumlah_referensi": round(total_weight, 2),
                    "nilai_alokasi": round(allocated, 2),
                })

    return {
        index: {
            "amount": round(value.get("amount", 0.0), 2),
            "details": value.get("details", []),
        }
        for index, value in project_costs.items()
        if abs(value.get("amount", 0.0)) >= 0.005
    }


def _profit_loss_hpp_adjustment_rows(cur, date_from="", date_to=""):
    conditions = ["gh.GLACCOUNT STARTING WITH '5.'"]
    params = []
    if date_from:
        conditions.append("gh.TRANSDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("gh.TRANSDATE <= ?")
        params.append(date_to)

    invoice_where, invoice_params = _profit_loss_invoice_where(date_from, date_to)
    conditions.append(f"""
        NOT (
            gh.SOURCE = 'AR'
            AND gh.GLACCOUNT STARTING WITH '5.'
            AND COALESCE(gh.HPP, 0) = 1
            AND EXISTS (
                SELECT 1
                FROM ARINV ar_counted
                WHERE ar_counted.ARINVOICEID = gh.INVOICEID
                  AND {invoice_where.replace('ar.', 'ar_counted.')}
            )
        )
    """)
    params.extend(invoice_params)

    cur.execute(f"""
        SELECT
            gh.TRANSDATE,
            gh.SOURCE,
            gh.TRANSTYPE,
            gh.GLACCOUNT,
            COALESCE(ga.ACCOUNTNAME, gh.GLACCOUNT),
            COUNT(*),
            SUM(COALESCE(gh.BASEAMOUNT, 0))
        FROM GLHIST gh
        LEFT JOIN GLACCNT ga ON ga.GLACCOUNT = gh.GLACCOUNT
        WHERE {" AND ".join(conditions)}
        GROUP BY
            gh.TRANSDATE,
            gh.SOURCE,
            gh.TRANSTYPE,
            gh.GLACCOUNT,
            ga.ACCOUNTNAME
        HAVING ABS(SUM(COALESCE(gh.BASEAMOUNT, 0))) >= 0.005
        ORDER BY gh.TRANSDATE DESC, gh.GLACCOUNT
    """, params)

    rows = []
    for index, row in enumerate(cur.fetchall()):
        trans_date = str(row[0]) if row[0] else ""
        source = str(row[1] or "").strip()
        trans_type = str(row[2] or "").strip()
        account = str(row[3] or "").strip()
        account_name = str(row[4] or "").strip()
        transaction_count = int(row[5] or 0)
        nilai_hpp = float(row[6] or 0)
        description = f"{transaction_count} transaksi {source or 'GL'} {trans_type}".strip()
        label_parts = [part for part in [account_name, description] if part]
        description_label = " - ".join(label_parts) if label_parts else "Penyesuaian HPP"

        rows.append({
            "no_faktur": f"ADJ-HPP-{trans_date}-{account}-{source}-{index + 1}",
            "no_do": "",
            "no_so": "",
            "tgl_faktur": trans_date,
            "no_barang": account,
            "deskripsi_barang": description_label,
            "qty_faktur": 0.0,
            "uom": "",
            "harga_satuan": 0.0,
            "jumlah": 0.0,
            "nilai_hpp": round(nilai_hpp, 2),
            "delivery": 0.0,
            "delivery_ju": 0.0,
            "cf": 0.0,
            "mf": 0.0,
            "biaya_project": 0.0,
            "biaya_project_details": [],
            "total_biaya": 0.0,
            "laba_operasi": round(-nilai_hpp, 2),
            "manual_cost_key": f"ADJ-HPP:{trans_date}:{account}:{source}:{trans_type}:{index + 1}",
            "gross_profit": round(-nilai_hpp, 2),
            "margin_pct": 0.0,
            "no_pelanggan": "",
            "nama_pelanggan": "Penyesuaian HPP GL",
            "no_po": "",
            "marketing": "Penyesuaian HPP",
            "no_delivery": "",
            "sumber": "Penyesuaian HPP GL",
        })
    return rows


def _build_profit_loss_rows(cur, date_from="", date_to="", search="", marketing=""):
    where_sql, params = _profit_loss_invoice_where(date_from, date_to)
    cur.execute(f"""
        SELECT
            ar.ARINVOICEID,
            ar.CUSTOMERID,
            ar.INVOICENO,
            ar.INVOICEDATE,
            ar.PURCHASEORDERNO,
            ar.GETFROMDO,
            ar.INVOICEAMOUNT,
            COALESCE(ar.CASHDISCOUNT, 0),
            COALESCE(ar.TAX1RATE, 0),
            COALESCE(ar.INCLUSIVETAX, 0),
            ar.DESCRIPTION,
            pd.PERSONNO,
            pd.NAME
        FROM ARINV ar
        LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
        WHERE {where_sql}
        ORDER BY ar.CUSTOMERID, ar.PURCHASEORDERNO, ar.INVOICEDATE, ar.ARINVOICEID
    """, params)
    invoices = []
    for row in cur.fetchall():
        invoices.append({
            "invoice_id": int(row[0] or 0),
            "customer_id": int(row[1] or 0),
            "no_faktur": str(row[2] or "").strip(),
            "tgl_faktur": str(row[3]) if row[3] else "",
            "no_po": str(row[4] or "").strip(),
            "get_from_do": int(row[5] or 0),
            "invoice_amount": float(row[6] or 0),
            "cash_discount": float(row[7] or 0),
            "tax_rate": float(row[8] or 0),
            "inclusive_tax": int(row[9] or 0),
            "description": str(row[10] or "").strip(),
            "no_pelanggan": str(row[11] or "").strip(),
            "nama_pelanggan": str(row[12] or "").strip(),
            "revenue": 0.0,
            "hpp": 0.0,
        })
    if not invoices:
        return []

    invoice_ids = [row["invoice_id"] for row in invoices]
    invoice_by_id = {row["invoice_id"]: row for row in invoices}
    for start in range(0, len(invoice_ids), 500):
        chunk = invoice_ids[start:start + 500]
        placeholders = ",".join(["?"] * len(chunk))
        cur.execute(f"""
            SELECT
                gh.INVOICEID,
                SUM(CASE
                    WHEN gh.SOURCE = 'AR' AND gh.GLACCOUNT STARTING WITH '4.'
                    THEN ABS(gh.BASEAMOUNT)
                    ELSE 0
                END),
                SUM(CASE
                    WHEN gh.SOURCE = 'AR'
                     AND gh.GLACCOUNT STARTING WITH '5.'
                     AND COALESCE(gh.HPP, 0) = 1
                    THEN ABS(gh.BASEAMOUNT)
                    ELSE 0
                END)
            FROM GLHIST gh
            WHERE gh.INVOICEID IN ({placeholders})
            GROUP BY gh.INVOICEID
        """, chunk)
        for invoice_id, revenue, hpp in cur.fetchall():
            invoice = invoice_by_id.get(int(invoice_id or 0))
            if invoice:
                invoice["revenue"] = float(revenue or 0)
                invoice["hpp"] = float(hpp or 0)

    direct_by_invoice = {}
    for start in range(0, len(invoice_ids), 500):
        chunk = invoice_ids[start:start + 500]
        placeholders = ",".join(["?"] * len(chunk))
        cur.execute(f"""
            SELECT
                det.ARINVOICEID,
                det.SEQ,
                so.SONO,
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                COALESCE(CAST(NULLIF(TRIM(CAST(det.ITEMDISCPC AS VARCHAR(32))), '') AS DOUBLE PRECISION), 0),
                COALESCE(ih.COST, ih.NEWCOST, 0),
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing')
            FROM ARINVDET det
            LEFT JOIN SO so ON so.SOID = det.SOID
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            LEFT JOIN ITEMHIST ih ON ih.ITEMHISTID = det.ITEMHISTID
            WHERE det.ARINVOICEID IN ({placeholders})
              AND det.ITEMNO IS NOT NULL
            ORDER BY det.ARINVOICEID, det.SEQ
        """, chunk)
        for row in cur.fetchall():
            qty = float(row[5] or 0)
            unit_price = float(row[7] or 0)
            discount = float(row[8] or 0)
            direct_by_invoice.setdefault(int(row[0] or 0), []).append({
                "_source_key": f"AR-{int(row[0] or 0)}-{int(row[1] or 0)}",
                "no_so": str(row[2] or "").strip(),
                "no_barang": str(row[3] or "").strip(),
                "deskripsi_barang": str(row[4] or "").strip(),
                "qty_faktur": qty,
                "uom": str(row[6] or "").strip(),
                "harga_satuan": unit_price,
                "jumlah": qty * unit_price * (1 - discount / 100),
                "_source_hpp": abs(float(row[9] or 0)),
                "marketing": str(row[10] or "").strip(),
                "sumber": "Faktur Penjualan",
            })

    explicit_do_refs_by_invoice = {}
    all_explicit_do_refs = set()
    for invoice in invoices:
        refs = []
        for match in re.findall(r"\bAI-DO-\d+\b", invoice.get("description", ""), re.IGNORECASE):
            ref = match.upper()
            if ref not in refs:
                refs.append(ref)
                all_explicit_do_refs.add(ref)
        if refs:
            explicit_do_refs_by_invoice[invoice["invoice_id"]] = refs

    explicit_delivery_by_no = {}
    all_explicit_do_refs = sorted(all_explicit_do_refs)
    for start in range(0, len(all_explicit_do_refs), 500):
        chunk = all_explicit_do_refs[start:start + 500]
        placeholders = ",".join(["?"] * len(chunk))
        cur.execute(f"""
            SELECT
                delivery.ARINVOICEID,
                delivery.INVOICENO,
                delivery.INVOICEDATE,
                det.SEQ,
                so.SONO,
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                COALESCE(CAST(NULLIF(TRIM(CAST(det.ITEMDISCPC AS VARCHAR(32))), '') AS DOUBLE PRECISION), 0),
                COALESCE(ih.COST, ih.NEWCOST, 0),
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing'),
                delivery.INVOICEAMOUNT,
                COALESCE(delivery.CASHDISCOUNT, 0)
            FROM ARINV delivery
            JOIN ARINVDET det ON det.ARINVOICEID = delivery.ARINVOICEID
            LEFT JOIN SO so ON so.SOID = det.SOID
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            LEFT JOIN ITEMHIST ih ON ih.ITEMHISTID = det.ITEMHISTID
            WHERE UPPER(TRIM(delivery.INVOICENO)) IN ({placeholders})
              AND delivery.DELIVERYORDER = '1'
              AND delivery.INVOICETYPE = 1
              AND det.ITEMNO IS NOT NULL
            ORDER BY delivery.INVOICEDATE, delivery.ARINVOICEID, det.SEQ
        """, chunk)
        for row in cur.fetchall():
            qty = float(row[7] or 0)
            unit_price = float(row[9] or 0)
            discount = float(row[10] or 0)
            no_do = str(row[1] or "").strip()
            explicit_delivery_by_no.setdefault(no_do.upper(), []).append({
                "_source_key": f"DO-{int(row[0] or 0)}-{int(row[3] or 0)}",
                "do_id": int(row[0] or 0),
                "no_do": no_do,
                "do_date": str(row[2]) if row[2] else "",
                "do_invoice_amount": float(row[13] or 0),
                "do_cash_discount": float(row[14] or 0),
                "seq": int(row[3] or 0),
                "no_so": str(row[4] or "").strip(),
                "no_barang": str(row[5] or "").strip(),
                "deskripsi_barang": str(row[6] or "").strip(),
                "qty_faktur": qty,
                "uom": str(row[8] or "").strip(),
                "harga_satuan": unit_price,
                "jumlah": qty * unit_price * (1 - discount / 100),
                "_source_hpp": abs(float(row[11] or 0)),
                "marketing": str(row[12] or "").strip(),
                "sumber": "Faktur dari Pengiriman Barang",
            })

    group_keys = {(row["customer_id"], row["no_po"]) for row in invoices if row["get_from_do"]}
    delivery_by_group = {}
    if group_keys:
        max_date_by_group = {}
        for invoice in invoices:
            key = (invoice["customer_id"], invoice["no_po"])
            if invoice["get_from_do"]:
                max_date_by_group[key] = max(max_date_by_group.get(key, ""), invoice["tgl_faktur"])
        for key in sorted(group_keys):
            customer_id, purchase_order_no = key
            cur.execute("""
                SELECT
                delivery.CUSTOMERID,
                delivery.PURCHASEORDERNO,
                delivery.ARINVOICEID,
                delivery.INVOICENO,
                delivery.INVOICEDATE,
                det.SEQ,
                so.SONO,
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                COALESCE(CAST(NULLIF(TRIM(CAST(det.ITEMDISCPC AS VARCHAR(32))), '') AS DOUBLE PRECISION), 0),
                COALESCE(ih.COST, ih.NEWCOST, 0),
                COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing'),
                delivery.INVOICEAMOUNT,
                COALESCE(delivery.CASHDISCOUNT, 0)
            FROM ARINV delivery
            JOIN ARINVDET det ON det.ARINVOICEID = delivery.ARINVOICEID
            LEFT JOIN SO so ON so.SOID = det.SOID
            LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            LEFT JOIN ITEMHIST ih ON ih.ITEMHISTID = det.ITEMHISTID
            WHERE delivery.CUSTOMERID = ?
              AND COALESCE(TRIM(delivery.PURCHASEORDERNO), '') = ?
              AND delivery.INVOICEDATE <= ?
              AND delivery.DELIVERYORDER = '1'
              AND delivery.INVOICETYPE = 1
              AND det.ITEMNO IS NOT NULL
            ORDER BY
                delivery.INVOICEDATE,
                delivery.ARINVOICEID,
                det.SEQ
            """, [customer_id, purchase_order_no, max_date_by_group[key]])
            for row in cur.fetchall():
                qty = float(row[9] or 0)
                unit_price = float(row[11] or 0)
                discount = float(row[12] or 0)
                delivery_by_group.setdefault(key, []).append({
                    "_source_key": f"DO-{int(row[2] or 0)}-{int(row[5] or 0)}",
                    "do_id": int(row[2] or 0),
                    "no_do": str(row[3] or "").strip(),
                    "do_date": str(row[4]) if row[4] else "",
                    "do_invoice_amount": float(row[15] or 0),
                    "do_cash_discount": float(row[16] or 0),
                    "seq": int(row[5] or 0),
                    "no_so": str(row[6] or "").strip(),
                    "no_barang": str(row[7] or "").strip(),
                    "deskripsi_barang": str(row[8] or "").strip(),
                    "qty_faktur": qty,
                    "uom": str(row[10] or "").strip(),
                    "harga_satuan": unit_price,
                    "jumlah": qty * unit_price * (1 - discount / 100),
                    "_source_hpp": abs(float(row[13] or 0)),
                    "marketing": str(row[14] or "").strip(),
                    "sumber": "Faktur dari Pengiriman Barang",
                })

    invoices_by_group = {}
    for invoice in invoices:
        invoices_by_group.setdefault((invoice["customer_id"], invoice["no_po"]), []).append(invoice)

    detail_for_invoice = {}
    exact_amount_delivery_cache = {}
    for key, grouped_invoices in invoices_by_group.items():
        pool = [dict(row, remaining_amount=max(float(row["jumlah"]), 0), remaining_qty=float(row["qty_faktur"])) for row in delivery_by_group.get(key, [])]
        for invoice in grouped_invoices:
            if direct_by_invoice.get(invoice["invoice_id"]):
                detail_for_invoice[invoice["invoice_id"]] = direct_by_invoice[invoice["invoice_id"]]
                continue
            explicit_refs = explicit_do_refs_by_invoice.get(invoice["invoice_id"], [])
            if explicit_refs:
                explicit_lines = []
                for ref in explicit_refs:
                    explicit_lines.extend(explicit_delivery_by_no.get(ref, []))
                if explicit_lines:
                    detail_for_invoice[invoice["invoice_id"]] = explicit_lines
                    used_source_keys = {row.get("_source_key") for row in explicit_lines}
                    for source in pool:
                        if source.get("_source_key") in used_source_keys:
                            source["remaining_amount"] = 0.0
                            source["remaining_qty"] = 0.0
                            source["_source_hpp"] = 0.0
                    continue
            exact_cache_key = (
                invoice["customer_id"],
                str(invoice.get("no_po") or "").strip().upper(),
                round(float(invoice.get("invoice_amount") or 0), 2),
                invoice["tgl_faktur"],
                bool(pool),
            )
            if exact_cache_key not in exact_amount_delivery_cache:
                invoice_amount = float(invoice.get("invoice_amount") or 0)
                cur.execute("""
                    SELECT
                        delivery.ARINVOICEID,
                        delivery.INVOICENO,
                        delivery.INVOICEDATE,
                        det.SEQ,
                        so.SONO,
                        det.ITEMNO,
                        COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                        det.QUANTITY,
                        det.ITEMUNIT,
                        det.UNITPRICE,
                        COALESCE(CAST(NULLIF(TRIM(CAST(det.ITEMDISCPC AS VARCHAR(32))), '') AS DOUBLE PRECISION), 0),
                        COALESCE(ih.COST, ih.NEWCOST, 0),
                        COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing'),
                        delivery.INVOICEAMOUNT,
                        COALESCE(delivery.CASHDISCOUNT, 0),
                        delivery.PURCHASEORDERNO,
                        delivery.DESCRIPTION
                    FROM ARINV delivery
                    JOIN ARINVDET det ON det.ARINVOICEID = delivery.ARINVOICEID
                    LEFT JOIN SO so ON so.SOID = det.SOID
                    LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
                    LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
                    LEFT JOIN ITEMHIST ih ON ih.ITEMHISTID = det.ITEMHISTID
                    WHERE delivery.CUSTOMERID = ?
                      AND delivery.INVOICEDATE <= DATEADD(14 DAY TO CAST(? AS DATE))
                      AND delivery.DELIVERYORDER = '1'
                      AND delivery.INVOICETYPE = 1
                      AND delivery.INVOICEAMOUNT BETWEEN ? AND ?
                      AND det.ITEMNO IS NOT NULL
                    ORDER BY delivery.INVOICEDATE DESC, delivery.ARINVOICEID ASC, det.SEQ
                """, [
                    invoice["customer_id"],
                    invoice["tgl_faktur"],
                    invoice_amount - 1,
                    invoice_amount + 1,
                ])
                exact_lines_by_do = {}
                exact_do_meta = {}
                exact_do_order = []
                for row in cur.fetchall():
                    qty = float(row[7] or 0)
                    unit_price = float(row[9] or 0)
                    discount = float(row[10] or 0)
                    do_id = int(row[0] or 0)
                    if do_id not in exact_lines_by_do:
                        invoice_po = str(invoice.get("no_po") or "").strip().upper()
                        delivery_po = str(row[15] or "").strip().upper()
                        invoice_po_suffix = invoice_po.rsplit("/", 1)[-1] if "/" in invoice_po else ""
                        delivery_po_suffix = delivery_po.rsplit("/", 1)[-1] if "/" in delivery_po else ""
                        exact_lines_by_do[do_id] = []
                        exact_do_order.append(do_id)
                        exact_do_meta[do_id] = {
                            "same_po": delivery_po == invoice_po,
                            "same_po_suffix": bool(invoice_po_suffix and delivery_po_suffix and invoice_po_suffix == delivery_po_suffix),
                            "acc_rcvd": "ACC RCVD" in str(row[16] or "").upper(),
                        }
                    exact_lines_by_do[do_id].append({
                        "_source_key": f"DO-{int(row[0] or 0)}-{int(row[3] or 0)}",
                        "do_id": do_id,
                        "no_do": str(row[1] or "").strip(),
                        "do_date": str(row[2]) if row[2] else "",
                        "do_invoice_amount": float(row[13] or 0),
                        "do_cash_discount": float(row[14] or 0),
                        "seq": int(row[3] or 0),
                        "no_so": str(row[4] or "").strip(),
                        "no_barang": str(row[5] or "").strip(),
                        "deskripsi_barang": str(row[6] or "").strip(),
                        "qty_faktur": qty,
                        "uom": str(row[8] or "").strip(),
                        "harga_satuan": unit_price,
                        "jumlah": qty * unit_price * (1 - discount / 100),
                        "_source_hpp": abs(float(row[11] or 0)),
                        "marketing": str(row[12] or "").strip(),
                        "sumber": "Faktur dari Pengiriman Barang",
                    })
                selected_do_id = None
                same_po_do_ids = [
                    do_id for do_id in exact_do_order
                    if exact_do_meta.get(do_id, {}).get("same_po")
                ]
                if same_po_do_ids:
                    selected_do_id = same_po_do_ids[0]
                else:
                    same_po_suffix_do_ids = [
                        do_id for do_id in exact_do_order
                        if exact_do_meta.get(do_id, {}).get("same_po_suffix")
                    ]
                    if same_po_suffix_do_ids:
                        selected_do_id = same_po_suffix_do_ids[0]
                if selected_do_id is None and not pool:
                    acc_do_ids = [
                        do_id for do_id in exact_do_order
                        if exact_do_meta.get(do_id, {}).get("acc_rcvd")
                    ]
                    selected_do_id = acc_do_ids[0] if acc_do_ids else (exact_do_order[0] if exact_do_order else None)
                exact_amount_delivery_cache[exact_cache_key] = exact_lines_by_do.get(selected_do_id, [])
            if exact_amount_delivery_cache[exact_cache_key]:
                detail_for_invoice[invoice["invoice_id"]] = exact_amount_delivery_cache[exact_cache_key]
                continue
            target = invoice["revenue"] or max(
                invoice["invoice_amount"] - (invoice["invoice_amount"] / 11 if invoice["invoice_amount"] else 0),
                0,
            )

            exact_delivery_candidates = {}
            for source in pool:
                if source["remaining_amount"] <= 0.01 or source["do_date"] > invoice["tgl_faktur"]:
                    continue
                do_amount = float(source.get("do_invoice_amount") or 0)
                amount_matches_invoice = abs(do_amount - float(invoice.get("invoice_amount") or 0)) <= 1
                amount_matches_target = abs(do_amount - target) <= 1
                if not (amount_matches_invoice or amount_matches_target):
                    continue
                entry = exact_delivery_candidates.setdefault(source["do_id"], {
                    "date": source["do_date"],
                    "lines": [],
                    "score": 0 if amount_matches_invoice else 1,
                })
                entry["lines"].append(source)

            if exact_delivery_candidates:
                selected_do_id, selected_delivery = sorted(
                    exact_delivery_candidates.items(),
                    key=lambda item: (item[1]["score"], item[1]["date"]),
                )[0]
                consumed = []
                for source in selected_delivery["lines"]:
                    consumed.append({
                        **source,
                        "qty_faktur": source["remaining_qty"],
                        "jumlah": source["remaining_amount"],
                    })
                    source["remaining_amount"] = 0.0
                    source["remaining_qty"] = 0.0
                    source["_source_hpp"] = 0.0
                detail_for_invoice[invoice["invoice_id"]] = consumed
                continue

            needed = target
            consumed = []
            for source in pool:
                if needed <= 0.01:
                    break
                if source["remaining_amount"] <= 0.01 or source["do_date"] > invoice["tgl_faktur"]:
                    continue
                take = min(source["remaining_amount"], needed)
                ratio = take / source["remaining_amount"] if source["remaining_amount"] else 0
                consumed.append({
                    **source,
                    "qty_faktur": source["remaining_qty"] * ratio,
                    "jumlah": take,
                    "_source_hpp": source["_source_hpp"] * ratio,
                })
                source["remaining_amount"] -= take
                source["remaining_qty"] *= (1 - ratio)
                source["_source_hpp"] *= (1 - ratio)
                needed -= take
            detail_for_invoice[invoice["invoice_id"]] = consumed

    data = []
    for invoice in invoices:
        target_amount = invoice["revenue"]
        source_lines = detail_for_invoice.get(invoice["invoice_id"], direct_by_invoice.get(invoice["invoice_id"], []))
        if not target_amount:
            target_amount = sum(float(row.get("jumlah") or 0) for row in source_lines)
        source_amount = sum(max(float(row.get("jumlah") or 0), 0) for row in source_lines)
        invoice_cash_discount = max(float(invoice.get("cash_discount") or 0), 0)
        if source_amount > 0 and invoice_cash_discount > 0:
            target_amount = max(source_amount - invoice_cash_discount, 0)
        elif source_amount > 0 and invoice.get("inclusive_tax"):
            tax_rate = max(float(invoice.get("tax_rate") or 0), 0)
            if tax_rate > 0:
                target_amount = source_amount / (1 + tax_rate / 100)
        lines = _profit_loss_allocate_lines(source_lines, target_amount, invoice["hpp"])
        for line_index, line in enumerate(lines):
            manual_cost_key = (
                f"{invoice['invoice_id']}:{line.get('_source_key') or f'ROW-{line_index}'}"
            )
            result = {
                "no_faktur": invoice["no_faktur"],
                "no_do": line.get("no_do", ""),
                "no_so": line.get("no_so", ""),
                "tgl_faktur": invoice["tgl_faktur"],
                "no_barang": line.get("no_barang", ""),
                "deskripsi_barang": line.get("deskripsi_barang", ""),
                "qty_faktur": round(float(line.get("qty_faktur") or 0), 4),
                "uom": line.get("uom", ""),
                "harga_satuan": round(float(line.get("harga_satuan") or 0), 2),
                "jumlah": round(float(line.get("jumlah") or 0), 2),
                "nilai_hpp": round(float(line.get("nilai_hpp") or 0), 2),
                "delivery": 0.0,
                "delivery_ju": 0.0,
                "cf": 0.0,
                "mf": 0.0,
                "biaya_project": 0.0,
                "biaya_project_details": [],
                "total_biaya": 0.0,
                "laba_operasi": 0.0,
                "manual_cost_key": manual_cost_key,
                "gross_profit": round(float(line.get("gross_profit") or 0), 2),
                "margin_pct": round(float(line.get("margin_pct") or 0), 2),
                "no_pelanggan": invoice["no_pelanggan"],
                "nama_pelanggan": invoice["nama_pelanggan"],
                "no_po": invoice["no_po"],
                "marketing": line.get("marketing", ""),
                "no_delivery": "",
                "sumber": line.get("sumber", "Faktur Penjualan"),
            }
            data.append(result)

    marketing_filter = str(marketing or "").strip().upper()
    if marketing_filter:
        data = [
            row for row in data
            if str(row.get("marketing") or "").strip().upper() == marketing_filter
        ]

    delivery_map = _profit_loss_delivery_map(cur, [row.get("no_so") for row in data])
    _profit_loss_apply_delivery(data, delivery_map)
    delivery_ju_map = _profit_loss_delivery_ju_map(cur)
    _profit_loss_apply_delivery_ju(data, delivery_ju_map)
    mf_map = _profit_loss_mf_map(cur, [row.get("no_so") for row in data])
    _profit_loss_apply_mf(data, mf_map)
    cf_map = _profit_loss_cf_map(cur, [row.get("no_so") for row in data])
    _profit_loss_apply_cf(data, cf_map)
    project_cost_map = _profit_loss_project_cost_map(cur, data)
    for index, row in enumerate(data):
        project_cost = project_cost_map.get(index) or {}
        row["biaya_project"] = round(float(project_cost.get("amount") or 0), 2)
        row["biaya_project_details"] = project_cost.get("details", [])
        row["total_biaya"] = round(
            float(row.get("delivery") or 0)
            + float(row.get("delivery_ju") or 0)
            + row["cf"]
            + row["mf"]
            + row["biaya_project"],
            2,
        )
        row["laba_operasi"] = round(
            float(row.get("gross_profit") or 0) - row["total_biaya"],
            2,
        )
        row["margin_pct"] = round(
            (row["laba_operasi"] / float(row.get("jumlah") or 0) * 100)
            if float(row.get("jumlah") or 0)
            else 0,
            2,
        )

    search_lower = str(search or "").strip().lower()
    if search_lower:
        data = [
            row for row in data
            if search_lower in " ".join(str(value or "").lower() for value in row.values())
        ]
    return sorted(data, key=lambda row: (row["tgl_faktur"], row["no_faktur"], row["no_barang"]), reverse=True)


def _profit_loss_summary(rows):
    total_jumlah = round(sum(float(row.get("jumlah") or 0) for row in rows), 2)
    total_hpp = round(sum(float(row.get("nilai_hpp") or 0) for row in rows), 2)
    total_delivery = round(sum(float(row.get("delivery") or 0) for row in rows), 2)
    total_delivery_ju = round(sum(float(row.get("delivery_ju") or 0) for row in rows), 2)
    total_cf = round(sum(float(row.get("cf") or 0) for row in rows), 2)
    total_mf = round(sum(float(row.get("mf") or 0) for row in rows), 2)
    total_biaya_project = round(sum(float(row.get("biaya_project") or 0) for row in rows), 2)
    total_biaya = round(sum(float(row.get("total_biaya") or 0) for row in rows), 2)
    gross_profit = round(total_jumlah - total_hpp, 2)
    laba_operasi = round(gross_profit - total_biaya, 2)
    return {
        "total_baris": len(rows),
        "total_faktur": len({row.get("no_faktur") for row in rows if row.get("no_faktur")}),
        "total_jumlah": total_jumlah,
        "total_hpp": total_hpp,
        "total_delivery": total_delivery,
        "total_delivery_ju": total_delivery_ju,
        "total_cf": total_cf,
        "total_mf": total_mf,
        "total_biaya_project": total_biaya_project,
        "total_biaya": total_biaya,
        "gross_profit": gross_profit,
        "laba_operasi": laba_operasi,
        "margin_pct": round((laba_operasi / total_jumlah * 100) if total_jumlah else 0, 2),
    }


PROFIT_LOSS_EXPORT_COLUMNS = {
    "no_faktur",
    "no_do",
    "no_so",
    "tgl_faktur",
    "no_barang",
    "deskripsi_barang",
    "qty_faktur",
    "uom",
    "harga_satuan",
    "jumlah",
    "nilai_hpp",
    "gross_profit",
    "delivery",
    "delivery_ju",
    "cf",
    "cf_pct",
    "mf",
    "mf_pct",
    "biaya_project",
    "total_biaya",
    "laba_operasi",
    "margin_pct",
    "nama_pelanggan",
    "no_po",
    "marketing",
}


def _profit_loss_export_rows(rows):
    return [
        {key: row.get(key) for key in PROFIT_LOSS_EXPORT_COLUMNS}
        for row in rows
    ]


def _profit_loss_marketing_options(cur):
    cur.execute("""
        SELECT DISTINCT COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing')
        FROM SALESMAN sm
        WHERE sm.SALESMANID IS NOT NULL
        ORDER BY 1
    """)
    return [str(row[0] or "").strip() for row in cur.fetchall() if str(row[0] or "").strip()]


@app.route("/api/profit-loss")
@jwt_required()
def api_profit_loss():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        marketing = request.args.get("marketing", "").strip()
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        period = _profit_loss_effective_period(cur, date_from, date_to)
        rows = _build_profit_loss_rows(cur, period["date_from"], period["date_to"], search, marketing)
        marketing_options = _profit_loss_marketing_options(cur)
        con.close()
        return jsonify({
            "data": filter_record_columns("profit_loss", rows[offset:offset + limit]),
            "total": len(rows),
            "summary": _profit_loss_summary(rows),
            "marketing_options": marketing_options,
            "period": period,
        })
    except Exception as e:
        print(f"Error api_profit_loss: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)}), 500


@app.route("/api/profit-loss/export")
@jwt_required()
def api_profit_loss_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        marketing = request.args.get("marketing", "").strip()
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        period = _profit_loss_effective_period(cur, date_from, date_to)
        rows = _build_profit_loss_rows(cur, period["date_from"], period["date_to"], search, marketing)
        con.close()
        return jsonify({"data": _profit_loss_export_rows(rows), "total": len(rows), "period": period})
    except Exception as e:
        print(f"Error api_profit_loss_export: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)}), 500


_PROFIT_LOSS_EXPORT_JOBS = {}
_PROFIT_LOSS_EXPORT_JOBS_LOCK = threading.Lock()


def _run_profit_loss_export_job(job_id, filters):
    con = None
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        period = _profit_loss_effective_period(
            cur, filters.get("date_from", ""), filters.get("date_to", "")
        )
        rows = _build_profit_loss_rows(
            cur,
            period["date_from"],
            period["date_to"],
            filters.get("search", ""),
            filters.get("marketing", ""),
        )
        result = {
            "status": "completed",
            "data": _profit_loss_export_rows(rows),
            "total": len(rows),
            "period": period,
            "finished_at": time.time(),
        }
    except Exception as e:
        print(f"Error background profit_loss_export {job_id}: {e}")
        result = {
            "status": "failed",
            "error": str(e),
            "finished_at": time.time(),
        }
    finally:
        if con is not None:
            con.close()

    with _PROFIT_LOSS_EXPORT_JOBS_LOCK:
        job = _PROFIT_LOSS_EXPORT_JOBS.get(job_id)
        if job:
            job.update(result)


@app.route("/api/profit-loss/export/start", methods=["POST"])
@jwt_required()
def api_profit_loss_export_start():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403

    payload = request.get_json(silent=True) or {}
    filters = {
        "search": str(payload.get("search") or ""),
        "date_from": str(payload.get("date_from") or ""),
        "date_to": str(payload.get("date_to") or ""),
        "marketing": str(payload.get("marketing") or "").strip(),
    }
    job_id = uuid.uuid4().hex
    with _PROFIT_LOSS_EXPORT_JOBS_LOCK:
        # Hapus hasil lama agar data export besar tidak menetap di memori server.
        cutoff = time.time() - 3600
        stale_ids = [
            key for key, value in _PROFIT_LOSS_EXPORT_JOBS.items()
            if value.get("finished_at", value.get("created_at", 0)) < cutoff
        ]
        for stale_id in stale_ids:
            _PROFIT_LOSS_EXPORT_JOBS.pop(stale_id, None)
        _PROFIT_LOSS_EXPORT_JOBS[job_id] = {
            "status": "processing",
            "owner": str(get_jwt_identity()),
            "created_at": time.time(),
        }

    thread = threading.Thread(
        target=_run_profit_loss_export_job,
        args=(job_id, filters),
        daemon=True,
    )
    thread.start()
    return jsonify({"job_id": job_id, "status": "processing"}), 202


@app.route("/api/profit-loss/export/status/<job_id>")
@jwt_required()
def api_profit_loss_export_status(job_id):
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    with _PROFIT_LOSS_EXPORT_JOBS_LOCK:
        job = _PROFIT_LOSS_EXPORT_JOBS.get(job_id)
        if not job or job.get("owner") != str(get_jwt_identity()):
            return jsonify({"message": "Proses export tidak ditemukan"}), 404
        response = {
            key: value for key, value in job.items()
            if key not in ("owner", "created_at", "finished_at")
        }
        if job.get("status") in ("completed", "failed"):
            _PROFIT_LOSS_EXPORT_JOBS.pop(job_id, None)
    return jsonify(response)


@app.route("/api/profit-loss/marketing-options")
@jwt_required()
def api_profit_loss_marketing_options():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data = _profit_loss_marketing_options(cur)
        con.close()
        return jsonify({"data": data})
    except Exception as e:
        print(f"Error api_profit_loss_marketing_options: {e}")
        return jsonify({"data": [], "error": str(e)}), 500


@app.route("/api/profit-loss/manual-cost", methods=["POST"])
@jwt_required()
def api_profit_loss_manual_cost_save():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        data = request.get_json(silent=True) or {}
        row_key = str(data.get("row_key") or "").strip()
        if not row_key:
            return jsonify({"message": "Identitas baris Profit & Loss tidak ditemukan."}), 400

        cf = max(_to_float(data.get("cf")), 0)
        mf = max(_to_float(data.get("mf")), 0)
        project_cost = max(_to_float(data.get("biaya_project")), 0)
        user = get_current_user()
        saved = save_profit_loss_manual_cost(
            row_key=row_key,
            cf=cf,
            mf=mf,
            project_cost=project_cost,
            updated_by=user.get("username"),
        )
        audit_current_user(
            "profit_loss_manual_cost_save",
            "akuntansi",
            f"Input biaya manual Profit & Loss {row_key}",
            {
                "row_key": row_key,
                "cf": cf,
                "mf": mf,
                "biaya_project": project_cost,
            },
        )
        return jsonify({"message": "Biaya manual disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_profit_loss_manual_cost_save: {e}")
        return jsonify({"message": "Gagal menyimpan biaya manual.", "error": str(e)}), 500


def _fee_submission_user():
    current = get_current_user()
    stored = get_user(current.get("username")) or {}
    return {**current, "salesman_id": stored.get("salesman_id"), "salesman_name": stored.get("salesman_name", "")}


def _fee_submission_is_marketing(user):
    return user.get("role") in {"marketing", "marketing_fee"}


def _fee_submission_is_reviewer(user):
    return not _fee_submission_is_marketing(user) and check_permission("fee_submission")


def _fee_sales_order_rows(cur, salesman_id=None, so_nos=None, search="", date_from="", date_to=""):
    conditions = [
        "UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'",
        "so.SODATE >= '2026-01-01'",
        "so.SODATE <= '2026-12-31'",
    ]
    params = []
    if date_from:
        conditions.append("so.SODATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("so.SODATE <= ?")
        params.append(date_to)
    if salesman_id is not None:
        conditions.append("so.SALESMANID = ?")
        params.append(int(salesman_id))
    normalized_so_nos = sorted({str(value or "").strip().upper() for value in (so_nos or []) if str(value or "").strip()})
    if normalized_so_nos:
        conditions.append(f"UPPER(TRIM(so.SONO)) IN ({','.join(['?'] * len(normalized_so_nos))})")
        params.extend(normalized_so_nos)
    if search:
        conditions.append("""(
            LOWER(so.SONO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(pd.NAME, '')) CONTAINING LOWER(?)
            OR LOWER(COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, '')) CONTAINING LOWER(?)
            OR LOWER(COALESCE(so.PONO, '')) CONTAINING LOWER(?)
        )""")
        params.extend([search] * 4)

    disc_expr = sql_number_expr("det.DISCPC")
    cur.execute(f"""
        SELECT
            so.SONO, so.SODATE, pd.PERSONNO, pd.NAME, so.SALESMANID,
            COALESCE(NULLIF(TRIM(sm.FIRSTNAME || ' ' || sm.LASTNAME), ''), 'Tanpa Marketing'),
            so.PONO,
            SUM(COALESCE(det.QUANTITY, 0) * COALESCE(det.UNITPRICE, 0)
                * (1 - COALESCE({disc_expr}, 0) / 100)),
            COALESCE(so.CASHDISCOUNT, 0), COALESCE(so.CASHDISCPC, 0)
        FROM SO so
        JOIN SODET det ON det.SOID = so.SOID AND det.ITEMNO IS NOT NULL
        LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
        LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
        WHERE {' AND '.join(conditions)}
        GROUP BY so.SONO, so.SODATE, pd.PERSONNO, pd.NAME, so.SALESMANID,
                 sm.FIRSTNAME, sm.LASTNAME, so.PONO, so.CASHDISCOUNT, so.CASHDISCPC
        ORDER BY so.SODATE DESC, so.SONO DESC
    """, params)
    result = []
    for row in cur.fetchall():
        subtotal = max(float(row[7] or 0), 0)
        cash_discount = max(float(row[8] or 0), 0)
        cash_disc_pct = max(float(row[9] or 0), 0)
        header_discount = cash_discount if cash_discount else subtotal * cash_disc_pct / 100
        dpp = round(max(subtotal - header_discount, 0), 2)
        result.append({
            "so_no": str(row[0] or "").strip(), "so_date": str(row[1]) if row[1] else "",
            "customer_no": str(row[2] or "").strip(), "customer_name": str(row[3] or "").strip(),
            "salesman_id": int(row[4] or 0), "salesman_name": str(row[5] or "").strip(),
            "customer_po": str(row[6] or "").strip(), "dpp": dpp,
            "mf_rate_pct": 1.0, "mf_amount": round(dpp * 0.01, 2),
        })
    return result


@app.route("/api/fee-submissions/sales-orders")
@jwt_required()
def api_fee_submission_sales_orders():
    if not check_permission("fee_submission"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = _fee_submission_user()
    salesman_id = user.get("salesman_id") if _fee_submission_is_marketing(user) else None
    if _fee_submission_is_marketing(user) and salesman_id is None:
        return jsonify({"data": [], "total": 0, "message": "Akun belum dihubungkan ke salesman. Hubungi admin."}), 400
    try:
        today = datetime.now().date()
        default_from = today.replace(day=1).isoformat()
        next_month = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
        default_to = (next_month - timedelta(days=1)).isoformat()
        date_from = str(request.args.get("date_from") or default_from).strip()
        date_to = str(request.args.get("date_to") or default_to).strip()
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        rows = _fee_sales_order_rows(
            cur, salesman_id=salesman_id, search=request.args.get("search", "").strip(),
            date_from=date_from, date_to=date_to,
        )
        so_nos = [row["so_no"] for row in rows]
        mf_map = _profit_loss_mf_map(cur, so_nos)
        cf_map = _profit_loss_cf_map(cur, so_nos)
        con.close()
        submissions = get_fee_submissions(so_nos)
        submission_map = {(row["so_no"].upper(), row["fee_type"]): row for row in submissions}
        for row in rows:
            key = row["so_no"].upper()
            mf_submission = submission_map.get((key, "MF")) or {}
            cf_submission = submission_map.get((key, "CF")) or {}
            row.update({
                "mf_status": "realized" if mf_map.get(key) else mf_submission.get("status", "available"),
                "mf_submitted_at": mf_submission.get("submitted_at", ""),
                "mf_transaction_date": mf_submission.get("transaction_date", ""),
                "cf_status": "realized" if cf_map.get(key) else cf_submission.get("status", "available"),
                "cf_enabled": bool(cf_submission), "cf_rate_pct": float(cf_submission.get("rate_pct") or 0),
                "cf_amount": float(cf_submission.get("amount") or 0),
                "cf_submitted_at": cf_submission.get("submitted_at", ""),
                "cf_transaction_date": cf_submission.get("transaction_date", ""),
                "actual_mf": float((mf_map.get(key) or {}).get("amount") or 0),
                "actual_cf": float((cf_map.get(key) or {}).get("amount") or 0),
            })
        return jsonify({
            "data": filter_record_columns("fee_submission", rows), "total": len(rows),
            "year": 2026, "period": {"date_from": date_from, "date_to": date_to},
        })
    except Exception as e:
        print(f"Error api_fee_submission_sales_orders: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)}), 500


@app.route("/api/fee-submissions")
@jwt_required()
def api_fee_submissions_list():
    if not check_permission("fee_submission"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = _fee_submission_user()
    data = get_fee_submissions()
    if _fee_submission_is_marketing(user):
        if user.get("salesman_id") is None:
            data = []
        else:
            data = [row for row in data if int(row.get("salesman_id") or 0) == int(user["salesman_id"])]
    status = request.args.get("status", "").strip().lower()
    if status:
        data = [row for row in data if row.get("status") == status]
    return jsonify({"data": filter_record_columns("fee_submission", data), "total": len(data), "can_review": _fee_submission_is_reviewer(user)})


@app.route("/api/fee-submissions", methods=["POST"])
@jwt_required()
def api_fee_submissions_create():
    if not check_permission("fee_submission"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = _fee_submission_user()
    if user.get("role") not in ("marketing", "marketing_fee", "admin"):
        return jsonify({"message": "Pengajuan hanya dapat dibuat oleh Marketing atau Admin"}), 403
    if _fee_submission_is_marketing(user) and user.get("salesman_id") is None:
        return jsonify({"message": "Akun belum dihubungkan ke salesman"}), 400
    payload = request.get_json(silent=True) or {}
    transaction_date = str(payload.get("transaction_date") or "").strip()
    try:
        datetime.strptime(transaction_date, "%Y-%m-%d")
    except ValueError:
        return jsonify({"message": "Tanggal pengajuan wajib diisi"}), 400
    requested = payload.get("rows") or []
    requested_map = {str(row.get("so_no") or "").strip().upper(): row for row in requested if row.get("so_no")}
    if not requested_map:
        return jsonify({"message": "Pilih minimal satu AI-PP"}), 400
    con = fdb.connect(**DB_CONFIG)
    cur = con.cursor()
    sales_rows = _fee_sales_order_rows(
        cur,
        salesman_id=user.get("salesman_id") if _fee_submission_is_marketing(user) else None,
        so_nos=requested_map.keys(),
    )
    mf_actual = _profit_loss_mf_map(cur, requested_map.keys())
    cf_actual = _profit_loss_cf_map(cur, requested_map.keys())
    con.close()
    active_sales_rows = [
        row for row in sales_rows
        if requested_map.get(row["so_no"].upper(), {}).get("include_mf")
        or requested_map.get(row["so_no"].upper(), {}).get("include_cf")
    ]
    salesman_ids = {int(row.get("salesman_id") or 0) for row in active_sales_rows}
    if len(salesman_ids) > 1:
        return jsonify({"message": "Satu pengajuan hanya boleh berisi transaksi dari satu marketing"}), 400
    saved, errors = [], []
    batches = {}
    for sales_row in sales_rows:
        so_no = sales_row["so_no"].upper()
        requested_row = requested_map[so_no]
        fee_specs = []
        if requested_row.get("include_mf"):
            mf_rate = _to_float(requested_row.get("mf_rate_pct"))
            if mf_rate <= 0 or mf_rate > 100:
                errors.append(f"{so_no} persentase MF harus lebih dari 0 dan maksimal 100")
            elif mf_actual.get(so_no):
                errors.append(f"{so_no} MF sudah direalisasikan")
            else:
                fee_specs.append(("MF", mf_rate))
        if requested_row.get("include_cf"):
            cf_rate = _to_float(requested_row.get("cf_rate_pct"))
            if cf_rate <= 0 or cf_rate > 100:
                errors.append(f"{so_no} persentase CF harus lebih dari 0 dan maksimal 100")
            elif cf_actual.get(so_no):
                errors.append(f"{so_no} CF sudah direalisasikan")
            else:
                fee_specs.append(("CF", cf_rate))
        for fee_type, rate in fee_specs:
            batch_key = f"{fee_type}:{sales_row['salesman_id']}"
            if batch_key not in batches:
                batches[batch_key] = create_fee_submission_batch(
                    fee_type, sales_row["salesman_id"], sales_row["salesman_name"],
                    user.get("username"), user.get("name"), str(payload.get("note") or "").strip(),
                    transaction_date,
                )
            batch = batches[batch_key]
            amount = round(sales_row["dpp"] * rate / 100, 2)
            ok, message_text, submission_id = save_fee_submission(
                sales_row["so_no"], fee_type, sales_row["salesman_id"], sales_row["salesman_name"],
                sales_row["dpp"], rate, amount, user.get("username"), user.get("name"),
                batch["id"], batch["batch_no"], sales_row["customer_no"],
                sales_row["customer_name"], sales_row["customer_po"], transaction_date,
            )
            if ok:
                saved.append(submission_id)
            else:
                errors.append(f"{so_no} {fee_type}: {message_text}")
    if saved:
        audit_current_user("fee_submission_create", "fee_submission", f"Mengirim {len(saved)} pengajuan CF/MF", {"ids": saved})
    saved_rows = [row for row in get_fee_submissions() if row.get("id") in saved]
    created_batches = [value for value in batches.values() if any(
        row.get("batch_id") == value.get("id") for row in saved_rows
    )]
    return jsonify({
        "message": f"{len(saved)} pengajuan berhasil dikirim",
        "saved": len(saved), "errors": errors, "batches": created_batches,
    }), 200 if saved else 400


@app.route("/api/fee-submissions/<int:submission_id>/review", methods=["POST"])
@jwt_required()
def api_fee_submission_review(submission_id):
    if not check_permission("fee_submission"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = _fee_submission_user()
    if not _fee_submission_is_reviewer(user):
        return jsonify({"message": "Persetujuan hanya dapat dilakukan Finance"}), 403
    payload = request.get_json(silent=True) or {}
    action = str(payload.get("action") or "").strip().lower()
    note = str(payload.get("note") or "").strip()
    if action not in ("approve", "reject"):
        return jsonify({"message": "Aksi persetujuan tidak valid"}), 400
    if action == "reject" and not note:
        return jsonify({"message": "Alasan penolakan wajib diisi"}), 400
    if not review_fee_submission(submission_id, action, user.get("username"), note):
        return jsonify({"message": "Pengajuan tidak ditemukan atau sudah diproses"}), 409
    audit_current_user("fee_submission_review", "fee_submission", f"{action} pengajuan {submission_id}", {"id": submission_id, "action": action, "note": note})
    return jsonify({"message": "Pengajuan disetujui" if action == "approve" else "Pengajuan ditolak"})


@app.route("/api/fee-submissions/<int:submission_id>", methods=["DELETE"])
@jwt_required()
def api_fee_submission_delete(submission_id):
    if not check_permission("fee_submission"):
        return jsonify({"message": "Akses ditolak"}), 403
    user = _fee_submission_user()
    if not _fee_submission_is_reviewer(user):
        return jsonify({"message": "Penghapusan hanya dapat dilakukan Finance"}), 403
    deleted = delete_fee_submission(submission_id)
    if not deleted:
        return jsonify({"message": "Pengajuan tidak ditemukan atau sudah diproses"}), 409
    audit_current_user(
        "fee_submission_delete", "fee_submission",
        f"Menghapus pengajuan {deleted.get('batch_no') or deleted['so_no']} ({deleted.get('count', 1)} SO)", deleted,
    )
    return jsonify({"message": f"Pengajuan {deleted.get('batch_no') or deleted['so_no']} beserta {deleted.get('count', 1)} SO berhasil dihapus"})


@app.route("/api/hpp")
@jwt_required()
def api_hpp():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        status = request.args.get("status", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data = _build_hpp_rows(cur, date_from, date_to, search)
        con.close()

        if status:
            data = [row for row in data if row["status"] == status]

        summary = {
            "total_produk": len(data),
            "qty_produksi": round(sum(row["qty_produksi"] for row in data), 4),
            "qty_terjual": round(sum(row["qty_terjual"] for row in data), 4),
            "hpp_total": round(sum(row["hpp_total"] for row in data), 2),
            "nilai_jual": round(sum(row["nilai_jual"] for row in data), 2),
            "laba_rugi": round(sum(row["laba_rugi"] for row in data), 2),
        }
        summary["margin_pct"] = round(
            (summary["laba_rugi"] / summary["nilai_jual"] * 100) if summary["nilai_jual"] else 0,
            2,
        )
        summary["status"] = "Laba" if summary["laba_rugi"] > 0 else "Rugi" if summary["laba_rugi"] < 0 else "Impas"

        return jsonify({
            "data": filter_record_columns("hpp", data[offset:offset + limit]),
            "total": len(data),
            "summary": summary,
        })
    except Exception as e:
        print(f"Error api_hpp: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/hpp/export")
@jwt_required()
def api_hpp_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        status = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data = _build_hpp_rows(cur, date_from, date_to, search)
        con.close()

        if status:
            data = [row for row in data if row["status"] == status]

        return jsonify({"data": filter_record_columns("hpp", data), "total_rows": len(data)})
    except Exception as e:
        print(f"Error api_hpp_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/hpp/debug")
@jwt_required()
def api_hpp_debug():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    date_from = request.args.get("date_from", "")
    date_to = request.args.get("date_to", "")

    def count_sql(cur, sql, params):
        cur.execute(sql, params)
        return int(cur.fetchone()[0] or 0)

    def sample_sql(cur, sql, params):
        cur.execute(sql, params)
        return [tuple(str(value or "").strip() for value in row) for row in cur.fetchall()]

    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        result = {
            "period": {"date_from": date_from, "date_to": date_to},
            "counts": {},
            "samples": {},
        }

        result["counts"]["sales_order_items"] = count_sql(cur, """
            SELECT COUNT(*)
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND (? = '' OR so.SODATE >= ?)
              AND (? = '' OR so.SODATE <= ?)
        """, [date_from, date_from, date_to, date_to])

        result["counts"]["delivery_order_items"] = count_sql(cur, """
            SELECT COUNT(*)
            FROM ARINV ar
            LEFT JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(ar.DELIVERYORDER) <> ''
              AND det.ITEMNO IS NOT NULL
              AND (? = '' OR ar.INVOICEDATE >= ?)
              AND (? = '' OR ar.INVOICEDATE <= ?)
        """, [date_from, date_from, date_to, date_to])

        result["counts"]["production_result_items"] = count_sql(cur, """
            SELECT COUNT(*)
            FROM PRODRESULT pr
            LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
            WHERE prd.ITEMNO IS NOT NULL
              AND (? = '' OR pr.RESULTDATE >= ?)
              AND (? = '' OR pr.RESULTDATE <= ?)
        """, [date_from, date_from, date_to, date_to])

        result["counts"]["itemhist_rows"] = count_sql(cur, """
            SELECT COUNT(*)
            FROM ITEMHIST h
            WHERE (? = '' OR h.TXDATE >= ?)
              AND (? = '' OR h.TXDATE <= ?)
        """, [date_from, date_from, date_to, date_to])

        result["samples"]["sales_order_items"] = sample_sql(cur, """
            SELECT FIRST 5 so.SONO, so.SODATE, det.ITEMNO, det.QUANTITY, det.QTYSHIPPED, det.UNITPRICE
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE det.ITEMNO IS NOT NULL
              AND (? = '' OR so.SODATE >= ?)
              AND (? = '' OR so.SODATE <= ?)
            ORDER BY so.SODATE DESC
        """, [date_from, date_from, date_to, date_to])

        result["samples"]["delivery_order_items"] = sample_sql(cur, """
            SELECT FIRST 5 ar.INVOICENO, ar.INVOICEDATE, det.ITEMNO, det.QUANTITY, det.UNITPRICE
            FROM ARINV ar
            LEFT JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(ar.DELIVERYORDER) <> ''
              AND det.ITEMNO IS NOT NULL
              AND (? = '' OR ar.INVOICEDATE >= ?)
              AND (? = '' OR ar.INVOICEDATE <= ?)
            ORDER BY ar.INVOICEDATE DESC
        """, [date_from, date_from, date_to, date_to])

        result["samples"]["production_result_items"] = sample_sql(cur, """
            SELECT FIRST 5 pr.RESULTNO, pr.RESULTDATE, prd.ITEMNO, prd.QUANTITY, prd.COST
            FROM PRODRESULT pr
            LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
            WHERE prd.ITEMNO IS NOT NULL
              AND (? = '' OR pr.RESULTDATE >= ?)
              AND (? = '' OR pr.RESULTDATE <= ?)
            ORDER BY pr.RESULTDATE DESC
        """, [date_from, date_from, date_to, date_to])

        result["samples"]["itemhist_rows"] = sample_sql(cur, """
            SELECT FIRST 5 h.TXDATE, h.TXTYPE, h.ITEMNO, h.QUANTITY, h.DESCRIPTION
            FROM ITEMHIST h
            WHERE (? = '' OR h.TXDATE >= ?)
              AND (? = '' OR h.TXDATE <= ?)
            ORDER BY h.TXDATE DESC, h.ITEMHISTID DESC
        """, [date_from, date_from, date_to, date_to])

        con.close()
        return jsonify(result)
    except Exception as e:
        print(f"Error api_hpp_debug: {e}")
        return jsonify({"error": str(e), "counts": {}, "samples": {}})


def _build_hpp_unit_map(cur, date_to=""):
    conditions = ["prd.ITEMNO IS NOT NULL", "COALESCE(prd.QUANTITY, 0) <> 0"]
    params = []
    if date_to:
        conditions.append("pr.RESULTDATE <= ?")
        params.append(date_to)

    cur.execute(f"""
        SELECT
            prd.ITEMNO,
            SUM(COALESCE(prd.COST, 0) * COALESCE(prd.QUANTITY, 0)),
            SUM(COALESCE(prd.QUANTITY, 0))
        FROM PRODRESULT pr
        LEFT JOIN PRODRESULTDET prd ON prd.PRODRESULTID = pr.ID
        WHERE {" AND ".join(conditions)}
        GROUP BY prd.ITEMNO
    """, params)

    result = {}
    for itemno, cost_total, qty_total in cur.fetchall():
        item_key = str(itemno or "").strip()
        qty = float(qty_total or 0)
        if item_key and qty:
            result[item_key] = float(cost_total or 0) / qty
    return result


def _build_hpp_trend_rows(cur, date_from="", date_to=""):
    hpp_unit_by_item = _build_hpp_unit_map(cur, date_to)

    def collect_do_rows():
        conditions = [
            "ar.DELIVERYORDER IS NOT NULL AND TRIM(ar.DELIVERYORDER) <> ''",
            "ar.INVOICETYPE = 1",
            "det.ITEMNO IS NOT NULL",
        ]
        params = []
        if date_from:
            conditions.append("ar.INVOICEDATE >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("ar.INVOICEDATE <= ?")
            params.append(date_to)

        cur.execute(f"""
            SELECT
                ar.INVOICEDATE,
                det.ITEMNO,
                SUM(COALESCE(det.QUANTITY, 0)),
                SUM(
                    COALESCE(det.QUANTITY, 0)
                    * COALESCE(det.UNITPRICE, 0)
                    * (1 - COALESCE(CAST(det.ITEMDISCPC AS DOUBLE PRECISION), 0) / 100)
                )
            FROM ARINV ar
            LEFT JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            WHERE {" AND ".join(conditions)}
            GROUP BY ar.INVOICEDATE, det.ITEMNO
            ORDER BY ar.INVOICEDATE
        """, params)
        return cur.fetchall()

    def collect_so_rows():
        conditions = ["det.ITEMNO IS NOT NULL"]
        params = []
        if date_from:
            conditions.append("so.SODATE >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("so.SODATE <= ?")
            params.append(date_to)

        cur.execute(f"""
            SELECT
                so.SODATE,
                det.ITEMNO,
                SUM(COALESCE(NULLIF(det.QTYSHIPPED, 0), det.QUANTITY, 0)),
                SUM(
                    COALESCE(NULLIF(det.QTYSHIPPED, 0), det.QUANTITY, 0)
                    * COALESCE(det.UNITPRICE, 0)
                    * (1 - COALESCE(CAST(det.DISCPC AS DOUBLE PRECISION), 0) / 100)
                )
            FROM SO so
            LEFT JOIN SODET det ON det.SOID = so.SOID
            WHERE {" AND ".join(conditions)}
            GROUP BY so.SODATE, det.ITEMNO
            ORDER BY so.SODATE
        """, params)
        return cur.fetchall()

    sales_rows = collect_do_rows()
    source = "delivery_order"
    if not sales_rows:
        sales_rows = collect_so_rows()
        source = "sales_order"

    daily = {}
    for tx_date, itemno, qty, nilai_jual in sales_rows:
        date_key = str(tx_date)[:10]
        item_key = str(itemno or "").strip()
        qty = float(qty or 0)
        nilai_jual = float(nilai_jual or 0)
        hpp_total = qty * float(hpp_unit_by_item.get(item_key, 0))

        bucket = daily.setdefault(date_key, {
            "date": date_key,
            "nilai_jual": 0.0,
            "hpp_total": 0.0,
            "laba_rugi": 0.0,
            "transaction_count": 0,
        })
        bucket["nilai_jual"] += nilai_jual
        bucket["hpp_total"] += hpp_total
        bucket["laba_rugi"] += nilai_jual - hpp_total
        bucket["transaction_count"] += 1

    if date_from and date_to:
        try:
            start_date = datetime.strptime(date_from, "%Y-%m-%d").date()
            end_date = datetime.strptime(date_to, "%Y-%m-%d").date()
            current_date = start_date
            while current_date <= end_date:
                date_key = current_date.isoformat()
                daily.setdefault(date_key, {
                    "date": date_key,
                    "nilai_jual": 0.0,
                    "hpp_total": 0.0,
                    "laba_rugi": 0.0,
                    "transaction_count": 0,
                })
                current_date += timedelta(days=1)
        except Exception as fill_error:
            print(f"Error fill hpp trend dates: {fill_error}")

    cumulative = 0.0
    rows = []
    for row in sorted(daily.values(), key=lambda item: item["date"]):
        cumulative += row["laba_rugi"]
        rows.append({
            "date": row["date"],
            "nilai_jual": round(row["nilai_jual"], 2),
            "hpp_total": round(row["hpp_total"], 2),
            "laba_rugi": round(row["laba_rugi"], 2),
            "cumulative_laba_rugi": round(cumulative, 2),
            "transaction_count": row["transaction_count"],
        })

    return rows, source


@app.route("/api/hpp/trend")
@jwt_required()
def api_hpp_trend():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        rows, source = _build_hpp_trend_rows(cur, date_from, date_to)
        try:
            aset_rows, _, _ = _build_aset_rows(cur, "", date_from, date_to, 0, 99999)
        except Exception as aset_error:
            print(f"Error hpp trend aset: {aset_error}")
            aset_rows = []
        try:
            building_rows, _, _ = _build_bangunan_rows(cur, "", date_from, date_to, 0, 99999)
        except Exception as building_error:
            print(f"Error hpp trend bangunan: {building_error}")
            building_rows = []
        expense_sources = {}
        for expense_key, builder in (
            ("salary_expense_amount", _build_beban_gaji_rows),
            ("etoll_expense_amount", _build_beban_etoll_rows),
            ("transport_expense_amount", _build_beban_transport_rows),
            ("utility_expense_amount", _build_beban_utilitas_rows),
        ):
            try:
                expense_rows, _, _ = builder(cur, "", date_from, date_to, 0, 99999)
            except Exception as expense_error:
                print(f"Error hpp trend {expense_key}: {expense_error}")
                expense_rows = []
            expense_sources[expense_key] = expense_rows
        con.close()

        aset_by_date = {}
        for aset in aset_rows:
            date_key = str(aset.get("tanggal_aktiva") or "")[:10]
            if not date_key:
                continue
            aset_by_date[date_key] = aset_by_date.get(date_key, 0) + float(aset.get("nilai_aktiva") or 0)

        building_by_date = {}
        for building in building_rows:
            date_key = str(building.get("tanggal") or "")[:10]
            if not date_key:
                continue
            building_by_date[date_key] = building_by_date.get(date_key, 0) + float(building.get("nilai") or 0)

        expenses_by_key = {}
        for expense_key, expense_rows in expense_sources.items():
            by_date = {}
            for expense in expense_rows:
                date_key = str(expense.get("tanggal") or "")[:10]
                if not date_key:
                    continue
                by_date[date_key] = by_date.get(date_key, 0) + float(expense.get("nilai") or 0)
            expenses_by_key[expense_key] = by_date

        cumulative_after_asset = 0.0
        for row in rows:
            asset_amount = round(aset_by_date.get(row["date"], 0), 2)
            building_amount = round(building_by_date.get(row["date"], 0), 2)
            row["asset_purchase_amount"] = asset_amount
            row["building_maintenance_amount"] = building_amount
            total_expense_amount = building_amount
            for expense_key, by_date in expenses_by_key.items():
                expense_amount = round(by_date.get(row["date"], 0), 2)
                row[expense_key] = expense_amount
                total_expense_amount += expense_amount
            cumulative_after_asset += float(row.get("laba_rugi") or 0) - asset_amount - total_expense_amount
            row["cumulative_after_asset"] = round(cumulative_after_asset, 2)

        return jsonify({
            "data": rows,
            "source": source,
            "summary": {
                "nilai_jual": round(sum(row["nilai_jual"] for row in rows), 2),
                "hpp_total": round(sum(row["hpp_total"] for row in rows), 2),
                "laba_rugi": round(sum(row["laba_rugi"] for row in rows), 2),
                "asset_purchase_amount": round(sum(row.get("asset_purchase_amount", 0) for row in rows), 2),
                "building_maintenance_amount": round(sum(row.get("building_maintenance_amount", 0) for row in rows), 2),
                "salary_expense_amount": round(sum(row.get("salary_expense_amount", 0) for row in rows), 2),
                "etoll_expense_amount": round(sum(row.get("etoll_expense_amount", 0) for row in rows), 2),
                "transport_expense_amount": round(sum(row.get("transport_expense_amount", 0) for row in rows), 2),
                "utility_expense_amount": round(sum(row.get("utility_expense_amount", 0) for row in rows), 2),
            },
        })
    except Exception as e:
        print(f"Error api_hpp_trend: {e}")
        return jsonify({"data": [], "summary": {}, "error": str(e)})


def _build_hpp_sales_details(cur, item_no, date_from="", date_to=""):
    hpp_unit = _build_hpp_unit_map(cur, date_to).get(item_no, 0)

    def build_rows(rows, source):
        data = []
        for row in rows:
            qty = float(row[5] or 0)
            unit_price = float(row[7] or 0)
            disc_pct = float(row[8] or 0)
            nilai_jual = qty * unit_price * (1 - disc_pct / 100)
            hpp_total = qty * float(hpp_unit or 0)
            data.append({
                "source": source,
                "no_dokumen": str(row[0] or "").strip(),
                "tanggal": str(row[1]) if row[1] else "",
                "no_customer": str(row[2] or "").strip(),
                "nama_customer": str(row[3] or "").strip(),
                "no_po_customer": str(row[4] or "").strip(),
                "qty": round(qty, 4),
                "uom": str(row[6] or "").strip(),
                "harga_jual": round(unit_price, 2),
                "disc_pct": round(disc_pct, 2),
                "nilai_jual": round(nilai_jual, 2),
                "hpp_per_unit": round(float(hpp_unit or 0), 2),
                "hpp_total": round(hpp_total, 2),
                "laba_rugi": round(nilai_jual - hpp_total, 2),
            })
        return data

    conditions = [
        "ar.DELIVERYORDER IS NOT NULL AND TRIM(ar.DELIVERYORDER) <> ''",
        "ar.INVOICETYPE = 1",
        "det.ITEMNO = ?",
    ]
    params = [item_no]
    if date_from:
        conditions.append("ar.INVOICEDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("ar.INVOICEDATE <= ?")
        params.append(date_to)

    cur.execute(f"""
        SELECT
            ar.INVOICENO, ar.INVOICEDATE, pd.PERSONNO, pd.NAME,
            ar.PURCHASEORDERNO, det.QUANTITY, det.ITEMUNIT, det.UNITPRICE,
            COALESCE(CAST(det.ITEMDISCPC AS DOUBLE PRECISION), 0)
        FROM ARINV ar
        LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
        LEFT JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
        WHERE {" AND ".join(conditions)}
        ORDER BY ar.INVOICEDATE, ar.INVOICENO
    """, params)
    data = build_rows(cur.fetchall(), "DO")
    if data:
        return data

    so_conditions = ["det.ITEMNO = ?"]
    so_params = [item_no]
    if date_from:
        so_conditions.append("so.SODATE >= ?")
        so_params.append(date_from)
    if date_to:
        so_conditions.append("so.SODATE <= ?")
        so_params.append(date_to)

    cur.execute(f"""
        SELECT
            so.SONO, so.SODATE, pd.PERSONNO, pd.NAME, so.PONO,
            COALESCE(NULLIF(det.QTYSHIPPED, 0), det.QUANTITY, 0),
            det.ITEMUNIT, det.UNITPRICE,
            COALESCE(CAST(det.DISCPC AS DOUBLE PRECISION), 0)
        FROM SO so
        LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
        LEFT JOIN SODET det ON det.SOID = so.SOID
        WHERE {" AND ".join(so_conditions)}
        ORDER BY so.SODATE, so.SONO
    """, so_params)
    return build_rows(cur.fetchall(), "SO")


@app.route("/api/hpp/details")
@jwt_required()
def api_hpp_details():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        item_no = request.args.get("itemno", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        if not item_no:
            return jsonify({"data": []})

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data = _build_hpp_sales_details(cur, item_no, date_from, date_to)
        con.close()
        return jsonify({"data": data})
    except Exception as e:
        print(f"Error api_hpp_details: {e}")
        return jsonify({"data": [], "error": str(e)})


ASSET_TABLE_HINTS = ("ASSET", "AKTIVA", "FIX", "FA")
BUILDING_ACCOUNT_NO_HINT = "6.00.00.015"
BUILDING_ACCOUNT_NAME_HINTS = ("PEMELIHARAAN", "PERBAIKAN", "BANGUNAN")
SALARY_EXPENSE_ACCOUNT_NO = "6.00.00.001"
SALARY_EXPENSE_ACCOUNT_NAME = "Gaji , Upah dan Tunjangan"
ETOLL_ACCOUNT_NO = "1.01.00.000"
ETOLL_ACCOUNT_NAME = "E-TOLL"
ETOLL_ACCOUNT_NOS = (
    "1.01.00.001",
    "1.01.00.002",
    "1.01.00.003",
    "1.01.00.004",
    "1.01.00.005",
)
TRANSPORT_EXPENSE_ACCOUNT_NO = "6.00.00.004"
TRANSPORT_EXPENSE_ACCOUNT_NAME = "BBM, Parkir, Tol & Transport"
UTILITY_EXPENSE_ACCOUNT_NO = "6.00.00.008"
UTILITY_EXPENSE_ACCOUNT_NAME = "Listrik, Telepon, Pulsa & Internet"
ASSET_COLUMN_CANDIDATES = {
    "no_aktiva": (
        "ASSETNO", "ASSETCODE", "ASSETNUMBER", "FIXASSETNO", "FIXASSETCODE",
        "FIXEDASSETNO", "FIXEDASSETCODE", "FACODE", "FANO", "FA_NO",
        "KODEAKTIVA", "NOAKTIVA", "CODE",
    ),
    "nama_aktiva": (
        "ASSETNAME", "ASSETDESCRIPTION", "FIXASSETNAME", "FIXEDASSETNAME",
        "FANAME", "FA_NAME", "NAMAAKTIVA", "NAME", "DESCRIPTION",
    ),
    "tanggal_aktiva": (
        "USEDATE", "USAGEDATE", "STARTDATE", "PURCHASEDATE", "ACQUISITIONDATE",
        "ACQDATE", "ACQUIREDATE", "TGLPENGGUNAAN", "TGLAKUISISI", "TRANSDATE",
    ),
    "nilai_aktiva": (
        "ASSETVALUE", "ASSETCOST", "ACQUISITIONCOST", "ACQUISITIONVALUE",
        "PURCHASEVALUE", "PURCHASEPRICE", "ORIGINALCOST", "NILAIAKTIVA",
        "VALUE", "COST", "AMOUNT",
    ),
    "deskripsi": ("NOTES", "NOTE", "DESCRIPTION", "MEMO", "REMARK"),
}

ACCOUNT_TABLE_HINTS = ("ACCOUNT", "AKUN", "GLACC", "GLACCOUNT", "CHART")
ACCOUNT_COLUMN_CANDIDATES = {
    "id": ("ACCOUNTID", "GLACCOUNTID", "GLACCID", "ACCID", "ID"),
    "no": ("GLACCOUNT", "ACCOUNTNO", "GLACCOUNTNO", "GLACCNO", "ACCNO", "NOAKUN", "KODEAKUN", "CODE"),
    "name": ("ACCOUNTNAME", "GLACCOUNTNAME", "GLACCNAME", "ACCNAME", "NAMAAKUN", "NAME", "DESCRIPTION"),
}
BUILDING_LEDGER_COLUMN_CANDIDATES = {
    "tanggal": ("TRANSDATE", "JOURNALDATE", "JV_DATE", "JVDATE", "GLDATE", "DATE", "TANGGAL"),
    "nilai": ("AMOUNT", "LOCALAMOUNT", "BASEAMOUNT", "PRIMEAMOUNT", "GLAMOUNT", "VALUE", "NILAI", "DEBIT", "CREDIT"),
    "debit": ("DEBIT", "DEBITAMOUNT", "DEBITVALUE"),
    "credit": ("CREDIT", "CREDITAMOUNT", "CREDITVALUE"),
    "account": ("ACCOUNTNO", "GLACCOUNTNO", "GLACCNO", "ACCNO", "NOAKUN", "KODEAKUN", "ACCOUNT", "GLACCOUNT"),
    "account_id": ("ACCOUNTID", "GLACCOUNTID", "GLACCID", "ACCID"),
    "account_name": ("ACCOUNTNAME", "GLACCOUNTNAME", "GLACCNAME", "ACCNAME", "NAMAAKUN"),
    "project": ("PROJECTNO", "PROJECTCODE", "PROJECTID", "PROJECT", "PROJNO", "JOBNO", "NO_PROJECT", "NOPROJECT"),
    "project_name": ("PROJECTNAME", "PROJNAME", "JOBNAME", "NAMA_PROJECT", "NAMAPROJECT"),
    "doc": ("TRANSACTIONNO", "JOURNALNO", "JVNUMBER", "JVNO", "GLNO", "REFNO", "VOUCHERNO", "FORMNO", "NOFORM", "INVOICENO", "DOCNO"),
    "desc": ("TRANSDESCRIPTION", "DESCRIPTION", "MEMO", "NOTES", "NOTE", "REMARK", "DESKRIPSI"),
}


def _identifier(name):
    clean = "".join(ch for ch in str(name or "").strip() if ch.isalnum() or ch == "_")
    if not clean:
        raise ValueError("Identifier kosong")
    return clean


def _get_table_columns(cur, table_name):
    cur.execute("""
        SELECT TRIM(rf.RDB$FIELD_NAME)
        FROM RDB$RELATION_FIELDS rf
        WHERE TRIM(rf.RDB$RELATION_NAME) = ?
        ORDER BY rf.RDB$FIELD_POSITION
    """, [table_name])
    return [str(row[0] or "").strip().upper() for row in cur.fetchall()]


def _get_user_tables(cur):
    cur.execute("""
        SELECT TRIM(RDB$RELATION_NAME)
        FROM RDB$RELATIONS
        WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
        ORDER BY RDB$RELATION_NAME
    """)
    return [str(row[0] or "").strip().upper() for row in cur.fetchall()]


def _table_exists(cur, table_name):
    return table_name.upper() in set(_get_user_tables(cur))


def _table_has_columns(cur, table_name, required_columns):
    columns = set(_get_table_columns(cur, table_name))
    return all(column.upper() in columns for column in required_columns)


def _match_column(columns, names):
    column_set = set(columns)
    return next((name for name in names if name in column_set), None)


def _text_expr(column):
    return f"CAST({_identifier(column)} AS VARCHAR(255))"


def _to_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _extract_easy_doc_no(description, source="", trans_type="", row_id=""):
    text = str(description or "").strip()
    if ":" in text:
        candidate = text.rsplit(":", 1)[-1].strip()
        if candidate:
            return candidate
    parts = [str(source or "").strip(), str(trans_type or "").strip(), str(row_id or "").strip()]
    return "-".join(part for part in parts if part)


def _extract_salary_doc_no(description, source="", trans_type="", row_id=""):
    text = str(description or "").strip()
    upper_text = text.upper()
    marker = " NO "
    if marker in upper_text:
        start = upper_text.find(marker) + len(marker)
        end = upper_text.find(" PERIODE", start)
        candidate = text[start:end if end > start else None].strip()
        if candidate:
            return candidate
    parts = [str(source or "").strip(), str(trans_type or "").strip(), str(row_id or "").strip()]
    return "-".join(part for part in parts if part)


def _find_asset_table(cur):
    tables = _get_user_tables(cur)
    candidates = [table for table in tables if any(hint in table for hint in ASSET_TABLE_HINTS)]
    candidates += [table for table in tables if table not in candidates]
    best = None

    for table in candidates:
        columns = _get_table_columns(cur, table)
        mapping = {}
        score = 0
        for field, names in ASSET_COLUMN_CANDIDATES.items():
            match = _match_column(columns, names)
            if match:
                mapping[field] = match
                score += 1
        if any(hint in table for hint in ASSET_TABLE_HINTS):
            score += 2
        if {"no_aktiva", "nama_aktiva", "nilai_aktiva"}.issubset(mapping) and mapping.get("tanggal_aktiva"):
            best = (table, mapping, score)
            break
        if not best or score > best[2]:
            best = (table, mapping, score)

    if not best or not {"no_aktiva", "nama_aktiva", "nilai_aktiva"}.issubset(best[1]):
        return None, {}, []
    return best[0], best[1], _get_table_columns(cur, best[0])


def _build_aset_rows(cur, search="", date_from="", date_to="", offset=0, limit=50):
    table, mapping, columns = _find_asset_table(cur)
    if not table:
        return [], 0, {"message": "Tabel aktiva tetap belum ditemukan otomatis di database Easy."}

    table_sql = _identifier(table)
    select_exprs = [
        mapping.get("no_aktiva"),
        mapping.get("nama_aktiva"),
        mapping.get("tanggal_aktiva"),
        mapping.get("nilai_aktiva"),
        mapping.get("deskripsi"),
    ]
    select_sql = ", ".join(
        _identifier(col) if col else "NULL"
        for col in select_exprs
    )
    conditions = []
    params = []

    if search:
        search_conditions = []
        for col in (mapping.get("no_aktiva"), mapping.get("nama_aktiva"), mapping.get("deskripsi")):
            if col:
                search_conditions.append(f"LOWER({_identifier(col)}) CONTAINING LOWER(?)")
                params.append(search)
        if search_conditions:
            conditions.append("(" + " OR ".join(search_conditions) + ")")

    date_col = mapping.get("tanggal_aktiva")
    if date_col and date_from:
        conditions.append(f"{_identifier(date_col)} >= ?")
        params.append(date_from)
    if date_col and date_to:
        conditions.append(f"{_identifier(date_col)} <= ?")
        params.append(date_to)

    for disposed_col in ("DISPOSED", "DISPOSAL", "ISDISPOSED", "SOLD"):
        if disposed_col in columns:
            conditions.append(f"COALESCE({_identifier(disposed_col)}, 0) = 0")
            break

    where_sql = " WHERE " + " AND ".join(conditions) if conditions else ""
    order_col = mapping.get("tanggal_aktiva") or mapping.get("no_aktiva")

    count_sql = f"SELECT COUNT(*) FROM {table_sql}{where_sql}"
    cur.execute(count_sql, params)
    total = int(cur.fetchone()[0] or 0)

    sql = f"""
        SELECT FIRST ? SKIP ? {select_sql}
        FROM {table_sql}
        {where_sql}
        ORDER BY {_identifier(order_col)} DESC
    """
    cur.execute(sql, [limit, offset] + params)
    rows = cur.fetchall()

    data = []
    for row in rows:
        data.append({
            "no_aktiva": str(row[0] or "").strip(),
            "nama_aktiva": str(row[1] or "").strip(),
            "tanggal_aktiva": str(row[2]) if row[2] else "",
            "nilai_aktiva": float(row[3] or 0),
            "deskripsi": str(row[4] or "").strip(),
        })
    return data, total, {"table": table, "mapping": mapping}


def _find_account_table(cur):
    tables = _get_user_tables(cur)
    candidates = [table for table in tables if any(hint in table for hint in ACCOUNT_TABLE_HINTS)]
    candidates += [table for table in tables if table not in candidates]
    best = None

    for table in candidates:
        columns = _get_table_columns(cur, table)
        mapping = {}
        score = 0
        for field, names in ACCOUNT_COLUMN_CANDIDATES.items():
            match = _match_column(columns, names)
            if match:
                mapping[field] = match
                score += 1
        if any(hint in table for hint in ACCOUNT_TABLE_HINTS):
            score += 2
        if {"no", "name"}.issubset(mapping):
            return table, mapping
        if not best or score > best[2]:
            best = (table, mapping, score)

    if best and {"no", "name"}.issubset(best[1]):
        return best[0], best[1]
    return None, {}


def _find_building_account_refs(cur):
    table, mapping = _find_account_table(cur)
    refs = {"ids": [], "nos": [BUILDING_ACCOUNT_NO_HINT], "names": [], "table": table, "mapping": mapping}
    if not table:
        refs["message"] = "Tabel akun belum ditemukan otomatis."
        return refs

    table_sql = _identifier(table)
    no_col = mapping.get("no")
    name_col = mapping.get("name")
    id_col = mapping.get("id")
    select_cols = [
        _identifier(id_col) if id_col else "NULL",
        _identifier(no_col),
        _identifier(name_col),
    ]
    params = [BUILDING_ACCOUNT_NO_HINT]
    conditions = [f"{_text_expr(no_col)} = ?"]
    for hint in BUILDING_ACCOUNT_NAME_HINTS:
        conditions.append(f"UPPER({_text_expr(name_col)}) CONTAINING ?")
        params.append(hint)

    cur.execute(f"""
        SELECT {", ".join(select_cols)}
        FROM {table_sql}
        WHERE {" AND ".join(conditions)}
    """, params)
    for row in cur.fetchall():
        if row[0] is not None:
            refs["ids"].append(str(row[0]).strip())
        if row[1] is not None:
            refs["nos"].append(str(row[1]).strip())
        if row[2] is not None:
            refs["names"].append(str(row[2]).strip())

    refs["ids"] = list(dict.fromkeys(refs["ids"]))
    refs["nos"] = list(dict.fromkeys(refs["nos"]))
    refs["names"] = list(dict.fromkeys(refs["names"]))
    return refs


def _find_building_ledger_source(cur, account_refs):
    tables = _get_user_tables(cur)
    ignored = set(["ITEM", "PERSONDATA"])
    if account_refs.get("table"):
        ignored.add(account_refs["table"])
    candidates = [table for table in tables if table not in ignored]
    best = None

    for table in candidates:
        columns = _get_table_columns(cur, table)
        mapping = {}
        for field, names in BUILDING_LEDGER_COLUMN_CANDIDATES.items():
            match = _match_column(columns, names)
            if match:
                mapping[field] = match

        has_account = mapping.get("account") or mapping.get("account_id") or mapping.get("account_name")
        has_amount = mapping.get("nilai") or mapping.get("debit") or mapping.get("credit")
        if not has_account or not has_amount:
            continue

        matched_rows = 0
        try:
            account_condition, account_params = _building_account_condition(mapping, account_refs)
            cur.execute(f"SELECT COUNT(*) FROM {_identifier(table)} WHERE {account_condition}", account_params)
            matched_rows = int(cur.fetchone()[0] or 0)
        except Exception:
            matched_rows = 0

        score = 0
        score += 20 if matched_rows > 0 else 0
        score += 4 if mapping.get("tanggal") else 0
        score += 3 if mapping.get("project") else 0
        score += 2 if mapping.get("doc") else 0
        score += 1 if mapping.get("desc") else 0
        if any(hint in table for hint in ("GL", "JOURNAL", "JV", "LEDGER", "TRANS")):
            score += 3
        if score > (best[2] if best else -1):
            best = (table, mapping, score, matched_rows)

    if not best:
        return None, {}
    return best[0], {**best[1], "_matched_rows": best[3]}


def _get_building_ledger_candidates(cur, account_refs, limit=12):
    tables = _get_user_tables(cur)
    rows = []
    for table in tables:
        columns = _get_table_columns(cur, table)
        mapping = {}
        for field, names in BUILDING_LEDGER_COLUMN_CANDIDATES.items():
            match = _match_column(columns, names)
            if match:
                mapping[field] = match

        has_account = mapping.get("account") or mapping.get("account_id") or mapping.get("account_name")
        has_amount = mapping.get("nilai") or mapping.get("debit") or mapping.get("credit")
        if not has_account or not has_amount:
            continue

        matched_rows = 0
        try:
            account_condition, account_params = _building_account_condition(mapping, account_refs)
            cur.execute(f"SELECT COUNT(*) FROM {_identifier(table)} WHERE {account_condition}", account_params)
            matched_rows = int(cur.fetchone()[0] or 0)
        except Exception as exc:
            rows.append({"table": table, "mapping": mapping, "matched_rows": 0, "error": str(exc)})
            continue

        score = matched_rows
        if any(hint in table for hint in ("GL", "JOURNAL", "JV", "LEDGER", "TRANS")):
            score += 1000
        rows.append({"table": table, "mapping": mapping, "matched_rows": matched_rows, "score": score})

    rows.sort(key=lambda row: (row.get("matched_rows", 0), row.get("score", 0)), reverse=True)
    return rows[:limit]


def _building_account_condition(mapping, account_refs):
    conditions = []
    params = []
    if mapping.get("account") and account_refs.get("nos"):
        placeholders = ", ".join("?" for _ in account_refs["nos"])
        conditions.append(f"{_text_expr(mapping['account'])} IN ({placeholders})")
        params.extend(account_refs["nos"])
    if mapping.get("account_id") and account_refs.get("ids"):
        placeholders = ", ".join("?" for _ in account_refs["ids"])
        conditions.append(f"{_text_expr(mapping['account_id'])} IN ({placeholders})")
        params.extend(account_refs["ids"])
    if mapping.get("account_name"):
        name_conditions = []
        for hint in BUILDING_ACCOUNT_NAME_HINTS:
            name_conditions.append(f"UPPER({_text_expr(mapping['account_name'])}) CONTAINING ?")
            params.append(hint)
        conditions.append("(" + " AND ".join(name_conditions) + ")")
    if not conditions and mapping.get("account"):
        conditions.append(f"{_text_expr(mapping['account'])} = ?")
        params.append(BUILDING_ACCOUNT_NO_HINT)
    if not conditions:
        return "1 = 0", []
    return "(" + " OR ".join(conditions) + ")", params


def _build_bangunan_rows_easy_glhist(cur, search="", date_from="", date_to="", offset=0, limit=50):
    required = ("GLHISTID", "GLACCOUNT", "TRANSDATE", "BASEAMOUNT", "PROJECTID", "TRANSDESCRIPTION")
    if not _table_exists(cur, "GLHIST") or not _table_has_columns(cur, "GLHIST", required):
        return None

    has_project = _table_exists(cur, "PROJECT") and _table_has_columns(
        cur, "PROJECT", ("PROJECTID", "PROJECTNO", "PROJECTNAME")
    )
    has_account = _table_exists(cur, "GLACCNT") and _table_has_columns(
        cur, "GLACCNT", ("GLACCOUNT", "ACCOUNTNAME")
    )

    joins = []
    if has_project:
        joins.append("LEFT JOIN PROJECT p ON p.PROJECTID = gh.PROJECTID")
    if has_account:
        joins.append("LEFT JOIN GLACCNT ga ON ga.GLACCOUNT = gh.GLACCOUNT")

    conditions = ["CAST(gh.GLACCOUNT AS VARCHAR(255)) = ?"]
    params = [BUILDING_ACCOUNT_NO_HINT]

    if date_from:
        conditions.append("gh.TRANSDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("gh.TRANSDATE <= ?")
        params.append(date_to)
    if search:
        search_conditions = [
            "LOWER(CAST(gh.TRANSDESCRIPTION AS VARCHAR(255))) CONTAINING LOWER(?)",
            "LOWER(CAST(gh.GLACCOUNT AS VARCHAR(255))) CONTAINING LOWER(?)",
        ]
        params.extend([search, search])
        if has_project:
            search_conditions.extend([
                "LOWER(CAST(p.PROJECTNO AS VARCHAR(255))) CONTAINING LOWER(?)",
                "LOWER(CAST(p.PROJECTNAME AS VARCHAR(255))) CONTAINING LOWER(?)",
            ])
            params.extend([search, search])
        conditions.append("(" + " OR ".join(search_conditions) + ")")

    join_sql = "\n        ".join(joins)
    where_sql = " WHERE " + " AND ".join(conditions)

    cur.execute(f"""
        SELECT COUNT(*)
        FROM GLHIST gh
        {join_sql}
        {where_sql}
    """, params)
    total = int(cur.fetchone()[0] or 0)

    summary = {"nilai": 0, "total_project": 0}
    project_count_expr = (
        "COUNT(DISTINCT CASE WHEN p.PROJECTNO IS NOT NULL AND p.PROJECTNO <> '0' THEN p.PROJECTNO END)"
        if has_project else "0"
    )
    cur.execute(f"""
        SELECT
            COALESCE(SUM(ABS(gh.BASEAMOUNT)), 0),
            {project_count_expr}
        FROM GLHIST gh
        {join_sql}
        {where_sql}
    """, params)
    summary_row = cur.fetchone()
    if summary_row:
        summary = {
            "nilai": round(_to_float(summary_row[0]), 2),
            "total_project": int(summary_row[1] or 0),
        }

    project_no_expr = "p.PROJECTNO" if has_project else "NULL"
    project_name_expr = "p.PROJECTNAME" if has_project else "NULL"
    account_name_expr = "ga.ACCOUNTNAME" if has_account else "NULL"
    source_expr = "gh.SOURCE" if "SOURCE" in _get_table_columns(cur, "GLHIST") else "NULL"
    trans_type_expr = "gh.TRANSTYPE" if "TRANSTYPE" in _get_table_columns(cur, "GLHIST") else "NULL"

    cur.execute(f"""
        SELECT FIRST ? SKIP ?
            gh.TRANSDATE,
            {project_no_expr},
            {project_name_expr},
            gh.GLACCOUNT,
            {account_name_expr},
            gh.TRANSDESCRIPTION,
            gh.BASEAMOUNT,
            {source_expr},
            {trans_type_expr},
            gh.GLHISTID
        FROM GLHIST gh
        {join_sql}
        {where_sql}
        ORDER BY gh.TRANSDATE DESC, gh.GLHISTID DESC
    """, [limit, offset] + params)

    rows = cur.fetchall()
    data = []
    for row in rows:
        no_project = str(row[1] or "").strip()
        nama_project = str(row[2] or "").strip()
        if no_project == "0" and nama_project.upper() == "NON PROJECT":
            no_project = ""
        data.append({
            "tanggal": str(row[0]) if row[0] else "",
            "no_project": no_project,
            "nama_project": nama_project,
            "no_akun": str(row[3] or BUILDING_ACCOUNT_NO_HINT).strip(),
            "nama_akun": str(row[4] or "Pemeliharaan dan Perbaikan Bangunan").strip(),
            "no_dokumen": _extract_easy_doc_no(row[5], row[7], row[8], row[9]),
            "deskripsi": str(row[5] or "").strip(),
            "nilai": round(abs(_to_float(row[6])), 2),
        })

    meta = {
        "table": "GLHIST",
        "mapping": {
            "tanggal": "TRANSDATE",
            "nilai": "BASEAMOUNT",
            "account": "GLACCOUNT",
            "project": "PROJECT.PROJECTNO" if has_project else "PROJECTID",
            "project_name": "PROJECT.PROJECTNAME" if has_project else None,
            "account_name": "GLACCNT.ACCOUNTNAME" if has_account else None,
            "doc": "TRANSDESCRIPTION",
            "desc": "TRANSDESCRIPTION",
        },
        "matched_rows": total,
        "account": {"nos": [BUILDING_ACCOUNT_NO_HINT], "table": "GLACCNT" if has_account else None},
        "summary": summary,
    }
    return data, total, meta


def _build_bangunan_rows(cur, search="", date_from="", date_to="", offset=0, limit=50):
    easy_glhist_rows = _build_bangunan_rows_easy_glhist(cur, search, date_from, date_to, offset, limit)
    if easy_glhist_rows is not None:
        return easy_glhist_rows

    account_refs = _find_building_account_refs(cur)
    table, mapping = _find_building_ledger_source(cur, account_refs)
    if not table:
        return [], 0, {
            "message": "Sumber transaksi bangunan belum ditemukan otomatis. Perlu cek nama tabel jurnal/project di database Easy.",
            "account": account_refs,
        }

    table_sql = _identifier(table)
    account_condition, params = _building_account_condition(mapping, account_refs)
    conditions = [account_condition]

    date_col = mapping.get("tanggal")
    if date_col and date_from:
        conditions.append(f"{_identifier(date_col)} >= ?")
        params.append(date_from)
    if date_col and date_to:
        conditions.append(f"{_identifier(date_col)} <= ?")
        params.append(date_to)
    if search:
        search_conditions = []
        for col in (mapping.get("project"), mapping.get("project_name"), mapping.get("doc"), mapping.get("desc")):
            if col:
                search_conditions.append(f"LOWER({_text_expr(col)}) CONTAINING LOWER(?)")
                params.append(search)
        if search_conditions:
            conditions.append("(" + " OR ".join(search_conditions) + ")")

    amount_expr = "0"
    if mapping.get("nilai"):
        amount_expr = f"COALESCE({_identifier(mapping['nilai'])}, 0)"
    elif mapping.get("debit") and mapping.get("credit"):
        amount_expr = f"COALESCE({_identifier(mapping['debit'])}, 0) - COALESCE({_identifier(mapping['credit'])}, 0)"
    elif mapping.get("debit"):
        amount_expr = f"COALESCE({_identifier(mapping['debit'])}, 0)"
    elif mapping.get("credit"):
        amount_expr = f"COALESCE({_identifier(mapping['credit'])}, 0)"

    select_exprs = [
        _identifier(date_col) if date_col else "NULL",
        _identifier(mapping.get("project")) if mapping.get("project") else "NULL",
        _identifier(mapping.get("project_name")) if mapping.get("project_name") else "NULL",
        _identifier(mapping.get("account")) if mapping.get("account") else "NULL",
        _identifier(mapping.get("account_name")) if mapping.get("account_name") else "NULL",
        _identifier(mapping.get("doc")) if mapping.get("doc") else "NULL",
        _identifier(mapping.get("desc")) if mapping.get("desc") else "NULL",
        amount_expr,
    ]
    where_sql = " WHERE " + " AND ".join(conditions)
    order_col = date_col or mapping.get("doc") or mapping.get("project") or mapping.get("account")

    count_sql = f"SELECT COUNT(*) FROM {table_sql}{where_sql}"
    cur.execute(count_sql, params)
    total = int(cur.fetchone()[0] or 0)

    sql = f"""
        SELECT FIRST ? SKIP ? {", ".join(select_exprs)}
        FROM {table_sql}
        {where_sql}
        ORDER BY {_identifier(order_col)} DESC
    """
    cur.execute(sql, [limit, offset] + params)
    rows = cur.fetchall()

    fallback_no = account_refs.get("nos", [BUILDING_ACCOUNT_NO_HINT])[0] if account_refs.get("nos") else BUILDING_ACCOUNT_NO_HINT
    fallback_name = account_refs.get("names", ["Pemeliharaan dan Perbaikan Bangunan"])[0] if account_refs.get("names") else "Pemeliharaan dan Perbaikan Bangunan"
    data = []
    for row in rows:
        data.append({
            "tanggal": str(row[0]) if row[0] else "",
            "no_project": str(row[1] or "").strip(),
            "nama_project": str(row[2] or "").strip(),
            "no_akun": str(row[3] or fallback_no).strip(),
            "nama_akun": str(row[4] or fallback_name).strip(),
            "no_dokumen": str(row[5] or "").strip(),
            "deskripsi": str(row[6] or "").strip(),
            "nilai": round(abs(_to_float(row[7])), 2),
        })
    matched_rows = mapping.pop("_matched_rows", 0)
    return data, total, {"table": table, "mapping": mapping, "matched_rows": matched_rows, "account": account_refs}


def _build_beban_account_rows(
    cur,
    account_no,
    account_name,
    search="",
    date_from="",
    date_to="",
    offset=0,
    limit=50,
    doc_extractor=_extract_easy_doc_no,
):
    account_nos = list(account_no) if isinstance(account_no, (list, tuple, set)) else [account_no]
    required = ("GLHISTID", "GLACCOUNT", "TRANSDATE", "BASEAMOUNT", "TRANSDESCRIPTION")
    if not _table_exists(cur, "GLHIST") or not _table_has_columns(cur, "GLHIST", required):
        return [], 0, {"message": "Sumber GLHIST untuk beban belum ditemukan di database Easy."}

    has_account = _table_exists(cur, "GLACCNT") and _table_has_columns(
        cur, "GLACCNT", ("GLACCOUNT", "ACCOUNTNAME")
    )
    glhist_columns = set(_get_table_columns(cur, "GLHIST"))
    joins = ["LEFT JOIN GLACCNT ga ON ga.GLACCOUNT = gh.GLACCOUNT"] if has_account else []
    join_sql = "\n        ".join(joins)

    placeholders = ", ".join("?" for _ in account_nos)
    conditions = [f"CAST(gh.GLACCOUNT AS VARCHAR(255)) IN ({placeholders})"]
    params = account_nos[:]

    if date_from:
        conditions.append("gh.TRANSDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("gh.TRANSDATE <= ?")
        params.append(date_to)
    if search:
        search_conditions = [
            "LOWER(CAST(gh.TRANSDESCRIPTION AS VARCHAR(255))) CONTAINING LOWER(?)",
            "LOWER(CAST(gh.GLACCOUNT AS VARCHAR(255))) CONTAINING LOWER(?)",
        ]
        params.extend([search, search])
        if has_account:
            search_conditions.append("LOWER(CAST(ga.ACCOUNTNAME AS VARCHAR(255))) CONTAINING LOWER(?)")
            params.append(search)
        conditions.append("(" + " OR ".join(search_conditions) + ")")

    where_sql = " WHERE " + " AND ".join(conditions)
    source_expr = "gh.SOURCE" if "SOURCE" in glhist_columns else "NULL"
    trans_type_expr = "gh.TRANSTYPE" if "TRANSTYPE" in glhist_columns else "NULL"
    account_name_expr = "ga.ACCOUNTNAME" if has_account else "NULL"

    cur.execute(f"""
        SELECT COUNT(*), COALESCE(SUM(ABS(gh.BASEAMOUNT)), 0)
        FROM GLHIST gh
        {join_sql}
        {where_sql}
    """, params)
    count_row = cur.fetchone()
    total = int(count_row[0] or 0)
    total_nilai = round(_to_float(count_row[1]), 2)

    cur.execute(f"""
        SELECT FIRST ? SKIP ?
            gh.TRANSDATE,
            gh.GLACCOUNT,
            {account_name_expr},
            {source_expr},
            {trans_type_expr},
            gh.TRANSDESCRIPTION,
            gh.BASEAMOUNT,
            gh.GLHISTID
        FROM GLHIST gh
        {join_sql}
        {where_sql}
        ORDER BY gh.TRANSDATE DESC, gh.GLHISTID DESC
    """, [limit, offset] + params)

    data = []
    for row in cur.fetchall():
        data.append({
            "tanggal": str(row[0]) if row[0] else "",
            "no_akun": str(row[1] or account_nos[0]).strip(),
            "nama_akun": str(row[2] or account_name).strip(),
            "sumber": str(row[3] or "").strip(),
            "tipe_transaksi": str(row[4] or "").strip(),
            "no_dokumen": doc_extractor(row[5], row[3], row[4], row[7]),
            "deskripsi": str(row[5] or "").strip(),
            "nilai": round(abs(_to_float(row[6])), 2),
        })

    return data, total, {
        "table": "GLHIST",
        "mapping": {
            "tanggal": "TRANSDATE",
            "account": "GLACCOUNT",
            "account_name": "GLACCNT.ACCOUNTNAME" if has_account else None,
            "source": "SOURCE" if "SOURCE" in glhist_columns else None,
            "trans_type": "TRANSTYPE" if "TRANSTYPE" in glhist_columns else None,
            "doc": "TRANSDESCRIPTION",
            "desc": "TRANSDESCRIPTION",
            "nilai": "BASEAMOUNT",
        },
        "matched_rows": total,
        "account": {"nos": account_nos, "name": account_name},
        "summary": {"total_transaksi": total, "nilai": total_nilai},
    }


def _build_beban_gaji_rows(cur, search="", date_from="", date_to="", offset=0, limit=50):
    return _build_beban_account_rows(
        cur,
        SALARY_EXPENSE_ACCOUNT_NO,
        SALARY_EXPENSE_ACCOUNT_NAME,
        search,
        date_from,
        date_to,
        offset,
        limit,
        _extract_salary_doc_no,
    )


def _build_beban_etoll_rows(cur, search="", date_from="", date_to="", offset=0, limit=50):
    data, total, meta = _build_beban_account_rows(
        cur,
        ETOLL_ACCOUNT_NOS,
        ETOLL_ACCOUNT_NAME,
        search,
        date_from,
        date_to,
        offset,
        limit,
        _extract_easy_doc_no,
    )
    if total > 0:
        return data, total, meta

    return _build_beban_etoll_jvdet_rows(cur, search, date_from, date_to, offset, limit)


def _build_beban_etoll_jvdet_rows(cur, search="", date_from="", date_to="", offset=0, limit=50):
    account_nos = list(ETOLL_ACCOUNT_NOS)
    if not _table_exists(cur, "JVDET") or not _table_exists(cur, "JV"):
        return [], 0, {"message": "Transaksi E-TOLL belum ditemukan di GLHIST/JVDET Easy."}
    if not _table_has_columns(cur, "JVDET", ("JVID", "GLACCOUNT", "GLAMOUNT")):
        return [], 0, {"message": "Kolom JVDET untuk E-TOLL belum sesuai."}
    if not _table_has_columns(cur, "JV", ("JVID", "TRANSDATE", "JVNUMBER", "TRANSDESCRIPTION")):
        return [], 0, {"message": "Kolom JV untuk E-TOLL belum sesuai."}

    has_account = _table_exists(cur, "GLACCNT") and _table_has_columns(
        cur, "GLACCNT", ("GLACCOUNT", "ACCOUNTNAME")
    )
    jv_columns = set(_get_table_columns(cur, "JV"))
    jvdet_columns = set(_get_table_columns(cur, "JVDET"))
    joins = ["JOIN JV j ON j.JVID = d.JVID"]
    if has_account:
        joins.append("LEFT JOIN GLACCNT ga ON ga.GLACCOUNT = d.GLACCOUNT")
    join_sql = "\n        ".join(joins)

    placeholders = ", ".join("?" for _ in account_nos)
    conditions = [f"CAST(d.GLACCOUNT AS VARCHAR(255)) IN ({placeholders})"]
    params = account_nos[:]

    if date_from:
        conditions.append("j.TRANSDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("j.TRANSDATE <= ?")
        params.append(date_to)
    if search:
        search_conditions = [
            "LOWER(CAST(j.JVNUMBER AS VARCHAR(255))) CONTAINING LOWER(?)",
            "LOWER(CAST(j.TRANSDESCRIPTION AS VARCHAR(255))) CONTAINING LOWER(?)",
            "LOWER(CAST(d.GLACCOUNT AS VARCHAR(255))) CONTAINING LOWER(?)",
        ]
        params.extend([search, search, search])
        if "DESCRIPTION" in jvdet_columns:
            search_conditions.append("LOWER(CAST(d.DESCRIPTION AS VARCHAR(255))) CONTAINING LOWER(?)")
            params.append(search)
        if has_account:
            search_conditions.append("LOWER(CAST(ga.ACCOUNTNAME AS VARCHAR(255))) CONTAINING LOWER(?)")
            params.append(search)
        conditions.append("(" + " OR ".join(search_conditions) + ")")

    where_sql = " WHERE " + " AND ".join(conditions)
    source_expr = "j.SOURCE" if "SOURCE" in jv_columns else "NULL"
    trans_type_expr = "j.TRANSTYPE" if "TRANSTYPE" in jv_columns else "NULL"
    detail_desc_expr = "d.DESCRIPTION" if "DESCRIPTION" in jvdet_columns else "NULL"
    account_name_expr = "ga.ACCOUNTNAME" if has_account else "NULL"

    cur.execute(f"""
        SELECT COUNT(*), COALESCE(SUM(ABS(d.GLAMOUNT)), 0)
        FROM JVDET d
        {join_sql}
        {where_sql}
    """, params)
    count_row = cur.fetchone()
    total = int(count_row[0] or 0)
    total_nilai = round(_to_float(count_row[1]), 2)

    cur.execute(f"""
        SELECT FIRST ? SKIP ?
            j.TRANSDATE,
            d.GLACCOUNT,
            {account_name_expr},
            {source_expr},
            {trans_type_expr},
            j.JVNUMBER,
            COALESCE({detail_desc_expr}, j.TRANSDESCRIPTION),
            d.GLAMOUNT
        FROM JVDET d
        {join_sql}
        {where_sql}
        ORDER BY j.TRANSDATE DESC, j.JVID DESC
    """, [limit, offset] + params)

    data = []
    for row in cur.fetchall():
        data.append({
            "tanggal": str(row[0]) if row[0] else "",
            "no_akun": str(row[1] or ETOLL_ACCOUNT_NO).strip(),
            "nama_akun": str(row[2] or ETOLL_ACCOUNT_NAME).strip(),
            "sumber": str(row[3] or "").strip(),
            "tipe_transaksi": str(row[4] or "").strip(),
            "no_dokumen": str(row[5] or "").strip(),
            "deskripsi": str(row[6] or "").strip(),
            "nilai": round(abs(_to_float(row[7])), 2),
        })

    return data, total, {
        "table": "JVDET",
        "mapping": {
            "tanggal": "JV.TRANSDATE",
            "account": "JVDET.GLACCOUNT",
            "account_name": "GLACCNT.ACCOUNTNAME" if has_account else None,
            "source": "JV.SOURCE" if "SOURCE" in jv_columns else None,
            "trans_type": "JV.TRANSTYPE" if "TRANSTYPE" in jv_columns else None,
            "doc": "JV.JVNUMBER",
            "desc": "JVDET.DESCRIPTION/JV.TRANSDESCRIPTION",
            "nilai": "JVDET.GLAMOUNT",
        },
        "matched_rows": total,
        "account": {"nos": account_nos, "name": ETOLL_ACCOUNT_NAME},
        "summary": {"total_transaksi": total, "nilai": total_nilai},
    }


def _build_beban_transport_rows(cur, search="", date_from="", date_to="", offset=0, limit=50):
    return _build_beban_account_rows(
        cur,
        TRANSPORT_EXPENSE_ACCOUNT_NO,
        TRANSPORT_EXPENSE_ACCOUNT_NAME,
        search,
        date_from,
        date_to,
        offset,
        limit,
        _extract_easy_doc_no,
    )


def _build_beban_utilitas_rows(cur, search="", date_from="", date_to="", offset=0, limit=50):
    return _build_beban_account_rows(
        cur,
        UTILITY_EXPENSE_ACCOUNT_NO,
        UTILITY_EXPENSE_ACCOUNT_NAME,
        search,
        date_from,
        date_to,
        offset,
        limit,
        _extract_easy_doc_no,
    )


@app.route("/api/aset")
@jwt_required()
def api_aset():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_aset_rows(cur, search, date_from, date_to, offset, limit)
        con.close()
        return jsonify({
            "data": filter_record_columns("aset", data),
            "total": total,
            "summary": {
                "total_aset": total,
                "nilai_aktiva": round(sum(row["nilai_aktiva"] for row in data), 2),
            },
            "meta": meta,
        })
    except Exception as e:
        print(f"Error api_aset: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/aset/export")
@jwt_required()
def api_aset_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_aset_rows(cur, search, date_from, date_to, 0, 99999)
        con.close()
        return jsonify({"data": filter_record_columns("aset", data), "total_rows": total, "meta": meta})
    except Exception as e:
        print(f"Error api_aset_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/aset/bangunan")
@jwt_required()
def api_aset_bangunan():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_bangunan_rows(cur, search, date_from, date_to, offset, limit)
        con.close()
        meta_summary = meta.get("summary", {}) if isinstance(meta, dict) else {}
        return jsonify({
            "data": filter_record_columns("aset_bangunan", data),
            "total": total,
            "summary": {
                "total_transaksi": total,
                "nilai": meta_summary.get("nilai", round(sum(row["nilai"] for row in data), 2)),
                "total_project": meta_summary.get(
                    "total_project",
                    len(set(row["no_project"] for row in data if row.get("no_project") and row.get("no_project") != "0")),
                ),
            },
            "meta": meta,
        })
    except Exception as e:
        print(f"Error api_aset_bangunan: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/aset/bangunan/export")
@jwt_required()
def api_aset_bangunan_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_bangunan_rows(cur, search, date_from, date_to, 0, 99999)
        con.close()
        return jsonify({"data": filter_record_columns("aset_bangunan", data), "total_rows": total, "meta": meta})
    except Exception as e:
        print(f"Error api_aset_bangunan_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/aset/bangunan/debug")
@jwt_required()
def api_aset_bangunan_debug():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        account_refs = _find_building_account_refs(cur)
        candidates = _get_building_ledger_candidates(cur, account_refs)
        table, mapping = _find_building_ledger_source(cur, account_refs)
        con.close()
        matched_rows = mapping.pop("_matched_rows", 0) if mapping else 0
        return jsonify({
            "account": account_refs,
            "selected": {"table": table, "mapping": mapping, "matched_rows": matched_rows},
            "candidates": candidates,
        })
    except Exception as e:
        print(f"Error api_aset_bangunan_debug: {e}")
        return jsonify({"error": str(e), "account": {}, "selected": {}, "candidates": []})


@app.route("/api/beban/gaji")
@jwt_required()
def api_beban_gaji():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_gaji_rows(cur, search, date_from, date_to, offset, limit)
        con.close()
        meta_summary = meta.get("summary", {}) if isinstance(meta, dict) else {}
        return jsonify({
            "data": filter_record_columns("beban_gaji", data),
            "total": total,
            "summary": {
                "total_transaksi": meta_summary.get("total_transaksi", total),
                "nilai": meta_summary.get("nilai", round(sum(row["nilai"] for row in data), 2)),
            },
            "meta": meta,
        })
    except Exception as e:
        print(f"Error api_beban_gaji: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/beban/gaji/export")
@jwt_required()
def api_beban_gaji_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_gaji_rows(cur, search, date_from, date_to, 0, 99999)
        con.close()
        return jsonify({"data": filter_record_columns("beban_gaji", data), "total_rows": total, "meta": meta})
    except Exception as e:
        print(f"Error api_beban_gaji_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/beban/etoll")
@jwt_required()
def api_beban_etoll():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_etoll_rows(cur, search, date_from, date_to, offset, limit)
        con.close()
        meta_summary = meta.get("summary", {}) if isinstance(meta, dict) else {}
        return jsonify({
            "data": filter_record_columns("beban_etoll", data),
            "total": total,
            "summary": {
                "total_transaksi": meta_summary.get("total_transaksi", total),
                "nilai": meta_summary.get("nilai", round(sum(row["nilai"] for row in data), 2)),
            },
            "meta": meta,
        })
    except Exception as e:
        print(f"Error api_beban_etoll: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/beban/etoll/export")
@jwt_required()
def api_beban_etoll_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_etoll_rows(cur, search, date_from, date_to, 0, 99999)
        con.close()
        return jsonify({"data": filter_record_columns("beban_etoll", data), "total_rows": total, "meta": meta})
    except Exception as e:
        print(f"Error api_beban_etoll_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/beban/transport")
@jwt_required()
def api_beban_transport():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_transport_rows(cur, search, date_from, date_to, offset, limit)
        con.close()
        meta_summary = meta.get("summary", {}) if isinstance(meta, dict) else {}
        return jsonify({
            "data": filter_record_columns("beban_transport", data),
            "total": total,
            "summary": {
                "total_transaksi": meta_summary.get("total_transaksi", total),
                "nilai": meta_summary.get("nilai", round(sum(row["nilai"] for row in data), 2)),
            },
            "meta": meta,
        })
    except Exception as e:
        print(f"Error api_beban_transport: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/beban/transport/export")
@jwt_required()
def api_beban_transport_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_transport_rows(cur, search, date_from, date_to, 0, 99999)
        con.close()
        return jsonify({"data": filter_record_columns("beban_transport", data), "total_rows": total, "meta": meta})
    except Exception as e:
        print(f"Error api_beban_transport_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/beban/utilitas")
@jwt_required()
def api_beban_utilitas():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_utilitas_rows(cur, search, date_from, date_to, offset, limit)
        con.close()
        meta_summary = meta.get("summary", {}) if isinstance(meta, dict) else {}
        return jsonify({
            "data": filter_record_columns("beban_utilitas", data),
            "total": total,
            "summary": {
                "total_transaksi": meta_summary.get("total_transaksi", total),
                "nilai": meta_summary.get("nilai", round(sum(row["nilai"] for row in data), 2)),
            },
            "meta": meta,
        })
    except Exception as e:
        print(f"Error api_beban_utilitas: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/beban/utilitas/export")
@jwt_required()
def api_beban_utilitas_export():
    if not check_permission("akuntansi"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        data, total, meta = _build_beban_utilitas_rows(cur, search, date_from, date_to, 0, 99999)
        con.close()
        return jsonify({"data": filter_record_columns("beban_utilitas", data), "total_rows": total, "meta": meta})
    except Exception as e:
        print(f"Error api_beban_utilitas_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


# FPB = Faktur dari penerimaan barang (invoice pembelian biasa, ISDP = 0)
# Beda dengan Faktur Uang Muka (ISDP = 1)
#
# Tabel:
#   APINV       → header faktur (No, Tgl, Nilai, Paid, Owing, Deskripsi)
#   PERSONDATA  → Nama & No Pemasok
#   TERMOPMT    → Term pembayaran untuk hitung Jatuh Tempo
#   APDPDET     → Detail uang muka yang dipakai (subquery)
#   APCHEQ      → Header faktur uang muka (subquery untuk No & Tgl DP)
#
# Field mapping:
#   Nilai Faktur   = APINV.INVOICEAMOUNT
#   Uang Muka      = APINV.DPUSED  (total DP yang sudah dipotong)
#   Nilai Terbayar = APINV.PAIDAMOUNT
#   Terhutang      = APINV.OWING
#   Jatuh Tempo    = INVOICEDATE + TERMOPMT.NETDAYS (jika tidak ada → INVOICEDATE + 30)
#
# Filter: APINV.ISDP = 0 (bukan faktur uang muka)
#         APINV.INVOICETYPE = 1 (faktur biasa, bukan credit note)

def _fpb_where_clause(search, date_from, date_to, status):
    # Filter utama: BILL=1 = faktur dari penerimaan barang (bukan uang muka)
    # ISDP=1 = faktur uang muka (kita exclude)
    conditions = ["ai.BILL = 1", "(ai.ISDP IS NULL OR ai.ISDP = 0)"]
    params = []

    if search:
        conditions.append("""(
            LOWER(ai.INVOICENO)          CONTAINING LOWER(?)
            OR LOWER(pd.NAME)            CONTAINING LOWER(?)
            OR LOWER(pd.PERSONNO)        CONTAINING LOWER(?)
            OR LOWER(ai.DESCRIPTION)     CONTAINING LOWER(?)
            OR LOWER(ai.PURCHASEORDERNO) CONTAINING LOWER(?)
        )""")
        params += [search, search, search, search, search]

    if date_from:
        conditions.append("ai.INVOICEDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("ai.INVOICEDATE <= ?")
        params.append(date_to)

    if status == "lunas":
        conditions.append("ai.OWING <= 0")
    elif status == "belum_lunas":
        conditions.append("ai.OWING > 0")
    elif status == "jatuh_tempo":
        conditions.append("ai.OWING > 0 AND (ai.INVOICEDATE + 30) < CURRENT_DATE")

    return " AND ".join(conditions), params


def _build_fpb_rows(rows):
    from datetime import date, timedelta
    today = date.today()
    data  = []

    for row in rows:
        inv_amount  = float(row[5]  or 0)
        dp_used     = float(row[6]  or 0)
        paid_amount = float(row[7]  or 0)
        owing       = float(row[8]  or 0)
        net_days    = int(row[9]    or 30)
        inv_date    = row[3]

        # Hitung jatuh tempo
        if inv_date:
            due_date = inv_date + timedelta(days=net_days)
            due_str  = str(due_date)
            overdue  = owing > 0 and due_date < today
        else:
            due_str  = ""
            overdue  = False

        # Status
        if owing <= 0:
            status = "Lunas"
        elif overdue:
            status = "Jatuh Tempo"
        else:
            status = "Belum Lunas"

        # NOFORM = No formulir/referensi (bisa dipakai sebagai No Faktur UM)
        # SHIPDATE = tanggal faktur uang muka jika ada
        data.append({
            "no_faktur":         str(row[0]  or "").strip(),
            "no_faktur_dp":      str(row[1]  or "").strip(),   # NOFORM
            "tgl_faktur_dp":     str(row[2])  if row[2]  else "",  # SHIPDATE
            "tgl_faktur":        str(row[3])  if row[3]  else "",
            "no_pemasok":        str(row[10] or "").strip(),
            "nama_pemasok":      str(row[11] or "").strip(),
            "nilai_faktur":      inv_amount,
            "uang_muka":         dp_used,
            "nilai_terbayar":    paid_amount,
            "terhutang":         owing,
            "jatuh_tempo":       due_str,
            "deskripsi":         str(row[4]  or "").replace('\r\n', ' ').replace('\n', ' ').strip(),
            "no_po":             str(row[12] or "").strip(),
            "status":            status,
            "overdue":           overdue,
        })
    return data


_FPB_SELECT = """
    ai.INVOICENO,
    ai.NOFORM,
    ai.SHIPDATE,
    ai.INVOICEDATE,
    ai.DESCRIPTION,
    ai.INVOICEAMOUNT,
    ai.DPUSED,
    ai.PAIDAMOUNT,
    ai.OWING,
    COALESCE(tm.NETDAYS, 30),
    pd.PERSONNO,
    pd.NAME,
    ai.PURCHASEORDERNO
"""

_FPB_FROM = """
    FROM APINV ai
    LEFT JOIN PERSONDATA pd ON pd.ID       = ai.VENDORID
    LEFT JOIN TERMOPMT   tm ON tm.TERMID  = ai.TERMSID
"""


@app.route("/api/fpb")
@jwt_required()
def api_fpb():
    """Daftar FPB (Faktur Penerimaan Barang) dengan pagination."""
    if not check_permission("fpb"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        where_sql, params_where = _fpb_where_clause(search, date_from, date_to, status)

        sql = f"""
            SELECT FIRST ? SKIP ?
                {_FPB_SELECT}
            {_FPB_FROM}
            WHERE {where_sql}
            ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO
        """
        cur.execute(sql, [limit, offset] + params_where)
        rows = cur.fetchall()

        # Count total + summary finansial
        sql_count = f"""
            SELECT
                COUNT(*),
                SUM(ai.INVOICEAMOUNT),
                SUM(ai.PAIDAMOUNT),
                SUM(ai.OWING)
            {_FPB_FROM}
            WHERE {where_sql}
        """
        cur.execute(sql_count, params_where)
        agg = cur.fetchone()
        con.close()

        data = _build_fpb_rows(rows)

        return jsonify({
            "data":          filter_record_columns("fpb", data),
            "total_rows":    len(data),
            "total_faktur":  int(agg[0]   or 0),
            "total_nilai":   float(agg[1] or 0),
            "total_paid":    float(agg[2] or 0),
            "total_owing":   float(agg[3] or 0),
        })

    except Exception as e:
        print(f"Error api_fpb: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


@app.route("/api/fpb/export")
@jwt_required()
def api_fpb_export():
    """Export SEMUA data FPB tanpa limit."""
    if not check_permission("fpb"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        status    = request.args.get("status", "")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        where_sql, params_where = _fpb_where_clause(search, date_from, date_to, status)

        sql = f"""
            SELECT {_FPB_SELECT}
            {_FPB_FROM}
            WHERE {where_sql}
            ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO
        """
        cur.execute(sql, params_where)
        rows = cur.fetchall()
        con.close()

        data = _build_fpb_rows(rows)
        return jsonify({"data": filter_record_columns("fpb", data), "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_fpb_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


# ─── EXPORT ENDPOINTS ────────────────────────────────────────────────────────

@app.route("/api/pembelian/export")
@jwt_required()
def api_pembelian_export():
    """Export SEMUA data PO Pembelian tanpa limit."""
    if not can_access_pembelian_request():
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        po_type   = request.args.get("po_type", "").strip().upper()
        exclude_internal_so = request.args.get("exclude_internal_so") in ("1", "true", "yes")

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        if exclude_internal_so:
            data, total_rows = build_liw_pur_mkt_rows(
                cur,
                search=search,
                date_from=date_from,
                date_to=date_to,
                po_type=po_type,
            )
            con.close()
            return jsonify({"data": filter_record_columns("pembelian", data), "total_rows": total_rows})

        conditions = ["1=1"]
        params_where = []

        if search:
            if exclude_internal_so:
                conditions.append("""(
                    LOWER(po.PONO)           CONTAINING LOWER(?)
                    OR LOWER(pd.NAME)        CONTAINING LOWER(?)
                    OR LOWER(rd.ITEMNO)      CONTAINING LOWER(?)
                    OR LOWER(rd.ITEMOVDESC)  CONTAINING LOWER(?)
                    OR LOWER(rq.REQNO)       CONTAINING LOWER(?)
                    OR LOWER(rd.ITEMRESERVED9) CONTAINING LOWER(?)
                )""")
            else:
                conditions.append("""(
                    LOWER(po.PONO)           CONTAINING LOWER(?)
                    OR LOWER(pd.NAME)        CONTAINING LOWER(?)
                    OR LOWER(det.ITEMNO)     CONTAINING LOWER(?)
                    OR LOWER(det.ITEMOVDESC) CONTAINING LOWER(?)
                    OR LOWER(rq.REQNO)       CONTAINING LOWER(?)
                    OR LOWER(det.ITEMRESERVED9) CONTAINING LOWER(?)
                )""")
            params_where += [search, search, search, search, search, search]

        if date_from:
            conditions.append("rq.REQDATE >= ?" if exclude_internal_so else "po.PODATE >= ?")
            params_where.append(date_from)
        if date_to:
            conditions.append("rq.REQDATE <= ?" if exclude_internal_so else "po.PODATE <= ?")
            params_where.append(date_to)
        po_type_prefixes = {
            "AI-S": "AI-S-",
            "AI-SRV": "AI-SRV",
            "AI-BM": "AI-BM",
            "AI-A": "AI-A",
        }
        if po_type in po_type_prefixes:
            conditions.append("UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH ?")
            params_where.append(po_type_prefixes[po_type])
        if exclude_internal_so:
            conditions.append("UPPER(TRIM(COALESCE(rd.ITEMRESERVED9, ''))) STARTING WITH 'AI-PP'")

        where_sql = " AND ".join(conditions)

        if exclude_internal_so:
            sql = f"""
                SELECT
                    po.PONO, po.PODATE, po.EXPECTED,
                    pd.PERSONNO, pd.NAME, COALESCE(po.DESCRIPTION, rq.DESCRIPTION),
                    rd.ITEMNO, COALESCE(rd.ITEMOVDESC, i.ITEMDESCRIPTION),
                    COALESCE(det.QUANTITY, rd.QUANTITY), rd.ITEMUNIT, det.UNITPRICE,
                    det.ITEMDISCPC, det.TAXCODES, det.TAXABLEAMOUNT1,
                    po.TAX1RATE,
                    COALESCE(det.QUANTITY, rd.QUANTITY) * COALESCE(det.UNITPRICE, 0) AS SUBTOTAL,
                    rq.REQNO,
                    rq.REQDATE,
                    rd.REQDATE AS TARGET_RECEIVED,
                    rd.ITEMRESERVED9,
                    (SELECT LIST(DISTINCT ai_recv.INVOICENO, ', ')
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    (SELECT MAX(ai_recv.INVOICEDATE)
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    det.ITEMRESERVED6,
                    po.CASHDISCOUNT,
                    po.CASHDISCPC,
                    (SELECT SUM(
                        COALESCE(det_sum.QUANTITY, 0) * COALESCE(det_sum.UNITPRICE, 0) *
                        (1 - (
                            CASE
                                WHEN TRIM(CAST(det_sum.ITEMDISCPC AS VARCHAR(32))) = '' THEN 0
                                ELSE COALESCE(CAST(det_sum.ITEMDISCPC AS DOUBLE PRECISION), 0)
                            END
                        ) / 100)
                     )
                     FROM PODET det_sum
                     WHERE det_sum.POID = po.POID),
                    po.TAX1AMOUNT,
                    po.TAX2AMOUNT,
                    po.FREIGHT,
                    tm.TERMNAME,
                    tm.NETDAYS,
                    COALESCE((
                        SELECT SUM(COALESCE(dp.INVOICEAMOUNT, 0))
                        FROM APINV dp
                        WHERE dp.ISDP = 1
                          AND (
                            UPPER(TRIM(dp.INVOICENO)) = UPPER(TRIM(po.PONO))
                            OR UPPER(TRIM(dp.INVOICENO)) STARTING WITH UPPER(TRIM(po.PONO) || '-')
                            OR EXISTS (
                                SELECT 1
                                FROM APDPDET apdp
                                WHERE apdp.DPID = dp.APINVOICEID
                                  AND apdp.POID = po.POID
                            )
                          )
                    ), 0) AS DP_AMOUNT
                FROM REQUISITION rq
                LEFT JOIN REQUISITIONDET rd ON rd.REQID = rq.REQID
                LEFT JOIN PODET det ON det.REQID = rq.REQID AND det.REQSEQ = rd.SEQ
                LEFT JOIN PO po ON po.POID = det.POID
                LEFT JOIN USERS u ON u.USERID = po.USERID
                LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
                LEFT JOIN ITEM i ON i.ITEMNO = rd.ITEMNO
                WHERE {where_sql}
                  AND rd.ITEMNO IS NOT NULL
                ORDER BY rq.REQDATE DESC, rq.REQNO, rd.SEQ
            """
        else:
            sql = f"""
                SELECT
                    po.PONO, po.PODATE, po.EXPECTED,
                    pd.PERSONNO, pd.NAME, po.DESCRIPTION,
                    det.ITEMNO, det.ITEMOVDESC,
                    det.QUANTITY, det.ITEMUNIT, det.UNITPRICE,
                    det.ITEMDISCPC, det.TAXCODES, det.TAXABLEAMOUNT1,
                    po.TAX1RATE,
                    det.QUANTITY * det.UNITPRICE AS SUBTOTAL,
                    rq.REQNO,
                    rq.REQDATE,
                    rd.REQDATE AS TARGET_RECEIVED,
                    det.ITEMRESERVED9,
                    (SELECT LIST(DISTINCT ai_recv.INVOICENO, ', ')
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    (SELECT MAX(ai_recv.INVOICEDATE)
                     FROM APINV ai_recv
                     JOIN APITMDET apdet_recv ON apdet_recv.APINVOICEID = ai_recv.APINVOICEID
                     WHERE apdet_recv.POID = det.POID
                       AND apdet_recv.POSEQ = det.SEQ
                    ),
                    det.ITEMRESERVED6,
                    po.CASHDISCOUNT,
                    po.CASHDISCPC,
                    (SELECT SUM(
                        COALESCE(det_sum.QUANTITY, 0) * COALESCE(det_sum.UNITPRICE, 0) *
                        (1 - (
                            CASE
                                WHEN TRIM(CAST(det_sum.ITEMDISCPC AS VARCHAR(32))) = '' THEN 0
                                ELSE COALESCE(CAST(det_sum.ITEMDISCPC AS DOUBLE PRECISION), 0)
                            END
                        ) / 100)
                     )
                     FROM PODET det_sum
                     WHERE det_sum.POID = po.POID),
                    po.TAX1AMOUNT,
                    po.TAX2AMOUNT,
                    po.FREIGHT,
                    tm.TERMNAME,
                    tm.NETDAYS,
                    COALESCE((
                        SELECT SUM(COALESCE(dp.INVOICEAMOUNT, 0))
                        FROM APINV dp
                        WHERE dp.ISDP = 1
                          AND (
                            UPPER(TRIM(dp.INVOICENO)) = UPPER(TRIM(po.PONO))
                            OR UPPER(TRIM(dp.INVOICENO)) STARTING WITH UPPER(TRIM(po.PONO) || '-')
                            OR EXISTS (
                                SELECT 1
                                FROM APDPDET apdp
                                WHERE apdp.DPID = dp.APINVOICEID
                                  AND apdp.POID = po.POID
                            )
                          )
                    ), 0) AS DP_AMOUNT
                FROM PO po
                LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
                LEFT JOIN USERS u ON u.USERID = po.USERID
                LEFT JOIN PODET det     ON det.POID = po.POID
                LEFT JOIN REQUISITION rq ON rq.REQID = det.REQID
                LEFT JOIN REQUISITIONDET rd ON rd.REQID = det.REQID AND rd.SEQ = det.REQSEQ
                LEFT JOIN TERMOPMT tm ON tm.TERMID = po.TERMID
                WHERE {where_sql}
                ORDER BY po.PODATE DESC, po.PONO, det.SEQ
            """
        cur.execute(sql, params_where)
        rows = cur.fetchall()
        sales_refs = _get_purchase_sales_reference_map(cur, rows) if exclude_internal_so else {}
        con.close()

        data = []
        for row in rows:
            qty      = float(row[8]  or 0)
            price    = float(row[10] or 0)
            disc_pc  = float(row[11] or 0)
            tax_rate = float(row[14] or 0)
            amounts = _purchase_amounts(qty, price, disc_pc, row[25] if len(row) > 25 else 0, row[23] if len(row) > 23 else 0, row[24] if len(row) > 24 else 0)
            ppn_amt  = float(row[13] or 0) if row[12] and str(row[12]).strip() else 0
            nilai_po = (
                float(row[25] or 0)
                + (float(row[26] or 0) if len(row) > 26 else 0)
                + (float(row[27] or 0) if len(row) > 27 else 0)
                + (float(row[28] or 0) if len(row) > 28 else 0)
            )
            uang_muka = float(row[31] or 0) if len(row) > 31 else 0
            sisa_po = max(nilai_po - uang_muka, 0)
            sales_ref = sales_refs.get((str(row[19] or "").strip().upper(), str(row[6] or "").strip()), {})
            data.append({
                "no_pembelian":     str(row[0] or "").strip(),
                "tgl_pembelian":    str(row[1]) if row[1] else "",
                "tgl_ekspetasi":    str(row[2]) if row[2] else "",
                "top":              str(row[29] or "").strip() if len(row) > 29 and row[29] else (f"{int(row[30])} Hari" if len(row) > 30 and row[30] is not None else ""),
                "no_permintaan":    str(row[16] or "").strip(),
                "tgl_permintaan":   str(row[17]) if row[17] else "",
                "tgl_target_permintaan": str(row[18]) if row[18] else "",
                "so_no":            str(row[19] or "").strip(),
                "no_penerimaan_barang": str(row[20] or "").strip(),
                "tgl_penerimaan_barang": str(row[21]) if row[21] else "",
                **sales_ref,
                "no_pemasok":       str(row[3] or "").strip(),
                "nama_pemasok":     str(row[4] or "").strip(),
                "purchaser":        str(row[22] or "").strip() if len(row) > 22 else "",
                "deskripsi":        str(row[5] or "").strip(),
                "no_barang":        str(row[6] or "").strip(),
                "deskripsi_barang": str(row[7] or "").strip(),
                "qty":              qty,
                "uom":              str(row[9]  or "").strip(),
                "price":            price,
                "disc_pct":         disc_pc,
                "diskon":           amounts["diskon"],
                "ppn_kode":         str(row[12] or "").strip(),
                "ppn_rate":         tax_rate,
                "ppn_amount":       round(ppn_amt, 2),
                "pph":              float(row[27] or 0) if len(row) > 27 else 0,
                "add_cost":         float(row[28] or 0) if len(row) > 28 else 0,
                "dpp":              amounts["dpp"],
                "amount":           amounts["amount"],
                "nilai_po":         round(nilai_po, 2),
                "uang_muka":        round(uang_muka, 2),
                "sisa_po":          round(sisa_po, 2),
                "status_pembayaran": "Lunas" if nilai_po > 0 and sisa_po <= 0.5 else ("DP" if uang_muka > 0 else "Belum DP"),
                "total_easy":       round(float(row[25] or 0), 2) if len(row) > 25 else amounts["amount"],
            })
        if exclude_internal_so:
            note_keys = [
                (
                    row.get("no_permintaan", ""),
                    row.get("so_no", ""),
                    row.get("no_pembelian", ""),
                    row.get("no_barang", ""),
                )
                for row in data
            ]
            note_map = get_liw_purchase_notes(note_keys)
            for row in data:
                key = (
                    row.get("no_permintaan", ""),
                    row.get("so_no", ""),
                    row.get("no_pembelian", ""),
                    row.get("no_barang", ""),
                )
                notes = note_map.get(key, {})
                row["note_pesanan"] = notes.get("note_pesanan", "") if isinstance(notes, dict) else ""
                row["note_pengiriman"] = notes.get("note_pengiriman", "") if isinstance(notes, dict) else ""

        return jsonify({"data": filter_record_columns("pembelian", data), "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_pembelian_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})


# ─── PENGIRIMAN BARANG (Delivery Order via ARINV + ARINVDET) ─────────────────
#
# Di Easy 6, Delivery Order tidak punya tabel header tersendiri —
# dokumen pengiriman dibuat dari ARINV dengan flag GETFROMDO atau DELIVERYORDER.
# Berdasarkan sample data: query via ARINVDET.SOID → SO untuk dapat No SO & Tgl SO.
#
# Field yang ditampilkan:
#   No Pengiriman  = ar.INVOICENO
#   Tgl Pengiriman = ar.INVOICEDATE
#   No Pelanggan   = pd.PERSONNO
#   Pelanggan      = pd.NAME
#   No PO          = ar.PURCHASEORDERNO
#   No Pesanan     = so.SONO
#   Tgl Pesanan    = so.SODATE
#   Deskripsi      = ar.DESCRIPTION
#   No Barang      = det.ITEMNO
#   Deskripsi Brg  = COALESCE(det.ITEMOVDESC, i.ITEMDESCRIPTION)
#   Qty            = det.QUANTITY
#   UoM            = det.ITEMUNIT

def _do_where_clause(search, date_from, date_to):
    conditions = ["ar.DELIVERYORDER IS NOT NULL AND TRIM(ar.DELIVERYORDER) <> ''"]
    params = []

    if search:
        conditions.append("""(
            LOWER(ar.INVOICENO)         CONTAINING LOWER(?)
            OR LOWER(pd.NAME)           CONTAINING LOWER(?)
            OR LOWER(ar.PURCHASEORDERNO) CONTAINING LOWER(?)
            OR LOWER(so.SONO)           CONTAINING LOWER(?)
            OR LOWER(det.ITEMNO)        CONTAINING LOWER(?)
            OR LOWER(det.ITEMOVDESC)    CONTAINING LOWER(?)
            OR LOWER(COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, '')) CONTAINING LOWER(?)
        )""")
        params += [search, search, search, search, search, search, search]

    if date_from:
        conditions.append("ar.INVOICEDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("ar.INVOICEDATE <= ?")
        params.append(date_to)

    return " AND ".join(conditions), params


_DO_SELECT = """
    ar.INVOICENO,
    ar.INVOICEDATE,
    pd.PERSONNO,
    pd.NAME,
    ar.PURCHASEORDERNO,
    so.SONO,
    so.SODATE,
    ar.DESCRIPTION,
    det.ITEMNO,
    COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
    det.QUANTITY,
    det.ITEMUNIT,
    ar.DELIVERYORDER,
    ar.ARINVOICEID,
    COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''),
    so.ESTSHIPDATE,
    COALESCE(sodet.QUANTITY, det.QUANTITY),
    det.QUANTITY,
    {stock_expr}
"""

_DO_FROM = """
    FROM ARINV ar
    LEFT JOIN PERSONDATA pd  ON pd.ID = ar.CUSTOMERID
    LEFT JOIN ARINVDET   det ON det.ARINVOICEID = ar.ARINVOICEID
    LEFT JOIN SO         so  ON so.SOID = det.SOID
    LEFT JOIN SODET      sodet ON sodet.SOID = det.SOID AND sodet.SEQ = det.SOSEQ
    LEFT JOIN SALESMAN   sm ON sm.SALESMANID = so.SALESMANID
    LEFT JOIN ITEM       i   ON i.ITEMNO = det.ITEMNO
"""


def _build_do_rows(rows):
    data = []
    for row in rows:
        data.append({
            "no_pengiriman":    str(row[0]  or "").strip(),
            "tgl_pengiriman":   str(row[1])  if row[1]  else "",
            "no_pelanggan":     str(row[2]  or "").strip(),
            "nama_pelanggan":   str(row[3]  or "").strip(),
            "no_po":            str(row[4]  or "").strip(),
            "no_pesanan":       str(row[5]  or "").strip(),
            "tgl_pesanan":      str(row[6])  if row[6]  else "",
            "deskripsi":        str(row[7]  or "").strip(),
            "no_barang":        str(row[8]  or "").strip(),
            "deskripsi_barang": str(row[9]  or "").strip(),
            "qty":              float(row[10] or 0),
            "uom":              str(row[11] or "").strip(),
            "no_do":            str(row[12] or "").strip(),
            "marketing":        str(row[14] or "").strip().title(),
            "tgl_estimasi_so":  str(row[15]) if row[15] else "",
            "qty_so":           float(row[16] or 0),
            "qty_shipped":      float(row[17] or 0),
            "stok_barang":      float(row[18] or 0),
        })
    return data


def _sales_delivery_monitor_where(
    search="",
    date_from="",
    date_to="",
    marketing="",
    keterangan_so="",
    status_do="",
):
    conditions = ["UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'"]
    params = []
    if search:
        conditions.append("""(
            LOWER(so.SONO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(pd.NAME, '')) CONTAINING LOWER(?)
            OR LOWER(COALESCE(so.PONO, '')) CONTAINING LOWER(?)
            OR LOWER(COALESCE(delivery_docs.INVOICENO, '')) CONTAINING LOWER(?)
            OR LOWER(sodet.ITEMNO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(sodet.ITEMOVDESC, i.ITEMDESCRIPTION, '')) CONTAINING LOWER(?)
            OR LOWER(COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, '')) CONTAINING LOWER(?)
        )""")
        params += [search] * 7
    if date_from:
        conditions.append("so.SODATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("so.SODATE <= ?")
        params.append(date_to)
    if marketing:
        conditions.append(
            "UPPER(TRIM(COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''))) = UPPER(?)"
        )
        params.append(marketing)
    if keterangan_so == "done":
        conditions.append("delivery_docs.INVOICENO IS NOT NULL")
    elif keterangan_so == "late":
        conditions.append(
            "delivery_docs.INVOICENO IS NULL AND so.ESTSHIPDATE < CURRENT_DATE"
        )
    elif keterangan_so == "today":
        conditions.append(
            "delivery_docs.INVOICENO IS NULL AND so.ESTSHIPDATE = CURRENT_DATE"
        )
    elif keterangan_so == "tomorrow":
        conditions.append(
            "delivery_docs.INVOICENO IS NULL AND so.ESTSHIPDATE = CURRENT_DATE + 1"
        )
    elif keterangan_so == "progress":
        conditions.append(
            "delivery_docs.INVOICENO IS NULL AND so.ESTSHIPDATE > CURRENT_DATE + 1"
        )
    elif keterangan_so == "empty":
        conditions.append(
            "delivery_docs.INVOICENO IS NULL AND so.ESTSHIPDATE IS NULL"
        )

    if status_do == "waiting":
        conditions.append("COALESCE(delivery_count.DELIVERY_COUNT, 0) = 0")
    elif status_do == "incomplete":
        conditions.append("""
            COALESCE(delivery_count.DELIVERY_COUNT, 0) > 0
            AND (
                COALESCE(delivery_status.MISSING_ITEM_COUNT, 0) > 0
                OR COALESCE(delivery_status.PARTIAL_ITEM_COUNT, 0) > 0
            )
        """)
    elif status_do == "complete":
        conditions.append("""
            COALESCE(delivery_count.DELIVERY_COUNT, 0) > 0
            AND COALESCE(delivery_status.MISSING_ITEM_COUNT, 0) = 0
            AND COALESCE(delivery_status.PARTIAL_ITEM_COUNT, 0) = 0
        """)
    return " AND ".join(conditions), params


def _sales_delivery_monitor_from():
    return """
        FROM SO so
        JOIN SODET sodet ON sodet.SOID = so.SOID
        LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
        LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
        LEFT JOIN ITEM i ON i.ITEMNO = sodet.ITEMNO
        LEFT JOIN (
            SELECT
                det.SOID,
                det.SOSEQ,
                det.ITEMNO,
                LIST(DISTINCT ar.INVOICENO, ', ') AS INVOICENO,
                MAX(ar.INVOICEDATE) AS INVOICEDATE
            FROM ARINV ar
            JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            WHERE ar.DELIVERYORDER IS NOT NULL
              AND TRIM(ar.DELIVERYORDER) <> ''
            GROUP BY det.SOID, det.SOSEQ, det.ITEMNO
        ) delivery_docs
          ON delivery_docs.SOID = so.SOID
         AND delivery_docs.SOSEQ = sodet.SEQ
         AND delivery_docs.ITEMNO = sodet.ITEMNO
        LEFT JOIN (
            SELECT
                sd.SOID,
                SUM(CASE
                    WHEN COALESCE(sd.QUANTITY, 0) > 0
                     AND COALESCE(sd.QTYSHIPPED, 0) <= 0
                    THEN 1 ELSE 0
                END) AS MISSING_ITEM_COUNT,
                SUM(CASE
                    WHEN COALESCE(sd.QTYSHIPPED, 0) > 0
                     AND COALESCE(sd.QTYSHIPPED, 0) < COALESCE(sd.QUANTITY, 0)
                    THEN COALESCE(sd.QUANTITY, 0) - COALESCE(sd.QTYSHIPPED, 0)
                    ELSE 0
                END) AS PARTIAL_QTY_SHORTAGE,
                SUM(CASE
                    WHEN COALESCE(sd.QTYSHIPPED, 0) > 0
                     AND COALESCE(sd.QTYSHIPPED, 0) < COALESCE(sd.QUANTITY, 0)
                    THEN 1 ELSE 0
                END) AS PARTIAL_ITEM_COUNT
            FROM SODET sd
            GROUP BY sd.SOID
        ) delivery_status
          ON delivery_status.SOID = so.SOID
        LEFT JOIN (
            SELECT
                delivery_det.SOID,
                COUNT(DISTINCT delivery_ar.ARINVOICEID) AS DELIVERY_COUNT
            FROM ARINV delivery_ar
            JOIN ARINVDET delivery_det
              ON delivery_det.ARINVOICEID = delivery_ar.ARINVOICEID
            WHERE delivery_ar.DELIVERYORDER IS NOT NULL
              AND TRIM(delivery_ar.DELIVERYORDER) <> ''
            GROUP BY delivery_det.SOID
        ) delivery_count
          ON delivery_count.SOID = so.SOID
    """


def _sales_delivery_status(qty_so, qty_shipped):
    qty_so = float(qty_so or 0)
    qty_shipped = float(qty_shipped or 0)
    if qty_so > 0 and qty_shipped >= qty_so:
        return "Diterima"
    if qty_shipped > 0:
        return "Diproses"
    return "Menunggu"


def _format_delivery_shortage(value):
    number = float(value or 0)
    if number.is_integer():
        return str(int(number))
    return f"{number:.2f}".rstrip("0").rstrip(".")


def _sales_delivery_do_status(delivery_count, missing_items, partial_qty, partial_items):
    if int(delivery_count or 0) <= 0:
        return "Menunggu"

    missing_items = int(missing_items or 0)
    partial_items = int(partial_items or 0)
    partial_qty = float(partial_qty or 0)
    parts = []
    if missing_items > 0:
        parts.append(f"Kurang {missing_items} item")
    if partial_items > 0 and partial_qty > 0:
        qty_label = _format_delivery_shortage(partial_qty)
        parts.append(f"Kurang {qty_label} qty" if missing_items > 0 else f"Kurang {qty_label}")
    return " + ".join(parts) if parts else "Lengkap"


def _sales_delivery_age(estimated_date):
    if not estimated_date:
        return None
    return (estimated_date - datetime.now().date()).days


def _sales_delivery_age_label(age, has_delivery=False):
    if has_delivery:
        return "Selesai"
    if age is None:
        return ""
    if age < 0:
        return "Late"
    if age == 0:
        return "DT Hari Ini"
    if age == 1:
        return "DT Besok"
    return "On Progress"


def _build_sales_delivery_monitor_rows(rows):
    data = []
    for row in rows:
        age = _sales_delivery_age(row[3])
        row_key = f"{int(row[15])}:{int(row[16])}"
        data.append({
            "marketing": str(row[0] or "").strip().title(),
            "no_pesanan": str(row[1] or "").strip(),
            "tgl_pesanan": str(row[2]) if row[2] else "",
            "tgl_estimasi_so": str(row[3]) if row[3] else "",
            "no_pelanggan": str(row[4] or "").strip(),
            "nama_pelanggan": str(row[5] or "").strip(),
            "no_po": str(row[6] or "").strip(),
            "no_pengiriman": str(row[7] or "").strip(),
            "tgl_pengiriman": str(row[8]) if row[8] else "",
            "no_barang": str(row[9] or "").strip(),
            "deskripsi_barang": str(row[10] or "").strip(),
            "qty_so": float(row[11] or 0),
            "qty_shipped": float(row[12] or 0),
            "stok_barang": float(row[13] or 0),
            "uom": str(row[14] or "").strip(),
            "status_so": _sales_delivery_status(row[11], row[12]),
            "status_do": _sales_delivery_do_status(row[20], row[17], row[18], row[19]),
            "umur": age,
            "keterangan_so": _sales_delivery_age_label(age, bool(row[7])),
            "row_key": row_key,
            "no_do": str(row[7] or "").strip(),
            "deskripsi": "",
        })
    remark_map = get_sales_delivery_remarks([row["row_key"] for row in data])
    for row in data:
        saved = remark_map.get(row["row_key"], {})
        row["remark"] = saved.get("remark", "")
        row["remark_updated_by"] = saved.get("updated_by", "")
        row["remark_updated_at"] = saved.get("updated_at", "")
    return data


def _is_delivery_number_search(search):
    value = str(search or "").strip().upper()
    if not value:
        return False
    compact = value.replace(" ", "")
    return (
        "DO-" in compact
        or compact.startswith("AI-DO")
        or compact.startswith("GTE-DO")
        or compact.startswith("TDO")
    )


def _api_penjualan_do_by_delivery_number(
    cur,
    search,
    date_from,
    date_to,
    marketing,
    offset,
    limit,
):
    """Fast path for searches like AI-DO-xxxx without building the full SO monitor."""
    conditions = [
        "ar.DELIVERYORDER IS NOT NULL",
        "TRIM(ar.DELIVERYORDER) <> ''",
        "UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'",
        "LOWER(COALESCE(ar.INVOICENO, '')) CONTAINING LOWER(?)",
    ]
    params = [search]
    if date_from:
        conditions.append("so.SODATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("so.SODATE <= ?")
        params.append(date_to)
    if marketing:
        conditions.append(
            "UPPER(TRIM(COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''))) = UPPER(?)"
        )
        params.append(marketing)

    where_sql = " AND ".join(conditions)
    stock_expr = _centre_stock_expr("i.ITEMNO")
    missing_count_expr = """
        (
            SELECT SUM(CASE
                WHEN COALESCE(sd.QUANTITY, 0) > 0
                 AND COALESCE(sd.QTYSHIPPED, 0) <= 0
                THEN 1 ELSE 0
            END)
            FROM SODET sd
            WHERE sd.SOID = so.SOID
        )
    """
    partial_qty_expr = """
        (
            SELECT SUM(CASE
                WHEN COALESCE(sd.QTYSHIPPED, 0) > 0
                 AND COALESCE(sd.QTYSHIPPED, 0) < COALESCE(sd.QUANTITY, 0)
                THEN COALESCE(sd.QUANTITY, 0) - COALESCE(sd.QTYSHIPPED, 0)
                ELSE 0
            END)
            FROM SODET sd
            WHERE sd.SOID = so.SOID
        )
    """
    partial_count_expr = """
        (
            SELECT SUM(CASE
                WHEN COALESCE(sd.QTYSHIPPED, 0) > 0
                 AND COALESCE(sd.QTYSHIPPED, 0) < COALESCE(sd.QUANTITY, 0)
                THEN 1 ELSE 0
            END)
            FROM SODET sd
            WHERE sd.SOID = so.SOID
        )
    """
    delivery_count_expr = """
        (
            SELECT COUNT(DISTINCT ar2.ARINVOICEID)
            FROM ARINV ar2
            JOIN ARINVDET det2 ON det2.ARINVOICEID = ar2.ARINVOICEID
            WHERE det2.SOID = so.SOID
              AND ar2.DELIVERYORDER IS NOT NULL
              AND TRIM(ar2.DELIVERYORDER) <> ''
        )
    """

    sql = f"""
        SELECT FIRST ? SKIP ?
            COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''),
            so.SONO,
            so.SODATE,
            so.ESTSHIPDATE,
            pd.PERSONNO,
            pd.NAME,
            so.PONO,
            ar.INVOICENO,
            ar.INVOICEDATE,
            sodet.ITEMNO,
            COALESCE(NULLIF(TRIM(sodet.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
            sodet.QUANTITY,
            sodet.QTYSHIPPED,
            {stock_expr},
            sodet.ITEMUNIT,
            so.SOID,
            sodet.SEQ,
            {missing_count_expr},
            {partial_qty_expr},
            {partial_count_expr},
            {delivery_count_expr}
        FROM ARINV ar
        JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
        JOIN SO so ON so.SOID = det.SOID
        JOIN SODET sodet ON sodet.SOID = det.SOID AND sodet.SEQ = det.SOSEQ
        LEFT JOIN PERSONDATA pd ON pd.ID = so.CUSTOMERID
        LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
        LEFT JOIN ITEM i ON i.ITEMNO = sodet.ITEMNO
        WHERE {where_sql}
        ORDER BY so.SODATE DESC, so.SONO, sodet.SEQ
    """
    cur.execute(sql, [limit, offset] + params)
    rows = cur.fetchall()

    cur.execute(f"""
        SELECT COUNT(*)
        FROM ARINV ar
        JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
        JOIN SO so ON so.SOID = det.SOID
        JOIN SODET sodet ON sodet.SOID = det.SOID AND sodet.SEQ = det.SOSEQ
        LEFT JOIN SALESMAN sm ON sm.SALESMANID = so.SALESMANID
        WHERE {where_sql}
    """, params)
    total_rows = int((cur.fetchone() or [0])[0] or 0)

    data = _build_sales_delivery_monitor_rows(rows)
    so_summary = {}
    for row in data:
        so_summary.setdefault(row["no_pesanan"], row["status_do"])
    total_so = len(so_summary)
    waiting_so = sum(1 for status in so_summary.values() if status == "Menunggu")
    complete_so = sum(1 for status in so_summary.values() if status == "Lengkap")
    incomplete_so = total_so - waiting_so - complete_so
    marketing_options = sorted({
        row["marketing"] for row in data if row.get("marketing")
    })

    return {
        "data": filter_record_columns("penjualan_do", data),
        "total_rows": total_rows,
        "total_do": total_so,
        "summary": {
            "total_so": total_so,
            "waiting_so": waiting_so,
            "incomplete_so": incomplete_so,
            "complete_so": complete_so,
        },
        "marketing_options": marketing_options,
    }


@app.route("/api/penjualan-do")
@jwt_required()
def api_penjualan_do():
    """Daftar Pengiriman Barang dengan pagination."""
    if not check_permission("penjualan_do"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        marketing = request.args.get("marketing", "").strip()
        keterangan_so = request.args.get("keterangan_so", "").strip().lower()
        status_do = request.args.get("status_do", "").strip().lower()
        offset    = int(request.args.get("offset", 0))
        limit     = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        if (
            _is_delivery_number_search(search)
            and not keterangan_so
            and not status_do
        ):
            payload = _api_penjualan_do_by_delivery_number(
                cur, search, date_from, date_to, marketing, offset, limit
            )
            con.close()
            return jsonify(payload)

        where_sql, params_where = _sales_delivery_monitor_where(
            search, date_from, date_to, marketing, keterangan_so, status_do
        )
        from_sql = _sales_delivery_monitor_from()
        stock_expr = _centre_stock_expr("i.ITEMNO")

        sql = f"""
            SELECT FIRST ? SKIP ?
                COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''),
                so.SONO,
                so.SODATE,
                so.ESTSHIPDATE,
                pd.PERSONNO,
                pd.NAME,
                so.PONO,
                delivery_docs.INVOICENO,
                delivery_docs.INVOICEDATE,
                sodet.ITEMNO,
                COALESCE(NULLIF(TRIM(sodet.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                sodet.QUANTITY,
                sodet.QTYSHIPPED,
                {stock_expr},
                sodet.ITEMUNIT,
                so.SOID,
                sodet.SEQ,
                delivery_status.MISSING_ITEM_COUNT,
                delivery_status.PARTIAL_QTY_SHORTAGE,
                delivery_status.PARTIAL_ITEM_COUNT,
                delivery_count.DELIVERY_COUNT
            {from_sql}
            WHERE {where_sql}
            ORDER BY so.SODATE DESC, so.SONO, sodet.SEQ
        """
        cur.execute(sql, [limit, offset] + params_where)
        rows = cur.fetchall()

        # Ringkasan dihitung per SO, bukan per baris item.
        sql_count = f"""
            SELECT DISTINCT
                so.SOID,
                delivery_status.MISSING_ITEM_COUNT,
                delivery_status.PARTIAL_ITEM_COUNT,
                delivery_count.DELIVERY_COUNT
            {from_sql}
            WHERE {where_sql}
        """
        cur.execute(sql_count, params_where)
        summary_rows = cur.fetchall()
        total_so = len(summary_rows)
        waiting_so = sum(1 for row in summary_rows if int(row[3] or 0) <= 0)
        incomplete_so = sum(
            1 for row in summary_rows
            if int(row[3] or 0) > 0
            and (int(row[1] or 0) > 0 or int(row[2] or 0) > 0)
        )
        complete_so = total_so - waiting_so - incomplete_so

        sql_total_rows = f"""
            SELECT COUNT(*)
            {from_sql}
            WHERE {where_sql}
        """
        cur.execute(sql_total_rows, params_where)
        total_rows = int((cur.fetchone() or [0])[0] or 0)

        option_where, option_params = _sales_delivery_monitor_where(
            search, date_from, date_to, "", keterangan_so, status_do
        )
        cur.execute(f"""
            SELECT DISTINCT COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, '')
            {from_sql}
            WHERE {option_where}
            ORDER BY 1
        """, option_params)
        marketing_options = [
            str(row[0] or "").strip().title()
            for row in cur.fetchall()
            if str(row[0] or "").strip()
        ]

        con.close()

        data = _build_sales_delivery_monitor_rows(rows)
        return jsonify({
            "data":      filter_record_columns("penjualan_do", data),
            "total_rows": total_rows,
            "total_do": total_so,
            "summary": {
                "total_so": total_so,
                "waiting_so": waiting_so,
                "incomplete_so": incomplete_so,
                "complete_so": complete_so,
            },
            "marketing_options": marketing_options,
        })

    except Exception as e:
        print(f"Error api_penjualan_do: {e}")
        return jsonify({
            "data": [],
            "total_rows": 0,
            "total_do": 0,
            "summary": {
                "total_so": 0,
                "waiting_so": 0,
                "incomplete_so": 0,
                "complete_so": 0,
            },
            "marketing_options": [],
            "error": str(e),
        })


@app.route("/api/penjualan-do/remark", methods=["POST"])
@jwt_required()
def api_penjualan_do_remark_save():
    if not check_permission("penjualan_do"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        payload = request.get_json(silent=True) or {}
        row_key = str(payload.get("row_key") or "").strip()
        remark = str(payload.get("remark") or "").strip()
        if not re.fullmatch(r"\d+:\d+", row_key):
            return jsonify({"message": "Identitas baris pengiriman tidak valid."}), 400
        if len(remark) > 500:
            return jsonify({"message": "Remaks maksimal 500 karakter."}), 400

        soid, soseq = [int(value) for value in row_key.split(":", 1)]
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 so.SONO
            FROM SO so
            JOIN SODET sodet ON sodet.SOID = so.SOID
            WHERE so.SOID = ? AND sodet.SEQ = ?
              AND UPPER(TRIM(COALESCE(so.SONO, ''))) STARTING WITH 'AI-PP-'
        """, [soid, soseq])
        valid_row = cur.fetchone()
        con.close()
        if not valid_row:
            return jsonify({"message": "Baris pengiriman tidak ditemukan."}), 404

        user = get_current_user()
        saved = save_sales_delivery_remark(row_key, remark, user.get("username"))
        audit_current_user(
            "sales_delivery_remark_update",
            "penjualan_do",
            f"Update remaks {str(valid_row[0] or '').strip()} baris {soseq}",
            saved,
        )
        return jsonify({"message": "Remaks disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_penjualan_do_remark_save: {e}")
        return jsonify({"message": "Gagal menyimpan remaks.", "error": str(e)}), 500


@app.route("/api/penjualan-do/export")
@jwt_required()
def api_penjualan_do_export():
    """Export SEMUA data Pengiriman tanpa limit."""
    if not check_permission("penjualan_do"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search    = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to   = request.args.get("date_to", "")
        marketing = request.args.get("marketing", "").strip()
        keterangan_so = request.args.get("keterangan_so", "").strip().lower()
        status_do = request.args.get("status_do", "").strip().lower()

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        where_sql, params_where = _sales_delivery_monitor_where(
            search, date_from, date_to, marketing, keterangan_so, status_do
        )
        from_sql = _sales_delivery_monitor_from()
        stock_expr = _centre_stock_expr("i.ITEMNO")

        sql = f"""
            SELECT
                COALESCE(sm.FIRSTNAME || ' ' || sm.LASTNAME, ''),
                so.SONO,
                so.SODATE,
                so.ESTSHIPDATE,
                pd.PERSONNO,
                pd.NAME,
                so.PONO,
                delivery_docs.INVOICENO,
                delivery_docs.INVOICEDATE,
                sodet.ITEMNO,
                COALESCE(NULLIF(TRIM(sodet.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                sodet.QUANTITY,
                sodet.QTYSHIPPED,
                {stock_expr},
                sodet.ITEMUNIT,
                so.SOID,
                sodet.SEQ,
                delivery_status.MISSING_ITEM_COUNT,
                delivery_status.PARTIAL_QTY_SHORTAGE,
                delivery_status.PARTIAL_ITEM_COUNT,
                delivery_count.DELIVERY_COUNT
            {from_sql}
            WHERE {where_sql}
            ORDER BY so.SODATE DESC, so.SONO, sodet.SEQ
        """
        cur.execute(sql, params_where)
        rows = cur.fetchall()
        con.close()

        data = _build_sales_delivery_monitor_rows(rows)
        return jsonify({"data": filter_record_columns("penjualan_do", data), "total_rows": len(data)})

    except Exception as e:
        print(f"Error api_penjualan_do_export: {e}")
        return jsonify({"data": [], "total_rows": 0, "error": str(e)})



# ─── DAFTAR INVOICE PENJUALAN ─────────────────────────────────────────────────
#
DELIVERY_DOCUMENT_TYPES = {
    "Delivery Order",
    "Good Receipt",
    "Sample Request",
    "TDO",
    "Surat Jalan Lainnya",
}


def _delivery_time_where(search="", date_from="", date_to=""):
    conditions = [
        "TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) = '1'",
    ]
    params = []
    if search:
        conditions.append("""(
            LOWER(ar.INVOICENO) CONTAINING LOWER(?)
            OR LOWER(COALESCE(refs.SONO, '')) CONTAINING LOWER(?)
            OR LOWER(COALESCE(ar.PURCHASEORDERNO, refs.SO_PONO, '')) CONTAINING LOWER(?)
            OR LOWER(COALESCE(pd.NAME, '')) CONTAINING LOWER(?)
        )""")
        params += [search] * 4
    if date_from:
        conditions.append("ar.INVOICEDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("ar.INVOICEDATE <= ?")
        params.append(date_to)
    return " AND ".join(conditions), params


def _delivery_time_from():
    return """
        FROM ARINV ar
        LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
        LEFT JOIN (
            SELECT
                det.ARINVOICEID,
                LIST(DISTINCT so.SONO, ', ') AS SONO,
                LIST(DISTINCT so.PONO, ', ') AS SO_PONO
            FROM ARINVDET det
            LEFT JOIN SO so ON so.SOID = det.SOID
            GROUP BY det.ARINVOICEID
        ) refs ON refs.ARINVOICEID = ar.ARINVOICEID
    """


def _build_delivery_time_rows(rows):
    data = [{
        "arinvoice_id": int(row[0]),
        "no_pengiriman": str(row[1] or "").strip(),
        "tgl_pengiriman": str(row[2]) if row[2] else "",
        "no_so": str(row[3] or "").strip(),
        "no_po": str(row[4] or "").strip(),
        "customer": str(row[5] or "").strip(),
    } for row in rows]
    manual_map = get_delivery_time_tracking([row["arinvoice_id"] for row in data])
    empty_manual = {
        "jenis_dokumen": "",
        "remarks_do": "",
        "expedition": "",
        "ket_pengiriman": "",
        "resi": "",
        "etd": "",
        "eta_cust": "",
        "receive_date": "",
        "status_pengiriman": "",
        "target_do_kembali": "",
        "do_kembali": "",
        "status_do_kembali": "",
        "isue_pengiriman": "",
        "updated_by": "",
        "updated_at": "",
    }
    for row in data:
        row.update(manual_map.get(row["arinvoice_id"], empty_manual))
        row["status_pengiriman"] = _delivery_date_status(
            row.get("eta_cust"),
            row.get("receive_date"),
        )
        row["status_do_kembali"] = _delivery_return_status(
            row.get("target_do_kembali"),
            row.get("do_kembali"),
        )
    return data


def _delivery_date_status(target_date, actual_date):
    if not target_date or not actual_date:
        return ""
    try:
        target = datetime.strptime(str(target_date), "%Y-%m-%d").date()
        actual = datetime.strptime(str(actual_date), "%Y-%m-%d").date()
    except ValueError:
        return ""
    difference = (target - actual).days
    if difference >= 0:
        return f"Ontime {difference} hari"
    return f"Late {abs(difference)} hari"


def _delivery_return_status(target_date, return_date):
    return _delivery_date_status(target_date, return_date)


def _parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


@app.route("/api/kpi/time-on-delivery")
@jwt_required()
def api_kpi_time_on_delivery():
    if not check_permission("kpi_time_on_delivery"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        current_year = datetime.now().year
        year = int(request.args.get("year", current_year))
        if year < 2000 or year > current_year + 1:
            return jsonify({"message": "Tahun KPI tidak valid."}), 400

        date_from = f"{year:04d}-01-01"
        date_to = f"{year + 1:04d}-01-01"
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT ar.ARINVOICEID, ar.INVOICEDATE
            FROM ARINV ar
            WHERE TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) = '1'
              AND ar.INVOICEDATE >= ?
              AND ar.INVOICEDATE < ?
            ORDER BY ar.INVOICEDATE, ar.ARINVOICEID
        """, [date_from, date_to])
        delivery_rows = cur.fetchall()
        cur.execute("""
            SELECT DISTINCT EXTRACT(YEAR FROM ar.INVOICEDATE)
            FROM ARINV ar
            WHERE TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) = '1'
              AND ar.INVOICEDATE IS NOT NULL
            ORDER BY 1 DESC
        """)
        available_years = sorted(
            {int(row[0]) for row in cur.fetchall()} | {year},
            reverse=True,
        )
        con.close()

        manual_map = get_delivery_time_tracking([row[0] for row in delivery_rows])
        result = [{
            "month": month,
            "target": 0,
            "pengiriman_lebih_cepat": 0,
            "tepat_waktu": 0,
            "telat_1_hari": 0,
            "telat_2_hari_atau_lebih": 0,
            "outstanding": 0,
            "total": 0,
            "pencapaian": 0.0,
            "on_time_diterima": 0,
            "on_time_outstanding": 0,
            "late_diterima": 0,
            "late_outstanding": 0,
            "on_time_percentage": 0.0,
            "late_percentage": 0.0,
            "target_percentage": 90,
        } for month in range(1, 13)]
        today = datetime.now().date()

        for arinvoice_id, do_date in delivery_rows:
            month = do_date.month
            metric = result[month - 1]
            metric["target"] += 1
            tracking = manual_map.get(int(arinvoice_id), {})
            eta_date = _parse_iso_date(tracking.get("eta_cust"))
            receive_date = _parse_iso_date(tracking.get("receive_date"))

            if receive_date and eta_date:
                h_limit = (eta_date - receive_date).days
                if h_limit > 0:
                    metric["pengiriman_lebih_cepat"] += 1
                elif h_limit == 0:
                    metric["tepat_waktu"] += 1
                elif h_limit == -1:
                    metric["telat_1_hari"] += 1
                else:
                    metric["telat_2_hari_atau_lebih"] += 1
                key = "on_time_diterima" if receive_date <= eta_date else "late_diterima"
                metric[key] += 1
            else:
                metric["outstanding"] += 1
                if eta_date:
                    key = "late_outstanding" if eta_date < today else "on_time_outstanding"
                    metric[key] += 1

        for metric in result:
            target = metric["target"]
            on_time = metric["on_time_diterima"] + metric["on_time_outstanding"]
            late = metric["late_diterima"] + metric["late_outstanding"]
            metric["total"] = (
                metric["pengiriman_lebih_cepat"]
                + metric["tepat_waktu"]
                + metric["telat_1_hari"]
                + metric["telat_2_hari_atau_lebih"]
                + metric["outstanding"]
            )
            if target:
                metric["on_time_percentage"] = round(on_time / target * 100, 2)
                metric["late_percentage"] = round(late / target * 100, 2)
            if metric["total"]:
                weighted_score = (
                    metric["pengiriman_lebih_cepat"] * 125
                    + metric["tepat_waktu"] * 100
                    + metric["telat_1_hari"] * 80
                    + metric["telat_2_hari_atau_lebih"] * 50
                )
                metric["pencapaian"] = round(weighted_score / metric["total"], 2)

        return jsonify({
            "data": result,
            "year": year,
            "available_years": available_years,
            "as_of_date": today.isoformat(),
        })
    except (TypeError, ValueError):
        return jsonify({"message": "Tahun KPI tidak valid."}), 400
    except Exception as e:
        print(f"Error api_kpi_time_on_delivery: {e}")
        return jsonify({
            "message": "Gagal memuat KPI Time On Delivery.",
            "data": [],
            "error": str(e),
        }), 500


@app.route("/api/kpi/delivery-back")
@jwt_required()
def api_kpi_delivery_back():
    if not check_permission("kpi_time_on_delivery"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        current_year = datetime.now().year
        year = int(request.args.get("year", current_year))
        if year < 2000 or year > current_year + 1:
            return jsonify({"message": "Tahun KPI tidak valid."}), 400

        date_from = f"{year:04d}-01-01"
        date_to = f"{year + 1:04d}-01-01"
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT ar.ARINVOICEID, ar.INVOICEDATE
            FROM ARINV ar
            WHERE TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) = '1'
              AND ar.INVOICEDATE >= ?
              AND ar.INVOICEDATE < ?
            ORDER BY ar.INVOICEDATE, ar.ARINVOICEID
        """, [date_from, date_to])
        delivery_rows = cur.fetchall()
        cur.execute("""
            SELECT DISTINCT EXTRACT(YEAR FROM ar.INVOICEDATE)
            FROM ARINV ar
            WHERE TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) = '1'
              AND ar.INVOICEDATE IS NOT NULL
            ORDER BY 1 DESC
        """)
        available_years = sorted(
            {int(row[0]) for row in cur.fetchall()} | {year},
            reverse=True,
        )
        con.close()

        manual_map = get_delivery_time_tracking([row[0] for row in delivery_rows])
        result = [{
            "month": month,
            "target": 0,
            "pengiriman_lebih_cepat": 0,
            "tepat_waktu": 0,
            "telat_1_hari": 0,
            "telat_2_hari_atau_lebih": 0,
            "outstanding": 0,
            "total": 0,
            "pencapaian": 0.0,
            "on_time_diterima": 0,
            "on_time_outstanding": 0,
            "late_diterima": 0,
            "late_outstanding": 0,
            "on_time_percentage": 0.0,
            "late_percentage": 0.0,
            "target_percentage": 90,
        } for month in range(1, 13)]
        today = datetime.now().date()

        for arinvoice_id, do_date in delivery_rows:
            tracking = manual_map.get(int(arinvoice_id), {})
            target_date = _parse_iso_date(tracking.get("target_do_kembali"))
            if not target_date:
                continue

            metric = result[do_date.month - 1]
            metric["target"] += 1
            return_date = _parse_iso_date(tracking.get("do_kembali"))

            if return_date:
                h_limit = (target_date - return_date).days
                if h_limit > 0:
                    metric["pengiriman_lebih_cepat"] += 1
                elif h_limit == 0:
                    metric["tepat_waktu"] += 1
                elif h_limit == -1:
                    metric["telat_1_hari"] += 1
                else:
                    metric["telat_2_hari_atau_lebih"] += 1
                key = "on_time_diterima" if return_date <= target_date else "late_diterima"
                metric[key] += 1
            else:
                metric["outstanding"] += 1
                key = "late_outstanding" if target_date < today else "on_time_outstanding"
                metric[key] += 1

        for metric in result:
            target = metric["target"]
            on_time = metric["on_time_diterima"] + metric["on_time_outstanding"]
            late = metric["late_diterima"] + metric["late_outstanding"]
            metric["total"] = (
                metric["pengiriman_lebih_cepat"]
                + metric["tepat_waktu"]
                + metric["telat_1_hari"]
                + metric["telat_2_hari_atau_lebih"]
                + metric["outstanding"]
            )
            if target:
                metric["on_time_percentage"] = round(on_time / target * 100, 2)
                metric["late_percentage"] = round(late / target * 100, 2)
                weighted_score = (
                    metric["pengiriman_lebih_cepat"] * 125
                    + metric["tepat_waktu"] * 100
                    + metric["telat_1_hari"] * 75
                    + metric["telat_2_hari_atau_lebih"] * 50
                )
                metric["pencapaian"] = round(weighted_score / target, 2)

        return jsonify({
            "data": result,
            "year": year,
            "available_years": available_years,
            "as_of_date": today.isoformat(),
        })
    except (TypeError, ValueError):
        return jsonify({"message": "Tahun KPI tidak valid."}), 400
    except Exception as e:
        print(f"Error api_kpi_delivery_back: {e}")
        return jsonify({
            "message": "Gagal memuat KPI Delivery Back.",
            "data": [],
            "error": str(e),
        }), 500


@app.route("/api/waktu-pengiriman")
@jwt_required()
def api_delivery_time():
    if not check_permission("waktu_pengiriman"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "").strip()
        date_from = request.args.get("date_from", "").strip()
        date_to = request.args.get("date_to", "").strip()
        offset = max(int(request.args.get("offset", 0)), 0)
        limit = min(max(int(request.args.get("limit", 50)), 1), 500)

        where_sql, params = _delivery_time_where(search, date_from, date_to)
        from_sql = _delivery_time_from()
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                ar.ARINVOICEID,
                ar.INVOICENO,
                ar.INVOICEDATE,
                refs.SONO,
                COALESCE(NULLIF(TRIM(ar.PURCHASEORDERNO), ''), refs.SO_PONO),
                pd.NAME
            {from_sql}
            WHERE {where_sql}
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO DESC
        """, [limit, offset] + params)
        rows = cur.fetchall()
        cur.execute(f"""
            SELECT COUNT(*)
            {from_sql}
            WHERE {where_sql}
        """, params)
        total = int((cur.fetchone() or [0])[0] or 0)
        con.close()

        data = _build_delivery_time_rows(rows)
        return jsonify({
            "data": filter_record_columns("waktu_pengiriman", data),
            "total": total,
        })
    except Exception as e:
        print(f"Error api_delivery_time: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)}), 500


@app.route("/api/waktu-pengiriman/manual", methods=["POST"])
@jwt_required()
def api_delivery_time_manual_save():
    if not check_permission("waktu_pengiriman"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        payload = request.get_json(silent=True) or {}
        arinvoice_id = payload.get("arinvoice_id")
        if not str(arinvoice_id or "").isdigit():
            return jsonify({"message": "Identitas transaksi pengiriman tidak valid."}), 400

        document_type = str(payload.get("jenis_dokumen") or "").strip()
        if document_type and document_type not in DELIVERY_DOCUMENT_TYPES:
            return jsonify({"message": "Jenis dokumen tidak valid."}), 400

        for field in (
            "etd", "eta_cust", "receive_date",
            "target_do_kembali", "do_kembali",
        ):
            value = str(payload.get(field) or "").strip()
            if value:
                try:
                    datetime.strptime(value, "%Y-%m-%d")
                except ValueError:
                    return jsonify({"message": f"Format tanggal {field} tidak valid."}), 400

        for field in (
            "remarks_do", "expedition", "ket_pengiriman",
            "resi", "isue_pengiriman",
        ):
            if len(str(payload.get(field) or "")) > 1000:
                return jsonify({"message": "Input manual maksimal 1000 karakter."}), 400

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 INVOICENO
            FROM ARINV
            WHERE ARINVOICEID = ?
              AND TRIM(CAST(DELIVERYORDER AS VARCHAR(32))) = '1'
        """, [int(arinvoice_id)])
        valid_row = cur.fetchone()
        con.close()
        if not valid_row:
            return jsonify({"message": "Transaksi pengiriman tidak ditemukan."}), 404

        user = get_current_user()
        saved = save_delivery_time_tracking(
            int(arinvoice_id),
            payload,
            user.get("username"),
        )
        saved["status_pengiriman"] = _delivery_date_status(
            saved.get("eta_cust"),
            saved.get("receive_date"),
        )
        saved["status_do_kembali"] = _delivery_return_status(
            saved.get("target_do_kembali"),
            saved.get("do_kembali"),
        )
        audit_current_user(
            "delivery_time_update",
            "waktu_pengiriman",
            f"Update Waktu Pengiriman {str(valid_row[0] or '').strip()}",
            saved,
        )
        return jsonify({"message": "Data Waktu Pengiriman disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_delivery_time_manual_save: {e}")
        return jsonify({"message": "Gagal menyimpan Waktu Pengiriman.", "error": str(e)}), 500


# Invoice penjualan di Easy 6 = ARINV dengan:
#   DELIVERYORDER = 1   → sudah ada pengiriman (bukan SO langsung)
#   INVOICETYPE   = 1   → faktur biasa (bukan credit note)
#   ISDP          = 0   → bukan uang muka
#
# Field mapping:
#   No Faktur      = ar.INVOICENO
#   Tgl Faktur     = ar.INVOICEDATE
#   No PO          = ar.PURCHASEORDERNO
#   No Pesanan     = so.SONO   (via ARINVDET.SOID)
#   No Pengiriman  = ar.INVOICENO  (DO = Invoice di Easy 6)
#   No Pelanggan   = pd.PERSONNO
#   Nama Pelanggan = pd.NAME
#   Nilai Faktur   = ar.INVOICEAMOUNT
#   Uang Muka      = ar.DPUSED
#   Nilai Terbayar = ar.PAIDAMOUNT
#   Terhutang      = ar.INVOICEAMOUNT - ar.PAIDAMOUNT - ar.DPUSED
#   Umur           = CURRENT_DATE - ar.INVOICEDATE  (hari)
#   Deskripsi      = ar.DESCRIPTION
#   No Barang      = det.ITEMNO
#   Deskripsi Brg  = COALESCE(det.ITEMOVDESC, i.ITEMDESCRIPTION)

# ─── DAFTAR INVOICE ──────────────────────────────────────────────────────────
#
# Invoice = ARINV dengan GETFROMDO=1, INVOICETYPE=1, ISDP=0
# ARINVDET untuk invoice ini SELALU KOSONG — detail ada di DO-nya.
#
# No Pengiriman = Subquery ke ARINV DO (DELIVERYORDER=1, match CUSTOMERID+PO)
# No Pesanan    = Subquery ke ARINV DO → ARINVDET DO → SO.SONO
# Terhutang     = ar.OWING (reliable untuk GETFROMDO=1)

def _inv_where(search, date_from, date_to, only_owing):
    cond   = ["ar.GETFROMDO = 1", "ar.INVOICETYPE = 1",
               "(ar.ISDP IS NULL OR ar.ISDP = 0)"]
    params = []

    if search:
        cond.append("""(
            LOWER(ar.INVOICENO)          CONTAINING LOWER(?)
            OR LOWER(pd.PERSONNO)        CONTAINING LOWER(?)
            OR LOWER(pd.NAME)            CONTAINING LOWER(?)
            OR LOWER(ar.PURCHASEORDERNO) CONTAINING LOWER(?)
        )""")
        params += [search] * 4

    if date_from:
        cond.append("ar.INVOICEDATE >= ?"); params.append(date_from)
    if date_to:
        cond.append("ar.INVOICEDATE <= ?"); params.append(date_to)
    if only_owing:
        cond.append("ar.OWING > 0")

    return " AND ".join(cond), params


_INV_FROM = """
    FROM ARINV ar
    LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
"""

_INV_SELECT = """
    ar.ARINVOICEID,
    ar.INVOICENO,
    ar.INVOICEDATE,
    ar.PURCHASEORDERNO,
    ar.INVOICEAMOUNT,
    ar.PAIDAMOUNT,
    COALESCE(ar.DPUSED, 0)       AS DPUSED,
    ar.OWING,
    (CURRENT_DATE - ar.INVOICEDATE) AS UMUR_HARI,
    ar.DESCRIPTION,
    pd.PERSONNO,
    pd.NAME,
    (SELECT FIRST 1 do1.INVOICENO
     FROM ARINV do1
     WHERE do1.CUSTOMERID      = ar.CUSTOMERID
       AND do1.PURCHASEORDERNO = ar.PURCHASEORDERNO
       AND do1.DELIVERYORDER   = 1
       AND do1.INVOICETYPE     = 1
     ORDER BY do1.INVOICEDATE DESC)  AS NO_PENGIRIMAN,
    (SELECT FIRST 1 so1.SONO
     FROM ARINV do2
     JOIN ARINVDET det2 ON det2.ARINVOICEID = do2.ARINVOICEID
     JOIN SO so1        ON so1.SOID          = det2.SOID
     WHERE do2.CUSTOMERID      = ar.CUSTOMERID
       AND do2.PURCHASEORDERNO = ar.PURCHASEORDERNO
       AND do2.DELIVERYORDER   = 1
       AND do2.INVOICETYPE     = 1
     ORDER BY do2.INVOICEDATE DESC)  AS NO_PESANAN
"""


def _build_inv_rows(rows):
    data = []
    for r in rows:
        terhutang = float(r[7] or 0)
        umur      = int(r[8]  or 0)

        if terhutang <= 0:
            umur_label, umur_color = "Lunas",         "success"
        elif umur <= 30:
            umur_label, umur_color = f"{umur} hari",  "warning"
        elif umur <= 60:
            umur_label, umur_color = f"{umur} hari",  "orange"
        else:
            umur_label, umur_color = f"{umur} hari",  "error"

        data.append({
            "no_faktur":      str(r[1]  or "").strip(),
            "tgl_faktur":     str(r[2])  if r[2]  else "",
            "no_po":          str(r[3]  or "").strip(),
            "nilai_faktur":   float(r[4]  or 0),
            "nilai_terbayar": float(r[5]  or 0),
            "uang_muka":      float(r[6]  or 0),
            "terhutang":      round(terhutang, 2),
            "umur_hari":      umur,
            "umur_label":     umur_label,
            "umur_color":     umur_color,
            "deskripsi":      str(r[9]  or "").strip(),
            "no_pelanggan":   str(r[10] or "").strip(),
            "nama_pelanggan": str(r[11] or "").strip(),
            "no_pengiriman":  str(r[12] or "").strip(),
            "no_pesanan":     str(r[13] or "").strip(),
        })
    return data


@app.route("/api/invoice")
@jwt_required()
def api_invoice():
    if not check_permission("invoice"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search     = request.args.get("search", "")
        date_from  = request.args.get("date_from", "")
        date_to    = request.args.get("date_to", "")
        only_owing = request.args.get("only_owing", "") == "1"
        offset     = int(request.args.get("offset", 0))
        limit      = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()

        where_sql, params_where = _inv_where(search, date_from, date_to, only_owing)

        # Total & summary (pure header — no join ke ARINVDET)
        cur.execute(f"""
            SELECT COUNT(*),
                   SUM(ar.INVOICEAMOUNT),
                   SUM(ar.PAIDAMOUNT),
                   SUM(COALESCE(ar.DPUSED, 0)),
                   SUM(ar.OWING)
            {_INV_FROM}
            WHERE {where_sql}
        """, params_where)
        smr = cur.fetchone()
        total_rows   = int(smr[0] or 0)
        total_faktur = total_rows      # 1 baris = 1 faktur (no join ke det)
        summary = {
            "total_nilai":     float(smr[1] or 0),
            "total_terbayar":  float(smr[2] or 0),
            "total_dp":        float(smr[3] or 0),
            "total_terhutang": float(smr[4] or 0),
        }

        # Data utama
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                {_INV_SELECT}
            {_INV_FROM}
            WHERE {where_sql}
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO
        """, [limit, offset] + params_where)
        rows = cur.fetchall()
        con.close()

        return jsonify({
            "data":         filter_record_columns("invoice", _build_inv_rows(rows)),
            "total":        total_rows,
            "total_faktur": total_faktur,
            "summary":      summary,
        })

    except Exception as e:
        print(f"Error api_invoice: {e}")
        return jsonify({"data": [], "total": 0, "total_faktur": 0,
                        "summary": {}, "error": str(e)})


@app.route("/api/invoice/export")
@jwt_required()
def api_invoice_export():
    if not check_permission("invoice"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search     = request.args.get("search", "")
        date_from  = request.args.get("date_from", "")
        date_to    = request.args.get("date_to", "")
        only_owing = request.args.get("only_owing", "") == "1"

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params_where = _inv_where(search, date_from, date_to, only_owing)

        cur.execute(f"""
            SELECT {_INV_SELECT}
            {_INV_FROM}
            WHERE {where_sql}
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO
        """, params_where)
        rows = cur.fetchall()
        con.close()

        return jsonify({"data": filter_record_columns("invoice", _build_inv_rows(rows)), "total": len(rows)})

    except Exception as e:
        print(f"Error api_invoice_export: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


# ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────

MKT_PROJECT_PREFIXES = ("A-MKT", "G-MKT", "GTE-MKT")
GA_PROJECT_PREFIXES = ("A-GAF", "G-GAF")
HIDDEN_PROJECT_NUMBERS = (
    "A-MKT-230018",
    "A-MKT-230019",
    "A-MKT-240004",
    "A-MKT-240064",
    "A-MKT-240085",
    "A-MKT-250039",
    "A-MKT-250067",
    "A-MKT-250072",
    "A-MKT-250073",
    "A-MKT-250091",
    "A-MKT-250094",
    "A-MKT-250099",
    "A-MKT-260002",
    "A-MKT-260015",
    "A-MKT-260023",
)


def _project_prefix_condition(project_type):
    prefixes = MKT_PROJECT_PREFIXES if project_type == "mkt" else GA_PROJECT_PREFIXES if project_type == "ga" else ()
    if not prefixes:
        return "", []
    return (
        "(" + " OR ".join(["UPPER(CAST(p.PROJECTNO AS VARCHAR(255))) STARTING WITH ?"] * len(prefixes)) + ")",
        list(prefixes),
    )


def _detect_project_type(project_no):
    value = str(project_no or "").strip().upper()
    if any(value.startswith(prefix) for prefix in MKT_PROJECT_PREFIXES):
        return "mkt"
    if any(value.startswith(prefix) for prefix in GA_PROJECT_PREFIXES):
        return "ga"
    return ""


def _project_where(search="", status="active", project_type="", progress="", contact_name=""):
    conditions = ["1=1"]
    params = []
    if HIDDEN_PROJECT_NUMBERS:
        placeholders = ", ".join(["?"] * len(HIDDEN_PROJECT_NUMBERS))
        conditions.append(
            f"UPPER(TRIM(CAST(p.PROJECTNO AS VARCHAR(255)))) NOT IN ({placeholders})"
        )
        params.extend(HIDDEN_PROJECT_NUMBERS)
    if status == "active":
        conditions.append("COALESCE(p.SUSPENDED, 0) = 0")
    elif status == "suspended":
        conditions.append("COALESCE(p.SUSPENDED, 0) <> 0")
    prefix_sql, prefix_params = _project_prefix_condition(project_type)
    if prefix_sql:
        conditions.append(prefix_sql)
        params.extend(prefix_params)
    if search:
        conditions.append("""(
            LOWER(CAST(p.PROJECTNO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(p.DESCRIPTION AS VARCHAR(255))) CONTAINING LOWER(?)
        )""")
        params.extend([search] * 2)
    if project_type == "mkt" and contact_name:
        conditions.append(
            "UPPER(TRIM(CAST(p.CONTACTNAME AS VARCHAR(255)))) = UPPER(TRIM(?))"
        )
        params.append(contact_name)
    if progress == "unfinished":
        conditions.append("COALESCE(p.PERCENTCOMPLETED, 0) < 100")
    elif progress == "completed":
        conditions.append("COALESCE(p.PERCENTCOMPLETED, 0) >= 100")
    elif progress == "overdue_unfinished":
        conditions.append("p.FINSHED_DATE IS NOT NULL AND p.FINSHED_DATE < CURRENT_DATE AND COALESCE(p.PERCENTCOMPLETED, 0) < 100")
    elif progress.isdigit():
        progress_value = int(progress)
        if progress_value >= 100:
            conditions.append("COALESCE(p.PERCENTCOMPLETED, 0) >= 100")
        else:
            conditions.append("COALESCE(p.PERCENTCOMPLETED, 0) >= ? AND COALESCE(p.PERCENTCOMPLETED, 0) < ?")
            params.extend([progress_value, progress_value + 10])
    return " AND ".join(conditions), params


def _project_summary(cur, search="", status="active", project_type="", contact_name=""):
    where_sql, params = _project_where(
        search, status, project_type, contact_name=contact_name
    )
    suspended_completed_where, suspended_completed_params = _project_where(
        search, "all", project_type, contact_name=contact_name
    )
    cur.execute(f"""
        SELECT
            COUNT(*),
            SUM(CASE WHEN COALESCE(p.PERCENTCOMPLETED, 0) < 100 THEN 1 ELSE 0 END),
            SUM(CASE
                WHEN p.FINSHED_DATE IS NOT NULL
                 AND p.FINSHED_DATE < CURRENT_DATE
                 AND COALESCE(p.PERCENTCOMPLETED, 0) < 100
                THEN 1 ELSE 0
            END)
        FROM PROJECT p
        WHERE {where_sql}
    """, params)
    row = cur.fetchone() or (0, 0, 0)
    cur.execute(f"""
        SELECT COUNT(*)
        FROM PROJECT p
        WHERE {suspended_completed_where}
          AND COALESCE(p.SUSPENDED, 0) <> 0
          AND COALESCE(p.PERCENTCOMPLETED, 0) >= 100
    """, suspended_completed_params)
    suspended_completed = cur.fetchone()
    return {
        "total_project": int(row[0] or 0),
        "unfinished_project": int(row[1] or 0),
        "overdue_unfinished_project": int(row[2] or 0),
        "suspended_completed_project": int((suspended_completed or [0])[0] or 0),
    }


PROJECT_BUDGET_VALUE_SQL = """
    COALESCE(pb.OPENINGBALANCE, 0)
    + COALESCE(pb.PERIOD1, 0) + COALESCE(pb.PERIOD2, 0)
    + COALESCE(pb.PERIOD3, 0) + COALESCE(pb.PERIOD4, 0)
    + COALESCE(pb.PERIOD5, 0) + COALESCE(pb.PERIOD6, 0)
    + COALESCE(pb.PERIOD7, 0) + COALESCE(pb.PERIOD8, 0)
    + COALESCE(pb.PERIOD9, 0) + COALESCE(pb.PERIOD10, 0)
    + COALESCE(pb.PERIOD11, 0) + COALESCE(pb.PERIOD12, 0)
"""


def _project_base_metric_map(cur, rows):
    project_ids = [int(row[0] or 0) for row in rows if int(row[0] or 0)]
    if not project_ids:
        return {}
    placeholders = ", ".join(["?"] * len(project_ids))
    metrics = {
        project_id: {
            "rab": 0.0,
            "realisasi": 0.0,
            "profit_rab": 0.0,
            "profit_realisasi": 0.0,
            "revenue_rab": 0.0,
            "revenue_realisasi": 0.0,
            "discount_realisasi": 0.0,
            "account_5001_realisasi": 0.0,
        }
        for project_id in project_ids
    }

    cur.execute(f"""
        SELECT
            pb.PROJECTID,
            SUM(CASE
                WHEN pb.GLACCOUNT STARTING WITH '5.' OR pb.GLACCOUNT STARTING WITH '6.'
                THEN {PROJECT_BUDGET_VALUE_SQL}
                ELSE 0
            END) AS RAB_AMOUNT,
            SUM(CASE
                WHEN pb.GLACCOUNT STARTING WITH '4.'
                  OR pb.GLACCOUNT STARTING WITH '5.'
                  OR pb.GLACCOUNT STARTING WITH '6.'
                THEN ABS({PROJECT_BUDGET_VALUE_SQL})
                ELSE 0
            END) AS PROFIT_RAB,
            SUM(CASE
                WHEN pb.GLACCOUNT = '4.00.00.001'
                THEN ABS({PROJECT_BUDGET_VALUE_SQL})
                ELSE 0
            END) AS REVENUE_RAB
        FROM PROJECTBUDGET pb
        WHERE pb.PROJECTID IN ({placeholders})
        GROUP BY pb.PROJECTID
    """, project_ids)
    for row in cur.fetchall():
        project_id = int(row[0] or 0)
        metric = metrics.setdefault(project_id, {})
        metric["rab"] = _to_float(row[1])
        metric["profit_rab"] = _to_float(row[2])
        metric["revenue_rab"] = _to_float(row[3])

    cur.execute(f"""
        SELECT
            gh.PROJECTID,
            SUM(CASE
                WHEN gh.GLACCOUNT STARTING WITH '5.' OR gh.GLACCOUNT STARTING WITH '6.'
                THEN ABS(gh.BASEAMOUNT)
                ELSE 0
            END) AS REALISASI_AMOUNT,
            SUM(CASE WHEN gh.GLACCOUNT = '4.00.00.001' THEN gh.BASEAMOUNT ELSE 0 END) AS REVENUE_AMOUNT,
            SUM(CASE WHEN gh.GLACCOUNT = '4.00.00.003' THEN gh.BASEAMOUNT ELSE 0 END) AS DISCOUNT_AMOUNT,
            SUM(CASE WHEN gh.GLACCOUNT = '5.00.00.001' THEN gh.BASEAMOUNT ELSE 0 END) AS ACCOUNT_5001_AMOUNT
        FROM GLHIST gh
        WHERE gh.PROJECTID IN ({placeholders})
        GROUP BY gh.PROJECTID
    """, project_ids)
    for row in cur.fetchall():
        project_id = int(row[0] or 0)
        metric = metrics.setdefault(project_id, {})
        realisasi = _to_float(row[1])
        revenue = abs(_to_float(row[2]))
        discount = abs(_to_float(row[3]))
        account_5001 = abs(_to_float(row[4]))
        metric["realisasi"] = realisasi
        metric["revenue_realisasi"] = revenue
        metric["discount_realisasi"] = discount
        metric["account_5001_realisasi"] = account_5001
        metric["profit_realisasi"] = revenue - discount - realisasi

    return metrics


def _with_project_base_metrics(rows, base_metrics):
    enriched_rows = []
    for row in rows:
        project_id = int(row[0] or 0)
        metric = base_metrics.get(project_id, {})
        enriched_rows.append(tuple(row[:9]) + (
            metric.get("rab", 0.0),
            metric.get("realisasi", 0.0),
            metric.get("profit_rab", 0.0),
            metric.get("profit_realisasi", 0.0),
            metric.get("revenue_rab", 0.0),
            metric.get("revenue_realisasi", 0.0),
            metric.get("discount_realisasi", 0.0),
            metric.get("account_5001_realisasi", 0.0),
        ))
    return enriched_rows


def _build_project_rows(rows, project_metrics=None):
    rows = list(rows)
    project_metrics = project_metrics or {}
    manual_by_project = get_project_manual_realizations_for_projects(
        str(row[1] or "").strip() for row in rows
    )
    remarks_by_project = get_project_remarks_for_projects(
        str(row[1] or "").strip() for row in rows
    )
    data = []
    for row in rows:
        project_no = str(row[1] or "").strip()
        project_id = int(row[0] or 0)
        detected_project_type = _detect_project_type(project_no)
        suspended = int(row[7] or 0)
        rab = round(_to_float(row[9]), 2)
        realisasi = round(_to_float(row[10]), 2)
        profit_rab_amount = _to_float(row[11]) if len(row) > 11 else 0
        profit_realisasi_amount = _to_float(row[12]) if len(row) > 12 else 0
        revenue_rab = _to_float(row[13]) if len(row) > 13 else 0
        revenue_realisasi = _to_float(row[14]) if len(row) > 14 else 0
        discount_realisasi = _to_float(row[15]) if len(row) > 15 else 0
        account_5001_realisasi = _to_float(row[16]) if len(row) > 16 else 0
        manual_map = manual_by_project.get(project_no.upper(), {})
        manual_revenue = manual_map.get(PROJECT_REVENUE_ACCOUNT)
        manual_discount = manual_map.get(PROJECT_DISCOUNT_ACCOUNT)
        manual_account_5001 = manual_map.get("5.00.00.001")
        remarks = remarks_by_project.get(project_no.upper(), {})
        manual_mkt_expenses = sum(
            abs(_to_float((manual_map.get(row["account_key"]) or {}).get("amount")))
            for row in MKT_PROJECT_MANUAL_EXPENSE_ROWS
        )
        metric = project_metrics.get(project_id)
        if metric and detected_project_type == "ga":
            account_list = GA_PROJECT_REPORT_ACCOUNTS
            rab_values = {
                account: abs(_to_float(metric.get("budget", {}).get(account)))
                for account in account_list
            }
            actual_values = {
                account: abs(_to_float(metric.get("actual", {}).get(account)))
                for account in account_list
            }
            rab = round(sum(rab_values.values()), 2)
            realisasi = round(sum(actual_values.values()), 2)
            profit_rab = 0
            profit_realisasi = round((realisasi / rab * 100), 2) if rab else 0
        elif metric and detected_project_type == "mkt":
            rab_values = {
                account: abs(_to_float(metric.get("budget", {}).get(account)))
                for account in MKT_PROJECT_REPORT_ACCOUNTS
            }
            actual_values = {
                account: abs(_to_float(metric.get("actual", {}).get(account)))
                for account in MKT_PROJECT_REPORT_ACCOUNTS
            }
            if not metric.get("has_delivery_invoice"):
                actual_values[PROJECT_HPP_ACCOUNT] = 0.0

            for account in (PROJECT_REVENUE_ACCOUNT, PROJECT_DISCOUNT_ACCOUNT, PROJECT_HPP_ACCOUNT):
                manual = manual_map.get(account)
                if manual and abs(actual_values.get(account, 0)) <= 0.004:
                    actual_values[account] = abs(_to_float(manual.get("amount")))

            for manual_row in MKT_PROJECT_MANUAL_EXPENSE_ROWS:
                account_key = manual_row["account_key"]
                profit_loss_fee = (metric.get("profit_loss_fee_actual") or {}).get(account_key)
                actual_values[account_key] = abs(_to_float(
                    profit_loss_fee
                    if profit_loss_fee is not None
                    else (manual_map.get(account_key) or {}).get("amount")
                ))

            profit_rab_amount = _project_profit_loss_formula(rab_values)
            profit_realisasi_amount = _project_profit_loss_formula(actual_values)
            revenue_rab = _to_float(rab_values.get(PROJECT_REVENUE_ACCOUNT))
            revenue_realisasi = _to_float(actual_values.get(PROJECT_REVENUE_ACCOUNT))
            profit_rab = round((profit_rab_amount / revenue_rab * 100), 2) if revenue_rab else 0
            profit_realisasi = round(
                (profit_realisasi_amount / revenue_realisasi * 100), 2
            ) if revenue_realisasi else 0

            rab = round(_project_display_cost_total(rab_values), 2)
            realisasi = round(_project_display_cost_total(actual_values), 2)
        else:
            if manual_revenue and abs(revenue_realisasi) <= 0.004:
                revenue_realisasi = abs(_to_float(manual_revenue.get("amount")))
            if manual_discount and abs(discount_realisasi) <= 0.004:
                discount_realisasi = abs(_to_float(manual_discount.get("amount")))
            if manual_account_5001 and abs(account_5001_realisasi) <= 0.004:
                manual_expense_5001 = abs(_to_float(manual_account_5001.get("amount")))
                realisasi += manual_expense_5001
                account_5001_realisasi = manual_expense_5001
            realisasi += manual_mkt_expenses
            profit_realisasi_amount = revenue_realisasi - discount_realisasi - realisasi
            profit_rab = round((profit_rab_amount / revenue_rab * 100), 2) if revenue_rab else 0
            profit_realisasi = round((profit_realisasi_amount / revenue_realisasi * 100), 2) if revenue_realisasi else 0
        data.append({
            "project_id": project_id,
            "no_project": project_no,
            "nama_project": str(row[2] or "").strip(),
            "nama_kontak": str(row[3] or "").strip(),
            "tanggal_mulai": str(row[4]) if row[4] else "",
            "tanggal_selesai": str(row[5]) if row[5] else "",
            "komplit": round(_to_float(row[6]), 2),
            "deskripsi": str(row[8] or "").strip(),
            "rab": rab,
            "realisasi": realisasi,
            "selisih": round(rab - realisasi, 2),
            "value_profit_rab": round(profit_rab_amount, 2),
            "profit_rab": profit_rab,
            "value_profit_realisasi": round(profit_realisasi_amount, 2),
            "profit_realisasi": profit_realisasi,
            "remarks": remarks.get("remarks", ""),
            "remarks_updated_by": remarks.get("updated_by", ""),
            "remarks_updated_at": remarks.get("updated_at", ""),
            "average_pct": round(_to_float(row[6]), 2),
            "status": "Suspended" if suspended else "Aktif",
            "dihentikan": bool(suspended),
        })
    return data


@app.route("/api/project")
@jwt_required()
def api_project():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        status = request.args.get("status", "active")
        project_type = request.args.get("project_type", "").lower()
        progress = request.args.get("progress", "").lower()
        contact_name = request.args.get("contact_name", "").strip()
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        summary = _project_summary(cur, search, status, project_type, contact_name)
        where_sql, params = _project_where(
            search, status, project_type, progress, contact_name
        )
        cur.execute(f"SELECT COUNT(*) FROM PROJECT p WHERE {where_sql}", params)
        total = int(cur.fetchone()[0] or 0)
        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                p.PROJECTID,
                p.PROJECTNO,
                p.PROJECTNAME,
                p.CONTACTNAME,
                p.START_DATE,
                p.FINSHED_DATE,
                p.PERCENTCOMPLETED,
                p.SUSPENDED,
                p.DESCRIPTION
            FROM PROJECT p
            WHERE {where_sql}
            ORDER BY COALESCE(p.SUSPENDED, 0), p.PROJECTNO
        """, [limit, offset] + params)
        rows = cur.fetchall()
        rows = _with_project_base_metrics(rows, _project_base_metric_map(cur, rows))
        project_metrics = _build_project_metric_map(cur, rows)
        con.close()
        return jsonify({"data": filter_record_columns("project", _build_project_rows(rows, project_metrics)), "total": total, "summary": summary})
    except Exception as e:
        print(f"Error api_project: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


@app.route("/api/project/export")
@jwt_required()
def api_project_export():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        status = request.args.get("status", "active")
        project_type = request.args.get("project_type", "").lower()
        progress = request.args.get("progress", "").lower()
        contact_name = request.args.get("contact_name", "").strip()
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params = _project_where(
            search, status, project_type, progress, contact_name
        )
        cur.execute(f"""
            SELECT
                p.PROJECTID,
                p.PROJECTNO,
                p.PROJECTNAME,
                p.CONTACTNAME,
                p.START_DATE,
                p.FINSHED_DATE,
                p.PERCENTCOMPLETED,
                p.SUSPENDED,
                p.DESCRIPTION
            FROM PROJECT p
            WHERE {where_sql}
            ORDER BY COALESCE(p.SUSPENDED, 0), p.PROJECTNO
        """, params)
        rows = cur.fetchall()
        rows = _with_project_base_metrics(rows, _project_base_metric_map(cur, rows))
        project_metrics = _build_project_metric_map(cur, rows)
        con.close()
        data = filter_record_columns("project", _build_project_rows(rows, project_metrics))
        return jsonify({"data": data, "total": len(data)})
    except Exception as e:
        print(f"Error api_project_export: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


@app.route("/api/project/options")
@jwt_required()
def api_project_options():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        status = request.args.get("status", "active")
        project_type = request.args.get("project_type", "").lower()
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params = _project_where(search, status, project_type)
        cur.execute(f"""
            SELECT FIRST 30
                p.PROJECTID,
                p.PROJECTNO,
                p.PROJECTNAME,
                p.DESCRIPTION
            FROM PROJECT p
            WHERE {where_sql}
            ORDER BY p.PROJECTNO
        """, params)
        data = [{
            "project_id": int(row[0] or 0),
            "no_project": str(row[1] or "").strip(),
            "nama_project": str(row[2] or "").strip(),
            "deskripsi": str(row[3] or "").strip(),
        } for row in cur.fetchall()]
        con.close()
        return jsonify({"data": data})
    except Exception as e:
        print(f"Error api_project_options: {e}")
        return jsonify({"data": [], "error": str(e)})


@app.route("/api/project/contact-options")
@jwt_required()
def api_project_contact_options():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        where_sql, params = _project_where("", "all", "mkt")
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT DISTINCT TRIM(CAST(p.CONTACTNAME AS VARCHAR(255)))
            FROM PROJECT p
            WHERE {where_sql}
              AND NULLIF(TRIM(CAST(p.CONTACTNAME AS VARCHAR(255))), '') IS NOT NULL
            ORDER BY 1
        """, params)
        data = [str(row[0] or "").strip() for row in cur.fetchall()]
        con.close()
        return jsonify({"data": data})
    except Exception as e:
        print(f"Error api_project_contact_options: {e}")
        return jsonify({"data": [], "error": str(e)}), 500


def _project_detail_where(search="", date_from="", date_to="", project_type="", project_no="", account_no=""):
    conditions = [
        "p.PROJECTNO IS NOT NULL",
        "TRIM(p.PROJECTNO) <> '0'",
    ]
    params = []
    prefix_sql, prefix_params = _project_prefix_condition(project_type)
    if prefix_sql:
        conditions.append(prefix_sql)
        params.extend(prefix_params)
    if project_type == "mkt":
        conditions.append("""NOT (
            TRIM(CAST(gh.GLACCOUNT AS VARCHAR(255))) STARTING WITH '1.'
            OR TRIM(CAST(gh.GLACCOUNT AS VARCHAR(255))) STARTING WITH '2.'
            OR TRIM(CAST(gh.GLACCOUNT AS VARCHAR(255))) STARTING WITH '3.'
        )""")
    elif project_type == "ga":
        account_placeholders = ", ".join(["?"] * len(GA_PROJECT_REPORT_ACCOUNTS))
        conditions.append(f"TRIM(CAST(gh.GLACCOUNT AS VARCHAR(255))) IN ({account_placeholders})")
        params.extend(GA_PROJECT_REPORT_ACCOUNTS)
    if project_no:
        conditions.append("UPPER(TRIM(p.PROJECTNO)) = UPPER(TRIM(?))")
        params.append(project_no)
    if account_no:
        conditions.append("TRIM(CAST(gh.GLACCOUNT AS VARCHAR(255))) = ?")
        params.append(account_no)
    if date_from:
        conditions.append("gh.TRANSDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("gh.TRANSDATE <= ?")
        params.append(date_to)
    if search:
        conditions.append("""(
            LOWER(CAST(p.PROJECTNO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(p.PROJECTNAME AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(gh.GLACCOUNT AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(ga.ACCOUNTNAME AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(gh.SOURCE AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(gh.TRANSTYPE AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(gh.TRANSDESCRIPTION AS VARCHAR(255))) CONTAINING LOWER(?)
            OR EXISTS (
                SELECT 1
                FROM ARINV ar
                WHERE ar.ARINVOICEID = gh.INVOICEID
                  AND LOWER(CAST(ar.INVOICENO AS VARCHAR(255))) CONTAINING LOWER(?)
            )
            OR EXISTS (
                SELECT 1
                FROM APINV ai
                WHERE ai.APINVOICEID = gh.INVOICEID
                  AND LOWER(CAST(ai.INVOICENO AS VARCHAR(255))) CONTAINING LOWER(?)
            )
        )""")
        params.extend([search] * 9)
    return " AND ".join(conditions), params


def _build_project_detail_rows(rows):
    data = []
    for row in rows:
        desc = str(row[8] or "").strip()
        source = str(row[6] or "").strip()
        trans_type = str(row[7] or "").strip()
        glhist_id = int(row[10] or 0)
        doc_no = str(row[11] or "").strip() if len(row) > 11 else ""
        data.append({
            "tanggal": str(row[0]) if row[0] else "",
            "no_project": str(row[1] or "").strip(),
            "nama_project": str(row[2] or "").strip(),
            "no_akun": str(row[3] or "").strip(),
            "nama_akun": str(row[4] or "").strip(),
            "sumber": source,
            "tipe_transaksi": trans_type,
            "no_dokumen": doc_no or _extract_easy_doc_no(desc, source, trans_type, glhist_id),
            "deskripsi": desc,
            "nilai": round(_to_float(row[9]), 2),
        })
    return data


def _project_detail_match_virtual_row(row, search="", date_from="", date_to="", project_no="", account_no=""):
    if project_no and str(row.get("no_project") or "").strip().upper() != str(project_no or "").strip().upper():
        return False
    if account_no and str(row.get("no_akun") or "").strip() != str(account_no or "").strip():
        return False
    tanggal = str(row.get("tanggal") or "").strip()
    if date_from and tanggal and tanggal < date_from:
        return False
    if date_to and tanggal and tanggal > date_to:
        return False
    if search:
        needle = str(search or "").strip().lower()
        haystack = " ".join(str(row.get(key) or "") for key in (
            "no_project", "nama_project", "no_akun", "nama_akun", "sumber",
            "tipe_transaksi", "no_dokumen", "deskripsi",
        )).lower()
        if needle not in haystack:
            return False
    return True


def _project_detail_account_has_easy_rows(cur, project_id, account_no):
    cur.execute("""
        SELECT FIRST 1 1
        FROM GLHIST gh
        WHERE gh.PROJECTID = ?
          AND TRIM(CAST(gh.GLACCOUNT AS VARCHAR(255))) = ?
          AND ABS(COALESCE(gh.BASEAMOUNT, 0)) > 0.004
    """, [project_id, account_no])
    return cur.fetchone() is not None


def _project_detail_hpp_rows(cur, project_id, project_no, project_name, search="", date_from="", date_to="", account_no=""):
    if account_no and account_no != PROJECT_HPP_ACCOUNT:
        return []

    project_filter = """
        (
            det.PROJECTID = ?
            OR podet.PROJECTID = ?
            OR rd.PROJECTID = ?
        )
    """
    project_params = [project_id, project_id, project_id]
    amount_expr = """
        COALESCE(det.QUANTITY, 0) * COALESCE(det.UNITPRICE, 0) *
        (1 - (
            CASE
                WHEN TRIM(CAST(det.ITEMDISCPC AS VARCHAR(32))) = '' THEN 0
                ELSE COALESCE(CAST(det.ITEMDISCPC AS DOUBLE PRECISION), 0)
            END
        ) / 100)
    """
    conditions = [
        "det.ITEMNO IS NOT NULL",
        PROJECT_HPP_ITEM_ACCOUNT_CONDITION,
        "NOT UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH 'AI-A'",
        project_filter,
    ]
    params = list(project_params)
    if date_from:
        conditions.append("ai.INVOICEDATE >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("ai.INVOICEDATE <= ?")
        params.append(date_to)
    if search:
        conditions.append("""(
            LOWER(CAST(ai.INVOICENO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(po.PONO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(rq.REQNO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(det.ITEMNO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION) AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(pd.NAME AS VARCHAR(255))) CONTAINING LOWER(?)
        )""")
        params.extend([search] * 6)

    cur.execute(f"""
        SELECT
            ai.INVOICEDATE,
            ai.INVOICENO,
            pd.NAME,
            po.PONO,
            rq.REQNO,
            COALESCE(NULLIF(TRIM(det.ITEMRESERVED9), ''), NULLIF(TRIM(podet.ITEMRESERVED9), ''), NULLIF(TRIM(rd.ITEMRESERVED9), '')),
            det.ITEMNO,
            COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
            det.QUANTITY,
            det.ITEMUNIT,
            {amount_expr}
        FROM APINV ai
        JOIN APITMDET det ON det.APINVOICEID = ai.APINVOICEID
        LEFT JOIN PERSONDATA pd ON pd.ID = ai.VENDORID
        LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
        LEFT JOIN PO po ON po.POID = det.POID
        LEFT JOIN PODET podet ON podet.POID = det.POID AND podet.SEQ = det.POSEQ
        LEFT JOIN REQUISITION rq ON rq.REQID = podet.REQID
        LEFT JOIN REQUISITIONDET rd ON rd.REQID = podet.REQID AND rd.SEQ = podet.REQSEQ
        WHERE {" AND ".join(conditions)}
        ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO, det.SEQ
    """, params)
    rows = []
    for row in cur.fetchall():
        qty = _to_float(row[8])
        unit = str(row[9] or "").strip()
        rows.append({
            "tanggal": str(row[0]) if row[0] else "",
            "no_project": project_no,
            "nama_project": project_name,
            "no_akun": PROJECT_HPP_ACCOUNT,
            "nama_akun": "HPP Pembelian",
            "sumber": "HPP",
            "tipe_transaksi": "HPP Item",
            "no_dokumen": str(row[1] or "").strip(),
            "deskripsi": " | ".join(part for part in [
                str(row[7] or "").strip(),
                f"Item {str(row[6] or '').strip()}" if row[6] else "",
                f"Qty {qty:g} {unit}".strip() if qty else "",
                f"PO {str(row[3] or '').strip()}" if row[3] else "",
                f"PR {str(row[4] or '').strip()}" if row[4] else "",
                f"SO {str(row[5] or '').strip()}" if row[5] else "",
                f"Vendor {str(row[2] or '').strip()}" if row[2] else "",
            ] if part),
            "nilai": round(_to_float(row[10]), 2),
        })

    add_cost_conditions = [
        "COALESCE(po.FREIGHT, 0) <> 0",
        "(podet.PROJECTID = ? OR rd.PROJECTID = ?)",
    ]
    add_cost_params = [project_id, project_id]
    if date_from:
        add_cost_conditions.append("po.PODATE >= ?")
        add_cost_params.append(date_from)
    if date_to:
        add_cost_conditions.append("po.PODATE <= ?")
        add_cost_params.append(date_to)
    if search:
        add_cost_conditions.append("""(
            LOWER(CAST(po.PONO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(pd.NAME AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(rq.REQNO AS VARCHAR(255))) CONTAINING LOWER(?)
            OR LOWER(CAST(rd.ITEMRESERVED9 AS VARCHAR(255))) CONTAINING LOWER(?)
        )""")
        add_cost_params.extend([search] * 4)
    cur.execute(f"""
        SELECT
            po.PODATE,
            po.PONO,
            pd.NAME,
            MAX(rq.REQNO),
            MAX(COALESCE(NULLIF(TRIM(rd.ITEMRESERVED9), ''), '')),
            COALESCE(po.FREIGHT, 0)
        FROM PO po
        LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
        LEFT JOIN PODET podet ON podet.POID = po.POID
        LEFT JOIN REQUISITION rq ON rq.REQID = podet.REQID
        LEFT JOIN REQUISITIONDET rd ON rd.REQID = podet.REQID AND rd.SEQ = podet.REQSEQ
        WHERE {" AND ".join(add_cost_conditions)}
        GROUP BY po.PODATE, po.PONO, pd.NAME, po.FREIGHT
        ORDER BY po.PODATE DESC, po.PONO
    """, add_cost_params)
    for row in cur.fetchall():
        rows.append({
            "tanggal": str(row[0]) if row[0] else "",
            "no_project": project_no,
            "nama_project": project_name,
            "no_akun": PROJECT_HPP_ACCOUNT,
            "nama_akun": "HPP Pembelian",
            "sumber": "HPP",
            "tipe_transaksi": "Add Cost",
            "no_dokumen": str(row[1] or "").strip(),
            "deskripsi": " | ".join(part for part in [
                "Add Cost Pembelian",
                f"PR {str(row[3] or '').strip()}" if row[3] else "",
                f"SO {str(row[4] or '').strip()}" if row[4] else "",
                f"Vendor {str(row[2] or '').strip()}" if row[2] else "",
            ] if part),
            "nilai": round(_to_float(row[5]), 2),
        })
    return rows


def _project_detail_virtual_rows(cur, project_rows, search="", date_from="", date_to="", project_type="", project_no="", account_no=""):
    virtual_rows = []
    manual_by_project = get_project_manual_realizations_for_projects(
        str(row[1] or "").strip() for row in project_rows
    )
    account_names = {
        row["account_key"]: row["account_name"]
        for row in MKT_PROJECT_MANUAL_EXPENSE_ROWS
    }
    account_names.update({
        PROJECT_REVENUE_ACCOUNT: "Pendapatan Usaha",
        PROJECT_DISCOUNT_ACCOUNT: "Diskon Penjualan",
        PROJECT_HPP_ACCOUNT: "HPP Pembelian",
    })

    for project in project_rows:
        project_id = int(project[0] or 0)
        project_no_value = str(project[1] or "").strip()
        project_name = str(project[2] or "").strip()
        selected_project_type = _detect_project_type(project_no_value)
        if project_type and selected_project_type and selected_project_type != project_type:
            continue
        if selected_project_type == "ga":
            continue
        manual_map = manual_by_project.get(project_no_value.upper(), {})

        if selected_project_type == "mkt":
            virtual_rows.extend(_project_detail_hpp_rows(
                cur, project_id, project_no_value, project_name, search, date_from, date_to, account_no
            ))
            fee_realizations, _references = _project_profit_loss_fee_realizations(cur, project_name)
            for manual_row in MKT_PROJECT_MANUAL_EXPENSE_ROWS:
                account_key = manual_row["account_key"]
                if account_no and manual_row["account_no"] != account_no and account_key != account_no:
                    continue
                fee = fee_realizations.get(account_key)
                if not fee:
                    continue
                for detail in fee.get("details") or []:
                    virtual_row = {
                        "tanggal": detail.get("tanggal") or "",
                        "no_project": project_no_value,
                        "nama_project": project_name,
                        "no_akun": manual_row["account_no"],
                        "nama_akun": manual_row["account_name"],
                        "sumber": "Profit & Loss",
                        "tipe_transaksi": account_key.rsplit("-", 1)[-1],
                        "no_dokumen": detail.get("no_transaksi") or "",
                        "deskripsi": " | ".join(part for part in [
                            f"SO {detail.get('source_reference')}" if detail.get("source_reference") else "",
                            f"Part {detail.get('part_number')}" if detail.get("part_number") else "",
                            f"Persentase {detail.get('persentase')}" if detail.get("persentase") else "",
                            f"Amount asal {detail.get('amount_asal')}" if detail.get("amount_asal") else "",
                        ] if part),
                        "nilai": round(_to_float(detail.get("nilai_fee")), 2),
                    }
                    if _project_detail_match_virtual_row(virtual_row, search, date_from, date_to, project_no, account_no):
                        virtual_rows.append(virtual_row)

        for manual_account, manual in manual_map.items():
            if account_no:
                display_account = next((
                    item["account_no"] for item in MKT_PROJECT_MANUAL_EXPENSE_ROWS
                    if item["account_key"] == manual_account
                ), manual_account)
                if account_no not in (manual_account, display_account):
                    continue
            if selected_project_type == "mkt" and manual_account in (row["account_key"] for row in MKT_PROJECT_MANUAL_EXPENSE_ROWS):
                fee_realizations, _references = _project_profit_loss_fee_realizations(cur, project_name)
                if fee_realizations.get(manual_account):
                    continue
            elif _project_detail_account_has_easy_rows(cur, project_id, manual_account):
                continue

            manual_row = {
                "tanggal": manual.get("updated_at", "")[:10],
                "no_project": project_no_value,
                "nama_project": project_name,
                "no_akun": next((
                    item["account_no"] for item in MKT_PROJECT_MANUAL_EXPENSE_ROWS
                    if item["account_key"] == manual_account
                ), manual_account),
                "nama_akun": account_names.get(manual_account, manual_account),
                "sumber": "Manual Dashboard",
                "tipe_transaksi": "Manual",
                "no_dokumen": f"MANUAL-{project_no_value}",
                "deskripsi": manual.get("note") or "Input realisasi manual dari Laporan Project",
                "nilai": round(abs(_to_float(manual.get("amount"))), 2),
            }
            if _project_detail_match_virtual_row(manual_row, search, date_from, date_to, project_no, account_no):
                virtual_rows.append(manual_row)

    return virtual_rows


def _project_detail_total_nilai(data, project_type=""):
    if str(project_type or "").strip().lower() == "ga":
        account_totals = {}
        for row in data:
            key = (
                str(row.get("no_project") or "").strip().upper(),
                str(row.get("no_akun") or "").strip(),
            )
            account_totals[key] = account_totals.get(key, 0.0) + _to_float(row.get("nilai"))
        return round(sum(abs(amount) for amount in account_totals.values()), 2)
    return round(sum(_to_float(row.get("nilai")) for row in data), 2)


def _project_detail_candidate_projects(cur, gl_rows, project_type="", project_no=""):
    projects = {}
    for row in gl_rows:
        project_id = int(row[12] or 0) if len(row) > 12 else 0
        project_no_value = str(row[1] or "").strip()
        if project_id and project_no_value:
            projects[project_id] = (project_id, project_no_value, str(row[2] or "").strip())
    if project_no:
        cur.execute("""
            SELECT p.PROJECTID, p.PROJECTNO, p.PROJECTNAME
            FROM PROJECT p
            WHERE UPPER(TRIM(p.PROJECTNO)) = UPPER(TRIM(?))
        """, [project_no])
        for row in cur.fetchall():
            project_id = int(row[0] or 0)
            if project_id:
                projects[project_id] = (
                    project_id,
                    str(row[1] or "").strip(),
                    str(row[2] or "").strip(),
                )
    elif not gl_rows:
        where_sql, params = _project_where("", "all", project_type)
        cur.execute(f"""
            SELECT FIRST 100
                p.PROJECTID,
                p.PROJECTNO,
                p.PROJECTNAME
            FROM PROJECT p
            WHERE {where_sql}
            ORDER BY p.PROJECTNO
        """, params)
        for row in cur.fetchall():
            project_id = int(row[0] or 0)
            if project_id:
                projects[project_id] = (
                    project_id,
                    str(row[1] or "").strip(),
                    str(row[2] or "").strip(),
                )
    return list(projects.values())


def _project_detail_sort_key(row):
    tanggal = str(row.get("tanggal") or "")
    return (tanggal, str(row.get("no_dokumen") or ""), str(row.get("deskripsi") or ""))


def _project_detail_replace_hpp_gl_rows(data, virtual_rows):
    hpp_projects = {
        str(row.get("no_project") or "").strip().upper()
        for row in virtual_rows
        if row.get("sumber") == "HPP" and str(row.get("no_akun") or "").strip() == PROJECT_HPP_ACCOUNT
    }
    if not hpp_projects:
        return data
    return [
        row for row in data
        if not (
            str(row.get("no_project") or "").strip().upper() in hpp_projects
            and str(row.get("no_akun") or "").strip() == PROJECT_HPP_ACCOUNT
            and row.get("sumber") not in ("HPP", "Manual Dashboard", "Profit & Loss")
        )
    ]


@app.route("/api/project/detail")
@jwt_required()
def api_project_detail():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        project_type = request.args.get("project_type", "").lower()
        project_no = request.args.get("project_no", "")
        account_no = request.args.get("account_no", "").strip()
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 50))

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params = _project_detail_where(search, date_from, date_to, project_type, project_no, account_no)
        cur.execute(f"""
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
        """, params)
        rows = cur.fetchall()
        data = _build_project_detail_rows(rows)
        project_rows = _project_detail_candidate_projects(cur, rows, project_type, project_no)
        virtual_rows = _project_detail_virtual_rows(
            cur, project_rows, search, date_from, date_to, project_type, project_no, account_no
        )
        data = _project_detail_replace_hpp_gl_rows(data, virtual_rows)
        data.extend(virtual_rows)
        con.close()
        data.sort(key=_project_detail_sort_key, reverse=True)
        total = len(data)
        nilai = _project_detail_total_nilai(data, project_type)
        page_data = data[offset:offset + limit]
        return jsonify({
            "data": filter_record_columns("project_detail", page_data),
            "total": total,
            "summary": {"total_transaksi": total, "nilai": nilai},
        })
    except Exception as e:
        print(f"Error api_project_detail: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/project/detail/export")
@jwt_required()
def api_project_detail_export():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        search = request.args.get("search", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        project_type = request.args.get("project_type", "").lower()
        project_no = request.args.get("project_no", "")
        account_no = request.args.get("account_no", "").strip()
        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        where_sql, params = _project_detail_where(search, date_from, date_to, project_type, project_no, account_no)
        cur.execute(f"""
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
        """, params)
        rows = cur.fetchall()
        data = _build_project_detail_rows(rows)
        project_rows = _project_detail_candidate_projects(cur, rows, project_type, project_no)
        virtual_rows = _project_detail_virtual_rows(
            cur, project_rows, search, date_from, date_to, project_type, project_no, account_no
        )
        data = _project_detail_replace_hpp_gl_rows(data, virtual_rows)
        data.extend(virtual_rows)
        con.close()
        data.sort(key=_project_detail_sort_key, reverse=True)
        data = filter_record_columns("project_detail", data)
        return jsonify({"data": data, "total": len(data)})
    except Exception as e:
        print(f"Error api_project_detail_export: {e}")
        return jsonify({"data": [], "total": 0, "error": str(e)})


def _project_duration_days(start_date, end_date):
    if not start_date or not end_date:
        return 0
    try:
        return max((end_date - start_date).days, 0)
    except Exception:
        return 0


def _project_customer_name(description):
    text = str(description or "").strip()
    return text.split(",", 1)[0].strip() if text else ""


def _project_sales_order_references(project_name):
    """Ambil referensi AI-PP unik dari nama project dengan urutan tetap."""
    references = []
    seen = set()
    for match in re.finditer(r"\bAI-PP-\d+\b", str(project_name or ""), flags=re.IGNORECASE):
        reference = match.group(0).upper()
        if reference not in seen:
            seen.add(reference)
            references.append(reference)
    return references


def _project_profit_loss_fee_realizations(cur, project_name):
    """Akumulasi CF/MF Profit & Loss untuk seluruh AI-PP dalam nama project."""
    references = _project_sales_order_references(project_name)
    if not references:
        return {}, []

    cf_map = _profit_loss_cf_map(cur, references)
    mf_map = _profit_loss_mf_map(cur, references)
    result = {}
    for account_key, fee_map in (
        ("6.00.00.003-CF", cf_map),
        ("6.00.00.003-MF", mf_map),
    ):
        matched_references = [reference for reference in references if fee_map.get(reference)]
        if not matched_references:
            continue
        result[account_key] = {
            "amount": round(sum(
                _to_float((fee_map.get(reference) or {}).get("amount"))
                for reference in matched_references
            ), 2),
            "references": matched_references,
            "details": [
                {**detail, "source_reference": reference}
                for reference in matched_references
                for detail in (fee_map.get(reference) or {}).get("details", [])
            ],
        }
    return result, references


MKT_PROJECT_REPORT_ACCOUNTS = [
    "4.00.00.001",
    "4.00.00.003",
    "5.00.00.001",
    "5.00.00.002",
    "5.00.00.003",
    "5.00.00.004",
    "5.00.00.006",
    "5.00.00.007",
    "6.00.00.001",
    "6.00.00.002",
    "6.00.00.003",
    "6.00.00.004",
    "6.00.00.005",
    "6.00.00.006",
    "6.00.00.016",
    "6.00.00.017",
]

MKT_PROJECT_MANUAL_EXPENSE_ROWS = [
    {
        "account_key": "6.00.00.003-CF",
        "account_no": "6.00.00.003",
        "account_name": "CF (Commitment Fee)",
    },
    {
        "account_key": "6.00.00.003-MF",
        "account_no": "6.00.00.003",
        "account_name": "MF (Marketing Fee)",
    },
]

GA_PROJECT_REPORT_ACCOUNTS = [
    "5.00.00.005",
    "6.00.00.001",
    "6.00.00.002",
    "6.00.00.003",
    "6.00.00.004",
    "6.00.00.006",
    "6.00.00.007",
    "6.00.00.008",
    "6.00.00.010",
    "6.00.00.013",
    "6.00.00.014",
    "6.00.00.015",
    "6.00.00.016",
    "6.00.99.000",
    "6.00.00.022",
    "6.00.00.023",
    "6.00.00.024",
    "6.00.00.025",
    "1.01.12.001",
    "1.01.12.002",
    "1.01.12.003",
    "1.01.12.004",
    "1.01.12.005",
    "1.01.12.006",
]

PROJECT_REPORT_ACCOUNT_FALLBACK_NAMES = {
    "1.01.12.001": "Jasa Tenaga Kerja",
    "1.01.12.002": "Jasa Administrasi",
    "1.01.12.003": "Material Sipil",
    "1.01.12.004": "Material Konstruksi",
    "1.01.12.005": "Material Elektrikal",
    "1.01.12.006": "Material Plumbing",
}


def _build_project_metric_map(cur, rows):
    project_ids = [int(row[0] or 0) for row in rows if int(row[0] or 0)]
    if not project_ids:
        return {}
    project_placeholders = ", ".join(["?"] * len(project_ids))
    report_accounts = list(dict.fromkeys(MKT_PROJECT_REPORT_ACCOUNTS + GA_PROJECT_REPORT_ACCOUNTS))
    account_placeholders = ", ".join(["?"] * len(report_accounts))
    metrics = {
        project_id: {"budget": {}, "actual": {}}
        for project_id in project_ids
    }

    cur.execute(f"""
        SELECT
            pb.PROJECTID,
            pb.GLACCOUNT,
            SUM(
                COALESCE(pb.OPENINGBALANCE, 0)
                + COALESCE(pb.PERIOD1, 0) + COALESCE(pb.PERIOD2, 0)
                + COALESCE(pb.PERIOD3, 0) + COALESCE(pb.PERIOD4, 0)
                + COALESCE(pb.PERIOD5, 0) + COALESCE(pb.PERIOD6, 0)
                + COALESCE(pb.PERIOD7, 0) + COALESCE(pb.PERIOD8, 0)
                + COALESCE(pb.PERIOD9, 0) + COALESCE(pb.PERIOD10, 0)
                + COALESCE(pb.PERIOD11, 0) + COALESCE(pb.PERIOD12, 0)
            )
        FROM PROJECTBUDGET pb
        WHERE pb.PROJECTID IN ({project_placeholders})
          AND pb.GLACCOUNT IN ({account_placeholders})
        GROUP BY pb.PROJECTID, pb.GLACCOUNT
    """, project_ids + report_accounts)
    for row in cur.fetchall():
        project_id = int(row[0] or 0)
        account = str(row[1] or "").strip()
        metrics.setdefault(project_id, {"budget": {}, "actual": {}})["budget"][account] = _to_float(row[2])

    cur.execute(f"""
        SELECT
            gh.PROJECTID,
            gh.GLACCOUNT,
            SUM(gh.BASEAMOUNT)
        FROM GLHIST gh
        WHERE gh.PROJECTID IN ({project_placeholders})
          AND gh.GLACCOUNT IN ({account_placeholders})
        GROUP BY gh.PROJECTID, gh.GLACCOUNT
    """, project_ids + report_accounts)
    for row in cur.fetchall():
        project_id = int(row[0] or 0)
        account = str(row[1] or "").strip()
        metrics.setdefault(project_id, {"budget": {}, "actual": {}})["actual"][account] = _to_float(row[2])

    cur.execute(f"""
        SELECT DISTINCT COALESCE(det.PROJECTID, sodet.PROJECTID)
        FROM ARINV ar
        JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
        LEFT JOIN SODET sodet ON sodet.SOID = det.SOID AND sodet.SEQ = det.SOSEQ
        WHERE ar.DELIVERYORDER IS NOT NULL
          AND TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) <> ''
          AND det.ITEMNO IS NOT NULL
          AND COALESCE(det.PROJECTID, sodet.PROJECTID) IN ({project_placeholders})
    """, project_ids)
    for row in cur.fetchall():
        project_id = int(row[0] or 0)
        if project_id:
            metrics.setdefault(project_id, {"budget": {}, "actual": {}})["has_delivery_invoice"] = True

    project_refs_by_id = {}
    all_references = []
    for row in rows:
        project_id = int(row[0] or 0)
        project_no = str(row[1] or "").strip()
        if not project_id or _detect_project_type(project_no) != "mkt":
            continue
        references = _project_sales_order_references(row[2])
        if not references:
            continue
        project_refs_by_id[project_id] = references
        all_references.extend(references)

    if all_references:
        cf_map = _profit_loss_cf_map(cur, all_references)
        mf_map = _profit_loss_mf_map(cur, all_references)
        for project_id, references in project_refs_by_id.items():
            fee_actual = {}
            for account_key, fee_map in (
                ("6.00.00.003-CF", cf_map),
                ("6.00.00.003-MF", mf_map),
            ):
                amount = sum(
                    _to_float((fee_map.get(reference) or {}).get("amount"))
                    for reference in references
                    if fee_map.get(reference)
                )
                if amount:
                    fee_actual[account_key] = round(amount, 2)
            if fee_actual:
                metrics.setdefault(project_id, {"budget": {}, "actual": {}})["profit_loss_fee_actual"] = fee_actual

    return metrics

PROJECT_MANUAL_REALIZATION_ACCOUNTS = {
    "4.00.00.001",
    "4.00.00.003",
    "5.00.00.001",
    *(row["account_key"] for row in MKT_PROJECT_MANUAL_EXPENSE_ROWS),
}


PROJECT_REVENUE_ACCOUNT = "4.00.00.001"
PROJECT_DISCOUNT_ACCOUNT = "4.00.00.003"
PROJECT_HPP_ACCOUNT = "5.00.00.001"
PROJECT_HPP_ITEM_ACCOUNT_CONDITION = """
    (
        i.INVENTORYGLACCNT STARTING WITH '1.01.07.'
        OR i.INVENTORYGLACCNT = '1.01.03.001'
        OR i.INVENTORYGLACCNT = '1.01.10.006'
    )
"""


def _project_has_delivery_invoice(cur, project_id):
    cur.execute("""
        SELECT FIRST 1 1
        FROM ARINV ar
        JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
        LEFT JOIN SODET sodet ON sodet.SOID = det.SOID AND sodet.SEQ = det.SOSEQ
        WHERE ar.DELIVERYORDER IS NOT NULL
          AND TRIM(CAST(ar.DELIVERYORDER AS VARCHAR(32))) <> ''
          AND det.ITEMNO IS NOT NULL
          AND (
            det.PROJECTID = ?
            OR sodet.PROJECTID = ?
          )
    """, [project_id, project_id])
    return cur.fetchone() is not None


def _project_profit_loss_formula(values):
    revenue = _to_float(values.get(PROJECT_REVENUE_ACCOUNT))
    discount = abs(_to_float(values.get(PROJECT_DISCOUNT_ACCOUNT)))
    expenses = sum(
        abs(_to_float(amount))
        for account, amount in values.items()
        if str(account or "").startswith(("5.", "6."))
    )
    return revenue - discount - expenses


def _project_display_cost_total(values):
    return sum(
        abs(_to_float(amount))
        for account, amount in values.items()
        if str(account or "").startswith(("5.", "6."))
        and account != PROJECT_HPP_ACCOUNT
    )


@app.route("/api/project/manual-realization", methods=["POST"])
@jwt_required()
def api_project_manual_realization_save():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        data = request.get_json(silent=True) or {}
        project_no = str(data.get("project_no") or "").strip()
        account_no = str(data.get("account_no") or "").strip()
        note = str(data.get("note") or "").strip()
        amount = _to_float(data.get("amount"))
        if not project_no:
            return jsonify({"message": "No project wajib diisi."}), 400
        if account_no not in PROJECT_MANUAL_REALIZATION_ACCOUNTS:
            return jsonify({"message": "Akun ini tidak diizinkan untuk input realisasi manual."}), 400
        user = get_current_user()
        saved = save_project_manual_realization(
            project_no=project_no,
            account_no=account_no,
            amount=amount,
            note=note,
            updated_by=user.get("username"),
        )
        audit_current_user(
            "project_manual_realization_save",
            "project",
            f"Input realisasi manual {account_no} untuk project {project_no}",
            {"project_no": project_no, "account_no": account_no, "amount": amount, "note": note},
        )
        return jsonify({"message": "Realisasi manual disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_project_manual_realization_save: {e}")
        return jsonify({"message": "Gagal menyimpan realisasi manual.", "error": str(e)}), 500


@app.route("/api/project/remark", methods=["POST"])
@jwt_required()
def api_project_remark_save():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        data = request.get_json(silent=True) or {}
        project_no = str(data.get("project_no") or "").strip()
        remarks = str(data.get("remarks") or "").strip()
        if not project_no:
            return jsonify({"message": "No project wajib diisi."}), 400
        if len(remarks) > 500:
            return jsonify({"message": "Remarks maksimal 500 karakter."}), 400

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 p.PROJECTNO
            FROM PROJECT p
            WHERE UPPER(TRIM(p.PROJECTNO)) = UPPER(TRIM(?))
        """, [project_no])
        valid_row = cur.fetchone()
        con.close()
        if not valid_row:
            return jsonify({"message": "Project tidak ditemukan."}), 404

        user = get_current_user()
        saved = save_project_remark(project_no, remarks, user.get("username"))
        audit_current_user(
            "project_remark_save",
            "project",
            f"Update remarks project {project_no}",
            saved,
        )
        return jsonify({"message": "Remarks disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_project_remark_save: {e}")
        return jsonify({"message": "Gagal menyimpan remarks.", "error": str(e)}), 500


@app.route("/api/project/report")
@jwt_required()
def api_project_report():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        project_no = request.args.get("project_no", "").strip()
        project_id = request.args.get("project_id", "").strip()
        requested_project_type = request.args.get("project_type", "").strip().lower()
        if not project_no and not project_id:
            return jsonify({"header": {}, "data": [], "summary": {}, "message": "Pilih project terlebih dahulu."})

        conditions = []
        params = []
        if project_id:
            conditions.append("p.PROJECTID = ?")
            params.append(project_id)
        if project_no:
            conditions.append("UPPER(TRIM(p.PROJECTNO)) = UPPER(TRIM(?))")
            params.append(project_no)

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute(f"""
            SELECT FIRST 1
                p.PROJECTID,
                p.PROJECTNO,
                p.PROJECTNAME,
                p.CONTACTNAME,
                p.START_DATE,
                p.FINSHED_DATE,
                p.DESCRIPTION,
                p.PERCENTCOMPLETED,
                p.SUSPENDED
            FROM PROJECT p
            WHERE {" OR ".join(conditions)}
        """, params)
        project = cur.fetchone()
        if not project:
            con.close()
            return jsonify({"header": {}, "data": [], "summary": {}, "message": "Project tidak ditemukan."})

        selected_project_id = int(project[0] or 0)
        report_account_refs = list(dict.fromkeys(MKT_PROJECT_REPORT_ACCOUNTS + GA_PROJECT_REPORT_ACCOUNTS))
        report_account_placeholders = ", ".join(["?"] * len(report_account_refs))
        cur.execute(f"""
            SELECT
                pb.GLACCOUNT,
                ga.ACCOUNTNAME,
                COALESCE(pb.OPENINGBALANCE, 0)
                + COALESCE(pb.PERIOD1, 0) + COALESCE(pb.PERIOD2, 0)
                + COALESCE(pb.PERIOD3, 0) + COALESCE(pb.PERIOD4, 0)
                + COALESCE(pb.PERIOD5, 0) + COALESCE(pb.PERIOD6, 0)
                + COALESCE(pb.PERIOD7, 0) + COALESCE(pb.PERIOD8, 0)
                + COALESCE(pb.PERIOD9, 0) + COALESCE(pb.PERIOD10, 0)
                + COALESCE(pb.PERIOD11, 0) + COALESCE(pb.PERIOD12, 0) AS BUDGET_AMOUNT
            FROM PROJECTBUDGET pb
            LEFT JOIN GLACCNT ga ON ga.GLACCOUNT = pb.GLACCOUNT
            WHERE pb.PROJECTID = ?
              AND (
                pb.GLACCOUNT STARTING WITH '4.'
                OR pb.GLACCOUNT STARTING WITH '5.'
                OR pb.GLACCOUNT STARTING WITH '6.'
                OR pb.GLACCOUNT IN ({report_account_placeholders})
              )
            ORDER BY pb.GLACCOUNT
        """, [selected_project_id] + report_account_refs)
        budget_rows = cur.fetchall()

        account_names = {}
        if budget_rows:
            account_names.update({str(row[0] or "").strip(): str(row[1] or "").strip() for row in budget_rows})
        placeholders = ", ".join(["?"] * len(report_account_refs))
        cur.execute(f"""
            SELECT GLACCOUNT, ACCOUNTNAME
            FROM GLACCNT
            WHERE GLACCOUNT IN ({placeholders})
        """, report_account_refs)
        account_names.update({str(row[0] or "").strip(): str(row[1] or "").strip() for row in cur.fetchall()})
        account_names.update({
            account: PROJECT_REPORT_ACCOUNT_FALLBACK_NAMES.get(account, account)
            for account in report_account_refs
            if not account_names.get(account)
        })

        cur.execute(f"""
            SELECT
                gh.GLACCOUNT,
                SUM(gh.BASEAMOUNT) AS REAL_AMOUNT
            FROM GLHIST gh
            WHERE gh.PROJECTID = ?
              AND (
                gh.GLACCOUNT STARTING WITH '4.'
                OR gh.GLACCOUNT STARTING WITH '5.'
                OR gh.GLACCOUNT STARTING WITH '6.'
                OR gh.GLACCOUNT IN ({report_account_placeholders})
              )
            GROUP BY gh.GLACCOUNT
        """, [selected_project_id] + report_account_refs)
        actual_map = {str(row[0] or "").strip(): _to_float(row[1]) for row in cur.fetchall()}

        selected_project_no = str(project[1] or "").strip()
        detected_project_type = _detect_project_type(selected_project_no)
        selected_project_type = requested_project_type if requested_project_type in ("mkt", "ga") else detected_project_type
        project_fee_realizations = {}
        project_so_references = []
        if selected_project_type == "mkt":
            has_delivery_invoice = _project_has_delivery_invoice(cur, selected_project_id)
            if not has_delivery_invoice:
                actual_map.pop(PROJECT_HPP_ACCOUNT, None)
            project_fee_realizations, project_so_references = (
                _project_profit_loss_fee_realizations(cur, project[2])
            )
        con.close()

        report_note = get_project_report_note(selected_project_no)
        manual_map = get_project_manual_realizations(selected_project_no)
        budget_map = {str(row[0] or "").strip(): _to_float(row[2]) for row in budget_rows}
        is_mkt_project = selected_project_type == "mkt"
        is_ga_project = selected_project_type == "ga"
        if is_mkt_project:
            budget_rows = [
                (account, account_names.get(account, ""), budget_map.get(account, 0.0))
                for account in MKT_PROJECT_REPORT_ACCOUNTS
            ]
        elif is_ga_project:
            budget_rows = [
                (account, account_names.get(account, ""), budget_map.get(account, 0.0))
                for account in GA_PROJECT_REPORT_ACCOUNTS
            ]

        rows = []
        rab_values = {}
        actual_values = {}
        for row in budget_rows:
            account = str(row[0] or "").strip()
            rab = abs(_to_float(row[2]))
            actual = actual_map.get(account, 0.0)
            has_easy_realization = abs(actual) > 0.004
            manual = manual_map.get(account)
            is_manual = bool(
                account in PROJECT_MANUAL_REALIZATION_ACCOUNTS
                and manual
                and not has_easy_realization
            )
            if is_manual:
                actual = _to_float(manual.get("amount"))
            actual_display = abs(actual)
            rab_values[account] = rab
            actual_values[account] = actual_display
            rows.append({
                "no_akun": account,
                "nama_akun": str(row[1] or "").strip(),
                "rab": round(rab, 2),
                "realisasi": round(actual_display, 2),
                "is_manual": is_manual,
                "manual_note": manual.get("note", "") if manual else "",
                "manual_updated_by": manual.get("updated_by", "") if manual else "",
                "manual_updated_at": manual.get("updated_at", "") if manual else "",
                "has_easy_realization": has_easy_realization,
            })

        if is_mkt_project:
            for manual_row in MKT_PROJECT_MANUAL_EXPENSE_ROWS:
                account_key = manual_row["account_key"]
                manual = manual_map.get(account_key)
                profit_loss_fee = project_fee_realizations.get(account_key)
                has_profit_loss_value = bool(profit_loss_fee)
                if has_profit_loss_value:
                    actual_display = abs(_to_float(profit_loss_fee.get("amount")))
                else:
                    actual_display = abs(_to_float((manual or {}).get("amount")))
                rab_values[account_key] = 0.0
                actual_values[account_key] = actual_display
                rows.append({
                    "no_akun": manual_row["account_no"],
                    "manual_account_key": account_key,
                    "nama_akun": manual_row["account_name"],
                    "rab": 0.0,
                    "realisasi": round(actual_display, 2),
                    "is_manual": bool(manual) and not has_profit_loss_value,
                    "manual_note": manual.get("note", "") if manual else "",
                    "manual_updated_by": manual.get("updated_by", "") if manual else "",
                    "manual_updated_at": manual.get("updated_at", "") if manual else "",
                    "has_easy_realization": has_profit_loss_value,
                    "realization_source": "profit_loss" if has_profit_loss_value else "",
                    "source_references": profit_loss_fee.get("references", []) if profit_loss_fee else [],
                    "fee_details": profit_loss_fee.get("details", []) if profit_loss_fee else [],
                })

        profit_loss_rab = _project_profit_loss_formula(rab_values)
        profit_actual = _project_profit_loss_formula(actual_values)
        revenue_rab = _to_float(rab_values.get(PROJECT_REVENUE_ACCOUNT))
        revenue_actual = _to_float(actual_values.get(PROJECT_REVENUE_ACCOUNT))
        if is_ga_project:
            total_budget = sum(_to_float(amount) for amount in rab_values.values())
            total_realization = sum(_to_float(amount) for amount in actual_values.values())
            percentage = 0
            realisasi_percentage = (total_realization / total_budget * 100) if total_budget else 0
            total_label = "Budget vs Realisasi"
            total_rab = total_budget
            total_realisasi = total_realization
            show_rab_percentage = False
            show_realisasi_percentage = bool(total_budget)
        else:
            percentage = (profit_loss_rab / revenue_rab * 100) if revenue_rab else 0
            realisasi_percentage = (profit_actual / revenue_actual * 100) if is_mkt_project and revenue_actual else 0
            total_label = "Profit & Loss"
            total_rab = profit_loss_rab
            total_realisasi = profit_actual
            show_rab_percentage = True
            show_realisasi_percentage = is_mkt_project and bool(revenue_actual)
        rows.append({
            "no_akun": "",
            "nama_akun": total_label,
            "rab": round(total_rab, 2),
            "realisasi": round(total_realisasi, 2),
            "is_total": True,
        })
        rows.append({
            "no_akun": "",
            "nama_akun": "Persentase (%)",
            "rab": round(percentage, 2),
            "realisasi": round(realisasi_percentage, 2),
            "is_percentage": True,
            "show_rab_percentage": show_rab_percentage,
            "show_realisasi_percentage": show_realisasi_percentage,
        })

        header = {
            "project_id": selected_project_id,
            "no_project": selected_project_no,
            "nama_project": str(project[2] or "").strip(),
            "nama_customer": _project_customer_name(project[6]),
            "nama_marketing": str(project[3] or "").strip(),
            "tgl_mulai": str(project[4]) if project[4] else "",
            "tgl_selesai": str(project[5]) if project[5] else "",
            "durasi_pekerjaan": _project_duration_days(project[4], project[5]),
            "status_progress": round(_to_float(project[7]), 2),
            "dihentikan": bool(int(project[8] or 0)),
            "deskripsi": str(project[6] or "").strip(),
            "project_type": selected_project_type,
            "sales_order_references": project_so_references,
            "is_ga_project": is_ga_project,
            "report_note": report_note.get("note", ""),
            "report_note_updated_by": report_note.get("updated_by", ""),
            "report_note_updated_at": report_note.get("updated_at", ""),
        }
        return jsonify({
            "header": header,
            "data": filter_record_columns("project_report", rows),
            "summary": {
                "rab_total": round(profit_loss_rab, 2),
                "realisasi_profit_loss": round(profit_actual, 2),
                "persentase": round(percentage, 2),
                "persentase_realisasi": round(realisasi_percentage, 2),
            },
        })
    except Exception as e:
        print(f"Error api_project_report: {e}")
        return jsonify({"header": {}, "data": [], "summary": {}, "error": str(e)})


@app.route("/api/project/report/hpp-items")
@jwt_required()
def api_project_report_hpp_items():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        project_no = request.args.get("project_no", "").strip()
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 100))
        if not project_no:
            return jsonify({"data": [], "total": 0, "summary": {}, "message": "No project wajib diisi."}), 400

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 p.PROJECTID, p.PROJECTNO
            FROM PROJECT p
            WHERE UPPER(TRIM(p.PROJECTNO)) = UPPER(TRIM(?))
        """, [project_no])
        project = cur.fetchone()
        if not project:
            con.close()
            return jsonify({"data": [], "total": 0, "summary": {}, "message": "Project tidak ditemukan."})

        selected_project_id = int(project[0] or 0)
        selected_project_no = str(project[1] or "").strip()
        if _detect_project_type(selected_project_no) != "mkt":
            con.close()
            return jsonify({"data": [], "total": 0, "summary": {}, "message": "Detail Barang HPP hanya untuk project MKT."})

        project_filter = """
            (
                det.PROJECTID = ?
                OR podet.PROJECTID = ?
                OR rd.PROJECTID = ?
            )
        """
        project_params = [selected_project_id, selected_project_id, selected_project_id]
        amount_expr = """
            COALESCE(det.QUANTITY, 0) * COALESCE(det.UNITPRICE, 0) *
            (1 - (
                CASE
                    WHEN TRIM(CAST(det.ITEMDISCPC AS VARCHAR(32))) = '' THEN 0
                    ELSE COALESCE(CAST(det.ITEMDISCPC AS DOUBLE PRECISION), 0)
                END
            ) / 100)
        """
        cur.execute(f"""
            SELECT COUNT(*), COALESCE(SUM(det.QUANTITY), 0), COALESCE(SUM({amount_expr}), 0)
            FROM APINV ai
            JOIN APITMDET det ON det.APINVOICEID = ai.APINVOICEID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            LEFT JOIN PO po ON po.POID = det.POID
            LEFT JOIN PODET podet ON podet.POID = det.POID AND podet.SEQ = det.POSEQ
            LEFT JOIN REQUISITIONDET rd ON rd.REQID = podet.REQID AND rd.SEQ = podet.REQSEQ
            WHERE det.ITEMNO IS NOT NULL
              AND {PROJECT_HPP_ITEM_ACCOUNT_CONDITION}
              AND NOT UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH 'AI-A'
              AND {project_filter}
        """, project_params)
        summary_row = cur.fetchone() or [0, 0, 0]

        cur.execute("""
            SELECT
                po.PODATE,
                po.PONO,
                pd.NAME,
                MAX(rq.REQNO),
                MAX(COALESCE(NULLIF(TRIM(rd.ITEMRESERVED9), ''), '')),
                COALESCE(po.FREIGHT, 0)
            FROM PO po
            LEFT JOIN PERSONDATA pd ON pd.ID = po.VENDORID
            LEFT JOIN PODET podet ON podet.POID = po.POID
            LEFT JOIN REQUISITION rq ON rq.REQID = podet.REQID
            LEFT JOIN REQUISITIONDET rd ON rd.REQID = podet.REQID AND rd.SEQ = podet.REQSEQ
            WHERE COALESCE(po.FREIGHT, 0) <> 0
              AND (
                podet.PROJECTID = ?
                OR rd.PROJECTID = ?
              )
            GROUP BY po.PODATE, po.PONO, pd.NAME, po.FREIGHT
            ORDER BY po.PODATE DESC, po.PONO
        """, [selected_project_id, selected_project_id])
        add_cost_rows = cur.fetchall()

        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                ai.INVOICEDATE,
                ai.INVOICENO,
                pd.NAME,
                po.PONO,
                rq.REQNO,
                COALESCE(NULLIF(TRIM(det.ITEMRESERVED9), ''), NULLIF(TRIM(podet.ITEMRESERVED9), ''), NULLIF(TRIM(rd.ITEMRESERVED9), '')),
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                {amount_expr},
                i.INVENTORYGLACCNT
            FROM APINV ai
            JOIN APITMDET det ON det.APINVOICEID = ai.APINVOICEID
            LEFT JOIN PERSONDATA pd ON pd.ID = ai.VENDORID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            LEFT JOIN PO po ON po.POID = det.POID
            LEFT JOIN PODET podet ON podet.POID = det.POID AND podet.SEQ = det.POSEQ
            LEFT JOIN REQUISITION rq ON rq.REQID = podet.REQID
            LEFT JOIN REQUISITIONDET rd ON rd.REQID = podet.REQID AND rd.SEQ = podet.REQSEQ
            WHERE det.ITEMNO IS NOT NULL
              AND {PROJECT_HPP_ITEM_ACCOUNT_CONDITION}
              AND NOT UPPER(TRIM(COALESCE(po.PONO, ''))) STARTING WITH 'AI-A'
              AND {project_filter}
            ORDER BY ai.INVOICEDATE DESC, ai.INVOICENO, det.SEQ
        """, [limit, offset] + project_params)
        rows = cur.fetchall()
        con.close()

        data = []
        for row in rows:
            data.append({
                "jenis": "Barang",
                "tanggal": str(row[0]) if row[0] else "",
                "no_penerimaan": str(row[1] or "").strip(),
                "nama_pemasok": str(row[2] or "").strip(),
                "no_pesanan": str(row[3] or "").strip(),
                "no_permintaan": str(row[4] or "").strip(),
                "referensi_ai_pp": str(row[5] or "").strip(),
                "no_barang": str(row[6] or "").strip(),
                "nama_barang": str(row[7] or "").strip(),
                "qty": _to_float(row[8]),
                "unit": str(row[9] or "").strip(),
                "harga": round(_to_float(row[10]), 2),
                "nilai": round(_to_float(row[11]), 2),
                "akun_persediaan": str(row[12] or "").strip(),
            })

        for row in add_cost_rows:
            data.append({
                "jenis": "Add Cost",
                "tanggal": str(row[0]) if row[0] else "",
                "no_penerimaan": "",
                "nama_pemasok": str(row[2] or "").strip(),
                "no_pesanan": str(row[1] or "").strip(),
                "no_permintaan": str(row[3] or "").strip(),
                "referensi_ai_pp": str(row[4] or "").strip(),
                "no_barang": "",
                "nama_barang": "Add Cost Pembelian",
                "qty": 0,
                "unit": "",
                "harga": 0,
                "nilai": round(_to_float(row[5]), 2),
                "akun_persediaan": "",
            })

        return jsonify({
            "data": data,
            "total": int(summary_row[0] or 0) + len(add_cost_rows),
            "summary": {
                "qty": round(_to_float(summary_row[1]), 2),
                "nilai": round(_to_float(summary_row[2]) + sum(_to_float(row[5]) for row in add_cost_rows), 2),
            },
        })
    except Exception as e:
        print(f"Error api_project_report_hpp_items: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/project/report/revenue-items")
@jwt_required()
def api_project_report_revenue_items():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        project_no = request.args.get("project_no", "").strip()
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 100))
        if not project_no:
            return jsonify({"data": [], "total": 0, "summary": {}, "message": "No project wajib diisi."}), 400

        con = fdb.connect(**DB_CONFIG)
        cur = con.cursor()
        cur.execute("""
            SELECT FIRST 1 p.PROJECTID, p.PROJECTNO
            FROM PROJECT p
            WHERE UPPER(TRIM(p.PROJECTNO)) = UPPER(TRIM(?))
        """, [project_no])
        project = cur.fetchone()
        if not project:
            con.close()
            return jsonify({"data": [], "total": 0, "summary": {}, "message": "Project tidak ditemukan."})

        selected_project_id = int(project[0] or 0)
        selected_project_no = str(project[1] or "").strip()
        if _detect_project_type(selected_project_no) != "mkt":
            con.close()
            return jsonify({"data": [], "total": 0, "summary": {}, "message": "Detail Pendapatan Usaha hanya untuk project MKT."})

        amount_expr = """
            COALESCE(det.QUANTITY, 0) * COALESCE(det.UNITPRICE, 0) *
            (1 - (
                CASE
                    WHEN TRIM(CAST(det.ITEMDISCPC AS VARCHAR(32))) = '' THEN 0
                    ELSE COALESCE(CAST(det.ITEMDISCPC AS DOUBLE PRECISION), 0)
                END
            ) / 100)
        """
        project_filter = """
            (
                det.PROJECTID = ?
                OR sodet.PROJECTID = ?
            )
        """
        project_params = [selected_project_id, selected_project_id]

        cur.execute(f"""
            SELECT COUNT(*), COALESCE(SUM(det.QUANTITY), 0), COALESCE(SUM({amount_expr}), 0)
            FROM ARINV ar
            JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            LEFT JOIN SODET sodet ON sodet.SOID = det.SOID AND sodet.SEQ = det.SOSEQ
            WHERE det.ITEMNO IS NOT NULL
              AND {project_filter}
        """, project_params)
        summary_row = cur.fetchone() or [0, 0, 0]

        cur.execute(f"""
            SELECT FIRST ? SKIP ?
                ar.INVOICEDATE,
                ar.INVOICENO,
                pd.NAME,
                so.SONO,
                ar.PURCHASEORDERNO,
                det.ITEMNO,
                COALESCE(NULLIF(TRIM(det.ITEMOVDESC), ''), i.ITEMDESCRIPTION),
                det.QUANTITY,
                det.ITEMUNIT,
                det.UNITPRICE,
                {amount_expr}
            FROM ARINV ar
            JOIN ARINVDET det ON det.ARINVOICEID = ar.ARINVOICEID
            LEFT JOIN PERSONDATA pd ON pd.ID = ar.CUSTOMERID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            LEFT JOIN SO so ON so.SOID = det.SOID
            LEFT JOIN SODET sodet ON sodet.SOID = det.SOID AND sodet.SEQ = det.SOSEQ
            WHERE det.ITEMNO IS NOT NULL
              AND {project_filter}
            ORDER BY ar.INVOICEDATE DESC, ar.INVOICENO, det.SEQ
        """, [limit, offset] + project_params)
        rows = cur.fetchall()
        if not rows and int(summary_row[0] or 0) == 0:
            cur.execute("""
                SELECT COUNT(*), COALESCE(SUM(gh.BASEAMOUNT), 0)
                FROM GLHIST gh
                WHERE gh.PROJECTID = ?
                  AND gh.GLACCOUNT = ?
            """, [selected_project_id, PROJECT_REVENUE_ACCOUNT])
            gl_summary = cur.fetchone() or [0, 0]
            cur.execute("""
                SELECT FIRST ? SKIP ?
                    gh.TRANSDATE,
                    CASE
                        WHEN gh.SOURCE = 'AR' AND gh.INVOICEID IS NOT NULL THEN (
                            SELECT FIRST 1 ar.INVOICENO
                            FROM ARINV ar
                            WHERE ar.ARINVOICEID = gh.INVOICEID
                        )
                        ELSE NULL
                    END AS DOCNO,
                    gh.TRANSDESCRIPTION,
                    gh.BASEAMOUNT
                FROM GLHIST gh
                WHERE gh.PROJECTID = ?
                  AND gh.GLACCOUNT = ?
                ORDER BY gh.TRANSDATE DESC, gh.GLHISTID DESC
            """, [limit, offset, selected_project_id, PROJECT_REVENUE_ACCOUNT])
            gl_rows = cur.fetchall()
            con.close()
            data = []
            for row in gl_rows:
                data.append({
                    "tanggal": str(row[0]) if row[0] else "",
                    "no_invoice": str(row[1] or "").strip(),
                    "nama_customer": "",
                    "no_so": "",
                    "po_customer": "",
                    "no_barang": "",
                    "nama_barang": str(row[2] or "").strip(),
                    "qty": 0,
                    "unit": "",
                    "harga": 0,
                    "nilai": round(abs(_to_float(row[3])), 2),
                })
            return jsonify({
                "data": data,
                "total": int(gl_summary[0] or 0),
                "summary": {
                    "qty": 0,
                    "nilai": round(abs(_to_float(gl_summary[1])), 2),
                },
                "source": "glhist",
            })
        con.close()

        data = []
        for row in rows:
            data.append({
                "tanggal": str(row[0]) if row[0] else "",
                "no_invoice": str(row[1] or "").strip(),
                "nama_customer": str(row[2] or "").strip(),
                "no_so": str(row[3] or "").strip(),
                "po_customer": str(row[4] or "").strip(),
                "no_barang": str(row[5] or "").strip(),
                "nama_barang": str(row[6] or "").strip(),
                "qty": _to_float(row[7]),
                "unit": str(row[8] or "").strip(),
                "harga": round(_to_float(row[9]), 2),
                "nilai": round(_to_float(row[10]), 2),
            })

        return jsonify({
            "data": data,
            "total": int(summary_row[0] or 0),
            "summary": {
                "qty": round(_to_float(summary_row[1]), 2),
                "nilai": round(_to_float(summary_row[2]), 2),
            },
        })
    except Exception as e:
        print(f"Error api_project_report_revenue_items: {e}")
        return jsonify({"data": [], "total": 0, "summary": {}, "error": str(e)})


@app.route("/api/project/report-note", methods=["POST"])
@jwt_required()
def api_project_report_note_save():
    if not check_permission("project"):
        return jsonify({"message": "Akses ditolak"}), 403
    try:
        data = request.get_json(silent=True) or {}
        project_no = str(data.get("project_no") or "").strip()
        note = str(data.get("note") or "").strip()
        if not project_no:
            return jsonify({"message": "No project wajib diisi."}), 400

        user = get_current_user()
        saved = save_project_report_note(project_no, note, user.get("username"))
        audit_current_user(
            "project_report_note_save",
            "project",
            f"Simpan catatan laporan project {project_no}",
            {"project_no": project_no, "note_length": len(note)},
        )
        return jsonify({"message": "Catatan laporan project disimpan.", "data": saved})
    except Exception as e:
        print(f"Error api_project_report_note_save: {e}")
        return jsonify({"message": "Gagal menyimpan catatan laporan project.", "error": str(e)}), 500


def background_sync():
    last_data = []
    while True:
        current_data = get_stock_data()
        check_new_items()
        try:
            con = fdb.connect(**DB_CONFIG)
            cur = con.cursor()
            sync_itemhist_detected_today(cur)
            con.close()
        except Exception as e:
            print(f"Error sync itemhist detected: {e}")
        if current_data != last_data:
            socketio.emit("stock_update", current_data)
            last_data = current_data
        time.sleep(3)


if __name__ == "__main__":
    init_db()
    init_baseline()
    thread = threading.Thread(target=background_sync)
    thread.daemon = True
    thread.start()
    print(f"Server jalan di http://0.0.0.0:{BACKEND_PORT}")
    print(f"Akses dari jaringan lokal: http://<IP-komputer-ini>:{BACKEND_PORT}")
    socketio.run(app, host="0.0.0.0", debug=False, port=BACKEND_PORT, allow_unsafe_werkzeug=True)
