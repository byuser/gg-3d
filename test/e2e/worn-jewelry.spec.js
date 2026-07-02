import { test, expect } from "@playwright/test";

// Task 33 — necklaces & rings now render a subtle worn mesh ON the character (a chain +
// pendant at the throat, a slim gem-set band on the hand) instead of being equipped-but-
// invisible like every other slot. Jewelry is deliberately HIGH-TIER ONLY (the task hint:
// "high-tier-only so phones skip it"), so this real-browser spec adapts to the tier the
// engine actually resolves:
//   • where the high tier is active (a capable desktop) it equips several necklaces (then
//     several rings on the bare hand), frames a view of Lily, screenshots each, and asserts
//     each equipped piece resolves to the archetype the pure selector says it should AND
//     the captured canvases DIFFER (the render changes per item, not one frozen frame);
//   • where jewelry is omitted (the Galaxy S24 phone tiers, or any medium/low device) it
//     asserts equipping a necklace + rings never throws and the character still renders —
//     graceful degradation on the phone budget.
// Either way it asserts no console errors. The headless Vitest suite proves the selector +
// the in-front-of-the-chest / at-the-hand fit invariant + build/dispose/tier-gate contract
// in depth; this is the DOM/WebGL layer those can't cover.

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

async function boot(page) {
  await page.addInitScript(() => { window.__GG_TEST__ = {}; });
  await page.goto("/");
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await page.waitForTimeout(1200); // let the world stream in + a few frames render
}

// Whether jewelry was actually built (true only when the engine resolved the high tier).
async function jewelryBuilt(page) {
  return page.evaluate(() => !!(window.__GG_TEST__.player.gear && window.__GG_TEST__.player.gear.necklaces));
}

// The necklaces we screenshot — a green vigor pendant, a gold coin pendant (same shape,
// different signature gem) and a blue titan medallion amulet: two distinct silhouettes +
// three distinct stones.
const NECKLACES = [
  { id: "amulet_vigor", archetype: "pendant" },
  { id: "coin_amulet", archetype: "pendant" },
  { id: "titan_pendant", archetype: "amulet" },
];
// The rings we screenshot — a plain ruby band, a gold blood signet, a violet claw-set
// gemband: three distinct hand silhouettes.
const RINGS = [
  { id: "ring_power", archetype: "band" },
  { id: "vampiric_ring", archetype: "signet" },
  { id: "seraph_ring", archetype: "gemband" },
];

test("renders distinct worn necklaces at the throat (or omits them cleanly off the high tier)", async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page);

  if (!(await jewelryBuilt(page))) {
    // Off the high tier jewelry is intentionally skipped. Equipping it must never throw and
    // the character must keep rendering — a clean, graceful omission on the phone budget.
    const ok = await page.evaluate(() => {
      const T = window.__GG_TEST__;
      const p = T.player;
      for (const id of ["amulet_vigor", "titan_pendant"]) {
        T.unequipSlot(p, "necklace");
        T.equipItem(p, T.makeItem(id));
        T.recomputeStats(p);
        if (p.equipment.necklace.id !== id) return false; // still tracks the equipped item
      }
      return true;
    });
    expect(ok, "equipping a necklace off the high tier is a clean no-op").toBe(true);
    await page.waitForTimeout(300);
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
    return;
  }

  // High tier: jewelry is built + rendered. Face Lily to the lens, strip her chest/gloves so
  // nothing occludes the necklace, and pin a steady idle so the throat is clear + steady.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    for (const slot of ["breastplate", "cloak", "gloves"]) { try { T.unequipSlot(p, slot); } catch (e) {} }
    try { T.recomputeStats(p); } catch (e) {}
    scene.onBeforeRenderObservable.add(() => {
      try { p.state = "idle"; p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0); } catch (e) {}
    });
    const throat = p.root.position.clone(); throat.y += 1.5; // the necklace anchor height
    const cam = new BJS.ArcRotateCamera("neckShot", -Math.PI / 2, 1.3, 2.4, throat, scene);
    scene.activeCamera = cam;
    window.__neckCam = cam;
  });

  const shots = [];
  for (const n of NECKLACES) {
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      T.unequipSlot(p, "necklace");
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      return {
        shown: p.gearShown.necklace,
        archetype: p.gearShown.necklaceArchetype,
        expected: T.jewelryArchetype(T.getDef(id)).archetype,
      };
    }, n.id);
    expect(picked.shown, `${n.id} necklace shown`).toBe(true);
    expect(picked.archetype, `${n.id} archetype`).toBe(n.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(400);
    const buf = await page.locator("#renderCanvas").screenshot({ path: `test-results/worn-necklace-${n.id}.png` });
    shots.push(buf);
  }

  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__neckCam) { try { window.__neckCam.dispose(); } catch (e) {} }
  });

  // The captured necklaces must actually differ — the render changes as the equipped piece
  // (mesh + gem colour) changes, so no two consecutive shots are byte-identical.
  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `necklace ${NECKLACES[i].id} looks identical to ${NECKLACES[i - 1].id}`,
    ).toBe(true);
  }
  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});

test("renders distinct worn rings on the bare hand (or omits them cleanly off the high tier)", async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page);

  if (!(await jewelryBuilt(page))) {
    const ok = await page.evaluate(() => {
      const T = window.__GG_TEST__;
      const p = T.player;
      try { T.unequipSlot(p, "gloves"); } catch (e) {}
      for (const id of ["ring_power", "seraph_ring"]) {
        T.equipItem(p, T.makeItem(id));
        T.recomputeStats(p);
      }
      return !!(p.equipment.ring1 && p.equipment.ring2);
    });
    expect(ok, "equipping rings off the high tier is a clean no-op").toBe(true);
    await page.waitForTimeout(300);
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
    return;
  }

  // ring1 rides the LEFT hand. Strip gloves (rings only show on a bare hand), face the
  // lens, pin the left arm at rest so the hand is steady, then frame Lily's left hand.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
    p.facing = Math.PI;
    try { p.yaw.rotation.y = Math.PI; } catch (e) {}
    try { T.unequipSlot(p, "gloves"); } catch (e) {}
    T.unequipSlot(p, "ring1"); T.unequipSlot(p, "ring2");
    T.equipItem(p, T.makeItem("ring_power")); // → ring1, left hand
    T.recomputeStats(p);
    scene.onBeforeRenderObservable.add(() => {
      try { p.state = "idle"; p.armL.rotation.set(0, 0, 0); } catch (e) {}
    });
    const hand = p.root.position.clone(); hand.x -= 0.32; hand.y += 0.85; // Lily's left hand
    const cam = new BJS.ArcRotateCamera("ringShot", -Math.PI / 2 - 0.5, 1.3, 1.7, hand, scene);
    scene.activeCamera = cam;
    window.__ringCam = cam;
  });

  const shots = [];
  for (const r of RINGS) {
    const picked = await page.evaluate((id) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      T.unequipSlot(p, "ring1"); T.unequipSlot(p, "ring2");
      T.equipItem(p, T.makeItem(id)); // → ring1 (left hand)
      T.recomputeStats(p);
      return {
        shown: p.gearShown.ring1,
        archetype: p.gearShown.ring1Archetype,
        expected: T.jewelryArchetype(T.getDef(id)).archetype,
      };
    }, r.id);
    expect(picked.shown, `${r.id} ring shown`).toBe(true);
    expect(picked.archetype, `${r.id} archetype`).toBe(r.archetype);
    expect(picked.archetype).toBe(picked.expected);

    await page.waitForTimeout(400);
    const buf = await page.locator("#renderCanvas").screenshot({ path: `test-results/worn-ring-${r.id}.png` });
    shots.push(buf);
  }

  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__ringCam) { try { window.__ringCam.dispose(); } catch (e) {} }
  });

  for (let i = 1; i < shots.length; i++) {
    expect(
      Buffer.compare(shots[i], shots[i - 1]) !== 0,
      `ring ${RINGS[i].id} looks identical to ${RINGS[i - 1].id}`,
    ).toBe(true);
  }
  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
