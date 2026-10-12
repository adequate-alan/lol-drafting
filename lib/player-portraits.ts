// Player portraits (alan, 2026-10-12): the one lookup from a Gol.gg player id to a checked, reusable photograph and its
// credit. Players without one get initials (components/PlayerAvatar.tsx), never a champion icon or a look-alike's photo.
import data from "@/data/player-portraits.json";
import { PORTRAIT_IMAGES } from "./player-portrait-images";
import type { PlayerPortrait, PlayerPortraits } from "./schema";

const byId = new Map((data as PlayerPortraits).portraits.map((p) => [p.playerId, p]));

export interface Portrait { src: string; width: number; height: number; credit: string; meta: PlayerPortrait }
/** The portrait for a player id, or undefined. Accepts the id as a number or a string (URLs, pins). */
export function portraitOf(id: number | string | undefined): Portrait | undefined {
  const n = Number(id);
  const meta = byId.get(n), img = PORTRAIT_IMAGES[n];
  if (!meta || !img) return undefined;
  return { src: img.src, width: img.width, height: img.height, credit: creditLine(meta), meta };
}
export const creditLine = (p: PlayerPortrait) => `Photo: ${p.author}, ${p.license}${p.photo ? ` (${p.photo})` : ""}, via Wikimedia Commons`;
export const allPortraits = () => (data as PlayerPortraits).portraits;

/** Two letters for the fallback: the first two letters of a one-word handle, else the first letter of two words. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}
