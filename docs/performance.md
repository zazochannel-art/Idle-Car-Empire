# Performance

What keeps the game light, and how to measure it.

## The first download

- Only what the first screen needs loads at start. The screens that open on demand (Production,
  Research, Racing, Missions… the garage, the factory floors, the race viewer) load the first
  time they are opened, and in the background a few seconds after the game has started, so
  opening one is still instant (`SCREENS` in `components/game/game.tsx`).
- three.js loads with the 3D map (`map/empire-map.tsx` imports its engine on demand), never in the
  first download: modules the shell needs at start import only types from it (`car-sizes.ts`
  holds the car sizes the 2D map needs; the panel's car thumbnails import three when drawn).
- The ready-made cars (`public/models`) are compressed (meshopt geometry, WebP textures) and
  load after the map.

## While playing

- **Ticks** (10 a second): the state is copied with a plain-data copy (`cloneState`), plant lookups
  count in place, and what was unlocked at the last commit is kept rather than worked out again.
- **React**: the HUD's figures are small components of their own; screens and panels read
  `view` from the store, which the player's actions update at once and the ticks about four
  times a second (`VIEW_MS`); the conflict dialog mounts only when there is a conflict.
- **Frames**: nothing asks for frames while nothing moves. The cash counter shows steady
  income as it comes and glides only on jumps; the minimap checks the camera 20 times a second
  on a timer and redraws only when its picture changes. The map's name tags are drawn once and
  copied; trucks are built once per kind and repainted per copy.
- **The 3D map's draws** (`map/world/kit.ts`): three.js checks a material's shader program again
  whenever the object drawing it needs a different one, so a material is never shared between
  kinds of objects (instanced or not, with instance colours or not): `splitSharedMaterials`
  gives each kind its own copy, and each kind of shadow caster its own depth material (three.js
  draws them all with one). See-through two-sided materials (the cars' glass) draw in one pass
  (`forceSinglePass`); in two, three.js rebuilds their program twice per car per frame. The
  island, its scenery and roads, and the parts of every vehicle keep fixed matrices
  (`freezeStatic`); only what moves is worked out again each frame. The district cards are
  placed again only when the view moves, with every size read before any style is written.
  A vehicle's shadow comes from its big parts only (`shadowFromLargest`): wheels, glass and
  lights cast none, which takes about a third of the draws out of the shadow pass.
- **Absence**: the offline settlement simulates the chain step by step; recipes, unit materials
  and road distances are worked out once, so it runs about a third faster with the same results.
- The battery saver (`docs/battery-saver.md`) lowers frames and ticks further.

## Measuring

- `npx tsx scripts/bench-tick.ts <save.json>`: the cost of one tick, part by part.
- `npx tsx scripts/bench-offline.ts <save.json>`: the settlement of 1, 8 and 20 hours away.
- Bundled like the browser (no module getters):
  `npx esbuild scripts/bench-tick.ts --bundle --platform=node --format=esm --outfile=/tmp/b.mjs && node /tmp/b.mjs <save.json>`.

### The 3D map's draws (24 October 2026)

Production build (`next build --no-mangling`), headless Chrome with the GPU on, a phone profile
(390×844 at 3×, CPU slowed 4×), 15 s on the map. Main-thread CPU per frame:

| | before | after |
| --- | --- | --- |
| Starting map | 14.3 ms | 6.4 ms |
| Late game (8 plants, $11M) | 16.6 ms | 12.1 ms |
| Program checks (`getParameters`) per 16 s | ~1 s | ~0 |

With the vehicles' smaller parts out of the shadow pass, a frame that redraws the shadows went
from 1,119 draw calls to 846 on the late-game map. Measured again with every change in, on a
busier machine (an Android emulator running beside it), the median of three runs: 28.1 ms per
frame before any of this, 22.0 ms after.

What is left is the cost of each draw call, most of them in the shadow pass (about 720 trees and
other scenery cells cast shadows): merging the lots' and the traffic's meshes, or cheaper
shadows for the scenery, would be the next step.

### Measured (October 2026)

Production build, headless Chromium on a phone profile (390×844, CPU slowed 4×, 6 Mbit/s with
80 ms latency); the container has no GPU, so the 3D view is off in these runs. A late-game save.

| | before | after |
| --- | --- | --- |
| JS downloaded before the first screen (gzip) | 705 KB | 437 KB |
| First screen (returning player) | 3.0 s | 2.4 s |
| Map started | 3.6 s | 2.9 s |
| Main thread busy before the first screen | 2.0 s | 1.6 s |
| Main thread busy while playing, map | 39 % | 13 % |
| …with the Missions screen open | 64 % | 26 % |
| …with the Upgrade panel open | 39 % | 17 % |
| One tick (engine, Node, bundled) | 1.22 ms | 0.57 ms |
| Settling 20 h away (Node, bundled) | ~0.98 s | ~0.64 s |
| React renders per second on the map | ~300 | ~60 |
