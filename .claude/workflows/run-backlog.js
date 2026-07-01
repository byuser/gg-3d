// run-backlog.js — deterministic, sequential "one subagent per task" batch runner
// for the Good Game 3D backlog (TODO.md). The LOOP lives here in code (not model
// judgement), so tasks run STRICTLY one at a time: each task is implemented and
// MERGED TO master by its own isolated `task-runner` subagent before the next
// task starts. Dependent tasks therefore build on each other's merged work.
//
// Run it with the Workflow tool, passing your shorthand as `args`:
//   Workflow({ scriptPath: ".claude/workflows/run-backlog.js", args: "next 3 tasks" })
//   Workflow({ scriptPath: ".claude/workflows/run-backlog.js", args: "tasks 16, 18 and 20" })
//   Workflow({ scriptPath: ".claude/workflows/run-backlog.js", args: [16, 18, 20] })
//
// See TODO.md § 6 (Run prompts) and CLAUDE.md → Multi-agent orchestration.

export const meta = {
  name: 'run-backlog',
  description:
    'Sequential one-subagent-per-task batch over TODO.md: each task is implemented and merged to master before the next starts.',
  whenToUse:
    'Running several backlog tasks deterministically (the loop is in code). Pass shorthand like "next 3 tasks" or "tasks 16, 18 and 20" as args.',
  phases: [
    { title: 'Plan', detail: 'resolve the ordered task list from the shorthand' },
    { title: 'Run', detail: 'one task-runner subagent per task, strictly sequential' },
  ],
}

// The planner turns my shorthand into a concrete, dependency-ordered task list.
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks'],
  properties: {
    tasks: {
      type: 'array',
      description: 'Tasks to run, in the order they must be executed.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'slug'],
        properties: {
          n: { type: 'integer', description: 'TODO.md task number' },
          slug: {
            type: 'string',
            description:
              "the task's kebab-case slug (from its Spec filename todo/task-<N>-<slug>.md in the §4 index), used for the branch name + spec-file path",
          },
          title: { type: 'string' },
        },
      },
    },
    skipped: {
      type: 'array',
      description: 'Task numbers skipped because they are already [x] done.',
      items: { type: 'string' },
    },
    blocked: {
      type: 'string',
      description: 'If non-empty, the batch cannot run; explains the unmet dependency. tasks must then be empty.',
    },
    note: { type: 'string' },
  },
}

// Each task-runner reports a machine-checkable verdict so the loop can stop on a
// failure instead of barrelling into a dependent task.
const TASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'merged', 'summary'],
  properties: {
    status: { type: 'string', enum: ['done', 'blocked', 'failed'] },
    merged: { type: 'boolean', description: 'true only if the task landed on master (fast-forward + pushed)' },
    summary: { type: 'string', description: 'what shipped + test/build/deploy status' },
    reason: { type: 'string', description: 'why it stopped, if status is not "done"' },
  },
}

const request =
  args == null
    ? 'next task'
    : typeof args === 'string'
      ? args
      : Array.isArray(args)
        ? `tasks ${args.join(', ')}`
        : JSON.stringify(args)

phase('Plan')
log(`Resolving backlog request: "${request}"`)

const plan = await agent(
  `Read CLAUDE.md and the TODO.md hub — specifically the § 4 "task index" tables
(each row carries a task's #, short title, Status and Depends on) and § 5
"Recommended order". Each task's full spec lives in its own file under
todo/task-<N>-<slug>.md, but you do NOT need to open them to plan — the § 4 index
gives you status + dependencies and § 5 gives the order. Resolve this batch request
into a concrete, ordered task list: "${request}".

Rules (from TODO.md § 6.1):
- "next N tasks" / "do next N" → the next N tasks whose Status is [ ] (not started)
  in the § 4 index, taken top-to-bottom from TODO.md § 5 "Recommended order".
- explicit numbers ("tasks 2, 3 and 5") → exactly those, ordered to respect § 5 and
  each task's "Depends on"; drop any already [x] done into "skipped".
- "next" / no number → just the first [ ] task.
For every task you DO include, give its number, its kebab-case "slug" (from its
Spec filename todo/task-<N>-<slug>.md in the § 4 index), and its title. If any
included task has an unmet "Depends on" that cannot be satisfied by reordering
within this batch or by already-shipped work, set "blocked" with the explanation
and return an EMPTY tasks array. Do not start any work — only plan.`,
  { phase: 'Plan', schema: PLAN_SCHEMA, label: 'plan' },
)

if (!plan || plan.blocked || !plan.tasks || plan.tasks.length === 0) {
  const why = plan?.blocked || 'no [ ] tasks matched the request'
  log(`Nothing to run — ${why}`)
  return { ran: [], skipped: plan?.skipped || [], blocked: plan?.blocked || null, note: plan?.note || why }
}

if (plan.skipped && plan.skipped.length) log(`Skipping already-done: ${plan.skipped.join(', ')}`)
log(`Batch (${plan.tasks.length}): ${plan.tasks.map((t) => `Task ${t.n}`).join(' → ')}`)

phase('Run')
const ran = []
for (let i = 0; i < plan.tasks.length; i++) {
  const t = plan.tasks[i]
  const branch = `claude/task-${t.n}-${t.slug}`
  log(`(${i + 1}/${plan.tasks.length}) Task ${t.n} — ${t.title || t.slug} → ${branch}`)

  // One isolated subagent per task. The for-loop + await keeps it STRICTLY
  // sequential, so each task's merge to master lands before the next begins.
  const res = await agent(
    `Read CLAUDE.md, the TODO.md hub, and this task's spec file
"todo/task-${t.n}-${t.slug}.md", then do EXACTLY Task ${t.n} end-to-end to the
§ 2 Definition of Done — no other task, no scope-creep. Work on branch "${branch}"
cut from the latest master. Add tests; keep the WHOLE pipeline green (lint +
typecheck + test + build + e2e). Flip Task ${t.n}'s Status to [x] in the TODO.md § 4
index (and its Status line in todo/task-${t.n}-${t.slug}.md) and add a CHANGELOG.md
entry. Then MERGE to master: rebase onto the latest master if it moved, fast-forward
master, and push (this is mandatory — the task must land on master). Confirm CI +
Pages deploy are green. Report your verdict.`,
    { agentType: 'task-runner', phase: 'Run', schema: TASK_SCHEMA, label: `task-${t.n}` },
  )

  ran.push({ n: t.n, branch, ...(res || { status: 'failed', merged: false, summary: 'subagent returned no result' }) })

  if (!res || res.status !== 'done' || !res.merged) {
    log(`STOP — Task ${t.n} did not complete & merge (${res?.status || 'no-result'}). Halting the batch.`)
    return {
      ran,
      stoppedAt: t.n,
      reason: res?.reason || res?.summary || 'task did not finish or merge to master',
      skipped: plan.skipped || [],
      remaining: plan.tasks.slice(i + 1).map((x) => x.n),
    }
  }
  log(`✓ Task ${t.n} merged to master.`)
}

log(`Done — ${ran.length} task(s) merged to master: ${ran.map((r) => `Task ${r.n}`).join(', ')}`)
return { ran, skipped: plan.skipped || [], blocked: null }
