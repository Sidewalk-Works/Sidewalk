# Report Thread Lifecycle Trigger Rules Guide

This document specifies the lifecycle stage transition trigger rules, subscriber notification conditions, and web badge UI components in Sidewalk.

## Architecture

1. **Lifecycle Trigger Service**:
   - Planned backend service (not implemented; current module: `apps/api/src/modules/reports/`): `ReportLifecycleTriggerService` evaluating stage transition rules.

2. **Web Badge Component**:
   - `ReportLifecycleTriggerBadge`: React component rendering report status transition badges.

3. **Validation Schemas & Interfaces**:
   - `lifecycleTriggerEvaluationPayloadSchema` and `ReportLifecycleStage` defined in `@sidewalk/shared`.
