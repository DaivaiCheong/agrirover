# AgriRover NoSQL Database Schema (`MongoDB 7`)

Document collections, embedded data structures, and indexes managed by [`apps/api/app/core/db.py`](../apps/api/app/core/db.py) and populated idempotently by [`apps/api/app/services/seed.py`](../apps/api/app/services/seed.py).

---

## 1. MongoDB Collections & Indexes

| Collection | Indexes (`ensure_indexes`) | Role |
|---|---|---|
| `farms` | `name` (unique) | Farm identity (`farm-01`), operator credentials, and economic `settings` (`khrPerUsd`, `familyWageUsdPerDay`, `waterCostPerM3Usd`, `landRentUsdPerHaYear`, `irrigationEfficiency`, `rateConfirmed`). |
| `zones` | `(farmName, zone)` (unique) | Managed tomato blocks (`g1`–`g6`), grid dimensions, soil profile (`texture`, `rootingDepthCm`, `drainage`, `organicMatterPct`), latest field telemetry, and active setup. |
| `cycles` | `id` (unique), `(farmName, zone, status)` | Active & closed tomato plantings (`Roma Tomato`, `Cherry Belle`, `San Marzano`, `Beefsteak`, 69 active plants across `G1–G5`), `plantedOn`, `plantCount`, `grid`, `jobsDone`, `fruitMm`, `expectedPriceUsdPerKg`. |
| `surveys` | `id` (unique), `(farmName, zone, startedAt)` | Autonomous rover missions (`rows`, `cols`, `cellM`, `status`, summary counters) with embedded **`cells[]`** containing `{ row, col, plant, reached, flagged, canopy, chlorosis, disease, disease_confidence, readings, advice }`. |
| `telemetry` | `(farmName, zone, metric, ts)` | Time-series readings (`soil_moisture`, `soil_ph`, `soil_ec`, `soil_temperature`, `nitrogen`, `phosphorus`, `potassium`, `air_temperature`, `air_humidity`, `rain`, `supply_voltage`, `water_ph`) stored by timestamp `ts` for fast aggregation in `rover_service.py`. |
| `finance_workbooks` | `farmName` (unique) | Persisted `/finance` interactive Excel calculator state (`plants`, `cycleDays`, `exchangeRate`, `yieldKgPerPlant`, `sellingPricePerKg`, `riskProtectedUsd`, and editable `rows[]` ledger items). |
| `costs` | `id` (unique) | Farm & cycle operating cost ledger entries (`category`, `amount`, `currency`, `amountUsd`, `rateUsed`, `plantingId`, `source`). |
| `harvests` | `id` (unique) | Harvest pick weights (`kgTotal`, `kgMarketable`, `kgHome`, `kgLost`, `date`). |
| `sales` | `id` (unique) | Harvest sales records (`kg`, `pricePerKg`, `currency`, `revenueUsd`, `buyer`, `date`). |
| `stock_items` | `id` (unique) | Agricultural inputs inventory (`qtyOnHand`, `avgUnitCostUsd`, `valueUsd`, `category`, `unit`). |
| `stock_moves` | `id` (unique) | Audit trail of inventory purchases (`kind: "in"`) and cycle usage (`kind: "out"`). |
| `assets` | `id` (unique) | Equipment depreciation registry (`costUsd`, `boughtOn`, `lifeYears`, `salvageUsd`, `dailyDepreciationUsd`, `status`). |
| `devices` | `(farmName, code)` (unique) | Connected hardware registry (`ROVER-TOM-01`, drip controller, field sensor node) and telemetry status. |
| `leaf_tests` | `id` (unique) | Lab leaf tissue nutrient samples & out-of-range evaluations (`N`, `P`, `K`, `Ca`, `Mg`). |
| `photos` | `id` (unique) | Saved plant photos, probe snapshot metadata, model predictions, and farmer/expert confirmations. |

---

## 2. Key Embedded Document Patterns

### A. Rover `surveys` Cell (`cells[]`)
```json
{
  "row": 1,
  "col": 1,
  "plant": true,
  "reached": true,
  "flagged": true,
  "needs_water": false,
  "canopy": 0.42,
  "chlorosis": 0.14,
  "disease": "chlorosis",
  "disease_confidence": 0.91,
  "readings": {
    "soil_moisture": 65.0,
    "soil_ph": 6.35,
    "soil_ec": 1.5,
    "soil_temperature": 24.4,
    "nitrogen": 64,
    "phosphorus": 80,
    "potassium": 190
  }
}
```
> Standardized `disease` values consumed by `apps/web/src/lib/vision.ts` & `utils/agronomyEngine.ts`:
> `early_blight` | `leaf_curl` | `chlorosis` | `blossom_end_rot` | `pest_damage`

### B. Interactive Excel Workbook (`finance_workbooks`)
```json
{
  "farmName": "farm-01",
  "plants": 69,
  "cycleDays": 110,
  "exchangeRate": 4080,
  "yieldKgPerPlant": 4.5,
  "sellingPricePerKg": 0.80,
  "riskProtectedUsd": 25.20,
  "rows": [
    {
      "id": "water",
      "rowNum": 2,
      "label": "Irrigation Water (m³)",
      "unit": "m³",
      "roverQty": 7.94,
      "stdQty": 11.0,
      "unitRateUsd": 0.55
    }
  ]
}
```
> Updating `/api/v1/finance/spreadsheet` persists edits directly to MongoDB and recalculates unit economics across all scales (`69 Plants · Current Farm`, `100`, `500`, `1,000`).

---

## 3. Seeded Tomato Baseline (`G1–G6`)

When `seed_farm()` runs on an empty `agrirover` database, it initializes **6 blocks** (`69` active fruiting/flowering plants across 5 active blocks + 1 ready block):
- `g1`: `G1 Greenhouse North` (`400 m²`, `Roma Tomato`, `15` plants, `4x4` grid with empty `[3,3]`)
- `g2`: `G2 Commercial Bed A` (`105 m²`, `Cherry Belle`, `10` plants, `2x5` grid)
- `g3`: `G3 Raised Beds B` (`60 m²`, `San Marzano`, `10` plants, `2x5` grid)
- `g4`: `G4 Drip Plot C` (`50 m²`, `Beefsteak`, `24` plants, `5x5` grid with empty `[0,4]`)
- `g5`: `G5 Harvest Bed` (`105 m²`, `Roma Tomato`, `10` plants, `2x5` grid)
- `g6`: `G6 Open Field` (`50 m²`, ready bed, `0` plants)
