package com.zazochannel.idlecarempire;

import android.content.Intent;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "idlecarempire";

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
     * here). Should Android refuse to move the task, the home screen comes up instead, as with the
     * Home button. Either way logcat says what happened (the emulator check reads it).
     */
    @Override
    public boolean moveTaskToBack(boolean nonRoot) {
        boolean moved = super.moveTaskToBack(nonRoot);
        Log.i(TAG, "moveTaskToBack: " + (moved ? "moved" : "refused, showing the home screen") + " (" + Thread.currentThread().getName() + ")");
        if (!moved) {
            startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        return moved;
    }
}
