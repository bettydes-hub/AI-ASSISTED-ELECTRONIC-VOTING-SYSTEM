from repositories.voter_repository import get_voter_by_id


def verify_voter(voter_id: str):

    voter = get_voter_by_id(voter_id)

    if not voter:
        return {
            "success": False,
            "message": "Invalid voter",
        }

    if voter.has_voted:
        return {
            "success": False,
            "message": "Already voted",
        }

    return {
        "success": True,
        "message": "Eligible",
    }