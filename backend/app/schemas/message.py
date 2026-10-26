from datetime import datetime
from uuid import UUID
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserOut


class AttachmentSchema(BaseModel):
    url: str
    filename: str
    size: int
    content_type: str


class ReactionOut(BaseModel):
    id: str
    message_id: str
    user_id: str
    emoji: str
    created_at: datetime
    user: Optional[UserOut] = None

    model_config = ConfigDict(from_attributes=True)


class ReactionCreate(BaseModel):
    emoji: str


class MessageCreate(BaseModel):
    client_request_id: Optional[UUID] = None
    content: str = ""
    reply_to_id: Optional[str] = None
    attachments: Optional[List[AttachmentSchema]] = None


class MessageReplyOut(BaseModel):
    id: str
    sender_id: str
    content: str
    sender: Optional[UserOut] = None

    model_config = ConfigDict(from_attributes=True)


class MessageOut(BaseModel):
    client_request_id: Optional[str] = None
    id: str
    channel_id: str
    sender_id: str
    content: str
    reply_to_id: Optional[str] = None
    attachments: Optional[List[dict[str, Any]]] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    sender: Optional[UserOut] = None
    reply_to: Optional[MessageReplyOut] = None
    reactions: List[ReactionOut] = []

    model_config = ConfigDict(from_attributes=True)
