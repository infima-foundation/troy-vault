import os
import uuid as _uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, select, func, or_
from sqlalchemy.orm import Session
import uvicorn

from models import Base, Asset, FileType
from ingestion.router import route_file
from chat import router as chat_router

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./troy.db")

_engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **_engine_kwargs)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="troy-vault", version="0.1.0", lifespan=lifespan)

app.include_router(chat_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    with Session(engine) as session:
        yield session


def _parse_uuid(asset_id: str) -> _uuid.UUID:
    """Parse a UUID string and raise 422 if invalid."""
    try:
        return _uuid.UUID(asset_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid asset ID: {asset_id}")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "troy-vault"}


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

@app.post("/api/v1/ingest")
async def ingest(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Accept a single file upload and route it through the appropriate pipeline."""
    asset_id = await route_file(file, db)
    return {"asset_id": str(asset_id), "filename": file.filename}


# ---------------------------------------------------------------------------
# Assets list
# ---------------------------------------------------------------------------

@app.get("/api/v1/assets")
def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    file_type: FileType | None = Query(None),
    date_from: str | None = Query(None, description="ISO date, e.g. 2024-01-01"),
    date_to: str | None = Query(None, description="ISO date, e.g. 2024-12-31"),
    tags: str | None = Query(None, description="Comma-separated tag values"),
    db: Session = Depends(get_db),
):
    stmt = select(Asset)

    if file_type:
        stmt = stmt.where(Asset.file_type == file_type)
    if date_from:
        stmt = stmt.where(Asset.captured_at >= date_from)
    if date_to:
        stmt = stmt.where(Asset.captured_at <= date_to)
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        stmt = stmt.where(
            or_(*[Asset.tags.any(value=t) for t in tag_list])
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(
        stmt.order_by(Asset.ingested_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_asset_summary(a) for a in rows],
    }


# ---------------------------------------------------------------------------
# Single asset
# ---------------------------------------------------------------------------

@app.get("/api/v1/assets/{asset_id}")
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_detail(asset)


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@app.get("/api/v1/search")
def search_assets(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Full-text search over filename and tag values."""
    like = f"%{q}%"
    stmt = (
        select(Asset)
        .where(
            or_(
                Asset.filename.ilike(like),
                Asset.tags.any(Asset.tags.property.mapper.class_.value.ilike(like)),
            )
        )
        .order_by(Asset.ingested_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = db.scalars(stmt).all()
    return {"query": q, "items": [_asset_summary(a) for a in rows]}


# ---------------------------------------------------------------------------
# Thumbnail
# ---------------------------------------------------------------------------

@app.get("/api/v1/assets/{asset_id}/thumbnail")
def get_thumbnail(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Prefer the pre-generated thumbnail; fall back to the original file.
    for candidate in [asset.thumbnail_path, asset.file_path]:
        if candidate and Path(candidate).exists():
            # Guess a reasonable media type from the extension.
            suffix = Path(candidate).suffix.lower()
            media_type = {
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp",
                ".gif": "image/gif", ".heic": "image/heic",
                ".heif": "image/heif",
            }.get(suffix, "application/octet-stream")
            return FileResponse(candidate, media_type=media_type)

    raise HTTPException(status_code=404, detail="No image file available for this asset")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _asset_summary(asset: Asset) -> dict:
    return {
        "id": str(asset.id),
        "filename": asset.filename,
        "file_type": asset.file_type,
        "mime_type": asset.mime_type,
        "size_bytes": asset.size_bytes,
        "captured_at": asset.captured_at.isoformat() if asset.captured_at else None,
        "ingested_at": asset.ingested_at.isoformat() if asset.ingested_at else None,
        "thumbnail_path": asset.thumbnail_path,
        "lat": asset.lat,
        "lon": asset.lon,
        "metadata_json": asset.metadata_json,
    }


def _asset_detail(asset: Asset) -> dict:
    summary = _asset_summary(asset)
    summary.update(
        {
            "camera_make": asset.camera_make,
            "camera_model": asset.camera_model,
            "metadata_json": asset.metadata_json,
            "tags": [
                {
                    "key": t.key,
                    "value": t.value,
                    "confidence": t.confidence,
                    "source": t.source,
                }
                for t in asset.tags
            ],
            "faces": [
                {
                    "id": str(f.id),
                    "cluster_id": str(f.cluster_id) if f.cluster_id else None,
                    "bbox": f.bbox_json,
                }
                for f in asset.faces
            ],
        }
    )
    return summary


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
