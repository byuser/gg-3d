# Task 5 — More + higher‑quality animation (actions + environment)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-22 · Shipped a tier‑gated, feature‑detected animation pass. A new
  pure, frame‑rate‑independent **`Swing`** state machine gives every action a readable
  **anticipation → impact → recovery** arc (melee arc / ranged thrust / a `gather` chop hooked into
  `ResourceNode.harvest`); damage now triggers a **flinch** recoil. Both are driven by `player.update`,
  so they **freeze correctly** with the pause menu. Each zone **breathes**: a pure `ambientSpecFor(zone)`
  maps every land to drifting particles (meadow pollen, forest spores, sea mist, peak snow, cavern
  motes, thicket embers) + wandering **butterflies/fireflies**, built by `buildAmbientFX` (BABYLON
  `ParticleSystem` feature‑detected, density gated by a new `Quality` tier `ambient` knob, motion driven
  off the clock so it's frame‑rate independent), wired onto the world and **disposed on teardown**
  (leak‑free — verified by a tracking‑PS smoke). Wind is **gustier** on two offset bands with a new
  per‑zone `theme.wind` strength (windy peaks, sheltered lairs). New harness suite [32] (23 checks;
  harness 309 → 332) covers the Swing transitions/timers + frame‑rate independence + pause‑correctness,
  the flinch/gather triggers, the ambient spec/tier‑gating, and **every zone building + animating +
  disposing** its ambient FX (incl. the no‑`ParticleSystem` fallback). No save‑schema change
  (`SAVE_VERSION` untouched — animation is transient). `index.html` `?v=` bumped to **18**.
- **Depends on:** lighter if done **after Task 3** (animates the better models).
- **Goal.** Add life and weight: richer **action** animation (attacks, hits,
  gather, idle) and more **ambient/environment** motion (trees rustle/bend in
  wind — already started — plus water, grass, particles, critters).
- **Scope (build this):**
  - **Player/monster actions:** windups + follow‑through on attacks, hit/flinch
    reactions, death flourishes, an idle "breathing" pose, a gather/mine motion,
    smoother locomotion blending. The character is **procedural** (built from
    primitives) — extend that, or introduce Babylon **`AnimationGroup`s**; keep
    it headless‑safe.
  - **Environment:** improve wind on foliage (gusts, per‑zone strength — there's
    a `swayers`/wind hook already), animate water ripples/foam, swaying grass,
    drifting ambient particles (pollen/dust/embers/snow per zone), torch/lamp
    flicker, and small critters (butterflies/fireflies) where fitting.
  - Effects must **scale with the quality tier** and **dispose on teardown**.
- **Acceptance criteria:**
  - Combat reads with clear **anticipation → impact → recovery**; idle never
    looks frozen; environment visibly breathes in every zone.
  - All animation is time‑based (uses `dt`/clock), frame‑rate independent, and
    **pauses correctly** with the pause menu / zone transitions.
  - Nothing throws headless; particle/animation systems are feature‑detected and
    cleaned up on travel.
- **Tests to add:** action state machine transitions are testable (e.g. attack
  windup→active→recovery timers); animation updaters are pure/`dt`‑driven and
  run headless; teardown disposes animation/particle resources.
- **Files:** `js/game.js` (`Player`/`Monster`/`Boss` update + `_build`, the wind
  observable in `buildWorld`, a small FX/animation module), `css` (any UI
  motion), `test/harness.js`, `README.md`.

