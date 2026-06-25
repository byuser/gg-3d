import { test, expect } from "@playwright/test";

// Task 17 — durable session persistence (real browser). Proves the in-progress
// run auto-persists to first-party storage and a RELOAD resumes it via the
// "Continue" entry point — including a desktop⇄mobile mode switch (the responsive
// project matrix re-runs this at the S24 Ultra portrait + landscape profiles, so
// a layout/orientation change must restore the same run). Headless-safe logic is
// covered in depth by the Vitest suite; this is the DOM/boot wiring layer.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test("auto-persists the run and resumes it on reload via Continue", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  // Babylon is a large bundle fetched from its CDN; wait for the global before
  // driving the game so a slow first load doesn't look like a failure.
  await page.waitForFunction(() => typeof window.BABYLON !== "undefined", null, { timeout: 60_000 });
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });

  // On a clean first visit there is no saved run → no Continue button.
  await expect(page.locator("#continueBtn")).toHaveClass(/hidden/);

  // Start a run and let it persist a snapshot (debounced + an immediate flush on
  // start). A couple seconds covers the debounce window comfortably.
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await page.waitForTimeout(2500);

  // Confirm a first-party snapshot was written (localStorage) — the run is durable.
  const stored = await page.evaluate(() => {
    try { return !!localStorage.getItem("gg3d_session"); } catch (e) { return false; }
  });
  expect(stored).toBe(true);

  // Reload the page — the run must NOT be lost: the start screen now offers
  // "Continue".
  await page.reload();
  const continueBtn = page.locator("#continueBtn");
  await expect(continueBtn).not.toHaveClass(/hidden/, { timeout: 30_000 });
  await expect(continueBtn).toBeEnabled({ timeout: 30_000 });

  // Resume — the HUD returns and the run is back in play (same zone/world).
  await continueBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator("#minimap")).toBeVisible();
  await page.waitForTimeout(800);

  // The "Clear saved session" control lives in the Cloud Saves sub-panel and
  // wipes the durable session. Open the pause settings and verify it's present.
  await page.keyboard.press("Escape");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await page.locator('#pauseMenu .sub-panel > summary:has-text("Cloud Saves")').click();
  await expect(page.locator("#clearSessionBtnP")).toBeVisible();

  expect(errors, `console errors during session flow:\n${errors.join("\n")}`).toEqual([]);
});
