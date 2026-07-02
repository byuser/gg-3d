# Task 40 — Travelling vendors in every land: merchant, blacksmith & apothecary reachable outside the hub

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` 2026-07-02 — Un-gated `setupZoneContent` so the merchant,
  blacksmith & apothecary spawn in **every** land: at their permanent hub spots, or a
  deterministic **travelling-camp** cluster beside the entrance road in each wild zone
  (`vendorCampSlots` + `buildVendorCamp`, settled clear of fence/scenery/landing tile).
  Added `dispose()` to `Merchant`/`Blacksmith` (they now rebuild per travel) + camp
  disposal in `teardownZone`; the minimap draws all three (incl. the apothecary) and each
  is a searchable **`vendor`** world-map waypoint that routes to the current land's camp.
  EN+RU strings; no `SAVE_VERSION` change. Covered by `test/travelling-vendors.test.js`
  (+12 Vitest, 503 total).
- **Depends on:** Task 38 (the zone-aware NPC spawn this generalizes —
  `spawnZoneNpcs` / `questGiversForZone` / `landmarkZone`, the `zone` field on
  `LOCATIONS`, `src/game.js` ~4798-4865), Task 12 (the `Shop` / gear economy and
  the `Merchant` / `Blacksmith`), Task 21 (the `Alchemist` apothecary vendor +
  sellable consumables), Task 22 (the road-edge zone entrances the camp is placed
  beside), and Tasks 13/20 (the minimap + world-map markers and the guided
  waypoint). All shipped.
- **Note on Golden Rules:** unchanged — this is a **placement/availability** fix
  over existing systems (no new dependency). The world rebuilds from data and
  disposes on teardown, so **no `SAVE_VERSION` change** is expected.
- **Goal.** The player can trade at the **Travelling Merchant**, upgrade gear at the
  **Blacksmith** and stock potions/ingredients at the **Apothecary** only in the hub,
  **Meadowgate Vale** — in every other land (Whisperwood Grove, Saltmarsh Shore,
  **Frostpeak Pass**, the Sunken Ruins, the thicket) there is **no vendor at all**, so
  a player deep in a wild zone with a full bag, damaged gear and no potions must trek
  all the way back to the hub to buy, sell, repair or restock. **Root cause:** all
  three vendors are created **only inside the `if (zone.home)` branch** of
  `setupZoneContent()` (`src/game.js:4840-4847`), and **only the meadow is
  `home: true`** (`src/data/zones.js` ~30); the `else` branch explicitly nulls
  `state.merchant` / `blacksmith` / `alchemist` (`src/game.js:4855`). Task 38 made
  *quest-givers* zone-aware but **deliberately kept the vendors hub-gated** (its own
  "out of scope"); this task finishes the job. Make all three vendors reachable in
  **every** zone — the within-reach **travelling merchant / caravan** well-reviewed
  open-world RPGs keep near the player wherever they roam. (The user named the
  *merchant* and *blacksmith*; the **apothecary** is included too so vendors aren't
  inconsistently split — leaving it hub-only would re-trigger the same complaint.)
- **Scope (build this):**
  - **A travelling vendors' camp in every wild zone.** Rather than hand-pin each
    vendor per land, model a small, believable **travelling camp** (the merchant's
    caravan + a field forge + an apothecary stall) that appears in each non-hub zone
    at a **consistent, discoverable, data-driven location** — e.g. beside the zone's
    incoming road / arrival point (Task 22's road-edge entrance) so the player passes
    it on the way in. In the **hub**, the merchant/blacksmith/alchemist keep their
    permanent **village plaza / forge / apothecary** positions (don't double them up).
    Keep placement **data-driven** (a per-zone camp anchor derived from the zone/road
    layout, or a small table) so it's deterministic and testable, and clear of water,
    obstacles, monster spawns and the player's exact landing tile.
  - **Spawn all three vendors per zone (un-gate `setupZoneContent`).** Lift
    merchant/blacksmith/alchemist creation out of the `if (zone.home)` branch so they
    instantiate on entering **any** zone (hub positions in the hub, the camp anchor in
    wild zones), registered as interactables at the existing talk range, opening the
    same `Shop.openShop("merchant")` / `Anvil.openAnvil()` / `Shop.openShop("alchemist")`
    UIs. Keep genuinely hub-only systems (the **castle site / dragon**, the hub
    artifact spawns) hub-gated — only the **vendors** become zone-aware.
  - **Give `Merchant` and `Blacksmith` real `dispose()` methods.** Today only
    `Alchemist` has `dispose()` (`src/game.js` ~2569); `Merchant` (~2342-2420) and
    `Blacksmith` (~2428-2490) only `show/hide/update`, and `teardownZone`
    (`src/game.js` ~7279-7300) merely **nulls** them. Because they'll now be **built
    and torn down on every zone travel** (not once per run), add a proper `dispose()`
    to each (remove its interactable + dispose its root/meshes) and call it in
    `teardownZone`, so travelling never leaks vendor meshes or stale interactables.
    Verify leak-free across repeated travel (extend the teardown / scene-tracking test).
  - **Re-register interactables on travel + show vendor markers everywhere.** Confirm
    that after each `ZoneManager` teardown→rebuild the new zone's vendor interactables
    are freshly registered (no stale/missing ones), so walk-up + **E** opens the
    shop/anvil in every land. Make the **minimap** draw all three vendors in every
    zone — it currently renders only the merchant + blacksmith glyphs and **omits the
    alchemist** (`src/game.js:6433-6434`); add the apothecary glyph and ensure all
    three show outside the hub. Add the vendors to the **world map / `MAP_TARGETS`**
    and the **guided waypoint** so "guide me to the merchant / blacksmith / apothecary"
    routes to the camp in the current land (and the nearest one across lands).
  - **Determinism + i18n.** Vendor/camp placement is deterministic (seeded `rng()`
    only if any jitter is used); all camp meshes **dispose on teardown**; any new
    strings (e.g. a "Travelling camp" landmark label) go through `t()` in **EN + RU**
    (Golden Rule 9). The merchant is already localized as "Travelling Merchant" /
    "Странствующий торговец" — lean into that framing.
- **Acceptance criteria:**
  - In **every** land — not just Meadowgate — the player can walk up to and use the
    **Travelling Merchant** (buy/sell), the **Blacksmith** (enhance/repair) and the
    **Apothecary** (potions/ingredients); the hub keeps its permanent vendor
    positions and the wild zones present the travelling camp.
  - Interactables register correctly after **every** zone travel and after a
    **save-load into a non-hub zone**; no vendor appears in the wrong place; the camp
    never lands in water/obstacles/on top of the player.
  - The **minimap and world map show all three vendors** (including the apothecary)
    in the current zone, and the **guided waypoint** can route to any of them; markers
    update on travel.
  - Building + tearing down vendors across repeated travel **leaks nothing**
    (Merchant/Blacksmith now dispose cleanly); headless-safe; full pipeline green;
    works on desktop + mobile (S24 Ultra profile for any new markers/UI).
  - Hub-only systems (castle/dragon, hub artifacts) still behave; no regressions to
    the Task 38 quest-giver placement, the economy, crafting or save/load.
- **Tests to add:** a pure test that the **per-zone camp anchor** resolves to a
  valid, in-bounds, obstacle-free location for every zone (deterministic); a test
  that **all three vendors spawn and register interactables in a wild zone** (the bug
  = zero vendors outside the hub) and that talk/buy/sell/enhance opens the right UI; a
  **save-load into a non-hub zone** still yields usable vendors; a
  **teardown-disposes-vendors** no-leak test (Merchant/Blacksmith/Alchemist all freed
  across travel); a map/minimap test that the vendor markers + waypoint targets
  include all three in every zone; **update `test/npc-zones.test.js`**, which
  currently encodes the **hub-only vendor** assumption (~line 33).
- **Files:** `src/game.js` (`setupZoneContent` un-gate, the per-zone vendor/camp
  placement, `Merchant` / `Blacksmith` `dispose()`, `teardownZone` vendor disposal,
  the minimap vendor glyphs + alchemist, `WorldMap` / `MAP_TARGETS` / waypoint vendor
  targets, interactable re-registration), `src/data/zones.js` / `src/data/content.js`
  (per-zone camp anchor / landmark data if added), `src/data/worldmap.js` (vendor map
  targets if derived there), `src/core/i18n.js` (any new strings, EN+RU),
  `test/npc-zones.test.js` (+ map/teardown coverage), `README.md`. No `SAVE_VERSION`
  change expected (vendors rebuild from data; confirm zone-state load still works).
- **Out of scope:** new vendor *inventory* / economy balance (this is
  **placement/availability**, not a stock redesign — the camp sells the same wares as
  the hub vendors), new NPCs or quests, and a vendor that physically **walks** between
  zones (a per-zone camp is enough; note true roaming as a follow-up). The
  castle/dragon stay hub-only.
- **Hints:** the one-line cause is the `if (zone.home)` gate around vendor creation
  (`src/game.js:4840`); the clean fix is a **data-driven per-zone camp anchor** + a
  helper that spawns the three vendors for **every** zone (mirroring how Task 38
  generalized quest-givers with `spawnZoneNpcs`). Add the missing `dispose()` methods
  **before** un-gating, since per-travel rebuilds make leaks matter; snap the camp to
  the Task 22 road-edge entrance so it reads as "a caravan parked by the road into
  town."

