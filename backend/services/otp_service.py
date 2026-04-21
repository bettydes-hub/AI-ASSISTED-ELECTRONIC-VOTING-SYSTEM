"""OTP generation and validation helpers (dev-memory store)."""

from __future__ import annotations

import random
import re
from datetime import datetime, timedelta

OTP_STORE: dict[str, dict] = {}


def generate_otp(contact: str, expires_minutes: int = 5) -> str:
    otp = f"{random.randint(100000, 999999)}"
    OTP_STORE[contact] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=expires_minutes),
        "attempts": 0,
        "max_attempts": 5,
        "sent_at": datetime.utcnow(),
    }
    return otp


def send_otp(contact: str, force_fail: bool = False) -> dict:
    if not is_valid_contact(contact):
        return {
            "ok": False,
            "error": "invalid_contact",
            "message": "Contact must be a valid email or phone number.",
        }

    otp = generate_otp(contact)
    if force_fail:
        return {
            "ok": False,
            "error": "otp_delivery_failed",
            "message": "OTP delivery failed. Resend OTP or update contact information.",
            "can_resend": True,
        }

    channel = "email" if "@" in contact else "sms"
    return {
        "ok": True,
        "message": "otp_sent",
        "contact": contact,
        "channel": channel,
        # Dev-mode visibility for testing; remove in production.
        "otp": otp,
    }


def verify_otp(contact: str, otp: str) -> bool:
    data = OTP_STORE.get(contact)
    if not data:
        return False
    if datetime.utcnow() > data["expires_at"]:
        OTP_STORE.pop(contact, None)
        return False
    if data["attempts"] >= data["max_attempts"]:
        OTP_STORE.pop(contact, None)
        return False
    data["attempts"] += 1
    is_valid = data["otp"] == otp
    if is_valid:
        OTP_STORE.pop(contact, None)
    return is_valid


def is_valid_contact(contact: str) -> bool:
    value = contact.strip()
    if not value:
        return False
    if "@" in value:
        return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value))
    digits = "".join(ch for ch in value if ch.isdigit())
    return len(digits) >= 10
