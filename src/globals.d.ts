// Ambient globals for type-checking. Babylon.js is loaded from its CDN as a
// classic <script>, exposing a global `BABYLON`; the headless test harness
// installs the same name. The game also exposes a test seam on `window`.
declare const BABYLON: any;

interface Window {
  __GG_TEST__?: any;
}
