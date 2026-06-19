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
- **The merchant:** once a wave is cleared a **travelling merchant** 🧙 appears at the
  central plaza and leaves when the next wave begins. Walk up and press **E** (or the
  action button) to open the **shop**, where you can **buy a new weapon** (the
  three-bolt Trident Wand) and **upgrade your wand** — more damage, faster casting,
  bigger bolts — or buy a healing brew. Spend your coins between waves!
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
.github/workflows/      # GitHub Pages deploy on push
.nojekyll               # serve files as-is (skip Jekyll processing)
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
- **`Coin` / `Merchant` / `Shop`** — coins drop from sweets and fund the plaza merchant's
  shop, where you buy a new weapon or upgrade the wand between waves.
- **`WaveSystem`** — the timer that spawns escalating waves, then shows the **results window**
  (collapsible to a corner widget) and reveals the merchant once a wave is cleared.
- **`buildWorld`** — lighting, ground, procedural scenery.

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
- [x] Central merchant NPC — buy new weapons & upgrade the wand between waves
- [x] Score + health + game-over
- [ ] Puzzles (levers, plates, gated doors)
- [ ] NPC dialogue (Babylon GUI panels)
