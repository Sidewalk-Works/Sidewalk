# Mobile Push Registration and Opt-Out Guide

This document explains the mobile push registration lifecycle and the technical process for handling opt-outs and device token invalidation.

## Architecture

1. **Push Token Service**:
   - `apps/api/src/modules/notifications/services/push-docs.service.ts`: Stores and removes push device tokens for users.

2. **Web Push Registration Panel**:
   - `PushDocsPanel`: React component for users to manually trigger push registration or opt-out.

3. **Validation Schemas & Interfaces**:
   - `pushRegistrationDataSchema` and `PushRegistrationData` defined in `@qyou/shared`.
