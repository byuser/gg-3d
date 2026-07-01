---
description: Orchestrate a sequential, one-subagent-per-task batch over the TODO.md backlog (each task merges to master before the next starts)
argument-hint: e.g. "next 3 tasks" | "tasks 16, 18 and 20" | "next"
---

<!-- Trigger phrasings (any verb): make / solve / do / run / complete / finish /
implement + "next N tasks" | "the next task" | "tasks A, B and C". The same
shorthand also works as a plain message thanks to CLAUDE.md → Multi-agent
orchestration; this command is the explicit wrapper. -->


Act as the **ORCHESTRATOR** (master agent) for **Good Game 3D** — a Babylon.js
browser action-RPG in this repo, shipped to GitHub Pages. You **coordinate**; you
do **not** write game code yourself. Turn the request below into a strictly
sequential, **one-task-per-subagent** run.

**My request:** $ARGUMENTS

Follow the orchestrator protocol in `CLAUDE.md` → *Multi-agent orchestration* and
`TODO.md` § 6.1:

1. **Read** `CLAUDE.md` and the `TODO.md` hub (§ 2 Definition of Done, the § 4
   **task index** — status + Depends on, § 5 Recommended order). Each task's full
   spec lives in its own file under `todo/task-<N>-<slug>.md`; you don't need to
   read them all to plan — the § 4 index + § 5 order carry status + dependencies.
   **Resolve** my shorthand into a concrete, ordered task list:
   - `"N next tasks"` → the next N tasks whose status is `[ ]`, top-to-bottom of
     § 5 Recommended order.
   - `"tasks A, B and C"` → exactly those task numbers, ordered to respect § 5 and
     each task's *Depends on*; skip any already `[x]` done and tell me which.
   - `"next"` → just the first `[ ]` task.
   **Print** the resolved list and flag any unmet *Depends on* before starting.
2. For each task **in order, one at a time**: spawn **one** subagent — the
   **`task-runner`** agent — to do **exactly** that task end-to-end on its own
   branch `claude/task-<N>-<slug>` cut from the latest `master`. Each subagent has
   a **fresh, isolated context** and cannot see this chat, so its prompt must tell
   it to read `CLAUDE.md` + the `TODO.md` hub **and its task's spec file
   `todo/task-<N>-<slug>.md`**, and do Task `<N>` only.
3. **Wait** for the subagent to fully finish — pipeline green, tests added,
   checkbox ticked, `CHANGELOG.md` updated, **branch merged to `master` and
   pushed**, CI + Pages deploy green. **Merging to `master` after every task is
   mandatory.** Only then sync to the merged `master` and start the next task.
4. **Stop on failure / blocking dependency**: halt the batch, report which task and
   why, and do not start later tasks. Never merge a red pipeline.

Run subagents **strictly sequentially** (never two at once). Keep your own context
lean — rely on each subagent's returned summary, not on reading large source files
yourself. End with a roll-up: each task's shipped status, its
test/build/deploy result, and anything skipped or blocked.
