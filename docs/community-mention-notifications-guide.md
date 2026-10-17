# Community Mention Notifications Guide

This document details the @mention parsing logic, notification event payloads, and toast UI styles for community reply alerts in Sidewalk.

## Architecture

1. **Mention Parser Service**:
   - `apps/api/src/modules/notifications/services/mention-parser.service.ts`: `MentionParserService` extracting @usernames and building notification events.

2. **Web Mention Toast UI**:
   - `MentionNotificationToast`: React component rendering styled alert banners for comment mentions.

3. **Validation Schemas & Interfaces**:
   - `mentionNotificationPayloadSchema` and `MentionNotificationPayload` defined in `@qyou/shared`.
