from datetime import datetime

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_

from db import SessionLocal
from models.user import AccountStatus, User, UserRole
from models.voter_profile import VerificationStatus, VoterProfile
from security.auth import hash_password
from security.rbac import (
    ROLE_ELECTION_BOARD,
    ROLE_ELECTION_OFFICER,
    ROLE_SYSTEM_ADMIN,
    require_any_role,
    require_role,
)
from services.audit_log_service import create_audit_log
from services.otp_service import send_otp, verify_otp
from services.system_monitor_service import SYSTEM_STATE, append_alert

voter_bp = Blueprint("voters", __name__)


@voter_bp.get("/voters")
@require_any_role(ROLE_ELECTION_OFFICER, ROLE_ELECTION_BOARD, ROLE_SYSTEM_ADMIN)
def list_voters():
    with SessionLocal() as db:
        rows = (
            db.query(User, VoterProfile)
            .join(VoterProfile, VoterProfile.user_id == User.id)
            .order_by(User.id.asc())
            .all()
        )
        return jsonify(
            {
                "message": "Voters loaded successfully.",
                "items": [_serialize_voter(user, profile) for user, profile in rows],
                "count": len(rows),
                "fetched_at": _now_iso(),
            }
        )


@voter_bp.get("/voters/lookup")
@require_role(ROLE_ELECTION_OFFICER)
def lookup_voters():
    q = (request.args.get("q") or "").strip()
    if not q:
        return _error("lookup_query_required", 400, "Query parameter q is required.")
    try:
        limit = int((request.args.get("limit") or "25").strip())
    except ValueError:
        return _error("invalid_limit", 400, "limit must be a number.")
    limit = max(1, min(limit, 100))
    pattern = f"%{q.lower()}%"
    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        filters = [
            func.lower(User.full_name).like(pattern),
            func.lower(User.national_id).like(pattern),
            func.lower(User.username).like(pattern),
            func.lower(func.coalesce(VoterProfile.voter_id, "")).like(pattern),
        ]
        if q.isdigit():
            filters.append(User.id == int(q))
        query = (
            db.query(User, VoterProfile)
            .join(VoterProfile, VoterProfile.user_id == User.id)
            .filter(or_(*filters))
            .order_by(User.id.asc())
        )
        rows = query.limit(limit).all()
        create_audit_log(
            db,
            user_id=officer_user.id,
            event_type="admin_action",
            action=f"voter_lookup officer_id={officer_user.id} query={q} count={len(rows)}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "Voter lookup completed.",
                "query": q,
                "count": len(rows),
                "items": [_serialize_voter(user, profile) for user, profile in rows],
                "fetched_at": _now_iso(),
            }
        )


@voter_bp.get("/voters/registration/summary")
@require_role(ROLE_ELECTION_OFFICER)
def voter_registration_summary():
    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        total_voters = db.query(VoterProfile).count()
        verified = db.query(VoterProfile).filter(VoterProfile.verification_status == VerificationStatus.VERIFIED).count()
        not_verified = db.query(VoterProfile).filter(
            VoterProfile.verification_status == VerificationStatus.NOT_VERIFIED
        ).count()
        voted = db.query(VoterProfile).filter(VoterProfile.has_voted.is_(True)).count()
        not_voted = db.query(VoterProfile).filter(VoterProfile.has_voted.is_(False)).count()
        turnout_percent = round((voted / total_voters) * 100, 2) if total_voters else 0.0
        create_audit_log(
            db,
            user_id=officer_user.id,
            event_type="admin_action",
            action=f"voter_registration_summary_viewed officer_id={officer_user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "Voter registration summary loaded.",
                "total_voters": total_voters,
                "verified_voters": verified,
                "not_verified_voters": not_verified,
                "voted_voters": voted,
                "not_voted_voters": not_voted,
                "turnout_percent": turnout_percent,
                "fetched_at": _now_iso(),
            }
        )


@voter_bp.patch("/voters/<int:user_id>/verification")
@require_role(ROLE_ELECTION_OFFICER)
def update_voter_verification_status(user_id: int):
    payload = request.get_json(silent=True) or {}
    status = (payload.get("verification_status") or "").strip().upper()
    if status not in {"VERIFIED", "NOT_VERIFIED"}:
        return _error("invalid_verification_status", 400, "verification_status must be VERIFIED or NOT_VERIFIED.")
    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        user = db.get(User, user_id)
        profile = db.get(VoterProfile, user_id)
        if not user or not profile or user.role != UserRole.VOTER:
            return _error("voter_not_found", 404, "Voter was not found.")
        previous = profile.verification_status.value
        profile.verification_status = (
            VerificationStatus.VERIFIED if status == "VERIFIED" else VerificationStatus.NOT_VERIFIED
        )
        create_audit_log(
            db,
            user_id=officer_user.id,
            event_type="admin_action",
            action=(
                f"voter_verification_updated officer_id={officer_user.id} "
                f"user_id={user_id} from={previous} to={status}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "Voter verification status updated.",
                "user_id": user.id,
                "voter_id": profile.voter_id,
                "full_name": user.full_name,
                "previous_status": previous,
                "verification_status": profile.verification_status.value,
                "updated_at": _now_iso(),
            }
        )


@voter_bp.post("/officer/station/incidents")
@require_role(ROLE_ELECTION_OFFICER)
def report_station_incident():
    payload = request.get_json(silent=True) or {}
    station_code = (payload.get("station_code") or "").strip() or "unknown_station"
    issue_type = (payload.get("issue_type") or "general").strip().lower()
    description = (payload.get("description") or "").strip()
    severity = (payload.get("severity") or "warning").strip().lower()
    if not description:
        return _error("description_required", 400, "Incident description is required.")
    if severity not in {"low", "warning", "high", "critical"}:
        return _error("invalid_severity", 400, "severity must be low, warning, high, or critical.")
    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        alert = append_alert(
            f"Station incident [{station_code}] ({issue_type}): {description}",
            severity=severity,
            source="station_operations",
        )
        event_type = "security_alert" if severity in {"high", "critical"} else "admin_action"
        create_audit_log(
            db,
            user_id=officer_user.id,
            event_type=event_type,
            action=(
                f"station_incident_reported officer_id={officer_user.id} "
                f"station={station_code} issue_type={issue_type} severity={severity} description={description}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "Station incident reported successfully.",
                "station_code": station_code,
                "issue_type": issue_type,
                "severity": severity,
                "description": description,
                "alert": alert,
                "reported_at": _now_iso(),
            }
        )


@voter_bp.post("/voters/register/start-otp")
@require_role(ROLE_ELECTION_OFFICER)
def start_voter_registration_otp():
    if SYSTEM_STATE.get("suspended"):
        return _error("system_unavailable", 503, "Registration is temporarily unavailable because the system is suspended.")

    payload = request.get_json(silent=True) or {}
    full_name = (payload.get("full_name") or "").strip()
    contact = (payload.get("contact") or "").strip()
    national_id = (payload.get("national_id") or "").strip()
    force_delivery_fail = bool(payload.get("force_delivery_fail"))
    if not full_name or not contact or not national_id:
        return _error(
            "full_name_contact_national_id_required",
            400,
            "Full name, contact, and national ID are required.",
        )
    if not _is_valid_national_id(national_id):
        return _error("invalid_national_id", 400, "National ID format is invalid.")

    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        if db.query(User).filter(User.national_id == national_id).first():
            return _error("national_id_exists", 409, "A voter with this national ID already exists.")

        result = send_otp(contact, force_fail=force_delivery_fail)
        if not result["ok"]:
            create_audit_log(
                db,
                user_id=officer_user.id,
                event_type="system_error",
                action=(
                    f"registration_otp_send_failed officer_id={officer_user.id} "
                    f"national_id={national_id} reason={result['error']}"
                ),
                ip_address=request.remote_addr,
            )
            db.commit()
            return _error(
                str(result.get("error") or "otp_delivery_failed"),
                400,
                "OTP delivery failed. Confirm contact information and retry.",
            )

        create_audit_log(
            db,
            user_id=officer_user.id,
            event_type="admin_action",
            action=(
                f"registration_otp_sent officer_id={officer_user.id} "
                f"national_id={national_id} contact={contact}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                **result,
                "message": "OTP sent successfully.",
                "requested_at": _now_iso(),
            }
        )


@voter_bp.post("/voters/register/resend-otp")
@require_role(ROLE_ELECTION_OFFICER)
def resend_voter_registration_otp():
    if SYSTEM_STATE.get("suspended"):
        return _error("system_unavailable", 503, "Registration is temporarily unavailable because the system is suspended.")

    payload = request.get_json(silent=True) or {}
    national_id = (payload.get("national_id") or "").strip()
    contact = (payload.get("contact") or "").strip()
    updated_contact = (payload.get("updated_contact") or "").strip()
    target_contact = updated_contact or contact
    if not national_id or not target_contact:
        return _error(
            "national_id_and_contact_required",
            400,
            "National ID and contact are required to resend OTP.",
        )
    if not _is_valid_national_id(national_id):
        return _error("invalid_national_id", 400, "National ID format is invalid.")

    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        result = send_otp(target_contact, force_fail=False)
        if not result["ok"]:
            create_audit_log(
                db,
                user_id=officer_user.id,
                event_type="system_error",
                action=(
                    f"registration_otp_resend_failed officer_id={officer_user.id} "
                    f"national_id={national_id} reason={result['error']}"
                ),
                ip_address=request.remote_addr,
            )
            db.commit()
            return _error(
                str(result.get("error") or "otp_delivery_failed"),
                400,
                "OTP resend failed. Confirm contact information and retry.",
            )

        create_audit_log(
            db,
            user_id=officer_user.id,
            event_type="admin_action",
            action=(
                f"registration_otp_resent officer_id={officer_user.id} "
                f"national_id={national_id} contact={target_contact}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                **result,
                "message": "OTP resent successfully.",
                "requested_at": _now_iso(),
            }
        )


@voter_bp.post("/voters/register/verify-otp")
@require_role(ROLE_ELECTION_OFFICER)
def verify_voter_registration_otp():
    if SYSTEM_STATE.get("suspended"):
        return _error("system_unavailable", 503, "Registration is temporarily unavailable because the system is suspended.")

    payload = request.get_json(silent=True) or {}
    contact = (payload.get("contact") or "").strip()
    otp = (payload.get("otp") or "").strip()
    full_name = (payload.get("full_name") or "").strip()
    national_id = (payload.get("national_id") or "").strip()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not all([contact, otp, full_name, national_id, username, password]):
        return _error("missing_required_fields", 400, "All registration fields are required.")
    if not _is_valid_national_id(national_id):
        return _error("invalid_national_id", 400, "National ID format is invalid.")
    if not verify_otp(contact, otp):
        return _error("otp_invalid_or_expired", 400, "OTP is invalid or expired. Request a new OTP.")

    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        if db.query(User).filter(User.national_id == national_id).first():
            return _error("national_id_exists", 409, "A voter with this national ID already exists.")
        if db.query(User).filter(User.username == username).first():
            return _error("username_exists", 409, "Username is already taken.")

        user = User(
            full_name=full_name,
            national_id=national_id,
            contact_info=contact,
            username=username,
            password_hash=hash_password(password),
            role=UserRole.VOTER,
            account_status=AccountStatus.ACTIVE,
        )
        db.add(user)
        db.flush()
        profile = VoterProfile(
            user_id=user.id,
            voter_id=_build_voter_id(user.id),
            verification_status=VerificationStatus.NOT_VERIFIED,
            has_voted=False,
        )
        db.add(profile)
        create_audit_log(
            db,
            user_id=officer_user.id,
            event_type="admin_action",
            action=(
                f"voter_registered officer_id={officer_user.id} user_id={user.id} "
                f"voter_id={profile.voter_id}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return (
            jsonify(
                {
                    "status_key": "voter_registered",
                    "user_id": user.id,
                    "voter_id": profile.voter_id,
                    "credentials": {
                        "username": user.username,
                        "delivery": "shared_with_voter_securely",
                    },
                    "message": "Voter registered successfully.",
                    "registered_at": _now_iso(),
                }
            ),
            201,
        )


@voter_bp.get("/voters/<int:user_id>/status")
@require_any_role(
    UserRole.VOTER.value,
    ROLE_ELECTION_OFFICER,
    ROLE_ELECTION_BOARD,
    ROLE_SYSTEM_ADMIN,
)
def voter_status(user_id: int):
    with SessionLocal() as db:
        user = db.get(User, user_id)
        profile = db.get(VoterProfile, user_id)
        if not user or not profile:
            return _error("voter_not_found", 404, "Voter was not found.")
        return jsonify(
            {
                "user_id": user.id,
                "voter_id": profile.voter_id,
                "full_name": user.full_name,
                "contact_info": user.contact_info,
                "verification_status": profile.verification_status.value,
                "has_voted": profile.has_voted,
                "account_status": user.account_status.value,
            }
        )


def _build_voter_id(user_id: int) -> str:
    return f"VOT-{user_id:06d}"


def _is_valid_national_id(value: str) -> bool:
    cleaned = value.strip()
    if len(cleaned) < 6 or len(cleaned) > 50:
        return False
    return any(ch.isalnum() for ch in cleaned)


def _get_authenticated_officer(db):
    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return None, _error("x_user_id_required", 401, "User identity header is required.")
    officer_user = db.get(User, int(user_id_raw))
    if not officer_user:
        return None, _error("election_officer_not_found", 401, "Election officer account was not found.")
    if officer_user.role != UserRole.ELECTION_OFFICER:
        return None, _error("election_officer_role_required", 403, "Election officer role is required.")
    if officer_user.account_status != AccountStatus.ACTIVE:
        return None, _error("election_officer_account_not_active", 403, "Election officer account is not active.")
    return officer_user, None


def _error(code: str, status: int, message: str):
    return jsonify({"error": code, "message": message, "timestamp": _now_iso()}), status


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _serialize_voter(user: User, profile: VoterProfile) -> dict:
    return {
        "user_id": user.id,
        "full_name": user.full_name,
        "national_id": user.national_id,
        "contact_info": user.contact_info,
        "username": user.username,
        "voter_id": profile.voter_id,
        "verification_status": profile.verification_status.value,
        "has_voted": profile.has_voted,
        "account_status": user.account_status.value,
    }
