"""Vote validation business rules."""

from sqlalchemy.orm import Session

from models.candidate import Candidate
from models.election import Election
from models.user import User
from models.vote import Vote
from models.voter_profile import VoterProfile
from models.voter_profile import VerificationStatus


def validate_vote_request(
    db: Session, election_id: int, voter_user_id: int, candidate_id: int | None
) -> tuple[bool, str]:
    election = db.get(Election, election_id)
    if not election:
        return False, "election_not_found"
    if election.status != "ACTIVE":
        return False, "election_not_active"

    user = db.get(User, voter_user_id)
    if not user:
        return False, "voter_not_found"

    voter_profile = db.get(VoterProfile, voter_user_id)
    if not voter_profile:
        return False, "voter_profile_not_found"
    if voter_profile.verification_status != VerificationStatus.VERIFIED:
        return False, "biometric_not_verified"
    if voter_profile.has_voted:
        return False, "already_voted"

    existing_vote = (
        db.query(Vote)
        .filter(Vote.election_id == election_id, Vote.voter_user_id == voter_user_id)
        .first()
    )
    if existing_vote:
        return False, "already_voted"

    if candidate_id is not None:
        candidate = db.get(Candidate, candidate_id)
        if not candidate:
            return False, "candidate_not_found"
        if candidate.election_id != election_id:
            return False, "candidate_not_in_election"

    return True, "ok"
