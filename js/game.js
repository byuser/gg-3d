/*
 * Good Game 3D
 * ---------------------------------------------------------------------------
 * A third-person browser action-RPG built on Babylon.js.
 *
 * This release: run as Lily across an island split into several explorable
 * LANDS — a home vale (the hub), wild lands and two boss LAIRS — connected by
 * PORTALS (a path, a bridge, a cave mouth) that STREAM the world in and out so
 * it never freezes. Each land has its own roaming MONSTERS that RESPAWN over
 * time; take quests, gather & craft, raise a castle from five relics, then slay
 * the DRAGON to win.
 *
 * The code is split into small systems so features slot in cleanly:
 *
 *   - Interactable / InteractionSystem  reusable "walk up + press E" contract.
 *   - Input                             keyboard + on-screen stick + cast button.
 *   - Player                            movement, animation, weapons, health.
 *   - Projectile / Hazard               gravity-bound bolts (player + hostile).
 *   - Monster                           a "living sweet" with roam + chase AI.
 *   - ZONES / buildWorld(scene, zone)   themed, streamable per-zone worlds + portals.
 *   - SpawnDirector                     per-zone location spawns + respawn + lair boss.
 *   - ZoneManager                       faded, streamed travel between zones.
 */

(() => {
  "use strict";

  // A visible crash handler — far better than a blank canvas if anything fails.
  function showFatal(msg) {
    const hint = document.getElementById("loadHint");
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.remove("hidden");
    if (hint) { hint.style.color = "#ff8a8a"; hint.textContent = t("hint.errorPrefix") + msg; }
    console.error(msg);
  }
  window.addEventListener("error", (e) => showFatal(e.message || "unknown error"));

  // =========================================================================
  // Deterministic RNG (mulberry32)
  // -------------------------------------------------------------------------
  // The whole game draws its randomness from this single seeded stream instead
  // of rng(). Seeding it makes the *procedural world* (river, roads,
  // trees, rocks, …) fully reproducible: a saved game records its seed, and on
  // load we re-seed and rebuild the exact same environment before restoring the
  // live entities (monsters, coins, artifacts) on top. See serializeGame /
  // applySave below.
  // =========================================================================
  let worldSeed = (Date.now() ^ (Date.now() << 11) ^ 0x9e3779b9) >>> 0;
  let _rngState = worldSeed >>> 0;
  function rng() {
    _rngState |= 0; _rngState = (_rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function setSeed(s) { worldSeed = s >>> 0; _rngState = worldSeed; }

  const CONFIG = {
    moveSpeed: 6.5,          // metres / second
    turnLerp: 0.2,
    interactRange: 2.6,
    playerRadius: 0.55,      // collision radius vs scenery (trees, rocks, …)
    worldRadius: 88,         // playable area before the invisible fence

    // Combat / wand
    castCooldown: 0.32,      // seconds between magic bolts
    boltSpeed: 22,           // metres / second
    boltLife: 1.4,           // seconds before a bolt fizzles
    boltRadius: 0.8,         // hit radius against monsters

    // Player health
    maxHealth: 100,
    contactDamage: 12,       // damage per sweet "bite"
    biteCooldown: 0.8,       // seconds between bites from the same sweet

    // RPG spawning — resident monsters respawn this many seconds after the
    // zone's population drops below its cap (replaces the old wave timer).
    respawnDelay: 7,

    // Difficulty scaling — monster HP/speed grow with the ZONE level. (These
    // keep their historical *PerWave names; "wave" now means the zone's level.)
    monsterBaseSpeed: 1.6,
    monsterSpeedPerWave: 0.12,
    monsterMaxSpeed: 6.0,
    monsterHpPerWaves: 3,    // +1 HP every N zone levels

    // Bosses. bossEveryWaves maps a zone's level to a boss "cycle" (deeper lairs
    // hold tougher kings); bossBaseHp/bossHpPerCycle scale them up from there.
    bossEveryWaves: 5,        // multiplier from zone level -> boss cycle
    bossBaseHp: 38,           // boss HP on its first appearance (wave 5)
    bossHpPerCycle: 26,       // +HP for each later boss (wave 10, 15, …)
    bossSpeed: 2.0,           // bosses are slower but relentless
    bossContactDamage: 22,    // they hit much harder than a regular sweet
    bossRadius: 2.4,          // big body → big hit/contact radius
    bossScore: 400,           // score for felling a boss
    bossCoinDrop: 30,         // guaranteed coins when a boss is defeated

    // Score
    scorePerMonster: 25,
    scorePerArtifact: 50,

    // Artifacts also restore a little health and pay a small coin reward.
    artifactHeal: 12,
    artifactCoinMin: 2,
    artifactCoinMax: 5,

    // Coins (the shop currency, dropped by defeated sweets)
    coinDropChance: 0.55,     // chance a defeated sweet drops coins
    coinValueMin: 1,
    coinValueMax: 3,
    coinPickupRange: 1.9,     // walk this close to scoop a coin up
    coinMagnetRange: 4.5,     // coins drift toward the player inside this range
    coinLife: 30,             // seconds before an uncollected coin fades away

    // World / exploration (the bigger story map).
    gatherRange: 3.0,         // reach to harvest a resource node
    questReachRange: 6.0,     // how close counts as "reaching" a location/NPC

    // Day / night cycle — one full day every `dayLength` seconds.
    dayLength: 180,           // seconds for a full dawn→dusk→night→dawn cycle
    startTimeOfDay: 0.30,     // begin mid-morning (0=midnight, 0.5=noon)

    // Weather — chance to change each "weather tick" and how long a spell lasts.
    weatherMinTime: 35,       // min seconds a weather state holds
    weatherMaxTime: 75,       // max seconds before it may change

    // The dragon — the final boss summoned once the castle is complete.
    dragonBaseHp: 900,
    dragonContactDamage: 30,
    dragonScore: 5000,
  };

  const PALETTE = ["#6cc6ff", "#a06cff", "#ff6c8a", "#ffd34e", "#5be0a0", "#ff944e"];

  // =========================================================================
  // ITEMS, EQUIPMENT & INVENTORY
  // -------------------------------------------------------------------------
  // The game's economy is now gear-driven instead of fixed buffs. The merchant
  // sells "normal" gear; bosses drop "rare" gear. Every item is a weapon,
  // armour piece or accessory that the player carries in an INVENTORY and slots
  // into EQUIPMENT. The player's stats (max health, damage, speed, resistance,
  // …) are RECOMPUTED from whatever is equipped — see recomputeStats().
  //
  //   Slots: helmet · breastplate · boots · necklace · ring1 · ring2 · two
  //   hands (hand1/hand2). A two-handed weapon fills both hands; two one-handed
  //   weapons can be dual-wielded.
  // =========================================================================
  const RARITY = {
    normal:    { label: "Common",    color: "#bcd2ff", tier: 0 },
    rare:      { label: "Rare",      color: "#ffb24e", tier: 1 },
    epic:      { label: "Epic",      color: "#c77dff", tier: 2 },
    legendary: { label: "Legendary", color: "#ff5d5d", tier: 3 },
  };

  // ---- Enhancement (blacksmith) -----------------------------------------
  // Every gear instance carries an enhancement `level` (0 by default). The
  // blacksmith raises it for coins, scaling the item's stats / weapon damage.
  // Higher-rarity gear can be pushed further and gains more per level — so
  // legendary loot is worth investing in.
  const ENHANCE = {
    normal:    { max: 3,  step: 0.10, baseCost: 18 },
    rare:      { max: 5,  step: 0.12, baseCost: 42 },
    epic:      { max: 7,  step: 0.14, baseCost: 85 },
    legendary: { max: 10, step: 0.16, baseCost: 150 },
  };
  const enhanceRule = (def) => ENHANCE[def.rarity] || ENHANCE.normal;
  const instLevel = (inst) => (inst && inst.level) ? inst.level : 0;
  // Multiplier applied to an item's numeric bonuses at a given enhancement level.
  function enhanceMult(def, level) {
    if (!level) return 1;
    return 1 + level * enhanceRule(def).step;
  }
  // Coin cost to raise an item from its current level to the next one.
  function enhanceCost(def, level) {
    const r = enhanceRule(def);
    const tier = (RARITY[def.rarity] || RARITY.normal).tier;
    return Math.round(r.baseCost * (level + 1) * (1 + tier * 0.35));
  }
  // Append a "+N" suffix to an enhanced item's name (e.g. "Iron Sword +3").
  const enhanceName = (name, level) => level ? `${name} +${level}` : name;

  // An item's effective stat block once its enhancement level is folded in.
  // `haste` (a sub-1 cooldown multiplier) improves *toward* zero, so we scale
  // its distance from 1 instead of the raw value.
  function effectiveStats(inst) {
    const def = getDef(inst.id);
    const base = def.stats || {};
    const mult = enhanceMult(def, instLevel(inst));
    if (mult === 1) return base;
    const out = {};
    for (const k in base) {
      out[k] = k === "haste" ? 1 - (1 - base[k]) * mult : base[k] * mult;
    }
    return out;
  }

  // Equipment slots, in display order. A two-handed weapon lives in hand1 with
  // a TWO_HANDED sentinel parked in hand2 so the off-hand reads as occupied.
  const EQUIP_SLOTS = ["helmet", "breastplate", "boots", "necklace", "ring1", "ring2", "hand1", "hand2"];
  const TWO_HANDED = "__2H__";
  const SLOT_META = {
    helmet:      { label: "Helmet",      icon: "🪖" },
    breastplate: { label: "Breastplate", icon: "🦺" },
    boots:       { label: "Boots",       icon: "🥾" },
    necklace:    { label: "Necklace",    icon: "📿" },
    ring1:       { label: "Ring",        icon: "💍" },
    ring2:       { label: "Ring",        icon: "💍" },
    hand1:       { label: "Main hand",   icon: "🤚" },
    hand2:       { label: "Off hand",    icon: "✋" },
  };

  // The fallback "weapon" when the player holds nothing — bare-handed melee.
  const FISTS = {
    id: "fists", name: "Fists", ranged: false, damage: 1, cooldown: 0.5, multishot: 1,
    melee: { range: 2.2, arc: 1.5 }, color: "#ffe0c0",
  };

  // ---- Item catalogue ----------------------------------------------------
  // type: "weapon" | "helmet" | "breastplate" | "boots" | "ring" | "necklace"
  // stats: maxHealth · damageReduction · lifesteal · moveSpeed · damage ·
  //        haste(cooldown ×) · pierce · coinRange   (all optional, additive)
  // weapon (weapons only): { ranged, shape, damage, cooldown, multishot, spread,
  //        pierce, boltSpeed, boltRadius, gravity, color, haloColor, melee }
  // cost: merchant buy price (normal items). value: sell/worth (auto-derived).
  const ITEM_DB = {
    // ----- Weapons (normal / buyable) -----
    magic_wand: {
      name: "Magic Wand", icon: "🪄", type: "weapon", rarity: "normal", hands: 1, cost: 12,
      desc: "A trusty bolt-flinger.",
      weapon: { ranged: true, shape: "bolt", damage: 1, cooldown: 0.32, multishot: 1, spread: 0.22,
                pierce: 0, boltSpeed: 22, boltRadius: 0.8, gravity: 1.5, color: "#bfe3ff", haloColor: "#9fd0ff" },
    },
    short_bow: {
      name: "Short Bow", icon: "🏹", type: "weapon", rarity: "normal", hands: 2, cost: 34,
      desc: "Two-handed. Fast, piercing arrows that arc and drop.",
      weapon: { ranged: true, shape: "arrow", damage: 2, cooldown: 0.5, multishot: 1, spread: 0.16,
                pierce: 1, boltSpeed: 34, boltRadius: 0.55, gravity: 8, color: "#caa46a", haloColor: "#ffe9b0" },
    },
    apprentice_staff: {
      name: "Apprentice Staff", icon: "🔮", type: "weapon", rarity: "normal", hands: 2, cost: 42,
      desc: "Two-handed. Casts a 3-bolt spread.",
      weapon: { ranged: true, shape: "bolt", damage: 1, cooldown: 0.42, multishot: 3, spread: 0.2,
                pierce: 0, boltSpeed: 20, boltRadius: 0.85, gravity: 1.5, color: "#ffd9f0", haloColor: "#ff9de0" },
    },
    iron_dagger: {
      name: "Iron Dagger", icon: "🗡️", type: "weapon", rarity: "normal", hands: 1, cost: 16,
      desc: "One-handed. Quick short jabs — great dual-wielded.",
      weapon: { ranged: false, damage: 1.5, cooldown: 0.2, multishot: 1, melee: { range: 2.3, arc: 1.3 }, color: "#cfd6e0" },
    },
    iron_sword: {
      name: "Iron Sword", icon: "⚔️", type: "weapon", rarity: "normal", hands: 1, cost: 28,
      desc: "One-handed. A balanced melee swing.",
      weapon: { ranged: false, damage: 3, cooldown: 0.45, multishot: 1, melee: { range: 3.2, arc: 1.7 }, color: "#d7dde6" },
    },
    war_axe: {
      name: "War Axe", icon: "🪓", type: "weapon", rarity: "normal", hands: 1, cost: 46,
      desc: "One-handed. Slow but heavy, wide arc.",
      weapon: { ranged: false, damage: 4, cooldown: 0.7, multishot: 1, melee: { range: 3.0, arc: 2.3 }, color: "#c8b08a" },
    },

    // ----- Armour (normal / buyable) -----
    leather_cap:    { name: "Leather Cap",    icon: "🧢", type: "helmet",      rarity: "normal", cost: 14, desc: "+15 max health.", stats: { maxHealth: 15 } },
    iron_helm:      { name: "Iron Helm",      icon: "⛑️", type: "helmet",      rarity: "normal", cost: 30, desc: "+25 health, +4% resist.", stats: { maxHealth: 25, damageReduction: 0.04 } },
    leather_vest:   { name: "Leather Vest",   icon: "🦺", type: "breastplate", rarity: "normal", cost: 20, desc: "+20 health, +4% resist.", stats: { maxHealth: 20, damageReduction: 0.04 } },
    iron_plate:     { name: "Iron Plate",     icon: "🛡️", type: "breastplate", rarity: "normal", cost: 40, desc: "+35 health, +10% resist.", stats: { maxHealth: 35, damageReduction: 0.1 } },
    leather_boots:  { name: "Leather Boots",  icon: "🥾", type: "boots",       rarity: "normal", cost: 16, desc: "+0.8 move speed.", stats: { moveSpeed: 0.8 } },
    iron_greaves:   { name: "Iron Greaves",   icon: "🦿", type: "boots",       rarity: "normal", cost: 30, desc: "+0.4 speed, +5% resist.", stats: { moveSpeed: 0.4, damageReduction: 0.05 } },

    // ----- Accessories (normal / buyable) -----
    amulet_vigor:   { name: "Amulet of Vigor", icon: "📿", type: "necklace", rarity: "normal", cost: 26, desc: "+25 max health.", stats: { maxHealth: 25 } },
    coin_amulet:    { name: "Lodestone Pendant", icon: "🧲", type: "necklace", rarity: "normal", cost: 18, desc: "Draw coins from afar.", stats: { coinRange: 3 } },
    ring_power:     { name: "Ring of Power",  icon: "💍", type: "ring", rarity: "normal", cost: 22, desc: "+1 weapon damage.", stats: { damage: 1 } },
    ring_swift:     { name: "Ring of Haste",  icon: "💍", type: "ring", rarity: "normal", cost: 24, desc: "Attack 12% faster.", stats: { haste: 0.88 } },
    ring_guard:     { name: "Ring of Guard",  icon: "💍", type: "ring", rarity: "normal", cost: 20, desc: "+6% damage resist.", stats: { damageReduction: 0.06 } },

    // ----- RARE gear (boss drops only) -----
    excalibur:      { name: "Excalibur", icon: "🗡️", type: "weapon", rarity: "rare", hands: 2, value: 120, desc: "Two-handed greatsword. Devastating wide arc.",
                      weapon: { ranged: false, damage: 8, cooldown: 0.5, multishot: 1, melee: { range: 3.8, arc: 2.1 }, color: "#bfe0ff" } },
    storm_bow:      { name: "Storm Bow", icon: "🏹", type: "weapon", rarity: "rare", hands: 2, value: 110, desc: "Two-handed. Looses 3 piercing arrows.",
                      weapon: { ranged: true, shape: "arrow", damage: 3, cooldown: 0.46, multishot: 3, spread: 0.12, pierce: 2, boltSpeed: 40, boltRadius: 0.55, gravity: 7, color: "#a8e0ff", haloColor: "#d8f4ff" } },
    archmage_wand:  { name: "Archmage Wand", icon: "✨", type: "weapon", rarity: "rare", hands: 1, value: 95, desc: "One-handed. A 3-bolt piercing storm.",
                      weapon: { ranged: true, shape: "bolt", damage: 2, cooldown: 0.28, multishot: 3, spread: 0.16, pierce: 1, boltSpeed: 26, boltRadius: 0.95, gravity: 1.2, color: "#d8e8ff", haloColor: "#88b8ff" } },
    twin_fang:      { name: "Fang Dagger", icon: "🔪", type: "weapon", rarity: "rare", hands: 1, value: 80, desc: "One-handed. Blistering, life-draining jabs.",
                      weapon: { ranged: false, damage: 3, cooldown: 0.16, multishot: 1, melee: { range: 2.5, arc: 1.4 }, color: "#ff9db0" }, stats: { lifesteal: 1 } },
    thunder_hammer: { name: "Thunder Hammer", icon: "🔨", type: "weapon", rarity: "rare", hands: 2, value: 130, desc: "Two-handed. Crushing, enormous arc.",
                      weapon: { ranged: false, damage: 10, cooldown: 0.85, multishot: 1, melee: { range: 3.6, arc: 2.7 }, color: "#ffd76a" } },
    dragon_helm:    { name: "Dragon Helm",   icon: "🐲", type: "helmet",      rarity: "rare", value: 80, desc: "+40 health, +10% resist.", stats: { maxHealth: 40, damageReduction: 0.1 } },
    aegis_plate:    { name: "Aegis Plate",   icon: "🛡️", type: "breastplate", rarity: "rare", value: 100, desc: "+55 health, +16% resist.", stats: { maxHealth: 55, damageReduction: 0.16 } },
    winged_boots:   { name: "Winged Boots",  icon: "🪽", type: "boots",       rarity: "rare", value: 80, desc: "+1.4 speed, +5% resist.", stats: { moveSpeed: 1.4, damageReduction: 0.05 } },
    vampiric_ring:  { name: "Vampiric Ring", icon: "🩸", type: "ring",        rarity: "rare", value: 70, desc: "Heal +3 per kill.", stats: { lifesteal: 3 } },
    titan_pendant:  { name: "Titan Pendant", icon: "💠", type: "necklace",    rarity: "rare", value: 110, desc: "+45 health, +8% resist, +2 damage.", stats: { maxHealth: 45, damageReduction: 0.08, damage: 2 } },

    // ----- EPIC gear (featured shop / blacksmith showcase) -----
    void_scythe:    { name: "Void Scythe", icon: "🌑", type: "weapon", rarity: "epic", hands: 2, value: 200, desc: "Two-handed. A reaping, life-draining arc.",
                      weapon: { ranged: false, damage: 12, cooldown: 0.55, multishot: 1, melee: { range: 4.0, arc: 2.6 }, color: "#b07aff" }, stats: { lifesteal: 2 } },
    sunfire_staff:  { name: "Sunfire Staff", icon: "☀️", type: "weapon", rarity: "epic", hands: 2, value: 190, desc: "Two-handed. A 5-bolt searing fan.",
                      weapon: { ranged: true, shape: "bolt", damage: 3, cooldown: 0.3, multishot: 5, spread: 0.14, pierce: 1, boltSpeed: 28, boltRadius: 0.95, gravity: 1.1, color: "#ffb24e", haloColor: "#ffe27a" } },
    phoenix_plate:  { name: "Phoenix Plate", icon: "🔥", type: "breastplate", rarity: "epic", value: 180, desc: "+75 health, +20% resist.", stats: { maxHealth: 75, damageReduction: 0.2 } },
    seraph_ring:    { name: "Seraph Ring", icon: "💫", type: "ring", rarity: "epic", value: 150, desc: "+3 damage, +5 lifesteal.", stats: { damage: 3, lifesteal: 5 } },

    // ----- LEGENDARY gear (the apex featured / blacksmith showcase) -----
    world_ender:    { name: "World-Ender", icon: "💥", type: "weapon", rarity: "legendary", hands: 2, value: 320, desc: "Two-handed. Cataclysmic, sweeping ruin.",
                      weapon: { ranged: false, damage: 18, cooldown: 0.6, multishot: 1, melee: { range: 4.4, arc: 2.9 }, color: "#ff5d5d" }, stats: { lifesteal: 4 } },
    astral_bow:     { name: "Astral Bow", icon: "🌟", type: "weapon", rarity: "legendary", hands: 2, value: 300, desc: "Two-handed. A 5-arrow piercing storm.",
                      weapon: { ranged: true, shape: "arrow", damage: 5, cooldown: 0.4, multishot: 5, spread: 0.1, pierce: 3, boltSpeed: 46, boltRadius: 0.6, gravity: 6, color: "#a8e0ff", haloColor: "#eaffff" } },
    crown_eternal:  { name: "Crown Eternal", icon: "👑", type: "helmet", rarity: "legendary", value: 280, desc: "+90 health, +18% resist, +3 damage.", stats: { maxHealth: 90, damageReduction: 0.18, damage: 3 } },

    // ----- Potions / consumables (the potion belt) -----
    minor_potion:   { name: "Minor Health Potion", icon: "🧪", type: "potion", rarity: "normal", cost: 8,  desc: "Restore 30 health.", potion: { heal: 30 } },
    health_potion:  { name: "Health Potion",       icon: "❤️", type: "potion", rarity: "normal", cost: 16, desc: "Restore 65 health.", potion: { heal: 65 } },
    greater_potion: { name: "Greater Health Potion", icon: "💖", type: "potion", rarity: "rare", cost: 30, desc: "Restore 140 health.", potion: { heal: 140 } },
    elixir_might:   { name: "Elixir of Might",     icon: "⚗️", type: "potion", rarity: "rare", cost: 34, desc: "+4 damage for 18s.", potion: { buff: { damage: 4 }, time: 18, label: "Might" } },
    elixir_swift:   { name: "Elixir of Swiftness", icon: "🌀", type: "potion", rarity: "rare", cost: 30, desc: "+2.5 speed for 18s.", potion: { buff: { moveSpeed: 2.5 }, time: 18, label: "Swift" } },
  };

  // Fill in derived fields (id, sell value) once.
  for (const id in ITEM_DB) {
    const d = ITEM_DB[id];
    d.id = id;
    if (d.value == null) d.value = d.cost != null ? Math.max(1, Math.round(d.cost * 0.5)) : 40;
  }
  const getDef = (id) => ITEM_DB[id];
  const isGear = (id) => ITEM_DB[id].type !== "potion";
  // The merchant's normal gear stock (potions are stocked separately).
  const SHOP_STOCK = Object.keys(ITEM_DB).filter((id) => ITEM_DB[id].rarity === "normal" && ITEM_DB[id].cost != null && isGear(id));
  // Potions sold by the merchant (any consumable with a price).
  const POTION_STOCK = Object.keys(ITEM_DB).filter((id) => ITEM_DB[id].type === "potion" && ITEM_DB[id].cost != null);
  // Rare gear bosses can drop (rare-rarity gear only — never potions/epic/legend).
  const RARE_DROPS = Object.keys(ITEM_DB).filter((id) => ITEM_DB[id].rarity === "rare" && isGear(id));
  // The pool the rotating "Featured" shop tab draws its wares from: every piece
  // of rare/epic/legendary gear. A wave-seeded subset is offered each wave.
  const FEATURED_POOL = Object.keys(ITEM_DB).filter((id) =>
    isGear(id) && ["rare", "epic", "legendary"].includes(ITEM_DB[id].rarity));

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
  const STORY = {
    title: "The Castle of Meadowgate",
    intro: {
      title: "📜 The Tale of Meadowgate",
      text: "Long ago a great castle warded this vale — until it crumbled and the lands filled with living sweets. " +
            "You are Lily, the hero Meadowgate prayed for. Gather the five lost relics, raise the castle anew, and " +
            "face the Ancient Dragon that sleeps beneath the keep. " +
            "Follow the glowing ❗ folk and your quest tracker — each task leads to the next. The vale is in your hands.",
    },
    ending: {
      title: "🏰 Dawn Over the Vale",
      text: "The Ancient Dragon is slain and the castle stands crowned against the dawn. The sweets scatter to the wilds, " +
            "the folk of Meadowgate throw open their doors, and your name is sung from grove to shore. The vale is saved — well done, hero.",
    },
    chapters: [
      { id: "ch1", title: "The Vale Besieged", blurb: "Answer Meadowgate's call and lay the castle's first stone." },
      { id: "ch2", title: "Stone & Steel",     blurb: "Steel the militia and raise the curtain walls." },
      { id: "ch3", title: "The Crystal Tide",  blurb: "Brave the sea-caves for the Tower Crystal." },
      { id: "ch4", title: "The Golden Gate",   blurb: "Forge the Gate Key in Frostpeak's fire." },
      { id: "ch5", title: "The Dragon's Seal", blurb: "Claim the Dragon Sigil, crown the keep, and end the beast." },
    ],
  };

  // The ordered main missions (flattened; array order === campaign order).
  const MISSIONS = [
    // ── Chapter 1 — The Vale Besieged ───────────────────────────────────────
    { id: "m_cull", chapter: "ch1", npc: "mayor", title: "A Taste of Battle",
      story: "Cull the sweets prowling our fields and show the vale there's hope.",
      obj: { type: "hunt", count: 5 }, where: "Meadowgate Vale",
      reward: { coins: 30, mats: { wood: 3, water: 2 } } },
    { id: "m_cornerstone", chapter: "ch1", npc: "mayor", title: "The Cornerstone",
      story: "The Foundation Stone lies in the Sunken Ruins to the east. Seek it out.",
      obj: { type: "reach", target: "ruins" },
      reward: { coins: 40, relic: "relic_foundation" } },
    { id: "m_foundation", chapter: "ch1", npc: "mayor", title: "Lay the Cornerstone",
      story: "Carry the Foundation Stone to Castle Hill and lay our cornerstone.",
      obj: { type: "build", target: "foundation" },
      reward: { coins: 30, mats: { stone: 2 } } },
    // ── Chapter 2 — Stone & Steel ───────────────────────────────────────────
    { id: "m_poultice", chapter: "ch2", npc: "herbalist", title: "Green Hands",
      story: "Gather herbs from the grove so I can brew poultices for the militia.",
      obj: { type: "gather", target: "herb", count: 6 }, where: "Whisperwood Grove",
      reward: { coins: 25, item: "health_potion", mats: { crystal: 1 } } },
    { id: "m_stone", chapter: "ch2", npc: "smith2", title: "Stones for the Walls",
      story: "Walls need good stone. Mine some from the hills and high rocks.",
      obj: { type: "gather", target: "stone", count: 8 }, where: "Frostpeak & the hills",
      reward: { coins: 50, relic: "relic_walls" } },
    { id: "m_walls", chapter: "ch2", npc: "mayor", title: "Raise the Ramparts",
      story: "With the Rampart Runes in hand, raise our curtain walls.",
      obj: { type: "build", target: "walls" },
      reward: { coins: 40, item: "iron_helm" } },
    // ── Chapter 3 — The Crystal Tide ────────────────────────────────────────
    { id: "m_water", chapter: "ch3", npc: "fisher", title: "Fresh Water",
      story: "Fetch clean water from the river for my nets, and I'll tell you of the deep caves.",
      obj: { type: "gather", target: "water", count: 6 }, where: "the river & Saltmarsh",
      reward: { coins: 30, mats: { fiber: 4 } } },
    { id: "m_caverns", chapter: "ch3", npc: "fisher", title: "The Deep Below",
      story: "A candy golem hoards the Tower Crystal in the Crystal Caverns, through the sea-cave past my shore. End it!",
      obj: { type: "defeat_boss", target: "caverns" }, where: "Crystal Caverns (via Saltmarsh)",
      reward: { coins: 70, relic: "relic_towers" } },
    { id: "m_towers", chapter: "ch3", npc: "mayor", title: "Conjure the Spires",
      story: "Sing the Tower Crystal into the castle's corner spires.",
      obj: { type: "build", target: "towers" },
      reward: { coins: 50 } },
    // ── Chapter 4 — The Golden Gate ─────────────────────────────────────────
    { id: "m_ore", chapter: "ch4", npc: "smith2", title: "Ore for the Forge",
      story: "Bring me crystal from the high rocks to fire the forge.",
      obj: { type: "gather", target: "crystal", count: 3 }, where: "Frostpeak Trail",
      reward: { coins: 50, item: "iron_sword" } },
    { id: "m_gatekey", chapter: "ch4", npc: "smith2", title: "The Golden Gate",
      story: "Slay the sweets haunting the frostpeak pass and claim the forged Gate Key.",
      obj: { type: "hunt", count: 14 }, where: "Frostpeak Trail",
      reward: { coins: 80, relic: "relic_gate" } },
    { id: "m_gate", chapter: "ch4", npc: "mayor", title: "Hang the Golden Gate",
      story: "Hang the golden gate and seal our walls.",
      obj: { type: "build", target: "gate" },
      reward: { coins: 60 } },
    // ── Chapter 5 — The Dragon's Seal ───────────────────────────────────────
    { id: "m_word", chapter: "ch5", npc: "hermit", title: "Word from the Vale",
      story: "Speak with Mayor Plum that he vouches for you, then return to me.",
      obj: { type: "talk", target: "mayor" },
      reward: { coins: 30, mats: { crystal: 2 } } },
    { id: "m_thicket", chapter: "ch5", npc: "hermit", title: "The Bramble Heart",
      story: "The Bramble Hydra coils in the deep thicket beyond the Whisperwood. Cut out its heart and the Dragon Sigil is yours.",
      obj: { type: "defeat_boss", target: "thicket" }, where: "Bramblewood Thicket (via Whisperwood)",
      reward: { coins: 120, relic: "relic_keep" } },
    { id: "m_keep", chapter: "ch5", npc: "mayor", title: "Crown the Keep",
      story: "Set the Dragon Sigil and crown the keep — though it will surely wake the beast below.",
      obj: { type: "build", target: "keep" },
      reward: { coins: 80 } },
    { id: "m_dragon", chapter: "ch5", npc: null, title: "Slay the Ancient Dragon",
      story: "The Ancient Dragon is awake. Face it before the new-raised castle and end the long siege.",
      obj: { type: "defeat_dragon" }, where: "Castle Hill",
      reward: {} },
  ];

  // Optional side quests — bounties + errands from the same NPCs, kept clearly
  // apart from the main line. `repeatable` bounties can be taken again after
  // each turn-in for steady coin; the rest are one-shot.
  const SIDE_QUESTS = [
    { id: "sq_pests", npc: "mayor", title: "Pest Control", repeatable: true,
      story: "Sweets keep wandering into the plaza. Thin them out — there's coin in it, as often as you like.",
      obj: { type: "hunt", count: 8 }, reward: { coins: 45 } },
    { id: "sq_supplies", npc: "herbalist", title: "Healer's Stock",
      story: "Stock my shelves with herbs and I'll spare you a tonic.",
      obj: { type: "gather", target: "herb", count: 8 }, reward: { coins: 30, item: "health_potion" } },
    { id: "sq_nets", npc: "fisher", title: "Mend the Nets",
      story: "My nets are in tatters. Bring fiber and I'll cut you in.",
      obj: { type: "gather", target: "fiber", count: 6 }, reward: { coins: 28, item: "elixir_swift" } },
    { id: "sq_forgefuel", npc: "smith2", title: "Forgefuel",
      story: "The forge hungers for crystal. Feed it and take this blade.",
      obj: { type: "gather", target: "crystal", count: 4 }, reward: { coins: 55, item: "iron_sword" } },
    { id: "sq_relics", npc: "hermit", title: "Trials of the Lost",
      story: "Prove your steel against the wild swarm and earn an old charm of mine.",
      obj: { type: "hunt", count: 15 }, reward: { coins: 90, item: "ring_swift" } },
    { id: "sq_wilds", npc: "smith2", title: "Cull the Wilds", repeatable: true,
      story: "There's a standing bounty on the wild sweets — bring me a tally any time.",
      obj: { type: "hunt", count: 12 }, reward: { coins: 60 } },
  ];

  // Normalise + index every quest (main + side) so the engine, UI and tests can
  // treat them uniformly by id.
  for (const m of MISSIONS) m.line = "main";
  for (const s of SIDE_QUESTS) s.line = "side";
  const QUEST_BY_ID = {};
  for (const q of MISSIONS) QUEST_BY_ID[q.id] = q;
  for (const q of SIDE_QUESTS) QUEST_BY_ID[q.id] = q;
  const MAIN_IDS = MISSIONS.map((m) => m.id);                 // campaign order
  const MAIN_INDEX = {}; MAIN_IDS.forEach((id, i) => { MAIN_INDEX[id] = i; });
  const SIDE_IDS = SIDE_QUESTS.map((s) => s.id);
  const CHAPTER_BY_ID = {}; for (const c of STORY.chapters) CHAPTER_BY_ID[c.id] = c;
  const missionsOfChapter = (chId) => MISSIONS.filter((m) => m.chapter === chId);

  // =========================================================================
  // ZONES — the world is no longer one map driven by a wave timer. It is split
  // into several explorable LOCATIONS, each with its own look, its own resident
  // monster types that wander and RESPAWN over time, and (for the wild zones) a
  // BOSS lurking in its depths. Zones are connected by PORTALS — a forest path,
  // a wooden bridge, a cave mouth — and stream in/out as you travel so the game
  // never holds more than one zone in memory and never freezes.
  //
  // The MEADOW is the home hub: it keeps the village, plaza, river, the merchant
  // & blacksmith, the castle build site, the resource nodes and the story NPCs.
  // The wild zones (forest, shore, peaks, caverns, thicket) are the new hunting
  // grounds, two of which are boss lairs.
  //
  //   zone: { id, name, icon, home?, level, radius,
  //           theme:{ sky, fog, fogDensity, ground, hemi, sun, sunDir,
  //                   expMul?, conMul?, shadowDark? },  // optional light mood
  //           scenery:{ trees, rocks, bushes, toadstools, flowers, crystals,
  //                     palms, snow, pillars },
  //           spawn:{ count, kinds:[…sweet kinds], abilities:[…], heal? },
  //           boss?:{ archId, name, intro },
  //           portals:[ { to, kind:'path'|'bridge'|'cave', angle } ] }
  // The portal's world position is derived from `angle` + the zone radius; the
  // matching return portal in the target zone is found by `to === thisZone`.
  // =========================================================================
  const ZONES = [
    {
      id: "meadow", name: "Meadowgate Vale", icon: "🏘️", home: true, level: 1, radius: 88,
      theme: { sky: "#86c5ff", fog: "#a9d4ff", fogDensity: 0.006, ground: "#5fae4f",
               hemi: "#4a6a3a", sun: "#fff4e0", sunDir: [-0.5, -1, -0.4] },
      scenery: { trees: 60, rocks: 40, bushes: 34, toadstools: 22, flowers: 140 },
      spawn: { count: 7, kinds: ["lollipop", "gummy", "cupcake", "macaron"], abilities: ["chaser", "runner"] },
      portals: [
        { to: "forest", kind: "path",   angle: -2.45 }, // toward Whisperwood (grove, NW)
        { to: "shore",  kind: "bridge", angle: 0.71 },  // toward Saltmarsh (seaside, SE)
        { to: "peaks",  kind: "path",   angle: 2.43 },  // toward Frostpeak (mountain, SW)
      ],
    },
    {
      id: "forest", name: "Whisperwood Deep", icon: "🌲", level: 3, radius: 64,
      theme: { sky: "#3f6b4a", fog: "#2f5238", fogDensity: 0.018, ground: "#356b39",
               hemi: "#24401f", sun: "#cfe6b0", sunDir: [-0.35, -1, -0.5], expMul: 0.97, conMul: 1.04 },
      scenery: { trees: 120, rocks: 18, bushes: 50, toadstools: 40, flowers: 60 },
      spawn: { count: 9, kinds: ["gummy", "jellybean", "marshmallow", "macaron"], abilities: ["chaser", "runner", "jumper", "brute"] },
      portals: [
        { to: "meadow",  kind: "path", angle: 0.69 },   // back to the vale
        { to: "thicket", kind: "cave", angle: -1.9 },   // deeper, to the boss thicket
      ],
    },
    {
      id: "shore", name: "Saltmarsh Strand", icon: "🌊", level: 2, radius: 70,
      theme: { sky: "#bfe6ff", fog: "#bfe0ef", fogDensity: 0.009, ground: "#cdbb84",
               hemi: "#7a8a5a", sun: "#fff0d0", sunDir: [-0.6, -1, -0.2], expMul: 1.05 },
      scenery: { trees: 8, rocks: 26, bushes: 14, flowers: 30, palms: 22 },
      spawn: { count: 8, kinds: ["icecream", "donut", "lollipop", "candycane"], abilities: ["chaser", "runner", "shooter"] },
      portals: [
        { to: "meadow", kind: "bridge", angle: -2.43 }, // back to the vale
        { to: "caverns", kind: "cave",  angle: 0.3 },   // sea-cave to the crystal caverns
      ],
    },
    {
      id: "peaks", name: "Frostpeak Trail", icon: "⛰️", level: 4, radius: 66,
      theme: { sky: "#cfe0f5", fog: "#dfe9f7", fogDensity: 0.014, ground: "#dde7f2",
               hemi: "#8a99ad", sun: "#eef4ff", sunDir: [-0.4, -1, -0.45], expMul: 1.06, conMul: 1.05 },
      scenery: { trees: 22, rocks: 60, bushes: 8, crystals: 16, snow: true },
      spawn: { count: 9, kinds: ["candycane", "marshmallow", "chocbar", "pretzel"], abilities: ["chaser", "brute", "jumper", "shooter"] },
      portals: [
        { to: "meadow", kind: "path", angle: -0.7 },    // back to the vale
      ],
    },
    {
      id: "caverns", name: "Crystal Caverns", icon: "💎", level: 5, radius: 56, indoor: true,
      theme: { sky: "#160d28", fog: "#1a1030", fogDensity: 0.03, ground: "#2a2140",
               hemi: "#2a1f4a", sun: "#9a7aff", sunDir: [-0.2, -1, -0.3], expMul: 0.9, conMul: 1.14, shadowDark: 0.5 },
      scenery: { rocks: 70, crystals: 40, pillars: 18 },
      spawn: { count: 7, kinds: ["chocbar", "jellybean", "candycorn", "pretzel"], abilities: ["brute", "shooter", "bomber"] },
      boss: { archId: "stomper", name: "Cavern Gumlord",
              intro: "A colossal candy golem rules the Crystal Caverns. Bring it down!" },
      portals: [
        { to: "shore", kind: "cave", angle: 2.9 },      // back out to the strand
      ],
    },
    {
      id: "thicket", name: "Bramblewood Thicket", icon: "🐉", level: 6, radius: 54, indoor: true,
      theme: { sky: "#2a1c10", fog: "#21180e", fogDensity: 0.032, ground: "#2c3a1c",
               hemi: "#1c2a12", sun: "#c8b070", sunDir: [-0.3, -1, -0.55], expMul: 0.93, conMul: 1.1, shadowDark: 0.48 },
      scenery: { trees: 90, rocks: 20, bushes: 60, toadstools: 30 },
      spawn: { count: 8, kinds: ["gummy", "macaron", "jellybean", "marshmallow"], abilities: ["brute", "jumper", "shooter", "bomber"] },
      boss: { archId: "splitter", name: "Bramble Hydra",
              intro: "The Bramble Hydra coils in the deep thicket, splitting as it falls. End it!" },
      portals: [
        { to: "forest", kind: "cave", angle: 1.2 },     // back to the Whisperwood
      ],
    },
  ];
  const ZONE_BY_ID = {};
  for (const z of ZONES) ZONE_BY_ID[z.id] = z;
  const HUB_ZONE = "meadow";

  // =========================================================================
  // INTERNATIONALIZATION (i18n) — English + Russian, switchable live from the
  // start screen and the pause settings and persisted in localStorage.
  //
  // Two layers keep this maintainable and fully testable:
  //   1. LOCALES = { en, ru } — flat dictionaries of every UI / dynamic string,
  //      resolved through t(key, params) (with {placeholder} interpolation and
  //      en fallback). A key-parity test guarantees en and ru stay in lock-step.
  //   2. The DATA tables (items, zones, quests, NPCs, …) keep their English text
  //      as the source of truth; Russian lives in the parallel `RU` object and
  //      is read by the tData / resolver helpers, falling back to the English
  //      field. A completeness test walks the tables so no data string can ship
  //      untranslated.
  // Everything is headless-safe: localStorage is feature-detected, so the Node
  // harness simply stays in English.
  // =========================================================================
  const I18N = { locale: "en" };
  const LOCALE_KEY = "gg3d_locale";

  // localStorage isn't present in the headless harness / some privacy modes —
  // fail soft everywhere it's touched (mirrors sessionGet/Set used for saves).
  function localGet(k) {
    try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; }
    catch (e) { return null; }
  }
  function localSet(k, v) {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); } catch (e) {}
  }

  const LOCALES = {
    en: {
      // ---- boot / start screen ----
      "hint.loading": "Loading engine…",
      "hint.ready": "Ready!",
      "hint.errorPrefix": "Error: ",
      "start.tagline": "Run with Lily across a living island of <b>separate lands</b> — meadow vale, " +
        "whispering wood, salt shore, frostpeak trail and the boss lairs. <b>Roaming monsters</b> " +
        "guard each place and <b>respawn</b> over time; <b>travel</b> between lands through paths, " +
        "bridges and cave mouths. Follow the <b>chaptered main quest</b> (with optional <b>side quests</b>), " +
        "<b>gather &amp; craft</b>, raise a <b>castle</b> from five relics, then slay the <b>dragon</b> to win!",
      "start.startBtn": "Start Adventure",
      "start.loadBtn": "Load Progress",
      "settings.language": "Language",
      "ctrl.move": "Move", "ctrl.moveKeys": "WASD / Arrows · or the on-screen stick",
      "ctrl.attack": "Attack", "ctrl.attackKeys": "Space / F · or the ✨ button",
      "ctrl.interact": "Interact / talk / gather", "ctrl.interactKeys": "E · or the action button",
      "ctrl.inventory": "Inventory", "ctrl.inventoryKeys": "I · or the 🎒 button",
      "ctrl.craft": "Craft · Quests", "ctrl.craftKeys": "C · J · or the 🛠️ 📜 buttons",
      "ctrl.travel": "Travel", "ctrl.travelKeys": "walk into a path / bridge / cave portal",
      // ---- HUD button titles / aria ----
      "btnTitle.fullscreen": "Fullscreen", "btnAria.fullscreen": "Toggle fullscreen",
      "btnTitle.exitFullscreen": "Exit fullscreen",
      "btnTitle.menu": "Menu (Esc)", "btnAria.menu": "Open menu",
      "btnTitle.inventory": "Inventory (I)", "btnAria.inventory": "Open inventory",
      "btnTitle.crafting": "Crafting (C)", "btnAria.crafting": "Open crafting",
      "btnTitle.questLog": "Quest log (J)", "btnAria.questLog": "Open quest log",
      "btnTitle.muteMusic": "Mute music (M)", "btnTitle.playMusic": "Play music", "btnAria.music": "Toggle music",
      "prompt.pressE": "Press <b>E</b>",
      "prompt.withKey": "{label} · <b>E</b>",
      // ---- game over / victory ----
      "over.title": "Game Over 🍭",
      "over.tagline": "The wild monsters got you! You scored <b>{score}</b> and fell in <b>{where}</b>.",
      "over.replay": "Play Again",
      "win.title": "Victory! 🐉🏰",
      "win.tagline": "The castle stands and the <b>Ancient Dragon</b> is slain! Meadowgate is " +
        "saved. You finished with <b>{score}</b> points after felling <b>{kills}</b> monsters.",
      "win.replay": "Play Again",
      "win.ending": "<b>{title}</b><br>{text}",
      // ---- pause menu ----
      "pause.title": "Paused",
      "pause.stats": "Wave <b>{wave}</b> · Score <b>{score}</b>",
      "pause.resume": "Resume",
      "pause.save": "Save Progress",
      "pause.savedBtn": "Saved! 💾",
      "pause.restart": "Restart",
      "pause.exit": "Exit to Menu",
      "pause.confirmYes": "Yes",
      "pause.confirmNo": "Cancel",
      "pause.confirmRestart": "Restart the game? Your current progress will be lost unless you've saved it.",
      "pause.confirmExit": "Exit to the main menu? Your current progress will be lost unless you've saved it.",
      // ---- shop / inventory / anvil / crafting / castle / quest-log (static) ----
      "shop.title": "🧙 Travelling Merchant",
      "shop.tagline": "Buy weapons, armour &amp; accessories — or sell your spare gear.",
      "shop.coins": "coins",
      "shop.tabBuy": "Buy", "shop.tabRare": "✨ Rare", "shop.tabSell": "Sell",
      "shop.done": "Done",
      "shop.gear": "⚔️ Gear", "shop.potions": "🧪 Potions",
      "shop.rareNote": "✨ Rare wares — a fresh rotation every wave.",
      "shop.sellEmpty": "Your bag is empty. Unequip gear in your inventory (🎒) to sell it.",
      "inv.title": "🎒 Inventory &amp; Equipment",
      "inv.tagline": "Click a bag item to equip it; click an equipped slot to remove it.",
      "inv.done": "Done",
      "inv.twoHanded": "⟵ two-handed",
      "inv.unequipTitle": "Unequip {name}",
      "inv.empty": "{icon} empty",
      "inv.maxHealth": "❤ Max health",
      "inv.resist": "🛡️ Resist",
      "inv.speed": "👟 Speed",
      "inv.lifesteal": "🩸 Lifesteal",
      "inv.weapon": "⚔️ Weapon",
      "inv.damage": "💥 Damage",
      "inv.bag": "🎒 Bag ({n}/{cap})",
      "inv.bagEmpty": "Empty — buy gear from the merchant or beat a boss for rare loot.",
      "anvil.title": "🔨 Blacksmith",
      "anvil.tagline": "Enhance your weapons &amp; equipment. Rarer gear forges further and gains more per level.",
      "anvil.done": "Done",
      "anvil.empty": "No gear to enhance. Buy or loot some weapons and armour first.",
      "anvil.bag": "Bag",
      "anvil.max": "MAX",
      "craft.title": "🛠️ Crafting Bench",
      "craft.tagline": "Turn gathered materials into potions &amp; gear. Cut trees, mine rock, gather herbs and collect water across the land.",
      "craft.done": "Done",
      "castleui.title": "🏰 Build the Castle",
      "castleui.tagline": "Raise the castle from five relics. Find the relics through quests and exploration, then build each part in order.",
      "castleui.coins": "coins ·",
      "castleui.done": "Done",
      "questlog.title": "📜 Quest Log",
      "questlog.tagline": "Your <b>main story</b> runs in chapters across the lands — follow the tracker from one ❗ giver to the next. <b>Side quests</b> are optional bounties &amp; errands, listed separately.",
      "questlog.done": "Done",
      // ---- shared buttons ----
      "btn.buyCost": "🪙 {cost}",
      "btn.sellWorth": "Sell 🪙 {worth}",
      "btn.equip": "Equip",
      "btn.craft": "Craft 🛠️",
      "btn.needMats": "Need mats",
      "btn.build": "Build 🏰",
      "btn.built": "Built",
      "btn.locked": "Locked",
      "btn.close": "Close",
      "btn.farewell": "Farewell",
      "btn.continue": "Continue ▶",
      "btn.beginAdventure": "Begin the adventure ▶",
      "btn.turnInQuest": "Turn in: {title} ✅",
      "btn.acceptMain": "Accept: {title} 📜",
      "btn.acceptSide": "Accept: {title} 🔸",
      // ---- stat summary ----
      "stat.healthRestore": "❤️ +{n} health",
      "stat.buffWrap": "✨ {inner} ({t}s)",
      "stat.rangedArrow": "🏹 ranged",
      "stat.rangedBolt": "🔮 ranged",
      "stat.melee": "⚔️ melee",
      "stat.dmg": "{n} dmg",
      "stat.multishot": "×{n}",
      "stat.pierce": "pierce {n}",
      "stat.twoHanded": "2-handed",
      "stat.oneHanded": "1-handed",
      "stat.hp": "+{n} HP",
      "stat.resist": "+{n}% resist",
      "stat.speed": "+{n} speed",
      "stat.damageBonus": "+{n} dmg",
      "stat.haste": "+{n}% haste",
      "stat.lifestealBonus": "+{n} lifesteal",
      "stat.coinMagnet": "coin magnet",
      // ---- interactable labels ----
      "label.shop": "Shop",
      "label.blacksmith": "Blacksmith",
      "label.collectArtifact": "Collect artifact",
      "label.talkTo": "Talk to {name}",
      "label.turnIn": "✓ {name}: turn in",
      "label.newQuest": "❗ {name}: new quest",
      "label.buildCastle": "🏰 Build castle",
      "label.buildPart": "🏰 Build {part}",
      "label.castleNeed": "🏰 Castle (need {icon} {part})",
      "label.castleComplete": "🏰 Castle complete",
      // ---- objectives ----
      "obj.hunt": "Defeat sweets — {have}/{need}",
      "obj.gather": "Gather {icon} {label} — {have}/{need}",
      "obj.reach": "Reach {name}",
      "obj.talk": "Speak with {icon} {name}",
      "obj.defeatBoss": "Defeat 👑 {boss} in {zone}",
      "obj.build": "Raise the {part} at 🏰 Castle Hill",
      "obj.defeatDragon": "Slay the 🐉 Ancient Dragon",
      "obj.lairBoss": "the lair boss",
      "obj.doneMark": " ✓",
      // ---- guidance / story flow ----
      "guide.turnin": "Return to {giver} to turn in",
      "guide.accept": "Speak with {giver} at {place}",
      "guide.whereSuffix": " · {where}",
      "place.meadowgate": "Meadowgate",
      "quest.kindMission": "Mission",
      "quest.kindSide": "Side quest",
      // ---- dialogue ----
      "dlg.tagMission": "📜 Mission",
      "dlg.tagSide": "🔸 Side quest",
      "dlg.greetSettle": "Back already? Let's settle up.",
      "dlg.greetWorking": "Still on the job? Luck go with you.",
      "dlg.greetDone": "Thank you, hero — the vale owes you much.",
      "dlg.questLine": "{tag}: <b>{title}</b>",
      "dlg.readyTurnIn": " — ready to turn in!",
      "dlg.newMission": "📜 New mission: <b>{title}</b>",
      "dlg.sideQuest": "🔸 Side quest: <b>{title}</b>{rep}{done}",
      "dlg.repeatable": " (repeatable)",
      "dlg.doneTimes": " · done ×{n}",
      "dlg.story": "\"{story}\"",
      "dlg.reward": "Reward: {reward}",
      // ---- HUD trackers / bars / banners ----
      "qt.chapter": "Chapter {n} · {title}",
      "qt.missionTitle": "📜 {title}",
      "qt.sideTitle": "🔸 {title}",
      "qt.sideReturn": "✓ return to turn in",
      "buff.pill": "{icon} {label} <b>{n}s</b>",
      "potion.slotTitle": "{name} — {desc} (press {key})",
      "boss.barName": "👑 {name}",
      "banner.bossWave": "Wave {n} — 👑 {boss}!",
      "banner.sweepWave": "Wave {n} — {count} sweets!",
      "banner.theDragon": "The Dragon",
      "label.zone": "{icon} {name}",
      // ---- toasts ----
      "toast.fullHealth": "Already at full health",
      "toast.potionHeal": "{icon} +{heal} health",
      "toast.potionBuff": "{icon} {label}!",
      "toast.noMaterials": "Not enough materials",
      "toast.beltFull": "Potion belt full (3 kinds)",
      "toast.bagFull": "Bag full",
      "toast.crafted": "🛠️ Crafted {icon} {name}",
      "toast.gathered": "{icon} +{n} {label}",
      "toast.summonMinions": "👹 The Tyrant summons minions!",
      "toast.incomingBombs": "💣 Incoming bombs!",
      "toast.hydraSplits": "🦠 The Hydra splits!",
      "toast.partRaised": "🏰 {part} raised!",
      "toast.castleComplete": "🐉 The castle is complete... the DRAGON awakens!",
      "toast.dragonDives": "🐉 The dragon dives!",
      "toast.dragonBreath": "🔥 Dragon's breath!",
      "toast.artifact": "Artifact! +{score}{extra}",
      "toast.artifactHeal": " · +{n} ❤",
      "toast.artifactCoin": " · 🪙 +{n}",
      "toast.noCoins": "Not enough coins",
      "toast.bought": "{icon} Bought {name}",
      "toast.sold": "Sold {name} for 🪙 {worth}",
      "toast.maxEnhance": "Already at max enhancement",
      "toast.forged": "🔨 {name} forged!",
      "toast.questAccepted": "📜 {kind}: {title}",
      "toast.questComplete": "✅ {title} complete! {bits}",
      "toast.reached": "📍 Reached {name}",
      "toast.chapterBegin": "📖 Chapter {n}: {title}",
      "toast.lairIntro": "⚔️ {intro}",
      "toast.bossDefeated": "👑 {boss} defeated! Dropped {item}!",
      "toast.pickedUp": "✨ Picked up {item}!",
      "toast.bagFullDrop": "Bag full — drop something!",
      "toast.coinPickup": "🪙 +{n}",
      "toast.nothingToSave": "Nothing to save yet",
      "toast.saved": "Progress saved! 💾",
      "toast.saveFailed": "Save failed",
      "toast.invalidSave": "That file isn't a valid Good Game 3D save.",
      "toast.readError": "Couldn't read that file.",
      "toast.loaded": "Progress loaded! 🎮",
      // ---- castle build panel ----
      "castle.built": "✅ Built",
      "castle.lockedPrev": "🔒 Build the previous part first",
      "castle.needs": "Needs {relic} · {coins}",
      "castle.relicHave": "{icon} ✓",
      "castle.relicNeed": "{icon} {name} ✗",
      "castle.coinsHave": "🪙 {cost} ✓",
      "castle.coinsNeed": "🪙 {cost} ✗",
      "castle.complete": "The castle stands! The dragon stirs…",
      "castle.progress": "{built}/{total} {word} raised",
      "castle.partWord": { one: "part", other: "parts" },
      // ---- quest log ----
      "log.mainStory": "📜 Main Story",
      "log.sideQuests": "🔸 Side Quests",
      "log.now": "<b>Chapter {n}: {title}</b><br>{text}",
      "log.allDone": "The castle stands and the Ancient Dragon is slain — the vale is saved! 🏰🐉",
      "log.chapterRow": "{icon} Chapter {n}: {title}",
      "log.returnTo": " — return to {giver}",
      "log.speakAt": "Speak with {giver} at {place}",
      "log.sideNone": "None yet — visit the ❗ folk for optional bounties &amp; errands.",
      "log.sideFrom": "from {icon} {name}{ret} · reward {reward}",
      "log.sideReturn": " · return to turn in",
      "log.sideCompleted": "Completed side quests",
    },
    ru: {
      // ---- boot / start screen ----
      "hint.loading": "Загрузка движка…",
      "hint.ready": "Готово!",
      "hint.errorPrefix": "Ошибка: ",
      "start.tagline": "Бегите за Лили по живому острову из <b>отдельных земель</b> — луговая долина, " +
        "шепчущий лес, солёный берег, морозный перевал и логова боссов. <b>Бродячие монстры</b> " +
        "охраняют каждое место и со временем <b>возрождаются</b>; <b>путешествуйте</b> между землями по тропам, " +
        "мостам и пещерам. Следуйте за <b>главным сюжетом по главам</b> (и необязательными <b>побочными заданиями</b>), " +
        "<b>собирайте и мастерите</b>, возведите <b>замок</b> из пяти реликвий, а затем сразите <b>дракона</b> ради победы!",
      "start.startBtn": "Начать приключение",
      "start.loadBtn": "Загрузить прогресс",
      "settings.language": "Язык",
      "ctrl.move": "Движение", "ctrl.moveKeys": "WASD / стрелки · или экранный джойстик",
      "ctrl.attack": "Атака", "ctrl.attackKeys": "Пробел / F · или кнопка ✨",
      "ctrl.interact": "Действие / разговор / сбор", "ctrl.interactKeys": "E · или кнопка действия",
      "ctrl.inventory": "Инвентарь", "ctrl.inventoryKeys": "I · или кнопка 🎒",
      "ctrl.craft": "Ремесло · Задания", "ctrl.craftKeys": "C · J · или кнопки 🛠️ 📜",
      "ctrl.travel": "Путешествие", "ctrl.travelKeys": "войдите в тропу / мост / пещеру",
      // ---- HUD button titles / aria ----
      "btnTitle.fullscreen": "Во весь экран", "btnAria.fullscreen": "Переключить полноэкранный режим",
      "btnTitle.exitFullscreen": "Выйти из полноэкранного режима",
      "btnTitle.menu": "Меню (Esc)", "btnAria.menu": "Открыть меню",
      "btnTitle.inventory": "Инвентарь (I)", "btnAria.inventory": "Открыть инвентарь",
      "btnTitle.crafting": "Ремесло (C)", "btnAria.crafting": "Открыть ремесло",
      "btnTitle.questLog": "Журнал заданий (J)", "btnAria.questLog": "Открыть журнал заданий",
      "btnTitle.muteMusic": "Выключить музыку (M)", "btnTitle.playMusic": "Включить музыку", "btnAria.music": "Переключить музыку",
      "prompt.pressE": "Нажмите <b>E</b>",
      "prompt.withKey": "{label} · <b>E</b>",
      // ---- game over / victory ----
      "over.title": "Игра окончена 🍭",
      "over.tagline": "Дикие монстры одолели вас! Вы набрали <b>{score}</b> и пали в <b>{where}</b>.",
      "over.replay": "Играть снова",
      "win.title": "Победа! 🐉🏰",
      "win.tagline": "Замок стоит, а <b>Древний Дракон</b> повержен! Лугоград спасён. " +
        "Вы завершили с <b>{score}</b> очками, сразив <b>{kills}</b> монстров.",
      "win.replay": "Играть снова",
      "win.ending": "<b>{title}</b><br>{text}",
      // ---- pause menu ----
      "pause.title": "Пауза",
      "pause.stats": "Волна <b>{wave}</b> · Очки <b>{score}</b>",
      "pause.resume": "Продолжить",
      "pause.save": "Сохранить прогресс",
      "pause.savedBtn": "Сохранено! 💾",
      "pause.restart": "Заново",
      "pause.exit": "Выйти в меню",
      "pause.confirmYes": "Да",
      "pause.confirmNo": "Отмена",
      "pause.confirmRestart": "Начать игру заново? Текущий прогресс будет потерян, если вы его не сохранили.",
      "pause.confirmExit": "Выйти в главное меню? Текущий прогресс будет потерян, если вы его не сохранили.",
      // ---- shop / inventory / anvil / crafting / castle / quest-log (static) ----
      "shop.title": "🧙 Странствующий торговец",
      "shop.tagline": "Покупайте оружие, броню и аксессуары — или продавайте лишнее снаряжение.",
      "shop.coins": "монет",
      "shop.tabBuy": "Купить", "shop.tabRare": "✨ Редкое", "shop.tabSell": "Продать",
      "shop.done": "Готово",
      "shop.gear": "⚔️ Снаряжение", "shop.potions": "🧪 Зелья",
      "shop.rareNote": "✨ Редкие товары — обновляются каждую волну.",
      "shop.sellEmpty": "Ваша сумка пуста. Снимите снаряжение в инвентаре (🎒), чтобы продать его.",
      "inv.title": "🎒 Инвентарь и снаряжение",
      "inv.tagline": "Нажмите на предмет в сумке, чтобы надеть его; нажмите на занятый слот, чтобы снять.",
      "inv.done": "Готово",
      "inv.twoHanded": "⟵ двуручное",
      "inv.unequipTitle": "Снять: {name}",
      "inv.empty": "{icon} пусто",
      "inv.maxHealth": "❤ Макс. здоровье",
      "inv.resist": "🛡️ Защита",
      "inv.speed": "👟 Скорость",
      "inv.lifesteal": "🩸 Вампиризм",
      "inv.weapon": "⚔️ Оружие",
      "inv.damage": "💥 Урон",
      "inv.bag": "🎒 Сумка ({n}/{cap})",
      "inv.bagEmpty": "Пусто — купите снаряжение у торговца или одолейте босса ради редкой добычи.",
      "anvil.title": "🔨 Кузнец",
      "anvil.tagline": "Улучшайте оружие и снаряжение. Чем реже предмет, тем дальше его можно усилить и тем больше прирост за уровень.",
      "anvil.done": "Готово",
      "anvil.empty": "Нечего улучшать. Сначала купите или добудьте оружие и броню.",
      "anvil.bag": "Сумка",
      "anvil.max": "МАКС",
      "craft.title": "🛠️ Верстак",
      "craft.tagline": "Превращайте собранные материалы в зелья и снаряжение. Рубите деревья, добывайте камень, собирайте травы и воду по всей земле.",
      "craft.done": "Готово",
      "castleui.title": "🏰 Построить замок",
      "castleui.tagline": "Возведите замок из пяти реликвий. Добудьте реликвии заданиями и исследованием, затем стройте части по порядку.",
      "castleui.coins": "монет ·",
      "castleui.done": "Готово",
      "questlog.title": "📜 Журнал заданий",
      "questlog.tagline": "Ваш <b>главный сюжет</b> идёт по главам через земли — следуйте за трекером от одного ❗ дарителя к другому. <b>Побочные задания</b> — необязательные награды и поручения, перечислены отдельно.",
      "questlog.done": "Готово",
      // ---- shared buttons ----
      "btn.buyCost": "🪙 {cost}",
      "btn.sellWorth": "Продать 🪙 {worth}",
      "btn.equip": "Надеть",
      "btn.craft": "Создать 🛠️",
      "btn.needMats": "Нужны материалы",
      "btn.build": "Строить 🏰",
      "btn.built": "Готово",
      "btn.locked": "Закрыто",
      "btn.close": "Закрыть",
      "btn.farewell": "Прощайте",
      "btn.continue": "Продолжить ▶",
      "btn.beginAdventure": "Начать приключение ▶",
      "btn.turnInQuest": "Сдать: {title} ✅",
      "btn.acceptMain": "Принять: {title} 📜",
      "btn.acceptSide": "Принять: {title} 🔸",
      // ---- stat summary ----
      "stat.healthRestore": "❤️ +{n} здоровья",
      "stat.buffWrap": "✨ {inner} ({t}с)",
      "stat.rangedArrow": "🏹 дальний бой",
      "stat.rangedBolt": "🔮 дальний бой",
      "stat.melee": "⚔️ ближний бой",
      "stat.dmg": "{n} ур.",
      "stat.multishot": "×{n}",
      "stat.pierce": "пробой {n}",
      "stat.twoHanded": "двуручное",
      "stat.oneHanded": "одноручное",
      "stat.hp": "+{n} ОЗ",
      "stat.resist": "+{n}% защиты",
      "stat.speed": "+{n} скорости",
      "stat.damageBonus": "+{n} ур.",
      "stat.haste": "+{n}% скорости атаки",
      "stat.lifestealBonus": "+{n} вампиризма",
      "stat.coinMagnet": "магнит для монет",
      // ---- interactable labels ----
      "label.shop": "Торговец",
      "label.blacksmith": "Кузнец",
      "label.collectArtifact": "Подобрать артефакт",
      "label.talkTo": "Поговорить: {name}",
      "label.turnIn": "✓ {name}: сдать",
      "label.newQuest": "❗ {name}: новое задание",
      "label.buildCastle": "🏰 Строить замок",
      "label.buildPart": "🏰 Строить: {part}",
      "label.castleNeed": "🏰 Замок (нужно {icon} {part})",
      "label.castleComplete": "🏰 Замок достроен",
      // ---- objectives ----
      "obj.hunt": "Победите сладости — {have}/{need}",
      "obj.gather": "Соберите {icon} {label} — {have}/{need}",
      "obj.reach": "Дойдите до {name}",
      "obj.talk": "Поговорите с {icon} {name}",
      "obj.defeatBoss": "Одолейте 👑 {boss} в {zone}",
      "obj.build": "Возведите {part} на 🏰 Замковом холме",
      "obj.defeatDragon": "Сразите 🐉 Древнего Дракона",
      "obj.lairBoss": "босса логова",
      "obj.doneMark": " ✓",
      // ---- guidance / story flow ----
      "guide.turnin": "Вернитесь к {giver}, чтобы сдать",
      "guide.accept": "Поговорите с {giver} в {place}",
      "guide.whereSuffix": " · {where}",
      "place.meadowgate": "Лугоград",
      "quest.kindMission": "Задание",
      "quest.kindSide": "Побочное задание",
      // ---- dialogue ----
      "dlg.tagMission": "📜 Задание",
      "dlg.tagSide": "🔸 Побочное задание",
      "dlg.greetSettle": "Уже вернулись? Давайте рассчитаемся.",
      "dlg.greetWorking": "Всё ещё за делом? Удачи вам.",
      "dlg.greetDone": "Спасибо, герой — долина в долгу перед вами.",
      "dlg.questLine": "{tag}: <b>{title}</b>",
      "dlg.readyTurnIn": " — можно сдавать!",
      "dlg.newMission": "📜 Новое задание: <b>{title}</b>",
      "dlg.sideQuest": "🔸 Побочное задание: <b>{title}</b>{rep}{done}",
      "dlg.repeatable": " (повторяемое)",
      "dlg.doneTimes": " · сдано ×{n}",
      "dlg.story": "«{story}»",
      "dlg.reward": "Награда: {reward}",
      // ---- HUD trackers / bars / banners ----
      "qt.chapter": "Глава {n} · {title}",
      "qt.missionTitle": "📜 {title}",
      "qt.sideTitle": "🔸 {title}",
      "qt.sideReturn": "✓ вернитесь, чтобы сдать",
      "buff.pill": "{icon} {label} <b>{n}с</b>",
      "potion.slotTitle": "{name} — {desc} (нажмите {key})",
      "boss.barName": "👑 {name}",
      "banner.bossWave": "Волна {n} — 👑 {boss}!",
      "banner.sweepWave": "Волна {n} — сладостей: {count}!",
      "banner.theDragon": "Дракон",
      "label.zone": "{icon} {name}",
      // ---- toasts ----
      "toast.fullHealth": "Здоровье уже полное",
      "toast.potionHeal": "{icon} +{heal} здоровья",
      "toast.potionBuff": "{icon} {label}!",
      "toast.noMaterials": "Недостаточно материалов",
      "toast.beltFull": "Пояс зелий полон (3 вида)",
      "toast.bagFull": "Сумка полна",
      "toast.crafted": "🛠️ Создано: {icon} {name}",
      "toast.gathered": "{icon} +{n} {label}",
      "toast.summonMinions": "👹 Тиран призывает прислужников!",
      "toast.incomingBombs": "💣 Летят бомбы!",
      "toast.hydraSplits": "🦠 Гидра делится!",
      "toast.partRaised": "🏰 {part} возведена!",
      "toast.castleComplete": "🐉 Замок достроен... ДРАКОН пробуждается!",
      "toast.dragonDives": "🐉 Дракон пикирует!",
      "toast.dragonBreath": "🔥 Дыхание дракона!",
      "toast.artifact": "Артефакт! +{score}{extra}",
      "toast.artifactHeal": " · +{n} ❤",
      "toast.artifactCoin": " · 🪙 +{n}",
      "toast.noCoins": "Недостаточно монет",
      "toast.bought": "{icon} Куплено: {name}",
      "toast.sold": "Продано: {name} за 🪙 {worth}",
      "toast.maxEnhance": "Уже максимальное улучшение",
      "toast.forged": "🔨 {name} выковано!",
      "toast.questAccepted": "📜 {kind}: {title}",
      "toast.questComplete": "✅ {title} — выполнено! {bits}",
      "toast.reached": "📍 Достигнуто: {name}",
      "toast.chapterBegin": "📖 Глава {n}: {title}",
      "toast.lairIntro": "⚔️ {intro}",
      "toast.bossDefeated": "👑 {boss} повержен! Выпало: {item}!",
      "toast.pickedUp": "✨ Подобрано: {item}!",
      "toast.bagFullDrop": "Сумка полна — что-нибудь выбросьте!",
      "toast.coinPickup": "🪙 +{n}",
      "toast.nothingToSave": "Пока нечего сохранять",
      "toast.saved": "Прогресс сохранён! 💾",
      "toast.saveFailed": "Не удалось сохранить",
      "toast.invalidSave": "Этот файл не является сохранением Good Game 3D.",
      "toast.readError": "Не удалось прочитать файл.",
      "toast.loaded": "Прогресс загружен! 🎮",
      // ---- castle build panel ----
      "castle.built": "✅ Построено",
      "castle.lockedPrev": "🔒 Сначала постройте предыдущую часть",
      "castle.needs": "Нужно {relic} · {coins}",
      "castle.relicHave": "{icon} ✓",
      "castle.relicNeed": "{icon} {name} ✗",
      "castle.coinsHave": "🪙 {cost} ✓",
      "castle.coinsNeed": "🪙 {cost} ✗",
      "castle.complete": "Замок стоит! Дракон пробуждается…",
      "castle.progress": "{word}: {built}/{total}",
      "castle.partWord": { one: "Возведена часть", few: "Возведено частей", many: "Возведено частей" },
      // ---- quest log ----
      "log.mainStory": "📜 Главный сюжет",
      "log.sideQuests": "🔸 Побочные задания",
      "log.now": "<b>Глава {n}: {title}</b><br>{text}",
      "log.allDone": "Замок стоит, а Древний Дракон повержен — долина спасена! 🏰🐉",
      "log.chapterRow": "{icon} Глава {n}: {title}",
      "log.returnTo": " — вернитесь к {giver}",
      "log.speakAt": "Поговорите с {giver} в {place}",
      "log.sideNone": "Пока ничего — навестите ❗ людей ради необязательных наград и поручений.",
      "log.sideFrom": "от {icon} {name}{ret} · награда {reward}",
      "log.sideReturn": " · вернитесь, чтобы сдать",
      "log.sideCompleted": "Выполненные побочные задания",
    },
  };

  // Russian translations for the DATA tables (English stays in the tables as the
  // source + fallback). Keyed by the same ids the tables use. A completeness
  // test walks the tables and fails if any of these is missing.
  const RU = {
    item: {
      magic_wand: { name: "Волшебная палочка", desc: "Надёжный метатель зарядов." },
      short_bow: { name: "Короткий лук", desc: "Двуручный. Быстрые пробивающие стрелы, летящие по дуге." },
      apprentice_staff: { name: "Посох ученика", desc: "Двуручный. Бьёт веером из 3 зарядов." },
      iron_dagger: { name: "Железный кинжал", desc: "Одноручный. Быстрые короткие удары — хорош в паре." },
      iron_sword: { name: "Железный меч", desc: "Одноручный. Сбалансированный удар ближнего боя." },
      war_axe: { name: "Боевой топор", desc: "Одноручный. Медленный, но тяжёлый, с широким взмахом." },
      leather_cap: { name: "Кожаный шлем", desc: "+15 к макс. здоровью." },
      iron_helm: { name: "Железный шлем", desc: "+25 здоровья, +4% защиты." },
      leather_vest: { name: "Кожаный жилет", desc: "+20 здоровья, +4% защиты." },
      iron_plate: { name: "Железные латы", desc: "+35 здоровья, +10% защиты." },
      leather_boots: { name: "Кожаные сапоги", desc: "+0,8 к скорости." },
      iron_greaves: { name: "Железные поножи", desc: "+0,4 скорости, +5% защиты." },
      amulet_vigor: { name: "Амулет бодрости", desc: "+25 к макс. здоровью." },
      coin_amulet: { name: "Подвеска-магнит", desc: "Притягивает монеты издалека." },
      ring_power: { name: "Кольцо мощи", desc: "+1 к урону оружия." },
      ring_swift: { name: "Кольцо проворства", desc: "Атака на 12% быстрее." },
      ring_guard: { name: "Кольцо защиты", desc: "+6% к сопротивлению урону." },
      excalibur: { name: "Экскалибур", desc: "Двуручный меч. Разрушительный широкий взмах." },
      storm_bow: { name: "Грозовой лук", desc: "Двуручный. Выпускает 3 пробивающие стрелы." },
      archmage_wand: { name: "Жезл архимага", desc: "Одноручный. Буря из 3 пробивающих зарядов." },
      twin_fang: { name: "Клинок-клык", desc: "Одноручный. Стремительные удары, крадущие жизнь." },
      thunder_hammer: { name: "Громовой молот", desc: "Двуручный. Сокрушительный, с огромным взмахом." },
      dragon_helm: { name: "Драконий шлем", desc: "+40 здоровья, +10% защиты." },
      aegis_plate: { name: "Латы Эгиды", desc: "+55 здоровья, +16% защиты." },
      winged_boots: { name: "Крылатые сапоги", desc: "+1,4 скорости, +5% защиты." },
      vampiric_ring: { name: "Вампирское кольцо", desc: "+3 к здоровью за убийство." },
      titan_pendant: { name: "Подвеска титана", desc: "+45 здоровья, +8% защиты, +2 урона." },
      void_scythe: { name: "Коса пустоты", desc: "Двуручная. Жатва по дуге, крадущая жизнь." },
      sunfire_staff: { name: "Посох солнечного огня", desc: "Двуручный. Палящий веер из 5 зарядов." },
      phoenix_plate: { name: "Латы феникса", desc: "+75 здоровья, +20% защиты." },
      seraph_ring: { name: "Кольцо серафима", desc: "+3 урона, +5 вампиризма." },
      world_ender: { name: "Крушитель миров", desc: "Двуручный. Катастрофическое, всё сметающее разрушение." },
      astral_bow: { name: "Астральный лук", desc: "Двуручный. Буря из 5 пробивающих стрел." },
      crown_eternal: { name: "Вечная корона", desc: "+90 здоровья, +18% защиты, +3 урона." },
      minor_potion: { name: "Малое зелье здоровья", desc: "Восстанавливает 30 здоровья." },
      health_potion: { name: "Зелье здоровья", desc: "Восстанавливает 65 здоровья." },
      greater_potion: { name: "Большое зелье здоровья", desc: "Восстанавливает 140 здоровья." },
      elixir_might: { name: "Эликсир мощи", desc: "+4 урона на 18 с.", label: "Мощь" },
      elixir_swift: { name: "Эликсир проворства", desc: "+2,5 скорости на 18 с.", label: "Проворство" },
      fists: { name: "Кулаки" },
    },
    rarity: { normal: "Обычное", rare: "Редкое", epic: "Эпическое", legendary: "Легендарное" },
    slot: { helmet: "Шлем", breastplate: "Нагрудник", boots: "Сапоги", necklace: "Ожерелье",
            ring: "Кольцо", hand1: "Основная рука", hand2: "Вторая рука" },
    material: { wood: "Дерево", stone: "Камень", water: "Вода", herb: "Трава", fiber: "Волокно", crystal: "Кристалл" },
    resource: { tree: "Срубить дерево", rock: "Добыть камень", herb: "Собрать травы",
                water: "Набрать воды", fiber: "Срезать волокна", crystal: "Добыть кристалл" },
    relic: {
      relic_foundation: { name: "Камень основания", desc: "Огромный краеугольный камень, испещрённый рунами." },
      relic_walls: { name: "Руны стен", desc: "Камни, помнящие, как стоять стенами." },
      relic_towers: { name: "Кристалл башен", desc: "Кристалл, что поёт шпили в бытие." },
      relic_gate: { name: "Ключ от золотых врат", desc: "Великий ключ, что творит несокрушимые врата." },
      relic_keep: { name: "Печать дракона", desc: "Печать старой цитадели — и внимание дракона." },
    },
    castlePart: {
      foundation: { name: "Основание", desc: "Заложите великий краеугольный камень." },
      walls: { name: "Стены", desc: "Возведите крепостные стены." },
      towers: { name: "Башни", desc: "Сотворите угловые шпили." },
      gate: { name: "Надвратная башня", desc: "Навесьте золотые врата." },
      keep: { name: "Цитадель", desc: "Увенчайте цитадель — и разбудите дракона." },
    },
    boss: {
      charger: "Желейный король", caster: "Шоколадный властелин", summoner: "Леденцовый тиран",
      stomper: "Кексовый колосс", bomber: "Военачальник-карамель", splitter: "Желатиновая гидра",
    },
    lairBoss: { caverns: "Подземельный Гамлорд", thicket: "Колючая Гидра" },
    lairIntro: {
      caverns: "Колоссальный конфетный голем правит Хрустальными пещерами. Сразите его!",
      thicket: "Колючая Гидра свернулась в глубокой чаще, делясь, когда падает. Покончите с ней!",
    },
    zone: {
      meadow: "Долина Лугоград", forest: "Глубь Шепчущего леса", shore: "Соляное побережье",
      peaks: "Морозная тропа", caverns: "Хрустальные пещеры", thicket: "Колючая чаща",
    },
    location: {
      village: "Деревня Лугоград", grove: "Роща Шепчущего леса", seaside: "Соляной берег",
      mountain: "Морозный перевал", ruins: "Затонувшие руины", castle: "Замковый холм",
    },
    npc: {
      mayor: { name: "Мэр Слива", intro: "Лугоград осаждают живые сладости! Говорят, когда-то долину защищал замок. Помогите нам возвести его вновь, герой." },
      herbalist: { name: "Мудрая Ива", intro: "Шепчущий лес щедр к тем, кто умеет слушать. Собирайте со мной, и я поделюсь старыми тайнами." },
      fisher: { name: "Старый Брин", intro: "Ха! Сухопутный гость на моём берегу. Море хранит Кристалл башен — заслужите его, и он ваш." },
      smith2: { name: "Праматерь-кузнец Това", intro: "Морозное железо — лучшее из всех. Докажите силу руки, и я выкую вам Ключ от врат." },
      hermit: { name: "Отшельник", intro: "Ищете Печать дракона? Немногие готовы. Сначала поговорите с мэром, затем возвращайтесь ко мне." },
    },
    quest: {
      m_cull: { title: "Привкус битвы", story: "Истребите сладости, рыщущие по нашим полям, и покажите долине, что есть надежда.", where: "Долина Лугоград" },
      m_cornerstone: { title: "Краеугольный камень", story: "Камень основания лежит в Затонувших руинах на востоке. Отыщите его." },
      m_foundation: { title: "Заложить краеугольный камень", story: "Отнесите Камень основания на Замковый холм и заложите наш краеугольный камень." },
      m_poultice: { title: "Зелёные руки", story: "Соберите травы в роще, чтобы я мог варить припарки для ополчения.", where: "Роща Шепчущего леса" },
      m_stone: { title: "Камни для стен", story: "Стенам нужен добрый камень. Добудьте его в холмах и высоких скалах.", where: "Морозный перевал и холмы" },
      m_walls: { title: "Возвести валы", story: "С Рунами стен в руках возведите наши крепостные стены." },
      m_water: { title: "Свежая вода", story: "Принесите чистой воды из реки для моих сетей, и я расскажу вам о глубоких пещерах.", where: "Река и Соляное побережье" },
      m_caverns: { title: "Глубины внизу", story: "Конфетный голем хранит Кристалл башен в Хрустальных пещерах, через морскую пещеру за моим берегом. Покончите с ним!", where: "Хрустальные пещеры (через Соляное побережье)" },
      m_towers: { title: "Сотворить шпили", story: "Впойте Кристалл башен в угловые шпили замка." },
      m_ore: { title: "Руда для горна", story: "Принесите мне кристалл из высоких скал, чтобы разжечь горн.", where: "Морозная тропа" },
      m_gatekey: { title: "Золотые врата", story: "Перебейте сладости, бродящие по морозному перевалу, и заберите выкованный Ключ от врат.", where: "Морозная тропа" },
      m_gate: { title: "Навесить золотые врата", story: "Навесьте золотые врата и запечатайте наши стены." },
      m_word: { title: "Слово из долины", story: "Поговорите с мэром Сливой, чтобы он поручился за вас, затем возвращайтесь ко мне." },
      m_thicket: { title: "Сердце чащи", story: "Колючая Гидра свернулась в глубокой чаще за Шепчущим лесом. Вырвите её сердце — и Печать дракона ваша.", where: "Колючая чаща (через Шепчущий лес)" },
      m_keep: { title: "Увенчать цитадель", story: "Установите Печать дракона и увенчайте цитадель — хотя это наверняка разбудит зверя внизу." },
      m_dragon: { title: "Сразить Древнего Дракона", story: "Древний Дракон пробудился. Встретьте его перед новым замком и положите конец долгой осаде.", where: "Замковый холм" },
      sq_pests: { title: "Борьба с вредителями", story: "Сладости всё забредают на площадь. Проредите их — за это есть монеты, и так часто, как пожелаете." },
      sq_supplies: { title: "Запасы целителя", story: "Пополните мои полки травами, и я выделю вам тоник." },
      sq_nets: { title: "Починить сети", story: "Мои сети в лохмотьях. Принесите волокно, и я с вами поделюсь." },
      sq_forgefuel: { title: "Топливо для горна", story: "Горн жаждет кристалла. Накормите его и заберите этот клинок." },
      sq_relics: { title: "Испытания павших", story: "Докажите свою сталь против дикой стаи и заслужите мой старый оберег." },
      sq_wilds: { title: "Проредить дикарей", story: "За дикие сладости назначена постоянная награда — приносите подсчёт в любое время." },
    },
    chapter: {
      ch1: { title: "Долина в осаде", blurb: "Ответьте на зов Лугограда и заложите первый камень замка." },
      ch2: { title: "Камень и сталь", blurb: "Закалите ополчение и возведите крепостные стены." },
      ch3: { title: "Хрустальный прилив", blurb: "Дерзните в морские пещеры за Кристаллом башен." },
      ch4: { title: "Золотые врата", blurb: "Выкуйте Ключ от врат в огне Морозного перевала." },
      ch5: { title: "Печать дракона", blurb: "Завладейте Печатью дракона, увенчайте цитадель и покончите со зверем." },
    },
    story: {
      title: "Замок Лугограда",
      introTitle: "📜 Сказание о Лугограде",
      introText: "Давным-давно великий замок защищал эту долину — пока он не рухнул, и земли не наполнились живыми сладостями. " +
        "Вы — Лили, герой, о котором молился Лугоград. Соберите пять утраченных реликвий, возведите замок заново и " +
        "встретьте Древнего Дракона, что спит под цитаделью. " +
        "Следуйте за светящимися ❗ людьми и трекером заданий — каждое дело ведёт к следующему. Долина в ваших руках.",
      endingTitle: "🏰 Рассвет над долиной",
      endingText: "Древний Дракон повержен, и замок стоит увенчанный навстречу рассвету. Сладости разбегаются по диким землям, " +
        "жители Лугограда распахивают двери, и ваше имя воспевают от рощи до берега. Долина спасена — отлично, герой.",
    },
    weather: { clear: "Ясно", cloudy: "Облачно", fog: "Туман", rain: "Дождь", storm: "Гроза" },
    dragon: { name: "Древний Дракон" },
  };

  // {placeholder} interpolation; missing params are left intact so a bad key is
  // visible rather than silently blanked.
  function interp(s, p) {
    return s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null) ? String(p[k]) : m);
  }
  // The core lookup: current locale → English fallback → the key itself.
  function t(key, params) {
    const L = LOCALES[I18N.locale] || LOCALES.en;
    let s = (L && L[key] != null) ? L[key] : LOCALES.en[key];
    if (s == null) s = key;
    return (params && typeof s === "string") ? interp(s, params) : s;
  }
  // Pick a plural form. English: one/other; Russian: one/few/many by the usual
  // Slavic rule. `forms` is e.g. { one, few, many } (or { one, other } for en).
  function plural(n, forms) {
    if (I18N.locale === "ru") {
      const a = n % 10, b = n % 100;
      if (a === 1 && b !== 11) return forms.one;
      if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return forms.few != null ? forms.few : forms.many;
      return forms.many != null ? forms.many : forms.one;
    }
    return n === 1 ? forms.one : (forms.other != null ? forms.other : forms.many);
  }

  // ---- Data-table resolvers (RU override → English table field) -------------
  const _ruGroup = (g) => (I18N.locale === "ru" && RU[g]) ? RU[g] : null;
  function tField(group, id, field, fallback) {
    const g = _ruGroup(group); const e = g && g[id];
    return (e && e[field] != null) ? e[field] : fallback;
  }
  function tFlat(group, id, fallback) {
    const g = _ruGroup(group);
    return (g && g[id] != null) ? g[id] : fallback;
  }
  const tItemName = (d) => d ? tField("item", d.id, "name", d.name) : "";
  const tItemDesc = (d) => d ? tField("item", d.id, "desc", d.desc || "") : "";
  const tPotionLabel = (id) => {
    const d = getDef(id); const base = (d && d.potion && d.potion.label) || (d && d.name) || id;
    return tField("item", id, "label", base);
  };
  const tRarityLabel = (r) => tFlat("rarity", r, (RARITY[r] || RARITY.normal).label);
  const tSlotLabel = (slot) => tFlat("slot", (slot === "ring1" || slot === "ring2") ? "ring" : slot, (SLOT_META[slot] || {}).label || slot);
  const tMaterialLabel = (id) => tFlat("material", id, (MATERIALS[id] || {}).label || id);
  const tResourceLabel = (k) => tFlat("resource", k, (RESOURCE_KINDS[k] || {}).label || k);
  const tRelicName = (id) => tField("relic", id, "name", (RELICS[id] || {}).name || id);
  const tCastlePartName = (id) => tField("castlePart", id, "name", (CASTLE_PART_BY_ID[id] || {}).name || id);
  const tCastlePartDesc = (id) => tField("castlePart", id, "desc", (CASTLE_PART_BY_ID[id] || {}).desc || "");
  const tZoneName = (z) => z ? tFlat("zone", z.id, z.name) : "";
  const tLocationName = (id) => tFlat("location", id, (LOCATION_BY_ID[id] || {}).name || id);
  const tNpcName = (id) => tField("npc", id, "name", (NPC_BY_ID[id] || {}).name || id);
  const tNpcIntro = (id) => tField("npc", id, "intro", (NPC_BY_ID[id] || {}).intro || "");
  const tQuestTitle = (q) => tField("quest", q.id, "title", q.title);
  const tQuestStory = (q) => tField("quest", q.id, "story", q.story);
  const tQuestWhere = (q) => q.where ? tField("quest", q.id, "where", q.where) : "";
  const tChapterTitle = (id) => tField("chapter", id, "title", (CHAPTER_BY_ID[id] || {}).title || id);
  const tChapterBlurb = (id) => tField("chapter", id, "blurb", (CHAPTER_BY_ID[id] || {}).blurb || "");
  const tWeatherLabel = (s) => tFlat("weather", s, (Weather.STATES[s] || {}).label || s);
  const tDragonName = () => (I18N.locale === "ru" && RU.dragon) ? RU.dragon.name : "Ancient Dragon";
  const _ruStory = (field) => (I18N.locale === "ru" && RU.story && RU.story[field] != null) ? RU.story[field] : null;
  const tStoryTitle = () => _ruStory("title") || STORY.title;
  const tStoryIntroTitle = () => _ruStory("introTitle") || STORY.intro.title;
  const tStoryIntroText = () => _ruStory("introText") || STORY.intro.text;
  const tStoryEndingTitle = () => _ruStory("endingTitle") || STORY.ending.title;
  const tStoryEndingText = () => _ruStory("endingText") || STORY.ending.text;
  // The lair-boss name comes from the zone table (English) with an RU override.
  const tLairBossName = (zoneId) => {
    const z = ZONE_BY_ID[zoneId]; const base = (z && z.boss) ? z.boss.name : t("obj.lairBoss");
    return tFlat("lairBoss", zoneId, base);
  };
  const tLairBossIntro = (zoneId) => {
    const z = ZONE_BY_ID[zoneId]; const base = (z && z.boss) ? z.boss.intro : "";
    return tFlat("lairIntro", zoneId, base);
  };
  // A boss's display name in the current locale (dragon / lair override / archetype).
  function bossDisplayName(boss) {
    if (!boss) return "";
    if (boss.isDragon) return tDragonName();
    if (boss.lairZoneId) return tLairBossName(boss.lairZoneId);
    if (boss.archId) return tFlat("boss", boss.archId, (BOSS_ARCH_BY_ID[boss.archId] || {}).name || boss.name);
    return boss.name;
  }

  // ---- Live locale apply + persistence ----------------------------------
  // Walk the static [data-i18n*] markup and refresh it. Feature-detected so the
  // headless harness (no querySelectorAll) simply skips it.
  function applyStaticI18n() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    try {
      document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
      document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
      document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.getAttribute("data-i18n-title")); });
      document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    } catch (e) {}
  }

  // Re-render everything currently on screen in the active locale, then persist.
  function applyLocale(loc, persist) {
    if (loc && LOCALES[loc]) I18N.locale = loc;
    if (persist !== false) localSet(LOCALE_KEY, I18N.locale);
    try { if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = I18N.locale; } catch (e) {}
    applyStaticI18n();
    _syncLangButtons();
    // Once the engine is ready the start hint reads "Ready!" — keep that on switch.
    if (dom.loadHint && dom.startBtn && dom.startBtn.disabled === false) dom.loadHint.textContent = t("hint.ready");
    // Dynamic HUD + any open overlay (all guarded — null before the scene boots).
    if (typeof playerRef !== "undefined" && playerRef) {
      recomputeStats(playerRef);            // rebuilds the weapon's display name
      updateMaterialsHud(playerRef);
      updateRelicHud(playerRef);
      updatePotionBar(playerRef);
    }
    if (typeof stateRef !== "undefined" && stateRef) {
      updateLocationHud(ZONE_BY_ID[stateRef.zoneId]);
      updateCoins(stateRef);
      const liveBoss = stateRef.dragon || stateRef.boss;
      if (liveBoss && liveBoss.alive) showBossBar(liveBoss);
    }
    updateQuestTracker();
    if (typeof Weather !== "undefined" && Weather.STATES[Weather.state]) updateWeatherHud(tWeatherLabel(Weather.state), Weather.STATES[Weather.state].icon);
    if (typeof DayNight !== "undefined") updateClock(DayNight.t, DayNight.phase);
    if (typeof Shop !== "undefined" && Shop.open) Shop.render();
    if (typeof Inventory !== "undefined" && Inventory.open) Inventory.render();
    if (typeof Anvil !== "undefined" && Anvil.open) Anvil.render();
    if (typeof Crafting !== "undefined" && Crafting.open) Crafting.render();
    if (typeof CastleUI !== "undefined" && CastleUI.open) CastleUI.render();
    if (typeof QuestLog !== "undefined" && QuestLog.open) QuestLog.render();
    if (typeof Dialogue !== "undefined" && Dialogue.open && Dialogue.npc) Dialogue.render();
    if (typeof Pause !== "undefined" && typeof paused !== "undefined" && paused) Pause.refreshTexts();
    if (typeof Music !== "undefined" && dom.musicBtn) dom.musicBtn.title = t(Music.on ? "btnTitle.muteMusic" : "btnTitle.playMusic");
    if (typeof Fullscreen !== "undefined" && Fullscreen.sync) Fullscreen.sync();
  }

  // Highlight the active language in both selectors (start screen + pause).
  function _syncLangButtons() {
    const set = (el, on) => { if (el && el.classList) el.classList.toggle("active", on); };
    set(dom.langEn, I18N.locale === "en"); set(dom.langRu, I18N.locale === "ru");
    set(dom.langEnPause, I18N.locale === "en"); set(dom.langRuPause, I18N.locale === "ru");
  }

  // A monotonically increasing id so inventory/equipment entries are distinct
  // even when two of the same item are owned.
  let _instSeq = 1;
  function makeItem(id) { return { id, uid: _instSeq++ }; }

  function cloneWeapon(w) {
    const c = Object.assign({}, w);
    if (w.melee) c.melee = Object.assign({}, w.melee);
    return c;
  }

  // Build the player's *active* weapon profile from whatever is in their hands,
  // folding in flat bonuses (damage/haste/pierce) from armour and accessories.
  function computeWeapon(player, bonus) {
    const eq = player.equipment;
    const i1 = eq.hand1 && eq.hand1 !== TWO_HANDED ? eq.hand1 : null;
    const i2 = eq.hand2 && eq.hand2 !== TWO_HANDED ? eq.hand2 : null;
    const w1 = i1 ? getDef(i1.id) : null;
    const w2 = i2 ? getDef(i2.id) : null;
    const m1 = i1 ? enhanceMult(w1, instLevel(i1)) : 1;
    const m2 = i2 ? enhanceMult(w2, instLevel(i2)) : 1;
    let prof = null, name = null;
    if (w1 && w1.weapon) { prof = cloneWeapon(w1.weapon); prof.damage *= m1; name = enhanceName(tItemName(w1), instLevel(i1)); }
    else if (w2 && w2.weapon) { prof = cloneWeapon(w2.weapon); prof.damage *= m2; name = enhanceName(tItemName(w2), instLevel(i2)); }
    if (!prof) { prof = cloneWeapon(FISTS); name = tItemName(FISTS); }

    // Dual-wielding two one-handed weapons: faster, with bonus power/shots.
    const dual = w1 && w2 && w1.weapon && w2.weapon;
    if (dual) {
      prof.cooldown *= 0.8;
      prof.damage += (w2.weapon.damage || 0) * 0.5 * m2;
      if (prof.ranged && w2.weapon.ranged) prof.multishot = (prof.multishot || 1) + (w2.weapon.multishot || 1);
      name = `${enhanceName(tItemName(w1), instLevel(i1))} + ${enhanceName(tItemName(w2), instLevel(i2))}`;
    }

    prof.damage += bonus.damage;
    prof.pierce = (prof.pierce || 0) + bonus.pierce;
    prof.cooldown = Math.max(0.08, prof.cooldown * bonus.haste);
    prof.multishot = prof.multishot || 1;
    prof.name = name;
    return prof;
  }

  // Recompute every derived player stat from base + equipped gear. Called after
  // any equip/unequip and on load. Also widens the global coin magnet ranges.
  function recomputeStats(player) {
    const base = player.base;
    let mh = base.maxHealth, dr = 0, ls = 0, spd = base.speed;
    let dmg = 0, haste = 1, pierce = 0, coinRange = 0;
    for (const slot of EQUIP_SLOTS) {
      const inst = player.equipment[slot];
      if (!inst || inst === TWO_HANDED) continue;
      const s = effectiveStats(inst);
      mh += s.maxHealth || 0; dr += s.damageReduction || 0; ls += s.lifesteal || 0;
      spd += s.moveSpeed || 0; dmg += s.damage || 0; pierce += s.pierce || 0;
      coinRange += s.coinRange || 0;
      if (s.haste) haste *= s.haste;
    }
    // Fold in any active potion buffs (Elixir of Might / Swiftness, …).
    for (const b of player.buffs || []) {
      const s = b.stats || {};
      mh += s.maxHealth || 0; dr += s.damageReduction || 0; ls += s.lifesteal || 0;
      spd += s.moveSpeed || 0; dmg += s.damage || 0; pierce += s.pierce || 0;
      if (s.haste) haste *= s.haste;
    }
    player.maxHealth = mh;
    if (player.health > mh) player.health = mh;
    player.damageReduction = Math.min(0.75, dr);
    player.lifesteal = ls;
    player.speed = spd;
    player.weapon = computeWeapon(player, { damage: dmg, haste, pierce });
    if (player.refreshWeaponVisual) player.refreshWeaponVisual();
    coinMagnetRange = CONFIG.coinMagnetRange + coinRange;
    coinPickupRange = CONFIG.coinPickupRange + coinRange * 0.18;
    updateHealthBar(player.health);
  }

  // ---- Inventory / equipment operations ----------------------------------
  function invRemove(player, inst) {
    const i = player.inventory.indexOf(inst);
    if (i >= 0) player.inventory.splice(i, 1);
  }
  function invAdd(player, inst) {
    if (player.inventory.length >= player.invCap) return false;
    player.inventory.push(inst);
    return true;
  }
  // Move whatever occupies a slot back into the bag. For a two-handed weapon
  // (held in hand1) this also clears the hand2 sentinel.
  function unequipSlot(player, slot) {
    const occ = player.equipment[slot];
    if (!occ || occ === TWO_HANDED) return;
    player.equipment[slot] = null;
    if (slot === "hand1" && player.equipment.hand2 === TWO_HANDED) player.equipment.hand2 = null;
    if (slot === "hand2" && player.equipment.hand1 === TWO_HANDED) player.equipment.hand1 = null;
    invAdd(player, occ);
  }
  function equipItem(player, inst) {
    const d = getDef(inst.id);
    invRemove(player, inst);
    if (d.type === "weapon") {
      if (d.hands === 2) {
        unequipSlot(player, "hand1"); unequipSlot(player, "hand2");
        player.equipment.hand1 = inst; player.equipment.hand2 = TWO_HANDED;
      } else {
        if (player.equipment.hand2 === TWO_HANDED) unequipSlot(player, "hand1"); // free a 2H
        let slot;
        if (!player.equipment.hand1) slot = "hand1";
        else if (!player.equipment.hand2) slot = "hand2";
        else slot = "hand1"; // both full → replace main hand
        unequipSlot(player, slot);
        player.equipment[slot] = inst;
      }
    } else if (d.type === "ring") {
      const slot = !player.equipment.ring1 ? "ring1" : !player.equipment.ring2 ? "ring2" : "ring1";
      unequipSlot(player, slot);
      player.equipment[slot] = inst;
    } else {
      unequipSlot(player, d.type);
      player.equipment[d.type] = inst;
    }
    recomputeStats(player);
  }

  // ---- Potion belt + buffs ----------------------------------------------
  // The belt is a fixed array of up to POTION_SLOTS stacks, each { id, count }
  // of a single potion kind. Buying a potion fills/stacks it; using one quaffs
  // the top of a stack and applies its effect (instant heal or a timed buff).
  const POTION_SLOTS = 3;
  const POTION_STACK_MAX = 9;

  function potionAdd(player, id) {
    const belt = player.potions;
    for (const s of belt) {
      if (s && s.id === id && s.count < POTION_STACK_MAX) { s.count++; return true; }
    }
    for (let i = 0; i < belt.length; i++) {
      if (!belt[i]) { belt[i] = { id, count: 1 }; return true; }
    }
    return false; // belt full (3 different kinds already, none stackable)
  }

  function potionUse(player, slot) {
    const s = player.potions[slot];
    if (!s || s.count <= 0 || player.health <= 0) return false;
    const def = getDef(s.id);
    const p = def.potion || {};
    if (p.heal) {
      if (player.health >= player.maxHealth) { toast(t("toast.fullHealth")); return false; }
      player.health = Math.min(player.maxHealth, player.health + p.heal);
      updateHealthBar(player.health);
      toast(t("toast.potionHeal", { icon: def.icon, heal: p.heal }));
    } else if (p.buff) {
      applyBuff(player, { id: s.id, label: p.label || def.name, stats: p.buff, time: p.time || 12 });
      toast(t("toast.potionBuff", { icon: def.icon, label: tPotionLabel(s.id) }));
    }
    if (typeof Sfx !== "undefined") Sfx.play("potion");
    s.count--;
    if (s.count <= 0) player.potions[slot] = null;
    recomputeStats(player);
    updatePotionBar(player);
    return true;
  }

  // Apply (or refresh) a timed buff, then recompute stats so it takes effect.
  function applyBuff(player, buff) {
    const existing = (player.buffs || []).find((b) => b.id === buff.id);
    if (existing) { existing.time = buff.time; }
    else { player.buffs.push({ id: buff.id, label: buff.label, stats: buff.stats, time: buff.time }); }
  }

  // Tick active buffs down; drop the expired ones and recompute when one ends.
  function updateBuffs(player, dt) {
    if (!player.buffs || player.buffs.length === 0) return;
    let changed = false;
    for (let i = player.buffs.length - 1; i >= 0; i--) {
      player.buffs[i].time -= dt;
      if (player.buffs[i].time <= 0) { player.buffs.splice(i, 1); changed = true; }
    }
    if (changed) recomputeStats(player);
    updateBuffBar(player); // refresh the countdown each frame while buffs run
  }

  // ---- Crafting materials -------------------------------------------------
  function addMaterial(player, mat, n) {
    if (!(mat in player.materials)) player.materials[mat] = 0;
    player.materials[mat] += n;
    updateMaterialsHud(player);
    Quests.onGather(player, mat, n);
  }
  function hasMaterials(player, mats) {
    for (const k in mats) if ((player.materials[k] || 0) < mats[k]) return false;
    return true;
  }
  function spendMaterials(player, mats) {
    if (!hasMaterials(player, mats)) return false;
    for (const k in mats) player.materials[k] -= mats[k];
    updateMaterialsHud(player);
    return true;
  }
  // A short "3 🪵 · 2 💧" summary of a material cost map.
  function matSummary(mats) {
    return Object.keys(mats).map((k) => `${mats[k]} ${(MATERIALS[k] || {}).icon || k}`).join(" · ");
  }

  // ---- Castle relics ------------------------------------------------------
  function addRelic(player, id) {
    if (!RELICS[id]) return;
    if (!player.relics.includes(id)) player.relics.push(id);
    updateRelicHud(player);
  }
  const hasRelic = (player, id) => player.relics.includes(id);

  // ---- Crafting -----------------------------------------------------------
  // Spend a recipe's materials to produce its output (a potion → belt, or gear
  // → bag). Returns true on success.
  function craftRecipe(player, recipe) {
    const def = getDef(recipe.out);
    if (!def) return false;
    if (!hasMaterials(player, recipe.mats)) { toast(t("toast.noMaterials")); Sfx.play("error"); return false; }
    if (def.type === "potion") {
      if (!potionAdd(player, recipe.out)) { toast(t("toast.beltFull")); Sfx.play("error"); return false; }
    } else {
      if (player.inventory.length >= player.invCap) { toast(t("toast.bagFull")); Sfx.play("error"); return false; }
      invAdd(player, makeItem(recipe.out));
    }
    spendMaterials(player, recipe.mats);
    updatePotionBar(player);
    Sfx.play("enhance");
    toast(t("toast.crafted", { icon: def.icon, name: tItemName(def) }));
    Quests.onCraft(player, recipe.out);
    return true;
  }

  // ---- Quest reward payout (coins / material / gear item / castle relic). ----
  function grantReward(player, state, reward) {
    if (!reward) return;
    if (reward.coins) { state.coins += reward.coins; updateCoins(state); }
    if (reward.mats) for (const k in reward.mats) addMaterial(player, k, reward.mats[k]);
    if (reward.item && getDef(reward.item)) {
      const d = getDef(reward.item);
      if (d.type === "potion") potionAdd(player, reward.item);
      else invAdd(player, makeItem(reward.item));
      updatePotionBar(player);
    }
    if (reward.relic) addRelic(player, reward.relic);
  }

  // ---- DOM ---------------------------------------------------------------
  const dom = {
    canvas: document.getElementById("renderCanvas"),
    overlay: document.getElementById("overlay"),
    startBtn: document.getElementById("startBtn"),
    loadHint: document.getElementById("loadHint"),
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    coins: document.getElementById("coins"),
    monsters: document.getElementById("monsters"),
    shop: document.getElementById("shop"),
    shopClose: document.getElementById("shopClose"),
    shopDone: document.getElementById("shopDone"),
    shopCoins: document.getElementById("shopCoins"),
    shopItems: document.getElementById("shopItems"),
    shopTabBuy: document.getElementById("shopTabBuy"),
    shopTabRare: document.getElementById("shopTabRare"),
    shopTabSell: document.getElementById("shopTabSell"),
    // Blacksmith / anvil overlay.
    anvil: document.getElementById("anvil"),
    anvilClose: document.getElementById("anvilClose"),
    anvilDone: document.getElementById("anvilDone"),
    anvilCoins: document.getElementById("anvilCoins"),
    anvilItems: document.getElementById("anvilItems"),
    // Potion belt + active-buff pills.
    potionBar: document.getElementById("potionBar"),
    buffBar: document.getElementById("buffBar"),
    // Inventory / equipment overlay.
    inventory: document.getElementById("inventory"),
    invClose: document.getElementById("invClose"),
    invDone: document.getElementById("invDone"),
    invEquip: document.getElementById("invEquip"),
    invBag: document.getElementById("invBag"),
    invStats: document.getElementById("invStats"),
    invBtn: document.getElementById("invBtn"),
    bagBtn: document.getElementById("bagBtn"),
    musicBtn: document.getElementById("musicBtn"),
    healthFill: document.getElementById("healthFill"),
    bossBar: document.getElementById("bossBar"),
    bossName: document.getElementById("bossName"),
    bossFill: document.getElementById("bossFill"),
    waveBanner: document.getElementById("waveBanner"),
    location: document.getElementById("location"),
    zoneFade: document.getElementById("zoneFade"),
    zoneFadeLabel: document.getElementById("zoneFadeLabel"),
    prompt: document.getElementById("prompt"),
    toast: document.getElementById("toast"),
    over: document.getElementById("over"),
    overText: document.getElementById("overText"),
    replayBtn: document.getElementById("replayBtn"),
    touch: document.getElementById("touch"),
    joystick: document.getElementById("joystick"),
    stick: document.getElementById("stick"),
    actionBtn: document.getElementById("actionBtn"),
    castBtn: document.getElementById("castBtn"),
    fsBtn: document.getElementById("fsBtn"),
    // Start-screen "Load progress".
    loadBtn: document.getElementById("loadBtn"),
    loadFile: document.getElementById("loadFile"),
    // In-game pause menu + its confirmation dialog.
    pauseBtn: document.getElementById("pauseBtn"),
    pauseMenu: document.getElementById("pauseMenu"),
    resumeBtn: document.getElementById("resumeBtn"),
    saveBtn: document.getElementById("saveBtn"),
    restartBtn: document.getElementById("restartBtn"),
    exitBtn: document.getElementById("exitBtn"),
    pauseStats: document.getElementById("pauseStats"),
    // ---- Language selectors (start screen + pause settings) ----
    langEn: document.getElementById("langEn"),
    langRu: document.getElementById("langRu"),
    langEnPause: document.getElementById("langEnPause"),
    langRuPause: document.getElementById("langRuPause"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmText: document.getElementById("confirmText"),
    confirmYes: document.getElementById("confirmYes"),
    confirmNo: document.getElementById("confirmNo"),
    // ---- Adventure HUD: materials pouch, relics, quest tracker, clock, weather ----
    materialsBar: document.getElementById("materialsBar"),
    relicBar: document.getElementById("relicBar"),
    questTracker: document.getElementById("questTracker"),
    clock: document.getElementById("clock"),
    weather: document.getElementById("weather"),
    craftBtn: document.getElementById("craftBtn"),
    questBtn: document.getElementById("questBtn"),
    // ---- Victory screen ----
    win: document.getElementById("win"),
    winText: document.getElementById("winText"),
    winStory: document.getElementById("winStory"),
    winReplayBtn: document.getElementById("winReplayBtn"),
    // ---- NPC dialogue overlay ----
    dialogue: document.getElementById("dialogue"),
    dlgName: document.getElementById("dlgName"),
    dlgText: document.getElementById("dlgText"),
    dlgActions: document.getElementById("dlgActions"),
    dlgClose: document.getElementById("dlgClose"),
    // ---- Crafting overlay ----
    crafting: document.getElementById("crafting"),
    craftMats: document.getElementById("craftMats"),
    craftItems: document.getElementById("craftItems"),
    craftClose: document.getElementById("craftClose"),
    craftDone: document.getElementById("craftDone"),
    // ---- Castle build overlay ----
    castle: document.getElementById("castle"),
    castleCoins: document.getElementById("castleCoins"),
    castleItems: document.getElementById("castleItems"),
    castleProgress: document.getElementById("castleProgress"),
    castleClose: document.getElementById("castleClose"),
    castleDone: document.getElementById("castleDone"),
    // ---- Quest log overlay ----
    questLog: document.getElementById("questLog"),
    questLogItems: document.getElementById("questLogItems"),
    questLogClose: document.getElementById("questLogClose"),
    questLogDone: document.getElementById("questLogDone"),
  };

  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  const engine = new BABYLON.Engine(dom.canvas, true, { stencil: true, adaptToDeviceRatio: true });

  let gameStarted = false;   // gameplay (waves, monsters) waits on the start screen
  let uiPaused = false;      // true while a blocking menu (the shop) is open
  let paused = false;        // true while the in-game pause menu is open
  let waveSystem = null;     // the active SpawnDirector for the current zone
  let zoneManager = null;    // streams zones in/out as the player travels
  let playerRef = null;      // the Player (so HUD helpers can read max health)
  // Live handles to the running game, captured in createScene so the save/load
  // and pause systems can read and rebuild the world.
  let sceneRef = null, worldRef = null, interactionRef = null, stateRef = null, cameraRef = null;
  let postFX = null;             // session-level tone-mapping / bloom / SSAO handles

  // Coin pickup/magnet ranges live here (not in the frozen CONFIG) so the shop's
  // "Lodestone" upgrade can widen them at runtime.
  let coinMagnetRange = CONFIG.coinMagnetRange;
  let coinPickupRange = CONFIG.coinPickupRange;

  // =========================================================================
  // Input
  // =========================================================================
  const Input = {
    keys: Object.create(null),
    joy: { x: 0, y: 0, active: false },
    interactQueued: false,
    castHeld: false,         // fire is continuous while held (respecting cooldown)

    init() {
      window.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (e.code === "KeyE") { this.interactQueued = true; e.preventDefault(); }
        if (e.code === "Space" || e.code === "KeyF") { this.castHeld = true; e.preventDefault(); }
      });
      window.addEventListener("keyup", (e) => {
        this.keys[e.code] = false;
        if (e.code === "Space" || e.code === "KeyF") this.castHeld = false;
      });
      if (isTouch) this._initJoystick();
    },

    _initJoystick() {
      const base = dom.joystick, radius = 50;
      let pointerId = null;
      const setStick = (dx, dy) => {
        const len = Math.hypot(dx, dy) || 1;
        const c = Math.min(len, radius);
        const nx = (dx / len) * c, ny = (dy / len) * c;
        dom.stick.style.transform = `translate(${nx}px, ${ny}px)`;
        this.joy.x = nx / radius; this.joy.y = -ny / radius; this.joy.active = true;
      };
      const reset = () => {
        dom.stick.style.transform = "translate(0,0)";
        this.joy.x = this.joy.y = 0; this.joy.active = false; pointerId = null;
      };
      base.addEventListener("pointerdown", (e) => {
        pointerId = e.pointerId; base.setPointerCapture(pointerId);
        const r = base.getBoundingClientRect();
        setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); e.preventDefault();
      });
      base.addEventListener("pointermove", (e) => {
        if (e.pointerId !== pointerId) return;
        const r = base.getBoundingClientRect();
        setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      });
      base.addEventListener("pointerup", reset);
      base.addEventListener("pointercancel", reset);
      dom.actionBtn.addEventListener("pointerdown", (e) => { this.interactQueued = true; e.preventDefault(); });
      const castOn = (e) => { this.castHeld = true; e.preventDefault(); };
      const castOff = () => { this.castHeld = false; };
      dom.castBtn.addEventListener("pointerdown", castOn);
      dom.castBtn.addEventListener("pointerup", castOff);
      dom.castBtn.addEventListener("pointercancel", castOff);
      dom.castBtn.addEventListener("pointerleave", castOff);
    },

    moveVector() {
      let x = 0, z = 0;
      if (this.keys["KeyW"] || this.keys["ArrowUp"]) z += 1;
      if (this.keys["KeyS"] || this.keys["ArrowDown"]) z -= 1;
      if (this.keys["KeyD"] || this.keys["ArrowRight"]) x += 1;
      if (this.keys["KeyA"] || this.keys["ArrowLeft"]) x -= 1;
      if (this.joy.active) { x += this.joy.x; z += this.joy.y; }
      return { x, z };
    },
    consumeInteract() { const v = this.interactQueued; this.interactQueued = false; return v; },
    wantsCast() { return this.castHeld; },
  };

  // =========================================================================
  // Interaction
  // =========================================================================
  class Interactable {
    constructor(node, { label, range = CONFIG.interactRange, onInteract }) {
      this.node = node; this.label = label; this.range = range;
      this.onInteract = onInteract; this.enabled = true;
    }
    get position() { return this.node.getAbsolutePosition(); }
    distanceTo(p) { return BABYLON.Vector3.Distance(this.position, p); }
  }

  class InteractionSystem {
    constructor() { this.items = []; this.current = null; }
    register(it) { this.items.push(it); return it; }
    remove(it) {
      const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1);
      if (this.current === it) this.current = null;
    }
    // Drop every registered interactable (used when streaming out a zone).
    clear() { this.items.length = 0; this.current = null; if (dom.prompt) dom.prompt.classList.add("hidden"); }
    update(playerPos) {
      let best = null, bestDist = Infinity;
      for (const it of this.items) {
        if (!it.enabled) continue;
        const d = it.distanceTo(playerPos);
        if (d <= it.range && d < bestDist) { best = it; bestDist = d; }
      }
      this.current = best;
      if (best) {
        dom.prompt.classList.remove("hidden");
        dom.prompt.innerHTML = isTouch ? best.label : t("prompt.withKey", { label: best.label });
      } else dom.prompt.classList.add("hidden");
    }
    trigger() { if (this.current && this.current.onInteract) this.current.onInteract(this.current); }
  }

  // =========================================================================
  // Player — Lily, with a magic wand, casting, locomotion + pick-up states.
  // =========================================================================
  class Player {
    constructor(scene, shadow) {
      this.scene = scene;
      this.speed = CONFIG.moveSpeed;
      this.facing = Math.PI;     // yaw
      this.walkPhase = 0;
      this.state = "idle";       // "idle" | "walk" | "pickup"
      this.pickT = 0;            // 0..1 progress through the pick-up animation
      this.pendingItem = null;   // mesh being picked up
      this.onPicked = null;      // callback once the relic reaches the hands
      this.carried = null;       // collectible mesh that flies up + poofs
      this.castCooldown = 0;     // counts down to 0 when ready to cast
      this.castAnim = 0;         // 0..1 quick wand-thrust animation
      // Base stats before any gear. recomputeStats() layers equipment on top.
      this.base = { maxHealth: CONFIG.maxHealth, speed: CONFIG.moveSpeed };
      this.maxHealth = CONFIG.maxHealth;
      this.health = CONFIG.maxHealth;
      this.damageReduction = 0;  // 0..0.75, summed from armour/accessories
      this.lifesteal = 0;        // HP restored per sweet defeated
      this.world = null;         // set after construction; used for scenery collision

      // Inventory + equipment. The active weapon profile (this.weapon) is
      // derived from the equipped hands by recomputeStats(); FISTS until then.
      this.invCap = 24;
      this.inventory = [];       // owned-but-unequipped item instances
      this.equipment = { helmet: null, breastplate: null, boots: null,
                         necklace: null, ring1: null, ring2: null, hand1: null, hand2: null };
      this.potions = [null, null, null]; // the 3-slot potion belt
      this.buffs = [];           // active timed potion buffs
      this.weapon = cloneWeapon(FISTS);

      // Adventure state: gathered crafting materials + collected castle relics.
      this.materials = {};       // { wood: n, stone: n, … }
      for (const id of MATERIAL_IDS) this.materials[id] = 0;
      this.relics = [];          // relic ids collected but not yet built in

      this._build(scene, shadow);
    }

    // Give the player their starting gear: a Magic Wand in hand, a Leather Cap
    // and Iron Dagger in the bag to try out the inventory immediately.
    setupStartingLoadout() {
      this.equipment.hand1 = makeItem("magic_wand");
      this.inventory.push(makeItem("leather_cap"));
      this.inventory.push(makeItem("iron_dagger"));
      // A couple of starter potions so the belt is useful from the first wave.
      potionAdd(this, "minor_potion");
      potionAdd(this, "minor_potion");
      recomputeStats(this);
    }

    _build(scene, shadow) {
      const root = new BABYLON.TransformNode("lily", scene);
      this.root = root;

      const yaw = new BABYLON.TransformNode("lilyYaw", scene); // rotates to face travel dir
      yaw.parent = root; this.yaw = yaw;

      const lean = new BABYLON.TransformNode("lilyLean", scene); // tilts for pick-up
      lean.parent = yaw; this.lean = lean;

      const skin = emat(scene, "skin", "#ffd9b8", 0.12);
      const hair = emat(scene, "hair", "#6b3f2a", 0.1);
      const dress = emat(scene, "dress", "#e0457f", 0.18);
      const dressDark = emat(scene, "dressDark", "#b5366a", 0.15);
      const shoe = emat(scene, "shoe", "#3a2a55", 0.1);
      const eyeMat = emat(scene, "eye", "#2a2a3a", 0);

      const add = (m, parent) => { m.parent = parent; shadow.addShadowCaster(m); return m; };

      // Skirt (cone) + torso give a "girl in a dress" silhouette.
      add(cone(scene, "skirt", 0.95, 0.5, 0.55, dressDark), lean).position.y = 0.78;
      add(cyl(scene, "torso", 0.45, 0.55, 0.7, dress), lean).position.y = 1.18;

      const head = add(sphere(scene, "head", 0.5, skin), lean); head.position.y = 1.75;
      const hairBack = add(sphere(scene, "hairBack", 0.56, hair), lean);
      hairBack.position.set(0, 1.8, -0.05); hairBack.scaling.set(1, 1.05, 1);
      const fringe = add(sphere(scene, "fringe", 0.5, hair), lean);
      fringe.position.set(0, 1.92, 0.04); fringe.scaling.set(1, 0.6, 1);

      // Ponytails ride on their own pivots at the back of the head so they can
      // swing with the stride (added in _animateLocomotion) — a touch of life.
      this.tails = [];
      for (const s of [-1, 1]) {
        const tp = new BABYLON.TransformNode("tailP" + s, scene);
        tp.parent = lean; tp.position.set(0.27 * s, 2.02, -0.04);
        const tail = add(sphere(scene, "tail", 0.22, hair), tp);
        tail.position.set(0, -0.18, 0); tail.scaling.set(1, 1.7, 1);
        this.tails.push(tp);
        const eye = add(sphere(scene, "eye", 0.08, eyeMat), lean);
        eye.position.set(0.1 * s, 1.76, 0.23);
      }

      // Limbs on pivots so they can swing.
      const limb = (name, pivotY, x, material, len) => {
        const pivot = new BABYLON.TransformNode(name + "P", scene);
        pivot.parent = lean; pivot.position.set(x, pivotY, 0);
        const m = capsule(scene, name, len, 0.1, material);
        m.parent = pivot; m.position.y = -len / 2; shadow.addShadowCaster(m);
        return pivot;
      };
      this.armL = limb("armL", 1.45, -0.32, dress, 0.6);
      this.armR = limb("armR", 1.45, 0.32, dress, 0.6);
      this.legL = limb("legL", 0.7, -0.14, skin, 0.6);
      this.legR = limb("legR", 0.7, 0.14, skin, 0.6);
      // Little hands at the ends of the arms so the silhouette reads as a person.
      for (const arm of [this.armL, this.armR]) {
        const hand = add(sphere(scene, "hand", 0.17, skin), arm);
        hand.position.y = -0.62;
      }
      // Shoes parented to the leg pivots so the feet swing with the stride.
      this.shoes = [];
      for (const pivot of [this.legL, this.legR]) {
        const sh = add(box(scene, "shoe", 0.22, 0.14, 0.34, shoe), pivot);
        sh.position.set(0, -0.62, 0.06); this.shoes.push(sh);
      }

      // ---- The MAGIC WAND, held in the right hand. ----
      this._buildWand(scene, shadow);

      // Where carried collectibles sit (above the hands / head).
      this.carryAnchor = new BABYLON.TransformNode("carry", scene);
      this.carryAnchor.parent = lean; this.carryAnchor.position.set(0, 2.35, 0.1);

      // Soft blob shadow.
      const blob = disc(scene, "blob", 0.6, emat(scene, "blob", "#000000", 0));
      blob.material.alpha = 0.28; blob.rotation.x = Math.PI / 2; blob.position.y = 0.02;
      blob.parent = root; blob.isPickable = false;

      root.position.set(0, 0, 12);
    }

    _buildWand(scene, shadow) {
      // Parent the wand to the right arm so it swings with the hand.
      const grip = new BABYLON.TransformNode("wandGrip", scene);
      grip.parent = this.armR; grip.position.set(0, -0.58, 0.12); // at the hand
      grip.rotation.x = -0.5; // angle the wand slightly forward/up
      this.wandGrip = grip;

      const handleMat = emat(scene, "wandHandle", "#5a3a8a", 0.05);
      const handle = cyl(scene, "wandHandle", 0.07, 0.05, 0.95, handleMat);
      handle.parent = grip; handle.position.y = 0.35; shadow.addShadowCaster(handle);

      // Glowing crystal star at the tip.
      const crystalMat = gloss(emat(scene, "wandCrystal", "#9fd0ff", 1.0), 0.2, 0.1);
      const crystal = BABYLON.MeshBuilder.CreatePolyhedron("wandCrystal", { type: 2, size: 0.16 }, scene);
      crystal.material = crystalMat; crystal.parent = grip; crystal.position.y = 0.9;
      this.wandCrystal = crystal;

      // A soft halo around the crystal.
      const halo = sphere(scene, "wandHalo", 0.34, emat(scene, "wandHaloM", "#9fd0ff", 1.0));
      halo.material.alpha = 0.22; halo.parent = grip; halo.position.y = 0.9; halo.isPickable = false;
      this.wandHalo = halo;

      // The point bolts launch from.
      const tip = new BABYLON.TransformNode("wandTip", scene);
      tip.parent = grip; tip.position.y = 1.02;
      this.wandTip = tip;

      // A little light so the wand actually glows on nearby surfaces.
      const glow = new BABYLON.PointLight("wandGlow", new BABYLON.Vector3(0, 0, 0), scene);
      glow.parent = tip; glow.diffuse = BABYLON.Color3.FromHexString("#9fd0ff");
      glow.intensity = 0.5; glow.range = 6;
      this.wandGlow = glow;

      // ---- Alternate held weapons, toggled by refreshWeaponVisual(). ----
      // A melee blade (sword/axe/hammer share this silhouette, recoloured).
      const bladeMat = gloss(emat(scene, "heldBlade", "#d7dde6", 0.06), 0.34, 0.35);
      const blade = box(scene, "heldBlade", 0.12, 1.1, 0.03, bladeMat);
      blade.parent = grip; blade.position.y = 0.7; shadow.addShadowCaster(blade);
      const guard = box(scene, "heldGuard", 0.42, 0.1, 0.1, emat(scene, "heldGuardM", "#8a6a3a", 0.05));
      guard.parent = grip; guard.position.y = 0.18;
      this.heldBladeMat = bladeMat;
      this.meleeMesh = new BABYLON.TransformNode("meleeMesh", scene);
      blade.parent = this.meleeMesh; guard.parent = this.meleeMesh;
      this.meleeMesh.parent = grip;

      // A bow (a thin arc + string) for ranged "arrow" weapons.
      const bowMat = emat(scene, "heldBow", "#9a6a3a", 0.05);
      const bow = BABYLON.MeshBuilder.CreateTorus("heldBow", { diameter: 1.1, thickness: 0.07, tessellation: 12 }, scene);
      bow.material = bowMat; bow.rotation.x = Math.PI / 2; bow.position.y = 0.55;
      const bowMesh = new BABYLON.TransformNode("bowMesh", scene);
      bow.parent = bowMesh; bowMesh.parent = grip; shadow.addShadowCaster(bow);
      this.bowMesh = bowMesh; this.bowMat = bowMat;

      this.refreshWeaponVisual();
    }

    // Show the mesh that matches the active weapon and tint it to its colour.
    refreshWeaponVisual() {
      const w = this.weapon || FISTS;
      const ranged = !!w.ranged;
      const isArrow = ranged && w.shape === "arrow";
      const isBolt = ranged && !isArrow;
      const col = w.color || "#bfe3ff";
      if (this.wandCrystal) this.wandCrystal.setEnabled(isBolt);
      if (this.wandHalo) this.wandHalo.setEnabled(isBolt);
      if (this.meleeMesh) this.meleeMesh.setEnabled(!ranged);
      if (this.bowMesh) this.bowMesh.setEnabled(isArrow);
      // The handle stays for wand/melee; hide it for the bow.
      try {
        const c = BABYLON.Color3.FromHexString(col);
        if (this.wandCrystal && this.wandCrystal.material) { this.wandCrystal.material.diffuseColor = c; this.wandCrystal.material.emissiveColor = c.scale(1.0); }
        if (this.wandHalo && this.wandHalo.material) this.wandHalo.material.emissiveColor = c;
        if (this.wandGlow) this.wandGlow.diffuse = c;
        if (this.heldBladeMat) this.heldBladeMat.diffuseColor = c;
      } catch (e) { /* hex parse can fail in the headless stub */ }
    }

    startPickup(itemMesh, onPicked) {
      this.state = "pickup"; this.pickT = 0;
      this.pendingItem = itemMesh; this.onPicked = onPicked;
    }
    get busy() { return this.state === "pickup"; }

    // Trigger an attack with the active weapon. Returns a descriptor the loop
    // turns into projectiles or a melee sweep, or null if on cooldown / busy.
    //   ranged → { type:"ranged", shots:[{origin,dir}], weapon }
    //   melee  → { type:"melee", origin, dir, weapon }
    tryCast() {
      if (this.castCooldown > 0 || this.busy) return null;
      const w = this.weapon;
      this.castCooldown = w.cooldown;
      this.castAnim = 1;
      if (!w.ranged) {
        this.meleeAnim = 1; // drives the swing animation
        const dir = new BABYLON.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).normalize();
        return { type: "melee", origin: this.root.position.clone(), dir, weapon: w };
      }
      const origin = this.wandTip.getAbsolutePosition().clone();
      const n = Math.max(1, w.multishot);
      const shots = [];
      for (let i = 0; i < n; i++) {
        // Fan the bolts symmetrically around the facing direction.
        const offset = n === 1 ? 0 : (i - (n - 1) / 2) * w.spread;
        const ang = this.facing + offset;
        // A tiny upward arc reads better than a flat shot.
        const dir = new BABYLON.Vector3(Math.sin(ang), 0.04, Math.cos(ang)).normalize();
        shots.push({ origin: origin.clone(), dir });
      }
      return { type: "ranged", shots, weapon: w };
    }

    update(dt, camera) {
      if (this.castCooldown > 0) this.castCooldown -= dt;
      if (this.castAnim > 0) this.castAnim = Math.max(0, this.castAnim - dt / 0.22);
      if (this.meleeAnim > 0) this.meleeAnim = Math.max(0, this.meleeAnim - dt / 0.26);

      if (this.state === "pickup") { this._updatePickup(dt); }
      else { this._updateMove(dt, camera); }

      // A melee swing arcs the whole arm across the body; a ranged cast thrusts
      // the wand forward. Both layer on top of the locomotion pose.
      if (this.meleeAnim > 0) {
        const sw = Math.sin(this.meleeAnim * Math.PI); // 0->1->0
        this.armR.rotation.x = lerp(this.armR.rotation.x, -1.4, sw);
        this.armR.rotation.z = lerp(this.armR.rotation.z || 0, 1.1 * sw, 0.6);
      } else if (this.castAnim > 0) {
        const thrust = Math.sin(this.castAnim * Math.PI); // 0->1->0
        this.armR.rotation.x = lerp(this.armR.rotation.x, -1.9, thrust);
      }
      // Pulse the wand crystal.
      const pulse = 0.85 + Math.sin(performance.now() / 120) * 0.15;
      this.wandHalo.scaling.setAll(pulse);
      this.wandGlow.intensity = 0.4 + (this.castAnim > 0 ? 0.8 : 0) + pulse * 0.1;

      this.yaw.rotation.y = this.facing;
    }

    _updateMove(dt, camera) {
      const input = Input.moveVector();
      const mag = Math.min(1, Math.hypot(input.x, input.z));
      if (mag > 0.05) {
        // Camera-relative movement. For an ArcRotateCamera the view direction
        // (camera -> target) on the XZ plane is -(cos a, sin a); screen-right is
        // (-sin a, cos a). Using these makes "up" on the stick go into the screen
        // and "right" go right, on both touch and keyboard.
        const a = camera.alpha;
        const fwd = new BABYLON.Vector3(-Math.cos(a), 0, -Math.sin(a));
        const right = new BABYLON.Vector3(-Math.sin(a), 0, Math.cos(a));
        const dir = fwd.scale(input.z).add(right.scale(input.x));
        if (dir.lengthSquared() > 1e-4) {
          dir.normalize();
          const cur = this.root.position;
          const desired = cur.add(dir.scale(this.speed * mag * dt));
          // Resolve against the world fence + solid scenery (trees, rocks, river…),
          // sliding along obstacles instead of stopping dead.
          const moved = this.world
            ? this.world.moveActor(cur, desired, CONFIG.playerRadius)
            : (Math.hypot(desired.x, desired.z) < CONFIG.worldRadius ? desired : cur);
          this.root.position = moved;
          this.facing = lerpAngle(this.facing, Math.atan2(dir.x, dir.z), CONFIG.turnLerp);
        }
        this.state = "walk"; this.walkPhase += dt * 10 * mag;
      } else {
        this.state = "idle"; this.walkPhase += dt * 2; // gentle idle motion
      }
      this._animateLocomotion(mag);
    }

    _animateLocomotion(speed) {
      if (this.state === "walk") {
        // A bouncier stride: longer leg swing, counter-swinging arms, a forward
        // lean, gentle hip sway and a vertical bob — reads far more lively.
        const sw = Math.sin(this.walkPhase) * 0.8 * (0.35 + speed);
        this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
        this.armL.rotation.x = -sw * 0.85; this.armR.rotation.x = sw * 0.85;
        this.armL.rotation.z = lerp(this.armL.rotation.z || 0, 0.14, 0.25);
        this.armR.rotation.z = lerp(this.armR.rotation.z || 0, -0.14, 0.25);
        this.lean.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.09;
        this.lean.rotation.x = lerp(this.lean.rotation.x, 0.08, 0.2);   // lean into the run
        this.lean.rotation.z = Math.sin(this.walkPhase) * 0.05;          // hip/shoulder sway
        this._tailSway = -Math.sin(this.walkPhase) * 0.3 + 0.25;
      } else {
        // Idle: breathing + a touch of arm sway + a subtle weight shift.
        const b = Math.sin(this.walkPhase) * 0.05;
        this.legL.rotation.x = lerp(this.legL.rotation.x, 0, 0.2);
        this.legR.rotation.x = lerp(this.legR.rotation.x, 0, 0.2);
        this.armL.rotation.x = lerp(this.armL.rotation.x, 0.08 + b, 0.2);
        this.armR.rotation.x = lerp(this.armR.rotation.x, 0.08 - b, 0.2);
        this.armL.rotation.z = lerp(this.armL.rotation.z || 0, 0.08, 0.2);
        this.armR.rotation.z = lerp(this.armR.rotation.z || 0, -0.08, 0.2);
        this.lean.position.y = lerp(this.lean.position.y, b * 0.4, 0.2);
        this.lean.rotation.x = lerp(this.lean.rotation.x, 0, 0.2);
        this.lean.rotation.z = lerp(this.lean.rotation.z || 0, Math.sin(this.walkPhase * 0.5) * 0.02, 0.1);
        this._tailSway = Math.sin(this.walkPhase) * 0.06;
      }
      // Swing the ponytails toward the target sway with a little lag.
      if (this.tails) for (const tp of this.tails) tp.rotation.x = lerp(tp.rotation.x || 0, this._tailSway || 0, 0.2);
    }

    // Crouch -> grab -> stand and raise the artifact, which then poofs into points.
    _updatePickup(dt) {
      this.pickT = Math.min(1, this.pickT + dt / 0.7);
      const t = this.pickT;
      const bend = Math.sin(Math.min(t, 0.5) / 0.5 * Math.PI / 2);      // 0->1 by t=0.5
      const rise = t < 0.5 ? 0 : (t - 0.5) / 0.5;                        // 0->1 from t=0.5
      const downThenUp = t < 0.5 ? bend : (1 - rise);
      this.lean.rotation.x = downThenUp * 0.55;
      this.lean.position.y = -downThenUp * 0.18;
      const armDown = downThenUp * 1.3;
      const armUp = rise * 2.6;
      // Left arm does the grabbing (right hand holds the wand).
      this.armL.rotation.x = armDown - armUp;
      this.armL.rotation.z = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;

      // At the bottom of the reach, take hold of the artifact.
      if (this.pendingItem && t >= 0.5) {
        const m = this.pendingItem; this.pendingItem = null;
        m.setParent(this.carryAnchor);
        m.position.set(0, -1.4, 0.4);
        this.carried = m;
        if (this.onPicked) { this.onPicked(); this.onPicked = null; }
      }
      // Raise the held artifact overhead as we stand.
      if (this.carried) {
        this.carried.position.y = lerp(this.carried.position.y, 0.4, 0.3);
        this.carried.position.z = lerp(this.carried.position.z, 0, 0.3);
        this.carried.scaling.setAll(lerp(this.carried.scaling.x, t > 0.85 ? 0 : 1, 0.3));
      }
      if (t >= 1) {
        if (this.carried) { this.carried.dispose(); this.carried = null; }
        this.state = "idle"; this.lean.rotation.x = 0; this.lean.position.y = 0;
      }
    }

    // Returns true if the hit actually landed (i.e. wasn't on bite-cooldown).
    takeDamage(amount) {
      this.health = Math.max(0, this.health - amount);
      return this.health;
    }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // Magic bolts (wand projectiles)
  // =========================================================================
  class Projectile {
    constructor(scene, shadow, origin, dir, opts = {}) {
      this.speed = opts.speed || CONFIG.boltSpeed;
      // Velocity is integrated with gravity each frame so bolts/arrows follow a
      // real ballistic arc and always come down — they never fly forever.
      this.vel = dir.clone().normalize().scale(this.speed);
      this.gravity = opts.gravity != null ? opts.gravity : 1.5; // m/s² downward
      this.life = opts.life || CONFIG.boltLife;
      this.radius = opts.radius || CONFIG.boltRadius;  // hit radius vs monsters
      this.damage = opts.damage || 1;
      this.pierce = opts.pierce || 0;                  // extra enemies a bolt passes through
      this.knock = opts.knock || 0;                    // extra knockback on impact
      this.color = opts.color || "#bfe3ff";            // impact-burst tint
      this.hitSet = new Set();                         // monsters already struck (no double-hits)
      this.dead = false;
      const arrow = opts.shape === "arrow";
      const m = arrow
        ? capsule(scene, "arrow", 0.7, 0.08, emat(scene, "arrowM", opts.color || "#caa46a", 0.7))
        : sphere(scene, "bolt", 0.32, emat(scene, "boltM", opts.color || "#bfe3ff", 1.0));
      m.position.copyFrom(origin);
      m.isPickable = false;
      if (!arrow) m.scaling.setAll(this.radius / CONFIG.boltRadius); // size reads the hit radius
      this.mesh = m;
      this.isArrow = arrow;
      if (!arrow) {
        const halo = sphere(scene, "boltHalo", 0.6, emat(scene, "boltHaloM", opts.haloColor || "#9fd0ff", 1.0));
        halo.material.alpha = 0.3; halo.parent = m; halo.isPickable = false;
      }
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.vel.y -= this.gravity * dt;                       // gravity pulls it down
      this.mesh.position.addInPlace(this.vel.scale(dt));
      // Point an arrow along its flight path so the arc reads.
      if (this.isArrow) this.mesh.rotation.x = Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z)) - Math.PI / 2;
      // Die when it hits the ground or leaves the playable area.
      if (this.mesh.position.y <= 0.15) { this.dead = true; return; }
      if (Math.hypot(this.mesh.position.x, this.mesh.position.z) > CONFIG.worldRadius + 6) this.dead = true;
    }
    dispose() { this.mesh.dispose(); }
  }

  // =========================================================================
  // Hostile projectiles — sweets that shoot back (boss "caster" attacks). Same
  // ballistic physics; they damage the PLAYER on contact, then fizzle. Like the
  // wand bolts they are gravity-bound and life-capped, so they never persist.
  // =========================================================================
  class Hazard {
    constructor(scene, origin, dir, opts = {}) {
      this.speed = opts.speed || 13;
      this.vel = dir.clone().normalize().scale(this.speed);
      this.gravity = opts.gravity != null ? opts.gravity : 5;
      this.life = opts.life || 3.5;
      this.radius = opts.radius || 0.8;
      this.damage = opts.damage || 10;
      this.dead = false;
      const m = sphere(scene, "hazard", 0.6, emat(scene, "hazardM", opts.color || "#ff5a6a", 1.0));
      m.position.copyFrom(origin); m.isPickable = false;
      const halo = sphere(scene, "hazardHalo", 1.0, emat(scene, "hazardHaloM", opts.color || "#ff8a6a", 1.0));
      halo.material.alpha = 0.3; halo.parent = m; halo.isPickable = false;
      this.mesh = m;
    }
    // Returns true on the frame it strikes the player (within its hit radius).
    update(dt, playerPos) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return false; }
      this.vel.y -= this.gravity * dt;
      this.mesh.position.addInPlace(this.vel.scale(dt));
      if (this.mesh.position.y <= 0.15) { this.dead = true; return false; }
      if (Math.hypot(this.mesh.position.x, this.mesh.position.z) > CONFIG.worldRadius + 6) { this.dead = true; return false; }
      const dx = this.mesh.position.x - playerPos.x;
      const dz = this.mesh.position.z - playerPos.z;
      const dy = this.mesh.position.y - (playerPos.y + 1.2);
      return Math.hypot(dx, dy, dz) <= this.radius + CONFIG.playerRadius;
    }
    dispose() { this.mesh.dispose(); }
  }

  // =========================================================================
  // Monster — a "living sweet" with a chase AI, a bob, and a pop on death.
  // =========================================================================
  const SWEETS = [
    "lollipop", "gummy", "cupcake", "donut", "candycane",
    "icecream", "macaron", "candycorn", "chocbar", "jellybean", "marshmallow", "pretzel",
  ];

  class Monster {
    // `restore` (optional) rebuilds a saved sweet exactly: { kind, hp, speed, ability }.
    // `spec` (optional) constrains a fresh spawn to a zone's palette:
    //   { kinds:[…sweet kinds], abilities:[…ability ids] }.
    constructor(scene, shadow, pos, wave, restore, spec) {
      this.scene = scene;
      // Each sweet rolls a "Plants vs Zombies"-style ability: a chaser, a fast
      // runner, a tanky brute, a leaping jumper, a ranged shooter or a bomber
      // that bursts on death. Variety unlocks as the waves escalate. A `restore`
      // captures the FINAL hp/speed (ability already folded in), so we only apply
      // the ability multipliers for freshly-spawned sweets — never on restore.
      if (restore) {
        this.kind = restore.kind;
        this.ability = restore.ability && MONSTER_ABILITIES[restore.ability] ? restore.ability : "chaser";
        this.hp = this.maxHp = restore.hp;
        this.speed = restore.speed;
      } else {
        const pool = (spec && spec.abilities && spec.abilities.length) ? spec.abilities : abilitiesForWave(wave);
        this.ability = pool[(rng() * pool.length) | 0];
        const ab0 = MONSTER_ABILITIES[this.ability] || MONSTER_ABILITIES.chaser;
        const baseHp = 1 + Math.floor((wave - 1) / CONFIG.monsterHpPerWaves); // sturdier in later waves
        this.hp = this.maxHp = Math.max(1, Math.round(baseHp * ab0.hp));
        const spd = CONFIG.monsterBaseSpeed + rng() * 0.7 + (wave - 1) * CONFIG.monsterSpeedPerWave;
        this.speed = Math.min(CONFIG.monsterMaxSpeed, spd) * ab0.speed;
        const kinds = (spec && spec.kinds && spec.kinds.length) ? spec.kinds : SWEETS;
        this.kind = kinds[(rng() * kinds.length) | 0];
      }
      // Contact damage + body size are derived from the ability every time (they
      // aren't saved), so they're correct on both fresh spawns and restores.
      const ab = MONSTER_ABILITIES[this.ability] || MONSTER_ABILITIES.chaser;
      this.alive = true;
      this.dying = 0;                               // >0 while playing the pop animation
      this.radius = 0.85 * (ab.scale || 1);
      this.isBoss = false;
      this.contactDamage = CONFIG.contactDamage * ab.dmg;
      this.bob = rng() * Math.PI * 2;
      this.biteTimer = 0;                           // cooldown before this sweet bites again
      this.attackTimer = 1 + rng() * 2;             // jumper leap / shooter spit cadence
      this.jumpT = 0;                               // >0 while mid-leap
      this.kx = 0; this.kz = 0;                     // knockback velocity (impact feedback)
      this._abScale = ab.scale || 1;
      // RPG roaming: a home patch the sweet wanders, and the aggro radius at
      // which it drops roaming to pursue the player. The spawner may tune these.
      this.home = { x: pos.x, z: pos.z };
      this.homeRange = 10; this.aggroRange = 16;
      this.wanderTimer = rng() * 2.5; this._wt = null;
      this._build(scene, shadow, pos);
    }

    _build(scene, shadow, pos) {
      const root = new BABYLON.TransformNode("monster", scene);
      root.position.copyFrom(pos);
      this.root = root;
      const body = new BABYLON.TransformNode("monsterBody", scene);
      body.parent = root; this.body = body;

      // A special ability tints the sweet so you can read the threat at a glance.
      const ab = MONSTER_ABILITIES[this.ability] || MONSTER_ABILITIES.chaser;
      const candy = ab.tint || PALETTE[(rng() * PALETTE.length) | 0];
      this.tint = candy;
      const main = gloss(emat(scene, "swt" + root.uniqueId, candy, ab.tint ? 0.28 : 0.18), 0.45);
      const cream = emat(scene, "cream" + root.uniqueId, "#fff3e0", 0.1);
      const dark = emat(scene, "swtd" + root.uniqueId, "#7a4030", 0.08);
      const add = (m) => { m.parent = body; shadow.addShadowCaster(m); return m; };

      let topY = 1.1; // where the face sits, per kind
      if (this.kind === "lollipop") {
        const stick = add(cyl(scene, "stick", 0.08, 0.08, 0.9, cream)); stick.position.y = 0.45;
        const disc2 = add(cyl(scene, "pop", 0.9, 0.9, 0.22, main)); disc2.position.y = 1.05; disc2.rotation.x = Math.PI / 2;
        topY = 1.05;
      } else if (this.kind === "gummy") {
        const torso = add(capsule(scene, "gtor", 1.0, 0.42, main)); torso.position.y = 0.7;
        const headm = add(sphere(scene, "ghead", 0.7, main)); headm.position.y = 1.2;
        for (const s of [-1, 1]) {
          const ear = add(sphere(scene, "gear", 0.28, main)); ear.position.set(0.32 * s, 1.55, 0);
          const arm = add(capsule(scene, "garm", 0.5, 0.14, main)); arm.position.set(0.5 * s, 0.8, 0); arm.rotation.z = 0.6 * s;
        }
        topY = 1.25;
      } else if (this.kind === "cupcake") {
        const base = add(cone(scene, "cbaseM", 0.95, 0.6, 0.7, cream)); base.position.y = 0.45;
        const top = add(sphere(scene, "ctop", 1.0, main)); top.position.y = 1.0; top.scaling.y = 0.85;
        const cherry = add(sphere(scene, "cherry", 0.25, emat(scene, "cherryM" + root.uniqueId, "#ff4060", 0.3))); cherry.position.y = 1.55;
        topY = 1.1;
      } else if (this.kind === "donut") {
        const torus = BABYLON.MeshBuilder.CreateTorus("donut", { diameter: 1.4, thickness: 0.6, tessellation: 16 }, scene);
        torus.material = main; add(torus); torus.position.y = 0.8;
        const ice = BABYLON.MeshBuilder.CreateTorus("icing", { diameter: 1.4, thickness: 0.62, tessellation: 16 }, scene);
        ice.material = cream; add(ice); ice.position.y = 0.9; ice.scaling.y = 0.6;
        topY = 1.15;
      } else if (this.kind === "candycane") {
        const cane = add(capsule(scene, "cane", 1.3, 0.28, cream)); cane.position.y = 0.75;
        const stripe = add(capsule(scene, "stripe", 1.3, 0.30, main)); stripe.position.y = 0.75; stripe.scaling.set(0.6, 1.01, 0.6); stripe.rotation.y = 0.5;
        const hook = add(sphere(scene, "hook", 0.4, cream)); hook.position.set(0.18, 1.45, 0);
        topY = 1.0;
      } else if (this.kind === "icecream") {
        // Waffle cone (point down) + two stacked scoops.
        const coneM = add(cone(scene, "iccone", 0.7, 0.05, 1.0, emat(scene, "icconeM" + root.uniqueId, "#c8923f", 0.08)));
        coneM.position.y = 0.5; coneM.rotation.x = Math.PI; // tip down
        const s1 = add(sphere(scene, "icscoop1", 0.78, main)); s1.position.y = 1.05;
        const s2 = add(sphere(scene, "icscoop2", 0.64, cream)); s2.position.y = 1.55;
        topY = 1.05;
      } else if (this.kind === "macaron") {
        // Two domed shells with a cream filling.
        const top = add(sphere(scene, "mtop", 1.1, main)); top.position.y = 1.05; top.scaling.y = 0.5;
        const bot = add(sphere(scene, "mbot", 1.1, main)); bot.position.y = 0.65; bot.scaling.y = 0.5;
        const fill = add(cyl(scene, "mfill", 1.0, 1.0, 0.25, cream)); fill.position.y = 0.85;
        topY = 1.05;
      } else if (this.kind === "candycorn") {
        // Classic three-band cone (white tip, orange, yellow).
        const yellow = emat(scene, "ccY" + root.uniqueId, "#ffd34e", 0.18);
        const orange = emat(scene, "ccO" + root.uniqueId, "#ff944e", 0.18);
        const b1 = add(cone(scene, "ccb1", 1.0, 0.7, 0.5, yellow)); b1.position.y = 0.3;
        const b2 = add(cone(scene, "ccb2", 0.7, 0.4, 0.5, orange)); b2.position.y = 0.78;
        const b3 = add(cone(scene, "ccb3", 0.4, 0.05, 0.5, cream)); b3.position.y = 1.25;
        topY = 0.62;
      } else if (this.kind === "chocbar") {
        // A chunky chocolate bar with embossed squares.
        const bar = add(box(scene, "bar", 1.5, 1.0, 0.5, emat(scene, "barM" + root.uniqueId, "#5b3a22", 0.08)));
        bar.position.y = 0.9;
        for (const sx of [-0.42, 0.42]) for (const sy of [-0.22, 0.22]) {
          const sq = add(box(scene, "sq", 0.5, 0.4, 0.12, dark)); sq.position.set(sx, 0.9 + sy, 0.26);
        }
        topY = 1.35;
      } else if (this.kind === "jellybean") {
        // A glossy bean — a fat tilted capsule.
        const bean = add(capsule(scene, "bean", 1.1, 0.55, main)); bean.position.y = 0.62; bean.rotation.z = 0.5;
        const shine = add(sphere(scene, "shine", 0.3, cream)); shine.position.set(-0.25, 0.95, 0.35);
        topY = 0.78;
      } else if (this.kind === "marshmallow") {
        // Soft squishy cylinder.
        const mm = add(cyl(scene, "mm", 1.05, 1.05, 1.1, cream)); mm.position.y = 0.75;
        const band = add(cyl(scene, "mmband", 1.08, 1.08, 0.3, main)); band.position.y = 0.75;
        topY = 1.0;
      } else { // pretzel — a knotted torus with salt bumps.
        const knot = BABYLON.MeshBuilder.CreateTorusKnot("pretzel", { radius: 0.5, tube: 0.18, radialSegments: 32, tubularSegments: 8, p: 2, q: 3 }, scene);
        knot.material = emat(scene, "pretM" + root.uniqueId, "#a6692e", 0.08); add(knot); knot.position.y = 0.95;
        for (let s = 0; s < 5; s++) {
          const salt = add(sphere(scene, "salt", 0.1, cream));
          salt.position.set((rng() - 0.5) * 1.1, 0.95 + (rng() - 0.5) * 1.1, 0.3 + rng() * 0.2);
        }
        topY = 1.55;
      }

      // Cute angry face — eyes + a little frown — for every sweet.
      const eyeMat = emat(scene, "meye" + root.uniqueId, "#241a2a", 0);
      const whiteMat = emat(scene, "mwhite" + root.uniqueId, "#ffffff", 0.05);
      for (const s of [-1, 1]) {
        const w = add(sphere(scene, "mw", 0.2, whiteMat)); w.position.set(0.18 * s, topY, 0.42); w.scaling.z = 0.5;
        const e = add(sphere(scene, "me", 0.1, eyeMat)); e.position.set(0.18 * s, topY, 0.5);
        const brow = add(box(scene, "brow", 0.22, 0.05, 0.05, eyeMat)); brow.position.set(0.18 * s, topY + 0.16, 0.48); brow.rotation.z = -0.5 * s;
      }
      const mouth = add(box(scene, "mouth", 0.26, 0.06, 0.05, eyeMat)); mouth.position.set(0, topY - 0.22, 0.5);

      // Soft blob shadow.
      const blob = disc(scene, "mblob", this.radius, emat(scene, "mblobM" + root.uniqueId, "#000000", 0));
      blob.material.alpha = 0.25; blob.rotation.x = Math.PI / 2; blob.position.y = 0.02;
      blob.parent = root; blob.isPickable = false;

      // A floating marker telegraphs the ranged "shooter" and the volatile
      // "bomber" so the player can plan around them.
      if (this.ability === "shooter") {
        const orb = sphere(scene, "mShot", 0.3, emat(scene, "mShotM" + root.uniqueId, "#ff6cf0", 1));
        orb.parent = body; orb.position.set(0, topY + 0.7, 0.3); orb.isPickable = false;
        this.marker = orb;
      } else if (this.ability === "bomber") {
        const fuse = sphere(scene, "mFuse", 0.22, emat(scene, "mFuseM" + root.uniqueId, "#ff3b3b", 0.9));
        fuse.parent = body; fuse.position.set(0, topY + 0.7, 0); fuse.isPickable = false;
        this.marker = fuse;
      }

      // The ability's body scale (brutes are chunkier) is the resting scale that
      // hit-squash + death animations play against.
      body.scaling.setAll(this._abScale);
    }

    // Apply a knockback impulse (used by weapon/boss impacts) in world XZ.
    knockback(dx, dz, force) {
      const d = Math.hypot(dx, dz) || 1;
      this.kx += (dx / d) * force; this.kz += (dz / d) * force;
    }

    // Amble around the home patch at half pace, picking a fresh roaming target
    // every few seconds. Used when the player is beyond the aggro radius.
    _wander(dt) {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0 || !this._wt) {
        this.wanderTimer = 2 + rng() * 3;
        const a = rng() * Math.PI * 2, r = rng() * (this.homeRange || 10);
        this._wt = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
      }
      const dx = this._wt.x - this.root.position.x, dz = this._wt.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        const step = Math.min(this.speed * 0.5 * dt, d);   // amble at half pace
        this.root.position.x += (dx / d) * step;
        this.root.position.z += (dz / d) * step;
        this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(dx / d, dz / d), 0.1);
      } else { this._wt = null; }
      this.bob += dt * 3;
      this.body.position.y = Math.abs(Math.sin(this.bob * (this.ability === "brute" ? 0.6 : 1))) * 0.12;
    }

    // Move toward the player; return true if currently touching them. `state`
    // lets ranged "shooter" sweets launch hostile bolts into the world.
    update(dt, playerPos, state) {
      if (this.biteTimer > 0) this.biteTimer -= dt;
      const s = this._abScale;
      if (this.dying > 0) {
        this.dying -= dt;
        const k = Math.max(0, this.dying / 0.35);
        this.body.scaling.setAll(k * s);
        this.body.rotation.y += dt * 12;
        if (this.dying <= 0) { this.alive = false; this.root.dispose(); }
        return false;
      }
      this.bob += dt * 6;
      // Ease back to the resting scale after a non-fatal hit squashed us bigger.
      if (Math.abs(this.body.scaling.x - s) > 1e-3) this.body.scaling.setAll(lerp(this.body.scaling.x, s, 0.25));

      // Decaying knockback impulse — gives weapon/boss impacts physical weight.
      if (this.kx || this.kz) {
        this.root.position.x += this.kx * dt;
        this.root.position.z += this.kz * dt;
        const decay = Math.exp(-dt * 6);
        this.kx *= decay; this.kz *= decay;
        if (Math.hypot(this.kx, this.kz) < 0.05) { this.kx = this.kz = 0; }
      }

      const to = playerPos.subtract(this.root.position); to.y = 0;
      const dist = to.length();
      const ab = MONSTER_ABILITIES[this.ability] || MONSTER_ABILITIES.chaser;

      // ---- RPG roaming: beyond the aggro radius the sweet ambles around its
      // home patch instead of beelining the player across the whole zone. ----
      if (this.home && dist > this.aggroRange && this.jumpT <= 0) {
        if (this.marker) this.marker.rotation.y += dt * 4;
        this._wander(dt);
        return false;
      }

      if (dist > 0.001) this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(to.x / dist, to.z / dist), 0.2);
      if (this.marker) this.marker.rotation.y += dt * 4;

      // ---- Mid-leap (jumper): arc fast toward the locked-in landing spot. ----
      if (this.jumpT > 0) {
        this.jumpT -= dt;
        const prog = 1 - Math.max(0, this.jumpT / this._jumpDur);
        if (this._jumpDir) this.root.position.addInPlace(this._jumpDir.scale(this._jumpSpeed * dt));
        this.body.position.y = Math.sin(prog * Math.PI) * 1.8; // a real hop arc
        if (this.jumpT <= 0) this.body.position.y = 0;
        return dist <= this.radius + 1.0;
      }

      this.attackTimer -= dt;

      // ---- Shooter: hang back at a standoff and spit candy bolts. ----
      if (this.ability === "shooter") {
        const standoff = ab.standoff || 11;
        if (dist > standoff + 0.4) this.root.position.addInPlace(to.scale(Math.min(this.speed * dt, dist - standoff) / dist));
        else if (dist < standoff - 1.5) this.root.position.addInPlace(to.scale(-this.speed * 0.7 * dt / dist));
        if (this.attackTimer <= 0 && state && state.enemyBolts && dist < standoff + 6) {
          this.attackTimer = 2.2 + rng() * 1.2;
          const origin = this.root.position.add(new BABYLON.Vector3(0, 1.6, 0));
          const aim = new BABYLON.Vector3(to.x / dist, 0.22, to.z / dist);
          state.enemyBolts.push(new Hazard(this.scene, origin, aim, { speed: 16, damage: 8, gravity: 5, color: ab.tint || "#ff6cf0", radius: 0.7 }));
          if (this.marker) this.marker.scaling.setAll(1.4);
          Sfx.play("boss_cast");
        } else if (this.marker) this.marker.scaling.setAll(lerp(this.marker.scaling.x, 1, 0.2));
        this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.14;
        return dist <= this.radius + 1.0;
      }

      // ---- Jumper: when in mid-range, crouch and LEAP across the gap. ----
      if (this.ability === "jumper" && this.attackTimer <= 0 && dist > 3 && dist < 14) {
        this.attackTimer = 2.5 + rng();
        this.jumpT = this._jumpDur = 0.55;
        this._jumpDir = new BABYLON.Vector3(to.x / dist, 0, to.z / dist);
        this._jumpSpeed = Math.min(dist - 1, 9) / this._jumpDur;
        Sfx.play("hit");
        return false;
      }

      // ---- Default pursuit (chaser / runner / brute / bomber). ----
      if (dist > 0.001) {
        const step = Math.min(this.speed * dt, Math.max(0, dist - 1.0));
        this.root.position.addInPlace(to.scale(step / dist));
      }
      // Hoppy bob (brutes lumber slower).
      this.body.position.y = Math.abs(Math.sin(this.bob * (this.ability === "brute" ? 0.6 : 1))) * 0.18;
      return dist <= this.radius + 1.0;
    }

    hit(dmg) {
      this.hp -= dmg;
      if (this.hp <= 0 && this.dying <= 0) { this.dying = 0.35; return true; } // killed
      // flash / squash on a non-fatal hit
      this.body.scaling.setAll(this._abScale * 1.25);
      return false;
    }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // Bosses — colossal "Sweet Kings" that storm in every few waves. Each is one
  // of several ARCHETYPES with its own attack pattern and behaviour; the type
  // is rolled randomly per boss wave and grows tougher (and harder to read)
  // with each cycle. They share the Monster interface (update/hit/position/…)
  // so the wave, projectile and contact systems treat them like any sweet.
  //
  //   charger  — periodically winds up and dashes at the player.
  //   caster   — lobs hostile candy projectiles (Hazard) from range.
  //   summoner — conjures swarms of extra sweets to overwhelm you.
  //   stomper  — slow tank that ground-pounds a damaging shockwave when close.
  // =========================================================================
  const BOSS_ARCHES = [
    { id: "charger",  name: "Gummy King",       color: "#ff4d6d", crown: "#ffd34e" },
    { id: "caster",   name: "Choco Overlord",   color: "#7a4a2a", crown: "#ffe27a" },
    { id: "summoner", name: "Lollipop Tyrant",  color: "#a06cff", crown: "#ffd34e" },
    { id: "stomper",  name: "Cupcake Colossus", color: "#ff7ac0", crown: "#fff3a0" },
    { id: "bomber",   name: "Jawbreaker Warlord", color: "#4ec0ff", crown: "#ffe27a" },
    { id: "splitter", name: "Gelatin Hydra",    color: "#5be0a0", crown: "#ffd34e" },
  ];
  const BOSS_ARCH_BY_ID = {};
  for (const a of BOSS_ARCHES) BOSS_ARCH_BY_ID[a.id] = a;

  class Boss {
    // `archId` (optional) forces an archetype — used by save/restore. Otherwise
    // one is rolled at random so every boss wave is a fresh surprise.
    constructor(scene, shadow, pos, wave, archId) {
      this.scene = scene;
      this.wave = wave;                                       // recorded for save/restore
      const cycle = Math.floor(wave / CONFIG.bossEveryWaves); // 1, 2, 3, …
      this.cycle = cycle;
      this.arch = archId ? BOSS_ARCH_BY_ID[archId] : BOSS_ARCHES[(rng() * BOSS_ARCHES.length) | 0];
      if (!this.arch) this.arch = BOSS_ARCHES[0];
      this.kind = this.arch; // back-compat alias
      this.archId = this.arch.id;
      this.name = this.arch.name;

      // Tougher each cycle. The stomper is a slow tank with extra HP; the
      // charger is faster; the caster/summoner sit a touch back from the brawl.
      const hpMul = this.arch.id === "stomper" ? 1.3 : this.arch.id === "splitter" ? 1.2 : 1.0;
      this.maxHp = Math.round((CONFIG.bossBaseHp + (cycle - 1) * CONFIG.bossHpPerCycle) * hpMul);
      this.hp = this.maxHp;
      const baseSpd = this.arch.id === "stomper" ? CONFIG.bossSpeed * 0.8
        : this.arch.id === "charger" ? CONFIG.bossSpeed * 1.15 : CONFIG.bossSpeed;
      this.speed = baseSpd + (cycle - 1) * 0.15;
      this.alive = true;
      this.dying = 0;
      this.radius = CONFIG.bossRadius;
      this.isBoss = true;
      this.contactDamage = CONFIG.bossContactDamage + (cycle - 1) * 4;
      this.bob = 0;
      this.biteTimer = 0;

      // Behaviour timers. Higher cycles attack more often — the pattern itself
      // gets harder, not just the numbers. First action is slightly delayed.
      const tighten = Math.max(0.45, 1 - (cycle - 1) * 0.12); // shrink cooldowns each cycle
      this.actionCd = ({ charger: 3.4, caster: 2.6, summoner: 6.5, stomper: 2.4, bomber: 3.0, splitter: 5.5 }[this.arch.id] || 3.0) * tighten;
      this.actionTimer = this.actionCd * 0.7 + 1.0;
      this.charging = 0;        // >0 while dashing
      this.chargeDir = null;
      this.windup = 0;          // telegraph before a charge/stomp
      this.shockT = 0;          // shockwave visual timer
      this._build(scene, shadow, pos);
    }

    _build(scene, shadow, pos) {
      const root = new BABYLON.TransformNode("boss", scene);
      root.position.copyFrom(pos);
      this.root = root;
      const body = new BABYLON.TransformNode("bossBody", scene);
      body.parent = root; this.body = body;

      const main = emat(scene, "bossM" + root.uniqueId, this.arch.color, 0.28);
      const dark = emat(scene, "bossD" + root.uniqueId, "#2a1530", 0.05);
      const gold = emat(scene, "bossG" + root.uniqueId, this.arch.crown, 0.5);
      const cream = emat(scene, "bossC" + root.uniqueId, "#fff3e0", 0.12);
      const add = (m) => { m.parent = body; shadow.addShadowCaster(m); return m; };

      // A hulking gummy-bear-ish torso + head.
      const torso = add(capsule(scene, "btor", 2.4, 1.2, main)); torso.position.y = 1.7;
      const head = add(sphere(scene, "bhead", 2.0, main)); head.position.y = 3.2;
      for (const s of [-1, 1]) {
        const ear = add(sphere(scene, "bear", 0.8, main)); ear.position.set(0.9 * s, 4.1, 0);
        const arm = add(capsule(scene, "barm", 1.5, 0.45, main)); arm.position.set(1.4 * s, 1.9, 0); arm.rotation.z = 0.7 * s;
        const leg = add(capsule(scene, "bleg", 1.2, 0.5, main)); leg.position.set(0.6 * s, 0.6, 0);
      }
      const belly = add(sphere(scene, "bbelly", 1.5, cream)); belly.position.set(0, 1.5, 0.7); belly.scaling.set(1, 1.2, 0.5);

      // A golden crown — the mark of a sweet monarch.
      const band = add(cyl(scene, "bcrown", 1.5, 1.5, 0.5, gold)); band.position.y = 4.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = add(cone(scene, "bspike", 0.4, 0.02, 0.7, gold));
        spike.position.set(Math.cos(a) * 0.7, 5.0, Math.sin(a) * 0.7);
      }
      const jewel = add(BABYLON.MeshBuilder.CreatePolyhedron("bjewel", { type: 1, size: 0.4 }, scene));
      jewel.material = emat(scene, "bjewelM" + root.uniqueId, "#ff3b6b", 0.7); jewel.position.set(0, 4.55, 0.75);

      // Menacing glowing eyes + a big scowl.
      const eyeMat = emat(scene, "beye" + root.uniqueId, "#ff2a2a", 0.9);
      const whiteMat = emat(scene, "bwhite" + root.uniqueId, "#ffffff", 0.05);
      for (const s of [-1, 1]) {
        const w = add(sphere(scene, "bw", 0.55, whiteMat)); w.position.set(0.45 * s, 3.35, 0.95); w.scaling.z = 0.5;
        const e = add(sphere(scene, "be", 0.28, eyeMat)); e.position.set(0.45 * s, 3.3, 1.15);
        const brow = add(box(scene, "bbrow", 0.6, 0.13, 0.13, dark)); brow.position.set(0.45 * s, 3.7, 1.1); brow.rotation.z = -0.5 * s;
      }
      const mouth = add(box(scene, "bmouth", 0.9, 0.16, 0.13, dark)); mouth.position.set(0, 2.7, 1.2);

      // An ominous red glow + big blob shadow.
      const glow = new BABYLON.PointLight("bossGlow", new BABYLON.Vector3(0, 3, 0), scene);
      glow.parent = root; glow.diffuse = BABYLON.Color3.FromHexString("#ff5a6a");
      glow.intensity = 0.7; glow.range = 14;
      this.glow = glow;
      // The body material is kept so attacks can flash the boss as a telegraph.
      this.bodyMat = main;
      const blob = disc(scene, "bblob", this.radius * 1.3, emat(scene, "bblobM" + root.uniqueId, "#000000", 0));
      blob.material.alpha = 0.3; blob.rotation.x = Math.PI / 2; blob.position.y = 0.03;
      blob.parent = root; blob.isPickable = false;

      // A shockwave ring used by the stomper's ground-pound (hidden until then).
      const ringMat = emat(scene, "bring" + root.uniqueId, "#ffd34e", 1.0);
      ringMat.alpha = 0.4;
      const ring = disc(scene, "bringD" + root.uniqueId, 1, ringMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; ring.parent = root;
      ring.isPickable = false; ring.setEnabled(false);
      this.ring = ring; this.ringMat = ringMat;
    }

    // dt + the player position drive movement & attacks; `state` lets ranged
    // and summoning bosses spawn hazards / minions into the live world.
    update(dt, playerPos, state) {
      if (this.biteTimer > 0) this.biteTimer -= dt;
      if (this.dying > 0) {
        this.dying -= dt;
        const k = Math.max(0, this.dying / 0.8);
        this.body.scaling.setAll(k);
        this.body.rotation.y += dt * 8;
        this.root.position.y = (1 - k) * -1;
        if (this.dying <= 0) { this.alive = false; this.root.dispose(); }
        return false;
      }
      this.bob += dt * 4;
      if (this.body.scaling.x !== 1) this.body.scaling.setAll(lerp(this.body.scaling.x, 1, 0.2));

      const to = playerPos.subtract(this.root.position); to.y = 0;
      const dist = to.length();
      const dir = dist > 0.001 ? to.scale(1 / dist) : new BABYLON.Vector3(0, 0, 1);

      // ---- Behaviour: each archetype runs its own attack pattern. ----
      let speed = this.speed;
      let extraContact = false;
      this.actionTimer -= dt;

      if (this.charging > 0) {
        // Mid-dash: barrel forward fast in the locked-in direction.
        this.charging -= dt;
        speed = this.speed * 4.5;
        extraContact = true;
        if (this.chargeDir) this.root.position.addInPlace(this.chargeDir.scale(speed * dt));
        this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2((this.chargeDir || dir).x, (this.chargeDir || dir).z), 0.2);
        this.body.position.y = 0.1;
        // keep inside the fence
        const hyp = Math.hypot(this.root.position.x, this.root.position.z);
        const fr = CONFIG.worldRadius - this.radius;
        if (hyp > fr) { this.root.position.x *= fr / hyp; this.root.position.z *= fr / hyp; this.charging = 0; }
        return dist <= this.radius + (extraContact ? 1.8 : 1.2);
      }

      if (this.windup > 0) {
        // Telegraph: stand still and pulse (body + glow flash) before the attack.
        this.windup -= dt;
        this.body.scaling.setAll(1 + Math.sin(this.bob * 4) * 0.1);
        if (this.glow) this.glow.intensity = 0.7 + Math.abs(Math.sin(this.bob * 6)) * 1.6;
        if (this.windup <= 0) { this._unleash(playerPos, dir, state); if (this.glow) this.glow.intensity = 0.7; }
        this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(dir.x, dir.z), 0.1);
        return dist <= this.radius + 1.2;
      }

      // Decide whether to start an attack this frame.
      if (this.actionTimer <= 0) this._beginAction(dist, dir);

      // Default pursuit. Casters/summoners hang back at a stand-off distance.
      const standoff = this.arch.id === "caster" ? 14 : this.arch.id === "summoner" ? 11 : this.radius;
      if (dist > standoff + 0.2) {
        const step = Math.min(speed * dt, dist - standoff);
        this.root.position.addInPlace(dir.scale(step));
      } else if (dist < standoff - 1 && (this.arch.id === "caster" || this.arch.id === "summoner")) {
        // Too close — back away to keep firing.
        this.root.position.addInPlace(dir.scale(-speed * 0.6 * dt));
      }
      this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(dir.x, dir.z), 0.12);
      this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.3;

      // Fade out a lingering shockwave ring.
      if (this.shockT > 0) {
        this.shockT -= dt;
        const k = 1 - Math.max(0, this.shockT / 0.5);
        this.ring.scaling.setAll(0.5 + k * (this.stompRange || 7));
        this.ringMat.alpha = 0.45 * (1 - k);
        if (this.shockT <= 0) this.ring.setEnabled(false);
      }

      return dist <= this.radius + 1.2;
    }

    // Kick off an archetype attack (some have a wind-up telegraph first).
    _beginAction(dist, dir) {
      this.actionTimer = this.actionCd;
      const id = this.arch.id;
      if (id === "charger") {
        // Only charge from a distance, with a brief telegraph.
        if (dist > 6) { this.windup = 0.5; this._pendingDir = dir.clone(); }
      } else if (id === "stomper") {
        if (dist < 9) this.windup = 0.55; else this.actionTimer = 0.4; // close in first
      } else if (id === "caster") {
        this.windup = 0.35;
      } else if (id === "summoner") {
        this.windup = 0.5;
      } else if (id === "bomber") {
        this.windup = 0.45; // wind up before lobbing a volley of bombs
      } else if (id === "splitter") {
        if (dist < 16) this.windup = 0.4; else this.actionTimer = 0.5;
      }
    }

    // Fire off the actual attack once the telegraph completes.
    _unleash(playerPos, dir, state) {
      const id = this.arch.id;
      if (id === "charger") {
        this.chargeDir = (this._pendingDir || dir).clone();
        this.charging = 0.7 + this.cycle * 0.05;
        Sfx.play("boss_charge");
      } else if (id === "caster") {
        const n = 1 + Math.min(4, this.cycle);  // more bolts each cycle
        const origin = this.root.position.add(new BABYLON.Vector3(0, 3, 0));
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * 0.16;
          const ang = Math.atan2(dir.x, dir.z) + spread;
          const aim = new BABYLON.Vector3(Math.sin(ang), 0.28, Math.cos(ang));
          state.enemyBolts.push(new Hazard(this.scene, origin.clone(), aim, {
            speed: 15 + this.cycle, damage: 10 + this.cycle * 2, gravity: 4,
            color: this.arch.color, radius: 0.9,
          }));
        }
        Sfx.play("boss_cast");
      } else if (id === "summoner") {
        const n = 2 + Math.min(5, this.cycle);
        for (let i = 0; i < n; i++) {
          const a = rng() * Math.PI * 2, r = this.radius + 2 + rng() * 3;
          const pos = new BABYLON.Vector3(this.root.position.x + Math.cos(a) * r, 0, this.root.position.z + Math.sin(a) * r);
          const m = new Monster(this.scene, state.shadow, pos, this.wave);
          state.monsters.push(m);
          state.waveTotal++;
        }
        Sfx.play("boss_summon");
        toast(t("toast.summonMinions"));
      } else if (id === "stomper") {
        this.stompRange = 6 + this.cycle * 0.6;
        this.shockT = 0.5;
        this.ring.setEnabled(true); this.ring.scaling.setAll(0.5); this.ringMat.alpha = 0.45;
        Sfx.play("boss_stomp");
        const dx = playerPos.x - this.root.position.x, dz = playerPos.z - this.root.position.z;
        if (Math.hypot(dx, dz) <= this.stompRange) {
          damagePlayer(state, (14 + this.cycle * 3));
        }
      } else if (id === "bomber") {
        // Lob a volley of slow, high-arcing candy bombs that rain around the
        // player — they must keep moving to avoid the falling barrage.
        const n = 3 + Math.min(5, this.cycle);
        const origin = this.root.position.add(new BABYLON.Vector3(0, 4, 0));
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * 0.18 + (rng() - 0.5) * 0.1;
          const ang = Math.atan2(dir.x, dir.z) + spread;
          const aim = new BABYLON.Vector3(Math.sin(ang), 0.85, Math.cos(ang));
          state.enemyBolts.push(new Hazard(this.scene, origin.clone(), aim, {
            speed: 12 + this.cycle, damage: 12 + this.cycle * 2, gravity: 11,
            color: this.arch.color, radius: 1.2, life: 4,
          }));
        }
        Sfx.play("boss_cast");
        toast(t("toast.incomingBombs"));
      } else if (id === "splitter") {
        // Shed a knot of minions, splitting off pieces of itself.
        const n = 2 + Math.min(4, this.cycle);
        for (let i = 0; i < n; i++) {
          const a = rng() * Math.PI * 2, r = this.radius + 1.5 + rng() * 2.5;
          const pos = new BABYLON.Vector3(this.root.position.x + Math.cos(a) * r, 0, this.root.position.z + Math.sin(a) * r);
          state.monsters.push(new Monster(this.scene, state.shadow, pos, this.wave));
          state.waveTotal++;
        }
        Sfx.play("boss_summon");
        toast(t("toast.hydraSplits"));
      }
    }

    hit(dmg) {
      this.hp -= dmg;
      updateBossBar(this);
      if (this.hp <= 0 && this.dying <= 0) { this.dying = 0.8; return true; }
      this.body.scaling.setAll(1.12);
      return false;
    }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // Coin — a spinning golden coin dropped by defeated sweets. Walk near it to
  // scoop it up; coins are the currency spent at the merchant's shop.
  // =========================================================================
  class Coin {
    constructor(scene, shadow, pos, value) {
      this.value = value;
      this.life = CONFIG.coinLife;
      this.collected = false;
      this.spin = rng() * Math.PI * 2;
      const root = new BABYLON.TransformNode("coin", scene);
      root.position.copyFrom(pos);
      root.position.y = 0.6;
      this.root = root;

      const gold = emat(scene, "coinM" + root.uniqueId, "#ffcf3a", 0.45);
      const disc2 = cyl(scene, "coinDisc", 0.42, 0.42, 0.1, gold);
      disc2.rotation.x = Math.PI / 2; disc2.parent = root;
      shadow.addShadowCaster(disc2);
      // A soft glow so coins are easy to spot in the grass.
      const halo = sphere(scene, "coinHalo", 0.7, emat(scene, "coinHaloM" + root.uniqueId, "#ffe27a", 1));
      halo.material.alpha = 0.22; halo.parent = root; halo.isPickable = false;
      this.halo = halo;
    }

    // Returns true once the player has scooped this coin up.
    update(dt, playerPos) {
      this.life -= dt;
      this.spin += dt * 4;
      this.root.rotation.y = this.spin;
      this.root.position.y = 0.6 + Math.sin(this.spin * 1.5) * 0.08;
      this.halo.scaling.setAll(1 + Math.sin(this.spin * 2) * 0.12);

      const dx = playerPos.x - this.root.position.x;
      const dz = playerPos.z - this.root.position.z;
      const dist = Math.hypot(dx, dz);
      // Magnet: drift toward the player when they're close, then collect.
      if (dist < coinMagnetRange) {
        const pull = (1 - dist / coinMagnetRange) * 8 * dt;
        this.root.position.x += dx * pull / (dist || 1);
        this.root.position.z += dz * pull / (dist || 1);
      }
      return dist <= coinPickupRange;
    }

    dispose() { this.root.dispose(); }
  }

  // =========================================================================
  // ItemDrop — a glowing rare item left behind by a defeated boss. Walk over it
  // to scoop it straight into your inventory (like a coin, but it's gear).
  // =========================================================================
  class ItemDrop {
    constructor(scene, shadow, pos, id) {
      this.id = id;
      this.life = 60;               // lingers a good while before fading
      this.spin = 0;
      const def = getDef(id);
      const root = new BABYLON.TransformNode("drop", scene);
      root.position.copyFrom(pos); root.position.y = 1.0;
      this.root = root;
      const col = (RARITY[def.rarity] || RARITY.normal).color;
      // A floating gem in a beam of light marks the loot.
      const gem = BABYLON.MeshBuilder.CreatePolyhedron("dropGem", { type: 1, size: 0.4 }, scene);
      gem.material = emat(scene, "dropM" + root.uniqueId, col, 0.7); gem.parent = root;
      shadow.addShadowCaster(gem); this.gem = gem;
      const halo = sphere(scene, "dropHalo", 1.1, emat(scene, "dropHaloM" + root.uniqueId, col, 1));
      halo.material.alpha = 0.28; halo.parent = root; halo.isPickable = false; this.halo = halo;
      const beam = cyl(scene, "dropBeam", 0.1, 1.0, 6, emat(scene, "dropBeamM" + root.uniqueId, col, 1));
      beam.material.alpha = 0.14; beam.parent = root; beam.position.y = 2.5; beam.isPickable = false;
    }
    // Returns true once the player has walked over it.
    update(dt, playerPos) {
      this.life -= dt;
      this.spin += dt * 1.6;
      this.gem.rotation.y = this.spin;
      this.root.position.y = 1.0 + Math.sin(this.spin * 1.5) * 0.18;
      this.halo.scaling.setAll(1 + Math.sin(this.spin * 2) * 0.14);
      const dx = playerPos.x - this.root.position.x, dz = playerPos.z - this.root.position.z;
      return Math.hypot(dx, dz) <= 2.0;
    }
    dispose() { this.root.dispose(); }
  }

  // =========================================================================
  // Visual effects — short-lived "impact" bursts so hits read physically: a
  // puff of shards flies out and fades whenever a bolt or swing connects, when
  // a bolt smacks the ground/scenery, or when a bomber sweet detonates. Built
  // from cheap primitives so it stays headless-safe (the test harness stubs the
  // meshes) and never leaks (each burst self-disposes when its life runs out).
  // =========================================================================
  let _fxSeq = 1;
  class Burst {
    constructor(scene, pos, color, opts = {}) {
      this.t = 0; this.life = opts.life || 0.5; this.parts = [];
      this.grav = opts.gravity != null ? opts.gravity : 9;
      const mat = emat(scene, "fx" + (_fxSeq++), color || "#ffe27a", 1.0);
      mat.alpha = 1; this.mat = mat;
      const n = opts.count || 8;
      const y0 = (pos.y || 0) + (opts.y != null ? opts.y : 1.0);
      for (let i = 0; i < n; i++) {
        const m = sphere(scene, "fxp", opts.size || 0.18, mat);
        m.position.set(pos.x, y0, pos.z); m.isPickable = false;
        const a = rng() * Math.PI * 2, sp = (opts.spread || 4) * (0.4 + rng());
        this.parts.push({ m, vx: Math.cos(a) * sp, vy: (opts.up || 2) * (0.4 + rng()), vz: Math.sin(a) * sp });
      }
    }
    update(dt) {
      this.t += dt;
      const k = Math.min(1, this.t / this.life);
      for (const p of this.parts) {
        p.vy -= this.grav * dt;
        p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
        if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.vy = 0; p.vx *= 0.7; p.vz *= 0.7; }
        p.m.scaling.setAll(Math.max(0.01, 1 - k));
      }
      if (this.mat) this.mat.alpha = Math.max(0, 1 - k);
      return this.t < this.life;
    }
    dispose() { for (const p of this.parts) p.m.dispose(); if (this.mat) this.mat.dispose(); }
  }

  // Spawn an impact burst into the live effects list (capped for performance).
  function spawnImpact(state, pos, color, opts) {
    if (!state || !state.fx) return;
    if (state.fx.length > 48) return;          // never let effects pile up
    state.fx.push(new Burst(state.scene, pos, color, opts));
  }
  function updateFx(state, dt) {
    if (!state.fx) return;
    for (let i = state.fx.length - 1; i >= 0; i--) {
      if (!state.fx[i].update(dt)) { state.fx[i].dispose(); state.fx.splice(i, 1); }
    }
  }

  // =========================================================================
  // Merchant — a friendly NPC who appears at the plaza after a wave is cleared
  // and leaves when the next wave begins. Walk up + press E to open the shop.
  // =========================================================================
  class Merchant {
    constructor(scene, shadow, interaction, onOpen) {
      const root = new BABYLON.TransformNode("merchant", scene);
      root.position.set(0, 0, 0);
      this.root = root;
      this.bob = 0;
      this._build(scene, shadow);

      this.it = new Interactable(root, {
        label: t("label.shop"),
        range: 3.4,
        onInteract: () => onOpen(),
      });
      this.it.enabled = false;
      interaction.register(this.it);

      root.setEnabled(false);
      this.visible = false;
    }

    _build(scene, shadow) {
      const robe = emat(scene, "mRobe", "#4a3a8a", 0.08);
      const robeDk = emat(scene, "mRobeDk", "#352a66", 0.06);
      const skin = emat(scene, "mSkin", "#ffd9b8", 0.08);
      const hat = emat(scene, "mHat", "#2a2050", 0.06);
      const gold = emat(scene, "mGold", "#ffcf3a", 0.5);
      const add = (m) => { m.parent = this.root; shadow.addShadowCaster(m); return m; };

      add(cone(scene, "mBody", 1.1, 0.4, 1.5, robe)).position.y = 0.75;
      add(cyl(scene, "mBelt", 0.7, 0.85, 0.18, robeDk)).position.y = 0.95;
      const head = add(sphere(scene, "mHead", 0.55, skin)); head.position.y = 1.75;
      // A big beard for the wizardly merchant.
      const beard = add(cone(scene, "mBeard", 0.5, 0.06, 0.7, emat(scene, "mBeardM", "#e8e8f0", 0.05)));
      beard.position.set(0, 1.5, 0.18); beard.rotation.x = Math.PI;
      // Wide-brimmed pointed hat.
      add(cyl(scene, "mBrim", 1.1, 1.1, 0.08, hat)).position.y = 2.02;
      add(cone(scene, "mCap", 0.7, 0.02, 1.0, hat)).position.y = 2.5;
      const star = add(BABYLON.MeshBuilder.CreatePolyhedron("mStar", { type: 2, size: 0.12 }, scene));
      star.material = gold; star.position.y = 3.0;
      for (const s of [-1, 1]) {
        const eye = add(sphere(scene, "mEye", 0.08, emat(scene, "mEyeM", "#2a2a3a", 0)));
        eye.position.set(0.13 * s, 1.8, 0.45);
      }

      // A floating "shop" marker (coin pouch) so the player can spot the merchant.
      const sign = new BABYLON.TransformNode("mSign", scene);
      sign.parent = this.root; sign.position.y = 3.5; this.sign = sign;
      const bag = sphere(scene, "mBag", 0.45, emat(scene, "mBagM", "#b07a3a", 0.1));
      bag.parent = sign; bag.position.set(0, 0, 0); bag.scaling.set(1, 1.1, 1);
      shadow.addShadowCaster(bag);
      const coin = cyl(scene, "mCoinIcon", 0.42, 0.42, 0.08, gold);
      coin.parent = sign; coin.position.set(0, 0, 0.4); coin.rotation.x = Math.PI / 2;
      this.coinIcon = coin;

      // Light so the merchant pops at the plaza.
      const glow = new BABYLON.PointLight("mGlow", new BABYLON.Vector3(0, 2.4, 0), scene);
      glow.parent = this.root; glow.diffuse = BABYLON.Color3.FromHexString("#ffd98a");
      glow.intensity = 0.6; glow.range = 8;
    }

    show() {
      if (this.visible) return;
      this.visible = true;
      this.root.setEnabled(true);
      this.it.enabled = true;
    }
    hide() {
      if (!this.visible) return;
      this.visible = false;
      this.root.setEnabled(false);
      this.it.enabled = false;
    }
    update(dt) {
      if (!this.visible) return;
      this.bob += dt;
      this.sign.position.y = 3.5 + Math.sin(this.bob * 2) * 0.12;
      this.coinIcon.rotation.y += dt * 2;
    }
  }

  // =========================================================================
  // Blacksmith — a burly NPC who appears at the plaza (beside the merchant)
  // between waves. Walk up + press E to open the ANVIL and spend coins to
  // ENHANCE weapons & equipment. Higher-rarity gear forges further and gains
  // more per level. Shares the Interactable contract like the merchant.
  // =========================================================================
  class Blacksmith {
    constructor(scene, shadow, interaction, onOpen) {
      const root = new BABYLON.TransformNode("smith", scene);
      root.position.set(-7, 0, 3); // off to the side of the plaza
      this.root = root;
      this.bob = 0;
      this._build(scene, shadow);

      this.it = new Interactable(root, { label: t("label.blacksmith"), range: 3.4, onInteract: () => onOpen() });
      this.it.enabled = false;
      interaction.register(this.it);
      root.setEnabled(false);
      this.visible = false;
    }

    _build(scene, shadow) {
      const apron = emat(scene, "sApron", "#5a3a2a", 0.06);
      const skin = emat(scene, "sSkin", "#e8b890", 0.06);
      const iron = emat(scene, "sIron", "#6a6f78", 0.1);
      const dark = emat(scene, "sDark", "#2a2530", 0.05);
      const gold = emat(scene, "sGold", "#ffcf3a", 0.5);
      const ember = emat(scene, "sEmber", "#ff7a3a", 0.7);
      const add = (m) => { m.parent = this.root; shadow.addShadowCaster(m); return m; };

      add(cyl(scene, "sBody", 1.0, 1.2, 1.5, apron)).position.y = 0.75;
      add(cyl(scene, "sBelt", 1.2, 1.2, 0.2, dark)).position.y = 1.1;
      const head = add(sphere(scene, "sHead", 0.6, skin)); head.position.y = 1.95;
      add(sphere(scene, "sBeard", 0.55, emat(scene, "sBeardM", "#3a2a22", 0.04))).position.set(0, 1.78, 0.18);
      for (const s of [-1, 1]) {
        const arm = add(capsule(scene, "sArm", 0.9, 0.22, skin)); arm.position.set(0.75 * s, 1.2, 0); arm.rotation.z = 0.4 * s;
        const eye = add(sphere(scene, "sEye", 0.08, emat(scene, "sEyeM", "#2a2a3a", 0))); eye.position.set(0.16 * s, 2.0, 0.5);
      }

      // An anvil + glowing forge beside the smith.
      const anvil = add(box(scene, "sAnvil", 1.2, 0.5, 0.6, iron)); anvil.position.set(1.4, 0.45, 0);
      add(box(scene, "sAnvilBase", 0.7, 0.4, 0.5, dark)).position.set(1.4, 0.2, 0);
      const forge = add(sphere(scene, "sForge", 0.5, ember)); forge.position.set(1.4, 0.75, 0); forge.scaling.y = 0.5;
      this.forge = forge;

      // Floating hammer marker so the smith is easy to spot.
      const sign = new BABYLON.TransformNode("sSign", scene);
      sign.parent = this.root; sign.position.y = 3.0; this.sign = sign;
      const handle = cyl(scene, "sHmH", 0.12, 0.12, 0.7, emat(scene, "sHmHM", "#7a5230", 0.05));
      handle.parent = sign; handle.rotation.z = 0.5;
      const headM = box(scene, "sHmHead", 0.5, 0.3, 0.3, iron); headM.parent = sign; headM.position.set(0.18, 0.32, 0);

      const glow = new BABYLON.PointLight("sGlow", new BABYLON.Vector3(1.4, 1, 0), scene);
      glow.parent = this.root; glow.diffuse = BABYLON.Color3.FromHexString("#ff7a3a");
      glow.intensity = 0.7; glow.range = 7;
      this.glow = glow;
    }

    show() { if (this.visible) return; this.visible = true; this.root.setEnabled(true); this.it.enabled = true; }
    hide() { if (!this.visible) return; this.visible = false; this.root.setEnabled(false); this.it.enabled = false; }
    update(dt) {
      if (!this.visible) return;
      this.bob += dt;
      this.sign.position.y = 3.0 + Math.sin(this.bob * 2) * 0.12;
      this.sign.rotation.y += dt * 1.5;
      // Flicker the forge glow.
      if (this.glow) this.glow.intensity = 0.6 + Math.abs(Math.sin(this.bob * 5)) * 0.5;
    }
  }

  // =========================================================================
  // ResourceNode — a harvestable spot in the world (cut a tree, mine rock or
  // crystal, gather herbs, cut fibers, collect water). Walk up + press E to
  // harvest its material; it depletes, then respawns after a cooldown. The raw
  // materials feed the crafting bench. Reuses the Interactable contract.
  // =========================================================================
  class ResourceNode {
    constructor(scene, shadow, interaction, pos, kind, player, state) {
      this.kind = kind; this.def = RESOURCE_KINDS[kind];
      this.respawn = 0; this.bob = rng() * Math.PI * 2;
      this.player = player; this.state = state;
      const root = new BABYLON.TransformNode("res_" + kind, scene);
      root.position.copyFrom(pos); this.root = root;
      this._build(scene, shadow);
      this.it = new Interactable(root, {
        label: tResourceLabel(this.kind), range: CONFIG.gatherRange,
        onInteract: () => this.harvest(),
      });
      interaction.register(this.it);
    }

    _build(scene, shadow) {
      const body = new BABYLON.TransformNode("resBody", scene);
      body.parent = this.root; this.body = body;
      const add = (m) => { m.parent = body; shadow.addShadowCaster(m); return m; };
      const matCol = (MATERIALS[this.def.mat] || {}).icon;
      if (this.kind === "tree") {
        add(cyl(scene, "rTrunk", 0.4, 0.55, 1.8, mat(scene, "rTrunkM", "#7a5230"))).position.y = 0.9;
        for (let k = 0; k < 3; k++) { const l = add(sphere(scene, "rLeaf", 1.6 + rng() * 0.6, mat(scene, "rLeaf" + this.root.uniqueId + k, "#3f9d4a"))); l.position.set((rng() - 0.5) * 0.5, 2.0 + k * 0.5, (rng() - 0.5) * 0.5); }
      } else if (this.kind === "rock") {
        const r = add(BABYLON.MeshBuilder.CreateIcoSphere("rRock", { radius: 0.9, subdivisions: 1 }, scene));
        r.material = mat(scene, "rRockM", "#9aa0a6"); r.position.y = 0.55; r.rotation.set(rng(), rng(), rng());
      } else if (this.kind === "crystal") {
        const base = add(BABYLON.MeshBuilder.CreateIcoSphere("rCb", { radius: 0.7, subdivisions: 1 }, scene));
        base.material = mat(scene, "rCbM", "#6a6f78"); base.position.y = 0.4;
        for (let k = 0; k < 3; k++) { const c = add(BABYLON.MeshBuilder.CreatePolyhedron("rC", { type: 1, size: 0.4 + rng() * 0.2 }, scene)); c.material = emat(scene, "rCM" + this.root.uniqueId + k, "#9fd0ff", 0.7); c.position.set((rng() - 0.5) * 0.6, 0.7 + rng() * 0.4, (rng() - 0.5) * 0.6); }
      } else if (this.kind === "herb") {
        for (let k = 0; k < 4; k++) { const s = add(cone(scene, "rHerb", 0.18, 0.0, 0.7, mat(scene, "rHerbM" + this.root.uniqueId + k, "#4caa4c"))); s.position.set((rng() - 0.5) * 0.5, 0.35, (rng() - 0.5) * 0.5); }
        const f = add(sphere(scene, "rFlow", 0.22, emat(scene, "rFlowM" + this.root.uniqueId, "#7ef07e", 0.4))); f.position.y = 0.7;
      } else if (this.kind === "fiber") {
        for (let k = 0; k < 5; k++) { const s = add(cyl(scene, "rReed", 0.06, 0.06, 1.2, mat(scene, "rReedM" + this.root.uniqueId + k, "#caa46a"))); s.position.set((rng() - 0.5) * 0.6, 0.6, (rng() - 0.5) * 0.6); s.rotation.z = (rng() - 0.5) * 0.4; }
      } else { // water
        const puddle = disc(scene, "rWater", 0.9, emat(scene, "rWaterM" + this.root.uniqueId, "#3aa0e0", 0.3));
        puddle.material.alpha = 0.85; puddle.rotation.x = Math.PI / 2; puddle.position.y = 0.06; puddle.parent = body; puddle.isPickable = false;
      }
      // A floating material icon so harvest spots are easy to read.
      const iconMat = emat(scene, "rIcon" + this.root.uniqueId, (MATERIALS[this.def.mat] || {}).tint || "#ffffff", 0.9);
      const icon = sphere(scene, "rIconM", 0.28, iconMat);
      icon.parent = body; icon.position.y = this.iconY = 2.7; icon.isPickable = false;
      icon.material.alpha = 0.85; this.icon = icon;
    }

    harvest() {
      if (this.respawn > 0) return;
      const [lo, hi] = this.def.amount;
      const n = lo + ((rng() * (hi - lo + 1)) | 0);
      addMaterial(this.player, this.def.mat, n);
      spawnImpact(this.state, this.root.position, "#cfe0b0", { y: 0.8, count: 7, spread: 3 });
      Sfx.play("hit");
      toast(t("toast.gathered", { icon: MATERIALS[this.def.mat].icon, n, label: tMaterialLabel(this.def.mat) }));
      this.respawn = this.def.respawn;
      this.body.setEnabled(false);
      this.it.enabled = false;
    }

    update(dt) {
      if (this.respawn > 0) {
        this.respawn -= dt;
        if (this.respawn <= 0) { this.body.setEnabled(true); this.it.enabled = true; }
        return;
      }
      this.bob += dt;
      if (this.icon) { this.icon.position.y = this.iconY + Math.sin(this.bob * 2) * 0.14; this.icon.rotation.y += dt * 1.4; }
    }
  }

  // =========================================================================
  // QuestGiver — a story NPC standing at a location. Walk up + press E to talk:
  // accept quests, check progress, and turn completed ones in for coins, gear or
  // a castle relic. A floating marker shows when a quest is ready (❗ new, ✓ turn
  // in). Reuses the Interactable contract.
  // =========================================================================
  class QuestGiver {
    constructor(scene, shadow, interaction, npcData, onTalk) {
      this.data = npcData; this.bob = rng() * Math.PI * 2;
      const loc = LOCATION_BY_ID[npcData.loc] || { x: 0, z: 0, color: "#ffd98a" };
      const root = new BABYLON.TransformNode("npc_" + npcData.id, scene);
      // Offset a little so the NPC stands beside its landmark, not on it.
      root.position.set(loc.x + 3, 0, loc.z + 3); this.root = root;
      this._build(scene, shadow, loc.color);
      this.it = new Interactable(root, { label: t("label.talkTo", { name: tNpcName(npcData.id) }), range: 3.6, onInteract: () => onTalk(this) });
      interaction.register(this.it);
    }

    // Tear down (everything is parented to root) when the hub streams out.
    dispose() { try { this.root.dispose(); } catch (e) {} }

    _build(scene, shadow, color) {
      const robe = emat(scene, "npcRobe" + this.root.uniqueId, color, 0.1);
      const skin = emat(scene, "npcSkin" + this.root.uniqueId, "#ffd9b8", 0.08);
      const hair = emat(scene, "npcHair" + this.root.uniqueId, "#5a3a2a", 0.06);
      const add = (m) => { m.parent = this.root; shadow.addShadowCaster(m); return m; };
      add(cone(scene, "npcBody", 0.9, 0.35, 1.4, robe)).position.y = 0.7;
      const head = add(sphere(scene, "npcHead", 0.5, skin)); head.position.y = 1.65;
      add(sphere(scene, "npcHair", 0.54, hair)).position.set(0, 1.78, -0.04);
      for (const s of [-1, 1]) { const eye = add(sphere(scene, "npcEye", 0.07, emat(scene, "npcEyeM" + this.root.uniqueId, "#2a2a3a", 0))); eye.position.set(0.13 * s, 1.66, 0.4); }
      // The floating "!" / "?" quest marker.
      const markMat = emat(scene, "npcMark" + this.root.uniqueId, "#ffd34e", 0.9);
      const mark = BABYLON.MeshBuilder.CreatePolyhedron("npcMarkM", { type: 0, size: 0.28 }, scene);
      mark.material = markMat; mark.parent = this.root; mark.position.y = 2.5; mark.isPickable = false;
      this.mark = mark; this.markMat = markMat;
      const glow = new BABYLON.PointLight("npcGlow" + this.root.uniqueId, new BABYLON.Vector3(0, 2, 0), scene);
      glow.parent = this.root; glow.diffuse = BABYLON.Color3.FromHexString(color); glow.intensity = 0.35; glow.range = 6;
    }

    // Returns the NPC's status for the marker + interaction prompt (delegates to
    // the campaign so the main-line giver lights up in the right order).
    status() { return Story.npcStatus(this.data.id); }

    update(dt) {
      this.bob += dt;
      this.mark.position.y = 2.5 + Math.sin(this.bob * 2) * 0.14;
      this.mark.rotation.y += dt * 1.6;
      const st = this.status();
      const col = st === "turnin" ? "#5be0a0" : st === "new" ? "#ffd34e" : st === "active" ? "#6cc6ff" : "#555a66";
      try { this.markMat.emissiveColor = BABYLON.Color3.FromHexString(col).scale(0.9); this.markMat.diffuseColor = BABYLON.Color3.FromHexString(col); } catch (e) {}
      this.mark.setEnabled(st !== "done");
      const nm = tNpcName(this.data.id);
      this.it.label = st === "turnin" ? t("label.turnIn", { name: nm }) : st === "new" ? t("label.newQuest", { name: nm }) : t("label.talkTo", { name: nm });
    }
  }

  // =========================================================================
  // CastleSite — the heart of the story. Stands on Castle Hill. Spend a castle
  // relic + coins to raise each of the five parts (foundation → walls → towers
  // → gate → keep), watching the castle grow in the world. Building the final
  // keep summons the DRAGON for the climactic battle. Walk up + press E to open
  // the build panel (CastleUI).
  // =========================================================================
  class CastleSite {
    constructor(scene, shadow, interaction, player, state) {
      this.scene = scene; this.shadow = shadow; this.player = player; this.state = state;
      this.built = [];
      const loc = LOCATION_BY_ID.castle;
      const root = new BABYLON.TransformNode("castleSite", scene);
      root.position.set(loc.x, 0, loc.z + 8); this.root = root;
      this.parts = {};
      this._build(scene, shadow);
      this.it = new Interactable(root, { label: t("label.buildCastle"), range: 6, onInteract: () => CastleUI.openPanel() });
      interaction.register(this.it);
    }

    _build(scene, shadow) {
      const stone = mat(scene, "csStone", "#b8b2a6");
      const stoneDk = mat(scene, "csStoneDk", "#8d887c");
      const roof = emat(scene, "csRoof", "#b5366a", 0.06);
      const gold = emat(scene, "csGold", "#ffcf3a", 0.4);
      const add = (m, parent) => { m.parent = parent || this.root; shadow.addShadowCaster(m); return m; };
      // A construction platform that's always present.
      const plat = disc(scene, "csPlat", 9, mat(scene, "csPlatM", "#caa46a"));
      plat.rotation.x = Math.PI / 2; plat.position.y = 0.05; plat.parent = this.root; plat.receiveShadows = true;

      const node = (id) => { const n = new BABYLON.TransformNode("cp_" + id, scene); n.parent = this.root; n.setEnabled(false); this.parts[id] = n; return n; };

      // foundation: a raised stone base.
      const fnd = node("foundation");
      add(cyl(scene, "csFnd", 14, 15, 1.0, stoneDk), fnd).position.y = 0.5;
      add(cyl(scene, "csFnd2", 12, 13, 0.6, stone), fnd).position.y = 1.1;

      // walls: a square curtain wall with crenellations.
      const walls = node("walls");
      for (const [dx, dz, w, d] of [[0, 6, 12, 1], [0, -6, 12, 1], [6, 0, 1, 12], [-6, 0, 1, 12]]) {
        add(box(scene, "csWall", w, 2.6, d, stone), walls).position.set(dx, 2.6, dz);
      }

      // towers: four corner spires with conical roofs.
      const towers = node("towers");
      for (const sx of [-6, 6]) for (const sz of [-6, 6]) {
        add(cyl(scene, "csTow", 2.2, 2.4, 5, stone), towers).position.set(sx, 3.7, sz);
        add(cone(scene, "csTowR", 2.6, 0.1, 2.4, roof), towers).position.set(sx, 7.0, sz);
      }

      // gate: a gatehouse on the south wall with a golden door.
      const gate = node("gate");
      add(box(scene, "csGate", 4.5, 4.5, 2, stoneDk), gate).position.set(0, 3.4, 6);
      add(box(scene, "csDoor", 2.4, 3.0, 0.4, gold), gate).position.set(0, 2.6, 7.1);

      // keep: a tall central tower with a banner.
      const keep = node("keep");
      add(cyl(scene, "csKeep", 4.5, 5, 9, stone), keep).position.set(0, 6.0, 0);
      add(cone(scene, "csKeepR", 5.2, 0.1, 4, roof), keep).position.set(0, 12.0, 0);
      const pole = add(cyl(scene, "csPole", 0.15, 0.15, 2.5, stoneDk), keep); pole.position.set(0, 15, 0);
      add(box(scene, "csFlag", 1.6, 1.0, 0.06, gold), keep).position.set(0.85, 15.4, 0);

      // A floating banner marker for the build site.
      const sign = new BABYLON.TransformNode("csSign", scene); sign.parent = this.root; sign.position.y = 3.0; this.sign = sign;
      const flag = box(scene, "csSignFlag", 1.2, 0.8, 0.06, gold); flag.parent = sign; flag.position.x = 0.4;
      const stick = cyl(scene, "csSignStick", 0.1, 0.1, 1.6, stoneDk); stick.parent = sign;
      this.bob = 0;
    }

    isBuilt(id) { return this.built.includes(id); }
    nextPart() { return CASTLE_PARTS.find((p) => !this.isBuilt(p.id)); }
    canBuild(part) {
      if (!part || this.isBuilt(part.id)) return false;
      const idx = CASTLE_PARTS.indexOf(part);
      if (idx > 0 && !this.isBuilt(CASTLE_PARTS[idx - 1].id)) return false; // must build in order
      return hasRelic(this.player, part.relic) && this.state.coins >= part.cost;
    }

    build(part) {
      if (!this.canBuild(part)) return false;
      // Consume the relic + coins.
      this.player.relics.splice(this.player.relics.indexOf(part.relic), 1);
      this.state.coins -= part.cost;
      updateCoins(this.state); updateRelicHud(this.player);
      this.built.push(part.id);
      const n = this.parts[part.id];
      if (n) { n.setEnabled(true); n.scaling.setAll(0.01); n._pop = 1; }
      spawnImpact(this.state, this.root.position, "#ffd34e", { y: 4, count: 16, spread: 6, up: 4 });
      Sfx.play("enhance");
      toast(t("toast.partRaised", { part: tCastlePartName(part.id) }));
      Quests.onBuild(part.id); // advance any "build this part" mission
      if (this.built.length >= CASTLE_PARTS.length) this._complete();
      return true;
    }

    // Rebuild instantly from a save (no animation, no dragon re-trigger).
    restore(builtIds) {
      this.built = (builtIds || []).filter((id) => CASTLE_PART_BY_ID[id]);
      for (const id of this.built) if (this.parts[id]) this.parts[id].setEnabled(true);
    }

    // Tear down the build site (everything is parented to root) when the hub
    // zone is streamed out.
    dispose() { try { this.root.dispose(); } catch (e) {} }

    // Re-awaken the dragon after a zone rebuild if the castle is already
    // complete and the dragon hasn't been beaten (no banner — it's already up).
    resummon() {
      if (this.built.length < CASTLE_PARTS.length || this.state.won || this.state.dragon) return;
      const pos = new BABYLON.Vector3(this.root.position.x, 0, this.root.position.z - 16);
      const dragon = new Dragon(this.scene, this.shadow, pos, this.state);
      this.state.dragon = dragon;
      this.state.monsters.push(dragon);
      showBossBar(dragon);
    }

    _complete() {
      toast(t("toast.castleComplete"));
      bannerWave(this.state.wave, 0, t("banner.theDragon"));
      // Summon the dragon a little in front of the castle.
      const pos = new BABYLON.Vector3(this.root.position.x, 0, this.root.position.z - 16);
      const dragon = new Dragon(this.scene, this.shadow, pos, this.state);
      this.state.dragon = dragon;
      this.state.monsters.push(dragon);
      showBossBar(dragon);
      Sfx.play("boss_spawn");
    }

    update(dt) {
      this.bob += dt;
      if (this.sign) { this.sign.position.y = 3.0 + Math.sin(this.bob * 2) * 0.12; this.sign.rotation.y += dt * 0.8; }
      // Pop newly-built parts up to full size.
      for (const id in this.parts) {
        const n = this.parts[id];
        if (n._pop) { const s = lerp(n.scaling.x, 1, 0.15); n.scaling.setAll(s); if (s > 0.99) { n.scaling.setAll(1); n._pop = 0; } }
      }
      const next = this.nextPart();
      this.it.label = next
        ? (this.canBuild(next) ? t("label.buildPart", { part: tCastlePartName(next.id) })
                               : t("label.castleNeed", { icon: next.icon, part: tCastlePartName(next.id) }))
        : t("label.castleComplete");
    }
  }

  // =========================================================================
  // Dragon — the final boss, summoned when the castle is finished. A huge winged
  // serpent that hovers, swoops and breathes fans of fire (Hazards). Shares the
  // boss interface (isBoss / hp / maxHp / name / update / hit / position) so the
  // health bar, projectile and contact systems treat it like a Sweet King, but
  // felling it WINS the game (see onMonsterDefeated → winGame).
  // =========================================================================
  class Dragon {
    constructor(scene, shadow, pos, state) {
      this.scene = scene; this.state = state;
      this.name = "Ancient Dragon";
      this.maxHp = CONFIG.dragonBaseHp; this.hp = this.maxHp;
      this.isBoss = true; this.isDragon = true;
      this.alive = true; this.dying = 0;
      this.radius = 3.2; this.contactDamage = CONFIG.dragonContactDamage; this.biteTimer = 0;
      this.bob = 0; this.actionTimer = 4; this.swoop = 0; this.hover = 7;
      this._build(scene, shadow, pos);
    }

    _build(scene, shadow, pos) {
      const root = new BABYLON.TransformNode("dragon", scene);
      root.position.copyFrom(pos); root.position.y = this.hover; this.root = root;
      const body = new BABYLON.TransformNode("dragonBody", scene); body.parent = root; this.body = body;
      const scale = emat(scene, "drgM" + root.uniqueId, "#9d2b2b", 0.16);
      const belly = emat(scene, "drgB" + root.uniqueId, "#e0a24e", 0.1);
      const wingM = emat(scene, "drgW" + root.uniqueId, "#5a1a1a", 0.08);
      const add = (m) => { m.parent = body; shadow.addShadowCaster(m); return m; };
      // Serpentine torso (stacked capsules) + tail.
      add(capsule(scene, "drgTor", 4.5, 1.5, scale)).position.set(0, 0, 0);
      add(sphere(scene, "drgBelly", 1.6, belly)).position.set(0, -0.3, 0.6);
      const neck = add(capsule(scene, "drgNeck", 2.6, 0.7, scale)); neck.position.set(0, 1.4, 1.6); neck.rotation.x = 0.8;
      const head = add(sphere(scene, "drgHead", 1.4, scale)); head.position.set(0, 2.6, 2.8); head.scaling.set(1, 0.9, 1.3);
      add(cone(scene, "drgSnout", 0.7, 0.1, 1.0, belly)).position.set(0, 2.5, 3.7);
      for (const s of [-1, 1]) {
        const horn = add(cone(scene, "drgHorn", 0.3, 0.02, 1.0, belly)); horn.position.set(0.4 * s, 3.4, 2.6); horn.rotation.x = -0.5;
        const eye = add(sphere(scene, "drgEye", 0.25, emat(scene, "drgEyeM" + root.uniqueId, "#ffd34e", 0.9))); eye.position.set(0.45 * s, 2.9, 3.3);
      }
      // Big bat wings on pivots so they can flap.
      this.wings = [];
      for (const s of [-1, 1]) {
        const pivot = new BABYLON.TransformNode("drgWP" + s, scene); pivot.parent = body; pivot.position.set(1.2 * s, 0.6, -0.2);
        const wing = box(scene, "drgWing", 4.5, 0.2, 3.2, wingM); wing.parent = pivot; wing.position.set(2.2 * s, 0, 0);
        shadow.addShadowCaster(wing); this.wings.push(pivot);
      }
      add(capsule(scene, "drgTail", 4.0, 0.6, scale)).position.set(0, -0.4, -3.0);
      // Fire origin + an ominous glow.
      this.fireTip = new BABYLON.TransformNode("drgFire", scene); this.fireTip.parent = body; this.fireTip.position.set(0, 2.5, 4.2);
      const glow = new BABYLON.PointLight("drgGlow", new BABYLON.Vector3(0, 0, 0), scene);
      glow.parent = root; glow.diffuse = BABYLON.Color3.FromHexString("#ff6a3a"); glow.intensity = 1.0; glow.range = 22; this.glow = glow;
      const blob = disc(scene, "drgBlob", 4.5, emat(scene, "drgBlobM" + root.uniqueId, "#000000", 0));
      blob.material.alpha = 0.28; blob.rotation.x = Math.PI / 2; blob.position.y = 0.05 - this.hover; blob.parent = root; blob.isPickable = false;
    }

    update(dt, playerPos, state) {
      if (this.biteTimer > 0) this.biteTimer -= dt;
      if (this.dying > 0) {
        this.dying -= dt;
        const k = Math.max(0, this.dying / 1.4);
        this.body.scaling.setAll(k);
        this.root.position.y = lerp(this.root.position.y, 0.5, 0.05);
        this.body.rotation.z += dt * 3;
        if (this.dying <= 0) { this.alive = false; this.root.dispose(); }
        return false;
      }
      this.bob += dt;
      // Wing flap + a gentle hover bob.
      const flap = Math.sin(this.bob * 4) * 0.6;
      if (this.wings) { this.wings[0].rotation.z = -flap; this.wings[1].rotation.z = flap; }

      const to = playerPos.subtract(this.root.position); to.y = 0;
      const dist = to.length();
      const dir = dist > 0.001 ? to.scale(1 / dist) : new BABYLON.Vector3(0, 0, 1);
      this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(dir.x, dir.z), 0.05);

      this.actionTimer -= dt;
      if (this.swoop > 0) {
        // Diving attack: drop low and rush the player.
        this.swoop -= dt;
        this.root.position.addInPlace(dir.scale(14 * dt));
        this.root.position.y = lerp(this.root.position.y, 2.2, 0.1);
        if (this.swoop <= 0) this.actionTimer = 3;
        return dist <= this.radius + 2.5;
      }
      // Hover at a stand-off, circling slightly.
      const targetY = this.hover + Math.sin(this.bob * 1.5) * 0.6;
      this.root.position.y = lerp(this.root.position.y, targetY, 0.04);
      const standoff = 16;
      if (dist > standoff) this.root.position.addInPlace(dir.scale(4 * dt));
      else this.root.position.addInPlace(new BABYLON.Vector3(-dir.z, 0, dir.x).scale(3 * dt)); // strafe

      if (this.actionTimer <= 0) {
        if (rng() < 0.6) this._breatheFire(playerPos, dir, state);
        else { this.swoop = 1.1; Sfx.play("boss_charge"); toast(t("toast.dragonDives")); }
        this.actionTimer = 3.2;
      }
      if (this.glow) this.glow.intensity = 0.9 + Math.abs(Math.sin(this.bob * 3)) * 0.6;
      return dist <= this.radius + 2.0;
    }

    _breatheFire(playerPos, dir, state) {
      Sfx.play("boss_cast");
      toast(t("toast.dragonBreath"));
      const origin = this.fireTip.getAbsolutePosition ? this.fireTip.getAbsolutePosition() : this.root.position;
      const base = Math.atan2(dir.x, dir.z);
      for (let i = 0; i < 7; i++) {
        const ang = base + (i - 3) * 0.16;
        const aim = new BABYLON.Vector3(Math.sin(ang), -0.05, Math.cos(ang));
        state.enemyBolts.push(new Hazard(this.scene, origin.clone ? origin.clone() : new BABYLON.Vector3(origin.x, origin.y, origin.z), aim, {
          speed: 22, damage: 16, gravity: 2.5, color: "#ff7a3a", radius: 1.1, life: 3,
        }));
      }
      spawnImpact(state, origin, "#ff7a3a", { y: 0, count: 14, spread: 5, up: 2 });
    }

    hit(dmg) {
      this.hp -= dmg;
      updateBossBar(this);
      if (this.hp <= 0 && this.dying <= 0) { this.dying = 1.4; return true; }
      this.body.scaling.setAll(1.06);
      if (this.body.scaling.x > 1) this.body.scaling.setAll(lerp(this.body.scaling.x, 1, 0.2));
      return false;
    }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // QUALITY TIER — one auto-detected graphics tier (high / medium / low) gates
  // the heavier lighting work (cascaded / contact-hardening shadows, bloom and
  // SSAO) so phones + weak GPUs stay smooth while desktops get the full
  // treatment. `pick()` is a PURE function of capability facts so the headless
  // harness can assert the mapping without a real device.
  // =========================================================================
  const Quality = {
    tier: "high",
    // Each tier carries lighting (Task 4) AND model fidelity (Task 3) knobs:
    //   pbr    — energy-conserving PBRMaterial vs the StandardMaterial fallback
    //   env    — install the procedural image-based-lighting probe (sky reflections)
    //   seg    — sphere segment count   (rounder silhouettes)
    //   tess   — cylinder/disc tessellation
    //   rockSub— icosphere subdivisions for rocks (craggier facets)
    //   foliage— extra-detail budget (0..1): layered canopies / rock + crystal clusters
    // The mobile tiers never exceed the old geometry density (phones stay smooth);
    // only the desktop "high" tier adds triangles + PBR + the IBL probe.
    TIERS: {
      high:   { shadowMap: 2048, shadowFilter: "contact", csm: true,  bloom: true,  ssao: true,
                shadowDarkness: 0.34, exposure: 1.08, contrast: 1.12, bloomWeight: 0.20, shadowMaxZ: 220,
                pbr: true,  env: true,  seg: 14, tess: 20, rockSub: 2, foliage: 1.0 },
      medium: { shadowMap: 1024, shadowFilter: "pcf",     csm: false, bloom: true,  ssao: false,
                shadowDarkness: 0.40, exposure: 1.02, contrast: 1.08, bloomWeight: 0.15, shadowMaxZ: 160,
                pbr: true,  env: false, seg: 12, tess: 16, rockSub: 1, foliage: 0.6 },
      low:    { shadowMap: 1024, shadowFilter: "blur",    csm: false, bloom: false, ssao: false,
                shadowDarkness: 0.46, exposure: 1.00, contrast: 1.04, bloomWeight: 0.00, shadowMaxZ: 120,
                pbr: false, env: false, seg: 10, tess: 12, rockSub: 1, foliage: 0.3 },
    },
    settings() { return this.TIERS[this.tier] || this.TIERS.high; },

    // Decide a tier from plain capability facts. Pure + deterministic.
    pick(info) {
      info = info || {};
      if (info.forced && this.TIERS[info.forced]) return info.forced;
      const cores = info.cores || 0, mem = info.mem || 0;
      if (info.mobile) {
        if ((mem && mem <= 3) || (cores && cores <= 4)) return "low";
        return "medium";
      }
      if ((cores && cores <= 2) || (mem && mem <= 2)) return "low";
      if ((cores && cores <= 4) || (mem && mem <= 4)) return "medium";
      return "high";
    },

    // Sniff the device once at boot. Every browser-only read is feature-detected
    // so the Node harness simply keeps the default tier. `window.__GG_QUALITY__`
    // (high|medium|low) forces a tier for debugging / weak-GPU overrides.
    detect() {
      const info = {};
      try {
        if (typeof navigator !== "undefined") {
          info.cores = navigator.hardwareConcurrency || 0;
          info.mem = navigator.deviceMemory || 0;
          const ua = navigator.userAgent || "";
          const coarse = typeof window !== "undefined" && window.matchMedia &&
            window.matchMedia("(pointer: coarse)").matches;
          info.mobile = /Android|iPhone|iPad|iPod|IEMobile|Mobile|Silk|Kindle/i.test(ua) ||
            (coarse && (navigator.maxTouchPoints || 0) > 1);
        }
        if (typeof window !== "undefined" && window.__GG_QUALITY__ && this.TIERS[window.__GG_QUALITY__]) {
          info.forced = window.__GG_QUALITY__;
        }
      } catch (e) {}
      this.tier = this.pick(info);
      return this.tier;
    },
  };

  // Pick a shadow-map filtering quality constant (guarded — the constants are
  // undefined in the headless harness, where this simply no-ops).
  function shadowFilterQuality(gen, level) {
    const SG = BABYLON.ShadowGenerator; if (!SG) return;
    const q = level === "high" ? SG.QUALITY_HIGH : level === "low" ? SG.QUALITY_LOW : SG.QUALITY_MEDIUM;
    if (q != null) gen.filteringQuality = q;
  }

  // Build the directional sun's shadow generator for a zone, tuned to the active
  // quality tier: a cascaded map with contact-hardening on capable desktops, PCF
  // on the middle tier, and the cheap blurred-exponential map elsewhere (and on
  // WebGL1). Bias / darkness are tuned so casters sit grounded with no acne, and
  // every engine-specific feature is detected so the harness stays green.
  function makeSunShadows(scene, sun, indoor, theme) {
    const q = Quality.settings();
    const eng = scene.getEngine && scene.getEngine();
    const webgl2 = !!(eng && eng.webGLVersion >= 2);
    const size = q.shadowMap;
    let gen = null, isCSM = false;
    if (q.csm && !indoor && BABYLON.CascadedShadowGenerator && webgl2) {
      try {
        gen = new BABYLON.CascadedShadowGenerator(size, sun);
        gen.numCascades = 4; gen.lambda = 0.85; gen.stabilizeCascades = true;
        gen.cascadeBlendPercentage = 0.06; gen.shadowMaxZ = q.shadowMaxZ;
        gen.autoCalcDepthBounds = true; gen.depthClamp = true;
        isCSM = true;
      } catch (e) { gen = null; }
    }
    if (!gen) gen = new BABYLON.ShadowGenerator(size, sun);

    // Filtering — crisp PCF / contact-hardening where supported, else cheap blur.
    try {
      if (q.shadowFilter === "contact" && webgl2 && "useContactHardeningShadow" in gen) {
        gen.useContactHardeningShadow = true;
        gen.contactHardeningLightSizeUVRatio = 0.04;
        shadowFilterQuality(gen, "high");
      } else if ((q.shadowFilter === "contact" || q.shadowFilter === "pcf") && webgl2) {
        gen.usePercentageCloserFiltering = true;
        shadowFilterQuality(gen, q.shadowFilter === "contact" ? "high" : "medium");
      } else {
        gen.useBlurExponentialShadowMap = true; gen.blurScale = 2;
      }
    } catch (e) {
      try { gen.useBlurExponentialShadowMap = true; gen.blurScale = 2; } catch (e2) {}
    }

    // Grounded contact: tuned bias + a per-zone shadow darkness. (Babylon's
    // `darkness` is the lit factor inside a shadow: lower = blacker/crisper; the
    // indoor lairs lift theirs so shadows don't crush to black on a dark floor.)
    try {
      gen.bias = isCSM ? 0.0025 : 0.0016;
      gen.normalBias = isCSM ? 0.020 : 0.012;
      gen.frustumEdgeFalloff = 0.2;
      const dark = (theme && theme.shadowDark != null) ? theme.shadowDark : q.shadowDarkness;
      if (gen.setDarkness) gen.setDarkness(dark); else gen.darkness = dark;
    } catch (e) {}
    return gen;
  }

  // One-time camera post-processing: ACES tone mapping + exposure so every
  // material sits in a coherent, filmic light, plus tier-gated bloom (emissive
  // lamps / crystals / artifacts glow) and high-end SSAO (soft contact AO). All
  // of it is feature-detected + try/caught, so unsupported GPUs and the headless
  // harness just run without it. The scene + camera outlive every zone, so this
  // is set up once; the returned handles are kept for the whole session.
  function setupPostFX(scene, camera) {
    const q = Quality.settings();
    const out = { pipeline: null, ssao: null };

    // Tone mapping lives on the scene image-processing config (applied in-shader
    // on the low tier, routed through the bloom post-process when one is built).
    try {
      const ip = scene && scene.imageProcessingConfiguration;
      const IPC = BABYLON.ImageProcessingConfiguration;
      if (ip) {
        ip.toneMappingEnabled = true;
        if (IPC && IPC.TONEMAPPING_ACES != null) ip.toneMappingType = IPC.TONEMAPPING_ACES;
        ip.exposure = q.exposure;
        ip.contrast = q.contrast;
      }
    } catch (e) {}

    // SSAO first (its combine must run before tone mapping) — high tier only.
    try {
      const S = BABYLON.SSAO2RenderingPipeline;
      if (q.ssao && camera && S && S.IsSupported) {
        const ssao = new S("ggSSAO", scene, { ssaoRatio: 0.6, blurRatio: 1 }, [camera]);
        ssao.radius = 1.2; ssao.totalStrength = 0.8; ssao.base = 0.35;
        ssao.samples = 16; ssao.maxZ = 110; ssao.expensiveBlur = false;
        out.ssao = ssao;
      }
    } catch (e) { out.ssao = null; }

    // Subtle bloom (+ FXAA) on the middle and high tiers.
    try {
      const DRP = BABYLON.DefaultRenderingPipeline;
      if (q.bloom && camera && DRP) {
        const p = new DRP("ggFX", true, scene, [camera]);
        p.bloomEnabled = true; p.bloomThreshold = 0.88; p.bloomWeight = q.bloomWeight;
        p.bloomKernel = 32; p.bloomScale = 0.5; p.fxaaEnabled = true;
        out.pipeline = p;
      }
    } catch (e) { out.pipeline = null; }
    return out;
  }

  // Per-zone light mood: each zone nudges the scene exposure / contrast so open
  // lands read bright and airy while indoor lairs feel moody and contrasty. Kept
  // in sync with DayNight / Weather, which still own the sun / sky / fog tinting.
  function applyZoneMood(scene, zone) {
    try {
      const ip = scene && scene.imageProcessingConfiguration; if (!ip) return;
      const q = Quality.settings(), th = (zone && zone.theme) || {};
      const indoor = !!(zone && zone.indoor);
      const expMul = th.expMul != null ? th.expMul : (indoor ? 0.92 : 1);
      const conMul = th.conMul != null ? th.conMul : (indoor ? 1.06 : 1);
      ip.exposure = q.exposure * expMul;
      ip.contrast = q.contrast * conMul;
    } catch (e) {}
  }

  // A tiny procedural image-based-lighting probe: a 6-face gradient cube (warm
  // sky overhead → cool horizon → dark ground, with a soft sun glow) that PBR
  // materials sample for gentle sky reflections + ambient fill. No asset files —
  // ~6 KB of pixels generated once and shared by every zone for the session.
  // Feature-detected (RawCubeTexture only), tier-gated (high) and try/caught, so
  // weak GPUs / the headless harness skip it and PBR falls back to direct light.
  // ENV_ON tells pbrMat() whether to let materials pick the probe up.
  let ENV_ON = false, envTex = null;
  function makeEnvironment(scene) {
    ENV_ON = false; envTex = null;
    try {
      if (!scene || !Quality.settings().env || !BABYLON.RawCubeTexture) return null;
      const N = 16;
      // Per-face direction basis — Babylon cube-face order: +X,-X,+Y,-Y,+Z,-Z.
      const basis = [
        { u: [0, 0, -1], v: [0, -1, 0], n: [1, 0, 0] },
        { u: [0, 0, 1],  v: [0, -1, 0], n: [-1, 0, 0] },
        { u: [1, 0, 0],  v: [0, 0, 1],  n: [0, 1, 0] },
        { u: [1, 0, 0],  v: [0, 0, -1], n: [0, -1, 0] },
        { u: [1, 0, 0],  v: [0, -1, 0], n: [0, 0, 1] },
        { u: [-1, 0, 0], v: [0, -1, 0], n: [0, 0, -1] },
      ];
      const sky = [0.62, 0.78, 1.0], horizon = [0.86, 0.84, 0.78];
      const grnd = [0.22, 0.20, 0.17], sunC = [1.0, 0.93, 0.78];
      let sx = -0.4, sy = 0.78, sz = -0.32; // roughly the directional sun
      const slen = Math.hypot(sx, sy, sz) || 1; sx /= slen; sy /= slen; sz /= slen;
      const faces = [];
      for (let f = 0; f < 6; f++) {
        const b = basis[f], data = new Uint8Array(N * N * 4);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const fx = ((x + 0.5) / N) * 2 - 1, fy = ((y + 0.5) / N) * 2 - 1;
          let dx = b.n[0] + b.u[0] * fx + b.v[0] * fy;
          let dy = b.n[1] + b.u[1] * fx + b.v[1] * fy;
          let dz = b.n[2] + b.u[2] * fx + b.v[2] * fy;
          const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
          const up = Math.max(-1, Math.min(1, dy));
          let r, g, bl;
          if (up >= 0) { const t = up; r = horizon[0] + (sky[0] - horizon[0]) * t; g = horizon[1] + (sky[1] - horizon[1]) * t; bl = horizon[2] + (sky[2] - horizon[2]) * t; }
          else { const t = -up; r = horizon[0] + (grnd[0] - horizon[0]) * t; g = horizon[1] + (grnd[1] - horizon[1]) * t; bl = horizon[2] + (grnd[2] - horizon[2]) * t; }
          const sd = Math.max(0, dx * sx + dy * sy + dz * sz);
          const glow = Math.pow(sd, 24) * 0.85 + Math.pow(sd, 4) * 0.12;
          r = Math.min(1, r + sunC[0] * glow); g = Math.min(1, g + sunC[1] * glow); bl = Math.min(1, bl + sunC[2] * glow);
          const o = (y * N + x) * 4;
          data[o] = (r * 255) | 0; data[o + 1] = (g * 255) | 0; data[o + 2] = (bl * 255) | 0; data[o + 3] = 255;
        }
        faces.push(data);
      }
      const tex = new BABYLON.RawCubeTexture(scene, faces, N);
      tex.name = "ggEnv"; tex.gammaSpace = true;
      scene.environmentTexture = tex;
      if ("environmentIntensity" in scene) scene.environmentIntensity = 0.55;
      ENV_ON = true; envTex = tex;
      return tex;
    } catch (e) { ENV_ON = false; envTex = null; return null; }
  }

  // =========================================================================
  // World — procedural environment.
  // =========================================================================
  function buildWorld(scene, zone) {
    zone = zone || ZONE_BY_ID[HUB_ZONE];
    const T = zone.theme;
    const RADIUS = zone.radius;
    const SC = zone.scenery || {};
    const indoor = !!zone.indoor;

    // Snapshot what already exists so the returned dispose() can tear down
    // EXACTLY this zone's scenery on travel (leaving the player + camera intact).
    const _bMesh = new Set(scene.meshes || []);
    const _bTN = new Set(scene.transformNodes || []);
    const _bMat = new Set(scene.materials || []);

    scene.clearColor = BABYLON.Color3.FromHexString(T.sky).toColor4(1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogColor = BABYLON.Color3.FromHexString(T.fog);
    scene.fogDensity = T.fogDensity;

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = indoor ? 0.7 : 1.0; hemi.groundColor = BABYLON.Color3.FromHexString(T.hemi);
    const sd = T.sunDir || [-0.5, -1, -0.4];
    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(sd[0], sd[1], sd[2]), scene);
    sun.position = new BABYLON.Vector3(-sd[0] * 120, 90, -sd[2] * 120); sun.intensity = 1.0;
    sun.diffuse = BABYLON.Color3.FromHexString(T.sun);
    // Tighten the shadow frustum to the playable area so the map keeps its
    // resolution where it matters (auto-extends follow the registered casters).
    sun.autoUpdateExtends = true; sun.autoCalcShadowZBounds = true;
    sun.shadowMinZ = 1; sun.shadowMaxZ = Quality.settings().shadowMaxZ;

    // Sun shadows — quality-tiered (cascaded / contact-hardening on capable GPUs,
    // cheap blurred-exponential elsewhere), grounded and tuned per zone.
    const shadow = makeSunShadows(scene, sun, indoor, T);

    const GROUND = RADIUS * 2 + 60; // a generous skirt beyond the fence

    // Ground — themed per zone (grass / sand / snow / cavern floor).
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: GROUND, height: GROUND }, scene);
    ground.material = mat(scene, "grnd", T.ground); ground.receiveShadows = true;

    // ---- BACKDROP: a sky dome, a surrounding SEA, distant MOUNTAINS and a
    // shoreline skirt. All purely decorative (no collision). The day/night +
    // weather systems tint the sky/sun/fog returned here. ----
    // The sky dome is a pure unlit emissive backdrop (DayNight repaints it), which
    // is exactly StandardMaterial's job — keep it off the PBR path.
    const skyMat = stdEmat(scene, "sky", T.sky, 1.0);
    skyMat.backFaceCulling = false; skyMat.disableLighting = true;
    const sky = BABYLON.MeshBuilder.CreateSphere("skyDome", { diameter: 900, segments: 16, sideOrientation: 1 }, scene);
    sky.material = skyMat; sky.infiniteDistance = true; sky.isPickable = false;

    // The sea: a vast plane just below the zone, lapping at its shores (dark in
    // the indoor cavern/thicket so it reads as a void rather than ocean).
    const seaCol = indoor ? "#0a0814" : "#2c78c8";
    const seaMat = stdEmat(scene, "sea", seaCol, indoor ? 0.05 : 0.16);
    seaMat.specularColor = new BABYLON.Color3(0.4, 0.5, 0.6);
    const sea = BABYLON.MeshBuilder.CreateGround("sea", { width: 1600, height: 1600 }, scene);
    sea.material = seaMat; sea.position.y = -0.35; sea.isPickable = false;

    // A skirt around the edge — sandy outdoors, blended into the floor indoors.
    const beach = BABYLON.MeshBuilder.CreateGround("beach", { width: GROUND + 26, height: GROUND + 26 }, scene);
    beach.material = mat(scene, "beachM", indoor ? T.ground : "#e6d2a0");
    beach.position.y = -0.08; beach.receiveShadows = true; beach.isPickable = false;

    // Distant snow-capped mountains ringing the horizon (outdoor zones only).
    if (!indoor) {
      const rockFar = mat(scene, "mtnRock", "#7c8696");
      const snowFar = emat(scene, "mtnSnow", "#eef4ff", 0.05);
      const mtnCount = 30;
      for (let i = 0; i < mtnCount; i++) {
        const a = (i / mtnCount) * Math.PI * 2 + rng() * 0.1;
        const r = 165 + rng() * 90;
        const h = 34 + rng() * 46;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const m = cone(scene, "mtn", 26 + rng() * 22, 0.5, h, rockFar);
        m.position.set(x, h / 2 - 1, z); m.isPickable = false;
        const cap = cone(scene, "mtnCap", (10 + rng() * 6), 0.2, h * 0.34, snowFar);
        cap.position.set(x, h - h * 0.17 - 1, z); cap.isPickable = false;
      }
    }

    // ---- Solid scenery is tracked here as {x,z,r} circles for collision. ----
    const obstacles = [];
    const addObstacle = (x, z, r) => obstacles.push({ x, z, r });
    const portals = [];

    // Hub-only helpers default to no-ops so the wild zones share one code path.
    let onRoad = () => false;
    let inRiver = () => false;
    let clearOfRiver = () => true;
    let water = null, waterMat = null;
    const FAR = RADIUS - 6;
    let baseWaterY = 0;
    const animated = []; // {orb, y} markers bobbed by the per-frame observable

    // =====================================================================
    // HOME HUB (Meadowgate Vale): the village river + bridges, the crossroads
    // and plaza, the lampposts and the named-landmark beacons. The wild zones
    // skip all of this and get a themed wilderness instead.
    // =====================================================================
    if (zone.home) {
      const riverAngle = 0.5 + rng() * 0.7;
      const ca = Math.cos(riverAngle), sa = Math.sin(riverAngle);
      const crossN = { x: ca, z: -sa };            // perpendicular to the flow
      const alongT = { x: sa, z: ca };             // direction of flow
      const riverPerp = 30 + rng() * 6;    // offset of the river from centre
      const riverHalf = 6.5;                        // half-width of the water
      const bridgeHalf = 5;                         // half-length of each bridge gap
      const bridges = [0, 52, -52];                 // crossing points along the flow

      const signedPerp = (x, z) => x * crossN.x + z * crossN.z;
      const tangent = (x, z) => x * alongT.x + z * alongT.z;
      const onBridge = (x, z) => {
        const t = tangent(x, z);
        for (const b of bridges) if (Math.abs(t - b) < bridgeHalf) return true;
        return false;
      };
      // True if a point sits in open water (blocks movement); bridges are walkable.
      inRiver = (x, z) => Math.abs(signedPerp(x, z) - riverPerp) < riverHalf && !onBridge(x, z);
      clearOfRiver = (x, z) => Math.abs(signedPerp(x, z) - riverPerp) > riverHalf + 1.5;

      // Water surface (a long translucent blue band) + darker muddy banks.
      const riverCenter = { x: riverPerp * crossN.x, z: riverPerp * crossN.z };
      const riverLen = GROUND;
      const bank = BABYLON.MeshBuilder.CreateGround("bank", { width: riverHalf * 2 + 4, height: riverLen }, scene);
      bank.rotation.y = riverAngle; bank.position.set(riverCenter.x, 0.015, riverCenter.z);
      bank.material = mat(scene, "bank", "#5c4a32"); bank.receiveShadows = true;
      waterMat = stdEmat(scene, "water", "#3aa0e0", 0.18);
      waterMat.alpha = 0.82; waterMat.specularColor = new BABYLON.Color3(0.5, 0.6, 0.7);
      water = BABYLON.MeshBuilder.CreateGround("water", { width: riverHalf * 2, height: riverLen }, scene);
      water.rotation.y = riverAngle; water.position.set(riverCenter.x, 0.05, riverCenter.z);
      water.material = waterMat; water.isPickable = false;
      baseWaterY = water.position.y;

      // Lily pads floating on the water (purely decorative).
      const padMat = mat(scene, "pad", "#2f8f4a");
      for (let i = 0; i < 14; i++) {
        const t = (rng() - 0.5) * riverLen * 0.8;
        if (Math.abs((((t) % 52) + 52) % 52) < bridgeHalf + 1) continue; // not on a bridge
        const off = (rng() - 0.5) * (riverHalf * 1.4);
        const x = riverCenter.x + alongT.x * t + crossN.x * off;
        const z = riverCenter.z + alongT.z * t + crossN.z * off;
        const pad = disc(scene, "pad", 0.5 + rng() * 0.4, padMat);
        pad.rotation.x = Math.PI / 2; pad.position.set(x, 0.08, z); pad.isPickable = false;
      }

      // Bridges — a wooden plank deck + rails at each crossing.
      const plankMat = mat(scene, "plank", "#9a6a3a");
      const railMat = mat(scene, "rail", "#7a5230");
      for (const b of bridges) {
        const cx = riverCenter.x + alongT.x * b;
        const cz = riverCenter.z + alongT.z * b;
        const deck = box(scene, "bridge", riverHalf * 2 + 5, 0.25, bridgeHalf * 2, plankMat);
        deck.rotation.y = riverAngle; deck.position.set(cx, 0.12, cz); deck.receiveShadows = true;
        shadow.addShadowCaster(deck);
        for (const side of [-1, 1]) {
          const rail = box(scene, "rail", riverHalf * 2 + 5, 0.5, 0.18, railMat);
          rail.rotation.y = riverAngle;
          rail.position.set(cx + alongT.x * (bridgeHalf - 0.2) * side, 0.5, cz + alongT.z * (bridgeHalf - 0.2) * side);
          shadow.addShadowCaster(rail);
        }
      }

      // ---- Roads: a randomly oriented crossroads of grey strips. ----
      const roadMat = mat(scene, "road", "#6b6f78");
      const roadEdge = mat(scene, "roadEdge", "#d9c47a");
      const baseAngle = rng() * Math.PI;
      const roadAngles = [baseAngle, baseAngle + Math.PI / 2];
      for (const ang of roadAngles) {
        const road = BABYLON.MeshBuilder.CreateGround("road", { width: 7, height: GROUND }, scene);
        road.rotation.y = ang; road.position.y = 0.02; road.material = roadMat; road.receiveShadows = true;
        for (const side of [-1, 1]) {
          const edge = BABYLON.MeshBuilder.CreateGround("edge", { width: 0.35, height: GROUND }, scene);
          edge.rotation.y = ang; edge.position.y = 0.03; edge.material = roadEdge;
          edge.position.x = Math.cos(ang) * 3.3 * side;
          edge.position.z = -Math.sin(ang) * 3.3 * side;
        }
      }

      // Central plaza.
      const plaza = disc(scene, "plaza", 5, mat(scene, "plaza", "#caa46a"));
      plaza.rotation.x = Math.PI / 2; plaza.position.y = 0.04; plaza.receiveShadows = true;

      // Helper: are we on/near a road centerline? (keep trees off the roads)
      onRoad = (x, z) => {
        for (const ang of roadAngles) {
          const perp = Math.abs(x * Math.sin(ang) - z * Math.cos(ang));
          if (perp < 5) return true;
        }
        return false;
      };

      // ---- Lampposts marching along the roads (emissive, no extra GPU lights). ----
      const poleMat = mat(scene, "pole", "#3a3f4a");
      const lampMat = emat(scene, "lamp", "#ffe6a0", 0.9);
      for (const ang of roadAngles) {
        for (let d = -FAR + 8; d <= FAR - 8; d += 18) {
          for (const side of [-1, 1]) {
            const x = Math.cos(ang) * d + Math.sin(ang) * 4.4 * side;
            const z = -Math.sin(ang) * d + Math.cos(ang) * 4.4 * side;
            if (Math.hypot(x, z) > FAR || inRiver(x, z)) continue;
            const pole = cyl(scene, "pole", 0.18, 0.22, 3.2, poleMat);
            pole.position.set(x, 1.6, z); shadow.addShadowCaster(pole);
            const lamp = sphere(scene, "lamp", 0.5, lampMat);
            lamp.position.set(x, 3.35, z); lamp.isPickable = false;
            addObstacle(x, z, 0.4);
          }
        }
      }

      // ---- Cattails / reeds hugging the riverbank (decorative). ----
      const reedMat = mat(scene, "reed", "#3c8a3c");
      const catMat = mat(scene, "cat", "#6b4a2a");
      for (let i = 0; i < 40; i++) {
        const t = (rng() - 0.5) * riverLen * 0.85;
        const off = (riverHalf + 0.6 + rng() * 1.2) * (rng() < 0.5 ? 1 : -1);
        const x = riverCenter.x + alongT.x * t + crossN.x * off;
        const z = riverCenter.z + alongT.z * t + crossN.z * off;
        if (Math.hypot(x, z) > FAR) continue;
        const stem = cyl(scene, "reed", 0.05, 0.05, 1.1 + rng() * 0.6, reedMat);
        stem.position.set(x, 0.6, z);
        const head = capsule(scene, "cattail", 0.4, 0.09, catMat);
        head.position.set(x, 1.25, z);
      }

      // ---- Location beacons: a glowing pillar + floating icon orb at every
      // named landmark, so the story's places are easy to spot from afar. ----
      for (const loc of LOCATIONS) {
        const bm = emat(scene, "beacon_" + loc.id, loc.color, 0.9);
        const plat = disc(scene, "locPlat_" + loc.id, 4.5, mat(scene, "locPlatM_" + loc.id, "#caa46a"));
        plat.rotation.x = Math.PI / 2; plat.position.set(loc.x, 0.05, loc.z); plat.receiveShadows = true; plat.isPickable = false;
        const pillar = cyl(scene, "locPillar_" + loc.id, 0.5, 0.7, 14, bm);
        pillar.position.set(loc.x, 7, loc.z); pillar.material.alpha = 0.32; pillar.isPickable = false;
        const orb = sphere(scene, "locOrb_" + loc.id, 1.0, bm);
        orb.position.set(loc.x, 15, loc.z); orb.isPickable = false;
        animated.push({ orb, y: 15 });
      }
    }

    // Find a valid scatter spot: away from the centre, roads and water, inside
    // the fence. Shared by every zone (hub helpers are no-ops in the wild).
    const place = (minR, maxR) => {
      for (let tries = 0; tries < 18; tries++) {
        const ang = rng() * Math.PI * 2;
        const r = minR + rng() * (maxR - minR);
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        if (r > minR - 0.001 && !onRoad(x, z) && clearOfRiver(x, z)) return { x, z };
      }
      return null;
    };

    // =====================================================================
    // SCENERY — driven by the zone's spec so each location looks distinct:
    // trees, rocks, bushes, toadstools, flowers, plus palms (shore), crystals
    // (peaks/caverns) and cave pillars (caverns).
    // =====================================================================
    const trunkMat = mat(scene, "trunk", indoor ? "#3a2a1c" : "#7a5230");
    const leafCols = indoor ? ["#27451f", "#1f3a18", "#2c5022"]
      : (zone.id === "peaks") ? ["#cfe0d0", "#b8d8c4", "#9fc7b0"]
      : (zone.id === "forest" || zone.id === "thicket") ? ["#2f8f3a", "#247a30", "#36a142"]
      : ["#3f9d4a", "#46ad53", "#379142"];
    const leafMats = leafCols.map((c, i) => mat(scene, "leaf" + i, c));
    // Model-fidelity budget for this tier (see Quality.TIERS): extra canopy/rock/
    // crystal detail and rounder rocks only where the GPU can afford it.
    const foliage = Quality.settings().foliage || 0.3;
    const rockSub = Quality.settings().rockSub || 1;
    const richDetail = foliage >= 0.9; // desktop "high" only

    // ---- Trees: a tapered trunk + a layered, rounded canopy — a darker shaded
    // base lobe, brighter lobes stacked above, swaying as one. (Lobe count stays
    // modest so the dense forests keep their triangle budget; the high tier adds a
    // small bright crown tuft.) ----
    const swayers = []; // {mesh, baseRot, phase, amp}
    const nTrees = SC.trees || 0;
    for (let i = 0; i < nTrees; i++) {
      const p = place(7, FAR); if (!p) continue;
      const h = 1.3 + rng() * 1.0;
      const trunk = cyl(scene, "trunk", 0.28, 0.62, h * 1.5, trunkMat); // tapered
      trunk.position.set(p.x, h * 0.75, p.z); shadow.addShadowCaster(trunk);
      const li = (rng() * leafMats.length) | 0;
      const lm = leafMats[li];
      const darkLm = leafMats[Math.min(leafMats.length - 1, li + 1)] || lm;
      const crown = new BABYLON.TransformNode("crown", scene);
      crown.position.set(p.x, h * 1.5, p.z);
      const n = 2 + ((rng() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const lobeMat = k === 0 ? darkLm : lm;        // a shaded base lobe
        const size = (2.1 - k * 0.28) + rng() * 0.5;  // bigger low, smaller up
        const leaf = sphere(scene, "leaf", size, lobeMat);
        leaf.parent = crown;
        leaf.position.set((rng() - 0.5) * 0.7, 0.5 + k * 0.62, (rng() - 0.5) * 0.7);
        leaf.scaling.y = 1.08; shadow.addShadowCaster(leaf);
      }
      // Draw the rng for the crown tuft UNCONDITIONALLY (so the seeded world layout
      // is identical on every graphics tier); only the mesh is gated to the high tier.
      const tipSize = 1.0 + rng() * 0.4, tipX = (rng() - 0.5) * 0.4, tipZ = (rng() - 0.5) * 0.4;
      if (richDetail) {                                // bright crown tuft (high tier)
        const tip = sphere(scene, "leafTip", tipSize, lm);
        tip.parent = crown; tip.position.set(tipX, 0.5 + n * 0.62, tipZ);
        shadow.addShadowCaster(tip);
      }
      swayers.push({ mesh: crown, phase: rng() * Math.PI * 2, amp: 0.03 + rng() * 0.03 });
      addObstacle(p.x, p.z, 0.9);
    }

    // ---- Palms (shore): a leaning trunk with a drooping frond crown. ----
    const nPalms = SC.palms || 0;
    if (nPalms) {
      const palmTrunk = mat(scene, "palmTr", "#a07a44");
      const frondMat = mat(scene, "frond", "#46a850");
      for (let i = 0; i < nPalms; i++) {
        const p = place(8, FAR); if (!p) continue;
        const h = 3 + rng() * 1.6;
        const tr = cyl(scene, "palm", 0.28, 0.42, h, palmTrunk);
        tr.position.set(p.x, h / 2, p.z); tr.rotation.z = (rng() - 0.5) * 0.3; shadow.addShadowCaster(tr);
        const crown = new BABYLON.TransformNode("palmCrown", scene);
        crown.position.set(p.x, h, p.z);
        for (let f = 0; f < 6; f++) {
          const fr = box(scene, "pfrond", 2.4, 0.08, 0.5, frondMat);
          fr.parent = crown; fr.rotation.y = (f / 6) * Math.PI * 2; fr.rotation.z = 0.5;
          fr.position.set(Math.cos((f / 6) * Math.PI * 2) * 1.1, 0, Math.sin((f / 6) * Math.PI * 2) * 1.1);
          shadow.addShadowCaster(fr);
        }
        swayers.push({ mesh: crown, phase: rng() * Math.PI * 2, amp: 0.05 + rng() * 0.04 });
        addObstacle(p.x, p.z, 0.6);
      }
    }

    // ---- Rocks (craggier icospheres on the high tier; a flatter, boulder-like
    // silhouette; matte under PBR so they read as stone, not plastic). ----
    const rockMat = mat(scene, "rock", indoor ? "#4a4258" : (zone.id === "peaks" ? "#b9c4d2" : "#9aa0a6"));
    if (rockMat._ggPBR) rockMat.roughness = 0.96;
    const nRocks = SC.rocks || 0;
    for (let i = 0; i < nRocks; i++) {
      const p = place(6, FAR); if (!p) continue;
      const rad = 0.5 + rng() * 0.9;
      const rock = BABYLON.MeshBuilder.CreateIcoSphere("rock", { radius: rad, subdivisions: rockSub }, scene);
      rock.material = rockMat; rock.position.set(p.x, rad * 0.55, p.z);
      rock.rotation.set(rng(), rng(), rng()); rock.scaling.set(1, 0.74 + rng() * 0.3, 1);
      shadow.addShadowCaster(rock);
      // Satellite-chunk rng drawn unconditionally (tier-independent world layout).
      const bit = rng() < 0.6, bitX = rad * (0.7 + rng() * 0.4), bitZ = (rng() - 0.5) * rad;
      const bitRX = rng(), bitRY = rng(), bitRZ = rng();
      if (richDetail && bit) {                          // a smaller chunk beside it
        const r2 = BABYLON.MeshBuilder.CreateIcoSphere("rockBit", { radius: rad * 0.5, subdivisions: rockSub }, scene);
        r2.material = rockMat; r2.position.set(p.x + bitX, rad * 0.3, p.z + bitZ);
        r2.rotation.set(bitRX, bitRY, bitRZ); shadow.addShadowCaster(r2);
      }
      addObstacle(p.x, p.z, rad * 0.85);
    }

    // ---- Bushes (clusters of leafy spheres). ----
    const nBush = SC.bushes || 0;
    for (let i = 0; i < nBush; i++) {
      const p = place(6, FAR); if (!p) continue;
      const lm = leafMats[(rng() * leafMats.length) | 0];
      const lobes = 3 + ((rng() * 2) | 0);
      const bush = new BABYLON.TransformNode("bushN", scene); bush.position.set(p.x, 0, p.z);
      for (let k = 0; k < lobes; k++) {
        const b = sphere(scene, "bush", 0.7 + rng() * 0.5, lm);
        b.parent = bush; b.position.set((rng() - 0.5) * 1.1, 0.45, (rng() - 0.5) * 1.1);
        b.scaling.y = 0.85; shadow.addShadowCaster(b);
      }
      swayers.push({ mesh: bush, phase: rng() * Math.PI * 2, amp: 0.02 + rng() * 0.02 });
      addObstacle(p.x, p.z, 0.85);
    }

    // ---- Giant toadstools (red cap + cream stalk). ----
    const nToad = SC.toadstools || 0;
    if (nToad) {
      const stalkMat = mat(scene, "stalk", "#f3e6c8");
      const capMat = mat(scene, "cap", indoor ? "#7a3aa8" : "#d83a3a");
      const spotMat = mat(scene, "spot", "#fff2e0");
      for (let i = 0; i < nToad; i++) {
        const p = place(6, FAR); if (!p) continue;
        const h = 0.8 + rng() * 0.7;
        const stalk = cyl(scene, "stalk", 0.4, 0.55, h, stalkMat);
        stalk.position.set(p.x, h / 2, p.z); shadow.addShadowCaster(stalk);
        const cap = sphere(scene, "cap", 1.3 + rng() * 0.5, capMat);
        cap.position.set(p.x, h, p.z); cap.scaling.y = 0.6; shadow.addShadowCaster(cap);
        for (let s = 0; s < 4; s++) {
          const spot = disc(scene, "spot", 0.12 + rng() * 0.08, spotMat);
          spot.rotation.x = Math.PI / 2;
          spot.position.set(p.x + (rng() - 0.5) * 1.0, h + 0.36, p.z + (rng() - 0.5) * 1.0);
        }
        addObstacle(p.x, p.z, 0.5);
      }
    }

    // ---- Crystals (peaks + caverns): glowing, glassy faceted spires that catch
    // the sky probe — three shared materials, with a small shard cluster on
    // capable tiers. ----
    const nCryst = SC.crystals || 0;
    if (nCryst) {
      const crystMats = ["#8fe0ff", "#b58cff", "#7affc6"].map((c, i) => gloss(emat(scene, "cryst" + i, c, 0.6), 0.18, 0.1));
      for (let i = 0; i < nCryst; i++) {
        const p = place(6, FAR); if (!p) continue;
        const cm = crystMats[(rng() * crystMats.length) | 0];
        const h = 1.4 + rng() * 2.2;
        const cr = BABYLON.MeshBuilder.CreateCylinder("cryst", { diameterTop: 0, diameterBottom: 0.7 + rng() * 0.5, height: h, tessellation: 6 }, scene);
        cr.material = cm; cr.position.set(p.x, h / 2, p.z); cr.rotation.y = rng() * Math.PI; shadow.addShadowCaster(cr);
        // Shard rng drawn unconditionally (tier-independent world layout); the
        // shards themselves only render where the detail budget allows.
        const shards = 1 + ((rng() * 2) | 0), drawShards = foliage >= 0.6;
        for (let s = 0; s < shards; s++) {
          const sh = h * (0.3 + rng() * 0.3), ang = rng() * Math.PI * 2, rr = 0.5 + rng() * 0.4;
          const botD = 0.28 + rng() * 0.3, rx = (rng() - 0.5) * 0.5, ry = rng() * Math.PI, rz = (rng() - 0.5) * 0.5;
          if (!drawShards) continue;
          const c2 = BABYLON.MeshBuilder.CreateCylinder("crystS", { diameterTop: 0, diameterBottom: botD, height: sh, tessellation: 6 }, scene);
          c2.material = cm; c2.position.set(p.x + Math.cos(ang) * rr, sh / 2, p.z + Math.sin(ang) * rr);
          c2.rotation.set(rx, ry, rz); shadow.addShadowCaster(c2);
        }
        addObstacle(p.x, p.z, 0.7);
      }
    }

    // ---- Cave pillars (caverns): floor-to-ceiling stalagmite columns. ----
    const nPill = SC.pillars || 0;
    if (nPill) {
      const pillMat = mat(scene, "pillar", "#3b3450");
      for (let i = 0; i < nPill; i++) {
        const p = place(8, FAR); if (!p) continue;
        const h = 8 + rng() * 8;
        const col = cyl(scene, "pillar", 0.8 + rng() * 0.6, 1.6 + rng() * 0.8, h, pillMat);
        col.position.set(p.x, h / 2, p.z); shadow.addShadowCaster(col);
        addObstacle(p.x, p.z, 1.3);
      }
    }

    // ---- Snow drifts (peaks): pale mounds for a wintry floor. ----
    if (SC.snow) {
      const driftMat = emat(scene, "drift", "#f3f8ff", 0.06);
      for (let i = 0; i < 40; i++) {
        const p = place(5, FAR); if (!p) continue;
        const d = sphere(scene, "drift", 1.4 + rng() * 2.4, driftMat);
        d.position.set(p.x, 0.1, p.z); d.scaling.y = 0.16; d.isPickable = false;
      }
    }

    // ---- Flowers + grass tufts (decorative ground cover). Materials are SHARED
    // across the patch (one stem + one head per palette colour) so the dense
    // meadow doesn't spawn hundreds of one-off materials; heads use a cheap
    // fixed-density sphere since they're barely a handspan wide. ----
    const tuftMat = mat(scene, "tuft", indoor ? "#2c4a26" : "#69bd55");
    const nFlow = SC.flowers || 0;
    if (nFlow) {
      const stemMat = mat(scene, "stem", "#3c8a3c");
      const headMats = PALETTE.map((c, i) => mat(scene, "fhead" + i, c));
      for (let i = 0; i < nFlow; i++) {
        const p = place(5, FAR); if (!p) continue;
        if (rng() < 0.5) {
          const stem = cyl(scene, "stem", 0.04, 0.04, 0.4, stemMat);
          stem.position.set(p.x, 0.2, p.z);
          const head = tinySphere(scene, "fhead", 0.18, headMats[(rng() * headMats.length) | 0]);
          head.position.set(p.x, 0.42, p.z);
        } else {
          const tuft = cone(scene, "tuft", 0.35, 0, 0.5, tuftMat);
          tuft.position.set(p.x, 0.25, p.z);
        }
      }
    }

    // =====================================================================
    // PORTALS — a path / bridge / cave-mouth at the zone edge that streams you
    // to the connected zone. Each is a walk-through trigger (no collision) with
    // a glowing marker. The ZoneManager reads `portals` to detect crossings.
    // =====================================================================
    for (const def of zone.portals || []) {
      const pr = RADIUS - 5;
      const px = Math.cos(def.angle) * pr, pz = Math.sin(def.angle) * pr;
      const tgt = ZONE_BY_ID[def.to];
      const col = tgt ? tgt.theme.ground : "#ffd98a";
      const glow = emat(scene, "portGlow" + def.to, col, 0.85);

      const plat = disc(scene, "portPlat" + def.to, 3.6, mat(scene, "portPlatM" + def.to, "#d8c79a"));
      plat.rotation.x = Math.PI / 2; plat.position.set(px, 0.07, pz); plat.receiveShadows = true; plat.isPickable = false;

      // Face the gateway inward (toward the zone centre).
      const face = Math.atan2(-px, -pz);
      if (def.kind === "cave") {
        // A dark cave mouth: a flattened dark dome flanked by boulders.
        const mouth = sphere(scene, "caveMouth" + def.to, 6, mat(scene, "caveDark" + def.to, "#0c0a14"));
        mouth.position.set(px, 0.2, pz); mouth.scaling.set(1, 1.1, 0.5); mouth.isPickable = false;
        for (const s of [-1, 1]) {
          const bo = BABYLON.MeshBuilder.CreateIcoSphere("caveRock" + def.to + s, { radius: 1.6, subdivisions: 1 }, scene);
          bo.material = mat(scene, "caveRockM", "#5a5466");
          bo.position.set(px + Math.cos(face) * 2.6 * s, 1.2, pz + Math.sin(face) * 2.6 * s);
          shadow.addShadowCaster(bo);
        }
      } else if (def.kind === "bridge") {
        // A short plank jetty leading off toward the next shore.
        const deck = box(scene, "portBridge" + def.to, 3, 0.25, 6, mat(scene, "portPlank" + def.to, "#9a6a3a"));
        deck.rotation.y = face;
        deck.position.set(px + Math.sin(face) * 2.5, 0.16, pz + Math.cos(face) * 2.5);
        deck.receiveShadows = true; shadow.addShadowCaster(deck);
      } else {
        // A path gateway: two posts + a lintel beam, like a trail-head arch.
        const postMat = mat(scene, "portPost" + def.to, "#7a5230");
        for (const s of [-1, 1]) {
          const post = cyl(scene, "portPostM" + def.to + s, 0.3, 0.34, 4, postMat);
          post.position.set(px + Math.cos(face) * 2.4 * s, 2, pz + Math.sin(face) * 2.4 * s);
          shadow.addShadowCaster(post);
        }
        const beam = box(scene, "portBeam" + def.to, 5.4, 0.4, 0.4, postMat);
        beam.rotation.y = face; beam.position.set(px, 4, pz); shadow.addShadowCaster(beam);
      }

      // A floating glow orb marks the gateway and is bobbed by the animator.
      const orb = sphere(scene, "portOrb" + def.to, 1.0, glow);
      orb.position.set(px, 3.2, pz); orb.isPickable = false;
      animated.push({ orb, y: 3.2 });

      portals.push({ to: def.to, kind: def.kind, x: px, z: pz, r: 3.6,
                     name: tgt ? tgt.name : def.to, icon: tgt ? tgt.icon : "➡️" });
    }

    // Resolve a desired move against the fence, solid scenery, and the river.
    // Slides along obstacles/banks instead of stopping the player dead.
    function moveActor(cur, desired, r) {
      let tx = desired.x, tz = desired.z;

      // River barrier (hub only): if the move would enter the water, slide along
      // the bank by trying each axis independently.
      if (inRiver(tx, tz) && !inRiver(cur.x, cur.z)) {
        if (!inRiver(desired.x, cur.z)) tz = cur.z;
        else if (!inRiver(cur.x, desired.z)) tx = cur.x;
        else { tx = cur.x; tz = cur.z; }
      }

      // Push out of any solid scenery (two relaxation passes for stacked cases).
      for (let it = 0; it < 2; it++) {
        for (const o of obstacles) {
          const dx = tx - o.x, dz = tz - o.z;
          const md = o.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 < md * md) {
            const d = Math.sqrt(d2) || 0.0001;
            const push = md - d;
            tx += (dx / d) * push; tz += (dz / d) * push;
          }
        }
      }

      // Keep inside the circular fence (sized to this zone).
      const fr = RADIUS - r;
      const hyp = Math.hypot(tx, tz);
      if (hyp > fr) { tx = (tx / hyp) * fr; tz = (tz / hyp) * fr; }

      // If push-out shoved us into the river, refuse the move.
      if (inRiver(tx, tz) && !inRiver(cur.x, cur.z)) return cur.clone();
      return new BABYLON.Vector3(tx, cur.y, tz);
    }

    // A gentle shimmer (water + sea) and a bob for beacon/portal orbs, plus a
    // soft sway driven through the WIND animator so foliage feels alive.
    const windAmp = indoor ? 0.4 : 1.0;
    const _windObs = scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000;
      if (water) {
        water.position.y = baseWaterY + Math.sin(t * 1.5) * 0.015;
        waterMat.emissiveColor = BABYLON.Color3.FromHexString("#3aa0e0").scale(0.14 + Math.sin(t * 2) * 0.05);
      }
      seaMat.emissiveColor = BABYLON.Color3.FromHexString(seaCol).scale((indoor ? 0.05 : 0.12) + Math.sin(t * 0.8) * 0.03);
      for (const b of animated) b.orb.position.y = b.y + Math.sin(t * 1.5 + b.orb.uniqueId) * 0.4;
      // Wind: foliage crowns lean and rustle on two offset sine bands.
      const gust = 1 + Math.sin(t * 0.5) * 0.5;
      for (const s of swayers) {
        const a = Math.sin(t * 1.6 + s.phase) * s.amp * windAmp * gust;
        s.mesh.rotation.z = a;
        s.mesh.rotation.x = Math.cos(t * 1.3 + s.phase) * s.amp * 0.6 * windAmp * gust;
      }
    });

    // Everything this zone added — used by dispose() to stream the zone out
    // without touching the persistent player/camera or later-spawned entities.
    const _newMesh = (scene.meshes || []).filter((m) => !_bMesh.has(m));
    const _newTN = (scene.transformNodes || []).filter((n) => !_bTN.has(n));
    const _newMat = (scene.materials || []).filter((m) => !_bMat.has(m));
    function dispose() {
      try { scene.onBeforeRenderObservable.remove(_windObs); } catch (e) {}
      for (const m of _newMesh) { try { m.dispose(); } catch (e) {} }
      for (const n of _newTN) { try { n.dispose(); } catch (e) {} }
      try { if (shadow && shadow.dispose) shadow.dispose(); } catch (e) {}
      try { if (sun && sun.dispose) sun.dispose(); } catch (e) {}
      try { if (hemi && hemi.dispose) hemi.dispose(); } catch (e) {}
      for (const mt of _newMat) { try { if (mt && mt.dispose) mt.dispose(); } catch (e) {} }
    }

    return { shadow, onRoad, obstacles, inRiver, moveActor, water, waterMat,
             hemi, sun, sky, skyMat, seaMat, ground, portals, zone, radius: RADIUS, dispose };
  }

  // =========================================================================
  // Day / night cycle — advances a clock that drives the sun's position +
  // colour, the ambient light, the sky dome and the fog tint through dawn, day,
  // dusk and night. One full cycle every CONFIG.dayLength seconds. Headless-safe
  // (every handle it touches is a no-op stub in the test harness).
  // =========================================================================
  const DayNight = {
    world: null, t: CONFIG.startTimeOfDay, phase: "day",
    // Sky / fog / sun-colour + ambient brightness keyframes across the day.
    KEYS: [
      { t: 0.00, sky: "#0b1430", fog: "#0b1430", sun: "#2a3f7a", amb: 0.20 },
      { t: 0.22, sky: "#243a66", fog: "#2b3f6e", sun: "#5a4a8a", amb: 0.34 },
      { t: 0.29, sky: "#f6b27a", fog: "#f0c69a", sun: "#ffb060", amb: 0.62 },
      { t: 0.50, sky: "#86c5ff", fog: "#a9d4ff", sun: "#fff4e0", amb: 1.00 },
      { t: 0.73, sky: "#ffa566", fog: "#ffc28e", sun: "#ff9a50", amb: 0.62 },
      { t: 0.82, sky: "#3a2a58", fog: "#352e5c", sun: "#6a4a9a", amb: 0.34 },
      { t: 1.00, sky: "#0b1430", fog: "#0b1430", sun: "#2a3f7a", amb: 0.20 },
    ],
    init(world, t) { this.world = world; if (t != null) this.t = ((t % 1) + 1) % 1; },
    set(t) { this.t = ((t % 1) + 1) % 1; },

    phaseFor(t) {
      if (t < 0.23 || t >= 0.84) return "night";
      if (t < 0.31) return "dawn";
      if (t < 0.74) return "day";
      return "dusk";
    },
    _lerp(t) {
      const K = this.KEYS, C = (h) => BABYLON.Color3.FromHexString(h);
      let a = K[0], b = K[K.length - 1];
      for (let i = 0; i < K.length - 1; i++) if (t >= K[i].t && t < K[i + 1].t) { a = K[i]; b = K[i + 1]; break; }
      const f = Math.min(1, Math.max(0, (t - a.t) / ((b.t - a.t) || 1)));
      return {
        sky: BABYLON.Color3.Lerp(C(a.sky), C(b.sky), f),
        fog: BABYLON.Color3.Lerp(C(a.fog), C(b.fog), f),
        sun: BABYLON.Color3.Lerp(C(a.sun), C(b.sun), f),
        amb: a.amb + (b.amb - a.amb) * f,
      };
    },

    update(dt) {
      this.t = (this.t + dt / CONFIG.dayLength) % 1;
      const w = this.world; if (!w) return;
      // Indoor zones (caverns/thicket) keep their themed darkness — the sky/sun
      // cycle doesn't reach underground — but the clock still advances.
      if (w.zone && w.zone.indoor) { this.phase = this.phaseFor(this.t); updateClock(this.t, this.phase); return; }
      const k = this._lerp(this.t);
      this.amb = k.amb; this.skyColor = k.sky; this.fogColor = k.fog; this.sunColor = k.sun;
      // Sky dome + clear colour + fog colour.
      if (w.skyMat) w.skyMat.emissiveColor = k.sky;
      if (sceneRef) { sceneRef.clearColor = k.sky.toColor4 ? k.sky.toColor4(1) : k.sky; sceneRef.fogColor = k.fog; }
      // Sun: arcs overhead through the day, dim + cool at night.
      if (w.sun) {
        const az = this.t * Math.PI * 2;
        const elev = Math.sin((this.t - 0.25) * Math.PI * 2); // +1 noon, -1 midnight
        const yDir = -(0.35 + Math.max(0, elev) * 0.85);
        w.sun.direction = new BABYLON.Vector3(Math.cos(az) * 0.7, yDir, Math.sin(az) * 0.7);
        if (w.sun.direction.normalize) w.sun.direction.normalize();
        w.sun.intensity = 0.12 + Math.max(0, k.amb) * 1.05;
        w.sun.diffuse = k.sun;
      }
      if (w.hemi) {
        w.hemi.intensity = 0.28 + k.amb * 0.8;
        w.hemi.diffuse = BABYLON.Color3.Lerp(BABYLON.Color3.FromHexString("#404a6a"), BABYLON.Color3.FromHexString("#ffffff"), k.amb);
      }
      this.phase = this.phaseFor(this.t);
      updateClock(this.t, this.phase);
    },
  };

  // =========================================================================
  // Weather — cycles between clear, cloudy, foggy, rainy and stormy spells that
  // layer ON TOP of the day/night colours: thickening the fog, dimming the sun,
  // and (where supported) driving a rain particle system that follows the
  // player. Particle effects are feature-detected so the sim stays headless-safe.
  // =========================================================================
  const Weather = {
    world: null, scene: null, state: "clear", timer: 0, rain: null, rainOn: false, rainEmitter: null,
    STATES: {
      clear:  { label: "Clear",  icon: "☀️", fog: 1.0, dark: 0.00, rain: 0,   weight: 4 },
      cloudy: { label: "Cloudy", icon: "☁️", fog: 1.7, dark: 0.12, rain: 0,   weight: 3 },
      fog:    { label: "Foggy",  icon: "🌫️", fog: 4.2, dark: 0.10, rain: 0,   weight: 2 },
      rain:   { label: "Rain",   icon: "🌧️", fog: 2.2, dark: 0.26, rain: 1.0, weight: 2 },
      storm:  { label: "Storm",  icon: "⛈️", fog: 3.0, dark: 0.40, rain: 1.7, weight: 1 },
    },

    init(world, scene) {
      this.world = world; this.scene = scene;
      this.timer = CONFIG.weatherMinTime;
      this._buildRain(scene);
      this.setState("clear");
    },

    _buildRain(scene) {
      if (!BABYLON.ParticleSystem) return;
      try {
        const emitter = new BABYLON.TransformNode("rainEmit", scene);
        emitter.position.set(0, 16, 0); this.rainEmitter = emitter;
        const ps = new BABYLON.ParticleSystem("rain", 1400, scene);
        const tex = particleTexture(scene); if (tex) ps.particleTexture = tex;
        ps.emitter = emitter;
        ps.minEmitBox = new BABYLON.Vector3(-30, 0, -30);
        ps.maxEmitBox = new BABYLON.Vector3(30, 0, 30);
        ps.color1 = new BABYLON.Color4(0.7, 0.8, 1.0, 0.55);
        ps.color2 = new BABYLON.Color4(0.6, 0.7, 1.0, 0.45);
        ps.colorDead = new BABYLON.Color4(0.6, 0.7, 1.0, 0.0);
        ps.minSize = 0.06; ps.maxSize = 0.14;
        ps.minLifeTime = 0.5; ps.maxLifeTime = 0.9;
        ps.emitRate = 1000;
        ps.gravity = new BABYLON.Vector3(0, -90, 0);
        ps.direction1 = new BABYLON.Vector3(-2, -20, -2);
        ps.direction2 = new BABYLON.Vector3(2, -20, 2);
        ps.minEmitPower = 8; ps.maxEmitPower = 14;
        this.rain = ps;
      } catch (e) { this.rain = null; }
    },

    setState(s) {
      if (!this.STATES[s]) s = "clear";
      this.state = s;
      const st = this.STATES[s];
      updateWeatherHud(tWeatherLabel(s), st.icon);
      if (this.rain) {
        const on = st.rain > 0;
        try {
          if (on && !this.rainOn) this.rain.start();
          else if (!on && this.rainOn) this.rain.stop();
          this.rain.emitRate = 700 * st.rain;
        } catch (e) {}
        this.rainOn = on;
      }
    },
    pick() {
      const entries = Object.keys(this.STATES);
      let total = 0; for (const k of entries) total += this.STATES[k].weight;
      let r = rng() * total;
      for (const k of entries) { r -= this.STATES[k].weight; if (r <= 0) return k; }
      return "clear";
    },

    update(dt, playerPos) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.setState(this.pick());
        this.timer = CONFIG.weatherMinTime + rng() * (CONFIG.weatherMaxTime - CONFIG.weatherMinTime);
      }
      const st = this.STATES[this.state];
      const w = this.world;
      // Layer weather on top of each zone's own fog base (denser underground).
      const baseFog = (w && w.zone && w.zone.theme.fogDensity) || 0.0019;
      const indoor = !!(w && w.zone && w.zone.indoor);
      if (sceneRef) sceneRef.fogDensity = Math.min(0.06, baseFog * (indoor ? 1 : st.fog));
      if (!indoor && st.dark > 0) {
        if (w && w.sun) w.sun.intensity *= (1 - st.dark);
        if (w && w.hemi) w.hemi.intensity *= (1 - st.dark * 0.7);
      }
      // Rain doesn't fall underground — suppress it in indoor zones.
      if (indoor && this.rainOn && this.rain) { try { this.rain.stop(); } catch (e) {} this.rainOn = false; }
      // Keep the rain cloud centred above the player.
      if (this.rainOn && this.rainEmitter && playerPos) this.rainEmitter.position.set(playerPos.x, 16, playerPos.z);
    },
  };

  // A soft round particle sprite (a radial-gradient dot) built once and shared
  // by the weather + impact effects. Falls back to null if 2D canvas isn't
  // available (e.g. the headless harness), where particles are no-ops anyway.
  let _dotTex = null, _dotTried = false;
  function particleTexture(scene) {
    if (_dotTried) return _dotTex;
    _dotTried = true;
    try {
      const tex = new BABYLON.DynamicTexture("dot", 64, scene, false);
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.4, "rgba(255,255,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      tex.hasAlpha = true; tex.update();
      _dotTex = tex;
    } catch (e) { _dotTex = null; }
    return _dotTex;
  }

  // =========================================================================
  // Artifacts (the collectibles, formerly "relics")
  // =========================================================================
  function buildArtifact(scene, shadow, position, color) {
    const root = new BABYLON.TransformNode("artifact", scene);
    root.position.copyFrom(position);
    const m = emat(scene, "artM" + root.uniqueId, color, 0.6);
    const gem = BABYLON.MeshBuilder.CreatePolyhedron("gem", { type: 1, size: 0.36 }, scene);
    gem.material = m; gem.parent = root; gem.position.y = 1.0; shadow.addShadowCaster(gem);
    const halo = disc(scene, "halo", 0.55, emat(scene, "haloM" + root.uniqueId, color, 1));
    halo.material.alpha = 0.35; halo.rotation.x = Math.PI / 2; halo.position.y = 0.06; halo.parent = root;
    halo.isPickable = false;
    const beam = cyl(scene, "rbeam", 0.05, 0.7, 4, emat(scene, "rbeamM" + root.uniqueId, color, 1));
    beam.material.alpha = 0.12; beam.parent = root; beam.position.y = 2; beam.isPickable = false;
    return { root, gem, halo };
  }

  // Spawn one artifact somewhere valid and wire it into the interaction/score systems.
  // `fixed` (optional) places a saved artifact exactly: { pos:[x,z], color }.
  function spawnArtifact(scene, world, interaction, player, state, near, fixed) {
    let pos = null;
    let color;
    if (fixed) {
      pos = new BABYLON.Vector3(fixed.pos[0], 0, fixed.pos[1]);
      color = fixed.color;
    } else {
      for (let tries = 0; tries < 24 && !pos; tries++) {
        let x, z;
        if (near) { // cluster near a wave's monsters
          const ang = rng() * Math.PI * 2, r = 2 + rng() * 8;
          x = near.x + Math.cos(ang) * r; z = near.z + Math.sin(ang) * r;
        } else {
          const ang = rng() * Math.PI * 2, r = 9 + rng() * (CONFIG.worldRadius - 16);
          x = Math.cos(ang) * r; z = Math.sin(ang) * r;
        }
        if (Math.hypot(x, z) < CONFIG.worldRadius - 2 && !world.onRoad(x, z) && !world.inRiver(x, z)) {
          pos = new BABYLON.Vector3(x, 0, z);
        }
      }
      if (!pos) pos = new BABYLON.Vector3((rng() - 0.5) * 30, 0, (rng() - 0.5) * 30);
      color = PALETTE[(rng() * PALETTE.length) | 0];
    }

    const artifact = buildArtifact(scene, world.shadow, pos, color);
    artifact._color = color;
    const it = new Interactable(artifact.root, {
      label: t("label.collectArtifact"),
      onInteract: (self) => {
        if (player.busy) return;
        self.enabled = false;
        artifact.halo.setEnabled(false);
        interaction.remove(self);
        const i = state.artifacts.indexOf(artifact);
        if (i >= 0) state.artifacts.splice(i, 1);
        player.startPickup(artifact.gem, () => {
          artifact.root.dispose(); // clean up halo/beam/root (gem is now carried)
          addScore(state, CONFIG.scorePerArtifact);
          state.waveStats.artifacts++;
          // Artifacts are restorative: a small heal + a little coin reward on top
          // of the score, so grabbing them mid-fight is meaningfully helpful.
          let healed = 0;
          if (player.health < player.maxHealth) {
            healed = Math.min(CONFIG.artifactHeal, player.maxHealth - player.health);
            player.health += healed;
            updateHealthBar(player.health);
          }
          const bonus = CONFIG.artifactCoinMin +
            ((rng() * (CONFIG.artifactCoinMax - CONFIG.artifactCoinMin + 1)) | 0);
          state.coins += bonus;
          state.waveStats.coins += bonus;
          updateCoins(state);
          Sfx.play("artifact");
          const extra = (healed > 0 ? t("toast.artifactHeal", { n: Math.round(healed) }) : "") + t("toast.artifactCoin", { n: bonus });
          toast(t("toast.artifact", { score: CONFIG.scorePerArtifact, extra }));
        });
      },
    });
    artifact._it = it; interaction.register(it); state.artifacts.push(artifact);
    return artifact;
  }

  // =========================================================================
  // populateAdventure — scatter the story layer across the world: harvestable
  // resource nodes, the story NPCs at their landmarks, and the castle build
  // site on Castle Hill. Called once after the world is built.
  // =========================================================================
  function populateAdventure(scene, world, interaction, player, state) {
    const FAR = CONFIG.worldRadius - 6;
    const scatter = (minR, maxR) => {
      for (let tries = 0; tries < 26; tries++) {
        const a = rng() * Math.PI * 2, r = minR + rng() * (maxR - minR);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (r > 8 && !world.onRoad(x, z) && !world.inRiver(x, z)) return { x, z };
      }
      return null;
    };
    // Resource nodes: thematic radius bands (crystal high + outer, water near the
    // shore, the rest scattered through the meadow).
    const spec = [
      { kind: "tree", n: 16, band: [12, FAR] },
      { kind: "rock", n: 12, band: [12, FAR] },
      { kind: "herb", n: 14, band: [10, FAR] },
      { kind: "fiber", n: 10, band: [10, FAR] },
      { kind: "crystal", n: 7, band: [50, FAR] },
      { kind: "water", n: 8, band: [FAR - 8, FAR] },
    ];
    for (const s of spec) {
      for (let i = 0; i < s.n; i++) {
        const p = scatter(s.band[0], s.band[1]); if (!p) continue;
        state.resources.push(new ResourceNode(scene, world.shadow, interaction, new BABYLON.Vector3(p.x, 0, p.z), s.kind, player, state));
      }
    }
    // Story NPCs at their landmarks.
    for (const data of NPC_DATA) {
      state.npcs.push(new QuestGiver(scene, world.shadow, interaction, data, (npc) => Dialogue.talk(npc)));
    }
    // The castle build site.
    state.castle = new CastleSite(scene, world.shadow, interaction, player, state);
    CastleUI.setSite(state.castle);
  }

  // =========================================================================
  // setupZoneContent — lay the per-zone CONTENT layer on a freshly built world.
  // The hub (Meadowgate) gets the merchant, blacksmith, story NPCs, resource
  // nodes, the castle build site and a few artifacts; the wild zones get a
  // handful of themed resource nodes so gathering still works out in the world.
  // Monsters are handled separately by the SpawnDirector.
  // =========================================================================
  function setupZoneContent(scene, world, interaction, player, state) {
    const zone = world.zone;
    if (zone.home) {
      const merchant = new Merchant(scene, world.shadow, interaction, () => Shop.openShop());
      state.merchant = merchant; merchant.show();
      const blacksmith = new Blacksmith(scene, world.shadow, interaction, () => Anvil.openAnvil());
      state.blacksmith = blacksmith; blacksmith.show();
      populateAdventure(scene, world, interaction, player, state);
      // Re-raise any castle parts already built this run, then re-wake the
      // dragon if the keep was finished but it hasn't been slain.
      if (state.castleBuilt && state.castleBuilt.length && state.castle) state.castle.restore(state.castleBuilt);
      if (state.castle) state.castle.resummon();
      for (let i = 0; i < 3; i++) spawnArtifact(scene, world, interaction, player, state);
    } else {
      state.merchant = null; state.blacksmith = null; state.castle = null;
      populateWildResources(scene, world, interaction, player, state);
    }
  }

  // A few themed resource nodes for the wild zones so gather quests progress
  // while exploring (forest = wood/herb, peaks = crystal/rock, shore =
  // water/fiber, caverns = crystal/rock, thicket = herb/fiber).
  function populateWildResources(scene, world, interaction, player, state) {
    const zone = world.zone;
    const FAR = world.radius - 6;
    const byZone = {
      forest:  [["tree", 6], ["herb", 6], ["fiber", 4]],
      shore:   [["water", 6], ["fiber", 5], ["rock", 3]],
      peaks:   [["crystal", 5], ["rock", 6], ["herb", 2]],
      caverns: [["crystal", 6], ["rock", 5]],
      thicket: [["herb", 5], ["fiber", 5], ["tree", 4]],
    };
    const spec = byZone[zone.id] || [["herb", 4], ["rock", 4]];
    const scatter = () => {
      for (let t = 0; t < 20; t++) {
        const a = rng() * Math.PI * 2, r = 10 + rng() * (FAR - 12);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!world.onRoad(x, z)) return { x, z };
      }
      return null;
    };
    for (const pair of spec) {
      for (let i = 0; i < pair[1]; i++) {
        const p = scatter(); if (!p) continue;
        state.resources.push(new ResourceNode(scene, world.shadow, interaction, new BABYLON.Vector3(p.x, 0, p.z), pair[0], player, state));
      }
    }
  }

  // Fire "reach a location" quest objectives when the player gets close enough
  // to a hub landmark (zone-entry reaches are fired by the ZoneManager).
  function checkLocations(state, player) {
    for (const loc of LOCATIONS) {
      const dx = player.position.x - loc.x, dz = player.position.z - loc.z;
      if (Math.hypot(dx, dz) <= CONFIG.questReachRange) Quests.onReach(loc.id);
    }
  }

  // =========================================================================
  // Item cards — shared rendering for the shop and inventory. Builds a row for
  // one item def with its icon, name (rarity-tinted), stat summary and a button.
  // =========================================================================
  function statSummary(def) {
    const parts = [];
    const s = def.stats || {};
    if (def.potion) {
      const p = def.potion;
      if (p.heal) parts.push(t("stat.healthRestore", { n: p.heal }));
      if (p.buff) parts.push(t("stat.buffWrap", { inner: statSummary({ stats: p.buff }), t: p.time }));
      return parts.join(" · ") || (def.id ? tItemDesc(def) : "");
    }
    if (def.weapon) {
      const w = def.weapon;
      parts.push(w.ranged ? (w.shape === "arrow" ? t("stat.rangedArrow") : t("stat.rangedBolt")) : t("stat.melee"));
      parts.push(t("stat.dmg", { n: w.damage }));
      if (w.multishot > 1) parts.push(t("stat.multishot", { n: w.multishot }));
      if (w.pierce) parts.push(t("stat.pierce", { n: w.pierce }));
      parts.push(def.hands === 2 ? t("stat.twoHanded") : t("stat.oneHanded"));
    }
    if (s.maxHealth) parts.push(t("stat.hp", { n: s.maxHealth }));
    if (s.damageReduction) parts.push(t("stat.resist", { n: Math.round(s.damageReduction * 100) }));
    if (s.moveSpeed) parts.push(t("stat.speed", { n: s.moveSpeed }));
    if (s.damage) parts.push(t("stat.damageBonus", { n: s.damage }));
    if (s.haste) parts.push(t("stat.haste", { n: Math.round((1 - s.haste) * 100) }));
    if (s.lifesteal) parts.push(t("stat.lifestealBonus", { n: s.lifesteal }));
    if (s.coinRange) parts.push(t("stat.coinMagnet"));
    return parts.join(" · ");
  }

  function itemCard(def, btnLabel, btnClass, disabled, onClick, extraTag, level) {
    const row = document.createElement("div");
    row.className = "shop-item rarity-" + def.rarity;
    const rar = RARITY[def.rarity] || RARITY.normal;
    const tag = extraTag ? `<span class="tag">${extraTag}</span>` : "";
    const lvl = level ? ` <span class="lvl">+${level}</span>` : "";
    row.innerHTML =
      `<div class="icon">${def.icon}</div>` +
      `<div class="info"><div class="name" style="color:${rar.color}">${tItemName(def)}${lvl}${tag}</div>` +
      `<div class="desc">${statSummary(def) || tItemDesc(def)}</div></div>`;
    const btn = document.createElement("button");
    btn.className = btnClass; btn.textContent = btnLabel; btn.disabled = !!disabled;
    if (!disabled && onClick) btn.addEventListener("click", onClick);
    row.appendChild(btn);
    return row;
  }

  // The rotating "Featured" stock: a deterministic subset of rare/epic/legendary
  // gear that changes every wave (seeded by the wave number, independent of the
  // live RNG stream so it never disturbs world generation / save reproduction).
  function featuredForWave(wave) {
    const pool = FEATURED_POOL.slice();
    const out = [];
    let s = ((wave + 1) * 0x9e3779b9) >>> 0;
    const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const count = Math.min(3, pool.length);
    for (let i = 0; i < count; i++) {
      const idx = (next() * pool.length) | 0;
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
  // Featured (rotating) wares carry a premium over their plain sell value.
  const featuredCost = (def) => Math.max(40, Math.round(def.value * 2.6));

  // =========================================================================
  // Shop — the merchant BUYS your gear and SELLS normal wares. Rare gear can
  // only be won from bosses, so it's never stocked here — but you can sell it.
  // Two tabs: Buy (the merchant's stock) and Sell (your bag).
  // =========================================================================
  const Shop = {
    state: null, player: null, open: false, tab: "buy",

    init(state, player) { this.state = state; this.player = player; },

    openShop() {
      if (this.open) return;
      if (Inventory.open) Inventory.close();
      if (Anvil.open) Anvil.close();
      this.open = true; uiPaused = true; this.tab = "buy";
      dom.shop.classList.remove("hidden");
      this.render();
    },
    closeShop() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      dom.shop.classList.add("hidden");
    },
    setTab(tab) { this.tab = tab; this.render(); },

    buy(def, cost) {
      cost = cost == null ? def.cost : cost;
      if (this.state.coins < cost) { toast(t("toast.noCoins")); Sfx.play("error"); return; }
      if (this.player.inventory.length >= this.player.invCap) { toast(t("toast.bagFull")); Sfx.play("error"); return; }
      this.state.coins -= cost;
      invAdd(this.player, makeItem(def.id));
      updateCoins(this.state);
      Sfx.play("buy");
      toast(t("toast.bought", { icon: def.icon, name: tItemName(def) }));
      this.render();
    },
    // Potions go onto the 3-slot belt, not the bag.
    buyPotion(def) {
      if (this.state.coins < def.cost) { toast(t("toast.noCoins")); Sfx.play("error"); return; }
      if (!potionAdd(this.player, def.id)) { toast(t("toast.beltFull")); Sfx.play("error"); return; }
      this.state.coins -= def.cost;
      updateCoins(this.state);
      updatePotionBar(this.player);
      Sfx.play("buy");
      toast(t("toast.bought", { icon: def.icon, name: tItemName(def) }));
      this.render();
    },
    sell(inst) {
      const def = getDef(inst.id);
      // Enhancement adds resale value (you recoup part of what you forged in).
      const worth = def.value + Math.round(def.value * 0.5 * instLevel(inst));
      invRemove(this.player, inst);
      this.state.coins += worth;
      updateCoins(this.state);
      Sfx.play("coin");
      toast(t("toast.sold", { name: enhanceName(tItemName(def), instLevel(inst)), worth }));
      this.render();
    },

    render() {
      if (!this.open) return;
      dom.shopCoins.textContent = this.state.coins;
      if (dom.shopTabBuy) dom.shopTabBuy.classList.toggle("active", this.tab === "buy");
      if (dom.shopTabRare) dom.shopTabRare.classList.toggle("active", this.tab === "rare");
      if (dom.shopTabSell) dom.shopTabSell.classList.toggle("active", this.tab === "sell");
      dom.shopItems.innerHTML = "";
      const full = () => this.player.inventory.length >= this.player.invCap;

      if (this.tab === "buy") {
        this._heading(t("shop.gear"));
        for (const id of SHOP_STOCK) {
          const def = getDef(id);
          const card = itemCard(def, t("btn.buyCost", { cost: def.cost }), "buy-btn", this.state.coins < def.cost || full(),
            () => this.buy(def));
          dom.shopItems.appendChild(card);
        }
        this._heading(t("shop.potions"));
        for (const id of POTION_STOCK) {
          const def = getDef(id);
          const card = itemCard(def, t("btn.buyCost", { cost: def.cost }), "buy-btn potion-buy-btn", this.state.coins < def.cost,
            () => this.buyPotion(def));
          dom.shopItems.appendChild(card);
        }
      } else if (this.tab === "rare") {
        const note = document.createElement("div");
        note.className = "shop-note";
        note.textContent = t("shop.rareNote");
        dom.shopItems.appendChild(note);
        for (const id of featuredForWave(this.state.wave)) {
          const def = getDef(id);
          const cost = featuredCost(def);
          const card = itemCard(def, t("btn.buyCost", { cost }), "buy-btn featured-btn", this.state.coins < cost || full(),
            () => this.buy(def, cost), tRarityLabel(def.rarity).toUpperCase());
          dom.shopItems.appendChild(card);
        }
      } else {
        if (this.player.inventory.length === 0) {
          const empty = document.createElement("div");
          empty.className = "shop-empty";
          empty.textContent = t("shop.sellEmpty");
          dom.shopItems.appendChild(empty);
        }
        for (const inst of this.player.inventory.slice()) {
          const def = getDef(inst.id);
          const worth = def.value + Math.round(def.value * 0.5 * instLevel(inst));
          const card = itemCard(def, t("btn.sellWorth", { worth }), "buy-btn sell-btn", false,
            () => this.sell(inst), def.rarity !== "normal" ? tRarityLabel(def.rarity).toUpperCase() : "", instLevel(inst));
          dom.shopItems.appendChild(card);
        }
      }
    },

    _heading(text) {
      const h = document.createElement("div");
      h.className = "shop-heading"; h.textContent = text;
      dom.shopItems.appendChild(h);
    },
  };

  // =========================================================================
  // Inventory — the player's bag + equipment paper-doll. Click a bag item to
  // equip it; click an equipped slot to unequip it back to the bag. Live stats
  // update as gear changes. Opens with the 🎒 button or the "I" key.
  // =========================================================================
  const Inventory = {
    state: null, player: null, open: false,

    init(state, player) { this.state = state; this.player = player; },

    toggle() { if (this.open) this.close(); else this.openInv(); },
    openInv() {
      if (this.open) return;
      if (Shop.open) Shop.closeShop();
      if (Anvil.open) Anvil.close();
      this.open = true; uiPaused = true;
      dom.inventory.classList.remove("hidden");
      this.render();
    },
    close() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      dom.inventory.classList.add("hidden");
    },

    equip(inst) { equipItem(this.player, inst); this.render(); if (Shop.open) Shop.render(); },
    unequip(slot) { unequipSlot(this.player, slot); recomputeStats(this.player); this.render(); },

    render() {
      if (!this.open) return;
      const p = this.player;

      // ---- Equipment slots ----
      dom.invEquip.innerHTML = "";
      for (const slot of EQUIP_SLOTS) {
        const meta = SLOT_META[slot];
        const occ = p.equipment[slot];
        const cell = document.createElement("div");
        cell.className = "equip-slot";
        const slotLabel = tSlotLabel(slot);
        if (occ === TWO_HANDED) {
          cell.classList.add("filled", "two-handed");
          cell.innerHTML = `<div class="slot-label">${slotLabel}</div><div class="slot-item">${t("inv.twoHanded")}</div>`;
        } else if (occ) {
          const def = getDef(occ.id);
          const rar = RARITY[def.rarity] || RARITY.normal;
          cell.classList.add("filled");
          cell.innerHTML = `<div class="slot-label">${slotLabel}</div>` +
            `<div class="slot-item" style="color:${rar.color}">${def.icon} ${enhanceName(tItemName(def), instLevel(occ))}</div>`;
          cell.title = t("inv.unequipTitle", { name: tItemName(def) });
          cell.addEventListener("click", () => this.unequip(slot));
        } else {
          cell.innerHTML = `<div class="slot-label">${slotLabel}</div><div class="slot-empty">${t("inv.empty", { icon: meta.icon })}</div>`;
        }
        dom.invEquip.appendChild(cell);
      }

      // ---- Live stat block ----
      const w = p.weapon;
      dom.invStats.innerHTML =
        `<div class="stat-row"><span>${t("inv.maxHealth")}</span><b>${Math.round(p.maxHealth)}</b></div>` +
        `<div class="stat-row"><span>${t("inv.resist")}</span><b>${Math.round(p.damageReduction * 100)}%</b></div>` +
        `<div class="stat-row"><span>${t("inv.speed")}</span><b>${p.speed.toFixed(1)}</b></div>` +
        `<div class="stat-row"><span>${t("inv.lifesteal")}</span><b>${p.lifesteal}</b></div>` +
        `<div class="stat-row"><span>${t("inv.weapon")}</span><b>${w.name}</b></div>` +
        `<div class="stat-row"><span>${t("inv.damage")}</span><b>${(+w.damage.toFixed(1))}${w.multishot > 1 ? " ×" + w.multishot : ""}</b></div>`;

      // ---- Bag ----
      dom.invBag.innerHTML = "";
      const bagTitle = document.createElement("div");
      bagTitle.className = "bag-title";
      bagTitle.textContent = t("inv.bag", { n: p.inventory.length, cap: p.invCap });
      dom.invBag.appendChild(bagTitle);
      if (p.inventory.length === 0) {
        const empty = document.createElement("div");
        empty.className = "shop-empty"; empty.textContent = t("inv.bagEmpty");
        dom.invBag.appendChild(empty);
      }
      for (const inst of p.inventory.slice()) {
        const def = getDef(inst.id);
        const card = itemCard(def, t("btn.equip"), "buy-btn equip-btn", false,
          () => this.equip(inst),
          def.rarity !== "normal" ? tRarityLabel(def.rarity).toUpperCase() : "",
          instLevel(inst));
        dom.invBag.appendChild(card);
      }
    },
  };

  // =========================================================================
  // Enhancement — raise an item instance's level for coins at the blacksmith.
  // =========================================================================
  function enhanceItem(player, inst, state) {
    const def = getDef(inst.id);
    const level = instLevel(inst);
    const max = enhanceRule(def).max;
    if (level >= max) { toast(t("toast.maxEnhance")); Sfx.play("error"); return false; }
    const cost = enhanceCost(def, level);
    if (state.coins < cost) { toast(t("toast.noCoins")); Sfx.play("error"); return false; }
    state.coins -= cost;
    inst.level = level + 1;
    updateCoins(state);
    recomputeStats(player);          // a held/worn item's boost takes effect now
    Sfx.play("enhance");
    toast(t("toast.forged", { name: enhanceName(tItemName(def), inst.level) }));
    return true;
  }

  // The blacksmith's ANVIL — lists every enhanceable item (equipped + bag) with
  // its current level, the next-level cost and an Enhance button.
  const Anvil = {
    state: null, player: null, open: false,
    init(state, player) { this.state = state; this.player = player; },

    openAnvil() {
      if (this.open) return;
      if (Shop.open) Shop.closeShop();
      if (Inventory.open) Inventory.close();
      this.open = true; uiPaused = true;
      dom.anvil.classList.remove("hidden");
      this.render();
    },
    close() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      dom.anvil.classList.add("hidden");
    },

    // Every weapon / armour / accessory the player owns (equipped or bagged).
    _items() {
      const p = this.player, out = [];
      for (const slot of EQUIP_SLOTS) {
        const occ = p.equipment[slot];
        if (occ && occ !== TWO_HANDED && isGear(occ.id)) out.push({ inst: occ, where: tSlotLabel(slot) });
      }
      for (const inst of p.inventory) if (isGear(inst.id)) out.push({ inst, where: t("anvil.bag") });
      return out;
    },

    enhance(inst) { if (enhanceItem(this.player, inst, this.state)) { this.render(); if (Inventory.open) Inventory.render(); } },

    render() {
      if (!this.open) return;
      dom.anvilCoins.textContent = this.state.coins;
      dom.anvilItems.innerHTML = "";
      const items = this._items();
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "shop-empty"; empty.textContent = t("anvil.empty");
        dom.anvilItems.appendChild(empty);
        return;
      }
      for (const { inst, where } of items) {
        const def = getDef(inst.id);
        const level = instLevel(inst);
        const max = enhanceRule(def).max;
        const atMax = level >= max;
        const cost = atMax ? 0 : enhanceCost(def, level);
        const label = atMax ? t("anvil.max") : t("btn.buyCost", { cost });
        const card = itemCard(def, label, "buy-btn enhance-anvil-btn", atMax || this.state.coins < cost,
          () => this.enhance(inst), `${where} · ${level}/${max}`, level);
        dom.anvilItems.appendChild(card);
      }
    },
  };

  // =========================================================================
  // Quests — the per-quest objective ENGINE shared by the main-story missions
  // and the side quests (the campaign ORDER + chapters live in `Story`, below).
  // A quest is accepted from its giver NPC, tracked live, then turned in for a
  // reward. Objective types: hunt (lifetime kills snapshotted at accept), gather
  // (current material stock), reach (a landmark/zone visited), talk (an NPC
  // spoken to), defeat_boss (a lair cleared this run), build (a castle part
  // raised) and the finale defeat_dragon (the dragon slain → victory). Progress
  // is computed live off persistent state so it's robust to the order the player
  // does things in. Completing the relic + build missions is how the castle rises.
  // =========================================================================
  const Quests = {
    state: null, player: null,
    active: [],            // accepted, not-yet-turned-in quest ids
    completed: [],         // turned-in one-shot quest ids (main + non-repeatable side)
    acceptKills: {},       // totalKills snapshot when a hunt quest was accepted
    reached: {},           // landmark/zone ids the player has visited (reach objectives)
    talked: {},            // NPC ids the player has spoken to (talk objectives)

    init(state, player) {
      this.state = state; this.player = player;
      this.active = []; this.completed = []; this.acceptKills = {};
      this.reached = {}; this.talked = {};
    },

    isActive(id) { return this.active.includes(id); },
    isDone(id) { return this.completed.includes(id); },
    // Active quests (main + side) for a giver, and the first one ready to hand in.
    activeIdsForNpc(npcId) { return this.active.filter((id) => QUEST_BY_ID[id] && QUEST_BY_ID[id].npc === npcId); },
    completeActiveForNpc(npcId) { return this.activeIdsForNpc(npcId).find((id) => this.isComplete(QUEST_BY_ID[id])); },

    accept(id) {
      const q = QUEST_BY_ID[id];
      if (!q || this.isActive(id) || (q.line !== "side" && this.isDone(id))) return false;
      if (q.line === "side" && this.isDone(id) && !q.repeatable) return false;
      this.active.push(id);
      this.acceptKills[id] = this.state.totalKills;
      Sfx.play("buy");
      toast(t("toast.questAccepted", { kind: q.line === "main" ? t("quest.kindMission") : t("quest.kindSide"), title: tQuestTitle(q) }));
      updateQuestTracker(this);
      return true;
    },

    // Is a castle part (or "castle"/"all" for every part) raised? Reads the live
    // build site in the hub, or the persisted snapshot when out in the wilds.
    _built(part) {
      const s = this.state;
      const built = s.castle ? s.castle.built : (s.castleBuilt || []);
      if (part === "castle" || part === "all") return built.length >= CASTLE_PARTS.length;
      return built.indexOf(part) >= 0;
    },

    // Live { have, need } progress for a quest's objective.
    progress(q) {
      const o = q.obj, s = this.state;
      if (o.type === "hunt") return { have: Math.min(o.count, Math.max(0, s.totalKills - (this.acceptKills[q.id] || 0))), need: o.count };
      if (o.type === "gather") return { have: Math.min(o.count, this.player.materials[o.target] || 0), need: o.count };
      if (o.type === "reach") return { have: this.reached[o.target] ? 1 : 0, need: 1 };
      if (o.type === "talk") return { have: this.talked[o.target] ? 1 : 0, need: 1 };
      if (o.type === "defeat_boss") return { have: (s.bossesCleared && s.bossesCleared[o.target]) ? 1 : 0, need: 1 };
      if (o.type === "build") return { have: this._built(o.target) ? 1 : 0, need: 1 };
      if (o.type === "defeat_dragon") return { have: s.won ? 1 : 0, need: 1 };
      return { have: 0, need: 1 };
    },
    isComplete(q) { const p = this.progress(q); return p.have >= p.need; },

    // A one-line objective description for the dialogue, log + HUD tracker.
    objectiveText(q) {
      const o = q.obj, p = this.progress(q), done = p.have >= p.need;
      const dm = done ? t("obj.doneMark") : "";
      const placeName = (id) => LOCATION_BY_ID[id] ? tLocationName(id) : (ZONE_BY_ID[id] ? tZoneName(ZONE_BY_ID[id]) : id);
      if (o.type === "hunt") return t("obj.hunt", { have: p.have, need: p.need });
      if (o.type === "gather") { const m = MATERIALS[o.target] || {}; return t("obj.gather", { icon: m.icon || "", label: tMaterialLabel(o.target), have: p.have, need: p.need }); }
      if (o.type === "reach") return t("obj.reach", { name: placeName(o.target) }) + dm;
      if (o.type === "talk") { const n = NPC_BY_ID[o.target] || {}; return t("obj.talk", { icon: n.icon || "", name: tNpcName(o.target) }) + dm; }
      if (o.type === "defeat_boss") { const z = ZONE_BY_ID[o.target] || {}; return t("obj.defeatBoss", { boss: tLairBossName(o.target), zone: tZoneName(z) }) + dm; }
      if (o.type === "build") return t("obj.build", { part: tCastlePartName(o.target) }) + dm;
      if (o.type === "defeat_dragon") return t("obj.defeatDragon") + dm;
      return "";
    },

    // Turn a completed quest in: consume gathered mats, pay the reward, advance.
    // Repeatable side quests don't lock — they tally and can be taken again.
    turnIn(id) {
      const q = QUEST_BY_ID[id];
      if (!q || !this.isActive(id) || !this.isComplete(q)) return false;
      if (q.obj.type === "gather") spendMaterials(this.player, { [q.obj.target]: q.obj.count });
      this.active.splice(this.active.indexOf(id), 1);
      if (q.line === "side" && q.repeatable) Story.sideTurnIns[id] = (Story.sideTurnIns[id] || 0) + 1;
      else this.completed.push(id);
      grantReward(this.player, this.state, q.reward);
      Sfx.play("artifact");
      const r = q.reward || {};
      const bits = [];
      if (r.coins) bits.push(`🪙 ${r.coins}`);
      if (r.item && getDef(r.item)) bits.push(`${getDef(r.item).icon} ${tItemName(getDef(r.item))}`);
      if (r.relic && RELICS[r.relic]) bits.push(`${RELICS[r.relic].icon} ${tRelicName(r.relic)}`);
      toast(t("toast.questComplete", { title: tQuestTitle(q), bits: bits.join(" · ") }));
      updateQuestTracker(this);
      if (Inventory.open) Inventory.render();
      Story.afterTurnIn(q);
      return true;
    },

    // ---- Event hooks fired by gameplay ----
    onKill() { updateQuestTracker(this); },
    onGather() { updateQuestTracker(this); },
    onCraft() { updateQuestTracker(this); },
    onReach(locId) {
      if (!this.reached[locId]) {
        this.reached[locId] = true;
        // Announce only when an active reach mission was just satisfied.
        if (this.active.some((id) => { const q = QUEST_BY_ID[id]; return q && q.obj.type === "reach" && q.obj.target === locId; })) {
          const nm = LOCATION_BY_ID[locId] ? tLocationName(locId) : (ZONE_BY_ID[locId] ? tZoneName(ZONE_BY_ID[locId]) : locId);
          toast(t("toast.reached", { name: nm }));
        }
      }
      updateQuestTracker(this);
    },
    onTalk(npcId) { this.talked[npcId] = true; updateQuestTracker(this); },
    onBossCleared(zoneId) { updateQuestTracker(this); },
    onBuild() { updateQuestTracker(this); },

    // The quest shown in the small HUD tracker when there's no live main step
    // (first active side quest, complete ones first).
    tracked() {
      const ids = this.active.filter((id) => QUEST_BY_ID[id] && QUEST_BY_ID[id].line === "side");
      const done = ids.filter((id) => this.isComplete(QUEST_BY_ID[id]));
      const id = done[0] || ids[0];
      return id ? QUEST_BY_ID[id] : null;
    },
  };

  // =========================================================================
  // Story — the campaign META over the quest engine: the ORDERED main line,
  // chapter structure, the single "current step" that drives the guided HUD
  // tracker, which quest each NPC may offer next (main mission gated by global
  // order; side quests offered freely), and the intro / chapter / ending beats.
  // It owns only campaign-flow state (intro seen, chapter beats shown, repeatable
  // side-quest tallies); per-quest progress lives in `Quests`. Everything is
  // derived from the declarative STORY / MISSIONS tables so it stays testable.
  // =========================================================================
  const Story = {
    state: null, player: null,
    introSeen: false,
    beats: {},          // chapterId -> chapter-begin beat already shown
    sideTurnIns: {},    // repeatable side-quest id -> times turned in

    init(state, player) {
      this.state = state; this.player = player;
      this.introSeen = false; this.beats = {}; this.sideTurnIns = {};
    },

    // A main mission counts as resolved when turned in — or, for the giver-less
    // finale, when the dragon is down (victory).
    resolved(id) {
      const q = QUEST_BY_ID[id];
      if (q && q.obj.type === "defeat_dragon") return !!(this.state && this.state.won);
      return Quests.isDone(id);
    },
    mainUnlocked(id) { const i = MAIN_INDEX[id]; return i === 0 || this.resolved(MAIN_IDS[i - 1]); },

    currentMissionId() { for (const id of MAIN_IDS) if (!this.resolved(id)) return id; return null; },
    currentMission() { const id = this.currentMissionId(); return id ? QUEST_BY_ID[id] : null; },
    isComplete() { return this.currentMissionId() === null; },

    currentChapterId() {
      const m = this.currentMission();
      return m ? m.chapter : STORY.chapters[STORY.chapters.length - 1].id;
    },
    chapterIndex(chId) { return STORY.chapters.findIndex((c) => c.id === chId) + 1; },
    chapterProgress(chId) {
      const ms = missionsOfChapter(chId);
      return { done: ms.filter((m) => this.resolved(m.id)).length, total: ms.length };
    },

    // ---- What an NPC may offer right now ----
    offerMain(npcId) {
      const m = this.currentMission();
      return (m && m.npc === npcId && this.mainUnlocked(m.id) && !Quests.isActive(m.id)) ? m : null;
    },
    offerSide(npcId) {
      for (const id of SIDE_IDS) {
        const q = QUEST_BY_ID[id];
        if (q.npc !== npcId || Quests.isActive(id)) continue;
        if (Quests.isDone(id) && !q.repeatable) continue;
        return q;
      }
      return null;
    },
    offer(npcId) { return this.offerMain(npcId) || this.offerSide(npcId); },

    // The marker/prompt status for a giver NPC.
    npcStatus(npcId) {
      if (Quests.completeActiveForNpc(npcId)) return "turnin";
      if (this.offer(npcId)) return "new";
      if (Quests.activeIdsForNpc(npcId).length) return "active";
      return "done";
    },

    // ---- Presentation helpers ----
    giverLabel(npcId) { const n = NPC_BY_ID[npcId] || {}; return `${n.icon || ""} ${tNpcName(npcId)}`; },
    npcPlace(npcId) { const n = NPC_BY_ID[npcId]; const l = n && LOCATION_BY_ID[n.loc]; return l ? tLocationName(n.loc) : t("place.meadowgate"); },
    _whereSuffix(m) { return m.where ? t("guide.whereSuffix", { where: tQuestWhere(m) }) : ""; },

    // The one guided step shown in the HUD tracker — always the live main line.
    guidance() {
      const m = this.currentMission();
      if (!m) return null; // campaign complete
      const base = { chapterTitle: tChapterTitle(m.chapter), chapterIndex: this.chapterIndex(m.chapter), mission: m };
      if (!m.npc) // the finale: no giver, just face the dragon
        return Object.assign(base, { state: "do", text: Quests.objectiveText(m) + this._whereSuffix(m) });
      if (Quests.isActive(m.id)) {
        if (Quests.isComplete(m))
          return Object.assign(base, { state: "turnin", text: t("guide.turnin", { giver: this.giverLabel(m.npc) }) });
        return Object.assign(base, { state: "do", text: Quests.objectiveText(m) + this._whereSuffix(m) });
      }
      return Object.assign(base, { state: "accept", text: t("guide.accept", { giver: this.giverLabel(m.npc), place: this.npcPlace(m.npc) }) });
    },

    // ---- Beats ----
    showIntro() {
      Dialogue.showBeat({ name: tStoryIntroTitle(), html: `<p>${tStoryIntroText()}</p>`, button: t("btn.beginAdventure") });
    },
    maybeShowIntro() { if (this.introSeen) return; this.introSeen = true; this.showIntro(); },

    // Fired after a turn-in: announce a freshly-begun chapter once.
    afterTurnIn(q) {
      if (!q || q.line !== "main") return;
      const cur = this.currentMission();
      if (cur && cur.chapter !== q.chapter && !this.beats[cur.chapter]) {
        this.beats[cur.chapter] = true;
        const ch = CHAPTER_BY_ID[cur.chapter];
        if (ch) toast(t("toast.chapterBegin", { n: this.chapterIndex(ch.id), title: tChapterTitle(ch.id) }));
      }
    },
    onWin() { this.beats.__ending = true; },

    // ---- Save / restore (campaign-flow state; per-quest state is in Quests) ----
    serialize() {
      return { intro: this.introSeen, beats: Object.keys(this.beats), sideTurnIns: Object.assign({}, this.sideTurnIns) };
    },
    restore(d) {
      d = d || {};
      this.introSeen = !!d.intro;
      this.beats = {}; for (const k of (d.beats || [])) this.beats[k] = true;
      this.sideTurnIns = {};
      if (d.sideTurnIns) for (const k in d.sideTurnIns) if (QUEST_BY_ID[k]) this.sideTurnIns[k] = d.sideTurnIns[k] | 0;
    },
  };

  // A human-readable summary of a quest reward (coins · item · relic · mats).
  function rewardText(r) {
    if (!r) return "";
    const bits = [];
    if (r.coins) bits.push(`🪙 ${r.coins}`);
    if (r.item && getDef(r.item)) bits.push(`${getDef(r.item).icon} ${tItemName(getDef(r.item))}`);
    if (r.relic && RELICS[r.relic]) bits.push(`${RELICS[r.relic].icon} ${tRelicName(r.relic)}`);
    if (r.mats) bits.push(matSummary(r.mats));
    return bits.join(" · ");
  }

  // Close whichever blocking menu is open (so the menus stay mutually exclusive).
  function closeOtherMenus(except) {
    if (except !== Shop && Shop.open) Shop.closeShop();
    if (except !== Inventory && Inventory.open) Inventory.close();
    if (except !== Anvil && Anvil.open) Anvil.close();
    if (except !== Dialogue && Dialogue.open) Dialogue.close();
    if (except !== Crafting && Crafting.open) Crafting.close();
    if (except !== CastleUI && CastleUI.open) CastleUI.close();
    if (except !== QuestLog && QuestLog.open) QuestLog.close();
  }

  // =========================================================================
  // Dialogue — the NPC conversation overlay. Lists every quest this NPC is
  // involved in: active main missions + side quests (with live progress and a
  // Turn-in when ready), plus anything they can offer right now (the current
  // main mission if they're its giver, and their next side quest). The same
  // overlay doubles as the narrator for story BEATS (intro / chapter / ending)
  // via showBeat().
  // =========================================================================
  const Dialogue = {
    open: false, beat: false, npc: null, player: null, state: null,
    init(state, player) { this.state = state; this.player = player; },

    talk(npc) {
      closeOtherMenus(this);
      this.beat = false; this.npc = npc; this.open = true; uiPaused = true;
      dom.dialogue.classList.remove("hidden");
      Quests.onTalk(npc.data.id);          // satisfies "talk to X" objectives
      this.render();
    },
    close() {
      if (!this.open) return;
      this.open = false; this.beat = false; uiPaused = false; this.npc = null;
      dom.dialogue.classList.add("hidden");
    },

    // Narrated story beat (no NPC) — reuses the dialogue overlay.
    showBeat({ name, html, button }) {
      closeOtherMenus(this);
      this.beat = true; this.npc = null; this.open = true; uiPaused = true;
      dom.dialogue.classList.remove("hidden");
      dom.dlgName.textContent = name || "📜";
      dom.dlgText.innerHTML = html || "";
      dom.dlgActions.innerHTML = "";
      const b = document.createElement("button");
      b.className = "start-btn"; b.textContent = button || t("btn.continue");
      b.addEventListener("click", () => this.close());
      dom.dlgActions.appendChild(b);
    },

    render() {
      if (!this.open || !this.npc) return;
      const npc = this.npc.data, id = npc.id;
      dom.dlgName.textContent = `${npc.icon} ${tNpcName(id)}`;
      dom.dlgActions.innerHTML = "";
      const addBtn = (label, cls, fn) => {
        const b = document.createElement("button"); b.className = "start-btn " + cls; b.textContent = label;
        b.addEventListener("click", fn); dom.dlgActions.appendChild(b);
      };
      // Active quests from this NPC (main missions first), plus what they offer.
      const activeIds = Quests.activeIdsForNpc(id)
        .sort((a, b) => (QUEST_BY_ID[a].line === "main" ? 0 : 1) - (QUEST_BY_ID[b].line === "main" ? 0 : 1));
      const mainOffer = Story.offerMain(id);
      const sideOffer = Story.offerSide(id);
      const anyComplete = activeIds.some((qid) => Quests.isComplete(QUEST_BY_ID[qid]));

      // Greeting line — context-aware.
      let greet;
      if (anyComplete) greet = t("dlg.greetSettle");
      else if (activeIds.length) greet = t("dlg.greetWorking");
      else if (mainOffer || sideOffer) greet = tNpcIntro(id);
      else greet = t("dlg.greetDone");
      const lines = [`<p>${greet}</p>`];

      const tag = (q) => (q.line === "main" ? t("dlg.tagMission") : t("dlg.tagSide"));
      for (const qid of activeIds) {
        const q = QUEST_BY_ID[qid], done = Quests.isComplete(q);
        lines.push(`<p class="dlg-quest">${t("dlg.questLine", { tag: tag(q), title: tQuestTitle(q) })}</p>` +
          `<p class="dlg-obj">${Quests.objectiveText(q)}${done ? t("dlg.readyTurnIn") : ""}</p>`);
      }
      if (mainOffer) {
        lines.push(`<p class="dlg-quest">${t("dlg.newMission", { title: tQuestTitle(mainOffer) })}</p>` +
          `<p>${t("dlg.story", { story: tQuestStory(mainOffer) })}</p><p class="dlg-obj">${Quests.objectiveText(mainOffer)}</p>` +
          `<p class="dlg-reward">${t("dlg.reward", { reward: rewardText(mainOffer.reward) })}</p>`);
      }
      if (sideOffer) {
        const reps = Story.sideTurnIns[sideOffer.id] || 0;
        const rep = sideOffer.repeatable ? t("dlg.repeatable") : "";
        const doneStr = reps ? t("dlg.doneTimes", { n: reps }) : "";
        lines.push(`<p class="dlg-quest">${t("dlg.sideQuest", { title: tQuestTitle(sideOffer), rep, done: doneStr })}</p>` +
          `<p>${t("dlg.story", { story: tQuestStory(sideOffer) })}</p><p class="dlg-obj">${Quests.objectiveText(sideOffer)}</p>` +
          `<p class="dlg-reward">${t("dlg.reward", { reward: rewardText(sideOffer.reward) })}</p>`);
      }
      dom.dlgText.innerHTML = lines.join("");

      // Buttons: turn-ins first (most useful), then accepts, then close.
      for (const qid of activeIds) {
        if (Quests.isComplete(QUEST_BY_ID[qid]))
          addBtn(t("btn.turnInQuest", { title: tQuestTitle(QUEST_BY_ID[qid]) }), "", () => { Quests.turnIn(qid); this.render(); });
      }
      if (mainOffer) addBtn(t("btn.acceptMain", { title: tQuestTitle(mainOffer) }), "", () => { Quests.accept(mainOffer.id); this.render(); });
      if (sideOffer) addBtn(t("btn.acceptSide", { title: tQuestTitle(sideOffer) }), "secondary-btn", () => { Quests.accept(sideOffer.id); this.render(); });
      addBtn(activeIds.length || mainOffer || sideOffer ? t("btn.close") : t("btn.farewell"), "secondary-btn", () => this.close());
    },
  };

  // =========================================================================
  // Crafting — the crafting bench. Spend gathered materials on recipes that
  // yield potions (to the belt) and basic gear (to the bag).
  // =========================================================================
  const Crafting = {
    open: false, player: null, state: null,
    init(state, player) { this.state = state; this.player = player; },
    toggle() { if (this.open) this.close(); else this.openBench(); },
    openBench() {
      closeOtherMenus(this);
      this.open = true; uiPaused = true;
      dom.crafting.classList.remove("hidden");
      this.render();
    },
    close() { if (!this.open) return; this.open = false; uiPaused = false; dom.crafting.classList.add("hidden"); },

    craft(recipe) { if (craftRecipe(this.player, recipe)) this.render(); },

    render() {
      if (!this.open) return;
      const p = this.player;
      // Owned-materials strip.
      dom.craftMats.innerHTML = MATERIAL_IDS.map((id) =>
        `<span class="mat-chip">${MATERIALS[id].icon} ${p.materials[id] || 0}</span>`).join("");
      dom.craftItems.innerHTML = "";
      for (const recipe of CRAFT_RECIPES) {
        const def = getDef(recipe.out);
        const can = hasMaterials(p, recipe.mats);
        const card = itemCard(def, can ? t("btn.craft") : t("btn.needMats"), "buy-btn craft-btn", !can,
          () => this.craft(recipe), matSummary(recipe.mats));
        dom.craftItems.appendChild(card);
      }
    },
  };

  // =========================================================================
  // CastleUI — the castle build panel. Lists the five parts; spend the matching
  // relic + coins to raise each in order. Completing the keep wakes the dragon.
  // =========================================================================
  const CastleUI = {
    open: false, site: null, state: null, player: null,
    init(state, player) { this.state = state; this.player = player; },
    setSite(site) { this.site = site; },
    openPanel() {
      if (!this.site) return;
      closeOtherMenus(this);
      this.open = true; uiPaused = true;
      dom.castle.classList.remove("hidden");
      this.render();
    },
    close() { if (!this.open) return; this.open = false; uiPaused = false; dom.castle.classList.add("hidden"); },

    build(part) { if (this.site.build(part)) { this.render(); updateRelicHud(this.player); } },

    render() {
      if (!this.open || !this.site) return;
      dom.castleCoins.textContent = this.state.coins;
      dom.castleItems.innerHTML = "";
      for (const part of CASTLE_PARTS) {
        const built = this.site.isBuilt(part.id);
        const relic = RELICS[part.relic];
        const haveRelic = hasRelic(this.player, part.relic);
        const idx = CASTLE_PARTS.indexOf(part);
        const prevBuilt = idx === 0 || this.site.isBuilt(CASTLE_PARTS[idx - 1].id);
        const row = document.createElement("div");
        row.className = "shop-item castle-row" + (built ? " built" : "");
        let status, btnLabel, disabled;
        if (built) { status = t("castle.built"); btnLabel = t("btn.built"); disabled = true; }
        else if (!prevBuilt) { status = t("castle.lockedPrev"); btnLabel = t("btn.locked"); disabled = true; }
        else {
          const needRelic = haveRelic ? t("castle.relicHave", { icon: relic.icon }) : t("castle.relicNeed", { icon: relic.icon, name: tRelicName(part.relic) });
          const needCoins = this.state.coins >= part.cost ? t("castle.coinsHave", { cost: part.cost }) : t("castle.coinsNeed", { cost: part.cost });
          status = t("castle.needs", { relic: needRelic, coins: needCoins });
          disabled = !this.site.canBuild(part);
          btnLabel = t("btn.build");
        }
        row.innerHTML = `<div class="icon">${part.icon}</div><div class="info"><div class="name">${tCastlePartName(part.id)}</div>` +
          `<div class="desc">${tCastlePartDesc(part.id)}<br>${status}</div></div>`;
        const btn = document.createElement("button");
        btn.className = "buy-btn castle-build-btn"; btn.textContent = btnLabel; btn.disabled = disabled;
        if (!disabled) btn.addEventListener("click", () => this.build(part));
        row.appendChild(btn);
        dom.castleItems.appendChild(row);
      }
      const left = CASTLE_PARTS.filter((p) => !this.site.isBuilt(p.id)).length;
      dom.castleProgress.textContent = left === 0 ? t("castle.complete")
        : t("castle.progress", { built: CASTLE_PARTS.length - left, total: CASTLE_PARTS.length, word: plural(CASTLE_PARTS.length, t("castle.partWord")) });
    },
  };

  // =========================================================================
  // QuestLog — the chaptered journal (opened from the HUD). The MAIN STORY is
  // shown as ordered chapters with the current chapter expanded into its
  // missions + the live guided step; SIDE QUESTS are listed in their own clearly
  // separated section so the two never blur together.
  // =========================================================================
  const QuestLog = {
    open: false,
    toggle() { if (this.open) this.close(); else this.openLog(); },
    openLog() { closeOtherMenus(this); this.open = true; uiPaused = true; dom.questLog.classList.remove("hidden"); this.render(); },
    close() { if (!this.open) return; this.open = false; uiPaused = false; dom.questLog.classList.add("hidden"); },

    // One row for a main-story mission, styled by its status.
    _missionRow(m) {
      const resolved = Story.resolved(m.id);
      const active = Quests.isActive(m.id);
      const complete = active && Quests.isComplete(m);
      const isCurrent = Story.currentMissionId() === m.id;
      let cls = "", icon, body = "";
      if (resolved) { icon = "✅"; cls = "mdone"; }
      else if (active) {
        icon = complete ? "✓" : "📜"; cls = complete ? "mcurrent" : "";
        body = `<div class="qm-obj">${Quests.objectiveText(m)}${complete && m.npc ? t("log.returnTo", { giver: Story.giverLabel(m.npc) }) : ""}</div>`;
      } else if (isCurrent) {
        icon = "❗"; cls = "mcurrent";
        body = `<div class="qm-obj">${m.npc ? t("log.speakAt", { giver: Story.giverLabel(m.npc), place: Story.npcPlace(m.npc) }) : Quests.objectiveText(m)}</div>`;
      } else { icon = "🔒"; cls = "mlocked"; }
      return `<div class="quest-mission ${cls}"><span class="qm-title">${icon} ${tQuestTitle(m)}</span>${body}</div>`;
    },

    render() {
      if (!this.open) return;
      const rows = [];
      const g = Story.guidance();
      const curChId = Story.currentChapterId();

      // ---- Main story ----
      rows.push(`<div class="quest-sec">${t("log.mainStory")}</div>`);
      rows.push(g
        ? `<div class="quest-now">${t("log.now", { n: g.chapterIndex, title: g.chapterTitle, text: g.text })}</div>`
        : `<div class="quest-now cdone">${t("log.allDone")}</div>`);
      for (const ch of STORY.chapters) {
        const prog = Story.chapterProgress(ch.id);
        const allDone = prog.done >= prog.total;
        const isCurrent = ch.id === curChId && !Story.isComplete();
        const icon = allDone ? "✅" : isCurrent ? "▶" : "🔒";
        const state = allDone ? "cdone" : isCurrent ? "current" : "clocked";
        rows.push(`<div class="quest-chap ${state}">${t("log.chapterRow", { icon, n: Story.chapterIndex(ch.id), title: tChapterTitle(ch.id) })} <span class="cprog">${prog.done}/${prog.total}</span></div>`);
        if (isCurrent) {
          rows.push(`<div class="chap-blurb">${tChapterBlurb(ch.id)}</div>`);
          for (const m of missionsOfChapter(ch.id)) rows.push(this._missionRow(m));
        }
      }

      // ---- Side quests (clearly separated) ----
      const sideActive = Quests.active.filter((id) => QUEST_BY_ID[id] && QUEST_BY_ID[id].line === "side");
      const sideDone = SIDE_IDS.filter((id) => Quests.isDone(id) || Story.sideTurnIns[id]);
      rows.push(`<div class="quest-sec">${t("log.sideQuests")}</div>`);
      if (!sideActive.length && !sideDone.length)
        rows.push(`<div class="shop-empty">${t("log.sideNone")}</div>`);
      for (const id of sideActive) {
        const q = QUEST_BY_ID[id], done = Quests.isComplete(q), npc = NPC_BY_ID[q.npc] || {};
        rows.push(`<div class="quest-row ${done ? "qdone" : ""}"><div class="qr-title">🔸 ${tQuestTitle(q)} ${done ? "✓" : ""}</div>` +
          `<div class="qr-obj">${Quests.objectiveText(q)}</div>` +
          `<div class="qr-from">${t("log.sideFrom", { icon: npc.icon, name: tNpcName(q.npc), ret: done ? t("log.sideReturn") : "", reward: rewardText(q.reward) })}</div></div>`);
      }
      if (sideDone.length) {
        rows.push(`<div class="quest-sep">${t("log.sideCompleted")}</div>`);
        for (const id of sideDone) {
          const q = QUEST_BY_ID[id], reps = Story.sideTurnIns[id] || 0;
          rows.push(`<div class="quest-row qcomplete">✅ ${tQuestTitle(q)}${reps > 1 ? ` ×${reps}` : ""}</div>`);
        }
      }
      dom.questLogItems.innerHTML = rows.join("");
    },
  };

  // =========================================================================
  // SpawnDirector — the RPG replacement for timed waves. Each ZONE has its own
  // resident monsters that spawn at fixed points, ROAM their patch (see
  // Monster._wander), and RESPAWN a while after they're felled, up to the
  // zone's population cap. Boss-lair zones also spawn their guardian in the
  // depths. There is no global wave clock: the world simply stays populated as
  // you hunt and explore, and a fresh director is created for each zone you
  // travel into.
  // =========================================================================
  class SpawnDirector {
    constructor(scene, world, interaction, player, state) {
      this.scene = scene; this.world = world; this.interaction = interaction;
      this.player = player; this.state = state;
      this.zone = world.zone;
      this.spec = this.zone.spawn || { count: 6, kinds: SWEETS, abilities: ["chaser"] };
      this.target = this.spec.count || 6;
      this.points = this._makePoints();
      this.respawnDelay = CONFIG.respawnDelay;
      this.respawnTimer = this.respawnDelay;
      this.bossDefeated = false;
      this._spawnedBoss = false;
      // Legacy shims so the save/pause/HUD code keeps working under the RPG
      // model (the old wave clock/window are retired).
      this.wave = this.zone.level; this.betweenWaves = false; this.timer = 0; this.minimized = false;
    }

    // Fixed spawn points scattered in a mid-radius band around the zone.
    _makePoints() {
      const pts = []; const R = this.world.radius || CONFIG.worldRadius;
      const n = Math.max(5, this.target);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.6;
        const r = R * (0.42 + rng() * 0.42);
        let x = Math.cos(a) * r, z = Math.sin(a) * r;
        // Nudge spawns off the hub's river/roads so they aren't stuck.
        if (this.world.onRoad && this.world.onRoad(x, z)) { x += 7; z += 7; }
        pts.push({ x, z });
      }
      return pts;
    }

    // Seed the zone's starting population + its lair boss. Called once when a
    // zone loads (createScene for the hub, ZoneManager on travel).
    populate() {
      this.state.waveTotal = this.target;
      for (let i = 0; i < this.target; i++) this._spawn(this.points[i % this.points.length]);
      if (this.zone.boss && !this.bossDefeated) this._spawnBoss();
      updateMonsterCounter(this.state);
      this._banner();
    }

    _spawn(pt) {
      const pos = new BABYLON.Vector3(pt.x + (rng() - 0.5) * 6, 0, pt.z + (rng() - 0.5) * 6);
      const m = new Monster(this.scene, this.world.shadow, pos, this.zone.level, null,
        { kinds: this.spec.kinds, abilities: this.spec.abilities });
      m.home = { x: pt.x, z: pt.z }; m.homeRange = 11; m.aggroRange = 15;
      m.zoneAmbient = true;             // counts toward this zone's population cap
      this.state.monsters.push(m);
      return m;
    }

    _spawnBoss() {
      const b = this.zone.boss;
      // Map the zone's level to a boss "cycle" so deeper lairs hold tougher kings.
      const cycle = Math.max(1, this.zone.level - 1);
      const boss = new Boss(this.scene, this.world.shadow, new BABYLON.Vector3(0, 0, 0),
        cycle * CONFIG.bossEveryWaves, b.archId);
      if (b.name) boss.name = b.name;
      boss.isLairBoss = true;
      boss.lairZoneId = this.zone.id;   // drives the localized boss-bar name
      this.state.boss = boss;
      this.state.monsters.push(boss);
      this._spawnedBoss = true;
      showBossBar(boss);
      Sfx.play("boss_spawn");
      if (b.intro) toast(t("toast.lairIntro", { intro: tLairBossIntro(this.zone.id) }));
    }

    _ambient() {
      let n = 0;
      for (const m of this.state.monsters) if (m.zoneAmbient && m.alive && m.dying <= 0) n++;
      return n;
    }

    // The spawn point furthest from the player, so respawns don't pop in your face.
    _farPoint() {
      let best = this.points[0], bd = -1; const p = this.player.position;
      for (const pt of this.points) {
        const d = (pt.x - p.x) * (pt.x - p.x) + (pt.z - p.z) * (pt.z - p.z);
        if (d > bd) { bd = d; best = pt; }
      }
      return best;
    }

    update(dt) {
      // Lair boss felled (onMonsterDefeated nulls state.boss) → remember it so it
      // doesn't return this visit, and persist the clear across zone reloads.
      if (this._spawnedBoss && !this.bossDefeated && !this.state.boss) {
        this.bossDefeated = true;
        if (this.state.bossesCleared) this.state.bossesCleared[this.zone.id] = true;
        Quests.onBossCleared(this.zone.id); // advance any "defeat the lair boss" mission
      }

      if (this._ambient() < this.target) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this._spawn(this._farPoint());
          this.respawnTimer = this.respawnDelay;
        }
      } else {
        this.respawnTimer = this.respawnDelay;
      }
      updateMonsterCounter(this.state);
    }

    // A brief "you have entered <zone>" banner (reuses the old wave banner).
    _banner() {
      if (!dom.waveBanner) return;
      dom.waveBanner.textContent = t("label.zone", { icon: this.zone.icon, name: tZoneName(this.zone) });
      dom.waveBanner.classList.remove("show");
      void dom.waveBanner.offsetWidth;       // restart the CSS animation
      dom.waveBanner.classList.add("show");
    }

    // Legacy no-ops — the wave window/widget are retired under the RPG model.
    minimize() {}
    restore() {}
  }

  // =========================================================================
  // ZoneManager — streams zones in and out as the player crosses a PORTAL.
  // Travel is hidden behind a fade veil so the (cheap, primitive-built) zone
  // swap never shows a frozen frame: fade to black, tear the old zone down and
  // build the new one while the screen is covered, then fade back in. The
  // player + camera persist; everything else is rebuilt for the new zone.
  // =========================================================================
  class ZoneManager {
    constructor(scene, player, interaction, state) {
      this.scene = scene; this.player = player; this.interaction = interaction; this.state = state;
      this.transitioning = false;
      this.cooldown = 0;   // brief immunity after arrival so we don't bounce back
    }

    // Per-frame: has the player stepped onto a portal? If so, begin travel.
    check(dt) {
      if (this.transitioning) return;
      if (this.cooldown > 0) { this.cooldown -= dt; return; }
      const world = this.state.world; if (!world) return;
      const p = this.player.position;
      for (const portal of world.portals || []) {
        const dx = p.x - portal.x, dz = p.z - portal.z;
        if (dx * dx + dz * dz <= portal.r * portal.r) { this.travel(portal.to); return; }
      }
    }

    travel(toId) {
      const target = ZONE_BY_ID[toId];
      if (!target || this.transitioning) return;
      this.transitioning = true;
      const fromId = this.state.world.zone.id;
      fadeVeil(true, t("label.zone", { icon: target.icon, name: tZoneName(target) }));
      // Swap after the veil has painted (next macrotask) so the black screen is
      // already up and the teardown/build hitch is never visible.
      setTimeout(() => {
        try { this._swap(fromId, toId, target); }
        catch (e) { console.error(e); showFatal("Zone load failed: " + (e && e.message)); }
        setTimeout(() => { fadeVeil(false); this.transitioning = false; this.cooldown = 1.2; }, 140);
      }, 340);
    }

    _swap(fromId, toId, target) {
      const state = this.state, scene = this.scene, interaction = this.interaction, player = this.player;
      // Persist castle progress before the hub is torn down.
      if (state.castle) state.castleBuilt = state.castle.built.slice();
      // 1) Dispose every live entity, then 2) stream out the old world scenery.
      teardownZone(state, interaction);
      if (state.world && state.world.dispose) state.world.dispose();
      // 3) Build + theme the new world; re-point the systems that hold a world.
      const world = buildWorld(scene, target);
      state.world = world; state.shadow = world.shadow; state.zoneId = toId;
      player.world = world; worldRef = world;
      DayNight.init(world, DayNight.t);   // re-point sky/sun/hemi to the new zone
      Weather.world = world;               // keep the rain system; just re-aim it
      applyZoneMood(scene, target);        // re-tune exposure/contrast for the mood
      // 4) Lay the new zone's content + seed its residents.
      setupZoneContent(scene, world, interaction, player, state);
      const waves = new SpawnDirector(scene, world, interaction, player, state);
      if (state.bossesCleared && state.bossesCleared[toId]) waves.bossDefeated = true;
      waveSystem = waves;
      waves.populate();
      // 5) Arrive at the portal that leads back the way we came.
      placePlayerAtArrival(world, player, fromId);
      // 6) Fire reach-objectives + refresh the HUD.
      Quests.onReach(toId);
      updateLocationHud(target);
      updateMonsterCounter(state);
      updateHealthBar(player.health);
    }
  }

  // Dispose every live entity from the current zone (monsters, projectiles,
  // pickups, NPCs, vendors, the castle) and clear the interaction registry so a
  // fresh zone can be laid down. Leaves the player + camera + HUD intact.
  function teardownZone(state, interaction) {
    for (const m of state.monsters) { try { m.root.dispose(); } catch (e) {} }
    state.monsters.length = 0;
    for (const b of state.bolts) b.dispose(); state.bolts.length = 0;
    for (const c of state.coinsList) c.dispose(); state.coinsList.length = 0;
    if (state.enemyBolts) { for (const h of state.enemyBolts) h.dispose(); state.enemyBolts.length = 0; }
    if (state.drops) { for (const d of state.drops) d.dispose(); state.drops.length = 0; }
    if (state.fx) { for (const f of state.fx) f.dispose(); state.fx.length = 0; }
    for (const a of state.artifacts) { try { if (a._it) interaction.remove(a._it); a.root.dispose(); } catch (e) {} }
    state.artifacts.length = 0;
    for (const r of state.resources) { try { r.dispose(); } catch (e) {} } state.resources.length = 0;
    for (const n of state.npcs) { try { n.dispose(); } catch (e) {} } state.npcs.length = 0;
    if (state.merchant && state.merchant.dispose) { try { state.merchant.dispose(); } catch (e) {} }
    if (state.blacksmith && state.blacksmith.dispose) { try { state.blacksmith.dispose(); } catch (e) {} }
    if (state.castle && state.castle.dispose) { try { state.castle.dispose(); } catch (e) {} }
    state.merchant = null; state.blacksmith = null; state.castle = null;
    state.boss = null; state.dragon = null;
    if (interaction && interaction.clear) interaction.clear();
    hideBossBar();
  }

  // Drop the player at the new zone's RETURN portal (the one leading back to the
  // zone they came from), stepped a few metres inward so they don't re-trigger
  // it. Falls back to just inside the fence if no matching portal exists.
  function placePlayerAtArrival(world, player, fromId) {
    let portal = (world.portals || []).find((p) => p.to === fromId);
    if (!portal && world.portals && world.portals.length) portal = world.portals[0];
    let x = 0, z = (world.radius || 60) - 14;
    if (portal) {
      const len = Math.hypot(portal.x, portal.z) || 1;
      const inward = (len - 9) / len;           // 9m toward the centre
      x = portal.x * inward; z = portal.z * inward;
      player.facing = Math.atan2(-portal.x, -portal.z); // look into the zone
    }
    if (player.root) player.root.position.set(x, 0, z);
  }

  // =========================================================================
  // Scene + loop
  // =========================================================================
  function createScene() {
    const scene = new BABYLON.Scene(engine);
    Quality.detect();   // choose a graphics tier before the first zone is built
    makeEnvironment(scene);  // procedural IBL probe (tier-gated; feeds PBR reflections)

    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, 1.05, 12, new BABYLON.Vector3(0, 1.4, 12), scene);
    camera.lowerRadiusLimit = 6; camera.upperRadiusLimit = 18;
    camera.lowerBetaLimit = 0.35; camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.01; camera.panningSensibility = 0;
    camera.attachControl(dom.canvas, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

    const world = buildWorld(scene);
    // Camera post-processing (ACES tone mapping + tier-gated bloom / SSAO) is set
    // up once; the per-zone mood then tunes exposure / contrast for this zone.
    postFX = setupPostFX(scene, camera);
    applyZoneMood(scene, world.zone);
    const player = new Player(scene, world.shadow);
    player.world = world;          // enable scenery/river collision
    playerRef = player;            // HUD helpers read max health from here
    const interaction = new InteractionSystem();

    const state = {
      scene, shadow: world.shadow, world,
      score: 0, coins: 0, wave: 0, waveTotal: 0, over: false, won: false,
      zoneId: world.zone.id,        // the currently loaded zone
      bossesCleared: {},            // lair bosses defeated this run, by zone id
      castleBuilt: [],              // castle parts raised (survives zone reloads)
      artifacts: [], monsters: [], bolts: [], coinsList: [],
      enemyBolts: [],   // hostile boss projectiles (Hazard)
      drops: [],        // rare gear dropped on the ground (ItemDrop)
      fx: [],           // short-lived impact bursts (Burst)
      resources: [],    // harvestable resource nodes (ResourceNode)
      npcs: [],         // story NPCs (QuestGiver)
      castle: null,     // the CastleSite build system
      dragon: null,     // the final boss, once summoned
      totalKills: 0,    // lifetime sweets felled (quest "hunt" progress)
      waveStats: { kills: 0, artifacts: 0, coins: 0 },
      merchant: null, blacksmith: null, boss: null,
    };

    // Hand out the starting gear and compute the initial stat block.
    player.setupStartingLoadout();

    updateHealthBar(player.health);
    updateMonsterCounter(state);
    updateCoins(state);

    // One-time UI system inits (independent of the active zone).
    Shop.init(state, player);
    Inventory.init(state, player);
    Anvil.init(state, player);
    Quests.init(state, player);
    Story.init(state, player);
    Dialogue.init(state, player);
    Crafting.init(state, player);
    CastleUI.init(state, player);
    updatePotionBar(player);
    updateMaterialsHud(player);
    updateRelicHud(player);
    updateQuestTracker(Quests);

    // Day/night + weather systems drive the sky, sun, fog and rain.
    DayNight.init(world, CONFIG.startTimeOfDay);
    Weather.init(world, scene);

    // Lay the home zone's content (merchant, blacksmith, NPCs, resources, the
    // castle and a few artifacts), then seed its resident monsters.
    setupZoneContent(scene, world, interaction, player, state);

    const waves = new SpawnDirector(scene, world, interaction, player, state);
    waveSystem = waves;
    waves.populate();
    updateLocationHud(world.zone);

    // The zone streamer: moves the player between locations via portals.
    zoneManager = new ZoneManager(scene, player, interaction, state);

    // Publish live handles for the save/load + pause systems.
    sceneRef = scene; worldRef = world; interactionRef = interaction;
    stateRef = state; cameraRef = camera;

    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      if (!gameStarted) return;                       // hold sim until "Start"
      if (paused) return;                             // pause menu freezes the sim
      if (state.over) { cosmetics(state, dt); return; }

      // The day/night + weather systems keep running even while a menu is open
      // or the run is over, so the world feels alive in the background.
      DayNight.update(dt);
      Weather.update(dt, player.position);

      // Freeze gameplay during a zone transition (the fade veil is up); the
      // sky/weather/cosmetics above keep ticking so the world still breathes.
      if (zoneManager && zoneManager.transitioning) { cosmetics(state, dt); return; }

      // While a menu (shop / inventory / anvil / dialogue / craft) is open,
      // freeze gameplay but keep the scene + NPC idle animations live.
      if (uiPaused) {
        if (state.merchant) state.merchant.update(dt);
        if (state.blacksmith) state.blacksmith.update(dt);
        for (const n of state.npcs) n.update(dt);
        if (state.castle) state.castle.update(dt);
        cosmetics(state, dt);
        return;
      }

      player.update(dt, camera);
      // Rigid follow: mutate the camera's pivot vector IN PLACE so the pivot
      // tracks the character exactly while alpha/beta/radius stay untouched.
      // (Assigning camera.target = ... or setTarget() would rebuild the radius
      // from the camera's lagging position, which is what made the apparent
      // distance change while moving.) Zoom is now wheel / two-finger pinch only.
      camera.target.copyFromFloats(player.position.x, player.position.y + 1.4, player.position.z);

      // Stream to the next zone if the player has stepped onto a portal.
      zoneManager.check(dt);
      if (zoneManager.transitioning) { cosmetics(state, dt); return; }

      waveSystem.update(dt);
      if (state.merchant) state.merchant.update(dt);
      if (state.blacksmith) state.blacksmith.update(dt);
      updateBuffs(player, dt);

      // Attacking — ranged weapons fire ballistic bolts/arrows (possibly a
      // multishot spread); melee weapons sweep an arc in front of the player.
      if (Input.wantsCast()) {
        const act = player.tryCast();
        if (act && act.type === "ranged") {
          const w = act.weapon;
          for (const s of act.shots) {
            state.bolts.push(new Projectile(scene, state.world.shadow, s.origin, s.dir, {
              speed: w.boltSpeed, radius: w.boltRadius, damage: w.damage,
              pierce: w.pierce, color: w.color, haloColor: w.haloColor,
              gravity: w.gravity, shape: w.shape,
            }));
          }
          // Distinct audio per ranged weapon family: arrows whoosh, multi-bolt
          // staves shimmer, a plain wand blips.
          Sfx.play(w.shape === "arrow" ? "arrow" : (w.multishot > 1 ? "staff" : "bolt"));
        } else if (act && act.type === "melee") {
          meleeSweep(state, act);
          // Heavy, wide weapons (axe/hammer/greatsword) get a beefier swing.
          const mw = act.weapon;
          Sfx.play((mw.melee && mw.melee.arc >= 2.2) ? "heavy" : "melee");
        }
      }

      updateBolts(state, dt);
      updateHazards(state, player, dt);
      updateMonsters(state, player, dt);
      updateItemDrops(state, player, dt);
      updateCoinDrops(state, player, dt);
      updateMonsterCounter(state);

      // Adventure layer: NPCs, harvest nodes, castle, location-reach objectives.
      for (const n of state.npcs) n.update(dt);
      for (const r of state.resources) r.update(dt);
      if (state.castle) state.castle.update(dt);
      checkLocations(state, player);

      interaction.update(player.position);
      if (Input.consumeInteract() && !player.busy) interaction.trigger();

      cosmetics(state, dt);
    });

    return scene;
  }

  function updateBolts(state, dt) {
    const obstacles = state.world ? state.world.obstacles : null;
    for (let i = state.bolts.length - 1; i >= 0; i--) {
      const b = state.bolts[i];
      const wasAbove = b.mesh.position.y > 0.16;
      b.update(dt);
      if (!b.dead) {
        // Hit-test against live monsters on the XZ plane (bolts fly at hand
        // height while a monster's root sits on the ground, so ignore Y).
        for (const m of state.monsters) {
          if (!m.alive || m.dying > 0 || b.hitSet.has(m)) continue;
          const dx = b.mesh.position.x - m.position.x;
          const dz = b.mesh.position.z - m.position.z;
          if (Math.hypot(dx, dz) <= b.radius + m.radius) {
            const killed = m.hit(b.damage);
            b.hitSet.add(m);
            // Impact: a shower of shards + knockback along the bolt's heading,
            // so hits feel like they connect with weight.
            spawnImpact(state, m.position, b.color || "#ffe27a", { y: 1.0, count: killed ? 12 : 7, spread: killed ? 5 : 3 });
            if (m.knockback) m.knockback(b.vel.x, b.vel.z, killed ? 1.5 : 4 + (b.knock || 0));
            Sfx.play(killed ? "kill" : "hit");
            if (killed) onMonsterDefeated(state, m);
            // Pierce upgrades let a bolt punch through several sweets.
            if (b.pierce > 0) b.pierce--; else b.dead = true;
            break;
          }
        }
        // Environment impact: a bolt that flies into solid scenery splats on it.
        if (!b.dead && obstacles) {
          for (const o of obstacles) {
            const dx = b.mesh.position.x - o.x, dz = b.mesh.position.z - o.z;
            if (dx * dx + dz * dz <= o.r * o.r && b.mesh.position.y < 2.6) {
              spawnImpact(state, b.mesh.position, b.color || "#cfe0ff", { y: 0, count: 5, spread: 2, up: 1.2 });
              b.dead = true; break;
            }
          }
        }
      }
      if (b.dead) {
        // A puff where the bolt struck the ground (it dipped below hand height).
        if (wasAbove && b.mesh.position.y <= 0.16) spawnImpact(state, b.mesh.position, b.color || "#cfe0ff", { y: 0.1, count: 4, spread: 1.6, up: 1.4, life: 0.4 });
        b.dispose(); state.bolts.splice(i, 1);
      }
    }
  }

  function updateMonsters(state, player, dt) {
    for (let i = state.monsters.length - 1; i >= 0; i--) {
      const m = state.monsters[i];
      const touching = m.update(dt, player.position, state);
      if (!m.alive) { state.monsters.splice(i, 1); continue; }
      if (touching && m.dying <= 0 && m.biteTimer <= 0) {
        m.biteTimer = CONFIG.biteCooldown;
        damagePlayer(state, m.contactDamage || CONFIG.contactDamage);
        if (state.over) return;
      }
    }
  }

  // Apply damage to the player from any source (a sweet bite, a boss stomp, a
  // hostile candy bolt). Honours damage reduction and ends the run at 0 HP.
  function damagePlayer(state, rawAmount) {
    if (!playerRef || state.over) return;
    const dmg = rawAmount * (1 - playerRef.damageReduction);
    const hp = playerRef.takeDamage(dmg);
    updateHealthBar(hp);
    flashHurt();
    Sfx.play(hp <= 0 ? "boss_death" : "hurt");
    if (hp <= 0) gameOver(state);
  }

  // Advance hostile boss projectiles; a hit damages the player, then it fizzles.
  function updateHazards(state, player, dt) {
    if (!state.enemyBolts) return;
    for (let i = state.enemyBolts.length - 1; i >= 0; i--) {
      const h = state.enemyBolts[i];
      const hit = h.update(dt, player.position);
      if (hit) { damagePlayer(state, h.damage); h.dead = true; }
      if (h.dead) { h.dispose(); state.enemyBolts.splice(i, 1); }
    }
  }

  // A melee swing: damage every monster within the weapon's reach + arc in
  // front of the player. Wide weapons (axe/hammer) can hit several at once.
  function meleeSweep(state, act) {
    const w = act.weapon, reach = (w.melee && w.melee.range) || 2.5;
    const arc = (w.melee && w.melee.arc) || 1.6;
    const aim = Math.atan2(act.dir.x, act.dir.z);
    for (const m of state.monsters) {
      if (!m.alive || m.dying > 0) continue;
      const dx = m.position.x - act.origin.x, dz = m.position.z - act.origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + m.radius) continue;
      // Within the frontal cone?
      const ang = Math.atan2(dx, dz);
      let diff = Math.abs(((ang - aim + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (diff <= arc / 2) {
        const killed = m.hit(w.damage);
        // Melee hits shove the sweet back along the swing + spray shards.
        spawnImpact(state, m.position, w.color || "#ffe0c0", { y: 1.0, count: killed ? 12 : 6, spread: killed ? 5 : 3 });
        if (m.knockback) m.knockback(dx, dz, killed ? 2 : 6);
        Sfx.play(killed ? "kill" : "hit");
        if (killed) onMonsterDefeated(state, m);
      }
    }
  }

  // A monster (regular sweet or boss) was just killed: award score/coins, apply
  // lifesteal, and clean up the boss bar when a Sweet King falls.
  function onMonsterDefeated(state, m) {
    // Lifesteal heals the player a little per kill (Vampiric Gem upgrade).
    if (playerRef && playerRef.lifesteal > 0) {
      playerRef.health = Math.min(playerRef.maxHealth, playerRef.health + playerRef.lifesteal);
      updateHealthBar(playerRef.health);
    }
    // The dragon is the climax: felling it wins the game.
    if (m.isDragon) {
      addScore(state, CONFIG.dragonScore);
      spawnImpact(state, m.position, "#ff6a3a", { y: 3, count: 28, spread: 9, up: 6, life: 1.1 });
      hideBossBar();
      state.dragon = null;
      Sfx.play("boss_death");
      winGame(state);
      return;
    }
    if (m.isBoss) {
      addScore(state, CONFIG.bossScore);
      state.waveStats.kills++;
      state.totalKills++;
      Quests.onKill(playerRef, state);
      spawnImpact(state, m.position, m.arch ? m.arch.color : "#ff5a6a", { y: 2.5, count: 20, spread: 7, up: 5, life: 0.9 });
      // A boss always pays out a generous purse of coins.
      let left = CONFIG.bossCoinDrop;
      while (left > 0) {
        const v = Math.min(left, 3 + ((rng() * 3) | 0));
        left -= v;
        const off = () => (rng() - 0.5) * 3;
        state.coinsList.push(new Coin(state.scene, state.shadow,
          new BABYLON.Vector3(m.position.x + off(), 0, m.position.z + off()), v));
      }
      // A boss always drops a guaranteed RARE item — the only way to get one.
      const rareId = RARE_DROPS[(rng() * RARE_DROPS.length) | 0];
      const dpos = new BABYLON.Vector3(m.position.x, 0, m.position.z + 2);
      state.drops.push(new ItemDrop(state.scene, state.shadow, dpos, rareId));
      // The Gelatin Hydra bursts into a final knot of sweets on death.
      if (m.archId === "splitter") {
        const n = 3 + Math.min(5, m.cycle || 1);
        for (let i = 0; i < n; i++) {
          const a = rng() * Math.PI * 2, r = m.radius + 1 + rng() * 3;
          const pos = new BABYLON.Vector3(m.position.x + Math.cos(a) * r, 0, m.position.z + Math.sin(a) * r);
          state.monsters.push(new Monster(state.scene, state.shadow, pos, Math.max(1, m.wave || 1)));
          state.waveTotal++;
        }
      }
      hideBossBar();
      if (state.boss === m) state.boss = null;
      Sfx.play("boss_death");
      toast(t("toast.bossDefeated", { boss: bossDisplayName(m), item: tItemName(getDef(rareId)) }));
      return;
    }
    addScore(state, CONFIG.scorePerMonster);
    state.waveStats.kills++;
    state.totalKills++;
    // A candy-pop burst in the sweet's own colour.
    spawnImpact(state, m.position, m.tint || "#ff8ad0", { y: 1.0, count: 10, spread: 4, up: 3 });
    // A "bomber" sweet detonates on death — area damage + a shove to anything
    // nearby (including the player if they're too close).
    if (m.ability === "bomber") {
      spawnImpact(state, m.position, "#ffd34e", { y: 0.8, count: 18, spread: 7, up: 4, life: 0.7 });
      Sfx.play("boss_stomp");
      const blast = 4.5;
      for (const o of state.monsters) {
        if (o === m || !o.alive || o.dying > 0) continue;
        const ox = o.position.x - m.position.x, oz = o.position.z - m.position.z;
        if (Math.hypot(ox, oz) <= blast && o.knockback) o.knockback(ox, oz, 9);
      }
      if (playerRef) {
        const px = playerRef.position.x - m.position.x, pz = playerRef.position.z - m.position.z;
        if (Math.hypot(px, pz) <= blast) damagePlayer(state, 14);
      }
    }
    maybeDropCoin(state, m.position);
    Quests.onKill(playerRef, state);
  }

  // Spin/float dropped rare loot; scoop it into the bag when the player nears.
  function updateItemDrops(state, player, dt) {
    if (!state.drops) return;
    for (let i = state.drops.length - 1; i >= 0; i--) {
      const d = state.drops[i];
      const got = d.update(dt, player.position);
      if (got) {
        const def = getDef(d.id);
        if (invAdd(player, makeItem(d.id))) {
          toast(t("toast.pickedUp", { item: tItemName(def) }));
          if (Inventory.open) Inventory.render();
        } else {
          toast(t("toast.bagFullDrop"));
          continue; // leave it on the ground to grab later
        }
        d.dispose(); state.drops.splice(i, 1);
      } else if (d.life <= 0) {
        d.dispose(); state.drops.splice(i, 1);
      }
    }
  }

  // Roll for a coin drop when a sweet is defeated, and spawn it at the kill spot.
  function maybeDropCoin(state, pos) {
    if (rng() > CONFIG.coinDropChance) return;
    const value = CONFIG.coinValueMin +
      ((rng() * (CONFIG.coinValueMax - CONFIG.coinValueMin + 1)) | 0);
    state.coinsList.push(new Coin(state.scene, state.shadow, pos, value));
  }

  // Spin, magnet and collect coins; drop ones that have sat around too long.
  function updateCoinDrops(state, player, dt) {
    for (let i = state.coinsList.length - 1; i >= 0; i--) {
      const c = state.coinsList[i];
      const got = c.update(dt, player.position);
      if (got) {
        state.coins += c.value;
        state.waveStats.coins += c.value;
        updateCoins(state);
        Sfx.play("coin");
        toast(t("toast.coinPickup", { n: c.value }));
        c.dispose(); state.coinsList.splice(i, 1);
      } else if (c.life <= 0) {
        c.dispose(); state.coinsList.splice(i, 1);
      }
    }
  }

  function cosmetics(state, dt) {
    const t = performance.now() / 1000;
    for (const a of state.artifacts) {
      if (a._it && a._it.enabled) {
        a.gem.rotation.y += dt * 1.6;
        a.gem.position.y = 1.0 + Math.sin(t * 2 + a.gem.uniqueId) * 0.14;
        a.halo.scaling.setAll(1 + Math.sin(t * 3) * 0.12);
      }
    }
    // Tick impact bursts (they animate in every state, even paused-for-menu).
    updateFx(state, dt);
  }

  // =========================================================================
  // Score / HUD helpers
  // =========================================================================
  function addScore(state, points) {
    state.score += points;
    dom.score.textContent = state.score;
  }

  function updateCoins(state) {
    if (dom.coins) dom.coins.textContent = state.coins;
    if (dom.shopCoins) dom.shopCoins.textContent = state.coins;
  }

  // Show how many monsters are roaming the current zone (alive, excluding the
  // pop-on-death animation).
  function updateMonsterCounter(state) {
    if (!dom.monsters) return;
    let left = 0;
    for (const m of state.monsters) if (m.alive && m.dying <= 0) left++;
    dom.monsters.textContent = `${left}`;
  }

  // The HUD "current location" chip (set on load + every zone transition).
  function updateLocationHud(zone) {
    if (dom.location && zone) dom.location.textContent = `${zone.icon} ${tZoneName(zone)}`;
  }

  // The full-screen fade veil that masks a zone transition (a black screen with
  // the destination's name) so the teardown/build hitch is never visible.
  function fadeVeil(on, label) {
    if (!dom.zoneFade) return;
    if (label != null && dom.zoneFadeLabel) dom.zoneFadeLabel.textContent = label;
    dom.zoneFade.classList.toggle("show", !!on);
  }

  function updateHealthBar(hp) {
    const max = playerRef ? playerRef.maxHealth : CONFIG.maxHealth;
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    dom.healthFill.style.width = pct + "%";
    dom.healthFill.style.background = pct > 50
      ? "linear-gradient(90deg, #5be0a0, #6cc6ff)"
      : pct > 25
      ? "linear-gradient(90deg, #ffd34e, #ff9d5c)"
      : "linear-gradient(90deg, #ff5c7a, #ff3b3b)";
  }

  // ---- Materials pouch readout (top-left chip strip) ----
  function updateMaterialsHud(player) {
    if (!dom.materialsBar || !player) return;
    const bits = [];
    for (const id of MATERIAL_IDS) {
      const n = player.materials[id] || 0;
      if (n > 0) bits.push(`<span class="mat-chip">${MATERIALS[id].icon} ${n}</span>`);
    }
    dom.materialsBar.innerHTML = bits.join("");
  }

  // ---- Castle relics collected (small icon row in the HUD) ----
  function updateRelicHud(player) {
    if (!dom.relicBar || !player) return;
    if (!player.relics.length) { dom.relicBar.innerHTML = ""; return; }
    dom.relicBar.innerHTML = "🏰 " + player.relics.map((id) => `<span class="relic-chip" title="${tRelicName(id)}">${RELICS[id].icon}</span>`).join("");
  }

  // ---- The small "current quest" tracker (top-left, under the HUD chips) ----
  // The small HUD tracker is the player's guide: it always shows the live MAIN
  // step (which NPC to see, what to do, where to turn it in) so the campaign can
  // be followed end-to-end with no guesswork. Once the main line is finished it
  // falls back to any tracked side quest.
  function updateQuestTracker() {
    if (!dom.questTracker) return;
    const g = Story.guidance();
    if (g) {
      const cls = g.state === "turnin" ? "qt-done" : g.state === "accept" ? "qt-go" : "";
      dom.questTracker.classList.remove("hidden");
      dom.questTracker.innerHTML =
        `<div class="qt-chap">${t("qt.chapter", { n: g.chapterIndex, title: g.chapterTitle })}</div>` +
        `<div class="qt-title">${t("qt.missionTitle", { title: tQuestTitle(g.mission) })}</div>` +
        `<div class="qt-obj ${cls}">${g.text}</div>`;
      return;
    }
    // Campaign complete — surface an active side quest if there is one, else hide.
    const quest = Quests.tracked ? Quests.tracked() : null;
    if (!quest) { dom.questTracker.classList.add("hidden"); dom.questTracker.innerHTML = ""; return; }
    const done = Quests.isComplete(quest);
    dom.questTracker.classList.remove("hidden");
    dom.questTracker.innerHTML =
      `<div class="qt-title">${t("qt.sideTitle", { title: tQuestTitle(quest) })}${done ? ` <span class="qt-done">${t("qt.sideReturn")}</span>` : ""}</div>` +
      `<div class="qt-obj">${Quests.objectiveText(quest)}</div>`;
  }

  // ---- Day/night clock + weather chips (top bar) ----
  function updateClock(timeOfDay, phase) {
    if (!dom.clock) return;
    const h = Math.floor(timeOfDay * 24), m = Math.floor((timeOfDay * 24 - h) * 60);
    const icon = phase === "night" ? "🌙" : phase === "dusk" ? "🌆" : phase === "dawn" ? "🌅" : "☀️";
    dom.clock.innerHTML = `${icon} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function updateWeatherHud(label, icon) {
    if (!dom.weather) return;
    dom.weather.innerHTML = `${icon} ${label}`;
  }

  // ---- Potion belt (bottom corner): 3 stackable slots + active-buff pills ----
  function updatePotionBar(player) {
    if (!dom.potionBar || !player) return;
    dom.potionBar.innerHTML = "";
    for (let i = 0; i < POTION_SLOTS; i++) {
      const slot = player.potions[i];
      const key = i + 1;
      const cell = document.createElement("button");
      cell.className = "potion-slot" + (slot ? " filled" : " empty");
      if (slot) {
        const def = getDef(slot.id);
        cell.innerHTML = `<span class="pk">${key}</span><span class="pi">${def.icon}</span><span class="pc">×${slot.count}</span>`;
        cell.title = t("potion.slotTitle", { name: tItemName(def), desc: tItemDesc(def), key });
        cell.addEventListener("click", () => { if (gameStarted && !paused && !uiPaused) potionUse(player, i); });
      } else {
        cell.innerHTML = `<span class="pk">${key}</span><span class="pe">·</span>`;
        cell.disabled = true;
      }
      dom.potionBar.appendChild(cell);
    }
    updateBuffBar(player);
  }

  // Active timed potion buffs render as small countdown pills above the belt.
  function updateBuffBar(player) {
    if (!dom.buffBar || !player) return;
    dom.buffBar.innerHTML = "";
    for (const b of player.buffs || []) {
      const def = getDef(b.id);
      const pill = document.createElement("div");
      pill.className = "buff-pill";
      pill.innerHTML = t("buff.pill", { icon: def ? def.icon : "✨", label: tPotionLabel(b.id), n: Math.ceil(b.time) });
      dom.buffBar.appendChild(pill);
    }
  }

  // ---- Boss health bar (shown only while a boss is alive) ----
  function showBossBar(boss) {
    if (!dom.bossBar) return;
    dom.bossName.textContent = t("boss.barName", { name: bossDisplayName(boss) });
    updateBossBar(boss);
    dom.bossBar.classList.remove("hidden");
  }
  function updateBossBar(boss) {
    if (!dom.bossFill) return;
    const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
    dom.bossFill.style.width = pct + "%";
  }
  function hideBossBar() {
    if (dom.bossBar) dom.bossBar.classList.add("hidden");
  }

  let hurtTimer = null;
  function flashHurt() {
    dom.hud.style.boxShadow = "inset 0 0 120px rgba(255,40,60,0.55)";
    clearTimeout(hurtTimer);
    hurtTimer = setTimeout(() => { dom.hud.style.boxShadow = "none"; }, 160);
  }

  function bannerWave(n, monsterCount, bossName) {
    dom.waveBanner.textContent = bossName
      ? t("banner.bossWave", { n, boss: bossName })
      : t("banner.sweepWave", { n, count: monsterCount });
    dom.waveBanner.classList.remove("show");
    void dom.waveBanner.offsetWidth; // restart the CSS animation
    dom.waveBanner.classList.add("show");
  }

  function gameOver(state) {
    state.over = true;
    dom.prompt.classList.add("hidden");
    hideBossBar();
    const where = (state.world && state.world.zone) ? tZoneName(state.world.zone) : "—";
    if (dom.overText) dom.overText.innerHTML = t("over.tagline", { score: state.score, where });
    setTimeout(() => dom.over.classList.remove("hidden"), 600);
  }

  // The victory path: the castle is built and the dragon is slain. Freezes the
  // run and shows the win screen with the final tally.
  function winGame(state) {
    if (state.won) return;
    state.won = true; state.over = true;
    dom.prompt.classList.add("hidden");
    hideBossBar();
    Story.onWin();                         // mark the finale resolved
    updateQuestTracker();                  // campaign complete → clear the tracker
    if (dom.winText) dom.winText.innerHTML = t("win.tagline", { score: state.score, kills: state.totalKills });
    if (dom.winStory) dom.winStory.innerHTML = t("win.ending", { title: tStoryEndingTitle(), text: tStoryEndingText() }); // ending framing
    Sfx.play("artifact");
    setTimeout(() => { if (dom.win) dom.win.classList.remove("hidden"); }, 800);
  }

  // =========================================================================
  // Save / Load — serialize the whole run to a JSON file the player downloads,
  // and restore it from a file on any device.
  //
  // The procedural environment is captured by its RNG seed (re-seeded + rebuilt
  // on load), while every live entity (player stats + perks, money, score,
  // monsters, the boss, artifacts and dropped coins, plus the wave clock) is
  // serialized explicitly so the run resumes exactly where it left off.
  // =========================================================================
  const SAVE_VERSION = 6;
  const PENDING_LOAD_KEY = "gg3d_pending_load"; // sessionStorage hand-off across reload
  const AUTOSTART_KEY = "gg3d_autostart";       // restart -> skip the start screen

  // sessionStorage isn't available in the headless test harness (or some privacy
  // modes); fail soft everywhere it's touched.
  function sessionGet(k) {
    try { return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(k) : null; }
    catch (e) { return null; }
  }
  function sessionSet(k, v) {
    try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(k, v); } catch (e) {}
  }
  function sessionDel(k) {
    try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(k); } catch (e) {}
  }

  function serializeGame() {
    const state = stateRef, player = playerRef, waves = waveSystem;
    if (!state || !player || !waves) return null;
    const round = (n) => Math.round(n * 1000) / 1000;
    const xz = (p) => [round(p.x), round(p.z)];

    return {
      v: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      seed: worldSeed,
      // RPG world: the zone you're standing in + which lair bosses are already
      // cleared. A zone's wandering monsters aren't saved — they regenerate from
      // the zone's spawn table on load (and respawn during play anyway).
      zone: state.zoneId,
      bossesCleared: Object.assign({}, state.bossesCleared),
      score: state.score,
      money: state.coins,
      player: {
        health: round(player.health),
        facing: round(player.facing),
        pos: xz(player.position),
        // The gear *is* the build now: save the bag + equipped slots (with their
        // enhancement levels) and the stat block rebuilds via recomputeStats().
        inventory: player.inventory.map((it) => ({ id: it.id, lvl: instLevel(it) })),
        equipment: serializeEquipment(player),
        // The 3-slot potion belt.
        potions: player.potions.map((s) => (s ? { id: s.id, count: s.count } : null)),
        // Adventure state: gathered materials + collected castle relics.
        materials: Object.assign({}, player.materials),
        relics: player.relics.slice(),
      },
      // Story progression: quests, the campaign-flow state, the castle build
      // state, day/night + weather.
      totalKills: state.totalKills,
      won: !!state.won,
      quests: {
        active: Quests.active.slice(),
        completed: Quests.completed.slice(),
        acceptKills: Object.assign({}, Quests.acceptKills),
        reached: Object.assign({}, Quests.reached),
        talked: Object.assign({}, Quests.talked),
      },
      story: Story.serialize(),
      castle: state.castle ? state.castle.built.slice() : (state.castleBuilt || []),
      time: round(DayNight.t),
      weather: Weather.state,
    };
  }

  // Equipment → a plain { slot: {id,lvl} | "__2H__" | null } map for the save.
  function serializeEquipment(player) {
    const out = {};
    for (const slot of EQUIP_SLOTS) {
      const occ = player.equipment[slot];
      out[slot] = occ === TWO_HANDED ? TWO_HANDED : occ ? { id: occ.id, lvl: instLevel(occ) } : null;
    }
    return out;
  }

  // Rebuild an item instance from a save entry: a plain id string (legacy v2)
  // or a { id, lvl } object (v3+). Returns null for unknown items.
  function itemFromSave(entry) {
    if (entry == null) return null;
    const id = typeof entry === "string" ? entry : entry.id;
    if (!getDef(id)) return null;
    const inst = makeItem(id);
    const lvl = typeof entry === "object" ? (entry.lvl | 0) : 0;
    if (lvl > 0) inst.level = lvl;
    return inst;
  }

  // Basic structural validation so a bad/old/foreign file fails cleanly. Accepts
  // current and one-back save versions so older files still load.
  function validateSave(d) {
    return !!(d && typeof d.v === "number" && d.v >= 2 && d.v <= SAVE_VERSION &&
      typeof d.seed === "number" &&
      d.player && Array.isArray(d.player.pos));
  }

  // Rebuild a saved run on top of the freshly created (seeded) scene. The world
  // is regenerated from the seed; the player + progression are laid back on top,
  // then we STREAM to the saved zone (which rebuilds its scenery + residents)
  // and drop the player exactly where they left off.
  function applySave(d) {
    const state = stateRef, player = playerRef;
    const interaction = interactionRef;
    if (!state || !player) throw new Error("game not ready");

    // Score / money economy.
    state.score = d.score | 0;
    state.coins = d.money | 0;

    // Persistent progression the zone rebuild reads.
    state.bossesCleared = Object.assign({}, d.bossesCleared || {});
    state.castleBuilt = (d.castle || []).slice();

    // Player gear (zone-independent). Rebuild the bag + equipped slots from item
    // ids, then recompute the whole derived stat block.
    const ps = d.player;
    player.facing = ps.facing || 0;
    player.inventory = (ps.inventory || []).map(itemFromSave).filter(Boolean);
    const eq = player.equipment;
    for (const slot of EQUIP_SLOTS) eq[slot] = null;
    const savedEq = ps.equipment || {};
    for (const slot of EQUIP_SLOTS) {
      const v = savedEq[slot];
      if (v === TWO_HANDED) eq[slot] = TWO_HANDED;
      else { const inst = itemFromSave(v); if (inst) eq[slot] = inst; }
    }
    // Restore the potion belt (defaults to empty for legacy saves).
    player.potions = [null, null, null];
    const savedPot = ps.potions || [];
    for (let i = 0; i < POTION_SLOTS; i++) {
      const s = savedPot[i];
      if (s && getDef(s.id) && s.count > 0) player.potions[i] = { id: s.id, count: Math.min(POTION_STACK_MAX, s.count | 0) };
    }
    // Crafting materials + collected relics (default for legacy saves).
    for (const id of MATERIAL_IDS) player.materials[id] = 0;
    if (ps.materials) for (const k in ps.materials) if (k in player.materials) player.materials[k] = ps.materials[k] | 0;
    player.relics = (ps.relics || []).filter((id) => RELICS[id]);
    player.buffs = [];
    recomputeStats(player);
    updatePotionBar(player);
    updateMaterialsHud(player);
    updateRelicHud(player);

    // Story progression: kills, quests, the campaign-flow state, win flag.
    // Unknown ids (e.g. from a pre-campaign save) drop out, defaulting cleanly.
    state.totalKills = d.totalKills | 0;
    state.won = !!d.won;
    const q = d.quests || {};
    Quests.active = (q.active || []).filter((id) => QUEST_BY_ID[id]);
    Quests.completed = (q.completed || []).filter((id) => QUEST_BY_ID[id]);
    Quests.acceptKills = Object.assign({}, q.acceptKills || {});
    Quests.reached = Object.assign({}, q.reached || {});
    Quests.talked = Object.assign({}, q.talked || {});
    Story.restore(d.story);
    updateQuestTracker();

    // Stream to the saved zone. If we're already there (the hub on boot), just
    // restore the castle build + re-wake the dragon if it was complete.
    const targetZone = (d.zone && ZONE_BY_ID[d.zone]) ? d.zone : HUB_ZONE;
    if (state.zoneId !== targetZone && zoneManager) {
      zoneManager._swap(state.zoneId, targetZone, ZONE_BY_ID[targetZone]);
    } else if (state.castle) {
      state.castle.restore(state.castleBuilt);
      state.castle.resummon();
    }

    // Day/night + weather (after the swap so the zone's handles are current).
    if (d.time != null) DayNight.set(d.time);
    if (d.weather) Weather.setState(d.weather);

    // Drop the player exactly where they saved (override the arrival spot).
    player.root.position.set(ps.pos[0], 0, ps.pos[1]);
    player.health = ps.health != null ? Math.min(player.maxHealth, ps.health) : player.maxHealth;
    updateHealthBar(player.health);

    // Refresh every HUD readout.
    addScore(state, 0);
    updateCoins(state);
    updateLocationHud(ZONE_BY_ID[state.zoneId]);
    updateMonsterCounter(state);
  }

  // Serialize the current run and hand the player a .json download.
  function downloadSave() {
    const data = serializeGame();
    if (!data) { toast(t("toast.nothingToSave")); return false; }
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `good-game-3d-${data.zone || "meadow"}-${data.score | 0}pts-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(t("toast.saved"));
      return true;
    } catch (e) {
      console.error(e);
      toast(t("toast.saveFailed"));
      return false;
    }
  }

  // Read a save file the player picked, validate it, stash it and reload so the
  // boot path can re-seed the world and lay the run back in.
  function loadFromFile(file, onError) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { data = null; }
      if (!validateSave(data)) {
        if (onError) onError(t("toast.invalidSave"));
        return;
      }
      sessionSet(PENDING_LOAD_KEY, reader.result);
      window.location.reload();
    };
    reader.onerror = () => { if (onError) onError(t("toast.readError")); };
    reader.readAsText(file);
  }

  // =========================================================================
  // Pause menu — opens mid-game (freezing the sim), with Resume / Save / Restart
  // / Exit. Restart and Exit ask for confirmation to guard against misclicks.
  // =========================================================================
  const Pause = {
    pendingAction: null, // "restart" | "exit" while the confirm dialog is up

    canOpen() { return gameStarted && stateRef && !stateRef.over && !paused && !Shop.open && !Inventory.open && !Anvil.open && !Dialogue.open && !Crafting.open && !CastleUI.open && !QuestLog.open; },

    open() {
      if (!this.canOpen()) return;
      paused = true;
      this.hideConfirm();
      this.refreshTexts();
      dom.pauseMenu.classList.remove("hidden");
    },
    // The wave/score line + any open confirm message are interpolated, so they
    // localize live when the language is switched from the pause settings.
    refreshTexts() {
      const wave = waveSystem ? waveSystem.wave : 0;
      const score = stateRef ? stateRef.score : 0;
      if (dom.pauseStats) dom.pauseStats.innerHTML = t("pause.stats", { wave, score });
      if (this.pendingAction && dom.confirmText)
        dom.confirmText.textContent = t(this.pendingAction === "restart" ? "pause.confirmRestart" : "pause.confirmExit");
    },
    close() {
      if (!paused) return;
      paused = false;
      this.hideConfirm();
      dom.pauseMenu.classList.add("hidden");
    },
    toggle() { if (paused) this.close(); else this.open(); },

    askConfirm(action, text) {
      this.pendingAction = action;
      if (dom.confirmText) dom.confirmText.textContent = text;
      if (dom.confirmDialog) dom.confirmDialog.classList.remove("hidden");
    },
    hideConfirm() {
      this.pendingAction = null;
      if (dom.confirmDialog) dom.confirmDialog.classList.add("hidden");
    },
    confirmYes() {
      const action = this.pendingAction;
      this.hideConfirm();
      if (action === "restart") {
        sessionSet(AUTOSTART_KEY, "1");
        sessionDel(PENDING_LOAD_KEY);
        window.location.reload();
      } else if (action === "exit") {
        sessionDel(AUTOSTART_KEY);
        sessionDel(PENDING_LOAD_KEY);
        window.location.reload(); // back to the start screen
      }
    },

    init() {
      if (dom.pauseBtn) dom.pauseBtn.addEventListener("click", () => this.open());
      if (dom.resumeBtn) dom.resumeBtn.addEventListener("click", () => this.close());
      if (dom.saveBtn) dom.saveBtn.addEventListener("click", () => {
        // The toast lives behind the pause overlay, so confirm on the button.
        if (downloadSave() && dom.saveBtn) {
          const orig = t("pause.save");
          dom.saveBtn.textContent = t("pause.savedBtn");
          setTimeout(() => { if (dom.saveBtn) dom.saveBtn.textContent = orig; }, 1600);
        }
      });
      if (dom.restartBtn) dom.restartBtn.addEventListener("click",
        () => this.askConfirm("restart", t("pause.confirmRestart")));
      if (dom.exitBtn) dom.exitBtn.addEventListener("click",
        () => this.askConfirm("exit", t("pause.confirmExit")));
      if (dom.confirmYes) dom.confirmYes.addEventListener("click", () => this.confirmYes());
      if (dom.confirmNo) dom.confirmNo.addEventListener("click", () => this.hideConfirm());
    },
  };

  // ---- UI / boot ---------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    dom.toast.textContent = msg; dom.toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2200);
  }
  function startGame(loaded) {
    dom.overlay.classList.add("hidden"); dom.hud.classList.remove("hidden");
    if (isTouch) dom.touch.classList.remove("hidden");
    dom.canvas.focus();
    gameStarted = true;
    Music.start(); // browsers only allow audio after a user gesture (the click)
    Sfx.unlock();  // same gesture unlocks the sound-effect synth
    // Fresh start → frame the adventure with the opening beat. Skipped when
    // restoring a save (mid-story) and under the headless harness (which drives
    // input directly and must not be blocked by the modal).
    if (!loaded && !(typeof window !== "undefined" && window.__GG_TEST__)) Story.maybeShowIntro();
  }

  // =========================================================================
  // Sfx — short procedurally-synthesised sound effects via the Web Audio API.
  // Like the Music system there are NO audio files: every weapon swing, bolt,
  // pickup, potion, enhancement and boss attack is generated in-browser, so the
  // game ships on static hosting with zero assets. Headless-safe (no-ops with
  // no AudioContext, as in the Node test harness). Unlocked on the first user
  // gesture (the Start click), shared with Music.
  // =========================================================================
  const Sfx = {
    ctx: null, master: null, on: true, _noiseBuf: null,

    _ensure() {
      if (this.ctx) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (e) { return false; }
    },
    unlock() {
      if (!this._ensure()) return;
      try { if (this.ctx.state === "suspended") this.ctx.resume(); } catch (e) {}
    },
    setEnabled(on) { this.on = !!on; },

    // A single enveloped oscillator tone (optionally pitch-swept).
    _tone(t, { freq, freq2, dur = 0.15, type = "sine", peak = 0.3, delay = 0 }) {
      const ctx = this.ctx, start = t + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(start); osc.stop(start + dur + 0.05);
    },
    // A short burst of filtered noise — good for swings, stomps and explosions.
    _noise(t, { dur = 0.2, peak = 0.3, cutoff = 1200, delay = 0 }) {
      const ctx = this.ctx, start = t + delay;
      if (!this._noiseBuf) {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this._noiseBuf = buf;
      }
      const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
      const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(start); src.stop(start + dur + 0.02);
    },

    play(name) {
      if (!this.on || !this._ensure()) return;
      try {
        if (this.ctx.state === "suspended") this.ctx.resume();
        const t = this.ctx.currentTime + 0.001;
        switch (name) {
          case "bolt":   this._tone(t, { freq: 720, freq2: 980, dur: 0.16, type: "triangle", peak: 0.22 }); break;
          case "arrow":  this._tone(t, { freq: 1000, freq2: 280, dur: 0.18, type: "sawtooth", peak: 0.16 });
                         this._noise(t, { dur: 0.12, peak: 0.1, cutoff: 2600 }); break;
          case "staff":  this._tone(t, { freq: 520, freq2: 880, dur: 0.2, type: "sine", peak: 0.22 });
                         this._tone(t, { freq: 660, freq2: 1100, dur: 0.2, type: "triangle", peak: 0.12, delay: 0.04 }); break;
          case "melee":  this._noise(t, { dur: 0.16, peak: 0.28, cutoff: 1400 });
                         this._tone(t, { freq: 240, freq2: 140, dur: 0.16, type: "sawtooth", peak: 0.12 }); break;
          case "heavy":  this._noise(t, { dur: 0.22, peak: 0.34, cutoff: 900 });
                         this._tone(t, { freq: 180, freq2: 90, dur: 0.22, type: "square", peak: 0.16 }); break;
          case "hit":    this._tone(t, { freq: 300, freq2: 180, dur: 0.1, type: "square", peak: 0.16 }); break;
          case "kill":   this._tone(t, { freq: 520, freq2: 120, dur: 0.22, type: "triangle", peak: 0.2 }); break;
          case "coin":   this._tone(t, { freq: 880, dur: 0.08, type: "square", peak: 0.16 });
                         this._tone(t, { freq: 1320, dur: 0.12, type: "square", peak: 0.16, delay: 0.07 }); break;
          case "artifact": [0, 4, 7, 12].forEach((s, i) => this._tone(t, { freq: 523.25 * Math.pow(2, s / 12), dur: 0.18, type: "triangle", peak: 0.16, delay: i * 0.06 })); break;
          case "potion": this._tone(t, { freq: 440, freq2: 880, dur: 0.25, type: "sine", peak: 0.22 });
                         this._tone(t, { freq: 660, freq2: 1320, dur: 0.2, type: "triangle", peak: 0.12, delay: 0.08 }); break;
          case "enhance": this._tone(t, { freq: 1200, dur: 0.1, type: "square", peak: 0.18 });
                          this._tone(t, { freq: 1800, dur: 0.16, type: "triangle", peak: 0.16, delay: 0.06 });
                          this._noise(t, { dur: 0.1, peak: 0.08, cutoff: 5000 }); break;
          case "buy":    this._tone(t, { freq: 660, dur: 0.1, type: "triangle", peak: 0.18 });
                         this._tone(t, { freq: 990, dur: 0.12, type: "triangle", peak: 0.16, delay: 0.07 }); break;
          case "error":  this._tone(t, { freq: 200, freq2: 120, dur: 0.16, type: "sawtooth", peak: 0.16 }); break;
          case "hurt":   this._tone(t, { freq: 220, freq2: 90, dur: 0.2, type: "sawtooth", peak: 0.22 }); break;
          case "boss_charge": this._tone(t, { freq: 120, freq2: 320, dur: 0.5, type: "sawtooth", peak: 0.26 }); break;
          case "boss_cast":   this._tone(t, { freq: 900, freq2: 200, dur: 0.3, type: "square", peak: 0.2 }); break;
          case "boss_stomp":  this._noise(t, { dur: 0.5, peak: 0.4, cutoff: 600 });
                              this._tone(t, { freq: 90, freq2: 40, dur: 0.5, type: "sine", peak: 0.3 }); break;
          case "boss_summon": [0, 5, 9, 14].forEach((s, i) => this._tone(t, { freq: 330 * Math.pow(2, s / 12), dur: 0.3, type: "sawtooth", peak: 0.1, delay: i * 0.05 })); break;
          case "boss_spawn":  this._tone(t, { freq: 70, freq2: 160, dur: 0.7, type: "sawtooth", peak: 0.3 });
                              this._noise(t, { dur: 0.5, peak: 0.18, cutoff: 700 }); break;
          case "boss_death":  this._tone(t, { freq: 400, freq2: 50, dur: 0.9, type: "sawtooth", peak: 0.32 });
                              this._noise(t, { dur: 0.7, peak: 0.22, cutoff: 800, delay: 0.05 }); break;
          default: break;
        }
      } catch (e) { /* never let a sound break the game */ }
    },
  };

  // =========================================================================
  // Music — a small procedurally-synthesised soundtrack via the Web Audio API.
  // Synthesised (no audio files) so it ships on static hosting with zero assets
  // and starts instantly. A gentle looping chord progression with a plucky
  // arpeggio + soft bass. Toggle with the 🔊 button or the "M" key. Audio can
  // only start after a user gesture, so we kick it off from startGame().
  // =========================================================================
  const Music = {
    ctx: null, master: null, timer: null, on: true, step: 0, started: false,
    // A wistful candy-land loop: chords as semitone offsets from A2 (≈110 Hz).
    chords: [[0, 4, 7, 11], [-3, 0, 4, 9], [-7, -3, 0, 5], [2, 5, 9, 12]],
    bpm: 96,

    _freq(semi) { return 110 * Math.pow(2, semi / 12); },

    _ensure() {
      if (this.ctx) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.0;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (e) { return false; }
    },

    // One short synth note (osc → its own envelope → master).
    _note(freq, t, dur, type, peak) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.05);
    },

    _tick() {
      if (!this.ctx) return;
      const beat = 60 / this.bpm;
      const t = this.ctx.currentTime + 0.05;
      const chord = this.chords[(this.step >> 2) % this.chords.length];
      const arpNote = chord[this.step % chord.length];
      // Plucky lead arpeggio.
      this._note(this._freq(arpNote + 12), t, beat * 0.9, "triangle", 0.18);
      // Soft bass on the downbeat of each chord.
      if (this.step % 4 === 0) this._note(this._freq(chord[0] - 12), t, beat * 1.8, "sine", 0.22);
      // A pad shimmer mid-bar.
      if (this.step % 4 === 2) this._note(this._freq(chord[2]), t, beat * 1.4, "sawtooth", 0.05);
      this.step++;
    },

    start() {
      if (!this._ensure()) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.started = true;
      this._applyVolume();
      if (this.timer == null && this.on) {
        const beat = 60 / this.bpm;
        this._tick();
        this.timer = setInterval(() => this._tick(), beat * 1000);
      }
    },
    _applyVolume() {
      if (!this.master) return;
      try {
        const target = this.on ? 0.5 : 0.0;
        this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
      } catch (e) { this.master.gain.value = this.on ? 0.5 : 0.0; }
    },
    toggle() {
      this.on = !this.on;
      if (this.on) { this.start(); } else if (this.timer != null) { clearInterval(this.timer); this.timer = null; }
      this._applyVolume();
      if (dom.musicBtn) {
        dom.musicBtn.textContent = this.on ? "🔊" : "🔇";
        dom.musicBtn.title = t(this.on ? "btnTitle.muteMusic" : "btnTitle.playMusic");
      }
      return this.on;
    },
  };

  // ---- Fullscreen (whole page, so the HUD/joystick stay visible) ----------
  const Fullscreen = {
    el: document.documentElement,
    supported() {
      const e = this.el;
      return !!(e && (e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen));
    },
    active() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    },
    toggle() {
      try {
        if (!this.active()) {
          const e = this.el;
          (e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen).call(e);
        } else {
          (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
        }
      } catch (err) { console.warn("Fullscreen failed:", err); }
    },
    init() {
      if (!dom.fsBtn) return;
      if (!this.supported()) { dom.fsBtn.style.display = "none"; return; } // e.g. iOS Safari
      const sync = () => {
        const on = this.active();
        dom.fsBtn.textContent = on ? "✕" : "⛶";
        dom.fsBtn.title = t(on ? "btnTitle.exitFullscreen" : "btnTitle.fullscreen");
        engine.resize();
      };
      this.sync = sync;   // let applyLocale refresh the title on a language switch
      dom.fsBtn.addEventListener("click", () => this.toggle());
      document.addEventListener("fullscreenchange", sync);
      document.addEventListener("webkitfullscreenchange", sync);
      sync();
    },
  };

  function boot() {
    try {
      Input.init();

      // Locale: apply the saved/default language to the static markup before the
      // world builds, so the start screen paints in the right language, then wire
      // the selectors on the start screen + pause settings.
      const savedLocale = localGet(LOCALE_KEY);
      if (savedLocale && LOCALES[savedLocale]) I18N.locale = savedLocale;
      try { if (document.documentElement) document.documentElement.lang = I18N.locale; } catch (e) {}
      applyStaticI18n();
      _syncLangButtons();
      const pickLocale = (loc) => applyLocale(loc, true);
      [["langEn", "en"], ["langRu", "ru"], ["langEnPause", "en"], ["langRuPause", "ru"]].forEach(([id, loc]) => {
        if (dom[id]) dom[id].addEventListener("click", () => pickLocale(loc));
      });

      // A save chosen on the start screen is stashed in sessionStorage, then the
      // page reloads into this path. Re-seed BEFORE building the world so the
      // environment regenerates identically, then lay the run back in once ready.
      let pendingLoad = null;
      const rawPending = sessionGet(PENDING_LOAD_KEY);
      if (rawPending) {
        sessionDel(PENDING_LOAD_KEY);
        try { pendingLoad = JSON.parse(rawPending); } catch (e) { pendingLoad = null; }
        if (pendingLoad && !validateSave(pendingLoad)) pendingLoad = null;
      }
      if (pendingLoad) setSeed(pendingLoad.seed);

      const wantAutostart = sessionGet(AUTOSTART_KEY) === "1";
      if (wantAutostart) sessionDel(AUTOSTART_KEY);

      const scene = createScene();
      scene.executeWhenReady(() => {
        dom.loadHint.textContent = t("hint.ready");
        dom.startBtn.disabled = false;
        if (pendingLoad) {
          try { applySave(pendingLoad); startGame(true); toast(t("toast.loaded")); }
          catch (e) { console.error(e); showFatal("Couldn't load save: " + e.message); }
        } else if (wantAutostart) {
          startGame();
        }
      });
      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", () => engine.resize());
      dom.startBtn.addEventListener("click", startGame);
      dom.replayBtn.addEventListener("click", () => window.location.reload());
      // Shop open/close + Buy/Featured/Sell tabs.
      dom.shopClose.addEventListener("click", () => Shop.closeShop());
      dom.shopDone.addEventListener("click", () => Shop.closeShop());
      if (dom.shopTabBuy) dom.shopTabBuy.addEventListener("click", () => Shop.setTab("buy"));
      if (dom.shopTabRare) dom.shopTabRare.addEventListener("click", () => Shop.setTab("rare"));
      if (dom.shopTabSell) dom.shopTabSell.addEventListener("click", () => Shop.setTab("sell"));

      // Blacksmith / anvil overlay close buttons.
      if (dom.anvilClose) dom.anvilClose.addEventListener("click", () => Anvil.close());
      if (dom.anvilDone) dom.anvilDone.addEventListener("click", () => Anvil.close());

      // Inventory overlay: open via the 🎒 buttons or the "I" key.
      if (dom.invBtn) dom.invBtn.addEventListener("click", () => Inventory.toggle());
      if (dom.bagBtn) dom.bagBtn.addEventListener("click", () => Inventory.toggle());
      if (dom.invClose) dom.invClose.addEventListener("click", () => Inventory.close());
      if (dom.invDone) dom.invDone.addEventListener("click", () => Inventory.close());

      // Adventure overlays: dialogue, crafting, castle, quest log.
      if (dom.dlgClose) dom.dlgClose.addEventListener("click", () => Dialogue.close());
      if (dom.craftBtn) dom.craftBtn.addEventListener("click", () => Crafting.toggle());
      if (dom.craftClose) dom.craftClose.addEventListener("click", () => Crafting.close());
      if (dom.craftDone) dom.craftDone.addEventListener("click", () => Crafting.close());
      if (dom.castleClose) dom.castleClose.addEventListener("click", () => CastleUI.close());
      if (dom.castleDone) dom.castleDone.addEventListener("click", () => CastleUI.close());
      if (dom.questBtn) dom.questBtn.addEventListener("click", () => QuestLog.toggle());
      if (dom.questLogClose) dom.questLogClose.addEventListener("click", () => QuestLog.close());
      if (dom.questLogDone) dom.questLogDone.addEventListener("click", () => QuestLog.close());
      if (dom.winReplayBtn) dom.winReplayBtn.addEventListener("click", () => window.location.reload());

      // Music toggle (🔊 / 🔇).
      if (dom.musicBtn) dom.musicBtn.addEventListener("click", () => Music.toggle());

      // Start-screen "Load progress" -> pick a file -> reload into the save.
      if (dom.loadBtn && dom.loadFile) {
        dom.loadBtn.addEventListener("click", () => dom.loadFile.click());
        dom.loadFile.addEventListener("change", (e) => {
          const file = e.target.files && e.target.files[0];
          loadFromFile(file, (msg) => {
            if (dom.loadHint) { dom.loadHint.style.color = "#ff8a8a"; dom.loadHint.textContent = msg; }
          });
          e.target.value = ""; // allow re-picking the same file
        });
      }

      // In-game pause menu + Escape behaviour: Escape closes the shop if it's
      // open, otherwise toggles the pause menu (or backs out of a confirm).
      Pause.init();
      window.addEventListener("keydown", (e) => {
        // Potion belt hotkeys 1 / 2 / 3 — quaff the matching slot mid-fight.
        if ((e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3") &&
            gameStarted && !paused && !uiPaused && playerRef) {
          potionUse(playerRef, e.code.charCodeAt(5) - 49); // "1"->0, "2"->1, "3"->2
          e.preventDefault(); return;
        }
        // Inventory hotkey (only once playing, and not while another menu is up).
        if ((e.code === "KeyI" || e.code === "KeyB") && gameStarted && !paused && !Shop.open && !Anvil.open && !Dialogue.open && !Crafting.open && !CastleUI.open) {
          Inventory.toggle(); e.preventDefault(); return;
        }
        // Crafting bench (C) and quest log (J) hotkeys.
        if (e.code === "KeyC" && gameStarted && !paused && !Shop.open && !Anvil.open && !Inventory.open && !Dialogue.open && !CastleUI.open) {
          Crafting.toggle(); e.preventDefault(); return;
        }
        if ((e.code === "KeyJ" || e.code === "KeyL") && gameStarted && !paused && !Shop.open && !Anvil.open && !Inventory.open && !Dialogue.open && !Crafting.open) {
          QuestLog.toggle(); e.preventDefault(); return;
        }
        if (e.code === "KeyM") { Music.toggle(); return; }
        if (e.code !== "Escape") return;
        if (Shop.open) { Shop.closeShop(); return; }
        if (Anvil.open) { Anvil.close(); return; }
        if (Inventory.open) { Inventory.close(); return; }
        if (Dialogue.open) { Dialogue.close(); return; }
        if (Crafting.open) { Crafting.close(); return; }
        if (CastleUI.open) { CastleUI.close(); return; }
        if (QuestLog.open) { QuestLog.close(); return; }
        if (paused && Pause.pendingAction) { Pause.hideConfirm(); return; }
        Pause.toggle();
      });

      Fullscreen.init();
    } catch (e) { showFatal(e.message); throw e; }
  }

  // ---- materials -------------------------------------------------------------
  // PBR on capable tiers (energy-conserving, env-lit) with a StandardMaterial
  // fallback on weak GPUs / headless. Both share one API so the rest of the game
  // never branches: mat()/emat() return whichever the active tier wants. A small
  // alias maps the legacy diffuseColor/specularColor writes (weapon recolour, NPC
  // markers, …) onto the PBR channels so every existing build/animation path keeps
  // working untouched. Backdrop materials that lean on StandardMaterial specifics
  // (the unlit sky dome, the sea/river sheen) call stdMat/stdEmat directly.
  function stdMat(scene, name, hex) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    return m;
  }
  function stdEmat(scene, name, hex, emissive) {
    const m = stdMat(scene, name, hex);
    m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(emissive);
    return m;
  }
  function pbrMat(scene, name, hex) {
    const m = new BABYLON.PBRMaterial(name, scene);
    m._ggPBR = true;
    m.albedoColor = BABYLON.Color3.FromHexString(hex);
    m.metallic = 0.0; m.roughness = 0.82;
    m.environmentIntensity = ENV_ON ? 0.6 : 0.0;
    // Legacy aliases: lots of code still writes .diffuseColor / .specularColor.
    try {
      Object.defineProperty(m, "diffuseColor", {
        configurable: true,
        get() { return this.albedoColor; },
        set(v) { this.albedoColor = v; },
      });
      let _spec = new BABYLON.Color3(0.08, 0.08, 0.08);
      Object.defineProperty(m, "specularColor", {
        configurable: true,
        get() { return _spec; },
        set(v) { _spec = v; },
      });
    } catch (e) {}
    return m;
  }
  function pbrEmat(scene, name, hex, emissive) {
    const m = pbrMat(scene, name, hex);
    m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(emissive);
    return m;
  }
  function usePBR() { return !!(BABYLON.PBRMaterial && Quality.settings().pbr); }
  function mat(scene, name, hex) { return usePBR() ? pbrMat(scene, name, hex) : stdMat(scene, name, hex); }
  function emat(scene, name, hex, emissive) { return usePBR() ? pbrEmat(scene, name, hex, emissive) : stdEmat(scene, name, hex, emissive); }

  // Give a material a polished finish (candy sheen, gem facets, blades). PBR:
  // tighten roughness + optional metalness; Standard: a crisp tight specular.
  function gloss(m, roughness, metallic) {
    if (!m) return m;
    if (m._ggPBR) {
      if (roughness != null) m.roughness = roughness;
      if (metallic != null) m.metallic = metallic;
    } else {
      try { m.specularColor = new BABYLON.Color3(0.42, 0.42, 0.46); m.specularPower = 96; } catch (e) {}
    }
    return m;
  }

  // ---- mesh + math helpers ----------------------------------------------
  // Segment / tessellation density scales with the quality tier — rounder, denser
  // silhouettes on desktop; lighter (≤ the original counts) on phones / headless.
  const _seg = () => Quality.settings().seg || 12;
  const _tess = () => Quality.settings().tess || 16;
  const sphere = (s, n, d, m) => { const x = BABYLON.MeshBuilder.CreateSphere(n, { diameter: d, segments: _seg() }, s); x.material = m; return x; };
  const box = (s, n, w, h, d, m) => { const x = BABYLON.MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, s); x.material = m; return x; };
  const cyl = (s, n, top, bot, h, m) => { const x = BABYLON.MeshBuilder.CreateCylinder(n, { diameterTop: top, diameterBottom: bot, height: h, tessellation: _tess() }, s); x.material = m; return x; };
  const cone = (s, n, bot, top, h, m) => cyl(s, n, top, bot, h, m);
  const capsule = (s, n, h, r, m) => { const x = BABYLON.MeshBuilder.CreateCapsule(n, { height: h, radius: r, tessellation: _tess(), subdivisions: 2 }, s); x.material = m; return x; };
  const disc = (s, n, r, m) => { const x = BABYLON.MeshBuilder.CreateDisc(n, { radius: r, tessellation: _tess() + 8 }, s); x.material = m; return x; };
  // A tiny fixed-density sphere for very-high-count decorations (flower heads,
  // salt grains) where the tier's segment count would be wasted on a 0.2 m prop.
  const tinySphere = (s, n, d, m) => { const x = BABYLON.MeshBuilder.CreateSphere(n, { diameter: d, segments: 6 }, s); x.material = m; return x; };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  dom.startBtn.disabled = true;
  boot();

  // --- Test seam: exposes internals to the headless verification harness only.
  // Inert in production — window.__GG_TEST__ is never set on the deployed site. ---
  if (typeof window !== "undefined" && window.__GG_TEST__) {
    window.__GG_TEST__ = {
      CONFIG, Projectile, Hazard, Monster, Boss, Coin, ItemDrop, Shop, Inventory, Anvil,
      ITEM_DB, RARE_DROPS, SHOP_STOCK, POTION_STOCK, FEATURED_POOL, BOSS_ARCHES,
      ENHANCE, RARITY, getDef, makeItem,
      equipItem, unequipSlot, recomputeStats, TWO_HANDED, EQUIP_SLOTS,
      potionAdd, potionUse, POTION_SLOTS, enhanceItem, enhanceCost, enhanceMult,
      effectiveStats, featuredForWave, computeWeapon, Sfx, spawnArtifact,
      // ---- Internationalization (Task 7) ----
      I18N, LOCALES, RU, t, plural, applyLocale, LOCALE_KEY, localGet,
      tItemName, tItemDesc, tZoneName, tQuestTitle, tQuestStory, tNpcName, tNpcIntro,
      tRarityLabel, tMaterialLabel, tResourceLabel, tRelicName, tCastlePartName,
      tChapterTitle, tWeatherLabel, tDragonName, bossDisplayName, tLairBossName,
      // ---- Adventure systems ----
      MATERIALS, MATERIAL_IDS, RELICS, CASTLE_PARTS, CRAFT_RECIPES, NPC_DATA, QUEST_BY_ID,
      MONSTER_ABILITIES, RESOURCE_KINDS, abilitiesForWave,
      Quests, Dialogue, Crafting, CastleUI, QuestLog, DayNight, Weather,
      ResourceNode, QuestGiver, CastleSite, Dragon, Burst,
      // ---- Main story campaign (Task 2) ----
      Story, STORY, MISSIONS, SIDE_QUESTS, MAIN_IDS, SIDE_IDS, CHAPTER_BY_ID, missionsOfChapter,
      // ---- RPG world / zones ----
      ZONES, ZONE_BY_ID, HUB_ZONE, SpawnDirector, ZoneManager, buildWorld,
      setupZoneContent, teardownZone,
      // ---- Lighting / shadows / quality tier (Task 4) ----
      Quality, makeSunShadows, setupPostFX, applyZoneMood,
      // ---- Higher-fidelity models / materials (Task 3) ----
      makeEnvironment, mat, emat, stdMat, stdEmat, pbrMat, pbrEmat, gloss, usePBR,
      get envOn() { return ENV_ON; },
      addMaterial, spendMaterials, hasMaterials, craftRecipe, addRelic, hasRelic,
      grantReward, spawnImpact, winGame,
      get interaction() { return interactionRef; },
      get zoneManager() { return zoneManager; },
      get waves() { return waveSystem; },
      get player() { return playerRef; },
      get state() { return Shop.state; },
      get world() { return worldRef; },
      startGame,
      serializeGame, applySave, validateSave, setSeed, rng, Pause, Music,
      get seed() { return worldSeed; },
      get paused() { return paused; },
      get won() { return stateRef ? stateRef.won : false; },
    };
  }

  /* ===========================================================================
   * ROADMAP SEAMS (inert, documented integration points):
   *   PuzzleSystem    - levers/plates are Interactables flipping state flags
   *                     that gate a door mesh; reuses InteractionSystem.
   *
   * SHIPPED THIS RELEASE — a STRUCTURED MAIN STORY with missions + side quests:
   *   - STORY / MISSIONS / SIDE_QUESTS: a declarative campaign — 5 ordered chapters
   *     of 16 main missions that march the player across the lands to raise the
   *     castle and slay the dragon, plus a pool of optional side quests (some
   *     repeatable bounties). All objective types (hunt/gather/reach/talk and the
   *     new defeat_boss/build/defeat_dragon) reuse the Quests engine.
   *   - Story: the campaign meta — strict main-line ordering/unlocks, the single
   *     "current step" that drives the guided HUD tracker (no guesswork), which
   *     quest each NPC may offer, and the intro / chapter / ending beats.
   *   - Dialogue lists every quest a giver is involved in (active + offerable) and
   *     doubles as the narrator (showBeat); QuestLog is chaptered (main vs side);
   *     the win screen carries the ending framing.
   *   - Save/load v6: + story flags (intro seen, chapter beats, repeatable tallies)
   *     and reach/talk objective sets; per-quest state round-trips as before.
   * Earlier releases shipped an RPG WORLD OF STREAMED ZONES (ZONES + buildWorld +
   * ZoneManager portal travel + SpawnDirector roaming/respawn + boss lairs, zone-
   * aware save/load), the STORY/ADVENTURE layer (Quests / QuestGiver /
   * Dialogue, ResourceNode + Crafting, CastleSite + Dragon, DayNight + Weather),
   * the GEAR system (ITEM_DB / Inventory / Shop / Anvil), the six BOSS archetypes,
   * gravity-bound Projectile/Hazard physics, the potion belt, impact bursts and
   * procedural Music + Sfx. See those systems above.
   * ===========================================================================
   */
})();
