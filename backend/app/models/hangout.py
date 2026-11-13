from datetime import datetime, timedelta
from flask import current_app
from app.extensions import db
from app.models.user import gen_uuid


# How long a hangout runs when nobody specified. Also the length assumed for hangouts
# created before durations existed (their ends_at is NULL) — so old rows expire too.
DEFAULT_DURATION_MINUTES = 180
MIN_DURATION_MINUTES = 15
MAX_DURATION_MINUTES = 24 * 60


def utc_iso(dt):
    """Server times are naive UTC. Without a trailing Z, browsers read them as LOCAL time,
    which made a hangout created just now show as 'started 3h ago' in Nairobi (UTC+3)."""
    return dt.isoformat() + "Z" if dt else None


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
    # The host's own entry price in KES cents (NULL = not host-priced). For these hangouts
    # pass_tier is set to the INCLUDED pass (config HANGOUT_INCLUDED_PASS) — it no longer
    # decides the price. Old tier-priced hangouts leave this NULL and keep their tier price.
    entry_price_cents = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    venue = db.relationship("Venue")
    host = db.relationship("User", foreign_keys=[host_id])

    @property
    def is_paid(self):
        return self.pass_tier is not None

    # ---- expiry ----------------------------------------------------------
    # Hangouts are never deleted when they end: earnings, ratings and (later) recap
    # posts all reference them. They just stop being discoverable, joinable and
    # writable. Everything is computed from the clock at query time, so there is no
    # scheduled job that can fail to run, and an ended hangout disappears instantly.

    def price_cents(self):
        """What a joiner pays. New hangouts carry the host's own entry price. Hangouts created
        before host-set pricing only have a tier, so they keep charging that tier's fixed price."""
        if self.entry_price_cents is not None:
            return self.entry_price_cents
        if self.pass_tier:
            return current_app.config["PASS_PRICES"][self.pass_tier]
        return None

    @property
    def effective_ends_at(self):
        return self.ends_at or (self.starts_at + timedelta(minutes=DEFAULT_DURATION_MINUTES))

    def status(self, now=None):
        """'upcoming' (scheduled, not started) | 'live' | 'ended'"""
        now = now or datetime.utcnow()
        if now >= self.effective_ends_at:
            return "ended"
        return "upcoming" if now < self.starts_at else "live"

    @classmethod
    def is_active_clause(cls, now=None):
        """SQL: not ended yet. Written without NOT(...) on purpose — rows with a NULL ends_at
        make a negated comparison evaluate to NULL, which would silently drop them."""
        now = now or datetime.utcnow()
        legacy_cutoff = now - timedelta(minutes=DEFAULT_DURATION_MINUTES)
        return db.or_(
            db.and_(cls.ends_at.isnot(None), cls.ends_at > now),
            db.and_(cls.ends_at.is_(None), cls.starts_at > legacy_cutoff),
        )

    @classmethod
    def is_ended_clause(cls, now=None):
        now = now or datetime.utcnow()
        legacy_cutoff = now - timedelta(minutes=DEFAULT_DURATION_MINUTES)
        return db.or_(
            db.and_(cls.ends_at.isnot(None), cls.ends_at <= now),
            db.and_(cls.ends_at.is_(None), cls.starts_at <= legacy_cutoff),
        )

    def member_count(self):
        return HangoutMember.query.filter_by(hangout_id=self.id, status="active").count()

    def to_dict(self, viewer_distance_mi=None, matched_interests=None):
        return {
            "id": self.id,
            "title": self.title,
            "icon": self.icon,
            "description": self.description,
            "starts_at": utc_iso(self.starts_at),
            "ends_at": utc_iso(self.ends_at),
            "effective_ends_at": utc_iso(self.effective_ends_at),
            "status": self.status(),
            "entry_price_cents": self.entry_price_cents,
            "price_cents": self.price_cents(),
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
