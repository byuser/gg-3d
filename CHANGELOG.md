# Changelog

All notable changes to **Good Game 3D** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/): newest first, with an
`## [Unreleased]` section at the top for work that has landed but is not yet
described under a dated heading.

**Versioning.** The game ships as a single static bundle on GitHub Pages, so
releases are keyed to the monotonic **`?v=` cache-buster** in `index.html`:
entries that change the playable bundle carry the build they shipped at — e.g.
`## [v19] — 2026-06-22 — …`. Entries that touch only docs/process (no bundle
change) are keyed by **date** — e.g. `## [2026-06-22] — …`. Each entry keeps the
task name, the `?v=` note and the harness-count delta it shipped with, since
later tasks reference those.

> **For future runs:** when you finish a task, append your release note here
> (not to `TODO.md`). Add a new `##` heading at the top of the dated list below
> `## [Unreleased]`, tagged with the build (`[v20]`, …) if you bumped the
> `?v=` cache-buster, or the date if the change was docs/process only.

---

## [Unreleased]

_Nothing pending._

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
