# Task 28 — Worn gloves & gauntlets

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-07-01 · Replaced the plain sphere on each hand with **five procedural
  glove archetypes** (soft leather **glove**, laced leather **bracer**, banded iron **gauntlet** w/
  knuckle plate + finger lames, overlapping dragonscale **scaled** gauntlet w/ cuff spines, ornate
  gold-trimmed steel **warplate** w/ knuckle boss) chosen per item by a pure, tested
  `gloveArchetype(def)` selector (every `gloves` def → a valid `{archetype, material}` via new
  `glov:{}` metadata, else inferred from set/rarity — total + deterministic, coordinated with
  chest/pauldrons/helmet so an Ironguard/Dragonscale suit reads as one). `_buildGloves` pre-builds
  all five groups once **per hand** under the arm pivot (so each rides the hand through the attack
  for free); `refreshWornGear` reveals the equipped pair (rarity recolour/sheen via `paint()`, set
  motif), kept **compact around the wrist** so the wand shaft rises cleanly out of the fist (never
  engulfs the grip), tier-gates the finer finger lames/trims via `wornDetailFor().gloveDetail`, and
  never reallocates a mesh (no leak). New Task 28 tests in `test/items.test.js` (+9; suite 46 → 55,
  Vitest 393 → 402) incl. a **grip-fit invariant** (part centres bounded around the hand + capped
  below the shaft) + a real-browser `test/e2e/worn-gloves.spec.js` screenshotting four distinct
  gloves wrapped around the weapon grip. No `SAVE_VERSION` change (gloves are transient visuals).
- **Depends on:** Task 12 (the `gloves` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Gloves are **plain spheres on the hands** (`_buildWornGear` ~1216-1223).
  Make them read as gloves/gauntlets — the hand piece you see wrapped around the weapon
  grip in an MMORPG.
- **Scope (build this):**
  - **Per-item hand shapes.** Cloth glove, leather bracer, plated gauntlet with a cuff
    — layered primitives (cuff + back-of-hand + finger hint), varied by material + set.
  - **Finish + fit.** Rarity/set finish; follow the hands through the new attacks
    **without engulfing the weapon grip** or detaching from the wrist; tier-gate.
- **Acceptance criteria:**
  - Gloves read as hand armour distinct by type/material/set; track the hands through
    the attack; don't swallow the weapon grip; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot.
- **Tests to add:** the **glove archetype selector** pure + tested; build/dispose
  no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` glove builders), `src/data/items.js`
  (metadata), `test/items.test.js` (+ screenshot), `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); integration (Task 35).
- **Hints:** keep the finger hint subtle so it reads at gameplay distance; coordinate
  the cuff with the chest's sleeve.

