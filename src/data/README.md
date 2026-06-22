# `src/data/` — pure game-content tables

Declarative, self-contained data (and a few pure helpers). These modules import
nothing — not even from each other — and reference no runtime or DOM symbols, so
they are safe to edit in isolation and are type-checked by `tsc --checkJs`.
Cross-references between tables are by **string id** (e.g. a mission's reward
names an item id), resolved at runtime in `src/game.js`.

- **`items.js`** — `RARITY`/`ENHANCE` tables, `ITEM_DB`, equip slots
  (`EQUIP_SLOTS`, `SLOT_META`, `TWO_HANDED`, `FISTS`), the pure stat helpers
  (`effectiveStats`, `enhanceMult/Cost/Name`), and the derived shop / rare-drop /
  featured / potion pools.
- **`content.js`** — crafting `MATERIALS` + `RESOURCE_KINDS`, `RELICS`,
  `CASTLE_PARTS`, `CRAFT_RECIPES`, `MONSTER_ABILITIES` (+ `abilitiesForWave`),
  world `LOCATIONS` and story `NPC_DATA` (with their `*_BY_ID` indices).
- **`story.js`** — the declarative campaign: `STORY` chapters, ordered
  `MISSIONS`, optional `SIDE_QUESTS`, and the derived `QUEST_BY_ID` / `MAIN_IDS` /
  `CHAPTER_BY_ID` indices.
- **`zones.js`** — the explorable `ZONES` (themed, streamable per-zone worlds and
  their portals) + `ZONE_BY_ID` / `HUB_ZONE`.

Display names/descriptions for these tables are resolved through `src/core/i18n.js`
(`tItemName`, `tZoneName`, …) so all content stays translatable.
