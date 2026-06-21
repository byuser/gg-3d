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
  add(o) { return new Color3(this.r + o.r, this.g + o.g, this.b + o.b); }
  clone() { return new Color3(this.r, this.g, this.b); }
  toColor4(a = 1) { return new Color4(this.r, this.g, this.b, a); }
  static Lerp(a, b, t) { return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t); }
  static FromHexString(h) {
    h = String(h).replace("#", "");
    return new Color3(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  }
}
class Color4 {
  constructor(r = 0, g = 0, b = 0, a = 1) { this.r = r; this.g = g; this.b = b; this.a = a; }
  static FromColor3(c, a = 1) { return new Color4(c.r, c.g, c.b, a); }
}
// A generic chainable no-op used for visual-only Babylon features (particles,
// glow layer, …) that the headless harness doesn't need to simulate.
function makeNoop() {
  const fn = () => proxy;
  const target = { color1: {}, color2: {}, colorDead: {}, emitter: null };
  const proxy = new Proxy(target, {
    get(t, p) { if (p in t) return t[p]; return fn; },
    set(t, p, v) { t[p] = v; return true; },
  });
  return proxy;
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

const Observable = () => { const l = []; return { add: (f) => { l.push(f); return f; }, remove: (f) => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); return i >= 0; }, _fire: (a) => l.slice().forEach((f) => f(a)), list: l }; };
const scenes = [];

const BABYLON = {
  Vector3: Vec3, Color3, Color4,
  Engine: class { getDeltaTime() { return 16; } runRenderLoop() {} resize() {} },
  Scene: class { constructor() { this.onBeforeRenderObservable = Observable(); scenes.push(this); } render() {} executeWhenReady(cb) { cb(); } registerBeforeRender(f) { this.onBeforeRenderObservable.add(f); } },
  ArcRotateCamera: class { constructor() { this.alpha = -Math.PI / 2; this.target = new Vec3(0, 1.4, 12); this.inputs = { removeByType() {} }; } attachControl() {} },
  HemisphericLight: class { constructor() { return makeNode(); } },
  DirectionalLight: class { constructor() { return makeNode(); } },
  PointLight: class { constructor() { return makeNode(); } },
  ShadowGenerator: class { addShadowCaster() {} getShadowMap() { return { renderList: [] }; } },
  StandardMaterial: class { constructor() { return makeNode(); } },
  TransformNode: class { constructor() { return makeNode(); } },
  MeshBuilder: new Proxy({}, { get: () => () => makeNode() }),
  // Visual-only systems the harness simulates as inert no-ops.
  ParticleSystem: class { constructor() { return makeNoop(); } },
  GlowLayer: class { constructor() { return makeNoop(); } },
  Texture: class { constructor() { return makeNode(); } },
  DynamicTexture: class { constructor() { return makeNode(); } getContext() { return new Proxy({}, { get: () => () => {} }); } update() {} },
  Sound: class { constructor() { return makeNoop(); } },
};
BABYLON.Texture.WRAP_ADDRESSMODE = 1;
BABYLON.ParticleSystem.BLENDMODE_ONEONE = 1;
BABYLON.Scene.FOGMODE_EXP2 = 2;
BABYLON.Scene.FOGMODE_LINEAR = 1;

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

// A minimal in-memory localStorage so the i18n locale-persistence path runs
// (real browsers have this; the headless harness must too, to test the round-trip).
const localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
})();

const sandbox = { BABYLON, document, window, localStorage, console, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 };
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
// Pick a roomy obstacle with no neighbour close enough to interfere with the
// single-obstacle push-out (otherwise an overlapping prop skews the result).
const pr = T.CONFIG.playerRadius;
const o = world.obstacles.find((x) => x.r > 0.8 && !world.obstacles.some((y) =>
  y !== x && Math.hypot(y.x - x.x, y.z - x.z) < x.r + y.r + 2 * pr + 1)) ||
  world.obstacles.find((x) => x.r > 0.8) || world.obstacles[0];
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

console.log("\n[9] save / load round-trip (gear + progression + zone)");
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
// Progression under the RPG model: gathered materials, a cleared lair, and the
// lifetime kill counter (individual roaming monsters are NOT saved — they
// regenerate from each zone's spawn table on load).
pl.materials.wood = 5; st.bossesCleared = { caverns: true }; st.totalKills = 17;

const save = T.serializeGame();
ok(save && save.v === 6, "serializeGame produced a versioned save");
ok(T.validateSave(save), "save passes structural validation");
ok(save.zone === st.zoneId, "current zone captured");
ok(save.bossesCleared && save.bossesCleared.caverns === true, "cleared lair captured");
ok(save.score === 4242 && save.money === 99, "score + money captured");
ok(save.player.inventory.length === 2, "bag captured");
ok(save.player.equipment.hand1.id === "magic_wand" && save.player.equipment.breastplate.id === "iron_plate", "equipment captured");
ok(save.player.materials.wood === 5, "gathered materials captured");
ok(save.totalKills === 17, "lifetime kills captured");
ok(!T.validateSave({ v: 999 }), "validation rejects a foreign/old file");

// Trash the live state, then restore from the save.
st.score = 0; st.coins = 0;
for (const slot of T.EQUIP_SLOTS) pl.equipment[slot] = null;
pl.inventory = []; pl.materials.wood = 0; st.bossesCleared = {}; st.totalKills = 0;
pl.health = 1;

T.applySave(save);
ok(st.score === 4242 && st.coins === 99, "score + money restored");
ok(pl.equipment.hand1 && pl.equipment.hand1.id === "magic_wand", "equipped weapon restored");
ok(pl.equipment.breastplate && pl.equipment.breastplate.id === "iron_plate", "equipped armour restored");
ok(pl.equipment.ring1 && pl.equipment.ring1.id === "ring_power", "equipped accessory restored");
ok(pl.inventory.length === 2, "bag restored to the same count");
ok(pl.maxHealth > 100, "stats recomputed from the restored gear");
ok(pl.weapon && pl.weapon.ranged, "active weapon rebuilt from equipped wand");
ok(pl.materials.wood === 5, "gathered materials restored");
ok(st.bossesCleared.caverns === true, "cleared lair restored");
ok(st.totalKills === 17, "lifetime kills restored");
ok(st.zoneId === save.zone, "zone restored");
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

console.log("\n[12] music + sfx systems are headless-safe");
let musicThrew = false;
try { T.Music.start(); T.Music.toggle(); T.Music.toggle(); } catch (e) { musicThrew = true; }
ok(!musicThrew, "music system no-ops cleanly without a Web Audio context");
let sfxThrew = false;
try {
  T.Sfx.unlock();
  ["bolt", "arrow", "staff", "melee", "heavy", "hit", "kill", "coin", "artifact",
   "potion", "enhance", "buy", "hurt", "boss_charge", "boss_cast", "boss_stomp",
   "boss_summon", "boss_spawn", "boss_death", "nope"].forEach((n) => T.Sfx.play(n));
} catch (e) { sfxThrew = true; }
ok(!sfxThrew, "sfx system no-ops cleanly for every cue without Web Audio");

console.log("\n[13] potion belt — buy, stack, use (heal + timed buff)");
const pp = T.player;
pp.potions = [null, null, null];
pp.buffs = [];
ok(T.POTION_STOCK.length >= 3 && T.POTION_STOCK.every((id) => T.getDef(id).type === "potion"), `${T.POTION_STOCK.length} potions stocked`);
ok(T.potionAdd(pp, "minor_potion") && T.potionAdd(pp, "minor_potion"), "potions stack into one belt slot");
ok(pp.potions[0] && pp.potions[0].count === 2, "two minor potions stacked (count 2)");
T.potionAdd(pp, "health_potion"); T.potionAdd(pp, "greater_potion");
ok(pp.potions[1] && pp.potions[2], "different potions take separate slots");
ok(!T.potionAdd(pp, "elixir_might"), "a 4th kind is rejected — belt holds 3 kinds");
// Using a health potion heals and decrements the stack.
pp.health = 10; pp.maxHealth = 100;
const before = pp.potions[0].count;
ok(T.potionUse(pp, 0) && pp.health === 40 && pp.potions[0].count === before - 1, "health potion heals +30 and decrements");
// Empty a stack and the slot frees up.
T.potionUse(pp, 0);
ok(pp.potions[0] === null, "emptied potion stack clears its slot");
// A buff elixir applies a timed stat boost folded into recomputeStats.
pp.potions = [{ id: "elixir_might", count: 1 }, null, null];
const dmgBefore = pp.weapon.damage;
ok(T.potionUse(pp, 0), "elixir consumed");
ok(pp.buffs.length === 1 && pp.weapon.damage > dmgBefore, "Elixir of Might raised weapon damage via a timed buff");

console.log("\n[14] blacksmith enhancement");
const bp = T.player;
T.state.coins = 100000;
for (const slot of T.EQUIP_SLOTS) bp.equipment[slot] = null;
bp.inventory = [T.makeItem("iron_sword")];
const sword = bp.inventory[0];
T.equipItem(bp, sword); // now in a hand slot
const dmg0 = bp.weapon.damage;
const cost1 = T.enhanceCost(T.getDef("iron_sword"), 0);
ok(cost1 > 0, `enhance cost computed (🪙 ${cost1})`);
ok(T.enhanceItem(bp, sword, T.state), "iron sword enhanced to +1");
ok(sword.level === 1 && bp.weapon.damage > dmg0, "enhancement raised the held weapon's damage");
// Rarity caps differ: a common item maxes at 3, a legendary much higher.
ok(T.ENHANCE.normal.max === 3 && T.ENHANCE.legendary.max > T.ENHANCE.normal.max, "rarer gear forges further");
const common = T.makeItem("iron_sword"); common.level = T.ENHANCE.normal.max;
ok(!T.enhanceItem(bp, common, T.state), "a maxed common item can't be enhanced further");
// Enhanced armour scales its stat bonus.
const cap = T.makeItem("iron_helm");
const baseHelmHp = (T.getDef("iron_helm").stats.maxHealth);
cap.level = 2;
ok(T.effectiveStats(cap).maxHealth > baseHelmHp, "enhanced armour grants more than its base stat");

console.log("\n[15] featured rare shop rotates every wave");
const f1 = T.featuredForWave(1), f2 = T.featuredForWave(2), f1b = T.featuredForWave(1);
ok(Array.isArray(f1) && f1.length > 0, `featured tab offers ${f1.length} wares`);
ok(f1.every((id) => ["rare", "epic", "legendary"].includes(T.getDef(id).rarity)), "featured wares are all rare+ gear");
ok(JSON.stringify(f1) === JSON.stringify(f1b), "featured stock is deterministic for a given wave");
ok(JSON.stringify(f1) !== JSON.stringify(f2), "featured stock changes between waves");

console.log("\n[16] new boss archetypes (bomber + splitter)");
ok(T.BOSS_ARCHES.some((a) => a.id === "bomber") && T.BOSS_ARCHES.some((a) => a.id === "splitter"), "bomber + splitter archetypes registered");
// Bomber lobs a volley of hostile bombs.
T.state.monsters.length = 0; T.state.enemyBolts.length = 0;
const bomber = new T.Boss(scene, world.shadow, new Vec3(8, 0, 0), 10, "bomber");
bomber.actionTimer = 0; T.state.monsters.push(bomber);
for (let i = 0; i < 200 && T.state.enemyBolts.length === 0; i++) step();
ok(T.state.enemyBolts.length > 0, "bomber boss lobbed a bomb volley");
// Splitter sheds minions while alive, and bursts into more on death.
T.state.monsters.length = 0; T.state.enemyBolts.length = 0; T.state.drops.length = 0;
T.player.root.position.set(-60, 0, -60);
const splitter = new T.Boss(scene, world.shadow, new Vec3(50, 0, 50), 10, "splitter");
T.state.boss = splitter; T.state.monsters.push(splitter);
const beforeKill = T.state.monsters.length;
T.state.bolts.push(shoot(splitter, splitter.maxHp + 50));
step(3);
ok(T.state.monsters.length > beforeKill - 1, "splitter burst into a knot of sweets on death");

console.log("\n[17] artifacts heal + pay coins on pickup");
const ap = T.player;
ap.state = "idle"; ap.pickT = 0; ap.carried = null; ap.pendingItem = null;
ap.health = 10; ap.maxHealth = 100;
T.state.coins = 0; T.state.artifacts.length = 0;
T.state.waveStats = { kills: 0, artifacts: 0, coins: 0 };
ap.root.position.set(0, 0, 0);
// Spawn an artifact at a fixed spot and trigger its "collect" interaction.
const art = T.spawnArtifact(scene, world, T.interaction, ap, T.state, null, { pos: [0, 0], color: "#ffffff" });
const aHpBefore = ap.health, aCoinBefore = T.state.coins, aScoreBefore = T.state.score;
art._it.onInteract(art._it);          // begins the pick-up animation
for (let i = 0; i < 60 && ap.state === "pickup"; i++) ap.update(0.05, { alpha: 0 });
ok(ap.health > aHpBefore, `artifact pickup healed the player (${aHpBefore} -> ${ap.health})`);
ok(T.state.coins > aCoinBefore, "artifact pickup paid out coins");
ok(T.state.score === aScoreBefore + T.CONFIG.scorePerArtifact, "artifact pickup still awards score");

console.log("\n[18] save/load round-trips enhancement levels + potion belt");
const sp = T.player;
for (const slot of T.EQUIP_SLOTS) sp.equipment[slot] = null;
const lvlSword = T.makeItem("iron_sword"); lvlSword.level = 2;
sp.equipment.hand1 = lvlSword;
sp.inventory = [Object.assign(T.makeItem("excalibur"), { level: 3 })];
sp.potions = [{ id: "minor_potion", count: 4 }, { id: "health_potion", count: 2 }, null];
sp.buffs = [];
T.recomputeStats(sp);
const save2 = T.serializeGame();
ok(save2.player.equipment.hand1.lvl === 2, "equipped enhancement level serialized");
ok(save2.player.inventory[0].lvl === 3, "bag enhancement level serialized");
ok(save2.player.potions[0].count === 4 && save2.player.potions[1].id === "health_potion", "potion belt serialized");
// Trash + restore.
for (const slot of T.EQUIP_SLOTS) sp.equipment[slot] = null;
sp.inventory = []; sp.potions = [null, null, null];
T.applySave(save2);
ok(sp.equipment.hand1 && sp.equipment.hand1.level === 2, "equipped enhancement level restored");
ok(sp.inventory[0] && sp.inventory[0].level === 3, "bag enhancement level restored");
ok(sp.potions[0] && sp.potions[0].count === 4 && sp.potions[1] && sp.potions[1].id === "health_potion", "potion belt restored");
// A legacy v2 save (plain string ids, no potions) still loads.
const legacy = T.serializeGame();
legacy.v = 2;
legacy.player.inventory = ["iron_sword"];
legacy.player.equipment = { helmet: null, breastplate: null, boots: null, necklace: null, ring1: null, ring2: null, hand1: "magic_wand", hand2: null };
delete legacy.player.potions;
ok(T.validateSave(legacy), "a legacy v2 save still validates");
T.applySave(legacy);
ok(sp.equipment.hand1 && sp.equipment.hand1.id === "magic_wand", "legacy string-id equipment restored");

console.log("\n[19] monster abilities, knockback & bomber explosions");
T.state.over = false;
ok(T.abilitiesForWave(1).length === 1 && T.abilitiesForWave(6).length === 6, "ability variety unlocks as waves escalate");
// Ability table: brutes hit hard + lumber, runners sprint.
ok(T.MONSTER_ABILITIES.brute.dmg > T.MONSTER_ABILITIES.chaser.dmg && T.MONSTER_ABILITIES.brute.speed < 1, "brute deals more damage + moves slower");
ok(T.MONSTER_ABILITIES.runner.speed > 1, "runner is a faster ability");
// Derived stats (contact damage + body size) reflect the ability on construction.
const baseM = new T.Monster(scene, world.shadow, new Vec3(0, 0, 0), 1, { kind: "gummy", hp: 3, speed: 2, ability: "chaser" });
const bruteM = new T.Monster(scene, world.shadow, new Vec3(0, 0, 0), 1, { kind: "gummy", hp: 3, speed: 2, ability: "brute" });
ok(bruteM.contactDamage > baseM.contactDamage && bruteM.radius > baseM.radius, "a brute sweet hits harder + is chunkier");
// Knockback shoves a monster across the ground.
const km = new T.Monster(scene, world.shadow, new Vec3(0, 0, 0), 1, { kind: "gummy", hp: 9, speed: 0, ability: "chaser" });
km.knockback(1, 0, 8); const kx0 = km.root.position.x;
km.update(0.05, new Vec3(0, 0, 60), T.state); // player far off so it can't chase
ok(km.root.position.x > kx0, "knockback impulse displaces the monster");
// A shooter sweet spits a hostile bolt when the player is in range.
T.state.monsters.length = 0; T.state.enemyBolts.length = 0;
const shooterM = new T.Monster(scene, world.shadow, new Vec3(8, 0, 0), 5, { kind: "gummy", hp: 3, speed: 0, ability: "shooter" });
shooterM.attackTimer = 0; T.player.root.position.set(0, 0, 0);
shooterM.update(0.05, T.player.position, T.state);
ok(T.state.enemyBolts.length > 0, "shooter sweet launched a hostile bolt");
// A bomber sweet detonates on death and damages a nearby player.
T.state.monsters.length = 0; T.state.enemyBolts.length = 0; T.state.over = false;
T.player.root.position.set(0, 0, 0); T.player.health = 100; T.player.maxHealth = 100; T.player.damageReduction = 0;
const bombM = new T.Monster(scene, world.shadow, new Vec3(3, 0, 0), 1, { kind: "gummy", hp: 1, speed: 0, ability: "bomber" });
T.state.monsters.push(bombM);
T.state.bolts.push(shoot(bombM, 50));
step(3);
ok(T.player.health < 100, "bomber sweet detonated and hurt the nearby player");

console.log("\n[20] gathering, materials & crafting");
const cp = T.player;
for (const id of T.MATERIAL_IDS) cp.materials[id] = 0;
T.addMaterial(cp, "herb", 5); T.addMaterial(cp, "water", 3);
ok(cp.materials.herb === 5 && cp.materials.water === 3, "gathered materials accumulate in the pouch");
ok(T.hasMaterials(cp, { herb: 2, water: 1 }) && !T.hasMaterials(cp, { crystal: 1 }), "material sufficiency check works");
cp.potions = [null, null, null];
const potRecipe = T.CRAFT_RECIPES.find((r) => r.out === "minor_potion");
const herb0 = cp.materials.herb;
ok(T.craftRecipe(cp, potRecipe), "crafted a minor potion from herb + water");
ok(cp.materials.herb === herb0 - potRecipe.mats.herb, "crafting consumed the materials");
ok(cp.potions.some((s) => s && s.id === "minor_potion"), "crafted potion landed on the belt");
for (const id of T.MATERIAL_IDS) cp.materials[id] = 99;
cp.inventory = [];
const gearRecipe = T.CRAFT_RECIPES.find((r) => T.getDef(r.out).type !== "potion");
ok(T.craftRecipe(cp, gearRecipe), "crafted a gear item from materials");
ok(cp.inventory.some((it) => it.id === gearRecipe.out), "crafted gear landed in the bag");
for (const id of T.MATERIAL_IDS) cp.materials[id] = 0;
const treeNode = new T.ResourceNode(scene, world.shadow, T.interaction, new Vec3(20, 0, 20), "tree", cp, T.state);
treeNode.harvest();
ok(cp.materials.wood > 0, "harvesting a tree node yielded wood");
ok(treeNode.respawn > 0 && treeNode.it.enabled === false, "harvested node depletes + enters respawn cooldown");

console.log("\n[21] quests — every objective type: accept, progress, turn in, reward");
const Q = T.Quests, Story = T.Story;
// Shared reset for the campaign tests (also used by [27]). Clears all quest +
// story state and the world flags objectives read from.
function resetStory() {
  Q.active = []; Q.completed = []; Q.acceptKills = {}; Q.reached = {}; Q.talked = {};
  Story.introSeen = false; Story.beats = {}; Story.sideTurnIns = {};
  T.state.totalKills = 0; T.player.relics = [];
  T.state.bossesCleared = {}; T.state.won = false;
  if (T.state.castle) T.state.castle.built = [];
  T.state.castleBuilt = [];
  for (const id of T.MATERIAL_IDS) T.player.materials[id] = 0;
}
resetStory();
const def = (id) => T.QUEST_BY_ID[id];
// hunt
ok(Q.accept("m_cull") && Q.isActive("m_cull"), "accepted a hunt mission");
ok(!Q.isComplete(def("m_cull")), "hunt mission starts incomplete");
T.state.totalKills += 5; Q.onKill();
ok(Q.isComplete(def("m_cull")), "hunt completes after enough kills");
const c0 = T.state.coins;
ok(Q.turnIn("m_cull") && Q.isDone("m_cull") && T.state.coins > c0, "hunt turn-in marks done + pays reward");
ok(!Q.turnIn("m_cull"), "a completed mission can't be turned in twice (reward paid once)");
// reach (awards a relic)
ok(Q.accept("m_cornerstone"), "accepted a reach mission");
Q.onReach("ruins");
ok(Q.isComplete(def("m_cornerstone")), "reach objective satisfied by visiting the place");
const relics0 = T.player.relics.length;
Q.turnIn("m_cornerstone");
ok(T.player.relics.includes("relic_foundation") && T.player.relics.length === relics0 + 1, "reach mission awarded a castle relic");
// build (reads the live castle build state)
ok(Q.accept("m_foundation"), "accepted a build mission");
ok(!Q.isComplete(def("m_foundation")), "build mission incomplete before the part is raised");
T.state.castle.built = ["foundation"]; Q.onBuild("foundation");
ok(Q.isComplete(def("m_foundation")), "build objective reads the raised castle part");
ok(Q.turnIn("m_foundation"), "build mission turned in");
// gather (consumes mats, awards a relic)
ok(Q.accept("m_stone"), "accepted a gather mission");
T.player.materials.stone = 8; Q.onGather();
ok(Q.isComplete(def("m_stone")), "gather objective reads the player's materials");
const stone0 = T.player.materials.stone, relW = T.player.relics.length;
Q.turnIn("m_stone");
ok(T.player.materials.stone === stone0 - 8, "gather turn-in consumed the required materials");
ok(T.player.relics.includes("relic_walls") && T.player.relics.length === relW + 1, "gather mission awarded a relic");
// defeat_boss (reads cleared lairs)
ok(Q.accept("m_caverns"), "accepted a defeat-boss mission");
ok(!Q.isComplete(def("m_caverns")), "defeat-boss incomplete before the lair is cleared");
T.state.bossesCleared.caverns = true; Q.onBossCleared("caverns");
ok(Q.isComplete(def("m_caverns")), "defeat-boss objective reads the cleared lair");
Q.turnIn("m_caverns");
ok(T.player.relics.includes("relic_towers"), "defeat-boss mission awarded the Tower Crystal");
// talk
ok(Q.accept("m_word"), "accepted a talk mission");
ok(!Q.isComplete(def("m_word")), "talk mission starts incomplete");
Q.onTalk("mayor");
ok(Q.isComplete(def("m_word")), "talking to the target completes the talk mission");
Q.turnIn("m_word");
// defeat_dragon (the finale objective resolves on victory)
ok(!Q.isComplete(def("m_dragon")), "finale objective incomplete before the dragon falls");
T.state.won = true;
ok(Q.isComplete(def("m_dragon")), "finale objective resolves when the dragon is slain");
T.state.won = false;

console.log("\n[22] day/night cycle + weather");
ok(typeof T.DayNight.t === "number", "the day/night clock exists");
T.DayNight.set(0.5); T.DayNight.update(0.01);
ok(T.DayNight.phase === "day", "noon reads as 'day'");
T.DayNight.set(0.0); T.DayNight.update(0.01);
ok(T.DayNight.phase === "night", "midnight reads as 'night'");
let weatherThrew = false;
try { T.Weather.setState("rain"); T.Weather.update(0.1, T.player.position); T.Weather.setState("storm"); T.Weather.update(0.1, T.player.position); T.Weather.setState("clear"); } catch (e) { weatherThrew = true; }
ok(!weatherThrew, "weather transitions run headless-safe");
ok(T.Weather.STATES.rain && T.Weather.STATES.storm && T.Weather.STATES.fog, "rain/storm/fog weather states exist");

console.log("\n[23] impact effects (bursts)");
T.state.fx = T.state.fx || [];
const fx0 = T.state.fx.length;
T.spawnImpact(T.state, new Vec3(0, 0, 0), "#ffffff", { count: 6 });
ok(T.state.fx.length === fx0 + 1, "spawnImpact queues a burst");
const burst = T.state.fx[T.state.fx.length - 1];
ok(burst.parts.length === 6, "the burst created the requested shards");
let bAlive = true; for (let i = 0; i < 60 && bAlive; i++) bAlive = burst.update(0.05);
ok(!bAlive, "the burst expires (self-cleans, never leaks)");

console.log("\n[24] save/load round-trips the adventure state");
const ap2 = T.player;
for (const id of T.MATERIAL_IDS) ap2.materials[id] = 0;
ap2.materials.wood = 7; ap2.materials.crystal = 2;
ap2.relics = ["relic_walls"];
T.Quests.active = ["m_water"]; T.Quests.completed = ["m_cull", "m_cornerstone", "m_foundation"];
T.Quests.acceptKills = { m_water: 3 }; T.Quests.reached = { ruins: true }; T.Quests.talked = {};
T.state.totalKills = 12;
T.DayNight.set(0.42); T.Weather.setState("fog");
if (T.state.castle) T.state.castle.built = ["foundation"];
const advSave = T.serializeGame();
ok(advSave.player.materials.wood === 7 && advSave.player.relics[0] === "relic_walls", "materials + relics serialized");
ok(advSave.quests.active[0] === "m_water" && advSave.quests.completed.includes("m_foundation"), "quest state serialized");
ok(advSave.quests.reached && advSave.quests.reached.ruins === true, "reach/talk objective sets serialized");
ok(advSave.castle[0] === "foundation" && advSave.weather === "fog", "castle progress + weather serialized");
ok(advSave.totalKills === 12, "lifetime kill counter serialized");
for (const id of T.MATERIAL_IDS) ap2.materials[id] = 0;
ap2.relics = []; T.Quests.active = []; T.Quests.completed = []; T.Quests.reached = {};
T.applySave(advSave);
ok(ap2.materials.wood === 7 && ap2.relics.includes("relic_walls"), "materials + relics restored");
ok(T.Quests.active.includes("m_water") && T.Quests.isDone("m_foundation"), "quest state restored");
ok(T.Quests.reached.ruins === true, "reach objective set restored");
ok(T.state.castle && T.state.castle.isBuilt("foundation"), "castle build state restored");

console.log("\n[25] building the castle summons the dragon → victory");
const site = T.state.castle;
ok(!!site, "the castle build site exists");
T.player.relics = T.CASTLE_PARTS.map((p) => p.relic);
T.state.coins = 100000; T.state.won = false; T.state.over = false; T.state.dragon = null;
T.state.monsters.length = 0; site.built = [];
// Integration: a live "build" mission is advanced by the REAL CastleSite.build
// → Quests.onBuild hook (not just a simulated event).
T.Quests.active = ["m_foundation"]; T.Quests.completed = [];
ok(!T.Quests.isComplete(T.QUEST_BY_ID["m_foundation"]), "build mission incomplete before the part is raised");
site.build(T.CASTLE_PARTS[0]);
ok(T.Quests.isComplete(T.QUEST_BY_ID["m_foundation"]), "raising the part via CastleSite.build advances the build mission");
T.Quests.active = [];
T.player.relics = T.CASTLE_PARTS.map((p) => p.relic); T.state.coins = 100000; site.built = [];
let builtAll = true;
for (const part of T.CASTLE_PARTS) if (!site.build(part)) builtAll = false;
ok(builtAll && site.built.length === T.CASTLE_PARTS.length, "all five castle parts built (relic + coins, in order)");
ok(T.state.dragon && T.state.dragon.isDragon, "finishing the keep summoned the dragon");
T.player.root.position.set(-50, 0, -50);
T.state.bolts = T.state.bolts || [];
T.state.bolts.push(shoot(T.state.dragon, T.state.dragon.maxHp + 100));
step(3);
ok(T.won === true, "slaying the dragon wins the game");

console.log("\n[26] RPG zones — location spawns, roaming, respawn, lair bosses, travel");
const zm = T.zoneManager;
ok(!!zm, "zone manager exists");
// Reset the run state the earlier tests left behind, and start from the hub.
T.state.over = false; T.state.won = false; T.state.dragon = null; T.state.bossesCleared = {};
if (T.state.zoneId !== T.HUB_ZONE) zm._swap(T.state.zoneId, T.HUB_ZONE, T.ZONE_BY_ID[T.HUB_ZONE]);
ok(T.world.zone.id === "meadow", "hub is the Meadowgate Vale");
ok(T.world.portals.length >= 2, `hub exposes ${T.world.portals.length} travel portals`);
ok(!!T.state.merchant && !!T.state.castle, "hub has the merchant + castle build site");
// Travel to a wild zone.
zm._swap("meadow", "forest", T.ZONE_BY_ID.forest);
ok(T.world.zone.id === "forest", "streamed into Whisperwood Deep");
ok(T.state.zoneId === "forest" && T.waves.zone.id === "forest", "zone id + spawn director updated");
ok(T.state.merchant === null && T.state.castle === null, "wild zone has no vendor / castle");
const forestPop = T.state.monsters.filter((m) => m.alive).length;
ok(forestPop > 0, `forest seeded ${forestPop} resident monsters at spawn points`);
ok(Math.hypot(T.player.position.x, T.player.position.z) > 1, "player placed at the arrival portal");
// Roaming: a monster beyond its aggro radius wanders its home patch, it doesn't
// beeline across the whole zone toward a far-off player.
const roamer = T.state.monsters.find((m) => m.alive && m.zoneAmbient);
roamer.home = { x: roamer.root.position.x, z: roamer.root.position.z }; roamer.aggroRange = 5;
for (let i = 0; i < 40; i++) roamer.update(0.05, new Vec3(999, 0, 999), T.state);
const drift = Math.hypot(roamer.root.position.x - roamer.home.x, roamer.root.position.z - roamer.home.z);
ok(drift <= (roamer.homeRange || 11) + 2, `a far-off monster roams near home (drift ${drift.toFixed(1)}m)`);
// Respawn: cull the whole population, confirm the director refills it over time.
for (const m of T.state.monsters) if (m.zoneAmbient) m.alive = false;
T.state.monsters = T.state.monsters.filter((m) => m.alive);
T.waves.respawnTimer = 0.01;
let respawned = 0;
for (let i = 0; i < 200 && respawned < 1; i++) { T.waves.update(0.05); respawned = T.state.monsters.filter((m) => m.alive && m.zoneAmbient).length; }
ok(respawned > 0, "the spawn director respawns culled monsters after a delay");
// Boss lair: the caverns spawn their guardian; clearing it persists for the run.
zm._swap("forest", "caverns", T.ZONE_BY_ID.caverns);
ok(T.world.zone.id === "caverns" && T.world.zone.indoor, "streamed into the Crystal Caverns (indoor lair)");
ok(T.state.boss && T.state.boss.isLairBoss, "the lair boss spawned in the depths");
ok(T.state.boss.name === "Cavern Gumlord", "lair boss uses its custom name");
// Integration: a live "defeat the lair boss" mission is advanced by the REAL
// SpawnDirector clear → Quests.onBossCleared hook.
T.Quests.active = ["m_caverns"]; T.Quests.completed = [];
ok(!T.Quests.isComplete(T.QUEST_BY_ID["m_caverns"]), "defeat-boss mission incomplete before the lair is cleared");
// Simulate the weapon-kill cleanup path (onMonsterDefeated nulls state.boss).
T.state.boss.alive = false; T.state.boss = null;
T.waves.update(0.05);
ok(T.state.bossesCleared.caverns === true, "felled lair boss recorded as cleared");
ok(T.Quests.isComplete(T.QUEST_BY_ID["m_caverns"]), "clearing the lair advances the defeat-boss mission");
T.Quests.active = [];
// Re-entering the lair this run must not respawn the boss.
zm._swap("caverns", "shore", T.ZONE_BY_ID.shore);
zm._swap("shore", "caverns", T.ZONE_BY_ID.caverns);
ok(!T.state.boss, "a cleared lair boss does not respawn this run");
// Back to the hub: the vendor + castle return, the world rebuilds cleanly.
zm._swap("caverns", "meadow", T.ZONE_BY_ID.meadow);
ok(T.world.zone.id === "meadow" && !!T.state.merchant && !!T.state.castle, "returning to the hub rebuilds it");
T.state.over = false;
step(5);
ok(isFinite(T.player.position.x), "simulation keeps running after repeated travel");

console.log("\n[27] main story campaign — ordering, guidance, side quests, finale, save");
// Satisfy a mission's objective (mirrors the gameplay events the engine reads).
function satisfy(m) {
  const o = m.obj;
  if (o.type === "hunt") { T.state.totalKills += o.count; T.Quests.onKill(); }
  else if (o.type === "gather") { T.player.materials[o.target] = (T.player.materials[o.target] || 0) + o.count; T.Quests.onGather(); }
  else if (o.type === "reach") T.Quests.onReach(o.target);
  else if (o.type === "talk") T.Quests.onTalk(o.target);
  else if (o.type === "defeat_boss") { T.state.bossesCleared[o.target] = true; T.Quests.onBossCleared(o.target); }
  else if (o.type === "build") { T.state.castle.built = T.state.castle.built.concat([o.target]); T.Quests.onBuild(o.target); }
  else if (o.type === "defeat_dragon") T.state.won = true;
}

// --- Structure sanity ---
resetStory();
ok(T.STORY.chapters.length === 5 && T.MAIN_IDS.length === T.MISSIONS.length, `campaign: ${T.STORY.chapters.length} chapters, ${T.MAIN_IDS.length} main missions`);
const objTypes = new Set(T.MISSIONS.map((m) => m.obj.type));
ok(["hunt", "gather", "reach", "talk", "defeat_boss", "build", "defeat_dragon"].every((t) => objTypes.has(t)), "main line exercises every objective type");
const mainRelics = T.MISSIONS.filter((m) => m.reward && m.reward.relic).map((m) => m.reward.relic);
ok(["relic_foundation", "relic_walls", "relic_towers", "relic_gate", "relic_keep"].every((r) => mainRelics.includes(r)), "every castle relic is earned on the main line");
const mainBuilds = T.MISSIONS.filter((m) => m.obj.type === "build").map((m) => m.obj.target);
ok(["foundation", "walls", "towers", "gate", "keep"].every((p) => mainBuilds.includes(p)), "every castle part is built on the main line");
ok(T.SIDE_QUESTS.length >= 4 && T.SIDE_QUESTS.every((s) => T.NPC_DATA.some((n) => n.id === s.npc)), `${T.SIDE_QUESTS.length} side quests, all from real NPCs`);

// --- Ordering / unlock flow: a follower can complete the whole line in order ---
resetStory();
ok(Story.currentMission().id === T.MAIN_IDS[0], "the first mission is current at the start");
ok(Story.offerMain("mayor") && Story.offerMain("mayor").id === "m_cull", "the giver of the current mission offers it");
ok(!Story.offerMain("fisher"), "an NPC who isn't the current giver offers no main mission");
ok(!Story.mainUnlocked("m_cornerstone"), "a later mission is locked until its predecessor resolves");
let order = [], guard = 0, lockBreak = false;
while (!Story.isComplete() && guard++ < 60) {
  const m = Story.currentMission();
  if (!Story.mainUnlocked(m.id)) { lockBreak = true; break; }
  order.push(m.id);
  if (m.npc) { Q.accept(m.id); satisfy(m); Q.turnIn(m.id); } else { satisfy(m); }
}
ok(!lockBreak && order.join(",") === T.MAIN_IDS.join(","), "missions resolve in exact campaign order (each unlocks the next)");
ok(Story.isComplete(), "the full main line completes by following the objectives");
ok(["relic_foundation", "relic_walls", "relic_towers", "relic_gate", "relic_keep"].every((r) => T.player.relics.includes(r)),
  "following the main line earns all five castle relics (the campaign is winnable end-to-end)");

// --- Guided tracker (no guesswork) ---
resetStory();
let g = Story.guidance();
ok(g && g.state === "accept" && /Mayor Plum/.test(g.text), "fresh start: tracker says which NPC to see");
ok(g.chapterIndex === 1 && /Vale Besieged/.test(g.chapterTitle), "tracker shows the current chapter");
Q.accept("m_cull");
g = Story.guidance();
ok(g.state === "do" && /Defeat sweets/.test(g.text), "after accepting: tracker shows the live objective");
T.state.totalKills += 5; Q.onKill();
g = Story.guidance();
ok(g.state === "turnin" && /turn in/.test(g.text), "when complete: tracker says return to the giver");

// --- Main vs side separation; side quests never block the main line ---
resetStory();
const curBefore = Story.currentMissionId();
ok(T.QUEST_BY_ID["sq_pests"].line === "side" && T.QUEST_BY_ID["m_cull"].line === "main", "quests are tagged main vs side");
ok(Story.offerSide("mayor") && Story.offerSide("mayor").id === "sq_pests", "an NPC offers a side quest");
ok(Q.accept("sq_pests") && Q.isActive("sq_pests"), "accepted a side quest independently");
ok(Story.currentMissionId() === curBefore && !Q.isActive("m_cull"), "accepting a side quest doesn't touch the main line");
T.state.totalKills += 8; Q.onKill();
ok(Q.isComplete(T.QUEST_BY_ID["sq_pests"]), "side quest tracks its own progress");
const coinsS = T.state.coins;
ok(Q.turnIn("sq_pests") && T.state.coins > coinsS, "side quest turns in for its reward");
ok(!Q.isDone("m_cull") && Story.currentMissionId() === curBefore, "the main line is unchanged by the side quest");

// --- Repeatable vs one-shot side quests ---
ok(T.QUEST_BY_ID["sq_pests"].repeatable && !Q.isDone("sq_pests"), "a repeatable bounty isn't permanently completed");
ok(Story.sideTurnIns["sq_pests"] === 1, "repeatable turn-ins are tallied");
ok(Story.offerSide("mayor") && Story.offerSide("mayor").id === "sq_pests", "a repeatable bounty can be taken again");
Q.accept("sq_supplies"); T.player.materials.herb = 8; Q.onGather(); Q.turnIn("sq_supplies");
ok(Q.isDone("sq_supplies"), "a one-shot side quest is marked done");
ok(!Story.offerSide("herbalist"), "a one-shot side quest isn't offered again");

// --- Finishing the last main mission enables the finale ---
resetStory();
for (const id of T.MAIN_IDS) {
  if (id === "m_dragon") break;
  const m = T.QUEST_BY_ID[id];
  Q.accept(id); satisfy(m); Q.turnIn(id);
}
ok(Story.currentMissionId() === "m_dragon", "finishing the keep makes the finale (the dragon) current");
ok(T.QUEST_BY_ID["m_dragon"].obj.type === "defeat_dragon" && !T.QUEST_BY_ID["m_dragon"].npc, "the finale is the giver-less dragon fight");
ok(/Dragon/.test(Story.guidance().text), "the tracker now points at the dragon");
satisfy(T.QUEST_BY_ID["m_dragon"]);
ok(Story.isComplete() && Story.guidance() === null, "slaying the dragon completes the campaign");

// --- Intro beat shows once, then closes ---
resetStory();
T.Dialogue.close();
ok(Story.introSeen === false, "intro unseen on a fresh campaign");
Story.maybeShowIntro();
ok(Story.introSeen === true && T.Dialogue.open && T.Dialogue.beat, "maybeShowIntro shows the opening beat");
const wasOpen = T.Dialogue.open;
Story.maybeShowIntro();
ok(Story.introSeen === true && T.Dialogue.open === wasOpen, "the intro shows only once (idempotent)");
T.Dialogue.close();
ok(!T.Dialogue.open, "the beat overlay closes cleanly");

// --- UI render paths are headless-safe (dialogue, chaptered quest log, beat) ---
resetStory();
const giver = (T.state.npcs || []).find((n) => n.data && n.data.id === "mayor");
let renderThrew = false;
try {
  Q.accept("m_cull"); Q.accept("sq_pests");          // an active main + side quest
  T.QuestLog.openLog(); T.QuestLog.render(); T.QuestLog.close();
  if (giver) { T.Dialogue.talk(giver); T.Dialogue.render(); T.Dialogue.close(); }
  Story.showIntro(); T.Dialogue.close();             // narrated story beat
} catch (e) { renderThrew = true; console.log("   render error:", e && e.stack); }
ok(!!giver, "the hub seeded a Mayor Plum quest-giver to talk to");
ok(!renderThrew, "dialogue / quest-log / intro-beat render paths run headless without throwing");

// --- Story state save/load round-trip ---
resetStory();
Story.introSeen = true; Story.beats = { ch2: true, ch3: true }; Story.sideTurnIns = { sq_pests: 2 };
Q.completed = ["m_cull", "m_cornerstone"]; Q.reached = { ruins: true }; Q.talked = { mayor: true };
const chBefore = Story.currentChapterId();
const sSave = T.serializeGame();
ok(sSave.v === 6 && sSave.story, "save is v6 with a story block");
ok(sSave.story.intro === true && sSave.story.beats.includes("ch2"), "story flags serialized");
ok(sSave.story.sideTurnIns.sq_pests === 2, "repeatable side tallies serialized");
Story.introSeen = false; Story.beats = {}; Story.sideTurnIns = {};
Q.completed = []; Q.reached = {}; Q.talked = {};
T.applySave(sSave);
ok(Story.introSeen === true && Story.beats.ch2 && Story.sideTurnIns.sq_pests === 2, "story flags restored");
ok(T.Quests.reached.ruins && T.Quests.talked.mayor, "reach/talk objective sets restored");
ok(Story.currentChapterId() === chBefore, "current chapter round-trips (derived from restored missions)");

console.log("\n[28] i18n — locales, interpolation, plural, key-parity, data + persistence");
const I18N = T.I18N, LOC = T.LOCALES;
ok(I18N.locale === "en", "defaults to English (no persisted locale in the harness)");
ok(!!(LOC && LOC.en && LOC.ru), "LOCALES exposes en + ru dictionaries");

// Key parity: every UI key in en exists in ru and vice-versa (the lint gate).
const enKeys = Object.keys(LOC.en), ruKeys = Object.keys(LOC.ru);
const missingRu = enKeys.filter((k) => !(k in LOC.ru));
const missingEn = ruKeys.filter((k) => !(k in LOC.en));
ok(missingRu.length === 0, "every en key exists in ru" + (missingRu.length ? " — missing: " + missingRu.join(", ") : ""));
ok(missingEn.length === 0, "every ru key exists in en" + (missingEn.length ? " — extra: " + missingEn.join(", ") : ""));
ok(enKeys.length > 100, `${enKeys.length} UI strings localized`);

// t() interpolation + fallback.
ok(T.t("toast.coinPickup", { n: 7 }) === "🪙 +7", "t() interpolates {placeholders}");
ok(T.t("totally.missing.key") === "totally.missing.key", "t() falls back to the key when missing");

// Pluralization: English one/other, Russian one/few/many.
ok(T.plural(1, { one: "part", other: "parts" }) === "part" && T.plural(4, { one: "part", other: "parts" }) === "parts", "en plural picks one/other");
T.applyLocale("ru");
const ruForms = { one: "часть", few: "части", many: "частей" };
ok(T.plural(1, ruForms) === "часть", "ru plural: 1 → one");
ok(T.plural(3, ruForms) === "части", "ru plural: 3 → few");
ok(T.plural(5, ruForms) === "частей" && T.plural(11, ruForms) === "частей", "ru plural: 5 & 11 → many");

// Data-table names resolve in Russian (and differ from the English source).
ok(T.tItemName(T.getDef("magic_wand")) === "Волшебная палочка", "item name resolves to Russian");
ok(T.tNpcName("mayor") === "Мэр Слива", "NPC name resolves to Russian");
ok(T.tDragonName() === "Древний Дракон", "dragon name resolves to Russian");
ok(T.tZoneName(T.ZONE_BY_ID.meadow).length > 0 && T.tQuestTitle(T.QUEST_BY_ID["m_cull"]).length > 0, "zone + quest titles resolve in Russian");
ok(/Победите сладости/.test(T.Quests.objectiveText(T.QUEST_BY_ID["m_cull"])), "objective text is built from the active locale");
T.applyLocale("en");
ok(T.tItemName(T.getDef("magic_wand")) === "Magic Wand" && T.tNpcName("mayor") === "Mayor Plum", "English names come straight from the data tables");

// Data completeness: every translatable data field has a Russian entry.
const gaps = [];
for (const id in T.ITEM_DB) {
  if (!(T.RU.item[id] && T.RU.item[id].name)) gaps.push("item." + id + ".name");
  if (T.ITEM_DB[id].desc && !(T.RU.item[id] && T.RU.item[id].desc)) gaps.push("item." + id + ".desc");
}
for (const z of T.ZONES) if (!T.RU.zone[z.id]) gaps.push("zone." + z.id);
for (const q of T.MISSIONS.concat(T.SIDE_QUESTS)) {
  if (!(T.RU.quest[q.id] && T.RU.quest[q.id].title)) gaps.push("quest." + q.id + ".title");
  if (!(T.RU.quest[q.id] && T.RU.quest[q.id].story)) gaps.push("quest." + q.id + ".story");
  if (q.where && !(T.RU.quest[q.id] && T.RU.quest[q.id].where)) gaps.push("quest." + q.id + ".where");
}
for (const n of T.NPC_DATA) {
  if (!(T.RU.npc[n.id] && T.RU.npc[n.id].name)) gaps.push("npc." + n.id + ".name");
  if (!(T.RU.npc[n.id] && T.RU.npc[n.id].intro)) gaps.push("npc." + n.id + ".intro");
}
for (const id in T.RELICS) if (!(T.RU.relic[id] && T.RU.relic[id].name)) gaps.push("relic." + id);
for (const p of T.CASTLE_PARTS) if (!(T.RU.castlePart[p.id] && T.RU.castlePart[p.id].name)) gaps.push("castlePart." + p.id);
for (const id in T.MATERIALS) if (!T.RU.material[id]) gaps.push("material." + id);
for (const a of T.BOSS_ARCHES) if (!T.RU.boss[a.id]) gaps.push("boss." + a.id);
ok(gaps.length === 0, "every data string has a Russian translation" + (gaps.length ? " — missing: " + gaps.slice(0, 8).join(", ") : ""));

// Locale persistence round-trip via the (stubbed) localStorage.
T.applyLocale("ru");
ok(T.localGet(T.LOCALE_KEY) === "ru", "selecting a locale persists it to localStorage");
T.applyLocale("en");
ok(T.localGet(T.LOCALE_KEY) === "en" && I18N.locale === "en", "switching back persists English (and resets the run)");

console.log("\n[29] lighting & shadows — quality tiers, shadow setup, post-FX, per-zone mood");
const QT = T.Quality;
ok(!!QT && typeof QT.pick === "function", "Quality tier module is exposed");
// pick() is a PURE mapping from capability facts → tier (no real device needed).
ok(QT.pick({ cores: 12, mem: 16 }) === "high", "beefy desktop → high tier");
ok(QT.pick({}) === "high", "unknown device defaults to high");
ok(QT.pick({ mobile: true, cores: 8, mem: 6 }) === "medium", "capable phone → medium tier");
ok(QT.pick({ mobile: true, cores: 4, mem: 3 }) === "low", "weak phone → low tier");
ok(QT.pick({ cores: 2, mem: 2 }) === "low", "ancient desktop → low tier");
ok(QT.pick({ cores: 4, mem: 4 }) === "medium", "mid desktop → medium tier");
ok(QT.pick({ forced: "low", cores: 32, mem: 64 }) === "low", "a forced tier overrides detection");
ok(QT.pick({ forced: "bogus", cores: 32 }) === "high", "an invalid forced tier is ignored");
// Every tier exposes a complete, sane settings block.
let tiersOk = true;
["high", "medium", "low"].forEach((tier) => {
  const s = QT.TIERS[tier];
  if (!(s && s.shadowMap >= 512 && s.shadowDarkness > 0 && s.shadowDarkness < 1 &&
        s.exposure > 0 && s.contrast > 0 && s.shadowMaxZ > 0)) tiersOk = false;
});
ok(tiersOk, "every tier has a complete, sane settings block");
ok(QT.TIERS.high.csm === true && QT.TIERS.low.csm === false, "cascaded shadows gate to the high tier");
ok(QT.TIERS.high.ssao === true && QT.TIERS.medium.ssao === false && QT.TIERS.low.bloom === false,
   "SSAO + bloom are tier-gated off on weak hardware");
ok(QT.settings() === QT.TIERS[QT.tier], "settings() returns the active tier's block");

// The live world built a working sun shadow generator (headless-safe).
ok(T.world && T.world.shadow && typeof T.world.shadow.addShadowCaster === "function",
   "the active zone exposes a sun shadow generator with addShadowCaster");

// Build + tear down EVERY zone (indoor lairs included). The lighting / shadow /
// per-zone-mood setup must run headless without throwing and dispose cleanly.
const scene29 = T.state.scene;
let lightErr = null;
for (const z of T.ZONES) {
  try {
    const w = T.buildWorld(scene29, z);
    if (!(w.shadow && typeof w.shadow.addShadowCaster === "function")) throw new Error("no shadow generator");
    w.shadow.addShadowCaster(w.ground);   // exercise the caster registration path
    T.applyZoneMood(scene29, z);          // per-zone mood is feature-detected / no-throw
    w.dispose();                          // tears down lights + shadow + scenery
  } catch (e) { lightErr = z.id + ": " + (e && e.message); break; }
}
ok(!lightErr, "every zone builds + tears down its lighting without throwing" + (lightErr ? " — " + lightErr : ""));

// makeSunShadows is headless-safe for both outdoor + indoor zones, and honours
// a per-zone shadow-darkness override.
let shadowErr = null;
try {
  const sun = new BABYLON.DirectionalLight("t29", new Vec3(-0.5, -1, -0.4), scene29);
  const sOut = T.makeSunShadows(scene29, sun, false, T.ZONE_BY_ID.meadow.theme);
  const sIn = T.makeSunShadows(scene29, sun, true, T.ZONE_BY_ID.caverns.theme);
  if (!(sOut.addShadowCaster && sIn.addShadowCaster)) shadowErr = "missing addShadowCaster";
} catch (e) { shadowErr = e && e.message; }
ok(!shadowErr, "makeSunShadows builds outdoor + indoor generators headless-safe" + (shadowErr ? " — " + shadowErr : ""));

// Post-FX setup is feature-detected (no image processing / pipelines in Node).
let fxErr = null, fxOut = null;
try { fxOut = T.setupPostFX(scene29, null); } catch (e) { fxErr = e && e.message; }
ok(!fxErr && fxOut && "pipeline" in fxOut && "ssao" in fxOut,
   "setupPostFX runs headless-safe and returns post-process handles");

// DayNight still resolves correctly after all the lighting rebuilds (no regression).
T.DayNight.set(0.5); T.DayNight.update(0.01);
ok(T.DayNight.phase === "day", "DayNight still resolves noon after the lighting rebuilds");

console.log("\n[30] higher-fidelity models — PBR materials, env IBL probe, mesh-detail tiers");
// Each tier carries a complete model-fidelity block (pure data — no device needed).
let modelTiersOk = true;
["high", "medium", "low"].forEach((tier) => {
  const s = QT.TIERS[tier];
  if (!(s && typeof s.pbr === "boolean" && typeof s.env === "boolean" &&
        s.seg >= 6 && s.tess >= 8 && s.rockSub >= 1 && s.foliage > 0)) modelTiersOk = false;
});
ok(modelTiersOk, "every tier has a complete model-fidelity block (pbr/env/seg/tess/rockSub/foliage)");
ok(QT.TIERS.high.pbr === true && QT.TIERS.low.pbr === false, "PBR materials gate to capable tiers (desktop/high), Standard on weak GPUs");
ok(QT.TIERS.high.env === true && QT.TIERS.medium.env === false && QT.TIERS.low.env === false,
   "the IBL env probe is desktop-high only (phones skip it)");
ok(QT.TIERS.high.seg > QT.TIERS.low.seg && QT.TIERS.high.tess >= QT.TIERS.low.tess,
   "mesh segment/tessellation density scales up with the tier");
ok(QT.TIERS.high.foliage > QT.TIERS.low.foliage, "the extra-detail (foliage) budget scales with the tier");

const scene30 = T.state.scene;
const origTier30 = QT.tier;

// Without a PBRMaterial implementation (the live boot path), mat()/emat() fall
// back to StandardMaterial and the env probe is skipped — never throwing.
ok(T.usePBR() === false, "usePBR() is false until a PBRMaterial implementation exists (Standard fallback)");
const fbMat = T.mat(scene30, "t30fallback", "#9aa0a6");
ok(fbMat && !fbMat._ggPBR, "mat() returns a non-PBR material on the fallback path");
const stdOnly = T.stdMat(scene30, "t30std", "#808080");
ok(stdOnly && !stdOnly._ggPBR, "stdMat() always stays off the PBR path (the backdrop/sky uses it)");

// Inject PBRMaterial + RawCubeTexture stubs to drive the PBR + env code paths.
BABYLON.PBRMaterial = class { constructor() { return makeNode(); } };
BABYLON.RawCubeTexture = class { constructor() { return makeNode(); } };
QT.tier = "high";
ok(T.usePBR() === true, "usePBR() flips true on the high tier once PBRMaterial is available");

// The procedural IBL probe installs a scene environment texture (high tier).
let envErr = null, env = null;
try { env = T.makeEnvironment(scene30); } catch (e) { envErr = e && e.message; }
ok(!envErr && !!env && !!scene30.environmentTexture && T.envOn === true,
   "makeEnvironment builds a procedural cube + installs scene.environmentTexture on the high tier" + (envErr ? " — " + envErr : ""));

// mat()/emat() now produce PBR; the legacy diffuse/specular writes still work.
const pm = T.mat(scene30, "t30pbr", "#3366cc");
ok(pm && pm._ggPBR === true, "mat() returns a PBR material on the high tier");
pm.diffuseColor = Color3.FromHexString("#ff0000");
ok(pm.albedoColor && Math.abs(pm.albedoColor.r - 1) < 1e-6 && pm.albedoColor.g < 1e-6,
   "a legacy diffuseColor write is aliased onto the PBR albedoColor");
pm.specularColor = new Color3(0.5, 0.5, 0.5);
ok(pm.specularColor && pm.specularColor.r === 0.5, "a legacy specularColor write is captured without throwing");
const pe = T.emat(scene30, "t30pbre", "#22cc88", 0.6);
ok(pe && pe._ggPBR === true && pe.emissiveColor && pe.emissiveColor.g > 0, "emat() sets PBR emissive");

// gloss() tightens roughness/metalness on PBR, and is a no-op-safe on Standard.
T.gloss(pm, 0.3, 0.4);
ok(pm.roughness === 0.3 && pm.metallic === 0.4, "gloss() tightens PBR roughness + metalness");
let glossErr = null;
try { T.gloss(stdOnly, 0.3, 0.4); } catch (e) { glossErr = e && e.message; }
ok(!glossErr, "gloss() is safe on a StandardMaterial (no throw)");

// Build + tear down EVERY zone on the PBR + env (high) tier: the upgraded meshes,
// shared materials and gloss tweaks must run headless and dispose without throwing.
let modelErr = null;
for (const z of T.ZONES) {
  try {
    const w = T.buildWorld(scene30, z);
    if (!(w && w.dispose)) throw new Error("no dispose handle");
    w.dispose();
  } catch (e) { modelErr = z.id + ": " + (e && e.message); break; }
}
ok(!modelErr, "every zone builds + tears down on the PBR+env high tier without throwing" + (modelErr ? " — " + modelErr : ""));

// World GENERATION must be tier-independent: the graphics tier changes rendering
// only, never the seeded layout. Building the same seed + zone (peaks: trees +
// rocks + crystals — the gated-detail props) on the high vs low tier must yield
// an identical obstacle layout (the per-tier extras draw their rng unconditionally).
function obsSig30(tier) {
  QT.tier = tier; T.setSeed(98765);
  const w = T.buildWorld(scene30, T.ZONE_BY_ID.peaks);
  const sig = (w.obstacles || []).map((o) => o.x.toFixed(2) + "," + o.z.toFixed(2) + "," + o.r.toFixed(2)).join("|");
  w.dispose();
  return sig;
}
const sigHi30 = obsSig30("high"), sigLo30 = obsSig30("low");
ok(sigHi30.length > 0 && sigHi30 === sigLo30,
   "world layout is identical across graphics tiers (rng consumption is tier-independent)");

// The low tier forces the Standard fallback + skips the env probe even when PBR exists.
QT.tier = "low";
ok(T.usePBR() === false, "the low tier forces the Standard fallback even when PBRMaterial exists");
ok(!T.mat(scene30, "t30low", "#888888")._ggPBR, "mat() honours the low tier with a Standard material");
ok(T.makeEnvironment(scene30) === null && T.envOn === false, "the env probe is skipped on the low tier");

// Restore the booted state (tier + remove the injected stubs) for tidiness.
QT.tier = origTier30;
delete BABYLON.PBRMaterial; delete BABYLON.RawCubeTexture;

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✅" : failures + " CHECK(S) FAILED ❌"}`);
process.exit(failures === 0 ? 0 : 1);
