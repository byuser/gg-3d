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
    expect(g.pauls && g.belt && g.cloaks).toBeTruthy();
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
    const refs = [p.gear.helmet, p.gear.chest, p.gear.cloaks.cape.node, p.gear.boots.shoe.nodes[0], p.gear.pauls.plated.nodes[1]];
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
      p.gear.cloaks.cape.node,
      p.gear.boots.shoe.nodes[0],
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

describe("Task 30 — worn boots: distinct archetype per item + on-leg / no-ground-clip fit", () => {
  const BOOT_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "boots");
  const VALID_ARCH = ["shoe", "boot", "greave", "sabaton", "warboot"];
  const VALID_MAT = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];

  it("maps every boots def to a valid archetype + material", () => {
    expect(BOOT_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of BOOT_IDS) {
      const a = T.bootArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("gives the shipped boots distinct, on-theme archetypes", () => {
    const pick = (id) => T.bootArchetype(T.getDef(id));
    expect(pick("leather_boots")).toMatchObject({ archetype: "shoe", material: "leather" });
    expect(pick("iron_greaves")).toMatchObject({ archetype: "greave", material: "iron" });
    expect(pick("winged_boots")).toMatchObject({ archetype: "boot", material: "leather" });
    // A soft shoe and a plated greave must NOT look identical.
    expect(pick("leather_boots").archetype).not.toBe(pick("iron_greaves").archetype);
    // The three shipped boots use three distinct silhouettes.
    const used = new Set(BOOT_IDS.map((id) => pick(id).archetype));
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("shares the set motif with the matching chest + pauldrons + gloves + belt + helmet (a full suit reads as one)", () => {
    // Ironguard: iron greaves ↔ cuirass chest ↔ plated shoulders ↔ iron gauntlets ↔ iron belt (same iron).
    expect(T.bootArchetype(T.getDef("iron_greaves")).material)
      .toBe(T.chestArchetype(T.getDef("iron_plate")).material);
    expect(T.bootArchetype(T.getDef("iron_greaves")).material)
      .toBe(T.gloveArchetype(T.getDef("iron_gauntlets")).material);
    expect(T.bootArchetype(T.getDef("iron_greaves")).material)
      .toBe(T.beltArchetype(T.getDef("reinforced_belt")).material);
    // Dragonscale inference shares the dragonscale material with the rest of the suit.
    expect(T.bootArchetype({ type: "boots", rarity: "rare", set: "dragonscale" }).material)
      .toBe(T.helmetArchetype(T.getDef("dragon_helm")).material);
    expect(T.bootArchetype({ type: "boots", rarity: "rare", set: "dragonscale" }).material)
      .toBe(T.pauldronArchetype(T.getDef("dragon_pauldrons")).material);
  });

  it("is pure + total: infers a valid pair for boots with no `boot` block", () => {
    // Set-driven inference (Dragonscale → scaled sabaton, Ironguard → plated greave).
    expect(T.bootArchetype({ type: "boots", rarity: "rare", set: "dragonscale" }))
      .toMatchObject({ archetype: "sabaton", material: "dragonscale" });
    expect(T.bootArchetype({ type: "boots", rarity: "normal", set: "ironguard" }))
      .toMatchObject({ archetype: "greave", material: "iron" });
    // Rarity fallbacks (legendary/epic → warboot; rare → boot; normal → shoe).
    expect(T.bootArchetype({ type: "boots", rarity: "legendary" }).archetype).toBe("warboot");
    expect(T.bootArchetype({ type: "boots", rarity: "epic" }).archetype).toBe("warboot");
    expect(T.bootArchetype({ type: "boots", rarity: "rare" }).archetype).toBe("boot");
    expect(T.bootArchetype({ type: "boots", rarity: "normal" }).archetype).toBe("shoe");
    // Materials follow rarity when there's no set (legendary → gold, epic/rare → steel).
    expect(T.bootArchetype({ type: "boots", rarity: "legendary" }).material).toBe("gold");
    expect(T.bootArchetype({ type: "boots", rarity: "epic" }).material).toBe("steel");
    // An explicit block wins over inference.
    expect(T.bootArchetype({ type: "boots", rarity: "rare", boot: { archetype: "warboot", material: "gold" } }))
      .toMatchObject({ archetype: "warboot", material: "gold" });
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { boot: { archetype: "xx", material: "plastic" } }]) {
      const a = T.bootArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.bootArchetype(T.getDef("winged_boots"))).toEqual(T.bootArchetype(T.getDef("winged_boots")));
  });

  it("pre-builds every boot archetype group once on BOTH legs (headless-safe)", () => {
    const g = T.player.gear;
    expect(g.boots).toBeTruthy();
    expect(Object.keys(g.boots).sort()).toEqual(["boot", "greave", "sabaton", "shoe", "warboot"]);
    for (const k in g.boots) {
      const grp = g.boots[k];
      expect(grp.nodes.length, k).toBe(2); // one per leg
      expect(grp.mats.length, k).toBeGreaterThan(0);
      expect(grp.meshes.length, k).toBeGreaterThan(0);
      // Each leg group hangs off the matching leg pivot (built once, never realloc).
      expect(grp.nodes[0].parent).toBe(T.player.legL);
      expect(grp.nodes[1].parent).toBe(T.player.legR);
    }
  });

  it("keeps boots in the core silhouette (always built) with tier-gated trims", () => {
    // Boots are core (always built like gloves/cloak); only the finer trims gate on low.
    expect(T.wornDetailFor("low").boots).toBe(true);
    expect(T.wornDetailFor("low").bootDetail).toBe(false);
    expect(T.wornDetailFor("high").boots).toBe(true);
    expect(T.wornDetailFor("high").bootDetail).toBe(true);
  });

  it("shows exactly the equipped boot's archetype (and nothing when bare)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = { leather_boots: "shoe", iron_greaves: "greave", winged_boots: "boot" };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.boots, id).toBe(true);
      expect(p.gearShown.bootArchetype, id).toBe(map[id]);
      // Exactly that archetype pair (both legs) is enabled; the rest are hidden.
      for (const k in p.gear.boots) {
        for (const n of p.gear.boots[k].nodes) {
          expect(n.isEnabled(), `${id}/${k}`).toBe(k === map[id]);
        }
      }
      T.unequipSlot(p, "boots");
      T.recomputeStats(p);
    }
    expect(p.gearShown.boots).toBe(false);
    expect(p.gearShown.bootArchetype).toBe(null);
  });

  it("never reallocates the boot meshes across equip churn (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const shoeNodes = p.gear.boots.shoe.nodes.slice();
    const greaveNodes = p.gear.boots.greave.nodes.slice();
    const meshCount = Object.values(p.gear.boots).reduce((n, grp) => n + grp.meshes.length, 0);
    for (let i = 0; i < 10; i++) {
      for (const id of ["leather_boots", "iron_greaves", "winged_boots"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow(); // the legs animate each frame
      }
      T.unequipSlot(p, "boots");
      T.recomputeStats(p);
    }
    // Same archetype nodes + total mesh count throughout — nothing was rebuilt.
    expect(p.gear.boots.shoe.nodes).toEqual(shoeNodes);
    expect(p.gear.boots.greave.nodes).toEqual(greaveNodes);
    expect(Object.values(p.gear.boots).reduce((n, grp) => n + grp.meshes.length, 0)).toBe(meshCount);
  });

  // THE fit invariant: the boot must HUG the leg + foot (no floating off, no climbing
  // the thigh) and, through the full stride, must NOT clip the ground any worse than the
  // existing feet. Two structural bounds on the emitted geometry (re-derived if the
  // builder's offsets ever change):
  //   (a) ON-LEG ENVELOPE (pose-independent, since the boot is rigidly parented to the
  //       leg): every boot part CENTRE, transformed into LEG-LOCAL space, stays within
  //       the shoe's footprint (|x| ≤ 0.17, z within the foot depth) and between the sole
  //       and mid-shin (leg-local y in [−0.70, −0.25]) — so it wraps the leg without
  //       floating off or riding up the thigh.
  //   (b) NO GROUND CLIP across the stride: the leg swing only ever RAISES the foot, so
  //       the risk is a forward part dipping when the leg swings forward. Sampling the
  //       real stride angles (the game's own leg swing, up to ≈ ±1.08 rad at full speed)
  //       and comparing in LEAN space, every boot part CENTRE stays at/above that leg's
  //       existing SHOE floor (its lowest bottom corner) — i.e. the boot never reaches
  //       below the feet it rides on, so it can't punch through the ground.
  it("hugs the leg + foot and never clips the ground through the full stride", () => {
    const p = T.player;
    const lean = p.lean;
    // (a) ON-LEG ENVELOPE — pose-independent (leg-local), for every boot.
    const X_MAX = 0.17;           // stays within the foot half-width (+ cuff flare)
    const Z_MIN = -0.18, Z_MAX = 0.28; // stays within the foot depth (heel..toe)
    const Y_FLOOR = -0.70, Y_CEIL = -0.25; // from the sole up to just above mid-shin
    for (const id of BOOT_IDS) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      const grp = p.gear.boots[p.gearShown.bootArchetype];
      expect(grp.meshes.length, `${id} meshes`).toBeGreaterThan(0);
      for (const node of grp.nodes) {          // both legs (identical geometry)
        const leg = node.parent;               // the boot sits on the leg pivot
        const meshes = grp.meshes.filter((m) => {
          let n = m; while (n) { if (n === node) return true; n = n.parent; } return false;
        });
        expect(meshes.length, `${id} leg meshes`).toBeGreaterThan(0);
        for (const m of meshes) {
          const c = toFrame(m, { x: 0, y: 0, z: 0 }, leg); // part centre in leg-local space
          expect(Math.abs(c.x), `${id}/${m.name} x ${c.x.toFixed(3)} off the foot`).toBeLessThanOrEqual(X_MAX);
          expect(c.z, `${id}/${m.name} z ${c.z.toFixed(3)} behind the heel`).toBeGreaterThanOrEqual(Z_MIN);
          expect(c.z, `${id}/${m.name} z ${c.z.toFixed(3)} past the toe`).toBeLessThanOrEqual(Z_MAX);
          expect(c.y, `${id}/${m.name} y ${c.y.toFixed(3)} below the sole`).toBeGreaterThanOrEqual(Y_FLOOR);
          expect(c.y, `${id}/${m.name} y ${c.y.toFixed(3)} climbs the thigh`).toBeLessThanOrEqual(Y_CEIL);
        }
      }
    }
    // (b) NO GROUND CLIP across the whole stride, for every boot. Drive the leg pivots
    //     directly through the game's own swing range (independent of update()), and
    //     compare each boot part centre to that leg's existing shoe floor in the SAME pose.
    const SWING = 0.8 * (0.35 + 1); // the game's max leg swing (sin·0.8·(0.35+speed), speed≤1)
    // The existing shoe box (leg-local centre (0,−0.62,+0.06), 0.22×0.14×0.34) → its four
    // bottom corners; the lowest in lean space is the "foot floor" the boot must ride on.
    const SHOE_CORNERS = [];
    for (const sx of [-0.11, 0.11]) for (const sz of [-0.11, 0.23]) SHOE_CORNERS.push({ x: sx, y: -0.69, z: sz });
    const restX = { legL: p.legL.rotation.x, legR: p.legR.rotation.x };
    const TOL = 0.02;
    for (const id of BOOT_IDS) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      const grp = p.gear.boots[p.gearShown.bootArchetype];
      for (let k = 0; k <= 24; k++) {
        const theta = Math.sin((k * Math.PI) / 12) * SWING; // sweep a full stride cycle
        p.legL.rotation.x = theta; p.legR.rotation.x = theta; // test both legs at every angle
        for (const node of grp.nodes) {
          const leg = node.parent;
          // this leg's shoe floor (lowest bottom corner) in lean space, in the same pose
          let shoeFloor = Infinity;
          for (const corner of SHOE_CORNERS) shoeFloor = Math.min(shoeFloor, toFrame(leg, corner, lean).y);
          const meshes = grp.meshes.filter((m) => {
            let n = m; while (n) { if (n === node) return true; n = n.parent; } return false;
          });
          for (const m of meshes) {
            const c = toFrame(m, { x: 0, y: 0, z: 0 }, lean);
            expect(
              c.y,
              `${id}/${m.name} dips below the foot (ground clip) at swing ${theta.toFixed(2)} — ${c.y.toFixed(3)} < ${shoeFloor.toFixed(3)}`,
            ).toBeGreaterThanOrEqual(shoeFloor - TOL);
          }
        }
      }
    }
    p.legL.rotation.x = restX.legL; p.legR.rotation.x = restX.legR;
    clearEquip(p);
    T.recomputeStats(p);
  });
});

describe("Task 31 — worn cloaks: distinct archetype per item + billow that stays behind the legs", () => {
  const CLOAK_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "cloak");
  const VALID_ARCH = ["cape", "mantle", "scaled", "regal", "winged"];
  const VALID_MAT = ["leather", "cloth", "iron", "steel", "gold", "dragonscale"];

  it("maps every cloak def to a valid archetype + material", () => {
    expect(CLOAK_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of CLOAK_IDS) {
      const a = T.cloakArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("gives the shipped cloaks distinct, on-theme archetypes", () => {
    const pick = (id) => T.cloakArchetype(T.getDef(id));
    expect(pick("travel_cloak")).toMatchObject({ archetype: "cape", material: "leather" });
    expect(pick("dragon_cloak")).toMatchObject({ archetype: "scaled", material: "dragonscale" });
    expect(pick("wings_of_dawn")).toMatchObject({ archetype: "winged", material: "gold" });
    // A plain cape and a dragonscale cloak must NOT look identical.
    expect(pick("travel_cloak").archetype).not.toBe(pick("dragon_cloak").archetype);
    // The shipped cloaks span at least three distinct silhouettes.
    const used = new Set(CLOAK_IDS.map((id) => pick(id).archetype));
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("shares the set motif with the matching suit (a Dragonscale cloak reads as one)", () => {
    // Dragonscale: the cloak's dragonscale material matches the rest of the suit.
    expect(T.cloakArchetype(T.getDef("dragon_cloak")).material)
      .toBe(T.bootArchetype({ type: "boots", rarity: "rare", set: "dragonscale" }).material);
    expect(T.cloakArchetype(T.getDef("dragon_cloak")).material)
      .toBe(T.helmetArchetype(T.getDef("dragon_helm")).material);
    // Inference from a bare dragonscale cloak also lands on the scaled dragonscale drape.
    expect(T.cloakArchetype({ type: "cloak", rarity: "rare", set: "dragonscale" }))
      .toMatchObject({ archetype: "scaled", material: "dragonscale" });
  });

  it("is pure + total: infers a valid pair for cloaks with no `cloak` block", () => {
    // Rarity fallbacks (legendary → winged, epic → regal, rare → mantle, else cape).
    expect(T.cloakArchetype({ type: "cloak", rarity: "legendary" }).archetype).toBe("winged");
    expect(T.cloakArchetype({ type: "cloak", rarity: "epic" }).archetype).toBe("regal");
    expect(T.cloakArchetype({ type: "cloak", rarity: "rare" }).archetype).toBe("mantle");
    expect(T.cloakArchetype({ type: "cloak", rarity: "normal" }).archetype).toBe("cape");
    // Materials follow rarity when there's no set (legendary → gold, epic/rare → steel).
    expect(T.cloakArchetype({ type: "cloak", rarity: "legendary" }).material).toBe("gold");
    expect(T.cloakArchetype({ type: "cloak", rarity: "epic" }).material).toBe("steel");
    // An explicit block wins over inference.
    expect(T.cloakArchetype({ type: "cloak", rarity: "rare", cloak: { archetype: "winged", material: "gold" } }))
      .toMatchObject({ archetype: "winged", material: "gold" });
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { cloak: { archetype: "zz", material: "plastic" } }]) {
      const a = T.cloakArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.cloakArchetype(T.getDef("shadow_cloak"))).toEqual(T.cloakArchetype(T.getDef("shadow_cloak")));
  });

  it("pre-builds every cloak archetype group once under the shared back pivot (headless-safe)", () => {
    const g = T.player.gear;
    expect(g.cloaks).toBeTruthy();
    expect(Object.keys(g.cloaks).sort()).toEqual(["cape", "mantle", "regal", "scaled", "winged"]);
    expect(T.player.cloakPivot).toBeTruthy();
    for (const k in g.cloaks) {
      const grp = g.cloaks[k];
      expect(grp.node, k).toBeTruthy();
      expect(grp.mats.length, k).toBeGreaterThan(0);
      expect(grp.meshes.length, k).toBeGreaterThan(0);
      // Every group hangs off the shared pivot (built once, never realloc).
      expect(grp.node.parent).toBe(T.player.cloakPivot);
    }
  });

  it("keeps the cloak in the core silhouette (always built) with tier-gated sway/trims", () => {
    // Cloak is core (always built like the gloves/boots); the per-frame billow + finer
    // folds are what gate on the low tier.
    expect(T.wornDetailFor("low").cloak).toBe(true);
    expect(T.wornDetailFor("low").cloakSway).toBe(false);
    expect(T.wornDetailFor("high").cloak).toBe(true);
    expect(T.wornDetailFor("high").cloakSway).toBe(true);
  });

  it("shows exactly the equipped cloak's archetype (and nothing when bare)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = { travel_cloak: "cape", dragon_cloak: "scaled", wings_of_dawn: "winged", shadow_cloak: "mantle" };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.cloak, id).toBe(true);
      expect(p.gearShown.cloakArchetype, id).toBe(map[id]);
      expect(p.cloakPivot.isEnabled(), `${id} pivot`).toBe(true);
      // Exactly that archetype group is enabled; the rest are hidden.
      for (const k in p.gear.cloaks) {
        expect(p.gear.cloaks[k].node.isEnabled(), `${id}/${k}`).toBe(k === map[id]);
      }
      T.unequipSlot(p, "cloak");
      T.recomputeStats(p);
    }
    expect(p.gearShown.cloak).toBe(false);
    expect(p.gearShown.cloakArchetype).toBe(null);
    expect(p.cloakPivot.isEnabled()).toBe(false);
  });

  it("never reallocates the cloak meshes across equip churn (no leak)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const capeNode = p.gear.cloaks.cape.node;
    const scaledNode = p.gear.cloaks.scaled.node;
    const meshCount = Object.values(p.gear.cloaks).reduce((n, grp) => n + grp.meshes.length, 0);
    for (let i = 0; i < 10; i++) {
      for (const id of ["travel_cloak", "dragon_cloak", "wings_of_dawn"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow(); // the cloak billows each frame
      }
      T.unequipSlot(p, "cloak");
      T.recomputeStats(p);
    }
    expect(p.gear.cloaks.cape.node).toBe(capeNode);
    expect(p.gear.cloaks.scaled.node).toBe(scaledNode);
    expect(Object.values(p.gear.cloaks).reduce((n, grp) => n + grp.meshes.length, 0)).toBe(meshCount);
  });

  // The billow updater is PURE + dt-driven + pause-correct + frame-rate independent, and
  // CLAMPED so the drape only ever trails behind (x ≥ 0 — never forward through the legs).
  it("billows via a pure, clamped, frame-rate-independent updater", () => {
    const S = T.CLOAK_SWAY;
    const step1 = (cur, moving, phase, turn, dt) => T.cloakBillowStep(cur, moving, phase, turn, dt);
    // (a) NEVER forward: across every input the next x stays in [xMin≥0, xMax] and z in ±zMax.
    expect(S.xMin).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 400; i++) {
      const cur = { x: (Math.random() * 2 - 1) * 2, z: (Math.random() * 2 - 1) * 2 }; // even from a wild state
      const moving = i % 2 === 0;
      const phase = Math.random() * 20;
      const turn = (Math.random() * 2 - 1) * 40; // huge turn rates included
      // Drive to convergence, then the value must sit inside the clamp cone.
      let v = cur;
      for (let k = 0; k < 200; k++) v = step1(v, moving, phase, turn, 0.016);
      expect(v.x, `x@${i}`).toBeGreaterThanOrEqual(S.xMin - 1e-9);
      expect(v.x, `x@${i}`).toBeLessThanOrEqual(S.xMax + 1e-9);
      expect(Math.abs(v.z), `z@${i}`).toBeLessThanOrEqual(S.zMax + 1e-9);
    }
    // (b) PURE: same inputs ⇒ same output; no mutation of the passed-in state object.
    const cur = { x: 0.1, z: -0.05 };
    const a = step1(cur, true, 1.2, 0.3, 0.016);
    const b = step1({ x: 0.1, z: -0.05 }, true, 1.2, 0.3, 0.016);
    expect(a).toEqual(b);
    expect(cur).toEqual({ x: 0.1, z: -0.05 }); // input untouched
    // (c) PAUSE-CORRECT: dt = 0 ⇒ no drift toward the target (freezes exactly).
    const frozen = step1({ x: 0.2, z: 0.1 }, true, 3, 0.5, 0);
    expect(frozen.x).toBeCloseTo(0.2, 6);
    expect(frozen.z).toBeCloseTo(0.1, 6);
    // (d) FRAME-RATE INDEPENDENT: one 32ms step ≈ two 16ms steps toward the same target
    //     (exponential damping composes), so the look doesn't change with the frame rate.
    const start = { x: 0, z: 0 };
    const big = step1(start, true, 0, 0, 0.032);
    let small = start;
    small = step1(small, true, 0, 0, 0.016);
    small = step1(small, true, 0, 0, 0.016);
    expect(big.x).toBeCloseTo(small.x, 6);
    // (e) It actually MOVES when driven (a live billow, not a no-op).
    let live = { x: 0, z: 0 };
    for (let k = 0; k < 60; k++) live = step1(live, true, Math.PI / 2, 0, 0.016);
    expect(live.x).toBeGreaterThan(0.2); // trailed back on the move
  });

  // THE fit invariant: the cloak must DRAPE BEHIND the legs and never scythe through them.
  // Structural, pose-swept bound on the emitted geometry: seated on a back pivot at
  // lean-local (0, 1.5, −0.3) with the billow clamped to x ∈ [0, xMax] (never forward) and
  // z ∈ ±zMax, EVERY cloak part centre — swept across the entire clamped sway range — stays
  // BEHIND the leg envelope (lean-z ≤ Z_BEHIND, comfortably behind the legs whose rear sits
  // near lean-z −0.1) and ABOVE the feet (lean-y ≥ Y_FLOOR, so the hem never reaches the
  // ankles/ground). Re-derive the bounds if the pivot seat or clamps ever change.
  it("drapes behind the legs and above the feet across the whole sway range", () => {
    const p = T.player;
    const lean = p.lean;
    const S = T.CLOAK_SWAY;
    const Z_BEHIND = -0.15; // strictly behind the leg column's rear (~ −0.1 at the hip)
    const Y_FLOOR = 0.32;   // stays around/above the knees — never down at the feet (~0.08)
    const pivotRest = { x: p.cloakPivot.rotation.x, z: p.cloakPivot.rotation.z };
    for (const id of CLOAK_IDS) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      const grp = p.gear.cloaks[p.gearShown.cloakArchetype];
      expect(grp && grp.meshes.length, `${id} meshes`).toBeGreaterThan(0);
      // Sweep the full clamped sway cone: x from xMin..xMax, z from −zMax..zMax.
      for (let xi = 0; xi <= 6; xi++) {
        for (let zi = 0; zi <= 6; zi++) {
          p.cloakPivot.rotation.x = S.xMin + ((S.xMax - S.xMin) * xi) / 6;
          p.cloakPivot.rotation.z = -S.zMax + (2 * S.zMax * zi) / 6;
          for (const m of grp.meshes) {
            const c = toFrame(m, { x: 0, y: 0, z: 0 }, lean); // part centre in lean space
            expect(
              c.z,
              `${id}/${m.name} z ${c.z.toFixed(3)} not behind the legs at sway x=${p.cloakPivot.rotation.x.toFixed(2)} z=${p.cloakPivot.rotation.z.toFixed(2)}`,
            ).toBeLessThanOrEqual(Z_BEHIND);
            expect(
              c.y,
              `${id}/${m.name} y ${c.y.toFixed(3)} dips toward the feet at sway x=${p.cloakPivot.rotation.x.toFixed(2)}`,
            ).toBeGreaterThanOrEqual(Y_FLOOR);
          }
        }
      }
    }
    p.cloakPivot.rotation.x = pivotRest.x; p.cloakPivot.rotation.z = pivotRest.z;
    clearEquip(p);
    T.recomputeStats(p);
  });
});

describe("Task 32 — held weapons: real wand / bow / staff / sword / axe / dagger in hand", () => {
  const WEAPON_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "weapon");
  const VALID_ARCH = ["sword", "axe", "dagger", "bow", "staff", "wand"];
  const VALID_MAT = ["wood", "iron", "steel", "gold", "crystal", "dragonscale"];
  const ONE_HANDED = ["sword", "axe", "dagger", "wand"]; // classes that can ride the off hand

  it("maps every weapon def to a valid class + material", () => {
    expect(WEAPON_IDS.length).toBeGreaterThanOrEqual(6);
    for (const id of WEAPON_IDS) {
      const a = T.weaponArchetype(T.getDef(id));
      expect(VALID_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
    }
  });

  it("infers each real weapon CLASS from how it fights (the 6 normals span all 6 classes)", () => {
    const pick = (id) => T.weaponArchetype(T.getDef(id)).archetype;
    // The six buyable weapons are one of each class — the reference set.
    expect(pick("magic_wand")).toBe("wand");        // 1H ranged bolt
    expect(pick("short_bow")).toBe("bow");          // 2H ranged arrow
    expect(pick("apprentice_staff")).toBe("staff"); // 2H ranged bolt
    expect(pick("iron_dagger")).toBe("dagger");     // fast short 1H melee
    expect(pick("iron_sword")).toBe("sword");       // balanced 1H melee
    expect(pick("war_axe")).toBe("axe");            // heavy wide-arc melee
    // Every class is distinct — no two of the six collapse to one silhouette.
    const classes = new Set(["magic_wand", "short_bow", "apprentice_staff", "iron_dagger", "iron_sword", "war_axe"].map(pick));
    expect(classes.size).toBe(6);
    // Higher-rarity weapons still land on the right class by mechanics.
    expect(pick("excalibur")).toBe("sword");     // 2H greatsword
    expect(pick("twin_fang")).toBe("dagger");    // blistering fast jabs
    expect(pick("thunder_hammer")).toBe("axe");  // crushing wide arc (haft + head)
    expect(pick("astral_bow")).toBe("bow");
    expect(pick("sunfire_staff")).toBe("staff");
    expect(pick("archmage_wand")).toBe("wand");
  });

  it("varies the material by rarity (iron → steel → gold → dragonscale)", () => {
    const mat = (id) => T.weaponArchetype(T.getDef(id)).material;
    expect(mat("iron_sword")).toBe("iron");        // normal
    expect(mat("excalibur")).toBe("steel");        // rare
    expect(mat("void_scythe")).toBe("gold");       // epic
    expect(mat("world_ender")).toBe("dragonscale");// legendary
    // Pure rarity fallbacks (no def needed).
    expect(T.weaponArchetype({ weapon: { melee: {} }, rarity: "legendary" }).material).toBe("dragonscale");
    expect(T.weaponArchetype({ weapon: { melee: {} }, rarity: "epic" }).material).toBe("gold");
    expect(T.weaponArchetype({ weapon: { melee: {} }, rarity: "rare" }).material).toBe("steel");
    expect(T.weaponArchetype({ weapon: { melee: {} }, rarity: "normal" }).material).toBe("iron");
  });

  it("is pure + total: infers a valid pair for any weapon, honours an explicit block, clamps junk", () => {
    // Ranged class inference: arrow → bow; bolt → staff (2H) or wand (1H).
    expect(T.weaponClassOf({ weapon: { ranged: true, shape: "arrow" }, hands: 2 })).toBe("bow");
    expect(T.weaponClassOf({ weapon: { ranged: true, shape: "bolt" }, hands: 2 })).toBe("staff");
    expect(T.weaponClassOf({ weapon: { ranged: true, shape: "bolt" }, hands: 1 })).toBe("wand");
    // Melee class inference: fast+short 1H → dagger; wide arc → axe; else sword.
    expect(T.weaponClassOf({ weapon: { melee: { range: 2.2, arc: 1.3 }, cooldown: 0.2 }, hands: 1 })).toBe("dagger");
    expect(T.weaponClassOf({ weapon: { melee: { arc: 2.5 }, cooldown: 0.7 }, hands: 1 })).toBe("axe");
    expect(T.weaponClassOf({ weapon: { melee: { range: 3.2, arc: 1.7 }, cooldown: 0.45 }, hands: 1 })).toBe("sword");
    // An explicit `held` block wins over inference (both fields).
    expect(T.weaponArchetype({ weapon: { melee: {} }, rarity: "normal", held: { archetype: "axe", material: "gold" } }))
      .toMatchObject({ archetype: "axe", material: "gold" });
    // Bogus / missing input clamps to a drawable pair (never throws, never invalid).
    for (const bad of [undefined, null, {}, { weapon: {}, held: { archetype: "zz", material: "plastic" } }]) {
      const a = T.weaponArchetype(bad);
      expect(VALID_ARCH.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
    }
    // Deterministic (same def ⇒ same pair).
    expect(T.weaponArchetype(T.getDef("iron_sword"))).toEqual(T.weaponArchetype(T.getDef("iron_sword")));
  });

  it("pre-builds every weapon class once under the main grip (+ 1H classes under the off grip), headless-safe", () => {
    const p = T.player;
    expect(p.heldWeapons).toBeTruthy();
    expect(Object.keys(p.heldWeapons).sort()).toEqual(["axe", "bow", "dagger", "staff", "sword", "wand"]);
    expect(p.wandGrip.parent).toBe(p.armR);
    expect(p.offGrip.parent).toBe(p.armL);
    for (const k in p.heldWeapons) {
      const grp = p.heldWeapons[k];
      expect(grp.node, k).toBeTruthy();
      expect(grp.node.parent, k).toBe(p.wandGrip);       // rides the main hand
      expect(grp.tip.parent, k).toBe(grp.node);          // trail/muzzle anchor under the group
      expect(grp.mats.length, k).toBeGreaterThan(0);
      expect(grp.meshes.length, k).toBeGreaterThan(0);   // a real layered mesh, not one box
      expect(grp.meshes.length, `${k} is layered`).toBeGreaterThanOrEqual(3);
    }
    // Exactly the four one-handed classes are mirrored under the off grip (for dual-wield).
    expect(Object.keys(p.heldOffWeapons).sort()).toEqual(ONE_HANDED.slice().sort());
    for (const k in p.heldOffWeapons) expect(p.heldOffWeapons[k].node.parent).toBe(p.offGrip);
  });

  it("keeps the weapon in the core silhouette (always built) with tier-gated trims", () => {
    // The held weapon is core (always built); only the finer trims gate on the low tier.
    expect(T.wornDetailFor("low").weaponDetail).toBe(false);
    expect(T.wornDetailFor("high").weaponDetail).toBe(true);
  });

  it("shows exactly the equipped weapon's class (and bare hands when none is held)", () => {
    const p = T.player;
    const map = {
      magic_wand: "wand", short_bow: "bow", apprentice_staff: "staff",
      iron_dagger: "dagger", iron_sword: "sword", war_axe: "axe",
    };
    for (const id in map) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      expect(p.weaponShown.main, id).toBe(map[id]);
      // Exactly that class is enabled in the main hand; every other class is hidden.
      for (const k in p.heldWeapons) {
        expect(p.heldWeapons[k].node.isEnabled(), `${id}/${k}`).toBe(k === map[id]);
      }
      // A single (non-dual) weapon shows nothing in the off hand.
      for (const k in p.heldOffWeapons) expect(p.heldOffWeapons[k].node.isEnabled(), `${id}/off/${k}`).toBe(false);
    }
    // Bare-handed (fists): no weapon mesh shows at all.
    clearEquip(p);
    T.recomputeStats(p);
    expect(p.weaponShown.main).toBe(null);
    for (const k in p.heldWeapons) expect(p.heldWeapons[k].node.isEnabled(), `bare/${k}`).toBe(false);
  });

  it("shows a second weapon in the off hand only when dual-wielding two one-handers", () => {
    const p = T.player;
    // Two one-handed melee weapons → main in the right hand, off-hand in the left.
    clearEquip(p);
    T.equipItem(p, T.makeItem("iron_dagger")); // → hand1
    T.equipItem(p, T.makeItem("iron_sword"));  // → hand2
    expect(p.weaponShown.main).toBe("dagger");
    expect(p.weaponShown.off).toBe("sword");
    expect(p.heldWeapons.dagger.node.isEnabled()).toBe(true);
    expect(p.heldOffWeapons.sword.node.isEnabled()).toBe(true);
    // A two-handed weapon fills both hands → one centred weapon, nothing extra off-hand.
    clearEquip(p);
    T.equipItem(p, T.makeItem("short_bow")); // 2H
    expect(p.weaponShown.main).toBe("bow");
    expect(p.weaponShown.off).toBe(null);
    for (const k in p.heldOffWeapons) expect(p.heldOffWeapons[k].node.isEnabled(), `2H/off/${k}`).toBe(false);
    clearEquip(p);
    T.recomputeStats(p);
  });

  it("keeps a valid muzzle: ranged weapons launch bolts/arrows from the weapon's tip", () => {
    const p = T.player;
    // The bolt/arrow origin (this.wandTip) is a live node repositioned to the active
    // ranged weapon's tip; tryCast() reads it, so it must always be present + placed.
    for (const id of ["magic_wand", "apprentice_staff", "short_bow"]) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      expect(p.wandTip, id).toBeTruthy();
      const key = T.weaponArchetype(T.getDef(id)).archetype;
      // The shared muzzle sits at the active class's tip (copied in refreshWeaponVisual).
      expect(p.wandTip.position.y, `${id} tip`).toBeCloseTo(p.heldWeapons[key].tip.position.y, 6);
      // The hookable weapon-trail anchor (for Task 34) points at the active weapon's tip.
      expect(p.weaponTrailTip).toBe(p.heldWeapons[key].tip);
    }
    clearEquip(p);
    T.recomputeStats(p);
  });

  it("never reallocates the weapon meshes across equip churn (no leak) while attacking", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const swordNode = p.heldWeapons.sword.node;
    const bowNode = p.heldWeapons.bow.node;
    const offDagger = p.heldOffWeapons.dagger.node;
    const meshCount = Object.values(p.heldWeapons).reduce((n, grp) => n + grp.meshes.length, 0)
      + Object.values(p.heldOffWeapons).reduce((n, grp) => n + grp.meshes.length, 0);
    for (let i = 0; i < 8; i++) {
      for (const id of ["iron_sword", "war_axe", "short_bow", "apprentice_staff", "magic_wand", "iron_dagger"]) {
        T.equipItem(p, T.makeItem(id));
        p.attack.trigger(p.attackClass()); // fire an attack of the equipped class
        expect(() => step(2)).not.toThrow();                   // the weapon rides the hand each frame
      }
    }
    // Same node objects + total mesh count throughout — nothing was rebuilt.
    expect(p.heldWeapons.sword.node).toBe(swordNode);
    expect(p.heldWeapons.bow.node).toBe(bowNode);
    expect(p.heldOffWeapons.dagger.node).toBe(offDagger);
    expect(Object.values(p.heldWeapons).reduce((n, grp) => n + grp.meshes.length, 0)
      + Object.values(p.heldOffWeapons).reduce((n, grp) => n + grp.meshes.length, 0)).toBe(meshCount);
    clearEquip(p);
    T.recomputeStats(p);
  });

  // THE fit invariant: the weapon must be GRIPPED at the hand (a part in the fist, the
  // whole weapon bounded around the grip — never floating off) AND track the hand through
  // the attack WITHOUT detaching. Two structural bounds on the emitted geometry:
  //   (a) HELD ENVELOPE (grip-local, pose-independent since the weapon is rigidly parented
  //       to the grip): every part CENTRE stays within a compact box around the grip, and
  //       at least one part sits IN the fist (near the grip origin) — so the weapon is held,
  //       not detached or floating beside the hand.
  //   (b) NO DETACHMENT through the attack: the weapon tip's position in the ARM frame is
  //       invariant as the game drives the melee/ranged swing (the grip is a rigid child of
  //       the arm), so the weapon can never fly off the hand mid-attack.
  it("is gripped in the hand and tracks the hand through the attack without detaching", () => {
    const p = T.player;
    // (a) HELD ENVELOPE — grip-local bounds + a part in the fist, for every weapon class.
    const X_MAX = 0.6, Z_MIN = -0.35, Z_MAX = 0.55, Y_FLOOR = -0.8, Y_CEIL = 1.85;
    for (const id of WEAPON_IDS) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      const key = p.weaponShown.main;
      const grp = p.heldWeapons[key];
      expect(grp && grp.meshes.length, `${id} meshes`).toBeGreaterThan(0);
      let inFist = false;
      for (const m of grp.meshes) {
        const c = toFrame(m, { x: 0, y: 0, z: 0 }, p.wandGrip); // part centre in grip-local space
        expect(Math.abs(c.x), `${id}/${m.name} x ${c.x.toFixed(3)} off the hand`).toBeLessThanOrEqual(X_MAX);
        expect(c.z, `${id}/${m.name} z ${c.z.toFixed(3)} behind the hand`).toBeGreaterThanOrEqual(Z_MIN);
        expect(c.z, `${id}/${m.name} z ${c.z.toFixed(3)} ahead of the hand`).toBeLessThanOrEqual(Z_MAX);
        expect(c.y, `${id}/${m.name} y ${c.y.toFixed(3)} below the weapon`).toBeGreaterThanOrEqual(Y_FLOOR);
        expect(c.y, `${id}/${m.name} y ${c.y.toFixed(3)} above the weapon`).toBeLessThanOrEqual(Y_CEIL);
        if (Math.abs(c.x) <= 0.16 && Math.abs(c.z) <= 0.2 && c.y >= -0.35 && c.y <= 0.55) inFist = true;
      }
      expect(inFist, `${id} has a part gripped in the fist`).toBe(true);
    }
    // (b) NO DETACHMENT — the tip's ARM-frame position is invariant as the attack plays.
    for (const id of ["iron_sword", "war_axe", "magic_wand", "short_bow"]) {
      clearEquip(p);
      T.equipItem(p, T.makeItem(id));
      const grp = p.heldWeapons[p.weaponShown.main];
      const rest = toFrame(grp.tip, { x: 0, y: 0, z: 0 }, p.armR); // tip in the arm's frame at rest
      p.attack.trigger(p.attackClass());
      for (let f = 0; f < 6; f++) {
        step(1);
        const now = toFrame(grp.tip, { x: 0, y: 0, z: 0 }, p.armR);
        // Rigidly attached to the arm: the offset never changes → it can't detach mid-swing.
        expect(Math.abs(now.x - rest.x), `${id} tip x drift @${f}`).toBeLessThan(1e-6);
        expect(Math.abs(now.y - rest.y), `${id} tip y drift @${f}`).toBeLessThan(1e-6);
        expect(Math.abs(now.z - rest.z), `${id} tip z drift @${f}`).toBeLessThan(1e-6);
      }
    }
    clearEquip(p);
    T.recomputeStats(p);
  });
});

describe("Task 33 — visible jewelry: necklace + rings on the character", () => {
  const NECK_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "necklace");
  const RING_IDS = Object.keys(T.ITEM_DB).filter((id) => T.ITEM_DB[id].type === "ring");
  const NECK_ARCH = ["pendant", "amulet", "torc"];
  const RING_ARCH = ["band", "signet", "gemband"];
  const VALID_MAT = ["silver", "gold", "bronze", "dragonscale"];

  it("maps every jewelry def to a valid, type-appropriate archetype + material + gem", () => {
    expect(NECK_IDS.length).toBeGreaterThanOrEqual(2);
    expect(RING_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of NECK_IDS) {
      const a = T.jewelryArchetype(T.getDef(id));
      expect(a.kind, `${id} kind`).toBe("necklace");
      expect(NECK_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
      expect(typeof a.gem === "string" && a.gem[0] === "#", `${id} gem`).toBe(true);
    }
    for (const id of RING_IDS) {
      const a = T.jewelryArchetype(T.getDef(id));
      expect(a.kind, `${id} kind`).toBe("ring");
      expect(RING_ARCH.includes(a.archetype), `${id} archetype`).toBe(true);
      expect(VALID_MAT.includes(a.material), `${id} material`).toBe(true);
      expect(typeof a.gem === "string" && a.gem[0] === "#", `${id} gem`).toBe(true);
    }
  });

  it("gives the shipped jewelry distinct, on-theme archetypes + materials by rarity", () => {
    const pick = (id) => T.jewelryArchetype(T.getDef(id));
    // Necklaces: a normal pendant, a rare medallion amulet — visibly different shapes.
    expect(pick("amulet_vigor")).toMatchObject({ archetype: "pendant", material: "silver" });
    expect(pick("titan_pendant")).toMatchObject({ archetype: "amulet", material: "gold" });
    // Rings: a normal band, a rare signet, an epic claw-set gemband.
    expect(pick("ring_power")).toMatchObject({ archetype: "band", material: "silver" });
    expect(pick("vampiric_ring")).toMatchObject({ archetype: "signet", material: "gold" });
    expect(pick("seraph_ring")).toMatchObject({ archetype: "gemband", material: "gold" });
    // A plain band and a claw-set gemband must NOT look identical.
    expect(pick("ring_power").archetype).not.toBe(pick("seraph_ring").archetype);
    // At least two visually distinct silhouettes are actually in use per kind.
    expect(new Set(NECK_IDS.map((id) => pick(id).archetype)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(RING_IDS.map((id) => pick(id).archetype)).size).toBeGreaterThanOrEqual(2);
  });

  it("reuses the item's rarity colour for the gem — unless it carries a signature", () => {
    // Explicit `jewel.gem` signatures win (a Ring of Power's ruby, a Vigor amulet's green).
    expect(T.jewelryArchetype(T.getDef("ring_power")).gem).toBe("#ff6b6b");
    expect(T.jewelryArchetype(T.getDef("amulet_vigor")).gem).toBe("#7dff9e");
    // With no signature, the gem defaults to the RARITY colour (so the finish reads by rarity).
    expect(T.jewelryArchetype({ type: "ring", rarity: "rare" }).gem).toBe(T.RARITY.rare.color);
    expect(T.jewelryArchetype({ type: "necklace", rarity: "epic" }).gem).toBe(T.RARITY.epic.color);
  });

  it("is pure + total: infers a valid piece for any def, honours a `jewel` block, clamps junk", () => {
    // Rarity fallbacks (epic/legendary → the ornate top tier; rare → mid; else base).
    expect(T.jewelryArchetype({ type: "necklace", rarity: "legendary" }).archetype).toBe("torc");
    expect(T.jewelryArchetype({ type: "necklace", rarity: "epic" }).archetype).toBe("torc");
    expect(T.jewelryArchetype({ type: "necklace", rarity: "rare" }).archetype).toBe("amulet");
    expect(T.jewelryArchetype({ type: "necklace", rarity: "normal" }).archetype).toBe("pendant");
    expect(T.jewelryArchetype({ type: "ring", rarity: "epic" }).archetype).toBe("gemband");
    expect(T.jewelryArchetype({ type: "ring", rarity: "rare" }).archetype).toBe("signet");
    expect(T.jewelryArchetype({ type: "ring", rarity: "normal" }).archetype).toBe("band");
    // Material follows rarity when there's no explicit block.
    expect(T.jewelryArchetype({ type: "ring", rarity: "legendary" }).material).toBe("dragonscale");
    expect(T.jewelryArchetype({ type: "ring", rarity: "epic" }).material).toBe("gold");
    expect(T.jewelryArchetype({ type: "ring", rarity: "rare" }).material).toBe("gold");
    expect(T.jewelryArchetype({ type: "ring", rarity: "normal" }).material).toBe("silver");
    // An explicit block wins over inference (archetype + material + gem).
    expect(T.jewelryArchetype({ type: "ring", rarity: "normal", jewel: { archetype: "gemband", material: "dragonscale", gem: "#123456" } }))
      .toMatchObject({ archetype: "gemband", material: "dragonscale", gem: "#123456" });
    // Bogus / missing input clamps to a drawable piece (never throws, never invalid).
    for (const bad of [undefined, null, {}, { type: "ring", jewel: { archetype: "xx", material: "plastic", gem: 42 } }]) {
      const a = T.jewelryArchetype(bad);
      const list = a.kind === "ring" ? RING_ARCH : NECK_ARCH;
      expect(list.includes(a.archetype)).toBe(true);
      expect(VALID_MAT.includes(a.material)).toBe(true);
      expect(a.gem[0]).toBe("#");
    }
    // Deterministic (same def ⇒ same record).
    expect(T.jewelryArchetype(T.getDef("seraph_ring"))).toEqual(T.jewelryArchetype(T.getDef("seraph_ring")));
  });

  it("pre-builds every necklace archetype under one neck anchor + every ring on BOTH slots", () => {
    const g = T.player.gear;
    // Necklace: a single stable anchor + one group per archetype.
    expect(g.necklace).toBeTruthy();
    expect(Object.keys(g.necklaces).sort()).toEqual(["amulet", "pendant", "torc"]);
    for (const k in g.necklaces) {
      const grp = g.necklaces[k];
      expect(grp.mats.length, k).toBeGreaterThan(0);
      expect(grp.gemMats.length, k).toBeGreaterThan(0); // every piece has a stone
      expect(grp.meshes.length, k).toBeGreaterThan(0);
      expect(grp.node.parent).toBe(g.necklace);
    }
    // Rings: one set of archetype groups per slot, each riding its hand pivot.
    expect(Object.keys(g.rings).sort()).toEqual(["ring1", "ring2"]);
    expect(g.rings.ring1.band.node.parent).toBe(T.player.armL); // ring1 → left hand
    expect(g.rings.ring2.band.node.parent).toBe(T.player.armR); // ring2 → right hand
    for (const slot of ["ring1", "ring2"]) {
      expect(Object.keys(g.rings[slot]).sort()).toEqual(["band", "gemband", "signet"]);
      for (const k in g.rings[slot]) {
        const grp = g.rings[slot][k];
        expect(grp.gemMats.length, `${slot}/${k}`).toBeGreaterThan(0);
        expect(grp.meshes.length, `${slot}/${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("is HIGH-tier only — every phone (low AND medium) skips it; on for high", () => {
    // Jewelry is the most additive worn piece, so it is built ONLY on the desktop high
    // tier; both mobile tiers (low + medium) omit it cleanly so phones pay nothing.
    expect(T.wornDetailFor("low").jewelry).toBe(false);
    expect(T.wornDetailFor("low").jewelryDetail).toBe(false);
    expect(T.wornDetailFor("medium").jewelry).toBe(false);
    expect(T.wornDetailFor("medium").jewelryDetail).toBe(false);
    expect(T.wornDetailFor("high").jewelry).toBe(true);
    expect(T.wornDetailFor("high").jewelryDetail).toBe(true);
    // The other worn silhouette (pauldrons/belt/cloak) still rides medium — only jewelry
    // is high-only, so this change adds nothing to the phone budget elsewhere.
    expect(T.wornDetailFor("medium").pauldrons).toBe(true);
    expect(T.wornDetailFor("medium").cloak).toBe(true);
  });

  it("shows exactly the equipped necklace archetype (and nothing when the slot is empty)", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const map = { amulet_vigor: "pendant", coin_amulet: "pendant", titan_pendant: "amulet" };
    for (const id in map) {
      T.equipItem(p, T.makeItem(id));
      expect(p.gearShown.necklace, id).toBe(true);
      expect(p.gearShown.necklaceArchetype, id).toBe(map[id]);
      expect(p.gear.necklace.isEnabled()).toBe(true);
      for (const k in p.gear.necklaces) {
        expect(p.gear.necklaces[k].node.isEnabled(), `${id}/${k}`).toBe(k === map[id]);
      }
      T.unequipSlot(p, "necklace");
      T.recomputeStats(p);
    }
    expect(p.gearShown.necklace).toBe(false);
    expect(p.gearShown.necklaceArchetype).toBe(null);
    expect(p.gear.necklace.isEnabled()).toBe(false);
  });

  it("shows the equipped ring on each slot's hand — and only that archetype", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    // Two different rings fill ring1 then ring2 (equipItem round-robins the two slots).
    T.equipItem(p, T.makeItem("ring_power"));  // → ring1 (band)
    T.equipItem(p, T.makeItem("seraph_ring")); // → ring2 (gemband)
    expect(p.equipment.ring1.id).toBe("ring_power");
    expect(p.equipment.ring2.id).toBe("seraph_ring");
    expect(p.gearShown.ring1).toBe(true);
    expect(p.gearShown.ring2).toBe(true);
    expect(p.gearShown.ring1Archetype).toBe("band");
    expect(p.gearShown.ring2Archetype).toBe("gemband");
    for (const slot of ["ring1", "ring2"]) {
      const sel = p.gearShown[slot + "Archetype"];
      for (const k in p.gear.rings[slot]) {
        expect(p.gear.rings[slot][k].node.isEnabled(), `${slot}/${k}`).toBe(k === sel);
      }
    }
    clearEquip(p);
    T.recomputeStats(p);
    expect(p.gearShown.ring1).toBe(false);
    expect(p.gearShown.ring1Archetype).toBe(null);
  });

  it("hides the rings when a glove covers the hand (so a ring never clips the glove)", () => {
    const p = T.player;
    clearEquip(p);
    T.equipItem(p, T.makeItem("ring_power"));
    T.equipItem(p, T.makeItem("ring_guard"));
    expect(p.gearShown.ring1).toBe(true);
    expect(p.gearShown.ring2).toBe(true);
    // Put a glove on: both rings tuck away (the hand is covered), so nothing z-fights it.
    T.equipItem(p, T.makeItem("iron_gauntlets"));
    expect(p.gearShown.ring1).toBe(false);
    expect(p.gearShown.ring2).toBe(false);
    for (const slot of ["ring1", "ring2"]) {
      for (const k in p.gear.rings[slot]) expect(p.gear.rings[slot][k].node.isEnabled(), `${slot}/${k}`).toBe(false);
    }
    // Remove the glove: the rings come back on the now-bare hands.
    T.unequipSlot(p, "gloves");
    T.recomputeStats(p);
    expect(p.gearShown.ring1).toBe(true);
    expect(p.gearShown.ring2).toBe(true);
    clearEquip(p);
    T.recomputeStats(p);
  });

  it("seats the necklace in FRONT of the chest at the throat, and the ring at the hand", () => {
    const p = T.player;
    clearEquip(p);
    T.equipItem(p, T.makeItem("titan_pendant")); // amulet: chain + medallion + gem
    const grp = p.gear.necklaces[p.gearShown.necklaceArchetype];
    let proud = false;
    for (const m of grp.meshes) {
      const c = toFrame(m, { x: 0, y: 0, z: 0 }, p.lean); // origin in lean (torso) space
      expect(Math.abs(c.x), `${m.name} x ${c.x.toFixed(3)} off to the side`).toBeLessThanOrEqual(0.32);
      // Throat / upper-chest band: above the chest anchor centre (1.16) and below the head.
      expect(c.y, `${m.name} y ${c.y.toFixed(3)} too low`).toBeGreaterThanOrEqual(1.1);
      expect(c.y, `${m.name} y ${c.y.toFixed(3)} too high`).toBeLessThanOrEqual(1.62);
      // Never behind the front of the body by more than the collar radius (the chain's
      // back can ring the nape); the pendant reads in front.
      expect(c.z, `${m.name} z ${c.z.toFixed(3)} too far back`).toBeGreaterThanOrEqual(-0.32);
      if (c.z >= 0.28) proud = true; // a pendant/gem clears the chest front (~0.27)
    }
    expect(proud, "a necklace part sits proud in front of the chest").toBe(true);
    // Ring seats at the hand (arm-local y ≈ −0.72, just below the hand sphere).
    T.equipItem(p, T.makeItem("seraph_ring")); // → ring1 (left hand)
    const rgrp = p.gear.rings.ring1[p.gearShown.ring1Archetype];
    for (const m of rgrp.meshes) {
      const c = toFrame(m, { x: 0, y: 0, z: 0 }, p.armL); // origin in the arm's frame
      expect(Math.abs(c.x), `ring ${m.name} x ${c.x.toFixed(3)}`).toBeLessThanOrEqual(0.14);
      expect(c.y, `ring ${m.name} y ${c.y.toFixed(3)} not at the hand`).toBeGreaterThanOrEqual(-0.9);
      expect(c.y, `ring ${m.name} y ${c.y.toFixed(3)} not at the hand`).toBeLessThanOrEqual(-0.6);
      expect(c.z, `ring ${m.name} z ${c.z.toFixed(3)}`).toBeGreaterThanOrEqual(-0.05);
      expect(c.z, `ring ${m.name} z ${c.z.toFixed(3)}`).toBeLessThanOrEqual(0.22);
    }
    clearEquip(p);
    T.recomputeStats(p);
  });

  it("never reallocates the jewelry meshes across equip churn (no leak) while stepping", () => {
    const p = T.player;
    clearEquip(p);
    T.recomputeStats(p);
    const neckNode = p.gear.necklaces.amulet.node;
    const ring1Node = p.gear.rings.ring1.gemband.node;
    const meshCount = Object.values(p.gear.necklaces).reduce((n, grp) => n + grp.meshes.length, 0)
      + ["ring1", "ring2"].reduce((n, slot) => n + Object.values(p.gear.rings[slot]).reduce((m, grp) => m + grp.meshes.length, 0), 0);
    for (let i = 0; i < 10; i++) {
      for (const id of ["amulet_vigor", "titan_pendant", "ring_power", "vampiric_ring", "seraph_ring"]) {
        T.equipItem(p, T.makeItem(id));
        expect(() => step(1)).not.toThrow(); // jewelry rides the body/hands each frame
      }
      T.unequipSlot(p, "necklace");
      T.unequipSlot(p, "ring1");
      T.unequipSlot(p, "ring2");
      T.recomputeStats(p);
    }
    // Same node objects + total mesh count throughout — nothing was rebuilt.
    expect(p.gear.necklaces.amulet.node).toBe(neckNode);
    expect(p.gear.rings.ring1.gemband.node).toBe(ring1Node);
    expect(Object.values(p.gear.necklaces).reduce((n, grp) => n + grp.meshes.length, 0)
      + ["ring1", "ring2"].reduce((n, slot) => n + Object.values(p.gear.rings[slot]).reduce((m, grp) => m + grp.meshes.length, 0), 0)).toBe(meshCount);
    clearEquip(p);
    T.recomputeStats(p);
  });

  it("round-trips equipped jewelry through serialize/applySave (no schema change)", () => {
    const p = T.player;
    clearEquip(p);
    p.equipment.necklace = T.makeItem("titan_pendant");
    p.equipment.ring1 = T.makeItem("ring_power");
    p.equipment.ring2 = T.makeItem("seraph_ring");
    T.recomputeStats(p);
    const save = T.serializeGame();
    clearEquip(p);
    T.applySave(save);
    expect(T.player.equipment.necklace.id).toBe("titan_pendant");
    expect(T.player.equipment.ring1.id).toBe("ring_power");
    expect(T.player.equipment.ring2.id).toBe("seraph_ring");
    // The worn meshes rebuild from the equipped items on load — no persisted mesh state.
    expect(T.player.gearShown.necklace).toBe(true);
    expect(T.player.gearShown.necklaceArchetype).toBe("amulet");
    clearEquip(T.player);
    T.recomputeStats(T.player);
  });
});
