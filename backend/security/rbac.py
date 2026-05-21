"""Simple RBAC helpers for API route protection."""

from functools import wraps

from flask import jsonify, request

from db import SessionLocal
from models.user import AccountStatus, User
from services.system_monitor_service import SYSTEM_STATE

ROLE_VOTER = "Voter"
ROLE_ELECTION_OFFICER = "ElectionOfficer"
ROLE_ELECTION_BOARD = "ElectionBoard"
ROLE_SYSTEM_ADMIN = "SystemAdmin"
ROLE_AUDIT_AUTHORITY = "AuditAuthority"


def current_role() -> str:
    """Return role from authenticated database user."""
    user, _err = _get_authenticated_user()
    return user.role.value if user else ""


def _get_authenticated_user() -> tuple[User | None, tuple | None]:
    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return None, (jsonify({"error": "x_user_id_required"}), 401)

    with SessionLocal() as db:
        user = db.get(User, int(user_id_raw))
        if not user:
            return None, (jsonify({"error": "user_not_found"}), 401)
        if user.account_status != AccountStatus.ACTIVE:
            return None, (jsonify({"error": "account_not_active"}), 403)
        _attach_user_to_request_scope(user)
        return user, None


def _attach_user_to_request_scope(user: User) -> None:
    """Store authenticated user snapshot in request environment for decorators."""
    request.environ["evoting.auth_user_id"] = str(user.id)
    request.environ["evoting.auth_user_role"] = user.role.value


def require_role(required_role: str):
    """Require a single role."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user, err = _get_authenticated_user()
            if err:
                return err
            role = user.role.value
            if role != required_role:
                return (
                    jsonify(
                        {
                            "error": "forbidden",
                            "message": f"{required_role} role required",
                        }
                    ),
                    403,
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_any_role(*allowed_roles: str):
    """Require one role from an allowed role list."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user, err = _get_authenticated_user()
            if err:
                return err
            role = user.role.value
            if role not in allowed_roles:
                return (
                    jsonify(
                        {
                            "error": "forbidden",
                            "message": f"One of roles {allowed_roles} required",
                        }
                    ),
                    403,
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_system_permission(required_permission: str):
    """Require SystemAdmin role and configured access level permission."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            role = request.environ.get("evoting.auth_user_role", "")
            if not role:
                user, err = _get_authenticated_user()
                if err:
                    return err
                role = user.role.value

            if role != ROLE_SYSTEM_ADMIN:
                return (
                    jsonify(
                        {
                            "error": "forbidden",
                            "message": "SystemAdmin role required",
                        }
                    ),
                    403,
                )

            allowed_permissions = SYSTEM_STATE.get("access_levels", {}).get(ROLE_SYSTEM_ADMIN, [])
            if required_permission not in allowed_permissions:
                return (
                    jsonify(
                        {
                            "error": "forbidden",
                            "message": (
                                f"missing_permission:{required_permission}. "
                                "Update System Settings access levels."
                            ),
                        }
                    ),
                    403,
                )

            return fn(*args, **kwargs)

        return wrapper

    return decorator
