from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.report import Report
from app.utils.admin import admin_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.get("/reports")
@admin_required
def list_reports():
    status = request.args.get("status", "pending")
    query = Report.query
    if status != "all":
        query = query.filter_by(status=status)
    reports = query.order_by(Report.created_at.desc()).limit(100).all()
    return jsonify([r.to_dict() for r in reports])


@admin_bp.post("/reports/<report_id>/resolve")
@admin_required
def resolve_report(report_id):
    """
    action: 'dismiss' just closes the report. 'ban' also bans the reported
    user (rejected at their next login attempt — see routes/auth.py). There's
    no 'warn' delivery mechanism yet (no notifications system to send it
    through), so for now the two real options are dismiss or ban; a note can
    still be recorded either way for the moderator's own reasoning.
    """
    admin_id = get_jwt_identity()
    report = Report.query.get_or_404(report_id)
    data = request.get_json() or {}
    action = data.get("action")

    if action not in {"dismiss", "ban"}:
        return jsonify({"error": "action must be 'dismiss' or 'ban'"}), 400

    report.status = "actioned" if action == "ban" else "dismissed"
    report.resolved_by = admin_id
    report.resolved_at = datetime.utcnow()
    report.resolution_note = (data.get("note") or "").strip()[:1000] or None

    if action == "ban":
        reported_user = User.query.get(report.reported_user_id)
        if reported_user:
            reported_user.is_banned = True
            reported_user.ban_reason = report.resolution_note or f"Actioned from report: {report.reason}"

    db.session.commit()
    return jsonify(report.to_dict())


@admin_bp.get("/users/search")
@admin_required
def search_users():
    """Basic lookup for moderators — by email or display name, exact-ish match."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    matches = User.query.filter(
        db.or_(User.email.ilike(f"%{q}%"), User.display_name.ilike(f"%{q}%"))
    ).limit(20).all()
    return jsonify([
        {**u.to_public_dict(), "email": u.email, "is_banned": u.is_banned, "kyc_status": u.kyc_status}
        for u in matches
    ])


@admin_bp.post("/users/<user_id>/ban")
@admin_required
def ban_user(user_id):
    """Direct ban, not tied to a specific report — for cases a mod finds outside the queue."""
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}
    user.is_banned = True
    user.ban_reason = (data.get("reason") or "").strip()[:1000] or "Banned by moderator"
    db.session.commit()
    return jsonify(user.to_public_dict())


@admin_bp.post("/users/<user_id>/unban")
@admin_required
def unban_user(user_id):
    user = User.query.get_or_404(user_id)
    user.is_banned = False
    user.ban_reason = None
    db.session.commit()
    return jsonify(user.to_public_dict())
