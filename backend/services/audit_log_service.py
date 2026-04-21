"""Audit logging helpers."""

from sqlalchemy.orm import Session

from models.audit_log import AuditLog


def create_audit_log(
    db: Session,
    action: str,
    event_type: str = "system",
    user_id: int | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    row = AuditLog(
        user_id=user_id,
        action=action,
        event_type=event_type,
        ip_address=ip_address,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row
