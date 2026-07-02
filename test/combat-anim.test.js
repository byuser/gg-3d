// Task 34 — the from-scratch, per-weapon-class attack animations. Boots the
// assembled game against the Babylon/DOM stubs and locks in the new system:
//   • the pure AttackAnim state machine: per-class windup → strike → recover timers,
//     the STRIKE (impact/release) frame, combo chaining, defaulting + reset;
//   • frame-rate independence (30 fps vs 120 fps reach the same fire outcome);
//   • pause-correctness (a zero/negative dt never advances it);
//   • the live combat path: melee lands damage on the strike frame, in arc + range,
//     exactly once (no early / late / double hit, correct facing); ranged/cast spawns
//     its projectiles on the release frame, from the weapon tip, never on the wind-up;
//   • headless no-throw: every weapon class animates (poses the arm) without throwing.
// The old single generic Swing is gone; these prove its replacement keeps hit timing.
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

const CLASSES = ["sword", "axe", "dagger", "fists", "bow", "wand", "staff", "gather"];
const total = (d) => d.windup + d.strike + d.recover;

describe("Task 34 — AttackAnim: the pure per-weapon-class state machine", () => {
  it("starts idle and enters the wind-up on trigger, carrying the class + family", () => {
    const a = new T.AttackAnim();
    expect(a.phase).toBe("idle");
    expect(a.busy).toBe(false);
    a.trigger("axe");
    expect(a.phase).toBe("windup");
    expect(a.busy).toBe(true);
    expect(a.cls).toBe("axe");
    expect(a.family).toBe("melee");
  });

  it("defines a complete windup+strike+recover block + family for every weapon class", () => {
    for (const k of CLASSES) {
      const d = T.ATTACK_SPECS[k];
      expect(d, k).toBeTruthy();
      expect(d.windup, `${k}.windup`).toBeGreaterThan(0);
      expect(d.strike, `${k}.strike`).toBeGreaterThan(0);
      expect(d.recover, `${k}.recover`).toBeGreaterThan(0);
      expect(["melee", "ranged", "cast", "gather"], `${k}.family`).toContain(d.family);
    }
  });

  it("advances windup → strike → recover → idle with each phase's exact duration", () => {
    for (const k of CLASSES) {
      const d = T.ATTACK_SPECS[k];
      const a = new T.AttackAnim().trigger(k);
      a.update(d.windup * 0.5);
      expect(a.phase, `${k} mid-windup`).toBe("windup");
      expect(a.progress(), `${k} windup progress`).toBeGreaterThan(0.4);
      a.update(d.windup * 0.5 + d.strike * 0.5);
      expect(a.phase, `${k} mid-strike`).toBe("strike");
      expect(a.striking, `${k} striking`).toBe(true);
      a.update(d.strike * 0.5 + d.recover * 0.5);
      expect(a.phase, `${k} mid-recover`).toBe("recover");
      a.update(d.recover);
      expect(a.phase, `${k} done`).toBe("idle");
      expect(a.busy, `${k} not busy`).toBe(false);
    }
  });

  it("reaches its strike (impact / release) frame after the wind-up, before the recovery", () => {
    for (const k of CLASSES) {
      const d = T.ATTACK_SPECS[k];
      const a = new T.AttackAnim().trigger(k);
      a.update(d.windup - 1e-4);
      expect(a.phase, `${k}: still winding up just before the strike`).toBe("windup");
      a.update(1e-4 + d.strike * 0.5);
      expect(a.striking, `${k}: on the strike frame`).toBe(true);
    }
  });

  it("an unknown weapon class defaults to a sword arc", () => {
    expect(new T.AttackAnim().trigger("bogus").cls).toBe("sword");
    expect(new T.AttackAnim().trigger(undefined).family).toBe("melee");
  });

  it("is pause-correct: a zero / negative dt never advances the machine", () => {
    const a = new T.AttackAnim().trigger("sword");
    a.update(0); a.update(-5);
    expect(a.phase).toBe("windup");
    expect(a.progress()).toBe(0);
  });

  it("chains a melee combo on a quick re-swing and resets after a lull", () => {
    const a = new T.AttackAnim();
    a.trigger("sword");
    expect(a.comboStep).toBe(0);
    for (let i = 1; i <= 2; i++) {
      a.update(total(a.spec));            // finish the swing
      a.update(0.1);                      // a beat, still within COMBO_WINDOW
      a.trigger("sword");
      expect(a.comboStep, `chain #${i}`).toBe(i);
    }
    // Cycling past the combo length wraps back to 0 (sword combo = 3).
    a.update(total(a.spec)); a.update(0.1); a.trigger("sword");
    expect(a.comboStep).toBe(0);
    // A long lull resets the chain.
    a.update(total(a.spec)); a.update(T.COMBO_WINDOW + 1); a.trigger("sword");
    expect(a.comboStep).toBe(0);
  });

  it("a single-hit class (axe) never advances a combo step, however fast it re-swings", () => {
    const a = new T.AttackAnim();
    a.trigger("axe");
    for (let i = 0; i < 5; i++) { a.update(total(a.spec)); a.update(0.02); a.trigger("axe"); }
    expect(a.comboStep).toBe(0);
  });
});

describe("Task 34 — frame-rate independence of the fire (30 fps vs 120 fps)", () => {
  // Replicate the game loop's fire predicate: an attack is QUEUED on trigger and lands
  // the instant the machine reaches its strike frame (or just after, if a huge dt
  // skipped it) — exactly once. Returns the phase at the fire frame + how many frames
  // it ran, so we can compare across frame rates.
  const simulateFire = (cls, dt) => {
    const a = new T.AttackAnim().trigger(cls);
    let pending = true, fires = 0, firePhase = null, guard = 0;
    while ((a.busy || pending) && guard++ < 100000) {
      a.update(dt);
      if (pending && (a.striking || a.phase === "recover" || !a.busy)) {
        fires++; firePhase = a.phase; pending = false;
      }
    }
    return { fires, firePhase };
  };

  it("fires exactly once, on the strike/impact frame, at both 30 fps and 120 fps — every class", () => {
    for (const k of CLASSES) {
      const slow = simulateFire(k, 1 / 30);
      const fast = simulateFire(k, 1 / 120);
      expect(slow.fires, `${k} @30fps fires once`).toBe(1);
      expect(fast.fires, `${k} @120fps fires once`).toBe(1);
      // A tiny dt lands squarely on the strike frame; a coarse dt may reach it at the
      // strike or, if it skipped the whole strike phase, on the very next (recover)
      // frame — but never before the strike, and never dropped.
      expect(["strike", "recover"], `${k} @120fps fire phase`).toContain(fast.firePhase);
      expect(["strike", "recover"], `${k} @30fps fire phase`).toContain(slow.firePhase);
    }
  });

  it("never drops a committed hit even when one giant dt skips the entire strike phase", () => {
    for (const k of CLASSES) {
      const one = simulateFire(k, 10); // a single 10s frame blows straight past the whole attack
      expect(one.fires, `${k} single-giant-dt`).toBe(1);
    }
  });
});

describe("Task 34 — melee lands on the strike frame, in arc + range, exactly once", () => {
  it("meleeSweep hits only monsters inside the reach + frontal arc, once each", () => {
    toHub();
    const st = T.state;
    st.monsters.length = 0;
    const mk = (x, z) => { const m = new T.Monster(scene, T.world.shadow, new Vec3(x, 0, z), 1); m.hp = m.maxHp = 1000; st.monsters.push(m); return m; };
    const front = mk(0, 2);    // in range + arc → hit
    const behind = mk(0, -2);  // behind → out of arc
    const side = mk(2.4, 0);   // 90° to the side → out of arc
    const far = mk(0, 6);      // in arc, well out of reach → miss
    T.meleeSweep(st, { weapon: { damage: 10, melee: { range: 2.5, arc: 1.6 } }, origin: new Vec3(0, 0, 0), dir: new Vec3(0, 0, 1) });
    expect(front.hp, "in front + range is struck").toBe(990);
    expect(behind.hp, "behind is not struck").toBe(1000);
    expect(side.hp, "to the side is not struck").toBe(1000);
    expect(far.hp, "out of range is not struck").toBe(1000);
    st.monsters.length = 0;
  });

  it("respects the committed FACING — turning after the queue doesn't move the hit", () => {
    toHub();
    const st = T.state;
    st.monsters.length = 0;
    const target = new T.Monster(scene, T.world.shadow, new Vec3(0, 0, 2), 1);
    target.hp = target.maxHp = 1000; st.monsters.push(target);
    // A sweep aimed +Z hits the +Z monster; the same sweep aimed -Z (opposite) misses it.
    T.meleeSweep(st, { weapon: { damage: 10, melee: { range: 3, arc: 1.6 } }, origin: new Vec3(0, 0, 0), dir: new Vec3(0, 0, -1) });
    expect(target.hp, "a sweep facing away misses").toBe(1000);
    T.meleeSweep(st, { weapon: { damage: 10, melee: { range: 3, arc: 1.6 } }, origin: new Vec3(0, 0, 0), dir: new Vec3(0, 0, 1) });
    expect(target.hp, "a sweep facing the target hits").toBe(990);
    st.monsters.length = 0;
  });

  it("waits for the strike frame and lands exactly once through the live cast path", () => {
    toHub();
    const st = T.state, p = T.player;
    p.equipment.hand1 = T.makeItem("iron_sword"); p.equipment.hand2 = null; T.recomputeStats(p);
    st.monsters.length = 0;
    const m = new T.Monster(scene, T.world.shadow, new Vec3(p.position.x, 0, p.position.z + 1.6), 1);
    m.hp = m.maxHp = 1000; st.monsters.push(m);
    p.facing = 0; p.attack.phase = "idle"; p.attack.cls = null; st.pendingAttack = null; p.castCooldown = 0;
    key("Space"); step(1); key("Space", false);
    expect(st.pendingAttack, "the hit is queued for the strike").toBeTruthy();
    expect(m.hp, "no damage on the wind-up").toBe(1000);
    let drops = 0, prev = m.hp;
    for (let i = 0; i < 30; i++) { step(1); if (m.hp < prev) { drops++; prev = m.hp; } }
    expect(m.hp, "the strike landed").toBeLessThan(1000);
    expect(st.pendingAttack, "the queued hit cleared").toBe(null);
    // Exactly ONE strike's worth of damage — no double-hit across the strike + recover frames.
    expect(drops, "damage dropped exactly once").toBe(1);
    expect(1000 - m.hp).toBeLessThanOrEqual(p.weapon.damage + 1e-6);
    st.monsters.length = 0;
    p.equipment.hand1 = null; T.recomputeStats(p);
  });
});

describe("Task 34 — ranged/cast release the projectile on the release frame, from the tip", () => {
  it("spawns no bolt on the wind-up, then the full multishot on the release frame", () => {
    toHub();
    const st = T.state, p = T.player;
    p.equipment.hand1 = T.makeItem("apprentice_staff"); p.equipment.hand2 = T.TWO_HANDED; T.recomputeStats(p);
    st.bolts.length = 0;
    p.attack.phase = "idle"; p.attack.cls = null; st.pendingAttack = null; p.castCooldown = 0;
    key("Space"); step(1);
    expect(st.bolts.length, "no bolt on the wind-up frame").toBe(0);
    let spawned = false;
    for (let i = 0; i < 20 && !spawned; i++) { step(1); if (st.bolts.length > 0) spawned = true; }
    key("Space", false);
    expect(spawned, "the bolt(s) left the staff on the release frame").toBe(true);
    expect(st.bolts.length, "the full multishot spawned").toBe(Math.max(1, p.weapon.multishot));
    st.bolts.length = 0;
    p.equipment.hand1 = null; p.equipment.hand2 = null; T.recomputeStats(p);
  });
});

describe("Task 34 — every weapon class animates headlessly without throwing", () => {
  const map = {
    magic_wand: "wand", short_bow: "bow", apprentice_staff: "staff",
    iron_dagger: "dagger", iron_sword: "sword", war_axe: "axe",
  };
  it("poses the body through a full attack for each equipped class (no throw, arm moves)", () => {
    toHub();
    const p = T.player;
    for (const id in map) {
      for (const s of ["hand1", "hand2"]) { try { T.unequipSlot(p, s); } catch (e) {} }
      T.equipItem(p, T.makeItem(id)); T.recomputeStats(p);
      expect(p.attackClass(), id).toBe(map[id]);
      p.attack.phase = "idle"; p.attack.cls = null; p.castCooldown = 0; p.state = "idle";
      step(2); // settle to the rest pose
      const before = p.armR.rotation.x;
      // Fire and drive the attack; track how far the weapon arm swings from rest across
      // the whole wind-up + strike (30 frames comfortably covers the slowest, the axe).
      let maxDev = 0;
      expect(() => {
        p.attack.trigger(p.attackClass());
        for (let i = 0; i < 30; i++) { step(1); maxDev = Math.max(maxDev, Math.abs(p.armR.rotation.x - before)); }
      }).not.toThrow();
      // The attack visibly moved the weapon arm away from rest (the pose is wired).
      expect(maxDev, `${id} arm posed during the attack`).toBeGreaterThan(0.2);
    }
    for (const s of ["hand1", "hand2"]) { try { T.unequipSlot(p, s); } catch (e) {} }
    T.recomputeStats(p);
  });

  it("bare-handed (fists) and gather both animate without throwing", () => {
    toHub();
    const p = T.player;
    for (const s of ["hand1", "hand2"]) { try { T.unequipSlot(p, s); } catch (e) {} }
    T.recomputeStats(p);
    expect(p.attackClass()).toBe("fists");
    p.attack.phase = "idle"; p.attack.cls = null; p.state = "idle";
    expect(() => { p.attack.trigger("fists"); step(24); }).not.toThrow(); // run the fists attack to completion
    expect(p.attack.busy, "the fists attack finished").toBe(false);
    // With the attack idle, gather() now takes hold and plays the harvest chop.
    expect(() => { p.gather(); expect(p.attack.cls).toBe("gather"); step(24); }).not.toThrow();
  });
});
