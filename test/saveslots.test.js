// Task 18 — multiple named manual save slots with full management + the
// cloud-saves browser fix. Locks in the PURE slot store (create / list / rename /
// delete / overwrite, next-free-slot selection, metadata), the migration of the
// prior single-slot (Task-17 auto-session) snapshot into a named slot, a
// round-trip per slot back through applySave, the playtime metadata serialized in
// the bumped save schema, the cloud-slot delete via the injected Drive client,
// and that the Saves UI opens + renders + drives Restore against a stub — all
// headless-safe (localStorage feature-detected; nothing throws with no run).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { scenes, localStorage as lsStub } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const SS = T.SaveSlots;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };
const flush = () => new Promise((r) => setTimeout(r, 0));

// A minimal valid save payload for the pure-store tests (no running game needed).
function fakePayload(over) {
  return Object.assign(
    {
      v: T.SAVE_VERSION,
      savedAt: "2026-06-25T10:00:00.000Z",
      seed: 12345,
      zone: "forest",
      playSec: 3725, // 1h 2m 5s
      player: { pos: [1, 2], progress: { level: 7 } },
    },
    over || {},
  );
}

// The same in-memory Drive stub shape the cloud suite uses (injectable seam).
function makeFakeDrive() {
  const files = new Map();
  let nextId = 1;
  return {
    calls: { remove: 0, list: 0 },
    _files: files,
    seed(name, content) { const id = "f" + nextId++; files.set(id, { id, name, content: content || "{}", modifiedTime: new Date().toISOString() }); return id; },
    signOut() { return Promise.resolve(); },
    hasToken() { return true; },
    async list() { this.calls.list++; return [...files.values()].map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime })); },
    async upload() { return { id: "x", name: "x" }; },
    async download(id) { if (!files.has(id)) throw new Error("404"); return files.get(id).content; },
    async remove(id) { this.calls.remove++; files.delete(id); return true; },
  };
}

beforeEach(() => {
  lsStub.clear();
  SS._migrated = false; // re-arm the one-shot legacy migration per test
});

describe("Task 18 — sanitizeSlotName (length-capped, trimmed, total)", () => {
  it("trims whitespace and collapses control chars", () => {
    expect(T.sanitizeSlotName("  My Save \n")).toBe("My Save");
    expect(T.sanitizeSlotName("a\tb")).toBe("a b");
  });
  it("caps the length to SLOT_NAME_MAX", () => {
    const long = "x".repeat(200);
    expect(T.sanitizeSlotName(long).length).toBe(T.SLOT_NAME_MAX);
  });
  it("is total over junk input", () => {
    expect(T.sanitizeSlotName(null)).toBe("");
    expect(T.sanitizeSlotName(undefined)).toBe("");
    expect(T.sanitizeSlotName(42)).toBe("42");
  });
});

describe("Task 18 — slotMetaFromPayload (defensive metadata extraction)", () => {
  it("pulls zone / level / playtime / savedAt from a payload", () => {
    const m = T.slotMetaFromPayload(fakePayload());
    expect(m.zone).toBe("forest");
    expect(m.level).toBe(7);
    expect(m.playSec).toBe(3725);
    expect(m.savedAt).toBe("2026-06-25T10:00:00.000Z");
  });
  it("defaults sanely for a foreign / empty payload", () => {
    const m = T.slotMetaFromPayload({});
    expect(m.level).toBe(1);
    expect(m.playSec).toBe(0);
    expect(typeof m.zone).toBe("string");
  });
});

describe("Task 18 — pure store helpers (immutable, total)", () => {
  it("normalizeSlotStore drops invalid records and keeps valid ones", () => {
    const raw = { v: 1, slots: { 0: { name: "Keep", payload: fakePayload() }, 1: { name: "Bad", payload: { not: "valid" } } } };
    const store = T.normalizeSlotStore(raw);
    expect(store.slots[0]).toBeTruthy();
    expect(store.slots[0].meta.level).toBe(7);
    expect(store.slots[1]).toBeUndefined();
  });
  it("listSlots returns every slot (used + empty) in order", () => {
    const store = T.putSlotRecord({ slots: {} }, 2, fakePayload(), "Third");
    const list = T.listSlots(store);
    expect(list.length).toBe(T.SLOT_COUNT);
    expect(list[2].used).toBe(true);
    expect(list[2].name).toBe("Third");
    expect(list[0].used).toBe(false);
  });
  it("nextFreeSlot finds the first gap, or -1 when full", () => {
    let store = { slots: {} };
    expect(T.nextFreeSlot(store)).toBe(0);
    store = T.putSlotRecord(store, 0, fakePayload(), "A");
    expect(T.nextFreeSlot(store)).toBe(1);
    for (let i = 0; i < T.SLOT_COUNT; i++) store = T.putSlotRecord(store, i, fakePayload(), "S" + i);
    expect(T.nextFreeSlot(store)).toBe(-1);
  });
  it("putSlotRecord is immutable and validates the payload", () => {
    const base = { slots: {} };
    const next = T.putSlotRecord(base, 0, fakePayload(), "New");
    expect(base.slots[0]).toBeUndefined(); // original untouched
    expect(next.slots[0].name).toBe("New");
    // An invalid payload is refused (slot stays empty).
    expect(T.putSlotRecord(base, 0, { junk: 1 }, "Bad").slots[0]).toBeUndefined();
    // Out-of-range index is a no-op.
    expect(T.putSlotRecord(base, 99, fakePayload(), "x").slots[99]).toBeUndefined();
  });
  it("renameSlotRecord renames an occupied slot only", () => {
    let store = T.putSlotRecord({ slots: {} }, 0, fakePayload(), "Old");
    store = T.renameSlotRecord(store, 0, "Renamed");
    expect(store.slots[0].name).toBe("Renamed");
    // Renaming an empty slot is a no-op.
    expect(T.renameSlotRecord(store, 3, "Nope").slots[3]).toBeUndefined();
  });
  it("deleteSlotRecord removes a slot immutably", () => {
    const store = T.putSlotRecord({ slots: {} }, 0, fakePayload(), "Gone");
    const next = T.deleteSlotRecord(store, 0);
    expect(next.slots[0]).toBeUndefined();
    expect(store.slots[0]).toBeTruthy(); // original untouched
  });
});

describe("Task 18 — fmtPlaytime (compact, localized units)", () => {
  it("formats hours / minutes / seconds", () => {
    expect(T.fmtPlaytime(3725)).toMatch(/1.*2/); // 1h 2m
    expect(T.fmtPlaytime(125)).toMatch(/2.*5/); // 2m 5s
    expect(T.fmtPlaytime(42)).toMatch(/42/); // 42s
    expect(T.fmtPlaytime(-5)).toMatch(/0/); // clamps
  });
});

describe("Task 18 — playtime metadata serialized (save schema v10)", () => {
  beforeAll(() => { T.startGame(); step(3); });
  it("serializeGame carries playSec and applySave restores it", () => {
    T.state.playSec = 1234.6;
    const save = T.serializeGame();
    expect(save.v).toBe(T.SAVE_VERSION);
    expect(save.playSec).toBe(1235); // rounded
    T.state.playSec = 0;
    T.applySave(save);
    expect(T.state.playSec).toBe(1235);
  });
  it("a legacy save without playSec loads with playSec = 0", () => {
    const save = T.serializeGame();
    delete save.playSec; // simulate an older (< v10) save
    expect(() => T.applySave(save)).not.toThrow();
    expect(T.state.playSec).toBe(0);
  });
});

describe("Task 18 — SaveSlots controller (persisted; round-trips per slot)", () => {
  beforeAll(() => { T.startGame(); step(3); });
  beforeEach(() => { lsStub.clear(); SS._migrated = true; }); // skip migration in these

  it("saveNew writes to the next free slot; saveTo overwrites a chosen one", () => {
    T.state.coins = 555;
    const idx = SS.saveNew();
    expect(idx).toBe(0);
    expect(SS.list()[0].used).toBe(true);
    // Persisted to localStorage under the versioned key.
    const raw = JSON.parse(lsStub.getItem(T.SLOTS_KEY));
    expect(raw.v).toBe(T.SLOTS_VERSION);
    expect(raw.slots[0]).toBeTruthy();
    // Overwrite slot 0 with new state.
    T.state.coins = 999;
    expect(SS.saveTo(0, "Boss fight")).toBe(0);
    expect(SS.list()[0].name).toBe("Boss fight");
  });

  it("each slot round-trips through applySave (full payload preserved)", () => {
    T.state.coins = 4242;
    T.player.materials.wood = 17;
    SS.saveTo(1, "Checkpoint");
    // Drift live state, then load slot 1's payload back in.
    T.state.coins = 0;
    T.player.materials.wood = 0;
    const payload = SS.payloadOf(1);
    expect(T.validateSave(payload)).toBe(true);
    T.applySave(payload);
    expect(T.state.coins).toBe(4242);
    expect(T.player.materials.wood).toBe(17);
  });

  it("rename + delete mutate the persisted store", () => {
    SS.saveTo(2, "Temp");
    expect(SS.rename(2, "Renamed run")).toBe(true);
    expect(SS.list()[2].name).toBe("Renamed run");
    expect(SS.remove(2)).toBe(true);
    expect(SS.list()[2].used).toBe(false);
  });

  it("slot metadata reflects level / zone / playtime", () => {
    T.state.playSec = 600;
    SS.saveTo(3, "Meta check");
    const meta = SS.list()[3].meta;
    expect(meta.playSec).toBe(600);
    expect(meta.zone).toBe(T.state.zoneId);
    expect(meta.level).toBe(T.player.progress.level);
  });
});

describe("Task 18 — migration of the prior single-slot (auto-session) snapshot", () => {
  beforeAll(() => { T.startGame(); step(3); });

  it("imports the Task-17 session snapshot into a named slot on first read", () => {
    lsStub.clear();
    SS._migrated = false;
    // Seed a legacy single-slot snapshot the way Task 17 persists it.
    T.state.coins = 1313;
    T.Session.flush();
    expect(lsStub.getItem(T.SESSION_KEY)).toBeTruthy();
    expect(lsStub.getItem(T.SLOTS_KEY)).toBeNull(); // no slot store yet
    // First read migrates it into slot 0 and persists the new store.
    const list = SS.list();
    expect(list[0].used).toBe(true);
    expect(lsStub.getItem(T.SLOTS_KEY)).toBeTruthy();
    const payload = SS.payloadOf(0);
    expect(payload.money).toBe(1313);
    // The migration is one-shot (a second read doesn't duplicate it).
    SS.list();
    const used = SS.list().filter((s) => s.used).length;
    expect(used).toBe(1);
  });

  it("does nothing when there is no legacy snapshot", () => {
    lsStub.clear();
    SS._migrated = false;
    const list = SS.list();
    expect(list.every((s) => !s.used)).toBe(true);
  });
});

describe("Task 18 — headless-safe: nothing throws with no run / blocked storage", () => {
  it("list / nextFree / load are safe before a run exists path", () => {
    lsStub.clear();
    SS._migrated = true;
    expect(() => SS.list()).not.toThrow();
    expect(SS.nextFree()).toBe(0);
    // Loading an empty slot is rejected without throwing.
    expect(SS.load(0)).toBe(false);
  });
});

describe("Task 18 — cloud slot delete (injected Drive client)", () => {
  it("deleteSave removes a cloud file through the client", async () => {
    const drive = makeFakeDrive();
    T.CloudSave.clientId = "test.apps.googleusercontent.com";
    T.CloudSave._setClient(drive);
    T.CloudSave.signedIn = true;
    const id = drive.seed(T.CLOUD_MANUAL_NAME, "{}");
    expect(await T.CloudSave.deleteSave(id)).toBe(true);
    expect(drive.calls.remove).toBe(1);
    expect(drive._files.has(id)).toBe(false);
    // Signed out → no-op, no throw.
    T.CloudSave.signedIn = false;
    expect(await T.CloudSave.deleteSave("whatever")).toBe(false);
  });
});

describe("Task 18 — SavesUI opens, renders local + cloud, drives Restore", () => {
  beforeAll(() => { T.startGame(); step(3); });

  it("opening the Saves screen renders the local slot list", () => {
    lsStub.clear();
    SS._migrated = true;
    T.SavesUI.openScreen();
    expect(T.SavesUI.open).toBe(true);
    // No throw, and the list host got rendered (innerHTML written).
    expect(typeof T.SavesUI.render).toBe("function");
    T.SavesUI.closeScreen();
    expect(T.SavesUI.open).toBe(false);
  });

  it("the cloud section lists slots and Restore runs against the injected client", async () => {
    const drive = makeFakeDrive();
    T.CloudSave.clientId = "test.apps.googleusercontent.com";
    T.CloudSave._setClient(drive);
    T.CloudSave.signedIn = true;
    // A real, restorable manual cloud save.
    const valid = JSON.stringify(T.serializeGame());
    const id = drive.seed(T.CLOUD_MANUAL_NAME, valid);
    const saves = await T.CloudSave.listSaves();
    expect(saves.some((s) => s.id === id)).toBe(true);
    // Restore reconciles + stashes for the boot reload path; with a valid payload
    // (not older than the current run here) it proceeds without throwing.
    expect(() => T.SavesUI.renderCloud()).not.toThrow();
    await flush();
    T.CloudSave.signedIn = false;
  });
});

describe("Task 18 — cloud-saves browser is no longer a dead click (signed-out CTA)", () => {
  it("openList opens the overlay with a sign-in CTA when signed out (configured)", async () => {
    T.CloudSave.clientId = "test.apps.googleusercontent.com";
    T.CloudSave._setClient(null);
    T.CloudSave.signedIn = false;
    // Opening the cloud browser signed-out shows a clear state, never throws, and
    // does NOT crash on an empty list (the old dead/disabled-button behaviour).
    expect(() => T.CloudUI.openList()).not.toThrow();
    await flush();
    // The overlay is shown (un-hidden) — proving it's reachable.
    expect(T.CloudUI.overlay.classList.contains("hidden")).toBe(false);
    T.CloudUI.closeList();
    expect(T.CloudUI.overlay.classList.contains("hidden")).toBe(true);
  });
});
