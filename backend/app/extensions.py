import os
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()

# Supports horizontal scaling across multiple Gunicorn workers or container replicas
# if REDIS_URL is provided (e.g., redis://redis:6379/0).
# In single-worker deployments without Redis, operates in-memory.
redis_url = os.environ.get("REDIS_URL")
socketio = SocketIO(
    cors_allowed_origins="*",
    message_queue=redis_url if redis_url else None
)
