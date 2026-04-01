from flask import Blueprint, jsonify, request

from db import SessionLocal
from models.candidate import Candidate
from models.election import Election
from models.political_party import PoliticalParty
from security.rbac import ROLE_ELECTION_BOARD, require_role

candidate_party_bp = Blueprint("candidate_party", __name__)


@candidate_party_bp.get("/parties")
@require_role(ROLE_ELECTION_BOARD)
def list_parties():
    with SessionLocal() as db:
        parties = db.query(PoliticalParty).order_by(PoliticalParty.id.asc()).all()
        return jsonify(
            {
                "items": [
                    {"id": party.id, "name": party.name, "description": party.description}
                    for party in parties
                ]
            }
        )


@candidate_party_bp.post("/parties")
@require_role(ROLE_ELECTION_BOARD)
def create_party():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name_required"}), 400

    with SessionLocal() as db:
        exists = (
            db.query(PoliticalParty)
            .filter(PoliticalParty.name.ilike(name))
            .first()
        )
        if exists:
            return jsonify({"error": "party_name_exists"}), 409

        party = PoliticalParty(
            name=name,
            description=(payload.get("description") or "").strip(),
        )
        db.add(party)
        db.commit()
        db.refresh(party)
        return (
            jsonify({"id": party.id, "name": party.name, "description": party.description}),
            201,
        )


@candidate_party_bp.patch("/parties/<int:party_id>")
@require_role(ROLE_ELECTION_BOARD)
def update_party(party_id: int):
    payload = request.get_json(silent=True) or {}
    with SessionLocal() as db:
        party = db.get(PoliticalParty, party_id)
        if not party:
            return jsonify({"error": "party_not_found"}), 404

        name = payload.get("name")
        description = payload.get("description")
        if isinstance(name, str) and name.strip():
            party.name = name.strip()
        if isinstance(description, str):
            party.description = description.strip()
        db.commit()
        return jsonify({"id": party.id, "name": party.name, "description": party.description})


@candidate_party_bp.delete("/parties/<int:party_id>")
@require_role(ROLE_ELECTION_BOARD)
def delete_party(party_id: int):
    with SessionLocal() as db:
        party = db.get(PoliticalParty, party_id)
        if not party:
            return jsonify({"error": "party_not_found"}), 404

        linked_candidates = db.query(Candidate).filter(Candidate.party_id == party_id).count()
        if linked_candidates > 0:
            return jsonify({"error": "party_has_linked_candidates"}), 409
        db.delete(party)
        db.commit()
        return jsonify({"message": "deleted"})


@candidate_party_bp.get("/candidates")
@require_role(ROLE_ELECTION_BOARD)
def list_candidates():
    election_id_raw = request.args.get("election_id")
    with SessionLocal() as db:
        query = db.query(Candidate).order_by(Candidate.id.asc())
        if election_id_raw:
            query = query.filter(Candidate.election_id == int(election_id_raw))
        rows = query.all()
        return jsonify(
            {
                "items": [
                    {
                        "id": c.id,
                        "name": c.name,
                        "party_id": c.party_id,
                        "election_id": c.election_id,
                        "profile_info": c.profile_info,
                    }
                    for c in rows
                ]
            }
        )


@candidate_party_bp.post("/candidates")
@require_role(ROLE_ELECTION_BOARD)
def create_candidate():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    election_id = payload.get("election_id")
    party_id = payload.get("party_id")

    if not name or election_id is None or party_id is None:
        return jsonify({"error": "name_election_party_required"}), 400

    with SessionLocal() as db:
        election = db.get(Election, int(election_id))
        if not election:
            return jsonify({"error": "election_not_found"}), 404
        party = db.get(PoliticalParty, int(party_id))
        if not party:
            return jsonify({"error": "party_not_found"}), 404

        duplicate = (
            db.query(Candidate)
            .filter(Candidate.election_id == int(election_id), Candidate.name.ilike(name))
            .first()
        )
        if duplicate:
            return jsonify({"error": "candidate_name_exists_in_election"}), 409

        candidate = Candidate(
            name=name,
            party_id=int(party_id),
            election_id=int(election_id),
            profile_info=(payload.get("profile_info") or "").strip(),
        )
        db.add(candidate)
        db.commit()
        db.refresh(candidate)
        return (
            jsonify(
                {
                    "id": candidate.id,
                    "name": candidate.name,
                    "party_id": candidate.party_id,
                    "election_id": candidate.election_id,
                    "profile_info": candidate.profile_info,
                }
            ),
            201,
        )


@candidate_party_bp.patch("/candidates/<int:candidate_id>")
@require_role(ROLE_ELECTION_BOARD)
def update_candidate(candidate_id: int):
    payload = request.get_json(silent=True) or {}
    with SessionLocal() as db:
        candidate = db.get(Candidate, candidate_id)
        if not candidate:
            return jsonify({"error": "candidate_not_found"}), 404

        election = db.get(Election, candidate.election_id)
        if election and election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        name = payload.get("name")
        profile_info = payload.get("profile_info")
        party_id = payload.get("party_id")

        if isinstance(name, str) and name.strip():
            duplicate = (
                db.query(Candidate)
                .filter(
                    Candidate.election_id == candidate.election_id,
                    Candidate.name.ilike(name.strip()),
                    Candidate.id != candidate_id,
                )
                .first()
            )
            if duplicate:
                return jsonify({"error": "candidate_name_exists_in_election"}), 409
            candidate.name = name.strip()

        if isinstance(profile_info, str):
            candidate.profile_info = profile_info.strip()

        if party_id is not None:
            party = db.get(PoliticalParty, int(party_id))
            if not party:
                return jsonify({"error": "party_not_found"}), 404
            candidate.party_id = int(party_id)

        db.commit()
        return jsonify(
            {
                "id": candidate.id,
                "name": candidate.name,
                "party_id": candidate.party_id,
                "election_id": candidate.election_id,
                "profile_info": candidate.profile_info,
            }
        )


@candidate_party_bp.delete("/candidates/<int:candidate_id>")
@require_role(ROLE_ELECTION_BOARD)
def delete_candidate(candidate_id: int):
    with SessionLocal() as db:
        candidate = db.get(Candidate, candidate_id)
        if not candidate:
            return jsonify({"error": "candidate_not_found"}), 404

        election = db.get(Election, candidate.election_id)
        if election and election.status == "ACTIVE":
            return jsonify({"error": "editing_locked_after_activation"}), 409

        db.delete(candidate)
        db.commit()
        return jsonify({"message": "deleted"})
