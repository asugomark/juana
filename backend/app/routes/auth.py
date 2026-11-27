from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
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

    token = create_access_token(identity=user.id)
    return jsonify({"token": token, "user": user.to_private_dict()}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "invalid email or password"}), 401

    if user.is_banned:
        return jsonify({"error": "This account has been suspended.", "reason": user.ban_reason}), 403

    token = create_access_token(identity=user.id)
    return jsonify({"token": token, "user": user.to_private_dict()}), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    user = User.query.get_or_404(get_jwt_identity())
    return jsonify(user.to_private_dict())


@auth_bp.patch("/me")
@jwt_required()
def update_me():
    """
    Self-service profile edit. Deliberately narrow — only the fields the profile
    screen actually displays (bio, occupation, city, interests, prompt). Nothing
    here touches email, password, verification status, or KYC; those need their
    own dedicated, more-guarded flows.
    """
    user = User.query.get_or_404(get_jwt_identity())
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
