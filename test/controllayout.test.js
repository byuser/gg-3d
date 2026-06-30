// Task 36 — Customizable on-screen control layout. Locks in the PURE layout model
// (clampLayoutPos / layoutReducer / sanitizeLayout — all DOM-free), the per-device
// localStorage mirror, the save/load round-trip + the pre-v14 migration to the
// default layout, and the headless-safety of the editor (no Pointer Events / no
// real DOM ⇒ a clean no-op so the defaults stand and nothing throws).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { scenes, localStorage as storage } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];

beforeAll(() => {
  T.startGame();
  for (let i = 0; i < 3; i++) scene.onBeforeRenderObservable._fire();
});

beforeEach(() => {
  // Each test starts from a clean per-device layout (no stored arrangement).
  storage.removeItem(T.LAYOUT_KEY);
  T.ControlLayout._loaded = false;
  T.ControlLayout.layout = {};
});

describe("Task 36 — SAVE_VERSION bumped to 14", () => {
  it("the save schema version is 14", () => {
    expect(T.SAVE_VERSION).toBe(14);
  });
});

describe("Task 36 — clampLayoutPos (pure, DOM-free safe-area clamp)", () => {
  // A control that's 10% of the viewport wide/tall (halfW/halfH = 0.05) with 5%
  // safe-area insets all round → the centre must stay within [0.10, 0.90].
  const bounds = {
    halfW: 0.05, halfH: 0.05,
    insetLeft: 0.05, insetRight: 0.05, insetTop: 0.05, insetBottom: 0.05,
  };

  it("keeps an in-bounds position unchanged", () => {
    expect(T.clampLayoutPos({ x: 0.5, y: 0.5 }, bounds)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps a position past the right/bottom edge back inside the safe area", () => {
    const p = T.clampLayoutPos({ x: 1.5, y: 1.5 }, bounds);
    expect(p.x).toBeCloseTo(0.9, 6);
    expect(p.y).toBeCloseTo(0.9, 6);
  });

  it("clamps a position past the left/top edge back inside the safe area", () => {
    const p = T.clampLayoutPos({ x: -1, y: -1 }, bounds);
    expect(p.x).toBeCloseTo(0.1, 6);
    expect(p.y).toBeCloseTo(0.1, 6);
  });

  it("a control wider than the available band centres on that axis (never off-screen)", () => {
    // halfW 0.6 + insets 0.05 leaves no room → centre on x at (0.05 + 0.95)/2 = 0.5.
    const p = T.clampLayoutPos({ x: 0.95, y: 0.5 }, { ...bounds, halfW: 0.6 });
    expect(p.x).toBeCloseTo(0.5, 6);
  });

  it("garbage / missing coordinates resolve to a finite in-bounds point", () => {
    const p = T.clampLayoutPos({ x: NaN, y: undefined }, bounds);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0.1);
    expect(p.y).toBeGreaterThanOrEqual(0.1);
  });
});

describe("Task 36 — layoutReducer (pure set / move / reset / clear)", () => {
  it("set places a control at the given fraction (returns a NEW map)", () => {
    const before = {};
    const after = T.layoutReducer(before, { op: "set", id: "skillBar", x: 0.3, y: 0.7 });
    expect(after).toEqual({ skillBar: { x: 0.3, y: 0.7 } });
    expect(before).toEqual({}); // never mutates the input
  });

  it("set with bounds clamps into the safe area", () => {
    const after = T.layoutReducer({}, {
      op: "set", id: "actionBtn", x: 2, y: 2,
      bounds: { halfW: 0.05, halfH: 0.05, insetLeft: 0.05, insetRight: 0.05, insetTop: 0.05, insetBottom: 0.05 },
    });
    expect(after.actionBtn.x).toBeCloseTo(0.9, 6);
    expect(after.actionBtn.y).toBeCloseTo(0.9, 6);
  });

  it("moving an already-placed control overwrites its position", () => {
    let m = T.layoutReducer({}, { op: "set", id: "castBtn", x: 0.2, y: 0.2 });
    m = T.layoutReducer(m, { op: "set", id: "castBtn", x: 0.8, y: 0.6 });
    expect(m).toEqual({ castBtn: { x: 0.8, y: 0.6 } });
  });

  it("reset drops one control back to default, leaving the others", () => {
    let m = { skillBar: { x: 0.3, y: 0.7 }, potionBar: { x: 0.1, y: 0.9 } };
    m = T.layoutReducer(m, { op: "reset", id: "skillBar" });
    expect(m).toEqual({ potionBar: { x: 0.1, y: 0.9 } });
  });

  it("clear resets every control to default", () => {
    const m = { joystick: { x: 0.2, y: 0.8 }, castBtn: { x: 0.8, y: 0.7 } };
    expect(T.layoutReducer(m, { op: "clear" })).toEqual({});
  });

  it("unknown control ids and non-finite coordinates are ignored", () => {
    expect(T.layoutReducer({}, { op: "set", id: "bogus", x: 0.5, y: 0.5 })).toEqual({});
    expect(T.layoutReducer({}, { op: "set", id: "skillBar", x: NaN, y: 0.5 })).toEqual({});
  });

  it("a null / opless action returns a clean copy of the layout", () => {
    const m = { skillBar: { x: 0.3, y: 0.7 } };
    const copy = T.layoutReducer(m, null);
    expect(copy).toEqual(m);
    expect(copy).not.toBe(m);
  });
});

describe("Task 36 — sanitizeLayout scrubs foreign / tampered blobs", () => {
  it("keeps only known ids with finite in-range fractions", () => {
    const out = T.sanitizeLayout({
      skillBar: { x: 0.4, y: 0.6 },     // valid
      potionBar: { x: 1.4, y: 0.2 },    // x out of range → dropped
      castBtn: { x: "nope", y: 0.2 },   // non-finite → dropped
      bogus: { x: 0.5, y: 0.5 },        // unknown id → dropped
    });
    expect(out).toEqual({ skillBar: { x: 0.4, y: 0.6 } });
  });

  it("non-object / null input yields an empty layout", () => {
    expect(T.sanitizeLayout(null)).toEqual({});
    expect(T.sanitizeLayout("x")).toEqual({});
    expect(T.sanitizeLayout(42)).toEqual({});
  });
});

describe("Task 36 — localStorage device mirror round-trips", () => {
  it("save() then a fresh load() restores the same layout from localStorage", () => {
    T.ControlLayout.set({ skillBar: { x: 0.25, y: 0.75 } }, true);
    expect(storage.getItem(T.LAYOUT_KEY)).toBeTruthy();
    // Simulate a fresh boot: forget the in-memory copy and reload from storage.
    T.ControlLayout._loaded = false;
    T.ControlLayout.layout = {};
    T.ControlLayout.load();
    expect(T.ControlLayout.layout).toEqual({ skillBar: { x: 0.25, y: 0.75 } });
  });

  it("a corrupt localStorage value loads as the default (empty) layout", () => {
    storage.setItem(T.LAYOUT_KEY, "{not json");
    T.ControlLayout._loaded = false;
    T.ControlLayout.layout = {};
    T.ControlLayout.load();
    expect(T.ControlLayout.layout).toEqual({});
  });

  it("revert() drops unsaved preview edits back to the last saved layout (editor Cancel)", () => {
    // Save a baseline arrangement…
    T.ControlLayout.set({ skillBar: { x: 0.3, y: 0.7 } }, true);
    // …then live-preview a different one WITHOUT persisting (what a drag does).
    T.ControlLayout.set({ skillBar: { x: 0.9, y: 0.1 }, joystick: { x: 0.2, y: 0.8 } }, false);
    expect(T.ControlLayout.layout.joystick).toBeTruthy();
    // Cancel → revert to the persisted baseline.
    T.ControlLayout.revert();
    expect(T.ControlLayout.layout).toEqual({ skillBar: { x: 0.3, y: 0.7 } });
  });
});

describe("Task 36 — save/load round-trip + pre-v14 migration", () => {
  it("the control layout round-trips through serializeGame / applySave", () => {
    T.ControlLayout.set({ potionBar: { x: 0.15, y: 0.85 }, castBtn: { x: 0.82, y: 0.62 } }, true);
    const snap = T.serializeGame();
    expect(snap.v).toBe(14);
    expect(snap.controls).toEqual({ potionBar: { x: 0.15, y: 0.85 }, castBtn: { x: 0.82, y: 0.62 } });

    // Wipe the live + device layout, then restore from the snapshot. With no device
    // layout stored, applySave adopts the save's as this device's portable default.
    storage.removeItem(T.LAYOUT_KEY);
    T.ControlLayout._loaded = false;
    T.ControlLayout.layout = {};
    T.applySave(snap);
    expect(T.ControlLayout.layout).toEqual({ potionBar: { x: 0.15, y: 0.85 }, castBtn: { x: 0.82, y: 0.62 } });
  });

  it("the DEVICE layout wins: applySave never overwrites a layout already on this device", () => {
    // This device already has its own arrangement…
    T.ControlLayout.set({ skillBar: { x: 0.5, y: 0.5 } }, true);
    // …and a save carrying a DIFFERENT layout is loaded.
    const snap = T.serializeGame();
    snap.controls = { skillBar: { x: 0.1, y: 0.1 }, joystick: { x: 0.2, y: 0.8 } };
    T.applySave(snap);
    // The live device layout is unchanged (device pref = live source).
    expect(T.ControlLayout.layout).toEqual({ skillBar: { x: 0.5, y: 0.5 } });
  });

  it("a pre-v14 save (no controls field) loads with the DEFAULT layout", () => {
    const snap = T.serializeGame();
    // Simulate an older save: drop the v14 field and stamp the prior version.
    delete snap.controls;
    snap.v = 13;
    expect(T.validateSave(snap)).toBe(true); // older saves still validate
    storage.removeItem(T.LAYOUT_KEY);
    T.ControlLayout._loaded = false;
    T.ControlLayout.layout = { castBtn: { x: 0.9, y: 0.9 } }; // stale junk to be overwritten by "default"
    T.applySave(snap);
    expect(T.ControlLayout.layout).toEqual({}); // defaults stand
  });
});

describe("Task 36 — editor is feature-detected (headless-safe)", () => {
  it("canEdit() is false without Pointer Events / a touch device", () => {
    // The headless stub has no PointerEvent and matchMedia → matches:false.
    expect(T.ControlLayoutUI.canEdit()).toBe(false);
  });

  it("applying / opening the layout never throws under the headless stub", () => {
    expect(() => {
      T.ControlLayout.apply();
      T.ControlLayoutUI.openUI();   // opens in no-drag mode (canEdit false)
      T.ControlLayoutUI.renderHandles();
      T.ControlLayoutUI.cancel();
    }).not.toThrow();
    expect(T.ControlLayoutUI.open).toBe(false);
  });

  it("CONTROL_IDS lists the five movable controls", () => {
    expect(T.CONTROL_IDS).toEqual(["joystick", "skillBar", "potionBar", "actionBtn", "castBtn"]);
  });
});
