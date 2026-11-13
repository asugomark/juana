from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class HangoutRecapPost(db.Model):
    """
    "How it went down" — persistent (unlike Status, which expires in 24h)
    photo/video posts attached to a specific hangout, visible only to people
    who were actually there (active or left membership — see routes/
    hangout_recap.py). Only exists at all when the hangout's own allow_recap
    is True; a host can turn that off at creation for a more private event,
    in which case this table just never gets rows for that hangout_id.
    """
    __tablename__ = "hangout_recap_posts"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    hangout_id = db.Column(db.String(36), db.ForeignKey("hangouts.id"), nullable=False, index=True)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)

    media_url = db.Column(db.String(255), nullable=False)
    media_type = db.Column(db.Enum("image", "video", name="recap_media_type_enum"), nullable=False)
    cloud_public_id = db.Column(db.String(255), nullable=True)  # set when stored on Cloudinary, see cloud_storage.py
    caption = db.Column(db.String(280), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    poster = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "hangout_id": self.hangout_id,
            "poster": self.poster.to_public_dict(),
            "media_url": self.media_url,
            "media_type": self.media_type,
            "caption": self.caption,
            "created_at": self.created_at.isoformat(),
        }