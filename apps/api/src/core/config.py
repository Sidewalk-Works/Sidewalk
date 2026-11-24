from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "default-dev-secret-key-change-in-production-min-32-chars"


class Settings(BaseSettings):
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql://sidewalk:sidewalk@localhost:5432/sidewalk"
    JWT_ALGORITHM: str = "HS256"
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

    API_VERSION: str = "0.1.0"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8081"]
    LOG_LEVEL: str = "INFO"

    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE_SECONDS: int = 1800
    DB_ECHO: bool = False

    RATE_LIMIT_DEFAULT: str = "200/minute"
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_REGISTER: str = "10/minute"
    RATE_LIMIT_STORAGE_URI: str | None = None
    TRUSTED_PROXY_IPS: str = ""

    @property
    def trusted_proxy_ips(self) -> frozenset[str]:
        return frozenset(ip.strip() for ip in self.TRUSTED_PROXY_IPS.split(",") if ip.strip())

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
            raise ValueError(f"SECRET_KEY must not use the development default in {environment}.")

        if len(self.SECRET_KEY) < 32:
            raise ValueError(f"SECRET_KEY must be at least 32 characters long in {environment}.")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.validate_production_secrets()
    return s


settings = get_settings()


def get_async_database_url(database_url: str | None = None) -> str:
    """Return a database URL using the async driver expected by SQLAlchemy."""
    url = get_settings().DATABASE_URL if database_url is None else database_url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("sqlite://"):
        return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    return url
