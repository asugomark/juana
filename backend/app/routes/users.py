from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.hangout import Hangout, HangoutMember
from app.models.message import Message
from app.models.block import is_blocked_either_way

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


@users_bp.get("/suggestions")
@jwt_required()
def suggestions():
    """
    "People you might like" for the Hola page — ranked by shared interests
    with the viewer. Deliberately excludes anyone you already have a Hola
    thread with (surfacing someone you're already talking to isn't a
    suggestion, it's noise) and anyone with zero interest overlap (an
    unranked "everyone else" list isn't a real recommendation).

    Registered ABOVE /<user_id> below so "suggestions" is never swallowed as
    a user_id -- Werkzeug generally prefers static routes anyway, but this
    removes any ambiguity rather than relying on that.

    Scale note: this loads every user with interests set and ranks them in
    Python rather than doing the overlap in SQL. Fine at hundreds-to-low-
    thousands of users; if this table grows large, move the overlap
    computation into the query itself (MySQL JSON_OVERLAPS, MySQL 8.0.17+)
    or a proper search index instead.
    """
    viewer_id = get_jwt_identity()
    viewer = User.query.get_or_404(viewer_id)
    viewer_interests = set(viewer.interests or [])

    if not viewer_interests:
        return jsonify([])  # nothing to rank against — an unranked dump isn't a real suggestion

    already_messaged = {
        row[0] for row in db.session.query(Message.sender_id)
        .filter(Message.sender_id != viewer_id, Message.recipient_id == viewer_id).all()
    } | {
        row[0] for row in db.session.query(Message.recipient_id)
        .filter(Message.sender_id == viewer_id, Message.recipient_id.isnot(None)).all()
    }

    candidates = User.query.filter(
        User.id != viewer_id,
        User.id.notin_(already_messaged) if already_messaged else True,
        User.interests.isnot(None),
    ).all()

    ranked = []
    for candidate in candidates:
        if is_blocked_either_way(viewer_id, candidate.id):
            continue  # invisible either direction — see models/block.py
        overlap = viewer_interests & set(candidate.interests or [])
        if overlap:
            entry = candidate.to_public_dict()
            entry["shared_interests"] = sorted(overlap)
            ranked.append(entry)

    ranked.sort(key=lambda e: len(e["shared_interests"]), reverse=True)
    return jsonify(ranked[:10])


@users_bp.get("/<user_id>")
@jwt_required()
def get_profile(user_id):
    """Public profile view — used by the profile screen."""
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_public_dict())


@users_bp.get("/<user_id>/mutual-hangouts")
@jwt_required()
def mutual_hangouts(user_id):
    """
    Hangouts where BOTH the viewer and the profile owner are (or were) active
    members — powers the "Hangouts in common" section. Deliberately not "live now"
    only: a shared hangout from last week is still a legitimate, non-creepy signal
    ("you've both been to Fable's game nights before"), whereas anything involving
    the OTHER user's current location does not belong on a profile at all.
    """
    viewer_id = get_jwt_identity()

    viewer_hangout_ids = {
        row[0] for row in db.session.query(HangoutMember.hangout_id)
        .filter(HangoutMember.user_id == viewer_id, HangoutMember.status.in_(["active", "left"]))
        .all()
    }
    target_hangout_ids = {
        row[0] for row in db.session.query(HangoutMember.hangout_id)
        .filter(HangoutMember.user_id == user_id, HangoutMember.status.in_(["active", "left"]))
        .all()
    }

    shared_ids = viewer_hangout_ids & target_hangout_ids
    hangouts = Hangout.query.filter(Hangout.id.in_(shared_ids)).all() if shared_ids else []

    return jsonify([h.to_dict() for h in hangouts])
