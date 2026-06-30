import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Maverick iOS app.
 *
 * `server.url` points at the live published web app, so the iOS shell always
 * runs the latest Maverick UI without a rebuild. Set `server.url` to your
 * preview URL while developing if you want to test in-progress changes.
 *
 * To run locally instead of the live server, comment out `server` and run
 * `bun run build` first so Capacitor copies `dist/` into the iOS app.
 */
const config: CapacitorConfig = {
  appId: "app.lovable.maverick",
  appName: "Maverick",
  webDir: "dist",
  server: {
    url: "https://maverick-morning.lovable.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0b0b0c",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#f97316",
      sound: "alarm.wav",
    },
  },
};

export default config;
