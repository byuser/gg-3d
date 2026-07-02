// Task 40 — travelling vendors in every land: the merchant, blacksmith and
// apothecary now trade in EVERY zone, not only the hub. Before this fix all three
// were created ONLY inside the `if (zone.home)` branch of setupZoneContent(), so a
// player deep in a wild zone had no vendor at all and had to trek back to the hub
// to buy, sell, repair or restock. This suite locks in: (1) the DETERMINISTIC,
// obstacle-free per-zone camp anchor, (2) that entering a wild land spawns all
// three vendors + registers their talk/shop/anvil interactables, (3) that a
// save-load INTO a non-hub zone still yields usable vendors, (4) that teardown
// disposes every vendor + the camp (no leaks across travel), and (5) that the
// map/minimap + guided waypoint carry all three vendors in the current land.

import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";
import { ZONE_BY_ID, ZONES, HUB_ZONE } from "../src/data/zones.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };
const WILD = ZONES.filter((z) => !z.home).map((z) => z.id); // forest, shore, peaks, caverns, thicket

// Distance from (x,z) to the nearest solid-scenery circle edge (negative = inside).
const clearance = (world, x, z) => {
  let min = Infinity;
  for (const o of world.obstacles || []) min = Math.min(min, Math.hypot(x - o.x, z - o.z) - o.r);
  return min;
};

describe("Task 40 — per-zone vendor camp anchor (deterministic, in-bounds, clear)", () => {
  beforeAll(() => { T.startGame(); step(2); });

  it("resolves valid, in-bounds, obstacle-free slots for EVERY wild zone", () => {
    for (const zid of WILD) {
      T.zoneManager._swap(T.state.zoneId, zid, ZONE_BY_ID[zid]);
      const world = T.state.world;
      const slots = T.vendorCampSlots(world);
      for (const key of ["anchor", "merchant", "blacksmith", "apothecary"]) {
        const p = slots[key];
        expect(p, `${zid}.${key} exists`).toBeTruthy();
        // Well inside the circular fence (the settle clamps to R - 4.2).
        const r = Math.hypot(p.x, p.z);
        expect(r, `${zid}.${key} within fence (r=${r.toFixed(1)} < ${world.radius})`).toBeLessThan(world.radius - 3);
        // Not stuck inside any solid scenery obstacle.
        expect(clearance(world, p.x, p.z), `${zid}.${key} clear of obstacles`).toBeGreaterThan(0);
      }
      // The three vendors are spaced apart (their 3.4m talk zones don't collapse).
      const d = (a, b) => Math.hypot(slots[a].x - slots[b].x, slots[a].z - slots[b].z);
      expect(d("merchant", "blacksmith")).toBeGreaterThan(4);
      expect(d("merchant", "apothecary")).toBeGreaterThan(4);
      expect(d("blacksmith", "apothecary")).toBeGreaterThan(4);
    }
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });

  it("is deterministic — same world in, same slots out", () => {
    T.zoneManager._swap(T.state.zoneId, "peaks", ZONE_BY_ID.peaks);
    const a = T.vendorCampSlots(T.state.world);
    const b = T.vendorCampSlots(T.state.world);
    expect(b).toEqual(a);
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });

  it("anchors beside the road toward the hub (the primary entrance)", () => {
    T.zoneManager._swap(T.state.zoneId, "peaks", ZONE_BY_ID.peaks);
    const world = T.state.world;
    // peaks reaches the hub directly, so its meadow-ward portal is the entrance.
    const entrance = T.primaryEntrancePortal(world);
    expect(entrance).toBeTruthy();
    expect(entrance.to).toBe("meadow");
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });
});

describe("Task 40 — all three vendors spawn + are usable in every land", () => {
  beforeAll(() => { if (T.state.zoneId !== HUB_ZONE) T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]); });

  const registered = (v) => v && T.interaction.items.includes(v.it);

  it("the hub keeps its permanent plaza vendors at their fixed spots", () => {
    expect(T.state.zoneId).toBe(HUB_ZONE);
    expect(registered(T.state.merchant)).toBe(true);
    expect(registered(T.state.blacksmith)).toBe(true);
    expect(registered(T.state.alchemist)).toBe(true);
    // Hub positions are the fixed class defaults (no travelling camp).
    expect(T.state.vendorCamp).toBe(null);
    expect(T.state.merchant.root.position.x).toBeCloseTo(0);
    expect(T.state.blacksmith.root.position.x).toBeCloseTo(-7);
    expect(T.state.alchemist.root.position.x).toBeCloseTo(8);
  });

  it("regression: entering a WILD zone spawns all three vendors (was zero outside the hub)", () => {
    T.zoneManager._swap(T.state.zoneId, "forest", ZONE_BY_ID.forest);
    expect(T.state.zoneId).toBe("forest");
    expect(T.state.merchant, "merchant spawned in the wild").toBeTruthy();
    expect(T.state.blacksmith, "blacksmith spawned in the wild").toBeTruthy();
    expect(T.state.alchemist, "apothecary spawned in the wild").toBeTruthy();
    expect(T.state.vendorCamp, "a travelling camp was built").toBeTruthy();
    // Their interactables are freshly registered in the cleared→rebuilt registry.
    expect(registered(T.state.merchant)).toBe(true);
    expect(registered(T.state.blacksmith)).toBe(true);
    expect(registered(T.state.alchemist)).toBe(true);
    // They stand at the deterministic camp slots (not the hub-fixed spots).
    const slots = T.vendorCampSlots(T.state.world);
    expect(T.state.merchant.root.position.x).toBeCloseTo(slots.merchant.x);
    expect(T.state.merchant.root.position.z).toBeCloseTo(slots.merchant.z);
    // The camp is clear of the player's exact landing tile (not on top of them).
    const pl = T.player.position;
    const dNear = Math.min(
      Math.hypot(T.state.merchant.root.position.x - pl.x, T.state.merchant.root.position.z - pl.z),
      Math.hypot(T.state.blacksmith.root.position.x - pl.x, T.state.blacksmith.root.position.z - pl.z),
      Math.hypot(T.state.alchemist.root.position.x - pl.x, T.state.alchemist.root.position.z - pl.z),
    );
    expect(dNear).toBeGreaterThan(3);
  });

  it("walk-up + interact opens the right UI for each wild-zone vendor", () => {
    const walkTo = (v) => {
      const p = v.root.getAbsolutePosition();
      T.player.root.position.set(p.x, 0, p.z);
      T.interaction.update(T.player.position);
    };
    // Merchant → the gear shop.
    walkTo(T.state.merchant);
    expect(T.interaction.current).toBe(T.state.merchant.it);
    T.interaction.trigger();
    expect(T.Shop.open).toBe(true);
    expect(T.Shop.vendor).toBe("merchant");
    T.Shop.closeShop();
    // Blacksmith → the anvil (enhance/repair).
    walkTo(T.state.blacksmith);
    expect(T.interaction.current).toBe(T.state.blacksmith.it);
    T.interaction.trigger();
    expect(T.Anvil.open).toBe(true);
    T.Anvil.close();
    // Apothecary → the alchemist shop (potions + ingredients).
    walkTo(T.state.alchemist);
    expect(T.interaction.current).toBe(T.state.alchemist.it);
    T.interaction.trigger();
    expect(T.Shop.open).toBe(true);
    expect(T.Shop.vendor).toBe("alchemist");
    T.Shop.closeShop();
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });

  it("a save-load INTO a non-hub zone still yields usable vendors (no schema bump)", () => {
    const save = T.serializeGame();
    expect(save.v).toBe(T.SAVE_VERSION); // vendors rebuild from data — no SAVE_VERSION change
    save.zone = "caverns";
    T.applySave(save);
    expect(T.state.zoneId).toBe("caverns");
    expect(registered(T.state.merchant)).toBe(true);
    expect(registered(T.state.blacksmith)).toBe(true);
    expect(registered(T.state.alchemist)).toBe(true);
    // Talkable right where we loaded in.
    const p = T.state.merchant.root.getAbsolutePosition();
    T.player.root.position.set(p.x, 0, p.z);
    T.interaction.update(T.player.position);
    expect(T.interaction.current).toBe(T.state.merchant.it);
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });
});

describe("Task 40 — vendor markers + guided waypoint everywhere", () => {
  beforeAll(() => { if (T.state.zoneId !== HUB_ZONE) T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]); });

  it("all three vendors are searchable map targets (incl. the apothecary)", () => {
    const ids = T.MAP_TARGETS.filter((tg) => tg.kind === "vendor").map((tg) => tg.id);
    expect(ids).toEqual(["merchant", "blacksmith", "apothecary"]);
    // Each resolves to a localized display name for the search list.
    for (const id of ids) expect(T.WorldMapUI.targetName({ kind: "vendor", id })).toBeTruthy();
  });

  it("all three vendors are visible on the minimap in the hub AND the wild", () => {
    // Hub: the apothecary glyph now draws too (it was previously omitted).
    expect(T.state.merchant.visible && T.state.blacksmith.visible && T.state.alchemist.visible).toBe(true);
    T.zoneManager._swap(T.state.zoneId, "shore", ZONE_BY_ID.shore);
    expect(T.state.merchant.visible && T.state.blacksmith.visible && T.state.alchemist.visible).toBe(true);
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });

  it("a vendor waypoint routes to the vendor in the CURRENT land (nearest across lands)", () => {
    const state = T.state, player = T.player;
    // In the hub it resolves to the hub merchant (0,0,0).
    player.root.position.set(20, 0, 20);
    let g = T.resolveWaypoint({ kind: "vendor", id: "merchant" }, state, player);
    expect(g.inZone).toBe(true);
    expect(g.targetZone).toBe(HUB_ZONE);
    expect(g.point.x).toBeCloseTo(0);
    expect(g.point.z).toBeCloseTo(0);
    // Travel to the forest: the SAME waypoint now leads to the forest camp merchant.
    T.zoneManager._swap(state.zoneId, "forest", ZONE_BY_ID.forest);
    g = T.resolveWaypoint({ kind: "vendor", id: "merchant" }, state, player);
    expect(g.inZone).toBe(true);
    expect(g.targetZone).toBe("forest");
    expect(g.point.x).toBeCloseTo(state.merchant.root.position.x);
    expect(g.point.z).toBeCloseTo(state.merchant.root.position.z);
    // The blacksmith + apothecary waypoints resolve to their live camp positions too.
    const gb = T.resolveWaypoint({ kind: "vendor", id: "blacksmith" }, state, player);
    expect(gb.point.x).toBeCloseTo(state.blacksmith.root.position.x);
    const ga = T.resolveWaypoint({ kind: "vendor", id: "apothecary" }, state, player);
    expect(ga.point.x).toBeCloseTo(state.alchemist.root.position.x);
    T.zoneManager._swap(state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });

  it("setWaypoint stores a vendor guide; it round-trips through save/load", () => {
    const state = T.state;
    T.WorldMap.setWaypoint("vendor", "apothecary");
    expect(state.waypoint).toEqual({ kind: "vendor", id: "apothecary" });
    const save = T.serializeGame();
    expect(save.waypoint).toEqual({ kind: "vendor", id: "apothecary" });
    state.waypoint = null;
    T.applySave(save);
    expect(T.state.waypoint).toEqual({ kind: "vendor", id: "apothecary" });
    T.WorldMap.clearWaypoint(true);
  });
});

describe("Task 40 — teardown disposes every vendor + the camp (no leaks)", () => {
  it("frees the merchant, blacksmith, apothecary AND camp meshes across travel", () => {
    T.zoneManager._swap(T.state.zoneId, "peaks", ZONE_BY_ID.peaks);
    const spies = [];
    for (const v of [T.state.merchant, T.state.blacksmith, T.state.alchemist, T.state.vendorCamp]) {
      expect(v).toBeTruthy();
      const root = v.root;
      const rec = { disposed: false, it: v.it };
      const orig = root.dispose.bind(root);
      root.dispose = () => { rec.disposed = true; orig(); };
      spies.push(rec);
    }
    T.teardownZone(T.state, T.interaction);
    for (const s of spies) {
      expect(s.disposed).toBe(true);
      if (s.it) expect(T.interaction.items.includes(s.it)).toBe(false);
    }
    expect(T.state.merchant).toBe(null);
    expect(T.state.blacksmith).toBe(null);
    expect(T.state.alchemist).toBe(null);
    expect(T.state.vendorCamp).toBe(null);
  });
});
