"""
Messaging entitlement rules, matching what we designed:

- New users get NEWBIE_FREE_MESSAGES free sends before ever needing a pass.
- A pass unlocks sending platform-wide (group + Hola), for its whole window.
- Joining a paid hangout auto-grants the matching pass (see routes/hangouts.py join()).
- No soft warning / grace period on expiry — the check is a hard boolean at send-time.
"""
from datetime import datetime, timedelta
from flask import current_app
from app.extensions import db
from app.models.pass_model import MessagingPass
from app.models.user import User

PASS_DURATIONS = {
    "day": timedelta(days=1),
    "week": timedelta(days=7),
    "month": timedelta(days=30),
}


def has_active_pass(user_id: str) -> bool:
    active = (
        MessagingPass.query.filter_by(user_id=user_id)
        .filter(MessagingPass.expires_at > datetime.utcnow())
        .first()
    )
    return active is not None


def can_user_send_message(user: User) -> bool:
    """The single source of truth the message-send routes check before writing anything."""
    if user.newbie_messages_used < current_app.config["NEWBIE_FREE_MESSAGES"]:
        return True
    return has_active_pass(user.id)


def consume_newbie_allowance_if_applicable(user: User):
    """Call this AFTER a message successfully sends, only if no active pass covered it."""
    if not has_active_pass(user.id):
        user.newbie_messages_used += 1
        db.session.add(user)


def grant_pass(user_id: str, tier: str, source: str, source_hangout_id: str = None) -> MessagingPass:
    now = datetime.utcnow()
    new_pass = MessagingPass(
        user_id=user_id,
        tier=tier,
        starts_at=now,
        expires_at=now + PASS_DURATIONS[tier],
        source=source,
        source_hangout_id=source_hangout_id,
    )
    db.session.add(new_pass)
    return new_pass
