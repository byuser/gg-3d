# Task 23 — Persist Google Drive sign-in across reloads (true silent re-auth; no unprompted dialog)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-30 · Made boot re-auth **truly silent**: `signInSilent` now uses GIS's
  strictly non-interactive `prompt: "none"` token path (was `""`, which could raise a visible account
  chooser) wired with an `error_callback` + an 8 s watchdog that swallow every non-silent outcome, so
  **no Google dialog appears on load** — the explicit "Sign in with Google" button is the only path to
  consent. The boot path stays gated on `silentAuthDecision` (attempt only when the stored `optedIn`
  hint is present; first-run / signed-out never touch GIS) and was **hoisted before the WebGL scene
  builds** so it degrades gracefully even if the engine boot is slow/fails. The opted-in hint is
  written on every successful sign-in + re-stamped on each silent re-acquire (rolling the 180-day
  `SameSite=Lax`/`Secure` cookie, mirrored to `localStorage` for private mode); the 401 refresh is
  silent too. Reused the existing `cloud.*` toasts (no new strings). New `test/drivesignin.test.js`
  (7 cases, production client vs an injected GIS stub) + Task 23 blocks in `cloudsave.test.js` (+6) and
  `session.test.js` (+4) + a Playwright `cloudsignin` suite (3 cases, injected GIS, asserts no visible
  dialog). Vitest 313 → 335. **No `SAVE_VERSION` change** (auth hints persist via cookie/localStorage,
  not the save).
- **Depends on:** Task 15 (Google Drive cloud saves — `CloudSave`/`CloudUI`/
  `makeGoogleDriveClient`) and Task 17 (durable session — the `Session` cookie/hint
  store, `silentAuthDecision`, `signInSilent`). None else.
- **Note on Golden Rules:** unchanged — Drive stays **opt-in** and **degrades
  gracefully** (signed-out / offline / unconfigured / headless never throws or
  blocks). This task only makes the *existing* opt-in flow persist correctly; it
  adds no new external dependency.
- **Goal.** Two sign-in defects break the cloud-save UX. **(a) The player must sign
  in again every time they open the page** — the Google session doesn't survive a
  reload, so a returning player is effectively signed out. **(b) A Google sign-in
  popup/redirect appears on page load even when the player never pressed "Sign in
  with Google"** — the boot-time silent-auth attempt surfaces a *visible*
  account/consent dialog instead of staying silent. Fix both so that, once a player
  has opted into Drive, they **stay signed in across reloads** (re-acquired
  silently, no dialog), and the sign-in UI **only ever appears when they explicitly
  click it** — the way shipped web games keep you logged in without nagging.
- **Scope (build this):**
  - **Make boot-time re-auth truly silent (never show UI unprompted).** Today
    `CloudUI.init()` unconditionally calls `CloudSave.trySilentSignIn()` on boot
    (`src/game.js` ~9628), which runs GIS `requestAccessToken({ prompt: "" })`
    (`signInSilent` → `requestToken("", loginHint)`, ~9346). With `prompt: ""` GIS
    can still raise a **visible** popup/redirect (stale session, revoked scope,
    account chooser). Guarantee the boot path **never opens any visible UI**: only
    attempt re-auth when `silentAuthDecision(hint)` says the player previously opted
    in, run it through GIS's non-interactive token path with an `error_callback` /
    timeout that **swallows every non-silent outcome**, and on any result that
    *would* require UI, abort quietly and leave the explicit "Sign in with Google"
    button as the only path to interactive consent. No dialog may appear without a
    user click.
  - **Persist the signed-in state robustly.** GIS access tokens are short-lived
    (~1 h) and intentionally not persisted, so "stay signed in" means **reliably
    re-acquiring a token silently** from the player's existing Google session on
    each load. Audit the hint pipeline end-to-end: `Session.rememberAuth()` /
    `forgetAuth()` / `authHint()` (~9168), the `gg3d_sess` first-party cookie +
    `ck_gg3d_sess` localStorage fallback (`buildCookieString` / `cookieSet` /
    `cookieGet`, ~8985-9055), and `silentAuthDecision` (~9093). Ensure the
    **`optedIn` flag + the account `login_hint` are written on every successful
    sign-in** and read back on boot; verify the cookie attributes
    (`SameSite=Lax`, `Secure`, 180-day `Max-Age`) actually let it survive a reload,
    and that the localStorage mirror covers cookie-blocked / private-mode cases.
    Once a token is re-acquired silently, the cloud UI must show **"Signed in to
    Drive"** immediately — no button press.
  - **Honour sign-out + first-run.** A signed-out player (or one who never opted in)
    must get **no** silent attempt and **no** dialog on load — exactly today's
    first-run experience. `forgetAuth()` must clear the hint so no silent re-auth
    fires afterward.
  - **Resilience.** Expired / consent-again / offline must fall back to the explicit
    button with clear messaging (reuse the `cloud.*` toasts), never a surprise popup
    and never a thrown error.
- **Acceptance criteria:**
  - After opting in once, **reloading keeps the player signed in** — the cloud panel
    shows the signed-in state and Drive saves work **without any click or dialog**,
    as long as the browser still holds the Google session.
  - **No Google UI ever appears on page load** unless the player clicks "Sign in
    with Google". Signed-out and first-run loads are dialog-free.
  - Sign-out clears the remembered hint; subsequent loads do **not** silently
    re-auth.
  - Offline / expired / revoked-scope degrade to the explicit button with messaging;
    nothing throws; the local save is unaffected. Headless-safe (no GIS / no cookies
    ⇒ cleanly disabled).
- **Tests to add:** extend `test/session.test.js` / `test/cloudsave.test.js` against
  the **injected GIS stub**: `silentAuthDecision` returns *attempt* only when
  opted-in + hint present and *never* when signed-out; the boot silent path **never
  invokes the interactive prompt** (assert the stub's interactive callback isn't
  called on load); a sign-in → reload → still-signed-in round-trip through the
  cookie/hint store; sign-out clears the hint and blocks re-auth; the cookie helper
  sets `SameSite=Lax` / `Secure` / `Max-Age` and round-trips via the localStorage
  fallback. An E2E (injected client) that loads the built site with a stored hint
  and asserts the signed-in state restores with **no visible auth dialog**.
- **Files:** `src/game.js` (`CloudSave.trySilentSignIn` / `signInSilent` /
  `requestToken`, `makeGoogleDriveClient`, `CloudUI.init` boot wiring, the `Session`
  hint/cookie store, `silentAuthDecision`), `src/core/i18n.js` (any new messaging,
  EN+RU), `test/*`, `README.md` (cloud-saves persistence + privacy note). No
  `SAVE_VERSION` change (auth hints persist via cookie/localStorage, not the save).
- **Out of scope:** a server-side OAuth/token backend or refresh-token storage (the
  GIS web flow issues none — note as a follow-up); switching auth providers;
  persisting the access token itself (insecure — re-acquire silently instead).
- **Hints:** the cure for the unprompted popup is to make the boot attempt
  **non-interactive-only** and abort on anything that needs UI; the cure for "signed
  out every load" is reliably re-running that silent acquisition from the browser's
  existing Google session — both hang off the already-stored opted-in hint, so wire
  and test that hint carefully.

