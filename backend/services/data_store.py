"""In-memory data store for early project development."""

from __future__ import annotations

from typing import Any


DB: dict[str, Any] = {
    "elections": {},
    "parties": {},
    "candidates": {},
    "results": {},
    "votes": [],
    "counters": {
        "election": 0,
        "party": 0,
        "candidate": 0,
    },
}


def next_id(kind: str) -> int:
    DB["counters"][kind] += 1
    return DB["counters"][kind]
