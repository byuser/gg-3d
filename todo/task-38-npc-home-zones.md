# Task 38 — Fix: NPCs are only talkable in the hub — spawn quest-givers in their home zones

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-30 · Root-caused + fixed the hub-only NPC bug: NPC spawning was gated
  behind `if (zone.home)` in `setupZoneContent`, and only the meadow is `home`, so the four wild
  quest-givers (herbalist/Whisperwood, fisher/Saltmarsh, smith2/Frostpeak, hermit/ruins) were never
  spawned. Added a data-driven **`zone` field on `LOCATIONS`** + a `landmarkZone()` helper
  (grove→forest, seaside→shore, mountain→peaks, ruins→**caverns**; village/apothecary/castle→hub),
  pulled NPC placement into a per-zone `spawnZoneNpcs`/`questGiversForZone` that runs for **every**
  zone (re-registered fresh after each `ZoneManager` teardown→rebuild and on save-load into a wild
  land); the hub keeps its merchant/blacksmith/alchemist/castle. Made `checkLocations` + the world-
  map/minimap `mapTargets`/`targetZoneOf`/`targetPoint` + the in-zone landmark dots **zone-aware** so
  the guided waypoint routes to where each NPC actually stands. No `SAVE_VERSION` change (the world
  rebuilds from data; zone-state load confirmed). New `test/npc-zones.test.js` (10 cases; Vitest
  264 → 274) + updated the `worldmap.test.js` assertions that encoded the old hub-only model.
- **Depends on:** the world/zone + quest systems (`setupZoneContent` /
  `populateAdventure`, `QuestGiver` / `Dialogue`, `NPC_DATA` / `LOCATIONS`,
  `ZoneManager`). None else.
- **Goal.** The player can talk to quest-givers in the hub **Meadowgate Vale** but
  **not in any other land** (e.g. Frostpeak Trail). Root cause: `populateAdventure()` —
  which instantiates every `QuestGiver` from `NPC_DATA` — is called **only inside the
  `if (zone.home)` branch** of `setupZoneContent()` (`src/game.js` ~4822-4845), and
  **only the meadow zone has `home: true`** (`src/data/zones.js` ~30). Every wild zone
  takes the `else` branch (resources only, **no NPCs**), so non-hub quest-givers —
  `herbalist` (Whisperwood Grove), `fisher` (Saltmarsh Shore), `smith2` (Frostpeak
  Pass), `hermit` (Sunken Ruins) — are **never spawned**, even though the campaign sends
  the player to them. Fix it so every NPC is present and talkable **in their own land** —
  the baseline reliability a quest-driven RPG must have.
- **Scope (fix this — root-cause, not a band-aid):**
  - **Associate each NPC/landmark with its zone.** `NPC_DATA` entries carry a `loc`
    (landmark id) and `LOCATIONS` entries (`src/data/content.js` ~105-139) currently have
    **no `zone` field**. Add an explicit landmark → zone association (a `zone` field on
    `LOCATIONS`, or a small mapping) so the game knows `grove` → forest, `seaside` →
    shore, `mountain` → peaks, `ruins` → its land, `village` / `apothecary` → the hub,
    etc. Keep it data-driven and i18n-safe.
  - **Spawn the right NPCs per zone.** Change `setupZoneContent` / `populateAdventure`
    so that on entering **any** zone it instantiates the quest-givers **whose landmark
    belongs to that zone** (placed at their landmark coordinates, registered as
    interactables at the existing talk range), instead of gating all NPC spawning behind
    `zone.home`. Hub-only systems (merchant, blacksmith, alchemist vendor, castle site)
    stay hub-gated; only the **quest-giver placement** becomes zone-aware.
  - **Re-register interactables on travel.** Confirm that after `ZoneManager`
    teardown → rebuild the new zone's NPC interactables are freshly registered (no stale
    / missing interactables), so walking up + pressing **E** opens `Dialogue` and quest
    **accept / turn-in** works in **every** zone, not just the hub. Sweep for any other
    hub-only assumption in the talk/quest path.
  - **Determinism + no leaks.** NPCs spawn deterministically, dispose on teardown (no
    leaks across travel), and the guided waypoint / minimap NPC markers (Tasks 13/20)
    point at NPCs now that they exist in their zones.
- **Acceptance criteria:**
  - The player can **walk up to and talk to** the herbalist, fisher, smith and hermit
    **in their own lands** (Whisperwood / Saltmarsh / Frostpeak / the ruins), accept and
    turn in their missions there — not only in Meadowgate.
  - Hub NPCs / vendors / castle still work in the hub; no NPC appears in the wrong zone;
    interactables register correctly after **every** zone travel (and after a save-load
    into a non-hub zone).
  - No leaks on teardown; headless-safe; full pipeline green.
- **Tests to add:** a test that each NPC is placed in its **correct zone** (landmark →
  zone mapping) and **not** spawned elsewhere; a regression test that, after travelling
  to a non-hub zone, the NPC interactable is registered and the **talk → Dialogue →
  accept/turn-in** flow runs (the bug = zero NPCs outside the hub); a save-load into a
  wild zone still yields talkable NPCs; teardown disposes NPCs.
- **Files:** `src/game.js` (`setupZoneContent` zone gate, `populateAdventure` →
  zone-aware NPC spawn, interactable re-registration on travel), `src/data/content.js`
  (landmark → zone association on `LOCATIONS` / `NPC_DATA`), `test/harness.test.js` (or a
  new `test/npc-zones.test.js`), `README.md`. No `SAVE_VERSION` change expected (the
  world is rebuilt from data; confirm zone-state load still works).
- **Out of scope:** new NPCs or new quests (this is a **placement fix** for existing
  content); moving the merchant / blacksmith / alchemist out of the hub; redesigning
  dialogue.
- **Hints:** the one-line cause is the `if (zone.home)` gate around `populateAdventure`;
  the clean fix is a **landmark → zone** field so each zone spawns exactly its own
  quest-givers (the `QuestGiver` constructor already positions itself from the landmark
  coordinates).

