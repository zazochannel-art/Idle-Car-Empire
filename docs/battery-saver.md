# Battery saver and checks on real phones

An idle game is often left open for hours. The battery saver makes the game
draw and update less often without changing what it earns: the simulation
works from real elapsed time, so fewer ticks and frames lose nothing.

## How it works for a player

Settings → **Battery saver**: **Auto** (default), **On** or **Off**.

- **Auto** turns it on when the browser reports the battery at 20% or less
  and not charging, and off again when the phone is plugged in. A toast says
  when it turns on. Browsers that don't report the battery (Safari on iPhone,
  Firefox) never turn it on by themselves: the player can choose **On**.
- **On**: the 3D views (map, factory floors, garage) draw at most 30 frames a
  second, and 6 a second after 20 s without a touch, click, key or wheel. The
  game ticks every 250 ms instead of 100 ms, and every second while idle. The
  map also stops raising its resolution above 1.5× and stops its automatic
  quality changes, so a slow frame doesn't change the picture.
- **Off**: full speed, whatever the battery.

Settings shows whether it saves right now, and the battery level when known.

Code: `src/lib/power.ts` (the rules, the battery and the idle timer), the
render loops in `map/world/engine.ts`, `plant/interior/interior-engine.ts`,
`plant/floor-engine.ts`, `garage/garage-engine.ts`, and `runTick` in
`store/game-store.ts`.

## Measured in the container (no GPU)

Headless Chromium with software GL, the dev build, a late-game save; the
WebGL draw call skipped (one frame takes seconds there), so this counts the
loops, the traffic, the labels and React, not the GPU. Phone: 390×844 with
the CPU slowed 4×. The frame rate with the saver off is capped by the
container, not the game.

| | frames/s | ticks/s | main thread busy |
| --- | --- | --- | --- |
| Desktop, off, playing | 10.6 | 9.8 | 24% |
| Desktop, on, playing | 12.7 | 3.3 | 14% |
| Desktop, off, idle | 9.7 | 10 | 22% |
| Desktop, on, idle | 5.9 | 1 | 8% |
| Phone, off, playing | 13.4 | 6.5 | 110% |
| Phone, on, playing | 15.2 | 3.1 | 76% |
| Phone, off, idle | 11.5 | 6.9 | 92% |
| Phone, on, idle | 5.4 | 1 | 41% |

## Checks on real phones (to do by hand)

The container has no phone and no GPU, so these need real devices: an older
Android (Chrome), a recent Android, an iPhone (Safari), and the installed app
(PWA) on one of them.

1. Start a game and play 5 minutes: the map scrolls and zooms smoothly, taps
   open the right panels, nothing is cut off at the edges.
2. Settings → Battery saver → **On**, then leave the phone untouched for a
   minute: the map keeps moving (slower), money keeps coming at the same
   rate as with **Off** (compare the income per second).
3. Touch the screen: it is smooth again at once.
4. Android, battery under 20% and unplugged, **Auto**: the toast appears and
   Settings says "Saving now · battery N%". Plug it in: "Not saving now".
5. Leave the game open for an hour on **On** and on **Off** (same
   brightness, same start level) and note the battery used and how warm the
   phone gets.
6. Open a factory floor and the garage with the saver on: they draw and
   react to taps.
7. Switch to another app and back after 10 minutes: the offline report shows
   and the game continues.
