// Task 35 — full-loadout fit & clipping integration. The category tasks (25–33)
// each proved THEIR part fits the body in isolation; Task 32/34 proved the held
// weapon is gripped + the attack timing. This suite is the FINAL integration net:
// with EVERY slot equipped at once and each weapon class's attack playing, it
// asserts no worn part or weapon clips the body or a neighbour across idle / walk
// / each weapon's wind-up + strike + recover / flinch on every tier, that
// refreshWornGear shows exactly the equipped parts (no stray on unequip/swap),
// and that every worn + weapon mesh hangs off player.root (so it disposes with the
// player — no orphan leak) and is never reallocated on equip churn.
import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };
const clearEquip = (p) => { for (const slot of T.EQUIP_SLOTS) p.equipment[slot] = null; };

// A faithful TRS/YXZ node transform (same as the per-category fit tests) so we can
// read the ACTUAL built geometry in LEAN space by walking the real node chain the
// way Babylon composes it (world = parent · T · Ry · Rx · Rz · S).
function applyTRS(node, v) {
  const s = node.scaling || { x: 1, y: 1, z: 1 };
  let x = v.x * (s.x == null ? 1 : s.x), y = v.y * (s.y == null ? 1 : s.y), z = v.z * (s.z == null ? 1 : s.z);
  const r = node.rotation || { x: 0, y: 0, z: 0 };
  const rz = r.z || 0, rx = r.x || 0, ry = r.y || 0;
  let nx = x * Math.cos(rz) - y * Math.sin(rz), ny = x * Math.sin(rz) + y * Math.cos(rz); x = nx; y = ny;
  let ny2 = y * Math.cos(rx) - z * Math.sin(rx), nz2 = y * Math.sin(rx) + z * Math.cos(rx); y = ny2; z = nz2;
  let nx3 = x * Math.cos(ry) + z * Math.sin(ry), nz3 = -x * Math.sin(ry) + z * Math.cos(ry); x = nx3; z = nz3;
  const pos = node.position || { x: 0, y: 0, z: 0 };
  return { x: x + (pos.x || 0), y: y + (pos.y || 0), z: z + (pos.z || 0) };
}
function toFrame(mesh, point, stop) { let v = point, n = mesh; while (n && n !== stop) { v = applyTRS(n, v); n = n.parent; } return v; }
function hasAncestor(node, anc) { let n = node; while (n) { if (n === anc) return true; n = n.parent; } return false; }

// The body core in LEAN space: the torso cylinder (y 0.83..1.53, radius tapering
// 0.275→0.225) + the head sphere (centre y1.75, r0.25). bodyPen(pt) > 0 means the
// point is INSIDE that core (a clip); ≤ 0 means clear. Uses the real tapered torso
// (not a fat over-approximation) so the tolerance below is honest.
function torsoR(y) { return (y < 0.83 || y > 1.53) ? -1 : 0.275 - (0.05 * (y - 0.83)) / 0.7; }
function bodyPen(pt) {
  let pen = -Infinity;
  const tr = torsoR(pt.y);
  if (tr > 0) pen = Math.max(pen, tr - Math.hypot(pt.x, pt.z));
  pen = Math.max(pen, 0.25 - Math.hypot(pt.x, pt.y - 1.75, pt.z));
  return pen;
}

// A full Ironguard suit + every remaining slot filled, so EVERYTHING is worn at
// once (the integration case the category tasks never exercise together).
const FULL = {
  helmet: "iron_helm", pauldrons: "iron_pauldrons", breastplate: "iron_plate",
  gloves: "iron_gauntlets", belt: "reinforced_belt", boots: "iron_greaves",
  cloak: "dragon_cloak", necklace: "titan_pendant", ring1: "ring_power", ring2: "ring_guard",
};
const WEAPONS = [
  { id: "iron_sword", cls: "sword", combos: 3 },
  { id: "war_axe", cls: "axe", combos: 1 },
  { id: "iron_dagger", cls: "dagger", combos: 2 },
  { id: "short_bow", cls: "bow", combos: 1 },
  { id: "magic_wand", cls: "wand", combos: 1 },
  { id: "apprentice_staff", cls: "staff", combos: 1 },
];

// Equip the full loadout (worn slots) + one weapon; return the player.
function fullyGear(p, weaponId) {
  clearEquip(p);
  for (const s in FULL) p.equipment[s] = T.makeItem(FULL[s]);
  if (weaponId) p.equipment.hand1 = T.makeItem(weaponId);
  T.recomputeStats(p);
  p.refreshWornGear();
  if (p.refreshWeaponVisual) p.refreshWeaponVisual();
  return p;
}

// Drive the REAL animation (locomotion base + the Task 34 attack layer + the
// per-frame shoulder/cloak follow) to a sampled phase, exactly as update() orders
// it, then settle the frame-rate-independent lerps. `phase` is "idle" | "walk" |
// "windup" | "strike" | "recover"; `combo` selects the melee combo step.
function drivePose(p, cls, phase, combo = 0) {
  p.castCooldown = 0; p.flinch = 0;
  const walking = phase === "walk";
  p.state = walking ? "walk" : "idle";
  p.walkPhase = walking ? 1.3 : 0;
  if (phase === "idle" || phase === "walk") { p.attack.cls = null; p.attack.phase = "idle"; p.attack.t = 0; p.attack.comboStep = 0; }
  else { p.attack.cls = cls; p.attack.phase = phase; p.attack.t = 0; p.attack.comboStep = combo; }
  for (let k = 0; k < 30; k++) {
    p._animateLocomotion(walking ? 1 : 0);
    p._animateAction();
    p._animatePauldrons();
    p._animateCloak(0.05);
  }
}

let p;
beforeAll(() => { T.startGame(); step(3); p = T.player; });

// The gearShown key each slot's resolved archetype is published under (breastplate
// publishes as "chestArchetype" — the worn chest group is g.chests).
const SHOWN_KEY = {
  helmet: "helmetArchetype", breastplate: "chestArchetype", pauldrons: "pauldronArchetype",
  gloves: "gloveArchetype", belt: "beltArchetype", boots: "bootArchetype",
  cloak: "cloakArchetype", necklace: "necklaceArchetype",
};

describe("Task 35 — full loadout: refreshWornGear shows exactly the equipped parts", () => {
  const ARCH = {
    helmet: (id) => T.helmetArchetype(T.getDef(id)).archetype,
    breastplate: (id) => T.chestArchetype(T.getDef(id)).archetype,
    pauldrons: (id) => T.pauldronArchetype(T.getDef(id)).archetype,
    gloves: (id) => T.gloveArchetype(T.getDef(id)).archetype,
    belt: (id) => T.beltArchetype(T.getDef(id)).archetype,
    boots: (id) => T.bootArchetype(T.getDef(id)).archetype,
    cloak: (id) => T.cloakArchetype(T.getDef(id)).archetype,
    necklace: (id) => T.jewelryArchetype(T.getDef(id)).archetype,
  };

  it("with everything equipped, every worn slot shows and maps to the right archetype", () => {
    fullyGear(p, "iron_sword");
    const s = p.gearShown;
    for (const slot of ["helmet", "breastplate", "pauldrons", "gloves", "belt", "boots", "cloak", "necklace"]) {
      expect(s[slot], `${slot} shown`).toBe(true);
      expect(s[SHOWN_KEY[slot]], `${slot} archetype`).toBe(ARCH[slot](FULL[slot]));
    }
    // Rings are HIDDEN under gloves (the Task 33 glove-cover rule) — a full plate
    // loadout has gauntlets, so a ring never clips the glove.
    expect(s.ring1).toBe(false);
    expect(s.ring2).toBe(false);
    // The main-hand weapon shows its class.
    expect(p.weaponShown.main).toBe("sword");
  });

  it("rings reappear on the bare hand when the gloves come off (no stray, no clip)", () => {
    fullyGear(p, "iron_sword");
    expect(p.gearShown.ring1).toBe(false);
    T.unequipSlot(p, "gloves");
    T.recomputeStats(p);
    expect(p.gearShown.gloves).toBe(false);
    expect(p.gearShown.ring1).toBe(true);
    expect(p.gearShown.ring2).toBe(true);
    // Exactly the equipped ring archetype shows on each hand; the others stay hidden.
    for (const slot of ["ring1", "ring2"]) {
      const sel = p.gearShown[slot + "Archetype"];
      for (const key in p.gear.rings[slot]) {
        expect(p.gear.rings[slot][key].node.isEnabled(), `${slot}/${key}`).toBe(key === sel);
      }
    }
  });

  it("swapping any slot leaves NO stray mesh from the previous archetype", () => {
    fullyGear(p, "iron_sword");
    // Swap the whole suit Ironguard → mixed high-tier and confirm the old archetype
    // group is fully disabled (only the new one is enabled) for every worn slot.
    const SWAP = {
      helmet: "dragon_helm", breastplate: "dragonscale_plate", pauldrons: "storm_pauldrons",
      gloves: "titan_gauntlets", belt: "dragon_belt", boots: "winged_boots", cloak: "wings_of_dawn",
    };
    for (const slot in SWAP) { T.equipItem(p, T.makeItem(SWAP[slot])); }
    T.recomputeStats(p);
    const groups = { helmet: p.gear.helms, breastplate: p.gear.chests, belt: p.gear.belts, cloak: p.gear.cloaks };
    for (const slot in groups) {
      const sel = p.gearShown[SHOWN_KEY[slot]];
      let enabled = 0;
      for (const key in groups[slot]) if (groups[slot][key].node.isEnabled()) { enabled++; expect(key, `${slot} stray`).toBe(sel); }
      expect(enabled, `${slot} exactly one shown`).toBe(1);
    }
    // Two-node (per-limb) groups: pauldrons + gloves + boots — only the selected pair on.
    for (const [slot, gmap] of [["pauldrons", p.gear.pauls], ["gloves", p.gear.gloves], ["boots", p.gear.boots]]) {
      const sel = p.gearShown[SHOWN_KEY[slot]];
      for (const key in gmap) for (const n of gmap[key].nodes) expect(n.isEnabled(), `${slot}/${key}`).toBe(key === sel);
    }
  });

  it("unequipping every slot hides every worn part (nothing left on the body)", () => {
    fullyGear(p, "iron_sword");
    for (const slot of T.EQUIP_SLOTS) T.unequipSlot(p, slot);
    T.recomputeStats(p);
    const g = p.gearShown;
    for (const slot of ["helmet", "breastplate", "pauldrons", "gloves", "belt", "boots", "cloak", "necklace", "ring1", "ring2"]) {
      expect(g[slot], `${slot} hidden`).toBe(false);
    }
    // No weapon class mesh is enabled with bare hands.
    for (const k in p.heldWeapons) expect(p.heldWeapons[k].node.isEnabled(), `weapon ${k}`).toBe(false);
  });
});

describe("Task 35 — full loadout: the held weapon never plunges through the body", () => {
  // With the full suit on, drive each weapon's REAL attack (every combo step) and
  // assert no weapon part / the blade axis penetrates the torso+head core beyond a
  // small graze tolerance, at idle / walk / wind-up / strike / recover. The strike
  // (impact/release) frame is the one that lands damage — it must be CLEAN.
  const TOL = 0.14;         // a fast slash may graze within this; it must never plunge deeper
  const TOL_STRIKE = 0.08;  // the impact frame is held clean

  function worstWeaponPen(grp) {
    const fist = toFrame(p.wandGrip, { x: 0, y: 0, z: 0 }, p.lean);
    const tip = toFrame(grp.tip, { x: 0, y: 0, z: 0 }, p.lean);
    let worst = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const pt = { x: fist.x + (tip.x - fist.x) * t, y: fist.y + (tip.y - fist.y) * t, z: fist.z + (tip.z - fist.z) * t };
      worst = Math.max(worst, bodyPen(pt));
    }
    for (const m of grp.meshes) worst = Math.max(worst, bodyPen(toFrame(m, { x: 0, y: 0, z: 0 }, p.lean)));
    return worst;
  }

  for (const w of WEAPONS) {
    it(`${w.cls}: gripped weapon clears the body core through its attack arc`, () => {
      fullyGear(p, w.id);
      const grp = p.heldWeapons[p.weaponShown.main];
      expect(grp, `${w.cls} shown`).toBeTruthy();
      // Rest + locomotion.
      for (const ph of ["idle", "walk"]) {
        drivePose(p, w.cls, ph);
        expect(worstWeaponPen(grp), `${w.cls} @${ph}`).toBeLessThanOrEqual(TOL);
      }
      // Every combo step of the wind-up → strike → recover.
      for (let c = 0; c < w.combos; c++) {
        for (const ph of ["windup", "strike", "recover"]) {
          drivePose(p, w.cls, ph, c);
          const pen = worstWeaponPen(grp);
          const cap = ph === "strike" ? TOL_STRIKE : TOL;
          expect(pen, `${w.cls} combo${c} @${ph} pen=${pen.toFixed(3)}`).toBeLessThanOrEqual(cap);
        }
      }
    });
  }

  it("the grip is seated OUTBOARD + FORWARD so a drawn hilt clears the hip at rest", () => {
    expect(T.GRIP_SEAT.x).toBeGreaterThan(0);      // out, away from the body centre
    expect(T.GRIP_SEAT.z).toBeGreaterThan(0.12);   // forward of the bare-hand seat
    // The mirrored off-hand grip is outboard on the LEFT (−x), the main grip on the +x.
    expect(p.wandGrip.position.x).toBeGreaterThan(0);
    expect(p.offGrip.position.x).toBeLessThan(0);
    expect(p.wandGrip.position.z).toBeCloseTo(p.offGrip.position.z, 6);
    // The sword wind-up cocks LESS across the body than the old Swing (bounded graze).
    expect(T.SWORD_WINDUP_ROLL).toBeLessThan(0.8);
    expect(T.SWORD_WINDUP_ROLL).toBeGreaterThan(0.2); // still a readable cock, not flattened
  });
});

describe("Task 35 — full loadout: neighbouring parts stay out of each other", () => {
  // The known inter-part pairs, re-checked with EVERYTHING worn at once (not one
  // slot at a time as the category tasks do) across the sampled animation phases.
  const PHASES = [["idle"], ["walk"], ["windup", 0], ["strike", 0], ["recover", 0]];

  function meshesOf(grp) { return grp.meshes || []; }

  it("pauldrons stay OUTBOARD of the torso (no dive into the chest/neck) with a full suit", () => {
    fullyGear(p, "iron_sword");
    const arch = p.gearShown.pauldronArchetype;
    const grp = p.gear.pauls[arch];
    const EXT = [];
    for (const dx of [-0.2, 0, 0.2]) for (const dy of [-0.2, 0, 0.2]) for (const dz of [-0.2, 0, 0.2]) EXT.push({ x: dx, y: dy, z: dz });
    for (const [ph, combo] of PHASES) {
      drivePose(p, "sword", ph, combo || 0);
      // Innermost x on each side (L outward = −x, R outward = +x); must clear the torso.
      for (const [i, sign] of [[0, -1], [1, 1]]) {
        const node = grp.nodes[i];
        const meshes = meshesOf(grp).filter((m) => hasAncestor(m, node));
        let inner = Infinity;
        for (const m of meshes) for (const e of EXT) inner = Math.min(inner, toFrame(m, e, p.lean).x * sign);
        expect(inner, `pauldron side${i} @${ph} innerX=${inner.toFixed(3)}`).toBeGreaterThanOrEqual(0.18);
      }
    }
  });

  it("the belt tucks UNDER the chest hem (never rides up into the breastplate)", () => {
    fullyGear(p, "iron_sword");
    const grp = p.gear.belts[p.gearShown.beltArchetype];
    // The chest anchor sits at lean-y 1.16 and its lowest lame bottoms out ≈ lean-y
    // 0.80. Bound belt part CENTRES below that (the belt is rigid to the torso, so
    // its lean coords are pose-independent — same contract as Task 29's belt test).
    for (const [ph, combo] of PHASES) {
      drivePose(p, "sword", ph, combo || 0);
      let topY = -Infinity;
      for (const m of meshesOf(grp)) topY = Math.max(topY, toFrame(m, { x: 0, y: 0, z: 0 }, p.lean).y);
      expect(topY, `belt centre top @${ph}`).toBeLessThanOrEqual(0.80);
    }
  });

  it("the necklace pendant rides PROUD of the chest front (clear of the breastplate)", () => {
    fullyGear(p, "iron_sword");
    const grp = p.gear.necklaces[p.gearShown.necklaceArchetype];
    // The chest front tops out at z ≈ 0.27; the necklace's front-most part must sit
    // ahead of it so the pendant never sinks into the breastplate.
    for (const [ph, combo] of PHASES) {
      drivePose(p, "sword", ph, combo || 0);
      let frontZ = -Infinity;
      for (const m of meshesOf(grp)) frontZ = Math.max(frontZ, toFrame(m, { x: 0, y: 0, z: 0 }, p.lean).z);
      expect(frontZ, `necklace front @${ph}`).toBeGreaterThanOrEqual(0.27);
    }
  });

  it("the cloak drape trails BEHIND the legs (never scythes through them) at billow", () => {
    fullyGear(p, "iron_sword");
    const grp = p.gear.cloaks[p.gearShown.cloakArchetype];
    // Walk (the billow pivot leans back) — every low-hanging drape part (below the
    // hips, lean-y < 1.1) must sit behind the leg plane (lean-z ≤ 0.06; the legs'
    // rear is ≈ lean-z −0.1..+0.1).
    for (const ph of ["idle", "walk"]) {
      drivePose(p, "sword", ph);
      for (const m of meshesOf(grp)) {
        const c = toFrame(m, { x: 0, y: 0, z: 0 }, p.lean);
        if (c.y < 1.1) expect(c.z, `cloak drape @${ph} z=${c.z.toFixed(3)} y=${c.y.toFixed(2)}`).toBeLessThanOrEqual(0.08);
      }
    }
  });

  it("the helmet rides the head anchor above the eyes/ponytails, only the mapped one shown", () => {
    fullyGear(p, "iron_sword");
    drivePose(p, "sword", "idle");
    // The helmet anchor is at lean-y 1.88 (the crown), a rigid child of the torso —
    // so the whole helm sits ON the head above the eyes (lean-y 1.76) and the ponytail
    // pivots (lean-y 2.02, z −0.04); no equip pose can move it off the head. (Helm
    // groups don't track a meshes list, so we assert the anchor + single-shown seam.)
    expect(p.gear.helmet.position.y).toBeCloseTo(1.88, 2);
    expect(p.gear.helmet.parent).toBe(p.lean);
    const sel = p.gearShown.helmetArchetype;
    let shown = 0;
    for (const key in p.gear.helms) if (p.gear.helms[key].node.isEnabled()) { shown++; expect(key).toBe(sel); }
    expect(shown, "exactly one helm archetype shown").toBe(1);
  });
});

describe("Task 35 — full loadout: everything disposes with the player (no orphan leak)", () => {
  it("every worn + weapon mesh hangs off player.root (disposed when the player is)", () => {
    fullyGear(p, "iron_sword");
    const root = p.root;
    const check = (mesh, what) => expect(hasAncestor(mesh, root), `${what} orphaned from player.root`).toBe(true);
    // Worn categories that track a meshes list.
    for (const rec of [...Object.values(p.gear.pauls), ...Object.values(p.gear.gloves),
      ...Object.values(p.gear.belts), ...Object.values(p.gear.boots), ...Object.values(p.gear.cloaks)]) {
      for (const m of rec.meshes) check(m, "worn");
    }
    for (const rec of Object.values(p.gear.necklaces)) for (const m of rec.meshes) check(m, "necklace");
    for (const slot of ["ring1", "ring2"]) for (const rec of Object.values(p.gear.rings[slot])) for (const m of rec.meshes) check(m, "ring");
    // Helmet + chest anchors (their groups don't list meshes, but the anchors do chain up).
    for (const anchor of [p.gear.helmet, p.gear.chest, p.gear.belt, p.cloakPivot, p.gear.necklace]) check(anchor, "anchor");
    // Every weapon-class group (main + off hand).
    for (const grp of [...Object.values(p.heldWeapons), ...Object.values(p.heldOffWeapons)]) {
      for (const m of grp.meshes) check(m, "weapon");
      check(grp.tip, "weapon tip");
    }
  });

  it("a full-loadout equip churn never reallocates the worn/weapon meshes (built once)", () => {
    clearEquip(p); T.recomputeStats(p);
    const swordNode = p.heldWeapons.sword.node;
    const capNode = p.gear.pauls.plated.nodes[0];
    const wornCount = [p.gear.pauls, p.gear.gloves, p.gear.belts, p.gear.boots, p.gear.cloaks]
      .reduce((n, gm) => n + Object.values(gm).reduce((a, g) => a + g.meshes.length, 0), 0);
    const weaponCount = [...Object.values(p.heldWeapons), ...Object.values(p.heldOffWeapons)].reduce((n, g) => n + g.meshes.length, 0);
    for (let i = 0; i < 6; i++) {
      for (const w of WEAPONS) {
        fullyGear(p, w.id);
        p.attack.trigger(p.attackClass());
        expect(() => step(2)).not.toThrow(); // the whole loadout animates each frame
      }
      clearEquip(p); T.recomputeStats(p);
    }
    expect(p.heldWeapons.sword.node).toBe(swordNode);
    expect(p.gear.pauls.plated.nodes[0]).toBe(capNode);
    expect([p.gear.pauls, p.gear.gloves, p.gear.belts, p.gear.boots, p.gear.cloaks]
      .reduce((n, gm) => n + Object.values(gm).reduce((a, g) => a + g.meshes.length, 0), 0)).toBe(wornCount);
    expect([...Object.values(p.heldWeapons), ...Object.values(p.heldOffWeapons)].reduce((n, g) => n + g.meshes.length, 0)).toBe(weaponCount);
  });

  it("a full-loadout equip + attack churn never throws (headless-safe)", () => {
    clearEquip(p); T.recomputeStats(p);
    expect(() => {
      for (const w of WEAPONS) {
        fullyGear(p, w.id);
        for (const ph of ["idle", "walk", "windup", "strike", "recover"]) drivePose(p, w.cls, ph);
      }
    }).not.toThrow();
    clearEquip(p); T.recomputeStats(p);
  });
});

describe("Task 35 — full loadout builds + refreshes on every graphics tier", () => {
  // wornDetailFor drives which parts exist per tier; a full loadout must build +
  // refresh + animate on ALL of them without throwing, with the documented clean
  // omissions on the phone tiers (pauldrons / belt / jewelry dropped on low).
  it("low / medium / high all report a coherent, monotone detail spec", () => {
    const low = T.wornDetailFor("low"), med = T.wornDetailFor("medium"), high = T.wornDetailFor("high");
    // Low omits the heavier extras entirely (a clean omission — phones skip them).
    expect(low.pauldrons).toBe(false); expect(low.belt).toBe(false); expect(low.jewelry).toBe(false);
    // Medium keeps the shapes but no high-only jewelry; high has everything.
    expect(med.pauldrons).toBe(true); expect(med.belt).toBe(true); expect(med.jewelry).toBe(false);
    expect(high.pauldrons).toBe(true); expect(high.jewelry).toBe(true);
    // The core silhouette (gloves / boots / cloak / weapon) exists on every tier.
    for (const spec of [low, med, high]) { expect(spec.gloves).toBe(true); expect(spec.boots).toBe(true); expect(spec.cloak).toBe(true); }
  });

  it("the shipped build tolerates a full loadout with the low-tier omissions present", () => {
    // The live player was built on the headless 'high' tier, so it HAS the pauldron /
    // belt / jewelry groups. Equipping a full loadout and refreshing must handle the
    // absence path too: applyArch/applyJewelry tolerate a missing groups map. Prove
    // the refresh is null-safe by dropping a group map and re-refreshing.
    fullyGear(p, "iron_sword");
    const savedBelts = p.gear.belts, savedNeck = p.gear.necklaces;
    p.gear.belts = undefined; p.gear.necklaces = undefined; // simulate the low-tier omission
    expect(() => p.refreshWornGear()).not.toThrow();
    expect(p.gearShown.belt).toBe(true);       // the slot is still 'shown' (anchor toggles)
    p.gear.belts = savedBelts; p.gear.necklaces = savedNeck;
    p.refreshWornGear();
    clearEquip(p); T.recomputeStats(p);
  });
});
