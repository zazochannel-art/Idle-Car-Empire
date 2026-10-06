# Idle Car Empire

An idle / tycoon city-builder about an automotive supply chain. You start with
one **Small Car Body Works** and grow it into a global car empire: body works,
engine, interior, glass, tyre and paint factories feed a **Car Assembly
Plant**, car transporters take the finished cars to your dealerships, and
customers drive them home. Every dollar comes from that chain, and every link of
it is visible on the 3D **Empire Map**: trucks drive the real roads between
the plants, the Materials Depot and the Parts Market. The map is an island
city with five more islands round it, joined by bridges: eight districts and
eight territories to unlock, each a real part of the map (a downtown of
towers, a Speedway, a red canyon, mountains, a port, an airport…). It has day
and night lighting, plants that grow from Small to Mega Factory, and a live
factory-floor view. It is made for phones first.

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

1. **Car bodies.** You start with $10,000 and a Small Car Body Works with
   steel and plastic for three bodies. Buy more material at the **Materials
   Depot** (paid when you order it; a truck brings it) — each material keeps
   its own cost in the warehouse, and using it books exactly that. A truck
   takes the bodies to the **Parts Market**, which pays full price up to its
   appetite and less when you flood it. No material, no bodies.
2. **Upgrade the plant.** Each plant has four upgrades:
   - **Levels** (Small → Basic → Industrial → … → Mega Factory) add
     production lines, storage and trucks, and change the building.
   - **Speed** shortens each batch.
   - **Automation** (Manual → AI Factory) raises speed and offline output.
   - **Grades** (Standard → Lightweight → … → Carbon) raise the value of
     each part and unlock better cars.
3. **Engines and the first choice.** After 12 bodies the Engine Factory
   ($6K) unlocks. Until you have an assembly plant it can sell engines, or
   fit each engine into a body and sell **motorized chassis**; the panel
   recommends one from your body and engine output.
4. **Your first car needs three parts.** Build the **Car Assembly Plant**
   ($6K for the first) on any plot in an unlocked district. Bodies and
   engines always come from your own plants. Tyres come from an outside
   supplier until you build the Tire Factory ($15K): +35% over what they cost
   to make, paid when ordered, brought by truck. Deliveries are automatic:
   parts go to the assembly plant when it needs them, and the rest is sold at
   the market. Industrial lots (a whole block) double a plant's output and
   storage.
   - **The company account.** Wages, energy and upkeep the cash can't cover go
     on the account (never materials), up to about five minutes of running
     costs. Over the limit every plant is **suspended** until the account is
     paid down; it is paid out of profit. A company that is completely stuck
     gets material from the **emergency supplier** at +50%, on the account.
5. **Assemble cars.** The assembly line has nine stations: body, engine,
   suspension, interior, glass, wheels, paint, final assembly and quality
   control. When a part is missing, the line stops (⚠️ NOT ENOUGH ENGINES).
   Your first car gets its own celebration and opens the **Local Dealer** for
   free.
6. **Design your models.** Every platform carries your own model (MC-01,
   MC Sport, MC GT…) with a class (Economy → Hypercar), a body type, power,
   comfort, quality and design. In **Models & Design** you rename it, pick
   its colour (the cars on the map follow it) and develop its engine,
   interior, rims and paint: each level adds value and a little build time.
7. **Sell them, then build better cars.** Car transporters fill the showroom,
   customers come in and drive off in your cars. Each better model needs one
   more plant and better grades: City Car (body, engine, tyres) → Sedan
   (+ Interior and Suspension factories) → SUV (+ Glass) → Sports Car (+ Paint) → Luxury Coupe,
   Tuner GT, Supercar and Hypercar (+ Electronics) → Electric
   Performance (+ Battery Factory). More dealerships add customers and markup. Each dealer specialises in
   car classes (Economy, Sport, Premium, Luxury, Supercar/Hypercar, Global
   takes all): its speciality sells for +20% and 1.5× faster, so transporters
   take every model to the dealer that pays most for it.
8. **Logistics.** The Logistics Center upgrades every truck, dock and
   warehouse at once (speed, load, loading time, storage, extra trucks) and
   climbs the transport ladder Trucks → Rail → Port → Export: faster, bigger
   loads, then higher prices abroad for parts and cars.
9. **Grow the empire.** You can also:
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
  map/        the Empire Map: empire-map.tsx (React side, cards over the
              districts), minimap, showcase; world/ is the 3D map (Three.js,
              loaded on demand): terrain and sea (terrain.ts), the island's
              buildings, trees, bridges and landmarks (scenery.ts), the
              player's lots (plots.ts, structures.ts), traffic and
              shipments (traffic.ts), race cars (race.ts), labels, and the
              engine with its camera and picking (engine.ts). iso.ts,
              camera.ts, props.ts and vehicles.ts are the 2D painter still
              used by the garage interior, the factory floor and the race
              viewer
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

### The island map

The world lives in `public/world/` (heights, six ground textures, the
buildings, trees and roads of the island, the areas of the districts and a
minimap picture) and in `src/game/city/world-data.json` (the road graph and
the lots, read by the game engine too). Both are generated from the map's
sources by the map pipeline; delivery times follow the real roads
(`roadRoute` in `src/game/city/layout.ts`), so a truck on the map always
drives the route the engine timed.

The camera pans, pinches, twists (two fingers or right-drag) and flies; far
out it looks straight down on the whole archipelago, close in it tilts over
the streets. Locked districts and territories fade into a grey haze. On
phones the map keeps to a few hundred draw calls; the battery-saver setting
turns off shadows, halves the traffic and the ground textures, and draws at
30 FPS.

### 3D graphics

Cars, trucks, car transporters, plant buildings and factory machines are real
3D models. On the map they are baked into a few meshes each and shared by
every lot with the same look. For the 2D views, `three/sprites.ts` renders
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
