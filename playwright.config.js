import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Some sandboxed dev environments ship a PRE-INSTALLED Chromium at a fixed path
// (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers) whose build can differ from the one
// the pinned @playwright/test version would auto-download. When that fixed binary
// is present, point the launcher at it so local E2E runs work without a download.
// On CI / public runners the path doesn't exist, so this is inert and Playwright
// uses its own installed browser as normal.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const sandboxLaunch = existsSync(SANDBOX_CHROMIUM)
  ? { launchOptions: { executablePath: SANDBOX_CHROMIUM } }
  : {};

// The Galaxy S24 Ultra device profile (1440 × 3120, DPR ≈ 3.5) — the mobile
// reference target every Task 16–22 UI/responsive test must pass, in BOTH
// portrait and landscape. Added here in Task 16 (the responsive HUD/menu
// overhaul) alongside the existing desktop coverage. The CSS-pixel viewport is
// the physical resolution divided by the device-pixel ratio.
const S24_DPR = 3.5;
const s24Portrait = {
  ...devices["Galaxy S9+"], // a sane Android Chrome UA/touch baseline to extend
  viewport: { width: Math.round(1440 / S24_DPR), height: Math.round(3120 / S24_DPR) }, // 411 × 891
  deviceScaleFactor: S24_DPR,
  isMobile: true,
  hasTouch: true,
};
const s24Landscape = {
  ...s24Portrait,
  viewport: { width: Math.round(3120 / S24_DPR), height: Math.round(1440 / S24_DPR) }, // 891 × 411
};

// Real-browser smoke: build the static site and serve it with `vite preview`,
// then assert the canvas boots with no console errors and the core overlays
// open. Babylon is fetched from its CDN, so this needs network at run time.
export default defineConfig({
  testDir: "./test/e2e",
  // Keep `fullyParallel` on so that, under CI sharding (below), Playwright splits
  // the suite test-by-test for an even shard balance rather than file-by-file.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry on CI absorbs a genuine flake.
  retries: process.env.CI ? 1 : 0,
  // The E2E speed-up comes from SHARDING across parallel CI machines (see the
  // matrix in .github/workflows/ci.yml), NOT from many workers per machine. Each
  // test boots Babylon on a *software* WebGL canvas; running several such boots
  // on one machine starves the CPU enough that the tests' own boot-readiness
  // waits (e.g. the 15s "#hud visible" assertion) flake. So we keep ONE worker
  // per machine (zero in-runner contention — tests behave exactly as in the old
  // serial run) and get the wall-clock win from N shards running concurrently.
  // (Once CI confirms headroom, a machine could likely afford 2 workers; bumping
  // shard count is the safer lever.)
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  // Keep the generous per-test budget. A single test can boot Babylon on a real
  // WebGL canvas (fetched from the CDN) MORE THAN ONCE — the session-resume and
  // saves round-trip flows boot, save, reload and boot again — which legitimately
  // runs well over a minute on a CI runner. Cutting this to 120s timed those heavy
  // multi-boot tests out, so it stays at the proven 240s; the speed-up comes from
  // sharding, not a tighter per-test cap. (The Task 39 stall that used to ride this
  // budget is gone, so 240s no longer masks a hang here.) Per-action timeouts are
  // left at their defaults so they never cap a legitimately slow first boot.
  timeout: 240_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    ...sandboxLaunch,
    // Babylon is fetched from its public CDN at runtime. Some CI / sandbox
    // networks proxy HTTPS with their own cert; tolerate that so the engine
    // loads. (Public Pages serves over a valid cert regardless.)
    ignoreHTTPSErrors: true,
    // In sandboxed environments outbound HTTPS goes through a local egress proxy
    // (HTTPS_PROXY); route the browser through it so the CDN Babylon loads. On CI
    // / public networks the var is unset and the browser connects directly.
    ...(process.env.HTTPS_PROXY || process.env.https_proxy
      ? {
          proxy: {
            server: process.env.HTTPS_PROXY || process.env.https_proxy,
            // The local site is served over plain HTTP on localhost; the egress
            // relay only tunnels HTTPS CONNECT, so bypass it for local addresses.
            bypass: "localhost,127.0.0.1,::1",
          },
        }
      : {}),
  },
  projects: [
    // Desktop boot smoke (the original suite).
    {
      name: "chromium",
      testMatch: /boot\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Responsive suite (Task 16): runs at desktop, the S24 Ultra portrait and the
    // S24 Ultra landscape profiles so menus + HUD are verified at every target.
    {
      name: "responsive-desktop",
      testMatch: /responsive\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "s24-portrait",
      testMatch: /responsive\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "s24-landscape",
      testMatch: /responsive\.spec\.js/,
      use: s24Landscape,
    },
    // Durable session (Task 17): the auto-persist → reload → resume flow, run at
    // desktop AND the S24 Ultra portrait + landscape profiles so a desktop⇄mobile
    // mode switch / re-orientation still restores the same run.
    {
      name: "session-desktop",
      testMatch: /session\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "session-s24-portrait",
      testMatch: /session\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "session-s24-landscape",
      testMatch: /session\.spec\.js/,
      use: s24Landscape,
    },
    // Save management (Task 18): the Saves screen (open from start + pause, save →
    // rename → reload → load a named slot), run at desktop AND the S24 Ultra
    // portrait + landscape profiles so the screen is verified on the phone too.
    {
      name: "saves-desktop",
      testMatch: /saves\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "saves-s24-portrait",
      testMatch: /saves\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "saves-s24-landscape",
      testMatch: /saves\.spec\.js/,
      use: s24Landscape,
    },
    // Unified inventory (Task 21): the potions tab quick-slot drag-assignment +
    // the removed HUD materials strip, run at desktop AND the S24 Ultra portrait +
    // landscape profiles so the larger grid + drag targets work on the phone too.
    {
      name: "inventory-desktop",
      testMatch: /inventory\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "inventory-s24-portrait",
      testMatch: /inventory\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "inventory-s24-landscape",
      testMatch: /inventory\.spec\.js/,
      use: s24Landscape,
    },
    // Map subsystem (Task 20): the full-map overlay fits one screen (no page
    // scroll) while the results list scrolls — verified at desktop AND the S24
    // Ultra portrait + landscape profiles (both orientations are in scope).
    {
      name: "map-desktop",
      testMatch: /map\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "map-s24-portrait",
      testMatch: /map\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "map-s24-landscape",
      testMatch: /map\.spec\.js/,
      use: s24Landscape,
    },
    // Collision-free HUD regions (Task 39): a fast, engine-free geometry guard —
    // it renders the static page, un-hides + fills the HUD, forces the worst case
    // (longest EN/RU labels with boss bar / compass / tracker all visible) and
    // asserts no two HUD widgets overlap, at desktop AND the S24 Ultra portrait +
    // landscape profiles. Robust even if the Babylon CDN is unreachable.
    {
      name: "hud-regions-desktop",
      testMatch: /hud-regions\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "hud-regions-s24-portrait",
      testMatch: /hud-regions\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "hud-regions-s24-landscape",
      testMatch: /hud-regions\.spec\.js/,
      use: s24Landscape,
    },
    // Customizable on-screen control layout (Task 36): the real drag → save →
    // reload → restore loop + the off-screen clamp. Needs touch + Pointer Events,
    // so it runs ONLY at the S24 Ultra portrait + landscape profiles (a desktop
    // mouse can't open the touch-control editor). Both orientations are in scope.
    {
      name: "controllayout-s24-portrait",
      testMatch: /controllayout\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "controllayout-s24-landscape",
      testMatch: /controllayout\.spec\.js/,
      use: s24Landscape,
    },
    {
      name: "controllayout-desktop",
      testMatch: /controllayout\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Exit/enter fullscreen control in the settings menu (Task 37): the pause →
    // settings → Display control is present + reflects state + stays in sync with
    // the HUD button via `fullscreenchange`, and is cleanly hidden when the
    // Fullscreen API is unsupported. Run at desktop AND the S24 Ultra portrait +
    // landscape profiles (the landscape lock path is mobile-only).
    {
      name: "fullscreen-desktop",
      testMatch: /fullscreen\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "fullscreen-s24-portrait",
      testMatch: /fullscreen\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "fullscreen-s24-landscape",
      testMatch: /fullscreen\.spec\.js/,
      use: s24Landscape,
    },
    // Persistent Drive sign-in (Task 23): with an injected GIS client + a stored
    // opted-in hint, a reload restores the signed-in state via the silent
    // (prompt:"none") path with NO visible dialog; a clean load makes no GIS call;
    // and the explicit button is the only path to an interactive consent. The flow
    // is layout-independent (no canvas needed), so desktop exercises it fully.
    {
      name: "cloudsignin-desktop",
      testMatch: /cloudsignin\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Worn helmets (Task 25): boot the built site, equip several helmets and
    // screenshot Lily's head, asserting each maps to its archetype and the shapes
    // visibly differ. Needs a real WebGL canvas, so it runs at desktop.
    {
      name: "worn-helmets-desktop",
      testMatch: /worn-helmets\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Worn chest pieces (Task 26): boot the built site, equip several breastplates
    // and screenshot Lily's torso, asserting each maps to its archetype and the
    // shapes visibly differ. Needs a real WebGL canvas, so it runs at desktop.
    {
      name: "worn-chests-desktop",
      testMatch: /worn-chests\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Worn pauldrons (Task 27): boot the built site, equip several pauldrons, hold
    // Lily in the melee strike pose and screenshot her shoulder + chest, asserting
    // each maps to its archetype, the shapes visibly differ, and there's no chest
    // penetration mid-attack. Needs a real WebGL canvas, so it runs at desktop.
    {
      name: "worn-pauldrons-desktop",
      testMatch: /worn-pauldrons\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Worn gloves & gauntlets (Task 28): boot the built site, equip several gloves and
    // screenshot Lily's right hand + the wand grip it holds, asserting each maps to its
    // archetype, the shapes visibly differ, and the glove wraps the grip (rather than
    // swallowing it). Needs a real WebGL canvas, so it runs at desktop.
    {
      name: "worn-gloves-desktop",
      testMatch: /worn-gloves\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Worn belts (Task 29): boot the built site, equip several belts (under a chest
    // piece) and screenshot Lily's waist, asserting each maps to its archetype, the
    // shapes visibly differ, and the belt sits below the chest hem. Needs a real WebGL
    // canvas, so it runs at desktop.
    {
      name: "worn-belts-desktop",
      testMatch: /worn-belts\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Worn boots (Task 30): boot the built site, equip several boots, hold Lily in a
    // steady mid-stride pose and screenshot her lower legs + feet, asserting each maps to
    // its archetype, the shapes visibly differ, and the boots ride the striding feet.
    // Needs a real WebGL canvas, so it runs at desktop.
    {
      name: "worn-boots-desktop",
      testMatch: /worn-boots\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Worn cloaks (Task 31): boot the built site, equip several cloaks, turn Lily's back
    // to the lens, hold a steady mid-turn BILLOW pose and screenshot her back + cloak,
    // asserting each maps to its archetype, the drape shapes visibly differ, and the cloak
    // trails behind (never through the legs). Needs a real WebGL canvas, so it runs at
    // desktop.
    {
      name: "worn-cloaks-desktop",
      testMatch: /worn-cloaks\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Held weapons (Task 32): boot the built site, equip each of the six weapon classes,
    // present the weapon in a steady raised hold and screenshot Lily's hand + weapon,
    // asserting each maps to its class and the silhouettes visibly differ. Needs a real
    // WebGL canvas, so it runs at desktop.
    {
      name: "worn-weapons-desktop",
      testMatch: /worn-weapons\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Attack animations (Task 34): boot the built site, equip each of the six weapon
    // classes, pin Lily at the class's strike (impact/release) pose and screenshot her
    // upper body + weapon, asserting each animates as its class, the six strike poses
    // visibly differ, and a wind-up reads differently from the strike. Needs a real
    // WebGL canvas, so it runs at desktop.
    {
      name: "combat-anim-desktop",
      testMatch: /combat-anim\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Visible jewelry (Task 33): boot the built site, equip several necklaces (then
    // several rings on the bare hand), frame a close-up of the throat / hand and
    // screenshot each, asserting each maps to its archetype and the shapes/gems visibly
    // differ. Needs a real WebGL canvas. Runs at desktop AND on the Galaxy S24 Ultra
    // profile (portrait + landscape) since it's an on-character visual (per Task 33).
    {
      name: "worn-jewelry-desktop",
      testMatch: /worn-jewelry\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "worn-jewelry-s24-portrait",
      testMatch: /worn-jewelry\.spec\.js/,
      use: s24Portrait,
    },
    {
      name: "worn-jewelry-s24-landscape",
      testMatch: /worn-jewelry\.spec\.js/,
      use: s24Landscape,
    },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
