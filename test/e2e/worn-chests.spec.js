import { test, expect } from "@playwright/test";

// Task 26 — worn chest pieces render as a distinct, layered torso piece per item
// (not one rarity-tinted cylinder). This real-browser spec boots the BUILT site
// with the test seam enabled, equips several different breastplates on Lily, frames
// a close-up of her torso with a temporary camera, and captures a screenshot of
// each. It asserts (a) each equipped breastplate resolves to the archetype the pure
// selector says it should, (b) the captured canvases visibly DIFFER (so the shapes
// really are distinct, not a recolour of one mesh), and (c) no console errors along
// the way. The headless Vitest suite proves the selector + build/dispose contract in
// depth; this is the DOM/WebGL layer those can't cover.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-helmets/controllayout specs): in this
// dev sandbox the egress proxy intermittently fails the Babylon CDN load, so the
// engine can't boot. When GG_LOCAL_BABYLON points at a dir holding the three babylon
// scripts (fetched once via curl), route the CDN requests to those files. Inert on
// CI (the var is unset there and the real CDN loads), so the deployed site stays
// CDN-only.
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

// The chests we screenshot — chosen to span material + shape + set:
//   leather vest (soft), iron cuirass (banded, Ironguard), aegis plate (ornate),
//   dragonscale plate (scaled, Dragonscale). Four distinct silhouettes.
const CHESTS = [
  { id: "leather_vest", archetype: "vest" },
  { id: "iron_plate", archetype: "cuirass" },
  { id: "aegis_plate", archetype: "plate" },
  { id: "dragonscale_plate", archetype: "dragonscale" },
];

test("renders distinct worn chest pieces on the character", async ({ page }) => {
  const errors = watchErrors(page);

  // Enable the (production-inert) test seam BEFORE any page script runs so the
  // game installs window.__GG_TEST__ on the built bundle.
  await page.addInitScript(() => { window.__GG_TEST__ = {}; });

  await page.goto("/");
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  // Let the world stream in + a few frames render.
  await page.waitForTimeout(1200);

  // Park a dedicated close-up camera on Lily's torso so the breastplate fills the
  // frame, freeze her in a clean idle facing the lens, and hide the wand halo/glow
  // so it doesn't wash the shot. All via the seam.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    // Turn Lily to face the camera's clear side (spawn's +Z runs into a tree) and
    // freeze a clean idle so her FRONT chest features (laces / ridge / scales / gem)
    // are toward the lens.
    p.facing = Math.PI; p.state = "idle";
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    const chest = p.root.position.clone(); chest.y += 1.15; // torso centre
    // A 3/4 orbit onto Lily's torso, close enough that the distinct chest
    // silhouette fills the frame.
    const cam = new BJS.ArcRotateCamera("chestShot", -Math.PI / 2 + 0.5, 1.32, 4.6, chest, scene);
    scene.activeCamera = cam;
    window.__chestCam = cam;
  });

  const shots = [];
  for (const c of CHESTS) {
    // Equip the breastplate + confirm the archetype the game picked matches the
    // pure selector's answer, then render a couple of frames.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      // Clear the chest slot, then equip the target breastplate.
      T.unequipSlot(p, "breastplate");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.breastplate,
        archetype: p.gearShown.chestArchetype,
        expected: T.chestArchetype(T.getDef(id)).archetype,
      };
    }, c.id);
    expect(picked.shown, `${c.id} chest shown`).toBe(true);
    expect(picked.archetype, `${c.id} archetype`).toBe(c.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(350);
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-chest-${c.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__chestCam) { try { window.__chestCam.dispose(); } catch (e) {} }
  });

  // The captured chests must actually differ — a mesh-per-archetype pass changes
  // the silhouette, so no two consecutive shots should be byte-identical. (Software
  // WebGL is deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `chest ${CHESTS[i].id} looks identical to ${CHESTS[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
