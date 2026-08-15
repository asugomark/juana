from app.routes.auth import auth_bp
from app.routes.hangouts import hangouts_bp
from app.routes.messages import messages_bp
from app.routes.passes import passes_bp
from app.routes.earnings import earnings_bp
from app.routes.verification import verification_bp
from app.routes.nearby import nearby_bp
from app.routes.users import users_bp
from app.routes.webhooks import webhooks_bp
from app.routes.photos import photos_bp, uploads_bp
from app.routes.media import media_bp, media_uploads_bp
from app.routes.status import status_bp, status_uploads_bp
from app.routes.likes import likes_bp
from app.routes.safety import safety_bp
from app.routes.admin import admin_bp
from app.routes.ratings import ratings_bp
from app.routes.finance_settings import finance_settings_bp
from app.routes.admin_finance import admin_finance_bp
from app.routes.admin_kyc import admin_kyc_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(hangouts_bp)
    app.register_blueprint(messages_bp)
    app.register_blueprint(passes_bp)
    app.register_blueprint(earnings_bp)
    app.register_blueprint(verification_bp)
    app.register_blueprint(nearby_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(webhooks_bp)
    app.register_blueprint(photos_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(media_uploads_bp)
    app.register_blueprint(status_bp)
    app.register_blueprint(status_uploads_bp)
    app.register_blueprint(likes_bp)
    app.register_blueprint(safety_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(ratings_bp)
    app.register_blueprint(finance_settings_bp)
    app.register_blueprint(admin_finance_bp)
    app.register_blueprint(admin_kyc_bp)
