from datetime import datetime
from app.extensions import db
from app.models.user import gen_uuid


class Report(db.Model):
    """
    A user- or hangout-level report. hangout_id is set when reported from a
    hangout context (e.g. the safety strip on the hangout screen) even though
    the report always targets a specific person -- reported_user_id is never
    null, hangout_id is just extra context for whoever reviews it.
    """
    __tablename__ = "reports"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    reporter_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    reported_user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    hangout_id = db.Column(db.String(36), db.ForeignKey("hangouts.id"), nullable=True)

    reason = db.Column(
        db.Enum("harassment", "fake_profile", "inappropriate_content", "spam", "safety_concern", "other",
                name="report_reason_enum"),
        nullable=False,
    )
    details = db.Column(db.Text, nullable=True)

    status = db.Column(
        db.Enum("pending", "actioned", "dismissed", name="report_status_enum"),
        default="pending", nullable=False, index=True,
    )
    resolved_by = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolution_note = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    reporter = db.relationship("User", foreign_keys=[reporter_id])
    reported_user = db.relationship("User", foreign_keys=[reported_user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "reporter": self.reporter.to_public_dict(),
            "reported_user": self.reported_user.to_public_dict(),
            "hangout_id": self.hangout_id,
            "reason": self.reason,
            "details": self.details,
            "status": self.status,
            "resolution_note": self.resolution_note,
            "created_at": self.created_at.isoformat(),
        }
