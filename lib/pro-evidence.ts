// The games behind a Draft Room "Pro · N games" label, one entry per game the label counted (lib/suggest.ts
// proSuggestions), with what each recorded game actually shows: tournament, patch, date, teams, side, result, both
// drafts when both are recorded, and how it relates to the current draft.
//
// Evidence integrity: every field comes from a stored draft or its Gol.gg game source. A result, side or enemy draft
// that isn't recorded is left out, never filled in. A game is a teammate pairing (the candidate on the same team as a
// locked pick). Current enemy picks on the other team make it an observed opposing matchup, never a counter: pick
// order is not recorded, so no game here can show a draft response. Display only; nothing here feeds any score.
import { gameKey } from "./draft-side";
import { comparePatchDesc } from "./evidence";
import { ROLES, type ProDraft, type Role, type Source } from "./schema";
import type { ProSuggestion } from "./suggest";

export type Picks = Record<Role, string>;

export interface EvidenceGame {
  key: string;
  event: string; // short event name
  patch?: string;
  date?: string;
  stage?: string;
  seriesGame?: string; // "Round 2 G1" style label as recorded
  team?: string; // the team that played the candidate
  opponent?: string;
  side?: "blue" | "red";
  won?: boolean; // only when the game record shows the winner
  picks?: Picks; // the candidate's team, when the draft is recorded
  enemyPicks?: Picks; // the other team, only when that side's draft is recorded too
  with: { id: string; role?: Role }[]; // locked picks on the candidate's team, same role
  facing: { id: string; role: Role }[]; // current enemy picks on the other team (observed matchup only)
  url?: string;
  verified: boolean; // the cited game page was read (refreshStatus verified)
  checked?: string | null;
  pending: boolean; // a supplied game link not yet read; no recorded draft
}

const roleOf = (picks: Picks, id: string) => ROLES.find((r) => picks[r] === id);

/** Newest first: date, then patch; undated games after dated ones of the same patch. */
export const newestFirst = (a: EvidenceGame, b: EvidenceGame) =>
  (b.date ?? "").localeCompare(a.date ?? "") || comparePatchDesc(a.patch, b.patch) || (a.seriesGame ?? "").localeCompare(b.seriesGame ?? "");

export function evidenceGames(pro: ProSuggestion, ctx: {
  drafts: ProDraft[]; sources: Record<string, Source>; enemy?: Partial<Record<Role, string>>;
}): EvidenceGame[] {
  const byId = new Map(ctx.drafts.map((d) => [d.id, d]));
  const byGame = new Map<string, ProDraft[]>();
  for (const d of ctx.drafts) byGame.set(gameKey(d), [...(byGame.get(gameKey(d)) ?? []), d]);
  const enemyIds = Object.values(ctx.enemy ?? {}).filter((x): x is string => !!x);
  return pro.evidence.map((e, i): EvidenceGame => {
    const d = e.draft ? byId.get(e.draft) : undefined;
    const src = e.source ? ctx.sources[e.source] : d ? d.sources.map((id) => ctx.sources[id]).find((s) => s?.type === "golgg-game") : undefined;
    if (!d) {
      // A supplied game link: what the link says, nothing more.
      return {
        key: `${e.source ?? e.label}-${i}`, event: e.event, patch: e.patch, date: e.date ?? src?.date, seriesGame: src?.seriesGame ?? e.label,
        team: src?.team, opponent: src?.opponent, with: (e.with ?? []).map((id) => ({ id })), facing: [],
        url: src?.url, verified: false, checked: src?.lastChecked ?? null, pending: true,
      };
    }
    const other = byGame.get(gameKey(d))?.find((x) => x.id !== d.id && x.team === d.opponent);
    const withIds = e.with ?? [];
    return {
      key: d.id, event: e.event, patch: d.patch ?? e.patch,
      date: d.date ?? src?.date, stage: d.stage || undefined, seriesGame: d.seriesGame, team: d.team, opponent: d.opponent,
      side: d.side, won: d.won, picks: d.picks, enemyPicks: other?.picks,
      with: withIds.flatMap((id) => { const role = roleOf(d.picks, id); return role ? [{ id, role }] : []; }),
      facing: other ? enemyIds.flatMap((id) => { const role = roleOf(other.picks, id); return role ? [{ id, role }] : []; }) : [],
      url: src?.url, verified: src?.refreshStatus === "verified", checked: src?.lastChecked ?? null, pending: false,
    };
  }).sort(newestFirst);
}
