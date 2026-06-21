# CLAUDE.md — repo-wide guidance for AI agent runs

This file is auto-loaded by Claude Code on every run. It holds the **repo-wide
Golden Rules** and conventions that apply to **all** work in this repository.

- **Task backlog + per-task acceptance criteria + the run prompt:** see
  [`TODO.md`](./TODO.md). One agentic run completes **exactly one** task there.
- **Definition of Done** (the shared per-task gate): see `TODO.md` § 2.

## What this project is

*Good Game 3D* — a third-person browser **action-RPG** built on **Babylon.js**,
shipped as **static files** (no build step) and deployed to **GitHub Pages** from
`master`. It is one IIFE in `js/game.js` (~6k lines) plus `index.html`,
`css/style.css`, and a **headless Node test harness** `test/harness.js` that
stubs Babylon + the DOM so the real gameplay code runs in CI without a browser.

Architecture quick-map (grep in `js/game.js`): `CONFIG`, `rng`/`setSeed`,
`ZONES`/`ZONE_BY_ID`/`HUB_ZONE`, `LOCATIONS`/`NPC_DATA`/`QUEST_BY_ID`,
`Player`, `Monster`, `Boss`, `Dragon`, `buildWorld`, `setupZoneContent`,
`SpawnDirector`, `ZoneManager`, `teardownZone`, `DayNight`, `Weather`, `Sfx`,
`Music`, the `dom` map, `serializeGame`/`applySave`, and the test seam
`window.__GG_TEST__`.

## Golden rules (apply to EVERY change)

1. **Engine stays Babylon.js.** No framework rewrite (researched + decided). Load
   Babylon from the CDN `<script>` tags. **No build step / bundler / npm runtime
   deps** — the site must deploy to GitHub Pages as-is.
2. **Runs everywhere.** Must work on **desktop and mobile browsers**. Prefer
   **WebGL** with graceful fallbacks (if you use WebGPU, keep an automatic WebGL
   fallback). Never **freeze** the main thread — chunk heavy work and hide
   unavoidable hitches behind the existing zone-transition fade veil.
3. **Headless tests must stay green.** `node -c js/game.js` and
   `node test/harness.js` must pass (CI enforces this). The harness stubs
   Babylon + DOM + Web Audio, so **feature-detect** everything browser-only
   (`BABYLON.X && …`, `try/catch`, `typeof window`, optional chaining). **Add new
   tests** for what you build.
4. **Additive, single-file style.** Keep the one IIFE in `js/game.js`. Add small,
   self-contained systems; don't rewrite working ones. Match the surrounding
   code's naming, comment density, and idioms.
5. **Determinism + persistence.** All randomness goes through the seeded `rng()`.
   Any **new persistent state must be added to `serializeGame`/`applySave`** and
   covered by the save/load test. Bump `SAVE_VERSION` only when the schema
   changes, and keep older saves loading (default gracefully).
6. **Performance & asset budget.** Prefer **procedural** content (meshes, audio).
   If you must add asset files, keep them **small**, **lazy-loaded**, with a
   fallback, committed to the repo. Cap mesh / particle / light counts; **dispose
   everything on zone teardown** (extend `buildWorld`'s `dispose()` /
   `teardownZone`). Target ~60 fps on a mid-range phone; never regress zone-load
   smoothness.
7. **Cache-busting.** When you change `css/style.css` or `js/game.js`, bump the
   `?v=` query in `index.html` for that file.
8. **One task per run.** Don't scope-creep into another `TODO.md` task. If you
   hit a blocking dependency, note it in `TODO.md` and stop.
9. **Internationalization aware.** Once Task 7 (i18n) lands, **every new
   user-facing string must be added to all locales** via the i18n layer. Until
   then, keep new user-facing strings centralized and easy to extract.
10. **Ask before large/irreversible ambiguity.** If a decision is genuinely the
    user's and cheap to confirm, pick the sensible default and note it; if it's
    expensive or irreversible, ask first.

## Verify (run locally and in CI)

```bash
node -c js/game.js        # syntax
node test/harness.js      # headless gameplay tests (exit 0 = all green)
```

`.github/workflows/ci.yml` runs both on every push + PR — **do not merge red**.
A feature-specific headless smoke check (a tiny throwaway Node script that boots
the game with the harness stubs and exercises the new path) is encouraged.

## Git / branch / deploy conventions

- Develop on the branch named in the run instructions (currently
  `claude/lucid-mayer-wtmqgq`); create it if missing. Commit in logical chunks.
- End commit messages with the trailers used in this repo's history
  (`Co-Authored-By: …` and `Claude-Session: …`).
- When a task is complete and the harness is green, fast-forward `master` and
  push; `.github/workflows/deploy-pages.yml` publishes to GitHub Pages.
- **Confirm the Pages deploy run for your commit finished `conclusion: success`**
  (and the CI `Tests` run is green); fix any failures.
- Do **not** open a pull request unless explicitly asked.

> Release-ready means a player can load the Pages URL on desktop **and** mobile
> and use the feature with no errors, no console exceptions, no freezes, and
> saved progress survives reload. "Works only headless" is **not** done.
