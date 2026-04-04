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
    _MAGIC_AVAILABLE = True
except ImportError:
    _MAGIC_AVAILABLE = False


# ISO Base Media File Format brands → MIME type
# HEIC/HEIF and video containers share the same ftyp-box structure.
_ISOBMFF_BRANDS: dict[bytes, str] = {
    b"heic": "image/heic",
    b"heix": "image/heic",
    b"hevc": "image/heic",
    b"hevx": "image/heic",
    b"mif1": "image/heif",
    b"msf1": "image/heif",
    b"avif": "image/avif",
    b"avis": "image/avif",
    b"isom": "video/mp4",
    b"mp41": "video/mp4",
    b"mp42": "video/mp4",
    b"M4V ": "video/mp4",
    b"M4A ": "audio/mp4",
    b"M4B ": "audio/mp4",
    b"qt  ": "video/quicktime",
    b"avc1": "video/mp4",
}


def _sniff_isobmff(data: bytes) -> str | None:
    """
    Return a MIME type if data starts with an ISO Base Media File Format
    ftyp box, otherwise None.
    """
    if len(data) < 12:
        return None
    try:
        box_size = int.from_bytes(data[0:4], "big")
        if data[4:8] != b"ftyp" or box_size < 8 or box_size > len(data):
            return None
        major_brand = data[8:12]
        if major_brand in _ISOBMFF_BRANDS:
            return _ISOBMFF_BRANDS[major_brand]
        # scan compatible brands
        for i in range(16, box_size, 4):
            brand = data[i : i + 4]
            if brand in _ISOBMFF_BRANDS:
                return _ISOBMFF_BRANDS[brand]
    except Exception:
        pass
    return None


# Office Open XML content-type prefix → MIME
# Checked when a ZIP is detected but might be an OOXML container.
_OOXML_CONTENT_TYPES: dict[bytes, str] = {
    b"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    b"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    b"application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _sniff_ooxml(data: bytes) -> str | None:
    """
    If data is a ZIP that contains [Content_Types].xml, read it and return
    the appropriate OOXML MIME type, otherwise return None.
    DOCX/XLSX/PPTX are all ZIP archives; python-magic identifies them as
    application/zip, so we need this extra step.
    """
    if data[:2] != b"PK":  # ZIP local file header signature
        return None
    import io, zipfile
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            if "[Content_Types].xml" not in zf.namelist():
                return None
            ct_xml = zf.read("[Content_Types].xml")
            for prefix, mime in _OOXML_CONTENT_TYPES.items():
                if prefix in ct_xml:
                    return mime
    except Exception:
        pass
    return None


def _detect_mime(data: bytes) -> str:
    """
    Detect MIME type from raw bytes.
    1. Check ISO BMFF ftyp box first (catches HEIC/HEIF/MP4/MOV/M4A).
    2. Check OOXML (DOCX/XLSX/PPTX live inside a ZIP container).
    3. Delegate to python-magic if available.
    4. Fall back to minimal byte sniffing.
    """
    isobmff = _sniff_isobmff(data)
    if isobmff:
        return isobmff

    ooxml = _sniff_ooxml(data)
    if ooxml:
        return ooxml

    if _MAGIC_AVAILABLE:
        return _magic.from_buffer(data, mime=True)  # type: ignore[name-defined]

    # Minimal fallback without libmagic
    if data[:4] in (b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xe1", b"\xff\xd8\xff\xe2"):
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"%PDF":
        return "application/pdf"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
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
