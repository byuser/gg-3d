import { defineConfig, devices } from "@playwright/test";

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
  // The single smoke test drives the whole UI end-to-end (boot Babylon on a real
  // WebGL canvas — fetched from the CDN — then open every core overlay). On a
  // cold CI runner that first boot is slow, so give the whole test a generous
  // budget (the web server already gets 120s) to avoid flaky timeouts.
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    // Babylon is fetched from its public CDN at runtime. Some CI / sandbox
    // networks proxy HTTPS with their own cert; tolerate that so the engine
    // loads. (Public Pages serves over a valid cert regardless.)
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
