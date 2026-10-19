# Signing the Android app

Google Play uses **Play App Signing**:
- Google keeps the *app signing key* and signs what players download.
- You sign each upload with your own **upload key**.

If the upload key is lost or leaked, Play Console support can reset it. The app
signing key itself never leaves Google.

The upload key and its passwords **never go into the repository**. The
`.gitignore` files ignore `*.jks`, `*.keystore` and `keystore.properties`.

## 1. Create the upload key (once)

You need a JDK for `keytool`; Android Studio includes one.

On Windows, `scripts/make-upload-key.ps1` does steps 1 and 3b in one go: it
creates the key with a random password in `Documents\IdleCarEmpire-upload-key`
(with a note holding the password), then sets the four GitHub secrets, by
GitHub CLI when it's signed in, otherwise one at a time through the clipboard.
Right-click it → *Run with PowerShell*. It never overwrites an existing key.

By hand:

```bash
keytool -genkeypair -v \
  -keystore idle-car-empire-upload.jks \
  -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

`keytool` asks for a password and a name. Use a long password, and the same
one for the store and the key if it asks for both.

## 2. Back it up

Keep `idle-car-empire-upload.jks` and its password in **two places outside
this computer**, for example:
- a password manager (the file as an attachment, plus the password);
- an encrypted USB stick, or encrypted cloud storage.

Never put it in a repository, a chat, or an unencrypted email.

## 3a. Sign on your computer

Create `android/keystore.properties` (ignored by git):

```properties
storeFile=/full/path/to/idle-car-empire-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

Then `cd android && ./gradlew bundleRelease` writes a signed
`app/build/outputs/bundle/release/app-release.aab`. Without the file, Gradle
says *"release builds will be unsigned"*.

## 3b. Sign in GitHub Actions

In the repository: **Settings → Secrets and variables → Actions → New
repository secret**. Add these four:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore as one line of base64. macOS/Linux: `base64 -w0 idle-car-empire-upload.jks` (macOS: `base64 -i idle-car-empire-upload.jks`). Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("idle-car-empire-upload.jks"))` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password |

The Android workflow signs the release bundle on pushes to `main` and on
manual runs, never on pull requests. The log says
`release bundle: SIGNED`.

## 4. First upload

The first time you upload a bundle in Play Console, it offers Play App
Signing. Accept the default (Google generates the app signing key). Your
upload key is registered from that first signed bundle.

## Checking a bundle's signature

```bash
jarsigner -verify -verbose -certs app-release.aab | tail -5    # "jar verified."
keytool -printcert -jarfile app-release.aab                     # the certificate's SHA-256
```

The SHA-256 must match the upload certificate shown in Play Console
(Release → Setup → App signing).
