/*
 * Good Game 3D
 * ---------------------------------------------------------------------------
 * A third-person browser adventure built on Babylon.js.
 *
 * This release: run as Lily, pick up 3 glowing relics, and store them in the
 * chest to win. Works with keyboard/mouse on desktop and touch on mobile.
 *
 * The code is split into small systems so future releases can grow without a
 * rewrite. The roadmap calls for combat, puzzles and NPC dialogue, so the
 * shape below leaves clean seams for each:
 *
 *   - Interactable        a reusable "walk up + press E" contract. Items, the
 *                         chest, and (later) NPCs and puzzle levers all use it.
 *   - InteractionSystem   finds the nearest interactable and drives the prompt.
 *   - Player              movement + animation; combat state will hang here.
 *   - World               static set dressing; physics/enemies plug in here.
 *
 * Stubs for CombatSystem / DialogueSystem / PuzzleSystem are at the bottom so
 * the integration points are explicit and documented.
 */

(() => {
  "use strict";

  const CONFIG = {
    goal: 3,
    moveSpeed: 6.5,          // metres / second
    turnLerp: 0.18,          // how fast Lily rotates to face travel direction
    cameraLerp: 0.12,        // how smoothly the camera trails the player
    interactRange: 2.6,      // metres within which a prompt appears
    worldRadius: 38,         // playable area before the invisible fence
  };

  // ---- DOM handles -------------------------------------------------------
  const dom = {
    canvas: document.getElementById("renderCanvas"),
    overlay: document.getElementById("overlay"),
    startBtn: document.getElementById("startBtn"),
    loadHint: document.getElementById("loadHint"),
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    goal: document.getElementById("goal"),
    prompt: document.getElementById("prompt"),
    toast: document.getElementById("toast"),
    win: document.getElementById("win"),
    replayBtn: document.getElementById("replayBtn"),
    touch: document.getElementById("touch"),
    joystick: document.getElementById("joystick"),
    stick: document.getElementById("stick"),
    actionBtn: document.getElementById("actionBtn"),
  };
  dom.goal.textContent = CONFIG.goal;

  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  // ---- Engine / scene ----------------------------------------------------
  const engine = new BABYLON.Engine(dom.canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    adaptToDeviceRatio: true,
  });

  let game = null; // populated by createScene once Babylon is ready

  // =========================================================================
  // Input — unifies keyboard and the on-screen stick into one move vector.
  // =========================================================================
  const Input = {
    keys: Object.create(null),
    joy: { x: 0, y: 0, active: false }, // normalised, y forward
    interactQueued: false,

    init() {
      window.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (e.code === "KeyE" || e.code === "Space") {
          this.interactQueued = true;
          e.preventDefault();
        }
      });
      window.addEventListener("keyup", (e) => { this.keys[e.code] = false; });
      if (isTouch) this._initJoystick();
    },

    _initJoystick() {
      const base = dom.joystick;
      const radius = 50;
      let pointerId = null;

      const setStick = (dx, dy) => {
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, radius);
        const nx = (dx / len) * clamped;
        const ny = (dy / len) * clamped;
        dom.stick.style.transform = `translate(${nx}px, ${ny}px)`;
        this.joy.x = nx / radius;
        this.joy.y = -ny / radius; // screen-down is world-back
        this.joy.active = true;
      };

      const reset = () => {
        dom.stick.style.transform = "translate(0,0)";
        this.joy.x = this.joy.y = 0;
        this.joy.active = false;
        pointerId = null;
      };

      base.addEventListener("pointerdown", (e) => {
        pointerId = e.pointerId;
        base.setPointerCapture(pointerId);
        const r = base.getBoundingClientRect();
        setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        e.preventDefault();
      });
      base.addEventListener("pointermove", (e) => {
        if (e.pointerId !== pointerId) return;
        const r = base.getBoundingClientRect();
        setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      });
      base.addEventListener("pointerup", reset);
      base.addEventListener("pointercancel", reset);

      dom.actionBtn.addEventListener("pointerdown", (e) => {
        this.interactQueued = true;
        e.preventDefault();
      });
    },

    // Raw desired direction in camera-relative space (x = strafe, z = forward).
    moveVector() {
      let x = 0, z = 0;
      if (this.keys["KeyW"] || this.keys["ArrowUp"]) z += 1;
      if (this.keys["KeyS"] || this.keys["ArrowDown"]) z -= 1;
      if (this.keys["KeyD"] || this.keys["ArrowRight"]) x += 1;
      if (this.keys["KeyA"] || this.keys["ArrowLeft"]) x -= 1;
      if (this.joy.active) { x += this.joy.x; z += this.joy.y; }
      return { x, z };
    },

    consumeInteract() {
      const v = this.interactQueued;
      this.interactQueued = false;
      return v;
    },
  };

  // =========================================================================
  // Interactable — the reusable "approach + act" contract.
  // Items, the chest, and future NPCs / puzzle objects all implement it.
  // =========================================================================
  class Interactable {
    constructor(mesh, { label, range = CONFIG.interactRange, onInteract }) {
      this.mesh = mesh;
      this.label = label;
      this.range = range;
      this.onInteract = onInteract;
      this.enabled = true;
    }
    get position() { return this.mesh.getAbsolutePosition(); }
    distanceTo(p) { return BABYLON.Vector3.Distance(this.position, p); }
  }

  class InteractionSystem {
    constructor() { this.items = []; this.current = null; }
    register(interactable) { this.items.push(interactable); return interactable; }
    remove(interactable) {
      const i = this.items.indexOf(interactable);
      if (i >= 0) this.items.splice(i, 1);
      if (this.current === interactable) this.current = null;
    }
    // Pick the nearest enabled interactable within its range.
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
      } else {
        dom.prompt.classList.add("hidden");
      }
    }
    trigger() {
      if (this.current && this.current.onInteract) this.current.onInteract(this.current);
    }
  }

  // =========================================================================
  // Player — Lily, assembled from primitives, with a procedural walk cycle.
  // =========================================================================
  class Player {
    constructor(scene) {
      this.scene = scene;
      this.speed = CONFIG.moveSpeed;
      this.facing = 0;          // yaw in radians
      this.walkPhase = 0;       // drives the leg/arm swing
      this.carried = null;      // mesh currently held above the head
      this.root = this._build(scene);
    }

    _build(scene) {
      const root = new BABYLON.TransformNode("playerRoot", scene);

      const skin = mat(scene, "skin", "#ffd9b8");
      const hair = mat(scene, "hair", "#5a3a2a");
      const dress = mat(scene, "dress", "#d6457f");
      const dressDark = mat(scene, "dressDark", "#b5366a");
      const eyeMat = mat(scene, "eye", "#2a2a3a");

      // Pivot we rotate to face travel direction.
      const body = new BABYLON.TransformNode("body", scene);
      body.parent = root;
      this.body = body;

      // Torso + skirt (cone) give a "girl in a dress" silhouette.
      const torso = BABYLON.MeshBuilder.CreateCylinder("torso", { height: 0.7, diameterTop: 0.42, diameterBottom: 0.5 }, scene);
      torso.material = dress; torso.parent = body; torso.position.y = 1.15;

      const skirt = BABYLON.MeshBuilder.CreateCylinder("skirt", { height: 0.5, diameterTop: 0.5, diameterBottom: 0.92, tessellation: 18 }, scene);
      skirt.material = dressDark; skirt.parent = body; skirt.position.y = 0.72;

      const head = BABYLON.MeshBuilder.CreateSphere("head", { diameter: 0.5 }, scene);
      head.material = skin; head.parent = body; head.position.y = 1.72;

      const hairBack = BABYLON.MeshBuilder.CreateSphere("hairBack", { diameter: 0.56 }, scene);
      hairBack.material = hair; hairBack.parent = body; hairBack.position.set(0, 1.78, -0.06);
      hairBack.scaling.set(1, 1.05, 1);

      // Ponytails
      for (const side of [-1, 1]) {
        const tail = BABYLON.MeshBuilder.CreateSphere("tail", { diameter: 0.22 }, scene);
        tail.material = hair; tail.parent = body; tail.position.set(0.26 * side, 1.86, -0.05);
        tail.scaling.set(1, 1.6, 1);
      }

      for (const side of [-1, 1]) {
        const eye = BABYLON.MeshBuilder.CreateSphere("eye", { diameter: 0.07 }, scene);
        eye.material = eyeMat; eye.parent = body; eye.position.set(0.1 * side, 1.74, 0.22);
      }

      // Limbs — kept as members so the walk cycle can swing them.
      const mkLimb = (name, parentPivotY, material, length) => {
        const pivot = new BABYLON.TransformNode(name + "Pivot", scene);
        pivot.parent = body; pivot.position.y = parentPivotY;
        const limb = BABYLON.MeshBuilder.CreateCapsule(name, { height: length, radius: 0.09 }, scene);
        limb.material = material; limb.parent = pivot; limb.position.y = -length / 2;
        return pivot;
      };

      this.armL = mkLimb("armL", 1.42, dress, 0.6); this.armL.position.x = -0.3;
      this.armR = mkLimb("armR", 1.42, dress, 0.6); this.armR.position.x = 0.3;
      this.legL = mkLimb("legL", 0.66, skin, 0.62); this.legL.position.x = -0.13;
      this.legR = mkLimb("legR", 0.66, skin, 0.62); this.legR.position.x = 0.13;

      // Anchor where carried relics float.
      this.carryAnchor = new BABYLON.TransformNode("carryAnchor", scene);
      this.carryAnchor.parent = body; this.carryAnchor.position.set(0, 2.25, 0);

      // Soft blob shadow under Lily.
      const blob = BABYLON.MeshBuilder.CreateDisc("blob", { radius: 0.55, tessellation: 24 }, scene);
      blob.rotation.x = Math.PI / 2; blob.position.y = 0.02; blob.parent = root;
      blob.material = mat(scene, "blob", "#000000"); blob.material.alpha = 0.25;
      blob.isPickable = false;

      root.position.set(0, 0, 6);
      return root;
    }

    // Move using a camera-relative input vector; returns current speed (0..1).
    update(dt, camera) {
      const input = Input.moveVector();
      const mag = Math.min(1, Math.hypot(input.x, input.z));

      if (mag > 0.05) {
        // Convert camera-relative input into world space using the camera yaw.
        const yaw = camera.alpha; // ArcRotateCamera azimuth
        const forward = new BABYLON.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
        const right = new BABYLON.Vector3(Math.cos(yaw - Math.PI / 2), 0, Math.sin(yaw - Math.PI / 2));
        const dir = forward.scale(input.z).add(right.scale(input.x));
        if (dir.lengthSquared() > 0.0001) {
          dir.normalize();
          const next = this.root.position.add(dir.scale(this.speed * mag * dt));
          // Keep Lily inside the play area.
          if (Math.hypot(next.x, next.z) < CONFIG.worldRadius) this.root.position = next;

          // Smoothly face the travel direction.
          const target = Math.atan2(dir.x, dir.z);
          this.facing = lerpAngle(this.facing, target, CONFIG.turnLerp);
        }
        this.walkPhase += dt * 10 * mag;
      } else {
        this.walkPhase = lerpToward(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, 0.2);
      }

      this.body.rotation.y = this.facing;
      this._animate(mag);
      return mag;
    }

    _animate(speed) {
      const swing = Math.sin(this.walkPhase) * 0.7 * (0.3 + speed);
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
      // Gentle bob.
      this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06 * speed;
    }

    carry(mesh) {
      this.carried = mesh;
      mesh.setParent(this.carryAnchor);
      mesh.position.set(0, 0, 0);
    }
    releaseCarried() { const m = this.carried; this.carried = null; return m; }

    get position() { return this.root.position; }
  }

  // =========================================================================
  // World — ground, scenery and lighting. Physics/enemies attach here later.
  // =========================================================================
  function buildWorld(scene) {
    // Sky
    scene.clearColor = BABYLON.Color3.FromHexString("#8fc7ff").toColor4(1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogColor = BABYLON.Color3.FromHexString("#a9d4ff");
    scene.fogDensity = 0.012;

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = BABYLON.Color3.FromHexString("#3a5a3a");

    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.6, -1, -0.4), scene);
    sun.position = new BABYLON.Vector3(30, 50, 30);
    sun.intensity = 1.1;

    const shadows = new BABYLON.ShadowGenerator(1024, sun);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurScale = 2;

    // Ground
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100, subdivisions: 2 }, scene);
    const gmat = new BABYLON.StandardMaterial("gmat", scene);
    gmat.diffuseColor = BABYLON.Color3.FromHexString("#6db35a");
    gmat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    ground.material = gmat;
    ground.receiveShadows = true;

    // A ring path of lighter grass to guide the eye toward the chest.
    const plaza = BABYLON.MeshBuilder.CreateDisc("plaza", { radius: 5, tessellation: 40 }, scene);
    plaza.rotation.x = Math.PI / 2; plaza.position.y = 0.01;
    const pmat = new BABYLON.StandardMaterial("pmat", scene);
    pmat.diffuseColor = BABYLON.Color3.FromHexString("#caa46a");
    pmat.specularColor = new BABYLON.Color3(0, 0, 0);
    plaza.material = pmat;

    // Scatter some low-poly trees and rocks for landmarks.
    const trunkMat = mat(scene, "trunk", "#7a5230");
    const leafMat = mat(scene, "leaf", "#3f9d4a");
    const rockMat = mat(scene, "rock", "#9aa0a6");
    const rng = mulberry32(1337);
    for (let i = 0; i < 26; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 9 + rng() * 28;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (rng() > 0.25) {
        const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk" + i, { height: 1.4, diameter: 0.5 }, scene);
        trunk.material = trunkMat; trunk.position.set(x, 0.7, z);
        const leaves = BABYLON.MeshBuilder.CreateSphere("leaf" + i, { diameter: 2.4 + rng() }, scene);
        leaves.material = leafMat; leaves.position.set(x, 2.1, z);
        leaves.scaling.y = 1.2;
        shadows.addShadowCaster(trunk); shadows.addShadowCaster(leaves);
      } else {
        const rock = BABYLON.MeshBuilder.CreateIcoSphere("rock" + i, { radius: 0.5 + rng() * 0.6, subdivisions: 1 }, scene);
        rock.material = rockMat; rock.position.set(x, 0.35, z);
        rock.rotation.set(rng(), rng(), rng());
        shadows.addShadowCaster(rock);
      }
    }

    return { shadows, ground };
  }

  // =========================================================================
  // Relics + Chest — this release's win condition.
  // =========================================================================
  function buildChest(scene, shadows) {
    const root = new BABYLON.TransformNode("chestRoot", scene);
    root.position.set(0, 0, 0);

    const wood = mat(scene, "chestWood", "#8a5a2b");
    const woodDark = mat(scene, "chestWoodDark", "#6e451f");
    const goldMat = mat(scene, "chestGold", "#ffcf5c");
    goldMat.emissiveColor = BABYLON.Color3.FromHexString("#3a2e00");

    const base = BABYLON.MeshBuilder.CreateBox("chestBase", { width: 1.8, height: 1, depth: 1.2 }, scene);
    base.material = wood; base.parent = root; base.position.y = 0.5;

    const lid = BABYLON.MeshBuilder.CreateCylinder("chestLid", { height: 1.8, diameter: 1.2, tessellation: 18, arc: 0.5 }, scene);
    lid.rotation.z = Math.PI / 2; lid.material = woodDark;
    const lidPivot = new BABYLON.TransformNode("lidPivot", scene);
    lidPivot.parent = root; lidPivot.position.set(0, 1.0, -0.6);
    lid.parent = lidPivot; lid.position.set(0, 0, 0.6);

    const lock = BABYLON.MeshBuilder.CreateBox("lock", { width: 0.3, height: 0.3, depth: 0.1 }, scene);
    lock.material = goldMat; lock.parent = root; lock.position.set(0, 0.6, 0.62);

    shadows.addShadowCaster(base); shadows.addShadowCaster(lid);

    // A little glow column above the chest so it reads as the goal.
    const beam = BABYLON.MeshBuilder.CreateCylinder("beam", { height: 6, diameterTop: 0.1, diameterBottom: 1.4 }, scene);
    const beamMat = mat(scene, "beamMat", "#ffcf5c");
    beamMat.emissiveColor = BABYLON.Color3.FromHexString("#ffcf5c");
    beamMat.alpha = 0.12; beam.material = beamMat; beam.parent = root;
    beam.position.y = 3; beam.isPickable = false;

    return { root, lidPivot, openAmount: 0, lid };
  }

  function buildRelic(scene, shadows, index, position, color) {
    const root = new BABYLON.TransformNode("relic" + index, scene);
    root.position.copyFrom(position);

    const gem = BABYLON.MeshBuilder.CreatePolyhedron("gem" + index, { type: 1, size: 0.34 }, scene);
    const gmat = new BABYLON.StandardMaterial("relicMat" + index, scene);
    gmat.diffuseColor = BABYLON.Color3.FromHexString(color);
    gmat.emissiveColor = BABYLON.Color3.FromHexString(color).scale(0.5);
    gmat.specularPower = 64;
    gem.material = gmat; gem.parent = root; gem.position.y = 0.9;
    shadows.addShadowCaster(gem);

    // Glow halo
    const halo = BABYLON.MeshBuilder.CreateDisc("halo" + index, { radius: 0.5, tessellation: 24 }, scene);
    halo.rotation.x = Math.PI / 2; halo.position.y = 0.05; halo.parent = root;
    const hmat = mat(scene, "halo" + index, color); hmat.emissiveColor = BABYLON.Color3.FromHexString(color);
    hmat.alpha = 0.3; halo.material = hmat; halo.isPickable = false;

    return { root, gem, halo };
  }

  // =========================================================================
  // Scene assembly + game loop.
  // =========================================================================
  function createScene() {
    const scene = new BABYLON.Scene(engine);

    // Third-person camera: trails behind Lily, drag to orbit.
    const camera = new BABYLON.ArcRotateCamera(
      "cam", -Math.PI / 2, 1.05, 11, new BABYLON.Vector3(0, 1.2, 6), scene
    );
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 16;
    camera.lowerBetaLimit = 0.45;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.01;
    camera.panningSensibility = 0;        // disable pan; we only orbit/zoom
    camera.attachControl(dom.canvas, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput"); // keys drive Lily, not the camera

    const world = buildWorld(scene);
    const player = new Player(scene);
    world.shadows.addShadowCaster(player.root, true);

    const interaction = new InteractionSystem();
    const chest = buildChest(scene, world.shadows);

    const state = { score: 0, won: false, relics: [], chest };

    // Three relics spread around the map.
    const spots = [
      { pos: new BABYLON.Vector3(-14, 0, -8), color: "#6cc6ff" },
      { pos: new BABYLON.Vector3(16, 0, -4), color: "#a06cff" },
      { pos: new BABYLON.Vector3(2, 0, -18), color: "#ff6c8a" },
    ];

    spots.forEach((s, i) => {
      const relic = buildRelic(scene, world.shadows, i, s.pos, s.color);
      const interactable = new Interactable(relic.root, {
        label: "Pick up relic",
        onInteract: (self) => {
          if (player.carried) { toast("Store the relic you're holding first!"); return; }
          player.carry(relic.gem);
          relic.halo.setEnabled(false);
          self.enabled = false;
          interaction.remove(self);
          toast("Relic collected — bring it to the chest!");
        },
      });
      relic._interactable = interaction.register(interactable);
      state.relics.push(relic);
    });

    // The chest accepts whatever Lily is carrying.
    const chestInteractable = new Interactable(chest.root, {
      label: "Store relic",
      range: 3.2,
      onInteract: () => {
        if (!player.carried) { toast("Find a glowing relic first!"); return; }
        const gem = player.releaseCarried();
        gem.dispose();
        state.score++;
        chest.openAmount = 1; // pop the lid open briefly
        dom.score.textContent = state.score;
        toast(`Stored! ${state.score} / ${CONFIG.goal}`);
        if (state.score >= CONFIG.goal) winGame(state);
      },
    });
    // Only offer the chest when Lily is actually carrying something.
    chestInteractable.enabled = false;
    interaction.register(chestInteractable);
    state.chestInteractable = chestInteractable;

    game = { scene, camera, player, interaction, state, world };

    // ---- main loop -------------------------------------------------------
    scene.onBeforeRenderObservable.add(() => {
      if (state.won) { stepCosmetics(scene, state, 1 / 60); return; }
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);

      player.update(dt, camera);

      // Camera trails the player target.
      const targetPos = player.position.add(new BABYLON.Vector3(0, 1.2, 0));
      camera.target = BABYLON.Vector3.Lerp(camera.target, targetPos, CONFIG.cameraLerp);

      // The chest prompt is only useful while carrying a relic.
      state.chestInteractable.enabled = !!player.carried && !state.won;

      interaction.update(player.position);
      if (Input.consumeInteract()) interaction.trigger();

      stepCosmetics(scene, state, dt);
    });

    return scene;
  }

  // Spin relics, pulse halos, ease the chest lid open/closed.
  function stepCosmetics(scene, state, dt) {
    const t = performance.now() / 1000;
    for (const r of state.relics) {
      if (r._interactable && r._interactable.enabled) {
        r.gem.rotation.y += dt * 1.5;
        r.gem.position.y = 0.9 + Math.sin(t * 2 + r.gem.uniqueId) * 0.12;
        r.halo.scaling.setAll(1 + Math.sin(t * 3) * 0.1);
      }
    }
    const c = state.chest;
    // Lid eases toward openAmount, then auto-closes.
    c.lidPivot.rotation.x = lerpToward(c.lidPivot.rotation.x, -c.openAmount * 1.1, 0.15);
    if (c.openAmount > 0) c.openAmount = Math.max(0, c.openAmount - dt * 0.8);
  }

  function winGame(state) {
    state.won = true;
    dom.prompt.classList.add("hidden");
    state.chest.openAmount = 1;
    setTimeout(() => dom.win.classList.remove("hidden"), 700);
  }

  // ---- UI glue -----------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2200);
  }

  function startGame() {
    dom.overlay.classList.add("hidden");
    dom.hud.classList.remove("hidden");
    if (isTouch) dom.touch.classList.remove("hidden");
    engine.getRenderingCanvas().focus();
  }

  // =========================================================================
  // Boot
  // =========================================================================
  function boot() {
    Input.init();
    const scene = createScene();
    scene.executeWhenReady(() => {
      dom.loadHint.textContent = "Ready!";
      dom.startBtn.disabled = false;
    });
    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    dom.startBtn.addEventListener("click", startGame);
    dom.replayBtn.addEventListener("click", () => window.location.reload());
  }

  // ---- tiny helpers ------------------------------------------------------
  function mat(scene, name, hex) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    return m;
  }
  function lerpToward(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  dom.startBtn.disabled = true;
  boot();

  /* ===========================================================================
   * ROADMAP SEAMS — documented integration points for upcoming releases.
   * These are intentionally inert; they describe how each system plugs in so
   * the next iteration is additive rather than a rewrite.
   * ===========================================================================
   *
   * CombatSystem
   *   - Add Babylon's physics plugin (Havok) in buildWorld().
   *   - Give Player a `health`, `attack()` and a hitbox; reuse walkPhase for a
   *     swing animation. Enemies are Interactables with an AI update() hook.
   *
   * DialogueSystem
   *   - NPCs register as Interactables with label "Talk". onInteract opens a
   *     BABYLON.GUI dialog panel (babylon.gui is already loaded) and pauses the
   *     interaction prompt until the conversation closes.
   *
   * PuzzleSystem
   *   - Levers/plates are Interactables that flip state flags; a small graph of
   *     conditions gates a door mesh. The InteractionSystem already supplies
   *     "approach + press E", so puzzles only add their own state + visuals.
   */
})();
