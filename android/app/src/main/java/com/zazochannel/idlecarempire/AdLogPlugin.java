package com.zazochannel.idlecarempire;

import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The ad diagnostics (src/lib/ad-log.ts) in logcat under one tag, IDLE_CAR_ADMOB, in every build:
 * a release build's console doesn't reach logcat. Lines only (no ids beyond a unit's last digits).
 * In Android Studio: Logcat, filter "tag:IDLE_CAR_ADMOB".
 */
@CapacitorPlugin(name = "AdLog")
public class AdLogPlugin extends Plugin {

    private static final String TAG = "IDLE_CAR_ADMOB";

    @PluginMethod
    public void log(PluginCall call) {
        String line = call.getString("line", "");
        if (line != null && !line.isEmpty()) Log.i(TAG, line.length() > 1000 ? line.substring(0, 1000) : line);
        call.resolve();
    }
}
