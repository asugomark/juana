from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Rating(db.Model):
    """
    A rating of a hangout, given by someone who attended it. host_id is
    denormalized from hangout.host_id at rating time -- deliberately, so a
    host's aggregate rating query doesn't need to join through hangouts at
    all, and so the rating still means what it meant even if hangout host
    ownership somehow changed later (it can't currently, but denormalizing
    here costs nothing and removes the dependency).
    """
    __tablename__ = "ratings"
    __table_args__ = (db.UniqueConstraint("hangout_id", "rater_user_id", name="uq_rating_once_per_hangout"),)

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    hangout_id = db.Column(db.String(36), db.ForeignKey("hangouts.id"), nullable=False, index=True)
    rater_user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    host_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)

    stars = db.Column(db.Integer, nullable=False)  # 1-5, validated in routes/ratings.py
    comment = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    rater = db.relationship("User", foreign_keys=[rater_user_id])
    hangout = db.relationship("Hangout", foreign_keys=[hangout_id])

    def to_dict(self):
        return {
            "id": self.id,
            "rater": self.rater.to_public_dict(),
            "hangout_id": self.hangout_id,
            "hangout_title": self.hangout.title if self.hangout else None,
            "stars": self.stars,
            "comment": self.comment,
            "created_at": self.created_at.isoformat(),
        }
