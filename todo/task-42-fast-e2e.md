# Task 42 — Make the Playwright E2E suite fast & robust (de‑flake slow specs, deterministic waits, reuse the build, rebalance sharding)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[ ]`
- **Depends on:** Task 9 (the Vite build + the Vitest/Playwright pipeline + the staged
  `.github/workflows/ci.yml`) and Task 16 (the **Galaxy S24 Ultra** device profiles the
  specs run under). Independent of the worn‑gear/animation family (Tasks 25–35) and of
  Tasks 40/41. **Best done early** — it shortens every later run's verify/CI loop.
- **Note on Golden Rules:** unchanged for players — **Babylon still loads from its CDN in
  the shipped game**; any "local engine" path added here is **test/CI‑only** and must
  never change what the deployed static bundle serves. The full five‑stage pipeline
  (`lint → typecheck → test → build → test:e2e`) and "never merge red" still hold; this
  task makes that pipeline *faster and less flaky*, **not weaker** — no behavioural
  coverage may be dropped silently.
- **Goal.** The real‑browser **E2E job has become the slowest, flakiest stage** of the
  pipeline: a single Playwright shard now runs **~16–20 minutes** (one straggler gates
  the whole CI run), driven by — (1) every CI shard **rebuilding the site from scratch**
  (`webServer` runs `npm run build && npm run preview` per shard, even though the
  `verify` job already builds and uploads `dist/`); (2) **64 tests across up to 3 device
  profiles** each doing one or more full **Babylon‑over‑CDN** boots; (3) **arbitrary
  `waitForTimeout` sleeps** (2500/1500/1000 ms) and per‑widget `boundingBox()` auto‑waits
  that assume timing and trigger **Playwright retries** (which *triple* a spec's cost);
  and (4) **`page.reload()`‑heavy** multi‑boot flows (`saves`, `session`, `controllayout`).
  Make the suite **deterministic and substantially faster** while keeping the same
  behavioural coverage and the same device‑profile matrix where it matters.
- **Scope (build this):**
  - **Reuse the built artifact instead of rebuilding per shard.** The 4 CI E2E shards
    each rebuild the bundle (`playwright.config.js` `webServer`), wasting ~4× the build
    cost. Have the E2E shards **consume the `dist/` artifact** the `verify` job already
    uploads (download it, then serve with `vite preview`) — no per‑shard rebuild. Keep
    `webServer.reuseExistingServer` for local runs.
  - **Kill arbitrary waits — make every wait deterministic.** Replace the fixed
    `waitForTimeout(2500/1500/1000)` calls (in `boot.spec.js`, `session.spec.js`,
    `cloudsignin.spec.js`, …) and the per‑widget `locator.boundingBox()` auto‑wait loops
    (`responsive.spec.js`) with **explicit readiness signals**: a single **batched**
    `page.evaluate(() => …getBoundingClientRect())` (the pattern `hud-regions.spec.js` /
    `map.spec.js` already use) and an app‑exposed **boot "ready" signal** (e.g. a
    `window.__GG_TEST__.ready` promise/flag or a `data-ready` attribute set when boot +
    first frame complete) that specs `waitForFunction` on. **No spec may rely on a
    hard‑coded sleep for correctness.**
  - **Cut the per‑boot CDN dependency in CI (de‑flake *and* speed).** Each engine boot
    fetches Babylon from `cdn.babylonjs.com` at runtime — a network round‑trip per boot
    and a flake source. Generalise the existing **`GG_LOCAL_BABYLON`** route hook (already
    used by `controllayout`/`fullscreen` specs locally, inert on CI) into a
    **CI‑enabled local‑engine path** that serves a committed/cached Babylon bundle to the
    browser during E2E so boots are fast and network‑independent. **Test‑only** — it must
    not change the shipped site (players still get the CDN); keep a guard that the built
    bundle still externalises Babylon.
  - **Rebalance the load.** With deterministic, network‑free boots, **re‑measure and lift
    per‑shard parallelism carefully** — the `workers: 1` rule exists because software‑WebGL
    boots starve the CPU and flake the boot‑readiness waits, so raise it only to the
    proven‑safe max, **or** split the pure‑CSS specs (`map`, `hud-regions`) from the
    engine‑boot specs so the former run many‑parallel. And/or **rebalance sharding by
    duration** (Playwright shards by *count*, so one shard can inherit all the heavy
    multi‑boot specs). Trim **redundant device‑profile runs** on the expensive multi‑boot
    specs (e.g. `session`/`saves`/`controllayout` need desktop + one mobile orientation,
    not both, where landscape exercises the same code path) — **without** losing the
    portrait+landscape coverage Task 16 requires for the *responsive/layout* specs.
  - **De‑flake the `page.reload()` multi‑boot flows** (`session`, `saves`,
    `controllayout`): await the ready signal after reload and drop the post‑reload sleeps
    so they pass on the **first** attempt and stop consuming the CI retry.
  - **Add a regression guard** — a tiny Vitest/Node lint over `test/e2e/**` that **fails
    if a banned pattern reappears** (`waitForTimeout(` above a small threshold; a raw
    `cdn.babylonjs.com` boot dependency without the local‑engine hook) so the suite can't
    silently re‑flake (mirrors the grep‑guard pattern Tasks 19/41 use).
- **Acceptance criteria:**
  - The **slowest CI E2E shard drops well under ~8 minutes** (from ~16–20) and the whole
    `test:e2e` job finishes materially faster; **document the before/after** shard times in
    the commit + the README "Tests" blurb.
  - **No spec depends on a hard‑coded `waitForTimeout` for correctness**, and **no engine
    boot depends on a live external CDN in CI** — both enforced by the new guard.
  - **Retries effectively stop firing** in a healthy run (the suite is green on the
    **first** attempt); flake‑driven 3× runtimes are gone.
  - **Behavioural coverage is unchanged**: every flow still asserted, the **Galaxy S24
    Ultra portrait + landscape** coverage Task 16 mandates is preserved for the
    layout/responsive specs, and the full pipeline stays green. Document any profile trims
    and why they're safe — **no silent coverage drops**.
  - The **shipped static bundle is unchanged** for players (Babylon still
    CDN‑externalised); the local‑engine path is test/CI‑only.
- **Tests to add:** the **arbitrary‑wait / CDN‑reliance guard** above; updated specs proving
  the deterministic ready‑signal helper works headless/in‑CI; a check that the
  **artifact‑reuse** server config serves the prebuilt `dist/`; keep/extend **every**
  existing E2E assertion (no net loss of cases). Record the measured shard‑time delta.
- **Files:** `playwright.config.js` (workers/sharding/`webServer` artifact‑reuse, the
  ready‑signal `expect` timeouts), `.github/workflows/ci.yml` (download `dist/` into the
  E2E shards, shard count/matrix, the local‑engine env), `test/e2e/**` (swap fixed sleeps
  + bounding‑box loops for the batched `evaluate` + ready signal; de‑flake the reload
  flows; trim redundant profiles on multi‑boot specs), a small `test/e2e/` helper (the
  ready‑signal + local‑engine helpers), `src/game.js` (expose the `window.__GG_TEST__.ready`
  boot/first‑frame signal — feature‑detected, test‑seam only), `package.json` (any new
  script), a new guard test under `test/`, `README.md` (Tests blurb + before/after
  numbers). **No `SAVE_VERSION` change.**
- **Out of scope:** rewriting any **gameplay** logic; replacing Playwright/Vitest; a full
  headless **mock** of the Babylon engine (serving the real engine locally is enough — note
  a deeper engine stub as a follow‑up); reducing *what* the suite verifies (this is speed +
  determinism, **not** coverage cuts); changing the Vitest `singleThread` design unless
  measured to help.
- **Hints:** land it in safe, measurable order — **(1)** add the app **ready signal** + a
  tiny E2E helper and swap the arbitrary sleeps for it (biggest flake win), **(2)** reuse
  the built `dist/` in CI (biggest pure‑speed win, no test changes), **(3)** add the CI
  local‑engine path (removes the CDN flake + per‑boot latency), **(4)** only **then**
  re‑measure and lift workers / rebalance shards / trim profiles. Re‑measure shard times
  after each step so you can prove the win and back out anything that regresses. The
  pure‑CSS specs (`map`, `hud-regions`) are the model: no engine boot, one batched
  `evaluate`, deterministic.

---

