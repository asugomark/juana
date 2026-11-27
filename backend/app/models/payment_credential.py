from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class PaymentCredential(db.Model):
    """
    Singleton row (one per provider) holding SasaPay credentials, editable from
    the admin Settings tab instead of requiring a .env edit + server restart
    every time a key changes. Sensitive fields are stored encrypted at rest
    (see app/utils/settings.py for the encrypt/decrypt helpers) — this table
    should never be queried directly for its raw column values outside that
    module; always go through get_sasapay_config()/set_sasapay_config().

    base_url and callback_base_url are NOT secrets (they're just URLs an admin
    needs to see plainly to confirm sandbox-vs-production and troubleshoot),
    so those two columns are stored as plain text. client_id, client_secret,
    and merchant_code are encrypted.
    """
    __tablename__ = "payment_credentials"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    provider = db.Column(db.String(50), unique=True, nullable=False, default="sasapay")

    base_url = db.Column(db.String(255), nullable=True)
    callback_base_url = db.Column(db.String(255), nullable=True)

    client_id_encrypted = db.Column(db.Text, nullable=True)
    client_secret_encrypted = db.Column(db.Text, nullable=True)
    merchant_code_encrypted = db.Column(db.Text, nullable=True)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
