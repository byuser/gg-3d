import { test, expect } from "@playwright/test";

// Task 36 — Customizable on-screen control layout. Real-browser drag test over the
// BUILT site at the Galaxy S24 Ultra profile (touch + Pointer Events): open the
// control-layout editor from pause → settings → Controls, DRAG the joystick handle
// to a new spot, SAVE, RELOAD, and assert the joystick restored to its saved
// position; then assert a control dragged hard past the edge can NOT be dropped
// off-screen (it is clamped into the safe area). The pure layout reducer / clamp +
// the save/load round-trip + the pre-v14 migration + the localStorage mirror are
// covered headlessly by test/controllayout.test.js; this proves the real drag →
// persist → restore loop and the on-screen clamp in a live browser. Mirrors the
// boot/UI-driving conventions of responsive.spec.js (Babylon from its CDN).

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch: in this dev sandbox the egress proxy intermittently
// fails the Babylon CDN load for the mobile UA, so the engine can't boot offline.
// When GG_LOCAL_BABYLON points at a directory holding the three babylon scripts
// (fetched once via curl, which the proxy allows), route the CDN requests to those
// files so the full drag loop can be validated locally. Inert on CI (the var is
// unset there and the real CDN loads), so the deployed site stays CDN-only.
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

// Boot to the HUD the proven way (responsive.spec.js): wait for the engine to
// enable Start (scene.executeWhenReady), click it, and wait for the HUD to show.
async function bootToHud(page) {
  await page.goto("/");
  await expect(page.locator("#startBtn")).toBeEnabled({ timeout: 60_000 });
  await page.locator("#startBtn").click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
}

// Open the editor through the real pause → settings → Controls entry button. The
// pause menu is a scroll container, so force the <details> open and dispatch the
// clicks via the DOM (mirrors the other mobile specs) rather than fighting
// actionability on the small viewport.
async function openEditor(page) {
  await page.locator("#pauseBtn").dispatchEvent("click");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await page.evaluate(() => {
    document.querySelectorAll("#pauseMenu details.sub-panel").forEach((d) => { d.open = true; });
  });
  await page.locator("#layoutEditBtnP").dispatchEvent("click");
  await expect(page.locator("#layoutEditor")).not.toHaveClass(/hidden/);
  await expect(page.locator("#layoutEditor")).not.toHaveClass(/no-drag/); // touch device → draggable
  await expect(page.locator(".layout-handle")).toHaveCount(5);
}

// Drive a real pointer drag on a handle: the editor's drag listeners are Pointer
// Events on the handle element itself (pointerdown adds pointermove/up to the same
// node), so dispatching synthetic PointerEvents to it exercises the exact path a
// finger would. The 6px threshold means we step the move well past it.
async function dragHandleTo(page, handleIndex, toX, toY) {
  await page.evaluate(({ i, x, y }) => {
    const handle = document.querySelectorAll(".layout-handle")[i];
    const r = handle.getBoundingClientRect();
    const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
    const fire = (type, cx, cy) => handle.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      clientX: cx, clientY: cy, button: 0,
    }));
    fire("pointerdown", sx, sy);
    fire("pointermove", sx + 12, sy + 12);  // cross the 6px tap/drag threshold
    fire("pointermove", x, y);
    fire("pointerup", x, y);
  }, { i: handleIndex, x: toX, y: toY });
}

// The on-screen box (CSS px) of a HUD control.
function controlBox(page, selector) { return page.locator(selector).boundingBox(); }

// On a non-touch device (the desktop profile) the on-screen controls don't apply,
// so the editor opens in a "no-drag" explanatory mode (Cancel only). Verify that
// path is a clean, real-browser smoke (the editor entry never a dead click), while
// the full drag → save → reload → restore loop runs on the touch profiles below.
test("control layout: editor opens cleanly on a non-touch device (no-drag mode)", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "touch profiles run the full drag loop instead");
  const errors = watchErrors(page);
  await bootToHud(page);
  await page.locator("#pauseBtn").dispatchEvent("click");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await page.evaluate(() => {
    document.querySelectorAll("#pauseMenu details.sub-panel").forEach((d) => { d.open = true; });
  });
  await page.locator("#layoutEditBtnP").dispatchEvent("click");
  await expect(page.locator("#layoutEditor")).not.toHaveClass(/hidden/);
  await expect(page.locator("#layoutEditor")).toHaveClass(/no-drag/);   // non-touch → no handles
  await expect(page.locator(".layout-handle")).toHaveCount(0);
  await expect(page.locator("#layoutSave")).toBeHidden();               // Save/Reset hidden in no-drag
  await page.locator("#layoutCancel").dispatchEvent("click");
  await expect(page.locator("#layoutEditor")).toHaveClass(/hidden/);
  expect(errors, `console errors during no-drag editor smoke:\n${errors.join("\n")}`).toEqual([]);
});

test("control layout: drag the joystick, save, reload → it restores; can't drop off-screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the drag loop needs touch + Pointer Events (the S24 profiles)");
  const errors = watchErrors(page);
  await bootToHud(page);
  await expect(page.locator("#touch")).not.toHaveClass(/hidden/); // touch controls present

  const vp = page.viewportSize();
  await openEditor(page);

  // The joystick is the FIRST handle (CONTROL_DEFS order). Drag it to roughly the
  // screen centre — comfortably inside the safe area on either orientation.
  const targetX = Math.round(vp.width * 0.5);
  const targetY = Math.round(vp.height * 0.5);
  await dragHandleTo(page, 0, targetX, targetY);

  // The live joystick followed the drag: its centre lands near the drop point.
  const moved = await controlBox(page, "#joystick");
  expect(moved).not.toBeNull();
  expect(Math.abs(moved.x + moved.width / 2 - targetX)).toBeLessThan(40);
  expect(Math.abs(moved.y + moved.height / 2 - targetY)).toBeLessThan(40);
  await expect(page.locator("#joystick")).toHaveClass(/gg-moved/);

  // Save the layout (persists to localStorage + the run snapshot) and close.
  await page.locator("#layoutSave").dispatchEvent("click");
  await expect(page.locator("#layoutEditor")).toHaveClass(/hidden/);

  // The per-device mirror now holds the joystick's fraction (~0.5, 0.5).
  const stored = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("gg3d_controls") || "{}"); } catch { return {}; }
  });
  expect(stored.joystick).toBeTruthy();
  expect(stored.joystick.x).toBeGreaterThan(0.35);
  expect(stored.joystick.x).toBeLessThan(0.65);
  expect(stored.joystick.y).toBeGreaterThan(0.35);
  expect(stored.joystick.y).toBeLessThan(0.65);

  // RELOAD and start again — the saved layout applies on boot (device mirror), so
  // the joystick comes back near the centre, not its bottom-left default.
  await page.reload();
  await bootToHud(page);
  await expect(page.locator("#joystick")).toHaveClass(/gg-moved/);
  const restored = await controlBox(page, "#joystick");
  expect(restored).not.toBeNull();
  expect(Math.abs(restored.x + restored.width / 2 - vp.width * 0.5)).toBeLessThan(60);
  expect(Math.abs(restored.y + restored.height / 2 - vp.height * 0.5)).toBeLessThan(60);

  // OFF-SCREEN CLAMP: open the editor again and yank the joystick far past the
  // bottom-right corner. It must stay fully on-screen (clamped to the safe area).
  await openEditor(page);
  await dragHandleTo(page, 0, vp.width + 500, vp.height + 500);
  const clamped = await controlBox(page, "#joystick");
  expect(clamped).not.toBeNull();
  expect(clamped.x).toBeGreaterThanOrEqual(-1);
  expect(clamped.y).toBeGreaterThanOrEqual(-1);
  expect(clamped.x + clamped.width).toBeLessThanOrEqual(vp.width + 1);
  expect(clamped.y + clamped.height).toBeLessThanOrEqual(vp.height + 1);

  // Cancel so we don't persist the extreme drag.
  await page.locator("#layoutCancel").dispatchEvent("click");
  await expect(page.locator("#layoutEditor")).toHaveClass(/hidden/);

  expect(errors, `console errors during control-layout flow:\n${errors.join("\n")}`).toEqual([]);
});
