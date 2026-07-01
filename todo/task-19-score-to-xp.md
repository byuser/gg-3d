# Task 19 — Replace the score system with the experience (XP) system

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-25 · Retired the legacy arcade **score** entirely (the ⭐ HUD chip +
  `#score`/`addScore`, the run-state + save field, the `score*` config knobs, and every score mention
  in the pause/game-over/victory summaries + their EN/RU strings) and routed every former score moment
  into **XP** via `Skills.gainXp`: kills already paid `Skills.xpFor`; **artifact** pickups now grant a
  retuned **`XP_PER_ARTIFACT = 40`** (~4 sweet kills, between a sweet and a boss) on top of their heal +
  coins, so there's **one** progression currency. The end/pause screens now show a **run recap** (level
  reached, total XP, monsters felled + relics collected) via a new pure `runRecap`; a v11 `relicsFound`
  lifetime tally feeds it. `SAVE_VERSION` **10 → 11** (drops `score`, adds `relicsFound`; pre-v11 saves
  load with score ignored + sane defaults). New `test/score-to-xp.test.js` (19 cases; Vitest 189 → 208):
  each former score event grants XP, pacing stays sane under the new sources (pure sim), v10→v11
  migration + v11 round-trip, the recap renders level/XP/tallies (no "score"), and a **grep guard** that
  fails on any lingering `score` identifier in the player-facing source. Before→after award docs in the
  CHANGELOG + README. Full pipeline green; E2E confirmed `#score` removed (CI runs the browser suite).
- **Depends on:** the **XP/leveling** layer (Task 14, `src/data/skills.js`:
  `xpToNext`/`gainXp`/`player.progress`). None else.
- **Goal.** The game still carries a **legacy arcade "score"** (the on‑screen
  **stars/score widget**, `+score` on kills/artifacts/bosses) **in parallel** with
  the real **RPG progression (XP/levels)** from Task 14. Modern RPGs reward action
  with **experience**, not an arcade score. **Remove the score system entirely**
  and route those reward moments into **XP** instead, so there is **one** coherent
  progression currency.
- **Scope (build this):**
  - **Remove the score HUD + state.** Delete the on‑screen **score/stars widget**
    (`#score` chip / `addScore`) and the score field from run state and
    `serializeGame`/`applySave`; remove score from the **pause stats**, **game‑over**
    and **victory** summaries and the `pause.stats`/`over.tagline`/`win.*` i18n
    strings (replace with level/XP‑based phrasing). No dead `score` references left.
  - **Convert score events to XP.** Every place that awarded score — monster kills
    (`CONFIG.scorePerMonster`), artifact pickups (`CONFIG.scorePerArtifact`,
    `toast.artifact`), boss (`CONFIG.bossScore`) and dragon (`CONFIG.dragonScore`)
    — now awards **XP** via `Skills.gainXp()` (kills already grant `Skills.xpFor`;
    fold the **artifact/relic** rewards into XP too). **Rebalance** the XP curve /
    award amounts so progression stays well‑paced once these sources feed it (don't
    just double‑count — retune `XP_PER_*` / `xpFor` and the artifact award so level
    pacing feels right). Remove the now‑unused `score*` config knobs.
  - **End‑screen + tracker glow‑up.** The game‑over / victory / pause summaries
    show **level reached, total XP and key tallies** (monsters felled, relics) —
    the satisfying run‑recap shipped RPGs show — instead of a score number. The HUD
    keeps the **level badge + XP bar** (already present) as the single progression
    readout.
  - **Migration.** Older saves carrying a `score` field must still load (ignore/drop
    it gracefully); **bump `SAVE_VERSION`** for the schema change and default
    missing XP/level sanely.
  - **i18n.** Update all affected strings in **EN + RU**.
- **Acceptance criteria:**
  - There is **no score anywhere** — no HUD widget, no run‑state field, no
    save field, no end‑screen number, no `score*` config — and nothing references
    it (grep‑clean).
  - The reward moments that gave score now give **XP**; level pacing is retuned and
    documented (before/after award values); a player progresses purely through XP.
  - End/pause/victory screens recap **level + XP + tallies**; the HUD's level/XP
    bar is the single progression readout.
  - Old saves (with `score`) still load; the new schema round‑trips; full pipeline
    green; headless‑safe.
- **Tests to add:** assert each former score event now calls `gainXp` with the
  retuned amount; the level curve still produces sane pacing under the new sources
  (a pure test over a simulated run); **save/load migration** from a `score`‑bearing
  save; a UI smoke that the end/pause screens render XP/level (no score); a grep‑
  style test that fails on any lingering `score` identifier in the user‑facing path.
- **Files:** `src/game.js` (`addScore` removal, kill/artifact/boss/dragon reward
  paths → `gainXp`, pause/over/win summaries, `serializeGame`/`applySave`,
  `SAVE_VERSION`), `src/core/config.js` (remove `score*` knobs; retune XP if knobs
  move here), `src/data/skills.js` (curve/award retune), `index.html`/`css` (drop
  `#score`), `src/core/i18n.js` (EN+RU), `test/*`, `README.md` (roadmap line
  "Collect artifacts for score" → XP).
- **Out of scope:** redesigning the leveling curve wholesale (retune, don't
  rebuild); adding a separate high‑score/leaderboard (explicitly being removed).
- **Hints:** XP already flows through one function (`Skills.gainXp`) — funnel the
  former score events there and delete the parallel path; keep the artifact reward
  feeling meaningful by granting a chunk of XP.

