# Task 29 — Worn belts

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-07-01 · Replaced the plain waist cylinder (which overlapped the chest
  band) with **five procedural belt archetypes** (plain leather **strap** + square buckle, banded
  iron **plated** war-belt w/ plate buckle + riveted studs, overlapping dragonscale **scaled** belt
  w/ fanged clasp + side tasset, leather **pouched** belt w/ round buckle + hanging pouches, ornate
  gold-trimmed steel **warbelt** w/ gem-set boss buckle + tasset) chosen per item by a pure, tested
  `beltArchetype(def)` selector (every `belt` def → a valid `{archetype, material}` via new `belt:{}`
  metadata, else inferred from set/rarity — total + deterministic, coordinated with chest/pauldrons/
  gloves/helmet so an Ironguard/Dragonscale suit reads as one). `_buildBelt` pre-builds all five
  groups **once** under a single waist anchor; `refreshWornGear` reveals the equipped one (rarity
  recolour/sheen via `paint()`, set motif), seated at lean-y 0.72 so the band tucks **below** the
  chest envelope (≈ lean-y 0.80) without z-fighting it, parented to the torso (never the legs) so the
  stride swings the legs beneath it, tier-gated via `wornDetailFor().belt` (low tier still omits the
  belt entirely — a clean omission), never reallocates a mesh (no leak). New Task 29 tests in
  `test/items.test.js` (+9; suite 55 → 64, Vitest 402 → 411) incl. a **below-chest + clears-legs
  invariant** (sampled across the stride) + a real-browser `test/e2e/worn-belts.spec.js`
  screenshotting three distinct belts worn below the chest. No `SAVE_VERSION` change (belts are
  transient visuals).
- **Depends on:** Task 12 (the `belt` slot), Task 3, Task 4. Shared bar above.
- **Goal.** The belt is a **plain cylinder at the waist** (`_buildWornGear`
  ~1197-1203, high-tier only) that **overlaps the chest band**. Make it a real belt.
- **Scope (build this):**
  - **Per-item belt shapes.** Strap + buckle (+ pouches/plates by set/material), built
    from layered primitives, varied by material + set.
  - **Finish + fit.** Rarity/set finish; sit at the waist **below** the chest piece
    (Task 26) without intersecting it or the legs through the stride; keep the clean
    low-tier omission (`wornDetailFor`).
- **Acceptance criteria:**
  - The belt reads as a belt (strap + buckle) distinct by material/set; no overlap with
    the chest or legs; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot.
- **Tests to add:** the **belt archetype selector** pure + tested; an invariant that the
  belt band sits below the chest envelope; build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` belt builder, `wornDetailFor`),
  `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); integration (Task 35).
- **Hints:** coordinate the waist height with the chest piece so the two never z-fight.

