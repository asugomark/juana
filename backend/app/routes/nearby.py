from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.block import is_blocked_either_way
from app.utils.geo import start_nearby_session, end_nearby_session, is_nearby_session_active, haversine_miles

nearby_bp = Blueprint("nearby", __name__, url_prefix="/api/nearby")


@nearby_bp.post("/start")
@jwt_required()
def start():
    user = User.query.get_or_404(get_jwt_identity())
    data = request.get_json() or {}
    lat, lng = data.get("lat"), data.get("lng")
    if lat is None or lng is None:
        return jsonify({"error": "lat and lng are required"}), 400

    start_nearby_session(user, lat, lng, venue_id=data.get("venue_id"), hours=data.get("hours", 2))
    db.session.commit()
    return jsonify({"nearby_visible": True, "expires_at": user.nearby_expires_at.isoformat()})


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
            results.append(entry)

    results.sort(key=lambda r: r["distance_mi"])
    return jsonify(results)
