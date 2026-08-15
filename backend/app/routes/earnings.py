from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.hangout import Hangout
from app.models.pass_model import Transaction
from app.utils.sasapay_client import send_payout, SasaPayError
from app.utils.settings import get_sasapay_config

earnings_bp = Blueprint("earnings", __name__, url_prefix="/api/earnings")


def _summary_for(host_id):
    revenue_txns = Transaction.query.filter_by(host_id=host_id, status="completed").all()
    gross_cents = sum(t.amount_cents for t in revenue_txns)
    net_cents = int(gross_cents * (1 - current_app.config["PLATFORM_FEE_PCT"]))

    # Payouts: completed ones are paid out; pending ones are in-flight and should
    # still count against available balance so a host can't double-withdraw while
    # SasaPay's callback is still in transit.
    payout_txns = Transaction.query.filter(
        Transaction.user_id == host_id,
        Transaction.type == "payout",
        Transaction.status.in_(["completed", "pending"]),
    ).all()
    committed_cents = sum(-t.amount_cents for t in payout_txns)

    return {
        "available_cents": net_cents - committed_cents,
        "lifetime_earned_cents": net_cents,
        "paid_out_cents": sum(-t.amount_cents for t in payout_txns if t.status == "completed"),
    }


@earnings_bp.get("/summary")
@jwt_required()
def summary():
    return jsonify(_summary_for(get_jwt_identity()))


@earnings_bp.get("/by-hangout")
@jwt_required()
def by_hangout():
    """Revenue grouped per hangout — powers the 'By hangout' breakdown panel."""
    host_id = get_jwt_identity()
    rows = (
        db.session.query(
            Transaction.hangout_id,
            db.func.sum(Transaction.amount_cents).label("gross_cents"),
            db.func.count(Transaction.id).label("passes_sold"),
        )
        .filter(Transaction.host_id == host_id, Transaction.status == "completed")
        .group_by(Transaction.hangout_id)
        .all()
    )

    results = []
    for hangout_id, gross_cents, passes_sold in rows:
        hangout = Hangout.query.get(hangout_id) if hangout_id else None
        results.append({
            "hangout_id": hangout_id,
            "title": hangout.title if hangout else "Deleted hangout",
            "icon": hangout.icon if hangout else "●",
            "pass_tier": hangout.pass_tier if hangout else None,
            "passes_sold": passes_sold,
            "gross_cents": int(gross_cents),
            "net_cents": int(gross_cents * (1 - current_app.config["PLATFORM_FEE_PCT"])),
            "is_live": bool(hangout and (hangout.ends_at is None or hangout.ends_at > datetime.utcnow())),
        })

    results.sort(key=lambda r: r["net_cents"], reverse=True)
    return jsonify(results)


@earnings_bp.get("/transactions")
@jwt_required()
def transactions():
    host_id = get_jwt_identity()
    txns = (
        Transaction.query.filter(
            db.or_(Transaction.host_id == host_id, Transaction.user_id == host_id)
        )
        .order_by(Transaction.created_at.desc())
        .limit(100)
        .all()
    )
    return jsonify([
        {
            "id": t.id,
            "type": t.type,
            "amount_cents": t.amount_cents,
            "hangout_id": t.hangout_id,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
        }
        for t in txns
    ])


@earnings_bp.post("/withdraw")
@jwt_required()
def withdraw():
    """
    KYC gate, per our design: first withdrawal ever requires kyc_status == 'approved';
    subsequent ones just proceed.

    Payout itself goes out via SasaPay B2C to the host's phone number. Like collections,
    this is async — the Transaction is written as 'pending' here and only flips to
    'completed' when routes/webhooks.py:payout_callback() confirms it. The available
    balance already accounts for pending payouts (see _summary_for) so a host can't
    submit a second withdrawal before the first one's callback lands.
    """
    host_id = get_jwt_identity()
    user = User.query.get_or_404(host_id)

    if user.kyc_status != "approved":
        return jsonify({
            "error": "kyc_required",
            "message": "Verify your identity before withdrawing for the first time.",
        }), 403

    data = request.get_json() or {}
    phone_number = data.get("phone_number")
    if not phone_number:
        return jsonify({"error": "phone_number is required for payout"}), 400

    summary_data = _summary_for(host_id)
    available_cents = summary_data["available_cents"]
    if available_cents <= 0:
        return jsonify({"error": "no available balance to withdraw"}), 400

    callback_url = f"{get_sasapay_config()['callback_base_url']}/api/webhooks/sasapay/payout"
    reference = f"payout:{host_id}:{int(available_cents)}"

    try:
        result = send_payout(
            phone_number=phone_number,
            amount=available_cents / 100,
            reference=reference,
            reason="Juana host earnings withdrawal",
            callback_url=callback_url,
        )
    except SasaPayError as e:
        return jsonify({"error": "payout_request_failed", "message": str(e)}), 502

    db.session.add(Transaction(
        user_id=host_id,
        type="payout",
        amount_cents=-available_cents,
        checkout_request_id=result.get("B2CRequestID"),
        status="pending",
    ))
    db.session.commit()

    return jsonify({
        "status": "pending",
        "amount_cents": available_cents,
        "message": result.get("detail", "Payout initiated — funds should arrive shortly"),
    }), 202
