"""Database engine/session setup for ORM."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


PROJECT_ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=PROJECT_ROOT_ENV, override=True)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///evoting.db")
engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    from models.audit_authority_profile import AuditAuthorityProfile  # noqa: F401
    from models.audit_log import AuditLog  # noqa: F401
    from models.candidate import Candidate  # noqa: F401
    from models.election import Election  # noqa: F401
    from models.election_board_profile import ElectionBoardProfile  # noqa: F401
    from models.political_party import PoliticalParty  # noqa: F401
    from models.result import Result  # noqa: F401
    from models.system_admin_profile import SystemAdminProfile  # noqa: F401
    from models.user import User  # noqa: F401
    from models.vote import Vote  # noqa: F401
    from models.voter_profile import VoterProfile  # noqa: F401

    Base.metadata.create_all(bind=engine)
