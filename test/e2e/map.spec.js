import { test, expect } from "@playwright/test";

// Task 20 — map subsystem fix #1: the full-map overlay FITS ONE SCREEN (no page
// scroll) at desktop AND the Galaxy S24 Ultra portrait + landscape profiles, with
// ONLY the NPC/results list scrolling internally.
//
// This is a real-browser LAYOUT proof over the BUILT site, driven entirely through
// the REAL DOM/CSS (no `window.__GG_TEST__`, which is inert on the deployed
// bundle). The overlay (#worldmap) and its panel/results markup + CSS are exactly
// what ships; we make the overlay visible and fill #mapResults with the same
// `.map-result` rows renderResults() produces (enough to overflow), then measure
// the geometry. Crucially this does NOT depend on the Babylon WebGL engine booting
// (the engine is fetched from a CDN at runtime; the fit-to-viewport behaviour is
// pure CSS) — so it verifies the headline acceptance bar deterministically on every
// device profile. The un-mirror / arrow / label drawing is covered by the Vitest
// suite (test/worldmap.test.js); the engine boot + minimap-tap wiring by boot.spec.js.

// This layout test deliberately does NOT boot the Babylon engine (it checks pure
// CSS fit-to-viewport). On a healthy network the engine loads from its CDN with no
// errors; in a CDN-restricted sandbox the engine's own bootstrap can log
// "BABYLON is not defined" + resource-load failures. Those are unrelated to the
// overlay markup/CSS under test, so filter ONLY that engine-bootstrap noise — any
// other console error (e.g. from the overlay) still fails the test.
const ENGINE_NOISE = /BABYLON is not defined|Failed to load resource|net::ERR_|status of 404/;
function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ENGINE_NOISE.test(msg.text())) errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    if (!ENGINE_NOISE.test(err.message)) errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

// Reveal the real #worldmap overlay (the panel + tabs + canvas + results + actions
// markup ship in index.html) and fill #mapResults with N rows that mirror what
// WorldMapUI.renderResults() builds, so the list is forced to overflow.
async function openMapOverlay(page, rows) {
  await page.evaluate((n) => {
    const wm = document.getElementById("worldmap");
    if (wm) wm.classList.remove("hidden");
    const list = document.getElementById("mapResults");
    if (list) {
      list.innerHTML = "";
      for (let i = 0; i < n; i++) {
        const b = document.createElement("button");
        b.className = "map-result";
        b.innerHTML =
          '<span class="mr-icon">📍</span>' +
          '<span class="mr-name">Place number ' + i + '</span>' +
          '<span class="mr-zone">Landmark · Sunny Meadow</span>';
        list.appendChild(b);
      }
    }
  }, rows);
  // Give the layout a frame to settle.
  await page.waitForTimeout(150);
}

test("full map fits one screen (no page scroll); only the results list scrolls", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  // The static overlay markup renders immediately (independent of the WebGL engine).
  await expect(page.locator("#worldmap")).toHaveCount(1);
  await expect(page.locator("#mapResults")).toHaveCount(1);

  await openMapOverlay(page, 60);
  await expect(page.locator("#worldmap")).not.toHaveClass(/hidden/);
  await expect(page.locator("#mapResults .map-result").first()).toBeVisible();

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const panel = document.querySelector("#worldmap .map-panel");
    const results = document.getElementById("mapResults");
    const pr = panel.getBoundingClientRect();
    return {
      vh: window.innerHeight,
      docScroll: Math.max(de.scrollHeight, body.scrollHeight) - window.innerHeight,
      panelScroll: panel.scrollHeight - panel.clientHeight,
      panelTop: pr.top,
      panelBottom: pr.bottom,
      resultsScrollable: results.scrollHeight - results.clientHeight,
      resultCount: results.querySelectorAll(".map-result").length,
    };
  });

  // (1) No PAGE scroll — the whole overlay fits inside the viewport (1px slack).
  expect(m.docScroll, "document must not scroll (full map fits one screen)").toBeLessThanOrEqual(1);

  // (2) The panel sits fully within the viewport vertically.
  expect(m.panelTop, "panel top within viewport").toBeGreaterThanOrEqual(-1);
  expect(m.panelBottom, "panel bottom within viewport").toBeLessThanOrEqual(m.vh + 1);

  // (3) The panel itself is NOT a scroll container — scrolling moved into the list.
  expect(m.panelScroll, "the map panel itself must not scroll").toBeLessThanOrEqual(1);

  // (4) The NPC/results list IS populated and DOES scroll internally.
  expect(m.resultCount, "results list populated").toBeGreaterThan(10);
  expect(m.resultsScrollable, "the results list scrolls internally").toBeGreaterThan(0);

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});
