import hmac
import math

from flask import Blueprint, jsonify, request


def create_integration_blueprint(get_penjualan_so_data, get_saved_reports_metadata, get_saved_report_list, api_keys, available_columns):
    integration = Blueprint("integration", __name__, url_prefix="/api/integration")

    def has_valid_api_key():
        supplied_key = request.headers.get("X-API-Key", "")
        if not supplied_key:
            return False
        return any(hmac.compare_digest(supplied_key, api_key) for api_key in api_keys)

    @integration.get("/penjualan-so")
    def penjualan_so():
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

    @integration.get("/v1/saved-reports")
    def saved_reports():
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
    def saved_report_list(id_report):
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
