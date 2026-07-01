# Task 33 — Visible jewelry: necklace + rings on the character (additive)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[ ]`
- **Depends on:** Task 12 (the `necklace` + `ring1`/`ring2` slots), Task 3, Task 4.
  Shared bar above. **Net-new scope** (jewelry currently renders no worn mesh).
- **Goal.** Necklaces and rings are equipped but **invisible on the character** (no
  worn mesh, unlike the other 7 slots). Optionally add **subtle visible jewelry** — a
  pendant at the neck and ring(s) on the hands — so accessories read on the model too.
  Lower priority / additive (the model is correct today, just bare).
- **Scope (build this):**
  - **Subtle jewelry meshes.** A small pendant/chain at the neck for `necklace`; a thin
    band (+ a tiny gem) on the hand for rings — tiny, tasteful, tier-gated (likely
    high-tier only so phones skip it), varied by material/rarity.
  - **Fit + finish.** Anchor the pendant to the neck/upper chest (clear of the chest
    piece) and the ring to a hand; rarity/gem colour finish; dispose on teardown/unequip.
- **Acceptance criteria:**
  - Equipped necklace/rings show a subtle, correctly-anchored mesh that doesn't clip the
    chest/gloves; rarity/gem finish visible; cleanly **omitted on low tier** and when the
    slot is empty.
  - Disposed on teardown/unequip; headless-safe; pipeline green; a screenshot with
    jewelry equipped.
- **Tests to add:** the jewelry **spec selector** pure + tested; build/dispose no-leak;
  tier-gating verified; a screenshot.
- **Files:** `src/game.js` (`_buildWornGear` + `WORN_SLOTS` extended for jewelry,
  `refreshWornGear`, `wornDetailFor`), `src/data/items.js` (jewelry metadata),
  `test/items.test.js` (+ screenshot), `README.md`. No `SAVE_VERSION` change.
- **Out of scope:** elaborate jewelry geometry; icons; integration (Task 35). If
  deemed not worth the budget, document the decision and skip — it is explicitly
  additive.
- **Hints:** keep it tiny + high-tier-only so it never costs phone fps; reuse the gem
  colour from rarity.

