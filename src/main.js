// Composition root for Good Game 3D.
//
// Importing the game module wires up the world and boots it against the DOM and
// the CDN-loaded global `BABYLON`. The module self-initializes on import (it
// disables the Start button until the engine is ready, then `boot()`s), exactly
// as the legacy single <script> did — and, when a harness has set
// `window.__GG_TEST__`, it installs the test seam there. Keeping this entry tiny
// means the whole game is built from the `src/**` module tree by Vite into the
// static `dist/` bundle that GitHub Pages serves.
import "./game.js";
