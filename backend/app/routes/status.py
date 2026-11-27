import os
import uuid
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.hangout import HangoutMember
from app.models.message import Message
from app.models.status import Status
from app.utils import cloud_storage

status_bp = Blueprint("status", __name__, url_prefix="/api/status")


def _known_user_ids(viewer_id):
    """
    Who can see the viewer's statuses, and whose statuses the viewer sees:
    anyone with an existing Hola thread, plus anyone currently a co-member of
    a hangout the viewer is active in. See models/status.py docstring for why
    this isn't just "everyone" or a follow graph.
    """
    hola_partners = {
        row[0] for row in db.session.query(Message.recipient_id)
        .filter(Message.sender_id == viewer_id, Message.recipient_id.isnot(None)).all()
    } | {
        row[0] for row in db.session.query(Message.sender_id)
        .filter(Message.recipient_id == viewer_id).all()
    }

    my_hangout_ids = {
        row[0] for row in db.session.query(HangoutMember.hangout_id)
        .filter(HangoutMember.user_id == viewer_id, HangoutMember.status == "active").all()
    }
    hangout_co_members = set()
    if my_hangout_ids:
        hangout_co_members = {
            row[0] for row in db.session.query(HangoutMember.user_id)
            .filter(HangoutMember.hangout_id.in_(my_hangout_ids), HangoutMember.status == "active").all()
        }

    return (hola_partners | hangout_co_members) - {viewer_id}


def _save_status_media(file, user_id, ext, kind):
    """Cloudinary when configured, local disk otherwise. Returns (url, cloud_public_id)."""
    if cloud_storage.is_configured():
        resource_type = "video" if kind == "video" else "image"
        url, public_id = cloud_storage.upload_public_file(file, folder=f"status_media/{user_id}", resource_type=resource_type)
        return url, public_id

    stored_name = f"{uuid.uuid4()}.{ext}"
    folder = os.path.join(current_app.config["STATUS_UPLOAD_FOLDER"], user_id)
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, stored_name))
    return f"/uploads/status_media/{user_id}/{stored_name}", None


@status_bp.post("")
@jwt_required()
def create_status():
    """
    Accepts multipart/form-data for photo/video (field 'media', optional
    'caption'), or plain JSON {"text": "..."} for a text-only status. Exactly
    one of those two shapes is expected per request -- this endpoint doesn't
    try to guess between a JSON body and a file upload beyond checking which
    one is actually present.
    """
    user_id = get_jwt_identity()
    expires_at = datetime.utcnow() + timedelta(hours=current_app.config["STATUS_EXPIRY_HOURS"])

    if "media" in request.files:
        file = request.files["media"]
        if file.filename == "":
            return jsonify({"error": "no file selected"}), 400

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext in current_app.config["ALLOWED_MEDIA_IMAGE_EXTENSIONS"]:
            kind, max_bytes = "image", current_app.config["MAX_MEDIA_IMAGE_BYTES"]
        elif ext in current_app.config["ALLOWED_MEDIA_VIDEO_EXTENSIONS"]:
            kind, max_bytes = "video", current_app.config["MAX_MEDIA_VIDEO_BYTES"]
        else:
            allowed = sorted(current_app.config["ALLOWED_MEDIA_IMAGE_EXTENSIONS"] | current_app.config["ALLOWED_MEDIA_VIDEO_EXTENSIONS"])
            return jsonify({"error": f"unsupported file type — allowed: {', '.join(allowed)}"}), 400

        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > max_bytes:
            return jsonify({"error": f"file too large — max {max_bytes // (1024*1024)}MB for {kind}"}), 400

        url, cloud_public_id = _save_status_media(file, user_id, ext, kind)

        status = Status(
            user_id=user_id,
            kind=kind,
            media_url=url,
            cloud_public_id=cloud_public_id,
            text_content=(request.form.get("caption") or "").strip() or None,
            expires_at=expires_at,
        )
    else:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "text is required for a text-only status, or attach 'media'"}), 400
        status = Status(user_id=user_id, kind="text", text_content=text[:500], expires_at=expires_at)

    db.session.add(status)
    db.session.commit()
    return jsonify(status.to_dict()), 201


@status_bp.get("/feed")
@jwt_required()
def feed():
    """
    Grouped by author: [{author, statuses: [...]}], most-recently-posted
    author first. Includes the viewer's own active statuses too, so the
    frontend doesn't need a separate call to show "your status" alongside
    everyone else's.
    """
    viewer_id = get_jwt_identity()
    visible_author_ids = _known_user_ids(viewer_id) | {viewer_id}

    statuses = (
        Status.query.filter(
            Status.user_id.in_(visible_author_ids),
            Status.expires_at > datetime.utcnow(),
        )
        .order_by(Status.created_at.desc())
        .all()
    )

    grouped = {}
    order = []
    for s in statuses:
        if s.user_id not in grouped:
            grouped[s.user_id] = []
            order.append(s.user_id)
        grouped[s.user_id].append(s)

    result = []
    for author_id in order:
        author_statuses = sorted(grouped[author_id], key=lambda s: s.created_at)
        result.append({
            "author": author_statuses[0].author.to_public_dict(),
            "statuses": [s.to_dict() for s in author_statuses],
        })
    return jsonify(result)


@status_bp.delete("/<status_id>")
@jwt_required()
def delete_status(status_id):
    user_id = get_jwt_identity()
    status = Status.query.filter_by(id=status_id, user_id=user_id).first_or_404()

    if status.media_url:
        if status.cloud_public_id:
            resource_type = "video" if status.kind == "video" else "image"
            cloud_storage.delete_file(status.cloud_public_id, resource_type=resource_type)
        else:
            file_path = os.path.join(current_app.config["STATUS_UPLOAD_FOLDER"], user_id, os.path.basename(status.media_url))
            if os.path.exists(file_path):
                os.remove(file_path)

    db.session.delete(status)
    db.session.commit()
    return jsonify({"status": "deleted"})


# ---------- Static file serving (local-disk fallback only) ----------
status_uploads_bp = Blueprint("status_uploads", __name__)


@status_uploads_bp.get("/uploads/status_media/<user_id>/<filename>")
def serve_status_media(user_id, filename):
    folder = os.path.join(current_app.config["STATUS_UPLOAD_FOLDER"], user_id)
    return send_from_directory(folder, filename)
