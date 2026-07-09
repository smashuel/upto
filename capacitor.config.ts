import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor native-shell config (live location Stage 2, ADR 011). The web app keeps deploying
// to Vercel unchanged; this drives the additive iOS/Android builds over the same dist/ bundle.
//
// Two flags here are load-bearing for Stage 2's background location (see
// .scratch/live-location-stage-2/issues/02-native-background-location.md):
//  - android.useLegacyBridge: WITHOUT it, @capacitor-community/background-geolocation location
//    updates halt after ~5 min in the background — the exact failure the feature must prevent.
//  - CapacitorHttp.enabled: lets the native source POST positions over native HTTP instead of
//    WebView fetch, which Android throttles after ~5 min backgrounded (and it sidesteps CORS).
const config: CapacitorConfig = {
  appId: 'world.upto.app',
  appName: 'Upto',
  webDir: 'dist',
  android: {
    // Keep the older WebView bridge so backgrounded location updates are not killed at 5 min.
    useLegacyBridge: true,
  },
  server: {
    androidScheme: 'https',
    // NEVER commit a dev server URL (loads live-reload from a laptop). Opt in per-machine via
    // CAP_SERVER_URL for on-device dev against the Vite server; production builds ship bundled dist/.
    ...(process.env.CAP_SERVER_URL
      ? { url: process.env.CAP_SERVER_URL, cleartext: true }
      : {}),
  },
  plugins: {
    // Route native HTTP through the native layer (beats the Android WebView background throttle).
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
