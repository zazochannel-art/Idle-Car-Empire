# Economy balance — how the money flows, and what changed

The core loop is **materials → plants → components → assembly → car → dealer → sale → cash → reinvestment**.
All numbers live in `src/game/config/economy.ts` and `src/game/config/chain.ts`; the engine only runs them.

## 1. The start, in numbers (Level 1 plants, list prices)

| | Materials | Standard cost (materials + running) | Sells for | After tax / fees | Margin |
|---|---|---|---|---|---|
| Car body (Body Works) | $1,593 | $1,772 | $2,118 (Parts Market) | $1,949 | +10% |
| Engine (Engine Factory) | $1,532 | $1,770 | $2,116 (Parts Market) | $1,947 | +10% |
| Tyres (Tire Factory) | $347 | $466 | $557 | $513 | +10% |
| Tyres bought from the supplier | — | — | costs $629 (+35%) | — | — |
| City car (body + engine + tyres + assembly) | — | $4,374 | $5,900 (dealer) | $5,074 | +$700 own tyres, +$537 bought tyres |

Running a Level 1 Body Works costs $3.97/s (4 workers, power, upkeep); the assembly line $5.61/s.
A Level 1 Body Works makes 1.33 bodies a minute — about $300/min of profit selling them.

The company starts with **$10,000** and a **Body Works already built**, with material for 3 bodies.
That is enough for about six more bodies' worth of steel and plastic: the first decisions are what to
buy, when to upgrade, and saving $6,000 for the Engine Factory (opens after 12 bodies). The first car
needs the Engine Factory, the Assembly Plant ($6,000 for the first) and tyres (bought, until the
$15,000 Tire Factory). The first sale opens the Local Dealer.

## 2. What changed — OLD → NEW → WHY

| Value | OLD | NEW | WHY |
|---|---|---|---|
| Plant level price (`UPGRADE_SCALING.level.base`) | 0.15 × plant cost | **0.30** × plant cost | Level 2 doubles a plant's output. At $1,200 for the Body Works it paid for itself in ~5 minutes, so levels were bought in a stream and the economy ran away. At $2,400 it is a real decision (~10 min of profit). |
| Speed upgrade price (`UPGRADE_SCALING.speed.base`) | 0.06 × plant cost | **0.08** × plant cost | Same reason, smaller step: +6% speed for $640 instead of $480 on the Body Works. |
| Bought-in finished parts (`OUTSOURCE.markup`) | +8%, instant, on account | **+35%**, paid on order, delivered by truck | Buying parts made the company's own plants optional. Now it is the expensive, slow way; a plant pays for itself. |
| Backup parts when own plants stop | automatic, +8% | **off unless switched on**, +50% (`OUTSOURCE.emergency`) | An automatic bypass of the plants. |
| Rescue when stuck (`RESCUE`) | free material + **all debt written off** | material at **+50%** on the account (`RESCUE.markup`), nothing written off, within twice the account's limit | Free material and forgiven debt could be farmed. |
| Company account (`DEBT`) | unlimited, all cash repaid it first | limit = 5 min of running costs (min $10,000); over it plants are **SUSPENDED**; repaid out of profit (50% of the average net income) | "Virtual money" without limit; repaying from all cash starved the company of money for materials. |
| Start cash (`START_CASH`) | $10,000 | $10,000 (unchanged) | Measured: with the starter Body Works it buys ~6 bodies of material — tight enough. The slower upgrades are what slow the start. |
| Car wholesale (`WHOLESALE`) | 0.7 | 0.7 (unchanged) | Only cars already on their way to the market in old saves use it; new cars wait for a dealer. |

## 3. Measured effect (goal-following bot, `npx tsx scripts/goal-bot.ts 8 q|full`)

| | Before | After |
|---|---|---|
| First car | 24 min | see the PR report |
| Money earned in 6–8 h (quiet bot) | $28M in 6 h | see the PR report |
| First Global Expansion (full bot) | 4 h 36 min | see the PR report |
| Highest debt in a run | $28.7K, unlimited | bounded by the account's limits |

## 4. The rules that keep money honest

- **Materials are paid when ordered.** Nothing is ever produced from material that wasn't bought
  (or delivered by the emergency supplier, at its price, on the account).
- **Each material keeps its own cost** in the warehouse (weighted average); using it books exactly that.
- **Every dollar is booked once** in the ledger, under one key: manufacturing revenue/costs, side
  businesses (garages, racing), and rewards below the line. HUD profit = dashboard net = stats.
- **Running costs on account** only up to the limit; suspended plants resume when the account is paid
  down (or the cash covers it).
- **Offline** runs the very same simulation (at the offline efficiency): it cannot create material,
  parts or cars that the online game couldn't.
