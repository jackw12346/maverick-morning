/**
 * Thin Capacitor bridge. Safe to import from any client component — every
 * helper no-ops in a regular browser and only does real work inside the
 * native iOS shell.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";

export const isNative = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform(); // "ios" | "android" | "web"

const ALARM_NOTIFICATION_ID = 4242;
const PREGEN_NOTIFICATION_ID = 4243;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  const status = await LocalNotifications.checkPermissions();
  if (status.display === "granted") return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === "granted";
}

/**
 * Parse "HH:MM" into the next Date strictly in the future.
 */
function nextOccurrence(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  const fire = new Date(now);
  fire.setHours(h, m, 0, 0);
  if (fire.getTime() <= now.getTime()) fire.setDate(fire.getDate() + 1);
  return fire;
}

/**
 * Schedule the daily alarm + a 5-minute-prior "pre-generate" notification.
 * iOS local notifications repeat daily via `schedule.every: "day"`.
 *
 * NOTE: iOS plays the custom sound (up to 30s) only when the ringer is ON
 * and the app is not in silent/DND. Critical Alerts entitlement is required
 * to override silent mode.
 */
export async function scheduleDailyAlarm(hhmm: string): Promise<void> {
  if (!isNative()) return;
  if (!(await ensureNotificationPermission())) return;

  const alarmAt = nextOccurrence(hhmm);
  const pregenAt = new Date(alarmAt.getTime() - 5 * 60_000);

  await LocalNotifications.cancel({
    notifications: [{ id: ALARM_NOTIFICATION_ID }, { id: PREGEN_NOTIFICATION_ID }],
  }).catch(() => {});

  await LocalNotifications.schedule({
    notifications: [
      {
        id: PREGEN_NOTIFICATION_ID,
        title: "Maverick is preparing your briefing",
        body: "Generating today's audio…",
        schedule: { at: pregenAt, allowWhileIdle: true, every: "day" },
        sound: undefined,
        silent: true,
        extra: { kind: "pregen" },
      },
      {
        id: ALARM_NOTIFICATION_ID,
        title: "Maverick — wake up",
        body: "Tap to play your morning briefing.",
        schedule: { at: alarmAt, allowWhileIdle: true, every: "day" },
        sound: "alarm.wav",
        extra: { kind: "alarm" },
      },
    ],
  });
}

export async function cancelDailyAlarm(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({
    notifications: [{ id: ALARM_NOTIFICATION_ID }, { id: PREGEN_NOTIFICATION_ID }],
  }).catch(() => {});
}

/**
 * Subscribe to notification taps. When the alarm fires and the user taps it,
 * we invoke `onAlarm` so the app can immediately play the briefing audio.
 */
export function onNotificationAction(handlers: {
  onAlarm?: () => void;
  onPregen?: () => void;
}) {
  if (!isNative()) return () => {};
  const sub = LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const kind = (event.notification.extra as { kind?: string } | undefined)?.kind;
    if (kind === "alarm") handlers.onAlarm?.();
    if (kind === "pregen") handlers.onPregen?.();
  });
  return () => {
    void sub.then((s) => s.remove());
  };
}

/**
 * Fire when the app is foregrounded — useful to refresh data after a
 * background pre-generate has completed.
 */
export function onAppResume(handler: () => void) {
  if (!isNative()) return () => {};
  const sub = App.addListener("resume", handler);
  return () => {
    void sub.then((s) => s.remove());
  };
}
