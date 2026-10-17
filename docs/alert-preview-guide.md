# Alert Preview & Explanation Guide

This document explains the logic used to generate human-readable contextual copy explaining why a specific notification was routed to a user in Sidewalk.

## Architecture

1. **Alert Preview Service**:
   - `apps/api/src/modules/notifications/services/alert-preview.service.ts`: Translates system trigger reason codes into clear explanation strings.

2. **Web Explainer Component**:
   - `AlertPreviewExplainer`: React component rendering the notification body with an attached explanation footer.

3. **Validation Schemas & Interfaces**:
   - `alertPreviewPayloadSchema` and `AlertPreviewPayload` defined in `@qyou/shared`.
