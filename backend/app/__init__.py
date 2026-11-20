import os
import logging
from flask import Flask, jsonify
from sqlalchemy import text
from app.config import Config
from app.extensions import db, migrate, jwt, cors, socketio
from app.commands import register_commands

logger = logging.getLogger(__name__)


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Insecure key check in production
    if not app.debug:
        if app.config.get("SECRET_KEY") == "dev-secret-change-me":
            logger.warning("CRITICAL: SECRET_KEY is using the default development key. Set SECRET_KEY in your .env for production!")
        if app.config.get("JWT_SECRET_KEY") == "dev-jwt-secret-change-me":
            logger.warning("CRITICAL: JWT_SECRET_KEY is using the default development key. Set JWT_SECRET_KEY in your .env for production!")

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["MEDIA_UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["STATUS_UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["KYC_UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    # Robust CORS origins: support comma-separated origins or list or wildcard
    raw_origins = app.config.get("CORS_ORIGIN", "*")
    if isinstance(raw_origins, str):
        if "," in raw_origins:
            cors_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
        else:
            cors_origins = raw_origins.strip()
    else:
        cors_origins = raw_origins

    cors.init_app(
        app,
        resources={
            r"/api/*": {"origins": cors_origins},
            r"/uploads/*": {"origins": cors_origins},
        },
    )
    socketio.init_app(app, cors_allowed_origins=cors_origins)

    from app.models import (
        User,
        ProfilePhoto,
        Venue,
        Hangout,
        HangoutMember,
        Message,
        MessagingPass,
        Transaction,
        Status,
        Like,
        Report,
        Block,
        Rating,
        PaymentCredential,
        Expense,
        KycSubmission,
    )  # noqa: F401
    from app.routes import register_blueprints

    register_blueprints(app)
    register_commands(app)

    from app import sockets  # noqa: F401  registers Socket.IO event handlers

    @app.get("/api/health")
    def health():
        db_healthy = True
        try:
            db.session.execute(text("SELECT 1"))
        except Exception as exc:
            logger.error("Database health check failed: %s", exc)
            db_healthy = False

        status_code = 200 if db_healthy else 503
        return jsonify({
            "status": "ok" if db_healthy else "degraded",
            "database": "connected" if db_healthy else "unreachable"
        }), status_code

    return app
