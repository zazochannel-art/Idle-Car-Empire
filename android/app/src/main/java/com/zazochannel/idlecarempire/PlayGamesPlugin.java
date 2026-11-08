package com.zazochannel.idlecarempire;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

/**
 * Google Play Games Services for the game (src/lib/play-games.ts): sign-in, achievements and a
 * leaderboard. Nothing here runs until the build was given the game's Play Games project id
 * (PLAY_GAMES_APP_ID, docs/android/play-games.md): without it the id is "0", the SDK is never
 * started and every call answers "not configured", so a build without the setup behaves as before.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private boolean configured() {
        String id = getContext().getString(R.string.game_services_project_id);
        return id != null && !id.isEmpty() && !"0".equals(id);
    }

    @Override
    public void load() {
        if (configured()) PlayGamesSdk.initialize(getContext());
    }

    private JSObject state(boolean signedIn) {
        JSObject r = new JSObject();
        r.put("configured", configured());
        r.put("signedIn", signedIn);
        return r;
    }

    /** {configured, signedIn}: whether the build has Play Games set up, and the player is signed in to it. */
    @PluginMethod
    public void status(PluginCall call) {
        Activity activity = getActivity();
        if (!configured() || activity == null) {
            call.resolve(state(false));
            return;
        }
        PlayGames.getGamesSignInClient(activity)
            .isAuthenticated()
            .addOnCompleteListener(task -> call.resolve(state(task.isSuccessful() && task.getResult().isAuthenticated())));
    }

    /** Asks Play Games to sign the player in (it shows its own screen when it needs to). */
    @PluginMethod
    public void signIn(PluginCall call) {
        Activity activity = getActivity();
        if (!configured() || activity == null) {
            call.resolve(state(false));
            return;
        }
        PlayGames.getGamesSignInClient(activity)
            .signIn()
            .addOnCompleteListener(task -> call.resolve(state(task.isSuccessful() && task.getResult().isAuthenticated())));
    }

    /** Unlocks an achievement (Play Games ignores one already unlocked). */
    @PluginMethod
    public void unlock(PluginCall call) {
        String id = call.getString("id");
        Activity activity = getActivity();
        if (!configured() || activity == null || id == null || id.isEmpty()) {
            call.resolve();
            return;
        }
        PlayGames.getAchievementsClient(activity).unlock(id);
        call.resolve();
    }

    /** Submits a score to a leaderboard (Play Games keeps the best). */
    @PluginMethod
    public void submitScore(PluginCall call) {
        String id = call.getString("id");
        long score = call.getData().optLong("score", 0);
        Activity activity = getActivity();
        if (!configured() || activity == null || id == null || id.isEmpty() || score < 0) {
            call.resolve();
            return;
        }
        PlayGames.getLeaderboardsClient(activity).submitScore(id, score);
        call.resolve();
    }

    /** Opens Play Games' own list of achievements. */
    @PluginMethod
    public void showAchievements(PluginCall call) {
        Activity activity = getActivity();
        if (!configured() || activity == null) {
            call.resolve();
            return;
        }
        PlayGames.getAchievementsClient(activity)
            .getAchievementsIntent()
            .addOnSuccessListener(intent -> startActivityForResult(call, intent, "shown"))
            .addOnFailureListener(e -> call.resolve());
    }

    /** Opens a leaderboard in Play Games. */
    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        String id = call.getString("id");
        Activity activity = getActivity();
        if (!configured() || activity == null || id == null || id.isEmpty()) {
            call.resolve();
            return;
        }
        PlayGames.getLeaderboardsClient(activity)
            .getLeaderboardIntent(id)
            .addOnSuccessListener(intent -> startActivityForResult(call, intent, "shown"))
            .addOnFailureListener(e -> call.resolve());
    }

    @ActivityCallback
    private void shown(PluginCall call, ActivityResult result) {
        if (call != null) call.resolve();
    }
}
