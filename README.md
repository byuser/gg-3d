# Good Game 3D

A third-person browser **action** game. Run as **Lily**, wield a **magic wand**, and
survive escalating **waves of living sweets**. Blast the candy monsters and grab the
glowing **artifacts** to rack up your **score**.

▶️ **Play:** once GitHub Pages is enabled, the game is live at
`https://<owner>.github.io/gg-3d/`

![status](https://img.shields.io/badge/build-static%20site-blue) ![engine](https://img.shields.io/badge/engine-Babylon.js-orange)

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / Arrow keys | on-screen stick (bottom-left) |
| Look | drag mouse | drag the screen |
| Zoom | mouse wheel | two-finger pinch |
| Cast magic | `Space` or `F` (hold to fire) | ✨ button (bottom-right) |
| Collect artifact | `E` | action button (bottom-right) |
| Start next wave | `Enter` / `N` | Next Wave button |
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
- **Bosses:** every **5th wave** a colossal **Sweet King** 👑 storms in — a giant
  boss with a dedicated **health bar**, far more HP, a slower but heavier stomp, and a
  bite that really hurts. Felling one is worth a big score bonus and a guaranteed
  **purse of coins**. The boss brings a smaller honour guard of regular sweets.
- **The merchant:** once a wave is cleared a **travelling merchant** 🧙 appears at the
  central plaza and leaves when the next wave begins. Walk up and press **E** (or the
  action button) to open the **shop**. The shop now stocks **12 wares**: upgrade your
  wand's **damage**, **fire rate** and **bolt size**; add **piercing** bolts; unlock
  the three-bolt **Trident Wand** and then the five-bolt **Storm Wand**; raise your
  **max health** (Vitality Charm), **move speed** (Swift Boots), **damage resistance**
  (Aegis Ward), **lifesteal** (Vampiric Gem) and **coin magnet** range (Lodestone); or
  grab a **healing brew**. Spend your coins between waves!
- **Solid world:** trees, rocks, bushes, giant toadstools, lampposts and the river are
  **solid** — you bump and slide around them instead of walking through. A winding
  **river** crosses the meadow with **wooden bridges** at the crossings.
- **Living sweets:** a dozen kinds — lollipops, gummy bears, cupcakes, donuts, candy
  canes, ice-cream cones, macarons, candy corn, chocolate bars, jelly beans,
  marshmallows and pretzels.
- **Monster counter:** the HUD shows how many sweets are left in the current wave
  (`🍬 left / total`).
- **Magic wand:** Lily carries a glowing wand. Hold the cast key/button to fire bolts;
  a hit pops a sweet for points.
- **Score:** **+25** per sweet defeated, **+50** per artifact collected. **Coins** are a
  separate currency spent at the merchant.
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
gameplay code can run in Node — verifying collision, the river barrier, wave/boss
spawning, the shop, lifesteal, the seeded RNG, the **save/load round-trip**, and the
**pause menu** without a browser:

```bash
node test/harness.js
```

### Architecture

`js/game.js` is organised as small systems so features are additive, not a rewrite:

- **`Interactable` / `InteractionSystem`** — a reusable "walk up + press E" contract;
  artifacts and the **merchant NPC** use it (puzzle levers will too).
- **`Input`** — unifies keyboard, the on-screen joystick, and the cast button.
- **`Player`** — Lily, built from primitives with a procedural walk cycle, a **magic wand**,
  casting, health, and a **weapon stat block** the shop upgrades.
- **`Projectile`** — the wand's magic bolts (spawn, travel, hit-test, fizzle), parameterised
  by the player's weapon (damage, speed, size, colour) for multishot + upgrades.
- **`Monster`** — a "living sweet" with chase AI, a hoppy bob, and a pop-on-death effect.
- **`Boss`** — a giant "Sweet King" (shares the Monster interface) with scaling HP, a
  health bar, heavier contact damage, and a coin-jackpot on death; spawned every 5 waves.
- **`Coin` / `Merchant` / `Shop`** — coins drop from sweets and fund the plaza merchant's
  shop, where you buy a new weapon or upgrade the wand between waves.
- **`WaveSystem`** — the timer that spawns escalating waves, then shows the **results window**
  (collapsible to a corner widget) and reveals the merchant once a wave is cleared.
- **`buildWorld`** — lighting, ground, procedural scenery, a river + bridges, and a
  circle-based **collision** system (`obstacles` + `moveActor`) that slides the player
  around solid props and keeps them out of the water. Driven by a **seeded RNG** so a
  saved world regenerates identically on load.
- **Save/load (`serializeGame` / `applySave`)** — snapshots the whole run to JSON and
  rebuilds it: re-seed + regenerate the world, then lay the live entities (player +
  perks, score, money, monsters, boss, coins, artifacts, wave clock) back on top.
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
- [x] Magic wand + projectile combat
- [x] Escalating waves of "living sweet" enemies (12 types, more/faster/tougher each wave)
- [x] Player-paced waves with a Next Wave button + live monster counter
- [x] Wave-results window (skip the wait) that collapses to a non-blocking corner widget
- [x] Coins dropped by sweets, collected like artifacts, used as shop currency
- [x] Central merchant NPC — a 12-item shop of weapons, upgrades & consumables
- [x] Boss fights — a giant "Sweet King" with a health bar every 5 waves
- [x] Solid scenery collision (trees, rocks, bushes, toadstools, lampposts)
- [x] A larger map with a winding river + wooden bridges and richer scenery
- [x] Score + health + game-over
- [x] In-game pause menu (resume / save / restart / exit, with confirmations)
- [x] Save progress to a file & load it back (seeded world + full game state)
- [ ] Puzzles (levers, plates, gated doors)
- [ ] NPC dialogue (Babylon GUI panels)
