import os
import uuid
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.kyc_submission import KycSubmission

verification_bp = Blueprint("verification", __name__, url_prefix="/api/verification")

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_BYTES = 8 * 1024 * 1024  # 8MB — matches the profile-photo limit, ID photos are similar in size


def _validate_and_save(file, user_id, label):
    """label is just used in the stored filename for a human-readable audit
    trail on disk (e.g. 'id_document' vs 'selfie') — not security-relevant."""
    if file.filename == "":
        raise ValueError(f"no {label} file selected")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"{label}: unsupported file type — use JPG, PNG, or WEBP")

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_FILE_BYTES:
        raise ValueError(f"{label}: file too large — max 8MB")

    stored_name = f"{label}-{uuid.uuid4()}.{ext}"
    folder = os.path.join(current_app.config["KYC_UPLOAD_FOLDER"], user_id)
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, stored_name))
    return f"/api/verification/documents/{user_id}/{stored_name}"


@verification_bp.post("/submit")
@jwt_required()
def submit_verification():
    """
    Manual review flow: user uploads a photo of their government ID and a
    selfie, an admin looks at both and approves or rejects (see routes/admin_kyc.py).
    No automated vendor call happens here — this is the deliberate Option A
    from the KYC discussion: appropriate for a small trusted beta, not
    real scale. Swap for Persona/Veriff/Stripe Identity before that changes;
    the KycSubmission model and kyc_status field don't need to change either way.
    """
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)

    if "id_document" not in request.files or "selfie" not in request.files:
        return jsonify({"error": "both id_document and selfie files are required"}), 400

    try:
        id_document_url = _validate_and_save(request.files["id_document"], user_id, "id_document")
        selfie_url = _validate_and_save(request.files["selfie"], user_id, "selfie")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    submission = KycSubmission(user_id=user_id, id_document_url=id_document_url, selfie_url=selfie_url)
    db.session.add(submission)
    user.kyc_status = "pending"
    db.session.commit()

    return jsonify(submission.to_dict()), 201


@verification_bp.get("/status")
@jwt_required()
def my_status():
    user = User.query.get_or_404(get_jwt_identity())
    latest = (
        KycSubmission.query.filter_by(user_id=user.id)
        .order_by(KycSubmission.created_at.desc())
        .first()
    )
    return jsonify({
        "kyc_status": user.kyc_status,
        "is_verified": user.is_verified,
        "latest_submission": latest.to_dict() if latest else None,
    })


@verification_bp.get("/documents/<user_id>/<filename>")
@jwt_required()
def serve_document(user_id, filename):
    """
    Protected — deliberately NOT a public static route like profile photos.
    Only the person who submitted the document, or an admin reviewing it, can
    ever view it. Anyone else gets 403, even with a guessed-correct URL.
    """
    requester_id = get_jwt_identity()
    requester = User.query.get_or_404(requester_id)

    if requester_id != user_id and not requester.is_admin:
        return jsonify({"error": "not authorized to view this document"}), 403

    folder = os.path.join(current_app.config["KYC_UPLOAD_FOLDER"], user_id)
    return send_from_directory(folder, filename)
