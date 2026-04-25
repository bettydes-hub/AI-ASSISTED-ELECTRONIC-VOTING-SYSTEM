"""Political party ORM model — full registration profile for Election Board."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class PoliticalParty(Base):
    __tablename__ = "political_parties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    scope_level: Mapped[str] = mapped_column(String(20), default="NATIONAL")
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
    abbreviation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    mission: Mapped[str] = mapped_column(Text, default="")
    vision: Mapped[str] = mapped_column(Text, default="")
    headquarters_address: Mapped[str] = mapped_column(Text, default="")

    logo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    party_registered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    operational_status: Mapped[str] = mapped_column(String(20), default="ACTIVE")

    leader_name: Mapped[str] = mapped_column(Text, default="")
    deputy_leader_name: Mapped[str] = mapped_column(Text, default="")
    leader_phone: Mapped[str] = mapped_column(String(40), default="")
    leader_email: Mapped[str] = mapped_column(String(120), default="")
    leader_image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    registration_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    supporting_document_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    regions: Mapped[str] = mapped_column(Text, default="")
    election_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    candidates = relationship("Candidate", back_populates="party")
