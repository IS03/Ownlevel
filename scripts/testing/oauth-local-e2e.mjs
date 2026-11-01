// Disposable Supabase CLI stack only. Never accepts a hosted project or secrets.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createRemoteJWKSet, jwtVerify } from "jose";

const local = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.120.0", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(local.API_URL, "http://127.0.0.1:55421", "Refusing non-disposable Supabase");
const base = "http://127.0.0.1:3007";
const resource = "https://www.ownlevel.fit/mcp";
const issuer = `${local.API_URL}/auth/v1`;
const redirect = `${base}/synthetic-oauth-callback`;
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let userId, clientId, next;
const cookies = new Map();
const browser = createServerClient(local.API_URL, local.ANON_KEY, {
  cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)) },
});
function cookieHeader() { return [...cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_ownlevel-oauth-mcp", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function checked(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message}`);
  return result.data;
}
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (next.exitCode !== null) throw new Error("Local Next.js server exited");
    try { if ((await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Local Next.js server did not become ready");
}
async function tokenRequest(values) {
  const response = await fetch(`${issuer}/oauth/token`, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: local.ANON_KEY }, body: new URLSearchParams(values) });
  const body = await response.json();
  assert.equal(response.status, 200, `Token exchange failed: ${body.error ?? body.msg ?? response.status}`);
  return body;
}
async function api(token, meal) {
  const response = await fetch(`${base}/api/integrations/chatgpt/meals`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(meal) });
  return { status: response.status, body: await response.json() };
}
let rpcId = 0;
async function mcp(method, params, token) {
  const response = await fetch(`${base}/mcp`, { method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, ...(params ? { params } : {}) }) });
  assert.equal(response.status, 200, `MCP HTTP status ${response.status}`);
  const body = await response.json();
  assert.equal(body.error, undefined, `MCP protocol error: ${body.error?.message}`);
  return body.result;
}

try {
  const user = checked(await admin.auth.admin.createUser({
    email: `oauth-local-${randomBytes(8).toString("hex")}@example.invalid`,
    password: randomBytes(32).toString("base64url"), email_confirm: true,
  }), "Create synthetic user").user;
  userId = user.id;
  // A separate synthetic password is assigned only inside this disposable stack.
  const password = randomBytes(32).toString("base64url");
  checked(await admin.auth.admin.updateUserById(userId, { password }), "Set local password");
  const login = checked(await browser.auth.signInWithPassword({ email: user.email, password }), "Local browser login");
  assert.equal(login.session.user.id, userId);
  const webClaims = checked(await browser.auth.getClaims(), "Verify ordinary session").claims;
  assert.equal(webClaims.aud, "authenticated");
  assert.equal(webClaims.client_id, undefined);
  assert.equal(webClaims.ownlevel_permissions, undefined);

  const client = checked(await admin.auth.admin.oauth.createClient({ client_name: "OWNLEVEL synthetic MCP test",
    redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }), "Create public PKCE client");
  clientId = client.client_id ?? client.id;
  assert.match(clientId, /^[0-9a-f-]{36}$/);
  sql(`insert into ownlevel_integrations.oauth_clients(client_id,resource,enabled) values ('${clientId}','${resource}',true);`);

  next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3007"], {
    env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY, SUPABASE_SECRET_KEY: local.SECRET_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY, OWNLEVEL_OAUTH_ENABLED: "true",
      OWNLEVEL_MCP_RESOURCE: resource, OWNLEVEL_LOCAL_API_ORIGIN: base }, stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  next.stdout.on("data", (data) => { serverLog = (serverLog + data).slice(-8000); });
  next.stderr.on("data", (data) => { serverLog = (serverLog + data).slice(-8000); });
  next.on("exit", (code) => { if (code && code !== 0) console.error("Local Next.js server failed (inspect locally; no credentials printed)."); });
  await waitReady();
  const metadata = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
  assert.equal(metadata.resource, resource);
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  assert.deepEqual(metadata.scopes_supported, ["openid"]);
  // CLI Kong exposes Auth under /auth/v1; hosted Supabase additionally exposes
  // the RFC path-insertion discovery URL at the public gateway.
  const discovery = await (await fetch(`${issuer}/.well-known/oauth-authorization-server`)).json();
  assert.equal(discovery.issuer, issuer);

  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const authorize = new URL(`${issuer}/oauth/authorize`);
  authorize.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code",
    scope: "openid", resource, state, code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url") }).toString();
  const authResponse = await fetch(authorize, { redirect: "manual" });
  assert.equal(authResponse.status, 302);
  const consentUrl = authResponse.headers.get("location");
  const authorizationId = new URL(consentUrl).searchParams.get("authorization_id");
  assert.ok(authorizationId);
  const page = await fetch(consentUrl, { headers: { Cookie: cookieHeader() }, redirect: "manual" });
  assert.equal(page.status, 200, "OWNLEVEL consent page must render for the authenticated user");
  assert.match(await page.text(), /Autorizar registro de comidas/);
  const decision = await fetch(`${base}/api/oauth/decision`, { method: "POST", redirect: "manual",
    headers: { Cookie: cookieHeader(), Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ authorization_id: authorizationId, decision: "approve" }) });
  assert.equal(decision.status, 303, decision.status === 303 ? "Consent accepted" : `Consent denied: ${await decision.text()}`);
  const callback = new URL(decision.headers.get("location"));
  assert.equal(callback.origin + callback.pathname, redirect, "Consent must return to the registered client, not an OWNLEVEL error page");
  assert.equal(callback.searchParams.get("state"), state);
  const code = callback.searchParams.get("code");
  assert.ok(code);
  assert.equal(sql(`select resource from auth.oauth_authorizations where authorization_id='${authorizationId}';`), resource);
  const tokens = await tokenRequest({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirect,
    code, code_verifier: verifier, resource });
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(tokens.access_token, jwks, { issuer, audience: resource });
  assert.equal(payload.sub, userId);
  assert.equal(payload.client_id, clientId);
  assert.deepEqual(payload.ownlevel_permissions, ["meals:write"]);
  console.log("PASS: local Authorization Code + PKCE, resource in authorize/exchange, issuer/JWKS, hook audience and permission");
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId, resource });
  const refreshedClaims = (await jwtVerify(refreshed.access_token, jwks, { issuer, audience: resource })).payload;
  assert.equal(refreshedClaims.ownlevel_grant_id, payload.ownlevel_grant_id);
  const token = refreshed.access_token;
  const initialized = await mcp("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "synthetic-local-test", version: "1.0.0" } });
  assert.equal(initialized.serverInfo.name, "ownlevel-meals");
  const toolList = await mcp("tools/list");
  assert.deepEqual(toolList.tools[0].securitySchemes, [{ type: "oauth2", scopes: ["openid"] }]);
  const unauthenticated = await mcp("tools/call", { name: "register_meal", arguments: {} });
  assert.equal(unauthenticated.isError, true);
  assert.ok(unauthenticated._meta["mcp/www_authenticate"][0].includes("resource_metadata"));
  const meal = { date: "2026-10-07", title: "Prueba OAuth local", description: "Datos sintéticos",
    calories: 650, protein_g: 50, carbs_g: 75, fat_g: null, consumed_now: false, idempotency_key: `local-${randomBytes(12).toString("hex")}` };
  const registered = await mcp("tools/call", { name: "register_meal", arguments: meal }, token);
  assert.equal(registered.isError, false, "Authenticated MCP must forward to the local canonical API");
  assert.equal(registered.structuredContent.created, true);
  const replay = await api(token, meal);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal((await api(token, { ...meal, user_id: userId })).status, 400);
  const duplicate = await api(token, { ...meal, idempotency_key: `${meal.idempotency_key}-dup` });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, "possible_duplicate");
  const forced = await api(token, { ...meal, idempotency_key: `${meal.idempotency_key}-dup`, force_duplicate: true });
  assert.equal(forced.status, 200);
  assert.equal(sql(`select count(*) from public.meal_entries where user_id='${userId}' and source_type='chatgpt';`), "2");
  assert.equal(sql(`select total_calories_consumed from public.day_logs where user_id='${userId}' and log_date='2026-10-07';`), "1300");
  console.log("PASS: MCP -> authenticated meal API -> meal_entries -> day_logs, unchanged idempotency/duplicates, forbidden user_id");
  const direct = await fetch(`${local.API_URL}/rest/v1/meal_entries?select=id`, { headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${token}` } });
  assert.ok(direct.status === 401 || direct.status === 403, "OAuth must not access the Data API directly");
  const ordinary = await fetch(`${local.API_URL}/rest/v1/meal_entries?select=id`, { headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${login.session.access_token}` } });
  assert.equal(ordinary.status, 200, "Normal web sessions must retain their existing table access");
  sql(`update ownlevel_integrations.oauth_clients set enabled=false where client_id='${clientId}';`);
  assert.equal((await api(token, meal)).status, 403, "A disabled client must fail immediately");
  sql(`update ownlevel_integrations.oauth_clients set enabled=true where client_id='${clientId}';`);
  const csrf = await fetch(`${base}/api/oauth/revoke`, { method: "POST", headers: { Cookie: cookieHeader(), Origin: "https://foreign.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }) });
  assert.equal(csrf.status, 403);
  const revoked = await fetch(`${base}/api/oauth/revoke`, { method: "POST", headers: { Cookie: cookieHeader(), Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }) });
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).ok, true);
  assert.equal((await api(token, meal)).status, 403, "Still-unexpired JWT must fail after revocation");
  const denied = await mcp("tools/call", { name: "register_meal", arguments: meal }, token);
  assert.equal(denied.isError, true);
  console.log("PASS: allowlist disable, CSRF defense, immediate DB revocation of unexpired JWT and direct Data API denial");
  const legacy = `ownlevel_${randomBytes(32).toString("base64url")}`;
  const legacyHash = createHash("sha256").update(legacy).digest("hex");
  sql(`insert into public.integration_api_tokens(user_id,token_hash,token_prefix,label,scope) values ('${userId}','${legacyHash}','ownlevel_local…','Synthetic legacy','meals:write');`);
  assert.equal((await api(legacy, { ...meal, title: "Legacy local", calories: 100, idempotency_key: `${meal.idempotency_key}-legacy` })).status, 200);
  console.log("PASS: legacy ownlevel_* token remains functional after OAuth revocation; ordinary browser token unchanged");
  console.log("NOT VERIFIED: real ChatGPT authorization/token exchange. This script is a synthetic local OAuth client, not ChatGPT.");
} catch (error) {
  // Print only the failing assertion/message, never tokens or the client object.
  console.error("Local OAuth test failed:", error.message);
  throw error;
} finally {
  if (next && next.exitCode === null) {
    next.kill("SIGTERM");
    await new Promise((resolve) => { next.once("exit", resolve); setTimeout(resolve, 5000).unref(); });
  }
  if (clientId) {
    sql(`delete from ownlevel_integrations.oauth_grants where client_id='${clientId}'; delete from ownlevel_integrations.oauth_clients where client_id='${clientId}';`);
    checked(await admin.auth.admin.oauth.deleteClient(clientId), "Clean up synthetic OAuth client");
  }
  if (userId) {
    const result = await admin.auth.admin.deleteUser(userId);
    // Historical OWNLEVEL triggers make Auth-admin cascades lack permissions
    // locally. Delete only this test's exact ID as postgres in the disposable DB.
    if (result.error) sql(`delete from auth.users where id='${userId}' and email like 'oauth-local-%@example.invalid';`);
  }
}
