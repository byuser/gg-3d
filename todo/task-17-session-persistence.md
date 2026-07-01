# Task 17 — Durable session persistence (progress + Google sign‑in survive reload and desktop⇄mobile mode switches)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-25 · Shipped a first‑party `Session` module that auto‑persists the live run
  (the exact `serializeGame()` JSON) to `localStorage`, debounced (1.5 s) on key beats + flushed on
  `visibilitychange`/`pagehide`, and **auto‑restores it on boot** through the same `gg3d_pending_load` seam as
  the file/cloud load — surfaced as a **"Continue"** button (Start still begins fresh). A pure, feature‑detected
  cookie helper (`buildCookieString`/`parseCookies` + `cookieGet/Set/Del`, `SameSite=Lax`/`Secure`/180‑day
  `Max‑Age`, `localStorage` fallback via `ck_*`) carries a session id + locale/quality + cloud flag + a
  **non‑sensitive Google auth hint**; the bulky snapshot stays in `localStorage`. The Drive client gained a
  **silent token path** (`signInSilent` → GIS `prompt:""` + `login_hint`); `CloudUI` re‑auths silently on boot
  when the player had opted in (sign‑out clears the hint → no silent re‑auth), gated by the pure
  `silentAuthDecision`. A **"Clear saved session & sign out"** control (start + pause, EN+RU) wipes everything.
  No `SAVE_VERSION` change (reuses the existing schema; older saves still load). New `test/session.test.js`
  (23 cases; Vitest 141 → 164) + a Playwright `session.spec.js` (resume‑after‑reload) at desktop + the S24 Ultra
  portrait + landscape profiles.
- **Depends on:** the existing `serializeGame`/`applySave` + `localStorage` prefs
  (Tasks 9/15). Coordinate with **Task 18** (save management) and **Task 15**
  (cloud auth) — they share the persistence layer. Do this **before/with** Task 18.
- **Goal.** Reloading the page, or switching between **desktop and mobile** layout
  (e.g. responsive breakpoint / DevTools device mode / a re‑orientation that
  re‑boots the view), currently **loses the in‑progress run** and **drops the
  Google Drive sign‑in** (auth is per‑session only — see Task 15's note that
  tokens are not persisted). Add **durable, first‑party session persistence** so a
  returning player resumes **exactly where they left off** without re‑downloading a
  file or signing in again, the way shipped web games keep you logged in and
  mid‑run across reloads.
- **Scope (build this):**
  - **Auto‑persisted local session (resume‑on‑reload).** Continuously persist the
    live run (the exact `serializeGame()` JSON) to a **first‑party store** —
    debounced on key beats (zone travel, level‑up, quest turn‑in, purchase) and on
    `visibilitychange`/`pagehide` — and **auto‑restore it on boot** through the same
    path as a file/cloud load, so a reload drops the player straight back into the
    run (offer a "Continue" affordance on the start screen rather than silently
    forcing it). Reuse the existing `gg3d_pending_load` boot hand‑off seam.
  - **Cookie support (as requested) — with the right tool for each datum.** Add
    **cookie**‑based persistence so state survives reload and **desktop⇄mobile mode
    switches**. Use cookies for the **small, long‑lived identifiers** that should
    travel with the session (a session id, the chosen locale/quality, the "cloud
    autosave on" flag, and a lightweight **auth hint** so we can **silently
    re‑acquire** a Google token — see below); keep the **bulky run snapshot** in
    `localStorage`/IndexedDB (cookies are size‑limited and sent on every request).
    Set cookies **first‑party** with `SameSite=Lax`, `Secure` (the site is HTTPS on
    Pages), and a sensible `Max‑Age`; **feature‑detect** `document.cookie` and fall
    back to `localStorage` when cookies are unavailable (private mode, headless).
    No third‑party/tracking cookies — first‑party persistence only.
  - **Persist the Google sign‑in across reload.** Today GIS re‑authenticates every
    session. Persist enough to **restore the signed‑in state without a fresh
    consent prompt**: remember the signed‑in account hint and use GIS **silent
    token refresh** (`prompt: ""` / `login_hint`) on boot to re‑acquire an access
    token when the player had opted in — falling back to the explicit sign‑in
    button if silent refresh fails. **Never persist secrets in the repo**; store
    only non‑sensitive hints client‑side and keep the feature **opt‑in** and
    **degrading gracefully** (signed‑out/offline/headless still work). Honour
    **sign‑out** by clearing the hint so it does **not** silently re‑auth.
  - **Survive desktop⇄mobile switches.** Ensure the persisted session is **layout
    agnostic** — switching responsive mode / re‑orienting / a quality‑change reload
    restores the same run and the same sign‑in. The HUD/menu rebuild from Task 16
    must read from the restored state, not reset it.
  - **Privacy & control.** Document what is stored and where (README + a short
    in‑settings note); provide a **"clear saved session / sign out"** control so the
    player can wipe local persistence. Respect existing `SAVE_VERSION` migration so
    an auto‑restored session from an older schema still loads.
- **Acceptance criteria:**
  - Reloading the page **resumes the in‑progress run** (same zone, stats,
    inventory, quests, time/weather) via the auto‑persisted session — no file
    re‑load needed; a "Continue" entry point is offered.
  - After opting into Google Drive, a **reload keeps you effectively signed in**
    (silent token refresh) without a new consent dialog; **sign‑out** clears it and
    no silent re‑auth happens afterward.
  - Switching **desktop⇄mobile** layout (or re‑orienting / changing graphics
    quality) preserves both the **run** and the **sign‑in**.
  - Cookies are **first‑party**, `SameSite=Lax`/`Secure`, feature‑detected, with a
    `localStorage` fallback; **nothing throws** when cookies are blocked or
    headless; signed‑out/offline still play.
  - A player can **clear** the saved session/sign‑in from settings.
- **Tests to add:** a **pure cookie helper** (get/set/expire, `SameSite`/`Secure`
  attributes, feature‑detect + `localStorage` fallback) unit‑tested; an
  **auto‑persist scheduler** (debounce + flush on hide/pagehide) tested as a pure
  function; a **save↔restore round‑trip** through the cookie/local session path
  (parity with file/cloud payloads); the **silent‑auth** decision (had‑opted‑in +
  hint ⇒ attempt silent refresh; signed‑out ⇒ don't) tested against an **injected
  GIS stub**; an E2E that loads the built site, starts a run, reloads, and asserts
  the run resumed.
- **Files:** `src/game.js` (a small `Session`/persistence module wrapping
  `serializeGame`/`applySave`, the cookie helper, the boot auto‑restore +
  "Continue", `CloudSave` silent‑auth + hint storage, a clear‑session control),
  `index.html`/`css` ("Continue" + clear‑session UI), `src/core/i18n.js` (EN+RU),
  `test/*` (cookie/scheduler/round‑trip/silent‑auth + E2E), `README.md` (privacy
  note). No `SAVE_VERSION` change expected (it reuses the existing schema).
- **Out of scope:** a server‑side session backend or account system; cross‑device
  sync beyond what Drive already offers (Task 15); third‑party analytics cookies.
- **Hints:** cookies for **small identifiers**, `localStorage`/IndexedDB for the
  **snapshot**; keep the cookie helper pure + feature‑detected so headless tests
  pass; reuse the Task 15 reconcile (`cloudNewer`) so an auto‑restored local
  session never clobbers a newer cloud save.

