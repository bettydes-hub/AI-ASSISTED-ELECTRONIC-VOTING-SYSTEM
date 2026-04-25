"""Election ORM model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Election(Base):
    __tablename__ = "elections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    election_type: Mapped[str] = mapped_column(String(40), default="PRESIDENTIAL")
    election_scope: Mapped[str] = mapped_column(String(20), default="NATIONAL")
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    eligibility_rule: Mapped[str] = mapped_column(Text, default="")
    ballot_format: Mapped[str] = mapped_column(Text, default="")
    positions: Mapped[str] = mapped_column(Text, default="")
    allowed_party_ids: Mapped[str] = mapped_column(Text, default="")
    minimum_candidate_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_candidates_per_party: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    campaign_start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    campaign_end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voting_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    registration_start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    registration_end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    results_approved: Mapped[bool] = mapped_column(default=False)
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    candidates = relationship("Candidate", back_populates="election", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="election", cascade="all, delete-orphan")
