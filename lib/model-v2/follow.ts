// How a carry follows an ally's engage (alan's review, 2026-10-14; `commits` 2026-11-12). Shared by the plan read
// (./plan.ts) and the Pairing Explorer's bot lane read (lib/pairings.ts); a kit helper, never a score.
import type { Slot } from "./analyze";

/** How a carry follows an ally's engage, from the unreviewed kit fields (no value is changed for this read). */
export const followOf = (s: Slot) => ({
  allIn: s.c.kit.followUp >= 2,                                  // crowd control or burst of their own on the locked target
  ranged: s.threat >= 2 && s.c.kit.range >= 2,                    // hits the locked target from standard range or further
  joins: s.c.kit.backlineAccess >= 2 || (s.threat >= 2 && s.c.kit.range <= 1), // reaches it, or is already standing there
  extended: s.c.attrs.sustainedDps >= 2,                          // keeps dealing damage in the longer trade that follows
  // Commits real damage while the support's lockdown lasts (alan, 2026-11-12, Draft Insights review): an early-game carry
  // (curve.early 3) whose burst or sustained damage is 2+ turns the lockdown into a kill without crowd control of its own
  // (Draven, Lucian, Caitlyn). Not a lane-bully label: Ezreal, Corki, Ziggs and Senna stay ranged follow-up.
  commits: s.c.kit.curve.early >= 3 && (s.c.attrs.burst >= 2 || s.c.attrs.sustainedDps >= 2),
});
