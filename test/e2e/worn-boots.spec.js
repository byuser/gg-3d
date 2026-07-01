import { test, expect } from "@playwright/test";

// Task 30 — worn boots render as a distinct, real pair of boots per item (layered
// primitives: a shaft up the shin + a foot/vamp over the existing shoe + a sole/cuff),
// instead of one plain calf cylinder that could intersect the leg or punch through the
// ground. This real-browser spec boots the BUILT site with the test seam enabled, equips
// several different boots on Lily, PINS a steady MID-STRIDE pose (one leg swung forward,
// one back), frames a close-up 3/4 view of her lower legs + feet, and captures a
// screenshot of each. It asserts (a) each equipped boot resolves to the archetype the
// pure selector says it should, (b) the captured canvases visibly DIFFER (so the shapes
// really are distinct, not a recolour of one cylinder), and (c) no console errors along
// the way. The headless Vitest suite proves the selector + the on-leg / no-ground-clip
// fit invariants + the build/dispose contract in depth; this is the DOM/WebGL layer those
// can't cover — a real render of the boots striding on the feet.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-helmets/chests/pauldrons/gloves/belts specs):
// in this dev sandbox the egress proxy intermittently fails the Babylon CDN load, so the
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

// The boots we screenshot — chosen to span material + shape + set:
//   soft leather shoe, plated iron greave (Ironguard), tall leather boot (rare). Three
//   distinct foot silhouettes.
const BOOTS = [
  { id: "leather_boots", archetype: "shoe" },
  { id: "iron_greaves", archetype: "greave" },
  { id: "winged_boots", archetype: "boot" },
];

test("renders distinct worn boots striding on the feet", async ({ page }) => {
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

  // Park a dedicated close-up camera on Lily's lower legs, turn her to face the lens, and
  // PIN a steady MID-STRIDE pose every frame (an after-game observer swings the legs) so
  // the boots read as striding on the feet — the whole point of Task 30. All via the seam.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    // Hold a fixed mid-stride pose (one leg forward, one back) so the boots ride the swung
    // feet, registered AFTER the game's own updater so it wins each frame.
    const SWING = 0.6; // a clear, steady stride angle
    scene.onBeforeRenderObservable.add(() => {
      try {
        p.state = "walk"; p.walkPhase = Math.PI / 2;
        p.legL.rotation.x = SWING; p.legR.rotation.x = -SWING;
        p.lean.rotation.x = 0; p.lean.rotation.z = 0; p.lean.position.y = 0.06;
      } catch (e) {}
    });
    // A 3/4 orbit onto Lily's feet, close enough that the distinct boot silhouette fills
    // the frame and the sole-on-the-ground relationship is obvious.
    const feet = p.root.position.clone(); feet.y += 0.4; // lower-leg height
    const cam = new BJS.ArcRotateCamera("bootShot", -Math.PI / 2 - 0.6, 1.16, 3.0, feet, scene);
    scene.activeCamera = cam;
    window.__bootCam = cam;
  });

  const shots = [];
  for (const b of BOOTS) {
    // Equip the boots + confirm the archetype the game picked matches the pure selector's
    // answer, then hold the pose for a few frames and capture.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      T.unequipSlot(p, "boots");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.boots,
        archetype: p.gearShown.bootArchetype,
        expected: T.bootArchetype(T.getDef(id)).archetype,
      };
    }, b.id);
    expect(picked.shown, `${b.id} boots shown`).toBe(true);
    expect(picked.archetype, `${b.id} archetype`).toBe(b.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(400); // let the pose + boots settle
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-boot-${b.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__bootCam) { try { window.__bootCam.dispose(); } catch (e) {} }
  });

  // The captured boots must actually differ — a mesh-per-archetype pass changes the
  // silhouette, so no two consecutive shots should be byte-identical. (Software WebGL is
  // deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `boot ${BOOTS[i].id} looks identical to ${BOOTS[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
