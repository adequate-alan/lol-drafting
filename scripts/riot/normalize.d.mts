// Types for normalize.mjs.
import type { Champion, PatchNote } from "../../lib/schema";
export function shortOf(patch: string): string;
export function isTracked(patch: string, first: string): boolean;
export function championResolver(champions: Champion[]): (name: string) => string | undefined;
export function championsIn(sentence: string, champions: Champion[]): string[];
export function championVerdict(context: string, summary?: string): "buff" | "nerf" | "adjustment" | "rework";
export function runeCategory(name: string): "keystone" | "minor" | "shard";
export function buildPatch(patchLabel: string, article: { title: string; url: string; published: string | null; rev: string | null; body: string },
  champions: Champion[], opts?: { now?: string; previous?: PatchNote }): { patch: Omit<PatchNote, "updatedAt">; warnings: string[] };
