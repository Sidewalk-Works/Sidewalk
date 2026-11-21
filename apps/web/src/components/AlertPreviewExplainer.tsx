"use client";

import React, { useId, useState } from "react";
import type { AlertExplainerPayload, TriggerReasonCode } from "@sidewalk/shared";

interface AlertPreviewExplainerProps {
  payload: AlertExplainerPayload;
  onOpenPreferences?: () => void;
}

const CATEGORY_LABELS: Record<TriggerReasonCode, string> = {
  followed_case: "Followed case update",
  subscribed_topic: "Subscribed topic",
  nearby_alert: "Nearby activity",
  mentioned: "Mentioned you",
  staff_assignment: "Staff assignment",
};

export function AlertPreviewExplainer({ payload, onOpenPreferences }: AlertPreviewExplainerProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const category = CATEGORY_LABELS[payload.context.reasonCode];

  return (
    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
        <h4 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: "16px" }}>{payload.headline}</h4>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "12px",
            background: "#e0e7ff",
            color: "#3730a3",
            fontWeight: "500",
            whiteSpace: "nowrap",
          }}
        >
          {category}
        </span>
      </div>
      <p style={{ margin: "0 0 12px 0", color: "#334155", fontSize: "14px", lineHeight: "1.5" }}>
        {payload.previewBody}
      </p>
      <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "12px" }}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((prev) => !prev)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            color: "#64748b",
            fontSize: "12px",
            fontStyle: "italic",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span aria-hidden="true">{expanded ? "▼" : "▶"} </span>
          Why you received this notification
        </button>
        {expanded && (
          <div id={detailsId} style={{ marginTop: "8px" }}>
            <p style={{ margin: "0 0 8px 0", color: "#475569", fontSize: "13px", lineHeight: "1.5" }}>
              {payload.explanationCopy}
            </p>
            {onOpenPreferences && (
              <button
                type="button"
                onClick={onOpenPreferences}
                style={{
                  background: "none",
                  border: "none",
                  color: "#2563eb",
                  fontSize: "12px",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Change your notification preferences
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const AlertPreviewExplainerCard = AlertPreviewExplainer;
export type { AlertPreviewExplainerProps };
