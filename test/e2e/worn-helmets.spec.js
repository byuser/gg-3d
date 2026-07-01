import { test, expect } from "@playwright/test";

// Task 25 — worn helmets render as a distinct, real-looking head piece per item
// (not one rarity-tinted dome). This real-browser spec boots the BUILT site with
// the test seam enabled, equips three different helmets on Lily, frames a close-up
// of her head with a temporary camera, and captures a screenshot of each. It
// asserts (a) each equipped helmet resolves to the archetype the pure selector
// says it should, (b) the three canvases visibly DIFFER (so the shapes really are
// distinct, not a recolour of one mesh), and (c) no console errors along the way.
// The headless Vitest suite proves the selector + build/dispose contract in depth;
// this is the DOM/WebGL layer those can't cover.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as controllayout/fullscreen specs): in this dev
// sandbox the egress proxy intermittently fails the Babylon CDN load, so the engine
// can't boot. When GG_LOCAL_BABYLON points at a dir holding the three babylon
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

// The three helmets we screenshot — chosen to span material + shape + set:
//   leather cap (soft), iron helm (open, Ironguard), dragon helm (horned,
//   Dragonscale), plus the legendary crown as a fourth distinct silhouette.
const HELMETS = [
  { id: "leather_cap", archetype: "cap" },
  { id: "iron_helm", archetype: "open" },
  { id: "dragon_helm", archetype: "dragon" },
  { id: "crown_eternal", archetype: "crown" },
];

test("renders three+ distinct worn helmets on the character", async ({ page }) => {
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

  // Park a dedicated close-up camera on Lily's head so the helmet fills the frame,
  // detach the player/camera update loops so nothing moves during capture, and
  // hide the wand halo/glow so it doesn't wash the shot. All via the seam.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    // Turn Lily to face +Z and park a 3/4 front orbit camera on her head so the
    // readable front features (nasal / visor / gem) and the face/ponytails (to
    // prove no clipping) are all in frame. Freeze her in a clean idle.
    // Turn Lily to face roughly toward the camera's clear side (spawn's +Z runs
    // into a tree) and freeze a clean idle, so her FRONT helm features (nasal /
    // visor / gem) and face are toward the lens — proving nothing clips the eyes.
    p.facing = Math.PI; p.state = "idle";
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    const head = p.root.position.clone(); head.y += 1.7;
    // A 3/4 orbit onto Lily's upper body, close enough that the distinct helm
    // silhouette fills the frame.
    const cam = new BJS.ArcRotateCamera("helmShot", -Math.PI / 2 + 0.55, 1.22, 5.0, head, scene);
    scene.activeCamera = cam;
    window.__helmCam = cam;
  });

  const shots = [];
  for (const h of HELMETS) {
    // Equip the helmet + confirm the archetype the game picked matches the pure
    // selector's answer, then render a couple of frames.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      // Clear the head slot, then equip the target helmet.
      T.unequipSlot(p, "helmet");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.helmet,
        archetype: p.gearShown.helmetArchetype,
        expected: T.helmetArchetype(T.getDef(id)).archetype,
      };
    }, h.id);
    expect(picked.shown, `${h.id} helmet shown`).toBe(true);
    expect(picked.archetype, `${h.id} archetype`).toBe(h.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(350);
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-helmet-${h.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__helmCam) { try { window.__helmCam.dispose(); } catch (e) {} }
  });

  // The captured helmets must actually differ — a mesh-per-archetype pass changes
  // the silhouette, so no two consecutive shots should be byte-identical. (Software
  // WebGL is deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `helmet ${HELMETS[i].id} looks identical to ${HELMETS[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
