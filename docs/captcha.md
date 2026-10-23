# Robot check (CAPTCHA) and password rules

## Password rules (on now)

A new password needs:

- at least **8 characters**;
- a **letter** and a **digit**;
- not to be one of the passwords everyone tries first ("password1", "qwerty123", "aaaaaaa1"…);
- not to contain the player's email or player name.

Where the rule is checked:

- **In the game:** the create-account forms (welcome page and Profile) and Profile → Set password show the rule under the field, then what is wrong as the player types ([src/lib/password.ts](../src/lib/password.ts)). The button stays off until the password passes.
- **On the site's reset page** ([site/reset-password/](../site/reset-password/)): length, letter and digit.
- **Signing in** takes any password, so older accounts (6 characters were enough before) keep working.

**Your step (free, 1 minute):** make the server hold the length too, for anyone calling the API directly.

1. In Supabase, open Authentication → **Providers** → **Email** (or Authentication → Policies → **Password**, depending on the dashboard version).
2. Set **Minimum password length** to `8`.
3. Leave **Password requirements** on "No required characters". The game asks for a letter and a digit itself, and any alphabet counts there; the server's "letters and digits" option counts only a–z, so it would turn away a Cyrillic password with digits.

**Leaked password protection** (checking passwords against HaveIBeenPwned) is a paid Supabase feature (Pro plan). The game's list of common passwords is the free part of it.

## Robot check (ready, off)

Cloudflare **Turnstile** is free, with no limit on checks. Supabase checks its tokens itself. Once it is on, the server refuses, without a token:

- making an account (the game's first step is a guest account);
- signing in with a password;
- sending a password reset email.

What the game does:

- **The app,** built with the `TURNSTILE_SITE_KEY` repository variable, asks Turnstile for a token before those three calls ([src/lib/captcha.ts](../src/lib/captcha.ts)).
  - The check is invisible unless Cloudflare wants a tap; then a small box shows near the bottom of the screen.
  - A failed check says *The check that you're not a robot didn't pass. Try again.* in the player's language.
- **The dashboard** (`site/admin/`) shows the same check when you sign in. The Pages workflow writes the site key into the page.
- **Without the variable** nothing loads and nothing changes.

### Is it needed?

Not yet, probably. Supabase already limits how many accounts one IP address can make per hour (Authentication → Rate Limits).

Turn the check on if the dashboard shows accounts growing with no play behind them: many new accounts that never come back in the **Revin** tab.

It has a cost: **the live check (`cloud-e2e`) can't make its test players once CAPTCHA is on.** It then stops at the start with a warning ("CAPTCHA is on in Supabase…") instead of checking anything. Keeping it would need a server key in CI to make test players, which this project avoids.

### Turning it on (your steps)

1. **Create the widget.**
   - In Cloudflare (free account): open the dashboard → **Turnstile** → **Add widget**.
   - Widget name: Idle Car Empire.
   - Hostnames:
     - `localhost`: the app's pages are served from `https://localhost` inside the app, on Android and iOS;
     - `zazochannel-art.github.io`: the dashboard.
   - Widget mode: **Managed**.
   - Copy the **site key** (public) and the **secret key** (private).
2. **Give the app and the dashboard the site key.**
   - In GitHub, open the repository → Settings → Secrets and variables → Actions → **Variables**.
   - Add `TURNSTILE_SITE_KEY` with the site key. It is public, so a variable rather than a secret.
   - Then run the **Deploy to GitHub Pages** workflow once (Actions → Deploy to GitHub Pages → Run workflow), so the dashboard gets it.
3. **Build and release a new app version** (Android workflow, then Play; iOS if you publish there). Wait until most players have it.

   A version without the check can't make accounts or sign in once step 4 is done. Players already signed in keep playing; their sessions renew without the check.
4. **Turn it on in Supabase.**
   - Go to Authentication → **Attack Protection** (or Bot and Abuse Protection) → **Enable CAPTCHA protection**.
   - Provider: **Turnstile by Cloudflare**.
   - Secret: the widget's **secret key**. Never put it in the repository or in a chat.
5. **Check it.**
   - On the dashboard, sign in: the check runs first.
   - In the new app, create an account on a test email: it works.
   - An old app version now gets "the check didn't pass" when creating an account.

### Privacy

Turnstile reads signals from the device and browser to tell people from bots. Cloudflare processes them for that purpose only, and the game keeps nothing of them.

- **Privacy policy:** it already mentions the check "in app versions that have one", in all six languages.
- **Play's Data safety:** before releasing the version with the check, read Cloudflare's current [Turnstile privacy addendum](https://www.cloudflare.com/turnstile-privacy-policy/). Declare what it lists as collected, for **Fraud prevention, security, and compliance**, processed ephemerally ([android/play-store.md](android/play-store.md)).

### Turning it off

Switch CAPTCHA off in Supabase. The apps keep asking Turnstile for tokens while the variable is set; the server ignores them. Remove the variable for the next builds.
