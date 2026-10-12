// One-time migration: workbook (9 sheets) -> normalized /data/*.json.
// After the migration is verified, /data is the canonical source; this script refuses to
// overwrite existing data unless run with --force.
//
//   npm run import:workbook -- [path/to/workbook.xlsx] [--force]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import readExcelFile from "read-excel-file/node";
import { z } from "zod";
import {
  ATTRS, Files, ROLES, type BotPairing, type Champion, type CompShell, type GenGPattern,
  type MetaStat, type MidJunglePairing, type ObservedPairing, type PoolEntry, type ProDraft,
  type Duo, type ObservedBotShape, type Role, type Rule, type Source, type TopPick,
} from "../lib/schema";
import { ALIASES, ATTRIBUTES, NOTES } from "./migration/champion-attributes";
import { BOT_DECISIONS, MID_JUNGLE_DECISIONS } from "./migration/clash-decisions";
import { SHELL_JOBS } from "./migration/comp-shell-jobs";

const ROOT = resolve(import.meta.dirname, "..");
const DATA = join(ROOT, "data");
const DEFAULT_BOOK = join(ROOT, "workbook", "Clash_LCK_2026_Playoffs_FULL_Revamp.xlsx");
const TOURNAMENT = "LCK 2026 Season Playoffs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const bookPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_BOOK;

const report: { errors: string[]; warnings: string[]; decisions: string[] } = { errors: [], warnings: [], decisions: [] };

// ---------- helpers ----------
export const slug = (s: string) =>
  s.toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Cell = unknown;
function text(v: Cell): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

// Minimal 1-based sheet view over read-excel-file's row arrays.
class Sheet {
  constructor(readonly name: string, private readonly data: Cell[][]) {}
  get rowCount() { return this.data.length; }
  row(r: number): (string | null)[] { return [null, ...(this.data[r - 1] ?? []).map(text)]; }
  cell(a1: string): string | null {
    const m = a1.match(/^([A-Z]+)(\d+)$/)!;
    const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    return this.row(Number(m[2]))[col] ?? null;
  }
}
const num = (v: string | null) => (v == null ? null : Number(v));
const titleCase = (s: string) => s.toLowerCase();

// ---------- champions ----------
const champions: Champion[] = Object.entries(ATTRIBUTES).map(([name, row]) => {
  const [roles, damage, ...rest] = row;
  const values = rest.slice(0, ATTRS.length) as number[];
  const flags = (rest[ATTRS.length] as Champion["flags"] | undefined) ?? [];
  return {
    id: slug(name),
    name,
    aliases: Object.entries(ALIASES).filter(([, to]) => to === name).map(([from]) => from),
    roles,
    damage,
    attrs: Object.fromEntries(ATTRS.map((a, i) => [a, values[i]])) as Champion["attrs"],
    flags,
    reviewed: false,
    ...(NOTES[name] ? { note: NOTES[name] } : {}),
  };
});
const byName = new Map<string, string>();
for (const c of champions) {
  byName.set(c.name.toLowerCase(), c.id);
  for (const a of c.aliases) byName.set(a.toLowerCase(), c.id);
}
function champ(raw: string, where: string): string {
  const id = byName.get(raw.trim().toLowerCase());
  if (!id) {
    report.errors.push(`Unknown champion "${raw}" in ${where}`);
    return slug(raw);
  }
  return id;
}
// "Vi / Jarvan IV, Lee Sin" -> ids
const champList = (s: string | null, where: string) =>
  s ? s.split(/\s*[\/,]\s*/).filter(Boolean).map((n) => champ(n, where)) : [];
// "Jhin/Alistar, Lucian/Milio" -> duos (single names are dropped with a warning)
function duos(s: string | null, where: string) {
  if (!s) return [];
  return s.split(/\s*,\s*/).flatMap((d) => {
    const [bot, support] = d.split("/").map((x) => x.trim());
    if (!support) {
      report.warnings.push(`Bot shape "${d}" in ${where} names one champion, not a duo; skipped`);
      return [];
    }
    return [{ bot: champ(bot, where), support: champ(support, where) }];
  });
}
const identities = (s: string | null) =>
  s ? s.split(/\s*(?:\/|,|\+)\s*/).map((x) => slug(x)).filter(Boolean) : [];

// ---------- sources ----------
const sources = new Map<string, Source>();
function sourceType(url: string): Source["type"] {
  if (!/gol\.gg/.test(url)) return "other";
  if (/\/game\/stats\//.test(url)) return "golgg-game";
  if (/\/champion\//.test(url)) return "golgg-champion";
  if (/\/teams\//.test(url)) return "golgg-team";
  return "golgg-tournament";
}
function source(url: string, meta: Partial<Source> = {}): string {
  const clean = url.trim();
  const existing = [...sources.values()].find((s) => s.url === clean);
  if (existing) {
    Object.assign(existing, Object.fromEntries(Object.entries(meta).filter(([k]) => !(k in existing) || existing[k as keyof Source] == null)));
    return existing.id;
  }
  const type = sourceType(clean);
  const path = clean.replace(/^https?:\/\/[^/]+\//, "");
  // Short stable ids: game id, champion/team numeric id, or the tournament page kind.
  const num = path.match(/(?:stats)\/(\d+)/)?.[1];
  const page = path.match(/tournament\/tournament-([a-z]+)/)?.[1];
  const idBase = type === "golgg-tournament" && page ? `golgg-tournament-${page}` : num ? `${type}-${num}` : `${type}-${slug(decodeURIComponent(path)).slice(0, 40)}`;
  let sid = idBase;
  for (let i = 2; [...sources.values()].some((s) => s.id === sid); i++) sid = `${idBase}-${i}`;
  sources.set(sid, {
    id: sid, url: clean, type, tournament: TOURNAMENT, ...meta,
    lastChecked: null, refreshStatus: "not-refreshed", origin: "workbook",
  });
  return sid;
}
const urls = (s: string | null) => (s ? s.split(/\s+|,\s*/).filter((u) => /^https?:\/\//.test(u)) : []);

// ---------- workbook reading ----------
type Row = Record<string, string | null>;
function header(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function table(ws: Sheet, headerRow = 4): Row[] {
  const hdr = ws.row(headerRow).map((v) => (v ? header(v) : null));
  const rows: Row[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const vals = ws.row(r);
    const filled = vals.filter(Boolean);
    if (filled.length === 1 && vals[1] && vals[1] === vals[1].toUpperCase() && /[A-Z]/.test(vals[1])) break; // new section
    if (filled.length < 3 || !vals[1]) continue;
    const row: Row = {};
    hdr.forEach((h, i) => { if (h) row[h] = vals[i] ?? null; });
    rows.push(row);
  }
  return rows;
}

async function main() {
  if (existsSync(join(DATA, "bot-pairings.json")) && !force) {
    console.error("data/ already exists and is the canonical source. Re-run with --force only to redo the migration.");
    process.exit(1);
  }
  const book = (await readExcelFile(bookPath)) as { sheet: string; data: Cell[][] }[];
  const sheet = (name: string) => {
    const ws = book.find((s) => s.sheet === name);
    if (!ws) throw new Error(`Missing sheet ${name}`);
    return new Sheet(name, ws.data);
  };
  const sheetsUsed = new Set<string>();
  const use = (name: string) => { sheetsUsed.add(name); return sheet(name); };

  // START HERE: tournament context, changes, rules
  const sh = use("START HERE");
  const cell = (a: string) => sh.cell(a);
  const games = num(cell("B5")) ?? 0;
  const patch = cell("B7") ?? undefined;
  const tournamentSource = source("https://gol.gg/tournament/tournament-stats/LCK%202026%20Season%20Playoffs/", { type: "golgg-tournament" });

  // ---------- pro drafts ----------
  const exact = table(use("EXACT DRAFTS"));
  const geng = table(use("GENG PATTERNS"));
  const drafts = new Map<string, ProDraft>();
  const picksOf = (r: Row, where: string) => Object.fromEntries(
    ROLES.map((role) => [role, champ(r[role.toLowerCase()] ?? "", where)])) as ProDraft["picks"];
  const stageOf = (sg: string) => sg.replace(/\s*G\d+$/, "");
  for (const r of exact) {
    const sg = r.series_game!;
    const team = r.team!;
    const other = exact.find((o) => o.series_game === sg && o.team !== team)?.team ?? "unknown";
    const id = `lck26po-${slug(sg)}-${slug(team)}`;
    const src = urls(r.source).map((u) => source(u, { team, opponent: other, seriesGame: sg, patch }));
    drafts.set(id, {
      id, tournament: TOURNAMENT, seriesGame: sg, stage: stageOf(sg), team, opponent: other, patch,
      picks: picksOf(r, `EXACT DRAFTS ${sg} ${team}`), read: r.comp_read ?? "", sources: src,
    });
  }
  for (const r of geng) {
    const sg = r.stage!;
    const id = `lck26po-${slug(sg)}-${slug("Gen.G")}`;
    const src = urls(r.source).map((u) => source(u, { team: "Gen.G", opponent: r.opponent!, seriesGame: sg, patch }));
    const existing = drafts.get(id);
    const picks = picksOf(r, `GENG PATTERNS ${sg}`);
    if (existing) {
      if (JSON.stringify(existing.picks) !== JSON.stringify(picks)) report.errors.push(`Gen.G ${sg} picks differ between GENG PATTERNS and EXACT DRAFTS`);
      existing.note = r.draft_identity_takeaway ?? undefined;
      continue;
    }
    drafts.set(id, {
      id, tournament: TOURNAMENT, seriesGame: sg, stage: stageOf(sg), team: "Gen.G", opponent: r.opponent!, patch,
      picks, read: r.draft_identity_takeaway ?? "", sources: src,
    });
  }
  const proDrafts = [...drafts.values()];
  report.decisions.push(`Merged GENG PATTERNS into EXACT DRAFTS: ${proDrafts.length} unique team-games (4 Gen.G finals games were in both sheets).`);

  const backing = (a: Role, aId: string, b: Role, bId: string) =>
    proDrafts.filter((d) => d.picks[a] === aId && d.picks[b] === bId);
  function observed(anchorRole: Role, anchor: string, partnerRole: Role, claims: string[], claimSources: string[]): ObservedPairing[] {
    const out = new Map<string, ObservedPairing>();
    for (const d of proDrafts.filter((d) => d.picks[anchorRole] === anchor)) {
      const p = d.picks[partnerRole];
      const o = out.get(p) ?? { champion: p, context: TOURNAMENT, era: "current-playoffs", proDraftIds: [], backedByGame: true, sources: [] };
      o.proDraftIds.push(d.id);
      o.sources.push(...d.sources.filter((s) => !o.sources.includes(s)));
      out.set(p, o);
    }
    for (const c of claims) {
      if (out.has(c)) continue;
      out.set(c, { champion: c, context: TOURNAMENT, era: "current-playoffs", proDraftIds: [], backedByGame: false, sources: claimSources });
      report.warnings.push(`Observed ${anchor} + ${c} is cited by the workbook but not shown in any recorded draft (kept, flagged unbacked)`);
    }
    return [...out.values()].sort((x, y) => y.proDraftIds.length - x.proDraftIds.length);
  }

  // ---------- bot pairings ----------
  const botPairings: BotPairing[] = table(use("BOT PAIRINGS")).map((r) => {
    const name = r.bot_pick!;
    const id = champ(name, "BOT PAIRINGS");
    const d = BOT_DECISIONS[name];
    const where = `BOT PAIRINGS ${name}`;
    const src = urls(r.source_urls).map((u) => source(u));
    const sheetDefault = champList(r.clash_default_support, where);
    const sheetAlts = champList(r.secondary_alt_supports, where);
    const clashDefault = d?.clashDefault ? d.clashDefault.map((n) => champ(n, where)) : sheetDefault;
    const alternatives = d?.alternatives ? d.alternatives.map((n) => champ(n, where)) : sheetAlts.filter((a) => !clashDefault.includes(a));
    if (d) report.decisions.push(`${name}: ${d.why}`);
    const claims = [...champList(r.observed_playoff_supports, where), ...(d?.extraObservedClaims ?? []).map((n) => champ(n, where))];
    return {
      champion: id, role: "BOT", clashDefault, alternatives,
      alternativeNotes: Object.fromEntries(Object.entries(d?.alternativeNotes ?? {}).map(([k, v]) => [champ(k, where), v])),
      observedProPairings: observed("BOT", id, "SUPPORT", claims, src),
      surrounding: { jungle: champList(r.best_jungle_direction, where), mid: champList(r.best_mid_direction, where) },
      logic: { warning: d?.logicWarning ?? r.draft_warning ?? undefined },
      confidence: slug(r.confidence ?? "medium") as BotPairing["confidence"],
      identities: identities(r.lane_comp_identity),
      playoffRead: r.current_playoff_read ?? undefined,
      status: slug(r.status ?? "current").replace(/-.*/, "") === "keep" ? "keep" : (slug(r.status ?? "current").split("-")[0] as BotPairing["status"]),
      sources: src,
    };
  });

  // ---------- mid / jungle ----------
  // Bot-lane shapes on mid/jungle/top rows stay Clash only when the duo is in that bot's Clash record (or the bot
  // has no Clash record yet). Pro-only duos move to observedBotShapes, citing only drafts that show the duo.
  const splitShapes = (role: Role, anchor: string, list: Duo[]) => {
    const clash: Duo[] = [], observedShapes: ObservedBotShape[] = [];
    for (const sh of list) {
      const b = botPairings.find((x) => x.champion === sh.bot);
      if (!b) { report.warnings.push(`Bot shape ${sh.bot}+${sh.support} on ${anchor}: ${sh.bot} has no Clash record; dropped from Clash`); continue; }
      if ([...b.clashDefault, ...b.alternatives].includes(sh.support)) { clash.push(sh); continue; }
      const duoDrafts = proDrafts.filter((x) => x.picks.BOT === sh.bot && x.picks.SUPPORT === sh.support);
      const withAnchor = duoDrafts.filter((x) => x.picks[role] === anchor);
      const used = withAnchor.length ? withAnchor : duoDrafts;
      const sources = used.length
        ? [...new Set(used.flatMap((x) => x.sources))]
        : b.observedProPairings.find((o) => o.champion === sh.support)?.sources ?? [];
      if (!sources.length) { report.warnings.push(`Pro-only bot shape ${sh.bot}+${sh.support} on ${anchor} has no source; dropped from Clash`); continue; }
      observedShapes.push({ bot: sh.bot, support: sh.support, withAnchor: withAnchor.length > 0, proDraftIds: used.map((x) => x.id), sources });
      report.decisions.push(`${anchor}: bot shape ${sh.bot}+${sh.support} is pro-only; stored as observed evidence`);
    }
    return { clash, observedShapes };
  };

  const midJungle: MidJunglePairing[] = table(use("MID-JGL")).map((r) => {
    const name = r.anchor!;
    const role = r.role as "MID" | "JUNGLE";
    const id = champ(name, "MID-JGL");
    const where = `MID-JGL ${name}`;
    const d = MID_JUNGLE_DECISIONS[name];
    const src = urls(r.source_urls).map((u) => source(u));
    const clashDefault = d?.clashDefault ? d.clashDefault.map((n) => champ(n, where)) : champList(r.primary_pair, where);
    const alternatives = d?.alternatives ? d.alternatives.map((n) => champ(n, where)) : champList(r.secondary_pairings, where);
    if (d) report.decisions.push(`${name}: ${d.why}`);
    const status = slug(r.status ?? "current");
    const shapes = splitShapes(role, id, duos(r.best_bot_shape, where));
    return {
      anchor: id, role, clashDefault, alternatives, alternativeNotes: {},
      botShapes: shapes.clash,
      observedBotShapes: shapes.observedShapes,
      observedProPairings: observed(role, id, role === "MID" ? "JUNGLE" : "MID", [], src),
      history: (d?.history ?? []).map((h) => ({ partner: champ(h.partner, where), era: h.era, note: h.note })),
      logic: {},
      confidence: (slug(r.confidence ?? "medium").replace("-current", "")) as MidJunglePairing["confidence"],
      identities: identities(r.comp_identity),
      playoffRead: r.playoff_evidence_why ?? undefined,
      status: status.startsWith("major") ? "updated" : (status as MidJunglePairing["status"]),
      sources: src,
    };
  });

  // ---------- top ----------
  const topRows = table(use("TOP"));
  const topPicks: TopPick[] = topRows.map((r) => {
    const name = r.top_pick!;
    const id = champ(name, "TOP");
    const where = `TOP ${name}`;
    const src = urls(r.source_urls).map((u) => source(u));
    const jungleFromDrafts = observed("TOP", id, "JUNGLE", [], []);
    const shapes = splitShapes("TOP", id, duos(r.bot_support_shape, where));
    return {
      champion: id, blindGrade: r.blind_grade as TopPick["blindGrade"],
      surrounding: { jungle: champList(r.jungle_fits, where), mid: champList(r.mid_fits, where), botShapes: shapes.clash },
      observedBotShapes: shapes.observedShapes,
      observedProPairings: jungleFromDrafts,
      logic: { gives: r.what_it_gives_you ?? "", avoid: r.do_not_draft_with ?? "" },
      identities: identities(r.comp_identity),
      playoffRead: r.playoff_read ?? undefined,
      status: /no longer|downgrad/i.test(r.playoff_read ?? "") ? "downgraded" : "current",
      sources: src,
    };
  });

  // ---------- meta ----------
  // Tournament aggregates only: presence is derived at read time and recorded-game counts are never stored here.
  const metaRows = table(use("PLAYOFF META"));
  const stats: MetaStat[] = metaRows.map((r) => {
    const id = champ(r.champion!, "PLAYOFF META");
    const picks = num(r.picks)!, bans = num(r.bans)!;
    const [role, flex] = r.role!.split("/");
    return {
      champion: id, role: role as Role, ...(flex && flex !== "FLEX" ? { flexRole: flex as Role } : {}),
      picks, bans, winRate: num(r.win_rate)!,
      lowSample: picks < 5, priorityRead: r.priority_read ?? undefined,
      note: r.draft_note ?? undefined, sources: urls(r.source).map((u) => source(u, { type: "golgg-champion" })),
    };
  });
  for (const r of topRows) {
    const id = champ(r.top_pick!, "TOP");
    const picks = num(r.playoff_picks)!, wr = num(r.playoff_wr)!;
    const existing = stats.find((s) => s.champion === id);
    if (existing) {
      if (existing.picks !== picks || Math.abs((existing.winRate ?? 0) - wr) > 1e-6) report.errors.push(`TOP and PLAYOFF META disagree for ${r.top_pick}`);
      continue;
    }
    stats.push({
      champion: id, role: "TOP", picks, bans: null, winRate: wr, lowSample: picks < 5,
      sources: urls(r.source_urls).map((u) => source(u)),
    });
  }
  report.decisions.push("Top-lane picks/WR stored once in meta.json (TOP sheet values merged; bans unknown for champions without a PLAYOFF META row).");

  // ---------- pool ----------
  const poolSheet = use("CHAMP POOL");
  const CORE_REASONS: Record<string, string> = {
    locke: "Only 3 picks, but the clearest new repeated pairing: Skarner+Locke in T1-DK G3 and HLE Finals G4 (2-1 overall, 5 bans).",
  };
  const pool: PoolEntry[] = table(poolSheet).map((r) => {
    const role = r.role as Role;
    const where = `CHAMP POOL ${role}`;
    const core = champList(r.core_pool, where);
    return {
      role, core, depth: champList(r.good_depth, where), flex: champList(r.prepared_flex_options, where),
      coreReasons: Object.fromEntries(core.filter((c) => CORE_REASONS[c]).map((c) => [c, CORE_REASONS[c]])),
      changed: r.what_changed ?? "", sources: urls(r.main_source).map((u) => source(u)),
    };
  });
  // source index at the bottom of CHAMP POOL
  for (let r = 1; r <= poolSheet.rowCount; r++) {
    if (poolSheet.cell(`A${r}`) !== "SOURCE INDEX") continue;
    for (let i = r + 2; i <= poolSheet.rowCount; i++) {
      const [label, use_, url] = ["A", "B", "C"].map((c) => poolSheet.cell(`${c}${i}`));
      if (url && /^https?:/.test(url)) source(url, {});
      else if (label) report.warnings.push(`Source index row without URL: ${label} (${use_})`);
    }
  }

  // ---------- comp shells ----------
  const shellRows = table(use("COMP SHELLS"));
  const similar = (role: Role, id: string) => {
    const me = champions.find((c) => c.id === id)!;
    const roleChamps = champions.filter((c) => c.roles.includes(role) && c.id !== id);
    const dist = (c: Champion) => ATTRS.reduce((s, a) => s + Math.abs(c.attrs[a] - me.attrs[a]), 0) + (c.damage === me.damage ? 0 : 2);
    return roleChamps.sort((a, b) => dist(a) - dist(b)).slice(0, 3).map((c) => c.id);
  };
  const shells: CompShell[] = shellRows.map((r) => {
    const name = r.comp_shell!;
    const where = `COMP SHELLS ${name}`;
    const picks = picksOf(r, where);
    const match = proDrafts.find((d) => ROLES.every((role) => d.picks[role] === picks[role]));
    const kindText = r.observed_generalized ?? "";
    const observedKind = /^observed/i.test(kindText);
    if (observedKind && !match) report.errors.push(`${name} is marked observed but matches no recorded draft`);
    const jobs = SHELL_JOBS[name];
    if (!jobs) report.errors.push(`No drafted jobs for comp shell ${name}`);
    return {
      id: slug(name), name, kind: observedKind ? "observed" : "generalized",
      ...(observedKind ? { observedBy: kindText.replace(/^Observed\s*/i, ""), proDraftId: match?.id } : {}),
      slots: Object.fromEntries(ROLES.map((role, i) => [role, { champion: picks[role], job: jobs?.jobs[i] ?? "", swaps: similar(role, picks[role]) }])) as CompShell["slots"],
      identities: identities(r.identity), winCondition: jobs?.winCondition ?? "", why: r.why_it_works ?? "",
      difficulty: slug(r.execution_difficulty ?? "medium") as CompShell["difficulty"],
      sources: urls(r.source).map((u) => source(u)),
    };
  });

  // ---------- Gen.G patterns (computed from Gen.G drafts + sheet context) ----------
  const gengSheet = use("GENG PATTERNS");
  const gengDrafts = proDrafts.filter((d) => d.team === "Gen.G");
  const patterns: GenGPattern[] = [{
    kind: "context", title: "Playoff identity", era: "current-playoffs",
    detail: gengSheet.cell("A2") ?? "", proDraftIds: gengDrafts.map((d) => d.id), sources: [tournamentSource],
  }, {
    kind: "context", title: "Azir + Skarner is an earlier-2026 tendency", era: "earlier-2026",
    detail: "The previous board treated Azir+Skarner as Gen.G's signature pairing from earlier in 2026. None of the recorded playoff games used it; do not treat it as current.",
    proDraftIds: [], sources: [tournamentSource],
  }];
  for (const role of ROLES) {
    const counts = new Map<string, string[]>();
    for (const d of gengDrafts) counts.set(d.picks[role], [...(counts.get(d.picks[role]) ?? []), d.id]);
    const names = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
    const nameOf = (id: string) => champions.find((c) => c.id === id)?.name ?? id;
    for (const [c, ids] of names.filter(([, ids]) => ids.length >= 2)) {
      patterns.push({ kind: "recurring-pick", title: `${nameOf(c)} ${titleCase(role)} x${ids.length}`, detail: `Gen.G picked ${nameOf(c)} in ${ids.length} of ${gengDrafts.length} recorded playoff games.`, era: "current-playoffs", proDraftIds: ids, sources: ids.flatMap((i) => drafts.get(i)!.sources) });
    }
    if (names.length >= Math.ceil(gengDrafts.length * 0.6)) {
      patterns.push({ kind: "role-flex", title: `${role[0]}${titleCase(role.slice(1))} rotation: ${names.length} champions in ${gengDrafts.length} games`, detail: names.map(([c, ids]) => `${nameOf(c)} (${ids.length})`).join(", "), era: "current-playoffs", proDraftIds: gengDrafts.map((d) => d.id), sources: [tournamentSource] });
    }
  }
  for (const [a, b] of [["MID", "JUNGLE"], ["BOT", "SUPPORT"]] as [Role, Role][]) {
    const pairs = new Map<string, string[]>();
    for (const d of gengDrafts) { const k = `${d.picks[a]}+${d.picks[b]}`; pairs.set(k, [...(pairs.get(k) ?? []), d.id]); }
    for (const [k, ids] of pairs) if (ids.length >= 2) patterns.push({ kind: "combination", title: k, detail: `Repeated in ${ids.length} games.`, era: "current-playoffs", proDraftIds: ids, sources: [] });
    if (![...pairs.values()].some((ids) => ids.length >= 2)) report.decisions.push(`Gen.G never repeated a ${a}/${b} pairing in recorded games; no combination pattern stored.`);
  }

  // ---------- rules + changes ----------
  const RULE_LAYERS: Rule["layer"][] = ["clash", "logic", "logic", "logic", "clash", "clash"];
  const rules: Rule[] = [];
  for (let r = 32; r <= 50; r++) {
    const t = sh.cell(`H${r}`);
    if (t) rules.push({ id: `rule-${rules.length + 1}`, layer: RULE_LAYERS[rules.length] ?? "clash", text: t });
  }
  const changes = [];
  for (let r = 12; r <= 19; r++) {
    const topic = sh.cell(`A${r}`), note = sh.cell(`B${r}`);
    if (topic && note) changes.push({ topic, note });
  }

  const meta = {
    tournament: {
      name: TOURNAMENT, games, draftMode: cell("B6") ?? "", patch: patch ?? "", final: cell("B8") ?? "",
      recordedGames: new Set(proDrafts.map((d) => d.seriesGame)).size, sources: [tournamentSource],
    },
    stats: stats.sort((a, b) => b.picks - a.picks),
    changes,
  };

  // ---------- write + validate ----------
  // counters.json, proposed-synergy.json, pro-games.json, pro-builds.json and build-assets.json (the daily Gol.gg
  // refresh) are not in the workbook; the importer leaves them alone.
  const out: Record<Exclude<keyof typeof Files, "counters.json" | "proposed-synergy.json" | "pro-games.json" | "pro-builds.json" | "build-assets.json">, unknown> = {
    "champions.json": champions,
    "sources.json": [...sources.values()],
    "bot-pairings.json": botPairings,
    "mid-jungle.json": midJungle,
    "top.json": topPicks,
    "pro-drafts.json": proDrafts,
    "comp-shells.json": shells,
    "pool.json": pool,
    "meta.json": meta,
    "geng.json": patterns,
    "rules.json": rules,
  };
  for (const [file, value] of Object.entries(out)) {
    const parsed = (Files[file as keyof typeof Files] as z.ZodTypeAny).safeParse(value);
    if (!parsed.success) report.errors.push(`${file}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  const missing = ["START HERE", "BOT PAIRINGS", "MID-JGL", "TOP", "GENG PATTERNS", "COMP SHELLS", "PLAYOFF META", "CHAMP POOL", "EXACT DRAFTS"].filter((s) => !sheetsUsed.has(s));
  if (missing.length) report.errors.push(`Sheets not used: ${missing.join(", ")}`);
  if (report.errors.length) {
    console.error("Import failed:\n- " + report.errors.join("\n- "));
    process.exit(1);
  }
  mkdirSync(DATA, { recursive: true });
  for (const [file, value] of Object.entries(out)) writeFileSync(join(DATA, file), JSON.stringify(value, null, 2) + "\n");

  const md = [
    "# Workbook import report",
    "",
    `Source: \`${bookPath.replace(ROOT + "/", "")}\`, sheets used: ${[...sheetsUsed].length}/9 (${[...sheetsUsed].join(", ")}).`,
    "",
    `Champions: ${champions.length} · Sources: ${sources.size} (all \`not-refreshed\`, origin workbook) · Pro drafts: ${proDrafts.length} team-games from ${meta.tournament.recordedGames} of ${games} games · Bot pairings: ${botPairings.length} · Mid/jungle: ${midJungle.length} · Top: ${topPicks.length} · Comp shells: ${shells.length} · Meta stats: ${stats.length}`,
    "",
    "## Decisions applied during import",
    "",
    ...report.decisions.map((d) => `- ${d}`),
    "",
    "## Warnings",
    "",
    ...report.warnings.map((w) => `- ${w}`),
    "",
  ].join("\n");
  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeFileSync(join(ROOT, "docs", "import-report.md"), md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
