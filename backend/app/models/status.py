from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Status(db.Model):
    """
    Ephemeral text/photo/video update, expires 24h after posting (see
    config.STATUS_EXPIRY_HOURS). Visibility is NOT "everyone" or a follow
    graph -- there's no follow system in this product. Instead a status is
    visible to anyone the author has an existing real connection with:
    someone they've had a Hola conversation with, or someone currently in a
    shared hangout. See routes/status.py:feed() for exactly how that's
    computed. This keeps status updates from becoming a public-broadcast
    surface to total strangers, consistent with the deliberately-not-public
    posture of the rest of this product (nearby is opt-in, profiles require
    an account to view, etc).
    """
    __tablename__ = "statuses"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)

    kind = db.Column(db.Enum("text", "image", "video", name="status_kind_enum"), nullable=False)
    text_content = db.Column(db.Text, nullable=True)  # the post body for kind='text', or a caption otherwise
    media_url = db.Column(db.String(255), nullable=True)  # set for kind='image'/'video'
    # Set only when stored on Cloudinary — see ProfilePhoto.cloud_public_id for
    # the same reasoning (clean deletion of the actual asset, not just the row).
    cloud_public_id = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)  # always set explicitly in routes/status.py from config.STATUS_EXPIRY_HOURS

    author = db.relationship("User", foreign_keys=[user_id])

    def is_active(self):
        return self.expires_at > datetime.utcnow()

    def to_dict(self):
        return {
            "id": self.id,
            "author": self.author.to_public_dict(),
            "kind": self.kind,
            "text_content": self.text_content,
            "media_url": self.media_url,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }
