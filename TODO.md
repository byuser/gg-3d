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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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

If you skip ahead, still obey Golden Rule 9 (route new strings through i18n once
it exists) and the shared Definition of Done. For Tasks 9 & 15, read each task's
*Note on Golden Rules* first — they intentionally revise the single‑file /
no‑build‑step / no‑external‑dependency rules.

---

## 6. Run prompt

Paste this to start a run. Replace `<N>` with the task number, or write `next`.

```text
Act as a senior gameplay engineer on "Good Game 3D" — a Babylon.js browser
action-RPG in this repo, shipped to GitHub Pages.

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
  `node -c js/game.js` + `node test/harness.js`; once a task has added npm scripts
  / a build / Vitest / Playwright (Task 9), run those too and match exactly what
  CI runs. Feature-detect every browser-only API (Babylon / DOM / Web Audio /
  localStorage / PBR / particles / external SDKs) so the headless tests still run.
- All randomness via the seeded rng(); any new persistent state must serialize +
  restore in serializeGame/applySave (bump SAVE_VERSION on a schema change and
  keep older saves loading) and round-trip in a test.
- No regressions to combat, gear, quests, zones/travel, day-night/weather, pause,
  or save/load.

Workflow:
1. Plan briefly, then implement on the branch NAMED IN MY RUN INSTRUCTIONS (create
   it if missing); commit in logical chunks using this repo's commit-trailer
   convention (Co-Authored-By + Claude-Session).
2. Verify locally with the repo's current verify commands (see CLAUDE.md "Verify"
   / package.json scripts / the CI workflow) until all green, plus a tiny
   feature-specific smoke check that exercises the new code path.
3. Update index.html/css and README.md as needed; bump the `?v=` cache-busters
   while they still exist (a content-hashed build, once added, replaces them).
4. Merge to `master` (fast-forward) and push with retry/backoff. Then confirm BOTH
   the CI run AND the Pages deploy run for your commit finished
   conclusion=success — fix anything until both are green. Do not open a pull
   request unless I ask.
5. Tick the task's checkbox in TODO.md (add the date + a one-line note) and add a
   release entry to CHANGELOG.md; commit + push.
6. Report: what shipped, the test/build results, and the CI + deploy status.

If a decision is genuinely mine and cheap to confirm, pick the sensible default
and note it; if it's expensive or irreversible, ask me first.
```

---

## 7. Changelog

> **Moved.** The release history now lives in a dedicated
> [`CHANGELOG.md`](./CHANGELOG.md) at the repo root (Keep a Changelog format).
> When you finish a task, add the release entry **there**, not here. This heading
> is kept so older links to *TODO.md § 7* still resolve.
