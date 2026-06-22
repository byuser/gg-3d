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

In short: Babylon.js only (no rewrite, no build step, static on GitHub Pages);
works on desktop + mobile without freezing; the headless tests
(`node test/harness.js`) must stay green and **feature-detect** all browser-only
APIs; additive single-file style; determinism + save/load round-trip;
procedural-first perf/asset budget with disposal on zone teardown; bump `?v=`
cache-busters; one task per run; i18n-aware; ask before large/irreversible
ambiguity.

---

## 2. Definition of Done (shared — every task must satisfy all)

A task is **done** only when **all** of these are true:

- [ ] Feature fully implemented per the task's **Acceptance criteria** — no
      stubs, placeholders, dead code, or `TODO`s left behind.
- [ ] `node -c js/game.js` is clean and `node test/harness.js` is **all green**.
- [ ] **New automated tests** added to `test/harness.js` covering the feature's
      logic (and any new save/load fields), plus a short note in the README
      "Tests" blurb if a new suite was added.
- [ ] **No regressions** to existing systems: combat, gear/economy, quests,
      crafting, zones/travel, day‑night/weather, pause, and **save/load**.
- [ ] Browser‑only APIs are **feature‑detected**; the headless harness still runs.
- [ ] New persistent state is serialized/restored and round‑trips in a test.
- [ ] `index.html` / `css/style.css` updated as needed and **`?v=` bumped**.
- [ ] `README.md` updated (relevant section + roadmap checkbox).
- [ ] The **CI `Tests` run is green** (`.github/workflows/ci.yml` runs
      `node -c` + the harness on every push/PR — never merge red).
- [ ] Work committed in logical chunks; branch merged to `master`
      (fast‑forward) and pushed; the **GitHub Pages deploy run for your commit
      finished with `conclusion: success`** (check it; fix any errors).
- [ ] This file updated: tick the task's checkbox, add the date and a one‑line
      note; commit + push that too.
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
3. Implement on the dev branch **`claude/lucid-mayer-wtmqgq`** (create it if it
   doesn't exist). Commit in logical chunks; end commit messages with the
   `Co-Authored-By` / `Claude-Session` trailers used in this repo's history.
4. Verify continuously: `node -c js/game.js`, `node test/harness.js`, and a
   feature‑specific smoke check (e.g. a tiny throwaway Node script that boots the
   game with the harness stubs and exercises the new code path).
5. Update `index.html`/`css` (+ `?v=`) and `README.md`.
6. Merge to `master` (fast‑forward) and push with retry/backoff. Confirm the
   `deploy-pages.yml` run for your commit is `success` via the GitHub Actions
   API/tools; fix any failure.
7. Tick the checkbox here, commit, push, and report.

---

## 4. The backlog (Tasks 2–7)

> Task 1 (RPG world + loadable zones) is already shipped. The backlog continues
> at Task 2.

### Task 2 — Main story line with missions + side quests
- **Status:** `[x]` — 2026-06-21 · Shipped a declarative `STORY`/`MISSIONS`/`SIDE_QUESTS`
  campaign (5 chapters, 16 ordered main missions + 6 side quests) over the existing `Quests`
  engine, with new `defeat_boss`/`build`/`defeat_dragon` objective types, a `Story` controller
  for ordered unlocks + a guided HUD tracker (no guesswork), a chaptered quest log (main vs
  side), intro/chapter/ending beats, v6 save/load of story state, and a new harness suite [27].
- **Depends on:** none (builds on the existing `Quests` system).
- **Goal.** Turn the loose quest chains into a **structured main story** with
  ordered **chapters/missions** that guide the player across the zones to the
  castle→dragon finale, plus optional **side quests** for extra rewards.
- **Scope (build this):**
  - A `STORY`/`CAMPAIGN` data structure: ordered **chapters**, each with one or
    more **missions** (objective + giver + reward + the next step it unlocks).
    Reuse the existing objective types (`hunt`/`gather`/`reach`/`talk`) and add
    any new ones you need (e.g. `defeat_boss <zone>`, `build <castle part>`,
    `escort`/`deliver`) — each must be testable headlessly.
  - **Gating/unlocks:** missions unlock in order; later zones/lair bosses tie
    into the main line (e.g. "clear the Crystal Caverns" as a story beat).
  - **Side quests:** a pool of optional, repeatable‑or‑one‑shot quests
    (bounties/gathering/escort) available from NPCs, clearly separated from the
    main line in the quest log.
  - **Presentation:** a chaptered **quest log** (group main vs side, show
    current chapter + progress), an on‑screen **objective tracker** for the
    active main mission, short **dialogue beats** at key moments (reuse the
    `Dialogue` overlay), and a meaningful **intro + ending** framing.
  - Rewards wired through the existing economy (coins/gear/relics/materials).
- **Acceptance criteria:**
  - A new player can follow the main line from start to the dragon **purely by
    following objectives** (no guesswork); each step unlocks the next.
  - Side quests are accept/track/turn‑in independently and don't block the main
    line; the quest log clearly separates them.
  - Story progress (current chapter, completed missions, side‑quest state)
    **serializes and round‑trips** through save/load.
  - All objective types resolve correctly and pay rewards once.
- **Tests to add:** mission ordering/unlock flow; each objective type
  accept→progress→turn‑in→reward; main‑vs‑side separation; story‑state save/load
  round‑trip; "finishing the last main mission enables the finale".
- **Files:** `js/game.js` (`Quests`, `NPC_DATA`, new `STORY` table, quest‑log UI
  helpers), `index.html`/`css` (quest‑log chapters, tracker), `test/harness.js`,
  `README.md`.
- **Out of scope:** voice‑over, branching multi‑ending trees (keep one coherent
  main line; small optional branches are fine if fully tested).
- **Hints:** keep the data **declarative** so the agent and tests can reason
  about it; drive UI from the data, not hard‑coded strings.

### Task 3 — Higher‑fidelity models (character, monsters, trees, stones, environment)
- **Status:** `[x]` — 2026-06-21 · Shipped a tier‑gated, feature‑detected model/material pass:
  `mat`/`emat` now return **`PBRMaterial`** (metallic/roughness) on capable tiers with a
  **`StandardMaterial` fallback** (a small alias maps the legacy `diffuseColor`/`specularColor`
  writes onto PBR so every build/anim path is untouched); a tiny **procedural cube** env probe
  (`makeEnvironment`, no asset files) gives image‑based sky reflections; `gloss()` adds candy
  sheen / gem facets / blade sheen; mesh helpers scale **segment density** by tier and the scenery
  gains layered, shaded tree canopies on tapered trunks, craggier rocks + clustered crystals, and
  Lily gets hands. Per‑flower materials are now **shared** (the dense meadow dropped from ~280 to
  ~55 materials). Phones stay on lighter geometry (≤ the old counts); only desktop "high" adds
  triangles + PBR + the IBL probe. New harness suite [30] + a scene‑tracking browser‑path smoke
  proving **leak‑free** teardown. No save‑schema change.
- **Depends on:** best done **after Task 4** (lighting) so materials read well.
- **Goal.** Make every model look noticeably **richer and prettier** within the
  mobile + static‑hosting budget. "Realistic" here = **stylized‑PBR / higher
  detail**, *not* photoreal (that's not viable on Pages + phones).
- **Scope (build this):**
  - Upgrade materials to **`PBRMaterial`** (metallic/roughness) with a small
    **environment texture** for image‑based lighting, where it improves looks and
    perf allows; keep `StandardMaterial` fallbacks behind feature detection.
  - Higher‑detail **procedural meshes**: more shape/segment detail and better
    silhouettes for Lily, the sweets/monsters, trees (trunk taper + layered
    canopy), rocks, crystals, and key props — without exploding tri counts.
  - Optional: a **few small glTF assets** for hero props *iff* they stay tiny,
    lazy‑loaded via `babylonjs.loaders`, with a procedural fallback. Procedural
    is preferred.
  - A **quality tier** (auto‑detected: high on desktop, lower on mobile/weak
    GPUs) controlling mesh density / PBR / env so phones stay smooth.
- **Acceptance criteria:**
  - Models are visibly improved; the scene holds **≥ ~45–60 fps** on a mid‑range
    phone (document how you checked / the budget you kept).
  - Quality tier degrades cleanly; nothing throws on low‑end or headless.
  - All new meshes/materials are **disposed on zone teardown** (no leaks across
    travel — verify with the existing teardown path).
  - Repo stays lightweight (no large binaries; any asset is small + fallback‑ed).
- **Tests to add:** zones still build/teardown without leaking (extend the zone
  suite); quality‑tier selection is a pure, testable function; feature‑detect
  guards verified headless.
- **Files:** `js/game.js` (mesh builders/helpers `mat`/`emat`/`sphere`/…,
  `buildWorld`, `Player`/`Monster` `_build`), maybe a tiny `assets/` dir,
  `test/harness.js`, `README.md`.
- **Out of scope:** photoreal textures, multi‑MB texture packs, a full art
  pipeline.

### Task 4 — More + more‑realistic shadows & lighting
- **Status:** `[x]` — 2026-06-21 · Shipped tier‑gated, feature‑detected lighting: a new `Quality`
  module auto‑detects a graphics tier (high/medium/low) from device facts (pure, tested `pick()`);
  `makeSunShadows` builds the sun's shadow generator per tier — **cascaded + contact‑hardening** on
  capable desktops, **PCF** in the middle, **blurred‑exponential** on weak GPUs/WebGL1 — with tuned
  bias/normalBias/darkness so casters sit grounded; `setupPostFX` wires **ACES tone mapping** plus
  tier‑gated **bloom** and **SSAO2** onto the camera once; and `applyZoneMood` gives each zone its
  own exposure/contrast mood (airy peaks, moody lairs) on top of `DayNight`/`Weather`. New harness
  suite [29] + a two‑tier browser‑path smoke check. No save‑schema change.
- **Depends on:** none (do **before** Task 3 ideally).
- **Goal.** Make light and shadow look believable and grounded across all zones
  and times of day, without tanking performance.
- **Scope (build this):**
  - Better **sun shadows**: higher‑quality shadow mapping (PCF/contact‑hardening
    or a **cascaded shadow map** for the directional sun), tuned bias/darkness so
    objects feel grounded; ensure all relevant casters/receivers are registered.
  - **Tone mapping / exposure** (ACES) + optional **image‑based lighting** env so
    materials sit in a coherent light.
  - Optional, perf‑gated: soft **ambient occlusion** (SSAO2) and subtle bloom for
    emissive props — both behind the quality tier + feature detection.
  - Per‑zone light moods that read well in indoor lairs vs open lands; integrate
    cleanly with `DayNight`/`Weather` (which already tint sun/sky/fog).
- **Acceptance criteria:**
  - Shadows are crisper and correctly grounded in **every** zone and at day/dusk/
    night; no peter‑panning/acne in the common cases.
  - Effects are **feature‑detected** and **tier‑gated**; disabling them (low tier
    / unsupported / headless) never throws and keeps ~60 fps.
  - `DayNight` + `Weather` still drive the scene correctly (indoor zones stay
    dark); no regressions to their tests.
- **Tests to add:** lighting/shadow setup runs headless without throwing;
  quality‑tier gating is a pure testable function; DayNight/Weather still pass.
- **Files:** `js/game.js` (`buildWorld` lighting/shadow setup, `DayNight`,
  `Weather`, a small post‑process/quality module), `test/harness.js`, `README.md`.

### Task 5 — More + higher‑quality animation (actions + environment)
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

### Task 6 — More sound effects + per‑location background ambience
- **Status:** `[x]` — 2026-06-22 · Shipped a fuller, fully‑procedural soundscape (no audio files) on a
  new shared **`Mixer`** (one Web Audio graph: `Sfx`/`Music`/`Ambience` → per‑channel bus gains → master,
  with 0..1 volumes + a master mute persisted in `localStorage`). New **SFX**: per‑surface **footsteps**
  (grass/stone/sand/snow, stride‑cadenced off `walkPhase`), gather/mine, quest accept/turn‑in chimes, a
  portal **whoosh** on travel, UI clicks and a hysteresis **low‑health** warning. Each land gets a unique
  **ambient bed** (meadow birds+breeze, forest wind+creaks, shore waves+gulls, peak wind howl, cavern
  drips+drone, thicket insects) chosen by a pure `bedFor(zone)`, **crossfaded** on zone travel via
  `ZoneManager` (no clicks/pops). A 4‑slider mixer (Master/Music/Effects/Ambience) + **Mute all** lives on
  the start screen **and** pause settings (`AudioUI`), localized EN/RU, persisted across reload. Nothing
  plays before the first user gesture; ambience uses `Math.random()` (cosmetic) so the seeded gameplay
  `rng()` stays deterministic. Fully headless‑safe (no `AudioContext` ⇒ silent no‑op). New harness suite
  **[33]** (22 checks; total 332 → 354): footstep surface mapping, the pure per‑zone bed recipes, mixer
  clamp/channel‑validation/mute, the settings persistence round‑trip (survives reload), the no‑context
  no‑op path, and — against an injected Web Audio stub — the bus‑graph build, **every** SFX cue firing,
  ambience crossfade through all zones, and stride‑cadenced footstep wiring. No save‑schema change
  (`SAVE_VERSION` untouched — audio prefs persist to `localStorage` like locale/graphics). `index.html`
  `?v=` bumped to **19** (css **16**).
- **Depends on:** none (slots onto zones + the existing `Sfx`/`Music`).
- **Goal.** A fuller, higher‑quality soundscape: more **SFX** and a unique
  **ambient bed** per location, mixed well and toggleable.
- **Scope (build this):**
  - Expand the procedural **`Sfx`** library: footsteps (per surface), gather/mine,
    quest accept/turn‑in, level/zone transition, UI clicks, portal whoosh,
    low‑health warning, richer boss/impact cues. Keep the synth quality high.
  - **Per‑zone ambience beds** (procedural Web Audio preferred): meadow birds +
    breeze, forest wind + creaks, shore waves + gulls, peaks wind howl, cavern
    drips + reverb, thicket insects. **Crossfade** when traveling between zones
    (hook `ZoneManager`).
  - A small **mixer**: master + music + sfx + ambience buses, with mute/volume
    controls in the start screen and pause settings; persist the choice.
  - Optional small looped audio files allowed **only** if procedural can't hit
    the quality bar — small, lazy‑loaded, with a procedural/no‑op fallback.
- **Acceptance criteria:**
  - Each zone has a distinct ambient bed that **crossfades on travel** with no
    clicks/pops; SFX fire on the right events; nothing plays before the first
    user gesture (autoplay policy).
  - Volume/mute settings work and **persist** across reload; muting is total.
  - Fully **headless‑safe** (no `AudioContext` in Node ⇒ no‑ops, no throws).
- **Tests to add:** the mixer/volume/persistence logic is pure + testable;
  zone→ambience mapping is a testable function; `Sfx.play(name)` never throws for
  any defined cue headless; settings round‑trip.
- **Files:** `js/game.js` (`Sfx`, `Music`, new `Ambience`/mixer, `ZoneManager`
  hook, settings + persistence), `index.html`/`css` (audio settings UI),
  `test/harness.js`, `README.md`.

### Task 7 — Russian language support (selectable at start + in pause settings)
- **Status:** `[x]` — 2026-06-21 · Shipped full **English + Russian** localization: an i18n layer
  (`LOCALES = { en, ru }` + `t(key, params)` with interpolation/plurals, persisted in
  `localStorage`) drives all UI/dynamic strings, while the data tables keep English as the source
  and a parallel `RU` object supplies Russian via per-field resolvers. Retrofitted **every**
  user-facing string (start screen, HUD, toasts, prompts, all overlays + every data table). Added
  EN/RU language selectors on the start screen + pause settings (live re-render, `<html lang>`),
  and a new harness suite [28] (key-parity, interpolation, pluralization, data completeness,
  locale persistence) plus a feature smoke check.
- **Depends on:** none. **Recommended FIRST** so later tasks add bilingual
  strings as they go (see Golden Rule 9).
- **Goal.** Full **English + Russian** localization, switchable from the **start
  screen** and the **pause → settings**, applied live and persisted.
- **Scope (build this):**
  - An **i18n layer**: `LOCALES = { en, ru }` dictionaries + a `t(key, params)`
    function (with interpolation + simple pluralization where needed) + the
    current‑locale state persisted in `localStorage`.
  - **Retrofit every user‑facing string** through `t()`: static `index.html`
    text (start screen, controls, overlays, buttons), dynamic JS toasts/labels/
    prompts, and **data‑table** strings — zone names, NPC names + dialogue,
    quest titles/stories, item names/descriptions, weather/clock labels, etc.
    (Prefer keys/ids in data tables, with display names resolved via `t()`.)
  - A **language selector** on the start screen and in pause settings; switching
    **re‑renders** all visible UI immediately (no reload needed) and updates the
    `<html lang>`.
  - Complete, natural **Russian** translations for everything (not machine‑literal
    placeholders); keep the layout intact for longer strings.
- **Acceptance criteria:**
  - Toggling EN⇄RU updates **100% of visible text** live; no English leaks in RU
    mode (and vice‑versa). Verify there are **no missing keys** in either locale.
  - The choice **persists** across reload and applies before first paint.
  - Headless‑safe (`localStorage`/DOM feature‑detected); harness stays green.
- **Tests to add:** **key‑parity test** (every key in `en` exists in `ru` and
  vice‑versa); `t()` interpolation/pluralization; locale persistence round‑trip;
  a sampling of data‑table names resolve in both locales.
- **Files:** `js/game.js` (new `I18N`/`Locale`, retrofit all strings, settings +
  persistence), `index.html` (string ids / data‑i18n hooks + selector markup),
  `css` (selector + settings), `test/harness.js`, `README.md`.
- **Hints:** centralize the dictionary; give every UI element a stable key;
  resolve data‑table display names through `t()` so future content stays
  translatable. Add a lint‑style test that **fails on any untranslated key**.

---

## 5. Recommended order

Tasks are mostly independent, but this order minimizes rework:

1. **Task 7 — Russian/i18n** *(first: later tasks then add bilingual strings)*
2. **Task 4 — Lighting & shadows** *(visual foundation)*
3. **Task 3 — Models/sprites** *(reads best under the new lighting)*
4. **Task 5 — Animation** *(animates the improved models)*
5. **Task 6 — Audio & per‑zone ambience**
6. **Task 2 — Story, missions & side quests** *(content capstone)*

If you skip ahead, still obey Golden Rule 9 (route new strings through i18n once
it exists) and the shared Definition of Done.

---

## 6. Run prompt

Paste this to start a run. Replace `<N>` with the task number, or write `next`.

```text
Act as a senior gameplay engineer on "Good Game 3D" — a Babylon.js browser
action-RPG in this repo, shipped as static files to GitHub Pages.

FIRST, read CLAUDE.md and TODO.md in full.

DO EXACTLY ONE TASK: Task <N>. (If I wrote "next", take the first task whose
status is [ ] in TODO.md's "Recommended order".) Don't touch any other task or
scope-creep.

Ship it RELEASE-READY and fully functional: a player can use it on desktop AND
mobile with no errors, no console exceptions, no freezes, and saved progress
survives reload. No stubs, placeholders, dead code, or leftover TODOs.

Non-negotiables (full list in CLAUDE.md → Golden Rules; satisfy TODO.md §2
Definition of Done):
- Engine stays Babylon.js — no framework rewrite, no build step/bundler; stays a
  static GitHub-Pages site.
- Works on desktop + mobile; never freeze the main thread (chunk heavy work; hide
  unavoidable hitches behind the existing zone-transition fade veil).
- Keep the headless tests green AND add new tests for what you build:
  `node -c js/game.js` and `node test/harness.js` must pass. Feature-detect every
  browser-only API (Babylon / DOM / Web Audio / localStorage / PBR / particles)
  so the Node harness still runs.
- All randomness via the seeded rng(); any new persistent state must serialize +
  restore in serializeGame/applySave and round-trip in a test.
- No regressions to combat, gear, quests, zones/travel, day-night/weather, pause,
  or save/load.

Workflow:
1. Plan briefly, then implement on branch `claude/lucid-mayer-wtmqgq` (create if
   missing); commit in logical chunks using this repo's commit-trailer convention.
2. Verify locally: `node -c js/game.js`, `node test/harness.js` (all green), plus
   a tiny feature-specific headless smoke check.
3. Update index.html/css (bump the `?v=` cache-busters) and README.md as needed.
4. Merge to `master` (fast-forward) and push. Then confirm BOTH the CI "Tests"
   run AND the Pages deploy run for your commit finished conclusion=success — fix
   anything until both are green. Do not open a pull request.
5. Tick the task's checkbox in TODO.md (add the date + a one-line note) and add a
   Changelog entry; commit + push.
6. Report: what shipped, the test results, and the CI + deploy status.

If a decision is genuinely mine and cheap to confirm, pick the sensible default
and note it; if it's expensive or irreversible, ask me first.
```

---

## 7. Changelog

- 2026-06-22 · **Task 6 — More sound effects + per‑location background ambience**: a fuller,
  fully‑procedural soundscape (still **zero audio files**) built on a new shared **`Mixer`** — one Web
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
- 2026-06-22 · **Task 5 — More + higher‑quality animation (actions + environment)**: a tier‑gated,
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
- 2026-06-22 · **Graphics‑quality setting (player‑facing tier override)**: the auto‑detected
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
- 2026-06-21 · **Task 3 — Higher‑fidelity models (character, monsters, trees, stones, environment)**:
  a tier‑gated, fully feature‑detected model + material pass that builds on the Task 4 lighting.
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
- 2026-06-21 · **Task 4 — More + more‑realistic shadows & lighting**: a tier‑gated, fully
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
- 2026-06-21 · **Task 7 — Russian language support**: full **English + Russian** localization.
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
- _(unreleased)_ Task 1 — RPG world + loadable zones: **shipped** (see git history
  `RPG zones (1–5/n)`), deployed to Pages.
- 2026-06-21 · **Task 2 — Main story line with missions + side quests**: a structured,
  chaptered main campaign (`STORY`/`MISSIONS`/`SIDE_QUESTS` + the `Story` controller) that
  guides the player from the vale to the dragon with no guesswork — ordered mission unlocks,
  a live objective tracker, new `defeat_boss`/`build`/`defeat_dragon` objectives, a chaptered
  quest log separating main vs side, optional (some repeatable) side quests, intro/chapter/
  ending beats, and v6 save/load of story state (round-tripped in tests). Also fixed a latent
  save-file crash (the download filename referenced a non-existent `wave` field).
