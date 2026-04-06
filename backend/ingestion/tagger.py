"""
Ollama LLM tagger.

Sends a context prompt to the local Ollama instance and writes Tag rows
with source=llm and confidence=0.9. Silent no-op if Ollama is unreachable.
"""

import json
import os
import uuid
from typing import Literal

import httpx
from sqlalchemy.orm import Session

from models import Tag, TagSource

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
LLM_CONFIDENCE = 0.9

_PHOTO_PROMPT = """You are an image analysis assistant. Given the filename and metadata of a photo, return a JSON object with these keys:
- "description": a one-sentence scene description (string)
- "objects": list of objects or subjects visible (list of strings)
- "mood": the mood or atmosphere (string)
- "tags": list of short descriptive tags (list of strings)

Metadata:
{context}

Respond ONLY with valid JSON, no explanation."""

_DOCUMENT_PROMPT = """You are a document analysis assistant. Given the beginning of a document, return a JSON object with these keys:
- "category": the document category (string, e.g. "invoice", "report", "letter", "article")
- "summary": one-sentence summary (string)
- "entities": key named entities — people, organizations, places (list of strings)
- "tags": list of short descriptive tags (list of strings)

Document text:
{context}

Respond ONLY with valid JSON, no explanation."""


async def tag_asset(
    asset_id: uuid.UUID,
    file_type: Literal["photo", "document"],
    context_text: str,
    db: Session,
) -> None:
    """
    Call Ollama and persist Tag rows for the given asset.
    Silently returns if Ollama is unreachable or returns invalid JSON.
    """
    prompt_template = _PHOTO_PROMPT if file_type == "photo" else _DOCUMENT_PROMPT
    prompt = prompt_template.format(context=context_text[:3000])

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "format": "json"},
            )
            resp.raise_for_status()
            payload = resp.json()
    except Exception:
        return

    try:
        raw_text = payload.get("response", "")
        data = json.loads(raw_text)
    except (json.JSONDecodeError, AttributeError):
        return

    tags: list[Tag] = []

    if file_type == "photo":
        if desc := data.get("description"):
            tags.append(Tag(asset_id=asset_id, key="description", value=str(desc),
                            source=TagSource.llm, confidence=LLM_CONFIDENCE))
        if mood := data.get("mood"):
            tags.append(Tag(asset_id=asset_id, key="mood", value=str(mood),
                            source=TagSource.llm, confidence=LLM_CONFIDENCE))
        for obj in data.get("objects", []):
            if isinstance(obj, str) and obj.strip():
                tags.append(Tag(asset_id=asset_id, key="object", value=obj.strip(),
                                source=TagSource.llm, confidence=LLM_CONFIDENCE))
        for tag_val in data.get("tags", []):
            if isinstance(tag_val, str) and tag_val.strip():
                tags.append(Tag(asset_id=asset_id, key="tag", value=tag_val.strip(),
                                source=TagSource.llm, confidence=LLM_CONFIDENCE))

    else:  # document
        if category := data.get("category"):
            tags.append(Tag(asset_id=asset_id, key="category", value=str(category),
                            source=TagSource.llm, confidence=LLM_CONFIDENCE))
        if summary := data.get("summary"):
            tags.append(Tag(asset_id=asset_id, key="summary", value=str(summary),
                            source=TagSource.llm, confidence=LLM_CONFIDENCE))
        for entity in data.get("entities", []):
            if isinstance(entity, str) and entity.strip():
                tags.append(Tag(asset_id=asset_id, key="entity", value=entity.strip(),
                                source=TagSource.llm, confidence=LLM_CONFIDENCE))
        for tag_val in data.get("tags", []):
            if isinstance(tag_val, str) and tag_val.strip():
                tags.append(Tag(asset_id=asset_id, key="tag", value=tag_val.strip(),
                                source=TagSource.llm, confidence=LLM_CONFIDENCE))

    if tags:
        db.add_all(tags)
        db.commit()
