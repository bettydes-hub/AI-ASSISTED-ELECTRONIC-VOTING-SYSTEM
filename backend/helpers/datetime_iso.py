"""Serialize ORM datetimes for JSON without assuming datetime instances (drivers may return str)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any


def datetime_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
