import os
import uuid
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User, ProfilePhoto
from app.utils import cloud_storage

photos_bp = Blueprint("photos", __name__, url_prefix="/api/auth/me/photos")


def _allowed_file(filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in current_app.config["ALLOWED_PHOTO_EXTENSIONS"]


def _save(file, user_id, ext):
    """
    Cloudinary when configured (see config.py's CLOUDINARY_* comment — required
    for this to survive a Render-style redeploy), local disk otherwise. Returns
    (url, cloud_public_id) — cloud_public_id is None for local-disk saves.
    """
    if cloud_storage.is_configured():
        url, public_id = cloud_storage.upload_public_file(file, folder=f"profile_photos/{user_id}")
        return url, public_id

    stored_name = f"{uuid.uuid4()}.{ext}"
    user_folder = os.path.join(current_app.config["UPLOAD_FOLDER"], user_id)
    os.makedirs(user_folder, exist_ok=True)
    file.save(os.path.join(user_folder, stored_name))
    return f"/uploads/profile_photos/{user_id}/{stored_name}", None


@photos_bp.post("")
@jwt_required()
def upload_photo():
    """
    Accepts multipart/form-data with a single field named "photo".
    First photo a user ever uploads automatically becomes position 0 (primary).
    Capped at MAX_PHOTOS_PER_USER so someone can't fill storage one profile at a time.
    """
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)

    if "photo" not in request.files:
        return jsonify({"error": "no file provided — field name must be 'photo'"}), 400

    file = request.files["photo"]
    if file.filename == "":
        return jsonify({"error": "no file selected"}), 400

    if not _allowed_file(file.filename):
        allowed = ", ".join(sorted(current_app.config["ALLOWED_PHOTO_EXTENSIONS"]))
        return jsonify({"error": f"unsupported file type — allowed: {allowed}"}), 400

    existing_count = ProfilePhoto.query.filter_by(user_id=user_id).count()
    if existing_count >= current_app.config["MAX_PHOTOS_PER_USER"]:
        return jsonify({"error": f"maximum {current_app.config['MAX_PHOTOS_PER_USER']} photos reached — delete one first"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower()
    url, cloud_public_id = _save(file, user_id, ext)

    photo = ProfilePhoto(
        user_id=user_id,
        url=url,
        cloud_public_id=cloud_public_id,
        position=existing_count,  # appends after existing photos; 0 only if this is the first
    )
    db.session.add(photo)
    db.session.commit()

    return jsonify(user.to_private_dict()), 201


@photos_bp.delete("/<photo_id>")
@jwt_required()
def delete_photo(photo_id):
    user_id = get_jwt_identity()
    photo = ProfilePhoto.query.filter_by(id=photo_id, user_id=user_id).first_or_404()

    if photo.cloud_public_id:
        cloud_storage.delete_file(photo.cloud_public_id)
    else:
        file_path = os.path.join(current_app.config["UPLOAD_FOLDER"], user_id, os.path.basename(photo.url))
        if os.path.exists(file_path):
            os.remove(file_path)

    db.session.delete(photo)
    db.session.flush()

    # Re-pack positions so there's never a gap (e.g. deleting position 0 leaves
    # position 1 as the new primary, but should now read as 0).
    remaining = ProfilePhoto.query.filter_by(user_id=user_id).order_by(ProfilePhoto.position).all()
    for i, p in enumerate(remaining):
        p.position = i
    db.session.commit()

    user = User.query.get(user_id)
    return jsonify(user.to_private_dict())


@photos_bp.post("/<photo_id>/primary")
@jwt_required()
def set_primary_photo(photo_id):
    """Moves the given photo to position 0, shifting everything else down by one."""
    user_id = get_jwt_identity()
    target = ProfilePhoto.query.filter_by(id=photo_id, user_id=user_id).first_or_404()

    others = (
        ProfilePhoto.query.filter(ProfilePhoto.user_id == user_id, ProfilePhoto.id != photo_id)
        .order_by(ProfilePhoto.position)
        .all()
    )
    target.position = 0
    for i, p in enumerate(others):
        p.position = i + 1
    db.session.commit()

    user = User.query.get(user_id)
    return jsonify(user.to_private_dict())


# ---------- Static file serving (local-disk fallback only) ----------
# When Cloudinary is configured, ProfilePhoto.url is already a full Cloudinary
# URL and this route is never hit. Kept for local dev without Cloudinary set up.
uploads_bp = Blueprint("uploads", __name__)


@uploads_bp.get("/uploads/profile_photos/<user_id>/<filename>")
def serve_photo(user_id, filename):
    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], user_id)
    return send_from_directory(folder, filename)
