"""Vote encryption/hash helpers."""

from __future__ import annotations

import base64
from datetime import datetime

from security.crypto import sha256_text


def build_encrypted_vote_payload(
    election_id: int, voter_user_id: int, candidate_id: int | None
) -> tuple[bytes, str]:
    raw = f"{election_id}:{voter_user_id}:{candidate_id}:{datetime.utcnow().isoformat()}"
    encrypted_vote = base64.b64encode(raw.encode("utf-8"))
    vote_hash = sha256_text(raw)
    return encrypted_vote, vote_hash
