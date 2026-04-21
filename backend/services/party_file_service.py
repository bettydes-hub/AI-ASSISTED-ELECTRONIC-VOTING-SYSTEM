"""Store party logo, leader photo, and supporting PDF under uploads/parties/<id>/."""

from __future__ import annotations

from pathlib import Path

from werkzeug.datastructures import FileStorage

ALLOWED_LOGO = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_DOC = {".pdf"}
MAX_BYTES = 8 * 1024 * 1024


def party_upload_dir(backend_dir: Path, party_id: int) -> Path:
    return backend_dir / "uploads" / "parties" / str(party_id)


def _ext(name: str) -> str:
    return Path(name).suffix.lower()


def save_party_logo(backend_dir: Path, party_id: int, file: FileStorage) -> str | None:
    if not file or not file.filename:
        return None
    ext = _ext(file.filename)
    if ext not in ALLOWED_LOGO:
        raise ValueError("invalid_logo_type")
    dest_dir = party_upload_dir(backend_dir, party_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    final_name = f"logo{ext}"
    path = dest_dir / final_name
    file.save(path)
    if path.stat().st_size > MAX_BYTES:
        path.unlink(missing_ok=True)
        raise ValueError("file_too_large")
    return f"parties/{party_id}/{final_name}"


def save_leader_image(backend_dir: Path, party_id: int, file: FileStorage) -> str | None:
    if not file or not file.filename:
        return None
    ext = _ext(file.filename)
    if ext not in ALLOWED_LOGO:
        raise ValueError("invalid_leader_image_type")
    dest_dir = party_upload_dir(backend_dir, party_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    final_name = f"leader{ext}"
    path = dest_dir / final_name
    file.save(path)
    if path.stat().st_size > MAX_BYTES:
        path.unlink(missing_ok=True)
        raise ValueError("file_too_large")
    return f"parties/{party_id}/{final_name}"


def save_supporting_document(backend_dir: Path, party_id: int, file: FileStorage) -> str | None:
    if not file or not file.filename:
        return None
    ext = _ext(file.filename)
    if ext not in ALLOWED_DOC:
        raise ValueError("invalid_document_type")
    dest_dir = party_upload_dir(backend_dir, party_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    final_name = f"supporting_document{ext}"
    path = dest_dir / final_name
    file.save(path)
    if path.stat().st_size > MAX_BYTES:
        path.unlink(missing_ok=True)
        raise ValueError("file_too_large")
    return f"parties/{party_id}/{final_name}"


def allowed_file_basename(name: str) -> bool:
    base = Path(name).name
    if not base or base != name or ".." in name or "/" in name or "\\" in name:
        return False
    return all(c.isalnum() or c in "._-" for c in base)
