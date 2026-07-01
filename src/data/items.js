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

  // ---- Enchantments / affixes (Task 12) ---------------------------------
  // Found + crafted gear can carry up to a few AFFIXES — prefix/suffix modifiers
  // that add stats on top of the item's base block. An instance stores only the
  // affix *ids* (`inst.affixes = ["fierce", "of_vigor"]`); the magnitude is
  // derived from the item's rarity tier (AFFIX_TIER_MULT), so a roll is tiny to
  // save and reproduces exactly on load (no re-roll). Each affix declares which
  // item categories it can land on. `haste` affixes compound multiplicatively
  // and are NOT rarity-scaled (scaling a sub-1 multiplier toward 0 is nonsense).
  const AFFIXES = {
    // prefixes — mostly offensive / utility
    fierce:   { kind: "prefix", label: "Fierce",   on: ["weapon"],            stats: { damage: 1 } },
    keen:     { kind: "prefix", label: "Keen",     on: ["weapon"],            stats: { pierce: 1 } },
    vampiric: { kind: "prefix", label: "Vampiric", on: ["weapon"],            stats: { lifesteal: 1 } },
    swift:    { kind: "prefix", label: "Swift",    on: ["weapon", "jewelry"], stats: { haste: 0.92 } },
    sturdy:   { kind: "prefix", label: "Sturdy",   on: ["armor"],             stats: { maxHealth: 10 } },
    guarded:  { kind: "prefix", label: "Guarded",  on: ["armor", "jewelry"],  stats: { damageReduction: 0.03 } },
    fleet:    { kind: "prefix", label: "Fleet",    on: ["armor", "jewelry"],  stats: { moveSpeed: 0.4 } },
    // suffixes — "of X"
    of_vigor:     { kind: "suffix", label: "of Vigor",     on: ["weapon", "armor", "jewelry"], stats: { maxHealth: 12 } },
    of_warding:   { kind: "suffix", label: "of Warding",   on: ["armor", "jewelry"],           stats: { damageReduction: 0.03 } },
    of_power:     { kind: "suffix", label: "of Power",     on: ["weapon", "jewelry"],          stats: { damage: 1 } },
    of_haste:     { kind: "suffix", label: "of Haste",     on: ["weapon", "jewelry"],          stats: { haste: 0.93 } },
    of_swiftness: { kind: "suffix", label: "of Swiftness", on: ["armor", "jewelry"],           stats: { moveSpeed: 0.5 } },
    of_leeching:  { kind: "suffix", label: "of Leeching",  on: ["weapon", "jewelry"],          stats: { lifesteal: 1 } },
    of_fortune:   { kind: "suffix", label: "of Fortune",   on: ["armor", "jewelry"],           stats: { coinRange: 2 } },
  };
  // How many affixes a freshly-generated item of each rarity rolls, and how much
  // its rarity scales each affix's additive magnitude. Normal gear stays clean.
  const RARITY_AFFIX_COUNT = { normal: 0, rare: 1, epic: 2, legendary: 3 };
  const AFFIX_TIER_MULT = [1, 1.4, 1.9, 2.5]; // indexed by RARITY[...].tier

  // An item's affix "category" for pool filtering: weapons, jewelry (ring/necklace)
  // or armour (everything else worn).
  function itemCategory(def) {
    if (!def) return "armor";
    if (def.type === "weapon") return "weapon";
    if (def.type === "ring" || def.type === "necklace") return "jewelry";
    return "armor";
  }
  // The affix ids that may roll on a given item def (by category).
  function affixPoolFor(def) {
    const cat = itemCategory(def);
    return Object.keys(AFFIXES).filter((id) => AFFIXES[id].on.includes(cat));
  }
  // Deterministically pick this item's affixes from its pool using a 0..1 rng fn.
  // Pure: same def + same rng sequence ⇒ same affixes. Returns an array of ids.
  function rollAffixes(def, rngFn) {
    const n = RARITY_AFFIX_COUNT[def && def.rarity] || 0;
    if (!n || !isGear(def.id)) return [];
    const pool = affixPoolFor(def);
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const idx = Math.min(pool.length - 1, Math.floor((rngFn() || 0) * pool.length));
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
  const affixMagMult = (def) => AFFIX_TIER_MULT[(RARITY[def && def.rarity] || RARITY.normal).tier] || 1;
  // The stat block contributed by an instance's affixes (rarity-scaled additive
  // stats; haste compounds multiplicatively).
  function affixStats(inst) {
    const out = {};
    const def = getDef(inst && inst.id);
    const list = (inst && inst.affixes) || [];
    if (!def || !list.length) return out;
    const mag = affixMagMult(def);
    for (const id of list) {
      const a = AFFIXES[id];
      if (!a || !a.stats) continue;
      for (const k in a.stats) {
        if (k === "haste") out.haste = (out.haste == null ? 1 : out.haste) * a.stats[k];
        else out[k] = (out[k] || 0) + a.stats[k] * mag;
      }
    }
    return out;
  }

  // ---- Equipment sets (Task 12) -----------------------------------------
  // Wearing several pieces of a set grants cumulative bonuses at thresholds. A
  // gear def opts in via `set: "<id>"`. setBonusStats() is pure over an equipment
  // map so it can be previewed + unit-tested without a live player.
  const SETS = {
    ironguard: {
      name: "Ironguard",
      pieces: ["iron_helm", "iron_plate", "iron_greaves", "iron_pauldrons", "iron_gauntlets", "reinforced_belt"],
      bonuses: { 2: { damageReduction: 0.04 }, 4: { maxHealth: 40, damageReduction: 0.06 } },
    },
    dragonscale: {
      name: "Dragonscale",
      pieces: ["dragon_helm", "dragonscale_plate", "dragon_pauldrons", "dragon_gauntlets", "dragon_belt", "dragon_cloak"],
      bonuses: { 2: { maxHealth: 25 }, 4: { damage: 2, damageReduction: 0.06 }, 6: { maxHealth: 50, lifesteal: 3 } },
    },
  };
  // How many distinct equipped pieces of each set are present in an equipment map.
  function setCounts(equipment) {
    const counts = {};
    for (const slot in equipment) {
      const inst = equipment[slot];
      if (!inst || inst === TWO_HANDED) continue;
      const def = getDef(inst.id);
      if (def && def.set) counts[def.set] = (counts[def.set] || 0) + 1;
    }
    return counts;
  }
  // The merged stat bonus from every set threshold currently met.
  function setBonusStats(equipment) {
    const counts = setCounts(equipment);
    const out = {};
    for (const setId in counts) {
      const set = SETS[setId];
      if (!set) continue;
      for (const thr in set.bonuses) {
        if (counts[setId] >= +thr) {
          const s = set.bonuses[thr];
          for (const k in s) out[k] = (out[k] || 0) + s[k];
        }
      }
    }
    return out;
  }
  // A UI-friendly summary of every set with at least one piece equipped:
  // [{ id, name, count, total, next, bonuses:[{threshold, met, stats}] }].
  function activeSets(equipment) {
    const counts = setCounts(equipment);
    const out = [];
    for (const setId in counts) {
      const set = SETS[setId];
      if (!set) continue;
      const thresholds = Object.keys(set.bonuses).map(Number).sort((a, b) => a - b);
      out.push({
        id: setId, name: set.name, count: counts[setId], total: set.pieces.length,
        next: thresholds.find((thr) => counts[setId] < thr) || null,
        bonuses: thresholds.map((thr) => ({ threshold: thr, met: counts[setId] >= thr, stats: set.bonuses[thr] })),
      });
    }
    return out;
  }

  // ---- Worn-helmet archetypes (Task 25) ---------------------------------
  // Each helmet renders as a distinct, real-looking head piece instead of one
  // rarity-tinted dome. The 3D SHAPE is chosen by a pure, testable selector so the
  // worn-gear builder (src/game.js `_buildWornGear`) can pre-build every archetype
  // once and just toggle the matching one on equip. A helmet def opts in via a
  // `helm: { archetype, material }` block; without it we still resolve a sensible
  // archetype + material from the item's set / rarity so ANY helmet maps to a valid
  // pair (the selector never returns something the builder can't draw).
  //
  //   archetype: "cap"    soft brimmed cap (leather / cloth)
  //              "open"   open helm with nasal + cheek guards (iron / steel)
  //              "great"  full great-helm with a visor slit
  //              "dragon" horned/finned dragon helm
  //              "crown"  banded great-crown with points + a gem
  //   material:  "leather" | "cloth" | "iron" | "steel" | "gold" | "dragonscale"
  const HELM_ARCHETYPES = ["cap", "open", "great", "dragon", "crown"];
  const HELM_MATERIALS = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];
  // Base tints per material (rarity `paint()` then recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const HELM_MATERIAL_TINT = {
    leather: "#7a5230", cloth: "#8a7a5a", iron: "#9fb0c8",
    steel: "#c3ccd8", gold: "#e8c057", dragonscale: "#b8603a",
  };
  // Resolve a helmet item def to a { archetype, material } pair. Pure + total:
  // honours an explicit `helm` block, else infers from the item's set (Dragonscale
  // → dragon helm, Ironguard → open iron helm) and rarity (legendary → crown), and
  // finally clamps to the known archetype/material lists so the result is always
  // one the builder can draw.
  function helmetArchetype(def) {
    let archetype = "cap";
    let material = "leather";
    const h = def && def.helm;
    if (h && h.archetype) archetype = h.archetype;
    else if (def && def.set === "dragonscale") archetype = "dragon";
    else if (def && def.rarity === "legendary") archetype = "crown";
    else if (def && def.set === "ironguard") archetype = "open";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) archetype = "great";
    if (h && h.material) material = h.material;
    else if (def && def.set === "dragonscale") material = "dragonscale";
    else if (def && def.rarity === "legendary") material = "gold";
    else if (def && (def.set === "ironguard" || def.rarity === "epic")) material = "steel";
    else if (def && def.rarity === "rare") material = "iron";
    if (!HELM_ARCHETYPES.includes(archetype)) archetype = "cap";
    if (!HELM_MATERIALS.includes(material)) material = "leather";
    return { archetype, material };
  }

  // ---- Worn-chest archetypes (Task 26) ----------------------------------
  // Each breastplate renders as a distinct, layered torso piece — the visual
  // anchor of an armour set — instead of one rarity-tinted cylinder. As with the
  // helmets, the 3D SHAPE is chosen by a pure, testable selector so the worn-gear
  // builder (src/game.js `_buildWornGear`) pre-builds every archetype once and
  // just toggles the matching one on equip. A breastplate def opts in via a
  // `chest: { archetype, material }` block; without it we infer a sensible pair
  // from the item's set / rarity so ANY breastplate maps to a valid pair the
  // builder can draw.
  //
  //   archetype: "vest"        soft layered leather/cloth vest (leather / cloth)
  //              "cuirass"      segmented banded iron cuirass with lames (iron)
  //              "plate"        ornate polished aegis plate + gorget (steel / gold)
  //              "dragonscale"  overlapping scale rows + a chest gem (dragonscale)
  //              "robe"         flowing layered cloth robe (cloth)
  //   material:  "leather" | "cloth" | "iron" | "steel" | "gold" | "dragonscale"
  const CHEST_ARCHETYPES = ["vest", "cuirass", "plate", "dragonscale", "robe"];
  const CHEST_MATERIALS = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];
  // Base tints per material (rarity `paint()` then recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const CHEST_MATERIAL_TINT = {
    leather: "#6f4a2a", cloth: "#8a7a5a", iron: "#8f9fb6",
    steel: "#c3ccd8", gold: "#e8c057", dragonscale: "#b8603a",
  };
  // Resolve a breastplate item def to a { archetype, material } pair. Pure + total:
  // honours an explicit `chest` block, else infers from the item's set (Dragonscale
  // → scaled plate, Ironguard → banded cuirass) and rarity (legendary/epic/rare →
  // ornate plate), and finally clamps to the known archetype/material lists so the
  // result is always one the builder can draw. Coordinated with helmetArchetype so
  // a full set (helmet + chest) reads as one suit (shared iron/steel/dragonscale
  // materials, matching set motifs).
  function chestArchetype(def) {
    let archetype = "vest";
    let material = "leather";
    const c = def && def.chest;
    if (c && c.archetype) archetype = c.archetype;
    else if (def && def.set === "dragonscale") archetype = "dragonscale";
    else if (def && def.set === "ironguard") archetype = "cuirass";
    else if (def && (def.rarity === "legendary" || def.rarity === "epic" || def.rarity === "rare")) archetype = "plate";
    if (c && c.material) material = c.material;
    else if (def && def.set === "dragonscale") material = "dragonscale";
    else if (def && def.set === "ironguard") material = "iron";
    else if (def && def.rarity === "legendary") material = "gold";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) material = "steel";
    if (!CHEST_ARCHETYPES.includes(archetype)) archetype = "vest";
    if (!CHEST_MATERIALS.includes(material)) material = "leather";
    return { archetype, material };
  }

  // An item's effective stat block once its enhancement level + affixes are folded
  // in. `haste` (a sub-1 cooldown multiplier) improves *toward* zero, so we scale
  // its distance from 1 instead of the raw value; affix haste then compounds.
  function effectiveStats(inst) {
    const def = getDef(inst.id);
    const base = def.stats || {};
    const mult = enhanceMult(def, instLevel(inst));
    const affix = affixStats(inst);
    const hasAffix = Object.keys(affix).length > 0;
    if (mult === 1 && !hasAffix) return base;
    const out = {};
    for (const k in base) {
      out[k] = k === "haste" ? 1 - (1 - base[k]) * mult : base[k] * mult;
    }
    for (const k in affix) {
      if (k === "haste") out.haste = (out.haste == null ? 1 : out.haste) * affix.haste;
      else out[k] = (out[k] || 0) + affix[k];
    }
    return out;
  }

  // Equipment slots, head-to-toe display order. A two-handed weapon lives in hand1
  // with a TWO_HANDED sentinel parked in hand2 so the off-hand reads as occupied.
  // Task 12 widened the loadout from 8 to 12 worn slots (pauldrons/gloves/belt/cloak
  // joined helmet/breastplate/boots/necklace/rings/hands). Each armour `type` equals
  // its slot name so equipItem() routes by type with no extra mapping.
  const EQUIP_SLOTS = ["helmet", "pauldrons", "breastplate", "gloves", "belt", "boots",
                       "cloak", "necklace", "ring1", "ring2", "hand1", "hand2"];
  const TWO_HANDED = "__2H__";
  const SLOT_META = {
    helmet:      { label: "Helmet",      icon: "🪖" },
    pauldrons:   { label: "Pauldrons",   icon: "🎽" },
    breastplate: { label: "Breastplate", icon: "🦺" },
    gloves:      { label: "Gloves",      icon: "🧤" },
    belt:        { label: "Belt",        icon: "🪢" },
    boots:       { label: "Boots",       icon: "🥾" },
    cloak:       { label: "Cloak",       icon: "🧥" },
    necklace:    { label: "Necklace",    icon: "📿" },
    ring1:       { label: "Ring",        icon: "💍" },
    ring2:       { label: "Ring",        icon: "💍" },
    hand1:       { label: "Main hand",   icon: "🤚" },
    hand2:       { label: "Off hand",    icon: "✋" },
  };
  // Which equip slots a built worn-gear mesh exists for (the rest read off the body).
  const WORN_SLOTS = ["helmet", "pauldrons", "breastplate", "gloves", "belt", "boots", "cloak"];

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
    leather_cap:    { name: "Leather Cap",    icon: "🧢", type: "helmet",      rarity: "normal", cost: 14, desc: "+15 max health.", stats: { maxHealth: 15 }, helm: { archetype: "cap", material: "leather" } },
    iron_helm:      { name: "Iron Helm",      icon: "⛑️", type: "helmet",      rarity: "normal", cost: 30, desc: "+25 health, +4% resist.", stats: { maxHealth: 25, damageReduction: 0.04 }, set: "ironguard", helm: { archetype: "open", material: "iron" } },
    leather_vest:   { name: "Leather Vest",   icon: "🦺", type: "breastplate", rarity: "normal", cost: 20, desc: "+20 health, +4% resist.", stats: { maxHealth: 20, damageReduction: 0.04 }, chest: { archetype: "vest", material: "leather" } },
    iron_plate:     { name: "Iron Plate",     icon: "🛡️", type: "breastplate", rarity: "normal", cost: 40, desc: "+35 health, +10% resist.", stats: { maxHealth: 35, damageReduction: 0.1 }, set: "ironguard", chest: { archetype: "cuirass", material: "iron" } },
    leather_boots:  { name: "Leather Boots",  icon: "🥾", type: "boots",       rarity: "normal", cost: 16, desc: "+0.8 move speed.", stats: { moveSpeed: 0.8 } },
    iron_greaves:   { name: "Iron Greaves",   icon: "🦿", type: "boots",       rarity: "normal", cost: 30, desc: "+0.4 speed, +5% resist.", stats: { moveSpeed: 0.4, damageReduction: 0.05 }, set: "ironguard" },
    leather_pauldrons: { name: "Leather Spaulders", icon: "🎽", type: "pauldrons", rarity: "normal", cost: 16, desc: "+12 max health.", stats: { maxHealth: 12 } },
    iron_pauldrons: { name: "Iron Spaulders", icon: "🎽", type: "pauldrons", rarity: "normal", cost: 32, desc: "+18 health, +5% resist.", stats: { maxHealth: 18, damageReduction: 0.05 }, set: "ironguard" },
    leather_gloves: { name: "Leather Gloves", icon: "🧤", type: "gloves",     rarity: "normal", cost: 14, desc: "+1 weapon damage.", stats: { damage: 1 } },
    iron_gauntlets: { name: "Iron Gauntlets", icon: "🧤", type: "gloves",     rarity: "normal", cost: 30, desc: "+12 health, +1 damage.", stats: { maxHealth: 12, damage: 1 }, set: "ironguard" },
    leather_belt:   { name: "Leather Belt",   icon: "🪢", type: "belt",        rarity: "normal", cost: 12, desc: "+10 max health.", stats: { maxHealth: 10 } },
    reinforced_belt:{ name: "Reinforced Belt", icon: "🪢", type: "belt",       rarity: "normal", cost: 28, desc: "+14 health, +3% resist.", stats: { maxHealth: 14, damageReduction: 0.03 }, set: "ironguard" },
    travel_cloak:   { name: "Travelling Cloak", icon: "🧥", type: "cloak",     rarity: "normal", cost: 18, desc: "+0.7 move speed.", stats: { moveSpeed: 0.7 } },
    guard_cloak:    { name: "Warding Cloak",  icon: "🧥", type: "cloak",       rarity: "normal", cost: 30, desc: "+18 health, +4% resist.", stats: { maxHealth: 18, damageReduction: 0.04 } },

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
    dragon_helm:    { name: "Dragon Helm",   icon: "🐲", type: "helmet",      rarity: "rare", value: 80, desc: "+40 health, +10% resist.", stats: { maxHealth: 40, damageReduction: 0.1 }, set: "dragonscale", helm: { archetype: "dragon", material: "dragonscale" } },
    aegis_plate:    { name: "Aegis Plate",   icon: "🛡️", type: "breastplate", rarity: "rare", value: 100, desc: "+55 health, +16% resist.", stats: { maxHealth: 55, damageReduction: 0.16 }, chest: { archetype: "plate", material: "steel" } },
    winged_boots:   { name: "Winged Boots",  icon: "🪽", type: "boots",       rarity: "rare", value: 80, desc: "+1.4 speed, +5% resist.", stats: { moveSpeed: 1.4, damageReduction: 0.05 } },
    vampiric_ring:  { name: "Vampiric Ring", icon: "🩸", type: "ring",        rarity: "rare", value: 70, desc: "Heal +3 per kill.", stats: { lifesteal: 3 } },
    titan_pendant:  { name: "Titan Pendant", icon: "💠", type: "necklace",    rarity: "rare", value: 110, desc: "+45 health, +8% resist, +2 damage.", stats: { maxHealth: 45, damageReduction: 0.08, damage: 2 } },
    dragonscale_plate: { name: "Dragonscale Plate", icon: "🐲", type: "breastplate", rarity: "rare", value: 105, desc: "+50 health, +14% resist.", stats: { maxHealth: 50, damageReduction: 0.14 }, set: "dragonscale", chest: { archetype: "dragonscale", material: "dragonscale" } },
    dragon_pauldrons: { name: "Dragonscale Spaulders", icon: "🐲", type: "pauldrons", rarity: "rare", value: 80, desc: "+30 health, +8% resist.", stats: { maxHealth: 30, damageReduction: 0.08 }, set: "dragonscale" },
    dragon_gauntlets: { name: "Dragonscale Gauntlets", icon: "🐲", type: "gloves", rarity: "rare", value: 78, desc: "+18 health, +2 damage.", stats: { maxHealth: 18, damage: 2 }, set: "dragonscale" },
    dragon_belt:    { name: "Dragonscale Belt", icon: "🐲", type: "belt",      rarity: "rare", value: 76, desc: "+22 health, +5% resist.", stats: { maxHealth: 22, damageReduction: 0.05 }, set: "dragonscale" },
    dragon_cloak:   { name: "Dragonscale Cloak", icon: "🐲", type: "cloak",    rarity: "rare", value: 90, desc: "+0.8 speed, +6% resist.", stats: { moveSpeed: 0.8, damageReduction: 0.06 }, set: "dragonscale" },
    shadow_cloak:   { name: "Shadow Cloak",  icon: "🌑", type: "cloak",       rarity: "rare", value: 84, desc: "+1.1 speed, +5% resist.", stats: { moveSpeed: 1.1, damageReduction: 0.05 } },
    swift_gloves:   { name: "Quickhand Gloves", icon: "🤌", type: "gloves",   rarity: "rare", value: 72, desc: "Attack 10% faster.", stats: { haste: 0.9 } },

    // ----- EPIC gear (featured shop / blacksmith showcase) -----
    void_scythe:    { name: "Void Scythe", icon: "🌑", type: "weapon", rarity: "epic", hands: 2, value: 200, desc: "Two-handed. A reaping, life-draining arc.",
                      weapon: { ranged: false, damage: 12, cooldown: 0.55, multishot: 1, melee: { range: 4.0, arc: 2.6 }, color: "#b07aff" }, stats: { lifesteal: 2 } },
    sunfire_staff:  { name: "Sunfire Staff", icon: "☀️", type: "weapon", rarity: "epic", hands: 2, value: 190, desc: "Two-handed. A 5-bolt searing fan.",
                      weapon: { ranged: true, shape: "bolt", damage: 3, cooldown: 0.3, multishot: 5, spread: 0.14, pierce: 1, boltSpeed: 28, boltRadius: 0.95, gravity: 1.1, color: "#ffb24e", haloColor: "#ffe27a" } },
    phoenix_plate:  { name: "Phoenix Plate", icon: "🔥", type: "breastplate", rarity: "epic", value: 180, desc: "+75 health, +20% resist.", stats: { maxHealth: 75, damageReduction: 0.2 }, chest: { archetype: "plate", material: "gold" } },
    seraph_ring:    { name: "Seraph Ring", icon: "💫", type: "ring", rarity: "epic", value: 150, desc: "+3 damage, +5 lifesteal.", stats: { damage: 3, lifesteal: 5 } },
    storm_pauldrons:{ name: "Stormforged Spaulders", icon: "⚡", type: "pauldrons", rarity: "epic", value: 160, desc: "+45 health, +12% resist.", stats: { maxHealth: 45, damageReduction: 0.12 } },
    titan_gauntlets:{ name: "Titan Gauntlets", icon: "🥊", type: "gloves", rarity: "epic", value: 150, desc: "+25 health, +3 damage.", stats: { maxHealth: 25, damage: 3 } },

    // ----- LEGENDARY gear (the apex featured / blacksmith showcase) -----
    world_ender:    { name: "World-Ender", icon: "💥", type: "weapon", rarity: "legendary", hands: 2, value: 320, desc: "Two-handed. Cataclysmic, sweeping ruin.",
                      weapon: { ranged: false, damage: 18, cooldown: 0.6, multishot: 1, melee: { range: 4.4, arc: 2.9 }, color: "#ff5d5d" }, stats: { lifesteal: 4 } },
    astral_bow:     { name: "Astral Bow", icon: "🌟", type: "weapon", rarity: "legendary", hands: 2, value: 300, desc: "Two-handed. A 5-arrow piercing storm.",
                      weapon: { ranged: true, shape: "arrow", damage: 5, cooldown: 0.4, multishot: 5, spread: 0.1, pierce: 3, boltSpeed: 46, boltRadius: 0.6, gravity: 6, color: "#a8e0ff", haloColor: "#eaffff" } },
    crown_eternal:  { name: "Crown Eternal", icon: "👑", type: "helmet", rarity: "legendary", value: 280, desc: "+90 health, +18% resist, +3 damage.", stats: { maxHealth: 90, damageReduction: 0.18, damage: 3 }, helm: { archetype: "crown", material: "gold" } },
    wings_of_dawn:  { name: "Wings of Dawn", icon: "🪽", type: "cloak", rarity: "legendary", value: 300, desc: "+1.6 speed, +35 health, +8% resist.", stats: { moveSpeed: 1.6, maxHealth: 35, damageReduction: 0.08 } },

    // ----- Potions / consumables (drag-slotted from the unified bag) -----
    minor_potion:   { name: "Minor Health Potion", icon: "🧪", type: "potion", rarity: "normal", cost: 8,  desc: "Restore 30 health.", potion: { heal: 30 } },
    health_potion:  { name: "Health Potion",       icon: "❤️", type: "potion", rarity: "normal", cost: 16, desc: "Restore 65 health.", potion: { heal: 65 } },
    greater_potion: { name: "Greater Health Potion", icon: "💖", type: "potion", rarity: "rare", cost: 30, desc: "Restore 140 health.", potion: { heal: 140 } },
    elixir_might:   { name: "Elixir of Might",     icon: "⚗️", type: "potion", rarity: "rare", cost: 34, desc: "+4 damage for 18s.", potion: { buff: { damage: 4 }, time: 18, label: "Might" } },
    elixir_swift:   { name: "Elixir of Swiftness", icon: "🌀", type: "potion", rarity: "rare", cost: 30, desc: "+2.5 speed for 18s.", potion: { buff: { moveSpeed: 2.5 }, time: 18, label: "Swift" } },

    // ----- Crafting materials / reagents (Task 21) -----------------------------
    // Materials are first-class, STACKABLE bag items now (they used to live in an
    // ad-hoc `player.materials` dictionary). The alchemist sells the basic ones;
    // every material can be sold back via `value`. Icons/labels mirror the
    // MATERIALS table (resolved through i18n for display).
    wood:    { name: "Wood",    icon: "🪵", type: "material", rarity: "normal", cost: 3,  desc: "Stout timber for crafting." },
    stone:   { name: "Stone",   icon: "🪨", type: "material", rarity: "normal", cost: 3,  desc: "Solid building stone." },
    water:   { name: "Water",   icon: "💧", type: "material", rarity: "normal", cost: 3,  desc: "Clean water for brewing." },
    herb:    { name: "Herb",    icon: "🌿", type: "material", rarity: "normal", cost: 4,  desc: "A fragrant medicinal herb." },
    fiber:   { name: "Fiber",   icon: "🧵", type: "material", rarity: "normal", cost: 3,  desc: "Tough plant fiber for cloth." },
    crystal: { name: "Crystal", icon: "🔮", type: "material", rarity: "rare",   cost: 12, desc: "A humming arcane crystal." },
  };

  // Fill in derived fields (id, sell value) once.
  for (const id in ITEM_DB) {
    const d = ITEM_DB[id];
    d.id = id;
    if (d.value == null) d.value = d.cost != null ? Math.max(1, Math.round(d.cost * 0.5)) : 40;
  }
  const getDef = (id) => ITEM_DB[id];
  // "Gear" = wearable/wieldable equipment (everything that ISN'T a stackable
  // consumable or reagent). Materials + potions are stackable bag items, never
  // gear, so they stay out of the gear tab / anvil / affix rolls / gear shop.
  const isGear = (id) => { const ty = ITEM_DB[id].type; return ty !== "potion" && ty !== "material"; };
  // Stackable items (potions + materials) share one bag code path; they stack and
  // never carry enhancement levels or affixes.
  const isMaterial = (id) => ITEM_DB[id] && ITEM_DB[id].type === "material";
  const isStackable = (id) => { const d = ITEM_DB[id]; return !!d && (d.type === "potion" || d.type === "material"); };
  // The merchant's normal gear stock (potions + materials are stocked separately
  // by the dedicated alchemist now — see ALCHEMIST_STOCK).
  const SHOP_STOCK = Object.keys(ITEM_DB).filter((id) => ITEM_DB[id].rarity === "normal" && ITEM_DB[id].cost != null && isGear(id));
  // Potions the alchemist sells (any consumable with a price).
  const POTION_STOCK = Object.keys(ITEM_DB).filter((id) => ITEM_DB[id].type === "potion" && ITEM_DB[id].cost != null);
  // Basic reagents the alchemist sells (the cheap, common gathered materials —
  // not the rarer crystal, which the player must gather/quest for).
  const INGREDIENT_STOCK = Object.keys(ITEM_DB).filter((id) => ITEM_DB[id].type === "material" && ITEM_DB[id].rarity === "normal" && ITEM_DB[id].cost != null);
  // The alchemist's full stock: potions first, then basic ingredients.
  const ALCHEMIST_STOCK = POTION_STOCK.concat(INGREDIENT_STOCK);
  // Rare gear bosses can drop (rare-rarity gear only — never potions/epic/legend).
  const RARE_DROPS = Object.keys(ITEM_DB).filter((id) => ITEM_DB[id].rarity === "rare" && isGear(id));
  // The pool the rotating "Featured" shop tab draws its wares from: every piece
  // of rare/epic/legendary gear. A wave-seeded subset is offered each wave.
  const FEATURED_POOL = Object.keys(ITEM_DB).filter((id) =>
    isGear(id) && ["rare", "epic", "legendary"].includes(ITEM_DB[id].rarity));

export {
  RARITY, ENHANCE, enhanceRule, instLevel, enhanceMult, enhanceCost, enhanceName,
  effectiveStats, EQUIP_SLOTS, WORN_SLOTS, TWO_HANDED, SLOT_META, FISTS, ITEM_DB, getDef, isGear,
  isMaterial, isStackable, SHOP_STOCK, POTION_STOCK, INGREDIENT_STOCK, ALCHEMIST_STOCK, RARE_DROPS, FEATURED_POOL,
  AFFIXES, RARITY_AFFIX_COUNT, AFFIX_TIER_MULT, itemCategory, affixPoolFor, rollAffixes,
  affixStats, affixMagMult, SETS, setCounts, setBonusStats, activeSets,
  HELM_ARCHETYPES, HELM_MATERIALS, HELM_MATERIAL_TINT, helmetArchetype,
  CHEST_ARCHETYPES, CHEST_MATERIALS, CHEST_MATERIAL_TINT, chestArchetype,
};
