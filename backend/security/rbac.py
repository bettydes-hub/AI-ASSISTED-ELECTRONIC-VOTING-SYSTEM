"""Simple RBAC helpers for API route protection."""

from functools import wraps

from flask import jsonify, request

ROLE_ELECTION_BOARD = "ElectionBoard"


def require_role(required_role: str):
    """Require caller role from headers for now.

    Temporary auth strategy for development:
    - send `X-Role: ElectionBoard` from frontend for protected board routes.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            role = request.headers.get("X-Role", "")
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
