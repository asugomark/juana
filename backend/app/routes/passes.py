from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.pass_model import Transaction
from app.utils.passes import has_active_pass, upcoming_pass_start, PASS_DURATIONS
from app.utils.sasapay_client import request_collection, process_wallet_otp, SasaPayError
from app.utils.settings import get_sasapay_config
from app.utils.phone import normalize_msisdn

passes_bp = Blueprint("passes", __name__, url_prefix="/api/passes")


@passes_bp.get("/pricing")
def pricing():
    return jsonify(current_app.config["PASS_PRICES"])


@passes_bp.get("/status")
@jwt_required()
def status():
    user_id = get_jwt_identity()
    start = upcoming_pass_start(user_id)
    return jsonify({
        "has_active_pass": has_active_pass(user_id),
        "upcoming_pass_starts_at": start.isoformat() + "Z" if start else None,
    })


@passes_bp.post("/purchase")
@jwt_required()
def purchase():
    """
    Starts a SasaPay collection for a pass. This does NOT grant the pass yet —
    SasaPay's flow is async: this call only triggers an STK push (or, for the
    SasaPay-wallet channel, an OTP) to the payer's phone. The pass is actually
    granted in routes/webhooks.py when SasaPay's IPN callback confirms success.
    The frontend should poll GET /passes/status or listen for a socket event
    after showing "check your phone to approve."
    """
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    tier = data.get("tier")
    phone_number = normalize_msisdn(data.get("phone_number"))  # 0712..., +254712... -> 254712...
    network_code = data.get("network_code", "63902")  # default to M-Pesa; "0" = SasaPay wallet

    if tier not in PASS_DURATIONS:
        return jsonify({"error": "tier must be day, week, or month"}), 400
    if not phone_number:
        return jsonify({"error": "invalid_phone", "message": "Enter a Safaricom number like 0712 345 678"}), 400

    price_cents = current_app.config["PASS_PRICES"][tier]
    amount = price_cents / 100  # SasaPay amounts are decimal KES, not cents

    callback_url = f"{get_sasapay_config()['callback_base_url']}/api/webhooks/sasapay/collection"

    try:
        result = request_collection(
            phone_number=phone_number,
            amount=amount,
            network_code=network_code,
            account_reference=f"pass:{tier}:{user_id}",
            transaction_desc=f"Juana {tier} pass",
            callback_url=callback_url,
        )
    except SasaPayError as e:
        return jsonify({"error": "payment_request_failed", "message": str(e)}), 502

    # Record as pending — routes/webhooks.py flips this to completed and grants the
    # pass once SasaPay confirms. account_reference above is how we match it back up
    # if the webhook payload doesn't echo user_id/tier directly (confirm against SasaPay's
    # actual IPN payload shape in the sandbox before relying on this).
    txn = Transaction(
        user_id=user_id,
        type="pass_purchase",
        amount_cents=price_cents,
        checkout_request_id=result.get("CheckoutRequestID"),
        status="pending",
    )
    db.session.add(txn)
    db.session.commit()

    requires_otp = network_code == "0"
    return jsonify({
        "status": "pending",
        "checkout_request_id": result.get("CheckoutRequestID"),
        "requires_otp": requires_otp,
        "message": result.get("detail", "Check your phone to approve the payment"),
    }), 202


@passes_bp.post("/purchase/confirm-otp")
@jwt_required()
def confirm_otp():
    """Only used when the purchase used the SasaPay-wallet channel (network_code '0')."""
    data = request.get_json() or {}
    checkout_request_id = data.get("checkout_request_id")
    verification_code = data.get("verification_code")

    if not checkout_request_id or not verification_code:
        return jsonify({"error": "checkout_request_id and verification_code are required"}), 400

    try:
        result = process_wallet_otp(
            checkout_request_id=checkout_request_id,
            verification_code=verification_code,
        )
    except SasaPayError as e:
        return jsonify({"error": "otp_confirmation_failed", "message": str(e)}), 502

    # Final status still arrives via the IPN callback, not this response — this just
    # submits the OTP, it doesn't guarantee success.
    return jsonify(result), 200
