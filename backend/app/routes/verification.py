from datetime import datetime
from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User

verification_bp = Blueprint("verification", __name__, url_prefix="/api/verification")


@verification_bp.post("/start")
@jwt_required()
def start_verification():
    """
    Kicks off a KYC session with the vendor (Persona / Veriff / Stripe Identity).

    TODO before production:
      1. Call the vendor's API to create a verification session, return their
         hosted URL or client token to the frontend so it can render their widget.
      2. Vendor calls back via webhook (POST /api/verification/webhook) when the
         session resolves — approve/reject happens there, NOT by trusting the client.
    This stub just flips status to 'pending' so the rest of the flow (KYC gate on
    withdraw, verified-only hangouts) has something real to check against in the meantime.
    """
    user = User.query.get_or_404(get_jwt_identity())
    user.kyc_status = "pending"
    db.session.commit()
    return jsonify({"kyc_status": user.kyc_status, "note": "vendor integration pending — see TODO in this route"})


@verification_bp.post("/webhook")
def vendor_webhook():
    """
    Real endpoint the KYC vendor calls when a session resolves.
    TODO: verify the webhook signature using KYC_API_KEY / vendor's signing secret
    before trusting the payload — this stub is intentionally unauthenticated as a placeholder.
    """
    # Expected shape will depend on the vendor chosen. Sketch:
    # data = request.get_json()
    # user = User.query.get(data["reference_user_id"])
    # if data["status"] == "approved":
    #     user.kyc_status = "approved"
    #     user.is_verified = True
    #     user.verified_at = datetime.utcnow()
    # else:
    #     user.kyc_status = "rejected"
    # db.session.commit()
    return jsonify({"received": True}), 200
