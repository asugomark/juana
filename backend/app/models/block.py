from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Block(db.Model):
    """
    One-directional block: blocker_id doesn't want to see or hear from
    blocked_id. Enforcement is checked in TWO places deliberately: routes/
    messages.py (can't message across a block either direction) and routes/
    nearby.py + routes/users.py (excluded from discovery either direction) --
    a block should be invisible and silent, not something that tips the
    blocked person off that it happened.
    """
    __tablename__ = "blocks"
    __table_args__ = (db.UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),)

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    blocker_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    blocked_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


def is_blocked_either_way(user_a_id, user_b_id):
    """True if either user has blocked the other. Single source of truth —
    every enforcement point below imports this rather than re-writing the OR query."""
    return db.session.query(Block.id).filter(
        db.or_(
            db.and_(Block.blocker_id == user_a_id, Block.blocked_id == user_b_id),
            db.and_(Block.blocker_id == user_b_id, Block.blocked_id == user_a_id),
        )
    ).first() is not None
