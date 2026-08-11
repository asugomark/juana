"""
Real-time layer. REST endpoints in routes/messages.py handle the actual send
(so pass-gating and persistence happen through one code path) and then emit
here — clients connect over Socket.IO purely to receive, plus join/leave rooms.
"""
from flask_socketio import join_room, leave_room
from flask_jwt_extended import decode_token
from app.extensions import socketio


@socketio.on("connect")
def handle_connect(auth):
    token = (auth or {}).get("token")
    if not token:
        return False  # reject connection
    try:
        decode_token(token)
    except Exception:
        return False


@socketio.on("join_hangout")
def handle_join_hangout(data):
    join_room(f"hangout:{data['hangout_id']}")


@socketio.on("leave_hangout")
def handle_leave_hangout(data):
    leave_room(f"hangout:{data['hangout_id']}")


@socketio.on("join_inbox")
def handle_join_inbox(data):
    """Each user joins their own room so Hola DMs can be pushed to them by user id."""
    join_room(f"user:{data['user_id']}")
