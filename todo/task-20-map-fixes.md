# Task 20 — Map subsystem fixes (fit‑to‑screen full map, un‑mirror the minimap, arrow‑shaped target pointer, fully readable labels)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-25 · Fixed all four map defects. The full‑map overlay
  (`#worldmap`) now fits ONE screen (no page scroll): the panel is a `dvh`/`clamp()`‑sized
  flex column whose header/tabs/map/info/actions are fixed and only `#mapResults` scrolls
  internally (portrait stacks the map above a clamped‑height canvas; short landscape keeps
  it beside the list) — verified on desktop + S24 Ultra portrait/landscape. The minimap
  heading is **un‑mirrored at the source**: a pure, tested `mapVecToScreen`/`mapHeadingScreen`
  mirrors the north‑up projection's X axis so turning right in‑world turns the marker right on
  **both** the minimap and the in‑zone map (validated against the camera‑relative facing
  convention, not double‑negated); `mmPlayer` + both `proj()`s share it. A reusable canvas
  **arrow** primitive (`drawMapArrow`, shaft + head) replaces the bare triangle on the minimap
  rim marker (when the waypoint/next‑portal is off‑map) and the on‑screen compass arrow is now
  an inline **SVG arrow** — both unambiguously point at the target / next portal. Place names
  are no longer clipped by the circle: `drawZoneScene` collects portal labels during the clipped
  pass and draws them **after/outside** the clip via a pure `layoutMapLabels` (clamped to screen
  bounds, de‑overlapped) with a haloed plate (`mapLabelText`); world‑overview zone names too.
  No save‑schema change (`SAVE_VERSION` 12 — the waypoint already serialized from Task 13). New
  pure tests (heading sign, bearing→arrow, label layout) + a recording‑2D‑context suite driving
  the real drawing + a Playwright `map.spec.js` (desktop + S24 portrait/landscape) for the
  fit‑to‑screen/scroll bar; Vitest 234 → 247.
- **Depends on:** the map layer (Task 13: `WorldMap`/`WorldMapUI`, `drawZoneScene`,
  `mmPlayer`, `resolveWaypoint`, the compass). Pairs with **Task 16** (HUD chrome —
  the map button is removed there and the map opens from the minimap tap).
- **Goal.** The map subsystem has four concrete defects that make it hard to use:
  the **full map doesn't fit on one screen** (it scrolls), the **minimap rotation
  is mirrored** (turning right in‑world turns you left on the map), the
  **target‑direction indicator is an ambiguous triangle** (you can't tell where it
  points), and **place names are clipped by the circular map border**. Fix all
  four to the readability bar of well‑reviewed open‑world maps.
- **Scope (build this):**
  - **Full map fits one screen (no scroll); NPC list stays scrollable.** Re‑lay the
    full‑map overlay (`#worldmap` / `WorldMapUI`) so the **whole screen fits within
    the viewport** at any supported resolution (the map canvas + controls sized via
    `dvh`/`clamp()` to the safe area, S24 Ultra in both orientations) — **no page
    scroll**. Only the **NPC/results list** scrolls **internally** (`#mapResults` /
    `renderResults()`), as in shipped maps where the world fills the screen and a
    side list scrolls.
  - **Un‑mirror the minimap heading.** The minimap heading is reflected — turning
    **right** in the world rotates the marker **left** on the map. Fix the sign
    convention in the player‑facing/rotation math (`mmPlayer()` ~`game.js:5392`
    and/or the `proj()` axis mapping) so **map rotation matches world rotation** —
    turning right turns the indicator right — consistently on **both** the minimap
    and the in‑zone full‑map view. Verify against the camera/`player.facing`
    convention (north‑up) so it's correct, not just flipped to compensate.
  - **Arrow‑shaped target pointer (replace the triangle).** The
    direction‑to‑target indicator is a bare **triangle** whose pointing end is
    ambiguous. Replace it with a clear **arrow** (shaft + arrowhead, distinct from
    the player marker) for the active **waypoint** direction — on the minimap edge
    marker and the on‑screen **compass** (`#compassArrow` / `_compass()` /
    `resolveWaypoint()`). The arrow must **unambiguously point at the target**
    (and the next portal for cross‑zone routes), the way quest‑compass arrows do in
    big RPGs.
  - **Fully readable place names (no circle clipping).** On the big map, place
    labels are **cut off by the circular clip** (`drawZoneScene` calls `ctx.clip()`
    to a circle ~`game.js:5439`, then draws labels inside it). Make labels **fully
    visible and legible** — e.g. draw labels **after/outside** the geometry clip (so
    text isn't clipped), keep them inside the screen bounds, add a subtle
    halo/background plate for contrast, and nudge/stack to avoid overlap. Names must
    be readable at the S24 Ultra DPI.
  - **i18n + persistence.** Names already resolve via `tZoneName`/`t()` (keep EN+RU
    correct). No save‑schema change expected (waypoint already serializes from
    Task 13).
- **Acceptance criteria:**
  - The **full map fits entirely on one screen** (no scroll) on the S24 Ultra
    (portrait + landscape) and desktop; **only the NPC/results list scrolls**.
  - Turning **right** in the world turns the indicator **right** on the minimap and
    in‑zone map (mirroring fixed), validated against the facing convention.
  - The target‑direction indicator is a clear **arrow** that visibly points at the
    selected target / next portal; it's distinct from the player marker.
  - **Place names render fully and legibly** — **not clipped** by the map circle —
    with enough contrast to read at phone DPI, no overlaps in the common cases.
  - Desktop + mobile; headless‑safe (2D‑canvas feature‑detected); pipeline green.
- **Tests to add:** a **pure heading test** asserting a right‑turn in world space
  yields a right‑turn on the map (sign convention) — locks the un‑mirror; a
  **bearing→arrow** test that the arrow angle matches `resolveWaypoint()`'s bearing
  to the target/next portal; a label‑layout test that computed label positions stay
  within screen bounds (not clipped to the geometry circle); an E2E at the S24 Ultra
  profile asserting the full map has **no scroll** while `#mapResults` does.
- **Files:** `src/game.js` (`mmPlayer`/`proj` heading sign, `drawZoneScene` label
  pass + clip handling, the waypoint **arrow** marker + `_compass`,
  `WorldMapUI` layout/sizing), `index.html`/`css` (`#worldmap` fit‑to‑viewport,
  scrollable results, compass arrow asset/shape), `test/*` (heading/bearing/label +
  E2E), `README.md`.
- **Out of scope:** real cartographic terrain or a 3D map (keep the stylized 2D
  map); reworking route‑finding (Task 13's `findRoute` is fine).
- **Hints:** fix the **sign at the source** (don't double‑negate to fake it); draw
  **labels last**, outside any geometry clip, with a halo; build the arrow as a
  reusable canvas/CSS primitive shared by the minimap edge marker and the compass.

