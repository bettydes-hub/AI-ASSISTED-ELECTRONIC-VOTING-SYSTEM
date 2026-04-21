from __future__ import annotations

import shutil
from datetime import date, datetime
from pathlib import Path

from flask import Blueprint, jsonify, request
from helpers.datetime_iso import datetime_iso
from db import SessionLocal
from models.candidate import Candidate
from models.election import Election
from models.political_party import PoliticalParty
from models.region import Region
from models.user import AccountStatus, User, UserRole
from security.rbac import ROLE_ELECTION_BOARD, require_role
from services.party_file_service import (
    party_upload_dir,
    save_leader_image,
    save_party_logo,
    save_supporting_document,
)
from services.candidate_file_service import candidate_upload_dir, save_candidate_photo

candidate_party_bp = Blueprint("candidate_party", __name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
OPERATIONAL_STATUSES = frozenset({"ACTIVE", "SUSPENDED", "BANNED"})
APPROVAL_STATUSES = frozenset({"PENDING", "APPROVED", "REJECTED"})
CANDIDATE_STATUSES = frozenset({"PENDING", "APPROVED", "REJECTED"})
SCOPE_LEVELS = frozenset({"NATIONAL", "REGIONAL"})


def _party_payload_and_files() -> tuple[dict, dict | None]:
    ct = (request.content_type or "").lower()
    if "multipart/form-data" in ct:
        return request.form.to_dict(flat=True), request.files
    return request.get_json(silent=True) or {}, None


def _strip_opt(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    s = value.strip()
    return s or None


def _strip_str(value: object, default: str = "") -> str:
    if value is None:
        return default
    if not isinstance(value, str):
        return default
    return value.strip()


def _parse_party_datetime(value: object) -> datetime | None:
    s = _strip_opt(value)
    if not s:
        return None
    normalized = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _parse_election_year(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value if 1900 <= value <= 2100 else None
    s = str(value).strip()
    if not s.isdigit():
        return None
    y = int(s)
    return y if 1900 <= y <= 2100 else None


def _serialize_party(party: PoliticalParty) -> dict:
    def file_url(path: str | None) -> str | None:
        if not path:
            return None
        base = Path(path).name
        return f"/api/party-files/{party.id}/{base}"

    return {
        "id": party.id,
        "name": party.name,
        "scope_level": party.scope_level,
        "region_id": party.region_id,
        "abbreviation": party.abbreviation,
        "description": party.description,
        "mission": party.mission,
        "vision": party.vision,
        "headquarters_address": party.headquarters_address,
        "logo_path": party.logo_path,
        "logo_url": file_url(party.logo_path),
        "party_registered_at": datetime_iso(party.party_registered_at),
        "operational_status": party.operational_status,
        "leader_name": party.leader_name,
        "deputy_leader_name": party.deputy_leader_name,
        "leader_phone": party.leader_phone,
        "leader_email": party.leader_email,
        "leader_image_path": party.leader_image_path,
        "leader_image_url": file_url(party.leader_image_path),
        "registration_number": party.registration_number,
        "approval_status": party.approval_status,
        "supporting_document_path": party.supporting_document_path,
        "supporting_document_url": file_url(party.supporting_document_path),
        "regions": party.regions,
        "election_year": party.election_year,
        "created_at": datetime_iso(party.created_at),
        "updated_at": datetime_iso(party.updated_at),
        "created_by_user_id": party.created_by_user_id,
    }


def _registration_number_taken(db, registration_number: str | None, exclude_party_id: int | None) -> bool:
    if not registration_number:
        return False
    q = db.query(PoliticalParty).filter(PoliticalParty.registration_number == registration_number)
    if exclude_party_id is not None:
        q = q.filter(PoliticalParty.id != exclude_party_id)
    return q.first() is not None


def _apply_uploads(party_id: int, files: dict | None) -> tuple[str | None, str | None, str | None]:
    """Returns (error_code, None, None) on failure."""
    if not files:
        return None, None, None
    logo_path = leader_path = doc_path = None
    try:
        if files.get("party_logo"):
            logo_path = save_party_logo(BACKEND_DIR, party_id, files["party_logo"])
        if files.get("leader_image"):
            leader_path = save_leader_image(BACKEND_DIR, party_id, files["leader_image"])
        if files.get("supporting_document"):
            doc_path = save_supporting_document(BACKEND_DIR, party_id, files["supporting_document"])
    except ValueError as exc:
        code = str(exc.args[0]) if exc.args else "upload_failed"
        return code, None, None
    return None, logo_path, leader_path, doc_path


def _set_party_scalar_fields(
    db,
    party: PoliticalParty,
    data: dict,
    *,
    is_create: bool,
    board_user_id: int | None,
) -> str | None:
    """Returns error code or None. For updates, only keys present in ``data`` are applied."""
    partial = not is_create

    def take(key: str) -> bool:
        return (not partial) or (key in data)

    name = _strip_str(data.get("name"))
    if is_create and not name:
        return "name_required"
    if not is_create and take("name") and name:
        party.name = name

    reg = _strip_opt(data.get("registration_number"))
    if is_create:
        if not reg:
            return "registration_number_required"
        party.registration_number = reg

    if take("operational_status"):
        op = _strip_opt(data.get("operational_status"))
        if op:
            op_u = op.upper()
            if op_u not in OPERATIONAL_STATUSES:
                return "invalid_operational_status"
            party.operational_status = op_u
        elif not partial:
            party.operational_status = "ACTIVE"

    if take("scope_level"):
        raw_scope = _strip_opt(data.get("scope_level")) or ("NATIONAL" if is_create else None)
        if raw_scope:
            scope = raw_scope.upper()
            if scope not in SCOPE_LEVELS:
                return "invalid_scope_level"
            party.scope_level = scope

    if take("region_id") or (not partial and party.scope_level == "REGIONAL"):
        region_id = _parse_positive_int(data.get("region_id"))
        if party.scope_level == "REGIONAL":
            if not region_id:
                return "region_required_for_regional_scope"
            if not db.get(Region, region_id):
                return "region_not_found"
            party.region_id = region_id
        elif take("region_id"):
            if region_id and not db.get(Region, region_id):
                return "region_not_found"
            party.region_id = region_id

    if take("approval_status"):
        ap = _strip_opt(data.get("approval_status"))
        if ap:
            ap_u = ap.upper()
            if ap_u not in APPROVAL_STATUSES:
                return "invalid_approval_status"
            party.approval_status = ap_u
        elif not partial:
            party.approval_status = "PENDING"

    if take("abbreviation"):
        party.abbreviation = _strip_opt(data.get("abbreviation"))
    if take("description"):
        party.description = _strip_str(data.get("description"))
    if take("mission"):
        party.mission = _strip_str(data.get("mission"))
    if take("vision"):
        party.vision = _strip_str(data.get("vision"))
    if take("headquarters_address"):
        party.headquarters_address = _strip_str(data.get("headquarters_address"))
    if take("leader_name"):
        party.leader_name = _strip_str(data.get("leader_name"))
    if take("deputy_leader_name"):
        party.deputy_leader_name = _strip_str(data.get("deputy_leader_name"))
    if take("leader_phone"):
        party.leader_phone = _strip_str(data.get("leader_phone"))
    if take("leader_email"):
        party.leader_email = _strip_str(data.get("leader_email"))
    if take("regions"):
        party.regions = _strip_str(data.get("regions"))

    if take("party_registered_at"):
        raw = data.get("party_registered_at")
        pr = _parse_party_datetime(raw)
        if pr is not None or (isinstance(raw, str) and not raw.strip()):
            party.party_registered_at = pr

    if take("election_year"):
        party.election_year = _parse_election_year(data.get("election_year"))

    if is_create:
        party.created_by_user_id = board_user_id

    return None


@candidate_party_bp.get("/parties")
@require_role(ROLE_ELECTION_BOARD)
def list_parties():
    election_id_raw = request.args.get("election_id")
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        query = db.query(PoliticalParty).order_by(PoliticalParty.id.asc())
        if election_id_raw:
            if not election_id_raw.isdigit():
                return jsonify({"error": "invalid_election_id"}), 400
            election = db.get(Election, int(election_id_raw))
            if not election:
                return jsonify({"error": "election_not_found"}), 404
            if (election.election_scope or "NATIONAL").upper() == "REGIONAL":
                query = query.filter(
                    PoliticalParty.scope_level == "REGIONAL",
                    PoliticalParty.region_id == election.region_id,
                )
        parties = query.all()
        return jsonify({"items": [_serialize_party(p) for p in parties]})


@candidate_party_bp.get("/regions")
@require_role(ROLE_ELECTION_BOARD)
def list_regions():
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        rows = db.query(Region).order_by(Region.name.asc()).all()
        return jsonify({"items": [{"id": r.id, "name": r.name} for r in rows]})


@candidate_party_bp.post("/regions")
@require_role(ROLE_ELECTION_BOARD)
def create_region():
    payload = request.get_json(silent=True) or {}
    name = _strip_str(payload.get("name"))
    if not name:
        return jsonify({"error": "region_name_required"}), 400
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        exists = db.query(Region).filter(Region.name.ilike(name)).first()
        if exists:
            return jsonify({"error": "region_exists", "id": exists.id, "name": exists.name}), 409
        region = Region(name=name)
        db.add(region)
        db.commit()
        db.refresh(region)
        return jsonify({"id": region.id, "name": region.name}), 201


@candidate_party_bp.delete("/regions/<int:region_id>")
@require_role(ROLE_ELECTION_BOARD)
def delete_region(region_id: int):
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        region = db.get(Region, region_id)
        if not region:
            return jsonify({"error": "region_not_found"}), 404

        linked_elections = db.query(Election).filter(Election.region_id == region_id).count()
        linked_parties = db.query(PoliticalParty).filter(PoliticalParty.region_id == region_id).count()
        linked_candidates = db.query(Candidate).filter(Candidate.region_id == region_id).count()
        if linked_elections or linked_parties or linked_candidates:
            return (
                jsonify(
                    {
                        "error": "region_in_use",
                        "usage": {
                            "elections": linked_elections,
                            "parties": linked_parties,
                            "candidates": linked_candidates,
                        },
                    }
                ),
                409,
            )

        db.delete(region)
        db.commit()
        return jsonify({"message": "deleted", "id": region_id})


@candidate_party_bp.get("/parties/<int:party_id>")
@require_role(ROLE_ELECTION_BOARD)
def get_party(party_id: int):
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        party = db.get(PoliticalParty, party_id)
        if not party:
            return jsonify({"error": "party_not_found"}), 404
        return jsonify(_serialize_party(party))


@candidate_party_bp.post("/parties")
@require_role(ROLE_ELECTION_BOARD)
def create_party():
    data, files = _party_payload_and_files()
    name = _strip_str(data.get("name"))
    if not name:
        return jsonify({"error": "name_required"}), 400
    reg = _strip_opt(data.get("registration_number"))
    if not reg:
        return jsonify({"error": "registration_number_required"}), 400

    with SessionLocal() as db:
        board_user, err = _get_authenticated_board(db)
        if err:
            return err
        if db.query(PoliticalParty).filter(PoliticalParty.name.ilike(name)).first():
            return jsonify({"error": "party_name_exists"}), 409
        if _registration_number_taken(db, reg, None):
            return jsonify({"error": "registration_number_exists"}), 409

        party = PoliticalParty(name=name)
        field_err = _set_party_scalar_fields(
            db, party, data, is_create=True, board_user_id=board_user.id if board_user else None
        )
        if field_err:
            return jsonify({"error": field_err}), 400

        db.add(party)
        try:
            db.flush()
            pid = party.id
            up_err, logo_path, leader_path, doc_path = _apply_uploads(pid, files)
            if up_err:
                db.rollback()
                shutil.rmtree(party_upload_dir(BACKEND_DIR, pid), ignore_errors=True)
                return jsonify({"error": up_err}), 400
            if logo_path:
                party.logo_path = logo_path
            if leader_path:
                party.leader_image_path = leader_path
            if doc_path:
                party.supporting_document_path = doc_path
            db.commit()
            db.refresh(party)
        except Exception:
            db.rollback()
            raise

        return jsonify(_serialize_party(party)), 201


@candidate_party_bp.patch("/parties/<int:party_id>")
@require_role(ROLE_ELECTION_BOARD)
def update_party(party_id: int):
    data, files = _party_payload_and_files()
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        party = db.get(PoliticalParty, party_id)
        if not party:
            return jsonify({"error": "party_not_found"}), 404
        if _party_linked_to_active_election(db, party_id):
            return jsonify({"error": "editing_locked_after_activation"}), 409

        if isinstance(data.get("name"), str) and data.get("name", "").strip():
            other = (
                db.query(PoliticalParty)
                .filter(PoliticalParty.name.ilike(data["name"].strip()), PoliticalParty.id != party_id)
                .first()
            )
            if other:
                return jsonify({"error": "party_name_exists"}), 409

        reg = _strip_opt(data.get("registration_number")) if "registration_number" in data else party.registration_number
        if "registration_number" in data:
            if reg and _registration_number_taken(db, reg, party_id):
                return jsonify({"error": "registration_number_exists"}), 409
            party.registration_number = reg

        field_err = _set_party_scalar_fields(db, party, data, is_create=False, board_user_id=None)
        if field_err:
            return jsonify({"error": field_err}), 400

        try:
            up_err, logo_path, leader_path, doc_path = _apply_uploads(party_id, files)
            if up_err:
                return jsonify({"error": up_err}), 400
            if logo_path:
                party.logo_path = logo_path
            if leader_path:
                party.leader_image_path = leader_path
            if doc_path:
                party.supporting_document_path = doc_path
            party.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(party)
        except Exception:
            db.rollback()
            raise

        return jsonify(_serialize_party(party))


@candidate_party_bp.delete("/parties/<int:party_id>")
@require_role(ROLE_ELECTION_BOARD)
def delete_party(party_id: int):
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        party = db.get(PoliticalParty, party_id)
        if not party:
            return jsonify({"error": "party_not_found"}), 404
        if _party_linked_to_active_election(db, party_id):
            return jsonify({"error": "editing_locked_after_activation"}), 409

        linked_candidates = db.query(Candidate).filter(Candidate.party_id == party_id).count()
        if linked_candidates > 0:
            return jsonify({"error": "party_has_linked_candidates"}), 409
        db.delete(party)
        db.commit()
    shutil.rmtree(party_upload_dir(BACKEND_DIR, party_id), ignore_errors=True)
    return jsonify({"message": "deleted"})


def _candidate_payload_and_files() -> tuple[dict, dict | None]:
    ct = (request.content_type or "").lower()
    if "multipart/form-data" in ct:
        return request.form.to_dict(flat=True), request.files
    return request.get_json(silent=True) or {}, None


def _parse_date(value: object) -> date | None:
    s = _strip_opt(value)
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _parse_int_range(value: object, minimum: int, maximum: int) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value if minimum <= value <= maximum else None
    s = str(value).strip()
    if not s.isdigit():
        return None
    num = int(s)
    return num if minimum <= num <= maximum else None


def _parse_positive_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    s = str(value).strip()
    if not s.isdigit():
        return None
    num = int(s)
    return num if num > 0 else None


def _candidate_photo_url(candidate: Candidate) -> str | None:
    if not candidate.photo_path:
        return None
    base = Path(candidate.photo_path).name
    return f"/api/candidate-files/{candidate.id}/{base}"


def _serialize_candidate(candidate: Candidate) -> dict:
    return {
        "id": candidate.id,
        "name": candidate.name,
        "party_id": candidate.party_id,
        "election_id": candidate.election_id,
        "profile_info": candidate.profile_info,
        "gender": candidate.gender,
        "date_of_birth": datetime_iso(candidate.date_of_birth),
        "age": candidate.age,
        "phone_number": candidate.phone_number,
        "email_address": candidate.email_address,
        "running_position": candidate.running_position,
        "election_year": candidate.election_year,
        "region_id": candidate.region_id,
        "region_district": candidate.region_district,
        "photo_path": candidate.photo_path,
        "photo_url": _candidate_photo_url(candidate),
        "candidate_status": candidate.candidate_status,
    }


def _set_candidate_fields(candidate: Candidate, payload: dict, *, is_create: bool) -> str | None:
    partial = not is_create

    def take(key: str) -> bool:
        return (not partial) or (key in payload)

    if take("name"):
        name_value = _strip_str(payload.get("name"))
        if not name_value and is_create:
            return "name_required"
        if name_value:
            candidate.name = name_value

    if take("profile_info"):
        profile = _strip_str(payload.get("profile_info"))
        if not profile and is_create:
            return "candidate_profile_required"
        candidate.profile_info = profile

    if take("gender"):
        gender = _strip_opt(payload.get("gender"))
        candidate.gender = gender
    if take("phone_number"):
        candidate.phone_number = _strip_str(payload.get("phone_number"))
    if take("email_address"):
        candidate.email_address = _strip_str(payload.get("email_address"))
    if take("running_position"):
        position = _strip_str(payload.get("running_position"))
        if not position and is_create:
            return "candidate_running_position_required"
        candidate.running_position = position
    if take("region_district"):
        candidate.region_district = _strip_str(payload.get("region_district"))
    if take("region_id"):
        candidate.region_id = _parse_positive_int(payload.get("region_id"))

    if take("date_of_birth"):
        raw = payload.get("date_of_birth")
        parsed = _parse_date(raw)
        if parsed is not None or (isinstance(raw, str) and not raw.strip()):
            candidate.date_of_birth = parsed
    if take("age"):
        candidate.age = _parse_int_range(payload.get("age"), 18, 130)
    if take("election_year"):
        candidate.election_year = _parse_int_range(payload.get("election_year"), 1900, 2100)

    if take("candidate_status"):
        status = _strip_opt(payload.get("candidate_status"))
        if status:
            status_u = status.upper()
            if status_u not in CANDIDATE_STATUSES:
                return "invalid_candidate_status"
            candidate.candidate_status = status_u
        elif is_create:
            candidate.candidate_status = "PENDING"
    elif is_create:
        candidate.candidate_status = "PENDING"

    return None


def _apply_candidate_photo(candidate_id: int, files: dict | None) -> tuple[str | None, str | None]:
    if not files:
        return None, None
    try:
        if files.get("photo"):
            return None, save_candidate_photo(BACKEND_DIR, candidate_id, files["photo"])
    except ValueError as exc:
        return str(exc.args[0]) if exc.args else "upload_failed", None
    return None, None


def _scope_mismatch_error(election: Election, party: PoliticalParty, candidate_region_id: int | None) -> str | None:
    election_scope = (election.election_scope or "NATIONAL").upper()
    party_scope = (party.scope_level or "NATIONAL").upper()
    if election_scope != party_scope:
        return "party_scope_mismatch"
    if election_scope == "REGIONAL":
        if not election.region_id:
            return "election_region_required_for_regional_scope"
        if party.region_id != election.region_id:
            return "party_region_mismatch"
        if candidate_region_id and candidate_region_id != election.region_id:
            return "candidate_region_mismatch"
        return None
    return None


def _csv_ints(raw: str | None) -> list[int]:
    if not raw:
        return []
    out: list[int] = []
    for piece in raw.split(","):
        piece = piece.strip()
        if piece.isdigit():
            out.append(int(piece))
    return out


@candidate_party_bp.get("/candidates")
@require_role(ROLE_ELECTION_BOARD)
def list_candidates():
    election_id_raw = request.args.get("election_id")
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        query = db.query(Candidate).order_by(Candidate.id.asc())
        if election_id_raw:
            if not election_id_raw.isdigit():
                return jsonify({"error": "invalid_election_id"}), 400
            query = query.filter(Candidate.election_id == int(election_id_raw))
        rows = query.all()
        return jsonify({"items": [_serialize_candidate(c) for c in rows]})


@candidate_party_bp.post("/candidates")
@require_role(ROLE_ELECTION_BOARD)
def create_candidate():
    payload, files = _candidate_payload_and_files()
    name = (payload.get("name") or "").strip()
    election_id = payload.get("election_id")
    party_id = payload.get("party_id")

    if not name or election_id is None or party_id is None:
        return jsonify({"error": "name_election_party_required"}), 400
    try:
        election_id_int = int(election_id)
        party_id_int = int(party_id)
    except (TypeError, ValueError):
        return jsonify({"error": "name_election_party_required"}), 400

    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        election = db.get(Election, election_id_int)
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        if election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409
        party = db.get(PoliticalParty, party_id_int)
        if not party:
            return jsonify({"error": "party_not_found"}), 404

        duplicate = (
            db.query(Candidate)
            .filter(Candidate.election_id == election_id_int, Candidate.name.ilike(name))
            .first()
        )
        if duplicate:
            return jsonify({"error": "candidate_name_exists_in_election"}), 409

        candidate = Candidate(
            name=name,
            party_id=party_id_int,
            election_id=election_id_int,
        )
        field_err = _set_candidate_fields(candidate, payload, is_create=True)
        if field_err:
            return jsonify({"error": field_err}), 400
        scope_err = _scope_mismatch_error(election, party, candidate.region_id)
        if scope_err:
            return jsonify({"error": scope_err}), 400
        allowed_party_ids = _csv_ints(getattr(election, "allowed_party_ids", ""))
        if allowed_party_ids and party_id_int not in allowed_party_ids:
            return jsonify({"error": "party_not_allowed_for_election"}), 400
        if election.minimum_candidate_age and candidate.age and candidate.age < election.minimum_candidate_age:
            return jsonify({"error": "minimum_candidate_age_not_met"}), 400
        if election.max_candidates_per_party:
            existing_count = (
                db.query(Candidate)
                .filter(Candidate.election_id == election_id_int, Candidate.party_id == party_id_int)
                .count()
            )
            if existing_count >= election.max_candidates_per_party:
                return jsonify({"error": "max_candidates_per_party_reached"}), 400
        if (election.election_scope or "NATIONAL").upper() == "REGIONAL":
            candidate.region_id = election.region_id
        db.add(candidate)
        try:
            db.flush()
            upload_err, photo_path = _apply_candidate_photo(candidate.id, files)
            if upload_err:
                db.rollback()
                shutil.rmtree(candidate_upload_dir(BACKEND_DIR, candidate.id), ignore_errors=True)
                return jsonify({"error": upload_err}), 400
            if photo_path:
                candidate.photo_path = photo_path
            db.commit()
            db.refresh(candidate)
        except Exception:
            db.rollback()
            raise

        return jsonify(_serialize_candidate(candidate)), 201


@candidate_party_bp.patch("/candidates/<int:candidate_id>")
@require_role(ROLE_ELECTION_BOARD)
def update_candidate(candidate_id: int):
    payload, files = _candidate_payload_and_files()
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        candidate = db.get(Candidate, candidate_id)
        if not candidate:
            return jsonify({"error": "candidate_not_found"}), 404

        election = db.get(Election, candidate.election_id)
        if election and election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        party_id = payload.get("party_id")

        if isinstance(payload.get("name"), str) and payload.get("name", "").strip():
            duplicate = (
                db.query(Candidate)
                .filter(
                    Candidate.election_id == candidate.election_id,
                    Candidate.name.ilike(payload["name"].strip()),
                    Candidate.id != candidate_id,
                )
                .first()
            )
            if duplicate:
                return jsonify({"error": "candidate_name_exists_in_election"}), 409

        if party_id is not None:
            try:
                party_id_int = int(party_id)
            except (TypeError, ValueError):
                return jsonify({"error": "party_not_found"}), 404
            party = db.get(PoliticalParty, party_id_int)
            if not party:
                return jsonify({"error": "party_not_found"}), 404
            candidate.party_id = party_id_int
        else:
            party = db.get(PoliticalParty, candidate.party_id)
            if not party:
                return jsonify({"error": "party_not_found"}), 404

        field_err = _set_candidate_fields(candidate, payload, is_create=False)
        if field_err:
            return jsonify({"error": field_err}), 400
        if election and party:
            scope_err = _scope_mismatch_error(election, party, candidate.region_id)
            if scope_err:
                return jsonify({"error": scope_err}), 400
            if (election.election_scope or "NATIONAL").upper() == "REGIONAL":
                candidate.region_id = election.region_id

        try:
            upload_err, photo_path = _apply_candidate_photo(candidate_id, files)
            if upload_err:
                return jsonify({"error": upload_err}), 400
            if photo_path:
                candidate.photo_path = photo_path
            db.commit()
            db.refresh(candidate)
        except Exception:
            db.rollback()
            raise

        return jsonify(_serialize_candidate(candidate))


@candidate_party_bp.delete("/candidates/<int:candidate_id>")
@require_role(ROLE_ELECTION_BOARD)
def delete_candidate(candidate_id: int):
    with SessionLocal() as db:
        _board_user, err = _get_authenticated_board(db)
        if err:
            return err
        candidate = db.get(Candidate, candidate_id)
        if not candidate:
            return jsonify({"error": "candidate_not_found"}), 404

        election = db.get(Election, candidate.election_id)
        if election and election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        db.delete(candidate)
        db.commit()
    shutil.rmtree(candidate_upload_dir(BACKEND_DIR, candidate_id), ignore_errors=True)
    return jsonify({"message": "deleted"})


def _party_linked_to_active_election(db, party_id: int) -> bool:
    return (
        db.query(Candidate)
        .join(Election, Election.id == Candidate.election_id)
        .filter(Candidate.party_id == party_id, Election.status == "ACTIVE")
        .count()
        > 0
    )


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
