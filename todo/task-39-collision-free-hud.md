# Task 39 — Collision-free HUD: a real region/layer system so no widget or button overlaps

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
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

