import { test, expect } from "@playwright/test";

// Task 23 — Drive sign-in persists across reloads with NO unprompted dialog
// (real browser). The headless Vitest suites prove the controller gating and the
// production client's prompt choice in depth; this is the DOM/boot layer: with a
// stored opted-in hint and an injected Google Identity Services (GIS) client, the
// page must restore the signed-in state on load WITHOUT ever surfacing a visible
// account/consent dialog — and a clean (never-opted-in) load must make no GIS
// call at all.
//
// We inject a fake `google.accounts.oauth2` BEFORE any page script runs. It
// records every `requestAccessToken` and flags interactive prompts
// ("consent" / "select_account") as "would show UI". A `prompt: "none"` request
// (the boot silent path) resolves with a token and is recorded as NOT showing UI —
// exactly the real GIS contract. The spec then asserts the interactive-UI flag was
// never set on load.

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// Inject the fake GIS + a client id. `seedHint` writes the opted-in hint into the
// first-party cookie + its localStorage mirror so the boot silent path is armed.
async function installFakeGis(page, { seedHint }) {
  await page.addInitScript((seed) => {
    // A configured client id so CloudSave.available() is true.
    window.GG_GOOGLE_CLIENT_ID = "e2e-test-client.apps.googleusercontent.com";

    // Record GIS activity on a global the test can read back.
    const rec = (window.__GIS_REC__ = { requests: 0, interactive: 0, silent: 0, lastPrompt: null });

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            const client = {
              callback: config.callback,
              requestAccessToken(req) {
                req = req || {};
                rec.requests++;
                rec.lastPrompt = req.prompt || "";
                const interactive = req.prompt === "consent" || req.prompt === "select_account";
                if (interactive) rec.interactive++; else rec.silent++;
                // The silent (prompt:"none") path grants a token with NO UI; the
                // interactive path would (in reality) show a dialog — we don't, but
                // we record that it WAS requested so the assertion can catch a
                // regression.
                setTimeout(() => { client.callback({ access_token: "e2e_token" }); }, 0);
              },
            };
            return client;
          },
          revoke(_t, cb) { if (cb) cb(); },
        },
      },
    };

    if (seed) {
      // Mirror Session.rememberAuth("")'s storage: the gg3d_sess cookie + the
      // ck_gg3d_sess localStorage fallback, both carrying { auth: { optedIn:true } }.
      const payload = JSON.stringify({ auth: { optedIn: true, email: "" } });
      try { document.cookie = "gg3d_sess=" + encodeURIComponent(payload) + "; Path=/; SameSite=Lax"; } catch (e) {}
      try { localStorage.setItem("ck_gg3d_sess", payload); } catch (e) {}
    }
  }, seedHint);
}

async function expandCloud(page) {
  // The cloud panel is a collapsible sub-panel on the start screen.
  await page.locator('#overlay .sub-panel > summary:has-text("Cloud Saves")').click();
  await expect(page.locator("#cloudStatus")).toBeVisible();
}

test("with a stored hint, a reload restores the signed-in state and shows NO auth dialog", async ({ page }) => {
  const errors = watchErrors(page);
  await installFakeGis(page, { seedHint: true });

  await page.goto("/");
  await expandCloud(page);

  // The boot silent re-auth resolves shortly after load → the status flips to the
  // signed-in label with no click and no dialog.
  await expect(page.locator("#cloudStatus")).toHaveText("Signed in to Drive", { timeout: 15_000 });
  // The sign-in toggle now reads "Sign out" — confirms the controller really
  // considers us authenticated (the start-screen panel has no Save button; that
  // lives in pause / the Saves screen).
  await expect(page.locator("#cloudSignBtn")).toHaveText("Sign out");

  // The crux of Task 23 (defect a): GIS was asked for a token, but ONLY via the
  // silent (prompt:"none") path — the interactive consent/account-chooser dialog
  // was never requested on load.
  const rec = await page.evaluate(() => window.__GIS_REC__);
  expect(rec.requests).toBeGreaterThanOrEqual(1);
  expect(rec.silent).toBeGreaterThanOrEqual(1);
  expect(rec.lastPrompt).toBe("none");
  expect(rec.interactive).toBe(0); // NO visible dialog without a click

  expect(errors, `console errors during silent re-auth:\n${errors.join("\n")}`).toEqual([]);
});

test("a clean (never-opted-in) load makes NO GIS call and stays signed out", async ({ page }) => {
  const errors = watchErrors(page);
  await installFakeGis(page, { seedHint: false }); // configured, but no stored hint

  await page.goto("/");
  await expandCloud(page);

  // First-run experience: not signed in, and no dialog. Give the boot path a beat.
  await expect(page.locator("#cloudStatus")).toHaveText("Not signed in", { timeout: 15_000 });
  await page.waitForTimeout(1000);

  const rec = await page.evaluate(() => window.__GIS_REC__);
  expect(rec.requests).toBe(0);    // the decision gate refused → GIS untouched
  expect(rec.interactive).toBe(0); // and certainly no dialog

  expect(errors, `console errors on first-run load:\n${errors.join("\n")}`).toEqual([]);
});

test("the explicit Sign in button is the only path to an interactive dialog", async ({ page }) => {
  const errors = watchErrors(page);
  await installFakeGis(page, { seedHint: false });

  await page.goto("/");
  await expandCloud(page);
  // Signed out on load, no GIS yet.
  await expect(page.locator("#cloudStatus")).toHaveText("Not signed in", { timeout: 15_000 });
  expect((await page.evaluate(() => window.__GIS_REC__)).requests).toBe(0);

  // Click "Sign in with Google" → NOW an interactive consent request is made (the
  // only place a dialog is ever allowed), and we end up signed in.
  await page.locator("#cloudSignBtn").click();
  await expect(page.locator("#cloudStatus")).toHaveText("Signed in to Drive", { timeout: 15_000 });
  const rec = await page.evaluate(() => window.__GIS_REC__);
  expect(rec.interactive).toBe(1);
  expect(rec.lastPrompt).toBe("consent");

  expect(errors, `console errors during explicit sign-in:\n${errors.join("\n")}`).toEqual([]);
});
