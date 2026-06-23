# Architecture — Good Game 3D

This document is the map an agent (or human) reads first: where each system
lives, how the pieces depend on one another, and how the project is built and
tested. It reflects the **Task 9** modularization, which split the former single
`js/game.js` IIFE into an ES-module tree under `src/` built by **Vite** into a
hashed static bundle for GitHub Pages.

## Module tree (`src/`)

```
src/
├── main.js            Composition root. Imports the game module (which self-boots
│                      against the DOM + the CDN BABYLON global) and, in tests,
│                      installs window.__GG_TEST__. Vite's entry is index.html →
│                      <script type="module" src="/src/main.js">.
│
├── core/
│   ├── config.js      Deterministic seeded RNG (mulberry32: rng/setSeed/getSeed),
│   │                  the tunable CONFIG table, and the shared PALETTE.
│   └── i18n.js        Internationalization: the LOCALES (EN) + RU dictionaries,
│                      t()/plural()/interp(), localStorage helpers, and the pure
│                      data-table display-name resolvers (tItemName, tZoneName, …).
│                      Imports the data tables it translates. Depends on nothing
│                      runtime, so the layer stays acyclic.
│
├── data/              Pure, self-contained data tables (no runtime/DOM refs):
│   ├── items.js       RARITY/ENHANCE, ITEM_DB, the 12 equip slots, AFFIXES + SETS,
│   │                  and pure stat helpers (effectiveStats, rollAffixes,
│   │                  setBonusStats, activeSets, enhance*) + derived shop/drop pools.
│   ├── content.js     Crafting materials, resource kinds, relics, castle parts,
│   │                  recipes, monster abilities, world locations + story NPCs.
│   ├── story.js       The declarative campaign: STORY chapters, ordered MISSIONS,
│   │                  optional SIDE_QUESTS, and the derived quest indices.
│   └── zones.js       The explorable ZONES (themed streamable worlds + portals).
│
├── game.js            The runtime monolith (≈6.8k lines moved verbatim from the
│                      old IIFE). Imports config/i18n/data and holds everything
│                      that shares live game state: the entities (Player, Monster,
│                      Boss, Dragon, Projectile), buildWorld/ZoneManager/
│                      SpawnDirector, the systems (Quests/Story, Inventory/Shop/
│                      Anvil, Crafting, DayNight, Weather, Quality/lighting,
│                      Sfx/Music/Mixer/Ambience), the HUD + overlays + Pause,
│                      createScene/boot, combat resolution, save/load, and the
│                      mesh/material builders. Self-boots on import and installs
│                      the test seam.
│
└── globals.d.ts       Ambient types for the CDN `BABYLON` global + window seam.
```

### Dependency direction (acyclic)

```
data/{items,content,story,zones}.js   (pure leaves, no imports between them)
              ▲                    ▲
              │                    │
        core/i18n.js          core/config.js
              ▲                    ▲
              └──────── game.js ───┘     (imports config + i18n + all data)
                           ▲
                        main.js          (imports game.js for side effects)
```

The `data/` and `core/` modules never import `game.js`, so there are no import
cycles. Two i18n resolvers that read runtime systems (`tWeatherLabel` → `Weather`,
`bossDisplayName` → boss archetypes) live in `game.js` rather than `core/i18n.js`
precisely to keep this direction one-way.

## Boot / data flow

1. `index.html` loads Babylon from its CDN as classic scripts (global `BABYLON`),
   then `src/main.js` as a deferred module.
2. `main.js` imports `game.js`. At import, `game.js` builds the `dom` map, disables
   the Start button, and calls `boot()`: applies the saved locale, wires the UI,
   creates the Babylon scene, and starts the render loop.
3. The player presses **Start** → `startGame()` builds the hub zone via
   `buildWorld`, spawns the player and the `SpawnDirector`, and the per-frame
   `scene.onBeforeRenderObservable` drives movement, AI, projectiles, day/night,
   weather and animation.
4. Travel runs through `ZoneManager` behind the fade veil; `serializeGame` /
   `applySave` capture and restore the run (the procedural world is rebuilt from
   its RNG seed, then live entities are laid back on top).

## Build & test toolchain

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR.                                           |
| `npm run build`     | Production build → hashed static bundle in `dist/` (served by Pages).|
| `npm run preview`   | Serve the built `dist/` locally (port 4173).                        |
| `npm run lint`      | ESLint (flat config). `no-undef` guards the module boundaries.      |
| `npm run typecheck` | `tsc --checkJs` over `src/` (the legacy `game.js` opts out).        |
| `npm test`          | Vitest: the ported headless harness + functional flows + smoke.     |
| `npm run test:e2e`  | Playwright: boots the built site in real Chromium, asserts no errors.|
| `npm run verify`    | lint + typecheck + test + build (mirrors the CI fast path).         |

**Babylon stays on the CDN** (externalized): the source references the global
`BABYLON`, so Vite never bundles the engine — the bundle is just the game code,
and the published site stays static. Content hashing replaces the old `?v=`
cache-buster.

### Tests are layered

- **Unit / logic + integration** — `test/harness.test.js` is the full legacy
  headless suite (≈360 checks) ported verbatim to Vitest, driving the real
  modules against the Babylon/DOM stubs in `test/setup/stubs.js`.
- **Functional** — `test/functional.test.js` boots the assembled game in
  isolation and drives whole flows (start, zone travel, save→reload round-trip).
- **Real-browser E2E** — `test/e2e/boot.spec.js` (Playwright) loads the built
  bundle in headless Chromium and asserts the canvas boots with no console
  errors and the core overlays open.

## Where to make a change

- **Balance / new items, recipes, relics** → `src/data/`.
- **New user-facing strings / translations** → `src/core/i18n.js` (add to both
  `en` and `ru`).
- **RNG / global tunables** → `src/core/config.js`.
- **Gameplay systems, entities, UI, world, save schema** → `src/game.js` (for
  now; finer single-responsibility splits of this module are the sanctioned
  follow-up — see TODO.md). After any change, run `npm run verify`.
