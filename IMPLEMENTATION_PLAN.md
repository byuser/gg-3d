# Milestone 1 — RPG world + loadable zones (scratch plan, delete before final commit)

Goal: replace timed waves with an explorable, streamed multi-zone RPG world.
Build on Babylon.js (no framework rewrite — confirmed with user).

## Design
- **ZONES** data table: a hub + several themed zones connected by portals
  (path / bridge / cave-mouth). Each zone: theme (sky/fog/ground/light), radius,
  scenery spec, monster spawn table (kinds + abilities + level + target pop),
  optional boss lair.
- **buildWorld(scene, zone)**: themed terrain + backdrop + scenery; hub-only
  features (river/roads/plaza/landmarks/lampposts) gated behind `zone.home`.
  Returns world contract + `portals` (trigger circles + meshes) + `zone`.
- **SpawnDirector** (replaces WaveSystem): seeds zone population at spawn points,
  monsters wander, and **respawn after a delay** up to a cap. Spawns the lair boss.
  No global wave timer.
- **ZoneManager**: streamed load/unload with a fade overlay (non-freezing).
  Portal = Interactable (walk up + E) and/or trigger volume. Places player at the
  reciprocal arrival portal.
- Hub keeps the full adventure layer (NPCs/merchant/blacksmith/castle/resources).
  Sub-zones are combat/boss areas. Castle build state preserved across rebuilds.
- Quests: `reach` fires on entering matching zone; landmark proximity still works
  in hub. hunt/gather/talk unchanged.
- HUD: location indicator + nearby-enemy count + zone banner; boss bar for lairs;
  retire wave widgets. Fade overlay for transitions.
- Save/load: + current zone id + defeated lair bosses; rebuild on load.

## Stages (commit after each)
1. ZONES data + Monster `spec` (kinds/abilities) extension.
2. buildWorld(scene, zone) refactor + portals + theming.
3. SpawnDirector replacing WaveSystem; wire into loop; HUD counter.
4. ZoneManager streaming + fade + portal travel + player placement.
5. Hub adventure teardown/rebuild + castle state preservation + quests reach.
6. Save/load zone fields; index.html HUD + fade overlay + copy; css.
7. Update test/harness.js; run green; node -c; README + roadmap.
8. Merge to master + push (Pages deploy).

## Verify
- `node test/harness.js` green; `node -c` no syntax errors; headless smoke of
  SpawnDirector + ZoneManager.
