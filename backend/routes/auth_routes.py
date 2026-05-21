from datetime import datetime

from flask import Blueprint, jsonify, request

from db import SessionLocal
from models.system_admin_profile import SystemAdminProfile
from models.user import AccountStatus, User, UserRole
from security.auth import hash_password, verify_password
from security.rbac import require_any_role

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username_password_required"}), 400

    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            return jsonify({"error": "invalid_credentials"}), 401
        if user.account_status != AccountStatus.ACTIVE:
            return jsonify({"error": "account_not_active"}), 403
        if not verify_password(password, user.password_hash):
            return jsonify({"error": "invalid_credentials"}), 401

        # Dev token strategy for this phase.
        token = f"{user.role.value}:{user.id}"
        return jsonify(
            {
                "token": token,
                "user": {
                    "id": user.id,
                    "full_name": user.full_name,
                    "username": user.username,
                    "role": user.role.value,
                    "account_status": user.account_status.value,
                    "must_change_password": user.must_change_password,
                },
            }
        )


@auth_bp.post("/auth/logout")
def logout():
    return jsonify({"message": "logged_out"})


@auth_bp.get("/auth/setup/status")
def setup_status():
    with SessionLocal() as db:
        has_system_admin = (
            db.query(User.id).filter(User.role == UserRole.SYSTEM_ADMIN).first() is not None
        )
        return jsonify({"needs_first_setup": not has_system_admin})


@auth_bp.post("/auth/setup/first-admin")
def setup_first_admin():
    payload = request.get_json(silent=True) or {}
    required = ["full_name", "national_id", "contact_info", "username", "password"]
    if not all(payload.get(key) for key in required):
        return jsonify({"error": "missing_required_fields"}), 400

    national_id = (payload.get("national_id") or "").strip()
    if not _is_valid_national_id(national_id):
        return jsonify({"error": "invalid_national_id"}), 400

    with SessionLocal() as db:
        has_system_admin = (
            db.query(User.id).filter(User.role == UserRole.SYSTEM_ADMIN).first() is not None
        )
        if has_system_admin:
            return jsonify({"error": "first_setup_already_completed"}), 409
        if db.query(User).filter(User.username == payload["username"].strip()).first():
            return jsonify({"error": "username_exists"}), 409
        if db.query(User).filter(User.national_id == national_id).first():
            return jsonify({"error": "national_id_exists"}), 409

        admin_user = User(
            full_name=payload["full_name"].strip(),
            national_id=national_id,
            contact_info=payload["contact_info"].strip(),
            username=payload["username"].strip(),
            password_hash=hash_password(payload["password"]),
            role=UserRole.SYSTEM_ADMIN,
            account_status=AccountStatus.ACTIVE,
        )
        db.add(admin_user)
        db.flush()
        db.add(SystemAdminProfile(user_id=admin_user.id))
        db.commit()
        return (
            jsonify(
                {
                    "message": "first_admin_created",
                    "user": {
                        "id": admin_user.id,
                        "full_name": admin_user.full_name,
                        "username": admin_user.username,
                        "role": admin_user.role.value,
                    },
                }
            ),
            201,
        )


@auth_bp.get("/auth/me")
@require_any_role("Voter", "ElectionOfficer", "ElectionBoard", "SystemAdmin", "AuditAuthority")
def me():
    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return jsonify({"error": "x_user_id_required"}), 400

    with SessionLocal() as db:
        user = db.get(User, int(user_id_raw))
        if not user:
            return jsonify({"error": "user_not_found"}), 404
        return jsonify(
            {
                "id": user.id,
                "full_name": user.full_name,
                "username": user.username,
                "role": user.role.value,
                "account_status": user.account_status.value,
                "must_change_password": user.must_change_password,
            }
        )


@auth_bp.post("/auth/change-password")
@require_any_role("Voter", "ElectionOfficer", "ElectionBoard", "SystemAdmin", "AuditAuthority")
def change_password():
    payload = request.get_json(silent=True) or {}
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    if not current_password or not new_password:
        return jsonify({"error": "current_and_new_password_required"}), 400
    if len(str(new_password)) < 8:
        return jsonify({"error": "weak_password"}), 400

    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return jsonify({"error": "x_user_id_required"}), 400

    with SessionLocal() as db:
        user = db.get(User, int(user_id_raw))
        if not user:
            return jsonify({"error": "user_not_found"}), 404
        if not verify_password(current_password, user.password_hash):
            return jsonify({"error": "invalid_current_password"}), 401
        if verify_password(new_password, user.password_hash):
            return jsonify({"error": "password_reuse_not_allowed"}), 400

        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        user.password_changed_at = datetime.utcnow()
        db.commit()
        return jsonify({"message": "password_changed"})


def _is_valid_national_id(value: str) -> bool:
    if len(value) < 5 or len(value) > 50:
        return False
    return any(ch.isalnum() for ch in value)
