# Task 10 — Fix logical, code & UI bugs (pathing, resource caps, pickup, collision, projectiles, swing) + a deeper test net

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-22 · Made the hub crossroads **bridge-aware** (a road
  meets the river head-on with a real spanning bridge; the other runs alongside it;
  the road mesh / `onRoad` / lampposts / bridge now share one vector convention) —
  seeded test proves **0 road-over-water cells** across 40 layouts (was 40/40).
  Added `CONFIG.maxResourceNodes` enforced at every spawn (live count provably
  bounded across spawn/respawn/travel/reload). Audited + hardened resource pickup
  (defensive `Interactable.distanceTo`; regression-tested via the real interact key,
  post-zone-swap and respawn re-harvest). Built castle parts now register **solid
  collision** (walls/towers/keep) with a **passable gate**, so the player is pushed
  out and **wand bolts splat instead of passing through** (shared obstacle set),
  rebuilt on build + save-restore. The **swing** now lands damage on the **strike
  (impact) frame** — in arc + range, once, aimed from the live position. New
  `test/bugfixes.test.js` suite (14 cases; Vitest 5 → 19). No save-schema change.
- **Depends on:** none. Lighter to land **after Task 9** (smaller modules =
  surgical fixes), but must not wait on it.
- **Goal.** Hunt down and fix the gameplay correctness bugs below — and any
  others surfaced while researching — then expand the **logic, code and UI test**
  coverage so each fix is locked in and can't regress.
- **Scope (fix these specific defects, root‑cause not band‑aid):**
  - **Roads/paths must not cross water without a bridge.** Today the meadow river
    has bridges (`onBridge`/`inRiver`/`clearOfRiver` in `buildWorld`) but road
    generation and the path/portal layout can lay a road *through* open water
    where there is no bridge. Make road routing **bridge‑aware**: a road may only
    cross a river band at a bridge gap (snap crossings to a bridge, or spawn a
    bridge where a road must cross). Audit every zone with water. Verify the
    player never walks a road into water and that `inRiver` blocks correctly along
    the whole crossing.
  - **Cap world resources (no infinite accumulation).** Resource nodes currently
    spawn at fixed per‑zone counts and respawn in place (`populateAdventure`/
    `populateWildResources`/`ResourceNode.respawn`), but there is **no global cap**
    and respawn logic should be audited for any path that can grow node count over
    time (e.g. zone re‑entry, save/load re‑population). Add an explicit
    `CONFIG.maxResourceNodes` (per‑zone and/or global) and enforce it at spawn and
    respawn so the live count can never exceed the cap. Make depletion/respawn feel
    intentional (a believable cooldown, not instant infinite supply).
  - **Fix "can't pick up resources."** Reproduce and root‑cause the interaction
    failure (likely `gatherRange`/`Interactable` registration, the `respawn>0`
    guard, `it.enabled` toggling, or a stale interactable after travel). Ensure
    walking up + pressing the interact key **always** harvests an enabled node,
    and that the prompt accurately reflects availability.
  - **Castle must be solid once built.** Castle parts (`CastleSite`,
    walls/towers/gate) are decorative and **not registered in the `obstacles`
    collision set** used by `moveActor`, so the player walks through them. Register
    each built part as solid collision (walls as segments/boxes, towers as
    circles, gate as a passable opening) and update collision when parts are built
    or restored from save. Make sure monsters respect it too where appropriate.
  - **Projectiles must not pass through the castle (and other solids).** The magic
    wand `Projectile` ignores the castle and likely other scenery. Give
    projectiles **collision against solids/the castle** (stop/impact on hit) so you
    can't shoot through walls. Keep it cheap (reuse the `{x,z,r}` obstacle set).
  - **"The swing must be correct."** Audit the Task 5 `Swing` state machine and the
    melee/ranged/gather hit windows: the attack arc, the active‑frame damage
    window, range/arc of effect, and the visual must line up (no hits landing
    outside the swing, no dead frames, no double‑hits, correct facing). Fix timing
    and hit registration so combat reads true.
  - **Sweep for more.** While in the code, look for adjacent logic/code/UI bugs
    (off‑by‑one in damage windows, stuck interactables after zone travel, UI
    elements that don't re‑localize, NaN/edge cases in `moveActor`, leaks on
    teardown) and fix what you find; list anything deferred.
- **Acceptance criteria:**
  - No road/path leads the player into water except across a bridge, in **every**
    zone; verified by a deterministic test over seeded layouts.
  - Live resource‑node count is provably bounded by the configured cap across
    spawn, respawn, travel and reload.
  - Every enabled resource node is reliably harvestable; the regression that
    blocked pickup is covered by a test.
  - The player and wand bolts **collide with built castle parts** (no walk‑through,
    no shoot‑through); the gate stays passable.
  - The swing's damage window matches its animation/arc/range; tests assert hit
    timing and that out‑of‑arc/out‑of‑range targets are not hit.
  - Headless harness green; **new UI tests** (run the menus/inventory/quest log and
    assert no exceptions) pass.
- **Tests to add:** seeded road‑vs‑water pathing assertions; resource‑cap
  invariants (spawn/respawn/reload); a pickup regression test; collision tests for
  built castle parts (player push‑out + projectile stop); `Swing` hit‑window/arc
  tests; UI smoke for the affected overlays.
- **Files:** `js/game.js` (`buildWorld` road/river gen, `CONFIG`, `populate*`,
  `ResourceNode`, `Interactable`, `CastleSite`, `moveActor`/`obstacles`,
  `Projectile`, `Swing`), `test/harness.js` (+ UI tests), `index.html`/`css` (if a
  prompt/marker needs fixing, bump `?v=`), `README.md`.
- **Out of scope:** redesigning the resource economy or rebuilding combat from
  scratch — these are **fixes**, not new systems.

