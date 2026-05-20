import uuid
import time

# in-memory session store (for now)
VOTER_SESSIONS = {}

SESSION_TIMEOUT = 600  # 10 minutes


def create_session(voter_id: str):

    token = str(uuid.uuid4())

    VOTER_SESSIONS[token] = {
        "voter_id": voter_id,
        "verified": False,
        "created_at": time.time()
    }

    return token


def get_session(token: str):

    session = VOTER_SESSIONS.get(token)

    if not session:
        return None

    # expire check
    if time.time() - session["created_at"] > SESSION_TIMEOUT:
        del VOTER_SESSIONS[token]
        return None

    return session


def mark_verified(token: str):

    if token in VOTER_SESSIONS:
        VOTER_SESSIONS[token]["verified"] = True


def is_verified(token: str):

    session = get_session(token)

    return session and session["verified"]