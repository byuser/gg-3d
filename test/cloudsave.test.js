// Task 15 — cloud saves to Google Drive (appDataFolder). Locks in the pure,
// browser-free policy (autosave cadence + pause-when-hidden + debounce, the
// rolling 1-hour retention/pruning, and the newer-of reconcile), proves the
// Drive client is injectable so the whole flow runs against an in-memory stub
// with no network, that local↔cloud payloads are byte-identical (so save
// versioning/migration just works), and that with nothing configured the
// feature is cleanly disabled — nothing throws, the headless harness still runs.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const CS = T.CloudSave;
const scene = scenes[0];
const step = (n = 1) => {
  for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire();
};
const flush = () => new Promise((r) => setTimeout(r, 0));

// An in-memory Drive stub mirroring the real client's contract (the injectable
// seam `CloudSave._setClient`). No network, fully deterministic, counts calls.
function makeFakeDrive() {
  const files = new Map(); // id -> { id, name, content, modifiedTime }
  let nextId = 1;
  let signedIn = false;
  const c = {
    calls: { signIn: 0, signOut: 0, list: 0, upload: 0, download: 0, remove: 0 },
    failNext: null, // assign an Error to make the next op throw once
    _files: files,
    seed(name, content) {
      const id = "f" + nextId++;
      files.set(id, { id, name, content: content || "{}", modifiedTime: new Date().toISOString() });
      return id;
    },
    signIn() { c.calls.signIn++; if (c.failNext) { const e = c.failNext; c.failNext = null; return Promise.reject(e); } signedIn = true; return Promise.resolve(true); },
    signOut() { c.calls.signOut++; signedIn = false; return Promise.resolve(); },
    hasToken() { return signedIn; },
    async list() { c.calls.list++; if (c.failNext) { const e = c.failNext; c.failNext = null; throw e; } return [...files.values()].map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime })); },
    async upload(name, content, existingId) {
      c.calls.upload++;
      if (c.failNext) { const e = c.failNext; c.failNext = null; throw e; }
      if (existingId && files.has(existingId)) { const f = files.get(existingId); f.content = content; f.modifiedTime = new Date().toISOString(); return { id: f.id, name: f.name }; }
      const id = c.seed(name, content);
      return { id, name };
    },
    async download(id) { c.calls.download++; if (c.failNext) { const e = c.failNext; c.failNext = null; throw e; } if (!files.has(id)) throw new Error("404"); return files.get(id).content; },
    async remove(id) { c.calls.remove++; files.delete(id); return true; },
  };
  return c;
}

// Reset the singleton to a known signed-in-with-client state for I/O tests.
function arm(client) {
  CS.clientId = "test-client.apps.googleusercontent.com";
  CS._setClient(client);
  CS.signedIn = true;
  CS.busy = false;
  CS.hidden = false;
  CS.enabled = false;
  CS.sched = { lastAt: 0, inFlight: false };
}

beforeAll(() => {
  T.startGame();
  step(3);
});

describe("Task 15 — autosave file naming (sortable, prunable)", () => {
  it("round-trips an epoch-ms timestamp through the file name", () => {
    const ts = 1_700_000_000_000;
    const name = T.cloudAutoName(ts);
    expect(name).toBe(T.CLOUD_AUTO_PREFIX + ts + ".json");
    expect(T.cloudParseAuto(name)).toBe(ts);
  });
  it("rejects non-autosave names (manual slot / foreign files)", () => {
    expect(T.cloudParseAuto(T.CLOUD_MANUAL_NAME)).toBeNull();
    expect(T.cloudParseAuto("random.json")).toBeNull();
    expect(T.cloudParseAuto(null)).toBeNull();
    expect(T.cloudParseAuto(T.CLOUD_AUTO_PREFIX + "abc.json")).toBeNull();
  });
});

describe("Task 15 — autosave scheduler (pure: cadence, hidden, debounce)", () => {
  const base = { enabled: true, signedIn: true, hidden: false, inFlight: false, lastAt: 0, intervalMs: 1000 };
  it("is due only once the interval has elapsed", () => {
    expect(T.cloudAutosaveDue({ ...base, lastAt: 500 }, 1400)).toBe(false); // 900ms < 1000
    expect(T.cloudAutosaveDue({ ...base, lastAt: 500 }, 1500)).toBe(true); // exactly 1000ms
    expect(T.cloudAutosaveDue({ ...base, lastAt: 500 }, 5000)).toBe(true);
  });
  it("never fires when signed out, autosave off, hidden, or a write is in flight", () => {
    const now = 100000;
    expect(T.cloudAutosaveDue({ ...base, signedIn: false }, now)).toBe(false);
    expect(T.cloudAutosaveDue({ ...base, enabled: false }, now)).toBe(false);
    expect(T.cloudAutosaveDue({ ...base, hidden: true }, now)).toBe(false);
    expect(T.cloudAutosaveDue({ ...base, inFlight: true }, now)).toBe(false);
    expect(T.cloudAutosaveDue(null, now)).toBe(false);
  });
});

describe("Task 15 — rolling 1-hour retention (pure pruning policy)", () => {
  it("keeps the last hour and drops older autosaves", () => {
    const now = 10_000_000;
    const hour = 60 * 60 * 1000;
    const files = [
      { id: "a", ts: now - 5 * 60 * 1000 }, // 5 min — keep
      { id: "b", ts: now - 30 * 60 * 1000 }, // 30 min — keep
      { id: "c", ts: now - 90 * 60 * 1000 }, // 90 min — prune (too old)
      { id: "d", ts: now - 2 * hour }, // prune (too old)
    ];
    const del = T.cloudPrune(files, now, { maxAgeMs: hour, maxCount: 12, keepNewest: true });
    expect(del.sort()).toEqual(["c", "d"]);
  });
  it("caps the number of slots even within the window", () => {
    const now = 10_000_000;
    const files = [];
    for (let i = 0; i < 20; i++) files.push({ id: "s" + i, ts: now - i * 1000 }); // all recent
    const del = T.cloudPrune(files, now, { maxAgeMs: 60 * 60 * 1000, maxCount: 12, keepNewest: true });
    expect(del.length).toBe(8); // 20 - 12 kept
  });
  it("always keeps the single newest even if it's older than the window", () => {
    const now = 10_000_000;
    const files = [
      { id: "old1", ts: now - 3 * 60 * 60 * 1000 },
      { id: "old2", ts: now - 4 * 60 * 60 * 1000 },
    ];
    const del = T.cloudPrune(files, now, { maxAgeMs: 60 * 60 * 1000, maxCount: 12, keepNewest: true });
    expect(del).toEqual(["old2"]); // newest kept, the rest pruned
  });
});

describe("Task 15 — reconcile (newer-of by savedAt)", () => {
  it("compares two saves and reports the newer", () => {
    const a = { savedAt: "2026-06-23T10:00:00.000Z" };
    const b = { savedAt: "2026-06-23T09:00:00.000Z" };
    expect(T.cloudNewer(a, b)).toBe("a");
    expect(T.cloudNewer(b, a)).toBe("b");
    expect(T.cloudNewer(a, a)).toBe("equal");
    expect(T.cloudNewer({}, {})).toBe("equal"); // missing stamps → equal, never throws
  });
});

describe("Task 15 — unconfigured / headless: cleanly disabled, never throws", () => {
  beforeEach(() => {
    CS._setClient(null);
    CS.clientId = "";
    CS.signedIn = false;
    CS.enabled = false;
    CS.sched = { lastAt: 0, inFlight: false };
  });
  it("reports not-configured and not-available", () => {
    expect(CS.configured()).toBe(false);
    expect(CS.available()).toBe(false);
  });
  it("a render-loop tick is a no-op (no client, signed out)", () => {
    expect(() => CS.tick(Date.now())).not.toThrow();
  });
  it("sign-in is refused (and reported) without a client id", async () => {
    const ok = await CS.signIn();
    expect(ok).toBe(false);
    expect(CS.signedIn).toBe(false);
  });
  it("listSaves returns empty and restore is a no-op when signed out", async () => {
    expect(await CS.listSaves()).toEqual([]);
    expect(await CS.restore("whatever")).toBe(false);
  });
  it("booting + driving the render loop with cloud disabled stays green", () => {
    expect(() => step(2)).not.toThrow();
  });
});

describe("Task 15 — OAuth client id from build-time env (deploy injection)", () => {
  it("readClientId() picks up VITE_GOOGLE_CLIENT_ID baked in by Vite/the deploy", () => {
    const prev = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    try {
      import.meta.env.VITE_GOOGLE_CLIENT_ID = "  deploy-injected.apps.googleusercontent.com  ";
      // No window override + the headless doc has no <meta>, so the env wins.
      expect(CS.readClientId()).toBe("deploy-injected.apps.googleusercontent.com");
    } finally {
      if (prev === undefined) delete import.meta.env.VITE_GOOGLE_CLIENT_ID;
      else import.meta.env.VITE_GOOGLE_CLIENT_ID = prev;
    }
    // Unset again ⇒ unconfigured (cloud saves cleanly disabled).
    expect(CS.readClientId()).toBe("");
  });
});

describe("Task 15 — Drive client is injectable (auth + manual save/load)", () => {
  let drive;
  beforeEach(() => { drive = makeFakeDrive(); arm(drive); });

  it("signs in / signs out through the injected client", async () => {
    CS.signedIn = false;
    expect(await CS.signIn()).toBe(true);
    expect(CS.signedIn).toBe(true);
    expect(drive.calls.signIn).toBe(1);
    await CS.signOut();
    expect(CS.signedIn).toBe(false);
    expect(drive.calls.signOut).toBe(1);
  });

  it("a failed sign-in is reported and leaves the feature off", async () => {
    CS.signedIn = false;
    drive.failNext = new Error("popup_closed");
    expect(await CS.signIn()).toBe(false);
    expect(CS.signedIn).toBe(false);
  });

  it("manual save writes a valid save to the single manual slot", async () => {
    expect(await CS.saveManual()).toBe(true);
    const manual = [...drive._files.values()].find((f) => f.name === T.CLOUD_MANUAL_NAME);
    expect(manual).toBeTruthy();
    const data = JSON.parse(manual.content);
    expect(T.validateSave(data)).toBe(true);
    // Saving again overwrites the same slot (no duplicate manual files).
    await CS.saveManual();
    const manuals = [...drive._files.values()].filter((f) => f.name === T.CLOUD_MANUAL_NAME);
    expect(manuals.length).toBe(1);
  });

  it("a manual-save network failure keeps the run intact (returns false, no throw)", async () => {
    drive.failNext = new Error("offline");
    let ok;
    await expect((async () => { ok = await CS.saveManual(); })()).resolves.not.toThrow?.();
    expect(ok).toBe(false);
    expect(CS.busy).toBe(false); // the in-flight flag always clears
  });
});

describe("Task 15 — local↔cloud payload parity (save versioning just works)", () => {
  it("a serialized run uploaded to Drive round-trips back through applySave", async () => {
    const drive = makeFakeDrive();
    arm(drive);
    // Mutate some state so the round-trip is observable.
    T.state.score = 4242;
    await CS.saveManual();
    const manual = [...drive._files.values()].find((f) => f.name === T.CLOUD_MANUAL_NAME);
    const cloudJson = manual.content;
    // The cloud payload matches a fresh local serialize field-for-field (only the
    // volatile `savedAt` wall-clock stamp differs between two serialize calls).
    const norm = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.savedAt; return c; };
    expect(norm(JSON.parse(cloudJson))).toEqual(norm(T.serializeGame()));
    expect(JSON.parse(cloudJson).savedAt).toEqual(expect.any(String));
    // And it restores cleanly through the same applySave path the local file uses.
    T.state.score = 0;
    expect(() => T.applySave(JSON.parse(cloudJson))).not.toThrow();
    expect(T.state.score).toBe(4242);
  });
});

describe("Task 15 — autosave + rolling history (end-to-end against the stub)", () => {
  let drive;
  beforeEach(() => { drive = makeFakeDrive(); arm(drive); CS.enabled = true; });

  it("a due tick fires one autosave that lands as a timestamped file", async () => {
    CS.sched.lastAt = 0; // long ago → due
    const before = drive.calls.upload;
    CS.tick(Date.now());
    await flush();
    expect(drive.calls.upload).toBe(before + 1);
    const autos = [...drive._files.values()].filter((f) => T.cloudParseAuto(f.name) != null);
    expect(autos.length).toBe(1);
  });

  it("a not-due tick does nothing (cadence respected)", async () => {
    CS.sched.lastAt = Date.now(); // just saved → not due
    const before = drive.calls.upload;
    CS.tick(Date.now());
    await flush();
    expect(drive.calls.upload).toBe(before);
  });

  it("does not autosave while the tab is hidden, resumes when visible", async () => {
    CS.sched.lastAt = 0;
    CS.hidden = true;
    CS.tick(Date.now());
    await flush();
    expect([...drive._files.values()].filter((f) => T.cloudParseAuto(f.name) != null).length).toBe(0);
    CS.hidden = false;
    CS.sched.lastAt = 0;
    CS.tick(Date.now());
    await flush();
    expect([...drive._files.values()].filter((f) => T.cloudParseAuto(f.name) != null).length).toBe(1);
  });

  it("prunes the history down to the last hour after an autosave", async () => {
    const now = Date.now();
    // Seed 14 autosaves: 12 recent + 2 older than an hour.
    for (let i = 0; i < 12; i++) drive.seed(T.cloudAutoName(now - i * 60 * 1000), "{}");
    drive.seed(T.cloudAutoName(now - 90 * 60 * 1000), "{}");
    drive.seed(T.cloudAutoName(now - 120 * 60 * 1000), "{}");
    const del = await CS.pruneAutosaves();
    expect(del.length).toBeGreaterThanOrEqual(2); // at least the two >1h-old
    const left = [...drive._files.values()].filter((f) => T.cloudParseAuto(f.name) != null);
    expect(left.length).toBeLessThanOrEqual(T.CLOUD_MAX_SLOTS);
  });

  it("autosave preference persists across reloads (localStorage)", () => {
    CS.setAutosave(true);
    expect(JSON.parse(globalThis.localStorage.getItem(T.CLOUD_KEY)).autosave).toBe(true);
    CS.setAutosave(false);
    expect(JSON.parse(globalThis.localStorage.getItem(T.CLOUD_KEY)).autosave).toBe(false);
  });
});

describe("Task 15 — browse + restore", () => {
  it("lists manual + autosave slots newest-first", async () => {
    const drive = makeFakeDrive();
    arm(drive);
    const now = Date.now();
    drive.seed(T.CLOUD_MANUAL_NAME, "{}");
    drive.seed(T.cloudAutoName(now - 10 * 60 * 1000), "{}");
    drive.seed(T.cloudAutoName(now - 1 * 60 * 1000), "{}");
    const saves = await CS.listSaves();
    expect(saves.length).toBe(3);
    expect(saves.some((s) => s.kind === "manual")).toBe(true);
    expect(saves.filter((s) => s.kind === "auto").length).toBe(2);
    // newest-first
    for (let i = 1; i < saves.length; i++) expect(saves[i - 1].ts >= saves[i].ts).toBe(true);
  });

  it("restoring an invalid cloud file is rejected without throwing", async () => {
    const drive = makeFakeDrive();
    arm(drive);
    const id = drive.seed(T.CLOUD_MANUAL_NAME, "{not json");
    expect(await CS.restore(id)).toBe(false);
  });
});
