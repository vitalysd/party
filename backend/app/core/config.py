from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    PROJECT_NAME: str = "Пати — рядом со своими"
    ENVIRONMENT: str = "development"
    BOOTSTRAP_INVITE_CODE: str = ""
    AUTO_CREATE_SCHEMA: bool = True
    SECRET_KEY: str = "super-secret-jwt-key-change-in-production-min-32-chars-long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days

    # PostgreSQL Database
    DATABASE_URL: str = "postgresql+asyncpg://pati_user:pati_secret_password@postgres:5432/pati_db"

    # MinIO / S3
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "miniopassword"
    MINIO_BUCKET_NAME: str = "pati-uploads"

    # LiveKit
    LIVEKIT_URL: str = "http://livekit:7880"
    LIVEKIT_PUBLIC_URL: str = "ws://localhost:7880"
    LIVEKIT_API_KEY: str = "devkey"
    LIVEKIT_API_SECRET: str = "secret_key_must_be_at_least_32_characters_long_for_dev"

    BACKEND_PORT: int = 8000
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_BYTES: int = 25 * 1024 * 1024
    MAX_USER_UPLOAD_BYTES: int = 200 * 1024 * 1024
    MAX_STORAGE_UPLOAD_BYTES: int = 512 * 1024 * 1024
    MIN_UPLOAD_FREE_BYTES: int = 256 * 1024 * 1024
    ORPHAN_UPLOAD_HOURS: int = 24
    CORS_ORIGINS: List[str] = ["*"]

    @model_validator(mode='after')
    def production_settings(self):
        if self.ENVIRONMENT == 'production':
            if len(self.SECRET_KEY) < 32 or self.SECRET_KEY.startswith('super-secret'):
                raise ValueError('Production requires a unique SECRET_KEY')
            if self.LIVEKIT_API_KEY == 'devkey' or len(self.LIVEKIT_API_SECRET) < 32:
                raise ValueError('Production requires unique LiveKit credentials')
            if '*' in self.CORS_ORIGINS or not self.LIVEKIT_PUBLIC_URL.startswith('wss://'):
                raise ValueError('Production requires explicit CORS origins and secure LiveKit URL')
            if not self.BOOTSTRAP_INVITE_CODE:
                raise ValueError('Production requires a private bootstrap invitation')
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
