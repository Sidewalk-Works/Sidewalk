import React, { useMemo, useState } from "react";
import type { GroupedCaseNotification } from "@sidewalk/shared";

interface GroupedCaseNotificationCardProps {
  groupedNotification: GroupedCaseNotification;
  sortIndicator?: "newest" | "oldest" | "most-updates";
  onMarkRead?: (groupId: string) => void;
  onSnooze?: (groupId: string, durationMs: number) => void;
  onDismiss?: (groupId: string) => void;
}

type QuickAction = {
  id: "mark_read" | "snooze_1h" | "snooze_24h" | "dismiss";
  label: string;
  variant: "default" | "danger";
  onClick: () => void;
};

const SNOOZE_ONE_HOUR_MS = 60 * 60 * 1000;
const SNOOZE_ONE_DAY_MS = 24 * SNOOZE_ONE_HOUR_MS;

function formatTimeRange(firstIso: string, lastIso: string): string {
  const first = new Date(firstIso);
  const last = new Date(lastIso);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return "Time unavailable";
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const firstStr = formatter.format(first);
  const lastStr = formatter.format(last);
  if (firstStr === lastStr) return firstStr;
  return `${firstStr} – ${lastStr}`;
}

function getSortLabel(indicator?: "newest" | "oldest" | "most-updates"): string {
  if (indicator === "newest") return "↓ Newest first";
  if (indicator === "oldest") return "↑ Oldest first";
  if (indicator === "most-updates") return "↓ Most updates";
  return "";
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function GroupedCaseNotificationCard({
  groupedNotification,
  sortIndicator,
  onMarkRead,
  onSnooze,
  onDismiss,
}: GroupedCaseNotificationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { groupId, caseTitle, updateCount, latestMessage, participantCount, firstEventAtIso, lastEventAtIso } = groupedNotification;

  const timeRange = useMemo(() => formatTimeRange(firstEventAtIso, lastEventAtIso), [firstEventAtIso, lastEventAtIso]);
  const sortLabel = useMemo(() => getSortLabel(sortIndicator), [sortIndicator]);

  const quickActions: QuickAction[] = [
    { id: "mark_read", label: "Mark read", variant: "default", onClick: () => onMarkRead?.(groupId) },
    { id: "snooze_1h", label: "Snooze 1h", variant: "default", onClick: () => onSnooze?.(groupId, SNOOZE_ONE_HOUR_MS) },
    { id: "snooze_24h", label: "Snooze 24h", variant: "default", onClick: () => onSnooze?.(groupId, SNOOZE_ONE_DAY_MS) },
    { id: "dismiss", label: "Dismiss", variant: "danger", onClick: () => onDismiss?.(groupId) },
  ];

  return (
    <article style={{ padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", marginBottom: "10px" }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((p) => !p)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
          cursor: "pointer",
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          gap: "8px",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a", flex: 1 }}>
          <span aria-hidden="true">{expanded ? "▾" : "▸"} </span>
          {caseTitle}
        </h4>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {sortLabel && (
            <span style={{ fontSize: "11px", color: "#64748b", fontStyle: "italic" }}>{sortLabel}</span>
          )}
          <span style={{ padding: "2px 8px", background: "#e0f2fe", color: "#0369a1", borderRadius: "12px", fontSize: "12px", fontWeight: 700 }}>
            {pluralize(updateCount, "update", "updates")}
          </span>
        </span>
      </button>

      <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#64748b", marginBottom: expanded ? "8px" : 0, flexWrap: "wrap" }}>
        <span>{timeRange}</span>
        {participantCount > 1 && <span>{pluralize(participantCount, "participant", "participants")}</span>}
      </div>

      {expanded && (
        <div style={{ marginTop: "8px" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "#475569", padding: "8px 12px", background: "#ffffff", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            {latestMessage}
          </p>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: action.variant === "danger" ? "#fef2f2" : "#ffffff",
                  color: action.variant === "danger" ? "#b91c1c" : "#334155",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
