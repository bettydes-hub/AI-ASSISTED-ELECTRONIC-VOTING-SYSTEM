"""Result formatting and approval workflow using ORM."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.user import User, UserRole
from models.vote import Vote
from models.election import Election
from models.political_party import PoliticalParty
from models.result import Result
from models.candidate import Candidate
from models.region import Region


def get_results(
    db: Session,
    election_id: int,
    *,
    region_id: int | None = None,
    region_district: str | None = None,
) -> dict | None:
    election = db.get(Election, election_id)
    if not election:
        return None

    base_query = (
        select(Result, Candidate, PoliticalParty, Region)
        .join(Candidate, Candidate.id == Result.candidate_id)
        .join(PoliticalParty, PoliticalParty.id == Candidate.party_id)
        .join(Region, Region.id == Candidate.region_id, isouter=True)
        .where(Result.election_id == election_id)
        .order_by(Result.total_votes.desc())
    )
    if region_id is not None:
        base_query = base_query.where(Candidate.region_id == region_id)
    if region_district:
        base_query = base_query.where(Candidate.region_district.ilike(f"%{region_district.strip()}%"))
    rows = db.execute(base_query).all()

    total_votes_cast = (
        db.query(func.count(Vote.id)).filter(Vote.election_id == election_id).scalar() or 0
    )
    abstentions = (
        db.query(func.count(Vote.id))
        .filter(Vote.election_id == election_id, Vote.candidate_id.is_(None))
        .scalar()
        or 0
    )
    total_voters = (
        db.query(func.count(User.id)).filter(User.role == UserRole.VOTER).scalar() or 0
    )
    counted_candidate_votes = int(sum(result.total_votes for result, _, _, _ in rows))
    denominator = int(total_votes_cast) if total_votes_cast else max(counted_candidate_votes, 1)

    candidate_rows = [
        {
            "candidate_id": result.candidate_id,
            "candidate_name": candidate.name,
            "party_name": party.name,
            "position": candidate.running_position,
            "total_votes": result.total_votes,
            "percentage": round((result.total_votes / denominator) * 100, 2),
            "region_id": candidate.region_id,
            "region_name": region.name if region else None,
            "region_district": candidate.region_district,
        }
        for result, candidate, party, region in rows
    ]
    winner_row = candidate_rows[0] if candidate_rows else None
    winner = (
        {
            "name": winner_row["candidate_name"],
            "party": winner_row["party_name"],
            "position": winner_row["position"],
            "total_votes": winner_row["total_votes"],
            "percentage": winner_row["percentage"],
            "status": "WINNER",
        }
        if winner_row
        else None
    )
    turnout_percentage = round((int(total_votes_cast) / int(total_voters)) * 100, 2) if total_voters else None

    by_region_district: dict[str, dict[str, int | str]] = {}
    for row in candidate_rows:
        key = str(row["region_district"] or "Unspecified")
        current = by_region_district.get(key)
        if not current:
            by_region_district[key] = {"region_district": key, "total_votes": int(row["total_votes"])}
        else:
            current["total_votes"] = int(current["total_votes"]) + int(row["total_votes"])

    return {
        "election_id": election_id,
        "election_title": election.title,
        "election_type": election.election_type,
        "election_scope": election.election_scope,
        "region_id": election.region_id,
        "region_name": db.get(Region, election.region_id).name if election.region_id else None,
        "election_date": election.voting_at.isoformat() if election.voting_at else None,
        "election_status": election.status,
        "rows": candidate_rows,
        "winner": winner,
        "total_votes_cast": int(total_votes_cast),
        "total_voters": int(total_voters),
        "turnout_percentage": turnout_percentage,
        "abstentions": int(abstentions),
        "counted_candidate_votes": counted_candidate_votes,
        "region_breakdown": list(by_region_district.values()),
        "applied_region_filter": {"region_id": region_id, "region_district": region_district},
        "approved": election.results_approved,
        "approved_by": election.approved_by,
        "approved_at": election.approved_at.isoformat() if election.approved_at else None,
    }


def approve_results(db: Session, election_id: int, approved_by: str) -> dict:
    election = db.get(Election, election_id)
    if not election:
        raise ValueError("results_not_found")
    if election.status != "COMPLETED":
        raise ValueError("election_not_closed")
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
