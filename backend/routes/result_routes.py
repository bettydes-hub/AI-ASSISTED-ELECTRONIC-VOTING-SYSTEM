from flask import Blueprint, jsonify, request

from db import SessionLocal
from security.rbac import ROLE_ELECTION_BOARD, require_role
from services.result_service import approve_results, get_results

result_bp = Blueprint("results", __name__)


@result_bp.get("/results/<int:election_id>")
@require_role(ROLE_ELECTION_BOARD)
def view_results(election_id: int):
    with SessionLocal() as db:
        result = get_results(db, election_id)
        if not result:
            return jsonify({"error": "results_not_found"}), 404
        return jsonify(result)


@result_bp.post("/results/<int:election_id>/approve")
@require_role(ROLE_ELECTION_BOARD)
def approve_results_route(election_id: int):
    payload = request.get_json(silent=True) or {}
    approved_by = (payload.get("approved_by") or "ElectionBoard").strip()
    with SessionLocal() as db:
        try:
            result = approve_results(db, election_id, approved_by)
        except ValueError as exc:
            key = str(exc)
            status = 404 if key == "results_not_found" else 409
            return jsonify({"error": key}), status
        return jsonify(result)
