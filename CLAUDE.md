# CLAUDE.md — repo-wide guidance for AI agent runs

This file is auto-loaded by Claude Code on every run. It holds the **repo-wide
Golden Rules** and conventions that apply to **all** work in this repository.

- **Task backlog + per-task acceptance criteria + the run prompt:** see
  [`TODO.md`](./TODO.md). One agentic run completes **exactly one** task there.
- **Definition of Done** (the shared per-task gate): see `TODO.md` § 2.
- **Release history:** see [`CHANGELOG.md`](./CHANGELOG.md) (Keep a Changelog
  format). When a task ships, append its entry **there**, not to `TODO.md`.

## What this project is

*Good Game 3D* — a third-person browser **action-RPG** built on **Babylon.js**,
built from an **ES-module source tree** under `src/` by **Vite** into a hashed
**static bundle** in `dist/` that is deployed to **GitHub Pages** from `master`.
(Babylon stays on its CDN as a global, so it is not bundled — the published site
stays 100% static files.) The source is `src/main.js` (composition root) →
`src/core/` (`config`, `i18n`), `src/data/` (`items`, `skills`, `content`,
`story`, `zones`) and the runtime monolith `src/game.js`, plus `index.html`,
`css/style.css`, and a layered **test suite** under `test/` (Vitest unit/logic +
functional flows that stub Babylon + the DOM, and a Playwright real-browser
smoke). See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full map.

Architecture quick-map (which module to grep): `CONFIG`/`rng`/`setSeed`
(`src/core/config.js`); i18n `t()` + resolvers (`src/core/i18n.js`); `ITEM_DB`
(`src/data/items.js`); `SKILL_DB`/`fuseSkills`/`xpToNext` (`src/data/skills.js`);
`ZONES`/`HUB_ZONE` (`src/data/zones.js`); the map graph + route-finding
`findRoute`/`nextZoneStep`/`MAP_TARGETS` (`src/data/worldmap.js`);
`STORY`/`MISSIONS` (`src/data/story.js`);
`LOCATIONS`/`NPC_DATA`/`MONSTER_ABILITIES` (`src/data/content.js`); and the
runtime — `Player`, `Monster`, `Boss`, `Dragon`, `buildWorld`, `SpawnDirector`,
`ZoneManager`, `teardownZone`, `DayNight`, `Weather`, `Skills`/`SkillsUI`,
`WorldMap`/`WorldMapUI` (minimap, world map + guided waypoint),
`Sfx`/`Music`, `QUEST_BY_ID`, the `dom` map, `serializeGame`/`applySave`, the
opt-in Google Drive cloud saves `CloudSave`/`CloudUI` (`makeGoogleDriveClient` +
the pure `cloudAutosaveDue`/`cloudPrune`/`cloudNewer` policy), and the test seam
`window.__GG_TEST__` — in `src/game.js`.

## Golden rules (apply to EVERY change)

1. **Engine stays Babylon.js.** No framework rewrite (researched + decided). Load
   Babylon from the CDN `<script>` tags (it is externalized, not bundled). A
   **build step is in place** (Vite, added in Task 9): develop in `src/**`, and
   the **published** site is the built, content-hashed **static** bundle in
   `dist/` — GitHub Pages still serves only static files. `npm` deps are
   **dev-only** (build/test/lint); nothing is shipped to the player but the
   bundle + the CDN Babylon. **Opt-in external services are allowed** when they
   stay opt-in, **degrade gracefully** (offline / signed-out / headless never
   throws or blocks), load any client SDK from the provider's CDN (so the site
   stays static), and read credentials from config (never commit secrets). Task
   15 added exactly one: **Google Drive cloud saves** (the GIS script loads on
   demand only after the player opts in; with no OAuth client id configured the
   feature is cleanly disabled and the local file save still works).
2. **Runs everywhere.** Must work on **desktop and mobile browsers**. Prefer
   **WebGL** with graceful fallbacks (if you use WebGPU, keep an automatic WebGL
   fallback). Never **freeze** the main thread — chunk heavy work and hide
   unavoidable hitches behind the existing zone-transition fade veil.
3. **The whole pipeline must stay green.** `npm run lint && npm run typecheck &&
   npm test && npm run build && npm run test:e2e` must pass (CI enforces every
   stage). The Vitest suites stub Babylon + DOM + Web Audio, so **feature-detect**
   everything browser-only (`BABYLON.X && …`, `try/catch`, `typeof window`,
   optional chaining). **Add new tests** for what you build (Vitest logic +
   functional, and a Playwright assertion if it touches DOM/UI wiring).
4. **Additive, modular style.** Develop in the `src/**` module tree (see
   `ARCHITECTURE.md`): put pure content in `src/data/`, foundations in
   `src/core/`, gameplay in `src/game.js`. Use explicit `import`/`export` (no
   hidden globals); keep modules single-responsibility where practical. Add
   small, self-contained systems; don't rewrite working ones. Match the
   surrounding code's naming, comment density, and idioms.
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
7. **Cache-busting is automatic.** The Vite build content-hashes every asset, so
   there is no `?v=` to bump (the old cache-buster was removed in Task 9). Just
   rebuild.
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
npm ci                 # once, from a clean checkout
npm run lint           # ESLint (no-undef guards the module boundaries)
npm run typecheck      # tsc --checkJs over src/
npm test               # Vitest: ported harness + functional + smoke
npm run build          # Vite → hashed static bundle in dist/
npm run test:e2e       # Playwright: real Chromium boots the built site

npm run verify         # = lint + typecheck + test + build (the fast CI path)
```

`.github/workflows/ci.yml` runs lint → typecheck → test → build → Playwright E2E
on every push + PR — **do not merge red**. A feature-specific smoke check (an
extra Vitest case that boots the game via the stubs and exercises the new path)
is encouraged.

## Git / branch / deploy conventions

- Develop on the branch named in the run instructions; create it if missing.
  Commit in logical chunks.
- End commit messages with the trailers used in this repo's history
  (`Co-Authored-By: …` and `Claude-Session: …`).
- When a task is complete and the whole pipeline is green, fast-forward `master`
  and push; `.github/workflows/deploy-pages.yml` re-runs the verify pipeline,
  **builds `dist/`**, and publishes that built bundle to GitHub Pages.
- **Confirm the Pages deploy run for your commit finished `conclusion: success`**
  (and the CI `Tests` run is green); fix any failures.
- Record the shipped release as a new entry in [`CHANGELOG.md`](./CHANGELOG.md)
  (not `TODO.md`); commit + push it with the rest.
- Do **not** open a pull request unless explicitly asked.

> Release-ready means a player can load the Pages URL on desktop **and** mobile
> and use the feature with no errors, no console exceptions, no freezes, and
> saved progress survives reload. "Works only headless" is **not** done.

## Multi-agent orchestration (running several backlog tasks)

This repo's backlog is built for **one task per agent run**. To run **several**
tasks well, use the **orchestrator pattern** — it keeps each task's work in its
**own isolated context window** (no cross-talk, no context bloat) and lands each
one on `master` before the next begins.

**When I say "make N next tasks", "make tasks A, B and C", or "next", act as the
ORCHESTRATOR** (do not write game code yourself):

1. **Resolve** the concrete, ordered task list from my shorthand using
   `TODO.md` § 5 *Recommended order* and each task's *Depends on*
   (`"make 3 next tasks"` = the next three `[ ]` tasks; `"make tasks 16, 18 and
   20"` = exactly those, dependency-ordered, skipping any `[x]` done). Print the
   resolved list and flag unmet dependencies before starting.
2. For each task, **in order, one at a time**, spawn **one** subagent — the
   **`task-runner`** agent (`.claude/agents/task-runner.md`) — via the Agent tool,
   telling it to read `CLAUDE.md` + `TODO.md` and do **exactly that task** to the
   § 2 Definition of Done on its own branch `claude/task-<N>-<slug>` cut from the
   latest `master`. Each subagent has a **fresh, isolated context** and cannot see
   the orchestrator chat, so put everything it needs in the prompt.
3. **Wait** for that subagent to fully finish — pipeline green, tests added,
   checkbox ticked, `CHANGELOG.md` updated, **branch merged to `master` and
   pushed**, CI + Pages deploy green. **Merging to `master` after every task is
   mandatory.** Only then sync to the merged `master` and start the next task.
4. **Stop on failure**: if any task can't be completed/verified or hits a blocking
   dependency, halt the batch, report which task and why, and don't start later
   tasks (they may depend on it). Never merge a red pipeline.

Run subagents **strictly sequentially** (never two at once) so dependent tasks
build on each other's merged work. The full pasteable prompts live in `TODO.md`
§ 6 (§ 6.1 orchestrator, § 6.2 single task); the `/make-tasks` command wraps § 6.1.
For a **deterministic** batch (the loop lives in code, not model judgement), a
Workflow script that `await`s one `task-runner` agent per task is also acceptable.
