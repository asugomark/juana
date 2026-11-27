import os
import uuid
from flask import Blueprint, request, jsonify, current_app, send_from_directory, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.kyc_submission import KycSubmission
from app.utils import cloud_storage

verification_bp = Blueprint("verification", __name__, url_prefix="/api/verification")

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_BYTES = 8 * 1024 * 1024  # 8MB — matches the profile-photo limit, ID photos are similar in size


def _validate(file, label):
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
    return ext


def _save(file, user_id, label, ext):
    """
    Cloudinary (type='authenticated' — never a plain public URL) when
    configured, local disk otherwise. Returns (proxy_url, cloud_public_id).
    proxy_url is always OUR OWN /api/verification/documents/... path regardless
    of backend — the frontend never touches Cloudinary directly, only ever this
    protected endpoint. cloud_public_id is None for local-disk saves.
    """
    if cloud_storage.is_configured():
        public_id = cloud_storage.upload_protected_file(file, folder=f"kyc_documents/{user_id}")
        return f"/api/verification/documents/{user_id}/{label}", public_id

    stored_name = f"{label}-{uuid.uuid4()}.{ext}"
    folder = os.path.join(current_app.config["KYC_UPLOAD_FOLDER"], user_id)
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, stored_name))
    return f"/api/verification/documents/{user_id}/{stored_name}", None


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
        id_ext = _validate(request.files["id_document"], "id_document")
        selfie_ext = _validate(request.files["selfie"], "selfie")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    id_document_url, id_public_id = _save(request.files["id_document"], user_id, "id_document", id_ext)
    selfie_url, selfie_public_id = _save(request.files["selfie"], user_id, "selfie", selfie_ext)

    submission = KycSubmission(
        user_id=user_id,
        id_document_url=id_document_url,
        selfie_url=selfie_url,
        id_document_public_id=id_public_id,
        selfie_public_id=selfie_public_id,
    )
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

    Cloudinary case: fetches the bytes server-side via a freshly-signed URL and
    streams them through (see cloud_storage.fetch_protected_file_bytes) rather
    than redirecting the browser to Cloudinary — the signed URL itself never
    reaches the client, only our own already-protected endpoint does.
    """
    requester_id = get_jwt_identity()
    requester = User.query.get_or_404(requester_id)

    if requester_id != user_id and not requester.is_admin:
        return jsonify({"error": "not authorized to view this document"}), 403

    # filename here is "id_document" or "selfie" for Cloudinary-backed submissions
    # (see _save's proxy_url construction above) — resolve to the right public_id.
    if cloud_storage.is_configured() and filename in ("id_document", "selfie"):
        submission = (
            KycSubmission.query.filter_by(user_id=user_id)
            .order_by(KycSubmission.created_at.desc())
            .first_or_404()
        )
        public_id = submission.id_document_public_id if filename == "id_document" else submission.selfie_public_id
        if not public_id:
            return jsonify({"error": "document not found"}), 404
        content, content_type = cloud_storage.fetch_protected_file_bytes(public_id)
        return Response(content, mimetype=content_type)

    folder = os.path.join(current_app.config["KYC_UPLOAD_FOLDER"], user_id)
    return send_from_directory(folder, filename)
