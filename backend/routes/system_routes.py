from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from db import SessionLocal
from models.audit_log import AuditLog
from models.election import Election
from models.user import AccountStatus, User, UserRole
from security.rbac import ROLE_SYSTEM_ADMIN, require_role
from services.audit_log_service import create_audit_log
from services.backup_recovery_service import integrity_check, restore_backup
from services.system_monitor_service import SYSTEM_STATE, append_alert

system_bp = Blueprint("system", __name__)


@system_bp.get("/system/status")
@require_role(ROLE_SYSTEM_ADMIN)
def system_status():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        return jsonify(_build_status_payload(db, admin_user.id))


@system_bp.post("/system/suspend")
@require_role(ROLE_SYSTEM_ADMIN)
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


@system_bp.post("/system/backup/restore")
@require_role(ROLE_SYSTEM_ADMIN)
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

        if access_levels is not None:
            SYSTEM_STATE["access_levels"] = access_levels
        if system_parameters is not None:
            SYSTEM_STATE["system_parameters"] = system_parameters
        SYSTEM_STATE["last_config_update"] = datetime.utcnow().isoformat()

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
def apply_system_update():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        payload = request.get_json(silent=True) or {}
        label = (payload.get("label") or "").strip() or "default_patch"
        force_fail = bool(payload.get("force_fail"))
        if force_fail:
            SYSTEM_STATE["patch_failure_count"] += 1
            error_msg = f"Patch update failed for label={label}"
            alert = append_alert(error_msg, severity="critical", source="patch_manager")
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
                    }
                ),
                500,
            )

        SYSTEM_STATE["last_patch_update"] = datetime.utcnow().isoformat()
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
            }
        )


@system_bp.post("/system/security-events")
@require_role(ROLE_SYSTEM_ADMIN)
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
    return {
        "suspended": SYSTEM_STATE["suspended"],
        "additional_monitoring": SYSTEM_STATE["additional_monitoring"],
        "last_backup_restore": SYSTEM_STATE["last_backup_restore"],
        "last_integrity_check": SYSTEM_STATE["last_integrity_check"],
        "last_config_update": SYSTEM_STATE["last_config_update"],
        "last_patch_update": SYSTEM_STATE["last_patch_update"],
        "patch_failure_count": SYSTEM_STATE["patch_failure_count"],
        "failure_state": SYSTEM_STATE["failure_state"],
        "settings": {
            "access_levels": SYSTEM_STATE["access_levels"],
            "system_parameters": SYSTEM_STATE["system_parameters"],
        },
        "performance_metrics": {
            "server_time": datetime.utcnow().isoformat(),
            "active_users": active_users,
            "admin_session_user_id": admin_user_id,
            "alerts_count": len(SYSTEM_STATE["alerts"]),
        },
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


def _config_update_failed(db, admin_user_id: int, reason: str):
    alert = append_alert(f"Configuration update failed: {reason}", severity="high", source="config_manager")
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
