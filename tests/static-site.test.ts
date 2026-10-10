// The site is a fully static GitHub Pages export: no server runtime, no login, no secrets, and the
// unfinished v2 model stays out of the pages.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { BASE_PATH } from "@/lib/site";

const root = join(import.meta.dirname, "..");
function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const rel = join(dir, f);
    return statSync(join(root, rel)).isDirectory() ? files(rel) : [rel];
  });
}
const source = ["app", "components", "lib"].flatMap(files).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(join(root, f), "utf8");

describe("static GitHub Pages export", () => {
  it("exports statically under the repository base path", () => {
    expect(nextConfig.output).toBe("export");
    expect(BASE_PATH).toBe("/lol-drafting");
    expect(nextConfig.basePath).toBe(BASE_PATH);
    expect(nextConfig.trailingSlash).toBe(true);
  });

  it("has no middleware, proxy, API routes or server actions", () => {
    for (const f of ["proxy.ts", "middleware.ts", "app/api", "app/login"]) expect(existsSync(join(root, f)), f).toBe(false);
    for (const f of source) {
      expect(f, f).not.toMatch(/(^|\/)route\.tsx?$/);
      const text = read(f);
      expect(text, f).not.toMatch(/["']use server["']/);
      expect(text, f).not.toMatch(/from ["']next\/headers["']/);
      expect(text, f).not.toMatch(/force-dynamic/);
    }
  });

  it("reads URL filters in the browser, not from server searchParams", () => {
    for (const f of source.filter((f) => f.endsWith("page.tsx"))) expect(read(f), f).not.toMatch(/searchParams/);
  });

  it("has no server authentication left", () => {
    for (const f of [...source, "next.config.ts", "package.json"]) {
      expect(read(f), f).not.toMatch(/AUTH_USERNAME|AUTH_PASSWORD_HASH|SESSION_SECRET|jose|scrypt/);
    }
  });

  it("tracks no .env files", () => {
    const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
    expect(tracked.filter((f) => /(^|\/)\.env/.test(f))).toEqual([]);
  });

  it("keeps the unfinished v2 model out of the site", () => {
    for (const f of source.filter((f) => !f.startsWith("lib/model-v2/"))) expect(read(f), f).not.toMatch(/model-v2/);
  });
});
