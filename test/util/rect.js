// Pure rectangle-geometry helpers shared by the HUD region tests (Task 39).
// Kept dependency-free so both the Vitest logic suite and the Playwright E2E
// specs can use the SAME overlap predicate — a false negative here would let an
// overlapping HUD widget slip through the non-overlap assertions, so it is itself
// unit-tested (test/hud-regions.test.js).

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * Do two axis-aligned rectangles share any interior pixels? A small tolerance
 * `eps` absorbs sub-pixel rounding so edge-touching boxes (a 1px seam) are NOT
 * counted as overlapping — matching how the browser lays adjacent widgets out.
 * Null/zero-area rectangles never overlap (a hidden widget owns no pixels).
 * @param {Rect|null|undefined} a
 * @param {Rect|null|undefined} b
 * @param {number} [eps]
 * @returns {boolean}
 */
export function rectsOverlap(a, b, eps = 1) {
  if (!a || !b) return false;
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return (
    a.x < b.x + b.width - eps &&
    a.x + a.width - eps > b.x &&
    a.y < b.y + b.height - eps &&
    a.y + a.height - eps > b.y
  );
}

/**
 * Every pairwise collision in a map of named rectangles, as "a × b" strings (each
 * unordered pair once). An empty array means the layout is collision-free.
 * @param {Record<string, Rect|null|undefined>} boxes
 * @param {number} [eps]
 * @returns {string[]}
 */
export function pairwiseCollisions(boxes, eps = 1) {
  const keys = Object.keys(boxes).filter((k) => boxes[k]);
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (rectsOverlap(boxes[keys[i]], boxes[keys[j]], eps)) {
        out.push(`${keys[i]} × ${keys[j]}`);
      }
    }
  }
  return out;
}
