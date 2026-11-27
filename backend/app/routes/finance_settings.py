from flask_jwt_extended import get_jwt_identity
from flask import Blueprint, request, jsonify
from app.utils.admin import admin_required
from app.utils.settings import get_sasapay_config, set_sasapay_config
from app.utils.sasapay_client import get_access_token, SasaPayError

finance_settings_bp = Blueprint("finance_settings", __name__, url_prefix="/api/admin/settings")


def _mask(value):
    """Show just enough to confirm 'yes this is the credential I think it is'
    without displaying the actual secret back to the browser."""
    if not value:
        return None
    return f"{'•' * max(0, len(value) - 4)}{value[-4:]}" if len(value) > 4 else "••••"


@finance_settings_bp.get("/sasapay")
@admin_required
def get_settings():
    cfg = get_sasapay_config()
    return jsonify({
        "base_url": cfg["base_url"],
        "callback_base_url": cfg["callback_base_url"],
        "client_id": _mask(cfg["client_id"]),
        "client_secret": _mask(cfg["client_secret"]),
        "merchant_code": _mask(cfg["merchant_code"]),
        "configured": bool(cfg["client_id"] and cfg["client_secret"] and cfg["merchant_code"]),
        "source": cfg["source"],  # 'database' once saved via this form, 'environment' until then
    })


@finance_settings_bp.post("/sasapay")
@admin_required
def update_settings():
    """
    client_id/client_secret/merchant_code are all optional per-field — leaving
    any blank means "keep the current value" (see set_sasapay_config docstring).
    This lets an admin rotate just the secret without re-entering everything,
    and means the masked values returned by GET are never round-tripped back
    in as if they were real credentials.
    """
    data = request.get_json() or {}
    admin_id = get_jwt_identity()

    set_sasapay_config(
        base_url=(data.get("base_url") or "").strip() or "https://sandbox.sasapay.app",
        callback_base_url=(data.get("callback_base_url") or "").strip() or "http://localhost:5000",
        client_id=(data.get("client_id") or "").strip() or None,
        client_secret=(data.get("client_secret") or "").strip() or None,
        merchant_code=(data.get("merchant_code") or "").strip() or None,
        updated_by=admin_id,
    )
    return jsonify({"status": "saved"})


@finance_settings_bp.post("/sasapay/test")
@admin_required
def test_connection():
    """
    Actually calls SasaPay's auth endpoint with the currently-saved credentials
    rather than just checking they're non-empty — the only real way to know
    "did I type the client secret right" before a real host tries to withdraw.
    """
    try:
        get_access_token()
        return jsonify({"success": True, "message": "Connected — credentials are valid."})
    except SasaPayError as e:
        return jsonify({"success": False, "message": str(e)}), 200
    except Exception as e:
        return jsonify({"success": False, "message": f"Connection failed: {e}"}), 200
