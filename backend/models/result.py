"""Result ORM model (aggregated votes per candidate per election)."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Result(Base):
    __tablename__ = "results"
    __table_args__ = (UniqueConstraint("election_id", "candidate_id", name="uq_result_candidate_election"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id"), nullable=False)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"), nullable=False)
    total_votes: Mapped[int] = mapped_column(Integer, default=0)

    election = relationship("Election", back_populates="results")
    candidate = relationship("Candidate")
