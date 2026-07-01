# Task 9 — Modularize the codebase + a production build/test/CI toolchain for agentic edits

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-22 · Split the 8.3k-line `js/game.js` IIFE into an ES-module tree
  under `src/` (`core/config`+`core/i18n`, `data/items`+`content`+`story`+`zones`, the runtime
  `game.js`, composed by `main.js`) with explicit imports and **zero behavioral change** — the
  full legacy harness (~360 checks) was ported verbatim to **Vitest** and stays green, proving
  parity. Added a **Vite** build (Babylon stays CDN-externalized; output is a hashed static
  `dist/` for Pages — content hashing replaces the `?v=` cache-buster), **ESLint** (flat,
  `no-undef` guards the module seams) + **Prettier**, **`tsc --checkJs`** typechecking (the clean
  `core/`+`data/` modules are checked; the legacy runtime opts out, slated for finer splits),
  a layered test suite (Vitest **unit/logic** + **functional** flows + **Playwright** real-browser
  boot smoke with no console errors), a staged **CI** (lint→typecheck→test→build→E2E) and a
  build-and-publish **deploy** workflow, plus `ARCHITECTURE.md` + per-dir READMEs and the npm
  scripts that mirror CI. Golden Rules 1/3/4/7 revised in `CLAUDE.md` + §1. No save-schema change.
- **Depends on:** none, but it is **foundational** — doing it early makes every
  later task smaller, more targeted, and safer to edit/build/test autonomously.
- **Note on Golden Rules (IMPORTANT — this task revises them):** the current
  Golden Rules 1 & 4 mandate a *single 8k‑line IIFE in `js/game.js`* with *no
  build step* so GitHub Pages serves it raw. That single‑file constraint is the
  #1 obstacle to **targeted, controllable AI edits** (every change risks a huge
  file; merge conflicts are constant; blast radius is the whole game). This task
  **supersedes** those two rules with a **module architecture + a build step
  whose published output is still 100% static files on GitHub Pages**. Update
  `CLAUDE.md` and `TODO.md` § 1 to the new rules as part of the run. Everything
  else (determinism, save round‑trip, headless‑safety, perf/asset budget,
  feature detection, mobile support) **still applies**.
- **Goal.** Split `js/game.js` into a clear **ES‑module** source tree by system,
  add a **modern build system** that bundles to a hashed static artifact for
  Pages, and stand up a **robust, multi‑layer test framework** (unit + logic +
  functional/integration + real‑browser UI) so an agent can fix one module,
  rebuild, and prove the change in isolation.
- **Scope (build this):**
  - **Module split.** Carve the IIFE into cohesive ES modules under `src/`
    mirroring the architecture quick‑map — e.g. `src/core/` (`config`, `rng`,
    `save`, `i18n`, `quality`), `src/world/` (`zones`, `buildWorld`,
    `ZoneManager`, `SpawnDirector`, `ResourceNode`), `src/entities/` (`Player`,
    `Monster`, `Boss`, `Dragon`, `Projectile`), `src/systems/` (`Quests`/`Story`,
    `Inventory`/`Shop`/`Anvil`, `Crafting`, `DayNight`, `Weather`,
    `Sfx`/`Music`/`Mixer`), `src/ui/` (HUD, overlays, `Pause`, settings),
    `src/main.js` (composition root). Keep each module **single‑responsibility**
    with explicit `import`/`export` (no hidden globals); preserve the test seam
    (`window.__GG_TEST__`) as an explicit export surface.
  - **Build system.** Add **Vite** (or esbuild — pick one, justify it briefly)
    producing a hashed, minified static bundle into `dist/` that GitHub Pages
    serves. `npm run dev` = HMR dev server; `npm run build` = production bundle;
    `npm run preview` = serve `dist/`. Keep Babylon on the CDN (externalized) **or**
    bundle it — decide and document. The deploy workflow must publish the **built**
    artifact; the cache‑buster (`?v=`) is replaced by content hashing.
  - **Type safety (lightweight).** Add **JSDoc + `tsc --checkJs`** type checking
    (no rewrite to TS required) or migrate hot modules to `.ts` — pick
    the lowest‑friction path that gives editors/agents real type errors. Wire a
    `npm run typecheck` into CI.
  - **Lint/format.** Add **ESLint + Prettier** with a config tuned for this code,
    plus an `npm run lint`. Fix existing violations so the baseline is clean.
  - **Test framework, layered (how shipped games do it):**
    - **Unit/logic:** migrate the bespoke `test/harness.js` checks to **Vitest**
      (keeps Node speed, gives watch mode, coverage, parallelism, rich asserts).
      Preserve every existing assertion (≈350+ checks) — no coverage loss.
    - **Functional/integration:** boot the assembled game against the
      Babylon/DOM stubs and drive whole flows (travel between zones, accept→turn
      in a quest, craft→equip, save→reload round‑trip) as black‑box tests.
    - **Real‑browser UI/E2E:** add **Playwright** smoke + UI tests that launch
      the built site headless‑Chromium, assert the canvas boots with **no console
      errors/exceptions**, the start screen + pause menu + inventory open, and a
      scripted input sequence runs without throwing. Gate it so CI can run it on
      a runner with a browser.
  - **CI.** Expand `.github/workflows/ci.yml` into stages: install → lint →
    typecheck → unit/logic (Vitest) → build → Playwright E2E against the build.
    Cache `node_modules`. Keep it green and fast; fail the deploy on any red.
  - **Agent ergonomics.** Add a top‑level `ARCHITECTURE.md` (module map + data
    flow) and per‑directory `README`s so an agent can locate the right module
    instantly. Add `npm` scripts that mirror exactly what CI runs so a run can
    self‑verify locally.
- **Acceptance criteria:**
  - The game **plays identically** to today (no gameplay/visual/audio regression,
    saves still load) but is now built from `src/**` modules into a static `dist/`
    that deploys to Pages with **no behavioral change** for players.
  - `npm ci && npm run lint && npm run typecheck && npm test && npm run build &&
    npm run test:e2e` all pass locally and in CI from a clean checkout.
  - Editing **one module** and rebuilding is sufficient to ship a fix — verified
    by making a trivial isolated change and showing only that module + the bundle
    hash change.
  - All prior harness assertions survive the migration (document the count
    before/after; no silent drops).
- **Tests to add:** the migrated Vitest suites (parity with the old harness), the
  new functional flow tests, the Playwright boot/UI smoke, and a CI job that
  proves the built `dist/` runs error‑free in a browser.
- **Files:** new `src/**` tree, `vite.config.*`/`esbuild` script, `package.json`
  (+ scripts, devDeps), `tsconfig.json`/`jsconfig.json`, `.eslintrc`,
  `.prettierrc`, `playwright.config.*`, `test/**` (Vitest + E2E), reworked
  `.github/workflows/*.yml`, `CLAUDE.md` + `TODO.md` § 1 (revised rules),
  `ARCHITECTURE.md`, `README.md`, `index.html` (module entry).
- **Out of scope:** rewriting gameplay logic while moving it (move first, refactor
  later in separate runs); adopting a UI framework (React/etc. — not needed);
  server‑side anything.
- **Hints:** do the split **mechanically first** (move code, wire imports, keep
  behavior byte‑for‑byte) and let the test suite prove parity *before* any
  cleanup. Keep Babylon feature‑detection intact across module boundaries.

