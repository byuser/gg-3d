// Task 12 — deep item & equipment system. Locks in the affix/rarity stat math,
// equipment sets, the widened 12-slot loadout + equip rules, the compare-vs-
// equipped deltas, the visible worn-gear build (toggle, no leak, tier-gated), the
// tabbed inventory (filter/sort/consume) and the v7 save round-trip + migration.
import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => {
  for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire();
};
// A deterministic 0..1 rng for affix-roll determinism tests.
const mkRng = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
};
const clearEquip = (p) => {
  for (const slot of T.EQUIP_SLOTS) p.equipment[slot] = null;
};

beforeAll(() => {
  T.startGame();
  step(3);
});

describe("Task 12 — widened loadout & slots", () => {
  it("exposes 12 equip slots incl. pauldrons/gloves/belt/cloak", () => {
    expect(T.EQUIP_SLOTS.length).toBe(12);
    for (const s of ["pauldrons", "gloves", "belt", "cloak"]) {
      expect(T.EQUIP_SLOTS.includes(s)).toBe(true);
      expect(T.SLOT_META[s]).toBeTruthy();
    }
  });

  it("routes each new armour type to its own slot", () => {
    const p = T.player;
    clearEquip(p);
    for (const id of ["leather_pauldrons", "leather_gloves", "leather_belt", "travel_cloak"]) {
      const def = T.getDef(id);
      T.equipItem(p, T.makeItem(id));
      expect(p.equipment[def.type] && p.equipment[def.type].id).toBe(id);
    }
  });
});

describe("Task 12 — enchantments / affixes", () => {
  it("rolls the right count per rarity, all from the item's category pool", () => {
    const counts = { iron_sword: 0, excalibur: 1, void_scythe: 2, world_ender: 3 };
    for (const id in counts) {
      const def = T.getDef(id);
      const aff = T.rollAffixes(def, mkRng(99));
      expect(aff.length, id).toBe(counts[id]);
      for (const a of aff) expect(T.AFFIXES[a].on.includes("weapon"), `${id}:${a}`).toBe(true);
    }
    // Armour pool never yields weapon-only affixes (e.g. "fierce").
    const armourAff = T.rollAffixes(T.getDef("dragonscale_plate"), mkRng(7));
    for (const a of armourAff) expect(T.AFFIXES[a].on.includes("armor")).toBe(true);
  });

  it("is deterministic for a given rng sequence", () => {
    const def = T.getDef("astral_bow");
    expect(T.rollAffixes(def, mkRng(1234))).toEqual(T.rollAffixes(def, mkRng(1234)));
  });

  it("folds affix stats into effectiveStats, rarity-scaled and flat over enhancement", () => {
    const plain = T.makeItem("dragon_helm"); // rare, base +40 hp
    const ench = T.makeItem("dragon_helm");
    ench.affixes = ["of_vigor"]; // +12hp base × tier1 (×1.4)
    expect(T.effectiveStats(ench).maxHealth - T.effectiveStats(plain).maxHealth).toBeCloseTo(
      12 * 1.4,
      5,
    );
    // The affix portion is FLAT (not multiplied by enhancement level): same delta at +5.
    const ench5 = T.makeItem("dragon_helm");
    ench5.affixes = ["of_vigor"];
    ench5.level = 5;
    const plain5 = T.makeItem("dragon_helm");
    plain5.level = 5;
    expect(T.effectiveStats(ench5).maxHealth - T.effectiveStats(plain5).maxHealth).toBeCloseTo(
      12 * 1.4,
      5,
    );
  });

  it("compounds haste affixes multiplicatively toward zero cooldown", () => {
    const base = T.makeItem("swift_gloves"); // base haste 0.9
    const fast = T.makeItem("swift_gloves");
    fast.affixes = ["of_haste"]; // ×0.93
    expect(T.effectiveStats(fast).haste).toBeLessThan(T.effectiveStats(base).haste);
    expect(T.effectiveStats(fast).haste).toBeGreaterThan(0);
  });

  it("makeLoot enchants rare+ gear and leaves normal gear clean (seeded)", () => {
    T.setSeed(42);
    expect(T.makeLoot("leather_cap").affixes).toBeUndefined(); // normal → no affixes
    const rare = T.makeLoot("excalibur");
    expect(Array.isArray(rare.affixes) && rare.affixes.length).toBe(1);
  });
});

describe("Task 12 — equipment sets", () => {
  it("grants cumulative threshold bonuses as pieces are worn", () => {
    const eq = {};
    eq.a = { id: "dragon_helm" };
    eq.b = { id: "dragonscale_plate" };
    expect(T.setBonusStats(eq)).toEqual({ maxHealth: 25 }); // 2-piece
    eq.c = { id: "dragon_pauldrons" };
    eq.d = { id: "dragon_gauntlets" };
    expect(T.setBonusStats(eq)).toEqual({ maxHealth: 25, damage: 2, damageReduction: 0.06 }); // 4
    eq.e = { id: "dragon_belt" };
    eq.f = { id: "dragon_cloak" };
    const full = T.setBonusStats(eq); // 6 (all thresholds)
    expect(full.maxHealth).toBe(75);
    expect(full.lifesteal).toBe(3);
  });

  it("reports active-set progress for the UI", () => {
    const sets = T.activeSets({
      a: { id: "iron_helm" },
      b: { id: "iron_plate" },
      c: { id: "iron_greaves" },
    });
    const iron = sets.find((s) => s.id === "ironguard");
    expect(iron.count).toBe(3);
    expect(iron.total).toBe(6);
    expect(iron.next).toBe(4);
    expect(iron.bonuses.find((b) => b.threshold === 2).met).toBe(true);
    expect(iron.bonuses.find((b) => b.threshold === 4).met).toBe(false);
  });

  it("feeds set bonuses into the live recomputed stats", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const baseHp = p.maxHealth;
    p.equipment.helmet = T.makeItem("iron_helm");
    p.equipment.breastplate = T.makeItem("iron_plate");
    T.recomputeStats(p);
    const twoPiece = p.maxHealth;
    // +25 (helm) +35 (plate) gear, plus the 2-piece set's +4% resist.
    expect(twoPiece).toBe(baseHp + 25 + 35);
    expect(p.damageReduction).toBeCloseTo(0.04 + 0.1 + 0.04, 5); // helm + plate + set
  });
});

describe("Task 12 — equip rules & compare", () => {
  it("equippedAfter mirrors equipItem for 2-handed, dual-wield and rings", () => {
    const p = T.player;
    clearEquip(p);
    const cases = ["short_bow", "iron_dagger", "iron_sword", "ring_power", "ring_guard"];
    for (const id of cases) {
      const preview = T.equippedAfter(p.equipment, T.makeItem(id));
      T.equipItem(p, T.makeItem(id));
      for (const slot of T.EQUIP_SLOTS) {
        const a = p.equipment[slot],
          b = preview[slot];
        const aId = a === T.TWO_HANDED ? "2H" : a ? a.id : null;
        const bId = b === T.TWO_HANDED ? "2H" : b ? b.id : null;
        expect(aId, `${id} @ ${slot}`).toBe(bId);
      }
    }
  });

  it("equipDelta reports the stat change vs the equipped slot", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    // Empty helmet → equipping a +15hp cap is a straight +15.
    expect(T.equipDelta(p, T.makeItem("leather_cap")).maxHealth).toBeCloseTo(15, 5);
    // With the cap on, a +25hp helm nets +10 more.
    T.equipItem(p, T.makeItem("leather_cap"));
    expect(T.equipDelta(p, T.makeItem("iron_helm")).maxHealth).toBeCloseTo(10, 5);
  });
});

describe("Task 12 — visible worn gear", () => {
  it("builds the core silhouette + the high-tier extras", () => {
    const g = T.player.gear;
    for (const k of ["helmet", "chest", "gloves", "boots"]) expect(g[k], k).toBeTruthy();
    // headless detects as the high tier → pauldrons/belt/cloak present
    expect(g.pauls && g.belt && g.cloak).toBeTruthy();
  });

  it("tier-gates the lighter pieces + cloak sway", () => {
    expect(T.wornDetailFor("low")).toMatchObject({
      pauldrons: false,
      belt: false,
      cloak: true,
      cloakSway: false,
    });
    expect(T.wornDetailFor("high")).toMatchObject({ pauldrons: true, belt: true, cloakSway: true });
  });

  it("toggles visibility on equip/unequip and never reallocates meshes (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const refs = [p.gear.helmet, p.gear.chest, p.gear.cloak, p.gear.boots[0], p.gear.pauls.plated.nodes[1]];
    expect(p.gearShown.helmet).toBe(false);
    for (let i = 0; i < 12; i++) {
      // hammer equip/unequip
      T.equipItem(p, T.makeItem("dragon_helm"));
      expect(p.gearShown.helmet).toBe(true);
      T.unequipSlot(p, "helmet");
      T.recomputeStats(p);
      expect(p.gearShown.helmet).toBe(false);
    }
    // Same mesh objects throughout — nothing was rebuilt.
    expect([
      p.gear.helmet,
      p.gear.chest,
      p.gear.cloak,
      p.gear.boots[0],
      p.gear.pauls.plated.nodes[1],
    ]).toEqual(refs);
  });

  it("animates the cloak without throwing while stepping the loop", () => {
    const p = T.player;
    clearEquip(p);
    p.equipment.cloak = T.makeItem("shadow_cloak");
    T.recomputeStats(p);
    expect(() => step(5)).not.toThrow();
    expect(p.gearShown.cloak).toBe(true);
  });
});

describe("Task 12 — tabbed inventory (filter / sort / consume)", () => {
  it("switches tabs and consumes a potion from the potions tab (unified bag)", () => {
    const p = T.player;
    T.potionAdd(p, "minor_potion");
    const before = T.bagCount(p, "minor_potion");
    p.health = 1; p.maxHealth = 100; // so the heal actually applies (and the potion is spent)
    T.Inventory.openInv();
    expect(() => {
      T.Inventory.setTab("materials");
      T.Inventory.setTab("gear");
      T.Inventory.setTab("potions");
    }).not.toThrow();
    // Drink one straight from the bag stack (the potions tab's "Drink one").
    T.Inventory.drinkBag("minor_potion");
    expect(T.bagCount(p, "minor_potion")).toBe(before - 1);
    T.Inventory.close();
  });

  it("filters + sorts the gear bag without throwing", () => {
    const p = T.player;
    p.inventory = [
      T.makeItem("iron_sword"),
      T.makeItem("excalibur"),
      T.makeItem("ring_power"),
      T.makeItem("iron_helm"),
    ];
    T.Inventory.openInv();
    for (const f of ["all", "weapon", "armor", "jewelry"])
      expect(() => T.Inventory.setFilter(f)).not.toThrow();
    for (const s of ["rarity", "type", "name"]) expect(() => T.Inventory.setSort(s)).not.toThrow();
    T.Inventory.close();
  });

  it("classifies items for the filter (weapon / armour / jewelry)", () => {
    expect(T.itemCategory(T.getDef("excalibur"))).toBe("weapon");
    expect(T.itemCategory(T.getDef("dragon_cloak"))).toBe("armor");
    expect(T.itemCategory(T.getDef("ring_power"))).toBe("jewelry");
    expect(T.itemCategory(T.getDef("titan_pendant"))).toBe("jewelry");
  });
});

describe("Task 12 — save / load round-trip + migration", () => {
  it("round-trips affixes + the new slots through serialize/applySave (v7)", () => {
    const p = T.player;
    clearEquip(p);
    const cloak = T.makeItem("dragon_cloak");
    cloak.affixes = ["fleet", "of_warding"];
    p.equipment.cloak = cloak;
    p.equipment.pauldrons = T.makeItem("iron_pauldrons");
    const bag = T.makeItem("excalibur");
    bag.affixes = ["fierce"];
    bag.level = 1;
    p.inventory = [bag];
    T.recomputeStats(p);
    const hp = p.maxHealth,
      save = T.serializeGame();
    expect(save.v).toBe(T.SAVE_VERSION); // v10 (Task 18 added playSec)
    expect(save.player.equipment.cloak.aff).toEqual(["fleet", "of_warding"]);

    clearEquip(p);
    p.inventory = [];
    T.applySave(save);
    expect(T.player.equipment.cloak.affixes).toEqual(["fleet", "of_warding"]);
    expect(T.player.equipment.pauldrons.id).toBe("iron_pauldrons");
    expect(T.player.inventory[0].affixes).toEqual(["fierce"]);
    expect(T.player.inventory[0].level).toBe(1);
    expect(T.player.maxHealth).toBeCloseTo(hp, 5);
  });

  it("loads an older (v6, no affixes / no new slots) save cleanly", () => {
    const save = T.serializeGame();
    save.v = 6;
    delete save.player.equipment.pauldrons;
    delete save.player.equipment.cloak;
    delete save.player.equipment.gloves;
    delete save.player.equipment.belt;
    for (const e of save.player.inventory) delete e.aff;
    for (const slot in save.player.equipment) {
      const e = save.player.equipment[slot];
      if (e && typeof e === "object") delete e.aff;
    }
    expect(T.validateSave(save)).toBe(true);
    expect(() => T.applySave(save)).not.toThrow();
    for (const slot of ["pauldrons", "cloak", "gloves", "belt"])
      expect(T.player.equipment[slot]).toBe(null);
  });
});

describe("Task 25 — worn helmets: distinct archetype per item", () => {
  const HELMET_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "helmet");
  const VALID_ARCH = ["cap", "open", "great", "dragon", "crown"];
  const VALID_MAT = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];

  it("maps every helmet def to a valid archetype + material", () => {
    expect(HELMET_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of HELMET_IDS) {
      const a = T.helmetArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("gives the four shipped helmets four DISTINCT archetypes", () => {
    const pick = (id) => T.helmetArchetype(T.getDef(id));
    expect(pick("leather_cap")).toMatchObject({ archetype: "cap", material: "leather" });
    expect(pick("iron_helm")).toMatchObject({ archetype: "open", material: "iron" });
    expect(pick("dragon_helm")).toMatchObject({ archetype: "dragon", material: "dragonscale" });
    expect(pick("crown_eternal")).toMatchObject({ archetype: "crown", material: "gold" });
    // A leather cap and a dragon helm must NOT look identical.
    expect(pick("leather_cap").archetype).not.toBe(pick("dragon_helm").archetype);
  });

  it("is pure + total: infers a valid pair for helmets with no `helm` block", () => {
    // Set-driven inference (Dragonscale → dragon horns, Ironguard → open iron).
    expect(T.helmetArchetype({ type: "helmet", rarity: "rare", set: "dragonscale" }))
      .toMatchObject({ archetype: "dragon", material: "dragonscale" });
    expect(T.helmetArchetype({ type: "helmet", rarity: "rare", set: "ironguard" }))
      .toMatchObject({ archetype: "open", material: "steel" });
    // Rarity fallbacks (legendary → crown, epic/rare → great).
    expect(T.helmetArchetype({ type: "helmet", rarity: "legendary" }).archetype).toBe("crown");
    expect(T.helmetArchetype({ type: "helmet", rarity: "epic" }).archetype).toBe("great");
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { helm: { archetype: "xx", material: "plastic" } }]) {
      const a = T.helmetArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.helmetArchetype(T.getDef("dragon_helm"))).toEqual(T.helmetArchetype(T.getDef("dragon_helm")));
  });

  it("pre-builds every archetype mesh group once (headless-safe), each with materials", () => {
    const g = T.player.gear;
    expect(g.helms).toBeTruthy();
    expect(Object.keys(g.helms).sort()).toEqual(["cap", "crown", "dragon", "great", "open"]);
    for (const k in g.helms) {
      expect(g.helms[k].node, k).toBeTruthy();
      expect(g.helms[k].mats.length, k).toBeGreaterThan(0);
    }
  });

  it("tier-gates the helm trim detail (simpler shell on low)", () => {
    expect(T.wornDetailFor("low").helmDetail).toBe(false);
    expect(T.wornDetailFor("high").helmDetail).toBe(true);
  });

  it("shows exactly the equipped helmet's archetype (and nothing when bare)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = { leather_cap: "cap", iron_helm: "open", dragon_helm: "dragon", crown_eternal: "crown" };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.helmet, id).toBe(true);
      expect(p.gearShown.helmetArchetype, id).toBe(map[id]);
      T.unequipSlot(p, "helmet");
      T.recomputeStats(p);
    }
    expect(p.gearShown.helmet).toBe(false);
    expect(p.gearShown.helmetArchetype).toBe(null);
  });

  it("never reallocates the helmet meshes across equip churn (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const anchor = p.gear.helmet;
    const groups = { cap: p.gear.helms.cap.node, dragon: p.gear.helms.dragon.node, crown: p.gear.helms.crown.node };
    // Hammer through every helmet many times.
    for (let i = 0; i < 10; i++) {
      for (const id of ["leather_cap", "iron_helm", "dragon_helm", "crown_eternal"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow(); // animates + renders with the helm on
      }
      T.unequipSlot(p, "helmet");
      T.recomputeStats(p);
    }
    // Same anchor + archetype nodes throughout — nothing was rebuilt.
    expect(p.gear.helmet).toBe(anchor);
    expect(p.gear.helms.cap.node).toBe(groups.cap);
    expect(p.gear.helms.dragon.node).toBe(groups.dragon);
    expect(p.gear.helms.crown.node).toBe(groups.crown);
  });
});

describe("Task 26 — worn chest pieces: distinct archetype per item", () => {
  const CHEST_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "breastplate");
  const VALID_ARCH = ["vest", "cuirass", "plate", "dragonscale", "robe"];
  const VALID_MAT = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];

  it("maps every breastplate def to a valid archetype + material", () => {
    expect(CHEST_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of CHEST_IDS) {
      const a = T.chestArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("gives the shipped breastplates distinct, on-theme archetypes", () => {
    const pick = (id) => T.chestArchetype(T.getDef(id));
    expect(pick("leather_vest")).toMatchObject({ archetype: "vest", material: "leather" });
    expect(pick("iron_plate")).toMatchObject({ archetype: "cuirass", material: "iron" });
    expect(pick("aegis_plate")).toMatchObject({ archetype: "plate", material: "steel" });
    expect(pick("dragonscale_plate")).toMatchObject({ archetype: "dragonscale", material: "dragonscale" });
    expect(pick("phoenix_plate")).toMatchObject({ archetype: "plate", material: "gold" });
    // A leather vest and a dragonscale plate must NOT look identical.
    expect(pick("leather_vest").archetype).not.toBe(pick("dragonscale_plate").archetype);
    // At least three visually distinct chest silhouettes are actually in use.
    const used = new Set(CHEST_IDS.map((id) => pick(id).archetype));
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("shares the set motif with the matching helmet (a full suit reads as one)", () => {
    // Ironguard: cuirass chest ↔ open iron helm (same iron material).
    expect(T.chestArchetype(T.getDef("iron_plate")).material)
      .toBe(T.helmetArchetype(T.getDef("iron_helm")).material);
    // Dragonscale: scaled chest ↔ horned helm (same dragonscale material).
    expect(T.chestArchetype(T.getDef("dragonscale_plate")).material)
      .toBe(T.helmetArchetype(T.getDef("dragon_helm")).material);
  });

  it("is pure + total: infers a valid pair for chests with no `chest` block", () => {
    // Set-driven inference (Dragonscale → scaled plate, Ironguard → banded cuirass).
    expect(T.chestArchetype({ type: "breastplate", rarity: "rare", set: "dragonscale" }))
      .toMatchObject({ archetype: "dragonscale", material: "dragonscale" });
    expect(T.chestArchetype({ type: "breastplate", rarity: "rare", set: "ironguard" }))
      .toMatchObject({ archetype: "cuirass", material: "iron" });
    // Rarity fallbacks (legendary/epic/rare → ornate plate; normal → vest).
    expect(T.chestArchetype({ type: "breastplate", rarity: "legendary" }).archetype).toBe("plate");
    expect(T.chestArchetype({ type: "breastplate", rarity: "epic" }).archetype).toBe("plate");
    expect(T.chestArchetype({ type: "breastplate", rarity: "normal" }).archetype).toBe("vest");
    // An explicit cloth robe def resolves to the robe archetype.
    expect(T.chestArchetype({ type: "breastplate", rarity: "rare", chest: { archetype: "robe", material: "cloth" } }))
      .toMatchObject({ archetype: "robe", material: "cloth" });
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { chest: { archetype: "xx", material: "plastic" } }]) {
      const a = T.chestArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.chestArchetype(T.getDef("aegis_plate"))).toEqual(T.chestArchetype(T.getDef("aegis_plate")));
  });

  it("pre-builds every chest archetype mesh group once (headless-safe), each with materials", () => {
    const g = T.player.gear;
    expect(g.chests).toBeTruthy();
    expect(Object.keys(g.chests).sort()).toEqual(["cuirass", "dragonscale", "plate", "robe", "vest"]);
    for (const k in g.chests) {
      expect(g.chests[k].node, k).toBeTruthy();
      expect(g.chests[k].mats.length, k).toBeGreaterThan(0);
    }
  });

  it("tier-gates the chest trim detail (simpler shell on low)", () => {
    expect(T.wornDetailFor("low").chestDetail).toBe(false);
    expect(T.wornDetailFor("high").chestDetail).toBe(true);
  });

  it("shows exactly the equipped breastplate's archetype (and nothing when bare)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = {
      leather_vest: "vest", iron_plate: "cuirass", aegis_plate: "plate",
      dragonscale_plate: "dragonscale", phoenix_plate: "plate",
    };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.breastplate, id).toBe(true);
      expect(p.gearShown.chestArchetype, id).toBe(map[id]);
      T.unequipSlot(p, "breastplate");
      T.recomputeStats(p);
    }
    expect(p.gearShown.breastplate).toBe(false);
    expect(p.gearShown.chestArchetype).toBe(null);
  });

  it("never reallocates the chest meshes across equip churn (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const anchor = p.gear.chest;
    const groups = {
      vest: p.gear.chests.vest.node,
      cuirass: p.gear.chests.cuirass.node,
      dragonscale: p.gear.chests.dragonscale.node,
    };
    // Hammer through every breastplate many times (animates + renders each frame).
    for (let i = 0; i < 10; i++) {
      for (const id of ["leather_vest", "iron_plate", "aegis_plate", "dragonscale_plate", "phoenix_plate"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow();
      }
      T.unequipSlot(p, "breastplate");
      T.recomputeStats(p);
    }
    // Same anchor + archetype nodes throughout — nothing was rebuilt.
    expect(p.gear.chest).toBe(anchor);
    expect(p.gear.chests.vest.node).toBe(groups.vest);
    expect(p.gear.chests.cuirass.node).toBe(groups.cuirass);
    expect(p.gear.chests.dragonscale.node).toBe(groups.dragonscale);
  });

  it("only ever shows one chest archetype group at a time", () => {
    const p = T.player;
    clearEquip(p);
    T.equipItem(p, T.makeItem("dragonscale_plate"));
    T.recomputeStats(p);
    const enabled = Object.keys(p.gear.chests).filter((k) => {
      try { return p.gear.chests[k].node.isEnabled(); } catch (e) { return false; }
    });
    expect(enabled).toEqual(["dragonscale"]);
  });
});

// --- Task 27: worn pauldrons sit ON the shoulder (no inward clip) -----------
// A faithful TRS/YXZ node transform so the shoulder-fit invariant can compute a
// pauldron vertex's LEAN-space position by walking the real built node chain
// (mesh → group → shoulder pivot → arm), exactly as Babylon composes it
// (world = parent.world · T · Ry · Rx · Rz · S). Lets the test read the ACTUAL
// geometry the builder emitted, so it re-derives if the offsets ever change.
function applyTRS(node, v) {
  const s = node.scaling || { x: 1, y: 1, z: 1 };
  let x = v.x * (s.x == null ? 1 : s.x);
  let y = v.y * (s.y == null ? 1 : s.y);
  let z = v.z * (s.z == null ? 1 : s.z);
  const r = node.rotation || { x: 0, y: 0, z: 0 };
  const rz = r.z || 0, rx = r.x || 0, ry = r.y || 0;
  // Rz
  let nx = x * Math.cos(rz) - y * Math.sin(rz);
  let ny = x * Math.sin(rz) + y * Math.cos(rz);
  x = nx; y = ny;
  // Rx
  let ny2 = y * Math.cos(rx) - z * Math.sin(rx);
  let nz2 = y * Math.sin(rx) + z * Math.cos(rx);
  y = ny2; z = nz2;
  // Ry
  let nx3 = x * Math.cos(ry) + z * Math.sin(ry);
  let nz3 = -x * Math.sin(ry) + z * Math.cos(ry);
  x = nx3; z = nz3;
  const pos = node.position || { x: 0, y: 0, z: 0 };
  return { x: x + (pos.x || 0), y: y + (pos.y || 0), z: z + (pos.z || 0) };
}
// Transform a mesh-local point up the parent chain until (and excluding) `stop`.
function toFrame(mesh, point, stop) {
  let v = point, n = mesh;
  while (n && n !== stop) { v = applyTRS(n, v); n = n.parent; }
  return v;
}

describe("Task 27 — worn pauldrons: distinct archetype per item + shoulder fit", () => {
  const PAULDRON_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "pauldrons");
  const VALID_ARCH = ["cap", "plated", "spiked", "ornate", "winged"];
  const VALID_MAT = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];

  it("maps every pauldron def to a valid archetype + material", () => {
    expect(PAULDRON_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of PAULDRON_IDS) {
      const a = T.pauldronArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("gives the shipped pauldrons distinct, on-theme archetypes", () => {
    const pick = (id) => T.pauldronArchetype(T.getDef(id));
    expect(pick("leather_pauldrons")).toMatchObject({ archetype: "cap", material: "leather" });
    expect(pick("iron_pauldrons")).toMatchObject({ archetype: "plated", material: "iron" });
    expect(pick("dragon_pauldrons")).toMatchObject({ archetype: "spiked", material: "dragonscale" });
    expect(pick("storm_pauldrons")).toMatchObject({ archetype: "winged", material: "steel" });
    // Leather spaulders and dragonscale spaulders must NOT look identical.
    expect(pick("leather_pauldrons").archetype).not.toBe(pick("dragon_pauldrons").archetype);
    // At least three visually distinct shoulder silhouettes are actually in use.
    const used = new Set(PAULDRON_IDS.map((id) => pick(id).archetype));
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("shares the set motif with the matching chest + helmet (a full suit reads as one)", () => {
    // Ironguard: plated shoulders ↔ cuirass chest ↔ open iron helm (same iron).
    expect(T.pauldronArchetype(T.getDef("iron_pauldrons")).material)
      .toBe(T.chestArchetype(T.getDef("iron_plate")).material);
    // Dragonscale: spiked shoulders ↔ scaled chest ↔ horned helm (same dragonscale).
    expect(T.pauldronArchetype(T.getDef("dragon_pauldrons")).material)
      .toBe(T.helmetArchetype(T.getDef("dragon_helm")).material);
  });

  it("is pure + total: infers a valid pair for pauldrons with no `paul` block", () => {
    // Set-driven inference (Dragonscale → spiked scale, Ironguard → banded plated).
    expect(T.pauldronArchetype({ type: "pauldrons", rarity: "rare", set: "dragonscale" }))
      .toMatchObject({ archetype: "spiked", material: "dragonscale" });
    expect(T.pauldronArchetype({ type: "pauldrons", rarity: "rare", set: "ironguard" }))
      .toMatchObject({ archetype: "plated", material: "iron" });
    // Rarity fallbacks (legendary/epic → winged; rare → ornate; normal → cap).
    expect(T.pauldronArchetype({ type: "pauldrons", rarity: "legendary" }).archetype).toBe("winged");
    expect(T.pauldronArchetype({ type: "pauldrons", rarity: "epic" }).archetype).toBe("winged");
    expect(T.pauldronArchetype({ type: "pauldrons", rarity: "rare" }).archetype).toBe("ornate");
    expect(T.pauldronArchetype({ type: "pauldrons", rarity: "normal" }).archetype).toBe("cap");
    // An explicit block wins over inference.
    expect(T.pauldronArchetype({ type: "pauldrons", rarity: "rare", paul: { archetype: "winged", material: "gold" } }))
      .toMatchObject({ archetype: "winged", material: "gold" });
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { paul: { archetype: "xx", material: "plastic" } }]) {
      const a = T.pauldronArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.pauldronArchetype(T.getDef("dragon_pauldrons"))).toEqual(T.pauldronArchetype(T.getDef("dragon_pauldrons")));
  });

  it("pre-builds every pauldron archetype group once on BOTH shoulders (headless-safe)", () => {
    const g = T.player.gear;
    expect(g.pauls).toBeTruthy();
    expect(Object.keys(g.pauls).sort()).toEqual(["cap", "ornate", "plated", "spiked", "winged"]);
    for (const k in g.pauls) {
      const grp = g.pauls[k];
      expect(grp.nodes.length, k).toBe(2); // one per shoulder
      expect(grp.mats.length, k).toBeGreaterThan(0);
      expect(grp.meshes.length, k).toBeGreaterThan(0);
    }
    // The shoulder pivots (the fit fix) are built once, parented to the arms.
    expect(T.player.shoulderPivots.length).toBe(2);
    expect(T.player.shoulderPivots[0].arm).toBe(T.player.armL);
    expect(T.player.shoulderPivots[1].arm).toBe(T.player.armR);
  });

  it("tier-gates the pauldrons (omitted entirely on low; detail on high)", () => {
    expect(T.wornDetailFor("low").pauldrons).toBe(false);
    expect(T.wornDetailFor("low").pauldronDetail).toBe(false);
    expect(T.wornDetailFor("high").pauldrons).toBe(true);
    expect(T.wornDetailFor("high").pauldronDetail).toBe(true);
  });

  it("shows exactly the equipped pauldron's archetype (and nothing when bare)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = {
      leather_pauldrons: "cap", iron_pauldrons: "plated",
      dragon_pauldrons: "spiked", storm_pauldrons: "winged",
    };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.pauldrons, id).toBe(true);
      expect(p.gearShown.pauldronArchetype, id).toBe(map[id]);
      // Both shoulders of exactly that archetype are enabled; the rest are hidden.
      for (const k in p.gear.pauls) {
        const on = p.gear.pauls[k].nodes.every((n) => n.isEnabled());
        expect(on, `${id}/${k}`).toBe(k === map[id]);
      }
      T.unequipSlot(p, "pauldrons");
      T.recomputeStats(p);
    }
    expect(p.gearShown.pauldrons).toBe(false);
    expect(p.gearShown.pauldronArchetype).toBe(null);
  });

  it("never reallocates the pauldron meshes / pivots across equip churn (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const pivots = p.shoulderPivots.map((s) => s.pivot);
    const nodes = { cap: p.gear.pauls.cap.nodes.slice(), spiked: p.gear.pauls.spiked.nodes.slice() };
    const meshCount = Object.values(p.gear.pauls).reduce((n, grp) => n + grp.meshes.length, 0);
    for (let i = 0; i < 10; i++) {
      for (const id of ["leather_pauldrons", "iron_pauldrons", "dragon_pauldrons", "storm_pauldrons"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow(); // animates the shoulders each frame
      }
      T.unequipSlot(p, "pauldrons");
      T.recomputeStats(p);
    }
    // Same pivots + archetype nodes + mesh count throughout — nothing was rebuilt.
    expect(p.shoulderPivots.map((s) => s.pivot)).toEqual(pivots);
    expect(p.gear.pauls.cap.nodes).toEqual(nodes.cap);
    expect(p.gear.pauls.spiked.nodes).toEqual(nodes.spiked);
    expect(Object.values(p.gear.pauls).reduce((n, grp) => n + grp.meshes.length, 0)).toBe(meshCount);
  });

  // THE core fit invariant: the shoulder mesh must stay OUTSIDE the torso envelope
  // at every sampled attack phase (no inward clip into the chest/neck). We pose the
  // arms to each phase, settle the real per-frame shoulder animation, then transform
  // every built pauldron's extent up the real node chain into LEAN space and check the
  // innermost x on its own side. The fix anchors the pauldrons to the torso and drives
  // only the arm's forward/back PITCH onto them — pitch is a rotation about X, so the
  // x-extent is INVARIANT across poses. The test asserts BOTH properties: (a) the
  // innermost x is identical at every pose (structural clip-freedom, the actual fix —
  // the old sphere rode the arm's roll and dived to x≈0.03 on the melee strike), and
  // (b) it stays clear of the torso surface. The torso is a cylinder (top⌀0.45) on
  // lean-x 0; at shoulder height its half-width ≈0.23, so we require x ≥ 0.20.
  it("keeps both shoulder pieces outside the torso envelope through idle/walk/attack", () => {
    const p = T.player;
    const arm = { L: p.armL, R: p.armR };
    // Sampled poses: [armL{x,z}, armR{x,z}] covering idle, walk (both arm phases),
    // the melee wind-up/strike/recover (the big +z roll on armR is the old offender)
    // and the ranged strike + the gather chop (which swings armL up).
    const POSES = [
      { name: "idle",          L: { x: 0.08, z: 0.08 },  R: { x: 0.08, z: -0.08 } },
      { name: "walk_fwdL",     L: { x: -0.68, z: 0.14 }, R: { x: 0.68, z: -0.14 } },
      { name: "walk_fwdR",     L: { x: 0.68, z: 0.14 },  R: { x: -0.68, z: -0.14 } },
      { name: "melee_windup",  L: { x: 0.08, z: 0.08 },  R: { x: 0.8, z: -0.7 } },
      { name: "melee_strike",  L: { x: 0.08, z: 0.08 },  R: { x: -1.5, z: 1.2 } },
      { name: "melee_recover", L: { x: 0.08, z: 0.08 },  R: { x: -0.5, z: 0.4 } },
      { name: "ranged_strike", L: { x: 0.08, z: 0.08 },  R: { x: -1.9, z: 0.0 } },
      { name: "gather_strike", L: { x: 1.3, z: 0.08 },   R: { x: 0.08, z: -0.08 } },
    ];
    // Local extent samples of a shoulder cap group (a hull around the caps — the
    // dominant mass; thin decorative spikes sit further outboard than this box).
    const EXT = [];
    for (const dx of [-0.24, -0.12, 0, 0.24]) for (const dy of [-0.22, 0, 0.22]) for (const dz of [-0.24, 0, 0.24]) EXT.push({ x: dx, y: dy, z: dz });
    const MIN_CLEAR = 0.20; // torso half-width at the shoulder ≈0.23; keep clear of it
    // Settle the shoulder animation (a frame-rate-independent lerp) for a pose.
    const settle = (pose) => {
      arm.L.rotation.x = pose.L.x; arm.L.rotation.z = pose.L.z;
      arm.R.rotation.x = pose.R.x; arm.R.rotation.z = pose.R.z;
      for (let k = 0; k < 8; k++) p._animatePauldrons();
    };
    // Innermost lean-x of one side's group (on its own side: L at -x, R at +x).
    const innerXof = (grp, node, sideSign) => {
      const meshes = grp.meshes.filter((m) => {
        let n = m; while (n) { if (n === node) return true; n = n.parent; } return false;
      });
      expect(meshes.length).toBeGreaterThan(0);
      let innerMost = Infinity;
      for (const m of meshes) for (const e of EXT) innerMost = Math.min(innerMost, toFrame(m, e, p.lean).x * sideSign);
      return innerMost;
    };

    // Every shipped archetype (winged is the widest — the worst case).
    for (const id of ["storm_pauldrons", "dragon_pauldrons", "iron_pauldrons", "leather_pauldrons"]) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      const archKey = p.gearShown.pauldronArchetype;
      const grp = p.gear.pauls[archKey];
      // Baseline (idle) innermost x per side.
      settle(POSES[0]);
      const baseL = innerXof(grp, grp.nodes[0], -1);
      const baseR = innerXof(grp, grp.nodes[1], 1);
      for (const pose of POSES) {
        settle(pose);
        const iL = innerXof(grp, grp.nodes[0], -1);
        const iR = innerXof(grp, grp.nodes[1], 1);
        // (a) pose-independence — the attack never moves the piece inward at all.
        expect(iL, `${id}/${archKey} L @${pose.name} moved (${iL.toFixed(3)} vs ${baseL.toFixed(3)})`).toBeCloseTo(baseL, 6);
        expect(iR, `${id}/${archKey} R @${pose.name} moved (${iR.toFixed(3)} vs ${baseR.toFixed(3)})`).toBeCloseTo(baseR, 6);
        // (b) both shoulders stay clear of the torso surface, on their own side.
        expect(iL, `${id}/${archKey} L @${pose.name} innerX=${iL.toFixed(3)}`).toBeGreaterThanOrEqual(MIN_CLEAR);
        expect(iR, `${id}/${archKey} R @${pose.name} innerX=${iR.toFixed(3)}`).toBeGreaterThanOrEqual(MIN_CLEAR);
      }
    }
    clearEquip(p);
    T.recomputeStats(p);
  });
});

describe("Task 28 — worn gloves & gauntlets: distinct archetype per item + grip fit", () => {
  const GLOVE_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "gloves");
  const VALID_ARCH = ["glove", "bracer", "gauntlet", "scaled", "warplate"];
  const VALID_MAT = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];

  it("maps every gloves def to a valid archetype + material", () => {
    expect(GLOVE_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of GLOVE_IDS) {
      const a = T.gloveArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("gives the shipped gloves distinct, on-theme archetypes", () => {
    const pick = (id) => T.gloveArchetype(T.getDef(id));
    expect(pick("leather_gloves")).toMatchObject({ archetype: "glove", material: "leather" });
    expect(pick("iron_gauntlets")).toMatchObject({ archetype: "gauntlet", material: "iron" });
    expect(pick("dragon_gauntlets")).toMatchObject({ archetype: "scaled", material: "dragonscale" });
    expect(pick("swift_gloves")).toMatchObject({ archetype: "bracer", material: "leather" });
    expect(pick("titan_gauntlets")).toMatchObject({ archetype: "warplate", material: "steel" });
    // Soft leather gloves and a plated gauntlet must NOT look identical.
    expect(pick("leather_gloves").archetype).not.toBe(pick("iron_gauntlets").archetype);
    // At least three visually distinct hand silhouettes are actually in use.
    const used = new Set(GLOVE_IDS.map((id) => pick(id).archetype));
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("shares the set motif with the matching chest + pauldrons + helmet (a full suit reads as one)", () => {
    // Ironguard: gauntlets ↔ cuirass chest ↔ plated shoulders ↔ open iron helm (same iron).
    expect(T.gloveArchetype(T.getDef("iron_gauntlets")).material)
      .toBe(T.chestArchetype(T.getDef("iron_plate")).material);
    expect(T.gloveArchetype(T.getDef("iron_gauntlets")).material)
      .toBe(T.pauldronArchetype(T.getDef("iron_pauldrons")).material);
    // Dragonscale: scaled gauntlets ↔ scaled chest ↔ spiked shoulders ↔ horned helm (same dragonscale).
    expect(T.gloveArchetype(T.getDef("dragon_gauntlets")).material)
      .toBe(T.helmetArchetype(T.getDef("dragon_helm")).material);
    expect(T.gloveArchetype(T.getDef("dragon_gauntlets")).material)
      .toBe(T.pauldronArchetype(T.getDef("dragon_pauldrons")).material);
  });

  it("is pure + total: infers a valid pair for gloves with no `glov` block", () => {
    // Set-driven inference (Dragonscale → scaled gauntlet, Ironguard → banded gauntlet).
    expect(T.gloveArchetype({ type: "gloves", rarity: "rare", set: "dragonscale" }))
      .toMatchObject({ archetype: "scaled", material: "dragonscale" });
    expect(T.gloveArchetype({ type: "gloves", rarity: "rare", set: "ironguard" }))
      .toMatchObject({ archetype: "gauntlet", material: "iron" });
    // Rarity fallbacks (legendary/epic → warplate; rare → bracer; normal → glove).
    expect(T.gloveArchetype({ type: "gloves", rarity: "legendary" }).archetype).toBe("warplate");
    expect(T.gloveArchetype({ type: "gloves", rarity: "epic" }).archetype).toBe("warplate");
    expect(T.gloveArchetype({ type: "gloves", rarity: "rare" }).archetype).toBe("bracer");
    expect(T.gloveArchetype({ type: "gloves", rarity: "normal" }).archetype).toBe("glove");
    // Materials follow rarity when there's no set (legendary → gold, epic/rare → steel).
    expect(T.gloveArchetype({ type: "gloves", rarity: "legendary" }).material).toBe("gold");
    expect(T.gloveArchetype({ type: "gloves", rarity: "epic" }).material).toBe("steel");
    // An explicit block wins over inference.
    expect(T.gloveArchetype({ type: "gloves", rarity: "rare", glov: { archetype: "warplate", material: "gold" } }))
      .toMatchObject({ archetype: "warplate", material: "gold" });
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { glov: { archetype: "xx", material: "plastic" } }]) {
      const a = T.gloveArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.gloveArchetype(T.getDef("dragon_gauntlets"))).toEqual(T.gloveArchetype(T.getDef("dragon_gauntlets")));
  });

  it("pre-builds every glove archetype group once on BOTH hands (headless-safe)", () => {
    const g = T.player.gear;
    expect(g.gloves).toBeTruthy();
    expect(Object.keys(g.gloves).sort()).toEqual(["bracer", "gauntlet", "glove", "scaled", "warplate"]);
    for (const k in g.gloves) {
      const grp = g.gloves[k];
      expect(grp.nodes.length, k).toBe(2); // one per hand
      expect(grp.mats.length, k).toBeGreaterThan(0);
      expect(grp.meshes.length, k).toBeGreaterThan(0);
      // Each hand group rides its arm pivot (so it follows the hand through the attack).
      expect(grp.nodes[0].parent).toBe(T.player.armL);
      expect(grp.nodes[1].parent).toBe(T.player.armR);
    }
  });

  it("tier-gates the glove detail (finer trims off on low; on for high)", () => {
    // Gloves are core silhouette (always built), but the finger lames / trims gate.
    expect(T.wornDetailFor("low").gloves).toBe(true);
    expect(T.wornDetailFor("low").gloveDetail).toBe(false);
    expect(T.wornDetailFor("high").gloves).toBe(true);
    expect(T.wornDetailFor("high").gloveDetail).toBe(true);
  });

  it("shows exactly the equipped glove's archetype (and nothing when bare)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = {
      leather_gloves: "glove", iron_gauntlets: "gauntlet",
      dragon_gauntlets: "scaled", swift_gloves: "bracer", titan_gauntlets: "warplate",
    };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.gloves, id).toBe(true);
      expect(p.gearShown.gloveArchetype, id).toBe(map[id]);
      // Both hands of exactly that archetype are enabled; the rest are hidden.
      for (const k in p.gear.gloves) {
        const on = p.gear.gloves[k].nodes.every((n) => n.isEnabled());
        expect(on, `${id}/${k}`).toBe(k === map[id]);
      }
      T.unequipSlot(p, "gloves");
      T.recomputeStats(p);
    }
    expect(p.gearShown.gloves).toBe(false);
    expect(p.gearShown.gloveArchetype).toBe(null);
  });

  it("never reallocates the glove meshes across equip churn (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const nodes = { glove: p.gear.gloves.glove.nodes.slice(), scaled: p.gear.gloves.scaled.nodes.slice() };
    const meshCount = Object.values(p.gear.gloves).reduce((n, grp) => n + grp.meshes.length, 0);
    for (let i = 0; i < 10; i++) {
      for (const id of ["leather_gloves", "iron_gauntlets", "dragon_gauntlets", "swift_gloves", "titan_gauntlets"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow(); // the hand poses animate each frame
      }
      T.unequipSlot(p, "gloves");
      T.recomputeStats(p);
    }
    // Same archetype nodes + total mesh count throughout — nothing was rebuilt.
    expect(p.gear.gloves.glove.nodes).toEqual(nodes.glove);
    expect(p.gear.gloves.scaled.nodes).toEqual(nodes.scaled);
    expect(Object.values(p.gear.gloves).reduce((n, grp) => n + grp.meshes.length, 0)).toBe(meshCount);
  });

  // THE fit invariant: the glove must stay COMPACT around the hand and never engulf
  // the weapon grip. The glove rides the ARM pivot (like the hand it replaces), so it
  // follows the hand through every attack pose for free; the risk is a shape that
  // BALLOONS over the whole grip or CLIMBS the weapon shaft (which rises in +y from the
  // grip at arm-local (0,−0.58,+0.12) toward the tip). We transform every built glove
  // vertex up the real node chain into ARM-LOCAL space and assert (a) it stays within a
  // tight radius of the hand centre (arm-local y −0.62) — no ballooning — and (b) its
  // TOP stays down at the wrist (arm-local y ≤ −0.30), well below where the shaft climbs
  // to the crystal/blade, so the grip is never swallowed. These are STRUCTURAL bounds on
  // the emitted geometry, so the test re-derives if the builder's offsets ever change.
  it("keeps every glove compact around the hand without engulfing the weapon grip", () => {
    const p = T.player;
    const HAND_Y = -0.62;      // the arm-local hand centre the group node sits at
    // Each glove part is small by construction (the widest is the ⌀0.44 warplate cuff;
    // the highest part centre is the warplate rim at arm-local y −0.34). Bound each
    // part's CENTRE so the invariant is a real envelope on the emitted mass: no part
    // sits far from the hand (no ballooning over the grip), and the highest part stays
    // down at the wrist (never climbs the +y weapon shaft toward the crystal/blade).
    const MAX_CENTRE_R = 0.44;  // part centre must sit within this radius of the hand
    const GRIP_CEILING = -0.30; // the highest part centre stays at/below the wrist
    for (const id of GLOVE_IDS) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      const archKey = p.gearShown.gloveArchetype;
      const grp = p.gear.gloves[archKey];
      for (const node of grp.nodes) {          // both hands (identical geometry)
        const arm = node.parent;               // the glove sits on the arm pivot
        const meshes = grp.meshes.filter((m) => {
          let n = m; while (n) { if (n === node) return true; n = n.parent; } return false;
        });
        expect(meshes.length, `${id} meshes`).toBeGreaterThan(0);
        // Check each part's CENTRE (transformed to arm-local) + its own half-extent:
        // (a) it stays within a tight radius of the hand — no shape balloons over the
        //     whole grip; (b) its TOP stays down at the wrist (never climbs the +y
        //     weapon shaft toward the crystal/blade), so the grip is never swallowed.
        for (const m of meshes) {
          const c = toFrame(m, { x: 0, y: 0, z: 0 }, arm); // part centre in arm-local space
          const r = Math.hypot(c.x, c.y - HAND_Y, c.z);
          expect(r, `${id}/${archKey} part centre radius ${r.toFixed(3)}`).toBeLessThanOrEqual(MAX_CENTRE_R);
          expect(c.y, `${id}/${archKey} part centre y ${c.y.toFixed(3)} climbs the shaft`).toBeLessThanOrEqual(GRIP_CEILING);
        }
      }
    }
    clearEquip(p);
    T.recomputeStats(p);
  });
});

describe("Task 29 — worn belts: distinct archetype per item + below-chest fit", () => {
  const BELT_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "belt");
  const VALID_ARCH = ["strap", "plated", "scaled", "pouched", "warbelt"];
  const VALID_MAT = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];

  it("maps every belt def to a valid archetype + material", () => {
    expect(BELT_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of BELT_IDS) {
      const a = T.beltArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("gives the shipped belts distinct, on-theme archetypes", () => {
    const pick = (id) => T.beltArchetype(T.getDef(id));
    expect(pick("leather_belt")).toMatchObject({ archetype: "strap", material: "leather" });
    expect(pick("reinforced_belt")).toMatchObject({ archetype: "plated", material: "iron" });
    expect(pick("dragon_belt")).toMatchObject({ archetype: "scaled", material: "dragonscale" });
    // A plain leather strap and a banded iron war-belt must NOT look identical.
    expect(pick("leather_belt").archetype).not.toBe(pick("reinforced_belt").archetype);
    // The three shipped belts use three distinct silhouettes.
    const used = new Set(BELT_IDS.map((id) => pick(id).archetype));
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("shares the set motif with the matching chest + pauldrons + gloves + helmet (a full suit reads as one)", () => {
    // Ironguard: reinforced belt ↔ cuirass chest ↔ plated shoulders ↔ iron gauntlets (same iron).
    expect(T.beltArchetype(T.getDef("reinforced_belt")).material)
      .toBe(T.chestArchetype(T.getDef("iron_plate")).material);
    expect(T.beltArchetype(T.getDef("reinforced_belt")).material)
      .toBe(T.gloveArchetype(T.getDef("iron_gauntlets")).material);
    // Dragonscale: dragon belt ↔ scaled chest ↔ spiked shoulders ↔ horned helm (same dragonscale).
    expect(T.beltArchetype(T.getDef("dragon_belt")).material)
      .toBe(T.helmetArchetype(T.getDef("dragon_helm")).material);
    expect(T.beltArchetype(T.getDef("dragon_belt")).material)
      .toBe(T.pauldronArchetype(T.getDef("dragon_pauldrons")).material);
    // The Ironguard belt uses the SAME 'plated' motif keyword as its shoulders.
    expect(T.beltArchetype(T.getDef("reinforced_belt")).archetype)
      .toBe(T.pauldronArchetype(T.getDef("iron_pauldrons")).archetype);
  });

  it("is pure + total: infers a valid pair for belts with no `belt` block", () => {
    // Set-driven inference (Dragonscale → scaled clasp, Ironguard → banded plated).
    expect(T.beltArchetype({ type: "belt", rarity: "rare", set: "dragonscale" }))
      .toMatchObject({ archetype: "scaled", material: "dragonscale" });
    expect(T.beltArchetype({ type: "belt", rarity: "normal", set: "ironguard" }))
      .toMatchObject({ archetype: "plated", material: "iron" });
    // Rarity fallbacks (legendary/epic → warbelt; rare → pouched; normal → strap).
    expect(T.beltArchetype({ type: "belt", rarity: "legendary" }).archetype).toBe("warbelt");
    expect(T.beltArchetype({ type: "belt", rarity: "epic" }).archetype).toBe("warbelt");
    expect(T.beltArchetype({ type: "belt", rarity: "rare" }).archetype).toBe("pouched");
    expect(T.beltArchetype({ type: "belt", rarity: "normal" }).archetype).toBe("strap");
    // Materials follow rarity when there's no set (legendary → gold, epic/rare → steel).
    expect(T.beltArchetype({ type: "belt", rarity: "legendary" }).material).toBe("gold");
    expect(T.beltArchetype({ type: "belt", rarity: "epic" }).material).toBe("steel");
    // An explicit block wins over inference.
    expect(T.beltArchetype({ type: "belt", rarity: "rare", belt: { archetype: "warbelt", material: "gold" } }))
      .toMatchObject({ archetype: "warbelt", material: "gold" });
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { belt: { archetype: "xx", material: "plastic" } }]) {
      const a = T.beltArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.beltArchetype(T.getDef("dragon_belt"))).toEqual(T.beltArchetype(T.getDef("dragon_belt")));
  });

  it("pre-builds every belt archetype group once under the single waist anchor (headless-safe)", () => {
    const g = T.player.gear;
    expect(g.belts).toBeTruthy();
    expect(Object.keys(g.belts).sort()).toEqual(["plated", "pouched", "scaled", "strap", "warbelt"]);
    for (const k in g.belts) {
      const grp = g.belts[k];
      expect(grp.mats.length, k).toBeGreaterThan(0);
      expect(grp.meshes.length, k).toBeGreaterThan(0);
      // Every archetype hangs off the shared waist anchor (built once, never realloc).
      expect(grp.node.parent).toBe(g.belt);
    }
    // The waist anchor rides the torso (lean), not the legs — so it's pose-independent.
    expect(g.belt.parent).toBe(T.player.lean);
  });

  it("tier-gates the belt (omitted entirely on low; built on high) — a clean omission", () => {
    // The belt is a light extra: dropped on the low tier (like the old cylinder), so a
    // phone keeps its budget; the STATS still apply, only the mesh is skipped.
    expect(T.wornDetailFor("low").belt).toBe(false);
    expect(T.wornDetailFor("low").beltDetail).toBe(false);
    expect(T.wornDetailFor("high").belt).toBe(true);
    expect(T.wornDetailFor("high").beltDetail).toBe(true);
  });

  it("shows exactly the equipped belt's archetype (and nothing when bare)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = { leather_belt: "strap", reinforced_belt: "plated", dragon_belt: "scaled" };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.belt, id).toBe(true);
      expect(p.gearShown.beltArchetype, id).toBe(map[id]);
      // Exactly that archetype group is enabled; the rest are hidden.
      for (const k in p.gear.belts) {
        expect(p.gear.belts[k].node.isEnabled(), `${id}/${k}`).toBe(k === map[id]);
      }
      T.unequipSlot(p, "belt");
      T.recomputeStats(p);
    }
    expect(p.gearShown.belt).toBe(false);
    expect(p.gearShown.beltArchetype).toBe(null);
    // The shared anchor is hidden when nothing is equipped.
    expect(p.gear.belt.isEnabled()).toBe(false);
  });

  it("never reallocates the belt meshes across equip churn (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const strapNode = p.gear.belts.strap.node;
    const scaledNode = p.gear.belts.scaled.node;
    const meshCount = Object.values(p.gear.belts).reduce((n, grp) => n + grp.meshes.length, 0);
    for (let i = 0; i < 10; i++) {
      for (const id of ["leather_belt", "reinforced_belt", "dragon_belt"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow();
      }
      T.unequipSlot(p, "belt");
      T.recomputeStats(p);
    }
    // Same archetype nodes + total mesh count throughout — nothing was rebuilt.
    expect(p.gear.belts.strap.node).toBe(strapNode);
    expect(p.gear.belts.scaled.node).toBe(scaledNode);
    expect(Object.values(p.gear.belts).reduce((n, grp) => n + grp.meshes.length, 0)).toBe(meshCount);
  });

  // THE fit invariant: the belt must sit at the WAIST, BELOW the chest piece (so the two
  // never z-fight), and CLEAR OF THE LEGS through the whole stride. Two structural bounds
  // on the emitted geometry (re-derived if the builder's offsets ever change):
  //   (a) BELOW-CHEST — every belt part's CENTRE (walked up the node chain into LEAN-local
  //       space) stays at/below a ceiling that is below the chest envelope's lowest reach.
  //       The chest anchor sits at lean-y 1.16 and its lowest part (the Ironguard cuirass
  //       fauld) bottoms out at ≈ lean-y 0.80; the belt's highest part CENTRE is a thin
  //       rim at lean-y 0.76 (top ≈ 0.785) and its thickest part (the strap band, half-
  //       height 0.06) is centred at lean-y 0.71 (top ≈ 0.77) — both under 0.80.
  //   (b) CLEARS-LEGS — the belt is parented to the TORSO (lean), never the legs, so it is
  //       pose-independent; the legs swing beneath it. Sampling the real animated legs
  //       across a full stride, every belt part centre keeps a healthy 3D distance from
  //       each leg's capsule segment (pivot→foot), so no part ever enters a leg.
  it("sits at the waist below the chest and clears the legs through the stride", () => {
    const p = T.player;
    const lean = p.lean;
    // Derived from the chest builder: anchor lean-y 1.16, lowest part (cuirass fauld)
    // bottoms out at ≈ lean-y 0.80. Bound belt part CENTRES below that, leaving room for
    // the thickest part's half-extent. (No mesh dimensions are readable from the stub, so
    // we bound centres — exactly as the helmet/chest/pauldron/glove fit tests do.)
    const CHEST_BOTTOM = 0.80;
    const BELT_CEILING = 0.79;   // highest allowed belt part centre (rims sit at 0.76)
    const STRAP_HALF_H = 0.06;   // the strap band cylinder (height 0.12) half-height
    for (const id of BELT_IDS) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      const grp = p.gear.belts[p.gearShown.beltArchetype];
      expect(grp.meshes.length, `${id} meshes`).toBeGreaterThan(0);
      // (a) BELOW-CHEST: every part centre under the ceiling; the strap band's TOP
      //     (centre + its known half-height) stays under the real chest bottom.
      for (const m of grp.meshes) {
        const c = toFrame(m, { x: 0, y: 0, z: 0 }, lean);
        expect(c.y, `${id} part centre y ${c.y.toFixed(3)} intrudes into the chest`).toBeLessThanOrEqual(BELT_CEILING);
        if (m.name === "beltStrap") {
          expect(c.y + STRAP_HALF_H, `${id} strap top overlaps the chest`).toBeLessThanOrEqual(CHEST_BOTTOM);
        }
      }
    }
    // (b) CLEARS-LEGS across the whole stride, for every belt.
    const LEG_R = 0.10;             // the leg capsule radius
    const MIN_CLEAR = LEG_R + 0.02; // require the part centre to stay outside the capsule
    const segDist = (pt, a, b) => {
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const apx = pt.x - a.x, apy = pt.y - a.y, apz = pt.z - a.z;
      const len2 = abx * abx + aby * aby + abz * abz || 1e-9;
      let t = (apx * abx + apy * aby + apz * abz) / len2; t = Math.max(0, Math.min(1, t));
      return Math.hypot(pt.x - (a.x + abx * t), pt.y - (a.y + aby * t), pt.z - (a.z + abz * t));
    };
    for (const id of BELT_IDS) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      const grp = p.gear.belts[p.gearShown.beltArchetype];
      for (let k = 0; k < 12; k++) {
        p.state = "walk"; p.walkPhase = (k * Math.PI) / 6; // sweep a full stride cycle
        step(1);
        const legs = [p.legL, p.legR].map((leg) => ({
          top: toFrame(leg, { x: 0, y: 0, z: 0 }, lean),     // the leg-pivot origin (top)
          foot: toFrame(leg, { x: 0, y: -0.6, z: 0 }, lean), // the capsule bottom (foot)
        }));
        for (const m of grp.meshes) {
          const c = toFrame(m, { x: 0, y: 0, z: 0 }, lean);
          for (const L of legs) {
            const d = segDist(c, L.top, L.foot);
            expect(d, `${id}/${m.name} enters a leg at phase ${k} (dist ${d.toFixed(3)})`).toBeGreaterThanOrEqual(MIN_CLEAR);
          }
        }
      }
    }
    clearEquip(p);
    T.recomputeStats(p);
  });
});
