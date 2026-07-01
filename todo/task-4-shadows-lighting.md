# Task 4 — More + more‑realistic shadows & lighting

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
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

