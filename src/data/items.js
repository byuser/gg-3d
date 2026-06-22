// Data: items, equipment, rarity/enhancement tables + pure stat helpers.

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

export {
  RARITY, ENHANCE, enhanceRule, instLevel, enhanceMult, enhanceCost, enhanceName,
  effectiveStats, EQUIP_SLOTS, TWO_HANDED, SLOT_META, FISTS, ITEM_DB, getDef, isGear,
  SHOP_STOCK, POTION_STOCK, RARE_DROPS, FEATURED_POOL,
};
