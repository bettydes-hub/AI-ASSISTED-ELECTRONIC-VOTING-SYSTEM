"""Election board profile ORM model."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class ElectionBoardProfile(Base):
    __tablename__ = "election_board_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    position: Mapped[str] = mapped_column(String(100), default="")
    assigned_elections: Mapped[str] = mapped_column(Text, default="")

    user = relationship("User", back_populates="election_board_profile")
