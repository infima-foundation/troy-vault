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

from fastapi import BackgroundTasks
from PIL import Image
from sqlalchemy.orm import Session

from models import Asset, Tag, FileType, TagSource
from ingestion.dedup import sha256_of_bytes, find_duplicate
from ingestion.metadata_extractor import extract_exif
from ingestion.tagger import tag_asset

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

    from storage import save_file as _save_file
    now = datetime.utcnow()
    safe_filename = f"{Path(filename).stem}_{uuid.uuid4().hex[:8]}{Path(filename).suffix}"
    object_path = f"photos/{now.year}/{now.month:02d}/{safe_filename}"
    stored_path = await _save_file(data, object_path, mime_type)

    asset_id = uuid.uuid4()
    asset = Asset(
        id=asset_id,
        filename=filename,
        file_type=FileType.photo,
        mime_type=mime_type,
        sha256_hash=sha256,
        file_path=stored_path,
        size_bytes=len(data),
    )
    db.add(asset)
    db.commit()

    background_tasks.add_task(_post_process_photo, asset_id, data, safe_filename, now.year, now.month, engine)
    return asset_id


async def _post_process_photo(
    asset_id: uuid.UUID,
    data: bytes,
    safe_filename: str,
    year: int,
    month: int,
    engine,
) -> None:
    """
    Runs after the HTTP response is sent.
    Creates its own DB session — the request session is already closed.
    """
    exif = extract_exif(data)
    stem = Path(safe_filename).stem
    thumb_object_path = f"photos/{year}/{month:02d}/thumbs/{stem}_thumb.jpg"
    thumb_path = await _generate_thumbnail(data, thumb_object_path)

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
                asset.thumbnail_path = thumb_path
            _add_exif_tags(asset_id, exif, db)
            db.commit()

    exif_parts = [f"filename: {safe_filename}"]
    if exif.get("camera_make"):
        exif_parts.append(f"camera: {exif['camera_make']} {exif.get('camera_model', '')}")
    if exif.get("datetime_original"):
        exif_parts.append(f"date: {exif['datetime_original']}")
    if exif.get("lat") is not None:
        exif_parts.append(f"gps: {exif['lat']}, {exif['lon']}")

    with Session(engine) as db:
        await tag_asset(asset_id, "photo", "\n".join(exif_parts), db)


async def _generate_thumbnail(data: bytes, thumb_object_path: str) -> str | None:
    try:
        from PIL import ImageOps
        from storage import save_file as _save_file
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")

        w_percent = THUMB_WIDTH / float(img.width)
        new_height = int(float(img.height) * w_percent)
        img = img.resize((THUMB_WIDTH, new_height), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
        thumb_bytes = buf.getvalue()

        return await _save_file(thumb_bytes, thumb_object_path, "image/jpeg")
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
