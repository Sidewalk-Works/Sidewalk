# Unread Count & Badge Behavior Guide

This document specifies the unread notification counter logic, badge state schemas, and navigation badge UI components in Sidewalk.

## Architecture

1. **Badge Counter Service**:
   - `apps/api/src/modules/notifications/services/unread-badge-counter.service.ts`: `UnreadBadgeCounterService` managing unread state counts and mark-read actions.

2. **Web Badge UI**:
   - `UnreadNotificationBadgeIcon`: React component rendering unread count badges over navigation bell icons.

3. **Validation Schemas & Interfaces**:
   - `unreadBadgeStateSchema` and `UnreadBadgeState` defined in `@qyou/shared`.
