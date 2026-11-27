import os
from flask import Flask
from app.config import Config
from app.extensions import db, migrate, jwt, cors, socketio


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["MEDIA_UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["STATUS_UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["KYC_UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGIN"]}})
    socketio.init_app(app)

    from app.models import User, ProfilePhoto, Venue, Hangout, HangoutMember, Message, MessagingPass, Transaction, Status, Like, Report, Block, Rating, PaymentCredential, Expense, KycSubmission  # noqa: F401
    from app.routes import register_blueprints
    register_blueprints(app)

    from app import sockets  # noqa: F401  registers Socket.IO event handlers

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app
