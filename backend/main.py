import os, sys, logging
logging.basicConfig(level=logging.INFO, stream=sys.stdout, force=True)
logger = logging.getLogger(__name__)
logger.info(f"Python {sys.version}")
logger.info(f"PORT={os.environ.get('PORT', 'NOT SET')}")
logger.info(f"DATABASE_URL={'SET' if os.environ.get('DATABASE_URL') else 'NOT SET'}")

import uuid as _uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

logger.info("Starting TROY Vault backend...")

import sentry_sdk
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN", ""),
    integrations=[StarletteIntegration(), FastApiIntegration()],
    traces_sample_rate=1.0,
)

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, select, func, or_, text
from sqlalchemy.orm import Session
import uvicorn

from models import Base, Asset, FileType, Folder
from ingestion.router import route_file
from chat import router as chat_router

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./troy.db")
MEDIA_PATH = os.getenv("MEDIA_PATH", "./data/media")

_engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **_engine_kwargs)

_MIGRATIONS = [
    "ALTER TABLE assets ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE",
    "ALTER TABLE assets ADD COLUMN deleted_at DATETIME",
    "ALTER TABLE assets ADD COLUMN is_starred BOOLEAN DEFAULT FALSE",
    "ALTER TABLE conversations ADD COLUMN is_starred BOOLEAN DEFAULT FALSE",
    "ALTER TABLE assets ADD COLUMN folder_id VARCHAR(36)",
    "ALTER TABLE assets ADD COLUMN user_id VARCHAR(256)",
    "ALTER TABLE folders ADD COLUMN user_id VARCHAR(256)",
    "ALTER TABLE conversations ADD COLUMN user_id VARCHAR(256)",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Run migrations (idempotent — ignore errors when column already exists)
    with engine.connect() as conn:
        for stmt in _MIGRATIONS:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass
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
async def ingest(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
):
    asset_id = await route_file(file, db, background_tasks, engine)
    return {"asset_id": str(asset_id), "filename": file.filename}


# ---------------------------------------------------------------------------
# Assets list
# ---------------------------------------------------------------------------

@app.get("/api/v1/assets")
def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    file_type: FileType | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    tags: str | None = Query(None),
    deleted: bool = Query(False, description="If true, return only soft-deleted assets"),
    folder_id: str | None = Query(None, description="Filter by folder; 'root' for top-level only"),
    user_id: str | None = Query(None, description="Filter by owner user ID"),
    db: Session = Depends(get_db),
):
    stmt = select(Asset)

    if deleted:
        stmt = stmt.where(Asset.is_deleted == True)
    else:
        stmt = stmt.where(Asset.is_deleted == False)

    if user_id:
        stmt = stmt.where(Asset.user_id == user_id)

    if folder_id == "root":
        stmt = stmt.where(Asset.folder_id == None)
    elif folder_id:
        try:
            fid = _uuid.UUID(folder_id)
            stmt = stmt.where(Asset.folder_id == fid)
        except ValueError:
            pass

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
    if not asset or asset.is_deleted:
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
    like = f"%{q}%"
    stmt = (
        select(Asset)
        .where(Asset.is_deleted == False)
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
# Thumbnail / file serving
# ---------------------------------------------------------------------------

@app.get("/api/v1/assets/{asset_id}/thumbnail")
def get_thumbnail(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for candidate in [asset.thumbnail_path, asset.file_path]:
        if candidate and Path(candidate).exists():
            suffix = Path(candidate).suffix.lower()
            media_type = {
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp",
                ".gif": "image/gif", ".heic": "image/heic",
                ".heif": "image/heif",
            }.get(suffix, "application/octet-stream")
            return FileResponse(
                candidate,
                media_type=media_type,
                headers={"Cache-Control": "public, max-age=31536000"},
            )

    raise HTTPException(status_code=404, detail="No image file available for this asset")


@app.get("/api/v1/assets/{asset_id}/file")
def get_file(asset_id: str, db: Session = Depends(get_db)):
    """Serve the original file for download."""
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.file_path and Path(asset.file_path).exists():
        return FileResponse(
            asset.file_path,
            media_type=asset.mime_type or "application/octet-stream",
            filename=asset.filename,
        )
    raise HTTPException(status_code=404, detail="File not found on disk")


# ---------------------------------------------------------------------------
# Soft delete / restore / permanent delete
# ---------------------------------------------------------------------------

@app.delete("/api/v1/assets/{asset_id}", status_code=200)
def soft_delete_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.is_deleted = True
    asset.deleted_at = datetime.utcnow()
    db.commit()
    return {"id": str(asset.id), "is_deleted": True}


@app.post("/api/v1/assets/{asset_id}/restore", status_code=200)
def restore_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.is_deleted = False
    asset.deleted_at = None
    db.commit()
    return {"id": str(asset.id), "is_deleted": False}


@app.delete("/api/v1/assets/{asset_id}/permanent", status_code=200)
def permanent_delete_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    # Remove files from disk
    for path in [asset.file_path, asset.thumbnail_path]:
        if path:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass
    db.delete(asset)
    db.commit()
    return {"id": asset_id, "deleted": True}


# ---------------------------------------------------------------------------
# Content update (editor auto-save)
# ---------------------------------------------------------------------------

class ContentUpdateRequest(BaseModel):
    content: str


@app.patch("/api/v1/assets/{asset_id}/content")
def update_content(asset_id: str, req: ContentUpdateRequest, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.file_path:
        try:
            Path(asset.file_path).write_text(req.content, encoding="utf-8")
            asset.size_bytes = len(req.content.encode("utf-8"))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to write file: {e}")
    db.commit()
    return {"id": str(asset.id), "size_bytes": asset.size_bytes}


# ---------------------------------------------------------------------------
# Filename rename
# ---------------------------------------------------------------------------

class FilenameUpdateRequest(BaseModel):
    filename: str


@app.patch("/api/v1/assets/{asset_id}/filename")
def rename_asset(asset_id: str, req: FilenameUpdateRequest, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    new_name = req.filename.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="Filename cannot be empty")
    # Rename file on disk
    if asset.file_path:
        old_path = Path(asset.file_path)
        new_path = old_path.parent / new_name
        if old_path.exists() and not new_path.exists():
            try:
                old_path.rename(new_path)
                asset.file_path = str(new_path)
            except Exception:
                pass
    asset.filename = new_name
    db.commit()
    return _asset_summary(asset)


# ---------------------------------------------------------------------------
# Move asset to folder
# ---------------------------------------------------------------------------

class MoveFolderRequest(BaseModel):
    folder_id: str | None = None  # None = move to root


@app.patch("/api/v1/assets/{asset_id}/folder")
def move_asset_to_folder(asset_id: str, req: MoveFolderRequest, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if req.folder_id:
        fid = _parse_uuid(req.folder_id)
        folder = db.get(Folder, fid)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        asset.folder_id = fid
    else:
        asset.folder_id = None
    db.commit()
    return _asset_summary(asset)


# ---------------------------------------------------------------------------
# Star / unstar asset
# ---------------------------------------------------------------------------

@app.patch("/api/v1/assets/{asset_id}/star")
def star_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, _parse_uuid(asset_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.is_starred = not asset.is_starred
    db.commit()
    return {"id": str(asset.id), "is_starred": asset.is_starred}


@app.post("/api/v1/assets/{asset_id}/duplicate", status_code=201)
def duplicate_asset(asset_id: str, db: Session = Depends(get_db)):
    """Create a copy of an asset with a new file and unique SHA-256."""
    import hashlib, shutil
    original = db.get(Asset, _parse_uuid(asset_id))
    if not original:
        raise HTTPException(status_code=404, detail="Asset not found")

    src = Path(original.file_path)
    if not src.exists():
        raise HTTPException(status_code=422, detail="Source file not found on disk")

    # Build a copy path: same dir, stem + "_copy[N]"
    dest = src.parent / f"{src.stem}_copy{src.suffix}"
    counter = 1
    while dest.exists():
        dest = src.parent / f"{src.stem}_copy{counter}{src.suffix}"
        counter += 1

    shutil.copy2(src, dest)

    new_sha = hashlib.sha256(dest.read_bytes()).hexdigest()
    new_id = _uuid.uuid4()
    stem_name = src.stem
    copy_filename = f"{stem_name}_copy{src.suffix}"

    new_asset = Asset(
        id=new_id,
        filename=copy_filename,
        file_type=original.file_type,
        mime_type=original.mime_type,
        sha256_hash=new_sha,
        file_path=str(dest),
        thumbnail_path=original.thumbnail_path,
        size_bytes=dest.stat().st_size,
        captured_at=original.captured_at,
        camera_make=original.camera_make,
        camera_model=original.camera_model,
        lat=original.lat,
        lon=original.lon,
        metadata_json=original.metadata_json,
        folder_id=original.folder_id,
    )
    db.add(new_asset)
    db.commit()
    return _asset_summary(new_asset)


# ---------------------------------------------------------------------------
# Create document/spreadsheet/presentation asset
# ---------------------------------------------------------------------------

class CreateDocumentRequest(BaseModel):
    filename: str
    doc_type: str = "document"  # document | spreadsheet | presentation


@app.post("/api/v1/documents/new")
def create_document(req: CreateDocumentRequest, db: Session = Depends(get_db)):
    """Create a new empty editable document asset."""
    import hashlib
    media_path = Path(MEDIA_PATH)
    media_path.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    safe_name = req.filename or f"Untitled {req.doc_type.capitalize()}"
    if req.doc_type == "spreadsheet":
        ext = ".csv"
        mime = "text/csv"
        content = ""
    elif req.doc_type == "presentation":
        ext = ".md"
        mime = "text/markdown"
        content = "# Presentation\n\n## Slide 1\n\n"
    else:
        ext = ".md"
        mime = "text/markdown"
        content = f"# {safe_name}\n\n"

    if not safe_name.endswith(ext):
        safe_name = safe_name + ext

    file_path = media_path / safe_name
    # Avoid collisions
    counter = 1
    while file_path.exists():
        stem = Path(safe_name).stem
        file_path = media_path / f"{stem} ({counter}){ext}"
        counter += 1

    file_path.write_text(content, encoding="utf-8")
    content_bytes = content.encode("utf-8")
    sha256 = hashlib.sha256(content_bytes).hexdigest()

    asset = Asset(
        filename=file_path.name,
        file_type=FileType.document,
        mime_type=mime,
        sha256_hash=sha256,
        file_path=str(file_path),
        size_bytes=len(content_bytes),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _asset_summary(asset)


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

class CreateFolderRequest(BaseModel):
    name: str
    parent_id: str | None = None


class PatchFolderRequest(BaseModel):
    name: str | None = None
    is_starred: bool | None = None
    parent_id: str | None = None


@app.post("/api/v1/folders", status_code=201)
def create_folder(req: CreateFolderRequest, db: Session = Depends(get_db)):
    parent = None
    if req.parent_id:
        parent = db.get(Folder, _parse_uuid(req.parent_id))
        if not parent:
            raise HTTPException(404, "Parent folder not found")
    folder = Folder(name=req.name.strip(), parent_id=parent.id if parent else None)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _folder_out(folder)


@app.get("/api/v1/folders")
def list_folders(
    parent_id: str | None = Query(None, description="'root' for top-level, or a UUID"),
    user_id: str | None = Query(None, description="Filter by owner user ID"),
    db: Session = Depends(get_db),
):
    stmt = select(Folder)
    if parent_id == "all":
        pass  # return all folders regardless of nesting
    elif parent_id == "root" or parent_id is None:
        stmt = stmt.where(Folder.parent_id == None)
    else:
        try:
            pid = _uuid.UUID(parent_id)
            stmt = stmt.where(Folder.parent_id == pid)
        except ValueError:
            stmt = stmt.where(Folder.parent_id == None)
    if user_id:
        stmt = stmt.where(Folder.user_id == user_id)
    folders = db.scalars(stmt.order_by(Folder.name)).all()
    return [_folder_out(f) for f in folders]


@app.get("/api/v1/folders/{folder_id}")
def get_folder(folder_id: str, db: Session = Depends(get_db)):
    folder = db.get(Folder, _parse_uuid(folder_id))
    if not folder:
        raise HTTPException(404, "Folder not found")
    return _folder_out(folder)


@app.patch("/api/v1/folders/{folder_id}")
def patch_folder(folder_id: str, req: PatchFolderRequest, db: Session = Depends(get_db)):
    folder = db.get(Folder, _parse_uuid(folder_id))
    if not folder:
        raise HTTPException(404, "Folder not found")
    if req.name is not None:
        folder.name = req.name.strip()
    if req.is_starred is not None:
        folder.is_starred = req.is_starred
    if req.parent_id is not None:
        folder.parent_id = _parse_uuid(req.parent_id)
    from datetime import datetime as _dt
    folder.updated_at = _dt.utcnow()
    db.commit()
    db.refresh(folder)
    return _folder_out(folder)


@app.delete("/api/v1/folders/{folder_id}", status_code=200)
def delete_folder(folder_id: str, db: Session = Depends(get_db)):
    folder = db.get(Folder, _parse_uuid(folder_id))
    if not folder:
        raise HTTPException(404, "Folder not found")
    # Unset folder_id on assets in this folder
    for asset in folder.assets:
        asset.folder_id = None
    db.delete(folder)
    db.commit()
    return {"id": folder_id, "deleted": True}


@app.patch("/api/v1/folders/{folder_id}/star")
def star_folder(folder_id: str, db: Session = Depends(get_db)):
    folder = db.get(Folder, _parse_uuid(folder_id))
    if not folder:
        raise HTTPException(404, "Folder not found")
    folder.is_starred = not folder.is_starred
    db.commit()
    return _folder_out(folder)


def _folder_out(f: Folder) -> dict:
    return {
        "id": str(f.id),
        "name": f.name,
        "parent_id": str(f.parent_id) if f.parent_id else None,
        "is_starred": f.is_starred,
        "asset_count": len(f.assets),
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    }


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
        "is_deleted": asset.is_deleted,
        "deleted_at": asset.deleted_at.isoformat() if asset.deleted_at else None,
        "is_starred": asset.is_starred,
        "folder_id": str(asset.folder_id) if asset.folder_id else None,
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
