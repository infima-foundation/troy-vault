"""
Chat router — /api/v1/chat/*

Conversations + messages backed by SQLite.
Each message send queries ChromaDB for RAG context, then calls Ollama /api/chat.
"""

import json
import os
import uuid
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Conversation, Message, MessageRole

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma_data")

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class ConversationOut(BaseModel):
    id: str
    title: str | None
    pinned: bool
    last_message: str | None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class CreateConversationRequest(BaseModel):
    title: str | None = None


class PatchConversationRequest(BaseModel):
    pinned: bool | None = None
    title: str | None = None


class Profile(BaseModel):
    name: str = ""
    occupation: str = ""
    about: str = ""
    language: str = "en"
    tone: str = "casual"


class SendMessageRequest(BaseModel):
    content: str
    profile: Profile | None = None


# ─── RAG helpers ──────────────────────────────────────────────────────────────

def _get_chroma_collection():
    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings
        client = chromadb.PersistentClient(
            path=CHROMA_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        return client.get_collection("documents")
    except Exception:
        return None


def _embed_query(text: str):
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        return model.encode(text).tolist()
    except Exception:
        return None


async def _rag_context(query: str, n_results: int = 5) -> str:
    """Return relevant document chunks as a formatted string, or empty string."""
    try:
        collection = _get_chroma_collection()
        if collection is None:
            return ""

        embedding = _embed_query(query)
        if embedding is None:
            return ""

        results = collection.query(query_embeddings=[embedding], n_results=n_results)
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]

        if not docs:
            return ""

        parts = []
        for doc, meta in zip(docs, metas):
            filename = meta.get("filename", "unknown") if meta else "unknown"
            parts.append(f"[Source: {filename}]\n{doc}")

        return "\n\n---\n\n".join(parts)
    except Exception:
        return ""


# ─── System prompt ────────────────────────────────────────────────────────────

def _build_system_prompt(rag_context: str, profile: Profile | None) -> str:
    p = profile or Profile()

    lines = [
        "You are TROY, a personal AI assistant with access to the user's private file vault.",
        "Answer based on the user's documents when relevant. Be concise and direct.",
        "Cite the source filename (in brackets) when using document content.",
    ]

    if p.name:
        intro = f"You are speaking with {p.name}"
        if p.occupation:
            intro += f", who works as {p.occupation}"
        lines.append(intro + ".")

    if p.about:
        lines.append(f"About the user: {p.about}")

    tone_map = {
        "formal": "Use a formal, professional tone.",
        "casual": "Use a friendly, conversational tone.",
        "concise": "Be extremely concise — give short answers only.",
    }
    lines.append(tone_map.get(p.tone, "Use a friendly, conversational tone."))

    if rag_context:
        lines.append("\n## Relevant excerpts from the user's vault:\n")
        lines.append(rag_context)
    else:
        lines.append("\nNo document excerpts matched this query. Answer from general knowledge if helpful.")

    return "\n\n".join(lines)


# ─── Serialisers ──────────────────────────────────────────────────────────────

def _conv_out(conv: Conversation) -> dict:
    last = conv.messages[-1].content if conv.messages else None
    return {
        "id": str(conv.id),
        "title": conv.title,
        "pinned": conv.pinned,
        "last_message": last[:120] if last else None,
        "created_at": conv.updated_at.isoformat() if conv.updated_at else conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else conv.created_at.isoformat(),
    }


def _msg_out(msg: Message) -> dict:
    return {
        "id": str(msg.id),
        "role": msg.role.value,
        "content": msg.content,
        "created_at": msg.created_at.isoformat(),
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

def get_db():
    """Re-imported here to avoid circular deps; main.py engine is used via import."""
    from main import engine
    with Session(engine) as session:
        yield session


@router.post("/conversations")
def create_conversation(
    req: CreateConversationRequest = CreateConversationRequest(),
    db: Session = Depends(get_db),
):
    conv = Conversation(title=req.title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return _conv_out(conv)


@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db)):
    convs = db.scalars(
        select(Conversation).order_by(Conversation.updated_at.desc())
    ).all()
    return [_conv_out(c) for c in convs]


@router.patch("/conversations/{conv_id}")
def patch_conversation(conv_id: str, req: PatchConversationRequest, db: Session = Depends(get_db)):
    try:
        cid = uuid.UUID(conv_id)
    except ValueError:
        raise HTTPException(422, "Invalid conversation ID")
    conv = db.get(Conversation, cid)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if req.pinned is not None:
        conv.pinned = req.pinned
    if req.title is not None:
        conv.title = req.title
    db.commit()
    db.refresh(conv)
    return _conv_out(conv)


@router.delete("/conversations/{conv_id}", status_code=204)
def delete_conversation(conv_id: str, db: Session = Depends(get_db)):
    try:
        cid = uuid.UUID(conv_id)
    except ValueError:
        raise HTTPException(422, "Invalid conversation ID")
    conv = db.get(Conversation, cid)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    db.delete(conv)
    db.commit()


@router.get("/conversations/{conv_id}/messages")
def get_messages(conv_id: str, db: Session = Depends(get_db)):
    try:
        cid = uuid.UUID(conv_id)
    except ValueError:
        raise HTTPException(422, "Invalid conversation ID")
    conv = db.get(Conversation, cid)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return [_msg_out(m) for m in conv.messages]


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, req: SendMessageRequest, db: Session = Depends(get_db)):
    try:
        cid = uuid.UUID(conv_id)
    except ValueError:
        raise HTTPException(422, "Invalid conversation ID")
    conv = db.get(Conversation, cid)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    # Auto-title from first user message
    if not conv.title:
        conv.title = req.content[:80]

    # Persist user message
    user_msg = Message(conversation_id=cid, role=MessageRole.user, content=req.content)
    db.add(user_msg)
    db.flush()

    # Build message history for Ollama (read while session is open)
    history = db.scalars(
        select(Message)
        .where(Message.conversation_id == cid)
        .order_by(Message.created_at)
    ).all()

    # RAG context
    rag_context = await _rag_context(req.content)
    system_prompt = _build_system_prompt(rag_context, req.profile)

    ollama_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for m in history:
        ollama_messages.append({"role": m.role.value, "content": m.content})

    # Commit user message before we start streaming
    db.commit()

    async def stream_tokens():
        full_content = ""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_HOST}/api/chat",
                    json={"model": OLLAMA_MODEL, "messages": ollama_messages, "stream": True},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        token = data.get("message", {}).get("content", "")
                        if token:
                            full_content += token
                            yield f"data: {json.dumps({'token': token})}\n\n"
                        if data.get("done"):
                            break
        except Exception:
            full_content = (
                "I'm having trouble reaching the language model right now. "
                "Please make sure Ollama is running with `ollama serve`."
            )
            yield f"data: {json.dumps({'token': full_content})}\n\n"

        # Persist assistant message with a fresh session (injected session may be closing)
        from main import engine as _engine
        with Session(_engine) as sess:
            asst_msg = Message(
                conversation_id=cid,
                role=MessageRole.assistant,
                content=full_content or "(no response)",
            )
            sess.add(asst_msg)
            c = sess.get(Conversation, cid)
            if c:
                c.updated_at = datetime.utcnow()
            sess.commit()
            sess.refresh(asst_msg)
            done_event = {
                "done": True,
                "id": str(asst_msg.id),
                "role": "assistant",
                "content": asst_msg.content,
                "created_at": asst_msg.created_at.isoformat(),
            }

        yield f"data: {json.dumps(done_event)}\n\n"

    return StreamingResponse(
        stream_tokens(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
