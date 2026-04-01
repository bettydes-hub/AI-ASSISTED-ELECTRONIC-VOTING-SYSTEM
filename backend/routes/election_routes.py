from flask import Blueprint, jsonify, request

from db import SessionLocal
from models.election import Election
from models.candidate import Candidate
from models.political_party import PoliticalParty
from security.rbac import ROLE_ELECTION_BOARD, require_role
from services.vote_tally_service import tally_election

election_bp = Blueprint("elections", __name__)


@election_bp.get("/elections")
@require_role(ROLE_ELECTION_BOARD)
def list_elections():
    with SessionLocal() as db:
        elections = db.query(Election).order_by(Election.id.asc()).all()
        return jsonify(
            {
                "items": [
                    {
                        "id": e.id,
                        "title": e.title,
                        "description": e.description,
                        "status": e.status,
                        "rules": {
                            "eligibility": e.eligibility_rule,
                            "ballot_format": e.ballot_format,
                        },
                        "schedule": {
                            "start_at": e.start_at.isoformat() if e.start_at else None,
                            "end_at": e.end_at.isoformat() if e.end_at else None,
                        },
                    }
                    for e in elections
                ]
            }
        )


@election_bp.get("/elections/<int:election_id>")
@require_role(ROLE_ELECTION_BOARD)
def get_election(election_id: int):
    with SessionLocal() as db:
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        return jsonify(
            {
                "id": election.id,
                "title": election.title,
                "description": election.description,
                "status": election.status,
                "rules": {
                    "eligibility": election.eligibility_rule,
                    "ballot_format": election.ballot_format,
                },
                "schedule": {
                    "start_at": election.start_at.isoformat() if election.start_at else None,
                    "end_at": election.end_at.isoformat() if election.end_at else None,
                },
                "results_approved": election.results_approved,
            }
        )


@election_bp.post("/elections")
@require_role(ROLE_ELECTION_BOARD)
def create_election():
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip()
    if not title:
        return jsonify({"error": "title_required"}), 400

    with SessionLocal() as db:
        election = Election(title=title, description=description, status="DRAFT")
        db.add(election)
        db.commit()
        db.refresh(election)
        return (
            jsonify(
                {
                    "id": election.id,
                    "title": election.title,
                    "description": election.description,
                    "status": election.status,
                    "rules": {"eligibility": "", "ballot_format": ""},
                    "schedule": {"start_at": None, "end_at": None},
                }
            ),
            201,
        )


@election_bp.patch("/elections/<int:election_id>")
@require_role(ROLE_ELECTION_BOARD)
def update_election(election_id: int):
    payload = request.get_json(silent=True) or {}
    with SessionLocal() as db:
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        if election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        title = payload.get("title")
        description = payload.get("description")
        if isinstance(title, str) and title.strip():
            election.title = title.strip()
        if isinstance(description, str):
            election.description = description.strip()
        db.commit()
        return jsonify(
            {
                "id": election.id,
                "title": election.title,
                "description": election.description,
                "status": election.status,
            }
        )


@election_bp.patch("/elections/<int:election_id>/config")
@require_role(ROLE_ELECTION_BOARD)
def configure_election(election_id: int):
    with SessionLocal() as db:
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        if election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        payload = request.get_json(silent=True) or {}
        rules = payload.get("rules") or {}
        schedule = payload.get("schedule") or {}

        election.eligibility_rule = rules.get("eligibility", "")
        election.ballot_format = rules.get("ballot_format", "")
        election.start_at = _parse_datetime(schedule.get("start_at"))
        election.end_at = _parse_datetime(schedule.get("end_at"))
        db.commit()

        return jsonify(
            {
                "id": election.id,
                "title": election.title,
                "description": election.description,
                "status": election.status,
                "rules": {
                    "eligibility": election.eligibility_rule,
                    "ballot_format": election.ballot_format,
                },
                "schedule": {
                    "start_at": election.start_at.isoformat() if election.start_at else None,
                    "end_at": election.end_at.isoformat() if election.end_at else None,
                },
            }
        )


@election_bp.post("/elections/<int:election_id>/activate")
@require_role(ROLE_ELECTION_BOARD)
def activate_election(election_id: int):
    with SessionLocal() as db:
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404

        if election.status != "DRAFT":
            return jsonify({"error": "only_draft_can_activate"}), 409

        has_candidates = (
            db.query(Candidate).filter(Candidate.election_id == election_id).count() > 0
        )
        if not has_candidates:
            return jsonify({"error": "at_least_one_candidate_required"}), 400
        if not election.start_at or not election.end_at:
            return jsonify({"error": "schedule_required"}), 400
        if not election.eligibility_rule or not election.ballot_format:
            return jsonify({"error": "rules_required"}), 400

        election.status = "ACTIVE"
        db.commit()
        return jsonify(
            {
                "id": election.id,
                "title": election.title,
                "description": election.description,
                "status": election.status,
                "rules": {
                    "eligibility": election.eligibility_rule,
                    "ballot_format": election.ballot_format,
                },
                "schedule": {
                    "start_at": election.start_at.isoformat() if election.start_at else None,
                    "end_at": election.end_at.isoformat() if election.end_at else None,
                },
            }
        )


@election_bp.post("/elections/<int:election_id>/close")
@require_role(ROLE_ELECTION_BOARD)
def close_election(election_id: int):
    with SessionLocal() as db:
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        if election.status != "ACTIVE":
            return jsonify({"error": "only_active_can_close"}), 409

        election.status = "COMPLETED"
        election.results_approved = False
        election.approved_by = None
        election.approved_at = None
        db.commit()
        rows = tally_election(db, election_id)

        return jsonify(
            {
                "election": {
                    "id": election.id,
                    "title": election.title,
                    "status": election.status,
                },
                "results": rows,
            }
        )


@election_bp.delete("/elections/<int:election_id>")
@require_role(ROLE_ELECTION_BOARD)
def delete_election(election_id: int):
    with SessionLocal() as db:
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        if election.status != "DRAFT":
            return jsonify({"error": "only_draft_can_delete"}), 409

        db.delete(election)
        db.commit()
        return jsonify({"message": "deleted"})


@election_bp.get("/dashboard/election-board/summary")
@require_role(ROLE_ELECTION_BOARD)
def election_board_summary():
    with SessionLocal() as db:
        elections = db.query(Election).all()
        summary = {
            "total_elections": len(elections),
            "draft_elections": len([e for e in elections if e.status == "DRAFT"]),
            "active_elections": len([e for e in elections if e.status == "ACTIVE"]),
            "completed_elections": len([e for e in elections if e.status == "COMPLETED"]),
            "total_parties": db.query(PoliticalParty).count(),
            "total_candidates": db.query(Candidate).count(),
        }
        return jsonify(summary)


def _parse_datetime(value: str | None):
    if not value:
        return None
    # Handles datetime-local from frontend (e.g. 2026-03-26T10:30)
    normalized = value.replace("Z", "+00:00")
    try:
        from datetime import datetime

        return datetime.fromisoformat(normalized)
    except ValueError:
        return None
