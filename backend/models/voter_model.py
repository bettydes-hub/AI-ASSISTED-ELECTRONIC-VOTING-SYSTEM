from db import get_db_connection


def create_voter_table():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS voters (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            face_image TEXT,
            has_voted INTEGER DEFAULT 0
        )
    """)

    conn.commit()
    conn.close()