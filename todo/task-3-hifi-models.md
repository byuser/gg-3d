# Task 3 — Higher‑fidelity models (character, monsters, trees, stones, environment)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-21 · Shipped a tier‑gated, feature‑detected model/material pass:
  `mat`/`emat` now return **`PBRMaterial`** (metallic/roughness) on capable tiers with a
  **`StandardMaterial` fallback** (a small alias maps the legacy `diffuseColor`/`specularColor`
  writes onto PBR so every build/anim path is untouched); a tiny **procedural cube** env probe
  (`makeEnvironment`, no asset files) gives image‑based sky reflections; `gloss()` adds candy
  sheen / gem facets / blade sheen; mesh helpers scale **segment density** by tier and the scenery
  gains layered, shaded tree canopies on tapered trunks, craggier rocks + clustered crystals, and
  Lily gets hands. Per‑flower materials are now **shared** (the dense meadow dropped from ~280 to
  ~55 materials). Phones stay on lighter geometry (≤ the old counts); only desktop "high" adds
  triangles + PBR + the IBL probe. New harness suite [30] + a scene‑tracking browser‑path smoke
  proving **leak‑free** teardown. No save‑schema change.
- **Depends on:** best done **after Task 4** (lighting) so materials read well.
- **Goal.** Make every model look noticeably **richer and prettier** within the
  mobile + static‑hosting budget. "Realistic" here = **stylized‑PBR / higher
  detail**, *not* photoreal (that's not viable on Pages + phones).
- **Scope (build this):**
  - Upgrade materials to **`PBRMaterial`** (metallic/roughness) with a small
    **environment texture** for image‑based lighting, where it improves looks and
    perf allows; keep `StandardMaterial` fallbacks behind feature detection.
  - Higher‑detail **procedural meshes**: more shape/segment detail and better
    silhouettes for Lily, the sweets/monsters, trees (trunk taper + layered
    canopy), rocks, crystals, and key props — without exploding tri counts.
  - Optional: a **few small glTF assets** for hero props *iff* they stay tiny,
    lazy‑loaded via `babylonjs.loaders`, with a procedural fallback. Procedural
    is preferred.
  - A **quality tier** (auto‑detected: high on desktop, lower on mobile/weak
    GPUs) controlling mesh density / PBR / env so phones stay smooth.
- **Acceptance criteria:**
  - Models are visibly improved; the scene holds **≥ ~45–60 fps** on a mid‑range
    phone (document how you checked / the budget you kept).
  - Quality tier degrades cleanly; nothing throws on low‑end or headless.
  - All new meshes/materials are **disposed on zone teardown** (no leaks across
    travel — verify with the existing teardown path).
  - Repo stays lightweight (no large binaries; any asset is small + fallback‑ed).
- **Tests to add:** zones still build/teardown without leaking (extend the zone
  suite); quality‑tier selection is a pure, testable function; feature‑detect
  guards verified headless.
- **Files:** `js/game.js` (mesh builders/helpers `mat`/`emat`/`sphere`/…,
  `buildWorld`, `Player`/`Monster` `_build`), maybe a tiny `assets/` dir,
  `test/harness.js`, `README.md`.
- **Out of scope:** photoreal textures, multi‑MB texture packs, a full art
  pipeline.

