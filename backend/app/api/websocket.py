import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.api.channel_access import require_channel_access
from app.core.database import AsyncSessionLocal
from app.core.security import decode_access_token
from app.core.sockets import manager
from app.models.user import User
from app.core.calls import calls

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = decode_access_token(token)
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Verify user exists in database
    async with AsyncSessionLocal() as session:
        user_res = await session.execute(select(User).where(User.id == user_id))
        user = user_res.scalars().first()
        if not user or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    was_online = manager.is_user_online(user_id)
    await manager.connect(websocket, user_id)

    # Broadcast that user came online only if this is their first connection
    if not was_online:
        await manager.broadcast({
            "type": "USER_STATUS_CHANGED",
            "data": {
                "user_id": user_id,
                "status": "online",
                "display_name": user.display_name
            }
        })

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                msg_payload = json.loads(raw_text)
            except json.JSONDecodeError:
                continue

            if not isinstance(msg_payload, dict):
                continue
            event_type = msg_payload.get("type")
            if not isinstance(event_type, str):
                continue
            data = msg_payload.get("data", {})
            if not isinstance(data, dict):
                continue
            channel_id = data.get("channel_id")
            if channel_id is not None and not isinstance(channel_id, str):
                continue

            if event_type in {"SUBSCRIBE_CHANNEL", "TYPING", "VOICE_STATE"}:
                if not channel_id:
                    continue
                async with AsyncSessionLocal() as session:
                    try:
                        await require_channel_access(session, channel_id, user_id)
                    except HTTPException:
                        await websocket.send_json({
                            "type": "ERROR",
                            "data": {"detail": "Канал не найден"},
                        })
                        continue

            if event_type == "SUBSCRIBE_CHANNEL":
                channel_id = data.get("channel_id")
                if channel_id:
                    manager.subscribe_channel(channel_id, websocket)

            elif event_type == "UNSUBSCRIBE_CHANNEL":
                channel_id = data.get("channel_id")
                if channel_id:
                    manager.unsubscribe_channel(channel_id, websocket)

            elif event_type == "TYPING":
                channel_id = data.get("channel_id")
                if channel_id:
                    await manager.broadcast_to_channel(channel_id, {
                        "type": "USER_TYPING",
                        "data": {
                            "channel_id": channel_id,
                            "user_id": user_id,
                            "display_name": user.display_name,
                            "is_typing": data.get("is_typing", True)
                        }
                    })

            elif event_type == "VOICE_STATE":
                # Broadcast speaking or mute/deafen status update
                await manager.broadcast_to_channel(channel_id, {
                    "type": "VOICE_STATE_UPDATED",
                    "data": {
                        "user_id": user_id,
                        "channel_id": channel_id,
                        "is_muted": data.get("is_muted", False),
                        "is_deafened": data.get("is_deafened", False),
                        "is_speaking": data.get("is_speaking", False)
                    }
                })

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id)
        if not manager.is_user_online(user_id):
            await calls.offline(user_id)
            await manager.broadcast({
                "type": "USER_STATUS_CHANGED",
                "data": {
                    "user_id": user_id,
                    "status": "offline"
                }
            })
