import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "mysql+pymysql://root:123Enter$@localhost:3306/juana"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # These SASAPAY_*/PUBLIC_CALLBACK_BASE_URL env vars are now only a BOOTSTRAP
    # fallback — once an admin saves credentials via Admin → Finance → Settings,
    # app/utils/settings.py reads from the encrypted database row instead and
    # these are ignored. Safe to leave blank once that's been done.
    SASAPAY_BASE_URL = os.environ.get("SASAPAY_BASE_URL", "https://sandbox.sasapay.app")
    SASAPAY_CLIENT_ID = os.environ.get("SASAPAY_CLIENT_ID", "")
    SASAPAY_CLIENT_SECRET = os.environ.get("SASAPAY_CLIENT_SECRET", "")
    SASAPAY_MERCHANT_CODE = os.environ.get("SASAPAY_MERCHANT_CODE", "")
    # Public base URL SasaPay can reach to deliver IPN callbacks — ngrok URL in dev, real domain in prod.
    PUBLIC_CALLBACK_BASE_URL = os.environ.get("PUBLIC_CALLBACK_BASE_URL", "http://localhost:5000")

    # Required before any credentials can be saved via the admin Settings tab —
    # see app/utils/settings.py module docstring for how to generate one.
    SETTINGS_ENCRYPTION_KEY = os.environ.get("SETTINGS_ENCRYPTION_KEY", "")

    KYC_API_KEY = os.environ.get("KYC_API_KEY", "")

    CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "http://localhost:5173")

    # Pass pricing in KES cents (smallest subunit) — single source of truth, used by
    # passes/hangouts routes. Placeholder amounts — set real pricing before launch.
    PASS_PRICES = {
        "day": 5000,     # KES 50.00
        "week": 15000,   # KES 150.00
        "month": 35000,  # KES 350.00
    }
    NEWBIE_FREE_MESSAGES = 10  # first-time user allowance before any pass is required

    # Photo uploads -- stored on local disk under backend/uploads/, served back via
    # the /uploads/<path> static route in app/__init__.py. This works fine for local
    # dev and even a single-server deployment, but does NOT survive container
    # restarts/redeploys and does NOT work if you ever run more than one backend
    # instance (each would have its own disk). Swap for S3/Cloudinary/GCS before
    # running this on real infrastructure -- the only code that needs to change is
    # routes/photos.py, since everything else just stores/reads a URL string.
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", os.path.join(basedir, "..", "uploads", "profile_photos"))
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB request body cap — sized for video uploads, not just photos
    ALLOWED_PHOTO_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
    MAX_PHOTOS_PER_USER = 6

    # Message media (Hangout chat + Hola attachments) — separate folder from profile
    # photos, same local-disk caveat applies (see UPLOAD_FOLDER comment above).
    MEDIA_UPLOAD_FOLDER = os.environ.get("MEDIA_UPLOAD_FOLDER", os.path.join(basedir, "..", "uploads", "message_media"))
    ALLOWED_MEDIA_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
    ALLOWED_MEDIA_VIDEO_EXTENSIONS = {"mp4", "mov", "webm"}
    MAX_MEDIA_IMAGE_BYTES = 8 * 1024 * 1024    # 8MB
    MAX_MEDIA_VIDEO_BYTES = 40 * 1024 * 1024   # 40MB

    # Status updates — ephemeral text/photo/video posts, same local-disk storage.
    STATUS_UPLOAD_FOLDER = os.environ.get("STATUS_UPLOAD_FOLDER", os.path.join(basedir, "..", "uploads", "status_media"))
    STATUS_EXPIRY_HOURS = 24
