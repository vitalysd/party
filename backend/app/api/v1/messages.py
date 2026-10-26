from typing import List, Optional
from datetime import datetime, timezone
import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.channel_access import require_channel_access
from app.api.file_access import validate_attachment
from app.api.deps import get_db, get_current_user
from app.core.sockets import manager
from app.models.user import User
from app.models.channel import Channel, ChannelMember
from app.models.message import Message, Reaction, MessageSendRequest
from app.schemas.message import MessageCreate, MessageOut, ReactionCreate

router = APIRouter(tags=["messages"])


async def deliver_message(db, channel_id, event):
    channel = await db.get(Channel, channel_id)
    if channel and channel.is_direct:
        recipients = (await db.scalars(select(ChannelMember.user_id).where(ChannelMember.channel_id == channel_id))).all()
        await manager.broadcast_to_users(event, recipients)
    else:
        await manager.broadcast_to_channel(channel_id, event)


def message_query():
    """Load every relationship required by MessageOut in one shared query."""
    return select(Message).options(
        selectinload(Message.sender),
        selectinload(Message.reply_to).selectinload(Message.sender),
        selectinload(Message.reactions).selectinload(Reaction.user),
        selectinload(Message.send_request),
    )


def message_output(message: Message) -> MessageOut:
    output = MessageOut.model_validate(message)
    if message.send_request:
        output.client_request_id = message.send_request.key
    # Older records may contain cross-channel references created before validation.
    if message.reply_to and message.reply_to.channel_id != message.channel_id:
        output.reply_to = None
        output.reply_to_id = None
    return output


@router.get("/channels/{channel_id}/messages", response_model=List[MessageOut])
async def get_channel_messages(
    channel_id: str,
    limit: int = Query(50, ge=1, le=100),
    before: Optional[datetime] = None,
    before_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_channel_access(db, channel_id, current_user.id)
    query = message_query().where(Message.channel_id == channel_id)
    if before_id:
        anchor = await db.scalar(select(Message).where(
            Message.id == before_id, Message.channel_id == channel_id
        ))
        if anchor is None:
            raise HTTPException(404, "Сообщение для продолжения истории не найдено")
        query = query.where(or_(
            Message.created_at < anchor.created_at,
            and_(Message.created_at == anchor.created_at, Message.id < anchor.id),
        ))
    elif before:
        query = query.where(Message.created_at < before)

    query = query.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit)
    result = await db.execute(query)
    messages = result.scalars().all()
    return [message_output(m) for m in reversed(messages)]


async def find_previous_send(db, sender_id, request_key, payload_hash):
    previous = await db.get(MessageSendRequest, (sender_id, request_key))
    if previous is None:
        return None
    if previous.payload_hash != payload_hash:
        raise HTTPException(409, "Идентификатор отправки уже использован для другого сообщения")
    message = await db.scalar(message_query().where(Message.id == previous.message_id))
    return message_output(message)


@router.post("/channels/{channel_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    channel_id: str,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_channel_access(db, channel_id, current_user.id)
    sender_id = current_user.id
    request_key = str(data.client_request_id) if data.client_request_id else None
    payload_hash = hashlib.sha256(json.dumps(
        {"channel_id": channel_id, **data.model_dump(mode="json", exclude={"client_request_id"})},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    ).encode()).hexdigest()
    if request_key:
        previous = await find_previous_send(db, sender_id, request_key, payload_hash)
        if previous is not None:
            return previous
    if data.reply_to_id:
        reply = await db.scalar(select(Message.id).where(
            Message.id == data.reply_to_id, Message.channel_id == channel_id
        ))
        if reply is None:
            raise HTTPException(status_code=404, detail="Сообщение для ответа не найдено")

    # Serialize attachments
    attachments_dict = [await validate_attachment(db, att, channel_id, current_user.id)
                        for att in (data.attachments or [])]

    new_msg = Message(
        channel_id=channel_id,
        sender_id=current_user.id,
        content=data.content,
        reply_to_id=data.reply_to_id,
        attachments=attachments_dict,
    )
    db.add(new_msg)
    try:
        await db.flush()
        if request_key:
            db.add(MessageSendRequest(
                sender_id=sender_id, key=request_key,
                message_id=new_msg.id, payload_hash=payload_hash,
            ))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Another request with this key may have committed while we were inserting.
        if request_key:
            previous = await find_previous_send(db, sender_id, request_key, payload_hash)
            if previous is not None:
                return previous
        raise

    # Re-fetch with loaded relations
    query = message_query().where(Message.id == new_msg.id)
    res = await db.execute(query)
    msg_with_relations = res.scalars().first()

    output = message_output(msg_with_relations)

    # Broadcast to real-time subscribers
    await deliver_message(db, channel_id, {
        "type": "NEW_MESSAGE",
        "data": output.model_dump(mode="json")
    })

    return output


@router.post("/messages/{message_id}/reactions", response_model=MessageOut)
async def toggle_reaction(
    message_id: str,
    data: ReactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check message
    msg_query = message_query().where(Message.id == message_id)
    msg_res = await db.execute(msg_query)
    message = msg_res.scalars().first()
    if not message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")

    await require_channel_access(db, message.channel_id, current_user.id)

    # Check existing reaction
    existing_reaction_query = select(Reaction).where(
        Reaction.message_id == message_id,
        Reaction.user_id == current_user.id,
        Reaction.emoji == data.emoji
    )
    reaction_res = await db.execute(existing_reaction_query)
    existing_reaction = reaction_res.scalars().first()

    if existing_reaction:
        await db.delete(existing_reaction)
    else:
        new_reaction = Reaction(
            message_id=message_id,
            user_id=current_user.id,
            emoji=data.emoji,
            created_at=datetime.now(timezone.utc)
        )
        db.add(new_reaction)

    await db.commit()

    # Refresh message with updated reactions
    updated_msg_res = await db.execute(msg_query.execution_options(populate_existing=True))
    updated_message = updated_msg_res.scalars().first()
    output = message_output(updated_message)

    await deliver_message(db, updated_message.channel_id, {
        "type": "MESSAGE_UPDATED",
        "data": output.model_dump(mode="json")
    })

    return output
