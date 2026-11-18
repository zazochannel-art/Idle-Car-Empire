package com.zazochannel.idlecarempire;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "idlecarempire";

    /**
     * The game's own plugin (Google Play Games), registered before the bridge starts, and the
     * window drawn edge to edge. Android 15+ does that for every app that targets it; EdgeToEdge
     * (AndroidX's way, no deprecated window calls of our own) makes Android 7 to 14 do the same, so
     * the game's safe-area padding (Capacitor's SystemBars plugin, capacitor.config.ts) is the one
     * layout on every version. The bars are transparent with light icons over the game's dark
     * screens; the status bar's readable shade is the page's own (.status-scrim).
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The launch theme (the splash) hands over to the game's own theme here, first: the window
        // is built from whatever theme is current when EdgeToEdge below first touches it. Built from
        // the launch theme, some phones added a title bar with the app's name, drawn over a squashed
        // splash picture, above the game.
        SplashScreen.installSplashScreen(this);
        SystemBarStyle bars = SystemBarStyle.dark(Color.TRANSPARENT);
        EdgeToEdge.enable(this, bars, bars);
        registerPlugin(PlayGamesPlugin.class);
        registerPlugin(SharePlugin.class);
        registerPlugin(InstallReferrerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Capacitor destroys its WebView when the activity's window goes away (onDetachedFromWindow).
     * When Android recreates the activity and hands the same window on to the new one (on some
     * phones it does so right at start, when the WebView's resources are first added to the app),
     * that never happens: the old WebView, with its own copy of the game, kept running and saving
     * next to the new one, and the two overwrote each other's progress. So the WebView goes with
     * its activity. (Capacitor's own destroy, if it still comes, only logs a warning then.)
     */
    @Override
    public void onDestroy() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        super.onDestroy();
        if (webView == null) return;
        if (webView.getParent() instanceof ViewGroup) ((ViewGroup) webView.getParent()).removeView(webView);
        webView.destroy();
    }

    /**
     * Back with nothing open puts the game in the background (lib/native.ts → App.minimizeApp →
     * here). Should Android refuse to move the task, or say it moved it while the game stays in
     * front (seen on the emulator: "moved", yet still focused a minute later), the home screen
     * comes up instead, as with the Home button. Either way logcat says what happened (the
     * emulator check reads it).
     */
    @Override
    public boolean moveTaskToBack(boolean nonRoot) {
        boolean moved = super.moveTaskToBack(nonRoot);
        Log.i(TAG, "moveTaskToBack: " + (moved ? "moved" : "refused, showing the home screen") + " (" + Thread.currentThread().getName() + ")");
        if (!moved) showHome();
        else getWindow().getDecorView().postDelayed(() -> {
            if (!hasWindowFocus()) return;
            Log.i(TAG, "moveTaskToBack: still in front, showing the home screen");
            showHome();
        }, 1000);
        return moved;
    }

    private void showHome() {
        startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
}
