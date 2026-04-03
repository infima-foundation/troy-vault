"""
Extract metadata from uploaded files.

For photos: EXIF data (GPS, camera make/model, DateTimeOriginal).
For all types: file size and MIME type.
"""

import io
import os
from datetime import datetime
from typing import Any

import exifread

try:
    import magic as _magic
    def get_mime_type(data: bytes) -> str:
        """Detect MIME type from raw bytes using libmagic."""
        return _magic.from_buffer(data, mime=True)
except ImportError:
    def get_mime_type(data: bytes) -> str:  # type: ignore[misc]
        """Fallback MIME detection without libmagic."""
        import mimetypes
        return "application/octet-stream"


def extract_exif(data: bytes) -> dict[str, Any]:
    """
    Parse EXIF tags from image bytes.

    Returns a dict with normalised keys:
      - camera_make, camera_model
      - datetime_original (datetime | None)
      - lat, lon (float | None)
      - raw (full tag dict as strings)
    """
    stream = io.BytesIO(data)
    tags = exifread.process_file(stream, details=False)

    result: dict[str, Any] = {
        "camera_make": None,
        "camera_model": None,
        "datetime_original": None,
        "lat": None,
        "lon": None,
        "raw": {},
    }

    result["raw"] = {k: str(v) for k, v in tags.items()}

    if "Image Make" in tags:
        result["camera_make"] = str(tags["Image Make"]).strip()
    if "Image Model" in tags:
        result["camera_model"] = str(tags["Image Model"]).strip()

    if "EXIF DateTimeOriginal" in tags:
        try:
            result["datetime_original"] = datetime.strptime(
                str(tags["EXIF DateTimeOriginal"]), "%Y:%m:%d %H:%M:%S"
            )
        except ValueError:
            pass

    lat = _parse_gps_coord(
        tags.get("GPS GPSLatitude"), tags.get("GPS GPSLatitudeRef")
    )
    lon = _parse_gps_coord(
        tags.get("GPS GPSLongitude"), tags.get("GPS GPSLongitudeRef")
    )
    result["lat"] = lat
    result["lon"] = lon

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_gps_coord(coord_tag, ref_tag) -> float | None:
    """Convert an exifread GPS IFDRational triplet to a signed float."""
    if coord_tag is None:
        return None
    try:
        vals = coord_tag.values  # [degrees, minutes, seconds] as Ratio
        degrees = float(vals[0].num) / float(vals[0].den)
        minutes = float(vals[1].num) / float(vals[1].den)
        seconds = float(vals[2].num) / float(vals[2].den)
        decimal = degrees + minutes / 60.0 + seconds / 3600.0
        if ref_tag and str(ref_tag) in ("S", "W"):
            decimal = -decimal
        return round(decimal, 7)
    except (IndexError, ZeroDivisionError, AttributeError):
        return None
