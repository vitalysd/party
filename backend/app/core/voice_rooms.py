from fastapi import HTTPException
from livekit import api
from app.core.config import settings


async def close_voice_room(room_name: str):
    try:
        async with api.LiveKitAPI(settings.LIVEKIT_URL, settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET) as client:
            await client.room.delete_room(api.DeleteRoomRequest(room=room_name))
    except api.TwirpError as exc:
        if exc.code != 'not_found':
            raise HTTPException(503, 'Не удалось завершить голосовой разговор. Повторите попытку.') from exc
    except Exception as exc:
        raise HTTPException(503, 'Голосовой сервер недоступен. Повторите попытку.') from exc
