import { defineConfig } from "vitest/config";

// Unit + logic + functional/integration suites run in plain Node (no jsdom):
// `test/setup/stubs.js` installs faithful Babylon + DOM + Web Audio stubs on
// `globalThis` before the game modules import, exactly like the old bespoke
// harness did inside a `vm` context — but now driving the real ES modules.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup/stubs.js"],
    // The ported harness boots the game once and drives a long sequential flow
    // (matching the original), so keep a single worker / no isolation churn.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
  },
});
