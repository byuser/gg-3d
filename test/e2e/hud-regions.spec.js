import { test, expect } from "@playwright/test";
import { rectsOverlap as overlaps, pairwiseCollisions } from "../util/rect.js";

// Task 39 — collision-free HUD: a real region/layer system. This suite proves the
// region GEOMETRY directly: the HUD layout is pure CSS/HTML (independent of the
// Babylon engine), so we render the static page, un-hide the HUD, fill the dynamic
// bars with the exact slot markup the game emits, force the WORST case (longest
// EN/RU labels with the boss bar + compass + quest tracker all visible at once),
// then assert NO two HUD widgets/buttons share pixels — at the desktop, Galaxy S24
// Ultra portrait + landscape profiles (playwright.config.js) and a ~360px small
// phone. Because it never boots the engine it is fast and robust even when the
// Babylon CDN is unreachable, and it complements the live-engine non-overlap
// checks in responsive.spec.js. The companion Vitest test/hud-regions.test.js
// locks the pure band-geometry helper this layout is built on.

// `overlaps` + `pairwiseCollisions` are the shared, unit-tested predicate from
// test/util/rect.js (test/hud-regions.test.js locks their behaviour).

// LEAF widgets only — the container regions (#hudTopStatus, #hudControls) are
// excluded because they contain their own children by design (containment is not
// a collision). Every actual on-screen widget is compared instead, including each
// individual icon button so "weather under the quest button" is caught directly.
const WIDGETS = [
  "#weather",
  "#clock",
  "#location",
  "#xpWrap",
  "#fsBtn",
  "#pauseBtn",
  "#invBtn",
  "#skillsBtn",
  "#craftBtn",
  "#questBtn",
  "#minimap",
  "#compass",
  "#skillBar",
  "#potionBar",
  "#buffBar",
  "#bossBar",
  "#questTracker",
  "#relicBar",
];

async function setupHud(page, locale) {
  await page.addInitScript((loc) => {
    try {
      localStorage.setItem("gg3d_locale", loc);
    } catch {
      /* storage may be unavailable; the default locale still loads */
    }
  }, locale);
  // The Babylon CDN <script> tags block the full `load` event on some networks, so
  // wait only for DOMContentLoaded — the static HUD markup + CSS we measure are
  // present then.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // #hud starts `hidden` (display:none); wait for it ATTACHED, not visible — we
  // un-hide it ourselves below (the engine normally does this on Start).
  await page.waitForSelector("#hud", { state: "attached" });
  await page.evaluate((loc) => {
    const ru = loc === "ru";
    document.getElementById("hud").classList.remove("hidden");
    const touch = document.getElementById("touch");
    if (touch) touch.classList.remove("hidden");
    // Fill the dynamic bars with the exact markup updateSkillBar / the potion belt
    // emit, so their measured widths match the live HUD.
    const sb = document.getElementById("skillBar");
    if (sb)
      sb.innerHTML = [1, 2, 3]
        .map(
          (k) =>
            `<button class="skill-slot filled"><span class="sk-key">${k}</span><span class="sk-icon">✨</span><span class="sk-cost">🔵6</span></button>`,
        )
        .join("");
    const pb = document.getElementById("potionBar");
    if (pb)
      pb.innerHTML = [4, 5, 6]
        .map(
          (k) =>
            `<button class="potion-slot filled"><span class="pk">${k}</span><span class="pi">🧪</span><span class="pc">2</span></button>`,
        )
        .join("");
    const bb = document.getElementById("buffBar");
    if (bb) bb.innerHTML = `<span class="buff-pill"><b>${ru ? "Сила" : "Power"}</b> 12s</span>`;
    const rb = document.getElementById("relicBar");
    if (rb) rb.innerHTML = `<span class="relic-chip">💎</span><span class="relic-chip">💎</span>`;
    // WORST case: longest labels + boss bar / compass / quest tracker all visible.
    const set = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };
    const show = (id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("hidden");
    };
    // "Thunderstorm" stresses the EN chip wider than any real EN weather state;
    // "Облачно" is the longest real RU state.
    set("weather", ru ? "☁️ Облачно" : "⛈️ Thunderstorm");
    set("clock", "🌙 23:59");
    set("location", ru ? "Брамблвудская чаща" : "Bramblewood Thicket");
    show("bossBar");
    set("bossName", ru ? "👑 Сахарный Король" : "👑 The Sweet King");
    show("compass");
    set("compassLabel", ru ? "Замковый холм" : "Castle Hill");
    show("questTracker");
    set(
      "questTracker",
      ru
        ? '<div class="qt-chap">Глава 3</div><div class="qt-title">Очень длинное название миссии</div><div class="qt-obj">Сделай дело в этом месте сейчас</div>'
        : '<div class="qt-chap">Chapter 3</div><div class="qt-title">A rather long mission title here</div><div class="qt-obj">Do the thing in the place now</div>',
    );
  }, locale);
  // One frame for the layout to settle after the content change.
  await page.waitForTimeout(120);
}

async function boxes(page) {
  const out = {};
  for (const id of WIDGETS) {
    const loc = page.locator(id);
    if ((await loc.count()) === 0) continue;
    const b = await loc.boundingBox();
    // Zero-area / display:none widgets own no pixels, so they cannot collide.
    if (b && b.width > 0 && b.height > 0) out[id] = b;
  }
  return out;
}

for (const locale of ["en", "ru"]) {
  test(`HUD regions own distinct pixels — worst case, ${locale.toUpperCase()}`, async ({
    page,
  }, testInfo) => {
    await setupHud(page, locale);
    const b = await boxes(page);
    const collisions = pairwiseCollisions(b);
    if (process.env.HUD_DEBUG)
      console.log(`[${testInfo.project.name}/${locale}] boxes:`, JSON.stringify(b));
    expect(collisions, `overlapping HUD regions: ${collisions.join(", ")}`).toEqual([]);

    // Call out the historic regression explicitly: weather + clock never sit under
    // the quest button or anywhere in the icon-button row.
    const controls = await page.locator("#hudControls").boundingBox();
    expect(
      overlaps(b["#weather"], b["#questBtn"]),
      "weather must not overlap the quest button",
    ).toBe(false);
    expect(overlaps(b["#weather"], controls), "weather must not overlap the control row").toBe(
      false,
    );
    expect(overlaps(b["#clock"], controls), "clock must not overlap the control row").toBe(false);
  });
}

test("HUD regions own distinct pixels at a narrow ~360px width", async ({ page }, testInfo) => {
  // A ~360px width is a small PHONE — assert it on the touch projects (the banded
  // touch layout). A 360px desktop window is not a target resolution.
  test.skip(!testInfo.project.use.hasTouch, "small-phone width is a touch scenario");
  await page.setViewportSize({ width: 360, height: 740 });
  await setupHud(page, "ru");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(80);
  const b = await boxes(page);
  const collisions = pairwiseCollisions(b);
  expect(collisions, `overlapping HUD regions @360px: ${collisions.join(", ")}`).toEqual([]);
});
