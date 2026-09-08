import hmac
import math

from apispec import APISpec
from apispec.ext.marshmallow import MarshmallowPlugin
from flask import Blueprint, jsonify, request
from flask_apispec import doc, use_kwargs, FlaskApiSpec
from marshmallow import Schema, fields


class PenjualanSOQuerySchema(Schema):
    limit = fields.Int(load_default=20, metadata={"description": "Jumlah data per halaman (1-1000)"})
    page = fields.Int(load_default=1, metadata={"description": "Nomor halaman (minimal 1)"})
    search = fields.Str(load_default="", metadata={"description": "Kata kunci pencarian"})
    date_from = fields.Str(load_default="", metadata={"description": "Tanggal mulai (YYYY-MM-DD)"})
    date_to = fields.Str(load_default="", metadata={"description": "Tanggal selesai (YYYY-MM-DD)"})
    status = fields.Str(load_default="", metadata={"description": "Filter status"})
    columns = fields.Str(load_default="", metadata={"description": "Daftar kolom dipisahkan koma"})
    sortby = fields.Str(load_default="tgl_so", metadata={"description": "Kolom sorting"})
    sort_order = fields.Str(load_default="desc", metadata={"description": "Urutan sorting (asc/desc)"})


class PembelianQuerySchema(Schema):
    limit = fields.Int(load_default=20, metadata={"description": "Jumlah data per halaman (1-1000)"})
    page = fields.Int(load_default=None, metadata={"description": "Nomor halaman (1-based, alternatif offset)"})
    offset = fields.Int(load_default=None, metadata={"description": "Offset data (0-based)"})
    search = fields.Str(load_default="", metadata={"description": "Kata kunci pencarian"})
    date_from = fields.Str(load_default="", metadata={"description": "Tanggal mulai (YYYY-MM-DD)"})
    date_to = fields.Str(load_default="", metadata={"description": "Tanggal selesai (YYYY-MM-DD)"})
    status = fields.Str(load_default="", metadata={"description": "Filter status"})
    po_type = fields.Str(load_default="", metadata={"description": "Filter tipe PO (AI-S, AI-SRV, AI-BM, AI-A)"})
    columns = fields.Str(load_default="", metadata={"description": "Daftar kolom dipisahkan koma"})
    exclude_internal_so = fields.Bool(load_default=False, metadata={"description": "Filter exclude internal SO"})
    include_payment = fields.Bool(load_default=True, metadata={"description": "Sertakan status pembayaran"})


class SavedReportsQuerySchema(Schema):
    limit = fields.Int(load_default=50, metadata={"description": "Jumlah data per halaman (1-1000)"})
    page = fields.Int(load_default=1, metadata={"description": "Nomor halaman (minimal 1)"})
    search = fields.Str(load_default="", metadata={"description": "Kata kunci pencarian nama laporan"})
    user = fields.Str(load_default="", metadata={"description": "Filter user pemilik laporan"})


class SavedReportListQuerySchema(Schema):
    limit = fields.Int(load_default=50, metadata={"description": "Jumlah data per halaman (1-1000)"})
    page = fields.Int(load_default=1, metadata={"description": "Nomor halaman (minimal 1)"})
    search = fields.Str(load_default="", metadata={"description": "Kata kunci pencarian data laporan"})
    user = fields.Str(load_default="", metadata={"description": "Filter user"})
    date_from = fields.Str(load_default="", metadata={"description": "Tanggal mulai (YYYY-MM-DD)"})
    date_to = fields.Str(load_default="", metadata={"description": "Tanggal selesai (YYYY-MM-DD)"})
    columns = fields.Str(load_default="", metadata={"description": "Daftar kolom dipisahkan koma"})


def register_integration_docs(docs: FlaskApiSpec):
    docs.register(penjualan_so, blueprint="integration")
    docs.register(penjualan_so_detail, blueprint="integration")
    docs.register(pembelian, blueprint="integration")
    docs.register(pembelian_detail, blueprint="integration")
    docs.register(saved_reports, blueprint="integration")
    docs.register(saved_report_list, blueprint="integration")


# Views defined at module level for flask-apispec doc inspection
@doc(
    tags=["Integration"],
    summary="Ambil data Penjualan Sales Order (SO)",
    description="Endpoint integrasi untuk mengambil data Penjualan SO dengan pagination, filter tanggal/status/search, dan pemilihan kolom.",
    params={
        "X-API-Key": {
            "description": "API Key untuk otentikasi integrasi",
            "in": "header",
            "type": "string",
            "required": True,
        }
    },
    responses={
        200: {"description": "Data Penjualan SO berhasil diambil"},
        400: {"description": "Parameter query tidak valid"},
        401: {"description": "API key tidak valid atau tidak disediakan"},
        500: {"description": "Kesalahan server internal"},
        503: {"description": "Integration API key belum dikonfigurasi pada server"},
    },
)
@use_kwargs(PenjualanSOQuerySchema, location="query")
def penjualan_so(**kwargs):
    pass


@doc(
    tags=["Integration"],
    summary="Ambil detail Penjualan Sales Order (SO) berdasarkan nomor SO",
    description="Endpoint integrasi untuk mengambil detail data Penjualan SO beserta daftar item-nya berdasarkan no_so.",
    params={
        "X-API-Key": {
            "description": "API Key untuk otentikasi integrasi",
            "in": "header",
            "type": "string",
            "required": True,
        },
        "no_so": {
            "description": "Nomor Sales Order (SO)",
            "in": "path",
            "type": "string",
            "required": True,
        },
    },
    responses={
        200: {"description": "Detail Penjualan SO berhasil diambil"},
        400: {"description": "Parameter nomor SO tidak valid"},
        401: {"description": "API key tidak valid atau tidak disediakan"},
        404: {"description": "Sales Order tidak ditemukan"},
        500: {"description": "Kesalahan server internal"},
        503: {"description": "Integration API key belum dikonfigurasi pada server"},
    },
)
def penjualan_so_detail(no_so, **kwargs):
    pass


@doc(
    tags=["Integration"],
    summary="Ambil data Pembelian (Purchase Order / PO)",
    description="Endpoint integrasi untuk mengambil data Pembelian / PO dengan pagination, filter tanggal/status/tipe/search, response detail meta, total_amount, total_rows, dan total_so.",
    params={
        "X-API-Key": {
            "description": "API Key untuk otentikasi integrasi",
            "in": "header",
            "type": "string",
            "required": True,
        }
    },
    responses={
        200: {"description": "Data Pembelian berhasil diambil"},
        400: {"description": "Parameter query tidak valid"},
        401: {"description": "API key tidak valid atau tidak disediakan"},
        500: {"description": "Kesalahan server internal"},
        503: {"description": "Integration API key belum dikonfigurasi pada server"},
    },
)
@use_kwargs(PembelianQuerySchema, location="query")
def pembelian(**kwargs):
    pass


@doc(
    tags=["Integration"],
    summary="Ambil detail Pembelian (Purchase Order / PO) berdasarkan nomor PO",
    description="Endpoint integrasi untuk mengambil detail data Pembelian / PO beserta daftar item-nya berdasarkan no_po.",
    params={
        "X-API-Key": {
            "description": "API Key untuk otentikasi integrasi",
            "in": "header",
            "type": "string",
            "required": True,
        },
        "no_po": {
            "description": "Nomor Purchase Order (PO)",
            "in": "path",
            "type": "string",
            "required": True,
        },
    },
    responses={
        200: {"description": "Detail Pembelian berhasil diambil"},
        400: {"description": "Parameter nomor PO tidak valid"},
        401: {"description": "API key tidak valid atau tidak disediakan"},
        404: {"description": "Purchase Order tidak ditemukan"},
        500: {"description": "Kesalahan server internal"},
        503: {"description": "Integration API key belum dikonfigurasi pada server"},
    },
)
def pembelian_detail(no_po, **kwargs):
    pass


@doc(
    tags=["Integration"],
    summary="Ambil metadata Saved Reports",
    description="Endpoint integrasi untuk mengambil daftar metadata laporan tersimpan (saved reports) beserta permission/setting.",
    params={
        "X-API-Key": {
            "description": "API Key untuk otentikasi integrasi",
            "in": "header",
            "type": "string",
            "required": True,
        }
    },
    responses={
        200: {"description": "Metadata Saved Reports berhasil diambil"},
        400: {"description": "Parameter query tidak valid"},
        401: {"description": "API key tidak valid atau tidak disediakan"},
        500: {"description": "Kesalahan server internal"},
        503: {"description": "Integration API key belum dikonfigurasi pada server"},
    },
)
@use_kwargs(SavedReportsQuerySchema, location="query")
def saved_reports(**kwargs):
    pass


@doc(
    tags=["Integration"],
    summary="Ambil detail isi Saved Report berdasarkan ID",
    description="Endpoint integrasi untuk mengambil record data isi dari Saved Report berdasarkan id_report.",
    params={
        "X-API-Key": {
            "description": "API Key untuk otentikasi integrasi",
            "in": "header",
            "type": "string",
            "required": True,
        },
        "id_report": {
            "description": "ID Saved Report",
            "in": "path",
            "type": "integer",
            "required": True,
        },
    },
    responses={
        200: {"description": "Data record Saved Report berhasil diambil"},
        400: {"description": "Parameter query tidak valid"},
        401: {"description": "API key tidak valid atau tidak disediakan"},
        500: {"description": "Kesalahan server internal"},
        503: {"description": "Integration API key belum dikonfigurasi pada server"},
    },
)
@use_kwargs(SavedReportListQuerySchema, location="query")
def saved_report_list(id_report, **kwargs):
    pass


def create_integration_blueprint(
    get_penjualan_so_data,
    get_saved_reports_metadata,
    get_saved_report_list,
    api_keys,
    available_columns,
    get_pembelian_data=None,
    available_pembelian_columns=None,
    get_penjualan_so_by_no=None,
    get_pembelian_by_no=None,
):
    integration = Blueprint("integration", __name__, url_prefix="/api/integration")
    pembelian_columns_set = available_pembelian_columns or []

    def has_valid_api_key():
        supplied_key = request.headers.get("X-API-Key", "")
        if not supplied_key:
            return False
        return any(hmac.compare_digest(supplied_key, api_key) for api_key in api_keys)

    @integration.get("/penjualan-so")
    def penjualan_so(**kwargs):
        if not api_keys:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        if not has_valid_api_key():
            return jsonify({"message": "API key tidak valid"}), 401

        try:
            limit = int(request.args.get("limit", 20))
            page = int(request.args.get("page", 1))
            if page < 1 or not 1 <= limit <= 1000:
                raise ValueError("page minimal 1 dan limit harus antara 1-1000")

            requested_columns = [column.strip() for column in request.args.get("columns", "").split(",") if column.strip()]
            invalid_columns = sorted(set(requested_columns) - set(available_columns))
            if invalid_columns:
                raise ValueError(f"columns tidak valid: {', '.join(invalid_columns)}")

            result = get_penjualan_so_data({
                "search": request.args.get("search", ""),
                "date_from": request.args.get("date_from", ""),
                "date_to": request.args.get("date_to", ""),
                "status": request.args.get("status", ""),
                "offset": (page - 1) * limit,
                "limit": limit,
                "sortby": request.args.get("sortby", "tgl_so"),
                "sort_order": request.args.get("sort_order", "desc"),
            })
            columns = requested_columns or available_columns
            result["data"] = [{column: row.get(column) for column in columns} for row in result["data"]]
            total_rows = result["total_rows"]
            total_pages = math.ceil(total_rows / limit) if total_rows else 0
            result["meta"] = {
                "current_page": page,
                "per_page": limit,
                "total_pages": total_pages,
                "total_rows": total_rows,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            }
            return jsonify(result)
        except ValueError as e:
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            print(f"Error api_integration_penjualan_so: {e}")
            return jsonify({"message": "Gagal mengambil data penjualan SO"}), 500

    @integration.get("/penjualan-so/<path:no_so>")
    def penjualan_so_detail(no_so, **kwargs):
        if not api_keys:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        if not has_valid_api_key():
            return jsonify({"message": "API key tidak valid"}), 401
        if not get_penjualan_so_by_no:
            return jsonify({"message": "Service data detail penjualan SO belum dikonfigurasi"}), 503

        try:
            requested_columns = [column.strip() for column in request.args.get("columns", "").split(",") if column.strip()]
            invalid_columns = sorted(set(requested_columns) - set(available_columns))
            if invalid_columns:
                raise ValueError(f"columns tidak valid: {', '.join(invalid_columns)}")

            result = get_penjualan_so_by_no(no_so)
            if not result:
                return jsonify({"message": f"Sales Order dengan nomor '{no_so}' tidak ditemukan"}), 404

            columns = requested_columns or available_columns
            if "items" in result:
                result["items"] = [{column: row.get(column) for column in columns} for row in result["items"]]
            return jsonify(result)
        except ValueError as e:
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            print(f"Error api_integration_penjualan_so_detail: {e}")
            return jsonify({"message": "Gagal mengambil detail data penjualan SO"}), 500

    @integration.get("/pembelian")
    def pembelian(**kwargs):
        if not api_keys:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        if not has_valid_api_key():
            return jsonify({"message": "API key tidak valid"}), 401
        if not get_pembelian_data:
            return jsonify({"message": "Service data pembelian belum dikonfigurasi"}), 503

        try:
            limit = int(request.args.get("limit", 20))
            if not 1 <= limit <= 1000:
                raise ValueError("limit harus antara 1-1000")

            if "offset" in request.args:
                offset = int(request.args.get("offset", 0))
                if offset < 0:
                    raise ValueError("offset minimal 0")
                page = (offset // limit) + 1
            else:
                page = int(request.args.get("page", 1))
                if page < 1:
                    raise ValueError("page minimal 1")
                offset = (page - 1) * limit

            requested_columns = [column.strip() for column in request.args.get("columns", "").split(",") if column.strip()]
            if pembelian_columns_set and requested_columns:
                invalid_columns = sorted(set(requested_columns) - set(pembelian_columns_set))
                if invalid_columns:
                    raise ValueError(f"columns tidak valid: {', '.join(invalid_columns)}")

            result = get_pembelian_data({
                "search": request.args.get("search", ""),
                "date_from": request.args.get("date_from", ""),
                "date_to": request.args.get("date_to", ""),
                "status": request.args.get("status", ""),
                "po_type": request.args.get("po_type", ""),
                "exclude_internal_so": request.args.get("exclude_internal_so", ""),
                "include_payment": request.args.get("include_payment", "1"),
                "offset": offset,
                "limit": limit,
            })
            columns = requested_columns or pembelian_columns_set
            if columns:
                result["data"] = [{column: row.get(column) for column in columns} for row in result["data"]]

            total_rows = result.get("total_rows", 0)
            total_pages = math.ceil(total_rows / limit) if total_rows else 0
            result["meta"] = {
                "current_page": page,
                "has_next": (offset + limit) < total_rows,
                "has_previous": offset > 0,
                "per_page": limit,
                "total_pages": total_pages,
                "total_rows": total_rows,
            }
            return jsonify(result)
        except ValueError as e:
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            print(f"Error api_integration_pembelian: {e}")
            return jsonify({"message": "Gagal mengambil data pembelian"}), 500

    @integration.get("/pembelian/<path:no_po>")
    def pembelian_detail(no_po, **kwargs):
        if not api_keys:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        if not has_valid_api_key():
            return jsonify({"message": "API key tidak valid"}), 401
        if not get_pembelian_by_no:
            return jsonify({"message": "Service data detail pembelian belum dikonfigurasi"}), 503

        try:
            requested_columns = [column.strip() for column in request.args.get("columns", "").split(",") if column.strip()]
            if pembelian_columns_set and requested_columns:
                invalid_columns = sorted(set(requested_columns) - set(pembelian_columns_set))
                if invalid_columns:
                    raise ValueError(f"columns tidak valid: {', '.join(invalid_columns)}")

            result = get_pembelian_by_no(no_po)
            if not result:
                return jsonify({"message": f"Purchase Order dengan nomor '{no_po}' tidak ditemukan"}), 404

            columns = requested_columns or pembelian_columns_set
            if columns and "items" in result:
                result["items"] = [{column: row.get(column) for column in columns} for row in result["items"]]
            return jsonify(result)
        except ValueError as e:
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            print(f"Error api_integration_pembelian_detail: {e}")
            return jsonify({"message": "Gagal mengambil detail data pembelian"}), 500

    @integration.get("/v1/saved-reports")
    def saved_reports(**kwargs):
        if not api_keys:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        if not has_valid_api_key():
            return jsonify({"message": "API key tidak valid"}), 401

        try:
            limit = int(request.args.get("limit", 50))
            page = int(request.args.get("page", 1))
            if page < 1 or not 1 <= limit <= 1000:
                raise ValueError("page minimal 1 dan limit harus antara 1-1000")

            result = get_saved_reports_metadata({
                "search": request.args.get("search", ""),
                "user": request.args.get("user", ""),
                "offset": (page - 1) * limit,
                "limit": limit,
            })
            total_rows = result["total_rows"]
            total_pages = math.ceil(total_rows / limit) if total_rows else 0
            result["meta"] = {
                "current_page": page,
                "per_page": limit,
                "total_pages": total_pages,
                "total_rows": total_rows,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            }
            return jsonify(result)
        except ValueError as e:
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            print(f"Error api_integration_saved_reports: {e}")
            return jsonify({"message": "Gagal mengambil metadata laporan tersimpan"}), 500

    @integration.get("/v1/saved-reports/<int:id_report>/list")
    def saved_report_list(id_report, **kwargs):
        if not api_keys:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        if not has_valid_api_key():
            return jsonify({"message": "API key tidak valid"}), 401

        try:
            limit = int(request.args.get("limit", 50))
            page = int(request.args.get("page", 1))
            if page < 1 or not 1 <= limit <= 1000:
                raise ValueError("page minimal 1 dan limit harus antara 1-1000")

            result = get_saved_report_list(id_report, {
                "date_from": request.args.get("date_from", ""),
                "date_to": request.args.get("date_to", ""),
                "search": request.args.get("search", ""),
                "user": request.args.get("user", ""),
                "columns": request.args.get("columns", ""),
                "offset": (page - 1) * limit,
                "limit": limit,
            })
            total_rows = result["total_rows"]
            total_pages = math.ceil(total_rows / limit) if total_rows else 0
            result["meta"] = {
                "current_page": page,
                "per_page": limit,
                "total_pages": total_pages,
                "total_rows": total_rows,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            }
            return jsonify(result)
        except ValueError as e:
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            print(f"Error api_integration_saved_report_list: {e}")
            return jsonify({"message": "Gagal mengambil data laporan tersimpan"}), 500

    return integration
