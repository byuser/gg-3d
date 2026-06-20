"use strict";
/*
 * Headless verification harness for js/game.js.
 *
 * Babylon.js needs a real WebGL canvas, which we don't have in Node. So we stub
 * the BABYLON engine + DOM with faithful Vector3/Color3 math and generic
 * mesh/node objects, then drive the game's render-loop observers by hand to
 * exercise the actual gameplay code (movement, collision, waves, boss, shop).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let uid = 1;
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) failures++; };

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setAll(v) { this.x = this.y = this.z = v; return this; }
  copyFrom(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
  copyFromFloats(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  add(o) { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z); }
  addInPlace(o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }
  subtract(o) { return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z); }
  scale(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  static Distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
}
class Color3 {
  constructor(r = 0, g = 0, b = 0) { this.r = r; this.g = g; this.b = b; }
  scale(s) { return new Color3(this.r * s, this.g * s, this.b * s); }
  toColor4() { return { r: this.r, g: this.g, b: this.b, a: 1 }; }
  static FromHexString(h) {
    h = String(h).replace("#", "");
    return new Color3(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  }
}

function makeNode() {
  const base = {
    position: new Vec3(), rotation: new Vec3(), scaling: new Vec3(1, 1, 1),
    uniqueId: uid++, isPickable: true, material: null, parent: null,
    dispose() {}, setParent() {}, setEnabled() {}, addShadowCaster() {},
    getAbsolutePosition() { return this.position; },
    receiveShadows: false, alpha: 1, intensity: 1, range: 1,
    diffuse: new Color3(), specularColor: new Color3(), diffuseColor: new Color3(),
    emissiveColor: new Color3(), groundColor: new Color3(),
  };
  return new Proxy(base, {
    get(t, p) { if (p in t) return t[p]; t[p] = undefined; return t[p]; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const Observable = () => { const l = []; return { add: (f) => l.push(f), _fire: (a) => l.forEach((f) => f(a)), list: l }; };
const scenes = [];

const BABYLON = {
  Vector3: Vec3, Color3,
  Engine: class { getDeltaTime() { return 16; } runRenderLoop() {} resize() {} },
  Scene: class { constructor() { this.onBeforeRenderObservable = Observable(); scenes.push(this); } render() {} executeWhenReady(cb) { cb(); } },
  ArcRotateCamera: class { constructor() { this.alpha = -Math.PI / 2; this.target = new Vec3(0, 1.4, 12); this.inputs = { removeByType() {} }; } attachControl() {} },
  HemisphericLight: class { constructor() { return makeNode(); } },
  DirectionalLight: class { constructor() { return makeNode(); } },
  PointLight: class { constructor() { return makeNode(); } },
  ShadowGenerator: class { addShadowCaster() {} },
  StandardMaterial: class { constructor() { return makeNode(); } },
  TransformNode: class { constructor() { return makeNode(); } },
  MeshBuilder: new Proxy({}, { get: () => () => makeNode() }),
};
BABYLON.Scene.FOGMODE_EXP2 = 2;

const handlers = {};
function makeEl() {
  return new Proxy({
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, force) { const on = force === undefined ? !this._s.has(c) : force; if (on) this._s.add(c); else this._s.delete(c); return on; } },
    style: {}, dataset: {},
    addEventListener(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    appendChild() {}, removeChild() {}, setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    focus() {}, click() {}, textContent: "", innerHTML: "", disabled: false, offsetWidth: 0,
  }, { get(t, p) { if (p in t) return t[p]; t[p] = ""; return t[p]; }, set(t, p, v) { t[p] = v; return true; } });
}
const elCache = {};
const document = {
  getElementById: (id) => (elCache[id] = elCache[id] || makeEl()),
  createElement: () => makeEl(),
  addEventListener(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
  documentElement: makeEl(),
};
const window = {
  __GG_TEST__: true,
  addEventListener(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
  matchMedia: () => ({ matches: false }),
  location: { reload() {} },
};

const sandbox = { BABYLON, document, window, console, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 };
sandbox.global = sandbox;

const code = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "game.js" });

console.log("\n[1] module load");
ok(true, "game.js loaded & ran without throwing");
const T = window.__GG_TEST__;
ok(T && T.CONFIG, "test seam exposed internals");
const scene = scenes[0];
ok(!!scene, "scene was created");
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };
const key = (code, down = true) => (handlers[down ? "keydown" : "keyup"] || []).forEach((f) => f({ code, preventDefault() {} }));

console.log("\n[2] start + idle frames");
T.startGame();
step(20);
ok(true, "ran 20 frames during 'Get ready' rest");

console.log("\n[3] world & collision");
const world = T.player.world;
ok(Array.isArray(world.obstacles) && world.obstacles.length > 0, `world has ${world.obstacles.length} solid obstacles`);
ok(typeof world.inRiver === "function", "world exposes a river test");
// Verify penetration resolution: start just outside an obstacle and push into it
// with a realistic small step; the player must be shoved back out, not through.
const o = world.obstacles.find((x) => x.r > 0.8) || world.obstacles[0];
const pr = T.CONFIG.playerRadius;
const start = new Vec3(o.x - (o.r + pr + 0.02), 0, o.z); // touching from the left
const into = new Vec3(o.x + 0.2, 0, o.z);                // small step aimed into the centre
const res = world.moveActor(start, into, pr);
const distToCentre = Math.hypot(res.x - o.x, res.z - o.z);
ok(distToCentre >= o.r + pr - 0.05, `collision pushed player out of obstacle (d=${distToCentre.toFixed(2)} >= ${(o.r + pr).toFixed(2)})`);
// Verify the river blocks crossing (find a deep-water point and try to walk into it).
let blocked = false;
for (let t = -60; t <= 60 && !blocked; t += 2) {
  const cx = world.water.position.x, cz = world.water.position.z;
  // probe points perpendicular to flow at this tangent are handled inside inRiver
  for (let s = -80; s <= 80; s += 2) {
    const px = cx + s * 0.6, pz = cz + t * 0.6;
    if (world.inRiver(px, pz)) {
      const land = new Vec3(px, 0, pz - 12);
      if (!world.inRiver(land.x, land.z)) {
        const r2 = world.moveActor(land, new Vec3(px, 0, pz), T.CONFIG.playerRadius);
        if (world.inRiver(r2.x, r2.z) === false) blocked = true;
      }
      break;
    }
  }
}
ok(blocked, "river barrier prevents walking into open water");

console.log("\n[4] wave 1 spawn + casting + movement");
key("Enter"); // queue next wave
step(2);
ok(T.waves.wave === 1 && T.state.monsters.length > 0, `wave 1 spawned ${T.state.monsters.length} monsters`);
key("KeyW"); key("Space");
step(60);
key("KeyW", false); key("Space", false);
ok(T.state.bolts.length >= 0, "casting + movement ran for 60 frames");
ok(T.player.position && isFinite(T.player.position.x), "player position stayed finite under collision");


// Helper: a flat, high-damage bolt at hand height that ignores gravity, so a
// single update lands a guaranteed hit (mirrors how monster hit-tests ignore Y).
const shoot = (target, dmg) =>
  new T.Projectile(scene, null, new Vec3(target.position.x, 1.5, target.position.z),
    new Vec3(0, 0, 1), { damage: dmg, radius: (target.radius || 1) + 1, gravity: 0 });

console.log("\n[5] boss archetypes, attacks & rare drops");
ok(T.BOSS_ARCHES.length >= 4, `${T.BOSS_ARCHES.length} boss archetypes with distinct behaviour`);
for (const a of T.BOSS_ARCHES) {
  const b = new T.Boss(scene, world.shadow, new Vec3(22, 0, 0), 10, a.id);
  ok(b.archId === a.id && b.isBoss, `archetype "${a.id}" (${b.name}) constructs`);
}
// Bosses scale up each cycle (wave 5 vs wave 15 of the same archetype).
const young = new T.Boss(scene, world.shadow, new Vec3(0, 0, 0), 5, "charger");
const old = new T.Boss(scene, world.shadow, new Vec3(0, 0, 0), 15, "charger");
ok(old.maxHp > young.maxHp && old.contactDamage > young.contactDamage, "later bosses are tougher (power scales)");

// A "caster" boss lobs hostile projectiles at the player (state.enemyBolts).
T.state.monsters.length = 0; T.state.enemyBolts.length = 0;
const caster = new T.Boss(scene, world.shadow, new Vec3(8, 0, 0), 10, "caster");
caster.actionTimer = 0; T.state.monsters.push(caster);
for (let i = 0; i < 200 && T.state.enemyBolts.length === 0; i++) step();
ok(T.state.enemyBolts.length > 0, "caster boss launched hostile projectiles");

// A "summoner" boss conjures extra sweets into the wave.
T.state.monsters.length = 0; T.state.enemyBolts.length = 0;
const summoner = new T.Boss(scene, world.shadow, new Vec3(10, 0, 0), 10, "summoner");
summoner.actionTimer = 0; T.state.monsters.push(summoner);
const beforeSummon = T.state.monsters.length;
for (let i = 0; i < 240 && T.state.monsters.length <= beforeSummon; i++) step();
ok(T.state.monsters.length > beforeSummon, "summoner boss conjured minions");

// A boss always drops a guaranteed RARE item on death. Keep the player far away
// so the loot/coins stay on the ground (they auto-collect when walked over).
T.state.monsters.length = 0; T.state.enemyBolts.length = 0; T.state.drops.length = 0;
T.player.root.position.set(-60, 0, -60);
const killBoss = new T.Boss(scene, world.shadow, new Vec3(50, 0, 50), 10, "stomper");
T.state.boss = killBoss; T.state.monsters.push(killBoss);
const sScore = T.state.score, sCoins = T.state.coinsList.length;
T.state.bolts.push(shoot(killBoss, killBoss.maxHp + 50));
step(3);
ok(killBoss.dying > 0 || !killBoss.alive, "boss took lethal damage from a bolt");
ok(T.state.score >= sScore + T.CONFIG.bossScore, `boss kill awarded +${T.CONFIG.bossScore} score`);
ok(T.state.coinsList.length > sCoins, "boss dropped a purse of coins");
ok(T.state.drops.length > 0, "boss dropped a RARE item");
ok(T.getDef(T.state.drops[0].id).rarity === "rare", `dropped item (${T.state.drops[0].id}) is rare`);
ok(T.state.boss === null, "boss reference cleared after defeat");

// Walking over a dropped item scoops it into the bag.
const dropCount = T.state.drops.length;
const bagBefore = T.player.inventory.length;
T.player.root.position.copyFrom(T.state.drops[0].root.position);
step(2);
ok(T.player.inventory.length > bagBefore && T.state.drops.length < dropCount, "rare drop picked up into inventory");

console.log("\n[6] gear economy — buy, equip, dual-wield, sell");
const p = T.player;
T.state.coins = 100000;
const baseHp = p.maxHealth, baseDR = p.damageReduction;
T.Shop.openShop();
ok(T.SHOP_STOCK.length >= 12, `merchant stocks ${T.SHOP_STOCK.length} normal items`);
ok(T.SHOP_STOCK.every((id) => T.getDef(id).rarity === "normal"), "merchant never stocks rare gear");

// Buy armour, then equip it — stats must rise.
const invBefore = p.inventory.length;
T.Shop.buy(T.getDef("iron_plate"));
ok(p.inventory.length === invBefore + 1, "buying adds the item to the bag");
const plate = p.inventory.find((it) => it.id === "iron_plate");
T.equipItem(p, plate);
ok(p.equipment.breastplate && p.equipment.breastplate.id === "iron_plate", "armour equips to its slot");
ok(p.maxHealth > baseHp && p.damageReduction > baseDR, "equipping armour raised max health + resist");

// A two-handed weapon fills both hands.
T.Shop.buy(T.getDef("short_bow"));
T.equipItem(p, p.inventory.find((it) => it.id === "short_bow"));
ok(p.equipment.hand1.id === "short_bow" && p.equipment.hand2 === T.TWO_HANDED, "two-handed weapon occupies both hands");
ok(p.weapon.ranged && p.weapon.shape === "arrow", "active weapon reflects the equipped bow");

// Two one-handed weapons can be dual-wielded.
T.Shop.buy(T.getDef("iron_dagger")); T.Shop.buy(T.getDef("iron_sword"));
T.equipItem(p, p.inventory.find((it) => it.id === "iron_dagger"));
T.equipItem(p, p.inventory.find((it) => it.id === "iron_sword"));
ok(p.equipment.hand1 && p.equipment.hand2 && p.equipment.hand2 !== T.TWO_HANDED, "two one-handers dual-wielded across both hands");
ok(!p.weapon.ranged, "dual melee weapons give a melee attack profile");

// Selling a bag item refunds coins.
const sellInst = p.inventory[0];
if (sellInst) {
  const coinsBefore = T.state.coins, bagCount = p.inventory.length;
  T.Shop.sell(sellInst);
  ok(p.inventory.length === bagCount - 1 && T.state.coins > coinsBefore, "selling an item returns coins");
}
T.Shop.closeShop();

console.log("\n[7] melee sweep + lifesteal on kill");
// Stand a sweet right in front of the player and swing a melee weapon at it.
T.state.monsters.length = 0;
const mm = new T.Monster(scene, world.shadow, new Vec3(p.position.x, 0, p.position.z + 1.5), 1);
mm.hp = 1; T.state.monsters.push(mm);
p.facing = 0;             // face +Z, toward the sweet
p.castCooldown = 0; p.meleeAnim = 0;
// (player is currently dual-wielding melee from [6])
const act = p.tryCast();
ok(act && act.type === "melee", "melee weapon yields a melee attack");
const killsBefore = T.state.score;
// meleeSweep isn't exported; drive it through the live attack path instead.
T.state.monsters.length = 0;
const mm2 = new T.Monster(scene, world.shadow, new Vec3(p.position.x, 0, p.position.z + 1.5), 1);
mm2.hp = 1; T.state.monsters.push(mm2);
p.castCooldown = 0; key("Space"); step(2); key("Space", false);
ok(!mm2.alive || mm2.dying > 0, "melee swing struck the sweet in front");

// Lifesteal heals on kill.
p.health = 10; p.lifesteal = 5;
T.state.monsters.length = 0;
const m = new T.Monster(scene, world.shadow, new Vec3(p.position.x, 0, p.position.z + 2), 1);
m.hp = 1; T.state.monsters.push(m);
const hpBefore = p.health;
T.state.bolts.push(shoot(m, 5));
step(2);
ok(p.health > hpBefore, `lifesteal healed on kill (${hpBefore} -> ${p.health})`);

console.log("\n[8] seeded RNG is reproducible");
T.setSeed(987654);
const seqA = [T.rng(), T.rng(), T.rng()];
T.setSeed(987654);
const seqB = [T.rng(), T.rng(), T.rng()];
ok(seqA.every((v, i) => v === seqB[i]), "same seed reproduces the exact RNG stream");
ok(seqA[0] !== seqA[1] && seqA.every((v) => v >= 0 && v < 1), "RNG yields varied values in [0,1)");

console.log("\n[9] save / load round-trip (inventory + equipment)");
const st = T.state;
const pl = T.player;
st.score = 4242; st.coins = 99;
// A known build: wand in hand, plate on chest, a cap and a rare sword in the bag.
for (const slot of T.EQUIP_SLOTS) pl.equipment[slot] = null;
pl.inventory = [T.makeItem("leather_cap"), T.makeItem("excalibur")];
pl.equipment.hand1 = T.makeItem("magic_wand");
pl.equipment.breastplate = T.makeItem("iron_plate");
pl.equipment.ring1 = T.makeItem("ring_power");
T.recomputeStats(pl);
pl.health = 33;
// Monsters incl. a known boss archetype, a coin and a rare drop on the ground.
st.monsters.length = 0; st.boss = null;
st.monsters.push(new T.Monster(scene, world.shadow, new Vec3(5, 0, 5), 2));
const bz = new T.Boss(scene, world.shadow, new Vec3(10, 0, 10), 10, "summoner"); bz.hp = 50;
st.boss = bz; st.monsters.push(bz);
st.coinsList.length = 0; st.coinsList.push(new T.Coin(scene, world.shadow, new Vec3(2, 0, 2), 3));
st.drops.length = 0; st.drops.push(new T.ItemDrop(scene, world.shadow, new Vec3(4, 0, 4), "storm_bow"));

const save = T.serializeGame();
ok(save && save.v === 2, "serializeGame produced a versioned save");
ok(T.validateSave(save), "save passes structural validation");
ok(save.score === 4242 && save.money === 99, "score + money captured");
ok(save.player.inventory.length === 2, "bag captured");
ok(save.player.equipment.hand1 === "magic_wand" && save.player.equipment.breastplate === "iron_plate", "equipment captured");
ok(save.monsters.some((mo) => mo.boss && mo.arch === "summoner"), "boss + archetype captured");
ok(save.itemDrops.length === 1 && save.itemDrops[0].id === "storm_bow", "dropped rare loot captured");
ok(!T.validateSave({ v: 999 }), "validation rejects a foreign/old file");

// Trash the live state, then restore from the save.
st.score = 0; st.coins = 0;
for (const slot of T.EQUIP_SLOTS) pl.equipment[slot] = null;
pl.inventory = [];
pl.health = 1;
const savedMaxHp = save.player ? null : null; // (stats are recomputed, not stored)

T.applySave(save);
ok(st.score === 4242 && st.coins === 99, "score + money restored");
ok(pl.equipment.hand1 && pl.equipment.hand1.id === "magic_wand", "equipped weapon restored");
ok(pl.equipment.breastplate && pl.equipment.breastplate.id === "iron_plate", "equipped armour restored");
ok(pl.equipment.ring1 && pl.equipment.ring1.id === "ring_power", "equipped accessory restored");
ok(pl.inventory.length === 2, "bag restored to the same count");
ok(pl.maxHealth > 100, "stats recomputed from the restored gear");
ok(pl.weapon && pl.weapon.ranged, "active weapon rebuilt from equipped wand");
ok(st.boss && st.boss.isBoss && st.boss.hp === 50 && st.boss.archId === "summoner", "boss restored with HP + archetype");
ok(st.drops.length === 1 && st.drops[0].id === "storm_bow", "dropped rare loot restored");
ok(T.waves.wave === save.wave.number, "wave counter restored");
step(5);
ok(isFinite(pl.position.x), "restored game keeps simulating");

console.log("\n[10] pause menu");
ok(T.paused === false, "starts un-paused");
T.Pause.open();
ok(T.paused === true, "pause menu opens and freezes the sim");
T.Pause.askConfirm("restart", "sure?");
ok(T.Pause.pendingAction === "restart", "restart asks for confirmation (misclick guard)");
T.Pause.hideConfirm();
ok(T.Pause.pendingAction === null, "confirmation can be cancelled");
T.Pause.close();
ok(T.paused === false, "pause menu resumes the game");

console.log("\n[11] projectile physics (arc + finite life)");
const proj = new T.Projectile(scene, null, new Vec3(0, 3, 0), new Vec3(0, 0, 1), { speed: 20, gravity: 9 });
const y0 = proj.mesh.position.y;
for (let i = 0; i < 8; i++) proj.update(0.05);
ok(proj.mesh.position.y < y0, "gravity pulls the projectile downward (it arcs, not flat-forever)");
let frames = 0;
const proj2 = new T.Projectile(scene, null, new Vec3(0, 3, 0), new Vec3(1, 0.2, 0), { speed: 30, gravity: 9 });
while (!proj2.dead && frames < 1000) { proj2.update(0.05); frames++; }
ok(proj2.dead && frames < 1000, `projectile terminated after ${frames} frames (never flies forever)`);
// Hostile boss projectiles are likewise gravity-bound + life-capped.
let hf = 0;
const haz = new T.Hazard(scene, new Vec3(0, 3, 0), new Vec3(0, 0.2, 1), { speed: 14, gravity: 5 });
const farAway = { x: 500, y: 0, z: 500 };
while (!haz.dead && hf < 1000) { haz.update(0.05, farAway); hf++; }
ok(haz.dead && hf < 1000, `hostile projectile terminated after ${hf} frames`);

console.log("\n[12] music system is headless-safe");
let musicThrew = false;
try { T.Music.start(); T.Music.toggle(); T.Music.toggle(); } catch (e) { musicThrew = true; }
ok(!musicThrew, "music system no-ops cleanly without a Web Audio context");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✅" : failures + " CHECK(S) FAILED ❌"}`);
process.exit(failures === 0 ? 0 : 1);
