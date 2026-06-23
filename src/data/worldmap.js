// Data: the world-map graph + pure geometry / route helpers (Task 13).
//
// Everything here is pure and headless-safe: a zone adjacency graph derived from
// each zone's portals, BFS route-finding across that graph, bearing/distance
// math, an 8-point compass, a deterministic radial layout for the world overview
// and the searchable list of map targets — all derived from ZONES + LOCATIONS +
// NPC_DATA with no hard-coded duplication. The runtime Minimap / WorldMap / the
// guided waypoint read these; the tests exercise them directly.

import { ZONES, ZONE_BY_ID, HUB_ZONE } from "./zones.js";
import { LOCATIONS, LOCATION_BY_ID, NPC_DATA, NPC_BY_ID } from "./content.js";

  // ---- Zone adjacency (derived from every zone's portals) -------------------
  const ZONE_ADJ = {};
  for (const z of ZONES) {
    const set = [];
    for (const p of z.portals || []) if (p.to !== z.id && !set.includes(p.to)) set.push(p.to);
    ZONE_ADJ[z.id] = set;
  }

  // The unique undirected links between zones (for drawing the world graph).
  function zoneEdges() {
    const seen = {}, edges = [];
    for (const a in ZONE_ADJ) {
      for (const b of ZONE_ADJ[a]) {
        const key = a < b ? a + "|" + b : b + "|" + a;
        if (seen[key]) continue;
        seen[key] = 1;
        edges.push([a, b]);
      }
    }
    return edges;
  }

  // BFS shortest route across the portal graph: [from, …, to], [from] when they
  // are the same zone, or null when either id is unknown / unreachable.
  function findRoute(fromId, toId) {
    if (!ZONE_BY_ID[fromId] || !ZONE_BY_ID[toId]) return null;
    if (fromId === toId) return [fromId];
    const prev = { [fromId]: null };
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of ZONE_ADJ[cur] || []) {
        if (nb in prev) continue;
        prev[nb] = cur;
        if (nb === toId) {
          const path = [];
          let c = nb;
          while (c != null) { path.unshift(c); c = prev[c]; }
          return path;
        }
        queue.push(nb);
      }
    }
    return null;
  }

  // The next zone to travel to on the way from -> to (the portal target to walk
  // into), or null when already there / unreachable.
  function nextZoneStep(fromId, toId) {
    const route = findRoute(fromId, toId);
    return route && route.length >= 2 ? route[1] : null;
  }

  // ---- Geometry -------------------------------------------------------------
  // Headings use atan2(x, z) (matches Player.facing: 0 = +Z). North on the map is
  // -Z, so the compass measures clockwise from -Z toward +X (east).
  function bearingRad(dx, dz) { return Math.atan2(dx, dz); }
  function dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
  function wrapAngle(a) {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  }
  // A target's world heading relative to the camera's forward heading: 0 = dead
  // ahead (up on screen), positive = clockwise (to the right). Drives the on-
  // screen compass arrow.
  function relativeHeading(dx, dz, camYaw) {
    return wrapAngle(bearingRad(dx, dz) - (camYaw || 0));
  }
  const COMPASS_KEYS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  // The 8-point compass label key for a world delta (north = -Z, clockwise).
  function compass8(dx, dz) {
    if (dx === 0 && dz === 0) return "N";
    let a = Math.atan2(dx, -dz) / (Math.PI * 2); // 0 = N, growing clockwise
    a -= Math.floor(a);
    return COMPASS_KEYS[Math.round(a * 8) % 8];
  }

  // ---- Map targets (searchable) ---------------------------------------------
  // Every zone, every hub landmark and every story NPC, as data only (no display
  // names — the UI resolves those through i18n so this index stays translation-
  // agnostic). LOCATIONS + NPCs live in the hub; each carries its in-zone point.
  function mapTargets() {
    const out = [];
    for (const z of ZONES) out.push({ kind: "zone", id: z.id, zoneId: z.id, icon: z.icon });
    for (const l of LOCATIONS) out.push({ kind: "location", id: l.id, zoneId: HUB_ZONE, x: l.x, z: l.z, icon: l.icon });
    for (const n of NPC_DATA) {
      const l = LOCATION_BY_ID[n.loc];
      out.push({ kind: "npc", id: n.id, zoneId: HUB_ZONE, x: (l ? l.x : 0) + 3, z: (l ? l.z : 0) + 3, icon: n.icon });
    }
    return out;
  }
  const MAP_TARGETS = mapTargets();

  // Which zone a target lives in, and its in-zone point (a whole zone has no
  // specific point — arrival just means standing in it).
  function targetZoneOf(kind, id) {
    if (kind === "zone") return ZONE_BY_ID[id] ? id : null;
    if (kind === "location" || kind === "npc") return HUB_ZONE;
    return null;
  }
  function targetPoint(kind, id) {
    if (kind === "location") { const l = LOCATION_BY_ID[id]; return l ? { x: l.x, z: l.z } : null; }
    if (kind === "npc") {
      const n = NPC_BY_ID[id];
      const l = n && LOCATION_BY_ID[n.loc];
      return l ? { x: l.x + 3, z: l.z + 3 } : null;
    }
    return null;
  }
  // Is `wp` (a {kind,id}) a valid, resolvable target?
  function validWaypoint(wp) {
    if (!wp || typeof wp !== "object") return false;
    if (wp.kind === "zone") return !!ZONE_BY_ID[wp.id];
    if (wp.kind === "location") return !!LOCATION_BY_ID[wp.id];
    if (wp.kind === "npc") return !!NPC_BY_ID[wp.id];
    return false;
  }

  // ---- Search ---------------------------------------------------------------
  // Case/diacritic-fold (and RU ё→е) for forgiving matching.
  const COMBINING = /[\u0300-\u036f]/g;
  function normalizeText(s) {
    s = String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е"); // ё → е
    if (s.normalize) s = s.normalize("NFD").replace(COMBINING, "");
    return s.trim();
  }
  function matchesQuery(name, query) {
    const q = normalizeText(query);
    if (!q) return true;
    return normalizeText(name).includes(q);
  }
  // Filter targets by a query using an injected name resolver (keeps i18n out of
  // this pure module). Empty query returns the whole list.
  function searchTargets(query, nameOf, targets) {
    const list = targets || MAP_TARGETS;
    if (!normalizeText(query)) return list.slice();
    return list.filter((tg) => matchesQuery(nameOf(tg), query));
  }

  // ---- World-overview layout ------------------------------------------------
  // A deterministic radial layout of the zone graph: the hub sits at the origin,
  // each zone is placed by the bearing of the portal that first reaches it (BFS),
  // stepped one ring further out per hop. Returns zoneId -> {x, y} in [-1, 1]
  // (y grows downward, screen-style). Purely derived from ZONES.
  function worldLayout() {
    const pos = { [HUB_ZONE]: { x: 0, y: 0, ring: 0 } };
    const queue = [HUB_ZONE];
    const angleTo = (fromId, toId) => {
      const z = ZONE_BY_ID[fromId];
      const p = z && (z.portals || []).find((pp) => pp.to === toId);
      return p ? p.angle : 0;
    };
    while (queue.length) {
      const cur = queue.shift();
      const base = pos[cur];
      for (const nb of ZONE_ADJ[cur] || []) {
        if (pos[nb]) continue;
        const ang = angleTo(cur, nb);
        pos[nb] = { x: base.x + Math.cos(ang), y: base.y + Math.sin(ang), ring: base.ring + 1 };
        queue.push(nb);
      }
    }
    // Any zone unreachable from the hub (shouldn't happen) gets a fallback ring.
    let k = 0;
    for (const z of ZONES) if (!pos[z.id]) { pos[z.id] = { x: Math.cos(k) * 1.6, y: Math.sin(k) * 1.6 }; k += 1.2; }
    let mx = 0;
    for (const id in pos) mx = Math.max(mx, Math.abs(pos[id].x), Math.abs(pos[id].y));
    mx = mx || 1;
    const out = {};
    for (const id in pos) out[id] = { x: pos[id].x / mx, y: pos[id].y / mx };
    return out;
  }

export {
  ZONE_ADJ, zoneEdges, findRoute, nextZoneStep,
  bearingRad, dist2D, wrapAngle, relativeHeading, compass8, COMPASS_KEYS,
  mapTargets, MAP_TARGETS, targetZoneOf, targetPoint, validWaypoint,
  normalizeText, matchesQuery, searchTargets, worldLayout,
};
