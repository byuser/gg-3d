# Task 15 — Cloud saves to Google Drive (manual + 5‑min autosave via `appDataFolder`, rolling 1‑hour history)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-23 · Shipped opt‑in **Google Drive cloud saves** that reuse the exact
  `serializeGame()`/`applySave()` JSON (no schema change): GIS OAuth (drive.appdata scope, SDK loaded
  on demand) behind a sign‑in toggle on the start screen + pause settings, a **"Save to Drive"** manual
  slot, an **autosave every 5 min** (render‑loop tick, wall‑clock gated, paused while the tab is hidden,
  debounced, never blocks the thread) keeping a **rolling 1‑hour history** (≤ 12 timestamped slots,
  newest always kept), and a browse‑and‑**restore** overlay that reloads through the same boot path as
  the local file load (reconciling so a cloud save never silently clobbers newer in‑progress work). The
  Drive client is **injectable** (`CloudSave._setClient`) and every browser API is feature‑detected, so
  with no OAuth client id, no `fetch`, offline, or headless the feature is cleanly disabled and the local
  save still works — nothing throws. Pure policy (`cloudAutosaveDue`/`cloudPrune`/`cloudNewer`/auto‑name)
  + the injected‑client flows + local↔cloud payload parity are covered by a new `test/cloudsave.test.js`
  (25 cases; Vitest 100 → 125) plus an E2E panel smoke. The autosave‑on preference persists to
  `localStorage` (like locale/graphics/audio); `SAVE_VERSION` untouched at 9. Golden Rule 1 (CLAUDE.md +
  §1) updated to allow such opt‑in external services.
- **Depends on:** the existing `serializeGame`/`applySave` + `SAVE_VERSION`; do it
  **after** any task that changes the save schema (so the cloud format is stable).
- **Note on Golden Rules:** this adds an **external network dependency** and OAuth.
  It must stay **opt‑in** and **degrade gracefully** to the existing
  `localStorage` save when the player isn't signed in, is offline, or runs
  headless — the game must never block on the cloud. Requires a **Google API
  OAuth client ID** (document setup; read it from config, don't hard‑code
  secrets; the Drive JS client loads from Google's CDN, keeping the site static).
- **Goal.** Let the player **sign in with Google** and save game progress to their
  own Drive using the private **`appDataFolder`** space — both **manual save** and
  an **autosave every 5 minutes** — keeping a **rolling history of the last
  hour** of autosaves.
- **Scope (build this):**
  - **Auth.** Google Identity Services OAuth (drive.appdata scope), opt‑in from a
    settings/pause UI: sign‑in/sign‑out, signed‑in indicator. Tokens handled per
    Google's guidance; never persist secrets in the repo.
  - **Save/load to Drive `appDataFolder`.** Write the same serialized save JSON the
    local system uses into the user's hidden `appDataFolder` (invisible to other
    apps, no Drive clutter). Manual **"Save to Drive"** + **"Load from Drive"** that
    lists/loads available cloud saves. Reuse `serializeGame`/`applySave` verbatim so
    cloud and local formats match and versioning/migration just works.
  - **Autosave every 5 minutes.** A timer that writes an autosave to Drive every
    5 min while signed in (and on key beats — zone travel, chapter complete),
    pausing when the tab is hidden/idle; debounced; never blocks the main thread;
    surfaces quiet success/failure toasts.
  - **Rolling 1‑hour history.** Keep the **last hour** of autosaves (≈ up to 12
    timestamped slots), pruning older ones automatically. Let the player browse +
    restore any of the retained autosaves.
  - **Conflict & resilience.** Handle offline/expired‑token/quota errors
    gracefully (fall back to local, retry with backoff, clear messaging); reconcile
    local vs cloud on load (offer the newer, don't silently clobber).
- **Acceptance criteria:**
  - A signed‑in player can manually save to and load from their Drive
    `appDataFolder`; an autosave lands every ~5 minutes; the **last hour** of
    autosaves is retained and restorable, older ones pruned.
  - Signed‑out / offline / headless: the feature is cleanly disabled and the
    existing local save still works — **nothing throws**, nothing blocks.
  - Cloud saves use the **same schema** as local and respect `SAVE_VERSION`
    migration; a cloud save round‑trips back into a running game.
- **Tests to add:** the autosave **scheduler** (5‑min cadence, pause‑when‑hidden,
  debounce) and the **retention/pruning** policy (keep last hour) are pure, tested
  functions; serialize↔deserialize parity between local and cloud payloads; the
  Drive client is **feature‑detected/injectable** so tests run against a stub with
  no real network; offline/error fallback paths are covered. Headless harness
  stays green with no Google client present.
- **Files:** `js/game.js` (a `CloudSave`/`Drive` module wrapping
  `serializeGame`/`applySave`, the autosave scheduler + retention, settings hooks),
  `index.html`/`css` (sign‑in + cloud‑saves UI; bump `?v=`), config for the OAuth
  client ID, `test/harness.js`, `README.md` (setup + privacy note).
- **Out of scope:** a custom backend/server, cross‑device real‑time sync,
  cloud saves for non‑Google providers (note as follow‑ups).

---

