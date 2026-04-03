import hashlib

from sqlalchemy.orm import Session
from sqlalchemy import select

from models import Asset


CHUNK_SIZE = 65536  # 64 KB


def sha256_of_bytes(data: bytes) -> str:
    """Return the SHA-256 hex digest of raw bytes."""
    return hashlib.sha256(data).hexdigest()


def sha256_of_file(path: str) -> str:
    """Return the SHA-256 hex digest of a file on disk."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK_SIZE):
            h.update(chunk)
    return h.hexdigest()


def find_duplicate(sha256: str, db: Session) -> Asset | None:
    """Return an existing Asset with the same hash, or None."""
    return db.scalar(select(Asset).where(Asset.sha256_hash == sha256))
