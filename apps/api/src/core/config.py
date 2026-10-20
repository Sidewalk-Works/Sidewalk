```python
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_SECRET_KEY = (
    "default-dev-secret-key-change-in-production-min-32-chars"
)


class Settings(BaseSettings):
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ENVIRONMENT: str = "development"

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
```
