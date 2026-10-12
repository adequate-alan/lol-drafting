// Interaction and motion audit (alan, 2026-10-12): the shared motion system and the fixes behind it. Browser-level
// checks of the same flows (lock keeps the room, drawer focus return, dropdown portals, arrow keys, phone sheet) run in
// scripts/smoke-pages.mjs against every deploy.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { markOwnQuery, ownQuery } from "@/lib/my-role";

const root = join(import.meta.dirname, "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const files = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((f) => {
  const rel = join(dir, f);
  return statSync(join(root, rel)).isDirectory() ? files(rel) : [rel];
});
const tsx = files("components").filter((f) => f.endsWith(".tsx")).map((f) => [f, readFileSync(join(root, f), "utf8")] as const);
const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
const outsideReduced = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));

describe("shared motion system", () => {
  it("defines one set of durations within alan's ranges", () => {
    const ms = (t: string) => Number(css.match(new RegExp(`--dur-${t}: (\\d+)ms`))?.[1]);
    expect(ms("hover")).toBeGreaterThanOrEqual(80); expect(ms("hover")).toBeLessThanOrEqual(120);
    expect(ms("select")).toBeGreaterThanOrEqual(120); expect(ms("select")).toBeLessThanOrEqual(180);
    expect(ms("pop")).toBeGreaterThanOrEqual(120); expect(ms("pop")).toBeLessThanOrEqual(180);
    expect(ms("panel")).toBeGreaterThanOrEqual(180); expect(ms("panel")).toBeLessThanOrEqual(250);
    expect(ms("pop-out")).toBeLessThan(ms("pop"));
    expect(ms("panel-out")).toBeLessThan(ms("panel"));
  });

  it("uses tokens, not literal durations, for every transition and animation", () => {
    const literal = outsideReduced.split("\n").filter((l) => /(transition|animation)[^;{]*\d+m?s/.test(l) && !/^\s*--/.test(l) && !/visibility 0s/.test(l));
    expect(literal).toEqual([]);
    expect(tsx.filter(([, s]) => /transition:|animation:/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it("defines each keyframe once (reduced-motion overrides aside)", () => {
    const names = [...outsideReduced.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBe(new Set(names).size);
  });

  it("reduced motion removes movement but keeps fades, instead of a global kill", () => {
    expect(reduced).not.toMatch(/animation-duration: 1ms|transition-duration: 1ms/);
    for (const k of ["pop-in", "drawer-in", "drawer-out", "sheet-in", "lock-in"]) {
      const body = reduced.match(new RegExp(`@keyframes ${k} \\{([^}]*\\})`))?.[1] ?? "";
      expect(body, k).toMatch(/opacity/);
      expect(body, k).not.toMatch(/transform/);
    }
    // JS scrolling follows the same preference
    expect(tsx.filter(([, s]) => /behavior: "smooth"/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it("only a fresh lock animates its slot, and switching hover cards never re-runs the entrance", () => {
    expect(css).toMatch(/\.draft-slot\.locked\.fresh \.slot-icon \{ animation: lock-in/);
    expect(css).toMatch(/\.popover\.hovercard\.swap \{ animation: none; \}/);
  });
});

describe("visual stability", () => {
  it("the drawer body never scrolls sideways and the drawer exits before it unmounts", () => {
    expect(css).toMatch(/\.drawer-body \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.drawer\.closing \{ animation: drawer-out/);
  });
  it("the drawer's per-patch table scrolls inside its own box, so wider fonts never push the sheet sideways", () => {
    const drawer = tsx.find(([f]) => f.endsWith("ChampionDrawer.tsx"))![1];
    expect(drawer).toMatch(/<div className="table-wrap flat">\s*<table className="mini">/);
  });
  it("wide screens reserve the scrollbar gutter so short and long pages line up", () => {
    expect(css).toMatch(/@media \(min-width: 961px\) \{ html \{ scrollbar-gutter: stable; \} \}/);
  });
  it("every dropdown menu is a fixed portal placed by the shared menuPlace", () => {
    const picker = tsx.find(([f]) => f.endsWith("PlayerPicker.tsx"))![1];
    expect(picker).toMatch(/createPortal\(/);
    expect(picker).toMatch(/menuPlace\(/);
    expect(css).not.toMatch(/\.player-menu \{[^}]*position: absolute/);
  });
  it("touch screens get larger hit areas without changing desktop density", () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.seg a, \.seg button \{ height: 32px; \}/);
  });
});

describe("Draft Room keeps its state across its own URL updates", () => {
  it("recognises the query the room wrote, whatever the comma or colon encoding", () => {
    markOwnQuery("bot=caitlyn&vs=top%3Aaatrox%2Cmid%3Aahri");
    expect(ownQuery("bot=caitlyn&vs=top:aatrox,mid:ahri")).toBe(true);
    expect(ownQuery("vs=top:aatrox,mid:ahri&bot=caitlyn")).toBe(true);
    expect(ownQuery("bot=caitlyn&vs=top:aatrox")).toBe(false);
    markOwnQuery("");
    expect(ownQuery("")).toBe(true);
  });
});
