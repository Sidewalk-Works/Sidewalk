import asyncio
import threading

import pytest

from src.core import security
from src.core.exceptions import ValidationError


async def test_hashing_and_verifying_run_off_the_event_loop_thread(monkeypatch):
    loop_thread = threading.get_ident()
    seen: list[int] = []
    real_hashpw, real_checkpw = security.bcrypt.hashpw, security.bcrypt.checkpw

    def spy_hashpw(*args, **kwargs):
        seen.append(threading.get_ident())
        return real_hashpw(*args, **kwargs)

    def spy_checkpw(*args, **kwargs):
        seen.append(threading.get_ident())
        return real_checkpw(*args, **kwargs)

    monkeypatch.setattr(security.bcrypt, "hashpw", spy_hashpw)
    monkeypatch.setattr(security.bcrypt, "checkpw", spy_checkpw)

    hashed = await security.hash_password_async("correct horse battery")
    assert await security.verify_password_async("correct horse battery", hashed)

    assert len(seen) == 2
    assert all(ident != loop_thread for ident in seen)


async def test_the_event_loop_keeps_running_during_a_hash():
    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.005)
            ticks += 1

    task = asyncio.create_task(ticker())
    try:
        await security.hash_password_async("correct horse battery")
    finally:
        task.cancel()

    # bcrypt takes well over 50 ms; a blocked loop would have recorded no ticks at all.
    assert ticks >= 3


def test_hash_password_rejects_more_than_72_bytes():
    with pytest.raises(ValidationError, match="72 bytes"):
        security.hash_password("a" * 73)
