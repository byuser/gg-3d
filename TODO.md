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

## 4b. The backlog (Tasks 8–15) — production hardening & RPG depth

> Tasks 8–15 were added to take *Good Game 3D* from "feature‑complete demo" to
> **production‑grade, agent‑maintainable RPG**. They are written to the same bar
> as Tasks 2–7 (each is one end‑to‑end release‑ready run) but several are
> **foundational** and deliberately **revise the Golden Rules** — read each
> task's *Note on Golden Rules* before starting. Recommended ordering is in
> [§ 5](#5-recommended-order).

### Task 8 — Extract the changelog into its own `CHANGELOG.md`
- **Status:** `[x]` — 2026-06-22 · Migrated the full § 7 log verbatim into a dedicated
  `CHANGELOG.md` (Keep a Changelog: `[Unreleased]` atop a reverse‑chronological dated list,
  versioned by the monotonic `?v=` build), turned § 7 into a one‑line pointer, rewired § 2/§ 3/§ 6 +
  `CLAUDE.md` + `README.md` to append there, and added a doc‑lint harness suite [34] (10 checks;
  354 → 364) so the split can't silently regress. Docs/process only — no bundle change (`?v=` 19).
- **Depends on:** none. **Do this first** — it is cheap, unblocks every later
  run (no more 100‑line diffs to `TODO.md` just to log a release), and large
  projects with good reviews universally keep history out of the planning doc.
- **Goal.** Move the release history out of `TODO.md` § 7 into a dedicated,
  conventional **`CHANGELOG.md`** at the repo root, and rewire the run workflow so
  future runs append there instead of growing the backlog file.
- **Scope (build this):**
  - Create **`CHANGELOG.md`** following the *Keep a Changelog* convention
    (reverse‑chronological, an `## [Unreleased]` section at the top, dated
    `## [x] — YYYY‑MM‑DD` entries below). Migrate **every** existing entry from
    `TODO.md` § 7 verbatim (preserve dates, task names, the `?v=` notes and the
    harness‑count deltas — they are referenced by later tasks).
  - Adopt a lightweight, human‑ + agent‑readable **versioning scheme**. Since the
    site is a single static bundle, key entries to the `index.html` `?v=`
    cache‑buster (already monotonic) and/or a semver line — pick one, document it
    at the top of `CHANGELOG.md`, and apply it consistently.
  - In `TODO.md`: replace § 7's body with a one‑line pointer to `CHANGELOG.md`
    (keep the heading so existing links don't 404). Update the **Run prompt**
    (§ 6 step 5) and **Standard workflow** (§ 3) so "add a Changelog entry" now
    means *append to `CHANGELOG.md`*, not edit `TODO.md`.
  - Update `CLAUDE.md` and `README.md` to reference `CHANGELOG.md` as the source
    of release history; add it to the *Project layout* list.
- **Acceptance criteria:**
  - `CHANGELOG.md` exists, contains **all** prior entries with no content loss,
    and renders correctly on GitHub.
  - `TODO.md` no longer carries the full log; § 6's run prompt directs future runs
    to `CHANGELOG.md`. No dangling internal links anywhere (`grep` for `#7`,
    `Changelog`).
  - This task's own entry is recorded **in `CHANGELOG.md`** (dog‑foods the new
    flow), proving the loop works.
- **Tests to add:** a tiny doc‑lint check in the harness (or a standalone Node
  script wired into CI) that asserts `CHANGELOG.md` exists, parses as the expected
  heading structure, and that `TODO.md` no longer contains dated changelog
  entries — so the split can't silently regress.
- **Files:** new `CHANGELOG.md`, `TODO.md` (§ 3, § 6, § 7), `CLAUDE.md`,
  `README.md`, `test/harness.js` (or a new `test/docs.test.js`), CI workflow if a
  new script is added.
- **Out of scope:** rewriting git tags/releases; auto‑generating the log from
  commits (a future nicety — note it as a follow‑up).

### Task 9 — Modularize the codebase + a production build/test/CI toolchain for agentic edits
- **Status:** `[x]` — 2026-06-22 · Split the 8.3k-line `js/game.js` IIFE into an ES-module tree
  under `src/` (`core/config`+`core/i18n`, `data/items`+`content`+`story`+`zones`, the runtime
  `game.js`, composed by `main.js`) with explicit imports and **zero behavioral change** — the
  full legacy harness (~360 checks) was ported verbatim to **Vitest** and stays green, proving
  parity. Added a **Vite** build (Babylon stays CDN-externalized; output is a hashed static
  `dist/` for Pages — content hashing replaces the `?v=` cache-buster), **ESLint** (flat,
  `no-undef` guards the module seams) + **Prettier**, **`tsc --checkJs`** typechecking (the clean
  `core/`+`data/` modules are checked; the legacy runtime opts out, slated for finer splits),
  a layered test suite (Vitest **unit/logic** + **functional** flows + **Playwright** real-browser
  boot smoke with no console errors), a staged **CI** (lint→typecheck→test→build→E2E) and a
  build-and-publish **deploy** workflow, plus `ARCHITECTURE.md` + per-dir READMEs and the npm
  scripts that mirror CI. Golden Rules 1/3/4/7 revised in `CLAUDE.md` + §1. No save-schema change.
- **Depends on:** none, but it is **foundational** — doing it early makes every
  later task smaller, more targeted, and safer to edit/build/test autonomously.
- **Note on Golden Rules (IMPORTANT — this task revises them):** the current
  Golden Rules 1 & 4 mandate a *single 8k‑line IIFE in `js/game.js`* with *no
  build step* so GitHub Pages serves it raw. That single‑file constraint is the
  #1 obstacle to **targeted, controllable AI edits** (every change risks a huge
  file; merge conflicts are constant; blast radius is the whole game). This task
  **supersedes** those two rules with a **module architecture + a build step
  whose published output is still 100% static files on GitHub Pages**. Update
  `CLAUDE.md` and `TODO.md` § 1 to the new rules as part of the run. Everything
  else (determinism, save round‑trip, headless‑safety, perf/asset budget,
  feature detection, mobile support) **still applies**.
- **Goal.** Split `js/game.js` into a clear **ES‑module** source tree by system,
  add a **modern build system** that bundles to a hashed static artifact for
  Pages, and stand up a **robust, multi‑layer test framework** (unit + logic +
  functional/integration + real‑browser UI) so an agent can fix one module,
  rebuild, and prove the change in isolation.
- **Scope (build this):**
  - **Module split.** Carve the IIFE into cohesive ES modules under `src/`
    mirroring the architecture quick‑map — e.g. `src/core/` (`config`, `rng`,
    `save`, `i18n`, `quality`), `src/world/` (`zones`, `buildWorld`,
    `ZoneManager`, `SpawnDirector`, `ResourceNode`), `src/entities/` (`Player`,
    `Monster`, `Boss`, `Dragon`, `Projectile`), `src/systems/` (`Quests`/`Story`,
    `Inventory`/`Shop`/`Anvil`, `Crafting`, `DayNight`, `Weather`,
    `Sfx`/`Music`/`Mixer`), `src/ui/` (HUD, overlays, `Pause`, settings),
    `src/main.js` (composition root). Keep each module **single‑responsibility**
    with explicit `import`/`export` (no hidden globals); preserve the test seam
    (`window.__GG_TEST__`) as an explicit export surface.
  - **Build system.** Add **Vite** (or esbuild — pick one, justify it briefly)
    producing a hashed, minified static bundle into `dist/` that GitHub Pages
    serves. `npm run dev` = HMR dev server; `npm run build` = production bundle;
    `npm run preview` = serve `dist/`. Keep Babylon on the CDN (externalized) **or**
    bundle it — decide and document. The deploy workflow must publish the **built**
    artifact; the cache‑buster (`?v=`) is replaced by content hashing.
  - **Type safety (lightweight).** Add **JSDoc + `tsc --checkJs`** type checking
    (no rewrite to TS required) or migrate hot modules to `.ts` — pick
    the lowest‑friction path that gives editors/agents real type errors. Wire a
    `npm run typecheck` into CI.
  - **Lint/format.** Add **ESLint + Prettier** with a config tuned for this code,
    plus an `npm run lint`. Fix existing violations so the baseline is clean.
  - **Test framework, layered (how shipped games do it):**
    - **Unit/logic:** migrate the bespoke `test/harness.js` checks to **Vitest**
      (keeps Node speed, gives watch mode, coverage, parallelism, rich asserts).
      Preserve every existing assertion (≈350+ checks) — no coverage loss.
    - **Functional/integration:** boot the assembled game against the
      Babylon/DOM stubs and drive whole flows (travel between zones, accept→turn
      in a quest, craft→equip, save→reload round‑trip) as black‑box tests.
    - **Real‑browser UI/E2E:** add **Playwright** smoke + UI tests that launch
      the built site headless‑Chromium, assert the canvas boots with **no console
      errors/exceptions**, the start screen + pause menu + inventory open, and a
      scripted input sequence runs without throwing. Gate it so CI can run it on
      a runner with a browser.
  - **CI.** Expand `.github/workflows/ci.yml` into stages: install → lint →
    typecheck → unit/logic (Vitest) → build → Playwright E2E against the build.
    Cache `node_modules`. Keep it green and fast; fail the deploy on any red.
  - **Agent ergonomics.** Add a top‑level `ARCHITECTURE.md` (module map + data
    flow) and per‑directory `README`s so an agent can locate the right module
    instantly. Add `npm` scripts that mirror exactly what CI runs so a run can
    self‑verify locally.
- **Acceptance criteria:**
  - The game **plays identically** to today (no gameplay/visual/audio regression,
    saves still load) but is now built from `src/**` modules into a static `dist/`
    that deploys to Pages with **no behavioral change** for players.
  - `npm ci && npm run lint && npm run typecheck && npm test && npm run build &&
    npm run test:e2e` all pass locally and in CI from a clean checkout.
  - Editing **one module** and rebuilding is sufficient to ship a fix — verified
    by making a trivial isolated change and showing only that module + the bundle
    hash change.
  - All prior harness assertions survive the migration (document the count
    before/after; no silent drops).
- **Tests to add:** the migrated Vitest suites (parity with the old harness), the
  new functional flow tests, the Playwright boot/UI smoke, and a CI job that
  proves the built `dist/` runs error‑free in a browser.
- **Files:** new `src/**` tree, `vite.config.*`/`esbuild` script, `package.json`
  (+ scripts, devDeps), `tsconfig.json`/`jsconfig.json`, `.eslintrc`,
  `.prettierrc`, `playwright.config.*`, `test/**` (Vitest + E2E), reworked
  `.github/workflows/*.yml`, `CLAUDE.md` + `TODO.md` § 1 (revised rules),
  `ARCHITECTURE.md`, `README.md`, `index.html` (module entry).
- **Out of scope:** rewriting gameplay logic while moving it (move first, refactor
  later in separate runs); adopting a UI framework (React/etc. — not needed);
  server‑side anything.
- **Hints:** do the split **mechanically first** (move code, wire imports, keep
  behavior byte‑for‑byte) and let the test suite prove parity *before* any
  cleanup. Keep Babylon feature‑detection intact across module boundaries.

### Task 10 — Fix logical, code & UI bugs (pathing, resource caps, pickup, collision, projectiles, swing) + a deeper test net
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

### Task 11 — Brighter, more cheerful art direction + a larger visible play area
- **Status:** `[x]` — 2026-06-22 · Shipped a pure, data-driven **`ArtDirection`** seam: `grade()`
  lifts saturation/value on every `mat`/`emat` colour (lush terrain/foliage, candy still pops, hue
  preserved, clamped) with the sky/sea backdrops bypassing it so `DayNight` keeps exact control;
  `fogDensityFor(zone, tier)` **opens the fog per tier** (high ×0.58 ≈ doubles the meadow's view,
  low ×0.96 stays tight; indoor lairs blend halfway → still moody); `view(tier).maxZ` widens the
  camera draw distance to match (360/290/210) + a small framing pull-back; a per-tier exposure nudge
  keeps it punchy-but-readable under ACES (`applyZoneMood` now derives from pure `exposureFor`/
  `contrastFor`); Weather thickens the graded fog base. New `test/artdirection.test.js` (13 cases;
  Vitest 19 → 32) covers grade purity/clamp/hue, per-tier fog opening + indoor moodiness, draw-
  distance ordering, sane ACES range, marker readability, and `buildWorld` applying the graded fog.
  No save-schema change (`SAVE_VERSION` 6). Perf-neutral (fog/grade/exposure aren't geometry).
- **Depends on:** plays best **with/after Task 4** (lighting) since exposure/tone
  mapping interact; coordinate the two.
- **Goal.** The world currently reads **faint/washed‑out** and the **visible area
  is small** (tight camera + heavy fog). Re‑grade the palette to a vivid, cheerful
  stylized look (think the warm, saturated readability of well‑reviewed
  stylized adventures) and **open up the view distance** without tanking phones.
- **Scope (build this):**
  - **Palette & saturation pass.** Raise base saturation/value across terrain,
    foliage, water, sweets/monsters and props; pick a cohesive cheerful key
    (warm sun, lush greens, candy‑bright accents). Keep per‑zone identity (meadow
    airy, caverns moody) but lift the floor so nothing looks grey/faint. Drive it
    through the existing `mat`/`emat` helpers, `theme` colors and `applyZoneMood`
    (`expMul`/`conMul`) rather than one‑off recolors.
  - **Open the view.** Increase the camera draw distance and **reduce fog
    density / push fog start** so the visible radius grows substantially; tune
    `DayNight`/`Weather` fog tints so distance reads as atmosphere, not a wall.
    Where the world fence is closer than the new view, ensure the horizon/sky and
    distant scenery still look intentional.
  - **Tone mapping/exposure.** Coordinate with Task 4's ACES tone mapping so the
    brighter palette doesn't blow out; nudge exposure/contrast for a punchy but
    readable image at day/dusk/night.
  - **Perf & accessibility.** Keep the larger view **tier‑gated** (mobile/low tier
    keeps a tighter radius/denser fog for fps; high tier opens up). Verify
    readability/contrast for gameplay‑critical elements (interactables, markers,
    enemies) stays high; provide sensible defaults, no eye‑strain neon.
- **Acceptance criteria:**
  - The world is visibly **brighter and more cheerful** and the player can see
    **noticeably farther**; document the before/after fog + draw‑distance numbers
    and the fps you measured per tier.
  - Mid‑range phone holds ~45–60 fps with the new view (lower tier tightens the
    radius automatically); high tier opens up. Nothing throws headless.
  - Per‑zone moods are preserved (each zone still feels distinct); markers/enemies
    remain easy to read against the brighter ground.
- **Tests to add:** the palette/exposure/fog config is a **pure, testable**
  data‑driven function (per zone + per tier); tier‑gating of view distance is
  unit‑tested; DayNight/Weather still pass; a check that gameplay‑critical colors
  meet a minimum contrast threshold.
- **Files:** `js/game.js` (`mat`/`emat`, zone `theme`s, `applyZoneMood`, camera
  setup, fog in `buildWorld`/`DayNight`/`Weather`, `Quality` tier knobs),
  `css` (any UI tint), `test/harness.js`, `README.md`; bump `?v=`.
- **Out of scope:** new meshes/textures (that's Task 3) — this is **color, light
  grade and view distance**, not modeling.

### Task 12 — Deep item & equipment system (Skyrim‑grade) with visible worn gear + a real inventory
- **Status:** `[x]` — 2026-06-23 · Widened the loadout to **12 slots** (added pauldrons/gloves/belt/cloak),
  added **enchantments** (`AFFIXES` prefix/suffix rolled deterministically on found/crafted gear, rarity‑scaled,
  serialized + shown as i18n chips) and **equipment sets** (`SETS` Ironguard + Dragonscale with cumulative
  threshold bonuses). Refactored the recompute into a pure `deriveStats` shared by the live stats **and** the
  inventory's **compare‑vs‑equipped** deltas (`equipDelta`/`equippedAfter`). **Visible worn gear** — helmet,
  pauldrons, chest, gloves, belt, boots + a billowing cloak — built once on Lily and toggled/recoloured by
  rarity on equip (no leak), tier‑gated (`wornDetailFor`). Rebuilt the bag into a **tabbed inventory**
  (Gear/Materials/Potions) with filter+sort, set‑bonus panel and drink‑from‑bag potions. `SAVE_VERSION` → 7
  (per‑instance affixes + new slots; v6 saves still load). New `test/items.test.js` (21 cases; Vitest 32 → 53).
  Full pipeline green; real‑browser screenshot pass confirmed the gear + inventory.
- **Depends on:** none; pairs naturally with **Task 14** (skills/levels share the
  stat‑recompute pipeline) — keep the data layer compatible.
- **Goal.** Research how large RPGs (Skyrim/The Elder Scrolls, Diablo‑likes)
  structure items and build a **robust analog**: more item kinds and slots, gear
  that is **visibly worn and animated on the character**, and a proper
  **inventory** that also stores resources and potions.
- **Scope (build this):**
  - **Research → design doc.** Briefly document the target model (item categories,
    rarity tiers, affixes/enchantments, weight/value, equip slots, set bonuses)
    and how it maps onto the existing `ITEM_DB`/`Inventory`/`EQUIP_SLOTS`/
    `recomputeStats`/`enhance*` pipeline. Keep it data‑driven and headless‑safe.
  - **Expand & upgrade items.** Rebalance/upgrade current items and add new ones
    across **more kinds** — weapons (1‑h/2‑h/ranged/staff), armor (helmet,
    chest, gloves, boots, pauldrons, cloak, belt), jewelry (rings, amulet),
    and consumables. Add **rarity tiers** (common→legendary) with scaling stats,
    **enchantments/affixes** (prefix/suffix modifiers), and optional **set
    bonuses**. Extend the enhancement/anvil system to the new model.
  - **More wear slots.** Add equipment slots beyond today's 8 (e.g. gloves,
    pauldrons, cloak, belt, second ring already exists) with clear slot rules
    (2‑handed occupies both hands, etc.). Recompute stats from the full loadout.
  - **Visible, animated worn gear.** Render equipped gear **on Lily's procedural
    body** — boots, hat/helmet, chest piece, gloves, cloak, weapon in hand — that
    swap when equipment changes and **animate with the character** (cloak sway,
    weapon follows the swing, boots move with the legs). Build procedurally
    (no asset bloat), tier‑gated, and **dispose on teardown / re‑equip** (no
    leaks). Headless‑safe.
  - **Real inventory UI.** A grid/list inventory that holds gear **and** stores
    **resources and potions** (move materials/potions out of ad‑hoc state into the
    inventory model), with sort/filter by type/rarity, equip/unequip, compare
    tooltips (stat deltas vs equipped), drink/consume, and drop/sell hooks into the
    existing Shop. Stack consumables/materials; show weight/value if adopted.
  - **Persistence.** Serialize the full inventory + equipped loadout + new fields
    in `serializeGame`/`applySave`; bump `SAVE_VERSION`; keep older saves loading
    (migrate gracefully).
- **Acceptance criteria:**
  - The player can loot/buy/craft items across the expanded kinds, equip them into
    the expanded slots, and **see the gear on the character**, animating with
    actions, swapping on equip/unequip — with no leaks across travel.
  - Stats recompute correctly from the full loadout incl. rarity/affixes/sets; the
    inventory stores resources + potions and consuming/equipping works.
  - Inventory + equipment + materials/potions **round‑trip through save/load**;
    old saves still load.
  - Headless‑safe; harness green; nothing throws on low tier.
- **Tests to add:** item/affix/rarity stat math; equip/unequip slot rules
  (2‑handed, set bonuses); inventory add/stack/consume/sort; worn‑gear build +
  dispose (no leak) headless; **save/load round‑trip** of the new schema +
  migration from the prior version.
- **Files:** `js/game.js` (`ITEM_DB`, `Inventory`, `EQUIP_SLOTS`, `recomputeStats`,
  `enhance*`/`Anvil`/`Shop`, `Player._build`/update for worn gear + animation,
  inventory UI, `serializeGame`/`applySave`, `SAVE_VERSION`), `index.html`/`css`
  (inventory UI; bump `?v=`), `test/harness.js`, `README.md`.
- **Out of scope:** a full crafting‑tree overhaul, durability/repair economy
  (note as follow‑ups if you don't include them), imported 3D art.
- **Hints:** keep items **declarative**; resolve display names/descriptions
  through i18n (Golden Rule 9); reuse the existing enhancement multipliers.

### Task 13 — Minimap + full‑screen world map with locations, NPCs, search & a guided waypoint
- **Status:** `[x]` — 2026-06-23 · Shipped the navigation layer over a new pure `src/data/worldmap.js`
  (zone adjacency from portals, **BFS route-finding** `findRoute`/`nextZoneStep`, bearing/distance +
  an 8-point compass + camera-relative arrow, the searchable `MAP_TARGETS` derived from
  ZONES/LOCATIONS/NPC_DATA, diacritic-folding search, and a deterministic world layout). A live north-up
  **corner minimap** (`WorldMap`, feature-detected 2D canvas: player+facing, portals, NPCs, resources,
  monsters, vendors, castle, waypoint), a `Tab`/🗺️ **full map** (`WorldMapUI`) with a detailed
  current-land view + a fog-of-war **world overview** of the portal graph, a name **search** + results,
  and a **"Guide me there"** waypoint — an on-screen **compass** (with the next portal to take across
  lands) that **clears on arrival**. Discovered lands + the active waypoint **round-trip** through
  save/load (`SAVE_VERSION` → **9**; older saves default). New `test/worldmap.test.js` (20 cases;
  Vitest 80 → 100) + a Playwright map flow. EN/RU localized; `data-i18n-ph` placeholders added.
- **Depends on:** none (reads `ZONES`/`LOCATIONS`/`NPC_DATA`); complements the
  story tracker from Task 2.
- **Goal.** Add a corner **minimap** and a **full‑screen world/zone map** showing
  all locations and NPCs, with **search** and a **guide system** that points the
  player toward any selected city/point/NPC (on‑screen direction + map waypoint),
  the way large open‑world RPGs do.
- **Scope (build this):**
  - **Minimap (HUD).** A live corner map of the current zone: player position +
    facing, nearby NPCs/landmarks/resource nodes/portals/monsters, north
    indicator, and the active quest objective. Cheap to render (2D canvas/SVG
    over the scene, not a second 3D view); toggleable; mobile‑friendly.
  - **Full map (overlay).** A pannable/zoomable full‑screen map. Two levels: the
    **current zone** (detailed) and a **world overview** of all zones and how they
    connect (the portal graph), with discovered/undiscovered (fog‑of‑war) state if
    feasible. Icons for cities/landmarks (`LOCATIONS`), NPCs (`NPC_DATA`), the
    castle, shops, portals.
  - **Search.** A search box that filters/locates any city/point/NPC by name
    (i18n‑aware), jumping the map to it and offering "guide me there."
  - **Guide/waypoint system.** Selecting a target sets a **waypoint**: an
    on‑screen **compass/direction arrow** (and a world marker/beam) pointing the
    way, with distance, and — across zones — which **portal** to take next
    (route through the zone graph). Clears on arrival.
  - **Persistence.** Persist discovered locations + the active waypoint in
    save/load; bump `SAVE_VERSION` if needed; old saves default sanely.
- **Acceptance criteria:**
  - The minimap correctly shows the player and nearby points of interest and
    updates live; the full map shows all zones/locations/NPCs and their links.
  - Searching for a city/NPC locates it; selecting it shows a clear on‑screen
    direction (and the next portal when it's in another zone) and distance; the
    guide clears on arrival.
  - Works on desktop + mobile, never freezes, headless‑safe; discovered/waypoint
    state round‑trips through save/load.
- **Tests to add:** the world‑graph/route‑finding (next‑portal toward a target
  zone) is a pure, tested function; bearing/distance math is unit‑tested;
  discovered‑location + waypoint **save/load round‑trip**; map data derives from
  `ZONES`/`LOCATIONS`/`NPC_DATA` (no hard‑coded duplication).
- **Files:** `js/game.js` (a `Map`/`Minimap`/`Waypoint` module, route‑finder over
  `ZONES` portals, HUD hooks, `serializeGame`/`applySave`),
  `index.html`/`css` (map/minimap UI, compass; bump `?v=`), `test/harness.js`,
  `README.md`.
- **Out of scope:** real cartographic terrain rendering or a 3D worldmap — a
  clean stylized 2D map is the target.

### Task 14 — Skill & leveling system (Skyrim‑grade) with 3‑skill fusion, a quick‑access bar & boss‑only skills
- **Status:** `[x]` — 2026-06-23 · Shipped an XP/leveling layer (XP from combat/quests/gathering, a
  super‑linear curve, +health/+focus per level, auto‑learned base skills) over a new pure
  `src/data/skills.js` (`SKILL_DB` 6 base + 4 boss‑only active skills, `ELEMENTS`/`EFFECTS`, level/focus
  math + the deterministic `fuseSkills`/`fusionCost`). Active skills (volley/nova/buff/heal, frost slow +
  shadow lifesteal) cast from a **3‑slot quick bar** (hotkeys 1/2/3; potions moved to 4/5/6) spending a
  regenerating **focus** resource + a cooldown. The marquee **3‑skill fusion** blends 2–3 owned skills into
  a brand‑new equippable/savable one for **coins + crystals** (pure + reproducible). **Boss‑only skills**
  drop solely from bosses (seeded, after the existing coin/gear draws). New ✨ Skills overlay (`K`), HUD
  level/XP + focus bars, EN/RU i18n. `SAVE_VERSION` → 8 (player `progress`; older saves default to level 1).
  New `test/skills.test.js` (27 cases; Vitest 53 → 80) + the E2E opens the overlay & casts a skill.
- **Depends on:** pairs with **Task 12** (shared stat pipeline); benefits from the
  Task 13 HUD for the toolbar. Keep save schema coordinated with Task 12.
- **Goal.** Research how large RPGs (Skyrim and peers) model **skills and
  character progression** and build a robust analog: a leveling system, an active
  **skill** roster, a **fusion** mechanic (combine up to 3 skills into one),
  a **quick‑access toolbar** by the shoot button, and **rare skills that drop only
  from boss loot**.
- **Scope (build this):**
  - **Research → design doc.** Document the target model (XP sources, level curve,
    perks/skill trees, active vs passive skills, cooldowns/costs) and map it onto
    the existing combat/stat pipeline (`Player`, `recomputeStats`, `Projectile`,
    the `Swing` actions). Keep it declarative and headless‑safe.
  - **Leveling.** Award **XP** for combat/quests/gathering; a tuned level curve
    grants points (stat/perk) on level‑up; show level + XP in the HUD with a
    level‑up beat. Persist level/XP.
  - **Skill roster.** A `SKILL_DB` of active skills (and passives), each with
    effect, cost (mana/cooldown/resource), and tags/attributes used by fusion.
    Wire skills into combat (the wand/shoot path + melee), respecting cooldowns.
  - **Skill fusion (the marquee feature).** Let the player **combine up to 3
    skills** into a **new fused skill** whose characteristics are a deterministic
    blend of the inputs' attributes (damage/element/AoE/cooldown/etc.). Fusion
    **consumes money / artifacts / resources** per a defined recipe; the result is
    a real, equippable, savable skill. Make the blend rules **pure and tested**.
  - **Quick‑access toolbar.** A bar of **up to 3 skill slots** next to the shoot
    button (mobile‑friendly tap targets + desktop hotkeys 1/2/3); assign/clear
    slots from the skill UI; show cooldowns. Activating uses the slotted skill.
  - **Boss‑loot skills.** A pool of powerful skills obtainable **only** from boss
    drops (deterministic via seeded `rng()`), surfaced as loot and added to the
    roster on pickup.
  - **Persistence.** Serialize level/XP, owned skills (incl. fused), slotted
    toolbar skills, and boss‑skill unlocks; bump `SAVE_VERSION`; migrate older
    saves gracefully.
- **Acceptance criteria:**
  - The player gains XP and levels up; can learn skills, **fuse up to 3** into a
    new one (consuming the right money/artifacts/resources), **slot up to 3** on
    the quick bar, and use them in combat with cooldowns.
  - Boss‑only skills drop solely from bosses (seeded, reproducible) and enter the
    roster.
  - All of it (level, XP, owned/fused/slotted skills, boss unlocks) **round‑trips
    through save/load**; old saves still load. Headless‑safe; harness green.
- **Tests to add:** the level curve + XP math; the **fusion blend** rules and cost
  consumption (pure, deterministic); cooldown logic; toolbar assign/activate;
  boss‑drop determinism under a fixed seed; **save/load round‑trip** of the new
  schema + migration.
- **Files:** `js/game.js` (new `Skills`/`SKILL_DB`/`Leveling`/fusion module,
  `Player`/combat hooks, boss loot tables, HUD toolbar, `serializeGame`/
  `applySave`, `SAVE_VERSION`), `index.html`/`css` (skill + toolbar UI; bump
  `?v=`), `test/harness.js`, `README.md`.
- **Out of scope:** a sprawling multi‑tree perk web (ship one coherent, tested
  system; note extensions as follow‑ups); PvP/balance tuning beyond sane defaults.
- **Hints:** keep skills **declarative** and i18n the names/descriptions (Golden
  Rule 9); make fusion a pure function of input attributes so it's fully testable.

### Task 15 — Cloud saves to Google Drive (manual + 5‑min autosave via `appDataFolder`, rolling 1‑hour history)
- **Status:** `[x]` — 2026-06-23 · Shipped opt‑in **Google Drive cloud saves** that reuse the exact
  `serializeGame()`/`applySave()` JSON (no schema change): GIS OAuth (drive.appdata scope, SDK loaded
  on demand) behind a sign‑in toggle on the start screen + pause settings, a **"Save to Drive"** manual
  slot, an **autosave every 5 min** (render‑loop tick, wall‑clock gated, paused while the tab is hidden,
  debounced, never blocks the thread) keeping a **rolling 1‑hour history** (≤ 12 timestamped slots,
  newest always kept), and a browse‑and‑**restore** overlay that reloads through the same boot path as
  the local file load (reconciling so a cloud save never silently clobbers newer in‑progress work). The
  Drive client is **injectable** (`CloudSave._setClient`) and every browser API is feature‑detected, so
  with no OAuth client id, no `fetch`, offline, or headless the feature is cleanly disabled and the local
  save still works — nothing throws. Pure policy (`cloudAutosaveDue`/`cloudPrune`/`cloudNewer`/auto‑name)
  + the injected‑client flows + local↔cloud payload parity are covered by a new `test/cloudsave.test.js`
  (25 cases; Vitest 100 → 125) plus an E2E panel smoke. The autosave‑on preference persists to
  `localStorage` (like locale/graphics/audio); `SAVE_VERSION` untouched at 9. Golden Rule 1 (CLAUDE.md +
  §1) updated to allow such opt‑in external services.
- **Depends on:** the existing `serializeGame`/`applySave` + `SAVE_VERSION`; do it
  **after** any task that changes the save schema (so the cloud format is stable).
- **Note on Golden Rules:** this adds an **external network dependency** and OAuth.
  It must stay **opt‑in** and **degrade gracefully** to the existing
  `localStorage` save when the player isn't signed in, is offline, or runs
  headless — the game must never block on the cloud. Requires a **Google API
  OAuth client ID** (document setup; read it from config, don't hard‑code
  secrets; the Drive JS client loads from Google's CDN, keeping the site static).
- **Goal.** Let the player **sign in with Google** and save game progress to their
  own Drive using the private **`appDataFolder`** space — both **manual save** and
  an **autosave every 5 minutes** — keeping a **rolling history of the last
  hour** of autosaves.
- **Scope (build this):**
  - **Auth.** Google Identity Services OAuth (drive.appdata scope), opt‑in from a
    settings/pause UI: sign‑in/sign‑out, signed‑in indicator. Tokens handled per
    Google's guidance; never persist secrets in the repo.
  - **Save/load to Drive `appDataFolder`.** Write the same serialized save JSON the
    local system uses into the user's hidden `appDataFolder` (invisible to other
    apps, no Drive clutter). Manual **"Save to Drive"** + **"Load from Drive"** that
    lists/loads available cloud saves. Reuse `serializeGame`/`applySave` verbatim so
    cloud and local formats match and versioning/migration just works.
  - **Autosave every 5 minutes.** A timer that writes an autosave to Drive every
    5 min while signed in (and on key beats — zone travel, chapter complete),
    pausing when the tab is hidden/idle; debounced; never blocks the main thread;
    surfaces quiet success/failure toasts.
  - **Rolling 1‑hour history.** Keep the **last hour** of autosaves (≈ up to 12
    timestamped slots), pruning older ones automatically. Let the player browse +
    restore any of the retained autosaves.
  - **Conflict & resilience.** Handle offline/expired‑token/quota errors
    gracefully (fall back to local, retry with backoff, clear messaging); reconcile
    local vs cloud on load (offer the newer, don't silently clobber).
- **Acceptance criteria:**
  - A signed‑in player can manually save to and load from their Drive
    `appDataFolder`; an autosave lands every ~5 minutes; the **last hour** of
    autosaves is retained and restorable, older ones pruned.
  - Signed‑out / offline / headless: the feature is cleanly disabled and the
    existing local save still works — **nothing throws**, nothing blocks.
  - Cloud saves use the **same schema** as local and respect `SAVE_VERSION`
    migration; a cloud save round‑trips back into a running game.
- **Tests to add:** the autosave **scheduler** (5‑min cadence, pause‑when‑hidden,
  debounce) and the **retention/pruning** policy (keep last hour) are pure, tested
  functions; serialize↔deserialize parity between local and cloud payloads; the
  Drive client is **feature‑detected/injectable** so tests run against a stub with
  no real network; offline/error fallback paths are covered. Headless harness
  stays green with no Google client present.
- **Files:** `js/game.js` (a `CloudSave`/`Drive` module wrapping
  `serializeGame`/`applySave`, the autosave scheduler + retention, settings hooks),
  `index.html`/`css` (sign‑in + cloud‑saves UI; bump `?v=`), config for the OAuth
  client ID, `test/harness.js`, `README.md` (setup + privacy note).
- **Out of scope:** a custom backend/server, cross‑device real‑time sync,
  cloud saves for non‑Google providers (note as follow‑ups).

---

## 4c. The backlog (Tasks 16–22) — mobile UX, persistence & systems polish

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

### Task 16 — Responsive, mobile‑first HUD & menu overhaul (auto‑fit at any resolution; one‑thumb combat; drag‑and‑drop skill slots)
- **Status:** `[x]` — 2026-06-25 · Rebuilt the start screen + pause menu as auto‑fitting `100dvh`/safe‑area
  flex columns that scroll internally and fold their settings into labelled `<details>` sub‑panels
  (Controls/Language/Audio/Graphics/Cloud saves) — the Google‑Drive panel is now reachable on the S24 Ultra
  in both orientations. Fullscreen on touch also locks **landscape** via the Screen Orientation API (feature‑
  detected; the lock’s rejection is swallowed; released on exit). Decluttered the HUD: removed the monster
  counter, the on‑HUD music button (mute lives in settings), the duplicate map button (the minimap is the one
  map entry point, now with a tap hint) and the round bag button (the square inventory button stays). Re‑laid
  the **one‑thumb action arc** (3 skill slots + E + ✨) into the bottom‑right in landscape, clear of the joystick.
  Replaced the per‑skill assign buttons with **drag‑and‑drop** slotting on a pure `dragSlotReducer` + one reusable
  Pointer‑Events drag controller (touch + mouse), with an accessible tap‑to‑pick fallback. New EN+RU strings; no
  save‑schema change (`SAVE_VERSION` 9). New `test/hud.test.js` (15 cases; Vitest 126 → 141) + a Playwright
  responsive suite at the new **S24 Ultra** device profile (portrait + landscape) added to `playwright.config.js`.
- **Depends on:** none directly, but it **touches** the minimap/map button (Task 13),
  the skill quick‑bar + `SkillsUI` (Task 14), the audio mixer (Task 6) and the
  cloud‑saves controls (Task 15). Pairs naturally with **Task 20** (map) — both
  rework HUD chrome — and **Task 18** (save management UI lives in the same menus).
  Best done **before** Task 20 so the map button removal and minimap‑tap entry
  point are settled first.
- **Goal.** On a real phone (Galaxy S24 Ultra) the **start screen and pause menu
  overflow** — controls below the fold (e.g. the **Sync with Google Drive**
  panel) are simply **unreachable** — and the in‑game HUD is **cluttered and
  overlapping** (weather/clock sit *under* the inventory/skills widgets; there are
  duplicate inventory buttons; the skill/fire/interact controls aren't reachable
  with one thumb). Rebuild the menu + HUD layout to the standard of well‑reviewed
  mobile action‑RPGs: **every control reachable at every resolution**, no
  overlaps, no duplicates, and a **one‑thumb** combat cluster in landscape.
- **Scope (build this):**
  - **Auto‑fitting, scrollable menus with progressive disclosure.** Make the
    **start screen** (`#overlay`) and **pause menu** (`#pauseMenu`) lay out
    responsively so they **never clip** at any viewport: a flex/grid column with a
    **max‑height of the safe viewport** (`100dvh` minus `env(safe-area-inset-*)`)
    and **internal scrolling** when content exceeds it. Adopt the pattern big games
    use on phones — a short **primary‑action** list always visible (Start / Resume
    / Load / Save / Exit) with **secondary settings collapsed into labelled
    sub‑panels** ("Audio", "Graphics", "Language", "Cloud saves", "Manage saves")
    opened on demand, rather than one long overflowing stack. The
    Google‑Drive/cloud panel (`.cloud-settings` / `#cloudSignBtn` & co.) **must be
    fully reachable** on the S24 Ultra in both orientations.
  - **Fullscreen ⇒ landscape on mobile.** Extend the fullscreen handler
    (`game.js` `Fullscreen.toggle()` / `#fsBtn`, ~`game.js:8762`) so that on a
    touch device entering fullscreen also requests **landscape** via the **Screen
    Orientation API** (`screen.orientation.lock("landscape")`), and releases the
    lock on exit. **Feature‑detect** it (the lock API + fullscreen are required and
    unsupported on iOS Safari) and **degrade gracefully** — never throw when the
    lock is unavailable or rejected (it returns a promise that can reject); desktop
    behaviour is unchanged.
  - **Declutter the HUD — remove/relocate redundant widgets:**
    - **Remove the "monsters in this land" counter** (`#monsters` /
      `updateMonsterCounter()`): drop the widget and its update call (keep the
      underlying count only if something else needs it; otherwise remove cleanly,
      no dead code).
    - **Move the sound mute** off the HUD into **settings**: remove the on‑HUD
      music button (`#musicBtn`) and rely on the existing **mute control in the
      audio sub‑panel** (`#muteToggle` / `#muteToggleP`) on the start screen +
      pause settings.
    - **Remove the map button** (`#mapBtn`): the **minimap is already tappable**
      to open the full map (`WorldMap`/`WorldMapUI`), so the button duplicates
      that gesture — delete it and make the minimap tap target obvious.
    - **Remove the big round bag button** (`#bagBtn`, the touch‑only round button
      by the action/cast buttons): it **duplicates** the square inventory button
      in the top icon row (`#invBtn`). Keep one inventory entry point.
  - **Fix widget layering (no overlaps).** The **weather** (`#weather`) and
    **clock** (`#clock`) widgets currently render *under* the inventory/skills
    widgets and stack on top of one another. Give the HUD a deliberate **z‑index
    layering + non‑overlapping anchored regions** (top‑status row, corner minimap,
    bottom action cluster) using a small set of CSS layers and `pointer-events`
    discipline so no two widgets occupy the same pixels at any supported
    resolution. Audit every absolutely‑positioned HUD element.
  - **One‑thumb combat cluster (landscape).** Re‑lay the **3 skill quick‑slots**
    (`#skillBar` / `updateSkillBar()`), the **interact "E"** button (`#actionBtn`)
    and the **fire/cast** button (`#castBtn`) into an **ergonomic semicircle/arc**
    in the bottom‑right (right‑thumb) zone so all of them sit within a comfortable
    thumb sweep in landscape — the radial/arc action layout that well‑reviewed
    mobile action games use. Keep tap targets ≥ the platform minimum (≈48 px),
    respect `env(safe-area-inset-*)`, and keep the left‑thumb joystick clear.
    Provide a sensible portrait fallback.
  - **Drag‑and‑drop skill‑slot assignment (replace the 3‑button mechanic).**
    Today each skill in the Skills panel exposes **per‑slot assign buttons**;
    replace this with **direct manipulation**: **drag a skill from the roster onto
    a quick‑slot** to assign it, **drag a slotted skill onto another slot** to
    move/swap, and **drag a slot's skill onto empty space** to clear it (mirror the
    behaviour the user described). Implement with **Pointer Events**
    (`pointerdown`/`move`/`up` + `setPointerCapture`) so it works with **touch and
    mouse** from one code path; keep the existing **pure** slot logic
    (`Skills.assignSlot` / `Skills.clearSlot`) as the model and only change the
    **gesture** layer. Provide an **accessible non‑drag fallback** (tap‑to‑pick →
    tap‑slot) for keyboard/screen‑reader/headless and feature‑detect Pointer
    Events. (Optionally apply the same drag model to the potion belt — but that is
    **Task 21**'s job; keep this task's drag surface to skills.)
  - **i18n + persistence.** Any new strings (sub‑panel headings, tooltips) go
    through `t()` in **both `en` and `ru`** (Golden Rule 9). No save‑schema change
    is expected (layout/UX only); if a UI preference is introduced, persist it to
    `localStorage` like the existing audio/graphics/locale prefs.
- **Acceptance criteria:**
  - On the **Galaxy S24 Ultra profile** (portrait **and** landscape) **every**
    start‑screen and pause‑menu control is reachable — the **Google Drive / cloud
    panel is visible and operable** without anything being clipped off‑screen — and
    menus scroll internally when content exceeds the viewport. Verified at the S24
    Ultra resolution **and** at least one small (≈360 px) and one desktop width.
  - Tapping **fullscreen on a touch device** enters fullscreen **and** locks
    **landscape**; exiting releases it; on browsers without the lock API nothing
    throws and the game still works. Desktop is unchanged.
  - The **monster counter, on‑HUD mute button, map button and round bag button are
    gone**; mute lives in settings; the **minimap tap** opens the full map; a
    single inventory button remains.
  - **No HUD widgets overlap** at any tested resolution — weather/clock,
    inventory/skills, minimap, health/focus bars and the action cluster each own
    distinct screen regions; verified by bounding‑box assertions.
  - In **landscape** the 3 skill slots + E + fire form a **one‑thumb arc**; all
    are tappable within a thumb sweep and clear of the joystick + safe‑area insets.
  - Skills are assigned/moved/cleared by **drag‑and‑drop** (touch + mouse); the
    old per‑skill assign buttons are gone; an accessible tap fallback exists; the
    underlying slot state still round‑trips through save/load.
  - Full pipeline green; headless‑safe (Pointer Events / orientation / fullscreen
    all feature‑detected).
- **Tests to add:** a **Playwright responsive suite** that loads the built site at
  the **S24 Ultra device profile** (portrait + landscape) and a desktop profile and
  asserts: every start/pause control is in‑viewport (or reachable by scrolling) —
  explicitly the cloud panel; no two key HUD widgets' bounding boxes intersect;
  the removed widgets are absent; the skill/E/fire cluster sits in the bottom‑right
  arc in landscape. Vitest: orientation‑lock + fullscreen helpers are
  feature‑detected and no‑op safely headless; the **pure drag‑to‑slot reducer**
  (pick → drop → assign/move/clear) is unit‑tested independent of the DOM; a UI
  smoke that drives a drag and asserts `Skills.assignSlot`/`clearSlot` fire.
- **Files:** `index.html` (menu/HUD markup, remove `#monsters`/`#musicBtn`/
  `#mapBtn`/`#bagBtn`, sub‑panel containers), `css/style.css` (responsive
  menu/`dvh`/scroll, HUD z‑layers + anchored regions, the landscape action arc,
  S24‑safe insets), `src/game.js` (`Fullscreen` orientation lock, HUD wiring +
  removed update calls, `SkillsUI`/`updateSkillBar` drag gesture layer), the new
  device profile in `playwright.config.js`, `test/e2e/*.spec.js` + a Vitest unit
  file, `src/core/i18n.js` (any new strings, EN+RU), `README.md`.
- **Out of scope:** a full UI‑framework rewrite (React/etc. — keep the current
  vanilla DOM), redesigning the overlays' *contents* (inventory/shop internals),
  and the potion‑belt drag‑and‑drop (that ships in **Task 21**).
- **Hints:** drive layout from CSS (`dvh`, `clamp()`, `env(safe-area-inset-*)`,
  flex/grid) so it scales without per‑device JS; keep one **pointer‑based** drag
  utility reused by skills now and potions later; test the gesture's **reducer**
  as a pure function so the DOM layer stays thin.

### Task 17 — Durable session persistence (progress + Google sign‑in survive reload and desktop⇄mobile mode switches)
- **Status:** `[x]` — 2026-06-25 · Shipped a first‑party `Session` module that auto‑persists the live run
  (the exact `serializeGame()` JSON) to `localStorage`, debounced (1.5 s) on key beats + flushed on
  `visibilitychange`/`pagehide`, and **auto‑restores it on boot** through the same `gg3d_pending_load` seam as
  the file/cloud load — surfaced as a **"Continue"** button (Start still begins fresh). A pure, feature‑detected
  cookie helper (`buildCookieString`/`parseCookies` + `cookieGet/Set/Del`, `SameSite=Lax`/`Secure`/180‑day
  `Max‑Age`, `localStorage` fallback via `ck_*`) carries a session id + locale/quality + cloud flag + a
  **non‑sensitive Google auth hint**; the bulky snapshot stays in `localStorage`. The Drive client gained a
  **silent token path** (`signInSilent` → GIS `prompt:""` + `login_hint`); `CloudUI` re‑auths silently on boot
  when the player had opted in (sign‑out clears the hint → no silent re‑auth), gated by the pure
  `silentAuthDecision`. A **"Clear saved session & sign out"** control (start + pause, EN+RU) wipes everything.
  No `SAVE_VERSION` change (reuses the existing schema; older saves still load). New `test/session.test.js`
  (23 cases; Vitest 141 → 164) + a Playwright `session.spec.js` (resume‑after‑reload) at desktop + the S24 Ultra
  portrait + landscape profiles.
- **Depends on:** the existing `serializeGame`/`applySave` + `localStorage` prefs
  (Tasks 9/15). Coordinate with **Task 18** (save management) and **Task 15**
  (cloud auth) — they share the persistence layer. Do this **before/with** Task 18.
- **Goal.** Reloading the page, or switching between **desktop and mobile** layout
  (e.g. responsive breakpoint / DevTools device mode / a re‑orientation that
  re‑boots the view), currently **loses the in‑progress run** and **drops the
  Google Drive sign‑in** (auth is per‑session only — see Task 15's note that
  tokens are not persisted). Add **durable, first‑party session persistence** so a
  returning player resumes **exactly where they left off** without re‑downloading a
  file or signing in again, the way shipped web games keep you logged in and
  mid‑run across reloads.
- **Scope (build this):**
  - **Auto‑persisted local session (resume‑on‑reload).** Continuously persist the
    live run (the exact `serializeGame()` JSON) to a **first‑party store** —
    debounced on key beats (zone travel, level‑up, quest turn‑in, purchase) and on
    `visibilitychange`/`pagehide` — and **auto‑restore it on boot** through the same
    path as a file/cloud load, so a reload drops the player straight back into the
    run (offer a "Continue" affordance on the start screen rather than silently
    forcing it). Reuse the existing `gg3d_pending_load` boot hand‑off seam.
  - **Cookie support (as requested) — with the right tool for each datum.** Add
    **cookie**‑based persistence so state survives reload and **desktop⇄mobile mode
    switches**. Use cookies for the **small, long‑lived identifiers** that should
    travel with the session (a session id, the chosen locale/quality, the "cloud
    autosave on" flag, and a lightweight **auth hint** so we can **silently
    re‑acquire** a Google token — see below); keep the **bulky run snapshot** in
    `localStorage`/IndexedDB (cookies are size‑limited and sent on every request).
    Set cookies **first‑party** with `SameSite=Lax`, `Secure` (the site is HTTPS on
    Pages), and a sensible `Max‑Age`; **feature‑detect** `document.cookie` and fall
    back to `localStorage` when cookies are unavailable (private mode, headless).
    No third‑party/tracking cookies — first‑party persistence only.
  - **Persist the Google sign‑in across reload.** Today GIS re‑authenticates every
    session. Persist enough to **restore the signed‑in state without a fresh
    consent prompt**: remember the signed‑in account hint and use GIS **silent
    token refresh** (`prompt: ""` / `login_hint`) on boot to re‑acquire an access
    token when the player had opted in — falling back to the explicit sign‑in
    button if silent refresh fails. **Never persist secrets in the repo**; store
    only non‑sensitive hints client‑side and keep the feature **opt‑in** and
    **degrading gracefully** (signed‑out/offline/headless still work). Honour
    **sign‑out** by clearing the hint so it does **not** silently re‑auth.
  - **Survive desktop⇄mobile switches.** Ensure the persisted session is **layout
    agnostic** — switching responsive mode / re‑orienting / a quality‑change reload
    restores the same run and the same sign‑in. The HUD/menu rebuild from Task 16
    must read from the restored state, not reset it.
  - **Privacy & control.** Document what is stored and where (README + a short
    in‑settings note); provide a **"clear saved session / sign out"** control so the
    player can wipe local persistence. Respect existing `SAVE_VERSION` migration so
    an auto‑restored session from an older schema still loads.
- **Acceptance criteria:**
  - Reloading the page **resumes the in‑progress run** (same zone, stats,
    inventory, quests, time/weather) via the auto‑persisted session — no file
    re‑load needed; a "Continue" entry point is offered.
  - After opting into Google Drive, a **reload keeps you effectively signed in**
    (silent token refresh) without a new consent dialog; **sign‑out** clears it and
    no silent re‑auth happens afterward.
  - Switching **desktop⇄mobile** layout (or re‑orienting / changing graphics
    quality) preserves both the **run** and the **sign‑in**.
  - Cookies are **first‑party**, `SameSite=Lax`/`Secure`, feature‑detected, with a
    `localStorage` fallback; **nothing throws** when cookies are blocked or
    headless; signed‑out/offline still play.
  - A player can **clear** the saved session/sign‑in from settings.
- **Tests to add:** a **pure cookie helper** (get/set/expire, `SameSite`/`Secure`
  attributes, feature‑detect + `localStorage` fallback) unit‑tested; an
  **auto‑persist scheduler** (debounce + flush on hide/pagehide) tested as a pure
  function; a **save↔restore round‑trip** through the cookie/local session path
  (parity with file/cloud payloads); the **silent‑auth** decision (had‑opted‑in +
  hint ⇒ attempt silent refresh; signed‑out ⇒ don't) tested against an **injected
  GIS stub**; an E2E that loads the built site, starts a run, reloads, and asserts
  the run resumed.
- **Files:** `src/game.js` (a small `Session`/persistence module wrapping
  `serializeGame`/`applySave`, the cookie helper, the boot auto‑restore +
  "Continue", `CloudSave` silent‑auth + hint storage, a clear‑session control),
  `index.html`/`css` ("Continue" + clear‑session UI), `src/core/i18n.js` (EN+RU),
  `test/*` (cookie/scheduler/round‑trip/silent‑auth + E2E), `README.md` (privacy
  note). No `SAVE_VERSION` change expected (it reuses the existing schema).
- **Out of scope:** a server‑side session backend or account system; cross‑device
  sync beyond what Drive already offers (Task 15); third‑party analytics cookies.
- **Hints:** cookies for **small identifiers**, `localStorage`/IndexedDB for the
  **snapshot**; keep the cookie helper pure + feature‑detected so headless tests
  pass; reuse the Task 15 reconcile (`cloudNewer`) so an auto‑restored local
  session never clobbers a newer cloud save.

### Task 18 — Cloud‑saves browser fix + multiple manual save slots with full management (rename / delete / load)
- **Status:** `[x]` — 2026-06-25 · Shipped a pure **`SaveSlots`** store (6 named local slots in
  `localStorage`, each the full `serializeGame()` payload + metadata; immutable create/list/rename/
  delete/overwrite + next‑free selection) rendered by a thin **`SavesUI`** — one **Manage Saves**
  screen reachable from the start screen **and** pause with **Load / Rename (inline) / Delete /
  Overwrite / New save**, a **cloud** section (sign‑in CTA when signed‑out, else the cloud slots with
  Restore + **delete**, reusing `CloudSave.listSaves`/`restore`/new `deleteSave`), and file
  export/import. **Fixed the dead start‑screen cloud action**: the cloud browser now opens even
  signed‑out with a clear state + sign‑in button (no more no‑op). Destructive actions reuse a
  generalized, screen‑centred **`Pause.askConfirm(action,text,onYes)`**; loads go through the same
  boot reload path as file/cloud (reconciled via `cloudNewer`). The prior single‑slot (Task‑17 auto‑
  session) snapshot **migrates** into a named slot. Added **playtime** to the save → `SAVE_VERSION`
  **9 → 10** (legacy saves load with `playSec = 0`). New EN+RU strings (key‑parity green). New
  `test/saveslots.test.js` (25 cases; Vitest 164 → 189) + a Playwright `saves.spec.js` (open → save →
  rename → reload → load) at desktop + the S24 Ultra portrait + landscape profiles.
- **Depends on:** the save layer (Tasks 9/15) and **Task 17** (durable session) —
  build this **after/with** Task 17 so slots and the auto‑session share one store.
  Coordinate `SAVE_VERSION` with any task that changes the schema.
- **Goal.** On the **start screen**, clicking **cloud saves does nothing** (the
  entry point is dead/unwired), and the game has **no real manual save slots** —
  local saving is only a file download and the cloud has a **single overwrite
  slot**. Add a proper **save‑management system** like shipped RPGs: several
  **named manual slots** (local **and** cloud) with **load / rename / delete**,
  surfaced from a single, working **Saves** screen reachable from the start screen
  and pause menu.
- **Scope (build this):**
  - **Fix the dead start‑screen cloud‑saves action.** Make the start‑screen cloud
    entry point actually open the **cloud‑saves browser** (`CloudUI.openList()` /
    `#cloudSaves` overlay): wire/repair the handler (`#cloudListBtn` and/or a
    "Cloud saves" item in the new Saves screen), and when **cloud is not
    configured/ signed‑out**, show a clear state + a sign‑in CTA instead of a
    no‑op. The list must render, and **Restore** must load through the existing
    boot reload path.
  - **Multiple named manual slots (local).** Replace the single file‑download model
    with **N manual save slots** persisted locally (e.g. **6+** slots in
    `localStorage`/IndexedDB), each storing the full `serializeGame()` payload plus
    metadata (**name**, timestamp, zone, level, playtime). Keep **file
    export/import** as an extra option, but the primary UX is in‑game slots like
    big RPGs.
  - **Save management UI (load / rename / delete).** A single **Saves** overlay
    (reachable from start screen **and** pause) listing all slots — **local** and
    **cloud** in one place, clearly labelled — each row offering **Load**,
    **Rename** (inline edit, i18n‑safe, length‑capped) and **Delete** (with a
    confirm, reusing `Pause.askConfirm`). "**New save**" writes to the next free
    slot or overwrites a chosen one (with confirm). Mirror the management actions
    for **cloud** saves where the Drive API allows (rename via metadata, delete via
    the Drive client), reusing `CloudSave.listSaves()`/`restore()`/prune.
  - **Persistence & schema.** Store slot metadata + payloads under versioned keys;
    **bump `SAVE_VERSION`** only if the per‑slot envelope changes the schema, and
    keep **older saves / single‑slot data migrating** in gracefully (don't strand
    an existing player's save). Everything **feature‑detected** and headless‑safe.
  - **i18n.** All new strings (slot labels, rename/delete prompts, empty states)
    through `t()` in **EN + RU**.
- **Acceptance criteria:**
  - Clicking **cloud saves on the start screen opens the cloud browser** (or a
    clear sign‑in/not‑configured state) — it is **no longer a dead click** — and
    Restore loads the run.
  - The player can keep **multiple named local save slots**, and **load / rename /
    delete** any of them; a confirm guards delete/overwrite. Cloud slots are
    listed and manageable in the same screen to the extent the Drive API allows.
  - All slots **round‑trip through save/load**; existing single‑slot/file saves
    **migrate** without loss; older `SAVE_VERSION`s still load.
  - Reachable from **start screen + pause**; works on desktop + mobile; headless‑
    safe; full pipeline green.
- **Tests to add:** the **slot store** (create/list/rename/delete/overwrite, next‑
  free‑slot selection, metadata) as a pure, tested module; a **migration** test
  from the prior single‑slot/file format; a **round‑trip** per slot; an injected‑
  client test that the **cloud browser opens + Restore** path runs; an E2E that
  opens the Saves screen from the start menu, saves, renames, reloads and loads the
  slot.
- **Files:** `src/game.js` (a `SaveSlots`/`SavesUI` module over `serializeGame`/
  `applySave`, repair the start‑screen cloud handler + `CloudUI` wiring,
  `SAVE_VERSION`/migration), `index.html`/`css` (the Saves overlay; rename/delete
  controls), `src/core/i18n.js` (EN+RU), `test/*` (slots/migration/round‑trip + E2E),
  `README.md`.
- **Out of scope:** a server‑side save backend; auto‑screenshots/thumbnails per
  slot (note as a follow‑up); unlimited cloud slots beyond Task 15's rolling
  policy.
- **Hints:** keep slot logic **pure** (the UI just renders it); reuse
  `Pause.askConfirm` for destructive actions and the Task 15 reconcile so a cloud
  restore never clobbers newer local work.

### Task 19 — Replace the score system with the experience (XP) system
- **Status:** `[x]` — 2026-06-25 · Retired the legacy arcade **score** entirely (the ⭐ HUD chip +
  `#score`/`addScore`, the run-state + save field, the `score*` config knobs, and every score mention
  in the pause/game-over/victory summaries + their EN/RU strings) and routed every former score moment
  into **XP** via `Skills.gainXp`: kills already paid `Skills.xpFor`; **artifact** pickups now grant a
  retuned **`XP_PER_ARTIFACT = 40`** (~4 sweet kills, between a sweet and a boss) on top of their heal +
  coins, so there's **one** progression currency. The end/pause screens now show a **run recap** (level
  reached, total XP, monsters felled + relics collected) via a new pure `runRecap`; a v11 `relicsFound`
  lifetime tally feeds it. `SAVE_VERSION` **10 → 11** (drops `score`, adds `relicsFound`; pre-v11 saves
  load with score ignored + sane defaults). New `test/score-to-xp.test.js` (19 cases; Vitest 189 → 208):
  each former score event grants XP, pacing stays sane under the new sources (pure sim), v10→v11
  migration + v11 round-trip, the recap renders level/XP/tallies (no "score"), and a **grep guard** that
  fails on any lingering `score` identifier in the player-facing source. Before→after award docs in the
  CHANGELOG + README. Full pipeline green; E2E confirmed `#score` removed (CI runs the browser suite).
- **Depends on:** the **XP/leveling** layer (Task 14, `src/data/skills.js`:
  `xpToNext`/`gainXp`/`player.progress`). None else.
- **Goal.** The game still carries a **legacy arcade "score"** (the on‑screen
  **stars/score widget**, `+score` on kills/artifacts/bosses) **in parallel** with
  the real **RPG progression (XP/levels)** from Task 14. Modern RPGs reward action
  with **experience**, not an arcade score. **Remove the score system entirely**
  and route those reward moments into **XP** instead, so there is **one** coherent
  progression currency.
- **Scope (build this):**
  - **Remove the score HUD + state.** Delete the on‑screen **score/stars widget**
    (`#score` chip / `addScore`) and the score field from run state and
    `serializeGame`/`applySave`; remove score from the **pause stats**, **game‑over**
    and **victory** summaries and the `pause.stats`/`over.tagline`/`win.*` i18n
    strings (replace with level/XP‑based phrasing). No dead `score` references left.
  - **Convert score events to XP.** Every place that awarded score — monster kills
    (`CONFIG.scorePerMonster`), artifact pickups (`CONFIG.scorePerArtifact`,
    `toast.artifact`), boss (`CONFIG.bossScore`) and dragon (`CONFIG.dragonScore`)
    — now awards **XP** via `Skills.gainXp()` (kills already grant `Skills.xpFor`;
    fold the **artifact/relic** rewards into XP too). **Rebalance** the XP curve /
    award amounts so progression stays well‑paced once these sources feed it (don't
    just double‑count — retune `XP_PER_*` / `xpFor` and the artifact award so level
    pacing feels right). Remove the now‑unused `score*` config knobs.
  - **End‑screen + tracker glow‑up.** The game‑over / victory / pause summaries
    show **level reached, total XP and key tallies** (monsters felled, relics) —
    the satisfying run‑recap shipped RPGs show — instead of a score number. The HUD
    keeps the **level badge + XP bar** (already present) as the single progression
    readout.
  - **Migration.** Older saves carrying a `score` field must still load (ignore/drop
    it gracefully); **bump `SAVE_VERSION`** for the schema change and default
    missing XP/level sanely.
  - **i18n.** Update all affected strings in **EN + RU**.
- **Acceptance criteria:**
  - There is **no score anywhere** — no HUD widget, no run‑state field, no
    save field, no end‑screen number, no `score*` config — and nothing references
    it (grep‑clean).
  - The reward moments that gave score now give **XP**; level pacing is retuned and
    documented (before/after award values); a player progresses purely through XP.
  - End/pause/victory screens recap **level + XP + tallies**; the HUD's level/XP
    bar is the single progression readout.
  - Old saves (with `score`) still load; the new schema round‑trips; full pipeline
    green; headless‑safe.
- **Tests to add:** assert each former score event now calls `gainXp` with the
  retuned amount; the level curve still produces sane pacing under the new sources
  (a pure test over a simulated run); **save/load migration** from a `score`‑bearing
  save; a UI smoke that the end/pause screens render XP/level (no score); a grep‑
  style test that fails on any lingering `score` identifier in the user‑facing path.
- **Files:** `src/game.js` (`addScore` removal, kill/artifact/boss/dragon reward
  paths → `gainXp`, pause/over/win summaries, `serializeGame`/`applySave`,
  `SAVE_VERSION`), `src/core/config.js` (remove `score*` knobs; retune XP if knobs
  move here), `src/data/skills.js` (curve/award retune), `index.html`/`css` (drop
  `#score`), `src/core/i18n.js` (EN+RU), `test/*`, `README.md` (roadmap line
  "Collect artifacts for score" → XP).
- **Out of scope:** redesigning the leveling curve wholesale (retune, don't
  rebuild); adding a separate high‑score/leaderboard (explicitly being removed).
- **Hints:** XP already flows through one function (`Skills.gainXp`) — funnel the
  former score events there and delete the parallel path; keep the artifact reward
  feeling meaningful by granting a chunk of XP.

### Task 20 — Map subsystem fixes (fit‑to‑screen full map, un‑mirror the minimap, arrow‑shaped target pointer, fully readable labels)
- **Status:** `[x]` — 2026-06-25 · Fixed all four map defects. The full‑map overlay
  (`#worldmap`) now fits ONE screen (no page scroll): the panel is a `dvh`/`clamp()`‑sized
  flex column whose header/tabs/map/info/actions are fixed and only `#mapResults` scrolls
  internally (portrait stacks the map above a clamped‑height canvas; short landscape keeps
  it beside the list) — verified on desktop + S24 Ultra portrait/landscape. The minimap
  heading is **un‑mirrored at the source**: a pure, tested `mapVecToScreen`/`mapHeadingScreen`
  mirrors the north‑up projection's X axis so turning right in‑world turns the marker right on
  **both** the minimap and the in‑zone map (validated against the camera‑relative facing
  convention, not double‑negated); `mmPlayer` + both `proj()`s share it. A reusable canvas
  **arrow** primitive (`drawMapArrow`, shaft + head) replaces the bare triangle on the minimap
  rim marker (when the waypoint/next‑portal is off‑map) and the on‑screen compass arrow is now
  an inline **SVG arrow** — both unambiguously point at the target / next portal. Place names
  are no longer clipped by the circle: `drawZoneScene` collects portal labels during the clipped
  pass and draws them **after/outside** the clip via a pure `layoutMapLabels` (clamped to screen
  bounds, de‑overlapped) with a haloed plate (`mapLabelText`); world‑overview zone names too.
  No save‑schema change (`SAVE_VERSION` 12 — the waypoint already serialized from Task 13). New
  pure tests (heading sign, bearing→arrow, label layout) + a recording‑2D‑context suite driving
  the real drawing + a Playwright `map.spec.js` (desktop + S24 portrait/landscape) for the
  fit‑to‑screen/scroll bar; Vitest 234 → 247.
- **Depends on:** the map layer (Task 13: `WorldMap`/`WorldMapUI`, `drawZoneScene`,
  `mmPlayer`, `resolveWaypoint`, the compass). Pairs with **Task 16** (HUD chrome —
  the map button is removed there and the map opens from the minimap tap).
- **Goal.** The map subsystem has four concrete defects that make it hard to use:
  the **full map doesn't fit on one screen** (it scrolls), the **minimap rotation
  is mirrored** (turning right in‑world turns you left on the map), the
  **target‑direction indicator is an ambiguous triangle** (you can't tell where it
  points), and **place names are clipped by the circular map border**. Fix all
  four to the readability bar of well‑reviewed open‑world maps.
- **Scope (build this):**
  - **Full map fits one screen (no scroll); NPC list stays scrollable.** Re‑lay the
    full‑map overlay (`#worldmap` / `WorldMapUI`) so the **whole screen fits within
    the viewport** at any supported resolution (the map canvas + controls sized via
    `dvh`/`clamp()` to the safe area, S24 Ultra in both orientations) — **no page
    scroll**. Only the **NPC/results list** scrolls **internally** (`#mapResults` /
    `renderResults()`), as in shipped maps where the world fills the screen and a
    side list scrolls.
  - **Un‑mirror the minimap heading.** The minimap heading is reflected — turning
    **right** in the world rotates the marker **left** on the map. Fix the sign
    convention in the player‑facing/rotation math (`mmPlayer()` ~`game.js:5392`
    and/or the `proj()` axis mapping) so **map rotation matches world rotation** —
    turning right turns the indicator right — consistently on **both** the minimap
    and the in‑zone full‑map view. Verify against the camera/`player.facing`
    convention (north‑up) so it's correct, not just flipped to compensate.
  - **Arrow‑shaped target pointer (replace the triangle).** The
    direction‑to‑target indicator is a bare **triangle** whose pointing end is
    ambiguous. Replace it with a clear **arrow** (shaft + arrowhead, distinct from
    the player marker) for the active **waypoint** direction — on the minimap edge
    marker and the on‑screen **compass** (`#compassArrow` / `_compass()` /
    `resolveWaypoint()`). The arrow must **unambiguously point at the target**
    (and the next portal for cross‑zone routes), the way quest‑compass arrows do in
    big RPGs.
  - **Fully readable place names (no circle clipping).** On the big map, place
    labels are **cut off by the circular clip** (`drawZoneScene` calls `ctx.clip()`
    to a circle ~`game.js:5439`, then draws labels inside it). Make labels **fully
    visible and legible** — e.g. draw labels **after/outside** the geometry clip (so
    text isn't clipped), keep them inside the screen bounds, add a subtle
    halo/background plate for contrast, and nudge/stack to avoid overlap. Names must
    be readable at the S24 Ultra DPI.
  - **i18n + persistence.** Names already resolve via `tZoneName`/`t()` (keep EN+RU
    correct). No save‑schema change expected (waypoint already serializes from
    Task 13).
- **Acceptance criteria:**
  - The **full map fits entirely on one screen** (no scroll) on the S24 Ultra
    (portrait + landscape) and desktop; **only the NPC/results list scrolls**.
  - Turning **right** in the world turns the indicator **right** on the minimap and
    in‑zone map (mirroring fixed), validated against the facing convention.
  - The target‑direction indicator is a clear **arrow** that visibly points at the
    selected target / next portal; it's distinct from the player marker.
  - **Place names render fully and legibly** — **not clipped** by the map circle —
    with enough contrast to read at phone DPI, no overlaps in the common cases.
  - Desktop + mobile; headless‑safe (2D‑canvas feature‑detected); pipeline green.
- **Tests to add:** a **pure heading test** asserting a right‑turn in world space
  yields a right‑turn on the map (sign convention) — locks the un‑mirror; a
  **bearing→arrow** test that the arrow angle matches `resolveWaypoint()`'s bearing
  to the target/next portal; a label‑layout test that computed label positions stay
  within screen bounds (not clipped to the geometry circle); an E2E at the S24 Ultra
  profile asserting the full map has **no scroll** while `#mapResults` does.
- **Files:** `src/game.js` (`mmPlayer`/`proj` heading sign, `drawZoneScene` label
  pass + clip handling, the waypoint **arrow** marker + `_compass`,
  `WorldMapUI` layout/sizing), `index.html`/`css` (`#worldmap` fit‑to‑viewport,
  scrollable results, compass arrow asset/shape), `test/*` (heading/bearing/label +
  E2E), `README.md`.
- **Out of scope:** real cartographic terrain or a 3D map (keep the stylized 2D
  map); reworking route‑finding (Task 13's `findRoute` is fine).
- **Hints:** fix the **sign at the source** (don't double‑negate to fake it); draw
  **labels last**, outside any geometry clip, with a halo; build the arrow as a
  reusable canvas/CSS primitive shared by the minimap edge marker and the compass.

### Task 21 — Unified inventory for potions & ingredients (30 slots, drag‑and‑drop potion slotting, sellable items, dedicated alchemist NPC)
- **Status:** `[x]` — 2026-06-25 · Folded materials (`player.materials`) and the potion belt
  (`player.potions`) into the **unified 30‑slot bag** (`invCap` 24 → 30) as stackable
  `{ id, uid, count }` items: materials are now first‑class `ITEM_DB` reagents and one bag
  code path (`bagAdd`/`bagCount`/`bagSpend`, `STACK_MAX` 99) serves potions + materials, so
  crafting (`hasMaterials`/`spendMaterials`), quest gathers and skill fusion all read/write
  the bag. The 3 combat quick‑slots became a pure **assignment** over bag potions
  (`player.potionSlots` = ids) with **drag‑and‑drop slotting** reusing Task 16's pointer‑drag
  utility + the pure `dragSlotReducer` (assign/move/swap/clear) and an accessible tap‑to‑pick
  fallback; drinking a slot consumes from the bag stack and auto‑clears when empty. Removed the
  on‑HUD materials chip strip (`#materialsBar`/`updateMaterialsHud`). Potions **and** materials
  are now **sellable** (`Shop.sell` peels one off a stack at the item's `ITEM_DB` value) and a
  dedicated **Apothecary** vendor (`Alchemist` class + `alchemist` NPC at a new `apothecary`
  hub landmark) sells potions + basic ingredients — **removed** from the merchant's stock so
  vendors are specialised (EN+RU localised). `SAVE_VERSION` **11 → 12**: the bag + quick‑slots
  serialize, and a pure tested `migrateLegacyBag` folds pre‑v12 `materials`+`potions` belt into
  bag stacks + quick‑slot refs (runs exactly once; older saves keep all their stuff). New
  `test/inventory21.test.js` (26 cases; Vitest 208 → 234) + a Playwright `inventory.spec.js`
  (potions‑tab quick‑slot drag‑assign, no HUD strip) at desktop + S24 Ultra portrait/landscape.
- **Depends on:** the item/inventory system (Task 12: `Inventory`/`invAdd`/`invCap`/
  the tabbed bag), the potion belt + materials (`POTION_SLOTS`, `player.potions`,
  `player.materials`), the Shop (Task 12/`POTION_STOCK`), and the drag utility from
  **Task 16**. Coordinate `SAVE_VERSION` with Tasks 18/19.
- **Goal.** Potions and crafting **ingredients live in ad‑hoc side stores**
  (`player.potions` belt + a `player.materials` dictionary) separate from the main
  **24‑slot equipment inventory**, with **HUD ingredient widgets**, **no
  drag‑and‑drop**, and **no way to sell** them — and the wizard sells everything.
  Rework the economy so **everything shares one bag** like shipped RPGs: ingredients
  and potions occupy **inventory slots**, the bag grows to **30**, potions are
  **drag‑slotted** into the 3 quick‑slots in any order, items are **sellable**, and
  a **dedicated alchemist NPC** sells potions + basic ingredients.
- **Scope (build this):**
  - **Move ingredients & potions into the general inventory.** Migrate
    **materials** (`player.materials` → stackable inventory items) and **potions**
    (out of the separate `player.potions` belt as the *storage* model) into the
    **unified bag** (`player.inventory`), so rocks, herbs, water, crystals **and**
    potions occupy **inventory slots** alongside gear — with **stacking** for
    consumables/materials (reuse/extend the Task 12 stack model). Crafting/recipes
    (`hasMaterials`/`spendMaterials`) now read/write the bag.
  - **Grow the bag to 30 slots.** Raise `invCap` from 24 → **30** and ensure the
    tabbed inventory UI (Gear/Materials/Potions filter) lays out the larger grid
    cleanly on mobile + desktop.
  - **Remove the HUD ingredient widgets.** Delete the on‑screen materials chips
    (`#materialsBar` / `updateMaterialsHud()`); ingredient counts are seen **only in
    the inventory** from now on (declutters the HUD, complementing Task 16).
  - **Drag‑and‑drop potion slotting (any potion, any order, 3 slots).** The 3
    combat potion **quick‑slots** become an **assignment** over bag potions (like
    the Task 16 skill slots): **drag any potion from the bag onto any of the 3
    slots**, reorder/swap by dragging between slots, clear by dragging off — so the
    player chooses which potions are quick‑drinkable and in what order. Reuse the
    **pointer‑based drag utility** from Task 16; keep a pure assignment model +
    accessible tap fallback. Drinking a quick‑slot consumes from the bag stack.
  - **Make potions & ingredients sellable.** Extend `Shop.sell()` so **potions and
    materials** can be sold back for coins (sane buy/sell pricing from `ITEM_DB`
    cost), like any other item.
  - **Dedicated alchemist NPC.** Add a **new alchemist/apothecary NPC** (in the hub
    or a wild zone, via `NPC_DATA`/`LOCATIONS`) whose shop sells **potions and basic
    ingredients** (`POTION_STOCK` + starter materials). **Remove those from the
    wizard's range** so vendors are specialized (the wizard/merchant keeps gear; the
    alchemist owns consumables + reagents). Localize the NPC + stock (EN+RU).
  - **Persistence.** Serialize the unified bag (potions + materials as items) + the
    drag‑assigned quick‑slots; **bump `SAVE_VERSION`**; **migrate** old saves
    (fold legacy `player.materials` + `player.potions` belt into bag items +
    quick‑slot refs) so existing players keep their stuff.
- **Acceptance criteria:**
  - Materials **and** potions live in the **30‑slot** bag (stacked), occupying
    inventory slots; crafting reads/writes the bag; the **HUD ingredient widgets are
    gone**.
  - Any potion can be **dragged into any of the 3 quick‑slots in any order**,
    reordered, swapped and cleared; drinking consumes from the bag; an accessible
    tap fallback exists.
  - Potions and ingredients are **sellable** at sane prices; a **dedicated
    alchemist NPC** sells potions + basic ingredients and the wizard **no longer**
    does.
  - The unified bag + quick‑slot assignment **round‑trips through save/load**, and
    **old saves migrate** (legacy belt/materials fold in) without loss; pipeline
    green; headless‑safe; works on mobile + desktop.
- **Tests to add:** the **migration** (legacy `materials` map + `potions` belt →
  bag items + quick‑slots) is a pure, tested function; bag **stacking** of
  materials/potions; the **drag‑to‑potion‑slot** reducer (assign/move/swap/clear,
  any order) unit‑tested; `Shop.sell` accepts potions/materials at expected prices;
  the alchemist's stock contains potions+basic ingredients and the wizard's no
  longer does; **save/load round‑trip** of the new schema + migration; a UI smoke
  driving a potion drag + a sell.
- **Files:** `src/game.js` (`Inventory`/`invAdd`/`invCap`→30, fold
  `materials`/`potions` into the bag, crafting `hasMaterials`/`spendMaterials`,
  `updatePotionBar` drag slotting, `Shop.sell`/`buyPotion`, remove
  `updateMaterialsHud`, the alchemist NPC wiring, `serializeGame`/`applySave`,
  `SAVE_VERSION`), `src/data/items.js`/`content.js` (potions/materials as
  inventory items, sell prices, alchemist stock split from the wizard),
  `src/data/content.js`/`NPC_DATA` (alchemist NPC + location), `index.html`/`css`
  (30‑slot grid, drop `#materialsBar`, potion drag targets),
  `src/core/i18n.js` (alchemist + any strings, EN+RU), `test/*`, `README.md`.
- **Out of scope:** a full crafting‑tree overhaul or new potion recipes beyond
  re‑homing the existing ones; weight/encumbrance (note as a follow‑up); the skill
  drag‑slotting (that's Task 16 — share the utility, don't redo it).
- **Hints:** model materials/potions as **stackable item instances** so one bag
  code path serves everything; reuse Task 16's pointer‑drag utility and the pure
  reducer pattern; gate the migration on `SAVE_VERSION` so it runs exactly once.

### Task 22 — Environment rewrite: stable resource generation + natural road‑edge teleporters
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

## 4d. The backlog (Tasks 23–39) — player-reported polish from real device play

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

### Task 23 — Persist Google Drive sign-in across reloads (true silent re-auth; no unprompted dialog)
- **Status:** `[ ]`
- **Depends on:** Task 15 (Google Drive cloud saves — `CloudSave`/`CloudUI`/
  `makeGoogleDriveClient`) and Task 17 (durable session — the `Session` cookie/hint
  store, `silentAuthDecision`, `signInSilent`). None else.
- **Note on Golden Rules:** unchanged — Drive stays **opt-in** and **degrades
  gracefully** (signed-out / offline / unconfigured / headless never throws or
  blocks). This task only makes the *existing* opt-in flow persist correctly; it
  adds no new external dependency.
- **Goal.** Two sign-in defects break the cloud-save UX. **(a) The player must sign
  in again every time they open the page** — the Google session doesn't survive a
  reload, so a returning player is effectively signed out. **(b) A Google sign-in
  popup/redirect appears on page load even when the player never pressed "Sign in
  with Google"** — the boot-time silent-auth attempt surfaces a *visible*
  account/consent dialog instead of staying silent. Fix both so that, once a player
  has opted into Drive, they **stay signed in across reloads** (re-acquired
  silently, no dialog), and the sign-in UI **only ever appears when they explicitly
  click it** — the way shipped web games keep you logged in without nagging.
- **Scope (build this):**
  - **Make boot-time re-auth truly silent (never show UI unprompted).** Today
    `CloudUI.init()` unconditionally calls `CloudSave.trySilentSignIn()` on boot
    (`src/game.js` ~9628), which runs GIS `requestAccessToken({ prompt: "" })`
    (`signInSilent` → `requestToken("", loginHint)`, ~9346). With `prompt: ""` GIS
    can still raise a **visible** popup/redirect (stale session, revoked scope,
    account chooser). Guarantee the boot path **never opens any visible UI**: only
    attempt re-auth when `silentAuthDecision(hint)` says the player previously opted
    in, run it through GIS's non-interactive token path with an `error_callback` /
    timeout that **swallows every non-silent outcome**, and on any result that
    *would* require UI, abort quietly and leave the explicit "Sign in with Google"
    button as the only path to interactive consent. No dialog may appear without a
    user click.
  - **Persist the signed-in state robustly.** GIS access tokens are short-lived
    (~1 h) and intentionally not persisted, so "stay signed in" means **reliably
    re-acquiring a token silently** from the player's existing Google session on
    each load. Audit the hint pipeline end-to-end: `Session.rememberAuth()` /
    `forgetAuth()` / `authHint()` (~9168), the `gg3d_sess` first-party cookie +
    `ck_gg3d_sess` localStorage fallback (`buildCookieString` / `cookieSet` /
    `cookieGet`, ~8985-9055), and `silentAuthDecision` (~9093). Ensure the
    **`optedIn` flag + the account `login_hint` are written on every successful
    sign-in** and read back on boot; verify the cookie attributes
    (`SameSite=Lax`, `Secure`, 180-day `Max-Age`) actually let it survive a reload,
    and that the localStorage mirror covers cookie-blocked / private-mode cases.
    Once a token is re-acquired silently, the cloud UI must show **"Signed in to
    Drive"** immediately — no button press.
  - **Honour sign-out + first-run.** A signed-out player (or one who never opted in)
    must get **no** silent attempt and **no** dialog on load — exactly today's
    first-run experience. `forgetAuth()` must clear the hint so no silent re-auth
    fires afterward.
  - **Resilience.** Expired / consent-again / offline must fall back to the explicit
    button with clear messaging (reuse the `cloud.*` toasts), never a surprise popup
    and never a thrown error.
- **Acceptance criteria:**
  - After opting in once, **reloading keeps the player signed in** — the cloud panel
    shows the signed-in state and Drive saves work **without any click or dialog**,
    as long as the browser still holds the Google session.
  - **No Google UI ever appears on page load** unless the player clicks "Sign in
    with Google". Signed-out and first-run loads are dialog-free.
  - Sign-out clears the remembered hint; subsequent loads do **not** silently
    re-auth.
  - Offline / expired / revoked-scope degrade to the explicit button with messaging;
    nothing throws; the local save is unaffected. Headless-safe (no GIS / no cookies
    ⇒ cleanly disabled).
- **Tests to add:** extend `test/session.test.js` / `test/cloudsave.test.js` against
  the **injected GIS stub**: `silentAuthDecision` returns *attempt* only when
  opted-in + hint present and *never* when signed-out; the boot silent path **never
  invokes the interactive prompt** (assert the stub's interactive callback isn't
  called on load); a sign-in → reload → still-signed-in round-trip through the
  cookie/hint store; sign-out clears the hint and blocks re-auth; the cookie helper
  sets `SameSite=Lax` / `Secure` / `Max-Age` and round-trips via the localStorage
  fallback. An E2E (injected client) that loads the built site with a stored hint
  and asserts the signed-in state restores with **no visible auth dialog**.
- **Files:** `src/game.js` (`CloudSave.trySilentSignIn` / `signInSilent` /
  `requestToken`, `makeGoogleDriveClient`, `CloudUI.init` boot wiring, the `Session`
  hint/cookie store, `silentAuthDecision`), `src/core/i18n.js` (any new messaging,
  EN+RU), `test/*`, `README.md` (cloud-saves persistence + privacy note). No
  `SAVE_VERSION` change (auth hints persist via cookie/localStorage, not the save).
- **Out of scope:** a server-side OAuth/token backend or refresh-token storage (the
  GIS web flow issues none — note as a follow-up); switching auth providers;
  persisting the access token itself (insecure — re-acquire silently instead).
- **Hints:** the cure for the unprompted popup is to make the boot attempt
  **non-interactive-only** and abort on anything that needs UI; the cure for "signed
  out every load" is reliably re-running that silent acquisition from the browser's
  existing Google session — both hang off the already-stored opted-in hint, so wire
  and test that hint carefully.

### Task 24 — Russian grammatical morphology (Android-style declensions, gender & plural agreement)
- **Status:** `[ ]`
- **Depends on:** Task 7 (the i18n layer — `LOCALES` / `t()` / `interp()` /
  `plural()` in `src/core/i18n.js`, the `RU` data-table dictionary + resolvers).
  None else.
- **Goal.** The Russian localization is **grammatically flat**: every string is
  hand-written and every interpolated noun (`{name}`, `{label}`, `{boss}`,
  `{zone}`, `{part}`, …) is dropped in its **nominative** form regardless of the
  surrounding sentence's grammatical case, and adjectives/verbs don't agree in
  **gender/number**. Russian is heavily inflected — "Reach {name}", "Gather
  {label}", "Bought {name}", "Defeat {boss} in {zone}", "{n} parts raised" all need
  the noun in the right **case** (and the verb/adjective to **agree**), or the text
  reads broken to a native speaker. Build a proper morphology layer — the way
  well-localized RPGs and **Android apps** do it (Android `<plurals>` quantity
  strings + ICU `MessageFormat` `select` / `plural` / gender) — so Russian sentences
  are grammatically correct, not just word-substituted.
- **Scope (build this):**
  - **A declension model for in-game nouns.** Give every interpolated Russian noun
    (item / zone / landmark / NPC / material / relic / skill / boss names) the
    grammatical metadata it needs: **gender** (m/f/n), animacy, and either explicit
    **case forms** (nominative / genitive / dative / accusative / instrumental /
    prepositional, singular + plural) or a small **rule-based decliner** for regular
    nouns with an explicit-override table for irregulars. Store this alongside the
    existing `RU` dictionary in `src/core/i18n.js` (additive — the English source
    stays untouched).
  - **Case-aware interpolation.** Extend the i18n core so a template can request a
    noun in a specific case — e.g. `t("obj.reach", { name: nounRef("zone", id) })`
    resolving a `{name:accusative}`-style marker, with the resolver returning the
    correctly inflected form. Keep `interp()` backward-compatible (plain `{x}` still
    works); layer the grammar on top.
  - **Gender/number agreement.** Make adjectives and past-tense verbs that describe
    a noun **agree** with its gender/number (e.g. "{part} raised" → возведён /
    возведена / возведено / возведены). Provide an ICU-style **`select`** (by
    gender) and a strengthened **`plural`** (the existing `plural()` already does
    Slavic one/few/many — extend its reach so **all** count strings use it, not just
    `castle.partWord`, which is currently the only call site).
  - **Retrofit the affected strings.** Sweep every RU string that interpolates a
    noun or a count and route it through the new case/agreement helpers (objectives,
    toasts like `toast.bought` / `toast.gathered` / `toast.reached`, dialogue, quest
    text, the map compass, boss banners). English is unaffected (its `select` /
    `plural` collapse to the simple forms).
  - **Pure + testable + headless-safe.** The decliner/agreement helpers are pure
    functions of (lemma + metadata + case/number/gender); no DOM. English path
    unchanged.
- **Acceptance criteria:**
  - Interpolated Russian nouns appear in the **correct grammatical case** for their
    sentence, and adjectives/verbs **agree** in gender/number — verified by a
    native-correct sample set across objectives, toasts, dialogue and the map.
  - Count strings use proper Slavic **one/few/many** everywhere (not only the castle
    counter); English still reads correctly (one/other).
  - EN⇄RU still toggles live, persists, and the **key-parity + data-completeness
    tests stay green** (now also covering the new case/gender metadata — no noun may
    ship without it in RU).
  - Headless-safe; full pipeline green; no English leaks in RU and vice-versa.
- **Tests to add:** unit tests for the **decliner / agreement** helpers (regular +
  irregular nouns across all six cases × number; gender agreement for a sample of
  adjectives/verbs); the strengthened `plural()` over 0–1000 hitting the one/few/many
  boundaries (1, 2, 5, 11, 21, 112…); a **completeness test** that every interpolated
  RU noun has the required gender + case data (fails the build otherwise, mirroring
  the existing untranslated-key gate); a retrofit smoke that key sentences render
  grammatically in RU.
- **Files:** `src/core/i18n.js` (new morphology metadata on `RU`, the decliner +
  agreement + ICU-style `select`, extended `interp` / `plural` / `t`, retrofit
  resolvers), `src/game.js` (call sites that interpolate nouns/counts now pass
  grammatical refs), `test/harness.test.js` (the i18n suite [28]) or a new
  `test/i18n-morphology.test.js`, `README.md` (i18n section). No `SAVE_VERSION`
  change.
- **Out of scope:** a full general-purpose Russian NLP morphology engine (cover the
  game's vocabulary with rules + an override table, not every Russian word); adding
  new locales (EN+RU only); machine translation.
- **Hints:** model nouns as `{ lemma, gender, animate, forms?: { nom, gen, dat, acc,
  ins, pre, … } }` with a regular-noun fallback decliner; keep English collapsing to
  identity so the shared templates stay simple; extend the existing `plural()` rather
  than replacing it.

**Worn-equipment appearance + combat-animation overhaul (Tasks 25–35) — the
per-category breakdown.** Today equipped gear shows on Lily as **single-colour
primitive blobs**: every helmet is the same dome + brim, every chest the same
cylinder, every part tinted only by rarity colour (`_buildWornGear` /
`refreshWornGear`, `src/game.js` ~1175-1275 — flat `mat` / `emat` materials, **no
per-item shape**), and combat is the **one `Swing` arc** from Task 5. This family
reworks **how each equipment category looks when worn on the character** and
**rewrites the weapon firing + attack animations from scratch**, to the readability
of a real MMORPG. Per the request it is split **one task per equipment category** so
each ships + merges independently. **Shared bar for every worn-gear task (25–33):**
build the part **procedurally** (no large binaries — the published site stays static,
Golden Rules 1 & 6) but give **each item def a distinct silhouette** (shape varies by
item type / material / set, not just a rarity tint); recolour + sheen by **rarity**
(reuse the Task 12 `paint()` rule) and add a **set** motif (Ironguard / Dragonscale);
**tier-gate** detail via `wornDetailFor`; attach to the correct body segment and
**animate with the character** (and the Task 34 attacks); **dispose on teardown /
re-equip** (no leaks); stay **headless-safe** (feature-detect Babylon); and **clip
cleanly** for that part (no poke-through of the body or neighbours — the full-loadout
integration is **Task 35**). Each task adds a **real-browser screenshot** for its
category + a unit test for its pure shape/spec helper, and needs **no save-schema
change** (visuals/animation are transient).

### Task 25 — Worn helmets: a distinct, real-looking helm per item (not one rarity-tinted dome)
- **Status:** `[ ]`
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

### Task 26 — Worn chest pieces: layered breastplates & robes per item
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `breastplate` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Every chest is the **same z-scaled cylinder** (`_buildWornGear`
  ~1191-1195) tinted by rarity. Make each chest item a distinct, layered torso piece —
  the centrepiece an MMORPG armour set reads from.
- **Scope (build this):**
  - **Per-item chest archetypes.** Leather vest, segmented iron cuirass, ornate plate
    (aegis), dragonscale, cloth robe — built from layered primitives (chest shell +
    straps/trim/lames), varied by material + **set** (Ironguard/Dragonscale carry their
    motif). Map each `breastplate` item to an archetype.
  - **Finish + fit.** Rarity recolour/sheen + set motif; seat on the torso (`lean`)
    without intersecting the **belt** (Task 29), the **pauldrons** (Task 27), the neck
    or the arms; tier-gate the layering.
- **Acceptance criteria:**
  - Chest pieces read distinctly by type/material/set with visible rarity/set finish;
    no intersection with belt/pauldrons/arms/neck in idle/walk/attack.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot
    of two distinct chests worn.
- **Tests to add:** the **chest archetype selector** is pure + tested; build/dispose
  no-leak; a Playwright screenshot.
- **Files:** `src/game.js` (`_buildWornGear` chest builder), `src/data/items.js`
  (archetype/material metadata), `test/items.test.js` (+ screenshot), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); cross-part integration
  (Task 35).
- **Hints:** the chest is the visual anchor of a set — coordinate its motif with the
  helmet/pauldrons so a full set reads as one suit.

### Task 27 — Worn pauldrons: shoulder armour that sits on the shoulder (not in the chest)
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `pauldrons` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Pauldrons are **plain spheres on `armL`/`armR`** (`_buildWornGear`
  ~1205-1214, scale 1.05/0.7/1.05) that **clip inward into the torso/chest**. Make them
  real shoulder pieces seated **on** the shoulder.
- **Scope (build this):**
  - **Per-item shoulder shapes.** Rounded caps, layered lames, spiked/trimmed by set —
    built from layered primitives, varied by material + set; map each `pauldrons` item
    to an archetype.
  - **Finish + fit.** Rarity/set finish; re-anchor so each pauldron sits on the
    shoulder joint and rotates with `armL`/`armR` through the attack **without diving
    into the chest** or the neck. Tier-gate (currently high-only — keep a clean
    low-tier omission).
- **Acceptance criteria:**
  - Pauldrons sit on the shoulders (no inward clip into torso/chest) through idle/walk/
    attack; distinct by type/material/set; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot
    mid-attack confirms no chest penetration.
- **Tests to add:** the **pauldron archetype selector** pure + tested; an invariant that
  the shoulder mesh stays outside the torso envelope at sampled attack phases;
  build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` pauldron builders + anchors,
  `wornDetailFor`), `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot),
  `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); full-loadout integration
  (Task 35).
- **Hints:** the inward clip is the known offender — fix the anchor + scale at the
  source; reuse the chest's set motif so shoulders match the cuirass.

### Task 28 — Worn gloves & gauntlets
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `gloves` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Gloves are **plain spheres on the hands** (`_buildWornGear` ~1216-1223).
  Make them read as gloves/gauntlets — the hand piece you see wrapped around the weapon
  grip in an MMORPG.
- **Scope (build this):**
  - **Per-item hand shapes.** Cloth glove, leather bracer, plated gauntlet with a cuff
    — layered primitives (cuff + back-of-hand + finger hint), varied by material + set.
  - **Finish + fit.** Rarity/set finish; follow the hands through the new attacks
    **without engulfing the weapon grip** or detaching from the wrist; tier-gate.
- **Acceptance criteria:**
  - Gloves read as hand armour distinct by type/material/set; track the hands through
    the attack; don't swallow the weapon grip; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot.
- **Tests to add:** the **glove archetype selector** pure + tested; build/dispose
  no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` glove builders), `src/data/items.js`
  (metadata), `test/items.test.js` (+ screenshot), `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); integration (Task 35).
- **Hints:** keep the finger hint subtle so it reads at gameplay distance; coordinate
  the cuff with the chest's sleeve.

### Task 29 — Worn belts
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `belt` slot), Task 3, Task 4. Shared bar above.
- **Goal.** The belt is a **plain cylinder at the waist** (`_buildWornGear`
  ~1197-1203, high-tier only) that **overlaps the chest band**. Make it a real belt.
- **Scope (build this):**
  - **Per-item belt shapes.** Strap + buckle (+ pouches/plates by set/material), built
    from layered primitives, varied by material + set.
  - **Finish + fit.** Rarity/set finish; sit at the waist **below** the chest piece
    (Task 26) without intersecting it or the legs through the stride; keep the clean
    low-tier omission (`wornDetailFor`).
- **Acceptance criteria:**
  - The belt reads as a belt (strap + buckle) distinct by material/set; no overlap with
    the chest or legs; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot.
- **Tests to add:** the **belt archetype selector** pure + tested; an invariant that the
  belt band sits below the chest envelope; build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` belt builder, `wornDetailFor`),
  `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); integration (Task 35).
- **Hints:** coordinate the waist height with the chest piece so the two never z-fight.

### Task 30 — Worn boots
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `boots` slot), Task 3, Task 4. Shared bar above.
- **Goal.** Boots are **plain cylinders on the legs** (`_buildWornGear` ~1225-1232,
  over the existing feet at y ≈ -0.62) that can intersect the legs/ground in the
  stride. Make them real boots.
- **Scope (build this):**
  - **Per-item boot shapes.** Soft shoe, leather boot with a cuff, plated greave +
    sabaton — layered primitives (shaft + foot + sole/cuff), varied by material + set.
  - **Finish + fit.** Rarity/set finish; hug the shins and sit on the existing feet so
    they **move with the stride without clipping the leg or punching through the
    ground**; tier-gate.
- **Acceptance criteria:**
  - Boots read distinctly by type/material/set; hug the legs through the full stride
    with no leg/ground penetration; rarity/set finish visible.
  - Disposed on teardown/unequip; headless-safe; tier-gated; pipeline green; screenshot
    mid-stride.
- **Tests to add:** the **boot archetype selector** pure + tested; an invariant that the
  boot stays on the leg envelope (no ground clip) at sampled stride phases;
  build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` boot builders + leg anchors),
  `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** icons; other slots; animation (Task 34); integration (Task 35).
- **Hints:** anchor to the foot, not the shin midpoint, so the boot tracks the leg's
  bottom through the stride.

### Task 31 — Worn cloaks
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `cloak` slot), Task 3, Task 4, Task 5 (`_animateCloak`).
  Shared bar above.
- **Goal.** The cloak is a **flat box on a pivot** (`_buildWornGear` ~1234-1242) that
  **swings through the legs** on sharp turns (`_animateCloak` ~1279-1286 rotates the
  pivot ±0.5 rad). Make it a real draping cloak that billows believably.
- **Scope (build this):**
  - **Per-item cloak shapes.** Tapered drape with a neck clasp, optionally **segmented**
    (a few panels) so it reads as cloth, varied by material + set (Dragonscale gets its
    motif). Build from layered primitives; tier-gate the sway/segments (`wornDetailFor`).
  - **Finish + believable billow.** Rarity/set finish; reshape + clamp the pivot/billow
    so the cloak **drapes behind the legs** and reacts to movement/turns **without
    scything through the body or legs** at any frame.
- **Acceptance criteria:**
  - The cloak drapes behind the body and billows with motion **without clipping the
    legs/body** in idle/walk/turn/attack; distinct by material/set; rarity/set finish.
  - Disposed on teardown/unequip; headless-safe; tier-gated (low omits sway); pipeline
    green; screenshot of the cloak mid-turn.
- **Tests to add:** the **billow updater** is pure + `dt`-driven + pause-correct
  (frame-rate independent), and an invariant that the cloak stays behind the leg
  envelope across the sway range; build/dispose no-leak; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` cloak builder, `_animateCloak`,
  `wornDetailFor`), `src/data/items.js` (metadata), `test/items.test.js` (+ screenshot),
  `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** full cloth simulation (keep a cheap, clamped procedural billow);
  icons; other slots; integration (Task 35).
- **Hints:** the leg-clipping swing is the known offender — clamp the pivot and seat the
  drape behind the hips; keep the billow time-based so it pauses with the game.

### Task 32 — Held weapons: real wand / bow / staff / sword / axe / dagger in hand
- **Status:** `[ ]`
- **Depends on:** Task 12 (weapon items + the two hand slots), Task 3, Task 4, and
  Task 34 (the attacks the weapon moves with — pair them). Shared bar above.
- **Goal.** The held-weapon mesh in Lily's hand should look like the **actual weapon
  class** (and vary by material/rarity), be held correctly, and read clearly through the
  new attacks — the believable weapon-in-hand of an MMORPG, not a tinted stick.
- **Scope (build this):**
  - **Per-class weapon meshes.** Distinct, layered procedural meshes per weapon type:
    sword = blade + crossguard + grip + pommel; axe = haft + head; dagger = short blade +
    guard; bow = upper/lower limbs + string + grip; staff = shaft + head/orb; wand =
    shaft + tip. Vary by **material/rarity** (steel vs gold vs dragonscale) and add a
    hookable point for a **weapon trail** (used by Task 34).
  - **Correct grip + handedness.** Anchor one-handed weapons in the main hand (offhand
    weapon when dual-wielding), and seat **two-handed** weapons across the body / both
    hands per the existing slot rules; the weapon follows the hand through the attack and
    is sheathed/hidden sensibly at rest if appropriate. Tier-gate detail.
- **Acceptance criteria:**
  - Each weapon class reads as itself in hand, varied by material/rarity; held in the
    correct hand(s); two-handed weapons positioned correctly; the weapon tracks the hand
    through the new attacks with no detachment/clipping.
  - Disposed on teardown/swap (no leaks); headless-safe; tier-gated; pipeline green; a
    screenshot per weapon class held.
- **Tests to add:** the **weapon-class mesh selector** is pure + tested (every weapon def
  → a valid class mesh + grip anchor + handedness); build/dispose no-leak; a screenshot
  per class.
- **Files:** `src/game.js` (the held-weapon builder in `Player._build`/`refreshWornGear`,
  grip anchors, two-handed handling), `src/data/items.js` (weapon-class/material
  metadata + trail hook), `test/items.test.js` (+ screenshots), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** the attack *motion* (Task 34 — this is the *mesh*); icons; armour
  slots; integration (Task 35).
- **Hints:** build the weapon meshes and the Task 34 animations **together** so the grip
  anchor + trail line up; one class table keyed by weapon type + material keeps it tiny.

### Task 33 — Visible jewelry: necklace + rings on the character (additive)
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `necklace` + `ring1`/`ring2` slots), Task 3, Task 4.
  Shared bar above. **Net-new scope** (jewelry currently renders no worn mesh).
- **Goal.** Necklaces and rings are equipped but **invisible on the character** (no
  worn mesh, unlike the other 7 slots). Optionally add **subtle visible jewelry** — a
  pendant at the neck and ring(s) on the hands — so accessories read on the model too.
  Lower priority / additive (the model is correct today, just bare).
- **Scope (build this):**
  - **Subtle jewelry meshes.** A small pendant/chain at the neck for `necklace`; a thin
    band (+ a tiny gem) on the hand for rings — tiny, tasteful, tier-gated (likely
    high-tier only so phones skip it), varied by material/rarity.
  - **Fit + finish.** Anchor the pendant to the neck/upper chest (clear of the chest
    piece) and the ring to a hand; rarity/gem colour finish; dispose on teardown/unequip.
- **Acceptance criteria:**
  - Equipped necklace/rings show a subtle, correctly-anchored mesh that doesn't clip the
    chest/gloves; rarity/gem finish visible; cleanly **omitted on low tier** and when the
    slot is empty.
  - Disposed on teardown/unequip; headless-safe; pipeline green; a screenshot with
    jewelry equipped.
- **Tests to add:** the jewelry **spec selector** pure + tested; build/dispose no-leak;
  tier-gating verified; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` + `WORN_SLOTS` extended for jewelry,
  `refreshWornGear`, `wornDetailFor`), `src/data/items.js` (jewelry metadata),
  `test/items.test.js` (+ screenshot), `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** elaborate jewelry geometry; icons; integration (Task 35). If
  deemed not worth the budget, document the decision and skip — it is explicitly
  additive.
- **Hints:** keep it tiny + high-tier-only so it never costs phone fps; reuse the gem
  colour from rarity.

### Task 34 — Rewrite weapon firing & melee attack animations from scratch (MMORPG-grade)
- **Status:** `[ ]`
- **Depends on:** Task 5 (the `Swing` state machine) and Task 10 (the impact-frame
  fix) — this **replaces** them; Task 32 (the weapon meshes it animates); the
  `Projectile` / `Hazard` combat system. Pairs with Task 32 (build them together).
- **Goal.** Combat is a **single generic `Swing` arc** (anticipation → impact →
  recovery) reused for every weapon. **Rewrite the firing + attack animations from
  scratch** as a **per-weapon-class** system with real weight and follow-through — the
  distinct, readable attacks of a real MMORPG — without regressing hit timing, pause
  behaviour or headless-safety.
- **Scope (build this):**
  - **A from-scratch, per-weapon-class attack system.** Replace the `Swing` state
    machine with weapon-class animations, each with proper **windup → strike →
    recovery** and body involvement (torso rotation, foot plant, shoulder/hip drive):
    - **Melee:** sword = swept horizontal/diagonal **slashes** with a blade **trail**
      (optionally a 2–3 hit **combo** chain); axe = weighty **overhead chop**; dagger =
      quick **stabs**. The damage lands on the correct **strike frame** in the weapon's
      real arc/reach (preserve the Task 10 impact-frame correctness, per weapon).
    - **Ranged / cast:** bow = **nock → draw → release → recoil** with a string snap;
      wand/staff = **raise → channel (glow) → release**. The `Projectile` spawns on the
      correct **release frame**, aimed from the weapon, not before.
  - **Reactions + feel.** Hit/flinch reactions and follow-through; optional weapon
    trails / muzzle glow gated by the quality tier; idle never looks frozen.
  - **Keep the engine guarantees.** All animation is **time-based / `dt`-driven**,
    frame-rate independent, **pauses correctly** with the pause menu + zone transitions,
    is **feature-detected/headless-safe**, and **tier-gated**. Remove the old `Swing`
    cleanly (no dead code); keep gather/mine motions working (move them onto the new
    system or retain a minimal variant).
- **Acceptance criteria:**
  - Each weapon class has a **distinct, readable** attack with clear windup → strike →
    recovery and weight; ranged/cast release the projectile on the right frame; melee
    lands damage on the right strike frame in the right arc/reach (no early/late/double
    hits, correct facing).
  - Animation is `dt`-driven, frame-rate independent, **pauses** correctly, never throws
    headless, and is tier-gated; the old `Swing` is gone with no regressions to combat,
    gather/mine, or projectiles.
  - Full pipeline green; a real-browser pass shows each weapon's attack reading correctly.
- **Tests to add:** the **per-weapon attack state machine** is pure + tested (windup /
  active / recovery timers; the **strike frame** for melee and the **release frame** for
  ranged; arc/reach gating so out-of-arc/out-of-range targets aren't hit; no double-hit);
  **frame-rate independence** (same result at 30 vs 120 fps); **pause-correctness**;
  headless no-throw; a Playwright clip per weapon class.
- **Files:** `src/game.js` (remove `Swing`; the new per-weapon attack system in
  `Player.update`/attack + `Monster`/`Boss` where they share it, `Projectile` release
  hookup, weapon-trail hook from Task 32, gather/mine motion), `test/*` (a new
  `test/combat-anim.test.js` + the existing animation suite), `README.md`. No
  `SAVE_VERSION` change (animation is transient).
- **Out of scope:** imported skeletal animation clips / a rigging pipeline (keep it
  procedural over the existing primitive body); rebalancing weapon damage (timing parity,
  not balance); new weapon types.
- **Hints:** model each weapon class as its own small, pure state machine with named
  frames (windup/strike|release/recovery) so timing is testable; build it alongside
  Task 32 so the grip + trail anchors match; keep everything `dt`-driven so pause +
  frame-rate independence come for free.

### Task 35 — Full-loadout fit & clipping integration (no stray textures across all gear + the new attacks)
- **Status:** `[ ]`
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

### Task 36 — Customizable on-screen control layout (drag any control anywhere; saved + restored)
- **Status:** `[x]` — 2026-06-30 · Shipped a drag-to-arrange control-layout editor (pause → settings →
  Controls + the start-screen Controls panel): it dims the HUD, floats a labelled draggable handle over
  the joystick / skill bar / potion belt / E / fire, and offers Save / Reset / Cancel — reusing the
  Task-16 pointer-drag (ghost + 6px threshold), the only drag stack. Positions are stored as
  **viewport-fraction** centres, **clamped to the safe area** (`env(safe-area-inset-*)` + control size)
  on apply *and* load (tap targets ≥ ~48 px), applied live on drop + on boot/zone-load/resize. Persisted
  through the save engine (`controls` in `serializeGame`/`applySave`, **`SAVE_VERSION` 13 → 14**; older
  saves load with defaults) **and** mirrored to `localStorage` (`gg3d_controls`) as the live per-device
  source (the save value is the portable default a fresh device adopts). Pure model (`clampLayoutPos` /
  `layoutReducer` / `sanitizeLayout`) is DOM-free + fully feature-detected; EN+RU strings. New Vitest
  `controllayout.test.js` (23; 285 → 308) + a Playwright drag→save→reload→restore + off-screen-clamp
  spec at the S24 Ultra (portrait + landscape) and a desktop no-drag smoke. Respects Task 39's regions.
- **Depends on:** Task 16 (the responsive HUD + the reusable Pointer-Events drag
  controller / `dragSlotReducer`, `src/game.js` ~5503-5710) and **Task 39** (the HUD
  region/layer system — do this **after** Task 39 so custom positions build on
  non-overlapping defaults). Coordinate `SAVE_VERSION` with any task that changes the
  schema.
- **Goal.** The on-screen controls — the **movement joystick**, the **3 skill
  quick-slots**, the **3 potion quick-slots**, the **interact "E" button** and the
  **fire/cast button** — sit at **hard-coded CSS positions** with no way to move them,
  so players with different hand sizes / grips / phone shapes can't make combat
  comfortable. Add a **control-layout editor** in settings that lets the player **drag
  each control to any point on screen**, and **persist the layout in the game's save
  engine** — the fully customizable HUD that well-reviewed mobile action games (Call
  of Duty Mobile, PUBG Mobile, Genshin Impact) ship.
- **Scope (build this):**
  - **An "Edit control layout" mode** reachable from **pause → settings** (and a
    sensible entry on the start-screen controls panel). Entering it overlays the live
    HUD with draggable handles on each movable control, dims the rest, and shows
    **Save** / **Reset to default** actions. Reuse Task 16's **pointer-drag
    controller** (touch + mouse, the `.sk-drag-ghost` ghost, the 6 px tap/drag
    threshold) — don't write a second drag stack.
  - **Move every requested control.** Make the **joystick**, the **skill bar**
    (`#skillBar`), the **potion bar** (`#potionBar`), the **interact button**
    (`#actionBtn`) and the **cast/fire button** (`#castBtn`) repositionable to any
    on-screen point. Persist a **per-control position** stored as a
    resolution-independent **fraction of the viewport** (so it survives rotation /
    different screens), **clamped to the safe area** (`env(safe-area-inset-*)`) so a
    control can never land off-screen or under a notch. Keep tap targets ≥ ~48 px. A
    control with no custom position falls back to its Task 16 default (portrait + the
    landscape one-thumb arc).
  - **Persist through the save engine (as requested).** Serialize the control layout
    in `serializeGame` / `applySave` and **bump `SAVE_VERSION` (13 → 14)** so a
    player's layout travels with their save (incl. cloud / slots); **older saves
    load** with the default layout. **Also mirror the layout to `localStorage`** (like
    the existing audio/graphics/locale prefs) so it's a per-device setting that applies
    on the start screen and **before** any save is loaded. Document which store wins
    (the device pref as the live source; the save value as the portable default on
    load).
  - **Apply layout live + headless-safe.** Positions apply immediately on drop and on
    boot / zone-load; the editor and the persisted layout are fully **feature-detected**
    (no Pointer Events / no DOM ⇒ no-op, defaults stand) so the headless suite is
    unaffected. Works in portrait + landscape on the **Galaxy S24 Ultra** profile and
    desktop.
  - **i18n.** All new strings (editor heading, Save / Reset, hints) through `t()` in
    **EN + RU**.
- **Acceptance criteria:**
  - From settings, the player can **drag the joystick, skill slots, potion slots, E
    button and fire button to any point** and **Save**; positions are clamped to the
    safe area (never off-screen / under a notch) and snap back on **Reset to default**.
  - The custom layout **round-trips through save/load** (and the localStorage device
    mirror), survives **reload and orientation / desktop⇄mobile switches**, and applies
    before first interaction; **older saves load** with defaults.
  - Works on the **S24 Ultra** (portrait + landscape) + desktop; tap targets stay
    ≥ ~48 px; no overlaps introduced (respects Task 39's regions); full pipeline green;
    headless-safe.
- **Tests to add:** a **pure layout reducer/clamp** (set / move / reset a control's
  fractional position, clamp to safe-area bounds) unit-tested independent of the DOM;
  a **save/load round-trip** of the layout schema + **migration** (pre-v14 save ⇒
  default layout); the localStorage mirror round-trips; a Playwright drag at the S24
  Ultra profile that moves a control, saves, reloads and asserts it restored (and that
  a control can't be dropped off-screen).
- **Files:** `src/game.js` (the layout model + editor mode, drag wiring reusing the
  Task 16 controller, apply-on-boot, `serializeGame` / `applySave`, `SAVE_VERSION`
  13 → 14, the localStorage mirror), `index.html` / `css/style.css` (editor overlay,
  handles, positioning the controls from the stored fractions), `src/core/i18n.js`
  (EN+RU), `test/*` (+ E2E), `README.md`. **`SAVE_VERSION` 13 → 14.**
- **Out of scope:** resizing / opacity / per-control scale (note as a follow-up —
  this task is *position*); customizing the non-combat HUD widgets (status chips /
  minimap — Task 30 owns their regions); multiple named layout presets (one layout per
  profile is enough; note presets as a follow-up).
- **Hints:** store positions as **viewport fractions**, not pixels, so they survive
  any resolution/orientation; reuse Task 16's pointer-drag + ghost; clamp on apply
  *and* on load so a layout saved on one device is safe on another; keep the reducer
  pure so the DOM layer stays thin.

### Task 37 — Exit/enter fullscreen control in the settings menu
- **Status:** `[x]` — 2026-06-30 · Added a **Display** sub-panel in pause → settings with a fullscreen
  toggle whose label reflects state (**Enter fullscreen** / **Exit fullscreen**, EN+RU) and drives the
  **same `Fullscreen.toggle()`** as the kept `#fsBtn` HUD button (so the Task-16 touch landscape lock on
  enter / `unlockOrientation()` on exit is shared). A single `fullscreenchange` listener
  (`Fullscreen.sync` → new `syncMenu()`, also called from `Pause.refreshTexts()`) keeps the menu label,
  the HUD glyph and `document.fullscreenElement` in lockstep however fullscreen is toggled. The
  (vendor-prefixed) Fullscreen API is feature-detected — when unsupported (e.g. iOS Safari) the whole
  `#displayPanel` + the HUD button hide cleanly (no dead control) and a rejecting exit/lock promise never
  throws. New `test/fullscreen-settings.test.js` (9 cases; Vitest 309 → 318) + `test/e2e/fullscreen.spec.js`
  (desktop + S24 Ultra portrait/landscape). No `SAVE_VERSION` change.
- **Depends on:** Task 16 (the `Fullscreen` module — `toggle` / `active` / `supported`
  / `lockLandscape` / `unlockOrientation`, `src/game.js` ~10622-10686; the `#fsBtn`
  HUD button). None else.
- **Goal.** Fullscreen can only be toggled from the small **`⛶`/`✕` HUD button** in
  the top-right corner; there is **no fullscreen control in the pause/settings menu**,
  so a player who wants to leave fullscreen (or doesn't notice the corner glyph) has no
  option where they'd expect it. Add an explicit **fullscreen toggle (with a clear
  "Exit fullscreen" state) in the settings menu**, the way every PC/console game keeps a
  Display option in its menu.
- **Scope (build this):**
  - **A fullscreen control in pause → settings.** Add a labelled control (in a new
    **"Display"** sub-panel, or alongside Graphics) that **enters fullscreen when
    windowed and exits when fullscreen**, with its label reflecting the current state
    ("Enter fullscreen" / "Exit fullscreen"). Drive it through the existing
    `Fullscreen.toggle()` so behaviour (incl. the Task 16 touch **landscape lock** on
    enter and `unlockOrientation()` on exit) stays consistent with the HUD button; keep
    the HUD button too.
  - **State sync + feature detection.** Keep the menu control, the HUD button glyph and
    the actual `document.fullscreenElement` state in sync (listen to `fullscreenchange`).
    **Feature-detect** `requestFullscreen` / `exitFullscreen` (and the vendor-prefixed
    forms already handled) — when unsupported (e.g. iOS Safari) **hide/disable** the
    control gracefully rather than showing a dead button. Never throw if the exit/lock
    promise rejects.
  - **i18n.** New / audited strings via `t()` in **EN + RU** (the
    `btnTitle.exitFullscreen` string already exists — reuse/extend it for the menu
    label).
- **Acceptance criteria:**
  - The settings/pause menu has a working control that **exits fullscreen when in
    fullscreen** (and enters when not), label reflecting state, kept in sync with the
    HUD button and the browser's actual fullscreen state.
  - On browsers without the Fullscreen API the control is **cleanly hidden/disabled**
    (no dead click, no throw); desktop + mobile both behave; the touch landscape lock
    still releases on exit.
  - EN+RU localized; full pipeline green; headless-safe.
- **Tests to add:** a Vitest check that the menu toggle calls `Fullscreen.toggle()` and
  that the label/visibility derive from `Fullscreen.active()` / `supported()`
  (feature-detected, no-op safe headless); a Playwright assertion that the settings
  control is present and reflects state (entering is gated by a user gesture in-browser,
  so assert the wiring/visibility + that it's hidden when unsupported).
- **Files:** `index.html` (pause-menu Display sub-panel + control, ~the settings panels
  at lines 207-271), `src/game.js` (`Fullscreen` menu wiring + a `fullscreenchange`
  state sync), `css/style.css` (the control), `src/core/i18n.js` (EN+RU labels),
  `test/*`, `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** a windowed-resolution picker or borderless-window modes (browser
  fullscreen only); changing the existing HUD button (keep it).
- **Hints:** reuse `Fullscreen.toggle()` verbatim and just add a second trigger + a
  `fullscreenchange` listener so both entry points and the glyph stay in lockstep; hide
  the control when `Fullscreen.supported()` is false.

### Task 38 — Fix: NPCs are only talkable in the hub — spawn quest-givers in their home zones
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

### Task 39 — Collision-free HUD: a real region/layer system so no widget or button overlaps
- **Status:** `[x]` — 2026-06-30 · Gave the HUD a disciplined **region/layer system**: the six
  top-right icon buttons became **one `#hudControls` flex row** whose width (`--controls-w`, derived
  from the shared button vars) the top-status chip row now **reserves** on its right edge, so the
  **weather/clock can never flow under the quest (or any) button** — the structural fix. Every
  absolutely-positioned widget is grouped into an explicit, anchored, non-overlapping `.hud-region`
  (top-status · control row · corner minimap+compass · centre bars · left relics+tracker · bottom
  action cluster) with a z-tier + `pointer-events` discipline; on phones they lay out in distinct
  **vertical bands** sized from named CSS vars (boss bar stacked below the tracker; landscape shrinks
  the minimap so its column clears the one-thumb arc). Holds at the S24 Ultra (portrait + landscape),
  ~360px and desktop, in either locale's longest labels, with boss/compass/tracker all visible.
  Layout only (no `SAVE_VERSION` change). New `test/util/rect.js` + Vitest `test/hud-regions.test.js`
  (11 cases; 274 → 285) + a Playwright `hud-regions` suite of pairwise non-overlap assertions, with
  the same worst-case checks added to the live `responsive.spec.js`. Task 16 declutter + action arc +
  safe-area insets + minimap-tap intact.
- **Depends on:** Task 16 (the HUD markup + z-index tiers + the touch action arc).
  Pairs with **Task 36** (do this **before** the free-form control editor so custom
  positions start from clean regions). None else.
- **Goal.** HUD widgets **overlap**: the **weather** widget (and the **clock**) live as
  inline flex children of the top-centre `.hud-top` status row, while the top-right
  **icon button row** (fullscreen / pause / inventory / skills / craft / **quest**) is
  independently absolutely-positioned at the same top edge and extends ~260 px in from
  the right — and on touch `.hud-top` only reserves ~132 px on the right (enough to clear
  the 116 px minimap, **not** the wider button row), so the **weather/clock chips flow
  rightward under the quest button**. Despite Task 16's intent, there is **no real named
  region system** — every element is positioned independently, so overlaps recur whenever
  a label grows or wraps. Give the HUD a disciplined **region/layer layout** so **no two
  widgets or buttons ever share pixels** at any supported resolution/orientation — the
  safe-area HUD hygiene console/mobile games hold to.
- **Scope (build this):**
  - **Define named, non-overlapping HUD regions.** Carve the screen into explicit
    anchored regions — **top-status** (location / level / XP / coins / clock / weather),
    **top-right control row** (icon buttons), **corner minimap + compass**, **centre
    bars** (health / focus / boss), **left column** (relics / quest tracker) and the
    **bottom action cluster** (joystick / skill bar / potion bar / buff bar / E / fire) —
    each with a reserved bounding box and a z-tier, using a small set of CSS layer classes
    + `pointer-events` discipline. Audit **every** absolutely-positioned HUD element and
    assign it to exactly one region.
  - **Fix the weather/quest collision specifically.** Reserve the top-right control-row
    width in the top-status row's layout (or move the clock/weather into a region that can
    never reach the button row) so the weather/clock chips **never** sit under the quest
    (or any) icon button — at the S24 Ultra width, at a narrow ~360 px width, with long
    localized labels (e.g. "Гроза" / "Thunderstorm"), and when the row would otherwise wrap.
  - **Prove it at every breakpoint.** Make the regions hold in **portrait and landscape**
    on the **Galaxy S24 Ultra** profile, a small phone width, and desktop — including when
    labels are at their longest in either locale and when the boss bar / compass / quest
    tracker are all visible at once.
  - **No behaviour/visual regressions.** Keep the Task 16 declutter (no duplicate
    buttons), the one-thumb action arc, safe-area insets and the minimap-tap map entry;
    this is **layout layering**, not a redesign of widget contents.
- **Acceptance criteria:**
  - **No two HUD widgets/buttons overlap** at any tested resolution/orientation —
    explicitly, the **weather/clock never collide with the quest button** (or any icon
    button) — verified by bounding-box assertions across the S24 Ultra (portrait +
    landscape), a small width and desktop, with longest-label locales.
  - The HUD reads as deliberate anchored regions with correct z-layering and
    `pointer-events` (taps land on the right control); the Task 16 declutter + action arc
    are intact.
  - Works desktop + mobile; headless-safe; full pipeline green.
- **Tests to add:** extend the **Playwright responsive suite** (`test/e2e/responsive.spec.js`
  — S24 Ultra portrait + landscape, a ~360 px width, desktop) with **pairwise bounding-box
  non-overlap** assertions over all key HUD elements (explicitly weather × quest button),
  run with the longest EN **and** RU labels and with the boss bar / compass / tracker
  visible; a Vitest check on any pure region-geometry helper if one is introduced.
- **Files:** `css/style.css` (HUD region/layer classes + anchored bounding boxes; the
  top-status right-reserve fix), `index.html` (group HUD elements into their region
  containers), `src/game.js` (any HUD wiring that toggles regions),
  `test/e2e/responsive.spec.js` (+ a small Vitest helper test), `README.md`. No
  `SAVE_VERSION` change (layout only).
- **Out of scope:** the free-form drag-to-reposition editor (Task 36 — this task fixes the
  *default* layout so it never overlaps), redesigning widget contents, a UI-framework
  rewrite.
- **Hints:** the collision is the top-status row not reserving the icon-row width on the
  right; fix it at the layout level (a region reserve) rather than nudging one element;
  assert non-overlap in E2E so the regression can't return as new widgets are added.

---

## 4e. The backlog (Tasks 40–41) — vendors everywhere & a cloud-first save system

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

### Task 40 — Travelling vendors in every land: merchant, blacksmith & apothecary reachable outside the hub
- **Status:** `[ ]`
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

### Task 41 — Retire file saves; make Google Drive the primary, user-friendly save path
- **Status:** `[ ]`
- **Depends on:** Task 15 (Google Drive cloud saves — `CloudSave` / `CloudUI` /
  `makeGoogleDriveClient`), Task 17 (the durable auto-resume session + the `SaveSlots`
  base) and Task 18 (the `SaveSlots` / `SavesUI` *Manage Saves* screen, where file
  export/import currently lives). **Pairs with / best done with or after Task 23**
  (persist Google sign-in across reloads — the silent re-auth that makes "stay signed
  in" actually work). Coordinate `SAVE_VERSION` with any schema-changing task (e.g.
  Task 36).
- **Note on Golden Rules:** Google Drive stays **opt-in** and must **degrade
  gracefully** — offline / signed-out / unconfigured / headless never throws or
  blocks, and the **local save slots + auto-resume remain the always-available
  fallback** (Golden Rule 1). Promoting Drive to the *primary* save path must **not**
  make local play depend on the network: removing the file mechanic must leave a
  signed-out / offline player fully able to save (named local slots) and resume
  (auto-session). No new external dependency beyond the Drive one Task 15 added.
  *(Scope decision, confirmed with the user: remove the **file** save/load only;
  **keep** the in-browser local slots + auto-resume as the quiet offline fallback;
  make Drive the primary path.)*
- **Goal.** Two related problems. **(a)** The game still ships a **save-to-file /
  load-from-file** mechanic — `downloadSave()` (`src/game.js:8740`) hands the player a
  `.json` they must file and track by hand, and `loadFromFile()` (`src/game.js:8767`)
  re-imports it; it's surfaced as the start-screen **"Load Progress"** → OS file
  picker (`#loadBtn` / `#loadFile`, `index.html:42-44`) and the **"Export to file" /
  "Import from file"** buttons in the Saves screen (`#savesExportBtn` /
  `#savesImportBtn` / `#savesImportFile`, `index.html:498-503`). Hand-managing `.json`
  files is clunky and error-prone, and it's redundant now that the game
  **auto-resumes** (Task 17) and has **named slots** (Task 18) and **cloud saves**
  (Task 15). **Remove the file mechanic entirely.** **(b)** Google Drive works but
  isn't presented as the **primary** path and the flow isn't friendly — sign-in is
  buried among other settings; the controls are split across **four** surfaces (the
  start-screen `.cloud-settings` panel, the pause panel, the Saves-screen cloud
  section **and** a standalone `#cloudSaves` browser overlay); status messaging is
  terse; autosave is **off by default** and tucked away; and there's no at-a-glance
  "signed in as … · last saved …" feedback. Rework the save UX so **Google Drive is
  the prominent, primary way to save and load**, with the local slots + auto-resume
  kept as a quiet offline fallback — the "it just syncs" experience well-reviewed
  games ship.
- **Scope (build this):**
  - **Remove the file save/load mechanic (no dead code).** Delete `downloadSave()`
    (`src/game.js:8740-8763`) and `loadFromFile()` (`8767-8782`); the start-screen
    **Load Progress** button + hidden file input and their wiring (`index.html:42-44`,
    `src/game.js` ~10843-10851); the Saves-screen **"File"** sub-section — the
    `saves.file` heading, `#savesExportBtn`, `#savesImportBtn`, `#savesImportFile`
    (`index.html:498-503`) and their handlers (`src/game.js` ~9745-9752); the dead
    `dom.saveBtn` reference + its pause handler (~10026-10033); the now-unused i18n
    keys (`saves.export`, `saves.import`, `saves.file`, and `toast.saveFailed` /
    `toast.readError` — **verify each is unused elsewhere first**, and **keep**
    `toast.nothingToSave` / `toast.invalidSave`, which the cloud/slot paths share) in
    **EN + RU**; and any `.saves-file` CSS. Leave the `PENDING_LOAD_KEY` boot seam and
    `serializeGame` / `applySave` / `validateSave` untouched (slots, cloud and the
    auto-session all reuse them). Add a **grep guard** test so the file mechanic can't
    creep back (mirrors Task 19's lingering-identifier test).
  - **Make Google Drive the primary save path.** Promote cloud saving to the **top**
    of the save UX on both the **start screen** and **pause → settings**: a clear,
    prominent "Save to Google Drive" / "Sign in to save to Drive" primary action with
    the signed-in state, the account hint, the **last-saved time** and the autosave
    state shown at a glance. Reduce the **multi-surface sprawl** (start panel, pause
    panel, the Saves-screen cloud block and the standalone `#cloudSaves` overlay) into
    one coherent, well-signposted flow — one obvious "Cloud saves…" entry that opens
    the browse/restore list, with **consistent labels** across start + pause. The local
    **Manage Saves** slots stay reachable but **visually secondary** ("Local saves
    (offline backup)").
  - **A friendlier cloud flow.** Once signed in, default **autosave on** (still
    user-toggleable and persisted) so progress syncs without thinking, with an
    unobtrusive "Autosaved · just now" indicator; surface **manual save**, the
    **rolling autosave history** (Task 15's last-hour list) and **restore** behind one
    clear browser; keep the **conflict reconcile** (`cloudNewer`) but present it as a
    friendly "Drive has newer/older progress — keep which?" choice rather than a bare
    confirm; make the **not-configured** (no OAuth client id) and **offline** states
    explain themselves and fall back to local cleanly. Reuse the existing `cloud.*`
    strings/toasts; add EN+RU for anything new.
  - **Keep local slots + auto-resume as the quiet offline fallback.** The named local
    slots (Task 18) and the auto-resume "Continue" (Task 17) stay fully functional and
    are the path when the player is signed out / offline / on an unconfigured build —
    just de-emphasized relative to Drive. Nothing about removing files or promoting
    cloud may break offline saving.
  - **i18n + graceful degradation + headless-safety.** All new/changed copy through
    `t()` in **EN + RU** (key-parity stays green); every browser/Google API stays
    **feature-detected**; no GIS / no cookies / headless ⇒ Drive cleanly disabled and
    local slots still work, **nothing throws**.
- **Acceptance criteria:**
  - There is **no save-to-file or load-from-file anywhere** — no `downloadSave` /
    `loadFromFile`, no "Load Progress" / "Export" / "Import" buttons or file inputs, no
    `saves.export` / `saves.import` / `saves.file` strings — and nothing references
    them (grep-clean); the build has no dead code or broken handlers.
  - **Google Drive is the prominent, primary** save/load path on the start screen
    **and** pause menu, with clear signed-in / account / last-saved / autosave status;
    signing in, manual save, autosave, browsing the history and restoring all work
    through one coherent flow (verified against the injected Drive client).
  - **Offline / signed-out / unconfigured / headless** still works fully via **local
    slots + auto-resume** — saving and resuming never require the network and
    **nothing throws**; the conflict reconcile still prevents clobbering newer progress.
  - Cloud saves still use the **same `serializeGame` schema** (no `SAVE_VERSION`
    change) and round-trip back into a running game; full pipeline green; works on
    desktop + mobile (S24 Ultra portrait + landscape).
- **Tests to add:** a **grep / lint-style guard** that fails on any lingering
  file-save identifier or DOM id (`downloadSave`, `loadFromFile`, `loadBtn`,
  `loadFile`, `savesExportBtn`, `savesImportBtn`, `saves.export/import/file`); update
  `test/saveslots.test.js` and the `test/e2e/saves.spec.js` flow to **drop file
  export/import** and assert the File section is gone; cloud-UX tests against the
  **injected client** (`CloudSave._setClient`) — primary-flow sign-in / save / list /
  restore, **autosave-default-on after sign-in**, the friendly **conflict** decision
  via `cloudNewer`, and the not-configured / offline fallbacks; a **local-fallback**
  test that signed-out / headless still saves to a slot and auto-resumes; an **E2E** at
  desktop + the S24 Ultra profile asserting Drive is the primary action, the file
  controls are absent, and the Saves screen has no File section. The headless harness
  stays green with no Google client present.
- **Files:** `src/game.js` (remove `downloadSave` / `loadFromFile` + their wiring and
  the dead `saveBtn` handler; `CloudUI` / `CloudSave` promotion + friendlier states +
  autosave default; `SavesUI` de-emphasize local + drop the file section),
  `index.html` (remove `#loadBtn` / `#loadFile` + the Saves "File" block; promote the
  cloud controls on start + pause), `css/style.css` (cloud-primary layout; drop
  `.saves-file`), `src/core/i18n.js` (remove the dead file keys; add/adjust cloud copy,
  EN+RU), `test/*` (grep guard, cloud-UX, local-fallback, updated saves E2E),
  `README.md` (save/cloud section + privacy note; drop the file-save mention).
  **No `SAVE_VERSION` change** (file removal + UX only; cloud reuses the existing
  schema).
- **Out of scope:** the **silent sign-in-across-reload mechanics** (boot re-auth
  without a popup) — that's **Task 23**; coordinate, don't redo it (this task makes
  Drive *primary and friendly*, Task 23 makes the session *persist*). Also out: a
  custom save backend / non-Google providers, cross-device real-time sync (Task 15's
  out-of-scope stands), and **removing the local slots or auto-resume** (kept as the
  offline fallback per the chosen scope).
- **Hints:** the file mechanic is a **self-contained feature** with a clean excision
  surface (two functions + a handful of DOM ids / handlers / strings) — remove it
  first and prove the grep guard, then layer the cloud-primary UX on top. Reuse
  `serializeGame` / `applySave` + `PENDING_LOAD_KEY` **unchanged**; keep Drive
  **opt-in + graceful** so promoting it never strands an offline player (the local
  slots are the safety net); land this **with or after Task 23** so "primary cloud
  saves" also actually stays signed in.

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
- "make N next tasks"      → the next N tasks whose status is [ ] (not started),
  taken top-to-bottom from TODO.md § 5 "Recommended order".
- "make tasks A, B and C"  → exactly those task numbers, ordered to respect § 5
  and each task's "Depends on"; skip any already [x] done and tell me which.
- "next" / "the next task" → just the first [ ] task.
First read CLAUDE.md and TODO.md (§ 2 Definition of Done, § 5 order, the tasks).
Resolve the concrete ordered task list, PRINT it for me, and check dependencies:
if a task's "Depends on" isn't satisfied by a shipped or earlier-in-the-batch
task, reorder if you safely can, otherwise STOP and tell me.

RUN THE BATCH — for each task, IN ORDER, ONE AT A TIME:
1. Spawn ONE subagent (the `task-runner` agent) to do EXACTLY that task. It runs
   in its OWN fresh, isolated context window — it CANNOT see this conversation —
   so its prompt must tell it to read CLAUDE.md + TODO.md in full and do Task <N>
   only, end-to-end, to the § 2 Definition of Done, on its own branch
   `claude/task-<N>-<slug>` cut from the latest master. Pass the task number;
   pass nothing that belongs to another task.
2. WAIT for that subagent to FULLY finish. "Finished" = it implemented the task
   with new tests, kept the WHOLE pipeline green (lint + typecheck + test + build
   + e2e), ticked the task's checkbox in TODO.md, added a CHANGELOG.md entry,
   COMMITTED, then MERGED its branch into master (fast-forward — if master moved,
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

FIRST, read CLAUDE.md and TODO.md in full — including the task you're about to do
AND its "Depends on" and any "Note on Golden Rules". Some tasks (e.g. Task 9's
modularization/build step and Task 15's external Drive dependency) deliberately
REVISE the default rules; when a task has a "Note on Golden Rules", that note WINS
for that task, and part of the task is updating CLAUDE.md / TODO.md §1 to match.

DO EXACTLY ONE TASK: Task <N>. (If I wrote "next", take the first task whose
status is [ ] in TODO.md's "Recommended order".) Don't touch any other task or
scope-creep. If the task has an unmet "Depends on", stop and tell me.

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
5. Tick the task's checkbox in TODO.md (add the date + a one-line note) and add a
   release entry to CHANGELOG.md; commit + push (these land on master in step 4).
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
