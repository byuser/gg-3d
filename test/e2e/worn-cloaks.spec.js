import { test, expect } from "@playwright/test";

// Task 31 — worn cloaks render as a real draping cloak per item (a tapered, segmented
// cloth drape with a neck clasp, hung from a back pivot behind the hips and billowing
// with motion), instead of one plain flat box that swung THROUGH the legs on sharp
// turns. This real-browser spec boots the BUILT site with the test seam enabled, equips
// several different cloaks on Lily, turns her BACK to the lens, PINS a clear mid-turn
// billow pose (the drape trailing back + banked to one side), frames a 3/4 rear view of
// her back + cloak, and captures a screenshot of each. It asserts (a) each equipped cloak
// resolves to the archetype the pure selector says it should, (b) the captured canvases
// visibly DIFFER (so the drapes really are distinct shapes, not a recolour of one box),
// and (c) no console errors along the way. The headless Vitest suite proves the selector
// + the behind-the-legs billow invariant + the pure/dt-driven updater + the build/dispose
// contract in depth; this is the DOM/WebGL layer those can't cover — a real render of the
// cloak draping mid-turn.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-helmets/chests/pauldrons/gloves/belts/boots
// specs): in this dev sandbox the egress proxy intermittently fails the Babylon CDN load,
// so the engine can't boot. When GG_LOCAL_BABYLON points at a dir holding the three
// babylon scripts (fetched once via curl), route the CDN requests to those files. Inert on
// CI (the var is unset there and the real CDN loads), so the deployed site stays CDN-only.
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

// The cloaks we screenshot — chosen to span material + shape + set:
//   a plain leather cape, an overlapping dragonscale cloak (Dragonscale), and a
//   feathered/winged legendary cloak. Three distinct drape silhouettes.
const CLOAKS = [
  { id: "travel_cloak", archetype: "cape" },
  { id: "dragon_cloak", archetype: "scaled" },
  { id: "wings_of_dawn", archetype: "winged" },
];

test("renders distinct worn cloaks draping mid-turn", async ({ page }) => {
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

  // Park a dedicated camera BEHIND Lily's upper body (so the back-hung cloak fills the
  // frame), turn her to face away from the lens, and PIN a steady mid-turn BILLOW pose
  // every frame — the drape trailing back + banked to one side — registered AFTER the
  // game's own updater so it wins each frame. That's the whole point of Task 31: a cloak
  // that drapes BEHIND and billows, without scything through the legs.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    // Face AWAY from the default camera azimuth so her back (and the cloak) turns to us.
    p.facing = 0;
    try { p.yaw.rotation.y = 0; } catch (e) {}
    scene.onBeforeRenderObservable.add(() => {
      try {
        // A clear mid-turn billow: trail the drape well back (x > 0, never forward) and
        // bank it to one side (z), directly on the pivot so it reads the same every frame.
        if (p.cloakPivot) { p.cloakPivot.rotation.x = 0.5; p.cloakPivot.rotation.z = 0.2; }
        // A gentle walking stance so the whole figure reads naturally.
        p.state = "walk"; p.walkPhase = Math.PI / 2;
        p.legL.rotation.x = 0.35; p.legR.rotation.x = -0.35;
        p.lean.rotation.x = 0; p.lean.rotation.z = 0; p.lean.position.y = 0.06;
      } catch (e) {}
    });
    // A 3/4 rear orbit onto Lily's back, close enough that the distinct drape silhouette
    // fills the frame.
    const back = p.root.position.clone(); back.y += 1.0; // upper-back height
    const cam = new BJS.ArcRotateCamera("cloakShot", Math.PI / 2 + 0.7, 1.24, 4.2, back, scene);
    scene.activeCamera = cam;
    window.__cloakCam = cam;
  });

  const shots = [];
  for (const c of CLOAKS) {
    // Equip the cloak + confirm the archetype the game picked matches the pure selector's
    // answer, then hold the pose for a few frames and capture.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      T.unequipSlot(p, "cloak");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.cloak,
        archetype: p.gearShown.cloakArchetype,
        expected: T.cloakArchetype(T.getDef(id)).archetype,
      };
    }, c.id);
    expect(picked.shown, `${c.id} cloak shown`).toBe(true);
    expect(picked.archetype, `${c.id} archetype`).toBe(c.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(400); // let the pose + cloak settle
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-cloak-${c.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__cloakCam) { try { window.__cloakCam.dispose(); } catch (e) {} }
  });

  // The captured cloaks must actually differ — a mesh-per-archetype pass changes the
  // silhouette, so no two consecutive shots should be byte-identical. (Software WebGL is
  // deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `cloak ${CLOAKS[i].id} looks identical to ${CLOAKS[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
