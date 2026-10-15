import type { CapacitorConfig } from "@capacitor/cli";

// The Android app: the game's static export (`npm run build:android` builds it
// without the GitHub Pages prefix) packaged inside the app, so it starts and
// plays with no connection. Cloud saves and the other online features call
// Supabase from the app exactly as the web version does.
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
  plugins: {
    SystemBars: {
      // light status-bar icons over the game's dark screens; the game pads its HUD and
      // sheets with env(safe-area-inset-*) (its page has viewport-fit=cover)
      style: "DARK",
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
