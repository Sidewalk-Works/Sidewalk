# Quiet Hours & Digest Notification Behavior Guide

This document details the quiet hours evaluation logic, digest interval schedules, and user settings components in Sidewalk.

## Architecture

1. **Quiet Hours Evaluator**:
   - Planned backend service (not implemented; current module: `apps/api/src/modules/notifications/`): `QuietHoursEvaluatorService` evaluating local hour windows.

2. **Web Settings UI**:
   - `QuietHoursSettingsCard`: React UI component offering time window selectors and enable/disable toggles.

3. **Validation Schemas & Interfaces**:
   - `quietHoursScheduleSchema` and `QuietHoursSchedule` defined in `@sidewalk/shared`.
