"""Minimal crypto helpers for development workflow."""

from __future__ import annotations

import hashlib


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
