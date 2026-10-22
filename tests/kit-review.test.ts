// Kit review queue (alan, 2026-10-22): Riot changes to crowd control, mobility, range, damage type or mechanics flag a
// champion's stored values for a person to recheck; routine number tuning does not. The queue never edits a kit, an
// attribute or any ranking, and a recorded decision removes its flag. Entries below are fixtures, not Riot's text.
import { describe, expect, it } from "vitest";
import { getChampions, getKitQueue, getPatchNotes } from "@/lib/data";
import { kitFlags, kitReviewQueue } from "@/lib/kit-review";
import { convertKits } from "@/lib/model-v2/kits";
import type { PatchNotes } from "@/lib/schema";

type Entry = PatchNotes["patches"][number]["entries"][number];
const entry = (lines: { label?: string; text: string; before?: string; after?: string; tag?: "new" | "removed" | "updated" }[], category: Entry["category"] = "buff", title = "Q - Test"): Entry =>
  ({ kind: "champion", ref: "neeko", subject: "Neeko", id: "neeko", category, groups: [{ title, changes: lines }] } as unknown as Entry);

describe("which changes are flagged", () => {
  it("crowd control, mobility, range and behaviour changes are flagged", () => {
    expect(kitFlags(entry([{ label: "Root Duration", text: "Root Duration: 1.5 ⇒ 2" }]))[0].areas).toEqual(["crowd control"]);
    expect(kitFlags(entry([{ label: "Dash Range", text: "Dash Range: 400 ⇒ 450" }]))[0].areas).toEqual(expect.arrayContaining(["mobility", "range"]));
    expect(kitFlags(entry([{ label: "Effect", text: "Now also slows the target" }]))[0].areas).toEqual(expect.arrayContaining(["mechanics", "crowd control"]));
  });
  it("a damage-type shift is flagged; plain number tuning is not", () => {
    expect(kitFlags(entry([{ label: "Damage", text: "Damage: 50 (+40% AP) ⇒ 50 (+40% bonus AD)", before: "50 (+40% AP)", after: "50 (+40% bonus AD)" }]))[0].areas).toEqual(["damage profile"]);
    expect(kitFlags(entry([{ label: "Damage", text: "Damage: 50 ⇒ 60", before: "50", after: "60" }, { label: "Cooldown", text: "Cooldown: 10 ⇒ 9" }]))).toEqual([]);
  });
  it("a rework flags every line; presentation-only lines never", () => {
    expect(kitFlags(entry([{ label: "Damage", text: "Damage: 50 ⇒ 60" }], "rework")).length).toBe(1);
    expect(kitFlags(entry([{ label: "Indicator", text: "Indicator now turns purple" }]))).toEqual([]);
  });
});

describe("the queue", () => {
  const champions = getChampions();
  const kits = convertKits(champions);
  const notes: PatchNotes = { ...getPatchNotes(), patches: [{ ...getPatchNotes().patches[0], patch: "26.20", entries: [entry([{ label: "Root Duration", text: "Root Duration: 1.5 ⇒ 2" }])] }] };
  it("lists the stored values the flagged areas touch, and proposes no value", () => {
    const [item] = kitReviewQueue(notes, champions, kits);
    expect(item.champion).toBe("neeko");
    const neeko = champions.find((c) => c.id === "neeko")!;
    expect(item.values.find((v) => v.key === "engage")!.value).toBe(neeko.attrs.engage);
    expect(item.values.map((v) => v.key)).toContain("aoeCc");
    expect(item.suggestion).toMatch(/No value changes until reviewed/);
  });
  it("a recorded decision removes the flag", () => {
    expect(kitReviewQueue(notes, champions, kits, [{ champion: "neeko", patch: "26.20", decision: "unchanged", note: "x", decidedOn: "2026-10-22" }])).toEqual([]);
  });
  it("building the queue changes no champion or kit", () => {
    const before = JSON.stringify([champions, kits]);
    getKitQueue();
    expect(JSON.stringify([getChampions(), convertKits(getChampions())])).toBe(before);
  });
});
