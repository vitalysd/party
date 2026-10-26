from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserOut


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None


class InviteCreate(BaseModel):
    code: Optional[str] = None  # If None, generate automatically
    max_uses: int = 0  # 0 = infinite


class InviteOut(BaseModel):
    id: str
    code: str
    created_by_id: Optional[str]
    max_uses: int
    uses_count: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
