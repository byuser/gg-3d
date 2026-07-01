# Task 37 — Exit/enter fullscreen control in the settings menu

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
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

