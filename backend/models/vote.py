"""Vote ORM model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (
        UniqueConstraint("election_id", "voter_user_id", name="uq_vote_once_per_election_per_voter"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id"), nullable=False)
    voter_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    candidate_id: Mapped[int | None] = mapped_column(ForeignKey("candidates.id"), nullable=True)
    vote_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    encrypted_vote: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    candidate = relationship("Candidate", back_populates="votes")
    voter_user = relationship("User", back_populates="votes_cast")
