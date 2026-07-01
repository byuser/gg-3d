# Task 22 — Environment rewrite: stable resource generation + natural road‑edge teleporters

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-25 · Made resource generation **deterministic + persistent** per zone
  (`state.zoneRes` keyed by id; live `ResourceNode`s rebuilt from the record, so re‑entry reuses the
  exact set — no pile‑up) and **time‑gated** (a `dt`‑driven, pause‑correct regrow clock sprouts one
  node per `CONFIG.resourceRegrowSec`, never on entry), with **per‑kind, per‑zone caps**
  (`CONFIG.resourceCaps`) enforced at plan + every regrow path. Population is a **pure function of
  (zone, seed, elapsed time)** via a per‑zone mulberry32 sub‑stream that never disturbs the shared
  `rng()`. Root‑caused the **phantom nodes**: `ResourceNode` had no `dispose()`, so its meshes (built
  after `buildWorld`'s snapshot) leaked across travel — added `dispose()` (frees root + removes the
  interactable). Replaced the floating **portal orbs** with **road‑edge teleporters**: each portal
  lays a road to the map edge (hub exits snap to the existing bridge‑aware crossroads; wild zones get
  a fresh radial road) ending in a themed gateway, and walking onto the end‑of‑road band fires
  `ZoneManager.travel` (can't be skirted — the fence blocks going around); fade‑veil +
  `placePlayerAtArrival` (now lands on the incoming road) + the `zones.js` graph are intact; the
  minimap/world map draw road‑edge exits. `SAVE_VERSION` **12 → 13** (per‑zone resource state
  serializes; pre‑v13 saves default to `{}` and re‑plan from the seed). New `test/environment22.test.js`
  (16 cases; Vitest 247 → 263). No new user‑facing strings.
- **Depends on:** the world/zone systems (`buildWorld`, `setupZoneContent`,
  `ZoneManager`, `ResourceNode`, `populateAdventure`/`populateWildResources`,
  `CONFIG.maxResourceNodes`, the portal layout + hub `roadLanes`). None else.
- **Goal.** Two environment problems break immersion. **(a) Resource generation is
  unstable:** changing location and returning **re‑scatters a fresh batch of
  resources** that **pile up and aren't collectable**, instead of a stable,
  time‑based ecology. **(b) Inter‑zone travel uses floating portal orbs** on circles
  on the ground, which feels gamey. Rewrite both: make resource population
  **deterministic and time‑gated** with a strict **per‑type, per‑zone cap**, and
  move travel onto the **roads that run to the map edge** so walking off the end of a
  road **naturally teleports** you to the next land.
- **Scope (build this):**
  - **Stable, time‑based resource generation (no pile‑ups, no phantom nodes).**
    Rework population so a zone's resource set is **deterministic and persistent
    across re‑entry**: re‑entering a zone must **not** spawn a new batch on top of
    the old one. Persist/restore per‑zone resource state (positions + depletion +
    respawn timers) so the **count is stable** when you leave and come back, and
    fix the **non‑collectable "phantom" nodes** (root‑cause the registration/teardown
    interaction so every visible node is harvestable). **New resources appear only
    after in‑game time passes** (a believable regrowth cadence), not on every
    entry. **Double‑check and enforce a max count *per resource type, per zone*** at
    every spawn/respawn/regrow path (extend `CONFIG.maxResourceNodes` with per‑kind
    caps) so no type ever exceeds its limit — verified deterministically over
    seeded layouts and repeated travel.
  - **Road‑edge teleporters (replace the ground‑circle orbs).** Move the inter‑zone
    transition from the floating **portal orbs** (`"portOrb"+to`, the 3.6 m ground
    triggers) onto the **roads that lead to the edge of the map** (the hub
    `roadLanes` / road meshes that currently "lead nowhere"). Extend those roads to
    the world boundary and make **walking onto the road's end‑of‑map segment trigger
    travel** — so movement between lands reads as **walking down a road to the next
    place**, not stepping into a magic circle. Keep the **fade‑veil transition**,
    arrival placement (`placePlayerAtArrival` onto the *incoming* road), and the
    zone graph (`zones.js` portals) intact — only the **trigger geometry + visual**
    change (a road heading off‑map per portal destination; remove/repurpose the orb
    meshes). Make the trigger reliable (you can't skirt around it) and bidirectional.
  - **Disposal & determinism.** All new/relocated meshes (extended roads, edge
    markers) **dispose on teardown**; all randomness via seeded `rng()`; the regrow
    clock is time‑based and **pauses with the game**. Update the **minimap/map**
    portal rendering (Task 13/20) to show road‑edge exits instead of orbs.
  - **Persistence.** Per‑zone resource state (so counts stay stable across travel
    and reload) serializes/restores; **bump `SAVE_VERSION`** if the schema grows;
    migrate older saves sanely.
- **Acceptance criteria:**
  - Leaving and returning to a zone **does not** add resources — the live count is
    **stable** across travel and reload; **every visible node is harvestable** (the
    phantom‑node bug is gone); new nodes appear **only after in‑game time**.
  - Each resource **type** is **capped per zone** and never exceeds it across
    spawn/respawn/regrow/travel/reload — proven by a deterministic seeded test.
  - Inter‑zone travel happens by **walking a road to the map edge** (no ground‑circle
    orbs); the fade transition + correct arrival placement still work, both
    directions; the trigger can't be bypassed.
  - All new meshes dispose on teardown (no leaks across travel); regrow is
    time‑based + pause‑correct; headless‑safe; pipeline green; per‑zone resource
    state round‑trips through save/load (old saves migrate).
  - The minimap/world map reflect **road‑edge exits**, not orbs.
- **Tests to add:** a **stability invariant** — re‑entering a zone N times keeps the
  resource count constant and within per‑type caps (deterministic seed); a
  **per‑type cap** test at spawn/respawn/regrow; a **regrowth‑timing** test (no new
  node before the cadence elapses; one appears after); a **harvestable‑after‑travel**
  regression test (no phantom nodes); a **road‑edge trigger** test (walking onto the
  edge segment fires `ZoneManager.travel` to the right zone, both directions; can't
  be skirted); **save/load round‑trip** of per‑zone resource state + migration;
  teardown disposes the new road/edge meshes (no leak).
- **Files:** `src/game.js` (`populateAdventure`/`populateWildResources` →
  deterministic + time‑gated + per‑type caps, `ResourceNode` regrow/registration,
  per‑zone resource persistence in `serializeGame`/`applySave`, `ZoneManager`
  portal trigger → road‑edge geometry, `buildWorld` road extension + orb removal,
  minimap/map portal rendering, `SAVE_VERSION`), `src/core/config.js`
  (`maxResourceNodes` + per‑kind caps + regrow cadence), `src/data/zones.js`
  (portal/road edge metadata if needed), `test/*`, `README.md`.
- **Out of scope:** redesigning the resource economy or crafting (this is
  generation + travel mechanics, not balance); procedural terrain generation
  beyond placing the road exits; new resource types.
- **Hints:** make population a **pure function of (zone, seed, elapsed time)** so
  re‑entry is reproducible and testable; persist per‑zone node state keyed by zone
  id; reuse the existing fade‑veil + `placePlayerAtArrival` so only the trigger
  geometry changes; snap road exits to the existing `roadLanes` so they line up
  with the bridge‑aware road work from Task 10.

---

