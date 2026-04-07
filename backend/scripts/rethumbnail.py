"""
Re-generate thumbnails for all photo assets with correct EXIF orientation.

Usage (from backend/):
    source venv/bin/activate && python scripts/rethumbnail.py
"""

import io
import os
import sys
from pathlib import Path

# Allow running from backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from PIL import Image, ImageOps
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from models import Asset, FileType

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://troy:troy@localhost:5432/troy_vault")
THUMB_WIDTH = 400

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def regenerate_thumbnail(asset: Asset) -> bool:
    """Re-generate the thumbnail for a photo asset with EXIF orientation applied.
    Overwrites the existing thumbnail file. Returns True on success."""
    source_path = Path(asset.file_path)
    if not source_path.exists():
        print(f"  SKIP (source missing): {asset.filename}")
        return False

    try:
        with open(source_path, "rb") as f:
            data = f.read()

        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")

        w_percent = THUMB_WIDTH / float(img.width)
        new_height = int(float(img.height) * w_percent)
        img = img.resize((THUMB_WIDTH, new_height), Image.LANCZOS)

        # Use existing thumbnail path if present, otherwise derive it
        if asset.thumbnail_path:
            thumb_path = Path(asset.thumbnail_path)
        else:
            thumb_dir = source_path.parent / "thumbs"
            thumb_dir.mkdir(parents=True, exist_ok=True)
            thumb_path = thumb_dir / f"{source_path.stem}_thumb.jpg"

        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(thumb_path, "JPEG", quality=85)
        return True

    except Exception as exc:
        print(f"  ERROR ({asset.filename}): {exc}")
        return False


def main() -> None:
    fixed = 0
    skipped = 0
    errors = 0

    with Session(engine) as db:
        assets = db.scalars(
            select(Asset).where(Asset.file_type == FileType.photo)
        ).all()

        total = len(assets)
        print(f"Found {total} photo asset(s). Re-generating thumbnails...\n")

        for asset in assets:
            ok = regenerate_thumbnail(asset)
            if ok:
                print(f"Fixed: {asset.filename}")
                fixed += 1
            else:
                skipped_or_err = "skipped" if not Path(asset.file_path).exists() else "error"
                if skipped_or_err == "skipped":
                    skipped += 1
                else:
                    errors += 1

    print(f"\nDone. Fixed: {fixed}  Skipped: {skipped}  Errors: {errors}")


if __name__ == "__main__":
    main()
