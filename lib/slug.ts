// Name → key, the same rule as scripts/riot/parse.mjs `slug` (tests/patch-notes.test.ts keeps them equal):
// "Runaan's Hurricane" → "runaans-hurricane", "Hail of Blades" → "hail-of-blades".
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’.]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
