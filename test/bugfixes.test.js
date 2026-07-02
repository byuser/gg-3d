// Task 10 — logic/code/UI bug-fix coverage. Boots the assembled game against the
// Babylon/DOM stubs and locks in each fix so it can't silently regress:
//   • roads never cross open water off a bridge (seeded layouts)
//   • a hard cap bounds live resource nodes (spawn / respawn / travel / reload)
//   • resource harvest works through the real interact path (incl. post-travel)
//   • built castle parts are SOLID collision for the player + wand bolts (gate
//     stays passable); the footprint round-trips through a save/zone rebuild
//   • the swing lands damage on its STRIKE (impact) frame, in arc + range, once
import { describe, it, expect, beforeAll } from "vitest";
import { scenes, Vec3, handlers } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };
const key = (code, down = true) =>
  (handlers[down ? "keydown" : "keyup"] || []).forEach((f) => f({ code, preventDefault() {} }));
const toHub = () => { if (T.state.zoneId !== T.HUB_ZONE) T.zoneManager._swap(T.state.zoneId, T.HUB_ZONE, T.ZONE_BY_ID[T.HUB_ZONE]); };

beforeAll(() => { T.startGame(); step(3); });

describe("Task 10 — roads never cross open water without a bridge", () => {
  it("has zero road-over-open-water cells across 40 seeded hub layouts", () => {
    for (let s = 1; s <= 40; s++) {
      T.setSeed(s);
      const w = T.buildWorld(scene, T.ZONE_BY_ID[T.HUB_ZONE]);
      const R = w.radius - 1;
      let overWater = 0, openWater = 0, bridge = 0;
      for (let x = -R; x <= R; x += 1.5) {
        for (let z = -R; z <= R; z += 1.5) {
          if (x * x + z * z > R * R) continue;
          const onR = w.onRoad(x, z), inW = w.inRiver(x, z), onB = w.onBridge(x, z);
          if (onR && inW) overWater++;
          if (inW) openWater++;
          if (onB) bridge++;
        }
      }
      expect(overWater, `seed ${s}: a road crosses open water`).toBe(0);
      expect(openWater, `seed ${s}: the river still has open (blocking) water`).toBeGreaterThan(0);
      expect(bridge, `seed ${s}: at least one walkable bridge exists`).toBeGreaterThan(0);
      if (w.dispose) w.dispose();
    }
  });

  it("road centrelines never run through open water, and a road actually spans the river", () => {
    T.setSeed(12345);
    const w = T.buildWorld(scene, T.ZONE_BY_ID[T.HUB_ZONE]);
    const R = w.radius - 2;
    let spansRiver = false;
    for (const r of w.roadLanes) {
      const nd = { x: r.dir.z, z: -r.dir.x };
      for (let t = -R; t <= R; t += 0.5) {
        const x = t * r.dir.x, z = t * r.dir.z;
        if (x * x + z * z > R * R) continue;
        expect(w.inRiver(x, z), "road centreline sits in open water").toBe(false);
        // If open water flanks the road here, the road must be spanning the river on a bridge.
        for (const o of [-9, -7, 7, 9]) if (w.inRiver(x + nd.x * o, z + nd.z * o)) spansRiver = true;
      }
    }
    expect(spansRiver, "at least one road bridges the river").toBe(true);
    if (w.dispose) w.dispose();
  });

  it("moveActor refuses to walk into open water", () => {
    T.setSeed(7);
    const w = T.buildWorld(scene, T.ZONE_BY_ID[T.HUB_ZONE]);
    const R = w.radius - 4;
    let blocked = false;
    for (let x = -R; x <= R && !blocked; x += 2) {
      for (let z = -R; z <= R && !blocked; z += 2) {
        if (!w.inRiver(x, z)) continue;
        // Approach the water point from 12m away along +x; must not end up wet.
        let p = new Vec3(x - 12, 0, z);
        if (w.inRiver(p.x, p.z)) continue;
        for (let i = 0; i < 30; i++) p = w.moveActor(p, new Vec3(p.x + 1, 0, z), T.CONFIG.playerRadius);
        if (!w.inRiver(p.x, p.z)) blocked = true;
      }
    }
    expect(blocked, "the river barrier stops the player entering open water").toBe(true);
    if (w.dispose) w.dispose();
  });
});

describe("Task 10 — resource nodes are capped + reliably harvestable", () => {
  it("never exceeds CONFIG.maxResourceNodes on spawn, travel or respawn", () => {
    toHub();
    expect(T.state.resources.length).toBeLessThanOrEqual(T.CONFIG.maxResourceNodes);
    // Travel out and back: the count resets per zone (teardown clears it) — no growth.
    T.zoneManager._swap(T.HUB_ZONE, "forest", T.ZONE_BY_ID.forest);
    expect(T.state.resources.length).toBeLessThanOrEqual(T.CONFIG.maxResourceNodes);
    toHub();
    expect(T.state.resources.length).toBeLessThanOrEqual(T.CONFIG.maxResourceNodes);
    // Respawning a node re-enables an EXISTING node — it never grows the count.
    const before = T.state.resources.length;
    const node = T.state.resources.find((r) => r.it && r.it.enabled);
    if (node) { node.harvest(); for (let i = 0; i < 2000 && node.respawn > 0; i++) node.update(0.05); }
    expect(T.state.resources.length).toBe(before);
  });

  it("enforces the cap even when it is set low", () => {
    const orig = T.CONFIG.maxResourceNodes;
    try {
      T.CONFIG.maxResourceNodes = 6;
      // Force a clean re-population of the hub under the low cap.
      T.zoneManager._swap(T.HUB_ZONE, "forest", T.ZONE_BY_ID.forest);
      T.zoneManager._swap("forest", T.HUB_ZONE, T.ZONE_BY_ID[T.HUB_ZONE]);
      expect(T.state.resources.length).toBeLessThanOrEqual(6);
    } finally {
      T.CONFIG.maxResourceNodes = orig;
      toHub();
    }
  });

  it("harvests an enabled node through the real walk-up + interact path", () => {
    toHub();
    const p = T.player;
    const node = new T.ResourceNode(scene, T.world.shadow, T.interaction,
      new Vec3(p.position.x + 1, 0, p.position.z), "tree", p, T.state);
    T.state.resources.push(node);
    const before = T.bagCount(p, "wood");
    key("KeyE"); step(1);                    // press interact, run one frame
    expect(T.interaction.current === node.it || node.respawn > 0).toBe(true);
    expect(T.bagCount(p, "wood")).toBeGreaterThan(before);
    expect(node.it.enabled).toBe(false);     // depleted → enters respawn cooldown
    expect(node.respawn).toBeGreaterThan(0);
  });

  it("still harvests right after a zone swap (no stale-interactable break)", () => {
    T.zoneManager._swap(T.state.zoneId, "shore", T.ZONE_BY_ID.shore);
    const p = T.player;
    const node = new T.ResourceNode(scene, T.world.shadow, T.interaction,
      new Vec3(p.position.x + 1, 0, p.position.z), "rock", p, T.state);
    T.state.resources.push(node);
    const before = T.bagCount(p, "stone");
    key("KeyE"); step(1);
    expect(T.bagCount(p, "stone")).toBeGreaterThan(before);
    toHub();
  });

  it("a disposed interactable sorts to the back instead of throwing", () => {
    const it = new T.ResourceNode(scene, T.world.shadow, T.interaction,
      new Vec3(0, 0, 0), "herb", T.player, T.state).it;
    it.node = { getAbsolutePosition() { throw new Error("disposed"); } };
    expect(() => it.distanceTo(new Vec3(0, 0, 0))).not.toThrow();
    expect(it.distanceTo(new Vec3(0, 0, 0))).toBe(Infinity);
  });
});

describe("Task 10 — built castle parts are solid (gate passable)", () => {
  it("registers solid collision; walls block, the gateway stays open", () => {
    const walls = T.castleCollisionCircles(["foundation", "walls"]);
    expect(walls.length).toBeGreaterThan(0);
    // Foundation alone is a walkable base — no collision.
    expect(T.castleCollisionCircles(["foundation"]).length).toBe(0);
    const all = T.castleCollisionCircles(["walls", "towers", "gate", "keep"]);
    const blockedAt = (x, z) => all.some((c) => Math.hypot(c.x - x, c.z - z) < c.r);
    expect(blockedAt(0, 6), "gateway centre stays passable").toBe(false);
    expect(blockedAt(0, -6), "south wall is solid").toBe(true);
    expect(blockedAt(6, 6), "corner tower is solid").toBe(true);
    expect(blockedAt(0, 0), "central keep is solid").toBe(true);
  });

  it("pushes the player out of a built wall and stops a wand bolt, but flies over it", () => {
    toHub();
    const site = T.state.castle;
    // Raise the whole castle (grant relics + coins, build in order).
    T.player.relics = T.CASTLE_PARTS.map((part) => part.relic);
    T.state.coins = 100000;
    site.built = []; site._syncCollision();
    for (const part of T.CASTLE_PARTS) site.build(part);
    const wall = T.world.obstacles.filter((o) => o._castle && o.r < 1.2);
    expect(wall.length, "castle registered wall circles in the obstacle set").toBeGreaterThan(0);
    const wc = wall[0];

    // Player push-out: stepping into a wall circle leaves the player outside it.
    const pr = T.CONFIG.playerRadius;
    const start = new Vec3(wc.x - (wc.r + pr + 0.02), 0, wc.z);
    const res = T.world.moveActor(start, new Vec3(wc.x, 0, wc.z), pr);
    expect(Math.hypot(res.x - wc.x, res.z - wc.z)).toBeGreaterThanOrEqual(wc.r + pr - 0.05);

    // A wand bolt at hand height inside the wall is destroyed (no shoot-through)…
    T.state.bolts.length = 0;
    const lowBolt = new T.Projectile(scene, T.world.shadow, new Vec3(wc.x, 1.3, wc.z), new Vec3(1, 0, 0), { speed: 0, gravity: 0 });
    T.state.bolts.push(lowBolt);
    step(1);
    expect(T.state.bolts.includes(lowBolt), "bolt collided with the wall").toBe(false);

    // …but a bolt passing high above the wall is NOT stopped (flies over).
    T.state.bolts.length = 0;
    const highBolt = new T.Projectile(scene, T.world.shadow, new Vec3(wc.x, 5, wc.z), new Vec3(1, 0, 0), { speed: 0, gravity: 0 });
    T.state.bolts.push(highBolt);
    step(1);
    expect(T.state.bolts.includes(highBolt), "a high bolt clears the wall").toBe(true);
    T.state.bolts.length = 0;
  });

  it("restores the castle's solid footprint after a zone rebuild", () => {
    toHub();
    const site = T.state.castle;
    site.built = ["foundation", "walls", "towers"]; site._syncCollision();
    expect(T.world.obstacles.some((o) => o._castle)).toBe(true);
    // Travel away (hub torn down) then back — the saved build re-raises collision.
    T.zoneManager._swap(T.HUB_ZONE, "peaks", T.ZONE_BY_ID.peaks);
    expect(T.world.obstacles.some((o) => o._castle)).toBe(false); // wild zone: no castle
    toHub();
    expect(T.state.castle.built).toContain("walls");
    expect(T.world.obstacles.some((o) => o._castle), "castle collision restored on return").toBe(true);
  });
});

describe("Task 10 — the swing lands in arc + range, on the strike frame, once", () => {
  it("meleeSweep only hits monsters inside the reach + frontal arc", () => {
    toHub();
    const st = T.state;
    st.monsters.length = 0;
    const mk = (x, z) => { const m = new T.Monster(scene, T.world.shadow, new Vec3(x, 0, z), 1); m.hp = m.maxHp = 1000; st.monsters.push(m); return m; };
    const front = mk(0, 2);    // in range + arc → hit
    const behind = mk(0, -2);  // behind → out of arc
    const side = mk(2.4, 0);   // 90° to the side → out of arc
    const far = mk(0, 5);      // in arc but well out of reach + radius
    T.meleeSweep(st, { weapon: { damage: 10, melee: { range: 2.5, arc: 1.6 } }, origin: new Vec3(0, 0, 0), dir: new Vec3(0, 0, 1) });
    expect(front.hp, "monster in front is struck").toBeLessThan(1000);
    expect(behind.hp, "monster behind is NOT struck").toBe(1000);
    expect(side.hp, "monster to the side is NOT struck").toBe(1000);
    expect(far.hp, "monster out of range is NOT struck").toBe(1000);
    st.monsters.length = 0;
  });

  it("melee damage waits for the strike frame and lands exactly once", () => {
    toHub();
    const st = T.state, p = T.player;
    // Equip a melee weapon (fists) so the cast is a melee swing.
    p.equipment.hand1 = null; p.equipment.hand2 = null; T.recomputeStats(p);
    st.monsters.length = 0;
    const m = new T.Monster(scene, T.world.shadow, new Vec3(p.position.x, 0, p.position.z + 1.4), 1);
    m.hp = m.maxHp = 1000; st.monsters.push(m);
    p.facing = 0; p.attack.phase = "idle"; p.attack.cls = null; st.pendingAttack = null; p.castCooldown = 0;
    key("Space"); step(1); key("Space", false);   // queue: attack in wind-up
    expect(st.pendingAttack, "attack is queued for the strike").toBeTruthy();
    expect(m.hp, "no damage during the wind-up").toBe(1000);
    let hpAtStrike = 1000;
    for (let i = 0; i < 20; i++) { step(1); if (m.hp < 1000 && hpAtStrike === 1000) hpAtStrike = m.hp; }
    expect(m.hp, "the strike landed").toBeLessThan(1000);
    // Exactly one hit: the queued attack cleared and only one strike's worth of damage landed.
    expect(st.pendingAttack).toBe(null);
    expect(1000 - hpAtStrike).toBeLessThanOrEqual(p.weapon.damage + 0.001);
    st.monsters.length = 0;
  });

  it("a ranged cast spawns its bolt on the strike frame, not the wind-up", () => {
    toHub();
    const st = T.state, p = T.player;
    p.equipment.hand1 = T.makeItem("magic_wand"); p.equipment.hand2 = null; T.recomputeStats(p);
    st.bolts.length = 0;
    p.attack.phase = "idle"; p.attack.cls = null; st.pendingAttack = null; p.castCooldown = 0;
    key("Space"); step(1);                      // queue: wand draw-back (wind-up)
    expect(st.bolts.length, "no bolt yet on the wind-up frame").toBe(0);
    let spawned = false;
    for (let i = 0; i < 20 && !spawned; i++) { step(1); if (st.bolts.length > 0) spawned = true; }
    key("Space", false);
    expect(spawned, "the bolt left the wand on the strike (thrust) frame").toBe(true);
    st.bolts.length = 0;
  });
});
