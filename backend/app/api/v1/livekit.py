from fastapi import APIRouter, Depends, HTTPException
from livekit import api
from datetime import timedelta
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.channel_access import require_channel_access
from app.core.config import settings
from app.models.user import User
from app.core.calls import calls
from app.schemas.livekit import LiveKitTokenRequest, LiveKitTokenResponse

router = APIRouter(prefix="/livekit", tags=["livekit"])


@router.get('/channels/{channel_id}/participants')
async def room_participants(channel_id: str,
                            current_user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    channel = await require_channel_access(db, channel_id, current_user.id)
    if channel.is_direct:
        raise HTTPException(400, 'Список доступен только для комнат')
    try:
        async with api.LiveKitAPI(settings.LIVEKIT_URL, settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET) as client:
            result = await asyncio.wait_for(client.room.list_participants(
                api.ListParticipantsRequest(room=f'channel:{channel.id}')), timeout=4)
        return [{'identity': person.identity, 'name': person.name or person.identity,
                 'avatar_url': person.metadata or None,
                 'isMuted': not any(track.source == api.TrackSource.MICROPHONE and not track.muted for track in person.tracks),
                 'isScreenSharing': any(track.source == api.TrackSource.SCREEN_SHARE and not track.muted for track in person.tracks),
                 'isSpeaking': False, 'isDeafened': False}
                for person in result.participants]
    except api.TwirpError as exc:
        if exc.code == 'not_found':
            return []
        raise HTTPException(503, 'Не удалось загрузить участников разговора') from exc
    except Exception as exc:
        raise HTTPException(503, 'Голосовой сервер недоступен') from exc


@router.post("/token", response_model=LiveKitTokenResponse)
async def generate_livekit_token(
    data: LiveKitTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await require_channel_access(db, data.channel_id, current_user.id)
    room_name = f'channel:{channel.id}'
    if channel.is_direct:
        call = calls.current(current_user.id)
        if not call or call['channel_id'] != channel.id or call['status'] != 'accepted':
            raise HTTPException(409, 'Сначала дождитесь принятия личного звонка')
        room_name = 'call:' + call['id']
    try:
        grant = api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
        )

        token = (
            api.AccessToken(
                api_key=settings.LIVEKIT_API_KEY,
                api_secret=settings.LIVEKIT_API_SECRET
            )
            .with_identity(current_user.id)
            .with_ttl(timedelta(minutes=5))
            .with_name(current_user.display_name)
            .with_metadata(current_user.avatar_url or "")
            .with_grants(grant)
            .to_jwt()
        )

        return LiveKitTokenResponse(
            token=token,
            server_url=settings.LIVEKIT_PUBLIC_URL
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка генерации токена LiveKit: {str(e)}"
        )
