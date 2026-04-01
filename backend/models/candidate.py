"""Candidate ORM model."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (UniqueConstraint("election_id", "name", name="uq_candidate_name_per_election"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    profile_info: Mapped[str] = mapped_column(Text, default="")
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id"), nullable=False)
    party_id: Mapped[int] = mapped_column(ForeignKey("political_parties.id"), nullable=False)

    election = relationship("Election", back_populates="candidates")
    party = relationship("PoliticalParty", back_populates="candidates")
    votes = relationship("Vote", back_populates="candidate")
