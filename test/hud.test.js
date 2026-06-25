// Task 16 — Responsive, mobile-first HUD & menu overhaul. Locks in the PURE
// drag-to-slot reducer (pick → drop → assign / move / swap / clear), the
// feature-detection of the browser-only gesture/orientation APIs (no-op safely
// headless), and a UI smoke that drives the accessible tap-to-pick fallback and
// asserts the underlying Skills.assignSlot / clearSlot model fires — with the
// slot state still round-tripping through save/load.
import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];

// Grant the player a couple of owned skills so slotting has something to assign.
function ownedSkills(p, n = 3) {
  const ids = T.BASE_SKILL_IDS.slice(0, n);
  p.progress = T.newProgress();
  for (const id of ids) if (!p.progress.owned.includes(id)) p.progress.owned.push(id);
  p.progress.slots = new Array(T.SKILL_SLOTS).fill(null);
  return ids;
}

beforeAll(() => {
  T.startGame();
  for (let i = 0; i < 3; i++) scene.onBeforeRenderObservable._fire();
});

describe("Task 16 — drag-to-slot reducer (pure)", () => {
  const N = 3;

  it("roster → slot assigns that skill to the slot", () => {
    const cmds = T.dragSlotReducer({ kind: "roster", id: "fire" }, { kind: "slot", slot: 1 }, N);
    expect(cmds).toEqual([{ op: "assign", slot: 1, id: "fire" }]);
  });

  it("roster → void / missing target is a no-op", () => {
    expect(T.dragSlotReducer({ kind: "roster", id: "fire" }, { kind: "void" }, N)).toEqual([]);
    expect(T.dragSlotReducer({ kind: "roster", id: "fire" }, null, N)).toEqual([]);
  });

  it("slot → empty space clears the source slot", () => {
    const cmds = T.dragSlotReducer({ kind: "slot", slot: 0, id: "fire" }, { kind: "void" }, N);
    expect(cmds).toEqual([{ op: "clear", slot: 0 }]);
  });

  it("slot → an empty slot moves the skill (clear source, assign target)", () => {
    const cmds = T.dragSlotReducer(
      { kind: "slot", slot: 0, id: "fire" },
      { kind: "slot", slot: 2, occupantId: null },
      N,
    );
    expect(cmds).toEqual([
      { op: "clear", slot: 0 },
      { op: "assign", slot: 2, id: "fire" },
    ]);
  });

  it("slot → a filled slot swaps the two skills", () => {
    const cmds = T.dragSlotReducer(
      { kind: "slot", slot: 0, id: "fire" },
      { kind: "slot", slot: 1, occupantId: "frost" },
      N,
    );
    expect(cmds).toEqual([
      { op: "assign", slot: 0, id: "frost" },
      { op: "assign", slot: 1, id: "fire" },
    ]);
  });

  it("dropping a slot on itself is a no-op", () => {
    const cmds = T.dragSlotReducer(
      { kind: "slot", slot: 1, id: "fire" },
      { kind: "slot", slot: 1, occupantId: "fire" },
      N,
    );
    expect(cmds).toEqual([]);
  });

  it("out-of-range targets are ignored and never assign", () => {
    expect(T.dragSlotReducer({ kind: "roster", id: "fire" }, { kind: "slot", slot: 9 }, N)).toEqual(
      [],
    );
    expect(
      T.dragSlotReducer({ kind: "slot", slot: 9, id: "x" }, { kind: "slot", slot: 0 }, N),
    ).toEqual([]);
  });

  it("no source yields no commands", () => {
    expect(T.dragSlotReducer(null, { kind: "slot", slot: 0 }, N)).toEqual([]);
  });
});

describe("Task 16 — browser-only APIs are feature-detected (headless-safe)", () => {
  it("Pointer Events are reported unsupported under the headless stub", () => {
    // The stub window has no PointerEvent, so the drag gesture layer stays inert
    // and the tap-to-pick fallback drives slotting.
    expect(T.pointerDragSupported()).toBe(false);
  });

  it("Fullscreen orientation-lock helpers no-op without the Screen Orientation API", () => {
    expect(T.Fullscreen.orientationLockSupported()).toBe(false);
    // None of these may throw even when the API is absent.
    expect(() => T.Fullscreen.lockLandscape()).not.toThrow();
    expect(() => T.Fullscreen.unlockOrientation()).not.toThrow();
  });
});

describe("Task 16 — SkillsUI tap-to-pick fallback drives the slot model", () => {
  it("pick a roster skill then tap a slot assigns it (no per-skill buttons needed)", () => {
    const p = T.player;
    const [a] = ownedSkills(p, 3);
    T.SkillsUI.init(T.state, p);
    // Accessible fallback: pick the roster skill, then tap slot 0.
    T.SkillsUI.picked = null;
    T.SkillsUI.tapPick({ kind: "roster", id: a });
    expect(T.SkillsUI.picked).toEqual({ kind: "roster", id: a });
    T.SkillsUI.tapSlot(0, null);
    expect(p.progress.slots[0]).toBe(a);
    expect(T.SkillsUI.picked).toBe(null); // pick cleared after a successful drop
  });

  it("tapping a filled slot then empty space clears it via the reducer", () => {
    const p = T.player;
    const [a] = ownedSkills(p, 3);
    T.Skills.assignSlot(p, 1, a);
    expect(p.progress.slots[1]).toBe(a);
    T.SkillsUI.init(T.state, p);
    T.SkillsUI.picked = null;
    // applyDrag with a void target mirrors a drag onto empty space.
    T.SkillsUI.applyDrag({ kind: "slot", slot: 1, id: a }, { kind: "void" });
    expect(p.progress.slots[1]).toBe(null);
  });

  it("dragging between filled slots swaps them", () => {
    const p = T.player;
    const [a, b] = ownedSkills(p, 3);
    T.Skills.assignSlot(p, 0, a);
    T.Skills.assignSlot(p, 1, b);
    T.SkillsUI.init(T.state, p);
    T.SkillsUI.applyDrag(
      { kind: "slot", slot: 0, id: a },
      { kind: "slot", slot: 1, occupantId: b },
    );
    expect(p.progress.slots[0]).toBe(b);
    expect(p.progress.slots[1]).toBe(a);
  });

  it("the slotted quick-bar state round-trips through save/load", () => {
    const p = T.player;
    const [a, b] = ownedSkills(p, 3);
    T.Skills.assignSlot(p, 0, a);
    T.Skills.assignSlot(p, 2, b);
    const snap = T.serializeGame();
    // Wipe the slots, then restore from the snapshot.
    p.progress.slots = new Array(T.SKILL_SLOTS).fill(null);
    T.applySave(snap);
    const restored = T.player.progress.slots;
    expect(restored[0]).toBe(a);
    expect(restored[2]).toBe(b);
  });
});

describe("Task 16 — SkillsUI render stays headless-safe after the gesture rework", () => {
  it("opening + rendering the skills overlay never throws (no per-slot assign buttons)", () => {
    const p = T.player;
    ownedSkills(p, 3);
    T.SkillsUI.init(T.state, p);
    expect(() => {
      T.SkillsUI.openUI();
      T.SkillsUI.render();
      T.SkillsUI.close();
    }).not.toThrow();
    expect(T.SkillsUI.picked).toBe(null); // closing clears any pending pick
  });
});
