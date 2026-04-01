"""Election ORM model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Election(Base):
    __tablename__ = "elections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    eligibility_rule: Mapped[str] = mapped_column(Text, default="")
    ballot_format: Mapped[str] = mapped_column(Text, default="")
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    results_approved: Mapped[bool] = mapped_column(default=False)
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    candidates = relationship("Candidate", back_populates="election", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="election", cascade="all, delete-orphan")
