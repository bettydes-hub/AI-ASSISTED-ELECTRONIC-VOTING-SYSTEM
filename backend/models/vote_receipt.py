from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func

from db import Base


class VoteReceipt(Base):
    __tablename__ = "vote_receipts"

    id = Column(Integer, primary_key=True, index=True)

    voter_user_id = Column(Integer, ForeignKey("users.id"))
    election_id = Column(Integer, ForeignKey("elections.id"))

    receipt_code = Column(String, unique=True, nullable=False)

    vote_hash = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())