---
name: ice-game-dev
description: Use when developing or modifying Idle Car Empire gameplay, factories, production chains, economy, vehicles, garage, racing, map systems, missions, or game progression.
---

# Idle Car Empire Game Development

## Before changing code
- Inspect `package.json`, the relevant source files, and existing architecture before proposing an implementation.
- Identify the actual framework, rendering engine, state management, persistence model, and existing reusable components. Never assume a library is installed.
- Check `git status --short` and preserve all pre-existing user changes.
- Trace the full feature flow from UI to state/data updates and persistence before editing.

## Game design constraints
- Keep Idle Car Empire an automotive empire simulator, not a generic city-builder.
- Preserve the existing isometric presentation and realistic automotive direction.
- Favor incremental changes that fit current architecture over rewrites or duplicate systems.
- Keep factory production, component supply, car assembly, garage customization, and racing progression consistent with one another.
- Balance income, costs, upgrades, timers, rewards, and progression; do not introduce runaway money generation.
- Keep controls and navigation purposeful: a button should open or execute the feature it represents.
- Optimize performance for mobile devices without casually lowering visual quality.

## Implementation rules
- Reuse existing types, components, utilities, and game systems where possible.
- Keep TypeScript types accurate; do not silence errors with `any`, non-null assertions, or broad compiler suppression unless there is a justified, documented reason.
- Handle loading, empty, error, and locked states where relevant.
- Ensure new player-facing text fits the project's existing localization conventions.
- Do not introduce new dependencies unless necessary and explicitly approved.
- Do not remove or replace existing features without the user's approval.

## Verification
- Run the relevant existing checks discovered in `package.json`.
- At minimum, run `npm run typecheck` if that script exists, and the appropriate build/test scripts when practical.
- Report exactly what was changed, which commands were run, their results, and remaining risks.
- Never claim a check passed unless it actually ran successfully.
