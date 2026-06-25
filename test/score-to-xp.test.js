// Task 19 — the legacy arcade "score" is retired and every reward moment now
// feeds the RPG progression (XP / levels). This suite locks in:
//   • each former score event (sweet / boss / dragon kill + artifact pickup)
//     now grants XP via Skills.gainXp with the retuned amount,
//   • the level curve still produces sane pacing once those sources feed it
//     (a pure simulation of a plausible run),
//   • v10 (score-bearing) saves still load — the score field is dropped, and
//     missing XP/level/relicsFound default sanely (migration round-trip),
//   • the new v11 schema round-trips relicsFound,
//   • the end-game / pause recap renders LEVEL + XP + tallies (never "score"),
//   • a grep guard that fails on any lingering `score` identifier in the
//     player-facing source (src/ + index.html + css).
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scenes, Vec3 } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };
const totalXp = (p) => T.totalXpToReach(p.progress.level) + p.progress.xp;

function resetProgress() {
  const p = T.player;
  p.progress = T.newProgress();
  T.Skills.init(p);
  T.recomputeStats(p);
  return p;
}

beforeAll(() => {
  T.startGame();
  step(3);
});

describe("Task 19 — there is no score anywhere", () => {
  it("run state carries no score field (replaced by XP + relicsFound)", () => {
    expect(T.state).toBeTruthy();
    expect("score" in T.state).toBe(false);
    expect(typeof T.state.relicsFound).toBe("number");
  });

  it("the score* config knobs are gone", () => {
    expect(T.CONFIG.scorePerMonster).toBeUndefined();
    expect(T.CONFIG.scorePerArtifact).toBeUndefined();
    expect(T.CONFIG.bossScore).toBeUndefined();
    expect(T.CONFIG.dragonScore).toBeUndefined();
    // The non-score artifact rewards (heal + coins) are deliberately kept.
    expect(T.CONFIG.artifactHeal).toBeGreaterThan(0);
  });

  it("no addScore helper / #score DOM hook remains on the test seam", () => {
    expect(T.addScore).toBeUndefined();
  });
});

describe("Task 19 — former score events now grant XP", () => {
  it("a sweet kill grants xpFor(monster) XP through the live path (no score)", () => {
    const p = resetProgress();
    p.root.position.set(-60, 0, -60); // far from the kill so loot stays put
    T.state.monsters.length = 0;
    const m = new T.Monster(scene, T.world.shadow, new Vec3(40, 0, 40), 3);
    const worth = T.Skills.xpFor(m);
    expect(worth).toBeGreaterThan(0);
    const before = totalXp(p);
    m.hp = 1;
    T.state.monsters.push(m);
    T.state.bolts.push(new T.Projectile(scene, null,
      new Vec3(m.position.x, 1.5, m.position.z), new Vec3(0, 0, 1),
      { damage: 999, radius: (m.radius || 1) + 1, gravity: 0 }));
    step(3);
    expect(totalXp(p)).toBe(before + worth);
  });

  it("a boss is worth far more XP than a sweet, the dragon most of all", () => {
    const sweet = T.Skills.xpFor({ wave: 1 });
    const boss = T.Skills.xpFor({ isBoss: true, cycle: 1 });
    const dragon = T.Skills.xpFor({ isDragon: true });
    expect(sweet).toBeGreaterThan(0);
    expect(boss).toBeGreaterThan(sweet);
    expect(dragon).toBeGreaterThan(boss);
  });

  it("killing a boss through the live path awards its XP (XP replaced bossScore)", () => {
    const p = resetProgress();
    T.state.monsters.length = 0; T.state.drops.length = 0; T.state.coinsList.length = 0;
    p.root.position.set(-60, 0, -60); // stay far so loot stays on the ground
    const boss = new T.Boss(scene, T.world.shadow, new Vec3(50, 0, 50), 10, "stomper");
    const worth = T.Skills.xpFor(boss);
    T.state.boss = boss; T.state.monsters.push(boss);
    const before = totalXp(p);
    boss.hp = 1;
    T.state.bolts.push(new T.Projectile(scene, null,
      new Vec3(boss.position.x, 1.5, boss.position.z), new Vec3(0, 0, 1),
      { damage: boss.maxHp + 50, radius: (boss.radius || 1) + 1, gravity: 0 }));
    step(3);
    expect(totalXp(p)).toBeGreaterThanOrEqual(before + worth);
  });

  it("collecting an artifact grants XP_PER_ARTIFACT (XP replaced scorePerArtifact)", () => {
    const p = resetProgress();
    p.state = "idle"; p.pickT = 0; p.carried = null; p.pendingItem = null;
    p.health = 10; p.maxHealth = 100;
    p.root.position.set(0, 0, 0);
    T.state.coins = 0; T.state.artifacts.length = 0;
    T.state.waveStats = { kills: 0, artifacts: 0, coins: 0 };
    const art = T.spawnArtifact(scene, T.world, T.interaction, p, T.state, null, { pos: [0, 0], color: "#ffffff" });
    const before = totalXp(p);
    art._it.onInteract(art._it);
    for (let i = 0; i < 60 && p.state === "pickup"; i++) p.update(0.05, { alpha: 0 });
    expect(totalXp(p)).toBe(before + T.XP_PER_ARTIFACT);
    expect(T.XP_PER_ARTIFACT).toBeGreaterThan(T.XP_PER_GATHER); // artifacts > a single gather
  });
});

describe("Task 19 — level pacing stays sane under the new XP sources", () => {
  // A pure simulation: a plausible early-to-mid run feeding XP from every source
  // (sweets / gathers / quests / artifacts / a boss). It should land the player
  // a handful of levels in — early levels quick, later ones earned — never
  // hyperinflating to absurd levels nor stalling at level 1.
  function simulateRun() {
    let xp = 0;
    for (let i = 0; i < 30; i++) xp += T.Skills.xpFor({ wave: 2 }); // 30 sweets
    for (let i = 0; i < 6; i++) xp += T.XP_PER_GATHER;             // 6 gathers
    for (let i = 0; i < 4; i++) xp += T.XP_PER_QUEST;             // 4 quests
    for (let i = 0; i < 3; i++) xp += T.XP_PER_ARTIFACT;         // 3 artifacts
    xp += T.Skills.xpFor({ isBoss: true, cycle: 1 });            // 1 boss
    // Resolve into a level via the real curve.
    let level = 1, pool = xp;
    while (pool >= T.xpToNext(level)) { pool -= T.xpToNext(level); level++; }
    return { xp, level };
  }

  it("an early run reaches a few levels (well-paced, not trivial, not runaway)", () => {
    const { xp, level } = simulateRun();
    expect(xp).toBeGreaterThan(0);
    expect(level).toBeGreaterThanOrEqual(3); // meaningful progress
    expect(level).toBeLessThanOrEqual(6);    // not hyperinflated
  });

  it("the curve is strictly increasing so later levels cost more", () => {
    for (let L = 1; L < 12; L++) {
      expect(T.xpToNext(L + 1)).toBeGreaterThan(T.xpToNext(L));
    }
  });

  it("feeding a simulated run's XP to a real player reaches the same level", () => {
    const p = resetProgress();
    const { level } = simulateRun();
    let xp = 0;
    for (let i = 0; i < 30; i++) xp += T.Skills.xpFor({ wave: 2 });
    for (let i = 0; i < 6; i++) xp += T.XP_PER_GATHER;
    for (let i = 0; i < 4; i++) xp += T.XP_PER_QUEST;
    for (let i = 0; i < 3; i++) xp += T.XP_PER_ARTIFACT;
    xp += T.Skills.xpFor({ isBoss: true, cycle: 1 });
    T.Skills.gainXp(p, xp);
    expect(p.progress.level).toBe(level);
  });
});

describe("Task 19 — save migration + round-trip", () => {
  it("a v10 save carrying a `score` field still loads; score is dropped", () => {
    const save = T.serializeGame();
    // Forge a legacy v10 payload: re-add the retired field + downgrade version.
    save.v = 10;
    save.score = 8888;
    delete save.relicsFound;
    expect(T.validateSave(save)).toBe(true);
    expect(() => T.applySave(save)).not.toThrow();
    expect("score" in T.state).toBe(false); // never reintroduced
    expect(typeof T.state.relicsFound).toBe("number"); // defaulted, not NaN
    expect(Number.isFinite(T.state.relicsFound)).toBe(true);
  });

  it("an ancient v2 save with no progress + no score loads to level 1", () => {
    const save = T.serializeGame();
    save.v = 2;
    delete save.score;
    delete save.player.progress;
    expect(T.validateSave(save)).toBe(true);
    expect(() => T.applySave(save)).not.toThrow();
    expect(T.player.progress.level).toBe(1);
    expect(T.player.progress.xp).toBeGreaterThanOrEqual(0);
  });

  it("the v11 schema round-trips relicsFound + the XP progression", () => {
    const p = resetProgress();
    T.Skills.gainXp(p, T.totalXpToReach(4));
    T.state.relicsFound = 5;
    const save = T.serializeGame();
    expect(save.v).toBe(T.SAVE_VERSION);
    expect(save.v).toBe(11);
    expect(save.score).toBeUndefined();
    expect(save.relicsFound).toBe(5);
    T.state.relicsFound = 0;
    T.applySave(save);
    expect(T.state.relicsFound).toBe(5);
    expect(T.player.progress.level).toBe(4);
  });
});

describe("Task 19 — end-game + pause recap renders level/XP, never score", () => {
  it("runRecap reports level, total XP earned, and the key tallies", () => {
    const p = resetProgress();
    T.Skills.gainXp(p, T.totalXpToReach(3) + 10);
    T.state.totalKills = 12;
    T.state.relicsFound = 4;
    const r = T.runRecap(T.state);
    expect(r.level).toBe(3);
    expect(r.totalXp).toBe(T.totalXpToReach(3) + 10);
    expect(r.kills).toBe(12);
    expect(r.relics).toBe(4);
  });

  it("the victory screen shows level + XP + tallies, with no 'Score'", () => {
    const p = resetProgress();
    T.Skills.gainXp(p, T.totalXpToReach(5));
    T.state.totalKills = 20; T.state.relicsFound = 5; T.state.won = false;
    expect(() => T.winGame(T.state)).not.toThrow();
    const html = document.getElementById("winText").innerHTML;
    expect(html).toMatch(/Level/);
    expect(html).toMatch(/XP/);
    expect(html).toMatch(/20 monsters/);
    expect(html).not.toMatch(/Score/i);
  });

  it("the game-over screen shows level + XP + tallies, with no 'Score'", () => {
    resetProgress();
    T.state.totalKills = 7; T.state.relicsFound = 2; T.state.over = false; T.state.won = false;
    expect(() => T.gameOver(T.state)).not.toThrow();
    const html = document.getElementById("overText").innerHTML;
    expect(html).toMatch(/Level/);
    expect(html).toMatch(/XP/);
    expect(html).not.toMatch(/Score/i);
  });

  it("the pause stats line shows level + XP, never score", () => {
    const p = resetProgress();
    T.Skills.gainXp(p, T.totalXpToReach(2));
    T.Pause.refreshTexts();
    const html = document.getElementById("pauseStats").innerHTML;
    expect(html).toMatch(/Level/);
    expect(html).toMatch(/XP/);
    expect(html).not.toMatch(/Score/i);
  });

  it("EN + RU recap strings exist and carry no leftover score phrasing", () => {
    for (const key of ["over.tagline", "win.tagline", "pause.stats", "toast.artifact", "recap.tallies"]) {
      const en = T.LOCALES.en[key];
      const ru = T.LOCALES.ru[key];
      expect(en, `en[${key}]`).toBeTruthy();
      expect(ru, `ru[${key}]`).toBeTruthy();
      // No leftover "score/Score/Очки/очк" tokens in either locale's recap copy.
      expect(String(en)).not.toMatch(/score/i);
      expect(String(ru)).not.toMatch(/очк|Очк/);
    }
  });
});

describe("Task 19 — grep guard: no `score` identifier in the player-facing source", () => {
  // The acceptance bar is "grep-clean": no score HUD widget, run-state field,
  // save field, end-screen number or score* config — and nothing references it.
  // We allow ONLY explanatory comments that name the retired feature.
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "..");
  const files = [
    "src/game.js",
    "src/core/config.js",
    "src/core/i18n.js",
    "src/data/skills.js",
    "index.html",
    "css/style.css",
  ];

  // Strip JS line comments + block comments + HTML comments so an explanatory
  // mention of the retired "score" doesn't trip the guard, but live code does.
  function stripComments(src, file) {
    if (file.endsWith(".html")) return src.replace(/<!--[\s\S]*?-->/g, "");
    if (file.endsWith(".css")) return src.replace(/\/\*[\s\S]*?\*\//g, "");
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  }

  it("contains no live `score` token outside comments", () => {
    const offenders = [];
    for (const rel of files) {
      const src = readFileSync(resolve(root, rel), "utf8");
      const code = stripComments(src, rel);
      const re = /\bscore\b/gi;
      let m;
      while ((m = re.exec(code))) {
        // Locate the line for a useful failure message.
        const upto = code.slice(0, m.index);
        const lineNo = upto.split("\n").length;
        offenders.push(`${rel}:${lineNo} → "${code.split("\n")[lineNo - 1].trim()}"`);
      }
    }
    expect(offenders, `lingering score identifiers:\n${offenders.join("\n")}`).toEqual([]);
  });
});
