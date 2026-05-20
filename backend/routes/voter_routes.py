from flask import Blueprint, jsonify, request
from services.voter_service import verify_voter

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
from services.voter_session_service import create_session, get_session, mark_verified, is_verified
from services.biometric_service import verify_face
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
@voter_bp.post("/voter/login")
def voter_login():
    data = request.get_json(silent=True) or {}

    voter_id = (data.get("voterId") or "").strip()

    if not voter_id:
        return jsonify({
            "success": False,
            "message": "voterId required"
        }), 400

    with SessionLocal() as db:

        voter = (
            db.query(VoterProfile)
            .filter(VoterProfile.voter_id == voter_id)
            .first()
        )

        if not voter:
            return jsonify({
                "success": False,
                "message": "Invalid voter"
            }), 404

        if voter.has_voted:
            return jsonify({
                "success": False,
                "message": "Already voted"
            }), 403

        # ✅ CREATE SESSION HERE (IMPORTANT FIX)
        from services.voter_session_service import create_session

        session_token = create_session(voter_id)

        return jsonify({
            "success": True,
            "message": "Login allowed",
            "voterId": voter_id,
            "session_token": session_token   # ✅ THIS is what frontend needs
        }), 200

@voter_bp.post("/voter/verify")
def verify():

    data = request.json

    result = verify_voter(
        data["voterId"]
    )

    return jsonify(result)


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

@voter_bp.get("/voter/debug")
def debug_voters():

    with SessionLocal() as db:

        voters = db.query(VoterProfile).all()

        return jsonify({
            "voters": [
                {
                    "user_id": v.user_id,
                    "voter_id": v.voter_id,
                    "has_voted": v.has_voted
                }
                for v in voters
            ]
        })
    
@voter_bp.get("/voter/create-test")
def create_test_voter():

    with SessionLocal() as db:

        existing = (
            db.query(VoterProfile)
            .filter(
                VoterProfile.voter_id == "0001"
            )
            .first()
        )

        if existing:
            return jsonify({
                "message": "already exists"
            })

        user = User(
            full_name="Test Voter",
            national_id="TEST123",
            username="testvoter",
            password_hash="test",
            role=UserRole.VOTER,
            account_status=AccountStatus.ACTIVE,
        )

        db.add(user)
        db.flush()

        voter = VoterProfile(
            user_id=user.id,
            voter_id="0001",
            verification_status=VerificationStatus.NOT_VERIFIED,
            has_voted=False,
        )

        db.add(voter)

        db.commit()

        return jsonify({
            "message": "test voter created"
        })

@voter_bp.post("/biometric/verify")
def biometric_verify():

    data = request.get_json(silent=True) or {}

    session_token = data.get("session_token")
    image = data.get("image")

    if not session_token:
        return jsonify({
            "success": False,
            "message": "session_token required"
        }), 400

    if not image:
        return jsonify({
            "success": False,
            "message": "image required"
        }), 400

    session = get_session(session_token)

    if not session:
        return jsonify({
            "success": False,
            "message": "Session expired or invalid"
        }), 401

    voter_id = session["voter_id"]

    # ❗ IMPORTANT: import here (avoid circular issues)
    from services.biometric_service import verify_face

    result = verify_face(voter_id, image)

    if result["success"]:
        mark_verified(session_token)

    return jsonify(result)
@voter_bp.post("/vote/submit")
def submit_vote():

    data = request.get_json(silent=True) or {}

    session_token = data.get("session_token")
    party_id = data.get("party_id")

    if not session_token:
        return jsonify({
            "success": False,
            "message": "session_token required"
        }), 400

    if not party_id:
        return jsonify({
            "success": False,
            "message": "party_id required"
        }), 400

    if not is_verified(session_token):
        return jsonify({
            "success": False,
            "message": "Face verification required"
        }), 403

    session = get_session(session_token)

    if not session:
        return jsonify({
            "success": False,
            "message": "Session expired"
        }), 401

    voter_id = session["voter_id"]

    with SessionLocal() as db:

        voter = (
            db.query(VoterProfile)
            .filter(VoterProfile.voter_id == voter_id)
            .first()
        )

        if not voter:
            return jsonify({
                "success": False,
                "message": "Invalid voter"
            }), 404

        if voter.has_voted:
            return jsonify({
                "success": False,
                "message": "Already voted"
            }), 403

        # mark voted
        voter.has_voted = True

        db.commit()

        return jsonify({
            "success": True,
            "message": "Vote recorded"
        })