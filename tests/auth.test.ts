import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { config, proxy } from "@/proxy";

// Throwaway values for tests only; real values live in .env.local / Vercel, never in git.
const env = { AUTH_USERNAME: "tester", SESSION_SECRET: "test-only-secret-that-is-long-enough-123" };
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterEach(() => { for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt:16384:8:1:/);
    expect(hash).not.toContain("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password!!", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same password 1")).not.toBe(await hashPassword("same password 1"));
  });

  it("rejects a malformed hash", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});

describe("session token", () => {
  it("round-trips for the configured user", async () => {
    expect(await verifySessionToken(await createSessionToken("tester"))).toBe(true);
  });

  it("rejects another username, a tampered token and a missing token", async () => {
    expect(await verifySessionToken(await createSessionToken("someone-else"))).toBe(false);
    const t = await createSessionToken("tester");
    expect(await verifySessionToken(t.slice(0, -2) + (t.endsWith("A") ? "BB" : "AA"))).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const t = await createSessionToken("tester");
    process.env.SESSION_SECRET = "a-different-secret-that-is-also-long-enough";
    expect(await verifySessionToken(t)).toBe(false);
  });
});

describe("route protection", () => {
  const req = (path: string, cookie?: string) =>
    new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });

  it("redirects pages to /login without a session", async () => {
    const res = await proxy(req("/first-pick/bot"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("returns 401 for API routes without a session", async () => {
    expect((await proxy(req("/api/anything"))).status).toBe(401);
  });

  it("lets a valid session through", async () => {
    const res = await proxy(req("/", await createSessionToken("tester")));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not trust a forged cookie", async () => {
    expect((await proxy(req("/", "forged.token.value"))).status).toBe(307);
  });

  it("protects everything except login and static assets", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const p of ["/", "/pro-drafts", "/meta", "/api/logout", "/geng"]) expect(re.test(p), p).toBe(true);
    for (const p of ["/login", "/api/login", "/_next/static/x.js"]) expect(re.test(p), p).toBe(false);
  });
});
