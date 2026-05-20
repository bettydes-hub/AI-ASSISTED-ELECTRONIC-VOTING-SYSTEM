from db import SessionLocal
from models.voter_profile import VoterProfile


def get_voter_by_id(voter_id: str):
    db = SessionLocal()

    try:
        voter = (
            db.query(VoterProfile)
            .filter(
                VoterProfile.voter_id == voter_id
            )
            .first()
        )

        return voter

    finally:
        db.close()