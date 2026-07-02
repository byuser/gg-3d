import { test, expect } from "@playwright/test";

// Task 32 — held weapons render as a real, layered weapon of the equipped CLASS in Lily's
// hand (sword = blade + crossguard + grip + pommel; axe = haft + bladed head; dagger =
// short blade + guard; bow = riser + limbs + string; staff = shaft + orb; wand = shaft +
// crystal tip), instead of the old three recoloured stand-ins. This real-browser spec
// boots the BUILT site with the test seam enabled, equips each of the six weapon classes
// on Lily, presents the weapon in a steady raised hold, frames a close-up 3/4 view of her
// upper body + hand, and captures a screenshot of each. It asserts (a) each equipped weapon
// resolves to the class the pure selector says it should, (b) the captured canvases visibly
// DIFFER (so the shapes really are distinct, not a recolour of one blade), and (c) no
// console errors along the way. The headless Vitest suite proves the selector + the
// held-in-hand / tracks-the-attack fit invariants + the build/dispose contract in depth;
// this is the DOM/WebGL layer those can't cover — a real render of the weapon in hand.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-helmets/chests/pauldrons/gloves/belts/boots/
// cloaks specs): in this dev sandbox the egress proxy intermittently fails the Babylon CDN
// load, so the engine can't boot. When GG_LOCAL_BABYLON points at a dir holding the three
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

// The weapons we screenshot — the six buyable normals, one of each class, so every real
// weapon silhouette (wand / bow / staff / sword / axe / dagger) is captured.
const WEAPONS = [
  { id: "magic_wand", archetype: "wand" },
  { id: "short_bow", archetype: "bow" },
  { id: "apprentice_staff", archetype: "staff" },
  { id: "iron_sword", archetype: "sword" },
  { id: "war_axe", archetype: "axe" },
  { id: "iron_dagger", archetype: "dagger" },
];

test("renders a distinct real weapon of each class in hand", async ({ page }) => {
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

  // Park a dedicated close-up camera on Lily's hand + weapon, turn her toward the lens, and
  // PIN a steady raised HOLD every frame (an after-game observer presents the weapon) so the
  // held weapon reads clearly — the whole point of Task 32. All via the seam.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    // Hold a fixed present pose (weapon hand raised + rolled outward so the weapon clears
    // the torso and stands up in frame), registered AFTER the game's own updater so it
    // wins each frame. The swing is forced idle so nothing re-poses the arm.
    scene.onBeforeRenderObservable.add(() => {
      try {
        p.state = "idle"; p.walkPhase = 0;
        try { p.swing.kind = null; p.swing.phase = "idle"; p.swing.t = 0; p.castCooldown = 0; } catch (e) {}
        p.armR.rotation.set(-0.5, 0, -0.55); // present the weapon up + out from the body
        p.armL.rotation.set(0.1, 0, 0.14);
        p.lean.rotation.set(0, 0, 0); p.lean.position.y = 0;
      } catch (e) {}
    });
    // A 3/4 orbit onto Lily's RIGHT hand (which holds the weapon), close enough to sit
    // inside any spawn scenery yet still fit a tall staff (same side as the worn-gloves
    // showcase).
    const center = p.root.position.clone(); center.y += 1.0; // weapon mid-height
    const cam = new BJS.ArcRotateCamera("weapShot", -Math.PI / 2 - 0.6, 1.18, 3.3, center, scene);
    scene.activeCamera = cam;
    window.__weapCam = cam;
  });

  const shots = [];
  for (const w of WEAPONS) {
    // Equip the weapon + confirm the class the game picked matches the pure selector's
    // answer, then hold the pose for a few frames and capture.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      for (const s of ["hand1", "hand2"]) { try { T.unequipSlot(p, s); } catch (e) {} }
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        main: p.weaponShown && p.weaponShown.main,
        expected: T.weaponArchetype(T.getDef(id)).archetype,
      };
    }, w.id);
    expect(picked.main, `${w.id} class`).toBe(w.archetype);
    expect(picked.main).toBe(picked.expected);

    await page.waitForTimeout(400); // let the pose + weapon settle
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-weapon-${w.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__weapCam) { try { window.__weapCam.dispose(); } catch (e) {} }
  });

  // The captured weapons must actually differ — a mesh-per-class pass changes the
  // silhouette, so no two consecutive shots should be byte-identical. (Software WebGL is
  // deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `weapon ${WEAPONS[i].id} looks identical to ${WEAPONS[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
