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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
- **Status:** `[ ]`
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
You are continuing work on "Good Game 3D", a Babylon.js browser action-RPG in this repo.

FIRST, read CLAUDE.md and TODO.md in full. Then implement EXACTLY ONE task: Task <N>
(if I wrote "next", take the first task whose status is [ ] in TODO.md’s Recommended order).
Do not start or touch any other task.

Obey the Golden Rules in CLAUDE.md and satisfy "§2 Definition of Done" in TODO.md
for that task. In particular:
- Keep the engine Babylon.js (no framework rewrite). The game must stay a static
  site deployable to GitHub Pages (no build step) and run on desktop AND mobile,
  without freezing the main thread.
- Keep the headless tests green: run `node -c js/game.js` and `node test/harness.js`
  and keep ALL checks passing. Feature-detect every browser-only API (Babylon, DOM,
  Web Audio, localStorage, particles, PBR/env) so the harness still runs. ADD new
  tests for the feature you build, including save/load round-trip for any new state.
- Ship it release-ready and fully functional: no stubs, placeholders, TODOs, or
  console errors, and no regressions to combat, gear, quests, zones, or save/load.

Workflow:
1. Plan briefly, then implement on branch `claude/lucid-mayer-wtmqgq` (create if missing).
2. Commit in logical chunks (use this repo’s commit-trailer convention).
3. Verify: `node -c js/game.js`, `node test/harness.js` (all green), plus a
   feature-specific headless smoke check.
4. Update index.html/css (bump the `?v=` cache-busters) and README.md as needed.
5. Merge to `master` (fast-forward) and push; then confirm BOTH the CI "Tests"
   run AND the GitHub Pages deploy run for YOUR commit finished conclusion=success
   — check them and fix any errors until green.
6. Tick the task’s checkbox in TODO.md (add the date + a one-line note), commit, push.
7. Report: what shipped, test results, deploy status, and any follow-ups.

If a requirement is genuinely my decision and cheap to confirm, pick the sensible
default and note it; if it’s expensive or irreversible, ask me first.
```

---

## 7. Changelog

- _(unreleased)_ Task 1 — RPG world + loadable zones: **shipped** (see git history
  `RPG zones (1–5/n)`), deployed to Pages.
- Add an entry here when you complete a task (date · task · one line).
