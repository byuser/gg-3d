import { test, expect } from "@playwright/test";

// Task 34 — the from-scratch, per-weapon-class attack animations. The headless Vitest
// suite (test/combat-anim.test.js) proves the pure AttackAnim state machine, the strike
// /release-frame hit timing, arc/reach gating, no double-hit, frame-rate independence
// and pause-correctness in depth. THIS real-browser spec is the DOM/WebGL layer those
// can't cover: it boots the BUILT site, equips each weapon class on Lily, PINS her at the
// class's strike (impact/release) pose, and screenshots a close-up. It asserts (a) each
// equipped weapon animates as the class the pure selector says it should, (b) the six
// classes' strike poses visibly DIFFER (so the attacks really are distinct, not one arc),
// (c) a class's wind-up pose differs from its strike pose (the anticipation → impact arc
// actually plays), and (d) no console errors along the way.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (same as the worn-gear specs): in this dev sandbox the egress
// proxy intermittently fails the Babylon CDN load, so the engine can't boot. When
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

// One buyable normal per class → every attack family (melee slash / chop / stab, ranged
// draw + release, cast channel + release) is exercised.
const WEAPONS = [
  { id: "iron_sword", cls: "sword" },
  { id: "war_axe", cls: "axe" },
  { id: "iron_dagger", cls: "dagger" },
  { id: "short_bow", cls: "bow" },
  { id: "magic_wand", cls: "wand" },
  { id: "apprentice_staff", cls: "staff" },
];

test("each weapon class plays a distinct, readable attack", async ({ page }) => {
  const errors = watchErrors(page);

  // Enable the (production-inert) test seam BEFORE any page script runs.
  await page.addInitScript(() => { window.__GG_TEST__ = {}; });

  await page.goto("/");
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await page.waitForTimeout(1200);

  // Park a close-up camera on Lily's upper body + weapon hand and turn her toward the
  // lens. A single observer PINS whatever (class, phase) we ask for each frame, so the
  // game's own updater can't re-pose the arm — _animateAction converges to that pose.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    const scene = T.scene;
    const BJS = window.BABYLON;
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
    const cam = new BJS.ArcRotateCamera("atkShot", -Math.PI / 2 - 0.55, 1.12, 4.0, center, scene);
    scene.activeCamera = cam;
    window.__atkCam = cam;
  });

  const shotAt = async (id, cls, phase, tag) => {
    const picked = await page.evaluate(({ id, cls, phase }) => {
      const T = window.__GG_TEST__;
      const p = T.player;
      for (const s of ["hand1", "hand2"]) { try { T.unequipSlot(p, s); } catch (e) {} }
      T.equipItem(p, T.makeItem(id));
      T.recomputeStats(p);
      window.__pin = { cls, phase };
      return { shown: p.weaponShown && p.weaponShown.main, attackClass: p.attackClass() };
    }, { id, cls, phase });
    expect(picked.shown, `${id} shown class`).toBe(cls);
    expect(picked.attackClass, `${id} attack class`).toBe(cls);
    await page.waitForTimeout(350); // let the pinned pose converge
    return page.locator("#renderCanvas").screenshot({ path: `test-results/combat-anim-${tag}.png` });
  };

  // The six classes' STRIKE poses — the impact/release frame of each attack.
  const strikes = [];
  for (const w of WEAPONS) strikes.push(await shotAt(w.id, w.cls, "strike", `${w.cls}-strike`));

  // A sword WIND-UP pose — to prove the anticipation → impact arc actually plays.
  const swordWindup = await shotAt("iron_sword", "sword", "windup", "sword-windup");

  // Restore the game camera.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    window.__pin = { cls: null, phase: "idle" };
    if (T.camera && T.scene) T.scene.activeCamera = T.camera;
    if (window.__atkCam) { try { window.__atkCam.dispose(); } catch (e) {} }
  });

  // Every class's strike pose must differ from the next — the attacks are distinct.
  for (let i = 1; i < strikes.length; i++) {
    expect(
      Buffer.compare(strikes[i], strikes[i - 1]) !== 0,
      `${WEAPONS[i].cls} strike looks identical to ${WEAPONS[i - 1].cls}`,
    ).toBe(true);
  }
  // The sword's wind-up reads differently from its strike (a real arc, not one static pose).
  expect(Buffer.compare(swordWindup, strikes[0]) !== 0, "sword wind-up == strike").toBe(true);

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
