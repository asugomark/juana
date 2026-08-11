from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Venue(db.Model):
    __tablename__ = "venues"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name = db.Column(db.String(120), nullable=False)
    address = db.Column(db.String(255), nullable=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)


class Hangout(db.Model):
    __tablename__ = "hangouts"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    host_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    venue_id = db.Column(db.String(36), db.ForeignKey("venues.id"), nullable=True)

    title = db.Column(db.String(120), nullable=False)
    icon = db.Column(db.String(8), default="●")
    description = db.Column(db.Text, nullable=True)

    starts_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    ends_at = db.Column(db.DateTime, nullable=True)

    capacity = db.Column(db.Integer, default=8, nullable=False)

    visibility = db.Column(
        db.Enum("open", "invite_only", name="hangout_visibility_enum"),
        default="open",
        nullable=False,
    )
    requires_approval = db.Column(db.Boolean, default=False, nullable=False)
    verified_only = db.Column(db.Boolean, default=False, nullable=False)

    # Paid hangouts: pass_tier determines what's auto-granted platform-wide on join.
    # None = free hangout (join is free, but messaging anywhere still needs an active pass).
    pass_tier = db.Column(
        db.Enum("day", "week", "month", name="hangout_pass_tier_enum"), nullable=True
    )

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    venue = db.relationship("Venue")
    host = db.relationship("User", foreign_keys=[host_id])

    @property
    def is_paid(self):
        return self.pass_tier is not None

    def member_count(self):
        return HangoutMember.query.filter_by(hangout_id=self.id, status="active").count()

    def to_dict(self, viewer_distance_mi=None, matched_interests=None):
        return {
            "id": self.id,
            "title": self.title,
            "icon": self.icon,
            "description": self.description,
            "starts_at": self.starts_at.isoformat(),
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "capacity": self.capacity,
            "member_count": self.member_count(),
            "visibility": self.visibility,
            "requires_approval": self.requires_approval,
            "verified_only": self.verified_only,
            "pass_tier": self.pass_tier,
            "is_paid": self.is_paid,
            "host": self.host.to_public_dict() if self.host else None,
            "venue": {
                "name": self.venue.name,
                "lat": self.venue.lat,
                "lng": self.venue.lng,
            } if self.venue else None,
            "distance_mi": round(viewer_distance_mi, 1) if viewer_distance_mi is not None else None,
            "matched_interests": matched_interests or [],
        }


class HangoutMember(db.Model):
    __tablename__ = "hangout_members"
    __table_args__ = (db.UniqueConstraint("hangout_id", "user_id", name="uq_hangout_user"),)

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    hangout_id = db.Column(db.String(36), db.ForeignKey("hangouts.id"), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)

    role = db.Column(db.Enum("host", "member", name="member_role_enum"), default="member")
    # Set from the "invited_by" field when joining via a shareable invite link
    # (see routes/hangouts.py join_hangout). Null for anyone who found the
    # hangout organically (Nearby, browsing) rather than through a specific
    # person's share link — that distinction is the whole point of tracking it.
    invited_by_user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    status = db.Column(
        db.Enum("pending", "active", "removed", "left", name="member_status_enum"),
        default="active",
        nullable=False,
    )
    joined_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # foreign_keys is required on BOTH relationships now that there are two FK
    # columns pointing at users.id (user_id and invited_by_user_id) — without
    # it, SQLAlchemy can't tell which column each relationship should join on
    # and every query touching HangoutMember fails at mapper-configuration time.
    user = db.relationship("User", foreign_keys=[user_id])
    invited_by = db.relationship("User", foreign_keys=[invited_by_user_id])
