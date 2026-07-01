# Task 21 — Unified inventory for potions & ingredients (30 slots, drag‑and‑drop potion slotting, sellable items, dedicated alchemist NPC)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-25 · Folded materials (`player.materials`) and the potion belt
  (`player.potions`) into the **unified 30‑slot bag** (`invCap` 24 → 30) as stackable
  `{ id, uid, count }` items: materials are now first‑class `ITEM_DB` reagents and one bag
  code path (`bagAdd`/`bagCount`/`bagSpend`, `STACK_MAX` 99) serves potions + materials, so
  crafting (`hasMaterials`/`spendMaterials`), quest gathers and skill fusion all read/write
  the bag. The 3 combat quick‑slots became a pure **assignment** over bag potions
  (`player.potionSlots` = ids) with **drag‑and‑drop slotting** reusing Task 16's pointer‑drag
  utility + the pure `dragSlotReducer` (assign/move/swap/clear) and an accessible tap‑to‑pick
  fallback; drinking a slot consumes from the bag stack and auto‑clears when empty. Removed the
  on‑HUD materials chip strip (`#materialsBar`/`updateMaterialsHud`). Potions **and** materials
  are now **sellable** (`Shop.sell` peels one off a stack at the item's `ITEM_DB` value) and a
  dedicated **Apothecary** vendor (`Alchemist` class + `alchemist` NPC at a new `apothecary`
  hub landmark) sells potions + basic ingredients — **removed** from the merchant's stock so
  vendors are specialised (EN+RU localised). `SAVE_VERSION` **11 → 12**: the bag + quick‑slots
  serialize, and a pure tested `migrateLegacyBag` folds pre‑v12 `materials`+`potions` belt into
  bag stacks + quick‑slot refs (runs exactly once; older saves keep all their stuff). New
  `test/inventory21.test.js` (26 cases; Vitest 208 → 234) + a Playwright `inventory.spec.js`
  (potions‑tab quick‑slot drag‑assign, no HUD strip) at desktop + S24 Ultra portrait/landscape.
- **Depends on:** the item/inventory system (Task 12: `Inventory`/`invAdd`/`invCap`/
  the tabbed bag), the potion belt + materials (`POTION_SLOTS`, `player.potions`,
  `player.materials`), the Shop (Task 12/`POTION_STOCK`), and the drag utility from
  **Task 16**. Coordinate `SAVE_VERSION` with Tasks 18/19.
- **Goal.** Potions and crafting **ingredients live in ad‑hoc side stores**
  (`player.potions` belt + a `player.materials` dictionary) separate from the main
  **24‑slot equipment inventory**, with **HUD ingredient widgets**, **no
  drag‑and‑drop**, and **no way to sell** them — and the wizard sells everything.
  Rework the economy so **everything shares one bag** like shipped RPGs: ingredients
  and potions occupy **inventory slots**, the bag grows to **30**, potions are
  **drag‑slotted** into the 3 quick‑slots in any order, items are **sellable**, and
  a **dedicated alchemist NPC** sells potions + basic ingredients.
- **Scope (build this):**
  - **Move ingredients & potions into the general inventory.** Migrate
    **materials** (`player.materials` → stackable inventory items) and **potions**
    (out of the separate `player.potions` belt as the *storage* model) into the
    **unified bag** (`player.inventory`), so rocks, herbs, water, crystals **and**
    potions occupy **inventory slots** alongside gear — with **stacking** for
    consumables/materials (reuse/extend the Task 12 stack model). Crafting/recipes
    (`hasMaterials`/`spendMaterials`) now read/write the bag.
  - **Grow the bag to 30 slots.** Raise `invCap` from 24 → **30** and ensure the
    tabbed inventory UI (Gear/Materials/Potions filter) lays out the larger grid
    cleanly on mobile + desktop.
  - **Remove the HUD ingredient widgets.** Delete the on‑screen materials chips
    (`#materialsBar` / `updateMaterialsHud()`); ingredient counts are seen **only in
    the inventory** from now on (declutters the HUD, complementing Task 16).
  - **Drag‑and‑drop potion slotting (any potion, any order, 3 slots).** The 3
    combat potion **quick‑slots** become an **assignment** over bag potions (like
    the Task 16 skill slots): **drag any potion from the bag onto any of the 3
    slots**, reorder/swap by dragging between slots, clear by dragging off — so the
    player chooses which potions are quick‑drinkable and in what order. Reuse the
    **pointer‑based drag utility** from Task 16; keep a pure assignment model +
    accessible tap fallback. Drinking a quick‑slot consumes from the bag stack.
  - **Make potions & ingredients sellable.** Extend `Shop.sell()` so **potions and
    materials** can be sold back for coins (sane buy/sell pricing from `ITEM_DB`
    cost), like any other item.
  - **Dedicated alchemist NPC.** Add a **new alchemist/apothecary NPC** (in the hub
    or a wild zone, via `NPC_DATA`/`LOCATIONS`) whose shop sells **potions and basic
    ingredients** (`POTION_STOCK` + starter materials). **Remove those from the
    wizard's range** so vendors are specialized (the wizard/merchant keeps gear; the
    alchemist owns consumables + reagents). Localize the NPC + stock (EN+RU).
  - **Persistence.** Serialize the unified bag (potions + materials as items) + the
    drag‑assigned quick‑slots; **bump `SAVE_VERSION`**; **migrate** old saves
    (fold legacy `player.materials` + `player.potions` belt into bag items +
    quick‑slot refs) so existing players keep their stuff.
- **Acceptance criteria:**
  - Materials **and** potions live in the **30‑slot** bag (stacked), occupying
    inventory slots; crafting reads/writes the bag; the **HUD ingredient widgets are
    gone**.
  - Any potion can be **dragged into any of the 3 quick‑slots in any order**,
    reordered, swapped and cleared; drinking consumes from the bag; an accessible
    tap fallback exists.
  - Potions and ingredients are **sellable** at sane prices; a **dedicated
    alchemist NPC** sells potions + basic ingredients and the wizard **no longer**
    does.
  - The unified bag + quick‑slot assignment **round‑trips through save/load**, and
    **old saves migrate** (legacy belt/materials fold in) without loss; pipeline
    green; headless‑safe; works on mobile + desktop.
- **Tests to add:** the **migration** (legacy `materials` map + `potions` belt →
  bag items + quick‑slots) is a pure, tested function; bag **stacking** of
  materials/potions; the **drag‑to‑potion‑slot** reducer (assign/move/swap/clear,
  any order) unit‑tested; `Shop.sell` accepts potions/materials at expected prices;
  the alchemist's stock contains potions+basic ingredients and the wizard's no
  longer does; **save/load round‑trip** of the new schema + migration; a UI smoke
  driving a potion drag + a sell.
- **Files:** `src/game.js` (`Inventory`/`invAdd`/`invCap`→30, fold
  `materials`/`potions` into the bag, crafting `hasMaterials`/`spendMaterials`,
  `updatePotionBar` drag slotting, `Shop.sell`/`buyPotion`, remove
  `updateMaterialsHud`, the alchemist NPC wiring, `serializeGame`/`applySave`,
  `SAVE_VERSION`), `src/data/items.js`/`content.js` (potions/materials as
  inventory items, sell prices, alchemist stock split from the wizard),
  `src/data/content.js`/`NPC_DATA` (alchemist NPC + location), `index.html`/`css`
  (30‑slot grid, drop `#materialsBar`, potion drag targets),
  `src/core/i18n.js` (alchemist + any strings, EN+RU), `test/*`, `README.md`.
- **Out of scope:** a full crafting‑tree overhaul or new potion recipes beyond
  re‑homing the existing ones; weight/encumbrance (note as a follow‑up); the skill
  drag‑slotting (that's Task 16 — share the utility, don't redo it).
- **Hints:** model materials/potions as **stackable item instances** so one bag
  code path serves everything; reuse Task 16's pointer‑drag utility and the pure
  reducer pattern; gate the migration on `SAVE_VERSION` so it runs exactly once.

