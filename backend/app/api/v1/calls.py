from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_db
from app.api.channel_access import require_channel_access
from app.models.channel import ChannelMember
from app.models.user import User
from app.core.calls import calls

router = APIRouter(prefix='/calls', tags=['calls'])
class CallCreate(BaseModel):
    channel_id: str

@router.get('/current')
async def current_call(user: User = Depends(get_current_user)):
    return calls.current(user.id)

@router.post('', status_code=201)
async def start_call(data: CallCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    channel = await require_channel_access(db, data.channel_id, user.id)
    members = (await db.scalars(select(ChannelMember.user_id).where(ChannelMember.channel_id == channel.id))).all()
    if not channel.is_direct or len(members) != 2:
        raise HTTPException(400, 'Личный звонок доступен только в диалоге двух участников')
    callee = await db.get(User, next(member for member in members if member != user.id))
    if not callee or not callee.is_active: raise HTTPException(404, 'Собеседник не найден')
    return await calls.start(channel.id, user, callee)

@router.post('/{call_id}/accept')
async def accept_call(call_id: str, user: User = Depends(get_current_user)):
    return await calls.accept(call_id, user.id)

@router.post('/{call_id}/end')
async def end_call(call_id: str, user: User = Depends(get_current_user)):
    return await calls.finish(call_id, user.id)
