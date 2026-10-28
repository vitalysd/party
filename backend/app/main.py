import logging
import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.websocket import router as websocket_router
from app.api.v1.files import legacy_router
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.rate_limit import AuthRateLimit
from app.core.calls import calls
from app.core.logging import configure_log_redaction
from app.core.storage import cleanup_loop
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
configure_log_redaction()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create tables on startup (idempotent, safe with PostgreSQL)
    logger.info("Initializing database schema...")
    if settings.AUTO_CREATE_SCHEMA:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        await calls.shutdown()
    await engine.dispose()
    logger.info("Database connection closed.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan
)

# CORS must wrap rate limiting so desktop clients can read 429 responses.
app.add_middleware(AuthRateLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/health')
async def health():
    async with AsyncSessionLocal() as session:
        await session.execute(text('SELECT 1'))
    return {'status': 'ok'}

# API routes
app.include_router(api_v1_router)
app.include_router(websocket_router)
app.include_router(legacy_router)


@app.get("/")
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "status": "online",
        "version": "1.0.0"
    }
