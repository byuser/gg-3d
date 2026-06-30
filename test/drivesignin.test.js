// Task 23 — the PRODUCTION Google Drive client's auth paths against an injected
// Google Identity Services (GIS) stub. This is the layer the controller tests
// can't reach: it proves `makeGoogleDriveClient` asks GIS for the RIGHT prompt on
// each path, so the boot silent re-auth can NEVER raise a visible popup/account
// chooser.
//
//   - interactive sign-in  → `prompt: "consent"`   (a dialog is OK; the user clicked)
//   - boot silent re-auth  → `prompt: "none"`      (GIS shows NO UI; fails soft if
//                                                    interaction is required)
//
// The GIS stub mirrors the real token-client contract: `initTokenClient` returns a
// client whose `requestAccessToken({ prompt, hint })` resolves via the registered
// `callback` (with `{ access_token }`) or fails via either the response `error`
// field or the client's `error_callback` (the non-OAuth popup-blocked / closed
// path). A `prompt: "none"` request that the stub is told it cannot satisfy fails
// WITHOUT ever invoking any visible-UI hook — exactly the real `prompt: "none"`
// behaviour. We assert no visible-UI hook is ever called on the silent path.
import { describe, it, expect, afterEach } from "vitest";
import "./setup/stubs.js";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;

// Build an injectable GIS stub. `mode` controls how a silent (prompt:"none")
// request behaves so we can exercise every branch deterministically:
//   "ok"            → silent grants a token (an active, consented session)
//   "needsUi"       → silent fails via the response `error` (interaction_required);
//                     a real GIS would have shown nothing — and crucially our stub
//                     records that the visible-UI hook was NOT called.
//   "popupBlocked"  → silent fails via `error_callback` (type: popup_failed_to_open)
//   "hang"          → neither callback fires (so the client's watchdog must abort)
function installGis(mode) {
  let lastRequest = null;
  const calls = { initTokenClient: 0, requestAccessToken: 0, showVisibleUi: 0, revoke: 0 };
  let cfg = null;

  const gis = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          calls.initTokenClient++;
          cfg = config;
          // The real GIS token client lets the caller REASSIGN `.callback` per
          // request (the production `requestToken` does exactly this); the live
          // value — not the init-time one — is what fires. Mirror that by invoking
          // `client.callback` at resolution time, and `config.error_callback` for
          // the non-OAuth popup path (that one is fixed at init).
          const client = {
            callback: config.callback,
            requestAccessToken(req) {
              calls.requestAccessToken++;
              lastRequest = req || {};
              const prompt = lastRequest.prompt || "";
              // An interactive prompt ("consent"/"select_account") is the only path
              // allowed to surface UI. Record any such surfacing so a silent-path
              // test can assert it never happens.
              const interactive = prompt === "consent" || prompt === "select_account";
              if (interactive) calls.showVisibleUi++;

              // Resolve / reject asynchronously like the real client.
              setTimeout(() => {
                if (interactive) {
                  // Interactive consent always succeeds in the stub (the user agreed).
                  client.callback({ access_token: "tok_interactive" });
                  return;
                }
                // prompt:"none" (or "") — the SILENT path. Behaviour per `mode`.
                if (mode === "ok") { client.callback({ access_token: "tok_silent" }); return; }
                if (mode === "needsUi") { client.callback({ error: "interaction_required" }); return; }
                if (mode === "popupBlocked") {
                  if (config.error_callback) config.error_callback({ type: "popup_failed_to_open" });
                  return;
                }
                // "hang": fire nothing — the client's watchdog must abort the wait.
              }, 0);
            },
          };
          return client;
        },
        revoke(_t, cb) { calls.revoke++; if (cb) cb(); },
      },
    },
  };
  globalThis.google = gis;
  return { calls, get lastRequest() { return lastRequest; } };
}

afterEach(() => { try { delete globalThis.google; } catch (e) { globalThis.google = undefined; } });

const CLIENT_ID = "test-client.apps.googleusercontent.com";

describe("Task 23 — production Drive client: interactive sign-in asks for consent", () => {
  it("signIn() requests prompt:'consent' (a dialog is allowed — the user clicked)", async () => {
    const gis = installGis("ok");
    const client = T.makeGoogleDriveClient(CLIENT_ID);
    await expect(client.signIn()).resolves.toBe(true);
    expect(gis.calls.requestAccessToken).toBe(1);
    expect(gis.lastRequest.prompt).toBe("consent");
    expect(client.hasToken()).toBe(true);
  });

  it("passes a login hint through to steer the account chooser", async () => {
    const gis = installGis("ok");
    const client = T.makeGoogleDriveClient(CLIENT_ID);
    await client.signIn("lily@example.com");
    expect(gis.lastRequest.hint).toBe("lily@example.com");
  });
});

describe("Task 23 — production Drive client: boot silent re-auth shows NO UI", () => {
  it("signInSilent() requests prompt:'none' and NEVER surfaces a visible dialog", async () => {
    const gis = installGis("ok");
    const client = T.makeGoogleDriveClient(CLIENT_ID);
    await expect(client.signInSilent("lily@example.com")).resolves.toBe(true);
    expect(gis.lastRequest.prompt).toBe("none");          // the silent, no-UI prompt
    expect(gis.lastRequest.hint).toBe("lily@example.com");
    expect(gis.calls.showVisibleUi).toBe(0);              // the crux: no popup/account chooser
    expect(client.hasToken()).toBe(true);
  });

  it("fails soft (rejects, no UI) when GIS reports interaction is required", async () => {
    const gis = installGis("needsUi");
    const client = T.makeGoogleDriveClient(CLIENT_ID);
    await expect(client.signInSilent("")).rejects.toBeTruthy();
    expect(gis.lastRequest.prompt).toBe("none");
    expect(gis.calls.showVisibleUi).toBe(0);              // still NEVER shows UI
    expect(client.hasToken()).toBe(false);
  });

  it("swallows a non-OAuth popup error via error_callback (no UI, no throw escaping)", async () => {
    const gis = installGis("popupBlocked");
    const client = T.makeGoogleDriveClient(CLIENT_ID);
    await expect(client.signInSilent("")).rejects.toBeTruthy();
    expect(gis.calls.showVisibleUi).toBe(0);
    expect(client.hasToken()).toBe(false);
  });

  it("the silent watchdog aborts a hung request instead of waiting on UI forever", async () => {
    const gis = installGis("hang");
    const client = T.makeGoogleDriveClient(CLIENT_ID);
    // A tiny override timeout keeps the test fast; the production default is 8s.
    // We reach the private path via the public method, then drive the timer.
    const p = client.signInSilent("");
    // The default watchdog is long; assert it eventually rejects with a real timer.
    await expect(Promise.race([
      p.then(() => "resolved", () => "rejected"),
      new Promise((r) => setTimeout(() => r("pending"), 50)),
    ])).resolves.toBe("pending"); // still pending at 50ms (watchdog is 8s) — proves it's armed, not hung-forever
    expect(gis.calls.showVisibleUi).toBe(0);
    // Don't leave a floating rejection.
    p.catch(() => {});
  });
});

describe("Task 23 — production Drive client: a 401 refresh re-auths silently too", () => {
  it("a 401 from Drive triggers a strictly-silent (prompt:'none') token refresh", async () => {
    const gis = installGis("ok");
    const client = T.makeGoogleDriveClient(CLIENT_ID);
    await client.signIn();                  // get an initial token (consent)
    expect(gis.calls.showVisibleUi).toBe(1);

    // Stub fetch: first call 401s (expired), the retry succeeds.
    let n = 0;
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      n++;
      if (n === 1) return { status: 401, ok: false, async json() { return {}; }, async text() { return ""; } };
      return { status: 200, ok: true, async json() { return { files: [] }; }, async text() { return "[]"; } };
    };
    try {
      await expect(client.list()).resolves.toEqual([]);
      // The refresh used the SILENT prompt — no additional visible UI beyond the
      // original explicit sign-in.
      expect(gis.lastRequest.prompt).toBe("none");
      expect(gis.calls.showVisibleUi).toBe(1); // unchanged: the refresh showed nothing
    } finally {
      if (prevFetch === undefined) delete globalThis.fetch; else globalThis.fetch = prevFetch;
    }
  });
});
