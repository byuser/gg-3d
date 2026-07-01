# Task 25 — Worn helmets: a distinct, real-looking helm per item (not one rarity-tinted dome)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-07-01 · Replaced the single dome+brim with **five procedural helmet
  archetypes** (soft leather **cap**, open **iron helm** w/ nasal bar + cheek guards + comb, full
  **great-helm** w/ visor slit, horned **dragon helm**, banded great-**crown** w/ gem) chosen per item
  by a pure, tested `helmetArchetype(def)` selector (each `helmet` def → a valid `{archetype, material}`
  via new `helm:{}` metadata, else inferred from set/rarity — total + deterministic). `_buildHelmets`
  pre-builds all five groups **once** under the head anchor; `refreshWornGear` reveals the equipped one
  (rarity recolour/sheen via `paint()`, Ironguard/Dragonscale set motif), seats it on the crown with
  **no face/ponytail clipping**, tier-gates the finer trims (`wornDetailFor().helmDetail`), and never
  reallocates a mesh (no leak). New Task 25 tests in `test/items.test.js` (+7; suite 21 → 28, Vitest
  368 → 375) + a real-browser `test/e2e/worn-helmets.spec.js` screenshotting three+ distinct helmets
  worn. No `SAVE_VERSION` change (helmets are transient visuals).
- **Depends on:** Task 12 (the worn-gear system + the `helmet` slot), Task 3
  (models/materials), Task 4 (lighting). Honours the shared bar above (Tasks 25–35).
- **Goal.** Every helmet renders as the **same dome + brim** (`_buildWornGear`
  ~1183-1189), recoloured only by rarity, so a leather cap, an iron helm and a dragon
  helm look identical on the character. Give **each helmet item** a distinct,
  real-looking head piece — the readable, per-item headgear an MMORPG shows.
- **Scope (build this):**
  - **Per-item helmet archetypes.** Replace the single dome+brim with a small set of
    **procedural helmet shapes** chosen by the item def (soft cap, open iron helm with
    nasal/cheek guards, full great-helm with visor slit, horned/winged dragon helm),
    built from layered primitives, **varied by material** (leather/iron/steel/gold/
    dragonscale) and **set** motif. Map each `helmet` item in `ITEM_DB` to an archetype.
  - **Finish + fit.** Keep the rarity recolour/emissive sheen (`paint()`); add the set
    motif where the item belongs to a set. Seat it on the head anchor so it never
    floats or sinks into the face, and the brim/visor never clips the eyes or ponytail
    in idle/walk/attack. Tier-gate (a simpler shell on low tier).
- **Acceptance criteria:**
  - Helmets read differently on the character by type/material/set; rarity + set
    finish is visible; the helm sits correctly with no face/ponytail clipping.
  - Disposed on teardown/unequip (no leaks); headless-safe; tier-gated; full pipeline
    green; a real-browser screenshot confirms three distinct helmets worn.
- **Tests to add:** the **helmet archetype selector** is a pure, tested function
  (every `helmet` def → a valid archetype + material); a build/dispose-no-leak test; a
  Playwright screenshot of three worn helmets.
- **Files:** `src/game.js` (`_buildWornGear` helmet builder → per-archetype,
  `refreshWornGear`), `src/data/items.js` (helmet archetype/material metadata),
  `test/items.test.js` (+ a screenshot spec), `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** the item *icons* (unchanged — this is the worn 3D mesh); other
  slots (own tasks); the attack animation (Task 34); cross-part clipping (Task 35).
- **Hints:** drive the shape from a **small archetype table keyed by item + material**;
  reuse the rarity `paint()` + `wornDetailFor` gates from Task 12.

