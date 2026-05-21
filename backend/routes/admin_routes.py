import secrets

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from db import SessionLocal
from models.audit_log import AuditLog
from models.audit_authority_profile import AuditAuthorityProfile
from models.election_board_profile import ElectionBoardProfile
from models.system_admin_profile import SystemAdminProfile
from models.user import AccountStatus, User, UserRole
from models.voter_profile import VoterProfile
from security.auth import hash_password
from security.rbac import ROLE_SYSTEM_ADMIN, require_role, require_system_permission
from services.audit_log_service import create_audit_log
from services.system_monitor_service import SYSTEM_STATE

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/admin/users")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("user_management")
def list_users():
    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        users = db.query(User).order_by(User.id.asc()).all()
        return jsonify(
            {
                "items": [
                    {
                        "id": user.id,
                        "full_name": user.full_name,
                        "username": user.username,
                        "national_id": user.national_id,
                        "contact_info": user.contact_info,
                        "role": user.role.value,
                        "account_status": user.account_status.value,
                    }
                    for user in users
                ]
            }
        )


@admin_bp.post("/admin/users")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("user_management")
def create_user():
    if SYSTEM_STATE.get("suspended"):
        return (
            jsonify({"error": "system_unavailable", "message": "Registration postponed until system restore"}),
            503,
        )

    payload = request.get_json(silent=True) or {}
    required = ["full_name", "national_id", "contact_info", "username", "password", "role"]
    if not all(payload.get(key) for key in required):
        return jsonify({"error": "missing_required_fields"}), 400

    national_id = payload["national_id"].strip()
    if not _is_valid_national_id(national_id):
        return jsonify({"error": "invalid_national_id"}), 400

    role_value = payload["role"]
    try:
        role = UserRole(role_value)
    except ValueError:
        return jsonify({"error": "invalid_role"}), 400
    allowed_creation_roles = set(UserRole)
    if role not in allowed_creation_roles:
        return jsonify({"error": "invalid_role"}), 400

    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err

        if db.query(User).filter(User.username == payload["username"].strip()).first():
            return jsonify({"error": "username_exists"}), 409
        if db.query(User).filter(User.national_id == national_id).first():
            return jsonify({"error": "national_id_exists"}), 409

        user = User(
            full_name=payload["full_name"].strip(),
            national_id=national_id,
            contact_info=payload["contact_info"].strip(),
            username=payload["username"].strip(),
            password_hash=hash_password(payload["password"]),
            role=role,
            account_status=AccountStatus.ACTIVE,
        )
        db.add(user)
        db.flush()
        _ensure_profile_for_role(db, user.id, role)

        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"user_created admin_id={admin_user.id} created_user_id={user.id} "
                f"role={user.role.value} national_id={user.national_id}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return (
            jsonify(
                {
                    "message": "user_created",
                    "id": user.id,
                    "system_id": user.id,
                    "credentials_delivery": {
                        "status": "sent",
                        "username": user.username,
                    },
                }
            ),
            201,
        )


@admin_bp.patch("/admin/users/<int:user_id>")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("user_management")
def update_user(user_id: int):
    if SYSTEM_STATE.get("suspended"):
        return (
            jsonify({"error": "system_unavailable", "message": "User update postponed until system restore"}),
            503,
        )

    payload = request.get_json(silent=True) or {}
    updatable_fields = {"full_name", "national_id", "contact_info", "username"}
    if not any(key in payload for key in updatable_fields):
        return jsonify({"error": "no_update_fields"}), 400

    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err

        user = db.get(User, user_id)
        if not user:
            return jsonify({"error": "user_not_found"}), 404

        if "full_name" in payload:
            full_name = str(payload.get("full_name", "")).strip()
            if not full_name:
                return jsonify({"error": "invalid_full_name"}), 400
            user.full_name = full_name

        if "contact_info" in payload:
            contact_info = str(payload.get("contact_info", "")).strip()
            user.contact_info = contact_info or None

        if "national_id" in payload:
            national_id = str(payload.get("national_id", "")).strip()
            if not _is_valid_national_id(national_id):
                return jsonify({"error": "invalid_national_id"}), 400
            existing_id_owner = (
                db.query(User)
                .filter(User.national_id == national_id, User.id != user.id)
                .first()
            )
            if existing_id_owner:
                return jsonify({"error": "national_id_exists"}), 409
            user.national_id = national_id

        if "username" in payload:
            username = str(payload.get("username", "")).strip()
            if not username:
                return jsonify({"error": "invalid_username"}), 400
            existing_username_owner = (
                db.query(User)
                .filter(User.username == username, User.id != user.id)
                .first()
            )
            if existing_username_owner:
                return jsonify({"error": "username_exists"}), 409
            user.username = username

        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"user_updated admin_id={admin_user.id} target_user_id={user.id} "
                f"role={user.role.value}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "user_updated",
                "id": user.id,
                "full_name": user.full_name,
                "username": user.username,
                "national_id": user.national_id,
                "contact_info": user.contact_info,
                "role": user.role.value,
                "account_status": user.account_status.value,
            }
        )


@admin_bp.patch("/admin/users/<int:user_id>/role")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("user_management")
def update_user_role(user_id: int):
    if SYSTEM_STATE.get("suspended"):
        return (
            jsonify({"error": "system_unavailable", "message": "Role update postponed until system restore"}),
            503,
        )

    payload = request.get_json(silent=True) or {}
    role_value = payload.get("role")
    if not role_value:
        return jsonify({"error": "role_required"}), 400

    allowed_roles = {role.value for role in UserRole}
    if role_value not in allowed_roles:
        return jsonify({"error": "invalid_role"}), 400
    new_role = UserRole(role_value)

    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        user = db.get(User, user_id)
        if not user:
            return jsonify({"error": "user_not_found"}), 404
        if admin_user.id == user.id and new_role != UserRole.SYSTEM_ADMIN:
            return jsonify({"error": "cannot_change_own_admin_role"}), 400
        old_role = user.role.value
        user.role = new_role
        _ensure_profile_for_role(db, user.id, new_role)
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"user_role_updated admin_id={admin_user.id} target_user_id={user.id} "
                f"old_role={old_role} new_role={user.role.value}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "role_updated", "id": user.id, "role": user.role.value})


@admin_bp.post("/admin/users/<int:user_id>/deactivate")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("user_management")
def deactivate_user(user_id: int):
    if SYSTEM_STATE.get("suspended"):
        return (
            jsonify({"error": "system_unavailable", "message": "Deactivation postponed until system restore"}),
            503,
        )

    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        if admin_user.id == user_id:
            return jsonify({"error": "cannot_deactivate_self"}), 400

        user = db.get(User, user_id)
        if not user:
            return jsonify({"error": "user_not_found"}), 404
        user.account_status = AccountStatus.DISABLED
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"user_deactivated admin_id={admin_user.id} target_user_id={user.id} "
                f"role={user.role.value}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "user_deactivated", "id": user.id})


@admin_bp.post("/admin/users/<int:user_id>/activate")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("user_management")
def activate_user(user_id: int):
    if SYSTEM_STATE.get("suspended"):
        return (
            jsonify({"error": "system_unavailable", "message": "Activation postponed until system restore"}),
            503,
        )

    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err

        user = db.get(User, user_id)
        if not user:
            return jsonify({"error": "user_not_found"}), 404

        user.account_status = AccountStatus.ACTIVE
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="admin_action",
            action=(
                f"user_activated admin_id={admin_user.id} target_user_id={user.id} "
                f"role={user.role.value}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify({"message": "user_activated", "id": user.id})


@admin_bp.get("/admin/security-logs")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("security_logs")
def security_logs():
    with SessionLocal() as db:
        _admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        logs = (
            db.query(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .limit(200)
            .all()
        )
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


@admin_bp.post("/admin/users/<int:user_id>/reset-credentials")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("user_management")
def reset_user_credentials(user_id: int):
    if SYSTEM_STATE.get("suspended"):
        return (
            jsonify(
                {
                    "error": "system_unavailable",
                    "message": "Credential reset postponed until system restore",
                }
            ),
            503,
        )

    with SessionLocal() as db:
        admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        user = db.get(User, user_id)
        if not user:
            return jsonify({"error": "user_not_found"}), 404
        if admin_user.id == user.id:
            return jsonify({"error": "cannot_reset_self_credentials"}), 400

        temporary_password = _generate_temporary_password()
        user.password_hash = hash_password(temporary_password)
        user.must_change_password = True
        create_audit_log(
            db,
            user_id=admin_user.id,
            event_type="security_event",
            action=(
                f"user_credentials_reset admin_id={admin_user.id} target_user_id={user.id} "
                f"target_username={user.username}"
            ),
            ip_address=request.remote_addr,
        )
        db.commit()
        return jsonify(
            {
                "message": "credentials_reset",
                "id": user.id,
                "temporary_password": temporary_password,
                "must_change_password": True,
            }
        )


@admin_bp.get("/admin/monitoring/overview")
@require_role(ROLE_SYSTEM_ADMIN)
@require_system_permission("maintenance")
def monitoring_overview():
    with SessionLocal() as db:
        _admin_user, err = _get_authenticated_admin(db)
        if err:
            return err
        total_users = db.query(func.count(User.id)).scalar() or 0
        active_users = (
            db.query(func.count(User.id)).filter(User.account_status == AccountStatus.ACTIVE).scalar() or 0
        )
        disabled_users = (
            db.query(func.count(User.id)).filter(User.account_status == AccountStatus.DISABLED).scalar() or 0
        )
        force_change_users = (
            db.query(func.count(User.id)).filter(User.must_change_password.is_(True)).scalar() or 0
        )
        role_counts = (
            db.query(User.role, func.count(User.id))
            .group_by(User.role)
            .all()
        )
        reset_logs = (
            db.query(AuditLog)
            .filter(AuditLog.action.like("user_credentials_reset%"))
            .order_by(AuditLog.created_at.desc())
            .limit(20)
            .all()
        )
        return jsonify(
            {
                "users": {
                    "total": total_users,
                    "active": active_users,
                    "disabled": disabled_users,
                    "pending_password_change": force_change_users,
                },
                "role_counts": {str(role.value): count for role, count in role_counts},
                "recent_credential_resets": [
                    {
                        "id": log.id,
                        "action": log.action,
                        "admin_user_id": log.user_id,
                        "ip_address": log.ip_address,
                        "created_at": log.created_at.isoformat(),
                    }
                    for log in reset_logs
                ],
            }
        )


def _is_valid_national_id(value: str) -> bool:
    # Basic structural check for prototype phase; replace with external authority integration later.
    # Accept shorter IDs used in pilot data (e.g. 5 characters like 01888).
    if len(value) < 5 or len(value) > 50:
        return False
    has_alpha_num = any(ch.isalnum() for ch in value)
    return has_alpha_num


def _ensure_profile_for_role(db, user_id: int, role: UserRole) -> None:
    if role == UserRole.VOTER:
        exists = db.query(VoterProfile).filter(VoterProfile.user_id == user_id).first()
        if not exists:
            db.add(VoterProfile(user_id=user_id))
    elif role == UserRole.SYSTEM_ADMIN:
        exists = db.query(SystemAdminProfile).filter(SystemAdminProfile.user_id == user_id).first()
        if not exists:
            db.add(SystemAdminProfile(user_id=user_id))
    elif role == UserRole.ELECTION_BOARD:
        exists = db.query(ElectionBoardProfile).filter(ElectionBoardProfile.user_id == user_id).first()
        if not exists:
            db.add(ElectionBoardProfile(user_id=user_id))
    elif role == UserRole.AUDIT_AUTHORITY:
        exists = db.query(AuditAuthorityProfile).filter(AuditAuthorityProfile.user_id == user_id).first()
        if not exists:
            db.add(AuditAuthorityProfile(user_id=user_id))


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


def _generate_temporary_password(length: int = 14) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))
