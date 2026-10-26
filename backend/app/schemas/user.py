from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal


class UserBase(BaseModel):
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    status: str = "offline"
    custom_activity: Optional[str] = Field(default=None, max_length=150)


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8)
    invite_code: str = Field(min_length=1, max_length=100)
    avatar_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator('username', 'display_name', mode='before')
    @classmethod
    def normalize(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator('password')
    @classmethod
    def password_size(cls, value):
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password must be at most 72 UTF-8 bytes')
        return value


class UserLogin(BaseModel):
    username: str
    password: str


class UserStatusUpdate(BaseModel):
    status: Optional[Literal['online', 'idle', 'dnd', 'offline']] = None
    custom_activity: Optional[str] = Field(default=None, max_length=150)


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    avatar_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator('display_name', mode='before')
    @classmethod
    def normalize(cls, value):
        return value.strip() if isinstance(value, str) else value
    status: Optional[Literal['online', 'idle', 'dnd', 'offline']] = None
    custom_activity: Optional[str] = Field(default=None, max_length=150)


class UserOut(UserBase):
    id: str
    is_admin: bool
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
