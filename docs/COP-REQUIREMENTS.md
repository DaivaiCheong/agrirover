# Cost of production (COP): requirements, by Elon Musk's five steps

COP = **cost of production**: what one kilo of produce really costs the farmer.

`COP per kg = total cost of the crop cycle / marketable kg harvested`

Also shown: per plant, per m², kg per m³ of water, break-even price (= COP), revenue and profit.

## What counts as a cost

1. Seeds and seedlings, fertilizer, pesticide, materials (stakes, string, mulch, crates)
2. Water and energy (pump fuel or electricity, bought water)
3. Hired labour (days x wage) and **family labour** (days x a daily wage the farmer sets)
4. Services (land preparation, spraying, harvest crew, transport)
5. Equipment depreciation (pump, drip lines, tank, sensors)
6. Land (rent, or what the land could be rented for if owned)
7. Interest on loans, repairs, farm overhead, other

## How the number is worked out

All in `apps/api/app/services/cost.py`, checked against hand-calculated examples in `tests/test_cop.py` and `tests/test_cost_api.py`.

- A cost tied to a cycle goes to that cycle. A farm-level cost (overhead) is split across the cycles growing on its date, by area (equally if a cycle has no area).
- Depreciation: (price - scrap value) / (life in years x 365) per day, from purchase until retired or fully worn out, shared across the cycles growing that day by area.
- Land: rent per ha per year x the cycle's hectares x days / 365.
- Water: real entries if there are any. Otherwise the water planner's m³ for the days so far x the water price, shown as an **ESTIMATE**.
- Stock: buying an input is not a cost. Using it on a cycle is, at the moving-average price paid. Nothing is counted twice.
- Money is kept as entered (USD or riel) and in USD at the rate of the day it was entered. That rate is frozen.
- No harvest yet: "no harvest", never a zero or an infinite cost per kg. Open cycle: "costs so far".
- Anything missing (land rent, water price, plant count, area) is listed on the report. It is never guessed.

## Step 1: question every requirement

Owner = who needs it. Verdict: KEEP (built), LATER (after the demo), DELETE (not built).

| # | Requirement | Owner | Verdict | State |
|---|---|---|---|---|
| R1 | Record an expense: date, cycle, category, amount | Any farmer | KEEP | Built (Costs) |
| R2 | Quantity x unit price | Any farmer | KEEP | Built |
| R3 | USD and riel with one exchange-rate setting | Any farmer | KEEP | Built (Settings) |
| R4 | Edit and delete an expense (soft delete) | Any farmer | KEEP | Delete in the screen; edit through the API |
| R5 | Receipt photos | none | DELETE | |
| R6 | Supplier directory, payment status, VAT on purchases | none | DELETE | |
| R7 | Hired labour: days x wage | Any farmer | KEEP | Built |
| R8 | Family labour at a daily wage | Any farmer | KEEP | Built; refused if no wage is set |
| R9 | Timesheets, attendance, payroll | none | DELETE | |
| R10 | Stock: buy in, use out, moving average | Chosen | KEEP | Built (Stock), with undo |
| R11 | Reorder alerts, batches, expiry | none | DELETE | |
| R12 | Equipment register: price, date, life, scrap value | Chosen | KEEP | Built (Equipment) |
| R13 | Depreciation shared across cycles by area | derived | KEEP | Built |
| R14 | Repairs and fuel as ordinary costs | Any farmer | KEEP | Built (categories) |
| R15 | Land rent | Any farmer | KEEP | Built (Settings) |
| R16 | Overhead split across active cycles | Any farmer | KEEP | Built ("Whole farm" cost) |
| R17 | Interest on loans | Farmers who borrow | KEEP | Built (entered as a cost) |
| R18 | Water need per cycle in m³ | done earlier | KEEP | Built (Water planner) |
| R19 | Water cost = m³ x price | Any farmer | KEEP | Built, labelled ESTIMATE |
| R20 | Metered water from valve run time | later | LATER | |
| R21 | Cycle: crop, bed, plants, area, dates | Any farmer | KEEP | Built (Crop cycles) |
| R22 | Harvest: kg harvested, to sell, kept at home | Any farmer | KEEP | Built |
| R23 | Sales: kg, price per kg, buyer | Any farmer | KEEP | Built |
| R24 | Grades A/B/C, loss reasons | later | LATER | |
| R25 | COP per cycle: per kg, plant, m², m³ | Any farmer | KEEP | Built (Cost of production) |
| R26 | Cost breakdown by category | Any farmer | KEEP | Built |
| R27 | Break-even price, revenue, profit | Any farmer | KEEP | Built |
| R28 | Compare two beds (guided vs usual) | The trial | KEEP | Built (Compare beds) |
| R29 | Compare seasons, budget vs actual | needs seasons of data | LATER | |
| R30 | CSV export | Accountant, NGO | KEEP | Built (costs and COP) |
| R31 | Any crop, with its own water numbers | "Not just tomato" | KEEP | Built (Add a crop) |
| R32 | Preload many crops | none yet | DELETE | Add on request |
| R33 | Login, many farms | After the demo | LATER | Every table already reaches a farm |
| R34 | Khmer language, Telegram entry, offline app | later | LATER | |
| R35 | Double-entry accounting, tax filing, invoices, yield prediction | none | DELETE | |

## Steps 2 to 5

2. **Delete:** every DELETE line above, plus the invented Irrigation page, the placeholder pages and the tomato-only crop constant.
3. **Simplify:** one ledger table for money out, fixed categories in code, labour as an ordinary cost, depreciation / overhead share / water estimate computed at report time and never stored, one report that matters.
4. **Accelerate:** adding a cost is one screen with the last cycle, kind and currency remembered.
5. **Automate last:** done: stock use becomes a cost, depreciation and overhead are shared automatically, water cost comes from the planner. Later: Telegram entry, metered water.

## What is assumed or limited

- No login: anyone with the address can see and change the farm's data.
- The riel rate starts as 4,000 per dollar, a placeholder shown with a warning until the farmer saves a rate.
- The water estimate uses Siem Reap's monthly ET₀ (NASA weather, FAO-56 method; see TOMATO-RESEARCH.md) and an irrigation efficiency of 0.9 (drip), a typical figure the farmer can change. It is an estimate, not a meter.
- Family wage and land rent are the farmer's own numbers; empty means left out, and the report says so.
- The compare screen shows what was recorded. It does not prove why two beds differ.
