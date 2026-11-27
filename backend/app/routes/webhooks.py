"""
SasaPay calls these endpoints asynchronously once a collection (pass purchase /
paid hangout join) or payout (host withdrawal) actually resolves. This is the
ONLY place a Transaction moves from 'pending' to 'completed' — never trust the
initial POST response in passes.py / hangouts.py / earnings.py, since those just
mean "request sent," not "money moved."

IMPORTANT: the exact payload shape below is reconstructed from SasaPay's public
docs and may not match sandbox reality exactly (field names/casing, nesting) —
log the raw payload the first time you hit this in sandbox and adjust the
parsing before relying on it. Signature verification is also a TODO: confirm
with SasaPay support what mechanism they use to let you verify a callback
actually came from them (shared secret header, IP allowlist, etc.) — don't ship
this endpoint unauthenticated.
"""
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from app.extensions import db
from app.models.pass_model import Transaction
from app.models.user import User
from app.models.hangout import HangoutMember
from app.utils.passes import grant_pass

webhooks_bp = Blueprint("webhooks", __name__, url_prefix="/api/webhooks/sasapay")


@webhooks_bp.post("/collection")
def collection_callback():
    payload = request.get_json(force=True, silent=True) or {}
    current_app.logger.info("SasaPay collection callback: %s", payload)

    checkout_request_id = payload.get("CheckoutRequestID") or payload.get("TransactionReference")
    result_code = str(payload.get("ResultCode", payload.get("ResponseCode", "")))
    success = result_code == "0"

    txn = Transaction.query.filter_by(checkout_request_id=checkout_request_id).first()
    if not txn:
        current_app.logger.warning("No matching transaction for checkout_request_id=%s", checkout_request_id)
        return jsonify({"received": True}), 200  # ack anyway — don't make SasaPay retry forever

    if txn.status != "pending":
        return jsonify({"received": True}), 200  # already processed, avoid double-granting

    txn.sasapay_transaction_code = payload.get("SasaPayTransactionCode") or payload.get("TransID")
    txn.status = "completed" if success else "failed"
    db.session.add(txn)

    if success:
        if txn.type == "pass_purchase":
            # tier was embedded in AccountReference as "pass:<tier>:<user_id>" when we
            # called request_collection — parse it back out (adjust if SasaPay echoes
            # your AccountReference directly in the callback, which would be cleaner).
            ref = payload.get("BillRefNumber") or payload.get("AccountReference") or ""
            parts = ref.split(":")
            tier = parts[1] if len(parts) >= 2 else None
            if tier:
                grant_pass(txn.user_id, tier, source="purchase")

        elif txn.type == "hangout_join_paid":
            hangout = None
            if txn.hangout_id:
                from app.models.hangout import Hangout
                hangout = Hangout.query.get(txn.hangout_id)
            if hangout:
                # Payment is what makes someone a member of a paid hangout (see _join_paid_hangout).
                member = HangoutMember.query.filter_by(hangout_id=hangout.id, user_id=txn.user_id).first()
                if member:
                    member.status = "active"
                else:
                    db.session.add(HangoutMember(hangout_id=hangout.id, user_id=txn.user_id, status="active"))
                grant_pass(txn.user_id, hangout.pass_tier, source="hangout_join", source_hangout_id=hangout.id,
                           starts_at=hangout.starts_at)  # begins with the hangout, not at payment

    db.session.commit()
    return jsonify({"received": True}), 200


@webhooks_bp.post("/payout")
def payout_callback():
    payload = request.get_json(force=True, silent=True) or {}
    current_app.logger.info("SasaPay payout callback: %s", payload)

    checkout_request_id = payload.get("B2CRequestID") or payload.get("ConversationID")
    result_code = str(payload.get("ResultCode", payload.get("ResponseCode", "")))
    success = result_code == "0"

    txn = Transaction.query.filter_by(checkout_request_id=checkout_request_id, type="payout").first()
    if not txn:
        current_app.logger.warning("No matching payout transaction for id=%s", checkout_request_id)
        return jsonify({"received": True}), 200

    if txn.status != "pending":
        return jsonify({"received": True}), 200

    txn.sasapay_transaction_code = payload.get("SasaPayTransactionCode") or payload.get("TransID")
    txn.status = "completed" if success else "failed"
    # NOTE: on failure, the amount should be credited back to available balance —
    # earnings.py sums completed payouts only, so a 'failed' status already handles
    # this correctly as long as summary() filters on status='completed' (it does).
    db.session.commit()
    return jsonify({"received": True}), 200
