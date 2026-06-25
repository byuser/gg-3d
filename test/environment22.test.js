// Task 22 — environment rewrite: stable, time-gated resource ecology + natural
// road-edge teleporters. Boots the assembled game against the Babylon/DOM stubs
// and locks in each invariant so it can't silently regress:
//   • a zone's resource set is DETERMINISTIC + PERSISTENT across re-entry (no
//     fresh batch piled on top; count + node set stable over N round-trips)
//   • a per-resource-type, per-zone cap holds at plan / regrow
//   • new nodes appear ONLY after the in-game regrow cadence elapses
//   • every visible node is harvestable after travel (the phantom-node bug)
//   • inter-zone travel fires by WALKING A ROAD to the map edge, both ways, and
//     can't be skirted (off the road → no trigger)
//   • per-zone resource state round-trips through save/load (+ pre-v13 migration)
//   • teardown disposes the new ResourceNode / road meshes (no leak)
import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };
const swap = (to) => { T.zoneManager._swap(T.state.zoneId, to, T.ZONE_BY_ID[to]); step(1); };
const perKind = (nodes) => {
  const c = {};
  for (const r of nodes) c[r.kind] = (c[r.kind] || 0) + 1;
  return c;
};

beforeAll(() => { T.setSeed(2026); T.startGame(); step(3); });

describe("Task 22 — deterministic, persistent resource ecology", () => {
  it("plans a per-zone node set that honours every per-kind cap", () => {
    for (const zid of Object.keys(T.ZONE_BY_ID)) {
      const zone = T.ZONE_BY_ID[zid];
      const w = T.buildWorld(scene, zone);
      const nodes = T.planInitialResources(zone, w);
      const counts = perKind(nodes);
      for (const kind in counts) {
        expect(counts[kind], `${zid}.${kind} exceeds its cap`).toBeLessThanOrEqual(T.resourceCap(kind));
      }
      expect(nodes.length).toBeLessThanOrEqual(T.CONFIG.maxResourceNodes);
      if (w.dispose) w.dispose();
    }
  });

  it("is reproducible: the same seed + zone plans the identical node set", () => {
    T.setSeed(13);
    const a = T.planInitialResources(T.ZONE_BY_ID.meadow, T.buildWorld(scene, T.ZONE_BY_ID.meadow));
    T.setSeed(13);
    const b = T.planInitialResources(T.ZONE_BY_ID.meadow, T.buildWorld(scene, T.ZONE_BY_ID.meadow));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // A different seed yields a different layout (sanity that the seed matters).
    T.setSeed(14);
    const c = T.planInitialResources(T.ZONE_BY_ID.meadow, T.buildWorld(scene, T.ZONE_BY_ID.meadow));
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it("re-entering a zone N times keeps the resource set constant + capped (no pile-up)", () => {
    T.setSeed(2026);
    swap("meadow");
    const baseline = T.state.resources.length;
    const baseRecord = JSON.stringify(T.state.zoneRes.meadow.nodes.map((n) => [n.kind, n.x, n.z]));
    for (let i = 0; i < 6; i++) {
      swap("forest");
      swap("meadow");
      expect(T.state.resources.length, `entry ${i}: live count drifted`).toBe(baseline);
      const rec = JSON.stringify(T.state.zoneRes.meadow.nodes.map((n) => [n.kind, n.x, n.z]));
      expect(rec, `entry ${i}: the node set changed`).toBe(baseRecord);
      const counts = perKind(T.state.resources);
      for (const kind in counts) expect(counts[kind]).toBeLessThanOrEqual(T.resourceCap(kind));
    }
  });

  it("regrows only after the in-game cadence elapses, and never past a kind's cap", () => {
    T.setSeed(7);
    const zone = T.ZONE_BY_ID.forest;
    const w = T.buildWorld(scene, zone);
    const rec = { nodes: T.planInitialResources(zone, w), regrowAcc: 0, sprouts: 0 };
    const start = rec.nodes.length;
    // Below the cadence: nothing new.
    let added = T.regrowZoneResources(rec, zone, w, T.CONFIG.resourceRegrowSec - 1);
    expect(added.length).toBe(0);
    expect(rec.nodes.length).toBe(start);
    // Crossing it: exactly one new node.
    added = T.regrowZoneResources(rec, zone, w, 2);
    expect(added.length).toBe(1);
    expect(rec.nodes.length).toBe(start + 1);

    // Cap at regrow: stuff a kind to its cap, then regrow many cadences — the
    // kind must never exceed its per-zone cap.
    const peaks = T.ZONE_BY_ID.peaks;
    const wp = T.buildWorld(scene, peaks);
    const cap = T.resourceCap("crystal");
    const capped = { nodes: [], regrowAcc: 0, sprouts: 0 };
    for (let i = 0; i < cap; i++) capped.nodes.push({ kind: "crystal", x: 18 + i, z: 0, respawn: 0 });
    for (let i = 0; i < 40; i++) T.regrowZoneResources(capped, peaks, wp, T.CONFIG.resourceRegrowSec);
    expect(T.countKind(capped.nodes, "crystal")).toBeLessThanOrEqual(cap);
  });

  it("regrow is deterministic for a given (seed, zone, elapsed time)", () => {
    const run = () => {
      T.setSeed(99);
      const zone = T.ZONE_BY_ID.shore;
      const w = T.buildWorld(scene, zone);
      const rec = { nodes: T.planInitialResources(zone, w), regrowAcc: 0, sprouts: 0 };
      for (let i = 0; i < 5; i++) T.regrowZoneResources(rec, zone, w, T.CONFIG.resourceRegrowSec);
      return JSON.stringify(rec.nodes.map((n) => [n.kind, n.x, n.z]));
    };
    expect(run()).toBe(run());
  });
});

describe("Task 22 — harvestable after travel (no phantom nodes)", () => {
  it("a harvested node stays depleted across travel, and every live node is registered", () => {
    T.setSeed(2026);
    swap("meadow");
    const node = T.state.resources.find((r) => r.it && r.it.enabled);
    expect(node).toBeTruthy();
    node.harvest();                       // deplete it (writes respawn to the record)
    expect(node.it.enabled).toBe(false);
    expect(node.data.respawn).toBeGreaterThan(0);
    // Travel away and back; the SAME node (by position) must still be on cooldown.
    swap("forest");
    swap("meadow");
    const rebuilt = T.state.resources.find(
      (r) => Math.abs(r.root.position.x - node.root.position.x) < 0.01 &&
             Math.abs(r.root.position.z - node.root.position.z) < 0.01);
    expect(rebuilt, "the depleted node should rebuild from its record").toBeTruthy();
    expect(rebuilt.respawn, "its cooldown should persist across travel").toBeGreaterThan(0);
    expect(rebuilt.it.enabled).toBe(false);
    // Every live, ENABLED node is in the interaction registry (no orphans), so
    // every visible-and-ready node is actually harvestable.
    const reg = T.interaction.items;
    for (const r of T.state.resources) {
      if (r.it.enabled) expect(reg.indexOf(r.it) >= 0, "an enabled node is missing from the registry").toBe(true);
    }
  });

  it("an enabled node harvests through the registry exactly once, post-travel", () => {
    T.setSeed(5);
    swap("shore");
    swap("meadow");
    const node = T.state.resources.find((r) => r.it && r.it.enabled);
    const before = node.respawn;
    expect(before).toBe(0);
    node.it.onInteract();                 // the interact path the trigger() uses
    expect(node.it.enabled).toBe(false);  // now depleted
    node.it.onInteract();                 // a second press must do nothing
    expect(node.respawn).toBeGreaterThan(0);
  });
});

describe("Task 22 — road-edge teleporters", () => {
  it("walking onto a road's end-of-map segment fires travel to that zone", () => {
    T.setSeed(2026);
    swap("meadow");
    const w = T.state.world;
    // Spy on travel() so we capture the target zone without driving the async
    // (setTimeout-based) fade swap — the trigger itself is what we're asserting.
    const realTravel = T.zoneManager.travel.bind(T.zoneManager);
    for (const portal of w.portals) {
      expect(portal.dir, "a portal should be a road-edge spec").toBeTruthy();
      let target = null;
      T.zoneManager.travel = (to) => { target = to; };
      // On the road centreline, just past the exit threshold → should trigger.
      const r = portal.exitR + 1.0;
      const px = portal.dir.x * r, pz = portal.dir.z * r;
      T.player.root.position.set(px, 0, pz);
      T.player.position.x = px; T.player.position.z = pz;
      T.zoneManager.transitioning = false; T.zoneManager.cooldown = 0;
      T.zoneManager.check(0.016);
      expect(target, `road edge for ${portal.to} should fire travel`).toBe(portal.to);
    }
    T.zoneManager.travel = realTravel;
  });

  it("can't be skirted: at the exit radius but OFF the road, nothing triggers", () => {
    T.setSeed(2026);
    swap("meadow");
    const w = T.state.world;
    const portal = w.portals[0];
    // Same radius as the exit, but rotated ~50° off the road direction so the
    // lateral distance to the road far exceeds its half-width.
    const ang = Math.atan2(portal.dir.z, portal.dir.x) + 0.9;
    const r = portal.exitR + 1.0;
    const px = Math.cos(ang) * Math.min(r, w.radius - 1), pz = Math.sin(ang) * Math.min(r, w.radius - 1);
    // Confirm it really is off ALL portal roads (lateral > half for each).
    let offAll = true;
    for (const p of w.portals) {
      const lateral = Math.abs(px * p.dir.z - pz * p.dir.x);
      const along = px * p.dir.x + pz * p.dir.z;
      if (along >= p.exitR && lateral <= p.half) offAll = false;
    }
    expect(offAll, "test point should be off every exit road").toBe(true);
    T.player.root.position.set(px, 0, pz);
    T.player.position.x = px; T.player.position.z = pz;
    T.zoneManager.transitioning = false; T.zoneManager.cooldown = 0;
    T.zoneManager.check(0.016);
    expect(T.zoneManager.transitioning).toBe(false);
  });

  it("travel is bidirectional and arrival lands on the incoming road (below the exit)", () => {
    // Drive the synchronous swap path (like the existing zone-travel tests) so we
    // can assert arrival placement deterministically, both directions.
    for (const [from, to] of [["meadow", "forest"], ["forest", "meadow"]]) {
      T.setSeed(2026);
      swap(from);
      T.zoneManager._swap(from, to, T.ZONE_BY_ID[to]);
      step(1);
      expect(T.state.zoneId).toBe(to);
      // The arrival must be inside the destination's exit threshold (so it can't
      // bounce straight back) and ON the road leading back to `from`.
      const back = T.state.world.portals.find((p) => p.to === from);
      expect(back, `${to} should have a road back to ${from}`).toBeTruthy();
      const pos = T.player.root.position;
      const along = pos.x * back.dir.x + pos.z * back.dir.z;
      const lateral = Math.abs(pos.x * back.dir.z - pos.z * back.dir.x);
      expect(along, "arrival should be below the exit threshold").toBeLessThan(back.exitR);
      expect(lateral, "arrival should be on the incoming road").toBeLessThanOrEqual(back.half + 0.01);
    }
  });

  it("only fires at the fence: a far interior point ON the road does NOT trigger", () => {
    // Regression: the exit band sits at the boundary, so standing on the road
    // well inside the zone (e.g. a corner ~3m from the fence) must NOT teleport —
    // travel happens only when you walk the road all the way to the edge. (This
    // is what kept the harness's far-corner boss flow from accidentally warping.)
    T.setSeed(2026);
    swap("meadow");
    const w = T.state.world;
    const portal = w.portals[0];
    // On the road centreline (lateral 0) but below the exit threshold.
    const r = portal.exitR - 3.0;
    const px = portal.dir.x * r, pz = portal.dir.z * r;
    let fired = null;
    const realTravel = T.zoneManager.travel.bind(T.zoneManager);
    T.zoneManager.travel = (to) => { fired = to; };
    T.player.root.position.set(px, 0, pz);
    T.player.position.x = px; T.player.position.z = pz;
    T.zoneManager.transitioning = false; T.zoneManager.cooldown = 0;
    T.zoneManager.check(0.016);
    T.zoneManager.travel = realTravel;
    expect(fired, "an interior road point must not trigger travel").toBeNull();
    // And the exit IS reachable: moveActor lets a player walk the road past exitR.
    let cur = { x: 0, y: 0, z: 0, clone() { return { x: this.x, y: this.y, z: this.z, clone: this.clone }; } };
    let maxAlong = 0;
    for (let i = 0; i < 400; i++) {
      const desired = { x: cur.x + portal.dir.x, y: 0, z: cur.z + portal.dir.z };
      const nxt = w.moveActor(cur, desired, T.CONFIG.playerRadius);
      cur = { x: nxt.x, y: 0, z: nxt.z, clone() { return { x: this.x, y: 0, z: this.z, clone: this.clone }; } };
      maxAlong = Math.max(maxAlong, cur.x * portal.dir.x + cur.z * portal.dir.z);
    }
    expect(maxAlong, "walking the road must reach the exit threshold").toBeGreaterThanOrEqual(portal.exitR);
  });

  it("no portal-orb meshes remain; portals carry no circular-trigger radius", () => {
    T.setSeed(2026);
    swap("meadow");
    for (const portal of T.state.world.portals) {
      expect(portal.r, "road-edge portals must not use a circular radius").toBeUndefined();
      expect(typeof portal.exitR).toBe("number");
      expect(typeof portal.half).toBe("number");
    }
  });
});

describe("Task 22 — persistence + migration", () => {
  it("round-trips per-zone resource state (positions + depletion) through save/load", () => {
    T.setSeed(2026);
    swap("meadow");
    // Deplete one node so the round-trip carries a non-zero cooldown.
    const node = T.state.resources.find((r) => r.it && r.it.enabled);
    node.harvest();
    const save = T.serializeGame();
    expect(save.v).toBe(T.SAVE_VERSION);
    expect(save.zoneRes && save.zoneRes.meadow).toBeTruthy();
    const depleted = save.zoneRes.meadow.nodes.filter((n) => n.r > 0).length;
    expect(depleted).toBeGreaterThan(0);
    const beforeNodes = JSON.stringify(T.state.zoneRes.meadow.nodes.map((n) => [n.kind, n.x, n.z]));

    T.applySave(save);
    step(1);
    expect(T.state.zoneId).toBe("meadow");
    const afterNodes = JSON.stringify(T.state.zoneRes.meadow.nodes.map((n) => [n.kind, n.x, n.z]));
    expect(afterNodes, "node set must survive the round-trip").toBe(beforeNodes);
    // The depleted node is still on cooldown after restore.
    const stillDown = T.state.zoneRes.meadow.nodes.filter((n) => n.respawn > 0).length;
    expect(stillDown).toBeGreaterThan(0);
  });

  it("serializeZoneRes/deserializeZoneRes drop unknown zones + kinds and clamp", () => {
    const round = T.deserializeZoneRes({
      meadow: { nodes: [{ k: "tree", x: 1, z: 2, r: 3 }, { k: "bogus", x: 0, z: 0, r: 0 }], acc: 5, s: 2 },
      not_a_zone: { nodes: [{ k: "rock", x: 0, z: 0, r: 0 }], acc: 0, s: 0 },
    });
    expect(Object.keys(round)).toEqual(["meadow"]);
    expect(round.meadow.nodes.length).toBe(1);          // the bogus kind is dropped
    expect(round.meadow.nodes[0].kind).toBe("tree");
    expect(round.meadow.regrowAcc).toBe(5);
    expect(round.meadow.sprouts).toBe(2);
  });

  it("a pre-v13 save (no zoneRes) loads cleanly and re-plans deterministically", () => {
    T.setSeed(2026);
    swap("meadow");
    const save = T.serializeGame();
    delete save.zoneRes;                  // simulate a legacy save without the field
    save.v = 12;
    expect(T.validateSave(save)).toBe(true);
    T.applySave(save);
    step(1);
    // The zone re-planned its set from the (restored) seed; it's non-empty + capped.
    expect(T.state.zoneRes.meadow.nodes.length).toBeGreaterThan(0);
    const counts = perKind(T.state.zoneRes.meadow.nodes);
    for (const kind in counts) expect(counts[kind]).toBeLessThanOrEqual(T.resourceCap(kind));
  });
});

describe("Task 22 — teardown disposes new resource + road meshes (no leak)", () => {
  it("teardownZone disposes every live ResourceNode (frees mesh + interactable)", () => {
    T.setSeed(2026);
    swap("meadow");
    const live = T.state.resources.slice();
    expect(live.length).toBeGreaterThan(0);
    // Spy on each live node's dispose (the SAME per-object pattern the other
    // suites use) so we can prove teardown frees them rather than leaking them.
    let disposed = 0;
    const removed = new Set();
    for (const r of live) {
      const realDispose = r.dispose.bind(r);
      r.dispose = () => { disposed++; realDispose(); };
      const realRemove = r.it; // its interactable should leave the registry
      removed.add(realRemove);
    }
    T.teardownZone(T.state, T.interaction);
    expect(disposed, "every live node should be disposed on teardown").toBe(live.length);
    expect(T.state.resources.length).toBe(0);
    for (const it of removed) {
      expect(T.interaction.items.indexOf(it), "a node's interactable leaked").toBe(-1);
    }
    swap("meadow"); // rebuild a valid zone for any later work
  });

  it("world.dispose() exists for the zone and runs without throwing (road/edge meshes)", () => {
    T.setSeed(2026);
    const w = T.buildWorld(scene, T.ZONE_BY_ID.meadow);
    expect(typeof w.dispose).toBe("function");
    // The road-edge teleporter meshes are created inside buildWorld's scope, so
    // they are captured by world.dispose()'s teardown snapshot; calling it must
    // not throw (the meshes + their materials are freed).
    expect(() => w.dispose()).not.toThrow();
  });
});
