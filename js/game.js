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

  const CONFIG = {
    moveSpeed: 6.5,          // metres / second
    turnLerp: 0.2,
    cameraLerp: 0.12,
    interactRange: 2.6,
    worldRadius: 44,         // playable area before the invisible fence

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
    waveInterval: 60,        // seconds between waves ("every 1 minute")
    baseMonsters: 3,         // monsters in wave 1
    monstersPerWave: 2,      // extra monsters each subsequent wave
    maxMonstersPerWave: 26,  // cap for performance
    baseArtifacts: 3,        // artifacts dropped in wave 1
    artifactsPerWave: 1,     // extra artifacts each subsequent wave
    maxArtifactsPerWave: 10,

    // Score
    scorePerMonster: 25,
    scorePerArtifact: 50,
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
    wave: document.getElementById("wave"),
    nextWave: document.getElementById("nextWave"),
    healthFill: document.getElementById("healthFill"),
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
  };

  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  const engine = new BABYLON.Engine(dom.canvas, true, { stencil: true, adaptToDeviceRatio: true });

  // =========================================================================
  // Input
  // =========================================================================
  const Input = {
    keys: Object.create(null),
    joy: { x: 0, y: 0, active: false },
    interactQueued: false,
    castHeld: false,         // fire is continuous while held (respecting cooldown)

    init() {
      window.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (e.code === "KeyE") { this.interactQueued = true; e.preventDefault(); }
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
      this.health = CONFIG.maxHealth;
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

    // Returns { origin, dir } if a bolt should be fired, else null.
    tryCast() {
      if (this.castCooldown > 0 || this.busy) return null;
      this.castCooldown = CONFIG.castCooldown;
      this.castAnim = 1;
      const dir = new BABYLON.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      const origin = this.wandTip.getAbsolutePosition().clone();
      // A tiny upward arc reads better than a flat shot.
      dir.y = 0.04; dir.normalize();
      return { origin, dir };
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
          const next = this.root.position.add(dir.scale(this.speed * mag * dt));
          if (Math.hypot(next.x, next.z) < CONFIG.worldRadius) this.root.position = next;
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
    constructor(scene, shadow, origin, dir) {
      this.dir = dir.clone();
      this.life = CONFIG.boltLife;
      this.dead = false;
      const m = sphere(scene, "bolt", 0.32, emat(scene, "boltM", "#bfe3ff", 1.0));
      m.position.copyFrom(origin);
      m.isPickable = false;
      this.mesh = m;
      // A trailing glow.
      const halo = sphere(scene, "boltHalo", 0.6, emat(scene, "boltHaloM", "#9fd0ff", 1.0));
      halo.material.alpha = 0.3; halo.parent = m; halo.isPickable = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.mesh.position.addInPlace(this.dir.scale(CONFIG.boltSpeed * dt));
      if (Math.hypot(this.mesh.position.x, this.mesh.position.z) > CONFIG.worldRadius + 6) this.dead = true;
    }
    dispose() { this.mesh.dispose(); }
  }

  // =========================================================================
  // Monster — a "living sweet" with a chase AI, a bob, and a pop on death.
  // =========================================================================
  const SWEETS = ["lollipop", "gummy", "cupcake", "donut", "candycane"];

  class Monster {
    constructor(scene, shadow, pos, wave) {
      this.scene = scene;
      this.hp = 1 + Math.floor(wave / 4);          // sturdier in later waves
      this.speed = 1.6 + Math.random() * 0.7 + wave * 0.06;
      this.alive = true;
      this.dying = 0;                               // >0 while playing the pop animation
      this.radius = 0.85;
      this.bob = Math.random() * Math.PI * 2;
      this.biteTimer = 0;                           // cooldown before this sweet bites again
      this.kind = SWEETS[(Math.random() * SWEETS.length) | 0];
      this._build(scene, shadow, pos);
    }

    _build(scene, shadow, pos) {
      const root = new BABYLON.TransformNode("monster", scene);
      root.position.copyFrom(pos);
      this.root = root;
      const body = new BABYLON.TransformNode("monsterBody", scene);
      body.parent = root; this.body = body;

      const candy = PALETTE[(Math.random() * PALETTE.length) | 0];
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
      } else { // candycane
        const cane = add(capsule(scene, "cane", 1.3, 0.28, cream)); cane.position.y = 0.75;
        const stripe = add(capsule(scene, "stripe", 1.3, 0.30, main)); stripe.position.y = 0.75; stripe.scaling.set(0.6, 1.01, 0.6); stripe.rotation.y = 0.5;
        const hook = add(sphere(scene, "hook", 0.4, cream)); hook.position.set(0.18, 1.45, 0);
        topY = 1.0;
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
  // World — procedural environment.
  // =========================================================================
  function buildWorld(scene) {
    scene.clearColor = BABYLON.Color3.FromHexString("#86c5ff").toColor4(1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogColor = BABYLON.Color3.FromHexString("#a9d4ff");
    scene.fogDensity = 0.008;

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 1.0; hemi.groundColor = BABYLON.Color3.FromHexString("#4a6a3a");
    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.4), scene);
    sun.position = new BABYLON.Vector3(40, 60, 40); sun.intensity = 1.0;

    const shadow = new BABYLON.ShadowGenerator(1024, sun);
    shadow.useBlurExponentialShadowMap = true; shadow.blurScale = 2;

    // Grass ground.
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 120, height: 120 }, scene);
    ground.material = mat(scene, "grass", "#5fae4f"); ground.receiveShadows = true;

    // ---- Roads: a randomly oriented crossroads of grey strips. ----
    const roadMat = mat(scene, "road", "#6b6f78");
    const roadEdge = mat(scene, "roadEdge", "#d9c47a");
    const baseAngle = Math.random() * Math.PI;
    for (const ang of [baseAngle, baseAngle + Math.PI / 2]) {
      const road = BABYLON.MeshBuilder.CreateGround("road", { width: 7, height: 120 }, scene);
      road.rotation.y = ang; road.position.y = 0.02; road.material = roadMat; road.receiveShadows = true;
      for (const side of [-1, 1]) {
        const edge = BABYLON.MeshBuilder.CreateGround("edge", { width: 0.35, height: 120 }, scene);
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
      for (const ang of [baseAngle, baseAngle + Math.PI / 2]) {
        const perp = Math.abs(x * Math.sin(ang) - z * Math.cos(ang));
        if (perp < 5) return true;
      }
      return false;
    };

    // ---- Scatter trees, rocks, flowers, grass tufts. ----
    const trunkMat = mat(scene, "trunk", "#7a5230");
    const leafMats = ["#3f9d4a", "#46ad53", "#379142"].map((c, i) => mat(scene, "leaf" + i, c));
    const rockMat = mat(scene, "rock", "#9aa0a6");
    const tuftMat = mat(scene, "tuft", "#69bd55");

    const place = (minR, maxR) => {
      for (let tries = 0; tries < 12; tries++) {
        const ang = Math.random() * Math.PI * 2;
        const r = minR + Math.random() * (maxR - minR);
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        if (r > 6 && !onRoad(x, z)) return { x, z };
      }
      return null;
    };

    const trees = 22 + ((Math.random() * 8) | 0);
    for (let i = 0; i < trees; i++) {
      const p = place(8, 52); if (!p) continue;
      const h = 1.2 + Math.random() * 0.8;
      const trunk = cyl(scene, "trunk", 0.5, 0.5, h * 1.4, trunkMat);
      trunk.position.set(p.x, h * 0.7, p.z); shadow.addShadowCaster(trunk);
      const lm = leafMats[(Math.random() * leafMats.length) | 0];
      const n = 2 + ((Math.random() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const leaf = sphere(scene, "leaf", 1.8 + Math.random(), lm);
        leaf.position.set(p.x + (Math.random() - 0.5), h * 1.4 + 0.6 + k * 0.6, p.z + (Math.random() - 0.5));
        leaf.scaling.y = 1.1; shadow.addShadowCaster(leaf);
      }
    }

    for (let i = 0; i < 16; i++) {
      const p = place(7, 54); if (!p) continue;
      const rock = BABYLON.MeshBuilder.CreateIcoSphere("rock", { radius: 0.4 + Math.random() * 0.7, subdivisions: 1 }, scene);
      rock.material = rockMat; rock.position.set(p.x, 0.3, p.z);
      rock.rotation.set(Math.random(), Math.random(), Math.random()); shadow.addShadowCaster(rock);
    }

    for (let i = 0; i < 60; i++) {
      const p = place(6, 56); if (!p) continue;
      if (Math.random() < 0.5) {
        const stem = cyl(scene, "stem", 0.04, 0.04, 0.4, mat(scene, "stem", "#3c8a3c"));
        stem.position.set(p.x, 0.2, p.z);
        const head = sphere(scene, "fhead", 0.18, mat(scene, "fhead", PALETTE[(Math.random() * PALETTE.length) | 0]));
        head.position.set(p.x, 0.42, p.z);
      } else {
        const tuft = cone(scene, "tuft", 0.35, 0, 0.5, tuftMat);
        tuft.position.set(p.x, 0.25, p.z);
      }
    }

    return { shadow, onRoad };
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
  function spawnArtifact(scene, world, interaction, player, state, near) {
    let pos = null;
    for (let tries = 0; tries < 24 && !pos; tries++) {
      let x, z;
      if (near) { // cluster near a wave's monsters
        const ang = Math.random() * Math.PI * 2, r = 2 + Math.random() * 8;
        x = near.x + Math.cos(ang) * r; z = near.z + Math.sin(ang) * r;
      } else {
        const ang = Math.random() * Math.PI * 2, r = 9 + Math.random() * 24;
        x = Math.cos(ang) * r; z = Math.sin(ang) * r;
      }
      if (Math.hypot(x, z) < CONFIG.worldRadius - 2 && !world.onRoad(x, z)) pos = new BABYLON.Vector3(x, 0, z);
    }
    if (!pos) pos = new BABYLON.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);

    const color = PALETTE[(Math.random() * PALETTE.length) | 0];
    const artifact = buildArtifact(scene, world.shadow, pos, color);
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
          toast(`Artifact! +${CONFIG.scorePerArtifact}`);
        });
      },
    });
    artifact._it = it; interaction.register(it); state.artifacts.push(artifact);
    return artifact;
  }

  // =========================================================================
  // Wave system — escalating waves of living sweets + artifacts every minute.
  // =========================================================================
  class WaveSystem {
    constructor(scene, world, interaction, player, state) {
      this.scene = scene; this.world = world; this.interaction = interaction;
      this.player = player; this.state = state;
      this.wave = 0;
      this.timer = CONFIG.firstWaveDelay; // seconds until next wave
    }

    update(dt) {
      this.timer -= dt;
      dom.nextWave.textContent = Math.ceil(Math.max(0, this.timer)) + "s";
      if (this.timer <= 0) { this.timer = CONFIG.waveInterval; this.spawnWave(); }
    }

    spawnWave() {
      this.wave++;
      this.state.wave = this.wave;
      dom.wave.textContent = this.wave;

      const monsterCount = Math.min(
        CONFIG.maxMonstersPerWave,
        CONFIG.baseMonsters + (this.wave - 1) * CONFIG.monstersPerWave
      );
      const artifactCount = Math.min(
        CONFIG.maxArtifactsPerWave,
        CONFIG.baseArtifacts + (this.wave - 1) * CONFIG.artifactsPerWave
      );

      // Monsters spawn around the ring, away from the player so they march in.
      for (let i = 0; i < monsterCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 26 + Math.random() * 12;
        const pos = new BABYLON.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        this.state.monsters.push(new Monster(this.scene, this.world.shadow, pos, this.wave));
      }
      // Each wave also drops fresh artifacts to grab.
      for (let i = 0; i < artifactCount; i++) {
        spawnArtifact(this.scene, this.world, this.interaction, this.player, this.state);
      }

      bannerWave(this.wave, monsterCount);
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
    const interaction = new InteractionSystem();

    const state = {
      score: 0, wave: 0, over: false,
      artifacts: [], monsters: [], bolts: [],
    };
    updateHealthBar(player.health);

    // A few artifacts to find before the first wave even arrives.
    for (let i = 0; i < 3; i++) spawnArtifact(scene, world, interaction, player, state);

    const waves = new WaveSystem(scene, world, interaction, player, state);

    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      if (state.over) { cosmetics(state, dt); return; }

      player.update(dt, camera);
      const target = player.position.add(new BABYLON.Vector3(0, 1.4, 0));
      camera.target = BABYLON.Vector3.Lerp(camera.target, target, CONFIG.cameraLerp);

      waves.update(dt);

      // Casting.
      if (Input.wantsCast()) {
        const shot = player.tryCast();
        if (shot) state.bolts.push(new Projectile(scene, world.shadow, shot.origin, shot.dir));
      }

      updateBolts(state, dt);
      updateMonsters(state, player, dt);

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
          if (!m.alive || m.dying > 0) continue;
          const dx = b.mesh.position.x - m.position.x;
          const dz = b.mesh.position.z - m.position.z;
          if (Math.hypot(dx, dz) <= CONFIG.boltRadius + m.radius) {
            const killed = m.hit(1);
            if (killed) { addScore(state, CONFIG.scorePerMonster); toast(`Splat! +${CONFIG.scorePerMonster}`); }
            b.dead = true;
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
        const hp = player.takeDamage(CONFIG.contactDamage);
        updateHealthBar(hp);
        flashHurt();
        if (hp <= 0) { gameOver(state); return; }
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

  function updateHealthBar(hp) {
    const pct = Math.max(0, Math.min(100, (hp / CONFIG.maxHealth) * 100));
    dom.healthFill.style.width = pct + "%";
    dom.healthFill.style.background = pct > 50
      ? "linear-gradient(90deg, #5be0a0, #6cc6ff)"
      : pct > 25
      ? "linear-gradient(90deg, #ffd34e, #ff9d5c)"
      : "linear-gradient(90deg, #ff5c7a, #ff3b3b)";
  }

  let hurtTimer = null;
  function flashHurt() {
    dom.hud.style.boxShadow = "inset 0 0 120px rgba(255,40,60,0.55)";
    clearTimeout(hurtTimer);
    hurtTimer = setTimeout(() => { dom.hud.style.boxShadow = "none"; }, 160);
  }

  function bannerWave(n, monsterCount) {
    dom.waveBanner.textContent = `Wave ${n} — ${monsterCount} sweets!`;
    dom.waveBanner.classList.remove("show");
    void dom.waveBanner.offsetWidth; // restart the CSS animation
    dom.waveBanner.classList.add("show");
  }

  function gameOver(state) {
    state.over = true;
    dom.prompt.classList.add("hidden");
    dom.finalScore.textContent = state.score;
    dom.finalWave.textContent = state.wave;
    setTimeout(() => dom.over.classList.remove("hidden"), 600);
  }

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
      const scene = createScene();
      scene.executeWhenReady(() => { dom.loadHint.textContent = "Ready!"; dom.startBtn.disabled = false; });
      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", () => engine.resize());
      dom.startBtn.addEventListener("click", startGame);
      dom.replayBtn.addEventListener("click", () => window.location.reload());
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

  /* ===========================================================================
   * ROADMAP SEAMS (inert, documented integration points):
   *   PuzzleSystem    - levers/plates are Interactables flipping state flags
   *                     that gate a door mesh; reuses InteractionSystem.
   *   DialogueSystem  - NPCs register as Interactables ("Talk"); onInteract
   *                     opens a BABYLON.GUI panel (babylon.gui is loaded).
   *   Power-ups       - drop from sweets like artifacts; tweak Player.castCooldown
   *                     / boltSpeed or restore health on pickup.
   * ===========================================================================
   */
})();
