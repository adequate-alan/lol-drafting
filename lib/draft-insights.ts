// Draft Insights (alan, 2026-11-12): drafting lessons distilled from approved creator videos (data/draft-insights.json).
// A learning layer only: nothing in scoring, ranking, Synergies, Counters, kits, pool tiers or Comp Library reads it
// (tests/draft-insights.test.ts). The Draft Room and Comp Check may link to a lesson; a link never changes a read.
import type { DraftInsight, DraftInsights } from "./schema";

export const BASIS_LABEL: Record<DraftInsight["claims"][number]["basis"], string> = {
  mechanic: "Game mechanic",
  "creator-stat": "Creator stat",
  opinion: "Creator opinion",
  interpretation: "Interpretation",
};
export const BASIS_TITLE: Record<DraftInsight["claims"][number]["basis"], string> = {
  mechanic: "How the champion's ability works, from its official description",
  "creator-stat": "Ranked statistics the creator reported on screen; not checked independently and tied to its patch",
  opinion: "The creator's judgement or classification",
  interpretation: "Our reading of what the lesson means for a draft",
};

/** "12:34" from seconds. */
export const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
/** The video at a moment, as YouTube's own link. */
export const momentUrl = (url: string, t: number) => `${url}${url.includes("?") ? "&" : "?"}t=${t}s`;

/** Lessons matching the filters, in the data's order. Text search covers every written field and the champions' names. */
export function filterInsights(data: DraftInsights, f: { category?: string; champion?: string; video?: string; q?: string }, names: Record<string, string> = {}) {
  const q = f.q?.trim().toLowerCase();
  return data.insights.filter((i) =>
    (!f.category || i.category === f.category)
    && (!f.champion || championsOf(i).includes(f.champion))
    && (!f.video || i.sources.some((s) => s.video === f.video))
    && (!q || textOf(i, names).includes(q)));
}

/** Every champion a lesson names: its related list plus the champions in its groups, matchups and showcase. */
export const championsOf = (i: DraftInsight) => [...new Set([
  ...i.related.champions, ...(i.groups ?? []).flatMap((g) => g.champions),
  ...(i.matchups ?? []).flatMap((m) => (m.kind === "versus" ? [...m.a, ...m.b] : m.a)), ...(i.showcase ?? []),
])];

const textOf = (i: DraftInsight, names: Record<string, string>) => [
  i.title, i.takeaway, i.caveat, i.principle, i.why, i.example.text, i.when, i.limits, i.siteNote ?? "", i.disagreement ?? "",
  ...i.claims.map((c) => c.text), ...i.related.concepts, ...championsOf(i).map((c) => names[c] ?? c),
  ...(i.groups ?? []).flatMap((g) => [g.label, g.plan, g.vs, g.note ?? ""]), ...(i.matchups ?? []).map((m) => m.text),
].join(" ").toLowerCase();

/** Every champion a lesson names, for the champion filter. */
export const insightChampions = (data: DraftInsights) => [...new Set(data.insights.flatMap(championsOf))];

/** A video's lessons, each at its earliest moment in that video, in video order. */
export function lessonsOfVideo(data: DraftInsights, video: string) {
  return data.insights
    .map((i) => ({ insight: i, t: Math.min(...i.sources.filter((s) => s.video === video).map((s) => s.t)) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
}

/** Patches a lesson's creator statistics come from ("26.21", "26.21–26.22"); none when it rests on no statistic. */
export function statPatches(i: DraftInsight) {
  const ps = [...new Set(i.claims.filter((c) => c.basis === "creator-stat" && c.patch).map((c) => c.patch!))].sort();
  return ps.length ? (ps.length === 1 ? ps[0] : `${ps[0]}–${ps[ps.length - 1]}`) : undefined;
}

/** Link to one lesson on the Draft Insights page (opens it). */
export const lessonHref = (id: string) => `/insights?lesson=${id}`;

// Selective "Learn why" links (alan, 2026-11-12: a lesson only where it explains the decision in front of the user).
// A Comp Check finding id, or the Counter card's "no clear kit reason", maps to the lesson that explains it. Links only:
// the finding, its tier and every score stay exactly as the plan read and the ranking produce them.
export const FINDING_LESSONS: Record<string, string> = {
  "duo-engage-no-follow": "match-support-to-adc",
  "duo-engage-ranged-follow": "match-support-to-adc",
  "duo-short-no-peel": "match-support-to-adc",
  "plan:anti-engage": "disengage-is-a-cooldown",
  "plan:survive": "lose-lane-by-design",
  "plan:lanes": "convert-the-lead",
};
export const COUNTER_NO_READ_LESSON = "abilities-against-abilities";
