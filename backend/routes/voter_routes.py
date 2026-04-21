from flask import Blueprint, jsonify, request

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
from services.system_monitor_service import SYSTEM_STATE

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
                "items": [
                    {
                        "user_id": user.id,
                        "full_name": user.full_name,
                        "national_id": user.national_id,
                        "contact_info": user.contact_info,
                        "username": user.username,
                        "voter_id": profile.voter_id,
                        "verification_status": profile.verification_status.value,
                        "has_voted": profile.has_voted,
                    }
                    for user, profile in rows
                ]
            }
        )


@voter_bp.post("/voters/register/start-otp")
@require_role(ROLE_ELECTION_OFFICER)
def start_voter_registration_otp():
    if SYSTEM_STATE.get("suspended"):
        return jsonify({"error": "system_unavailable"}), 503

    payload = request.get_json(silent=True) or {}
    full_name = (payload.get("full_name") or "").strip()
    contact = (payload.get("contact") or "").strip()
    national_id = (payload.get("national_id") or "").strip()
    force_delivery_fail = bool(payload.get("force_delivery_fail"))
    if not full_name or not contact or not national_id:
        return jsonify({"error": "full_name_contact_national_id_required"}), 400
    if not _is_valid_national_id(national_id):
        return jsonify({"error": "invalid_national_id"}), 400

    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        if db.query(User).filter(User.national_id == national_id).first():
            return jsonify({"error": "national_id_exists"}), 409

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
            return jsonify(result), 400

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
        return jsonify(result)


@voter_bp.post("/voters/register/resend-otp")
@require_role(ROLE_ELECTION_OFFICER)
def resend_voter_registration_otp():
    if SYSTEM_STATE.get("suspended"):
        return jsonify({"error": "system_unavailable"}), 503

    payload = request.get_json(silent=True) or {}
    national_id = (payload.get("national_id") or "").strip()
    contact = (payload.get("contact") or "").strip()
    updated_contact = (payload.get("updated_contact") or "").strip()
    target_contact = updated_contact or contact
    if not national_id or not target_contact:
        return jsonify({"error": "national_id_and_contact_required"}), 400
    if not _is_valid_national_id(national_id):
        return jsonify({"error": "invalid_national_id"}), 400

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
            return jsonify(result), 400

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
        return jsonify(result)


@voter_bp.post("/voters/register/verify-otp")
@require_role(ROLE_ELECTION_OFFICER)
def verify_voter_registration_otp():
    if SYSTEM_STATE.get("suspended"):
        return jsonify({"error": "system_unavailable"}), 503

    payload = request.get_json(silent=True) or {}
    contact = (payload.get("contact") or "").strip()
    otp = (payload.get("otp") or "").strip()
    full_name = (payload.get("full_name") or "").strip()
    national_id = (payload.get("national_id") or "").strip()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not all([contact, otp, full_name, national_id, username, password]):
        return jsonify({"error": "missing_required_fields"}), 400
    if not _is_valid_national_id(national_id):
        return jsonify({"error": "invalid_national_id"}), 400
    if not verify_otp(contact, otp):
        return jsonify({"error": "otp_invalid_or_expired"}), 400

    with SessionLocal() as db:
        officer_user, err = _get_authenticated_officer(db)
        if err:
            return err
        if db.query(User).filter(User.national_id == national_id).first():
            return jsonify({"error": "national_id_exists"}), 409
        if db.query(User).filter(User.username == username).first():
            return jsonify({"error": "username_exists"}), 409

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
                    "message": "voter_registered",
                    "user_id": user.id,
                    "voter_id": profile.voter_id,
                    "credentials": {
                        "username": user.username,
                        "delivery": "shared_with_voter_securely",
                    },
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
            return jsonify({"error": "voter_not_found"}), 404
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
        return None, (jsonify({"error": "x_user_id_required"}), 401)
    officer_user = db.get(User, int(user_id_raw))
    if not officer_user:
        return None, (jsonify({"error": "election_officer_not_found"}), 401)
    if officer_user.role != UserRole.ELECTION_OFFICER:
        return None, (jsonify({"error": "election_officer_role_required"}), 403)
    if officer_user.account_status != AccountStatus.ACTIVE:
        return None, (jsonify({"error": "election_officer_account_not_active"}), 403)
    return officer_user, None
