"""Authenticated upload path resolution with path-traversal protection."""
from pathlib import Path
from fastapi import HTTPException, status


def uploads_root() -> Path:
    # backend/app/core/uploads.py → backend/uploads
    return Path(__file__).resolve().parents[2] / "uploads"


def resolve_upload_file(file_path: str) -> Path:
    """
    Resolve a user-supplied path under /uploads to a real file.
    Rejects traversal, absolute paths outside the uploads root, and missing files.
    """
    raw = (file_path or "").replace("\\", "/").strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    relative = raw
    if relative.startswith("/uploads/"):
        relative = relative[len("/uploads/") :]
    elif relative.startswith("uploads/"):
        relative = relative[len("uploads/") :]
    relative = relative.lstrip("/")

    if not relative or Path(relative).is_absolute() or ".." in Path(relative).parts:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    base = uploads_root().resolve()
    full = (base / relative).resolve()
    try:
        full.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    if not full.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    return full
