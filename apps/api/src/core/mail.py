"""Pluggable outgoing mail. ``console`` (default) logs messages; ``memory`` keeps them for tests."""

from dataclasses import dataclass, field
from typing import Protocol

import structlog

from src.core.config import get_settings

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class Message:
    to: str
    subject: str
    body: str


class MailBackend(Protocol):
    async def send(self, message: Message) -> None: ...


class ConsoleMailBackend:
    """Development backend: writes the message to the log instead of sending it."""

    async def send(self, message: Message) -> None:
        log.info("mail_sent", to=message.to, subject=message.subject, body=message.body)


@dataclass
class MemoryMailBackend:
    """Test backend: collects messages in ``outbox``."""

    outbox: list[Message] = field(default_factory=list)

    async def send(self, message: Message) -> None:
        self.outbox.append(message)


_backends: dict[str, MailBackend] = {}


def get_mail_backend() -> MailBackend:
    name = get_settings().MAIL_BACKEND
    if name not in _backends:
        if name == "console":
            _backends[name] = ConsoleMailBackend()
        elif name == "memory":
            _backends[name] = MemoryMailBackend()
        else:
            raise ValueError(f"Unknown MAIL_BACKEND: {name}")
    return _backends[name]


def action_link(path: str, token: str) -> str:
    return f"{get_settings().APP_BASE_URL.rstrip('/')}/{path.lstrip('/')}?token={token}"
