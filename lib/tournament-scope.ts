// Tournament scopes for the pro-evidence filters (alan, 2026-10-23): every tournament on its own, the Worlds main event
// split by stage (Swiss, Knockouts) from each game's Gol.gg stage, and All Worlds over every Worlds stage (play-in, main
// event, a later stage Gol.gg lists apart). A scope only ever selects games; numbers are counted inside it, never mixed
// with another scope's denominator.
//
// A scope key is an event id ("demacia-cup-2026", "worlds-2026-play-in"), a main-event stage ("worlds-2026:swiss"), or
// a Worlds family ("worlds-2026-all"). A game's own key is its event, or its event and stage for the main event.

export type Phase = "swiss" | "knockouts";
const PHASE_LABEL: Record<Phase, string> = { swiss: "Swiss", knockouts: "Knockouts" };

const MAIN = /^worlds-(\d{4})$/;
const FAMILY = /^(worlds-\d{4})(?:$|-)/;

/** The Worlds main event's stage of one game: knockout rounds by Gol.gg's stage name, every other round Swiss. */
export function phaseOf(event: string, stage?: string): Phase | undefined {
  if (!MAIN.test(event)) return undefined;
  return stage && /quarter|semi|final|knockout|playoff|bracket/i.test(stage) ? "knockouts" : "swiss";
}

/** The narrowest scope a game belongs to. */
export const scopeKey = (event: string, stage?: string) => {
  const p = phaseOf(event, stage);
  return p ? `${event}:${p}` : event;
};

/** "worlds-2026-all" for every Worlds 2026 stage; undefined for other tournaments. */
export const familyOf = (event: string) => event.match(FAMILY)?.[1]?.concat("-all");

/** Whether a game (or contribution) with scope key `key` is inside the chosen scope `value` (empty = everything). */
export function inTournament(value: string | undefined, key: string): boolean {
  if (!value) return true;
  const event = key.split(":")[0];
  return key === value || event === value || familyOf(event) === value;
}

export interface ScopeEvent { id: string; short: string; status?: "ongoing" | "complete" }
export interface ScopeChoice { value: string; label: string; games: number; ongoing: boolean }

/** The label of a scope: Worlds names drop the year and the Gol.gg wording ("Worlds Swiss", "Worlds Play-In"). */
export function scopeLabel(value: string, events: ScopeEvent[]): string {
  if (/^worlds-\d{4}-all$/.test(value)) return "All Worlds";
  const [event, phase] = value.split(":") as [string, Phase | undefined];
  if (phase) return `Worlds ${PHASE_LABEL[phase]}`;
  if (MAIN.test(event)) return "Worlds Main Event";
  if (/^worlds-\d{4}-play-in$/.test(event)) return "Worlds Play-In";
  return events.find((e) => e.id === event)?.short ?? event;
}

/**
 * The tournament menu for a set of games (each with its scope key): All Worlds first when more than one Worlds scope
 * has games, then each main-event stage, the whole main event only once it has two stages, the play-in and any other
 * Worlds stage, then every other tournament in `events` order. Each choice carries its own game count.
 */
export function scopeChoices(items: { key: string; games: number }[], events: ScopeEvent[]): ScopeChoice[] {
  const games = new Map<string, number>();
  for (const it of items) games.set(it.key, (games.get(it.key) ?? 0) + it.games);
  const keys = [...games.keys()].filter((k) => games.get(k));
  const status = (k: string) => events.find((e) => e.id === k.split(":")[0])?.status === "ongoing";
  const sum = (pred: (k: string) => boolean) => keys.filter(pred).reduce((n, k) => n + games.get(k)!, 0);
  const choice = (value: string, pred: (k: string) => boolean): ScopeChoice =>
    ({ value, label: scopeLabel(value, events), games: sum(pred), ongoing: keys.some((k) => pred(k) && status(k)) });

  const order = (k: string) => {
    const i = events.findIndex((e) => e.id === k.split(":")[0]);
    return (i < 0 ? events.length : i) * 10 + (k.endsWith(":swiss") ? 0 : k.endsWith(":knockouts") ? 1 : 2);
  };
  const out: ScopeChoice[] = [];
  const families = [...new Set(keys.map((k) => familyOf(k.split(":")[0])).filter((f): f is string => !!f))];
  for (const f of families) {
    const members = keys.filter((k) => familyOf(k.split(":")[0]) === f);
    if (members.length > 1) out.push(choice(f, (k) => members.includes(k)));
    // Main-event stages (newest stage first), the whole main event once it has two, then the other Worlds events.
    const mains = [...new Set(members.filter((k) => k.includes(":")).map((k) => k.split(":")[0]))];
    for (const m of mains) {
      const stages = members.filter((k) => k.startsWith(`${m}:`)).sort((a, b) => order(b) - order(a));
      for (const s of stages) out.push(choice(s, (k) => k === s));
      if (stages.length > 1) out.push(choice(m, (k) => k.startsWith(`${m}:`)));
    }
    for (const k of members.filter((x) => !x.includes(":")).sort((a, b) => order(a) - order(b))) out.push(choice(k, (x) => x === k));
  }
  for (const k of keys.filter((x) => !familyOf(x.split(":")[0])).sort((a, b) => order(a) - order(b))) out.push(choice(k, (x) => x === k));
  return out;
}

/**
 * The scope a URL value names among the menu's choices. An event id the menu offers only through its stages (the main
 * event during Swiss, "?event=worlds-2026") resolves to its one stage; anything else unknown is no scope.
 */
export function resolveScope(value: string | undefined, choices: { value: string }[]): string | undefined {
  if (!value) return undefined;
  if (choices.some((c) => c.value === value)) return value;
  const stages = choices.filter((c) => c.value.startsWith(`${value}:`));
  return stages.length === 1 ? stages[0].value : undefined;
}
