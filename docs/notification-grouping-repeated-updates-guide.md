# Notification Grouping for Repeated Case Updates Guide

This document details the deduplication window logic, notification thread rollup services, and grouped UI cards in Sidewalk.

## Architecture

1. **Grouping Service**:
   - `apps/api/src/modules/notifications/services/notification-grouping.service.ts`: `NotificationGroupingService` rolling up multiple updates for the same case into single group entries.

2. **Web Group UI**:
   - `GroupedCaseNotificationCard`: React component displaying update badges and summary text.

3. **Validation Schemas & Interfaces**:
   - `groupedCaseNotificationSchema` and `GroupedCaseNotification` defined in `@qyou/shared`.
