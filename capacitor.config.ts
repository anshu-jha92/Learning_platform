import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Two ways to run the native shell.
 *
 * 1. SERVER MODE — set MOBILE_SERVER_URL to a running instance (your dev machine on the
 *    LAN, or a deployed one). The shell loads the live app, so you get the whole thing,
 *    API routes included, with nothing to rebuild. This is the fastest way to confirm the
 *    microphone works inside a real WebView on a real phone, which is the single biggest
 *    unknown in a mobile build.
 *
 * 2. BUNDLE MODE — no MOBILE_SERVER_URL. The static export in out/ ships inside the app
 *    and calls a hosted API set by NEXT_PUBLIC_API_BASE_URL at build time.
 *
 * cleartext is enabled only for a plain-http server URL, which is what a LAN dev server
 * is. Android blocks cleartext traffic by default, so without it the shell silently
 * fails to load.
 */
const serverUrl = process.env.MOBILE_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.englishcoach.app",
  appName: "Meeting English Coach",
  webDir: "out",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
};

export default config;
