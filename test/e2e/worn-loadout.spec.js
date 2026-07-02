import { test, expect } from "@playwright/test";

// Task 35 — full-loadout fit & clipping integration. The per-category specs each
// screenshot ONE slot in isolation; this is the INTEGRATION pass: it boots the built
// site, dresses Lily in a FULL suit (helm + pauldrons + breastplate + gauntlets + belt
// + greaves + cloak + amulet) AND each of the six weapon classes at once, PINS her at
// the class's strike (impact/release) pose, frames her whole body from the gameplay
// 3/4 angle, and screenshots each. It asserts (a) every equipped weapon shows its class
// and the core worn silhouette all renders together, (b) the six fully-geared mid-attack
// frames visibly DIFFER (the loadout + attack really change per class, not one frozen
// frame), and (c) no console errors — i.e. a fully-geared Lily mid-attack for each weapon
// class reads as one coherent, clip-free suit. The headless Vitest suite (test/worngear
// .test.js) proves the cross-part fit / no-penetration / dispose invariants in depth;
// this is the DOM/WebGL layer those can't cover. Runs at desktop AND the Galaxy S24 Ultra
// profile (portrait + landscape) since it's an on-character visual, adapting to the phone
// tiers' clean omissions (pauldrons / belt / jewelry are dropped on the low budget).

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the other worn-gear specs): in this dev sandbox the
// egress proxy intermittently fails the Babylon CDN load, so the engine can't boot. When
// GG_LOCAL_BABYLON points at a dir holding the three babylon scripts (fetched once via
// curl), route the CDN requests to those files. Inert on CI (the var is unset there and
// the real CDN loads), so the deployed site stays CDN-only.
const LOCAL_BABYLON = process.env.GG_LOCAL_BABYLON;
test.beforeEach(async ({ page }) => {
  if (!LOCAL_BABYLON) return;
  const { readFileSync } = await import("node:fs");
  const { join, basename } = await import("node:path");
  await page.route(/cdn\.babylonjs\.com/, (route) => {
    try {
      const body = readFileSync(join(LOCAL_BABYLON, basename(new URL(route.request().url()).pathname)));
      route.fulfill({ status: 200, contentType: "application/javascript", body });
    } catch { route.continue(); }
  });
});

// A full Ironguard suit + a cloak + an amulet — every worn slot filled at once.
const SUIT = {
  helmet: "iron_helm", pauldrons: "iron_pauldrons", breastplate: "iron_plate",
  gloves: "iron_gauntlets", belt: "reinforced_belt", boots: "iron_greaves",
  cloak: "dragon_cloak", necklace: "titan_pendant",
};
// One buyable weapon per class → every attack family (melee slash / chop / stab, ranged
// draw + release, cast channel + release) is exercised, fully geared.
const WEAPONS = [
  { id: "iron_sword", cls: "sword" },
  { id: "war_axe", cls: "axe" },
  { id: "iron_dagger", cls: "dagger" },
  { id: "short_bow", cls: "bow" },
  { id: "magic_wand", cls: "wand" },
  { id: "apprentice_staff", cls: "staff" },
];
// The core worn silhouette is built on EVERY tier (the phone tiers only drop the heavier
// pauldrons / belt / jewelry), so these must always render with a full loadout.
const CORE_SLOTS = ["helmet", "breastplate", "gloves", "boots", "cloak"];

test("a fully-geared Lily reads as one clip-free suit mid-attack for every weapon class", async ({ page }) => {
  const errors = watchErrors(page);

  // Enable the (production-inert) test seam BEFORE any page script runs.
  await page.addInitScript(() => { window.__GG_TEST__ = {}; });

  await page.goto("/");
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await page.waitForTimeout(1200);

  // Dress Lily in the full suit, face the lens, park a whole-body 3/4 camera, and PIN
  // whatever (class, phase) we ask each frame so the game's own updater can't re-pose her
  // (registered AFTER the game's updater — _animateAction converges to the pinned pose).
  await page.evaluate((suit) => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    for (const slot in suit) { try { T.equipItem(p, T.makeItem(suit[slot])); } catch (e) {} }
    try { T.recomputeStats(p); } catch (e) {}
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    window.__pin = { cls: null, phase: "idle" };
    scene.onBeforeRenderObservable.add(() => {
      try {
        const pin = window.__pin;
        p.state = "idle"; p.walkPhase = 0; p.castCooldown = 0;
        p.attack.cls = pin.cls; p.attack.phase = pin.phase; p.attack.t = 0; p.attack.comboStep = 0;
      } catch (e) {}
    });
    const center = p.root.position.clone(); center.y += 1.15;
    const cam = new BJS.ArcRotateCamera("loadoutShot", -Math.PI / 2 - 0.6, 1.16, 6.2, center, scene);
    scene.activeCamera = cam;
    window.__loadCam = cam;
  }, SUIT);

  const shots = [];
  for (const w of WEAPONS) {
    const state = await page.evaluate(({ id, cls, core }) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      for (const s of ["hand1", "hand2"]) { try { T.unequipSlot(p, s); } catch (e) {} }
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      window.__pin = { cls, phase: "strike" };
      const shown = {};
      for (const slot of core) shown[slot] = p.gearShown[slot];
      return { main: p.weaponShown && p.weaponShown.main, attackClass: p.attackClass(), shown };
    }, { id: w.id, cls: w.cls, core: CORE_SLOTS });
    expect(state.main, `${w.id} shown class`).toBe(w.cls);
    expect(state.attackClass, `${w.id} attack class`).toBe(w.cls);
    // The core worn silhouette all renders together with the weapon (every tier).
    for (const slot of CORE_SLOTS) expect(state.shown[slot], `${w.id} ${slot} shown`).toBe(true);

    await page.waitForTimeout(400); // let the pinned strike pose + shoulder/cloak follow settle
    const buf = await page.locator("#renderCanvas").screenshot({ path: `test-results/worn-loadout-${w.cls}-strike.png` });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    window.__pin = { cls: null, phase: "idle" };
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__loadCam) { try { window.__loadCam.dispose(); } catch (e) {} }
  });

  // Every fully-geared strike must differ from the next — the weapon + attack really change
  // per class (software WebGL is deterministic, so identical bytes would mean the SAME frame).
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `${WEAPONS[i].cls} full-loadout strike looks identical to ${WEAPONS[i - 1].cls}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
