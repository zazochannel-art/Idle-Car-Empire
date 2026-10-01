# Idle Car Empire

An idle / tycoon game about growing a one-car garage in Bucharest into a global
car empire: factories on every continent, eight car classes from the City
Compact to the Future Car, research, managers, dealerships, offline production
and Global Expansion (prestige).

Built with Next.js (App Router, static export), TypeScript, Tailwind CSS v4,
shadcn/ui-style components, Lucide icons, Framer Motion and Zustand. Saves go
to `localStorage`, with optional Supabase cloud saves.

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

1. Tap **BUILD** on the Small Garage. A City Compact takes 10s and earns $50.
   Tap the scene to rush it.
2. Spend on **levels** (cheap, frequent; ×2 speed at levels 25, 50, 75…) and the
   six **upgrades**: Production, Quality, Automation, Marketing, Logistics and
   Technology (which unlocks the next car tier in that factory).
3. Hire **Mike** ($300) or buy Automation to make the garage run by itself.
   Automated factories also produce while the game is closed.
4. Open new **factories**, **dealerships** (they sell your cars; overflow goes to
   wholesale at 50%), **research** (paid in research points from every car) and
   **managers** (one per factory; they automate it and add a bonus).
5. After earning $1B in a run, **Global Expansion** resets the run for
   permanent **Empire Points** (+2% income each, plus perks at 1, 5, 15, 40…).

Coming back after a while shows **Welcome Back!** with the time away, cars
built and money earned (capped at 12h; research and perks extend the cap).

## Code layout

```
src/game/
  config/     all economy numbers — cars, factories, upgrades, managers,
              dealerships, research, achievements, missions, prestige
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
  save/       SaveAdapter interface, localStorage + Supabase adapters, migration
  format.ts   $1,250 · $25.4K · $3.2M · $4.7B · $2.8T
src/store/    Zustand store: game loop, autosave, UI events
src/components/
  ui/         shadcn-style primitives
  game/       HUD, animated factory scene, factory cards, dialogs, toasts
  views/      one screen per section
```

The UI never contains economy numbers; tune the game in `src/game/config/` and
check the pacing with `npm run simulate`.

## Cloud saves (optional)

1. Create a Supabase project, run `supabase/migrations/0001_game_saves.sql`
   and enable **Anonymous sign-ins** under Auth.
2. Copy `.env.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

With those set, saves are mirrored to the `game_saves` table (Row Level
Security limits each player to their own row) and the newer of the local and
cloud copies is loaded on start. Without them the game is local-only.
