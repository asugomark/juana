from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.block import Block
from app.models.report import Report
from app.models.user import User

safety_bp = Blueprint("safety", __name__, url_prefix="/api")


@safety_bp.post("/users/<user_id>/block")
@jwt_required()
def block_user(user_id):
    blocker_id = get_jwt_identity()
    if blocker_id == user_id:
        return jsonify({"error": "cannot block yourself"}), 400

    existing = Block.query.filter_by(blocker_id=blocker_id, blocked_id=user_id).first()
    if not existing:
        db.session.add(Block(blocker_id=blocker_id, blocked_id=user_id))
        db.session.commit()
    return jsonify({"blocked": True})


@safety_bp.delete("/users/<user_id>/block")
@jwt_required()
def unblock_user(user_id):
    blocker_id = get_jwt_identity()
    block = Block.query.filter_by(blocker_id=blocker_id, blocked_id=user_id).first()
    if block:
        db.session.delete(block)
        db.session.commit()
    return jsonify({"blocked": False})


@safety_bp.get("/users/blocked")
@jwt_required()
def list_blocked():
    blocker_id = get_jwt_identity()
    blocks = Block.query.filter_by(blocker_id=blocker_id).all()
    users = [User.query.get(b.blocked_id) for b in blocks]
    return jsonify([u.to_public_dict() for u in users if u])


@safety_bp.get("/users/<user_id>/block-status")
@jwt_required()
def block_status(user_id):
    viewer_id = get_jwt_identity()
    blocked_by_me = Block.query.filter_by(blocker_id=viewer_id, blocked_id=user_id).first() is not None
    return jsonify({"blocked_by_me": blocked_by_me})


@safety_bp.post("/reports")
@jwt_required()
def create_report():
    reporter_id = get_jwt_identity()
    data = request.get_json() or {}

    reported_user_id = data.get("reported_user_id")
    reason = data.get("reason")
    valid_reasons = {"harassment", "fake_profile", "inappropriate_content", "spam", "safety_concern", "other"}

    if not reported_user_id:
        return jsonify({"error": "reported_user_id is required"}), 400
    if reporter_id == reported_user_id:
        return jsonify({"error": "cannot report yourself"}), 400
    if reason not in valid_reasons:
        return jsonify({"error": f"reason must be one of: {', '.join(sorted(valid_reasons))}"}), 400
    if not User.query.get(reported_user_id):
        return jsonify({"error": "reported user not found"}), 404

    report = Report(
        reporter_id=reporter_id,
        reported_user_id=reported_user_id,
        hangout_id=data.get("hangout_id"),
        reason=reason,
        details=(data.get("details") or "").strip()[:2000] or None,
    )
    db.session.add(report)
    db.session.commit()
    return jsonify({"status": "submitted", "report_id": report.id}), 201
