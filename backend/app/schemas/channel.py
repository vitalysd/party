from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal
from app.schemas.user import UserOut


class ChannelBase(BaseModel):
    name: str
    type: str = "text"  # "text" | "voice"
    description: Optional[str] = None
    icon: Optional[str] = None
    banner_url: Optional[str] = None
    is_direct: bool = False


class ChannelCreate(ChannelBase):
    name: str = Field(min_length=1, max_length=100)
    type: Literal['text', 'voice'] = 'text'
    icon: Optional[str] = Field(default=None, max_length=100)
    member_ids: Optional[List[str]] = None

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError('Room name cannot be blank')
        return value.strip()


class ChannelUpdate(BaseModel):
    icon: str = Field(min_length=1, max_length=100)


class ChannelMemberOut(BaseModel):
    id: str
    user_id: str
    channel_id: str
    role: str
    joined_at: datetime
    user: Optional[UserOut] = None

    model_config = ConfigDict(from_attributes=True)


class ChannelOut(ChannelBase):
    id: str
    created_at: datetime
    members: List[ChannelMemberOut] = []

    model_config = ConfigDict(from_attributes=True)
