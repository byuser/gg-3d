# Task 2 — Main story line with missions + side quests

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-21 · Shipped a declarative `STORY`/`MISSIONS`/`SIDE_QUESTS`
  campaign (5 chapters, 16 ordered main missions + 6 side quests) over the existing `Quests`
  engine, with new `defeat_boss`/`build`/`defeat_dragon` objective types, a `Story` controller
  for ordered unlocks + a guided HUD tracker (no guesswork), a chaptered quest log (main vs
  side), intro/chapter/ending beats, v6 save/load of story state, and a new harness suite [27].
- **Depends on:** none (builds on the existing `Quests` system).
- **Goal.** Turn the loose quest chains into a **structured main story** with
  ordered **chapters/missions** that guide the player across the zones to the
  castle→dragon finale, plus optional **side quests** for extra rewards.
- **Scope (build this):**
  - A `STORY`/`CAMPAIGN` data structure: ordered **chapters**, each with one or
    more **missions** (objective + giver + reward + the next step it unlocks).
    Reuse the existing objective types (`hunt`/`gather`/`reach`/`talk`) and add
    any new ones you need (e.g. `defeat_boss <zone>`, `build <castle part>`,
    `escort`/`deliver`) — each must be testable headlessly.
  - **Gating/unlocks:** missions unlock in order; later zones/lair bosses tie
    into the main line (e.g. "clear the Crystal Caverns" as a story beat).
  - **Side quests:** a pool of optional, repeatable‑or‑one‑shot quests
    (bounties/gathering/escort) available from NPCs, clearly separated from the
    main line in the quest log.
  - **Presentation:** a chaptered **quest log** (group main vs side, show
    current chapter + progress), an on‑screen **objective tracker** for the
    active main mission, short **dialogue beats** at key moments (reuse the
    `Dialogue` overlay), and a meaningful **intro + ending** framing.
  - Rewards wired through the existing economy (coins/gear/relics/materials).
- **Acceptance criteria:**
  - A new player can follow the main line from start to the dragon **purely by
    following objectives** (no guesswork); each step unlocks the next.
  - Side quests are accept/track/turn‑in independently and don't block the main
    line; the quest log clearly separates them.
  - Story progress (current chapter, completed missions, side‑quest state)
    **serializes and round‑trips** through save/load.
  - All objective types resolve correctly and pay rewards once.
- **Tests to add:** mission ordering/unlock flow; each objective type
  accept→progress→turn‑in→reward; main‑vs‑side separation; story‑state save/load
  round‑trip; "finishing the last main mission enables the finale".
- **Files:** `js/game.js` (`Quests`, `NPC_DATA`, new `STORY` table, quest‑log UI
  helpers), `index.html`/`css` (quest‑log chapters, tracker), `test/harness.js`,
  `README.md`.
- **Out of scope:** voice‑over, branching multi‑ending trees (keep one coherent
  main line; small optional branches are fine if fully tested).
- **Hints:** keep the data **declarative** so the agent and tests can reason
  about it; drive UI from the data, not hard‑coded strings.

