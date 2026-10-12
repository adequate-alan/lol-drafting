// One patch, two spellings. Riot labels the 2026 patches 26.16, 26.17, …; the game client, Data Dragon and Gol.gg (so
// every pro-data file here) call the same patches 16.16, 16.17, …. Since 2025 the year label is the client major + 10
// (25.x = 15.x, 26.x = 16.x). Everything that compares patches goes through `patchKey` so the two never read as
// different patches. The site shows Riot's official label (`patchLabel`, "26.16").

export interface PatchId {
  official: string; // Riot's label: "26.16"
  short: string; // client / Data Dragon / Gol.gg label: "16.16"
  major: number; // year label: 26
  minor: number; // 16
}

/** Reads "26.16", "16.16", "16.16.1", "V16.16", "Patch 26.16" (any case). Undefined when it isn't a 15+/25+ patch. */
export function parsePatch(input: string | null | undefined): PatchId | undefined {
  const m = input?.trim().match(/^(?:patch\s*)?v?(\d{2})\.(\d{1,2})(?:\.\d+)?[a-z]?$/i);
  if (!m) return undefined;
  let major = Number(m[1]);
  const minor = Number(m[2]);
  if (major >= 15 && major < 25) major += 10; // client numbering → year label
  if (major < 25) return undefined;
  return { official: `${major}.${minor}`, short: `${major - 10}.${minor}`, major, minor };
}

/** The canonical key for a patch in either notation ("26.16"); the input unchanged when it can't be read. */
export const patchKey = (p: string) => parsePatch(p)?.official ?? p;
/** What the site shows: Riot's label. */
export const patchLabel = patchKey;
/** The pro-data spelling of a patch ("16.16"). */
export const shortPatch = (p: string) => parsePatch(p)?.short ?? p;
export const samePatch = (a?: string | null, b?: string | null) => !!a && !!b && patchKey(a) === patchKey(b);

/** Ascending order across both notations; unreadable patches sort first. */
export function comparePatch(a: string, b: string): number {
  const x = parsePatch(a), y = parsePatch(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  return x.major - y.major || x.minor - y.minor;
}
