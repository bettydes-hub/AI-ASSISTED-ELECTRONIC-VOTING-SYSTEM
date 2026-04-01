"""Result formatting and approval workflow using ORM."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.election import Election
from models.political_party import PoliticalParty
from models.result import Result
from models.candidate import Candidate


def get_results(db: Session, election_id: int) -> dict | None:
    election = db.get(Election, election_id)
    if not election:
        return None

    rows = db.execute(
        select(Result, Candidate, PoliticalParty)
        .join(Candidate, Candidate.id == Result.candidate_id)
        .join(PoliticalParty, PoliticalParty.id == Candidate.party_id)
        .where(Result.election_id == election_id)
        .order_by(Result.total_votes.desc())
    ).all()

    if len(rows) == 0:
        return None

    return {
        "election_id": election_id,
        "rows": [
            {
                "candidate_id": result.candidate_id,
                "candidate_name": candidate.name,
                "party_name": party.name,
                "total_votes": result.total_votes,
            }
            for result, candidate, party in rows
        ],
        "approved": election.results_approved,
        "approved_by": election.approved_by,
        "approved_at": election.approved_at.isoformat() if election.approved_at else None,
    }


def approve_results(db: Session, election_id: int, approved_by: str) -> dict:
    election = db.get(Election, election_id)
    if not election:
        raise ValueError("results_not_found")
    if election.results_approved:
        raise ValueError("already_approved")

    election.results_approved = True
    election.approved_by = approved_by
    election.approved_at = datetime.utcnow()
    db.commit()
    data = get_results(db, election_id)
    if not data:
        raise ValueError("results_not_found")
    return data
