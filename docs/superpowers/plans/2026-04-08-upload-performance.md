# Upload Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uploads return in under 2 seconds by moving all post-processing (EXIF, thumbnail, embedding, LLM tagging) to FastAPI BackgroundTasks that run after the response is sent.

**Architecture:** The ingest endpoint writes the file to disk and inserts a minimal Asset DB row, then immediately returns the asset_id. All enrichment (EXIF extraction, thumbnail generation, ChromaDB embedding, Ollama LLM tagging) is scheduled as BackgroundTasks and runs after the HTTP response is delivered. Background tasks create their own DB sessions from the shared engine to avoid using the closed request session. The SQLAlchemy engine gets an explicit connection pool to handle Supabase remote-Postgres latency.

**Tech Stack:** FastAPI BackgroundTasks, SQLAlchemy 2.x, Pillow, aiofiles, Ollama (via existing tagger.py).

---

## File Map

| Action | Path | What changes |
|--------|------|-------------|
| Modify | `backend/main.py` | Add pool to engine; add `BackgroundTasks` param to ingest; pass `engine` + `background_tasks` to `route_file`; add cache headers to thumbnail endpoint |
| Modify | `backend/ingestion/router.py` | Accept `background_tasks` + `engine` in `route_file()`; pass them to photo/document pipelines |
| Modify | `backend/ingestion/photo_pipeline.py` | Fast path writes minimal row; `_post_process_photo` background task does EXIF + thumbnail + tags |
| Modify | `backend/ingestion/document_pipeline.py` | Fast path writes minimal row; `_post_process_document` background task does text extraction + embedding + tags |

---

## Task 1: Connection Pool + Thumbnail Cache Headers (main.py)

**Files:**
- Modify: `backend/main.py:35-40` (engine kwargs)
- Modify: `backend/main.py:214-231` (thumbnail endpoint)

- [ ] **Step 1: Update engine kwargs to add pool_size/max_overflow**

In `backend/main.py`, find and replace this block (lines 35-41):

```python
_engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **_engine_kwargs)
```

Replace with:

```python
_engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **_engine_kwargs)
```

- [ ] **Step 2: Add Cache-Control header to thumbnail endpoint**

In `backend/main.py`, find the thumbnail endpoint's `return FileResponse(candidate, media_type=media_type)` line and replace it with:

```python
            return FileResponse(
                candidate,
                media_type=media_type,
                headers={"Cache-Control": "public, max-age=31536000"},
            )
```

- [ ] **Step 3: Verify the file looks right**

```bash
grep -n "pool_size\|max_overflow\|Cache-Control" /Users/mauriciovallartapena/troy-vault/troy-vault/backend/main.py
```

Expected output shows 3 lines: pool_size, max_overflow, Cache-Control.

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add backend/main.py
git commit -m "perf: connection pool for Postgres + cache headers on thumbnail endpoint"
```

---

## Task 2: Refactor photo_pipeline.py — Fast Path + Background Task

**Files:**
- Modify: `backend/ingestion/photo_pipeline.py`

The `run()` function currently does everything synchronously before returning. After this task:
- `run()` saves the file, writes a minimal Asset row (no EXIF, no thumbnail), commits, schedules background task, returns.
- `_post_process_photo()` (new async function) does EXIF, thumbnail, DB update, and LLM tagging with its own Session.

- [ ] **Step 1: Replace the entire photo_pipeline.py**

Write this to `backend/ingestion/photo_pipeline.py`:

```python
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add backend/ingestion/photo_pipeline.py
git commit -m "perf: photo pipeline — fast path returns immediately, post-process in background"
```

---

## Task 3: Refactor document_pipeline.py — Fast Path + Background Task

**Files:**
- Modify: `backend/ingestion/document_pipeline.py`

Same pattern as photo pipeline. The `run()` function returns after writing the DB row. Text extraction, embedding, and LLM tagging move to `_post_process_document()`.

- [ ] **Step 1: Replace the entire document_pipeline.py**

Write this to `backend/ingestion/document_pipeline.py`:

```python
"""
Document ingestion pipeline.

Fast path (in-request):
  1. Dedup (SHA-256)
  2. Save to ./data/media/documents/YYYY/MM/<filename>
  3. Write minimal Asset row to DB
  4. Return asset_id immediately

Background (after response):
  5. Extract text (pypdf / python-docx / pytesseract)
  6. Chunk + embed into ChromaDB
  7. Update Asset.metadata_json with text_length + summary
  8. LLM tagging via Ollama
"""

import io
import os
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    _CHROMA_AVAILABLE = True
except ImportError:
    _CHROMA_AVAILABLE = False

try:
    from sentence_transformers import SentenceTransformer
    _ST_AVAILABLE = True
except ImportError:
    _ST_AVAILABLE = False

from models import Asset, FileType
from ingestion.dedup import sha256_of_bytes, find_duplicate
from ingestion.tagger import tag_asset

MEDIA_ROOT = Path(os.getenv("MEDIA_PATH", "./data/media"))
CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma_data")
CHUNK_SIZE = 512
CHUNK_STRIDE = 64

_embedder = None
_chroma_client = None


def _get_embedder():
    global _embedder
    if not _ST_AVAILABLE:
        return None
    if _embedder is None:
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder


def _get_chroma_collection():
    global _chroma_client
    if not _CHROMA_AVAILABLE:
        return None
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=CHROMA_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _chroma_client.get_or_create_collection("documents")


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
    Schedules text extraction/embedding/tagging as a background task.
    """
    sha256 = sha256_of_bytes(data)
    existing = find_duplicate(sha256, db)
    if existing:
        return existing.id

    now = datetime.utcnow()
    dest_dir = MEDIA_ROOT / "documents" / str(now.year) / f"{now.month:02d}"
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
        file_type=FileType.document,
        mime_type=mime_type,
        sha256_hash=sha256,
        file_path=str(dest_path),
        size_bytes=len(data),
    )
    db.add(asset)
    db.commit()

    background_tasks.add_task(
        _post_process_document, asset_id, data, filename, mime_type, str(dest_path), engine
    )
    return asset_id


async def _post_process_document(
    asset_id: uuid.UUID,
    data: bytes,
    filename: str,
    mime_type: str,
    file_path: str,
    engine,
) -> None:
    """
    Runs after the HTTP response is sent.
    Creates its own DB session — the request session is already closed.
    """
    text = _extract_text(data, filename, mime_type)
    if text:
        _embed_and_store(text, file_path, filename)

    summary = text[:500].strip() if text else ""

    with Session(engine) as db:
        asset = db.get(Asset, asset_id)
        if asset:
            asset.metadata_json = {
                "text_length": len(text) if text else 0,
                "summary": summary,
            }
            db.commit()

    if text:
        with Session(engine) as db:
            await tag_asset(asset_id, "document", text[:2000], db)


def _extract_text(data: bytes, filename: str, mime_type: str) -> str:
    lower = filename.lower()

    if mime_type == "application/pdf" or lower.endswith(".pdf"):
        return _extract_pdf(data)

    if mime_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) or lower.endswith(".docx"):
        return _extract_docx(data)

    if mime_type.startswith("image/"):
        return _extract_ocr(data)

    if mime_type.startswith("text/"):
        return data.decode("utf-8", errors="replace")

    return ""


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def _extract_docx(data: bytes) -> str:
    try:
        from docx import Document
    except ImportError:
        return ""
    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_ocr(data: bytes) -> str:
    try:
        from PIL import Image
        import pytesseract
    except ImportError:
        return ""
    img = Image.open(io.BytesIO(data))
    return pytesseract.image_to_string(img)


def _chunk_text(text: str) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start += CHUNK_SIZE - CHUNK_STRIDE
    return chunks


def _embed_and_store(text: str, file_path: str, filename: str) -> None:
    chunks = _chunk_text(text)
    if not chunks:
        return

    embedder = _get_embedder()
    collection = _get_chroma_collection()

    if embedder is None or collection is None:
        return

    embeddings = embedder.encode(chunks, show_progress_bar=False).tolist()
    ids = [f"{file_path}::chunk::{i}" for i in range(len(chunks))]
    metadatas = [{"file_path": file_path, "filename": filename, "chunk_index": i}
                 for i in range(len(chunks))]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add backend/ingestion/document_pipeline.py
git commit -m "perf: document pipeline — fast path returns immediately, post-process in background"
```

---

## Task 4: Update router.py and main.py — Thread BackgroundTasks + engine Through

**Files:**
- Modify: `backend/ingestion/router.py:154-177` (`route_file` signature + calls)
- Modify: `backend/main.py:104-107` (ingest endpoint)

- [ ] **Step 1: Update route_file() in router.py**

Find the `route_file` function (line 154) and replace it:

```python
async def route_file(
    file: UploadFile,
    db: Session,
    background_tasks,
    engine,
) -> uuid.UUID:
    """
    Read the upload, detect its MIME type, and delegate to the right pipeline.
    Returns the asset UUID from the pipeline that handled it.
    """
    data = await file.read()
    filename = file.filename or "unknown"

    mime_type: str = _detect_mime(data)

    if mime_type in _PHOTO_MIMES:
        return await photo_pipeline.run(filename, data, mime_type, db, background_tasks, engine)

    if mime_type.startswith(_VIDEO_MIMES_PREFIX):
        return await _video_pipeline(filename, data, mime_type, db)

    if mime_type.startswith(_AUDIO_MIMES_PREFIX):
        return await _audio_pipeline(filename, data, mime_type, db)

    if mime_type in _DOCUMENT_MIMES or mime_type.startswith("text/"):
        return await document_pipeline.run(filename, data, mime_type, db, background_tasks, engine)

    # Fallback: treat as document
    return await document_pipeline.run(filename, data, mime_type, db, background_tasks, engine)
```

- [ ] **Step 2: Update the ingest endpoint in main.py**

In `backend/main.py`, add `BackgroundTasks` to the imports line (it's already in `fastapi` — just add it to the existing import):

```python
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
```

Then find the ingest endpoint and replace it:

```python
@app.post("/api/v1/ingest")
async def ingest(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
):
    asset_id = await route_file(file, db, background_tasks, engine)
    return {"asset_id": str(asset_id), "filename": file.filename}
```

- [ ] **Step 3: Verify imports and signatures**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault/backend
grep -n "BackgroundTasks\|route_file\|background_tasks" main.py ingestion/router.py
```

Expected: `BackgroundTasks` appears in main.py import line and ingest function; `background_tasks` and `engine` appear in router.py's `route_file` signature and its calls.

- [ ] **Step 4: Smoke-test that the server starts**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault/backend
/Users/mauriciovallartapena/troy-vault/troy-vault/backend/venv/bin/python3.11 -c "
import os
os.environ.setdefault('DATABASE_URL', 'sqlite:///./troy_test.db')
import main
print('Import OK')
"
```

Expected: `Import OK` with no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add backend/ingestion/router.py backend/main.py
git commit -m "perf: thread BackgroundTasks+engine through ingest endpoint to pipelines"
```
