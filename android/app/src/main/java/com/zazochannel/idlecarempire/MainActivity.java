package com.zazochannel.idlecarempire;

import android.view.ViewGroup;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
}
