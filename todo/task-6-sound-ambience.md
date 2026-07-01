# Task 6 — More sound effects + per‑location background ambience

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
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

