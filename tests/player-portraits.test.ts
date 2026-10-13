// Player portraits (alan, 2026-10-12): only checked, freely licensed photographs, each on the right player id; everyone
// else gets initials, never a champion icon.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PORTRAIT_IMAGES } from "@/lib/player-portrait-images";
import { allPortraits, creditLine, initials, portraitOf } from "@/lib/player-portraits";
import { Files, type PlayerPortraits, type ProBuilds } from "@/lib/schema";

const raw = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const data = Files["player-portraits.json"].parse(raw("player-portraits.json")) as PlayerPortraits;
const builds = Files["pro-builds.json"].parse(raw("pro-builds.json")) as ProBuilds;
const FREE = /^(CC BY(-SA)? [1-4]\.0|CC0|Public domain)$/i;

describe("portrait library", () => {
  it("each portrait belongs to one recorded player id, under that player's recorded name", () => {
    const names = new Map<number, Set<string>>();
    for (const b of builds.builds) names.set(b.playerId, (names.get(b.playerId) ?? new Set()).add(b.player));
    const ids = data.portraits.map((p) => p.playerId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of data.portraits) {
      expect(names.has(p.playerId), `${p.name} ${p.playerId}`).toBe(true);
      expect(names.get(p.playerId)!.has(p.name), `${p.name} is recorded as ${[...names.get(p.playerId)!].join(", ")}`).toBe(true);
    }
  });

  it("a Commons photograph is freely licensed, with author, license and source for the credit; a dpm.lol one names its page", () => {
    for (const p of data.portraits) {
      if (p.provider === "commons") {
        expect(p.license, p.name).toMatch(FREE);
        expect(p.source, p.name).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
        expect(p.original, p.name).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
        expect(p.author.length, p.name).toBeGreaterThan(1);
        expect(creditLine(p)).toContain(p.license);
      } else {
        expect(p.provider).toBe("dpm.lol");
        expect(p.source, p.name).toMatch(/^https:\/\/(www\.)?dpm\.lol\//);
        expect(creditLine(p)).toContain("dpm.lol");
      }
    }
  });

  it("every portrait has its local crop and its import, and nothing else is stored", () => {
    for (const p of data.portraits) {
      expect(existsSync(p.file), p.file).toBe(true);
      expect(p.file).toBe(`assets/players/${p.playerId}.webp`);
      expect(PORTRAIT_IMAGES[p.playerId], p.name).toBeTruthy();
    }
    expect(Object.keys(PORTRAIT_IMAGES).map(Number).sort()).toEqual(data.portraits.map((p) => p.playerId).sort());
    const files = existsSync("assets/players") ? readdirSync("assets/players") : [];
    expect(files.sort()).toEqual(data.portraits.map((p) => `${p.playerId}.webp`).sort());
    for (const f of files) expect(readFileSync(join("assets/players", f)).length, f).toBeLessThan(40_000);
  });
});

describe("avatars", () => {
  it("a player without a portrait shows initials, never a champion icon or another player's photo", () => {
    expect(portraitOf(999999999)).toBeUndefined();
    const html = renderToStaticMarkup(createElement(PlayerAvatar, { id: 999999999, name: "Ruler" }));
    expect(html).toContain("initials");
    expect(html).toContain('data-initials="RU"');
    expect(html).not.toMatch(/<img|ddragon|champion/);
  });

  it("initials read the handle", () => {
    expect(initials("Chovy")).toBe("CH");
    expect(initials("Naak Nako")).toBe("NN");
    expect(initials("tiphat")).toBe("TI");
    expect(initials("")).toBe("?");
  });

  it("a player with a portrait shows that photo, sized in markup (no shift while it loads), with no tooltip", () => {
    for (const p of allPortraits()) {
      const html = renderToStaticMarkup(createElement(PlayerAvatar, { id: p.playerId, name: p.name, size: "lg" }));
      expect(html).toContain(`src="${PORTRAIT_IMAGES[p.playerId].src}"`);
      expect(html).toMatch(/width="48" height="48"/);
      expect(html).toContain(`alt="${p.name}"`);
      expect(html).not.toContain("title=");
      expect(creditLine(p)).toContain(p.provider === "commons" ? p.license : "dpm.lol");
      expect(portraitOf(String(p.playerId))?.meta.playerId).toBe(p.playerId);
    }
  });
});
