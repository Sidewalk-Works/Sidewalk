# Toast and Banner Patterns Guide

This document details the refined in-app toast and banner UI patterns for real-time status change alerts in Sidewalk.

## Architecture

1. **Toast Trigger Service**:
   - `apps/api/src/modules/notifications/services/toast-trigger.service.ts`: Dispatches status change payloads formatted for client-side consumption.

2. **Web Banner Component**:
   - `StatusChangeBanner`: React component displaying persistent or dismissible global banners.

3. **Validation Schemas & Interfaces**:
   - `toastNotificationSchema` and `ToastNotification` defined in `@qyou/shared`.
