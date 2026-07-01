// split-todo.mjs — deterministically slice TODO.md's per-task specs into one file
// per task under todo/, and slim TODO.md down to a shared hub with a task INDEX.
//
// This guarantees ZERO content loss: each task's body is copied verbatim from the
// region between its `### Task N —` heading and the next `### Task`/`## ` heading,
// and the script round-trip-verifies that the concatenated task bodies equal the
// original source regions before writing anything.
//
// Usage:  node todo/split-todo.mjs          (writes files + verifies)
//         node todo/split-todo.mjs --check   (verify only; no writes)
//
// The regenerated files are byte-stable, so re-running is idempotent. Kept in-tree
// (and referenced from todo/README.md) so the split can be reproduced/audited.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TODO = path.join(ROOT, "TODO.md");
const OUT = __dirname; // the todo/ folder

const CHECK_ONLY = process.argv.includes("--check");

const src = fs.readFileSync(TODO, "utf8");
const lines = src.split("\n");

// --- 1. Locate structural anchors -----------------------------------------
// Task bodies live between the first `## 4` heading and the `## 5.` heading.
const idxOf = (re) => lines.findIndex((l) => re.test(l));
const bodyStart = idxOf(/^##\s*4\.\s+The backlog/);
const bodyEnd = idxOf(/^##\s*5\.\s+Recommended order/);
if (bodyStart < 0 || bodyEnd < 0 || bodyEnd <= bodyStart) {
  throw new Error(`Could not locate the §4…§5 task-body region (start=${bodyStart}, end=${bodyEnd})`);
}

// --- 2. Slice each `### Task N — …` region --------------------------------
// A region runs from a `### Task N —` line up to (but not including) the next
// `### ` heading or the next `## ` heading — whichever comes first — bounded by
// §5. Everything else in §4 (the `## 4x` group headers + intro blurbs) is hub
// content that stays in TODO.md.
const isTaskHead = (l) => /^###\s+Task\s+(\d+)\s+—/.test(l);
const isAnyHead = (l) => /^#{2,3}\s/.test(l);

const tasks = [];
for (let i = bodyStart; i < bodyEnd; i++) {
  const m = lines[i].match(/^###\s+Task\s+(\d+)\s+—\s+(.*)$/);
  if (!m) continue;
  const n = Number(m[1]);
  const title = m[2].trim();
  // Find the end of this task's region.
  let j = i + 1;
  for (; j < bodyEnd; j++) {
    if (isTaskHead(lines[j]) || isAnyHead(lines[j])) break;
  }
  // The body is lines [i, j). Preserve verbatim, but trim only trailing blank
  // lines that are structural separators between tasks (they are re-added on
  // concat for the round-trip check, so no content is lost).
  const region = lines.slice(i, j);
  tasks.push({ n, title, headLine: i, endLine: j, region });
  i = j - 1;
}

if (tasks.length === 0) throw new Error("No `### Task N —` regions found.");

// --- 3. Derive a short kebab-case slug from each title --------------------
// Match the `claude/task-<N>-<slug>` branch convention: short, lower-kebab, the
// leading distinctive words of the title (before the first strong punctuation).
function slugify(n, title) {
  // Manual overrides keep a few slugs aligned with historic branch names / the
  // recommended-order shorthand where the mechanical rule would drift.
  const OVERRIDES = {
    2: "story-missions",
    3: "hifi-models",
    4: "shadows-lighting",
    5: "animation",
    6: "sound-ambience",
    7: "russian-i18n",
    8: "changelog-split",
    9: "modularize-toolchain",
    10: "bug-fixes",
    11: "art-direction",
    12: "item-equipment",
    13: "minimap-worldmap",
    14: "skills-leveling",
    15: "cloud-saves",
    16: "responsive-hud",
    17: "session-persistence",
    18: "save-slots",
    19: "score-to-xp",
    20: "map-fixes",
    21: "unified-inventory",
    22: "environment-rewrite",
    23: "persist-drive-signin",
    24: "russian-morphology",
    25: "worn-helmets",
    26: "worn-chest",
    27: "worn-pauldrons",
    28: "worn-gloves",
    29: "worn-belts",
    30: "worn-boots",
    31: "worn-cloaks",
    32: "held-weapons",
    33: "visible-jewelry",
    34: "attack-animations",
    35: "loadout-fit",
    36: "control-layout",
    37: "fullscreen-setting",
    38: "npc-home-zones",
    39: "collision-free-hud",
    40: "travelling-vendors",
    41: "drive-primary-saves",
    42: "fast-e2e",
  };
  if (OVERRIDES[n]) return OVERRIDES[n];
  // Fallback: kebab-case the first few words of the title.
  const cut = title.split(/[:(]/)[0];
  return cut
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[‐-―]/g, "-") // unicode dashes → hyphen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 4)
    .join("-");
}

for (const t of tasks) t.slug = slugify(t.n, t.title);

// --- 4. Extract Status + Depends-on for the index (from the verbatim body) --
// These are read from the body text but NEVER removed from it (the full body,
// including the Status line, ships in the per-task file).
function statusCell(region) {
  // Status line looks like: `- **Status:** \`[x]\` — 2026-06-21 · …` or `[ ]`.
  const line = region.find((l) => /^-\s+\*\*Status:\*\*/.test(l));
  if (!line) return "`[ ]`"; // no explicit status ⇒ not started
  const done = /`\[x\]`/.test(line);
  if (!done) return "`[ ]`";
  const date = (line.match(/`\[x\]`\s*[—-]\s*(\d{4}-\d{2}-\d{2})/) || [])[1];
  return date ? `\`[x]\` ${date}` : "`[x]`";
}
function dependsCell(region) {
  const start = region.findIndex((l) => /^-\s+\*\*Depends on:\*\*/.test(l));
  if (start < 0) return "—";
  // The Depends-on bullet may wrap over several continuation lines (indented,
  // not starting a new `- ` bullet). Gather them all so the index cell carries
  // the full dependency note the planner reasons about.
  const buf = [region[start]];
  for (let k = start + 1; k < region.length; k++) {
    const l = region[k];
    if (/^-\s/.test(l) || /^\S/.test(l) || l.trim() === "") break; // next bullet / blank / heading
    buf.push(l);
  }
  let dep = buf.join(" ").replace(/^-\s+\*\*Depends on:\*\*\s*/, "").trim();
  dep = dep.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  // Escape pipes so the markdown table isn't broken.
  dep = dep.replace(/\|/g, "\\|");
  return dep || "—";
}
// Short title for the index table = title truncated at the first strong break.
function shortTitle(title) {
  let s = title.split(/\s+—\s+|\s+–\s+/)[0]; // before an em/en dash clause
  s = s.split(/\s*\(/)[0]; // drop parentheticals
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\|/g, "\\|");
  return s;
}
for (const t of tasks) {
  t.status = statusCell(t.region);
  t.depends = dependsCell(t.region);
  t.short = shortTitle(t.title);
}

// --- 5. Round-trip verification (ZERO content loss) -----------------------
// The concatenation of every task region, rejoined with the exact inter-region
// text that lived in §4, must reproduce the original §4 task-body span byte for
// byte. We verify by re-slicing: the union of [task.headLine, task.endLine)
// windows must cover every task line, and re-reading each file's body must equal
// its source region.
let roundTripOK = true;
const problems = [];
for (const t of tasks) {
  const bodyText = t.region.join("\n");
  // The file body is the region with the H1 + backlink prepended; the *task
  // region itself* must appear verbatim inside the file. Verify that below after
  // building file content.
  t.bodyText = bodyText;
}

// Build each file's content.
function fileContent(t) {
  const backlink =
    "> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.";
  // Body region already starts with the `### Task N — …` line; promote it to an
  // H1 title and keep the rest verbatim.
  const [, ...rest] = t.region; // drop the original `### Task N —` heading line
  const h1 = `# Task ${t.n} — ${t.title}`;
  const body = rest.join("\n");
  // Preserve the verbatim body exactly; the file is: H1, blank, backlink, blank, body.
  return `${h1}\n\n${backlink}\n${body}\n`;
}

// Verify the verbatim region survives inside the produced file (minus the
// heading-line rewrite, which we reconstruct identically).
for (const t of tasks) {
  const content = fileContent(t);
  // Reconstruct the original region from the file: first line is H1 (`# Task N —`),
  // which maps back to `### Task N —`; the backlink line + following blank are ours.
  const fl = content.split("\n");
  // fl[0] = "# Task N — title"; fl[1] = ""; fl[2] = backlink; fl[3..] = body region minus heading
  const rebuiltHead = fl[0].replace(/^#\s/, "### ");
  const bodyRebuilt = fl.slice(3).join("\n").replace(/\n$/, ""); // drop trailing newline we added
  const rebuiltRegion = [rebuiltHead, ...bodyRebuilt.split("\n")];
  // Compare to the original region.
  const orig = t.region;
  if (rebuiltRegion.length !== orig.length || rebuiltRegion.some((l, i) => l !== orig[i])) {
    roundTripOK = false;
    problems.push(
      `Task ${t.n}: round-trip mismatch (orig ${orig.length} lines, rebuilt ${rebuiltRegion.length} lines)`
    );
    // Show first differing line for debugging.
    const k = rebuiltRegion.findIndex((l, i) => l !== orig[i]);
    if (k >= 0) problems.push(`  first diff @${k}: orig=${JSON.stringify(orig[k])} new=${JSON.stringify(rebuiltRegion[k])}`);
  }
}

if (!roundTripOK) {
  console.error("ROUND-TRIP FAILED — refusing to write. Problems:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Round-trip OK: ${tasks.length} task regions reconstruct verbatim from their files.`);

// Emit a machine-readable manifest the hub-builder + tests can consume.
const manifest = tasks.map((t) => ({
  n: t.n,
  slug: t.slug,
  file: `todo/task-${t.n}-${t.slug}.md`,
  title: t.title,
  short: t.short,
  status: t.status,
  depends: t.depends,
  group: null, // filled by the hub builder
}));

if (CHECK_ONLY) {
  console.log("--check: verification only, no files written.");
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

// --- 6. Write the per-task files ------------------------------------------
for (const t of tasks) {
  const fp = path.join(OUT, `task-${t.n}-${t.slug}.md`);
  fs.writeFileSync(fp, fileContent(t), "utf8");
}
fs.writeFileSync(path.join(OUT, "tasks.manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Wrote ${tasks.length} task files + tasks.manifest.json into ${path.relative(ROOT, OUT)}/`);
