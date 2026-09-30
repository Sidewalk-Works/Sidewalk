# apps/api/src/core/config.py
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
    ENVIRONMENT: str = "development"
    API_VERSION: str = "0.1.0"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8081"]
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 1440  # 24 hours
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    """
    Returns a cached instance of the application Settings.
    Fails at startup with a validation error if required fields are missing.
    """
    return Settings()
