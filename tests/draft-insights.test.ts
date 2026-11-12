// Draft Insights (alan, 2026-11-12): lessons from approved creator videos. A learning layer: every lesson is sourced
// to a moment inside its video, every creator statistic names its patch, and nothing that scores or ranks reads it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clock, COUNTER_NO_READ_LESSON, FINDING_LESSONS, filterInsights, lessonsOfVideo, momentUrl, statPatches } from "@/lib/draft-insights";
import { Files } from "@/lib/schema";

const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const data = Files["draft-insights.json"].parse(read("draft-insights.json"));
const champions = new Set(Files["champions.json"].parse(read("champions.json")).map((c) => c.id));

describe("the data", () => {
  it("has unique lesson ids, known categories, and no empty category", () => {
    const ids = data.insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(data.categories.map((c) => c.id));
    for (const i of data.insights) expect(cats, i.id).toContain(i.category);
    for (const c of cats) expect(data.insights.some((i) => i.category === c), c).toBe(true);
  });

  it("sources every lesson to a moment inside a recorded video", () => {
    for (const i of data.insights) for (const s of i.sources) {
      const v = data.videos[s.video];
      expect(v, `${i.id} ${s.video}`).toBeDefined();
      expect(s.t, i.id).toBeLessThan(v.duration);
      expect(data.creators[v.creator], v.creator).toBeDefined();
    }
    for (const id of Object.keys(data.videos)) expect(lessonsOfVideo(data, id).length, id).toBeGreaterThan(0);
  });

  it("ties every creator statistic to a patch, and only statistics", () => {
    for (const i of data.insights) for (const c of i.claims) {
      if (c.basis === "creator-stat") expect(c.patch, `${i.id}: ${c.text}`).toBeDefined();
      else expect(c.patch, `${i.id}: ${c.text}`).toBeUndefined();
    }
    expect(statPatches(data.insights.find((i) => i.id === "type-plan-champion-outcome")!)).toBe("26.22");
    expect(statPatches(data.insights.find((i) => i.id === "tempo-has-a-deadline")!)).toBeUndefined();
  });

  it("names only real champions and links only to pages that exist", () => {
    for (const i of data.insights) {
      for (const c of i.related.champions) expect(champions, `${i.id}: ${c}`).toContain(c);
      for (const t of i.related.tools) {
        const path = t.href.split("?")[0].replace(/\/$/, "");
        const page = path === "" ? "app/(app)/page.tsx" : `app/(app)${path}/page.tsx`;
        const dynamic = `app/(app)${path.split("/").slice(0, -1).join("/")}/[tab]/page.tsx`;
        expect(existsSync(page) || existsSync(dynamic), `${i.id}: ${t.href}`).toBe(true);
      }
    }
  });

  it("grounds every portrait group and matchup in a moment of a video the lesson cites", () => {
    let visuals = 0;
    for (const i of data.insights) {
      const cited = new Set(i.sources.map((s) => s.video));
      const aids = [...(i.groups ?? []), ...(i.matchups ?? [])];
      for (const a of aids) {
        visuals++;
        expect(cited, `${i.id}: ${a.source.video}`).toContain(a.source.video);
        expect(a.source.t, i.id).toBeLessThan(data.videos[a.source.video].duration);
      }
      for (const g of i.groups ?? []) for (const c of g.champions) expect(champions, `${i.id} ${g.label}: ${c}`).toContain(c);
      for (const m of i.matchups ?? []) for (const c of m.kind === "versus" ? [...m.a, ...m.b] : m.a) expect(champions, `${i.id}: ${c}`).toContain(c);
      for (const c of i.showcase ?? []) expect(champions, `${i.id}: ${c}`).toContain(c);
      // a champion sits in one group of a lesson, never two: hybrids are named in the group's note instead
      const grouped = (i.groups ?? []).flatMap((g) => g.champions);
      expect(new Set(grouped).size, i.id).toBe(grouped.length);
    }
    expect(visuals).toBeGreaterThan(30);
  });

  it("gives the ADC guide its five archetypes and the Kalista + Alistar vs Ezreal + Bard lane", () => {
    const adc = data.insights.find((i) => i.id === "adc-archetypes")!;
    expect(adc.groups!.map((g) => g.label)).toEqual(["Scalers", "Lane bullies", "Poke / casters", "Skirmishers", "Mage bots"]);
    const lane = adc.matchups![0];
    expect(lane.kind === "versus" && [lane.a, lane.b]).toEqual([["kalista", "alistar"], ["ezreal", "bard"]]);
    expect(lane.stat?.patch).toBe("26.21");
  });

  it("keeps the one-creator caveat: no lesson claims agreement between creators", () => {
    expect(Object.keys(data.creators)).toHaveLength(1);
    for (const i of data.insights) expect(`${i.why} ${i.siteNote ?? ""}`, i.id).not.toMatch(/creators agree|consensus/i);
  });
});

describe("browsing", () => {
  it("filters by topic, champion, video and text", () => {
    expect(filterInsights(data, { category: "bot-duo" }).map((i) => i.id)).toEqual(["match-support-to-adc"]);
    expect(filterInsights(data, { champion: "jax" }).map((i) => i.id)).toContain("abilities-against-abilities");
    expect(filterInsights(data, { champion: "hwei" }).map((i) => i.id)).toContain("adc-archetypes"); // from a group, not the related list
    expect(filterInsights(data, { video: "jgHpbaX9wYE" }).every((i) => i.sources.some((s) => s.video === "jgHpbaX9wYE"))).toBe(true);
    expect(filterInsights(data, { q: "Braum" }, { braum: "Braum" }).length).toBeGreaterThan(1);
    expect(filterInsights(data, { q: "zzzz" })).toEqual([]);
  });

  it("lists a video's lessons in video order and links to the moment", () => {
    const ts = lessonsOfVideo(data, "D7DemQewZqM").map((x) => x.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(clock(957)).toBe("15:57");
    expect(momentUrl("https://www.youtube.com/watch?v=D7DemQewZqM", 957)).toBe("https://www.youtube.com/watch?v=D7DemQewZqM&t=957s");
  });

  it("points every Learn why link at a lesson that exists", () => {
    const ids = new Set(data.insights.map((i) => i.id));
    for (const [finding, lesson] of Object.entries(FINDING_LESSONS)) expect(ids, finding).toContain(lesson);
    expect(ids).toContain(COUNTER_NO_READ_LESSON);
  });
});

describe("a learning layer only", () => {
  it("is read by nothing but its page, its loader, and the Learn why links in Comp Check and the Counter card", () => {
    const allowed = new Set(["lib/draft-insights.ts", "lib/data.ts", "lib/schema.ts", "components/views/DraftInsightsView.tsx",
      "app/(app)/insights/page.tsx", "components/CompCheck.tsx", "components/EvidenceCards.tsx"]);
    const walk = (dir: string): string[] => readdirSync(join(process.cwd(), dir), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const users = ["lib", "components", "app"].flatMap(walk)
      .filter((f) => /draft-insights|DraftInsights|getDraftInsights/.test(readFileSync(join(process.cwd(), f), "utf8")));
    for (const f of users) expect(allowed, f).toContain(f);
  });

  it("gives Comp Check and the Counter card links only, never data", () => {
    for (const f of ["components/CompCheck.tsx", "components/EvidenceCards.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/getDraftInsights|draft-insights\.json/);
    }
  });
});
