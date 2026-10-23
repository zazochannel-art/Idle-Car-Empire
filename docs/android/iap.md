# In-app purchases (Google Play)

The code for two in-app purchases is in the Android app, **switched off**. A
build sells nothing until its two product ids are set (step 4). Until then,
the shop is unchanged, the listing's "No in-app purchases" stays true, and no
Play Console declaration changes.

| Product | Suggested id | Play Console type | What the player gets |
| --- | --- | --- | --- |
| Starter pack 🧰 | `starter_pack` | One-time product | Once per game account: ⭐ 10 Stars, 8 hours of income and 8 hours of research (`IAP` in `src/game/config/iap.ts`). |
| Ad-free rewards 🎟️ | `ad_free_rewards` | One-time product | Every rewarded-ad reward without watching the ad: the same rewards and the same daily limits, only the video is skipped. Kept for good. |

Both are bought once. You choose the prices in Play Console. Nothing sold
for money is random: the mystery box stays an ad-only item, so the game has no
paid loot boxes.

## How it works

- `src/lib/iap.ts`: what the screens see (the products with Google Play's
  price in the player's currency, buying, restoring). It reads the product ids
  from the build: `NEXT_PUBLIC_IAP_STARTER_ID` and `NEXT_PUBLIC_IAP_ADFREE_ID`.
  An id Google Play wouldn't accept is ignored.
- `src/lib/native-iap.ts`: Google Play Billing (plugin
  `@capgo/native-purchases`, Play Billing Library 9). It is loaded only in the
  Android app, and only when the build has a product id.
- `src/game/engine/iap.ts`: what the company owns (`state.iap`, kept in the
  save, in the cloud, and through Reset Imperium).

The order of a purchase:
1. Google Play takes the payment.
2. The game gives the product to the company and saves at once.
3. The game **acknowledges** the purchase.

Google Play refunds any purchase that isn't acknowledged within 3 days. So a
purchase the game could not give (the app closed, no network) is never kept
without being given. At every start and every return to the app, the game asks
Google Play for the account's purchases and gives any it hasn't yet. That
covers:
- a payment that was pending (cash, some bank methods);
- a reinstall;
- a new phone.

*Restore purchases* in the shop does the same on demand.

- **Which account a purchase belongs to.** Each purchase carries a one-way
  hash of the game account id (Google's `obfuscatedAccountId`; no email or
  other personal data). On a phone shared by two game accounts, each one gets
  only its own purchases. A purchase with no account on it (a promo code
  redeemed in the Play Store) goes to whoever opens the game.
- **Given once.** The save keeps a short hash of each purchase token. The same
  purchase seen again is only acknowledged.
- **A second purchase of a product the company already owns** (for example,
  bought at the same time on two phones) is not given and not acknowledged, so
  Google Play refunds it after 3 days.
- **Ad-free rewards** apply wherever the company is played, including the iOS
  app, because they are kept in the account's save.

## What you do (Play Console and GitHub)

These steps need your accounts and payment details, so only you can do them.

1. **Payments profile** (Play Console → *Settings* → *Payments profile*). To
   sell, the developer account needs a merchant profile:
   - your legal name and address;
   - a bank account for payouts;
   - tax information.

   Google may take a few days to verify it.
2. **A build with billing in Play.** Play Console lets you create products only
   after an app bundle with the billing library has been uploaded. Every build
   from this change on has it (the library adds the
   `com.android.vending.BILLING` permission). Upload one to *Internal testing*
   (the `Play publish` workflow, or by hand).
3. **Create the products** (your app → *Monetize with Play* → *Products* →
   *One-time products* → *Create one-time product*):
   - **Product ID**: exactly `starter_pack`. An id can never be changed or used
     again, even after deleting the product.
   - **Name and description**: what the player sees on Google Play's payment
     sheet. For example: "Starter pack: 10 Stars, 8 hours of income and 8
     hours of research".
   - **Purchase option**: *Buy*. Set the price; Play converts it for every
     country.
   - **Activate** the product.
   - Do the same for `ad_free_rewards` ("Ad-free rewards: every ad reward
     without the ad").

   You can use other ids. Step 4 must then use the ids you chose.
4. **Turn it on in the builds.** In GitHub, go to the repository → *Settings* →
   *Secrets and variables* → *Actions* → *Variables*, and add:
   - `IAP_STARTER_ID` = `starter_pack`
   - `IAP_ADFREE_ID` = `ad_free_rewards`

   Product ids are public, so these are variables, not secrets. The next
   builds of `Android` and `Play publish` sell them. To sell only one product,
   set only its variable.
5. **Test without paying** (Play Console → *Settings* → *License testing*).
   Add your Google account. License testers' purchases are free and show a
   "test" payment sheet with test cards ("always approves", "slow test card"
   for a pending payment).
   - Install the app **from the internal testing link** on Google Play. Google
     Play doesn't sell to the test APK from the GitHub release, because that
     APK has another package name (`.debug`). There the Premium section simply
     doesn't appear.
   - Check each of these:
     - buy both products;
     - close the app during a purchase;
     - reinstall and use *Restore purchases*;
     - pay with the slow card;
     - cancel on the payment sheet.
6. **Listing.** Remove the "No in-app purchases" sentence from
   `fastlane/metadata/android/<language>/full_description.txt`, in all six
   languages (the last line of each). Google Play adds "In-app purchases" to
   the listing by itself.
7. **Policy forms** (Policy → App content):
   - **Content rating**: answer *yes* to the question about digital purchases,
     then submit the questionnaire again.
   - **Data safety**: add *Financial info → Purchase history*:
     - collected, not shared;
     - optional (only when buying);
     - purpose *App functionality*.

     The save keeps which products the company owns. Payment details are
     handled by Google Play and never reach the game.
   - **Privacy policy**: already covers it (`site/privacy/`, section *In-app
     purchases*).

## Choices to know about

- **No server check.** The game trusts what Google Play Billing tells the
  app. A modified app could pretend to have bought something. That only
  changes that player's own save, and the leaderboard already limits how fast
  totals can grow (`supabase/migrations/0004`).
  - Verifying each purchase on a server would need a Supabase Edge Function and
    the Google Play Developer API. That API needs a Google Cloud service
    account linked in Play Console (*Setup* → *API access*). It costs nothing,
    but it is your account and your key: say so if you want it.
- **Refunds are not taken back.** If Google refunds a purchase, the game keeps
  what it gave. Taking it back would need the server check above, plus Google's
  *Voided Purchases API*.
- **iOS sells nothing.** The App Store would need its own products and
  agreements in App Store Connect. Products bought on Android still apply in
  the iOS app.
- **Size.** The plugin brings the Play Billing Library and Guava, about 2–3 MB
  more in the app.
