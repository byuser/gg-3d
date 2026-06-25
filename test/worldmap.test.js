// Task 13 — minimap, full world map, search & the guided waypoint.
//
// Two layers: the PURE graph/geometry helpers in src/data/worldmap.js (zone
// adjacency + BFS route-finding, bearing/distance, the 8-point compass, the
// world-overview layout, target derivation and search), and the RUNTIME wiring
// (waypoint resolution across zones, set/clear/arrival, fog-of-war discovery and
// the v9 save round-trip). The headless harness has no canvas, so the drawing is
// feature-detected — these tests exercise the logic, not the pixels.
import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";
import {
  ZONE_ADJ,
  zoneEdges,
  findRoute,
  nextZoneStep,
  bearingRad,
  dist2D,
  wrapAngle,
  relativeHeading,
  compass8,
  mapVecToScreen,
  mapHeadingScreen,
  layoutMapLabels,
  MAP_TARGETS,
  targetZoneOf,
  targetPoint,
  validWaypoint,
  searchTargets,
  matchesQuery,
  normalizeText,
  worldLayout,
} from "../src/data/worldmap.js";
import { ZONES } from "../src/data/zones.js";
import { LOCATIONS, NPC_DATA } from "../src/data/content.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => {
  for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire();
};

describe("Task 13 — zone graph & route-finding (pure)", () => {
  it("derives an adjacency graph straight from the zones' portals", () => {
    for (const z of ZONES) {
      expect(Array.isArray(ZONE_ADJ[z.id])).toBe(true);
      for (const p of z.portals || []) expect(ZONE_ADJ[z.id]).toContain(p.to);
    }
    // The links are symmetric in this world (every portal has a return portal).
    for (const [a, b] of zoneEdges()) {
      expect(ZONE_ADJ[a]).toContain(b);
      expect(ZONE_ADJ[b]).toContain(a);
    }
  });

  it("finds the shortest route across the portal graph", () => {
    expect(findRoute("meadow", "meadow")).toEqual(["meadow"]);
    expect(findRoute("meadow", "caverns")).toEqual(["meadow", "shore", "caverns"]);
    expect(findRoute("thicket", "peaks")).toEqual(["thicket", "forest", "meadow", "peaks"]);
    expect(findRoute("meadow", "nowhere")).toBe(null);
    // A route is always a contiguous chain of adjacent zones.
    const r = findRoute("caverns", "thicket");
    for (let i = 0; i < r.length - 1; i++) expect(ZONE_ADJ[r[i]]).toContain(r[i + 1]);
  });

  it("nextZoneStep is the first hop of the route (null when already there)", () => {
    expect(nextZoneStep("meadow", "caverns")).toBe("shore");
    expect(nextZoneStep("thicket", "peaks")).toBe("forest");
    expect(nextZoneStep("meadow", "meadow")).toBe(null);
    expect(nextZoneStep("meadow", "ghost")).toBe(null);
  });
});

describe("Task 13 — bearing / distance / compass (pure)", () => {
  it("bearing uses the atan2(x,z) convention and distance is euclidean", () => {
    expect(bearingRad(0, 1)).toBeCloseTo(0); // +Z
    expect(bearingRad(1, 0)).toBeCloseTo(Math.PI / 2); // +X
    expect(dist2D(0, 0, 3, 4)).toBe(5);
  });

  it("relativeHeading wraps to (-PI, PI] and is camera-relative", () => {
    expect(relativeHeading(0, 1, 0)).toBeCloseTo(0);
    // Target dead behind the camera wraps to PI, not -PI.
    expect(Math.abs(relativeHeading(0, -1, 0))).toBeCloseTo(Math.PI);
    // Rotating the camera to face the target zeroes the arrow.
    expect(relativeHeading(1, 0, Math.PI / 2)).toBeCloseTo(0);
  });

  it("compass8 names the 8 principal directions (north = -Z)", () => {
    expect(compass8(0, -1)).toBe("N");
    expect(compass8(1, 0)).toBe("E");
    expect(compass8(0, 1)).toBe("S");
    expect(compass8(-1, 0)).toBe("W");
    expect(compass8(1, -1)).toBe("NE");
  });
});

describe("Task 20 — minimap heading is un-mirrored (right turn → right on map)", () => {
  // Reproduce the in-game camera-relative movement to define "turn right" by what
  // the player actually does. From Player._updateMove (default camera alpha
  // -PI/2): fwd = (-cos a, -sin a); right = (-sin a, cos a); the world facing the
  // player adopts is atan2(dir.x, dir.z). Pushing the stick right IS a right turn.
  function facingFor(ix, iz, alpha) {
    const fwd = { x: -Math.cos(alpha), z: -Math.sin(alpha) };
    const right = { x: -Math.sin(alpha), z: Math.cos(alpha) };
    return Math.atan2(fwd.x * iz + right.x * ix, fwd.z * iz + right.z * ix);
  }
  // Signed clockwise delta (degrees) between two SCREEN-space directions (y down):
  // positive = the vector rotated clockwise (visually to the right) on screen.
  function cwDeltaDeg(a, b) {
    const angCW = (v) => {
      let r = Math.atan2(v.x, -v.y); // measured clockwise from straight up (-y)
      if (r < 0) r += Math.PI * 2;
      return r;
    };
    let d = ((angCW(b) - angCW(a)) * 180) / Math.PI;
    d = ((d + 540) % 360) - 180;
    return d;
  }

  it("mapVecToScreen mirrors X and keeps north (−Z) up so it is north-up", () => {
    // East (+X) lands on the LEFT (mirrored X), west on the right…
    expect(mapVecToScreen(1, 0)).toEqual({ x: -1, y: 0 });
    expect(mapVecToScreen(-1, 0)).toEqual({ x: 1, y: 0 });
    // …and north (−Z) points UP (negative screen-y), south (+Z) down — north-up.
    expect(mapVecToScreen(0, -1).y).toBeLessThan(0);
    expect(mapVecToScreen(0, 1).y).toBeGreaterThan(0);
  });

  it("a RIGHT turn in the world rotates the minimap arrow CLOCKWISE (right)", () => {
    const a = -Math.PI / 2; // the game's default camera alpha
    const fFwd = facingFor(0, 1, a); // push forward
    const fRight = facingFor(1, 0, a); // push right == turn right
    // Sanity: turning right increases `facing` by ~+PI/2 in world space.
    const worldTurn = ((fRight - fFwd + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    expect(worldTurn).toBeGreaterThan(0);
    // On the minimap the arrow must rotate CLOCKWISE (positive screen delta) — the
    // bug was that it rotated counter-clockwise (left) for a world right-turn.
    const screenDelta = cwDeltaDeg(mapHeadingScreen(fFwd), mapHeadingScreen(fRight));
    expect(screenDelta).toBeGreaterThan(0);
  });

  it("turning right repeatedly always advances clockwise (monotonic, no flip)", () => {
    const a = -Math.PI / 2;
    // A sweep of small right-turn increments stays clockwise the whole way.
    let prev = mapHeadingScreen(facingFor(0, 1, a));
    for (let k = 1; k <= 6; k++) {
      const f = facingFor(Math.sin((k * Math.PI) / 12), Math.cos((k * Math.PI) / 12), a);
      const cur = mapHeadingScreen(f);
      expect(cwDeltaDeg(prev, cur)).toBeGreaterThan(0);
      prev = cur;
    }
  });

  it("the player arrow points along travel: facing +X (east) points left on the mirrored map", () => {
    // facing +X (east) → screen left (mirrored); facing +Z (south) → screen down.
    expect(mapHeadingScreen(Math.PI / 2).x).toBeCloseTo(-1);
    expect(mapHeadingScreen(Math.PI / 2).y).toBeCloseTo(0);
    expect(mapHeadingScreen(0).x).toBeCloseTo(0);
    expect(mapHeadingScreen(0).y).toBeCloseTo(1);
  });
});

describe("Task 20 — map-label layout (no circular clipping, no overlap)", () => {
  const W = 320, H = 320;
  function within(p, pad, halfW) {
    return (
      p.x >= pad + halfW - 0.01 &&
      p.x <= W - pad - halfW + 0.01 &&
      p.y >= pad - 0.01 &&
      p.y <= H - pad + 0.01
    );
  }

  it("clamps every label inside the screen bounds (not the geometry circle)", () => {
    // Anchors deliberately near/over the map rim and off-canvas — the OLD code drew
    // them inside the circular clip, cutting them off. They must come back fully
    // on-screen instead.
    const items = [
      { x: 5, y: 5, text: "Frostpeak Trail" }, // top-left corner
      { x: 315, y: 160, text: "Crystal Caverns" }, // right edge
      { x: 160, y: 318, text: "Sunny Meadow" }, // bottom edge
      { x: -40, y: 160, text: "Whispering Forest" }, // off-canvas left
    ];
    const pad = 12, estWidth = 96, halfW = estWidth / 2;
    const placed = layoutMapLabels(items, W, H, { pad, lineH: 15, estWidth, anchorDy: -9 });
    expect(placed.length).toBe(items.length);
    for (const p of placed) expect(within(p, pad, halfW)).toBe(true);
  });

  it("preserves the text and de-overlaps stacked labels vertically", () => {
    // Three markers piled on the same spot must be nudged onto separate lines.
    const items = [
      { x: 160, y: 160, text: "Alpha", priority: 3 },
      { x: 160, y: 160, text: "Beta", priority: 2 },
      { x: 160, y: 160, text: "Gamma", priority: 1 },
    ];
    const placed = layoutMapLabels(items, W, H, { pad: 12, lineH: 15, estWidth: 60, anchorDy: -9 });
    expect(placed.map((p) => p.text).sort()).toEqual(["Alpha", "Beta", "Gamma"]);
    // No two share a y within the line height (they were separated).
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const close =
          Math.abs(placed[i].x - placed[j].x) < 60 && Math.abs(placed[i].y - placed[j].y) < 15;
        expect(close).toBe(false);
      }
    }
  });

  it("is robust to empty / missing input", () => {
    expect(layoutMapLabels([], W, H)).toEqual([]);
    expect(layoutMapLabels(undefined, W, H)).toEqual([]);
  });
});

describe("Task 13 — map targets, search & layout (pure)", () => {
  it("derives every zone, landmark and NPC as a target (no duplication)", () => {
    expect(MAP_TARGETS.length).toBe(ZONES.length + LOCATIONS.length + NPC_DATA.length);
    expect(MAP_TARGETS.filter((t) => t.kind === "zone").length).toBe(ZONES.length);
    // Landmarks + NPCs live in the hub; zones are their own.
    expect(targetZoneOf("zone", "forest")).toBe("forest");
    expect(targetZoneOf("npc", "mayor")).toBe("meadow");
    expect(targetZoneOf("location", "grove")).toBe("meadow");
    // A whole zone has no specific in-zone point; a landmark does.
    expect(targetPoint("zone", "forest")).toBe(null);
    expect(targetPoint("location", "village")).toEqual({ x: 0, z: -14 });
    expect(targetPoint("npc", "mayor")).toBeTruthy();
  });

  it("validWaypoint accepts only resolvable targets", () => {
    expect(validWaypoint({ kind: "zone", id: "forest" })).toBe(true);
    expect(validWaypoint({ kind: "npc", id: "mayor" })).toBe(true);
    expect(validWaypoint({ kind: "zone", id: "ghost" })).toBe(false);
    expect(validWaypoint(null)).toBe(false);
    expect(validWaypoint({ kind: "bogus", id: "x" })).toBe(false);
  });

  it("search is case/diacritic-folding and matches by display name", () => {
    expect(normalizeText("  FROST ")).toBe("frost");
    expect(matchesQuery("Frostpeak Trail", "frost")).toBe(true);
    expect(matchesQuery("Frostpeak Trail", "swamp")).toBe(false);
    const nameOf = (tg) => T.WorldMapUI.targetName(tg);
    const ids = searchTargets("frost", nameOf).map((t) => t.id);
    expect(ids).toContain("peaks"); // Frostpeak Trail (zone)
    expect(ids).toContain("mountain"); // Frostpeak Pass (landmark)
    // An empty query returns every target.
    expect(searchTargets("", nameOf).length).toBe(MAP_TARGETS.length);
  });

  it("worldLayout positions every zone, hub at the origin, normalised to [-1,1]", () => {
    const lay = worldLayout();
    expect(Object.keys(lay).length).toBe(ZONES.length);
    expect(lay.meadow).toEqual({ x: 0, y: 0 });
    for (const z of ZONES) {
      expect(Math.abs(lay[z.id].x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(lay[z.id].y)).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("Task 13 — runtime waypoint, discovery & persistence", () => {
  beforeAll(() => {
    T.startGame();
    step(4);
  });

  it("resolves a same-zone landmark waypoint with a live bearing + distance", () => {
    const state = T.state,
      player = T.player;
    expect(state.zoneId).toBe("meadow");
    player.root.position.set(0, 0, 0);
    const g = T.resolveWaypoint({ kind: "location", id: "castle" }, state, player);
    expect(g.inZone).toBe(true);
    expect(g.point).toEqual({ x: 0, z: 64 });
    expect(g.dist).toBeCloseTo(64);
    expect(g.arrived).toBe(false);
  });

  it("resolves a cross-zone waypoint to the next portal to take", () => {
    const state = T.state,
      player = T.player;
    const g = T.resolveWaypoint({ kind: "zone", id: "caverns" }, state, player);
    expect(g.inZone).toBe(false);
    expect(g.nextZone).toBe("shore"); // meadow -> shore -> caverns
    expect(g.portal).toBeTruthy();
    expect(g.portal.to).toBe("shore");
  });

  it("the compass arrow angle matches the bearing to the in-zone target", () => {
    // Task 20 — the compass arrow is rotated by relativeHeading(g.dx, g.dz, camYaw)
    // (CSS rotate, clockwise = right). With the camera looking along +Z (camYaw 0)
    // the applied angle is exactly the world bearing to the resolved point.
    const state = T.state,
      player = T.player;
    player.root.position.set(0, 0, 0);
    const g = T.resolveWaypoint({ kind: "location", id: "village" }, state, player); // (0,-14)
    const applied = T.relativeHeading(g.dx, g.dz, 0);
    // relativeHeading wraps to (−PI, PI]; compare DIRECTIONS (the wrapped delta is 0).
    expect(wrapAngle(applied - T.bearingRad(g.dx, g.dz))).toBeCloseTo(0);
    // The target is due north (−Z), so the arrow points straight up (angle ±PI).
    expect(Math.abs(applied)).toBeCloseTo(Math.PI);
  });

  it("the compass arrow points at the NEXT PORTAL for a cross-zone route", () => {
    // For a target in another land the guide aims at the portal to take next; the
    // arrow's bearing must equal the bearing to that portal (not the far target).
    const state = T.state,
      player = T.player;
    player.root.position.set(0, 0, 0);
    const g = T.resolveWaypoint({ kind: "zone", id: "caverns" }, state, player);
    expect(g.portal).toBeTruthy();
    const applied = T.relativeHeading(g.dx, g.dz, 0);
    const portalBearing = T.bearingRad(g.portal.x - 0, g.portal.z - 0);
    expect(applied).toBeCloseTo(portalBearing);
    // Rotating the camera to face the portal zeroes the arrow (it points dead ahead).
    expect(T.relativeHeading(g.dx, g.dz, portalBearing)).toBeCloseTo(0);
  });

  it("setWaypoint stores it; arrival auto-clears when you reach the point", () => {
    const state = T.state,
      player = T.player;
    T.WorldMap.setWaypoint("location", "village"); // village is at (0,-14)
    expect(state.waypoint).toEqual({ kind: "location", id: "village" });
    // Stand on the landmark and tick: the waypoint clears on arrival.
    player.root.position.set(0, 0, -14);
    T.WorldMap.update(0);
    expect(state.waypoint).toBe(null);
  });

  it("clearWaypoint removes an active guide", () => {
    const state = T.state;
    T.WorldMap.setWaypoint("zone", "peaks");
    expect(state.waypoint).toBeTruthy();
    T.WorldMap.clearWaypoint(true);
    expect(state.waypoint).toBe(null);
  });

  it("reveals zones on travel (fog-of-war)", () => {
    const state = T.state;
    expect(state.discovered.meadow).toBe(true);
    expect(state.discovered.forest).toBeFalsy();
    T.zoneManager._swap("meadow", "forest", T.ZONE_BY_ID.forest);
    expect(state.discovered.forest).toBe(true);
    T.zoneManager._swap("forest", "meadow", T.ZONE_BY_ID.meadow);
    expect(state.zoneId).toBe("meadow");
  });

  it("round-trips discovered + waypoint through save/load (v9)", () => {
    const state = T.state;
    state.discovered = { meadow: true, forest: true, shore: true };
    T.WorldMap.setWaypoint("zone", "caverns");
    const save = T.serializeGame();
    expect(save.v).toBe(T.SAVE_VERSION); // v10 (Task 18 added playSec)
    expect(save.discovered).toEqual(expect.arrayContaining(["meadow", "forest", "shore"]));
    expect(save.waypoint).toEqual({ kind: "zone", id: "caverns" });

    // Clobber the live state, then reload.
    state.discovered = {};
    state.waypoint = null;
    T.applySave(save);
    expect(T.state.discovered.forest).toBe(true);
    expect(T.state.discovered.shore).toBe(true);
    expect(T.state.waypoint).toEqual({ kind: "zone", id: "caverns" });
  });

  it("legacy (< v9) saves default to no waypoint and only the saved zone known", () => {
    const legacy = T.serializeGame();
    delete legacy.discovered;
    delete legacy.waypoint;
    legacy.v = 8;
    expect(T.validateSave(legacy)).toBe(true);
    T.applySave(legacy);
    expect(T.state.waypoint).toBe(null);
    expect(T.state.discovered[T.state.zoneId]).toBe(true);
  });

  it("an invalid stored waypoint is dropped on load", () => {
    const save = T.serializeGame();
    save.waypoint = { kind: "zone", id: "ghost" };
    T.applySave(save);
    expect(T.state.waypoint).toBe(null);
  });
});

describe("Task 13 — overlay + minimap are headless-safe", () => {
  it("the world-map overlay opens, searches, selects, guides and closes without throwing", () => {
    T.WorldMapUI.openMap();
    expect(T.WorldMapUI.open).toBe(true);
    T.WorldMapUI.setTab("world");
    T.WorldMapUI.setTab("zone");
    T.WorldMapUI.search("frost");
    T.WorldMapUI.selectTarget({ kind: "zone", id: "peaks" });
    expect(T.WorldMapUI.sel.id).toBe("peaks");
    T.WorldMapUI.guide();
    expect(T.state.waypoint).toEqual({ kind: "zone", id: "peaks" });
    T.WorldMapUI.zoom(1.4);
    T.WorldMapUI.close();
    expect(T.WorldMapUI.open).toBe(false);
    T.WorldMap.clearWaypoint(true);
  });

  it("toggling the minimap + ticking the loop never throws (no canvas)", () => {
    T.WorldMap.toggleMinimap();
    T.WorldMap.toggleMinimap();
    expect(() => {
      T.WorldMap.update(0.1);
      step(2);
    }).not.toThrow();
  });
});

describe("Task 20 — map drawing runs against a real 2D context", () => {
  // The headless DOM stub returns no 2D context, so the drawing short-circuits in
  // the other suites. Here we INJECT a recording CanvasRenderingContext2D mock onto
  // the map canvases and drive the REAL renderMinimap / renderCanvas / drawZoneScene
  // / drawWorldScene code — exercising the un-mirrored projection, the place-name
  // LABEL pass (drawn after the clip) and the waypoint ARROW marker — to prove they
  // execute without throwing and that labels are actually drawn (the real-browser
  // E2E covers the pixels; this guards the logic the sandbox can't boot Babylon for).
  function recordingCtx() {
    const calls = { fillText: [], strokeText: [], clip: 0, save: 0, restore: 0 };
    const noop = () => {};
    const ctx = {
      canvas: { width: 240, height: 240 },
      // geometry
      clearRect: noop, fillRect: noop, strokeRect: noop,
      beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
      arc: noop, arcTo: noop, roundRect: noop, rect: noop,
      stroke: noop, fill: noop,
      save() { calls.save++; }, restore() { calls.restore++; },
      clip() { calls.clip++; },
      translate: noop, rotate: noop, scale: noop, setTransform: noop,
      measureText: (s) => ({ width: String(s).length * 6 }),
      fillText: (s, x, y) => calls.fillText.push({ s: String(s), x, y }),
      strokeText: (s, x, y) => calls.strokeText.push({ s: String(s), x, y }),
      // mutable style props
      fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, font: "",
      textAlign: "", textBaseline: "", lineCap: "", lineJoin: "", globalAlpha: 1,
      _calls: calls,
    };
    return ctx;
  }
  function attach(id) {
    const cv = globalThis.document.getElementById(id);
    const ctx = recordingCtx();
    cv.width = 240; cv.height = 240;
    cv.getContext = () => ctx;
    cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 240 });
    return ctx;
  }

  beforeAll(() => {
    if (!T.state) { T.startGame(); step(4); }
  });

  it("renderMinimap draws the player + plotted markers without throwing", () => {
    const ctx = attach("minimapCanvas");
    T.WorldMap.minimapOn = true;
    expect(() => T.WorldMap.renderMinimap()).not.toThrow();
    // It clipped to the fence circle and ran a balanced save/restore.
    expect(ctx._calls.clip).toBeGreaterThan(0);
    expect(ctx._calls.save).toBe(ctx._calls.restore);
  });

  it("the in-zone full map draws place-name LABELS outside the clip", () => {
    const ctx = attach("mapCanvas");
    T.WorldMapUI.openMap();
    T.WorldMapUI.setTab("zone");
    expect(() => T.WorldMapUI.renderCanvas()).not.toThrow();
    // Portal names are queued during the clipped pass and drawn afterwards — so the
    // label text reaches fillText (labels were previously clipped to the circle).
    expect(ctx._calls.fillText.length).toBeGreaterThan(0);
    // Labels are kept within the canvas bounds (not lost off-screen / behind a clip).
    for (const f of ctx._calls.fillText) {
      expect(f.x).toBeGreaterThanOrEqual(-1);
      expect(f.x).toBeLessThanOrEqual(241);
      expect(f.y).toBeGreaterThanOrEqual(-1);
      expect(f.y).toBeLessThanOrEqual(241);
    }
    T.WorldMapUI.close();
  });

  it("an off-map waypoint draws the rim ARROW without throwing", () => {
    const ctx = attach("minimapCanvas");
    // A far cross-zone target resolves to the next portal; place the player far from
    // it so the marker falls OUTSIDE the fence circle → the edge arrow path runs.
    T.player.root.position.set(0, 0, 0);
    T.WorldMap.setWaypoint("zone", "caverns");
    expect(() => T.WorldMap.renderMinimap()).not.toThrow();
    expect(ctx._calls.save).toBe(ctx._calls.restore); // balanced even on the arrow path
    T.WorldMap.clearWaypoint(true);
  });

  it("the world-overview tab draws zone-name labels without throwing", () => {
    const ctx = attach("mapCanvas");
    T.state.discovered = { meadow: true, forest: true, shore: true, peaks: true };
    T.WorldMapUI.openMap();
    T.WorldMapUI.setTab("world");
    expect(() => T.WorldMapUI.renderCanvas()).not.toThrow();
    expect(ctx._calls.fillText.length).toBeGreaterThan(0);
    T.WorldMapUI.close();
  });
});
