# Idle Car Empire

An idle / tycoon city-builder about an automotive supply chain. You start with
one **Small Car Body Works** and grow it into a global car empire: body works,
engine, interior, glass, tyre and paint factories feed a **Car Assembly
Plant**, car transporters take the finished cars to your dealerships, and
customers drive them home. Every dollar comes from that chain, and every link of
it is visible on the isometric **Empire Map**: trucks drive real routes between
the plants, the Materials Depot and the Parts Market. The map is an island with
a river and eight districts to unlock. It has day and night lighting, plants
that grow from Small to Mega Factory, and a live factory-floor view.

Built with Next.js (App Router, static export), TypeScript, Tailwind CSS v4,
shadcn/ui-style components, Lucide icons, Framer Motion and Zustand. Saves go
to `localStorage`, with optional Supabase cloud saves.

**Play:** https://zazochannel-art.github.io/Idle-Car-Empire/

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in out/
npm test           # engine unit tests (vitest)
npm run lint && npm run typecheck
npm run simulate -- 3   # balance bot: plays 3 hours and logs milestones
```

## How to play

1. **Car bodies.** You start with $250 and a Small Car Body Works that turns
   steel into a car body every 20 s. A truck takes the bodies to the **Parts
   Market** ($150 each). When the steel runs low, a supply truck brings more
   from the **Materials Depot**, paid when it leaves. With no cash for steel,
   production stops.
2. **Upgrade the plant.** Each plant has four upgrades:
   - **Levels** (Small → Basic → Industrial → … → Mega Factory) add
     production lines, storage and trucks, and change the building.
   - **Speed** shortens each batch.
   - **Automation** (Manual → AI Factory) raises speed and offline output.
   - **Grades** (Standard → Lightweight → … → Carbon) raise the value of
     each part and unlock better cars.
3. **Engines and the first choice.** After 25 bodies the Engine Factory
   ($3K) unlocks. Until you have an assembly plant it can sell engines, or
   fit each engine into a body and sell **motorized chassis** (+30% value,
   but it stops when bodies run out); the panel recommends one from your
   body and engine output.
4. **Your first car needs three parts.** Build the Engine Factory ($3K), the
   Tyre Factory ($60K) and the **Car Assembly Plant** ($600K), on any plot in
   an unlocked district. Industrial lots (a whole block) double a plant's
   output and storage. Deliveries are automatic: parts go to the assembly
   plant when it needs them, and the rest is sold at the market.
5. **Assemble cars.** The assembly line has nine stations: body, engine,
   suspension, interior, glass, wheels, paint, final assembly and quality
   control. When a part is missing, the line stops (⚠️ NOT ENOUGH ENGINES).
   Your first car gets its own celebration and opens the **Local Dealer** for
   free.
6. **Sell them, then build better cars.** Car transporters fill the showroom,
   customers come in and drive off in your cars. Each better model needs one
   more plant and better grades: City Car (body, engine, tyres) → Sedan
   (+ Interior and Suspension factories) → SUV (+ Glass) → Sports Car (+ Paint) → Luxury Sedan,
   Performance SUV, Supercar and Hypercar (+ Electronics) → Electric
   Performance (+ Battery Factory). More dealerships add customers and markup.
7. **Grow the empire.** You can also:
   - unlock districts for more plots;
   - hire **managers** (one per plant);
   - **research** with points from every part and car;
   - follow the objectives (Produce 100 car bodies → Build your second
     factory → … → Build your automotive empire);
   - run **Global Expansion** after $10B for permanent **Empire Points**.
   - Garages, car washes and other city buildings are a side business.

Drag to pan, pinch or scroll to zoom, tap buildings; the minimap jumps the
camera. Coming back after a while shows **Welcome Back!** with the time away,
the parts and cars made while you were away, the units delivered and the money earned (capped at 12h; research and perks extend the cap).

## Code layout

```
src/game/
  config/     all economy numbers — chain.ts (parts, plants, levels,
              automation, grades, trucks), cars (models and recipes), managers,
              dealerships, research, achievements, missions, prestige, and
              city.ts (districts + layouts, plot buildings, garage facilities,
              levels, specializations)
  city/       layout.ts — world geometry from WORLD_BLOCKS (config/city.ts):
              districts, scenery, roads, river, plots, lots
  engine/     pure game logic, no React
    state.ts      initial state
    modifiers.ts  aggregates research / managers / perks / achievements
    chain.ts      the supply chain: production, raw material, stock, trucks
                  (shipments with routes and travel times), market, assembly,
                  dealers and customers, offline simulation, plant upgrades
    economy.ts    costs and the income snapshot
    tick.ts       advances time in small steps
    actions.ts    player actions (buy, hire, research…)
    offline.ts    plays out the time away, report + collect
    prestige.ts   Empire Points, Global Expansion
    progress.ts   achievements, daily & milestone missions
    insights.ts   "next goal" hints and lock reasons for the UI
    city.ts       districts, plot buildings, garages: placement rules,
                  workers, power, specializations, income, save migration
  save/       SaveAdapter interface, localStorage + Supabase adapters, migration
  format.ts   $1,250 · $25.4K · $3.2M · $4.7B · $2.8T
src/store/    Zustand stores: game loop + autosave (game-store), panels and
              camera requests (ui-store), UI events
src/components/
  map/        the Empire Map on a canvas: isometric painter, camera (pan,
              zoom, inertia, fly-to), terrain (coastline), scene of
              buildings and scenery, plants, props, vehicle models,
              lighting (time of day), traffic and shipments, ships, minimap
  three/      the 3D models (Three.js, loaded lazily): cars, trucks and
              transporters (car-models), plant buildings (building-models),
              factory machines and robots (industrial-models), and the sprite
              factory that renders them into isometric sprites (sprites.ts)
  garage/     garage interior: room + facility drawing, placement ghost
  plant/      the factory floor: a live production line inside each plant
  panels/     sheets over the map: build menu, plant/market/depot/dealer
              panels, zone info, lists
  ui/         shadcn-style primitives
  game/       shell, HUD, goals, first-car celebration, dialogs, toasts
  views/      supply chain, dealers, research, cars, managers, missions…
```

### 3D graphics

The map stays a fast 2D canvas, but cars, trucks, car transporters, plant
buildings and factory machines are real 3D models. `three/sprites.ts` renders
each model once, with an orthographic camera locked to the map's projection
(30° elevation, 45° yaw), PBR materials (clear-coat paint, glass, rubber,
metal), an environment map, a soft-shadowed sun and a contact shadow, and
caches the result as a sprite:

- vehicles in 16 headings, with steered front wheels and wheel-spin phases
  when they are large on screen; headlights and tail lights glow at night;
- resolution follows the zoom (2×/4×/6× sprites), at most ~7 ms of rendering
  per frame, a 96 MB cache that forgets the oldest sprites;
- until a sprite is ready, or where WebGL is missing, the vector drawings
  are used, so the game never waits on the GPU.

Tap a car or truck on the map to open the showroom: the camera follows it
close up and the card shows the same model live on a turntable, with its
build level and installed components. On the assembly line the car gains
its engine, seats, glass, wheels, paint and lights station by station.

The UI never contains economy numbers; tune the game in `src/game/config/` and
check the pacing with `npm run simulate`.

## Deploy

Every push to `main` builds the static site and publishes it to GitHub Pages
(`.github/workflows/pages.yml`). In the repository settings, **Pages → Build
and deployment → Source** must be set to **GitHub Actions**.

## Cloud saves (optional)

1. Create a Supabase project, run `supabase/migrations/0001_game_saves.sql`
   and enable **Anonymous sign-ins** under Auth.
2. Copy `.env.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

With those set, saves are mirrored to the `game_saves` table (Row Level
Security limits each player to their own row) and the newer of the local and
cloud copies is loaded on start. Without them the game is local-only.
