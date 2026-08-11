from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.like import Like

likes_bp = Blueprint("likes", __name__, url_prefix="/api/users")


def _is_match(user_a, user_b):
    reverse = Like.query.filter_by(from_user_id=user_b, to_user_id=user_a).first()
    return reverse is not None


@likes_bp.post("/<user_id>/like")
@jwt_required()
def like_user(user_id):
    liker_id = get_jwt_identity()
    if liker_id == user_id:
        return jsonify({"error": "cannot like yourself"}), 400

    existing = Like.query.filter_by(from_user_id=liker_id, to_user_id=user_id).first()
    if existing:
        return jsonify({"liked": True, "matched": _is_match(liker_id, user_id)}), 200

    db.session.add(Like(from_user_id=liker_id, to_user_id=user_id))
    db.session.commit()

    matched = _is_match(liker_id, user_id)
    return jsonify({"liked": True, "matched": matched}), 201


@likes_bp.delete("/<user_id>/like")
@jwt_required()
def unlike_user(user_id):
    liker_id = get_jwt_identity()
    like = Like.query.filter_by(from_user_id=liker_id, to_user_id=user_id).first()
    if like:
        db.session.delete(like)
        db.session.commit()
    return jsonify({"liked": False})


@likes_bp.get("/<user_id>/like-status")
@jwt_required()
def like_status(user_id):
    viewer_id = get_jwt_identity()
    liked_by_me = Like.query.filter_by(from_user_id=viewer_id, to_user_id=user_id).first() is not None
    return jsonify({"liked_by_me": liked_by_me, "matched": _is_match(viewer_id, user_id) if liked_by_me else False})
