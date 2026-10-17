# Notification Preference Center & Moderation Guide

This document details the notification preference channels, moderation alert settings, and preference center UI components in Sidewalk.

## Architecture

1. **Preference Center Service**:
   - `apps/api/src/modules/notifications/services/notification-preference-center.service.ts`: `NotificationPreferenceCenterService` managing user channel toggles.

2. **Web Preference UI**:
   - `NotificationPreferenceCenterCard`: React UI component offering granular toggles for report updates and moderation alerts.

3. **Validation Schemas & Interfaces**:
   - `notificationCategoryPreferencesSchema` and `NotificationCategoryPreferences` defined in `@qyou/shared`.
