# Task 30 — Worn boots

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` 2026-07-01 — Shipped: per-item boot archetypes (shoe / boot / greave /
  sabaton / warboot) built from layered primitives (shaft + foot/vamp + sole/cuff), anchored at the
  foot so they stride with the feet without clipping the leg or ground; pure `bootArchetype(def)`
  selector, tier-gated trims, no mesh reallocation on equip; Vitest on-leg/no-ground-clip stride
  invariant + Playwright mid-stride screenshot spec. No `SAVE_VERSION` change.
- **Depends on:** Task 12 (the `boots` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Boots are **plain cylinders on the legs** (`_buildWornGear` ~1225-1232,
  over the existing feet at y ≈ -0.62) that can intersect the legs/ground in the
  stride. Make them real boots.
- **Scope (build this):**
  - **Per-item boot shapes.** Soft shoe, leather boot with a cuff, plated greave +
    sabaton — layered primitives (shaft + foot + sole/cuff), varied by material + set.
  - **Finish + fit.** Rarity/set finish; hug the shins and sit on the existing feet so
    they **move with the stride without clipping the leg or punching through the
    ground**; tier-gate.
- **Acceptance criteria:**
  - Boots read distinctly by type/material/set; hug the legs through the full stride
    with no leg/ground penetration; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot
    mid-stride.
- **Tests to add:** the **boot archetype selector** pure + tested; an invariant that the
  boot stays on the leg envelope (no ground clip) at sampled stride phases;
  build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` boot builders + leg anchors),
  `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); integration (Task 35).
- **Hints:** anchor to the foot, not the shin midpoint, so the boot tracks the leg's
  bottom through the stride.

