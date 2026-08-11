from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Message(db.Model):
    """
    Single table for both message types:
      - hangout group chat: hangout_id set, recipient_id null
      - Hola 1:1 dm:        hangout_id null,  recipient_id set
    Kept as one table since chat UI and moderation tooling treat them very similarly;
    split into separate tables later only if scale actually demands it.

    Media: media_url/media_type are set for photo/video attachments (see
    routes/media.py). body doubles as the caption when media is present, and is
    nullable now specifically to allow media-with-no-caption sends -- at least
    one of body/media_url must be set, enforced in the route, not the model.
    """
    __tablename__ = "messages"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    sender_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)

    hangout_id = db.Column(db.String(36), db.ForeignKey("hangouts.id"), nullable=True, index=True)
    recipient_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True, index=True)

    body = db.Column(db.Text, nullable=True)
    media_url = db.Column(db.String(255), nullable=True)
    media_type = db.Column(db.Enum("image", "video", name="message_media_type_enum"), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    sender = db.relationship("User", foreign_keys=[sender_id])

    def to_dict(self):
        return {
            "id": self.id,
            "sender": self.sender.to_public_dict(),
            "hangout_id": self.hangout_id,
            "recipient_id": self.recipient_id,
            "body": self.body,
            "media_url": self.media_url,
            "media_type": self.media_type,
            "created_at": self.created_at.isoformat(),
        }
