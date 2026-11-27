from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.block import is_blocked_either_way
from app.utils.geo import start_nearby_session, end_nearby_session, is_nearby_session_active, haversine_miles
from app.utils.mood import MOODS, MOOD_KEYS

nearby_bp = Blueprint("nearby", __name__, url_prefix="/api/nearby")


@nearby_bp.post("/start")
@jwt_required()
def start():
    user = User.query.get_or_404(get_jwt_identity())
    data = request.get_json() or {}
    lat, lng = data.get("lat"), data.get("lng")
    if lat is None or lng is None:
        return jsonify({"error": "lat and lng are required"}), 400

    # Optional so older app versions keep working (no mood = nothing shown); the new "Go live" step
    # always sends one. Anything not on the list is refused rather than stored.
    mood = data.get("mood")
    if mood is not None and mood not in MOOD_KEYS:
        return jsonify({"error": "unknown mood"}), 400

    start_nearby_session(user, lat, lng, venue_id=data.get("venue_id"), hours=data.get("hours", 2), mood=mood)
    db.session.commit()
    return jsonify({"nearby_visible": True, "nearby_mood": user.nearby_mood, "expires_at": user.nearby_expires_at.isoformat()})


@nearby_bp.get("/moods")
@jwt_required()
def list_moods():
    """The fixed set of moods, so the app never hard-codes wording."""
    return jsonify(MOODS)


@nearby_bp.patch("/mood")
@jwt_required()
def change_mood():
    """Change your mood while live, without turning Nearby off and on (which would re-ask for location)."""
    user = User.query.get_or_404(get_jwt_identity())
    if not is_nearby_session_active(user):
        return jsonify({"error": "you're not live right now"}), 409
    mood = (request.get_json() or {}).get("mood")
    if mood not in MOOD_KEYS:
        return jsonify({"error": "unknown mood"}), 400
    user.nearby_mood = mood
    db.session.commit()
    return jsonify({"nearby_mood": mood})


@nearby_bp.post("/end")
@jwt_required()
def end():
    """One tap to disappear — clears position data entirely, not just a flag flip."""
    user = User.query.get_or_404(get_jwt_identity())
    end_nearby_session(user)
    db.session.commit()
    return jsonify({"nearby_visible": False})


@nearby_bp.get("/users")
@jwt_required()
def nearby_users():
    """Only returns users with an active, unexpired nearby session — never stale positions."""
    requester_id = get_jwt_identity()
    requester = User.query.get_or_404(requester_id)

    if not is_nearby_session_active(requester):
        return jsonify({"error": "turn on nearby visibility to browse who's around"}), 403

    radius_mi = request.args.get("radius_mi", default=1, type=float)

    candidates = User.query.filter(
        User.nearby_visible.is_(True),
        User.id != requester_id,
    ).all()

    results = []
    for u in candidates:
        if not is_nearby_session_active(u):
            continue
        if is_blocked_either_way(requester_id, u.id):
            continue  # invisible either direction — see models/block.py
        distance = haversine_miles(requester.current_lat, requester.current_lng, u.current_lat, u.current_lng)
        if distance <= radius_mi:
            entry = u.to_public_dict()
            entry["distance_mi"] = round(distance, 1)
            entry["mood"] = u.nearby_mood  # only ever read here, for people whose session is active
            results.append(entry)

    results.sort(key=lambda r: r["distance_mi"])
    return jsonify(results)
