import secrets
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.file_access import validate_avatar
from app.api.deps import get_db, get_current_user
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import User
from app.models.invite import InviteCode
from app.schemas.user import UserCreate, UserLogin, UserOut
from app.schemas.auth import Token, InviteCreate, InviteOut
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if this is the very first user in the system (bootstrap admin)
    # Serialize registration until commit, including bootstrap and invite usage.
    if db.bind is not None and db.bind.dialect.name == 'postgresql':
        await db.execute(text('SELECT pg_advisory_xact_lock(72491001)'))
    user_count_result = await db.execute(select(func.count(User.id)))
    user_count = user_count_result.scalar_one()

    is_first_user = user_count == 0
    if is_first_user and settings.ENVIRONMENT == 'production':
        if not secrets.compare_digest(data.invite_code or '', settings.BOOTSTRAP_INVITE_CODE):
            raise HTTPException(status_code=403, detail='Нужен код первоначального приглашения')

    if not is_first_user:
        # Validate invite code
        invite_result = await db.execute(
            select(InviteCode).where(
                InviteCode.code == data.invite_code,
                InviteCode.is_active == True  # noqa: E712
            )
        )
        invite = invite_result.scalars().first()
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверный или недействительный инвайт-код"
            )

        if invite.max_uses > 0 and invite.uses_count >= invite.max_uses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Инвайт-код исчерпал лимит использований"
            )

        invite.uses_count += 1
        if invite.max_uses > 0 and invite.uses_count >= invite.max_uses:
            invite.is_active = False

    # Check username uniqueness
    existing_user_result = await db.execute(
        select(User).where(User.username == data.username.strip().lower())
    )
    if existing_user_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким логином уже существует"
        )

    new_user = User(
        username=data.username.strip().lower(),
        display_name=data.display_name.strip(),
        hashed_password=get_password_hash(data.password),
        avatar_url=data.avatar_url,
        is_admin=is_first_user,
        status="online"
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)

    if data.avatar_url:
        await validate_avatar(db, data.avatar_url, new_user.id)
    await db.commit()
    from app.core.sockets import manager
    await manager.broadcast({'type': 'USERS_CHANGED', 'data': {}})
    token = create_access_token(subject=new_user.id)
    return Token(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(new_user)
    )


@router.post("/login", response_model=Token)
async def login(
    data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).where(User.username == data.username.strip().lower())
    )
    user = result.scalars().first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Аккаунт заблокирован"
        )

    user.status = "online"
    await db.commit()

    token = create_access_token(subject=user.id)
    return Token(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user)
    )


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    data: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    code = data.code.strip().upper() if data.code else f"PATI-{secrets.token_hex(4).upper()}"
    
    # Check uniqueness
    existing = await db.execute(select(InviteCode).where(InviteCode.code == code))
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Инвайт с таким кодом уже существует"
        )

    invite = InviteCode(
        code=code,
        created_by_id=current_user.id,
        max_uses=data.max_uses,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return InviteOut.model_validate(invite)


@router.get("/invites", response_model=List[InviteOut])
async def list_invites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(InviteCode).order_by(InviteCode.created_at.desc())
    if not current_user.is_admin:
        query = query.where(InviteCode.created_by_id == current_user.id)
    result = await db.execute(query)
    return [InviteOut.model_validate(item) for item in result.scalars().all()]
