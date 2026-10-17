# Notification Dispatch History & Audit Guide

This document details the notification dispatch audit log tables, channel tags, and history retrieval services in Sidewalk.

## Architecture

1. **Audit Log Service**:
   - `apps/api/src/modules/notifications/services/notification-audit-history.service.ts`: `NotificationAuditHistoryService` recording and fetching dispatch events.

2. **Web Audit UI**:
   - `NotificationAuditHistoryTable`: React component rendering sent notification histories and channel tags.

3. **Validation Schemas & Interfaces**:
   - `notificationAuditLogItemSchema` and `NotificationAuditLogItem` defined in `@qyou/shared`.
