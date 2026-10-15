# Custom Garage prototype

## Added on this branch
- Separate /custom-garage/ route; the existing home route and game navigation are untouched.
- Three.js procedural 3D hatchback preview with drag-to-rotate, paint, wheel style, body kit, ride height and spoiler controls.
- Versioned localStorage save at `ice.customGarage.design.v1`.
- Validated JSON import/export to back up or transfer a design between devices.
- A deterministic prompt-to-options prototype for common colour and tuning requests.

## Limits to be explicit about
The prompt interpreter is keyword matching, not an AI service. It does not generate new mesh geometry from arbitrary language. The displayed car is placeholder geometry, not the game's production GLB model. Saved designs are not wired into map traffic, races, cloud saves or assembly economics yet.

## Safe integration sequence
1. Add named attachment points to production GLB models (bumpers, hood, four fenders, four wheels, spoiler, exhaust).
2. Move the versioned Design type and validator into a shared game module; validate enums, colours, asset IDs and size budgets when loading saves.
3. Render the same validated design in showroom, map traffic and race vehicles, with a default fallback for old saves and low-end phones.
4. Add an AI provider only behind a server-side endpoint and secrets on the host. Never ship provider keys to the browser or commit them.
5. Ask AI for structured part briefs or approved asset references, never executable code. Validate generated model format, dimensions, polygon count, textures, attachment compatibility and moderation.
6. Store approved assets in object storage and persist only a stable asset ID/URL plus a validated configuration.
7. Add economy hooks for build cost, production time and materials. Cosmetic parts should not silently change race performance.

## Verification
Run npm ci, npm run typecheck, npm run lint, npm test and npm run build. Check that /custom-garage/ is exported and test pointer controls on a physical phone. Creating this prototype does not imply these checks have passed.
