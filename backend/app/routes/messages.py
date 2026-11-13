from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, socketio
from app.models.user import User
from app.models.hangout import Hangout, HangoutMember
from app.models.message import Message
from app.models.block import is_blocked_either_way
from app.utils.passes import can_user_send_message, consume_newbie_allowance_if_applicable, pass_required_payload

messages_bp = Blueprint("messages", __name__, url_prefix="/api")


def _require_active_member(hangout_id, user_id):
    return HangoutMember.query.filter_by(
        hangout_id=hangout_id, user_id=user_id, status="active"
    ).first()


# ---------- Hangout group chat ----------

@messages_bp.get("/hangouts/<hangout_id>/messages")
@jwt_required()
def list_hangout_messages(hangout_id):
    user_id = get_jwt_identity()
    if not _require_active_member(hangout_id, user_id):
        return jsonify({"error": "not a member of this hangout"}), 403

    msgs = (
        Message.query.filter_by(hangout_id=hangout_id)
        .order_by(Message.created_at.asc())
        .limit(200)
        .all()
    )
    return jsonify([m.to_dict() for m in msgs])


@messages_bp.post("/hangouts/<hangout_id>/messages")
@jwt_required()
def send_hangout_message(hangout_id):
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)

    if not _require_active_member(hangout_id, user_id):
        return jsonify({"error": "not a member of this hangout"}), 403

    if Hangout.query.get_or_404(hangout_id).status() == "ended":
        return jsonify({"error": "hangout_ended", "message": "This hangout has ended — the chat is closed."}), 410

    # Hard gate — no grace period, matches the "no soft warning" rule from the design.
    if not can_user_send_message(user):
        return jsonify(pass_required_payload(user.id)), 402

    body = (request.get_json() or {}).get("body", "").strip()
    if not body:
        return jsonify({"error": "body is required"}), 400

    msg = Message(sender_id=user_id, hangout_id=hangout_id, body=body)
    db.session.add(msg)
    consume_newbie_allowance_if_applicable(user)
    db.session.commit()

    payload = msg.to_dict()
    socketio.emit("hangout_message", payload, room=f"hangout:{hangout_id}")
    return jsonify(payload), 201


# ---------- Hola 1:1 ----------

@messages_bp.get("/hola/<other_user_id>/messages")
@jwt_required()
def list_hola_thread(other_user_id):
    user_id = get_jwt_identity()
    msgs = (
        Message.query.filter(
            Message.hangout_id.is_(None),
            db.or_(
                db.and_(Message.sender_id == user_id, Message.recipient_id == other_user_id),
                db.and_(Message.sender_id == other_user_id, Message.recipient_id == user_id),
            ),
        )
        .order_by(Message.created_at.asc())
        .limit(200)
        .all()
    )
    return jsonify([m.to_dict() for m in msgs])


@messages_bp.post("/hola/<other_user_id>/messages")
@jwt_required()
def send_hola_message(other_user_id):
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)

    if user_id == other_user_id:
        return jsonify({"error": "cannot message yourself"}), 400

    if is_blocked_either_way(user_id, other_user_id):
        # Deliberately vague, not "you were blocked" — see models/block.py docstring
        # on why a block should be silent rather than announcing itself.
        return jsonify({"error": "unable to send message"}), 403

    if not can_user_send_message(user):
        return jsonify(pass_required_payload(user.id)), 402

    body = (request.get_json() or {}).get("body", "").strip()
    if not body:
        return jsonify({"error": "body is required"}), 400

    msg = Message(sender_id=user_id, recipient_id=other_user_id, body=body)
    db.session.add(msg)
    consume_newbie_allowance_if_applicable(user)
    db.session.commit()

    payload = msg.to_dict()
    socketio.emit("hola_message", payload, room=f"user:{other_user_id}")
    return jsonify(payload), 201


# ---------- Inbox ----------

@messages_bp.get("/hola")
@jwt_required()
def list_hola_inbox():
    """
    Most recent message per counterpart -- powers the Hola inbox list.

    Bug this fixes: earlier the frontend displayed last_message.sender's name,
    which is wrong the moment YOU sent the last message in a thread (it would
    show your own name back at you instead of who you're talking to). This
    endpoint now resolves and returns the actual other-party User object
    directly, so the frontend never has to guess which side of the message
    "belongs" to the thread owner.
    """
    user_id = get_jwt_identity()
    msgs = (
        Message.query.filter(
            Message.hangout_id.is_(None),
            db.or_(Message.sender_id == user_id, Message.recipient_id == user_id),
        )
        .order_by(Message.created_at.desc())
        .all()
    )

    seen = set()
    threads = []
    for m in msgs:
        other_id = m.recipient_id if m.sender_id == user_id else m.sender_id
        if other_id in seen:
            continue
        seen.add(other_id)
        other_user = User.query.get(other_id)
        threads.append({
            "with_user_id": other_id,
            "other_user": other_user.to_public_dict() if other_user else None,
            "last_message": m.to_dict(),
            "last_message_is_mine": m.sender_id == user_id,
        })

    return jsonify(threads)
