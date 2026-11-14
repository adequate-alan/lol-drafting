// Pairing Explorer (alan, 2026-11-13): the shared pairing layer in lib/pairings.ts. Recorded games are counted from the
// games themselves; alan's saved Synergy, observed pro pairings and kit-based proposals stay in separate groups; a pro
// pairing never becomes saved; nothing that scores or orders reads the explorer; "Use in Draft Room" keeps the board.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBotPairings, getChampions, getDrawerData, getMidJungle, getPairingData, getProposed } from "@/lib/data";
import { withPair } from "@/lib/draft-persist";
import { convertKits } from "@/lib/model-v2/kits";
import { coreRead, duoRead, explorerHref, noteFor, pairEvidence, pairLessons, partnerOptions, partnerRoleOf, savedCore, savedLink, savedPair, savedTop, topRead } from "@/lib/pairings";
import { Files, type Role } from "@/lib/schema";

const data = getPairingData();
const champions = getChampions();
const bots = getBotPairings();
const proposed = getProposed().records;
const byId = new Map(champions.map((c) => [c.id, c]));
const playable = (id: string, role: Role) => !!byId.get(id)?.roles.includes(role) && !byId.get(id)?.rosterOnly;
const kits = new Map(convertKits(champions).map((k) => [k.id, k]));
const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("recorded games", () => {
  it("lists each team draft once, keyed by Gol.gg game and team", () => {
    const keys = data.rows.map((r) => `${r.game}:${r.team}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of data.rows) {
      expect(r.patch, `${r.game}`).toBeTruthy();
      expect(r.series, `${r.game}`).toMatch(/:/);
    }
  });

  it("counts a pairing from the games, never from the workbook's stored counts", () => {
    const yunara = pairEvidence(data.rows, "yunara", "BOT", "SUPPORT", data.newestPatch).get("lulu")!;
    // Synergies used to show 3 (the LCK-era list); the recorded games hold many more, from many teams.
    expect(yunara.games.length).toBeGreaterThan(20);
    expect(yunara.teams.length).toBeGreaterThan(10);
    expect(yunara.wins + yunara.losses).toBeLessThanOrEqual(yunara.games.length);
    // Fearless: a pairing appears once per series per team.
    const perSeries = new Set(yunara.games.map((g) => `${g.series}:${g.team}`));
    expect(perSeries.size).toBe(yunara.games.length);
  });

  it("keeps the LCK archive and labels it", () => {
    expect(data.rows.some((r) => r.archive)).toBe(true);
    expect(data.rows.filter((r) => r.archive).every((r) => r.patch.endsWith("16"))).toBe(true);
  });
});

describe("partner groups", () => {
  it("keeps saved, observed and proposed apart, each champion once", () => {
    for (const b of bots) {
      const g = partnerOptions({ id: b.champion, role: "BOT" }, { botPairings: bots, proposed, rows: data.rows, playable, newestPatch: data.newestPatch });
      const ids = [...g.saved, ...g.observed, ...g.proposed].map((o) => o.id);
      expect(new Set(ids).size, b.champion).toBe(ids.length);
      expect(g.saved.map((o) => o.id).sort(), b.champion).toEqual([...new Set([...b.clashDefault, ...b.alternatives])].sort());
      for (const o of g.observed) expect(o.saved, `${b.champion}+${o.id}`).toBeUndefined();
      for (const o of g.observed) expect(o.evidence?.games.length, `${b.champion}+${o.id}`).toBeGreaterThan(0);
    }
  });

  it("puts a saved default first", () => {
    const g = partnerOptions({ id: "ezreal", role: "BOT" }, { botPairings: bots, proposed, rows: data.rows, playable, newestPatch: data.newestPatch });
    expect(g.saved[0].id).toBe("karma");
    expect(g.saved[0].saved?.kind).toBe("default");
  });

  it("never makes Ziggs + Karma saved", () => {
    expect(savedLink("ziggs", "karma", bots)).toBeUndefined();
    const g = partnerOptions({ id: "ziggs", role: "BOT" }, { botPairings: bots, proposed, rows: data.rows, playable, newestPatch: data.newestPatch });
    expect(g.saved.some((o) => o.id === "karma")).toBe(false);
  });

  it("a pairing only seen in pro games is observed, never saved", () => {
    expect(savedLink("corki", "alistar", bots)).toBeUndefined();
    const g = partnerOptions({ id: "corki", role: "BOT" }, { botPairings: bots, proposed, rows: data.rows, playable, newestPatch: data.newestPatch });
    expect(g.observed.map((o) => o.id)).toContain("alistar");
    expect(savedLink("corki", "nami", bots)?.kind).toBe("default");
  });
});

describe("reads", () => {
  it("validates the written notes and keeps them champion-specific", () => {
    const notes = Files["pairing-notes.json"].parse(JSON.parse(src("data/pairing-notes.json"))).notes;
    expect(notes.length).toBeGreaterThanOrEqual(20);
    for (const n of notes) {
      expect(byId.get(n.a)?.roles, n.a).toContain("BOT");
      expect(byId.get(n.b)?.roles, n.b).toContain("SUPPORT");
      expect(n.why.length, `${n.a}+${n.b}`).toBeGreaterThan(0);
      expect(n.weaknesses.length, `${n.a}+${n.b}`).toBeGreaterThan(0);
      // Pro frequency belongs to the Pro evidence layer, never a written read.
      expect(JSON.stringify(n), `${n.a}+${n.b}`).not.toMatch(/\b(pro games?|played \d+|win rate)\b/i);
    }
    for (const pair of [["ezreal", "karma"], ["draven", "leona"], ["lucian", "milio"], ["kalista", "renata-glasc"], ["yunara", "braum"], ["xayah", "rakan"], ["caitlyn", "bard"], ["sivir", "lulu"], ["ziggs", "nautilus"]])
      expect(noteFor(notes, pair[0], pair[1]), pair.join("+")).toBeDefined();
  });

  it("does not call every engage support an all-in for every ADC", () => {
    const ziggs = duoRead(kits.get("ziggs"), kits.get("nautilus"), { bot: "Ziggs", sup: "Nautilus" })!;
    const draven = duoRead(kits.get("draven"), kits.get("nautilus"), { bot: "Draven", sup: "Nautilus" })!;
    expect(draven.plan.label).not.toBe(ziggs.plan.label);
    for (const l of [ziggs.plan, ...ziggs.works, ...ziggs.weaknesses, ziggs.curve]) expect(l.basis, l.text).toBeTruthy();
  });

  it("names creator lessons as solo queue with their patch", () => {
    const list = pairLessons(data.lessons, "ezreal", "nautilus");
    expect(list.some((l) => l.kind === "pair")).toBe(true);
    for (const l of list) if (l.stat) expect(l.stat.patch, l.text).toMatch(/\d/);
  });
});

// Mid + Jungle (alan, 2026-11-14): the same three groups and the same separation for the mid + jungle core.
describe("mid + jungle", () => {
  const mj = getMidJungle();
  const input = { botPairings: bots, midJungle: mj, proposed, rows: data.rows, playable, newestPatch: data.newestPatch };

  it("keeps saved, observed and proposed apart for every saved mid and jungler", () => {
    for (const m of mj) {
      const other = m.role === "MID" ? "JUNGLE" : "MID";
      const g = partnerOptions({ id: m.anchor, role: m.role }, input);
      const ids = [...g.saved, ...g.observed, ...g.proposed].map((o) => o.id);
      expect(new Set(ids).size, m.anchor).toBe(ids.length);
      // Saved: the anchor's own record first, in its order, then partners whose record lists the anchor. Nothing else.
      const own = [...m.clashDefault, ...m.alternatives];
      expect(g.saved.slice(0, own.length).map((o) => o.id), m.anchor).toEqual(own);
      for (const o of g.saved.slice(own.length)) {
        const theirs = mj.find((x) => x.anchor === o.id && x.role === other)!;
        expect([...theirs.clashDefault, ...theirs.alternatives], `${m.anchor}+${o.id}`).toContain(m.anchor);
        expect(o.saved?.on, `${m.anchor}+${o.id}`).toBe(m.role === "MID" ? "b" : "a");
      }
      for (const o of g.observed) {
        expect(o.saved, `${m.anchor}+${o.id}`).toBeUndefined();
        expect(o.evidence?.games.length, `${m.anchor}+${o.id}`).toBeGreaterThan(0);
      }
      // A pairing only seen in pro games is saved only where the partner's own record lists the anchor by hand.
      for (const id of m.proAlternatives ?? []) {
        const theirs = mj.find((x) => x.anchor === id && x.role === other);
        const byHand = !!theirs && [...theirs.clashDefault, ...theirs.alternatives].includes(m.anchor);
        expect(g.saved.some((o) => o.id === id), `${m.anchor}+${id}`).toBe(byHand);
      }
    }
  });

  it("a pairing only seen in pro games is observed, never saved: Syndra + Lee Sin, Cassiopeia + Vi", () => {
    for (const [mid, jungle] of [["syndra", "lee-sin"], ["cassiopeia", "vi"]]) {
      // Whatever alan saves later decides this; today neither record lists the other.
      const listed = mj.some((m) => (m.anchor === mid && m.role === "MID" && [...m.clashDefault, ...m.alternatives].includes(jungle)) || (m.anchor === jungle && m.role === "JUNGLE" && [...m.clashDefault, ...m.alternatives].includes(mid)));
      expect(!!savedCore(mid, jungle, mj), `${mid}+${jungle}`).toBe(listed);
      const g = partnerOptions({ id: mid, role: "MID" }, input);
      const o = [...g.saved, ...g.observed].find((x) => x.id === jungle)!;
      expect(o.group, `${mid}+${jungle}`).toBe(listed ? "saved" : "observed");
      expect(o.evidence!.games.length).toBeGreaterThan(0);
      expect(o.evidence!.teams.length).toBeGreaterThan(0);
    }
  });

  it("says where a one-sided saved link sits", () => {
    // Vex's record lists Vi; Vi's record does not list Vex (alan's saved records, tests/locked-conclusions.test.ts).
    expect(savedCore("vex", "vi", mj)).toMatchObject({ kind: "alt", on: "a" });
    // Two records can rank one pair differently; each view shows its own record's kind and both stay readable.
    const sc = savedCore("syndra", "chogath", mj, "a")!, cs = savedCore("syndra", "chogath", mj, "b")!;
    expect([sc.kind, cs.kind, sc.sides]).toEqual(["alt", "default", { a: "alt", b: "default" }]);
    expect(savedCore("ahri", "vi", mj)).toMatchObject({ kind: "default", on: "both" });
    expect(savedCore("ziggs", "vi", mj)).toBeUndefined();
  });

  it("reads the core from the kits, each line with the values it rests on", () => {
    const read = coreRead(kits.get("syndra"), kits.get("lee-sin"), { mid: "Syndra", jungle: "Lee Sin" })!;
    expect(read.plan.label).toBeTruthy();
    for (const l of [read.plan, ...read.works, ...read.strengths, ...read.weaknesses, read.curve]) expect(l.basis, l.text).toBeTruthy();
    // Not one label for every pair.
    const labels = new Set(mj.filter((m) => m.role === "MID").flatMap((m) => m.clashDefault.map((j) => coreRead(kits.get(m.anchor), kits.get(j), { mid: m.anchor, jungle: j })?.plan.label)));
    expect(labels.size).toBeGreaterThan(2);
    expect(JSON.stringify(read)).not.toMatch(/\b(pro games?|win rate)\b/i);
  });

  it("links into the explorer", () => {
    expect(explorerHref("syndra", "lee-sin", undefined, "mid-jungle")).toBe("/insights/?view=pairings&lane=mid-jungle&mid=syndra&jungle=lee-sin");
  });
});

// Top + Jungle (alan, 2026-11-14): the third pairing on the same layer. A top's saved record lists its junglers in one
// list; junglers keep no list of tops; a recorded pair is evidence, never saved.
describe("top + jungle", () => {
  const tops = getDrawerData().topPicks;
  const input = { botPairings: bots, midJungle: getMidJungle(), topPicks: tops, proposed, rows: data.rows, playable, newestPatch: data.newestPatch };

  it("lists a top's saved junglers in record order, each champion once, groups apart", () => {
    for (const t of tops) {
      const g = partnerOptions({ id: t.champion, role: "TOP" }, input);
      expect(g.saved.map((o) => o.id), t.champion).toEqual(t.surrounding.jungle.filter((j) => j !== t.champion));
      const ids = [...g.saved, ...g.observed, ...g.proposed].map((o) => o.id);
      expect(new Set(ids).size, t.champion).toBe(ids.length);
      for (const o of g.saved) expect(o.saved, `${t.champion} + ${o.id}`).toMatchObject({ kind: "fits", on: "a" });
      for (const o of [...g.observed, ...g.proposed]) expect(o.saved, `${t.champion} + ${o.id}`).toBeUndefined();
      for (const o of g.observed) expect(o.evidence!.games.length).toBeGreaterThan(0);
      for (const o of [...g.saved, ...g.observed, ...g.proposed]) expect(o.role).toBe("JUNGLE");
    }
  });

  it("a jungler in the top pairing lists tops, and only tops whose record names it are saved", () => {
    const g = partnerOptions({ id: "sejuani", role: "JUNGLE", lane: "top-jungle" }, input);
    const want = tops.filter((t) => t.surrounding.jungle.includes("sejuani")).map((t) => t.champion).sort();
    expect(g.saved.map((o) => o.id).sort()).toEqual(want);
    for (const o of [...g.saved, ...g.observed, ...g.proposed]) expect(o.role).toBe("TOP");
    // The same jungler without a lane is still the mid + jungle core.
    expect(partnerRoleOf("JUNGLE")).toBe("MID");
    expect(partnerRoleOf("JUNGLE", "top-jungle")).toBe("TOP");
    for (const o of partnerOptions({ id: "sejuani", role: "JUNGLE" }, input).saved) expect(o.role).toBe("MID");
  });

  it("a recorded top + jungle pair is counted from its games and never saved by them", () => {
    const seen = new Map<string, number>();
    for (const r of data.rows) if (r.picks.TOP && r.picks.JUNGLE) seen.set(`${r.picks.TOP}|${r.picks.JUNGLE}`, (seen.get(`${r.picks.TOP}|${r.picks.JUNGLE}`) ?? 0) + 1);
    expect(seen.size).toBeGreaterThan(100);
    for (const [k, n] of seen) {
      const [t, j] = k.split("|");
      const listed = !!tops.find((x) => x.champion === t)?.surrounding.jungle.includes(j);
      expect(!!savedTop(t, j, tops), k).toBe(listed);
      expect(!!savedPair("top-jungle", t, j, input), k).toBe(listed);
      expect(pairEvidence(data.rows, t, "TOP", "JUNGLE").get(j)!.games.length, k).toBe(n);
    }
  });

  it("reads gank setup from the kits, each line with the values it rests on, and never a matchup or a rate", () => {
    const names = (id: string) => byId.get(id)!.name;
    let reads = 0;
    for (const t of champions.filter((c) => c.roles.includes("TOP") && !c.rosterOnly)) for (const j of champions.filter((c) => c.roles.includes("JUNGLE") && !c.rosterOnly)) {
      if (t.id === j.id) continue;
      const r = topRead(kits.get(t.id), kits.get(j.id), { top: t.name, jungle: j.name });
      if (!r) continue;
      reads++;
      for (const l of [r.plan, ...r.works, ...r.strengths, ...r.weaknesses, r.curve]) {
        expect(l.basis, `${t.id} + ${j.id}`).toBeTruthy();
        expect(l.text, `${t.id} + ${j.id}`).not.toMatch(/%|win rate|counter|always|guarantee/i);
      }
    }
    expect(reads).toBeGreaterThan(500);
    // A jungler with a start and a top who follows; a top who holds the target himself.
    expect(topRead(kits.get("jax"), kits.get("lee-sin"), { top: names("jax"), jungle: names("lee-sin") })!.plan.label).toBe("Jungler starts, top follows");
    expect(topRead(kits.get("ornn"), kits.get("viego"), { top: names("ornn"), jungle: names("viego") })!.plan.label).toBe("Top sets up the gank");
    expect(topRead(undefined, kits.get("viego"), { top: "x", jungle: "Viego" })).toBeUndefined();
  });

  it("links into the explorer and names the top class lesson", () => {
    expect(explorerHref("jax", "lee-sin", undefined, "top-jungle")).toBe("/insights/?view=pairings&lane=top-jungle&top=jax&jungle=lee-sin");
    const l = pairLessons(data.lessons, "jax", "lee-sin", [], "top-jungle");
    for (const x of l) expect(["pair", "top", "jungle"]).toContain(x.kind);
    for (const x of l.filter((y) => y.kind === "top")) expect(x.lesson).toBe("top-classes");
  });
});

describe("separation and the board", () => {
  it("nothing that scores, orders or picks candidates reads the explorer", () => {
    for (const f of ["lib/recommend.ts", "lib/candidates.ts", "lib/counters.ts", "lib/model-v2/analyze.ts", "lib/model-v2/plan.ts", "lib/pro-alternatives.ts"])
      expect(src(f), f).not.toMatch(/pairings"|pairing-notes|PairingExplorer/);
  });

  it("Use in Draft Room adds the pair and keeps every other pick", () => {
    const board = { ally: { TOP: "aatrox", SUPPORT: "nautilus" }, enemy: { BOT: "ezreal", MID: "ahri" } };
    const out = withPair(board as never, { BOT: "ezreal", SUPPORT: "karma" });
    expect(out.ally).toMatchObject({ TOP: "aatrox", BOT: "ezreal", SUPPORT: "karma" });
    expect(out.enemy.BOT).toBeUndefined(); // the same champion is never on both teams
    expect(out.enemy.MID).toBe("ahri");
  });

  it("links into the explorer", () => {
    expect(explorerHref("ezreal", "karma")).toBe("/insights/?view=pairings&bot=ezreal&support=karma");
  });
});
