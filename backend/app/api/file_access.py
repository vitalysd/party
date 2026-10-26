import re
from pathlib import Path
from urllib.parse import urlsplit, unquote

from fastapi import HTTPException
from sqlalchemy import select

from app.api.channel_access import require_channel_access, visible_channels
from app.core.config import settings
from app.models.channel import Channel
from app.models.message import Message
from app.models.upload import UploadedFile
from app.models.user import User


def local_file_key(url: str):
    path = unquote(urlsplit(url).path)
    for prefix in ('/api/v1/files/', '/uploads/'):
        if path.startswith(prefix):
            key = path[len(prefix):]
            if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,199}', key) and '..' not in key:
                return key
            raise HTTPException(400, 'Некорректная ссылка на файл')
    return None


def file_path(key: str) -> Path:
    if local_file_key('/uploads/' + key) != key:
        raise HTTPException(404, 'Файл не найден')
    root = Path(settings.UPLOAD_DIR).resolve()
    path = (root / key).resolve()
    if path.parent != root:
        raise HTTPException(404, 'Файл не найден')
    return path


async def validate_attachment(db, attachment, channel_id, user_id):
    from app.core.storage import lock_upload_storage
    await lock_upload_storage(db)
    key = local_file_key(attachment.url)
    if key is None:
        raise HTTPException(400, 'Сначала загрузите вложение в этот канал')
    upload = await db.get(UploadedFile, key)
    if upload:
        if upload.channel_id != channel_id or upload.is_avatar or not file_path(key).is_file():
            raise HTTPException(404, 'Вложение не найдено в этом канале')
        return {
            'url': f'/api/v1/files/{key}', 'filename': upload.filename,
            'size': upload.size, 'content_type': upload.content_type,
        }
    # Existing local uploads remain usable by their original uploader.
    if not key.startswith(user_id + '_') or not file_path(key).is_file():
        raise HTTPException(404, 'Вложение не найдено')
    return {**attachment.model_dump(), 'url': f'/uploads/{key}'}


async def validate_avatar(db, url, user_id):
    from app.core.storage import lock_upload_storage
    await lock_upload_storage(db)
    key = local_file_key(url)
    if key is None:
        if url and urlsplit(url).scheme != 'https':
            raise HTTPException(400, 'Для внешнего аватара нужна HTTPS-ссылка')
        return
    upload = await db.get(UploadedFile, key)
    if upload:
        if upload.owner_id == user_id and upload.is_avatar:
            return
    elif key.startswith(user_id + '_') and file_path(key).is_file():
        return
    raise HTTPException(404, 'Аватар не найден')


async def authorize_download(db, key, user_id):
    upload = await db.get(UploadedFile, key)
    if upload:
        if not upload.is_avatar:
            await require_channel_access(db, upload.channel_id, user_id)
        return upload
    # Compatibility for old files: a known URL alone is no longer sufficient.
    if key.startswith(user_id + '_'):
        return None
    avatars = await db.scalars(select(User.avatar_url).where(User.avatar_url.is_not(None)))
    for url in avatars:
        if local_file_key(url) == key:
            return None
    rows = await db.stream_scalars(
        select(Message.attachments).join(Channel, Channel.id == Message.channel_id)
        .where(visible_channels(user_id))
    )
    async for attachments in rows:
        if any(local_file_key(item.get('url', '')) == key for item in (attachments or [])):
            return None
    raise HTTPException(404, 'Файл не найден')
