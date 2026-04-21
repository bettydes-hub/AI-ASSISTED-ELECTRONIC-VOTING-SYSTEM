from flask import Blueprint, jsonify, request

from db import SessionLocal
from models.election import Election
from models.user import AccountStatus, User, UserRole
from security.rbac import ROLE_ELECTION_BOARD, ROLE_ELECTION_OFFICER, require_any_role, require_role
from services.audit_log_service import create_audit_log
from services.printer_service import build_result_document, export_result_document, print_result_document
from services.result_service import approve_results, get_results
from services.system_monitor_service import append_alert

result_bp = Blueprint("results", __name__)


@result_bp.get("/results/elections/closed")
@require_any_role(ROLE_ELECTION_BOARD, ROLE_ELECTION_OFFICER)
def list_closed_elections_for_results():
    with SessionLocal() as db:
        _actor, err = _get_authenticated_actor(db)
        if err:
            return err
        elections = (
            db.query(Election)
            .filter(Election.status == "COMPLETED")
            .order_by(Election.id.asc())
            .all()
        )
        return jsonify(
            {
                "items": [
                    {"id": election.id, "title": election.title, "status": election.status}
                    for election in elections
                ]
            }
        )


@result_bp.get("/results/<int:election_id>")
@require_any_role(ROLE_ELECTION_BOARD, ROLE_ELECTION_OFFICER)
def view_results(election_id: int):
    with SessionLocal() as db:
        actor, err = _get_authenticated_actor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        if election.status != "COMPLETED":
            return jsonify({"error": "election_not_closed"}), 409
        region_id_raw = request.args.get("region_id", "").strip()
        region_district = request.args.get("region_district", "").strip() or None
        region_id = None
        if region_id_raw:
            if not region_id_raw.isdigit():
                return jsonify({"error": "invalid_region_id"}), 400
            region_id = int(region_id_raw)
        result = get_results(db, election_id, region_id=region_id, region_district=region_district)
        if not result:
            return jsonify({"error": "results_not_found"}), 404
        create_audit_log(
            db,
            user_id=actor.id,
            event_type="admin_action",
            action=f"results_viewed election_id={election_id} actor_role={actor.role.value}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(result)


@result_bp.post("/results/<int:election_id>/approve")
@require_role(ROLE_ELECTION_BOARD)
def approve_results_route(election_id: int):
    payload = request.get_json(silent=True) or {}
    approved_by = (payload.get("approved_by") or "ElectionBoard").strip()
    with SessionLocal() as db:
        actor, err = _get_authenticated_actor(db)
        if err:
            return err
        try:
            result = approve_results(db, election_id, approved_by)
        except ValueError as exc:
            key = str(exc)
            status = 404 if key == "results_not_found" else 409
            return jsonify({"error": key}), status
        create_audit_log(
            db,
            user_id=actor.id,
            event_type="admin_action",
            action=f"results_approved election_id={election_id} approved_by={approved_by}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(result)


@result_bp.post("/results/<int:election_id>/print")
@require_any_role(ROLE_ELECTION_BOARD, ROLE_ELECTION_OFFICER)
def print_results(election_id: int):
    payload = request.get_json(silent=True) or {}
    force_fail = bool(payload.get("force_fail"))
    with SessionLocal() as db:
        actor, err = _get_authenticated_actor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        if election.status != "COMPLETED":
            return jsonify({"error": "election_not_closed"}), 409
        result = get_results(db, election_id)
        if not result:
            return jsonify({"error": "results_not_found"}), 404
        document = build_result_document(result)
        print_status = print_result_document(document, force_fail=force_fail)
        create_audit_log(
            db,
            user_id=actor.id,
            event_type="admin_action",
            action=(
                f"results_print_attempt election_id={election_id} "
                f"status={print_status['status']} role={actor.role.value}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        response_payload = {"print_result": print_status}
        if print_status["status"] == "print_failed":
            export_payload = export_result_document(document)
            response_payload["export_fallback"] = export_payload
        return jsonify(response_payload)


@result_bp.post("/results/<int:election_id>/sign")
@require_role(ROLE_ELECTION_OFFICER)
def sign_results(election_id: int):
    payload = request.get_json(silent=True) or {}
    signed_by = (payload.get("signed_by") or "").strip()
    if not signed_by:
        return jsonify({"error": "signed_by_required"}), 400
    with SessionLocal() as db:
        actor, err = _get_authenticated_actor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        if election.status != "COMPLETED":
            return jsonify({"error": "election_not_closed"}), 409
        create_audit_log(
            db,
            user_id=actor.id,
            event_type="admin_action",
            action=(
                f"results_signed election_id={election_id} signed_by={signed_by} "
                f"officer_id={actor.id}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "results_signed", "election_id": election_id, "signed_by": signed_by})


@result_bp.post("/results/<int:election_id>/submit-to-board")
@require_role(ROLE_ELECTION_OFFICER)
def submit_results_to_board(election_id: int):
    payload = request.get_json(silent=True) or {}
    signed_by = (payload.get("signed_by") or "").strip()
    if not signed_by:
        return jsonify({"error": "signed_by_required"}), 400
    with SessionLocal() as db:
        actor, err = _get_authenticated_actor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        if election.status != "COMPLETED":
            return jsonify({"error": "election_not_closed"}), 409
        create_audit_log(
            db,
            user_id=actor.id,
            event_type="admin_action",
            action=(
                f"results_submitted_to_board election_id={election_id} signed_by={signed_by} "
                f"officer_id={actor.id}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "results_submitted_to_board", "election_id": election_id})


@result_bp.post("/results/<int:election_id>/report-discrepancy")
@require_any_role(ROLE_ELECTION_BOARD, ROLE_ELECTION_OFFICER)
def report_discrepancy(election_id: int):
    payload = request.get_json(silent=True) or {}
    reason = (payload.get("reason") or "").strip()
    if not reason:
        return jsonify({"error": "reason_required"}), 400
    with SessionLocal() as db:
        actor, err = _get_authenticated_actor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        alert = append_alert(
            f"Result discrepancy election_id={election_id}: {reason}",
            severity="high",
            source="result_verification",
        )
        create_audit_log(
            db,
            user_id=actor.id,
            event_type="security_alert",
            action=(
                f"result_discrepancy_reported election_id={election_id} role={actor.role.value} "
                f"reason={reason}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "audit_process_triggered",
                "election_id": election_id,
                "reason": reason,
                "alert": alert,
            }
        )


def _get_authenticated_actor(db):
    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return None, (jsonify({"error": "x_user_id_required"}), 401)
    user = db.get(User, int(user_id_raw))
    if not user:
        return None, (jsonify({"error": "user_not_found"}), 401)
    if user.role not in {UserRole.ELECTION_BOARD, UserRole.ELECTION_OFFICER}:
        return None, (jsonify({"error": "authorized_actor_required"}), 403)
    if user.account_status != AccountStatus.ACTIVE:
        return None, (jsonify({"error": "account_not_active"}), 403)
    return user, None
