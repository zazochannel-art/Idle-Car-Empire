package com.zazochannel.idlecarempire;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * What Google Play says brought this install (src/lib/install-referrer.ts): the `referrer` of the
 * store link the player came from. A friend's shared link carries their invite code in it
 * (utm_content), so a new player gets the friend's welcome gift without typing the code. Answers
 * "" when Play has nothing to say (installed some other way, or Play unavailable).
 */
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        InstallReferrerClient client;
        try {
            client = InstallReferrerClient.newBuilder(getContext()).build();
        } catch (Exception e) {
            answer(call, "");
            return;
        }
        AtomicBoolean done = new AtomicBoolean(false);
        try {
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int code) {
                    if (done.getAndSet(true)) return;
                    String referrer = "";
                    if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                        try {
                            String r = client.getInstallReferrer().getInstallReferrer();
                            if (r != null) referrer = r;
                        } catch (Exception ignored) {
                            // nothing to read: "" below
                        }
                    }
                    try {
                        client.endConnection();
                    } catch (Exception ignored) {
                        // already closed
                    }
                    answer(call, referrer);
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    if (!done.getAndSet(true)) answer(call, "");
                }
            });
        } catch (Exception e) {
            if (!done.getAndSet(true)) answer(call, "");
        }
    }

    private static void answer(PluginCall call, String referrer) {
        JSObject r = new JSObject();
        r.put("referrer", referrer);
        call.resolve(r);
    }
}
