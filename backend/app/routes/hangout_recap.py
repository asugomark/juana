import os
import uuid
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.hangout import Hangout, HangoutMember
from app.models.hangout_recap import HangoutRecapPost
from app.utils import cloud_storage

hangout_recap_bp = Blueprint("hangout_recap", __name__, url_prefix="/api/hangouts")


def _was_member(hangout_id, user_id):
    """Active OR left — someone who attended and later left the hangout should
    still be able to see and contribute to its recap; only people who were
    never part of it at all are excluded."""
    return HangoutMember.query.filter_by(hangout_id=hangout_id, user_id=user_id).filter(
        HangoutMember.status.in_(["active", "left"])
    ).first() is not None


def _save_recap_media(file, hangout_id, ext, media_type):
    if cloud_storage.is_configured():
        resource_type = "video" if media_type == "video" else "image"
        url, public_id = cloud_storage.upload_public_file(file, folder=f"hangout_recap/{hangout_id}", resource_type=resource_type)
        return url, public_id

    stored_name = f"{uuid.uuid4()}.{ext}"
    folder = os.path.join(current_app.config["MEDIA_UPLOAD_FOLDER"], "recap", hangout_id)
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, stored_name))
    return f"/uploads/hangout_recap/{hangout_id}/{stored_name}", None


@hangout_recap_bp.post("/<hangout_id>/recap")
@jwt_required()
def post_recap(hangout_id):
    user_id = get_jwt_identity()
    hangout = Hangout.query.get_or_404(hangout_id)

    if not hangout.allow_recap:
        return jsonify({"error": "the host has turned off recap sharing for this hangout"}), 403
    if not _was_member(hangout_id, user_id):
        return jsonify({"error": "only people who joined this hangout can post to its recap"}), 403

    if "media" not in request.files:
        return jsonify({"error": "no file provided — field name must be 'media'"}), 400
    file = request.files["media"]
    if file.filename == "":
        return jsonify({"error": "no file selected"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext in current_app.config["ALLOWED_MEDIA_IMAGE_EXTENSIONS"]:
        media_type, max_bytes = "image", current_app.config["MAX_MEDIA_IMAGE_BYTES"]
    elif ext in current_app.config["ALLOWED_MEDIA_VIDEO_EXTENSIONS"]:
        media_type, max_bytes = "video", current_app.config["MAX_MEDIA_VIDEO_BYTES"]
    else:
        allowed = sorted(current_app.config["ALLOWED_MEDIA_IMAGE_EXTENSIONS"] | current_app.config["ALLOWED_MEDIA_VIDEO_EXTENSIONS"])
        return jsonify({"error": f"unsupported file type — allowed: {', '.join(allowed)}"}), 400

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > max_bytes:
        return jsonify({"error": f"file too large — max {max_bytes // (1024*1024)}MB for {media_type}"}), 400

    url, cloud_public_id = _save_recap_media(file, hangout_id, ext, media_type)

    post = HangoutRecapPost(
        hangout_id=hangout_id,
        user_id=user_id,
        media_url=url,
        media_type=media_type,
        cloud_public_id=cloud_public_id,
        caption=(request.form.get("caption") or "").strip()[:280] or None,
    )
    db.session.add(post)
    db.session.commit()
    return jsonify(post.to_dict()), 201


@hangout_recap_bp.get("/<hangout_id>/recap")
@jwt_required()
def list_recap(hangout_id):
    """
    Members-only (active or left) — recap photos are personal content from a
    real event people attended, not public marketing material.
    """
    user_id = get_jwt_identity()
    if not _was_member(hangout_id, user_id):
        return jsonify({"error": "only people who joined this hangout can view its recap"}), 403

    posts = (
        HangoutRecapPost.query.filter_by(hangout_id=hangout_id)
        .order_by(HangoutRecapPost.created_at.desc())
        .all()
    )
    return jsonify([p.to_dict() for p in posts])


@hangout_recap_bp.delete("/<hangout_id>/recap/<post_id>")
@jwt_required()
def delete_recap_post(hangout_id, post_id):
    """Poster can delete their own post; the host can delete any post in their hangout."""
    user_id = get_jwt_identity()
    hangout = Hangout.query.get_or_404(hangout_id)
    post = HangoutRecapPost.query.filter_by(id=post_id, hangout_id=hangout_id).first_or_404()

    if post.user_id != user_id and hangout.host_id != user_id:
        return jsonify({"error": "not authorized to delete this post"}), 403

    if post.cloud_public_id:
        resource_type = "video" if post.media_type == "video" else "image"
        cloud_storage.delete_file(post.cloud_public_id, resource_type=resource_type)
    elif post.media_url.startswith("/uploads/"):
        file_path = os.path.join(
            current_app.config["MEDIA_UPLOAD_FOLDER"], "recap", hangout_id, os.path.basename(post.media_url)
        )
        if os.path.exists(file_path):
            os.remove(file_path)

    db.session.delete(post)
    db.session.commit()
    return jsonify({"status": "deleted"})


# ---------- Static file serving (local-disk fallback only) ----------
hangout_recap_uploads_bp = Blueprint("hangout_recap_uploads", __name__)


@hangout_recap_uploads_bp.get("/uploads/hangout_recap/<hangout_id>/<filename>")
def serve_recap_media(hangout_id, filename):
    folder = os.path.join(current_app.config["MEDIA_UPLOAD_FOLDER"], "recap", hangout_id)
    return send_from_directory(folder, filename)