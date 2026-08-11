from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.hangout import Hangout, HangoutMember
from app.models.rating import Rating

ratings_bp = Blueprint("ratings", __name__, url_prefix="/api")


@ratings_bp.post("/hangouts/<hangout_id>/rating")
@jwt_required()
def submit_rating(hangout_id):
    """
    Upsert semantics -- resubmitting just updates your existing rating rather
    than erroring, since someone revising their opinion after posting is
    normal, not a bug to guard against.
    """
    rater_id = get_jwt_identity()
    hangout = Hangout.query.get_or_404(hangout_id)

    if hangout.host_id == rater_id:
        return jsonify({"error": "cannot rate your own hangout"}), 400

    was_member = HangoutMember.query.filter_by(
        hangout_id=hangout_id, user_id=rater_id
    ).filter(HangoutMember.status.in_(["active", "left"])).first()
    if not was_member:
        return jsonify({"error": "only people who joined this hangout can rate it"}), 403

    data = request.get_json() or {}
    stars = data.get("stars")
    if not isinstance(stars, int) or not (1 <= stars <= 5):
        return jsonify({"error": "stars must be an integer from 1 to 5"}), 400

    existing = Rating.query.filter_by(hangout_id=hangout_id, rater_user_id=rater_id).first()
    if existing:
        existing.stars = stars
        existing.comment = (data.get("comment") or "").strip()[:1000] or None
    else:
        db.session.add(Rating(
            hangout_id=hangout_id,
            rater_user_id=rater_id,
            host_id=hangout.host_id,
            stars=stars,
            comment=(data.get("comment") or "").strip()[:1000] or None,
        ))

    db.session.commit()
    return jsonify({"status": "saved"}), 200


@ratings_bp.get("/hangouts/<hangout_id>/rating")
@jwt_required()
def my_rating(hangout_id):
    rater_id = get_jwt_identity()
    rating = Rating.query.filter_by(hangout_id=hangout_id, rater_user_id=rater_id).first()
    return jsonify(rating.to_dict() if rating else None)


@ratings_bp.get("/users/<user_id>/rating-summary")
def rating_summary(user_id):
    """
    Public, no auth needed — this is meant to show up on a profile anyone can
    view, same trust-signal spirit as the Verified badge. One aggregate query,
    not run as part of to_public_dict() (see module note) so it doesn't fire
    on every single user object serialized elsewhere in the app.
    """
    row = db.session.query(
        db.func.avg(Rating.stars), db.func.count(Rating.id)
    ).filter(Rating.host_id == user_id).first()
    average, count = row
    return jsonify({
        "average": round(float(average), 1) if average is not None else None,
        "count": count or 0,
    })


@ratings_bp.get("/users/<user_id>/ratings")
def list_ratings(user_id):
    """Public — the actual reviews shown on a host's profile."""
    ratings = (
        Rating.query.filter_by(host_id=user_id)
        .order_by(Rating.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify([r.to_dict() for r in ratings])
