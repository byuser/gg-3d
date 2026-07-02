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

  // ---- Worn-pauldron archetypes (Task 27) -------------------------------
  // Each pauldron (shoulder) renders as a distinct, real shoulder piece that sits
  // ON the shoulder joint — instead of one plain sphere that dives into the chest.
  // As with the helmets/chests, the 3D SHAPE is chosen by a pure, testable selector
  // so the worn-gear builder (src/game.js `_buildPauldrons`) pre-builds every
  // archetype once (per shoulder) and just toggles the matching one on equip. A
  // pauldron def opts in via a `paul: { archetype, material }` block; without it we
  // infer a sensible pair from the item's set / rarity so ANY pauldron maps to a
  // valid pair the builder can draw.
  //
  //   archetype: "cap"      soft rounded leather shoulder cap (leather / cloth)
  //              "plated"   segmented banded iron cap with lames (iron) — Ironguard
  //              "spiked"   overlapping scale cap + swept spines (dragonscale)
  //              "ornate"   polished trimmed plate cap + a stud (steel / gold)
  //              "winged"   flared great-pauldron with an upswept fin (epic/legend.)
  //   material:  "leather" | "cloth" | "iron" | "steel" | "gold" | "dragonscale"
  const PAULDRON_ARCHETYPES = ["cap", "plated", "spiked", "ornate", "winged"];
  const PAULDRON_MATERIALS = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];
  // Base tints per material (rarity `paint()` then recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const PAULDRON_MATERIAL_TINT = {
    leather: "#6f4a2a", cloth: "#8a7a5a", iron: "#8f9fb6",
    steel: "#c3ccd8", gold: "#e8c057", dragonscale: "#b8603a",
  };
  // Resolve a pauldron item def to a { archetype, material } pair. Pure + total:
  // honours an explicit `paul` block, else infers from the item's set (Dragonscale
  // → spiked scale, Ironguard → banded plated) and rarity (legendary/epic → winged,
  // rare → ornate), and finally clamps to the known archetype/material lists so the
  // result is always one the builder can draw. Coordinated with chestArchetype /
  // helmetArchetype so a full set reads as one suit (shared iron/steel/dragonscale
  // materials, matching set motifs — an Ironguard cuirass + Ironguard shoulders).
  function pauldronArchetype(def) {
    let archetype = "cap";
    let material = "leather";
    const p = def && def.paul;
    if (p && p.archetype) archetype = p.archetype;
    else if (def && def.set === "dragonscale") archetype = "spiked";
    else if (def && def.set === "ironguard") archetype = "plated";
    else if (def && (def.rarity === "legendary" || def.rarity === "epic")) archetype = "winged";
    else if (def && def.rarity === "rare") archetype = "ornate";
    if (p && p.material) material = p.material;
    else if (def && def.set === "dragonscale") material = "dragonscale";
    else if (def && def.set === "ironguard") material = "iron";
    else if (def && def.rarity === "legendary") material = "gold";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) material = "steel";
    if (!PAULDRON_ARCHETYPES.includes(archetype)) archetype = "cap";
    if (!PAULDRON_MATERIALS.includes(material)) material = "leather";
    return { archetype, material };
  }

  // ---- Worn-glove archetypes (Task 28) ----------------------------------
  // Each glove/gauntlet renders as a distinct hand piece — the readable hand
  // armour an MMORPG wraps around the weapon grip — instead of one plain sphere
  // on each hand. As with the helmets/chests/pauldrons, the 3D SHAPE is chosen by
  // a pure, testable selector so the worn-gear builder (src/game.js `_buildGloves`)
  // pre-builds every archetype once (per hand) and just toggles the matching one on
  // equip. A gloves def opts in via a `glov: { archetype, material }` block; without
  // it we infer a sensible pair from the item's set / rarity so ANY gloves def maps
  // to a valid pair the builder can draw.
  //
  //   archetype: "glove"    soft cloth/leather glove — a snug cuff + a rounded hand
  //              "bracer"   a laced leather bracer + a light hand wrap (rare, non-set)
  //              "gauntlet" a segmented iron gauntlet — banded cuff + knuckle plate
  //                         + finger lames (iron) — Ironguard
  //              "scaled"   an overlapping dragonscale gauntlet + a spined cuff
  //                         (dragonscale) — Dragonscale
  //              "warplate" an ornate polished plate gauntlet — trimmed cuff + a
  //                         raised knuckle boss (steel / gold) — epic / legendary
  //   material:  "leather" | "cloth" | "iron" | "steel" | "gold" | "dragonscale"
  const GLOVE_ARCHETYPES = ["glove", "bracer", "gauntlet", "scaled", "warplate"];
  const GLOVE_MATERIALS = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];
  // Base tints per material (rarity `paint()` then recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const GLOVE_MATERIAL_TINT = {
    leather: "#6f4a2a", cloth: "#8a7a5a", iron: "#8f9fb6",
    steel: "#c3ccd8", gold: "#e8c057", dragonscale: "#b8603a",
  };
  // Resolve a gloves item def to a { archetype, material } pair. Pure + total:
  // honours an explicit `glov` block, else infers from the item's set (Dragonscale
  // → scaled gauntlet, Ironguard → banded gauntlet) and rarity (legendary/epic →
  // ornate warplate, rare → leather bracer), and finally clamps to the known
  // archetype/material lists so the result is always one the builder can draw.
  // Coordinated with pauldronArchetype / chestArchetype / helmetArchetype so a full
  // set reads as one suit (shared iron/steel/dragonscale materials, matching set
  // motifs — an Ironguard cuirass + Ironguard shoulders + Ironguard gauntlets).
  function gloveArchetype(def) {
    let archetype = "glove";
    let material = "leather";
    const gl = def && def.glov;
    if (gl && gl.archetype) archetype = gl.archetype;
    else if (def && def.set === "dragonscale") archetype = "scaled";
    else if (def && def.set === "ironguard") archetype = "gauntlet";
    else if (def && (def.rarity === "legendary" || def.rarity === "epic")) archetype = "warplate";
    else if (def && def.rarity === "rare") archetype = "bracer";
    if (gl && gl.material) material = gl.material;
    else if (def && def.set === "dragonscale") material = "dragonscale";
    else if (def && def.set === "ironguard") material = "iron";
    else if (def && def.rarity === "legendary") material = "gold";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) material = "steel";
    if (!GLOVE_ARCHETYPES.includes(archetype)) archetype = "glove";
    if (!GLOVE_MATERIALS.includes(material)) material = "leather";
    return { archetype, material };
  }

  // ---- Worn-belt archetypes (Task 29) -----------------------------------
  // Each belt renders as a distinct, real belt — a strap + buckle (+ pouches /
  // plates by set / material) — that sits at the waist BELOW the chest piece,
  // instead of one plain cylinder overlapping the chest band. As with the
  // helmets/chests/pauldrons/gloves, the 3D SHAPE is chosen by a pure, testable
  // selector so the worn-gear builder (src/game.js `_buildBelt`) pre-builds every
  // archetype once (under one waist anchor) and just toggles the matching one on
  // equip. A belt def opts in via a `belt: { archetype, material }` block; without
  // it we infer a sensible pair from the item's set / rarity so ANY belt def maps
  // to a valid pair the builder can draw.
  //
  //   archetype: "strap"    a plain leather strap + a simple square buckle (default)
  //              "plated"   a banded iron war-belt — a rectangular plate buckle +
  //                         riveted studs (iron) — Ironguard
  //              "scaled"   an overlapping dragonscale belt + a fanged clasp + a
  //                         hanging side plate (dragonscale) — Dragonscale
  //              "pouched"  a leather belt + a round buckle + hanging pouches
  //                         (leather, rare / non-set)
  //              "warbelt"  an ornate gold-trimmed plate belt — a gem-set boss buckle
  //                         + tassets (steel / gold) — epic / legendary
  //   material:  "leather" | "cloth" | "iron" | "steel" | "gold" | "dragonscale"
  const BELT_ARCHETYPES = ["strap", "plated", "scaled", "pouched", "warbelt"];
  const BELT_MATERIALS = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];
  // Base tints per material (rarity `paint()` then recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const BELT_MATERIAL_TINT = {
    leather: "#6f4a2a", cloth: "#8a7a5a", iron: "#8f9fb6",
    steel: "#c3ccd8", gold: "#e8c057", dragonscale: "#b8603a",
  };
  // Resolve a belt item def to a { archetype, material } pair. Pure + total:
  // honours an explicit `belt` block, else infers from the item's set (Dragonscale
  // → scaled clasp, Ironguard → banded plated) and rarity (legendary/epic → ornate
  // warbelt, rare → pouched), and finally clamps to the known archetype/material
  // lists so the result is always one the builder can draw. Coordinated with
  // gloveArchetype / pauldronArchetype / chestArchetype / helmetArchetype so a full
  // set reads as one suit (shared iron/steel/dragonscale materials, matching set
  // motifs — an Ironguard cuirass + Ironguard shoulders + Ironguard war-belt).
  function beltArchetype(def) {
    let archetype = "strap";
    let material = "leather";
    const b = def && def.belt;
    if (b && b.archetype) archetype = b.archetype;
    else if (def && def.set === "dragonscale") archetype = "scaled";
    else if (def && def.set === "ironguard") archetype = "plated";
    else if (def && (def.rarity === "legendary" || def.rarity === "epic")) archetype = "warbelt";
    else if (def && def.rarity === "rare") archetype = "pouched";
    if (b && b.material) material = b.material;
    else if (def && def.set === "dragonscale") material = "dragonscale";
    else if (def && def.set === "ironguard") material = "iron";
    else if (def && def.rarity === "legendary") material = "gold";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) material = "steel";
    if (!BELT_ARCHETYPES.includes(archetype)) archetype = "strap";
    if (!BELT_MATERIALS.includes(material)) material = "leather";
    return { archetype, material };
  }

  // ---- Worn-boot archetypes (Task 30) -----------------------------------
  // Each boot renders as a distinct, real pair of boots — layered primitives
  // (a shaft up the shin + a foot/vamp over the existing shoe + a sole/cuff) that
  // ride the leg pivots so they stride with the feet, instead of one plain calf
  // cylinder that could intersect the leg or punch through the ground. As with the
  // helmets/chests/pauldrons/gloves/belts, the 3D SHAPE is chosen by a pure,
  // testable selector so the worn-gear builder (src/game.js `_buildBoots`) pre-builds
  // every archetype once (per leg) and just toggles the matching one on equip. A boot
  // def opts in via a `boot: { archetype, material }` block; without it we infer a
  // sensible pair from the item's set / rarity so ANY boots def maps to a valid pair
  // the builder can draw.
  //
  //   archetype: "shoe"    a soft low shoe — a snug vamp + a short ankle collar
  //                        (leather / cloth) — the default (leather_boots)
  //              "boot"    a tall leather boot with a folded-over cuff (rare, non-set)
  //              "greave"  a plated greave + a sabaton — an armoured shin plate over
  //                        a pointed metal foot (iron) — Ironguard
  //              "sabaton" an overlapping dragonscale boot — scale plates up the shin
  //                        + a swept cuff spine (dragonscale) — Dragonscale
  //              "warboot" an ornate gold-trimmed plate boot — a knee poleyn + a
  //                        gold rim (steel / gold) — epic / legendary
  //   material:  "leather" | "cloth" | "iron" | "steel" | "gold" | "dragonscale"
  const BOOT_ARCHETYPES = ["shoe", "boot", "greave", "sabaton", "warboot"];
  const BOOT_MATERIALS = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];
  // Base tints per material (rarity `paint()` then recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const BOOT_MATERIAL_TINT = {
    leather: "#6f4a2a", cloth: "#8a7a5a", iron: "#8f9fb6",
    steel: "#c3ccd8", gold: "#e8c057", dragonscale: "#b8603a",
  };
  // Resolve a boots item def to a { archetype, material } pair. Pure + total:
  // honours an explicit `boot` block, else infers from the item's set (Dragonscale
  // → scaled sabaton, Ironguard → plated greave) and rarity (legendary/epic → ornate
  // warboot, rare → tall leather boot), and finally clamps to the known archetype/
  // material lists so the result is always one the builder can draw. Coordinated with
  // beltArchetype / gloveArchetype / pauldronArchetype / chestArchetype /
  // helmetArchetype so a full set reads as one suit (shared iron/steel/dragonscale
  // materials, matching set motifs — an Ironguard cuirass + Ironguard shoulders +
  // Ironguard greaves).
  function bootArchetype(def) {
    let archetype = "shoe";
    let material = "leather";
    const b = def && def.boot;
    if (b && b.archetype) archetype = b.archetype;
    else if (def && def.set === "dragonscale") archetype = "sabaton";
    else if (def && def.set === "ironguard") archetype = "greave";
    else if (def && (def.rarity === "legendary" || def.rarity === "epic")) archetype = "warboot";
    else if (def && def.rarity === "rare") archetype = "boot";
    if (b && b.material) material = b.material;
    else if (def && def.set === "dragonscale") material = "dragonscale";
    else if (def && def.set === "ironguard") material = "iron";
    else if (def && def.rarity === "legendary") material = "gold";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) material = "steel";
    if (!BOOT_ARCHETYPES.includes(archetype)) archetype = "shoe";
    if (!BOOT_MATERIALS.includes(material)) material = "leather";
    return { archetype, material };
  }

  // ---- Worn-cloak archetypes (Task 31) ----------------------------------
  // Each cloak renders as a real draping cloak that billows behind the wearer —
  // a tapered, segmented cloth drape with a neck clasp — instead of the old single
  // flat box on a pivot that swung THROUGH the legs on sharp turns. As with the
  // helmets/chests/pauldrons/gloves/belts/boots, the 3D SHAPE is chosen by a pure,
  // testable selector so the worn-gear builder (src/game.js `_buildCloak`) pre-builds
  // every archetype once (under the shared back pivot) and just toggles the matching
  // one on equip. A cloak def opts in via a `cloak: { archetype, material }` block;
  // without it we infer a sensible drape from the item's set / rarity so ANY cloak
  // def maps to a valid shape the builder can draw.
  //
  //   archetype: "cape"    a simple tapered cloth cape + a round neck clasp — the
  //                        default (travel_cloak)
  //              "mantle"  a hooded traveller's mantle — a cape + a shoulder shawl
  //                        collar + a hood lump at the neck (rare / non-set)
  //              "scaled"  an overlapping dragonscale cloak — segmented scale panels
  //                        + a fanged clasp (dragonscale) — Dragonscale
  //              "regal"   an ornate gold-trimmed royal mantle — a broad shoulder
  //                        collar + a hemmed drape + tassels (epic)
  //              "winged"  a feathered/winged cloak that flares out at the shoulders
  //                        (gold) — legendary (wings_of_dawn)
  //   material:  "leather" | "cloth" | "iron" | "steel" | "gold" | "dragonscale"
  const CLOAK_ARCHETYPES = ["cape", "mantle", "scaled", "regal", "winged"];
  const CLOAK_MATERIALS = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];
  // Base tints per material (rarity `paint()` then recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const CLOAK_MATERIAL_TINT = {
    leather: "#6f4a2a", cloth: "#5a6f8a", iron: "#8f9fb6",
    steel: "#c3ccd8", gold: "#e8c057", dragonscale: "#b8603a",
  };
  // Resolve a cloak item def to a { archetype, material } pair. Pure + total:
  // honours an explicit `cloak` block, else infers from the item's set (Dragonscale
  // → scaled cloak, Ironguard → hooded mantle) and rarity (legendary → winged, epic
  // → regal, rare → mantle), and finally clamps to the known archetype/material
  // lists so the result is always one the builder can draw. Coordinated with the
  // sibling selectors (boot/belt/glove/pauldron/chest/helmet) so a set shares one
  // material motif — a Dragonscale cloak reads with the same dragonscale as the rest
  // of the suit.
  function cloakArchetype(def) {
    let archetype = "cape";
    let material = "cloth";
    const c = def && def.cloak;
    if (c && c.archetype) archetype = c.archetype;
    else if (def && def.set === "dragonscale") archetype = "scaled";
    else if (def && def.set === "ironguard") archetype = "mantle";
    else if (def && def.rarity === "legendary") archetype = "winged";
    else if (def && def.rarity === "epic") archetype = "regal";
    else if (def && def.rarity === "rare") archetype = "mantle";
    if (c && c.material) material = c.material;
    else if (def && def.set === "dragonscale") material = "dragonscale";
    else if (def && def.set === "ironguard") material = "iron";
    else if (def && def.rarity === "legendary") material = "gold";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) material = "steel";
    if (!CLOAK_ARCHETYPES.includes(archetype)) archetype = "cape";
    if (!CLOAK_MATERIALS.includes(material)) material = "cloth";
    return { archetype, material };
  }

  // ---- Held-weapon classes (Task 32) ------------------------------------
  // Each equipped weapon renders as a real, layered weapon of its actual CLASS in
  // Lily's hand — a sword (blade + crossguard + grip + pommel), an axe (haft + bladed
  // head), a dagger (short blade + guard), a bow (upper/lower limbs + string + grip), a
  // staff (long shaft + head/orb) or a wand (shaft + crystal tip) — instead of the old
  // three recoloured stand-ins (one flat blade, one torus bow, one crystal). As with the
  // worn-gear selectors, the 3D CLASS is chosen by a pure, testable selector so the
  // held-weapon builder (src/game.js `_buildHeldWeapons`) pre-builds every class once
  // (per grip) and just toggles the matching one on equip. UNLIKE the armour selectors
  // (whose archetype implies a material), a weapon's CLASS is intrinsic to how it FIGHTS,
  // so it is inferred from the weapon's own mechanics — ranged + projectile shape + hands
  // for a bow/staff/wand; melee arc / speed / hands for a sword/axe/dagger — while the
  // MATERIAL follows rarity (iron → steel → gold → dragonscale). A weapon def may pin
  // either explicitly via a `held: { archetype, material }` block; otherwise ANY weapon
  // maps to a valid pair the builder can draw. The per-item accent colour (`weapon.color`)
  // still tints the metal on equip, so two steel swords of different weapons read apart —
  // this is the material/rarity variety the mesh keeps through the attacks (the hookable
  // trail anchor the builder exposes is what Task 34's from-scratch attacks animate).
  //
  //   archetype: "sword"  blade + crossguard + grip + pommel   (1H/2H melee, mid arc)
  //              "axe"    haft + bladed head (+ back spike)     (heavy / wide-arc melee)
  //              "dagger" short blade + guard + grip            (fast / short 1H melee)
  //              "bow"    riser + upper/lower limbs + string    (ranged, "arrow")
  //              "staff"  long shaft + head/orb + prongs        (2H ranged, "bolt")
  //              "wand"   short shaft + glowing crystal tip     (1H ranged, "bolt")
  //   material:  "wood" | "iron" | "steel" | "gold" | "crystal" | "dragonscale"
  const WEAPON_ARCHETYPES = ["sword", "axe", "dagger", "bow", "staff", "wand"];
  const WEAPON_MATERIALS = ["wood", "iron", "steel", "gold", "crystal", "dragonscale"];
  // Base tints per material (the per-item accent colour recolours the metal on equip, but
  // a sensible base keeps the un-painted headless build + any preview readable).
  const WEAPON_MATERIAL_TINT = {
    wood: "#6b4a2c", iron: "#b8c0cc", steel: "#d2dae6", gold: "#e8c057",
    crystal: "#9fd0ff", dragonscale: "#b8603a",
  };
  // Infer a weapon's CLASS from how it actually fights (pure + total): ranged weapons
  // split by projectile shape + hands (arrow → bow; bolt → staff if two-handed, else
  // wand); melee weapons split by feel (fast + short one-hander → dagger; wide sweep →
  // axe; else sword). An explicit `held.archetype` always wins.
  function weaponClassOf(def) {
    const h = def && def.held;
    if (h && h.archetype) return h.archetype;
    const w = def && def.weapon;
    if (!w) return "sword";
    if (w.ranged) {
      if (w.shape === "arrow") return "bow";
      return def && def.hands === 2 ? "staff" : "wand";
    }
    const melee = w.melee || {};
    const twoH = def && def.hands === 2;
    const fast = (w.cooldown != null ? w.cooldown : 0.5) <= 0.26;
    const wide = (melee.arc || 0) >= 2.2;
    if (!twoH && fast && (melee.range != null ? melee.range : 3) <= 2.7) return "dagger";
    if (wide) return "axe";
    return "sword";
  }
  // Resolve a weapon item def to a { archetype, material } pair. Pure + total: the class
  // from weaponClassOf (mechanics, or an explicit `held` block), the material from rarity
  // (legendary → dragonscale, epic → gold, rare → steel, else iron) unless the `held`
  // block pins one; finally clamped to the known lists so the result is always a pair the
  // builder can draw.
  function weaponArchetype(def) {
    let archetype = weaponClassOf(def);
    let material = "iron";
    const h = def && def.held;
    if (h && h.material) material = h.material;
    else if (def && def.rarity === "legendary") material = "dragonscale";
    else if (def && def.rarity === "epic") material = "gold";
    else if (def && def.rarity === "rare") material = "steel";
    if (!WEAPON_ARCHETYPES.includes(archetype)) archetype = "sword";
    if (!WEAPON_MATERIALS.includes(material)) material = "iron";
    return { archetype, material };
  }

  // ---- Worn jewelry: necklace + rings (Task 33) -------------------------
  // Necklaces and rings were equipped but INVISIBLE on the character — unlike the
  // other seven worn slots, they rendered no mesh. This adds a subtle, tasteful worn
  // piece for each: a chain + pendant at the neck (necklace) and a thin gem-set band
  // on the hand (rings). As with every other worn-gear category, the 3D SHAPE is
  // chosen by a pure, testable selector so the worn-gear builder (src/game.js
  // `_buildJewelry`) pre-builds every archetype ONCE (under a shared neck anchor +
  // per-hand ring anchors) and just toggles + tints the matching one on equip — so
  // equipping never allocates or leaks. It is TINY and tier-gated to the HIGH tier
  // only (dropped entirely on the low/phone tier — see wornDetailFor), and each piece
  // varies by rarity/material with the gemstone taking a rarity/signature colour.
  //
  // A jewelry def may opt in via a `jewel: { archetype, material, gem }` block; without
  // one a sensible piece is inferred from the item's rarity, so ANY ring/necklace def
  // maps to a valid shape the builder can draw.
  //
  //   necklace archetype: "pendant" a fine collar chain + a small teardrop gem  (normal)
  //                       "amulet"  a chain + a round medallion set with a gem   (rare)
  //                       "torc"    a heavier twin chain + a big faceted gem     (epic+)
  //   ring archetype:     "band"    a plain slim band + a tiny gem dot           (normal)
  //                       "signet"  a band + a flat signet face + a gem          (rare)
  //                       "gemband" a band + a raised claw-set gemstone          (epic+)
  //   material (metal):   "silver" | "gold" | "bronze" | "dragonscale" (follows rarity)
  //   gem:  a hex colour for the stone — an explicit `jewel.gem` gives the item its own
  //         signature (e.g. a Ring of Power's ruby); otherwise it defaults to the item's
  //         RARITY colour, so the finish always reads by rarity (the task hint).
  const NECKLACE_ARCHETYPES = ["pendant", "amulet", "torc"];
  const RING_ARCHETYPES = ["band", "signet", "gemband"];
  const JEWELRY_MATERIALS = ["silver", "gold", "bronze", "dragonscale"];
  // Base metal tints per material (the equip-time paint recolours the built mesh, but a
  // sensible base keeps the un-painted headless build + any preview readable).
  const JEWELRY_MATERIAL_TINT = {
    silver: "#d5dae8", gold: "#e8c057", bronze: "#c88a3a", dragonscale: "#b8603a",
  };
  // Resolve a jewelry item def (ring OR necklace) to a { kind, archetype, material, gem }
  // record. Pure + total: honours an explicit `jewel` block, else infers the archetype
  // from rarity (epic/legendary → the ornate top tier, rare → the mid tier, else the
  // simple base) and the metal from rarity (legendary → dragonscale, epic/rare → gold,
  // else silver); the gem colour is the explicit signature or the item's rarity colour.
  // Finally clamps every field to a value the builder can draw, so it never throws or
  // returns an invalid shape.
  function jewelryArchetype(def) {
    const isRing = !!(def && def.type === "ring");
    const list = isRing ? RING_ARCHETYPES : NECKLACE_ARCHETYPES;
    const j = def && def.jewel;
    let archetype = list[0];
    if (j && j.archetype) archetype = j.archetype;
    else if (def && (def.rarity === "legendary" || def.rarity === "epic")) archetype = list[2];
    else if (def && def.rarity === "rare") archetype = list[1];
    let material = "silver";
    if (j && j.material) material = j.material;
    else if (def && def.rarity === "legendary") material = "dragonscale";
    else if (def && (def.rarity === "epic" || def.rarity === "rare")) material = "gold";
    let gem = (j && j.gem) || (RARITY[def && def.rarity] || RARITY.normal).color;
    if (!list.includes(archetype)) archetype = list[0];
    if (!JEWELRY_MATERIALS.includes(material)) material = "silver";
    if (typeof gem !== "string" || gem[0] !== "#") gem = RARITY.normal.color;
    return { kind: isRing ? "ring" : "necklace", archetype, material, gem };
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
    leather_boots:  { name: "Leather Boots",  icon: "🥾", type: "boots",       rarity: "normal", cost: 16, desc: "+0.8 move speed.", stats: { moveSpeed: 0.8 }, boot: { archetype: "shoe", material: "leather" } },
    iron_greaves:   { name: "Iron Greaves",   icon: "🦿", type: "boots",       rarity: "normal", cost: 30, desc: "+0.4 speed, +5% resist.", stats: { moveSpeed: 0.4, damageReduction: 0.05 }, set: "ironguard", boot: { archetype: "greave", material: "iron" } },
    leather_pauldrons: { name: "Leather Spaulders", icon: "🎽", type: "pauldrons", rarity: "normal", cost: 16, desc: "+12 max health.", stats: { maxHealth: 12 }, paul: { archetype: "cap", material: "leather" } },
    iron_pauldrons: { name: "Iron Spaulders", icon: "🎽", type: "pauldrons", rarity: "normal", cost: 32, desc: "+18 health, +5% resist.", stats: { maxHealth: 18, damageReduction: 0.05 }, set: "ironguard", paul: { archetype: "plated", material: "iron" } },
    leather_gloves: { name: "Leather Gloves", icon: "🧤", type: "gloves",     rarity: "normal", cost: 14, desc: "+1 weapon damage.", stats: { damage: 1 }, glov: { archetype: "glove", material: "leather" } },
    iron_gauntlets: { name: "Iron Gauntlets", icon: "🧤", type: "gloves",     rarity: "normal", cost: 30, desc: "+12 health, +1 damage.", stats: { maxHealth: 12, damage: 1 }, set: "ironguard", glov: { archetype: "gauntlet", material: "iron" } },
    leather_belt:   { name: "Leather Belt",   icon: "🪢", type: "belt",        rarity: "normal", cost: 12, desc: "+10 max health.", stats: { maxHealth: 10 }, belt: { archetype: "strap", material: "leather" } },
    reinforced_belt:{ name: "Reinforced Belt", icon: "🪢", type: "belt",       rarity: "normal", cost: 28, desc: "+14 health, +3% resist.", stats: { maxHealth: 14, damageReduction: 0.03 }, set: "ironguard", belt: { archetype: "plated", material: "iron" } },
    travel_cloak:   { name: "Travelling Cloak", icon: "🧥", type: "cloak",     rarity: "normal", cost: 18, desc: "+0.7 move speed.", stats: { moveSpeed: 0.7 }, cloak: { archetype: "cape", material: "leather" } },
    guard_cloak:    { name: "Warding Cloak",  icon: "🧥", type: "cloak",       rarity: "normal", cost: 30, desc: "+18 health, +4% resist.", stats: { maxHealth: 18, damageReduction: 0.04 }, cloak: { archetype: "mantle", material: "cloth" } },

    // ----- Accessories (normal / buyable) -----
    amulet_vigor:   { name: "Amulet of Vigor", icon: "📿", type: "necklace", rarity: "normal", cost: 26, desc: "+25 max health.", stats: { maxHealth: 25 }, jewel: { gem: "#7dff9e" } },
    coin_amulet:    { name: "Lodestone Pendant", icon: "🧲", type: "necklace", rarity: "normal", cost: 18, desc: "Draw coins from afar.", stats: { coinRange: 3 }, jewel: { gem: "#ffd76a" } },
    ring_power:     { name: "Ring of Power",  icon: "💍", type: "ring", rarity: "normal", cost: 22, desc: "+1 weapon damage.", stats: { damage: 1 }, jewel: { gem: "#ff6b6b" } },
    ring_swift:     { name: "Ring of Haste",  icon: "💍", type: "ring", rarity: "normal", cost: 24, desc: "Attack 12% faster.", stats: { haste: 0.88 }, jewel: { gem: "#6fe0d0" } },
    ring_guard:     { name: "Ring of Guard",  icon: "💍", type: "ring", rarity: "normal", cost: 20, desc: "+6% damage resist.", stats: { damageReduction: 0.06 }, jewel: { gem: "#9fd0ff" } },

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
    winged_boots:   { name: "Winged Boots",  icon: "🪽", type: "boots",       rarity: "rare", value: 80, desc: "+1.4 speed, +5% resist.", stats: { moveSpeed: 1.4, damageReduction: 0.05 }, boot: { archetype: "boot", material: "leather" } },
    vampiric_ring:  { name: "Vampiric Ring", icon: "🩸", type: "ring",        rarity: "rare", value: 70, desc: "Heal +3 per kill.", stats: { lifesteal: 3 }, jewel: { gem: "#ff3b5c" } },
    titan_pendant:  { name: "Titan Pendant", icon: "💠", type: "necklace",    rarity: "rare", value: 110, desc: "+45 health, +8% resist, +2 damage.", stats: { maxHealth: 45, damageReduction: 0.08, damage: 2 }, jewel: { gem: "#7fd0ff" } },
    dragonscale_plate: { name: "Dragonscale Plate", icon: "🐲", type: "breastplate", rarity: "rare", value: 105, desc: "+50 health, +14% resist.", stats: { maxHealth: 50, damageReduction: 0.14 }, set: "dragonscale", chest: { archetype: "dragonscale", material: "dragonscale" } },
    dragon_pauldrons: { name: "Dragonscale Spaulders", icon: "🐲", type: "pauldrons", rarity: "rare", value: 80, desc: "+30 health, +8% resist.", stats: { maxHealth: 30, damageReduction: 0.08 }, set: "dragonscale", paul: { archetype: "spiked", material: "dragonscale" } },
    dragon_gauntlets: { name: "Dragonscale Gauntlets", icon: "🐲", type: "gloves", rarity: "rare", value: 78, desc: "+18 health, +2 damage.", stats: { maxHealth: 18, damage: 2 }, set: "dragonscale", glov: { archetype: "scaled", material: "dragonscale" } },
    dragon_belt:    { name: "Dragonscale Belt", icon: "🐲", type: "belt",      rarity: "rare", value: 76, desc: "+22 health, +5% resist.", stats: { maxHealth: 22, damageReduction: 0.05 }, set: "dragonscale", belt: { archetype: "scaled", material: "dragonscale" } },
    dragon_cloak:   { name: "Dragonscale Cloak", icon: "🐲", type: "cloak",    rarity: "rare", value: 90, desc: "+0.8 speed, +6% resist.", stats: { moveSpeed: 0.8, damageReduction: 0.06 }, set: "dragonscale", cloak: { archetype: "scaled", material: "dragonscale" } },
    shadow_cloak:   { name: "Shadow Cloak",  icon: "🌑", type: "cloak",       rarity: "rare", value: 84, desc: "+1.1 speed, +5% resist.", stats: { moveSpeed: 1.1, damageReduction: 0.05 }, cloak: { archetype: "mantle", material: "cloth" } },
    swift_gloves:   { name: "Quickhand Gloves", icon: "🤌", type: "gloves",   rarity: "rare", value: 72, desc: "Attack 10% faster.", stats: { haste: 0.9 }, glov: { archetype: "bracer", material: "leather" } },

    // ----- EPIC gear (featured shop / blacksmith showcase) -----
    void_scythe:    { name: "Void Scythe", icon: "🌑", type: "weapon", rarity: "epic", hands: 2, value: 200, desc: "Two-handed. A reaping, life-draining arc.",
                      weapon: { ranged: false, damage: 12, cooldown: 0.55, multishot: 1, melee: { range: 4.0, arc: 2.6 }, color: "#b07aff" }, stats: { lifesteal: 2 } },
    sunfire_staff:  { name: "Sunfire Staff", icon: "☀️", type: "weapon", rarity: "epic", hands: 2, value: 190, desc: "Two-handed. A 5-bolt searing fan.",
                      weapon: { ranged: true, shape: "bolt", damage: 3, cooldown: 0.3, multishot: 5, spread: 0.14, pierce: 1, boltSpeed: 28, boltRadius: 0.95, gravity: 1.1, color: "#ffb24e", haloColor: "#ffe27a" } },
    phoenix_plate:  { name: "Phoenix Plate", icon: "🔥", type: "breastplate", rarity: "epic", value: 180, desc: "+75 health, +20% resist.", stats: { maxHealth: 75, damageReduction: 0.2 }, chest: { archetype: "plate", material: "gold" } },
    seraph_ring:    { name: "Seraph Ring", icon: "💫", type: "ring", rarity: "epic", value: 150, desc: "+3 damage, +5 lifesteal.", stats: { damage: 3, lifesteal: 5 }, jewel: { gem: "#e6c8ff" } },
    storm_pauldrons:{ name: "Stormforged Spaulders", icon: "⚡", type: "pauldrons", rarity: "epic", value: 160, desc: "+45 health, +12% resist.", stats: { maxHealth: 45, damageReduction: 0.12 }, paul: { archetype: "winged", material: "steel" } },
    titan_gauntlets:{ name: "Titan Gauntlets", icon: "🥊", type: "gloves", rarity: "epic", value: 150, desc: "+25 health, +3 damage.", stats: { maxHealth: 25, damage: 3 }, glov: { archetype: "warplate", material: "steel" } },

    // ----- LEGENDARY gear (the apex featured / blacksmith showcase) -----
    world_ender:    { name: "World-Ender", icon: "💥", type: "weapon", rarity: "legendary", hands: 2, value: 320, desc: "Two-handed. Cataclysmic, sweeping ruin.",
                      weapon: { ranged: false, damage: 18, cooldown: 0.6, multishot: 1, melee: { range: 4.4, arc: 2.9 }, color: "#ff5d5d" }, stats: { lifesteal: 4 } },
    astral_bow:     { name: "Astral Bow", icon: "🌟", type: "weapon", rarity: "legendary", hands: 2, value: 300, desc: "Two-handed. A 5-arrow piercing storm.",
                      weapon: { ranged: true, shape: "arrow", damage: 5, cooldown: 0.4, multishot: 5, spread: 0.1, pierce: 3, boltSpeed: 46, boltRadius: 0.6, gravity: 6, color: "#a8e0ff", haloColor: "#eaffff" } },
    crown_eternal:  { name: "Crown Eternal", icon: "👑", type: "helmet", rarity: "legendary", value: 280, desc: "+90 health, +18% resist, +3 damage.", stats: { maxHealth: 90, damageReduction: 0.18, damage: 3 }, helm: { archetype: "crown", material: "gold" } },
    wings_of_dawn:  { name: "Wings of Dawn", icon: "🪽", type: "cloak", rarity: "legendary", value: 300, desc: "+1.6 speed, +35 health, +8% resist.", stats: { moveSpeed: 1.6, maxHealth: 35, damageReduction: 0.08 }, cloak: { archetype: "winged", material: "gold" } },

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
  PAULDRON_ARCHETYPES, PAULDRON_MATERIALS, PAULDRON_MATERIAL_TINT, pauldronArchetype,
  GLOVE_ARCHETYPES, GLOVE_MATERIALS, GLOVE_MATERIAL_TINT, gloveArchetype,
  BELT_ARCHETYPES, BELT_MATERIALS, BELT_MATERIAL_TINT, beltArchetype,
  BOOT_ARCHETYPES, BOOT_MATERIALS, BOOT_MATERIAL_TINT, bootArchetype,
  CLOAK_ARCHETYPES, CLOAK_MATERIALS, CLOAK_MATERIAL_TINT, cloakArchetype,
  WEAPON_ARCHETYPES, WEAPON_MATERIALS, WEAPON_MATERIAL_TINT, weaponClassOf, weaponArchetype,
  NECKLACE_ARCHETYPES, RING_ARCHETYPES, JEWELRY_MATERIALS, JEWELRY_MATERIAL_TINT, jewelryArchetype,
};
