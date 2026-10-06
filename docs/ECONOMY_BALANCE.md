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
| Bought-in finished parts (`OUTSOURCE.markup`) | +8%, instant, on account | **+35%**, paid on order, delivered by truck; with no cash, credit for the next batch only, within the account's limit | Buying parts made the company's own plants optional. Now it is the expensive, slow way; a plant pays for itself. Only tyres and drivetrain parts can be bought (design: the first cars and the Sedan line don't wait on those plants); bodies and engines never. |
| Backup parts when own plants stop | automatic, +8% | **off unless switched on** per assembly plant, +50% (`OUTSOURCE.emergency`), never on credit | An automatic bypass of the plants. |
| Rescue when stuck (`RESCUE`) | free material + **all debt written off**, every 15 min | material at **+50%** on the account (`RESCUE.markup`), nothing written off, within an emergency line of 2× the account's limit | Free material and forgiven debt could be farmed. |
| Last resort | (the rescue above) | stuck **and** the emergency line full: the account is cut back to its limit, the company loses **25 reputation** (car prices), at most once an hour | Without it, long simulations found companies stuck for good (no cash, no material, nothing to sell, account full). |
| Company account (`DEBT`) | unlimited; all incoming cash repaid it first | limit = 5 min of running costs (min **$10,000**); over it every plant is **SUSPENDED** until it is back at 50% of the limit (or cash covers it); repaid out of profit (**50%** of the average net income), cash covering it twice over settles it | "Virtual money" without limit; and repaying from every dollar that came in left no cash for materials — companies starved. |
| Parts Market (`PARTS_DEMAND`) | unlimited demand at full price | full price for 25 units per 5 min per level of the plants making the item (+1), then depth ÷ volume of the price, **floor 60%** | The wholesale outlet for components could absorb any amount. Cars are the business; parts are the overflow. |
| Car wholesale (`WHOLESALE`) | 0.7 | 0.7 (unchanged) | Only loads already on their way to the market in old saves use it; new cars wait for a dealer, so it can't be farmed. |
| Start cash (`START_CASH`) | $10,000 | $10,000 (unchanged) | Measured: with the starter Body Works it buys ~6 bodies of material — tight enough. The slower upgrades and the dearer tyres are what slow the start. |

## 3. Measured effect (goal-following bot, `npx tsx scripts/goal-bot.ts 8 q` / `8 full` / `24 sessions`)

| | Before | After |
|---|---|---|
| First car | 24 min 44 s | 43 min 44 s |
| Cars made, money earned after 1 h | 22 cars, $496K | 8 cars, $249K |
| After 3 h | 510 cars, $4.2M | 121 cars, $1.0M |
| After 8 h (quiet bot) | 3,482 cars, $58.8M | 1,694 cars, $22.9M |
| First Global Expansion (full bot) | 4 h 36 min | 5 h 46 min |
| Money earned in 8 h (full bot) | $372M | $101M |
| Highest debt in a run | $28.7K, no limit | $14.6K–$20.8K (8 h); $37.6K once in 24 h of play-1-h / away-7-h, cut back by the last resort |
| Companies stuck for good | — (debt written off) | none in any run (6 configurations × 8 h, 24 h quiet, 24 h sessions) |

## 4. The rules that keep money honest

- **Materials are paid when ordered.** Nothing is ever produced from material that wasn't bought
  (or delivered by the emergency supplier, at its price, on the account).
- **Each material keeps its own cost** in the warehouse (weighted average); using it books exactly that.
- **Every dollar is booked once** in the ledger, under one key: manufacturing revenue/costs, side
  businesses (garages, racing), and rewards below the line. HUD profit = dashboard net = stats.
- **Running costs on account** only up to the limit; suspended plants resume when the account is paid
  down (or the cash covers it). While suspended, "What's next" says so and suggests no spending.
- **Offline** runs the very same simulation (at the offline efficiency): it cannot create material,
  parts or cars that the online game couldn't; the Welcome Back report shows how the account changed.
