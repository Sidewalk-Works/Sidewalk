# Scheduled Notification Digests Guide

This document details the scheduled summary aggregation logic for daily or weekly notification roundups in Sidewalk.

## Architecture

1. **Digest Scheduler Service**:
   - `apps/api/src/modules/notifications/services/digest-scheduler.service.ts`: Groups pending notifications into a single email/push payload based on user cadence.

2. **Web Upsell Banner**:
   - `NotificationDigestBanner`: React UI component for prompting active users to switch to batched digests.

3. **Validation Schemas & Interfaces**:
   - `digestPayloadSchema` and `DigestPayload` defined in `@qyou/shared`.
