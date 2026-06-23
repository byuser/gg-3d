import { test, expect } from "@playwright/test";

// Real-browser smoke: the built static site must boot Babylon on a real canvas
// with no console errors / exceptions, and the core overlays must open. This is
// the layer the headless unit/logic suites can't cover (DOM + WebGL wiring).

/** Collect console errors + uncaught exceptions for a page. */
function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test("boots the canvas with no console errors and opens core overlays", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/Good Game 3D/);

  // The render canvas exists and the engine reports ready (Start gets enabled).
  await expect(page.locator("#renderCanvas")).toBeVisible();
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });

  // Start the game → the HUD must appear and the start overlay must hide.
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });

  // The corner minimap is part of the HUD and renders on a real canvas.
  await expect(page.locator("#minimap")).toBeVisible();

  // Let a few frames render so any per-frame exception would surface.
  await page.waitForTimeout(1500);

  // Pause menu opens on Escape and closes again.
  await page.keyboard.press("Escape");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await page.locator("#resumeBtn").click();
  await expect(page.locator("#pauseMenu")).toHaveClass(/hidden/);

  // Inventory opens with the "I" hotkey and closes again.
  await page.keyboard.press("KeyI");
  await expect(page.locator("#inventory")).not.toHaveClass(/hidden/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#inventory")).toHaveClass(/hidden/);

  // Skills & fusion overlay opens with "K", shows the quick-bar/list, closes.
  await page.keyboard.press("KeyK");
  await expect(page.locator("#skills")).not.toHaveClass(/hidden/);
  await expect(page.locator("#skillsList")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#skills")).toHaveClass(/hidden/);

  // World map opens with the 🗺️ button, renders its canvas, searches by name,
  // switches to the world overview, and closes — proving the new DOM/canvas
  // wiring boots cleanly (the guide/waypoint/compass logic is covered in depth by
  // the Vitest unit + functional suites).
  await page.locator("#mapBtn").click();
  await expect(page.locator("#worldmap")).not.toHaveClass(/hidden/);
  await expect(page.locator("#mapCanvas")).toBeVisible();
  await page.fill("#mapSearch", "frost");
  await expect(page.locator("#mapResults .map-result").first()).toBeVisible();
  await page.locator("#mapTabWorld").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#worldmap")).toHaveClass(/hidden/);

  // Casting the slotted skill with the "1" hotkey must not throw.
  await page.keyboard.press("Digit1");
  await page.waitForTimeout(300);

  expect(errors, `console errors during boot:\n${errors.join("\n")}`).toEqual([]);
});
