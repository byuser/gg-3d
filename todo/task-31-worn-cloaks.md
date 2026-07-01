# Task 31 — Worn cloaks

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` 2026-07-01 — Shipped: five distinct per-item cloak archetypes
  (cape / mantle / scaled / regal / winged) via the pure `cloakArchetype(def)` selector,
  built once under a shared back pivot as tapered segmented cloth drapes; the billow is
  now a pure, dt-driven, frame-rate-independent `cloakBillowStep` clamped so the drape
  only ever trails BEHIND — it reacts to movement/turns without scything through the
  legs/feet. Vitest 420 → 430; new `test/e2e/worn-cloaks.spec.js` screenshot. No
  `SAVE_VERSION` change (visual only).
- **Depends on:** Task 12 (the `cloak` slot), Task 3, Task 4, Task 5 (`_animateCloak`).
  Shared bar above.
- **Goal.** The cloak is a **flat box on a pivot** (`_buildWornGear` ~1234-1242) that
  **swings through the legs** on sharp turns (`_animateCloak` ~1279-1286 rotates the
  pivot ±0.5 rad). Make it a real draping cloak that billows believably.
- **Scope (build this):**
  - **Per-item cloak shapes.** Tapered drape with a neck clasp, optionally **segmented**
    (a few panels) so it reads as cloth, varied by material + set (Dragonscale gets its
    motif). Build from layered primitives; tier-gate the sway/segments (`wornDetailFor`).
  - **Finish + believable billow.** Rarity/set finish; reshape + clamp the pivot/billow
    so the cloak **drapes behind the legs** and reacts to movement/turns **without
    scything through the body or legs** at any frame.
- **Acceptance criteria:**
  - The cloak drapes behind the body and billows with motion **without clipping the
    legs/body** in idle/walk/turn/attack; distinct by material/set; rarity/set finish.
  - Disposed on teardown/unequip; headless-safe; tier-gated (low omits sway); pipeline
    green; screenshot of the cloak mid-turn.
- **Tests to add:** the **billow updater** is pure + `dt`-driven + pause-correct
  (frame-rate independent), and an invariant that the cloak stays behind the leg
  envelope across the sway range; build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` cloak builder, `_animateCloak`,
  `wornDetailFor`), `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot),
  `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** full cloth simulation (keep a cheap, clamped procedural billow);
  icons; other slots; integration (Task 35).
- **Hints:** the leg-clipping swing is the known offender — clamp the pivot and seat the
  drape behind the hips; keep the billow time-based so it pauses with the game.

