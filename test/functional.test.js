// Functional / integration layer: boots the fully-assembled game (its own
// isolated module instance, separate from the ported-harness suite) and drives
// whole player flows as a black box — start, stream between zones and back, then
// a full save → reload round-trip — asserting the run stays coherent. This is
// the layer that proves the modules compose correctly, not just in isolation.
import { describe, it, expect, beforeAll } from "vitest";
import { scenes, Vec3 } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => {
  for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire();
};

describe("functional flows (isolated boot of the assembled game)", () => {
  beforeAll(() => {
    T.startGame();
    step(10);
  });

  it("starts in the hub with a built, collidable world", () => {
    expect(T.player).toBeTruthy();
    expect(T.world.zone.id).toBe(T.HUB_ZONE);
    expect(T.world.obstacles.length).toBeGreaterThan(0);
    expect(T.player.position && isFinite(T.player.position.x)).toBe(true);
  });

  it("streams to another zone and back, keeping spawn state coherent", () => {
    const zm = T.zoneManager;
    zm._swap(T.state.zoneId, "forest", T.ZONE_BY_ID.forest);
    expect(T.world.zone.id).toBe("forest");
    expect(T.state.zoneId).toBe("forest");
    expect(T.state.monsters.some((m) => m.alive)).toBe(true);
    zm._swap("forest", T.HUB_ZONE, T.ZONE_BY_ID[T.HUB_ZONE]);
    expect(T.world.zone.id).toBe(T.HUB_ZONE);
    expect(T.state.zoneId).toBe(T.HUB_ZONE);
  });

  it("round-trips a full save through serialize → travel → applySave", () => {
    // Stamp some persistent state, then capture it. (Score was retired in Task
    // 19 — XP/level is the run's progression now, so we round-trip that.)
    T.state.relicsFound = 4;
    T.state.coins = 56;
    T.player.materials.wood = 7;
    T.Skills.gainXp(T.player, T.totalXpToReach(3)); // reach level 3
    const lvl = T.player.progress.level;
    const save = T.serializeGame();
    expect(save.v).toBeGreaterThanOrEqual(6);
    expect(T.validateSave(save)).toBe(true);
    expect(save.zone).toBe(T.HUB_ZONE);

    // Drift away: travel to a different zone and clobber the live stats.
    T.zoneManager._swap(T.state.zoneId, "shore", T.ZONE_BY_ID.shore);
    expect(T.state.zoneId).toBe("shore");
    T.state.relicsFound = 0;
    T.state.coins = 0;
    T.player.materials.wood = 0;

    // Reload: the run must come back exactly as saved.
    T.applySave(save);
    expect(T.seed).toBe(save.seed);
    expect(T.state.zoneId).toBe(T.HUB_ZONE);
    expect(T.player.progress.level).toBe(lvl);
    expect(T.state.relicsFound).toBe(4);
    expect(T.state.coins).toBe(56);
    expect(T.player.materials.wood).toBe(7);

    // The world keeps running without throwing after a load.
    step(5);
    expect(isFinite(T.player.position.x)).toBe(true);
  });
});
