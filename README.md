# Idle Car Empire

An idle / tycoon city-builder about growing a one-bay garage into a global car
empire. The game is played on an isometric **Empire Map**: eight districts to
unlock, plots to build on, garages with their own interiors, factories and
dealerships on their lots, and live traffic carrying parts, customers and new
cars between them. Plus eight car classes from the City Compact to the Future
Car, research, managers, offline production and Global Expansion (prestige).

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

1. Build your first City Compact by hand in the **Assembly Workshop** ($50).
2. Tap **Garage #01** on the map and enter it. Its floor is a tile grid: build a
   **Service Bay** (pick it, place it, rotate it, confirm). Each workstation
   needs a mechanic (**Workers**); support facilities (storage, office, parts
   workshop) boost the whole garage. Garage levels 1–10 enlarge the floor
   (8×8 → 24×20), unlock new facilities (paint booth, engine workshop, dyno,
   supercar workshop…) and grow the building on the map. A **specialization**
   (repair, painting, tuning, performance, supercar) doubles matching stations.
3. Tap a **+** plot to build: more garages, car washes, parking, warehouses,
   parts factories, logistics centres, R&D, export terminals, HQ, airport.
   Support buildings are one per district.
4. **Unlock districts** (Small Town → Industrial → Downtown → Automotive →
   Luxury → Supercar Valley → Mega City → Global Empire). Each one has plots,
   factory and dealership lots, and richer customers.
5. Spend on factory **levels** (cheap, frequent; ×2 speed at levels 25, 50, 75…) and the
   six **upgrades**: Production, Quality, Automation, Marketing, Logistics and
   Technology (which unlocks the next car tier in that factory).
6. Hire **Mike** ($300) or buy Automation to make the workshop run by itself.
   Garages and automated factories also earn while the game is closed.
7. Open new **factories**, **dealerships** (they sell your cars; overflow goes to
   wholesale at 50%), **research** (paid in research points from every car) and
   **managers** (one per factory; they automate it and add a bonus).
8. After earning $1B in a run, **Global Expansion** resets the run for
   permanent **Empire Points** (+2% income each, plus perks at 1, 5, 15, 40…).

Drag to pan, pinch or scroll to zoom, tap buildings; the minimap jumps the
camera. Coming back after a while shows **Welcome Back!** with the time away,
cars built and serviced, and money earned (capped at 12h; research and perks extend the cap).

## Code layout

```
src/game/
  config/     all economy numbers — cars, factories, upgrades, managers,
              dealerships, research, achievements, missions, prestige, and
              city.ts (districts + layouts, plot buildings, garage facilities,
              levels, specializations)
  city/       layout.ts — world geometry: roads, blocks, plots, lots
  engine/     pure game logic, no React
    state.ts      initial state
    modifiers.ts  aggregates research / managers / perks / achievements
    economy.ts    costs, factory stats, dealer allocation, income snapshot
    tick.ts       advances time (handles any dt analytically)
    actions.ts    player actions (buy, hire, research…)
    offline.ts    offline report + collect
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
              zoom, inertia, fly-to), scene of buildings, traffic, minimap
  garage/     garage interior: room + facility drawing, placement ghost
  panels/     sheets over the map: build menu, plot/zone info, lists
  ui/         shadcn-style primitives
  game/       shell, HUD, factory cards, dialogs, toasts
  views/      factories, dealers, research, cars, managers, missions…
```

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
