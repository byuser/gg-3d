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
    expect(g.pauldrons && g.belt && g.cloak).toBeTruthy();
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
    const refs = [p.gear.helmet, p.gear.chest, p.gear.cloak, p.gear.boots[0], p.gear.pauldrons[1]];
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
      p.gear.pauldrons[1],
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
  it("switches tabs and consumes a potion from the potions tab", () => {
    const p = T.player;
    T.potionAdd(p, "minor_potion");
    const before = p.potions.reduce((n, s) => n + (s ? s.count : 0), 0);
    p.health = 1; // so the heal actually applies (and the potion is spent)
    T.Inventory.openInv();
    expect(() => {
      T.Inventory.setTab("materials");
      T.Inventory.setTab("gear");
      T.Inventory.setTab("potions");
    }).not.toThrow();
    T.Inventory.drink(p.potions.findIndex((s) => s && s.id === "minor_potion"));
    const after = p.potions.reduce((n, s) => n + (s ? s.count : 0), 0);
    expect(after).toBe(before - 1);
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
    expect(save.v).toBe(9);
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
