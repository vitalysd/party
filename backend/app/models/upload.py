from typing import Optional
from datetime import datetime, timezone
from sqlalchemy import String, ForeignKey, Integer, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    channel_id: Mapped[Optional[str]] = mapped_column(ForeignKey("channels.id"), index=True)
    is_avatar: Mapped[bool] = mapped_column(Boolean, default=False)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False)
