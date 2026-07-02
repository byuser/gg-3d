# Changelog

All notable changes to **Good Game 3D** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/): newest first, with an
`## [Unreleased]` section at the top for work that has landed but is not yet
described under a dated heading.

**Versioning.** Through **Task 8** the game shipped as a single static file keyed
to the monotonic **`?v=` cache-buster** in `index.html`, so historical entries
carry the build they shipped at — e.g. `## [v19] — 2026-06-22 — …`. **Task 9**
replaced that single file with a **Vite build** whose assets are **content-hashed**
(no more `?v=` to bump), so from Task 9 on, entries are keyed by **date** — e.g.
`## [2026-06-22] — …`. Each entry keeps the task name and the harness/test-count
delta it shipped with, since later tasks reference those.

> **For future runs:** when you finish a task, append your release note here
> (not to `TODO.md`). Add a new `##` heading at the top of the dated list below
> `## [Unreleased]`, keyed by the **date** (the content-hashed build needs no
> version tag).

---

## [Unreleased]

### Fixed

- **Pause-menu sub-panels are reliably tappable at the bottom of a short landscape
  viewport.** The `.sub-panel` `<details>` clipped its own box with `overflow:
  hidden`; when a sub-panel (e.g. **Cloud Saves**) scrolled to the bottom edge of
  the S24 Ultra landscape pause menu, Chromium reported the `<details>` itself as
  the topmost hit-test element at the summary's centre, so taps on the summary were
  swallowed (`<div class="panel menu-panel"> / <details class="sub-panel">
  intercepts pointer events`). The summary now rounds its own corners instead of
  the panel clipping them, restoring the click target. Unblocks the
  `session-s24-landscape` Playwright E2E (resume-via-Continue → open pause → open
  Cloud Saves), which previously timed out on `master`.

### Changed

- **Playwright E2E is parallelised in CI by sharding across machines (~4× faster
  wall-clock).** The real-browser job (`.github/workflows/ci.yml`) now runs as a
  **4-way shard matrix** (`playwright test --shard=i/4`) whose shards execute
  concurrently on separate runners, and caches the Chromium download between runs
  (`~/.cache/ms-playwright`). `playwright.config.js` keeps **one worker per
  machine** on purpose — each test boots Babylon on a *software* WebGL canvas, and
  several boots on one machine starve the CPU enough to flake the tests' own
  boot-readiness waits, so the speed-up comes from concurrent shards, not
  in-runner workers. The per-test budget stays at **240 s** (the heaviest tests
  boot Babylon several times — boot → save → reload → boot again — so a tighter
  cap timed them out). No game or test behaviour changes; all device-profile
  coverage (desktop + S24 Ultra portrait/landscape) is preserved.

## [2026-07-02] — Task 40 — Travelling vendors in every land

The **merchant**, **blacksmith** and **apothecary** used to trade **only** in the hub —
they were created inside the `if (zone.home)` branch of `setupZoneContent`, and only
Meadowgate is `home`, so a player deep in a wild land with a full bag, damaged gear and
no potions had to trek all the way home to buy, sell, repair or restock. Now all three
follow the player: a small **travelling caravan camps by the road into every wild land**,
so a shop is always within reach wherever you roam. Placement is **data-driven** and
deterministic; the **castle & dragon stay hub-only**; **no `SAVE_VERSION` change** (the
world rebuilds vendors from data on every travel/load).

### Changed

- **All three vendors spawn in EVERY zone (the fix).** `setupZoneContent` now creates the
  `Merchant`, `Blacksmith` and `Alchemist` for **every** land — at their permanent village
  plaza / forge / apothecary spots in the hub, or a **travelling-camp** cluster in a wild
  zone — instead of only inside the `if (zone.home)` branch. They register as interactables
  at the usual talk range and open the same `Shop.openShop("merchant")` / `Anvil.openAnvil()`
  / `Shop.openShop("alchemist")` UIs, so walk-up + **E** works in every land.
- **A deterministic per-zone camp beside the entrance road.** A new pure `vendorCampSlots`
  derives the camp from the zone's **primary entrance** (the road toward the hub, Task 22's
  road-edge gateway) + radius, then **settles each vendor clear** of the fence and solid
  scenery (`settleClearPoint`) so nothing lands in an obstacle, in the water or on the
  player's exact arrival tile. A small decorative `buildVendorCamp` (campfire ring, supply
  crates, a pennant — no extra light) ties the three stalls together as one caravan.
- **`Merchant` and `Blacksmith` now `dispose()` (leak fix).** Previously only the `Alchemist`
  had a `dispose()`; `teardownZone` merely **nulled** the merchant/blacksmith, leaking their
  meshes on every hub exit. Because all three are now rebuilt on **every** zone travel, both
  gained a real `dispose()` (remove the interactable + dispose the mesh root), and
  `teardownZone` disposes them + the camp — so travelling never leaks a vendor or a stale
  interactable.
- **The minimap draws all three vendors** (it previously omitted the apothecary glyph, even in
  the hub), and each is a searchable **world-map `vendor` waypoint target** — "guide me to the
  merchant / blacksmith / apothecary" routes to the camp in your **current** land. New runtime
  `waypointZoneOf` / `waypointPoint` resolve a travelling vendor to the live camp (the pure
  `worldmap.js` helpers stay home-agnostic); the apothecary is no longer a fixed hub NPC map
  target. New EN + RU strings (`vendor.*`, `map.kind.vendor`).

### Added

- **`test/travelling-vendors.test.js`** (+12 Vitest) — the Task 40 net: the **deterministic**,
  in-bounds, obstacle-free camp anchor for **every** wild zone (+ the entrance-road anchor and
  spacing); the **regression** that entering a wild land spawns **all three** vendors and
  registers their interactables (the bug = zero vendors outside the hub); that walk-up +
  interact opens the **right UI** per vendor; a **save-load into a non-hub zone** still yields
  usable vendors (no schema bump); the **vendor waypoint** resolving to the current land's camp
  and round-tripping through save/load; the minimap/map carrying all three; and a
  **teardown-disposes-every-vendor-and-the-camp** no-leak check. Updated `test/harness.test.js`
  and `test/npc-zones.test.js` (which encoded the hub-only-vendor assumption) and
  `test/worldmap.test.js` (the vendor map targets). **Vitest 490 → 503.**

## [2026-07-02] — Task 35 — Full-loadout fit & clipping integration

The **final integration pass** of the worn-equipment overhaul (Tasks 25–35). Each category
task made its own part look right in isolation; this one verifies the **whole loadout
together** — every slot equipped at once, with each weapon class's Task 34 attack playing —
so no worn part or the held weapon clips through Lily's body or another part across idle /
walk / each weapon's wind-up → strike → recover / flinch on every tier. Visual only; **no
`SAVE_VERSION` change**.

### Changed

- **The held weapon is seated PROUD of the body at rest.** A full audit found the one
  persistent cross-part clip: with the always-drawn weapon, a wide hilt (a sword/dagger
  crossguard, an axe head) rested against the hip because the fist sits at the torso's edge,
  so the guard's inner tip dipped into the waist. The grip is now seated a touch **outboard
  (±x, away from the body centre) + forward (+z)** of the bare hand (`GRIP_SEAT`, a new named
  fit table read by `_buildHeldWeapons`), so a drawn hilt clears the hip — the weapon still
  grips at the fist (Task 32's grip-local envelope is unchanged) and rides the hand through
  every attack.
- **The sword wind-up cocks less across the chest.** The non-overhead slash's anticipation
  roll (`SWORD_WINDUP_ROLL`, another named fit table) was tightened `0.8 → 0.45 rad` so the
  blade grazes but never plunges through the chest on the wind-up. The **strike (impact/
  release) frame is untouched**, so Task 34's hit timing + reach are exactly as shipped.
- **The cross-part placement is consolidated into named, auditable fit tables** (`GRIP_SEAT`,
  `SWORD_WINDUP_ROLL`, alongside the per-category tables the earlier tasks introduced) and
  exported on the test seam, so the clean fit can't silently rot as future gear / animations
  land.

### Added

- **`test/worngear.test.js`** (+21 Vitest) — the full-loadout regression net. With every slot
  equipped at once it drives the **real** animation (locomotion base + the Task 34 attack
  layer + the per-frame shoulder/cloak follow) and asserts: (a) the **held weapon never
  penetrates the torso/head core** beyond a small graze at idle / walk / every combo step of
  wind-up → strike → recover (the strike frame held clean); (b) the neighbouring pairs stay
  clear with a full suit — **pauldrons outboard** of the torso, the **belt tucked under** the
  chest hem, the **necklace pendant proud** of the breastplate front, the **cloak trailing
  behind** the legs; (c) `refreshWornGear` **shows exactly the equipped parts** (rings hidden
  under gloves) with **no stray mesh** on swap/unequip and nothing on an empty slot; (d)
  every worn + weapon mesh **descends from `player.root`** (so it disposes with the player —
  no orphan leak) and is **never reallocated** across a full-loadout equip + attack churn;
  and (e) a full loadout **builds + refreshes on every graphics tier** (with the documented
  low-tier omissions). **Vitest 469 → 490.**
- **`test/e2e/worn-loadout.spec.js`** — a real-browser Playwright **screenshot matrix**: it
  dresses Lily in a full Ironguard suit + cloak + amulet **and** each of the six weapon
  classes, pins her at the class's strike pose, frames her whole body from the gameplay 3/4
  angle and screenshots each — asserting the loadout + attack render together, the six fully-
  geared strikes **visibly differ**, and no console errors. Registered as the
  `worn-loadout-desktop` + `worn-loadout-s24-{portrait,landscape}` projects (adapting to the
  phone tiers' clean omissions), with the shared `GG_LOCAL_BABYLON` route hook for offline
  sandboxes.

## [2026-07-02] — Task 33 — Visible jewelry: necklace + rings on the character

The additive member of the **worn-equipment overhaul** (Tasks 25–35): necklaces and rings
were equipped but **invisible on the character** — the only two loadout slots with no worn
mesh. They now render a subtle, tasteful piece so accessories read on the model too, without
costing phone fps (it's **high-tier only**) and without touching the save schema.

### Added

- **A worn necklace + rings on Lily.** The `necklace` slot shows a fine collar **chain +
  pendant** at the throat — a small teardrop **pendant** (normal), a round-medallion
  **amulet** (rare), or a heavier twin-chain **torc** with a big faceted gem (epic+) — and
  the `ring1`/`ring2` slots show a slim gem-set band on the left/right hand — a plain
  **band** (normal), a flat **signet** face (rare), or a claw-set **gemband** (epic+).
  Built from procedural primitives (`Player._buildJewelry`), pre-built **once** under a
  shared neck anchor + per-hand ring anchors and just toggled + tinted on equip by
  `refreshWornGear`/`_tintJewelry` (so equipping never allocates or leaks), parented to the
  body so it rides the walk + the Task 34 attack poses for free.
- **`jewelryArchetype(def)` — a pure, tested selector** (`src/data/items.js`) mapping every
  ring/necklace to `{ kind, archetype, material, gem }`: the shape by an explicit
  `jewel:{ archetype, material, gem }` block or inferred from rarity, the **metal** by rarity
  (silver → gold → dragonscale), and the **gem colour** by the item's own signature (a Ring
  of Power's ruby, a Vigor amulet's green, …) or — with none — its **rarity colour**, so a
  plain silver band and an epic gold gemband read apart. The 8 shipped jewelry items each
  carry a signature `jewel.gem`.
- **Correct anchoring, no clipping.** The necklace rides **in front of the chest** (its
  pendant sits proud, clear of any breastplate's collar/gorget); `ring1`/`ring2` ride the
  left/right hands and are **hidden whenever a glove covers the hand**, so a ring never clips
  the glove (it reappears on the bare hand).
- **High-tier only (phones skip it).** `wornDetailFor` gates jewelry to the **desktop high
  tier**; both mobile tiers (low **and** medium) omit it entirely — a clean omission that
  `refreshWornGear` tolerates (guarded like the belt/pauldrons), so equipping jewelry on a
  phone is a no-op that never throws. The tiniest, most additive worn piece pays **zero**
  phone budget.
- **`test/items.test.js`** (+12 tests) — the selector (valid/type-appropriate archetype +
  material + gem for every def; distinct shapes/materials by rarity; the gem = signature or
  rarity colour; pure + total, honours an explicit block, clamps junk, deterministic), the
  **high-tier gate**, the build (every necklace archetype under one anchor + every ring on
  both slots), **shows-exactly-the-equipped-archetype** (necklace + each ring hand), the
  **glove-cover hide rule**, a **throat / at-the-hand fit invariant** (a necklace part sits
  proud in front of the chest; the ring seats at the hand), a **no-leak** equip-churn pass
  while stepping the loop, and a **serialize/applySave round-trip** (no schema change — the
  worn meshes rebuild from the equipped items). **Vitest 457 → 469.**
- **`test/e2e/worn-jewelry.spec.js`** — a real-browser Playwright spec: on the desktop/high
  tier it equips several necklaces (then rings on the bare hand), frames a close-up and
  screenshots each, asserting each maps to its archetype and the shapes/gems **visibly
  differ**; on the **Galaxy S24 Ultra** (portrait + landscape) tier — where jewelry is
  intentionally omitted — it asserts equipping is a clean no-op and the character still
  renders. Registered as the `worn-jewelry-desktop` + `worn-jewelry-s24-{portrait,landscape}`
  projects (with the shared `GG_LOCAL_BABYLON` route hook for offline sandboxes).

### Changed

- **No `SAVE_VERSION` change.** The worn jewelry meshes derive entirely from the already-
  serialized equipped items, so nothing new persists. No regression to combat, gear, quests,
  zones/travel, day-night/weather, pause or save/load.

## [2026-07-02] — Task 34 — Rewrite weapon firing & melee attack animations from scratch

Ninth of the **worn-equipment + combat overhaul** (Tasks 25–35), paired with Task 32's
held weapons: the **attack animations**. The single generic `Swing` (Task 5) — one arc
reused for every weapon — is **replaced from scratch** by a **per-weapon-class** attack
system with real weight and follow-through: each class now reads as its own distinct,
readable move, without regressing hit timing, pause behaviour or headless-safety.

### Added

- **`AttackAnim` — a from-scratch, per-weapon-class attack state machine** (`src/game.js`,
  replacing `Swing`/`SWING_DUR`). Each class declares its own `windup → strike → recover`
  seconds and a movement `family` (`melee` / `ranged` / `cast`), so a heavy **axe** reads
  slow and a **dagger** fast: **sword** = swept diagonal slashes with a **3-hit combo**
  that cycles left→right, right→left, overhead; **axe** = a weighty overhead chop (long,
  heavy recover); **dagger** / **fists** = quick alternating stabs (2-hit one-two);
  **bow** = nock → draw (the string hand pulls back) → release (snap) → recoil; **wand** =
  raise → point → release; **staff** = raise → channel (the orb glow ramps through the
  wind-up) → release. Pure, `dt`-driven and **frame-rate independent** (leftover time rolls
  across phase edges so 30 fps and 120 fps reach the same state), **pause-correct** (a
  zero/negative dt never advances it) and **headless-safe** (no DOM/Babylon).
- **Real body involvement.** `Player._animateAction` maps `(class, phase, progress,
  comboStep)` onto the actual rig — torso rotation (`lean.rotation.y` coil→drive), a weight
  shift (`lean.position.y`), a forward lean and a foot plant (`legR`) on top of the arm
  swing — so attacks land with weight, not just an arm waggle. The held weapon rides the
  right-arm grip (rigid to the arm — it can't detach mid-swing), so posing the arm swings
  the blade.
- **Blade-trail smear** (`_buildAttackFx` / `_setTrail`) — a translucent swoosh that flashes
  along the blade on the melee **strike** frame (rise-then-fade), riding the grip so it
  sweeps with the swing. **Tier-gated** (dropped on the low tier, like the finer weapon
  trims), feature-detected and headless-safe. The **muzzle glow** now *channels* brighter
  through a staff cast's wind-up and *flares* on the ranged/cast **release** frame.
- **`test/combat-anim.test.js`** (new Vitest suite, 16 tests) — the pure `AttackAnim`
  (per-class timers, the strike/release frame, combo chaining + reset + single-hit classes,
  default + pause-correctness), **frame-rate independence** (the loop's fire predicate
  lands the hit exactly once at 30 fps *and* 120 fps, and never drops a committed hit even
  when one giant dt skips the whole strike phase), the **live combat path** (melee lands on
  the strike frame, in arc + range, exactly once — no early/late/double hit, correct
  facing; ranged/cast spawns the full multishot on the release frame, not the wind-up), and
  a headless **no-throw** pass that animates every weapon class. **Vitest 441 → 457.**
- **`test/e2e/combat-anim.spec.js`** — a real-browser Playwright clip per weapon class:
  boots the built site, equips each of the six classes, pins Lily at the class's strike
  (impact/release) pose and screenshots her upper body + weapon, asserting each animates as
  its class, the six strike poses **visibly differ**, and a **wind-up reads differently
  from the strike** (the anticipation → impact arc actually plays). Registered as the
  `combat-anim-desktop` project (with the shared `GG_LOCAL_BABYLON` route hook for offline
  sandboxes).

### Changed

- **The combat loop fires on the attack's strike frame.** The queued `pendingAttack` still
  lands the instant the machine reaches its **strike** (impact for melee / release for
  ranged/cast) phase — or just after, if a big dt skipped it — so damage/projectiles line
  up with the animation exactly as before (Task 10 preserved). `player.swing` is now
  `player.attack`; a ranged **skill** flourish plays the held weapon's own release (or a
  generic wand cast when unarmed/melee). The gather/mine chop moved onto the new system
  unchanged. **No `SAVE_VERSION` change** — attack animation is transient.
- **The old `Swing` / `SWING_DUR` / `SWING_PHASES` are gone** (no dead code). The animation
  suites (`test/harness.test.js`, `test/bugfixes.test.js`, `test/items.test.js`) and the
  worn-gear showcases (`worn-pauldrons` / `worn-gloves` / `worn-weapons` E2E) move to the
  new `player.attack` (`cls` / `phase` / `AttackAnim` / `ATTACK_SPECS`).

## [2026-07-01] — Task 32 — Held weapons: real wand / bow / staff / sword / axe / dagger in hand

Eighth of the **worn-equipment appearance overhaul** (Tasks 25–35): the **held weapon**.
The equipped weapon now renders as a real, layered weapon of its actual **class** in
Lily's hand — a sword, an axe, a dagger, a bow, a staff or a wand — instead of the old
three recoloured stand-ins (one flat blade shared by every melee weapon, one torus bow,
one crystal). Built to ride the **existing** Swing state machine (Task 5); the from-scratch
attack motion + weapon trail are **Task 34**, which hooks the per-class trail anchor
exposed here.

### Added

- **Per-class procedural weapon meshes.** The old three stand-ins (`_buildWand`: a `0.12 ×
  1.1 × 0.03` flat blade + guard for *every* melee weapon, a torus bow, a crystal) are
  replaced by **six** distinct classes, each built from layered primitives: **sword**
  (pommel + wrapped grip + crossguard + tapered blade + point), **axe** (long haft +
  bladed head + cutting edge + back spike), **dagger** (short blade + guard + grip),
  **bow** (central riser + upper/lower limbs curving forward + a taut string), **staff**
  (long shaft + a glowing orb cradled in a clawed cage of prongs) and **wand** (short shaft
  + a glowing crystal star tip). Built from the proven mesh/material helpers, so they're
  **headless-safe**; each carries a hookable **trail/muzzle anchor** at its business end
  for Task 34.
- **`weaponArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every weapon to a `{ archetype, material }` pair.
  UNLIKE the armour selectors (whose archetype implies a material), a weapon's **class is
  intrinsic to how it fights**, so `weaponClassOf` **infers** it from the weapon's own
  mechanics: ranged + projectile shape + hands → **bow** (arrow) / **staff** (2H bolt) /
  **wand** (1H bolt); melee arc / speed / hands → **dagger** (fast, short, 1H) / **axe**
  (wide arc) / **sword** (else). The **material** follows rarity (iron → steel → gold →
  dragonscale). An explicit `held: { archetype, material }` block always wins; junk clamps
  to a drawable pair. The six buyable weapons span all six classes. Exported on the test
  seam.
- **Correct grip + handedness that tracks the existing attack.** Each class is pre-built
  **once** under the right-hand grip (`this.wandGrip`, a child of the right arm pivot), so
  the weapon **tracks the hand through the current Swing for free** — no re-parenting,
  structurally rigid. A **dual-wielded** second one-hander shows on a mirror grip on the
  **left** arm (`this.offGrip`); a **two-handed** weapon shows one centred weapon and
  nothing off-hand. The per-item accent colour (`weapon.color`) tints the weapon's metal on
  equip (with a rarity-scaled glow, wand/staff gems kept bright), so two steel swords of
  different weapons still read apart — real material/rarity variety, not a monochrome tint.
- **Muzzle keeps working.** The shared bolt/arrow origin (`this.wandTip`) + its glow/halo
  are **repositioned to the active ranged weapon's tip** each equip (a wand/staff keeps the
  glowing tip, a bow a dim nock glow, melee drops it), so `tryCast` and skill volleys still
  launch from the business end.
- **Tier-gated** (`wornDetailFor().weaponDetail`). The weapon is part of the core
  silhouette (**always built**); only the finer trims (blade fuller, axe back spike, staff
  prongs, wand shards, bow grip wrap) are dropped on the low tier so phones keep their
  budget.
- **Task 32 tests** — `test/items.test.js` gains the weapon selector suite (validity /
  class-per-mechanic / material-by-rarity / pure-total inference + explicit-block-wins +
  clamp / determinism), a pre-build-once-per-grip (+ the four 1H classes mirrored off-hand)
  + no-leak-across-equip-churn-while-attacking check, the core-silhouette + tier-gate, a
  shows-exactly-the-equipped-class (+ dual-wield off-hand + two-hander) check, a valid-muzzle
  check, and a **held-in-hand + no-detachment fit invariant** (every weapon part is gripped
  in the fist and bounded around the hand; the weapon tip's **arm-frame** position never
  drifts as the game drives the melee/ranged swing, so it can't fly off mid-attack). Suite
  83 → 94; **Vitest 430 → 441**.
- **`test/e2e/worn-weapons.spec.js`** — a real-browser Playwright spec that boots the built
  site, equips each of the six weapon classes, presents the weapon in a steady raised hold,
  frames a 3/4 close-up of Lily's hand + weapon and **screenshots each of the six classes
  held in hand**, asserting each maps to its class, the silhouettes visibly differ, and
  there are no console errors (with the shared `GG_LOCAL_BABYLON` route hook for offline
  sandboxes). Registered as the `worn-weapons-desktop` project in `playwright.config.js`.

### Changed

- **`refreshWeaponVisual` reads the live hands** (not just the merged weapon profile) so it
  can tell a two-handed weapon from a dual-wield, then reveals the matching class group in
  each hand and tints it — pre-built groups are toggled, never reallocated, so equip churn
  can't leak. `p.weaponShown` (`{ main, off }`) + `p.weaponTrailTip` (the active weapon's
  trail/muzzle anchor, for Task 34) are exposed for tests/debugging. `_buildWand` is
  replaced by `_buildHeldWeapons` + `_buildWeaponMeshes` (`this.heldWeapons` /
  `this.heldOffWeapons`, archetype-keyed records of `{ node, mats, tintMats, glowMats, tip,
  meshes }`). No `SAVE_VERSION` change (held weapons are transient visuals).

## [2026-07-01] — Task 31 — Worn cloaks: a real draping cloak per item

Seventh of the **worn-equipment appearance overhaul** (Tasks 25–35): the cloak. Each
`cloak` item now renders as a distinct, real draping cloak — a tapered, segmented cloth
drape with a neck clasp, hung from a back pivot behind the hips and billowing with
motion — instead of the old single flat box on a pivot that swung **through the legs**
on sharp turns.

### Added

- **Per-item procedural cloak archetypes.** The old single flat box (`_buildWornGear`,
  a `0.78 × 1.15 × 0.05` plank whose pivot rotated ±0.5 rad) is replaced by **five**
  distinct drapes, chosen by the item def and built from layered primitives (a few
  vertical fold panels + a clasp/collar + set/material trim): a plain tapered **cape**
  with a round neck clasp (default), a hooded **mantle** with a shawl collar + a hood
  lump (rare/non-set), an overlapping dragonscale **scaled** cloak with climbing scale
  rows + a fanged clasp (Dragonscale), an ornate gold-hemmed **regal** mantle with a
  raised collar + hanging tassels (epic), and a feathered **winged** cloak that flares
  out at the shoulders (legendary). Built from the proven mesh/material helpers, so
  they're **headless-safe**.
- **`cloakArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every `cloak` item to a `{ archetype, material }`
  pair. Each cloak opts in via new `cloak: { archetype, material }` metadata; any cloak
  def without it still resolves a sensible drape from its **set** (Dragonscale → scaled)
  and **rarity** (legendary → winged, epic → regal, rare → mantle, else cape), then
  clamps to the known archetype/material lists so the result is always one the builder
  can draw. Coordinated with `bootArchetype`/`beltArchetype`/`gloveArchetype`/
  `pauldronArchetype`/`chestArchetype`/`helmetArchetype` (shared dragonscale material +
  set motif) so a full **Dragonscale** suit reads as one. Exported on the test seam.
- **Believable billow that stays behind the legs.** The cloak hangs from a single back
  pivot at lean-local `(0, 1.5, −0.3)` — **behind the hips** — with all of its
  low-hanging geometry at group-local z ≤ 0. The per-frame sway is now a **pure,
  dt-driven, frame-rate-independent** updater `cloakBillowStep(cur, moving, walkPhase,
  turn, dt)` that trails the drape **backward** on the move, banks it side-to-side, and
  reacts to sharp **turns** — **clamped so the pivot's x-rotation never goes below 0**
  (never forward). Because the drape is structurally behind the pivot and the billow can
  only trail it further back, the cloak **can't scythe through the legs or feet at any
  frame**. Time-based exponential smoothing (`1 − e^(−rate·dt)`) makes it look identical
  at any frame rate and **freeze exactly when the game pauses** (update stops calling it).
- **Tier-gated** (`wornDetailFor().cloak` / `.cloakSway`). The cloak is part of the core
  silhouette (**always built**, like the gloves/boots); only the per-frame billow + the
  finer fold panels/trims are dropped on the low tier so phones keep their budget (the
  drape then hangs straight behind).
- **Task 31 tests** — `test/items.test.js` gains the cloak-archetype selector suite
  (validity / on-theme distinctness / set-motif sharing / pure-total inference /
  determinism), a pre-build-once-under-the-shared-pivot + no-leak-across-equip-churn
  check, the core-silhouette + tier-gate, a shows-exactly-the-equipped-archetype check,
  a **pure/clamped/pause-correct/frame-rate-independent billow-updater** suite, and a
  **behind-the-legs + above-the-feet sway invariant** (every drape part, swept across the
  whole clamped sway range, stays behind the leg envelope and above the feet). Suite
  73 → 83; **Vitest 420 → 430**.
- **`test/e2e/worn-cloaks.spec.js`** — a real-browser Playwright spec that boots the
  built site, equips several cloaks, turns Lily's back to the lens, holds a steady
  **mid-turn** billow pose, frames a 3/4 rear view of her back and **screenshots distinct
  cloaks draping behind her**, asserting each maps to its archetype, the drape shapes
  visibly differ, and there are no console errors (with the shared `GG_LOCAL_BABYLON`
  route hook for offline sandboxes). Registered as the `worn-cloaks-desktop` project in
  `playwright.config.js`.

### Changed

- **`refreshWornGear` reveals the equipped cloak archetype** under the single back pivot
  and paints it by rarity/set, hiding the other four groups — the pre-built groups are
  toggled, never reallocated, so equip/unequip churn can't leak. `p.gearShown.cloak` /
  `p.gearShown.cloakArchetype` are exposed for tests/debugging. `g.cloak` (a single mesh)
  is replaced by `g.cloaks`, an archetype-keyed record (`{ cape, mantle, scaled, regal,
  winged }`, each `{ node, mats, meshes }`), matching the boots/gloves structure;
  `_animateCloak` now takes `dt` and delegates to the pure `cloakBillowStep`. No
  `SAVE_VERSION` change (cloaks are transient visuals).

## [2026-07-01] — Task 30 — Worn boots: a distinct real pair of boots per item

Sixth of the **worn-equipment appearance overhaul** (Tasks 25–35): the feet. Each
`boots` item now renders as a distinct pair of boots — layered primitives (a shaft up
the shin + a foot/vamp over the existing shoe + a sole/cuff) that ride the leg pivots
and stride with the feet — instead of one plain calf cylinder that could intersect the
leg or punch through the ground.

### Added

- **Per-item procedural boot archetypes.** The two plain calf cylinders
  (`_buildWornGear`, anchored at the shin midpoint, leg-local −0.5) are replaced by
  **five** distinct boots, chosen by the item def and built from layered primitives (a
  shaft up the shin + a foot/vamp over the existing shoe + a sole/cuff + set/material
  trim): a soft leather **shoe** with an ankle collar (default), a tall leather **boot**
  with a folded-over cuff (rare/non-set), a plated iron **greave** + sabaton with a
  pointed metal toe + a knee poleyn (Ironguard), an overlapping dragonscale **sabaton**
  with scale plates climbing the shin + a swept cuff spine (Dragonscale), and an ornate
  gold-trimmed steel **warboot** with a knee boss + a gold rim (epic/legendary). Built
  from the proven mesh/material helpers, so they're **headless-safe**.
- **`bootArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every `boots` item to a `{ archetype, material }` pair.
  Each boot opts in via new `boot: { archetype, material }` metadata; any boots def without
  it still resolves a sensible pair from its **set** (Dragonscale → scaled sabaton,
  Ironguard → plated greave) and **rarity** (legendary/epic → warboot, rare → boot, else
  shoe), then clamps to the known archetype/material lists so the result is always one the
  builder can draw. Coordinated with `beltArchetype`/`gloveArchetype`/`pauldronArchetype`/
  `chestArchetype`/`helmetArchetype` (shared iron/steel/dragonscale materials + matching
  set motifs) so a full **Ironguard**/**Dragonscale** suit — helm + cuirass + shoulders +
  gauntlets + belt + greaves — reads as one. Exported on the test seam.
- **On-foot fit (no ground clip).** Each boot is anchored at the **foot** (each archetype
  group node sits at leg-local (0, −0.62, 0.02), the shoe centre) rather than the shin
  midpoint, so a part's local +y is height above the foot and the whole boot rides the
  leg's **bottom**. Because the group is rigidly parented to the leg pivot (like the shoe
  it sits over) and the leg swing only ever **raises** the foot, nothing new dips below the
  existing shoes — no ground clip. Every part is kept within the shoe's footprint and
  between the sole and mid-shin, so it hugs the leg without clipping it.
- **Tier-gated** (`wornDetailFor().boots` / `.bootDetail`). Boots are part of the core
  silhouette (**always built**, like the gloves/cloak); only the finer trims/scale rows are
  dropped on the low tier so phones keep their budget.
- **Task 30 tests** — `test/items.test.js` gains the boot-archetype selector suite
  (validity/on-theme distinctness/set-motif sharing with chest+pauldrons+gloves+belt+helmet/
  pure-total inference/determinism), a pre-build-once-per-leg + no-leak-across-equip-churn
  check, the core-silhouette + tier-gate, a shows-exactly-the-equipped-archetype check, and an
  **on-leg / no-ground-clip stride invariant** (every boot part centre hugs the foot/shin
  envelope and, sampled across the full leg-swing range, stays at/above the existing shoe
  floor so it never dips below the feet it rides on). Suite 64 → 73; **Vitest 411 → 420**.
- **`test/e2e/worn-boots.spec.js`** — a real-browser Playwright spec that boots the built
  site, equips several boots, holds Lily in a steady **mid-stride** pose, frames a close-up
  of her lower legs + feet and **screenshots distinct boots striding on the feet**, asserting
  each maps to its archetype, the shapes visibly differ, and there are no console errors (with
  the shared `GG_LOCAL_BABYLON` route hook for offline sandboxes). Registered as the
  `worn-boots-desktop` project in `playwright.config.js`.

### Changed

- **`refreshWornGear` reveals the equipped boot archetype pair** (both legs) and paints it by
  rarity/set, hiding the other four groups — the pre-built groups are toggled, never
  reallocated, so equip/unequip churn can't leak. `p.gearShown.boots` /
  `p.gearShown.bootArchetype` are exposed for tests/debugging. `g.boots` changed from an array
  of two cylinders to an archetype-keyed record (`{ shoe, boot, greave, sabaton, warboot }`,
  each `{ nodes:[L,R], mats, meshes }`), matching the gloves/pauldrons structure. No
  `SAVE_VERSION` change (boots are transient visuals).

## [2026-07-01] — Task 29 — Worn belts: a distinct real belt per item

Fifth of the **worn-equipment appearance overhaul** (Tasks 25–35): the waist. Each
`belt` item now renders as a distinct belt — a strap + buckle (+ pouches/plates by
set/material) seated at the waist **below** the chest piece — instead of one plain
cylinder that overlapped the chest band.

### Added

- **Per-item procedural belt archetypes.** The single waist cylinder
  (`_buildWornGear`, which sat at lean-y 0.98 and overlapped the cuirass) is replaced by
  **five** distinct belts, chosen by the item def and built from layered primitives (a
  waist strap band + a buckle + set/material trim): a plain leather **strap** with a square
  buckle (default), a banded iron **plated** war-belt with a broad plate buckle + riveted
  studs (Ironguard), an overlapping dragonscale **scaled** belt with a fanged clasp +
  climbing scales + a hanging side tasset (Dragonscale), a leather **pouched**
  adventurer's belt with a round buckle + hanging pouches (rare/non-set), and an ornate
  gold-trimmed steel **warbelt** with a gem-set boss buckle + a front tasset
  (epic/legendary). Built from the proven mesh/material helpers, so they're
  **headless-safe**.
- **`beltArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every `belt` item to a `{ archetype, material }` pair.
  Each belt opts in via new `belt: { archetype, material }` metadata; any belt without it
  still resolves a sensible pair from its **set** (Dragonscale → scaled clasp, Ironguard →
  banded plated) and **rarity** (legendary/epic → warbelt, rare → pouched, else strap),
  then clamps to the known archetype/material lists so the result is always one the builder
  can draw. Coordinated with `gloveArchetype`/`pauldronArchetype`/`chestArchetype`/
  `helmetArchetype` (shared iron/steel/dragonscale materials + matching set motifs) so a
  full **Ironguard**/**Dragonscale** suit — helm + cuirass + shoulders + gauntlets + belt —
  reads as one. Exported on the test seam.
- **Below-chest fit.** The belt anchor sits at lean-y 0.72 (below the chest envelope's
  lowest reach, ≈ lean-y 0.80, the Ironguard cuirass fauld) with every part's top kept
  ≈ lean-y 0.79, so the band tucks **under** the chest hem and the two never z-fight;
  pouches/tassets hang **down** over the thighs. The belt is parented to the torso (never
  the legs), so it is pose-independent — the stride swings the legs beneath it, and the
  band never enters a leg.
- **Tier-gated** (`wornDetailFor().belt` / `.beltDetail`). The belt is a light extra,
  **omitted entirely on the low tier** (a clean omission, like the old cylinder — only the
  mesh is skipped, the stats still apply); the finer studs/pouches are dropped there too.
- **Task 29 tests** — `test/items.test.js` gains the belt-archetype selector suite
  (validity/on-theme distinctness/set-motif sharing with chest+pauldrons+gloves+helmet/
  pure-total inference/determinism), a pre-build-once-under-one-anchor + no-leak-across-
  equip-churn check, the tier-gate, a shows-exactly-the-equipped-archetype check, and a
  **below-chest + clears-legs fit invariant** (every belt part centre stays under the chest
  envelope and, sampled across a full stride, keeps clear of both leg capsules). Suite
  55 → 64; **Vitest 402 → 411**.
- **`test/e2e/worn-belts.spec.js`** — a real-browser Playwright spec that boots the built
  site, equips several belts under a breastplate, frames a close-up of Lily's waist and
  **screenshots distinct belts seated below the chest hem**, asserting each maps to its
  archetype, the shapes visibly differ, and there are no console errors (with the shared
  `GG_LOCAL_BABYLON` route hook for offline sandboxes). Registered as the
  `worn-belts-desktop` project in `playwright.config.js`.

### Changed

- **`refreshWornGear` reveals the equipped belt archetype** under the single waist anchor
  and paints it by rarity/set, hiding the other four groups — the pre-built groups are
  toggled, never reallocated, so equip/unequip churn can't leak. `p.gearShown.beltArchetype`
  is exposed for tests/debugging, and the low-tier omission (no `g.belts`) is tolerated. No
  `SAVE_VERSION` change (belts are transient visuals).

## [2026-07-01] — Task 28 — Worn gloves & gauntlets: a distinct hand piece per item

Fourth of the **worn-equipment appearance overhaul** (Tasks 25–35): the hands. Each
`gloves` item now renders as a distinct glove/gauntlet — the readable hand armour an
MMORPG wraps around the weapon grip — instead of one plain sphere on each hand.

### Added

- **Per-item procedural glove archetypes.** The single sphere on each hand
  (`_buildWornGear`) is replaced by **five** distinct hand pieces, chosen by the item def
  and built **per hand** from layered primitives (cuff + back-of-hand + finger hint): a
  soft leather **glove** (snug cuff + rounded hand), a laced leather **bracer** (tall
  forearm cuff, rare/non-set), a segmented **iron gauntlet** with a banded cuff, a knuckle
  plate + articulated finger lames (Ironguard), an overlapping **dragonscale** **scaled**
  gauntlet with climbing scales + swept-back gold cuff spines (Dragonscale), and an ornate
  gold-trimmed steel **warplate** with a broad flared cuff + a raised knuckle boss
  (epic/legendary). Built from the proven mesh/material helpers, so they're
  **headless-safe**. Each glove rides its **arm pivot** (like the hand it replaces), so it
  follows the hand through every attack pose for free, and is kept **compact around the
  wrist** so the wand shaft rises cleanly out of the fist — the grip is never swallowed.
- **`gloveArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every `gloves` item to a `{ archetype, material }` pair.
  Each gloves opts in via new `glov: { archetype, material }` metadata; any gloves without
  it still resolves a sensible pair from its **set** (Dragonscale → scaled gauntlet,
  Ironguard → banded gauntlet) and **rarity** (legendary/epic → warplate, rare → bracer,
  else glove), then clamps to the known archetype/material lists so the result is always
  one the builder can draw. Coordinated with `pauldronArchetype`/`chestArchetype`/
  `helmetArchetype` (shared iron/steel/dragonscale materials + matching set motifs) so a
  full **Ironguard**/**Dragonscale** suit — helm + cuirass + shoulders + gauntlets — reads
  as one. Exported on the test seam.
- **Tier-gated glove detail** (`wornDetailFor().gloveDetail`). Gloves are core silhouette
  (always built), but the finer finger lames / cuff trims / spines are dropped on the
  **low** tier so phones keep their budget; equip still applies the stats regardless.
- **Task 28 tests** — `test/items.test.js` gains the glove-archetype selector suite
  (validity/on-theme distinctness/set-motif sharing/pure-total inference/determinism), a
  pre-build-once-per-hand + no-leak-across-equip-churn check, the tier-gate, a
  shows-exactly-the-equipped-archetype check, and a **grip-fit invariant** (every glove
  part's centre stays within a tight radius of the hand and below the weapon shaft, so no
  shape balloons over or climbs the grip). Suite 46 → 55; **Vitest 393 → 402**.
- **`test/e2e/worn-gloves.spec.js`** — a real-browser Playwright spec that boots the built
  site, equips several gloves, frames a close-up of Lily's right hand + the wand grip it
  holds and **screenshots distinct gloves wrapped around the grip**, asserting each maps
  to its archetype, the shapes visibly differ, and there are no console errors (with the
  shared `GG_LOCAL_BABYLON` route hook for offline sandboxes). Registered as the
  `worn-gloves-desktop` project in `playwright.config.js`.

### Changed

- **`refreshWornGear` reveals the equipped glove archetype pair** (both hands) and paints
  it by rarity/set, hiding the other four groups — the pre-built groups are toggled, never
  reallocated, so equip/unequip churn can't leak. `p.gearShown.gloveArchetype` is exposed
  for tests/debugging. No `SAVE_VERSION` change (gloves are transient visuals).

## [2026-07-01] — Task 27 — Worn pauldrons: shoulder armour that sits on the shoulder

Third of the **worn-equipment appearance overhaul** (Tasks 25–35): the shoulders. Each
`pauldrons` item now renders as a distinct, real shoulder piece **seated on the shoulder
joint** instead of the old plain sphere that clipped inward into the torso/chest.

### Added

- **Per-item procedural pauldron archetypes.** The single sphere on each arm
  (`_buildWornGear`) is replaced by **five** distinct shoulder pieces, chosen by the item
  def and built per shoulder from layered primitives: a soft rounded leather **cap** (+ a
  rolled trim), a segmented **iron** cap over stacked **lames** with a rivet ridge
  (Ironguard), an overlapping **dragonscale** cap with climbing scales + a fan of
  swept-back gold **spines** (Dragonscale), a polished trimmed **ornate** plate with a gold
  rim + a boss stud + a lame skirt (rare), and a flared **winged** great-pauldron with a
  broad plate + an upswept fin (epic/legendary). Built from the proven mesh/material
  helpers, so they're **headless-safe**.
- **`pauldronArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every `pauldrons` item to a `{ archetype, material }`
  pair. Each pauldrons opts in via new `paul: { archetype, material }` metadata; any
  pauldrons without it still resolves a sensible pair from its **set** (Dragonscale →
  spiked scale, Ironguard → banded plated) and **rarity** (legendary/epic → winged, rare →
  ornate, else cap), then clamps to the known archetype/material lists so the result is
  always one the builder can draw. Coordinated with `chestArchetype`/`helmetArchetype`
  (shared iron/steel/dragonscale materials + matching set motifs) so a full
  **Ironguard**/**Dragonscale** suit reads as one. Exported on the test seam.
- **`test/e2e/worn-pauldrons.spec.js`** — a real-browser Playwright spec that boots the
  built site, equips several pauldrons, **holds Lily in the melee strike pose** (the phase
  whose arm roll used to swing the old sphere across the chest), frames a close-up of her
  shoulder + chest and **screenshots distinct pauldrons worn mid-attack**, asserting each
  maps to its archetype, the shapes visibly differ, and there's no chest penetration (with
  the shared `GG_LOCAL_BABYLON` route hook for offline sandboxes).

### Fixed

- **Pauldrons no longer dive into the chest.** The old caps were plain spheres parented to
  the **arm pivot**, so the melee strike's big cross-body arm roll (armR.z → +1.2) swung
  them across the torso (inner reach dropped to lean-x ≈ 0.03, deep inside the chest). The
  fix re-anchors each shoulder to its own pivot **on the torso** (`lean`), seated just
  outside the torso surface; `_animatePauldrons()` drives that pivot to follow a fraction
  of the arm's forward/back **pitch** (so the cap still swings with the attack) while its
  **roll is ignored**. Because pitch is a rotation about the X axis, it never changes the
  piece's x-extent — so the shoulder cap's inner reach is **pose-independent** and can
  never enter the chest at any idle/walk/attack pose.

### Changed

- **`refreshWornGear` reveals the equipped pauldron's archetype (on both shoulders).** All
  five archetype groups are pre-built **once** per shoulder under the two stable shoulder
  pivots (`_buildPauldrons`); equipping enables only the matching pair — so leather caps
  and dragonscale spaulders never both show, and **no pauldron mesh is ever reallocated**
  (the no-leak contract holds). The active pair is recoloured/sheened by **rarity**
  (`paint()`), with the set motif carried on Ironguard/Dragonscale. The active archetype is
  tracked on `player.gearShown.pauldronArchetype` (observable for tests).
- **Tier-gating.** `wornDetailFor(tier)` gains a **`pauldronDetail`** knob; the low tier
  still omits the pauldrons entirely (a clean omission — the equip stats still apply, only
  the mesh is skipped), and above it drops the finer lames/spines/skirts.

### Tests

- **`test/items.test.js`**: +9 cases (suite **37 → 46**; Vitest total **384 → 393**) —
  the selector is valid + total for every pauldrons def, gives the shipped pieces distinct
  on-theme archetypes, shares the set motif with the matching chest + helmet,
  infers/clamps for pauldrons with no `paul` block, is deterministic, pre-builds every
  archetype group on both shoulders with materials + meshes, tier-gates the pauldrons,
  shows exactly the equipped pauldron's archetype (and nothing when bare), never
  reallocates the meshes/pivots across equip churn, and — the core fit invariant —
  transforms every built shoulder mesh up the real node chain to prove its innermost
  lean-x is **identical across idle/walk/attack poses** (structural clip-freedom) and stays
  clear of the torso surface.

No `SAVE_VERSION` change — worn pauldrons are transient visuals (nothing new persists).

## [2026-07-01] — Task 26 — Worn chest pieces: layered breastplates & robes per item

Second of the **worn-equipment appearance overhaul** (Tasks 25–35): the chest — the
visual anchor of an armour set — now renders as a distinct, layered torso piece per
item instead of one rarity-tinted z-scaled cylinder.

### Added

- **Per-item procedural chest archetypes.** The single cylinder (`_buildWornGear`) is
  replaced by **five** distinct, layered torso pieces, chosen by the item def: a laced
  **leather vest** (rounded shell + collar yoke + a stitched front seam), a segmented
  **iron cuirass** (breast plate + a central keel + stacked abdominal **lames** +
  shoulder straps + a gorget), an ornate **aegis plate** (sculpted **pectoral** swells
  + a gold gorget + hem band + an embossed emblem boss), an overlapping **dragonscale**
  shell (rows of scales climbing the front + shoulder spines + a glowing sternum gem),
  and a flowing cloth **robe** (soft bodice + a draped over-mantle + a gold sash). Built
  from the proven mesh/material helpers, so they're **headless-safe**.
- **`chestArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every `breastplate` item to a `{ archetype, material }`
  pair. Each breastplate opts in via new `chest: { archetype, material }` metadata; any
  chest without it still resolves a sensible pair from its **set** (Dragonscale → scaled
  plate, Ironguard → banded cuirass) and **rarity** (legendary/epic/rare → ornate plate,
  else vest), then clamps to the known archetype/material lists so the result is always
  one the builder can draw. Coordinated with `helmetArchetype` (shared iron/steel/
  dragonscale materials + matching set motifs) so a full **Ironguard**/**Dragonscale**
  suit reads as one. Exported on the test seam.
- **`test/e2e/worn-chests.spec.js`** — a real-browser Playwright spec that boots the
  built site, equips several breastplates, frames a close-up of Lily's torso and
  **screenshots distinct chests worn**, asserting each maps to its archetype and the
  shapes visibly differ (with the shared `GG_LOCAL_BABYLON` route hook for offline
  sandboxes).

### Changed

- **`refreshWornGear` reveals the equipped breastplate's archetype.** All five archetype
  groups are pre-built **once** under a single stable `chest` anchor (`_buildChests`);
  equipping toggles the anchor and enables only the matching group — so a leather vest
  and a dragonscale plate never both show, and **no chest mesh is ever reallocated** (the
  no-leak contract holds). The helmet + chest reveal now share one `applyArch` helper.
  The active group is recoloured/sheened by **rarity** (`paint()`), with the set motif
  carried on Ironguard/Dragonscale pieces. The active archetype is tracked on
  `player.gearShown.chestArchetype` (observable for tests).
- **Fit + tier-gating.** Chest pieces seat on the torso (`lean`) clear of the **neck**
  (below the head), the **arms** (inside the shoulder pivots), the **belt** (Task 29,
  rides just below) and the **pauldrons** (Task 27, out on the shoulders) in idle/walk/
  attack. `wornDetailFor(tier)` gains a **`chestDetail`** knob that drops the finer
  straps/laces/lames/emblems on the **low** tier so phones keep a simpler shell.

### Tests

- **`test/items.test.js`**: +9 cases (suite **28 → 37**; Vitest total **375 → 384**) —
  the selector is valid + total for every breastplate def, gives the shipped pieces
  distinct on-theme archetypes, shares the set motif with the matching helmet,
  infers/clamps for chests with no `chest` block (incl. a cloth robe), is deterministic,
  pre-builds every archetype group with materials, tier-gates the trim detail, shows
  exactly the equipped breastplate's archetype (and nothing when bare / only one at a
  time), and never reallocates the chest meshes across equip churn. The Vitest Babylon
  stub node now tracks `setEnabled`/`isEnabled` so the "one archetype at a time"
  invariant is checkable headlessly.

No `SAVE_VERSION` change — worn chest pieces are transient visuals (nothing new persists).

## [2026-07-01] — Task 25 — Worn helmets: a distinct, real-looking helm per item

First of the **worn-equipment appearance overhaul** (Tasks 25–35): equipped gear
no longer shows on Lily as one rarity-tinted primitive per slot. Helmets lead.

### Added

- **Per-item procedural helmet archetypes.** The single dome+brim (`_buildWornGear`)
  is replaced by **five** distinct, layered head pieces, chosen by the item def:
  a soft **leather cap** (rolled band + small brim), an open **iron helm** (skull
  cap + brow band + **nasal bar** + **cheek guards** + a low comb), a full
  **great-helm** (barrel + domed top + a dark **visor slit**), a horned
  **dragon helm** (scaled cap + sweeping **horns** + a centre-crest of fins), and a
  banded great-**crown** (gold band + a ring of points + a glowing gem). Built from
  the proven mesh/material helpers, so they're **headless-safe**.
- **`helmetArchetype(def)` selector** (`src/data/items.js`) — a **pure, total,
  deterministic** function mapping every `helmet` item to a `{ archetype, material }`
  pair. Each helmet opts in via new `helm: { archetype, material }` metadata; any
  helmet without it still resolves a sensible pair from its **set** (Dragonscale →
  dragon horns, Ironguard → open iron) and **rarity** (legendary → crown, epic/rare
  → great), then clamps to the known archetype/material lists so the result is always
  one the builder can draw. Exported on the test seam.
- **`test/e2e/worn-helmets.spec.js`** — a real-browser Playwright spec that boots the
  built site, equips several helmets, frames a close-up of Lily and **screenshots
  three+ distinct helmets worn**, asserting each maps to its archetype and the shapes
  visibly differ (with the shared `GG_LOCAL_BABYLON` route hook for offline sandboxes).

### Changed

- **`refreshWornGear` reveals the equipped helmet's archetype.** All five archetype
  groups are pre-built **once** under a single stable `helmet` anchor (`_buildHelmets`);
  equipping toggles the anchor and enables only the matching group — so a leather cap
  and a dragon helm never both show, and **no helm mesh is ever reallocated** (the
  no-leak contract holds). The active group is recoloured/sheened by **rarity**
  (`paint()`), with the set motif carried on Ironguard/Dragonscale pieces. The active
  archetype is tracked on `player.gearShown.helmetArchetype` (observable for tests).
- **Fit + tier-gating.** Helmets seat on the crown at the head anchor with **no
  face/ponytail clipping** in idle/walk/attack (brow band above the eyes, nasal
  between them, cheeks outboard). `wornDetailFor(tier)` gains a **`helmDetail`** knob
  that drops the finer trims (cheek guards, combs, horn tips, extra crown points) on
  the **low** tier so phones keep a simpler shell.

### Tests

- **`test/items.test.js`**: +7 cases (suite **21 → 28**; Vitest total **368 → 375**) —
  the selector is valid + total for every helmet def, gives the four shipped helmets
  four distinct archetypes, infers/clamps for helmets with no `helm` block, is
  deterministic, pre-builds every archetype group with materials, tier-gates the trim
  detail, shows exactly the equipped helmet's archetype (and nothing when bare), and
  never reallocates the helm meshes across equip churn.

No `SAVE_VERSION` change — worn helmets are transient visuals (nothing new persists).

## [2026-07-01] — Task 24 — Russian grammatical morphology (Android-style declensions, gender & plural agreement)

### Added

- **Interpolated Russian nouns are now grammatically declined, and verbs/adjectives
  agree in gender/number.** Russian is heavily inflected, but the localization dropped
  every interpolated noun (`{name}`, `{boss}`, `{zone}`, `{part}`, `{label}`, the giver
  and place in guidance) in its **nominative** form regardless of the case the sentence
  governed, so lines like "Reach {name}", "Defeat {boss} in {zone}" and "{part} raised"
  read broken to a native speaker. `src/core/i18n.js` gains an **Android-/ICU-style
  morphology layer** (pure, headless-safe; the English path collapses to identity):
  - **A declension model** (`RU_NOUNS`) — every interpolated noun (zone / landmark / NPC
    / material / relic / castle part / boss / dragon) carries its **gender** (m/f/n/pl),
    animacy and explicit **case forms** (nominative / genitive / dative / accusative /
    instrumental / prepositional). A rule-based decliner (`declineRegular`) covers regular
    nouns — including the **animate-accusative** rule (Дракон → Дракона) and the **`-ень`
    fugitive vowel** (Камень → Камня) — and fills any case an override omits (`ruForm`).
  - **Case-aware interpolation** — a template requests a case with a `{name:gen}`-style
    tag and the call site passes a `nounRef(group, id, displayName)`; `interp()` declines
    it in Russian and substitutes the plain English name (ignoring the tag) in English, so
    the two locales share one template. Plain `{x}` interpolation is byte-for-byte unchanged.
  - **Gender/number agreement** — an ICU-style `select(gender, forms)` picks the agreeing
    verb/adjective form (`{part} raised` → возведён / возведена / возведено / возведены;
    `{boss} defeated` → повержен / повержена), and the **strengthened Slavic plural**
    (`plural()` + its count-string alias `agree()`) now backs **every** count string
    (2 камня / 5 камней), not just the castle counter.
  - **Retrofit** — the affected RU strings now route their nouns/counts through the new
    helpers: objectives (reach → genitive, gather → accusative, talk → instrumental,
    defeat-boss → accusative + prepositional, build → accusative), toasts (`toast.gathered`
    / `toast.partRaised` / `toast.reached` / `toast.bossDefeated`), the guidance +
    quest-log giver (dative after «к», instrumental after «с») and place (prepositional
    with the right в/на), and the map compass portal (в/на + accusative for motion "to").
- **Tests:** a new `test/i18n-morphology.test.js` (33 cases) covers the decliner across
  all six cases × number (regular + irregular), gender/number agreement, the strengthened
  `plural()`/`agree()` over the one/few/many boundaries (1, 2, 5, 11, 21, 112…), the
  case-aware `interp()` (noun-refs decline in RU, collapse to the English name in EN), a
  **noun-metadata completeness gate** (mirrors the untranslated-key test — no interpolated
  RU noun may ship without its gender + case data), and a retrofit smoke that key RU
  sentences render grammatically; the [28] i18n harness suite is strengthened with the
  plural boundaries. **Vitest 335 → 368.** English is unaffected; no `SAVE_VERSION` change
  (morphology is a display-time transform, nothing new is persisted).

## [2026-06-30] — Task 23 — Persist Google Drive sign-in across reloads (true silent re-auth; no unprompted dialog)

### Fixed

- **No Google sign-in dialog ever appears on page load.** The boot-time re-auth
  used GIS `requestAccessToken({ prompt: "" })`, which can still raise a **visible**
  account chooser / consent popup when the session is stale. `signInSilent` now uses
  Google's **strictly non-interactive** token path (`prompt: "none"`), which grants
  a token only from an active, already-consented session and otherwise **fails
  without showing any UI**. It's wired with an **`error_callback`** (swallowing the
  non-OAuth popup-blocked / popup-closed cases) and an **8 s watchdog** so the boot
  path can never hang waiting on a dialog that won't come. The explicit **Sign in
  with Google** button is now the *only* path to an interactive consent.
- **A returning player who opted into Drive stays signed in across reloads.** GIS
  access tokens are short-lived (~1 h) and not persisted, so each load now **silently
  re-acquires** a token from the existing Google session and the panel shows
  **Signed in to Drive** with no click. The `optedIn` hint is written on every
  successful sign-in **and re-stamped on each silent re-acquire**, rolling the
  180-day `SameSite=Lax` / `Secure` first-party cookie (mirrored to `localStorage`
  for private mode / blocked cookies). The Drive `401` token refresh is silent too.

### Changed

- **The cloud-saves UI is wired (and its silent re-auth attempted) before the WebGL
  scene builds.** `CloudUI.init()` was hoisted ahead of `createScene()` in `boot()`,
  so the opt-in sign-in is a **DOM-only feature independent of the 3D engine** —
  a returning player is restored even if the engine boot is slow or fails (graceful
  degradation). The boot path remains gated on `silentAuthDecision` (it attempts
  **only** when the stored `optedIn` hint is present — first-run / signed-out loads
  make **no** GIS call), and `forgetAuth()` on sign-out clears the hint so no
  re-auth fires afterward.

### Notes

- **Opt-in + graceful + headless-safe, unchanged.** Signed-out / offline / expired /
  revoked / unconfigured / headless all degrade to the explicit button (or stay
  cleanly disabled) and **never throw** or surface a surprise popup; the local save
  is unaffected. **No new external dependency**; reuses the existing `cloud.*`
  toasts (no new strings). **No token is ever stored** — only the non-sensitive hint.
- **No `SAVE_VERSION` change** (auth hints persist via the cookie / `localStorage`,
  not the save). New tests: `test/drivesignin.test.js` (7 cases — the **production**
  `makeGoogleDriveClient` vs an injected GIS stub: interactive `signIn` →
  `prompt:"consent"`, boot `signInSilent` → `prompt:"none"` with the visible-UI hook
  **never** called, fail-soft on interaction-required / popup-blocked / hang, and a
  silent 401 refresh), Task 23 blocks in `test/cloudsave.test.js` (+6 — controller
  boot gating: attempt only when opted-in, restore via the silent method with zero
  interactive calls, sign-out blocks re-auth, explicit sign-in persists the hint) and
  `test/session.test.js` (+4 — the opted-in hint survives a reload via the cookie's
  `SameSite=Lax`/`Secure`/180-day `Max-Age` + the `localStorage` mirror; sign-out
  clears it). **Vitest 318 → 335.** A Playwright **`test/e2e/cloudsignin.spec.js`**
  suite (3 cases, injected GIS client) loads the built site with a stored hint and
  asserts the signed-in state restores with **no visible auth dialog**, a clean load
  makes **no** GIS call, and the explicit button is the only path to consent.
- **Files:** `src/game.js` (`makeGoogleDriveClient` `requestToken`/`signIn`/
  `signInSilent`/`authFetch`, `CloudSave.signIn`/`trySilentSignIn`, `CloudUI.init`
  boot wiring), `playwright.config.js` (new `cloudsignin-desktop` project),
  `README.md` (cloud-saves persistence + privacy note + roadmap).

## [2026-06-30] — Task 37 — Exit/enter fullscreen control in the settings menu

### Added

- **A fullscreen toggle in pause → settings.** A new **Display** sub-panel holds a
  full-width control that **enters fullscreen when windowed and exits when
  fullscreen**, its label reflecting the state — **Enter fullscreen** /
  **Exit fullscreen** (reusing the existing `btnTitle.exitFullscreen` string), in
  **EN + RU**. So a player who never noticed the corner glyph now has the option
  where every PC/console game keeps it. The corner **⛶ / ✕** HUD button is kept.
- It drives the **same `Fullscreen.toggle()`** as the HUD button, so the Task-16
  touch **landscape lock** on enter and `unlockOrientation()` on exit are shared
  verbatim — no second code path.

### Changed

- **The menu control, the HUD glyph and the browser's real fullscreen state stay in
  lockstep.** A single `fullscreenchange` listener now refreshes **both** entry
  points (`Fullscreen.sync` → `syncMenu`), so toggling fullscreen by any means (the
  menu button, the HUD button, **Esc**, or a browser gesture) flips the menu label
  to "Exit fullscreen", sets `aria-pressed`, and updates the corner glyph together.
  `Pause.refreshTexts()` repaints the control on menu-open + on a live language
  switch.

### Notes

- **Feature-detected + headless-safe.** Visibility/enabled derive from
  `Fullscreen.supported()` and the label from `Fullscreen.active()`, both of which
  feature-detect the (vendor-prefixed) Fullscreen API. On browsers without it
  (e.g. iOS Safari) the **whole Display panel and the HUD button are cleanly
  hidden** — no dead control — and the exit/lock promise rejecting never throws.
- **No `SAVE_VERSION` change** (fullscreen is a transient display preference, not
  saved state). New tests: `test/fullscreen-settings.test.js` (9 cases — pure
  label/visibility derivation + the menu button wired to `toggle()`, no-op safe with
  no Fullscreen API; **Vitest 309 → 318**) and `test/e2e/fullscreen.spec.js` (a
  Playwright suite at desktop + the Galaxy S24 Ultra portrait/landscape: the control
  is present + reflects state, the `fullscreenchange` sync flips both controls, and
  stripping the API hides the panel + HUD button). `index.html` (Display sub-panel),
  `css/style.css` (`.fs-menu-btn`), `src/core/i18n.js` (EN+RU labels) updated.

## [2026-06-30] — Task 36 — Customizable on-screen control layout (drag any control anywhere; saved + restored)

### Added

- **An "Edit control layout" mode** reachable from **pause → settings → Controls**
  and the **start-screen Controls panel**. It dims the live HUD, floats a labelled
  **draggable handle** over each movable control, and offers **Save layout** /
  **Reset to default** / **Cancel**. The drag **reuses the Task-16 pointer-drag
  pattern** (touch + mouse via Pointer Events, the `.sk-drag-ghost`-style floating
  ghost, the 6px tap/drag threshold) — there is still exactly **one** drag stack.
- **Every requested control is repositionable to any on-screen point:** the
  **movement joystick**, the **skill quick-bar** (`#skillBar`), the **potion belt**
  (`#potionBar`), the **interact "E" button** (`#actionBtn`) and the **fire/cast
  button** (`#castBtn`). A control with no custom position keeps its Task-16 default
  (portrait + the landscape one-thumb arc).
- **Resolution-independent + safe.** Each position is stored as a **viewport
  fraction** `{x,y}` (the control's centre), so it survives rotation / different
  screens, and is **clamped to the safe area** (`env(safe-area-inset-*)` + the
  control's own size) **on apply and on load**, so a control can never land
  off-screen or under a notch; tap targets stay ≥ ~48 px. Positions apply **live on
  drop** and on **boot / zone-load** (a window-resize / re-orientation re-clamps).

### Changed

- **`SAVE_VERSION` 13 → 14.** The control layout now serializes in
  `serializeGame` / `applySave` so a player's arrangement travels with their save
  (incl. cloud / slots). The layout is **also mirrored to `localStorage`**
  (`gg3d_controls`, like the audio / graphics / locale prefs), which is the **live
  per-device source** applied on the start screen **before** any save loads; a save's
  layout is the **portable default** a device with no stored layout adopts on load.
  **Older saves still load** — a pre-v14 save has no `controls` field, so the default
  layout stands. New strings (editor heading, Save / Reset / Cancel, hints, handle
  labels) are localized in **EN + RU**. The editor is a **DOM-only** feature, wired
  before the WebGL engine boots, and is fully **feature-detected** (no Pointer Events
  / no DOM ⇒ it opens in a no-drag explanatory mode or no-ops, so the headless suite
  is unaffected). No overlaps are introduced — custom positions build on the Task 39
  non-overlapping HUD regions.

### Tests

- New **Vitest** `test/controllayout.test.js` (23 cases) locks the **pure** model
  with no DOM: `clampLayoutPos` (in-bounds unchanged, clamps past each edge, centres a
  control wider than the band, garbage → finite in-bounds), `layoutReducer`
  (set / move / reset-one / clear, unknown-id + non-finite guards, never mutates its
  input), `sanitizeLayout` (drops foreign / out-of-range / non-finite), the
  **localStorage mirror** round-trip (+ corrupt-value → default), the **save/load
  round-trip** of the layout, the **device-wins** rule, the **pre-v14 migration**
  (no `controls` ⇒ default), and the editor's headless-safety. **Vitest 285 → 308.**
- New **Playwright** `test/e2e/controllayout.spec.js`: at the **Galaxy S24 Ultra**
  portrait **and** landscape profiles it opens the editor from pause → settings,
  **drags the joystick** to mid-screen, **Saves**, **reloads**, and asserts the
  joystick **restored** to its saved spot; then yanks it far past the corner and
  asserts it **can't be dropped off-screen** (clamped to the safe area). A
  **desktop** smoke asserts the editor opens cleanly in **no-drag** mode on a
  non-touch device (the entry is never a dead click).

## [2026-06-30] — Task 39 — Collision-free HUD: a real region/layer system

### Fixed

- **The weather/clock chips flowed under the top-right icon buttons.** The status
  chips (`#weather`, `#clock`, location, level, coins) lived in the top-centre
  `.hud-top` flex row while the six icon buttons (fullscreen / pause / inventory /
  skills / craft / quest) were **independently** absolutely-positioned at the same
  top edge, extending ~260px in from the right; `.hud-top` reserved only ~132px on
  the right (enough for the 116px minimap, **not** the wider button row), so on a
  phone the chips slid **under the quest button**. There was no real named region
  system, so such overlaps recurred whenever a label grew or wrapped.

### Changed

- **A disciplined HUD region/layer system.** The screen is now carved into explicit,
  anchored, **non-overlapping regions**, each a `.hud-region` layer with a z-tier and
  reserved bounding box: **top-status** (location / level / XP / coins / clock /
  weather), **top-right control row** (the icon buttons), **corner** (minimap +
  compass), **centre** (health / focus / boss), **left** (relics + quest tracker) and
  the **bottom action cluster** (skills / potions / buffs). Every absolutely-positioned
  HUD widget is assigned to exactly one region.
- **The control row is now ONE flex row.** The six icon buttons moved into a single
  `#hudControls` flex container (IDs unchanged, so all `getElementById` wiring is
  untouched), giving the row a single measurable width `--controls-w` derived from the
  shared `--ctrl-btn`/`--ctrl-gap` button variables. The top-status row **reserves
  exactly that width** on its right edge, so the weather/clock chips can **never** reach
  under the quest (or any) button — the structural fix, not a per-element nudge.
- **Banded touch layout.** On phones there is no room for the chips beside the full
  control row, so the HUD lays out in distinct **vertical bands** sized from named CSS
  variables (`--band-status-top` / `--minimap-top` / `--compass-top` / `--band-bars-top`):
  control row (top) · status chips + corner minimap · centred health/focus · left relics
  + tracker · boss bar (stacked below the tracker, since the wide centred bar and the
  wide left tracker can't sit side-by-side on a phone). Landscape keeps the chips in the
  top row (ample width) and shrinks the corner minimap so the minimap + compass column
  clears the bottom-right one-thumb skill arc.
- The Task 16 declutter (no duplicate buttons), the **one-thumb action arc**, safe-area
  insets and the **minimap-tap** map entry are all intact. **Layout only — no
  `SAVE_VERSION` change.**

### Tests

- New **Vitest** `test/hud-regions.test.js` (11 cases) locks the pure rectangle-geometry
  helper in `test/util/rect.js` (`rectsOverlap` / `pairwiseCollisions`): edge-touching (a
  reserved-column seam) is not a collision, a >1px intrusion is, containment is, hidden /
  zero-area boxes never collide, and the historic weather-under-the-quest-button case is
  flagged. **Vitest 274 → 285.**
- New **Playwright** `test/e2e/hud-regions.spec.js` (desktop + S24 Ultra portrait +
  landscape, plus a ~360px small phone; the longest EN **and** RU labels with the boss
  bar / compass / quest tracker all visible at once) asserts **pairwise bounding-box
  non-overlap** over every HUD widget — explicitly weather × the quest button. The
  **responsive** suite (`test/e2e/responsive.spec.js`) gains the same worst-case
  non-overlap assertions against the **live** booted game.

## [2026-06-30] — Task 38 — Quest-givers spawn + are talkable in their home zones

### Fixed

- **NPCs were only talkable in the hub.** The player could talk to the Mayor in
  Meadowgate but to **none** of the wild quest-givers — the herbalist (Whisperwood),
  the fisher (Saltmarsh), the smith (Frostpeak) and the hermit (the sunken ruins) —
  even though the campaign sends the player to all of them. **Root cause:**
  `populateAdventure()`, which instantiates every `QuestGiver` from `NPC_DATA`, was
  called **only inside the `if (zone.home)` branch** of `setupZoneContent`, and
  **only the meadow is `home`**. Every wild zone took the `else` branch (resources
  only, no NPCs), so the non-hub givers were never spawned.

### Changed

- **Landmark → zone association (data-driven).** Each `LOCATIONS` entry now carries
  a **`zone`** field (`src/data/content.js`) and a `landmarkZone()` helper resolves
  it: `village`/`apothecary`/`castle` → the hub meadow; `grove` → forest, `seaside`
  → shore, `mountain` → peaks, and `ruins` → **caverns** (the Sunken Ruins are the
  Crystal Caverns reached through the sea-cave — the only existing land that fits
  the hermit, since adding a zone is out of scope). The wild landmarks were given
  sensible **in-zone** coordinates (well inside each fence) instead of the old hub
  coordinates.
- **Zone-aware NPC placement.** Story-NPC spawning moved out of the hub gate into a
  per-zone `spawnZoneNpcs()` / `questGiversForZone()` that runs for **every** zone
  in `setupZoneContent`, placing exactly the quest-givers whose landmark belongs to
  that zone (at their landmark, registered as interactables at the existing talk
  range). The hub still gets its merchant / blacksmith / alchemist / castle. Because
  travel already does `teardownZone` (disposes `state.npcs`, clears the interaction
  registry) → `setupZoneContent`, NPC interactables are **freshly re-registered**
  after every travel and on a save-load into a wild zone, so **talk → Dialogue →
  accept / turn-in works in every land**.
- **Swept the other hub-only assumptions.** `checkLocations` now fires a `reach`
  objective only for a landmark **in the current zone**; the world-map / minimap
  helpers `mapTargets` / `targetZoneOf` / `targetPoint` (`src/data/worldmap.js`) and
  the in-zone landmark dots resolve each landmark / NPC to its **home zone**, so the
  guided waypoint + markers point at where the NPCs actually stand.
- NPCs spawn **deterministically** (positioned from static landmark data) and
  **dispose on teardown** (no leaks across travel). **No `SAVE_VERSION` change** —
  the world is rebuilt from data on entry; zone-state load was confirmed to still
  restore talkable NPCs.

### Tests

- New **`test/npc-zones.test.js`** (10 cases; Vitest **264 → 274**): the pure
  landmark → zone placement (every giver → a real zone; the four wild givers map to
  their own lands and not elsewhere; `questGiversForZone` returns exactly a zone's
  residents; each in-zone point sits inside its fence); and, booting the assembled
  game, that the hub seeds only the Mayor, that **travelling to each wild land
  spawns its resident + registers the talk interactable** (walk-up → active prompt),
  the **regression** that the full **talk → accept → turn-in** flow runs for a
  wild-zone NPC, a **save-load into a wild zone** still yields a talkable NPC there,
  and that **teardown disposes** the zone's NPCs. Updated `test/worldmap.test.js`
  assertions that encoded the old hub-only model (`grove` → forest, etc.).

## [2026-06-25] — Task 22 — Environment rewrite (stable resource generation + natural road-edge teleporters)

Two environment problems that broke immersion are fixed.

**(A) Stable, time-based resource generation — no pile-ups, no phantom nodes.**
A zone's resource set is now **deterministic and persistent**, keyed by zone id
(`state.zoneRes[id] = { nodes:[{kind,x,z,respawn}], regrowAcc, sprouts }`). Live
`ResourceNode` meshes are rebuilt **from that record** on entry, so re-entering a
zone reuses the **exact same set** instead of scattering a fresh batch on top —
the live count is stable across travel and reload. The non-collectable **"phantom"
nodes** are root-caused and gone: `ResourceNode` had **no `dispose()`**, so
`teardownZone`'s `r.dispose()` threw and the resource meshes (created *after*
`buildWorld`'s teardown snapshot) **leaked** across travel as visible-but-dead
nodes; `ResourceNode.dispose()` now frees its root **and** removes its
interactable. Population is a **pure function of (zone, world seed, elapsed time)**
— the initial scatter and each regrow draw from a per-zone `mulberry32` sub-stream
(`seededStream`/`zoneKey`) that never disturbs the shared `rng()`. **New nodes
appear only after in-game time passes** (`CONFIG.resourceRegrowSec`, default 45 s)
via a `dt`-driven regrow clock that **pauses with the game**. A **per-kind,
per-zone cap** (`CONFIG.resourceCaps` + `resourceCapDefault`) is enforced at plan
**and** every regrow path, alongside the global `maxResourceNodes`. Harvest writes
its cooldown back to the record so depletion survives travel.

**(B) Road-edge teleporters replace the floating ground-circle orbs.** The
`portOrb` gateways are removed. Each portal is now a **road-edge trigger**: walking
down a road to its **end-of-map segment** fires `ZoneManager.travel`. The trigger
is a band across the road's full width at the fence (radial projection ≥ `exitR`
**and** lateral distance ≤ `half`), so it **can't be skirted** — the fence stops
you before you could go around. **Hub** exits snap to the nearest free crossroads
ray-end so they ride the existing **bridge-aware** roads (Task 10) rather than
cutting new roads across the river; **wild** zones lay a fresh radial road
(river crossings still bridged). Themed gateways (trail-head arch / plank jetty /
cave mouth + a signpost) sit at each road end. The **fade-veil transition**,
arrival placement (`placePlayerAtArrival` now lands **on the incoming road**,
below the exit) and the `zones.js` portal graph are intact — only the trigger
geometry + visuals changed. The **minimap / world map** draw road-edge exits (a
road stub running to the rim) in place of orb squares.

**Persistence & migration.** Per-zone resource state serializes/restores;
`SAVE_VERSION` **12 → 13** (`serializeZoneRes`/`deserializeZoneRes`); a pre-v13
save has no `zoneRes` field and **defaults to `{}`**, re-planning each zone
deterministically from the restored seed (older saves keep loading). All new
meshes dispose on teardown. New `test/environment22.test.js` (16 cases; Vitest
247 → 263) covers the stability invariant over repeated travel, the per-type cap
at plan/regrow, regrowth timing + determinism, harvestable-after-travel (no
phantom nodes), the road-edge trigger (fires the right zone, both directions,
can't be skirted), the save/load round-trip + pre-v13 migration, and per-object
dispose on teardown. No new user-facing strings.

## [2026-06-25] — Task 20 — Map subsystem fixes (fit-to-screen full map, un-mirror the minimap, arrow-shaped target pointer, fully readable labels)

The map subsystem had four defects that made it hard to use. All four are fixed to
the readability bar of a well-made open-world map, on desktop **and** the Galaxy
S24 Ultra (portrait + landscape).

### Fixed

- **The full map fits one screen — no page scroll; only the NPC/results list
  scrolls.** The `#worldmap` overlay panel is now a `dvh`/`clamp()`-sized flex
  **column**: the title, tabs, map, selection info and action buttons are fixed
  rows and the results list takes the remaining space and scrolls **internally**
  (`#mapResults`). On narrow portrait the map stacks above the list with a
  clamped-height canvas; on a short landscape the map stays beside the list and the
  chrome trims down — both keep the whole overlay inside the viewport.
- **The minimap heading is un-mirrored — turning right turns the indicator right.**
  The north-up world→screen projection now **mirrors the X axis** through a pure,
  tested helper (`mapVecToScreen` / `mapHeadingScreen`), so the marker's rotation
  sense matches the world while north (−Z) stays up. Fixed at the source and
  validated against the camera-relative facing convention (not faked with a
  double-negate); the player arrow (`mmPlayer`) and both the minimap and in-zone map
  projections share the one helper, so every plotted dot stays consistent.
- **An arrow now points at the target instead of an ambiguous triangle.** A reusable
  canvas arrow primitive (`drawMapArrow` — shaft + arrowhead) marks the minimap rim
  when the waypoint / next portal is off-map, and the on-screen compass arrow is now
  an inline **SVG arrow** (shaft + head). Both unambiguously point at the chosen
  target (and the next portal for cross-zone routes).
- **Place names are fully readable — no longer clipped by the map circle.**
  `drawZoneScene` collects portal labels during the clipped geometry pass and draws
  them **afterwards, outside the clip**, through a pure `layoutMapLabels()` that
  clamps each label inside the screen bounds and stacks overlapping ones apart, on a
  haloed background plate (`mapLabelText`). The world-overview zone names get the
  same haloed, de-overlapped treatment.

No save-schema change (`SAVE_VERSION` stays **12** — the waypoint already serialized
from Task 13). All canvas drawing stays feature-detected (headless-safe).

**Tests.** New pure tests lock the un-mirror sign convention (a right-turn in world
space, derived from the real camera-relative input, yields a clockwise turn on the
map), the bearing→arrow angle (the compass angle equals `resolveWaypoint()`'s
bearing to the in-zone target and to the next portal), and the label layout
(positions stay within screen bounds and de-overlap); a recording-2D-context suite
drives the **real** minimap/map drawing (mirror projection, post-clip label pass,
off-map rim arrow, world-overview labels) headlessly. A Playwright `map.spec.js`
(desktop + S24 Ultra portrait/landscape) proves the full map fits one screen while
the results list scrolls. **Vitest 234 → 247.**

## [2026-06-25] — Task 21 — Unified inventory for potions & ingredients (30 slots, drag-and-drop potion slotting, sellable items, dedicated alchemist NPC)

Potions and crafting ingredients lived in ad-hoc side stores (a `player.potions`
belt + a `player.materials` dictionary) separate from the 24-slot equipment bag,
with on-HUD ingredient widgets, no drag-and-drop and no way to sell them — and the
wizard sold everything. Task 21 reworks the economy so **everything shares one
bag** like shipped RPGs: ingredients and potions occupy inventory slots, the bag
grows to **30**, potions are **drag-slotted** into the 3 combat quick-slots in any
order, items are **sellable**, and a **dedicated alchemist NPC** sells potions +
basic ingredients.

### Added

- **A dedicated Apothecary vendor.** A new `Alchemist` class (a procedural
  apothecary at a bubbling cauldron) stands at a new `apothecary` hub landmark and
  opens a shop selling **potions + basic ingredients** (`ALCHEMIST_STOCK` =
  `POTION_STOCK` + `INGREDIENT_STOCK`). Added as `alchemist` in `NPC_DATA`
  (a `vendor` NPC, skipped by the quest-giver placement) so it's searchable on the
  world map; localised EN + RU (name, intro, shop title/tagline, the `apothecary`
  location). The vendor builds + animates + **disposes on zone teardown**.
- **Drag-and-drop potion quick-slots.** The inventory's **Potions** tab now shows
  the 3 combat quick-slots as drop targets above the bag's potion stacks. Drag a
  bag potion onto a slot to assign it, drag between slots to reorder/swap, or drag
  onto empty space to clear — reusing Task 16's pointer-drag controller + the pure
  `dragSlotReducer` over a pure assignment model (`player.potionSlots` = potion
  ids), with an accessible tap-to-pick fallback. Drinking a quick-slot (4/5/6 or a
  tap) consumes from the bag stack; an emptied stack auto-clears its slot.
- **Crafting materials as first-class items.** The six materials (wood/stone/water/
  herb/fiber/crystal) are now `ITEM_DB` reagents (`type: "material"`) with buy/sell
  values, so one stacking code path (`bagAdd`/`bagCount`/`bagSpend`, `STACK_MAX`
  99) serves potions + materials, and they're sellable + buyable like any item.

### Changed

- **The bag is unified and grew to 30 slots** (`invCap` 24 → 30). Gear instances
  live alongside stackable `{ id, uid, count }` potion/material stacks; the tabbed
  inventory (Gear / Materials / Potions) reads them all from `player.inventory`.
  Crafting (`hasMaterials` / `spendMaterials`), quest `gather` progress and skill
  **fusion** (the crystal cost) all read/write the bag instead of `player.materials`.
- **Both vendors are specialised.** The travelling **merchant** sells gear + its
  rare/featured rotation only (**no potions or ingredients** anymore); the
  **alchemist** owns consumables + reagents. `Shop.openShop(vendor)` swaps the
  dialog chrome per vendor and hides the gear-only "Rare" tab for the alchemist.
- **Everything is sellable.** `Shop.sell()` now accepts potions + materials (peels
  one unit off a stack) at each item's `ITEM_DB` value, alongside gear.

### Removed

- **The on-HUD materials chip strip** (`#materialsBar` + `updateMaterialsHud()` +
  the `.materials-bar` CSS). Ingredient counts are seen only in the inventory's
  Materials tab now (declutters the HUD). `.mat-chip` is kept — the crafting bench
  still uses it for its owned-materials readout.

### Save format

- **`SAVE_VERSION` 11 → 12.** The save now serialises the unified bag (gear +
  potion/material stacks) + the 3 `potionSlots` assignments. A pure, tested
  `migrateLegacyBag()` folds a **pre-v12** save's `materials` map + `potions` belt
  into bag stacks + quick-slot refs (gated on the save version so it runs exactly
  once); older saves load with all their stuff intact.

### Tests

- New `test/inventory21.test.js` (**26** cases; Vitest **208 → 234**): the legacy →
  unified-bag migration (pure + a full save round-trip), bag stacking (add/count/
  spend, stack-max, cap), the potion-slot drag reducer (assign/move/swap/clear, any
  order) + `Inventory.applyPotionDrag`, `Shop.sell` of potions/materials at the
  expected prices + the buyer adding stackables, the alchemist's stock vs. the
  merchant's (no potions), the v12 round-trip, and a tap-fallback UI smoke. Existing
  suites migrated off `player.materials`/`player.potions`. A new Playwright
  `inventory.spec.js` drives the potions-tab quick-slot drag-assign + asserts the
  HUD materials strip is gone, at desktop + the S24 Ultra portrait/landscape
  profiles.

## [2026-06-25] — Task 19 — Replace the arcade score with the experience (XP) system

The game carried a legacy arcade **score** in parallel with the real RPG
progression (XP / levels) from Task 14. Task 19 **removes the score system
entirely** and routes every reward moment into **XP**, so there is one coherent
progression currency — what modern RPGs do.

### Removed

- **The score HUD, run state, save field and config knobs.** Gone: the ⭐ score
  chip (`#score` in `index.html`, its `.stat #score` CSS, the `dom.score` hook and
  `addScore`), the `state.score` run-state field, the `score` save field, and the
  `CONFIG.scorePerMonster` / `scorePerArtifact` / `bossScore` / `dragonScore`
  knobs. The score phrasing is removed from the pause-stats, game-over and victory
  summaries and from every affected EN + RU string. A **grep guard** test fails on
  any lingering `score` identifier in the player-facing source.

### Changed

- **Every former score event now grants XP** through the single `Skills.gainXp`
  funnel. Kills already paid `Skills.xpFor` (sweet `6 + 2·level`, boss
  `60 + 25·cycle`, dragon `600`); **artifact pickups** now grant a retuned
  **`XP_PER_ARTIFACT = 40`** (roughly four sweet kills — between a sweet and a
  boss) on top of their existing heal + coin reward. Quests (`45`, side `60%`) and
  gathering (`3`) are unchanged. **Award values, before → after:** monster
  `+25 score → +xpFor XP`, artifact `+50 score → +40 XP`, boss `+400 score → +xpFor
  XP`, dragon `+5000 score → +600 XP`. The XP curve (`xpToNext`) is unchanged
  (retuned the new artifact source, not rebuilt — out of scope); a pure simulated
  run confirms an early run lands at **level ~3–6** (early levels quick, later ones
  earned), so pacing stays well-spaced now that artifacts feed it.
- **End-screen + tracker glow-up.** A new pure `runRecap(state)` drives the
  game-over, victory and pause summaries: they now show the **level reached**,
  **total XP earned** this run and the key **tallies** (monsters felled, relics
  collected) instead of a score number. The HUD keeps the existing **level badge +
  XP bar** as the single progression readout. The save-file download name now
  embeds the player **level** (`…-lv7-…`) instead of points.

### Save format

- **`SAVE_VERSION` 10 → 11.** The `score` field is dropped; a new lifetime
  **`relicsFound`** tally is added (for the recap, since relics are consumed when
  the castle is built). Older saves (v2…v10) still load: a legacy `score` is
  ignored, and missing `relicsFound` defaults to however many relics the player is
  still carrying (XP/level default to a clean level 1 as before).

### Tests

- New **`test/score-to-xp.test.js`** (19 cases; **Vitest 189 → 208**): each former
  score event grants XP through the live path; the level pacing simulation; the
  v10→v11 **migration** + v11 **round-trip** of `relicsFound`; the recap rendering
  (level/XP/tallies, no "score") on the game-over / victory / pause screens; and
  the grep guard. The existing harness / functional / cloud-save suites were
  updated off the removed `score` field onto `relicsFound` / XP.

## [2026-06-25] — Task 18 — Cloud-saves browser fix + multiple named save slots with full management

The single file-download save model is replaced by a proper **save-management system** like a shipped RPG:
**six named local save slots** with **Load / Rename / Delete / Overwrite / New save**, surfaced from one
**Manage Saves** screen reachable from the **start screen and the pause menu** — and the **dead start-screen
cloud-saves action is fixed** (it now opens with a clear state + sign-in CTA instead of doing nothing).
`SAVE_VERSION` **9 → 10** (added per-run **playtime** to the save; older saves still load with `playSec = 0`).
Vitest **164 → 189** (new `test/saveslots.test.js`, 25 cases) plus a new Playwright `saves.spec.js`
(open → save → rename → reload → load) run at desktop **and** the S24 Ultra portrait + landscape profiles.

### Added

- **Pure `SaveSlots` store.** Multiple named manual slots persisted to `localStorage` under a versioned
  envelope (`gg3d_slots`, `SLOTS_VERSION` 1; `SLOT_COUNT` = 6). Each slot holds the **full
  `serializeGame()` payload** plus lightweight **metadata** (name, timestamp, zone, level, playtime) so the
  list renders without parsing every payload. The slot logic is **pure + immutable + total**:
  `sanitizeSlotName` (length-capped to 40, trimmed), `slotMetaFromPayload`, `normalizeSlotStore` (drops
  invalid records), `listSlots`, `nextFreeSlot`, `putSlotRecord` / `renameSlotRecord` / `deleteSlotRecord`,
  with a thin `SaveSlots` controller (`read`/`write`/`saveTo`/`saveNew`/`rename`/`remove`/`payloadOf`/`load`).
- **`SavesUI` — one Manage Saves screen (start + pause).** Lists the local slots (Load / Rename **inline,
  i18n-safe, length-capped** / Delete / Overwrite / New save), a **cloud** section, and **file
  export/import**. Loads route through the **same boot reload path** as a file/cloud load (re-seed → rebuild
  → `applySave`), reconciled with `cloudNewer` so a load never clobbers newer in-progress work. Reachable
  via a new **Manage Saves** button on both menus; opens above any overlay; Escape backs out cleanly.
- **Cloud slot management.** The cloud section (and the existing `#cloudSaves` browser) now list cloud saves
  with **Restore** and **Delete** (new `CloudSave.deleteSave(id)` over the injectable Drive client), reusing
  `CloudSave.listSaves()` / `restore()` and the Task-15 rolling-history policy.
- **Per-run playtime.** Active playtime accumulates (frame-rate-independent, only while truly playing) and
  serializes as `playSec`, shown in each slot's metadata via the new pure `fmtPlaytime`.

### Changed

- **The dead start-screen cloud action is fixed.** "Cloud saves…" is no longer disabled-when-signed-out; it
  opens the cloud browser even signed out, showing a **clear state + a sign-in CTA** (or a not-configured /
  unavailable note) instead of a no-op. The new Manage Saves screen mirrors this.
- **`Pause.askConfirm(action, text, onYes)` is generalized + screen-centred.** It now accepts an optional
  callback (so the save-slot delete/overwrite confirms reuse the same guard) and the confirmation dialog
  moved out of the pause panel into a **top-level modal** so it floats above any overlay — including the
  Saves screen opened from the start menu (where the sim isn't paused). Restart/Exit behaviour + live
  re-localization are unchanged.
- **Pause menu:** the file-download **Save Progress** button is replaced by **Manage Saves** (file
  export/import now lives inside the Saves screen alongside the slots).

### Migration

- **`SAVE_VERSION` 9 → 10** for the added `playSec` field; `validateSave` still accepts v2…v10, so **older
  saves load** (defaulting `playSec` to 0). The **prior single-slot** local run (the Task-17 auto-session
  snapshot) is **migrated once** into a named slot on first read of the slot store, so an existing player's
  in-progress run is never stranded. The per-slot envelope is versioned independently (`SLOTS_VERSION`).

### Tests

- New `test/saveslots.test.js` (25 cases): the pure store (sanitize / metadata / normalize / list /
  next-free / put / rename / delete), `fmtPlaytime`, the v10 playtime round-trip + legacy default, a
  per-slot round-trip through `applySave`, the single-slot **migration**, the **cloud-slot delete** via an
  injected client, the headless-safe `SavesUI` render path, and the cloud browser opening with a sign-in
  CTA when signed out. New Playwright `test/e2e/saves.spec.js` (desktop + S24 Ultra portrait + landscape):
  the Saves screen opens from the start menu (cloud section + sign-in CTA present, six slots rendered) and a
  run saves → renames → reloads → loads a named slot. The three save-version assertions in the existing
  suites now read `T.SAVE_VERSION` instead of a hardcoded `9`.

## [2026-06-25] — Task 17 — Durable session persistence

Reloading the page — or switching desktop⇄mobile layout / re-orienting / changing graphics quality (all of which
reboot the view) — now **resumes the in-progress run exactly where it left off** and **keeps the player effectively
signed in to Google Drive**, the way shipped web games keep you logged in and mid-run. **No save-schema change**
(`SAVE_VERSION` stays **9** — it reuses the existing `serializeGame()`/`applySave()` JSON). Vitest **141 → 164**
(new `test/session.test.js`, 23 cases) plus a new Playwright `session.spec.js` (resume-after-reload) run at desktop
**and** the S24 Ultra portrait + landscape profiles.

- **Auto-persisted local session (resume-on-reload).** A new first-party `Session` module continuously persists the
  live run (the exact `serializeGame()` JSON) to `localStorage`, debounced (1.5 s) on key beats — zone travel,
  level-up, quest turn-in, purchase/sale — and flushed synchronously on `visibilitychange`/`pagehide`. On boot, with
  no explicit file/cloud pick pending, the snapshot is auto-restored through the **same `gg3d_pending_load` seam**
  the file/cloud load uses (re-seed → rebuild → lay the run in), surfaced as a **"Continue"** button on the start
  screen rather than silently forced. `Start` still begins a fresh run (overwriting the snapshot).
- **First-party cookie for the small, long-lived identifiers.** A pure, attribute-complete cookie helper
  (`buildCookieString`/`parseCookies` + `cookieGet`/`cookieSet`/`cookieDel`) stores a session id, the chosen
  locale/quality, the cloud-autosave flag and a **non-sensitive Google auth hint** in one compact first-party cookie
  (`SameSite=Lax`, `Secure` on HTTPS Pages, 180-day `Max-Age`). It is **feature-detected** and falls back to
  `localStorage` (mirrored `ck_*` keys) when `document.cookie` is unavailable (private mode / headless). The bulky
  run snapshot stays in `localStorage` (cookies are size-limited). No third-party/tracking cookies; **no secrets**
  are ever stored.
- **Durable Google sign-in across reload.** The Drive client gained a silent token path (`signInSilent` → GIS
  `prompt: ""` + `login_hint`). On opt-in, `CloudSave` remembers a non-sensitive hint; on boot `CloudUI` attempts a
  **silent token refresh** so a reload keeps you signed in **without a fresh consent dialog**, falling back to the
  explicit Sign-in button if it fails. **Sign-out clears the hint** so no silent re-auth happens afterward. Pure
  `silentAuthDecision(hint)` gates the attempt and is unit-tested.
- **Layout-agnostic + privacy control.** The persisted session is independent of layout, so a desktop⇄mobile switch
  restores the same run **and** sign-in; the Task 16 HUD/menu rebuild reads from the restored state. A
  **"Clear saved session & sign out"** control (start screen + pause settings, EN+RU) wipes the snapshot, the cookie
  and the Google sign-in. README documents what is stored and where.
- **Tests.** New `test/session.test.js` (23 cases): the pure cookie helper (attributes + fallback + throw-safety),
  the cookie-state merge, the `sessionPersistDue` debounce scheduler, the `silentAuthDecision` gate, the snapshot
  flush/restore round-trip (parity with file/cloud payloads, save-in-progress guard) and clear-session. A Playwright
  `session.spec.js` starts a run, reloads, and asserts **Continue** resumes it — at desktop + both S24 Ultra
  orientations. Feature-detected throughout (cookies / `localStorage` / GIS / `document`): the headless suite stays
  green and signed-out/offline still play.

## [2026-06-25] — Task 16 — Responsive, mobile-first HUD & menu overhaul

Rebuilt the menus + HUD to the standard of well-reviewed mobile action-RPGs: every control reachable at every
resolution (verified on the **Galaxy S24 Ultra** profile — 1440 × 3120, DPR ≈ 3.5 — in portrait **and**
landscape, plus a ≈360 px small width and desktop), no overlapping widgets, no duplicates, a one-thumb combat
cluster in landscape, and drag-and-drop skill slotting. Layout/UX only — **no save-schema change**
(`SAVE_VERSION` stays **9**). Vitest **126 → 141** (new `test/hud.test.js`, 15 cases) and a new Playwright
responsive suite at the S24 Ultra device profile (portrait + landscape) added to `playwright.config.js`.

- **Auto-fitting, scrollable menus with progressive disclosure.** The start screen (`#overlay`) and pause menu
  (`#pauseMenu`) are now flex columns capped at the safe viewport (`100dvh` minus `env(safe-area-inset-*)`) that
  scroll internally so nothing clips. Primary actions (Start / Resume / Load / Save / Exit) stay visible; the
  secondary settings (Controls, Language, Audio, Graphics, Cloud saves) fold into labelled `<details>` sub-panels
  opened on demand. The Google-Drive / cloud panel is fully reachable on the S24 Ultra in both orientations.
- **Fullscreen ⇒ landscape on mobile.** Entering fullscreen on a touch device also requests landscape via the
  Screen Orientation API (`screen.orientation.lock("landscape")`), released on exit. Both the lock and fullscreen
  are feature-detected and degrade gracefully — the lock's promise rejection is swallowed (e.g. on iOS Safari);
  desktop behaviour is unchanged.
- **Decluttered HUD.** Removed the "monsters in this land" counter (`#monsters` + `updateMonsterCounter`), the
  on-HUD music button (`#musicBtn` — mute now lives in the audio sub-panel; the M hotkey still toggles), the
  duplicate map button (`#mapBtn` — the minimap is the single map entry point, now with an obvious tap hint) and
  the round bag button (`#bagBtn` — the square inventory button remains). Gave the HUD deliberate z-layered,
  non-overlapping anchored regions (top status row, corner minimap, bottom action cluster).
- **One-thumb combat cluster (landscape).** The 3 skill quick-slots, the interact (E) button and the fire (✨)
  button now form an ergonomic arc in the bottom-right (right-thumb) zone, all within a comfortable thumb sweep,
  ≥ 48 px tap targets, clear of the left-thumb joystick and the safe-area insets. Portrait keeps a sensible
  fallback.
- **Drag-and-drop skill slotting.** Replaced the per-skill assign buttons with direct manipulation: drag a roster
  skill onto a quick-slot to assign, drag a slotted skill onto another slot to move/swap, or onto empty space to
  clear. Built on a **pure `dragSlotReducer`** (the gesture model) + one reusable Pointer-Events drag controller
  (`setPointerCapture`, touch + mouse from one code path), with an accessible tap-to-pick → tap-slot fallback when
  Pointer Events are unavailable. The pure `Skills.assignSlot` / `clearSlot` model is unchanged and still
  round-trips through save/load.

## [2026-06-23] — Cloud saves: inject the Google OAuth client id at deploy time

Follow-up to Task 15 so the OAuth 2.0 **Web-app client id** no longer has to be hardcoded in
`index.html`. The **Deploy to GitHub Pages** workflow now reads it from a GitHub Actions
**variable** (or secret) named `GOOGLE_CLIENT_ID`, scoped to the `github-pages` environment, and
passes it to the Vite build as `VITE_GOOGLE_CLIENT_ID`; Vite inlines it into the hashed bundle and
the game reads it at runtime. `CloudSave.readClientId()` now resolves the id in priority order —
`window.GG_GOOGLE_CLIENT_ID` → `import.meta.env.VITE_GOOGLE_CLIENT_ID` (build-time) → the
`<meta name="gg-google-client-id">` tag (manual fallback) — and stays cleanly "not configured" when
all are empty. `.env.local` is now git-ignored for local dev, and the README gained step-by-step
instructions for creating the Client ID and storing it as a GitHub environment variable. Vitest
**125 → 126** (a new build-time-env case); no save-schema change.

## [2026-06-23] — Task 15 — Cloud saves to Google Drive (manual + 5-min autosave, rolling 1-hour history)

Added an **opt-in** way to back progress up to the player's own Google Drive, reusing the **exact**
`serializeGame()`/`applySave()` JSON the local file save uses — so save **versioning and migration just
work** and there is **no schema change** (`SAVE_VERSION` stays **9**). Everything degrades gracefully:
signed-out, offline, with no OAuth client id configured, or headless, the feature is cleanly disabled
and the local save still works — nothing throws and nothing blocks the main thread. Vitest **100 → 125**
(new `test/cloudsave.test.js`, 25 cases); the Playwright smoke asserts the cloud panel is present and
cleanly disabled by default.

- **Private `appDataFolder` storage.** Saves live in the player's hidden Drive **app-data folder**
  (the `drive.appdata` OAuth scope only — invisible to other apps, no Drive clutter). A single
  **manual** slot (`gg3d-save.json`, overwritten by "Save to Drive") plus timestamped **autosave**
  files (`gg3d-auto-<epochMs>.json`).
- **Autosave every 5 minutes.** A cheap, **wall-clock-gated** render-loop tick (`CloudSave.tick`) fires
  an autosave when due — **paused while the tab is hidden/idle**, **debounced** against an in-flight
  write, and **never blocking** (the upload is async; the serialize is trivial). Keeps a **rolling
  one-hour history** (≤ **12** timestamped slots, pruned after each write; the **single newest is always
  kept** so a long break never loses the last checkpoint).
- **Browse & restore.** A cloud-saves overlay lists the manual slot + the retained autosaves
  (newest-first) and restores any of them through the **same boot path** the local file load uses
  (stash → reload → re-seed → `applySave`). Loading **reconciles** so a cloud save never silently
  clobbers newer in-progress work.
- **Pure, tested policy.** `cloudAutosaveDue` (cadence / hidden / debounce), `cloudPrune` (age + slot
  cap + keep-newest retention), `cloudNewer` (reconcile by `savedAt`), and the autosave file
  naming/parsing are all **pure functions** with direct unit tests.
- **Injectable, feature-detected I/O.** The production client (`makeGoogleDriveClient`) loads the tiny
  **Google Identity Services** script on demand at first sign-in and talks to the **Drive REST API** via
  plain `fetch` (no heavy gapi client — the site stays static). The client is **injectable**
  (`CloudSave._setClient`) so the whole flow is exercised against an in-memory stub with no network.
- **Config & privacy.** The OAuth **client id** is read from a `<meta name="gg-google-client-id">` tag
  (or `window.GG_GOOGLE_CLIENT_ID`) — **never a committed secret**; empty by default ⇒ cloud saves
  ship disabled. The autosave-on preference persists to `localStorage` (like locale / graphics / audio),
  not into the save file. New **EN + RU** strings for the whole panel. Golden Rule 1 (CLAUDE.md + TODO
  §1) updated to allow such opt-in external services. README gained a **Cloud saves** setup + privacy
  section.

## [2026-06-23] — Task 13 — Minimap + full world map with locations, NPCs, search & a guided waypoint

Added the navigation layer large open-world RPGs lean on: a live **corner minimap**, a
**full-screen world map** (current-land detail + a world overview of the portal graph), a name
**search** across every land / landmark / NPC, and a **guided waypoint** that routes the player —
hopping portals across lands — with an on-screen **compass** that clears on arrival. **`SAVE_VERSION`
→ 9** (zones discovered + the active waypoint); older saves still load (only the saved land known, no
waypoint). Vitest **80 → 100** (new `test/worldmap.test.js`, 20 cases); the Playwright smoke now
opens the map, searches and sets a waypoint.

- **Pure data layer (`src/data/worldmap.js`).** A new headless-safe module derived entirely from
  `ZONES` / `LOCATIONS` / `NPC_DATA`: the zone **adjacency graph** (`ZONE_ADJ`, `zoneEdges`), **BFS
  route-finding** (`findRoute`, `nextZoneStep` → the next portal to take), bearing/distance +
  the **8-point compass** (`bearingRad`, `dist2D`, `compass8`, camera-relative `relativeHeading`),
  the searchable **`MAP_TARGETS`** (every land/landmark/NPC, names resolved by the UI via i18n so the
  index stays translation-agnostic), diacritic-folding **search** (`searchTargets`/`matchesQuery`),
  and the deterministic **world-overview layout** (`worldLayout`). All unit-tested directly.
- **Minimap (`WorldMap`).** A north-up corner **2D canvas** showing the current land's fence, the
  player + facing, portals (coloured by kind), NPCs (status-coloured), resources, monsters, vendors,
  the castle and the active-waypoint marker — redrawn on a throttle so it never costs a frame, and
  **feature-detected** (no `2d` context ⇒ silent no-op). Toggle with `N`; tap it to open the full map.
- **Full world map (`WorldMapUI`).** A `Tab` / 🗺️ overlay with a **This Land** view (detailed,
  pannable + zoomable) and a **World** overview of the portal graph (discovered vs **fog-of-war**), a
  live **search** box with a results list, and a **"Guide me there"** button. Mutually exclusive with
  the other menus, localized EN/RU, mobile-friendly tap targets.
- **Guided waypoint.** `resolveWaypoint` returns live guidance — an in-zone bearing + distance, or
  (across lands) the **next portal to take** routed through the graph — driving an on-screen
  **compass arrow** (camera-relative) + label that **auto-clears on arrival**.
- **Persistence.** `serializeGame`/`applySave` round-trip `discovered` (fog-of-war) + the active
  `waypoint`; **`SAVE_VERSION` → 9**, older saves default gracefully. Zones are revealed on travel
  (`ZoneManager._swap`) and on load.
- **Tests.** New `test/worldmap.test.js` (20 cases): graph derivation + symmetry, BFS routing &
  next-hop, bearing/distance/compass + camera-relative arrow, target derivation + folding search, the
  world layout, runtime waypoint resolution (same-zone vs cross-zone), set/clear/arrival, fog-of-war
  discovery on travel, the v9 save round-trip + v8 migration + invalid-waypoint drop, and a
  headless-safe overlay/minimap drive. The save-version assertions in the harness / items / skills
  suites were bumped 8 → 9. The Playwright smoke gained a world-map flow.
- **UI.** `index.html`/`css`: the minimap, the compass, the 🗺️ HUD button and the world-map overlay
  (search · tabs · zoom · guide), plus a new **Map** row in the start-screen controls; `applyStaticI18n`
  now also resolves `data-i18n-ph` placeholders. No `?v=` to bump (content-hashed build).

## [2026-06-23] — Task 14 — Skill & leveling system with 3-skill fusion, a quick-access bar & boss-only skills

Added a full RPG progression layer on top of combat: **leveling + a focus resource**, a roster of
**active skills**, a **3-slot quick bar**, the marquee **3-skill fusion**, and **boss-only skill
drops** — all data-driven and pure-function-tested. **`SAVE_VERSION` → 8** (a new `progress` block
on the player); older saves load at level 1 with the starter skill.

- **Data layer (`src/data/skills.js`).** A new pure module: `SKILL_DB` (6 base skills learned by
  leveling + 4 boss-only skills), `ELEMENTS`/`EFFECTS`, the level/focus curve (`xpToNext`,
  `totalXpToReach`, `maxFocusForLevel`, `levelHealthBonus`, `skillsUnlockedAt`) and the
  **deterministic** fusion math (`fuseSkills`, `fusionCost`, `canFuse`, `skillTier`) — no
  DOM/Babylon refs, so it stays in the type-checked data layer and is unit-tested directly.
- **Leveling & focus.** Kills (scaled by boss/dragon), quest turn-ins and gathering grant **XP**
  (`Skills.xpFor`); a level-up grants **+8 max health** (folded into the player's `base` so the gear
  `recomputeStats` pipeline is untouched), **+8 max focus**, and **auto-learns** newly-unlocked base
  skills. **Focus** is a spell resource that regenerates over time and gates casting. A HUD **level
  badge + XP bar** (top row) and a **focus bar** (under the health bar) read it out live.
- **Active skills.** Four effect families the runtime resolves on the existing systems: **volley**
  (a fan of element-tinted `Projectile`s), **nova** (an AoE burst — with frost **slow** via a new
  isolated `Monster.applySlow`/`slowMul`, and shadow **lifesteal**), **buff** (a timed self buff via
  `applyBuff`) and **heal**. All feature-detect Babylon and never throw headless.
- **Quick bar (hotkeys 1/2/3).** Up to three skills slot onto a bottom-centre HUD bar (cast with
  `1`/`2`/`3` or a tap) with a radial cooldown sweep + focus-cost readout. The **potion belt moved
  one set over to `4`/`5`/`6`** (still fully tap-usable; help text + belt labels updated).
- **Skill fusion (marquee).** Select 2–3 owned skills in the new **✨ Skills & Fusion** overlay
  (`K`) and forge a brand-new skill whose attributes are the pure deterministic blend (strongest
  effect wins; power/cooldown/cost/AoE/count + slow/lifesteal/pierce combined; shared element or
  _Prismatic_ if mixed). It costs **coins + crystals** (tier-scaled); the result is a real,
  slottable, savable skill, reproduced exactly on reload (never re-rolled).
- **Boss-loot skills.** A pool of powerful skills drops **only** from bosses — rolled through the
  seeded `rng()` **after** the existing coin/gear draws (so drop determinism is untouched) and added
  to the roster, one unowned boss skill per kill until all are collected.
- **Persistence.** The whole `progress` block (level/xp, focus, owned + fused skills, the quick-bar
  slots) serializes in the player; legacy < v8 saves default sanely (level 1, starter skill, full
  focus). New procedural SFX cues (`levelup`, `skill_cast`, `fuse`) and full **EN/RU i18n**
  (UI strings + a `skill`/`element`/`effect` RU group + `tSkillName`/`tSkillDesc`/`tElementLabel`/
  `tEffectLabel` resolvers).
- **Tests.** New `test/skills.test.js` (27 cases; Vitest **53 → 80**) covers the curve/focus math,
  level-ups, focus regen + cooldowns, quick-bar assign/activate (volley/nova/buff/heal + gating),
  the fusion blend determinism + cost + charge, boss-drop determinism, the headless-safe overlay,
  skill i18n + RU completeness, and the **v8 save round-trip + migration**. The Playwright boot smoke
  now opens the skills overlay + casts a skill. Full pipeline green; desktop + mobile screenshots
  confirmed the HUD, quick bar and overlay.

## [2026-06-23] — Task 12 — Deep item & equipment system with visible worn gear + a real inventory

Took the gear layer from a flat 8-slot catalogue to a Skyrim-flavoured analog: a **12-slot**
loadout, **enchantments**, **equipment sets**, **gear you can see on the character**, and a real
**tabbed inventory** — all data-driven and pure-function-tested. **`SAVE_VERSION` → 7** (per-instance
affix ids + four new slots); older saves load untouched (no affixes, new slots default empty).

- **Widened loadout (8 → 12 slots).** Added **pauldrons · gloves · belt · cloak** alongside the
  existing helmet/breastplate/boots/necklace/2 rings/2 hands. Each new armour `type` equals its
  slot name, so `equipItem` routes by type with no special-casing; the paper-doll, anvil, save
  schema and worn-gear all iterate `EQUIP_SLOTS`, so the widening flowed through one list.
- **Enchantments (affixes).** A new `AFFIXES` table of prefix/suffix modifiers. Found + crafted
  gear rolls `rollAffixes(def, rng)` — a **deterministic, seeded** draw from the affixes valid for
  the item's category (weapon / armour / jewelry), **count by rarity** (normal 0 · rare 1 · epic 2 ·
  legendary 3). The rolled ids ride on the instance (`inst.affixes`) and **serialize**, so a reload
  reproduces them exactly (no re-roll). `effectiveStats` folds them in — additive stats **scale with
  rarity**, `haste` compounds toward zero — and they surface as localized **chips** on every card,
  slot and tooltip (a deliberate i18n-safe choice over splicing names, which can't agree in Russian).
  Shop gear stays **clean** (no rng disturbance from browsing/buying); boss drops + crafts are
  enchanted.
- **Equipment sets.** `SETS` (**Ironguard** early/buyable, **Dragonscale** from boss loot) grant
  cumulative stat bonuses at piece-count thresholds; `setBonusStats(equipment)` is pure and feeds the
  live recompute, and an **active-set panel** in the inventory shows progress (e.g. *Dragonscale 4/6*)
  with met/unmet bonus chips.
- **One pure stat pipeline.** Refactored the recompute into a pure `deriveStats(base, equipment,
  buffs)` (gear incl. enchant levels + affixes → set bonuses → buffs → weapon profile) shared by the
  live `recomputeStats` **and** the inventory's **compare-vs-equipped** deltas (`equipDelta`, via
  `equippedAfter` — a pure simulate of the equip rules: 2-handed fills both hands, dual-wield, ring
  round-robin). So "what changes if I equip this?" is always exact, sets and all.
- **Visible, animated worn gear.** Helmet, pauldrons, breastplate, gloves, belt, boots and a
  billowing **cloak** are built **once** on Lily's procedural body and **toggled + recoloured by
  rarity** on equip (`refreshWornGear`) — never reallocated, so equip/unequip **can't leak** —
  parented to the body parts so they stride/swing for free, with the cloak getting a frame-rate-
  smoothed billow that **freezes with the pause menu**. Tier-gated via `wornDetailFor(tier)` (the low
  tier drops the lightest pieces + the per-frame sway). Fully feature-detected / headless-safe.
- **Real tabbed inventory.** The bag became **Gear / Materials / Potions** tabs: gear with
  **filter** (All / Weapons / Armour / Jewelry) + **sort** (Rarity / Type / Name), enchant chips and
  the compare deltas; **materials** surfaced as stacks; **potions** quaffable straight from the bag.
  The 12-slot paper-doll shows rarity colour + level + enchant chips and the live stat block + set
  bonuses. (Materials/potions keep their canonical stores — crafting/quests/belt depend on them — and
  are surfaced through the one inventory, so there's zero regression risk.)
- **More gear.** New armour for the new slots across every rarity (Ironguard + Dragonscale set
  pieces, Wings of Dawn, Stormforged/Titan pieces, Quickhand/Shadow gear, …), all localized EN/RU.

Determinism + persistence hold: every roll goes through the seeded `rng()`, affixes + the full
12-slot loadout **round-trip through save/load**, and a v6 file still loads. Pipeline green across
**lint · typecheck · test · build · Playwright E2E**; a real-browser screenshot pass confirmed the
gear renders + layers on the hero and the inventory reads correctly. Vitest: **32 → 53 test cases
across 6 files** (new `test/items.test.js`, 21 cases: affix roll count/pool/determinism, the
affix/rarity stat math + haste compounding, set thresholds + live folding, the widened slot rules +
`equippedAfter` parity, compare deltas, worn-gear build/tier-gating/no-leak, the tabbed inventory
filter/sort/consume, and the v7 round-trip + v6 migration). Content-hashed build — no `?v=` to bump.

## [2026-06-22] — Task 11 — Brighter, more cheerful art direction + a larger visible play area

Re-graded the world out of its washed-out, faint look and **opened the view up**,
all through one new pure, data-driven **`ArtDirection`** seam so the whole pass is
unit-testable without a GPU. No save-schema change (`SAVE_VERSION` stays **6** — the
grade, fog and draw distance are all derived from the zone + the already-persisted
graphics tier, so old saves load untouched).

- **Cheerful colour grade.** A gentle, pure HSV lift (`grade()`: saturation ×1.18,
  value ×1.06, clamped) is applied **once** in the `mat()` / `emat()` helpers, so
  **every** gameplay/foliage/prop/character/ground material reads lusher and more
  saturated while already-vivid candy colours barely move (no neon) and **hue is
  preserved** (each land keeps its identity). The bounce-light (`hemi.groundColor`)
  is graded to match. The **backdrops** (the unlit sky dome, the sea/river sheen)
  deliberately **bypass** the grade via the direct `stdMat`/`stdEmat` path, so
  `DayNight`/`Weather` keep exact control of the sky/fog tint.
- **The view opens up, tier-gated.** Each land's fog density is now the zone base
  scaled by the active tier (`fogDensityFor`): **high ×0.58**, medium ×0.74, **low
  ×0.96**. The meadow's clear-distance roughly **doubles** (fog base 0.006 → 0.0035
  on high) and the deep woods stop feeling like a wall (forest 0.018 → 0.0104; ~74%
  → ~36% fogged at its fence); **indoor lairs blend only halfway** toward the open
  multiplier so caverns/thickets open a little but stay **enclosed + moody**. Phones
  (low tier) keep ~the old density — a tight, atmospheric radius for frame rate. The
  camera **draw distance** (`maxZ`) is set per tier to match (high **360** / medium
  290 / low 210, each clearing its zone's sea-skirt so the opened view never hard-
  clips; the infiniteDistance sky dome is always drawn), and the third-person camera
  framing was pulled back a touch (radius 12 → 13, zoom-out cap 18 → 22). Weather now
  thickens this **graded** fog base, so storms still read on the opened view.
- **Punchy-but-readable tone mapping.** A small per-tier **exposure** nudge (high
  1.08 → 1.10, medium 1.02 → 1.05, low 1.00 → 1.02) makes the brighter palette feel
  sunny without blowing out under ACES; `applyZoneMood` now derives exposure/contrast
  from the same pure `exposureFor`/`contrastFor` helpers, so the per-zone moods (airy
  meadow, moody lairs) are a single source of truth.
- **Readability preserved.** WCAG `luminance`/`contrastRatio` helpers back a new test
  proving gameplay-critical **markers + enemies stay perceptually distinct** from each
  brightened ground (by hue as much as brightness), so nothing washes out.

Perf is effectively **neutral**: thinning fog is a per-pixel shader change (it adds no
geometry — the world is bounded by the zone fence regardless), the grade is a one-time
material tweak, and `maxZ` is *tighter* than the engine default, so culling only
improves. The heavy per-tier costs (PBR / shadows / particles) remain gated by Tasks
3–5. Vitest: **19 → 32 test cases across 5 files** (new `test/artdirection.test.js`,
13 cases: the grade's purity/clamp/hue-preservation, per-tier fog opening + indoor
moodiness, draw-distance ordering, the sane ACES exposure/contrast range, marker
readability, and `buildWorld` applying the graded fog on every tier). Full pipeline
green (lint · typecheck · test · build · Playwright E2E). Content-hashed build — no
`?v=` to bump.

## [2026-06-22] — Task 10 — Fix logical, code & UI bugs + a deeper test net

Hunted down and root-caused the gameplay-correctness defects called out in the
backlog, fixing each at the source and locking it in with a dedicated Vitest
suite (`test/bugfixes.test.js`, 14 cases). No save-schema change (`SAVE_VERSION`
untouched — every fix is derived or transient state, so old saves still load).

- **Roads no longer cross open water off a bridge.** The hub crossroads was laid
  out with a random angle, independent of the river, so a road sliced through the
  water in **every** seed (and its `onRoad` clear-lane was even rotated 90° off
  the visible road mesh). Rebuilt the layout **relative to the river**: one road
  meets the water head-on and earns a real, correctly-sized **bridge** spanning
  its full oblique footprint; the other runs alongside the river (a small jitter
  keeps its crossing beyond the fence). The road mesh, `onRoad`, edges, lampposts
  and bridge placement now share one coherent vector convention. A seeded test
  proves **0 road-over-open-water cells across 40 layouts** (was 40/40), the
  river still blocks elsewhere, and `moveActor` refuses to walk into open water.
- **World resources are hard-capped.** Added `CONFIG.maxResourceNodes` (90),
  enforced at every spawn in `populateAdventure` / `populateWildResources`, so the
  live node count can never grow unbounded across spawn, respawn (which only
  re-enables an existing node), zone travel or reload — covered by cap-invariant
  tests including a forced low cap.
- **Resource pickup audited + hardened.** The walk-up + interact harvest path was
  found robust; hardened `Interactable.distanceTo` so a stale/disposed node (e.g.
  left across a zone swap) returns `Infinity` instead of throwing and breaking
  selection of the valid nodes around it. New regression tests harvest a node
  through the **real interact key** path, immediately **after a zone swap**, and
  across a **respawn re-harvest**.
- **Built castle parts are solid.** Walls, towers and the keep now register
  `{x,z,r}` collision circles in the world's obstacle set (rebuilt on `build()`
  and on save-`restore()`), with the **gate left as a passable gateway**. Because
  the obstacle set is shared, the player is pushed out of the walls **and wand
  bolts splat on them (no shoot-through)** for free, while bolts still fly over
  the top. The build-interact range was widened so raising a part never locks the
  player out. The footprint round-trips through a zone rebuild.
- **The swing lands true.** Melee/ranged damage no longer fires on the **wind-up**;
  it's queued and resolved on the swing's **strike (impact) frame** (from the
  player's live position, in the committed direction), so the hit lines up with
  the animation, stays within arc + range, and lands **exactly once**. Tests
  assert no damage during wind-up, a single in-arc/in-range hit on the strike, and
  out-of-arc/out-of-range misses.

Vitest: **5 → 19 test cases across 4 files** (new `test/bugfixes.test.js`); the
ported harness's melee check was updated to the strike-frame timing. Full
pipeline green (lint · typecheck · test · build · Playwright E2E).

## [2026-06-22] — Task 9 — Modularize the codebase + a production build/test/CI toolchain

Split the 8.3k-line `js/game.js` IIFE into an **ES-module source tree** under
`src/` — `core/config.js` (RNG + CONFIG + PALETTE) and `core/i18n.js` (EN/RU +
`t()` + resolvers); the pure content tables `data/items.js`, `data/content.js`,
`data/story.js`, `data/zones.js`; the runtime monolith `src/game.js`; and the
`src/main.js` composition root — all wired with **explicit `import`/`export`** and
an acyclic dependency graph (data ← i18n ← game ← main). The move was
**mechanical and byte-for-byte**, so behavior is unchanged: the **entire legacy
headless harness (~360 checks) was ported verbatim to Vitest** (`test/harness.test.js`)
and stays green, proving parity.

Stood up the toolchain the rest of the backlog builds on:

- **Build — Vite.** `npm run build` emits a **content-hashed static bundle** into
  `dist/` (served by Pages — the hashing replaces the old `?v=` cache-buster);
  `npm run dev` is an HMR server, `npm run preview` serves the build. **Babylon
  stays on its CDN** (externalized as the `BABYLON` global, never bundled), so the
  published site is still 100% static and the runtime is identical to before.
  `index.html` now loads `src/main.js` as a module.
- **Lint/format — ESLint (flat) + Prettier.** `no-undef` guards every module
  boundary (a missed cross-module import is a hard error); baseline is clean (0
  errors).
- **Types — `tsc --checkJs`.** The clean `core/` + `data/` modules are
  type-checked; the legacy runtime opts out with `@ts-nocheck` (slated for finer,
  individually-typed splits in follow-up runs).
- **Tests — layered.** Vitest **unit/logic** (the ported harness) + **functional**
  flows (`test/functional.test.js`: start → zone travel → save/reload round-trip in
  an isolated boot) + **smoke**, all against faithful Babylon/DOM/Web-Audio stubs
  (`test/setup/stubs.js`); plus a **Playwright** real-browser suite
  (`test/e2e/boot.spec.js`) that boots the built bundle in headless Chromium and
  asserts the canvas comes up with **no console errors** and the core overlays open.
- **CI/CD.** `.github/workflows/ci.yml` runs **install → lint → typecheck → test →
  build → Playwright E2E** (npm cache); the Pages workflow re-runs verify, builds
  `dist/`, and publishes the **built** artifact.
- **Agent ergonomics.** New `ARCHITECTURE.md` (module map + data flow + toolchain)
  and per-directory READMEs; `npm run verify` mirrors the CI fast path.

Revised **Golden Rules 1, 3, 4 & 7** in `CLAUDE.md` + `TODO.md` § 1 to the
module-tree / build-step / Vitest-Playwright-pipeline / content-hashing reality
(per Task 9's *Note on Golden Rules*). No save-schema change (`SAVE_VERSION`
untouched). Test coverage: the ~360 legacy checks are preserved 1:1 in Vitest,
plus 4 new functional/smoke checks and the Playwright boot assertion.

_Follow-up (noted, out of scope here):_ finer single-responsibility splits of the
`src/game.js` runtime into `entities/`, `systems/`, `ui/`, `world/`; and
auto-generating the changelog from commits.

## [2026-06-22] — Task 8 — Extract the changelog into its own `CHANGELOG.md`

Moved the release history out of `TODO.md` § 7 into this dedicated
`CHANGELOG.md` (Keep a Changelog convention: an `## [Unreleased]` section atop a
reverse-chronological, dated list), migrating **every** prior entry verbatim —
dates, task names, the `?v=` notes and the harness-count deltas all preserved.
Adopted a lightweight versioning scheme keyed to the monotonic `index.html`
`?v=` build (documented at the top of this file), and rewired the run workflow so
future runs **append here** instead of growing the backlog file: `TODO.md` § 7 is
now a one-line pointer (heading kept so links don't 404), and § 2 / § 3 / § 6's
run prompt now say "add the entry to `CHANGELOG.md`". `CLAUDE.md` and `README.md`
reference `CHANGELOG.md` as the source of release history and list it in the
project layout. A new harness suite **[34]** (10 checks; total 354 → 364) asserts
`CHANGELOG.md` exists and parses as the expected heading structure (a
`# Changelog` title, exactly one `## [Unreleased]`, the migrated task entries and
their `?v=` build tags), and that `TODO.md` no longer carries dated changelog
entries — so the split can't silently regress. Docs/process only: no playable
bundle change (`?v=` stays **19**) and no save-schema change (`SAVE_VERSION`
untouched).

## [v19] — 2026-06-22 — Task 6: More sound effects + per‑location background ambience

A fuller, fully‑procedural soundscape (still **zero audio files**) built on a new shared **`Mixer`** — one Web
Audio graph routing `Sfx` / `Music` / `Ambience` through **per‑channel bus gains** into a master, with
0..1 channel volumes + a master‑mute that **persist** in `localStorage` (`gg3d_audio`). Richer **SFX**:
per‑surface **footsteps** (grass / stone / sand / snow, fired in stride cadence off the character's
`walkPhase`), a gather/**mine** harvest cue, **quest accept / turn‑in** chimes, a portal **whoosh** on
travel, **UI clicks**, and a hysteresis **low‑health** warning. Every land now has its own **ambient
bed** — meadow **birds + breeze**, forest **wind + creaks**, shore **waves + gulls**, frostpeak **wind
howl**, cavern **drips + drone**, thicket **insects** — selected by a pure, testable `Ambience.bedFor(zone)`
and **crossfaded** (fade‑out + fade‑in, no clicks/pops) when the `ZoneManager` streams between zones.
A small player‑facing **mixer** (`AudioUI`): four volume sliders (Master · Music · Effects · Ambience)
+ a **Mute all** toggle, mirrored on the **start screen** and **pause settings**, EN/RU localized,
applied live and **persisted across reload**. Nothing sounds before the first user gesture (autoplay
policy); ambience scheduling uses `Math.random()` (purely cosmetic) so the seeded gameplay `rng()` stays
deterministic and save/load is untouched. Fully **headless‑safe**: with no `AudioContext` the whole
stack no‑ops, while the pure volume/persistence/mapping logic is still exercised. New harness suite
**[33]** (22 checks; total 332 → 354) covers footstep surface mapping, the per‑zone bed recipes, the
mixer's volume **clamping** + channel validation + **master mute**, the **settings persistence
round‑trip** (survives reload), the headless no‑op path, and — against an injected Web Audio stub — the
**bus‑graph build**, **every SFX cue** firing, **ambience crossfade through all zones**, and
stride‑cadenced **footstep wiring**. No save‑schema change (`SAVE_VERSION` untouched). `index.html`
`?v=` bumped to **19** (css **16**, for the slider/mute styles).

## [v18] — 2026-06-22 — Task 5: More + higher‑quality animation (actions + environment)

A tier‑gated,
fully feature‑detected animation pass. Combat now reads with clear **anticipation → impact →
recovery**: a small, pure **`Swing`** state machine (windup → strike → recover, with leftover time
carried across phase edges so it's **frame‑rate independent**) drives the player's melee arc, ranged
wand thrust and a new **`gather`** chop (hooked into `ResourceNode.harvest`), while `takeDamage` arms a
brief **flinch** recoil. Because both run inside `player.update`, they **pause cleanly** with the menu.
Every land **breathes** via a pure `ambientSpecFor(zone)` → `buildAmbientFX(scene, zone, …)` system:
drifting particles tuned per zone (meadow **pollen**, forest **spores**, **sea mist**, peak **snow**,
cavern **motes**, thicket **embers**) over a few wandering **butterflies** (day) / glowing **fireflies**
(dark), all driven off the clock (frame‑rate independent), **feature‑detected** (`BABYLON.ParticleSystem`
guarded — degrades to just the critter swarm without it), **density‑gated** by a new `Quality` tier
`ambient` knob, and **disposed on zone teardown** (the particle system is freed explicitly; the critter
meshes/materials ride buildWorld's existing auto‑stream‑out — a tracking‑PS smoke proved 6/6 systems
started + disposed, 0 leaked). Wind is now **gustier** (two offset bands) with an optional per‑zone
`theme.wind` strength (windy **peaks** 1.5, breezy **shore** 1.2, sheltered **forest** 0.7). New harness
suite **[32]** (23 checks; total 309 → 332) covers the Swing phase transitions/timers, frame‑rate
independence, the zero/negative‑dt pause freeze, the flinch + gather triggers, the per‑zone ambient
spec + fallback, the tier density gating, and **every zone building + animating + disposing** its
ambient FX headless‑safe (incl. the missing‑`ParticleSystem` path). No save‑schema change
(`SAVE_VERSION` untouched — animation state is transient). `index.html` `?v=` bumped to **18** (css
unchanged at 15).

## [v17] — 2026-06-22 — Graphics‑quality setting (player‑facing tier override)

The auto‑detected
graphics tier can now be **overridden from the pause menu**. A new **Pause → Graphics** selector
(Auto · High · Medium · Low, mirroring the language selector's styling) lets the player force a
tier or return to **Auto** (device detect). `Quality` gains a persisted `pref` with `loadPref()`/
`setPref()`, and `detect()` now resolves the active tier from the saved preference (falling back to
capability detection for "auto"); a tampered/unknown stored value coerces to Auto, and the debug
`window.__GG_QUALITY__` still trumps everything. Because the tier is baked into meshes, materials
and shadows at zone‑build time, a change is applied the **bulletproof** way — `Pause.applyGraphics`
persists the choice, hands the **exact current run** across a reload via the proven `PENDING_LOAD`
hand‑off (the same path "Load Progress" uses), and lets the boot rebuild everything under the new
tier behind the existing **fade veil** ("Applying graphics…"), so **progress is preserved** and
every knob (PBR/env/shadows/post‑FX/mesh density) re‑applies identically to a fresh boot. New
EN+RU strings (`settings.graphics`, `settings.gfx*`, `pause.applyingGfx`); the dynamic hint shows
the Auto‑detected tier and relocalizes live. New harness suite [31] covers manual override, the
Auto fallback, **localStorage persistence (survives reload)**, invalid‑value coercion, the
`__GG_QUALITY__` priority, and the live‑hint string resolution (14 checks; harness 295 → 309).
Headless‑safe (localStorage/DOM feature‑detected). No save‑schema change (`SAVE_VERSION`
untouched). `index.html` `?v=` bumped to **17** (css **15**, for the selector styles).

## [v16] — 2026-06-21 — Task 3: Higher‑fidelity models (character, monsters, trees, stones, environment)

A tier‑gated, fully feature‑detected model + material pass that builds on the Task 4 lighting.
The shared `mat`/`emat` helpers now return an **energy‑conserving `PBRMaterial`** (metallic 0 /
roughness‑driven) on the PBR tiers and fall back to the tuned **`StandardMaterial`** on weak GPUs
and the headless harness; a tiny alias maps the legacy `diffuseColor`/`specularColor` writes
(weapon recolour, NPC markers, water/sea shimmer) onto the PBR channels so **every existing
build/animation path is untouched**, and the unlit sky dome + sea/river sheen stay on a dedicated
`stdMat`/`stdEmat` path. `makeEnvironment` builds a ~6 KB **procedural gradient cube** (warm sky →
cool horizon → dark ground + a soft sun glow — **no asset files**) and installs it as
`scene.environmentTexture` for image‑based **sky reflections**, gated to the desktop tier and
`RawCubeTexture`‑feature‑detected. `gloss()` tightens roughness/metalness for **candy sheen, gem
facets and metal blades** (PBR) or a crisp specular (Standard). The mesh helpers
(`sphere`/`cyl`/`disc`/`capsule`) scale **segment/tessellation density** with the tier, and the
scenery gains **layered, shaded tree canopies on tapered trunks**, **craggier rocks** (icosphere
subdivisions + a satellite chunk on high), **clustered crystal spires**, and **hands** on Lily —
all gated by a per‑tier `foliage` budget so the dense forests/meadow keep their triangle budget
(the mobile tiers never exceed the old geometry; only desktop "high" adds triangles + PBR + the
IBL probe). Per‑flower materials are now **shared** (one stem + one head per palette colour), so
the 140‑flower meadow dropped from ~280 one‑off materials to ~55. New harness suite [30] covers
the model‑fidelity tier data, the **PBR ⇄ Standard fallback**, the diffuse/specular aliases, the
`gloss()` tweak, the env probe, and **every zone building + tearing down on the PBR + env tier**;
a throwaway scene‑tracking browser‑path smoke proved teardown is **leak‑free** (Δmesh/Δmat/Δnode
= 0 across all six zones) with 16–52 PBR materials per zone. No save‑schema change
(`SAVE_VERSION` untouched). `index.html` `?v=` bumped to 16.

## [v15] — 2026-06-21 — Task 4: More + more‑realistic shadows & lighting

A tier‑gated, fully
feature‑detected lighting pass. A new `Quality` module picks one graphics tier
(high/medium/low) from device facts — `Quality.pick()` is a pure, unit‑tested function and
`window.__GG_QUALITY__` can force a tier. `makeSunShadows` replaces the old one‑size shadow
setup with a per‑tier directional‑sun generator: a **CascadedShadowGenerator** with
**contact‑hardening** outdoors on capable desktops, **PCF** on the middle tier, and the cheap
**blurred‑exponential** map on weak GPUs / WebGL1 / indoors — all with tuned
bias/normalBias/darkness + tightened shadow Z‑bounds so casters sit grounded with no acne or
peter‑panning. `setupPostFX` adds **ACES tone mapping** (exposure/contrast) on the scene image
processing, with **bloom** (DefaultRenderingPipeline, medium+high) and **SSAO2** (high only,
`IsSupported`‑checked) layered on the camera once and `try`/caught. `applyZoneMood` tunes
exposure/contrast per zone (bright peaks, moody caverns) via new optional `theme.expMul/conMul/
shadowDark` fields, integrated with the travel hook and kept in sync with `DayNight`/`Weather`
(which still own the sun/sky/fog tint). Every engine‑only API is feature‑detected so the Node
harness stays green; new suite [29] covers tier selection, per‑zone build/teardown of the shadow
generator, post‑FX/`makeSunShadows` headless‑safety, and the per‑zone mood, plus a throwaway
two‑tier (high/low) WebGL2 browser‑path smoke check. No save‑schema change (`SAVE_VERSION`
untouched). `index.html` `?v=` bumped to 15.

## [2026-06-21] — Task 7 — Russian language support

Full **English + Russian** localization.
A new i18n layer — `LOCALES = { en, ru }` flat dictionaries + `t(key, params)` (with
`{placeholder}` interpolation, English fallback and a `plural()` helper for Russian one/few/many)
+ a parallel `RU` object for the data tables (English stays the source; resolvers like
`tItemName`/`tZoneName`/`tQuestTitle` pick the locale and fall back to English). **Every**
user-facing string is routed through it (start screen, HUD, toasts, prompts, shop/inventory/
anvil/crafting/castle/quest-log/dialogue, and all data: zones, NPCs + dialogue, quests, items,
relics, castle parts, bosses, materials, weather/clock). Language selectors on the start screen
and in pause settings switch **live** (re-rendering visible UI, updating `<html lang>`) and the
choice persists in `localStorage`, applied before first paint. New harness suite [28]
(EN/RU key-parity, `t()` interpolation, Russian pluralization, data-translation completeness,
locale persistence round-trip). Headless-safe (localStorage/`querySelectorAll` feature-detected).

## [2026-06-21] — Task 2 — Main story line with missions + side quests

A structured,
chaptered main campaign (`STORY`/`MISSIONS`/`SIDE_QUESTS` + the `Story` controller) that
guides the player from the vale to the dragon with no guesswork — ordered mission unlocks,
a live objective tracker, new `defeat_boss`/`build`/`defeat_dragon` objectives, a chaptered
quest log separating main vs side, optional (some repeatable) side quests, intro/chapter/
ending beats, and v6 save/load of story state (round-tripped in tests). Also fixed a latent
save-file crash (the download filename referenced a non-existent `wave` field).

## [pre-changelog] — Task 1 — RPG world + loadable zones

_(Originally logged as unreleased.)_ **Shipped** (see git history `RPG zones (1–5/n)`),
deployed to Pages.
