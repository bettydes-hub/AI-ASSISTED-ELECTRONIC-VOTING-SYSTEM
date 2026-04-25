from flask import Blueprint, jsonify, request

from db import SessionLocal
from models.candidate import Candidate
from models.election import Election
from models.user import AccountStatus, User
from models.vote import Vote
from models.voter_profile import VerificationStatus, VoterProfile
from security.rbac import (
    ROLE_ELECTION_OFFICER,
    ROLE_VOTER,
    current_role,
    require_any_role,
    require_role,
)
from services.audit_log_service import create_audit_log
from services.otp_service import send_otp, verify_otp
from services.system_monitor_service import SYSTEM_STATE
from services.vote_encryption_service import build_encrypted_vote_payload
from services.voting_session_service import create_voting_session, validate_voting_session
from services.vote_validation_service import validate_vote_request

voting_bp = Blueprint("voting", __name__)


@voting_bp.post("/voting/session/request-otp")
@require_role(ROLE_VOTER)
def request_voting_otp():
    unavailable = _ensure_operations_available("voting")
    if unavailable:
        return unavailable
    payload = request.get_json(silent=True) or {}
    voter_id = (payload.get("voter_id") or "").strip()
    if not voter_id:
        return jsonify({"error": "voter_id_required"}), 400

    with SessionLocal() as db:
        user, profile = _get_user_by_voter_id(db, voter_id)
        if not user or not profile:
            _log_security_attempt(
                db,
                f"voting_otp_request_denied reason=voter_id_not_found voter_id={voter_id}",
            )
            return jsonify({"error": "voter_id_not_found"}), 404
        if user.account_status != AccountStatus.ACTIVE:
            return jsonify({"error": "account_not_active"}), 403
        result = send_otp(user.contact_info or "")
        if not result["ok"]:
            _log_security_attempt(
                db,
                (
                    f"voting_otp_request_failed voter_user_id={user.id} "
                    f"reason={result['error']}"
                ),
            )
            return jsonify(result), 400

        create_audit_log(
            db,
            user_id=user.id,
            event_type="system",
            action=f"voting_otp_sent voter_user_id={user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "otp_sent",
                "voter_user_id": user.id,
                "contact": user.contact_info,
                "channel": result.get("channel"),
                "otp": result.get("otp"),
            }
        )


@voting_bp.post("/voting/session/start")
@require_role(ROLE_VOTER)
def start_voting_session():
    unavailable = _ensure_operations_available("voting")
    if unavailable:
        return unavailable
    payload = request.get_json(silent=True) or {}
    voter_id = (payload.get("voter_id") or "").strip()
    otp = (payload.get("otp") or "").strip()
    if not voter_id or not otp:
        return jsonify({"error": "voter_id_and_otp_required"}), 400

    with SessionLocal() as db:
        user, profile = _get_user_by_voter_id(db, voter_id)
        if not user or not profile:
            _log_security_attempt(
                db,
                f"voting_session_start_denied reason=voter_id_not_found voter_id={voter_id}",
            )
            return jsonify({"error": "voter_id_not_found"}), 404
        if user.account_status != AccountStatus.ACTIVE:
            return jsonify({"error": "account_not_active"}), 403
        if not verify_otp(user.contact_info or "", otp):
            _log_security_attempt(
                db,
                f"voting_session_start_denied reason=otp_invalid voter_user_id={user.id}",
            )
            return jsonify({"error": "otp_invalid_or_expired"}), 400

        timeout_minutes = int(SYSTEM_STATE["system_parameters"].get("session_timeout_minutes", 30))
        session = create_voting_session(user.id, profile.voter_id or voter_id, timeout_minutes)
        create_audit_log(
            db,
            user_id=user.id,
            event_type="system",
            action=f"voting_session_started voter_user_id={user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "session_started",
                "voting_session_token": session["token"],
                "voter_user_id": user.id,
                "expires_at": session["expires_at"].isoformat(),
            }
        )


@voting_bp.get("/ballot")
@require_any_role(ROLE_VOTER, ROLE_ELECTION_OFFICER)
def get_ballot():
    unavailable = _ensure_operations_available("voting")
    if unavailable:
        return unavailable
    election_id_raw = request.args.get("election_id", "")
    voter_user_id_raw = request.args.get("voter_user_id", "")
    if not election_id_raw.isdigit():
        return jsonify({"error": "election_id_required"}), 400
    election_id = int(election_id_raw)

    with SessionLocal() as db:
        role = current_role()
        if role == ROLE_VOTER:
            if not voter_user_id_raw.isdigit():
                return jsonify({"error": "voter_user_id_required"}), 400
            voter_user_id = int(voter_user_id_raw)
            ok, err = _validate_voter_session_or_log(db, voter_user_id)
            if not ok:
                return err
            profile = db.get(VoterProfile, voter_user_id)
            if profile and profile.has_voted:
                return jsonify({"error": "already_voted"}), 403

        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404

        candidates = (
            db.query(Candidate).filter(Candidate.election_id == election_id).order_by(Candidate.id.asc()).all()
        )
        return jsonify(
            {
                "election": {
                    "id": election.id,
                    "title": election.title,
                    "status": election.status,
                },
                "candidates": [
                    {
                        "id": c.id,
                        "name": c.name,
                        "party_id": c.party_id,
                        "profile_info": c.profile_info,
                    }
                    for c in candidates
                ],
            }
        )


@voting_bp.post("/voting/verify-biometric")
@require_any_role(ROLE_VOTER, ROLE_ELECTION_OFFICER)
def verify_biometric():
    unavailable = _ensure_operations_available("voting")
    if unavailable:
        return unavailable
    payload = request.get_json(silent=True) or {}
    voter_user_id = payload.get("voter_user_id")
    force_fail = bool(payload.get("force_fail"))
    if not isinstance(voter_user_id, int):
        return jsonify({"error": "voter_user_id_required"}), 400

    with SessionLocal() as db:
        role = current_role()
        if role == ROLE_VOTER:
            ok, err = _validate_voter_session_or_log(db, voter_user_id)
            if not ok:
                return err
        profile = db.get(VoterProfile, voter_user_id)
        if not profile:
            return jsonify({"error": "voter_profile_not_found"}), 404
        if force_fail:
            _log_security_attempt(
                db,
                (
                    f"biometric_verification_failed voter_user_id={voter_user_id} "
                    f"retry_allowed=true"
                ),
            )
            return (
                jsonify(
                    {
                        "error": "biometric_verification_failed",
                        "message": "Biometric verification failed. Please retry.",
                        "retry_allowed": True,
                    }
                ),
                400,
            )
        # Non-AI phase: biometric verification success is mocked.
        profile.verification_status = VerificationStatus.VERIFIED
        create_audit_log(
            db,
            user_id=voter_user_id,
            event_type="system",
            action=f"biometric_verified voter_user_id={voter_user_id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "verified", "voter_user_id": voter_user_id})


@voting_bp.post("/voting/cast")
@require_any_role(ROLE_VOTER, ROLE_ELECTION_OFFICER)
def cast_vote():
    unavailable = _ensure_operations_available("voting")
    if unavailable:
        return unavailable
    payload = request.get_json(silent=True) or {}
    election_id = payload.get("election_id")
    voter_user_id = payload.get("voter_user_id")
    candidate_id = payload.get("candidate_id")
    abstain = bool(payload.get("abstain", False))

    if not isinstance(election_id, int) or not isinstance(voter_user_id, int):
        return jsonify({"error": "election_id_and_voter_user_id_required"}), 400
    if abstain:
        candidate_id = None
    elif candidate_id is not None and not isinstance(candidate_id, int):
        return jsonify({"error": "candidate_id_must_be_int_or_null"}), 400

    with SessionLocal() as db:
        role = current_role()
        if role == ROLE_VOTER:
            ok, err = _validate_voter_session_or_log(db, voter_user_id)
            if not ok:
                return err

        ok, reason = validate_vote_request(db, election_id, voter_user_id, candidate_id)
        if not ok:
            if reason in {"already_voted", "biometric_not_verified"}:
                _log_security_attempt(
                    db,
                    f"vote_cast_denied voter_user_id={voter_user_id} reason={reason}",
                )
            return jsonify({"error": reason}), 400

        encrypted_vote, vote_hash = build_encrypted_vote_payload(
            election_id=election_id,
            voter_user_id=voter_user_id,
            candidate_id=candidate_id,
        )
        vote = Vote(
            election_id=election_id,
            voter_user_id=voter_user_id,
            candidate_id=candidate_id,
            vote_hash=vote_hash,
            encrypted_vote=encrypted_vote,
        )
        db.add(vote)

        profile = db.get(VoterProfile, voter_user_id)
        if profile:
            profile.has_voted = True
        create_audit_log(
            db,
            user_id=voter_user_id,
            event_type="system",
            action=(
                f"vote_recorded voter_user_id={voter_user_id} election_id={election_id} "
                f"abstain={abstain}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return (
            jsonify(
                {
                    "message": "vote_recorded",
                    "vote_hash": vote_hash,
                    "confirmation": {
                        "status": "success",
                        "voter_user_id": voter_user_id,
                        "election_id": election_id,
                        "abstain": abstain,
                    },
                }
            ),
            201,
        )


@voting_bp.get("/voting/assistant-guide")
@require_role(ROLE_VOTER)
def ai_assistant_guide():
    return jsonify(
        {
            "assistant_name": "E-Voting Guide Assistant",
            "steps": [
                "1. Request OTP using your voter ID.",
                "2. Start your secure voting session with OTP.",
                "3. Complete biometric verification.",
                "4. Load the active election ballot.",
                "5. Select a candidate or choose abstain.",
                "6. Confirm and submit your vote.",
            ],
            "tips": [
                "Do not share your OTP or session token.",
                "If biometric fails, retry verification.",
                "If session expires, start a new session.",
            ],
        }
    )


def _get_user_by_voter_id(db, voter_id: str):
    row = (
        db.query(User, VoterProfile)
        .join(VoterProfile, VoterProfile.user_id == User.id)
        .filter(VoterProfile.voter_id == voter_id)
        .first()
    )
    if not row:
        return None, None
    return row[0], row[1]


def _validate_voter_session_or_log(db, voter_user_id: int):
    token = request.headers.get("X-Voting-Session", "").strip()
    if not token:
        _log_security_attempt(
            db,
            f"unauthorized_voting_access voter_user_id={voter_user_id} reason=session_missing",
        )
        return False, (jsonify({"error": "session_required"}), 401)
    session, reason = validate_voting_session(token)
    if not session:
        _log_security_attempt(
            db,
            f"unauthorized_voting_access voter_user_id={voter_user_id} reason={reason}",
        )
        if reason == "session_expired":
            return False, (jsonify({"error": "session_timeout_login_again"}), 401)
        return False, (jsonify({"error": "session_invalid"}), 401)
    if session["voter_user_id"] != voter_user_id:
        _log_security_attempt(
            db,
            (
                f"unauthorized_voting_access voter_user_id={voter_user_id} "
                f"reason=session_user_mismatch session_user_id={session['voter_user_id']}"
            ),
        )
        return False, (jsonify({"error": "unauthorized_access_blocked"}), 403)
    return True, None


def _log_security_attempt(db, action: str) -> None:
    create_audit_log(
        db,
        user_id=None,
        event_type="security_alert",
        action=action,
        ip_address=request.remote_addr,
    )
    db.commit()


def _ensure_operations_available(operation_name: str):
    if SYSTEM_STATE.get("suspended"):
        return (
            jsonify(
                {
                    "error": "system_suspended",
                    "message": f"{operation_name} temporarily paused due to system failure handling.",
                }
            ),
            503,
        )
    return None
