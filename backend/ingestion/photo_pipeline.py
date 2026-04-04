"""
Photo ingestion pipeline.

Steps:
  1. Dedup (SHA-256)
  2. Save to ./data/media/photos/YYYY/MM/<filename>
  3. Extract EXIF metadata
  4. Generate 400px-wide JPEG thumbnail
  5. Write Asset + Tag rows to DB
  6. Return asset_id (UUID)
"""

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

import io
import os
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
from PIL import Image
from sqlalchemy.orm import Session

from models import Asset, Tag, FileType, TagSource
from ingestion.dedup import sha256_of_bytes, find_duplicate
from ingestion.metadata_extractor import extract_exif

MEDIA_ROOT = Path(os.getenv("MEDIA_PATH", "./data/media"))
THUMB_WIDTH = 400


async def run(filename: str, data: bytes, mime_type: str, db: Session) -> uuid.UUID:
    """
    Full async photo pipeline. Returns the asset UUID.
    Raises ValueError if the file is a duplicate.
    """
    sha256 = sha256_of_bytes(data)

    existing = find_duplicate(sha256, db)
    if existing:
        return existing.id

    # Determine storage path: photos/YYYY/MM/
    now = datetime.utcnow()
    dest_dir = MEDIA_ROOT / "photos" / str(now.year) / f"{now.month:02d}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename

    # Avoid collisions
    if dest_path.exists():
        stem = dest_path.stem
        suffix = dest_path.suffix
        dest_path = dest_dir / f"{stem}_{uuid.uuid4().hex[:8]}{suffix}"

    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(data)

    # EXIF
    exif = extract_exif(data)
    captured_at = exif.get("datetime_original")

    # Thumbnail
    thumb_path = _generate_thumbnail(data, dest_path)

    # Persist
    asset_id = uuid.uuid4()
    asset = Asset(
        id=asset_id,
        filename=filename,
        file_type=FileType.photo,
        mime_type=mime_type,
        sha256_hash=sha256,
        file_path=str(dest_path),
        thumbnail_path=str(thumb_path) if thumb_path else None,
        size_bytes=len(data),
        captured_at=captured_at,
        camera_make=exif.get("camera_make"),
        camera_model=exif.get("camera_model"),
        lat=exif.get("lat"),
        lon=exif.get("lon"),
        metadata_json={"exif_raw": exif.get("raw", {})},
    )
    db.add(asset)

    # Tags from EXIF
    _add_exif_tags(asset_id, exif, db)

    db.commit()
    return asset_id


def _generate_thumbnail(data: bytes, source_path: Path) -> Path | None:
    try:
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")

        w_percent = THUMB_WIDTH / float(img.width)
        new_height = int(float(img.height) * w_percent)
        img = img.resize((THUMB_WIDTH, new_height), Image.LANCZOS)

        thumb_dir = source_path.parent / "thumbs"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        thumb_path = thumb_dir / f"{source_path.stem}_thumb.jpg"
        img.save(thumb_path, "JPEG", quality=85)
        return thumb_path
    except Exception:
        return None


def _add_exif_tags(asset_id: uuid.UUID, exif: dict, db: Session) -> None:
    tags_to_add = []

    if exif.get("camera_make"):
        tags_to_add.append(
            Tag(asset_id=asset_id, key="camera_make", value=exif["camera_make"],
                source=TagSource.exif, confidence=1.0)
        )
    if exif.get("camera_model"):
        tags_to_add.append(
            Tag(asset_id=asset_id, key="camera_model", value=exif["camera_model"],
                source=TagSource.exif, confidence=1.0)
        )
    if exif.get("lat") is not None:
        tags_to_add.append(
            Tag(asset_id=asset_id, key="gps_lat", value=str(exif["lat"]),
                source=TagSource.exif, confidence=1.0)
        )
    if exif.get("lon") is not None:
        tags_to_add.append(
            Tag(asset_id=asset_id, key="gps_lon", value=str(exif["lon"]),
                source=TagSource.exif, confidence=1.0)
        )

    db.add_all(tags_to_add)
