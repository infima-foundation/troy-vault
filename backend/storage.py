"""
Storage abstraction for troy-vault.

STORAGE_MODE=local     → files are written to MEDIA_PATH on disk.
                          Returns absolute filesystem path string.
STORAGE_MODE=supabase  → files are uploaded to Supabase Storage bucket 'troy-vault'.
                          Returns 'supabase://troy-vault/<object_path>'.

Usage:
    from storage import save_file, get_public_url

    path = await save_file(data, "photos/2024/01/img.jpg", "image/jpeg")
    url  = get_public_url(path)   # None for local paths
"""

import asyncio
import os
from pathlib import Path

STORAGE_MODE = os.getenv("STORAGE_MODE", "local")   # "local" | "supabase"
MEDIA_PATH = os.getenv("MEDIA_PATH", "./data/media")
SUPABASE_BUCKET = "troy-vault"

_supabase_client = None


def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for supabase storage mode")
        _supabase_client = create_client(url, key)
    return _supabase_client


async def save_file(data: bytes, object_path: str, content_type: str) -> str:
    """
    Persist file bytes and return a storage path.

    Args:
        data:         raw file bytes
        object_path:  relative path within the storage namespace
                      (e.g. "photos/2024/01/img.jpg")
        content_type: MIME type string

    Returns:
        - Local mode:    absolute path string  (e.g. "/data/media/photos/2024/01/img.jpg")
        - Supabase mode: "supabase://troy-vault/photos/2024/01/img.jpg"
    """
    if STORAGE_MODE == "supabase":
        def _upload():
            sb = _get_supabase()
            sb.storage.from_(SUPABASE_BUCKET).upload(
                object_path,
                data,
                {"content-type": content_type, "upsert": "true"},
            )
        await asyncio.to_thread(_upload)
        return f"supabase://{SUPABASE_BUCKET}/{object_path}"

    # Local mode
    local_path = Path(MEDIA_PATH) / object_path
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(data)
    return str(local_path)


def get_public_url(storage_path: str) -> str | None:
    """
    Return a publicly accessible URL for a supabase:// path.
    Returns None for local filesystem paths (caller should serve via API).

    This call is synchronous and makes no network requests (just URL construction).
    """
    if not storage_path or not storage_path.startswith("supabase://"):
        return None
    # "supabase://troy-vault/photos/2024/01/img.jpg"
    remainder = storage_path[len("supabase://"):]        # "troy-vault/photos/..."
    bucket, _, obj_path = remainder.partition("/")
    sb = _get_supabase()
    return sb.storage.from_(bucket).get_public_url(obj_path)
