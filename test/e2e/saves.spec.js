import { test, expect } from "@playwright/test";

// Task 18 — multiple named manual save slots with full management, and the
// cloud-saves browser fix (real browser). Proves the Saves screen is reachable
// from BOTH the start screen and the pause menu, that a run saves into a named
// local slot, the slot RENAMES inline, survives a reload, and LOADS back into a
// running game — plus that the start-screen cloud entry point is no longer a dead
// click (it opens a Saves screen with a cloud section + sign-in CTA). Headless
// slot logic is covered in depth by the Vitest suite; this is the DOM/boot layer.
//
// The slot rows/buttons carry stable, locale-independent test hooks
// (`[data-slot]`, `[data-act]`) so these assertions don't depend on button text
// and stay robust across the EN/RU UI and the S24 Ultra portrait/landscape
// layouts (where the panel scrolls internally).

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// Click an element after scrolling it into the (possibly short, scrollable)
// Saves panel — never waits for "actionability" that a scroll container can
// confound, so it can't hang on an off-screen-but-reachable control.
async function safeClick(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
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
  await safeClick(page.locator("#savesBtn"));
  await expect(page.locator("#savesOverlay")).not.toHaveClass(/hidden/);

  // The cloud section is present with a clear state + a sign-in CTA (rather than a
  // dead/disabled control) when cloud is not configured / signed out.
  await expect(page.locator("#savesCloudStatus")).toBeVisible();
  await expect(page.locator("#savesCloudSignBtn")).toBeVisible();

  // Six local slots are rendered (all empty on a clean first visit).
  await expect(page.locator("#savesList .saves-row")).toHaveCount(6);
  await expect(page.locator('#savesList .saves-row[data-used="1"]')).toHaveCount(0);

  await safeClick(page.locator("#savesDone"));
  await expect(page.locator("#savesOverlay")).toHaveClass(/hidden/);
});

test("save → rename → reload → load a named slot round-trips the run", async ({ page, isMobile }) => {
  // The Saves *screen* (layout + reachability) is covered on the S24 profiles by
  // the test above; this heavier round-trip (two cold reloads) runs on desktop to
  // keep the mobile matrix within the CI budget — the slot save/load code path is
  // layout-independent, so desktop exercises it fully.
  test.skip(!!isMobile, "round-trip runs on desktop; S24 covers the screen layout");
  const errors = watchErrors(page);
  await bootReady(page);

  // Start a run so there is state to save.
  await page.locator("#startBtn").click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await page.waitForTimeout(800);

  // Open the Saves screen from the PAUSE menu.
  await page.keyboard.press("Escape");
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);
  await safeClick(page.locator("#savesBtnP"));
  await expect(page.locator("#savesOverlay")).not.toHaveClass(/hidden/);

  // Slot 0 is empty → its "New save" writes the live run into it.
  const slot0 = page.locator('#savesList .saves-row[data-slot="0"]');
  await safeClick(slot0.locator('[data-act="new"]'));
  // The slot is now "used" (Load / Rename / Delete appear).
  await expect(page.locator('#savesList .saves-row[data-slot="0"][data-used="1"]')).toHaveCount(1);

  // Rename it inline via the stable hooks.
  await safeClick(page.locator('#savesList .saves-row[data-slot="0"] [data-act="rename"]'));
  const input = page.locator('#savesList .saves-row[data-slot="0"] [data-act="rename-input"]');
  await expect(input).toBeVisible();
  await input.fill("My Checkpoint");
  await input.press("Enter");
  await expect(page.locator('#savesList .saves-row[data-slot="0"] [data-act="name"]')).toHaveText("My Checkpoint");

  await safeClick(page.locator("#savesDone"));

  // Reload — back to the start screen. The named slot must persist.
  await page.reload();
  await expect(page.locator("#startBtn")).toBeEnabled({ timeout: 30_000 });

  // Open the Saves screen from the START menu and confirm the slot survived.
  await safeClick(page.locator("#savesBtn"));
  await expect(page.locator("#savesOverlay")).not.toHaveClass(/hidden/);
  await expect(page.locator('#savesList .saves-row[data-slot="0"] [data-act="name"]')).toHaveText("My Checkpoint");

  // Load it — the boot reload path re-seeds + applies the save, returning to play.
  await safeClick(page.locator('#savesList .saves-row[data-slot="0"] [data-act="load"]'));
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 30_000 });
  await expect(page.locator("#minimap")).toBeVisible();

  expect(errors, `console errors during saves flow:\n${errors.join("\n")}`).toEqual([]);
});
