// Task 14 — skill & leveling system. Locks in the level/XP curve, the focus
// resource + regen, the active skill effects (volley / nova / buff / heal), the
// 3-slot quick bar, the deterministic 3-skill FUSION blend + cost, boss-only
// skill drops (seeded → reproducible), the v8 save round-trip + migration, the
// headless-safe skills overlay, and the i18n of skill names.
import { describe, it, expect, beforeAll } from "vitest";
import { scenes, Vec3 } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];

// Reset the player's progression to a clean level-1 state for an isolated test.
function resetProgress() {
  const p = T.player;
  p.progress = T.newProgress();
  T.Skills.init(p);
  T.recomputeStats(p);
  return p;
}

beforeAll(() => {
  T.startGame();
  for (let i = 0; i < 3; i++) scene.onBeforeRenderObservable._fire();
});

describe("Task 14 — leveling curve & focus math (pure)", () => {
  it("xpToNext is positive + increasing; totalXpToReach accumulates it", () => {
    expect(T.xpToNext(1)).toBe(Math.round(50 * Math.pow(1, 1.45) + 40)); // 90
    expect(T.xpToNext(5)).toBeGreaterThan(T.xpToNext(2));
    expect(T.totalXpToReach(1)).toBe(0);
    expect(T.totalXpToReach(3)).toBe(T.xpToNext(1) + T.xpToNext(2));
  });

  it("max focus + health bonus scale with level", () => {
    expect(T.maxFocusForLevel(1)).toBe(40);
    expect(T.maxFocusForLevel(3)).toBe(40 + 2 * 8);
    expect(T.levelHealthBonus(1)).toBe(0);
    expect(T.levelHealthBonus(4)).toBe(3 * 8);
  });

  it("skillsUnlockedAt returns base skills up to a level", () => {
    const at1 = T.skillsUnlockedAt(1);
    expect(at1).toEqual(T.STARTER_SKILL_IDS);
    expect(T.skillsUnlockedAt(6).length).toBeGreaterThan(at1.length);
    for (const id of T.skillsUnlockedAt(6)) expect(T.SKILL_DB[id].source).toBe("base");
  });
});

describe("Task 14 — XP gain & level-up", () => {
  it("gaining XP levels up, grants health + focus, and auto-learns base skills", () => {
    const p = resetProgress();
    expect(p.progress.level).toBe(1);
    expect(p.progress.owned).toContain("firebolt");
    expect(p.progress.owned).not.toContain("frost_nova"); // unlocks at level 2

    T.Skills.gainXp(p, T.xpToNext(1)); // exactly one level
    expect(p.progress.level).toBe(2);
    expect(p.progress.owned).toContain("frost_nova"); // auto-learned on level 2
    expect(p.base.maxHealth).toBe(T.CONFIG.maxHealth + 8); // +8 health/level via base
    expect(p.maxHealth).toBe(T.CONFIG.maxHealth + 8); // recomputed
    expect(T.maxFocusForLevel(p.progress.level)).toBe(48);
  });

  it("a big XP chunk crosses several levels at once", () => {
    const p = resetProgress();
    T.Skills.gainXp(p, T.totalXpToReach(4)); // enough to reach level 4
    expect(p.progress.level).toBe(4);
    expect(p.progress.owned).toContain("war_focus"); // unlock 4
  });

  it("xpFor pays bosses + the dragon far more than a sweet", () => {
    expect(T.Skills.xpFor({ wave: 1 })).toBeLessThan(T.Skills.xpFor({ isBoss: true, cycle: 1 }));
    expect(T.Skills.xpFor({ isBoss: true, cycle: 1 })).toBeLessThan(
      T.Skills.xpFor({ isDragon: true }),
    );
  });
});

describe("Task 14 — focus regen + cooldown ticking", () => {
  it("Skills.update regenerates focus toward the cap and decays cooldowns", () => {
    const p = resetProgress();
    p.progress.focus = 0;
    T.Skills.update(T.state, p, 1); // one second of regen (FOCUS_REGEN = 7)
    expect(p.progress.focus).toBeCloseTo(7, 1);

    p.progress.cooldowns.firebolt = 2;
    T.Skills.update(T.state, p, 0.5);
    expect(p.progress.cooldowns.firebolt).toBeCloseTo(1.5, 2);

    p.progress.focus = 999;
    T.Skills.update(T.state, p, 1);
    expect(p.progress.focus).toBe(T.maxFocusForLevel(p.progress.level)); // clamped to max
  });
});

describe("Task 14 — quick bar assign / activate", () => {
  it("assigning a skill to a slot is dedup'd across slots", () => {
    const p = resetProgress();
    T.Skills.assignSlot(p, 0, "firebolt");
    T.Skills.assignSlot(p, 1, "firebolt"); // same skill → slot 0 is cleared
    expect(p.progress.slots[0]).toBe(null);
    expect(p.progress.slots[1]).toBe("firebolt");
    T.Skills.clearSlot(p, 1);
    expect(p.progress.slots[1]).toBe(null);
  });

  it("a volley skill spends focus, fires its bolts and goes on cooldown", () => {
    const p = resetProgress();
    p.progress.focus = T.maxFocusForLevel(p.progress.level);
    T.Skills.assignSlot(p, 0, "firebolt");
    const def = T.getSkill("firebolt");
    const before = T.state.bolts.length;
    const focus0 = p.progress.focus;
    expect(T.Skills.activate(T.state, p, 0)).toBe(true);
    expect(T.state.bolts.length).toBe(before + def.count); // 3 bolts
    expect(p.progress.focus).toBe(focus0 - def.cost);
    expect(T.Skills.cooldownLeft(p, "firebolt")).toBeGreaterThan(0);
    // Immediately re-firing fails on cooldown.
    expect(T.Skills.activate(T.state, p, 0)).toBe(false);
  });

  it("activation fails without enough focus, and an empty slot is a no-op", () => {
    const p = resetProgress();
    p.progress.cooldowns = {};
    p.progress.focus = 0;
    expect(T.Skills.activate(T.state, p, 0)).toBe(false); // no focus
    expect(T.Skills.activate(T.state, p, 2)).toBe(false); // empty slot
  });

  it("a nova skill damages + chills nearby monsters", () => {
    const p = resetProgress();
    p.progress.focus = 999;
    T.Skills.learn(p, "frost_nova", true);
    T.Skills.assignSlot(p, 0, "frost_nova");
    const m = new T.Monster(scene, T.world.shadow, new Vec3(p.position.x, 0, p.position.z), 1);
    m.hp = m.maxHp = 200;
    T.state.monsters.push(m);
    expect(T.Skills.activate(T.state, p, 0)).toBe(true);
    expect(m.hp).toBeLessThan(200); // took nova damage
    expect(m.slowT).toBeGreaterThan(0); // frost chill applied
    expect(m.slowMul).toBe(0.5);
    // cleanup
    const i = T.state.monsters.indexOf(m);
    if (i >= 0) T.state.monsters.splice(i, 1);
  });

  it("a buff skill applies a timed buff and a heal skill restores health", () => {
    const p = resetProgress();
    p.progress.focus = 999;
    T.Skills.learn(p, "war_focus", true);
    T.Skills.assignSlot(p, 0, "war_focus");
    expect(T.Skills.activate(T.state, p, 0)).toBe(true);
    expect(p.buffs.some((b) => String(b.id).startsWith("skill_"))).toBe(true);

    T.Skills.learn(p, "mend", true);
    T.Skills.assignSlot(p, 1, "mend");
    p.progress.focus = 999;
    p.health = 10;
    expect(T.Skills.activate(T.state, p, 1)).toBe(true);
    expect(p.health).toBeGreaterThan(10);
  });
});

describe("Task 14 — skill fusion (pure + deterministic)", () => {
  it("canFuse accepts 2–3 valid skills and rejects the rest", () => {
    const fb = T.getSkill("firebolt"),
      cs = T.getSkill("chain_spark"),
      fn = T.getSkill("frost_nova");
    expect(T.canFuse([fb])).toBe(false);
    expect(T.canFuse([fb, cs])).toBe(true);
    expect(T.canFuse([fb, cs, fn])).toBe(true);
    expect(T.canFuse([fb, cs, fn, T.getSkill("mend")])).toBe(false); // > 3
    expect(T.canFuse([fb, null])).toBe(false);
  });

  it("blends two volleys: highest effect, summed power, merged element + count", () => {
    const out = T.fuseSkills([T.getSkill("firebolt"), T.getSkill("chain_spark")]);
    expect(out.effect).toBe("volley");
    expect(out.element).toBe("mixed"); // fire + storm disagree
    expect(out.power).toBe(10); // max(7) + 0.5*6 + 0 off
    expect(out.count).toBe(6); // max(3,5) + (2 inputs - 1)
    expect(out.pierce).toBe(3); // max pierce(2) + 1
    expect(out.generated).toBe(true);
    expect(out.source).toBe("fused");
    expect(out.parts).toEqual(["firebolt", "chain_spark"]);
  });

  it("a nova outranks a volley and inherits the frost slow flag", () => {
    const out = T.fuseSkills([T.getSkill("firebolt"), T.getSkill("frost_nova")]);
    expect(out.effect).toBe("nova"); // nova priority > volley
    expect(out.radius).toBeCloseTo(6.9, 5); // max radius(6) * 1.15
    expect(out.slow).toBe(true);
  });

  it("a buff fusion keeps a duration + merged buff stats", () => {
    const out = T.fuseSkills([T.getSkill("mend"), T.getSkill("war_focus")]);
    expect(out.effect).toBe("buff"); // buff(2) outranks heal(1)
    expect(out.duration).toBe(12);
    expect(out.buff.damage).toBe(4);
    expect(out.buff.haste).toBe(0.85);
  });

  it("is fully deterministic (same inputs ⇒ identical result)", () => {
    const a = T.fuseSkills([
      T.getSkill("firebolt"),
      T.getSkill("frost_nova"),
      T.getSkill("chain_spark"),
    ]);
    const b = T.fuseSkills([
      T.getSkill("firebolt"),
      T.getSkill("frost_nova"),
      T.getSkill("chain_spark"),
    ]);
    expect(a).toEqual(b);
  });

  it("fusionCost scales with the inputs' tiers (coins + crystals)", () => {
    const two = T.fusionCost([T.getSkill("firebolt"), T.getSkill("chain_spark")]);
    const withBoss = T.fusionCost([
      T.getSkill("firebolt"),
      T.getSkill("meteor"),
      T.getSkill("tempest"),
    ]);
    expect(two.coins).toBeGreaterThan(0);
    expect(two.crystal).toBeGreaterThan(0);
    expect(withBoss.coins).toBeGreaterThan(two.coins);
  });

  it("Skills.fuse charges coins + crystals and learns a new equippable skill", () => {
    const p = resetProgress();
    T.Skills.learn(p, "chain_spark", true);
    T.state.coins = 5000;
    p.materials.crystal = 50;
    const coins0 = T.state.coins,
      crys0 = p.materials.crystal;
    const made = T.Skills.fuse(T.state, p, ["firebolt", "chain_spark"]);
    expect(made).toBeTruthy();
    expect(p.progress.owned).toContain(made.id);
    expect(p.progress.fused[made.id]).toBeTruthy();
    expect(T.state.coins).toBeLessThan(coins0);
    expect(p.materials.crystal).toBeLessThan(crys0);
    // The fused skill is real + slottable + castable.
    expect(T.Skills.assignSlot(p, 2, made.id)).toBe(true);
    p.progress.focus = 999;
    expect(T.Skills.activate(T.state, p, 2)).toBe(true);
  });

  it("fuse refuses without enough coins / crystals", () => {
    const p = resetProgress();
    T.Skills.learn(p, "chain_spark", true);
    T.state.coins = 0;
    p.materials.crystal = 0;
    expect(T.Skills.fuse(T.state, p, ["firebolt", "chain_spark"])).toBe(null);
  });
});

describe("Task 14 — boss-only skill drops (seeded → reproducible)", () => {
  it("rollBossSkill picks a boss skill deterministically from the unowned pool", () => {
    const p = resetProgress();
    T.setSeed(20260623);
    const a = T.Skills.rollBossSkill(p);
    expect(T.BOSS_SKILL_IDS).toContain(a);

    const p2 = resetProgress();
    T.setSeed(20260623);
    const b = T.Skills.rollBossSkill(p2);
    expect(b).toBe(a); // same seed ⇒ same drop
  });

  it("only ever drops boss skills, and dries up once all are owned", () => {
    const p = resetProgress();
    for (let i = 0; i < T.BOSS_SKILL_IDS.length; i++) {
      const id = T.Skills.rollBossSkill(p);
      expect(T.BOSS_SKILL_IDS).toContain(id);
      expect(T.SKILL_DB[id].source).toBe("boss");
    }
    expect(T.Skills.rollBossSkill(p)).toBe(null); // pool exhausted
  });
});

describe("Task 14 — save / load round-trip + migration", () => {
  it("round-trips level/xp/focus/owned/fused/slots through serialize/applySave (v8)", () => {
    const p = resetProgress();
    T.Skills.gainXp(p, T.totalXpToReach(3));
    T.Skills.learn(p, "chain_spark", true);
    T.state.coins = 5000;
    p.materials.crystal = 50;
    const fused = T.Skills.fuse(T.state, p, ["firebolt", "chain_spark"]);
    T.Skills.assignSlot(p, 1, fused.id);
    p.progress.focus = 33;

    const save = T.serializeGame();
    expect(save.v).toBe(9);
    expect(save.player.progress.level).toBe(3);
    expect(save.player.progress.fused[fused.id]).toBeTruthy();

    T.applySave(save);
    const pr = T.player.progress;
    expect(pr.level).toBe(3);
    expect(pr.owned).toContain(fused.id);
    expect(pr.fused[fused.id].effect).toBe(fused.effect);
    expect(pr.slots[1]).toBe(fused.id);
    expect(pr.focus).toBe(33);
  });

  it("loads an older (v7, no progress block) save cleanly — defaults to level 1", () => {
    const save = T.serializeGame();
    save.v = 7;
    delete save.player.progress;
    expect(T.validateSave(save)).toBe(true);
    expect(() => T.applySave(save)).not.toThrow();
    expect(T.player.progress.level).toBe(1);
    expect(T.player.progress.owned.length).toBeGreaterThan(0);
    expect(T.player.progress.slots.some(Boolean)).toBe(true);
  });
});

describe("Task 14 — headless-safe skills overlay + i18n", () => {
  it("the skills overlay opens, renders + previews a fusion without throwing", () => {
    const p = resetProgress();
    T.Skills.learn(p, "frost_nova", true);
    expect(() => {
      T.SkillsUI.openUI();
      T.SkillsUI.render();
      T.SkillsUI.pick("firebolt");
      T.SkillsUI.pick("frost_nova"); // selects 2 → fusion preview renders
      T.SkillsUI.render();
      T.SkillsUI.close();
    }).not.toThrow();
    expect(T.SkillsUI.open).toBe(false);
  });

  it("resolves skill names/descriptions + element/effect labels via i18n", () => {
    expect(T.tSkillName(T.getSkill("firebolt"))).toBe("Firebolt Fan");
    expect(T.tElementLabel("fire")).toBe("Fire");
    expect(T.tEffectLabel("nova")).toBe("Nova");
    // A fused (generated) skill composes its name from element + effect labels.
    const fused = T.fuseSkills([T.getSkill("firebolt"), T.getSkill("frost_nova")]);
    expect(T.tSkillName(fused)).toContain("·");
    expect(T.tSkillDesc(fused)).toBeTruthy();
  });

  it("every skill has a complete Russian translation (name + desc)", () => {
    for (const id in T.SKILL_DB) {
      expect(T.RU.skill[id] && T.RU.skill[id].name, id + ".name").toBeTruthy();
      expect(T.RU.skill[id] && T.RU.skill[id].desc, id + ".desc").toBeTruthy();
    }
    for (const el in T.ELEMENTS) expect(T.RU.element[el], "element." + el).toBeTruthy();
    for (const ef in T.EFFECTS) expect(T.RU.effect[ef], "effect." + ef).toBeTruthy();
  });
});
