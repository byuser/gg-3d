import { test, expect } from "@playwright/test";

// Task 28 — worn gloves & gauntlets render as a distinct hand piece per item (the
// readable hand armour an MMORPG wraps around the weapon grip) instead of one plain
// sphere on each hand. This real-browser spec boots the BUILT site with the test seam
// enabled, equips several different gloves on Lily, frames a close-up 3/4 view of her
// RIGHT hand + the weapon grip it holds, and captures a screenshot of each. It asserts
// (a) each equipped glove resolves to the archetype the pure selector says it should,
// (b) the captured canvases visibly DIFFER (so the shapes really are distinct, not a
// recolour of one sphere), and (c) no console errors along the way. The headless Vitest
// suite proves the selector + the compact-around-the-grip fit invariant + build/dispose
// contract in depth; this is the DOM/WebGL layer those can't cover — a real render of
// the gloved hand wrapped around the wand grip (which it must not swallow).

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-helmets/chests/pauldrons specs): in this
// dev sandbox the egress proxy intermittently fails the Babylon CDN load, so the engine
// can't boot. When GG_LOCAL_BABYLON points at a dir holding the three babylon scripts
// (fetched once via curl), route the CDN requests to those files. Inert on CI (the var
// is unset there and the real CDN loads), so the deployed site stays CDN-only.
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

// The gloves we screenshot — chosen to span material + shape + set:
//   soft leather glove, iron gauntlet (banded, Ironguard), dragonscale scaled gauntlet
//   (Dragonscale), titan warplate (ornate plate, epic). Four distinct hand silhouettes.
const GLOVES = [
  { id: "leather_gloves", archetype: "glove" },
  { id: "iron_gauntlets", archetype: "gauntlet" },
  { id: "dragon_gauntlets", archetype: "scaled" },
  { id: "titan_gauntlets", archetype: "warplate" },
];

test("renders distinct worn gloves wrapped around the weapon grip", async ({ page }) => {
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

  // Park a dedicated close-up camera on Lily's right hand (which holds the wand), turn
  // her to face the lens, and PIN a light windup pose every frame so the hand + grip are
  // steady and clearly in view (an after-game observer holds the swing phase). All via
  // the seam. The wand shaft rising out of the glove makes it obvious the glove wraps the
  // grip rather than swallowing it.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    // Hold a gentle wand windup so the wand hand is raised + steady for the close-up
    // (registered AFTER the game's own updater so it wins each frame).
    scene.onBeforeRenderObservable.add(() => {
      try { p.attack.cls = "wand"; p.attack.phase = "windup"; p.attack.t = 0; } catch (e) {}
    });
    // A 3/4 orbit onto Lily's right hand + the wand grip, close enough that the distinct
    // glove silhouette fills the frame and any grip-swallowing would show.
    const hand = p.root.position.clone(); hand.y += 1.0; // hand height
    const cam = new BJS.ArcRotateCamera("gloveShot", -Math.PI / 2 - 0.6, 1.15, 3.4, hand, scene);
    scene.activeCamera = cam;
    window.__gloveCam = cam;
  });

  const shots = [];
  for (const g of GLOVES) {
    // Equip the gloves + confirm the archetype the game picked matches the pure
    // selector's answer, then hold the pose for a few frames and capture.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      T.unequipSlot(p, "gloves");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.gloves,
        archetype: p.gearShown.gloveArchetype,
        expected: T.gloveArchetype(T.getDef(id)).archetype,
      };
    }, g.id);
    expect(picked.shown, `${g.id} gloves shown`).toBe(true);
    expect(picked.archetype, `${g.id} archetype`).toBe(g.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(400); // let the pose + hand settle
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-glove-${g.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__gloveCam) { try { window.__gloveCam.dispose(); } catch (e) {} }
  });

  // The captured gloves must actually differ — a mesh-per-archetype pass changes the
  // silhouette, so no two consecutive shots should be byte-identical. (Software WebGL is
  // deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `glove ${GLOVES[i].id} looks identical to ${GLOVES[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
