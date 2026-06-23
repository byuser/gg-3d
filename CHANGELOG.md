# Changelog

All notable changes to **Good Game 3D** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/): newest first, with an
`## [Unreleased]` section at the top for work that has landed but is not yet
described under a dated heading.

**Versioning.** Through **Task 8** the game shipped as a single static file keyed
to the monotonic **`?v=` cache-buster** in `index.html`, so historical entries
carry the build they shipped at — e.g. `## [v19] — 2026-06-22 — …`. **Task 9**
replaced that single file with a **Vite build** whose assets are **content-hashed**
(no more `?v=` to bump), so from Task 9 on, entries are keyed by **date** — e.g.
`## [2026-06-22] — …`. Each entry keeps the task name and the harness/test-count
delta it shipped with, since later tasks reference those.

> **For future runs:** when you finish a task, append your release note here
> (not to `TODO.md`). Add a new `##` heading at the top of the dated list below
> `## [Unreleased]`, keyed by the **date** (the content-hashed build needs no
> version tag).

---

## [Unreleased]

_Nothing pending._

## [2026-06-23] — Cloud saves: inject the Google OAuth client id at deploy time

Follow-up to Task 15 so the OAuth 2.0 **Web-app client id** no longer has to be hardcoded in
`index.html`. The **Deploy to GitHub Pages** workflow now reads it from a GitHub Actions
**variable** (or secret) named `GOOGLE_CLIENT_ID`, scoped to the `github-pages` environment, and
passes it to the Vite build as `VITE_GOOGLE_CLIENT_ID`; Vite inlines it into the hashed bundle and
the game reads it at runtime. `CloudSave.readClientId()` now resolves the id in priority order —
`window.GG_GOOGLE_CLIENT_ID` → `import.meta.env.VITE_GOOGLE_CLIENT_ID` (build-time) → the
`<meta name="gg-google-client-id">` tag (manual fallback) — and stays cleanly "not configured" when
all are empty. `.env.local` is now git-ignored for local dev, and the README gained step-by-step
instructions for creating the Client ID and storing it as a GitHub environment variable. Vitest
**125 → 126** (a new build-time-env case); no save-schema change.

## [2026-06-23] — Task 15 — Cloud saves to Google Drive (manual + 5-min autosave, rolling 1-hour history)

Added an **opt-in** way to back progress up to the player's own Google Drive, reusing the **exact**
`serializeGame()`/`applySave()` JSON the local file save uses — so save **versioning and migration just
work** and there is **no schema change** (`SAVE_VERSION` stays **9**). Everything degrades gracefully:
signed-out, offline, with no OAuth client id configured, or headless, the feature is cleanly disabled
and the local save still works — nothing throws and nothing blocks the main thread. Vitest **100 → 125**
(new `test/cloudsave.test.js`, 25 cases); the Playwright smoke asserts the cloud panel is present and
cleanly disabled by default.

- **Private `appDataFolder` storage.** Saves live in the player's hidden Drive **app-data folder**
  (the `drive.appdata` OAuth scope only — invisible to other apps, no Drive clutter). A single
  **manual** slot (`gg3d-save.json`, overwritten by "Save to Drive") plus timestamped **autosave**
  files (`gg3d-auto-<epochMs>.json`).
- **Autosave every 5 minutes.** A cheap, **wall-clock-gated** render-loop tick (`CloudSave.tick`) fires
  an autosave when due — **paused while the tab is hidden/idle**, **debounced** against an in-flight
  write, and **never blocking** (the upload is async; the serialize is trivial). Keeps a **rolling
  one-hour history** (≤ **12** timestamped slots, pruned after each write; the **single newest is always
  kept** so a long break never loses the last checkpoint).
- **Browse & restore.** A cloud-saves overlay lists the manual slot + the retained autosaves
  (newest-first) and restores any of them through the **same boot path** the local file load uses
  (stash → reload → re-seed → `applySave`). Loading **reconciles** so a cloud save never silently
  clobbers newer in-progress work.
- **Pure, tested policy.** `cloudAutosaveDue` (cadence / hidden / debounce), `cloudPrune` (age + slot
  cap + keep-newest retention), `cloudNewer` (reconcile by `savedAt`), and the autosave file
  naming/parsing are all **pure functions** with direct unit tests.
- **Injectable, feature-detected I/O.** The production client (`makeGoogleDriveClient`) loads the tiny
  **Google Identity Services** script on demand at first sign-in and talks to the **Drive REST API** via
  plain `fetch` (no heavy gapi client — the site stays static). The client is **injectable**
  (`CloudSave._setClient`) so the whole flow is exercised against an in-memory stub with no network.
- **Config & privacy.** The OAuth **client id** is read from a `<meta name="gg-google-client-id">` tag
  (or `window.GG_GOOGLE_CLIENT_ID`) — **never a committed secret**; empty by default ⇒ cloud saves
  ship disabled. The autosave-on preference persists to `localStorage` (like locale / graphics / audio),
  not into the save file. New **EN + RU** strings for the whole panel. Golden Rule 1 (CLAUDE.md + TODO
  §1) updated to allow such opt-in external services. README gained a **Cloud saves** setup + privacy
  section.

## [2026-06-23] — Task 13 — Minimap + full world map with locations, NPCs, search & a guided waypoint

Added the navigation layer large open-world RPGs lean on: a live **corner minimap**, a
**full-screen world map** (current-land detail + a world overview of the portal graph), a name
**search** across every land / landmark / NPC, and a **guided waypoint** that routes the player —
hopping portals across lands — with an on-screen **compass** that clears on arrival. **`SAVE_VERSION`
→ 9** (zones discovered + the active waypoint); older saves still load (only the saved land known, no
waypoint). Vitest **80 → 100** (new `test/worldmap.test.js`, 20 cases); the Playwright smoke now
opens the map, searches and sets a waypoint.

- **Pure data layer (`src/data/worldmap.js`).** A new headless-safe module derived entirely from
  `ZONES` / `LOCATIONS` / `NPC_DATA`: the zone **adjacency graph** (`ZONE_ADJ`, `zoneEdges`), **BFS
  route-finding** (`findRoute`, `nextZoneStep` → the next portal to take), bearing/distance +
  the **8-point compass** (`bearingRad`, `dist2D`, `compass8`, camera-relative `relativeHeading`),
  the searchable **`MAP_TARGETS`** (every land/landmark/NPC, names resolved by the UI via i18n so the
  index stays translation-agnostic), diacritic-folding **search** (`searchTargets`/`matchesQuery`),
  and the deterministic **world-overview layout** (`worldLayout`). All unit-tested directly.
- **Minimap (`WorldMap`).** A north-up corner **2D canvas** showing the current land's fence, the
  player + facing, portals (coloured by kind), NPCs (status-coloured), resources, monsters, vendors,
  the castle and the active-waypoint marker — redrawn on a throttle so it never costs a frame, and
  **feature-detected** (no `2d` context ⇒ silent no-op). Toggle with `N`; tap it to open the full map.
- **Full world map (`WorldMapUI`).** A `Tab` / 🗺️ overlay with a **This Land** view (detailed,
  pannable + zoomable) and a **World** overview of the portal graph (discovered vs **fog-of-war**), a
  live **search** box with a results list, and a **"Guide me there"** button. Mutually exclusive with
  the other menus, localized EN/RU, mobile-friendly tap targets.
- **Guided waypoint.** `resolveWaypoint` returns live guidance — an in-zone bearing + distance, or
  (across lands) the **next portal to take** routed through the graph — driving an on-screen
  **compass arrow** (camera-relative) + label that **auto-clears on arrival**.
- **Persistence.** `serializeGame`/`applySave` round-trip `discovered` (fog-of-war) + the active
  `waypoint`; **`SAVE_VERSION` → 9**, older saves default gracefully. Zones are revealed on travel
  (`ZoneManager._swap`) and on load.
- **Tests.** New `test/worldmap.test.js` (20 cases): graph derivation + symmetry, BFS routing &
  next-hop, bearing/distance/compass + camera-relative arrow, target derivation + folding search, the
  world layout, runtime waypoint resolution (same-zone vs cross-zone), set/clear/arrival, fog-of-war
  discovery on travel, the v9 save round-trip + v8 migration + invalid-waypoint drop, and a
  headless-safe overlay/minimap drive. The save-version assertions in the harness / items / skills
  suites were bumped 8 → 9. The Playwright smoke gained a world-map flow.
- **UI.** `index.html`/`css`: the minimap, the compass, the 🗺️ HUD button and the world-map overlay
  (search · tabs · zoom · guide), plus a new **Map** row in the start-screen controls; `applyStaticI18n`
  now also resolves `data-i18n-ph` placeholders. No `?v=` to bump (content-hashed build).

## [2026-06-23] — Task 14 — Skill & leveling system with 3-skill fusion, a quick-access bar & boss-only skills

Added a full RPG progression layer on top of combat: **leveling + a focus resource**, a roster of
**active skills**, a **3-slot quick bar**, the marquee **3-skill fusion**, and **boss-only skill
drops** — all data-driven and pure-function-tested. **`SAVE_VERSION` → 8** (a new `progress` block
on the player); older saves load at level 1 with the starter skill.

- **Data layer (`src/data/skills.js`).** A new pure module: `SKILL_DB` (6 base skills learned by
  leveling + 4 boss-only skills), `ELEMENTS`/`EFFECTS`, the level/focus curve (`xpToNext`,
  `totalXpToReach`, `maxFocusForLevel`, `levelHealthBonus`, `skillsUnlockedAt`) and the
  **deterministic** fusion math (`fuseSkills`, `fusionCost`, `canFuse`, `skillTier`) — no
  DOM/Babylon refs, so it stays in the type-checked data layer and is unit-tested directly.
- **Leveling & focus.** Kills (scaled by boss/dragon), quest turn-ins and gathering grant **XP**
  (`Skills.xpFor`); a level-up grants **+8 max health** (folded into the player's `base` so the gear
  `recomputeStats` pipeline is untouched), **+8 max focus**, and **auto-learns** newly-unlocked base
  skills. **Focus** is a spell resource that regenerates over time and gates casting. A HUD **level
  badge + XP bar** (top row) and a **focus bar** (under the health bar) read it out live.
- **Active skills.** Four effect families the runtime resolves on the existing systems: **volley**
  (a fan of element-tinted `Projectile`s), **nova** (an AoE burst — with frost **slow** via a new
  isolated `Monster.applySlow`/`slowMul`, and shadow **lifesteal**), **buff** (a timed self buff via
  `applyBuff`) and **heal**. All feature-detect Babylon and never throw headless.
- **Quick bar (hotkeys 1/2/3).** Up to three skills slot onto a bottom-centre HUD bar (cast with
  `1`/`2`/`3` or a tap) with a radial cooldown sweep + focus-cost readout. The **potion belt moved
  one set over to `4`/`5`/`6`** (still fully tap-usable; help text + belt labels updated).
- **Skill fusion (marquee).** Select 2–3 owned skills in the new **✨ Skills & Fusion** overlay
  (`K`) and forge a brand-new skill whose attributes are the pure deterministic blend (strongest
  effect wins; power/cooldown/cost/AoE/count + slow/lifesteal/pierce combined; shared element or
  _Prismatic_ if mixed). It costs **coins + crystals** (tier-scaled); the result is a real,
  slottable, savable skill, reproduced exactly on reload (never re-rolled).
- **Boss-loot skills.** A pool of powerful skills drops **only** from bosses — rolled through the
  seeded `rng()` **after** the existing coin/gear draws (so drop determinism is untouched) and added
  to the roster, one unowned boss skill per kill until all are collected.
- **Persistence.** The whole `progress` block (level/xp, focus, owned + fused skills, the quick-bar
  slots) serializes in the player; legacy < v8 saves default sanely (level 1, starter skill, full
  focus). New procedural SFX cues (`levelup`, `skill_cast`, `fuse`) and full **EN/RU i18n**
  (UI strings + a `skill`/`element`/`effect` RU group + `tSkillName`/`tSkillDesc`/`tElementLabel`/
  `tEffectLabel` resolvers).
- **Tests.** New `test/skills.test.js` (27 cases; Vitest **53 → 80**) covers the curve/focus math,
  level-ups, focus regen + cooldowns, quick-bar assign/activate (volley/nova/buff/heal + gating),
  the fusion blend determinism + cost + charge, boss-drop determinism, the headless-safe overlay,
  skill i18n + RU completeness, and the **v8 save round-trip + migration**. The Playwright boot smoke
  now opens the skills overlay + casts a skill. Full pipeline green; desktop + mobile screenshots
  confirmed the HUD, quick bar and overlay.

## [2026-06-23] — Task 12 — Deep item & equipment system with visible worn gear + a real inventory

Took the gear layer from a flat 8-slot catalogue to a Skyrim-flavoured analog: a **12-slot**
loadout, **enchantments**, **equipment sets**, **gear you can see on the character**, and a real
**tabbed inventory** — all data-driven and pure-function-tested. **`SAVE_VERSION` → 7** (per-instance
affix ids + four new slots); older saves load untouched (no affixes, new slots default empty).

- **Widened loadout (8 → 12 slots).** Added **pauldrons · gloves · belt · cloak** alongside the
  existing helmet/breastplate/boots/necklace/2 rings/2 hands. Each new armour `type` equals its
  slot name, so `equipItem` routes by type with no special-casing; the paper-doll, anvil, save
  schema and worn-gear all iterate `EQUIP_SLOTS`, so the widening flowed through one list.
- **Enchantments (affixes).** A new `AFFIXES` table of prefix/suffix modifiers. Found + crafted
  gear rolls `rollAffixes(def, rng)` — a **deterministic, seeded** draw from the affixes valid for
  the item's category (weapon / armour / jewelry), **count by rarity** (normal 0 · rare 1 · epic 2 ·
  legendary 3). The rolled ids ride on the instance (`inst.affixes`) and **serialize**, so a reload
  reproduces them exactly (no re-roll). `effectiveStats` folds them in — additive stats **scale with
  rarity**, `haste` compounds toward zero — and they surface as localized **chips** on every card,
  slot and tooltip (a deliberate i18n-safe choice over splicing names, which can't agree in Russian).
  Shop gear stays **clean** (no rng disturbance from browsing/buying); boss drops + crafts are
  enchanted.
- **Equipment sets.** `SETS` (**Ironguard** early/buyable, **Dragonscale** from boss loot) grant
  cumulative stat bonuses at piece-count thresholds; `setBonusStats(equipment)` is pure and feeds the
  live recompute, and an **active-set panel** in the inventory shows progress (e.g. *Dragonscale 4/6*)
  with met/unmet bonus chips.
- **One pure stat pipeline.** Refactored the recompute into a pure `deriveStats(base, equipment,
  buffs)` (gear incl. enchant levels + affixes → set bonuses → buffs → weapon profile) shared by the
  live `recomputeStats` **and** the inventory's **compare-vs-equipped** deltas (`equipDelta`, via
  `equippedAfter` — a pure simulate of the equip rules: 2-handed fills both hands, dual-wield, ring
  round-robin). So "what changes if I equip this?" is always exact, sets and all.
- **Visible, animated worn gear.** Helmet, pauldrons, breastplate, gloves, belt, boots and a
  billowing **cloak** are built **once** on Lily's procedural body and **toggled + recoloured by
  rarity** on equip (`refreshWornGear`) — never reallocated, so equip/unequip **can't leak** —
  parented to the body parts so they stride/swing for free, with the cloak getting a frame-rate-
  smoothed billow that **freezes with the pause menu**. Tier-gated via `wornDetailFor(tier)` (the low
  tier drops the lightest pieces + the per-frame sway). Fully feature-detected / headless-safe.
- **Real tabbed inventory.** The bag became **Gear / Materials / Potions** tabs: gear with
  **filter** (All / Weapons / Armour / Jewelry) + **sort** (Rarity / Type / Name), enchant chips and
  the compare deltas; **materials** surfaced as stacks; **potions** quaffable straight from the bag.
  The 12-slot paper-doll shows rarity colour + level + enchant chips and the live stat block + set
  bonuses. (Materials/potions keep their canonical stores — crafting/quests/belt depend on them — and
  are surfaced through the one inventory, so there's zero regression risk.)
- **More gear.** New armour for the new slots across every rarity (Ironguard + Dragonscale set
  pieces, Wings of Dawn, Stormforged/Titan pieces, Quickhand/Shadow gear, …), all localized EN/RU.

Determinism + persistence hold: every roll goes through the seeded `rng()`, affixes + the full
12-slot loadout **round-trip through save/load**, and a v6 file still loads. Pipeline green across
**lint · typecheck · test · build · Playwright E2E**; a real-browser screenshot pass confirmed the
gear renders + layers on the hero and the inventory reads correctly. Vitest: **32 → 53 test cases
across 6 files** (new `test/items.test.js`, 21 cases: affix roll count/pool/determinism, the
affix/rarity stat math + haste compounding, set thresholds + live folding, the widened slot rules +
`equippedAfter` parity, compare deltas, worn-gear build/tier-gating/no-leak, the tabbed inventory
filter/sort/consume, and the v7 round-trip + v6 migration). Content-hashed build — no `?v=` to bump.

## [2026-06-22] — Task 11 — Brighter, more cheerful art direction + a larger visible play area

Re-graded the world out of its washed-out, faint look and **opened the view up**,
all through one new pure, data-driven **`ArtDirection`** seam so the whole pass is
unit-testable without a GPU. No save-schema change (`SAVE_VERSION` stays **6** — the
grade, fog and draw distance are all derived from the zone + the already-persisted
graphics tier, so old saves load untouched).

- **Cheerful colour grade.** A gentle, pure HSV lift (`grade()`: saturation ×1.18,
  value ×1.06, clamped) is applied **once** in the `mat()` / `emat()` helpers, so
  **every** gameplay/foliage/prop/character/ground material reads lusher and more
  saturated while already-vivid candy colours barely move (no neon) and **hue is
  preserved** (each land keeps its identity). The bounce-light (`hemi.groundColor`)
  is graded to match. The **backdrops** (the unlit sky dome, the sea/river sheen)
  deliberately **bypass** the grade via the direct `stdMat`/`stdEmat` path, so
  `DayNight`/`Weather` keep exact control of the sky/fog tint.
- **The view opens up, tier-gated.** Each land's fog density is now the zone base
  scaled by the active tier (`fogDensityFor`): **high ×0.58**, medium ×0.74, **low
  ×0.96**. The meadow's clear-distance roughly **doubles** (fog base 0.006 → 0.0035
  on high) and the deep woods stop feeling like a wall (forest 0.018 → 0.0104; ~74%
  → ~36% fogged at its fence); **indoor lairs blend only halfway** toward the open
  multiplier so caverns/thickets open a little but stay **enclosed + moody**. Phones
  (low tier) keep ~the old density — a tight, atmospheric radius for frame rate. The
  camera **draw distance** (`maxZ`) is set per tier to match (high **360** / medium
  290 / low 210, each clearing its zone's sea-skirt so the opened view never hard-
  clips; the infiniteDistance sky dome is always drawn), and the third-person camera
  framing was pulled back a touch (radius 12 → 13, zoom-out cap 18 → 22). Weather now
  thickens this **graded** fog base, so storms still read on the opened view.
- **Punchy-but-readable tone mapping.** A small per-tier **exposure** nudge (high
  1.08 → 1.10, medium 1.02 → 1.05, low 1.00 → 1.02) makes the brighter palette feel
  sunny without blowing out under ACES; `applyZoneMood` now derives exposure/contrast
  from the same pure `exposureFor`/`contrastFor` helpers, so the per-zone moods (airy
  meadow, moody lairs) are a single source of truth.
- **Readability preserved.** WCAG `luminance`/`contrastRatio` helpers back a new test
  proving gameplay-critical **markers + enemies stay perceptually distinct** from each
  brightened ground (by hue as much as brightness), so nothing washes out.

Perf is effectively **neutral**: thinning fog is a per-pixel shader change (it adds no
geometry — the world is bounded by the zone fence regardless), the grade is a one-time
material tweak, and `maxZ` is *tighter* than the engine default, so culling only
improves. The heavy per-tier costs (PBR / shadows / particles) remain gated by Tasks
3–5. Vitest: **19 → 32 test cases across 5 files** (new `test/artdirection.test.js`,
13 cases: the grade's purity/clamp/hue-preservation, per-tier fog opening + indoor
moodiness, draw-distance ordering, the sane ACES exposure/contrast range, marker
readability, and `buildWorld` applying the graded fog on every tier). Full pipeline
green (lint · typecheck · test · build · Playwright E2E). Content-hashed build — no
`?v=` to bump.

## [2026-06-22] — Task 10 — Fix logical, code & UI bugs + a deeper test net

Hunted down and root-caused the gameplay-correctness defects called out in the
backlog, fixing each at the source and locking it in with a dedicated Vitest
suite (`test/bugfixes.test.js`, 14 cases). No save-schema change (`SAVE_VERSION`
untouched — every fix is derived or transient state, so old saves still load).

- **Roads no longer cross open water off a bridge.** The hub crossroads was laid
  out with a random angle, independent of the river, so a road sliced through the
  water in **every** seed (and its `onRoad` clear-lane was even rotated 90° off
  the visible road mesh). Rebuilt the layout **relative to the river**: one road
  meets the water head-on and earns a real, correctly-sized **bridge** spanning
  its full oblique footprint; the other runs alongside the river (a small jitter
  keeps its crossing beyond the fence). The road mesh, `onRoad`, edges, lampposts
  and bridge placement now share one coherent vector convention. A seeded test
  proves **0 road-over-open-water cells across 40 layouts** (was 40/40), the
  river still blocks elsewhere, and `moveActor` refuses to walk into open water.
- **World resources are hard-capped.** Added `CONFIG.maxResourceNodes` (90),
  enforced at every spawn in `populateAdventure` / `populateWildResources`, so the
  live node count can never grow unbounded across spawn, respawn (which only
  re-enables an existing node), zone travel or reload — covered by cap-invariant
  tests including a forced low cap.
- **Resource pickup audited + hardened.** The walk-up + interact harvest path was
  found robust; hardened `Interactable.distanceTo` so a stale/disposed node (e.g.
  left across a zone swap) returns `Infinity` instead of throwing and breaking
  selection of the valid nodes around it. New regression tests harvest a node
  through the **real interact key** path, immediately **after a zone swap**, and
  across a **respawn re-harvest**.
- **Built castle parts are solid.** Walls, towers and the keep now register
  `{x,z,r}` collision circles in the world's obstacle set (rebuilt on `build()`
  and on save-`restore()`), with the **gate left as a passable gateway**. Because
  the obstacle set is shared, the player is pushed out of the walls **and wand
  bolts splat on them (no shoot-through)** for free, while bolts still fly over
  the top. The build-interact range was widened so raising a part never locks the
  player out. The footprint round-trips through a zone rebuild.
- **The swing lands true.** Melee/ranged damage no longer fires on the **wind-up**;
  it's queued and resolved on the swing's **strike (impact) frame** (from the
  player's live position, in the committed direction), so the hit lines up with
  the animation, stays within arc + range, and lands **exactly once**. Tests
  assert no damage during wind-up, a single in-arc/in-range hit on the strike, and
  out-of-arc/out-of-range misses.

Vitest: **5 → 19 test cases across 4 files** (new `test/bugfixes.test.js`); the
ported harness's melee check was updated to the strike-frame timing. Full
pipeline green (lint · typecheck · test · build · Playwright E2E).

## [2026-06-22] — Task 9 — Modularize the codebase + a production build/test/CI toolchain

Split the 8.3k-line `js/game.js` IIFE into an **ES-module source tree** under
`src/` — `core/config.js` (RNG + CONFIG + PALETTE) and `core/i18n.js` (EN/RU +
`t()` + resolvers); the pure content tables `data/items.js`, `data/content.js`,
`data/story.js`, `data/zones.js`; the runtime monolith `src/game.js`; and the
`src/main.js` composition root — all wired with **explicit `import`/`export`** and
an acyclic dependency graph (data ← i18n ← game ← main). The move was
**mechanical and byte-for-byte**, so behavior is unchanged: the **entire legacy
headless harness (~360 checks) was ported verbatim to Vitest** (`test/harness.test.js`)
and stays green, proving parity.

Stood up the toolchain the rest of the backlog builds on:

- **Build — Vite.** `npm run build` emits a **content-hashed static bundle** into
  `dist/` (served by Pages — the hashing replaces the old `?v=` cache-buster);
  `npm run dev` is an HMR server, `npm run preview` serves the build. **Babylon
  stays on its CDN** (externalized as the `BABYLON` global, never bundled), so the
  published site is still 100% static and the runtime is identical to before.
  `index.html` now loads `src/main.js` as a module.
- **Lint/format — ESLint (flat) + Prettier.** `no-undef` guards every module
  boundary (a missed cross-module import is a hard error); baseline is clean (0
  errors).
- **Types — `tsc --checkJs`.** The clean `core/` + `data/` modules are
  type-checked; the legacy runtime opts out with `@ts-nocheck` (slated for finer,
  individually-typed splits in follow-up runs).
- **Tests — layered.** Vitest **unit/logic** (the ported harness) + **functional**
  flows (`test/functional.test.js`: start → zone travel → save/reload round-trip in
  an isolated boot) + **smoke**, all against faithful Babylon/DOM/Web-Audio stubs
  (`test/setup/stubs.js`); plus a **Playwright** real-browser suite
  (`test/e2e/boot.spec.js`) that boots the built bundle in headless Chromium and
  asserts the canvas comes up with **no console errors** and the core overlays open.
- **CI/CD.** `.github/workflows/ci.yml` runs **install → lint → typecheck → test →
  build → Playwright E2E** (npm cache); the Pages workflow re-runs verify, builds
  `dist/`, and publishes the **built** artifact.
- **Agent ergonomics.** New `ARCHITECTURE.md` (module map + data flow + toolchain)
  and per-directory READMEs; `npm run verify` mirrors the CI fast path.

Revised **Golden Rules 1, 3, 4 & 7** in `CLAUDE.md` + `TODO.md` § 1 to the
module-tree / build-step / Vitest-Playwright-pipeline / content-hashing reality
(per Task 9's *Note on Golden Rules*). No save-schema change (`SAVE_VERSION`
untouched). Test coverage: the ~360 legacy checks are preserved 1:1 in Vitest,
plus 4 new functional/smoke checks and the Playwright boot assertion.

_Follow-up (noted, out of scope here):_ finer single-responsibility splits of the
`src/game.js` runtime into `entities/`, `systems/`, `ui/`, `world/`; and
auto-generating the changelog from commits.

## [2026-06-22] — Task 8 — Extract the changelog into its own `CHANGELOG.md`

Moved the release history out of `TODO.md` § 7 into this dedicated
`CHANGELOG.md` (Keep a Changelog convention: an `## [Unreleased]` section atop a
reverse-chronological, dated list), migrating **every** prior entry verbatim —
dates, task names, the `?v=` notes and the harness-count deltas all preserved.
Adopted a lightweight versioning scheme keyed to the monotonic `index.html`
`?v=` build (documented at the top of this file), and rewired the run workflow so
future runs **append here** instead of growing the backlog file: `TODO.md` § 7 is
now a one-line pointer (heading kept so links don't 404), and § 2 / § 3 / § 6's
run prompt now say "add the entry to `CHANGELOG.md`". `CLAUDE.md` and `README.md`
reference `CHANGELOG.md` as the source of release history and list it in the
project layout. A new harness suite **[34]** (10 checks; total 354 → 364) asserts
`CHANGELOG.md` exists and parses as the expected heading structure (a
`# Changelog` title, exactly one `## [Unreleased]`, the migrated task entries and
their `?v=` build tags), and that `TODO.md` no longer carries dated changelog
entries — so the split can't silently regress. Docs/process only: no playable
bundle change (`?v=` stays **19**) and no save-schema change (`SAVE_VERSION`
untouched).

## [v19] — 2026-06-22 — Task 6: More sound effects + per‑location background ambience

A fuller, fully‑procedural soundscape (still **zero audio files**) built on a new shared **`Mixer`** — one Web
Audio graph routing `Sfx` / `Music` / `Ambience` through **per‑channel bus gains** into a master, with
0..1 channel volumes + a master‑mute that **persist** in `localStorage` (`gg3d_audio`). Richer **SFX**:
per‑surface **footsteps** (grass / stone / sand / snow, fired in stride cadence off the character's
`walkPhase`), a gather/**mine** harvest cue, **quest accept / turn‑in** chimes, a portal **whoosh** on
travel, **UI clicks**, and a hysteresis **low‑health** warning. Every land now has its own **ambient
bed** — meadow **birds + breeze**, forest **wind + creaks**, shore **waves + gulls**, frostpeak **wind
howl**, cavern **drips + drone**, thicket **insects** — selected by a pure, testable `Ambience.bedFor(zone)`
and **crossfaded** (fade‑out + fade‑in, no clicks/pops) when the `ZoneManager` streams between zones.
A small player‑facing **mixer** (`AudioUI`): four volume sliders (Master · Music · Effects · Ambience)
+ a **Mute all** toggle, mirrored on the **start screen** and **pause settings**, EN/RU localized,
applied live and **persisted across reload**. Nothing sounds before the first user gesture (autoplay
policy); ambience scheduling uses `Math.random()` (purely cosmetic) so the seeded gameplay `rng()` stays
deterministic and save/load is untouched. Fully **headless‑safe**: with no `AudioContext` the whole
stack no‑ops, while the pure volume/persistence/mapping logic is still exercised. New harness suite
**[33]** (22 checks; total 332 → 354) covers footstep surface mapping, the per‑zone bed recipes, the
mixer's volume **clamping** + channel validation + **master mute**, the **settings persistence
round‑trip** (survives reload), the headless no‑op path, and — against an injected Web Audio stub — the
**bus‑graph build**, **every SFX cue** firing, **ambience crossfade through all zones**, and
stride‑cadenced **footstep wiring**. No save‑schema change (`SAVE_VERSION` untouched). `index.html`
`?v=` bumped to **19** (css **16**, for the slider/mute styles).

## [v18] — 2026-06-22 — Task 5: More + higher‑quality animation (actions + environment)

A tier‑gated,
fully feature‑detected animation pass. Combat now reads with clear **anticipation → impact →
recovery**: a small, pure **`Swing`** state machine (windup → strike → recover, with leftover time
carried across phase edges so it's **frame‑rate independent**) drives the player's melee arc, ranged
wand thrust and a new **`gather`** chop (hooked into `ResourceNode.harvest`), while `takeDamage` arms a
brief **flinch** recoil. Because both run inside `player.update`, they **pause cleanly** with the menu.
Every land **breathes** via a pure `ambientSpecFor(zone)` → `buildAmbientFX(scene, zone, …)` system:
drifting particles tuned per zone (meadow **pollen**, forest **spores**, **sea mist**, peak **snow**,
cavern **motes**, thicket **embers**) over a few wandering **butterflies** (day) / glowing **fireflies**
(dark), all driven off the clock (frame‑rate independent), **feature‑detected** (`BABYLON.ParticleSystem`
guarded — degrades to just the critter swarm without it), **density‑gated** by a new `Quality` tier
`ambient` knob, and **disposed on zone teardown** (the particle system is freed explicitly; the critter
meshes/materials ride buildWorld's existing auto‑stream‑out — a tracking‑PS smoke proved 6/6 systems
started + disposed, 0 leaked). Wind is now **gustier** (two offset bands) with an optional per‑zone
`theme.wind` strength (windy **peaks** 1.5, breezy **shore** 1.2, sheltered **forest** 0.7). New harness
suite **[32]** (23 checks; total 309 → 332) covers the Swing phase transitions/timers, frame‑rate
independence, the zero/negative‑dt pause freeze, the flinch + gather triggers, the per‑zone ambient
spec + fallback, the tier density gating, and **every zone building + animating + disposing** its
ambient FX headless‑safe (incl. the missing‑`ParticleSystem` path). No save‑schema change
(`SAVE_VERSION` untouched — animation state is transient). `index.html` `?v=` bumped to **18** (css
unchanged at 15).

## [v17] — 2026-06-22 — Graphics‑quality setting (player‑facing tier override)

The auto‑detected
graphics tier can now be **overridden from the pause menu**. A new **Pause → Graphics** selector
(Auto · High · Medium · Low, mirroring the language selector's styling) lets the player force a
tier or return to **Auto** (device detect). `Quality` gains a persisted `pref` with `loadPref()`/
`setPref()`, and `detect()` now resolves the active tier from the saved preference (falling back to
capability detection for "auto"); a tampered/unknown stored value coerces to Auto, and the debug
`window.__GG_QUALITY__` still trumps everything. Because the tier is baked into meshes, materials
and shadows at zone‑build time, a change is applied the **bulletproof** way — `Pause.applyGraphics`
persists the choice, hands the **exact current run** across a reload via the proven `PENDING_LOAD`
hand‑off (the same path "Load Progress" uses), and lets the boot rebuild everything under the new
tier behind the existing **fade veil** ("Applying graphics…"), so **progress is preserved** and
every knob (PBR/env/shadows/post‑FX/mesh density) re‑applies identically to a fresh boot. New
EN+RU strings (`settings.graphics`, `settings.gfx*`, `pause.applyingGfx`); the dynamic hint shows
the Auto‑detected tier and relocalizes live. New harness suite [31] covers manual override, the
Auto fallback, **localStorage persistence (survives reload)**, invalid‑value coercion, the
`__GG_QUALITY__` priority, and the live‑hint string resolution (14 checks; harness 295 → 309).
Headless‑safe (localStorage/DOM feature‑detected). No save‑schema change (`SAVE_VERSION`
untouched). `index.html` `?v=` bumped to **17** (css **15**, for the selector styles).

## [v16] — 2026-06-21 — Task 3: Higher‑fidelity models (character, monsters, trees, stones, environment)

A tier‑gated, fully feature‑detected model + material pass that builds on the Task 4 lighting.
The shared `mat`/`emat` helpers now return an **energy‑conserving `PBRMaterial`** (metallic 0 /
roughness‑driven) on the PBR tiers and fall back to the tuned **`StandardMaterial`** on weak GPUs
and the headless harness; a tiny alias maps the legacy `diffuseColor`/`specularColor` writes
(weapon recolour, NPC markers, water/sea shimmer) onto the PBR channels so **every existing
build/animation path is untouched**, and the unlit sky dome + sea/river sheen stay on a dedicated
`stdMat`/`stdEmat` path. `makeEnvironment` builds a ~6 KB **procedural gradient cube** (warm sky →
cool horizon → dark ground + a soft sun glow — **no asset files**) and installs it as
`scene.environmentTexture` for image‑based **sky reflections**, gated to the desktop tier and
`RawCubeTexture`‑feature‑detected. `gloss()` tightens roughness/metalness for **candy sheen, gem
facets and metal blades** (PBR) or a crisp specular (Standard). The mesh helpers
(`sphere`/`cyl`/`disc`/`capsule`) scale **segment/tessellation density** with the tier, and the
scenery gains **layered, shaded tree canopies on tapered trunks**, **craggier rocks** (icosphere
subdivisions + a satellite chunk on high), **clustered crystal spires**, and **hands** on Lily —
all gated by a per‑tier `foliage` budget so the dense forests/meadow keep their triangle budget
(the mobile tiers never exceed the old geometry; only desktop "high" adds triangles + PBR + the
IBL probe). Per‑flower materials are now **shared** (one stem + one head per palette colour), so
the 140‑flower meadow dropped from ~280 one‑off materials to ~55. New harness suite [30] covers
the model‑fidelity tier data, the **PBR ⇄ Standard fallback**, the diffuse/specular aliases, the
`gloss()` tweak, the env probe, and **every zone building + tearing down on the PBR + env tier**;
a throwaway scene‑tracking browser‑path smoke proved teardown is **leak‑free** (Δmesh/Δmat/Δnode
= 0 across all six zones) with 16–52 PBR materials per zone. No save‑schema change
(`SAVE_VERSION` untouched). `index.html` `?v=` bumped to 16.

## [v15] — 2026-06-21 — Task 4: More + more‑realistic shadows & lighting

A tier‑gated, fully
feature‑detected lighting pass. A new `Quality` module picks one graphics tier
(high/medium/low) from device facts — `Quality.pick()` is a pure, unit‑tested function and
`window.__GG_QUALITY__` can force a tier. `makeSunShadows` replaces the old one‑size shadow
setup with a per‑tier directional‑sun generator: a **CascadedShadowGenerator** with
**contact‑hardening** outdoors on capable desktops, **PCF** on the middle tier, and the cheap
**blurred‑exponential** map on weak GPUs / WebGL1 / indoors — all with tuned
bias/normalBias/darkness + tightened shadow Z‑bounds so casters sit grounded with no acne or
peter‑panning. `setupPostFX` adds **ACES tone mapping** (exposure/contrast) on the scene image
processing, with **bloom** (DefaultRenderingPipeline, medium+high) and **SSAO2** (high only,
`IsSupported`‑checked) layered on the camera once and `try`/caught. `applyZoneMood` tunes
exposure/contrast per zone (bright peaks, moody caverns) via new optional `theme.expMul/conMul/
shadowDark` fields, integrated with the travel hook and kept in sync with `DayNight`/`Weather`
(which still own the sun/sky/fog tint). Every engine‑only API is feature‑detected so the Node
harness stays green; new suite [29] covers tier selection, per‑zone build/teardown of the shadow
generator, post‑FX/`makeSunShadows` headless‑safety, and the per‑zone mood, plus a throwaway
two‑tier (high/low) WebGL2 browser‑path smoke check. No save‑schema change (`SAVE_VERSION`
untouched). `index.html` `?v=` bumped to 15.

## [2026-06-21] — Task 7 — Russian language support

Full **English + Russian** localization.
A new i18n layer — `LOCALES = { en, ru }` flat dictionaries + `t(key, params)` (with
`{placeholder}` interpolation, English fallback and a `plural()` helper for Russian one/few/many)
+ a parallel `RU` object for the data tables (English stays the source; resolvers like
`tItemName`/`tZoneName`/`tQuestTitle` pick the locale and fall back to English). **Every**
user-facing string is routed through it (start screen, HUD, toasts, prompts, shop/inventory/
anvil/crafting/castle/quest-log/dialogue, and all data: zones, NPCs + dialogue, quests, items,
relics, castle parts, bosses, materials, weather/clock). Language selectors on the start screen
and in pause settings switch **live** (re-rendering visible UI, updating `<html lang>`) and the
choice persists in `localStorage`, applied before first paint. New harness suite [28]
(EN/RU key-parity, `t()` interpolation, Russian pluralization, data-translation completeness,
locale persistence round-trip). Headless-safe (localStorage/`querySelectorAll` feature-detected).

## [2026-06-21] — Task 2 — Main story line with missions + side quests

A structured,
chaptered main campaign (`STORY`/`MISSIONS`/`SIDE_QUESTS` + the `Story` controller) that
guides the player from the vale to the dragon with no guesswork — ordered mission unlocks,
a live objective tracker, new `defeat_boss`/`build`/`defeat_dragon` objectives, a chaptered
quest log separating main vs side, optional (some repeatable) side quests, intro/chapter/
ending beats, and v6 save/load of story state (round-tripped in tests). Also fixed a latent
save-file crash (the download filename referenced a non-existent `wave` field).

## [pre-changelog] — Task 1 — RPG world + loadable zones

_(Originally logged as unreleased.)_ **Shipped** (see git history `RPG zones (1–5/n)`),
deployed to Pages.
