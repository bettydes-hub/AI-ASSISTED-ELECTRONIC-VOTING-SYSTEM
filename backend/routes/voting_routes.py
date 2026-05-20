from flask import Blueprint, jsonify, request

from db import SessionLocal
from models.candidate import Candidate
from models.election import Election
from models.user import AccountStatus, User
from models.vote import Vote
from models.voter_profile import VerificationStatus, VoterProfile
from models.vote_receipt import VoteReceipt

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
from services.receipt_service import generate_receipt_code

voting_bp = Blueprint("voting", __name__)


# ---------------------------
# Helpers
# ---------------------------

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
            jsonify({
                "error": "system_suspended",
                "message": f"{operation_name} temporarily paused due to system failure handling."
            }),
            503,
        )
    return None


def _validate_voter_session_or_log(db, voter_user_id: int):
    token = request.headers.get("X-Voting-Session", "").strip()

    if not token:
        _log_security_attempt(
            db,
            f"session_missing voter_user_id={voter_user_id}"
        )
        return False, (jsonify({"error": "session_required"}), 401)

    session, reason = validate_voting_session(token)

    if not session:
        _log_security_attempt(
            db,
            f"invalid_session voter_user_id={voter_user_id} reason={reason}"
        )
        return False, (jsonify({"error": "session_invalid"}), 401)

    if session["voter_user_id"] != voter_user_id:
        _log_security_attempt(
            db,
            f"session_user_mismatch voter_user_id={voter_user_id}"
        )
        return False, (jsonify({"error": "unauthorized_access_blocked"}), 403)

    return True, None


# ---------------------------
# OTP Request
# ---------------------------

@voting_bp.post("/voting/session/request-otp")
@require_role(ROLE_VOTER)
def request_voting_otp():
    if _ensure_operations_available("voting"):
        return _ensure_operations_available("voting")

    payload = request.get_json(silent=True) or {}
    voter_id = (payload.get("voter_id") or "").strip()

    if not voter_id:
        return jsonify({"error": "voter_id_required"}), 400

    with SessionLocal() as db:
        user, profile = _get_user_by_voter_id(db, voter_id)

        if not user:
            return jsonify({"error": "voter_id_not_found"}), 404

        if user.account_status != AccountStatus.ACTIVE:
            return jsonify({"error": "account_not_active"}), 403

        result = send_otp(user.contact_info or "")

        if not result["ok"]:
            _log_security_attempt(db, "otp_send_failed")
            return jsonify(result), 400

        create_audit_log(
            db,
            user_id=user.id,
            event_type="system",
            action="otp_sent",
            ip_address=request.remote_addr,
        )
        db.commit()

        return jsonify({
            "message": "otp_sent",
            "channel": result.get("channel"),
            "otp": result.get("otp"),
        })


# ---------------------------
# Start Voting Session
# ---------------------------

@voting_bp.post("/voting/session/start")
@require_role(ROLE_VOTER)
def start_voting_session():
    if _ensure_operations_available("voting"):
        return _ensure_operations_available("voting")

    payload = request.get_json(silent=True) or {}
    voter_id = (payload.get("voter_id") or "").strip()
    otp = (payload.get("otp") or "").strip()

    if not voter_id or not otp:
        return jsonify({"error": "voter_id_and_otp_required"}), 400

    with SessionLocal() as db:
        user, profile = _get_user_by_voter_id(db, voter_id)

        if not user:
            return jsonify({"error": "voter_id_not_found"}), 404

        if user.account_status != AccountStatus.ACTIVE:
            return jsonify({"error": "account_not_active"}), 403

        if not verify_otp(user.contact_info or "", otp):
            return jsonify({"error": "otp_invalid_or_expired"}), 400

        session = create_voting_session(user.id, profile.voter_id)

        return jsonify({
            "message": "session_started",
            "token": session["token"],
            "expires_at": session["expires_at"].isoformat(),
        })


# ---------------------------
# Get Ballot
# ---------------------------

@voting_bp.get("/ballot")
@require_any_role(ROLE_VOTER, ROLE_ELECTION_OFFICER)
def get_ballot():
    if _ensure_operations_available("voting"):
        return _ensure_operations_available("voting")

    election_id = request.args.get("election_id", "")
    voter_user_id = request.args.get("voter_user_id", "")

    if not election_id.isdigit():
        return jsonify({"error": "election_id_required"}), 400

    election_id = int(election_id)

    with SessionLocal() as db:
        role = current_role()

        if role == ROLE_VOTER:
            if not voter_user_id.isdigit():
                return jsonify({"error": "voter_user_id_required"}), 400

            voter_user_id = int(voter_user_id)

            ok, err = _validate_voter_session_or_log(db, voter_user_id)
            if not ok:
                return err

        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404

        candidates = (
            db.query(Candidate)
            .filter(Candidate.election_id == election_id)
            .all()
        )

        return jsonify({
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
        })


# ---------------------------
# Cast Vote (FIXED)
# ---------------------------

@voting_bp.post("/voting/cast")
@require_any_role(ROLE_VOTER, ROLE_ELECTION_OFFICER)
def cast_vote():
    if _ensure_operations_available("voting"):
        return _ensure_operations_available("voting")

    payload = request.get_json(silent=True) or {}

    election_id = payload.get("election_id")
    voter_user_id = payload.get("voter_user_id")
    candidate_id = payload.get("candidate_id")
    abstain = bool(payload.get("abstain", False))

    if not isinstance(election_id, int) or not isinstance(voter_user_id, int):
        return jsonify({"error": "election_id_and_voter_user_id_required"}), 400

    if abstain:
        candidate_id = None

    with SessionLocal() as db:
        if current_role() == ROLE_VOTER:
            ok, err = _validate_voter_session_or_log(db, voter_user_id)
            if not ok:
                return err

        ok, reason = validate_vote_request(
            db, election_id, voter_user_id, candidate_id
        )

        if not ok:
            return jsonify({"error": reason}), 400

        encrypted_vote, vote_hash = build_encrypted_vote_payload(
            election_id, voter_user_id, candidate_id
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

        receipt_code = generate_receipt_code()

        receipt = VoteReceipt(
            voter_user_id=voter_user_id,
            election_id=election_id,
            receipt_code=receipt_code,
            vote_hash=vote_hash,
        )

        db.add(receipt)

        create_audit_log(
            db,
            user_id=voter_user_id,
            event_type="system",
            action="vote_cast",
            ip_address=request.remote_addr,
        )

        db.commit()

        return jsonify({
            "message": "vote_recorded",
            "receipt": {
                "receipt_code": receipt_code,
                "vote_hash": vote_hash,
            }
        }), 201


# ---------------------------
# Receipt (FIXED duplicate route)
# ---------------------------

@voting_bp.get("/voting/receipt/<receipt_code>")
@require_any_role(ROLE_VOTER, ROLE_ELECTION_OFFICER)
def get_vote_receipt(receipt_code):
    with SessionLocal() as db:
        receipt = (
            db.query(VoteReceipt)
            .filter(VoteReceipt.receipt_code == receipt_code)
            .first()
        )

        if not receipt:
            return jsonify({"error": "receipt_not_found"}), 404

        return jsonify({
            "receipt_code": receipt.receipt_code,
            "vote_hash": receipt.vote_hash,
            "election_id": receipt.election_id,
            "voter_user_id": receipt.voter_user_id,
            "created_at": receipt.created_at.isoformat() if receipt.created_at else None,
            "status": "Vote Successfully Recorded",
        })


# ---------------------------
# Assistant Guide
# ---------------------------

@voting_bp.get("/voting/assistant-guide")
@require_role(ROLE_VOTER)
def ai_assistant_guide():
    return jsonify({
        "assistant_name": "E-Voting Guide Assistant",
        "steps": [
            "Request OTP using voter ID",
            "Start session",
            "Verify biometric",
            "Load ballot",
            "Cast vote",
            "Get receipt",
        ],
    })