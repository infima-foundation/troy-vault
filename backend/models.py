import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, BigInteger, Float, DateTime, ForeignKey,
    Enum as SAEnum, JSON, Text, Index, Uuid, Boolean
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class FileType(str, enum.Enum):
    photo = "photo"
    video = "video"
    audio = "audio"
    document = "document"


class TagSource(str, enum.Enum):
    exif = "exif"
    ml = "ml"
    llm = "llm"


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String(512), nullable=False)
    file_type = Column(SAEnum(FileType), nullable=False)
    mime_type = Column(String(128), nullable=False)
    sha256_hash = Column(String(64), nullable=False, unique=True, index=True)
    file_path = Column(String(1024), nullable=False)
    thumbnail_path = Column(String(1024), nullable=True)
    size_bytes = Column(BigInteger, nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=True)
    ingested_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    metadata_json = Column(JSON, nullable=True)

    # GPS
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)

    # Camera
    camera_make = Column(String(128), nullable=True)
    camera_model = Column(String(128), nullable=True)

    # Soft delete
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Star/favourite
    is_starred = Column(Boolean, nullable=False, default=False)

    # Folder organisation
    folder_id = Column(Uuid(as_uuid=True), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)

    tags = relationship("Tag", back_populates="asset", cascade="all, delete-orphan")
    faces = relationship("Face", back_populates="asset", cascade="all, delete-orphan")
    folder = relationship("Folder", back_populates="assets", foreign_keys=[folder_id])

    __table_args__ = (
        Index("ix_assets_file_type", "file_type"),
        Index("ix_assets_captured_at", "captured_at"),
        Index("ix_assets_ingested_at", "ingested_at"),
        Index("ix_assets_is_deleted", "is_deleted"),
    )


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(512), nullable=False)
    parent_id = Column(Uuid(as_uuid=True), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    is_starred = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    children = relationship("Folder", back_populates="parent", cascade="all, delete-orphan")
    parent = relationship("Folder", back_populates="children", remote_side="Folder.id")
    assets = relationship("Asset", back_populates="folder", foreign_keys="Asset.folder_id")

    __table_args__ = (Index("ix_folders_parent_id", "parent_id"),)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(
        Uuid(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    key = Column(String(128), nullable=False)
    value = Column(Text, nullable=False)
    confidence = Column(Float, nullable=True)
    source = Column(SAEnum(TagSource), nullable=False)

    asset = relationship("Asset", back_populates="tags")

    __table_args__ = (
        Index("ix_tags_asset_id", "asset_id"),
        Index("ix_tags_key_value", "key", "value"),
    )


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(256), nullable=True)
    pinned = Column(Boolean, nullable=False, default=False)
    is_starred = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    messages = relationship(
        "Message", back_populates="conversation",
        cascade="all, delete-orphan", order_by="Message.created_at",
    )

    __table_args__ = (Index("ix_conversations_updated_at", "updated_at"),)


class Message(Base):
    __tablename__ = "messages"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        Uuid(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role = Column(SAEnum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")

    __table_args__ = (Index("ix_messages_conversation_id", "conversation_id"),)


class Face(Base):
    __tablename__ = "faces"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(
        Uuid(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    cluster_id = Column(Uuid(as_uuid=True), nullable=True, index=True)
    bbox_json = Column(JSON, nullable=False)  # {x, y, w, h}

    asset = relationship("Asset", back_populates="faces")

    __table_args__ = (Index("ix_faces_asset_id", "asset_id"),)
