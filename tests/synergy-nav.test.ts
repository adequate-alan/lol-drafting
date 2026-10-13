// Synergies navigation (alan, 2026-10-13): the generic Synergies link follows Draft Room's highlighted role, never
// "I'm playing"; explicit role URLs and champion links stay authoritative.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MY_ROLE_KEY } from "@/lib/my-role";
import { draftQuery } from "@/lib/my-role";
import { synergiesHref } from "@/lib/drawer";
import {
  DRAFT_ACTIVE_KEY, SYNERGIES_ROLE_KEY, rememberDraftRole, rememberSynergiesRole, restoredDraftRole, storedSynergiesRole, synergiesNavHref,
} from "@/lib/synergy-nav";
import { ROLES } from "@/lib/schema";

// One browser tab's sessionStorage (and its localStorage, where My Role lives).
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const href = (s: Parameters<typeof storedSynergiesRole>[0]) => synergiesNavHref(storedSynergiesRole(s));
const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("generic Synergies link", () => {
  it("opens each highlighted Draft Room role's page", () => {
    for (const role of ROLES) {
      const s = memory();
      rememberDraftRole(s, role);
      expect(href(s)).toBe(`/synergies/${role.toLowerCase()}/`);
    }
  });

  it("follows the highlighted role, not My Role, when they differ", () => {
    const session = memory(), local = memory();
    local.setItem(MY_ROLE_KEY, "BOT"); // I'm playing Bot
    rememberDraftRole(session, "JUNGLE"); // researching Jungle
    expect(href(session)).toBe("/synergies/jungle/");
    expect(local.getItem(MY_ROLE_KEY)).toBe("BOT");
    expect([...session.m.keys()]).not.toContain(MY_ROLE_KEY);
    // and when they agree, it is that role
    rememberDraftRole(session, "BOT");
    expect(href(session)).toBe("/synergies/bot/");
  });

  it("defaults to Top before Draft Room or Synergies stored anything, and with storage blocked", () => {
    expect(href(memory())).toBe("/synergies/top/");
    expect(synergiesNavHref("nonsense")).toBe("/synergies/top/");
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(rememberDraftRole(blocked, "MID")).toBe(false);
    expect(synergiesNavHref(storedSynergiesRole(blocked))).toBe("/synergies/top/");
    expect(synergiesNavHref(storedSynergiesRole(undefined))).toBe("/synergies/top/");
  });

  it("respects a direct Synergies URL and a manual tab switch: the latest viewed role wins", () => {
    const s = memory();
    rememberDraftRole(s, "JUNGLE");
    rememberSynergiesRole(s, "SUPPORT"); // opened /synergies/support/ directly, or switched tab
    expect(href(s)).toBe("/synergies/support/");
    // The Draft Room's own remembered role is untouched by Synergies browsing.
    expect(s.getItem(DRAFT_ACTIVE_KEY)).toBe("JUNGLE");
    // Back in Draft Room, its highlighted role leads again.
    rememberDraftRole(s, "MID");
    expect(href(s)).toBe("/synergies/mid/");
  });

  it("survives a refresh (same tab session)", () => {
    const s = memory();
    rememberDraftRole(s, "MID");
    const reloaded = { getItem: (k: string) => s.getItem(k), setItem: () => {} };
    expect(href(reloaded)).toBe("/synergies/mid/");
    expect(s.getItem(SYNERGIES_ROLE_KEY)).toBe("MID");
  });

  it("champion links stay explicit", () => {
    expect(synergiesHref("lee-sin", "JUNGLE")).toBe("/synergies/jungle/?champ=lee-sin");
  });
});

describe("Draft Room highlighted role on return", () => {
  it("the URL's focus wins (refresh, Back, Back to Draft Room)", () => {
    const s = memory();
    rememberDraftRole(s, "SUPPORT");
    expect(restoredDraftRole(s, { urlFocus: "JUNGLE", emptyBoard: false })).toBe("JUNGLE");
    expect(draftQuery({ draft: { BOT: "jhin" }, focus: "JUNGLE" })).toBe("bot=jhin&focus=jungle");
  });

  it("an empty board in the same tab restores the role left highlighted; a board from a link keeps its own", () => {
    const s = memory();
    rememberDraftRole(s, "JUNGLE");
    expect(restoredDraftRole(s, { emptyBoard: true })).toBe("JUNGLE");
    expect(restoredDraftRole(s, { emptyBoard: false })).toBeUndefined();
    expect(restoredDraftRole(memory(), { emptyBoard: true })).toBeUndefined();
  });

  it("is wired: the sidebar and /synergies/ use the stored role, Draft Room writes its highlighted role, never My Role", () => {
    const sidebar = src("components/Sidebar.tsx");
    expect(sidebar).not.toMatch(/"\/synergies\/(top|jungle|mid|bot|support)"/);
    expect(sidebar).toContain("synergiesNavHref");
    expect(sidebar).not.toContain("MY_ROLE_KEY");
    expect(src("lib/synergy-nav.ts")).not.toMatch(/from "[^"]*my-role"/);
    expect(src("components/DraftRoom.tsx")).toMatch(/noteDraftRole\(active\)/);
    expect(src("components/views/SynergiesView.tsx")).toMatch(/noteSynergiesRole\(TAB_ROLE\[tab\]\)/);
    for (const p of ["app/(app)/synergies/page.tsx", "app/(app)/first-pick/page.tsx"]) expect(src(p)).toContain("<ForwardSynergies />");
  });
});
