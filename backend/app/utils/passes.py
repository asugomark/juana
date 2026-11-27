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
    """A pass counts only inside its window [starts_at, expires_at). The start matters because
    a pass included with a SCHEDULED hangout begins when that hangout does, not when it's paid for."""
    now = datetime.utcnow()
    active = (
        MessagingPass.query.filter_by(user_id=user_id)
        .filter(MessagingPass.starts_at <= now, MessagingPass.expires_at > now)
        .first()
    )
    return active is not None


def upcoming_pass_start(user_id: str):
    """When the user's next not-yet-started pass begins (e.g. the one included with a hangout
    that hasn't started), or None. Lets the app say "your pass starts at 7pm" instead of
    telling someone who has already paid to go and buy another one."""
    row = (
        MessagingPass.query.filter_by(user_id=user_id)
        .filter(MessagingPass.starts_at > datetime.utcnow())
        .order_by(MessagingPass.starts_at.asc())
        .first()
    )
    return row.starts_at if row else None


def pass_required_payload(user_id: str) -> dict:
    """Body of the 402 every send route returns when messaging is blocked."""
    start = upcoming_pass_start(user_id)
    return {
        "error": "pass_required",
        "message": "Your pass hasn't started yet" if start else "Get a pass to send messages",
        "pass_starts_at": start.isoformat() + "Z" if start else None,
    }


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


def grant_pass(user_id: str, tier: str, source: str, source_hangout_id: str = None,
               starts_at: datetime = None) -> MessagingPass:
    """starts_at defaults to now. A hangout's included pass passes the hangout's start, so for a
    hangout scheduled days ahead the pass runs [hangout start, +tier length] — never expiring
    before the event the guest already paid for. (max() keeps already-started hangouts at now.)"""
    now = datetime.utcnow()
    start = max(now, starts_at) if starts_at else now
    new_pass = MessagingPass(
        user_id=user_id,
        tier=tier,
        starts_at=start,
        expires_at=start + PASS_DURATIONS[tier],
        source=source,
        source_hangout_id=source_hangout_id,
    )
    db.session.add(new_pass)
    return new_pass
