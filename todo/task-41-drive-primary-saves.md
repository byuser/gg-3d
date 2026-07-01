# Task 41 — Retire file saves; make Google Drive the primary, user-friendly save path

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[ ]`
- **Depends on:** Task 15 (Google Drive cloud saves — `CloudSave` / `CloudUI` /
  `makeGoogleDriveClient`), Task 17 (the durable auto-resume session + the `SaveSlots`
  base) and Task 18 (the `SaveSlots` / `SavesUI` *Manage Saves* screen, where file
  export/import currently lives). **Pairs with / best done with or after Task 23**
  (persist Google sign-in across reloads — the silent re-auth that makes "stay signed
  in" actually work). Coordinate `SAVE_VERSION` with any schema-changing task (e.g.
  Task 36).
- **Note on Golden Rules:** Google Drive stays **opt-in** and must **degrade
  gracefully** — offline / signed-out / unconfigured / headless never throws or
  blocks, and the **local save slots + auto-resume remain the always-available
  fallback** (Golden Rule 1). Promoting Drive to the *primary* save path must **not**
  make local play depend on the network: removing the file mechanic must leave a
  signed-out / offline player fully able to save (named local slots) and resume
  (auto-session). No new external dependency beyond the Drive one Task 15 added.
  *(Scope decision, confirmed with the user: remove the **file** save/load only;
  **keep** the in-browser local slots + auto-resume as the quiet offline fallback;
  make Drive the primary path.)*
- **Goal.** Two related problems. **(a)** The game still ships a **save-to-file /
  load-from-file** mechanic — `downloadSave()` (`src/game.js:8740`) hands the player a
  `.json` they must file and track by hand, and `loadFromFile()` (`src/game.js:8767`)
  re-imports it; it's surfaced as the start-screen **"Load Progress"** → OS file
  picker (`#loadBtn` / `#loadFile`, `index.html:42-44`) and the **"Export to file" /
  "Import from file"** buttons in the Saves screen (`#savesExportBtn` /
  `#savesImportBtn` / `#savesImportFile`, `index.html:498-503`). Hand-managing `.json`
  files is clunky and error-prone, and it's redundant now that the game
  **auto-resumes** (Task 17) and has **named slots** (Task 18) and **cloud saves**
  (Task 15). **Remove the file mechanic entirely.** **(b)** Google Drive works but
  isn't presented as the **primary** path and the flow isn't friendly — sign-in is
  buried among other settings; the controls are split across **four** surfaces (the
  start-screen `.cloud-settings` panel, the pause panel, the Saves-screen cloud
  section **and** a standalone `#cloudSaves` browser overlay); status messaging is
  terse; autosave is **off by default** and tucked away; and there's no at-a-glance
  "signed in as … · last saved …" feedback. Rework the save UX so **Google Drive is
  the prominent, primary way to save and load**, with the local slots + auto-resume
  kept as a quiet offline fallback — the "it just syncs" experience well-reviewed
  games ship.
- **Scope (build this):**
  - **Remove the file save/load mechanic (no dead code).** Delete `downloadSave()`
    (`src/game.js:8740-8763`) and `loadFromFile()` (`8767-8782`); the start-screen
    **Load Progress** button + hidden file input and their wiring (`index.html:42-44`,
    `src/game.js` ~10843-10851); the Saves-screen **"File"** sub-section — the
    `saves.file` heading, `#savesExportBtn`, `#savesImportBtn`, `#savesImportFile`
    (`index.html:498-503`) and their handlers (`src/game.js` ~9745-9752); the dead
    `dom.saveBtn` reference + its pause handler (~10026-10033); the now-unused i18n
    keys (`saves.export`, `saves.import`, `saves.file`, and `toast.saveFailed` /
    `toast.readError` — **verify each is unused elsewhere first**, and **keep**
    `toast.nothingToSave` / `toast.invalidSave`, which the cloud/slot paths share) in
    **EN + RU**; and any `.saves-file` CSS. Leave the `PENDING_LOAD_KEY` boot seam and
    `serializeGame` / `applySave` / `validateSave` untouched (slots, cloud and the
    auto-session all reuse them). Add a **grep guard** test so the file mechanic can't
    creep back (mirrors Task 19's lingering-identifier test).
  - **Make Google Drive the primary save path.** Promote cloud saving to the **top**
    of the save UX on both the **start screen** and **pause → settings**: a clear,
    prominent "Save to Google Drive" / "Sign in to save to Drive" primary action with
    the signed-in state, the account hint, the **last-saved time** and the autosave
    state shown at a glance. Reduce the **multi-surface sprawl** (start panel, pause
    panel, the Saves-screen cloud block and the standalone `#cloudSaves` overlay) into
    one coherent, well-signposted flow — one obvious "Cloud saves…" entry that opens
    the browse/restore list, with **consistent labels** across start + pause. The local
    **Manage Saves** slots stay reachable but **visually secondary** ("Local saves
    (offline backup)").
  - **A friendlier cloud flow.** Once signed in, default **autosave on** (still
    user-toggleable and persisted) so progress syncs without thinking, with an
    unobtrusive "Autosaved · just now" indicator; surface **manual save**, the
    **rolling autosave history** (Task 15's last-hour list) and **restore** behind one
    clear browser; keep the **conflict reconcile** (`cloudNewer`) but present it as a
    friendly "Drive has newer/older progress — keep which?" choice rather than a bare
    confirm; make the **not-configured** (no OAuth client id) and **offline** states
    explain themselves and fall back to local cleanly. Reuse the existing `cloud.*`
    strings/toasts; add EN+RU for anything new.
  - **Keep local slots + auto-resume as the quiet offline fallback.** The named local
    slots (Task 18) and the auto-resume "Continue" (Task 17) stay fully functional and
    are the path when the player is signed out / offline / on an unconfigured build —
    just de-emphasized relative to Drive. Nothing about removing files or promoting
    cloud may break offline saving.
  - **i18n + graceful degradation + headless-safety.** All new/changed copy through
    `t()` in **EN + RU** (key-parity stays green); every browser/Google API stays
    **feature-detected**; no GIS / no cookies / headless ⇒ Drive cleanly disabled and
    local slots still work, **nothing throws**.
- **Acceptance criteria:**
  - There is **no save-to-file or load-from-file anywhere** — no `downloadSave` /
    `loadFromFile`, no "Load Progress" / "Export" / "Import" buttons or file inputs, no
    `saves.export` / `saves.import` / `saves.file` strings — and nothing references
    them (grep-clean); the build has no dead code or broken handlers.
  - **Google Drive is the prominent, primary** save/load path on the start screen
    **and** pause menu, with clear signed-in / account / last-saved / autosave status;
    signing in, manual save, autosave, browsing the history and restoring all work
    through one coherent flow (verified against the injected Drive client).
  - **Offline / signed-out / unconfigured / headless** still works fully via **local
    slots + auto-resume** — saving and resuming never require the network and
    **nothing throws**; the conflict reconcile still prevents clobbering newer progress.
  - Cloud saves still use the **same `serializeGame` schema** (no `SAVE_VERSION`
    change) and round-trip back into a running game; full pipeline green; works on
    desktop + mobile (S24 Ultra portrait + landscape).
- **Tests to add:** a **grep / lint-style guard** that fails on any lingering
  file-save identifier or DOM id (`downloadSave`, `loadFromFile`, `loadBtn`,
  `loadFile`, `savesExportBtn`, `savesImportBtn`, `saves.export/import/file`); update
  `test/saveslots.test.js` and the `test/e2e/saves.spec.js` flow to **drop file
  export/import** and assert the File section is gone; cloud-UX tests against the
  **injected client** (`CloudSave._setClient`) — primary-flow sign-in / save / list /
  restore, **autosave-default-on after sign-in**, the friendly **conflict** decision
  via `cloudNewer`, and the not-configured / offline fallbacks; a **local-fallback**
  test that signed-out / headless still saves to a slot and auto-resumes; an **E2E** at
  desktop + the S24 Ultra profile asserting Drive is the primary action, the file
  controls are absent, and the Saves screen has no File section. The headless harness
  stays green with no Google client present.
- **Files:** `src/game.js` (remove `downloadSave` / `loadFromFile` + their wiring and
  the dead `saveBtn` handler; `CloudUI` / `CloudSave` promotion + friendlier states +
  autosave default; `SavesUI` de-emphasize local + drop the file section),
  `index.html` (remove `#loadBtn` / `#loadFile` + the Saves "File" block; promote the
  cloud controls on start + pause), `css/style.css` (cloud-primary layout; drop
  `.saves-file`), `src/core/i18n.js` (remove the dead file keys; add/adjust cloud copy,
  EN+RU), `test/*` (grep guard, cloud-UX, local-fallback, updated saves E2E),
  `README.md` (save/cloud section + privacy note; drop the file-save mention).
  **No `SAVE_VERSION` change** (file removal + UX only; cloud reuses the existing
  schema).
- **Out of scope:** the **silent sign-in-across-reload mechanics** (boot re-auth
  without a popup) — that's **Task 23**; coordinate, don't redo it (this task makes
  Drive *primary and friendly*, Task 23 makes the session *persist*). Also out: a
  custom save backend / non-Google providers, cross-device real-time sync (Task 15's
  out-of-scope stands), and **removing the local slots or auto-resume** (kept as the
  offline fallback per the chosen scope).
- **Hints:** the file mechanic is a **self-contained feature** with a clean excision
  surface (two functions + a handful of DOM ids / handlers / strings) — remove it
  first and prove the grep guard, then layer the cloud-primary UX on top. Reuse
  `serializeGame` / `applySave` + `PENDING_LOAD_KEY` **unchanged**; keep Drive
  **opt-in + graceful** so promoting it never strands an offline player (the local
  slots are the safety net); land this **with or after Task 23** so "primary cloud
  saves" also actually stays signed in.

