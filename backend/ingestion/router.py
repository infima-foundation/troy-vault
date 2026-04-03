"""
MIME-based file router.

Reads the upload bytes, detects the true MIME type, and dispatches to the
appropriate ingestion pipeline.
"""

import uuid

from fastapi import UploadFile
from sqlalchemy.orm import Session

try:
    import magic as _magic
    def _detect_mime(data: bytes) -> str:
        return _magic.from_buffer(data, mime=True)
except ImportError:
    import mimetypes
    def _detect_mime(data: bytes) -> str:  # type: ignore[misc]
        # Minimal sniffing without libmagic
        if data[:4] == b'\xff\xd8\xff\xe0' or data[:4] == b'\xff\xd8\xff\xe1':
            return "image/jpeg"
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            return "image/png"
        if data[:4] in (b'%PDF',):
            return "application/pdf"
        return "application/octet-stream"

from ingestion import photo_pipeline, document_pipeline


# MIME prefixes / exact types → pipeline
_PHOTO_MIMES = {
    "image/jpeg", "image/png", "image/tiff", "image/webp",
    "image/heic", "image/heif", "image/bmp", "image/gif",
}

_VIDEO_MIMES_PREFIX = "video/"
_AUDIO_MIMES_PREFIX = "audio/"

_DOCUMENT_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.oasis.opendocument.text",
    "text/plain",
    "text/markdown",
    "text/html",
}


async def route_file(file: UploadFile, db: Session) -> uuid.UUID:
    """
    Read the upload, detect its MIME type, and delegate to the right pipeline.
    Returns the asset UUID from the pipeline that handled it.
    """
    data = await file.read()
    filename = file.filename or "unknown"

    mime_type: str = _detect_mime(data)

    if mime_type in _PHOTO_MIMES:
        return await photo_pipeline.run(filename, data, mime_type, db)

    if mime_type.startswith(_VIDEO_MIMES_PREFIX):
        return await _video_pipeline(filename, data, mime_type, db)

    if mime_type.startswith(_AUDIO_MIMES_PREFIX):
        return await _audio_pipeline(filename, data, mime_type, db)

    if mime_type in _DOCUMENT_MIMES or mime_type.startswith("text/"):
        return await document_pipeline.run(filename, data, mime_type, db)

    # Fallback: treat as document (stores file, no text extraction)
    return await document_pipeline.run(filename, data, mime_type, db)


# ---------------------------------------------------------------------------
# Stub pipelines — video and audio share the same save-and-record pattern
# until dedicated pipelines are built.
# ---------------------------------------------------------------------------

async def _video_pipeline(
    filename: str, data: bytes, mime_type: str, db: Session
) -> uuid.UUID:
    import uuid as _uuid
    import os
    from datetime import datetime
    from pathlib import Path
    import aiofiles
    from models import Asset, FileType
    from ingestion.dedup import sha256_of_bytes, find_duplicate

    sha256 = sha256_of_bytes(data)
    existing = find_duplicate(sha256, db)
    if existing:
        return existing.id

    now = datetime.utcnow()
    media_root = Path(os.getenv("MEDIA_PATH", "./data/media"))
    dest_dir = media_root / "videos" / str(now.year) / f"{now.month:02d}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename

    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(data)

    asset_id = _uuid.uuid4()
    asset = Asset(
        id=asset_id,
        filename=filename,
        file_type=FileType.video,
        mime_type=mime_type,
        sha256_hash=sha256,
        file_path=str(dest_path),
        size_bytes=len(data),
    )
    db.add(asset)
    db.commit()
    return asset_id


async def _audio_pipeline(
    filename: str, data: bytes, mime_type: str, db: Session
) -> uuid.UUID:
    import uuid as _uuid
    import os
    from datetime import datetime
    from pathlib import Path
    import aiofiles
    from models import Asset, FileType
    from ingestion.dedup import sha256_of_bytes, find_duplicate

    sha256 = sha256_of_bytes(data)
    existing = find_duplicate(sha256, db)
    if existing:
        return existing.id

    now = datetime.utcnow()
    media_root = Path(os.getenv("MEDIA_PATH", "./data/media"))
    dest_dir = media_root / "audio" / str(now.year) / f"{now.month:02d}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename

    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(data)

    asset_id = _uuid.uuid4()
    asset = Asset(
        id=asset_id,
        filename=filename,
        file_type=FileType.audio,
        mime_type=mime_type,
        sha256_hash=sha256,
        file_path=str(dest_path),
        size_bytes=len(data),
    )
    db.add(asset)
    db.commit()
    return asset_id
