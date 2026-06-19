/*
 * Good Game 3D
 * ---------------------------------------------------------------------------
 * A third-person browser action game built on Babylon.js.
 *
 * This release: run as Lily through a procedurally generated meadow, armed with
 * a glowing MAGIC WAND. Every minute a new WAVE of "living sweets" (lollipops,
 * gummy bears, cupcakes, donuts, candy canes) marches in — each wave bigger
 * than the last and dropping more ARTIFACTS. Blast the sweets with your wand
 * and grab the artifacts to rack up SCORE. The sweets hurt you on contact;
 * survive as long as you can.
 *
 * The code is split into small systems so features slot in cleanly:
 *
 *   - Interactable / InteractionSystem  reusable "walk up + press E" contract.
 *   - Input                             keyboard + on-screen stick + cast button.
 *   - Player                            movement, animation, wand + casting, health.
 *   - Projectile / projectile pool      the wand's magic bolts.
 *   - Monster                           a "living sweet" with chase AI + pop FX.
 *   - WaveSystem                        timed escalating waves of sweets + artifacts.
 *   - buildWorld                        procedural environment + lighting.
 */

(() => {
  "use strict";

  // A visible crash handler — far better than a blank canvas if anything fails.
  function showFatal(msg) {
    const hint = document.getElementById("loadHint");
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.remove("hidden");
    if (hint) { hint.style.color = "#ff8a8a"; hint.textContent = "Error: " + msg; }
    console.error(msg);
  }
  window.addEventListener("error", (e) => showFatal(e.message || "unknown error"));

  // =========================================================================
  // Deterministic RNG (mulberry32)
  // -------------------------------------------------------------------------
  // The whole game draws its randomness from this single seeded stream instead
  // of rng(). Seeding it makes the *procedural world* (river, roads,
  // trees, rocks, …) fully reproducible: a saved game records its seed, and on
  // load we re-seed and rebuild the exact same environment before restoring the
  // live entities (monsters, coins, artifacts) on top. See serializeGame /
  // applySave below.
  // =========================================================================
  let worldSeed = (Date.now() ^ (Date.now() << 11) ^ 0x9e3779b9) >>> 0;
  let _rngState = worldSeed >>> 0;
  function rng() {
    _rngState |= 0; _rngState = (_rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function setSeed(s) { worldSeed = s >>> 0; _rngState = worldSeed; }

  const CONFIG = {
    moveSpeed: 6.5,          // metres / second
    turnLerp: 0.2,
    interactRange: 2.6,
    playerRadius: 0.55,      // collision radius vs scenery (trees, rocks, …)
    worldRadius: 88,         // playable area before the invisible fence

    // Combat / wand
    castCooldown: 0.32,      // seconds between magic bolts
    boltSpeed: 22,           // metres / second
    boltLife: 1.4,           // seconds before a bolt fizzles
    boltRadius: 0.8,         // hit radius against monsters

    // Player health
    maxHealth: 100,
    contactDamage: 12,       // damage per sweet "bite"
    biteCooldown: 0.8,       // seconds between bites from the same sweet

    // Waves
    firstWaveDelay: 5,       // seconds before wave 1
    waveInterval: 60,        // max seconds to rest before the next wave auto-starts
    baseMonsters: 4,         // monsters in wave 1
    monstersPerWave: 3,      // extra monsters each subsequent wave
    maxMonstersPerWave: 60,  // cap for performance
    baseArtifacts: 3,        // artifacts dropped in wave 1
    artifactsPerWave: 1,     // extra artifacts each subsequent wave
    maxArtifactsPerWave: 14,

    // Difficulty scaling — sweets get faster and tougher each wave.
    monsterBaseSpeed: 1.6,
    monsterSpeedPerWave: 0.12,
    monsterMaxSpeed: 6.0,
    monsterHpPerWaves: 3,    // +1 HP every N waves

    // Bosses — a giant "sweet king" storms in every few waves.
    bossEveryWaves: 5,        // a boss appears on waves divisible by this
    bossBaseHp: 38,           // boss HP on its first appearance (wave 5)
    bossHpPerCycle: 26,       // +HP for each later boss (wave 10, 15, …)
    bossSpeed: 2.0,           // bosses are slower but relentless
    bossContactDamage: 22,    // they hit much harder than a regular sweet
    bossRadius: 2.4,          // big body → big hit/contact radius
    bossScore: 400,           // score for felling a boss
    bossCoinDrop: 30,         // guaranteed coins when a boss is defeated

    // Score
    scorePerMonster: 25,
    scorePerArtifact: 50,

    // Coins (the shop currency, dropped by defeated sweets)
    coinDropChance: 0.55,     // chance a defeated sweet drops coins
    coinValueMin: 1,
    coinValueMax: 3,
    coinPickupRange: 1.9,     // walk this close to scoop a coin up
    coinMagnetRange: 4.5,     // coins drift toward the player inside this range
    coinLife: 30,             // seconds before an uncollected coin fades away
  };

  const PALETTE = ["#6cc6ff", "#a06cff", "#ff6c8a", "#ffd34e", "#5be0a0", "#ff944e"];

  // ---- DOM ---------------------------------------------------------------
  const dom = {
    canvas: document.getElementById("renderCanvas"),
    overlay: document.getElementById("overlay"),
    startBtn: document.getElementById("startBtn"),
    loadHint: document.getElementById("loadHint"),
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    coins: document.getElementById("coins"),
    wave: document.getElementById("wave"),
    monsters: document.getElementById("monsters"),
    nextWave: document.getElementById("nextWave"),
    wavePanel: document.getElementById("wavePanel"),
    wavePanelTitle: document.getElementById("wavePanelTitle"),
    wavePanelClose: document.getElementById("wavePanelClose"),
    waveResults: document.getElementById("waveResults"),
    resKills: document.getElementById("resKills"),
    resArtifacts: document.getElementById("resArtifacts"),
    resCoins: document.getElementById("resCoins"),
    waveShopHint: document.getElementById("waveShopHint"),
    nextWaveBtn: document.getElementById("nextWaveBtn"),
    waveMini: document.getElementById("waveMini"),
    miniNextBtn: document.getElementById("miniNextBtn"),
    miniWaveNum: document.getElementById("miniWaveNum"),
    miniCountdown: document.getElementById("miniCountdown"),
    shop: document.getElementById("shop"),
    shopClose: document.getElementById("shopClose"),
    shopDone: document.getElementById("shopDone"),
    shopCoins: document.getElementById("shopCoins"),
    shopItems: document.getElementById("shopItems"),
    healthFill: document.getElementById("healthFill"),
    bossBar: document.getElementById("bossBar"),
    bossName: document.getElementById("bossName"),
    bossFill: document.getElementById("bossFill"),
    waveBanner: document.getElementById("waveBanner"),
    prompt: document.getElementById("prompt"),
    toast: document.getElementById("toast"),
    over: document.getElementById("over"),
    finalScore: document.getElementById("finalScore"),
    finalWave: document.getElementById("finalWave"),
    replayBtn: document.getElementById("replayBtn"),
    touch: document.getElementById("touch"),
    joystick: document.getElementById("joystick"),
    stick: document.getElementById("stick"),
    actionBtn: document.getElementById("actionBtn"),
    castBtn: document.getElementById("castBtn"),
    fsBtn: document.getElementById("fsBtn"),
    // Start-screen "Load progress".
    loadBtn: document.getElementById("loadBtn"),
    loadFile: document.getElementById("loadFile"),
    // In-game pause menu + its confirmation dialog.
    pauseBtn: document.getElementById("pauseBtn"),
    pauseMenu: document.getElementById("pauseMenu"),
    resumeBtn: document.getElementById("resumeBtn"),
    saveBtn: document.getElementById("saveBtn"),
    restartBtn: document.getElementById("restartBtn"),
    exitBtn: document.getElementById("exitBtn"),
    pauseWave: document.getElementById("pauseWave"),
    pauseScore: document.getElementById("pauseScore"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmText: document.getElementById("confirmText"),
    confirmYes: document.getElementById("confirmYes"),
    confirmNo: document.getElementById("confirmNo"),
  };

  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  const engine = new BABYLON.Engine(dom.canvas, true, { stencil: true, adaptToDeviceRatio: true });

  let gameStarted = false;   // gameplay (waves, monsters) waits on the start screen
  let uiPaused = false;      // true while a blocking menu (the shop) is open
  let paused = false;        // true while the in-game pause menu is open
  let waveSystem = null;     // the active WaveSystem (for the HUD buttons)
  let playerRef = null;      // the Player (so HUD helpers can read max health)
  // Live handles to the running game, captured in createScene so the save/load
  // and pause systems can read and rebuild the world.
  let sceneRef = null, worldRef = null, interactionRef = null, stateRef = null, cameraRef = null;

  // Coin pickup/magnet ranges live here (not in the frozen CONFIG) so the shop's
  // "Lodestone" upgrade can widen them at runtime.
  let coinMagnetRange = CONFIG.coinMagnetRange;
  let coinPickupRange = CONFIG.coinPickupRange;

  // =========================================================================
  // Input
  // =========================================================================
  const Input = {
    keys: Object.create(null),
    joy: { x: 0, y: 0, active: false },
    interactQueued: false,
    nextWaveQueued: false,   // player asked to start the next wave early
    castHeld: false,         // fire is continuous while held (respecting cooldown)

    init() {
      window.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (e.code === "KeyE") { this.interactQueued = true; e.preventDefault(); }
        if (e.code === "Enter" || e.code === "KeyN") { this.nextWaveQueued = true; e.preventDefault(); }
        if (e.code === "Space" || e.code === "KeyF") { this.castHeld = true; e.preventDefault(); }
      });
      window.addEventListener("keyup", (e) => {
        this.keys[e.code] = false;
        if (e.code === "Space" || e.code === "KeyF") this.castHeld = false;
      });
      if (isTouch) this._initJoystick();
    },

    _initJoystick() {
      const base = dom.joystick, radius = 50;
      let pointerId = null;
      const setStick = (dx, dy) => {
        const len = Math.hypot(dx, dy) || 1;
        const c = Math.min(len, radius);
        const nx = (dx / len) * c, ny = (dy / len) * c;
        dom.stick.style.transform = `translate(${nx}px, ${ny}px)`;
        this.joy.x = nx / radius; this.joy.y = -ny / radius; this.joy.active = true;
      };
      const reset = () => {
        dom.stick.style.transform = "translate(0,0)";
        this.joy.x = this.joy.y = 0; this.joy.active = false; pointerId = null;
      };
      base.addEventListener("pointerdown", (e) => {
        pointerId = e.pointerId; base.setPointerCapture(pointerId);
        const r = base.getBoundingClientRect();
        setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); e.preventDefault();
      });
      base.addEventListener("pointermove", (e) => {
        if (e.pointerId !== pointerId) return;
        const r = base.getBoundingClientRect();
        setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      });
      base.addEventListener("pointerup", reset);
      base.addEventListener("pointercancel", reset);
      dom.actionBtn.addEventListener("pointerdown", (e) => { this.interactQueued = true; e.preventDefault(); });
      const castOn = (e) => { this.castHeld = true; e.preventDefault(); };
      const castOff = () => { this.castHeld = false; };
      dom.castBtn.addEventListener("pointerdown", castOn);
      dom.castBtn.addEventListener("pointerup", castOff);
      dom.castBtn.addEventListener("pointercancel", castOff);
      dom.castBtn.addEventListener("pointerleave", castOff);
    },

    moveVector() {
      let x = 0, z = 0;
      if (this.keys["KeyW"] || this.keys["ArrowUp"]) z += 1;
      if (this.keys["KeyS"] || this.keys["ArrowDown"]) z -= 1;
      if (this.keys["KeyD"] || this.keys["ArrowRight"]) x += 1;
      if (this.keys["KeyA"] || this.keys["ArrowLeft"]) x -= 1;
      if (this.joy.active) { x += this.joy.x; z += this.joy.y; }
      return { x, z };
    },
    consumeInteract() { const v = this.interactQueued; this.interactQueued = false; return v; },
    consumeNextWave() { const v = this.nextWaveQueued; this.nextWaveQueued = false; return v; },
    wantsCast() { return this.castHeld; },
  };

  // =========================================================================
  // Interaction
  // =========================================================================
  class Interactable {
    constructor(node, { label, range = CONFIG.interactRange, onInteract }) {
      this.node = node; this.label = label; this.range = range;
      this.onInteract = onInteract; this.enabled = true;
    }
    get position() { return this.node.getAbsolutePosition(); }
    distanceTo(p) { return BABYLON.Vector3.Distance(this.position, p); }
  }

  class InteractionSystem {
    constructor() { this.items = []; this.current = null; }
    register(it) { this.items.push(it); return it; }
    remove(it) {
      const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1);
      if (this.current === it) this.current = null;
    }
    update(playerPos) {
      let best = null, bestDist = Infinity;
      for (const it of this.items) {
        if (!it.enabled) continue;
        const d = it.distanceTo(playerPos);
        if (d <= it.range && d < bestDist) { best = it; bestDist = d; }
      }
      this.current = best;
      if (best) {
        dom.prompt.classList.remove("hidden");
        dom.prompt.innerHTML = isTouch ? best.label : `${best.label} · <b>E</b>`;
      } else dom.prompt.classList.add("hidden");
    }
    trigger() { if (this.current && this.current.onInteract) this.current.onInteract(this.current); }
  }

  // =========================================================================
  // Player — Lily, with a magic wand, casting, locomotion + pick-up states.
  // =========================================================================
  class Player {
    constructor(scene, shadow) {
      this.scene = scene;
      this.speed = CONFIG.moveSpeed;
      this.facing = Math.PI;     // yaw
      this.walkPhase = 0;
      this.state = "idle";       // "idle" | "walk" | "pickup"
      this.pickT = 0;            // 0..1 progress through the pick-up animation
      this.pendingItem = null;   // mesh being picked up
      this.onPicked = null;      // callback once the relic reaches the hands
      this.carried = null;       // collectible mesh that flies up + poofs
      this.castCooldown = 0;     // counts down to 0 when ready to cast
      this.castAnim = 0;         // 0..1 quick wand-thrust animation
      this.maxHealth = CONFIG.maxHealth;
      this.health = CONFIG.maxHealth;
      this.damageReduction = 0;  // 0..~0.6, raised by the Aegis Ward upgrade
      this.lifesteal = 0;        // HP restored per sweet defeated (Vampiric Gem)
      this.world = null;         // set after construction; used for scenery collision

      // The wand's combat stats — the merchant's upgrades mutate these.
      this.weapon = {
        name: "Magic Wand",
        damage: 1,
        cooldown: CONFIG.castCooldown,
        boltRadius: CONFIG.boltRadius,
        boltSpeed: CONFIG.boltSpeed,
        multishot: 1,            // bolts fired per cast
        spread: 0.22,            // radians between multishot bolts
        pierce: 0,               // extra enemies each bolt passes through
        color: "#bfe3ff",
        haloColor: "#9fd0ff",
      };

      this._build(scene, shadow);
    }

    _build(scene, shadow) {
      const root = new BABYLON.TransformNode("lily", scene);
      this.root = root;

      const yaw = new BABYLON.TransformNode("lilyYaw", scene); // rotates to face travel dir
      yaw.parent = root; this.yaw = yaw;

      const lean = new BABYLON.TransformNode("lilyLean", scene); // tilts for pick-up
      lean.parent = yaw; this.lean = lean;

      const skin = emat(scene, "skin", "#ffd9b8", 0.12);
      const hair = emat(scene, "hair", "#6b3f2a", 0.1);
      const dress = emat(scene, "dress", "#e0457f", 0.18);
      const dressDark = emat(scene, "dressDark", "#b5366a", 0.15);
      const shoe = emat(scene, "shoe", "#3a2a55", 0.1);
      const eyeMat = emat(scene, "eye", "#2a2a3a", 0);

      const add = (m, parent) => { m.parent = parent; shadow.addShadowCaster(m); return m; };

      // Skirt (cone) + torso give a "girl in a dress" silhouette.
      add(cone(scene, "skirt", 0.95, 0.5, 0.55, dressDark), lean).position.y = 0.78;
      add(cyl(scene, "torso", 0.45, 0.55, 0.7, dress), lean).position.y = 1.18;

      const head = add(sphere(scene, "head", 0.5, skin), lean); head.position.y = 1.75;
      const hairBack = add(sphere(scene, "hairBack", 0.56, hair), lean);
      hairBack.position.set(0, 1.8, -0.05); hairBack.scaling.set(1, 1.05, 1);
      const fringe = add(sphere(scene, "fringe", 0.5, hair), lean);
      fringe.position.set(0, 1.92, 0.04); fringe.scaling.set(1, 0.6, 1);

      for (const s of [-1, 1]) {
        const tail = add(sphere(scene, "tail", 0.22, hair), lean);
        tail.position.set(0.27 * s, 1.86, -0.04); tail.scaling.set(1, 1.7, 1);
        const eye = add(sphere(scene, "eye", 0.08, eyeMat), lean);
        eye.position.set(0.1 * s, 1.76, 0.23);
      }

      // Limbs on pivots so they can swing.
      const limb = (name, pivotY, x, material, len) => {
        const pivot = new BABYLON.TransformNode(name + "P", scene);
        pivot.parent = lean; pivot.position.set(x, pivotY, 0);
        const m = capsule(scene, name, len, 0.1, material);
        m.parent = pivot; m.position.y = -len / 2; shadow.addShadowCaster(m);
        return pivot;
      };
      this.armL = limb("armL", 1.45, -0.32, dress, 0.6);
      this.armR = limb("armR", 1.45, 0.32, dress, 0.6);
      this.legL = limb("legL", 0.7, -0.14, skin, 0.6);
      this.legR = limb("legR", 0.7, 0.14, skin, 0.6);
      // Shoes
      for (const [pivot, x] of [[this.legL, -0.14], [this.legR, 0.14]]) {
        const sh = add(box(scene, "shoe", 0.22, 0.14, 0.34, shoe), lean);
        sh.position.set(x, 0.07, 0.05); this["shoe" + x] = sh;
      }

      // ---- The MAGIC WAND, held in the right hand. ----
      this._buildWand(scene, shadow);

      // Where carried collectibles sit (above the hands / head).
      this.carryAnchor = new BABYLON.TransformNode("carry", scene);
      this.carryAnchor.parent = lean; this.carryAnchor.position.set(0, 2.35, 0.1);

      // Soft blob shadow.
      const blob = disc(scene, "blob", 0.6, emat(scene, "blob", "#000000", 0));
      blob.material.alpha = 0.28; blob.rotation.x = Math.PI / 2; blob.position.y = 0.02;
      blob.parent = root; blob.isPickable = false;

      root.position.set(0, 0, 12);
    }

    _buildWand(scene, shadow) {
      // Parent the wand to the right arm so it swings with the hand.
      const grip = new BABYLON.TransformNode("wandGrip", scene);
      grip.parent = this.armR; grip.position.set(0, -0.58, 0.12); // at the hand
      grip.rotation.x = -0.5; // angle the wand slightly forward/up
      this.wandGrip = grip;

      const handleMat = emat(scene, "wandHandle", "#5a3a8a", 0.05);
      const handle = cyl(scene, "wandHandle", 0.07, 0.05, 0.95, handleMat);
      handle.parent = grip; handle.position.y = 0.35; shadow.addShadowCaster(handle);

      // Glowing crystal star at the tip.
      const crystalMat = emat(scene, "wandCrystal", "#9fd0ff", 1.0);
      const crystal = BABYLON.MeshBuilder.CreatePolyhedron("wandCrystal", { type: 2, size: 0.16 }, scene);
      crystal.material = crystalMat; crystal.parent = grip; crystal.position.y = 0.9;
      this.wandCrystal = crystal;

      // A soft halo around the crystal.
      const halo = sphere(scene, "wandHalo", 0.34, emat(scene, "wandHaloM", "#9fd0ff", 1.0));
      halo.material.alpha = 0.22; halo.parent = grip; halo.position.y = 0.9; halo.isPickable = false;
      this.wandHalo = halo;

      // The point bolts launch from.
      const tip = new BABYLON.TransformNode("wandTip", scene);
      tip.parent = grip; tip.position.y = 1.02;
      this.wandTip = tip;

      // A little light so the wand actually glows on nearby surfaces.
      const glow = new BABYLON.PointLight("wandGlow", new BABYLON.Vector3(0, 0, 0), scene);
      glow.parent = tip; glow.diffuse = BABYLON.Color3.FromHexString("#9fd0ff");
      glow.intensity = 0.5; glow.range = 6;
      this.wandGlow = glow;
    }

    startPickup(itemMesh, onPicked) {
      this.state = "pickup"; this.pickT = 0;
      this.pendingItem = itemMesh; this.onPicked = onPicked;
    }
    get busy() { return this.state === "pickup"; }

    // Returns an array of { origin, dir } bolts to fire (one per multishot),
    // or null if still on cooldown / busy.
    tryCast() {
      if (this.castCooldown > 0 || this.busy) return null;
      const w = this.weapon;
      this.castCooldown = w.cooldown;
      this.castAnim = 1;
      const origin = this.wandTip.getAbsolutePosition().clone();
      const n = Math.max(1, w.multishot);
      const shots = [];
      for (let i = 0; i < n; i++) {
        // Fan the bolts symmetrically around the facing direction.
        const offset = n === 1 ? 0 : (i - (n - 1) / 2) * w.spread;
        const ang = this.facing + offset;
        // A tiny upward arc reads better than a flat shot.
        const dir = new BABYLON.Vector3(Math.sin(ang), 0.04, Math.cos(ang)).normalize();
        shots.push({ origin: origin.clone(), dir });
      }
      return shots;
    }

    update(dt, camera) {
      if (this.castCooldown > 0) this.castCooldown -= dt;
      if (this.castAnim > 0) this.castAnim = Math.max(0, this.castAnim - dt / 0.22);

      if (this.state === "pickup") { this._updatePickup(dt); }
      else { this._updateMove(dt, camera); }

      // Cast thrust is layered on top of whatever the right arm is doing.
      if (this.castAnim > 0) {
        const thrust = Math.sin(this.castAnim * Math.PI); // 0->1->0
        this.armR.rotation.x = lerp(this.armR.rotation.x, -1.9, thrust);
      }
      // Pulse the wand crystal.
      const pulse = 0.85 + Math.sin(performance.now() / 120) * 0.15;
      this.wandHalo.scaling.setAll(pulse);
      this.wandGlow.intensity = 0.4 + (this.castAnim > 0 ? 0.8 : 0) + pulse * 0.1;

      this.yaw.rotation.y = this.facing;
    }

    _updateMove(dt, camera) {
      const input = Input.moveVector();
      const mag = Math.min(1, Math.hypot(input.x, input.z));
      if (mag > 0.05) {
        // Camera-relative movement. For an ArcRotateCamera the view direction
        // (camera -> target) on the XZ plane is -(cos a, sin a); screen-right is
        // (-sin a, cos a). Using these makes "up" on the stick go into the screen
        // and "right" go right, on both touch and keyboard.
        const a = camera.alpha;
        const fwd = new BABYLON.Vector3(-Math.cos(a), 0, -Math.sin(a));
        const right = new BABYLON.Vector3(-Math.sin(a), 0, Math.cos(a));
        const dir = fwd.scale(input.z).add(right.scale(input.x));
        if (dir.lengthSquared() > 1e-4) {
          dir.normalize();
          const cur = this.root.position;
          const desired = cur.add(dir.scale(this.speed * mag * dt));
          // Resolve against the world fence + solid scenery (trees, rocks, river…),
          // sliding along obstacles instead of stopping dead.
          const moved = this.world
            ? this.world.moveActor(cur, desired, CONFIG.playerRadius)
            : (Math.hypot(desired.x, desired.z) < CONFIG.worldRadius ? desired : cur);
          this.root.position = moved;
          this.facing = lerpAngle(this.facing, Math.atan2(dir.x, dir.z), CONFIG.turnLerp);
        }
        this.state = "walk"; this.walkPhase += dt * 10 * mag;
      } else {
        this.state = "idle"; this.walkPhase += dt * 2; // gentle idle motion
      }
      this._animateLocomotion(mag);
    }

    _animateLocomotion(speed) {
      if (this.state === "walk") {
        const sw = Math.sin(this.walkPhase) * 0.7 * (0.3 + speed);
        this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
        this.armL.rotation.x = -sw * 0.8; this.armR.rotation.x = sw * 0.8;
        this.lean.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06;
        this.lean.rotation.x = 0;
      } else {
        // Idle: breathing + a touch of arm sway.
        const b = Math.sin(this.walkPhase) * 0.05;
        this.legL.rotation.x = this.legR.rotation.x = 0;
        this.armL.rotation.x = lerp(this.armL.rotation.x, 0.08 + b, 0.2);
        this.armR.rotation.x = lerp(this.armR.rotation.x, 0.08 - b, 0.2);
        this.armL.rotation.z = lerp(this.armL.rotation.z || 0, 0.08, 0.2);
        this.armR.rotation.z = lerp(this.armR.rotation.z || 0, -0.08, 0.2);
        this.lean.position.y = lerp(this.lean.position.y, b * 0.4, 0.2);
        this.lean.rotation.x = lerp(this.lean.rotation.x, 0, 0.2);
      }
    }

    // Crouch -> grab -> stand and raise the artifact, which then poofs into points.
    _updatePickup(dt) {
      this.pickT = Math.min(1, this.pickT + dt / 0.7);
      const t = this.pickT;
      const bend = Math.sin(Math.min(t, 0.5) / 0.5 * Math.PI / 2);      // 0->1 by t=0.5
      const rise = t < 0.5 ? 0 : (t - 0.5) / 0.5;                        // 0->1 from t=0.5
      const downThenUp = t < 0.5 ? bend : (1 - rise);
      this.lean.rotation.x = downThenUp * 0.55;
      this.lean.position.y = -downThenUp * 0.18;
      const armDown = downThenUp * 1.3;
      const armUp = rise * 2.6;
      // Left arm does the grabbing (right hand holds the wand).
      this.armL.rotation.x = armDown - armUp;
      this.armL.rotation.z = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;

      // At the bottom of the reach, take hold of the artifact.
      if (this.pendingItem && t >= 0.5) {
        const m = this.pendingItem; this.pendingItem = null;
        m.setParent(this.carryAnchor);
        m.position.set(0, -1.4, 0.4);
        this.carried = m;
        if (this.onPicked) { this.onPicked(); this.onPicked = null; }
      }
      // Raise the held artifact overhead as we stand.
      if (this.carried) {
        this.carried.position.y = lerp(this.carried.position.y, 0.4, 0.3);
        this.carried.position.z = lerp(this.carried.position.z, 0, 0.3);
        this.carried.scaling.setAll(lerp(this.carried.scaling.x, t > 0.85 ? 0 : 1, 0.3));
      }
      if (t >= 1) {
        if (this.carried) { this.carried.dispose(); this.carried = null; }
        this.state = "idle"; this.lean.rotation.x = 0; this.lean.position.y = 0;
      }
    }

    // Returns true if the hit actually landed (i.e. wasn't on bite-cooldown).
    takeDamage(amount) {
      this.health = Math.max(0, this.health - amount);
      return this.health;
    }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // Magic bolts (wand projectiles)
  // =========================================================================
  class Projectile {
    constructor(scene, shadow, origin, dir, opts = {}) {
      this.dir = dir.clone();
      this.life = CONFIG.boltLife;
      this.speed = opts.speed || CONFIG.boltSpeed;
      this.radius = opts.radius || CONFIG.boltRadius;  // hit radius vs monsters
      this.damage = opts.damage || 1;
      this.pierce = opts.pierce || 0;                  // extra enemies a bolt passes through
      this.hitSet = new Set();                         // monsters already struck (no double-hits)
      this.dead = false;
      const m = sphere(scene, "bolt", 0.32, emat(scene, "boltM", opts.color || "#bfe3ff", 1.0));
      m.position.copyFrom(origin);
      m.isPickable = false;
      // Scale the visible bolt with its hit radius so upgrades read on-screen.
      m.scaling.setAll(this.radius / CONFIG.boltRadius);
      this.mesh = m;
      // A trailing glow.
      const halo = sphere(scene, "boltHalo", 0.6, emat(scene, "boltHaloM", opts.haloColor || "#9fd0ff", 1.0));
      halo.material.alpha = 0.3; halo.parent = m; halo.isPickable = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.mesh.position.addInPlace(this.dir.scale(this.speed * dt));
      if (Math.hypot(this.mesh.position.x, this.mesh.position.z) > CONFIG.worldRadius + 6) this.dead = true;
    }
    dispose() { this.mesh.dispose(); }
  }

  // =========================================================================
  // Monster — a "living sweet" with a chase AI, a bob, and a pop on death.
  // =========================================================================
  const SWEETS = [
    "lollipop", "gummy", "cupcake", "donut", "candycane",
    "icecream", "macaron", "candycorn", "chocbar", "jellybean", "marshmallow", "pretzel",
  ];

  class Monster {
    // `restore` (optional) rebuilds a saved sweet exactly: { kind, hp, speed }.
    constructor(scene, shadow, pos, wave, restore) {
      this.scene = scene;
      if (restore) {
        this.hp = restore.hp;
        this.speed = restore.speed;
        this.kind = restore.kind;
      } else {
        this.hp = 1 + Math.floor((wave - 1) / CONFIG.monsterHpPerWaves); // sturdier in later waves
        this.speed = Math.min(
          CONFIG.monsterMaxSpeed,
          CONFIG.monsterBaseSpeed + rng() * 0.7 + (wave - 1) * CONFIG.monsterSpeedPerWave
        );
        this.kind = SWEETS[(rng() * SWEETS.length) | 0];
      }
      this.alive = true;
      this.dying = 0;                               // >0 while playing the pop animation
      this.radius = 0.85;
      this.isBoss = false;
      this.contactDamage = CONFIG.contactDamage;    // damage dealt to the player on contact
      this.bob = rng() * Math.PI * 2;
      this.biteTimer = 0;                           // cooldown before this sweet bites again
      this._build(scene, shadow, pos);
    }

    _build(scene, shadow, pos) {
      const root = new BABYLON.TransformNode("monster", scene);
      root.position.copyFrom(pos);
      this.root = root;
      const body = new BABYLON.TransformNode("monsterBody", scene);
      body.parent = root; this.body = body;

      const candy = PALETTE[(rng() * PALETTE.length) | 0];
      const main = emat(scene, "swt" + root.uniqueId, candy, 0.18);
      const cream = emat(scene, "cream" + root.uniqueId, "#fff3e0", 0.1);
      const dark = emat(scene, "swtd" + root.uniqueId, "#7a4030", 0.08);
      const add = (m) => { m.parent = body; shadow.addShadowCaster(m); return m; };

      let topY = 1.1; // where the face sits, per kind
      if (this.kind === "lollipop") {
        const stick = add(cyl(scene, "stick", 0.08, 0.08, 0.9, cream)); stick.position.y = 0.45;
        const disc2 = add(cyl(scene, "pop", 0.9, 0.9, 0.22, main)); disc2.position.y = 1.05; disc2.rotation.x = Math.PI / 2;
        topY = 1.05;
      } else if (this.kind === "gummy") {
        const torso = add(capsule(scene, "gtor", 1.0, 0.42, main)); torso.position.y = 0.7;
        const headm = add(sphere(scene, "ghead", 0.7, main)); headm.position.y = 1.2;
        for (const s of [-1, 1]) {
          const ear = add(sphere(scene, "gear", 0.28, main)); ear.position.set(0.32 * s, 1.55, 0);
          const arm = add(capsule(scene, "garm", 0.5, 0.14, main)); arm.position.set(0.5 * s, 0.8, 0); arm.rotation.z = 0.6 * s;
        }
        topY = 1.25;
      } else if (this.kind === "cupcake") {
        const base = add(cone(scene, "cbaseM", 0.95, 0.6, 0.7, cream)); base.position.y = 0.45;
        const top = add(sphere(scene, "ctop", 1.0, main)); top.position.y = 1.0; top.scaling.y = 0.85;
        const cherry = add(sphere(scene, "cherry", 0.25, emat(scene, "cherryM" + root.uniqueId, "#ff4060", 0.3))); cherry.position.y = 1.55;
        topY = 1.1;
      } else if (this.kind === "donut") {
        const torus = BABYLON.MeshBuilder.CreateTorus("donut", { diameter: 1.4, thickness: 0.6, tessellation: 16 }, scene);
        torus.material = main; add(torus); torus.position.y = 0.8;
        const ice = BABYLON.MeshBuilder.CreateTorus("icing", { diameter: 1.4, thickness: 0.62, tessellation: 16 }, scene);
        ice.material = cream; add(ice); ice.position.y = 0.9; ice.scaling.y = 0.6;
        topY = 1.15;
      } else if (this.kind === "candycane") {
        const cane = add(capsule(scene, "cane", 1.3, 0.28, cream)); cane.position.y = 0.75;
        const stripe = add(capsule(scene, "stripe", 1.3, 0.30, main)); stripe.position.y = 0.75; stripe.scaling.set(0.6, 1.01, 0.6); stripe.rotation.y = 0.5;
        const hook = add(sphere(scene, "hook", 0.4, cream)); hook.position.set(0.18, 1.45, 0);
        topY = 1.0;
      } else if (this.kind === "icecream") {
        // Waffle cone (point down) + two stacked scoops.
        const coneM = add(cone(scene, "iccone", 0.7, 0.05, 1.0, emat(scene, "icconeM" + root.uniqueId, "#c8923f", 0.08)));
        coneM.position.y = 0.5; coneM.rotation.x = Math.PI; // tip down
        const s1 = add(sphere(scene, "icscoop1", 0.78, main)); s1.position.y = 1.05;
        const s2 = add(sphere(scene, "icscoop2", 0.64, cream)); s2.position.y = 1.55;
        topY = 1.05;
      } else if (this.kind === "macaron") {
        // Two domed shells with a cream filling.
        const top = add(sphere(scene, "mtop", 1.1, main)); top.position.y = 1.05; top.scaling.y = 0.5;
        const bot = add(sphere(scene, "mbot", 1.1, main)); bot.position.y = 0.65; bot.scaling.y = 0.5;
        const fill = add(cyl(scene, "mfill", 1.0, 1.0, 0.25, cream)); fill.position.y = 0.85;
        topY = 1.05;
      } else if (this.kind === "candycorn") {
        // Classic three-band cone (white tip, orange, yellow).
        const yellow = emat(scene, "ccY" + root.uniqueId, "#ffd34e", 0.18);
        const orange = emat(scene, "ccO" + root.uniqueId, "#ff944e", 0.18);
        const b1 = add(cone(scene, "ccb1", 1.0, 0.7, 0.5, yellow)); b1.position.y = 0.3;
        const b2 = add(cone(scene, "ccb2", 0.7, 0.4, 0.5, orange)); b2.position.y = 0.78;
        const b3 = add(cone(scene, "ccb3", 0.4, 0.05, 0.5, cream)); b3.position.y = 1.25;
        topY = 0.62;
      } else if (this.kind === "chocbar") {
        // A chunky chocolate bar with embossed squares.
        const bar = add(box(scene, "bar", 1.5, 1.0, 0.5, emat(scene, "barM" + root.uniqueId, "#5b3a22", 0.08)));
        bar.position.y = 0.9;
        for (const sx of [-0.42, 0.42]) for (const sy of [-0.22, 0.22]) {
          const sq = add(box(scene, "sq", 0.5, 0.4, 0.12, dark)); sq.position.set(sx, 0.9 + sy, 0.26);
        }
        topY = 1.35;
      } else if (this.kind === "jellybean") {
        // A glossy bean — a fat tilted capsule.
        const bean = add(capsule(scene, "bean", 1.1, 0.55, main)); bean.position.y = 0.62; bean.rotation.z = 0.5;
        const shine = add(sphere(scene, "shine", 0.3, cream)); shine.position.set(-0.25, 0.95, 0.35);
        topY = 0.78;
      } else if (this.kind === "marshmallow") {
        // Soft squishy cylinder.
        const mm = add(cyl(scene, "mm", 1.05, 1.05, 1.1, cream)); mm.position.y = 0.75;
        const band = add(cyl(scene, "mmband", 1.08, 1.08, 0.3, main)); band.position.y = 0.75;
        topY = 1.0;
      } else { // pretzel — a knotted torus with salt bumps.
        const knot = BABYLON.MeshBuilder.CreateTorusKnot("pretzel", { radius: 0.5, tube: 0.18, radialSegments: 32, tubularSegments: 8, p: 2, q: 3 }, scene);
        knot.material = emat(scene, "pretM" + root.uniqueId, "#a6692e", 0.08); add(knot); knot.position.y = 0.95;
        for (let s = 0; s < 5; s++) {
          const salt = add(sphere(scene, "salt", 0.1, cream));
          salt.position.set((rng() - 0.5) * 1.1, 0.95 + (rng() - 0.5) * 1.1, 0.3 + rng() * 0.2);
        }
        topY = 1.55;
      }

      // Cute angry face — eyes + a little frown — for every sweet.
      const eyeMat = emat(scene, "meye" + root.uniqueId, "#241a2a", 0);
      const whiteMat = emat(scene, "mwhite" + root.uniqueId, "#ffffff", 0.05);
      for (const s of [-1, 1]) {
        const w = add(sphere(scene, "mw", 0.2, whiteMat)); w.position.set(0.18 * s, topY, 0.42); w.scaling.z = 0.5;
        const e = add(sphere(scene, "me", 0.1, eyeMat)); e.position.set(0.18 * s, topY, 0.5);
        const brow = add(box(scene, "brow", 0.22, 0.05, 0.05, eyeMat)); brow.position.set(0.18 * s, topY + 0.16, 0.48); brow.rotation.z = -0.5 * s;
      }
      const mouth = add(box(scene, "mouth", 0.26, 0.06, 0.05, eyeMat)); mouth.position.set(0, topY - 0.22, 0.5);

      // Soft blob shadow.
      const blob = disc(scene, "mblob", this.radius, emat(scene, "mblobM" + root.uniqueId, "#000000", 0));
      blob.material.alpha = 0.25; blob.rotation.x = Math.PI / 2; blob.position.y = 0.02;
      blob.parent = root; blob.isPickable = false;
    }

    // Move toward the player; return true if currently touching them.
    update(dt, playerPos) {
      if (this.biteTimer > 0) this.biteTimer -= dt;
      if (this.dying > 0) {
        this.dying -= dt;
        const k = Math.max(0, this.dying / 0.35);
        this.body.scaling.setAll(k);
        this.body.rotation.y += dt * 12;
        if (this.dying <= 0) { this.alive = false; this.root.dispose(); }
        return false;
      }
      this.bob += dt * 6;
      // Ease back to normal scale after a non-fatal hit squashed us bigger.
      if (this.body.scaling.x !== 1) this.body.scaling.setAll(lerp(this.body.scaling.x, 1, 0.25));
      const to = playerPos.subtract(this.root.position); to.y = 0;
      const dist = to.length();
      if (dist > 0.001) {
        to.normalize();
        const step = Math.min(this.speed * dt, Math.max(0, dist - 1.0));
        this.root.position.addInPlace(to.scale(step));
        this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(to.x, to.z), 0.2);
      }
      // Hoppy bob.
      this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.18;
      return dist <= this.radius + 1.0;
    }

    hit(dmg) {
      this.hp -= dmg;
      if (this.hp <= 0 && this.dying <= 0) { this.dying = 0.35; return true; } // killed
      // flash / squash on a non-fatal hit
      this.body.scaling.setAll(1.25);
      return false;
    }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // Boss — a colossal "Sweet King" that storms in every few waves. Far more HP,
  // hits harder, slower, and shows a dedicated health bar. Shares the Monster
  // interface (update/hit/position/radius/alive/dying/biteTimer) so the wave,
  // projectile and contact systems treat it like any other sweet.
  // =========================================================================
  const BOSS_KINDS = [
    { name: "Gummy King",      color: "#ff4d6d", crown: "#ffd34e" },
    { name: "Choco Overlord",  color: "#7a4a2a", crown: "#ffe27a" },
    { name: "Lollipop Tyrant", color: "#a06cff", crown: "#ffd34e" },
    { name: "Cupcake Colossus", color: "#ff7ac0", crown: "#fff3a0" },
  ];

  class Boss {
    constructor(scene, shadow, pos, wave) {
      this.scene = scene;
      this.wave = wave;                                       // recorded for save/restore
      const cycle = Math.floor(wave / CONFIG.bossEveryWaves); // 1, 2, 3, …
      this.maxHp = CONFIG.bossBaseHp + (cycle - 1) * CONFIG.bossHpPerCycle;
      this.hp = this.maxHp;
      this.speed = CONFIG.bossSpeed + (cycle - 1) * 0.15;
      this.alive = true;
      this.dying = 0;
      this.radius = CONFIG.bossRadius;
      this.isBoss = true;
      this.contactDamage = CONFIG.bossContactDamage;
      this.bob = 0;
      this.biteTimer = 0;
      this.kind = BOSS_KINDS[(cycle - 1) % BOSS_KINDS.length];
      this.name = this.kind.name;
      this._build(scene, shadow, pos);
    }

    _build(scene, shadow, pos) {
      const root = new BABYLON.TransformNode("boss", scene);
      root.position.copyFrom(pos);
      this.root = root;
      const body = new BABYLON.TransformNode("bossBody", scene);
      body.parent = root; this.body = body;

      const main = emat(scene, "bossM" + root.uniqueId, this.kind.color, 0.28);
      const dark = emat(scene, "bossD" + root.uniqueId, "#2a1530", 0.05);
      const gold = emat(scene, "bossG" + root.uniqueId, this.kind.crown, 0.5);
      const cream = emat(scene, "bossC" + root.uniqueId, "#fff3e0", 0.12);
      const add = (m) => { m.parent = body; shadow.addShadowCaster(m); return m; };

      // A hulking gummy-bear-ish torso + head.
      const torso = add(capsule(scene, "btor", 2.4, 1.2, main)); torso.position.y = 1.7;
      const head = add(sphere(scene, "bhead", 2.0, main)); head.position.y = 3.2;
      for (const s of [-1, 1]) {
        const ear = add(sphere(scene, "bear", 0.8, main)); ear.position.set(0.9 * s, 4.1, 0);
        const arm = add(capsule(scene, "barm", 1.5, 0.45, main)); arm.position.set(1.4 * s, 1.9, 0); arm.rotation.z = 0.7 * s;
        const leg = add(capsule(scene, "bleg", 1.2, 0.5, main)); leg.position.set(0.6 * s, 0.6, 0);
      }
      const belly = add(sphere(scene, "bbelly", 1.5, cream)); belly.position.set(0, 1.5, 0.7); belly.scaling.set(1, 1.2, 0.5);

      // A golden crown — the mark of a sweet monarch.
      const band = add(cyl(scene, "bcrown", 1.5, 1.5, 0.5, gold)); band.position.y = 4.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = add(cone(scene, "bspike", 0.4, 0.02, 0.7, gold));
        spike.position.set(Math.cos(a) * 0.7, 5.0, Math.sin(a) * 0.7);
      }
      const jewel = add(BABYLON.MeshBuilder.CreatePolyhedron("bjewel", { type: 1, size: 0.4 }, scene));
      jewel.material = emat(scene, "bjewelM" + root.uniqueId, "#ff3b6b", 0.7); jewel.position.set(0, 4.55, 0.75);

      // Menacing glowing eyes + a big scowl.
      const eyeMat = emat(scene, "beye" + root.uniqueId, "#ff2a2a", 0.9);
      const whiteMat = emat(scene, "bwhite" + root.uniqueId, "#ffffff", 0.05);
      for (const s of [-1, 1]) {
        const w = add(sphere(scene, "bw", 0.55, whiteMat)); w.position.set(0.45 * s, 3.35, 0.95); w.scaling.z = 0.5;
        const e = add(sphere(scene, "be", 0.28, eyeMat)); e.position.set(0.45 * s, 3.3, 1.15);
        const brow = add(box(scene, "bbrow", 0.6, 0.13, 0.13, dark)); brow.position.set(0.45 * s, 3.7, 1.1); brow.rotation.z = -0.5 * s;
      }
      const mouth = add(box(scene, "bmouth", 0.9, 0.16, 0.13, dark)); mouth.position.set(0, 2.7, 1.2);

      // An ominous red glow + big blob shadow.
      const glow = new BABYLON.PointLight("bossGlow", new BABYLON.Vector3(0, 3, 0), scene);
      glow.parent = root; glow.diffuse = BABYLON.Color3.FromHexString("#ff5a6a");
      glow.intensity = 0.7; glow.range = 14;
      const blob = disc(scene, "bblob", this.radius * 1.3, emat(scene, "bblobM" + root.uniqueId, "#000000", 0));
      blob.material.alpha = 0.3; blob.rotation.x = Math.PI / 2; blob.position.y = 0.03;
      blob.parent = root; blob.isPickable = false;
    }

    update(dt, playerPos) {
      if (this.biteTimer > 0) this.biteTimer -= dt;
      if (this.dying > 0) {
        this.dying -= dt;
        const k = Math.max(0, this.dying / 0.8);
        this.body.scaling.setAll(k);
        this.body.rotation.y += dt * 8;
        this.root.position.y = (1 - k) * -1;
        if (this.dying <= 0) { this.alive = false; this.root.dispose(); }
        return false;
      }
      this.bob += dt * 4;
      if (this.body.scaling.x !== 1) this.body.scaling.setAll(lerp(this.body.scaling.x, 1, 0.2));
      const to = playerPos.subtract(this.root.position); to.y = 0;
      const dist = to.length();
      if (dist > 0.001) {
        to.normalize();
        const step = Math.min(this.speed * dt, Math.max(0, dist - this.radius));
        this.root.position.addInPlace(to.scale(step));
        this.body.rotation.y = lerpAngle(this.body.rotation.y, Math.atan2(to.x, to.z), 0.12);
      }
      // A heavy, lumbering stomp.
      this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.3;
      return dist <= this.radius + 1.2;
    }

    hit(dmg) {
      this.hp -= dmg;
      updateBossBar(this);
      if (this.hp <= 0 && this.dying <= 0) { this.dying = 0.8; return true; }
      this.body.scaling.setAll(1.12);
      return false;
    }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // Coin — a spinning golden coin dropped by defeated sweets. Walk near it to
  // scoop it up; coins are the currency spent at the merchant's shop.
  // =========================================================================
  class Coin {
    constructor(scene, shadow, pos, value) {
      this.value = value;
      this.life = CONFIG.coinLife;
      this.collected = false;
      this.spin = rng() * Math.PI * 2;
      const root = new BABYLON.TransformNode("coin", scene);
      root.position.copyFrom(pos);
      root.position.y = 0.6;
      this.root = root;

      const gold = emat(scene, "coinM" + root.uniqueId, "#ffcf3a", 0.45);
      const disc2 = cyl(scene, "coinDisc", 0.42, 0.42, 0.1, gold);
      disc2.rotation.x = Math.PI / 2; disc2.parent = root;
      shadow.addShadowCaster(disc2);
      // A soft glow so coins are easy to spot in the grass.
      const halo = sphere(scene, "coinHalo", 0.7, emat(scene, "coinHaloM" + root.uniqueId, "#ffe27a", 1));
      halo.material.alpha = 0.22; halo.parent = root; halo.isPickable = false;
      this.halo = halo;
    }

    // Returns true once the player has scooped this coin up.
    update(dt, playerPos) {
      this.life -= dt;
      this.spin += dt * 4;
      this.root.rotation.y = this.spin;
      this.root.position.y = 0.6 + Math.sin(this.spin * 1.5) * 0.08;
      this.halo.scaling.setAll(1 + Math.sin(this.spin * 2) * 0.12);

      const dx = playerPos.x - this.root.position.x;
      const dz = playerPos.z - this.root.position.z;
      const dist = Math.hypot(dx, dz);
      // Magnet: drift toward the player when they're close, then collect.
      if (dist < coinMagnetRange) {
        const pull = (1 - dist / coinMagnetRange) * 8 * dt;
        this.root.position.x += dx * pull / (dist || 1);
        this.root.position.z += dz * pull / (dist || 1);
      }
      return dist <= coinPickupRange;
    }

    dispose() { this.root.dispose(); }
  }

  // =========================================================================
  // Merchant — a friendly NPC who appears at the plaza after a wave is cleared
  // and leaves when the next wave begins. Walk up + press E to open the shop.
  // =========================================================================
  class Merchant {
    constructor(scene, shadow, interaction, onOpen) {
      const root = new BABYLON.TransformNode("merchant", scene);
      root.position.set(0, 0, 0);
      this.root = root;
      this.bob = 0;
      this._build(scene, shadow);

      this.it = new Interactable(root, {
        label: "Shop",
        range: 3.4,
        onInteract: () => onOpen(),
      });
      this.it.enabled = false;
      interaction.register(this.it);

      root.setEnabled(false);
      this.visible = false;
    }

    _build(scene, shadow) {
      const robe = emat(scene, "mRobe", "#4a3a8a", 0.08);
      const robeDk = emat(scene, "mRobeDk", "#352a66", 0.06);
      const skin = emat(scene, "mSkin", "#ffd9b8", 0.08);
      const hat = emat(scene, "mHat", "#2a2050", 0.06);
      const gold = emat(scene, "mGold", "#ffcf3a", 0.5);
      const add = (m) => { m.parent = this.root; shadow.addShadowCaster(m); return m; };

      add(cone(scene, "mBody", 1.1, 0.4, 1.5, robe)).position.y = 0.75;
      add(cyl(scene, "mBelt", 0.7, 0.85, 0.18, robeDk)).position.y = 0.95;
      const head = add(sphere(scene, "mHead", 0.55, skin)); head.position.y = 1.75;
      // A big beard for the wizardly merchant.
      const beard = add(cone(scene, "mBeard", 0.5, 0.06, 0.7, emat(scene, "mBeardM", "#e8e8f0", 0.05)));
      beard.position.set(0, 1.5, 0.18); beard.rotation.x = Math.PI;
      // Wide-brimmed pointed hat.
      add(cyl(scene, "mBrim", 1.1, 1.1, 0.08, hat)).position.y = 2.02;
      add(cone(scene, "mCap", 0.7, 0.02, 1.0, hat)).position.y = 2.5;
      const star = add(BABYLON.MeshBuilder.CreatePolyhedron("mStar", { type: 2, size: 0.12 }, scene));
      star.material = gold; star.position.y = 3.0;
      for (const s of [-1, 1]) {
        const eye = add(sphere(scene, "mEye", 0.08, emat(scene, "mEyeM", "#2a2a3a", 0)));
        eye.position.set(0.13 * s, 1.8, 0.45);
      }

      // A floating "shop" marker (coin pouch) so the player can spot the merchant.
      const sign = new BABYLON.TransformNode("mSign", scene);
      sign.parent = this.root; sign.position.y = 3.5; this.sign = sign;
      const bag = sphere(scene, "mBag", 0.45, emat(scene, "mBagM", "#b07a3a", 0.1));
      bag.parent = sign; bag.position.set(0, 0, 0); bag.scaling.set(1, 1.1, 1);
      shadow.addShadowCaster(bag);
      const coin = cyl(scene, "mCoinIcon", 0.42, 0.42, 0.08, gold);
      coin.parent = sign; coin.position.set(0, 0, 0.4); coin.rotation.x = Math.PI / 2;
      this.coinIcon = coin;

      // Light so the merchant pops at the plaza.
      const glow = new BABYLON.PointLight("mGlow", new BABYLON.Vector3(0, 2.4, 0), scene);
      glow.parent = this.root; glow.diffuse = BABYLON.Color3.FromHexString("#ffd98a");
      glow.intensity = 0.6; glow.range = 8;
    }

    show() {
      if (this.visible) return;
      this.visible = true;
      this.root.setEnabled(true);
      this.it.enabled = true;
    }
    hide() {
      if (!this.visible) return;
      this.visible = false;
      this.root.setEnabled(false);
      this.it.enabled = false;
    }
    update(dt) {
      if (!this.visible) return;
      this.bob += dt;
      this.sign.position.y = 3.5 + Math.sin(this.bob * 2) * 0.12;
      this.coinIcon.rotation.y += dt * 2;
    }
  }

  // =========================================================================
  // World — procedural environment.
  // =========================================================================
  function buildWorld(scene) {
    scene.clearColor = BABYLON.Color3.FromHexString("#86c5ff").toColor4(1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogColor = BABYLON.Color3.FromHexString("#a9d4ff");
    scene.fogDensity = 0.006;

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 1.0; hemi.groundColor = BABYLON.Color3.FromHexString("#4a6a3a");
    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.4), scene);
    sun.position = new BABYLON.Vector3(60, 90, 60); sun.intensity = 1.0;

    const shadow = new BABYLON.ShadowGenerator(2048, sun);
    shadow.useBlurExponentialShadowMap = true; shadow.blurScale = 2;

    // The world grew a lot — size the ground/roads to the new playable radius.
    const GROUND = CONFIG.worldRadius * 2 + 60; // a generous skirt beyond the fence

    // Grass ground.
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: GROUND, height: GROUND }, scene);
    ground.material = mat(scene, "grass", "#5fae4f"); ground.receiveShadows = true;

    // ---- Solid scenery is tracked here as {x,z,r} circles for collision. ----
    const obstacles = [];
    const addObstacle = (x, z, r) => obstacles.push({ x, z, r });

    // ---- A winding RIVER with wooden bridges. -------------------------------
    // The river is a straight band at a fixed orientation. Crossing it is the
    // local +X of the deck (crossN); flowing along it is local +Z (alongT).
    const riverAngle = 0.5 + rng() * 0.7;
    const ca = Math.cos(riverAngle), sa = Math.sin(riverAngle);
    const crossN = { x: ca, z: -sa };            // perpendicular to the flow
    const alongT = { x: sa, z: ca };             // direction of flow
    const riverPerp = 30 + rng() * 6;    // offset of the river from centre
    const riverHalf = 6.5;                        // half-width of the water
    const bridgeHalf = 5;                         // half-length of each bridge gap
    const bridges = [0, 52, -52];                 // crossing points along the flow

    const signedPerp = (x, z) => x * crossN.x + z * crossN.z;
    const tangent = (x, z) => x * alongT.x + z * alongT.z;
    const onBridge = (x, z) => {
      const t = tangent(x, z);
      for (const b of bridges) if (Math.abs(t - b) < bridgeHalf) return true;
      return false;
    };
    // True if a point sits in open water (blocks movement); bridges are walkable.
    const inRiver = (x, z) => Math.abs(signedPerp(x, z) - riverPerp) < riverHalf && !onBridge(x, z);

    // Water surface (a long translucent blue band) + darker muddy banks.
    const riverCenter = { x: riverPerp * crossN.x, z: riverPerp * crossN.z };
    const riverLen = GROUND;
    const bank = BABYLON.MeshBuilder.CreateGround("bank", { width: riverHalf * 2 + 4, height: riverLen }, scene);
    bank.rotation.y = riverAngle; bank.position.set(riverCenter.x, 0.015, riverCenter.z);
    bank.material = mat(scene, "bank", "#5c4a32"); bank.receiveShadows = true;
    const waterMat = emat(scene, "water", "#3aa0e0", 0.18);
    waterMat.alpha = 0.82; waterMat.specularColor = new BABYLON.Color3(0.5, 0.6, 0.7);
    const water = BABYLON.MeshBuilder.CreateGround("water", { width: riverHalf * 2, height: riverLen }, scene);
    water.rotation.y = riverAngle; water.position.set(riverCenter.x, 0.05, riverCenter.z);
    water.material = waterMat; water.isPickable = false;

    // Lily pads floating on the water (purely decorative).
    const padMat = mat(scene, "pad", "#2f8f4a");
    for (let i = 0; i < 14; i++) {
      const t = (rng() - 0.5) * riverLen * 0.8;
      if (Math.abs((((t) % 52) + 52) % 52) < bridgeHalf + 1) continue; // not on a bridge
      const off = (rng() - 0.5) * (riverHalf * 1.4);
      const x = riverCenter.x + alongT.x * t + crossN.x * off;
      const z = riverCenter.z + alongT.z * t + crossN.z * off;
      const pad = disc(scene, "pad", 0.5 + rng() * 0.4, padMat);
      pad.rotation.x = Math.PI / 2; pad.position.set(x, 0.08, z); pad.isPickable = false;
    }

    // Bridges — a wooden plank deck + rails at each crossing.
    const plankMat = mat(scene, "plank", "#9a6a3a");
    const railMat = mat(scene, "rail", "#7a5230");
    for (const b of bridges) {
      const cx = riverCenter.x + alongT.x * b;
      const cz = riverCenter.z + alongT.z * b;
      const deck = box(scene, "bridge", riverHalf * 2 + 5, 0.25, bridgeHalf * 2, plankMat);
      deck.rotation.y = riverAngle; deck.position.set(cx, 0.12, cz); deck.receiveShadows = true;
      shadow.addShadowCaster(deck);
      for (const side of [-1, 1]) {
        const rail = box(scene, "rail", riverHalf * 2 + 5, 0.5, 0.18, railMat);
        rail.rotation.y = riverAngle;
        rail.position.set(cx + alongT.x * (bridgeHalf - 0.2) * side, 0.5, cz + alongT.z * (bridgeHalf - 0.2) * side);
        shadow.addShadowCaster(rail);
      }
    }

    // ---- Roads: a randomly oriented crossroads of grey strips. ----
    const roadMat = mat(scene, "road", "#6b6f78");
    const roadEdge = mat(scene, "roadEdge", "#d9c47a");
    const baseAngle = rng() * Math.PI;
    const roadAngles = [baseAngle, baseAngle + Math.PI / 2];
    for (const ang of roadAngles) {
      const road = BABYLON.MeshBuilder.CreateGround("road", { width: 7, height: GROUND }, scene);
      road.rotation.y = ang; road.position.y = 0.02; road.material = roadMat; road.receiveShadows = true;
      for (const side of [-1, 1]) {
        const edge = BABYLON.MeshBuilder.CreateGround("edge", { width: 0.35, height: GROUND }, scene);
        edge.rotation.y = ang; edge.position.y = 0.03; edge.material = roadEdge;
        edge.position.x = Math.cos(ang) * 3.3 * side;
        edge.position.z = -Math.sin(ang) * 3.3 * side;
      }
    }

    // Central plaza.
    const plaza = disc(scene, "plaza", 5, mat(scene, "plaza", "#caa46a"));
    plaza.rotation.x = Math.PI / 2; plaza.position.y = 0.04; plaza.receiveShadows = true;

    // Helper: are we on/near a road centerline? (keep trees off the roads)
    const onRoad = (x, z) => {
      for (const ang of roadAngles) {
        const perp = Math.abs(x * Math.sin(ang) - z * Math.cos(ang));
        if (perp < 5) return true;
      }
      return false;
    };

    // Find a valid scatter spot: away from spawn/roads/water, inside the fence.
    const place = (minR, maxR) => {
      for (let tries = 0; tries < 16; tries++) {
        const ang = rng() * Math.PI * 2;
        const r = minR + rng() * (maxR - minR);
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        if (r > 6 && !onRoad(x, z) &&
            Math.abs(signedPerp(x, z) - riverPerp) > riverHalf + 1.5) return { x, z };
      }
      return null;
    };

    const FAR = CONFIG.worldRadius - 6;

    // ---- Lampposts marching along the roads (emissive, no extra GPU lights). ----
    const poleMat = mat(scene, "pole", "#3a3f4a");
    const lampMat = emat(scene, "lamp", "#ffe6a0", 0.9);
    for (const ang of roadAngles) {
      for (let d = -FAR + 8; d <= FAR - 8; d += 18) {
        for (const side of [-1, 1]) {
          const x = Math.cos(ang) * d + Math.sin(ang) * 4.4 * side;
          const z = -Math.sin(ang) * d + Math.cos(ang) * 4.4 * side;
          if (Math.hypot(x, z) > FAR || inRiver(x, z)) continue;
          const pole = cyl(scene, "pole", 0.18, 0.22, 3.2, poleMat);
          pole.position.set(x, 1.6, z); shadow.addShadowCaster(pole);
          const lamp = sphere(scene, "lamp", 0.5, lampMat);
          lamp.position.set(x, 3.35, z); lamp.isPickable = false;
          addObstacle(x, z, 0.4);
        }
      }
    }

    // ---- Trees. ----
    const trunkMat = mat(scene, "trunk", "#7a5230");
    const leafMats = ["#3f9d4a", "#46ad53", "#379142"].map((c, i) => mat(scene, "leaf" + i, c));
    const trees = 60 + ((rng() * 18) | 0);
    for (let i = 0; i < trees; i++) {
      const p = place(8, FAR); if (!p) continue;
      const h = 1.3 + rng() * 1.0;
      const trunk = cyl(scene, "trunk", 0.5, 0.6, h * 1.5, trunkMat);
      trunk.position.set(p.x, h * 0.75, p.z); shadow.addShadowCaster(trunk);
      const lm = leafMats[(rng() * leafMats.length) | 0];
      const n = 2 + ((rng() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const leaf = sphere(scene, "leaf", 1.9 + rng(), lm);
        leaf.position.set(p.x + (rng() - 0.5), h * 1.5 + 0.6 + k * 0.6, p.z + (rng() - 0.5));
        leaf.scaling.y = 1.1; shadow.addShadowCaster(leaf);
      }
      addObstacle(p.x, p.z, 0.9);
    }

    // ---- Rocks. ----
    const rockMat = mat(scene, "rock", "#9aa0a6");
    for (let i = 0; i < 40; i++) {
      const p = place(7, FAR); if (!p) continue;
      const rad = 0.5 + rng() * 0.9;
      const rock = BABYLON.MeshBuilder.CreateIcoSphere("rock", { radius: rad, subdivisions: 1 }, scene);
      rock.material = rockMat; rock.position.set(p.x, rad * 0.6, p.z);
      rock.rotation.set(rng(), rng(), rng()); shadow.addShadowCaster(rock);
      addObstacle(p.x, p.z, rad * 0.85);
    }

    // ---- Bushes (clusters of leafy spheres). ----
    for (let i = 0; i < 34; i++) {
      const p = place(7, FAR); if (!p) continue;
      const lm = leafMats[(rng() * leafMats.length) | 0];
      const lobes = 3 + ((rng() * 2) | 0);
      for (let k = 0; k < lobes; k++) {
        const b = sphere(scene, "bush", 0.7 + rng() * 0.5, lm);
        b.position.set(p.x + (rng() - 0.5) * 1.1, 0.45, p.z + (rng() - 0.5) * 1.1);
        b.scaling.y = 0.85; shadow.addShadowCaster(b);
      }
      addObstacle(p.x, p.z, 0.85);
    }

    // ---- Giant toadstools (red cap + cream stalk). ----
    const stalkMat = mat(scene, "stalk", "#f3e6c8");
    const capMat = mat(scene, "cap", "#d83a3a");
    const spotMat = mat(scene, "spot", "#fff2e0");
    for (let i = 0; i < 22; i++) {
      const p = place(7, FAR); if (!p) continue;
      const h = 0.8 + rng() * 0.7;
      const stalk = cyl(scene, "stalk", 0.4, 0.55, h, stalkMat);
      stalk.position.set(p.x, h / 2, p.z); shadow.addShadowCaster(stalk);
      const cap = sphere(scene, "cap", 1.3 + rng() * 0.5, capMat);
      cap.position.set(p.x, h, p.z); cap.scaling.y = 0.6; shadow.addShadowCaster(cap);
      for (let s = 0; s < 4; s++) {
        const spot = disc(scene, "spot", 0.12 + rng() * 0.08, spotMat);
        spot.rotation.x = Math.PI / 2;
        spot.position.set(p.x + (rng() - 0.5) * 1.0, h + 0.36, p.z + (rng() - 0.5) * 1.0);
      }
      addObstacle(p.x, p.z, 0.5);
    }

    // ---- Cattails / reeds hugging the riverbank (decorative). ----
    const reedMat = mat(scene, "reed", "#3c8a3c");
    const catMat = mat(scene, "cat", "#6b4a2a");
    for (let i = 0; i < 40; i++) {
      const t = (rng() - 0.5) * riverLen * 0.85;
      const off = (riverHalf + 0.6 + rng() * 1.2) * (rng() < 0.5 ? 1 : -1);
      const x = riverCenter.x + alongT.x * t + crossN.x * off;
      const z = riverCenter.z + alongT.z * t + crossN.z * off;
      if (Math.hypot(x, z) > FAR) continue;
      const stem = cyl(scene, "reed", 0.05, 0.05, 1.1 + rng() * 0.6, reedMat);
      stem.position.set(x, 0.6, z);
      const head = capsule(scene, "cattail", 0.4, 0.09, catMat);
      head.position.set(x, 1.25, z);
    }

    // ---- Flowers + grass tufts (decorative ground cover). ----
    const tuftMat = mat(scene, "tuft", "#69bd55");
    for (let i = 0; i < 140; i++) {
      const p = place(6, FAR); if (!p) continue;
      if (rng() < 0.5) {
        const stem = cyl(scene, "stem", 0.04, 0.04, 0.4, mat(scene, "stem", "#3c8a3c"));
        stem.position.set(p.x, 0.2, p.z);
        const head = sphere(scene, "fhead", 0.18, mat(scene, "fhead", PALETTE[(rng() * PALETTE.length) | 0]));
        head.position.set(p.x, 0.42, p.z);
      } else {
        const tuft = cone(scene, "tuft", 0.35, 0, 0.5, tuftMat);
        tuft.position.set(p.x, 0.25, p.z);
      }
    }

    // Resolve a desired move against the fence, solid scenery, and the river.
    // Slides along obstacles/banks instead of stopping the player dead.
    function moveActor(cur, desired, r) {
      let tx = desired.x, tz = desired.z;

      // River barrier: if the straight move would enter the water, slide along
      // the bank by trying each axis independently.
      if (inRiver(tx, tz) && !inRiver(cur.x, cur.z)) {
        if (!inRiver(desired.x, cur.z)) tz = cur.z;
        else if (!inRiver(cur.x, desired.z)) tx = cur.x;
        else { tx = cur.x; tz = cur.z; }
      }

      // Push out of any solid scenery (two relaxation passes for stacked cases).
      for (let it = 0; it < 2; it++) {
        for (const o of obstacles) {
          const dx = tx - o.x, dz = tz - o.z;
          const md = o.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 < md * md) {
            const d = Math.sqrt(d2) || 0.0001;
            const push = md - d;
            tx += (dx / d) * push; tz += (dz / d) * push;
          }
        }
      }

      // Keep inside the circular fence.
      const fr = CONFIG.worldRadius - r;
      const hyp = Math.hypot(tx, tz);
      if (hyp > fr) { tx = (tx / hyp) * fr; tz = (tz / hyp) * fr; }

      // If push-out shoved us into the river, refuse the move.
      if (inRiver(tx, tz) && !inRiver(cur.x, cur.z)) return cur.clone();
      return new BABYLON.Vector3(tx, cur.y, tz);
    }

    // A gentle shimmer + bob so the river reads as flowing water.
    const baseWaterY = water.position.y;
    scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000;
      water.position.y = baseWaterY + Math.sin(t * 1.5) * 0.015;
      waterMat.emissiveColor = BABYLON.Color3.FromHexString("#3aa0e0").scale(0.14 + Math.sin(t * 2) * 0.05);
    });

    return { shadow, onRoad, obstacles, inRiver, moveActor, water, waterMat };
  }

  // =========================================================================
  // Artifacts (the collectibles, formerly "relics")
  // =========================================================================
  function buildArtifact(scene, shadow, position, color) {
    const root = new BABYLON.TransformNode("artifact", scene);
    root.position.copyFrom(position);
    const m = emat(scene, "artM" + root.uniqueId, color, 0.6);
    const gem = BABYLON.MeshBuilder.CreatePolyhedron("gem", { type: 1, size: 0.36 }, scene);
    gem.material = m; gem.parent = root; gem.position.y = 1.0; shadow.addShadowCaster(gem);
    const halo = disc(scene, "halo", 0.55, emat(scene, "haloM" + root.uniqueId, color, 1));
    halo.material.alpha = 0.35; halo.rotation.x = Math.PI / 2; halo.position.y = 0.06; halo.parent = root;
    halo.isPickable = false;
    const beam = cyl(scene, "rbeam", 0.05, 0.7, 4, emat(scene, "rbeamM" + root.uniqueId, color, 1));
    beam.material.alpha = 0.12; beam.parent = root; beam.position.y = 2; beam.isPickable = false;
    return { root, gem, halo };
  }

  // Spawn one artifact somewhere valid and wire it into the interaction/score systems.
  // `fixed` (optional) places a saved artifact exactly: { pos:[x,z], color }.
  function spawnArtifact(scene, world, interaction, player, state, near, fixed) {
    let pos = null;
    let color;
    if (fixed) {
      pos = new BABYLON.Vector3(fixed.pos[0], 0, fixed.pos[1]);
      color = fixed.color;
    } else {
      for (let tries = 0; tries < 24 && !pos; tries++) {
        let x, z;
        if (near) { // cluster near a wave's monsters
          const ang = rng() * Math.PI * 2, r = 2 + rng() * 8;
          x = near.x + Math.cos(ang) * r; z = near.z + Math.sin(ang) * r;
        } else {
          const ang = rng() * Math.PI * 2, r = 9 + rng() * (CONFIG.worldRadius - 16);
          x = Math.cos(ang) * r; z = Math.sin(ang) * r;
        }
        if (Math.hypot(x, z) < CONFIG.worldRadius - 2 && !world.onRoad(x, z) && !world.inRiver(x, z)) {
          pos = new BABYLON.Vector3(x, 0, z);
        }
      }
      if (!pos) pos = new BABYLON.Vector3((rng() - 0.5) * 30, 0, (rng() - 0.5) * 30);
      color = PALETTE[(rng() * PALETTE.length) | 0];
    }

    const artifact = buildArtifact(scene, world.shadow, pos, color);
    artifact._color = color;
    const it = new Interactable(artifact.root, {
      label: "Collect artifact",
      onInteract: (self) => {
        if (player.busy) return;
        self.enabled = false;
        artifact.halo.setEnabled(false);
        interaction.remove(self);
        const i = state.artifacts.indexOf(artifact);
        if (i >= 0) state.artifacts.splice(i, 1);
        player.startPickup(artifact.gem, () => {
          artifact.root.dispose(); // clean up halo/beam/root (gem is now carried)
          addScore(state, CONFIG.scorePerArtifact);
          state.waveStats.artifacts++;
          toast(`Artifact! +${CONFIG.scorePerArtifact}`);
        });
      },
    });
    artifact._it = it; interaction.register(it); state.artifacts.push(artifact);
    return artifact;
  }

  // =========================================================================
  // Shop — the merchant's wares. Each item buys a weapon upgrade with coins.
  // Levelled items cost more each purchase; one-time items unlock once.
  // =========================================================================
  const SHOP_ITEMS = [
    {
      id: "damage", name: "Power Crystal", icon: "💥",
      desc: "+1 magic bolt damage", baseCost: 8, growth: 1.8, max: 5,
      apply: (p) => { p.weapon.damage += 1; },
    },
    {
      id: "firerate", name: "Swift Sigil", icon: "⚡",
      desc: "Cast 15% faster", baseCost: 10, growth: 1.7, max: 5,
      apply: (p) => { p.weapon.cooldown = Math.max(0.08, p.weapon.cooldown * 0.85); },
    },
    {
      id: "boltsize", name: "Giant Bolt", icon: "🔮",
      desc: "Bigger bolts that are easier to land", baseCost: 12, growth: 1.8, max: 3,
      apply: (p) => { p.weapon.boltRadius += 0.25; },
    },
    {
      id: "pierce", name: "Piercing Rune", icon: "🏹",
      desc: "Bolts punch through +1 more sweet", baseCost: 16, growth: 1.9, max: 3,
      apply: (p) => { p.weapon.pierce += 1; },
    },
    {
      id: "trident", name: "Trident Wand", icon: "🔱",
      desc: "New weapon: fire 3 bolts in a spread", baseCost: 45, growth: 1, max: 1,
      apply: (p) => {
        p.weapon.multishot = Math.max(3, p.weapon.multishot); p.weapon.name = "Trident Wand";
        p.weapon.color = "#ffd9f0"; p.weapon.haloColor = "#ff9de0";
      },
    },
    {
      id: "storm", name: "Storm Wand", icon: "🌩️",
      desc: "Upgrade to a 5-bolt storm spread", baseCost: 90, growth: 1, max: 1,
      // Only useful once you already wield the Trident.
      requires: (state) => (state.upgrades["trident"] || 0) >= 1,
      apply: (p) => {
        p.weapon.multishot = 5; p.weapon.spread = 0.18; p.weapon.name = "Storm Wand";
        p.weapon.color = "#d8e8ff"; p.weapon.haloColor = "#88b8ff";
      },
    },
    {
      id: "vitality", name: "Vitality Charm", icon: "💗",
      desc: "+25 max health (and heal up)", baseCost: 14, growth: 1.7, max: 5,
      apply: (p) => {
        p.maxHealth += 25; p.health = Math.min(p.maxHealth, p.health + 25);
        updateHealthBar(p.health);
      },
    },
    {
      id: "speed", name: "Swift Boots", icon: "👢",
      desc: "Move 12% faster", baseCost: 12, growth: 1.7, max: 4,
      apply: (p) => { p.speed *= 1.12; },
    },
    {
      id: "armor", name: "Aegis Ward", icon: "🛡️",
      desc: "Take 12% less damage from sweets", baseCost: 14, growth: 1.8, max: 4,
      apply: (p) => { p.damageReduction = Math.min(0.6, p.damageReduction + 0.12); },
    },
    {
      id: "lifesteal", name: "Vampiric Gem", icon: "🩸",
      desc: "Heal +2 health per sweet defeated", baseCost: 20, growth: 1.9, max: 3,
      apply: (p) => { p.lifesteal += 2; },
    },
    {
      id: "lodestone", name: "Coin Lodestone", icon: "🧲",
      desc: "Coins are drawn in from much farther", baseCost: 10, growth: 1.8, max: 3,
      apply: () => { coinMagnetRange += 2.5; coinPickupRange += 0.5; },
    },
    {
      id: "heal", name: "Healing Brew", icon: "❤️",
      desc: "Restore your health to full", baseCost: 6, growth: 1.4, max: Infinity, repeatable: true,
      apply: (p) => { p.health = p.maxHealth; updateHealthBar(p.health); },
      // Healing is pointless at full health — let the UI grey it out.
      unavailable: (p) => p.health >= p.maxHealth,
    },
  ];

  function itemLevel(state, item) { return state.upgrades[item.id] || 0; }
  function itemCost(state, item) {
    return Math.round(item.baseCost * Math.pow(item.growth, itemLevel(state, item)));
  }

  const Shop = {
    state: null, player: null, open: false,

    init(state, player) { this.state = state; this.player = player; },

    openShop() {
      if (this.open) return;
      this.open = true; uiPaused = true;
      dom.shop.classList.remove("hidden");
      this.render();
    },
    closeShop() {
      if (!this.open) return;
      this.open = false; uiPaused = false;
      dom.shop.classList.add("hidden");
    },

    buy(item) {
      const lvl = itemLevel(this.state, item);
      if (lvl >= item.max) return;
      if (item.requires && !item.requires(this.state)) return;
      if (item.unavailable && item.unavailable(this.player)) return;
      const cost = itemCost(this.state, item);
      if (this.state.coins < cost) return;
      this.state.coins -= cost;
      this.state.upgrades[item.id] = lvl + 1;
      item.apply(this.player);
      updateCoins(this.state);
      toast(`${item.icon} ${item.name} purchased!`);
      this.render();
    },

    render() {
      dom.shopCoins.textContent = this.state.coins;
      dom.shopItems.innerHTML = "";
      for (const item of SHOP_ITEMS) {
        const lvl = itemLevel(this.state, item);
        const maxed = lvl >= item.max;
        const cost = itemCost(this.state, item);
        const blocked = item.unavailable && item.unavailable(this.player);
        const locked = item.requires && !item.requires(this.state);
        const tooPoor = this.state.coins < cost;

        const row = document.createElement("div");
        row.className = "shop-item";

        const levelLabel = item.repeatable
          ? ""
          : (item.max > 1 ? ` <span class="lvl">Lv ${lvl}/${item.max}</span>` : "");

        let btnLabel, btnClass = "buy-btn", disabled = false;
        if (maxed) { btnLabel = "Owned"; btnClass += " owned"; disabled = true; }
        else if (locked) { btnLabel = "🔒"; disabled = true; }
        else if (blocked) { btnLabel = "Full"; disabled = true; }
        else { btnLabel = `🪙 ${cost}`; disabled = tooPoor; }

        row.innerHTML =
          `<div class="icon">${item.icon}</div>` +
          `<div class="info"><div class="name">${item.name}${levelLabel}</div>` +
          `<div class="desc">${item.desc}</div></div>`;
        const btn = document.createElement("button");
        btn.className = btnClass; btn.textContent = btnLabel; btn.disabled = disabled;
        if (!disabled) btn.addEventListener("click", () => this.buy(item));
        row.appendChild(btn);
        dom.shopItems.appendChild(row);
      }
    },
  };

  // =========================================================================
  // Wave system — escalating waves of living sweets + artifacts.
  //
  // Flow: a wave spawns -> fight until every sweet is cleared -> a rest period
  // begins where a "Next Wave" button (or Enter/N, or the touch button) starts
  // the next wave early; otherwise it auto-starts after `waveInterval` seconds.
  // Each wave brings more, faster, tougher sweets and more artifacts.
  // =========================================================================
  class WaveSystem {
    constructor(scene, world, interaction, player, state) {
      this.scene = scene; this.world = world; this.interaction = interaction;
      this.player = player; this.state = state;
      this.wave = 0;
      this.betweenWaves = true;            // resting before the next wave
      this.minimized = false;              // results window collapsed to corner?
      this.timer = CONFIG.firstWaveDelay;  // seconds until the next wave auto-starts
      this._enterRest("Get ready!", false);
    }

    monstersForWave(w) {
      return Math.min(CONFIG.maxMonstersPerWave, CONFIG.baseMonsters + (w - 1) * CONFIG.monstersPerWave);
    }
    artifactsForWave(w) {
      return Math.min(CONFIG.maxArtifactsPerWave, CONFIG.baseArtifacts + (w - 1) * CONFIG.artifactsPerWave);
    }

    update(dt) {
      const wantNext = Input.consumeNextWave();
      if (this.betweenWaves) {
        this.timer = Math.max(0, this.timer - dt);
        const label = Math.ceil(this.timer) + "s";
        dom.nextWave.textContent = label;
        dom.miniCountdown.textContent = label;
        if (wantNext || this.timer <= 0) this.spawnWave();
      } else if (this.state.monsters.length === 0) {
        // Wave cleared — start the rest period, show the results window and the
        // merchant, and offer the Next Wave button (also collapsible to a widget).
        this.timer = CONFIG.waveInterval;
        this.betweenWaves = true;
        if (this.state.merchant) this.state.merchant.show();
        this._enterRest(`Wave ${this.wave} cleared!`, true);
        toast("Wave cleared! 🍬");
      }
    }

    // Show the between-waves window. `showResults` adds the per-wave stat
    // breakdown + merchant hint (skipped for the initial "Get ready" screen).
    _enterRest(title, showResults) {
      this.minimized = false;
      dom.wavePanelTitle.textContent = title;
      dom.nextWaveBtn.textContent = `Start Wave ${this.wave + 1}`;
      dom.miniWaveNum.textContent = this.wave + 1;

      if (showResults) {
        const s = this.state.waveStats;
        dom.resKills.textContent = s.kills;
        dom.resArtifacts.textContent = s.artifacts;
        dom.resCoins.textContent = s.coins;
        dom.waveResults.classList.remove("hidden");
        dom.waveShopHint.classList.remove("hidden");
      } else {
        dom.waveResults.classList.add("hidden");
        dom.waveShopHint.classList.add("hidden");
      }

      dom.wavePanel.classList.remove("hidden");
      dom.waveMini.classList.add("hidden");
    }

    // Collapse the results window into the small, non-blocking corner widget.
    minimize() {
      if (!this.betweenWaves || this.minimized) return;
      this.minimized = true;
      dom.wavePanel.classList.add("hidden");
      dom.waveMini.classList.remove("hidden");
    }

    spawnWave() {
      this.wave++;
      this.betweenWaves = false;
      this.minimized = false;
      this.state.wave = this.wave;
      dom.wave.textContent = this.wave;
      dom.wavePanel.classList.add("hidden");
      dom.waveMini.classList.add("hidden");
      if (this.state.merchant) this.state.merchant.hide();
      Shop.closeShop();

      // Reset the per-wave stat counters for the wave about to begin.
      this.state.waveStats = { kills: 0, artifacts: 0, coins: 0 };

      const isBossWave = this.wave % CONFIG.bossEveryWaves === 0;
      // On boss waves the king brings a smaller honour guard.
      let monsterCount = this.monstersForWave(this.wave);
      if (isBossWave) monsterCount = Math.round(monsterCount * 0.6);
      const artifactCount = this.artifactsForWave(this.wave);
      this.state.waveTotal = monsterCount + (isBossWave ? 1 : 0);

      // Monsters spawn around the ring, away from the player so they march in.
      const ringMin = Math.min(34, CONFIG.worldRadius - 18);
      for (let i = 0; i < monsterCount; i++) {
        const ang = rng() * Math.PI * 2;
        const r = ringMin + rng() * 14;
        const pos = new BABYLON.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        this.state.monsters.push(new Monster(this.scene, this.world.shadow, pos, this.wave));
      }

      // Every few waves, a colossal Sweet King storms in with a health bar.
      if (isBossWave) {
        const ang = rng() * Math.PI * 2;
        const r = ringMin + 8;
        const pos = new BABYLON.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        const boss = new Boss(this.scene, this.world.shadow, pos, this.wave);
        this.state.boss = boss;
        this.state.monsters.push(boss);
        showBossBar(boss);
      }

      // Each wave also drops fresh artifacts to grab.
      for (let i = 0; i < artifactCount; i++) {
        spawnArtifact(this.scene, this.world, this.interaction, this.player, this.state);
      }

      updateMonsterCounter(this.state);
      bannerWave(this.wave, monsterCount, isBossWave ? this.state.boss.name : null);
    }

    // Restore the wave clock + UI from a saved game (see applySave). The live
    // monsters/artifacts themselves are recreated by applySave; here we only
    // resync the counter, timer and the between-waves panels.
    restore(data) {
      this.wave = data.number;
      this.betweenWaves = data.betweenWaves;
      this.timer = data.timer;
      this.state.wave = this.wave;
      this.state.waveTotal = data.waveTotal;
      dom.wave.textContent = this.wave;
      if (this.betweenWaves) {
        const title = this.wave > 0 ? `Wave ${this.wave} cleared!` : "Get ready!";
        this._enterRest(title, this.wave > 0);
        if (data.minimized) this.minimize();
      } else {
        dom.wavePanel.classList.add("hidden");
        dom.waveMini.classList.add("hidden");
      }
    }
  }

  // =========================================================================
  // Scene + loop
  // =========================================================================
  function createScene() {
    const scene = new BABYLON.Scene(engine);

    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, 1.05, 12, new BABYLON.Vector3(0, 1.4, 12), scene);
    camera.lowerRadiusLimit = 6; camera.upperRadiusLimit = 18;
    camera.lowerBetaLimit = 0.35; camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.01; camera.panningSensibility = 0;
    camera.attachControl(dom.canvas, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

    const world = buildWorld(scene);
    const player = new Player(scene, world.shadow);
    player.world = world;          // enable scenery/river collision
    playerRef = player;            // HUD helpers read max health from here
    const interaction = new InteractionSystem();

    const state = {
      scene, shadow: world.shadow,
      score: 0, coins: 0, wave: 0, waveTotal: 0, over: false,
      artifacts: [], monsters: [], bolts: [], coinsList: [],
      upgrades: Object.create(null),
      waveStats: { kills: 0, artifacts: 0, coins: 0 },
      merchant: null, boss: null,
    };
    updateHealthBar(player.health);
    updateMonsterCounter(state);
    updateCoins(state);

    // The merchant who runs the between-waves shop, waiting at the plaza.
    const merchant = new Merchant(scene, world.shadow, interaction, () => Shop.openShop());
    state.merchant = merchant;
    Shop.init(state, player);

    // A few artifacts to find before the first wave even arrives.
    for (let i = 0; i < 3; i++) spawnArtifact(scene, world, interaction, player, state);

    const waves = new WaveSystem(scene, world, interaction, player, state);
    waveSystem = waves;

    // Publish live handles for the save/load + pause systems.
    sceneRef = scene; worldRef = world; interactionRef = interaction;
    stateRef = state; cameraRef = camera;

    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      if (!gameStarted) return;                       // hold sim until "Start"
      if (paused) return;                             // pause menu freezes the sim
      if (state.over) { cosmetics(state, dt); return; }

      // While the shop menu is open, freeze gameplay but keep the scene live.
      if (uiPaused) { merchant.update(dt); cosmetics(state, dt); return; }

      player.update(dt, camera);
      // Rigid follow: mutate the camera's pivot vector IN PLACE so the pivot
      // tracks the character exactly while alpha/beta/radius stay untouched.
      // (Assigning camera.target = ... or setTarget() would rebuild the radius
      // from the camera's lagging position, which is what made the apparent
      // distance change while moving.) Zoom is now wheel / two-finger pinch only.
      camera.target.copyFromFloats(player.position.x, player.position.y + 1.4, player.position.z);

      waves.update(dt);
      merchant.update(dt);

      // Casting — the weapon may fire several bolts per cast (multishot).
      if (Input.wantsCast()) {
        const shots = player.tryCast();
        if (shots) {
          const w = player.weapon;
          for (const s of shots) {
            state.bolts.push(new Projectile(scene, world.shadow, s.origin, s.dir, {
              speed: w.boltSpeed, radius: w.boltRadius, damage: w.damage,
              pierce: w.pierce, color: w.color, haloColor: w.haloColor,
            }));
          }
        }
      }

      updateBolts(state, dt);
      updateMonsters(state, player, dt);
      updateCoinDrops(state, player, dt);
      updateMonsterCounter(state);

      interaction.update(player.position);
      if (Input.consumeInteract() && !player.busy) interaction.trigger();

      cosmetics(state, dt);
    });

    return scene;
  }

  function updateBolts(state, dt) {
    for (let i = state.bolts.length - 1; i >= 0; i--) {
      const b = state.bolts[i];
      b.update(dt);
      if (!b.dead) {
        // Hit-test against live monsters on the XZ plane (bolts fly at hand
        // height while a monster's root sits on the ground, so ignore Y).
        for (const m of state.monsters) {
          if (!m.alive || m.dying > 0 || b.hitSet.has(m)) continue;
          const dx = b.mesh.position.x - m.position.x;
          const dz = b.mesh.position.z - m.position.z;
          if (Math.hypot(dx, dz) <= b.radius + m.radius) {
            const killed = m.hit(b.damage);
            b.hitSet.add(m);
            if (killed) onMonsterDefeated(state, m);
            // Pierce upgrades let a bolt punch through several sweets.
            if (b.pierce > 0) b.pierce--; else b.dead = true;
            break;
          }
        }
      }
      if (b.dead) { b.dispose(); state.bolts.splice(i, 1); }
    }
  }

  function updateMonsters(state, player, dt) {
    for (let i = state.monsters.length - 1; i >= 0; i--) {
      const m = state.monsters[i];
      const touching = m.update(dt, player.position);
      if (!m.alive) { state.monsters.splice(i, 1); continue; }
      if (touching && m.dying <= 0 && m.biteTimer <= 0) {
        m.biteTimer = CONFIG.biteCooldown;
        const dmg = (m.contactDamage || CONFIG.contactDamage) * (1 - player.damageReduction);
        const hp = player.takeDamage(dmg);
        updateHealthBar(hp);
        flashHurt();
        if (hp <= 0) { gameOver(state); return; }
      }
    }
  }

  // A monster (regular sweet or boss) was just killed: award score/coins, apply
  // lifesteal, and clean up the boss bar when a Sweet King falls.
  function onMonsterDefeated(state, m) {
    // Lifesteal heals the player a little per kill (Vampiric Gem upgrade).
    if (playerRef && playerRef.lifesteal > 0) {
      playerRef.health = Math.min(playerRef.maxHealth, playerRef.health + playerRef.lifesteal);
      updateHealthBar(playerRef.health);
    }
    if (m.isBoss) {
      addScore(state, CONFIG.bossScore);
      state.waveStats.kills++;
      // A boss always pays out a generous purse of coins.
      let left = CONFIG.bossCoinDrop;
      while (left > 0) {
        const v = Math.min(left, 3 + ((rng() * 3) | 0));
        left -= v;
        const off = () => (rng() - 0.5) * 3;
        state.coinsList.push(new Coin(state.scene, state.shadow,
          new BABYLON.Vector3(m.position.x + off(), 0, m.position.z + off()), v));
      }
      hideBossBar();
      if (state.boss === m) state.boss = null;
      toast(`👑 ${m.name} defeated! +${CONFIG.bossScore}`);
      return;
    }
    addScore(state, CONFIG.scorePerMonster);
    state.waveStats.kills++;
    maybeDropCoin(state, m.position);
    toast(`Splat! +${CONFIG.scorePerMonster}`);
  }

  // Roll for a coin drop when a sweet is defeated, and spawn it at the kill spot.
  function maybeDropCoin(state, pos) {
    if (rng() > CONFIG.coinDropChance) return;
    const value = CONFIG.coinValueMin +
      ((rng() * (CONFIG.coinValueMax - CONFIG.coinValueMin + 1)) | 0);
    state.coinsList.push(new Coin(state.scene, state.shadow, pos, value));
  }

  // Spin, magnet and collect coins; drop ones that have sat around too long.
  function updateCoinDrops(state, player, dt) {
    for (let i = state.coinsList.length - 1; i >= 0; i--) {
      const c = state.coinsList[i];
      const got = c.update(dt, player.position);
      if (got) {
        state.coins += c.value;
        state.waveStats.coins += c.value;
        updateCoins(state);
        toast(`🪙 +${c.value}`);
        c.dispose(); state.coinsList.splice(i, 1);
      } else if (c.life <= 0) {
        c.dispose(); state.coinsList.splice(i, 1);
      }
    }
  }

  function cosmetics(state, dt) {
    const t = performance.now() / 1000;
    for (const a of state.artifacts) {
      if (a._it && a._it.enabled) {
        a.gem.rotation.y += dt * 1.6;
        a.gem.position.y = 1.0 + Math.sin(t * 2 + a.gem.uniqueId) * 0.14;
        a.halo.scaling.setAll(1 + Math.sin(t * 3) * 0.12);
      }
    }
  }

  // =========================================================================
  // Score / HUD helpers
  // =========================================================================
  function addScore(state, points) {
    state.score += points;
    dom.score.textContent = state.score;
  }

  function updateCoins(state) {
    if (dom.coins) dom.coins.textContent = state.coins;
    if (dom.shopCoins) dom.shopCoins.textContent = state.coins;
  }

  // Show how many sweets are still alive in the current wave (X left / total).
  function updateMonsterCounter(state) {
    if (!dom.monsters) return;
    const left = state.monsters.length;
    dom.monsters.textContent = `${left} / ${state.waveTotal}`;
  }

  function updateHealthBar(hp) {
    const max = playerRef ? playerRef.maxHealth : CONFIG.maxHealth;
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    dom.healthFill.style.width = pct + "%";
    dom.healthFill.style.background = pct > 50
      ? "linear-gradient(90deg, #5be0a0, #6cc6ff)"
      : pct > 25
      ? "linear-gradient(90deg, #ffd34e, #ff9d5c)"
      : "linear-gradient(90deg, #ff5c7a, #ff3b3b)";
  }

  // ---- Boss health bar (shown only while a boss is alive) ----
  function showBossBar(boss) {
    if (!dom.bossBar) return;
    dom.bossName.textContent = "👑 " + boss.name;
    updateBossBar(boss);
    dom.bossBar.classList.remove("hidden");
  }
  function updateBossBar(boss) {
    if (!dom.bossFill) return;
    const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
    dom.bossFill.style.width = pct + "%";
  }
  function hideBossBar() {
    if (dom.bossBar) dom.bossBar.classList.add("hidden");
  }

  let hurtTimer = null;
  function flashHurt() {
    dom.hud.style.boxShadow = "inset 0 0 120px rgba(255,40,60,0.55)";
    clearTimeout(hurtTimer);
    hurtTimer = setTimeout(() => { dom.hud.style.boxShadow = "none"; }, 160);
  }

  function bannerWave(n, monsterCount, bossName) {
    dom.waveBanner.textContent = bossName
      ? `Wave ${n} — 👑 ${bossName}!`
      : `Wave ${n} — ${monsterCount} sweets!`;
    dom.waveBanner.classList.remove("show");
    void dom.waveBanner.offsetWidth; // restart the CSS animation
    dom.waveBanner.classList.add("show");
  }

  function gameOver(state) {
    state.over = true;
    dom.prompt.classList.add("hidden");
    dom.wavePanel.classList.add("hidden");
    hideBossBar();
    dom.finalScore.textContent = state.score;
    dom.finalWave.textContent = state.wave;
    setTimeout(() => dom.over.classList.remove("hidden"), 600);
  }

  // =========================================================================
  // Save / Load — serialize the whole run to a JSON file the player downloads,
  // and restore it from a file on any device.
  //
  // The procedural environment is captured by its RNG seed (re-seeded + rebuilt
  // on load), while every live entity (player stats + perks, money, score,
  // monsters, the boss, artifacts and dropped coins, plus the wave clock) is
  // serialized explicitly so the run resumes exactly where it left off.
  // =========================================================================
  const SAVE_VERSION = 1;
  const PENDING_LOAD_KEY = "gg3d_pending_load"; // sessionStorage hand-off across reload
  const AUTOSTART_KEY = "gg3d_autostart";       // restart -> skip the start screen

  // sessionStorage isn't available in the headless test harness (or some privacy
  // modes); fail soft everywhere it's touched.
  function sessionGet(k) {
    try { return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(k) : null; }
    catch (e) { return null; }
  }
  function sessionSet(k, v) {
    try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(k, v); } catch (e) {}
  }
  function sessionDel(k) {
    try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(k); } catch (e) {}
  }

  function serializeGame() {
    const state = stateRef, player = playerRef, waves = waveSystem;
    if (!state || !player || !waves) return null;
    const round = (n) => Math.round(n * 1000) / 1000;
    const xz = (p) => [round(p.x), round(p.z)];

    return {
      v: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      seed: worldSeed,
      score: state.score,
      money: state.coins,
      coinMagnetRange,
      coinPickupRange,
      upgrades: Object.assign({}, state.upgrades),
      waveStats: Object.assign({}, state.waveStats),
      wave: {
        number: waves.wave,
        betweenWaves: waves.betweenWaves,
        minimized: waves.minimized,
        timer: round(waves.timer),
        waveTotal: state.waveTotal,
      },
      player: {
        health: round(player.health),
        maxHealth: player.maxHealth,
        speed: round(player.speed),
        damageReduction: round(player.damageReduction),
        lifesteal: player.lifesteal,
        facing: round(player.facing),
        pos: xz(player.position),
        weapon: Object.assign({}, player.weapon),
      },
      monsters: state.monsters
        .filter((m) => m.alive && m.dying <= 0)
        .map((m) => m.isBoss
          ? { boss: true, wave: m.wave, hp: round(m.hp), pos: xz(m.position) }
          : { kind: m.kind, hp: m.hp, speed: round(m.speed), pos: xz(m.position) }),
      artifacts: state.artifacts
        .filter((a) => a._it && a._it.enabled)
        .map((a) => ({ pos: xz(a.root.position), color: a._color })),
      coinDrops: state.coinsList
        .filter((c) => !c.collected && c.life > 0)
        .map((c) => ({ pos: xz(c.root.position), value: c.value, life: round(c.life) })),
    };
  }

  // Basic structural validation so a bad/old/foreign file fails cleanly.
  function validateSave(d) {
    return !!(d && d.v === SAVE_VERSION && typeof d.seed === "number" &&
      d.player && Array.isArray(d.player.pos) && d.wave && Array.isArray(d.monsters));
  }

  // Tear down every live entity built by createScene so a save can be laid in.
  function clearWorldEntities(state, interaction) {
    for (const a of state.artifacts) { if (a._it) interaction.remove(a._it); a.root.dispose(); }
    state.artifacts.length = 0;
    for (const m of state.monsters) m.root.dispose();
    state.monsters.length = 0;
    for (const b of state.bolts) b.dispose();
    state.bolts.length = 0;
    for (const c of state.coinsList) c.dispose();
    state.coinsList.length = 0;
    state.boss = null;
    hideBossBar();
  }

  // Rebuild a saved run on top of the freshly created (seeded) scene.
  function applySave(d) {
    const state = stateRef, player = playerRef, world = worldRef;
    const interaction = interactionRef, waves = waveSystem;
    if (!state || !player || !waves) throw new Error("game not ready");

    clearWorldEntities(state, interaction);

    // Score / money / perk economy.
    state.score = d.score | 0;
    state.coins = d.money | 0;
    state.upgrades = Object.assign(Object.create(null), d.upgrades || {});
    state.waveStats = Object.assign({ kills: 0, artifacts: 0, coins: 0 }, d.waveStats || {});
    coinMagnetRange = (typeof d.coinMagnetRange === "number") ? d.coinMagnetRange : CONFIG.coinMagnetRange;
    coinPickupRange = (typeof d.coinPickupRange === "number") ? d.coinPickupRange : CONFIG.coinPickupRange;

    // Player stats, perks (weapon) and pose.
    const ps = d.player;
    player.maxHealth = ps.maxHealth;
    player.health = ps.health;
    player.speed = ps.speed;
    player.damageReduction = ps.damageReduction || 0;
    player.lifesteal = ps.lifesteal || 0;
    player.facing = ps.facing || 0;
    Object.assign(player.weapon, ps.weapon || {});
    player.root.position.set(ps.pos[0], 0, ps.pos[1]);

    // Monsters + boss.
    for (const md of d.monsters || []) {
      if (md.boss) {
        const boss = new Boss(sceneRef, world.shadow, new BABYLON.Vector3(md.pos[0], 0, md.pos[1]), md.wave);
        boss.hp = md.hp;
        state.boss = boss;
        state.monsters.push(boss);
        showBossBar(boss);
      } else {
        const m = new Monster(sceneRef, world.shadow,
          new BABYLON.Vector3(md.pos[0], 0, md.pos[1]), 1,
          { kind: md.kind, hp: md.hp, speed: md.speed });
        state.monsters.push(m);
      }
    }

    // Artifacts + dropped coins.
    for (const ad of d.artifacts || []) {
      spawnArtifact(sceneRef, world, interaction, player, state, null, ad);
    }
    for (const cd of d.coinDrops || []) {
      const c = new Coin(sceneRef, world.shadow, new BABYLON.Vector3(cd.pos[0], 0, cd.pos[1]), cd.value);
      c.life = cd.life;
      state.coinsList.push(c);
    }

    // Wave clock + the merchant (present during a cleared-wave rest).
    waves.restore(d.wave);
    if (state.merchant) {
      if (waves.betweenWaves && waves.wave > 0) state.merchant.show();
      else state.merchant.hide();
    }

    // Refresh every HUD readout.
    addScore(state, 0);
    updateCoins(state);
    updateHealthBar(player.health);
    updateMonsterCounter(state);
  }

  // Serialize the current run and hand the player a .json download.
  function downloadSave() {
    const data = serializeGame();
    if (!data) { toast("Nothing to save yet"); return false; }
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `good-game-3d-wave${data.wave.number}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Progress saved! 💾");
      return true;
    } catch (e) {
      console.error(e);
      toast("Save failed");
      return false;
    }
  }

  // Read a save file the player picked, validate it, stash it and reload so the
  // boot path can re-seed the world and lay the run back in.
  function loadFromFile(file, onError) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { data = null; }
      if (!validateSave(data)) {
        if (onError) onError("That file isn't a valid Good Game 3D save.");
        return;
      }
      sessionSet(PENDING_LOAD_KEY, reader.result);
      window.location.reload();
    };
    reader.onerror = () => { if (onError) onError("Couldn't read that file."); };
    reader.readAsText(file);
  }

  // =========================================================================
  // Pause menu — opens mid-game (freezing the sim), with Resume / Save / Restart
  // / Exit. Restart and Exit ask for confirmation to guard against misclicks.
  // =========================================================================
  const Pause = {
    pendingAction: null, // "restart" | "exit" while the confirm dialog is up

    canOpen() { return gameStarted && stateRef && !stateRef.over && !paused && !Shop.open; },

    open() {
      if (!this.canOpen()) return;
      paused = true;
      this.hideConfirm();
      if (dom.pauseScore) dom.pauseScore.textContent = stateRef.score;
      if (dom.pauseWave) dom.pauseWave.textContent = waveSystem ? waveSystem.wave : 0;
      dom.pauseMenu.classList.remove("hidden");
    },
    close() {
      if (!paused) return;
      paused = false;
      this.hideConfirm();
      dom.pauseMenu.classList.add("hidden");
    },
    toggle() { if (paused) this.close(); else this.open(); },

    askConfirm(action, text) {
      this.pendingAction = action;
      if (dom.confirmText) dom.confirmText.textContent = text;
      if (dom.confirmDialog) dom.confirmDialog.classList.remove("hidden");
    },
    hideConfirm() {
      this.pendingAction = null;
      if (dom.confirmDialog) dom.confirmDialog.classList.add("hidden");
    },
    confirmYes() {
      const action = this.pendingAction;
      this.hideConfirm();
      if (action === "restart") {
        sessionSet(AUTOSTART_KEY, "1");
        sessionDel(PENDING_LOAD_KEY);
        window.location.reload();
      } else if (action === "exit") {
        sessionDel(AUTOSTART_KEY);
        sessionDel(PENDING_LOAD_KEY);
        window.location.reload(); // back to the start screen
      }
    },

    init() {
      if (dom.pauseBtn) dom.pauseBtn.addEventListener("click", () => this.open());
      if (dom.resumeBtn) dom.resumeBtn.addEventListener("click", () => this.close());
      if (dom.saveBtn) dom.saveBtn.addEventListener("click", () => {
        // The toast lives behind the pause overlay, so confirm on the button.
        if (downloadSave() && dom.saveBtn) {
          const orig = dom.saveBtn.textContent;
          dom.saveBtn.textContent = "Saved! 💾";
          setTimeout(() => { if (dom.saveBtn) dom.saveBtn.textContent = orig; }, 1600);
        }
      });
      if (dom.restartBtn) dom.restartBtn.addEventListener("click",
        () => this.askConfirm("restart", "Restart the game? Your current progress will be lost unless you've saved it."));
      if (dom.exitBtn) dom.exitBtn.addEventListener("click",
        () => this.askConfirm("exit", "Exit to the main menu? Your current progress will be lost unless you've saved it."));
      if (dom.confirmYes) dom.confirmYes.addEventListener("click", () => this.confirmYes());
      if (dom.confirmNo) dom.confirmNo.addEventListener("click", () => this.hideConfirm());
    },
  };

  // ---- UI / boot ---------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    dom.toast.textContent = msg; dom.toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2200);
  }
  function startGame() {
    dom.overlay.classList.add("hidden"); dom.hud.classList.remove("hidden");
    if (isTouch) dom.touch.classList.remove("hidden");
    dom.canvas.focus();
    gameStarted = true;
  }

  // ---- Fullscreen (whole page, so the HUD/joystick stay visible) ----------
  const Fullscreen = {
    el: document.documentElement,
    supported() {
      const e = this.el;
      return !!(e && (e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen));
    },
    active() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    },
    toggle() {
      try {
        if (!this.active()) {
          const e = this.el;
          (e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen).call(e);
        } else {
          (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
        }
      } catch (err) { console.warn("Fullscreen failed:", err); }
    },
    init() {
      if (!dom.fsBtn) return;
      if (!this.supported()) { dom.fsBtn.style.display = "none"; return; } // e.g. iOS Safari
      const sync = () => {
        const on = this.active();
        dom.fsBtn.textContent = on ? "✕" : "⛶";
        dom.fsBtn.title = on ? "Exit fullscreen" : "Fullscreen";
        engine.resize();
      };
      dom.fsBtn.addEventListener("click", () => this.toggle());
      document.addEventListener("fullscreenchange", sync);
      document.addEventListener("webkitfullscreenchange", sync);
      sync();
    },
  };

  function boot() {
    try {
      Input.init();

      // A save chosen on the start screen is stashed in sessionStorage, then the
      // page reloads into this path. Re-seed BEFORE building the world so the
      // environment regenerates identically, then lay the run back in once ready.
      let pendingLoad = null;
      const rawPending = sessionGet(PENDING_LOAD_KEY);
      if (rawPending) {
        sessionDel(PENDING_LOAD_KEY);
        try { pendingLoad = JSON.parse(rawPending); } catch (e) { pendingLoad = null; }
        if (pendingLoad && !validateSave(pendingLoad)) pendingLoad = null;
      }
      if (pendingLoad) setSeed(pendingLoad.seed);

      const wantAutostart = sessionGet(AUTOSTART_KEY) === "1";
      if (wantAutostart) sessionDel(AUTOSTART_KEY);

      const scene = createScene();
      scene.executeWhenReady(() => {
        dom.loadHint.textContent = "Ready!";
        dom.startBtn.disabled = false;
        if (pendingLoad) {
          try { applySave(pendingLoad); startGame(); toast("Progress loaded! 🎮"); }
          catch (e) { console.error(e); showFatal("Couldn't load save: " + e.message); }
        } else if (wantAutostart) {
          startGame();
        }
      });
      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", () => engine.resize());
      dom.startBtn.addEventListener("click", startGame);
      dom.replayBtn.addEventListener("click", () => window.location.reload());
      dom.nextWaveBtn.addEventListener("click", () => { Input.nextWaveQueued = true; });
      dom.miniNextBtn.addEventListener("click", () => { Input.nextWaveQueued = true; });
      // The × collapses the results window into the corner widget (frees the view).
      dom.wavePanelClose.addEventListener("click", () => { if (waveSystem) waveSystem.minimize(); });
      // Shop open/close.
      dom.shopClose.addEventListener("click", () => Shop.closeShop());
      dom.shopDone.addEventListener("click", () => Shop.closeShop());

      // Start-screen "Load progress" -> pick a file -> reload into the save.
      if (dom.loadBtn && dom.loadFile) {
        dom.loadBtn.addEventListener("click", () => dom.loadFile.click());
        dom.loadFile.addEventListener("change", (e) => {
          const file = e.target.files && e.target.files[0];
          loadFromFile(file, (msg) => {
            if (dom.loadHint) { dom.loadHint.style.color = "#ff8a8a"; dom.loadHint.textContent = msg; }
          });
          e.target.value = ""; // allow re-picking the same file
        });
      }

      // In-game pause menu + Escape behaviour: Escape closes the shop if it's
      // open, otherwise toggles the pause menu (or backs out of a confirm).
      Pause.init();
      window.addEventListener("keydown", (e) => {
        if (e.code !== "Escape") return;
        if (Shop.open) { Shop.closeShop(); return; }
        if (paused && Pause.pendingAction) { Pause.hideConfirm(); return; }
        Pause.toggle();
      });

      Fullscreen.init();
    } catch (e) { showFatal(e.message); throw e; }
  }

  // ---- mesh + math helpers ----------------------------------------------
  function mat(scene, name, hex) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    return m;
  }
  function emat(scene, name, hex, emissive) {
    const m = mat(scene, name, hex);
    m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(emissive);
    return m;
  }
  const sphere = (s, n, d, m) => { const x = BABYLON.MeshBuilder.CreateSphere(n, { diameter: d, segments: 12 }, s); x.material = m; return x; };
  const box = (s, n, w, h, d, m) => { const x = BABYLON.MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, s); x.material = m; return x; };
  const cyl = (s, n, top, bot, h, m) => { const x = BABYLON.MeshBuilder.CreateCylinder(n, { diameterTop: top, diameterBottom: bot, height: h, tessellation: 16 }, s); x.material = m; return x; };
  const cone = (s, n, bot, top, h, m) => cyl(s, n, top, bot, h, m);
  const capsule = (s, n, h, r, m) => { const x = BABYLON.MeshBuilder.CreateCapsule(n, { height: h, radius: r }, s); x.material = m; return x; };
  const disc = (s, n, r, m) => { const x = BABYLON.MeshBuilder.CreateDisc(n, { radius: r, tessellation: 28 }, s); x.material = m; return x; };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  dom.startBtn.disabled = true;
  boot();

  // --- Test seam: exposes internals to the headless verification harness only.
  // Inert in production — window.__GG_TEST__ is never set on the deployed site. ---
  if (typeof window !== "undefined" && window.__GG_TEST__) {
    window.__GG_TEST__ = {
      CONFIG, Projectile, Monster, Boss, Coin, Shop, SHOP_ITEMS,
      get waves() { return waveSystem; },
      get player() { return playerRef; },
      get state() { return Shop.state; },
      startGame,
      serializeGame, applySave, validateSave, setSeed, rng, Pause,
      get seed() { return worldSeed; },
      get paused() { return paused; },
    };
  }

  /* ===========================================================================
   * ROADMAP SEAMS (inert, documented integration points):
   *   PuzzleSystem    - levers/plates are Interactables flipping state flags
   *                     that gate a door mesh; reuses InteractionSystem.
   *   DialogueSystem  - the Merchant already registers as an Interactable and
   *                     opens an HTML overlay; swap/extend it for a BABYLON.GUI
   *                     dialogue panel (babylon.gui is loaded) for talking NPCs.
   *
   * SHIPPED THIS RELEASE: coins (currency) dropped by sweets, the plaza Merchant
   * + Shop (buy/upgrade weapons), and the between-waves results window that
   * collapses into a non-blocking corner widget. See Coin / Merchant / Shop /
   * SHOP_ITEMS and WaveSystem above.
   * ===========================================================================
   */
})();
