// Comp Library swap preview (lib/comp-preview.ts): a variation is compared with the original on the comp check only.
import { describe, expect, it } from "vitest";
import { draftHref, shellDraft, variationDiff } from "@/lib/comp-preview";
import { getCompShells, getDraftData } from "@/lib/data";

const { champions } = getDraftData();
const shells = getCompShells();

describe("swap preview", () => {
  it("the original shell has no changes against itself", () => {
    for (const s of shells) {
      const d = shellDraft(s);
      expect(variationDiff(d, d, champions)).toEqual({ changes: [], added: [], cleared: [] });
    }
  });

  it("a swap replaces only its slot and never edits the shell", () => {
    const s = shells.find((x) => x.id === "yunara-protect")!;
    const swap = s.slots.TOP.swaps[0];
    const before = JSON.stringify(s);
    const d = shellDraft(s, { TOP: swap });
    expect(d.TOP).toBe(swap);
    expect(d.JUNGLE).toBe(s.slots.JUNGLE.champion);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("every listed swap produces a comparable variation", () => {
    for (const s of shells) for (const [role, slot] of Object.entries(s.slots)) for (const swap of slot.swaps) {
      const diff = variationDiff(shellDraft(s), shellDraft(s, { [role]: swap }), champions);
      for (const c of diff.changes) expect(c.from).not.toBe(c.to);
    }
  });

  it("links the whole variation into the Draft Room", () => {
    const s = shells.find((x) => x.id === "yunara-protect")!;
    const href = draftHref(shellDraft(s, { TOP: "ambessa" }));
    expect(href).toBe(`/?top=ambessa&jungle=${s.slots.JUNGLE.champion}&mid=${s.slots.MID.champion}&bot=${s.slots.BOT.champion}&support=${s.slots.SUPPORT.champion}`);
  });
});
