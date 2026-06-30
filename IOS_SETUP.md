# Maverick iOS App Setup

This project is wired for Capacitor. The iOS shell wraps the published web app
and adds true OS-level local notifications so your alarm fires even when the
app is closed.

## What you get on iOS

- **System alarm notification** at your set time (custom 30s sound, repeats daily).
- **Pre-gen notification** 5 minutes before the alarm — taps the briefing generator
  so audio is ready when you wake up. Also runs on app resume as a safety net.
- **Tap the alarm notification → app opens → briefing plays.** Same flow as web,
  but the trigger is the real iOS notification system.

> ⚠️ Without **Critical Alerts** entitlement, the alarm sound respects the
> ringer + Focus modes. If your phone is on silent, the notification still
> arrives but plays no sound. Critical Alerts requires a separate Apple
> approval request (see "Critical Alerts" below) — wire it up now, submit
> the form when you're ready.

## One-time setup (Mac with Xcode)

```bash
# 1. Build the web bundle (only needed if you set webDir mode)
bun run build

# 2. Add the native iOS project (creates /ios)
bunx cap add ios

# 3. Open in Xcode
bunx cap open ios
```

In Xcode:

1. Select the `App` target → **Signing & Capabilities**.
2. Set your Apple Developer team. Bundle ID is `app.lovable.maverick` — change it
   if you've registered another in App Store Connect, then update `appId` in
   `capacitor.config.ts` to match.
3. Add capability **Push Notifications** (required for Critical Alerts later;
   not required for normal local notifications, but harmless).
4. Drop an `alarm.wav` (≤30s, in `ios/App/App/`) — this is the alarm sound
   referenced in `capacitor.config.ts` and `src/lib/native.ts`. Any short loud
   tone works. Without it iOS falls back to the default notification sound.

## Live web vs bundled web

`capacitor.config.ts` currently points `server.url` at
`https://maverick-morning.lovable.app`. That means the iOS app always shows the
latest published web UI — no rebuild needed when you ship web changes.

To switch to a fully bundled offline app, remove the `server` block and run
`bun run build && bunx cap sync ios` before each Xcode build.

## Daily workflow

```bash
# After web changes (only needed if you removed server.url)
bun run build && bunx cap sync ios

# Push to a connected device or simulator
bunx cap run ios
```

## Critical Alerts (optional — bypass silent/DND)

1. Submit the request form: https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement
2. Once Apple approves, add the `com.apple.developer.usernotifications.critical-alerts`
   entitlement in Xcode.
3. Update `src/lib/native.ts` to pass `critical: true` on the alarm notification's
   `sound` options (Capacitor LocalNotifications supports this once entitled).

## Files added for the iOS app

- `capacitor.config.ts` — Capacitor app config (bundle ID, web dir, plugin opts)
- `src/lib/native.ts` — schedule/cancel daily alarm, listen for taps, app resume
- `src/components/AlarmClock.tsx` — calls into `native.ts` when running on iOS
