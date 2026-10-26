from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.channels import router as channels_router
from app.api.v1.messages import router as messages_router
from app.api.v1.files import router as files_router
from app.api.v1.livekit import router as livekit_router
from app.api.v1.calls import router as calls_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(channels_router)
api_v1_router.include_router(messages_router)
api_v1_router.include_router(files_router)
api_v1_router.include_router(livekit_router)
api_v1_router.include_router(calls_router)
