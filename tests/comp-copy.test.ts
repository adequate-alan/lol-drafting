// Comp Library display copy (lib/comp-copy.ts): short job labels and supporting lines are wording only, over the
// stored shells, which keep their full job and "why" for the hover card, drawer and Details.
import { describe, expect, it } from "vitest";
import { JOB_LABEL, jobLabel, WHY_LINE } from "@/lib/comp-copy";
import { getCompShells } from "@/lib/data";
import { ROLES } from "@/lib/schema";

const shells = getCompShells();
const jobs = new Set(shells.flatMap((s) => ROLES.map((r) => s.slots[r].job)));

describe("comp library copy", () => {
  it("every stored job has a short card label that fits a lineup column", () => {
    for (const job of jobs) {
      expect(JOB_LABEL[job], job).toBeTruthy();
      expect(jobLabel(job).length, job).toBeLessThanOrEqual(16);
    }
  });

  it("has no labels or lines for jobs and shells that no longer exist", () => {
    for (const job of Object.keys(JOB_LABEL)) expect(jobs.has(job), job).toBe(true);
    const ids = new Set(shells.map((s) => s.id));
    for (const id of Object.keys(WHY_LINE)) expect(ids.has(id), id).toBe(true);
  });

  it("a supporting line stays one short sentence and differs from the win condition", () => {
    for (const s of shells) {
      const line = WHY_LINE[s.id];
      if (!line) continue;
      expect(line.length, s.id).toBeLessThanOrEqual(80);
      expect(line, s.id).not.toBe(s.winCondition);
    }
  });

  it("an unknown job falls back to its full text", () => {
    expect(jobLabel("Something new")).toBe("Something new");
  });
});
