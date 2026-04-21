"""Result print/export helpers."""

from __future__ import annotations

from datetime import datetime


def build_result_document(result_payload: dict) -> str:
    header = (
        f"Election Result Document\n"
        f"Election ID: {result_payload['election_id']}\n"
        f"Election Title: {result_payload.get('election_title', '-')}\n"
        f"Status: {result_payload.get('election_status', '-')}\n"
        f"Generated At: {datetime.utcnow().isoformat()}\n"
        f"Total Votes Cast: {result_payload.get('total_votes_cast', 0)}\n"
        f"Abstentions: {result_payload.get('abstentions', 0)}\n"
        "----------------------------------------\n"
    )
    rows = result_payload.get("rows", [])
    body_lines = [
        f"{idx + 1}. {row['candidate_name']} ({row['party_name']}) - {row['total_votes']} votes"
        for idx, row in enumerate(rows)
    ]
    if not body_lines:
        body_lines = ["No candidate votes recorded (possible full abstention)."]
    return header + "\n".join(body_lines)


def print_result_document(document_text: str, force_fail: bool = False) -> dict:
    if force_fail:
        return {
            "status": "print_failed",
            "message": "Printing failed. Export the result and reprint.",
        }
    return {
        "status": "printed",
        "printed_at": datetime.utcnow().isoformat(),
        "message": "Results printed successfully.",
    }


def export_result_document(document_text: str) -> dict:
    return {
        "status": "exported",
        "exported_at": datetime.utcnow().isoformat(),
        "format": "text/plain",
        "document": document_text,
    }
