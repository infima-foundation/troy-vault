"""
Photo ingestion pipeline.

Fast path (in-request):
  1. Dedup (SHA-256)
  2. Save to ./data/media/photos/YYYY/MM/<filename>
  3. Write minimal Asset row to DB
  4. Return asset_id immediately

Background (after response):
  5. Extract EXIF metadata
  6. Generate 400px-wide JPEG thumbnail
  7. Update Asset row with EXIF + thumbnail_path
  8. LLM tagging via Ollama
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
from fastapi import BackgroundTasks
from PIL import Image
from sqlalchemy.orm import Session

from models import Asset, Tag, FileType, TagSource
from ingestion.dedup import sha256_of_bytes, find_duplicate
from ingestion.metadata_extractor import extract_exif
from ingestion.tagger import tag_asset

MEDIA_ROOT = Path(os.getenv("MEDIA_PATH", "./data/media"))
THUMB_WIDTH = 400


async def run(
    filename: str,
    data: bytes,
    mime_type: str,
    db: Session,
    background_tasks: BackgroundTasks,
    engine,
) -> uuid.UUID:
    """
    Fast path: dedup, save file, write minimal DB row, return asset_id.
    Schedules EXIF/thumbnail/tagging as a background task.
    """
    sha256 = sha256_of_bytes(data)
    existing = find_duplicate(sha256, db)
    if existing:
        return existing.id

    now = datetime.utcnow()
    dest_dir = MEDIA_ROOT / "photos" / str(now.year) / f"{now.month:02d}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename

    if dest_path.exists():
        stem = dest_path.stem
        suffix = dest_path.suffix
        dest_path = dest_dir / f"{stem}_{uuid.uuid4().hex[:8]}{suffix}"

    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(data)

    asset_id = uuid.uuid4()
    asset = Asset(
        id=asset_id,
        filename=filename,
        file_type=FileType.photo,
        mime_type=mime_type,
        sha256_hash=sha256,
        file_path=str(dest_path),
        size_bytes=len(data),
    )
    db.add(asset)
    db.commit()

    background_tasks.add_task(_post_process_photo, asset_id, data, dest_path, engine)
    return asset_id


async def _post_process_photo(
    asset_id: uuid.UUID,
    data: bytes,
    dest_path: Path,
    engine,
) -> None:
    """
    Runs after the HTTP response is sent.
    Creates its own DB session — the request session is already closed.
    """
    exif = extract_exif(data)
    thumb_path = _generate_thumbnail(data, dest_path)

    with Session(engine) as db:
        asset = db.get(Asset, asset_id)
        if asset:
            asset.captured_at = exif.get("datetime_original")
            asset.camera_make = exif.get("camera_make")
            asset.camera_model = exif.get("camera_model")
            asset.lat = exif.get("lat")
            asset.lon = exif.get("lon")
            asset.metadata_json = {"exif_raw": exif.get("raw", {})}
            if thumb_path:
                asset.thumbnail_path = str(thumb_path)
            _add_exif_tags(asset_id, exif, db)
            db.commit()

    exif_parts = [f"filename: {dest_path.name}"]
    if exif.get("camera_make"):
        exif_parts.append(f"camera: {exif['camera_make']} {exif.get('camera_model', '')}")
    if exif.get("datetime_original"):
        exif_parts.append(f"date: {exif['datetime_original']}")
    if exif.get("lat") is not None:
        exif_parts.append(f"gps: {exif['lat']}, {exif['lon']}")

    with Session(engine) as db:
        await tag_asset(asset_id, "photo", "\n".join(exif_parts), db)


def _generate_thumbnail(data: bytes, source_path: Path) -> Path | None:
    try:
        from PIL import ImageOps
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
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
