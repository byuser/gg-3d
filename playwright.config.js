import { defineConfig, devices } from "@playwright/test";

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
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  // Each test drives the whole UI end-to-end (boot Babylon on a real WebGL canvas
  // — fetched from the CDN — then open overlays / read HUD geometry, on desktop
  // AND the mobile S24 Ultra profiles). On a cold runner that first boot is slow,
  // so give every test a generous budget (the web server already gets 120s) to
  // avoid flaky timeouts.
  timeout: 180_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
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
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
