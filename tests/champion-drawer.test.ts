// Champion drawer (alan, 2026-10-12): the scouting panel's pure helpers. Context-aware actions, the pairing detail's
// layers, the game detail's integrity (nothing filled in) and the links into the full pages. Browser-level checks of
// the same flows (tabs, nested pairing, Back, patch bars, context actions) run in scripts/smoke-pages.mjs after deploy.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDrawerIndex, drawerActions, gameDetail, pairingDetail, patchStats, proDraftHref, rolesOf, savedPartners, synergiesHref, type DrawerContext } from "@/lib/drawer";
import { buildPatchIndex } from "@/lib/patch-changes";
import { championIndex } from "@/lib/pro-builds";
import { priorityData, championHistory } from "@/lib/pro-priority";
import { withProAlternatives } from "@/lib/pro-alternatives";
import { draftsFromGames, sourcesFromGames } from "@/lib/pro-games";
import { newestGameFirst, withGameSides } from "@/lib/draft-side";
import { withoutConfirmed } from "@/lib/proposed";
import { Files, type Role } from "@/lib/schema";
import type { DrawerData } from "@/lib/data";

const raw = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", f), "utf8"));
const load = <F extends keyof typeof Files>(f: F) => Files[f].parse(raw(f)) as ReturnType<(typeof Files)[F]["parse"]>;

// The same assembly as lib/data.ts getDrawerData, without the server-only import.
function drawerData(): DrawerData {
  const proGames = load("pro-games.json");
  const stored = load("sources.json");
  const sources = Object.fromEntries([...stored, ...sourcesFromGames(proGames.games, stored)].map((s) => [s.id, s]));
  const botPairings = load("bot-pairings.json").map(withProAlternatives);
  const midJungle = load("mid-jungle.json").map(withProAlternatives);
  const topPicks = load("top.json");
  const proDrafts = newestGameFirst([...withGameSides(load("pro-drafts.json"), sources), ...draftsFromGames(proGames.games)]);
  const builds = load("pro-builds.json");
  const shells = load("comp-shells.json");
  return {
    champions: load("champions.json"), botPairings, midJungle, topPicks, proDrafts, pool: load("pool.json"), meta: load("meta.json"), sources,
    proposed: withoutConfirmed(load("proposed-synergy.json"), { botPairings, midJungle, topPicks }).records,
    priority: priorityData(load("meta.json"), proGames, load("pro-drafts.json")),
    patches: buildPatchIndex(load("patch-notes.json")),
    builds: championIndex(builds.builds, [...proGames.games, ...(builds.games ?? [])]),
    buildGames: [...new Set(builds.builds.map((b) => b.game))],
    shells: shells.map((s) => ({ id: s.id, name: s.name, kind: s.kind, slots: Object.fromEntries(Object.entries(s.slots).map(([r, v]) => [r, v.champion])) as Record<Role, string> })),
  };
}
const data = drawerData();
const index = buildDrawerIndex(data);
const caitlyn = { id: "caitlyn", role: "BOT" as Role };
const builds = data.builds.find((b) => b.champion === "caitlyn" && b.role === "BOT");

describe("context-aware actions", () => {
  const pick = { ...caitlyn, inPool: true, builds };
  it("never offers Use in Draft Room inside the Draft Room, and carries the draft to Pro Builds", () => {
    const a = drawerActions({ page: "draft", locked: ["caitlyn"], from: "bot=caitlyn&support=lulu" }, pick);
    expect(a.map((x) => x.label)).toEqual(["View Pro Builds", "View Synergies", "View in Champion Pool"]);
    expect(a[0].primary).toBe(true);
    expect(a[0].href).toBe("/pro-builds/?champion=caitlyn&role=BOT&from=bot%3Dcaitlyn%26support%3Dlulu");
  });
  it("leads with Use in Draft Room from the Champion Pool and Synergies, without a link to the page it is on", () => {
    expect(drawerActions({ page: "pool" }, pick).map((x) => x.label)).toEqual(["Use in Draft Room", "View Synergies", "View Pro Builds"]);
    expect(drawerActions({ page: "synergies" }, pick).map((x) => x.label)).toEqual(["Use in Draft Room", "View in Champion Pool", "View Pro Builds"]);
    expect(drawerActions({ page: "pool" }, pick)[0].href).toBe("/?bot=caitlyn");
  });
  it("leads with this game's build in Pro Drafts when the open game recorded builds, in the page's own panel", () => {
    const a = drawerActions({ page: "pro-drafts", game: 83459 }, { ...pick, gameHasBuilds: true, gameDraft: "golgg-83459-blue" });
    expect(a[0]).toEqual({ label: "Inspect this game's build", href: proDraftHref("golgg-83459-blue", "BOT"), primary: true });
    expect(drawerActions({ page: "pro-drafts", game: 83459 }, { ...pick, gameHasBuilds: true })[0].href).toBe("/pro-builds/?champion=caitlyn&role=BOT&game=83459");
    expect(drawerActions({ page: "pro-drafts" }, pick)[0].label).toBe("View Pro Builds");
  });
  it("drops the pool link for a champion outside the pool and never exceeds three actions", () => {
    for (const page of ["draft", "pool", "synergies", "comps", "meta", "pro-drafts", "pro-builds", "patch-notes", "geng", "pinned", "other"] as DrawerContext["page"][]) {
      const a = drawerActions({ page }, { id: "zaahen", role: "MID", inPool: false });
      expect(a.length).toBeLessThanOrEqual(3);
      expect(a.map((x) => x.label)).not.toContain("View in Champion Pool");
      expect(a.filter((x) => x.primary)).toHaveLength(a.length ? 1 : 0);
    }
  });
});

describe("pairing detail keeps the layers apart", () => {
  it("Caitlyn + Bard: a preferred saved pairing, alan's read, draft logic from attributes and recorded games with both", () => {
    const d = pairingDetail(caitlyn, { id: "bard", role: "SUPPORT" }, data, index);
    expect(d.saved).toMatchObject({ kind: "default" });
    expect(d.saved!.text).toMatch(/preferred support for Caitlyn/);
    expect(d.proposed).toBeUndefined();
    expect(d.read).toMatch(/Bard/);
    expect(d.gives.length).toBeGreaterThan(0);
    expect(d.games.length).toBeGreaterThan(0);
    for (const g of d.games) { expect(g.picks.BOT).toBe("caitlyn"); expect(g.picks.SUPPORT).toBe("bard"); }
    expect(d.tradeoffs.join(" ")).toMatch(/Do not pair with a support/);
  });
  it("a pro-derived alternative is marked as from pro games, never as hand-saved", () => {
    const corki = data.botPairings.find((b) => b.champion === "corki")!;
    expect(corki.proAlternatives).toContain("alistar");
    const d = pairingDetail({ id: "corki", role: "BOT" }, { id: "alistar", role: "SUPPORT" }, data, index);
    expect(d.saved?.kind).toBe("pro");
  });
  it("a proposed partner shows the kit-based reason and confidence, with no saved status", () => {
    const rec = data.proposed.find((r) => r.partners.some((g) => g.preferred.length))!;
    const g = rec.partners.find((x) => x.preferred.length)!;
    const d = pairingDetail({ id: rec.champion, role: rec.role }, { id: g.preferred[0].id, role: g.role }, data, index);
    expect(d.saved).toBeUndefined();
    expect(d.proposed).toMatchObject({ id: g.preferred[0].id, confidence: g.preferred[0].confidence, reason: g.preferred[0].reason });
  });
  it("the reverse direction reads the bot's record from the support's side", () => {
    const d = pairingDetail({ id: "bard", role: "SUPPORT" }, caitlyn, data, index);
    expect(d.saved?.kind).toBe("default");
    expect(d.games.length).toBe(pairingDetail(caitlyn, { id: "bard", role: "SUPPORT" }, data, index).games.length);
  });
});

describe("game detail fills nothing in", () => {
  it("an imported game has both drafts, side, result, bans and its builds; a stored LCK draft keeps only what it recorded", () => {
    const games = index.games.filter((g) => g.picks.BOT === "caitlyn");
    const imported = games.find((g) => /^golgg-\d+-(blue|red)$/.test(g.draftId ?? ""))!;
    const d = gameDetail(imported, data);
    expect(d.gameId).toBeGreaterThan(0);
    expect(d.draft?.picks.BOT).toBe("caitlyn");
    expect(d.other?.team).toBe(d.draft?.opponent);
    expect(["blue", "red"]).toContain(d.side);
    expect(typeof d.won).toBe("boolean");
    expect(d.hasBuilds).toBe(data.buildGames.includes(d.gameId));
    expect(d.verified).toBe(true);
    const stored = games.find((g) => g.draftId && !/^golgg-/.test(g.draftId));
    if (stored) {
      const s = gameDetail(stored, data);
      expect(s.draft).toBeTruthy();
      expect(s.won).toBe(s.draft?.won); // undefined unless the game page recorded it
    }
  });
});

describe("priority patch statistics", () => {
  it("names the tournaments, teams and pick order behind one patch of the history", () => {
    const history = championHistory(data.priority, "caitlyn");
    const point = [...history].reverse().find((p) => p.row?.picks)!;
    const s = patchStats(data.priority, "caitlyn", point);
    expect(s.events.length).toBeGreaterThan(0);
    expect(s.teams.reduce((n, t) => n + t.picks, 0)).toBe(point.row!.picks);
    expect(s.order?.known).toBe(point.row!.order.known || undefined);
  });
});

describe("saved partners, roles and links", () => {
  it("lists Caitlyn's preferred supports first and her surrounding jungle and mid as saved comps", () => {
    const groups = savedPartners("caitlyn", "BOT", data);
    expect(groups[0]).toMatchObject({ label: "Preferred", ids: ["bard", "karma"], role: "SUPPORT", kind: "default" });
    expect(groups.find((g) => g.role === "JUNGLE")?.kind).toBe("fits");
  });
  it("a support reads its bots off the bot records, pro-derived ones apart", () => {
    const groups = savedPartners("alistar", "SUPPORT", data);
    expect(groups.find((g) => g.kind === "pro")?.ids).toContain("corki");
    expect(groups.find((g) => g.kind === "alt")?.ids).not.toContain("corki");
  });
  it("roles with evidence come first, then the roster's other roles", () => {
    const roles = rolesOf("caitlyn", index);
    expect(roles[0]).toBe("BOT");
    expect(new Set(roles).size).toBe(roles.length);
  });
  it("links carry the champion, role, game and patch", () => {
    expect(synergiesHref("ahri", "MID")).toBe("/synergies/mid/?champ=ahri");
    expect(proDraftHref("golgg-83459-blue", "SUPPORT")).toBe("/pro-drafts/?id=golgg-83459-blue&build=golgg-83459-blue%3ASUPPORT");
  });
  it("the builds index names the latest games and players for the Builds tab", () => {
    expect(builds?.recent.length).toBeGreaterThan(0);
    expect(builds!.recent.length).toBeLessThanOrEqual(3);
    for (const r of builds!.recent) { expect(r.playerId).toBeGreaterThan(0); expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); }
    expect([...builds!.recent].sort((a, b) => b.date.localeCompare(a.date) || b.game - a.game)).toEqual(builds!.recent);
  });
  it("champion patch entries keep every line and Riot's reason for the Patch tab", () => {
    const own = data.patches.changes.filter((c) => c.kind === "champion");
    expect(own.every((c) => c.more === 0)).toBe(true);
    expect(own.some((c) => c.context)).toBe(true);
    expect(data.patches.changes.filter((c) => c.kind !== "champion").every((c) => c.context === undefined)).toBe(true);
  });
});
