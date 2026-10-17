# Quiet Hours & Digest Notification Behavior Guide

This document details the quiet hours evaluation logic, digest interval schedules, and user settings components in Sidewalk.

## Architecture

1. **Quiet Hours Evaluator**:
   - `apps/api/src/modules/notifications/services/quiet-hours-evaluator.service.ts`: `QuietHoursEvaluatorService` evaluating local hour windows.

2. **Web Settings UI**:
   - `QuietHoursSettingsCard`: React UI component offering time window selectors and enable/disable toggles.

3. **Validation Schemas & Interfaces**:
   - `quietHoursScheduleSchema` and `QuietHoursSchedule` defined in `@qyou/shared`.
