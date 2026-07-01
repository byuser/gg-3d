# Task 16 — Responsive, mobile‑first HUD & menu overhaul (auto‑fit at any resolution; one‑thumb combat; drag‑and‑drop skill slots)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
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

