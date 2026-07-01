# Good Game 3D — Agent Task Backlog (TODO)

> **Purpose.** This is the single source of truth for the remaining feature work
> on *Good Game 3D*. It is written for **autonomous AI agent runs**: one
> Opus‑4.8 (Max‑mode) agentic run is expected to complete **exactly one task**
> from the backlog, end‑to‑end, to a **release‑ready, fully‑functional bar with
> tests**, then stop. Read this whole file before starting any task.
>
> Use the prompt in [§ Run prompt](#run-prompt) to kick off each run.
>
> Status legend: `[ ]` not started · `[~]` in progress · `[x]` done (add date + note).

---

## 0. Context — what already exists

The game is a third‑person browser **action‑RPG** built on **Babylon.js**,
shipped as **static files** (no build step) and deployed to **GitHub Pages**
from `master`. It is one IIFE in `js/game.js` (~6k lines) plus `index.html`,
`css/style.css`, and a **headless Node test harness** `test/harness.js`.

**Already shipped (do not redo):**

- **RPG world of streamed zones** — `ZONES` data + `buildWorld(scene, zone)` +
  `ZoneManager` (portal travel behind a fade veil) + `SpawnDirector` (per‑zone
  location spawns that roam and respawn, plus lair bosses). Replaced timed waves.
- Story/adventure layer: `Quests` / `QuestGiver` / `Dialogue` (`NPC_DATA`),
  `ResourceNode` + `Crafting` (`CRAFT_RECIPES`), `CastleSite` + `Dragon`.
- Combat/gear: `Player`, `Projectile`/`Hazard`, `Monster`, `Boss` (6 archetypes),
  `ITEM_DB` / `Inventory` / `Shop` / `Anvil`, potion belt.
- World feel: `DayNight`, `Weather`, wind‑swayed foliage, `Burst`/`spawnImpact`.
- Procedural audio: `Sfx` + `Music` (Web Audio, zero asset files).
- `serializeGame`/`applySave` (zone‑aware, save v5), `Pause`, fullscreen.

**Architecture quick‑map** (grep these names in `js/game.js`): `CONFIG`,
`rng`/`setSeed`, `ZONES`/`ZONE_BY_ID`/`HUB_ZONE`, `LOCATIONS`/`NPC_DATA`/
`QUEST_BY_ID`, `MONSTER_ABILITIES`, `Player`, `Monster`, `Boss`, `Dragon`,
`buildWorld`, `setupZoneContent`, `populateAdventure`, `SpawnDirector`,
`ZoneManager`, `teardownZone`, `DayNight`, `Weather`, `Sfx`, `Music`, the `dom`
map, `serializeGame`/`applySave`, and the test seam `window.__GG_TEST__`.

The Node harness stubs Babylon + the DOM, so **all gameplay code must be
headless‑safe** (feature‑detect every browser‑only API).

---

## 1. Golden rules (apply to EVERY task)

The repo-wide **Golden Rules** live in [`CLAUDE.md`](./CLAUDE.md) (auto-loaded by
Claude Code) so they apply to every run from a single source of truth. **Read
`CLAUDE.md` before starting any task.**

In short: Babylon.js only (no rewrite; Babylon stays on its CDN; the
**published** site stays static on GitHub Pages — now as a Vite-built,
content-hashed `dist/` bundle); works on desktop + mobile without freezing;
**develop in the `src/**` ES-module tree** (see `ARCHITECTURE.md`) with explicit
imports; the full pipeline — `npm run lint && npm run typecheck && npm test &&
npm run build && npm run test:e2e` (Vitest + Playwright) — must stay green and
**feature-detect** all browser-only APIs; additive/modular style; determinism +
save/load round-trip; procedural-first perf/asset budget with disposal on zone
teardown; cache-busting is automatic (content hashing — no `?v=` to bump); one
task per run; i18n-aware; ask before large/irreversible ambiguity.

> **Task-level overrides.** A few backlog tasks deliberately **revise** specific
> Golden Rules. **Task 9 has landed** and already replaced the single-file /
> no-build-step rules (Golden Rules 1 & 4) with the module tree + Vite build
> above (output still static on Pages) and the layered Vitest/Playwright pipeline
> (Rule 3); `CLAUDE.md` + this file are updated to match. **Task 15 has landed**
> and added one **opt-in external (Google Drive) dependency**: cloud saves that
> stay opt-in and **degrade gracefully** (offline / signed-out / headless never
> throws or blocks), load the Google Identity Services SDK from Google's CDN on
> demand, and read the OAuth client id from config — so the published site stays
> 100% static. Golden Rule 1 in `CLAUDE.md` is updated to allow such opt-in
> services. Each such task carries a **"Note on Golden Rules"**; for that task,
> its note **wins**, and updating `CLAUDE.md` + this file to the new rule is part
> of the task. Until a rule is revised, it holds as written.

---

## 2. Definition of Done (shared — every task must satisfy all)

A task is **done** only when **all** of these are true:

- [ ] Feature fully implemented per the task's **Acceptance criteria** — no
      stubs, placeholders, dead code, or `TODO`s left behind.
- [ ] The repo's **current verification pipeline is all green** — today
      `node -c js/game.js` + `node test/harness.js`; once a build / lint /
      typecheck / Vitest / Playwright pipeline lands (Task 9), every stage CI runs
      must pass.
- [ ] **New automated tests** added to the repo's test suite (`test/harness.js`
      today; the Vitest + functional/E2E suites once Task 9 migrates them)
      covering the feature's logic (and any new save/load fields), plus a short
      note in the README "Tests" blurb if a new suite was added.
- [ ] **No regressions** to existing systems: combat, gear/economy, quests,
      crafting, zones/travel, day‑night/weather, pause, and **save/load**.
- [ ] Browser‑only APIs are **feature‑detected**; the headless harness still runs.
- [ ] New persistent state is serialized/restored and round‑trips in a test
      (bump `SAVE_VERSION` on a schema change; older saves still load).
- [ ] `index.html` / `css/style.css` updated as needed and the **cache‑buster
      bumped** (`?v=` while it exists; content hashing once a build replaces it).
- [ ] `README.md` updated (relevant section + roadmap checkbox).
- [ ] The **CI run is green** (`.github/workflows/ci.yml` runs the verification
      pipeline on every push/PR — never merge red).
- [ ] Work committed in logical chunks; branch merged to `master`
      (fast‑forward) and pushed; the **GitHub Pages deploy run for your commit
      finished with `conclusion: success`** (check it; fix any errors).
- [ ] This file updated: tick the task's checkbox, add the date and a one‑line
      note, and add the release entry to [`CHANGELOG.md`](./CHANGELOG.md);
      commit + push that too.
- [ ] A short final report: what shipped, test results, deploy status, follow‑ups.

> **Release‑ready means:** a player can load the Pages URL on desktop **and**
> mobile and use the feature with no errors, no console exceptions, no freezes,
> and saved progress survives reload. "Works on my machine / only headless" is
> **not** done.

---

## 3. Standard workflow for a run

1. Read this file. Pick the task (the run prompt names it, or take the first
   `[ ]` task in [§ Recommended order](#5-recommended-order)).
2. Briefly plan; skim the relevant systems in `js/game.js`.
3. Implement on the dev branch **named in the run instructions** (create it if it
   doesn't exist). Commit in logical chunks; end commit messages with the
   `Co-Authored-By` / `Claude-Session` trailers used in this repo's history.
4. Verify continuously with the repo's **current** verification pipeline — run
   whatever exists now (today: `node -c js/game.js` + `node test/harness.js`; once
   a task adds npm scripts / a build / Vitest / Playwright, run those too, matching
   CI) — plus a feature‑specific smoke check that exercises the new code path.
5. Update `index.html`/`css` and `README.md` as needed; bump the `?v=`
   cache‑buster while it exists (a content‑hashed build, once added, replaces it).
6. Merge to `master` (fast‑forward) and push with retry/backoff. Confirm the CI
   run **and** the `deploy-pages.yml` run for your commit are `success` via the
   GitHub tools; fix any failure.
7. Tick the task's checkbox here and add a release entry to
   [`CHANGELOG.md`](./CHANGELOG.md). Commit, push, and report.

---

## 4. The backlog — task index

> **Where the specs live.** Each task's full spec — Status (incl. shipped
> notes), Depends on, Goal, Scope, Acceptance criteria, Tests to add, Files,
> Out of scope and Hints — now lives in its **own file** under [`todo/`](./todo/),
> one per task (`todo/task-<N>-<slug>.md`). This section is the compact **index**:
> it is the source of truth for each task's **status** and **dependencies**, so
> shorthand like *"the next 3 `[ ]` tasks"* stays resolvable by scanning the
> tables below. `Status` is `[ ]` (not started) or `[x] <date>` (shipped). Open a
> task's **Spec** link for the details; the shared rules + Definition of Done +
> workflow are §§ 1–3 above.

> Task 1 (RPG world + loadable zones) is already shipped. The backlog continues
> at Task 2.

| # | Task | Status | Depends on | Spec |
| --- | --- | --- | --- | --- |
| 2 | Main story line with missions + side quests | `[x]` 2026-06-21 | none (builds on the existing `Quests` system) | [`todo/task-2-story-missions.md`](./todo/task-2-story-missions.md) |
| 3 | Higher‑fidelity models | `[x]` 2026-06-21 | best done **after Task 4** (lighting) so materials read well | [`todo/task-3-hifi-models.md`](./todo/task-3-hifi-models.md) |
| 4 | More + more‑realistic shadows & lighting | `[x]` 2026-06-21 | none (do **before** Task 3 ideally) | [`todo/task-4-shadows-lighting.md`](./todo/task-4-shadows-lighting.md) |
| 5 | More + higher‑quality animation | `[x]` 2026-06-22 | lighter if done **after Task 3** (animates the better models) | [`todo/task-5-animation.md`](./todo/task-5-animation.md) |
| 6 | More sound effects + per‑location background ambience | `[x]` 2026-06-22 | none (slots onto zones + the existing `Sfx`/`Music`) | [`todo/task-6-sound-ambience.md`](./todo/task-6-sound-ambience.md) |
| 7 | Russian language support | `[x]` 2026-06-21 | none. **Recommended FIRST** so later tasks add bilingual strings as they go (see Golden Rule 9) | [`todo/task-7-russian-i18n.md`](./todo/task-7-russian-i18n.md) |

> Tasks 8–15 were added to take *Good Game 3D* from "feature‑complete demo" to
> **production‑grade, agent‑maintainable RPG**. They are written to the same bar
> as Tasks 2–7 (each is one end‑to‑end release‑ready run) but several are
> **foundational** and deliberately **revise the Golden Rules** — read each
> task's *Note on Golden Rules* before starting. Recommended ordering is in
> [§ 5](#5-recommended-order).

| # | Task | Status | Depends on | Spec |
| --- | --- | --- | --- | --- |
| 8 | Extract the changelog into its own `CHANGELOG.md` | `[x]` 2026-06-22 | none. **Do this first** — it is cheap, unblocks every later run (no more 100‑line diffs to `TODO.md` just to log a release), and large projects with good reviews universally keep history out of the planning doc | [`todo/task-8-changelog-split.md`](./todo/task-8-changelog-split.md) |
| 9 | Modularize the codebase + a production build/test/CI toolchain for agentic edits | `[x]` 2026-06-22 | none, but it is **foundational** — doing it early makes every later task smaller, more targeted, and safer to edit/build/test autonomously | [`todo/task-9-modularize-toolchain.md`](./todo/task-9-modularize-toolchain.md) |
| 10 | Fix logical, code & UI bugs | `[x]` 2026-06-22 | none. Lighter to land **after Task 9** (smaller modules = surgical fixes), but must not wait on it | [`todo/task-10-bug-fixes.md`](./todo/task-10-bug-fixes.md) |
| 11 | Brighter, more cheerful art direction + a larger visible play area | `[x]` 2026-06-22 | plays best **with/after Task 4** (lighting) since exposure/tone mapping interact; coordinate the two | [`todo/task-11-art-direction.md`](./todo/task-11-art-direction.md) |
| 12 | Deep item & equipment system | `[x]` 2026-06-23 | none; pairs naturally with **Task 14** (skills/levels share the stat‑recompute pipeline) — keep the data layer compatible | [`todo/task-12-item-equipment.md`](./todo/task-12-item-equipment.md) |
| 13 | Minimap + full‑screen world map with locations, NPCs, search & a guided waypoint | `[x]` 2026-06-23 | none (reads `ZONES`/`LOCATIONS`/`NPC_DATA`); complements the story tracker from Task 2 | [`todo/task-13-minimap-worldmap.md`](./todo/task-13-minimap-worldmap.md) |
| 14 | Skill & leveling system | `[x]` 2026-06-23 | pairs with **Task 12** (shared stat pipeline); benefits from the Task 13 HUD for the toolbar. Keep save schema coordinated with Task 12 | [`todo/task-14-skills-leveling.md`](./todo/task-14-skills-leveling.md) |
| 15 | Cloud saves to Google Drive | `[x]` 2026-06-23 | the existing `serializeGame`/`applySave` + `SAVE_VERSION`; do it **after** any task that changes the save schema (so the cloud format is stable) | [`todo/task-15-cloud-saves.md`](./todo/task-15-cloud-saves.md) |

> Tasks 16–22 are a **player‑facing quality pass** driven by real device testing
> (a **Samsung Galaxy S24 Ultra** is the reference phone). They take the shipped
> RPG and bring its **mobile UX, persistence, map, economy and world generation**
> up to the bar of well‑reviewed mobile/desktop action‑RPGs: nothing off‑screen,
> nothing overlapping, one‑thumb combat, progress that survives a reload, a map
> you can read at a glance, an inventory that holds everything, and a world that
> generates believably. They are written to the same end‑to‑end, release‑ready,
> tested bar as Tasks 2–15 (one run completes exactly one task). Recommended
> ordering is in [§ 5](#5-recommended-order).
>
> **Reference device (use for every UI/responsive test in these tasks).** Samsung
> Galaxy S24 Ultra — **1440 × 3120 px** physical panel (QHD+, 19.5∶9, ~505 ppi),
> **`devicePixelRatio ≈ 3.5`**, CSS viewport ≈ **412 × 915 portrait /
> 915 × 412 landscape**. Add this as a reusable Playwright device profile
> (`viewport` + `deviceScaleFactor: 3.5` + `isMobile: true` + `hasTouch: true`)
> and assert layouts against it; also keep a desktop profile so both are covered.

| # | Task | Status | Depends on | Spec |
| --- | --- | --- | --- | --- |
| 16 | Responsive, mobile‑first HUD & menu overhaul | `[x]` 2026-06-25 | none directly, but it **touches** the minimap/map button (Task 13), the skill quick‑bar + `SkillsUI` (Task 14), the audio mixer (Task 6) and the cloud‑saves controls (Task 15). Pairs naturally with **Task 20** (map) — both rework HUD chrome — and **Task 18** (save management UI lives in the same menus). Best done **before** Task 20 so the map button removal and minimap‑tap entry point are settled first | [`todo/task-16-responsive-hud.md`](./todo/task-16-responsive-hud.md) |
| 17 | Durable session persistence | `[x]` 2026-06-25 | the existing `serializeGame`/`applySave` + `localStorage` prefs (Tasks 9/15). Coordinate with **Task 18** (save management) and **Task 15** (cloud auth) — they share the persistence layer. Do this **before/with** Task 18 | [`todo/task-17-session-persistence.md`](./todo/task-17-session-persistence.md) |
| 18 | Cloud‑saves browser fix + multiple manual save slots with full management | `[x]` 2026-06-25 | the save layer (Tasks 9/15) and **Task 17** (durable session) — build this **after/with** Task 17 so slots and the auto‑session share one store. Coordinate `SAVE_VERSION` with any task that changes the schema | [`todo/task-18-save-slots.md`](./todo/task-18-save-slots.md) |
| 19 | Replace the score system with the experience | `[x]` 2026-06-25 | the **XP/leveling** layer (Task 14, `src/data/skills.js`: `xpToNext`/`gainXp`/`player.progress`). None else | [`todo/task-19-score-to-xp.md`](./todo/task-19-score-to-xp.md) |
| 20 | Map subsystem fixes | `[x]` 2026-06-25 | the map layer (Task 13: `WorldMap`/`WorldMapUI`, `drawZoneScene`, `mmPlayer`, `resolveWaypoint`, the compass). Pairs with **Task 16** (HUD chrome — the map button is removed there and the map opens from the minimap tap) | [`todo/task-20-map-fixes.md`](./todo/task-20-map-fixes.md) |
| 21 | Unified inventory for potions & ingredients | `[x]` 2026-06-25 | the item/inventory system (Task 12: `Inventory`/`invAdd`/`invCap`/ the tabbed bag), the potion belt + materials (`POTION_SLOTS`, `player.potions`, `player.materials`), the Shop (Task 12/`POTION_STOCK`), and the drag utility from **Task 16**. Coordinate `SAVE_VERSION` with Tasks 18/19 | [`todo/task-21-unified-inventory.md`](./todo/task-21-unified-inventory.md) |
| 22 | Environment rewrite: stable resource generation + natural road‑edge teleporters | `[x]` 2026-06-25 | the world/zone systems (`buildWorld`, `setupZoneContent`, `ZoneManager`, `ResourceNode`, `populateAdventure`/`populateWildResources`, `CONFIG.maxResourceNodes`, the portal layout + hub `roadLanes`). None else | [`todo/task-22-environment-rewrite.md`](./todo/task-22-environment-rewrite.md) |

> Tasks 23–39 come from a player testing the shipped game on a real phone. They keep
> the Google sign-in alive across reloads, deepen the Russian localization to real
> grammar, **rework how every equipment category looks worn on the character and
> rewrite the combat animations from scratch** (Tasks 25–35, split one task per gear
> category), let players lay out their own controls, and finish the mobile HUD so
> nothing overlaps and every NPC is reachable. They hold to the same end-to-end,
> **release-ready, tested** bar as Tasks 2–22 (one run completes exactly one task).
> Like Tasks 16–22, every UI/responsive change must pass on the **Galaxy S24 Ultra**
> device profile (1440 × 3120, DPR ≈ 3.5, portrait + landscape) added in Task 16,
> alongside the existing desktop coverage. Recommended ordering is in
> [§ 5](#5-recommended-order).

| # | Task | Status | Depends on | Spec |
| --- | --- | --- | --- | --- |
| 23 | Persist Google Drive sign-in across reloads | `[x]` 2026-06-30 | Task 15 (Google Drive cloud saves — `CloudSave`/`CloudUI`/ `makeGoogleDriveClient`) and Task 17 (durable session — the `Session` cookie/hint store, `silentAuthDecision`, `signInSilent`). None else | [`todo/task-23-persist-drive-signin.md`](./todo/task-23-persist-drive-signin.md) |
| 24 | Russian grammatical morphology | `[x]` 2026-07-01 | Task 7 (the i18n layer — `LOCALES` / `t()` / `interp()` / `plural()` in `src/core/i18n.js`, the `RU` data-table dictionary + resolvers). None else | [`todo/task-24-russian-morphology.md`](./todo/task-24-russian-morphology.md) |
| 25 | Worn helmets: a distinct, real-looking helm per item | `[x]` 2026-07-01 | Task 12 (the worn-gear system + the `helmet` slot), Task 3 (models/materials), Task 4 (lighting). Honours the shared bar above (Tasks 25–35) | [`todo/task-25-worn-helmets.md`](./todo/task-25-worn-helmets.md) |
| 26 | Worn chest pieces: layered breastplates & robes per item | `[x]` 2026-07-01 | Task 12 (the `breastplate` slot), Task 3, Task 4. Shared bar above | [`todo/task-26-worn-chest.md`](./todo/task-26-worn-chest.md) |
| 27 | Worn pauldrons: shoulder armour that sits on the shoulder | `[x]` 2026-07-01 | Task 12 (the `pauldrons` slot), Task 3, Task 4. Shared bar above | [`todo/task-27-worn-pauldrons.md`](./todo/task-27-worn-pauldrons.md) |
| 28 | Worn gloves & gauntlets | `[x]` 2026-07-01 | Task 12 (the `gloves` slot), Task 3, Task 4. Shared bar above | [`todo/task-28-worn-gloves.md`](./todo/task-28-worn-gloves.md) |
| 29 | Worn belts | `[x]` 2026-07-01 | Task 12 (the `belt` slot), Task 3, Task 4. Shared bar above | [`todo/task-29-worn-belts.md`](./todo/task-29-worn-belts.md) |
| 30 | Worn boots | `[ ]` | Task 12 (the `boots` slot), Task 3, Task 4. Shared bar above | [`todo/task-30-worn-boots.md`](./todo/task-30-worn-boots.md) |
| 31 | Worn cloaks | `[ ]` | Task 12 (the `cloak` slot), Task 3, Task 4, Task 5 (`_animateCloak`). Shared bar above | [`todo/task-31-worn-cloaks.md`](./todo/task-31-worn-cloaks.md) |
| 32 | Held weapons: real wand / bow / staff / sword / axe / dagger in hand | `[ ]` | Task 12 (weapon items + the two hand slots), Task 3, Task 4, and Task 34 (the attacks the weapon moves with — pair them). Shared bar above | [`todo/task-32-held-weapons.md`](./todo/task-32-held-weapons.md) |
| 33 | Visible jewelry: necklace + rings on the character | `[ ]` | Task 12 (the `necklace` + `ring1`/`ring2` slots), Task 3, Task 4. Shared bar above. **Net-new scope** (jewelry currently renders no worn mesh) | [`todo/task-33-visible-jewelry.md`](./todo/task-33-visible-jewelry.md) |
| 34 | Rewrite weapon firing & melee attack animations from scratch | `[ ]` | Task 5 (the `Swing` state machine) and Task 10 (the impact-frame fix) — this **replaces** them; Task 32 (the weapon meshes it animates); the `Projectile` / `Hazard` combat system. Pairs with Task 32 (build them together) | [`todo/task-34-attack-animations.md`](./todo/task-34-attack-animations.md) |
| 35 | Full-loadout fit & clipping integration | `[ ]` | the worn-category tasks (25–33) **and** the combat-animation rewrite (Task 34) — this is the **final integration pass** that runs after them. Builds on the named **fit table** each category task introduces | [`todo/task-35-loadout-fit.md`](./todo/task-35-loadout-fit.md) |
| 36 | Customizable on-screen control layout | `[x]` 2026-06-30 | Task 16 (the responsive HUD + the reusable Pointer-Events drag controller / `dragSlotReducer`, `src/game.js` ~5503-5710) and **Task 39** (the HUD region/layer system — do this **after** Task 39 so custom positions build on non-overlapping defaults). Coordinate `SAVE_VERSION` with any task that changes the schema | [`todo/task-36-control-layout.md`](./todo/task-36-control-layout.md) |
| 37 | Exit/enter fullscreen control in the settings menu | `[x]` 2026-06-30 | Task 16 (the `Fullscreen` module — `toggle` / `active` / `supported` / `lockLandscape` / `unlockOrientation`, `src/game.js` ~10622-10686; the `#fsBtn` HUD button). None else | [`todo/task-37-fullscreen-setting.md`](./todo/task-37-fullscreen-setting.md) |
| 38 | Fix: NPCs are only talkable in the hub | `[x]` 2026-06-30 | the world/zone + quest systems (`setupZoneContent` / `populateAdventure`, `QuestGiver` / `Dialogue`, `NPC_DATA` / `LOCATIONS`, `ZoneManager`). None else | [`todo/task-38-npc-home-zones.md`](./todo/task-38-npc-home-zones.md) |
| 39 | Collision-free HUD: a real region/layer system so no widget or button overlaps | `[x]` 2026-06-30 | Task 16 (the HUD markup + z-index tiers + the touch action arc). Pairs with **Task 36** (do this **before** the free-form control editor so custom positions start from clean regions). None else | [`todo/task-39-collision-free-hud.md`](./todo/task-39-collision-free-hud.md) |

> Tasks 40–41 come from continued play of the shipped game: vendors you can only
> reach in the hub, and a save flow still cluttered with hand-managed `.json`
> files. They bring the **economy's reach** and the **save UX** up to the bar of
> well-reviewed action-RPGs — a merchant within reach wherever you roam, and saving
> that "just works" through the cloud. They hold to the same end-to-end,
> **release-ready, tested** bar as Tasks 2–39 (one run completes exactly one task),
> and every UI/responsive change must pass on the **Galaxy S24 Ultra** device
> profile (1440 × 3120, DPR ≈ 3.5, portrait + landscape) added in Task 16,
> alongside the existing desktop coverage. Recommended ordering is in
> [§ 5](#5-recommended-order).

| # | Task | Status | Depends on | Spec |
| --- | --- | --- | --- | --- |
| 40 | Travelling vendors in every land: merchant, blacksmith & apothecary reachable outside the hub | `[ ]` | Task 38 (the zone-aware NPC spawn this generalizes — `spawnZoneNpcs` / `questGiversForZone` / `landmarkZone`, the `zone` field on `LOCATIONS`, `src/game.js` ~4798-4865), Task 12 (the `Shop` / gear economy and the `Merchant` / `Blacksmith`), Task 21 (the `Alchemist` apothecary vendor + sellable consumables), Task 22 (the road-edge zone entrances the camp is placed beside), and Tasks 13/20 (the minimap + world-map markers and the guided waypoint). All shipped | [`todo/task-40-travelling-vendors.md`](./todo/task-40-travelling-vendors.md) |
| 41 | Retire file saves; make Google Drive the primary, user-friendly save path | `[ ]` | Task 15 (Google Drive cloud saves — `CloudSave` / `CloudUI` / `makeGoogleDriveClient`), Task 17 (the durable auto-resume session + the `SaveSlots` base) and Task 18 (the `SaveSlots` / `SavesUI` *Manage Saves* screen, where file export/import currently lives). **Pairs with / best done with or after Task 23** (persist Google sign-in across reloads — the silent re-auth that makes "stay signed in" actually work). Coordinate `SAVE_VERSION` with any schema-changing task (e.g. Task 36) | [`todo/task-41-drive-primary-saves.md`](./todo/task-41-drive-primary-saves.md) |
| 42 | Make the Playwright E2E suite fast & robust | `[ ]` | Task 9 (the Vite build + the Vitest/Playwright pipeline + the staged `.github/workflows/ci.yml`) and Task 16 (the **Galaxy S24 Ultra** device profiles the specs run under). Independent of the worn‑gear/animation family (Tasks 25–35) and of Tasks 40/41. **Best done early** — it shortens every later run's verify/CI loop | [`todo/task-42-fast-e2e.md`](./todo/task-42-fast-e2e.md) |

---

## 5. Recommended order

Tasks are mostly independent, but this order minimizes rework.

**Tasks 2–7 (visual/content pass — all shipped):**

1. **Task 7 — Russian/i18n** *(first: later tasks then add bilingual strings)*
2. **Task 4 — Lighting & shadows** *(visual foundation)*
3. **Task 3 — Models/sprites** *(reads best under the new lighting)*
4. **Task 5 — Animation** *(animates the improved models)*
5. **Task 6 — Audio & per‑zone ambience**
6. **Task 2 — Story, missions & side quests** *(content capstone)*

**Tasks 8–15 (production hardening & RPG depth) — recommended order:**

1. **Task 8 — Changelog → `CHANGELOG.md`** *(cheap; unblocks the run workflow)*
2. **Task 9 — Modularize + build/test/CI toolchain** *(foundational: revises the
   Golden Rules and makes every later task smaller, safer & agent‑editable)*
3. **Task 10 — Bug fixes + deeper test net** *(land correctness on the new, more
   testable structure)*
4. **Task 11 — Brighter palette + larger view** *(coordinate with Task 4 lighting)*
5. **Task 12 — Item & equipment system** *(shares the stat pipeline with Task 14)*
6. **Task 14 — Skill & leveling system** *(builds on the Task 12 stat/loadout work)*
7. **Task 13 — Minimap & world map** *(complements the Task 2 story tracker)*
8. **Task 15 — Google Drive cloud saves** *(last: after the save schema settles)*

**Tasks 16–22 (mobile UX, persistence & systems polish) — recommended order:**

1. **Task 16 — Responsive HUD/menu overhaul** *(foundational UX: auto‑fit menus,
   one‑thumb combat, the shared pointer‑drag utility reused by Task 21)*
2. **Task 17 — Durable session persistence** *(cookies + auto‑resume + silent
   Google re‑auth; underpins Task 18)*
3. **Task 18 — Save slots + cloud‑browser fix + management** *(builds on Task 17's
   store; fixes the dead start‑screen cloud click)*
4. **Task 19 — Score → experience system** *(independent; small, clean removal)*
5. **Task 21 — Unified inventory (potions/ingredients, 30 slots, drag‑slotting,
   alchemist)** *(reuses the Task 16 drag utility; coordinate `SAVE_VERSION`)*
6. **Task 20 — Map subsystem fixes** *(pairs with Task 16's map‑button removal)*
7. **Task 22 — Environment rewrite (stable resources + road‑edge teleporters)**
   *(updates the minimap/map exits, so do it after Task 20)*

> All of Tasks 16–22 must pass their **UI/responsive tests on the Galaxy S24 Ultra
> device profile** (1440 × 3120, DPR ≈ 3.5, portrait + landscape) added in Task 16,
> alongside the existing desktop coverage.

**Tasks 23–39 (player-reported polish: sign-in persistence, deeper localization, a
worn-equipment + combat-animation overhaul, customizable & collision-free HUD) —
recommended order:**

1. **Task 38 — Fix NPC talk across zones** *(quick correctness fix; independent)*
2. **Task 39 — Collision-free HUD regions** *(clean default layout before the editor)*
3. **Task 36 — Customizable control layout** *(after Task 39; reuses Task 16's drag
   utility; bumps `SAVE_VERSION` 13 → 14)*
4. **Task 37 — Exit/enter fullscreen in settings** *(small; independent)*
5. **Task 23 — Persist Google Drive sign-in** *(independent; builds on Tasks 15/17)*
6. **Task 24 — Russian morphology/declensions** *(independent; builds on Task 7)*
7. **Worn-equipment + combat-animation overhaul (Tasks 25–35)** — do the worn-gear
   categories first (establish the per-item shape pattern with **Task 25 — helmets**,
   then **26** chest · **27** pauldrons · **28** gloves · **29** belts · **30** boots ·
   **31** cloaks), then **Task 32 — held weapons** and **Task 34 — the from-scratch
   attack animations** *together* (the weapon mesh + its motion are coupled), then the
   additive **Task 33 — visible jewelry**, and finish with **Task 35 — the full-loadout
   fit & clipping integration last** (it depends on all of 25–34).

> Tasks 36 / 37 / 39 are UI-facing — they (and any on-character visual in Tasks 25–35)
> must pass their **UI/responsive + screenshot tests on the Galaxy S24 Ultra device
> profile** (portrait + landscape) added in Task 16, alongside desktop. Only **Task 36**
> changes the save schema (`SAVE_VERSION` 13 → 14); Tasks 25–35 are visual/animation
> (no schema change), and the rest persist via cookies/localStorage.

**Tasks 40–41 (vendors everywhere & a cloud-first save system) — recommended order:**

1. **Task 40 — Travelling vendors in every land** *(independent placement fix that
   generalizes Task 38; no schema change)*
2. **Task 41 — Retire file saves + Drive-primary save UX** *(pairs with **Task 23**'s
   sign-in persistence — do it with/after Task 23 so cloud saving also stays signed in)*

> Both are independent of the worn-gear/animation family (Tasks 25–35) and can run any
> time their dependencies are met. Task 41's UI must pass on the **Galaxy S24 Ultra**
> profile (portrait + landscape) plus desktop; **neither task changes the save schema**
> (Task 40 rebuilds vendors from data; Task 41 reuses the existing `serializeGame`
> schema and only removes the file mechanic + reworks the cloud UX).

**Task 42 (test‑infrastructure speed & robustness) — recommended order:**

1. **Task 42 — Fast & robust E2E suite** *(do this **early** — it shortens every later
   run's verify/CI loop; independent of all gameplay tasks; no schema change)*

> Task 42 is **infrastructure**: it touches `playwright.config.js` / `.github/workflows/
> ci.yml` / the `test/e2e/**` specs / `src/game.js`'s test seam only — **no gameplay, no
> save‑schema change, and the shipped bundle is unchanged** (Babylon stays CDN‑externalised;
> the local‑engine path is CI‑only). It must **keep** the Galaxy S24 Ultra portrait +
> landscape coverage for the layout/responsive specs while removing the flake and the
> per‑shard rebuild. Because it speeds up the slowest pipeline stage, prefer running it
> **before** a long batch of later tasks.

If you skip ahead, still obey Golden Rule 9 (route new strings through i18n once
it exists) and the shared Definition of Done. For Tasks 9 & 15, read each task's
*Note on Golden Rules* first — they intentionally revise the single‑file /
no‑build‑step / no‑external‑dependency rules.

---

## 6. Run prompts

There are three ways to start work — all end in a release-ready **merge to
`master`**:

- **Orchestrated batch (§ 6.1) — recommended for several tasks.** A
  **master/orchestrator agent** turns a short request like *"do next 3 tasks"* or
  *"solve tasks 16, 18 and 20"* into a **strictly sequential** run: it dispatches
  **one isolated subagent per task** (each with its **own fresh context window**),
  **waits** for each to finish **and merge to `master`**, then starts the next.
- **Single task (§ 6.2).** The per-task prompt that one subagent — or you,
  directly — runs to take exactly one task end-to-end.
- **Deterministic workflow (§ 6.3).** The same one-subagent-per-task batch, but the
  loop lives in **code** (`.claude/workflows/run-backlog.js`) for a hands-off,
  reproducible run.

> **You don't have to paste anything.** `CLAUDE.md` (auto-loaded every run) carries
> the § 6.1 protocol, so simply typing **"make / solve / do / run / finish next N
> tasks"** or **"… tasks A, B and C"** makes the main agent act as the orchestrator
> exactly as if the whole § 6.1 prompt were pasted. The text blocks below are the
> explicit, copyable source of truth (and what `CLAUDE.md` and the `/make-tasks`
> command point at).

### 6.1 Orchestrated batch — "make/solve/do next N tasks" / "… tasks A, B, C"

Just tell the agent *"do next 3 tasks"*, *"solve tasks 16, 18 and 20"*, or
*"next"* — it follows the prompt below automatically (via `CLAUDE.md`). You can
also run the `/make-tasks` command with the shorthand as its argument, or paste
this block verbatim to be explicit:

```text
Act as the ORCHESTRATOR (master agent) for "Good Game 3D" — a Babylon.js browser
action-RPG in this repo, shipped to GitHub Pages. You COORDINATE; you do NOT write
game code yourself. You turn my short request into a strictly sequential,
ONE-TASK-PER-SUBAGENT run.

HOW TO READ MY REQUEST:
- "make N next tasks"      → the next N tasks whose status is [ ] (not started)
  in the § 4 task index, taken top-to-bottom from TODO.md § 5 "Recommended order".
- "make tasks A, B and C"  → exactly those task numbers, ordered to respect § 5
  and each task's "Depends on"; skip any already [x] done and tell me which.
- "next" / "the next task" → just the first [ ] task.
First read CLAUDE.md and the TODO.md hub (§ 2 Definition of Done, the § 4 task
index — status + Depends on per task, § 5 order). Each task's full spec lives in
its own file todo/task-<N>-<slug>.md; you don't need to open them all to plan —
the § 4 index + § 5 order carry status + dependencies. Resolve the concrete ordered
task list, PRINT it for me, and check dependencies: if a task's "Depends on" isn't
satisfied by a shipped or earlier-in-the-batch task, reorder if you safely can,
otherwise STOP and tell me.

RUN THE BATCH — for each task, IN ORDER, ONE AT A TIME:
1. Spawn ONE subagent (the `task-runner` agent) to do EXACTLY that task. It runs
   in its OWN fresh, isolated context window — it CANNOT see this conversation —
   so its prompt must tell it to read CLAUDE.md + the TODO.md hub AND that task's
   spec file `todo/task-<N>-<slug>.md`, and do Task <N> only, end-to-end, to the
   § 2 Definition of Done, on its own branch `claude/task-<N>-<slug>` cut from the
   latest master. Pass the task number + its `todo/` spec-file path; pass nothing
   that belongs to another task.
2. WAIT for that subagent to FULLY finish. "Finished" = it implemented the task
   with new tests, kept the WHOLE pipeline green (lint + typecheck + test + build
   + e2e), flipped the task's Status to [x] in the TODO.md § 4 index (+ the Status
   line in its todo/ file), added a CHANGELOG.md entry, COMMITTED, then MERGED its
   branch into master (fast-forward — if master moved,
   rebase the branch onto master first) and PUSHED master, and confirmed the CI +
   Pages deploy for that commit are green. The MERGE-TO-MASTER after each task is
   MANDATORY — every completed task lands on master before the next one starts.
3. Only AFTER it returns success, sync to the merged master (so the next subagent
   branches from it — later tasks build on earlier ones), then start the next.
4. If a subagent FAILS, can't get the pipeline green, or hits a blocking
   dependency: STOP the batch immediately, report exactly which task and why, and
   do NOT start later tasks (they may depend on it). Never merge a red pipeline.

Keep YOUR (orchestrator) context lean: don't read large source files yourself —
rely on each subagent's returned summary. Run subagents STRICTLY sequentially
(never two at once); each task's merge must land before the next begins. When the
batch ends, give me a roll-up: each task's shipped status, its test/build/deploy
result, and anything skipped or blocked.
```

### 6.2 Single-task run prompt

Paste this to do ONE task (or let the § 6.1 orchestrator spawn the `task-runner`
agent with it). Replace `<N>` with the task number, or write `next`.

```text
Act as a senior gameplay engineer on "Good Game 3D" — a Babylon.js browser
action-RPG in this repo, shipped to GitHub Pages. (You may be spawned by the
§ 6.1 orchestrator as the `task-runner` agent, running in your own fresh,
isolated context — so do not assume any prior conversation; read the repo.)

FIRST, read CLAUDE.md, the TODO.md hub, and your task's spec file
todo/task-<N>-<slug>.md — the full spec, its "Depends on" and any "Note on Golden
Rules" (the § 4 index links every task's spec file). Some tasks (e.g. Task 9's
modularization/build step and Task 15's external Drive dependency) deliberately
REVISE the default rules; when a task has a "Note on Golden Rules", that note WINS
for that task, and part of the task is updating CLAUDE.md / TODO.md §1 to match.

DO EXACTLY ONE TASK: Task <N>. (If I wrote "next", take the first task whose
status is [ ] in the § 4 index, following § 5 "Recommended order".) Don't touch
any other task or scope-creep. If the task has an unmet "Depends on", stop and
tell me.

Ship it RELEASE-READY and fully functional: a player can use it on desktop AND
mobile with no errors, no console exceptions, no freezes, and saved progress
survives reload. No stubs, placeholders, dead code, or leftover TODOs.

Non-negotiables (full list in CLAUDE.md → Golden Rules; satisfy TODO.md §2
Definition of Done) — apply them all EXCEPT where this task's "Note on Golden
Rules" overrides a specific one:
- Engine stays Babylon.js; the PUBLISHED site stays static on GitHub Pages. A
  build step / bundler is allowed only if a task introduces one — then deploy its
  built output and keep Pages serving static files.
- Works on desktop + mobile; never freeze the main thread (chunk heavy work; hide
  unavoidable hitches behind the existing zone-transition fade veil).
- Keep ALL existing tests green AND add new tests for what you build. Run the
  repo's CURRENT verification pipeline — whatever exists NOW: today that's
  `npm run lint && npm run typecheck && npm test && npm run build &&
  npm run test:e2e` (match exactly what CI runs). Feature-detect every browser-only
  API (Babylon / DOM / Web Audio / localStorage / PBR / particles / external SDKs)
  so the headless tests still run.
- All randomness via the seeded rng(); any new persistent state must serialize +
  restore in serializeGame/applySave (bump SAVE_VERSION on a schema change and
  keep older saves loading) and round-trip in a test.
- No regressions to combat, gear, quests, zones/travel, day-night/weather, pause,
  or save/load.

Workflow:
1. Plan briefly, then implement on your run branch — `claude/task-<N>-<slug>` (the
   orchestrator names it; if running solo and I didn't name one, create it from the
   latest master). Commit in logical chunks using this repo's commit-trailer
   convention (Co-Authored-By + Claude-Session).
2. Verify locally with the repo's current verify commands (see CLAUDE.md "Verify"
   / package.json scripts / the CI workflow) until all green, plus a tiny
   feature-specific smoke check that exercises the new code path.
3. Update index.html/css and README.md as needed (content hashing handles
   cache-busting — there is no `?v=` to bump).
4. MERGE TO `master` after the task is done and green: rebase your branch onto the
   latest master if master moved, then fast-forward `master` and push with
   retry/backoff. Confirm BOTH the CI run AND the Pages deploy for your commit
   finished conclusion=success — fix anything until both are green. Do not open a
   pull request unless I ask.
5. Flip the task's Status to [x] in the TODO.md § 4 index (add the date) and update
   the Status line at the top of its todo/task-<N>-<slug>.md (date + one-line note);
   add a release entry to CHANGELOG.md; commit + push (these land on master in
   step 4).
6. Report: what shipped, the test/build results, and the CI + deploy status.

If a decision is genuinely mine and cheap to confirm, pick the sensible default
and note it; if it's expensive or irreversible, ask me first.
```

### 6.3 Deterministic workflow (the loop lives in code)

For a hands-off, reproducible batch where sequencing is guaranteed by **code**
rather than model judgement, run [`.claude/workflows/run-backlog.js`](./.claude/workflows/run-backlog.js)
with the Workflow tool, passing the same shorthand as `args`:

```text
Workflow({ scriptPath: ".claude/workflows/run-backlog.js", args: "next 3 tasks" })
Workflow({ scriptPath: ".claude/workflows/run-backlog.js", args: "tasks 16, 18 and 20" })
Workflow({ scriptPath: ".claude/workflows/run-backlog.js", args: [16, 18, 20] })
```

The script first runs a **planner** agent that reads `CLAUDE.md` + `TODO.md` and
resolves the shorthand into a concrete, dependency-ordered task list (skipping any
`[x]` done; stopping if a dependency is unmet). It then `await`s **one
`task-runner` subagent per task in series** — each in its own fresh context window,
each implementing its task and **merging to `master`** before the next begins — and
**halts the batch** the moment a task fails to finish & merge, reporting where it
stopped. Same outcome as § 6.1, with the loop pinned in code.

---

## 7. Changelog

> **Moved.** The release history now lives in a dedicated
> [`CHANGELOG.md`](./CHANGELOG.md) at the repo root (Keep a Changelog format).
> When you finish a task, add the release entry **there**, not here. This heading
> is kept so older links to *TODO.md § 7* still resolve.
