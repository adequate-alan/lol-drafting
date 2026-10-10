// Champion square icons from Riot's Data Dragon CDN. The patch version is resolved once at build time
// (next.config.ts) so every icon on a deploy comes from the same patch; images load in the browser,
// so nothing is stored in the repo and no server-side image optimisation is needed.
export const DDRAGON_FALLBACK_VERSION = "15.24.1";
export const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || DDRAGON_FALLBACK_VERSION;

// Data Dragon keys that are not just the display name with spaces and punctuation removed.
const KEY_OVERRIDES: Record<string, string> = {
  chogath: "Chogath",
  kaisa: "Kaisa",
  ksante: "KSante",
  "renata-glasc": "Renata",
  wukong: "MonkeyKing",
  "nunu-willump": "Nunu",
  leblanc: "Leblanc",
  khazix: "Khazix",
  velkoz: "Velkoz",
  belveth: "Belveth",
  "kog-maw": "KogMaw",
  "rek-sai": "RekSai",
};

export function ddragonKey(id: string, name: string): string {
  return KEY_OVERRIDES[id] ?? name.replace(/[^A-Za-z]/g, "");
}

export function championIconUrl(id: string, name: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${ddragonKey(id, name)}.png`;
}
