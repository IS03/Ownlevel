import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import {
  OAUTH_PREVIEW_ASSETS,
  OAUTH_PREVIEW_ROUTES,
} from "./lib/security/oauth-preview-lockdown";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: mocks.updateSession,
}));

import {
  bypassesSessionProxy,
  config,
  proxy,
  requiresSessionProxy,
  SESSION_PROXY_PATH_PREFIXES,
} from "./proxy";

describe("session proxy routing", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("OWNLEVEL_OAUTH_PREVIEW_LOCKDOWN", undefined);
    mocks.updateSession.mockReset();
    mocks.updateSession.mockResolvedValue(NextResponse.next());
  });

  afterEach(() => vi.unstubAllEnvs());

  it("bypasses Supabase session handling for the ChatGPT integration and preserves Authorization", async () => {
    const authorization = "Bearer ownlevel_test";
    const request = new NextRequest(
      "https://www.ownlevel.fit/api/integrations/chatgpt/meals",
      { headers: { authorization } },
    );

    const response = await proxy(request);

    expect(bypassesSessionProxy(request.nextUrl.pathname)).toBe(true);
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(request.headers.get("authorization")).toBe(authorization);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-authorization")).toBeNull();
  });

  it("keeps protected app pages behind Supabase session handling", async () => {
    const request = new NextRequest("https://www.ownlevel.fit/today");

    await proxy(request);

    expect(bypassesSessionProxy(request.nextUrl.pathname)).toBe(false);
    expect(mocks.updateSession).toHaveBeenCalledOnce();
    expect(mocks.updateSession).toHaveBeenCalledWith(request);
  });

  it.each([
    "/home",
    "/today",
    "/progress",
    "/calendar",
    "/train",
    "/train/exercises",
    "/settings/account",
    "/oauth/consent",
  ])("keeps %s in the authenticated proxy boundary", (pathname) => {
    expect(requiresSessionProxy(pathname)).toBe(true);
  });

  it.each([
    "/sw.js",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/icons/icon-192.png",
    "/_next/static/chunk.js",
    "/_next/image",
    "/auth/callback",
    "/api/integrations/chatgpt/status",
    "/mcp",
    "/.well-known/oauth-protected-resource/mcp",
  ])("bypasses auth for public resource %s", async (pathname) => {
    const request = new NextRequest(`https://www.ownlevel.fit${pathname}`);

    await proxy(request);

    expect(requiresSessionProxy(pathname)).toBe(false);
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  const EVERY_PATH = ["/", "/home", "/api/other", "/api/mobile/v1/training", "/sw.js", "/file.png", "/_next/static/chunk.js", "/_next/image",
    "/.well-known/oauth-protected-resource/mcp", "/mcp", "/api/integrations/chatgpt/meals", "/auth/callback"];
  const runs = (url: string, host: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url, headers: { host } });

  it.each(["gymapp-git-feature-team.vercel.app", "gymapp-abc123-team.vercel.app", "localhost:3000", "ownlevel.fit.example.com", "evilownlevel.fit"])(
    "off the production domain (%s) it covers every request, so APIs and static files cannot bypass the preview lockdown", (host) => {
      for (const url of EVERY_PATH) expect(runs(url, host)).toBe(true);
    });
  it.each(["www.ownlevel.fit", "ownlevel.fit"])("on %s it runs only where the session refresh happens", (host) => {
    for (const url of ["/", "/login", "/home", "/home/x", "/today", "/history/2026-10-01", "/settings", "/train/history", "/progress", "/calendar", "/oauth/consent"]) {
      expect(requiresSessionProxy(url)).toBe(true);
      expect(runs(url, host)).toBe(true);
    }
    for (const url of ["/api/mobile/v1/training", "/api/mobile/v1/home", "/api/other", "/sw.js", "/_next/static/chunk.js", "/_next/image", "/mcp", "/auth/callback", "/homework", "/privacy"]) {
      expect(requiresSessionProxy(url)).toBe(false);
      expect(runs(url, host)).toBe(false);
    }
  });
  it("lists every session prefix in the matcher", () => {
    for (const prefix of SESSION_PROXY_PATH_PREFIXES) expect(config.matcher).toContain(`${prefix}/:path*`);
  });
});

describe("opt-in Vercel OAuth preview lockdown", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("OWNLEVEL_OAUTH_PREVIEW_LOCKDOWN", "true");
    mocks.updateSession.mockReset();
    mocks.updateSession.mockResolvedValue(NextResponse.next());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("has exactly the approved OAuth/MCP routes, with no product or revocation surface", () => {
    expect(Object.keys(OAUTH_PREVIEW_ROUTES)).toEqual([
      "/mcp", "/mcp/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp",
      "/oauth/consent", "/login", "/auth/callback", "/api/oauth/decision",
      "/api/integrations/chatgpt/meals",
    ]);
    expect(OAUTH_PREVIEW_ASSETS).toEqual([
      "/favicon.ico", "/icon.svg", "/apple-icon.png",
      "/brand/logo/isotipo-claro.png", "/brand/logo/isotipo-oscuro.png",
    ]);
  });

  const deniedPaths = [
    "/", "/home", "/today", "/train", "/train/exercises", "/history",
    "/progress", "/calendar", "/settings", "/settings/application",
    "/api/oauth/revoke", "/api/mobile/v1/meals", "/api/integrations/chatgpt/status",
    "/api/integrations/chatgpt/meals/extra", "/api/unknown", "/mcp/extra",
    "/login/extra", "/oauth/consent/extra", "/auth/callback/extra", "/unknown.png",
    "/sw.js", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml",
    "/brand/icon-512.png", "/_next/anything", "/_next/static-extra/private.js",
    "/_next/data/build/home.json", "/_next/image?url=%2Fhome&w=128&q=75",
    "/_next/image?url=%2Fapi%2Fprivate&w=128&q=75",
    "/_next/image?url=https%3A%2F%2Fwww.ownlevel.fit%2Fhome&w=128&q=75",
    "/_next/image?url=%2Fbrand%2Flogo%2Fisotipo-claro.png&url=%2Fhome&w=128&q=75",
    "/oauth%2fconsent", "/_next/static/%2e%2e/private",
  ];

  it.each(deniedPaths)("blocks %s before auth or rendering, including prefetch/RSC requests", async (path) => {
    const response = await proxy(new NextRequest(`https://preview.vercel.app${path}`, {
      headers: { RSC: "1", "next-router-prefetch": "1", purpose: "prefetch" },
    }));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-ownlevel-preview-lockdown")).toBe("blocked");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it.each(Object.entries(OAUTH_PREVIEW_ROUTES).flatMap(([path, methods]) =>
    methods.map((method) => ({ path, method })),
  ))("allows $method $path without replacing endpoint authentication", async ({ path, method }) => {
    const request = new NextRequest(`https://preview.vercel.app${path}?authorization_id=test`, {
      method, headers: { authorization: "Bearer test-user-token" },
    });
    const response = await proxy(request);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(request.headers.get("authorization")).toBe("Bearer test-user-token");
    expect(response.headers.get("x-middleware-request-authorization")).toBeNull();
    expect(mocks.updateSession).toHaveBeenCalledTimes(requiresSessionProxy(path) ? 1 : 0);
  });

  it.each([
    ...OAUTH_PREVIEW_ASSETS,
    "/_next/static/chunks/app/(auth)/login/page.js", "/_next/static/css/login.css",
    "/_next/static/media/font.woff2",
    "/_next/image?url=%2Fbrand%2Flogo%2Fisotipo-claro.png&w=128&q=75",
    "/_next/image?url=%2Fbrand%2Flogo%2Fisotipo-oscuro.png&w=128&q=75",
  ])("allows only required read-only assets: %s", async (path) => {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`https://preview.vercel.app${path}`, { method }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it.each([
    ["/login", "POST"], ["/oauth/consent", "POST"], ["/auth/callback", "POST"],
    ["/mcp/oauth-protected-resource", "POST"], ["/api/oauth/decision", "GET"],
    ["/api/integrations/chatgpt/meals", "GET"], ["/mcp", "PUT"],
    ["/_next/static/chunk.js", "POST"], ["/favicon.ico", "POST"],
    ["/api/unknown", "OPTIONS"],
  ])("does not expose unused methods: %s %s", async (path, method) => {
    expect((await proxy(new NextRequest(`https://preview.vercel.app${path}`, { method }))).status).toBe(404);
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it.each([
    ["1", "production", "true"], ["1", "development", "true"],
    [undefined, "preview", "true"], ["0", "preview", "true"],
    ["1", "preview", undefined], ["1", "preview", "false"], ["1", "preview", "TRUE"],
  ])("preserves existing behavior outside explicit Vercel Preview opt-in (%s, %s, %s)", async (vercel, environment, flag) => {
    vi.stubEnv("VERCEL", vercel);
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("OWNLEVEL_OAUTH_PREVIEW_LOCKDOWN", flag);
    for (const path of [...deniedPaths, ...Object.keys(OAUTH_PREVIEW_ROUTES)]) {
      mocks.updateSession.mockClear();
      const request = new NextRequest(`https://www.ownlevel.fit${path}`);
      const response = await proxy(request);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-ownlevel-preview-lockdown")).toBeNull();
      expect(mocks.updateSession).toHaveBeenCalledTimes(requiresSessionProxy(request.nextUrl.pathname) ? 1 : 0);
    }
  });
});
