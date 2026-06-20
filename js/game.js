/*
 * Good Game 3D
 * ---------------------------------------------------------------------------
 * A third-person browser action game built on Babylon.js.
 *
 * This release: run as Lily through a procedurally generated meadow, armed with
 * a glowing MAGIC WAND. Every minute a new WAVE of "living sweets" (lollipops,
 * gummy bears, cupcakes, donuts, candy canes) marches in — each wave bigger
 * than the last and dropping more ARTIFACTS. Blast the sweets with your wand
 * and grab the artifacts to rack up SCORE. The sweets hurt you on contact;
 * survive as long as you can.
 *
 * The code is split into small systems so features slot in cleanly:
 *
 *   - Interactable / InteractionSystem  reusable "walk up + press E" contract.
 *   - Input                             keyboard + on-screen stick + cast button.
 *   - Player                            movement, animation, wand + casting, health.
 *   - Projectile / projectile pool      the wand's magic bolts.
 *   - Monster                           a "living sweet" with chase AI + pop FX.
 *   - WaveSystem                        timed escalating waves of sweets + artifacts.
 *   - buildWorld                        procedural environment + lighting.
 */

(() => {
  "use strict";

  // A visible crash handler — far better than a blank canvas if anything fails.
  function showFatal(msg) {
    const hint = document.getElementById("loadHint");
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.remove("hidden");
    if (hint) { hint.style.color = "#ff8a8a"; hint.textContent = "Error: " + msg; }
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

    // Waves
    firstWaveDelay: 5,       // seconds before wave 1
    waveInterval: 60,        // max seconds to rest before the next wave auto-starts
    baseMonsters: 4,         // monsters in wave 1
    monstersPerWave: 3,      // extra monsters each subsequent wave
    maxMonstersPerWave: 60,  // cap for performance
    baseArtifacts: 3,        // artifacts dropped in wave 1
    artifactsPerWave: 1,     // extra artifacts each subsequent wave
    maxArtifactsPerWave: 14,

    // Difficulty scaling — sweets get faster and tougher each wave.
    monsterBaseSpeed: 1.6,
    monsterSpeedPerWave: 0.12,
    monsterMaxSpeed: 6.0,
    monsterHpPerWaves: 3,    // +1 HP every N waves

    // Bosses — a giant "sweet king" storms in every few waves.
    bossEveryWaves: 5,        // a boss appears on waves divisible by this
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
    name: "Fists", ranged: false, damage: 1, cooldown: 0.5, multishot: 1,
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
    if (w1 && w1.weapon) { prof = cloneWeapon(w1.weapon); prof.damage *= m1; name = enhanceName(w1.name, instLevel(i1)); }
    else if (w2 && w2.weapon) { prof = cloneWeapon(w2.weapon); prof.damage *= m2; name = enhanceName(w2.name, instLevel(i2)); }
    if (!prof) { prof = cloneWeapon(FISTS); name = "Fists"; }

    // Dual-wielding two one-handed weapons: faster, with bonus power/shots.
    const dual = w1 && w2 && w1.weapon && w2.weapon;
    if (dual) {
      prof.cooldown *= 0.8;
      prof.damage += (w2.weapon.damage || 0) * 0.5 * m2;
      if (prof.ranged && w2.weapon.ranged) prof.multishot = (prof.multishot || 1) + (w2.weapon.multishot || 1);
      name = `${enhanceName(w1.name, instLevel(i1))} + ${enhanceName(w2.name, instLevel(i2))}`;
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
      if (player.health >= player.maxHealth) { toast("Already at full health"); return false; }
      player.health = Math.min(player.maxHealth, player.health + p.heal);
      updateHealthBar(player.health);
      toast(`${def.icon} +${p.heal} health`);
    } else if (p.buff) {
      applyBuff(player, { id: s.id, label: p.label || def.name, stats: p.buff, time: p.time || 12 });
      toast(`${def.icon} ${p.label || def.name}!`);
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

  // ---- DOM ---------------------------------------------------------------
  const dom = {
    canvas: document.getElementById("renderCanvas"),
    overlay: document.getElementById("overlay"),
    startBtn: document.getElementById("startBtn"),
    loadHint: document.getElementById("loadHint"),
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    coins: document.getElementById("coins"),
    wave: document.getElementById("wave"),
    monsters: document.getElementById("monsters"),
    nextWave: document.getElementById("nextWave"),
    wavePanel: document.getElementById("wavePanel"),
    wavePanelTitle: document.getElementById("wavePanelTitle"),
    wavePanelClose: document.getElementById("wavePanelClose"),
    waveResults: document.getElementById("waveResults"),
    resKills: document.getElementById("resKills"),
    resArtifacts: document.getElementById("resArtifacts"),
    resCoins: document.getElementById("resCoins"),
    waveShopHint: document.getElementById("waveShopHint"),
    nextWaveBtn: document.getElementById("nextWaveBtn"),
    waveMini: document.getElementById("waveMini"),
    miniNextBtn: document.getElementById("miniNextBtn"),
    miniWaveNum: document.getElementById("miniWaveNum"),
    miniCountdown: document.getElementById("miniCountdown"),
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
    prompt: document.getElementById("prompt"),
    toast: document.getElementById("toast"),
    over: document.getElementById("over"),
    finalScore: document.getElementById("finalScore"),
    finalWave: document.getElementById("finalWave"),
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
    pauseWave: document.getElementById("pauseWave"),
    pauseScore: document.getElementById("pauseScore"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmText: document.getElementById("confirmText"),
    confirmYes: document.getElementById("confirmYes"),
    confirmNo: document.getElementById("confirmNo"),
  };

  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  const engine = new BABYLON.Engine(dom.canvas, true, { stencil: true, adaptToDeviceRatio: true });

  let gameStarted = false;   // gameplay (waves, monsters) waits on the start screen
  let uiPaused = false;      // true while a blocking menu (the shop) is open
  let paused = false;        // true while the in-game pause menu is open
  let waveSystem = null;     // the active WaveSystem (for the HUD buttons)
  let playerRef = null;      // the Player (so HUD helpers can read max health)
  // Live handles to the running game, captured in createScene so the save/load
  // and pause systems can read and rebuild the world.
  let sceneRef = null, worldRef = null, interactionRef = null, stateRef = null, cameraRef = null;

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
    nextWaveQueued: false,   // player asked to start the next wave early
    castHeld: false,         // fire is continuous while held (respecting cooldown)

    init() {
      window.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (e.code === "KeyE") { this.interactQueued = true; e.preventDefault(); }
        if (e.code === "Enter" || e.code === "KeyN") { this.nextWaveQueued = true; e.preventDefault(); }
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
    consumeNextWave() { const v = this.nextWaveQueued; this.nextWaveQueued = false; return v; },
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
        dom.prompt.innerHTML = isTouch ? best.label : `${best.label} · <b>E</b>`;
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

      for (const s of [-1, 1]) {
        const tail = add(sphere(scene, "tail", 0.22, hair), lean);
        tail.position.set(0.27 * s, 1.86, -0.04); tail.scaling.set(1, 1.7, 1);
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
      // Shoes
      for (const [pivot, x] of [[this.legL, -0.14], [this.legR, 0.14]]) {
        const sh = add(box(scene, "shoe", 0.22, 0.14, 0.34, shoe), lean);
        sh.position.set(x, 0.07, 0.05); this["shoe" + x] = sh;
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
      const crystalMat = emat(scene, "wandCrystal", "#9fd0ff", 1.0);
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
      const bladeMat = emat(scene, "heldBlade", "#d7dde6", 0.06);
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
        const sw = Math.sin(this.walkPhase) * 0.7 * (0.3 + speed);
        this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
        this.armL.rotation.x = -sw * 0.8; this.armR.rotation.x = sw * 0.8;
        this.lean.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06;
        this.lean.rotation.x = 0;
      } else {
        // Idle: breathing + a touch of arm sway.
        const b = Math.sin(this.walkPhase) * 0.05;
        this.legL.rotation.x = this.legR.rotation.x = 0;
        this.armL.rotation.x = lerp(this.armL.rotation.x, 0.08 + b, 0.2);
        this.armR.rotation.x = lerp(this.armR.rotation.x, 0.08 - b, 0.2);
        this.armL.rotation.z = lerp(this.armL.rotation.z || 0, 0.08, 0.2);
        this.armR.rotation.z = lerp(this.armR.rotation.z || 0, -0.08, 0.2);
        this.lean.position.y = lerp(this.lean.position.y, b * 0.4, 0.2);
        this.lean.rotation.x = lerp(this.lean.rotation.x, 0, 0.2);
      }
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
    // `restore` (optional) rebuilds a saved sweet exactly: { kind, hp, speed }.
    constructor(scene, shadow, pos, wave, restore) {
      this.scene = scene;
      if (restore) {
        this.hp = restore.hp;
        this.speed = restore.speed;
        this.kind = restore.kind;
      } else {
        this.hp = 1 + Math.floor((wave - 1) / CONFIG.monsterHpPerWaves); // sturdier in later waves
        this.speed = Math.min(
          CONFIG.monsterMaxSpeed,
          CONFIG.monsterBaseSpeed + rng() * 0.7 + (wave - 1) * CONFIG.monsterSpeedPerWave
        );
        this.kind = SWEETS[(rng() * SWEETS.length) | 0];
      }
      this.alive = true;
      this.dying = 0;                               // >0 while playing the pop animation
      this.radius = 0.85;
      this.isBoss = false;
      this.contactDamage = CONFIG.contactDamage;    // damage dealt to the player on contact
      this.bob = rng() * Math.PI * 2;
      this.biteTimer = 0;                           // cooldown before this sweet bites again
      this._build(scene, shadow, pos);
    }

    _build(scene, shadow, pos) {
      const root = new BABYLON.TransformNode("monster", scene);
      root.position.copyFrom(pos);
      this.root = root;
      const body = new BABYLON.TransformNode("monsterBody", scene);
      body.parent = root; this.body = body;

      const candy = PALETTE[(rng() * PALETTE.length) | 0];
      const main = emat(scene, "swt" + root.uniqueId, candy, 0.18);
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
    }

    // Move toward the player; return true if currently touching them.
    update(dt, playerPos) {
      if (this.biteTimer > 0) this.biteTimer -= dt;
      if (this.dying > 0) {
        this.dying -= dt;
        const k = Math.max(0, this.dying / 0.35);
        this.body.scaling.setAll(k);
        this.body.rotation.y += dt * 12;
        if (this.dying <= 0) { this.alive = false; this.root.dispose(); }
        return false;
      }
      this.bob += dt * 6;
      // Ease back to normal scale after a non-fatal hit squashed us bigger.
      if (this.body.scaling.x !== 1) this.body.scaling.setAll(lerp(this.body.scaling.x, 1, 0.25));
      const to = playerPos.subtract(this.root.position); to.y = 0;
      const dist = to.length();
      if (dist > 0.001) {
        to.normalize();
        const step = Math.min(this.speed * dt, Math.max(0, dist - 1.0));
        this.root.position.addInPlace(to.scale(step));
        this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(to.x, to.z), 0.2);
      }
      // Hoppy bob.
      this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.18;
      return dist <= this.radius + 1.0;
    }

    hit(dmg) {
      this.hp -= dmg;
      if (this.hp <= 0 && this.dying <= 0) { this.dying = 0.35; return true; } // killed
      // flash / squash on a non-fatal hit
      this.body.scaling.setAll(1.25);
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
        toast("👹 The Tyrant summons minions!");
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
        toast("💣 Incoming bombs!");
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
        toast("🦠 The Hydra splits!");
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
        label: "Shop",
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

      this.it = new Interactable(root, { label: "Blacksmith", range: 3.4, onInteract: () => onOpen() });
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
  // World — procedural environment.
  // =========================================================================
  function buildWorld(scene) {
    scene.clearColor = BABYLON.Color3.FromHexString("#86c5ff").toColor4(1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogColor = BABYLON.Color3.FromHexString("#a9d4ff");
    scene.fogDensity = 0.006;

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 1.0; hemi.groundColor = BABYLON.Color3.FromHexString("#4a6a3a");
    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.4), scene);
    sun.position = new BABYLON.Vector3(60, 90, 60); sun.intensity = 1.0;

    const shadow = new BABYLON.ShadowGenerator(2048, sun);
    shadow.useBlurExponentialShadowMap = true; shadow.blurScale = 2;

    // The world grew a lot — size the ground/roads to the new playable radius.
    const GROUND = CONFIG.worldRadius * 2 + 60; // a generous skirt beyond the fence

    // Grass ground.
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: GROUND, height: GROUND }, scene);
    ground.material = mat(scene, "grass", "#5fae4f"); ground.receiveShadows = true;

    // ---- Solid scenery is tracked here as {x,z,r} circles for collision. ----
    const obstacles = [];
    const addObstacle = (x, z, r) => obstacles.push({ x, z, r });

    // ---- A winding RIVER with wooden bridges. -------------------------------
    // The river is a straight band at a fixed orientation. Crossing it is the
    // local +X of the deck (crossN); flowing along it is local +Z (alongT).
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
    const inRiver = (x, z) => Math.abs(signedPerp(x, z) - riverPerp) < riverHalf && !onBridge(x, z);

    // Water surface (a long translucent blue band) + darker muddy banks.
    const riverCenter = { x: riverPerp * crossN.x, z: riverPerp * crossN.z };
    const riverLen = GROUND;
    const bank = BABYLON.MeshBuilder.CreateGround("bank", { width: riverHalf * 2 + 4, height: riverLen }, scene);
    bank.rotation.y = riverAngle; bank.position.set(riverCenter.x, 0.015, riverCenter.z);
    bank.material = mat(scene, "bank", "#5c4a32"); bank.receiveShadows = true;
    const waterMat = emat(scene, "water", "#3aa0e0", 0.18);
    waterMat.alpha = 0.82; waterMat.specularColor = new BABYLON.Color3(0.5, 0.6, 0.7);
    const water = BABYLON.MeshBuilder.CreateGround("water", { width: riverHalf * 2, height: riverLen }, scene);
    water.rotation.y = riverAngle; water.position.set(riverCenter.x, 0.05, riverCenter.z);
    water.material = waterMat; water.isPickable = false;

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
    const onRoad = (x, z) => {
      for (const ang of roadAngles) {
        const perp = Math.abs(x * Math.sin(ang) - z * Math.cos(ang));
        if (perp < 5) return true;
      }
      return false;
    };

    // Find a valid scatter spot: away from spawn/roads/water, inside the fence.
    const place = (minR, maxR) => {
      for (let tries = 0; tries < 16; tries++) {
        const ang = rng() * Math.PI * 2;
        const r = minR + rng() * (maxR - minR);
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        if (r > 6 && !onRoad(x, z) &&
            Math.abs(signedPerp(x, z) - riverPerp) > riverHalf + 1.5) return { x, z };
      }
      return null;
    };

    const FAR = CONFIG.worldRadius - 6;

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

    // ---- Trees. ----
    const trunkMat = mat(scene, "trunk", "#7a5230");
    const leafMats = ["#3f9d4a", "#46ad53", "#379142"].map((c, i) => mat(scene, "leaf" + i, c));
    const trees = 60 + ((rng() * 18) | 0);
    for (let i = 0; i < trees; i++) {
      const p = place(8, FAR); if (!p) continue;
      const h = 1.3 + rng() * 1.0;
      const trunk = cyl(scene, "trunk", 0.5, 0.6, h * 1.5, trunkMat);
      trunk.position.set(p.x, h * 0.75, p.z); shadow.addShadowCaster(trunk);
      const lm = leafMats[(rng() * leafMats.length) | 0];
      const n = 2 + ((rng() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const leaf = sphere(scene, "leaf", 1.9 + rng(), lm);
        leaf.position.set(p.x + (rng() - 0.5), h * 1.5 + 0.6 + k * 0.6, p.z + (rng() - 0.5));
        leaf.scaling.y = 1.1; shadow.addShadowCaster(leaf);
      }
      addObstacle(p.x, p.z, 0.9);
    }

    // ---- Rocks. ----
    const rockMat = mat(scene, "rock", "#9aa0a6");
    for (let i = 0; i < 40; i++) {
      const p = place(7, FAR); if (!p) continue;
      const rad = 0.5 + rng() * 0.9;
      const rock = BABYLON.MeshBuilder.CreateIcoSphere("rock", { radius: rad, subdivisions: 1 }, scene);
      rock.material = rockMat; rock.position.set(p.x, rad * 0.6, p.z);
      rock.rotation.set(rng(), rng(), rng()); shadow.addShadowCaster(rock);
      addObstacle(p.x, p.z, rad * 0.85);
    }

    // ---- Bushes (clusters of leafy spheres). ----
    for (let i = 0; i < 34; i++) {
      const p = place(7, FAR); if (!p) continue;
      const lm = leafMats[(rng() * leafMats.length) | 0];
      const lobes = 3 + ((rng() * 2) | 0);
      for (let k = 0; k < lobes; k++) {
        const b = sphere(scene, "bush", 0.7 + rng() * 0.5, lm);
        b.position.set(p.x + (rng() - 0.5) * 1.1, 0.45, p.z + (rng() - 0.5) * 1.1);
        b.scaling.y = 0.85; shadow.addShadowCaster(b);
      }
      addObstacle(p.x, p.z, 0.85);
    }

    // ---- Giant toadstools (red cap + cream stalk). ----
    const stalkMat = mat(scene, "stalk", "#f3e6c8");
    const capMat = mat(scene, "cap", "#d83a3a");
    const spotMat = mat(scene, "spot", "#fff2e0");
    for (let i = 0; i < 22; i++) {
      const p = place(7, FAR); if (!p) continue;
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

    // ---- Flowers + grass tufts (decorative ground cover). ----
    const tuftMat = mat(scene, "tuft", "#69bd55");
    for (let i = 0; i < 140; i++) {
      const p = place(6, FAR); if (!p) continue;
      if (rng() < 0.5) {
        const stem = cyl(scene, "stem", 0.04, 0.04, 0.4, mat(scene, "stem", "#3c8a3c"));
        stem.position.set(p.x, 0.2, p.z);
        const head = sphere(scene, "fhead", 0.18, mat(scene, "fhead", PALETTE[(rng() * PALETTE.length) | 0]));
        head.position.set(p.x, 0.42, p.z);
      } else {
        const tuft = cone(scene, "tuft", 0.35, 0, 0.5, tuftMat);
        tuft.position.set(p.x, 0.25, p.z);
      }
    }

    // Resolve a desired move against the fence, solid scenery, and the river.
    // Slides along obstacles/banks instead of stopping the player dead.
    function moveActor(cur, desired, r) {
      let tx = desired.x, tz = desired.z;

      // River barrier: if the straight move would enter the water, slide along
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

      // Keep inside the circular fence.
      const fr = CONFIG.worldRadius - r;
      const hyp = Math.hypot(tx, tz);
      if (hyp > fr) { tx = (tx / hyp) * fr; tz = (tz / hyp) * fr; }

      // If push-out shoved us into the river, refuse the move.
      if (inRiver(tx, tz) && !inRiver(cur.x, cur.z)) return cur.clone();
      return new BABYLON.Vector3(tx, cur.y, tz);
    }

    // A gentle shimmer + bob so the river reads as flowing water.
    const baseWaterY = water.position.y;
    scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000;
      water.position.y = baseWaterY + Math.sin(t * 1.5) * 0.015;
      waterMat.emissiveColor = BABYLON.Color3.FromHexString("#3aa0e0").scale(0.14 + Math.sin(t * 2) * 0.05);
    });

    return { shadow, onRoad, obstacles, inRiver, moveActor, water, waterMat };
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
      label: "Collect artifact",
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
          const extra = (healed > 0 ? ` · +${Math.round(healed)} ❤` : "") + ` · 🪙 +${bonus}`;
          toast(`Artifact! +${CONFIG.scorePerArtifact}${extra}`);
        });
      },
    });
    artifact._it = it; interaction.register(it); state.artifacts.push(artifact);
    return artifact;
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
      if (p.heal) parts.push(`❤️ +${p.heal} health`);
      if (p.buff) parts.push(`✨ ${statSummary({ stats: p.buff })} (${p.time}s)`);
      return parts.join(" · ") || def.desc || "";
    }
    if (def.weapon) {
      const w = def.weapon;
      parts.push(w.ranged ? (w.shape === "arrow" ? "🏹 ranged" : "🔮 ranged") : "⚔️ melee");
      parts.push(`${w.damage} dmg`);
      if (w.multishot > 1) parts.push(`×${w.multishot}`);
      if (w.pierce) parts.push(`pierce ${w.pierce}`);
      parts.push(def.hands === 2 ? "2-handed" : "1-handed");
    }
    if (s.maxHealth) parts.push(`+${s.maxHealth} HP`);
    if (s.damageReduction) parts.push(`+${Math.round(s.damageReduction * 100)}% resist`);
    if (s.moveSpeed) parts.push(`+${s.moveSpeed} speed`);
    if (s.damage) parts.push(`+${s.damage} dmg`);
    if (s.haste) parts.push(`+${Math.round((1 - s.haste) * 100)}% haste`);
    if (s.lifesteal) parts.push(`+${s.lifesteal} lifesteal`);
    if (s.coinRange) parts.push("coin magnet");
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
      `<div class="info"><div class="name" style="color:${rar.color}">${def.name}${lvl}${tag}</div>` +
      `<div class="desc">${statSummary(def) || def.desc || ""}</div></div>`;
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
      if (this.state.coins < cost) { toast("Not enough coins"); Sfx.play("error"); return; }
      if (this.player.inventory.length >= this.player.invCap) { toast("Bag full"); Sfx.play("error"); return; }
      this.state.coins -= cost;
      invAdd(this.player, makeItem(def.id));
      updateCoins(this.state);
      Sfx.play("buy");
      toast(`${def.icon} Bought ${def.name}`);
      this.render();
    },
    // Potions go onto the 3-slot belt, not the bag.
    buyPotion(def) {
      if (this.state.coins < def.cost) { toast("Not enough coins"); Sfx.play("error"); return; }
      if (!potionAdd(this.player, def.id)) { toast("Potion belt full (3 kinds)"); Sfx.play("error"); return; }
      this.state.coins -= def.cost;
      updateCoins(this.state);
      updatePotionBar(this.player);
      Sfx.play("buy");
      toast(`${def.icon} Bought ${def.name}`);
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
      toast(`Sold ${enhanceName(def.name, instLevel(inst))} for 🪙 ${worth}`);
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
        this._heading("⚔️ Gear");
        for (const id of SHOP_STOCK) {
          const def = getDef(id);
          const card = itemCard(def, `🪙 ${def.cost}`, "buy-btn", this.state.coins < def.cost || full(),
            () => this.buy(def));
          dom.shopItems.appendChild(card);
        }
        this._heading("🧪 Potions");
        for (const id of POTION_STOCK) {
          const def = getDef(id);
          const card = itemCard(def, `🪙 ${def.cost}`, "buy-btn potion-buy-btn", this.state.coins < def.cost,
            () => this.buyPotion(def));
          dom.shopItems.appendChild(card);
        }
      } else if (this.tab === "rare") {
        const note = document.createElement("div");
        note.className = "shop-note";
        note.textContent = "✨ Rare wares — a fresh rotation every wave.";
        dom.shopItems.appendChild(note);
        for (const id of featuredForWave(this.state.wave)) {
          const def = getDef(id);
          const cost = featuredCost(def);
          const card = itemCard(def, `🪙 ${cost}`, "buy-btn featured-btn", this.state.coins < cost || full(),
            () => this.buy(def, cost), (RARITY[def.rarity] || RARITY.normal).label.toUpperCase());
          dom.shopItems.appendChild(card);
        }
      } else {
        if (this.player.inventory.length === 0) {
          const empty = document.createElement("div");
          empty.className = "shop-empty";
          empty.textContent = "Your bag is empty. Unequip gear in your inventory (🎒) to sell it.";
          dom.shopItems.appendChild(empty);
        }
        for (const inst of this.player.inventory.slice()) {
          const def = getDef(inst.id);
          const worth = def.value + Math.round(def.value * 0.5 * instLevel(inst));
          const card = itemCard(def, `Sell 🪙 ${worth}`, "buy-btn sell-btn", false,
            () => this.sell(inst), def.rarity !== "normal" ? (RARITY[def.rarity] || RARITY.normal).label.toUpperCase() : "", instLevel(inst));
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
        if (occ === TWO_HANDED) {
          cell.classList.add("filled", "two-handed");
          cell.innerHTML = `<div class="slot-label">${meta.label}</div><div class="slot-item">⟵ two-handed</div>`;
        } else if (occ) {
          const def = getDef(occ.id);
          const rar = RARITY[def.rarity] || RARITY.normal;
          cell.classList.add("filled");
          cell.innerHTML = `<div class="slot-label">${meta.label}</div>` +
            `<div class="slot-item" style="color:${rar.color}">${def.icon} ${enhanceName(def.name, instLevel(occ))}</div>`;
          cell.title = "Unequip " + def.name;
          cell.addEventListener("click", () => this.unequip(slot));
        } else {
          cell.innerHTML = `<div class="slot-label">${meta.label}</div><div class="slot-empty">${meta.icon} empty</div>`;
        }
        dom.invEquip.appendChild(cell);
      }

      // ---- Live stat block ----
      const w = p.weapon;
      dom.invStats.innerHTML =
        `<div class="stat-row"><span>❤ Max health</span><b>${Math.round(p.maxHealth)}</b></div>` +
        `<div class="stat-row"><span>🛡️ Resist</span><b>${Math.round(p.damageReduction * 100)}%</b></div>` +
        `<div class="stat-row"><span>👟 Speed</span><b>${p.speed.toFixed(1)}</b></div>` +
        `<div class="stat-row"><span>🩸 Lifesteal</span><b>${p.lifesteal}</b></div>` +
        `<div class="stat-row"><span>⚔️ Weapon</span><b>${w.name}</b></div>` +
        `<div class="stat-row"><span>💥 Damage</span><b>${(+w.damage.toFixed(1))}${w.multishot > 1 ? " ×" + w.multishot : ""}</b></div>`;

      // ---- Bag ----
      dom.invBag.innerHTML = "";
      const bagTitle = document.createElement("div");
      bagTitle.className = "bag-title";
      bagTitle.textContent = `🎒 Bag (${p.inventory.length}/${p.invCap})`;
      dom.invBag.appendChild(bagTitle);
      if (p.inventory.length === 0) {
        const empty = document.createElement("div");
        empty.className = "shop-empty"; empty.textContent = "Empty — buy gear from the merchant or beat a boss for rare loot.";
        dom.invBag.appendChild(empty);
      }
      for (const inst of p.inventory.slice()) {
        const def = getDef(inst.id);
        const card = itemCard(def, "Equip", "buy-btn equip-btn", false,
          () => this.equip(inst),
          def.rarity !== "normal" ? (RARITY[def.rarity] || RARITY.normal).label.toUpperCase() : "",
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
    if (level >= max) { toast("Already at max enhancement"); Sfx.play("error"); return false; }
    const cost = enhanceCost(def, level);
    if (state.coins < cost) { toast("Not enough coins"); Sfx.play("error"); return false; }
    state.coins -= cost;
    inst.level = level + 1;
    updateCoins(state);
    recomputeStats(player);          // a held/worn item's boost takes effect now
    Sfx.play("enhance");
    toast(`🔨 ${enhanceName(def.name, inst.level)} forged!`);
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
        if (occ && occ !== TWO_HANDED && isGear(occ.id)) out.push({ inst: occ, where: SLOT_META[slot].label });
      }
      for (const inst of p.inventory) if (isGear(inst.id)) out.push({ inst, where: "Bag" });
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
        empty.className = "shop-empty"; empty.textContent = "No gear to enhance. Buy or loot some weapons and armour first.";
        dom.anvilItems.appendChild(empty);
        return;
      }
      for (const { inst, where } of items) {
        const def = getDef(inst.id);
        const level = instLevel(inst);
        const max = enhanceRule(def).max;
        const atMax = level >= max;
        const cost = atMax ? 0 : enhanceCost(def, level);
        const label = atMax ? "MAX" : `🪙 ${cost}`;
        const card = itemCard(def, label, "buy-btn enhance-anvil-btn", atMax || this.state.coins < cost,
          () => this.enhance(inst), `${where} · ${level}/${max}`, level);
        dom.anvilItems.appendChild(card);
      }
    },
  };

  // =========================================================================
  // Wave system — escalating waves of living sweets + artifacts.
  //
  // Flow: a wave spawns -> fight until every sweet is cleared -> a rest period
  // begins where a "Next Wave" button (or Enter/N, or the touch button) starts
  // the next wave early; otherwise it auto-starts after `waveInterval` seconds.
  // Each wave brings more, faster, tougher sweets and more artifacts.
  // =========================================================================
  class WaveSystem {
    constructor(scene, world, interaction, player, state) {
      this.scene = scene; this.world = world; this.interaction = interaction;
      this.player = player; this.state = state;
      this.wave = 0;
      this.betweenWaves = true;            // resting before the next wave
      this.minimized = false;              // results window collapsed to corner?
      this.timer = CONFIG.firstWaveDelay;  // seconds until the next wave auto-starts
      this._enterRest("Get ready!", false);
    }

    monstersForWave(w) {
      return Math.min(CONFIG.maxMonstersPerWave, CONFIG.baseMonsters + (w - 1) * CONFIG.monstersPerWave);
    }
    artifactsForWave(w) {
      return Math.min(CONFIG.maxArtifactsPerWave, CONFIG.baseArtifacts + (w - 1) * CONFIG.artifactsPerWave);
    }

    update(dt) {
      const wantNext = Input.consumeNextWave();
      if (this.betweenWaves) {
        this.timer = Math.max(0, this.timer - dt);
        const label = Math.ceil(this.timer) + "s";
        dom.nextWave.textContent = label;
        dom.miniCountdown.textContent = label;
        if (wantNext || this.timer <= 0) this.spawnWave();
      } else if (this.state.monsters.length === 0) {
        // Wave cleared — start the rest period, show the results window and the
        // merchant, and offer the Next Wave button (also collapsible to a widget).
        this.timer = CONFIG.waveInterval;
        this.betweenWaves = true;
        if (this.state.merchant) this.state.merchant.show();
        if (this.state.blacksmith) this.state.blacksmith.show();
        this._enterRest(`Wave ${this.wave} cleared!`, true);
        toast("Wave cleared! 🍬");
      }
    }

    // Show the between-waves window. `showResults` adds the per-wave stat
    // breakdown + merchant hint (skipped for the initial "Get ready" screen).
    _enterRest(title, showResults) {
      this.minimized = false;
      dom.wavePanelTitle.textContent = title;
      // The results-window button is now just "OK" — it closes the window so you
      // can roam (shop, enhance gear) freely. Starting the next wave early is
      // done only from the small corner widget (top-right) or Enter/N.
      dom.nextWaveBtn.textContent = "OK";
      dom.miniWaveNum.textContent = this.wave + 1;

      if (showResults) {
        const s = this.state.waveStats;
        dom.resKills.textContent = s.kills;
        dom.resArtifacts.textContent = s.artifacts;
        dom.resCoins.textContent = s.coins;
        dom.waveResults.classList.remove("hidden");
        dom.waveShopHint.classList.remove("hidden");
      } else {
        dom.waveResults.classList.add("hidden");
        dom.waveShopHint.classList.add("hidden");
      }

      dom.wavePanel.classList.remove("hidden");
      dom.waveMini.classList.add("hidden");
    }

    // Collapse the results window into the small, non-blocking corner widget.
    minimize() {
      if (!this.betweenWaves || this.minimized) return;
      this.minimized = true;
      dom.wavePanel.classList.add("hidden");
      dom.waveMini.classList.remove("hidden");
    }

    spawnWave() {
      this.wave++;
      this.betweenWaves = false;
      this.minimized = false;
      this.state.wave = this.wave;
      dom.wave.textContent = this.wave;
      dom.wavePanel.classList.add("hidden");
      dom.waveMini.classList.add("hidden");
      if (this.state.merchant) this.state.merchant.hide();
      if (this.state.blacksmith) this.state.blacksmith.hide();
      Shop.closeShop();
      Anvil.close();

      // Reset the per-wave stat counters for the wave about to begin.
      this.state.waveStats = { kills: 0, artifacts: 0, coins: 0 };

      const isBossWave = this.wave % CONFIG.bossEveryWaves === 0;
      // On boss waves the king brings a smaller honour guard.
      let monsterCount = this.monstersForWave(this.wave);
      if (isBossWave) monsterCount = Math.round(monsterCount * 0.6);
      const artifactCount = this.artifactsForWave(this.wave);
      this.state.waveTotal = monsterCount + (isBossWave ? 1 : 0);

      // Monsters spawn around the ring, away from the player so they march in.
      const ringMin = Math.min(34, CONFIG.worldRadius - 18);
      for (let i = 0; i < monsterCount; i++) {
        const ang = rng() * Math.PI * 2;
        const r = ringMin + rng() * 14;
        const pos = new BABYLON.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        this.state.monsters.push(new Monster(this.scene, this.world.shadow, pos, this.wave));
      }

      // Every few waves, a colossal Sweet King storms in with a health bar.
      if (isBossWave) {
        const ang = rng() * Math.PI * 2;
        const r = ringMin + 8;
        const pos = new BABYLON.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        const boss = new Boss(this.scene, this.world.shadow, pos, this.wave);
        this.state.boss = boss;
        this.state.monsters.push(boss);
        showBossBar(boss);
        Sfx.play("boss_spawn");
      }

      // Each wave also drops fresh artifacts to grab.
      for (let i = 0; i < artifactCount; i++) {
        spawnArtifact(this.scene, this.world, this.interaction, this.player, this.state);
      }

      updateMonsterCounter(this.state);
      bannerWave(this.wave, monsterCount, isBossWave ? this.state.boss.name : null);
    }

    // Restore the wave clock + UI from a saved game (see applySave). The live
    // monsters/artifacts themselves are recreated by applySave; here we only
    // resync the counter, timer and the between-waves panels.
    restore(data) {
      this.wave = data.number;
      this.betweenWaves = data.betweenWaves;
      this.timer = data.timer;
      this.state.wave = this.wave;
      this.state.waveTotal = data.waveTotal;
      dom.wave.textContent = this.wave;
      if (this.betweenWaves) {
        const title = this.wave > 0 ? `Wave ${this.wave} cleared!` : "Get ready!";
        this._enterRest(title, this.wave > 0);
        if (data.minimized) this.minimize();
      } else {
        dom.wavePanel.classList.add("hidden");
        dom.waveMini.classList.add("hidden");
      }
    }
  }

  // =========================================================================
  // Scene + loop
  // =========================================================================
  function createScene() {
    const scene = new BABYLON.Scene(engine);

    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, 1.05, 12, new BABYLON.Vector3(0, 1.4, 12), scene);
    camera.lowerRadiusLimit = 6; camera.upperRadiusLimit = 18;
    camera.lowerBetaLimit = 0.35; camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.01; camera.panningSensibility = 0;
    camera.attachControl(dom.canvas, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

    const world = buildWorld(scene);
    const player = new Player(scene, world.shadow);
    player.world = world;          // enable scenery/river collision
    playerRef = player;            // HUD helpers read max health from here
    const interaction = new InteractionSystem();

    const state = {
      scene, shadow: world.shadow,
      score: 0, coins: 0, wave: 0, waveTotal: 0, over: false,
      artifacts: [], monsters: [], bolts: [], coinsList: [],
      enemyBolts: [],   // hostile boss projectiles (Hazard)
      drops: [],        // rare gear dropped on the ground (ItemDrop)
      waveStats: { kills: 0, artifacts: 0, coins: 0 },
      merchant: null, blacksmith: null, boss: null,
    };

    // Hand out the starting gear and compute the initial stat block.
    player.setupStartingLoadout();

    updateHealthBar(player.health);
    updateMonsterCounter(state);
    updateCoins(state);

    // The merchant who runs the between-waves shop, waiting at the plaza.
    const merchant = new Merchant(scene, world.shadow, interaction, () => Shop.openShop());
    state.merchant = merchant;
    // The blacksmith who enhances gear, also between waves, beside the merchant.
    const blacksmith = new Blacksmith(scene, world.shadow, interaction, () => Anvil.openAnvil());
    state.blacksmith = blacksmith;
    Shop.init(state, player);
    Inventory.init(state, player);
    Anvil.init(state, player);
    updatePotionBar(player);

    // A few artifacts to find before the first wave even arrives.
    for (let i = 0; i < 3; i++) spawnArtifact(scene, world, interaction, player, state);

    const waves = new WaveSystem(scene, world, interaction, player, state);
    waveSystem = waves;

    // Publish live handles for the save/load + pause systems.
    sceneRef = scene; worldRef = world; interactionRef = interaction;
    stateRef = state; cameraRef = camera;

    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      if (!gameStarted) return;                       // hold sim until "Start"
      if (paused) return;                             // pause menu freezes the sim
      if (state.over) { cosmetics(state, dt); return; }

      // While a menu (shop / inventory / anvil) is open, freeze gameplay but
      // keep the scene + NPC idle animations live.
      if (uiPaused) { merchant.update(dt); blacksmith.update(dt); cosmetics(state, dt); return; }

      player.update(dt, camera);
      // Rigid follow: mutate the camera's pivot vector IN PLACE so the pivot
      // tracks the character exactly while alpha/beta/radius stay untouched.
      // (Assigning camera.target = ... or setTarget() would rebuild the radius
      // from the camera's lagging position, which is what made the apparent
      // distance change while moving.) Zoom is now wheel / two-finger pinch only.
      camera.target.copyFromFloats(player.position.x, player.position.y + 1.4, player.position.z);

      waves.update(dt);
      merchant.update(dt);
      blacksmith.update(dt);
      updateBuffs(player, dt);

      // Attacking — ranged weapons fire ballistic bolts/arrows (possibly a
      // multishot spread); melee weapons sweep an arc in front of the player.
      if (Input.wantsCast()) {
        const act = player.tryCast();
        if (act && act.type === "ranged") {
          const w = act.weapon;
          for (const s of act.shots) {
            state.bolts.push(new Projectile(scene, world.shadow, s.origin, s.dir, {
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

      interaction.update(player.position);
      if (Input.consumeInteract() && !player.busy) interaction.trigger();

      cosmetics(state, dt);
    });

    return scene;
  }

  function updateBolts(state, dt) {
    for (let i = state.bolts.length - 1; i >= 0; i--) {
      const b = state.bolts[i];
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
            Sfx.play(killed ? "kill" : "hit");
            if (killed) onMonsterDefeated(state, m);
            // Pierce upgrades let a bolt punch through several sweets.
            if (b.pierce > 0) b.pierce--; else b.dead = true;
            break;
          }
        }
      }
      if (b.dead) { b.dispose(); state.bolts.splice(i, 1); }
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
    if (m.isBoss) {
      addScore(state, CONFIG.bossScore);
      state.waveStats.kills++;
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
      toast(`👑 ${m.name} defeated! Dropped ${getDef(rareId).name}!`);
      return;
    }
    addScore(state, CONFIG.scorePerMonster);
    state.waveStats.kills++;
    maybeDropCoin(state, m.position);
    toast(`Splat! +${CONFIG.scorePerMonster}`);
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
          toast(`✨ Picked up ${def.name}!`);
          if (Inventory.open) Inventory.render();
        } else {
          toast("Bag full — drop something!");
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
        toast(`🪙 +${c.value}`);
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

  // Show how many sweets are still alive in the current wave (X left / total).
  function updateMonsterCounter(state) {
    if (!dom.monsters) return;
    const left = state.monsters.length;
    dom.monsters.textContent = `${left} / ${state.waveTotal}`;
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
        cell.title = `${def.name} — ${def.desc} (press ${key})`;
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
      pill.innerHTML = `${def ? def.icon : "✨"} ${b.label} <b>${Math.ceil(b.time)}s</b>`;
      dom.buffBar.appendChild(pill);
    }
  }

  // ---- Boss health bar (shown only while a boss is alive) ----
  function showBossBar(boss) {
    if (!dom.bossBar) return;
    dom.bossName.textContent = "👑 " + boss.name;
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
      ? `Wave ${n} — 👑 ${bossName}!`
      : `Wave ${n} — ${monsterCount} sweets!`;
    dom.waveBanner.classList.remove("show");
    void dom.waveBanner.offsetWidth; // restart the CSS animation
    dom.waveBanner.classList.add("show");
  }

  function gameOver(state) {
    state.over = true;
    dom.prompt.classList.add("hidden");
    dom.wavePanel.classList.add("hidden");
    hideBossBar();
    dom.finalScore.textContent = state.score;
    dom.finalWave.textContent = state.wave;
    setTimeout(() => dom.over.classList.remove("hidden"), 600);
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
  const SAVE_VERSION = 3;
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
      score: state.score,
      money: state.coins,
      waveStats: Object.assign({}, state.waveStats),
      wave: {
        number: waves.wave,
        betweenWaves: waves.betweenWaves,
        minimized: waves.minimized,
        timer: round(waves.timer),
        waveTotal: state.waveTotal,
      },
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
      },
      monsters: state.monsters
        .filter((m) => m.alive && m.dying <= 0)
        .map((m) => m.isBoss
          ? { boss: true, wave: m.wave, arch: m.archId, hp: round(m.hp), pos: xz(m.position) }
          : { kind: m.kind, hp: m.hp, speed: round(m.speed), pos: xz(m.position) }),
      artifacts: state.artifacts
        .filter((a) => a._it && a._it.enabled)
        .map((a) => ({ pos: xz(a.root.position), color: a._color })),
      coinDrops: state.coinsList
        .filter((c) => !c.collected && c.life > 0)
        .map((c) => ({ pos: xz(c.root.position), value: c.value, life: round(c.life) })),
      itemDrops: (state.drops || [])
        .filter((dr) => dr.life > 0)
        .map((dr) => ({ pos: xz(dr.root.position), id: dr.id, life: round(dr.life) })),
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
      d.player && Array.isArray(d.player.pos) && d.wave && Array.isArray(d.monsters));
  }

  // Tear down every live entity built by createScene so a save can be laid in.
  function clearWorldEntities(state, interaction) {
    for (const a of state.artifacts) { if (a._it) interaction.remove(a._it); a.root.dispose(); }
    state.artifacts.length = 0;
    for (const m of state.monsters) m.root.dispose();
    state.monsters.length = 0;
    for (const b of state.bolts) b.dispose();
    state.bolts.length = 0;
    for (const c of state.coinsList) c.dispose();
    state.coinsList.length = 0;
    if (state.enemyBolts) { for (const h of state.enemyBolts) h.dispose(); state.enemyBolts.length = 0; }
    if (state.drops) { for (const dr of state.drops) dr.dispose(); state.drops.length = 0; }
    state.boss = null;
    hideBossBar();
  }

  // Rebuild a saved run on top of the freshly created (seeded) scene.
  function applySave(d) {
    const state = stateRef, player = playerRef, world = worldRef;
    const interaction = interactionRef, waves = waveSystem;
    if (!state || !player || !waves) throw new Error("game not ready");

    clearWorldEntities(state, interaction);

    // Score / money economy.
    state.score = d.score | 0;
    state.coins = d.money | 0;
    state.waveStats = Object.assign({ kills: 0, artifacts: 0, coins: 0 }, d.waveStats || {});

    // Player pose + gear. Rebuild the bag and equipped slots from item ids, then
    // recompute the whole derived stat block (health/speed/resist/weapon).
    const ps = d.player;
    player.health = ps.health != null ? ps.health : player.maxHealth;
    player.facing = ps.facing || 0;
    player.root.position.set(ps.pos[0], 0, ps.pos[1]);
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
    player.buffs = [];
    recomputeStats(player);
    updatePotionBar(player);
    if (ps.health != null) { player.health = Math.min(player.maxHealth, ps.health); updateHealthBar(player.health); }

    // Monsters + boss (the boss restores its exact archetype).
    for (const md of d.monsters || []) {
      if (md.boss) {
        const boss = new Boss(sceneRef, world.shadow, new BABYLON.Vector3(md.pos[0], 0, md.pos[1]), md.wave, md.arch);
        boss.hp = md.hp;
        state.boss = boss;
        state.monsters.push(boss);
        showBossBar(boss);
      } else {
        const m = new Monster(sceneRef, world.shadow,
          new BABYLON.Vector3(md.pos[0], 0, md.pos[1]), 1,
          { kind: md.kind, hp: md.hp, speed: md.speed });
        state.monsters.push(m);
      }
    }

    // Artifacts + dropped coins + dropped rare loot.
    for (const ad of d.artifacts || []) {
      spawnArtifact(sceneRef, world, interaction, player, state, null, ad);
    }
    for (const cd of d.coinDrops || []) {
      const c = new Coin(sceneRef, world.shadow, new BABYLON.Vector3(cd.pos[0], 0, cd.pos[1]), cd.value);
      c.life = cd.life;
      state.coinsList.push(c);
    }
    for (const it of d.itemDrops || []) {
      if (!getDef(it.id)) continue;
      const dr = new ItemDrop(sceneRef, world.shadow, new BABYLON.Vector3(it.pos[0], 0, it.pos[1]), it.id);
      dr.life = it.life;
      state.drops.push(dr);
    }

    // Wave clock + the merchant (present during a cleared-wave rest).
    waves.restore(d.wave);
    const npcsVisible = waves.betweenWaves && waves.wave > 0;
    if (state.merchant) { if (npcsVisible) state.merchant.show(); else state.merchant.hide(); }
    if (state.blacksmith) { if (npcsVisible) state.blacksmith.show(); else state.blacksmith.hide(); }

    // Refresh every HUD readout.
    addScore(state, 0);
    updateCoins(state);
    updateHealthBar(player.health);
    updateMonsterCounter(state);
  }

  // Serialize the current run and hand the player a .json download.
  function downloadSave() {
    const data = serializeGame();
    if (!data) { toast("Nothing to save yet"); return false; }
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `good-game-3d-wave${data.wave.number}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Progress saved! 💾");
      return true;
    } catch (e) {
      console.error(e);
      toast("Save failed");
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
        if (onError) onError("That file isn't a valid Good Game 3D save.");
        return;
      }
      sessionSet(PENDING_LOAD_KEY, reader.result);
      window.location.reload();
    };
    reader.onerror = () => { if (onError) onError("Couldn't read that file."); };
    reader.readAsText(file);
  }

  // =========================================================================
  // Pause menu — opens mid-game (freezing the sim), with Resume / Save / Restart
  // / Exit. Restart and Exit ask for confirmation to guard against misclicks.
  // =========================================================================
  const Pause = {
    pendingAction: null, // "restart" | "exit" while the confirm dialog is up

    canOpen() { return gameStarted && stateRef && !stateRef.over && !paused && !Shop.open && !Inventory.open && !Anvil.open; },

    open() {
      if (!this.canOpen()) return;
      paused = true;
      this.hideConfirm();
      if (dom.pauseScore) dom.pauseScore.textContent = stateRef.score;
      if (dom.pauseWave) dom.pauseWave.textContent = waveSystem ? waveSystem.wave : 0;
      dom.pauseMenu.classList.remove("hidden");
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
          const orig = dom.saveBtn.textContent;
          dom.saveBtn.textContent = "Saved! 💾";
          setTimeout(() => { if (dom.saveBtn) dom.saveBtn.textContent = orig; }, 1600);
        }
      });
      if (dom.restartBtn) dom.restartBtn.addEventListener("click",
        () => this.askConfirm("restart", "Restart the game? Your current progress will be lost unless you've saved it."));
      if (dom.exitBtn) dom.exitBtn.addEventListener("click",
        () => this.askConfirm("exit", "Exit to the main menu? Your current progress will be lost unless you've saved it."));
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
  function startGame() {
    dom.overlay.classList.add("hidden"); dom.hud.classList.remove("hidden");
    if (isTouch) dom.touch.classList.remove("hidden");
    dom.canvas.focus();
    gameStarted = true;
    Music.start(); // browsers only allow audio after a user gesture (the click)
    Sfx.unlock();  // same gesture unlocks the sound-effect synth
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
        dom.musicBtn.title = this.on ? "Mute music" : "Play music";
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
        dom.fsBtn.title = on ? "Exit fullscreen" : "Fullscreen";
        engine.resize();
      };
      dom.fsBtn.addEventListener("click", () => this.toggle());
      document.addEventListener("fullscreenchange", sync);
      document.addEventListener("webkitfullscreenchange", sync);
      sync();
    },
  };

  function boot() {
    try {
      Input.init();

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
        dom.loadHint.textContent = "Ready!";
        dom.startBtn.disabled = false;
        if (pendingLoad) {
          try { applySave(pendingLoad); startGame(); toast("Progress loaded! 🎮"); }
          catch (e) { console.error(e); showFatal("Couldn't load save: " + e.message); }
        } else if (wantAutostart) {
          startGame();
        }
      });
      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", () => engine.resize());
      dom.startBtn.addEventListener("click", startGame);
      dom.replayBtn.addEventListener("click", () => window.location.reload());
      // The results-window button is now "OK": it just collapses the window to
      // the corner widget. Starting the next wave early is the corner widget's job.
      dom.nextWaveBtn.addEventListener("click", () => { if (waveSystem) waveSystem.minimize(); });
      dom.miniNextBtn.addEventListener("click", () => { Input.nextWaveQueued = true; });
      // The × collapses the results window into the corner widget (frees the view).
      dom.wavePanelClose.addEventListener("click", () => { if (waveSystem) waveSystem.minimize(); });
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
        if ((e.code === "KeyI" || e.code === "KeyB") && gameStarted && !paused && !Shop.open && !Anvil.open) {
          Inventory.toggle(); e.preventDefault(); return;
        }
        if (e.code === "KeyM") { Music.toggle(); return; }
        if (e.code !== "Escape") return;
        if (Shop.open) { Shop.closeShop(); return; }
        if (Anvil.open) { Anvil.close(); return; }
        if (Inventory.open) { Inventory.close(); return; }
        if (paused && Pause.pendingAction) { Pause.hideConfirm(); return; }
        Pause.toggle();
      });

      Fullscreen.init();
    } catch (e) { showFatal(e.message); throw e; }
  }

  // ---- mesh + math helpers ----------------------------------------------
  function mat(scene, name, hex) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    return m;
  }
  function emat(scene, name, hex, emissive) {
    const m = mat(scene, name, hex);
    m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(emissive);
    return m;
  }
  const sphere = (s, n, d, m) => { const x = BABYLON.MeshBuilder.CreateSphere(n, { diameter: d, segments: 12 }, s); x.material = m; return x; };
  const box = (s, n, w, h, d, m) => { const x = BABYLON.MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, s); x.material = m; return x; };
  const cyl = (s, n, top, bot, h, m) => { const x = BABYLON.MeshBuilder.CreateCylinder(n, { diameterTop: top, diameterBottom: bot, height: h, tessellation: 16 }, s); x.material = m; return x; };
  const cone = (s, n, bot, top, h, m) => cyl(s, n, top, bot, h, m);
  const capsule = (s, n, h, r, m) => { const x = BABYLON.MeshBuilder.CreateCapsule(n, { height: h, radius: r }, s); x.material = m; return x; };
  const disc = (s, n, r, m) => { const x = BABYLON.MeshBuilder.CreateDisc(n, { radius: r, tessellation: 28 }, s); x.material = m; return x; };

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
      get interaction() { return interactionRef; },
      get waves() { return waveSystem; },
      get player() { return playerRef; },
      get state() { return Shop.state; },
      startGame,
      serializeGame, applySave, validateSave, setSeed, rng, Pause, Music,
      get seed() { return worldSeed; },
      get paused() { return paused; },
    };
  }

  /* ===========================================================================
   * ROADMAP SEAMS (inert, documented integration points):
   *   PuzzleSystem    - levers/plates are Interactables flipping state flags
   *                     that gate a door mesh; reuses InteractionSystem.
   *   DialogueSystem  - the Merchant already registers as an Interactable and
   *                     opens an HTML overlay; swap/extend it for a BABYLON.GUI
   *                     dialogue panel (babylon.gui is loaded) for talking NPCs.
   *
   * SHIPPED THIS RELEASE: a full GEAR system — weapons (wand/bow/staff/sword/
   * axe/dagger, one- and two-handed), armour (helmet/breastplate/boots) and
   * accessories (two rings + a necklace), carried in an INVENTORY and slotted
   * into EQUIPMENT that recomputes the player's stats. Normal gear is bought
   * from the Merchant; RARE gear drops from bosses; anything can be sold back.
   * Four BOSS archetypes (charger/caster/summoner/stomper) with their own
   * attacks roll in randomly every 5 waves and scale each cycle. Projectiles
   * are gravity-bound + life-capped (Projectile / Hazard). Procedural Music.
   * See ITEM_DB / Inventory / Shop / Boss / Projectile / Music above.
   * ===========================================================================
   */
})();
