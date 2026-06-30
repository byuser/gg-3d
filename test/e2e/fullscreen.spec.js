import { test, expect } from "@playwright/test";

// Task 37 — Exit/enter fullscreen control in the settings menu. Real-browser
// assertions over the BUILT site (the test seam window.__GG_TEST__ is OFF in
// production, so everything here drives the real DOM) at desktop AND the Galaxy
// S24 Ultra portrait + landscape profiles (configured in playwright.config.js):
//   • pause → settings → Display has a working fullscreen control (#fsBtnP), the
//     HUD #fsBtn is kept, and both reflect the WINDOWED state;
//   • the control stays in SYNC with the browser's fullscreen state — faking
//     document.fullscreenElement + dispatching `fullscreenchange` flips the menu
//     label to "Exit fullscreen" and the HUD glyph to ✕, then back;
//   • when the Fullscreen API is UNSUPPORTED (e.g. iOS Safari), the whole Display
//     panel + the HUD button are cleanly HIDDEN — no dead control, no throw.
// Actually *entering* fullscreen needs a user-activation gesture the headless
// runner can't satisfy reliably, so we assert the wiring + visibility + the
// fullscreenchange sync rather than a real fullscreen transition.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// LOCAL-ONLY escape hatch (mirrors the other specs): in this dev sandbox the
// egress proxy intermittently fails the Babylon CDN load for the mobile UA. When
// GG_LOCAL_BABYLON points at a dir holding the three babylon scripts, route the
// CDN requests there so the build boots offline. Inert on CI (var unset → real CDN).
const LOCAL_BABYLON = process.env.GG_LOCAL_BABYLON;
async function routeLocalBabylon(page) {
  if (!LOCAL_BABYLON) return;
  const { readFileSync } = await import("node:fs");
  const { join, basename } = await import("node:path");
  await page.route(/cdn\.babylonjs\.com/, (route) => {
    try {
      const body = readFileSync(join(LOCAL_BABYLON, basename(new URL(route.request().url()).pathname)));
      route.fulfill({ status: 200, contentType: "application/javascript", body });
    } catch { route.continue(); }
  });
}

async function bootToHud(page) {
  await routeLocalBabylon(page);
  await page.goto("/");
  await expect(page.locator("#startBtn")).toBeEnabled({ timeout: 60_000 });
  await page.locator("#startBtn").click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
}

// Open the pause menu and force the Display <details> open (the menu is a scroll
// container, so dispatch the click + open the panel via the DOM like the other
// mobile specs rather than fighting actionability on the small viewport).
async function openDisplayPanel(page) {
  await page.locator("#pauseBtn").dispatchEvent("click");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await page.evaluate(() => {
    const d = document.getElementById("displayPanel");
    if (d) d.open = true;
  });
}

test("Display: the settings fullscreen control is present + reflects the windowed state", async ({ page }) => {
  const errors = watchErrors(page);
  await bootToHud(page);

  // The Fullscreen API is available in headless Chromium, so the control is shown.
  await openDisplayPanel(page);
  const fsBtnP = page.locator("#fsBtnP");
  await expect(fsBtnP).toBeVisible();
  await expect(fsBtnP).toBeEnabled();
  // Windowed → the menu label is the localized "Enter fullscreen" and not pressed.
  await expect(fsBtnP).toHaveText(/Enter fullscreen|Войти в полноэкранный/);
  await expect(fsBtnP).toHaveAttribute("aria-pressed", "false");

  // The HUD button is KEPT and shows the enter glyph in the windowed state.
  await expect(page.locator("#fsBtn")).toHaveText("⛶");

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});

test("Display: the menu control + HUD glyph stay in sync with the browser fullscreen state", async ({ page }) => {
  const errors = watchErrors(page);
  await bootToHud(page);
  await openDisplayPanel(page);

  // Simulate the browser entering fullscreen by faking document.fullscreenElement
  // and dispatching the `fullscreenchange` the game listens to. Both entry points
  // (the menu label + the HUD glyph) must flip to the EXIT state in lockstep.
  await page.evaluate(() => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  await expect(page.locator("#fsBtnP")).toHaveText(/Exit fullscreen|Выйти из полноэкранного/);
  await expect(page.locator("#fsBtnP")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#fsBtn")).toHaveText("✕");

  // Now simulate leaving fullscreen — both controls flip back to the ENTER state.
  await page.evaluate(() => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  await expect(page.locator("#fsBtnP")).toHaveText(/Enter fullscreen|Войти в полноэкранный/);
  await expect(page.locator("#fsBtnP")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#fsBtn")).toHaveText("⛶");

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});

test("Display: the control is cleanly hidden when the Fullscreen API is unsupported", async ({ page }) => {
  const errors = watchErrors(page);
  // Strip every (vendor-prefixed) requestFullscreen BEFORE the app boots, so the
  // game's feature detection sees an iOS-Safari-style environment with no API.
  await routeLocalBabylon(page);
  await page.addInitScript(() => {
    for (const proto of [Element.prototype, HTMLElement.prototype]) {
      for (const k of ["requestFullscreen", "webkitRequestFullscreen", "msRequestFullscreen"]) {
        try { delete proto[k]; } catch { /* read-only on some engines — best effort */ }
        try { Object.defineProperty(proto, k, { configurable: true, value: undefined }); } catch { /* ignore */ }
      }
    }
  });
  await page.goto("/");
  await expect(page.locator("#startBtn")).toBeEnabled({ timeout: 60_000 });
  await page.locator("#startBtn").click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });

  // The HUD fullscreen button hides (the original behaviour) …
  await expect(page.locator("#fsBtn")).toBeHidden();
  // … and the whole Display sub-panel hides too — no dead menu control.
  await page.locator("#pauseBtn").dispatchEvent("click");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await expect(page.locator("#displayPanel")).toBeHidden();

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
