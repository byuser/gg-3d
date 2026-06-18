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
| Cast magic | `Space` or `F` (hold to fire) | ✨ button (bottom-right) |
| Collect artifact | `E` | action button (bottom-right) |

## How to play

- **Waves:** every **60 seconds** a new wave of **living sweets** (lollipops, gummy
  bears, cupcakes, donuts, candy canes) marches in from the meadow's edge. Each wave
  is **bigger than the last** and drops **more artifacts** to collect.
- **Magic wand:** hold the cast key/button to fire glowing bolts. A hit pops a sweet
  for points.
- **Score:** **+25** per sweet defeated, **+50** per artifact collected.
- **Health:** the sweets bite on contact. When your health hits zero it's **game over** —
  your final score and the wave you reached are shown.

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
  artifacts use it (NPCs and puzzle levers will too).
- **`Input`** — unifies keyboard, the on-screen joystick, and the cast button.
- **`Player`** — Lily, built from primitives with a procedural walk cycle, a **magic wand**,
  casting, and health.
- **`Projectile`** — the wand's magic bolts (spawn, travel, hit-test, fizzle).
- **`Monster`** — a "living sweet" with chase AI, a hoppy bob, and a pop-on-death effect.
- **`WaveSystem`** — the 60-second timer that spawns escalating waves of sweets + artifacts.
- **`buildWorld`** — lighting, ground, procedural scenery.

The bottom of `game.js` documents seams for **PuzzleSystem**, **DialogueSystem**, and **power-ups**.

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
- [x] Escalating waves of "living sweet" enemies (every minute)
- [x] Score + health + game-over
- [ ] Power-ups dropped by sweets (faster casting, healing)
- [ ] Puzzles (levers, plates, gated doors)
- [ ] NPC dialogue (Babylon GUI panels)
