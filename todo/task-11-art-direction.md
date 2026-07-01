# Task 11 — Brighter, more cheerful art direction + a larger visible play area

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
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

