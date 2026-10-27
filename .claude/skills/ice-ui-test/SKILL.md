---
name: ice-ui-test
description: Use when checking Idle Car Empire UI behavior, navigation, shop visibility, buttons, responsive layouts, authentication, persistence, or browser regressions.
---

# Idle Car Empire UI Testing

## Test approach
- Inspect the actual app framework, available test scripts, routes/modules, and UI architecture first.
- Use existing test tools where possible. If Playwright or another browser-testing dependency is absent, explain the smallest safe setup and request approval before installing packages.
- Start the app using a script verified in `package.json`; do not invent a start command.
- Test desktop and mobile-sized layouts where practical.

## Critical game flows
- Main menu and module navigation.
- Shop/store visibility, opening, closing, item purchase, currency updates, and unavailable/locked states.
- Factory and production interactions.
- Garage and vehicle customization entry points.
- Racing entry points and reward handling.
- Login/logout and save/load flows, if implemented.
- First-time tutorial and missions, if present.

## How to investigate a missing shop
1. Search for shop components, routes, labels, and module registration.
2. Confirm the component is imported and rendered by the active screen.
3. Inspect visibility conditions, feature flags, state, permissions, responsive styles, overlays, and z-index.
4. Follow button handlers and check console/runtime errors.
5. Compare source behavior with the actual running app and built output when available.
6. Report the most likely cause with evidence; do not edit unrelated code.

## Assertions and reporting
- Check that visible controls trigger the expected action and that state changes are reflected in the UI.
- Check browser console errors and failed requests when the chosen test tooling supports it.
- Do not fabricate test results or say a flow passed when it was not exercised.
- Avoid destructive purchases, production account changes, or clearing real user saves. Use test data.
- Report test steps, expected and observed outcomes, failures, screenshots/artifacts if available, and limitations.
