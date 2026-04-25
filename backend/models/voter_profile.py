"""Voter profile ORM model."""

from __future__ import annotations

import enum

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class VerificationStatus(str, enum.Enum):
    NOT_VERIFIED = "NotVerified"
    VERIFIED = "Verified"


class VoterProfile(Base):
    __tablename__ = "voter_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    voter_id: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    biometric_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    has_voted: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus), default=VerificationStatus.NOT_VERIFIED
    )

    user = relationship("User", back_populates="voter_profile")
