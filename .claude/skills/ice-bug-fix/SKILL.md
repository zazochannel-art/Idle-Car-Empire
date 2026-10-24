---
name: ice-bug-fix
description: Use when diagnosing and fixing Idle Car Empire bugs, TypeScript errors, broken UI flows, missing features, save/load issues, or regressions.
---

# Idle Car Empire Bug Fixing

## Required workflow
1. Reproduce the problem or establish a reliable code-level explanation.
2. Inspect `git status --short` and preserve existing user changes.
3. Trace the root cause through callers, state, data, UI, and persistence as applicable.
4. Prefer the smallest safe fix that addresses the root cause.
5. Add or update a regression test when the repository has an appropriate test setup.
6. Run relevant checks and report the results honestly.

## Safety rules
- Do not hide TypeScript errors with `any`, `@ts-ignore`, `@ts-nocheck`, or disabling checks merely to get a green build.
- Do not delete features, reset saves, change schemas, or alter production data to make a symptom disappear.
- Do not change dependencies, secrets, signing settings, or deployment configuration without approval.
- Do not perform commits, pushes, releases, or deployments unless explicitly requested.
- Keep unrelated changes out of the fix.

## For missing UI features
- Check whether the feature exists in source, whether it is imported and rendered, whether route/module registration is correct, and whether visibility conditions hide it.
- Check responsive layouts, z-index/overlays, feature flags, permissions, and runtime errors.
- Follow the action from the visible button through the handler to the resulting state or screen.
- Do not conclude that a feature works merely because its source code exists.

## Final report
Include the root cause, files changed, why the fix works, checks executed, test results, and any remaining uncertainty. Never claim a fix is verified if it was not tested.
