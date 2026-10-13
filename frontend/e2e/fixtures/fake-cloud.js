// A signed-in account with no Supabase behind it: a session is seeded in
// localStorage and every request to the project is answered here. Anything
// else that is not this machine is aborted, so nothing reaches the network.
//
// The build takes the project's address from frontend/.env, and the session's
// storage key is derived from it, so the fake reads the same file. With no
// .env the app has no cloud mode at all and `cloudOrigin` is null: skip.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function projectOrigin() {
  try {
    const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
    const url = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export const cloudOrigin = projectOrigin();
const USER = "11111111-1111-4111-8111-111111111111";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION = {
  access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER, role: "authenticated" })}.fake`,
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "fake-refresh",
  user: { id: USER, aud: "authenticated", role: "authenticated", email: "fake@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z" },
};
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };

/** Sign the page in to a fake account holding `decks`. Returns the state the
 * test steers: `decks` (the account's rows), `deleteDelay` in ms, and
 * `auth`: "up" (refresh works), "down" (no connection) or "revoked" (the
 * refresh token is refused, which is a real sign-out). Call before goto. */
export async function fakeCloud(page, decks = []) {
  const state = { decks: decks.map((d) => ({ ...d })), deleteDelay: 0, auth: "up", authCalls: 0 };
  const key = `sb-${new URL(cloudOrigin).hostname.split(".")[0]}-auth-token`;

  // Lowest precedence: whatever no page route answered, and is not local, dies.
  await page.context().route("**/*", (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === "localhost" || hostname === "127.0.0.1" ? route.fallback() : route.abort();
  });
  await page.route(`${cloudOrigin}/rest/v1/decks**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(state.decks) });
    if (req.method() === "DELETE") {
      if (state.deleteDelay) await new Promise((r) => setTimeout(r, state.deleteDelay));
      const id = (new URL(req.url()).searchParams.get("id") || "").replace(/^eq\./, "");
      state.decks = state.decks.filter((d) => d.id !== id);
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    const body = JSON.parse(req.postData());
    const row = Array.isArray(body) ? body[0] : body;
    const saved = { id: row.id || randomUUID(), name: row.name, format: row.format, decklist_text: row.decklist_text, updated_at: row.updated_at };
    state.decks = [saved, ...state.decks.filter((d) => d.id !== saved.id)];
    return route.fulfill({ status: 201, headers: CORS, body: JSON.stringify(saved) });
  });
  await page.route(`${cloudOrigin}/auth/v1/**`, (route) => {
    state.authCalls++;
    if (state.auth === "up") return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(SESSION) });
    if (state.auth === "revoked") {
      return route.fulfill({ status: 400, headers: CORS, body: JSON.stringify({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }) });
    }
    return route.abort("internetdisconnected");
  });
  // Once only: after a sign-out a reload must stay signed out.
  await page.addInitScript(({ key, session }) => {
    if (localStorage.getItem("fake-cloud:seeded")) return;
    localStorage.setItem("fake-cloud:seeded", "1");
    localStorage.setItem(key, JSON.stringify({ ...session, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  }, { key, session: SESSION });
  return state;
}

export const hasSession = (page) =>
  page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")));
