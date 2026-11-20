import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy.orm import joinedload
from app.extensions import db
from app.models.user import User

logger = logging.getLogger(__name__)
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        display_name = (data.get("display_name") or "").strip()
        birthdate = data.get("birthdate")  # expected "YYYY-MM-DD"

        if not email or not password or not display_name or not birthdate:
            return jsonify({"error": "email, password, display_name, and birthdate are required"}), 400

        if User.query.filter_by(email=email).first():
            return jsonify({"error": "an account with that email already exists"}), 409

        try:
            birthdate_parsed = datetime.strptime(birthdate, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "birthdate must be in YYYY-MM-DD format"}), 400

        age = (datetime.utcnow().date() - birthdate_parsed).days // 365
        if age < 18:
            return jsonify({"error": "you must be 18 or older to use Juana"}), 403

        user = User(email=email, display_name=display_name, birthdate=birthdate_parsed)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        token = create_access_token(identity=str(user.id))
        return jsonify({"token": token, "user": user.to_private_dict()}), 201
    except Exception as exc:
        db.session.rollback()
        logger.exception("Error during user registration: %s", exc)
        return jsonify({"error": "Registration failed due to a server error. Please try again."}), 500


@auth_bp.post("/login")
def login():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({"error": "email and password are required"}), 400

        user = User.query.options(joinedload(User.photos)).filter_by(email=email).first()
        if not user or not user.check_password(password):
            return jsonify({"error": "invalid email or password"}), 401

        if user.is_banned:
            return jsonify({"error": "This account has been suspended.", "reason": user.ban_reason}), 403

        token = create_access_token(identity=str(user.id))
        return jsonify({"token": token, "user": user.to_private_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        logger.exception("Error during user login: %s", exc)
        return jsonify({"error": "Login failed due to a server error. Please try again."}), 500


@auth_bp.get("/me")
@jwt_required()
def me():
    try:
        user_id = get_jwt_identity()
        user = User.query.options(joinedload(User.photos)).filter_by(id=user_id).first()
        if not user:
            return jsonify({"error": "user not found"}), 404
        return jsonify(user.to_private_dict())
    except Exception as exc:
        logger.exception("Error fetching current user profile: %s", exc)
        return jsonify({"error": "Failed to load user profile"}), 500


@auth_bp.patch("/me")
@jwt_required()
def update_me():
    """
    Self-service profile edit. Deliberately narrow — only the fields the profile
    screen actually displays (bio, occupation, city, interests, prompt).
    """
    try:
        user_id = get_jwt_identity()
        user = User.query.options(joinedload(User.photos)).filter_by(id=user_id).first()
        if not user:
            return jsonify({"error": "user not found"}), 404

        data = request.get_json() or {}

        if "bio" in data:
            user.bio = (data["bio"] or "").strip()[:2000] or None
        if "occupation" in data:
            user.occupation = (data["occupation"] or "").strip()[:120] or None
        if "city" in data:
            user.city = (data["city"] or "").strip()[:120] or None
        if "interests" in data:
            interests = data["interests"]
            if not isinstance(interests, list) or not all(isinstance(i, str) for i in interests):
                return jsonify({"error": "interests must be a list of strings"}), 400
            user.interests = [i.strip()[:40] for i in interests if i.strip()][:10]
        if "prompt_question" in data:
            user.prompt_question = (data["prompt_question"] or "").strip()[:120] or None
        if "prompt_answer" in data:
            user.prompt_answer = (data["prompt_answer"] or "").strip()[:280] or None

        db.session.commit()
        return jsonify(user.to_private_dict())
    except Exception as exc:
        db.session.rollback()
        logger.exception("Error updating user profile: %s", exc)
        return jsonify({"error": "Failed to update profile"}), 500
