// Task 37 — Exit/enter fullscreen control in the settings menu. Locks in the
// pause → settings → Display fullscreen control:
//   • its label DERIVES from Fullscreen.active() — "Enter fullscreen" when
//     windowed, "Exit fullscreen" (the existing btnTitle.exitFullscreen string,
//     in EN + RU) when fullscreen;
//   • its visibility/enabled state DERIVES from Fullscreen.supported() — the whole
//     #displayPanel hides and the button disables when the Fullscreen API is
//     missing (e.g. iOS Safari), so there is never a dead button;
//   • the menu button is WIRED to the same Fullscreen.toggle() as the #fsBtn HUD
//     button (so the Task 16 landscape lock on enter / unlock on exit is shared);
//   • everything is feature-detected and no-op-safe headless (the Vitest stub has
//     no Fullscreen API, so supported() is false and nothing throws).
import { describe, it, expect, beforeAll, vi } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const doc = globalThis.document;
const scene = scenes[0];

beforeAll(() => {
  T.startGame();
  for (let i = 0; i < 3; i++) scene.onBeforeRenderObservable._fire();
});

// Run `fn` with Fullscreen.supported()/active() forced to the given values, then
// restore the real (feature-detecting) implementations. Lets us assert the pure
// label/visibility derivation without a real browser Fullscreen API.
function withState({ supported, active }, fn) {
  const F = T.Fullscreen;
  const realSupported = F.supported, realActive = F.active;
  F.supported = () => supported;
  F.active = () => active;
  try {
    return fn(F);
  } finally {
    F.supported = realSupported;
    F.active = realActive;
  }
}

describe("Task 37 — fullscreen settings control: feature detection (headless-safe)", () => {
  it("the headless stub exposes no Fullscreen API, so supported()/active() are false and nothing throws", () => {
    const F = T.Fullscreen;
    expect(F.supported()).toBe(false);
    expect(F.active()).toBe(false);
    expect(typeof F.syncMenu).toBe("function");
    expect(() => F.syncMenu()).not.toThrow();
    // toggle() must also be inert (no API present) rather than throw.
    expect(() => F.toggle()).not.toThrow();
  });

  it("when unsupported, syncMenu hides the Display panel and disables the button (no dead control)", () => {
    withState({ supported: false, active: false }, (F) => {
      F.syncMenu();
      expect(doc.getElementById("displayPanel").style.display).toBe("none");
      expect(doc.getElementById("fsBtnP").disabled).toBe(true);
    });
  });

  it("when supported, syncMenu reveals the Display panel and enables the button", () => {
    withState({ supported: true, active: false }, (F) => {
      F.syncMenu();
      expect(doc.getElementById("displayPanel").style.display).toBe("");
      expect(doc.getElementById("fsBtnP").disabled).toBe(false);
    });
  });
});

describe("Task 37 — fullscreen settings control: label derives from active()", () => {
  it("windowed (active=false) → 'Enter fullscreen'", () => {
    withState({ supported: true, active: false }, (F) => {
      F.syncMenu();
      expect(doc.getElementById("fsBtnP").textContent).toBe(T.t("settings.enterFullscreen"));
    });
  });

  it("fullscreen (active=true) → 'Exit fullscreen' (the existing btnTitle.exitFullscreen string)", () => {
    withState({ supported: true, active: true }, (F) => {
      F.syncMenu();
      expect(doc.getElementById("fsBtnP").textContent).toBe(T.t("btnTitle.exitFullscreen"));
    });
  });

  it("the label flips back when fullscreen is exited (state stays in sync)", () => {
    const btn = doc.getElementById("fsBtnP");
    withState({ supported: true, active: true }, (F) => F.syncMenu());
    expect(btn.textContent).toBe(T.t("btnTitle.exitFullscreen"));
    withState({ supported: true, active: false }, (F) => F.syncMenu());
    expect(btn.textContent).toBe(T.t("settings.enterFullscreen"));
  });

  it("the exit-fullscreen label is localized in EN and RU", () => {
    const en = T.LOCALES.en["btnTitle.exitFullscreen"];
    const ru = T.LOCALES.ru["btnTitle.exitFullscreen"];
    expect(en).toBeTruthy();
    expect(ru).toBeTruthy();
    expect(ru).not.toBe(en); // genuinely translated, not an English fallback
    // The enter-fullscreen + Display panel strings exist in both locales too.
    for (const key of ["settings.display", "settings.enterFullscreen"]) {
      expect(T.LOCALES.en[key]).toBeTruthy();
      expect(T.LOCALES.ru[key]).toBeTruthy();
    }
  });
});

describe("Task 37 — fullscreen settings control: wired to Fullscreen.toggle()", () => {
  it("clicking the menu button invokes Fullscreen.toggle() (the same path as the HUD button)", () => {
    const F = T.Fullscreen;
    // Capture the click handler registered against #fsBtnP specifically (the stub
    // pushes listeners onto a shared map, so re-init with a one-shot capturing
    // addEventListener isolates this button's handler).
    const btn = doc.getElementById("fsBtnP");
    let menuHandler = null;
    const realAdd = btn.addEventListener;
    btn.addEventListener = (ev, fn) => { if (ev === "click") menuHandler = fn; };
    try {
      // Force support so init() does not bail before wiring the menu button.
      const realSupported = F.supported;
      F.supported = () => true;
      try { F.init(); } finally { F.supported = realSupported; }
    } finally {
      btn.addEventListener = realAdd;
    }
    expect(typeof menuHandler).toBe("function");

    const spy = vi.spyOn(F, "toggle").mockImplementation(() => {});
    try {
      menuHandler();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("Pause.refreshTexts() repaints the menu control (so opening the menu / switching language stays in sync)", () => {
    // refreshTexts runs on pause-open and on a live locale switch; it must drive
    // the Display control off the live Fullscreen state without throwing.
    expect(() => T.Pause.refreshTexts()).not.toThrow();
    // Headless = unsupported → the panel stays hidden after a refresh.
    expect(doc.getElementById("displayPanel").style.display).toBe("none");
  });
});
