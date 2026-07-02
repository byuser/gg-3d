# Task 32 — Held weapons: real wand / bow / staff / sword / axe / dagger in hand

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` 2026-07-01 — Shipped: six real per-class held-weapon meshes
  (sword / axe / dagger / bow / staff / wand) chosen by the pure `weaponArchetype(def)`
  selector (class inferred from the weapon's mechanics, material from rarity, explicit
  `held` block wins); each class pre-built once under the right-hand grip so it tracks the
  hand through the EXISTING Swing (Task 34 will animate the per-class trail anchor exposed
  here), with a dual-wield off-hand mirror grip, a centred two-hander, and the bolt/arrow
  muzzle repositioned to the active weapon's tip. Vitest 430 → 441 (+11: selector +
  held-in-hand/no-detachment fit invariants + no-leak); new `test/e2e/worn-weapons.spec.js`
  screenshots all six classes. No `SAVE_VERSION` change (visual only).
- **Depends on:** Task 12 (weapon items + the two hand slots), Task 3, Task 4, and
  Task 34 (the attacks the weapon moves with — pair them). Shared bar above.
- **Goal.** The held-weapon mesh in Lily's hand should look like the **actual weapon
  class** (and vary by material/rarity), be held correctly, and read clearly through the
  new attacks — the believable weapon-in-hand of an MMORPG, not a tinted stick.
- **Scope (build this):**
  - **Per-class weapon meshes.** Distinct, layered procedural meshes per weapon type:
    sword = blade + crossguard + grip + pommel; axe = haft + head; dagger = short blade +
    guard; bow = upper/lower limbs + string + grip; staff = shaft + head/orb; wand =
    shaft + tip. Vary by **material/rarity** (steel vs gold vs dragonscale) and add a
    hookable point for a **weapon trail** (used by Task 34).
  - **Correct grip + handedness.** Anchor one-handed weapons in the main hand (offhand
    weapon when dual-wielding), and seat **two-handed** weapons across the body / both
    hands per the existing slot rules; the weapon follows the hand through the attack and
    is sheathed/hidden sensibly at rest if appropriate. Tier-gate detail.
- **Acceptance criteria:**
  - Each weapon class reads as itself in hand, varied by material/rarity; held in the
    correct hand(s); two-handed weapons positioned correctly; the weapon tracks the hand
    through the new attacks with no detachment/clipping.
  - Disposed on teardown/swap (no leaks); headless-safe; tier-gated; pipeline green; a
    screenshot per weapon class held.
- **Tests to add:** the **weapon-class mesh selector** is pure + tested (every weapon def
  → a valid class mesh + grip anchor + handedness); build/dispose no-leak; a screenshot
  per class.
- **Files:** `src/game.js` (the held-weapon builder in `Player._build`/`refreshWornGear`,
  grip anchors, two-handed handling), `src/data/items.js` (weapon-class/material
  metadata + trail hook), `test/items.test.js` (+ screenshots), `README.md`. No
  `SAVE_VERSION` change.
- **Out of scope:** the attack *motion* (Task 34 — this is the *mesh*); icons; armour
  slots; integration (Task 35).
- **Hints:** build the weapon meshes and the Task 34 animations **together** so the grip
  anchor + trail line up; one class table keyed by weapon type + material keeps it tiny.

