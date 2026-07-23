import hmac
import math

from flask import Blueprint, jsonify, request


def create_integration_blueprint(get_penjualan_so_data, api_key, available_columns):
    integration = Blueprint("integration", __name__, url_prefix="/api/integration")

    @integration.get("/penjualan-so")
    def penjualan_so():
        if not api_key:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        supplied_key = request.headers.get("X-API-Key", "")
        if not supplied_key or not hmac.compare_digest(supplied_key, api_key):
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

    return integration
