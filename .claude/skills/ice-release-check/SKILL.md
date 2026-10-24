---
name: ice-release-check
description: Use when preparing or troubleshooting an Idle Car Empire web build, Capacitor Android project, signed Android App Bundle, versioning, or Google Play release.
---

# Idle Car Empire Release Check

## Inspect first
- Read `package.json`, Capacitor configuration, Android project files, build scripts, and version-management files before recommending commands.
- Determine the real web output directory and the repository's supported Android build workflow. Do not assume `out`, `dist`, or a particular npm script without checking.
- Check `git status --short` and preserve uncommitted changes.

## Pre-release checklist
- Run the project's existing typecheck, lint, tests, and web build when available.
- Verify that the expected shop, login, save/load, navigation, and other critical screens are included in the built web output.
- Check the Capacitor app ID against the intended Google Play package name; do not change it without approval.
- Inspect versionCode/versionName sources and explain how to increment them. Never reuse a versionCode already uploaded to Google Play.
- Confirm the correct Android entry activity and build configuration if the project reports "Default Activity not found".
- Check signing configuration without printing or exposing passwords, keystore contents, tokens, or other secrets.
- Explain how to generate and locate the signed AAB using the repository's actual Gradle/Android Studio setup.
- Flag relevant Google Play policy or dependency warnings for review; do not claim Play Console acceptance is guaranteed.

## Safety
- Never publish, upload, promote, or deploy a release without explicit approval.
- Never create, overwrite, or expose signing keys or credentials.
- Do not upgrade Gradle, Android Gradle Plugin, Java, Capacitor, or billing libraries blindly. Check compatibility first.
- Do not remove Android project files or regenerate the native project without understanding local changes.

## Final report
Provide a pass/fail checklist, commands actually run, exact artifact location if verified, and remaining manual Google Play steps. Distinguish a locally successful build from Play Console acceptance.
