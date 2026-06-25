import { test, expect } from "@playwright/test";

// Task 21 — unified inventory (potions + ingredients, 30 slots, drag-slotting,
// alchemist). Real-browser smoke over the BUILT site, driven entirely through the
// REAL DOM/UI (no `window.__GG_TEST__`, which is inert on the deployed bundle —
// mirrors saves.spec.js / responsive.spec.js). It asserts: the on-HUD materials
// chip strip is gone; the inventory's Potions tab shows the 3 combat quick-slots
// as drag-target cards plus the player's starting bag potion; a tap-to-pick
// assignment (the accessible fallback, via the real "Assign" button + a quick-slot
// tap) re-slots the potion; and the HUD potion bar reflects it. The pure
// migration / stacking / sell / drag-reducer logic is covered in depth by the
// Vitest suite (test/inventory21.test.js). Stable, locale-independent test hooks
// (`[data-pot-slot]`, `[data-filled]`, `[data-pot-bag]`, `[data-pot-pick]`) keep
// these assertions robust across EN/RU and the S24 Ultra portrait/landscape layouts.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// Fire a real `click` on an element inside the inventory overlay via the DOM,
// bypassing Playwright's actionability/stability wait. The inventory panel is a
// `max-height/overflow:auto` scroll container whose tabs/cards reflow as content
// loads, so a positional `.click()` can spin on the "element is stable" check on
// the mobile profiles; `dispatchEvent` triggers the element's real click handler
// deterministically (the handlers are plain `addEventListener('click', …)`). We
// still wait for the element to be present + visible first.
async function clickEl(locator) {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  await locator.dispatchEvent("click");
}

async function bootReady(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.BABYLON !== "undefined", null, { timeout: 60_000 });
  await expect(page.locator("#startBtn")).toBeEnabled({ timeout: 30_000 });
}

test("unified inventory: no HUD materials strip, potion quick-slots re-slot via the real UI", async ({ page }) => {
  const errors = watchErrors(page);
  await bootReady(page);

  // Start a run — the HUD appears (the starting kit puts 2 minor potions in the
  // bag, pre-assigned to combat quick-slot 1).
  await page.locator("#startBtn").click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await page.waitForTimeout(600);

  // The on-HUD materials chip strip was REMOVED in Task 21 (materials live in the
  // unified bag now).
  await expect(page.locator("#materialsBar")).toHaveCount(0);

  // The HUD potion bar exists with 3 slots; the first holds the starter potion.
  await expect(page.locator("#potionBar .potion-slot")).toHaveCount(3);
  await expect(page.locator("#potionBar .potion-slot.filled")).toHaveCount(1);
  await expect(page.locator("#potionBar .potion-slot").nth(0)).toHaveClass(/filled/);

  // Open the inventory (the single 🎒 entry point) via its "I" hotkey — robust
  // across desktop + the mobile profiles where the floating button animates — and
  // switch to the Potions tab.
  await page.keyboard.press("KeyI");
  await expect(page.locator("#inventory")).not.toHaveClass(/hidden/);
  await clickEl(page.locator("#invTabPotions"));

  // The 3 combat quick-slots render as drag-target cards; one bag potion stack is
  // shown (the starter minor potion).
  await expect(page.locator("#invBag .pot-slot-card")).toHaveCount(3);
  await expect(page.locator("#invBag .pot-bag-card")).toHaveCount(1);
  // Slot index 0 is filled (the starter assignment); index 2 is empty.
  await expect(page.locator('#invBag .pot-slot-card[data-pot-slot="0"][data-filled="1"]')).toHaveCount(1);
  await expect(page.locator('#invBag .pot-slot-card[data-pot-slot="2"][data-filled="0"]')).toHaveCount(1);

  // Accessible tap-to-pick: press the bag potion's "Assign" button, then tap the
  // empty quick-slot 2 — the assignment is UNIQUE, so it MOVES from slot 0 → 2.
  await clickEl(page.locator("#invBag [data-pot-pick]").first());
  await clickEl(page.locator('#invBag .pot-slot-card[data-pot-slot="2"]'));

  // The model + HUD both reflect the move: slot 2 now filled, slot 0 cleared.
  await expect(page.locator('#invBag .pot-slot-card[data-pot-slot="2"][data-filled="1"]')).toHaveCount(1);
  await expect(page.locator('#invBag .pot-slot-card[data-pot-slot="0"][data-filled="0"]')).toHaveCount(1);

  // Close the inventory and confirm the HUD potion bar's 3rd cell (index 2) is now
  // the filled one (4/5/6 map to quick-slots 1/2/3).
  await page.keyboard.press("Escape");
  await expect(page.locator("#inventory")).toHaveClass(/hidden/);
  await expect(page.locator("#potionBar .potion-slot.filled")).toHaveCount(1);
  await expect(page.locator("#potionBar .potion-slot").nth(2)).toHaveClass(/filled/);

  expect(errors, `console errors during inventory flow:\n${errors.join("\n")}`).toEqual([]);
});
