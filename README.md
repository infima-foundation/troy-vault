# TROY Vault — Your Personal Sovereign Cloud

TROY Vault is a local-first personal media vault that gives you the privacy of keeping all your photos, videos, audio, and documents on your own hardware, combined with the intelligence of modern AI — semantic search, automatic tagging, face recognition, and LLM-powered insights — without a single byte leaving your machine.

---

## Why TROY Vault

|  | Privacy First | AI Powered | Open Source |
|---|---|---|---|
| | All data stays on your device. No cloud sync, no telemetry, no subscriptions. Your media is yours. | Automatic tagging via LLM, semantic search via embeddings, face clustering via InsightFace — all running locally. | Built by [Infima Foundation](https://github.com/infima-foundation). MIT licensed. Fork it, extend it, own it. |

---

## Screenshots

> **Demo screenshots coming soon**

---

## Architecture

```
  Mobile / Web Browser
         │
         ▼
  ┌─────────────────┐
  │  Next.js 16 UI  │  :3000
  └────────┬────────┘
           │ REST API
           ▼
  ┌─────────────────┐
  │ FastAPI Backend │  :8000
  └──┬──────────┬───┘
     │          │
     ▼          ▼
  ┌──────┐  ┌──────────┐
  │  PG  │  │ ChromaDB │   ← vector embeddings
  └──────┘  └──────────┘
     │
     ▼
  ┌──────────────┐
  │  Ollama LLM  │  :11434  ← local model inference
  └──────────────┘
     │
     ▼
  ┌──────────────────┐
  │  Local Storage   │  ./data/media/
  │  photos · videos │
  │  audio · docs    │
  └──────────────────┘
```

---

## Quickstart

```bash
git clone https://github.com/infima-foundation/troy-vault
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
```

Open [http://localhost:3000](http://localhost:3000).

---

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 1 — Vault** | Ingest, deduplicate, tag, and search all personal media. Face clustering. EXIF extraction. Web UI. | ✅ Current |
| **Phase 2 — Assistant** | Conversational interface over your vault. RAG-powered answers from your own documents and memories. | 🔜 Planned |
| **Phase 3 — Hardware Appliance** | Pre-configured hardware target (RKLLM). Plug-and-play sovereign home server. Zero setup. | 🔮 Future |

---

## Contributing

Issues and pull requests are welcome. See [CLAUDE.md](CLAUDE.md) for architecture notes and development setup.

Built by [Infima Foundation](https://github.com/infima-foundation).
