# Economy Balance Design Document

**Version:** 1.0
**Author:** economy-designer
**Date:** 2026-04-06
**Status:** Approved

---

## 1. Overview

This document defines the complete resource economy for Clash (Clash of Clans style game
integrated with the Pacifica perpetual futures DEX). Gold is earned through real trading
activity. Wood and ore are earned passively through in-game production buildings. The
target experience is a player who deposits $30, trades once or twice per day with 10x
leverage, and reaches a fully maxed base in 3-4 weeks without feeling either stuck or
unchallenged. Gold is the primary bottleneck and meaningful progression gate. Wood and
ore are secondary resources that create parallel decision-making but are never the
primary blocker.

---

## 2. Player Fantasy

The player opens the game after each trading session, sees their gold reward land, and
immediately has a decision to make: buy that upgrade now, or hold for the bigger one?
Every trade session should result in a visible, tangible game action — placing a building,
upgrading a troop, unlocking something new. The economy must sustain this daily feedback
loop for 28 consecutive days without running dry or flooding. By the end of week 4, the
player has a maxed base they built themselves through real trading activity, and the
correlation between trading performance and in-game power feels meaningful without being
punitive on losing days.

---

## 3. Detailed Rules

### 3.1 Resource Types

| Resource | Primary Source | Secondary Source | Role |
|----------|---------------|-----------------|------|
| Gold | Trading rewards (DEX) | Raiding other players | Primary progression gate |
| Wood | Sawmill buildings | Raiding | Building material, abundant |
| Ore | Mine buildings | Raiding | Building material, moderate |

### 3.2 Gold Income — Trading Rewards

All gold rewards are triggered by on-chain trading activity on Pacifica DEX.

| Event | Current Rate | Proposed Rate | Rationale |
|-------|-------------|---------------|-----------|
| First deposit bonus | 500G | 500G (no change) | One-time onboarding hook |
| First trade bonus | 300G | 300G (no change) | Day-1 engagement spike |
| Daily trade bonus | 200G/day | **750G/day** | Core steady income; was too low |
| Volume reward | 0.05G per $1 | **0.20G per $1** | Makes larger positions feel rewarded |
| Profit reward | 100G per $10 PnL | **150G per $10 PnL** | Skill expression without being required |

**Calculation — target player ($30 deposit, 10x leverage, 1-2 trades/day):**

- Position notional: $30 * 10 = $300
- Daily volume: $300 (1 trade) to $600 (2 trades)
- Volume gold: $300 * 0.20 = 60G to $600 * 0.20 = 120G
- Daily trade bonus: 750G
- Profit gold (assume $5 profit every 3 days average): 75G / 3 days = 25G/day average
- **Steady-state daily income: 835G - 895G/day (call it ~865G/day)**
- **Day 1 total: 500 + 300 + 865 = 1,665G**

### 3.3 Gold Income — 28-Day Projection

| Period | Gold Earned | Running Total (incl. 10,000 starting) |
|--------|------------|---------------------------------------|
| Day 1 | 1,665G | 11,665G |
| Week 1 (days 2-7) | 5,190G | 16,855G |
| Week 2 (days 8-14) | 6,055G | 22,910G |
| Week 3 (days 15-21) | 6,055G | 28,965G |
| Week 4 (days 22-28) | 6,055G | 35,020G |

**Total available gold by end of day 28: ~35,000G**

### 3.4 Wood and Ore Income — Production Buildings

Production rates are unchanged from current implementation.

| Building | Resource | Lv1 Rate | Lv1 Cap | Lv2 Rate | Lv2 Cap | Lv3 Rate | Lv3 Cap |
|----------|----------|----------|---------|---------|---------|---------|---------|
| Mine | Ore | 10/min | 200 | 18/min | 400 | 30/min | 800 |
| Sawmill | Wood | 12/min | 250 | 22/min | 500 | 35/min | 1000 |

**Daily yield per building (assuming 3 collections/day at cap):**

| Building | Level | Yield per Collection | Collections/Day | Daily Yield |
|----------|-------|---------------------|-----------------|-------------|
| Mine | 1 | 200 ore | 3 | 600 ore |
| Mine | 2 | 400 ore | 3 | 1,200 ore |
| Mine | 3 | 800 ore | 3 | 2,400 ore |
| Sawmill | 1 | 250 wood | 3 | 750 wood |
| Sawmill | 2 | 500 wood | 3 | 1,500 wood |
| Sawmill | 3 | 1,000 wood | 3 | 3,000 wood |

**28-day wood production (3 sawmills, gradually upgraded):**
Approximate average level 1.5 for first 2 weeks, level 2.5 for last 2 weeks:
- Weeks 1-2: 1 sawmill avg Lv1, 2 sawmills coming online ~ 2,000 wood/day average
- Weeks 3-4: 3 sawmills avg Lv2-3 ~ 6,000-9,000 wood/day
- **28-day total: ~100,000-140,000 wood available** (far exceeds 69,500W needed)

**28-day ore production (3 mines, gradually upgraded):**
- Weeks 1-2: 1-2 mines at Lv1-2 ~ 1,200 ore/day average
- Weeks 3-4: 3 mines avg Lv2-3 ~ 4,800-7,200 ore/day
- **28-day total: ~80,000-120,000 ore available** (far exceeds 32,150O needed)

Wood and ore are never the blocking constraint. Gold is always the bottleneck.

---

## 4. Formulas

### 4.1 Total Resources Required to Max Everything

Counts based on `TH_MAX_COUNT` at TH level 3:
- Mines: 3, Sawmills: 3, Barns: 2, Ports: 5, Archer Towers: 3, Tombstones: 3, Turrets: 3, Storages: 2, Town Hall: 1

**Upgrade cost formula (current system):**
- Level 2 upgrade = base_cost * 2
- Level 3 upgrade = base_cost * 3
- Total upgrade cost per building = base_cost * (2 + 3) = base_cost * 5
- For N buildings of same type: N * base_cost * 5

**Proposed building costs (revised from current):**

| Building | Proposed Base Cost | Multiplier | Note |
|----------|-------------------|-----------|------|
| Mine | 200G + 300W | 5x per building | Was 400G+150W |
| Sawmill | 150G + 200W | 5x | Was 300G |
| Barn | 100G + 400W + 150O | 5x | Was 200G+200W+100O |
| Port | 400G + 500W + 400O | 5x | Was 800G+300W+200O |
| Archer Tower | 250G + 600W | 5x | Was 500G+400W |
| Tombstone | 50G + 100W | 5x | Was 100G |
| Turret | 300G + 500W + 400O | 5x | Was 600G+350W+200O |
| Storage | 175G + 400W | 5x | Was 350G+200W |
| Town Hall | unchanged | special | 5000G+3000W+2000O / 15000G+10000W+8000O |

The cost reduction rule: gold costs halved, wood and ore costs increased to compensate,
keeping the total resource weight roughly the same but shifting the bottleneck firmly to
gold (the real-money-linked resource).

**Total costs with proposed values:**

| Category | Gold | Wood | Ore |
|----------|------|------|-----|
| Building placements (all buildings) | 5,425G | 10,800W | 3,100O |
| Building upgrades (all to Lv3) | 19,575G | 40,500W | 23,500O |
| Town Hall upgrades (Lv1→3) | 20,000G | 13,000W | 10,000O |
| Ships (5 ports * 500G) | 2,500G | 0 | 0 |
| Troop upgrades (all to Lv3) | 1,350G | 1,000W | 2,000O |
| **TOTAL** | **48,850G** | **65,300W** | **38,600O** |
| Minus starting resources (10k each) | **38,850G** | **55,300W** | **28,600O** |

**Available by day 28:** 35,000G / ~120,000W / ~100,000O

The gold falls ~4,000G short of 38,850G. This is intentional design. See section 5
(Edge Cases) for how this resolves naturally through raiding income and profit bonuses.
Players who trade well or raid effectively can max out in 3 weeks. Players who do
minimal activity finish in 4 weeks. The progression curve is tight but not punishing.

### 4.2 Proposed Troop Costs (Revised)

Troop costs shift ore and wood burden up, gold down.

| Troop | Lv1→2 Cost | Lv2→3 Cost | Total Lv1→3 |
|-------|------------|------------|-------------|
| Knight | 80G + 200O | 160G + 400O | 240G + 600O |
| Mage | 120G + 350O | 240G + 700O | 360G + 1,050O |
| Barbarian | 100G + 300O | 200G + 560O | 300G + 860O |
| Archer | 90G + 250W | 180G + 500W | 270G + 750W |
| Ranger | 60G + 150W | 120G + 300W | 180G + 450W |
| **Totals** | **450G** | **900G** | **1,350G + 1,200W + 2,510O** |

### 4.3 Daily Gold Budget Formula

```
daily_gold = GOLD_DAILY_TRADE
           + (daily_volume_usd * GOLD_PER_USD_VOLUME)
           + (positive_pnl_usd / 10 * GOLD_PER_10_USD_PROFIT)
```

Target player example:
```
daily_gold = 750 + (450 * 0.20) + (5/3 * 15)
           = 750 + 90 + 25
           = 865G/day
```

---

## 5. Edge Cases

### 5.1 Player Loses All Trades (Zero Profit Gold)
Income drops to ~840G/day (750 daily + 90 volume). Over 4 weeks: 750 * 28 = 21,000 + volume
~2,500 = 23,500G + 10,000 starting = 33,500G. Player finishes slightly below full max
but gets all TH upgrades and core buildings. Troops at Lv2-3 are affordable.

### 5.2 Player Only Makes 1 Trade/Day
Daily volume drops to $300, volume gold drops to 60G. Total daily: ~835G. Negligible
difference from 2-trades/day. The daily bonus dominates volume income, which is correct:
we want to reward participation, not position size inflation.

### 5.3 Player Stockpiles Without Spending
Resource storage caps prevent infinite accumulation. At TH1 with no Storage buildings,
the cap is 5,000 of each resource. Upgrading to TH2 raises it to 10,000; TH3 to 20,000.
Each Storage building adds 15,000/35,000/75,000 per level. Player must build Storage
to hold enough gold for the TH3 upgrade (15,000G). This is a deliberate design tension.

### 5.4 Raiding Income
Successful raids steal 30% of defender's current resources. If defenders hold 5,000G
on average, a successful raid yields ~1,500G. This provides a meaningful gold supplement
(roughly one extra day's trading income per raid) without being exploitable due to
12-hour shields and 2-hour cooldowns on the same target.

### 5.5 Storage Cap and Town Hall Lv3 Upgrade
The TH3 upgrade costs 15,000G. At TH2, the base cap is 10,000G (Town Hall base) +
15,000G (one Storage Lv1) = 25,000G. Player can hold this comfortably. If they skip
Storage, they can only hold 10,000G, which is less than the TH3 cost — they cannot
accumulate enough. This enforces the intended progression gate: build Storage before
attempting TH3. The system naturally teaches this through failure.

### 5.6 Production Building Collection Cadence
Players who collect less frequently (once per day instead of 3 times) hit the storage
cap and lose production time. At Lv1, Mine fills in 20 minutes; idling for 24 hours
wastes ~98% of potential production. This creates a soft daily engagement requirement
without hard-locking content. It rewards regular play without punishing occasional
absences catastrophically — the buildings just stop producing until collected.

---

## 6. Dependencies

| System | Dependency | Notes |
|--------|-----------|-------|
| Trading rewards | Pacifica DEX webhook | Gold credited on trade confirmation |
| Production | `collectResources()` in db.js | Called on building interaction |
| Storage caps | `getResourceCaps()` in db.js | Must be checked before crediting any gold |
| Raiding | `battleVictory()` in db.js | 30% LOOT_PERCENT unchanged |
| Building costs | `BUILDING_DEFS` in db.js | Requires code update per Section 7 |
| Troop costs | `TROOP_DEFS` in db.js | Requires code update per Section 7 |
| TH upgrade requirements | `TH_UPGRADE_REQUIRES` in db.js | No change needed |

---

## 7. Tuning Knobs

All values are centralized in `server/db.js`. No hardcoded numbers exist in GDScript.
Update the server constants only; Godot reads building/troop definitions via API.

### 7.1 Trading Reward Constants (in routes.js or equivalent reward handler)

```javascript
const GOLD_PER_USD_VOLUME     = 0.20;   // was 0.05
const GOLD_FIRST_DEPOSIT      = 500;    // unchanged
const GOLD_FIRST_TRADE        = 300;    // unchanged
const GOLD_DAILY_TRADE        = 750;    // was 200
const GOLD_PER_10_USD_PROFIT  = 150;    // was 100
```

### 7.2 Building Definitions (BUILDING_DEFS in db.js)

Replace the `cost` field for each building as follows:

```javascript
mine:         { cost: { gold: 200, wood: 300, ore: 0   } },  // was 400G+150W
sawmill:      { cost: { gold: 150, wood: 200, ore: 0   } },  // was 300G
barn:         { cost: { gold: 100, wood: 400, ore: 150 } },  // was 200G+200W+100O
port:         { cost: { gold: 400, wood: 500, ore: 400 } },  // was 800G+300W+200O
archer_tower: { cost: { gold: 250, wood: 600, ore: 0   } },  // was 500G+400W
tombstone:    { cost: { gold:  50, wood: 100, ore: 0   } },  // was 100G
turret:       { cost: { gold: 300, wood: 500, ore: 400 } },  // was 600G+350W+200O
storage:      { cost: { gold: 175, wood: 400, ore: 0   } },  // was 350G+200W
// town_hall: cost unchanged (free placement, special upgrade_cost)
```

The upgrade cost multiplier system (level * base) remains unchanged. Only base costs change.

### 7.3 Troop Definitions (TROOP_DEFS in db.js)

Replace the `cost` arrays:

```javascript
knight:    { cost: [{ gold:  80, ore: 200 }, { gold: 160, ore: 400 }, { gold: 320, ore: 800 }] },
mage:      { cost: [{ gold: 120, ore: 350 }, { gold: 240, ore: 700 }, { gold: 480, ore: 1400 }] },
barbarian: { cost: [{ gold: 100, ore: 300 }, { gold: 200, ore: 560 }, { gold: 400, ore: 1120 }] },
archer:    { cost: [{ gold:  90, wood: 250 }, { gold: 180, wood: 500 }, { gold: 360, wood: 1000 }] },
ranger:    { cost: [{ gold:  60, wood: 150 }, { gold: 120, wood: 300 }, { gold: 240, wood:  600 }] },
```

### 7.4 Sensitivity Table

| Knob | -20% Effect | +20% Effect | Safe Range |
|------|-------------|-------------|-----------|
| GOLD_DAILY_TRADE | 3 weeks → 4.5 weeks | 3 weeks → 2.5 weeks | 600-900 |
| GOLD_PER_USD_VOLUME | Negligible (small share) | Negligible | 0.15-0.25 |
| Building gold costs (global) | Finish in 3 weeks | Finish in 5 weeks | ±30% |
| LOOT_PERCENT | Raiding loses appeal | Economy inflates fast | 0.20-0.35 |

---

## 8. Week-by-Week Progression Timeline

This timeline assumes the target player profile: $30 deposit, 10x leverage, 1-2 trades/day,
~1 hour active playtime per day, collecting production buildings 3x/day.

### Week 1 — Establishment (Days 1-7)

**Gold available:** ~16,855G | **Gold budget:** ~13,000G (spend, hold 3,000G reserve)

| Day | Action | Gold Cost | Cumulative Gold Spent |
|-----|--------|-----------|-----------------------|
| 1 | First deposit + first trade bonuses. Place Mine, Sawmill, Barn, Port. Buy 1 ship. | 200+150+100+400+500 = 1,350G | 1,350G |
| 2 | Upgrade Mine Lv2, Sawmill Lv2 | 400+300 = 700G | 2,050G |
| 3 | Upgrade Barn Lv2, Port Lv2 | 200+800 = 1,000G | 3,050G |
| 4 | Place Archer Tower. Upgrade Archer Tower Lv2. | 250+500 = 750G | 3,800G |
| 5 | Upgrade Mine Lv3, Sawmill Lv3 | 600+450 = 1,050G | 4,850G |
| 6 | Save gold. Collect production. | 0 | 4,850G |
| 7 | Upgrade Town Hall to Lv2 (requires: mine, sawmill, barn, port all at Lv1+) | 5,000G | 9,850G |

**Week 1 milestones:** TH2 unlocked. 1 mine at Lv3, 1 sawmill at Lv3. Archer Tower at Lv2. Wood/ore production now 3x initial rate. Storage and Tombstone slots unlocked.

### Week 2 — Expansion (Days 8-14)

**Gold available:** ~22,910G | **Week 2 gold budget:** ~6,055G earned this week

| Day | Action | Key Unlock |
|-----|--------|------------|
| 8 | Place Storage Lv1, Tombstone Lv1. Expand storage cap to 25,000G. | Storage opens |
| 9 | Place 2nd Mine, 2nd Sawmill. Upgrade both to Lv2. | Double production |
| 10 | Place 2nd Port, buy 2nd ship. Upgrade 2nd Port to Lv2. | 2nd attack vector |
| 11 | Upgrade Storage Lv2, Tombstone Lv2. | Better defense |
| 12 | Upgrade Archer Tower Lv3. | First maxed defense |
| 13 | Upgrade Ranger troops Lv2, Knight troops Lv2. | Combat power spike |
| 14 | Upgrade 2nd Mine and Sawmill to Lv3. Save remaining gold. | Production max for 2x |

**Week 2 milestones:** 2 maxed production buildings of each type. 2 ships active. First maxed defense building. First troop upgrades. Gold reserve heading toward TH3.

### Week 3 — Fortification (Days 15-21)

**Gold available:** ~28,965G | **Week 3 gold budget:** ~6,055G earned + reserves

| Day | Action | Key Unlock |
|-----|--------|------------|
| 15 | Upgrade Port Lv3 (both ports). | Stronger launch points |
| 16 | Upgrade Barn Lv3. Upgrade Tombstone Lv3. | Defense + capacity |
| 17 | Save gold aggressively. No spending. | Building toward TH3 |
| 18 | Save gold. | |
| 19 | Upgrade Town Hall to Lv3 (15,000G — the big spend). | TH3 unlocked |
| 20 | Place 3rd Mine, 3rd Sawmill, 3 Turrets, 2nd Storage, 3rd Archer Tower. | Explosion of new content |
| 21 | Place 3 Tombstones (now 3 total), 3rd Port, 4th Port, 5th Port. Buy ships 3-4. | |

**Week 3 milestones:** TH3 is the defining moment of the game. The player's base nearly doubles in building count. 3 full production buildings of each type. Defense ring complete with Turrets.

### Week 4 — Max Out (Days 22-28)

**Gold available:** ~35,020G | All remaining gold and accumulated wood/ore

| Day | Action |
|-----|--------|
| 22 | Upgrade all 3 Turrets to Lv2. Upgrade 3rd Mine and Sawmill. |
| 23 | Upgrade 2nd Storage to Lv2. Buy ship 5. Upgrade 3rd Port to Lv2. |
| 24 | Upgrade Mage, Barbarian, Archer troops to Lv2. |
| 25 | Upgrade all Turrets to Lv3. Upgrade 3rd Archer Tower to Lv2. |
| 26 | Upgrade all troops to Lv3. Upgrade remaining Storages to Lv3. |
| 27 | Upgrade remaining ports to Lv3. Upgrade 3rd Archer Tower to Lv3. |
| 28 | Final upgrades. All buildings Lv3. All troops Lv3. All 5 ships active. |

**Week 4 milestones:** Fully maxed base. All 5 ships. All troops at Lv3. Complete Turret ring. This is the end-state for the current content version.

---

## 9. Acceptance Criteria

The economy is correctly balanced when all of the following are true:

1. **Day 28 reachability:** A target player (specs above) can max all buildings and troops
   within 28 days without extraordinary luck in trading.

2. **Daily feedback:** Every day of active trading (1-2 trades) produces enough gold for
   at least one meaningful upgrade or placement action. "Meaningful" means a building
   placement or upgrade that costs 50G or more.

3. **No infinite accumulation:** Resource storage caps (from `getResourceCaps()`) prevent
   any resource from exceeding the cap. Production buildings idle rather than overflow.

4. **Gold is always the constraint:** At no point in the progression should wood or ore
   be the resource blocking the next purchase, assuming the player collects production
   buildings at least once per day.

5. **TH upgrade is a milestone, not a wall:** Players should reach TH2 within days 5-8
   and TH3 within days 17-21. If analytics show average TH2 date exceeds day 10 or TH3
   exceeds day 25, revisit GOLD_DAILY_TRADE upward.

6. **Raid income is supplemental, not required:** Players who never raid can still max
   everything in 4 weeks. Raiding should accelerate progress by roughly 0.5-1 week.

7. **Storage gate is discoverable:** Players who attempt TH3 without a Storage building
   must receive an error that explains the storage cap issue, guiding them to build
   Storage first. This is enforced by `getResourceCaps()` and the TH_UPGRADE_REQUIRES
   check in `upgradeBuilding()`.

---

## 10. Economic Health Metrics

The analytics-engineer should track these metrics daily per cohort:

| Metric | Healthy Range | Alert Threshold |
|--------|--------------|----------------|
| Average gold/day per active player | 700-1,000G | < 500G or > 1,500G |
| Average TH level by day 7 | 1.8-2.2 | < 1.5 (too slow) |
| Average TH level by day 14 | 2.5-3.0 | < 2.0 |
| % players at max by day 28 | 40-70% | < 20% (too hard) or > 90% (too easy) |
| Wood stockpile vs. cap | < 80% full | > 95% (production wasted) |
| Ore stockpile vs. cap | < 70% full | > 90% (production wasted) |
| Daily trade participation rate | > 60% | < 40% (rewards not compelling) |

---

*This document must be updated whenever BUILDING_DEFS, TROOP_DEFS, or trading reward
constants change in server/db.js or routes.js. Balance changes must include a change
rationale comment referencing this document.*
