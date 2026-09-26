from slowapi import Limiter
from slowapi.util import get_remote_address
from src.core.config import get_settings

settings = get_settings()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
)
