"""Audit logging helpers."""

import hashlib
from datetime import datetime

from sqlalchemy.orm import Session

from models.audit_log import AuditLog


def create_audit_log(
    db: Session,
    action: str,
    event_type: str = "system",
    user_id: int | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    previous = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    previous_hash = previous.record_hash if previous else None
    created_at = datetime.utcnow()
    payload = "|".join(
        [
            previous_hash or "",
            event_type or "",
            action or "",
            str(user_id or ""),
            ip_address or "",
            created_at.isoformat(),
        ]
    )
    record_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    row = AuditLog(
        user_id=user_id,
        action=action,
        event_type=event_type,
        ip_address=ip_address,
        previous_hash=previous_hash,
        record_hash=record_hash,
        created_at=created_at,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def verify_audit_chain(rows: list[AuditLog]) -> dict:
    previous_hash = None
    checked = 0
    for row in sorted(rows, key=lambda x: x.id):
        payload = "|".join(
            [
                previous_hash or "",
                row.event_type or "",
                row.action or "",
                str(row.user_id or ""),
                row.ip_address or "",
                row.created_at.isoformat(),
            ]
        )
        expected_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        if row.previous_hash != previous_hash or row.record_hash != expected_hash:
            return {
                "ok": False,
                "checked_records": checked,
                "failed_record_id": row.id,
                "message": "Audit chain mismatch detected",
            }
        previous_hash = row.record_hash
        checked += 1
    return {"ok": True, "checked_records": checked, "message": "Audit chain verified"}
