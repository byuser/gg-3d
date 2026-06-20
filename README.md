# Good Game 3D

A third-person browser **action-RPG**. Run as **Lily**, equip **weapons, armour and
accessories**, and survive escalating **waves of living sweets**. Loot **gear** from a
merchant and from **bosses**, manage your **inventory**, and grab glowing **artifacts**
to rack up your **score**.

▶️ **Play:** once GitHub Pages is enabled, the game is live at
`https://<owner>.github.io/gg-3d/`

![status](https://img.shields.io/badge/build-static%20site-blue) ![engine](https://img.shields.io/badge/engine-Babylon.js-orange)

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / Arrow keys | on-screen stick (bottom-left) |
| Look | drag mouse | drag the screen |
| Zoom | mouse wheel | two-finger pinch |
| Attack (weapon) | `Space` or `F` (hold) | ✨ button (bottom-right) |
| Inventory / equipment | `I` (or `B`) | 🎒 button |
| Collect / shop (`E`) | `E` | action button (bottom-right) |
| Start next wave | `Enter` / `N` | Next Wave button |
| Music on/off | `M` | 🔊 button (top-right) |
| Pause / menu | `Esc` | ☰ button (top-right) |

## How to play

- **Waves:** each wave a swarm of **living sweets** marches in from the meadow's edge.
  Clear them all and a **wave-results window** pops up — it shows your tally (sweets
  defeated, artifacts, coins earned) and a **Start Next Wave** button that skips the
  wait. Close it with the **×** and it shrinks to a small **corner widget** so you can
  roam the map (and visit the merchant) with the view unblocked; the next wave still
  starts from there, or auto-starts after 60 seconds. Every wave brings **more sweets**
  (faster and tougher) and **more artifacts**.
- **Coins:** defeated sweets sometimes drop **golden coins**. Walk near one and it's
  scooped up (coins even magnet toward you). Coins are the currency you spend at the
  merchant's shop.
- **Gear & inventory:** open your **inventory** (`I` / 🎒) to see your **equipment
  slots** — **helmet**, **breastplate**, **boots**, a **necklace**, **two rings**, and
  **two hands** — and your **bag**. Click a bag item to equip it; click an equipped slot
  to put it back. Your **stats** (max health, resistance, speed, lifesteal, weapon
  damage) update live from whatever you're wearing. Hold a **two-handed** weapon (bow,
  staff, greatsword) and it fills both hands; hold **two one-handers** to **dual-wield**
  for a faster, stronger attack.
- **Weapons:** ranged **wands**/**staves** (magic bolts), **bows** (arcing, piercing
  arrows) and melee **swords**, **axes** and **daggers** (a sweeping arc that can hit
  several sweets at once). Hold the attack key/button to fight.
- **Bosses:** every **5th wave** a colossal **Sweet King** 👑 storms in — its **type is
  random** and grows tougher each time. A **Charger** winds up and dashes at you; a
  **Caster** lobs hostile candy bolts; a **Summoner** conjures swarms of extra sweets; a
  **Stomper** is a slow tank that ground-pounds a damaging shockwave. Each has a
  dedicated **health bar**, scales up every cycle, and drops a guaranteed **rare item**
  plus a **purse of coins**.
- **Coins:** defeated sweets sometimes drop **golden coins** (and bosses a whole purse).
  Walk near one and it's scooped up (coins even magnet toward you). Coins are the
  currency you spend at the merchant's shop.
- **The merchant:** once a wave is cleared a **travelling merchant** 🧙 appears at the
  central plaza and leaves when the next wave begins. Walk up and press **E** (or the
  action button) to open the **shop**. Two tabs: **Buy** normal weapons, armour and
  accessories, or **Sell** any spare gear from your bag (including rare boss loot) for
  coins. **Rare gear is never sold here — only bosses drop it.**
- **Solid world:** trees, rocks, bushes, giant toadstools, lampposts and the river are
  **solid** — you bump and slide around them instead of walking through. A winding
  **river** crosses the meadow with **wooden bridges** at the crossings.
- **Living sweets:** a dozen kinds — lollipops, gummy bears, cupcakes, donuts, candy
  canes, ice-cream cones, macarons, candy corn, chocolate bars, jelly beans,
  marshmallows and pretzels.
- **Monster counter:** the HUD shows how many sweets are left in the current wave
  (`🍬 left / total`).
- **Score:** **+25** per sweet defeated, **+50** per artifact collected. **Coins** are a
  separate currency spent at the merchant.
- **Music:** a procedurally-synthesised soundtrack plays as you fight (no audio files —
  it's generated in-browser). Toggle it with `M` or the 🔊 button.
- **Health:** the sweets bite on contact. When your health hits zero it's **game over** —
  your final score and the wave you reached are shown.
- **Camera:** the view follows Lily at a fixed distance; zoom only with the mouse
  wheel (or a two-finger pinch on mobile).
- **Pause menu:** press **Esc** or the **☰** button to pause the game at any time. The
  menu lets you **Resume**, **Save Progress**, **Restart**, or **Exit to Menu** — the
  last two ask for confirmation so a stray tap can't wipe your run.
- **Save & load:** **Save Progress** downloads a small `.json` save file to your device
  capturing *everything* needed to resume — the procedural environment (via its world
  seed), your score, money, perks/upgrades, weapon, health, every live sweet and boss,
  the dropped coins and artifacts, and the wave clock. Back on the **start screen**,
  **Load Progress** reads a save file from your device and drops you right back where you
  left off — even on a different device or browser.

## Why Babylon.js?

The brief is a game that runs on **GitHub Pages** (static hosting, no server) on both
**mobile and desktop**, and whose **future releases add combat, puzzles, and NPC dialogue**.

[**Babylon.js**](https://www.babylonjs.com/) is a full WebGL **game engine** — not just a
renderer — shipped as plain static JS files, so it deploys to GitHub Pages with zero build
step. Out of the box it gives us exactly what the roadmap needs:

- **Physics engine** (Havok / Ammo) → ready for the **combat** release.
- **GUI system** (`babylon.gui`, already loaded) → ready for **NPC dialogue**.
- **Camera + input + animation systems** with first-class **touch support** → mobile works today.
- **Scene graph + collisions + asset loaders** → puzzles and richer levels slot in cleanly.

Three.js is more popular but is a low-level rendering library where physics, GUI, and controls
are separate add-ons you assemble yourself — more glue code for a game with this roadmap.
PlayCanvas is strong but is editor-centric. Babylon.js is the best fit for a code-first,
static-hosted game that needs to grow into a small RPG.

## Project layout

```
index.html              # markup, overlays, HUD, CDN script tags
css/style.css           # HUD, overlays, touch controls, responsive styling
js/game.js              # engine, systems, gameplay
test/harness.js         # headless Node harness that exercises the gameplay logic
.github/workflows/      # GitHub Pages deploy on push
.nojekyll               # serve files as-is (skip Jekyll processing)
```

### Tests

`test/harness.js` stubs Babylon + the DOM (with faithful vector math) so the real
gameplay code can run in Node — verifying collision, the river barrier, wave spawning,
the **boss archetypes** (caster bolts, summoned minions, scaling, rare drops), the
**gear economy** (buy / equip / dual-wield / sell), **projectile physics** (gravity arc
+ finite life), the seeded RNG, the **save/load round-trip** (inventory + equipment) and
the **pause menu** without a browser:

```bash
node test/harness.js
```

### Architecture

`js/game.js` is organised as small systems so features are additive, not a rewrite:

- **`Interactable` / `InteractionSystem`** — a reusable "walk up + press E" contract;
  artifacts and the **merchant NPC** use it (puzzle levers will too).
- **`Input`** — unifies keyboard, the on-screen joystick, and the cast button.
- **`Player`** — Lily, built from primitives with a procedural walk cycle, a swappable
  held weapon (wand / bow / blade), melee + ranged attacks, health, and a derived stat
  block computed from her gear.
- **`ITEM_DB` / equipment / `recomputeStats`** — the item catalogue (weapons, armour,
  accessories; normal + rare), the slot model (helmet/breastplate/boots/necklace/2 rings/
  2 hands), and the function that recomputes the player's stats from what's equipped.
- **`Inventory` / `Shop`** — the bag-and-paper-doll inventory UI (equip/unequip, live
  stats) and the merchant's **Buy/Sell** shop (normal stock only; rare gear is boss-only).
- **`Projectile` / `Hazard`** — gravity-bound, life-capped ballistic projectiles. The
  player's bolts/arrows (`Projectile`) and the bosses' hostile candy bolts (`Hazard`)
  both arc under gravity and die on ground/timeout, so nothing flies forever.
- **`Monster`** — a "living sweet" with chase AI, a hoppy bob, and a pop-on-death effect.
- **`Boss`** — four **archetypes** (charger / caster / summoner / stomper) sharing the
  Monster interface; each has its own attack pattern, scales every cycle, rolls in
  randomly every 5 waves, and drops a guaranteed **rare item** (`ItemDrop`) + coins.
- **`Coin` / `ItemDrop` / `Merchant`** — coins and rare loot dropped in the world, plus
  the plaza merchant who runs the shop between waves.
- **`Music`** — a tiny Web Audio synth that plays a looping procedural soundtrack (no
  audio assets), mutable from the HUD.
- **`WaveSystem`** — the timer that spawns escalating waves, then shows the **results window**
  (collapsible to a corner widget) and reveals the merchant once a wave is cleared.
- **`buildWorld`** — lighting, ground, procedural scenery, a river + bridges, and a
  circle-based **collision** system (`obstacles` + `moveActor`) that slides the player
  around solid props and keeps them out of the water. Driven by a **seeded RNG** so a
  saved world regenerates identically on load.
- **Save/load (`serializeGame` / `applySave`)** — snapshots the whole run to JSON and
  rebuilds it: re-seed + regenerate the world, then lay the live entities (player pose +
  **inventory & equipment**, score, money, monsters, boss archetype, coins, rare drops,
  artifacts, wave clock) back on top; stats are recomputed from the restored gear.
- **`Pause`** — the in-game pause menu (Resume / Save / Restart / Exit) that freezes the
  simulation, with a confirmation guard on the destructive actions.

The bottom of `game.js` documents the remaining seams for **PuzzleSystem** and **DialogueSystem**.

## Run locally

It's a static site — any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment

Pushing to the deploy branch triggers `.github/workflows/deploy-pages.yml`, which uploads the
repo as a Pages artifact and publishes it. Enable Pages once in
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Roadmap

- [x] Third-person character, movement & camera (mobile + desktop)
- [x] Collect artifacts for score
- [x] Weapons (wand / bow / staff / sword / axe / dagger) with ranged + melee combat
- [x] Gravity-bound projectiles (arcing arrows/bolts) that never fly forever
- [x] Gear system: armour (helmet/breastplate/boots), accessories (2 rings + necklace)
- [x] Inventory + equipment (two hands; dual-wield or a two-handed weapon) with live stats
- [x] Normal gear bought from the merchant; rare gear dropped by bosses; sell anything back
- [x] Escalating waves of "living sweet" enemies (12 types, more/faster/tougher each wave)
- [x] Player-paced waves with a Next Wave button + live monster counter
- [x] Wave-results window (skip the wait) that collapses to a non-blocking corner widget
- [x] Coins dropped by sweets, collected like artifacts, used as shop currency
- [x] Boss fights — four archetypes (charger/caster/summoner/stomper), random every 5 waves
- [x] Procedural background music (Web Audio, no assets) with a mute toggle
- [x] Solid scenery collision (trees, rocks, bushes, toadstools, lampposts)
- [x] A larger map with a winding river + wooden bridges and richer scenery
- [x] Score + health + game-over
- [x] In-game pause menu (resume / save / restart / exit, with confirmations)
- [x] Save progress to a file & load it back (seeded world + full game state)
- [ ] Puzzles (levers, plates, gated doors)
- [ ] NPC dialogue (Babylon GUI panels)
