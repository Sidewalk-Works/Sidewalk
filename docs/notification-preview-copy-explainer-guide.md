# Notification Preview Copy & Trigger Explainer Guide

This document details the alert preview generator logic, trigger reason categories, and explainer UI cards in Sidewalk.

## Architecture

1. **Explainer Service**:
   - Planned backend service (not implemented; current module: `apps/api/src/modules/notifications/`): `AlertPreviewExplainerService` formatting human-readable trigger explainers.

2. **Web Explainer UI**:
   - `AlertPreviewExplainerCard`: React component displaying alert preview text alongside trigger rationale callouts.

3. **Validation Schemas & Interfaces**:
   - `alertPreviewPayloadSchema` and `AlertPreviewPayload` defined in `@sidewalk/shared`.
