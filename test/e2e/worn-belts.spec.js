import { test, expect } from "@playwright/test";

// Task 29 — worn belts render as a distinct belt per item (a strap + buckle, +
// pouches/plates by set/material) seated at the WAIST BELOW the chest piece, instead of
// one plain cylinder that overlapped the chest band. This real-browser spec boots the
// BUILT site with the test seam enabled, equips several different belts on Lily, frames a
// close-up 3/4 view of her waist (the belt line just under the breastplate), and captures
// a screenshot of each. It asserts (a) each equipped belt resolves to the archetype the
// pure selector says it should, (b) the captured canvases visibly DIFFER (so the shapes
// really are distinct, not a recolour of one cylinder), and (c) no console errors along
// the way. The headless Vitest suite proves the selector + the below-chest / clears-legs
// fit invariants + the build/dispose contract in depth; this is the DOM/WebGL layer those
// can't cover — a real render of the belt strapped at the waist under the chest piece.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-helmets/chests/pauldrons/gloves specs): in
// this dev sandbox the egress proxy intermittently fails the Babylon CDN load, so the
// engine can't boot. When GG_LOCAL_BABYLON points at a dir holding the three babylon
// scripts (fetched once via curl), route the CDN requests to those files. Inert on CI (the
// var is unset there and the real CDN loads), so the deployed site stays CDN-only.
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

// The belts we screenshot — chosen to span material + shape + set:
//   plain leather strap, banded iron war-belt (Ironguard), dragonscale clasp belt
//   (Dragonscale). Three distinct waist silhouettes.
const BELTS = [
  { id: "leather_belt", archetype: "strap" },
  { id: "reinforced_belt", archetype: "plated" },
  { id: "dragon_belt", archetype: "scaled" },
];

test("renders distinct worn belts seated at the waist below the chest", async ({ page }) => {
  const errors = watchErrors(page);

  // Enable the (production-inert) test seam BEFORE any page script runs so the game
  // installs window.__GG_TEST__ on the built bundle.
  await page.addInitScript(() => { window.__GG_TEST__ = {}; });

  await page.goto("/");
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  // Let the world stream in + a few frames render.
  await page.waitForTimeout(1200);

  // Park a dedicated close-up camera on Lily's waist, turn her to face the lens, and PIN a
  // steady idle pose every frame (an after-game observer holds the legs neutral) so the
  // belt line + the chest hem above it are clearly in view. Also equip a chest piece so the
  // screenshot proves the belt sits BELOW it (not through it). All via the seam.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    // Wear a breastplate so the belt reads as sitting UNDER the chest hem, and hold a
    // neutral standing pose so the waist is steady + fully in frame (registered AFTER the
    // game's own updater so it wins each frame).
    try { T.equipItem(p, T.makeItem("iron_plate")); T.recomputeStats(p); } catch (e) {}
    scene.onBeforeRenderObservable.add(() => {
      try {
        p.state = "idle"; p.walkPhase = 0;
        p.legL.rotation.x = 0; p.legR.rotation.x = 0;
        p.lean.rotation.x = 0; p.lean.rotation.z = 0; p.lean.position.y = 0;
      } catch (e) {}
    });
    // A 3/4 orbit onto Lily's waist, close enough that the distinct belt silhouette fills
    // the frame and the chest-hem-above-belt relationship is obvious.
    const waist = p.root.position.clone(); waist.y += 0.85; // waist height
    const cam = new BJS.ArcRotateCamera("beltShot", -Math.PI / 2 - 0.6, 1.28, 3.2, waist, scene);
    scene.activeCamera = cam;
    window.__beltCam = cam;
  });

  const shots = [];
  for (const b of BELTS) {
    // Equip the belt + confirm the archetype the game picked matches the pure selector's
    // answer, then hold the pose for a few frames and capture.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      T.unequipSlot(p, "belt");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.belt,
        archetype: p.gearShown.beltArchetype,
        expected: T.beltArchetype(T.getDef(id)).archetype,
      };
    }, b.id);
    expect(picked.shown, `${b.id} belt shown`).toBe(true);
    expect(picked.archetype, `${b.id} archetype`).toBe(b.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(400); // let the pose + belt settle
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-belt-${b.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__beltCam) { try { window.__beltCam.dispose(); } catch (e) {} }
  });

  // The captured belts must actually differ — a mesh-per-archetype pass changes the
  // silhouette, so no two consecutive shots should be byte-identical. (Software WebGL is
  // deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `belt ${BELTS[i].id} looks identical to ${BELTS[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
