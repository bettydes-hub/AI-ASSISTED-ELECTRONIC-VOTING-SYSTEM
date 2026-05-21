"""Database engine/session setup for ORM."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
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
    from models.region import Region  # noqa: F401
    from models.result import Result  # noqa: F401
    from models.system_admin_profile import SystemAdminProfile  # noqa: F401
    from models.user import User  # noqa: F401
    from models.vote import Vote  # noqa: F401
    from models.voter_profile import VoterProfile  # noqa: F401
    from models.vote_receipt import VoteReceipt  # noqa: F401
    
    Base.metadata.create_all(bind=engine)
    _ensure_users_contact_info_column()
    _ensure_election_schedule_columns()
    _ensure_voter_profile_voter_id_column()
    _ensure_political_party_extended_columns()
    _ensure_candidate_extended_columns()
    _ensure_region_seed_rows()
    _ensure_election_extended_columns()
    _ensure_users_password_policy_columns()
    _ensure_audit_hash_columns()


def _ensure_users_contact_info_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "contact_info" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN contact_info VARCHAR(120)"))


def _ensure_election_schedule_columns() -> None:
    inspector = inspect(engine)
    if "elections" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("elections")}
    alter_statements = []
    if "registration_start_at" not in columns:
        alter_statements.append("ALTER TABLE elections ADD COLUMN registration_start_at TIMESTAMP")
    if "registration_end_at" not in columns:
        alter_statements.append("ALTER TABLE elections ADD COLUMN registration_end_at TIMESTAMP")
    if "result_at" not in columns:
        alter_statements.append("ALTER TABLE elections ADD COLUMN result_at TIMESTAMP")
    if not alter_statements:
        return
    with engine.begin() as conn:
        for statement in alter_statements:
            conn.execute(text(statement))


def _ensure_voter_profile_voter_id_column() -> None:
    inspector = inspect(engine)
    if "voter_profiles" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("voter_profiles")}
    if "voter_id" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE voter_profiles ADD COLUMN voter_id VARCHAR(40)"))


def _ensure_political_party_extended_columns() -> None:
    inspector = inspect(engine)
    if "political_parties" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("political_parties")}
    dialect = engine.dialect.name
    if dialect == "sqlite":
        ts_default = "TIMESTAMP DEFAULT (datetime('now'))"
        ts_fill = "datetime('now')"
    elif dialect == "postgresql":
        ts_default = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ts_fill = "CURRENT_TIMESTAMP"
    else:
        ts_default = "TIMESTAMP"
        ts_fill = None

    alters: list[str] = []
    if "abbreviation" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN abbreviation VARCHAR(32)")
    if "scope_level" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN scope_level VARCHAR(20) DEFAULT 'NATIONAL'")
    if "region_id" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN region_id INTEGER REFERENCES regions(id)")
    if "mission" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN mission TEXT DEFAULT ''")
    if "vision" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN vision TEXT DEFAULT ''")
    if "headquarters_address" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN headquarters_address TEXT DEFAULT ''")
    if "logo_path" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN logo_path VARCHAR(512)")
    if "party_registered_at" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN party_registered_at TIMESTAMP")
    if "operational_status" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN operational_status VARCHAR(20) DEFAULT 'ACTIVE'")
    if "leader_name" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN leader_name TEXT DEFAULT ''")
    if "deputy_leader_name" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN deputy_leader_name TEXT DEFAULT ''")
    if "leader_phone" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN leader_phone VARCHAR(40) DEFAULT ''")
    if "leader_email" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN leader_email VARCHAR(120) DEFAULT ''")
    if "leader_image_path" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN leader_image_path VARCHAR(512)")
    if "registration_number" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN registration_number VARCHAR(80)")
    if "approval_status" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN approval_status VARCHAR(20) DEFAULT 'PENDING'")
    if "supporting_document_path" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN supporting_document_path VARCHAR(512)")
    if "regions" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN regions TEXT DEFAULT ''")
    if "election_year" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN election_year INTEGER")
    if "created_at" not in columns:
        alters.append(f"ALTER TABLE political_parties ADD COLUMN created_at {ts_default}")
    if "updated_at" not in columns:
        alters.append(f"ALTER TABLE political_parties ADD COLUMN updated_at {ts_default}")
    if "created_by_user_id" not in columns:
        alters.append("ALTER TABLE political_parties ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)")
    if not alters:
        return
    with engine.begin() as conn:
        for statement in alters:
            conn.execute(text(statement))
        if ts_fill:
            conn.execute(
                text(f"UPDATE political_parties SET created_at = {ts_fill} WHERE created_at IS NULL")
            )
            conn.execute(
                text(f"UPDATE political_parties SET updated_at = {ts_fill} WHERE updated_at IS NULL")
            )


def _ensure_candidate_extended_columns() -> None:
    inspector = inspect(engine)
    if "candidates" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("candidates")}
    alters: list[str] = []
    if "gender" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN gender VARCHAR(20)")
    if "date_of_birth" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN date_of_birth DATE")
    if "age" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN age INTEGER")
    if "phone_number" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN phone_number VARCHAR(40) DEFAULT ''")
    if "email_address" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN email_address VARCHAR(120) DEFAULT ''")
    if "running_position" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN running_position VARCHAR(80) DEFAULT ''")
    if "election_year" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN election_year INTEGER")
    if "region_district" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN region_district VARCHAR(160) DEFAULT ''")
    if "photo_path" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN photo_path VARCHAR(512)")
    if "candidate_status" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN candidate_status VARCHAR(20) DEFAULT 'PENDING'")
    if "region_id" not in columns:
        alters.append("ALTER TABLE candidates ADD COLUMN region_id INTEGER REFERENCES regions(id)")
    if not alters:
        return
    with engine.begin() as conn:
        for statement in alters:
            conn.execute(text(statement))


def _ensure_election_extended_columns() -> None:
    inspector = inspect(engine)
    if "elections" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("elections")}
    alters: list[str] = []
    if "election_type" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN election_type VARCHAR(40) DEFAULT 'PRESIDENTIAL'")
    if "election_scope" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN election_scope VARCHAR(20) DEFAULT 'NATIONAL'")
    if "region_id" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN region_id INTEGER REFERENCES regions(id)")
    if "campaign_start_at" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN campaign_start_at TIMESTAMP")
    if "campaign_end_at" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN campaign_end_at TIMESTAMP")
    if "voting_at" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN voting_at TIMESTAMP")
    if "positions" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN positions TEXT DEFAULT ''")
    if "allowed_party_ids" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN allowed_party_ids TEXT DEFAULT ''")
    if "minimum_candidate_age" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN minimum_candidate_age INTEGER")
    if "max_candidates_per_party" not in columns:
        alters.append("ALTER TABLE elections ADD COLUMN max_candidates_per_party INTEGER")
    if not alters:
        return
    with engine.begin() as conn:
        for statement in alters:
            conn.execute(text(statement))


def _ensure_region_seed_rows() -> None:
    inspector = inspect(engine)
    if "regions" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        existing = {
            row[0].strip().lower()
            for row in conn.execute(text("SELECT name FROM regions")).fetchall()
            if row and row[0]
        }
        defaults = ["Addis Ababa", "Oromia", "Amhara", "Tigray", "SNNP"]
        for name in defaults:
            if name.lower() in existing:
                continue
            conn.execute(text("INSERT INTO regions (name) VALUES (:name)"), {"name": name})


def _ensure_users_password_policy_columns() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("users")}
    alters: list[str] = []
    if "must_change_password" not in columns:
        alters.append("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0")
    if "password_changed_at" not in columns:
        alters.append("ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP")
    if not alters:
        return
    with engine.begin() as conn:
        for statement in alters:
            conn.execute(text(statement))


def _ensure_audit_hash_columns() -> None:
    inspector = inspect(engine)
    if "audit_logs" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("audit_logs")}
    alters: list[str] = []
    if "previous_hash" not in columns:
        alters.append("ALTER TABLE audit_logs ADD COLUMN previous_hash VARCHAR(128)")
    if "record_hash" not in columns:
        alters.append("ALTER TABLE audit_logs ADD COLUMN record_hash VARCHAR(128)")
    if not alters:
        return
    with engine.begin() as conn:
        for statement in alters:
            conn.execute(text(statement))

