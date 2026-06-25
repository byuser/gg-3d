// Task 21 — Unified inventory for potions & ingredients. Locks in:
//  - the legacy → unified-bag MIGRATION (materials map + potion belt → bag items
//    + quick-slot refs) as a pure, tested function + a full save/load round-trip;
//  - bag STACKING of potions/materials (add / count / spend, stack-max, cap);
//  - the drag-to-potion-slot reducer (assign / move / swap / clear, any order),
//    reusing the Task 16 pure dragSlotReducer over the assignment model;
//  - Shop.sell accepting potions + materials at the expected ITEM_DB prices, and
//    the buyer adding stackables into the bag;
//  - the dedicated alchemist's stock (potions + basic ingredients) vs. the
//    merchant's gear-only stock (no potions);
//  - a UI smoke that drives a potion quick-slot assignment (tap fallback) + a sell.
import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => {
  for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire();
};

beforeAll(() => {
  T.startGame();
  step(3);
});

describe("Task 21 — unified bag config", () => {
  it("grows the bag to 30 slots", () => {
    expect(T.player.invCap).toBe(30);
  });

  it("classifies potions + materials as stackable (and not gear)", () => {
    for (const id of ["minor_potion", "wood", "crystal"]) {
      expect(T.isStackable(id), id).toBe(true);
      expect(T.isGear(id), id).toBe(false);
    }
    expect(T.isMaterial("wood")).toBe(true);
    expect(T.isMaterial("minor_potion")).toBe(false);
    expect(T.isStackable("iron_sword")).toBe(false);
    expect(T.isGear("iron_sword")).toBe(true);
  });

  it("gives every material an ITEM_DB entry with a sane buy/sell value", () => {
    for (const id of T.MATERIAL_IDS) {
      const def = T.getDef(id);
      expect(def, id).toBeTruthy();
      expect(def.type).toBe("material");
      expect(def.cost).toBeGreaterThan(0);
      expect(def.value).toBeGreaterThan(0);
    }
  });
});

describe("Task 21 — bag stacking (potions + materials share one path)", () => {
  it("stacks same-id items and counts across stacks", () => {
    const p = T.player;
    p.inventory = [];
    expect(T.bagAdd(p, "minor_potion", 5)).toBe(5);
    expect(T.bagCount(p, "minor_potion")).toBe(5);
    // A second add tops up the SAME stack (one slot), not a new one.
    T.bagAdd(p, "minor_potion", 3);
    expect(T.bagCount(p, "minor_potion")).toBe(8);
    expect(p.inventory.filter((i) => i.id === "minor_potion").length).toBe(1);
    // Materials stack the same way.
    T.bagAdd(p, "wood", 4);
    expect(T.bagCount(p, "wood")).toBe(4);
  });

  it("spends across stacks and drops emptied slots", () => {
    const p = T.player;
    p.inventory = [];
    T.bagAdd(p, "herb", 6);
    expect(T.bagSpend(p, "herb", 2)).toBe(2);
    expect(T.bagCount(p, "herb")).toBe(4);
    expect(T.bagSpend(p, "herb", 99)).toBe(4); // only 4 left
    expect(T.bagCount(p, "herb")).toBe(0);
    expect(p.inventory.some((i) => i.id === "herb")).toBe(false);
  });

  it("respects the per-slot stack max + the bag's slot cap", () => {
    const p = T.player;
    p.inventory = [];
    // One big add overflows the per-slot max into multiple slots.
    T.bagAdd(p, "stone", T.STACK_MAX + 10);
    expect(T.bagCount(p, "stone")).toBe(T.STACK_MAX + 10);
    expect(p.inventory.filter((i) => i.id === "stone").length).toBe(2);
    // Fill the bag with distinct gear, then a stackable can't open a new slot.
    p.inventory = [];
    for (let i = 0; i < p.invCap; i++) p.inventory.push(T.makeItem("iron_sword"));
    expect(T.bagAdd(p, "water", 1)).toBe(0); // full → nothing lands
    expect(T.bagCount(p, "water")).toBe(0);
  });

  it("hasMaterials / spendMaterials read & write the bag", () => {
    const p = T.player;
    p.inventory = [];
    T.addMaterial(p, "herb", 5);
    T.addMaterial(p, "water", 3);
    expect(T.hasMaterials(p, { herb: 2, water: 1 })).toBe(true);
    expect(T.hasMaterials(p, { crystal: 1 })).toBe(false);
    expect(T.spendMaterials(p, { herb: 2, water: 1 })).toBe(true);
    expect(T.bagCount(p, "herb")).toBe(3);
    expect(T.bagCount(p, "water")).toBe(2);
    expect(T.spendMaterials(p, { crystal: 9 })).toBe(false); // not enough → no spend
  });
});

describe("Task 21 — potion quick-slots (assignment over bag potions)", () => {
  it("assigns / clears a quick-slot and keeps assignments unique", () => {
    const p = T.player;
    p.inventory = [];
    p.potionSlots = [null, null, null];
    T.bagAdd(p, "minor_potion", 2);
    T.bagAdd(p, "health_potion", 1);
    expect(T.assignPotionSlot(p, 0, "minor_potion")).toBe(true);
    expect(p.potionSlots[0]).toBe("minor_potion");
    // Assigning the same potion to another slot moves it (no duplicate).
    T.assignPotionSlot(p, 2, "minor_potion");
    expect(p.potionSlots[0]).toBe(null);
    expect(p.potionSlots[2]).toBe("minor_potion");
    // A non-potion id is rejected.
    expect(T.assignPotionSlot(p, 1, "wood")).toBe(false);
    expect(T.clearPotionSlot(p, 2)).toBe(true);
    expect(p.potionSlots[2]).toBe(null);
  });

  it("drinking a quick-slot consumes from the bag stack + auto-clears when empty", () => {
    const p = T.player;
    p.inventory = [];
    p.potionSlots = [null, null, null];
    p.maxHealth = 100;
    p.health = 10;
    T.bagAdd(p, "minor_potion", 2);
    T.assignPotionSlot(p, 1, "minor_potion");
    expect(T.potionUse(p, 1)).toBe(true);
    expect(p.health).toBe(40); // +30
    expect(T.bagCount(p, "minor_potion")).toBe(1);
    // Drain the last one → the quick-slot clears itself.
    p.health = 10;
    expect(T.potionUse(p, 1)).toBe(true);
    expect(T.bagCount(p, "minor_potion")).toBe(0);
    expect(p.potionSlots[1]).toBe(null);
  });

  it("syncPotionSlots drops a slot pointing at a potion the bag no longer holds", () => {
    const p = T.player;
    p.inventory = [];
    p.potionSlots = ["health_potion", null, null];
    T.syncPotionSlots(p); // bag empty → slot cleared
    expect(p.potionSlots[0]).toBe(null);
  });
});

describe("Task 21 — drag-to-potion-slot reducer (pure; reuses Task 16 model)", () => {
  const N = 3; // POTION_SLOTS

  it("a bag potion (roster) → slot assigns it", () => {
    expect(T.dragSlotReducer({ kind: "roster", id: "minor_potion" }, { kind: "slot", slot: 1 }, N)).toEqual([
      { op: "assign", slot: 1, id: "minor_potion" },
    ]);
  });

  it("slot → empty space clears the source slot", () => {
    expect(T.dragSlotReducer({ kind: "slot", slot: 0, id: "minor_potion" }, { kind: "void" }, N)).toEqual([
      { op: "clear", slot: 0 },
    ]);
  });

  it("slot → empty slot moves; slot → filled slot swaps (any order)", () => {
    expect(
      T.dragSlotReducer({ kind: "slot", slot: 0, id: "a" }, { kind: "slot", slot: 2, occupantId: null }, N),
    ).toEqual([{ op: "clear", slot: 0 }, { op: "assign", slot: 2, id: "a" }]);
    expect(
      T.dragSlotReducer({ kind: "slot", slot: 0, id: "a" }, { kind: "slot", slot: 1, occupantId: "b" }, N),
    ).toEqual([{ op: "assign", slot: 0, id: "b" }, { op: "assign", slot: 1, id: "a" }]);
  });

  it("dropping on itself / out-of-range / no-source are no-ops", () => {
    expect(T.dragSlotReducer({ kind: "slot", slot: 1, id: "a" }, { kind: "slot", slot: 1, occupantId: "a" }, N)).toEqual([]);
    expect(T.dragSlotReducer({ kind: "roster", id: "a" }, { kind: "slot", slot: 9 }, N)).toEqual([]);
    expect(T.dragSlotReducer(null, { kind: "slot", slot: 0 }, N)).toEqual([]);
  });

  it("Inventory.applyPotionDrag runs the reducer against the live assignment model", () => {
    const p = T.player;
    p.inventory = [];
    p.potionSlots = [null, null, null];
    T.bagAdd(p, "minor_potion", 1);
    T.bagAdd(p, "health_potion", 1);
    T.Inventory.init(T.state, p);
    // Assign two potions by dragging from the bag.
    T.Inventory.applyPotionDrag({ kind: "roster", id: "minor_potion" }, { kind: "slot", slot: 0, occupantId: null });
    T.Inventory.applyPotionDrag({ kind: "roster", id: "health_potion" }, { kind: "slot", slot: 1, occupantId: null });
    expect(p.potionSlots[0]).toBe("minor_potion");
    expect(p.potionSlots[1]).toBe("health_potion");
    // Swap them by dragging slot 0 onto slot 1.
    T.Inventory.applyPotionDrag(
      { kind: "slot", slot: 0, id: "minor_potion" },
      { kind: "slot", slot: 1, occupantId: "health_potion" },
    );
    expect(p.potionSlots[0]).toBe("health_potion");
    expect(p.potionSlots[1]).toBe("minor_potion");
    // Clear slot 1 by dragging onto empty space.
    T.Inventory.applyPotionDrag({ kind: "slot", slot: 1, id: "minor_potion" }, { kind: "void" });
    expect(p.potionSlots[1]).toBe(null);
  });
});

describe("Task 21 — legacy migration (materials map + potion belt → bag + quick-slots)", () => {
  it("folds a pre-v12 player block into the unified bag + quick-slot refs", () => {
    const legacy = {
      inventory: [{ id: "iron_sword", lvl: 1 }],
      materials: { wood: 7, stone: 3, crystal: 2 },
      potions: [{ id: "minor_potion", count: 4 }, null, { id: "health_potion", count: 2 }],
    };
    const out = T.migrateLegacyBag(legacy, 11);
    // Gear preserved; materials + potions folded in as stacks.
    const find = (id) => out.inventory.find((e) => e.id === id);
    expect(find("iron_sword")).toBeTruthy();
    expect(find("wood").count).toBe(7);
    expect(find("stone").count).toBe(3);
    expect(find("crystal").count).toBe(2);
    expect(find("minor_potion").count).toBe(4);
    expect(find("health_potion").count).toBe(2);
    // The belt slot indices become the quick-slot assignments.
    expect(out.potionSlots).toEqual(["minor_potion", null, "health_potion"]);
  });

  it("passes a v12+ block through unchanged (no double-fold)", () => {
    const modern = {
      inventory: [{ id: "wood", count: 5 }, { id: "minor_potion", count: 2 }],
      potionSlots: ["minor_potion", null, null],
    };
    const out = T.migrateLegacyBag(modern, 12);
    expect(out.inventory).toEqual(modern.inventory);
    expect(out.potionSlots).toEqual(["minor_potion", null, null]);
  });

  it("a real pre-v12 save loads: belt + materials end up in the bag", () => {
    const p = T.player;
    // Build a current save, then DOWNGRADE it to the v11 shape by hand.
    p.inventory = [T.makeItem("iron_sword")];
    p.potionSlots = [null, null, null];
    const save = T.serializeGame();
    save.v = 11;
    save.player.inventory = [{ id: "iron_sword", lvl: 0 }];
    delete save.player.potionSlots;
    save.player.materials = { wood: 9, herb: 4 };
    save.player.potions = [{ id: "minor_potion", count: 3 }, null, null];
    expect(T.validateSave(save)).toBe(true);
    T.applySave(save);
    expect(T.bagCount(T.player, "wood")).toBe(9);
    expect(T.bagCount(T.player, "herb")).toBe(4);
    expect(T.bagCount(T.player, "minor_potion")).toBe(3);
    expect(T.player.potionSlots[0]).toBe("minor_potion");
    expect(T.player.inventory.some((i) => i.id === "iron_sword")).toBe(true);
  });
});

describe("Task 21 — save / load round-trip of the unified schema (v12)", () => {
  it("round-trips bag stacks + quick-slot assignments", () => {
    const p = T.player;
    for (const slot of T.EQUIP_SLOTS) p.equipment[slot] = null;
    p.inventory = [];
    p.equipment.hand1 = T.makeItem("magic_wand");
    T.bagAdd(p, "minor_potion", 5);
    T.bagAdd(p, "wood", 12);
    T.bagAdd(p, "crystal", 2);
    p.potionSlots = ["minor_potion", null, null];
    const save = T.serializeGame();
    expect(save.v).toBe(12);
    expect(save.v).toBe(T.SAVE_VERSION);
    expect(save.player.inventory.find((e) => e.id === "minor_potion").count).toBe(5);
    expect(save.player.potionSlots).toEqual(["minor_potion", null, null]);

    // Wipe + restore.
    p.inventory = [];
    p.potionSlots = [null, null, null];
    T.applySave(save);
    expect(T.bagCount(T.player, "minor_potion")).toBe(5);
    expect(T.bagCount(T.player, "wood")).toBe(12);
    expect(T.bagCount(T.player, "crystal")).toBe(2);
    expect(T.player.potionSlots).toEqual(["minor_potion", null, null]);
  });
});

describe("Task 21 — potions & materials are sellable (Shop.sell)", () => {
  it("sells one unit off a potion/material stack at its ITEM_DB value", () => {
    const p = T.player;
    p.inventory = [];
    p.potionSlots = [null, null, null];
    T.Shop.init(T.state, p);
    T.bagAdd(p, "minor_potion", 3);
    const stack = p.inventory.find((i) => i.id === "minor_potion");
    T.state.coins = 0;
    const worth = T.sellWorth(stack);
    expect(worth).toBe(T.getDef("minor_potion").value);
    T.Shop.sell(stack);
    expect(T.state.coins).toBe(worth);
    expect(T.bagCount(p, "minor_potion")).toBe(2); // one peeled off
    // Materials sell too.
    T.bagAdd(p, "crystal", 1);
    const crys = p.inventory.find((i) => i.id === "crystal");
    const coins0 = T.state.coins;
    T.Shop.sell(crys);
    expect(T.state.coins).toBe(coins0 + T.getDef("crystal").value);
    expect(T.bagCount(p, "crystal")).toBe(0);
  });

  it("selling a slotted potion to empty clears the quick-slot", () => {
    const p = T.player;
    p.inventory = [];
    p.potionSlots = [null, null, null];
    T.Shop.init(T.state, p);
    T.bagAdd(p, "health_potion", 1);
    T.assignPotionSlot(p, 0, "health_potion");
    const stack = p.inventory.find((i) => i.id === "health_potion");
    T.Shop.sell(stack);
    expect(T.bagCount(p, "health_potion")).toBe(0);
    expect(p.potionSlots[0]).toBe(null);
  });

  it("the buyer drops a bought stackable into the bag", () => {
    const p = T.player;
    p.inventory = [];
    T.Shop.init(T.state, p);
    T.state.coins = 1000;
    T.Shop.buyPotion(T.getDef("minor_potion"));
    expect(T.bagCount(p, "minor_potion")).toBe(1);
    T.Shop.buyPotion(T.getDef("wood")); // an ingredient
    expect(T.bagCount(p, "wood")).toBe(1);
  });
});

describe("Task 21 — specialised vendors (alchemist owns consumables/reagents)", () => {
  it("the alchemist stocks potions + basic ingredients; the merchant no longer does", () => {
    // Every potion is in the alchemist's stock.
    for (const id of T.POTION_STOCK) expect(T.ALCHEMIST_STOCK.includes(id), id).toBe(true);
    // Basic (normal-rarity) ingredients are sold; the rare crystal is not.
    expect(T.INGREDIENT_STOCK.length).toBeGreaterThan(0);
    for (const id of T.INGREDIENT_STOCK) {
      expect(T.getDef(id).type).toBe("material");
      expect(T.getDef(id).rarity).toBe("normal");
    }
    expect(T.INGREDIENT_STOCK.includes("crystal")).toBe(false);
    // The merchant's gear stock contains NO potions or materials.
    for (const id of T.SHOP_STOCK) {
      expect(T.getDef(id).type).not.toBe("potion");
      expect(T.getDef(id).type).not.toBe("material");
    }
  });

  it("registers a dedicated alchemist NPC (vendor) in the world data", () => {
    const npc = T.NPC_DATA.find((n) => n.id === "alchemist");
    expect(npc).toBeTruthy();
    expect(npc.vendor).toBe("alchemist");
    // It resolves a localizable name + label in both locales.
    expect(typeof T.tNpcName("alchemist")).toBe("string");
    expect(T.tNpcName("alchemist").length).toBeGreaterThan(0);
  });

  it("the alchemist vendor builds + tears down cleanly (no throw, disposes)", () => {
    let disposed = false;
    const fakeShadow = { addShadowCaster() {} };
    const fakeInteraction = { register() {}, remove() { disposed = true; } };
    const a = new T.Alchemist(scene, fakeShadow, fakeInteraction, () => {});
    expect(() => { a.show(); a.update(0.1); a.hide(); }).not.toThrow();
    a.dispose();
    expect(disposed).toBe(true);
  });
});

describe("Task 21 — UI smoke (tap fallback drag + a sell, no throw)", () => {
  it("opens the potions tab, taps a bag potion onto a quick-slot, then sells one", () => {
    const p = T.player;
    p.inventory = [];
    p.potionSlots = [null, null, null];
    T.bagAdd(p, "minor_potion", 3);
    T.Inventory.init(T.state, p);
    T.Shop.init(T.state, p);

    expect(() => {
      T.Inventory.openInv();
      T.Inventory.setTab("materials");
      T.Inventory.setTab("potions"); // renders the quick-slots + bag potion cards
    }).not.toThrow();

    // Accessible fallback: pick the bag potion, then tap quick-slot 2.
    T.Inventory.picked = null;
    T.Inventory.tapPick({ kind: "roster", id: "minor_potion" });
    expect(T.Inventory.picked).toEqual({ kind: "roster", id: "minor_potion" });
    T.Inventory.tapSlot(2, null);
    expect(p.potionSlots[2]).toBe("minor_potion");
    expect(T.Inventory.picked).toBe(null);

    // Sell one from the bag stack via the shop, then re-render the inventory.
    T.state.coins = 0;
    const stack = p.inventory.find((i) => i.id === "minor_potion");
    expect(() => T.Shop.sell(stack)).not.toThrow();
    expect(T.state.coins).toBe(T.getDef("minor_potion").value);
    expect(() => T.Inventory.render()).not.toThrow();
    T.Inventory.close();
  });
});
