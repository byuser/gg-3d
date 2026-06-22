# `src/core/` — engine-agnostic foundations

Small, dependency-light modules the rest of the game builds on. These are
type-checked by `tsc --checkJs`.

- **`config.js`** — the deterministic seeded RNG (`rng`, `setSeed`, `getSeed` —
  mulberry32; **all** randomness must flow through it), the tunable `CONFIG`
  table, and the shared `PALETTE`. No imports.
- **`i18n.js`** — internationalization. The `LOCALES` (English source) + `RU`
  dictionaries, `t(key, params)` with interpolation + pluralization, the
  `localStorage` locale helpers, and the pure data-table display-name resolvers
  (`tItemName`, `tZoneName`, `tQuestTitle`, …). Imports the `data/` tables it
  translates; imports nothing from the runtime, so the dependency graph stays
  acyclic. **Every new user-facing string must be added to both `en` and `ru`.**

The two resolvers that must read runtime systems (`tWeatherLabel`,
`bossDisplayName`) live in `src/game.js`, not here, to preserve that one-way
dependency direction.
