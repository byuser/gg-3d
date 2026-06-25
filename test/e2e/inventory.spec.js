import { test, expect } from "@playwright/test";

// Task 21 — unified inventory (potions + ingredients, 30 slots, drag-slotting,
// alchemist). Real-browser smoke over the BUILT site: the on-HUD materials chip
// strip is gone, the inventory's potions tab shows the 3 combat quick-slots as
// drag targets, a tap-to-pick assignment slots a bag potion, and the bag holds
// 30 slots. The pure migration / stacking / sell logic is covered in depth by
// the Vitest suite (test/inventory21.test.js); this proves the DOM/UI wiring.

/** Collect console errors + uncaught exceptions for a page. */
function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test("unified inventory: no HUD materials strip, potion quick-slots drag-assign", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 30_000 });
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });

  // The on-HUD materials chip strip was removed in Task 21 (materials live in
  // the bag now).
  await expect(page.locator("#materialsBar")).toHaveCount(0);

  // Give the player a couple of potions via the test seam, then open the bag.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    const p = T.player;
    p.inventory = [];
    p.potionSlots = [null, null, null];
    T.bagAdd(p, "minor_potion", 3);
  });

  await page.keyboard.press("KeyI");
  await expect(page.locator("#inventory")).not.toHaveClass(/hidden/);

  // The bag reads 30 slots in the unified model.
  await expect(page.evaluate(() => window.__GG_TEST__.player.invCap)).resolves.toBe(30);

  // Switch to the Potions tab → the 3 combat quick-slots render as drag targets.
  await page.locator("#invTabPotions").click();
  await expect(page.locator("#invBag .pot-slots")).toBeVisible();
  await expect(page.locator("#invBag .pot-slot-card")).toHaveCount(3);
  // The bag potion stack shows up with its drink button.
  await expect(page.locator("#invBag .pot-bag-card").first()).toBeVisible();

  // Drive the accessible tap-to-pick fallback through the model, then assert the
  // quick-slot took the potion + the HUD potion bar reflects it.
  await page.evaluate(() => {
    const T = window.__GG_TEST__;
    T.Inventory.tapPick({ kind: "roster", id: "minor_potion" });
    T.Inventory.tapSlot(0, null);
  });
  await expect(page.evaluate(() => window.__GG_TEST__.player.potionSlots[0])).resolves.toBe(
    "minor_potion",
  );
  // The HUD potion bar's first slot is now filled.
  await expect(page.locator("#potionBar .potion-slot").first()).toHaveClass(/filled/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#inventory")).toHaveClass(/hidden/);

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
