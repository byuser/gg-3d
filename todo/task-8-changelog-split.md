# Task 8 — Extract the changelog into its own `CHANGELOG.md`

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-06-22 · Migrated the full § 7 log verbatim into a dedicated
  `CHANGELOG.md` (Keep a Changelog: `[Unreleased]` atop a reverse‑chronological dated list,
  versioned by the monotonic `?v=` build), turned § 7 into a one‑line pointer, rewired § 2/§ 3/§ 6 +
  `CLAUDE.md` + `README.md` to append there, and added a doc‑lint harness suite [34] (10 checks;
  354 → 364) so the split can't silently regress. Docs/process only — no bundle change (`?v=` 19).
- **Depends on:** none. **Do this first** — it is cheap, unblocks every later
  run (no more 100‑line diffs to `TODO.md` just to log a release), and large
  projects with good reviews universally keep history out of the planning doc.
- **Goal.** Move the release history out of `TODO.md` § 7 into a dedicated,
  conventional **`CHANGELOG.md`** at the repo root, and rewire the run workflow so
  future runs append there instead of growing the backlog file.
- **Scope (build this):**
  - Create **`CHANGELOG.md`** following the *Keep a Changelog* convention
    (reverse‑chronological, an `## [Unreleased]` section at the top, dated
    `## [x] — YYYY‑MM‑DD` entries below). Migrate **every** existing entry from
    `TODO.md` § 7 verbatim (preserve dates, task names, the `?v=` notes and the
    harness‑count deltas — they are referenced by later tasks).
  - Adopt a lightweight, human‑ + agent‑readable **versioning scheme**. Since the
    site is a single static bundle, key entries to the `index.html` `?v=`
    cache‑buster (already monotonic) and/or a semver line — pick one, document it
    at the top of `CHANGELOG.md`, and apply it consistently.
  - In `TODO.md`: replace § 7's body with a one‑line pointer to `CHANGELOG.md`
    (keep the heading so existing links don't 404). Update the **Run prompt**
    (§ 6 step 5) and **Standard workflow** (§ 3) so "add a Changelog entry" now
    means *append to `CHANGELOG.md`*, not edit `TODO.md`.
  - Update `CLAUDE.md` and `README.md` to reference `CHANGELOG.md` as the source
    of release history; add it to the *Project layout* list.
- **Acceptance criteria:**
  - `CHANGELOG.md` exists, contains **all** prior entries with no content loss,
    and renders correctly on GitHub.
  - `TODO.md` no longer carries the full log; § 6's run prompt directs future runs
    to `CHANGELOG.md`. No dangling internal links anywhere (`grep` for `#7`,
    `Changelog`).
  - This task's own entry is recorded **in `CHANGELOG.md`** (dog‑foods the new
    flow), proving the loop works.
- **Tests to add:** a tiny doc‑lint check in the harness (or a standalone Node
  script wired into CI) that asserts `CHANGELOG.md` exists, parses as the expected
  heading structure, and that `TODO.md` no longer contains dated changelog
  entries — so the split can't silently regress.
- **Files:** new `CHANGELOG.md`, `TODO.md` (§ 3, § 6, § 7), `CLAUDE.md`,
  `README.md`, `test/harness.js` (or a new `test/docs.test.js`), CI workflow if a
  new script is added.
- **Out of scope:** rewriting git tags/releases; auto‑generating the log from
  commits (a future nicety — note it as a follow‑up).

