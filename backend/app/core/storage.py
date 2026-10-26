import asyncio
import logging
import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy import select, func, text
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException
from app.core.config import settings
from app.models.upload import UploadedFile
from app.models.message import Message
from app.models.user import User

logger = logging.getLogger(__name__)

async def lock_upload_storage(db):
    if db.bind is not None and db.bind.dialect.name == 'postgresql':
        await db.execute(text('SELECT pg_advisory_xact_lock(72491002)'))

async def upload_budget(db, user_id):
    await lock_upload_storage(db)
    root = Path(settings.UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    used = await db.scalar(select(func.coalesce(func.sum(UploadedFile.size), 0)).where(UploadedFile.owner_id == user_id))
    physical = await run_in_threadpool(lambda: sum(p.stat().st_size for p in root.iterdir() if p.is_file()))
    free = (await run_in_threadpool(shutil.disk_usage, root)).free
    budget = min(settings.MAX_UPLOAD_BYTES, settings.MAX_USER_UPLOAD_BYTES - used,
                 settings.MAX_STORAGE_UPLOAD_BYTES - physical, free - settings.MIN_UPLOAD_FREE_BYTES)
    if budget <= 0: raise HTTPException(507, 'Недостаточно места для загрузки. Освободите хранилище или обратитесь к администратору.')
    return budget

async def cleanup_uploads(db):
    from app.api.file_access import local_file_key, file_path
    await lock_upload_storage(db)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, settings.ORPHAN_UPLOAD_HOURS))
    referenced = set()
    def remember(url):
        if not isinstance(url, str): return
        try:
            key = local_file_key(url)
            if key: referenced.add(key)
        except HTTPException:
            pass
    async for attachments in await db.stream_scalars(select(Message.attachments)):
        for item in attachments or []: remember(item.get('url'))
    for url in (await db.scalars(select(User.avatar_url).where(User.avatar_url.is_not(None)))).all(): remember(url)
    candidates = (await db.scalars(select(UploadedFile).where(UploadedFile.created_at < cutoff))).all()
    removed = 0
    for upload in candidates:
        if upload.key in referenced: continue
        await run_in_threadpool(file_path(upload.key).unlink, missing_ok=True)
        await db.delete(upload)
        removed += 1
    await db.flush()
    # Unknown new-format files can remain after a crash or an earlier room deletion.
    known = set((await db.scalars(select(UploadedFile.key))).all()) | referenced
    root = Path(settings.UPLOAD_DIR)
    if root.is_dir():
        for path in root.iterdir():
            if not re.fullmatch(r'[a-f0-9]{32}', path.name) or path.name in known: continue
            if path.is_file() and path.stat().st_mtime < cutoff.timestamp():
                await run_in_threadpool(path.unlink, missing_ok=True)
                removed += 1
    await db.commit()
    return removed

async def cleanup_loop():
    from app.core.database import AsyncSessionLocal
    while True:
        try:
            async with AsyncSessionLocal() as db: await cleanup_uploads(db)
        except asyncio.CancelledError: raise
        except Exception: logger.exception('Upload cleanup failed; will retry')
        await asyncio.sleep(3600)
