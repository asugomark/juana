import os
import uuid
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, socketio
from app.models.user import User
from app.models.hangout import HangoutMember
from app.models.message import Message
from app.models.block import is_blocked_either_way
from app.utils.passes import can_user_send_message, consume_newbie_allowance_if_applicable

media_bp = Blueprint("media", __name__, url_prefix="/api")


def _classify_and_validate(file):
    """Returns (media_type, error_response) — error_response is None on success."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    if ext in current_app.config["ALLOWED_MEDIA_IMAGE_EXTENSIONS"]:
        media_type = "image"
        max_bytes = current_app.config["MAX_MEDIA_IMAGE_BYTES"]
    elif ext in current_app.config["ALLOWED_MEDIA_VIDEO_EXTENSIONS"]:
        media_type = "video"
        max_bytes = current_app.config["MAX_MEDIA_VIDEO_BYTES"]
    else:
        allowed = sorted(current_app.config["ALLOWED_MEDIA_IMAGE_EXTENSIONS"] | current_app.config["ALLOWED_MEDIA_VIDEO_EXTENSIONS"])
        return None, (jsonify({"error": f"unsupported file type — allowed: {', '.join(allowed)}"}), 400)

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > max_bytes:
        return None, (jsonify({"error": f"file too large — max {max_bytes // (1024*1024)}MB for {media_type}"}), 400)

    return media_type, None


def _save_media_file(file, sender_id, ext):
    stored_name = f"{uuid.uuid4()}.{ext}"
    folder = os.path.join(current_app.config["MEDIA_UPLOAD_FOLDER"], sender_id)
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, stored_name))
    return f"/uploads/message_media/{sender_id}/{stored_name}", stored_name


@media_bp.post("/hangouts/<hangout_id>/messages/media")
@jwt_required()
def send_hangout_media(hangout_id):
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)

    is_member = HangoutMember.query.filter_by(hangout_id=hangout_id, user_id=user_id, status="active").first()
    if not is_member:
        return jsonify({"error": "not a member of this hangout"}), 403

    # Same hard pass-gate as text sends — media isn't a loophole around paying for messaging.
    if not can_user_send_message(user):
        return jsonify({"error": "pass_required", "message": "Get a pass to send messages"}), 402

    if "media" not in request.files:
        return jsonify({"error": "no file provided — field name must be 'media'"}), 400
    file = request.files["media"]
    if file.filename == "":
        return jsonify({"error": "no file selected"}), 400

    media_type, error = _classify_and_validate(file)
    if error:
        return error

    ext = file.filename.rsplit(".", 1)[-1].lower()
    url, _ = _save_media_file(file, user_id, ext)

    msg = Message(
        sender_id=user_id,
        hangout_id=hangout_id,
        body=(request.form.get("caption") or "").strip() or None,
        media_url=url,
        media_type=media_type,
    )
    db.session.add(msg)
    consume_newbie_allowance_if_applicable(user)
    db.session.commit()

    payload = msg.to_dict()
    socketio.emit("hangout_message", payload, room=f"hangout:{hangout_id}")
    return jsonify(payload), 201


@media_bp.post("/hola/<other_user_id>/messages/media")
@jwt_required()
def send_hola_media(other_user_id):
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)

    if user_id == other_user_id:
        return jsonify({"error": "cannot message yourself"}), 400

    if is_blocked_either_way(user_id, other_user_id):
        return jsonify({"error": "unable to send message"}), 403

    if not can_user_send_message(user):
        return jsonify({"error": "pass_required", "message": "Get a pass to send messages"}), 402

    if "media" not in request.files:
        return jsonify({"error": "no file provided — field name must be 'media'"}), 400
    file = request.files["media"]
    if file.filename == "":
        return jsonify({"error": "no file selected"}), 400

    media_type, error = _classify_and_validate(file)
    if error:
        return error

    ext = file.filename.rsplit(".", 1)[-1].lower()
    url, _ = _save_media_file(file, user_id, ext)

    msg = Message(
        sender_id=user_id,
        recipient_id=other_user_id,
        body=(request.form.get("caption") or "").strip() or None,
        media_url=url,
        media_type=media_type,
    )
    db.session.add(msg)
    consume_newbie_allowance_if_applicable(user)
    db.session.commit()

    payload = msg.to_dict()
    socketio.emit("hola_message", payload, room=f"user:{other_user_id}")
    return jsonify(payload), 201


# ---------- Static file serving for message media ----------
media_uploads_bp = Blueprint("media_uploads", __name__)


@media_uploads_bp.get("/uploads/message_media/<sender_id>/<filename>")
def serve_message_media(sender_id, filename):
    folder = os.path.join(current_app.config["MEDIA_UPLOAD_FOLDER"], sender_id)
    return send_from_directory(folder, filename)
