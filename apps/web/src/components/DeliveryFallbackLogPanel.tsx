"use client";

import React from "react";
import type { DeliveryFailureLog, FallbackAttempt } from "@sidewalk/shared";

interface DeliveryFallbackLogPanelProps {
  logs: DeliveryFailureLog[];
}

type AttemptStatus = FallbackAttempt["status"];
type FinalStatus = DeliveryFailureLog["finalStatus"];
type Channel = FallbackAttempt["channel"];

const STATUS_META: Record<AttemptStatus, { label: string; icon: string; bg: string; text: string }> = {
  pending: { label: "Pending", icon: "⏳", bg: "#fef3c7", text: "#92400e" },
  success: { label: "Delivered", icon: "✓", bg: "#d1fae5", text: "#065f46" },
  failed: { label: "Failed", icon: "✕", bg: "#fee2e2", text: "#991b1b" },
};

const FINAL_STATUS_META: Record<FinalStatus, { label: string; icon: string; bg: string; text: string; cardBg: string; cardBorder: string }> = {
  delivered: {
    label: "Delivered",
    icon: "✓",
    bg: "#d1fae5",
    text: "#065f46",
    cardBg: "#f0fdf4",
    cardBorder: "#bbf7d0",
  },
  failed_all: {
    label: "All channels failed",
    icon: "!",
    bg: "#fee2e2",
    text: "#991b1b",
    cardBg: "#fef2f2",
    cardBorder: "#fecaca",
  },
};

const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  push: "Push notification",
  inApp: "In-app message",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

export function DeliveryFallbackLogPanel({ logs }: DeliveryFallbackLogPanelProps) {
  if (logs.length === 0) {
    return (
      <section style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#0f172a" }}>Delivery fallback log</h3>
        <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>No fallback attempts recorded yet.</p>
      </section>
    );
  }

  return (
    <section style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#0f172a" }}>Delivery fallback log</h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        {logs.map((log, index) => {
          const finalMeta = FINAL_STATUS_META[log.finalStatus];
          const attempts = [...log.attempts].sort(
            (a, b) => new Date(a.attemptedAtIso).getTime() - new Date(b.attemptedAtIso).getTime(),
          );

          return (
            <li
              key={log.logId}
              style={{
                padding: "12px",
                background: finalMeta.cardBg,
                border: `1px solid ${finalMeta.cardBorder}`,
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                  Delivery record {index + 1}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: finalMeta.bg,
                    color: finalMeta.text,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span aria-hidden="true">{finalMeta.icon}</span>
                  {finalMeta.label}
                </span>
              </div>

              <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px 0" }}>
                Primary channel: {CHANNEL_LABELS[log.strategy.primaryChannel]} · Max retries: {log.strategy.maxRetries} · Completed: {formatWhen(log.completedAtIso)}
              </p>

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                {attempts.map((attempt) => {
                  const meta = STATUS_META[attempt.status];
                  return (
                    <li
                      key={attempt.attemptId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "12px",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        background: meta.bg,
                        color: meta.text,
                      }}
                    >
                      <span>
                        <span aria-hidden="true">{meta.icon} </span>
                        {CHANNEL_LABELS[attempt.channel]}
                        <span style={{ opacity: 0.85 }}> · {formatWhen(attempt.attemptedAtIso)}</span>
                        {attempt.error ? ` — ${attempt.error}` : ""}
                      </span>
                      <span style={{ fontWeight: 600 }}>{meta.label}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
