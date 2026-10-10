// The validation comps alan asked for (2026-10-10) before the kit model is rolled out to every champion.
// `expect` is what a knowledgeable drafter would say; tests/comp-analysis.test.ts checks the engine agrees.
import type { Role } from "../schema";
import type { IdentityId } from "./analyze";

export interface Archetype {
  id: string; name: string;
  draft: Partial<Record<Role, string>>;
  enemy?: string[];
  expect: { primary?: IdentityId; secondary?: IdentityId; weak?: string[]; notWeak?: string[] };
}

export const ARCHETYPES: Archetype[] = [
  { id: "front-to-back", name: "Clean front-to-back", draft: { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "sivir", SUPPORT: "lulu" },
    expect: { primary: "front-to-back", notWeak: ["no-fight-start", "no-frontline", "carry-unprotected"] } },
  { id: "poke", name: "Poke / siege", draft: { TOP: "jayce", JUNGLE: "jarvan-iv", MID: "viktor", BOT: "ziggs", SUPPORT: "karma" },
    expect: { primary: "poke", notWeak: ["needs-setup", "no-fight-start"] } },
  { id: "dive", name: "Full dive", draft: { TOP: "camille", JUNGLE: "vi", MID: "akali", BOT: "kaisa", SUPPORT: "rell" },
    expect: { primary: "dive", weak: ["short-range"] } },
  { id: "protect", name: "Protect the carry", draft: { TOP: "ksante", JUNGLE: "sejuani", MID: "orianna", BOT: "jinx", SUPPORT: "milio" },
    expect: { primary: "protect", notWeak: ["carry-unprotected"] } },
  { id: "pick", name: "Pick comp", draft: { TOP: "jayce", JUNGLE: "lee-sin", MID: "syndra", BOT: "jhin", SUPPORT: "thresh" },
    expect: { primary: "pick", notWeak: ["no-fight-start", "needs-setup"] } },
  { id: "split", name: "Split pressure", draft: { TOP: "fiora", JUNGLE: "nocturne", MID: "twisted-fate", BOT: "sivir", SUPPORT: "shen" },
    expect: { primary: "split" } },
  { id: "all-ad", name: "Badly built all-AD", draft: { TOP: "renekton", JUNGLE: "lee-sin", MID: "qiyana", BOT: "caitlyn", SUPPORT: "pyke" },
    expect: { weak: ["all-ad"] } },
  { id: "no-engage", name: "No engage", draft: { TOP: "gwen", JUNGLE: "trundle", MID: "viktor", BOT: "ezreal", SUPPORT: "karma" },
    expect: { weak: ["follow-up-no-engage"] } },
  { id: "engage-no-follow-up", name: "Engage, no follow-up", draft: { TOP: "jayce", JUNGLE: "trundle", MID: "ryze", BOT: "ezreal", SUPPORT: "leona" },
    expect: { weak: ["engage-no-follow-up"] } },
  { id: "one-carry", name: "One overburdened carry", draft: { TOP: "sion", JUNGLE: "maokai", MID: "galio", BOT: "sivir", SUPPORT: "braum" },
    expect: { weak: ["single-threat", "frontline-no-damage"] } },
];

// Extra reads: an early draft, open-role needs, and the enemy-aware example from alan's message.
export interface ExtraRead { id: string; name: string; draft: Partial<Record<Role, string>>; enemy?: string[] }
export const EXTRA: ExtraRead[] = [
  { id: "early", name: "Early read (two picks)", draft: { TOP: "jayce", BOT: "ziggs" } },
  { id: "support-open", name: "Support open: what should it fix?", draft: { TOP: "jayce", JUNGLE: "lee-sin", MID: "viktor", BOT: "ziggs" } },
  { id: "vs-dive", name: "Into their dive", draft: { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "sivir" }, enemy: ["vi", "galio", "camille", "kaisa"] },
];
