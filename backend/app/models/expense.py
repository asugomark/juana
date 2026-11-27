from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Expense(db.Model):
    """
    Manually-entered operating costs (SasaPay transaction fees, infrastructure,
    marketing, etc). Nothing in this system generates these automatically —
    Juana's own SasaPay/hosting/tooling bills live outside this app, so an
    admin logs them here. Without this table, an "income statement" would
    really just be a relabeled revenue report; Net Income = Revenue - Expenses
    only means something once Expenses is real data, not zero by omission.
    """
    __tablename__ = "expenses"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    category = db.Column(
        db.Enum("infrastructure", "payment_processing_fees", "marketing", "salaries", "other",
                name="expense_category_enum"),
        nullable=False,
    )
    description = db.Column(db.String(255), nullable=False)
    amount_cents = db.Column(db.Integer, nullable=False)  # always positive; this table is inherently "money out"
    incurred_at = db.Column(db.Date, nullable=False)  # the date the cost applies to, not when it was logged
    created_by = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "description": self.description,
            "amount_cents": self.amount_cents,
            "incurred_at": self.incurred_at.isoformat(),
            "created_at": self.created_at.isoformat(),
        }
