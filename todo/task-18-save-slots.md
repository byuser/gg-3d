# Task 18 — Cloud‑saves browser fix + multiple manual save slots with full management (rename / delete / load)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-25 · Shipped a pure **`SaveSlots`** store (6 named local slots in
  `localStorage`, each the full `serializeGame()` payload + metadata; immutable create/list/rename/
  delete/overwrite + next‑free selection) rendered by a thin **`SavesUI`** — one **Manage Saves**
  screen reachable from the start screen **and** pause with **Load / Rename (inline) / Delete /
  Overwrite / New save**, a **cloud** section (sign‑in CTA when signed‑out, else the cloud slots with
  Restore + **delete**, reusing `CloudSave.listSaves`/`restore`/new `deleteSave`), and file
  export/import. **Fixed the dead start‑screen cloud action**: the cloud browser now opens even
  signed‑out with a clear state + sign‑in button (no more no‑op). Destructive actions reuse a
  generalized, screen‑centred **`Pause.askConfirm(action,text,onYes)`**; loads go through the same
  boot reload path as file/cloud (reconciled via `cloudNewer`). The prior single‑slot (Task‑17 auto‑
  session) snapshot **migrates** into a named slot. Added **playtime** to the save → `SAVE_VERSION`
  **9 → 10** (legacy saves load with `playSec = 0`). New EN+RU strings (key‑parity green). New
  `test/saveslots.test.js` (25 cases; Vitest 164 → 189) + a Playwright `saves.spec.js` (open → save →
  rename → reload → load) at desktop + the S24 Ultra portrait + landscape profiles.
- **Depends on:** the save layer (Tasks 9/15) and **Task 17** (durable session) —
  build this **after/with** Task 17 so slots and the auto‑session share one store.
  Coordinate `SAVE_VERSION` with any task that changes the schema.
- **Goal.** On the **start screen**, clicking **cloud saves does nothing** (the
  entry point is dead/unwired), and the game has **no real manual save slots** —
  local saving is only a file download and the cloud has a **single overwrite
  slot**. Add a proper **save‑management system** like shipped RPGs: several
  **named manual slots** (local **and** cloud) with **load / rename / delete**,
  surfaced from a single, working **Saves** screen reachable from the start screen
  and pause menu.
- **Scope (build this):**
  - **Fix the dead start‑screen cloud‑saves action.** Make the start‑screen cloud
    entry point actually open the **cloud‑saves browser** (`CloudUI.openList()` /
    `#cloudSaves` overlay): wire/repair the handler (`#cloudListBtn` and/or a
    "Cloud saves" item in the new Saves screen), and when **cloud is not
    configured/ signed‑out**, show a clear state + a sign‑in CTA instead of a
    no‑op. The list must render, and **Restore** must load through the existing
    boot reload path.
  - **Multiple named manual slots (local).** Replace the single file‑download model
    with **N manual save slots** persisted locally (e.g. **6+** slots in
    `localStorage`/IndexedDB), each storing the full `serializeGame()` payload plus
    metadata (**name**, timestamp, zone, level, playtime). Keep **file
    export/import** as an extra option, but the primary UX is in‑game slots like
    big RPGs.
  - **Save management UI (load / rename / delete).** A single **Saves** overlay
    (reachable from start screen **and** pause) listing all slots — **local** and
    **cloud** in one place, clearly labelled — each row offering **Load**,
    **Rename** (inline edit, i18n‑safe, length‑capped) and **Delete** (with a
    confirm, reusing `Pause.askConfirm`). "**New save**" writes to the next free
    slot or overwrites a chosen one (with confirm). Mirror the management actions
    for **cloud** saves where the Drive API allows (rename via metadata, delete via
    the Drive client), reusing `CloudSave.listSaves()`/`restore()`/prune.
  - **Persistence & schema.** Store slot metadata + payloads under versioned keys;
    **bump `SAVE_VERSION`** only if the per‑slot envelope changes the schema, and
    keep **older saves / single‑slot data migrating** in gracefully (don't strand
    an existing player's save). Everything **feature‑detected** and headless‑safe.
  - **i18n.** All new strings (slot labels, rename/delete prompts, empty states)
    through `t()` in **EN + RU**.
- **Acceptance criteria:**
  - Clicking **cloud saves on the start screen opens the cloud browser** (or a
    clear sign‑in/not‑configured state) — it is **no longer a dead click** — and
    Restore loads the run.
  - The player can keep **multiple named local save slots**, and **load / rename /
    delete** any of them; a confirm guards delete/overwrite. Cloud slots are
    listed and manageable in the same screen to the extent the Drive API allows.
  - All slots **round‑trip through save/load**; existing single‑slot/file saves
    **migrate** without loss; older `SAVE_VERSION`s still load.
  - Reachable from **start screen + pause**; works on desktop + mobile; headless‑
    safe; full pipeline green.
- **Tests to add:** the **slot store** (create/list/rename/delete/overwrite, next‑
  free‑slot selection, metadata) as a pure, tested module; a **migration** test
  from the prior single‑slot/file format; a **round‑trip** per slot; an injected‑
  client test that the **cloud browser opens + Restore** path runs; an E2E that
  opens the Saves screen from the start menu, saves, renames, reloads and loads the
  slot.
- **Files:** `src/game.js` (a `SaveSlots`/`SavesUI` module over `serializeGame`/
  `applySave`, repair the start‑screen cloud handler + `CloudUI` wiring,
  `SAVE_VERSION`/migration), `index.html`/`css` (the Saves overlay; rename/delete
  controls), `src/core/i18n.js` (EN+RU), `test/*` (slots/migration/round‑trip + E2E),
  `README.md`.
- **Out of scope:** a server‑side save backend; auto‑screenshots/thumbnails per
  slot (note as a follow‑up); unlimited cloud slots beyond Task 15's rolling
  policy.
- **Hints:** keep slot logic **pure** (the UI just renders it); reuse
  `Pause.askConfirm` for destructive actions and the Task 15 reconcile so a cloud
  restore never clobbers newer local work.

