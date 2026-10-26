import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.channel_access import require_channel_access
from app.api.file_access import authorize_download, file_path
from app.core.config import settings
from app.models.user import User
from app.models.upload import UploadedFile
from app.core.storage import upload_budget

router = APIRouter(prefix="/files", tags=["files"])
legacy_router = APIRouter()


@router.post("/presigned-url")
async def generate_presigned_url(current_user: User = Depends(get_current_user)):
    # Direct public S3 URLs bypass channel authorization.
    raise HTTPException(410, "Используйте загрузку через /api/v1/files/upload")


@router.post("/upload")
async def upload_file_direct(
    file: UploadFile = File(...),
    channel_id: str | None = Form(None),
    purpose: Literal["attachment", "avatar"] = Form("attachment"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    is_avatar = purpose == "avatar"
    if not is_avatar:
        if not channel_id:
            raise HTTPException(400, "Укажите канал для вложения")
        await require_channel_access(db, channel_id, current_user.id)
    elif file.content_type not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
        raise HTTPException(400, "Выберите изображение PNG, JPEG, WEBP или GIF")

    key = uuid.uuid4().hex
    path = file_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    budget = await upload_budget(db, current_user.id)
    try:
        with path.open("xb") as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "Файл слишком большой")
                if size > budget:
                    raise HTTPException(507, 'Превышена квота хранилища или недостаточно места на диске')
                await run_in_threadpool(target.write, chunk)
        upload = UploadedFile(
            key=key, owner_id=current_user.id,
            channel_id=None if is_avatar else channel_id, is_avatar=is_avatar,
            filename=(file.filename or "file").replace("\\", "/").split("/")[-1][:255] or "file",
            content_type=(file.content_type or "application/octet-stream")[:100], size=size,
        )
        db.add(upload)
        await db.commit()
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    return {
        "url": f"/api/v1/files/{key}", "filename": upload.filename,
        "size": size, "content_type": upload.content_type, "key": key,
    }


@router.get("/{key}")
@legacy_router.get("/uploads/{key}")
async def download_file(
    key: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    path = file_path(key)
    upload = await authorize_download(db, key, current_user.id)
    if not path.is_file():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(
        path, filename=upload.filename if upload else key,
        media_type=upload.content_type if upload else "application/octet-stream",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
