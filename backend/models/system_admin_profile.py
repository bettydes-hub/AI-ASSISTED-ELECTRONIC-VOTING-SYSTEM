"""System admin profile ORM model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class SystemAdminProfile(Base):
    __tablename__ = "system_admin_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    privileges: Mapped[str] = mapped_column(Text, default="")
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="system_admin_profile")
