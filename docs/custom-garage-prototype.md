# Custom Garage prototype

## Added on this branch
- Separate /custom-garage/ route; the existing home route and game navigation are untouched.
- Three.js 3D preview that loads the same production car-model pipeline as the game, with a procedural fallback when assets are unavailable; supports paint, wheel-face style, body-kit overlays and spoiler.
- Validated custom design persisted into the main game save, so it can travel with local/cloud save sync.
- Economy hook: changing paint, body kit, wheels, lowered suspension or spoiler charges in-game cash; changes are rejected when the player cannot afford them.
- JSON import/export for backup and transfer.
- Versioned design saved in the normal game state, so it follows the game's local/cloud save path when cloud sync is configured.
- Legacy `localStorage` fallback at `ice.customGarage.design.v1` plus validated JSON import/export for backup and transfer.
- Save-load migration validates paint, kit, wheels, booleans and text lengths.
- A deterministic prompt-to-options prototype for common colour and tuning requests.

## Limits to be explicit about
The prompt interpreter is keyword matching, not an AI service. It does not generate new mesh geometry from arbitrary language. The displayed car is placeholder geometry, not the game's production GLB model. Saved designs now use the normal game save and cloud-sync path when cloud sync is configured, but they are not yet wired into map traffic, races or assembly economics.

## Safe integration sequence
1. Add named attachment points to production GLB models (bumpers, hood, four fenders, four wheels, spoiler, exhaust).
2. Extend the shared design schema and validator with production asset IDs, attachment compatibility and size budgets when loading saves.
3. Add a vehicle-level custom-build reference to each car when it is commissioned, then render that exact build in showroom, map traffic and race visuals; keep a default fallback for old saves and low-end phones.
4. Add an AI provider only behind a server-side endpoint and secrets on the host. Never ship provider keys to the browser or commit them.
5. Ask AI for structured part briefs or approved asset references, never executable code. Validate generated model format, dimensions, polygon count, textures, attachment compatibility and moderation.
6. Store approved assets in object storage and persist only a stable asset ID/URL plus a validated configuration.
7. The prototype charges cash for cosmetic modifications. Next, tie body kits to material inventory and workshop production time; cosmetic parts should not silently change race performance.

## Verification
Run npm ci, npm run typecheck, npm run lint, npm test and npm run build. Check that /custom-garage/ is exported and test pointer controls on a physical phone. Creating this prototype does not imply these checks have passed.
