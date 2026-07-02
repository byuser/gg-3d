# Task 35 — Full-loadout fit & clipping integration (no stray textures across all gear + the new attacks)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` 2026-07-02 — Shipped: full-loadout integration pass. Consolidated the
  cross-part placement into two named fit tables (`GRIP_SEAT`, `SWORD_WINDUP_ROLL`) — the
  held weapon now seats outboard/forward so a drawn hilt clears the hip at rest and the
  sword wind-up cocks less across the chest (strike/hit frame unchanged). New
  `test/worngear.test.js` (+21 Vitest) proves the full loadout coexists (weapon-vs-body
  no-penetration across idle/walk/each weapon's wind-up→strike→recover, pauldron/belt/
  necklace/cloak neighbour clearance, refresh shows-exactly-equipped + no stray on swap,
  all-descend-from-root dispose, no-realloc churn, per-tier build) and a Playwright
  full-loadout screenshot matrix (`worn-loadout.spec.js`, desktop + S24 portrait/landscape).
- **Depends on:** the worn-category tasks (25–33) **and** the combat-animation rewrite
  (Task 34) — this is the **final integration pass** that runs after them. Builds on
  the named **fit table** each category task introduces.
- **Goal.** Each category task (25–33) makes its own part look right and fit cleanly in
  isolation; this task verifies the **whole loadout together**. With **every** category
  equipped at once and the **new per-weapon attacks** (Task 34) playing, ensure **no
  part pokes through the body or any other part** — the original "check every visible
  part of the clothing; no stray textures sticking out" — across **all equip
  combinations, all animation states (idle / walk / each weapon's attack / flinch) and
  all quality tiers**, to the layered-armour cleanliness well-reviewed RPGs (Skyrim,
  Monster Hunter, Guild Wars 2) hold their character models to.
- **Scope (build this):**
  - **Cross-part interaction audit.** With a full loadout, check the known
    inter-part interactions at rest and in motion: **cloak vs legs/body**, **pauldrons
    vs chest/neck**, **belt vs chest**, **boots vs legs/ground**, **gloves vs weapon
    grip**, **helmet vs ponytail**, and the **held weapon vs the body** through each
    weapon's attack arc. Re-tune the per-category **fit tables** where two parts
    collide; no part may penetrate another beyond a small tolerance at any frame.
  - **All tiers + all loadouts.** Verify every `wornDetailFor` tier and a representative
    matrix of equipped/empty slot combinations: a part never appears when its slot is
    empty, never leaves a stray mesh after unequip/swap (`refreshWornGear`), and disposes
    cleanly on teardown (no leaks). Confirm a full set (Ironguard/Dragonscale) reads as
    one coherent suit.
  - **Lock it down.** Consolidate/confirm the named fit tables so placement stays
    auditable, and add the regression net below so the clean fit can't silently rot as
    future gear/animations land.
- **Acceptance criteria:**
  - With any mix of gear equipped and **any weapon attacking**, **no worn part or weapon
    clips through Lily's body or another part** in idle / walk / attack / flinch on every
    tier; empty slots show no mesh; unequip/swap leaves no stray mesh; everything disposes
    on teardown (no leaks).
  - Headless-safe; full pipeline green; a real-browser screenshot pass confirms clean fit
    from the gameplay camera for a fully-geared Lily **mid-attack for each weapon class**.
- **Tests to add:** an invariant test that, with a full loadout, each part's bounding
  region stays within tolerance of its anchor and out of its neighbours' envelopes at
  sampled animation phases (idle + each weapon's strike/release frame); `refreshWornGear`
  shows/hides exactly the equipped parts (no stray on unequip/swap); teardown disposes
  all worn + weapon meshes; a Playwright **screenshot matrix** (a full set per weapon
  class, mid-attack) for visual regression.
- **Files:** `src/game.js` (`_buildWornGear` / `refreshWornGear` fit tables across all
  parts, teardown/dispose, the Task 34 attack hookups), a new `test/worngear.test.js`
  (or extend `test/items.test.js`) + a Playwright screenshot spec, `README.md`. No
  `SAVE_VERSION` change (visual only).
- **Out of scope:** introducing new gear *shapes* (that is each category task's job —
  this only makes them coexist); full skeletal skinning/rigging; the item icons (still
  unchanged).
- **Hints:** assert penetration at a few sampled attack/stride phases rather than every
  frame; the cloak, pauldrons and the held weapon are the known offenders — start there;
  keep the per-category fit tables as the single source of placement truth.

