# Sidewalk Mobile

Expo / React Native app for Sidewalk.

## Prerequisites

- Node.js 20+
- pnpm 9+ (from the repository root)
- Expo CLI via `pnpm` / `npx expo`
- iOS Simulator (Xcode) and/or Android Emulator (Android Studio), or Expo Go on a physical device

## Install

From the repository root:

```bash
pnpm install
```

## Environment variables

Copy the example env file:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

`apps/mobile/.env.example` defines:

```env
EXPO_PUBLIC_API_URL=http://localhost:4000
```

Set `EXPO_PUBLIC_API_URL` to the URL where the local API is reachable from the device running the app:

| Platform | `EXPO_PUBLIC_API_URL` example | Notes |
| --- | --- | --- |
| iOS Simulator | `http://localhost:4000` | `localhost` resolves to the host machine. |
| Android Emulator | `http://10.0.2.2:4000` | `10.0.2.2` maps to the host machine from the Android emulator. |
| Physical device (Expo Go / dev build) | `http://<YOUR_LAN_IP>:4000` | Use your computer's LAN IP, e.g. `http://192.168.1.20:4000`. The phone and computer must be on the same network. |

> `localhost` does **not** work on a physical phone or the Android emulator. Use `10.0.2.2` for Android emulator or your machine's LAN IP for physical devices.

## Run the app

Start the local API first (see the repository root README for API setup), then start mobile:

```bash
# from repository root
pnpm --filter @sidewalk/mobile dev

# or target a platform directly
pnpm --filter @sidewalk/mobile ios
pnpm --filter @sidewalk/mobile android
```

From `apps/mobile` you can also run:

```bash
pnpm dev
pnpm ios
pnpm android
```

## Run against the local API

1. Start the API and confirm it is reachable at `http://localhost:4000` on your machine.
2. Set `EXPO_PUBLIC_API_URL` using the platform-specific value from the table above.
3. Start Expo: `pnpm --filter @sidewalk/mobile dev`.
4. Open the app in iOS Simulator, Android Emulator, or Expo Go.
5. If requests fail from a physical device, verify your firewall allows inbound connections to port `4000` and that the device is on the same Wi-Fi network.

## Push notifications and Expo Go

- Expo Go has limited support for remote push notifications. For full push notification behavior, use a development build.
- Permission prompts and device token behavior can differ between Expo Go, development builds, and production builds.
- When testing push registration locally, confirm the API endpoint you register with is reachable from the selected platform using the correct `EXPO_PUBLIC_API_URL`.

## Useful scripts

```bash
pnpm --filter @sidewalk/mobile lint
pnpm --filter @sidewalk/mobile typecheck
pnpm --filter @sidewalk/mobile test
```
