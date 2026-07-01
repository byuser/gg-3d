// @ts-nocheck -- legacy runtime monolith moved verbatim during the Task 9 split;
// slated for finer, individually-typed module splits in follow-up runs.
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

import { CONFIG, PALETTE, rng, setSeed, getSeed } from "./core/config.js";
import {
  RARITY, ENHANCE, enhanceRule, instLevel, enhanceMult, enhanceCost, enhanceName,
  effectiveStats, EQUIP_SLOTS, WORN_SLOTS, TWO_HANDED, SLOT_META, FISTS, ITEM_DB, getDef, isGear,
  isMaterial, isStackable, SHOP_STOCK, POTION_STOCK, INGREDIENT_STOCK, ALCHEMIST_STOCK, RARE_DROPS, FEATURED_POOL,
  AFFIXES, rollAffixes, affixStats, SETS, setBonusStats, activeSets, itemCategory,
  HELM_MATERIAL_TINT, helmetArchetype, CHEST_MATERIAL_TINT, chestArchetype,
  PAULDRON_MATERIAL_TINT, pauldronArchetype, GLOVE_MATERIAL_TINT, gloveArchetype,
  BELT_MATERIAL_TINT, beltArchetype,
} from "./data/items.js";
import {
  MATERIALS, MATERIAL_IDS, RESOURCE_KINDS, RELICS, CASTLE_PARTS, CASTLE_PART_BY_ID,
  CRAFT_RECIPES, MONSTER_ABILITIES, abilitiesForWave, LOCATIONS, LOCATION_BY_ID,
  NPC_DATA, NPC_BY_ID, landmarkZone,
} from "./data/content.js";
import {
  STORY, MISSIONS, SIDE_QUESTS, QUEST_BY_ID, MAIN_IDS, MAIN_INDEX, SIDE_IDS,
  CHAPTER_BY_ID, missionsOfChapter,
} from "./data/story.js";
import { ZONES, ZONE_BY_ID, HUB_ZONE } from "./data/zones.js";
import {
  ZONE_ADJ, zoneEdges, findRoute, nextZoneStep,
  bearingRad, dist2D, relativeHeading, compass8,
  mapVecToScreen, mapHeadingScreen, layoutMapLabels,
  MAP_TARGETS, targetZoneOf, targetPoint, validWaypoint,
  searchTargets, worldLayout,
} from "./data/worldmap.js";
import {
  SKILL_DB, getSkill, ELEMENTS, EFFECTS, BASE_SKILL_IDS, BOSS_SKILL_IDS, STARTER_SKILL_IDS,
  SKILL_SLOTS, MAX_FUSE_INPUTS, FOCUS_REGEN, XP_PER_GATHER, XP_PER_QUEST, XP_PER_ARTIFACT,
  xpToNext, totalXpToReach, maxFocusForLevel, levelHealthBonus, skillsUnlockedAt,
  skillTier, canFuse, fuseSkills, fusionCost,
} from "./data/skills.js";
import {
  I18N, LOCALES, LOCALE_KEY, RU, localGet, localSet, plural, t, tFlat,
  tCastlePartDesc, tCastlePartName, tChapterBlurb, tChapterTitle, tDragonName,
  tItemDesc, tItemName, tLairBossIntro, tLairBossName, tLocationName, tMaterialLabel,
  tNpcIntro, tNpcName, tPotionLabel, tQuestStory, tQuestTitle, tQuestWhere, tRarityLabel,
  tRelicName, tResourceLabel, tSlotLabel, tAffixLabel, tSetName, tStoryEndingText, tStoryEndingTitle,
  tStoryIntroText, tStoryIntroTitle, tZoneName,
  tElementLabel, tEffectLabel, tSkillName, tSkillDesc,
  RU_NOUNS, CASES, GENDERS, declineRegular, ruForm, select, agree, nounRef, declineNoun, nounGender,
} from "./core/i18n.js";

  // ---- i18n resolvers that read runtime systems (relocated from the i18n
  // module to keep that layer acyclic): weather label + boss display name. ----
  const tWeatherLabel = (s) => tFlat("weather", s, (Weather.STATES[s] || {}).label || s);
  function bossDisplayName(boss) {
    if (!boss) return "";
    if (boss.isDragon) return tDragonName();
    if (boss.lairZoneId) return tLairBossName(boss.lairZoneId);
    if (boss.archId) return tFlat("boss", boss.archId, (BOSS_ARCH_BY_ID[boss.archId] || {}).name || boss.name);
    return boss.name;
  }

  // ---- Russian grammatical agreement bridges (Task 24) --------------------
  // Past-tense verbs that describe an interpolated noun must agree with its
  // gender/number; select() picks the form (English collapses to `other`).
  // "<part> raised" — возведён / возведена / возведено / возведены.
  const AGREE_RAISED = { other: "raised", m: "возведён", f: "возведена", n: "возведено", pl: "возведены" };
  // "<boss> defeated" — повержен / повержена / повержены.
  const AGREE_DEFEATED = { other: "defeated", m: "повержен", f: "повержена", n: "повержено", pl: "повержены" };

  // Resolve a live Boss/Dragon to its morphology (group, id) so it can be
  // declined (accusative for "defeat X") and agreed with (gender for "X was
  // defeated"). Mirrors bossDisplayName's dispatch.
  function bossNounKey(boss) {
    if (!boss) return null;
    if (boss.isDragon) return { group: "dragon", id: "ancient" };
    if (boss.lairZoneId && RU_NOUNS.lairBoss[boss.lairZoneId]) return { group: "lairBoss", id: boss.lairZoneId };
    if (boss.archId && RU_NOUNS.boss[boss.archId]) return { group: "boss", id: boss.archId };
    return null;
  }
  const bossNounRef = (boss) => { const k = bossNounKey(boss); return k ? nounRef(k.group, k.id, bossDisplayName(boss)) : bossDisplayName(boss); };
  const bossGender = (boss) => { const k = bossNounKey(boss); return k ? nounGender(k.group, k.id) : "m"; };

  // A material's bag/gather label agreed to a count (2 камня / 5 камней) in RU;
  // English uses the plain label. `n` omitted → nominative singular.
  function materialLabel(id, n) {
    const meta = RU_NOUNS.material[id];
    if (I18N.locale === "ru" && meta && meta.count && n != null) return agree(n, meta.count);
    return tMaterialLabel(id);
  }
  // A noun-ref for a material, so objectives can request its accusative.
  const materialRef = (id) => nounRef("material", id, tMaterialLabel(id));
  // A noun-ref for a place that is either a zone or a location.
  const placeRef = (id) => LOCATION_BY_ID[id]
    ? nounRef("location", id, tLocationName(id))
    : (ZONE_BY_ID[id] ? nounRef("zone", ZONE_BY_ID[id].id, tZoneName(ZONE_BY_ID[id])) : id);
  // The Russian locative preposition a zone takes ("в"/"на"); English is blank
  // (the template supplies "to"). Used by the map compass ("go … в/на <zone>").
  const zonePrep = (id) => (I18N.locale === "ru" && RU_NOUNS.zone[id] && RU_NOUNS.zone[id].loc) ? RU_NOUNS.zone[id].loc : "";

  // A visible crash handler — far better than a blank canvas if anything fails.
  function showFatal(msg) {
    const hint = document.getElementById("loadHint");
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.remove("hidden");
    if (hint) { hint.style.color = "#ff8a8a"; hint.textContent = t("hint.errorPrefix") + msg; }
    console.error(msg);
  }
  window.addEventListener("error", (e) => showFatal(e.message || "unknown error"));

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
      document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    } catch (e) {}
  }

  // Re-render everything currently on screen in the active locale, then persist.
  function applyLocale(loc, persist) {
    if (loc && LOCALES[loc]) I18N.locale = loc;
    if (persist !== false) localSet(LOCALE_KEY, I18N.locale);
    try { if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = I18N.locale; } catch (e) {}
    applyStaticI18n();
    _syncLangButtons();
    _syncGfxButtons();
    // Once the engine is ready the start hint reads "Ready!" — keep that on switch.
    if (dom.loadHint && dom.startBtn && dom.startBtn.disabled === false) dom.loadHint.textContent = t("hint.ready");
    // Dynamic HUD + any open overlay (all guarded — null before the scene boots).
    if (typeof playerRef !== "undefined" && playerRef) {
      recomputeStats(playerRef);            // rebuilds the weapon's display name
      updateRelicHud(playerRef);
      updatePotionBar(playerRef);
      if (typeof updateSkillsHud === "function") updateSkillsHud(playerRef);
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
    if (typeof SkillsUI !== "undefined" && SkillsUI.open) SkillsUI.render();
    if (typeof WorldMapUI !== "undefined" && WorldMapUI.open) WorldMapUI.render();
    if (typeof WorldMap !== "undefined" && WorldMap.state) WorldMap.update(0);
    if (typeof Dialogue !== "undefined" && Dialogue.open && Dialogue.npc) Dialogue.render();
    if (typeof Pause !== "undefined" && typeof paused !== "undefined" && paused) Pause.refreshTexts();
    if (typeof AudioUI !== "undefined" && AudioUI.sync) AudioUI.sync();
    if (typeof CloudUI !== "undefined" && CloudUI.sync) CloudUI.sync();
    if (typeof SavesUI !== "undefined" && SavesUI.open) SavesUI.render();
    if (typeof Fullscreen !== "undefined" && Fullscreen.sync) Fullscreen.sync();
  }

  // Highlight the active language in both selectors (start screen + pause).
  function _syncLangButtons() {
    const set = (el, on) => { if (el && el.classList) el.classList.toggle("active", on); };
    set(dom.langEn, I18N.locale === "en"); set(dom.langRu, I18N.locale === "ru");
    set(dom.langEnPause, I18N.locale === "en"); set(dom.langRuPause, I18N.locale === "ru");
  }

  // Highlight the chosen graphics preference and (when Auto) reveal which tier the
  // device was detected as, plus the "reloads to apply" note. Localized live.
  function _syncGfxButtons() {
    const set = (el, on) => { if (el && el.classList) el.classList.toggle("active", on); };
    const pref = Quality.pref;
    set(dom.gfxAuto, pref === "auto"); set(dom.gfxHigh, pref === "high");
    set(dom.gfxMedium, pref === "medium"); set(dom.gfxLow, pref === "low");
    if (dom.gfxHint) {
      const tierLabel = t("settings.gfx" + Quality.tier.charAt(0).toUpperCase() + Quality.tier.slice(1));
      dom.gfxHint.textContent =
        (pref === "auto" ? t("settings.gfxAutoIs", { tier: tierLabel }) + " · " : "") + t("settings.gfxReload");
    }
  }

  // A monotonically increasing id so inventory/equipment entries are distinct
  // even when two of the same item are owned.
  let _instSeq = 1;
  function makeItem(id) { return { id, uid: _instSeq++ }; }

  // Generate an instance for *found or crafted* gear: a plain instance plus a
  // deterministic affix roll (rare+ only — normal gear stays clean). Drops and
  // crafts run through the seeded rng(), so a given seed reproduces the same
  // enchantments; the rolled affix ids are then persisted on the instance so a
  // reload never re-rolls. Shop-bought gear stays clean (uses makeItem).
  function makeLoot(id) {
    const inst = makeItem(id);
    const def = getDef(id);
    if (def && isGear(id)) {
      const aff = rollAffixes(def, rng);
      if (aff.length) inst.affixes = aff;
    }
    return inst;
  }

  function cloneWeapon(w) {
    const c = Object.assign({}, w);
    if (w.melee) c.melee = Object.assign({}, w.melee);
    return c;
  }

  // Build the player's *active* weapon profile from whatever is in their hands,
  // folding in flat bonuses (damage/haste/pierce) from armour and accessories.
  // Takes an equipment map (the live player's, or a hypothetical one for previews).
  function computeWeapon(equipment, bonus) {
    const eq = equipment;
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

  // Derive the full stat block from a base + an equipment map + active buffs.
  // PURE (no side effects, no live-player reads) so it powers both the live
  // recomputeStats and the hypothetical previewEquip used by compare tooltips.
  // Folds equipped gear (incl. enchant levels + affixes), set bonuses and buffs.
  function deriveStats(base, equipment, buffs) {
    let mh = base.maxHealth, dr = 0, ls = 0, spd = base.speed;
    let dmg = 0, haste = 1, pierce = 0, coinRange = 0;
    const fold = (s) => {
      mh += s.maxHealth || 0; dr += s.damageReduction || 0; ls += s.lifesteal || 0;
      spd += s.moveSpeed || 0; dmg += s.damage || 0; pierce += s.pierce || 0;
      coinRange += s.coinRange || 0;
      if (s.haste) haste *= s.haste;
    };
    for (const slot of EQUIP_SLOTS) {
      const inst = equipment[slot];
      if (!inst || inst === TWO_HANDED) continue;
      fold(effectiveStats(inst));
    }
    fold(setBonusStats(equipment));               // equipment-set threshold bonuses
    for (const b of buffs || []) fold(b.stats || {}); // active potion buffs
    return {
      maxHealth: mh,
      damageReduction: Math.min(0.75, dr),
      lifesteal: ls,
      speed: spd,
      coinRange,
      weapon: computeWeapon(equipment, { damage: dmg, haste, pierce }),
    };
  }

  // Recompute every derived player stat from base + equipped gear. Called after
  // any equip/unequip and on load. Also widens the global coin magnet ranges and
  // refreshes the held weapon + worn-gear visuals.
  function recomputeStats(player) {
    const d = deriveStats(player.base, player.equipment, player.buffs);
    player.maxHealth = d.maxHealth;
    if (player.health > d.maxHealth) player.health = d.maxHealth;
    player.damageReduction = d.damageReduction;
    player.lifesteal = d.lifesteal;
    player.speed = d.speed;
    player.weapon = d.weapon;
    if (player.refreshWeaponVisual) player.refreshWeaponVisual();
    if (player.refreshWornGear) player.refreshWornGear();
    coinMagnetRange = CONFIG.coinMagnetRange + d.coinRange;
    coinPickupRange = CONFIG.coinPickupRange + d.coinRange * 0.18;
    updateHealthBar(player.health);
  }

  // Pure simulate: a NEW equipment map as it would look after equipping `inst`,
  // applying the same slot rules as equipItem() (2-handed fills both hands; a
  // one-hander takes a free hand or replaces the main; rings round-robin) without
  // touching the bag. Powers the compare tooltips.
  function equippedAfter(equipment, inst) {
    const eq = Object.assign({}, equipment);
    const d = getDef(inst.id);
    if (d.type === "weapon") {
      if (d.hands === 2) { eq.hand1 = inst; eq.hand2 = TWO_HANDED; }
      else {
        if (eq.hand2 === TWO_HANDED) { eq.hand1 = null; eq.hand2 = null; } // free a 2H
        const slot = !eq.hand1 ? "hand1" : !eq.hand2 ? "hand2" : "hand1";
        eq[slot] = inst;
      }
    } else if (d.type === "ring") {
      eq[!eq.ring1 ? "ring1" : !eq.ring2 ? "ring2" : "ring1"] = inst;
    } else {
      eq[d.type] = inst;
    }
    return eq;
  }
  // The stat deltas (would-be minus current) for equipping a bag item, for the
  // inventory's compare tooltips. Only non-zero deltas are returned.
  function equipDelta(player, inst) {
    const cur = deriveStats(player.base, player.equipment, player.buffs);
    const next = deriveStats(player.base, equippedAfter(player.equipment, inst), player.buffs);
    const out = {};
    for (const k of ["maxHealth", "damageReduction", "lifesteal", "speed", "coinRange"]) {
      const dv = (next[k] || 0) - (cur[k] || 0);
      if (Math.abs(dv) > 1e-6) out[k] = dv;
    }
    const dDmg = (next.weapon.damage || 0) - (cur.weapon.damage || 0);
    if (Math.abs(dDmg) > 1e-6) out.damage = dDmg;
    return out;
  }

  // Which worn-gear pieces to build for a graphics tier (pure + testable). The
  // core silhouette (helmet / breastplate / gloves / boots / cloak) is always
  // built; the lighter extras (pauldrons, belt) and the per-frame cloak billow
  // are dropped on the low tier so phones keep their budget. Equip still applies
  // a missing piece's STATS — only its mesh is skipped.
  function wornDetailFor(tier) {
    if (tier === "low") return { pauldrons: false, belt: false, gloves: true, cloak: true, cloakSway: false, helmDetail: false, chestDetail: false, pauldronDetail: false, gloveDetail: false, beltDetail: false };
    return { pauldrons: true, belt: true, gloves: true, cloak: true, cloakSway: true, helmDetail: true, chestDetail: true, pauldronDetail: true, gloveDetail: true, beltDetail: true };
  }

  // ---- Inventory / equipment operations ----------------------------------
  // The bag (player.inventory) is now UNIFIED (Task 21): gear instances live
  // alongside STACKABLE consumable/material stacks ({ id, uid, count }). Gear is
  // one slot per instance; potions + materials stack up to STACK_MAX per slot and
  // overflow into additional slots. A "slot" is one array entry, capped by invCap.
  const STACK_MAX = 99;

  function invRemove(player, inst) {
    const i = player.inventory.indexOf(inst);
    if (i >= 0) player.inventory.splice(i, 1);
  }
  // Add a single bag entry (gear instance, or a stackable instance). Stackable
  // instances merge into an existing same-id stack first (so they don't waste a
  // slot); only when every existing stack is full does a new slot get used.
  function invAdd(player, inst) {
    if (inst && isStackable(inst.id)) {
      const n = inst.count != null ? inst.count : 1;
      return bagAdd(player, inst.id, n) > 0;
    }
    if (player.inventory.length >= player.invCap) return false;
    player.inventory.push(inst);
    return true;
  }
  // Total count of a stackable item across all its bag stacks.
  function bagCount(player, id) {
    let n = 0;
    for (const it of player.inventory) if (it && it.id === id) n += (it.count || 0);
    return n;
  }
  // Add `n` of a stackable item to the bag: top up existing stacks, then open new
  // slots while there's room. Returns how many were actually added (capped by the
  // bag's free slots × STACK_MAX). Non-stackable ids are rejected (use invAdd).
  function bagAdd(player, id, n) {
    if (!isStackable(id) || n <= 0) return 0;
    let added = 0;
    for (const it of player.inventory) {
      if (added >= n) break;
      if (it && it.id === id && it.count < STACK_MAX) {
        const take = Math.min(STACK_MAX - it.count, n - added);
        it.count += take; added += take;
      }
    }
    while (added < n && player.inventory.length < player.invCap) {
      const take = Math.min(STACK_MAX, n - added);
      player.inventory.push({ id, uid: _instSeq++, count: take });
      added += take;
    }
    return added;
  }
  // Remove up to `n` of a stackable item from the bag (drains stacks, dropping
  // emptied slots). Returns how many were actually removed.
  function bagSpend(player, id, n) {
    if (n <= 0) return 0;
    let removed = 0;
    for (let i = player.inventory.length - 1; i >= 0 && removed < n; i--) {
      const it = player.inventory[i];
      if (!it || it.id !== id || it.count == null) continue;
      const take = Math.min(it.count, n - removed);
      it.count -= take; removed += take;
      if (it.count <= 0) player.inventory.splice(i, 1);
    }
    return removed;
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

  // ---- Potion quick-slots + buffs ---------------------------------------
  // Potions now live in the UNIFIED bag as stackable items (Task 21). The 3
  // combat quick-slots are an ASSIGNMENT over those bag stacks — each slot holds
  // a potion *id* (or null), chosen by the player via drag-and-drop. Drinking a
  // slot consumes one of that potion from the bag stack; emptying the stack
  // auto-clears the slot. `potionAdd` is just a bag add (kept as a name a lot of
  // callers use — quests, crafting, starting loadout).
  const POTION_SLOTS = 3;

  function potionAdd(player, id) { return bagAdd(player, id, 1) > 0; }

  // Assign / clear a quick-slot (pure model; the drag layer + tap fallback both
  // funnel through these, like the skill quick-bar's assignSlot/clearSlot).
  function assignPotionSlot(player, slot, id) {
    if (slot < 0 || slot >= POTION_SLOTS || !id || !getDef(id) || getDef(id).type !== "potion") return false;
    // Keep slots unique: if this potion already sits in another slot, swapping is
    // handled by the reducer; a plain assign just drops any duplicate elsewhere.
    for (let i = 0; i < POTION_SLOTS; i++) if (i !== slot && player.potionSlots[i] === id) player.potionSlots[i] = null;
    player.potionSlots[slot] = id;
    return true;
  }
  function clearPotionSlot(player, slot) {
    if (slot < 0 || slot >= POTION_SLOTS) return false;
    player.potionSlots[slot] = null;
    return true;
  }
  // Drop any quick-slot pointing at a potion the bag no longer holds (called
  // after a drink / sale so a slot never shows a phantom potion).
  function syncPotionSlots(player) {
    for (let i = 0; i < POTION_SLOTS; i++) {
      const id = player.potionSlots[i];
      if (id && bagCount(player, id) <= 0) player.potionSlots[i] = null;
    }
  }

  // Drink one of a potion by id: apply its effect (instant heal or a timed buff)
  // and consume one from the bag stack. Shared by the combat quick-slots and the
  // inventory's "drink from bag" action. Returns true if a potion was consumed.
  function drinkPotionById(player, id) {
    const def = getDef(id);
    if (!def || def.type !== "potion" || player.health <= 0 || bagCount(player, id) <= 0) return false;
    const p = def.potion || {};
    if (p.heal) {
      if (player.health >= player.maxHealth) { toast(t("toast.fullHealth")); return false; }
      player.health = Math.min(player.maxHealth, player.health + p.heal);
      updateHealthBar(player.health);
      toast(t("toast.potionHeal", { icon: def.icon, heal: p.heal }));
    } else if (p.buff) {
      applyBuff(player, { id, label: p.label || def.name, stats: p.buff, time: p.time || 12 });
      toast(t("toast.potionBuff", { icon: def.icon, label: tPotionLabel(id) }));
    }
    if (typeof Sfx !== "undefined") Sfx.play("potion");
    bagSpend(player, id, 1);
    syncPotionSlots(player);
    recomputeStats(player);
    return true;
  }

  // Drink the potion assigned to a combat quick-slot (consumes from the bag).
  function potionUse(player, slot) {
    const id = player.potionSlots[slot];
    if (!id) return false;
    if (!drinkPotionById(player, id)) return false;
    updatePotionBar(player);
    if (Inventory.open) Inventory.render();
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

  // ---- Crafting materials (now bag-backed; Task 21) -----------------------
  // Materials are stackable BAG items. addMaterial / hasMaterials / spendMaterials
  // read & write the unified bag (player.inventory) instead of the old ad-hoc
  // player.materials dictionary, so crafting, quests and the alchemist all share
  // one code path. A gathered material that overflows the bag is simply dropped
  // (the bag is capped) — bagAdd returns how many landed.
  function addMaterial(player, mat, n) {
    if (!isMaterial(mat) || n <= 0) return;
    bagAdd(player, mat, n);
    if (Inventory.open) Inventory.render();
    Quests.onGather(player, mat, n);
  }
  // True if the bag holds at least the listed materials (map of id → count).
  function hasMaterials(player, mats) {
    for (const k in mats) if (bagCount(player, k) < mats[k]) return false;
    return true;
  }
  function spendMaterials(player, mats) {
    if (!hasMaterials(player, mats)) return false;
    for (const k in mats) bagSpend(player, k, mats[k]);
    if (Inventory.open) Inventory.render();
    return true;
  }
  // A short "3 🪵 · 2 💧" summary of a material cost map.
  function matSummary(mats) {
    return Object.keys(mats).map((k) => `${mats[k]} ${(MATERIALS[k] || {}).icon || k}`).join(" · ");
  }

  // ---- Castle relics ------------------------------------------------------
  function addRelic(player, id) {
    if (!RELICS[id]) return;
    if (!player.relics.includes(id)) {
      player.relics.push(id);
      // Lifetime tally for the end-screen recap (relics are consumed when the
      // castle is built, so we count them as they're found, not just held).
      if (stateRef) stateRef.relicsFound = (stateRef.relicsFound | 0) + 1;
    }
    updateRelicHud(player);
  }
  const hasRelic = (player, id) => player.relics.includes(id);

  // ---- Crafting -----------------------------------------------------------
  // Spend a recipe's materials to produce its output (potions + gear both go to
  // the UNIFIED bag now). Returns true on success.
  function craftRecipe(player, recipe) {
    const def = getDef(recipe.out);
    if (!def) return false;
    if (!hasMaterials(player, recipe.mats)) { toast(t("toast.noMaterials")); Sfx.play("error"); return false; }
    // A potion stacks into an existing stack (no new slot); gear (and a potion
    // that would need a brand-new slot) needs a free bag slot.
    const needsSlot = def.type !== "potion" || !player.inventory.some((it) => it && it.id === recipe.out && it.count < STACK_MAX);
    if (needsSlot && player.inventory.length >= player.invCap) { toast(t("toast.bagFull")); Sfx.play("error"); return false; }
    if (def.type === "potion") bagAdd(player, recipe.out, 1);
    else invAdd(player, makeLoot(recipe.out));
    spendMaterials(player, recipe.mats);
    updatePotionBar(player);
    if (Inventory.open) Inventory.render();
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
      // Potions + materials stack into the bag; gear gets a rolled instance.
      if (isStackable(reward.item)) bagAdd(player, reward.item, 1);
      else invAdd(player, makeLoot(reward.item));
      updatePotionBar(player);
    }
    if (reward.relic) addRelic(player, reward.relic);
  }

  // ---- DOM ---------------------------------------------------------------
  const dom = {
    canvas: document.getElementById("renderCanvas"),
    overlay: document.getElementById("overlay"),
    startBtn: document.getElementById("startBtn"),
    continueBtn: document.getElementById("continueBtn"),
    loadHint: document.getElementById("loadHint"),
    hud: document.getElementById("hud"),
    coins: document.getElementById("coins"),
    shop: document.getElementById("shop"),
    shopClose: document.getElementById("shopClose"),
    shopDone: document.getElementById("shopDone"),
    shopTitle: document.getElementById("shopTitle"),
    shopTagline: document.getElementById("shopTagline"),
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
    invSets: document.getElementById("invSets"),
    invControls: document.getElementById("invControls"),
    invTabGear: document.getElementById("invTabGear"),
    invTabMaterials: document.getElementById("invTabMaterials"),
    invTabPotions: document.getElementById("invTabPotions"),
    invBtn: document.getElementById("invBtn"),
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
    // Save management (Task 18): the "Manage Saves" entry points + the Saves
    // overlay (local slots + cloud section + file export/import).
    savesBtn: document.getElementById("savesBtn"),
    savesBtnP: document.getElementById("savesBtnP"),
    savesOverlay: document.getElementById("savesOverlay"),
    savesClose: document.getElementById("savesClose"),
    savesDone: document.getElementById("savesDone"),
    savesList: document.getElementById("savesList"),
    savesCloudStatus: document.getElementById("savesCloudStatus"),
    savesCloudSignBtn: document.getElementById("savesCloudSignBtn"),
    savesCloudSaveBtn: document.getElementById("savesCloudSaveBtn"),
    savesCloudList: document.getElementById("savesCloudList"),
    savesExportBtn: document.getElementById("savesExportBtn"),
    savesImportBtn: document.getElementById("savesImportBtn"),
    savesImportFile: document.getElementById("savesImportFile"),
    // Durable-session controls (Task 17): clear the saved session + sign-out,
    // on the start screen and pause settings.
    clearSessionBtn: document.getElementById("clearSessionBtn"),
    clearSessionBtnP: document.getElementById("clearSessionBtnP"),
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
    // ---- Display options (pause settings, Task 37) ----
    displayPanel: document.getElementById("displayPanel"),
    fsBtnP: document.getElementById("fsBtnP"),
    // ---- Graphics-quality selector (pause settings) ----
    gfxAuto: document.getElementById("gfxAuto"),
    gfxHigh: document.getElementById("gfxHigh"),
    gfxMedium: document.getElementById("gfxMedium"),
    gfxLow: document.getElementById("gfxLow"),
    gfxHint: document.getElementById("gfxHint"),
    // ---- Customizable control layout editor (Task 36) ----
    layoutEditBtn: document.getElementById("layoutEditBtn"),
    layoutEditBtnP: document.getElementById("layoutEditBtnP"),
    layoutEditor: document.getElementById("layoutEditor"),
    layoutHandles: document.getElementById("layoutHandles"),
    layoutSave: document.getElementById("layoutSave"),
    layoutReset: document.getElementById("layoutReset"),
    layoutCancel: document.getElementById("layoutCancel"),
    layoutHint: document.getElementById("layoutHint"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmText: document.getElementById("confirmText"),
    confirmYes: document.getElementById("confirmYes"),
    confirmNo: document.getElementById("confirmNo"),
    // ---- Adventure HUD: relics, quest tracker, clock, weather ----
    // (Materials moved into the unified bag in Task 21 — no on-HUD chip strip.)
    relicBar: document.getElementById("relicBar"),
    questTracker: document.getElementById("questTracker"),
    clock: document.getElementById("clock"),
    weather: document.getElementById("weather"),
    craftBtn: document.getElementById("craftBtn"),
    questBtn: document.getElementById("questBtn"),
    skillsBtn: document.getElementById("skillsBtn"),
    // ---- Skills, leveling & focus HUD (Task 14) ----
    levelBadge: document.getElementById("levelBadge"),
    xpWrap: document.getElementById("xpWrap"),
    xpFill: document.getElementById("xpFill"),
    focusWrap: document.getElementById("focusWrap"),
    focusFill: document.getElementById("focusFill"),
    skillBar: document.getElementById("skillBar"),
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
    // ---- Skills & fusion overlay (Task 14) ----
    skills: document.getElementById("skills"),
    skillsClose: document.getElementById("skillsClose"),
    skillsDone: document.getElementById("skillsDone"),
    skillsHeader: document.getElementById("skillsHeader"),
    skillsToolbar: document.getElementById("skillsToolbar"),
    skillsFusion: document.getElementById("skillsFusion"),
    skillsList: document.getElementById("skillsList"),
    // ---- Minimap, compass + full world map (Task 13) ----
    minimap: document.getElementById("minimap"),
    minimapCanvas: document.getElementById("minimapCanvas"),
    compass: document.getElementById("compass"),
    compassArrow: document.getElementById("compassArrow"),
    compassLabel: document.getElementById("compassLabel"),
    worldmap: document.getElementById("worldmap"),
    mapClose: document.getElementById("mapClose"),
    mapDone: document.getElementById("mapDone"),
    mapTabZone: document.getElementById("mapTabZone"),
    mapTabWorld: document.getElementById("mapTabWorld"),
    mapSearch: document.getElementById("mapSearch"),
    mapZoomIn: document.getElementById("mapZoomIn"),
    mapZoomOut: document.getElementById("mapZoomOut"),
    mapCanvas: document.getElementById("mapCanvas"),
    mapResults: document.getElementById("mapResults"),
    mapSelInfo: document.getElementById("mapSelInfo"),
    mapGuideBtn: document.getElementById("mapGuideBtn"),
    mapClearBtn: document.getElementById("mapClearBtn"),
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
    // Defensive: a disposed/stale node (e.g. left over across a zone swap) must
    // never throw or return NaN here, or it could break selection of the valid
    // nodes around it — it just sorts to the back as unreachable.
    distanceTo(p) {
      try {
        const pos = this.position;
        const d = pos ? BABYLON.Vector3.Distance(pos, p) : Infinity;
        return isFinite(d) ? d : Infinity;
      } catch (e) { return Infinity; }
    }
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
  // Swing — a tiny, dt-driven attack/gather animation state machine. It gives
  // every action a readable ANTICIPATION → IMPACT → RECOVERY arc by owning only
  // the timing (phase + elapsed time); the Player maps the phase onto limb poses.
  // The combat hit still lands the instant tryCast() fires, so this only changes
  // how an action LOOKS, never when it deals damage. Pure, frame-rate independent
  // (carries leftover time across phase edges) and headless-safe — no DOM/Babylon.
  // =========================================================================
  const SWING_DUR = {
    melee:  { windup: 0.11, strike: 0.12, recover: 0.21 }, // a wide weapon arc
    ranged: { windup: 0.07, strike: 0.07, recover: 0.16 }, // a quick wand thrust
    gather: { windup: 0.16, strike: 0.14, recover: 0.24 }, // a deliberate chop/reach
  };
  const SWING_PHASES = ["windup", "strike", "recover"];
  class Swing {
    constructor() { this.kind = null; this.phase = "idle"; this.t = 0; }
    // Begin an action; an unknown kind defaults to a melee arc.
    trigger(kind) {
      this.kind = SWING_DUR[kind] ? kind : "melee";
      this.phase = "windup"; this.t = 0;
      return this;
    }
    // Advance the machine by dt, rolling leftover time into the next phase so the
    // total timing is exact at any frame rate. Returns the (possibly new) phase.
    update(dt) {
      if (this.phase === "idle") return "idle";
      const d = SWING_DUR[this.kind];
      this.t += (dt > 0 ? dt : 0);
      let guard = 8; // can't cross more than 3 edges; guard against a huge dt
      while (this.phase !== "idle" && this.t >= d[this.phase] && guard-- > 0) {
        this.t -= d[this.phase];
        const i = SWING_PHASES.indexOf(this.phase);
        this.phase = SWING_PHASES[i + 1] || "idle";
      }
      if (this.phase === "idle") { this.t = 0; this.kind = null; }
      return this.phase;
    }
    get busy() { return this.phase !== "idle"; }
    get striking() { return this.phase === "strike"; }
    // 0..1 progress through the CURRENT phase (0 when idle).
    progress() {
      if (this.phase === "idle") return 0;
      const dur = SWING_DUR[this.kind][this.phase] || 1;
      return Math.max(0, Math.min(1, this.t / dur));
    }
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
      this.swing = new Swing();  // anticipation→impact→recovery action animation
      this.flinch = 0;           // 1→0 recoil timer set when struck
      // Base stats before any gear. recomputeStats() layers equipment on top.
      this.base = { maxHealth: CONFIG.maxHealth, speed: CONFIG.moveSpeed };
      this.maxHealth = CONFIG.maxHealth;
      this.health = CONFIG.maxHealth;
      this.damageReduction = 0;  // 0..0.75, summed from armour/accessories
      this.lifesteal = 0;        // HP restored per sweet defeated
      this.world = null;         // set after construction; used for scenery collision

      // Inventory + equipment. The active weapon profile (this.weapon) is
      // derived from the equipped hands by recomputeStats(); FISTS until then.
      // The bag is UNIFIED (Task 21): gear AND stackable potions/materials share
      // these 30 slots; the 3 potion quick-slots are an assignment over the bag.
      this.invCap = 30;
      this.inventory = [];       // owned items: gear instances + { id, uid, count } stacks
      this.equipment = { helmet: null, pauldrons: null, breastplate: null, gloves: null,
                         belt: null, boots: null, cloak: null, necklace: null,
                         ring1: null, ring2: null, hand1: null, hand2: null };
      this.potionSlots = [null, null, null]; // the 3 combat quick-slots → potion ids
      this.buffs = [];           // active timed potion buffs
      this.weapon = cloneWeapon(FISTS);

      // Adventure state: collected castle relics (materials live in the bag now).
      this.relics = [];          // relic ids collected but not yet built in

      // Skill & leveling progression (Task 14): level/xp, the focus resource, the
      // owned + fused skills, the 3-slot quick bar and per-skill cooldowns. Lives
      // on the player so it serializes with the rest of the run.
      this.progress = newProgress();

      this._build(scene, shadow);
    }

    // Give the player their starting gear: a Magic Wand in hand, a Leather Cap
    // and Iron Dagger in the bag to try out the inventory immediately.
    setupStartingLoadout() {
      this.equipment.hand1 = makeItem("magic_wand");
      this.inventory.push(makeItem("leather_cap"));
      this.inventory.push(makeItem("iron_dagger"));
      // A couple of starter potions in the bag, pre-assigned to quick-slot 1 so
      // the player can heal from the first wave (drag others in from the bag).
      bagAdd(this, "minor_potion", 2);
      assignPotionSlot(this, 0, "minor_potion");
      // Learn the level-1 skill(s) + slot the first on the quick bar.
      Skills.init(this);
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

      // ---- Visible worn gear (helmet, pauldrons, chest, gloves, belt, boots,
      // cloak), built once + toggled/recoloured on equip so it never leaks. ----
      this._buildWornGear(scene, shadow);

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

    // Build every worn-gear mesh once (hidden), parented to the body part it rides
    // so it animates for free; refreshWornGear() then toggles + recolours them by
    // what's equipped. Tier-gated via wornDetailFor(); headless-safe (all meshes go
    // through the proven mesh/material helpers).
    _buildWornGear(scene, shadow) {
      const spec = (this._wornSpec = wornDetailFor((typeof Quality !== "undefined" && Quality.tier) || "high"));
      const g = (this.gear = {});
      this.gearShown = {};
      const cast = (m) => { try { shadow.addShadowCaster(m); } catch (e) {} return m; };
      const off = (m) => { try { m.setEnabled(false); } catch (e) {} return m; };
      const tone = "#9fb0c8"; // neutral steel base; refreshWornGear tints by rarity

      // Helmet — a distinct, real-looking head piece per item (Task 25). The
      // `helmet` anchor stays a single, stable TransformNode (so equip/unequip only
      // toggles it — no realloc/leak); under it we pre-build EVERY archetype once
      // and refreshWornGear() enables the one the equipped helmet maps to.
      const helmet = new BABYLON.TransformNode("gearHelmet", scene);
      helmet.parent = this.lean; helmet.position.set(0, 1.88, 0.02);
      g.helmet = helmet; off(helmet);
      this._buildHelmets(scene, helmet, spec, cast, off);
      // Back-compat: keep g.helmetMat pointing at a material so any old caller that
      // paints it still works; refreshWornGear paints the ACTIVE archetype's set.
      g.helmetMat = g.helms.open.mats[0];

      // Breastplate — a distinct, layered torso piece per item (Task 26). The
      // `chest` anchor stays a single, stable TransformNode (so equip/unequip only
      // toggles it — no realloc/leak); under it we pre-build EVERY archetype once
      // and refreshWornGear() enables the one the equipped breastplate maps to.
      const chest = new BABYLON.TransformNode("gearChest", scene);
      chest.parent = this.lean; chest.position.set(0, 1.16, 0.02);
      g.chest = chest; off(chest);
      this._buildChests(scene, chest, spec, cast, off);
      // Back-compat: keep g.chestMat pointing at a material so any old caller that
      // paints it still works; refreshWornGear paints the ACTIVE archetype's set.
      g.chestMat = g.chests.vest.mats[0];

      // Belt — a distinct, real belt per item (Task 29): a strap + buckle (+ pouches/
      // plates by set/material), seated at the WAIST below the chest piece (Task 26)
      // instead of the old plain cylinder that overlapped the chest band. The `belt`
      // anchor stays a single, stable TransformNode (so equip/unequip only toggles it —
      // no realloc/leak); under it we pre-build EVERY archetype once and
      // refreshWornGear() enables the one the equipped belt maps to. Tier-gated:
      // dropped entirely on the low tier (a clean omission), like the old cylinder.
      if (spec.belt) {
        const belt = new BABYLON.TransformNode("gearBelt", scene);
        // The chest anchor sits at lean-y 1.16 and the chest envelope's LOWEST parts
        // reach down to ≈ lean-y 0.80 (the Ironguard cuirass fauld). Seat the belt
        // anchor at lean-y 0.72 with every part's TOP kept at/below ≈ lean-y 0.79 so
        // the band tucks UNDER the chest and never z-fights it; hanging pouches /
        // tassets drop in −y (further from the chest, over the thighs).
        belt.parent = this.lean; belt.position.set(0, 0.72, 0);
        g.belt = belt; off(belt);
        this._buildBelt(scene, belt, spec, cast, off);
        // Back-compat: keep g.beltMat pointing at a material so any old caller that
        // paints it still works; refreshWornGear paints the ACTIVE archetype's set.
        g.beltMat = g.belts.strap.mats[0];
      }

      // Pauldrons — a distinct, real shoulder piece per item (Task 27), seated ON
      // the shoulder joint (not diving into the chest). Each shoulder gets its own
      // pivot (child of the arm, so it swings with the attack) under which EVERY
      // archetype is pre-built once; refreshWornGear() reveals the equipped one.
      // Tier-gated: dropped entirely on the low tier (a clean omission).
      if (spec.pauldrons) this._buildPauldrons(scene, spec, cast, off);

      // Gloves — a distinct, real hand piece per item (Task 28), wrapped around the
      // hand + wrist (rides each arm, so it follows the hand through the attack). Each
      // archetype is pre-built once per hand under the arm; refreshWornGear() reveals
      // the equipped pair. Kept compact around the hand so it never engulfs the grip.
      this._buildGloves(scene, spec, cast, off);

      // Boots — calf cuffs over the shoes (ride the leg pivots, so they stride).
      const btMat = emat(scene, "gearBootM", tone, 0.06);
      g.boots = []; g.bootMat = btMat;
      for (const leg of [this.legL, this.legR]) {
        const boot = cyl(scene, "gearBoot", 0.28, 0.33, 0.36, btMat);
        boot.parent = leg; boot.position.set(0, -0.5, 0.02); cast(boot); off(boot);
        g.boots.push(boot);
      }

      // Cloak — hangs from the upper back and billows when moving (tier-gated sway).
      if (spec.cloak) {
        const clMat = emat(scene, "gearCloakM", tone, 0.06);
        const pivot = new BABYLON.TransformNode("cloakPivot", scene);
        pivot.parent = this.lean; pivot.position.set(0, 1.5, -0.3);
        const cloak = box(scene, "gearCloak", 0.78, 1.15, 0.05, clMat);
        cloak.parent = pivot; cloak.position.set(0, -0.55, 0); cast(cloak);
        this.cloakPivot = pivot; g.cloak = cloak; g.cloakMat = clMat; off(cloak);
      }

      this.refreshWornGear();
    }

    // Build one procedural mesh group per helmet archetype (Task 25), all parented
    // to the shared `helmet` anchor and hidden; refreshWornGear() shows the one the
    // equipped helmet maps to. Each group tracks its own material list so the rarity
    // recolour/sheen (paint()) can tint the whole helm. Shapes are seated on the
    // head (anchor at lean-y 1.88, head centre ≈ local y −0.13) so nothing covers
    // the eyes (local z ≈ +0.25) or the ponytails (local y ≈ +0.14, z −0.06).
    // Tier-gated: the low tier gets a simpler shell (`spec.helmDetail === false`).
    _buildHelmets(scene, anchor, spec, cast, off) {
      const detail = spec.helmDetail !== false; // full trims only above the low tier
      const g = this.gear;
      const helms = (g.helms = {});
      let uid = 0;
      // A fresh emissive material for a helmet part; base tint by the archetype's
      // material, tracked so paint() can recolour the whole helm on equip.
      const hmat = (mats, key, emissive) => {
        const m = emat(scene, "gearHelm" + key + uid++, HELM_MATERIAL_TINT[key] || "#9fb0c8", emissive == null ? 0.06 : emissive);
        mats.push(m); return m;
      };
      // A shell segment (rounded box) attached to a group node.
      const shell = (node, name, w, h, d, m) => { const x = box(scene, name, w, h, d, m); x.parent = node; cast(x); return x; };
      const dome = (node, name, dia, m) => { const x = sphere(scene, name, dia, m); x.parent = node; cast(x); return x; };
      // Make + register an archetype group under the anchor.
      const group = (key) => {
        const node = new BABYLON.TransformNode("helm_" + key, scene);
        node.parent = anchor; const mats = [];
        helms[key] = { node, mats }; off(node); return { node, mats };
      };

      // -- CAP: a soft rounded cap hugging the crown + a small stitched brim. --
      {
        const { node, mats } = group("cap");
        const capM = hmat(mats, "leather", 0.05);
        const crown = dome(node, "capCrown", 1.06, capM);
        crown.position.set(0, -0.02, -0.04); crown.scaling.set(1.02, 0.82, 1.08);
        const brim = disc(scene, "capBrim", 0.42, capM); brim.parent = node; brim.rotation.x = Math.PI / 2; brim.position.set(0, -0.2, 0.18); cast(brim);
        if (detail) { // a rolled band around the base
          const band = cyl(scene, "capBand", 1.02, 1.02, 0.14, hmat(mats, "cloth", 0.04)); band.parent = node; band.position.set(0, -0.16, -0.04); band.scaling.z = 1.06; cast(band); }
      }

      // -- OPEN HELM: a metal skull cap with a nasal bar + hinged cheek guards. --
      {
        const { node, mats } = group("open");
        const steelM = hmat(mats, "iron", 0.06);
        const cap = dome(node, "openCap", 1.02, steelM); cap.position.set(0, 0.0, -0.04); cap.scaling.set(1.0, 0.9, 1.06);
        const rim = cyl(scene, "openRim", 1.04, 1.08, 0.12, steelM); rim.parent = node; rim.position.set(0, -0.14, -0.04); rim.scaling.z = 1.05; cast(rim);
        // Nasal bar down the brow — sits ABOVE the eyes (local y stays > -0.16).
        const nasal = shell(node, "openNasal", 0.1, 0.34, 0.12, steelM); nasal.position.set(0, -0.16, 0.44); nasal.rotation.x = 0.12;
        if (detail) {
          for (const s of [-1, 1]) { // cheek guards down each side of the face
            const cheek = shell(node, "openCheek", 0.12, 0.34, 0.24, steelM);
            cheek.position.set(0.34 * s, -0.24, 0.28); cheek.rotation.z = 0.18 * s;
          }
          const crest = shell(node, "openCrest", 0.08, 0.14, 0.7, hmat(mats, "gold", 0.14)); crest.position.set(0, 0.34, -0.06); // a low comb ridge
        }
      }

      // -- GREAT HELM: a full enclosing helm with a horizontal visor slit. --
      {
        const { node, mats } = group("great");
        const plateM = hmat(mats, "steel", 0.06);
        const barrel = cyl(scene, "greatBarrel", 1.02, 1.12, 0.66, plateM); barrel.parent = node; barrel.position.set(0, -0.04, -0.02); barrel.scaling.z = 1.02; cast(barrel);
        const top = dome(node, "greatTop", 1.06, plateM); top.position.set(0, 0.22, -0.02); top.scaling.set(1.0, 0.62, 1.0);
        // The dark visor slit across the front (a thin recessed band).
        const slit = shell(node, "greatSlit", 0.62, 0.08, 0.06, emat(scene, "gearHelmSlit" + uid++, "#181c22", 0.0));
        slit.position.set(0, -0.06, 0.54); mats.push(slit.material);
        if (detail) {
          const brow = shell(node, "greatBrow", 0.66, 0.1, 0.12, plateM); brow.position.set(0, 0.06, 0.5); // brow reinforce above the slit
          const rivet = shell(node, "greatRidge", 0.06, 0.5, 0.12, hmat(mats, "gold", 0.12)); rivet.position.set(0, -0.16, 0.52); // vertical breather ridge
        }
      }

      // -- DRAGON HELM: a finned/horned helm — sweeping horns + a scaled crest. --
      {
        const { node, mats } = group("dragon");
        const scaleM = hmat(mats, "dragonscale", 0.08);
        const cap = dome(node, "dragCap", 1.04, scaleM); cap.position.set(0, 0.0, -0.04); cap.scaling.set(1.02, 0.9, 1.08);
        const rim = cyl(scene, "dragRim", 1.06, 1.12, 0.12, scaleM); rim.parent = node; rim.position.set(0, -0.14, -0.04); rim.scaling.z = 1.05; cast(rim);
        const snout = shell(node, "dragSnout", 0.26, 0.2, 0.2, scaleM); snout.position.set(0, -0.18, 0.46); snout.rotation.x = 0.1; // a short brow guard
        const hornM = hmat(mats, "gold", 0.1);
        for (const s of [-1, 1]) { // curved horns sweeping up + back off the temples
          const horn = cone(scene, "dragHorn", 0.2, 0.02, 0.7, hornM); horn.parent = node; cast(horn);
          horn.position.set(0.34 * s, 0.18, -0.02); horn.rotation.z = 0.7 * s; horn.rotation.x = -0.5;
          if (detail) { const tip = cone(scene, "dragHornT", 0.09, 0.01, 0.32, hornM); tip.parent = node; cast(tip); tip.position.set(0.56 * s, 0.5, -0.16); tip.rotation.z = 0.95 * s; tip.rotation.x = -0.7; }
        }
        if (detail) { // a row of small fins down the centre crest
          for (let i = 0; i < 3; i++) { const fin = cone(scene, "dragFin", 0.12, 0.01, 0.2 - i * 0.03, hornM); fin.parent = node; cast(fin); fin.position.set(0, 0.3 - i * 0.02, -0.12 - i * 0.16); fin.rotation.x = -0.35; }
        }
      }

      // -- CROWN: a banded great-crown with points + a centre gem (legendary). --
      {
        const { node, mats } = group("crown");
        const capM = hmat(mats, "cloth", 0.05);
        const cap = dome(node, "crownCap", 0.98, capM); cap.position.set(0, 0.02, -0.04); cap.scaling.set(1.0, 0.78, 1.06); // a soft coif under the band
        const goldM = hmat(mats, "gold", 0.16);
        const band = cyl(scene, "crownBand", 1.06, 1.06, 0.22, goldM); band.parent = node; band.position.set(0, 0.02, -0.02); band.scaling.z = 1.04; cast(band);
        const pts = detail ? 8 : 5;
        for (let i = 0; i < pts; i++) { // a ring of points around the band
          const a = (i / pts) * Math.PI * 2;
          const pt = cone(scene, "crownPt", 0.12, 0.01, 0.24, goldM); pt.parent = node; cast(pt);
          pt.position.set(Math.sin(a) * 0.5, 0.2, Math.cos(a) * 0.5 - 0.02);
        }
        // A glowing centre gem at the brow.
        const gem = BABYLON.MeshBuilder.CreatePolyhedron("crownGem", { type: 1, size: 0.12 }, scene);
        gem.material = gloss(hmat(mats, "gold", 0.3), 0.2, 0.1); gem.parent = node; gem.position.set(0, 0.04, 0.52); cast(gem);
      }
    }

    // Build one procedural mesh group per chest archetype (Task 26), all parented
    // to the shared `chest` anchor (seated on the torso at lean-y 1.16, so local
    // y=0 is torso centre) and hidden; refreshWornGear() shows the one the equipped
    // breastplate maps to. Each group tracks its own material list so the rarity
    // recolour/sheen (paint()) can tint the whole piece. The torso cylinder spans
    // local y −0.33..+0.37, arms pivot at x ±0.32 and the neck/head begins ≈ local
    // y +0.34; every shell stays within x half-width ≈ 0.30 and below local y ≈
    // +0.30 so it never bites the arms or the neck, and its base sits at ≈ local
    // y −0.18 (level with the belt band) — the belt (Task 29) rides just below and
    // the pauldrons (Task 27) sit out on the shoulders, so a full suit reads as one.
    // Tier-gated: the low tier drops the finer straps/lames (`spec.chestDetail`).
    _buildChests(scene, anchor, spec, cast, off) {
      const detail = spec.chestDetail !== false; // full trims only above the low tier
      const g = this.gear;
      const chests = (g.chests = {});
      let uid = 0;
      // A fresh emissive material for a chest part; base tint by the archetype's
      // material, tracked so paint() can recolour the whole piece on equip.
      const cmat = (mats, key, emissive) => {
        const m = emat(scene, "gearChest" + key + uid++, CHEST_MATERIAL_TINT[key] || "#9fb0c8", emissive == null ? 0.06 : emissive);
        mats.push(m); return m;
      };
      // Layered primitive helpers attached to a group node.
      const shell = (node, name, w, h, d, m) => { const x = box(scene, name, w, h, d, m); x.parent = node; cast(x); return x; };
      const tube = (node, name, top, bot, h, m) => { const x = cyl(scene, name, top, bot, h, m); x.parent = node; cast(x); return x; };
      const ball = (node, name, dia, m) => { const x = sphere(scene, name, dia, m); x.parent = node; cast(x); return x; };
      // Make + register an archetype group under the anchor.
      const group = (key) => {
        const node = new BABYLON.TransformNode("chest_" + key, scene);
        node.parent = anchor; const mats = [];
        chests[key] = { node, mats }; off(node); return { node, mats };
      };
      // A pair of shoulder straps crossing the chest — shared by the layered
      // armours so a set reads consistently; kept thin so pauldrons sit clear.
      const straps = (node, m) => {
        for (const s of [-1, 1]) {
          const st = shell(node, "chestStrap", 0.12, 0.5, 0.1, m);
          st.position.set(0.2 * s, 0.06, 0.2); st.rotation.z = 0.16 * s;
        }
      };

      // -- VEST: a soft layered leather/cloth jerkin — a rounded shell, a laced
      //    front seam + a shoulder yoke. The default (leather_vest). --
      {
        const { node, mats } = group("vest");
        const hideM = cmat(mats, "leather", 0.05);
        const shellM = tube(node, "vestShell", 0.66, 0.78, 0.66, hideM);
        shellM.scaling.z = 0.82; shellM.position.y = 0;
        const yoke = tube(node, "vestYoke", 0.7, 0.68, 0.16, hideM); // a collar yoke over the shoulders
        yoke.scaling.z = 0.86; yoke.position.y = 0.28;
        if (detail) {
          const lace = shell(node, "vestLace", 0.06, 0.56, 0.06, cmat(mats, "cloth", 0.04)); // a central laced seam
          lace.position.set(0, 0, 0.3);
          for (let i = 0; i < 3; i++) { // stitched cross-laces
            const x = shell(node, "vestX", 0.22, 0.03, 0.05, mats[mats.length - 1]); x.parent = node; cast(x);
            x.position.set(0, 0.16 - i * 0.16, 0.31);
          }
        }
      }

      // -- CUIRASS: a segmented banded iron cuirass — a breast shell over stacked
      //    horizontal lames + shoulder straps (Ironguard: iron_plate). --
      {
        const { node, mats } = group("cuirass");
        const ironM = cmat(mats, "iron", 0.06);
        const breast = tube(node, "cuirBreast", 0.6, 0.72, 0.4, ironM); // the upper chest plate
        breast.scaling.z = 0.84; breast.position.y = 0.12;
        const ridge = shell(node, "cuirRidge", 0.08, 0.42, 0.1, ironM); // a central keel ridge
        ridge.position.set(0, 0.12, 0.3);
        const lames = detail ? 3 : 2; // stacked abdominal bands (fauld)
        for (let i = 0; i < lames; i++) {
          const lame = tube(node, "cuirLame", 0.7 - i * 0.02, 0.74 - i * 0.02, 0.12, ironM);
          lame.scaling.z = 0.86; lame.position.y = -0.06 - i * 0.12;
        }
        straps(node, cmat(mats, "leather", 0.04));
        if (detail) { // riveted gorget ring at the throat
          const gorget = tube(node, "cuirGorget", 0.5, 0.52, 0.1, ironM); gorget.scaling.z = 0.9; gorget.position.y = 0.3;
        }
      }

      // -- PLATE: an ornate polished aegis — a sculpted breastplate, a gorget, a
      //    trimmed hem + an embossed emblem (aegis_plate / phoenix_plate). --
      {
        const { node, mats } = group("plate");
        const steelM = cmat(mats, "steel", 0.06);
        const trimM = cmat(mats, "gold", detail ? 0.14 : 0.08);
        const breast = tube(node, "plateBreast", 0.64, 0.78, 0.56, steelM);
        breast.scaling.z = 0.84; breast.position.y = 0.04;
        // Sculpted pectoral swells for a heroic silhouette.
        for (const s of [-1, 1]) { const pec = ball(node, "platePec", 0.34, steelM); pec.position.set(0.16 * s, 0.1, 0.22); pec.scaling.set(1, 0.9, 0.6); }
        const gorget = tube(node, "plateGorget", 0.52, 0.54, 0.12, trimM); gorget.scaling.z = 0.9; gorget.position.y = 0.3; // gold throat guard
        const hem = tube(node, "plateHem", 0.8, 0.82, 0.1, trimM); hem.scaling.z = 0.86; hem.position.y = -0.24; // gold hem band
        if (detail) {
          const emblem = BABYLON.MeshBuilder.CreatePolyhedron("plateEmblem", { type: 0, size: 0.14 }, scene); // an embossed diamond boss
          emblem.material = gloss(trimM, 0.2, 0.4); emblem.parent = node; cast(emblem); emblem.position.set(0, 0.06, 0.32);
          straps(node, trimM);
        }
      }

      // -- DRAGONSCALE: overlapping scale rows sweeping up the torso + a glowing
      //    chest gem, spined collar (Dragonscale: dragonscale_plate). --
      {
        const { node, mats } = group("dragonscale");
        const scaleM = cmat(mats, "dragonscale", 0.08);
        const shellM = tube(node, "dsShell", 0.64, 0.76, 0.6, scaleM);
        shellM.scaling.z = 0.82;
        // Overlapping rows of scales (small flattened balls) climbing the front.
        const rows = detail ? 4 : 2, perRow = detail ? 5 : 3;
        for (let r = 0; r < rows; r++) {
          for (let i = 0; i < perRow; i++) {
            const sc = ball(node, "dsScale", 0.18, scaleM);
            const x = (i - (perRow - 1) / 2) * 0.13 + (r % 2 ? 0.065 : 0);
            sc.position.set(x, 0.18 - r * 0.13, 0.28); sc.scaling.set(1, 1, 0.5);
          }
        }
        const collarM = cmat(mats, "gold", 0.12);
        if (detail) for (const s of [-1, 1]) { // a pair of small shoulder spines
          const spine = cone(scene, "dsSpine", 0.08, 0.01, 0.26, collarM); spine.parent = node; cast(spine);
          spine.position.set(0.24 * s, 0.28, 0.06); spine.rotation.z = 0.5 * s; spine.rotation.x = -0.3;
        }
        // A glowing gem set in the sternum.
        const gem = BABYLON.MeshBuilder.CreatePolyhedron("dsGem", { type: 1, size: 0.11 }, scene);
        gem.material = gloss(cmat(mats, "gold", 0.3), 0.2, 0.1); gem.parent = node; cast(gem); gem.position.set(0, 0.12, 0.32);
      }

      // -- ROBE: a flowing layered cloth robe — a soft bodice, a draped over-mantle
      //    + a sash (for cloth breastplates; no shipped item yet, but the selector
      //    resolves any cloth def here so it always has a mesh). --
      {
        const { node, mats } = group("robe");
        const clothM = cmat(mats, "cloth", 0.05);
        const bodice = tube(node, "robeBodice", 0.62, 0.82, 0.68, clothM);
        bodice.scaling.z = 0.84;
        const mantle = tube(node, "robeMantle", 0.74, 0.6, 0.3, clothM); // a draped over-mantle on the shoulders
        mantle.scaling.z = 0.88; mantle.position.y = 0.22;
        if (detail) {
          const sash = shell(node, "robeSash", 0.5, 0.14, 0.06, cmat(mats, "gold", 0.08)); // a gold sash across the chest
          sash.position.set(0, -0.04, 0.3); sash.rotation.z = 0.18;
          const trim = tube(node, "robeTrim", 0.66, 0.86, 0.08, mats[mats.length - 1]); trim.scaling.z = 0.86; trim.position.y = -0.28; // hem trim
        }
      }
    }

    // Build one procedural mesh group per pauldron archetype (Task 27) on EACH
    // shoulder, hidden; refreshWornGear() shows the pair the equipped pauldrons map
    // to. The fix for the old inward clip is the ANCHOR: the old sphere was parented
    // to the ARM pivot, so the melee roll (armR.z → +1.2) swung it across the chest.
    // A real pauldron is strapped to the SHOULDER, not the upper arm — so each
    // shoulder gets its own pivot parented to `lean` (the torso), seated just outside
    // the torso surface (lean-x ±0.44, torso half-width ≈0.23 at shoulder height).
    // _animatePauldrons() then drives the pivot to follow a FRACTION of the arm's
    // forward/back PITCH (so it still reads as connected to the arm through the swing)
    // and IGNORES the arm's roll entirely. Because pitch is a rotation about X it
    // never changes the piece's x-extent, so no pose can dive it into the chest — the
    // shoulder-fit invariant is structural, not tuned. Each archetype group tracks its
    // material list so the rarity paint() recolours the whole shoulder. Tier-gated.
    _buildPauldrons(scene, spec, cast, off) {
      const detail = spec.pauldronDetail !== false; // full lames/spines above low tier
      const g = this.gear;
      // Per-archetype record: { nodes:[Lnode,Rnode], mats:[...both], meshes:[...both] }.
      const pauls = (g.pauls = {});
      this.shoulderPivots = [];
      g.pauldronMat = null; // superseded by per-archetype mats (kept for back-compat)
      let uid = 0;
      const arms = [
        { arm: this.armL, s: -1 }, // left shoulder: outward is -x
        { arm: this.armR, s: 1 },  // right shoulder: outward is +x
      ];
      // A shoulder pivot per side, parented to `lean` at the shoulder joint just
      // outside the torso. Its pitch is driven per-frame in _animatePauldrons() from
      // the matching arm; we stash the pivot + its arm.
      const pivots = arms.map(({ arm, s }) => {
        const pv = new BABYLON.TransformNode("shoulderP" + (s < 0 ? "L" : "R"), scene);
        pv.parent = this.lean; pv.position.set(0.44 * s, 1.46, 0);
        this.shoulderPivots.push({ pivot: pv, arm, s });
        return pv;
      });
      // A fresh emissive material for a pauldron part; base tint by the archetype's
      // material, tracked (across BOTH shoulders) so paint() recolours the pair.
      const pmat = (mats, key, emissive) => {
        const m = emat(scene, "gearPaul" + key + uid++, PAULDRON_MATERIAL_TINT[key] || "#9fb0c8", emissive == null ? 0.06 : emissive);
        mats.push(m); return m;
      };
      // `meshes` collects every built part (both shoulders) so tests can sample the
      // real geometry (torso-envelope invariant) and the leak test can track them.
      let curMeshes = null;
      const track = (x) => { if (curMeshes) curMeshes.push(x); cast(x); return x; };
      // Register an archetype: build its group on BOTH shoulders via `build(node, s, mats)`.
      const arch = (key, build) => {
        const nodes = []; const mats = []; const meshes = [];
        pivots.forEach((pv, i) => {
          const node = new BABYLON.TransformNode("paul_" + key + (i ? "R" : "L"), scene);
          node.parent = pv; off(node);
          curMeshes = meshes;
          build(node, arms[i].s, mats);
          curMeshes = null;
          nodes.push(node);
        });
        pauls[key] = { nodes, mats, meshes };
      };
      // Layered primitive helpers attached to a group node (each tracked for tests).
      const shell = (node, name, w, h, d, m) => { const x = box(scene, name, w, h, d, m); x.parent = node; return track(x); };
      const dome = (node, name, dia, m) => { const x = sphere(scene, name, dia, m); x.parent = node; return track(x); };
      const spike = (node, name, bot, h, m) => { const x = cone(scene, name, bot, 0.01, h, m); x.parent = node; return track(x); };
      const band = (node, name, top, bot, h, m) => { const x = cyl(scene, name, top, bot, h, m); x.parent = node; return track(x); };

      // -- CAP: a soft rounded leather shoulder cap (leather_pauldrons). --
      arch("cap", (node, s, mats) => {
        const capM = pmat(mats, "leather", 0.05);
        const cap = dome(node, "paulCap", 0.46, capM);
        // Flat + outboard: dome centre pulled outward, squashed in y so it hugs the
        // shoulder instead of ballooning inward over the neck.
        cap.position.set(0.05 * s, 0.0, 0); cap.scaling.set(1.0, 0.66, 1.02);
        if (detail) { // a rolled leather trim around the rim
          const trim = band(node, "paulCapTrim", 0.5, 0.52, 0.12, pmat(mats, "cloth", 0.04));
          trim.rotation.x = Math.PI / 2; trim.position.set(0.05 * s, -0.08, 0);
        }
      });

      // -- PLATED: a segmented banded iron cap over stacked lames (Ironguard). --
      arch("plated", (node, s, mats) => {
        const ironM = pmat(mats, "iron", 0.06);
        const cap = dome(node, "paulPlateCap", 0.48, ironM);
        cap.position.set(0.06 * s, 0.03, 0); cap.scaling.set(1.02, 0.6, 1.04);
        const lames = detail ? 3 : 2; // overlapping shoulder lames sweeping down the arm
        for (let i = 0; i < lames; i++) {
          const lame = band(node, "paulPlateLame", 0.5 - i * 0.05, 0.46 - i * 0.05, 0.1, ironM);
          lame.rotation.x = Math.PI / 2;
          lame.position.set(0.06 * s, -0.06 - i * 0.11, 0); lame.scaling.z = 0.9;
        }
        if (detail) { // a raised rivet ridge along the crest
          const ridge = shell(node, "paulPlateRidge", 0.1, 0.1, 0.42, ironM);
          ridge.position.set(0.06 * s, 0.14, 0);
        }
      });

      // -- SPIKED: overlapping dragonscale cap + swept-back spines (Dragonscale). --
      arch("spiked", (node, s, mats) => {
        const scaleM = pmat(mats, "dragonscale", 0.08);
        const cap = dome(node, "paulSpikeCap", 0.46, scaleM);
        cap.position.set(0.1 * s, 0.02, 0); cap.scaling.set(1.02, 0.62, 1.04);
        // Overlapping scale plates climbing the outer shoulder.
        const rows = detail ? 3 : 2;
        for (let r = 0; r < rows; r++) {
          const sc = dome(node, "paulScale", 0.2, scaleM);
          sc.position.set((0.08 + r * 0.02) * s, 0.06 - r * 0.1, 0.0); sc.scaling.set(1, 0.5, 1);
        }
        const spineM = pmat(mats, "gold", 0.12);
        const spines = detail ? 3 : 2; // a fan of swept-back spines off the crown
        for (let i = 0; i < spines; i++) {
          const sp = spike(node, "paulSpine", 0.09, 0.28 - i * 0.04, spineM);
          sp.position.set((0.12 + i * 0.02) * s, 0.12, -0.02 - i * 0.12);
          sp.rotation.z = (0.5 + i * 0.12) * s; sp.rotation.x = -0.5;
        }
      });

      // -- ORNATE: a polished trimmed plate cap + a domed stud (rare, non-set). --
      arch("ornate", (node, s, mats) => {
        const steelM = pmat(mats, "steel", 0.06);
        const trimM = pmat(mats, "gold", detail ? 0.14 : 0.08);
        const cap = dome(node, "paulOrnCap", 0.5, steelM);
        cap.position.set(0.06 * s, 0.02, 0); cap.scaling.set(1.04, 0.62, 1.04);
        const rim = band(node, "paulOrnRim", 0.54, 0.56, 0.1, trimM); // a gold rim band
        rim.rotation.x = Math.PI / 2; rim.position.set(0.06 * s, -0.06, 0); rim.scaling.z = 0.94;
        // A raised central boss stud.
        const boss = dome(node, "paulOrnBoss", 0.2, trimM); boss.position.set(0.08 * s, 0.1, 0); boss.scaling.set(1, 0.7, 1);
        if (detail) { // a lame skirt sweeping onto the upper arm
          const lame = band(node, "paulOrnLame", 0.46, 0.42, 0.1, steelM);
          lame.rotation.x = Math.PI / 2; lame.position.set(0.06 * s, -0.18, 0); lame.scaling.z = 0.9;
        }
      });

      // -- WINGED: a flared great-pauldron with an upswept fin (epic / legendary). --
      arch("winged", (node, s, mats) => {
        const plateM = pmat(mats, "steel", 0.06);
        const trimM = pmat(mats, "gold", detail ? 0.16 : 0.08);
        const cap = dome(node, "paulWingCap", 0.5, plateM);
        cap.position.set(0.12 * s, 0.02, 0); cap.scaling.set(1.04, 0.6, 1.04);
        // A broad flared pauldron plate sweeping out over the arm.
        const flare = band(node, "paulWingFlare", 0.38, 0.58, 0.12, plateM);
        flare.rotation.x = Math.PI / 2; flare.position.set(0.16 * s, -0.06, 0); flare.scaling.z = 0.9;
        // An upswept fin/blade off the crown — the signature "storm" silhouette.
        const fin = spike(node, "paulWingFin", 0.16, 0.42, trimM);
        fin.position.set(0.1 * s, 0.18, -0.04); fin.rotation.z = 0.4 * s; fin.rotation.x = -0.3;
        if (detail) {
          const fin2 = spike(node, "paulWingFin2", 0.1, 0.3, trimM);
          fin2.position.set(0.18 * s, 0.12, -0.14); fin2.rotation.z = 0.7 * s; fin2.rotation.x = -0.4;
          const edge = band(node, "paulWingEdge", 0.62, 0.64, 0.06, trimM); // a gold rim on the flare
          edge.rotation.x = Math.PI / 2; edge.position.set(0.12 * s, -0.12, 0); edge.scaling.z = 0.9;
        }
      });
    }

    // Build one procedural mesh group per glove archetype (Task 28) on EACH hand,
    // hidden; refreshWornGear() shows the pair the equipped gloves map to. Each glove
    // is parented to its ARM pivot (like the little hand sphere it replaces), so it
    // rides the hand through the whole attack automatically — the melee roll/pitch and
    // the ranged thrust all carry it, and it stays attached to the wrist. The pieces
    // are kept COMPACT around the hand (hand centre at arm-local y −0.62; the wand grip
    // sits at arm-local (0,−0.58,+0.12) with the shaft rising in +y): the cuff hugs the
    // wrist just ABOVE the hand (y ≈ −0.5), the back-of-hand shell sits AT the hand with
    // a small forward bias, and the finger hint is a subtle stub BELOW it — nothing
    // reaches up the +y shaft or balloons in +z, so the grip is never engulfed. Each
    // archetype group tracks its own material list so the rarity paint() recolours the
    // whole pair. Always built (core silhouette), but the finer trims are tier-gated.
    _buildGloves(scene, spec, cast, off) {
      const detail = spec.gloveDetail !== false; // finger lames / trims above the low tier
      const g = this.gear;
      // Per-archetype record: { nodes:[Lnode,Rnode], mats:[...both], meshes:[...both] }.
      const gloves = (g.gloves = {});
      g.gloveMat = null; // superseded by per-archetype mats (kept for back-compat)
      let uid = 0;
      const hands = [this.armL, this.armR];
      // A fresh emissive material for a glove part; base tint by the archetype's
      // material, tracked (across BOTH hands) so paint() recolours the pair.
      const gmat = (mats, key, emissive) => {
        const m = emat(scene, "gearGlove" + key + uid++, GLOVE_MATERIAL_TINT[key] || "#9fb0c8", emissive == null ? 0.06 : emissive);
        mats.push(m); return m;
      };
      // `meshes` collects every built part (both hands) so the leak test can track
      // them and the fit test can sample the real geometry.
      let curMeshes = null;
      const track = (x) => { if (curMeshes) curMeshes.push(x); cast(x); return x; };
      // Register an archetype: build its group on BOTH hands via `build(node, mats)`.
      // Each group node sits at the hand (arm-local y −0.62) so a part's local y is
      // relative to the hand centre.
      const arch = (key, build) => {
        const nodes = []; const mats = []; const meshes = [];
        hands.forEach((arm, i) => {
          const node = new BABYLON.TransformNode("glove_" + key + (i ? "R" : "L"), scene);
          node.parent = arm; node.position.set(0, -0.62, 0); off(node);
          curMeshes = meshes;
          build(node, mats);
          curMeshes = null;
          nodes.push(node);
        });
        gloves[key] = { nodes, mats, meshes };
      };
      // Layered primitive helpers attached to a group node (each tracked for tests).
      const shell = (node, name, w, h, d, m) => { const x = box(scene, name, w, h, d, m); x.parent = node; return track(x); };
      const ball = (node, name, dia, m) => { const x = sphere(scene, name, dia, m); x.parent = node; return track(x); };
      const band = (node, name, top, bot, h, m) => { const x = cyl(scene, name, top, bot, h, m); x.parent = node; return track(x); };
      // The finger hint shared by the layered gloves: three short stubs fanned across
      // the front of the hand, angled forward + down so they read as fingers gripping
      // WITHOUT extending into the weapon shaft. Kept subtle so it reads at distance.
      const fingers = (node, m, spread, len) => {
        for (let i = -1; i <= 1; i++) {
          const f = shell(node, "gloveFinger", 0.06, len, 0.09, m);
          f.position.set(i * spread, -0.14, 0.12); f.rotation.x = 0.5;
        }
      };

      // -- GLOVE: a soft cloth/leather glove — a snug cuff + a rounded hand. The
      //    default (leather_gloves). --
      arch("glove", (node, mats) => {
        const hideM = gmat(mats, "leather", 0.05);
        const hand = ball(node, "gloveHand", 0.32, hideM); // the padded hand
        hand.position.set(0, 0, 0.02); hand.scaling.set(1, 0.9, 1.08);
        const cuff = band(node, "gloveCuff", 0.34, 0.3, 0.16, hideM); // a snug wrist cuff
        cuff.position.set(0, 0.12, 0);
        if (detail) fingers(node, hideM, 0.09, 0.16); // a soft finger hint
      });

      // -- BRACER: a laced leather bracer over a light hand wrap (rare, non-set:
      //    swift_gloves). A tall forearm cuff + a slim hand. --
      arch("bracer", (node, mats) => {
        const hideM = gmat(mats, "leather", 0.05);
        const wrap = ball(node, "bracerHand", 0.3, hideM); // a slim hand wrap
        wrap.position.set(0, -0.02, 0.02); wrap.scaling.set(0.94, 0.86, 1.06);
        const bracer = band(node, "bracerCuff", 0.36, 0.32, 0.3, hideM); // a tall laced bracer
        bracer.position.set(0, 0.2, 0);
        if (detail) {
          const laceM = gmat(mats, "cloth", 0.04);
          for (let i = 0; i < 2; i++) { const lace = band(node, "bracerLace", 0.38, 0.38, 0.04, laceM); lace.position.set(0, 0.13 + i * 0.14, 0); lace.scaling.z = 1.02; }
          fingers(node, hideM, 0.085, 0.14);
        }
      });

      // -- GAUNTLET: a segmented iron gauntlet — a banded cuff, a knuckle plate + a
      //    row of finger lames (Ironguard: iron_gauntlets). --
      arch("gauntlet", (node, mats) => {
        const ironM = gmat(mats, "iron", 0.06);
        const hand = ball(node, "gauntHand", 0.32, ironM); // the metal hand
        hand.position.set(0, 0, 0.02); hand.scaling.set(1.02, 0.86, 1.08);
        const cuff = band(node, "gauntCuff", 0.4, 0.32, 0.22, ironM); // a flared banded cuff
        cuff.position.set(0, 0.16, 0);
        const knuckle = shell(node, "gauntKnuckle", 0.3, 0.1, 0.2, ironM); // a raised knuckle plate
        knuckle.position.set(0, 0.02, 0.18); knuckle.rotation.x = 0.3;
        if (detail) {
          const cuffBand = band(node, "gauntBand", 0.42, 0.42, 0.05, ironM); cuffBand.position.set(0, 0.25, 0); cuffBand.scaling.z = 1.02; // a rivet band
          fingers(node, ironM, 0.09, 0.16); // articulated finger lames
        }
      });

      // -- SCALED: an overlapping dragonscale gauntlet + a spined cuff (Dragonscale:
      //    dragon_gauntlets). --
      arch("scaled", (node, mats) => {
        const scaleM = gmat(mats, "dragonscale", 0.08);
        const hand = ball(node, "scaledHand", 0.32, scaleM);
        hand.position.set(0, 0, 0.02); hand.scaling.set(1, 0.88, 1.08);
        const cuff = band(node, "scaledCuff", 0.4, 0.3, 0.2, scaleM); // a scaled wrist guard
        cuff.position.set(0, 0.15, 0);
        // Overlapping scale plates climbing the back of the hand.
        const rows = detail ? 3 : 2;
        for (let r = 0; r < rows; r++) {
          const sc = ball(node, "gloveScale", 0.18, scaleM);
          sc.position.set(0, 0.06 - r * 0.1, 0.16); sc.scaling.set(1, 0.5, 1);
        }
        if (detail) {
          const spineM = gmat(mats, "gold", 0.12);
          for (const s of [-1, 1]) { // a pair of small swept-back cuff spines
            const sp = cone(scene, "gloveSpine", 0.07, 0.01, 0.2, spineM); sp.parent = node; track(sp);
            sp.position.set(0.14 * s, 0.22, -0.02); sp.rotation.z = 0.5 * s; sp.rotation.x = -0.5;
          }
          fingers(node, scaleM, 0.09, 0.16);
        }
      });

      // -- WARPLATE: an ornate polished plate gauntlet — a gold-trimmed cuff + a
      //    raised knuckle boss (epic / legendary: titan_gauntlets). --
      arch("warplate", (node, mats) => {
        const steelM = gmat(mats, "steel", 0.06);
        const trimM = gmat(mats, "gold", detail ? 0.14 : 0.08);
        const hand = ball(node, "warHand", 0.34, steelM);
        hand.position.set(0, 0, 0.02); hand.scaling.set(1.04, 0.86, 1.08);
        const cuff = band(node, "warCuff", 0.44, 0.34, 0.24, steelM); // a broad flared cuff
        cuff.position.set(0, 0.18, 0);
        const rim = band(node, "warRim", 0.46, 0.44, 0.06, trimM); // a gold rim on the cuff
        rim.position.set(0, 0.28, 0); rim.scaling.z = 1.02;
        // A raised central knuckle boss.
        const boss = ball(node, "warBoss", 0.2, trimM); boss.position.set(0, 0.02, 0.2); boss.scaling.set(1.1, 0.7, 1);
        if (detail) fingers(node, steelM, 0.095, 0.17); // plated finger lames
      });
    }

    // Build one procedural mesh group per belt archetype (Task 29), all parented to
    // the shared `belt` anchor (at the WAIST, lean-y 0.74) and hidden;
    // refreshWornGear() shows the one the equipped belt maps to. The old belt was a
    // single plain cylinder at lean-y 0.98 that OVERLAPPED the chest band; a real belt
    // is a strap + buckle strapped around the waist BELOW the cuirass. Every part is
    // built in belt-local space where the strap band sits at y≈0 (≈ lean-y 0.74) and
    // its TOP is kept at/below belt-local +0.06 (≈ lean-y 0.80, the chest envelope's
    // lowest reach) so the two never z-fight; pouches/tassets/plates hang DOWN in −y
    // (further from the chest), and nothing rises toward it. The band is parented to
    // the TORSO (`lean`), never the legs, so it is pose-independent — the stride
    // swings the legs beneath it and can't reach it (the below-chest + clears-legs
    // invariants are structural, not tuned). Each archetype group tracks its own
    // material list so the rarity paint() recolours the whole belt. The `meshes` list
    // lets the leak test track parts and the fit test sample the real geometry.
    // Tier-gated: only built above the low tier (a clean omission — see wornDetailFor).
    _buildBelt(scene, anchor, spec, cast, off) {
      const detail = spec.beltDetail !== false; // finer studs / pouches above low tier
      const g = this.gear;
      const belts = (g.belts = {});
      let uid = 0;
      // A fresh emissive material for a belt part; base tint by the archetype's
      // material, tracked so paint() can recolour the whole belt on equip.
      const bmat = (mats, key, emissive) => {
        const m = emat(scene, "gearBelt" + key + uid++, BELT_MATERIAL_TINT[key] || "#9fb0c8", emissive == null ? 0.06 : emissive);
        mats.push(m); return m;
      };
      // `meshes` collects every built part so the leak test can track them and the
      // below-chest / clears-legs invariants can sample the real geometry.
      let curMeshes = null;
      const track = (x) => { if (curMeshes) curMeshes.push(x); cast(x); return x; };
      // Layered primitive helpers attached to a group node (each tracked for tests).
      const shell = (node, name, w, h, d, m) => { const x = box(scene, name, w, h, d, m); x.parent = node; return track(x); };
      const ball = (node, name, dia, m) => { const x = sphere(scene, name, dia, m); x.parent = node; return track(x); };
      const band = (node, name, top, bot, h, m) => { const x = cyl(scene, name, top, bot, h, m); x.parent = node; return track(x); };
      // Register an archetype group under the anchor via build(node, mats).
      const arch = (key, build) => {
        const node = new BABYLON.TransformNode("belt_" + key, scene);
        node.parent = anchor; off(node);
        const mats = []; const meshes = [];
        curMeshes = meshes; build(node, mats); curMeshes = null;
        belts[key] = { node, mats, meshes };
      };
      // The waist STRAP shared by every archetype: a thin vertical band ⌀≈0.98 around
      // the waist, centred just below the anchor so its TOP stays under the chest hem.
      // (A cylinder's axis is +y, so a squat one IS a waist ring.)
      const strap = (node, m) => {
        const s = band(node, "beltStrap", 0.98, 1.0, 0.12, m);
        s.position.y = -0.01; s.scaling.z = 0.86; // flatten front-to-back like the torso
        return s;
      };
      // A rectangular buckle plate at the FRONT of the strap (belt-local +z).
      const buckle = (node, w, h, m) => {
        const bk = shell(node, "beltBuckle", w, h, 0.08, m);
        bk.position.set(0, -0.01, 0.44); return bk;
      };

      // -- STRAP: a plain leather strap + a simple square buckle. The default
      //    (leather_belt). --
      arch("strap", (node, mats) => {
        const hideM = bmat(mats, "leather", 0.05);
        strap(node, hideM);
        buckle(node, 0.2, 0.16, hideM);
        if (detail) { // a raised inner tongue on the buckle
          const tongue = shell(node, "beltTongue", 0.05, 0.1, 0.03, bmat(mats, "gold", 0.08));
          tongue.position.set(0, -0.01, 0.49);
        }
      });

      // -- PLATED: a banded iron war-belt — a broad rectangular plate buckle + a row
      //    of riveted studs around the strap (Ironguard: reinforced_belt). --
      arch("plated", (node, mats) => {
        const ironM = bmat(mats, "iron", 0.06);
        strap(node, ironM);
        const plate = buckle(node, 0.3, 0.22, ironM); plate.scaling.z = 1.1; // a big plate buckle
        if (detail) {
          const rim = band(node, "beltPlateRim", 1.02, 1.04, 0.05, ironM); // a rivet rim around the top
          rim.position.y = 0.04; rim.scaling.z = 0.86;
          // A ring of small riveted studs around the front of the strap.
          for (let i = -2; i <= 2; i++) {
            const a = i * 0.5; // fan across the front
            const stud = ball(node, "beltStud", 0.07, ironM);
            stud.position.set(Math.sin(a) * 0.46, -0.01, Math.cos(a) * 0.4);
          }
        }
      });

      // -- SCALED: an overlapping dragonscale belt + a fanged clasp + a hanging side
      //    plate (Dragonscale: dragon_belt). --
      arch("scaled", (node, mats) => {
        const scaleM = bmat(mats, "dragonscale", 0.08);
        strap(node, scaleM);
        // A fanged central clasp (a boss flanked by two little downward fangs).
        const clasp = ball(node, "beltClasp", 0.2, scaleM); clasp.position.set(0, -0.01, 0.44); clasp.scaling.set(1.2, 1, 0.7);
        const fangM = bmat(mats, "gold", 0.12);
        for (const s of [-1, 1]) { const fang = cone(scene, "beltFang", 0.06, 0.01, 0.16, fangM); fang.parent = node; track(fang); fang.position.set(0.08 * s, -0.12, 0.42); fang.rotation.x = Math.PI; }
        if (detail) {
          // Overlapping scale plates climbing the front of the strap.
          for (let i = -2; i <= 2; i++) {
            const sc = ball(node, "beltScale", 0.16, scaleM);
            sc.position.set(i * 0.2, -0.02, 0.36); sc.scaling.set(1, 1, 0.5);
          }
          // A hanging scale tasset on the left hip.
          const tasset = shell(node, "beltTasset", 0.22, 0.28, 0.06, scaleM);
          tasset.position.set(-0.4, -0.2, 0.18); tasset.rotation.y = -0.4;
        }
      });

      // -- POUCHED: a leather adventurer's belt + a round buckle + hanging pouches
      //    (leather, rare / non-set). --
      arch("pouched", (node, mats) => {
        const hideM = bmat(mats, "leather", 0.05);
        strap(node, hideM);
        const ring = band(node, "beltRing", 0.2, 0.2, 0.06, bmat(mats, "gold", detail ? 0.1 : 0.06)); // a round buckle ring
        ring.rotation.x = Math.PI / 2; ring.position.set(0, -0.01, 0.46);
        if (detail) {
          // A pair of soft hanging pouches on the hips.
          for (const s of [-1, 1]) {
            const pouch = ball(node, "beltPouch", 0.22, hideM);
            pouch.position.set(0.34 * s, -0.16, 0.22); pouch.scaling.set(0.9, 1.1, 0.8);
            const flap = shell(node, "beltPouchFlap", 0.2, 0.08, 0.16, hideM); // a flap over each pouch
            flap.position.set(0.34 * s, -0.06, 0.24);
          }
        }
      });

      // -- WARBELT: an ornate gold-trimmed plate belt — a gem-set boss buckle + a
      //    front tasset (steel / gold, epic / legendary). --
      arch("warbelt", (node, mats) => {
        const steelM = bmat(mats, "steel", 0.06);
        const trimM = bmat(mats, "gold", detail ? 0.14 : 0.08);
        strap(node, steelM);
        const rim = band(node, "beltWarRim", 1.02, 1.04, 0.05, trimM); // a gold rim around the top edge
        rim.position.y = 0.04; rim.scaling.z = 0.86;
        // A raised central boss buckle set with a gem.
        const boss = ball(node, "beltWarBoss", 0.26, trimM); boss.position.set(0, -0.01, 0.42); boss.scaling.set(1.2, 1, 0.7);
        const gem = BABYLON.MeshBuilder.CreatePolyhedron("beltGem", { type: 1, size: 0.08 }, scene);
        gem.material = gloss(bmat(mats, "gold", 0.3), 0.2, 0.1); gem.parent = node; track(gem); gem.position.set(0, -0.01, 0.5);
        if (detail) {
          // A trimmed central tasset hanging over the front of the thighs.
          const tasset = shell(node, "beltWarTasset", 0.26, 0.3, 0.06, steelM);
          tasset.position.set(0, -0.22, 0.34);
          const tTrim = shell(node, "beltWarTassetTrim", 0.28, 0.05, 0.07, trimM); // a gold hem on it
          tTrim.position.set(0, -0.36, 0.35);
        }
      });
    }

    // Show/hide + recolour each worn-gear piece from the live equipment. Pure
    // visual: no allocation (meshes built once), so equipping never leaks. The
    // rarity colour signals power at a glance; legendary/epic get a faint glow.
    refreshWornGear() {
      const g = this.gear; if (!g) return;
      const shown = this.gearShown || (this.gearShown = {});
      const paint = (mats, def) => {
        const col = (RARITY[def.rarity] || RARITY.normal).color;
        const emi = def.rarity === "legendary" ? 0.24 : def.rarity === "epic" ? 0.15 : def.rarity === "rare" ? 0.09 : 0.05;
        try {
          const c = BABYLON.Color3.FromHexString(col);
          for (const m of mats) { if (!m) continue; m.diffuseColor = c; m.emissiveColor = c.scale(emi); }
        } catch (e) { /* hex parse can fail headless */ }
      };
      const apply = (slot, meshes, mats) => {
        const inst = this.equipment[slot];
        const on = !!(inst && inst !== TWO_HANDED);
        shown[slot] = on;
        if (meshes) for (const m of (Array.isArray(meshes) ? meshes : [meshes])) { try { m.setEnabled(on); } catch (e) {} }
        if (on && mats) paint(Array.isArray(mats) ? mats : [mats], getDef(inst.id));
      };
      // Reveal ONLY the archetype group the equipped item maps to (helmets Task 25,
      // chests Task 26) and paint that group by rarity. Unused groups stay hidden so
      // e.g. a leather cap and a dragon helm never both show; the shared `anchor`
      // object itself never changes (no realloc / leak). `pick(def)` → archetype key.
      const applyArch = (slot, anchor, groups, pick, shownKey) => {
        const inst = this.equipment[slot];
        const on = !!(inst && inst !== TWO_HANDED);
        shown[slot] = on;
        try { if (anchor) anchor.setEnabled(on); } catch (e) {}
        const sel = on ? pick(getDef(inst.id)).archetype : null;
        shown[shownKey] = sel; // observable for tests + debugging
        if (groups) {
          for (const key in groups) {
            const grp = groups[key];
            const show = on && key === sel;
            try { grp.node.setEnabled(show); } catch (e) {}
            if (show) paint(grp.mats, getDef(inst.id));
          }
        }
      };
      // Reveal ONLY the pauldron archetype pair (both shoulders) the equipped item
      // maps to (Task 27); the anchors are the shoulder pivots (built once, never
      // realloc). Same contract as applyArch but each archetype spans two nodes.
      const applyPauldrons = () => {
        const inst = this.equipment.pauldrons;
        const on = !!(inst && inst !== TWO_HANDED);
        shown.pauldrons = on;
        const sel = on && g.pauls ? pauldronArchetype(getDef(inst.id)).archetype : null;
        shown.pauldronArchetype = sel;
        if (g.pauls) {
          for (const key in g.pauls) {
            const grp = g.pauls[key];
            const show = on && key === sel;
            for (const n of grp.nodes) { try { n.setEnabled(show); } catch (e) {} }
            if (show) paint(grp.mats, getDef(inst.id));
          }
        }
      };
      // Reveal ONLY the glove archetype pair (both hands) the equipped item maps to
      // (Task 28); the anchors are the per-hand group nodes (built once, never
      // realloc). Same contract as applyPauldrons — each archetype spans two nodes.
      const applyGloves = () => {
        const inst = this.equipment.gloves;
        const on = !!(inst && inst !== TWO_HANDED);
        shown.gloves = on;
        const sel = on && g.gloves ? gloveArchetype(getDef(inst.id)).archetype : null;
        shown.gloveArchetype = sel;
        if (g.gloves) {
          for (const key in g.gloves) {
            const grp = g.gloves[key];
            const show = on && key === sel;
            for (const n of grp.nodes) { try { n.setEnabled(show); } catch (e) {} }
            if (show) paint(grp.mats, getDef(inst.id));
          }
        }
      };
      applyArch("helmet", g.helmet, g.helms, helmetArchetype, "helmetArchetype");
      applyArch("breastplate", g.chest, g.chests, chestArchetype, "chestArchetype");
      // Belt (Task 29): reveal ONLY the archetype the equipped belt maps to under the
      // single waist anchor (built once, never realloc). `g.belts` is absent on the
      // low tier (belt omitted) — applyArch tolerates a null groups map and just keeps
      // the (absent) anchor hidden, so the clean low-tier omission is preserved.
      applyArch("belt", g.belt, g.belts, beltArchetype, "beltArchetype");
      applyPauldrons();
      applyGloves();
      apply("boots", g.boots, g.bootMat);
      apply("cloak", g.cloak, g.cloakMat);
    }

    // Billow the cloak with movement (frame-rate-smoothed lerp like the limbs;
    // freezes with the pause menu since update() stops being called).
    _animateCloak() {
      if (!this.cloakPivot || !this._wornSpec || !this._wornSpec.cloakSway) return;
      const moving = this.state === "walk";
      const back = (moving ? -0.5 : -0.06) + Math.sin(this.walkPhase * 1.5) * (moving ? 0.08 : 0.02);
      const side = Math.sin(this.walkPhase) * (moving ? 0.12 : 0.03);
      this.cloakPivot.rotation.x = lerp(this.cloakPivot.rotation.x || 0, back, 0.15);
      this.cloakPivot.rotation.z = lerp(this.cloakPivot.rotation.z || 0, side, 0.15);
    }

    // Keep the pauldrons seated on the shoulders through the attack. The shoulder
    // pivots are children of the arms (so they swing with the pitch), but the arm's
    // z-ROLL — big on the melee strike (armR.z → +1.2) — would swing the cap across
    // the chest. Cancel most of that roll on the pivot each frame (net roll ≈ 20% of
    // the arm's) so the shoulder cap stays outboard of the torso. Called from
    // update(), so it freezes correctly with the pause menu.
    _animatePauldrons() {
      if (!this.shoulderPivots) return;
      // The shoulder pivots hang off the torso (lean), so they don't inherit the arm's
      // roll (the twist that used to dive the old sphere across the chest). Drive each
      // to follow a FRACTION of its arm's forward/back PITCH so the shoulder cap still
      // swings with the attack — but pitch is a rotation about X, so it never changes
      // the piece's x-extent: the cap can never reach into the torso, at any pose.
      // Frame-rate-independent lerp; freezes with the pause menu since update() stops
      // calling it.
      const FOLLOW = 0.5;
      for (const { pivot, arm } of this.shoulderPivots) {
        try {
          pivot.rotation.x = lerp(pivot.rotation.x || 0, (arm.rotation.x || 0) * FOLLOW, 0.4);
        } catch (e) {}
      }
    }

    startPickup(itemMesh, onPicked) {
      this.state = "pickup"; this.pickT = 0;
      this.pendingItem = itemMesh; this.onPicked = onPicked;
    }
    get busy() { return this.state === "pickup"; }

    // A quick chop/reach when harvesting a resource node (purely cosmetic — the
    // material is already credited). Ignored while picking up or mid-swing.
    gather() { if (!this.busy && !this.swing.busy) this.swing.trigger("gather"); }

    // Trigger an attack with the active weapon. Returns a descriptor the loop
    // turns into projectiles or a melee sweep, or null if on cooldown / busy.
    //   ranged → { type:"ranged", shots:[{origin,dir}], weapon }
    //   melee  → { type:"melee", origin, dir, weapon }
    tryCast() {
      if (this.castCooldown > 0 || this.busy) return null;
      const w = this.weapon;
      this.castCooldown = w.cooldown;
      this.swing.trigger(w.ranged ? "ranged" : "melee");
      if (!w.ranged) {
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
      this.swing.update(dt);
      if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt / 0.32);

      if (this.state === "pickup") { this._updatePickup(dt); }
      else { this._updateMove(dt, camera); }

      // Layer the active action pose (wind-up → strike → follow-through) on top of
      // the locomotion pose, then a brief recoil when struck.
      this._animateAction();
      if (this.flinch > 0) {
        this.lean.rotation.x = lerp(this.lean.rotation.x, -0.34, this.flinch);
        this.lean.position.y += this.flinch * 0.05;
      }

      // Pulse the wand crystal; flare it on the ranged strike frame.
      const pulse = 0.85 + Math.sin(performance.now() / 120) * 0.15;
      this.wandHalo.scaling.setAll(pulse);
      const rangedStrike = this.swing.kind === "ranged" && this.swing.striking;
      this.wandGlow.intensity = 0.4 + (rangedStrike ? 0.9 : 0) + pulse * 0.1;

      this._animatePauldrons(); // keep the shoulders seated (after the arms are posed)
      this._animateCloak();
      this.yaw.rotation.y = this.facing;
    }

    // Map the Swing state machine onto limb poses. Each phase eases toward a
    // target pose, so an action reads as anticipation → impact → recovery.
    _animateAction() {
      const sw = this.swing;
      if (!sw.busy) { this.lean.rotation.y = lerp(this.lean.rotation.y || 0, 0, 0.2); return; }
      const ph = sw.phase;
      if (sw.kind === "melee") {
        if (ph === "windup") {            // cock the blade up + twist away
          this.armR.rotation.x = lerp(this.armR.rotation.x, 0.8, 0.4);
          this.armR.rotation.z = lerp(this.armR.rotation.z || 0, -0.7, 0.4);
          this.lean.rotation.y = lerp(this.lean.rotation.y || 0, -0.35, 0.35);
        } else if (ph === "strike") {     // whip it across the body — the hit
          this.armR.rotation.x = lerp(this.armR.rotation.x, -1.5, 0.55);
          this.armR.rotation.z = lerp(this.armR.rotation.z || 0, 1.2, 0.55);
          this.lean.rotation.y = lerp(this.lean.rotation.y || 0, 0.45, 0.5);
        } else {                          // recover — settle back to rest
          this.armR.rotation.z = lerp(this.armR.rotation.z || 0, 0, 0.25);
          this.lean.rotation.y = lerp(this.lean.rotation.y || 0, 0, 0.2);
        }
      } else if (sw.kind === "ranged") {
        if (ph === "windup") this.armR.rotation.x = lerp(this.armR.rotation.x, 0.35, 0.45); // draw back
        else if (ph === "strike") this.armR.rotation.x = lerp(this.armR.rotation.x, -1.9, 0.7); // thrust
        else this.lean.rotation.y = lerp(this.lean.rotation.y || 0, 0, 0.2);
      } else {                            // gather — a downward chop with the free hand
        if (ph === "windup") {
          this.armL.rotation.x = lerp(this.armL.rotation.x, -0.7, 0.4);
          this.lean.rotation.x = lerp(this.lean.rotation.x, 0.15, 0.3);
        } else if (ph === "strike") {
          this.armL.rotation.x = lerp(this.armL.rotation.x, 1.3, 0.6);
          this.lean.rotation.x = lerp(this.lean.rotation.x, 0.5, 0.4);
        } else {
          this.armL.rotation.x = lerp(this.armL.rotation.x, 0, 0.25);
          this.lean.rotation.x = lerp(this.lean.rotation.x, 0, 0.25);
        }
      }
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
      if (amount > 0) this.flinch = 1; // a quick recoil reads the hit
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
      this.slowT = 0;                               // >0 while chilled (frost skills) → half pace
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

    // A frost chill: halve movement for `time` seconds (skills only; cosmetic-safe
    // — never throws, decays in update()). slowMul folds into every move step.
    applySlow(time) { this.slowT = Math.max(this.slowT, time || 0); }
    get slowMul() { return this.slowT > 0 ? 0.5 : 1; }

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
        const step = Math.min(this.speed * 0.5 * this.slowMul * dt, d);   // amble at half pace
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
      if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dt);
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
        if (dist > standoff + 0.4) this.root.position.addInPlace(to.scale(Math.min(this.speed * this.slowMul * dt, dist - standoff) / dist));
        else if (dist < standoff - 1.5) this.root.position.addInPlace(to.scale(-this.speed * this.slowMul * 0.7 * dt / dist));
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
        const step = Math.min(this.speed * this.slowMul * dt, Math.max(0, dist - 1.0));
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
    constructor(scene, shadow, pos, id, affixes) {
      this.id = id;
      this.affixes = affixes || null; // rolled enchantments carried to the bag on pickup
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
  // Alchemist — the dedicated apothecary vendor (Task 21). She stands at the
  // hub plaza by a bubbling cauldron; walk up + press E to open her shop, which
  // sells potions + basic ingredients (the merchant no longer stocks them).
  // Shares the Merchant/Blacksmith Interactable contract.
  // =========================================================================
  class Alchemist {
    constructor(scene, shadow, interaction, onOpen) {
      const root = new BABYLON.TransformNode("alchemist", scene);
      root.position.set(8, 0, 2); // the "apothecary" landmark, opposite the smith
      this.root = root;
      this.bob = 0;
      this._build(scene, shadow);

      this.it = new Interactable(root, { label: t("label.alchemist"), range: 3.4, onInteract: () => onOpen() });
      this.it.enabled = false;
      this.interaction = interaction;
      interaction.register(this.it);
      root.setEnabled(false);
      this.visible = false;
    }

    _build(scene, shadow) {
      const robe = emat(scene, "aRobe", "#2f7a52", 0.08);
      const robeDk = emat(scene, "aRobeDk", "#236040", 0.06);
      const skin = emat(scene, "aSkin", "#f3d3b3", 0.08);
      const hair = emat(scene, "aHair", "#8a5a2a", 0.05);
      const brew = emat(scene, "aBrew", "#9ad6a0", 0.6);
      const iron = emat(scene, "aIron", "#5a5f68", 0.1);
      const glass = emat(scene, "aGlass", "#bfe3ff", 0.4);
      const add = (m) => { m.parent = this.root; shadow.addShadowCaster(m); return m; };

      add(cone(scene, "aBody", 1.0, 0.4, 1.5, robe)).position.y = 0.75;
      add(cyl(scene, "aBelt", 0.66, 0.82, 0.16, robeDk)).position.y = 0.95;
      const head = add(sphere(scene, "aHead", 0.52, skin)); head.position.y = 1.72;
      // A neat bob of hair + a small pointed apothecary hood.
      add(sphere(scene, "aHair", 0.56, hair)).position.set(0, 1.84, -0.04);
      add(cone(scene, "aHood", 0.5, 0.02, 0.7, robeDk)).position.y = 2.2;
      for (const s of [-1, 1]) {
        const eye = add(sphere(scene, "aEye", 0.07, emat(scene, "aEyeM", "#2a2a3a", 0)));
        eye.position.set(0.12 * s, 1.76, 0.44);
      }
      // A little potion bottle held at her side.
      const vial = add(cyl(scene, "aVial", 0.1, 0.14, 0.34, glass)); vial.position.set(-0.62, 1.2, 0.1);

      // A bubbling cauldron beside her.
      const pot = add(cyl(scene, "aPot", 0.62, 0.5, 0.62, iron)); pot.position.set(1.4, 0.5, 0);
      const liquid = add(cyl(scene, "aBrewTop", 0.56, 0.56, 0.08, brew)); liquid.position.set(1.4, 0.84, 0);
      this.brew = liquid;
      add(box(scene, "aPotBase", 0.5, 0.3, 0.5, robeDk)).position.set(1.4, 0.18, 0);

      // A floating flask marker so the apothecary is easy to spot.
      const sign = new BABYLON.TransformNode("aSign", scene);
      sign.parent = this.root; sign.position.y = 3.3; this.sign = sign;
      const flask = sphere(scene, "aFlask", 0.4, brew);
      flask.parent = sign; flask.scaling.set(1, 1.15, 1);
      shadow.addShadowCaster(flask);
      const neck = cyl(scene, "aNeck", 0.12, 0.12, 0.3, glass);
      neck.parent = sign; neck.position.set(0, 0.34, 0);

      const glow = new BABYLON.PointLight("aGlow", new BABYLON.Vector3(1.4, 1.2, 0), scene);
      glow.parent = this.root; glow.diffuse = BABYLON.Color3.FromHexString("#9ad6a0");
      glow.intensity = 0.55; glow.range = 7;
      this.glow = glow;
    }

    show() { if (this.visible) return; this.visible = true; this.root.setEnabled(true); this.it.enabled = true; }
    hide() { if (!this.visible) return; this.visible = false; this.root.setEnabled(false); this.it.enabled = false; }
    update(dt) {
      if (!this.visible) return;
      this.bob += dt;
      this.sign.position.y = 3.3 + Math.sin(this.bob * 2) * 0.12;
      this.sign.rotation.y += dt * 1.4;
      // Gently bob the cauldron's brew + pulse its glow as if simmering.
      if (this.brew) this.brew.position.y = 0.84 + Math.sin(this.bob * 4) * 0.03;
      if (this.glow) this.glow.intensity = 0.45 + Math.abs(Math.sin(this.bob * 3)) * 0.35;
    }
    dispose() {
      try { if (this.interaction && this.it) this.interaction.remove(this.it); } catch (e) {}
      try { if (this.root) this.root.dispose(); } catch (e) {}
    }
  }

  // =========================================================================
  // ResourceNode — a harvestable spot in the world (cut a tree, mine rock or
  // crystal, gather herbs, cut fibers, collect water). Walk up + press E to
  // harvest its material; it depletes, then respawns after a cooldown. The raw
  // materials feed the crafting bench. Reuses the Interactable contract.
  // =========================================================================
  class ResourceNode {
    constructor(scene, shadow, interaction, pos, kind, player, state, data) {
      this.kind = kind; this.def = RESOURCE_KINDS[kind];
      // The persistent record this node mirrors (Task 22): positions + depletion
      // live there so re-entry rebuilds the same node still on its cooldown.
      this.data = data || { kind, x: pos.x, z: pos.z, respawn: 0 };
      this.respawn = Math.max(0, +this.data.respawn || 0);
      this.bob = rng() * Math.PI * 2;
      this.player = player; this.state = state; this.interaction = interaction;
      const root = new BABYLON.TransformNode("res_" + kind, scene);
      root.position.copyFrom(pos); this.root = root;
      this._build(scene, shadow);
      this.it = new Interactable(root, {
        label: tResourceLabel(this.kind), range: CONFIG.gatherRange,
        onInteract: () => this.harvest(),
      });
      // A node restored mid-cooldown starts hidden + non-interactable.
      if (this.respawn > 0) { this.body.setEnabled(false); this.it.enabled = false; }
      interaction.register(this.it);
    }

    // Tear down EVERYTHING this node owns (Task 22): its meshes (parented to
    // root) AND its interaction registration. Resource meshes are created AFTER
    // buildWorld returns, so they are NOT captured by world.dispose()'s snapshot
    // — without this they leaked across travel as visible, unharvestable
    // "phantom" nodes. teardownZone calls this for every live node.
    dispose() {
      try { if (this.interaction && this.it) this.interaction.remove(this.it); } catch (e) {}
      try { this.root.dispose(); } catch (e) {}
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
      Skills.gainXp(this.player, XP_PER_GATHER); // gathering earns a little XP too
      if (this.player && this.player.gather) this.player.gather(); // chop/reach motion
      spawnImpact(this.state, this.root.position, "#cfe0b0", { y: 0.8, count: 7, spread: 3 });
      // A surface-matched harvest cue: pickaxe ring for rock/crystal, a softer chop otherwise.
      Sfx.play((this.def.mat === "stone" || this.def.mat === "crystal") ? "mine" : "gather");
      toast(t("toast.gathered", { icon: MATERIALS[this.def.mat].icon, n, label: materialLabel(this.def.mat, n) }));
      this.respawn = this.def.respawn;
      if (this.data) this.data.respawn = this.respawn;   // persist depletion (Task 22)
      this.body.setEnabled(false);
      this.it.enabled = false;
    }

    update(dt) {
      if (this.respawn > 0) {
        this.respawn -= dt;
        if (this.data) this.data.respawn = Math.max(0, this.respawn);  // keep the record in step
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

  // Solid-collision footprint of the built castle, as {x,z,r} circles in the
  // castle's LOCAL frame (offset by the site root). Walls/towers/keep are solid;
  // the gate is a PASSABLE opening (a gap in the north wall, flanked by jambs) so
  // the player can still walk through the gateway. The foundation is a low base
  // you stand on, so it stays walkable. Pure + headless-safe so it can be unit
  // tested; CastleSite._syncCollision() maps it into the world's obstacle set.
  const CASTLE_GATE_HALF = 2.4;          // half-width of the passable gateway
  function castleCollisionCircles(built) {
    const has = (id) => built.includes(id);
    const circles = [];
    if (has("walls")) {
      const wallR = 0.9, step = 1.15;
      // Lay a chain of circles along a wall segment; `gap` (if set) leaves a
      // passable doorway centred on x=0 (the gateway, on the north wall).
      const chain = (x0, x1, z0, z1, gap) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.round(len / step));
        for (let i = 0; i <= n; i++) {
          const f = i / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
          if (gap && Math.abs(x) < CASTLE_GATE_HALF) continue;  // gateway gap
          circles.push({ x, z, r: wallR });
        }
      };
      chain(-6, 6, 6, 6, true);    // north wall (z=+6) — passable gateway at x≈0
      chain(-6, 6, -6, -6, false); // south wall
      chain(6, 6, -6, 6, false);   // east wall
      chain(-6, -6, -6, 6, false); // west wall
    }
    if (has("towers")) for (const sx of [-6, 6]) for (const sz of [-6, 6]) circles.push({ x: sx, z: sz, r: 1.5 });
    if (has("gate")) for (const s of [-1, 1]) circles.push({ x: s * (CASTLE_GATE_HALF + 0.45), z: 6, r: 0.8 }); // gate jambs
    if (has("keep")) circles.push({ x: 0, z: 0, r: 2.7 });
    return circles;
  }

  // =========================================================================
  // CastleSite — the heart of the story. Stands on Castle Hill. Spend a castle
  // relic + coins to raise each of the five parts (foundation → walls → towers
  // → gate → keep), watching the castle grow in the world. Building the final
  // keep summons the DRAGON for the climactic battle. Walk up + press E to open
  // the build panel (CastleUI). Built parts register SOLID collision (walls,
  // towers, keep) with a passable gate, so the player + wand bolts no longer
  // pass through it.
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
      // Range reaches over the (now solid) walls so building a part never locks
      // the player out — they can raise each part from outside the curtain.
      this.it = new Interactable(root, { label: t("label.buildCastle"), range: 10, onInteract: () => CastleUI.openPanel() });
      interaction.register(this.it);
    }

    // Re-register the castle's solid-collision circles in the world's obstacle
    // set to match what's currently built. Tagged with `_castle` so a rebuild
    // (build / restore) can drop the old ones first — no leaks, no duplicates.
    _syncCollision() {
      const world = this.state && this.state.world;
      if (!world || !Array.isArray(world.obstacles)) return;
      const obs = world.obstacles;
      for (let i = obs.length - 1; i >= 0; i--) if (obs[i]._castle) obs.splice(i, 1);
      const cx = this.root.position.x, cz = this.root.position.z;
      for (const c of castleCollisionCircles(this.built)) {
        obs.push({ x: cx + c.x, z: cz + c.z, r: c.r, _castle: true });
      }
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
      this._syncCollision();         // raise solid collision for the new part
      const n = this.parts[part.id];
      if (n) { n.setEnabled(true); n.scaling.setAll(0.01); n._pop = 1; }
      spawnImpact(this.state, this.root.position, "#ffd34e", { y: 4, count: 16, spread: 6, up: 4 });
      Sfx.play("enhance");
      toast(t("toast.partRaised", { part: nounRef("castlePart", part.id, tCastlePartName(part.id)), verb: select(nounGender("castlePart", part.id), AGREE_RAISED) }));
      Quests.onBuild(part.id); // advance any "build this part" mission
      if (this.built.length >= CASTLE_PARTS.length) this._complete();
      return true;
    }

    // Rebuild instantly from a save (no animation, no dragon re-trigger).
    restore(builtIds) {
      this.built = (builtIds || []).filter((id) => CASTLE_PART_BY_ID[id]);
      for (const id of this.built) if (this.parts[id]) this.parts[id].setEnabled(true);
      this._syncCollision();         // re-raise the saved castle's solid collision
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
  //
  // The auto-detected tier is the default, but the player can OVERRIDE it from
  // the pause settings (Auto / High / Medium / Low). That preference persists in
  // localStorage (`QUALITY_KEY`) and is honoured by `detect()` on every (re)boot.
  // =========================================================================
  const QUALITY_KEY = "gg3d_quality";  // persisted graphics preference: auto|high|medium|low
  const Quality = {
    tier: "high",
    pref: "auto",   // user preference: "auto" (capability-detect) or a forced tier
    // Each tier carries lighting (Task 4) AND model fidelity (Task 3) knobs:
    //   pbr    — energy-conserving PBRMaterial vs the StandardMaterial fallback
    //   env    — install the procedural image-based-lighting probe (sky reflections)
    //   seg    — sphere segment count   (rounder silhouettes)
    //   tess   — cylinder/disc tessellation
    //   rockSub— icosphere subdivisions for rocks (craggier facets)
    //   foliage— extra-detail budget (0..1): layered canopies / rock + crystal clusters
    //   ambient— ambient-FX density (0..1): drifting-particle emit rate (Task 5)
    // The mobile tiers never exceed the old geometry density (phones stay smooth);
    // only the desktop "high" tier adds triangles + PBR + the IBL probe.
    TIERS: {
      high:   { shadowMap: 2048, shadowFilter: "contact", csm: true,  bloom: true,  ssao: true,
                shadowDarkness: 0.34, exposure: 1.10, contrast: 1.12, bloomWeight: 0.20, shadowMaxZ: 220,
                pbr: true,  env: true,  seg: 14, tess: 20, rockSub: 2, foliage: 1.0, ambient: 1.0 },
      medium: { shadowMap: 1024, shadowFilter: "pcf",     csm: false, bloom: true,  ssao: false,
                shadowDarkness: 0.40, exposure: 1.05, contrast: 1.08, bloomWeight: 0.15, shadowMaxZ: 160,
                pbr: true,  env: false, seg: 12, tess: 16, rockSub: 1, foliage: 0.6, ambient: 0.7 },
      low:    { shadowMap: 1024, shadowFilter: "blur",    csm: false, bloom: false, ssao: false,
                shadowDarkness: 0.46, exposure: 1.02, contrast: 1.04, bloomWeight: 0.00, shadowMaxZ: 120,
                pbr: false, env: false, seg: 10, tess: 12, rockSub: 1, foliage: 0.3, ambient: 0.45 },
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

    // Read the persisted graphics preference (headless-safe; missing/garbage →
    // "auto"). A tampered value that isn't a real tier falls back to Auto.
    loadPref() {
      const v = localGet(QUALITY_KEY);
      this.pref = (v === "auto" || this.TIERS[v]) ? v : "auto";
      return this.pref;
    },

    // Store a new preference ("auto" or a tier) and recompute the active tier.
    // Returns the resolved tier. Does NOT rebuild the scene — the caller decides
    // how to apply it (the pause settings reload to re-run the whole build path).
    setPref(pref, persist) {
      this.pref = (pref === "auto" || this.TIERS[pref]) ? pref : "auto";
      if (persist !== false) localSet(QUALITY_KEY, this.pref);
      return this.detect();
    },

    // Sniff the device and resolve the active tier. Every browser-only read is
    // feature-detected so the Node harness simply keeps the default tier. A
    // forced tier wins over auto-detection, in priority order: the persisted
    // user preference, then `window.__GG_QUALITY__` (high|medium|low) — the
    // latter a debug / weak-GPU override that always trumps the saved choice.
    detect() {
      this.loadPref();   // honour the saved preference on every (re)detect
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
        if (this.pref && this.pref !== "auto" && this.TIERS[this.pref]) info.forced = this.pref;
        if (typeof window !== "undefined" && window.__GG_QUALITY__ && this.TIERS[window.__GG_QUALITY__]) {
          info.forced = window.__GG_QUALITY__;
        }
      } catch (e) {}
      this.tier = this.pick(info);
      return this.tier;
    },
  };

  // =========================================================================
  // Art direction (Task 11) — a brighter, more cheerful colour grade + a
  // larger, tier-gated view distance. Every knob here is a PURE, data-driven
  // function (per zone + per tier) so the look is unit-testable without a GPU:
  //
  //   • grade()        — a gentle saturation/value lift applied to every
  //                      mat()/emat() base colour, so muted greens/browns/greys
  //                      read lush and candy colours pop, without going neon
  //                      (already-vivid colours barely move once clamped). The
  //                      backdrop materials (sky dome, sea/river sheen) bypass
  //                      it via stdMat/stdEmat so DayNight keeps exact control.
  //   • fogDensityFor()— the graded fog density for a zone: its base scaled by
  //                      the active tier's fogMul. Low/mobile keeps fog dense
  //                      (a tight, cheap radius); high opens the world up.
  //                      Indoor lairs blend only halfway so they stay moody.
  //   • view().maxZ    — the camera far plane (draw distance), tier-gated to
  //                      match the opened fog (generous on high, tighter on low).
  //   • exposureFor() / contrastFor() — the per-zone tone-mapping grade (the
  //                      tier base nudged by the zone's mood), mirrored by
  //                      applyZoneMood so a brighter palette reads punchy, not
  //                      blown out under ACES.
  //   • luminance() / contrastRatio() — WCAG-ish readability helpers so a test
  //                      can prove gameplay-critical markers/enemies still stand
  //                      out against the brightened ground.
  // =========================================================================

  // Pure RGB↔HSV colour math (0..1 channels), so the grade needs no engine.
  function rgbToHsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 1e-6) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: mx <= 1e-6 ? 0 : d / mx, v: mx };
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: r + m, g: g + m, b: b + m };
  }
  // Hex (or a {r,g,b} 0..1 colour) → {r,g,b}; and {r,g,b} → "#rrggbb".
  function rgbOf(input) {
    if (typeof input !== "string") return { r: input.r || 0, g: input.g || 0, b: input.b || 0 };
    let h = input.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16) || 0;
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  function rgbToHex(o) {
    const f = (x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, "0");
    return "#" + f(o.r) + f(o.g) + f(o.b);
  }

  const ArtDirection = {
    // Global grade strength: push saturation up, lift value gently. Subtle so it
    // lifts the muddy floor without turning the candy world garish.
    GRADE: { sat: 1.18, val: 1.06 },

    // Per-tier VIEW knobs: the camera far plane (draw distance) + a multiplier on
    // every zone's base fog density. high opens the view; low keeps it tight/cheap.
    // (maxZ stays above the farthest real geometry on each tier so the opened
    // view never hard-clips; the sky dome is infiniteDistance and always drawn.)
    VIEW: {
      high:   { maxZ: 360, fogMul: 0.58 },
      medium: { maxZ: 290, fogMul: 0.74 },
      low:    { maxZ: 210, fogMul: 0.96 },
    },
    view(tier) { return this.VIEW[tier || Quality.tier] || this.VIEW.high; },

    // Pure: the graded fog density for a zone at a tier (base × tier fogMul,
    // clamped to the engine ceiling). Indoor lairs only blend halfway toward the
    // open multiplier, so caverns/thickets open up a little but stay enclosed.
    fogDensityFor(zone, tier) {
      const base = (zone && zone.theme && zone.theme.fogDensity) || 0.006;
      let mul = this.view(tier).fogMul;
      if (zone && zone.indoor) mul = 1 + (mul - 1) * 0.5;
      return Math.max(0, Math.min(0.06, base * mul));
    },

    // Pure: the per-zone tone-mapping grade — the tier base (Quality) nudged by
    // the zone's optional mood multipliers. applyZoneMood applies exactly this.
    exposureFor(zone, tier) {
      const q = Quality.TIERS[tier || Quality.tier] || Quality.TIERS.high;
      const th = (zone && zone.theme) || {}, indoor = !!(zone && zone.indoor);
      return q.exposure * (th.expMul != null ? th.expMul : (indoor ? 0.92 : 1));
    },
    contrastFor(zone, tier) {
      const q = Quality.TIERS[tier || Quality.tier] || Quality.TIERS.high;
      const th = (zone && zone.theme) || {}, indoor = !!(zone && zone.indoor);
      return q.contrast * (th.conMul != null ? th.conMul : (indoor ? 1.06 : 1));
    },

    // Pure colour grade: hex|Color3 → a brighter, more saturated BABYLON.Color3.
    grade(input) {
      const c = rgbOf(input), hsv = rgbToHsv(c.r, c.g, c.b);
      const out = hsvToRgb(hsv.h, Math.min(1, hsv.s * this.GRADE.sat), Math.min(1, hsv.v * this.GRADE.val));
      return new BABYLON.Color3(out.r, out.g, out.b);
    },
    gradeHex(hex) {
      const c = rgbOf(hex), hsv = rgbToHsv(c.r, c.g, c.b);
      return rgbToHex(hsvToRgb(hsv.h, Math.min(1, hsv.s * this.GRADE.sat), Math.min(1, hsv.v * this.GRADE.val)));
    },

    // WCAG relative luminance (0..1) + contrast ratio (≥1), for readability tests.
    luminance(input) {
      const c = rgbOf(input);
      const lin = (u) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
      return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    },
    contrastRatio(a, b) {
      const la = this.luminance(a), lb = this.luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
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
      ip.exposure = ArtDirection.exposureFor(zone, Quality.tier);
      ip.contrast = ArtDirection.contrastFor(zone, Quality.tier);
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
    // Task 11: open the view — the fog density is the zone's base scaled by the
    // active tier (high thins it so the world reads farther; low keeps it tight
    // for fps). Weather then layers on top of this graded base.
    scene.fogDensity = ArtDirection.fogDensityFor(zone, Quality.tier);

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = indoor ? 0.7 : 1.0; hemi.groundColor = ArtDirection.grade(T.hemi);
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
    let onBridge = () => false;
    let clearOfRiver = () => true;
    let roadLanes = [];   // hub road centrelines [{ang,dir}] (empty in the wild)
    let water = null, waterMat = null;
    const FAR = RADIUS - 6;
    let baseWaterY = 0;
    const animated = []; // {orb, y} markers bobbed by the per-frame observable
    // Set in the hub block to a (x,z,dir)->bool that drops a bridge where an exit
    // road crosses the river (Task 22). Null in the wild (no river), so the
    // portal block skips it. Returns true if a crossing existed (bridge built).
    let bridgeExitRoad = null;
    // The hub's road ray-ends (each crossroads lane is a full diameter → two
    // outward directions). The portal block snaps each hub exit to the nearest
    // FREE ray so a land's exits ride the existing, bridge-aware crossroads
    // rather than cutting new radial roads across the river (Task 22 hint).
    let exitRayDirs = null;

    // =====================================================================
    // HOME HUB (Meadowgate Vale): the village river + bridges, the crossroads
    // and plaza, the lampposts and the named-landmark beacons. The wild zones
    // skip all of this and get a themed wilderness instead.
    // =====================================================================
    if (zone.home) {
      const riverAngle = 0.5 + rng() * 0.7;
      const ca = Math.cos(riverAngle), sa = Math.sin(riverAngle);
      const crossN = { x: ca, z: -sa };            // unit perpendicular to the flow
      const alongT = { x: sa, z: ca };             // unit direction of flow
      const riverPerp = 30 + rng() * 6;            // offset of the river from centre
      const riverHalf = 6.5;                        // half-width of the water
      const riverLen = GROUND;
      const riverCenter = { x: riverPerp * crossN.x, z: riverPerp * crossN.z };

      const signedPerp = (x, z) => x * crossN.x + z * crossN.z;
      const tangent = (x, z) => x * alongT.x + z * alongT.z;

      // ---- Roads: a crossroads laid out RELATIVE to the river. Road A meets the
      // water head-on (so it earns a real bridge); road B is rotated 90° and runs
      // ALONGSIDE the river — a small jitter keeps road B's crossing beyond the
      // fence, so neither road ever spills into open water. `dir` is the unit
      // along-road vector (the ground mesh's long axis under rotation.y = ang). ----
      const roadHalf = 5;                                   // onRoad clear-lane half-width
      const roadTilt = (rng() - 0.5) * 0.36;                // ±0.18rad jitter on the crossing road
      const baseRoadAng = riverAngle + Math.PI / 2 + roadTilt;
      roadLanes = [baseRoadAng, baseRoadAng + Math.PI / 2].map((ang) => ({
        ang, dir: { x: Math.sin(ang), z: Math.cos(ang) },
      }));
      const roads = roadLanes;
      // Each lane is a full diameter, so it offers TWO outward ray-ends; collect
      // all 4 as the candidate directions a portal exit can ride (Task 22).
      exitRayDirs = [];
      for (const r of roadLanes) {
        exitRayDirs.push({ x: r.dir.x, z: r.dir.z });
        exitRayDirs.push({ x: -r.dir.x, z: -r.dir.z });
      }

      // Bridge-aware crossings: for every road that actually reaches the river
      // WITHIN the fence, drop a bridge gap centred on its crossing and sized to
      // span the road's full (oblique) footprint — so "onRoad ∩ open water" is
      // empty and the player never walks a road into the water off a bridge.
      const bridges = [];
      for (const r of roads) {
        const dN = r.dir.x * crossN.x + r.dir.z * crossN.z;  // dir · N (perp alignment)
        if (Math.abs(dN) < 1e-3) continue;                   // parallel to flow → never crosses
        const along = riverPerp / dN;                        // distance along the road to the crossing
        if (Math.abs(along) > RADIUS) continue;              // road leaves the map before the water
        const dT = r.dir.x * alongT.x + r.dir.z * alongT.z;  // dir · T (flow alignment)
        bridges.push({ t: along * dT, half: (Math.abs(dT) * riverHalf + roadHalf) / Math.abs(dN) + 1.5 });
      }
      // A couple of plain foot-bridges further along the river for extra crossings.
      const roadBridgeT = bridges.length ? bridges[0].t : 0;
      for (const off of [44, -44]) {
        const ft = roadBridgeT + off;
        if (Math.abs(ft) < riverLen * 0.4) bridges.push({ t: ft, half: 5 });
      }

      onBridge = (x, z) => {
        const tt = tangent(x, z);
        for (const b of bridges) if (Math.abs(tt - b.t) < b.half) return true;
        return false;
      };
      // True if a point sits in open water (blocks movement); bridges are walkable.
      inRiver = (x, z) => Math.abs(signedPerp(x, z) - riverPerp) < riverHalf && !onBridge(x, z);
      clearOfRiver = (x, z) => Math.abs(signedPerp(x, z) - riverPerp) > riverHalf + 1.5;
      // On/near a road centreline? (perp distance to the road's along-axis.)
      onRoad = (x, z) => {
        for (const r of roads) if (Math.abs(x * r.dir.z - z * r.dir.x) < roadHalf) return true;
        return false;
      };

      // Water surface (a long translucent blue band) + darker muddy banks.
      const bank = BABYLON.MeshBuilder.CreateGround("bank", { width: riverHalf * 2 + 4, height: riverLen }, scene);
      bank.rotation.y = riverAngle; bank.position.set(riverCenter.x, 0.015, riverCenter.z);
      bank.material = mat(scene, "bank", "#5c4a32"); bank.receiveShadows = true;
      waterMat = stdEmat(scene, "water", "#3aa0e0", 0.18);
      waterMat.alpha = 0.82; waterMat.specularColor = new BABYLON.Color3(0.5, 0.6, 0.7);
      water = BABYLON.MeshBuilder.CreateGround("water", { width: riverHalf * 2, height: riverLen }, scene);
      water.rotation.y = riverAngle; water.position.set(riverCenter.x, 0.05, riverCenter.z);
      water.material = waterMat; water.isPickable = false;
      baseWaterY = water.position.y;

      // Lily pads floating on the open water (never under a bridge deck).
      const padMat = mat(scene, "pad", "#2f8f4a");
      for (let i = 0; i < 14; i++) {
        const tt = (rng() - 0.5) * riverLen * 0.8;
        const off = (rng() - 0.5) * (riverHalf * 1.4);
        const x = riverCenter.x + alongT.x * tt + crossN.x * off;
        const z = riverCenter.z + alongT.z * tt + crossN.z * off;
        if (onBridge(x, z)) continue;
        const pad = disc(scene, "pad", 0.5 + rng() * 0.4, padMat);
        pad.rotation.x = Math.PI / 2; pad.position.set(x, 0.08, z); pad.isPickable = false;
      }

      // Bridges — a wooden plank deck + rails spanning the water at each crossing.
      const plankMat = mat(scene, "plank", "#9a6a3a");
      const railMat = mat(scene, "rail", "#7a5230");
      const buildBridgeMesh = (b) => {
        const cx = riverCenter.x + alongT.x * b.t;
        const cz = riverCenter.z + alongT.z * b.t;
        const deck = box(scene, "bridge", riverHalf * 2 + 5, 0.25, b.half * 2, plankMat);
        deck.rotation.y = riverAngle; deck.position.set(cx, 0.12, cz); deck.receiveShadows = true;
        shadow.addShadowCaster(deck);
        for (const side of [-1, 1]) {
          const rail = box(scene, "rail", riverHalf * 2 + 5, 0.5, 0.18, railMat);
          rail.rotation.y = riverAngle;
          rail.position.set(cx + alongT.x * (b.half - 0.2) * side, 0.5, cz + alongT.z * (b.half - 0.2) * side);
          shadow.addShadowCaster(rail);
        }
      };
      for (const b of bridges) buildBridgeMesh(b);

      // Task 22: let the PORTAL block (which runs later, laying radial exit roads)
      // request a bridge where its road crosses the river — so a road heading off
      // the map to a neighbour never spills into open water. Mirrors the main
      // crossroads' bridge maths for a road of half-width `half` along `dir`.
      bridgeExitRoad = (dir, half) => {
        const dN = dir.x * crossN.x + dir.z * crossN.z;       // dir · N
        if (Math.abs(dN) < 1e-3) return false;                // parallel to flow → never crosses
        const along = riverPerp / dN;                         // signed distance along the road to the water
        // The exit road is a full diameter line (its ground mesh + onRoad both
        // span ±dir), so the crossing counts on either side — bridge it as long
        // as it falls within the fence.
        if (Math.abs(along) > RADIUS) return false;
        const dT = dir.x * alongT.x + dir.z * alongT.z;       // dir · T
        const b = { t: along * dT, half: (Math.abs(dT) * riverHalf + half) / Math.abs(dN) + 1.5 };
        bridges.push(b);          // onBridge closes over `bridges` → sees it immediately
        buildBridgeMesh(b);       // and build its deck + rails
        return true;
      };

      // ---- Roads: grey strips along each centreline, with sandy edge lines. ----
      const roadMat = mat(scene, "road", "#6b6f78");
      const roadEdge = mat(scene, "roadEdge", "#d9c47a");
      for (const r of roads) {
        const road = BABYLON.MeshBuilder.CreateGround("road", { width: 7, height: GROUND }, scene);
        road.rotation.y = r.ang; road.position.y = 0.02; road.material = roadMat; road.receiveShadows = true;
        const nd = { x: r.dir.z, z: -r.dir.x };   // unit perpendicular to the road
        for (const side of [-1, 1]) {
          const edge = BABYLON.MeshBuilder.CreateGround("edge", { width: 0.35, height: GROUND }, scene);
          edge.rotation.y = r.ang; edge.position.y = 0.03; edge.material = roadEdge;
          edge.position.x = nd.x * 3.3 * side;
          edge.position.z = nd.z * 3.3 * side;
        }
      }

      // Central plaza.
      const plaza = disc(scene, "plaza", 5, mat(scene, "plaza", "#caa46a"));
      plaza.rotation.x = Math.PI / 2; plaza.position.y = 0.04; plaza.receiveShadows = true;

      // ---- Lampposts marching along the roads (emissive, no extra GPU lights). ----
      const poleMat = mat(scene, "pole", "#3a3f4a");
      const lampMat = emat(scene, "lamp", "#ffe6a0", 0.9);
      for (const r of roads) {
        const nd = { x: r.dir.z, z: -r.dir.x };
        for (let d = -FAR + 8; d <= FAR - 8; d += 18) {
          for (const side of [-1, 1]) {
            const x = r.dir.x * d + nd.x * 4.4 * side;
            const z = r.dir.z * d + nd.z * 4.4 * side;
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
    // PORTALS as ROAD-EDGE TELEPORTERS (Task 22) — instead of a floating orb on
    // a ground circle, each connection lays a ROAD running from the zone centre
    // out to the map edge in the portal's direction, ending in a themed gateway
    // (trail-head arch / plank jetty / cave mouth) right at the fence. Walking
    // down that road to its end-of-map segment triggers travel, so moving between
    // lands reads as walking a road to the next place. The trigger is a band
    // across the road's full width at the fence — you can't skirt it because the
    // fence stops you before you could go around. Bidirectional: the return road
    // in the target zone places you on the incoming road (placePlayerAtArrival).
    //
    // The trigger geometry stored in `portals` is a road-edge spec:
    //   { to, kind, dir:{x,z}, ang, exitR, half, x, z, name, icon }
    // `dir` is the outward unit vector, `exitR` the radial threshold near the
    // fence, `half` the road half-width; `x,z` is the gateway point (used by the
    // map + arrival). ZoneManager.check tests (radial projection ≥ exitR) ∧
    // (lateral distance to the road ≤ half).
    // =====================================================================
    const PORTAL_ROAD_HALF = 3.6;   // half-width of an exit road / its trigger band
    const exitLanes = [];           // NEW radial roads (wild zones) → folded into onRoad
    const roadEdgeMat = mat(scene, "peRoad", "#6b6f78");
    const roadEdgeLine = mat(scene, "peEdge", "#d9c47a");
    // Pick the outward direction for a portal. In the hub, SNAP to the nearest
    // still-free crossroads ray-end so exits ride the existing, bridge-aware
    // roads (Task 22) instead of cutting new ones across the river. In the wild
    // (no roadLanes), use the zone-data angle and lay a fresh radial road.
    const freeRays = exitRayDirs ? exitRayDirs.slice() : null;
    const chooseExitDir = (angle) => {
      const want = { x: Math.cos(angle), z: Math.sin(angle) };
      if (!freeRays || !freeRays.length) return { dir: want, ridesRoad: false };
      let best = 0, bestDot = -Infinity;
      for (let i = 0; i < freeRays.length; i++) {
        const d = want.x * freeRays[i].x + want.z * freeRays[i].z;
        if (d > bestDot) { bestDot = d; best = i; }
      }
      const dir = freeRays.splice(best, 1)[0];
      return { dir, ridesRoad: true };
    };
    for (const def of zone.portals || []) {
      const pick = chooseExitDir(def.angle);
      const dir = pick.dir;                                            // outward
      const nd = { x: dir.z, z: -dir.x };                              // road normal
      const gateR = RADIUS - 3;                                         // gateway sits just inside the fence
      const gx = dir.x * gateR, gz = dir.z * gateR;
      const portAng = Math.atan2(dir.z, dir.x);                        // the chosen angle
      const roadAng = Math.atan2(dir.x, dir.z);                        // ground-mesh rotation for `dir`
      const tgt = ZONE_BY_ID[def.to];

      if (!pick.ridesRoad) {
        // Wild zone: lay a fresh radial road from the centre to the edge along
        // `dir`, fold it into onRoad, and (defensively) bridge any river crossing.
        exitLanes.push({ dir });
        if (bridgeExitRoad) bridgeExitRoad(dir, PORTAL_ROAD_HALF);
        const road = BABYLON.MeshBuilder.CreateGround("peRoadM" + def.to, { width: PORTAL_ROAD_HALF * 2, height: GROUND }, scene);
        road.rotation.y = roadAng; road.position.set(dir.x * (RADIUS * 0.5), 0.02, dir.z * (RADIUS * 0.5));
        road.material = roadEdgeMat; road.receiveShadows = true; road.isPickable = false;
        for (const s of [-1, 1]) {
          const edge = BABYLON.MeshBuilder.CreateGround("peEdgeM" + def.to + s, { width: 0.35, height: GROUND }, scene);
          edge.rotation.y = roadAng;
          edge.position.set(dir.x * (RADIUS * 0.5) + nd.x * (PORTAL_ROAD_HALF - 0.3) * s,
                            0.03, dir.z * (RADIUS * 0.5) + nd.z * (PORTAL_ROAD_HALF - 0.3) * s);
          edge.material = roadEdgeLine; edge.isPickable = false;
        }
      }

      // The themed gateway AT the edge (faces inward toward the zone centre).
      const face = Math.atan2(-gx, -gz);
      if (def.kind === "cave") {
        const mouth = sphere(scene, "caveMouth" + def.to, 6, mat(scene, "caveDark" + def.to, "#0c0a14"));
        mouth.position.set(gx, 0.2, gz); mouth.scaling.set(1, 1.1, 0.5); mouth.isPickable = false;
        for (const s of [-1, 1]) {
          const bo = BABYLON.MeshBuilder.CreateIcoSphere("caveRock" + def.to + s, { radius: 1.6, subdivisions: 1 }, scene);
          bo.material = mat(scene, "caveRockM", "#5a5466");
          bo.position.set(gx + Math.cos(face) * 2.6 * s, 1.2, gz + Math.sin(face) * 2.6 * s);
          shadow.addShadowCaster(bo);
        }
      } else if (def.kind === "bridge") {
        // A plank jetty running off-map down the road toward the next shore.
        const deck = box(scene, "portBridge" + def.to, PORTAL_ROAD_HALF * 2, 0.25, 7, mat(scene, "portPlank" + def.to, "#9a6a3a"));
        deck.rotation.y = roadAng;
        deck.position.set(gx + dir.x * 2.5, 0.16, gz + dir.z * 2.5);
        deck.receiveShadows = true; shadow.addShadowCaster(deck);
        for (const s of [-1, 1]) {
          const rail = box(scene, "portRail" + def.to + s, 0.18, 0.7, 8, mat(scene, "portRailM" + def.to, "#7a5230"));
          rail.rotation.y = roadAng;
          rail.position.set(gx + dir.x * 2.5 + nd.x * (PORTAL_ROAD_HALF - 0.2) * s, 0.5, gz + dir.z * 2.5 + nd.z * (PORTAL_ROAD_HALF - 0.2) * s);
          shadow.addShadowCaster(rail);
        }
      } else {
        // A trail-head arch straddling the road: two posts + a lintel beam.
        const postMat = mat(scene, "portPost" + def.to, "#7a5230");
        for (const s of [-1, 1]) {
          const post = cyl(scene, "portPostM" + def.to + s, 0.3, 0.34, 4, postMat);
          post.position.set(gx + nd.x * (PORTAL_ROAD_HALF + 0.2) * s, 2, gz + nd.z * (PORTAL_ROAD_HALF + 0.2) * s);
          shadow.addShadowCaster(post);
        }
        const beam = box(scene, "portBeam" + def.to, (PORTAL_ROAD_HALF + 0.2) * 2 + 0.6, 0.4, 0.4, postMat);
        beam.rotation.y = roadAng; beam.position.set(gx, 4, gz); shadow.addShadowCaster(beam);
        // A small carved signpost so the exit reads as "the road to <place>".
        const sign = box(scene, "portSign" + def.to, 1.4, 0.5, 0.12, emat(scene, "portSignM" + def.to, tgt ? tgt.theme.ground : "#ffd98a", 0.35));
        sign.rotation.y = face; sign.position.set(gx + nd.x * (PORTAL_ROAD_HALF + 0.2), 2.4, gz + nd.z * (PORTAL_ROAD_HALF + 0.2));
        sign.isPickable = false;
      }

      // The road-edge trigger spec (no orb). exitR sits just PAST the gateway,
      // right at the fence, so travel fires only when the player walks the road
      // all the way to the boundary (not merely when they wander near a far
      // corner) — yet they can still reach it before moveActor's fence clamp
      // (RADIUS - playerRadius). placePlayerAtArrival drops them well BELOW it so
      // they don't instantly bounce back. `ang` is the CHOSEN (road-snapped) angle.
      portals.push({
        to: def.to, kind: def.kind, dir, ang: portAng,
        exitR: RADIUS - 1.6, half: PORTAL_ROAD_HALF,
        x: gx, z: gz, name: tgt ? tgt.name : def.to, icon: tgt ? tgt.icon : "➡️",
      });
    }
    // Fold the WILD zones' fresh radial exit roads into onRoad so resources never
    // spawn on them (the hub exits ride the crossroads, already covered by onRoad).
    if (exitLanes.length) {
      const prevOnRoad = onRoad;
      onRoad = (x, z) => {
        if (prevOnRoad(x, z)) return true;
        for (const r of exitLanes) if (Math.abs(x * r.dir.z - z * r.dir.x) < PORTAL_ROAD_HALF) return true;
        return false;
      };
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

    // Ambient life: drifting particles + a few wandering critters so the zone
    // breathes (Task 5). Built in buildWorld's scope so its meshes/materials are
    // auto-streamed out; its particle system is disposed explicitly below.
    const ambient = buildAmbientFX(scene, zone, RADIUS, indoor);

    // A gentle shimmer (water + sea) and a bob for beacon/portal orbs, plus a
    // soft sway driven through the WIND animator so foliage feels alive. Wind
    // strength is per-zone (windy peaks, sheltered indoor lairs) and gusts on two
    // offset bands for a more natural, less metronomic rustle.
    const windAmp = (zone.theme && zone.theme.wind != null) ? zone.theme.wind : (indoor ? 0.4 : 1.0);
    const _windObs = scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000;
      if (water) {
        water.position.y = baseWaterY + Math.sin(t * 1.5) * 0.015;
        waterMat.emissiveColor = BABYLON.Color3.FromHexString("#3aa0e0").scale(0.14 + Math.sin(t * 2) * 0.05);
      }
      seaMat.emissiveColor = BABYLON.Color3.FromHexString(seaCol).scale((indoor ? 0.05 : 0.12) + Math.sin(t * 0.8) * 0.03);
      for (const b of animated) b.orb.position.y = b.y + Math.sin(t * 1.5 + b.orb.uniqueId) * 0.4;
      // Wind: foliage crowns lean and rustle on offset sine bands; the gust ebbs
      // and swells on two slow bands so no two trees move in lockstep.
      const gust = 1 + Math.sin(t * 0.5) * 0.4 + Math.sin(t * 0.23 + 1.3) * 0.25;
      for (const s of swayers) {
        const a = Math.sin(t * 1.6 + s.phase) * s.amp * windAmp * gust;
        s.mesh.rotation.z = a;
        s.mesh.rotation.x = Math.cos(t * 1.3 + s.phase) * s.amp * 0.6 * windAmp * gust;
      }
      ambient.update(t);
    });

    // Everything this zone added — used by dispose() to stream the zone out
    // without touching the persistent player/camera or later-spawned entities.
    const _newMesh = (scene.meshes || []).filter((m) => !_bMesh.has(m));
    const _newTN = (scene.transformNodes || []).filter((n) => !_bTN.has(n));
    const _newMat = (scene.materials || []).filter((m) => !_bMat.has(m));
    function dispose() {
      try { scene.onBeforeRenderObservable.remove(_windObs); } catch (e) {}
      try { ambient.dispose(); } catch (e) {}   // stop + free the particle system
      for (const m of _newMesh) { try { m.dispose(); } catch (e) {} }
      for (const n of _newTN) { try { n.dispose(); } catch (e) {} }
      try { if (shadow && shadow.dispose) shadow.dispose(); } catch (e) {}
      try { if (sun && sun.dispose) sun.dispose(); } catch (e) {}
      try { if (hemi && hemi.dispose) hemi.dispose(); } catch (e) {}
      for (const mt of _newMat) { try { if (mt && mt.dispose) mt.dispose(); } catch (e) {} }
    }

    return { shadow, onRoad, obstacles, inRiver, onBridge, roadLanes, moveActor, water, waterMat,
             hemi, sun, sky, skyMat, seaMat, ground, portals, zone, radius: RADIUS, ambient, dispose };
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
      // Layer weather on top of each zone's GRADED fog base (Task 11 opens the
      // view per tier; denser underground), so a storm thickens the opened fog.
      const baseFog = (w && w.zone && ArtDirection.fogDensityFor(w.zone, Quality.tier)) || 0.0019;
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
  // Ambient life (Task 5) — a slow drift of particles (pollen / spores / snow /
  // glowing motes / embers) plus a few wandering CRITTERS (butterflies by day,
  // glowing fireflies in the dark) so every zone feels alive, not static. The
  // per-zone spec is pure data (testable); the build is feature-detected and
  // disposed on zone teardown. Motion is driven by absolute clock time, so it's
  // frame-rate independent (and the critter meshes are auto-cleaned by buildWorld
  // since they're created in its scope; the particle system is disposed here).
  // =========================================================================
  const AMBIENT_SPECS = {
    meadow:  { kind: "pollen", color: "#fff3b0", rate: 24, critter: "butterfly", critters: 6 },
    forest:  { kind: "spore",  color: "#bfe89a", rate: 26, critter: "firefly",   critters: 7 },
    shore:   { kind: "mist",   color: "#dff1ff", rate: 18, critter: "butterfly", critters: 4 },
    peaks:   { kind: "snow",   color: "#ffffff", rate: 34, critter: null,        critters: 0 },
    caverns: { kind: "mote",   color: "#b79cff", rate: 22, critter: "firefly",   critters: 8 },
    thicket: { kind: "ember",  color: "#ffb060", rate: 20, critter: "firefly",   critters: 6 },
  };
  const AMBIENT_FALLBACK = { kind: "mote", color: "#ffffff", rate: 16, critter: null, critters: 0 };
  // Pure: map a zone to its ambient spec (used by buildAmbientFX + the tests).
  function ambientSpecFor(zone) {
    return (zone && AMBIENT_SPECS[zone.id]) || AMBIENT_FALLBACK;
  }

  // Build the ambient particle drift + critter swarm for a zone. Headless-safe
  // (ParticleSystem is feature-detected; critter meshes use the standard helpers,
  // which the harness stubs). Returns { update(t), dispose() }.
  function buildAmbientFX(scene, zone, radius, indoor) {
    const spec = ambientSpecFor(zone);
    const dens = (Quality.settings().ambient != null) ? Quality.settings().ambient : 1;
    const span = (radius || 60) * 0.92;
    const critters = [];   // { node, cx, cz, rx, rz, baseY, spd, ph, wingL, wingR, mesh }
    let ps = null;

    // ---- Wandering critters (cheap tiny meshes; shared materials per type). ----
    if (spec.critters > 0) {
      const c3 = (h) => { try { return BABYLON.Color3.FromHexString(h); } catch (e) { return null; } };
      let critMat = null, wingMat = null, bodyMat = null;
      if (spec.critter === "firefly") {
        critMat = emat(scene, "ambFireM_" + zone.id, spec.color, 1.0);
      } else {
        wingMat = emat(scene, "ambWingM_" + zone.id, spec.color, 0.25);
        if (wingMat) try { wingMat.alpha = 0.92; } catch (e) {}
        bodyMat = mat(scene, "ambBodyM_" + zone.id, "#4a3a2a");
      }
      for (let i = 0; i < spec.critters; i++) {
        // Placement draws rng UNCONDITIONALLY so the world layout stays identical
        // across graphics tiers (the count never varies by tier).
        const a = rng() * Math.PI * 2, rr = 6 + rng() * span;
        const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
        const baseY = (indoor ? 1.4 : 1.8) + rng() * (indoor ? 2.2 : 2.6);
        const orbit = 1.2 + rng() * 2.4, spd = 0.25 + rng() * 0.5, ph = rng() * Math.PI * 2;
        const node = new BABYLON.TransformNode("critter", scene);
        node.position.set(cx, baseY, cz);
        const ent = { node, cx, cz, rx: orbit, rz: orbit * (0.6 + rng() * 0.6), baseY, spd, ph,
                      bobPh: rng() * Math.PI * 2 };
        if (spec.critter === "firefly") {
          const g = tinySphere(scene, "ffly", 0.16, critMat);
          g.parent = node; g.isPickable = false; ent.mesh = g;
        } else {
          const b = tinySphere(scene, "bbody", 0.14, bodyMat);
          b.parent = node; b.isPickable = false;
          const wl = box(scene, "bwing", 0.36, 0.02, 0.26, wingMat); wl.parent = node;
          wl.position.x = -0.18; wl.isPickable = false;
          const wr = box(scene, "bwing", 0.36, 0.02, 0.26, wingMat); wr.parent = node;
          wr.position.x = 0.18; wr.isPickable = false;
          ent.wingL = wl; ent.wingR = wr;
        }
        critters.push(ent);
      }
    }

    // ---- Drifting particle field (feature-detected; gated by the quality tier). ----
    if (BABYLON.ParticleSystem) {
      try {
        const snow = spec.kind === "snow";
        const cap = Math.max(20, Math.round(spec.rate * (snow ? 7 : 9) * dens));
        const emitter = new BABYLON.TransformNode("ambEmit", scene);
        emitter.position.set(0, indoor ? 7 : 13, 0);
        ps = new BABYLON.ParticleSystem("ambient_" + zone.id, cap, scene);
        const tex = particleTexture(scene); if (tex) ps.particleTexture = tex;
        ps.emitter = emitter;
        ps.minEmitBox = new BABYLON.Vector3(-span, indoor ? -3 : 0, -span);
        ps.maxEmitBox = new BABYLON.Vector3(span, 1, span);
        const col = BABYLON.Color3.FromHexString(spec.color);
        ps.color1 = new BABYLON.Color4(col.r, col.g, col.b, snow ? 0.85 : 0.55);
        ps.color2 = new BABYLON.Color4(col.r, col.g, col.b, snow ? 0.6 : 0.3);
        ps.colorDead = new BABYLON.Color4(col.r, col.g, col.b, 0.0);
        ps.minSize = snow ? 0.1 : 0.06; ps.maxSize = snow ? 0.24 : 0.16;
        ps.minLifeTime = snow ? 5 : 6; ps.maxLifeTime = snow ? 8 : 11;
        ps.emitRate = Math.round(spec.rate * dens);
        if (snow) {
          ps.gravity = new BABYLON.Vector3(0, -1.6, 0);     // gentle falling snow
          ps.direction1 = new BABYLON.Vector3(-0.6, -1.2, -0.6);
          ps.direction2 = new BABYLON.Vector3(0.6, -0.6, 0.6);
          ps.minEmitPower = 0.4; ps.maxEmitPower = 1.0;
        } else {
          ps.gravity = new BABYLON.Vector3(0, spec.kind === "ember" ? 0.5 : -0.15, 0); // near-weightless drift
          ps.direction1 = new BABYLON.Vector3(-0.4, spec.kind === "ember" ? 0.4 : -0.2, -0.4);
          ps.direction2 = new BABYLON.Vector3(0.4, spec.kind === "ember" ? 0.9 : 0.2, 0.4);
          ps.minEmitPower = 0.2; ps.maxEmitPower = 0.7;
        }
        if (BABYLON.ParticleSystem.BLENDMODE_STANDARD != null && !snow) {
          ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE; // additive glow for motes/embers
        }
        ps.updateSpeed = 0.02;
        ps.start();
      } catch (e) { ps = null; }
    }

    return {
      spec, critters, particles: ps ? [ps] : [],
      // Drive critter motion off absolute clock time (frame-rate independent).
      update(t) {
        for (const c of critters) {
          c.node.position.x = c.cx + Math.cos(t * c.spd + c.ph) * c.rx;
          c.node.position.z = c.cz + Math.sin(t * c.spd * 0.85 + c.ph) * c.rz;
          c.node.position.y = c.baseY + Math.sin(t * 1.6 + c.bobPh) * 0.5;
          if (c.wingL) {                       // butterflies flap
            const flap = Math.sin(t * 16 + c.ph) * 0.9;
            c.wingL.rotation.z = flap; c.wingR.rotation.z = -flap;
            c.node.rotation.y = Math.atan2(-Math.sin(t * c.spd + c.ph), Math.cos(t * c.spd * 0.85 + c.ph));
          } else if (c.mesh) {                 // fireflies twinkle (per-mesh scale pulse)
            const tw = 0.7 + (0.5 + 0.5 * Math.sin(t * 3 + c.ph)) * 0.6;
            c.mesh.scaling.setAll(tw);
          }
        }
      },
      dispose() {
        if (ps) { try { ps.stop(); } catch (e) {} try { ps.dispose(); } catch (e) {} }
        if (ps && ps.emitter && ps.emitter.dispose) { try { ps.emitter.dispose(); } catch (e) {} }
      },
    };
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

  // Spawn one artifact somewhere valid and wire it into the interaction/XP systems.
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
          // Artifacts feed the RPG progression: a meaningful chunk of XP plus a
          // small heal + a little coin reward, so grabbing them mid-fight is
          // meaningfully helpful (Task 19 retired the legacy arcade score).
          if (playerRef) Skills.gainXp(playerRef, XP_PER_ARTIFACT);
          state.waveStats.artifacts++;
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
          toast(t("toast.artifact", { xp: XP_PER_ARTIFACT, extra }));
        });
      },
    });
    artifact._it = it; interaction.register(it); state.artifacts.push(artifact);
    return artifact;
  }

  // =========================================================================
  // RESOURCE ECOLOGY (Task 22) — a zone's harvestable resource nodes are now a
  // DETERMINISTIC, PERSISTENT set keyed by zone id, not a fresh batch scattered
  // on every entry. The persistent record per node is the plain data
  //   { kind, x, z, respawn }            (respawn = remaining cooldown seconds)
  // stored in `state.zoneRes[zoneId] = { nodes:[…], regrowAcc, sprouts }`. Live
  // ResourceNode meshes are rebuilt FROM that data on entry (so re-entering a
  // zone reuses the exact same set), depletion is written back on harvest (so a
  // node you mined is still on cooldown when you return), and a NEW node sprouts
  // only after `CONFIG.resourceRegrowSec` of in-game time has passed — never on
  // entry. Every spawn/regrow path enforces a per-kind, per-zone cap.
  //
  // Determinism: the initial scatter + each regrow draw from a per-zone seeded
  // sub-stream (mulberry32 keyed on worldSeed⊕zoneId⊕salt), so population is a
  // pure function of (zone, worldSeed, elapsed in-game time) and never disturbs
  // the global rng() stream that the rest of world-building shares.
  // =========================================================================

  // The per-zone resource MIX (kind → desired count) and its placement bands.
  // Counts are clamped to CONFIG.resourceCaps below, so the mix can never exceed
  // a kind's cap. The hub is richer (it's home); the wild zones are themed.
  function resourceMixFor(zone) {
    const FAR = (zone.radius || 60) - 6;
    if (zone.home) {
      return [
        { kind: "tree",    n: 16, band: [12, FAR] },
        { kind: "rock",    n: 12, band: [12, FAR] },
        { kind: "herb",    n: 14, band: [10, FAR] },
        { kind: "fiber",   n: 10, band: [10, FAR] },
        { kind: "crystal", n: 7,  band: [Math.min(50, FAR - 4), FAR] },
        { kind: "water",   n: 8,  band: [FAR - 8, FAR] },
      ];
    }
    const byZone = {
      forest:  [["tree", 6], ["herb", 6], ["fiber", 4]],
      shore:   [["water", 6], ["fiber", 5], ["rock", 3]],
      peaks:   [["crystal", 5], ["rock", 6], ["herb", 2]],
      caverns: [["crystal", 6], ["rock", 5]],
      thicket: [["herb", 5], ["fiber", 5], ["tree", 4]],
    };
    const spec = byZone[zone.id] || [["herb", 4], ["rock", 4]];
    return spec.map(([kind, n]) => ({ kind, n, band: [10, FAR] }));
  }

  // The per-zone cap for one resource kind (Task 22).
  function resourceCap(kind) {
    const caps = CONFIG.resourceCaps || {};
    return caps[kind] != null ? caps[kind] : (CONFIG.resourceCapDefault || 12);
  }

  // A tiny self-contained mulberry32 so the planner is reproducible from a key
  // WITHOUT consuming the shared rng() stream (whose call count varies with how
  // much scenery a zone built). Returns a function in [0,1).
  function seededStream(key) {
    let a = key >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Stable 32-bit key from the world seed, a zone id and a salt (so each zone +
  // purpose gets its own deterministic sub-stream).
  function zoneKey(zoneId, salt) {
    let h = (getSeed() >>> 0) ^ ((salt | 0) * 0x9e3779b1);
    for (let i = 0; i < zoneId.length; i++) h = Math.imul(h ^ zoneId.charCodeAt(i), 0x01000193);
    return h >>> 0;
  }

  // Pick a valid {x,z} inside a band that avoids roads + river (so nodes never
  // sit on a path or in the water). `rand` is the per-zone stream; `okAt` the
  // world's placement guard. Returns null after a few tries.
  function pickResourceSpot(rand, world, band, tries) {
    const minR = band[0], maxR = Math.max(band[0] + 1, band[1]);
    for (let i = 0; i < (tries || 24); i++) {
      const a = rand() * Math.PI * 2, r = minR + rand() * (maxR - minR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r <= 8) continue;
      if (world.onRoad && world.onRoad(x, z)) continue;
      if (world.inRiver && world.inRiver(x, z)) continue;
      return { x, z };
    }
    return null;
  }

  // PURE: build the INITIAL deterministic node set for a zone (positions +
  // kinds), honouring each kind's per-zone cap and the global cap. Driven by the
  // per-zone seeded stream so it is identical every time the zone is generated.
  function planInitialResources(zone, world) {
    const rand = seededStream(zoneKey(zone.id, 1));
    const mix = resourceMixFor(zone);
    const nodes = [];
    for (const s of mix) {
      const cap = resourceCap(s.kind);
      const want = Math.min(s.n, cap);
      for (let i = 0; i < want; i++) {
        if (nodes.length >= CONFIG.maxResourceNodes) break;
        const p = pickResourceSpot(rand, world, s.band, 24);
        if (!p) continue;
        nodes.push({ kind: s.kind, x: round3(p.x), z: round3(p.z), respawn: 0 });
      }
    }
    return nodes;
  }

  // Count live nodes of one kind in a record list.
  function countKind(nodes, kind) {
    let n = 0; for (const r of nodes) if (r.kind === kind) n++; return n;
  }

  // Advance a zone's regrowth clock by `dt` seconds of in-game time and sprout a
  // single new node each time the cadence elapses (only for a kind still under
  // its per-zone cap, and never past the global cap). Deterministic: the Nth
  // sprout draws from a seeded stream keyed on (seed, zone, sproutIndex). Returns
  // the list of newly-added node records (so the caller can build their meshes).
  function regrowZoneResources(rec, zone, world, dt) {
    const added = [];
    if (!world) return added;
    rec.regrowAcc = (rec.regrowAcc || 0) + Math.max(0, dt);
    const cadence = CONFIG.resourceRegrowSec || 45;
    let guard = 6; // cap sprouts per tick so a huge dt can't flood the zone
    while (rec.regrowAcc >= cadence && guard-- > 0) {
      rec.regrowAcc -= cadence;
      if (rec.nodes.length >= CONFIG.maxResourceNodes) continue;
      const idx = (rec.sprouts | 0);
      const rand = seededStream(zoneKey(zone.id, 1000 + idx));
      // Choose, from this zone's mix, a kind that is still under its cap.
      const mix = resourceMixFor(zone);
      const under = [];
      for (const s of mix) if (countKind(rec.nodes, s.kind) < resourceCap(s.kind)) under.push(s);
      rec.sprouts = idx + 1;
      if (!under.length) continue; // every kind is at cap → nothing to add
      const s = under[(rand() * under.length) | 0];
      const p = pickResourceSpot(rand, world, s.band, 24);
      if (!p) continue;
      const node = { kind: s.kind, x: round3(p.x), z: round3(p.z), respawn: 0 };
      rec.nodes.push(node);
      added.push(node);
    }
    return added;
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }

  // Get (creating on first touch) a zone's persistent resource record. On first
  // entry the deterministic initial set is planned; on re-entry the stored set is
  // returned untouched (so no fresh batch piles up).
  function zoneResourceRecord(state, zone, world) {
    if (!state.zoneRes) state.zoneRes = {};
    let rec = state.zoneRes[zone.id];
    if (!rec) {
      rec = { nodes: planInitialResources(zone, world), regrowAcc: 0, sprouts: 0 };
      state.zoneRes[zone.id] = rec;
    }
    return rec;
  }

  // Build the live ResourceNode meshes for a zone from its persistent records,
  // wiring each node back to its record so harvest/respawn write through (so the
  // depletion state survives travel + reload). Honours the global live cap.
  function buildResourceNodes(scene, world, interaction, player, state) {
    const rec = zoneResourceRecord(state, world.zone, world);
    for (const data of rec.nodes) {
      if (state.resources.length >= CONFIG.maxResourceNodes) break;
      state.resources.push(new ResourceNode(
        scene, world.shadow, interaction,
        new BABYLON.Vector3(data.x, 0, data.z), data.kind, player, state, data));
    }
  }

  // Dispose the active zone's live resource meshes and rebuild them from its
  // (possibly just-restored) persistent record (Task 22). Used by applySave when
  // a run is restored INTO the zone already on screen, so the live set matches
  // the saved set exactly. No-op without a world.
  function rebuildZoneResources(state) {
    const world = state.world; if (!world) return;
    const interaction = interactionRef;
    for (const r of state.resources) { try { r.dispose(); } catch (e) {} }
    state.resources.length = 0;
    buildResourceNodes(state.scene, world, interaction, playerRef, state);
  }

  // Per-frame regrow tick for the ACTIVE zone (Task 22). Advances its in-game
  // regrow clock and materialises any sprouted node, so new resources appear
  // gradually over time rather than in a fresh batch on every entry. Headless-
  // safe (guards on world/interaction); pause-correct (dt is the play-loop dt).
  function growZoneResources(state, dt) {
    const world = state.world; if (!world) return;
    if (!state.zoneRes) return;            // nothing planned yet (pre-content)
    const rec = state.zoneRes[world.zone.id]; if (!rec) return;
    const added = regrowZoneResources(rec, world.zone, world, dt);
    if (!added.length) return;
    const interaction = interactionRef;
    for (const data of added) {
      if (state.resources.length >= CONFIG.maxResourceNodes) break;
      state.resources.push(new ResourceNode(
        state.scene, world.shadow, interaction,
        new BABYLON.Vector3(data.x, 0, data.z), data.kind, playerRef, state, data));
    }
  }

  // The quest-givers whose home landmark belongs to a given zone (Task 38). Each
  // story NPC stands at a landmark (`loc`) that now carries a `zone`; vendor NPCs
  // (the alchemist) are placed separately as dedicated shop vendors and never
  // appear here. Pure + headless-safe so the placement is unit-testable.
  function questGiversForZone(zoneId) {
    return NPC_DATA.filter((data) => !data.vendor && landmarkZone(data.loc) === zoneId);
  }

  // Spawn the story NPCs that live in THIS zone, at their landmark, registered as
  // interactables at the existing talk range. Called for EVERY zone (not only the
  // hub) so quest-givers are present + talkable in their own land — and freshly
  // re-registered after each ZoneManager teardown → rebuild. Deterministic (the
  // QuestGiver positions itself from its landmark coordinates) and disposed on
  // teardown with the rest of `state.npcs`.
  function spawnZoneNpcs(scene, world, interaction, state) {
    for (const data of questGiversForZone(world.zone.id)) {
      state.npcs.push(new QuestGiver(scene, world.shadow, interaction, data, (npc) => Dialogue.talk(npc)));
    }
  }

  // =========================================================================
  // populateAdventure — lay the HUB-only story fixtures on the freshly built
  // home world: the deterministic resource set and the castle build site on
  // Castle Hill. (Story NPCs are placed per-zone by spawnZoneNpcs so they appear
  // in their own land, not only the hub.) Called once after the hub is built.
  // =========================================================================
  function populateAdventure(scene, world, interaction, player, state) {
    // Resource nodes: built from the zone's DETERMINISTIC, PERSISTENT record
    // (Task 22) so re-entering the hub reuses the same set instead of scattering
    // a fresh batch. Per-kind caps + the time-gated regrow are enforced there.
    buildResourceNodes(scene, world, interaction, player, state);
    // The castle build site.
    state.castle = new CastleSite(scene, world.shadow, interaction, player, state);
    CastleUI.setSite(state.castle);
  }

  // =========================================================================
  // setupZoneContent — lay the per-zone CONTENT layer on a freshly built world.
  // EVERY zone gets its resident story NPCs (quest-givers placed at the landmark
  // that belongs to that zone — Task 38) and its themed, deterministic resource
  // set. The hub (Meadowgate) additionally gets the merchant, blacksmith,
  // alchemist, the castle build site and a few artifacts. Monsters are handled
  // separately by the SpawnDirector.
  // =========================================================================
  function setupZoneContent(scene, world, interaction, player, state) {
    const zone = world.zone;
    if (zone.home) {
      const merchant = new Merchant(scene, world.shadow, interaction, () => Shop.openShop("merchant"));
      state.merchant = merchant; merchant.show();
      const blacksmith = new Blacksmith(scene, world.shadow, interaction, () => Anvil.openAnvil());
      state.blacksmith = blacksmith; blacksmith.show();
      // The dedicated alchemist (Task 21): sells potions + basic ingredients.
      const alchemist = new Alchemist(scene, world.shadow, interaction, () => Shop.openShop("alchemist"));
      state.alchemist = alchemist; alchemist.show();
      populateAdventure(scene, world, interaction, player, state);
      // Re-raise any castle parts already built this run, then re-wake the
      // dragon if the keep was finished but it hasn't been slain.
      if (state.castleBuilt && state.castleBuilt.length && state.castle) state.castle.restore(state.castleBuilt);
      if (state.castle) state.castle.resummon();
      for (let i = 0; i < 3; i++) spawnArtifact(scene, world, interaction, player, state);
    } else {
      state.merchant = null; state.blacksmith = null; state.alchemist = null; state.castle = null;
      // Wild zones get their themed resource set from the same DETERMINISTIC,
      // PERSISTENT planner (Task 22) — so gathering still works out in the world,
      // counts stay stable across travel, and per-kind caps hold everywhere.
      buildResourceNodes(scene, world, interaction, player, state);
    }
    // Story NPCs live in EVERY zone now (Task 38): spawn this zone's quest-givers
    // at their landmarks, registered as interactables, so talk → Dialogue →
    // accept / turn-in works in the wild lands, not only the hub.
    spawnZoneNpcs(scene, world, interaction, state);
  }

  // Fire "reach a location" quest objectives when the player gets close enough to
  // a landmark IN THE CURRENT ZONE (Task 38: landmarks now live in their own land,
  // so a reach only counts while standing in that land). Zone-entry reaches (a
  // whole zone as the target) are fired separately by the ZoneManager.
  function checkLocations(state, player) {
    const zoneId = state.world && state.world.zone && state.world.zone.id;
    for (const loc of LOCATIONS) {
      if (landmarkZone(loc.id) !== zoneId) continue;
      const dx = player.position.x - loc.x, dz = player.position.z - loc.z;
      if (Math.hypot(dx, dz) <= CONFIG.questReachRange) Quests.onReach(loc.id);
    }
  }

  // =========================================================================
  // Item cards — shared rendering for the shop and inventory. Builds a row for
  // one item def with its icon, name (rarity-tinted), stat summary and a button.
  // =========================================================================
  // A one-line stat summary for an item def. When an INSTANCE is supplied the
  // numbers fold in its enhancement level + rolled affixes (so the bag/anvil show
  // the item's true power), otherwise the plain base block is shown (shop wares).
  function statSummary(def, inst) {
    const parts = [];
    const s = inst ? effectiveStats(inst) : (def.stats || {});
    if (def.potion) {
      const p = def.potion;
      if (p.heal) parts.push(t("stat.healthRestore", { n: p.heal }));
      if (p.buff) parts.push(t("stat.buffWrap", { inner: statSummary({ stats: p.buff }), t: p.time }));
      return parts.join(" · ") || (def.id ? tItemDesc(def) : "");
    }
    if (def.weapon) {
      const w = def.weapon;
      const mult = inst ? enhanceMult(def, instLevel(inst)) : 1;
      parts.push(w.ranged ? (w.shape === "arrow" ? t("stat.rangedArrow") : t("stat.rangedBolt")) : t("stat.melee"));
      parts.push(t("stat.dmg", { n: +(w.damage * mult).toFixed(1) }));
      if (w.multishot > 1) parts.push(t("stat.multishot", { n: w.multishot }));
      const pierce = (w.pierce || 0) + (inst ? (s.pierce || 0) : 0);
      if (pierce) parts.push(t("stat.pierce", { n: pierce }));
      parts.push(def.hands === 2 ? t("stat.twoHanded") : t("stat.oneHanded"));
    }
    if (s.maxHealth) parts.push(t("stat.hp", { n: Math.round(s.maxHealth) }));
    if (s.damageReduction) parts.push(t("stat.resist", { n: Math.round(s.damageReduction * 100) }));
    if (s.moveSpeed) parts.push(t("stat.speed", { n: +s.moveSpeed.toFixed(1) }));
    if (s.damage) parts.push(t("stat.damageBonus", { n: +s.damage.toFixed(1) }));
    if (s.haste) parts.push(t("stat.haste", { n: Math.round((1 - s.haste) * 100) }));
    if (s.lifesteal) parts.push(t("stat.lifestealBonus", { n: +s.lifesteal.toFixed(1) }));
    if (s.coinRange) parts.push(t("stat.coinMagnet"));
    return parts.join(" · ");
  }

  // The enchantment chips (prefixes first, then suffixes) for an item instance.
  function affixChipsHtml(inst) {
    if (!inst || !inst.affixes || !inst.affixes.length) return "";
    const order = (id) => (AFFIXES[id] && AFFIXES[id].kind === "prefix" ? 0 : 1);
    const ids = inst.affixes.slice().sort((a, b) => order(a) - order(b));
    const chips = ids.map((id) => `<span class="affix-chip">✦ ${tAffixLabel(id)}</span>`).join("");
    return `<div class="affix-row">${chips}</div>`;
  }

  // A compact "what changes if I equip this" line for the bag's compare tooltips.
  function compareDeltaHtml(player, inst) {
    const d = equipDelta(player, inst);
    const keys = Object.keys(d);
    if (!keys.length) return `<div class="cmp cmp-same">${t("inv.compareSame")}</div>`;
    const fmt = (k, v) => {
      const sg = v > 0 ? "+" : "−", a = Math.abs(v);
      if (k === "maxHealth") return `${sg}${Math.round(a)} ❤`;
      if (k === "damageReduction") return `${sg}${Math.round(a * 100)}% 🛡️`;
      if (k === "speed") return `${sg}${a.toFixed(1)} 👟`;
      if (k === "lifesteal") return `${sg}${+a.toFixed(1)} 🩸`;
      if (k === "damage") return `${sg}${+a.toFixed(1)} 💥`;
      if (k === "coinRange") return `${sg}${Math.round(a)} 🪙`;
      return `${sg}${+a.toFixed(1)}`;
    };
    const parts = keys.map((k) => `<span class="cmp-chip ${d[k] > 0 ? "up" : "down"}">${fmt(k, d[k])}</span>`).join("");
    return `<div class="cmp">${parts}</div>`;
  }

  function itemCard(def, btnLabel, btnClass, disabled, onClick, extraTag, level, inst, belowHtml) {
    const row = document.createElement("div");
    row.className = "shop-item rarity-" + def.rarity;
    const rar = RARITY[def.rarity] || RARITY.normal;
    const tag = extraTag ? `<span class="tag">${extraTag}</span>` : "";
    const lvl = level ? ` <span class="lvl">+${level}</span>` : "";
    row.innerHTML =
      `<div class="icon">${def.icon}</div>` +
      `<div class="info"><div class="name" style="color:${rar.color}">${tItemName(def)}${lvl}${tag}</div>` +
      `<div class="desc">${statSummary(def, inst) || tItemDesc(def)}</div>${affixChipsHtml(inst)}${belowHtml || ""}</div>`;
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
  // Shop — vendors BUY your wares and SELL their stock. Two specialised vendors
  // share this one UI (Task 21): the travelling MERCHANT sells gear + a rotating
  // rare/featured tab; the ALCHEMIST sells potions + basic ingredients. Either
  // vendor's Sell tab buys back ANY item (gear, potions, materials), so the bag
  // never traps junk. The resale value comes from each item's ITEM_DB `value`.
  // =========================================================================
  // The sell-back worth of one unit of an item instance. Enhanced gear recoups
  // part of what was forged in; stackable items sell for their flat value.
  function sellWorth(inst) {
    const def = getDef(inst.id);
    if (!def) return 0;
    return def.value + Math.round(def.value * 0.5 * instLevel(inst));
  }

  const Shop = {
    state: null, player: null, open: false, tab: "buy", vendor: "merchant",

    init(state, player) { this.state = state; this.player = player; },

    // vendor: "merchant" (gear) | "alchemist" (potions + ingredients).
    openShop(vendor) {
      if (this.open) return;
      if (Inventory.open) Inventory.close();
      if (Anvil.open) Anvil.close();
      this.vendor = vendor === "alchemist" ? "alchemist" : "merchant";
      this.open = true; uiPaused = true; this.tab = "buy";
      dom.shop.classList.remove("hidden");
      this._applyVendorChrome();
      this.render();
    },
    closeShop() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      dom.shop.classList.add("hidden");
    },
    setTab(tab) { this.tab = tab; this.render(); },

    // Swap the dialog title/tagline + hide the gear-only "Rare" tab for the
    // alchemist (who has no featured-gear rotation).
    _applyVendorChrome() {
      const alch = this.vendor === "alchemist";
      if (dom.shopTitle) dom.shopTitle.innerHTML = t(alch ? "shop.titleAlchemist" : "shop.title");
      if (dom.shopTagline) dom.shopTagline.innerHTML = t(alch ? "shop.taglineAlchemist" : "shop.tagline");
      if (dom.shopTabRare) dom.shopTabRare.classList.toggle("hidden", alch);
    },

    // Buy gear (a fresh, clean instance into the bag).
    buy(def, cost) {
      cost = cost == null ? def.cost : cost;
      if (this.state.coins < cost) { toast(t("toast.noCoins")); Sfx.play("error"); return; }
      if (this.player.inventory.length >= this.player.invCap) { toast(t("toast.bagFull")); Sfx.play("error"); return; }
      this.state.coins -= cost;
      invAdd(this.player, makeItem(def.id));
      updateCoins(this.state);
      Sfx.play("buy");
      toast(t("toast.bought", { icon: def.icon, name: tItemName(def) }));
      Session.mark(); // persist on purchase (Task 17)
      this.render();
    },
    // Buy a stackable item (potion or ingredient) into the unified bag.
    buyPotion(def) {
      if (this.state.coins < def.cost) { toast(t("toast.noCoins")); Sfx.play("error"); return; }
      if (bagAdd(this.player, def.id, 1) <= 0) { toast(t("toast.bagFull")); Sfx.play("error"); return; }
      this.state.coins -= def.cost;
      updateCoins(this.state);
      updatePotionBar(this.player);
      Sfx.play("buy");
      toast(t("toast.bought", { icon: def.icon, name: tItemName(def) }));
      Session.mark(); // persist on purchase (Task 17)
      this.render();
    },
    // Sell one item: a whole gear instance, or ONE unit off a stackable stack.
    sell(inst) {
      const def = getDef(inst.id);
      if (!def) return;
      const worth = sellWorth(inst);
      if (inst.count != null) {
        // Stackable: peel one off; drop the stack when it empties.
        inst.count -= 1;
        if (inst.count <= 0) invRemove(this.player, inst);
        if (def.type === "potion") syncPotionSlots(this.player);
      } else {
        invRemove(this.player, inst);
      }
      this.state.coins += worth;
      updateCoins(this.state);
      updatePotionBar(this.player);
      Sfx.play("coin");
      toast(t("toast.sold", { name: enhanceName(tItemName(def), instLevel(inst)), worth }));
      Session.mark(); // persist on sale (Task 17)
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
      const alch = this.vendor === "alchemist";

      if (this.tab === "buy") {
        if (alch) {
          this._heading(t("shop.potions"));
          for (const id of POTION_STOCK) {
            const def = getDef(id);
            const card = itemCard(def, t("btn.buyCost", { cost: def.cost }), "buy-btn potion-buy-btn", this.state.coins < def.cost || full(),
              () => this.buyPotion(def));
            dom.shopItems.appendChild(card);
          }
          this._heading(t("shop.ingredients"));
          for (const id of INGREDIENT_STOCK) {
            const def = getDef(id);
            const card = itemCard(def, t("btn.buyCost", { cost: def.cost }), "buy-btn potion-buy-btn", this.state.coins < def.cost || full(),
              () => this.buyPotion(def), "", 0, null, `<div class="stack-count inline">${t("shop.owned", { n: bagCount(this.player, id) })}</div>`);
            dom.shopItems.appendChild(card);
          }
        } else {
          this._heading(t("shop.gear"));
          for (const id of SHOP_STOCK) {
            const def = getDef(id);
            const card = itemCard(def, t("btn.buyCost", { cost: def.cost }), "buy-btn", this.state.coins < def.cost || full(),
              () => this.buy(def));
            dom.shopItems.appendChild(card);
          }
        }
      } else if (this.tab === "rare" && !alch) {
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
          const worth = sellWorth(inst);
          const below = inst.count != null ? `<div class="stack-count inline">×${inst.count}</div>` : "";
          const card = itemCard(def, t("btn.sellWorth", { worth }), "buy-btn sell-btn", false,
            () => this.sell(inst), def.rarity !== "normal" ? tRarityLabel(def.rarity).toUpperCase() : "", instLevel(inst), inst, below);
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
    tab: "gear",        // gear | materials | potions
    filter: "all",      // all | weapon | armor | jewelry  (gear tab)
    sort: "rarity",     // rarity | type | name            (gear tab)
    picked: null,       // accessible tap-to-pick: a pending potion/slot source
    _potionDrops: null, // live quick-slot drop targets (rebuilt each render)

    init(state, player) { this.state = state; this.player = player; },

    toggle() { if (this.open) this.close(); else this.openInv(); },
    openInv() {
      if (this.open) return;
      if (Shop.open) Shop.closeShop();
      if (Anvil.open) Anvil.close();
      this.open = true; uiPaused = true;
      this.picked = null;
      dom.inventory.classList.remove("hidden");
      this.render();
    },
    close() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      this.picked = null;
      dom.inventory.classList.add("hidden");
    },

    setTab(tab) { this.tab = tab; this.picked = null; this.render(); },
    setFilter(f) { this.filter = f; this.render(); },
    setSort(s) { this.sort = s; this.render(); },
    equip(inst) { equipItem(this.player, inst); this.render(); if (Shop.open) Shop.render(); },
    unequip(slot) { unequipSlot(this.player, slot); recomputeStats(this.player); this.render(); },
    // Drink the potion in quick-slot `slot` (consumes from the bag stack).
    drink(slot) { if (potionUse(this.player, slot)) this.render(); },
    // Drink one of a bag potion directly by id (applies its effect, consumes one
    // from the bag). Routes through potionUse via a temporary quick-slot-less
    // path: apply the effect, then bagSpend.
    drinkBag(id) { if (drinkPotionById(this.player, id)) { updatePotionBar(this.player); this.render(); } },

    render() {
      if (!this.open) return;
      const p = this.player;
      this._renderEquip(p);
      this._renderSets(p);
      this._renderStats(p);
      this._renderTabs();
      this._renderControls();
      if (this.tab === "materials") this._renderMaterials(p);
      else if (this.tab === "potions") this._renderPotions(p);
      else this._renderGear(p);
    },

    // The 12-slot paper-doll. Filled gear slots show rarity colour + level +
    // enchantment chips and unequip on click.
    _renderEquip(p) {
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
            `<div class="slot-item" style="color:${rar.color}">${def.icon} ${enhanceName(tItemName(def), instLevel(occ))}</div>` +
            affixChipsHtml(occ);
          cell.title = t("inv.unequipTitle", { name: tItemName(def) });
          cell.addEventListener("click", () => this.unequip(slot));
        } else {
          cell.innerHTML = `<div class="slot-label">${slotLabel}</div><div class="slot-empty">${t("inv.empty", { icon: meta.icon })}</div>`;
        }
        dom.invEquip.appendChild(cell);
      }
    },

    // Active equipment-set progress + which threshold bonuses are live.
    _renderSets(p) {
      if (!dom.invSets) return;
      const sets = activeSets(p.equipment);
      if (!sets.length) { dom.invSets.innerHTML = ""; return; }
      let html = `<div class="set-title">${t("inv.setBonus")}</div>`;
      for (const s of sets) {
        const chips = s.bonuses.map((b) =>
          `<span class="set-chip ${b.met ? "met" : ""}">${b.threshold}: ${statSummary({ stats: b.stats })}</span>`).join("");
        const foot = s.next ? t("inv.setNext", { n: s.next }) : t("inv.setComplete");
        html += `<div class="set-row"><div class="set-name">${t("inv.setProgress", { name: tSetName(s.id), n: s.count, total: s.total })}</div>` +
          `<div class="set-chips">${chips}</div><div class="set-foot">${foot}</div></div>`;
      }
      dom.invSets.innerHTML = html;
    },

    _renderStats(p) {
      const w = p.weapon;
      dom.invStats.innerHTML =
        `<div class="stat-row"><span>${t("inv.maxHealth")}</span><b>${Math.round(p.maxHealth)}</b></div>` +
        `<div class="stat-row"><span>${t("inv.resist")}</span><b>${Math.round(p.damageReduction * 100)}%</b></div>` +
        `<div class="stat-row"><span>${t("inv.speed")}</span><b>${p.speed.toFixed(1)}</b></div>` +
        `<div class="stat-row"><span>${t("inv.lifesteal")}</span><b>${+p.lifesteal.toFixed(1)}</b></div>` +
        `<div class="stat-row"><span>${t("inv.weapon")}</span><b>${w.name}</b></div>` +
        `<div class="stat-row"><span>${t("inv.damage")}</span><b>${(+w.damage.toFixed(1))}${w.multishot > 1 ? " ×" + w.multishot : ""}</b></div>`;
    },

    _renderTabs() {
      const set = (el, on) => { if (el && el.classList) el.classList.toggle("active", on); };
      set(dom.invTabGear, this.tab === "gear");
      set(dom.invTabMaterials, this.tab === "materials");
      set(dom.invTabPotions, this.tab === "potions");
    },

    // Filter + sort toggles, shown only on the gear tab.
    _renderControls() {
      if (!dom.invControls) return;
      if (this.tab !== "gear") { dom.invControls.innerHTML = ""; return; }
      dom.invControls.innerHTML = "";
      const group = (label, current, opts, on) => {
        const wrap = document.createElement("div");
        wrap.className = "inv-ctl";
        wrap.innerHTML = `<span class="inv-ctl-label">${label}</span>`;
        for (const o of opts) {
          const b = document.createElement("button");
          b.className = "chip-btn" + (current === o.id ? " active" : "");
          b.textContent = o.label;
          b.addEventListener("click", o.act);
          wrap.appendChild(b);
        }
        return wrap;
      };
      dom.invControls.appendChild(group(t("inv.filterLabel"), this.filter, [
        { id: "all", label: t("inv.filterAll"), act: () => this.setFilter("all") },
        { id: "weapon", label: t("inv.kindWeapon"), act: () => this.setFilter("weapon") },
        { id: "armor", label: t("inv.kindArmor"), act: () => this.setFilter("armor") },
        { id: "jewelry", label: t("inv.kindJewelry"), act: () => this.setFilter("jewelry") },
      ]));
      dom.invControls.appendChild(group(t("inv.sortLabel"), this.sort, [
        { id: "rarity", label: t("inv.sortRarity"), act: () => this.setSort("rarity") },
        { id: "type", label: t("inv.sortType"), act: () => this.setSort("type") },
        { id: "name", label: t("inv.sortName"), act: () => this.setSort("name") },
      ]));
    },

    // The filtered + sorted bag of gear, each card carrying enchant chips and a
    // live compare-vs-equipped delta line.
    _renderGear(p) {
      dom.invBag.innerHTML = "";
      const title = document.createElement("div");
      title.className = "bag-title";
      title.textContent = t("inv.bag", { n: p.inventory.length, cap: p.invCap });
      dom.invBag.appendChild(title);

      let list = p.inventory.filter((it) => isGear(it.id));
      if (this.filter !== "all") list = list.filter((it) => itemCategory(getDef(it.id)) === this.filter);
      const rank = (it) => (RARITY[getDef(it.id).rarity] || RARITY.normal).tier;
      list = list.slice().sort((a, b) => {
        if (this.sort === "name") return tItemName(getDef(a.id)).localeCompare(tItemName(getDef(b.id)));
        if (this.sort === "type") return getDef(a.id).type.localeCompare(getDef(b.id).type) || rank(b) - rank(a);
        return rank(b) - rank(a) || instLevel(b) - instLevel(a); // rarity (desc)
      });

      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "shop-empty"; empty.textContent = t("inv.bagEmpty");
        dom.invBag.appendChild(empty);
        return;
      }
      for (const inst of list) {
        const def = getDef(inst.id);
        const card = itemCard(def, t("btn.equip"), "buy-btn equip-btn", false,
          () => this.equip(inst),
          def.rarity !== "normal" ? tRarityLabel(def.rarity).toUpperCase() : "",
          instLevel(inst), inst, compareDeltaHtml(p, inst));
        dom.invBag.appendChild(card);
      }
    },

    // Crafting materials, surfaced as bag stacks (read-only; spent by crafting/
    // quests, sellable at the alchemist).
    _renderMaterials(p) {
      dom.invBag.innerHTML = "";
      const title = document.createElement("div");
      title.className = "bag-title"; title.textContent = t("inv.matsTitle");
      dom.invBag.appendChild(title);
      const owned = MATERIAL_IDS.filter((id) => bagCount(p, id) > 0);
      if (owned.length === 0) {
        const empty = document.createElement("div");
        empty.className = "shop-empty"; empty.textContent = t("inv.matsEmpty");
        dom.invBag.appendChild(empty);
        return;
      }
      for (const id of owned) {
        const m = MATERIALS[id] || {};
        const row = document.createElement("div");
        row.className = "shop-item stack-row";
        row.innerHTML = `<div class="icon">${m.icon || "▫"}</div>` +
          `<div class="info"><div class="name">${tMaterialLabel(id)}</div></div>` +
          `<div class="stack-count">×${bagCount(p, id)}</div>`;
        dom.invBag.appendChild(row);
      }
    },

    // The potions tab (Task 21): the 3 combat QUICK-SLOTS as drag targets across
    // the top, then the bag's potion stacks below. Drag a bag potion onto a slot
    // to assign it; drag a slotted potion onto another slot to move/swap, or onto
    // empty space to clear it. Tap-to-pick is the accessible fallback. Drinking a
    // bag potion (or a quick-slot) consumes one from the bag stack.
    _renderPotions(p) {
      dom.invBag.innerHTML = "";
      this._potionDrops = [];   // rebuilt every render so drops resolve to live cards

      // ---- The 3 assignable quick-slots ----
      const slotTitle = document.createElement("div");
      slotTitle.className = "bag-title"; slotTitle.textContent = t("inv.quickSlots");
      dom.invBag.appendChild(slotTitle);
      const hint = document.createElement("p");
      hint.className = "inv-pot-hint"; hint.textContent = t("inv.potDragHint");
      dom.invBag.appendChild(hint);
      const slotRow = document.createElement("div");
      slotRow.className = "pot-slots";
      for (let i = 0; i < POTION_SLOTS; i++) {
        const id = p.potionSlots[i];
        const def = id ? getDef(id) : null;
        const have = id ? bagCount(p, id) : 0;
        const card = document.createElement("div");
        card.className = "pot-slot-card pot-droptarget" + (def ? " filled" : "");
        // Stable, locale-independent test hooks (mirrors the Saves screen rows).
        if (card.dataset) { card.dataset.potSlot = String(i); card.dataset.filled = def ? "1" : "0"; }
        const pickedHere = this.picked && this.picked.kind === "slot" && this.picked.slot === i;
        if (pickedHere) card.classList.add("picked");
        card.innerHTML = `<div class="pot-slot-key">${i + 4}</div>` +
          (def ? `<div class="pot-slot-icon">${def.icon}</div>` +
                 `<div class="pot-slot-name">${tItemName(def)}</div>` +
                 `<div class="pot-slot-count">×${have}</div>`
               : `<div class="pot-slot-empty">${t("inv.slotEmpty")}</div>`);
        this._potionDrops.push({ el: card, slot: i, occupantId: id || null });
        // Tap to complete a pending pick, or (on a filled slot) pick it up.
        card.addEventListener("click", () => this.tapSlot(i, id || null));
        if (def) {
          card.classList.add("draggable");
          this._wirePotionDrag(card, { kind: "slot", slot: i, id, icon: def.icon });
        }
        slotRow.appendChild(card);
      }
      dom.invBag.appendChild(slotRow);

      // ---- The bag's potion stacks (drag onto a slot, or Drink straight away) ----
      const bagTitle = document.createElement("div");
      bagTitle.className = "bag-title"; bagTitle.textContent = t("inv.potionsTitle");
      dom.invBag.appendChild(bagTitle);
      const stacks = p.inventory.filter((it) => it && it.count != null && getDef(it.id) && getDef(it.id).type === "potion");
      if (stacks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "shop-empty"; empty.textContent = t("inv.potionsEmpty");
        dom.invBag.appendChild(empty);
        return;
      }
      for (const inst of stacks) {
        const def = getDef(inst.id);
        const below = `<div class="stack-count inline">×${inst.count}</div>`;
        const slotted = p.potionSlots.includes(inst.id);
        const picked = this.picked && this.picked.kind === "roster" && this.picked.id === inst.id;
        const card = itemCard(def, t("inv.drinkOne"), "buy-btn potion-buy-btn", false,
          () => this.drinkBag(inst.id), slotted ? t("inv.slottedTag") : "", 0, null, below);
        card.classList.add("draggable", "pot-bag-card");
        if (picked) card.classList.add("picked");
        if (card.dataset) card.dataset.potBag = inst.id;   // stable test hook
        // A bag potion is the drag SOURCE (roster → slot assigns it).
        this._wirePotionDrag(card, { kind: "roster", id: inst.id, icon: def.icon });
        // Tap-to-pick a bag potion (accessible fallback) — tapping the card body
        // (anywhere but the Drink button) picks it up to drop on a quick-slot.
        card.addEventListener("click", (e) => {
          if (e && e.target && e.target.tagName === "BUTTON") return; // the Drink button
          this.tapPick({ kind: "roster", id: inst.id });
        });
        // An explicit, unambiguous "Assign" button (accessible + a clean test
        // hook): picks this potion so the next quick-slot tap assigns it.
        const pickBtn = document.createElement("button");
        pickBtn.className = "buy-btn pot-pick-btn" + (picked ? " active" : "");
        pickBtn.textContent = picked ? t("inv.picked") : t("inv.assign");
        if (pickBtn.dataset) pickBtn.dataset.potPick = inst.id;
        pickBtn.addEventListener("click", (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.tapPick({ kind: "roster", id: inst.id }); });
        card.appendChild(pickBtn);
        dom.invBag.appendChild(card);
      }
    },

    // ---- Potion quick-slot drag wiring (reuses the Task 16 pointer-drag model) ----
    // Run the pure dragSlotReducer over the assignment model, then redraw.
    applyPotionDrag(source, target) {
      const cmds = dragSlotReducer(source, target, POTION_SLOTS);
      if (!cmds.length) { this.render(); return false; }
      for (const c of cmds) {
        if (c.op === "assign") assignPotionSlot(this.player, c.slot, c.id);
        else if (c.op === "clear") clearPotionSlot(this.player, c.slot);
      }
      Sfx.play("ui_click");
      this.picked = null;
      updatePotionBar(this.player);
      this.render();
      return true;
    },
    // Accessible (non-drag) fallback: tap a bag potion or a slot to "pick", then
    // tap a slot (or the same item to cancel) to complete the assignment.
    tapPick(source) {
      const same = this.picked && this.picked.kind === source.kind &&
        this.picked.id === source.id && this.picked.slot === source.slot;
      this.picked = same ? null : source;
      Sfx.play("ui_click");
      this.render();
    },
    tapSlot(slot, occupantId) {
      if (!this.picked) {
        if (occupantId != null) this.tapPick({ kind: "slot", slot, id: occupantId });
        return;
      }
      this.applyPotionDrag(this.picked, { kind: "slot", slot, occupantId: occupantId ?? null });
    },
    // Wire a Pointer-Events drag on a bag-potion card or a quick-slot. Falls back
    // to tap-to-pick where Pointer Events aren't available (listener not attached).
    _wirePotionDrag(el, source) {
      if (!el || !pointerDragSupported() || !el.addEventListener) return;
      el.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        if (typeof e.preventDefault === "function") e.preventDefault();
        const startX = e.clientX || 0, startY = e.clientY || 0;
        let dragging = false, ghost = null;
        try { if (el.setPointerCapture && e.pointerId != null) el.setPointerCapture(e.pointerId); } catch (err) {}
        const beginGhost = () => {
          dragging = true;
          el.classList && el.classList.add("dragging");
          try {
            ghost = document.createElement("div");
            ghost.className = "sk-drag-ghost";
            ghost.textContent = source.icon || "🧪";
            ghost.style.left = startX + "px"; ghost.style.top = startY + "px";
            (document.body || document.documentElement).appendChild(ghost);
          } catch (err) { ghost = null; }
        };
        const moveGhost = (x, y) => { if (ghost) { ghost.style.left = x + "px"; ghost.style.top = y + "px"; } };
        const onMove = (ev) => {
          const x = ev.clientX || 0, y = ev.clientY || 0;
          if (!dragging && (Math.abs(x - startX) > 6 || Math.abs(y - startY) > 6)) beginGhost();
          if (dragging) {
            moveGhost(x, y);
            const tgt = dropTargetAt(x, y, this._potionDrops || []);
            for (const t2 of (this._potionDrops || [])) t2.el.classList && t2.el.classList.toggle("drop-hot", !!(tgt && tgt.el === t2.el));
          }
        };
        const cleanup = () => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointercancel", onCancel);
          el.classList && el.classList.remove("dragging");
          if (ghost) { try { ghost.remove(); } catch (err) {} ghost = null; }
          for (const t2 of (this._potionDrops || [])) t2.el.classList && t2.el.classList.remove("drop-hot");
        };
        const onUp = (ev) => {
          const x = ev.clientX || startX, y = ev.clientY || startY;
          cleanup();
          if (!dragging) { this.tapPick(source); return; }
          const tgt = dropTargetAt(x, y, this._potionDrops || []);
          const target = tgt ? { kind: "slot", slot: tgt.slot, occupantId: tgt.occupantId } : { kind: "void" };
          this.applyPotionDrag(source, target);
        };
        const onCancel = () => { const was = dragging; cleanup(); if (!was) this.tapPick(source); };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onCancel);
      });
    },
  };

  // =========================================================================
  // Drag-to-slot reducer (Task 16) — the PURE model behind drag-and-drop skill
  // slotting. A drag is described by a `source` (where the pointer went down) and
  // a `target` (where it came up); this maps the gesture onto the existing pure
  // slot ops (assignSlot / clearSlot) and returns the list of (op, slot, id)
  // commands to apply. Kept DOM-free so it unit-tests in isolation.
  //
  //   source: { kind: "roster", id }            — a skill card in the roster
  //         | { kind: "slot",   slot, id }       — a filled quick-bar slot
  //   target: { kind: "slot",   slot }           — a quick-bar slot (filled/empty)
  //         | { kind: "void" }                   — empty space / off any slot
  //         | null                               — no valid drop (cancel)
  //
  // Rules (mirroring the behaviour the task describes):
  //  - roster → slot      : assign that skill to the slot.
  //  - slot   → other slot: move/swap (assignSlot dedupes; if the target held a
  //                         skill we put it back into the source slot to swap).
  //  - slot   → void       : clear the source slot.
  //  - any    → same slot  : no-op.
  //  - roster → void       : no-op (nothing to clear).
  function dragSlotReducer(source, target, slotCount) {
    const n = slotCount || 0;
    const out = [];
    if (!source) return out;
    const inRange = (s) => typeof s === "number" && s >= 0 && s < n;

    if (source.kind === "roster") {
      if (target && target.kind === "slot" && inRange(target.slot) && source.id) {
        out.push({ op: "assign", slot: target.slot, id: source.id });
      }
      return out; // roster → void / nothing: no-op
    }

    if (source.kind === "slot" && inRange(source.slot)) {
      if (!target || target.kind === "void") {
        out.push({ op: "clear", slot: source.slot });
        return out;
      }
      if (target.kind === "slot" && inRange(target.slot)) {
        if (target.slot === source.slot) return out; // dropped on itself: no-op
        // Swap: the target's current occupant (if any) goes to the source slot.
        if (target.occupantId) out.push({ op: "assign", slot: source.slot, id: target.occupantId });
        else out.push({ op: "clear", slot: source.slot });
        if (source.id) out.push({ op: "assign", slot: target.slot, id: source.id });
      }
    }
    return out;
  }

  // Pointer-based drag controller (Task 16) — ONE reusable utility for touch +
  // mouse from a single code path (Pointer Events + setPointerCapture). Feature-
  // detected: if Pointer Events are unavailable (old browsers / the headless DOM
  // stub) it stays inert and the accessible tap-to-pick fallback drives slotting.
  // It is intentionally thin: it only reports drag start/end with the source &
  // target descriptors the pure reducer consumes — no game logic lives here.
  function pointerDragSupported() {
    return typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
  }
  // Resolve which drop target (a registered element) the pointer is over.
  function dropTargetAt(x, y, targets) {
    if (typeof document === "undefined" || !document.elementFromPoint) return null;
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { el = null; }
    while (el) {
      for (const tgt of targets) if (tgt.el === el) return tgt;
      el = el.parentElement;
    }
    return null;
  }

  // =========================================================================
  // Customizable on-screen control layout (Task 36) — let the player drag the
  // five movable touch controls (the movement joystick, the skill quick-bar, the
  // potion belt, the interact "E" button and the fire/cast button) anywhere on
  // screen and persist that arrangement, the way well-reviewed mobile action
  // games ship a fully customizable HUD.
  //
  // The MODEL is a tiny pure layer so it unit-tests with no DOM:
  //   - A control's position is stored as a resolution-independent VIEWPORT
  //     FRACTION { x, y } in [0,1] (the control's CENTRE), so it survives
  //     rotation / different screens. No entry ⇒ the control keeps its Task-16
  //     CSS default (portrait + the landscape one-thumb arc).
  //   - `clampLayoutPos` keeps a control fully inside the safe area (its half
  //     size + the env(safe-area-inset-*) margins, all expressed as fractions),
  //     so a control can NEVER land off-screen or under a notch — clamped both on
  //     apply AND on load (a layout saved on one device stays safe on another).
  //   - `layoutReducer` maps an editor gesture (set / reset one / reset all) onto
  //     a NEW layout map; `sanitizeLayout` scrubs a parsed save / localStorage
  //     blob (drops unknown ids + non-finite / out-of-range fractions).
  // The DOM layer (`apply`) is thin and fully feature-detected: with no document
  // / no element it no-ops, so the headless suite is unaffected and the defaults
  // stand. Persistence mirrors the existing prefs: a per-device localStorage
  // value (the LIVE source, applied on the start screen before any save loads)
  // AND a copy inside the save (`serializeGame`/`applySave`) so a layout travels
  // with the run; on load a device with no stored layout adopts the save's as its
  // portable default (see ControlLayout.applyFromSave).
  // =========================================================================
  const LAYOUT_KEY = "gg3d_controls";          // localStorage: the per-device control layout
  // The five repositionable controls, each tied to its HUD element id + a label
  // key for the editor handle. Order drives the handle render + the test seam.
  const CONTROL_DEFS = [
    { id: "joystick", el: "joystick", label: "layout.handle.joystick" },
    { id: "skillBar", el: "skillBar", label: "layout.handle.skillBar" },
    { id: "potionBar", el: "potionBar", label: "layout.handle.potionBar" },
    { id: "actionBtn", el: "actionBtn", label: "layout.handle.actionBtn" },
    { id: "castBtn", el: "castBtn", label: "layout.handle.castBtn" },
  ];
  const CONTROL_IDS = CONTROL_DEFS.map((c) => c.id);
  const _isControlId = (id) => CONTROL_IDS.indexOf(id) >= 0;
  const _clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

  // Clamp a centre fraction so the control stays fully inside the safe area.
  // `bounds` carries the control's half-width/height and the safe-area insets,
  // all as fractions of the viewport; the returned centre keeps the control's box
  // within [inset, 1-inset]. When the control is wider/taller than the available
  // band (a tiny viewport) it centres on that axis so it never jumps off-screen.
  // Pure + DOM-free.
  function clampLayoutPos(pos, bounds) {
    bounds = bounds || {};
    const hw = +bounds.halfW || 0, hh = +bounds.halfH || 0;
    const il = +bounds.insetLeft || 0, ir = +bounds.insetRight || 0;
    const it = +bounds.insetTop || 0, ib = +bounds.insetBottom || 0;
    const clampAxis = (v, half, lo, hi) => {
      const min = lo + half, max = 1 - hi - half;
      if (min > max) return (lo + (1 - hi)) / 2;   // band narrower than the control → centre it
      return v < min ? min : v > max ? max : v;
    };
    return {
      x: clampAxis(_clamp01(+pos.x || 0), hw, il, ir),
      y: clampAxis(_clamp01(+pos.y || 0), hh, it, ib),
    };
  }

  // Apply an editor action to a layout map, returning a NEW map (never mutates).
  //   { op: "set",   id, x, y, bounds? } — place a control (clamped when bounds given)
  //   { op: "reset", id }                — drop one control back to its CSS default
  //   { op: "clear" }                    — reset every control to default
  // Unknown ids / ops are ignored. Kept pure so the DOM layer stays thin.
  function layoutReducer(layout, action) {
    const out = {};
    for (const id of CONTROL_IDS) if (layout && layout[id]) out[id] = { x: layout[id].x, y: layout[id].y };
    if (!action || !action.op) return out;
    if (action.op === "clear") return {};
    if (action.op === "reset") { if (_isControlId(action.id)) delete out[action.id]; return out; }
    if (action.op === "set" && _isControlId(action.id)) {
      let p = { x: +action.x, y: +action.y };
      if (!isFinite(p.x) || !isFinite(p.y)) return out;        // garbage → no change
      if (action.bounds) p = clampLayoutPos(p, action.bounds);
      else { p.x = _clamp01(p.x); p.y = _clamp01(p.y); }
      out[action.id] = p;
    }
    return out;
  }

  // Scrub a parsed layout blob (from a save or localStorage) into a clean map:
  // keep only known control ids whose x/y are finite and in [0,1]. Everything
  // else drops out, so a foreign / older / tampered value loads as "default".
  function sanitizeLayout(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const id of CONTROL_IDS) {
      const p = raw[id];
      if (!p || typeof p !== "object") continue;
      const x = +p.x, y = +p.y;
      if (!isFinite(x) || !isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
      out[id] = { x, y };
    }
    return out;
  }

  const ControlLayout = {
    layout: {},        // the live per-control { id: {x,y} } map (empty = all default)
    _loaded: false,

    // Read the per-device layout from localStorage (headless-safe; bad/missing → {}).
    load() {
      if (this._loaded) return this;
      this._loaded = true;
      this.layout = {};
      try {
        const raw = localGet(LAYOUT_KEY);
        if (raw) this.layout = sanitizeLayout(JSON.parse(raw));
      } catch (e) { this.layout = {}; }
      return this;
    },
    save() { try { localSet(LAYOUT_KEY, JSON.stringify(this.layout)); } catch (e) {} },

    // A plain copy for serializeGame (so a layout travels with the save).
    serialize() {
      const out = {};
      for (const id of CONTROL_IDS) if (this.layout[id]) out[id] = { x: this.layout[id].x, y: this.layout[id].y };
      return out;
    },

    // Restore from a SAVE's layout (applySave). The device localStorage value is
    // the live source, so we only ADOPT the save's layout as this device's
    // portable default when the device has none stored yet — otherwise the local
    // arrangement wins and is left untouched. Either way we re-apply to the DOM.
    applyFromSave(saved) {
      this.load();
      const fromSave = sanitizeLayout(saved);
      if (!localGet(LAYOUT_KEY) && Object.keys(fromSave).length) {
        this.layout = fromSave;
        this.save();
      }
      this.apply();
      return this;
    },

    // Replace the live layout wholesale (used by the editor's Save / Reset),
    // persist it and re-apply. `next` is sanitized first.
    set(next, persist) {
      this.layout = sanitizeLayout(next);
      if (persist !== false) this.save();
      this.apply();
      return this;
    },

    // Discard any unsaved live-preview edits: re-read the PERSISTED layout from
    // localStorage into the live map and re-apply. Used by the editor's Cancel so
    // a dragged-but-not-saved arrangement snaps back to what was last saved.
    revert() {
      let stored = {};
      try { const raw = localGet(LAYOUT_KEY); if (raw) stored = sanitizeLayout(JSON.parse(raw)); } catch (e) { stored = {}; }
      this.layout = stored;
      this.apply();
      return this;
    },

    // The live safe-area + viewport facts as fractions, read once per apply. Falls
    // back to sane numbers headless (no window) so the pure clamp still runs.
    _viewport() {
      let w = 0, h = 0;
      try { w = (typeof window !== "undefined" && window.innerWidth) || 0; h = (typeof window !== "undefined" && window.innerHeight) || 0; } catch (e) {}
      if (!w || !h) { w = 411; h = 891; }
      return { w, h };
    },
    // Resolve the safe-area inset (px) for a side via a probe element, so the
    // clamp honours env(safe-area-inset-*). Returns a floor of 12px (matches the
    // CSS) when the API/DOM is unavailable.
    _safeInsets() {
      const fallback = { top: 16, right: 12, bottom: 16, left: 12 };
      if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return fallback;
      try {
        const probe = this._probe || (this._probe = document.createElement("div"));
        if (!probe.parentNode && document.body) {
          probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
            "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
          document.body.appendChild(probe);
        }
        const cs = getComputedStyle(probe);
        const px = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
        return {
          top: Math.max(16, px(cs.paddingTop, 0)),
          right: Math.max(12, px(cs.paddingRight, 0)),
          bottom: Math.max(16, px(cs.paddingBottom, 0)),
          left: Math.max(12, px(cs.paddingLeft, 0)),
        };
      } catch (e) { return fallback; }
    },

    // Build the clamp bounds (fractions) for one control element at the live size.
    boundsFor(elOrSize, vp, insets) {
      vp = vp || this._viewport();
      insets = insets || this._safeInsets();
      let pw = 0, ph = 0;
      if (elOrSize && typeof elOrSize.offsetWidth === "number") { pw = elOrSize.offsetWidth; ph = elOrSize.offsetHeight; }
      else if (elOrSize) { pw = +elOrSize.w || 0; ph = +elOrSize.h || 0; }
      return {
        halfW: vp.w ? (pw / 2) / vp.w : 0,
        halfH: vp.h ? (ph / 2) / vp.h : 0,
        insetLeft: vp.w ? insets.left / vp.w : 0,
        insetRight: vp.w ? insets.right / vp.w : 0,
        insetTop: vp.h ? insets.top / vp.h : 0,
        insetBottom: vp.h ? insets.bottom / vp.h : 0,
      };
    },

    // Push the live layout onto the DOM. Each customized control gets the `gg-moved`
    // class (which neutralizes its CSS right/bottom/transform default) plus inline
    // left/top from its clamped fraction; controls with no custom pos are cleared
    // back to their CSS default. Fully feature-detected → a no-op headless.
    apply() {
      if (typeof document === "undefined") return;
      const vp = this._viewport(), insets = this._safeInsets();
      for (const def of CONTROL_DEFS) {
        const el = dom[def.el];
        if (!el || !el.style) continue;
        const pos = this.layout[def.id];
        if (!pos) {
          el.classList && el.classList.remove("gg-moved");
          el.style.left = ""; el.style.top = ""; el.style.right = ""; el.style.bottom = ""; el.style.transform = "";
          continue;
        }
        const clamped = clampLayoutPos(pos, this.boundsFor(el, vp, insets));
        el.classList && el.classList.add("gg-moved");
        el.style.left = (clamped.x * vp.w) + "px";
        el.style.top = (clamped.y * vp.h) + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.transform = "translate(-50%, -50%)";
      }
    },
  };

  // =========================================================================
  // Control-layout editor (Task 36) — the "Edit control layout" mode reachable
  // from pause → settings (and the start-screen controls panel). It overlays the
  // live HUD with a draggable HANDLE on each movable control, dims everything
  // else, and offers Save / Reset to default / Cancel. The drag reuses the
  // Task-16 pointer-drag pattern (touch + mouse via Pointer Events, the
  // `.sk-drag-ghost`-style floating ghost, the 6px tap/drag threshold) — there is
  // exactly ONE drag stack in the codebase. Everything is feature-detected: with
  // no Pointer Events / no DOM the editor cleanly refuses to open and the saved
  // layout (defaults) still stands, so the headless suite is untouched.
  // =========================================================================
  const ControlLayoutUI = {
    open: false,
    _work: null,        // the working layout copy (committed on Save, dropped on Cancel)
    _wired: false,

    // Build the editor overlay + handles lazily on first open (so the DOM nodes
    // only exist when needed). The handles live in a fixed full-screen layer.
    _ensure() {
      if (this._wired || typeof document === "undefined") return;
      this._wired = true;
      const ov = dom.layoutEditor;
      if (!ov) { this._wired = false; return; }
      if (dom.layoutSave) dom.layoutSave.addEventListener("click", () => this.saveAndClose());
      if (dom.layoutReset) dom.layoutReset.addEventListener("click", () => this.reset());
      if (dom.layoutCancel) dom.layoutCancel.addEventListener("click", () => this.cancel());
    },

    // Can the editor actually run here? Needs Pointer Events + the touch controls
    // (which only show on touch devices) + the overlay DOM. Used to gate the entry
    // buttons (they explain why when it can't) and to keep it headless-safe.
    canEdit() {
      return pointerDragSupported() && isTouch && !!(dom.layoutEditor && dom.touch);
    },

    openUI() {
      if (this.open || typeof document === "undefined") return;
      this._ensure();
      if (!dom.layoutEditor) return;
      // Where the editor can't actually run (no Pointer Events / not a touch
      // device) open in a "no-drag" mode: the overlay still shows, explaining via
      // the hint, with only Cancel — so the entry is never a dead click.
      const draggable = this.canEdit();
      // Working copy starts from the live layout; live-apply edits as they happen.
      this._work = ControlLayout.serialize();
      this.open = true; uiPaused = true;
      if (draggable && dom.touch) dom.touch.classList.remove("hidden");  // show controls to drag
      if (dom.hud) dom.hud.classList.add("layout-editing");
      dom.layoutEditor.classList.toggle("no-drag", !draggable);
      dom.layoutEditor.classList.remove("hidden");
      if (draggable) this.renderHandles(); else this._clearHandles();
    },
    close() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      if (dom.layoutEditor) { dom.layoutEditor.classList.add("hidden"); dom.layoutEditor.classList.remove("no-drag"); }
      if (dom.hud) dom.hud.classList.remove("layout-editing");
      // Re-hide the touch controls if this isn't a touch device (we force-showed them).
      if (!isTouch && dom.touch) dom.touch.classList.add("hidden");
      this._clearHandles();
    },
    cancel() {
      // Drop any unsaved working edits: snap the live layout back to the last
      // SAVED arrangement (the live-preview drags mutated ControlLayout.layout).
      ControlLayout.revert();
      Sfx.play("ui_click");
      this.close();
    },
    saveAndClose() {
      ControlLayout.set(this._work, true);
      Session.flush();                 // mirror into the in-progress run snapshot too
      Sfx.play("ui_click");
      toast(t("layout.saved"));
      this.close();
    },
    reset() {
      this._work = {};
      ControlLayout.set({}, false);    // live-preview the defaults (persist on Save)
      Sfx.play("ui_click");
      toast(t("layout.wasReset"));
      this.renderHandles();
    },

    _clearHandles() {
      if (!dom.layoutHandles) return;
      try { dom.layoutHandles.innerHTML = ""; } catch (e) {}
    },

    // Lay a labelled drag handle over each control at its current on-screen box,
    // and wire the Task-16-style pointer-drag on it. Re-called after a Reset / a
    // drop so the handles track the controls.
    renderHandles() {
      if (!dom.layoutHandles || typeof document === "undefined") return;
      this._clearHandles();
      for (const def of CONTROL_DEFS) {
        const ctrl = dom[def.el];
        if (!ctrl || !ctrl.getBoundingClientRect) continue;
        const r = ctrl.getBoundingClientRect();
        const handle = document.createElement("div");
        handle.className = "layout-handle";
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", t(def.label));
        handle.style.left = (r.left + r.width / 2) + "px";
        handle.style.top = (r.top + r.height / 2) + "px";
        handle.style.width = Math.max(48, r.width) + "px";
        handle.style.height = Math.max(48, r.height) + "px";
        const tag = document.createElement("span");
        tag.className = "layout-handle-tag";
        tag.textContent = t(def.label);
        handle.appendChild(tag);
        dom.layoutHandles.appendChild(handle);
        this._wireHandle(handle, def);
      }
    },

    // Pointer-drag one handle (Task-16 pattern: 6px threshold, floating ghost via
    // the shared `.sk-drag-ghost` look, setPointerCapture). On drop the control's
    // new CENTRE fraction is written into the working copy (clamped to the safe
    // area) and live-applied. Falls back to inert where Pointer Events are absent.
    _wireHandle(handle, def) {
      if (!handle || !pointerDragSupported() || !handle.addEventListener) return;
      handle.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        if (typeof e.preventDefault === "function") e.preventDefault();
        const startX = e.clientX || 0, startY = e.clientY || 0;
        let dragging = false, ghost = null;
        try { if (handle.setPointerCapture && e.pointerId != null) handle.setPointerCapture(e.pointerId); } catch (err) {}

        const begin = () => {
          dragging = true;
          handle.classList && handle.classList.add("dragging");
          try {
            ghost = document.createElement("div");
            ghost.className = "sk-drag-ghost layout-ghost";
            ghost.textContent = t(def.label);
            ghost.style.left = startX + "px"; ghost.style.top = startY + "px";
            (document.body || document.documentElement).appendChild(ghost);
          } catch (err) { ghost = null; }
        };
        const place = (x, y) => {
          const vp = ControlLayout._viewport();
          const ctrl = dom[def.el];
          const bounds = ControlLayout.boundsFor(ctrl, vp);
          const pos = clampLayoutPos({ x: vp.w ? x / vp.w : 0, y: vp.h ? y / vp.h : 0 }, bounds);
          this._work = layoutReducer(this._work, { op: "set", id: def.id, x: pos.x, y: pos.y });
          ControlLayout.set(Object.assign(ControlLayout.serialize(), this._work), false);
        };
        const onMove = (ev) => {
          const x = ev.clientX || 0, y = ev.clientY || 0;
          if (!dragging && (Math.abs(x - startX) > 6 || Math.abs(y - startY) > 6)) begin();
          if (dragging) {
            if (ghost) { ghost.style.left = x + "px"; ghost.style.top = y + "px"; }
            handle.style.left = x + "px"; handle.style.top = y + "px";
            place(x, y);
          }
        };
        const cleanup = () => {
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onCancel);
          handle.classList && handle.classList.remove("dragging");
          if (ghost) { try { ghost.remove(); } catch (err) {} ghost = null; }
        };
        const onUp = (ev) => {
          const x = ev.clientX || startX, y = ev.clientY || startY;
          const was = dragging;
          cleanup();
          if (was) { place(x, y); this.renderHandles(); }
        };
        const onCancel = () => { cleanup(); this.renderHandles(); };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onCancel);
      });
    },
  };

  // =========================================================================
  // Skills overlay (Task 14) — manage the skill roster, FUSE up to three owned
  // skills into a new one, and assign skills to the 3-slot quick bar. Opens with
  // the ✨ button or the "K" key. Mirrors the Inventory overlay's open/close/
  // render contract; freezes gameplay (uiPaused) while open.
  //
  // Slotting (Task 16): drag a roster skill onto a quick-bar slot to assign it,
  // drag a slotted skill onto another slot to move/swap, or drag it onto empty
  // space to clear it (Pointer Events, touch + mouse). A tap-to-pick → tap-slot
  // fallback stays available for keyboard / headless / no-Pointer-Events.
  // =========================================================================
  const SkillsUI = {
    state: null, player: null, open: false,
    sel: [],   // skill ids selected for fusion (up to MAX_FUSE_INPUTS)
    picked: null,  // accessible tap-to-pick: a pending {kind,id|slot} awaiting a slot tap
    _drag: null,   // live pointer-drag bookkeeping (the floating ghost + source)

    init(state, player) { this.state = state; this.player = player; },

    toggle() { if (this.open) this.close(); else this.openUI(); },
    openUI() {
      if (this.open) return;
      if (Shop.open) Shop.closeShop();
      if (Anvil.open) Anvil.close();
      if (Inventory.open) Inventory.close();
      this.open = true; uiPaused = true;
      this.sel = [];
      if (dom.skills) dom.skills.classList.remove("hidden");
      this.render();
    },
    close() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      this.picked = null;
      if (dom.skills) dom.skills.classList.add("hidden");
    },

    // Toggle a skill in/out of the fusion selection (cap at MAX_FUSE_INPUTS).
    pick(id) {
      const i = this.sel.indexOf(id);
      if (i >= 0) this.sel.splice(i, 1);
      else if (this.sel.length < MAX_FUSE_INPUTS) this.sel.push(id);
      Sfx.play("ui_click");
      this.render();
    },
    assign(slot, id) { Skills.assignSlot(this.player, slot, id); Sfx.play("ui_click"); this.render(); },
    clear(slot) { Skills.clearSlot(this.player, slot); Sfx.play("ui_click"); this.render(); },

    // Run the pure reducer's commands against the (pure) slot model, then redraw.
    applyDrag(source, target) {
      const cmds = dragSlotReducer(source, target, SKILL_SLOTS);
      if (!cmds.length) { this.render(); return false; }
      for (const c of cmds) {
        if (c.op === "assign") Skills.assignSlot(this.player, c.slot, c.id);
        else if (c.op === "clear") Skills.clearSlot(this.player, c.slot);
      }
      Sfx.play("ui_click");
      this.picked = null;
      this.render();
      return true;
    },

    // Accessible (non-drag) fallback: tap a roster skill or a slot to "pick" it,
    // then tap a slot (or the same item again to cancel) to complete the move.
    tapPick(source) {
      const same = this.picked && this.picked.kind === source.kind &&
        this.picked.id === source.id && this.picked.slot === source.slot;
      this.picked = same ? null : source;
      Sfx.play("ui_click");
      this.render();
    },
    tapSlot(slot, occupantId) {
      if (!this.picked) {
        // Nothing picked yet: tapping a filled slot picks it up for a move/clear.
        if (occupantId != null) this.tapPick({ kind: "slot", slot, id: occupantId });
        return;
      }
      this.applyDrag(this.picked, { kind: "slot", slot, occupantId: occupantId ?? null });
    },

    // Wire a Pointer-Events drag on a roster card or a quick-bar slot. `source`
    // is the descriptor handed to the reducer; drop targets are resolved live
    // from the rendered slot cards. Falls back to tap-to-pick where Pointer
    // Events aren't available (the listener is simply never attached).
    _wireDrag(el, source) {
      if (!el || !pointerDragSupported() || !el.addEventListener) return;
      el.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;  // primary button / touch only
        if (typeof e.preventDefault === "function") e.preventDefault();
        const startX = e.clientX || 0, startY = e.clientY || 0;
        let dragging = false, ghost = null;
        try { if (el.setPointerCapture && e.pointerId != null) el.setPointerCapture(e.pointerId); } catch (err) {}

        const beginGhost = () => {
          dragging = true;
          el.classList && el.classList.add("dragging");
          try {
            ghost = document.createElement("div");
            ghost.className = "sk-drag-ghost";
            ghost.textContent = source.icon || "✨";
            ghost.style.left = startX + "px"; ghost.style.top = startY + "px";
            (document.body || document.documentElement).appendChild(ghost);
          } catch (err) { ghost = null; }
        };
        const moveGhost = (x, y) => { if (ghost) { ghost.style.left = x + "px"; ghost.style.top = y + "px"; } };

        const onMove = (ev) => {
          const x = ev.clientX || 0, y = ev.clientY || 0;
          if (!dragging && (Math.abs(x - startX) > 6 || Math.abs(y - startY) > 6)) beginGhost();
          if (dragging) {
            moveGhost(x, y);
            const tgt = dropTargetAt(x, y, this._dropTargets || []);
            for (const t2 of (this._dropTargets || [])) t2.el.classList && t2.el.classList.toggle("drop-hot", !!(tgt && tgt.el === t2.el));
          }
        };
        const cleanup = () => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointercancel", onCancel);
          el.classList && el.classList.remove("dragging");
          if (ghost) { try { ghost.remove(); } catch (err) {} ghost = null; }
          for (const t2 of (this._dropTargets || [])) t2.el.classList && t2.el.classList.remove("drop-hot");
        };
        const onUp = (ev) => {
          const x = ev.clientX || startX, y = ev.clientY || startY;
          cleanup();
          if (!dragging) { this.tapPick(source); return; }   // a tap, not a drag
          const tgt = dropTargetAt(x, y, this._dropTargets || []);
          const target = tgt ? { kind: "slot", slot: tgt.slot, occupantId: tgt.occupantId } : { kind: "void" };
          this.applyDrag(source, target);
        };
        const onCancel = () => { const was = dragging; cleanup(); if (!was) this.tapPick(source); };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onCancel);
      });
    },
    doFuse() {
      const made = Skills.fuse(this.state, this.player, this.sel);
      if (made) { this.sel = []; updateSkillsHud(this.player); this.render(); }
    },

    render() {
      if (!this.open || !this.player) return;
      this._renderHeader();
      this._renderToolbar();
      this._renderFusion();
      this._renderList();
    },

    // Stat chips for a skill card (power/heal + cost + cooldown + effect extras).
    _chips(def) {
      const c = [];
      if (def.effect === "heal") c.push(`<span class="sk-chip">${t("skills.statHeal", { power: def.power })}</span>`);
      else if (def.effect === "buff") c.push(`<span class="sk-chip">${t("skills.statBuff", { s: def.duration || 0 })}</span>`);
      else c.push(`<span class="sk-chip">${t("skills.statPower", { power: def.power || 0 })}${def.count ? "×" + def.count : ""}</span>`);
      if (def.effect === "nova") c.push(`<span class="sk-chip">${t("skills.statAoe", { radius: def.radius || 0 })}</span>`);
      c.push(`<span class="sk-chip">${t("skills.statCost", { cost: def.cost || 0 })}</span>`);
      c.push(`<span class="sk-chip">${t("skills.statCooldown", { s: def.cooldown || 0 })}</span>`);
      return c.join("");
    },
    _srcTag(def) {
      const k = def.generated ? "srcFused" : def.source === "boss" ? "srcBoss" : "srcBase";
      return `<span class="sk-src ${def.generated ? "fused" : def.source}">${t("skills." + k)}</span>`;
    },

    _renderHeader() {
      if (!dom.skillsHeader) return;
      const pr = this.player.progress;
      dom.skillsHeader.innerHTML =
        `<div class="sk-hd-level">${t("skills.level", { level: pr.level })}</div>` +
        `<div class="sk-hd-bar"><div class="sk-hd-xp" style="width:${Math.min(100, (pr.xp / (xpToNext(pr.level) || 1)) * 100)}%"></div></div>` +
        `<div class="sk-hd-sub">${t("skills.xp", { xp: pr.xp, next: xpToNext(pr.level) })} · ${t("skills.focus", { focus: Math.floor(pr.focus), max: maxFocusForLevel(pr.level) })}</div>`;
    },

    // A small button element with a direct listener (avoids querySelector so the
    // headless DOM stub — which has no querySelector — never throws on render).
    _btn(cls, label, onClick, asHtml) {
      const b = document.createElement("button");
      b.className = cls;
      if (asHtml) b.innerHTML = label; else b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    },

    _renderToolbar() {
      if (!dom.skillsToolbar) return;
      const pr = this.player.progress;
      dom.skillsToolbar.innerHTML = "";
      this._dropTargets = [];   // rebuilt every render so drops resolve to live cards
      const title = document.createElement("div");
      title.className = "sk-section-title"; title.textContent = t("skills.toolbar");
      dom.skillsToolbar.appendChild(title);
      const hint = document.createElement("p");
      hint.className = "sk-fuse-hint"; hint.textContent = t("skills.slotHint");
      dom.skillsToolbar.appendChild(hint);
      const row = document.createElement("div");
      row.className = "sk-slots";
      for (let i = 0; i < SKILL_SLOTS; i++) {
        const id = pr.slots[i];
        const def = Skills.def(this.player, id);
        const card = document.createElement("div");
        card.className = "sk-slot-card sk-droptarget" + (def ? " filled" : "");
        const pickedHere = this.picked && this.picked.kind === "slot" && this.picked.slot === i;
        if (pickedHere) card.classList.add("picked");
        if (def) card.style.borderColor = (ELEMENTS[def.element] || {}).color || "#888";
        card.innerHTML = `<div class="sk-slot-key">${i + 1}</div>` +
          (def ? `<div class="sk-slot-icon">${def.icon}</div><div class="sk-slot-name">${tSkillName(def)}</div>`
               : `<div class="sk-slot-empty">${t("skills.slotEmpty")}</div>`);
        // Register as a drop target for the drag controller.
        this._dropTargets.push({ el: card, slot: i, occupantId: id || null });
        // Tap to complete a pending pick, or (on a filled slot) to pick it up.
        card.addEventListener("click", () => this.tapSlot(i, id || null));
        // A filled slot is itself draggable (move/swap/clear).
        if (def) {
          card.classList.add("draggable");
          this._wireDrag(card, { kind: "slot", slot: i, id, icon: def.icon });
        }
        row.appendChild(card);
      }
      dom.skillsToolbar.appendChild(row);
    },

    _renderFusion() {
      if (!dom.skillsFusion) return;
      dom.skillsFusion.innerHTML = "";
      const title = document.createElement("div");
      title.className = "sk-section-title"; title.textContent = t("skills.fusion");
      dom.skillsFusion.appendChild(title);
      const defs = this.sel.map((id) => Skills.def(this.player, id)).filter(Boolean);
      if (defs.length < 2) {
        const hint = document.createElement("p");
        hint.className = "sk-fuse-hint";
        hint.textContent = defs.length === 1 ? t("skills.fuseNeedMore", { n: 1 }) : t("skills.fuseHint");
        dom.skillsFusion.appendChild(hint);
        return;
      }
      const preview = fuseSkills(defs);
      const cost = fusionCost(defs);
      const coinsOk = this.state.coins >= cost.coins;
      const crysOk = bagCount(this.player, "crystal") >= cost.crystal;
      const body = document.createElement("div");
      body.innerHTML =
        `<div class="sk-fuse-row">${defs.map((d) => `${d.icon} ${tSkillName(d)}`).join(" + ")}</div>` +
        `<div class="sk-fuse-result" style="border-color:${(ELEMENTS[preview.element] || {}).color}">` +
          `<span class="sk-slot-icon">${preview.icon}</span> ` +
          `<span>${t("skills.fuseResult", { name: tSkillName(preview) })}</span>` +
          `<span class="sk-chips">${this._chips(preview)}</span></div>` +
        `<div class="sk-fuse-cost"><span class="${coinsOk ? "" : "bad"}">🪙 ${cost.coins}</span> · ` +
          `<span class="${crysOk ? "" : "bad"}">🔮 ${cost.crystal}</span></div>`;
      dom.skillsFusion.appendChild(body);
      const btn = this._btn("start-btn", t("skills.fuseBtn"), () => this.doFuse(), false);
      if (!(coinsOk && crysOk)) btn.disabled = true;
      dom.skillsFusion.appendChild(btn);
    },

    _renderList() {
      if (!dom.skillsList) return;
      dom.skillsList.innerHTML = "";
      const defs = Skills.ownedDefs(this.player);
      if (!defs.length) {
        const e = document.createElement("p");
        e.className = "shop-tagline"; e.textContent = t("skills.none");
        dom.skillsList.appendChild(e); return;
      }
      // Sort: source (base, boss, fused) then tier desc.
      const order = { base: 0, boss: 1, fused: 2 };
      defs.sort((a, b) => (order[a.generated ? "fused" : a.source] - order[b.generated ? "fused" : b.source]) || (skillTier(b) - skillTier(a)));
      const pr = this.player.progress;
      for (const def of defs) {
        const id = def.id;
        const selected = this.sel.includes(id);
        const slotted = pr.slots.indexOf(id);
        const pickedHere = this.picked && this.picked.kind === "roster" && this.picked.id === id;
        const card = document.createElement("div");
        card.className = "skill-card draggable" + (selected ? " selected" : "") + (pickedHere ? " picked" : "");
        card.style.borderLeftColor = (ELEMENTS[def.element] || {}).color || "#888";
        const top = document.createElement("div");
        top.innerHTML =
          `<div class="sk-card-head"><span class="sk-drag-grip" aria-hidden="true">⣿</span>` +
          `<span class="sk-card-icon">${def.icon}</span>` +
          `<span class="sk-card-name">${tSkillName(def)}</span>${this._srcTag(def)}` +
          (slotted >= 0 ? `<span class="sk-slotted-tag">${t("skills.slottedTag", { n: slotted + 1 })}</span>` : "") + `</div>` +
          `<div class="sk-chips">${this._chips(def)}</div>` +
          `<div class="sk-card-desc">${tSkillDesc(def)}</div>`;
        card.appendChild(top);
        const actions = document.createElement("div");
        actions.className = "sk-card-actions";
        actions.appendChild(this._btn("sk-mini fuse-pick" + (selected ? " on" : ""),
          (selected ? "✓ " : "+ ") + t("skills.fuseTag"), () => this.pick(id)));
        card.appendChild(actions);
        // Drag the whole card onto a quick-bar slot to assign it; a plain tap
        // (the accessible fallback) picks it up to drop on the next slot tapped.
        this._wireDrag(top, { kind: "roster", id, icon: def.icon });
        top.addEventListener("click", () => { if (!pointerDragSupported()) this.tapPick({ kind: "roster", id }); });
        dom.skillsList.appendChild(card);
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
          () => this.enhance(inst), `${where} · ${level}/${max}`, level, inst);
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
      Sfx.play("quest_accept");
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
      if (o.type === "gather") return { have: Math.min(o.count, bagCount(this.player, o.target)), need: o.count };
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
      if (o.type === "hunt") return t("obj.hunt", { have: p.have, need: p.need });
      if (o.type === "gather") { const m = MATERIALS[o.target] || {}; return t("obj.gather", { icon: m.icon || "", label: materialRef(o.target), have: p.have, need: p.need }); }
      if (o.type === "reach") return t("obj.reach", { name: placeRef(o.target) }) + dm;
      if (o.type === "talk") { const n = NPC_BY_ID[o.target] || {}; return t("obj.talk", { icon: n.icon || "", name: nounRef("npc", o.target, tNpcName(o.target)) }) + dm; }
      if (o.type === "defeat_boss") { const z = ZONE_BY_ID[o.target] || {}; return t("obj.defeatBoss", { boss: nounRef("lairBoss", o.target, tLairBossName(o.target)), zone: nounRef("zone", z.id, tZoneName(z)) }) + dm; }
      if (o.type === "build") return t("obj.build", { part: nounRef("castlePart", o.target, tCastlePartName(o.target)) }) + dm;
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
      // Completing a quest also grants XP toward the next level.
      Skills.gainXp(this.player, q.line === "side" ? Math.round(XP_PER_QUEST * 0.6) : XP_PER_QUEST);
      Sfx.play("quest_turnin");
      const r = q.reward || {};
      const bits = [];
      if (r.coins) bits.push(`🪙 ${r.coins}`);
      if (r.item && getDef(r.item)) bits.push(`${getDef(r.item).icon} ${tItemName(getDef(r.item))}`);
      if (r.relic && RELICS[r.relic]) bits.push(`${RELICS[r.relic].icon} ${tRelicName(r.relic)}`);
      toast(t("toast.questComplete", { title: tQuestTitle(q), bits: bits.join(" · ") }));
      updateQuestTracker(this);
      if (Inventory.open) Inventory.render();
      Story.afterTurnIn(q);
      Session.mark(); // persist on quest turn-in (Task 17)
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
          toast(t("toast.reached", { name: placeRef(locId) }));
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
    // The giver's icon and a case-declinable noun-ref (RU: dative after "к",
    // instrumental after "с"; English collapses to the plain name).
    giverIcon(npcId) { return (NPC_BY_ID[npcId] || {}).icon || ""; },
    giverRef(npcId) { return nounRef("npc", npcId, tNpcName(npcId)); },
    // The NPC's home location as a declinable noun-ref + its RU preposition
    // (в/на). Falls back to Meadowgate (a plain string) when the NPC has no loc.
    npcPlaceRef(npcId) {
      const n = NPC_BY_ID[npcId]; const l = n && LOCATION_BY_ID[n.loc];
      return l ? nounRef("location", n.loc, tLocationName(n.loc)) : t("place.meadowgate");
    },
    npcPlacePrep(npcId) {
      const n = NPC_BY_ID[npcId]; const meta = n && RU_NOUNS.location[n.loc];
      return (I18N.locale === "ru" && meta && meta.loc) ? meta.loc : "";
    },
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
          return Object.assign(base, { state: "turnin", text: t("guide.turnin", { icon: this.giverIcon(m.npc), giver: this.giverRef(m.npc) }) });
        return Object.assign(base, { state: "do", text: Quests.objectiveText(m) + this._whereSuffix(m) });
      }
      return Object.assign(base, { state: "accept", text: t("guide.accept", { icon: this.giverIcon(m.npc), giver: this.giverRef(m.npc), prep: this.npcPlacePrep(m.npc), place: this.npcPlaceRef(m.npc) }) });
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
    if (except !== SkillsUI && SkillsUI.open) SkillsUI.close();
    if (except !== WorldMapUI && WorldMapUI.open) WorldMapUI.close();
  }

  // =========================================================================
  // WORLD MAP (Task 13) — a live corner MINIMAP, a full-screen MAP overlay
  // (current-zone detail + a world overview of the portal graph), name SEARCH,
  // and a guided WAYPOINT (an on-screen compass arrow + a minimap marker that
  // route the player toward any zone / landmark / NPC, hopping portals across
  // zones). Every canvas draw is feature-detected (headless-safe); the graph,
  // route-finding and bearing/compass math come from src/data/worldmap.js.
  // =========================================================================

  // A 2D context, or null when canvas/getContext is unavailable (headless).
  function ctx2d(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") return null;
    try { return canvas.getContext("2d"); } catch (e) { return null; }
  }
  // Darken/brighten a #rrggbb toward a 0..1 multiplier → "rgb(...)".
  function shadeHex(hex, mul) {
    try {
      const c = BABYLON.Color3.FromHexString(hex);
      const f = (v) => Math.max(0, Math.min(255, Math.round(v * mul * 255)));
      return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
    } catch (e) { return "#5fae4f"; }
  }
  function mmDot(ctx, x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  // A bobbing target ring (the waypoint marker, used when the target is on-map).
  function mmRing(ctx, x, y, r) {
    ctx.save();
    ctx.strokeStyle = "#ffd34e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fillStyle = "#ffd34e"; ctx.fill();
    ctx.restore();
  }
  // A reusable canvas ARROW (shaft + arrowhead) pointing along screen-space
  // direction `(dirX, dirY)` (need not be unit). Shared by the minimap edge marker
  // (and any canvas pointer) so the target direction is unambiguous, unlike a bare
  // triangle. `len` is the shaft length; the head scales with it.
  function drawMapArrow(ctx, x, y, dirX, dirY, len, col) {
    const m = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / m, uy = dirY / m;        // forward (toward the target)
    const px = -uy, py = ux;                    // perpendicular
    const tipX = x + ux * len, tipY = y + uy * len;          // arrowhead tip
    const baseX = x - ux * len * 0.5, baseY = y - uy * len * 0.5; // shaft tail
    const neckX = x + ux * (len * 0.35), neckY = y + uy * (len * 0.35); // head base
    const hw = Math.max(3, len * 0.42);         // arrowhead half-width
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // Shaft.
    ctx.beginPath();
    ctx.moveTo(baseX, baseY); ctx.lineTo(neckX, neckY);
    ctx.lineWidth = Math.max(2, len * 0.28); ctx.strokeStyle = col || "#ffd34e"; ctx.stroke();
    // Arrowhead (filled triangle at the tip).
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(neckX + px * hw, neckY + py * hw);
    ctx.lineTo(neckX - px * hw, neckY - py * hw);
    ctx.closePath();
    ctx.fillStyle = col || "#ffd34e"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "#3a2a00"; ctx.stroke();
    ctx.restore();
  }
  function mmPlayer(ctx, x, y, facing) {
    // North-up, un-mirrored: the arrow points along the screen-space heading so a
    // RIGHT turn in the world rotates the marker RIGHT (see mapHeadingScreen).
    const h = mapHeadingScreen(facing);
    const fx = h.x, fy = h.y;                    // forward (screen dir, y down)
    const px = -fy, py = fx;                     // perpendicular
    ctx.beginPath();
    ctx.moveTo(x + fx * 6.5, y + fy * 6.5);
    ctx.lineTo(x - fx * 3.2 + px * 4, y - fy * 3.2 + py * 4);
    ctx.lineTo(x - fx * 3.2 - px * 4, y - fy * 3.2 - py * 4);
    ctx.closePath();
    ctx.fillStyle = "#ffe27a"; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = "#3a2a00"; ctx.stroke();
  }
  const PORTAL_COL = { path: "#9be36b", bridge: "#6cc6ff", cave: "#c69bff" };
  const NPC_STATUS_COL = { turnin: "#5be0a0", new: "#ffd34e", active: "#6cc6ff", done: "#9aa0a6" };

  // Resolve a {kind,id} waypoint into live guidance for the current zone:
  // { inZone, targetZone, point?, portal?, nextZone?, dx, dz, dist, arrived }.
  function resolveWaypoint(wp, state, player) {
    if (!validWaypoint(wp) || !state || !player) return null;
    const cur = state.zoneId;
    const tz = targetZoneOf(wp.kind, wp.id);
    if (!tz) return null;
    const p = player.position;
    if (cur === tz) {
      const pt = targetPoint(wp.kind, wp.id);
      if (!pt) return { inZone: true, targetZone: tz, dist: 0, arrived: true };
      const dx = pt.x - p.x, dz = pt.z - p.z, dist = Math.hypot(dx, dz);
      return { inZone: true, targetZone: tz, point: pt, dx, dz, dist, arrived: dist <= CONFIG.questReachRange };
    }
    const nextZone = nextZoneStep(cur, tz);
    const portal = (nextZone && state.world) ? (state.world.portals || []).find((pp) => pp.to === nextZone) : null;
    if (!portal) return { inZone: false, targetZone: tz, nextZone, dx: 0, dz: 0, dist: 0, arrived: false };
    const dx = portal.x - p.x, dz = portal.z - p.z;
    return { inZone: false, targetZone: tz, nextZone, portal, dx, dz, dist: Math.hypot(dx, dz), arrived: false };
  }

  // Draw a label with a rounded background plate + soft halo so it stays legible
  // over any map colour (used for the big-map place names, drawn OUTSIDE the clip).
  function mapLabelText(ctx, text, x, y, opts) {
    if (!ctx.fillText) return;
    const o = opts || {};
    const fs = o.fontSize || 11;
    ctx.save();
    ctx.font = (o.bold ? "700 " : "") + fs + "px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const padX = 4, padY = 2.5;
    let w = 40; try { w = ctx.measureText(text).width; } catch (e) {}
    const bw = w + padX * 2, bh = fs + padY * 2;
    const bx = x - bw / 2, by = y - bh / 2, r = Math.min(5, bh / 2);
    // Rounded background plate.
    if (ctx.beginPath) {
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(bx, by, bw, bh, r); }
      else {
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
        ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
        ctx.arcTo(bx, by + bh, bx, by, r);
        ctx.arcTo(bx, by, bx + bw, by, r);
      }
      ctx.closePath();
      ctx.fillStyle = o.plate || "rgba(10,13,24,0.66)"; ctx.fill();
    }
    // Halo (dark stroke under the text) then the bright fill.
    if (ctx.strokeText) {
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineJoin = "round"; ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = o.color || "#fff"; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Clamp a screen point to the rim of the map circle (centre `c`, radius `fr`),
  // pulled in by `inset` — where an off-map edge marker sits, pointing outward.
  function edgePoint(c, fr, sx, sy, inset) {
    const dx = sx - c.x, dy = sy - c.y, m = Math.hypot(dx, dy) || 1;
    const rr = Math.max(0, fr - (inset || 0));
    return { x: c.x + (dx / m) * rr, y: c.y + (dy / m) * rr, ux: dx / m, uy: dy / m };
  }

  // Draw the current zone (north-up): fence, resources, monsters, vendors, the
  // castle, portals, NPCs (status-coloured), the waypoint marker and the player
  // arrow. `proj(wx,wz)->{x,y}` maps world to canvas; shared by minimap + map.
  // Place names (when `labels`) are collected during the clipped geometry pass and
  // drawn AFTERWARDS, outside the clip, so text is never cut off by the circle.
  function drawZoneScene(ctx, o) {
    const { W, H, world, state, player, waypoint, proj, scale, labels } = o;
    ctx.clearRect(0, 0, W, H);
    const theme = world.zone.theme || {};
    ctx.fillStyle = shadeHex(theme.ground || "#5fae4f", 0.35);
    ctx.fillRect(0, 0, W, H);
    const c = proj(0, 0), fr = (world.radius || 80) * scale;
    const labelReqs = []; // { x, y, text, priority } collected, laid out after the clip
    ctx.save();
    ctx.beginPath(); ctx.arc(c.x, c.y, fr, 0, Math.PI * 2); ctx.closePath();
    ctx.clip();
    ctx.fillStyle = shadeHex(theme.ground || "#5fae4f", 0.62);
    ctx.beginPath(); ctx.arc(c.x, c.y, fr, 0, Math.PI * 2); ctx.fill();
    // Named landmarks of THIS zone: dots at their in-zone points (Task 38 — the
    // wild lands carry their own landmark now, not just the hub).
    for (const l of LOCATIONS) {
      if (landmarkZone(l.id) !== world.zone.id) continue;
      const s = proj(l.x, l.z); mmDot(ctx, s.x, s.y, labels ? 3 : 2, "rgba(255,240,200,0.5)");
    }
    // Resource nodes (brighter when ready to harvest).
    for (const r of state.resources) {
      const pp = r.root && r.root.position; if (!pp) continue;
      const s = proj(pp.x, pp.z);
      mmDot(ctx, s.x, s.y, 2, (r.respawn || 0) <= 0 ? "#7CFC8A" : "rgba(120,160,110,0.6)");
    }
    // Monsters.
    for (const m of state.monsters) {
      if (!m.alive) continue; const s = proj(m.position.x, m.position.z);
      mmDot(ctx, s.x, s.y, 2.4, "#ff5c6a");
    }
    // Vendors + castle.
    const glyph = (px, pz, col) => { const s = proj(px, pz); mmDot(ctx, s.x, s.y, labels ? 4 : 3.2, col, "#1a1a1a"); };
    if (state.merchant && state.merchant.visible) glyph(state.merchant.root.position.x, state.merchant.root.position.z, "#ffcf3a");
    if (state.blacksmith && state.blacksmith.visible) glyph(state.blacksmith.root.position.x, state.blacksmith.root.position.z, "#ff8a4e");
    if (state.castle && state.castle.root) glyph(state.castle.root.position.x, state.castle.root.position.z, "#ff9d5c");
    // Boss / dragon.
    const liveBoss = state.dragon || state.boss;
    if (liveBoss && liveBoss.alive && liveBoss.position) glyph(liveBoss.position.x, liveBoss.position.z, "#ff3bd0");
    // Road-edge exits (Task 22): draw each as a short ROAD stub running to the
    // rim with a gateway marker at its end, replacing the old portal-orb square,
    // so the map reads "a road leads off here" rather than "a magic circle".
    for (const portal of world.portals || []) {
      const col = PORTAL_COL[portal.kind] || "#ffd98a";
      const s = proj(portal.x, portal.z);
      ctx.save();
      if (portal.dir) {
        // The road stub: centre → the exit point.
        const a = proj(portal.dir.x * (world.radius * 0.55), portal.dir.z * (world.radius * 0.55));
        ctx.strokeStyle = "rgba(225,210,150,0.85)"; ctx.lineWidth = labels ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      // The gateway marker at the rim.
      ctx.fillStyle = col; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
      const hw = 3.5;
      ctx.fillRect(s.x - hw, s.y - hw, hw * 2, hw * 2); ctx.strokeRect(s.x - hw, s.y - hw, hw * 2, hw * 2);
      ctx.restore();
      if (labels) labelReqs.push({ x: s.x, y: s.y, text: (portal.icon || "") + " " + tZoneName(ZONE_BY_ID[portal.to]), priority: 2 });
    }
    // Story NPCs (status-coloured marker).
    for (const n of state.npcs) {
      const pp = n.root && n.root.position; if (!pp) continue;
      const s = proj(pp.x, pp.z);
      let col = "#ffd34e"; try { col = NPC_STATUS_COL[n.status()] || col; } catch (e) {}
      mmDot(ctx, s.x, s.y, labels ? 3.4 : 2.6, col, "#1a1a1a");
    }
    // Waypoint marker. When the target/portal is on the map, ring it; when it is
    // OFF the map (beyond the fence circle), draw an ARROW at the rim pointing the
    // way (so the guide is never lost behind the clip).
    if (waypoint) {
      const g = resolveWaypoint(waypoint, state, player);
      const tgt = g && (g.point || g.portal);
      if (tgt) {
        const s = proj(tgt.x, tgt.z);
        const onMap = Math.hypot(s.x - c.x, s.y - c.y) <= fr - 4;
        if (onMap) { mmRing(ctx, s.x, s.y, 6); }
        else {
          const ep = edgePoint(c, fr, s.x, s.y, labels ? 12 : 8);
          drawMapArrow(ctx, ep.x, ep.y, ep.ux, ep.uy, labels ? 12 : 8, "#ffd34e");
        }
      }
    }
    // The player.
    const ps = proj(player.position.x, player.position.z);
    mmPlayer(ctx, ps.x, ps.y, player.facing || 0);
    ctx.restore();
    // Fence ring + north pip (outside the clip).
    ctx.save();
    ctx.beginPath(); ctx.arc(c.x, c.y, fr, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // Place-name labels — laid out + drawn OUTSIDE the clip so they read fully
    // (clamped to the screen, stacked to avoid overlap, on a haloed plate).
    if (labels && labelReqs.length && ctx.fillText) {
      const placed = layoutMapLabels(labelReqs, W, H, { pad: 12, lineH: 15, estWidth: 96, anchorDy: -9 });
      for (const p of placed) mapLabelText(ctx, p.text, p.x, p.y, { fontSize: 11 });
    }
  }

  // Draw the world overview: the zone graph (nodes + portal links), discovered
  // vs fogged, the current zone and the waypoint target highlighted.
  function drawWorldScene(ctx, o) {
    const { W, H, state, waypoint, proj } = o;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#10131f"; ctx.fillRect(0, 0, W, H);
    const lay = worldLayout();
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2;
    for (const [a, b] of zoneEdges()) {
      if (!lay[a] || !lay[b]) continue;
      const pa = proj(lay[a]), pb = proj(lay[b]);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    const wnLabels = [];
    for (const z of ZONES) {
      if (!lay[z.id]) continue;
      const p = proj(lay[z.id]);
      const discovered = !!(state.discovered && state.discovered[z.id]);
      const here = state.zoneId === z.id;
      mmDot(ctx, p.x, p.y, here ? 13 : 10, discovered ? shadeHex(z.theme.ground, 0.85) : "#2a2f40", here ? "#ffe27a" : "#11131c");
      if (ctx.fillText) {
        ctx.save();
        ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = discovered ? "#fff" : "#7a8090";
        ctx.fillText(discovered ? z.icon : "❓", p.x, p.y + 4);
        ctx.restore();
        if (discovered) wnLabels.push({ x: p.x, y: p.y + 24, text: tZoneName(z), priority: here ? 3 : 1 });
      }
    }
    if (waypoint) {
      const tz = targetZoneOf(waypoint.kind, waypoint.id);
      if (tz && lay[tz]) { const p = proj(lay[tz]); mmRing(ctx, p.x, p.y, 17); }
    }
    // Zone names last, clamped + de-overlapped + haloed, so they read fully.
    if (wnLabels.length && ctx.fillText) {
      const placed = layoutMapLabels(wnLabels, W, H, { pad: 10, lineH: 15, estWidth: 90, anchorDy: 0 });
      for (const p of placed) mapLabelText(ctx, p.text, p.x, p.y, { fontSize: 11, color: "#eef2ff" });
    }
  }

  // The HUD systems: the corner minimap + the compass arrow + the live waypoint.
  const WorldMap = {
    state: null, player: null, camera: null, minimapOn: true, _acc: 0,

    init(state, player, camera) {
      this.state = state; this.player = player; this.camera = camera;
      this.minimapOn = true; this._acc = 0;
      if (dom.minimap && dom.minimap.classList) dom.minimap.classList.toggle("hidden", !this.minimapOn);
      if (dom.compass && dom.compass.classList) dom.compass.classList.toggle("hidden", !(state && state.waypoint));
    },

    setWaypoint(kind, id) {
      if (!this.state || !validWaypoint({ kind, id })) return;
      this.state.waypoint = { kind, id };
      Sfx.play("ui_click");
      toast(t("map.guideSet", { name: WorldMapUI.targetName({ kind, id }) }));
      this.update(0);
    },
    clearWaypoint(silent) {
      if (!this.state || !this.state.waypoint) return;
      this.state.waypoint = null;
      if (!silent) toast(t("map.guideCleared"));
      if (dom.compass && dom.compass.classList) dom.compass.classList.add("hidden");
      if (WorldMapUI.open) WorldMapUI.render();
    },
    toggleMinimap() {
      this.minimapOn = !this.minimapOn;
      if (dom.minimap && dom.minimap.classList) dom.minimap.classList.toggle("hidden", !this.minimapOn);
      if (this.minimapOn) this.renderMinimap();
    },

    // Per-frame: arrival check, compass arrow + label, throttled minimap redraw.
    update(dt) {
      const state = this.state, player = this.player;
      if (!state || !player) return;
      const wp = state.waypoint;
      if (wp) {
        const g = resolveWaypoint(wp, state, player);
        if (!g) this.clearWaypoint(true);
        else if (g.arrived) { toast(t("map.arrived", { name: WorldMapUI.targetName(wp) })); this.clearWaypoint(true); }
        else this._compass(g);
      } else if (dom.compass && dom.compass.classList) {
        dom.compass.classList.add("hidden");
      }
      this._acc += dt;
      if (dt === 0 || this._acc >= 0.08) { this._acc = 0; this.renderMinimap(); }
    },

    _compass(g) {
      if (!dom.compass || !dom.compass.classList) return;
      dom.compass.classList.remove("hidden");
      let camYaw = this.player.facing || 0;
      try {
        const cam = this.camera;
        if (cam && typeof cam.getForwardRay === "function") {
          const d = cam.getForwardRay().direction; camYaw = Math.atan2(d.x, d.z);
        }
      } catch (e) {}
      const ang = relativeHeading(g.dx, g.dz, camYaw);
      if (dom.compassArrow && dom.compassArrow.style) dom.compassArrow.style.transform = `rotate(${ang}rad)`;
      if (dom.compassLabel) {
        const dist = Math.max(0, Math.round(g.dist || 0));
        dom.compassLabel.innerHTML = g.inZone
          ? t("map.compassTo", { name: WorldMapUI.targetName(this.state.waypoint), dist })
          : t("map.compassPortal", {
              kind: t("portalKind." + ((g.portal && g.portal.kind) || "path")),
              prep: zonePrep(g.nextZone),
              zone: nounRef("zone", g.nextZone, tZoneName(ZONE_BY_ID[g.nextZone])), dist });
      }
    },

    renderMinimap() {
      if (!this.minimapOn) return;
      const ctx = ctx2d(dom.minimapCanvas);
      if (!ctx) return;
      const state = this.state, player = this.player, world = state && state.world;
      if (!world) return;
      const cv = dom.minimapCanvas, W = cv.width || 150, H = cv.height || 150;
      const base = (Math.min(W, H) * 0.46) / (world.radius || 80);
      // North-up, un-mirrored: mirror X (−worldX) so a right turn reads as a right
      // turn (mapVecToScreen); +Z stays down so north (−Z) is up.
      const proj = (wx, wz) => ({ x: W / 2 - wx * base, y: H / 2 + wz * base });
      drawZoneScene(ctx, { W, H, world, state, player, waypoint: state.waypoint, proj, scale: base, labels: false });
    },
  };

  // The full-screen world-map overlay: tabs (current zone / world overview),
  // pan + zoom, a name search with results, and a "guide me there" waypoint.
  const WorldMapUI = {
    open: false, tab: "zone", sel: null, query: "", view: null, _drag: null, _wired: false,

    init() {
      this._resetView();
      if (this._wired) return; this._wired = true;
      const cv = dom.mapCanvas;
      if (cv && cv.addEventListener) {
        cv.addEventListener("pointerdown", (e) => {
          this._drag = { x: e.clientX || 0, y: e.clientY || 0, ox: this.view.ox, oy: this.view.oy };
          try { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); } catch (err) {}
        });
        cv.addEventListener("pointermove", (e) => {
          if (!this._drag) return;
          this.view.ox = this._drag.ox + ((e.clientX || 0) - this._drag.x);
          this.view.oy = this._drag.oy + ((e.clientY || 0) - this._drag.y);
          this.renderCanvas();
        });
        const end = () => { this._drag = null; };
        cv.addEventListener("pointerup", end);
        cv.addEventListener("pointercancel", end);
        cv.addEventListener("pointerleave", end);
        cv.addEventListener("wheel", (e) => { this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); if (e.preventDefault) e.preventDefault(); });
      }
    },

    _resetView() { this.view = { scale: 1, ox: 0, oy: 0 }; this._drag = null; },

    targetName(tg) {
      if (!tg) return "";
      if (tg.kind === "zone") return tZoneName(ZONE_BY_ID[tg.id]);
      if (tg.kind === "location") return tLocationName(tg.id);
      if (tg.kind === "npc") return tNpcName(tg.id);
      return "";
    },
    targetIcon(tg) {
      if (!tg) return "📍";
      if (tg.icon) return tg.icon;
      if (tg.kind === "zone") return (ZONE_BY_ID[tg.id] || {}).icon || "🗺️";
      return "📍";
    },

    toggle() { if (this.open) this.close(); else this.openMap(); },
    openMap() {
      if (this.open) return;
      closeOtherMenus(this);
      this.open = true; uiPaused = true;
      this.tab = "zone"; this.query = ""; this.sel = null; this._resetView();
      if (dom.mapSearch) dom.mapSearch.value = "";
      if (dom.worldmap && dom.worldmap.classList) dom.worldmap.classList.remove("hidden");
      this.render();
    },
    close() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      if (dom.worldmap && dom.worldmap.classList) dom.worldmap.classList.add("hidden");
    },

    setTab(tab) { this.tab = tab; this._resetView(); this.render(); },
    zoom(f) {
      this.view.scale = Math.max(0.6, Math.min(4.5, this.view.scale * f));
      this.renderCanvas();
    },
    search(q) { this.query = q || ""; this.renderResults(); },
    selectTarget(tg) {
      this.sel = tg;
      // Jump the right tab so the selection is visible, then frame it.
      if (tg && tg.kind !== "zone" && this.tab === "world") this.tab = "zone";
      this.render();
    },
    guide() {
      if (!this.sel) return;
      WorldMap.setWaypoint(this.sel.kind, this.sel.id);
      this.render();
    },

    render() {
      if (!this.open) return;
      this._syncTabs();
      this.renderResults();
      this.renderInfo();
      this.renderCanvas();
    },
    _syncTabs() {
      const set = (el, on) => { if (el && el.classList) el.classList.toggle("active", on); };
      set(dom.mapTabZone, this.tab === "zone");
      set(dom.mapTabWorld, this.tab === "world");
    },

    renderResults() {
      if (!dom.mapResults) return;
      const order = { zone: 0, location: 1, npc: 2 };
      const results = searchTargets(this.query, (tg) => this.targetName(tg))
        .slice()
        .sort((a, b) => (order[a.kind] - order[b.kind]) || this.targetName(a).localeCompare(this.targetName(b)));
      dom.mapResults.innerHTML = "";
      if (!results.length) {
        const empty = document.createElement("div");
        empty.className = "map-empty"; empty.textContent = t("map.noResults");
        dom.mapResults.appendChild(empty); return;
      }
      for (const tg of results.slice(0, 60)) {
        const tz = targetZoneOf(tg.kind, tg.id);
        const row = document.createElement("button");
        const selected = this.sel && this.sel.kind === tg.kind && this.sel.id === tg.id;
        row.className = "map-result" + (selected ? " sel" : "");
        row.innerHTML =
          `<span class="mr-icon">${this.targetIcon(tg)}</span>` +
          `<span class="mr-name">${this.targetName(tg)}</span>` +
          `<span class="mr-zone">${t("map.kind." + tg.kind)} · ${tZoneName(ZONE_BY_ID[tz])}</span>`;
        row.addEventListener("click", () => this.selectTarget(tg));
        dom.mapResults.appendChild(row);
      }
    },

    renderInfo() {
      if (!dom.mapSelInfo) return;
      const wp = WorldMap.state && WorldMap.state.waypoint;
      let html = "";
      if (this.sel) {
        const tz = targetZoneOf(this.sel.kind, this.sel.id);
        const cur = WorldMap.state ? WorldMap.state.zoneId : HUB_ZONE;
        let route;
        if (tz === cur) route = t("map.routeHere");
        else {
          const r = findRoute(cur, tz) || [];
          route = t("map.routeVia", { path: r.map((id) => tZoneName(ZONE_BY_ID[id])).join(" → ") });
        }
        html = `<div class="msi-name">${this.targetIcon(this.sel)} ${this.targetName(this.sel)}</div>` +
               `<div class="msi-route">${route}</div>`;
      } else {
        html = `<div class="msi-hint">${t("map.selectHint")}</div>`;
      }
      if (wp) html += `<div class="msi-active">${t("map.activeWaypoint", { name: this.targetName(wp) })}</div>`;
      dom.mapSelInfo.innerHTML = html;
      if (dom.mapGuideBtn) dom.mapGuideBtn.disabled = !this.sel;
      if (dom.mapClearBtn) dom.mapClearBtn.disabled = !wp;
    },

    renderCanvas() {
      const ctx = ctx2d(dom.mapCanvas);
      if (!ctx) return;
      const cv = dom.mapCanvas;
      // Match the backing store to the element's box for crisp drawing.
      try {
        const rect = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { width: cv.width, height: cv.height };
        const w = Math.max(2, Math.round(rect.width || cv.width || 320));
        const h = Math.max(2, Math.round(rect.height || cv.height || 320));
        if (cv.width !== w) cv.width = w;
        if (cv.height !== h) cv.height = h;
      } catch (e) {}
      const W = cv.width || 320, H = cv.height || 320;
      const state = WorldMap.state, player = WorldMap.player, world = state && state.world;
      if (!state) return;
      if (this.tab === "world") {
        const base = Math.min(W, H) * 0.4 * this.view.scale;
        const proj = (pt) => ({ x: W / 2 + pt.x * base + this.view.ox, y: H / 2 + pt.y * base + this.view.oy });
        drawWorldScene(ctx, { W, H, state, waypoint: state.waypoint, proj });
        // Highlight a selected zone target.
        if (this.sel && this.sel.kind === "zone") {
          const lay = worldLayout(); const p = lay[this.sel.id]; if (p) mmRing(ctx, proj(p).x, proj(p).y, 20);
        }
      } else if (world) {
        const base = (Math.min(W, H) * 0.45) / (world.radius || 80) * this.view.scale;
        // North-up, un-mirrored (matches the corner minimap): mirror X.
        const proj = (wx, wz) => ({ x: W / 2 - wx * base + this.view.ox, y: H / 2 + wz * base + this.view.oy });
        drawZoneScene(ctx, { W, H, world, state, player, waypoint: state.waypoint, proj, scale: base, labels: true });
        // Highlight an in-zone selected target.
        if (this.sel && targetZoneOf(this.sel.kind, this.sel.id) === state.zoneId) {
          const pt = targetPoint(this.sel.kind, this.sel.id);
          if (pt) mmRing(ctx, proj(pt.x, pt.z).x, proj(pt.x, pt.z).y, 9);
        }
      }
    },
  };

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
      // Owned-materials strip (read from the unified bag).
      dom.craftMats.innerHTML = MATERIAL_IDS.map((id) =>
        `<span class="mat-chip">${MATERIALS[id].icon} ${bagCount(p, id)}</span>`).join("");
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
        body = `<div class="qm-obj">${Quests.objectiveText(m)}${complete && m.npc ? t("log.returnTo", { icon: Story.giverIcon(m.npc), giver: Story.giverRef(m.npc) }) : ""}</div>`;
      } else if (isCurrent) {
        icon = "❗"; cls = "mcurrent";
        body = `<div class="qm-obj">${m.npc ? t("log.speakAt", { icon: Story.giverIcon(m.npc), giver: Story.giverRef(m.npc), prep: Story.npcPlacePrep(m.npc), place: Story.npcPlaceRef(m.npc) }) : Quests.objectiveText(m)}</div>`;
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

    // Per-frame: has the player WALKED A ROAD to the map edge? (Task 22) Each
    // portal is a road-edge band: travel fires when the player's radial position
    // along the road direction reaches the exit threshold AND they're within the
    // road's half-width laterally. The fence keeps them from going around it, so
    // the trigger can't be skirted. A legacy circular portal (r) still works.
    check(dt) {
      if (this.transitioning) return;
      if (this.cooldown > 0) { this.cooldown -= dt; return; }
      const world = this.state.world; if (!world) return;
      const p = this.player.position;
      for (const portal of world.portals || []) {
        if (portal.dir) {
          const along = p.x * portal.dir.x + p.z * portal.dir.z;        // outward projection
          const lateral = Math.abs(p.x * portal.dir.z - p.z * portal.dir.x); // dist to road centre
          if (along >= portal.exitR && lateral <= portal.half) { this.travel(portal.to); return; }
        } else if (portal.r != null) {
          const dx = p.x - portal.x, dz = p.z - portal.z;
          if (dx * dx + dz * dz <= portal.r * portal.r) { this.travel(portal.to); return; }
        }
      }
    }

    travel(toId) {
      const target = ZONE_BY_ID[toId];
      if (!target || this.transitioning) return;
      this.transitioning = true;
      const fromId = this.state.world.zone.id;
      Sfx.play("portal");   // a whoosh as the veil drops
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
      if (!state.discovered) state.discovered = {};
      state.discovered[toId] = true;          // reveal the new zone on the world map
      player.world = world; worldRef = world;
      DayNight.init(world, DayNight.t);   // re-point sky/sun/hemi to the new zone
      Weather.world = world;               // keep the rain system; just re-aim it
      applyZoneMood(scene, target);        // re-tune exposure/contrast for the mood
      Ambience.crossfadeTo(toId);          // fade the old soundscape out, the new one in
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
      updateHealthBar(player.health);
      Session.mark(); // persist the run on zone travel (Task 17; no-op during restore)
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
    if (state.alchemist && state.alchemist.dispose) { try { state.alchemist.dispose(); } catch (e) {} }
    if (state.castle && state.castle.dispose) { try { state.castle.dispose(); } catch (e) {} }
    state.merchant = null; state.blacksmith = null; state.alchemist = null; state.castle = null;
    state.boss = null; state.dragon = null;
    state.pendingAttack = null;   // drop any mid-swing attack queued in the old zone
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
      if (portal.dir) {
        // Road-edge arrival (Task 22): land ON the incoming road, stepped well
        // inside the exit threshold so the player walks INTO the zone and can't
        // instantly re-trigger the gateway. Facing follows the road inward.
        const R = world.radius || 60;
        const ar = Math.max(8, R - 13);           // safely below exitR (R-4.5)
        x = portal.dir.x * ar; z = portal.dir.z * ar;
        player.facing = Math.atan2(-portal.dir.x, -portal.dir.z);
      } else {
        const len = Math.hypot(portal.x, portal.z) || 1;
        const inward = (len - 9) / len;           // 9m toward the centre (legacy)
        x = portal.x * inward; z = portal.z * inward;
        player.facing = Math.atan2(-portal.x, -portal.z);
      }
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

    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, 1.05, 13, new BABYLON.Vector3(0, 1.4, 12), scene);
    camera.lowerRadiusLimit = 6; camera.upperRadiusLimit = 22;
    camera.lowerBetaLimit = 0.35; camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.01; camera.panningSensibility = 0;
    // Task 11: a tier-gated draw distance to match the opened-up fog (generous on
    // high, tighter on low/mobile). The sky dome is infiniteDistance, so the
    // horizon is always drawn regardless of this near/far clip.
    try { camera.maxZ = ArtDirection.view(Quality.tier).maxZ; camera.minZ = 0.5; } catch (e) {}
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
      coins: 0, wave: 0, waveTotal: 0, over: false, won: false,
      zoneId: world.zone.id,        // the currently loaded zone
      bossesCleared: {},            // lair bosses defeated this run, by zone id
      discovered: { [world.zone.id]: true }, // zones the player has visited (map fog-of-war)
      waypoint: null,               // the active guided target ({ kind, id }) or null
      castleBuilt: [],              // castle parts raised (survives zone reloads)
      artifacts: [], monsters: [], bolts: [], coinsList: [],
      enemyBolts: [],   // hostile boss projectiles (Hazard)
      drops: [],        // rare gear dropped on the ground (ItemDrop)
      fx: [],           // short-lived impact bursts (Burst)
      resources: [],    // harvestable resource nodes (ResourceNode)
      npcs: [],         // story NPCs (QuestGiver)
      castle: null,     // the CastleSite build system
      dragon: null,     // the final boss, once summoned
      totalKills: 0,    // lifetime sweets felled (quest "hunt" progress + recap)
      relicsFound: 0,   // lifetime relics collected (recap; survives castle builds)
      playSec: 0,       // accumulated active playtime (seconds) — save-slot metadata
      waveStats: { kills: 0, artifacts: 0, coins: 0 },
      merchant: null, blacksmith: null, alchemist: null, boss: null,
      pendingAttack: null, // attack awaiting its swing's strike (impact) frame
    };

    // Hand out the starting gear and compute the initial stat block.
    player.setupStartingLoadout();

    updateHealthBar(player.health);
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
    SkillsUI.init(state, player);
    WorldMap.init(state, player, camera);
    updatePotionBar(player);
    updateRelicHud(player);
    updateSkillsHud(player);
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
      // Opt-in Drive autosave: a cheap, wall-clock-gated tick that keeps running
      // even while a menu is open (so a 5-min autosave isn't blocked by a pause).
      // No-ops entirely unless signed in with autosave on (Task 15).
      CloudSave.tick(Date.now());
      // Durable local session (Task 17): a cheap, debounced flush of the live run
      // to first-party storage so a reload / desktop⇄mobile switch resumes it.
      Session.tick(Date.now());
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
        if (state.alchemist) state.alchemist.update(dt);
        for (const n of state.npcs) n.update(dt);
        if (state.castle) state.castle.update(dt);
        cosmetics(state, dt);
        return;
      }

      // Accumulate active playtime (this branch runs only while truly playing —
      // past every pause / menu / transition early-return above) for save-slot
      // metadata. Frame-rate independent (dt seconds).
      state.playSec += dt;
      player.update(dt, camera);
      // Per-surface footsteps + a low-health warning (both dt-driven → pause-safe).
      Footsteps.update(player, state.world && state.world.zone);
      LowHealth.update(dt, player);
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
      if (state.alchemist) state.alchemist.update(dt);
      updateBuffs(player, dt);
      Skills.update(state, player, dt); // focus regen + skill cooldowns (pause-safe)

      // Attacking — ranged weapons fire ballistic bolts/arrows (possibly a
      // multishot spread); melee weapons sweep an arc in front of the player.
      // The hit/bolt is QUEUED here and RESOLVED on the swing's strike (impact)
      // frame below, so damage lands with the animation, never on the wind-up.
      if (Input.wantsCast()) {
        const act = player.tryCast();
        if (act) {
          if (state.pendingAttack) fireAttack(state, scene, player, state.pendingAttack); // flush any straggler
          state.pendingAttack = act;
        }
      }
      // Land the queued attack the instant the swing reaches its strike phase
      // (or just after, if a big dt skipped it — never drop a committed hit).
      if (state.pendingAttack) {
        const sw = player.swing;
        if (sw.striking || sw.phase === "recover" || !sw.busy) {
          fireAttack(state, scene, player, state.pendingAttack);
          state.pendingAttack = null;
        }
      }

      updateBolts(state, dt);
      updateHazards(state, player, dt);
      updateMonsters(state, player, dt);
      updateItemDrops(state, player, dt);
      updateCoinDrops(state, player, dt);

      // Adventure layer: NPCs, harvest nodes, castle, location-reach objectives.
      for (const n of state.npcs) n.update(dt);
      for (const r of state.resources) r.update(dt);
      // Time-gated regrowth (Task 22): advance THIS zone's regrow clock by the
      // in-game dt (so it pauses with the game) and build any newly-sprouted
      // node's meshes. New nodes appear only after the cadence elapses, never on
      // entry, and never past a kind's per-zone cap or the global live cap.
      growZoneResources(state, dt);
      if (state.castle) state.castle.update(dt);
      checkLocations(state, player);

      interaction.update(player.position);
      if (Input.consumeInteract() && !player.busy) interaction.trigger();

      // Minimap + compass + guided-waypoint arrival (throttled, headless-safe).
      WorldMap.update(dt);

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

  // Land a queued attack on the swing's strike frame: spawn the ranged bolts
  // (from the committed shots) or sweep the melee arc from the player's LIVE
  // position in the committed direction, so the hit lines up with the animation.
  function fireAttack(state, scene, player, act) {
    if (!act) return;
    if (act.type === "ranged") {
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
    } else {
      meleeSweep(state, { weapon: act.weapon, origin: player.position.clone(), dir: act.dir });
      // Heavy, wide weapons (axe/hammer/greatsword) get a beefier swing.
      const mw = act.weapon;
      Sfx.play((mw.melee && mw.melee.arc >= 2.2) ? "heavy" : "melee");
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

  // A monster (regular sweet or boss) was just killed: award XP/coins, apply
  // lifesteal, and clean up the boss bar when a Sweet King falls.
  function onMonsterDefeated(state, m) {
    // Lifesteal heals the player a little per kill (Vampiric Gem upgrade).
    if (playerRef && playerRef.lifesteal > 0) {
      playerRef.health = Math.min(playerRef.maxHealth, playerRef.health + playerRef.lifesteal);
      updateHealthBar(playerRef.health);
    }
    // Every kill grants XP toward the next level (bosses + the dragon pay more).
    if (playerRef) Skills.gainXp(playerRef, Skills.xpFor(m));
    // The dragon is the climax: felling it wins the game.
    if (m.isDragon) {
      spawnImpact(state, m.position, "#ff6a3a", { y: 3, count: 28, spread: 9, up: 6, life: 1.1 });
      hideBossBar();
      state.dragon = null;
      Sfx.play("boss_death");
      winGame(state);
      return;
    }
    if (m.isBoss) {
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
      // A boss always drops a guaranteed RARE item — the only way to get one. Its
      // enchantments are rolled here (in the seeded rng stream) and carried by the
      // drop so the bag instance matches exactly.
      const rareId = RARE_DROPS[(rng() * RARE_DROPS.length) | 0];
      const rareAffixes = rollAffixes(getDef(rareId), rng);
      const dpos = new BABYLON.Vector3(m.position.x, 0, m.position.z + 2);
      state.drops.push(new ItemDrop(state.scene, state.shadow, dpos, rareId, rareAffixes));
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
      // Rare SKILLS drop only from bosses (seeded → reproducible). Rolled after
      // the coins / rare-gear / splitter draws so existing drop determinism is
      // untouched; learns one unowned boss skill (until all are collected).
      if (playerRef) Skills.rollBossSkill(playerRef);
      hideBossBar();
      if (state.boss === m) state.boss = null;
      Sfx.play("boss_death");
      toast(t("toast.bossDefeated", { boss: bossNounRef(m), verb: select(bossGender(m), AGREE_DEFEATED), item: tItemName(getDef(rareId)) }));
      return;
    }
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

  // =========================================================================
  // Skills, leveling & fusion (Task 14)
  // -------------------------------------------------------------------------
  // The player gains XP from combat / quests / gathering, LEVELS UP (more max
  // health + focus, and auto-learns base skills as they unlock), slots up to
  // three ACTIVE skills on a quick bar (hotkeys 1/2/3), spends FOCUS + a per-skill
  // cooldown to cast them, FUSES up to three owned skills into a brand-new one,
  // and unlocks rare skills from BOSS loot. All progression lives on
  // player.progress so it serializes with the player; the curve + the
  // deterministic fusion math live in the pure data module (src/data/skills.js).
  // Everything is headless-safe: the effects reuse the proven Projectile / nova /
  // buff systems and feature-detect Babylon, so the stubbed harness never throws.
  // =========================================================================
  function newProgress() {
    return {
      level: 1, xp: 0, focus: maxFocusForLevel(1),
      owned: [],                                 // skill ids known (base + boss + fused)
      fused: {},                                 // generated fused defs, keyed by id
      fusedSeq: 0,                               // sequence for stable fused ids
      slots: new Array(SKILL_SLOTS).fill(null),  // quick-bar: skill ids | null
      cooldowns: {},                             // skill id -> seconds remaining
    };
  }

  // Bump the player's BASE max health to include the level bonus, so the normal
  // recomputeStats() pipeline (gear + sets + buffs) layers on top unchanged.
  function applyLevelToBase(player) {
    const lvl = (player.progress && player.progress.level) || 1;
    player.base.maxHealth = CONFIG.maxHealth + levelHealthBonus(lvl);
  }

  // A small sparkle burst at the player for self-targeted skills (buff / heal).
  function spawnSelfFx(state, player, el) {
    if (!state || !player) return;
    const p = player.position;
    spawnImpact(state, new BABYLON.Vector3(p.x, 1.1, p.z), (el && el.color) || "#b794ff",
      { y: 1.1, count: 14, spread: 1.4, up: 3, life: 0.6 });
  }

  const Skills = {
    // Resolve a skill id to its def (base/boss from SKILL_DB, fused from player).
    def(player, id) {
      if (!id) return null;
      return SKILL_DB[id] || (player && player.progress && player.progress.fused[id]) || null;
    },
    maxFocus(player) { return maxFocusForLevel(player.progress.level); },
    ownedDefs(player) { return (player.progress.owned || []).map((id) => this.def(player, id)).filter(Boolean); },

    // Fresh player's progression: base-health for the level, the level-1 skill(s)
    // learned, and the first auto-slotted so the quick bar is useful immediately.
    init(player) {
      if (!player.progress) player.progress = newProgress();
      applyLevelToBase(player);
      for (const id of STARTER_SKILL_IDS) this.learn(player, id, true);
      const pr = player.progress;
      if (!pr.slots.some(Boolean) && pr.owned.length) pr.slots[0] = pr.owned[0];
      pr.focus = Math.min(pr.focus, this.maxFocus(player));
    },

    learn(player, id, silent) {
      const pr = player.progress;
      if (!id || pr.owned.includes(id) || !this.def(player, id)) return false;
      pr.owned.push(id);
      if (!silent) toast(t("toast.skillLearned", { name: tSkillName(this.def(player, id)) }));
      return true;
    },

    // Award XP, resolving any level-ups (a loop, in case a big chunk crosses
    // several levels). Each level: +max health (via base), +max focus, a focus
    // top-up, and auto-learns newly-unlocked base skills.
    gainXp(player, amount) {
      if (!player || !player.progress || amount <= 0) return;
      const pr = player.progress;
      pr.xp += Math.round(amount);
      let leveled = false;
      while (pr.xp >= xpToNext(pr.level)) {
        pr.xp -= xpToNext(pr.level);
        pr.level++;
        leveled = true;
        applyLevelToBase(player);
        const hpGain = levelHealthBonus(pr.level) - levelHealthBonus(pr.level - 1);
        const focusGain = maxFocusForLevel(pr.level) - maxFocusForLevel(pr.level - 1);
        pr.focus = Math.min(this.maxFocus(player), pr.focus + focusGain + 12);
        for (const id of skillsUnlockedAt(pr.level)) this.learn(player, id, true);
        Sfx.play("levelup");
        toast(t("toast.levelUp", { level: pr.level, hp: hpGain, focus: focusGain }));
      }
      if (leveled) { recomputeStats(player); updateSkillBar(player); Session.mark(); } // persist on level-up (Task 17)
      updateXpHud(player);
      updateFocusHud(player);
      if (SkillsUI.open) SkillsUI.render();
    },

    // ---- Quick bar -------------------------------------------------------
    assignSlot(player, slotIndex, id) {
      const pr = player.progress;
      if (slotIndex < 0 || slotIndex >= SKILL_SLOTS) return false;
      if (id && !pr.owned.includes(id)) return false;
      // No duplicate slotting: clear any other slot already holding this skill.
      if (id) for (let i = 0; i < pr.slots.length; i++) if (i !== slotIndex && pr.slots[i] === id) pr.slots[i] = null;
      pr.slots[slotIndex] = id || null;
      updateSkillBar(player);
      return true;
    },
    clearSlot(player, slotIndex) { return this.assignSlot(player, slotIndex, null); },

    cooldownLeft(player, id) { return Math.max(0, player.progress.cooldowns[id] || 0); },
    // Whether the skill in a slot can fire right now (owned, off cooldown, focus).
    ready(player, slotIndex) {
      const id = player.progress.slots[slotIndex];
      const def = this.def(player, id);
      return !!def && this.cooldownLeft(player, id) <= 0 && player.progress.focus >= (def.cost || 0);
    },

    // Fire the skill in a quick-bar slot. Returns true if it actually cast.
    activate(state, player, slotIndex) {
      if (!state || !player || !player.progress || player.health <= 0) return false;
      const pr = player.progress;
      const id = pr.slots[slotIndex];
      if (!id) { toast(t("toast.skillEmpty")); return false; }
      const def = this.def(player, id);
      if (!def) return false;
      if (this.cooldownLeft(player, id) > 0) { toast(t("toast.skillCooling")); Sfx.play("error"); return false; }
      if (pr.focus < (def.cost || 0)) { toast(t("toast.noFocus")); Sfx.play("error"); return false; }
      pr.focus -= (def.cost || 0);
      pr.cooldowns[id] = def.cooldown || 0;
      this._cast(state, player, def);
      updateFocusHud(player);
      updateSkillBar(player);
      return true;
    },

    // Skill power scales gently with level so leveling keeps mattering.
    power(player, def) {
      const lvl = (player.progress && player.progress.level) || 1;
      return Math.round((def.power || 0) * (1 + (lvl - 1) * 0.05));
    },

    // Resolve a skill's combat effect onto the world using the existing systems.
    _cast(state, player, def) {
      const el = ELEMENTS[def.element] || ELEMENTS.arcane;
      const power = this.power(player, def);
      if (def.effect === "volley") this._castVolley(state, player, def, el, power);
      else if (def.effect === "nova") this._castNova(state, player, def, el, power);
      else if (def.effect === "buff") this._castBuff(state, player, def, el);
      else if (def.effect === "heal") this._castHeal(state, player, def, el, power);
      Sfx.play("skill_cast");
    },

    _castVolley(state, player, def, el, power) {
      const origin = (player.wandTip && player.wandTip.getAbsolutePosition)
        ? player.wandTip.getAbsolutePosition().clone()
        : new BABYLON.Vector3(player.position.x, 1.2, player.position.z);
      const n = Math.max(1, def.count || 1);
      const spread = 0.18;
      for (let i = 0; i < n; i++) {
        const offset = n === 1 ? 0 : (i - (n - 1) / 2) * spread;
        const ang = player.facing + offset;
        const dir = new BABYLON.Vector3(Math.sin(ang), 0.04, Math.cos(ang)).normalize();
        state.bolts.push(new Projectile(state.scene, state.shadow, origin.clone(), dir, {
          speed: 24, radius: 0.95, damage: power, pierce: def.pierce || 0,
          color: el.color, haloColor: el.color, gravity: 1.2,
        }));
      }
      // The wand flares on a ranged skill, mirroring a normal cast.
      if (player.swing && player.swing.trigger) player.swing.trigger("ranged");
    },

    _castNova(state, player, def, el, power) {
      const radius = def.radius || 6;
      const p = player.position;
      spawnImpact(state, new BABYLON.Vector3(p.x, 0.6, p.z), el.color,
        { y: 0.6, count: 24, spread: radius, up: 3, life: 0.7 });
      let healed = 0;
      for (const m of state.monsters) {
        if (!m.alive || m.dying > 0) continue;
        const dx = m.position.x - p.x, dz = m.position.z - p.z;
        if (Math.hypot(dx, dz) > radius + m.radius) continue;
        const killed = m.hit(power);
        spawnImpact(state, m.position, el.color, { y: 1.0, count: killed ? 10 : 6, spread: 3 });
        if (m.knockback) m.knockback(dx, dz, def.knock || 6);
        if (def.slow && m.applySlow) m.applySlow(2.5);          // frost chills
        if (def.lifesteal) healed += killed ? 8 : 4;            // shadow drains
        if (killed) onMonsterDefeated(state, m);
      }
      if (healed > 0 && player.health > 0) {
        player.health = Math.min(player.maxHealth, player.health + healed);
        updateHealthBar(player.health);
      }
    },

    _castBuff(state, player, def, el) {
      applyBuff(player, { id: "skill_" + (def.id || def.element), label: tSkillName(def), stats: def.buff || {}, time: def.duration || 10 });
      recomputeStats(player);
      updateBuffBar(player);
      spawnSelfFx(state, player, el);
    },

    _castHeal(state, player, def, el, power) {
      player.health = Math.min(player.maxHealth, player.health + power);
      updateHealthBar(player.health);
      spawnSelfFx(state, player, el);
    },

    // ---- Fusion (the marquee feature) ------------------------------------
    // Validate 2..3 selected skills, charge coins + crystals, then create + learn
    // a new fused skill whose attributes are the pure deterministic blend.
    fuse(state, player, ids) {
      const pr = player.progress;
      const defs = (ids || []).map((id) => this.def(player, id)).filter(Boolean);
      if (!canFuse(defs)) { toast(t("toast.fuseSelect")); Sfx.play("error"); return null; }
      const cost = fusionCost(defs);
      if (state.coins < cost.coins || bagCount(player, "crystal") < cost.crystal) {
        toast(t("toast.fuseNeed", cost)); Sfx.play("error"); return null;
      }
      state.coins -= cost.coins; updateCoins(state);
      bagSpend(player, "crystal", cost.crystal);
      if (Inventory.open) Inventory.render();
      const fused = fuseSkills(defs);
      const id = "fused_" + (++pr.fusedSeq);
      fused.id = id;
      pr.fused[id] = fused;
      pr.owned.push(id);
      Sfx.play("fuse");
      toast(t("toast.skillFused", { name: tSkillName(fused) }));
      return fused;
    },

    // ---- Per-frame: regen focus + tick cooldowns (dt-driven → pause-safe) ----
    update(state, player, dt) {
      if (!player || !player.progress) return;
      const pr = player.progress;
      const max = this.maxFocus(player);
      if (pr.focus < max) pr.focus = Math.min(max, pr.focus + FOCUS_REGEN * dt);
      else if (pr.focus > max) pr.focus = max; // defensive: never sit above the cap
      let ticking = false;
      for (const id in pr.cooldowns) {
        if (pr.cooldowns[id] > 0) { pr.cooldowns[id] = Math.max(0, pr.cooldowns[id] - dt); ticking = true; }
      }
      updateFocusHud(player);
      if (ticking) updateSkillBar(player);
    },

    // The XP a defeated monster is worth (bosses + the dragon pay far more).
    xpFor(m) {
      if (!m) return 0;
      if (m.isDragon) return 600;
      if (m.isBoss) return 60 + (m.cycle || 1) * 25;
      return 6 + (m.wave || 1) * 2;
    },

    // On a boss kill, deterministically drop one rare boss-skill the player
    // doesn't own yet (seeded rng → reproducible) and slot it if there's room.
    rollBossSkill(player) {
      const pr = player.progress;
      const pool = BOSS_SKILL_IDS.filter((id) => !pr.owned.includes(id));
      if (!pool.length) return null;
      const id = pool[(rng() * pool.length) | 0];
      pr.owned.push(id);
      const free = pr.slots.indexOf(null);
      if (free >= 0 && !pr.slots.includes(id)) pr.slots[free] = id;
      toast(t("toast.bossSkill", { name: tSkillName(SKILL_DB[id]) }));
      Sfx.play("levelup");
      updateSkillBar(player);
      if (SkillsUI.open) SkillsUI.render();
      return id;
    },

    // ---- Save / load -----------------------------------------------------
    serialize(player) {
      const pr = player.progress || newProgress();
      return {
        level: pr.level, xp: pr.xp, focus: Math.round(pr.focus),
        owned: pr.owned.slice(),
        fused: JSON.parse(JSON.stringify(pr.fused || {})),
        fusedSeq: pr.fusedSeq | 0,
        slots: pr.slots.slice(),
      };
    },
    restore(player, data) {
      const pr = newProgress();
      if (data && typeof data === "object") {
        pr.level = Math.max(1, data.level | 0 || 1);
        pr.xp = Math.max(0, data.xp | 0);
        pr.fusedSeq = Math.max(0, data.fusedSeq | 0);
        if (data.fused && typeof data.fused === "object") {
          for (const id in data.fused) {
            const f = data.fused[id];
            if (f && f.effect && f.element) { f.id = id; f.generated = true; f.source = "fused"; pr.fused[id] = f; }
          }
        }
        const known = (id) => SKILL_DB[id] || pr.fused[id];
        pr.owned = (data.owned || []).filter(known);
        pr.fusedSeq = Math.max(pr.fusedSeq, ...Object.keys(pr.fused).map((id) => parseInt(id.replace("fused_", ""), 10) || 0), 0);
        const slots = data.slots || [];
        for (let i = 0; i < SKILL_SLOTS; i++) pr.slots[i] = (slots[i] && pr.owned.includes(slots[i])) ? slots[i] : null;
      }
      player.progress = pr;
      applyLevelToBase(player);
      // Ensure level-unlocked base skills are owned (covers legacy saves + any
      // catalogue additions), then default + clamp the quick bar and focus.
      for (const id of skillsUnlockedAt(pr.level)) if (!pr.owned.includes(id)) pr.owned.push(id);
      if (!pr.owned.length) for (const id of STARTER_SKILL_IDS) pr.owned.push(id);
      if (!pr.slots.some(Boolean) && pr.owned.length) pr.slots[0] = pr.owned[0];
      pr.focus = (data && data.focus != null) ? Math.min(maxFocusForLevel(pr.level), Math.max(0, data.focus | 0)) : maxFocusForLevel(pr.level);
    },
  };

  // Spin/float dropped rare loot; scoop it into the bag when the player nears.
  function updateItemDrops(state, player, dt) {
    if (!state.drops) return;
    for (let i = state.drops.length - 1; i >= 0; i--) {
      const d = state.drops[i];
      const got = d.update(dt, player.position);
      if (got) {
        const def = getDef(d.id);
        const inst = makeItem(d.id);
        if (d.affixes && d.affixes.length) inst.affixes = d.affixes.slice();
        if (invAdd(player, inst)) {
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
  // HUD helpers
  // =========================================================================
  function updateCoins(state) {
    if (dom.coins) dom.coins.textContent = state.coins;
    if (dom.shopCoins) dom.shopCoins.textContent = state.coins;
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

  // (Task 21 removed the on-HUD materials chip strip — materials now live in the
  // unified bag and are seen only in the inventory's Materials tab.)

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
      const id = player.potionSlots[i];     // the assigned potion id (or null)
      const have = id ? bagCount(player, id) : 0;
      const key = i + 4; // 4 / 5 / 6 — the quick bar (1/2/3) now casts skills
      const cell = document.createElement("button");
      cell.className = "potion-slot" + (id && have > 0 ? " filled" : " empty");
      if (id && have > 0) {
        const def = getDef(id);
        cell.innerHTML = `<span class="pk">${key}</span><span class="pi">${def.icon}</span><span class="pc">×${have}</span>`;
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

  // ---- Skills, leveling & focus HUD (Task 14) ----------------------------
  // Level badge + XP progress bar (top-left, by the location/coins row).
  function updateXpHud(player) {
    if (!player || !player.progress) return;
    const pr = player.progress;
    if (dom.levelBadge) dom.levelBadge.textContent = t("hud.levelBadge", { level: pr.level });
    if (dom.xpFill) {
      const need = xpToNext(pr.level);
      dom.xpFill.style.width = Math.max(0, Math.min(100, (pr.xp / (need || 1)) * 100)) + "%";
    }
    const wrap = dom.xpWrap;
    if (wrap) wrap.title = t("skills.xp", { xp: pr.xp, next: xpToNext(pr.level) });
  }

  // Focus (spell resource) bar, shown under the health bar.
  function updateFocusHud(player) {
    if (!player || !player.progress || !dom.focusFill) return;
    const max = maxFocusForLevel(player.progress.level) || 1;
    dom.focusFill.style.width = Math.max(0, Math.min(100, (player.progress.focus / max) * 100)) + "%";
    if (dom.focusWrap) dom.focusWrap.title = t("skills.focus", { focus: Math.floor(player.progress.focus), max });
  }

  // The 3-slot quick bar (hotkeys 1/2/3): icon + key, a radial cooldown sweep,
  // and a dim when there isn't enough focus. Tapping a slot casts it (mobile).
  function updateSkillBar(player) {
    if (!dom.skillBar || !player || !player.progress) return;
    const pr = player.progress;
    dom.skillBar.innerHTML = "";
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const id = pr.slots[i];
      const def = Skills.def(player, id);
      const cell = document.createElement("button");
      cell.className = "skill-slot" + (def ? " filled" : " empty");
      const key = i + 1;
      if (def) {
        const cd = Skills.cooldownLeft(player, id);
        const onCd = cd > 0;
        const lowFocus = pr.focus < (def.cost || 0);
        if (onCd) cell.classList.add("cooling");
        if (lowFocus) cell.classList.add("nofocus");
        const cdPct = onCd ? Math.min(100, (cd / (def.cooldown || 1)) * 100) : 0;
        cell.innerHTML =
          `<span class="sk-key">${key}</span><span class="sk-icon">${def.icon || "✨"}</span>` +
          `<span class="sk-cost">🔵${def.cost || 0}</span>` +
          (onCd ? `<span class="sk-cd">${Math.ceil(cd)}</span>` : "") +
          `<span class="sk-cdmask" style="height:${cdPct}%"></span>`;
        cell.title = `${tSkillName(def)} — ${tSkillDesc(def)}`;
        cell.addEventListener("click", () => {
          if (gameStarted && !paused && !uiPaused) Skills.activate(stateRef, player, i);
        });
      } else {
        cell.innerHTML = `<span class="sk-key">${key}</span><span class="sk-empty">✨</span>`;
        cell.title = t("skills.slotEmpty");
        cell.addEventListener("click", () => { if (gameStarted && !paused && !uiPaused) { Sfx.play("ui_click"); SkillsUI.openUI(); } });
      }
      dom.skillBar.appendChild(cell);
    }
  }

  // Refresh every skills HUD readout at once.
  function updateSkillsHud(player) {
    updateXpHud(player);
    updateFocusHud(player);
    updateSkillBar(player);
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

  // A run recap for the end / pause screens: the RPG progression (level + total
  // XP earned across the run) plus the key tallies (monsters felled, relics
  // collected). Replaces the retired arcade "score" (Task 19). Pure + defensive
  // so it's safe to call from the headless tests.
  function runRecap(state) {
    const pr = (playerRef && playerRef.progress) || null;
    const level = (pr && pr.level) || 1;
    const xp = (pr && pr.xp) || 0;
    const totalXp = totalXpToReach(level) + xp; // cumulative XP earned this run
    return {
      level,
      totalXp,
      kills: state ? state.totalKills | 0 : 0,
      relics: state ? state.relicsFound | 0 : 0,
    };
  }

  function gameOver(state) {
    state.over = true;
    dom.prompt.classList.add("hidden");
    hideBossBar();
    const where = (state.world && state.world.zone) ? tZoneName(state.world.zone) : "—";
    const r = runRecap(state);
    if (dom.overText) {
      dom.overText.innerHTML = t("over.tagline", { level: r.level, xp: r.totalXp, where }) +
        "<br>" + t("recap.tallies", { kills: r.kills, relics: r.relics });
    }
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
    const r = runRecap(state);
    if (dom.winText) {
      dom.winText.innerHTML = t("win.tagline", { level: r.level, xp: r.totalXp }) +
        "<br>" + t("recap.tallies", { kills: r.kills, relics: r.relics });
    }
    if (dom.winStory) dom.winStory.innerHTML = t("win.ending", { title: tStoryEndingTitle(), text: tStoryEndingText() }); // ending framing
    Sfx.play("artifact");
    setTimeout(() => { if (dom.win) dom.win.classList.remove("hidden"); }, 800);
  }

  // =========================================================================
  // Save / Load — serialize the whole run to a JSON file the player downloads,
  // and restore it from a file on any device.
  //
  // The procedural environment is captured by its RNG seed (re-seeded + rebuilt
  // on load), while every live entity (player stats + perks, money,
  // monsters, the boss, artifacts and dropped coins, plus the wave clock) is
  // serialized explicitly so the run resumes exactly where it left off.
  // =========================================================================
  const SAVE_VERSION = 14;
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
  // localGet/localSet come from i18n; localStorage removal isn't exported there,
  // so add the matching delete here (headless-safe — fails soft like the rest).
  function localDel(k) {
    try { if (typeof localStorage !== "undefined") localStorage.removeItem(k); } catch (e) {}
  }

  function serializeGame() {
    const state = stateRef, player = playerRef, waves = waveSystem;
    if (!state || !player || !waves) return null;
    const round = (n) => Math.round(n * 1000) / 1000;
    const xz = (p) => [round(p.x), round(p.z)];

    return {
      v: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      seed: getSeed(),
      // RPG world: the zone you're standing in + which lair bosses are already
      // cleared. A zone's wandering monsters aren't saved — they regenerate from
      // the zone's spawn table on load (and respawn during play anyway).
      zone: state.zoneId,
      bossesCleared: Object.assign({}, state.bossesCleared),
      // World-map state (v9): zones discovered (fog-of-war) + the active guided
      // waypoint ({ kind, id }) so the player's chosen destination survives reload.
      discovered: Object.keys(state.discovered || {}),
      waypoint: state.waypoint || null,
      // Per-zone resource ecology (v13, Task 22): each visited zone's node set
      // (positions + kinds + remaining respawn) + its regrow clock, so the live
      // count + depletion stay STABLE across reload (no fresh batch on entry).
      zoneRes: serializeZoneRes(state.zoneRes),
      money: state.coins,
      player: {
        health: round(player.health),
        facing: round(player.facing),
        pos: xz(player.position),
        // The gear *is* the build now: save the UNIFIED bag + equipped slots
        // (gear with enhancement levels + affixes; potions/materials as stacks)
        // and the stat block rebuilds via recomputeStats().
        inventory: player.inventory.map(serializeInst),
        equipment: serializeEquipment(player),
        // The 3 combat quick-slots are an assignment over bag potions (Task 21):
        // save the potion id in each slot (or null).
        potionSlots: player.potionSlots.slice(),
        // Castle relics (materials live in the bag now, serialized above).
        relics: player.relics.slice(),
        // Skill & leveling progression (Task 14, v8): level/xp, focus, owned +
        // fused skills, and the 3-slot quick bar.
        progress: Skills.serialize(player),
      },
      // Story progression: quests, the campaign-flow state, the castle build
      // state, day/night + weather.
      totalKills: state.totalKills,
      relicsFound: state.relicsFound,   // v11: lifetime relics for the end-screen recap
      // Active playtime in seconds (v10) — drives the save-slot "time played"
      // metadata. Legacy saves without it default to 0 on load.
      playSec: Math.round(state.playSec || 0),
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
      // Customizable on-screen control layout (v14, Task 36): the per-control
      // viewport-fraction positions so a player's HUD arrangement travels with the
      // save. The per-device localStorage mirror is the live source; this is the
      // portable default a fresh device adopts (see ControlLayout.applyFromSave).
      // Omitted (an empty map) when every control is at its default.
      controls: ControlLayout.serialize(),
    };
  }

  // One item instance → a compact save entry. Gear keeps { id, lvl, aff } (aff
  // omitted when unenchanted, keeping older-style saves byte-identical). A
  // STACKABLE potion/material stack instead serialises { id, count } (Task 21).
  function serializeInst(inst) {
    if (inst && inst.count != null && isStackable(inst.id)) return { id: inst.id, count: inst.count | 0 };
    const out = { id: inst.id, lvl: instLevel(inst) };
    if (inst.affixes && inst.affixes.length) out.aff = inst.affixes.slice();
    return out;
  }

  // Per-zone resource ecology → a compact save map (Task 22, v13). Each zone id
  // maps to its node list (kind + rounded x/z + remaining respawn) plus the
  // regrow clock state. Empty/absent → omitted so the field is small.
  function serializeZoneRes(zoneRes) {
    const out = {};
    if (!zoneRes) return out;
    const round = (n) => Math.round(n * 1000) / 1000;
    for (const id in zoneRes) {
      const rec = zoneRes[id]; if (!rec || !ZONE_BY_ID[id]) continue;
      out[id] = {
        nodes: (rec.nodes || []).map((nd) => ({
          k: nd.kind, x: round(nd.x), z: round(nd.z),
          r: Math.max(0, round(nd.respawn || 0)),
        })),
        acc: round(rec.regrowAcc || 0),
        s: rec.sprouts | 0,
      };
    }
    return out;
  }

  // Rebuild the per-zone resource map from a save (Task 22). Drops unknown zones
  // and unknown resource kinds; clamps each zone to the global node cap. A v<13
  // save has no field → returns {} so each zone re-plans its deterministic set on
  // first entry (the seed is the same, so the world is reproduced cleanly).
  function deserializeZoneRes(saved) {
    const out = {};
    if (!saved || typeof saved !== "object") return out;
    for (const id in saved) {
      if (!ZONE_BY_ID[id]) continue;
      const rec = saved[id] || {};
      const nodes = [];
      for (const nd of (Array.isArray(rec.nodes) ? rec.nodes : [])) {
        if (nodes.length >= CONFIG.maxResourceNodes) break;
        if (!nd || !RESOURCE_KINDS[nd.k]) continue;
        nodes.push({ kind: nd.k, x: +nd.x || 0, z: +nd.z || 0, respawn: Math.max(0, +nd.r || 0) });
      }
      out[id] = { nodes, regrowAcc: Math.max(0, +rec.acc || 0), sprouts: rec.s | 0 };
    }
    return out;
  }

  // Equipment → a plain { slot: {id,lvl,aff} | "__2H__" | null } map for the save.
  function serializeEquipment(player) {
    const out = {};
    for (const slot of EQUIP_SLOTS) {
      const occ = player.equipment[slot];
      out[slot] = occ === TWO_HANDED ? TWO_HANDED : occ ? serializeInst(occ) : null;
    }
    return out;
  }

  // Rebuild an item instance from a save entry: a plain id string (legacy v2) or a
  // { id, lvl, aff } object (v3+; affixes added in v7). A STACKABLE entry carries
  // { id, count } (v12+) → a stack instance. Unknown items/affixes are dropped so
  // a foreign/older file still loads cleanly.
  function itemFromSave(entry) {
    if (entry == null) return null;
    const id = typeof entry === "string" ? entry : entry.id;
    if (!getDef(id)) return null;
    // Stackable item: rebuild as a counted stack (clamped ≥ 1).
    if (isStackable(id)) {
      const count = (typeof entry === "object" && entry.count != null) ? (entry.count | 0) : 1;
      if (count <= 0) return null;
      return { id, uid: _instSeq++, count: Math.min(STACK_MAX, count) };
    }
    const inst = makeItem(id);
    const lvl = typeof entry === "object" ? (entry.lvl | 0) : 0;
    if (lvl > 0) inst.level = lvl;
    if (typeof entry === "object" && Array.isArray(entry.aff)) {
      const aff = entry.aff.filter((a) => AFFIXES[a]);
      if (aff.length) inst.affixes = aff;
    }
    return inst;
  }

  // ---- Legacy bag migration (Task 21; SAVE_VERSION 12) --------------------
  // Pure: takes a saved player block + its save version and returns the unified
  // bag's `inventory` save-entries + the 3 `potionSlots` (potion ids). It runs
  // for every save, but only *folds in* the legacy side-stores when the save
  // predates v12:
  //   - legacy `materials` map ({ wood: n, … })   → stackable bag entries
  //   - legacy `potions` belt ([{ id, count }|null]) → stackable bag entries +
  //     each occupied belt slot's potion id becomes that quick-slot's assignment
  // v12+ saves already store the unified bag + `potionSlots`, so they pass
  // through untouched. Counts are coalesced per id and clamped to ≥ 1.
  function migrateLegacyBag(ps, version) {
    ps = ps || {};
    const out = (ps.inventory || []).slice();
    // v12+ save: bag + quick-slots are already unified.
    if (version >= 12) {
      const slots = Array.isArray(ps.potionSlots) ? ps.potionSlots.slice(0, POTION_SLOTS) : [];
      while (slots.length < POTION_SLOTS) slots.push(null);
      const valid = slots.map((id) => (id && getDef(id) && getDef(id).type === "potion") ? id : null);
      return { inventory: out, potionSlots: valid };
    }
    // Pre-v12: fold the side-stores in. Coalesce material counts per id so they
    // land as proper stacks; append one entry per id.
    const matCounts = {};
    const mats = ps.materials || {};
    for (const k in mats) {
      if (!isMaterial(k)) continue;
      const n = mats[k] | 0;
      if (n > 0) matCounts[k] = (matCounts[k] || 0) + n;
    }
    for (const k in matCounts) out.push({ id: k, count: matCounts[k] });
    // The legacy belt: each non-empty slot becomes a bag potion stack AND that
    // slot index keeps its potion id as the quick-slot assignment.
    const potionSlots = [null, null, null];
    const belt = Array.isArray(ps.potions) ? ps.potions : [];
    for (let i = 0; i < POTION_SLOTS; i++) {
      const s = belt[i];
      if (s && getDef(s.id) && getDef(s.id).type === "potion" && (s.count | 0) > 0) {
        out.push({ id: s.id, count: s.count | 0 });
        potionSlots[i] = s.id;
      }
    }
    return { inventory: out, potionSlots };
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
    // Suppress the Task-17 auto-persist while we lay the run in (the in-progress
    // half-restored state must never overwrite the snapshot we're restoring from).
    Session._restoring = true;
    try {
    return _applySaveBody(d, state, player, interaction);
    } finally {
      Session._restoring = false;
    }
  }
  function _applySaveBody(d, state, player, interaction) {

    // Money economy. (The legacy `score` field, dropped in v11, is ignored: older
    // saves still carry it but the game no longer tracks a score.)
    state.coins = d.money | 0;

    // Persistent progression the zone rebuild reads.
    state.bossesCleared = Object.assign({}, d.bossesCleared || {});
    state.castleBuilt = (d.castle || []).slice();

    // World-map state (v9; legacy saves default to "only the saved zone known",
    // no waypoint). The saved/target zone is always marked discovered below.
    state.discovered = {};
    for (const id of (Array.isArray(d.discovered) ? d.discovered : [])) if (ZONE_BY_ID[id]) state.discovered[id] = true;
    state.waypoint = validWaypoint(d.waypoint) ? { kind: d.waypoint.kind, id: d.waypoint.id } : null;

    // Per-zone resource ecology (v13, Task 22). Restored BEFORE the zone swap so
    // the target zone rebuilds its exact saved node set + cooldowns instead of
    // scattering a fresh batch. A pre-v13 save has no field → {}; each zone then
    // plans its deterministic set from the (restored) seed on first entry, so the
    // world is still reproduced cleanly and counts stay stable thereafter.
    state.zoneRes = deserializeZoneRes(d.zoneRes);

    // Player gear (zone-independent). Rebuild the UNIFIED bag + equipped slots,
    // then recompute the whole derived stat block. Pre-v12 saves carried a
    // separate `potions` belt + `materials` map; fold them into the bag here
    // (migrateLegacyBag, exactly once) so existing players keep all their stuff.
    const ps = d.player;
    player.facing = ps.facing || 0;
    const migrated = migrateLegacyBag(ps, (d.v | 0) || 0);
    player.inventory = migrated.inventory.map(itemFromSave).filter(Boolean);
    player.potionSlots = migrated.potionSlots.slice(0, POTION_SLOTS);
    while (player.potionSlots.length < POTION_SLOTS) player.potionSlots.push(null);
    const eq = player.equipment;
    for (const slot of EQUIP_SLOTS) eq[slot] = null;
    const savedEq = ps.equipment || {};
    for (const slot of EQUIP_SLOTS) {
      const v = savedEq[slot];
      if (v === TWO_HANDED) eq[slot] = TWO_HANDED;
      else { const inst = itemFromSave(v); if (inst) eq[slot] = inst; }
    }
    // Castle relics collected (materials now live in the bag, restored above).
    player.relics = (ps.relics || []).filter((id) => RELICS[id]);
    player.buffs = [];
    // Drop any quick-slot whose potion isn't actually in the restored bag.
    syncPotionSlots(player);
    // Skill & leveling progression (defaults sanely for legacy < v8 saves: level 1,
    // the starter skill, full focus). Restored BEFORE recompute so the level's
    // bonus max-health is folded into the stat block.
    Skills.restore(player, ps.progress);
    recomputeStats(player);
    updatePotionBar(player);
    updateRelicHud(player);
    updateSkillsHud(player);

    // Story progression: kills, quests, the campaign-flow state, win flag.
    // Unknown ids (e.g. from a pre-campaign save) drop out, defaulting cleanly.
    state.totalKills = d.totalKills | 0;
    // v11: lifetime relics for the recap. Pre-v11 saves default to however many
    // the player is still carrying (a sane lower bound — built ones are gone).
    state.relicsFound = d.relicsFound != null ? d.relicsFound | 0 : (player.relics ? player.relics.length : 0);
    state.playSec = Math.max(0, +d.playSec || 0);   // v10 (legacy → 0)
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
    state.discovered[targetZone] = true;   // you're always standing in a known zone
    if (state.zoneId !== targetZone && zoneManager) {
      zoneManager._swap(state.zoneId, targetZone, ZONE_BY_ID[targetZone]);
    } else {
      // Restoring INTO the current zone (the hub on boot): the live resources
      // were built from a freshly-planned record at boot. Replace them with the
      // SAVED set (Task 22) so depletion/positions match the snapshot, then
      // restore the castle build + re-wake the dragon if it was complete.
      rebuildZoneResources(state);
      if (state.castle) { state.castle.restore(state.castleBuilt); state.castle.resummon(); }
    }

    // Day/night + weather (after the swap so the zone's handles are current).
    if (d.time != null) DayNight.set(d.time);
    if (d.weather) Weather.setState(d.weather);

    // Customizable control layout (v14, Task 36). The device's own localStorage
    // layout is the LIVE source and wins; a device with none yet adopts the save's
    // as its portable default. Either way the layout is (re)applied to the DOM.
    // A pre-v14 save has no `controls` field → an empty map → defaults stand.
    ControlLayout.applyFromSave(d.controls);

    // Drop the player exactly where they saved (override the arrival spot).
    player.root.position.set(ps.pos[0], 0, ps.pos[1]);
    player.health = ps.health != null ? Math.min(player.maxHealth, ps.health) : player.maxHealth;
    updateHealthBar(player.health);

    // Refresh every HUD readout.
    updateXpHud(player);
    updateCoins(state);
    updateLocationHud(ZONE_BY_ID[state.zoneId]);
    WorldMap.update(0);                 // redraw the minimap + restored compass
    if (WorldMapUI.open) WorldMapUI.render();
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
      const lvl = (data.player && data.player.progress && data.player.progress.level) || 1;
      a.download = `good-game-3d-${data.zone || "meadow"}-lv${lvl}-${stamp}.json`;
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
  // Save slots (Task 18) — multiple NAMED manual save slots, like a shipped RPG.
  // The single file-download model is kept as an extra export/import option, but
  // the primary UX is in-game slots: 6 local slots persisted to localStorage,
  // each storing the FULL serializeGame() payload + lightweight metadata (name,
  // timestamp, zone, level, playtime) used to render the slot list without
  // parsing every payload.
  //
  // The slot logic is PURE (a small store object the UI just renders); the only
  // browser touch is read()/write() over localStorage, which fail soft like the
  // rest. Older single-slot data (the Task-17 auto-session snapshot) migrates in
  // gracefully on first read so an existing player's run is never stranded.
  // =========================================================================
  const SLOTS_KEY = "gg3d_slots";   // localStorage: the manual-slot store
  const SLOTS_VERSION = 1;          // the SLOT-STORE envelope schema (not the save schema)
  const SLOT_COUNT = 6;             // number of manual local slots
  const SLOT_NAME_MAX = 40;         // rename length cap (i18n-safe; trimmed)

  // Clamp a free-form slot name to something sane + length-capped. Pure.
  function sanitizeSlotName(name) {
    let s = (name == null ? "" : String(name)).replace(/[\r\n\t]+/g, " ").trim();
    if (s.length > SLOT_NAME_MAX) s = s.slice(0, SLOT_NAME_MAX).trim();
    return s;
  }

  // Default display name for a slot index (1-based), used for "New save" + the
  // empty-slot label. Localized at render time, so store only the number.
  function defaultSlotName(i) { return t("saves.slotN", { n: i + 1 }); }

  // Derive the lightweight metadata shown in the slot list from a full save
  // payload. Pure + defensive: a foreign/older payload still yields sane fields.
  function slotMetaFromPayload(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const player = p.player && typeof p.player === "object" ? p.player : {};
    const prog = player.progress && typeof player.progress === "object" ? player.progress : {};
    return {
      zone: typeof p.zone === "string" ? p.zone : HUB_ZONE,
      level: Math.max(1, prog.level | 0 || 1),
      playSec: Math.max(0, +p.playSec || 0),
      savedAt: typeof p.savedAt === "string" ? p.savedAt : null,
    };
  }

  // ---- Pure store helpers (operate on a plain { v, slots:{} } object) -------

  // Normalize any stored/garbage value into a valid slot store. Pure + total.
  function normalizeSlotStore(raw) {
    const store = { v: SLOTS_VERSION, slots: {} };
    if (!raw || typeof raw !== "object") return store;
    const slots = raw.slots && typeof raw.slots === "object" ? raw.slots : {};
    for (let i = 0; i < SLOT_COUNT; i++) {
      const rec = slots[i];
      if (rec && typeof rec === "object" && validateSave(rec.payload)) {
        store.slots[i] = {
          name: sanitizeSlotName(rec.name) || defaultSlotName(i),
          savedAt: typeof rec.savedAt === "string" ? rec.savedAt : (rec.payload.savedAt || null),
          payload: rec.payload,
          meta: slotMetaFromPayload(rec.payload),
        };
      }
    }
    return store;
  }

  // A render-friendly list of all SLOT_COUNT slots, occupied or empty, in order.
  // Pure: returns [{ index, used, name, savedAt, meta }] — the UI maps over it.
  function listSlots(store) {
    const s = (store && store.slots) || {};
    const out = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const rec = s[i];
      out.push(rec
        ? { index: i, used: true, name: rec.name, savedAt: rec.savedAt, meta: rec.meta }
        : { index: i, used: false, name: null, savedAt: null, meta: null });
    }
    return out;
  }

  // The first empty slot index, or -1 when every slot is full. Pure.
  function nextFreeSlot(store) {
    const s = (store && store.slots) || {};
    for (let i = 0; i < SLOT_COUNT; i++) if (!s[i]) return i;
    return -1;
  }

  // Pure mutators returning a NEW store (immutable-style, easy to test) -------
  function putSlotRecord(store, index, payload, name) {
    const next = { v: SLOTS_VERSION, slots: Object.assign({}, (store && store.slots) || {}) };
    if (index < 0 || index >= SLOT_COUNT || !validateSave(payload)) return next;
    next.slots[index] = {
      name: sanitizeSlotName(name) || defaultSlotName(index),
      savedAt: payload.savedAt || new Date().toISOString(),
      payload,
      meta: slotMetaFromPayload(payload),
    };
    return next;
  }
  function renameSlotRecord(store, index, name) {
    const next = { v: SLOTS_VERSION, slots: Object.assign({}, (store && store.slots) || {}) };
    const rec = next.slots[index];
    if (!rec) return next;
    next.slots[index] = Object.assign({}, rec, { name: sanitizeSlotName(name) || defaultSlotName(index) });
    return next;
  }
  function deleteSlotRecord(store, index) {
    const next = { v: SLOTS_VERSION, slots: Object.assign({}, (store && store.slots) || {}) };
    delete next.slots[index];
    return next;
  }

  // The slot controller: the thin persistence + game-facing API over the pure
  // helpers above. Headless-safe (localStorage feature-detected via localGet/Set).
  const SaveSlots = {
    SLOT_COUNT,
    _migrated: false,

    // Read the persisted store, migrating a legacy single-slot snapshot in once.
    read() {
      let raw = null;
      try { const s = localGet(SLOTS_KEY); if (s) raw = JSON.parse(s); } catch (e) { raw = null; }
      const store = normalizeSlotStore(raw);
      // First-ever read with NO slot store yet: import the Task-17 auto-session
      // snapshot (the only prior local "single slot") so an in-progress run is
      // preserved as a named slot rather than stranded. Done once, then persisted.
      if (!raw && !this._migrated) {
        this._migrated = true;
        const legacy = (typeof Session !== "undefined" && Session.readSnapshot) ? Session.readSnapshot() : null;
        if (legacy && nextFreeSlot(store) >= 0) {
          const migrated = putSlotRecord(store, nextFreeSlot(store), legacy, t("saves.migrated"));
          this.write(migrated);
          return migrated;
        }
      }
      return store;
    },
    write(store) {
      try { localSet(SLOTS_KEY, JSON.stringify(normalizeSlotStore(store))); return true; }
      catch (e) { return false; }
    },

    list() { return listSlots(this.read()); },
    nextFree() { return nextFreeSlot(this.read()); },

    // Save the live run into a slot (the full serializeGame() payload). Returns
    // the written record's index, or -1 on failure / nothing to save.
    saveTo(index, name) {
      const payload = serializeGame();
      if (!payload) return -1;
      const cur = this.read();
      const existing = cur.slots[index];
      const next = putSlotRecord(cur, index, payload, name != null ? name : (existing ? existing.name : defaultSlotName(index)));
      return this.write(next) ? index : -1;
    },
    // Save into the next free slot (or -1 when all full → caller offers overwrite).
    saveNew() {
      const idx = this.nextFree();
      if (idx < 0) return -1;
      return this.saveTo(idx, defaultSlotName(idx));
    },
    rename(index, name) {
      const next = renameSlotRecord(this.read(), index, name);
      return this.write(next);
    },
    remove(index) {
      const next = deleteSlotRecord(this.read(), index);
      return this.write(next);
    },
    // The raw payload behind a slot (for Load), or null when empty/unreadable.
    payloadOf(index) {
      const rec = this.read().slots[index];
      return rec ? rec.payload : null;
    },

    // Load a slot into a running/ booting game through the SAME boot reload path
    // the file/cloud load uses (re-seed → rebuild → applySave), so migration is
    // identical. Reconciles against the live run so a load can't silently wipe
    // newer in-progress work (reuse the Task-15 newer-of policy).
    load(index) {
      const payload = this.payloadOf(index);
      if (!validateSave(payload)) { toast(t("toast.invalidSave")); return false; }
      if (gameStarted) {
        const cur = serializeGame();
        if (cur && cloudNewer({ savedAt: cur.savedAt }, { savedAt: payload.savedAt }) === "a") {
          if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(t("saves.confirmOlder"))) return false;
        }
      }
      sessionSet(PENDING_LOAD_KEY, JSON.stringify(payload));
      try { if (typeof window !== "undefined" && window.location) window.location.reload(); } catch (e) {}
      return true;
    },
  };

  // Format a playtime (seconds) as a compact "1h 23m" / "12m" / "45s". Pure +
  // feature-free so it's unit-testable; localized via the i18n unit suffixes.
  function fmtPlaytime(sec) {
    sec = Math.max(0, Math.floor(+sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return t("saves.hm", { h, m });
    if (m > 0) return t("saves.ms", { m, s });
    return t("saves.s", { s });
  }

  // =========================================================================
  // Durable session persistence (Task 17). The live run and the player's
  // sign-in survive a reload — and any desktop⇄mobile mode switch / re-orient /
  // graphics-quality reload — without re-loading a file or signing in again, the
  // way shipped web games keep you logged in and mid-run across reloads.
  //
  //   • The bulky run snapshot (the exact serializeGame() JSON) lives in
  //     localStorage (size-limited cookies would never hold it). It is rewritten
  //     debounced on key beats (zone travel, level-up, quest turn-in, purchase)
  //     and flushed synchronously on visibilitychange/pagehide, then auto-restored
  //     on boot through the SAME PENDING_LOAD seam the file/cloud load uses — so
  //     re-seeding + SAVE_VERSION migration are identical. A "Continue" entry
  //     point is offered rather than silently forcing the resume.
  //   • A small first-party COOKIE carries the long-lived identifiers that should
  //     travel with the session: a session id, the chosen locale/quality, the
  //     "cloud autosave on" flag, and a non-sensitive auth hint so we can SILENTLY
  //     re-acquire a Google token. Cookies are SameSite=Lax; Secure (HTTPS Pages)
  //     with a sensible Max-Age, feature-detected, and fall back to localStorage
  //     when document.cookie is unavailable (private mode / headless). No
  //     third-party/tracking cookies — first-party persistence only. NO secrets
  //     are ever stored — only the non-sensitive hint client-side.
  //
  // Everything degrades gracefully: blocked cookies, no localStorage, signed-out,
  // offline or headless all keep the game playable and never throw.
  // =========================================================================
  const SESSION_KEY = "gg3d_session";      // localStorage: the auto-persisted run snapshot
  const COOKIE_NAME = "gg3d_sess";         // first-party cookie: small session identifiers
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days (seconds)
  const SESSION_DEBOUNCE_MS = 1500;        // coalesce rapid key beats into one write

  // ---- Pure cookie helper -------------------------------------------------
  // Build a `Set-Cookie`-style assignment string for `document.cookie`. Pure +
  // attribute-complete so the SameSite/Secure/Max-Age policy is unit-testable
  // without a browser. `Secure` is dropped on a plain-http origin (e.g. file://
  // or localhost dev) so the cookie still sets there; production Pages is HTTPS.
  function buildCookieString(name, value, opts) {
    opts = opts || {};
    const enc = (v) => { try { return encodeURIComponent(v); } catch (e) { return String(v); } };
    let s = enc(name) + "=" + (value == null ? "" : enc(value));
    s += "; Path=/";
    s += "; SameSite=" + (opts.sameSite || "Lax");
    const maxAge = opts.maxAge != null ? opts.maxAge : COOKIE_MAX_AGE;
    if (opts.expire) s += "; Max-Age=0";
    else if (maxAge != null) s += "; Max-Age=" + (maxAge | 0);
    if (opts.secure) s += "; Secure";
    return s;
  }
  // Parse a raw `document.cookie` string into a name→value map (pure, decoded).
  function parseCookies(raw) {
    const out = {};
    if (typeof raw !== "string" || !raw) return out;
    for (const part of raw.split(";")) {
      const i = part.indexOf("=");
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      if (!k) continue;
      let v = part.slice(i + 1).trim();
      try { v = decodeURIComponent(v); } catch (e) {}
      out[k] = v;
    }
    return out;
  }
  // True when this origin is served over HTTPS (so the cookie should be Secure).
  function cookiesSecureHere() {
    try { return typeof location !== "undefined" && location.protocol === "https:"; }
    catch (e) { return false; }
  }
  // Are first-party cookies usable? Feature-detected (headless / locked-down
  // privacy modes expose no document.cookie).
  function cookiesAvailable() {
    try { return typeof document !== "undefined" && typeof document.cookie === "string"; }
    catch (e) { return false; }
  }
  // Read/write/expire a cookie value, falling back to localStorage when cookies
  // are unavailable, so the small identifiers survive even in private/headless
  // contexts. Never throws.
  function cookieGet(name) {
    if (cookiesAvailable()) {
      const v = parseCookies(document.cookie)[name];
      if (v != null) return v;
    }
    return localGet("ck_" + name);
  }
  function cookieSet(name, value, opts) {
    opts = Object.assign({ secure: cookiesSecureHere() }, opts || {});
    if (cookiesAvailable()) {
      try { document.cookie = buildCookieString(name, value, opts); } catch (e) {}
    }
    localSet("ck_" + name, String(value)); // mirror so the fallback path stays in sync
  }
  function cookieDel(name) {
    if (cookiesAvailable()) {
      try { document.cookie = buildCookieString(name, "", { expire: true, secure: cookiesSecureHere() }); } catch (e) {}
    }
    localDel("ck_" + name);
  }

  // ---- Cookie-borne session identifiers (the small, long-lived datums) -----
  // Stored as one compact JSON object in the cookie: a session id, the chosen
  // locale + graphics tier, the cloud-autosave flag, and the Google auth hint.
  // Read/merge/write so updating one field never drops the others.
  function readCookieState() {
    const raw = cookieGet(COOKIE_NAME);
    if (!raw) return {};
    try { const o = JSON.parse(raw); return (o && typeof o === "object") ? o : {}; }
    catch (e) { return {}; }
  }
  function writeCookieState(patch) {
    const cur = readCookieState();
    const next = Object.assign({}, cur, patch || {});
    // Drop nulls so an explicit clear shrinks the cookie instead of storing null.
    for (const k in next) if (next[k] == null) delete next[k];
    try { cookieSet(COOKIE_NAME, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  // ---- Pure scheduler decision -------------------------------------------
  // Should a debounced auto-persist flush now? Pure over the scheduler state so
  // the debounce + immediate-flush behaviour is unit-testable without timers.
  // A `force` beat (hide/pagehide) always flushes; otherwise the debounce window
  // must have elapsed since the last queued beat.
  function sessionPersistDue(s, now) {
    if (!s || !s.dirty) return false;
    if (s.force) return true;
    const debounce = s.debounceMs != null ? s.debounceMs : SESSION_DEBOUNCE_MS;
    return (now - (s.queuedAt || 0)) >= debounce;
  }

  // ---- Pure silent-auth decision -----------------------------------------
  // Given the persisted auth hint, decide whether to attempt a SILENT Google
  // token refresh on boot: only when the player had opted in (a stored hint) and
  // hasn't signed out. Returns { attempt, loginHint } so the caller can pass the
  // hint to GIS. Signing out clears the hint, so this returns attempt:false after.
  function silentAuthDecision(hint) {
    if (!hint || !hint.optedIn) return { attempt: false, loginHint: "" };
    return { attempt: true, loginHint: hint.email || "" };
  }

  // ---- The session controller --------------------------------------------
  const Session = {
    sched: { dirty: false, force: false, queuedAt: 0 },
    _restoring: false,   // suppress auto-persist while applySave lays a run in
    _wired: false,

    // Read the auto-persisted run snapshot (the parsed serializeGame() JSON), or
    // null when there's nothing stored / it's unreadable / it fails validation.
    readSnapshot() {
      let raw;
      try { raw = localGet(SESSION_KEY); } catch (e) { raw = null; }
      if (!raw) return null;
      let data; try { data = JSON.parse(raw); } catch (e) { data = null; }
      return validateSave(data) ? data : null;
    },
    rawSnapshot() { try { return localGet(SESSION_KEY); } catch (e) { return null; } },
    hasSnapshot() { return !!this.readSnapshot(); },

    // Persist the live run right now (synchronous). No-ops before a run exists.
    flush() {
      if (this._restoring) return false;
      const data = serializeGame();
      if (!data) return false;
      try { localSet(SESSION_KEY, JSON.stringify(data)); } catch (e) { return false; }
      // Stamp the cookie with the session id + the device prefs that should ride
      // along (so a desktop⇄mobile reload restores the same locale/quality).
      const st = readCookieState();
      writeCookieState({
        sid: st.sid || ("s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
        locale: I18N.locale,
        gfx: (typeof Quality !== "undefined" && Quality.pref) ? Quality.pref : st.gfx,
        cloud: CloudSave.enabled ? 1 : 0,
      });
      this.sched.dirty = false; this.sched.force = false;
      return true;
    },

    // Mark the run dirty (a key beat happened). The render-loop tick flushes once
    // the debounce window elapses, coalescing rapid beats into a single write.
    mark(force) {
      if (this._restoring) return;
      if (!gameStarted) return;
      this.sched.dirty = true;
      this.sched.queuedAt = nowMs();
      if (force) this.sched.force = true;
    },

    // Render-loop hook (cheap, wall-clock gated): flush when the debounce is due.
    tick(now) {
      if (sessionPersistDue(this.sched, now)) this.flush();
    },

    // Clear the auto-persisted run snapshot (and the "Continue" affordance). Keeps
    // the cookie's device prefs; only wipes the run + makes Continue disappear.
    clearSnapshot() {
      try { localDel(SESSION_KEY); } catch (e) {}
      this.sched.dirty = false; this.sched.force = false;
    },

    // Wipe EVERYTHING this device persisted for the player: the run snapshot, the
    // session cookie, and the Google sign-in (so no silent re-auth happens after).
    clearAll() {
      this.clearSnapshot();
      try { cookieDel(COOKIE_NAME); } catch (e) {}
      this.forgetAuth();
    },

    // ---- Google auth hint (non-sensitive) --------------------------------
    // Remember that the player opted into cloud + an optional account hint so we
    // can silently re-acquire a token next boot. NEVER stores tokens/secrets.
    rememberAuth(email) {
      writeCookieState({ auth: { optedIn: true, email: email || "" } });
    },
    forgetAuth() { writeCookieState({ auth: null }); },
    authHint() { const st = readCookieState(); return st.auth || null; },

    // Flush on tab-hide / navigation so an unexpected close still saves the run.
    wireUnload() {
      if (this._wired) return;
      this._wired = true;
      const flushNow = () => { this.sched.force = true; this.flush(); };
      try {
        if (typeof document !== "undefined" && document.addEventListener) {
          document.addEventListener("visibilitychange", () => { if (document.hidden) flushNow(); });
        }
        if (typeof window !== "undefined" && window.addEventListener) {
          window.addEventListener("pagehide", flushNow);
        }
      } catch (e) {}
    },
  };
  // Monotonic-ish wall clock (Date.now wrapper kept tiny + headless-safe).
  function nowMs() { try { return Date.now(); } catch (e) { return 0; } }

  // =========================================================================
  // Cloud saves — Google Drive `appDataFolder` (Task 15). OPT-IN: the player
  // signs in with Google (drive.appdata scope only — a private folder no other
  // app can see). Manual "Save to Drive" + a 5-minute autosave that keeps a
  // rolling one-hour history of timestamped autosaves, all reusing the SAME
  // serializeGame()/applySave() JSON as the local file save so versioning +
  // migration just work (no schema change — the autosave-on preference is a
  // device setting persisted to localStorage like the locale / graphics tier).
  //
  // Everything here degrades gracefully: with no OAuth client id configured, no
  // `fetch`, or in the headless harness, the feature is cleanly disabled and the
  // existing local save still works — nothing throws, nothing blocks the main
  // thread. The Drive client is *injectable* (`CloudSave._setClient`) so the
  // logic is fully testable against a stub with no network.
  // =========================================================================
  const CLOUD_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const CLOUD_KEY = "gg3d_cloud";                 // persisted { autosave } preference
  const CLOUD_AUTOSAVE_MS = 5 * 60 * 1000;        // autosave cadence (5 minutes)
  const CLOUD_HISTORY_MS = 60 * 60 * 1000;        // rolling history window (1 hour)
  const CLOUD_MAX_SLOTS = 12;                      // ~12 autosaves in an hour
  const CLOUD_MANUAL_NAME = "gg3d-save.json";      // the single manual slot
  const CLOUD_AUTO_PREFIX = "gg3d-auto-";          // autosave files: <prefix><epochMs>.json
  const SILENT_AUTH_TIMEOUT_MS = 8000;             // boot silent re-auth watchdog (never hang on UI)

  // ---- Pure, testable policy helpers (no browser / no I/O) ----------------

  // Should an autosave fire right now? Pure decision over the scheduler state.
  // Gated by sign-in + the autosave toggle, paused while the tab is hidden/idle,
  // debounced against an in-flight write, and only due once the interval elapses.
  function cloudAutosaveDue(s, now) {
    if (!s || !s.enabled || !s.signedIn || s.hidden || s.inFlight) return false;
    const interval = s.intervalMs || CLOUD_AUTOSAVE_MS;
    return (now - (s.lastAt || 0)) >= interval;
  }

  // The autosave file name encodes its epoch-ms timestamp so a plain Drive
  // listing is sortable and prunable without reading file bodies.
  function cloudAutoName(ts) { return CLOUD_AUTO_PREFIX + Math.floor(ts) + ".json"; }
  function cloudParseAuto(name) {
    if (typeof name !== "string" || name.indexOf(CLOUD_AUTO_PREFIX) !== 0) return null;
    const m = name.slice(CLOUD_AUTO_PREFIX.length).replace(/\.json$/, "");
    const ts = parseInt(m, 10);
    return isFinite(ts) && ts > 0 ? ts : null;
  }

  // Retention/pruning policy: given autosave metas [{id, ts}] and "now", return
  // the ids to DELETE — anything older than the history window or beyond the slot
  // cap. `keepNewest` always retains the single most-recent autosave so a player
  // who returns after a long break never loses their last checkpoint.
  function cloudPrune(files, now, opts) {
    opts = opts || {};
    const maxAgeMs = opts.maxAgeMs != null ? opts.maxAgeMs : CLOUD_HISTORY_MS;
    const maxCount = opts.maxCount != null ? opts.maxCount : CLOUD_MAX_SLOTS;
    const keepNewest = opts.keepNewest !== false;
    const sorted = (files || []).slice().filter((f) => f && isFinite(f.ts)).sort((a, b) => b.ts - a.ts);
    const del = [];
    let kept = 0;
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      if (i === 0 && keepNewest) { kept++; continue; }   // always keep the latest
      const tooOld = (now - f.ts) > maxAgeMs;
      const overCap = kept >= maxCount;
      if (tooOld || overCap) del.push(f.id);
      else kept++;
    }
    return del;
  }

  // Reconcile two saves by their `savedAt` ISO timestamps → "a" | "b" | "equal".
  // Used on load so a cloud save never silently clobbers newer in-progress work.
  function cloudNewer(a, b) {
    const ta = a && a.savedAt ? Date.parse(a.savedAt) : NaN;
    const tb = b && b.savedAt ? Date.parse(b.savedAt) : NaN;
    const va = isFinite(ta) ? ta : -Infinity, vb = isFinite(tb) ? tb : -Infinity;
    if (va > vb) return "a";
    if (vb > va) return "b";
    return "equal";
  }

  // Human-readable timestamp for the cloud-saves list (feature-detected).
  function cloudFmtTime(ts) {
    try { return new Date(ts).toLocaleString(I18N.locale === "ru" ? "ru-RU" : "en-US"); }
    catch (e) { try { return new Date(ts).toISOString(); } catch (e2) { return ""; } }
  }

  // ---- Production Drive client (Google Identity Services + Drive REST) ------
  // Built lazily only when a client id + `fetch` exist; never touched headless.
  // Uses raw `fetch` to the Drive REST API (no heavy gapi client) so the site
  // stays static — only the tiny GIS script loads on demand at first sign-in.
  function makeGoogleDriveClient(clientId) {
    let accessToken = null;
    let tokenClient = null;
    const API = "https://www.googleapis.com/drive/v3";
    const UP = "https://www.googleapis.com/upload/drive/v3";

    function gisReady() {
      return typeof google !== "undefined" && google.accounts && google.accounts.oauth2;
    }
    function loadGis() {
      if (gisReady()) return Promise.resolve();
      return new Promise((resolve, reject) => {
        try {
          const s = document.createElement("script");
          s.src = "https://accounts.google.com/gsi/client";
          s.async = true; s.defer = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("gis_load_failed"));
          (document.head || document.body || document.documentElement).appendChild(s);
        } catch (e) { reject(e); }
      });
    }
    // The pending request's reject handler — set per `requestToken` call so the
    // token client's shared `error_callback` (non-OAuth failures: popup blocked /
    // closed) can abort the in-flight request without surfacing UI.
    let pendingReject = null;
    function ensureTokenClient() {
      if (tokenClient) return;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: CLOUD_SCOPE, callback: () => {},
        // Non-OAuth errors (the GIS popup failed to open or was closed before a
        // response) arrive here, NOT in `callback`. Route them to the current
        // request's rejection so a blocked/closed popup fails soft — on the boot
        // silent path that means we quietly fall back to the explicit button.
        error_callback: (err) => {
          const rej = pendingReject; pendingReject = null;
          if (rej) rej(new Error(err && err.type ? err.type : "gis_error"));
        },
      });
    }
    // Request an access token.
    //   `prompt` is the GIS consent prompt: "consent" for an explicit sign-in,
    //   "none" for a STRICTLY SILENT refresh — GIS shows NO popup/account chooser
    //   and instead fails (via callback `error` or `error_callback`) when any user
    //   interaction would be needed. (We must NOT use "" here: with "" GIS still
    //   raises a visible account chooser when the session is stale — the Task 23
    //   bug.) An optional `loginHint` (a remembered account email) steers it to the
    //   right account. `opts.silent` adds a watchdog timeout so a hung silent
    //   request can never leave the boot path waiting on UI that will never come.
    function requestToken(prompt, loginHint, opts) {
      opts = opts || {};
      return new Promise((resolve, reject) => {
        let done = false;
        let timer = null;
        const settleReject = (e) => {
          if (done) return; done = true;
          if (timer) { try { clearTimeout(timer); } catch (e2) {} }
          if (pendingReject === onError) pendingReject = null;
          reject(e);
        };
        const settleResolve = (v) => {
          if (done) return; done = true;
          if (timer) { try { clearTimeout(timer); } catch (e2) {} }
          if (pendingReject === onError) pendingReject = null;
          resolve(v);
        };
        const onError = (e) => settleReject(e);
        try {
          ensureTokenClient();
          pendingReject = onError;
          tokenClient.callback = (resp) => {
            if (resp && resp.access_token) { accessToken = resp.access_token; settleResolve(accessToken); }
            else settleReject(new Error(resp && resp.error ? resp.error : "no_token"));
          };
          const req = { prompt: prompt || "" };
          if (loginHint) req.hint = loginHint;
          // Watchdog: on the silent path, never hang. If neither callback fires
          // within the window (e.g. a popup the policy would have shown), abort
          // quietly so the explicit Sign-in button stays the only interactive path.
          if (opts.silent && typeof setTimeout === "function") {
            timer = setTimeout(() => settleReject(new Error("silent_timeout")), opts.timeoutMs || SILENT_AUTH_TIMEOUT_MS);
          }
          tokenClient.requestAccessToken(req);
        } catch (e) { settleReject(e); }
      });
    }
    async function authFetch(url, opts) {
      if (typeof fetch !== "function") throw new Error("no_fetch");
      opts = opts || {};
      opts.headers = Object.assign({}, opts.headers, { Authorization: "Bearer " + accessToken });
      let res = await fetch(url, opts);
      if (res.status === 401) {                  // token expired → one strictly-silent refresh
        await requestToken("none", null, { silent: true });
        opts.headers.Authorization = "Bearer " + accessToken;
        res = await fetch(url, opts);
      }
      if (!res.ok) throw new Error("drive_http_" + res.status);
      return res;
    }

    return {
      hasToken() { return !!accessToken; },
      // Explicit, user-initiated sign-in: a consent prompt is allowed here (the
      // player just clicked "Sign in with Google").
      async signIn(loginHint) { await loadGis(); await requestToken("consent", loginHint); return true; },
      // Strictly-silent re-auth on boot: `prompt: "none"` so GIS shows NO popup or
      // account chooser — it grants a token only from an active, already-consented
      // Google session and otherwise fails soft (via the error_callback / timeout).
      // The caller then leaves the explicit Sign-in button as the only path to UI
      // (Task 23). NEVER opens visible UI.
      async signInSilent(loginHint) { await loadGis(); await requestToken("none", loginHint, { silent: true }); return true; },
      signOut() {
        try { if (accessToken && gisReady() && google.accounts.oauth2.revoke) google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
        accessToken = null;
        return Promise.resolve();
      },
      async list() {
        const url = API + "/files?spaces=appDataFolder&pageSize=100&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime)";
        const res = await authFetch(url);
        const data = await res.json();
        return (data && data.files) || [];
      },
      async upload(name, content, existingId) {
        if (existingId) {                         // overwrite the manual slot's body
          const res = await authFetch(UP + "/files/" + existingId + "?uploadType=media&fields=id,name,modifiedTime", {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: content,
          });
          return await res.json();
        }
        const boundary = "gg3d" + Date.now() + Math.random().toString(16).slice(2);
        const meta = { name, parents: ["appDataFolder"] };
        const body =
          "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
          JSON.stringify(meta) + "\r\n" +
          "--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" +
          content + "\r\n--" + boundary + "--";
        const res = await authFetch(UP + "/files?uploadType=multipart&fields=id,name,modifiedTime", {
          method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body,
        });
        return await res.json();
      },
      async download(id) {
        const res = await authFetch(API + "/files/" + id + "?alt=media");
        return await res.text();
      },
      async remove(id) { await authFetch(API + "/files/" + id, { method: "DELETE" }); return true; },
    };
  }

  // ---- The cloud-save controller ------------------------------------------
  const CloudSave = {
    client: null,
    clientId: "",
    signedIn: false,
    enabled: false,                  // autosave toggle (persisted to localStorage)
    hidden: false,                   // tab hidden/idle → autosave pauses
    busy: false,                     // a manual op is in flight (disables buttons)
    sched: { lastAt: 0, inFlight: false },
    _loaded: false,

    // Read the OAuth client id from config, in priority order:
    //   1. `window.GG_GOOGLE_CLIENT_ID` — a runtime override (e.g. an optional,
    //      git-ignored config script for local dev).
    //   2. `import.meta.env.VITE_GOOGLE_CLIENT_ID` — baked in at *build time* by
    //      Vite from the `VITE_GOOGLE_CLIENT_ID` env var. The deploy workflow
    //      feeds this from a GitHub Actions variable/secret in the `github-pages`
    //      environment, so the published bundle gets the id without it ever being
    //      hardcoded in the repo (see README → Cloud saves).
    //   3. `<meta name="gg-google-client-id">` — a manual fallback in index.html.
    // Empty ⇒ "not configured" (cloud saves stay cleanly disabled).
    readClientId() {
      try { if (typeof window !== "undefined" && window.GG_GOOGLE_CLIENT_ID) return String(window.GG_GOOGLE_CLIENT_ID).trim(); } catch (e) {}
      try {
        const env = (typeof import.meta !== "undefined" && import.meta && import.meta.env) ? import.meta.env : null;
        if (env && env.VITE_GOOGLE_CLIENT_ID) return String(env.VITE_GOOGLE_CLIENT_ID).trim();
      } catch (e) {}
      try {
        if (typeof document !== "undefined" && document.querySelector) {
          const m = document.querySelector('meta[name="gg-google-client-id"]');
          const c = m && m.getAttribute ? m.getAttribute("content") : "";
          if (c) return c.trim();
        }
      } catch (e) {}
      return "";
    },
    load() {
      if (this._loaded) return this;
      this._loaded = true;
      this.clientId = this.readClientId();
      try { const raw = localGet(CLOUD_KEY); if (raw) { const o = JSON.parse(raw); if (o && typeof o.autosave === "boolean") this.enabled = o.autosave; } } catch (e) {}
      return this;
    },
    persist() { try { localSet(CLOUD_KEY, JSON.stringify({ autosave: this.enabled })); } catch (e) {} },

    configured() { return !!this.clientId; },
    // True where the platform can actually reach Drive (configured + browser fetch).
    available() { return this.configured() && typeof fetch === "function"; },

    ensureClient() { if (!this.client && this.available()) this.client = makeGoogleDriveClient(this.clientId); return this.client; },
    _setClient(c) { this.client = c; },     // test seam (inject a stub client)

    async signIn() {
      if (!this.available()) { toast(t("cloud.notConfigured")); return false; }
      if (this.busy) return false;
      this.busy = true; this._sync();
      try {
        // Steer the consent flow to the remembered account when we have one.
        const prevHint = Session.authHint();
        await this.ensureClient().signIn(prevHint && prevHint.email);
        this.signedIn = true;
        this.sched.lastAt = Date.now();       // first autosave one interval from now
        // Remember the opt-in (a non-sensitive hint) so a reload can SILENTLY
        // re-acquire a token without a fresh consent dialog (Task 17/23). No secret
        // is ever stored — only the "opted in" flag (+ an optional account email
        // hint, here unknown under the appdata-only scope, so empty). The flag is
        // the gate `silentAuthDecision` reads back on the next boot.
        Session.rememberAuth((prevHint && prevHint.email) || "");
        Sfx.play("ui_click");
        toast(t("toast.cloudSignedIn"));
        return true;
      } catch (e) { toast(t("toast.cloudSignInFailed")); return false; }
      finally { this.busy = false; this._sync(); }
    },
    async signOut() {
      if (this.client) { try { await this.client.signOut(); } catch (e) {} }
      this.signedIn = false;
      // Honour sign-out: drop the auth hint so NO silent re-auth happens after.
      Session.forgetAuth();
      toast(t("toast.cloudSignedOut"));
      this._sync();
    },

    // Boot-time SILENT re-auth (Task 17/23): if — and ONLY if — the player had
    // opted into cloud and hasn't signed out (the `optedIn` hint is stored), try to
    // re-acquire a Google token with NO visible UI. The decision gate runs FIRST
    // (before any GIS load), so a signed-out / first-run / never-opted-in player
    // makes no attempt at all. `signInSilent` uses `prompt: "none"`, which GIS
    // resolves only from an active, already-consented session and otherwise rejects
    // WITHOUT showing a popup/account chooser; a watchdog timeout guarantees the
    // boot path can never hang on UI that won't appear. Fails soft on any rejection
    // — the explicit "Sign in with Google" button stays the only interactive path,
    // so no dialog ever appears without a click. No-ops when not configured.
    async trySilentSignIn() {
      if (!this.available() || this.signedIn) return false;
      const decision = silentAuthDecision(Session.authHint());
      if (!decision.attempt) return false;       // signed out / never opted in → never attempt
      try {
        await this.ensureClient().signInSilent(decision.loginHint);
        this.signedIn = true;
        this.sched.lastAt = Date.now();
        // Re-stamp the opt-in hint so the 180-day cookie keeps rolling for an
        // active player (so "stay signed in" doesn't quietly lapse after 180 days
        // of returning visits). Still only the non-sensitive flag + hint.
        Session.rememberAuth(decision.loginHint || "");
        this._sync();
        return true;
      } catch (e) { return false; }              // expired / revoked / offline → fall back to the button
    },

    setAutosave(on) {
      this.enabled = !!on;
      if (this.enabled) this.sched.lastAt = Date.now();
      this.persist();
      this._sync();
    },
    toggleAutosave() { Sfx.play("ui_click"); this.setAutosave(!this.enabled); },

    async findManualId() {
      const files = await this.client.list();
      const m = files.find((f) => f.name === CLOUD_MANUAL_NAME);
      return m ? m.id : null;
    },

    // Manual "Save to Drive" → overwrite the single manual slot.
    async saveManual() {
      if (!this.signedIn || !this.client) { toast(t("cloud.signInFirst")); return false; }
      if (this.busy) return false;
      const data = serializeGame();
      if (!data) { toast(t("toast.nothingToSave")); return false; }
      this.busy = true; this._sync();
      try {
        const json = JSON.stringify(data);
        await this.client.upload(CLOUD_MANUAL_NAME, json, await this.findManualId());
        toast(t("toast.cloudSaved"));
        return true;
      } catch (e) { this._fail(e, {}); return false; }
      finally { this.busy = false; this._sync(); }
    },

    // Render-loop hook (cheap, wall-clock gated). Fires an autosave when due;
    // `lastAt` advances immediately so the cadence can't re-enter.
    tick(now) {
      if (!this.signedIn || !this.enabled || !this.client || this.sched.inFlight) return;
      if (!cloudAutosaveDue({ enabled: this.enabled, signedIn: this.signedIn, hidden: this.hidden, inFlight: this.sched.inFlight, lastAt: this.sched.lastAt, intervalMs: CLOUD_AUTOSAVE_MS }, now)) return;
      this.sched.lastAt = now;
      this.doAutosave();
    },
    async doAutosave() {
      if (this.sched.inFlight || !this.client) return;
      const data = serializeGame();
      if (!data) return;                          // nothing to save yet (pre-game)
      this.sched.inFlight = true;
      try {
        await this.client.upload(cloudAutoName(Date.now()), JSON.stringify(data), null);
        await this.pruneAutosaves();
        toast(t("toast.cloudAutosaved"));
      } catch (e) { this._fail(e, { silent: true }); }
      finally { this.sched.inFlight = false; }
    },
    async pruneAutosaves() {
      const files = await this.client.list();
      const autos = [];
      for (const f of files) { const ts = cloudParseAuto(f.name); if (ts != null) autos.push({ id: f.id, ts }); }
      const del = cloudPrune(autos, Date.now(), { maxAgeMs: CLOUD_HISTORY_MS, maxCount: CLOUD_MAX_SLOTS, keepNewest: true });
      for (const id of del) { try { await this.client.remove(id); } catch (e) {} }
      return del;
    },

    // List cloud saves (manual + autosaves) newest-first for the browse overlay.
    async listSaves() {
      if (!this.signedIn || !this.client) return [];
      const files = await this.client.list();
      const out = [];
      for (const f of files) {
        const ts = cloudParseAuto(f.name);
        if (ts != null) out.push({ id: f.id, kind: "auto", ts });
        else if (f.name === CLOUD_MANUAL_NAME) out.push({ id: f.id, kind: "manual", ts: f.modifiedTime ? Date.parse(f.modifiedTime) : 0 });
      }
      out.sort((a, b) => b.ts - a.ts);
      return out;
    },

    // Restore a chosen cloud save: download → validate → reconcile (don't clobber
    // newer in-progress work) → stash + reload through the same boot path the
    // local file load uses, so re-seeding/migration is identical.
    async restore(id) {
      if (!this.signedIn || !this.client) return false;
      let json;
      try { json = await this.client.download(id); } catch (e) { this._fail(e, { load: true }); return false; }
      let data; try { data = JSON.parse(json); } catch (e) { data = null; }
      if (!validateSave(data)) { toast(t("toast.cloudLoadFailed")); return false; }
      if (gameStarted) {
        const cur = serializeGame();
        if (cur && cloudNewer({ savedAt: cur.savedAt }, { savedAt: data.savedAt }) === "a") {
          if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(t("cloud.confirmOlder"))) return false;
        }
      }
      sessionSet(PENDING_LOAD_KEY, json);
      try { if (typeof window !== "undefined" && window.location) window.location.reload(); } catch (e) {}
      return true;
    },

    // Delete a cloud save by id (Task 18 — cloud slot management). Uses the Drive
    // client's `remove`; returns true on success, false (no throw) on failure.
    async deleteSave(id) {
      if (!this.signedIn || !this.client) return false;
      try { await this.client.remove(id); return true; }
      catch (e) { this._fail(e, {}); return false; }
    },

    // Quiet failure: offline keeps the local save with a soft notice; autosave
    // failures stay silent so a flaky network never spams the player.
    _fail(e, opts) {
      opts = opts || {};
      if (opts.silent) return;
      const offline = (typeof navigator !== "undefined" && navigator && navigator.onLine === false);
      toast(t(offline ? "toast.cloudOffline" : (opts.load ? "toast.cloudLoadFailed" : "toast.cloudSaveFailed")));
    },

    onVisibility() { this.hidden = (typeof document !== "undefined" && document.hidden === true); },
    _sync() { if (typeof CloudUI !== "undefined" && CloudUI.sync) CloudUI.sync(); },
  };

  // ---- Cloud-saves UI: settings controls (start + pause) + browse overlay ---
  const CloudUI = {
    groups: [], overlay: null, listEl: null, _wired: false,
    init() {
      CloudSave.load();
      const byId = (id) => { try { return document.getElementById(id); } catch (e) { return null; } };
      this.groups = [];
      for (const sfx of ["", "P"]) {
        const g = {
          status: byId("cloudStatus" + sfx),
          signBtn: byId("cloudSignBtn" + sfx),
          saveBtn: byId("cloudSaveBtn" + sfx),
          listBtn: byId("cloudListBtn" + sfx),
          autoBtn: byId("cloudAutoBtn" + sfx),
        };
        if (g.signBtn) g.signBtn.addEventListener("click", () => { if (CloudSave.signedIn) CloudSave.signOut(); else CloudSave.signIn(); });
        if (g.saveBtn) g.saveBtn.addEventListener("click", () => CloudSave.saveManual());
        if (g.listBtn) g.listBtn.addEventListener("click", () => this.openList());
        if (g.autoBtn) g.autoBtn.addEventListener("click", () => CloudSave.toggleAutosave());
        this.groups.push(g);
      }
      this.overlay = byId("cloudSaves");
      this.listEl = byId("cloudList");
      const close = byId("cloudClose"), done = byId("cloudDone");
      if (close) close.addEventListener("click", () => this.closeList());
      if (done) done.addEventListener("click", () => this.closeList());
      // Pause autosave while the tab is hidden/idle.
      try { if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", () => CloudSave.onVisibility()); } catch (e) {}
      CloudSave.onVisibility();
      this._wired = true;
      this.sync();
      // Durable sign-in (Task 17): attempt a silent token refresh when the player
      // had opted in, so a reload keeps them effectively signed in with no dialog.
      try { Promise.resolve(CloudSave.trySilentSignIn()).then(() => this.sync()).catch(() => {}); } catch (e) {}
    },
    sync() {
      const avail = CloudSave.available(), cfg = CloudSave.configured();
      let st;
      if (!avail) st = t(cfg ? "cloud.unavailable" : "cloud.notConfigured");
      else st = t(CloudSave.signedIn ? "cloud.signedIn" : "cloud.signedOut");
      for (const g of this.groups) {
        if (g.status) g.status.textContent = st;
        if (g.signBtn) { g.signBtn.textContent = t(CloudSave.signedIn ? "cloud.signOut" : "cloud.signIn"); g.signBtn.disabled = !avail || CloudSave.busy; }
        if (g.saveBtn) { g.saveBtn.textContent = t("cloud.save"); g.saveBtn.disabled = !CloudSave.signedIn || CloudSave.busy; }
        // The "Cloud saves…" button opens the browse overlay even when signed
        // OUT (it shows a clear state + a sign-in CTA there) — so it is never a
        // dead click (Task 18). Only a truly unavailable platform disables it.
        if (g.listBtn) { g.listBtn.textContent = t("cloud.list"); g.listBtn.disabled = !avail; }
        if (g.autoBtn) {
          g.autoBtn.textContent = t(CloudSave.enabled ? "cloud.autosaveOn" : "cloud.autosaveOff");
          if (g.autoBtn.classList) g.autoBtn.classList.toggle("active", CloudSave.enabled);
          g.autoBtn.disabled = !avail;
        }
      }
      // Keep the Saves screen's cloud section in step (sign-in state changes there
      // too, e.g. silent re-auth on boot, or signing in from inside the screen).
      if (typeof SavesUI !== "undefined" && SavesUI.syncCloud) SavesUI.syncCloud();
    },
    async openList() {
      if (!this.overlay) return;
      if (this.overlay.classList) this.overlay.classList.remove("hidden");
      // Signed out / not configured: show a clear state + a sign-in CTA instead
      // of a misleading empty list (Task 18 — no more dead cloud action).
      if (!CloudSave.signedIn) { this.renderSignedOut(); return; }
      if (this.listEl) this.listEl.innerHTML = '<p class="cloud-empty">' + t("cloud.loading") + "</p>";
      let saves = [];
      try { saves = await CloudSave.listSaves(); } catch (e) { saves = []; }
      this.renderList(saves);
    },
    // A signed-out cloud browser: the status line + a sign-in CTA (or a "not
    // available / not configured" note when the platform can't reach Drive).
    renderSignedOut() {
      if (!this.listEl) return;
      this.listEl.innerHTML = "";
      const avail = CloudSave.available(), cfg = CloudSave.configured();
      const p = document.createElement("p"); p.className = "cloud-empty";
      p.textContent = avail ? t("saves.cloudSignInHint") : t(cfg ? "cloud.unavailable" : "cloud.notConfigured");
      this.listEl.appendChild(p);
      if (avail) {
        const btn = document.createElement("button");
        btn.className = "start-btn secondary-btn cloud-restore";
        btn.textContent = t("cloud.signIn");
        btn.addEventListener("click", async () => { await CloudSave.signIn(); if (CloudSave.signedIn) this.openList(); });
        this.listEl.appendChild(btn);
      }
    },
    renderList(saves) {
      if (!this.listEl) return;
      if (!saves || !saves.length) { this.listEl.innerHTML = '<p class="cloud-empty">' + t("cloud.empty") + "</p>"; return; }
      this.listEl.innerHTML = "";
      for (const s of saves) {
        const row = document.createElement("div"); row.className = "cloud-row";
        const label = document.createElement("span"); label.className = "cloud-row-label";
        label.textContent = t(s.kind === "manual" ? "cloud.manual" : "cloud.autosave") + " · " + cloudFmtTime(s.ts);
        const btn = document.createElement("button"); btn.className = "start-btn secondary-btn cloud-restore";
        btn.textContent = t("cloud.restore");
        btn.addEventListener("click", () => CloudSave.restore(s.id));
        row.appendChild(label); row.appendChild(btn);
        this.listEl.appendChild(row);
      }
    },
    closeList() { if (this.overlay && this.overlay.classList) this.overlay.classList.add("hidden"); },
  };

  // ---- Saves UI: the single save-management screen (Task 18) ----------------
  // Reachable from the start screen AND the pause menu. Renders the pure
  // SaveSlots store as a list of named local slots (Load / Rename / Delete /
  // New), plus a cloud section (a clear sign-in CTA when signed-out, or the
  // cloud slot list when signed-in) and file export/import. The UI only renders
  // state the pure module computes; destructive actions confirm via Pause.askConfirm.
  const SavesUI = {
    open: false, _wired: false, _renaming: -1,

    init() {
      if (this._wired) return;
      this._wired = true;
      const on = (el, ev, fn) => { if (el && el.addEventListener) el.addEventListener(ev, fn); };
      on(dom.savesBtn, "click", () => { Sfx.play("ui_click"); this.openScreen(); });
      on(dom.savesBtnP, "click", () => { Sfx.play("ui_click"); this.openScreen(); });
      on(dom.savesClose, "click", () => this.closeScreen());
      on(dom.savesDone, "click", () => this.closeScreen());
      // Cloud section: sign-in/out toggle + manual "Save to Drive".
      on(dom.savesCloudSignBtn, "click", () => { if (CloudSave.signedIn) CloudSave.signOut(); else CloudSave.signIn(); });
      on(dom.savesCloudSaveBtn, "click", async () => { await CloudSave.saveManual(); this.renderCloud(); });
      // File export/import (kept as an extra option alongside in-game slots).
      on(dom.savesExportBtn, "click", () => downloadSave());
      on(dom.savesImportBtn, "click", () => { if (dom.savesImportFile) dom.savesImportFile.click(); });
      on(dom.savesImportFile, "change", (e) => {
        const file = e.target && e.target.files && e.target.files[0];
        loadFromFile(file, (msg) => toast(msg));
        if (e.target) e.target.value = "";
      });
    },

    openScreen() {
      if (!dom.savesOverlay) return;
      this._renaming = -1;
      if (dom.savesOverlay.classList) dom.savesOverlay.classList.remove("hidden");
      this.open = true;
      this.render();
      // Reflect cloud state; a silent re-auth may resolve shortly and re-sync.
      try { Promise.resolve(CloudSave.trySilentSignIn()).then(() => { if (this.open) this.renderCloud(); }).catch(() => {}); } catch (e) {}
    },
    closeScreen() {
      if (dom.savesOverlay && dom.savesOverlay.classList) dom.savesOverlay.classList.add("hidden");
      this.open = false; this._renaming = -1;
    },

    render() { this.renderLocal(); this.renderCloud(); },

    // The local named slots: each row shows the name + metadata and Load/Rename/
    // Delete, or a "New save" action for an empty slot. A "New save" on an
    // occupied slot overwrites it (confirmed first).
    renderLocal() {
      const host = dom.savesList;
      if (!host) return;
      host.innerHTML = "";
      const canSave = gameStarted && !!serializeGame();
      for (const slot of SaveSlots.list()) {
        const row = document.createElement("div"); row.className = "saves-row";
        // Stable, locale-independent test hooks for the E2E (data-slot / data-act).
        if (row.setAttribute) { row.setAttribute("data-slot", String(slot.index)); row.setAttribute("data-used", slot.used ? "1" : "0"); }
        const info = document.createElement("div"); info.className = "saves-info";

        if (this._renaming === slot.index && slot.used) {
          // Inline rename: a length-capped text field + Save / Cancel.
          const input = document.createElement("input");
          input.className = "saves-rename-input"; input.type = "text";
          input.maxLength = SLOT_NAME_MAX; input.value = slot.name;
          input.setAttribute("aria-label", t("saves.renameLabel"));
          if (input.setAttribute) input.setAttribute("data-act", "rename-input");
          const commit = () => { SaveSlots.rename(slot.index, input.value); this._renaming = -1; this.renderLocal(); };
          input.addEventListener("keydown", (e) => {
            // Stop the global Escape/hotkey handler from also acting (Escape here
            // only cancels the rename; Enter only commits it).
            if (e.key === "Enter") { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); this._renaming = -1; this.renderLocal(); }
          });
          info.appendChild(input);
          row.appendChild(info);
          const acts = document.createElement("div"); acts.className = "saves-actions";
          acts.appendChild(this._btn(t("saves.renameSave"), "primary", commit, false, "rename-commit"));
          acts.appendChild(this._btn(t("pause.confirmNo"), "secondary", () => { this._renaming = -1; this.renderLocal(); }, false, "rename-cancel"));
          row.appendChild(acts);
          host.appendChild(row);
          try { input.focus(); } catch (e) {}
          continue;
        }

        const name = document.createElement("div"); name.className = "saves-name";
        if (name.setAttribute) name.setAttribute("data-act", "name");
        name.textContent = slot.used ? slot.name : defaultSlotName(slot.index);
        info.appendChild(name);
        const meta = document.createElement("div"); meta.className = "saves-meta";
        meta.textContent = slot.used ? this._metaLine(slot.meta) : t("saves.emptySlot");
        info.appendChild(meta);
        row.appendChild(info);

        const acts = document.createElement("div"); acts.className = "saves-actions";
        if (slot.used) {
          acts.appendChild(this._btn(t("saves.load"), "primary", () => SaveSlots.load(slot.index), false, "load"));
          acts.appendChild(this._btn(t("saves.overwrite"), "secondary", () => this._overwrite(slot.index, slot.name), !canSave, "overwrite"));
          acts.appendChild(this._btn(t("saves.rename"), "secondary", () => { this._renaming = slot.index; this.renderLocal(); }, false, "rename"));
          acts.appendChild(this._btn(t("saves.delete"), "danger", () => this._delete(slot.index, slot.name), false, "delete"));
        } else {
          acts.appendChild(this._btn(t("saves.newSave"), "primary", () => this._newInto(slot.index), !canSave, "new"));
        }
        row.appendChild(acts);
        host.appendChild(row);
      }
    },

    // The cloud section: status + a sign-in CTA (so it's never a dead no-op), and
    // when signed in, the cloud slots with Restore (+ Delete where the API allows).
    renderCloud() {
      this.syncCloud();
      const host = dom.savesCloudList;
      if (!host) return;
      host.innerHTML = "";
      if (!CloudSave.signedIn) {
        const p = document.createElement("p"); p.className = "cloud-empty";
        p.textContent = CloudSave.available() ? t("saves.cloudSignInHint") : t(CloudSave.configured() ? "cloud.unavailable" : "cloud.notConfigured");
        host.appendChild(p);
        return;
      }
      const loading = document.createElement("p"); loading.className = "cloud-empty";
      loading.textContent = t("cloud.loading");
      host.appendChild(loading);
      CloudSave.listSaves().then((saves) => {
        if (!this.open) return;
        host.innerHTML = "";
        if (!saves || !saves.length) { const e = document.createElement("p"); e.className = "cloud-empty"; e.textContent = t("cloud.empty"); host.appendChild(e); return; }
        for (const s of saves) {
          const row = document.createElement("div"); row.className = "saves-row";
          const info = document.createElement("div"); info.className = "saves-info";
          const name = document.createElement("div"); name.className = "saves-name";
          name.textContent = t(s.kind === "manual" ? "cloud.manual" : "cloud.autosave");
          info.appendChild(name);
          const meta = document.createElement("div"); meta.className = "saves-meta";
          meta.textContent = cloudFmtTime(s.ts);
          info.appendChild(meta);
          row.appendChild(info);
          const acts = document.createElement("div"); acts.className = "saves-actions";
          acts.appendChild(this._btn(t("cloud.restore"), "primary", () => CloudSave.restore(s.id)));
          acts.appendChild(this._btn(t("saves.delete"), "danger", () => this._deleteCloud(s, name.textContent)));
          row.appendChild(acts);
          host.appendChild(row);
        }
      }).catch(() => {
        if (!this.open) return;
        host.innerHTML = "";
        const e = document.createElement("p"); e.className = "cloud-empty"; e.textContent = t("cloud.empty"); host.appendChild(e);
      });
    },

    // Refresh just the cloud status line + the sign-in/save button labels/state.
    syncCloud() {
      const avail = CloudSave.available(), cfg = CloudSave.configured();
      let st;
      if (!avail) st = t(cfg ? "cloud.unavailable" : "cloud.notConfigured");
      else st = t(CloudSave.signedIn ? "cloud.signedIn" : "cloud.signedOut");
      if (dom.savesCloudStatus) dom.savesCloudStatus.textContent = st;
      if (dom.savesCloudSignBtn) { dom.savesCloudSignBtn.textContent = t(CloudSave.signedIn ? "cloud.signOut" : "cloud.signIn"); dom.savesCloudSignBtn.disabled = !avail || CloudSave.busy; }
      if (dom.savesCloudSaveBtn) { dom.savesCloudSaveBtn.textContent = t("cloud.save"); dom.savesCloudSaveBtn.disabled = !CloudSave.signedIn || CloudSave.busy; }
    },

    // ---- internals ----
    _btn(label, kind, fn, disabled, act) {
      const b = document.createElement("button");
      b.className = "saves-btn" + (kind === "primary" ? " primary" : kind === "danger" ? " danger" : " secondary");
      b.textContent = label;
      if (act && b.setAttribute) b.setAttribute("data-act", act);   // stable E2E hook
      if (disabled) b.disabled = true;
      else b.addEventListener("click", fn);
      return b;
    },
    _metaLine(meta) {
      if (!meta) return "";
      const where = tZoneName(ZONE_BY_ID[meta.zone]) || meta.zone || "";
      const when = meta.savedAt ? cloudFmtTime(Date.parse(meta.savedAt)) : "";
      return t("saves.metaLine", { level: meta.level, where, time: fmtPlaytime(meta.playSec), when });
    },
    _newInto(index) {
      if (SaveSlots.saveTo(index) >= 0) { Sfx.play("ui_click"); toast(t("toast.slotSaved")); this.renderLocal(); }
      else toast(t("toast.nothingToSave"));
    },
    _overwrite(index, name) {
      Pause.askConfirm("saves-overwrite", t("saves.confirmOverwrite", { name }), () => {
        if (SaveSlots.saveTo(index, name) >= 0) { Sfx.play("ui_click"); toast(t("toast.slotSaved")); this.renderLocal(); }
      });
    },
    _delete(index, name) {
      Pause.askConfirm("saves-delete", t("saves.confirmDelete", { name }), () => {
        SaveSlots.remove(index); Sfx.play("ui_click"); toast(t("toast.slotDeleted")); this.renderLocal();
      });
    },
    _deleteCloud(s, name) {
      Pause.askConfirm("saves-delete-cloud", t("saves.confirmDelete", { name }), async () => {
        const ok = await CloudSave.deleteSave(s.id);
        if (ok) { Sfx.play("ui_click"); toast(t("toast.slotDeleted")); }
        this.renderCloud();
      });
    },
  };

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
      Sfx.play("ui_click");
      this.hideConfirm();
      this.refreshTexts();
      dom.pauseMenu.classList.remove("hidden");
    },
    // The level/XP recap line + any open confirm message are interpolated, so
    // they localize live when the language is switched from the pause settings.
    refreshTexts() {
      const r = runRecap(stateRef);
      if (dom.pauseStats) dom.pauseStats.innerHTML = t("pause.stats", { level: r.level, xp: r.totalXp });
      _syncGfxButtons();   // reflect the current graphics preference + detected tier
      if (typeof Fullscreen !== "undefined" && Fullscreen.syncMenu) Fullscreen.syncMenu(); // Display: fullscreen label/visibility (Task 37)
      if (this.pendingAction && dom.confirmText) {
        if (this.pendingAction === "restart") dom.confirmText.textContent = t("pause.confirmRestart");
        else if (this.pendingAction === "exit") dom.confirmText.textContent = t("pause.confirmExit");
        else dom.confirmText.textContent = this.pendingText;   // callback confirm keeps its message
      }
    },

    // Change the graphics-quality preference. The tier is baked into meshes,
    // materials and shadows at zone-build time, so we apply it the bulletproof
    // way: persist the choice, hand the EXACT current run across a reload (the
    // same path "Load Progress" uses) and let the boot rebuild everything under
    // the new tier. Progress is preserved; the fade veil hides the reload.
    applyGraphics(pref) {
      if (pref !== "auto" && !Quality.TIERS[pref]) return;
      if (pref === Quality.pref) { _syncGfxButtons(); return; }   // already active → no-op
      Quality.setPref(pref, true);
      _syncGfxButtons();
      // Stash the run so the boot path lays it straight back in (autostart).
      try {
        const snap = serializeGame();
        if (snap) sessionSet(PENDING_LOAD_KEY, JSON.stringify(snap));
        sessionSet(AUTOSTART_KEY, "1");
      } catch (e) {}
      fadeVeil(true, t("pause.applyingGfx"));
      // Reload on the next macrotask so the veil paints over the boot hitch.
      setTimeout(() => {
        try { if (typeof window !== "undefined" && window.location) window.location.reload(); } catch (e) {}
      }, 220);
    },
    close() {
      if (!paused) return;
      paused = false;
      this.hideConfirm();
      dom.pauseMenu.classList.add("hidden");
    },
    toggle() { if (paused) this.close(); else this.open(); },

    // Confirmation guard, reusable across the game (restart / exit, and the
    // Task-18 save-slot delete / overwrite). The dialog is a screen-centred modal
    // so it floats above ANY overlay — the pause menu OR the Saves screen opened
    // from the start menu (where the sim isn't paused). `onYes` is an optional
    // callback; the built-in "restart"/"exit" actions keep their reload behaviour
    // and re-localize live. `pendingText` is remembered so a language switch can
    // re-render a callback confirm's message too.
    pendingConfirm: null,
    pendingText: "",
    askConfirm(action, text, onYes) {
      this.pendingAction = action;
      this.pendingConfirm = typeof onYes === "function" ? onYes : null;
      this.pendingText = text || "";
      if (dom.confirmText) dom.confirmText.textContent = this.pendingText;
      if (dom.confirmDialog) dom.confirmDialog.classList.remove("hidden");
    },
    hideConfirm() {
      this.pendingAction = null;
      this.pendingConfirm = null;
      this.pendingText = "";
      if (dom.confirmDialog) dom.confirmDialog.classList.add("hidden");
    },
    confirmYes() {
      const action = this.pendingAction, cb = this.pendingConfirm;
      this.hideConfirm();
      if (cb) { cb(); return; }
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
      // Graphics-quality selector: each button forces a tier (or Auto), applied
      // via a progress-preserving reload.
      [[dom.gfxAuto, "auto"], [dom.gfxHigh, "high"], [dom.gfxMedium, "medium"], [dom.gfxLow, "low"]]
        .forEach(([el, pref]) => { if (el) el.addEventListener("click", () => this.applyGraphics(pref)); });
      _syncGfxButtons();   // paint the initial selection at boot
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
    // Re-apply the saved control layout now the HUD + touch controls are visible
    // (their real sizes drive the safe-area clamp; at boot they were display:none).
    ControlLayout.apply();
    dom.canvas.focus();
    gameStarted = true;
    Music.start(); // browsers only allow audio after a user gesture (the click)
    Sfx.unlock();  // same gesture unlocks the sound-effect synth
    Ambience.start((worldRef && worldRef.zone) ? worldRef.zone.id : HUB_ZONE); // per-location bed
    // Fresh start → frame the adventure with the opening beat. Skipped when
    // restoring a save (mid-story) and under the headless harness (which drives
    // input directly and must not be blocked by the modal).
    if (!loaded && !(typeof window !== "undefined" && window.__GG_TEST__)) Story.maybeShowIntro();
    // Durable session (Task 17): start auto-persisting from now on, flush an
    // immediate snapshot, and arm the hide/pagehide flush so an unexpected close
    // still saves the run.
    Session.wireUnload();
    Session.flush();
  }

  // =========================================================================
  // Mixer — the shared audio backbone (Task 6). A SINGLE Web Audio graph:
  //   Sfx / Music / Ambience  →  per-channel bus gains  →  master gain  →  out
  // so the player can balance the soundtrack, sound-effects and per-location
  // ambience independently and mute everything at once. The 0..1 channel volumes
  // + the master-mute flag persist in localStorage (`AUDIO_KEY`) and are applied
  // before any sound plays. One AudioContext is built lazily on the first user
  // gesture (browsers forbid audio before then). Fully headless-safe: with no
  // AudioContext (the Node harness) `ensure()` returns false and every consumer
  // no-ops — but the pure volume/persistence logic is still exercised in tests.
  // =========================================================================
  const AUDIO_KEY = "gg3d_audio";   // persisted mixer settings { vol:{…}, muted }
  const Mixer = {
    ctx: null, master: null,
    bus: { music: null, sfx: null, ambience: null },
    // Channel volumes (0..1). The per-subsystem nodes carry their own internal
    // trim on top of these, so the defaults sit a touch below 1 for headroom.
    vol: { master: 0.9, music: 0.7, sfx: 0.85, ambience: 0.75 },
    muted: false,                   // master mute (the 🔊/M control + settings)
    _loaded: false,

    CHANNELS: ["master", "music", "sfx", "ambience"],
    isChannel(ch) { return this.CHANNELS.indexOf(ch) >= 0; },
    // Clamp a volume to 0..1; garbage/NaN falls back to the supplied default.
    _clamp(v, d) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; },

    // Read the persisted settings (headless-safe; missing/garbage → defaults).
    load() {
      if (this._loaded) return this;
      this._loaded = true;
      try {
        const raw = localGet(AUDIO_KEY);
        if (raw) {
          const o = JSON.parse(raw);
          if (o && o.vol) for (const k of this.CHANNELS)
            if (o.vol[k] != null) this.vol[k] = this._clamp(o.vol[k], this.vol[k]);
          if (typeof o.muted === "boolean") this.muted = o.muted;
        }
      } catch (e) {}
      return this;
    },
    save() { try { localSet(AUDIO_KEY, JSON.stringify({ vol: this.vol, muted: this.muted })); } catch (e) {} },

    // Lazily build the AudioContext + bus graph. Returns false where Web Audio is
    // unavailable (the harness / very old browsers) so callers cleanly no-op.
    ensure() {
      if (this.ctx) return true;
      try {
        const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return false;
        this.load();
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const k of ["music", "sfx", "ambience"]) {
          const g = this.ctx.createGain();
          g.connect(this.master);
          this.bus[k] = g;
        }
        this._apply();
        return true;
      } catch (e) { this.ctx = null; return false; }
    },
    unlock() { try { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); } catch (e) {} },

    // Push the current volumes/mute onto the live gain nodes (smoothed so there
    // are no clicks/pops). Safe to call before the graph exists (no-op).
    _apply() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime, mm = this.muted ? 0 : 1;
      const set = (node, v) => {
        if (!node) return;
        try { node.gain.setTargetAtTime(v, now, 0.04); }
        catch (e) { try { node.gain.value = v; } catch (_) {} }
      };
      set(this.master, this.vol.master * mm);
      set(this.bus.music, this.vol.music);
      set(this.bus.sfx, this.vol.sfx);
      set(this.bus.ambience, this.vol.ambience);
    },

    setVolume(ch, v, persist) {
      if (!this.isChannel(ch)) return;
      this.vol[ch] = this._clamp(v, this.vol[ch]);
      this._apply();
      if (persist !== false) this.save();
    },
    setMuted(on, persist) { this.muted = !!on; this._apply(); if (persist !== false) this.save(); },
    toggleMute() { this.setMuted(!this.muted); return this.muted; },
  };

  // =========================================================================
  // Sfx — short procedurally-synthesised sound effects via the Web Audio API.
  // Like the Music system there are NO audio files: every weapon swing, bolt,
  // pickup, potion, enhancement and boss attack is generated in-browser, so the
  // game ships on static hosting with zero assets. Headless-safe (no-ops with
  // no AudioContext, as in the Node test harness). Unlocked on the first user
  // gesture (the Start click). Routes through the Mixer's `sfx` bus.
  // =========================================================================
  const Sfx = {
    ctx: null, master: null, on: true, _noiseBuf: null,

    _ensure() {
      if (this.ctx) return true;
      if (!Mixer.ensure()) return false;
      try {
        this.ctx = Mixer.ctx;
        this.master = this.ctx.createGain();   // an internal trim under the sfx bus
        this.master.gain.value = 0.55;
        this.master.connect(Mixer.bus.sfx);
        return true;
      } catch (e) { return false; }
    },
    unlock() {
      if (!this._ensure()) return;
      Mixer.unlock();
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
          // ---- Task 6: footsteps (per surface), gather/mine, quest, UI, portal ----
          case "step_grass": this._noise(t, { dur: 0.085, peak: 0.07, cutoff: 1100 }); break;
          case "step_stone": this._noise(t, { dur: 0.07, peak: 0.09, cutoff: 2600 });
                             this._tone(t, { freq: 150, freq2: 90, dur: 0.06, type: "square", peak: 0.05 }); break;
          case "step_sand":  this._noise(t, { dur: 0.1, peak: 0.06, cutoff: 700 }); break;
          case "step_snow":  this._noise(t, { dur: 0.11, peak: 0.06, cutoff: 4200 }); break;
          case "gather":     this._noise(t, { dur: 0.14, peak: 0.2, cutoff: 1500 });
                             this._tone(t, { freq: 260, freq2: 150, dur: 0.12, type: "triangle", peak: 0.1 }); break;
          case "mine":       this._noise(t, { dur: 0.12, peak: 0.22, cutoff: 3000 });
                             this._tone(t, { freq: 320, freq2: 180, dur: 0.1, type: "square", peak: 0.12 });
                             this._tone(t, { freq: 120, freq2: 70, dur: 0.16, type: "sine", peak: 0.1, delay: 0.02 }); break;
          case "quest_accept": [0, 4, 7].forEach((s, i) => this._tone(t, { freq: 392 * Math.pow(2, s / 12), dur: 0.16, type: "triangle", peak: 0.16, delay: i * 0.05 })); break;
          case "quest_turnin": [0, 4, 7, 12, 16].forEach((s, i) => this._tone(t, { freq: 523.25 * Math.pow(2, s / 12), dur: 0.2, type: "triangle", peak: 0.16, delay: i * 0.06 })); break;
          case "ui_click":   this._tone(t, { freq: 660, dur: 0.05, type: "square", peak: 0.1 }); break;
          case "portal":     this._tone(t, { freq: 180, freq2: 720, dur: 0.5, type: "sine", peak: 0.2 });
                             this._tone(t, { freq: 360, freq2: 1440, dur: 0.45, type: "triangle", peak: 0.08, delay: 0.04 });
                             this._noise(t, { dur: 0.5, peak: 0.08, cutoff: 1800 }); break;
          case "lowhp":      this._tone(t, { freq: 880, dur: 0.12, type: "sine", peak: 0.18 });
                             this._tone(t, { freq: 880, dur: 0.12, type: "sine", peak: 0.18, delay: 0.18 }); break;
          // ---- Skills, leveling & fusion (Task 14) ----
          case "levelup":    [0, 4, 7, 12, 16].forEach((s, i) => this._tone(t, { freq: 523.25 * Math.pow(2, s / 12), dur: 0.26, type: "triangle", peak: 0.18, delay: i * 0.05 })); break;
          case "skill_cast": this._tone(t, { freq: 640, freq2: 1200, dur: 0.24, type: "sine", peak: 0.22 });
                             this._tone(t, { freq: 320, freq2: 600, dur: 0.2, type: "triangle", peak: 0.1, delay: 0.02 }); break;
          case "fuse":       [0, 7, 12].forEach((s, i) => this._tone(t, { freq: 392 * Math.pow(2, s / 12), dur: 0.34, type: "sine", peak: 0.18, delay: i * 0.07 }));
                             this._noise(t, { dur: 0.4, peak: 0.06, cutoff: 2200 }); break;
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
      if (!Mixer.ensure()) return false;
      try {
        this.ctx = Mixer.ctx;
        this.master = this.ctx.createGain();   // on/off trim under the music bus
        this.master.gain.value = 0.0;
        this.master.connect(Mixer.bus.music);
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
      return this.on;
    },
  };

  // =========================================================================
  // Ambience — a per-location procedural background bed (Task 6). Each zone gets
  // its own continuously-synthesised soundscape (no audio files): meadow birds +
  // breeze, forest wind + creaks, shore waves + gulls, peak wind howl, cavern
  // drips + a deep drone, thicket insects. Travelling between zones CROSSFADES
  // one bed out while the next fades in (hooked from ZoneManager) so there are no
  // clicks or pops. Routes through the Mixer's `ambience` bus. Sparse one-shot
  // events (chirps, gulls, drips) are scheduled on wall-clock time with
  // Math.random() — purely cosmetic, so they must NOT touch the seeded gameplay
  // rng() (that would desync determinism), exactly like Sfx's noise buffer.
  // Fully headless-safe: with no AudioContext every method no-ops; `bedFor()`
  // stays a pure, testable mapping.
  // =========================================================================
  const Ambience = {
    ctx: null, bed: null, zoneId: null, _noiseBuf: null,

    // Pure: the recipe for a zone's bed. Each field is a layer the builder knows.
    BEDS: {
      meadow:  { wind: { cutoff: 700, level: 0.10 }, drone: { freq: 196, level: 0.022 }, birds: 0.7 },
      forest:  { wind: { cutoff: 460, level: 0.16 }, drone: { freq: 130, level: 0.03 }, birds: 0.35, creak: 0.18 },
      shore:   { waves: 0.22, wind: { cutoff: 900, level: 0.06 }, gulls: 0.3 },
      peaks:   { wind: { cutoff: 1500, level: 0.26, howl: true } },
      caverns: { drone: { freq: 70, level: 0.05 }, wind: { cutoff: 240, level: 0.05 }, drips: 0.7 },
      thicket: { insects: 0.16, wind: { cutoff: 420, level: 0.1 }, drone: { freq: 98, level: 0.032 } },
    },
    bedFor(zoneId) { return this.BEDS[zoneId] || this.BEDS.meadow; },

    _noise() {
      const ctx = this.ctx;
      if (!this._noiseBuf) {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;  // cosmetic — see header
        this._noiseBuf = buf;
      }
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuf; src.loop = true;
      return src;
    },

    // ---- Continuous layers: each appends its nodes to `bed` and feeds bed.gain.
    _wind(bed, spec) {
      const ctx = this.ctx, src = this._noise();
      const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = spec.cutoff;
      const g = ctx.createGain(); g.gain.value = spec.level;
      src.connect(filt); filt.connect(g); g.connect(bed.gain);
      try { src.start(); } catch (e) {}
      bed.sources.push(src);
      if (spec.howl) {                                   // a slow gust LFO on the cutoff
        const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.08;
        const lg = ctx.createGain(); lg.gain.value = spec.cutoff * 0.5;
        lfo.connect(lg); lg.connect(filt.frequency);
        try { lfo.start(); } catch (e) {}
        bed.oscs.push(lfo);
      }
    },
    _waves(bed, level) {
      const ctx = this.ctx, src = this._noise();
      const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 520; filt.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = level * 0.5;
      src.connect(filt); filt.connect(g); g.connect(bed.gain);
      const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.16;  // the swell
      const lg = ctx.createGain(); lg.gain.value = level * 0.45;
      lfo.connect(lg); lg.connect(g.gain);
      try { src.start(); lfo.start(); } catch (e) {}
      bed.sources.push(src); bed.oscs.push(lfo);
    },
    _insects(bed, level) {
      const ctx = this.ctx, src = this._noise();
      const filt = ctx.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = 3200;
      const g = ctx.createGain(); g.gain.value = level;
      src.connect(filt); filt.connect(g); g.connect(bed.gain);
      const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 11;     // tremolo chirr
      const lg = ctx.createGain(); lg.gain.value = level * 0.7;
      lfo.connect(lg); lg.connect(g.gain);
      try { src.start(); lfo.start(); } catch (e) {}
      bed.sources.push(src); bed.oscs.push(lfo);
    },
    _drone(bed, spec) {
      const ctx = this.ctx, osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = spec.freq;
      const g = ctx.createGain(); g.gain.value = spec.level;
      osc.connect(g); g.connect(bed.gain);
      try { osc.start(); } catch (e) {}
      bed.oscs.push(osc);
    },

    // ---- One-shot scheduled events (synthesised on the fly; self-disposing).
    _chirp(bed) {
      const ctx = this.ctx, t = ctx.currentTime, base = 2200 + Math.random() * 1400;
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const osc = ctx.createOscillator(); osc.type = "sine";
        const g = ctx.createGain(); const st = t + i * 0.06;
        osc.frequency.setValueAtTime(base * (1 + i * 0.05), st);
        osc.frequency.exponentialRampToValueAtTime(base * 1.3, st + 0.05);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.05, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.07);
        osc.connect(g); g.connect(bed.gain);
        try { osc.start(st); osc.stop(st + 0.1); } catch (e) {}
      }
    },
    _gull(bed) {
      const ctx = this.ctx, t = ctx.currentTime;
      const osc = ctx.createOscillator(); osc.type = "sawtooth";
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(900, t); osc.frequency.linearRampToValueAtTime(520, t + 0.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(g); g.connect(bed.gain);
      try { osc.start(t); osc.stop(t + 0.36); } catch (e) {}
    },
    _dripSound(bed) {
      const ctx = this.ctx, t = ctx.currentTime, f = 900 + Math.random() * 900;
      const osc = ctx.createOscillator(); osc.type = "sine";
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g); g.connect(bed.gain);
      try { osc.start(t); osc.stop(t + 0.22); } catch (e) {}
    },
    _creakSound(bed) {
      const ctx = this.ctx, t = ctx.currentTime, f = 70 + Math.random() * 60;
      const osc = ctx.createOscillator(); osc.type = "sawtooth";
      const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 600;
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(f, t); osc.frequency.linearRampToValueAtTime(f * 1.4, t + 0.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(filt); filt.connect(g); g.connect(bed.gain);
      try { osc.start(t); osc.stop(t + 0.5); } catch (e) {}
    },

    _buildBed(zoneId) {
      const ctx = this.ctx;
      const gain = ctx.createGain(); gain.gain.value = 0.0001;
      gain.connect(Mixer.bus.ambience);
      const bed = { gain, sources: [], oscs: [], timer: null, zoneId };
      const r = this.bedFor(zoneId);
      if (r.wind) this._wind(bed, r.wind);
      if (r.waves) this._waves(bed, r.waves);
      if (r.insects) this._insects(bed, r.insects);
      if (r.drone) this._drone(bed, r.drone);
      // Fade the bed in (no click).
      try {
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(1, t + 1.2);
      } catch (e) { gain.gain.value = 1; }
      // Sparse one-shot scheduler (birds / gulls / drips / creaks).
      const tickSec = 0.5;
      const roll = (rate, fn) => { if (rate && Math.random() < rate * tickSec) fn.call(this, bed); };
      const tick = () => {
        roll(r.birds, this._chirp); roll(r.gulls, this._gull);
        roll(r.drips, this._dripSound); roll(r.creak, this._creakSound);
      };
      try { bed.timer = setInterval(tick, tickSec * 1000); } catch (e) {}
      return bed;
    },

    _disposeBed(bed, fade) {
      if (!bed) return;
      if (bed.timer != null) { try { clearInterval(bed.timer); } catch (e) {} bed.timer = null; }
      const ctx = this.ctx;
      try {
        const t = ctx.currentTime;
        bed.gain.gain.cancelScheduledValues(t);
        bed.gain.gain.setValueAtTime(Math.max(0.0001, bed.gain.gain.value || 0.0001), t);
        bed.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
      } catch (e) {}
      const kill = () => {
        for (const s of bed.sources) { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} }
        for (const o of bed.oscs) { try { o.stop(); } catch (e) {} try { o.disconnect(); } catch (e) {} }
        try { bed.gain.disconnect(); } catch (e) {}
      };
      try { setTimeout(kill, fade * 1000 + 80); } catch (e) { kill(); }
    },

    // Start the bed for a zone (called once audio is unlocked). Idempotent.
    start(zoneId) {
      this.zoneId = zoneId;
      if (!Mixer.ensure()) return;
      this.ctx = Mixer.ctx;
      if (this.bed) { if (this.bed.zoneId !== zoneId) this.crossfadeTo(zoneId); return; }
      this.bed = this._buildBed(zoneId);
    },
    // Swap to a new zone's bed: fade the old out, fade the new in.
    crossfadeTo(zoneId) {
      this.zoneId = zoneId;
      if (!this.ctx) { this.start(zoneId); return; }
      if (this.bed && this.bed.zoneId === zoneId) return;
      const old = this.bed;
      this.bed = this._buildBed(zoneId);
      this._disposeBed(old, 1.0);
    },
    stop() { if (this.bed) { this._disposeBed(this.bed, 0.4); this.bed = null; } },
  };

  // Pure: which footstep surface a zone walks on (Task 6). Drives the per-surface
  // step cue. Testable without a device.
  const ZONE_SURFACE = { meadow: "grass", forest: "grass", thicket: "grass", shore: "sand", peaks: "snow", caverns: "stone" };
  function surfaceForZone(zoneId) { return ZONE_SURFACE[zoneId] || "grass"; }

  // Footsteps — fire a per-surface step cue in time with the walk stride. The
  // character's `walkPhase` advances by dt while moving, planting a foot each
  // half-cycle, so steps stay frame-rate-independent and cadence-matched.
  const Footsteps = {
    _idx: 0,
    update(player, zone) {
      if (!player) return;
      if (player.state === "walk") {
        const idx = Math.floor((player.walkPhase || 0) / Math.PI);
        if (idx !== this._idx) { this._idx = idx; Sfx.play("step_" + surfaceForZone(zone && zone.id)); }
      } else {
        this._idx = Math.floor((player.walkPhase || 0) / Math.PI);  // re-sync so resuming doesn't double-step
      }
    },
  };

  // LowHealth — a warning beep when health drops to a critical share, with
  // hysteresis (re-arms above the upper bound) so it doesn't spam, then repeats
  // gently while still critical. dt-driven, so it freezes with the pause menu.
  const LowHealth = {
    LOW: 0.25, CLEAR: 0.35, REPEAT: 3.5,
    _armed: true, _t: 0,
    update(dt, player) {
      if (!player || !player.maxHealth) return;
      const r = player.health / player.maxHealth;
      if (r > this.CLEAR || player.health <= 0) { this._armed = true; this._t = 0; return; }
      if (r > this.LOW) return;
      this._t -= dt;
      if (this._armed || this._t <= 0) { Sfx.play("lowhp"); this._armed = false; this._t = this.REPEAT; }
    },
  };

  // AudioUI — the mixer's player-facing controls (Task 6): four volume sliders
  // (master / music / effects / ambience) + a mute-all toggle, mirrored on BOTH
  // the start screen and the pause settings. Each control id is suffixed "" on
  // the start screen and "P" in the pause menu; both drive the same Mixer
  // channel and re-sync together. Headless-safe (DOM is feature-detected).
  const AudioUI = {
    channels: ["master", "music", "sfx", "ambience"],
    sliders: {}, mutes: [],
    init() {
      Mixer.load();
      const byId = (id) => { try { return document.getElementById(id); } catch (e) { return null; } };
      const wire = (suffix) => {
        for (const ch of this.channels) {
          const el = byId("vol_" + ch + suffix);
          if (!el) continue;
          (this.sliders[ch] = this.sliders[ch] || []).push(el);
          el.addEventListener("input", () => { Mixer.setVolume(ch, (parseFloat(el.value) || 0) / 100); this.sync(); });
        }
        const mb = byId("muteToggle" + suffix);
        if (mb) { this.mutes.push(mb); mb.addEventListener("click", () => { Mixer.toggleMute(); Sfx.play("ui_click"); this.sync(); }); }
      };
      wire(""); wire("P");
      this.sync();
    },
    sync() {
      for (const ch of this.channels) {
        const v = Math.round((Mixer.vol[ch] != null ? Mixer.vol[ch] : 0) * 100);
        for (const el of (this.sliders[ch] || [])) { try { el.value = String(v); } catch (e) {} }
      }
      for (const mb of this.mutes) {
        if (mb.classList) mb.classList.toggle("active", Mixer.muted);
        mb.textContent = t(Mixer.muted ? "settings.unmute" : "settings.mute");
      }
    },
  };

  // ---- Fullscreen (whole page, so the HUD/joystick stay visible) ----------
  // On a touch device, entering fullscreen also requests LANDSCAPE via the Screen
  // Orientation API (the one-thumb action arc is laid out for landscape), and the
  // lock is released on exit. Both the lock and fullscreen are feature-detected
  // and degrade gracefully — the lock returns a promise that can reject (e.g. on
  // iOS Safari, where it is unsupported), so we always swallow that and carry on.
  const Fullscreen = {
    el: document.documentElement,
    supported() {
      const e = this.el;
      return !!(e && (e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen));
    },
    active() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    },
    orientationLockSupported() {
      try {
        return !!(typeof screen !== "undefined" && screen.orientation &&
          typeof screen.orientation.lock === "function");
      } catch (e) { return false; }
    },
    lockLandscape() {
      if (!isTouch || !this.orientationLockSupported()) return;
      try {
        const p = screen.orientation.lock("landscape");
        // The lock rejects (rather than throws) when unsupported/denied — never let
        // that surface as an unhandled rejection or block the game.
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) { /* unsupported — ignore */ }
    },
    unlockOrientation() {
      try {
        if (typeof screen !== "undefined" && screen.orientation &&
            typeof screen.orientation.unlock === "function") screen.orientation.unlock();
      } catch (e) { /* ignore */ }
    },
    toggle() {
      try {
        if (!this.active()) {
          const e = this.el;
          (e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen).call(e);
          this.lockLandscape();
        } else {
          (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
          this.unlockOrientation();
        }
      } catch (err) { console.warn("Fullscreen failed:", err); }
    },
    // Reflect the current fullscreen state on the pause → settings → Display
    // control (Task 37): its label reads "Enter fullscreen" when windowed and
    // "Exit fullscreen" when fullscreen, so a player who never noticed the corner
    // glyph still has the option where every PC/console game keeps it. The whole
    // Display sub-panel is hidden when the Fullscreen API is unsupported (e.g. iOS
    // Safari) — no dead button. Pure, no-op-safe headless (driven off active()/
    // supported(), which feature-detect the browser-only API), so it is callable
    // from refreshTexts() on open + on a live language switch.
    syncMenu() {
      const supported = this.supported();
      if (dom.displayPanel) dom.displayPanel.style.display = supported ? "" : "none";
      if (!dom.fsBtnP) return;
      const on = this.active();
      dom.fsBtnP.textContent = t(on ? "btnTitle.exitFullscreen" : "settings.enterFullscreen");
      dom.fsBtnP.disabled = !supported;
      try { dom.fsBtnP.setAttribute("aria-pressed", on ? "true" : "false"); } catch (e) {}
    },
    init() {
      // The menu Display control mirrors the HUD button and is hidden the same way
      // when the API is missing — wire it even if the HUD button is absent.
      this.syncMenu();
      if (dom.fsBtnP) dom.fsBtnP.addEventListener("click", () => this.toggle());
      if (!dom.fsBtn) return;
      if (!this.supported()) { dom.fsBtn.style.display = "none"; return; } // e.g. iOS Safari
      const sync = () => {
        const on = this.active();
        dom.fsBtn.textContent = on ? "✕" : "⛶";
        dom.fsBtn.title = t(on ? "btnTitle.exitFullscreen" : "btnTitle.fullscreen");
        // Keep the menu label + the HUD glyph + the browser's real state in lockstep
        // off the one fullscreenchange listener, however fullscreen was toggled.
        this.syncMenu();
        // If the user left fullscreen by any means (Esc, gesture), drop the lock.
        if (!on) this.unlockOrientation();
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

      // Customizable control layout (Task 36): load the per-device arrangement and
      // apply it to the (still-hidden) HUD before anything paints, so even on the
      // start screen the controls already sit where the player put them — before
      // any save loads. Headless-safe (no document ⇒ a clean no-op). Wire the
      // "Edit control layout" entry buttons (start-screen Controls panel + pause →
      // settings) here too — the editor is a DOM-only feature, independent of the
      // 3D engine, so it stays functional even if the WebGL boot fails. On a device
      // where the editor can't run (no Pointer Events / non-touch) it opens in a
      // no-drag mode that explains why, so the entry is never a dead click.
      ControlLayout.load();
      ControlLayout.apply();
      const openLayoutEditor = () => { Sfx.play("ui_click"); ControlLayoutUI.openUI(); };
      if (dom.layoutEditBtn) dom.layoutEditBtn.addEventListener("click", openLayoutEditor);
      if (dom.layoutEditBtnP) dom.layoutEditBtnP.addEventListener("click", openLayoutEditor);

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

      // Cloud-saves UI (opt-in Google Drive): sign-in + manual save + autosave
      // toggle on the start screen and pause settings, plus the browse overlay.
      // It is a DOM-only feature, independent of the 3D engine — so it is wired
      // (and its boot-time SILENT re-auth attempted) BEFORE the WebGL scene builds,
      // so a returning player who opted into Drive stays signed in even if the
      // engine boot is slow or fails (graceful degradation; Task 23). With no
      // client id / no GIS / headless it is cleanly disabled and never throws.
      CloudUI.init();

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
      // Durable session (Task 17): with no explicit pick pending, auto-restore the
      // last in-progress run from first-party storage. We DON'T force it — the seed
      // is set so the world regenerates identically, a "Continue" entry point is
      // offered, and the player chooses to resume (Start still begins a fresh run,
      // overwriting the snapshot). The seed is set before the world builds either
      // way so the regenerated environment matches the snapshot.
      const autoSnapshot = pendingLoad ? null : Session.readSnapshot();
      const resumeFrom = pendingLoad || autoSnapshot;
      if (resumeFrom) setSeed(resumeFrom.seed);

      const wantAutostart = sessionGet(AUTOSTART_KEY) === "1";
      if (wantAutostart) sessionDel(AUTOSTART_KEY);

      // Show + wire the "Continue" button when a resumable session exists.
      const resumeRun = (snap) => {
        try { applySave(snap); startGame(true); Session.flush(); toast(t("toast.loaded")); }
        catch (e) { console.error(e); showFatal("Couldn't load save: " + e.message); }
      };
      if (autoSnapshot && dom.continueBtn) {
        dom.continueBtn.classList.remove("hidden");
        dom.continueBtn.addEventListener("click", () => resumeRun(autoSnapshot));
      }

      const scene = createScene();
      scene.executeWhenReady(() => {
        dom.loadHint.textContent = t("hint.ready");
        dom.startBtn.disabled = false;
        if (dom.continueBtn) dom.continueBtn.disabled = false;
        if (pendingLoad) {
          try { applySave(pendingLoad); startGame(true); Session.flush(); toast(t("toast.loaded")); }
          catch (e) { console.error(e); showFatal("Couldn't load save: " + e.message); }
        } else if (wantAutostart) {
          startGame();
        }
      });
      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", () => {
        engine.resize();
        // Re-anchor the moved controls to the new viewport / orientation (the
        // stored fractions are resolution-independent; re-clamping keeps them in
        // the safe area after a rotation or window resize). If the editor is open,
        // its handles track the controls too.
        ControlLayout.apply();
        if (ControlLayoutUI.open) ControlLayoutUI.renderHandles();
      });
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
      if (dom.invBtn) dom.invBtn.addEventListener("click", () => { Sfx.play("ui_click"); Inventory.toggle(); });
      if (dom.invClose) dom.invClose.addEventListener("click", () => Inventory.close());
      if (dom.invDone) dom.invDone.addEventListener("click", () => Inventory.close());
      if (dom.invTabGear) dom.invTabGear.addEventListener("click", () => { Sfx.play("ui_click"); Inventory.setTab("gear"); });
      if (dom.invTabMaterials) dom.invTabMaterials.addEventListener("click", () => { Sfx.play("ui_click"); Inventory.setTab("materials"); });
      if (dom.invTabPotions) dom.invTabPotions.addEventListener("click", () => { Sfx.play("ui_click"); Inventory.setTab("potions"); });

      // Adventure overlays: dialogue, crafting, castle, quest log.
      if (dom.dlgClose) dom.dlgClose.addEventListener("click", () => Dialogue.close());
      if (dom.craftBtn) dom.craftBtn.addEventListener("click", () => { Sfx.play("ui_click"); Crafting.toggle(); });
      if (dom.craftClose) dom.craftClose.addEventListener("click", () => Crafting.close());
      if (dom.craftDone) dom.craftDone.addEventListener("click", () => Crafting.close());
      if (dom.castleClose) dom.castleClose.addEventListener("click", () => CastleUI.close());
      if (dom.castleDone) dom.castleDone.addEventListener("click", () => CastleUI.close());
      if (dom.questBtn) dom.questBtn.addEventListener("click", () => { Sfx.play("ui_click"); QuestLog.toggle(); });
      if (dom.questLogClose) dom.questLogClose.addEventListener("click", () => QuestLog.close());
      if (dom.questLogDone) dom.questLogDone.addEventListener("click", () => QuestLog.close());
      // Skills & fusion overlay: open via the ✨ button or the "K" key.
      if (dom.skillsBtn) dom.skillsBtn.addEventListener("click", () => { Sfx.play("ui_click"); SkillsUI.toggle(); });
      if (dom.skillsClose) dom.skillsClose.addEventListener("click", () => SkillsUI.close());
      if (dom.skillsDone) dom.skillsDone.addEventListener("click", () => SkillsUI.close());

      // World-map overlay (🗺️ / Tab): tabs, search, zoom, guide + the minimap.
      WorldMapUI.init();
      // The minimap is the single entry point to the full map (Task 16 removed the
      // duplicate 🗺️ button); tapping it opens the world map.
      if (dom.minimap) dom.minimap.addEventListener("click", () => { Sfx.play("ui_click"); WorldMapUI.openMap(); });
      if (dom.mapClose) dom.mapClose.addEventListener("click", () => WorldMapUI.close());
      if (dom.mapDone) dom.mapDone.addEventListener("click", () => WorldMapUI.close());
      if (dom.mapTabZone) dom.mapTabZone.addEventListener("click", () => { Sfx.play("ui_click"); WorldMapUI.setTab("zone"); });
      if (dom.mapTabWorld) dom.mapTabWorld.addEventListener("click", () => { Sfx.play("ui_click"); WorldMapUI.setTab("world"); });
      if (dom.mapSearch) dom.mapSearch.addEventListener("input", (e) => WorldMapUI.search(e.target ? e.target.value : ""));
      if (dom.mapZoomIn) dom.mapZoomIn.addEventListener("click", () => WorldMapUI.zoom(1.25));
      if (dom.mapZoomOut) dom.mapZoomOut.addEventListener("click", () => WorldMapUI.zoom(1 / 1.25));
      if (dom.mapGuideBtn) dom.mapGuideBtn.addEventListener("click", () => WorldMapUI.guide());
      if (dom.mapClearBtn) dom.mapClearBtn.addEventListener("click", () => { WorldMap.clearWaypoint(false); WorldMapUI.render(); });

      if (dom.winReplayBtn) dom.winReplayBtn.addEventListener("click", () => window.location.reload());

      // Audio mixer controls (volume sliders + mute) on the start screen + pause.
      AudioUI.init();

      // Save management (Task 18): the unified Saves screen (named local slots +
      // cloud section + file export/import), reachable from start screen + pause.
      SavesUI.init();

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

      // Durable-session controls (Task 17): "Clear saved session & sign out" wipes
      // the auto-persisted run, the session cookie and the Google sign-in, then
      // refreshes the start screen so "Continue" disappears.
      const clearSession = () => {
        Session.clearAll();
        if (CloudSave.signedIn) { try { CloudSave.signOut(); } catch (e) {} }
        if (dom.continueBtn) dom.continueBtn.classList.add("hidden");
        toast(t("toast.sessionCleared"));
      };
      if (dom.clearSessionBtn) dom.clearSessionBtn.addEventListener("click", clearSession);
      if (dom.clearSessionBtnP) dom.clearSessionBtnP.addEventListener("click", clearSession);

      // In-game pause menu + Escape behaviour: Escape closes the shop if it's
      // open, otherwise toggles the pause menu (or backs out of a confirm).
      Pause.init();
      window.addEventListener("keydown", (e) => {
        // Quick-bar SKILL hotkeys 1 / 2 / 3 — cast the slotted skill mid-fight.
        if ((e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3") &&
            gameStarted && !paused && !uiPaused && playerRef) {
          Skills.activate(stateRef, playerRef, e.code.charCodeAt(5) - 49); // "1"->0, "2"->1, "3"->2
          e.preventDefault(); return;
        }
        // Potion belt hotkeys 4 / 5 / 6 — quaff the matching slot (the number row's
        // 1/2/3 now casts skills, so the belt moved one set over).
        if ((e.code === "Digit4" || e.code === "Digit5" || e.code === "Digit6") &&
            gameStarted && !paused && !uiPaused && playerRef) {
          potionUse(playerRef, e.code.charCodeAt(5) - 52); // "4"->0, "5"->1, "6"->2
          e.preventDefault(); return;
        }
        // Inventory hotkey (only once playing, and not while another menu is up).
        // While typing in the map search, let keys flow to the input (only Esc /
        // the map toggle are still honoured below).
        const typingInSearch = WorldMapUI.open && e.target === dom.mapSearch;
        if ((e.code === "KeyI" || e.code === "KeyB") && gameStarted && !paused && !Shop.open && !Anvil.open && !Dialogue.open && !Crafting.open && !CastleUI.open && !SkillsUI.open && !WorldMapUI.open) {
          Inventory.toggle(); e.preventDefault(); return;
        }
        // Skills & fusion (K) hotkey.
        if (e.code === "KeyK" && gameStarted && !paused && !Shop.open && !Anvil.open && !Inventory.open && !Dialogue.open && !Crafting.open && !CastleUI.open && !WorldMapUI.open) {
          SkillsUI.toggle(); e.preventDefault(); return;
        }
        // Crafting bench (C) and quest log (J) hotkeys.
        if (e.code === "KeyC" && gameStarted && !paused && !Shop.open && !Anvil.open && !Inventory.open && !Dialogue.open && !CastleUI.open && !SkillsUI.open && !WorldMapUI.open) {
          Crafting.toggle(); e.preventDefault(); return;
        }
        if ((e.code === "KeyJ" || e.code === "KeyL") && gameStarted && !paused && !Shop.open && !Anvil.open && !Inventory.open && !Dialogue.open && !Crafting.open && !SkillsUI.open && !WorldMapUI.open) {
          QuestLog.toggle(); e.preventDefault(); return;
        }
        // World map (Tab / 🗺️) and minimap toggle (N).
        if (e.code === "Tab" && gameStarted && !paused && !Shop.open && !Anvil.open && !Inventory.open && !Dialogue.open && !Crafting.open && !CastleUI.open && !SkillsUI.open) {
          WorldMapUI.toggle(); e.preventDefault(); return;
        }
        if (e.code === "KeyN" && gameStarted && !paused && !typingInSearch) { WorldMap.toggleMinimap(); e.preventDefault(); return; }
        if (e.code === "KeyM" && !typingInSearch) { Music.toggle(); return; }
        if (e.code !== "Escape") return;
        // A confirmation guard (restart / exit / save-slot delete-overwrite) backs
        // out first, wherever it was raised (pause OR the Saves screen).
        if (Pause.pendingAction) { Pause.hideConfirm(); return; }
        if (ControlLayoutUI.open) { ControlLayoutUI.cancel(); return; }
        if (SavesUI.open) { SavesUI.closeScreen(); return; }
        if (CloudUI.overlay && CloudUI.overlay.classList && !CloudUI.overlay.classList.contains("hidden")) { CloudUI.closeList(); return; }
        if (Shop.open) { Shop.closeShop(); return; }
        if (Anvil.open) { Anvil.close(); return; }
        if (Inventory.open) { Inventory.close(); return; }
        if (SkillsUI.open) { SkillsUI.close(); return; }
        if (WorldMapUI.open) { WorldMapUI.close(); return; }
        if (Dialogue.open) { Dialogue.close(); return; }
        if (Crafting.open) { Crafting.close(); return; }
        if (CastleUI.open) { CastleUI.close(); return; }
        if (QuestLog.open) { QuestLog.close(); return; }
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
  // Accept either a hex string or a ready BABYLON.Color3 (so mat()/emat() can
  // hand down the Task-11 graded colour while the raw backdrop callers pass hex).
  function colOf(x) { return typeof x === "string" ? BABYLON.Color3.FromHexString(x) : x; }
  function stdMat(scene, name, col) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = colOf(col);
    m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    return m;
  }
  function stdEmat(scene, name, col, emissive) {
    const m = stdMat(scene, name, col);
    m.emissiveColor = colOf(col).scale(emissive);
    return m;
  }
  function pbrMat(scene, name, col) {
    const m = new BABYLON.PBRMaterial(name, scene);
    m._ggPBR = true;
    m.albedoColor = colOf(col);
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
  function pbrEmat(scene, name, col, emissive) {
    const m = pbrMat(scene, name, col);
    m.emissiveColor = colOf(col).scale(emissive);
    return m;
  }
  function usePBR() { return !!(BABYLON.PBRMaterial && Quality.settings().pbr); }
  // mat()/emat() apply the Task-11 cheerful colour grade once, here, so every
  // gameplay/foliage/prop/character material is lifted in one place (backdrops
  // that call stdMat/stdEmat directly stay ungraded for DayNight's exact tints).
  function mat(scene, name, hex) { const c = ArtDirection.grade(hex); return usePBR() ? pbrMat(scene, name, c) : stdMat(scene, name, c); }
  function emat(scene, name, hex, emissive) { const c = ArtDirection.grade(hex); return usePBR() ? pbrEmat(scene, name, c, emissive) : stdEmat(scene, name, c, emissive); }

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
      ENHANCE, RARITY, getDef, makeItem, makeLoot,
      equipItem, unequipSlot, recomputeStats, TWO_HANDED, EQUIP_SLOTS, WORN_SLOTS, SLOT_META,
      potionAdd, potionUse, POTION_SLOTS, enhanceItem, enhanceCost, enhanceMult,
      // ---- Unified bag: stacking, potion quick-slots, alchemist (Task 21) ----
      bagCount, bagAdd, bagSpend, STACK_MAX, isStackable, isMaterial,
      assignPotionSlot, clearPotionSlot, syncPotionSlots, drinkPotionById,
      migrateLegacyBag, sellWorth, Alchemist,
      INGREDIENT_STOCK, ALCHEMIST_STOCK,
      effectiveStats, featuredForWave, computeWeapon, Sfx, spawnArtifact,
      // ---- Items & equipment depth (Task 12): affixes, sets, derived stats ----
      AFFIXES, SETS, rollAffixes, affixStats, setBonusStats, activeSets, itemCategory,
      deriveStats, equippedAfter, equipDelta, wornDetailFor, isGear,
      // ---- Worn helmets: distinct archetype per item (Task 25) ----
      helmetArchetype,
      // ---- Worn chest pieces: layered breastplates & robes per item (Task 26) ----
      chestArchetype,
      // ---- Worn pauldrons: shoulder armour that sits on the shoulder (Task 27) ----
      pauldronArchetype,
      // ---- Worn gloves & gauntlets: distinct hand piece per item (Task 28) ----
      gloveArchetype,
      // ---- Worn belts: distinct belt per item (Task 29) ----
      beltArchetype,

      // ---- Responsive HUD / drag-to-slot / fullscreen (Task 16) ----
      dragSlotReducer, pointerDragSupported, Fullscreen,
      // ---- Customizable on-screen control layout (Task 36) ----
      ControlLayout, ControlLayoutUI, clampLayoutPos, layoutReducer, sanitizeLayout,
      CONTROL_IDS, CONTROL_DEFS, LAYOUT_KEY,
      // ---- Skills, leveling & fusion (Task 14) ----
      Skills, SkillsUI, SKILL_DB, getSkill, ELEMENTS, EFFECTS,
      BASE_SKILL_IDS, BOSS_SKILL_IDS, STARTER_SKILL_IDS, SKILL_SLOTS, MAX_FUSE_INPUTS,
      xpToNext, totalXpToReach, maxFocusForLevel, levelHealthBonus, skillsUnlockedAt,
      skillTier, canFuse, fuseSkills, fusionCost, newProgress,
      XP_PER_GATHER, XP_PER_QUEST, XP_PER_ARTIFACT, runRecap,
      tSkillName, tSkillDesc, tElementLabel, tEffectLabel,
      // ---- Audio: mixer, per-zone ambience, footsteps (Task 6) ----
      Mixer, Ambience, AudioUI, Footsteps, LowHealth, surfaceForZone, AUDIO_KEY,
      // ---- Durable session persistence (Task 17) ----
      Session, buildCookieString, parseCookies, cookieGet, cookieSet, cookieDel,
      readCookieState, writeCookieState, sessionPersistDue, silentAuthDecision,
      SESSION_KEY, COOKIE_NAME, COOKIE_MAX_AGE, SESSION_DEBOUNCE_MS, localDel,
      // ---- Cloud saves: Google Drive appDataFolder (Task 15) ----
      CloudSave, CloudUI, makeGoogleDriveClient, CLOUD_KEY,
      CLOUD_AUTOSAVE_MS, CLOUD_HISTORY_MS, CLOUD_MAX_SLOTS, CLOUD_MANUAL_NAME, CLOUD_AUTO_PREFIX,
      SILENT_AUTH_TIMEOUT_MS, cloudAutosaveDue, cloudPrune, cloudNewer, cloudAutoName, cloudParseAuto,
      // ---- Save slots: multiple named manual saves + management (Task 18) ----
      SAVE_VERSION,
      SaveSlots, SavesUI, SLOTS_KEY, SLOTS_VERSION, SLOT_COUNT, SLOT_NAME_MAX,
      sanitizeSlotName, defaultSlotName, slotMetaFromPayload, normalizeSlotStore,
      listSlots, nextFreeSlot, putSlotRecord, renameSlotRecord, deleteSlotRecord, fmtPlaytime,
      // ---- Internationalization (Task 7) ----
      I18N, LOCALES, RU, t, plural, applyLocale, LOCALE_KEY, localGet,
      tItemName, tItemDesc, tZoneName, tQuestTitle, tQuestStory, tNpcName, tNpcIntro,
      tRarityLabel, tMaterialLabel, tResourceLabel, tRelicName, tCastlePartName,
      tChapterTitle, tWeatherLabel, tDragonName, bossDisplayName, tLairBossName,
      // ---- Russian grammatical morphology (Task 24) ----
      RU_NOUNS, CASES, GENDERS, declineRegular, ruForm, select, agree, nounRef, declineNoun, nounGender,
      materialLabel, materialRef, placeRef, zonePrep, bossNounRef, bossGender, AGREE_RAISED, AGREE_DEFEATED,
      // ---- Adventure systems ----
      MATERIALS, MATERIAL_IDS, RELICS, CASTLE_PARTS, CRAFT_RECIPES, NPC_DATA, QUEST_BY_ID,
      MONSTER_ABILITIES, RESOURCE_KINDS, abilitiesForWave,
      Quests, Dialogue, Crafting, CastleUI, QuestLog, DayNight, Weather,
      ResourceNode, QuestGiver, CastleSite, castleCollisionCircles, Dragon, Burst,
      meleeSweep,
      // ---- Resource ecology: deterministic, time-gated, per-kind capped (Task 22) ----
      resourceMixFor, resourceCap, planInitialResources, regrowZoneResources,
      zoneResourceRecord, buildResourceNodes, growZoneResources, rebuildZoneResources,
      countKind, seededStream, zoneKey, serializeZoneRes, deserializeZoneRes,
      // ---- Main story campaign (Task 2) ----
      Story, STORY, MISSIONS, SIDE_QUESTS, MAIN_IDS, SIDE_IDS, CHAPTER_BY_ID, missionsOfChapter,
      // ---- RPG world / zones ----
      ZONES, ZONE_BY_ID, HUB_ZONE, SpawnDirector, ZoneManager, buildWorld,
      setupZoneContent, teardownZone, questGiversForZone, spawnZoneNpcs,
      // ---- Minimap / world map / guided waypoint (Task 13, fixes Task 20) ----
      WorldMap, WorldMapUI, resolveWaypoint,
      ZONE_ADJ, zoneEdges, findRoute, nextZoneStep, bearingRad, dist2D,
      relativeHeading, compass8, MAP_TARGETS, targetZoneOf, targetPoint,
      validWaypoint, searchTargets, worldLayout,
      mapVecToScreen, mapHeadingScreen, layoutMapLabels,
      // ---- Animation (Task 5) ----
      Swing, SWING_DUR, ambientSpecFor, buildAmbientFX, AMBIENT_SPECS,
      // ---- Lighting / shadows / quality tier (Task 4) ----
      Quality, makeSunShadows, setupPostFX, applyZoneMood,
      // ---- Art direction: cheerful grade + larger tier-gated view (Task 11) ----
      ArtDirection,
      // ---- Higher-fidelity models / materials (Task 3) ----
      makeEnvironment, mat, emat, stdMat, stdEmat, pbrMat, pbrEmat, gloss, usePBR,
      get envOn() { return ENV_ON; },
      addMaterial, spendMaterials, hasMaterials, craftRecipe, addRelic, hasRelic,
      grantReward, spawnImpact, winGame, gameOver,
      get interaction() { return interactionRef; },
      get zoneManager() { return zoneManager; },
      get waves() { return waveSystem; },
      get player() { return playerRef; },
      get camera() { return cameraRef; },
      get scene() { return sceneRef; },
      get state() { return Shop.state; },
      get world() { return worldRef; },
      startGame,
      serializeGame, applySave, validateSave, setSeed, rng, Pause, Music,
      get seed() { return getSeed(); },
      get paused() { return paused; },
      get won() { return stateRef ? stateRef.won : false; },
    };
  }
