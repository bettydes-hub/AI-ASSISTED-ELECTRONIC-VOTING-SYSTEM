from flask import Blueprint, jsonify, request
from sqlalchemy import delete

from helpers.datetime_iso import datetime_iso
from db import SessionLocal
from models.user import AccountStatus, User, UserRole
from models.election import Election
from models.candidate import Candidate
from models.political_party import PoliticalParty
from models.region import Region
from models.vote import Vote
from security.rbac import ROLE_ELECTION_BOARD, require_role
from services.vote_tally_service import tally_election

election_bp = Blueprint("elections", __name__)
ELECTION_SCOPES = frozenset({"NATIONAL", "REGIONAL"})


@election_bp.get("/elections")
@require_role(ROLE_ELECTION_BOARD)
def list_elections():
    with SessionLocal() as db:
        board_user, err = _get_authenticated_board(db)
        if err:
            return err
        elections = db.query(Election).order_by(Election.id.asc()).all()
        return jsonify({"board_user_id": board_user.id, "items": [_serialize_election(e) for e in elections]})


@election_bp.get("/elections/<int:election_id>")
@require_role(ROLE_ELECTION_BOARD)
def get_election(election_id: int):
    with SessionLocal() as db:
        board_user, err = _get_authenticated_board(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        response = _serialize_election(election)
        response["board_user_id"] = board_user.id
        response["results_approved"] = election.results_approved
        return jsonify(response)


@election_bp.post("/elections")
@require_role(ROLE_ELECTION_BOARD)
def create_election():
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip()
    election_type = (payload.get("election_type") or "PRESIDENTIAL").strip() or "PRESIDENTIAL"
    election_scope = (payload.get("election_scope") or "NATIONAL").strip().upper() or "NATIONAL"
    region_id = _parse_positive_int(payload.get("region_id"))
    if not title:
        return jsonify({"error": "title_required"}), 400
    if election_scope not in ELECTION_SCOPES:
        return jsonify({"error": "invalid_election_scope"}), 400

    with SessionLocal() as db:
        board_user, err = _get_authenticated_board(db)
        if err:
            return err
        if election_scope == "REGIONAL":
            if not region_id:
                return jsonify({"error": "region_required_for_regional_scope"}), 400
            if not db.get(Region, region_id):
                return jsonify({"error": "region_not_found"}), 404
        elif region_id and not db.get(Region, region_id):
            return jsonify({"error": "region_not_found"}), 404
        election = Election(
            title=title,
            description=description,
            election_type=election_type,
            election_scope=election_scope,
            region_id=region_id if election_scope == "REGIONAL" else None,
            status="DRAFT",
        )
        db.add(election)
        db.commit()
        db.refresh(election)
        response = _serialize_election(election)
        response["board_user_id"] = board_user.id
        return jsonify(response), 201


@election_bp.patch("/elections/<int:election_id>")
@require_role(ROLE_ELECTION_BOARD)
def update_election(election_id: int):
    payload = request.get_json(silent=True) or {}
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        if election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        title = payload.get("title")
        description = payload.get("description")
        election_type = payload.get("election_type")
        election_scope = payload.get("election_scope")
        region_id = payload.get("region_id")
        if isinstance(title, str) and title.strip():
            election.title = title.strip()
        if isinstance(description, str):
            election.description = description.strip()
        if isinstance(election_type, str):
            cleaned = election_type.strip()
            if cleaned:
                election.election_type = cleaned
        if isinstance(election_scope, str):
            scope = election_scope.strip().upper()
            if scope not in ELECTION_SCOPES:
                return jsonify({"error": "invalid_election_scope"}), 400
            election.election_scope = scope
            if scope == "NATIONAL":
                election.region_id = None
        if "region_id" in payload:
            parsed_region = _parse_positive_int(region_id)
            if parsed_region and not db.get(Region, parsed_region):
                return jsonify({"error": "region_not_found"}), 404
            election.region_id = parsed_region
        if election.election_scope == "REGIONAL" and not election.region_id:
            return jsonify({"error": "region_required_for_regional_scope"}), 400
        db.commit()
        return jsonify(_serialize_election(election))


@election_bp.patch("/elections/<int:election_id>/config")
@require_role(ROLE_ELECTION_BOARD)
def configure_election(election_id: int):
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        if election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        payload = request.get_json(silent=True) or {}
        rules = payload.get("rules") or {}
        schedule = payload.get("schedule") or {}
        participants = payload.get("participants") or {}

        eligibility = (rules.get("eligibility") or "").strip()
        ballot_format = (rules.get("ballot_format") or "").strip()
        minimum_candidate_age = _parse_optional_int(rules.get("minimum_candidate_age"))
        max_candidates_per_party = _parse_optional_int(rules.get("max_candidates_per_party"))
        election_scope = (payload.get("election_scope") or election.election_scope or "NATIONAL").strip().upper()
        region_id = _parse_positive_int(payload.get("region_id")) if "region_id" in payload else election.region_id
        if not eligibility or not ballot_format:
            return (
                jsonify(
                    {
                        "error": "rules_incomplete",
                        "message": "If rule information is incomplete, please correct and resubmit.",
                    }
                ),
                400,
            )
        if election_scope not in ELECTION_SCOPES:
            return jsonify({"error": "invalid_election_scope"}), 400
        if election_scope == "REGIONAL":
            if not region_id:
                return jsonify({"error": "region_required_for_regional_scope"}), 400
            if not db.get(Region, region_id):
                return jsonify({"error": "region_not_found"}), 404

        schedule_values = {
            "registration_start_at": _parse_datetime(schedule.get("registration_start_at")),
            "registration_end_at": _parse_datetime(schedule.get("registration_end_at")),
            "campaign_start_at": _parse_datetime(schedule.get("campaign_start_at")),
            "campaign_end_at": _parse_datetime(schedule.get("campaign_end_at")),
            "voting_at": _parse_datetime(schedule.get("voting_at")),
            "result_at": _parse_datetime(schedule.get("result_at")),
        }
        missing_keys = [key for key, value in schedule_values.items() if value is None]
        if missing_keys:
            return (
                jsonify(
                    {
                        "error": "schedule_incomplete",
                        "missing_fields": missing_keys,
                        "message": "Election cannot proceed until all schedule fields are provided.",
                    }
                ),
                400,
            )
        schedule_error = _validate_schedule_order(schedule_values)
        if schedule_error:
            return jsonify({"error": "invalid_schedule", "message": schedule_error}), 400

        allowed_party_ids_csv = _join_int_list(participants.get("allowed_party_ids"))
        allowed_party_ids = _split_csv_ints(allowed_party_ids_csv)
        if allowed_party_ids and election_scope == "REGIONAL":
            scoped_count = (
                db.query(PoliticalParty)
                .filter(
                    PoliticalParty.id.in_(allowed_party_ids),
                    PoliticalParty.scope_level == "REGIONAL",
                    PoliticalParty.region_id == region_id,
                )
                .count()
            )
            if scoped_count != len(allowed_party_ids):
                return jsonify({"error": "allowed_party_scope_mismatch"}), 400

        election.eligibility_rule = eligibility
        election.ballot_format = ballot_format
        election.election_scope = election_scope
        election.region_id = region_id if election_scope == "REGIONAL" else None
        election.minimum_candidate_age = minimum_candidate_age
        election.max_candidates_per_party = max_candidates_per_party
        election.positions = _join_list(participants.get("positions"))
        election.allowed_party_ids = allowed_party_ids_csv
        election.registration_start_at = schedule_values["registration_start_at"]
        election.registration_end_at = schedule_values["registration_end_at"]
        election.campaign_start_at = schedule_values["campaign_start_at"]
        election.campaign_end_at = schedule_values["campaign_end_at"]
        election.voting_at = schedule_values["voting_at"]
        election.start_at = schedule_values["voting_at"]
        election.end_at = schedule_values["voting_at"]
        election.result_at = schedule_values["result_at"]
        db.commit()
        return jsonify(_serialize_election(election))


@election_bp.post("/elections/<int:election_id>/activate")
@require_role(ROLE_ELECTION_BOARD)
def activate_election(election_id: int):
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
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
        linked_parties = (
            db.query(PoliticalParty)
            .join(Candidate, Candidate.party_id == PoliticalParty.id)
            .filter(Candidate.election_id == election_id)
            .count()
        )
        if linked_parties == 0:
            return jsonify({"error": "at_least_one_party_required"}), 400
        if not _schedule_has_required_fields(election):
            return jsonify({"error": "schedule_required"}), 400
        schedule_error = _validate_schedule_order(
            {
                "registration_start_at": election.registration_start_at,
                "registration_end_at": election.registration_end_at,
                "campaign_start_at": election.campaign_start_at,
                "campaign_end_at": election.campaign_end_at,
                "voting_at": election.voting_at,
                "result_at": election.result_at,
            }
        )
        if schedule_error:
            return jsonify({"error": "invalid_schedule", "message": schedule_error}), 400
        if not election.eligibility_rule or not election.ballot_format:
            return jsonify({"error": "rules_required"}), 400

        election.status = "ACTIVE"
        db.commit()
        return jsonify(_serialize_election(election))


@election_bp.post("/elections/<int:election_id>/close")
@require_role(ROLE_ELECTION_BOARD)
def close_election(election_id: int):
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
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
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        election = db.get(Election, election_id)
        if not election:
            return jsonify({"error": "not_found"}), 404
        if election.status != "DRAFT":
            return jsonify({"error": "only_draft_can_delete"}), 409

        db.execute(delete(Vote).where(Vote.election_id == election_id))
        db.delete(election)
        db.commit()
        return jsonify({"message": "deleted"})


@election_bp.get("/dashboard/election-board/summary")
@require_role(ROLE_ELECTION_BOARD)
def election_board_summary():
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        elections = db.query(Election).all()
        summary = {
            "total_elections": len(elections),
            "draft_elections": len([e for e in elections if e.status == "DRAFT"]),
            "active_elections": len([e for e in elections if e.status == "ACTIVE"]),
            "completed_elections": len([e for e in elections if e.status == "COMPLETED"]),
            "total_parties": db.query(PoliticalParty).count(),
            "total_candidates": db.query(Candidate).count(),
            "total_voters": db.query(User).filter(User.role == UserRole.VOTER).count(),
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


def _schedule_has_required_fields(election: Election) -> bool:
    return all(
        [
            election.registration_start_at,
            election.registration_end_at,
            election.campaign_start_at,
            election.campaign_end_at,
            election.voting_at,
            election.result_at,
        ]
    )


def _validate_schedule_order(schedule_values: dict) -> str | None:
    registration_start_at = schedule_values["registration_start_at"]
    registration_end_at = schedule_values["registration_end_at"]
    campaign_start_at = schedule_values["campaign_start_at"]
    campaign_end_at = schedule_values["campaign_end_at"]
    voting_at = schedule_values["voting_at"]
    result_at = schedule_values["result_at"]

    if registration_start_at >= registration_end_at:
        return "registration_start_at must be before registration_end_at"
    if registration_end_at > campaign_start_at:
        return "registration_end_at must be before or equal to campaign_start_at"
    if campaign_start_at > campaign_end_at:
        return "campaign_start_at must be before or equal to campaign_end_at"
    if campaign_end_at > voting_at:
        return "campaign_end_at must be before or equal to voting_at"
    if voting_at > result_at:
        return "voting_at must be before or equal to result_at"
    return None


def _parse_positive_int(value):
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
        return parsed if parsed > 0 else None
    except (TypeError, ValueError):
        return None


def _parse_optional_int(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _join_list(value) -> str:
    if not isinstance(value, list):
        return ""
    cleaned = [str(item).strip() for item in value if str(item).strip()]
    return ",".join(cleaned)


def _join_int_list(value) -> str:
    if not isinstance(value, list):
        return ""
    cleaned: list[str] = []
    for item in value:
        try:
            num = int(item)
        except (TypeError, ValueError):
            continue
        if num > 0:
            cleaned.append(str(num))
    return ",".join(cleaned)


def _split_csv_ints(value: str | None) -> list[int]:
    if not value:
        return []
    out: list[int] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if part.isdigit():
            out.append(int(part))
    return out


def _split_csv_strings(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _serialize_election(election: Election) -> dict:
    return {
        "id": election.id,
        "title": election.title,
        "description": election.description,
        "election_type": election.election_type,
        "election_scope": election.election_scope,
        "region_id": election.region_id,
        "status": election.status,
        "rules": {
            "eligibility": election.eligibility_rule,
            "ballot_format": election.ballot_format,
            "minimum_candidate_age": election.minimum_candidate_age,
            "max_candidates_per_party": election.max_candidates_per_party,
        },
        "participants": {
            "positions": _split_csv_strings(election.positions),
            "allowed_party_ids": _split_csv_ints(election.allowed_party_ids),
        },
        "schedule": {
            "registration_start_at": datetime_iso(election.registration_start_at),
            "registration_end_at": datetime_iso(election.registration_end_at),
            "campaign_start_at": datetime_iso(election.campaign_start_at),
            "campaign_end_at": datetime_iso(election.campaign_end_at),
            "voting_at": datetime_iso(election.voting_at),
            "start_at": datetime_iso(election.start_at),
            "end_at": datetime_iso(election.end_at),
            "result_at": datetime_iso(election.result_at),
        },
    }


def _get_authenticated_board(db):
    user_id_raw = request.headers.get("X-User-Id", "").strip()
    if not user_id_raw.isdigit():
        return None, (jsonify({"error": "x_user_id_required"}), 401)
    board_user = db.get(User, int(user_id_raw))
    if not board_user:
        return None, (jsonify({"error": "election_board_user_not_found"}), 401)
    if board_user.role != UserRole.ELECTION_BOARD:
        return None, (jsonify({"error": "election_board_role_required"}), 403)
    if board_user.account_status != AccountStatus.ACTIVE:
        return None, (jsonify({"error": "election_board_account_not_active"}), 403)
    return board_user, None
