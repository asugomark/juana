"""
Cloudinary wrapper used by routes/photos.py, media.py, status.py, verification.py.

Config is plain env vars (config.py's CLOUDINARY_*), not admin-editable like
SasaPay's credentials — this is a deploy-time infra choice, not something that
gets rotated for business reasons, so a DB-backed settings form would be
over-engineering here.

is_configured() is the fallback switch every route checks: if Cloudinary creds
are set, upload there; if not, fall back to local disk (see each route's
_save_* helper). This means local dev works with zero Cloudinary account —
only your deployed environment (Render) needs real credentials set.
"""
import requests
import cloudinary
import cloudinary.uploader
import cloudinary.utils
from flask import current_app

_configured_for = None  # tracks which cloud_name we last configured against


def _ensure_configured():
    global _configured_for
    cloud_name = current_app.config["CLOUDINARY_CLOUD_NAME"]
    if _configured_for == cloud_name:
        return
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=current_app.config["CLOUDINARY_API_KEY"],
        api_secret=current_app.config["CLOUDINARY_API_SECRET"],
        secure=True,
    )
    _configured_for = cloud_name


def is_configured():
    return bool(
        current_app.config.get("CLOUDINARY_CLOUD_NAME")
        and current_app.config.get("CLOUDINARY_API_KEY")
        and current_app.config.get("CLOUDINARY_API_SECRET")
    )


def upload_public_file(file, folder, resource_type="image"):
    """
    Profile photos, message media, status media — publicly viewable content,
    no signing needed. resource_type='video' for message/status videos,
    'image' otherwise. Returns (secure_url, public_id) — store both; the URL
    goes straight into the DB field the frontend already reads, public_id is
    kept so delete_file() can clean the asset up later without re-deriving it.
    """
    _ensure_configured()
    result = cloudinary.uploader.upload(file, folder=folder, resource_type=resource_type, type="upload")
    return result["secure_url"], result["public_id"]


def upload_protected_file(file, folder):
    """
    KYC documents only. Uploaded with type='authenticated' — Cloudinary will
    NOT serve this asset from a plain public URL, signed or not; every fetch
    needs a correctly-signed request. Returns public_id only (deliberately not
    a URL) — nothing should ever store or hand out a raw link to this asset;
    routes/verification.py:serve_document() is the only code path allowed to
    fetch it, after its own submitter-or-admin check.
    """
    _ensure_configured()
    result = cloudinary.uploader.upload(file, folder=folder, resource_type="image", type="authenticated")
    return result["public_id"]


def fetch_protected_file_bytes(public_id):
    """
    Generates a signed URL for an authenticated-type asset and immediately
    fetches the bytes server-side — the signed URL itself is never sent to the
    browser (a 302 redirect would leak it into the network tab / history).
    Returns (content_bytes, content_type).
    """
    _ensure_configured()
    signed_url, _ = cloudinary.utils.cloudinary_url(
        public_id, type="authenticated", sign_url=True, resource_type="image",
    )
    res = requests.get(signed_url, timeout=15)
    res.raise_for_status()
    return res.content, res.headers.get("content-type", "image/jpeg")


def delete_file(public_id, resource_type="image", protected=False):
    _ensure_configured()
    cloudinary.uploader.destroy(
        public_id, resource_type=resource_type,
        type="authenticated" if protected else "upload",
    )
