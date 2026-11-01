// Analyst perspectives as one browser chunk: components/AnalystPerspectives.tsx imports this module dynamically the first
// time a game's "Analyst perspectives" row is opened, so the commentary text is never part of the Pro Drafts list.
// tests/analyst-commentary.test.ts validates the same file with the zod schema.
import raw from "@/data/analyst-commentary.json";
import type { AnalystCommentary } from "./schema";

export const commentary = raw as unknown as AnalystCommentary;
