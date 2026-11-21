# Mobile Push Registration and Opt-Out Guide

This guide describes the current mobile push registration implementation in this repository and the planned backend contract needed for end-to-end device registration.

## Current mobile implementation

The mobile app currently implements local registration state and UI flows:

- `apps/mobile/src/services/pushRegistrationService.ts`
  - Stores registration state in local storage.
  - Builds registration payloads (`deviceToken`, `platform`, `optIn`, `registeredAtIso`).
  - Exposes helpers for register/unregister/opt-out/opt-in state transitions.
  - Accepts optional API callback functions, but no backend endpoint is wired in this repo.
- `apps/mobile/src/hooks/usePushRegistration.ts`
  - React hook wrapper for registration, unregister, opt-in/out, and refresh.
- `apps/mobile/src/components/PushRegistrationPrompt.tsx`
  - UI prompt to enable push notifications.
- `apps/mobile/src/components/PushOptOutSettings.tsx`
  - Settings UI showing registration status and opt-out/revoke actions.
- `apps/mobile/src/components/PushOptOutDialog.tsx`
  - Confirmation dialog for opt-out / re-enable flows.

Shared type currently present:

- `packages/shared/src/types/push-docs.types.ts` (`PushRegistrationData`)

## Current limitations

- There is no FastAPI device-registration endpoint in `apps/api` yet.
- No push provider integration (FCM/APNs/Expo push service) is implemented server-side.
- Mobile registration helpers can call injected API callbacks, but the app does not have a real backend contract wired by default.

## Planned server contract (for backend implementation)

The following contract is a suggested starting point so mobile and API can integrate consistently.

### Register device token

- `POST /api/notifications/devices`
- Auth: required (Bearer token)
- Request body:

```json
{
  "deviceToken": "string",
  "platform": "ios | android | web",
  "optIn": true,
  "registeredAtIso": "2026-01-01T00:00:00.000Z"
}
```

- Success: `201 Created`

```json
{
  "id": "uuid",
  "deviceToken": "string",
  "platform": "ios",
  "optIn": true,
  "registeredAtIso": "2026-01-01T00:00:00.000Z"
}
```

- Errors:
  - `400` invalid payload (missing token, invalid platform)
  - `401` unauthenticated
  - `409` token already registered to another active user/device record (if enforced)

### Unregister / revoke device token

- `DELETE /api/notifications/devices/{deviceToken}` (or `DELETE /api/notifications/devices/current` with token in body)
- Auth: required
- Success: `204 No Content`
- Errors: `401` unauthenticated, `404` token not found

### Update opt-out preference

- `PATCH /api/notifications/devices/{deviceToken}/preferences`
- Auth: required
- Request body:

```json
{
  "optIn": false
}
```

- Success: `200 OK` with updated device registration record
- Errors: `400` invalid payload, `401` unauthenticated, `404` token not found

## Opt-out and invalidation expectations

- **Opt-out:** client should keep local state in sync and call the backend preference endpoint when available. Opt-out should stop push delivery but not necessarily delete in-app notifications.
- **Token invalidation:** when push provider reports invalid/unregistered tokens, backend should mark/delete the device record and stop sending to it.
- **Re-register:** when a token refreshes, client should register the new token and backend should upsert/replace the old token for the same device/user as appropriate.

## Related code

- `apps/mobile/src/services/pushRegistrationService.ts`
- `apps/mobile/src/hooks/usePushRegistration.ts`
- `apps/mobile/src/components/PushRegistrationPrompt.tsx`
- `apps/mobile/src/components/PushOptOutSettings.tsx`
- `apps/mobile/src/components/PushOptOutDialog.tsx`
- `packages/shared/src/types/push-docs.types.ts`
