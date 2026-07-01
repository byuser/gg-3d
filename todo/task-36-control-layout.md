# Task 36 — Customizable on-screen control layout (drag any control anywhere; saved + restored)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
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

