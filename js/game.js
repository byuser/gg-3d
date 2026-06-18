/*
 * Good Game 3D
 * ---------------------------------------------------------------------------
 * A third-person browser adventure built on Babylon.js.
 *
 * This release: run as Lily through a procedurally generated meadow (roads,
 * grass, trees, rocks, flowers), find the randomly spawned glowing relics,
 * pick them up (with a pick-up animation) and store them in the chest.
 * Collect 3 to win. Works on desktop and mobile.
 *
 * The code is split into small systems so future releases (combat, puzzles,
 * NPC dialogue) slot in cleanly:
 *
 *   - Interactable / InteractionSystem  reusable "walk up + press E" contract.
 *   - Input                             keyboard + on-screen stick -> one vector.
 *   - Player                            movement + walk/idle/pick-up animations.
 *   - buildWorld                        procedural environment + lighting.
 *
 * Roadmap seams are documented at the bottom of the file.
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
    goal: 3,
    itemCount: 6,            // how many relics to scatter (collect `goal` of them)
    moveSpeed: 6.5,          // metres / second
    turnLerp: 0.2,
    cameraLerp: 0.12,
    interactRange: 2.8,
    worldRadius: 44,         // playable area before the invisible fence
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
    prompt: document.getElementById("prompt"),
    toast: document.getElementById("toast"),
    win: document.getElementById("win"),
    replayBtn: document.getElementById("replayBtn"),
    touch: document.getElementById("touch"),
    joystick: document.getElementById("joystick"),
    stick: document.getElementById("stick"),
    actionBtn: document.getElementById("actionBtn"),
    fsBtn: document.getElementById("fsBtn"),
    goal: document.getElementById("goal"),
  };
  if (dom.goal) dom.goal.textContent = CONFIG.goal;

  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  const engine = new BABYLON.Engine(dom.canvas, true, { stencil: true, adaptToDeviceRatio: true });

  // =========================================================================
  // Input
  // =========================================================================
  const Input = {
    keys: Object.create(null),
    joy: { x: 0, y: 0, active: false },
    interactQueued: false,

    init() {
      window.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (e.code === "KeyE" || e.code === "Space") { this.interactQueued = true; e.preventDefault(); }
      });
      window.addEventListener("keyup", (e) => { this.keys[e.code] = false; });
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
  // Player — Lily, with idle / walk / pick-up animation states.
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
      this.carried = null;
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

      // Where carried relics sit (above the hands / head).
      this.carryAnchor = new BABYLON.TransformNode("carry", scene);
      this.carryAnchor.parent = lean; this.carryAnchor.position.set(0, 2.35, 0.1);

      // Soft blob shadow.
      const blob = disc(scene, "blob", 0.6, emat(scene, "blob", "#000000", 0));
      blob.material.alpha = 0.28; blob.rotation.x = Math.PI / 2; blob.position.y = 0.02;
      blob.parent = root; blob.isPickable = false;

      root.position.set(0, 0, 12);
    }

    startPickup(itemMesh, onPicked) {
      this.state = "pickup"; this.pickT = 0;
      this.pendingItem = itemMesh; this.onPicked = onPicked;
    }
    get busy() { return this.state === "pickup"; }

    update(dt, camera) {
      if (this.state === "pickup") { this._updatePickup(dt); }
      else { this._updateMove(dt, camera); }
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

    // Crouch -> grab -> stand and raise the relic overhead.
    _updatePickup(dt) {
      this.pickT = Math.min(1, this.pickT + dt / 0.7);
      const t = this.pickT;
      const bend = Math.sin(Math.min(t, 0.5) / 0.5 * Math.PI / 2);      // 0->1 by t=0.5
      const rise = t < 0.5 ? 0 : (t - 0.5) / 0.5;                        // 0->1 from t=0.5
      // Body bends down then straightens.
      const downThenUp = t < 0.5 ? bend : (1 - rise);
      this.lean.rotation.x = downThenUp * 0.55;
      this.lean.position.y = -downThenUp * 0.18;
      // Arms reach down, then lift overhead.
      const armDown = downThenUp * 1.3;
      const armUp = rise * 2.6;
      this.armL.rotation.x = this.armR.rotation.x = armDown - armUp;
      this.armL.rotation.z = this.armR.rotation.z = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;

      // At the bottom of the reach, take hold of the relic.
      if (this.pendingItem && t >= 0.5) {
        const m = this.pendingItem; this.pendingItem = null;
        m.setParent(this.carryAnchor);
        m.position.set(0, -1.4, 0.4); // starts low (at the hands)
        this.carried = m;
        if (this.onPicked) { this.onPicked(); this.onPicked = null; }
      }
      // Raise the held relic to the overhead anchor as we stand.
      if (this.carried) {
        this.carried.position.y = lerp(this.carried.position.y, 0, 0.25);
        this.carried.position.z = lerp(this.carried.position.z, 0, 0.25);
      }
      if (t >= 1) { this.state = "idle"; this.lean.rotation.x = 0; this.lean.position.y = 0; }
    }

    releaseCarried() { const m = this.carried; this.carried = null; return m; }
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

    // Central plaza around the chest.
    const plaza = disc(scene, "plaza", 5, mat(scene, "plaza", "#caa46a"));
    plaza.rotation.x = Math.PI / 2; plaza.position.y = 0.04; plaza.receiveShadows = true;

    // Helper: are we on/near a road centerline? (keep trees off the roads)
    const onRoad = (x, z) => {
      for (const ang of [baseAngle, baseAngle + Math.PI / 2]) {
        // perpendicular distance from (x,z) to a road centerline through the origin
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
      // rejection-sample a spot off the roads and away from the plaza
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

    // Flowers (stem + colored head) and grass tufts for ground detail.
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
  // Chest + relics
  // =========================================================================
  function buildChest(scene, shadow) {
    const root = new BABYLON.TransformNode("chest", scene);
    const wood = emat(scene, "cw", "#8a5a2b", 0.05);
    const woodDark = emat(scene, "cwd", "#6e451f", 0.05);
    const gold = emat(scene, "cg", "#ffcf5c", 0.3);

    const base = box(scene, "cbase", 1.8, 1, 1.2, wood); base.parent = root; base.position.y = 0.5;
    shadow.addShadowCaster(base);
    const lidPivot = new BABYLON.TransformNode("lidP", scene);
    lidPivot.parent = root; lidPivot.position.set(0, 1, -0.6);
    const lid = BABYLON.MeshBuilder.CreateCylinder("clid", { height: 1.8, diameter: 1.2, tessellation: 16, arc: 0.5 }, scene);
    lid.rotation.z = Math.PI / 2; lid.material = woodDark; lid.parent = lidPivot; lid.position.z = 0.6;
    shadow.addShadowCaster(lid);
    const lock = box(scene, "lock", 0.3, 0.3, 0.12, gold); lock.parent = root; lock.position.set(0, 0.6, 0.62);

    // Goal beam.
    const beam = cyl(scene, "beam", 0.1, 1.4, 6, emat(scene, "beamM", "#ffcf5c", 1));
    beam.material.alpha = 0.1; beam.parent = root; beam.position.y = 3; beam.isPickable = false;

    return { root, lidPivot, openAmount: 0 };
  }

  function buildRelic(scene, shadow, position, color) {
    const root = new BABYLON.TransformNode("relic", scene);
    root.position.copyFrom(position);
    const m = emat(scene, "relicM" + color, color, 0.6);
    const gem = BABYLON.MeshBuilder.CreatePolyhedron("gem", { type: 1, size: 0.36 }, scene);
    gem.material = m; gem.parent = root; gem.position.y = 1.0; shadow.addShadowCaster(gem);
    const halo = disc(scene, "halo", 0.55, emat(scene, "haloM" + color, color, 1));
    halo.material.alpha = 0.35; halo.rotation.x = Math.PI / 2; halo.position.y = 0.06; halo.parent = root;
    halo.isPickable = false;
    const beam = cyl(scene, "rbeam", 0.05, 0.7, 4, emat(scene, "rbeamM" + color, color, 1));
    beam.material.alpha = 0.12; beam.parent = root; beam.position.y = 2; beam.isPickable = false;
    return { root, gem, halo };
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
    const chest = buildChest(scene, world.shadow);

    const state = { score: 0, won: false, relics: [], chest };

    // Randomly spawn relics around the meadow (off the roads, away from chest).
    for (let i = 0; i < CONFIG.itemCount; i++) {
      let pos = null;
      for (let tries = 0; tries < 20 && !pos; tries++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 9 + Math.random() * 24;
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        if (!world.onRoad(x, z)) pos = new BABYLON.Vector3(x, 0, z);
      }
      if (!pos) pos = new BABYLON.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
      const color = PALETTE[i % PALETTE.length];
      const relic = buildRelic(scene, world.shadow, pos, color);
      const it = new Interactable(relic.root, {
        label: "Pick up relic",
        onInteract: (self) => {
          if (player.busy) return;
          if (player.carried) { toast("Store the relic you're holding first!"); return; }
          self.enabled = false;
          player.startPickup(relic.gem, () => {
            relic.halo.setEnabled(false);
            interaction.remove(self);
            toast("Relic collected — bring it to the chest!");
          });
        },
      });
      relic._it = it; interaction.register(it); state.relics.push(relic);
    }

    const chestIt = new Interactable(chest.root, {
      label: "Store relic", range: 3.4,
      onInteract: () => {
        if (player.busy || !player.carried) { if (!player.carried) toast("Find a glowing relic first!"); return; }
        const gem = player.releaseCarried(); gem.dispose();
        state.score++; chest.openAmount = 1; dom.score.textContent = state.score;
        toast(`Stored! ${state.score} / ${CONFIG.goal}`);
        if (state.score >= CONFIG.goal) winGame(state);
      },
    });
    chestIt.enabled = false; interaction.register(chestIt);

    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      if (!state.won) {
        player.update(dt, camera);
        const target = player.position.add(new BABYLON.Vector3(0, 1.4, 0));
        camera.target = BABYLON.Vector3.Lerp(camera.target, target, CONFIG.cameraLerp);
        chestIt.enabled = !!player.carried && !player.busy;
        interaction.update(player.position);
        if (Input.consumeInteract() && !player.busy) interaction.trigger();
      }
      cosmetics(state, dt);
    });

    return scene;
  }

  function cosmetics(state, dt) {
    const t = performance.now() / 1000;
    for (const r of state.relics) {
      if (r._it && r._it.enabled) {
        r.gem.rotation.y += dt * 1.6;
        r.gem.position.y = 1.0 + Math.sin(t * 2 + r.gem.uniqueId) * 0.14;
        r.halo.scaling.setAll(1 + Math.sin(t * 3) * 0.12);
      }
    }
    const c = state.chest;
    c.lidPivot.rotation.x = lerp(c.lidPivot.rotation.x, -c.openAmount * 1.1, 0.15);
    if (c.openAmount > 0) c.openAmount = Math.max(0, c.openAmount - dt * 0.8);
  }

  function winGame(state) {
    state.won = true; dom.prompt.classList.add("hidden"); state.chest.openAmount = 1;
    setTimeout(() => dom.win.classList.remove("hidden"), 700);
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
   *   CombatSystem    - add Havok physics in buildWorld(); Player gains health
   *                     + attack(); enemies are Interactables with an AI tick.
   *   DialogueSystem  - NPCs register as Interactables ("Talk"); onInteract
   *                     opens a BABYLON.GUI panel (babylon.gui is loaded).
   *   PuzzleSystem    - levers/plates are Interactables flipping state flags
   *                     that gate a door mesh; reuses InteractionSystem.
   * ===========================================================================
   */
})();
