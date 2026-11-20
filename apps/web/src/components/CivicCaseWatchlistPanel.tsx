import React, { useId, useMemo, useState } from "react";
import type { CivicWatchlistItem } from "@sidewalk/shared";

type FollowUpStatus = CivicWatchlistItem["followUpStatus"];

interface CivicCaseWatchlistPanelProps {
  items?: CivicWatchlistItem[];
  onRemoveItem?: (caseId: string) => void;
  onAddItem?: () => void;
}

const STATUS_CONFIG: Record<FollowUpStatus, { label: string; bg: string; color: string }> = {
  active_review: { label: "Active Review", bg: "#dbeafe", color: "#1d4ed8" },
  pending_city_response: { label: "Pending City", bg: "#fef3c7", color: "#b45309" },
  resolved: { label: "Resolved", bg: "#d1fae5", color: "#047857" },
  stale: { label: "Stale", bg: "#f1f5f9", color: "#334155" },
};

const SORT_OPTIONS = [
  { value: "added_desc", label: "Newest first" },
  { value: "added_asc", label: "Oldest first" },
] as const;

function formatAddedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString();
}

export function CivicCaseWatchlistPanel({
  items = [],
  onRemoveItem,
  onAddItem,
}: CivicCaseWatchlistPanelProps) {
  const [statusFilter, setStatusFilter] = useState<FollowUpStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"added_desc" | "added_asc">("added_desc");
  const statusSelectId = useId();
  const sortSelectId = useId();

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "all") {
      result = result.filter((item) => item.followUpStatus === statusFilter);
    }
    return [...result].sort((a, b) => {
      const diff = new Date(a.addedAtIso).getTime() - new Date(b.addedAtIso).getTime();
      return sortBy === "added_desc" ? -diff : diff;
    });
  }, [items, sortBy, statusFilter]);

  const totalCount = items.length;
  const activeCount = items.filter(
    (i) => i.followUpStatus === "active_review" || i.followUpStatus === "pending_city_response",
  ).length;

  return (
    <section style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>Watched civic cases</h3>
        {onAddItem && (
          <button
            type="button"
            onClick={onAddItem}
            style={{
              padding: "6px 12px",
              background: "#3b82f6",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Add case
          </button>
        )}
      </div>

      <div aria-live="polite" style={{ display: "flex", gap: "12px", marginBottom: "12px", fontSize: "13px", color: "#64748b", flexWrap: "wrap" }}>
        <span>Total: <strong style={{ color: "#1e293b" }}>{totalCount}</strong></span>
        <span>Active: <strong style={{ color: "#2563eb" }}>{activeCount}</strong></span>
        <span>Showing: <strong style={{ color: "#1e293b" }}>{filtered.length}</strong></span>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <label htmlFor={statusSelectId} style={{ fontSize: "12px", color: "#334155", display: "flex", flexDirection: "column", gap: "4px" }}>
          Status filter
          <select
            id={statusSelectId}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FollowUpStatus | "all")}
            style={{
              padding: "6px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#334155",
              background: "#ffffff",
            }}
          >
            <option value="all">All statuses</option>
            <option value="active_review">Active review</option>
            <option value="pending_city_response">Pending city response</option>
            <option value="resolved">Resolved</option>
            <option value="stale">Stale</option>
          </select>
        </label>
        <label htmlFor={sortSelectId} style={{ fontSize: "12px", color: "#334155", display: "flex", flexDirection: "column", gap: "4px" }}>
          Sort order
          <select
            id={sortSelectId}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{
              padding: "6px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#334155",
              background: "#ffffff",
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
          {items.length === 0
            ? "No civic cases currently added to your watchlist."
            : "No cases match the current filter."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((item) => {
            const badge = STATUS_CONFIG[item.followUpStatus];
            return (
              <li
                key={item.caseId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>
                      {item.title}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        background: badge.bg,
                        color: badge.color,
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    <span aria-hidden="true">📍 </span>
                    <span className="sr-only">Location: </span>
                    {item.neighborhood} | Category: {item.category}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    Added {formatAddedDate(item.addedAtIso)}
                  </div>
                </div>
                {onRemoveItem && (
                  <button
                    type="button"
                    aria-label={`Unwatch ${item.title}`}
                    onClick={() => {
                      if (window.confirm(`Remove "${item.title}" from your watchlist?`)) {
                        onRemoveItem(item.caseId);
                      }
                    }}
                    style={{
                      padding: "6px 10px",
                      background: "#fee2e2",
                      color: "#991b1b",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                      flexShrink: 0,
                    }}
                  >
                    Unwatch
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
