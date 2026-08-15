from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class KycSubmission(db.Model):
    """
    One row per verification attempt — kept separate from User (rather than
    just overwriting fields on it) so a rejection + resubmission has a real
    history instead of silently erasing what an admin reviewed and why they
    rejected it. User.kyc_status always reflects the LATEST submission's
    outcome; this table is the record of every attempt that produced it.

    id_document_url / selfie_url point into KYC_UPLOAD_FOLDER (see config.py) —
    deliberately not served through any public route. Government ID photos are
    the most sensitive files this app stores; access is gated to the submitter
    themselves or an admin, checked in routes/verification.py on every fetch.
    """
    __tablename__ = "kyc_submissions"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)

    id_document_url = db.Column(db.String(255), nullable=False)
    selfie_url = db.Column(db.String(255), nullable=False)

    status = db.Column(
        db.Enum("pending", "approved", "rejected", name="kyc_submission_status_enum"),
        default="pending", nullable=False, index=True,
    )
    reviewed_by = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self, include_user=None):
        d = {
            "id": self.id,
            "user_id": self.user_id,
            "id_document_url": self.id_document_url,
            "selfie_url": self.selfie_url,
            "status": self.status,
            "rejection_reason": self.rejection_reason,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "created_at": self.created_at.isoformat(),
        }
        if include_user:
            d["user"] = include_user.to_public_dict()
        return d
