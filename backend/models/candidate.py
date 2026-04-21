"""Candidate ORM model."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (UniqueConstraint("election_id", "name", name="uq_candidate_name_per_election"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    profile_info: Mapped[str] = mapped_column(Text, default="")
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    phone_number: Mapped[str] = mapped_column(String(40), default="")
    email_address: Mapped[str] = mapped_column(String(120), default="")
    running_position: Mapped[str] = mapped_column(String(80), default="")
    election_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
    region_district: Mapped[str] = mapped_column(String(160), default="")
    photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    candidate_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id"), nullable=False)
    party_id: Mapped[int] = mapped_column(ForeignKey("political_parties.id"), nullable=False)

    election = relationship("Election", back_populates="candidates")
    party = relationship("PoliticalParty", back_populates="candidates")
    votes = relationship("Vote", back_populates="candidate")
