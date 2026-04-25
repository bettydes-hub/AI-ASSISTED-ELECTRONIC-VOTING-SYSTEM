"""OTP generation and validation helpers (dev-memory store)."""

from __future__ import annotations

import hashlib
import json
import os
import random
import re
import secrets
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from email.message import EmailMessage

OTP_STORE: dict[str, dict] = {}


def send_otp(contact: str, force_fail: bool = False) -> dict:
    normalized_contact = contact.strip()
    if not is_valid_contact(normalized_contact):
        return {
            "ok": False,
            "error": "invalid_contact",
            "message": "Contact must be a valid email or phone number.",
        }
    retry_seconds = _seconds_until_resend_allowed(normalized_contact)
    if retry_seconds > 0:
        return {
            "ok": False,
            "error": "otp_resend_cooldown",
            "message": f"Please wait {retry_seconds} seconds before requesting another OTP.",
            "retry_after_seconds": retry_seconds,
        }
    otp = _generate_otp()
    _store_otp(normalized_contact, otp)
    if force_fail:
        return {
            "ok": False,
            "error": "otp_delivery_failed",
            "message": "OTP delivery failed. Resend OTP or update contact information.",
            "can_resend": True,
        }
    delivery = _deliver_otp(normalized_contact, otp)
    if not delivery["ok"]:
        return delivery
    response = {
        "ok": True,
        "message": "otp_sent",
        "contact": normalized_contact,
        "channel": delivery["channel"],
    }
    # Keep optional OTP exposure for demos; should stay false in production.
    if os.getenv("OTP_EXPOSE_IN_RESPONSE", "true").strip().lower() == "true":
        response["otp"] = otp
    return response


def verify_otp(contact: str, otp: str) -> bool:
    normalized_contact = contact.strip()
    data = OTP_STORE.get(normalized_contact)
    if not data:
        return False
    if datetime.utcnow() > data["expires_at"]:
        OTP_STORE.pop(normalized_contact, None)
        return False
    if data["attempts"] >= data["max_attempts"]:
        OTP_STORE.pop(normalized_contact, None)
        return False
    data["attempts"] += 1
    candidate_hash = _hash_otp(otp.strip())
    is_valid = secrets.compare_digest(data["otp_hash"], candidate_hash)
    if is_valid or data["attempts"] >= data["max_attempts"]:
        OTP_STORE.pop(normalized_contact, None)
    return is_valid


def is_valid_contact(contact: str) -> bool:
    value = contact.strip()
    if not value:
        return False
    if "@" in value:
        return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value))
    digits = "".join(ch for ch in value if ch.isdigit())
    return len(digits) >= 10


def _generate_otp() -> str:
    return f"{random.randint(100000, 999999)}"


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def _store_otp(contact: str, otp: str) -> None:
    expires_minutes = int(os.getenv("OTP_EXPIRES_MINUTES", "5"))
    max_attempts = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
    OTP_STORE[contact] = {
        "otp_hash": _hash_otp(otp),
        "expires_at": datetime.utcnow() + timedelta(minutes=max(1, expires_minutes)),
        "attempts": 0,
        "max_attempts": max(1, max_attempts),
        "sent_at": datetime.utcnow(),
    }


def _seconds_until_resend_allowed(contact: str) -> int:
    entry = OTP_STORE.get(contact)
    if not entry:
        return 0
    cooldown_seconds = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", "30"))
    sent_at = entry.get("sent_at")
    if not sent_at:
        return 0
    elapsed = (datetime.utcnow() - sent_at).total_seconds()
    if elapsed >= cooldown_seconds:
        return 0
    return int(cooldown_seconds - elapsed)


def _deliver_otp(contact: str, otp: str) -> dict:
    channel = "email" if "@" in contact else "sms"
    provider = os.getenv("OTP_PROVIDER", "demo").strip().lower()
    if provider == "demo":
        return {"ok": True, "channel": channel}
    if channel == "email":
        return _send_email_otp(contact, otp)
    return _send_sms_otp(contact, otp, provider)


def _send_email_otp(recipient: str, otp: str) -> dict:
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASS", "").strip()
    sender = os.getenv("SMTP_FROM", username).strip()
    if not host or not username or not password or not sender:
        return {
            "ok": False,
            "error": "otp_delivery_not_configured",
            "message": "Email OTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.",
        }
    msg = EmailMessage()
    msg["Subject"] = "Your E-Voting OTP Code"
    msg["From"] = sender
    msg["To"] = recipient
    msg.set_content(f"Your OTP is {otp}. It expires in 5 minutes.")
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls(context=context)
            server.login(username, password)
            server.send_message(msg)
        return {"ok": True, "channel": "email"}
    except Exception:
        return {
            "ok": False,
            "error": "otp_delivery_failed",
            "message": "OTP delivery failed. Resend OTP or update contact information.",
            "can_resend": True,
        }


def _send_sms_otp(phone: str, otp: str, provider: str) -> dict:
    if provider != "twilio":
        return {
            "ok": False,
            "error": "otp_delivery_not_configured",
            "message": "SMS OTP requires OTP_PROVIDER=twilio and Twilio credentials.",
        }
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    sender = os.getenv("TWILIO_FROM", "").strip()
    if not account_sid or not auth_token or not sender:
        return {
            "ok": False,
            "error": "otp_delivery_not_configured",
            "message": "Twilio OTP is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM.",
        }
    endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    form = urllib.parse.urlencode(
        {
            "To": phone,
            "From": sender,
            "Body": f"Your E-Voting OTP is {otp}. It expires in 5 minutes.",
        }
    ).encode("utf-8")
    request = urllib.request.Request(endpoint, data=form, method="POST")
    auth = urllib.request.HTTPBasicAuthHandler()
    auth.add_password(realm=None, uri=endpoint, user=account_sid, passwd=auth_token)
    opener = urllib.request.build_opener(auth)
    try:
        with opener.open(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if payload.get("sid"):
                return {"ok": True, "channel": "sms"}
    except urllib.error.HTTPError:
        pass
    except urllib.error.URLError:
        pass
    return {
        "ok": False,
        "error": "otp_delivery_failed",
        "message": "OTP delivery failed. Resend OTP or update contact information.",
        "can_resend": True,
    }
