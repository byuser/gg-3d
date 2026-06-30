// Task 39 — collision-free HUD region/layer system. The HUD layout itself is CSS,
// proven pixel-for-pixel by the Playwright suite test/e2e/hud-regions.spec.js (and
// the live-engine checks in responsive.spec.js). This Vitest suite locks the PURE
// rectangle-geometry helper those specs rely on — `rectsOverlap` /
// `pairwiseCollisions` (test/util/rect.js). A false negative in the overlap
// predicate would silently let an overlapping HUD widget pass the non-overlap
// assertions, so the predicate is verified here against the cases that matter:
// edge-touching (a reserved-column seam) is NOT a collision, real intersection IS,
// containment IS, and hidden/zero-area boxes never collide.
import { describe, it, expect } from "vitest";
import { rectsOverlap, pairwiseCollisions } from "./util/rect.js";

const R = (x, y, width, height) => ({ x, y, width, height });

describe("Task 39 — rectsOverlap predicate", () => {
  it("two clearly separated rectangles do not overlap", () => {
    expect(rectsOverlap(R(0, 0, 10, 10), R(100, 100, 10, 10))).toBe(false);
  });

  it("genuinely intersecting rectangles overlap", () => {
    expect(rectsOverlap(R(0, 0, 50, 50), R(40, 40, 50, 50))).toBe(true);
  });

  it("edge-touching boxes are NOT a collision (a 1px reserved-column seam)", () => {
    // The status row's right edge meeting the control row's left edge: adjacent,
    // not overlapping. This is exactly the reserved-column invariant.
    expect(rectsOverlap(R(0, 0, 100, 40), R(100, 0, 60, 40))).toBe(false);
    // A 1px sub-pixel kiss is also tolerated (not an overlap).
    expect(rectsOverlap(R(0, 0, 100, 40), R(99.5, 0, 60, 40))).toBe(false);
  });

  it("a >1px intrusion past the seam IS a collision", () => {
    // Weather flowing 5px under the control row must be caught.
    expect(rectsOverlap(R(0, 0, 105, 40), R(100, 0, 60, 40))).toBe(true);
  });

  it("containment counts as overlap (a child inside its region)", () => {
    expect(rectsOverlap(R(0, 0, 100, 100), R(20, 20, 10, 10))).toBe(true);
  });

  it("null or zero-area rectangles never overlap", () => {
    expect(rectsOverlap(null, R(0, 0, 10, 10))).toBe(false);
    expect(rectsOverlap(R(0, 0, 10, 10), undefined)).toBe(false);
    expect(rectsOverlap(R(0, 0, 0, 10), R(0, 0, 10, 10))).toBe(false);
    expect(rectsOverlap(R(0, 0, 10, 10), R(0, 0, 10, 0))).toBe(false);
  });

  it("overlap is symmetric", () => {
    const a = R(0, 0, 50, 50);
    const b = R(30, 30, 50, 50);
    expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a));
  });
});

describe("Task 39 — pairwiseCollisions over a region map", () => {
  it("a clean banded layout reports no collisions", () => {
    // Five distinct bands stacked down the screen — the touch HUD region model.
    const boxes = {
      controls: R(280, 12, 120, 38),
      status: R(14, 58, 140, 120),
      minimap: R(284, 58, 116, 116),
      health: R(85, 240, 240, 18),
      tracker: R(12, 290, 200, 78),
      boss: R(60, 400, 280, 38),
    };
    expect(pairwiseCollisions(boxes)).toEqual([]);
  });

  it("flags the historic weather-under-quest-button collision", () => {
    // Weather flowing right under the quest icon button (the Task 39 bug).
    const boxes = {
      weather: R(260, 14, 120, 36), // right edge 380
      questBtn: R(361, 12, 38, 38), // left edge 361 < 380 → intrudes
    };
    expect(pairwiseCollisions(boxes)).toEqual(["weather × questBtn"]);
  });

  it("ignores hidden (zero-area) widgets in the map", () => {
    const boxes = {
      weather: R(14, 58, 120, 36),
      bossBar: R(0, 0, 0, 0), // hidden — owns no pixels
    };
    expect(pairwiseCollisions(boxes)).toEqual([]);
  });

  it("lists every distinct overlapping pair once", () => {
    const boxes = {
      a: R(0, 0, 50, 50),
      b: R(40, 40, 50, 50),
      c: R(45, 45, 50, 50),
    };
    // a×b, a×c, b×c all intersect.
    expect(pairwiseCollisions(boxes).sort()).toEqual(["a × b", "a × c", "b × c"]);
  });
});
