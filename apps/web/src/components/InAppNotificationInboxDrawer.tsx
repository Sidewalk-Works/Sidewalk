import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InAppNotificationItem } from "@sidewalk/shared";

interface InAppNotificationInboxDrawerProps {
  isOpen: boolean;
  items?: InAppNotificationItem[];
  onClose?: () => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type CategoryFilter = "all" | InAppNotificationItem["category"];

const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "status_change", label: "Status" },
  { value: "comment_reply", label: "Replies" },
  { value: "moderation", label: "Moderation" },
  { value: "system", label: "System" },
];

const EMPTY_MESSAGES: Record<CategoryFilter, string> = {
  all: "Your inbox is empty.",
  status_change: "No status change notifications.",
  comment_reply: "No reply notifications.",
  moderation: "No moderation notifications.",
  system: "No system notifications.",
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function InAppNotificationInboxDrawer({
  isOpen,
  items = [],
  onClose,
  onMarkAsRead,
  onMarkAllRead,
  triggerRef,
}: InAppNotificationInboxDrawerProps) {
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const filteredItems = useMemo(
    () => (activeFilter === "all" ? items : items.filter((i) => i.category === activeFilter)),
    [items, activeFilter],
  );

  const unreadCount = useMemo(() => items.filter((i) => !i.isRead).length, [items]);
  const filteredUnread = useMemo(() => filteredItems.filter((i) => !i.isRead), [filteredItems]);

  const restoreFocus = useCallback(() => {
    const target = triggerRef?.current ?? previousFocusRef.current;
    if (target && typeof target.focus === "function") {
      target.focus();
    }
    previousFocusRef.current = null;
  }, [triggerRef]);

  const restoreFocus = useCallback(() => {
    const target = triggerRef?.current ?? previousFocusRef.current;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
    previousFocusRef.current = null;
  }, [triggerRef]);

  // Focus trap and Escape-to-dismiss
  const handleClose = useCallback(() => {
    setActiveFilter("all");
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = triggerRef?.current ?? (document.activeElement as HTMLElement | null);
    const frame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      restoreFocus();
    };
  }, [isOpen, restoreFocus, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, isOpen]);

  if (!isOpen) return null;

  const handleItemActivate = (item: InAppNotificationItem) => {
    if (!item.isRead && onMarkAsRead) {
      onMarkAsRead(item.id);
    }
    if (item.actionUrl) {
      window.location.assign(item.actionUrl);
    }
  };

  const handleMarkAllRead = () => {
    if (filteredUnread.length === 0) return;
    if (onMarkAsRead) {
      filteredUnread.forEach((item) => onMarkAsRead(item.id));
      return;
    }
    onMarkAllRead?.();
  };

  const tabPanelId = "notification-inbox-panel";
  const titleId = "notification-inbox-title";

  return (
    <>
      <div
        aria-hidden="true"
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.3)",
          zIndex: 899,
        }}
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(380px, 100vw)",
          maxWidth: "100vw",
          background: "#ffffff",
          borderLeft: "1px solid #cbd5e1",
          boxShadow: "-4px 0 12px rgba(0,0,0,0.08)",
          zIndex: 900,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3 id={titleId} style={{ margin: 0, fontSize: "16px" }}>Notifications</h3>
            {unreadCount > 0 && (
              <span
                aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
                style={{ background: "#ef4444", color: "#ffffff", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", fontWeight: 600 }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {filteredUnread.length > 0 && (onMarkAsRead || onMarkAllRead) && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "3px 8px", fontSize: "11px", color: "#2563eb", cursor: "pointer", fontWeight: 500 }}
              >
                Mark visible read
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              aria-label="Close notifications"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#334155" }}
            >
              ×
            </button>
          )}
          <button ref={closeButtonRef} onClick={handleClose} aria-label="Close notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <div role="tablist" aria-label="Notification categories" style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0" }}>
          {CATEGORY_TABS.map((tab) => {
            const selected = activeFilter === tab.value;
            const tabId = `notification-tab-${tab.value}`;
            return (
              <button
                key={tab.value}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={tabPanelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveFilter(tab.value)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  background: "none",
                  border: "none",
                  borderBottom: selected ? "2px solid #2563eb" : "2px solid transparent",
                  color: selected ? "#2563eb" : "#64748b",
                  fontSize: "12px",
                  fontWeight: selected ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          id={tabPanelId}
          role="tabpanel"
          aria-labelledby={`notification-tab-${activeFilter}`}
          style={{ flex: 1, overflowY: "auto", padding: "16px" }}
        >
          <p aria-live="polite" style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px 0" }}>
            Showing {filteredItems.length} notification{filteredItems.length === 1 ? "" : "s"}
          </p>

          {filteredItems.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#64748b", textAlign: "center", marginTop: "40px" }}>
              {EMPTY_MESSAGES[activeFilter]}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleItemActivate(item)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px",
                      background: item.isRead ? "#ffffff" : "#f0f9ff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: item.isRead ? 400 : 700, fontSize: "13px", color: "#0f172a" }}>{item.title}</div>
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>{item.body}</div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px" }}>{formatRelativeTime(item.createdAtIso)}</div>
                      </div>
                      <div style={{ flexShrink: 0, minWidth: "48px", textAlign: "right" }}>
                        {!item.isRead ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#2563eb", fontWeight: 600 }}>
                            <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2563eb" }} />
                            <span>Unread</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#94a3b8" }}>Read</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
