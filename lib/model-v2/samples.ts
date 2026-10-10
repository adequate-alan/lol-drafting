// First-pass v2 values for the champions used in the review examples. UNREVIEWED: for alan to check before the
// other champions are converted. Everything except fightStart and damageByRole is copied from data/champions.json.
import type { Champion } from "../schema";
import type { ChampionV2, FightStart, RoleDamage } from "./schema";

const S = (physical: number, magic: number, trueDmg = 0) => ({ physical, magic, true: trueDmg });
type Conversion = { fightStart: FightStart; damageByRole: ChampionV2["damageByRole"]; why: string };
const D = (damageThreat: RoleDamage["damageThreat"], damageSplit: RoleDamage["damageSplit"]): RoleDamage => ({ damageThreat, damageSplit });

// The 10 representative conversions, chosen to cover every role, flex picks, hybrids and all four fight-start types.
export const REPRESENTATIVE: Record<string, Conversion> = {
  camille: { fightStart: "catch", damageByRole: { TOP: D(3, S(0.7, 0, 0.3)), SUPPORT: D(1, S(0.7, 0, 0.3)) },
    why: "Role-aware: a top-lane carry threat, utility damage at support. Ultimate locks one target down (catch). True damage from Q." },
  jayce: { fightStart: "none", damageByRole: { TOP: D(3, S(1, 0)), MID: D(3, S(1, 0)) }, why: "Poke carry with no way to start a fight." },
  ornn: { fightStart: "primary", damageByRole: { TOP: D(1, S(0.4, 0.6)) }, why: "Tank: low threat, mostly magic. Ultimate starts fights on demand." },
  vi: { fightStart: "primary", damageByRole: { JUNGLE: D(2, S(1, 0)) }, why: "Point-click ultimate: reliable start." },
  "lee-sin": { fightStart: "catch", damageByRole: { JUNGLE: D(2, S(1, 0)) }, why: "Needs Q to land before the kick: catch, not primary." },
  syndra: { fightStart: "catch", damageByRole: { MID: D(3, S(0, 1)) }, why: "Carry mage. E stun picks one target." },
  orianna: { fightStart: "follow-up", damageByRole: { MID: D(3, S(0, 1)) }, why: "Carry mage. Shockwave needs someone to deliver the ball." },
  corki: { fightStart: "none", damageByRole: { BOT: D(3, S(0.4, 0.6)), MID: D(3, S(0.4, 0.6)) }, why: "Hybrid carry, majority magic." },
  jhin: { fightStart: "follow-up", damageByRole: { BOT: D(3, S(1, 0)) }, why: "W roots only targets already hit by an ally: follow-up." },
  karma: { fightStart: "follow-up", damageByRole: { SUPPORT: D(1, S(0, 1)) }, why: "AP champion but utility damage at support, not a carry threat." },
};

// Extra champions needed to complete the five example comps.
export const EXAMPLE_ONLY: Record<string, Conversion> = {
  qiyana: { fightStart: "catch", damageByRole: { MID: D(3, S(1, 0)), JUNGLE: D(3, S(1, 0)) }, why: "Ultimate needs terrain and position: catch." },
  caitlyn: { fightStart: "follow-up", damageByRole: { BOT: D(3, S(1, 0)) }, why: "Traps and net help after a fight starts." },
  nami: { fightStart: "catch", damageByRole: { SUPPORT: D(1, S(0, 1)) }, why: "Bubble picks one target." },
  thresh: { fightStart: "catch", damageByRole: { SUPPORT: D(1, S(0, 1)) }, why: "Hook picks one target." },
  lulu: { fightStart: "follow-up", damageByRole: { SUPPORT: D(1, S(0, 1)) }, why: "Polymorph and ult protect; she doesn't start fights." },
  olaf: { fightStart: "follow-up", damageByRole: { TOP: D(2, S(0.7, 0, 0.3)), JUNGLE: D(2, S(0.7, 0, 0.3)) }, why: "Runs at targets but needs someone else to lock them down. True damage from E." },
  ziggs: { fightStart: "none", damageByRole: { BOT: D(3, S(0, 1)), MID: D(3, S(0, 1)) }, why: "Siege mage; needs a starter." },
  nautilus: { fightStart: "primary", damageByRole: { SUPPORT: D(1, S(0, 1)) }, why: "Point-click ultimate: reliable start." },
};

export function convert(champions: Champion[], table: Record<string, Conversion>): ChampionV2[] {
  return Object.entries(table).map(([id, v]) => {
    const c = champions.find((x) => x.id === id);
    if (!c) throw new Error(`unknown champion ${id}`);
    const { engage: _engage, ...attrs } = c.attrs;
    return { id: c.id, name: c.name, aliases: c.aliases, roles: c.roles, flags: c.flags, reviewed: false, attrs, fightStart: v.fightStart, damageByRole: v.damageByRole };
  });
}

// The five review comps.
export const EXAMPLE_COMPS = [
  { name: "Four AD carries + support Karma", draft: { TOP: "jayce", JUNGLE: "lee-sin", MID: "qiyana", BOT: "caitlyn", SUPPORT: "karma" } },
  { name: "Two moderate magic sources (hybrid Corki + Nami)", draft: { TOP: "jayce", JUNGLE: "vi", MID: "qiyana", BOT: "corki", SUPPORT: "nami" } },
  { name: "Pick comp with Jhin", draft: { TOP: "jayce", JUNGLE: "lee-sin", MID: "syndra", BOT: "jhin", SUPPORT: "thresh" } },
  { name: "Follow-up only", draft: { TOP: "jayce", JUNGLE: "olaf", MID: "orianna", BOT: "jhin", SUPPORT: "lulu" } },
  { name: "Ziggs with a primary starter", draft: { TOP: "ornn", JUNGLE: "vi", MID: "orianna", BOT: "ziggs", SUPPORT: "nautilus" } },
] as const;
