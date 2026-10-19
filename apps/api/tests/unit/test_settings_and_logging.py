import json
import logging

import structlog

from src.core.config import Settings
from src.core.logging import configure_logging


def _settings(monkeypatch, **env) -> Settings:
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("SECRET_KEY", "s" * 32)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return Settings(_env_file=None)


def test_cors_origins_accepts_a_json_array(monkeypatch):
    settings = _settings(monkeypatch, CORS_ORIGINS='["https://a.example","https://b.example"]')
    assert settings.CORS_ORIGINS == ["https://a.example", "https://b.example"]


def test_cors_origins_accepts_a_comma_separated_list(monkeypatch):
    settings = _settings(monkeypatch, CORS_ORIGINS="https://a.example, https://b.example ,")
    assert settings.CORS_ORIGINS == ["https://a.example", "https://b.example"]


def test_production_logs_are_json_one_object_per_line(capsys):
    configure_logging("INFO", "production")
    try:
        structlog.get_logger().info("hello", answer=42)
        line = capsys.readouterr().out.strip().splitlines()[-1]
        record = json.loads(line)
        assert record["event"] == "hello"
        assert record["answer"] == 42
        assert record["timestamp"].endswith("Z")
    finally:
        configure_logging("INFO", "development")


def test_development_logs_are_not_json(capsys):
    configure_logging("INFO", "development")
    structlog.get_logger().info("hello")
    out = capsys.readouterr().out.strip()
    assert "hello" in out
    try:
        json.loads(out)
    except json.JSONDecodeError:
        return
    raise AssertionError("development output should be console text")


def test_log_level_changes_verbosity(capsys):
    try:
        configure_logging("WARNING", "production")
        log = structlog.get_logger()
        log.info("quiet")
        log.warning("loud")
        out = capsys.readouterr().out
        assert "loud" in out
        assert "quiet" not in out
        assert logging.getLogger().level == logging.WARNING

        configure_logging("DEBUG", "production")
        structlog.get_logger().debug("now-visible")
        assert "now-visible" in capsys.readouterr().out
    finally:
        configure_logging("INFO", "development")


def test_standard_library_logs_go_through_structlog(capsys):
    configure_logging("INFO", "production")
    try:
        logging.getLogger("uvicorn.error").info("from uvicorn")
        err = capsys.readouterr()
        line = (err.err or err.out).strip().splitlines()[-1]
        assert json.loads(line)["event"] == "from uvicorn"
    finally:
        configure_logging("INFO", "development")
