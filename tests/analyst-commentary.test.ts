// Analyst perspectives (alan, 2026-11-01): attributed opinions tied to recorded games, informational only.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalystPerspectives } from "@/components/AnalystPerspectives";
import { commentaryCounts, formatTime, mentionLabel, perspectivesFor, timeLink } from "@/lib/analyst-commentary";
import { Files } from "@/lib/schema";

const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const data = Files["analyst-commentary.json"].parse(read("analyst-commentary.json"));
const games = Files["pro-games.json"].parse(read("pro-games.json")).games;
const gameOf = (id: number) => games.find((g) => g.id === id)!;
const obs = (id: string) => data.observations.find((o) => o.id === id)!;
const teamsOf = (id: number) => ({ blue: gameOf(id).blue.team, red: gameOf(id).red.team });
const picksOf = (id: number) => ({ blue: Object.values(gameOf(id).blue.picks), red: Object.values(gameOf(id).red.picks) });

describe("analyst commentary data", () => {
  it("starts with the BLG vs HLE pilot: two analysts, games 83692 and 83693", () => {
    expect(Object.keys(data.creators).sort()).toEqual(["caedrel", "yamato"]);
    expect([...new Set(data.observations.map((o) => o.game))].sort()).toEqual([83692, 83693]);
    expect(data.observations).toHaveLength(26);
    expect(new Set(data.observations.map((o) => o.id)).size).toBe(data.observations.length);
  });

  it("ties every observation to a recorded game, a known analyst and that analyst's video, inside its captions", () => {
    for (const o of data.observations) {
      expect(gameOf(o.game), o.id).toBeDefined();
      expect(data.creators[o.creator], o.id).toBeDefined();
      const v = data.videos[o.video];
      expect(v.creator, o.id).toBe(o.creator);
      expect(o.t, o.id).toBeLessThanOrEqual(Math.min(v.duration, v.captionsEnd));
      expect(new URL(v.url).hostname).toBe("www.youtube.com");
    }
    for (const x of data.excluded) expect(data.videos[x.video]).toBeDefined();
  });

  it("names each mentioned champion as what it was in that game: a side's pick, a side's ban, or an option it did not take", () => {
    for (const o of data.observations) {
      const g = gameOf(o.game);
      for (const m of o.champions) {
        const side = g[m.side], picks = Object.values(side.picks);
        if (m.as === "pick") expect(picks, `${o.id} ${m.id}`).toContain(m.id);
        if (m.as === "ban") expect(side.bans, `${o.id} ${m.id}`).toContain(m.id);
        if (m.as === "option") expect(picks, `${o.id} ${m.id}`).not.toContain(m.id);
      }
    }
  });

  it("keeps Caedrel's Orianna + Jarvan IV as a hypothetical for BLG, never allied synergy (they were opponents)", () => {
    const o = obs("c-83692-orianna-jarvan"), g = gameOf(83692);
    expect(g.blue.picks.MID).toBe("orianna");
    expect(g.red.picks.JUNGLE).toBe("jarvan-iv");
    const j4 = o.champions.find((m) => m.id === "jarvan-iv")!;
    expect(j4).toMatchObject({ as: "option", side: "blue" });
    expect(mentionLabel(j4, teamsOf(83692), picksOf(83692))).toBe("Option for Bilibili Gaming · picked by Hanwha Life Esports");
    expect(o.text).toMatch(/hypothetical/i);
    // BLG's Orianna came before HLE's Jarvan IV: HLE took him after the suggestion.
    expect(g.firstPick).toBe("red");
    expect(g.blue.pickOrder?.[0]).toBe("orianna");
    expect(g.red.pickOrder?.[1]).toBe("jarvan-iv");
  });

  it("labels picks, bans and options with team names", () => {
    const t = teamsOf(83693), p = picksOf(83693);
    expect(mentionLabel({ id: "pantheon", as: "pick", side: "blue" }, t, p)).toBe("Bilibili Gaming");
    expect(mentionLabel({ id: "nocturne", as: "ban", side: "blue" }, t, p)).toBe("Banned by Bilibili Gaming");
    expect(mentionLabel({ id: "ambessa", as: "option", side: "blue" }, t, p)).toBe("Option for Bilibili Gaming · not picked");
  });
});

describe("factual checks", () => {
  // Worlds games recorded before the series' day (Gol.gg records no start times, so same-day games are left out).
  const before = games.filter((g) => g.tournament.startsWith("Worlds 2026") && g.date < "2026-10-31");
  const record = (champ: string, role: "TOP" | "SUPPORT") => {
    let w = 0, l = 0;
    for (const g of before) for (const s of ["blue", "red"] as const) if (g[s].picks[role] === champ) (g.winner === s ? w++ : l++);
    return `${w}–${l}`;
  };

  it("states the records the corroborated win-rate claims rest on", () => {
    expect(record("rumble", "TOP")).toBe("5–12");
    expect(record("alistar", "SUPPORT")).toBe("6–12");
    expect(record("ksante", "TOP")).toBe("5–11");
    expect(obs("y-83692-draft-edge").check?.evidence).toContain("Rumble 5–12 in top, Alistar 6–12 in support");
    expect(obs("y-83693-zeus").check?.evidence).toContain("Rumble 5–12 and K'Sante 5–11");
    const tops = new Map<string, [number, number]>();
    for (const g of before) for (const s of ["blue", "red"] as const) {
      const c = g[s].picks.TOP, r = tops.get(c) ?? [0, 0];
      tops.set(c, [r[0] + (g.winner === s ? 1 : 0), r[1] + 1]);
    }
    const lowest = [...tops].filter(([, [, n]]) => n >= 5).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 2).map(([c]) => c);
    expect(lowest.sort()).toEqual(["ksante", "rumble"]);
  });

  it("backs the draft-order claims with the recorded pick order", () => {
    const g2 = gameOf(83684), g2Side = g2.blue.team === "G2 Esports" ? g2.blue : g2.red;
    expect(g2Side.pickOrder?.indexOf("nautilus")).toBe(1); // G2's second pick, Oct 30
    expect(obs("c-83692-early-nautilus").check?.games).toEqual([83684]);
    const g1 = gameOf(83692); // HLE (red) picks first: red's 5th pick is turn 9, blue's 5th is turn 10
    expect(g1.firstPick).toBe("red");
    expect(g1.red.pickOrder?.[4]).toBe("rumble");
    expect(g1.blue.pickOrder?.[4]).toBe("gnar");
  });

  it("checks only factual sub-claims; opinions carry no verdict", () => {
    for (const o of data.observations) if (o.check) expect(["corroborated", "contradicted", "unverifiable", "speculation"]).toContain(o.check.status);
    const verdict = /\b(was right|was wrong|proved|disproved|correct call)\b/i;
    for (const o of data.observations) expect(o.text, o.id).not.toMatch(verdict);
  });
});

describe("perspectives view", () => {
  it("groups by analyst, draft before post-game, by timestamp", () => {
    const blocks = perspectivesFor(data, 83692);
    expect(blocks.map((b) => b.name)).toEqual(["YamatoCannon", "Caedrel"]);
    for (const b of blocks) {
      const phases = b.items.map((i) => i.phase);
      expect(phases.indexOf("post-game") === -1 || phases.lastIndexOf("draft") < phases.indexOf("post-game")).toBe(true);
      const draft = b.items.filter((i) => i.phase === "draft").map((i) => i.t);
      expect(draft).toEqual([...draft].sort((a, b) => a - b));
    }
  });

  it("links each observation to its exact moment", () => {
    expect(timeLink("https://www.youtube.com/watch?v=qS1WkPdFRAA", 90)).toBe("https://www.youtube.com/watch?v=qS1WkPdFRAA&t=90s");
    expect(formatTime(90)).toBe("1:30");
    expect(formatTime(1981)).toBe("33:01");
    expect(formatTime(32027)).toBe("8:53:47");
    const item = perspectivesFor(data, 83693).flatMap((b) => b.items).find((i) => i.id === "c-83693-caitlyn")!;
    expect(item.href).toBe("https://www.youtube.com/watch?v=N-Ao8zE2jdY&t=1650s");
  });

  it("shows disagreement beside agreement, never resolved", () => {
    const rel = (id: string) => perspectivesFor(data, obs(id).game).flatMap((b) => b.items).find((i) => i.id === id)!.relations;
    expect(rel("y-83692-draft-edge")).toEqual([{ creator: "caedrel", name: "Caedrel", agrees: false, question: "Which team drafted better?" }]);
    expect(rel("c-83692-draft-edge")[0]).toMatchObject({ name: "YamatoCannon", agrees: false });
    expect(rel("y-83692-ezreal-snipe")[0].agrees).toBe(true);
    expect(rel("y-83693-caitlyn")[0].agrees).toBe(true);
    expect(rel("c-83693-pantheon")[0].agrees).toBe(true);
    expect(rel("y-83693-ksante")).toEqual([]);
    for (const [key, t] of Object.entries(data.topics)) {
      const on = data.observations.filter((o) => o.topic === key);
      expect(new Set(on.map((o) => o.creator)).size, key).toBeGreaterThanOrEqual(2);
      for (const o of on) expect(o.game, key).toBe(t.game);
    }
  });

  it("counts per game for the collapsed row and renders nothing for a game without commentary", () => {
    expect(commentaryCounts(data)).toEqual({ 83692: 11, 83693: 15 });
    expect(perspectivesFor(data, 83684)).toEqual([]);
    const props = { game: 83684, count: 0, names: {}, teams: { blue: "a", red: "b" }, picks: { blue: [], red: [] } };
    expect(renderToStaticMarkup(createElement(AnalystPerspectives, props))).toBe("");
    const html = renderToStaticMarkup(createElement(AnalystPerspectives, { ...props, game: 83692, count: 11 }));
    expect(html).toContain("Analyst perspectives");
    expect(html).toContain(">11<");
    expect(html).not.toContain("open=\"\""); // collapsed by default
  });
});

describe("informational only", () => {
  it("is read by nothing but the Pro Drafts row, its data loader and its bundle", () => {
    const allowed = new Set(["lib/analyst-commentary.ts", "lib/analyst-commentary-bundle.ts", "lib/data.ts", "lib/schema.ts",
      "components/AnalystPerspectives.tsx", "components/views/ProDraftsView.tsx", "app/(app)/pro-drafts/page.tsx"]);
    const walk = (dir: string): string[] => readdirSync(join(process.cwd(), dir), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const users = ["lib", "components", "app"].flatMap(walk)
      .filter((f) => /analyst-commentary|AnalystPerspectives|getCommentaryCounts/.test(readFileSync(join(process.cwd(), f), "utf8")));
    for (const f of users) expect(allowed, f).toContain(f);
  });
});
