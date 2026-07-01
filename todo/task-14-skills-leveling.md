# Task 14 — Skill & leveling system (Skyrim‑grade) with 3‑skill fusion, a quick‑access bar & boss‑only skills

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-23 · Shipped an XP/leveling layer (XP from combat/quests/gathering, a
  super‑linear curve, +health/+focus per level, auto‑learned base skills) over a new pure
  `src/data/skills.js` (`SKILL_DB` 6 base + 4 boss‑only active skills, `ELEMENTS`/`EFFECTS`, level/focus
  math + the deterministic `fuseSkills`/`fusionCost`). Active skills (volley/nova/buff/heal, frost slow +
  shadow lifesteal) cast from a **3‑slot quick bar** (hotkeys 1/2/3; potions moved to 4/5/6) spending a
  regenerating **focus** resource + a cooldown. The marquee **3‑skill fusion** blends 2–3 owned skills into
  a brand‑new equippable/savable one for **coins + crystals** (pure + reproducible). **Boss‑only skills**
  drop solely from bosses (seeded, after the existing coin/gear draws). New ✨ Skills overlay (`K`), HUD
  level/XP + focus bars, EN/RU i18n. `SAVE_VERSION` → 8 (player `progress`; older saves default to level 1).
  New `test/skills.test.js` (27 cases; Vitest 53 → 80) + the E2E opens the overlay & casts a skill.
- **Depends on:** pairs with **Task 12** (shared stat pipeline); benefits from the
  Task 13 HUD for the toolbar. Keep save schema coordinated with Task 12.
- **Goal.** Research how large RPGs (Skyrim and peers) model **skills and
  character progression** and build a robust analog: a leveling system, an active
  **skill** roster, a **fusion** mechanic (combine up to 3 skills into one),
  a **quick‑access toolbar** by the shoot button, and **rare skills that drop only
  from boss loot**.
- **Scope (build this):**
  - **Research → design doc.** Document the target model (XP sources, level curve,
    perks/skill trees, active vs passive skills, cooldowns/costs) and map it onto
    the existing combat/stat pipeline (`Player`, `recomputeStats`, `Projectile`,
    the `Swing` actions). Keep it declarative and headless‑safe.
  - **Leveling.** Award **XP** for combat/quests/gathering; a tuned level curve
    grants points (stat/perk) on level‑up; show level + XP in the HUD with a
    level‑up beat. Persist level/XP.
  - **Skill roster.** A `SKILL_DB` of active skills (and passives), each with
    effect, cost (mana/cooldown/resource), and tags/attributes used by fusion.
    Wire skills into combat (the wand/shoot path + melee), respecting cooldowns.
  - **Skill fusion (the marquee feature).** Let the player **combine up to 3
    skills** into a **new fused skill** whose characteristics are a deterministic
    blend of the inputs' attributes (damage/element/AoE/cooldown/etc.). Fusion
    **consumes money / artifacts / resources** per a defined recipe; the result is
    a real, equippable, savable skill. Make the blend rules **pure and tested**.
  - **Quick‑access toolbar.** A bar of **up to 3 skill slots** next to the shoot
    button (mobile‑friendly tap targets + desktop hotkeys 1/2/3); assign/clear
    slots from the skill UI; show cooldowns. Activating uses the slotted skill.
  - **Boss‑loot skills.** A pool of powerful skills obtainable **only** from boss
    drops (deterministic via seeded `rng()`), surfaced as loot and added to the
    roster on pickup.
  - **Persistence.** Serialize level/XP, owned skills (incl. fused), slotted
    toolbar skills, and boss‑skill unlocks; bump `SAVE_VERSION`; migrate older
    saves gracefully.
- **Acceptance criteria:**
  - The player gains XP and levels up; can learn skills, **fuse up to 3** into a
    new one (consuming the right money/artifacts/resources), **slot up to 3** on
    the quick bar, and use them in combat with cooldowns.
  - Boss‑only skills drop solely from bosses (seeded, reproducible) and enter the
    roster.
  - All of it (level, XP, owned/fused/slotted skills, boss unlocks) **round‑trips
    through save/load**; old saves still load. Headless‑safe; harness green.
- **Tests to add:** the level curve + XP math; the **fusion blend** rules and cost
  consumption (pure, deterministic); cooldown logic; toolbar assign/activate;
  boss‑drop determinism under a fixed seed; **save/load round‑trip** of the new
  schema + migration.
- **Files:** `js/game.js` (new `Skills`/`SKILL_DB`/`Leveling`/fusion module,
  `Player`/combat hooks, boss loot tables, HUD toolbar, `serializeGame`/
  `applySave`, `SAVE_VERSION`), `index.html`/`css` (skill + toolbar UI; bump
  `?v=`), `test/harness.js`, `README.md`.
- **Out of scope:** a sprawling multi‑tree perk web (ship one coherent, tested
  system; note extensions as follow‑ups); PvP/balance tuning beyond sane defaults.
- **Hints:** keep skills **declarative** and i18n the names/descriptions (Golden
  Rule 9); make fusion a pure function of input attributes so it's fully testable.

