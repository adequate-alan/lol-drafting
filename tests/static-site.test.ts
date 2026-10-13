// The site is a fully static GitHub Pages export: no server runtime, no login, no secrets, and the
// unfinished v2 model stays out of the pages.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import loadConfig from "@/next.config";
import { championIconUrl, ddragonKey } from "@/lib/champion-icons";
import { getChampions } from "@/lib/data";
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
  it("exports statically under the repository base path", async () => {
    const nextConfig = await loadConfig();
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

  it("maps every champion to a Data Dragon square icon", () => {
    for (const c of getChampions()) {
      expect(ddragonKey(c.id, c.name), c.id).toMatch(/^[A-Z][A-Za-z]+$/);
      expect(championIconUrl(c.id, c.name)).toMatch(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[\d.]+\/img\/champion\/[A-Za-z]+\.png$/);
    }
    expect(ddragonKey("kaisa", "Kai'Sa")).toBe("Kaisa");
    expect(ddragonKey("wukong", "Wukong")).toBe("MonkeyKing");
    expect(ddragonKey("renata-glasc", "Renata Glasc")).toBe("Renata");
    expect(ddragonKey("jarvan-iv", "Jarvan IV")).toBe("JarvanIV");
  });

  it("keeps the v2 model out of the site except the Comp Check diagnosis, the needs in the ranking, the weekly comp discovery and the top blind read", () => {
    // comp-summary: the Comp Check line on phones; top-blind: the kit read beside top draft usage; jungle-kits: kit facts for the enemy board at a jungle pick (both General Draft Logic)
    const allowed = ["components/CompCheck.tsx", "lib/comp-summary.ts", "lib/recommend.ts", "lib/comp-discovery.ts", "lib/top-blind.ts", "lib/jungle-kits.ts"];
    for (const f of source.filter((f) => !f.startsWith("lib/model-v2/") && !allowed.includes(f))) expect(read(f), f).not.toMatch(/model-v2/);
  });
});
