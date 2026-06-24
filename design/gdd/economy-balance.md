# Economy Balance Design Document

**Version:** 2.0
**Author:** economy-designer
**Date:** 2026-05-20
**Status:** Synced to implementation (`server/db.js`, `server/routes.js`)

> **v2.0 note:** All values in this document now reflect the *live code* in
> `server/db.js` (`BUILDING_DEFS`, `TROOP_DEFS`, `PRODUCTION_DEFS`,
> `STORAGE_CAPACITY`, `TH_BASE_CAPACITY`) and `server/routes.js` (gold reward
> constants). The previous v1.0 "proposed" numbers were never shipped; this
> revision replaces them with as-built values. Where the as-built economy no
> longer satisfies the original 28-day fantasy, a **⚠️ Balance risk** note is
> added rather than hiding the gap.

---

## 1. Overview

This document defines the complete resource economy for Clash (Clash of Clans style game
integrated with the Pacifica perpetual futures DEX). Gold is earned through real trading
activity. Wood and ore are earned passively through in-game production buildings. The
target experience is a player who deposits $30, trades once or twice per day with 10x
leverage, and progresses toward a fully maxed base while feeling neither stuck nor
unchallenged. Gold is the primary bottleneck and meaningful progression gate. Wood and
ore are secondary resources that create parallel decision-making but are never the
primary blocker.

⚠️ **Balance risk (headline):** At the current shipped gold rates (Section 3.2), the
target player earns ~360G/day, while a fully maxed base + troops costs **~55,400G net**
of starting resources (Section 4.1). The economy as built takes **~10–12 weeks** to max,
not the intended 3–4. Closing this gap requires either raising gold income or lowering
gold sinks (see Section 7 sensitivity).

---

## 2. Player Fantasy

The player opens the game after each trading session, sees their gold reward land, and
immediately has a decision to make: buy that upgrade now, or hold for the bigger one?
Every trade session should result in a visible, tangible game action — placing a building,
upgrading a troop, unlocking something new. The economy must sustain this daily feedback
loop without running dry or flooding. The correlation between trading performance and
in-game power feels meaningful without being punitive on losing days.

---

## 3. Detailed Rules

### 3.1 Resource Types

| Resource | Primary Source | Secondary Source | Role |
|----------|---------------|-----------------|------|
| Gold | Trading rewards (DEX) | Raiding other players | Primary progression gate |
| Wood | Sawmill buildings | Raiding | Building material, abundant |
| Ore | Mine buildings | Raiding | Building material, moderate |

**Starting resources (new player, `players` table defaults):** 4,000 gold / 4,000 wood /
4,000 ore.

### 3.2 Gold Income — Trading Rewards

All gold rewards are triggered by on-chain trading activity. Constants live in
`server/routes.js`.

| Event | Live Rate | Source Constant |
|-------|-----------|-----------------|
| First deposit bonus | 500G (one-time) | `GOLD_FIRST_DEPOSIT = 500` |
| First trade bonus | 300G (one-time) | `GOLD_FIRST_TRADE = 300` |
| Daily trade bonus | 200G/day | `GOLD_DAILY_TRADE = 200` |
| Volume reward | 0.30G per $1 | `GOLD_PER_USD_VOLUME = 0.30` (Decibel DEX: `GOLD_PER_USD_VOLUME_DECIBEL = 0.30`) |
| Profit reward | 150G per $10 positive PnL | `GOLD_PER_10_USD_PROFIT = 150` |

**Calculation — target player ($30 deposit, 10x leverage, 1-2 trades/day):**

- Position notional: $30 * 10 = $300
- Daily volume: $300 (1 trade) to $600 (2 trades), avg ~$450
- Volume gold: $450 * 0.30 = ~135G
- Daily trade bonus: 200G
- Profit gold (assume $5 profit every 3 days average): (5/10 * 150) / 3 = ~25G/day
- **Steady-state daily income: ~360G/day**
- **Day 1 total: 500 + 300 + 360 = ~1,160G**

⚠️ **Balance risk:** The daily bonus (200G) no longer dominates as v1.0 intended; volume
is now the largest steady component because the per-$ volume rate was set to 0.30 (higher
than the 0.20 v1.0 proposed) while the daily bonus stayed at the original 200.

### 3.3 Gold Income — 28-Day Projection

Assumes ~360G/day steady-state after day 1, no raiding.

| Period | Gold Earned | Running Total (incl. 4,000 starting) |
|--------|------------|---------------------------------------|
| Day 1 | ~1,160G | ~5,160G |
| Week 1 (days 2-7) | ~2,160G | ~7,320G |
| Week 2 (days 8-14) | ~2,520G | ~9,840G |
| Week 3 (days 15-21) | ~2,520G | ~12,360G |
| Week 4 (days 22-28) | ~2,520G | ~14,880G |

**Total available gold by end of day 28: ~14,880G** (raiding can supplement — see 5.4).

⚠️ This is ~40,500G short of the ~55,400G net needed to fully max (Section 4.1).

### 3.4 Wood and Ore Income — Production Buildings

Live rates from `PRODUCTION_DEFS` in `server/db.js`. Rates are **per minute**; cap is the
maximum stored before the building idles.

| Building | Resource | Lv1 Rate | Lv1 Cap | Lv2 Rate | Lv2 Cap | Lv3 Rate | Lv3 Cap |
|----------|----------|----------|---------|---------|---------|---------|---------|
| Mine | Ore | 6/min | 200 | 11/min | 400 | 18/min | 800 |
| Sawmill | Wood | 8/min | 250 | 15/min | 500 | 24/min | 1000 |

(`barn` and `port` have no entry in `PRODUCTION_DEFS` — they produce no resources.)

**Time to fill cap from empty:**

| Building | Level | Rate | Cap | Minutes to fill |
|----------|-------|------|-----|-----------------|
| Mine | 1 | 6/min | 200 | ~33 min |
| Mine | 2 | 11/min | 400 | ~36 min |
| Mine | 3 | 18/min | 800 | ~44 min |
| Sawmill | 1 | 8/min | 250 | ~31 min |
| Sawmill | 2 | 15/min | 500 | ~33 min |
| Sawmill | 3 | 24/min | 1000 | ~42 min |

**Daily yield per building (3 collections/day at cap):**

| Building | Level | Yield/Collection | Collections/Day | Daily Yield |
|----------|-------|------------------|-----------------|-------------|
| Mine | 3 | 800 ore | 3 | 2,400 ore |
| Sawmill | 3 | 1,000 wood | 3 | 3,000 wood |

A frequently-collecting active player can far exceed this (continuous 18/min ore = up to
~25,900/day per maxed mine). With 3 maxed mines and 3 maxed sawmills, wood and ore reach
the hundreds-of-thousands range over 28 days — **more than enough** to cover the
~145,900W / ~102,800O needed (Section 4.1) provided collection is frequent.

**Wood and ore are not the blocking constraint. Gold is always the bottleneck.**

---

## 4. Formulas

### 4.1 Total Resources Required to Max Everything

Counts based on `TH_MAX_COUNT` at Town Hall level 3:
- Mines: 3, Sawmills: 3, Barns: 2, Ports: 5, Archer Towers: 3, Tombstones: 3,
  Turrets: 3, Storages: 2, Town Hall: 1.

**Upgrade cost rule (live, `upgradeBuilding()`):**
- Non-Town-Hall buildings: `upgrade_to_level_N = base_cost * N`.
- Placement = base_cost * 1, upgrade to Lv2 = base_cost * 2, upgrade to Lv3 = base_cost * 3.
- **Full cost (placement → Lv3) per building = base_cost * (1 + 2 + 3) = base_cost * 6.**
- Town Hall: free placement, explicit `upgrade_cost` table (below).

**Live building base costs (`BUILDING_DEFS.cost`):**

| Building | Base Cost (G / W / O) | Full Cost ×6 (G / W / O) | Max Count (TH3) |
|----------|----------------------|--------------------------|-----------------|
| Mine | 200 / 500 / 0 | 1,200 / 3,000 / 0 | 3 |
| Sawmill | 200 / 0 / 500 | 1,200 / 0 / 3,000 | 3 |
| Barn | 300 / 800 / 600 | 1,800 / 4,800 / 3,600 | 2 |
| Port | 500 / 1,200 / 1,000 | 3,000 / 7,200 / 6,000 | 5 |
| Archer Tower | 400 / 1,500 / 0 | 2,400 / 9,000 / 0 | 3 |
| Tombstone | 200 / 0 / 800 | 1,200 / 0 / 4,800 | 3 |
| Turret | 400 / 1,500 / 1,200 | 2,400 / 9,000 / 7,200 | 3 |
| Storage | 300 / 1,200 / 0 | 1,800 / 7,200 / 0 | 2 |
| Town Hall | free placement | upgrades only (see below) | 1 |
| Mage Tower ⚗️ | 500 / 0 / 800 | 3,000 / 0 / 4,800 | 4 (sandbox) |

⚗️ **Mage Tower is `test_only`** — it exists in `BUILDING_DEFS` but is excluded from
`TH_MAX_COUNT`, so production players cannot place it (the shop lists it only when
`test_mode` is on). It is therefore **excluded from the totals below**. See Section 11.

**Town Hall upgrades (`upgrade_cost`):** Lv1→2 = 2,000G / 6,000W / 5,000O;
Lv2→3 = 5,000G / 20,000W / 18,000O. Total = 7,000G / 26,000W / 23,000O.
HP per level: 3,500 / 6,000 / 10,000.

**Totals with live values:**

| Category | Gold | Wood | Ore |
|----------|------|------|-----|
| All buildings placed + upgraded to Lv3 | 54,400G | 149,000W | 105,200O |
| Ships (5 ports × 500G) | 2,500G | 0 | 0 |
| Troop upgrades (all to Lv3) | 2,520G | 870W | 1,550O |
| **TOTAL** | **59,420G** | **149,870W** | **106,750O** |
| Minus starting resources (4,000 each) | **55,420G** | **145,870W** | **102,750O** |

**Available by day 28 (no raiding):** ~14,880G / hundreds-of-thousands W / hundreds-of-thousands O.

⚠️ **Balance risk:** Gold falls ~40,500G short of the 55,420G needed. At ~360G/day plus
modest raiding, full max takes **~10–12 weeks**, not the intended 3–4. Either gold income
must rise (e.g. `GOLD_DAILY_TRADE` toward 700–900, the v1.0 intent) or gold sinks must
drop. Wood and ore are comfortably covered.

### 4.2 Live Troop Costs (`TROOP_DEFS.cost`)

**2026-06-21 implementation override:** all `TROOP_DEFS` entries now use
`max_level = 7`. The `cost` array is indexed by *current* level:
`cost[0]` = Lv1->Lv2, `cost[1]` = Lv2->Lv3, through `cost[5]` = Lv6->Lv7.
Troop upgrade gates now follow Barn level: troop Lv2 requires Barn Lv2, Lv3 requires Barn
Lv3, Lv4 requires Barn Lv4, and troop Lv5-Lv7 require Barn Lv5. The server enforces this
in `upgradeTroop()` with `BARN_LEVEL_REQUIRED`.

| Troop | Lv1->2 | Lv2->3 | Lv3->4 | Lv4->5 | Lv5->6 | Lv6->7 | Total Lv1->7 |
|-------|--------|--------|--------|--------|--------|--------|--------------|
| Knight | 150G+125O | 300G+250O | 600G+500O | 1200G+1000O | 2200G+1800O | 3800G+3200O | **8250G+6875O** |
| Mage | 250G+250O | 500G+500O | 1000G+1000O | 2000G+2000O | 3600G+3600O | 6000G+6000O | **13350G+13350O** |
| Barbarian | 175G+175O | 350G+350O | 700G+700O | 1400G+1400O | 2600G+2600O | 4400G+4400O | **9625G+9625O** |
| Archer | 175G+175W | 350G+350W | 700G+700W | 1400G+1400W | 2600G+2600W | 4400G+4400W | **9625G+9625W** |
| Ranger | 125G+125W | 250G+250W | 500G+500W | 1000G+1000W | 1900G+1900W | 3200G+3200W | **6995G+6995W** |
| Demon King | 150G+125O | 300G+250O | 600G+500O | 1200G+1000O | 2200G+1800O | 3800G+3200O | **8250G+6875O** |
| Fire Dragon | 250G+250O | 500G+500O | 1000G+1000O | 2000G+2000O | 3600G+3600O | 6000G+6000O | **13350G+13350O** |
| **Totals** | - | - | - | - | - | - | **69445G + 16620W + 50075O** |

Demon King and Fire Dragon remain NFT-backed 2-slot troops, but they now have server-side
`TROOP_DEFS` entries and upgrade costs. Their combat stats scale from Knight and Mage,
respectively, at the same shared troop level plus rarity multiplier.

Troops start at Lv1 (free, auto-initialized at player creation). The `cost` array is
indexed by *current* level: `cost[0]` = Lv1→Lv2, `cost[1]` = Lv2→Lv3. (`cost[2]` exists in
the data but is never charged, since `max_level = 3`.)

| Troop | Lv1→2 Cost | Lv2→3 Cost | Total Lv1→3 | Resource |
|-------|-----------|-----------|-------------|----------|
| Knight | 150G + 100O | 300G + 250O | **450G + 350O** | gold/ore |
| Mage | 200G + 200O | 500G + 500O | **700G + 700O** | gold/ore |
| Barbarian | 150G + 150O | 350G + 350O | **500G + 500O** | gold/ore |
| Archer | 150G + 150W | 350G + 350W | **500G + 500W** | gold/wood |
| Ranger | 120G + 120W | 250G + 250W | **370G + 370W** | gold/wood |
| **Totals** | — | — | **2,520G + 870W + 1,550O** | — |
| Demon King ⚗️ | — | — | **no server cost yet** | premium, 2 ship slots |

(The unused `cost[2]` entries are: Knight 600G+500O, Mage 1000G+1000O,
Barbarian 700G+700O, Archer 700G+700W, Ranger 500G+500W.)

⚗️ **Demon King is not in `TROOP_DEFS`** — it has no server-side cost and is not part of
the economy totals. It is defined client-side (`demon_king.gd`, registered in
`attack_system.gd` / `building_system.gd`) and consumes **2 ship slots** per deploy. Before
it ships to production it needs a `TROOP_DEFS` entry. Suggested premium pricing (to be
approved): Lv1→2 = 400G + 350O, Lv2→3 = 800G + 700O (≈1.6× the Knight upgrade path, ore-
weighted). See Section 11 for combat stats.

### 4.3 Daily Gold Budget Formula

```
daily_gold = GOLD_DAILY_TRADE
           + (daily_volume_usd * GOLD_PER_USD_VOLUME)
           + (positive_pnl_usd / 10 * GOLD_PER_10_USD_PROFIT)
```

Target player example (live constants):
```
daily_gold = 200 + (450 * 0.30) + (1.67 / 10 * 150)
           = 200 + 135 + 25
           = 360G/day
```

---

## 5. Edge Cases

### 5.1 Player Loses All Trades (Zero Profit Gold)
Income drops to ~335G/day (200 daily + ~135 volume). Over 4 weeks: ~9,380G earned + 4,000
starting = ~13,400G. Player can reach Town Hall Lv2 and upgrade core production buildings,
but Town Hall Lv3 (a 5,000G single upgrade plus heavy wood/ore) and full troop maxing are
out of reach in 28 days without raiding.

### 5.2 Player Only Makes 1 Trade/Day
Daily volume drops to ~$300, volume gold to ~90G. Total daily: ~315G. Because the daily
bonus is only 200G, the volume component matters more than v1.0 intended — a 2-trade day
(~360G) is ~14% richer than a 1-trade day (~315G).

### 5.3 Player Stockpiles Without Spending
Resource storage caps prevent infinite accumulation. The cap = Town Hall base capacity +
the sum of Storage building capacities. The current live cap curve is intentionally tight:
each Storage unlocked by progression is needed to afford the next Town Hall milestone.

| Town Hall | Max Storages | Cap at required Storage level | Next TH max single-resource cost |
|-----------|--------------|-------------------------------|----------------------------------|
| TH1 | 0 | 6,000 | 2,400 |
| TH2 | 1 × Storage Lv2 | 9,000 | 7,000 |
| TH3 | 2 × Storage Lv3 | 22,000 | 20,000 |
| TH4 | 3 × Storage Lv4 | 54,000 | 52,000 |
| TH5 | 3 × Storage Lv5 | 75,000 | n/a |

This means Storage is a real progression gate without creating the old 200k+ dead storage
surplus. If TH6 is added, it should either introduce the fourth Storage or raise Storage
Lv5 capacity with a matching TH6 upgrade cost.

Altar branch Lv3 costs must also stay below the TH5 single-resource cap. Current Lv3 altar
skill costs top out at 70,000 wood/ore, leaving a small buffer under the 75,000 cap.

### 5.4 Raiding Income
Successful raids steal **15%** of the defender's current resources (`LOOT_PERCENT = 0.15`).
If a defender holds 5,000G, a raid yields ~750G — roughly two days of trading income.
Raiding is a meaningful supplement but, at 15%, less impactful than the v1.0 30% figure.
Given the gold shortfall in 4.1, raiding is effectively **required** (not merely
supplemental) to approach a maxed base in a reasonable timeframe.

### 5.5 Storage Cap and Town Hall Lv3 Upgrade
The TH Lv2->3 upgrade costs 3,000G / 7,000W / 6,000O. At TH2 the base cap is 6,000, so a
Storage upgraded to Lv2 is required to hold the 7,000 wood cost. The same pattern repeats
at later tiers: TH3 needs two Lv3 Storages to afford TH4, and TH4 needs three Lv4 Storages
to afford TH5.

### 5.6 Production Building Collection Cadence
Players who collect infrequently hit the storage cap and lose production time. A Lv1 Mine
fills its 200 cap in ~33 minutes; idling 24 hours wastes ~97% of potential production. This
creates a soft daily engagement requirement without hard-locking content — buildings simply
stop producing until collected.

---

## 6. Dependencies

| System | Dependency | Notes |
|--------|-----------|-------|
| Trading rewards | Pacifica/Decibel DEX webhook | Gold credited on `claim-gold` in `routes.js` |
| Production | `getBuildingProductionSnapshot()` / `collectResources()` in db.js | Rate from `PRODUCTION_DEFS` |
| Storage caps | `getResourceCaps()` in db.js | `TH_BASE_CAPACITY` + `STORAGE_CAPACITY`; checked before crediting |
| Raiding | `battleVictory()` in db.js | `LOOT_PERCENT = 0.15` |
| Building costs | `BUILDING_DEFS` in db.js | `upgradeBuilding()` uses `base * level` |
| Troop costs | `TROOP_DEFS` in db.js | `upgradeTroop()` uses `cost[currentLevel - 1]` |
| TH upgrade requirements | `TH_UPGRADE_REQUIRES` in db.js | Prereq buildings, see 7.5 |
| Ship purchase | `SHIP_COST_GOLD = 500` in `bs_port.gd` / `building_system.gd` | Per-port |

---

## 7. Tuning Knobs

All economy values are centralized in `server/db.js` and `server/routes.js`. No hardcoded
balance numbers should exist in GDScript (ship cost is the lone GDScript constant).

### 7.1 Trading Reward Constants (`server/routes.js`)

```javascript
const GOLD_PER_USD_VOLUME         = 0.30;   // volume reward per $1 traded
const GOLD_PER_USD_VOLUME_DECIBEL = 0.30;   // Decibel DEX variant
const GOLD_FIRST_DEPOSIT          = 500;    // one-time
const GOLD_FIRST_TRADE            = 300;    // one-time
const GOLD_DAILY_TRADE            = 200;    // per active trading day
const GOLD_PER_10_USD_PROFIT      = 150;    // per $10 positive PnL
```

### 7.2 Building Definitions (`BUILDING_DEFS` in db.js)

```javascript
town_hall:    { cost: { gold:   0, wood:    0, ore:    0 },
                upgrade_cost: { 2: { gold: 2000, wood: 6000,  ore: 5000  },
                                3: { gold: 5000, wood: 20000, ore: 18000 } } },
mine:         { cost: { gold: 200, wood:  500, ore:    0 } },
sawmill:      { cost: { gold: 200, wood:    0, ore:  500 } },
barn:         { cost: { gold: 300, wood:  800, ore:  600 } },
port:         { cost: { gold: 500, wood: 1200, ore: 1000 } },
archer_tower: { cost: { gold: 400, wood: 1500, ore:    0 } },
tombstone:    { cost: { gold: 200, wood:    0, ore:  800 } },
turret:       { cost: { gold: 400, wood: 1500, ore: 1200 } },
storage:      { cost: { gold: 300, wood: 1200, ore:    0 } },
mage_tower:   { cost: { gold: 500, wood:    0, ore:  800 }, test_only: true },  // sandbox; not in TH_MAX_COUNT
```

The upgrade-cost multiplier system (`base * level`) is unchanged; only base costs are tuned.

### 7.3 Troop Definitions (`TROOP_DEFS` in db.js)

```javascript
knight:    { cost: [{ gold: 150, ore: 100 }, { gold: 300, ore: 250 }, { gold:  600, ore:  500 }] },
mage:      { cost: [{ gold: 200, ore: 200 }, { gold: 500, ore: 500 }, { gold: 1000, ore: 1000 }] },
barbarian: { cost: [{ gold: 150, ore: 150 }, { gold: 350, ore: 350 }, { gold:  700, ore:  700 }] },
archer:    { cost: [{ gold: 150, wood: 150 }, { gold: 350, wood: 350 }, { gold: 700, wood: 700 }] },
ranger:    { cost: [{ gold: 120, wood: 120 }, { gold: 250, wood: 250 }, { gold: 500, wood: 500 }] },
// demon_king: NOT YET DEFINED server-side. Proposed (pending approval):
// demon_king: { max_level: 3, slot_cost: 2,
//   cost: [{ gold: 400, ore: 350 }, { gold: 800, ore: 700 }, { gold: 1600, ore: 1400 }] },
```

### 7.4 Production & Storage (`db.js`)

```javascript
PRODUCTION_DEFS = {
  mine:    { resource: 'ore',  rate: [6, 11, 18], max: [200, 400, 800]  },   // per minute
  sawmill: { resource: 'wood', rate: [8, 15, 24], max: [250, 500, 1000] },
};
STORAGE_CAPACITY  = { 1: 2000, 2: 3000, 3: 6500, 4: 14000, 5: 19000 }; // per Storage
TH_BASE_CAPACITY  = { 1: 6000, 2: 6000, 3: 9000, 4: 12000, 5: 18000 };
LOOT_PERCENT      = 0.15;
SHIP_COST_GOLD    = 500;  // (GDScript: bs_port.gd / building_system.gd)
```

### 7.5 Town Hall Gating (`db.js`)

```javascript
TH_UNLOCK          = { storage: 2, tombstone: 2, turret: 3 };
TH_UPGRADE_REQUIRES = {
  1: ['mine', 'sawmill', 'barn', 'port'],
  2: ['mine', 'sawmill', 'barn', 'port', 'storage', 'tombstone', 'archer_tower'],
};
```

### 7.6 Sensitivity Table

| Knob | Current | Effect of Raising | Effect of Lowering | Suggested Range |
|------|---------|-------------------|--------------------|-----------------|
| `GOLD_DAILY_TRADE` | 200 | Faster max (700–900 ≈ 4-week max) | Even slower; risks dead days | 200–900 |
| `GOLD_PER_USD_VOLUME` | 0.30 | Rewards big positions, inflation risk | Weakens trade incentive | 0.15–0.35 |
| Building gold costs (global) | as 7.2 | Slower progression | Faster, risks trivial economy | ±30% |
| `LOOT_PERCENT` | 0.15 | Raiding more rewarding, faster max | Raiding loses appeal | 0.15–0.30 |

⚠️ The single most impactful lever for the Section 4.1 gold gap is `GOLD_DAILY_TRADE`.
Raising it to ~750 (the original v1.0 intent) brings full-max back to roughly 4 weeks.

---

## 8. Progression Reality (Live Values)

Assumes target player: $30 deposit, 10x, 1-2 trades/day, ~1h/day, collecting production
3×/day, light raiding. Income ~360G/day.

### Weeks 1–2 — Establishment
- Place Mine, Sawmill, Barn, Port; buy 1 ship (1,200G placement total).
- Upgrade core production to Lv2–3.
- Reach **Town Hall Lv2** (2,000G + 6,000W + 5,000O) around day 8–12 — later than the
  v1.0 target of day 5–8 because of the lower gold income.
- Unlock Storage and Tombstone (TH2).

### Weeks 3–5 — Expansion
- Second Mine/Sawmill/Port; second ship.
- First defensive upgrades (Archer Tower, Tombstone).
- Begin saving for **Town Hall Lv3** (5,000G + 20,000W + 18,000O). Wood/ore are easy with
  frequent collection; gold is the wall.

### Weeks 6–8 — Fortification
- Reach **Town Hall Lv3**, unlocking Turrets and the third tier of most buildings.
- Place Turrets (3), third production buildings, second Storage, additional Ports.

### Weeks 9–12 — Max Out
- Upgrade all buildings to Lv3, all troops to Lv3, all 5 ships active.
- Full max realistically lands around **week 10–12** at current gold rates (week 6–8 with
  active raiding).

⚠️ **Balance risk:** This is ~2–3× slower than the 28-day fantasy in Sections 1–2. To meet
the original target, apply the Section 7.6 gold-income lever.

---

## 9. Acceptance Criteria

1. **Day 28 reachability (currently FAILING):** A target player should be able to max all
   buildings and troops within 28 days. *At live rates this is not met (~10–12 weeks).*
   Either this criterion is relaxed to the live timeline, or gold income is raised per 7.6.

2. **Daily feedback:** Every active trading day (1–2 trades, ~360G) must fund at least one
   meaningful upgrade or placement (≥50G). *Met.*

3. **No infinite accumulation:** `getResourceCaps()` prevents any resource from exceeding
   the cap (TH base + Storages). Production idles rather than overflows. *Met.*

4. **Gold is always the constraint:** Wood/ore must never block the next purchase, assuming
   the player collects production at least once per day. *Met* — wood/ore production far
   exceeds the ~145,900W / ~102,800O lifetime requirement when collected frequently.

5. **TH upgrade is a milestone:** Players should reach TH2 within days 8–12 and TH3 within
   weeks 6–8 at live rates. If analytics show slower, raise `GOLD_DAILY_TRADE`.

6. **Raid income matters:** At `LOOT_PERCENT = 0.15`, raiding accelerates progress by
   roughly 1–2 weeks. Given the gold gap, raiding is effectively expected, not optional.

7. **Storage gate is discoverable:** Players approaching TH3 without sufficient capacity
   must receive a clear cap error, guiding them to build Storage. Enforced by
   `getResourceCaps()` and the `TH_UPGRADE_REQUIRES` check in `upgradeBuilding()`.

---

## 10. Economic Health Metrics

Tracked daily per cohort by the analytics-engineer:

| Metric | Healthy Range | Alert Threshold |
|--------|--------------|----------------|
| Average gold/day per active player | 300–450G (live) | < 250G or > 800G |
| Average TH level by day 10 | 1.8–2.2 | < 1.5 (too slow) |
| Average TH level by day 28 | 2.3–2.8 | < 2.0 |
| % players fully maxed by day 56 | 40–70% | < 20% (too hard) or > 90% (too easy) |
| Wood stockpile vs. cap | < 80% full | > 95% (production wasted) |
| Ore stockpile vs. cap | < 70% full | > 90% (production wasted) |
| Daily trade participation rate | > 60% | < 40% (rewards not compelling) |

---

## 11. Sandbox & Premium Content (Mage Tower, Demon King)

This section documents two combat entities that exist in code but are **not yet wired into
the production economy**. Combat values are sourced from GDScript (`tower_mage.gd`,
`demon_king.gd`); economy values from `BUILDING_DEFS` (`server/db.js`). DPS is computed as
`damage ÷ fire_rate` (or `÷ atk_speed`), since those fields are the cooldown in seconds.

### 11.1 Mage Tower — `tower_mage.gd` / `BUILDING_DEFS.mage_tower`

**Status:** ⚗️ `test_only` (sandbox). Listed in the shop only when `test_mode` is on;
excluded from `TH_MAX_COUNT`, so production players cannot place it. The server def carries
a stale `// No attack yet` comment, but the GDScript **does** implement an attack — reconcile
before promotion.

**Role:** Slow, heavy single-target ranged defense. Bigger per-hit damage than the Archer
Tower but a longer cooldown; same detect radius as Turret/Cannon (1.0).

| Level | Damage | fire_rate (cooldown s) | DPS | HP | Detect Range |
|-------|--------|------------------------|-----|-----|--------------|
| 1 | 70 | 1.5 | 46.7 | 700 | 1.0 |
| 2 | 110 | 1.3 | 84.6 | 1,300 | 1.0 |
| 3 | 160 | 1.1 | 145.5 | 2,200 | 1.0 |

**Economy:** base cost 500G / 0W / 800O; full path (×6) = 3,000G / 0W / 4,800O; `max_count` 4.

**Promotion checklist:** (1) remove `test_only`, (2) add to `TH_MAX_COUNT` with an unlock
tier in `TH_UNLOCK`, (3) add a `TROPHY_TABLE` row, (4) fix the stale server comment,
(5) fold its cost into the Section 4.1 totals.

### 11.2 Demon King — `demon_king.gd`

**Status:** ⚗️ Premium heavy-melee troop, **not in `TROOP_DEFS`** (no server cost). Registered
client-side in `attack_system.gd` and `building_system.gd`. Consumes **2 ship slots** per
deploy (`slot_cost: 2`) — the trade-off for its raw power.

**Role:** Single large "boss" body. Big reach (0.32 vs Knight's 0.24), 24% slower movement
than Knight (0.38 vs 0.50), slow heavy swings.

| Level | HP | Damage | atk_speed (cooldown s) | DPS | Move | Range |
|-------|-----|--------|------------------------|-----|------|-------|
| 1 | 560 | 78 | 2.20 | 35.5 | 0.38 | 0.32 |
| 2 | 735 | 102 | 2.05 | 49.8 | 0.38 | 0.32 |
| 3 | 960 | 134 | 1.90 | 70.5 | 0.38 | 0.32 |

**Design intent (code comment):** "~1.55× Knight on HP/DPS so 2 Knights still out-stat 1
Demon King." HP holds exactly (960 = 1.56× Knight L3's 617). **DPS is actually 2.34× Knight**
(70.5 vs 30.1), not 1.55×. The 2-slot framing still works as a trade: per 2 slots, **2 Knights
= 1,234 HP / 60 DPS** (more HP, two bodies) vs **Demon King = 960 HP / 71 DPS** (less HP, more
DPS, single body, vulnerable to focus/AoE). ⚠️ If a tighter cap is wanted, trim L3 damage
~134 → ~95 to bring DPS to ~1.55× Knight.

**Economy:** none yet. Proposed premium pricing (pending approval, ore-weighted, ≈1.6× Knight
path): Lv1→2 = 400G + 350O; Lv2→3 = 800G + 700O. Add a `slot_cost: 2` field to its
`TROOP_DEFS` entry on promotion.

---

*This document must be updated whenever `BUILDING_DEFS`, `TROOP_DEFS`, `PRODUCTION_DEFS`,
`STORAGE_CAPACITY`, `TH_BASE_CAPACITY`, `LOOT_PERCENT`, or the trading reward constants in
`server/routes.js` change. Balance changes must include a change-rationale comment
referencing this document.*
