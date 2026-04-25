"""Store candidate photo under uploads/candidates/<id>/."""

from __future__ import annotations

from pathlib import Path

from werkzeug.datastructures import FileStorage

ALLOWED_IMAGE = {".png", ".jpg", ".jpeg", ".webp"}
MAX_BYTES = 8 * 1024 * 1024


def candidate_upload_dir(backend_dir: Path, candidate_id: int) -> Path:
    return backend_dir / "uploads" / "candidates" / str(candidate_id)


def _ext(name: str) -> str:
    return Path(name).suffix.lower()


def save_candidate_photo(backend_dir: Path, candidate_id: int, file: FileStorage) -> str | None:
    if not file or not file.filename:
        return None
    ext = _ext(file.filename)
    if ext not in ALLOWED_IMAGE:
        raise ValueError("invalid_candidate_image_type")
    dest_dir = candidate_upload_dir(backend_dir, candidate_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    final_name = f"photo{ext}"
    path = dest_dir / final_name
    file.save(path)
    if path.stat().st_size > MAX_BYTES:
        path.unlink(missing_ok=True)
        raise ValueError("file_too_large")
    return f"candidates/{candidate_id}/{final_name}"
