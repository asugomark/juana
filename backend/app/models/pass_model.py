from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class MessagingPass(db.Model):
    """
    An active messaging entitlement. Unlocks sending anywhere on the platform —
    both hangout group chat and Hola — for the given window.
    Granted either by direct purchase or automatically when joining a paid hangout.
    """
    __tablename__ = "messaging_passes"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)

    tier = db.Column(db.Enum("day", "week", "month", name="pass_tier_enum"), nullable=False)
    starts_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    # Where this pass came from — direct purchase vs. auto-granted by a paid hangout join.
    source = db.Column(
        db.Enum("purchase", "hangout_join", "newbie", name="pass_source_enum"),
        nullable=False,
    )
    source_hangout_id = db.Column(db.String(36), db.ForeignKey("hangouts.id"), nullable=True)

    def is_active(self):
        return self.expires_at > datetime.utcnow()


class Transaction(db.Model):
    """
    Payment ledger. A pass purchase creates one row. A paid-hangout join that
    auto-grants a pass ALSO creates one row here (revenue attributed to the host).
    Payouts to hosts are negative-amount rows with type='payout'.
    """
    __tablename__ = "transactions"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)

    type = db.Column(
        db.Enum("pass_purchase", "hangout_join_paid", "payout", name="txn_type_enum"),
        nullable=False,
    )
    amount_cents = db.Column(db.Integer, nullable=False)  # positive = revenue in, negative = payout out
    currency = db.Column(db.String(3), default="kes", nullable=False)  # SasaPay settles in KES

    # For hangout_join_paid: who the revenue is attributed to (the host) so earnings.py can sum it.
    host_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True, index=True)
    hangout_id = db.Column(db.String(36), db.ForeignKey("hangouts.id"), nullable=True)

    # SasaPay tracking — checkout_request_id comes back from the initial collection/payout
    # call; sasapay_transaction_code is SasaPay's own reference, set once the IPN callback
    # confirms the result. Both nullable since payout rows and edge cases may not have one.
    checkout_request_id = db.Column(db.String(120), nullable=True, index=True)
    sasapay_transaction_code = db.Column(db.String(120), nullable=True)

    status = db.Column(
        db.Enum("pending", "completed", "failed", "refunded", name="txn_status_enum"),
        default="pending",
        nullable=False,
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
