"""In-memory voter session helpers for voting flow."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

ACTIVE_VOTING_SESSIONS: dict[str, dict] = {}


def create_voting_session(voter_user_id: int, voter_id: str, timeout_minutes: int) -> dict:
    clear_sessions_for_voter(voter_user_id)
    token = secrets.token_hex(24)
    session = {
        "token": token,
        "voter_user_id": voter_user_id,
        "voter_id": voter_id,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=timeout_minutes),
    }
    ACTIVE_VOTING_SESSIONS[token] = session
    return session


def validate_voting_session(token: str) -> tuple[dict | None, str]:
    purge_expired_sessions()
    session = ACTIVE_VOTING_SESSIONS.get(token)
    if not session:
        return None, "session_invalid"
    if datetime.utcnow() > session["expires_at"]:
        ACTIVE_VOTING_SESSIONS.pop(token, None)
        return None, "session_expired"
    return session, "ok"


def clear_sessions_for_voter(voter_user_id: int) -> None:
    removable = [
        token
        for token, session in ACTIVE_VOTING_SESSIONS.items()
        if session["voter_user_id"] == voter_user_id
    ]
    for token in removable:
        ACTIVE_VOTING_SESSIONS.pop(token, None)


def purge_expired_sessions() -> None:
    now = datetime.utcnow()
    removable = [
        token for token, session in ACTIVE_VOTING_SESSIONS.items() if now > session["expires_at"]
    ]
    for token in removable:
        ACTIVE_VOTING_SESSIONS.pop(token, None)
