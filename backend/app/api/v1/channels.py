import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.channel_access import visible_channels
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.channel import Channel, ChannelMember
from app.models.upload import UploadedFile
from app.api.file_access import file_path
from app.core.storage import lock_upload_storage
from app.core.sockets import manager
from app.core.voice_rooms import close_voice_room
from app.schemas.channel import ChannelCreate, ChannelOut, ChannelUpdate

router = APIRouter(prefix="/channels", tags=["channels"])


async def managed_room(channel_id, user, db):
    channel = (await db.execute(select(Channel).where(
        Channel.id == channel_id, Channel.is_direct.is_(False)
    ).options(selectinload(Channel.members).selectinload(ChannelMember.user)))).scalar_one_or_none()
    if channel is None:
        raise HTTPException(404, 'Комната не найдена')
    if not user.is_admin and not any(m.user_id == user.id and m.role == 'owner' for m in channel.members):
        raise HTTPException(403, 'Только создатель или администратор может изменить комнату')
    return channel


@router.patch('/{channel_id}', response_model=ChannelOut)
async def update_room(channel_id: str, data: ChannelUpdate,
                      current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    channel = await managed_room(channel_id, current_user, db)
    channel.icon = data.icon
    await db.commit()
    await manager.broadcast({'type': 'ROOMS_CHANGED', 'data': {}})
    return ChannelOut.model_validate(channel)


@router.delete('/{channel_id}', status_code=204)
async def delete_room(channel_id: str, current_user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    channel = await managed_room(channel_id, current_user, db)
    await close_voice_room(f'channel:{channel_id}')
    await lock_upload_storage(db)
    keys = (await db.scalars(select(UploadedFile.key).where(UploadedFile.channel_id == channel_id))).all()
    # Database foreign keys cascade messages, memberships and file access records.
    await db.execute(delete(UploadedFile).where(UploadedFile.channel_id == channel_id))
    await db.execute(delete(Channel).where(Channel.id == channel_id))
    await db.commit()
    for key in keys:
        try:
            file_path(key).unlink(missing_ok=True)
        except OSError:
            logging.getLogger(__name__).exception('Deferred file cleanup for %s', key)
    manager.channel_subscribers.pop(channel_id, None)
    await manager.broadcast({'type': 'ROOMS_CHANGED', 'data': {'deleted_channel_id': channel_id}})


@router.get("", response_model=List[ChannelOut])
async def get_channels(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Channel)
        .where(visible_channels(current_user.id))
        .options(
            selectinload(Channel.members).selectinload(ChannelMember.user)
        )
        .order_by(Channel.created_at.asc())
    )
    result = await db.execute(query)
    channels = result.scalars().all()
    return [ChannelOut.model_validate(c) for c in channels]


@router.post("", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
async def create_channel(
    data: ChannelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    channel = Channel(
        name=data.name,
        type=data.type,
        description=data.description,
        icon=data.icon,
        banner_url=data.banner_url,
        is_direct=data.is_direct,
    )
    db.add(channel)
    await db.flush()

    # Add creator as owner
    owner_member = ChannelMember(
        channel_id=channel.id,
        user_id=current_user.id,
        role="owner"
    )
    db.add(owner_member)

    # Add other specified members if direct message or invite
    if data.member_ids:
        for mid in set(data.member_ids):
            if mid != current_user.id:
                m = ChannelMember(
                    channel_id=channel.id,
                    user_id=mid,
                    role="member"
                )
                db.add(m)

    await db.commit()

    # Re-fetch with loaded members
    query = (
        select(Channel)
        .where(visible_channels(current_user.id))
        .where(Channel.id == channel.id)
        .options(
            selectinload(Channel.members).selectinload(ChannelMember.user)
        )
    )
    res = await db.execute(query)
    full_channel = res.scalars().first()
    if not full_channel.is_direct:
        await manager.broadcast({'type': 'ROOMS_CHANGED', 'data': {}})
    return ChannelOut.model_validate(full_channel)


@router.get("/{channel_id}", response_model=ChannelOut)
async def get_channel_by_id(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Channel)
        .where(visible_channels(current_user.id))
        .where(Channel.id == channel_id)
        .options(
            selectinload(Channel.members).selectinload(ChannelMember.user)
        )
    )
    res = await db.execute(query)
    channel = res.scalars().first()
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    return ChannelOut.model_validate(channel)


@router.post("/dm/{target_user_id}", response_model=ChannelOut)
async def get_or_create_dm(
    target_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя создать диалог с собой")

    if db.bind is not None and db.bind.dialect.name == 'postgresql':
        pair = ':'.join(sorted([current_user.id, target_user_id]))
        await db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:pair, 0))'), {'pair': pair})

    target_res = await db.execute(select(User).where(User.id == target_user_id))
    target_user = target_res.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Search for an existing direct channel that includes both users
    query = (
        select(Channel)
        .where(visible_channels(current_user.id))
        .where(Channel.is_direct == True)  # noqa: E712
        .options(
            selectinload(Channel.members).selectinload(ChannelMember.user)
        )
    )
    res = await db.execute(query)
    direct_channels = res.scalars().all()

    for ch in direct_channels:
        member_ids = {m.user_id for m in ch.members}
        if member_ids == {current_user.id, target_user_id}:
            return ChannelOut.model_validate(ch)

    # If no DM channel exists yet, create one
    new_dm = Channel(
        name=target_user.display_name,
        type="text",
        description=f"Личная переписка · только вы и {target_user.display_name}",
        icon="message-square",
        is_direct=True,
    )
    db.add(new_dm)
    await db.flush()

    m1 = ChannelMember(channel_id=new_dm.id, user_id=current_user.id, role="owner")
    m2 = ChannelMember(channel_id=new_dm.id, user_id=target_user_id, role="member")
    db.add_all([m1, m2])
    await db.commit()

    re_res = await db.execute(
        select(Channel)
        .where(visible_channels(current_user.id))
        .where(Channel.id == new_dm.id)
        .options(
            selectinload(Channel.members).selectinload(ChannelMember.user)
        )
    )
    created_dm = re_res.scalars().first()
    return ChannelOut.model_validate(created_dm)

