# In-App Notification Inbox & Drawer Guide

This document details the in-app notification inbox drawer, read-state persistence, and notification item schemas in Sidewalk.

## Architecture

1. **Inbox Service**:
   - `apps/api/src/modules/notifications/services/in-app-notification-inbox.service.ts`: `InAppNotificationInboxService` retrieving user notification feeds.

2. **Web Drawer UI**:
   - `InAppNotificationInboxDrawer`: React component rendering side-drawer notification feeds.

3. **Validation Schemas & Interfaces**:
   - `inAppNotificationItemSchema` and `InAppNotificationItem` defined in `@qyou/shared`.
