# Good Game 3D

A third-person browser adventure. Run as **Lily**, gather the **three glowing relics**
scattered across the meadow, and store each one in the **chest** to win.

▶️ **Play:** once GitHub Pages is enabled, the game is live at
`https://<owner>.github.io/gg-3d/`

![status](https://img.shields.io/badge/build-static%20site-blue) ![engine](https://img.shields.io/badge/engine-Babylon.js-orange)

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / Arrow keys | on-screen stick (bottom-left) |
| Look | drag mouse | drag the screen |
| Pick up / Store | `E` or `Space` | action button (bottom-right) |

Pick up a relic, carry it to the glowing chest, and press the action to store it.
Store all three to win.

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

`js/game.js` is organised as small systems so the roadmap is additive, not a rewrite:

- **`Interactable`** — a reusable "walk up + press E" contract. Relics and the chest use it;
  NPCs and puzzle levers will too.
- **`InteractionSystem`** — finds the nearest interactable in range and drives the prompt.
- **`Input`** — unifies keyboard and the on-screen joystick into one move vector.
- **`Player`** — Lily, built from primitives with a procedural walk cycle; combat state hangs here.
- **`buildWorld`** — lighting, ground, scenery; physics and enemies attach here.

The bottom of `game.js` documents the exact seams for **CombatSystem**, **DialogueSystem**,
and **PuzzleSystem**.

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
- [x] Collect items and store them in the chest (win at 3)
- [ ] Combat with enemies (Havok physics + hitboxes)
- [ ] Puzzles (levers, plates, gated doors)
- [ ] NPC dialogue (Babylon GUI panels)
