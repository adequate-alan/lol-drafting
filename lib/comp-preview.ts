// Comp Library swap preview: how a variation of a comp shell differs from the original on the Draft Room's comp check
// (lib/evaluate.ts). General Draft Logic only; it never scores and never touches pro evidence. When a richer comp
// analysis lands, it plugs in here and the preview UI keeps rendering `changes` and `warnings`.
import { profile, warnings, type Draft, type DraftWarning, type Profile } from "./evaluate";
import { ROLES, type Attr, type Champion, type CompShell, type Role } from "./schema";

/** The five picks of a shell, with any previewed swaps applied. */
export function shellDraft(shell: CompShell, swaps: Partial<Record<Role, string>> = {}): Record<Role, string> {
  return Object.fromEntries(ROLES.map((r) => [r, swaps[r] ?? shell.slots[r].champion])) as Record<Role, string>;
}

/** Draft Room link that loads every pick of a draft. */
export function draftHref(draft: Draft) {
  return `/?${ROLES.filter((r) => draft[r]).map((r) => `${r.toLowerCase()}=${draft[r]}`).join("&")}`;
}

export interface MeterChange { label: string; from: string; to: string }
export interface VariationDiff { changes: MeterChange[]; added: DraftWarning[]; cleared: DraftWarning[] }

// The comp check numbers the Draft Room shows, in its order: best value per pick, peel as a team total.
const METERS: [string, Attr, "best" | "total"][] = [
  ["Engage", "engage", "best"], ["Frontline", "frontline", "best"], ["Peel", "peel", "total"], ["Sustained", "sustainedDps", "best"],
  ["Burst", "burst", "best"], ["Poke", "poke", "best"], ["Scaling", "scaling", "best"], ["Objectives", "objectiveControl", "best"],
  ["Side lane", "sidePressure", "best"],
];
const value = (p: Profile, a: Attr, k: "best" | "total") => p.meters.find((m) => m.attr === a)![k];
const adShare = (p: Profile) => (p.damage.physicalShare === null ? null : Math.round(p.damage.physicalShare * 100));

export function variationDiff(original: Draft, variation: Draft, champions: Champion[]): VariationDiff {
  const a = profile(original, champions), b = profile(variation, champions);
  const changes: MeterChange[] = [];
  for (const [label, attr, k] of METERS) {
    const x = value(a, attr, k), y = value(b, attr, k);
    if (x !== y) changes.push({ label, from: String(x), to: String(y) });
  }
  const x = adShare(a), y = adShare(b);
  if (x !== null && y !== null && Math.abs(x - y) >= 5) changes.push({ label: "Damage", from: `AD ${x}%`, to: `AD ${y}%` });
  const before = warnings(original, champions), after = warnings(variation, champions);
  const has = (list: DraftWarning[], w: DraftWarning) => list.some((v) => v.id === w.id);
  return { changes, added: after.filter((w) => !has(before, w)), cleared: before.filter((w) => !has(after, w)) };
}
