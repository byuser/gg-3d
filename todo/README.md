# `todo/` — one file per backlog task

Each Good Game 3D backlog task has its **own spec file** here:
`todo/task-<N>-<slug>.md` (e.g. [`task-27-worn-pauldrons.md`](./task-27-worn-pauldrons.md)).
`<N>` is the unpadded task number and `<slug>` matches the
`claude/task-<N>-<slug>` branch convention. Each file holds that task's **entire
spec** — Status (including the shipped notes for done tasks), Depends on, Goal,
Scope, Acceptance criteria, Tests to add, Files, Out of scope and Hints.

## The split (why this exists)

The specs used to live inline in a single ~3200-line `TODO.md`, so every agentic
run ("read `CLAUDE.md` + `TODO.md` in full") burned a huge amount of context.
They now live one-per-file here, and [`../TODO.md`](../TODO.md) is a slim **hub**:
the shared **Golden rules** (§ 1), the **Definition of Done** (§ 2), the
**standard workflow** (§ 3), a compact **task index** (§ 4), the **recommended
order** (§ 5), the **run prompts** (§ 6) and the **changelog pointer** (§ 7).

- **The `TODO.md` § 4 index is the source of truth** for each task's **status**
  (`[ ]` not started / `[x] <date>` shipped) and **dependencies**. Shorthand like
  *"do the next 3 `[ ]` tasks"* is resolved by scanning that index + § 5.
- **Shared rules, the Definition of Done, the recommended order and the run
  prompts stay in `../TODO.md`** — not here.

## Adding a task

1. Create `todo/task-<N>-<slug>.md`. Start it with an H1 `# Task <N> — <title>`,
   then the backlink line
   `> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.`,
   then the task body (Status / Depends on / Goal / Scope / Acceptance criteria /
   Tests to add / Files / Out of scope / Hints).
2. Add a matching row to the correct group table in [`../TODO.md`](../TODO.md)
   § 4 (`| # | Task | Status | Depends on | Spec |`), linking the `Spec` cell to
   your new file, and (if it belongs in the sequence) a line in § 5.
3. The doc-lint test in `test/harness.test.js` (suite `[34] docs`) checks that
   **every** § 4 index row has a `todo/` file and **every** `todo/task-*.md` is
   linked from the index — keep them in sync.

## Regenerating from a legacy inline `TODO.md`

The split is reproducible. [`split-todo.mjs`](./split-todo.mjs) slices each
`### Task N —` region out of an inline `TODO.md` into these per-task files and
**round-trip-verifies zero content loss**; [`build-hub.mjs`](./build-hub.mjs)
rebuilds the slim hub `TODO.md` (preserving §§ 1–3 and 5–7 verbatim, injecting
the § 4 index from [`tasks.manifest.json`](./tasks.manifest.json)). They are
one-shot migration/audit helpers — day-to-day, just edit the files + the index
by hand as above.
