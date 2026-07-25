# Public Activity Signals & Progress Ticker Guide

This document details the public case activity feed schemas, emission services, and live ticker UI patterns in Sidewalk.

## Architecture

1. **Activity Service**:
   - `apps/api/src/modules/cases/services/public-activity-signals.service.ts`: `PublicActivitySignalsService` handling recent progress event buffers.

2. **Web Ticker UI**:
   - `PublicActivitySignalTicker`: React UI component for horizontally scrolling live activity updates.

3. **Validation Schemas & Interfaces**:
   - `publicProgressEventSchema` and `PublicProgressEvent` defined in `@qyou/shared`.
