import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function isEnabled(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[env.LOG_LEVEL];
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, entry: LogEntry): void {
  // #825: structured JSON in production so log aggregators can ingest it;
  // keep the human-readable format elsewhere for local development.
  const line = env.APP_ENV === "production" ? JSON.stringify(entry) : format(level, entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function format(level: LogLevel, entry: LogEntry): string {
  const { level: _level, message, timestamp, ...fields } = entry;
  const payload = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
  return `[${timestamp}] ${level.toUpperCase()} ${message}${payload}`;
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  if (!isEnabled(level)) return;
  emit(level, { level, message, timestamp: new Date().toISOString(), ...fields });
}

export const logger = {
  debug(message: string, fields?: LogFields): void {
    write("debug", message, fields);
  },
  info(message: string, fields?: LogFields): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    write("warn", message, fields);
  },
  error(message: string, fields?: LogFields): void {
    write("error", message, fields);
  }
};
