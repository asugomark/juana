from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.kyc_submission import KycSubmission
from app.utils.admin import admin_required

admin_kyc_bp = Blueprint("admin_kyc", __name__, url_prefix="/api/admin/kyc")


@admin_kyc_bp.get("")
@admin_required
def list_submissions():
    status = request.args.get("status", "pending")
    query = KycSubmission.query
    if status != "all":
        query = query.filter_by(status=status)
    submissions = query.order_by(KycSubmission.created_at.asc()).limit(100).all()  # oldest first — first submitted, first reviewed

    results = []
    for s in submissions:
        user = User.query.get(s.user_id)
        results.append(s.to_dict(include_user=user))
    return jsonify(results)


@admin_kyc_bp.post("/<submission_id>/approve")
@admin_required
def approve_submission(submission_id):
    admin_id = get_jwt_identity()
    submission = KycSubmission.query.get_or_404(submission_id)
    user = User.query.get_or_404(submission.user_id)

    submission.status = "approved"
    submission.reviewed_by = admin_id
    submission.reviewed_at = datetime.utcnow()

    user.kyc_status = "approved"
    user.is_verified = True
    user.verified_at = datetime.utcnow()

    db.session.commit()
    return jsonify(submission.to_dict())


@admin_kyc_bp.post("/<submission_id>/reject")
@admin_required
def reject_submission(submission_id):
    admin_id = get_jwt_identity()
    submission = KycSubmission.query.get_or_404(submission_id)
    user = User.query.get_or_404(submission.user_id)
    data = request.get_json() or {}

    reason = (data.get("reason") or "").strip()
    if not reason:
        return jsonify({"error": "a rejection reason is required — the user sees this"}), 400

    submission.status = "rejected"
    submission.reviewed_by = admin_id
    submission.reviewed_at = datetime.utcnow()
    submission.rejection_reason = reason[:1000]

    # kyc_status goes back to 'none', not staying 'rejected' — a rejected user
    # should be able to submit again cleanly, and 'none' vs 'rejected' as a
    # PERSISTENT user-facing state adds a distinction that doesn't help anyone;
    # the submission history (this table) is where "was rejected before, here's
    # why" actually lives, not the live-status field.
    user.kyc_status = "none"

    db.session.commit()
    return jsonify(submission.to_dict())
