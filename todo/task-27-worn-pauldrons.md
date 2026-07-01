# Task 27 — Worn pauldrons: shoulder armour that sits on the shoulder (not in the chest)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-07-01 · Replaced the plain sphere on each arm with **five procedural
  pauldron archetypes** (soft leather **cap**, banded iron **plated** cap w/ lames, overlapping
  **dragonscale** **spiked** cap w/ swept spines, trimmed **ornate** plate, flared **winged**
  great-pauldron) chosen per item by a pure, tested `pauldronArchetype(def)` selector (every
  `pauldrons` def → a valid `{archetype, material}` via new `paul:{}` metadata, else inferred from
  set/rarity — total + deterministic, coordinated with chest/helmet so an Ironguard/Dragonscale suit
  reads as one). **Fixed the inward clip at the source**: each shoulder now rides its own pivot **on
  the torso** (not the arm), seated just outside the torso; `_animatePauldrons()` drives only the
  arm's forward/back **pitch** onto it (roll ignored) — since pitch never changes x-extent, the
  shoulder cap's inner reach is **pose-independent** and can never enter the chest. `_buildPauldrons`
  pre-builds all five groups once **per shoulder**; `refreshWornGear` reveals the equipped pair
  (rarity recolour/sheen via `paint()`, set motif), tier-gated via `wornDetailFor().pauldronDetail`
  (low tier still omits pauldrons entirely), never reallocates a mesh (no leak). New Task 27 tests in
  `test/items.test.js` (+9; suite 37 → 46, Vitest 384 → 393) incl. a **shoulder-fit invariant** +
  a real-browser `test/e2e/worn-pauldrons.spec.js` screenshotting four distinct pauldrons worn
  mid-attack (no chest penetration). No `SAVE_VERSION` change (pauldrons are transient visuals).
- **Depends on:** Task 12 (the `pauldrons` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Pauldrons are **plain spheres on `armL`/`armR`** (`_buildWornGear`
  ~1205-1214, scale 1.05/0.7/1.05) that **clip inward into the torso/chest**. Make them
  real shoulder pieces seated **on** the shoulder.
- **Scope (build this):**
  - **Per-item shoulder shapes.** Rounded caps, layered lames, spiked/trimmed by set —
    built from layered primitives, varied by material + set; map each `pauldrons` item
    to an archetype.
  - **Finish + fit.** Rarity/set finish; re-anchor so each pauldron sits on the
    shoulder joint and rotates with `armL`/`armR` through the attack **without diving
    into the chest** or the neck. Tier-gate (currently high-only — keep a clean
    low-tier omission).
- **Acceptance criteria:**
  - Pauldrons sit on the shoulders (no inward clip into torso/chest) through idle/walk/
    attack; distinct by type/material/set; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot
    mid-attack confirms no chest penetration.
- **Tests to add:** the **pauldron archetype selector** pure + tested; an invariant that
  the shoulder mesh stays outside the torso envelope at sampled attack phases;
  build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` pauldron builders + anchors,
  `wornDetailFor`), `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot),
  `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); full-loadout integration
  (Task 35).
- **Hints:** the inward clip is the known offender — fix the anchor + scale at the
  source; reuse the chest's set motif so shoulders match the cuirass.

