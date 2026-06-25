import { test, expect } from "@playwright/test";

// Task 18 — multiple named manual save slots with full management, and the
// cloud-saves browser fix (real browser). Proves the Saves screen is reachable
// from BOTH the pause menu and the start screen, that a run saves into a named
// local slot, the slot RENAMES inline, survives a reload, and LOADS back into a
// running game — plus that the start-screen cloud entry point is no longer a dead
// click (it opens a Saves screen with a cloud section + sign-in CTA). Headless
// slot logic is covered in depth by the Vitest suite; this is the DOM/boot layer.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function bootReady(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.BABYLON !== "undefined", null, { timeout: 60_000 });
  await expect(page.locator("#startBtn")).toBeEnabled({ timeout: 30_000 });
}

test("start screen: the Saves screen opens with a cloud section (no dead click)", async ({ page }) => {
  // The start overlay renders before the engine, so this needs only the static UI.
  await page.goto("/");
  await expect(page.locator("#overlay")).toBeVisible();
  await expect(page.locator("#savesBtn")).toBeVisible();

  // Open the Saves screen from the start menu — it is NOT a no-op.
  await page.locator("#savesBtn").click();
  await expect(page.locator("#savesOverlay")).not.toHaveClass(/hidden/);

  // The cloud section is present with a clear state + a sign-in CTA (rather than a
  // dead/disabled control) when cloud is not configured / signed out.
  await expect(page.locator("#savesCloudStatus")).toBeVisible();
  await expect(page.locator("#savesCloudSignBtn")).toBeVisible();

  // Six local slots are rendered (all empty on a clean first visit).
  await expect(page.locator("#savesList .saves-row")).toHaveCount(6);

  await page.locator("#savesDone").click();
  await expect(page.locator("#savesOverlay")).toHaveClass(/hidden/);
});

test("save → rename → reload → load a named slot round-trips the run", async ({ page }) => {
  const errors = watchErrors(page);
  await bootReady(page);

  // Start a run so there is state to save.
  await page.locator("#startBtn").click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await page.waitForTimeout(800);

  // Open the Saves screen from the PAUSE menu.
  await page.keyboard.press("Escape");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await page.locator("#savesBtnP").click();
  await expect(page.locator("#savesOverlay")).not.toHaveClass(/hidden/);

  // The first slot is empty → "New save" writes the live run into it.
  const firstRow = page.locator("#savesList .saves-row").first();
  await firstRow.getByRole("button", { name: /New save/i }).click();
  // The row is now "used": it exposes Load / Rename / Delete.
  await expect(firstRow.getByRole("button", { name: /^Load$/i })).toBeVisible();

  // Rename it inline.
  await firstRow.getByRole("button", { name: /^Rename$/i }).click();
  const input = firstRow.locator(".saves-rename-input");
  await expect(input).toBeVisible();
  await input.fill("My Checkpoint");
  await input.press("Enter");
  await expect(firstRow.locator(".saves-name")).toHaveText("My Checkpoint");

  await page.locator("#savesDone").click();

  // Reload — back to the start screen. The named slot must persist.
  await page.reload();
  await expect(page.locator("#startBtn")).toBeEnabled({ timeout: 30_000 });

  // Open the Saves screen from the START menu and confirm the slot survived.
  await page.locator("#savesBtn").click();
  await expect(page.locator("#savesOverlay")).not.toHaveClass(/hidden/);
  const savedRow = page.locator("#savesList .saves-row").first();
  await expect(savedRow.locator(".saves-name")).toHaveText("My Checkpoint");

  // Load it — the boot reload path re-seeds + applies the save, returning to play.
  await savedRow.getByRole("button", { name: /^Load$/i }).click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 30_000 });
  await expect(page.locator("#minimap")).toBeVisible();

  expect(errors, `console errors during saves flow:\n${errors.join("\n")}`).toEqual([]);
});
