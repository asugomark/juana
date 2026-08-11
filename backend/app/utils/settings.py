"""
Encrypted settings storage + the DB-first, env-fallback lookup that lets
SasaPay credentials be set from the admin UI instead of a .env edit + restart.

Encryption key: SETTINGS_ENCRYPTION_KEY must be set in the environment — this
is the one secret that genuinely can't move into the database (you can't
encrypt secrets with a key that's stored next to them). Generate one with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

and put it in .env. There's no safe default for this — the app raises clearly
at first use if it's missing, rather than silently running unencrypted.
"""
from flask import current_app
from cryptography.fernet import Fernet, InvalidToken
from app.extensions import db
from app.models.payment_credential import PaymentCredential


def _cipher():
    key = current_app.config.get("SETTINGS_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
            "and add it to your .env — required before storing any credentials via the admin UI."
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(value):
    if value is None:
        return None
    return _cipher().encrypt(value.encode()).decode()


def decrypt(value):
    if value is None:
        return None
    try:
        return _cipher().decrypt(value.encode()).decode()
    except InvalidToken:
        # Most likely cause: SETTINGS_ENCRYPTION_KEY changed since this value
        # was encrypted. Fail loudly rather than silently returning garbage
        # that would then get sent to SasaPay as a "valid" credential.
        raise RuntimeError(
            "Could not decrypt a stored credential — SETTINGS_ENCRYPTION_KEY may have "
            "changed since it was saved. Re-enter credentials via the admin Settings tab."
        )


def get_sasapay_config():
    """
    DB-first, env-fallback. Once an admin saves credentials via the UI, this
    always returns the DB values. Until then, it transparently falls back to
    whatever's in .env (config.py's SASAPAY_* / PUBLIC_CALLBACK_BASE_URL) so
    existing setups keep working without forcing an immediate migration.
    Returns a plain dict — never the DB row itself, so callers can't
    accidentally touch the encrypted columns directly.
    """
    row = PaymentCredential.query.filter_by(provider="sasapay").first()

    if row and row.client_id_encrypted:
        return {
            "base_url": row.base_url or current_app.config["SASAPAY_BASE_URL"],
            "callback_base_url": row.callback_base_url or current_app.config["PUBLIC_CALLBACK_BASE_URL"],
            "client_id": decrypt(row.client_id_encrypted),
            "client_secret": decrypt(row.client_secret_encrypted),
            "merchant_code": decrypt(row.merchant_code_encrypted),
            "source": "database",
        }

    return {
        "base_url": current_app.config["SASAPAY_BASE_URL"],
        "callback_base_url": current_app.config["PUBLIC_CALLBACK_BASE_URL"],
        "client_id": current_app.config["SASAPAY_CLIENT_ID"] or None,
        "client_secret": current_app.config["SASAPAY_CLIENT_SECRET"] or None,
        "merchant_code": current_app.config["SASAPAY_MERCHANT_CODE"] or None,
        "source": "environment",
    }


def set_sasapay_config(*, base_url, callback_base_url, client_id, client_secret, merchant_code, updated_by):
    """
    Upsert the singleton row. client_secret may be None/blank to mean "keep
    the existing one" — the admin form never re-displays the real secret, so
    resubmitting the form without retyping it must not wipe it out.
    """
    row = PaymentCredential.query.filter_by(provider="sasapay").first()
    if not row:
        row = PaymentCredential(provider="sasapay")
        db.session.add(row)

    row.base_url = base_url
    row.callback_base_url = callback_base_url
    row.client_id_encrypted = encrypt(client_id) if client_id else row.client_id_encrypted
    row.merchant_code_encrypted = encrypt(merchant_code) if merchant_code else row.merchant_code_encrypted
    if client_secret:  # blank = keep existing, see docstring
        row.client_secret_encrypted = encrypt(client_secret)
    row.updated_by = updated_by

    db.session.commit()
    return row
