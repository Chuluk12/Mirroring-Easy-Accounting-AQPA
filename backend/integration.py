import hmac

from flask import Blueprint, jsonify, request


def create_integration_blueprint(get_penjualan_so_data, api_key):
    integration = Blueprint("integration", __name__, url_prefix="/api/integration")

    @integration.get("/penjualan-so")
    def penjualan_so():
        if not api_key:
            return jsonify({"message": "Integration API key belum dikonfigurasi"}), 503
        supplied_key = request.headers.get("X-API-Key", "")
        if not supplied_key or not hmac.compare_digest(supplied_key, api_key):
            return jsonify({"message": "API key tidak valid"}), 401

        try:
            return jsonify(get_penjualan_so_data())
        except ValueError as e:
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            print(f"Error api_integration_penjualan_so: {e}")
            return jsonify({"message": "Gagal mengambil data penjualan SO"}), 500

    return integration
