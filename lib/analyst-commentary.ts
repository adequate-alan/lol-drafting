// Analyst perspectives (alan, 2026-11-01): attributed, paraphrased opinions of named analysts about a recorded Pro Drafts
// game, read from data/analyst-commentary.json. Pure helpers shared by the Pro Drafts panel and the tests.
// Informational only: nothing here is read by scoring, ranking, Synergies, General Draft Logic, Counters, kits, pool
// tiers or the Comp Library, and the game's result never marks an opinion right or wrong. Disagreements are shown side
// by side, never resolved.
import type { AnalystCommentary, CommentaryObservation } from "./schema";

export const KIND_LABEL: Record<CommentaryObservation["kind"], string> = {
  prediction: "Prediction",
  preference: "Draft preference",
  matchup: "Matchup",
  interaction: "Interaction",
  priority: "Pick / ban priority",
  "win-condition": "Win condition",
  tradeoff: "Tradeoff",
  reflection: "Post-game read",
};

export const CHECK_LABEL: Record<NonNullable<CommentaryObservation["check"]>["status"], string> = {
  corroborated: "Matches recorded games",
  contradicted: "Recorded games disagree",
  unverifiable: "Not checkable in our records",
  speculation: "Speculation",
};

/** Observations per Gol.gg game id: what the page needs to show "Analyst perspectives (n)" without loading the text. */
export function commentaryCounts(data: Pick<AnalystCommentary, "observations">): Record<number, number> {
  const out: Record<number, number> = {};
  for (const o of data.observations) out[o.game] = (out[o.game] ?? 0) + 1;
  return out;
}

/** Another analyst's take on the same strategic question in the same game: agrees when the stances match. */
export interface Relation { creator: string; name: string; agrees: boolean; question: string }
export interface PerspectiveItem extends CommentaryObservation { href: string; time: string; relations: Relation[] }
export interface CreatorBlock { creator: string; name: string; video: AnalystCommentary["videos"][string]; items: PerspectiveItem[] }

export const formatTime = (t: number) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

/** A link to the exact moment: YouTube's `t` parameter in seconds. */
export function timeLink(url: string, t: number): string {
  const u = new URL(url);
  u.searchParams.set("t", `${t}s`);
  return u.toString();
}

/** One game's observations, grouped by analyst (in the order they first speak about the game), draft before
 *  post-game and by timestamp inside each phase, each with the other analysts' takes on the same question. */
export function perspectivesFor(data: AnalystCommentary, game: number): CreatorBlock[] {
  const obs = data.observations.filter((o) => o.game === game);
  const blocks = new Map<string, CreatorBlock>();
  const phase = (o: CommentaryObservation) => (o.phase === "draft" ? 0 : 1);
  for (const o of [...obs].sort((a, b) => phase(a) - phase(b) || a.t - b.t)) {
    const video = data.videos[o.video];
    if (!video) continue;
    let block = blocks.get(o.creator);
    if (!block) blocks.set(o.creator, (block = { creator: o.creator, name: data.creators[o.creator]?.name ?? o.creator, video, items: [] }));
    const relations: Relation[] = [];
    const topic = o.topic ? data.topics[o.topic] : undefined;
    if (o.topic && topic && o.stance) {
      const seen = new Set<string>();
      for (const other of obs) {
        if (other.creator === o.creator || other.topic !== o.topic || !other.stance || seen.has(other.creator)) continue;
        seen.add(other.creator);
        relations.push({ creator: other.creator, name: data.creators[other.creator]?.name ?? other.creator, agrees: other.stance === o.stance, question: topic.question });
      }
    }
    block.items.push({ ...o, href: timeLink(video.url, o.t), time: formatTime(o.t), relations });
  }
  return [...blocks.values()];
}

/** What a mentioned champion was in the game, in words: whose pick or ban, or an option a side did not take (and who
 *  did pick it, when the other side did). Never implies two mentions in one sentence were teammates. */
export function mentionLabel(m: CommentaryObservation["champions"][number], teams: Record<"blue" | "red", string>,
  picks: Record<"blue" | "red", string[]>): string {
  const own = teams[m.side], other = m.side === "blue" ? "red" : "blue";
  if (m.as === "pick") return own;
  if (m.as === "ban") return `Banned by ${own}`;
  return picks[other].includes(m.id) ? `Option for ${own} · picked by ${teams[other]}` : `Option for ${own} · not picked`;
}
