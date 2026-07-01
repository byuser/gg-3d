# Task 12 — Deep item & equipment system (Skyrim‑grade) with visible worn gear + a real inventory

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-23 · Widened the loadout to **12 slots** (added pauldrons/gloves/belt/cloak),
  added **enchantments** (`AFFIXES` prefix/suffix rolled deterministically on found/crafted gear, rarity‑scaled,
  serialized + shown as i18n chips) and **equipment sets** (`SETS` Ironguard + Dragonscale with cumulative
  threshold bonuses). Refactored the recompute into a pure `deriveStats` shared by the live stats **and** the
  inventory's **compare‑vs‑equipped** deltas (`equipDelta`/`equippedAfter`). **Visible worn gear** — helmet,
  pauldrons, chest, gloves, belt, boots + a billowing cloak — built once on Lily and toggled/recoloured by
  rarity on equip (no leak), tier‑gated (`wornDetailFor`). Rebuilt the bag into a **tabbed inventory**
  (Gear/Materials/Potions) with filter+sort, set‑bonus panel and drink‑from‑bag potions. `SAVE_VERSION` → 7
  (per‑instance affixes + new slots; v6 saves still load). New `test/items.test.js` (21 cases; Vitest 32 → 53).
  Full pipeline green; real‑browser screenshot pass confirmed the gear + inventory.
- **Depends on:** none; pairs naturally with **Task 14** (skills/levels share the
  stat‑recompute pipeline) — keep the data layer compatible.
- **Goal.** Research how large RPGs (Skyrim/The Elder Scrolls, Diablo‑likes)
  structure items and build a **robust analog**: more item kinds and slots, gear
  that is **visibly worn and animated on the character**, and a proper
  **inventory** that also stores resources and potions.
- **Scope (build this):**
  - **Research → design doc.** Briefly document the target model (item categories,
    rarity tiers, affixes/enchantments, weight/value, equip slots, set bonuses)
    and how it maps onto the existing `ITEM_DB`/`Inventory`/`EQUIP_SLOTS`/
    `recomputeStats`/`enhance*` pipeline. Keep it data‑driven and headless‑safe.
  - **Expand & upgrade items.** Rebalance/upgrade current items and add new ones
    across **more kinds** — weapons (1‑h/2‑h/ranged/staff), armor (helmet,
    chest, gloves, boots, pauldrons, cloak, belt), jewelry (rings, amulet),
    and consumables. Add **rarity tiers** (common→legendary) with scaling stats,
    **enchantments/affixes** (prefix/suffix modifiers), and optional **set
    bonuses**. Extend the enhancement/anvil system to the new model.
  - **More wear slots.** Add equipment slots beyond today's 8 (e.g. gloves,
    pauldrons, cloak, belt, second ring already exists) with clear slot rules
    (2‑handed occupies both hands, etc.). Recompute stats from the full loadout.
  - **Visible, animated worn gear.** Render equipped gear **on Lily's procedural
    body** — boots, hat/helmet, chest piece, gloves, cloak, weapon in hand — that
    swap when equipment changes and **animate with the character** (cloak sway,
    weapon follows the swing, boots move with the legs). Build procedurally
    (no asset bloat), tier‑gated, and **dispose on teardown / re‑equip** (no
    leaks). Headless‑safe.
  - **Real inventory UI.** A grid/list inventory that holds gear **and** stores
    **resources and potions** (move materials/potions out of ad‑hoc state into the
    inventory model), with sort/filter by type/rarity, equip/unequip, compare
    tooltips (stat deltas vs equipped), drink/consume, and drop/sell hooks into the
    existing Shop. Stack consumables/materials; show weight/value if adopted.
  - **Persistence.** Serialize the full inventory + equipped loadout + new fields
    in `serializeGame`/`applySave`; bump `SAVE_VERSION`; keep older saves loading
    (migrate gracefully).
- **Acceptance criteria:**
  - The player can loot/buy/craft items across the expanded kinds, equip them into
    the expanded slots, and **see the gear on the character**, animating with
    actions, swapping on equip/unequip — with no leaks across travel.
  - Stats recompute correctly from the full loadout incl. rarity/affixes/sets; the
    inventory stores resources + potions and consuming/equipping works.
  - Inventory + equipment + materials/potions **round‑trip through save/load**;
    old saves still load.
  - Headless‑safe; harness green; nothing throws on low tier.
- **Tests to add:** item/affix/rarity stat math; equip/unequip slot rules
  (2‑handed, set bonuses); inventory add/stack/consume/sort; worn‑gear build +
  dispose (no leak) headless; **save/load round‑trip** of the new schema +
  migration from the prior version.
- **Files:** `js/game.js` (`ITEM_DB`, `Inventory`, `EQUIP_SLOTS`, `recomputeStats`,
  `enhance*`/`Anvil`/`Shop`, `Player._build`/update for worn gear + animation,
  inventory UI, `serializeGame`/`applySave`, `SAVE_VERSION`), `index.html`/`css`
  (inventory UI; bump `?v=`), `test/harness.js`, `README.md`.
- **Out of scope:** a full crafting‑tree overhaul, durability/repair economy
  (note as follow‑ups if you don't include them), imported 3D art.
- **Hints:** keep items **declarative**; resolve display names/descriptions
  through i18n (Golden Rule 9); reuse the existing enhancement multipliers.

