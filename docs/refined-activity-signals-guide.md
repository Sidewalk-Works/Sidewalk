# Refined Public Activity Signals Guide

This document details the improved public activity feed service and the visually refined live scrolling ticker in Sidewalk.

## Architecture

1. **Activity Service**:
   - `apps/api/src/modules/cases/services/refined-activity-signals.service.ts`: Handles aggregating the latest 50 live events for broad consumption.

2. **Web Refined Ticker UI**:
   - `RefinedActivitySignalTicker`: React UI component for horizontally scrolling live activity updates with a pulse indicator and semantic themes.

3. **Validation Schemas & Interfaces**:
   - `refinedProgressEventSchema` and `RefinedProgressEvent` defined in `@qyou/shared`.
