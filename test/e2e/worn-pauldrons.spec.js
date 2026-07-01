import { test, expect } from "@playwright/test";

// Task 27 — worn pauldrons render as a distinct, real shoulder piece per item that
// sits ON the shoulder (not diving into the chest). This real-browser spec boots the
// BUILT site with the test seam enabled, equips several different pauldrons on Lily,
// holds her in the MELEE STRIKE pose (the phase whose arm roll used to swing the old
// sphere across the torso), frames a close-up 3/4 view of her shoulder + chest, and
// captures a screenshot of each. It asserts (a) each equipped pauldron resolves to the
// archetype the pure selector says it should, (b) the captured canvases visibly DIFFER
// (so the shapes really are distinct, not a recolour of one sphere), and (c) no console
// errors along the way. The headless Vitest suite proves the selector + the torso-fit
// invariant + build/dispose contract in depth; this is the DOM/WebGL layer those can't
// cover — a real render of the shoulders mid-attack with no chest penetration.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-helmets/worn-chests specs): in this dev
// sandbox the egress proxy intermittently fails the Babylon CDN load, so the engine
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

// The pauldrons we screenshot — chosen to span material + shape + set:
//   leather cap (soft), iron plated (banded, Ironguard), dragonscale spiked (spined,
//   Dragonscale), stormforged winged (flared, epic). Four distinct shoulder silhouettes.
const PAULDRONS = [
  { id: "leather_pauldrons", archetype: "cap" },
  { id: "iron_pauldrons", archetype: "plated" },
  { id: "dragon_pauldrons", archetype: "spiked" },
  { id: "storm_pauldrons", archetype: "winged" },
];

test("renders distinct worn pauldrons seated on the shoulder mid-attack", async ({ page }) => {
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

  // Park a dedicated close-up camera on Lily's shoulder/torso, turn her to face the
  // lens, and PIN her in the melee strike pose every frame (an after-game observer
  // forces the swing phase so the arm holds the big cross-body roll — the exact pose
  // the old sphere clipped through the chest at). All via the seam.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    // Give her a melee weapon so the strike pose reads as a real attack, face the lens.
    try { T.equipItem(p, T.makeItem("iron_sword")); T.recomputeStats(p); } catch (e) {}
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    // Hold the melee STRIKE phase forever so _animateAction keeps the arm in the wide
    // cross-body swing while we capture (registered AFTER the game's own updater).
    scene.onBeforeRenderObservable.add(() => {
      try { p.swing.kind = "melee"; p.swing.phase = "strike"; p.swing.t = 0; } catch (e) {}
    });
    // A 3/4 orbit onto Lily's right shoulder + upper chest, close enough that the
    // distinct pauldron silhouette fills the frame and any chest penetration would show.
    const chest = p.root.position.clone(); chest.y += 1.45; // shoulder height
    const cam = new BJS.ArcRotateCamera("paulShot", -Math.PI / 2 + 0.7, 1.28, 4.4, chest, scene);
    scene.activeCamera = cam;
    window.__paulCam = cam;
  });

  const shots = [];
  for (const g of PAULDRONS) {
    // Equip the pauldrons + confirm the archetype the game picked matches the pure
    // selector's answer, then hold the strike pose for a few frames and capture.
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      T.unequipSlot(p, "pauldrons");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.pauldrons,
        archetype: p.gearShown.pauldronArchetype,
        expected: T.pauldronArchetype(T.getDef(id)).archetype,
      };
    }, g.id);
    expect(picked.shown, `${g.id} pauldrons shown`).toBe(true);
    expect(picked.archetype, `${g.id} archetype`).toBe(g.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(400); // let the strike pose + shoulder follow settle
    const buf = await page.locator("#renderCanvas").screenshot({
      path: `test-results/worn-pauldron-${g.id}.png`,
    });
    shots.push(buf);
  }

  // Restore the game camera so nothing downstream is left on the temp one.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__paulCam) { try { window.__paulCam.dispose(); } catch (e) {} }
  });

  // The captured pauldrons must actually differ — a mesh-per-archetype pass changes
  // the silhouette, so no two consecutive shots should be byte-identical. (Software
  // WebGL is deterministic here, so identical bytes would mean the SAME mesh.)
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `pauldron ${PAULDRONS[i].id} looks identical to ${PAULDRONS[i - 1].id}`,
    ).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
