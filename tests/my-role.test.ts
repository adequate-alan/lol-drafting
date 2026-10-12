// My Role (alan, 2026-10-12): the role I play in Draft Room, linked to Pro Builds. Links carry the champion, role, newest
// patch with recorded builds and the whole draft; only a confirmed lock of my own role opens Pro Builds, and only with
// the preference on. Nothing here changes a recommendation.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBuildIndex } from "@/lib/data";
import { buildsEntry, cleanFrom, draftHref, draftQuery, myBuildsHref, opensBuilds, parseRole } from "@/lib/my-role";
import { comparePatch, patchLabel } from "@/lib/patch";
import { ROLES } from "@/lib/schema";

const index = getBuildIndex();
const draft = { TOP: "aatrox", BOT: "jhin", SUPPORT: "bard" };
const vs = "mid:ahri,bot:kaisa";

describe("Draft Room → Pro Builds links", () => {
  it("carries every pick, the enemy row, the role being picked and the filter", () => {
    const q = draftQuery({ draft, vs, focus: "MID", filter: "pro" });
    expect(q).toBe("top=aatrox&bot=jhin&support=bard&vs=mid:ahri,bot:kaisa&focus=mid&filter=pro");
    // A locked focus and the default filter add nothing.
    expect(draftQuery({ draft, focus: "BOT", filter: "all" })).toBe("top=aatrox&bot=jhin&support=bard");
  });

  it("restores exactly that draft on the way back, and nothing else", () => {
    const q = draftQuery({ draft, vs, focus: "MID", filter: "pro" });
    expect(draftHref(q)).toBe(`/?${q}`);
    expect(draftHref(`${q}&evil=1&mid=<script>`)).toBe(`/?${q}`);
    expect(draftHref("")).toBe("/");
    expect(cleanFrom("javascript:alert(1)")).toBe("");
  });

  it("opens the champion and role on the newest patch with recorded builds", () => {
    const e = [...index].sort((a, b) => b.games - a.games)[0];
    const href = myBuildsHref(index, e.champion, e.role, "bot=jhin");
    const u = new URL(href, "https://x.test");
    expect(u.pathname).toBe("/pro-builds/");
    expect(u.searchParams.get("champion")).toBe(e.champion);
    expect(u.searchParams.get("role")).toBe(e.role);
    expect(u.searchParams.get("patch")).toBe(patchLabel(e.latest));
    expect(u.searchParams.get("patch")).toMatch(/^26\./);
    expect(u.searchParams.get("from")).toBe("bot=jhin");
    // latest really is the newest patch recorded for that champion and role
    expect(index.filter((x) => x.champion === e.champion && x.role === e.role).every((x) => comparePatch(e.latest, x.latest) >= 0)).toBe(true);
  });

  it("keeps each role of a champion with builds in several roles apart", () => {
    const multi = index.find((e) => index.some((x) => x.champion === e.champion && x.role !== e.role));
    expect(multi).toBeDefined();
    for (const e of index.filter((x) => x.champion === multi!.champion)) {
      expect(new URL(myBuildsHref(index, e.champion, e.role, ""), "https://x.test").searchParams.get("role")).toBe(e.role);
      expect(buildsEntry(index, e.champion, e.role)).toBe(e);
    }
  });

  it("links a champion without builds to the empty state, with no patch", () => {
    const u = new URL(myBuildsHref(index, "teemo-not-recorded", "BOT", "bot=teemo-not-recorded"), "https://x.test");
    expect(u.searchParams.get("patch")).toBeNull();
    expect(u.searchParams.get("champion")).toBe("teemo-not-recorded");
  });
});

describe("automatic Pro Builds on lock", () => {
  const base = { auto: true, champion: "jhin", hasBuilds: true };
  it("opens for a confirmed lock in my role, for each of the five roles", () => {
    for (const r of ROLES) {
      expect(opensBuilds({ ...base, myRole: r, role: r })).toBe(true);
      for (const other of ROLES.filter((x) => x !== r)) expect(opensBuilds({ ...base, myRole: r, role: other })).toBe(false);
    }
  });
  it("never opens with the preference off, without a role, on a removal, a re-lock of the same champion, or without builds", () => {
    expect(opensBuilds({ ...base, auto: false, myRole: "BOT", role: "BOT" })).toBe(false);
    expect(opensBuilds({ ...base, myRole: undefined, role: "BOT" })).toBe(false);
    expect(opensBuilds({ ...base, champion: undefined, myRole: "BOT", role: "BOT", previous: "jhin" })).toBe(false);
    expect(opensBuilds({ ...base, myRole: "BOT", role: "BOT", previous: "jhin" })).toBe(false);
    expect(opensBuilds({ ...base, hasBuilds: false, myRole: "BOT", role: "BOT" })).toBe(false);
  });
  it("opens again when I change my locked champion", () => {
    expect(opensBuilds({ ...base, champion: "kaisa", myRole: "BOT", role: "BOT", previous: "jhin" })).toBe(true);
  });
  it("reads a stored role in any case and ignores anything else", () => {
    expect(parseRole("bot")).toBe("BOT");
    expect(parseRole("SUPPORT")).toBe("SUPPORT");
    expect(parseRole("adc")).toBeUndefined();
    expect(parseRole(null)).toBeUndefined();
  });
  it("navigates only from a lock in Draft Room (no hover, search or preview path)", () => {
    const src = readFileSync(join(process.cwd(), "components/DraftRoom.tsx"), "utf8");
    const pushes = src.split("router.push(").length - 1;
    expect(pushes).toBe(1);
    const lock = src.slice(src.indexOf("const lock = "), src.indexOf("const lockEnemy"));
    expect(lock).toContain("router.push(");
    expect(lock).toContain("opensBuilds(");
  });
});
