// Task 17 — durable session persistence. Locks in the pure, browser-free policy
// (the cookie helper's get/set/expire + SameSite/Secure/Max-Age attributes and
// its localStorage fallback, the auto-persist debounce/flush scheduler, and the
// silent-auth decision), proves the local session snapshot round-trips back into
// a running game through the same boot path as a file/cloud load, and that with
// no run started / cookies blocked / signed out nothing throws — the headless
// harness still runs green.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { scenes, localStorage as lsStub, document as docStub } from "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;
const S = T.Session;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };

// Install a real cookie jar on the document stub so the actual cookie path (not
// just the localStorage fallback) is exercised. Mirrors browser `document.cookie`
// assignment semantics (one cookie set at a time; reads concatenate the jar).
function installCookieJar() {
  const jar = new Map();
  Object.defineProperty(docStub, "cookie", {
    configurable: true,
    get() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); },
    set(str) {
      const first = String(str).split(";")[0];
      const i = first.indexOf("=");
      const k = first.slice(0, i).trim();
      const v = first.slice(i + 1).trim();
      // Max-Age=0 expires the cookie.
      if (/Max-Age=0(\b|;|$)/.test(str)) jar.delete(k);
      else jar.set(k, v);
    },
  });
  return jar;
}
function removeCookieJar() {
  // Back to "no cookie support" (the headless default) so the fallback is tested.
  try { delete docStub.cookie; } catch (e) {}
  Object.defineProperty(docStub, "cookie", { configurable: true, value: undefined, writable: true });
}

beforeAll(() => {
  // The game self-boots on import; make sure the scene is ready.
  step(1);
});

beforeEach(() => {
  lsStub.clear();
  removeCookieJar();
});

describe("buildCookieString — pure attribute policy", () => {
  it("emits Path, SameSite=Lax and a Max-Age by default", () => {
    const s = T.buildCookieString("k", "v", {});
    expect(s).toContain("k=v");
    expect(s).toContain("Path=/");
    expect(s).toContain("SameSite=Lax");
    expect(s).toMatch(/Max-Age=\d+/);
  });
  it("adds Secure only when asked (HTTPS origins)", () => {
    expect(T.buildCookieString("k", "v", { secure: true })).toContain("Secure");
    expect(T.buildCookieString("k", "v", { secure: false })).not.toContain("Secure");
  });
  it("URL-encodes name and value", () => {
    const s = T.buildCookieString("a b", "x=y; z", { secure: false });
    expect(s).toContain("a%20b=");
    expect(s).toContain(encodeURIComponent("x=y; z"));
  });
  it("expire uses Max-Age=0 and overrides the lifetime", () => {
    const s = T.buildCookieString("k", "", { expire: true });
    expect(s).toContain("Max-Age=0");
  });
  it("honours a custom maxAge and sameSite", () => {
    const s = T.buildCookieString("k", "v", { maxAge: 42, sameSite: "Strict", secure: false });
    expect(s).toContain("Max-Age=42");
    expect(s).toContain("SameSite=Strict");
  });
});

describe("parseCookies — pure decode", () => {
  it("parses a multi-cookie header into a decoded map", () => {
    const m = T.parseCookies("a=1; b=hello%20world; c=");
    expect(m.a).toBe("1");
    expect(m.b).toBe("hello world");
    expect(m.c).toBe("");
  });
  it("is total over junk input", () => {
    expect(T.parseCookies("")).toEqual({});
    expect(T.parseCookies(null)).toEqual({});
    expect(T.parseCookies("nonsense")).toEqual({});
  });
});

describe("cookie helper — real cookie path + localStorage fallback", () => {
  it("round-trips through document.cookie when available", () => {
    installCookieJar();
    T.cookieSet("t_one", "alpha", { secure: false });
    expect(T.cookieGet("t_one")).toBe("alpha");
    T.cookieDel("t_one");
    expect(T.cookieGet("t_one")).toBe(null);
  });
  it("falls back to localStorage when cookies are unavailable (headless/private)", () => {
    removeCookieJar();
    T.cookieSet("t_two", "beta", { secure: false });
    // Stored under the mirrored ck_* key in localStorage.
    expect(lsStub.getItem("ck_t_two")).toBe("beta");
    expect(T.cookieGet("t_two")).toBe("beta");
    T.cookieDel("t_two");
    expect(T.cookieGet("t_two")).toBe(null);
  });
  it("never throws when document.cookie throws", () => {
    Object.defineProperty(docStub, "cookie", {
      configurable: true,
      get() { throw new Error("blocked"); },
      set() { throw new Error("blocked"); },
    });
    expect(() => T.cookieSet("t_three", "x")).not.toThrow();
    expect(() => T.cookieGet("t_three")).not.toThrow();
    expect(() => T.cookieDel("t_three")).not.toThrow();
    removeCookieJar();
  });
});

describe("cookie state — merge without dropping siblings", () => {
  it("merges patches and drops only explicit nulls", () => {
    installCookieJar();
    T.writeCookieState({ sid: "s1", locale: "en" });
    T.writeCookieState({ cloud: 1 });
    let st = T.readCookieState();
    expect(st.sid).toBe("s1");
    expect(st.locale).toBe("en");
    expect(st.cloud).toBe(1);
    T.writeCookieState({ locale: null });
    st = T.readCookieState();
    expect(st.locale).toBeUndefined();
    expect(st.sid).toBe("s1");
  });
});

describe("sessionPersistDue — pure debounce scheduler", () => {
  it("never fires when not dirty", () => {
    expect(T.sessionPersistDue({ dirty: false }, 10_000)).toBe(false);
  });
  it("a forced beat fires immediately", () => {
    expect(T.sessionPersistDue({ dirty: true, force: true, queuedAt: 9_000 }, 9_001)).toBe(true);
  });
  it("waits for the debounce window before firing", () => {
    const s = { dirty: true, force: false, queuedAt: 0, debounceMs: 1500 };
    expect(T.sessionPersistDue(s, 1000)).toBe(false);
    expect(T.sessionPersistDue(s, 1500)).toBe(true);
    expect(T.sessionPersistDue(s, 5000)).toBe(true);
  });
});

describe("silentAuthDecision — pure boot re-auth gate", () => {
  it("does not attempt when there is no hint (never opted in)", () => {
    expect(T.silentAuthDecision(null).attempt).toBe(false);
    expect(T.silentAuthDecision({}).attempt).toBe(false);
  });
  it("attempts with the stored login hint when opted in", () => {
    const d = T.silentAuthDecision({ optedIn: true, email: "lily@example.com" });
    expect(d.attempt).toBe(true);
    expect(d.loginHint).toBe("lily@example.com");
  });
  it("does not attempt after sign-out cleared the hint", () => {
    // signOut clears the cookie auth → authHint() is null → no attempt.
    expect(T.silentAuthDecision({ optedIn: false }).attempt).toBe(false);
  });
});

describe("Session snapshot — auto-persist + resume round-trip", () => {
  beforeAll(() => {
    T.startGame();   // boot a real run so serializeGame() has state to capture
    step(10);
  });

  it("flush writes the live run to first-party storage", () => {
    lsStub.clear();
    T.state.coins = 321;
    T.player.inventory = [];
    T.bagAdd(T.player, "wood", 9); // materials are unified bag items now (Task 21)
    expect(S.flush()).toBe(true);
    const raw = lsStub.getItem(T.SESSION_KEY);
    expect(typeof raw).toBe("string");
    // The cookie carries the session id + device prefs (locale/cloud), not the run.
    const ck = T.readCookieState();
    expect(ck.sid).toBeTruthy();
    expect(ck.locale).toBe(T.I18N.locale);
  });

  it("readSnapshot returns a valid save that restores the run (parity with file/cloud)", () => {
    T.state.coins = 777;
    T.player.inventory = [];
    T.bagAdd(T.player, "stone", 4);
    S.flush();
    const snap = S.readSnapshot();
    expect(snap).toBeTruthy();
    expect(T.validateSave(snap)).toBe(true);
    // The session payload is identical to a direct serializeGame() (bar the
    // wall-clock `savedAt` stamp) — so the existing SAVE_VERSION migration
    // applies to the auto-session exactly as it does to file/cloud saves.
    const strip = (o) => { const c = Object.assign({}, o); delete c.savedAt; return JSON.stringify(c); };
    expect(strip(snap)).toBe(strip(T.serializeGame()));

    // Drift the live state away, then restore from the auto-persisted snapshot.
    T.state.coins = 0;
    T.player.inventory = [];
    T.zoneManager._swap(T.state.zoneId, "shore", T.ZONE_BY_ID.shore);
    T.applySave(snap);
    expect(T.state.coins).toBe(777);
    expect(T.bagCount(T.player, "stone")).toBe(4);
    step(3);
    expect(isFinite(T.player.position.x)).toBe(true);
  });

  it("does not persist while a restore is in flight (_restoring guard)", () => {
    lsStub.clear();
    S._restoring = true;
    expect(S.flush()).toBe(false);
    expect(lsStub.getItem(T.SESSION_KEY)).toBe(null);
    S._restoring = false;
  });

  it("mark + tick flushes once the debounce window elapses", () => {
    lsStub.clear();
    S.sched = { dirty: false, force: false, queuedAt: 0 };
    S.mark();                 // a key beat
    expect(S.sched.dirty).toBe(true);
    S.sched.queuedAt = 0;     // pin the queue time so the window is provably elapsed
    S.tick(T.SESSION_DEBOUNCE_MS + 1);
    expect(lsStub.getItem(T.SESSION_KEY)).toBeTruthy();
    expect(S.sched.dirty).toBe(false);
  });

  it("clearSnapshot wipes the run; clearAll also forgets the sign-in", () => {
    installCookieJar();
    S.flush();
    S.rememberAuth("lily@example.com");
    expect(S.hasSnapshot()).toBe(true);
    expect(S.authHint()).toBeTruthy();
    S.clearAll();
    expect(S.hasSnapshot()).toBe(false);
    expect(S.authHint()).toBe(null);
  });
});

describe("Session.rememberAuth / forgetAuth — durable sign-in hint", () => {
  it("remembers the opt-in and forgets it on sign-out", () => {
    installCookieJar();
    S.forgetAuth();
    expect(S.authHint()).toBe(null);
    S.rememberAuth("lily@example.com");
    const hint = S.authHint();
    expect(hint && hint.optedIn).toBe(true);
    expect(T.silentAuthDecision(hint).attempt).toBe(true);
    S.forgetAuth();
    expect(S.authHint()).toBe(null);
    expect(T.silentAuthDecision(S.authHint()).attempt).toBe(false);
  });
});
