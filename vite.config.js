import { defineConfig } from "vite";

// Good Game 3D ships as a *static* site to GitHub Pages (served from a project
// subpath like https://<user>.github.io/gg-3d/), so we build with a relative
// `base` and emit a content-hashed bundle into `dist/` — that hashing replaces
// the old `?v=` cache-buster. Babylon.js is loaded from its CDN via classic
// <script> tags in index.html (a global `BABYLON`), so it is intentionally NOT
// bundled: the source references the global and Vite leaves it untouched. This
// keeps the bundle tiny and the runtime identical to the pre-build single file.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: true,
  },
  server: { port: 5173 },
});
