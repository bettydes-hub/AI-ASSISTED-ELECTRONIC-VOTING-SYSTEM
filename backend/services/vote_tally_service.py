"""Vote counting helpers for election close using ORM."""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from models.candidate import Candidate
from models.political_party import PoliticalParty
from models.result import Result
from models.vote import Vote


def tally_election(db: Session, election_id: int) -> list[dict]:
    """Rebuild result rows from votes for one election."""
    db.execute(delete(Result).where(Result.election_id == election_id))

    rows = db.execute(
        select(
            Vote.candidate_id,
            Candidate.name,
            PoliticalParty.name,
            func.count(Vote.id),
        )
        .join(Candidate, Candidate.id == Vote.candidate_id)
        .join(PoliticalParty, PoliticalParty.id == Candidate.party_id)
        .where(Vote.election_id == election_id, Vote.candidate_id.is_not(None))
        .group_by(Vote.candidate_id, Candidate.name, PoliticalParty.name)
        .order_by(func.count(Vote.id).desc())
    ).all()

    response_rows: list[dict] = []
    for candidate_id, candidate_name, party_name, total_votes in rows:
        db.add(
            Result(
                election_id=election_id,
                candidate_id=int(candidate_id),
                total_votes=int(total_votes),
            )
        )
        response_rows.append(
            {
                "candidate_id": int(candidate_id),
                "candidate_name": candidate_name,
                "party_name": party_name,
                "total_votes": int(total_votes),
            }
        )

    db.commit()
    return response_rows
