// build-hub.mjs — regenerate TODO.md as the slim shared "hub": rules + Definition
// of Done + workflow + a compact task INDEX (linking each per-task file under
// todo/) + recommended order + run prompts + changelog pointer.
//
// It preserves the existing hub sections VERBATIM (header/§0/§1/§2/§3 and
// §5/§6/§7 are copied byte-for-byte by line range) and only replaces the giant
// §4 + §4b…§4e task-body region with a `## 4. The backlog — task index` built
// from todo/tasks.manifest.json (written by split-todo.mjs). Group intro
// blockquotes are copied verbatim from the source.
//
// Usage:  node todo/build-hub.mjs        (rewrites ../TODO.md)
//         node todo/build-hub.mjs --dry   (print to stdout, don't write)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TODO = path.join(ROOT, "TODO.md");
const DRY = process.argv.includes("--dry");

const src = fs.readFileSync(TODO, "utf8");
const lines = src.split("\n");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "tasks.manifest.json"), "utf8"));
const byN = new Map(manifest.map((t) => [t.n, t]));

// Locate structural anchors (1-based headings, 0-based array indices).
const lineIdx = (re) => lines.findIndex((l) => re.test(l));
const g4 = lineIdx(/^##\s*4\.\s+The backlog/);
const g5 = lineIdx(/^##\s*5\.\s+Recommended order/);

// Extract a verbatim block of lines [from, to) as a string.
const block = (from, to) => lines.slice(from, to).join("\n");

// Pull each group's intro blockquote verbatim: from the line after the `## 4x`
// header up to the first `### Task` line.
function intro(headRe) {
  const h = lineIdx(headRe);
  if (h < 0) return "";
  let e = h + 1;
  while (e < lines.length && !/^###\s+Task\s/.test(lines[e]) && !/^##\s/.test(lines[e + 0] === lines[h] ? "" : lines[e])) {
    if (/^###\s+Task\s/.test(lines[e]) || /^##\s/.test(lines[e])) break;
    e++;
  }
  // Trim trailing blank lines of the intro region.
  while (e > h + 1 && lines[e - 1].trim() === "") e--;
  // Skip the header line itself; keep the blockquote body (lines h+1 .. e).
  let s = h + 1;
  while (s < e && lines[s].trim() === "") s++;
  return block(s, e);
}

const intro27 = intro(/^##\s*4\.\s+The backlog \(Tasks 2/);
const intro815 = intro(/^##\s*4b\./);
const intro1622 = intro(/^##\s*4c\./);
const intro2339 = intro(/^##\s*4d\./);
const intro4042 = intro(/^##\s*4e\./);

// Build one markdown table for a contiguous task-number range.
function tableFor(nums) {
  const head =
    "| # | Task | Status | Depends on | Spec |\n" +
    "| --- | --- | --- | --- | --- |";
  const rows = nums.map((n) => {
    const t = byN.get(n);
    if (!t) throw new Error(`Task ${n} missing from manifest`);
    const spec = `[\`todo/task-${t.n}-${t.slug}.md\`](./todo/task-${t.n}-${t.slug}.md)`;
    return `| ${t.n} | ${t.short} | ${t.status} | ${t.depends} | ${spec} |`;
  });
  return [head, ...rows].join("\n");
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Assemble the new §4 hub section.
const section4 = [
  "## 4. The backlog — task index",
  "",
  "> **Where the specs live.** Each task's full spec — Status (incl. shipped",
  "> notes), Depends on, Goal, Scope, Acceptance criteria, Tests to add, Files,",
  "> Out of scope and Hints — now lives in its **own file** under [`todo/`](./todo/),",
  "> one per task (`todo/task-<N>-<slug>.md`). This section is the compact **index**:",
  "> it is the source of truth for each task's **status** and **dependencies**, so",
  '> shorthand like *"the next 3 `[ ]` tasks"* stays resolvable by scanning the',
  "> tables below. `Status` is `[ ]` (not started) or `[x] <date>` (shipped). Open a",
  "> task's **Spec** link for the details; the shared rules + Definition of Done +",
  "> workflow are §§ 1–3 above.",
  "",
  intro27,
  "",
  tableFor(range(2, 7)),
  "",
  intro815,
  "",
  tableFor(range(8, 15)),
  "",
  intro1622,
  "",
  tableFor(range(16, 22)),
  "",
  intro2339,
  "",
  tableFor(range(23, 39)),
  "",
  intro4042,
  "",
  tableFor(range(40, 42)),
  "",
].join("\n");

// The hub = [header … just before §4]  +  section4  +  "---" separator  +  [§5 … EOF].
// Preserve the `---` rule that separated §4b…§4e blocks from §5. The line right
// before §5 is a `---`; keep the §5..EOF block verbatim (it already starts after
// that rule). We insert our own `---` before §5.
// headPart = everything up to and including the `---` + blank line that precede
// `## 4.`. block(0, g4) joins indices 0..g4-1; index g4-1 is the blank line, so
// the string ends at that blank line but without a trailing newline — add one so
// the `## 4.` heading starts on its own line with a blank separator above it.
const headPart = block(0, g4) + "\n"; // through the blank line before `## 4.`
const tailPart = block(g5, lines.length); // `## 5.` … EOF (verbatim)

// headPart already ends with a trailing blank line + `---`? The region before
// `## 4.` ends with the `---` separator and a blank line (lines g4-2, g4-1).
// section4 should sit between that and a fresh `---` before §5.
const out = `${headPart}${section4}\n---\n\n${tailPart}`;

if (DRY) {
  process.stdout.write(out);
} else {
  fs.writeFileSync(TODO, out, "utf8");
  const n = out.split("\n").length;
  console.log(`Wrote hub TODO.md (${n} lines; was ${lines.length}).`);
}
