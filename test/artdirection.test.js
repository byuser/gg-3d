// Task 11 — brighter, cheerful art direction + a larger, tier-gated view.
// Boots the assembled game against the Babylon/DOM stubs and locks in the new
// art-direction seam so the look can't silently regress:
//   • the colour grade lifts saturation/value, clamps, preserves hue, is pure
//   • fog density opens up per tier (high thins it, low keeps it tight) + clamps
//   • the camera draw distance (maxZ) is tier-gated to match
//   • per-zone exposure/contrast stay in a sane, readable ACES range
//   • gameplay-critical markers/enemies keep their contrast against the brighter
//     ground (readability is preserved by the brightening)
//   • buildWorld actually applies the graded fog on each tier (no throw)
import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";
import { PALETTE } from "../src/core/config.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const AD = () => T.ArtDirection;
const TIERS = ["high", "medium", "low"];

// Tiny local HSV so we can assert saturation/value/hue moves without leaking the
// game's internals into the test.
function hsv(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx <= 1e-6 ? 0 : d / mx, v: mx };
}

// Perceptual colour distance (redmean-weighted Euclidean, 0..255 channels),
// normalised to ~0..3 — a cheap stand-in for "how distinct do these read?".
function colorDist(a, b) {
  const rgb = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = rgb(a),
    [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2,
    dr = r1 - r2,
    dg = g1 - g2,
    db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 255;
}

beforeAll(() => {
  T.startGame();
});

describe("Task 11 — the cheerful colour grade is pure + safe", () => {
  it("is exposed with the expected pure helpers", () => {
    const a = AD();
    expect(a && typeof a.grade).toBe("function");
    expect(typeof a.fogDensityFor).toBe("function");
    expect(typeof a.view).toBe("function");
    expect(typeof a.exposureFor).toBe("function");
    expect(typeof a.contrastFor).toBe("function");
    expect(typeof a.contrastRatio).toBe("function");
  });

  it("raises saturation and value on muddy colours, preserving hue", () => {
    // The meadow ground + a dull forest green — exactly the muted tones the pass
    // is meant to lift.
    for (const hex of ["#5fae4f", "#356b39", "#cdbb84", "#7a5230"]) {
      const before = hsv(hex),
        after = hsv(AD().gradeHex(hex));
      expect(after.s, `${hex} saturation lifted`).toBeGreaterThan(before.s);
      expect(after.v, `${hex} value not dimmed`).toBeGreaterThanOrEqual(before.v - 1e-6);
      // Hue is preserved within a couple degrees (grade shifts S/V, not H).
      const dh = Math.min(Math.abs(after.h - before.h), 360 - Math.abs(after.h - before.h));
      expect(dh, `${hex} hue preserved`).toBeLessThan(3);
    }
  });

  it("barely moves already-vivid candy colours (no neon blow-out) and clamps", () => {
    expect(AD().gradeHex("#ff0000")).toBe("#ff0000"); // already s=1,v=1 → unchanged
    // Every grade output is a valid, clamped colour (channels in [0,1], no NaN).
    for (const hex of [...PALETTE, "#ffffff", "#000000", "#123", "#86c5ff"]) {
      const c = AD().grade(hex);
      for (const ch of [c.r, c.g, c.b]) {
        expect(Number.isFinite(ch)).toBe(true);
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic / pure (same input → same output)", () => {
    expect(AD().gradeHex("#5fae4f")).toBe(AD().gradeHex("#5fae4f"));
  });
});

describe("Task 11 — the view opens up, tier-gated", () => {
  it("orders the per-tier draw distance high > medium > low", () => {
    const hi = AD().view("high").maxZ,
      md = AD().view("medium").maxZ,
      lo = AD().view("low").maxZ;
    expect(hi).toBeGreaterThan(md);
    expect(md).toBeGreaterThan(lo);
    expect(lo).toBeGreaterThan(0);
  });

  it("high tier's draw distance covers the farthest real geometry (no hard clip)", () => {
    // The farthest geometry in any zone is the sea/ground skirt (radius*2 + 60);
    // beyond it only the infiniteDistance sky dome is drawn. high + medium clear
    // every zone's skirt so the opened view never clips.
    for (const z of T.ZONES) {
      const skirt = z.radius * 2 + 60;
      expect(AD().view("high").maxZ, `${z.id}: high covers skirt`).toBeGreaterThanOrEqual(skirt);
    }
  });

  it("thins fog on high and keeps it tight on low, per zone", () => {
    for (const z of T.ZONES) {
      const base = z.theme.fogDensity;
      const hi = AD().fogDensityFor(z, "high");
      const md = AD().fogDensityFor(z, "medium");
      const lo = AD().fogDensityFor(z, "low");
      // high opens the most → lowest density; low stays densest. Monotonic.
      expect(hi, `${z.id}: high < medium`).toBeLessThan(md);
      expect(md, `${z.id}: medium < low`).toBeLessThan(lo);
      // high genuinely opens the view vs the raw base; low stays ~ as dense.
      expect(hi, `${z.id}: high thinner than base`).toBeLessThan(base);
      expect(lo, `${z.id}: low ~ base`).toBeGreaterThan(base * 0.9);
      // Never exceed the engine fog ceiling.
      for (const d of [hi, md, lo]) {
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThanOrEqual(0.06);
      }
    }
  });

  it("keeps indoor lairs moodier — they open up less than open lands", () => {
    // Same tier: an indoor lair retains a larger share of its base fog than an
    // outdoor zone (it blends only halfway toward the open multiplier).
    const cav = T.ZONE_BY_ID.caverns,
      meadow = T.ZONE_BY_ID.meadow;
    const cavShare = AD().fogDensityFor(cav, "high") / cav.theme.fogDensity;
    const meadowShare = AD().fogDensityFor(meadow, "high") / meadow.theme.fogDensity;
    expect(cavShare).toBeGreaterThan(meadowShare);
  });
});

describe("Task 11 — exposure/contrast stay in a readable ACES range", () => {
  it("keeps every zone×tier exposure + contrast sane (punchy, not blown out)", () => {
    for (const z of T.ZONES)
      for (const tier of TIERS) {
        const e = AD().exposureFor(z, tier),
          c = AD().contrastFor(z, tier);
        expect(e, `${z.id}/${tier} exposure sane`).toBeGreaterThan(0.85);
        expect(e, `${z.id}/${tier} exposure not blown`).toBeLessThan(1.25);
        expect(c, `${z.id}/${tier} contrast sane`).toBeGreaterThan(0.95);
        expect(c, `${z.id}/${tier} contrast not crushed`).toBeLessThan(1.35);
      }
  });

  it("indoor lairs read darker/moodier than the open lands at the same tier", () => {
    expect(AD().exposureFor(T.ZONE_BY_ID.caverns, "high")).toBeLessThan(
      AD().exposureFor(T.ZONE_BY_ID.meadow, "high"),
    );
    expect(AD().contrastFor(T.ZONE_BY_ID.thicket, "high")).toBeGreaterThan(
      AD().contrastFor(T.ZONE_BY_ID.shore, "high"),
    );
  });
});

describe("Task 11 — gameplay-critical readability is preserved", () => {
  it("contrastRatio is symmetric and ≥ 1 (the WCAG helper is correct)", () => {
    expect(AD().contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(AD().contrastRatio("#5fae4f", "#ffd34e")).toBeCloseTo(
      AD().contrastRatio("#ffd34e", "#5fae4f"),
      6,
    );
    expect(AD().contrastRatio("#5fae4f", "#5fae4f")).toBeCloseTo(1, 6);
  });

  it("markers + enemies stay perceptually distinct from each brightened ground", () => {
    // Markers/enemies read against the ground by HUE as much as brightness (a
    // blue marker pops on green grass at equal luminance), so readability here is
    // a perceptual colour distance (redmean-weighted), normalised to ~0..3. The
    // quest-marker states + the candy enemy palette are all gameplay-critical.
    const fg = ["#ffd34e", "#5be0a0", "#6cc6ff", ...PALETTE];
    for (const z of T.ZONES) {
      const ground = AD().gradeHex(z.theme.ground);
      for (const f of fg) {
        const distAfter = colorDist(AD().gradeHex(f), ground);
        const distBefore = colorDist(f, z.theme.ground);
        // Still clearly distinct against the brighter ground…
        expect(distAfter, `${z.id} ${f} distinct`).toBeGreaterThan(0.25);
        // …and the brightening didn't erode the separation.
        expect(distAfter, `${z.id} ${f} not washed out`).toBeGreaterThan(distBefore * 0.8);
      }
    }
  });
});

describe("Task 11 — buildWorld applies the graded view per tier", () => {
  it("sets the scene fog to the graded density and never throws, on every tier", () => {
    const prev = T.Quality.tier;
    try {
      for (const tier of TIERS) {
        T.Quality.tier = tier;
        for (const z of T.ZONES) {
          const w = T.buildWorld(scene, z);
          const want = AD().fogDensityFor(z, tier);
          expect(scene.fogDensity, `${z.id}/${tier} fog applied`).toBeCloseTo(want, 6);
          // On high, an outdoor zone's fog is genuinely opened vs its raw base.
          if (tier === "high" && !z.indoor) {
            expect(scene.fogDensity).toBeLessThan(z.theme.fogDensity);
          }
          if (w.dispose) w.dispose();
        }
      }
    } finally {
      T.Quality.tier = prev;
    }
  });
});
