// Data: crafting materials, resource kinds, relics, castle parts, recipes,
// monster abilities, world locations and story NPCs (all pure data tables).

  // =========================================================================
  // ADVENTURE / STORY CONTENT — crafting materials, castle relics, the castle
  // build plan, crafting recipes, the quest catalogue and the world's named
  // locations + story NPCs. This is the data that turns the wave survival game
  // into a story: gather + craft, run quests for coins/relics/gear, raise a
  // castle from five relics, then face the dragon to win.
  // =========================================================================

  // ---- Crafting materials (gathered from the world; not gear/inventory). ----
  const MATERIALS = {
    wood:    { label: "Wood",    icon: "🪵", tint: "#a6692e" },
    stone:   { label: "Stone",   icon: "🪨", tint: "#9aa0a6" },
    water:   { label: "Water",   icon: "💧", tint: "#3aa0e0" },
    herb:    { label: "Herb",    icon: "🌿", tint: "#4caa4c" },
    fiber:   { label: "Fiber",   icon: "🧵", tint: "#caa46a" },
    crystal: { label: "Crystal", icon: "🔮", tint: "#9fd0ff" },
  };
  const MATERIAL_IDS = Object.keys(MATERIALS);

  // ---- Harvestable resource node kinds (cut trees, mine rock, collect water…). ----
  const RESOURCE_KINDS = {
    tree:    { mat: "wood",    label: "Chop tree",      amount: [1, 3], respawn: 22 },
    rock:    { mat: "stone",   label: "Mine rock",      amount: [1, 2], respawn: 28 },
    herb:    { mat: "herb",    label: "Gather herbs",   amount: [1, 2], respawn: 16 },
    water:   { mat: "water",   label: "Collect water",  amount: [1, 2], respawn: 12 },
    fiber:   { mat: "fiber",   label: "Cut fibers",     amount: [1, 2], respawn: 18 },
    crystal: { mat: "crystal", label: "Mine crystal",   amount: [1, 1], respawn: 38 },
  };

  // ---- Castle relics — the five story collectibles. Each completes one part of
  // the castle. Relics are won from quests and found at the world's far reaches;
  // they live in their own pouch (player.relics), not the gear bag. ----
  const RELICS = {
    relic_foundation: { name: "Foundation Stone",  icon: "🗿", part: "foundation", desc: "An immense, rune-etched cornerstone." },
    relic_walls:      { name: "Rampart Runes",     icon: "🧱", part: "walls",      desc: "Stones that remember how to stand as walls." },
    relic_towers:     { name: "Tower Crystal",     icon: "🔮", part: "towers",     desc: "A crystal that sings the spires into being." },
    relic_gate:       { name: "Golden Gate Key",   icon: "🗝️", part: "gate",       desc: "A great key that conjures an unbreakable gate." },
    relic_keep:       { name: "Dragon Sigil",      icon: "🐲", part: "keep",       desc: "The seal of the old keep — and a dragon's attention." },
  };
  const RELIC_IDS = Object.keys(RELICS);
  const getRelic = (id) => RELICS[id];

  // ---- Castle build plan — five ordered parts, each needing its relic + coins.
  // Building the final "keep" summons the dragon for the climactic battle. ----
  const CASTLE_PARTS = [
    { id: "foundation", name: "Foundation", icon: "🟫", relic: "relic_foundation", cost: 40,  desc: "Lay the great cornerstone." },
    { id: "walls",      name: "Walls",      icon: "🧱", relic: "relic_walls",      cost: 80,  desc: "Raise the curtain walls." },
    { id: "towers",     name: "Towers",     icon: "🗼", relic: "relic_towers",     cost: 130, desc: "Conjure the corner spires." },
    { id: "gate",       name: "Gatehouse",  icon: "🏰", relic: "relic_gate",       cost: 190, desc: "Hang the golden gate." },
    { id: "keep",       name: "Keep",       icon: "👑", relic: "relic_keep",       cost: 260, desc: "Crown the keep — and wake the dragon." },
  ];
  const CASTLE_PART_BY_ID = {};
  for (const p of CASTLE_PARTS) CASTLE_PART_BY_ID[p.id] = p;

  // ---- Crafting recipes — turn gathered materials into potions + basic gear.
  // `out` is an ITEM_DB id (potions go to the belt; gear goes to the bag). ----
  const CRAFT_RECIPES = [
    { out: "minor_potion",   mats: { herb: 2, water: 1 } },
    { out: "health_potion",  mats: { herb: 3, water: 2 } },
    { out: "greater_potion", mats: { herb: 5, water: 3, crystal: 1 } },
    { out: "elixir_swift",   mats: { herb: 2, water: 1, fiber: 2 } },
    { out: "elixir_might",   mats: { herb: 2, water: 1, crystal: 1 } },
    { out: "leather_cap",    mats: { fiber: 3, wood: 1 } },
    { out: "leather_vest",   mats: { fiber: 5, wood: 2 } },
    { out: "leather_boots",  mats: { fiber: 3, wood: 2 } },
    { out: "iron_dagger",    mats: { wood: 2, stone: 3 } },
    { out: "iron_sword",     mats: { wood: 2, stone: 5 } },
    { out: "iron_helm",      mats: { stone: 4, fiber: 2 } },
    { out: "iron_plate",     mats: { stone: 8, fiber: 3, crystal: 1 } },
    { out: "apprentice_staff", mats: { wood: 4, crystal: 2 } },
  ];

  // ---- Monster abilities (the "Plants vs Zombies" variety). Every living sweet
  // rolls one of these behaviours; later waves field the nastier ones. ----
  //   chaser  — marches straight at you (the classic).
  //   runner  — fast and frail.
  //   brute   — slow, tanky, hits hard.
  //   jumper  — periodically LEAPS across the gap at you.
  //   shooter — hangs back and SPITS candy bolts (a Hazard).
  //   bomber  — rushes in and EXPLODES on death for area damage.
  const MONSTER_ABILITIES = {
    chaser:  { hp: 1.0,  speed: 1.0,  dmg: 1.0,  tint: null },
    runner:  { hp: 0.6,  speed: 1.7,  dmg: 0.8,  tint: "#7ef0ff" },
    brute:   { hp: 2.6,  speed: 0.6,  dmg: 1.8,  tint: "#ff7a4e", scale: 1.4 },
    jumper:  { hp: 1.0,  speed: 1.1,  dmg: 1.1,  tint: "#b6ff6c" },
    shooter: { hp: 0.9,  speed: 0.8,  dmg: 1.0,  tint: "#ff6cf0", standoff: 11 },
    bomber:  { hp: 0.8,  speed: 1.25, dmg: 1.0,  tint: "#ffd34e", explodes: true },
  };
  // Which abilities are in play by a given wave (variety unlocks over time).
  function abilitiesForWave(w) {
    const pool = ["chaser"];
    if (w >= 2) pool.push("runner");
    if (w >= 3) pool.push("jumper");
    if (w >= 4) pool.push("brute");
    if (w >= 5) pool.push("shooter");
    if (w >= 6) pool.push("bomber");
    return pool;
  }

  // ---- Named locations scattered across the larger world. Each is a landmark
  // the story sends you to; several host a story NPC with quests + rewards. ----
  const LOCATIONS = [
    { id: "village",  name: "Meadowgate Village", icon: "🏘️", x: 0,    z: -14, color: "#ffd98a" },
    { id: "apothecary", name: "Meadowgate Apothecary", icon: "⚗️", x: 8, z: 2, color: "#9ad6a0" },
    { id: "grove",    name: "Whisperwood Grove",  icon: "🌲", x: -48,  z: -40, color: "#5be0a0" },
    { id: "seaside",  name: "Saltmarsh Shore",    icon: "🌊", x: 60,   z: 52,  color: "#6cc6ff" },
    { id: "mountain", name: "Frostpeak Pass",     icon: "⛰️", x: -58,  z: 50,  color: "#cfe3ff" },
    { id: "ruins",    name: "Sunken Ruins",       icon: "🏛️", x: 56,   z: -52, color: "#c8a86a" },
    { id: "castle",   name: "Castle Hill",        icon: "🏰", x: 0,    z: 64,  color: "#ff9d5c" },
  ];
  const LOCATION_BY_ID = {};
  for (const l of LOCATIONS) LOCATION_BY_ID[l.id] = l;

  // ---- Story NPCs. Each stands at a landmark, has an intro line, and serves as
  // a GIVER for the campaign's missions + side quests (defined below). Identity
  // lives here only; the quests themselves live in the declarative STORY /
  // SIDE_QUESTS tables so the main line, the UI and the tests can all reason
  // about them as data.
  //   npc: { id, name, icon, loc(landmark id), intro }
  // =========================================================================
  const NPC_DATA = [
    { id: "mayor",     name: "Mayor Plum",       icon: "🎩", loc: "village",
      intro: "Meadowgate is besieged by living sweets! They say a castle once warded this vale. Help us raise it again, hero." },
    // The apothecary is a dedicated VENDOR, not a quest giver (vendor: "alchemist").
    // She stocks potions + basic ingredients; the merchant no longer sells them.
    { id: "alchemist", name: "Apothecary Miriel", icon: "⚗️", loc: "apothecary", vendor: "alchemist",
      intro: "Looking for a remedy? I brew every potion in the vale, and trade in fresh-cut reagents besides." },
    { id: "herbalist", name: "Sage Willow",      icon: "👩‍🌾", loc: "grove",
      intro: "The Whisperwood gives freely to those who listen. Gather with me, and I'll share old secrets." },
    { id: "fisher",    name: "Old Brin",         icon: "🎣", loc: "seaside",
      intro: "Hah! A landlubber at my shore. The sea keeps a Tower Crystal — earn it, and it's yours." },
    { id: "smith2",    name: "Forgemother Tova", icon: "⚒️", loc: "mountain",
      intro: "Frostpeak iron is the finest there is. Prove your arm and I'll forge you the Gate Key." },
    { id: "hermit",    name: "The Hermit",       icon: "🧙", loc: "ruins",
      intro: "You seek the Dragon Sigil? Few are ready. Speak with the Mayor first, then return to me." },
  ];
  const NPC_BY_ID = {};
  for (const n of NPC_DATA) NPC_BY_ID[n.id] = n;

  // =========================================================================
  // STORY — the structured main campaign. An ORDERED list of chapters, each a
  // run of ordered MISSIONS that march the player across the lands to raise the
  // castle and slay the dragon. Missions unlock strictly in order (the next one
  // opens once the previous is turned in), so a new player can follow the whole
  // main line purely by following the objective tracker — no guesswork. Every
  // mission reuses the quest objective engine (Quests): hunt / gather / reach /
  // talk, plus the campaign objectives `defeat_boss <zone>`, `build <castle
  // part>` and the finale `defeat_dragon`. SIDE_QUESTS are an optional pool
  // (some repeatable bounties), clearly separated from the main line in the log
  // and never blocking it.
  //   mission: { id, chapter, npc(giver | null for the finale), title, story,
  //              obj:{type,target?,count?}, reward:{coins,item,relic,mats}, where? }
  // =========================================================================

export {
  MATERIALS, MATERIAL_IDS, RESOURCE_KINDS, RELICS, RELIC_IDS, getRelic,
  CASTLE_PARTS, CASTLE_PART_BY_ID, CRAFT_RECIPES, MONSTER_ABILITIES, abilitiesForWave,
  LOCATIONS, LOCATION_BY_ID, NPC_DATA, NPC_BY_ID,
};
