// Types for parse.mjs.
import type { PatchEntry } from "../../lib/schema";
type Line = PatchEntry["groups"][number]["changes"][number];
export interface Subject { name: string; anchor?: string; icon?: string; context: string[]; summary?: string; groups: { title?: string; icon?: string; changes: Line[] }[] }
export function decode(s: string): string;
export function text(html: string): string;
export function slug(s: string): string;
export function imageUrl(src?: string): string | undefined;
export function parseArticle(pageHtml: string): { title: string; url: string; published: string | null; rev: string | null; body: string };
export function parseIndex(pageHtml: string): { patch: string; title: string; url: string; published: string | null; rev: string | null }[];
export function sections(body: string): { title: string; html: string }[];
export function classifySection(title: string): "champion" | "item" | "rune" | "system" | "midpatch" | "bugfix" | "skip" | "unknown";
export function parseLine(html: string): Line;
export function blocks(sectionHtml: string, opts?: { champions?: boolean }): Subject[];
export function allLines(sectionHtml: string): Line[];
