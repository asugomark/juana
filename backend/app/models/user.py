import uuid
from datetime import datetime
import bcrypt
from app.extensions import db


def gen_uuid():
    return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    display_name = db.Column(db.String(80), nullable=False)
    birthdate = db.Column(db.Date, nullable=False)  # used to compute/display age; never expose raw DOB in API responses
    bio = db.Column(db.Text, nullable=True)
    occupation = db.Column(db.String(120), nullable=True)
    city = db.Column(db.String(120), nullable=True)
    interests = db.Column(db.JSON, nullable=True)  # list of short strings, e.g. ["Board games", "Trivia"]
    prompt_question = db.Column(db.String(120), nullable=True)  # e.g. "MY IDEAL HANGOUT IS…"
    prompt_answer = db.Column(db.Text, nullable=True)

    # Verification — one KYC tier reused for both the "Verified" badge and payout eligibility.
    # See app/utils/verification.py for how this gets set.
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    verified_at = db.Column(db.DateTime, nullable=True)
    kyc_status = db.Column(
        db.Enum("none", "pending", "approved", "rejected", name="kyc_status_enum"),
        default="none",
        nullable=False,
    )

    # Moderation. is_admin is set manually (no self-serve promotion endpoint --
    # grant it directly in the DB or a one-off script). Banned users are
    # rejected at login (see routes/auth.py) rather than mid-session, which is
    # simpler than invalidating already-issued JWTs but does mean a ban takes
    # effect on their NEXT login, not instantly on an already-open session.
    # Fine for a first version; revisit with a token-blocklist if that gap matters.
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    is_banned = db.Column(db.Boolean, default=False, nullable=False)
    ban_reason = db.Column(db.Text, nullable=True)

    # Live location — only populated/used while nearby_visible is True. Never store history of this,
    # just the current value, and clear it when a nearby session expires. See app/utils/geo.py.
    nearby_visible = db.Column(db.Boolean, default=False, nullable=False)
    nearby_expires_at = db.Column(db.DateTime, nullable=True)
    current_lat = db.Column(db.Float, nullable=True)
    current_lng = db.Column(db.Float, nullable=True)
    current_venue_id = db.Column(db.String(36), db.ForeignKey("venues.id"), nullable=True)

    # Messaging entitlement — see app/utils/passes.py for the gating logic that reads this.
    newbie_messages_used = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # "ProfilePhoto" as a string, not a direct class reference — SQLAlchemy resolves
    # it lazily at mapper-configuration time, which is why this works even though
    # ProfilePhoto is defined further down in this same file.
    photos = db.relationship(
        "ProfilePhoto", backref="user", cascade="all, delete-orphan",
        order_by="ProfilePhoto.position",
    )

    def set_password(self, raw_password):
        self.password_hash = bcrypt.hashpw(
            raw_password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    def check_password(self, raw_password):
        return bcrypt.checkpw(
            raw_password.encode("utf-8"), self.password_hash.encode("utf-8")
        )

    @property
    def age(self):
        today = datetime.utcnow().date()
        years = today.year - self.birthdate.year
        if (today.month, today.day) < (self.birthdate.month, self.birthdate.day):
            years -= 1
        return years

    def to_public_dict(self):
        """Safe to send to any user viewing this profile — no email, no location, no DOB."""
        photos = sorted(self.photos, key=lambda p: p.position) if self.photos else []
        return {
            "id": self.id,
            "display_name": self.display_name,
            "age": self.age,
            "bio": self.bio,
            "occupation": self.occupation,
            "city": self.city,
            "interests": self.interests or [],
            "prompt": (
                {"question": self.prompt_question, "answer": self.prompt_answer}
                if self.prompt_question and self.prompt_answer else None
            ),
            "is_verified": self.is_verified,
            "photos": [p.to_dict() for p in photos],
        }

    def to_private_dict(self):
        """Only ever returned to the user themselves (e.g. GET /me)."""
        photos = sorted(self.photos, key=lambda p: p.position) if self.photos else []
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "age": self.age,
            "bio": self.bio,
            "occupation": self.occupation,
            "city": self.city,
            "interests": self.interests or [],
            "prompt": (
                {"question": self.prompt_question, "answer": self.prompt_answer}
                if self.prompt_question and self.prompt_answer else None
            ),
            "is_verified": self.is_verified,
            "is_admin": self.is_admin,
            "kyc_status": self.kyc_status,
            "nearby_visible": self.nearby_visible,
            "current_lat": self.current_lat,
            "current_lng": self.current_lng,
            "created_at": self.created_at.isoformat(),
            "photos": [p.to_dict() for p in photos],
        }


class ProfilePhoto(db.Model):
    """
    Multiple photos per user, ordered by `position` -- position 0 is the primary
    photo shown on cards/profile headers. url is a relative path served by the
    /uploads/<path> static route (see routes/photos.py + app/__init__.py); it is
    NOT a full URL, so the frontend always needs to prefix it with the API origin.
    """
    __tablename__ = "profile_photos"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    url = db.Column(db.String(255), nullable=False)
    # Set only when stored on Cloudinary (see app/utils/cloud_storage.py) — lets
    # delete_photo() clean up the actual asset there, not just the DB row. Null
    # for photos stored on local disk (deletion there just uses the url's filename).
    cloud_public_id = db.Column(db.String(255), nullable=True)
    position = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {"id": self.id, "url": self.url, "position": self.position}
