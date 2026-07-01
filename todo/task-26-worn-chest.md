# Task 26 — Worn chest pieces: layered breastplates & robes per item

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-07-01 · Replaced the single z-scaled chest cylinder with **five procedural
  chest archetypes** (laced leather **vest**, segmented iron **cuirass** w/ lames + gorget, ornate
  aegis **plate** w/ sculpted pectorals + emblem + gold hem, overlapping **dragonscale** shell + sternum
  gem, flowing cloth **robe**) chosen per item by a pure, tested `chestArchetype(def)` selector (every
  `breastplate` def → a valid `{archetype, material}` via new `chest:{}` metadata, else inferred from
  set/rarity — total + deterministic, coordinated with `helmetArchetype` so an Ironguard/Dragonscale
  suit reads as one). `_buildChests` pre-builds all five groups **once** under the torso anchor;
  `refreshWornGear` (now via a shared `applyArch` helper) reveals the equipped one (rarity recolour/
  sheen via `paint()`, set motif), seats it clear of the neck/arms/belt/pauldrons, tier-gates the finer
  straps/lames (`wornDetailFor().chestDetail`), and never reallocates a mesh (no leak). New Task 26
  tests in `test/items.test.js` (+9; suite 28 → 37, Vitest 375 → 384) + a real-browser
  `test/e2e/worn-chests.spec.js` screenshotting four distinct chests worn. No `SAVE_VERSION` change
  (chest pieces are transient visuals).
- **Depends on:** Task 12 (the `breastplate` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Every chest is the **same z-scaled cylinder** (`_buildWornGear`
  ~1191-1195) tinted by rarity. Make each chest item a distinct, layered torso piece —
  the centrepiece an MMORPG armour set reads from.
- **Scope (build this):**
  - **Per-item chest archetypes.** Leather vest, segmented iron cuirass, ornate plate
    (aegis), dragonscale, cloth robe — built from layered primitives (chest shell +
    straps/trim/lames), varied by material + **set** (Ironguard/Dragonscale carry their
    motif). Map each `breastplate` item to an archetype.
  - **Finish + fit.** Rarity recolour/sheen + set motif; seat on the torso (`lean`)
    without intersecting the **belt** (Task 29), the **pauldrons** (Task 27), the neck
    or the arms; tier-gate the layering.
- **Acceptance criteria:**
  - Chest pieces read distinctly by type/material/set with visible rarity/set finish;
    no intersection with belt/pauldrons/arms/neck in idle/walk/attack.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot
    of two distinct chests worn.
- **Tests to add:** the **chest archetype selector** is pure + tested; build/dispose
  no-leak; a Playwright screenshot.
- **Files:** `src/game.js` (`_buildWornGear` chest builder), `src/data/items.js`
  (archetype/material metadata), `test/items.test.js` (+ screenshot), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); cross-part integration
  (Task 35).
- **Hints:** the chest is the visual anchor of a set — coordinate its motif with the
  helmet/pauldrons so a full set reads as one suit.

