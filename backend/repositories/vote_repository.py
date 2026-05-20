from db import get_db_connection


def save_vote(voter_id, candidate, party, symbol):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO votes
        (voter_id, candidate, party, symbol)
        VALUES (?, ?, ?, ?)
    """, (
        voter_id,
        candidate,
        party,
        symbol
    ))

    cursor.execute("""
        UPDATE voters
        SET has_voted=1
        WHERE id=?
    """, (voter_id,))

    conn.commit()
    conn.close()