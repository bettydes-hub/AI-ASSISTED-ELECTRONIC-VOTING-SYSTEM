from datetime import datetime, timedelta
import csv
import io

from flask import Blueprint, jsonify, request, Response
from sqlalchemy import func

from db import SessionLocal
from models.audit_log import AuditLog
from models.election import Election
from models.user import AccountStatus, User, UserRole
from security.rbac import ROLE_SYSTEM_ADMIN, require_role, require_system_permission
from services.audit_log_service import create_audit_log, verify_audit_chain
from services.backup_recovery_service import integrity_check, restore_backup
from services.system_monitor_service import SYSTEM_STATE, append_alert

system_bp = Blueprint("system", __name__)


@system_bp.get("/system/status")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def system_status():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        return jsonify(_build_status_payload(db, admin_user.id))


@system_bp.get("/system/monitoring/overview")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def monitoring_overview():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        return jsonify(_build_monitoring_overview(db, admin_user.id))


@system_bp.get("/system/security-logs")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("security_logs")
def list_security_logs():
    with SessionLocal() as db:
        _admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        q = (request.args.get("q") or "").strip().lower()
        severity = (request.args.get("severity") or "").strip().lower()
        limit = int(request.args.get("limit") or 100)
        if limit <= 0:
            limit = 100
        if limit > 500:
            limit = 500

        logs_query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
        logs_query = logs_query.filter(
            AuditLog.event_type.in_(["security_alert", "system_error", "admin_action", "security_event"])
        )
        if q:
            logs_query = logs_query.filter(func.lower(AuditLog.action).like(f"%{q}%"))
        if severity:
            logs_query = logs_query.filter(func.lower(AuditLog.action).like(f"%severity={severity}%"))

        logs = logs_query.limit(limit).all()
        return jsonify(
            {
                "items": [
                    {
                        "id": log.id,
                        "user_id": log.user_id,
                        "event_type": log.event_type,
                        "action": log.action,
                        "ip_address": log.ip_address,
                        "previous_hash": log.previous_hash,
                        "record_hash": log.record_hash,
                        "created_at": log.created_at.isoformat(),
                    }
                    for log in logs
                ]
            }
        )


@system_bp.get("/system/security-logs/export")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("security_logs")
def export_security_logs():
    with SessionLocal() as db:
        _admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        q = (request.args.get("q") or "").strip().lower()
        severity = (request.args.get("severity") or "").strip().lower()
        logs_query = db.query(AuditLog).order_by(AuditLog.created_at.desc()).filter(
            AuditLog.event_type.in_(["security_alert", "system_error", "admin_action", "security_event"])
        )
        if q:
            logs_query = logs_query.filter(func.lower(AuditLog.action).like(f"%{q}%"))
        if severity:
            logs_query = logs_query.filter(func.lower(AuditLog.action).like(f"%severity={severity}%"))
        logs = logs_query.limit(1000).all()

        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(
            [
                "id",
                "created_at",
                "event_type",
                "user_id",
                "ip_address",
                "action",
                "previous_hash",
                "record_hash",
            ]
        )
        for log in logs:
            writer.writerow(
                [
                    log.id,
                    log.created_at.isoformat(),
                    log.event_type,
                    log.user_id,
                    log.ip_address,
                    log.action,
                    log.previous_hash,
                    log.record_hash,
                ]
            )

        csv_bytes = out.getvalue()
        filename = f"security_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        return Response(
            csv_bytes,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )


@system_bp.delete("/system/security-logs")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("security_logs")
def clear_security_logs():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        keep_latest = int(payload.get("keep_latest") or 0)
        if keep_latest < 0:
            keep_latest = 0

        security_logs_query = (
            db.query(AuditLog)
            .filter(AuditLog.event_type.in_(["security_alert", "system_error", "admin_action", "security_event"]))
            .order_by(AuditLog.created_at.desc())
        )
        logs = security_logs_query.all()
        delete_ids = [log.id for log in logs[keep_latest:]]
        if delete_ids:
            db.query(AuditLog).filter(AuditLog.id.in_(delete_ids)).delete(synchronize_session=False)

        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"security_logs_cleared admin_id={admin_user.id} deleted_count={len(delete_ids)} "
                f"kept_latest={keep_latest}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "security_logs_cleared", "deleted_count": len(delete_ids)})


@system_bp.post("/system/suspend")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def suspend_system():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        SYSTEM_STATE["suspended"] = True
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"system_suspended admin_id={admin_user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "system_suspended", "state": _build_status_payload(db, admin_user.id)})


@system_bp.post("/system/resume")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def resume_system():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        SYSTEM_STATE["suspended"] = False
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"system_resumed admin_id={admin_user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "system_resumed", "state": _build_status_payload(db, admin_user.id)})


@system_bp.post("/system/service/restart")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def restart_system_service():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        SYSTEM_STATE["started_at"] = datetime.utcnow().isoformat()
        SYSTEM_STATE["suspended"] = False
        SYSTEM_STATE["operational_mode"] = "normal"
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"system_service_restarted admin_id={admin_user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "system_service_restarted",
                "state": _build_status_payload(db, admin_user.id),
            }
        )


@system_bp.post("/system/backup/restore")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def backup_restore():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        result = restore_backup(payload.get("label"))
        SYSTEM_STATE["last_backup_restore"] = datetime.utcnow().isoformat()
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"backup_restored admin_id={admin_user.id} label={result['label']}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(result)


@system_bp.post("/system/integrity-check")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def system_integrity_check():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        result = integrity_check()
        SYSTEM_STATE["last_integrity_check"] = result["checked_at"]
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"integrity_check_run admin_id={admin_user.id} result={result['status']}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(result)


@system_bp.patch("/system/settings")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("system_config")
def update_system_settings():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err

        payload = request.get_json(silent=True) or {}
        access_levels = payload.get("access_levels")
        system_parameters = payload.get("system_parameters")

        if access_levels is None and system_parameters is None:
            return jsonify({"error": "settings_payload_required"}), 400
        if access_levels is not None and not isinstance(access_levels, dict):
            return _config_update_failed(db, admin_user.id, "access_levels must be an object")
        if system_parameters is not None and not isinstance(system_parameters, dict):
            return _config_update_failed(db, admin_user.id, "system_parameters must be an object")

        SYSTEM_STATE["update_state"]["snapshot"] = {
            "system_parameters": dict(SYSTEM_STATE["system_parameters"]),
            "access_levels": dict(SYSTEM_STATE["access_levels"]),
            "last_patch_update": SYSTEM_STATE["last_patch_update"],
            "last_config_update": SYSTEM_STATE["last_config_update"],
            "captured_at": datetime.utcnow().isoformat(),
        }
        SYSTEM_STATE["update_state"]["rollback_available"] = True
        SYSTEM_STATE["update_state"]["last_update_label"] = "config_update"
        SYSTEM_STATE["update_state"]["last_update_started_at"] = datetime.utcnow().isoformat()

        if access_levels is not None:
            SYSTEM_STATE["access_levels"] = access_levels
        if system_parameters is not None:
            SYSTEM_STATE["system_parameters"] = system_parameters
        SYSTEM_STATE["last_config_update"] = datetime.utcnow().isoformat()
        SYSTEM_STATE["update_state"]["last_update_status"] = "success"
        SYSTEM_STATE["update_state"]["last_update_finished_at"] = datetime.utcnow().isoformat()
        SYSTEM_STATE["operational_mode"] = "normal"

        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"system_settings_updated admin_id={admin_user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "settings_updated",
                "settings": {
                    "access_levels": SYSTEM_STATE["access_levels"],
                    "system_parameters": SYSTEM_STATE["system_parameters"],
                    "last_config_update": SYSTEM_STATE["last_config_update"],
                },
            }
        )


@system_bp.post("/system/updates/apply")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def apply_system_update():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        label = (payload.get("label") or "").strip() or "default_patch"
        force_fail = bool(payload.get("force_fail"))
        snapshot = {
            "system_parameters": dict(SYSTEM_STATE["system_parameters"]),
            "access_levels": dict(SYSTEM_STATE["access_levels"]),
            "last_patch_update": SYSTEM_STATE["last_patch_update"],
            "last_config_update": SYSTEM_STATE["last_config_update"],
            "captured_at": datetime.utcnow().isoformat(),
        }
        SYSTEM_STATE["update_state"]["snapshot"] = snapshot
        SYSTEM_STATE["update_state"]["last_update_label"] = label
        SYSTEM_STATE["update_state"]["last_update_started_at"] = datetime.utcnow().isoformat()
        SYSTEM_STATE["update_state"]["last_update_status"] = "running"
        SYSTEM_STATE["update_state"]["last_update_error"] = None
        SYSTEM_STATE["update_state"]["rollback_available"] = True
        if force_fail:
            SYSTEM_STATE["patch_failure_count"] += 1
            error_msg = f"Patch update failed for label={label}"
            alert = append_alert(error_msg, severity="critical", source="patch_manager")
            SYSTEM_STATE["operational_mode"] = "degraded"
            SYSTEM_STATE["update_state"]["last_update_status"] = "failed"
            SYSTEM_STATE["update_state"]["last_update_error"] = error_msg
            SYSTEM_STATE["update_state"]["last_update_finished_at"] = datetime.utcnow().isoformat()
            create_audit_log(
                db,
                user_id=admin_user.id,
                event_type="system_error",
                action=f"patch_update_failed admin_id={admin_user.id} label={label}",
                ip_address=request.remote_addr,
            )
            db.commit()
            return (
                jsonify(
                    {
                        "error": "update_failed",
                        "message": error_msg,
                        "alert": alert,
                        "rollback_available": True,
                    }
                ),
                500,
            )

        SYSTEM_STATE["last_patch_update"] = datetime.utcnow().isoformat()
        SYSTEM_STATE["operational_mode"] = "normal"
        SYSTEM_STATE["update_state"]["last_update_status"] = "success"
        SYSTEM_STATE["update_state"]["last_update_finished_at"] = datetime.utcnow().isoformat()
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"patch_update_applied admin_id={admin_user.id} label={label}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "update_applied",
                "label": label,
                "applied_at": SYSTEM_STATE["last_patch_update"],
                "operational_mode": SYSTEM_STATE["operational_mode"],
            }
        )


@system_bp.post("/system/updates/rollback")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def rollback_system_update():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        reason = (payload.get("reason") or "manual_rollback").strip()
        snapshot = SYSTEM_STATE["update_state"].get("snapshot")
        if not snapshot:
            return jsonify({"error": "rollback_snapshot_not_available"}), 409

        SYSTEM_STATE["system_parameters"] = dict(snapshot.get("system_parameters") or {})
        SYSTEM_STATE["access_levels"] = dict(snapshot.get("access_levels") or {})
        SYSTEM_STATE["last_patch_update"] = snapshot.get("last_patch_update")
        SYSTEM_STATE["last_config_update"] = snapshot.get("last_config_update")
        SYSTEM_STATE["operational_mode"] = "normal"
        SYSTEM_STATE["update_state"]["last_rollback_at"] = datetime.utcnow().isoformat()
        SYSTEM_STATE["update_state"]["last_rollback_reason"] = reason
        SYSTEM_STATE["update_state"]["last_update_status"] = "rolled_back"
        SYSTEM_STATE["update_state"]["rollback_available"] = False
        SYSTEM_STATE["update_state"]["snapshot"] = None
        alert = append_alert(
            f"System update rolled back. reason={reason}",
            severity="warning",
            source="patch_manager",
        )
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"patch_update_rolled_back admin_id={admin_user.id} reason={reason}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "update_rolled_back",
                "reason": reason,
                "rolled_back_at": SYSTEM_STATE["update_state"]["last_rollback_at"],
                "alert": alert,
            }
        )


@system_bp.post("/system/security-events")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("security_logs")
def report_security_event():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        description = (payload.get("description") or "").strip()
        severity = (payload.get("severity") or "warning").strip().lower()
        if not description:
            return jsonify({"error": "description_required"}), 400

        if severity in {"high", "critical"}:
            SYSTEM_STATE["additional_monitoring"] = True
        alert = append_alert(description, severity=severity, source="security_monitor")
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="security_alert",
            action=f"security_event admin_id={admin_user.id} severity={severity} description={description}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "security_event_recorded",
                "alert": alert,
                "additional_monitoring": SYSTEM_STATE["additional_monitoring"],
            }
        )


@system_bp.post("/system/failures/report")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def report_system_failure():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        category = (payload.get("category") or "general").strip().lower()
        description = (payload.get("description") or "").strip()
        if not description:
            return jsonify({"error": "description_required"}), 400

        SYSTEM_STATE["suspended"] = True
        SYSTEM_STATE["failure_state"]["active"] = True
        SYSTEM_STATE["failure_state"]["category"] = category
        SYSTEM_STATE["failure_state"]["description"] = description
        SYSTEM_STATE["failure_state"]["detected_at"] = datetime.utcnow().isoformat()
        SYSTEM_STATE["failure_state"]["diagnosis"] = None
        SYSTEM_STATE["failure_state"]["requires_reschedule"] = False

        alert = append_alert(
            f"System failure reported: {description}",
            severity="critical",
            source="failure_handler",
        )
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="system_error",
            action=f"system_failure_reported admin_id={admin_user.id} category={category} description={description}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "operations_suspended_automatically",
                "notification": "Voting and registration are temporarily paused for safety.",
                "failure_state": SYSTEM_STATE["failure_state"],
                "alert": alert,
            }
        )


@system_bp.post("/system/failures/diagnose")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def diagnose_failure():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        diagnosis = (payload.get("diagnosis") or "").strip()
        requires_reschedule = bool(payload.get("requires_reschedule", False))
        if not diagnosis:
            return jsonify({"error": "diagnosis_required"}), 400
        if not SYSTEM_STATE["failure_state"]["active"]:
            return jsonify({"error": "no_active_failure"}), 409

        SYSTEM_STATE["failure_state"]["diagnosis"] = diagnosis
        SYSTEM_STATE["failure_state"]["requires_reschedule"] = requires_reschedule
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"system_failure_diagnosed admin_id={admin_user.id} diagnosis={diagnosis} "
                f"requires_reschedule={requires_reschedule}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "failure_diagnosis_recorded", "failure_state": SYSTEM_STATE["failure_state"]})


@system_bp.post("/system/failures/verify-and-resume")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def verify_and_resume_system():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        if not SYSTEM_STATE["failure_state"]["active"]:
            return jsonify({"error": "no_active_failure"}), 409

        integrity = integrity_check()
        SYSTEM_STATE["last_integrity_check"] = integrity["checked_at"]
        if integrity["status"] != "ok":
            append_alert(
                "Integrity verification failed after system issue.",
                severity="critical",
                source="failure_handler",
            )
            create_audit_log(
                db,
                user_id=admin_user.id,
                event_type="system_error",
                action=f"failure_recovery_integrity_failed admin_id={admin_user.id}",
                ip_address=request.remote_addr,
            )
            db.commit()
            return jsonify({"error": "integrity_check_failed", "integrity": integrity}), 500

        SYSTEM_STATE["suspended"] = False
        SYSTEM_STATE["failure_state"]["active"] = False
        SYSTEM_STATE["failure_state"]["last_resolution"] = {
            "resolved_at": datetime.utcnow().isoformat(),
            "resolved_by": admin_user.id,
        }
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=f"system_resumed_after_failure admin_id={admin_user.id}",
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "system_resumed_after_integrity_verification",
                "integrity": integrity,
                "state": _build_status_payload(db, admin_user.id),
            }
        )


@system_bp.post("/system/failures/reschedule")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def reschedule_elections_after_failure():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        extend_hours = int(payload.get("extend_hours") or 24)
        if extend_hours <= 0:
            return jsonify({"error": "extend_hours_must_be_positive"}), 400

        impacted = (
            db.query(Election)
            .filter(Election.status.in_(["DRAFT", "ACTIVE"]))
            .order_by(Election.id.asc())
            .all()
        )
        delta = timedelta(hours=extend_hours)
        rescheduled_ids: list[int] = []
        for election in impacted:
            if election.registration_start_at:
                election.registration_start_at = election.registration_start_at + delta
            if election.registration_end_at:
                election.registration_end_at = election.registration_end_at + delta
            if election.start_at:
                election.start_at = election.start_at + delta
            if election.end_at:
                election.end_at = election.end_at + delta
            if election.result_at:
                election.result_at = election.result_at + delta
            rescheduled_ids.append(election.id)

        SYSTEM_STATE["failure_state"]["requires_reschedule"] = False
        SYSTEM_STATE["failure_state"]["rescheduled_election_ids"] = rescheduled_ids
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"elections_rescheduled_after_failure admin_id={admin_user.id} "
                f"extend_hours={extend_hours} elections={rescheduled_ids}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "elections_rescheduled",
                "extend_hours": extend_hours,
                "rescheduled_election_ids": rescheduled_ids,
            }
        )


@system_bp.post("/system/failures/restore-backup")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def restore_backup_after_corruption():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        label = payload.get("label")
        result = restore_backup(label)
        SYSTEM_STATE["last_backup_restore"] = result["restored_at"]
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"backup_restored_after_corruption admin_id={admin_user.id} "
                f"label={result['label']}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "backup_restored_after_corruption",
                "restore_result": result,
            }
        )


def _build_status_payload(db, admin_user_id: int) -> dict:
    recent_security_logs = (
        db.query(AuditLog)
        .filter(AuditLog.event_type.in_(["security_alert", "system_error", "admin_action"]))
        .order_by(AuditLog.created_at.desc())
        .limit(25)
        .all()
    )
    active_users = (
        db.query(User).filter(User.account_status == AccountStatus.ACTIVE).count()
    )
    started_at_raw = SYSTEM_STATE.get("started_at")
    started_at = datetime.fromisoformat(started_at_raw) if started_at_raw else datetime.utcnow()
    uptime_seconds = max(0, int((datetime.utcnow() - started_at).total_seconds()))
    failure_count = db.query(AuditLog).filter(AuditLog.event_type == "system_error").count()
    chain_report = verify_audit_chain(db.query(AuditLog).order_by(AuditLog.id.asc()).all())
    return {
        "suspended": SYSTEM_STATE["suspended"],
        "operational_mode": SYSTEM_STATE["operational_mode"],
        "additional_monitoring": SYSTEM_STATE["additional_monitoring"],
        "last_backup_restore": SYSTEM_STATE["last_backup_restore"],
        "last_integrity_check": SYSTEM_STATE["last_integrity_check"],
        "last_config_update": SYSTEM_STATE["last_config_update"],
        "last_patch_update": SYSTEM_STATE["last_patch_update"],
        "patch_failure_count": SYSTEM_STATE["patch_failure_count"],
        "failure_state": SYSTEM_STATE["failure_state"],
        "update_state": SYSTEM_STATE["update_state"],
        "settings": {
            "access_levels": SYSTEM_STATE["access_levels"],
            "system_parameters": SYSTEM_STATE["system_parameters"],
        },
        "performance_metrics": {
            "server_time": datetime.utcnow().isoformat(),
            "uptime_seconds": uptime_seconds,
            "active_users": active_users,
            "failure_count": failure_count,
            "admin_session_user_id": admin_user_id,
            "alerts_count": len(SYSTEM_STATE["alerts"]),
        },
        "audit_chain": chain_report,
        "alerts": SYSTEM_STATE["alerts"][:20],
        "security_logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "event_type": log.event_type,
                "action": log.action,
                "created_at": log.created_at.isoformat(),
            }
            for log in recent_security_logs
        ],
    }


def _build_monitoring_overview(db, admin_user_id: int) -> dict:
    status = _build_status_payload(db, admin_user_id)
    suspicious_attempts = (
        db.query(AuditLog)
        .filter(
            AuditLog.event_type.in_(["security_alert", "system_error"]),
            AuditLog.action.ilike("%invalid%"),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(20)
        .all()
    )
    return {
        "health": {
            "status": "degraded" if status["suspended"] else "healthy",
            "suspended": status["suspended"],
            "last_integrity_check": status["last_integrity_check"],
            "last_backup_restore": status["last_backup_restore"],
        },
        "performance_metrics": status["performance_metrics"],
        "security_events": status["alerts"],
        "suspicious_attempts": [
            {
                "id": log.id,
                "event_type": log.event_type,
                "action": log.action,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat(),
            }
            for log in suspicious_attempts
        ],
    }


def _config_update_failed(db, admin_user_id: int, reason: str):
    alert = append_alert(f"Configuration update failed: {reason}", severity="high", source="config_manager")
    SYSTEM_STATE["operational_mode"] = "degraded"
    SYSTEM_STATE["update_state"]["last_update_status"] = "failed"
    SYSTEM_STATE["update_state"]["last_update_error"] = reason
    SYSTEM_STATE["update_state"]["last_update_finished_at"] = datetime.utcnow().isoformat()
    SYSTEM_STATE["update_state"]["rollback_available"] = bool(SYSTEM_STATE["update_state"].get("snapshot"))
    create_audit_log(
        db,
        user_id=admin_user_id,
        event_type="system_error",
        action=f"settings_update_failed admin_id={admin_user_id} reason={reason}",
        ip_address=request.remote_addr,
    )
    db.commit()
    return (
        jsonify(
            {
                "error": "configuration_update_failed",
                "message": reason,
                "alert": alert,
            }
        ),
        400,
    )


def _get_authenticated_admin(db):
    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return None, (jsonify({"error": "x_user_id_required"}), 401)
    admin_user = db.get(User, int(user_id_raw))
    if not admin_user:
        return None, (jsonify({"error": "admin_not_found"}), 401)
    if admin_user.role != UserRole.SYSTEM_ADMIN:
        return None, (jsonify({"error": "admin_role_required"}), 403)
    if admin_user.account_status != AccountStatus.ACTIVE:
        return None, (jsonify({"error": "admin_account_not_active"}), 403)
    return admin_user, None
