"""User ORM model with role/status enums."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class UserRole(str, enum.Enum):
    VOTER = "Voter"
    SYSTEM_ADMIN = "SystemAdmin"
    ELECTION_BOARD = "ElectionBoard"
    ELECTION_OFFICER = "ElectionOfficer"
    AUDIT_AUTHORITY = "AuditAuthority"


class AccountStatus(str, enum.Enum):
    PENDING = "Pending"
    ACTIVE = "Active"
    SUSPENDED = "Suspended"
    DISABLED = "Disabled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    national_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    contact_info: Mapped[str | None] = mapped_column(String(120), nullable=True)
    username: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    account_status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus), nullable=False, default=AccountStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    voter_profile = relationship("VoterProfile", back_populates="user", uselist=False)
    system_admin_profile = relationship("SystemAdminProfile", back_populates="user", uselist=False)
    election_board_profile = relationship(
        "ElectionBoardProfile", back_populates="user", uselist=False
    )
    audit_authority_profile = relationship(
        "AuditAuthorityProfile", back_populates="user", uselist=False
    )
    audit_logs = relationship("AuditLog", back_populates="user")
    votes_cast = relationship("Vote", back_populates="voter_user")
