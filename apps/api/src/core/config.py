import os

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Typed application settings validated at startup using Pydantic BaseSettings.
    """
    # Required fields without defaults (must be provided via environment or .env)
    DATABASE_URL: str
    SECRET_KEY: str

    # Fields with sensible defaults
DEFAULT_SECRET_KEY = (
    "default-dev-secret-key-change-in-production-min-32-chars"
)


class Settings(BaseSettings):
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql://sidewalk:sidewalk@localhost:5432/sidewalk"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 1440  # 24 hours
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

@lru_cache()
def get_settings() -> Settings:
    """
    Returns a cached instance of the application Settings.
    Fails at startup with a validation error if required fields are missing.
    """
    return Settings()
    JWT_EXPIRES_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRES_DAYS: int = 30
    EMAIL_TOKEN_EXPIRES_HOURS: int = 24
    REQUIRE_VERIFIED_EMAIL: bool = False
    APP_BASE_URL: str = "http://localhost:8000"
    MAIL_BACKEND: str = "console"
    MEDIA_ALLOWED_HOSTS: str = ""
    MEDIA_STORAGE_BACKEND: str = "local"
    MEDIA_LOCAL_BASE_URL: str = "https://storage.local.test"
    MEDIA_MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024
    MEDIA_ALLOWED_CONTENT_TYPES: str = "image/jpeg,image/png,image/webp"

    @property
    def media_allowed_hosts(self) -> set[str]:
        return {h.strip().lower() for h in self.MEDIA_ALLOWED_HOSTS.split(",") if h.strip()}

    @property
    def media_allowed_content_types(self) -> set[str]:
        return {c.strip().lower() for c in self.MEDIA_ALLOWED_CONTENT_TYPES.split(",") if c.strip()}


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def validate_production_secrets(self) -> None:
        environment = self.ENVIRONMENT.strip().lower()

        if environment not in {"production", "staging"}:
            return

        if self.SECRET_KEY == DEFAULT_SECRET_KEY:
            raise ValueError(
                f"SECRET_KEY must not use the development default "
                f"in {environment}."
            )

        if len(self.SECRET_KEY) < 32:
            raise ValueError(
                f"SECRET_KEY must be at least 32 characters long "
                f"in {environment}."
            )


settings = Settings()
settings.validate_production_secrets()


@lru_cache
def get_settings() -> Settings:
    return settings
