from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.file_access import validate_avatar
from app.api.deps import get_db, get_current_user
from app.core.sockets import manager
from app.models.user import User
from app.schemas.user import UserOut, UserStatusUpdate, UserProfileUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[UserOut])
async def get_all_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.display_name.asc())  # noqa: E712
    )
    users = result.scalars().all()
    user_list = []
    for u in users:
        u_out = UserOut.model_validate(u)
        # Dynamic check if connected via WebSocket
        if manager.is_user_online(u.id):
            u_out.status = u.status if u.status != "offline" else "online"
        else:
            u_out.status = "offline"
        user_list.append(u_out)
    return user_list


@router.patch("/me", response_model=UserOut)
async def update_my_profile(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if data.display_name is not None and data.display_name.strip():
        current_user.display_name = data.display_name.strip()
    if data.avatar_url is not None:
        await validate_avatar(db, data.avatar_url, current_user.id)
        current_user.avatar_url = data.avatar_url
    if data.status is not None:
        current_user.status = data.status
    if data.custom_activity is not None:
        current_user.custom_activity = data.custom_activity

    await db.commit()
    await db.refresh(current_user)

    # Broadcast updated user profile to all clients
    await manager.broadcast({
        "type": "USER_PROFILE_UPDATED",
        "data": {
            "user_id": current_user.id,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
            "status": current_user.status,
            "custom_activity": current_user.custom_activity,
        }
    })

    return UserOut.model_validate(current_user)


@router.patch("/me/status", response_model=UserOut)
async def update_my_status(
    data: UserStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if data.status is not None:
        current_user.status = data.status
    if data.custom_activity is not None:
        current_user.custom_activity = data.custom_activity

    await db.commit()
    await db.refresh(current_user)

    # Broadcast status change across all connected clients
    await manager.broadcast({
        "type": "USER_STATUS_CHANGED",
        "data": {
            "user_id": current_user.id,
            "status": current_user.status,
            "custom_activity": current_user.custom_activity,
        }
    })

    return UserOut.model_validate(current_user)
