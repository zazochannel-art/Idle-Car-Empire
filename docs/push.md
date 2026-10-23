# Notifications from the server (push)

The game already reminds players on their phone while it is closed: a building finished, the offline limit reached ([lib/notify.ts](../src/lib/notify.ts)). The phone schedules those itself.

Notifications from the server add what only the server knows:

| Note | When |
| --- | --- |
| 🎁 A gift for you | another player sent the player a gift (with the sender's name) |
| 🤝 A friend joined | a new player used the player's invite code |
| 🏁 The weekly cup is over | the cup the player raced in last week is over and their prize waits |
| 🎪 *the event's name* | an event you scheduled from the dashboard ([admin.md](admin.md)) has started |

They are written in the player's game language (all six).

Limits keep them welcome:

- At most one note of each kind every 12 hours, and 3 a day per player.
- Only between 9:00 and 21:00 on the player's phone.
- A note not sent within a day is dropped.
- When the player opens the game, the notes waiting for them are dropped: the game shows the gift, the reward or the prize itself.

**Status: ready, but off.** Nothing is sent, and no phone gives the server a token, until you do the steps below. The app built today doesn't ask Firebase for anything.

## How it works

- **The phone (Android).**
  - The player turns on Settings → Notifications.
  - In an app built with Firebase, the game asks Firebase Cloud Messaging (FCM) for the phone's token.
  - It sends the token to the server with the game's language and the phone's time zone offset (`register_push_token`).
  - Turning notifications off, or signing out, forgets the token (`forget_push_token`).
  - Code: [src/lib/push.ts](../src/lib/push.ts), [src/store/game-store.ts](../src/store/game-store.ts).
- **The database** ([0016_push.sql](../supabase/migrations/0016_push.sql)).
  - Tokens and waiting notes are in the `ops` schema, out of the API's reach.
  - Triggers queue a note on a gift or an invite.
  - `push_collect()` queues the cup's and the events' notes once each.
  - Everything goes with the account when it is deleted.
- **The sender** ([supabase/functions/push](../supabase/functions/push)): an Edge Function.
  - It queues the notes for everyone and takes the waiting notes for phones in their day hours.
  - It sends each note through FCM's HTTP v1 API, signed with your service account key.
  - It forgets the tokens FCM says are gone (uninstalled apps).
  - Without the key it only reports how many notes wait.
- **The schedule:** the database calls the sender every 5 minutes (pg_cron and pg_net).

## Cost

- Firebase Cloud Messaging is free, on Firebase's free Spark plan. No billing account is needed.
- On Supabase's free plan:
  - The Edge Function runs about 8,700 times a month (every 5 minutes); the free plan includes 500,000 invocations.
  - pg_cron and pg_net are free extensions.

Alternatives, if you'd rather not use Firebase:

- **Keep only the phone's own reminders** (what the game does today). The server-side kinds above then never notify.
- **A push service such as OneSignal.** It has a free tier, but it still needs a Firebase project for Android underneath, and adds another account and SDK.

## Turning it on (your steps)

1. **Create the Firebase project.**
   - Go to <https://console.firebase.google.com> → **Add project**.
   - Google Analytics isn't needed: you can switch it off.
2. **Add the two Android apps.** In the project, add an Android app for each package name:
   - `com.zazochannel.idlecarempire`, the store app;
   - `com.zazochannel.idlecarempire.debug`, the test APK, which the CI builds too.

   Then download **google-services.json** once both are added, so the file holds both apps.
3. **Store google-services.json in GitHub.**
   - Open the repository on GitHub → Settings → Secrets and variables → Actions → **New repository secret**.
   - Name it `GOOGLE_SERVICES_JSON`, with the whole file's content as the value.
   - The Android builds write the file and switch the game's push code on (`NEXT_PUBLIC_PUSH=1`).
   - Don't commit the file: `android/.gitignore` keeps it out.
4. **Give the sender its key.**
   - In Firebase, go to Project settings → **Service accounts** → **Generate new private key**.
   - In Supabase, open the dashboard → Edge Functions → **Secrets** and add `FCM_SERVICE_ACCOUNT`, with the whole JSON file's content as the value.
   - Then delete the downloaded file. Never put it in the repository or in a chat.
5. **Schedule the sender.**
   - In Supabase → Database → **Extensions**, enable **pg_cron** and **pg_net**.
   - Then run in the SQL Editor:

   ```sql
   select cron.schedule('push', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://orffhhsogoymalyogfzl.supabase.co/functions/v1/push',
       headers := '{"Authorization": "Bearer ANON-KEY"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     )
   $$);
   ```

   Replace `ANON-KEY` with the project's **legacy anon key**: Project Settings → API Keys → Legacy API keys, the `anon` `public` one. It is a public key, the same kind the app has. The function refuses calls without a key. A player's key also works, but a call only sends sooner what is already queued.
6. **Build and release a new app version** (Android workflow, then Play). Players get server notifications once they have that version and notifications on.
7. **Update Play Console's Data safety** (see [android/play-store.md](android/play-store.md)). Add **Device or other IDs**:
   - collected, not shared;
   - optional (the player turns notifications on);
   - purpose: App functionality.

   This is the notification token. Check Firebase's current [data disclosure for Cloud Messaging](https://firebase.google.com/docs/android/play-data-disclosure) first.

## Checking it

- **Phones registered:**

  ```sql
  select count(*) from ops.push_tokens where token is not null;
  ```

- **The sender's report:** each run answers with `configured`, `sent`, `failed` and `forgotten`. Before step 4 it answers `"configured": false` and the waiting count. The schedule's last answers are in the database:

  ```sql
  select created, status_code, content from net._http_response order by created desc limit 5;
  ```

  Supabase also lists the runs under Edge Functions → push.
- **A test note to yourself:** with notifications on in the new app, between 9:00 and 21:00 your time, run the line below, then close the game and wait up to 5 minutes:

  ```sql
  select ops.push_note((select id from auth.users where email = 'YOUR-EMAIL'), 'cup');
  ```

## Turning it off

- Stop the schedule: `select cron.unschedule('push');`
- Optionally remove the `FCM_SERVICE_ACCOUNT` secret.
- The app keeps working; players simply get no server notifications.

## iPhone

Not yet. iOS needs three more things:

- an Apple Push Notifications key, uploaded to Firebase (an Apple Developer account);
- the Push Notifications capability in the Xcode project;
- the Firebase Messaging SDK in the app, so the phone's token is an FCM token.

Until then the game only uses the phone's own reminders on iOS (`pushSupported()` is Android-only).

The plugin is in the iOS app already, unused. App Store Connect may answer an upload with a "Missing Push Notification Entitlement" warning. It is only a warning, and it goes away once the capability is added.
