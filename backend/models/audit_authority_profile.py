"""Audit authority profile ORM model."""

from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class AuditAccessLevel(str, enum.Enum):
    READ_ONLY = "ReadOnly"
    FULL_AUDIT = "FullAudit"


class AuditAuthorityProfile(Base):
    __tablename__ = "audit_authority_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    organization: Mapped[str] = mapped_column(String(150), default="")
    access_level: Mapped[AuditAccessLevel] = mapped_column(
        Enum(AuditAccessLevel), default=AuditAccessLevel.READ_ONLY
    )

    user = relationship("User", back_populates="audit_authority_profile")
