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
