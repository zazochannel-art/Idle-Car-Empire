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
- **Running costs on account**: over the limit nothing more is bought on credit, but plants with
  material keep working; at twice the limit they stop, and resume when sales and profit have paid
  it down (or the cash covers it). While they are stopped, "What's next" says so and suggests no
  spending.
- **Offline** runs the very same simulation (at the offline efficiency): it cannot create material,
  parts or cars that the online game couldn't; the Welcome Back report shows how the account changed.

## 5. After the first car: cash, debt and the profit shown (second pass)

A player who followed the goals found the money always at zero once the Assembly Plant opened.
Measured with the goal-following bot (`scripts/goal-bot.ts`), 10-minute windows from the first car
(0 h 44) to 2 h:

| | Before | After |
|---|---|---|
| Cash at $0 | 69–100% of the time, for ~75 min | about half the time, for ~30 min |
| Plants stopped (suspended for debt) | half the time, for 40 min | never |
| Highest debt | $18.6K | $1.3K |
| Profit shown negative | 58–98% of the time | 0% |
| After 3 h (quiet bot) | 111 cars, $972K earned, $26/s | 396 cars, $2.8M, $199/s |
| After 8 h (quiet bot) | 1,819 cars, $23.5M | 2,413 cars, $37.9M |
| After 8 h (full bot) | 3,336 cars, $175M, debt up to $14.6K | 3,480 cars, $274M, debt up to $412 |
| 24 h of 1 h play / 7 h away | 692 cars, $7.4M, debt up to $35.8K | 853 cars, $11.9M, debt up to $20.7K |

What was wrong, and what changed:

| | OLD | NEW | WHY |
|---|---|---|---|
| Over the account's limit | every plant **suspended** | nothing more bought on credit; plants with material **keep working**; only at **2×** the limit (`DEBT.halt`) does every plant stop | Stopping the plants stopped the cars that pay the account back: a spiral. |
| Paying the account back | 50% of the 10-min average net income (nothing when it is ≤ 0) | also **30% of every sale** (`DEBT.share`, after fees and tax) | A struggling company's average is ≤ 0, so it never paid anything back. |
| Suggested and automatic material orders | all the cash | leave **2 minutes of running costs** (`WAGE_RESERVE_SECONDS`); a plant with nothing to work with still gets 2 units from the whole cash | Each one-tap restock spent everything, so wages and power went on the account. |
| Profit shown (HUD, stats, dashboard) | ledger net: materials and wages booked when a part is made, revenue when the car sells | the same plus the **change in parts and cars made but not sold yet, at their standard cost** (`goodsValue`), shown on the dashboard as "Made, not sold yet" | Building stock looked like a loss (−$47/s right after the first car). |
| Car margins (`CLASS_MARGIN`) | economy 16%, sport 24%, premium 30%, luxury 38%, supercar 48%, hypercar 55% | **24%, 30%, 36%, 44%, 54%, 62%** | A car earned ~$700 against ~$350 for its body and engine sold as parts: not worth the money tied up in it. A City car now earns ~$1,050. |

The ledger itself is unchanged: every dollar is still booked once, and the Welcome Back report
still shows money in and out. Only the profit figure adds the stock change.

