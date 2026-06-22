import { describe, it, expect } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

describe("module boot smoke", () => {
  it("boots and exposes the test seam", () => {
    const T = globalThis.window.__GG_TEST__;
    expect(T && T.CONFIG).toBeTruthy();
    expect(scenes.length).toBeGreaterThan(0);
    expect(typeof T.startGame).toBe("function");
    expect(Array.isArray(T.ZONES)).toBe(true);
  });
});
