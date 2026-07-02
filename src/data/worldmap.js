// Data: the world-map graph + pure geometry / route helpers (Task 13).
//
// Everything here is pure and headless-safe: a zone adjacency graph derived from
// each zone's portals, BFS route-finding across that graph, bearing/distance
// math, an 8-point compass, a deterministic radial layout for the world overview
// and the searchable list of map targets — all derived from ZONES + LOCATIONS +
// NPC_DATA with no hard-coded duplication. The runtime Minimap / WorldMap / the
// guided waypoint read these; the tests exercise them directly.

import { ZONES, ZONE_BY_ID, HUB_ZONE } from "./zones.js";
import { LOCATIONS, LOCATION_BY_ID, NPC_DATA, NPC_BY_ID, landmarkZone } from "./content.js";

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

  // ---- Minimap heading (north-up, un-mirrored) ------------------------------
  // The corner minimap and the in-zone full-map are NORTH-UP top-down views. To
  // read like a real overhead map — turning RIGHT in the world turns the marker
  // RIGHT (clockwise) on the map — the world→screen projection MIRRORS the X axis
  // (screen x = -worldX) while keeping +Z pointing down, so north (−Z) stays UP.
  // (Without the mirror the rotation sense inverts: a right turn spins the marker
  // left. Fixing it here, at the source, keeps the player arrow and every plotted
  // dot consistent — they all go through the same projection.)
  //
  // `mapHeadingScreen(facing)` returns the unit SCREEN-SPACE direction (x right,
  // y down) the player arrow points for a given world `facing` (atan2(x,z), 0=+Z),
  // and `mapVecToScreen(dx,dz)` maps any world XZ delta into that same space — both
  // pure so the minimap drawing and the heading test share one source of truth.
  function mapVecToScreen(dx, dz) { return { x: -dx, y: dz }; }
  function mapHeadingScreen(facing) {
    return mapVecToScreen(Math.sin(facing || 0), Math.cos(facing || 0));
  }

  // ---- Map-label layout (no circular clipping) ------------------------------
  // Place text labels for the in-zone map so names stay FULLY readable: keep each
  // label inside the screen bounds (never clipped to the geometry circle the map
  // draws), and nudge overlapping labels apart vertically so the common cases
  // don't collide. Pure + headless: it only computes positions; the caller draws.
  //
  // `items`: [{ x, y, text, priority? }] anchor points (canvas px, the marker the
  // label belongs to). Returns the same list with resolved { x, y } label centres
  // clamped to [pad, W-pad] × [pad, H-pad], higher-priority labels winning their
  // spot first. `lineH` is the vertical span reserved per label for overlap tests.
  function layoutMapLabels(items, W, H, opts) {
    const o = opts || {};
    const pad = o.pad == null ? 14 : o.pad;
    const lineH = o.lineH == null ? 13 : o.lineH;
    const halfW = (o.estWidth == null ? 60 : o.estWidth) / 2;
    const dy = o.anchorDy == null ? -8 : o.anchorDy; // default: label above the marker
    const minX = pad + halfW, maxX = Math.max(minX, W - pad - halfW);
    const minY = pad, maxY = Math.max(minY, H - pad);
    const clampX = (v) => Math.max(minX, Math.min(maxX, v));
    const clampY = (v) => Math.max(minY, Math.min(maxY, v));
    // Resolve in priority order (stable for equal priority) so important labels
    // (e.g. the waypoint / portals) claim their natural slot first.
    const ordered = (items || [])
      .map((it, i) => ({ it, i }))
      .sort((a, b) => ((b.it.priority || 0) - (a.it.priority || 0)) || (a.i - b.i));
    const placed = [];
    const out = new Array((items || []).length);
    for (const { it, i } of ordered) {
      let lx = clampX(it.x);
      let ly = clampY(it.y + dy);
      // Push down (then up) until this label clears already-placed ones.
      let guard = 0;
      const collides = (yy) =>
        placed.some((p) => Math.abs(p.x - lx) < halfW * 2 && Math.abs(p.y - yy) < lineH);
      while (collides(ly) && guard < 40) {
        const down = clampY(ly + lineH);
        if (!collides(down) && down !== ly) { ly = down; break; }
        const up = clampY(it.y + dy - lineH * (guard + 1));
        if (!collides(up)) { ly = up; break; }
        ly = down;
        guard++;
      }
      placed.push({ x: lx, y: ly });
      out[i] = { x: lx, y: ly, text: it.text, priority: it.priority || 0 };
    }
    return out;
  }

  // ---- Travelling vendors (Task 40) -----------------------------------------
  // The merchant, blacksmith and apothecary now trade in EVERY land — a caravan
  // camped by the road into each wild zone, and the permanent plaza/forge/
  // apothecary in the hub. Unlike a landmark or NPC they have NO single home zone:
  // they follow the player, so a "vendor" waypoint resolves to the vendor in the
  // CURRENT zone at runtime (see the game's waypointZoneOf / waypointPoint). Listed
  // here as pure data so they appear in the map search + the guided-waypoint UI;
  // display names + the live in-zone point are supplied by the runtime.
  const VENDOR_TARGETS = [
    { kind: "vendor", id: "merchant", icon: "🪙" },
    { kind: "vendor", id: "blacksmith", icon: "⚒️" },
    { kind: "vendor", id: "apothecary", icon: "⚗️" },
  ];
  const VENDOR_ID_SET = {};
  for (const v of VENDOR_TARGETS) VENDOR_ID_SET[v.id] = true;

  // ---- Map targets (searchable) ---------------------------------------------
  // Every zone, every landmark, every story NPC and the three travelling vendors,
  // as data only (no display names — the UI resolves those through i18n so this
  // index stays translation-agnostic). Each landmark / NPC carries its HOME ZONE
  // (Task 38: grove → forest, seaside → shore, …; the hub landmarks stay in the
  // meadow) plus its in-zone point, so the world-map / waypoint route to where the
  // NPC actually stands. Vendor NPCs (the apothecary) are NOT listed as fixed NPC
  // targets — they are travelling vendors (Task 40), resolved to the current land.
  function mapTargets() {
    const out = [];
    for (const z of ZONES) out.push({ kind: "zone", id: z.id, zoneId: z.id, icon: z.icon });
    for (const l of LOCATIONS) out.push({ kind: "location", id: l.id, zoneId: landmarkZone(l.id), x: l.x, z: l.z, icon: l.icon });
    for (const n of NPC_DATA) {
      if (n.vendor) continue; // travelling vendors are added below, not pinned to a home zone
      const l = LOCATION_BY_ID[n.loc];
      out.push({ kind: "npc", id: n.id, zoneId: landmarkZone(n.loc), x: (l ? l.x : 0) + 3, z: (l ? l.z : 0) + 3, icon: n.icon });
    }
    for (const v of VENDOR_TARGETS) out.push({ kind: v.kind, id: v.id, icon: v.icon });
    return out;
  }
  const MAP_TARGETS = mapTargets();

  // Which zone a target lives in, and its in-zone point (a whole zone has no
  // specific point — arrival just means standing in it). Landmarks + NPCs resolve
  // to their home zone (Task 38) so cross-zone routing leads the player there. A
  // travelling vendor (Task 40) has no fixed home — it returns null here and is
  // resolved to the CURRENT zone + the live vendor point by the runtime.
  function targetZoneOf(kind, id) {
    if (kind === "zone") return ZONE_BY_ID[id] ? id : null;
    if (kind === "location") return LOCATION_BY_ID[id] ? landmarkZone(id) : null;
    if (kind === "npc") { const n = NPC_BY_ID[id]; return n ? landmarkZone(n.loc) : null; }
    return null; // "vendor" (and unknown kinds): resolved dynamically at runtime
  }
  function targetPoint(kind, id) {
    if (kind === "location") { const l = LOCATION_BY_ID[id]; return l ? { x: l.x, z: l.z } : null; }
    if (kind === "npc") {
      const n = NPC_BY_ID[id];
      const l = n && LOCATION_BY_ID[n.loc];
      return l ? { x: l.x + 3, z: l.z + 3 } : null;
    }
    return null; // "vendor": the live camp point comes from the runtime, not data
  }
  // Is `wp` (a {kind,id}) a valid, resolvable target?
  function validWaypoint(wp) {
    if (!wp || typeof wp !== "object") return false;
    if (wp.kind === "zone") return !!ZONE_BY_ID[wp.id];
    if (wp.kind === "location") return !!LOCATION_BY_ID[wp.id];
    if (wp.kind === "npc") return !!NPC_BY_ID[wp.id];
    if (wp.kind === "vendor") return !!VENDOR_ID_SET[wp.id];
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
  mapVecToScreen, mapHeadingScreen, layoutMapLabels,
  mapTargets, MAP_TARGETS, VENDOR_TARGETS, VENDOR_ID_SET, targetZoneOf, targetPoint, validWaypoint,
  normalizeText, matchesQuery, searchTargets, worldLayout,
};
