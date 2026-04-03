# troy-vault

**Local-first personal media vault** by Infima Foundation.

## Architecture

- **Backend**: Python/FastAPI in `/backend`
- **Frontend**: Next.js 14 in `/webapp`
- **Infrastructure**: All services run via Docker Compose in `/infra`
- **Intelligence layer**: RAG, embeddings, and LLM patterns from [troy-core](https://github.com/infima-foundation/troy-core)

## What troy-vault adds on top of troy-core

- EXIF extraction (GPS, camera make/model, datetime)
- Face clustering via InsightFace
- Video and audio metadata extraction
- Web UI for browsing, searching, and tagging media

## Core principles

- **Never use cloud services.** All data stays local.
- **LLM**: Ollama for dev; swappable for RKLLM on hardware targets.
- **Embeddings**: sentence-transformers, running locally.
- **Vector store**: ChromaDB, persisted to `./data/chroma_data/`.
- **Media storage**: `./data/media/` mounted into the backend container.

## Running locally

```bash
docker compose -f infra/docker-compose.yml up -d
```

Services:
| Service  | Port  |
|----------|-------|
| postgres | 5432  |
| ollama   | 11434 |
| backend  | 8000  |
| webapp   | 3000  |

## Key directories

```
troy-vault/
├── backend/
│   ├── ingestion/        # Pipelines: photo, video, audio, document
│   ├── main.py           # FastAPI app + route registration
│   ├── models.py         # SQLAlchemy ORM models
│   ├── requirements.txt
│   └── Dockerfile
├── webapp/               # Next.js 14 frontend
├── infra/
│   └── docker-compose.yml
├── docs/
└── CLAUDE.md
```

## Environment variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

```
DATABASE_URL=postgresql://troy:troy@localhost:5432/troy_vault
CHROMA_PATH=./data/chroma_data
MEDIA_PATH=./data/media
OLLAMA_HOST=http://localhost:11434
```

## Development notes

- Python 3.11+ required for the backend.
- All ingestion is async; use `aiofiles` for file I/O.
- SHA-256 deduplication runs before any pipeline work.
- Thumbnails are 400px wide, JPEG, stored alongside originals under `./data/media/thumbs/`.
- Face clusters are rebuilt offline; cluster IDs are stable UUIDs per person.
