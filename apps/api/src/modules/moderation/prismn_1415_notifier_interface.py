"""Standalone helper for issue #1415: decouple moderation from notifications
service with a small notifier interface.

Goal: moderation (and other producers) call a notifier protocol instead of
importing notifications.service directly, and transaction ownership remains at
request scope (no internal commits inside notifier implementations used here).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable
import uuid


@runtime_checkable
class Notifier(Protocol):
    async def notify(
        self,
        *,
        user_id: uuid.UUID,
        type: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        ...


@dataclass
class CapturingNotifier:
    """Test/adapter helper that records notifications without committing."""

    events: list[dict[str, Any]]

    def __init__(self) -> None:
        self.events = []

    async def notify(
        self,
        *,
        user_id: uuid.UUID,
        type: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self.events.append({"user_id": str(user_id), "type": type, "payload": payload or {}})


class NullNotifier:
    async def notify(
        self,
        *,
        user_id: uuid.UUID,
        type: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        return None


async def emit_status_change(
    notifier: Notifier,
    *,
    user_id: uuid.UUID,
    report_id: uuid.UUID,
    status: str,
    notes: str | None = None,
) -> None:
    await notifier.notify(
        user_id=user_id,
        type="status_change",
        payload={"report_id": str(report_id), "status": status, "notes": notes},
    )
