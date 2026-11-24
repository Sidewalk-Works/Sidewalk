# Real-time Status Toast & Banner Notifications Guide

This document details the toast notification levels, real-time status update payloads, and web container UI components in Sidewalk.

## Architecture

1. **Broadcaster Service**:
   - Planned backend service (not implemented; current module: `apps/api/src/modules/notifications/`): `RealtimeStatusBroadcasterService` constructing toast payloads.

2. **Web Container UI**:
   - `RealtimeStatusToastBannerContainer`: React component rendering active toast notifications in bottom-right viewports.

3. **Validation Schemas & Interfaces**:
   - `toastNotificationMessageSchema` and `ToastNotificationMessage` defined in `@sidewalk/shared`.
