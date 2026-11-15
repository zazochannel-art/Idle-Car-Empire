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

## The app's size (15 November 2026)

The Android bundle (AAB) was 16.7 MB; what is in it, and what was done:

- **The game** (`out/`, 11.9 MB, 6.7 MB compressed): terrain tiles 2.2 MB (1.7 MB after the texture pass below), JS 4.5 MB (about 1.3 MB compressed; three.js 0.8 MB of that is the map's;
  the map, the screens and the other languages' texts load on demand), fonts 1.3 MB, the cars' `.glb` 1.1 MB (meshopt),
  map data 1.2 MB, heights 0.9 MB. The rest is the apps' own code (Capacitor, ads, billing, Play Games),
  already shrunk by R8 and `shrinkResources` (`android/app/build.gradle`).
- **Fonts** (`scripts/trim-fonts.mjs`, run by `build-app.mjs`): `next/font/google` writes every
  subset of every weight (Fira Sans had 7 files per weight). Fira is only there for Russian, so the apps
  keep its Cyrillic file and drop the Latin, Latin-extended, Greek, Cyrillic-extended and Vietnamese ones
  (60 files, 814 KB): Barlow draws every Latin letter before Fira is tried, so no page asked for them.
  The website build keeps them (browsers fetch only what the text needs). Barlow's own subsets stay
  (Romanian's ă is in its Vietnamese file), and so do all weights (all are used) and Geist (it draws
  the arrows and symbols Barlow lacks).
- **Launch screens and icons** (`scripts/app-assets.mjs`): Android's splash pictures (Android 7–11)
  and launcher icons are lossless WebP instead of PNG: the same pixels, 45% fewer bytes (`res/` 5.2 → 2.9 MB;
  one phone's density, about 1.5 → 0.8 MB). Android reads WebP from API 18; the minimum here is 24.
- **Left alone**: `world.json`/`heights.bin`
  (their format is the map's), framer-motion (the game's layout animations need its full feature set),
  Supabase's client (one package; realtime and storage can't be left out of `createClient`).
  iOS's launch screen is three identical 1.4 MB PNGs (Xcode wants the three files).

## Texture memory on weak phones (15 November 2026)

What was heavy was not the files but the graphics card's memory: the island's six ground tiles are
2048 px pictures, 21 MB each on the card with their mipmaps, **128 MB** in all. A phone with 4 GB or
less shares that with everything else, and the browser starts swapping textures. Three changes
(`lib/gpu-budget.ts`, `map/world/tiles.ts`, `map/world/engine.ts`; the rules are tested in
`gpu-budget.test.ts`):

- **A texture budget by device.** Low graphics, a device reporting 4 GB of memory or less
  (`navigator.deviceMemory`: 0.25 to 8, rounded down to a power of two, so a 6 GB phone reports 4),
  or a card whose largest texture is under 4096 px takes the ground tiles at 1024 px: **32 MB
  instead of 128 MB**. Browsers that don't tell their memory (Safari, Firefox) are treated as strong, as
  before. The same budget caps the sun's shadow map at 2048 px (a landscape tablet used to get 4096 px,
  64 MB on its own) and the filtering at 4× (it was 8×; the camera never tilts past 53°, which needs 2).
  Strong devices keep what they had.
- **Scaled off the main thread.** The half-size tile is decoded and scaled by the browser
  (`createImageBitmap` with a size) instead of drawing a 2048 px picture onto a canvas on the main
  thread six times while the map opens; where the browser can't (older Safari) the canvas does it, with
  the same result. Low graphics did this before, but only for itself, and on the main thread.
- **Recompressed tiles.** The 12 files (both islands) re-encoded as WebP quality 76, effort 6: **2.0 → 1.5 MB (−24%)**,
  PSNR 39.6–44.8 dB against the old ones (worst single pixel 59 of 255, on edges). It is one extra lossy pass, so it was
  checked side by side at the worst spot.

Checked in headless Chromium (software GL) at 390×844 at 2×, the same views, day, clear weather, three
runs: before (old files), after on a strong device, after with `deviceMemory` 4. Mean difference to
the old picture over the lower 1,400 px of seven views: 0.5–1.3 out of 255 for the recompressed files,
1.0–1.9 for the 1024 px tiles (part of it is traffic and clouds moving between two runs). `docs/graphics/terrain-textures-2026-11-15.jpg` has the three side by side.
The painted ground is already stretched several times over at the zoom a phone plays at (about 20 px
of tile for each map unit, 77 px of screen at the default zoom), and the close-up grain is the
detail texture, which is untouched. Roads, markings and buildings are meshes, not tile pixels.

What this container can't measure: the card's memory and the frame rate (software GL, no GPU). The
gain is by construction (bytes uploaded) and needs a check on a real phone: Chrome's
`chrome://gpu` or Android Studio's GPU profiler on a 3–4 GB phone, map open for a minute.
Changing low graphics while the map is open doesn't swap the tiles until the map is opened again.

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
- **Life on the map**: rain, snow and petals are one draw each, their drops moved by the
  graphics card in a box that wraps round the view (nothing per drop on the main thread);
  snow on the roofs and wet ground are a few lines in the map's shared shader, skipped while
  the weather is dry. Fireworks, sparkles, coins and smoke are two batches of points (glowing
  and solid), hidden when empty. The ships' sea lanes are found once, when the first ship
  sails; the railway is planned beforehand (`rail-line.ts`) and its track is built once and
  frozen. The flow view's arcs are worked out only while it is on. Low graphics draws fewer
  drops and particles.
- **Light and water** (8 November 2026, `map/world/kit.ts`, `terrain.ts`): lit windows at night are
  a few lines in the facade materials' shader (the glass is found by its blue tint in the facade
  texture; which windows glow is a hash of the bay and building, no extra texture); the trees'
  sway is a vertex offset in the leaves' material; the sea reads one small texture (the distance
  from the coast, made once at load) for its turquoise shallows and foam. No extra draw calls, no
  per-frame work on the main thread. Round two: contact shadows round buildings and trees and the
  clouds' drifting shadows are two more reads in the ground's shader (the halos are painted once into a
  small texture at load); the cars' lean and nose-dip are two Euler angles eased per car on each tick;
  brake lights are a colour change; steam is a few puffs a second from the plants' roofs, only when the
  camera is close (fewer on low graphics). Before/after: `docs/graphics/before-after-2026-11-08.jpg`.
- **Absence**: the offline settlement simulates the chain step by step; recipes, unit materials
  and road distances are worked out once, so it runs about a third faster with the same results.
- The battery saver (`docs/battery-saver.md`) lowers frames and ticks further.

## Measuring

- `npx tsx scripts/bench-tick.ts <save.json>`: the cost of one tick, part by part.
- `npx tsx scripts/bench-offline.ts <save.json>`: the settlement of 1, 8 and 20 hours away.
- `npx tsx scripts/bench-offline-steps.ts <save.json> [hours] [steps]`: the same, for other step counts, with what the result does against today's.
- A late-game save: `DUMP=late.json npx tsx scripts/simulate.ts 12`.
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

### Settling an absence (15 November 2026)

What a player waits for when the game opens after being away (`settleOffline`, run before the
game shows). The steps cost most in the walks over the trucks on the road: every plant, on every
step, looked through all of them to see whether a material order was on its way, twice more to
count the free room, and summed its stock through `Object.values().reduce`. Now the chain's tick
lists the plants with an order on the road once per step (`inbound`, passed to `autoRestock`), a
plant looks only when a material is actually low, the room is kept as a number while the plant
orders, and the sums are plain loops. The result is the same to the last digit (the state and
report of 1, 8 and 20 hours away hash identically before and after, as does a live run of 6,000
ticks).

Bundled like the browser, a late-game save (the greedy bot of `scripts/simulate.ts` after 12 h:
13 plants, ~60 trucks on the road), median of repeated runs, best of 5 each:

| | before | after |
| --- | --- | --- |
| 1 h away | ~105 ms | ~75 ms |
| 8 h away | ~600 ms | ~440 ms |
| 20 h away | ~930 ms | ~600 ms |
| One live tick | ~0.30 ms | ~0.28 ms |

A phone is three to five times slower than this container, so the 20 h case fell from roughly
3-4 s to 2-3 s of the loading screen. What is left in it is the chain's own step (the trucks'
walk, `destination`, the ledger): a further cut would have to change what the simulation does, or
how many steps it takes (`STEPS` in `engine/offline.ts`), which would change the results.

### Fewer steps for an absence: tried, not done (15 November 2026)

`STEPS` (20,000 for the whole absence, never less than 1 s a step) is what the rest of the time
goes on, so the obvious cut is fewer steps. It was measured with `scripts/bench-offline-steps.ts`
on three bot saves (2 h, 5 h and 12 h of `scripts/simulate.ts`; `DUMP=<file>` keeps the save) and
the result is that **no step count keeps the settlement within 1-2 % of today's**, because the
result is not a smooth function of the step:

- A truck leaves a plant at most once a step, the dealers' customers and the trucks' arrivals are
  seen at step boundaries, so the step's length rounds a lot of small timings. On the late save
  one hour gives 1,048 cars with a 1 s step and 775 with 1.5 s to 4 s (the plants stand "full",
  waiting for the dealers), and again 1,047 with 5 s. The break moves with the save (3 to 4 s on
  the 2 h save, 1 to 1.5 s on the 5 h one).
- The money moves more than the cars: the part plants' surplus sold on the Parts Market and the
  materials in the warehouses at the end both depend on when the last orders went out.
- Today's settlement already does this: its step is `absence / 20,000` once the absence is over
  about 5.5 h, so 8 h plays with a 1.44 s step, 12 h with 2.16 s and a raised 20 h cap with 3.6 s.
  The late save makes ~1,050 cars an hour for the first hour and ~750 an hour in an 8 h absence,
  and the same 20 h takes 7.4 B with 20,000 steps and 12.3 B with 16,000.

The late save (13 plants), 20,000 steps against fewer, with what the result does (money earned,
cars sold, parts made, material left in the warehouses):

| away | steps | time | money | cars | parts | stock |
| --- | --- | --- | --- | --- | --- | --- |
| 1 h | 20,000 / 12,000 | 210 / 183 ms | same | same | same | same |
| 8 h | 20,000 | 977 ms | 6.07 B | 6,020 | 347,393 | 3.05 M |
| 8 h | 12,000 | 697 ms | -1.7 % | 0.0 % | -2.7 % | -0.1 % |
| 8 h | 8,000 | 540 ms | **-49.4 %** | 0.0 % | **-80.9 %** | +6.5 % |
| 20 h | 20,000 | 1,348 ms | 7.42 B | 14,559 | 160,308 | 3.21 M |
| 20 h | 16,000 | 1,284 ms | **+65.2 %** | 0.0 % | **+282.7 %** | -3.3 % |
| 20 h | 12,000 | 1,149 ms | -0.2 % | 0.0 % | +0.2 % | 0.0 % |
| 72 h (cap 20 h) | 8,000 | 812 ms | -0.1 % | 0.0 % | +0.1 % | -0.4 % |

With 12,000 steps, 30 cases (the three saves, 2 to 12 h away): 12 within 2 %, 18 outside it, up to
-43 % and +128 % in money and ±25 % in cars on the same save and absence. A gain of 15-30 % of the time
would be paid for with results that jump by whole tens of percent depending on the length of the
absence, so the setting stays as it is.

A way to cut the steps for good is to make the step stop mattering (several truck departures and
dealer sales inside one step, the dealers' idle time counted exactly), but then a long absence in
the late game would settle at what the same time played gives (about a third more cars than today)
instead of today's value: a decision about the economy, not about speed.

### Looked at and left alone (15 November 2026)

- A per-step table of what is on the road to each lot (to replace `incoming`'s walk in
  `destination`) was slower: trucks are added almost every step, so the table was rebuilt as often
  as the walk it replaced.
- The first download is 501 KB gzip (1.78 MB parsed): React and Next's client are 470 KB of the
  1.6 MB, `framer-motion` 127 KB (the `layout` animations need its full build), the English texts
  131 KB. The screens, the other languages and three.js already load on demand.
- With the CPU slowed four times, the map idles at about 5-10 % of the main thread; the engine's
  tick is 0.3 ms. What is left on a phone is the GPU's work (draw calls, the shadow pass), which
  only a real device shows: see "The 3D map's draws" above.
- The container's software GL stalls the main thread on the first compile and texture upload, so
  long-task numbers for the map's start-up are not comparable with a phone's.

## Night and UI round (round 3)
- Street-lamp light pools: one additive `InstancedMesh` (one draw call), hidden by day.
- Window glow on model glass (plants, dealers, garages) is a shader term on the shared glass material, no extra lights or draw calls.
- Sea sun glitter is a shader term on the sea material only.
- The UI gloss (buttons, cards, dialogs) is CSS only (gradients and inset shadows).
