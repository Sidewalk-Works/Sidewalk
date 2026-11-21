# Notification Settings Persistence Guide

This document details the persistent notification settings architecture, cross-device sync protocols, and local storage helpers in Sidewalk.

## Architecture

1. **Persistence Service**:
   - Planned backend service (not implemented in current FastAPI backend): `NotificationSettingsPersistenceService` persisting device preferences.

2. **Web Sync Client**:
   - `apps/web/src/lib/notification-settings-sync-client.ts`: Utility functions `saveLocalNotificationSettings` and `getLocalNotificationSettings`.

3. **Validation Schemas & Interfaces**:
   - `persistentUserSettingsSchema` and `PersistentUserSettings` defined in `@sidewalk/shared`.
