// Types for refresh.mjs.
import type { Champion, PatchNotes } from "../../lib/schema";
export const INDEX_URL: string;
export type Get = (url: string) => Promise<string>;
export function refresh(data: { patchNotes: PatchNotes; champions: Champion[] }, get: Get, opts?: { now?: string; force?: boolean }):
  Promise<{ patchNotes: PatchNotes; changed: string[]; report: string[]; warnings: string[] }>;
