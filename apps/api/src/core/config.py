# apps/api/src/core/config.py
import json
from functools import lru_cache
from typing import Annotated, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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
    # Accepts a JSON array or a comma-separated list of origins.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://localhost:8081"]
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 15  # short-lived; clients renew with a refresh token
    REFRESH_TOKEN_EXPIRES_DAYS: int = 30
    RESET_TOKEN_EXPIRES_MINUTES: int = 30
    EMAIL_TOKEN_EXPIRES_HOURS: int = 48
    # Base URL of the web app; links in verification/reset emails point here.
    APP_BASE_URL: str = "http://localhost:3000"
    MAIL_BACKEND: str = "console"  # console | memory
    # When true, accounts with an unverified email cannot create reports.
    REQUIRE_VERIFIED_EMAIL: bool = False
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    # Database connection pool (PostgreSQL only; SQLite ignores these)
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Rate limiting (slowapi)
    RATE_LIMIT_DEFAULT: str = "200/minute"
    RATE_LIMIT_LOGIN: str = "10/minute"

    LOG_LEVEL: str = "INFO"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [origin.strip() for origin in text.split(",") if origin.strip()]
        return value

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
