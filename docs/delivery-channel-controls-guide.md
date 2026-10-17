# Delivery Channel Controls Guide

This document explains how Sidewalk routes notifications to specific delivery mechanisms (email, push, in-app) based on user channel preferences.

## Architecture

1. **Routing Service**:
   - `apps/api/src/modules/notifications/services/delivery-channel.service.ts`: Resolves delivery arrays based on user toggles and message urgency.

2. **Web Settings Panel**:
   - `DeliveryChannelControlsPanel`: React UI component for users to toggle email, mobile push, and in-app alerts.

3. **Validation Schemas & Interfaces**:
   - `deliveryChannelPreferencesSchema` and `AlertDeliveryPayload` defined in `@qyou/shared`.
