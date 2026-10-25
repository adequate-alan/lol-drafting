// Comp Library entries: the hand-written shells (data/comp-shells.json) plus the Observed Pro Comps the weekly discovery
// added (data/discovered-comps.json), in the one CompShell shape the cards, the drawer and the Draft Room already read,
// with each comp's observed variations and replays resolved from data/pro-games.json. Derived at load, never written.
// alan's reviewed decisions (data/comp-review.json) add three things, all Observed Pro Evidence: pro swaps (a champion
// pro teams played in one slot of the comp, with every game, its series, teams and patches; kept apart from the slot's
// `swaps`, which are General Draft Logic), supporting lineups (filed with the comp's variations, LCK archive included)
// a historical mark (the last patch pros picked a slot's champion in that role, shown only once it is not the newest) and
// named variants (a comp shown inside its parent's card; every shell stays in `shells`, so Draft Room links still work).
// Since 2026-10-17 also named variations (one observed lineup with a name, alan's note and the comp check's read, plus
// lineups that play the same way) and families (distinct comps with one strategic thread, linked from each card).
import { newestGamesFirst, recordStamp } from "./chronology";
import { IDENTITY_LABEL, lineupKey, refKey, shellPicks, type LineupJobs, type LineupRef, type Picks, type ReadResult, type Weak } from "./comp-discovery";
import { comparePatch } from "./patch";
import { gameSourceId } from "./pro-games";
import { ROLES, type CompReview, type CompShell, type DiscoveredComp, type DiscoveredComps, type ProGame, type Role } from "./schema";

/** One recorded game for a lineup, as a variation row shows it. */
export interface ObservedGame {
  game: number; side: "blue" | "red"; team: string; opponent: string; won: boolean;
  date: string; patch: string; tournament: string; url: string;
}
export interface ObservedLineup { picks: Picks; games: ObservedGame[]; named?: NamedVariation }
/** The comp check's read of a lineup (General Draft Logic), for a named variation. */
export interface LineupRead { identity: string; winCondition: string; timing: string; strengths: string[]; weaknesses: Weak[] }
export interface NamedVariation { name: string; note: string; read?: LineupRead; alike: ObservedLineup[] }
export interface CompFamily { id: string; name: string; note: string; others: { id: string; name: string }[] }
/** A champion pro teams played in one slot of a comp, approved by alan as a supported alternative. Never "the" meta pick:
 *  the series, team and patch counts travel with it so a two-series swap reads as two series. */
export interface ProSwap { champion: string; games: ObservedGame[]; series: number; teams: number; patches: string[] }
/** Under 3 independent series a pro swap is a small sample. */
export const PRO_SWAP_SAMPLE = 3;
export interface LibraryExtra {
  discovered?: Omit<DiscoveredComp, "slots" | "games" | "winCondition" | "why">; // the comp check's read, for Details
  games: ObservedGame[]; // games with the comp's own lineup (a curated shell's own source game left out)
  variations: ObservedLineup[]; // other observed lineups filed under this comp, most games first
  proSwaps?: Partial<Record<Role, ProSwap[]>>;
  historical?: Partial<Record<Role, string>>; // role → last patch pros picked the slot's champion there, when older than the newest
  variantOf?: { parent: string; name: string }; // shown inside the parent's card, never as its own card
  variants?: { id: string; name: string }[];    // a parent's named variants, in review order
  family?: CompFamily;
  archetype?: Archetype;                          // on the core comp: its card is the parent
  inArchetype?: { parent: string; id: string };   // a member comp: shown as a row in the parent's card, never as its own card
}
/** The four jobs the Protect plan typically needs, as each archetype row keeps, replaces, shares or gives them up. */
export const ARCHETYPE_JOBS = ["carry", "peel", "front", "start"] as const;
export type ArchetypeJob = (typeof ARCHETYPE_JOBS)[number];
export type JobState = "keeps" | "replaces" | "shares" | "gives up";
export interface JobRead { job: ArchetypeJob; state: JobState; champions: string[] }
export interface ArchetypeRow {
  id: string;                 // the comp id for the core and a member comp, "<game>-<side>" for a named variation
  kind: "core" | "named" | "comp";
  name: string; note: string; via: string[]; picks: Picks;
  games: ObservedGame[];      // every game with this exact lineup, newest first, each listed once in the card
  jobs?: JobRead[];           // from the comp check; left out when a pick has no kit
  read?: LineupRead; alike: ObservedLineup[];
  observed: ObservedLineup[]; // a member comp's own observed variations and named lineups
  why?: string;               // a review row: why its plan is ambiguous
}
export interface Archetype {
  id: string; name: string; carry: string; winCondition: string; plan: string;
  core: ArchetypeRow; members: ArchetypeRow[]; review: ArchetypeRow[];
}
/** Each job of a lineup against the archetype's typical plan: Yunara the main damage, two peel or disengage sources,
 *  someone in front, and waiting for the enemy to come in (no on-demand start). */
export function jobReads(j: LineupJobs, carry: string): JobRead[] {
  return [
    j.main === carry ? { job: "carry", state: "keeps", champions: [carry] } : { job: "carry", state: "shares", champions: [carry, j.main] },
    { job: "peel", state: j.peel.length >= 2 ? "keeps" : "gives up", champions: j.peel },
    { job: "front", state: j.front.length ? "keeps" : "gives up", champions: j.front },
    { job: "start", state: j.starts.length ? "replaces" : "keeps", champions: j.starts },
  ];
}
/** Observed variations a card lists behind its toggle: an archetype's named rows are already shown in the card. */
export const plainVariations = (x: LibraryExtra) => x.archetype ? x.variations.filter((v) => !v.named) : x.variations;
const NO_REVIEW: CompReview = { proSwaps: [], supporting: [], historical: [], variants: [], heldChampions: [], approvedComps: [], pendingComps: [], namedVariations: [], held: [], families: [], archetypes: [] };
const readView = (r: ReadResult): LineupRead | undefined => r.ok ? {
  identity: [r.read.primary, r.read.secondary].filter((x): x is NonNullable<typeof x> => !!x).map((i) => IDENTITY_LABEL[i]).join(" + "),
  winCondition: r.read.winCondition, timing: r.read.timing, strengths: r.read.strengths, weaknesses: r.read.weaknesses,
} : undefined;

export function gameView(g: ProGame, side: "blue" | "red"): ObservedGame {
  const them = side === "blue" ? "red" : "blue";
  return { game: g.id, side, team: g[side].team, opponent: g[them].team, won: g.winner === side, date: g.date, patch: g.patch, tournament: g.tournament, url: g.url };
}

const DIFFICULTY: Record<DiscoveredComp["difficulty"], CompShell["difficulty"]> = { easy: "easy", medium: "medium", hard: "hard" };

/** A discovered comp in the shell shape. No swaps: swaps are general draft logic and nobody wrote any for it. */
export function discoveredShell(c: DiscoveredComp, games: Map<number, ProGame>): CompShell {
  const first = c.games[0];
  const g = games.get(first.game);
  return {
    id: c.id, name: c.name, kind: "observed", observedBy: g?.[first.side].team, proDraftId: `golgg-${first.game}-${first.side}`,
    slots: Object.fromEntries(ROLES.map((r) => [r, { champion: c.slots[r].champion, job: c.slots[r].job, swaps: [] as string[] }])) as unknown as CompShell["slots"],
    identities: c.tags, winCondition: c.winCondition, why: c.why, difficulty: DIFFICULTY[c.difficulty],
    sources: c.games.map((x) => gameSourceId({ id: x.game })),
  };
}

/** `records`: every recorded game the review may cite (the tracked games plus the LCK archive records); defaults to `proGames`. */
/** `readOf`: the comp check's read of a lineup, shown with a named variation (left out when not given). */
/** `jobsOf`: who does each archetype job in a lineup (left out: archetype rows carry no job read). */
export function buildLibrary(shells: CompShell[], file: DiscoveredComps, proGames: ProGame[], review: CompReview = NO_REVIEW, records: ProGame[] = proGames,
  readOf?: (p: Picks) => ReadResult, jobsOf?: (p: Picks) => LineupJobs | null) {
  const games = new Map([...records, ...proGames].map((g) => [g.id, g]));
  const view = (refs: LineupRef[]) => newestGamesFirst(refs.flatMap((r) => { const g = games.get(r.game); return g ? [{ g, v: gameView(g, r.side) }] : []; }),
    (x) => recordStamp(x.g)).map((x) => x.v);
  const all = [...shells, ...file.comps.map((c) => discoveredShell(c, games))];
  // Last patch each champion was picked in each role across every record, and the newest recorded patch.
  const lastPicked = new Map<string, string>();
  let newest: string | undefined;
  for (const g of games.values()) {
    if (!newest || comparePatch(g.patch, newest) > 0) newest = g.patch;
    for (const side of ["blue", "red"] as const) for (const r of ROLES) {
      const k = `${r}:${g[side].picks[r]}`, cur = lastPicked.get(k);
      if (!cur || comparePatch(g.patch, cur) > 0) lastPicked.set(k, g.patch);
    }
  }
  const extras: Record<string, LibraryExtra> = {};
  for (const s of all) {
    const own = lineupKey(shellPicks(s));
    const ownSources = new Set(s.sources);
    const vs = file.variations.filter((v) => v.of === s.id);
    const d = file.comps.find((c) => c.id === s.id);
    // Same lineup, other games: a discovered comp's games after its first; a curated shell's replays minus its own source.
    const replays = d ? view(d.games.slice(1))
      : view(vs.filter((v) => lineupKey(v.picks) === own).flatMap((v) => v.games)).filter((g) => !ownSources.has(gameSourceId({ id: g.game })));
    // Supporting lineups alan approved join the variations (a lineup discovery already filed keeps one row).
    const lineups: { picks: Picks; games: LineupRef[] }[] = vs.filter((v) => lineupKey(v.picks) !== own);
    for (const ref of review.supporting.filter((x) => x.comp === s.id).flatMap((x) => x.games)) {
      const g = games.get(ref.game);
      if (!g || lineups.some((v) => v.games.some((x) => x.game === ref.game && x.side === ref.side))) continue;
      const picks = g[ref.side].picks as Picks;
      const row = lineups.find((v) => lineupKey(v.picks) === lineupKey(picks));
      if (row) lineups[lineups.indexOf(row)] = { ...row, games: [...row.games, ref] };
      else if (lineupKey(picks) !== own) lineups.push({ picks, games: [ref] });
    }
    // Named variations: the named lineup's row (added when nothing filed it), and the lineups that play the same way
    // moved under it. Named rows lead, in review order.
    const named: { key: string; n: CompReview["namedVariations"][number] }[] = [];
    for (const n of review.namedVariations.filter((x) => x.comp === s.id)) {
      const g = games.get(n.game.game);
      if (!g) continue;
      const picks = g[n.game.side].picks as Picks, key = lineupKey(picks);
      if (key === own) continue;
      const row = lineups.find((v) => lineupKey(v.picks) === key);
      if (!row) lineups.push({ picks, games: [n.game] });
      else if (!row.games.some((x) => refKey(x) === refKey(n.game))) row.games.push(n.game);
      named.push({ key, n });
    }
    const alikeKeys = new Set(named.flatMap(({ n }) => n.supporting.flatMap((r) => { const g = games.get(r.game); return g ? [lineupKey(g[r.side].picks as Picks)] : []; })));
    const rows = lineups.map((v) => ({ picks: v.picks, games: view(v.games) })).filter((v) => v.games.length);
    const plain = rows.filter((v) => !named.some((x) => x.key === lineupKey(v.picks)) && !alikeKeys.has(lineupKey(v.picks)))
      .sort((a, b) => b.games.length - a.games.length || b.games[0].date.localeCompare(a.games[0].date));
    const variations: ObservedLineup[] = [...named.flatMap(({ key, n }) => {
      const row = rows.find((v) => lineupKey(v.picks) === key);
      if (!row) return [];
      // Supporting games, grouped by lineup with any games discovery already filed for that lineup here.
      const refs = new Map<string, { picks: Picks; games: LineupRef[] }>();
      for (const r of n.supporting) {
        const g = games.get(r.game);
        if (!g) continue;
        const picks = g[r.side].picks as Picks, k = lineupKey(picks);
        if (!refs.has(k)) refs.set(k, { picks, games: [...(lineups.find((v) => lineupKey(v.picks) === k)?.games ?? [])] });
        const at = refs.get(k)!;
        if (!at.games.some((x) => refKey(x) === refKey(r))) at.games.push(r);
      }
      const alike: ObservedLineup[] = [...refs.values()].map((v) => ({ picks: v.picks, games: view(v.games) }));
      const read = readOf ? readView(readOf(row.picks)) : undefined;
      return [{ ...row, named: { name: n.name, note: n.note, ...(read ? { read } : {}), alike } }];
    }), ...plain];
    const proSwaps: Partial<Record<Role, ProSwap[]>> = {};
    for (const x of review.proSwaps.filter((p) => p.comp === s.id)) {
      const rows = x.games.flatMap((r) => { const g = games.get(r.game); return g ? [{ g, r }] : []; });
      (proSwaps[x.role] ??= []).push({
        champion: x.champion, games: view(x.games),
        series: new Set(rows.map(({ g }) => g.seriesId ?? g.id)).size,
        teams: new Set(rows.map(({ g, r }) => g[r.side].team)).size,
        patches: [...new Set(rows.map(({ g }) => g.patch))].sort((a, b) => comparePatch(b, a)),
      });
    }
    const historical: Partial<Record<Role, string>> = {};
    for (const role of review.historical.filter((h) => h.comp === s.id).flatMap((h) => h.roles)) {
      const last = lastPicked.get(`${role}:${s.slots[role].champion}`);
      if (last && newest && comparePatch(last, newest) < 0) historical[role] = last;
    }
    const hasSwaps = Object.keys(proSwaps).length > 0, hasHist = Object.keys(historical).length > 0;
    const parent = review.variants.find((v) => v.comp === s.id);
    const children = review.variants.filter((v) => v.parent === s.id && all.some((x) => x.id === v.comp)).map((v) => ({ id: v.comp, name: v.name }));
    const fam = review.families.find((f) => f.comps.includes(s.id));
    const family = fam && { id: fam.id, name: fam.name, note: fam.note,
      others: fam.comps.filter((c) => c !== s.id).flatMap((c) => { const x = all.find((y) => y.id === c); return x ? [{ id: x.id, name: x.name }] : []; }) };
    if (!d && !replays.length && !variations.length && !hasSwaps && !hasHist && !parent && !children.length && !family) continue;
    const { slots: _s, games: _g, winCondition: _w, why: _y, ...read } = d ?? ({} as DiscoveredComp);
    extras[s.id] = { ...(d ? { discovered: read } : {}), games: replays, variations, ...(hasSwaps ? { proSwaps } : {}), ...(hasHist ? { historical } : {}),
      ...(parent ? { variantOf: { parent: parent.parent, name: parent.name } } : {}), ...(children.length ? { variants: children } : {}),
      ...(family ? { family } : {}) };
  }
  // Archetypes: the core comp's card becomes the parent. Its named variations and whole member comps become rows; the
  // stored filings are untouched (a member comp keeps its own extras, variations and Draft Room link).
  for (const a of review.archetypes) {
    const core = all.find((x) => x.id === a.core), ex = extras[a.core];
    if (!core || !ex) continue;
    const jobs = (p: Picks) => { const j = jobsOf?.(p); return j ? { jobs: jobReads(j, a.carry) } : {}; };
    const ownGames = (id: string) => { const d = file.comps.find((c) => c.id === id); return d ? view(d.games) : extras[id]?.games ?? []; };
    const namedRow = (ref: LineupRef): { comp: string; v: ObservedLineup } | undefined => {
      for (const id of [a.core, ...a.members.flatMap((m) => m.comp ? [m.comp] : [])]) {
        const v = extras[id]?.variations.find((x) => x.named && x.games.some((g) => g.game === ref.game && g.side === ref.side));
        if (v) return { comp: id, v };
      }
    };
    const fromNamed = (ref: LineupRef, via: string[], name?: string, note?: string): ArchetypeRow | undefined => {
      const hit = namedRow(ref);
      if (!hit) return;
      const n = hit.v.named!;
      return { id: refKey(ref), kind: "named", name: name ?? n.name, note: note ?? n.note, via, picks: hit.v.picks, games: hit.v.games,
        ...jobs(hit.v.picks), ...(n.read ? { read: n.read } : {}), alike: n.alike, observed: [] };
    };
    const reviewed = new Set(a.review.map((r) => refKey(r.game)));
    const members = a.members.flatMap((m): ArchetypeRow[] => {
      if (m.game) { const row = fromNamed(m.game, m.via, m.name, m.note); return row ? [row] : []; }
      const c = all.find((x) => x.id === m.comp), cx = extras[m.comp!];
      if (!c || !cx) return [];
      cx.inArchetype = { parent: a.core, id: a.id };
      const picks = shellPicks(c), read = readOf ? readView(readOf(picks)) : undefined;
      // A member comp's own observed lineups travel with its row; a lineup under review is listed in the review block.
      const observed = cx.variations.filter((v) => !(v.named && v.games.some((g) => reviewed.has(refKey(g)))));
      return [{ id: c.id, kind: "comp", name: m.name ?? c.name, note: m.note ?? c.why, via: m.via, picks, games: ownGames(c.id), ...jobs(picks),
        ...(read ? { read } : {}), alike: [], observed }];
    });
    const rows = a.review.flatMap((r) => { const row = fromNamed(r.game, []); return row ? [{ ...row, why: r.why }] : []; });
    const corePicks = shellPicks(core);
    ex.archetype = { id: a.id, name: a.name, carry: a.carry, winCondition: a.winCondition, plan: a.plan,
      core: { id: core.id, kind: "core", name: core.name, note: a.coreNote, via: a.coreVia, picks: corePicks, games: ownGames(core.id), ...jobs(corePicks), alike: [], observed: [] },
      members, review: rows };
  }
  // A family links cards: a comp shown inside an archetype is reached through its parent's card.
  for (const [id, x] of Object.entries(extras)) {
    if (!x.family) continue;
    const others = x.family.others.map((o) => { const p = extras[o.id]?.inArchetype?.parent; return p ? { id: p, name: all.find((y) => y.id === p)?.name ?? p } : o; })
      .filter((o, i, list) => o.id !== id && o.id !== x.inArchetype?.parent && list.findIndex((y) => y.id === o.id) === i);
    x.family = { ...x.family, others };
  }
  return { shells: all, extras, lastAddition: file.lastAddition };
}
export type Library = ReturnType<typeof buildLibrary>;
