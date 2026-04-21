"""Simple RBAC helpers for API route protection."""

from functools import wraps

from flask import jsonify, request

ROLE_VOTER = "Voter"
ROLE_ELECTION_OFFICER = "ElectionOfficer"
ROLE_ELECTION_BOARD = "ElectionBoard"
ROLE_SYSTEM_ADMIN = "SystemAdmin"
ROLE_AUDIT_AUTHORITY = "AuditAuthority"


def current_role() -> str:
    """Return role from request header for current development stage."""
    return request.headers.get("X-Role", "").strip()


def require_role(required_role: str):
    """Require a single role."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            role = current_role()
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
            role = current_role()
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
