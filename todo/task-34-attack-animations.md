# Task 34 — Rewrite weapon firing & melee attack animations from scratch (MMORPG-grade)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` 2026-07-02 — shipped: the old generic `Swing` is replaced by a
  from-scratch per-weapon-class `AttackAnim` (sword/axe/dagger/fists melee slashes with a
  3-hit sword combo + a tier-gated blade-trail smear, bow draw→release, wand point→release,
  staff channel→release), each with real windup→strike→recovery body involvement (torso
  twist, weight shift, foot plant). Hit timing is preserved (melee lands / projectiles
  release on the strike frame, in arc/reach, once), `dt`-driven, pause-correct and
  headless-safe. Tests: new `test/combat-anim.test.js` + a per-class Playwright clip.
- **Depends on:** Task 5 (the `Swing` state machine) and Task 10 (the impact-frame
  fix) — this **replaces** them; Task 32 (the weapon meshes it animates); the
  `Projectile` / `Hazard` combat system. Pairs with Task 32 (build them together).
- **Goal.** Combat is a **single generic `Swing` arc** (anticipation → impact →
  recovery) reused for every weapon. **Rewrite the firing + attack animations from
  scratch** as a **per-weapon-class** system with real weight and follow-through — the
  distinct, readable attacks of a real MMORPG — without regressing hit timing, pause
  behaviour or headless-safety.
- **Scope (build this):**
  - **A from-scratch, per-weapon-class attack system.** Replace the `Swing` state
    machine with weapon-class animations, each with proper **windup → strike →
    recovery** and body involvement (torso rotation, foot plant, shoulder/hip drive):
    - **Melee:** sword = swept horizontal/diagonal **slashes** with a blade **trail**
      (optionally a 2–3 hit **combo** chain); axe = weighty **overhead chop**; dagger =
      quick **stabs**. The damage lands on the correct **strike frame** in the weapon's
      real arc/reach (preserve the Task 10 impact-frame correctness, per weapon).
    - **Ranged / cast:** bow = **nock → draw → release → recoil** with a string snap;
      wand/staff = **raise → channel (glow) → release**. The `Projectile` spawns on the
      correct **release frame**, aimed from the weapon, not before.
  - **Reactions + feel.** Hit/flinch reactions and follow-through; optional weapon
    trails / muzzle glow gated by the quality tier; idle never looks frozen.
  - **Keep the engine guarantees.** All animation is **time-based / `dt`-driven**,
    frame-rate independent, **pauses correctly** with the pause menu + zone transitions,
    is **feature-detected/headless-safe**, and **tier-gated**. Remove the old `Swing`
    cleanly (no dead code); keep gather/mine motions working (move them onto the new
    system or retain a minimal variant).
- **Acceptance criteria:**
  - Each weapon class has a **distinct, readable** attack with clear windup → strike →
    recovery and weight; ranged/cast release the projectile on the right frame; melee
    lands damage on the right strike frame in the right arc/reach (no early/late/double
    hits, correct facing).
  - Animation is `dt`-driven, frame-rate independent, **pauses** correctly, never throws
    headless, and is tier-gated; the old `Swing` is gone with no regressions to combat,
    gather/mine, or projectiles.
  - Full pipeline green; a real-browser pass shows each weapon's attack reading correctly.
- **Tests to add:** the **per-weapon attack state machine** is pure + tested (windup /
  active / recovery timers; the **strike frame** for melee and the **release frame** for
  ranged; arc/reach gating so out-of-arc/out-of-range targets aren't hit; no double-hit);
  **frame-rate independence** (same result at 30 vs 120 fps); **pause-correctness**;
  headless no-throw; a Playwright clip per weapon class.
- **Files:** `src/game.js` (remove `Swing`; the new per-weapon attack system in
  `Player.update`/attack + `Monster`/`Boss` where they share it, `Projectile` release
  hookup, weapon-trail hook from Task 32, gather/mine motion), `test/*` (a new
  `test/combat-anim.test.js` + the existing animation suite), `README.md`. No
  `SAVE_VERSION` change (animation is transient).
- **Out of scope:** imported skeletal animation clips / a rigging pipeline (keep it
  procedural over the existing primitive body); rebalancing weapon damage (timing parity,
  not balance); new weapon types.
- **Hints:** model each weapon class as its own small, pure state machine with named
  frames (windup/strike|release/recovery) so timing is testable; build it alongside
  Task 32 so the grip + trail anchors match; keep everything `dt`-driven so pause +
  frame-rate independence come for free.

