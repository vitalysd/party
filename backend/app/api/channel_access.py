from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channel import Channel, ChannelMember


def visible_channels(user_id: str):
    """Public channels are shared; direct channels require membership."""
    return or_(
        Channel.is_direct.is_(False),
        Channel.members.any(ChannelMember.user_id == user_id),
    )


async def require_channel_access(db: AsyncSession, channel_id: str, user_id: str):
    channel = await db.scalar(
        select(Channel).where(Channel.id == channel_id, visible_channels(user_id))
    )
    if channel is None:
        # Do not reveal whether a private channel exists.
        raise HTTPException(status_code=404, detail="Канал не найден")
    return channel
