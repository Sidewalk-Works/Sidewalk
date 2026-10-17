import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { InAppNotificationItem } from '@qyou/shared';

interface InAppNotificationInboxDrawerProps {
  isOpen: boolean;
  items?: InAppNotificationItem[];
  onClose?: () => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

type CategoryFilter = 'all' | InAppNotificationItem['category'];

const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'status_change', label: 'Status' },
  { value: 'comment_reply', label: 'Replies' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'system', label: 'System' },
];

const EMPTY_MESSAGES: Record<CategoryFilter, string> = {
  all: 'Your inbox is empty.',
  status_change: 'No status change notifications.',
  comment_reply: 'No reply notifications.',
  moderation: 'No moderation notifications.',
  system: 'No system notifications.',
};

export function InAppNotificationInboxDrawer({
  isOpen,
  items = [],
  onClose,
  onMarkAsRead,
  onMarkAllRead,
  triggerRef,
}: InAppNotificationInboxDrawerProps) {
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const filteredItems = useMemo(
    () => (activeFilter === 'all' ? items : items.filter((i) => i.category === activeFilter)),
    [items, activeFilter],
  );

  const unreadCount = useMemo(() => items.filter((i) => !i.isRead).length, [items]);

  // Focus trap and Escape-to-dismiss
  const handleClose = useCallback(() => {
    onClose?.();
    // Return focus to trigger element
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = triggerRef?.current ?? document.activeElement as HTMLElement;
      // Focus the close button inside the drawer after render
      requestAnimationFrame(() => {
        const closeBtn = drawerRef.current?.querySelector('button');
        closeBtn?.focus();
      });
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      // Focus trap: Tab cycling within the drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleItemClick = (item: InAppNotificationItem) => {
    if (!item.isRead && onMarkAsRead) {
      onMarkAsRead(item.id);
    }
  };

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px', background: '#ffffff', borderLeft: '1px solid #cbd5e1', boxShadow: '-4px 0 12px rgba(0,0,0,0.08)', zIndex: 900, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Notifications</h3>
          {unreadCount > 0 && (
            <span style={{ background: '#ef4444', color: '#ffffff', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: '600' }}>
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {unreadCount > 0 && onMarkAllRead && (
            <button
              onClick={onMarkAllRead}
              style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', color: '#3b82f6', cursor: 'pointer', fontWeight: '500' }}
            >
              Mark all read
            </button>
          )}
          <button onClick={handleClose} aria-label="Close notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e2e8f0' }}>
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveFilter(tab.value)}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'none',
              border: 'none',
              borderBottom: activeFilter === tab.value ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeFilter === tab.value ? '#3b82f6' : '#64748b',
              fontSize: '12px',
              fontWeight: activeFilter === tab.value ? '600' : '400',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', margin: '0 0 12px 0' }}>Pull down to refresh</p>

        {filteredItems.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', marginTop: '40px' }}>
            {EMPTY_MESSAGES[activeFilter]}
          </p>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              style={{
                padding: '12px',
                background: item.isRead ? '#ffffff' : '#f0f9ff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                marginBottom: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: item.isRead ? '400' : 'bold', fontSize: '13px', color: '#0f172a' }}>{item.title}</div>
                {!item.isRead && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: '4px' }} />
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>{item.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
