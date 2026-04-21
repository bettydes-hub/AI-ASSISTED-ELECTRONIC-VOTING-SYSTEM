from flask import Blueprint, jsonify, request

from sqlalchemy import func

from db import SessionLocal
from models.audit_log import AuditLog
from models.election import Election
from models.result import Result
from models.user import AccountStatus, User, UserRole
from models.vote import Vote
from security.rbac import ROLE_AUDIT_AUTHORITY, require_role
from services.audit_log_service import create_audit_log
from services.system_monitor_service import append_alert

audit_bp = Blueprint("audit", __name__)


@audit_bp.get("/audit/overview/<int:election_id>")
@require_role(ROLE_AUDIT_AUTHORITY)
def audit_overview(election_id: int):
    with SessionLocal() as db:
        auditor, err = _get_authenticated_auditor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        if election.status != "COMPLETED":
            return jsonify({"error": "election_not_closed"}), 409

        total_vote_records = (
            db.query(func.count(Vote.id)).filter(Vote.election_id == election_id).scalar() or 0
        )
        abstentions = (
            db.query(func.count(Vote.id))
            .filter(Vote.election_id == election_id, Vote.candidate_id.is_(None))
            .scalar()
            or 0
        )
        counted_candidate_votes = (
            db.query(func.coalesce(func.sum(Result.total_votes), 0))
            .filter(Result.election_id == election_id)
            .scalar()
            or 0
        )
        discrepancy = int(total_vote_records) != int(counted_candidate_votes + abstentions)
        if discrepancy:
            append_alert(
                f"Audit discrepancy detected election_id={election_id}",
                severity="high",
                source="audit_integrity",
            )
            create_audit_log(
                db,
                user_id=auditor.id,
                event_type="security_alert",
                action=f"audit_discrepancy_detected election_id={election_id}",
                ip_address=request.remote_addr,
            )
            db.commit()

        return jsonify(
            {
                "mode": "read_only",
                "election_id": election_id,
                "election_title": election.title,
                "total_vote_records": int(total_vote_records),
                "counted_candidate_votes": int(counted_candidate_votes),
                "abstentions": int(abstentions),
                "integrity_ok": not discrepancy,
                "discrepancy_detected": discrepancy,
            }
        )


@audit_bp.get("/audit/logs")
@require_role(ROLE_AUDIT_AUTHORITY)
def get_audit_logs():
    election_id_raw = request.args.get("election_id")
    with SessionLocal() as db:
        _auditor, err = _get_authenticated_auditor(db)
        if err:
            return err
        query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
        if election_id_raw and election_id_raw.isdigit():
            election_id = int(election_id_raw)
            query = query.filter(
                AuditLog.action.ilike(f"%election:{election_id}%")
                | AuditLog.action.ilike(f"%election_id={election_id}%")
            )
        logs = query.limit(500).all()
        return jsonify(
            {
                "items": [
                    {
                        "id": log.id,
                        "user_id": log.user_id,
                        "event_type": log.event_type,
                        "action": log.action,
                        "ip_address": log.ip_address,
                        "created_at": log.created_at.isoformat(),
                    }
                    for log in logs
                ]
            }
        )


@audit_bp.post("/audit/reports/generate")
@require_role(ROLE_AUDIT_AUTHORITY)
def generate_audit_report():
    payload = request.get_json(silent=True) or {}
    election_id = payload.get("election_id")
    if not isinstance(election_id, int):
        return jsonify({"error": "election_id_required"}), 400

    with SessionLocal() as db:
        auditor, err = _get_authenticated_auditor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        if election.status != "COMPLETED":
            return jsonify({"error": "election_not_closed"}), 409

        result_rows = db.query(Result).filter(Result.election_id == election_id).all()
        total_votes = db.query(func.coalesce(func.sum(Result.total_votes), 0)).filter(
            Result.election_id == election_id
        ).scalar() or 0
        vote_records = (
            db.query(func.count(Vote.id)).filter(Vote.election_id == election_id).scalar() or 0
        )
        abstentions = (
            db.query(func.count(Vote.id))
            .filter(Vote.election_id == election_id, Vote.candidate_id.is_(None))
            .scalar()
            or 0
        )
        discrepancy = int(vote_records) != int(total_votes + abstentions)
        report = {
            "election_id": election.id,
            "election_title": election.title,
            "election_status": election.status,
            "results_approved": election.results_approved,
            "result_rows": len(result_rows),
            "total_counted_votes": int(total_votes),
            "total_vote_records": int(vote_records),
            "abstentions": int(abstentions),
            "integrity_ok": not discrepancy,
            "issues": ["count_mismatch_detected"] if discrepancy else [],
            "generated_at": election.approved_at.isoformat() if election.approved_at else None,
        }
        create_audit_log(
            db,
            user_id=auditor.id,
            event_type="admin_action",
            action=f"audit_report_generated election_id={election_id} discrepancy={discrepancy}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "mode": "read_only",
                "report": report,
            }
        )


@audit_bp.post("/audit/reports/submit")
@require_role(ROLE_AUDIT_AUTHORITY)
def submit_audit_report():
    payload = request.get_json(silent=True) or {}
    election_id = payload.get("election_id")
    summary = (payload.get("summary") or "").strip()
    issues = payload.get("issues") or []
    if not isinstance(election_id, int):
        return jsonify({"error": "election_id_required"}), 400
    if not summary:
        return jsonify({"error": "summary_required"}), 400
    if not isinstance(issues, list):
        return jsonify({"error": "issues_must_be_list"}), 400

    with SessionLocal() as db:
        auditor, err = _get_authenticated_auditor(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        create_audit_log(
            db,
            user_id=auditor.id,
            event_type="admin_action",
            action=(
                f"audit_report_submitted election_id={election_id} "
                f"summary={summary} issues={','.join(str(item) for item in issues)}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "audit_report_submitted", "election_id": election_id, "issues": issues})


@audit_bp.post("/audit/logs/request-additional")
@require_role(ROLE_AUDIT_AUTHORITY)
def request_additional_logs():
    payload = request.get_json(silent=True) or {}
    election_id = payload.get("election_id")
    note = (payload.get("note") or "").strip()
    if not isinstance(election_id, int):
        return jsonify({"error": "election_id_required"}), 400
    if not note:
        return jsonify({"error": "note_required"}), 400

    with SessionLocal() as db:
        auditor, err = _get_authenticated_auditor(db)
        if err:
            return err
        create_audit_log(
            db,
            user_id=auditor.id,
            event_type="admin_action",
            action=f"additional_logs_requested election_id={election_id} note={note}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "additional_logs_requested", "election_id": election_id})


def _get_authenticated_auditor(db):
    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return None, (jsonify({"error": "x_user_id_required"}), 401)
    auditor = db.get(User, int(user_id_raw))
    if not auditor:
        return None, (jsonify({"error": "audit_authority_not_found"}), 401)
    if auditor.role != UserRole.AUDIT_AUTHORITY:
        return None, (jsonify({"error": "audit_authority_role_required"}), 403)
    if auditor.account_status != AccountStatus.ACTIVE:
        return None, (jsonify({"error": "audit_authority_account_not_active"}), 403)
    return auditor, None
