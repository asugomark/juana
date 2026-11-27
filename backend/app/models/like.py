from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Like(db.Model):
    """
    One-directional like. A "match" isn't a stored state — it's just the fact
    that a reciprocal row exists (A likes B AND B likes A). Computed on read
    in routes/likes.py rather than cached here, since with per-user like
    counts this small, a live query is simpler and can't drift out of sync
    with a cached flag.
    """
    __tablename__ = "likes"
    __table_args__ = (db.UniqueConstraint("from_user_id", "to_user_id", name="uq_like_pair"),)

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    from_user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    to_user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
