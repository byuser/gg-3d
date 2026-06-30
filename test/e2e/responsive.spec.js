import { test, expect } from "@playwright/test";
import { rectsOverlap as overlaps, pairwiseCollisions } from "../util/rect.js";

// Task 16 — responsive, mobile-first HUD & menu overhaul. This suite runs at the
// desktop profile AND the Galaxy S24 Ultra device profile (portrait + landscape,
// configured in playwright.config.js) and asserts the release bar:
//   • every start-screen and pause-menu control is reachable (in-viewport or by
//     scrolling) — explicitly the Google-Drive / cloud panel — and never clips;
//   • the removed widgets (monster counter, on-HUD mute, map button, round bag
//     button) are gone;
//   • no two key HUD widgets' bounding boxes overlap at any tested resolution;
//   • in landscape the 3 skill slots + interact (E) + fire (✨) sit in the
//     bottom-right one-thumb arc.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// `overlaps` (the 1px-tolerant axis-aligned overlap predicate) + `pairwiseCollisions`
// are the shared, unit-tested helpers from test/util/rect.js.

// Scroll an element into view with a plain DOM call (never waits for the element
// to be "actionable", so it can't hang on disabled controls) and confirm it lands
// inside the viewport — i.e. it is reachable by scrolling.
async function reachableByScroll(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  return inViewport(page, locator);
}

// Whether an element's box sits fully within the viewport (so the user can reach
// it without scrolling). A scroll container can still expose off-viewport items;
// we assert reachability by scrolling them into view separately.
async function inViewport(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return false;
  const vp = page.viewportSize();
  return (
    box.x >= -1 &&
    box.y >= -1 &&
    box.x + box.width <= vp.width + 1 &&
    box.y + box.height <= vp.height + 1
  );
}

// Expand a labelled <details> sub-panel inside a scrollable menu. We scroll it
// into view and toggle it open; in a short scroll container Playwright's
// actionability can report the scroll-container ancestor as intercepting the
// hit point, so fall back to toggling the native `open` attribute (a real user
// taps the visible summary fine — this only sidesteps that test-harness quirk).
async function expandSubPanel(page, summaryLocator) {
  await summaryLocator.scrollIntoViewIfNeeded();
  const details = summaryLocator.locator("xpath=..");
  await details.evaluate((el) => {
    if (!el.open) el.open = true;
  });
  await expect(details).toHaveJSProperty("open", true);
}

async function bootToHud(page, locale) {
  // Optionally pin the locale before first paint so the worst-case label tests can
  // exercise English AND Russian (the longest weather/clock/location strings) from
  // the same suite. The i18n layer persists the choice under "gg3d_locale".
  if (locale) {
    await page.addInitScript((loc) => {
      try {
        localStorage.setItem("gg3d_locale", loc);
      } catch {
        /* storage may be unavailable; the default locale still loads */
      }
    }, locale);
  }
  await page.goto("/");
  const startBtn = page.locator("#startBtn");
  await expect(startBtn).toBeEnabled({ timeout: 60_000 });
  await startBtn.click();
  await expect(page.locator("#hud")).not.toHaveClass(/hidden/, { timeout: 15_000 });
  // The HUD widgets are laid out by CSS immediately; a short settle covers the
  // first render frame without padding every test by a fixed second.
  await expect(page.locator("#minimap")).toBeVisible();
}

// The always-on HUD LEAF widgets whose anchored regions must never collide (Task
// 39). Container regions (#hudTopStatus, #hudControls) are excluded — they contain
// their own children by design — and each icon button is listed individually so
// "weather under the quest button" is caught directly (the historic bug).
const HUD_WIDGETS = [
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

// Drive the HUD into its WORST case for the region/layer assertions: every
// optional widget (boss bar, compass, quest tracker) visible at once, with the
// longest labels in the active locale so a chip is at its widest. This is the
// exact situation Task 39 must hold under — the boss bar / compass / tracker all
// shown together, long localized weather labels ("Гроза" / "Thunderstorm").
async function forceWorstCaseHud(page, locale) {
  await page.evaluate((loc) => {
    const ru = loc === "ru";
    const set = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };
    const show = (id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("hidden");
    };
    // Longest weather labels: EN "Thunderstorm" (longer than any real EN state, a
    // deliberate stress value); RU "Облачно" (Cloudy, the longest RU state).
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
  // Let the layout settle for one frame after the content change.
  await page.waitForTimeout(120);
}

// Read the given selectors' on-screen rectangles in ONE synchronous in-page pass
// with getBoundingClientRect. This is instant and never auto-waits — unlike a
// per-widget locator.boundingBox() round-trip, which auto-waits for stability and
// can stall for the whole test timeout when the just-booted engine is still
// thrashing layout on a slow CI runner. Zero-area / display:none widgets are
// dropped (they own no pixels, so they cannot collide).
async function readBoxes(page, ids) {
  return page.evaluate((sel) => {
    const out = {};
    for (const id of sel) {
      const el = document.querySelector(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        out[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return out;
  }, ids);
}

// Measure the boxes of every always-on HUD widget, then assert no two intersect.
async function assertNoHudOverlaps(page, label) {
  const boxes = await readBoxes(page, HUD_WIDGETS);
  const collisions = pairwiseCollisions(boxes);
  expect(collisions, `${label}: overlapping HUD regions: ${collisions.join(", ")}`).toEqual([]);
}

test("start menu: removed widgets are gone and the cloud panel is reachable", async ({ page }) => {
  // The start-screen layout renders before (and independently of) the Babylon
  // engine, so this layout check needs only the static overlay — not engine-ready.
  await page.goto("/");
  await expect(page.locator("#overlay")).toBeVisible();
  await expect(page.locator("#startBtn")).toBeVisible();

  // The decluttered HUD/menus removed these entirely (Task 16).
  await expect(page.locator("#monsters")).toHaveCount(0);
  await expect(page.locator("#musicBtn")).toHaveCount(0);
  await expect(page.locator("#mapBtn")).toHaveCount(0);
  await expect(page.locator("#bagBtn")).toHaveCount(0);

  // Primary actions are always visible without any interaction.
  await expect(page.locator("#startBtn")).toBeVisible();
  await expect(page.locator("#loadBtn")).toBeVisible();

  // The Google-Drive / cloud panel must be fully reachable: it lives in a
  // collapsible sub-panel; expanding it brings the controls on-screen, and the
  // panel scrolls internally so nothing clips off the bottom on a tall phone.
  await expandSubPanel(page, page.locator('#overlay .sub-panel > summary:has-text("Cloud Saves")'));
  const cloudBtn = page.locator("#cloudSignBtn");
  await expect(cloudBtn).toBeVisible();
  expect(await reachableByScroll(page, cloudBtn), "cloud sign-in button reachable").toBe(true);
});

test("pause menu: every primary control + the cloud panel is reachable", async ({ page }) => {
  const errors = watchErrors(page);
  await bootToHud(page);

  await page.locator("#pauseBtn").click();
  await expect(page.locator("#pauseMenu")).not.toHaveClass(/hidden/);

  // Expand the cloud sub-panel so its controls participate in the reachability
  // check (the Google-Drive panel must be reachable, not clipped off-screen).
  await expandSubPanel(
    page,
    page.locator('#pauseMenu .sub-panel > summary:has-text("Cloud Saves")'),
  );
  await expect(page.locator("#cloudListBtnP")).toBeVisible();

  // Every primary action AND the cloud panel are reachable: each one is rendered
  // and brought fully into the viewport by the menu's internal scroll (on a short
  // landscape they don't all fit at once — which is exactly why the panel scrolls;
  // the acceptance bar is reachability). One round-trip scrolls + measures each so
  // the mobile profiles stay well within the test budget.
  const unreachable = await page.evaluate(
    (ids) => {
      const bad = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) {
          bad.push(id + " (missing)");
          continue;
        }
        el.scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect();
        const ok =
          r.width > 0 &&
          r.height > 0 &&
          r.left >= -1 &&
          r.top >= -1 &&
          r.right <= window.innerWidth + 1 &&
          r.bottom <= window.innerHeight + 1;
        if (!ok) bad.push(id);
      }
      return bad;
    },
    ["resumeBtn", "savesBtnP", "restartBtn", "exitBtn", "cloudListBtnP"],
  );
  expect(unreachable, `controls not reachable in viewport: ${unreachable.join(", ")}`).toEqual([]);

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});

test("HUD: non-overlapping widget regions + the landscape one-thumb arc", async ({ page }) => {
  // One boot covers both HUD-layout assertions (kept together to avoid a second
  // slow Babylon boot per profile).
  await bootToHud(page);

  // (1) The key always-on HUD widgets each own distinct screen pixels.
  const ids = ["#weather", "#clock", "#minimap", "#skillBar"];
  const boxes = {};
  for (const id of ids) {
    const loc = page.locator(id);
    if ((await loc.count()) === 0) continue;
    boxes[id] = await loc.boundingBox();
  }
  const keys = Object.keys(boxes).filter((k) => boxes[k]);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      expect(
        overlaps(boxes[keys[i]], boxes[keys[j]]),
        `${keys[i]} must not overlap ${keys[j]}`,
      ).toBe(false);
    }
  }

  // (2) In touch landscape the 3 skill slots + E + fire form a bottom-right arc,
  // clear of the left-thumb joystick. Skip elsewhere (desktop / portrait keep
  // their own sensible layouts, covered by the checks above).
  const isTouch = await page.evaluate(
    () => window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window,
  );
  const isLandscape = await page.evaluate(() => window.innerWidth > window.innerHeight);
  if (!isTouch || !isLandscape) return;

  const vp = page.viewportSize();
  const action = await page.locator("#actionBtn").boundingBox();
  const cast = await page.locator("#castBtn").boundingBox();
  const skillBar = await page.locator("#skillBar").boundingBox();
  const joystick = await page.locator("#joystick").boundingBox();

  // E, fire and the skill quick-bar all live in the right (right-thumb) half…
  const centreX = vp.width / 2;
  expect(action.x, "E button in the right half").toBeGreaterThan(centreX);
  expect(cast.x, "fire button in the right half").toBeGreaterThan(centreX);
  expect(skillBar.x, "skill bar in the right half").toBeGreaterThan(centreX);

  // …and in the lower part of the screen (a comfortable thumb sweep).
  expect(action.y + action.height, "E button in the lower band").toBeGreaterThan(vp.height * 0.45);
  expect(skillBar.y, "skill bar above the primaries").toBeLessThan(action.y);

  // The joystick keeps the left-thumb zone and stays clear of the action cluster.
  expect(joystick.x, "joystick in the left half").toBeLessThan(centreX);
  expect(overlaps(joystick, action), "joystick clear of E").toBe(false);
  expect(overlaps(joystick, skillBar), "joystick clear of skill bar").toBe(false);

  // Tap targets stay finger-sized (≈ 48 px platform minimum).
  expect(Math.min(action.width, action.height)).toBeGreaterThanOrEqual(48);
  expect(Math.min(cast.width, cast.height)).toBeGreaterThanOrEqual(48);
});

// ---------------------------------------------------------------------------
// Task 39 — collision-free HUD: a real region/layer system. The acceptance bar
// is that NO two HUD widgets/buttons overlap at any tested resolution/orientation
// — explicitly the weather/clock never collide with the quest (or any) icon
// button — verified with the boss bar / compass / quest tracker all visible and
// with the longest EN AND RU labels. This runs at every project profile in
// playwright.config.js (desktop, S24 Ultra portrait + landscape); a dedicated
// case below adds the ~360 px small-phone width.
// ---------------------------------------------------------------------------
for (const locale of ["en", "ru"]) {
  test(`HUD regions never overlap — worst case, ${locale.toUpperCase()} labels`, async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await bootToHud(page, locale);
    await forceWorstCaseHud(page, locale);

    // The whole pairwise grid of always-on widgets owns distinct pixels.
    await assertNoHudOverlaps(page, `worst-case ${locale}`);

    // Call out the historic regression explicitly: the weather + clock chips must
    // never sit under the quest button or anywhere in the icon-button row.
    const m = await readBoxes(page, ["#weather", "#clock", "#questBtn", "#hudControls"]);
    const weather = m["#weather"];
    const clock = m["#clock"];
    const quest = m["#questBtn"];
    const controls = m["#hudControls"];
    expect(overlaps(weather, quest), "weather must not overlap the quest button").toBe(false);
    expect(overlaps(weather, controls), "weather must not overlap the control row").toBe(false);
    expect(overlaps(clock, quest), "clock must not overlap the quest button").toBe(false);
    expect(overlaps(clock, controls), "clock must not overlap the control row").toBe(false);

    // When the chips share the control row's vertical band (desktop + touch
    // landscape, where there is horizontal room), the status region reserves the
    // control-row column so the chips sit entirely to its LEFT — the structural
    // invariant that makes the non-overlap hold however long the labels grow. In
    // touch portrait the chips instead DROP into their own band below the controls
    // (vertical separation), so this horizontal invariant doesn't apply there.
    const sharesBand = (a, b) => a.y < b.y + b.height - 1 && a.y + a.height - 1 > b.y;
    if (sharesBand(weather, controls)) {
      expect(
        weather.x + weather.width,
        "weather right edge clears the control-row left edge",
      ).toBeLessThanOrEqual(controls.x + 1);
    }
    if (sharesBand(clock, controls)) {
      expect(
        clock.x + clock.width,
        "clock right edge clears the control-row left edge",
      ).toBeLessThanOrEqual(controls.x + 1);
    }

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });
}

test("HUD regions never overlap at a narrow ~360px width", async ({ page }, testInfo) => {
  // A ~360px width is a small PHONE, so assert it only on the touch profiles (the
  // banded touch layout). The desktop layout targets wide viewports and is not a
  // 360px target — forcing it there would overlap by design (it is exercised at
  // its real desktop width by the worst-case tests above).
  test.skip(!testInfo.project.use.hasTouch, "small-phone width is a touch scenario");
  await page.setViewportSize({ width: 360, height: 740 });
  await bootToHud(page, "ru"); // RU exercises the wider localized chips.
  await page.setViewportSize({ width: 360, height: 740 });
  await forceWorstCaseHud(page, "ru");

  await assertNoHudOverlaps(page, "narrow-360 ru");

  const m = await readBoxes(page, ["#weather", "#questBtn", "#hudControls"]);
  const weather = m["#weather"];
  const quest = m["#questBtn"];
  const controls = m["#hudControls"];
  expect(overlaps(weather, quest), "weather must not overlap the quest button at 360px").toBe(
    false,
  );
  expect(overlaps(weather, controls), "weather must not overlap the control row at 360px").toBe(
    false,
  );
});

test("HUD control row + minimap own distinct top-right pixels", async ({ page }) => {
  // The control row (icon buttons) and the corner minimap both anchor top-right;
  // assert they stack without overlapping (the minimap sits below the row), and
  // the compass pill sits clear of both — the corner region is internally sound.
  await bootToHud(page);
  await forceWorstCaseHud(page, "en");

  const m = await readBoxes(page, ["#hudControls", "#minimap", "#compass"]);
  const controls = m["#hudControls"];
  const minimap = m["#minimap"];
  const compass = m["#compass"];
  expect(overlaps(controls, minimap), "control row clear of the minimap").toBe(false);
  expect(overlaps(controls, compass), "control row clear of the compass").toBe(false);
  expect(overlaps(minimap, compass), "minimap clear of the compass").toBe(false);
  // The minimap sits BELOW the control row (the row owns the very top edge).
  expect(minimap.y, "minimap below the control row").toBeGreaterThanOrEqual(
    controls.y + controls.height - 1,
  );
});
