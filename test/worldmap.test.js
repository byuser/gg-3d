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
  relativeHeading,
  compass8,
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
    expect(save.v).toBe(9);
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
