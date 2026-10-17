import type { CapacitorConfig } from "@capacitor/cli";

// The Android and iOS apps: the game's static export (`npm run build:app`)
// packaged inside each app, so it starts and plays with no connection. Cloud
// saves and the other online features call Supabase from the app.
const config: CapacitorConfig = {
  // Permanent once the app is on Google Play: a new id is a different app.
  appId: "com.zazochannel.idlecarempire",
  appName: "Idle Car Empire",
  webDir: "out",
  // the game's own background, so there is no white flash before the first frame
  backgroundColor: "#06070a",
  server: {
    // The page's origin is https://localhost and the saves live in that origin's
    // localStorage: changing the scheme or the hostname in a later version would
    // leave every player's progress behind. Never change these two.
    androidScheme: "https",
    hostname: "localhost",
  },
  android: {
    // the game never loads http:// content
    allowMixedContent: false,
  },
  ios: {
    // the page runs edge to edge; the game pads its HUD with env(safe-area-inset-*)
    contentInset: "never",
  },
  plugins: {
    SystemBars: {
      // light status-bar icons over the game's dark screens; the game pads its HUD and
      // sheets with env(safe-area-inset-*) (its page has viewport-fit=cover)
      style: "DARK",
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
    LocalNotifications: {
      // Android: the emblem's silhouette (scripts/app-assets.mjs), tinted in the game's gold
      smallIcon: "ic_stat_notify",
      iconColor: "#f59e0b",
    },
  },
};

export default config;
