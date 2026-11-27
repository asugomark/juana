from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from app.models.user import User


def admin_required(fn):
    """
    Stack ABOVE @jwt_required() usage isn't needed -- this calls
    verify_jwt_in_request() itself, so a route only needs @admin_required(),
    not both decorators. Rejects with 403 (not 404) for a non-admin caller --
    deliberately not hiding the route's existence, since these are internal
    staff tools, not something an attacker profits from knowing exists.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = User.query.get(get_jwt_identity())
        if not user or not user.is_admin:
            return jsonify({"error": "admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper
