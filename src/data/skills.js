// Data: the skill & leveling system (Task 14) — pure data tables + helpers.

  // =========================================================================
  // SKILLS, LEVELING & FUSION
  // -------------------------------------------------------------------------
  // Active skills the player slots onto a 3-button quick bar by the shoot
  // button. Every skill is DECLARATIVE: an `effect` the runtime resolves
  // (volley / nova / buff / heal) plus the numeric ATTRIBUTES (power, focus
  // cost, cooldown, count / radius / duration, an element + flags) that FUSION
  // blends. Base skills are learned by LEVELING; a handful of powerful ones
  // drop only from BOSSES; and the player can FUSE up to 3 owned skills into a
  // brand-new one whose attributes are a deterministic blend of its parts (so
  // it is fully testable and reproduces exactly on reload).
  //
  // Everything here is PURE (no DOM / Babylon / runtime refs) so it lives in the
  // type-checked data layer and the fusion + level math is unit-tested directly.
  // =========================================================================

  // Tunables (read by the runtime Skills controller + the level curve).
  const SKILL_SLOTS = 3;          // quick-bar slots (hotkeys 1 / 2 / 3)
  const MAX_FUSE_INPUTS = 3;      // fuse up to three skills into one
  const FOCUS_BASE = 40;          // max focus (the spell resource) at level 1
  const FOCUS_PER_LEVEL = 8;      // +max focus per level
  const FOCUS_REGEN = 7;          // focus regenerated per second
  const HEALTH_PER_LEVEL = 8;     // +max health granted per level
  const XP_PER_GATHER = 3;        // XP for harvesting a resource node
  const XP_PER_QUEST = 45;        // XP for turning a quest in

  // Schools of magic: a colour + emoji for the bolt / impact tint and the UI.
  // `label` is the English fallback; i18n overrides it via tElementLabel().
  const ELEMENTS = {
    arcane: { color: "#b794ff", icon: "🔮", label: "Arcane" },
    fire:   { color: "#ff7a3a", icon: "🔥", label: "Fire" },
    frost:  { color: "#7fd4ff", icon: "❄️", label: "Frost" },
    storm:  { color: "#ffe24e", icon: "⚡", label: "Storm" },
    nature: { color: "#6fe06f", icon: "🌿", label: "Nature" },
    shadow: { color: "#a05cff", icon: "🌑", label: "Shadow" },
    mixed:  { color: "#ff8ad0", icon: "🌈", label: "Prismatic" },
  };

  // Effect families, with the fusion PRIORITY that decides a fused skill's
  // primary effect (the most spectacular input wins). `label` is the English
  // fallback used by the generated fused-skill name (i18n: tEffectLabel()).
  const EFFECTS = {
    nova:   { priority: 4, label: "Nova" },
    volley: { priority: 3, label: "Volley" },
    buff:   { priority: 2, label: "Aura" },
    heal:   { priority: 1, label: "Mending" },
  };

  // ---- Skill catalogue ---------------------------------------------------
  // source: "base" (learned at `unlock` level) | "boss" (boss-drop only).
  // effect: "volley" (fan of bolts) | "nova" (AoE burst around the player) |
  //         "buff" (timed self buff) | "heal" (instant heal).
  // attrs: power · cooldown(s) · cost(focus) · count(volley) · pierce(volley) ·
  //        radius(nova) · knock(nova) · slow/lifesteal(nova flags) ·
  //        buff{...}+duration(buff). All optional + additive; FUSION blends them.
  const SKILL_DB = {
    // ----- Base skills: learned automatically on reaching `unlock` level -----
    firebolt: {
      icon: "🔥", source: "base", unlock: 1, effect: "volley", element: "fire",
      name: "Firebolt Fan", desc: "Hurl a fan of three fiery bolts.",
      power: 6, count: 3, pierce: 0, cooldown: 3, cost: 12,
    },
    frost_nova: {
      icon: "❄️", source: "base", unlock: 2, effect: "nova", element: "frost",
      name: "Frost Nova", desc: "A burst of frost that blasts and slows nearby foes.",
      power: 10, radius: 6, knock: 8, cooldown: 6, cost: 18, slow: true,
    },
    mend: {
      icon: "💚", source: "base", unlock: 3, effect: "heal", element: "nature",
      name: "Mend", desc: "Knit your wounds, restoring health at once.",
      power: 45, cooldown: 12, cost: 22,
    },
    war_focus: {
      icon: "⚔️", source: "base", unlock: 4, effect: "buff", element: "arcane",
      name: "Battle Focus", desc: "Steel yourself: more power and faster strikes for a while.",
      buff: { damage: 4, haste: 0.85 }, duration: 12, cooldown: 18, cost: 20,
    },
    chain_spark: {
      icon: "⚡", source: "base", unlock: 5, effect: "volley", element: "storm",
      name: "Chain Spark", desc: "Loose a piercing storm of five sparks.",
      power: 7, count: 5, pierce: 2, cooldown: 5, cost: 20,
    },
    quake: {
      icon: "🌿", source: "base", unlock: 6, effect: "nova", element: "nature",
      name: "Quake", desc: "Slam the ground, shattering everything around you.",
      power: 16, radius: 7, knock: 12, cooldown: 8, cost: 26,
    },

    // ----- Boss-only skills: drop solely from boss loot (seeded, reproducible) -
    meteor: {
      icon: "☄️", source: "boss", effect: "nova", element: "fire",
      name: "Meteor", desc: "Call down a meteor of ruinous fire.",
      power: 30, radius: 8, knock: 14, cooldown: 12, cost: 35,
    },
    soul_harvest: {
      icon: "🌑", source: "boss", effect: "nova", element: "shadow",
      name: "Soul Harvest", desc: "Reap nearby foes, drinking their essence to heal.",
      power: 20, radius: 7, knock: 6, cooldown: 10, cost: 30, lifesteal: true,
    },
    tempest: {
      icon: "🌩️", source: "boss", effect: "volley", element: "storm",
      name: "Tempest", desc: "Unleash a tempest of seven piercing bolts.",
      power: 12, count: 7, pierce: 3, cooldown: 7, cost: 32,
    },
    time_warp: {
      icon: "⏳", source: "boss", effect: "buff", element: "arcane",
      name: "Time Warp", desc: "Bend time — strike and move far faster.",
      buff: { haste: 0.6, moveSpeed: 2 }, duration: 10, cooldown: 22, cost: 30,
    },
  };

  // Fill in the id once, then derive the source pools.
  for (const id in SKILL_DB) SKILL_DB[id].id = id;
  const getSkill = (id) => SKILL_DB[id];
  const BASE_SKILL_IDS = Object.keys(SKILL_DB).filter((id) => SKILL_DB[id].source === "base");
  const BOSS_SKILL_IDS = Object.keys(SKILL_DB).filter((id) => SKILL_DB[id].source === "boss");
  // Base skills the player owns from the very start (every base skill unlocked
  // at level 1 — today just the first).
  const STARTER_SKILL_IDS = BASE_SKILL_IDS.filter((id) => (SKILL_DB[id].unlock || 1) <= 1);

  // ---- Leveling curve ----------------------------------------------------
  // XP required to advance FROM `level` to the next. Smooth + slightly
  // super-linear so early levels come quickly and later ones earn their reward.
  function xpToNext(level) {
    const L = Math.max(1, level | 0);
    return Math.round(50 * Math.pow(L, 1.45) + 40 * L);
  }
  // Cumulative XP to first REACH `level` from level 1 (level 1 ⇒ 0).
  function totalXpToReach(level) {
    let sum = 0;
    for (let L = 1; L < Math.max(1, level | 0); L++) sum += xpToNext(L);
    return sum;
  }
  // Max focus (the spell resource) at a level.
  function maxFocusForLevel(level) {
    return FOCUS_BASE + (Math.max(1, level | 0) - 1) * FOCUS_PER_LEVEL;
  }
  // Bonus max-health granted by levels (folded into the player's base health).
  function levelHealthBonus(level) {
    return (Math.max(1, level | 0) - 1) * HEALTH_PER_LEVEL;
  }
  // The base skill ids whose unlock level is now reached (for auto-learn).
  function skillsUnlockedAt(level) {
    return BASE_SKILL_IDS.filter((id) => (SKILL_DB[id].unlock || 1) <= level);
  }

  // ---- Fusion (PURE + deterministic) -------------------------------------
  // A rough power tier (1..4) for a skill, used for sorting + fusion cost.
  function skillTier(def) {
    if (!def) return 1;
    const p = (def.power || 0) + (def.count || 0) * 3 + (def.radius || 0) * 2 + (def.duration || 0) * 1.5;
    if (def.generated) return Math.min(4, 2 + Math.floor(p / 45));
    if (def.source === "boss") return 3;
    return Math.min(3, 1 + Math.floor(p / 22));
  }

  // Blend the inputs' element: their shared school if they agree, else "mixed".
  function blendElement(defs) {
    const els = defs.map((d) => d.element);
    return els.every((e) => e === els[0]) ? els[0] : "mixed";
  }

  // Whether a set of skill defs can be fused (2..3 valid skills).
  function canFuse(defs) {
    return Array.isArray(defs) && defs.length >= 2 && defs.length <= MAX_FUSE_INPUTS &&
      defs.every((d) => d && typeof d.effect === "string" && EFFECTS[d.effect]);
  }

  // Fuse 2..3 skills into a brand-new skill def. PURE + deterministic: the same
  // inputs always yield the same result (no rng), so it round-trips on reload and
  // is unit-tested directly. The caller assigns the instance id (e.g. "fused_3").
  //   • primary effect  = the most spectacular input (EFFECTS priority)
  //   • power           = the strongest same-effect input + half its peers + a
  //                       small flat bonus per off-effect input (so cross-unit
  //                       attributes like heal HP never inflate damage)
  //   • cost / cooldown = the inputs' average, nudged up (a fused skill is
  //                       stronger, so it asks a little more)
  //   • element / flags = blended school; slow / lifesteal / pierce inherited
  function fuseSkills(defs) {
    if (!canFuse(defs)) return null;
    // Primary effect: highest priority, ties broken by power then id (stable).
    const primary = defs.slice().sort((a, b) =>
      (EFFECTS[b.effect].priority - EFFECTS[a.effect].priority) ||
      ((b.power || 0) - (a.power || 0)) ||
      (a.id < b.id ? -1 : 1))[0].effect;
    const sum = (arr) => arr.reduce((s, v) => s + v, 0);
    const same = defs.filter((d) => d.effect === primary);
    const offCount = defs.length - same.length;
    const sp = same.map((d) => d.power || 0);
    const maxP = Math.max(...sp);
    const power = Math.round(maxP + 0.5 * (sum(sp) - maxP) + 2 * offCount);
    const cost = Math.round((sum(defs.map((d) => d.cost || 0)) / defs.length) * 1.1);
    const cooldown = Math.round((sum(defs.map((d) => d.cooldown || 0)) / defs.length) * 1.05 * 10) / 10;
    const element = blendElement(defs);

    const out = {
      generated: true, source: "fused", effect: primary, element,
      power, cost, cooldown, parts: defs.map((d) => d.id),
      icon: ELEMENTS[element].icon,
    };
    if (defs.some((d) => d.slow)) out.slow = true;
    if (defs.some((d) => d.lifesteal)) out.lifesteal = true;

    if (primary === "volley") {
      const counts = same.map((d) => d.count || 1);
      out.count = Math.max(...counts) + (defs.length - 1);
      out.pierce = Math.max(0, ...defs.map((d) => d.pierce || 0)) + (defs.length - 1);
    } else if (primary === "nova") {
      const radii = same.map((d) => d.radius || 5);
      out.radius = Math.round(Math.max(...radii) * 1.15 * 10) / 10;
      const knock = Math.max(0, ...defs.map((d) => d.knock || 0));
      if (knock) out.knock = Math.round(knock * 1.1);
    } else if (primary === "buff") {
      out.duration = Math.max(...same.map((d) => d.duration || 8));
      // Merge buffs: best of each stat (damage / moveSpeed / maxHealth up; the
      // sub-1 haste multiplier improves toward zero, so take the smallest).
      const buff = {};
      for (const d of defs) {
        const b = d.buff || {};
        for (const s in b) {
          if (s === "haste") buff.haste = Math.min(buff.haste == null ? 1 : buff.haste, b[s]);
          else buff[s] = Math.max(buff[s] || 0, b[s]);
        }
      }
      out.buff = buff;
    }
    return out;
  }

  // The coin + crystal price to fuse a set of skills (PURE; scales with tier).
  function fusionCost(defs) {
    if (!Array.isArray(defs) || !defs.length) return { coins: 0, crystal: 0 };
    const tierSum = defs.reduce((s, d) => s + skillTier(d), 0);
    return { coins: 60 + tierSum * 40, crystal: 1 + Math.max(0, defs.length - 2) + Math.floor(tierSum / 3) };
  }

export {
  SKILL_DB, getSkill, ELEMENTS, EFFECTS,
  BASE_SKILL_IDS, BOSS_SKILL_IDS, STARTER_SKILL_IDS,
  SKILL_SLOTS, MAX_FUSE_INPUTS, FOCUS_BASE, FOCUS_PER_LEVEL, FOCUS_REGEN,
  HEALTH_PER_LEVEL, XP_PER_GATHER, XP_PER_QUEST,
  xpToNext, totalXpToReach, maxFocusForLevel, levelHealthBonus, skillsUnlockedAt,
  skillTier, blendElement, canFuse, fuseSkills, fusionCost,
};
