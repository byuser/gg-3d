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
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
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

console.log("\n[5] boss wave (every 5 waves)");
// Fast-forward the wave counter to a boss wave by spawning directly.
T.state.monsters.length = 0;
T.waves.wave = T.CONFIG.bossEveryWaves - 1; // next spawn => wave 5
T.waves.betweenWaves = true;
T.waves.spawnWave();
const boss = T.state.boss;
ok(!!boss && boss.isBoss, `boss spawned: ${boss && boss.name}`);
ok(boss.maxHp >= T.CONFIG.bossBaseHp, `boss has scaled HP (${boss.maxHp})`);
ok(boss.contactDamage > T.CONFIG.contactDamage, "boss hits harder than a normal sweet");
step(10);
ok(true, "boss.update ran for 10 frames");
// Kill the boss via a real bolt through updateBolts -> onMonsterDefeated.
const beforeScore = T.state.score;
const beforeCoins = T.state.coinsList.length;
const bolt = new T.Projectile(scene, null, boss.position.clone(), new Vec3(0, 0, 1), { damage: boss.maxHp + 5, radius: boss.radius + 1 });
T.state.bolts.push(bolt);
step(2);
ok(boss.dying > 0 || boss.alive === false, "boss took lethal damage from a bolt");
ok(T.state.score >= beforeScore + T.CONFIG.bossScore, `boss kill awarded +${T.CONFIG.bossScore} score`);
ok(T.state.coinsList.length > beforeCoins, "boss dropped a purse of coins");
ok(T.state.boss === null, "boss reference cleared after defeat");

console.log("\n[6] shop — all items present & buyable");
ok(T.SHOP_ITEMS.length >= 12, `shop offers ${T.SHOP_ITEMS.length} items`);
T.state.coins = 100000;
const p = T.player;
const snap = { hp: p.maxHealth, speed: p.speed, dmg: p.weapon.damage, multishot: p.weapon.multishot, pierce: p.weapon.pierce, dr: p.damageReduction, ls: p.lifesteal };
T.Shop.openShop();
for (const item of T.SHOP_ITEMS) {
  // Buy each non-repeatable item up to its max (storm requires trident, which
  // is earlier in the list, so it unlocks before we reach it).
  const times = item.repeatable ? 1 : (isFinite(item.max) ? item.max : 1);
  for (let i = 0; i < times; i++) T.Shop.buy(item);
}
ok(p.maxHealth > snap.hp, `Vitality raised max health (${snap.hp} -> ${p.maxHealth})`);
ok(p.speed > snap.speed, `Swift Boots raised speed (${snap.speed.toFixed(1)} -> ${p.speed.toFixed(1)})`);
ok(p.weapon.damage > snap.dmg, "Power Crystal raised damage");
ok(p.weapon.multishot === 5, "Trident -> Storm Wand reached 5-bolt spread");
ok(p.weapon.pierce >= 3, "Piercing Rune stacked");
ok(p.damageReduction > 0, "Aegis Ward reduced incoming damage");
ok(p.lifesteal > 0, "Vampiric Gem granted lifesteal");
T.Shop.closeShop();

console.log("\n[7] lifesteal on kill");
p.health = 10; p.lifesteal = 5;
T.state.monsters.length = 0;
const m = new T.Monster(scene, world.shadow, new Vec3(0, 0, 2), 1);
m.hp = 1; T.state.monsters.push(m);
const b2 = new T.Projectile(scene, null, m.position.clone(), new Vec3(0, 0, 1), { damage: 5, radius: m.radius + 1 });
T.state.bolts.push(b2);
const hpBefore = p.health;
step(2);
ok(p.health > hpBefore, `lifesteal healed on kill (${hpBefore} -> ${p.health})`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✅" : failures + " CHECK(S) FAILED ❌"}`);
process.exit(failures === 0 ? 0 : 1);
