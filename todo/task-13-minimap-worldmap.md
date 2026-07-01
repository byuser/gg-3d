# Task 13 — Minimap + full‑screen world map with locations, NPCs, search & a guided waypoint

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-23 · Shipped the navigation layer over a new pure `src/data/worldmap.js`
  (zone adjacency from portals, **BFS route-finding** `findRoute`/`nextZoneStep`, bearing/distance +
  an 8-point compass + camera-relative arrow, the searchable `MAP_TARGETS` derived from
  ZONES/LOCATIONS/NPC_DATA, diacritic-folding search, and a deterministic world layout). A live north-up
  **corner minimap** (`WorldMap`, feature-detected 2D canvas: player+facing, portals, NPCs, resources,
  monsters, vendors, castle, waypoint), a `Tab`/🗺️ **full map** (`WorldMapUI`) with a detailed
  current-land view + a fog-of-war **world overview** of the portal graph, a name **search** + results,
  and a **"Guide me there"** waypoint — an on-screen **compass** (with the next portal to take across
  lands) that **clears on arrival**. Discovered lands + the active waypoint **round-trip** through
  save/load (`SAVE_VERSION` → **9**; older saves default). New `test/worldmap.test.js` (20 cases;
  Vitest 80 → 100) + a Playwright map flow. EN/RU localized; `data-i18n-ph` placeholders added.
- **Depends on:** none (reads `ZONES`/`LOCATIONS`/`NPC_DATA`); complements the
  story tracker from Task 2.
- **Goal.** Add a corner **minimap** and a **full‑screen world/zone map** showing
  all locations and NPCs, with **search** and a **guide system** that points the
  player toward any selected city/point/NPC (on‑screen direction + map waypoint),
  the way large open‑world RPGs do.
- **Scope (build this):**
  - **Minimap (HUD).** A live corner map of the current zone: player position +
    facing, nearby NPCs/landmarks/resource nodes/portals/monsters, north
    indicator, and the active quest objective. Cheap to render (2D canvas/SVG
    over the scene, not a second 3D view); toggleable; mobile‑friendly.
  - **Full map (overlay).** A pannable/zoomable full‑screen map. Two levels: the
    **current zone** (detailed) and a **world overview** of all zones and how they
    connect (the portal graph), with discovered/undiscovered (fog‑of‑war) state if
    feasible. Icons for cities/landmarks (`LOCATIONS`), NPCs (`NPC_DATA`), the
    castle, shops, portals.
  - **Search.** A search box that filters/locates any city/point/NPC by name
    (i18n‑aware), jumping the map to it and offering "guide me there."
  - **Guide/waypoint system.** Selecting a target sets a **waypoint**: an
    on‑screen **compass/direction arrow** (and a world marker/beam) pointing the
    way, with distance, and — across zones — which **portal** to take next
    (route through the zone graph). Clears on arrival.
  - **Persistence.** Persist discovered locations + the active waypoint in
    save/load; bump `SAVE_VERSION` if needed; old saves default sanely.
- **Acceptance criteria:**
  - The minimap correctly shows the player and nearby points of interest and
    updates live; the full map shows all zones/locations/NPCs and their links.
  - Searching for a city/NPC locates it; selecting it shows a clear on‑screen
    direction (and the next portal when it's in another zone) and distance; the
    guide clears on arrival.
  - Works on desktop + mobile, never freezes, headless‑safe; discovered/waypoint
    state round‑trips through save/load.
- **Tests to add:** the world‑graph/route‑finding (next‑portal toward a target
  zone) is a pure, tested function; bearing/distance math is unit‑tested;
  discovered‑location + waypoint **save/load round‑trip**; map data derives from
  `ZONES`/`LOCATIONS`/`NPC_DATA` (no hard‑coded duplication).
- **Files:** `js/game.js` (a `Map`/`Minimap`/`Waypoint` module, route‑finder over
  `ZONES` portals, HUD hooks, `serializeGame`/`applySave`),
  `index.html`/`css` (map/minimap UI, compass; bump `?v=`), `test/harness.js`,
  `README.md`.
- **Out of scope:** real cartographic terrain rendering or a 3D worldmap — a
  clean stylized 2D map is the target.

