// Representative v2 kit conversions for the comp-analysis checkpoint. UNREVIEWED: alan validates the example
// diagnoses before the other champions are converted. fightStart and damageByRole for the 18 champions already in
// samples.ts are reused unchanged; everything else here is new. v1 attributes are copied from data/champions.json.
import type { Champion, Role } from "../schema";
import { EXAMPLE_ONLY, REPRESENTATIVE } from "./samples";
import type { ChampionKit, FightStart, Kit, RoleDamage } from "./schema";

const S = (physical: number, magic: number, trueDmg = 0) => ({ physical, magic, true: trueDmg });
const D = (damageThreat: RoleDamage["damageThreat"], damageSplit: RoleDamage["damageSplit"]): RoleDamage => ({ damageThreat, damageSplit });
type N = 0 | 1 | 2 | 3;
// Column order: waveclear, range, tankDamage, backlineAccess, disengage, counterEngage, followUp, aoeCc,
// resourceDemand, ultDependency, setupDependency, [early, mid, late], global (map-wide ultimate).
const K = (wc: N, ra: N, td: N, ba: N, de: N, ce: N, fu: N, ao: N, rd: N, ud: N, sd: N, [early, mid, late]: [N, N, N], global = false): Omit<Kit, "selfPeel"> => ({
  ...(global ? { global: true as const } : {}),
  waveclear: wc, range: ra, tankDamage: td, backlineAccess: ba, disengage: de, counterEngage: ce, followUp: fu, aoeCc: ao,
  resourceDemand: rd, ultDependency: ud, setupDependency: sd, curve: { early, mid, late },
});

// Self-peel for carries (spell shield, dashes, untargetability): how well the carry survives a diver alone.
// Everyone not listed is 0. Only the enemy-dive read uses it.
const SELF_PEEL: Record<string, Kit["selfPeel"]> = {
  sivir: 1, ezreal: 2, kaisa: 2, corki: 1, caitlyn: 1, ziggs: 1, jhin: 0, jinx: 0,
  ahri: 2, akali: 2, syndra: 1, viktor: 1, orianna: 1, azir: 2, ryze: 1, "twisted-fate": 1, fiora: 2, gwen: 2, camille: 2, jayce: 1,
};

interface KitEntry { fightStart?: FightStart; damageByRole?: Partial<Record<Role, RoleDamage>>; kit: Omit<Kit, "selfPeel">; why: string }

export const KITS: Record<string, KitEntry> = {
  // ---------- top ----------
  ornn: { kit: K(1, 0, 1, 1, 1, 2, 2, 3, 1, 2, 0, [2, 3, 3]), why: "Tank who builds his team's items; ultimate is a layered AoE start. Scales without gold." },
  jayce: { kit: K(2, 3, 1, 1, 1, 0, 1, 0, 2, 0, 0, [3, 3, 1]), why: "Long-range poke and lane bully; falls off; no fight start." },
  camille: { kit: K(1, 0, 3, 3, 0, 0, 2, 0, 2, 2, 0, [2, 3, 2]), why: "True-damage duelist who reaches carries over walls; ultimate isolates one target." },
  ksante: { fightStart: "catch", damageByRole: { TOP: D(1, S(1, 0)) }, kit: K(1, 0, 2, 2, 1, 2, 2, 1, 1, 1, 0, [2, 3, 2]),
    why: "Tank who can turn into a diver; ultimate drags one target out (catch, not a 5v5 start)." },
  fiora: { fightStart: "none", damageByRole: { TOP: D(3, S(0.6, 0, 0.4)) }, kit: K(1, 0, 3, 2, 0, 1, 1, 0, 3, 1, 0, [2, 3, 3]),
    why: "Split-pusher and tank killer (true damage); no CC to start or follow a fight." },
  gwen: { fightStart: "none", damageByRole: { TOP: D(3, S(0, 0.8, 0.2)) }, kit: K(2, 0, 3, 2, 0, 0, 1, 0, 3, 1, 0, [1, 2, 3]),
    why: "Scaling side-laner with %HP and true damage; melee, needs items." },
  sion: { fightStart: "primary", damageByRole: { TOP: D(1, S(1, 0)) }, kit: K(2, 0, 1, 1, 0, 1, 1, 2, 0, 2, 0, [2, 3, 2]),
    why: "Low-economy tank; ultimate is a long-range 5v5 start." },
  shen: { fightStart: "catch", damageByRole: { TOP: D(1, S(0.3, 0.7)), SUPPORT: D(1, S(0.3, 0.7)) }, kit: K(1, 0, 1, 1, 1, 2, 2, 1, 1, 3, 0, [2, 3, 2], true),
    why: "Taunt picks one target; global ultimate protects a carry or joins a fight from a side lane." },
  galio: { fightStart: "primary", damageByRole: { MID: D(2, S(0, 1)), TOP: D(1, S(0, 1)) }, kit: K(2, 0, 0, 1, 1, 3, 3, 3, 1, 2, 0, [2, 3, 2]),
    why: "AoE taunt engage and the strongest turn-around in the pool; anti-magic tank." },
  gnar: { fightStart: "follow-up", damageByRole: { TOP: D(2, S(1, 0)) }, kit: K(2, 1, 2, 1, 1, 3, 2, 3, 1, 2, 1, [2, 2, 2]),
    why: "Mega Gnar wall stun is huge AoE but depends on rage timing: follow-up and counter-engage, not on-demand." },
  renekton: { fightStart: "follow-up", damageByRole: { TOP: D(2, S(1, 0)) }, kit: K(2, 0, 1, 2, 0, 0, 2, 0, 2, 1, 0, [3, 2, 1]),
    why: "Early bully who dives a target someone else engaged; falls off." },
  trundle: { fightStart: "catch", damageByRole: { JUNGLE: D(2, S(1, 0)), TOP: D(2, S(1, 0)) }, kit: K(2, 0, 3, 1, 1, 1, 2, 0, 1, 1, 0, [3, 2, 2]),
    why: "Tank killer (ultimate steals resists) and split-pusher; pillar is a real catch or start tool and cuts off an engage." },

  // ---------- jungle ----------
  sejuani: { fightStart: "primary", damageByRole: { JUNGLE: D(1, S(0, 1)) }, kit: K(1, 0, 1, 1, 0, 2, 3, 3, 0, 2, 0, [2, 3, 2]),
    why: "Tank with a long-range AoE stun start; passive and E reward melee follow-up." },
  "jarvan-iv": { fightStart: "primary", damageByRole: { JUNGLE: D(2, S(1, 0)) }, kit: K(1, 0, 1, 2, 0, 1, 2, 2, 1, 2, 0, [3, 3, 1]),
    why: "Flag-drag and Cataclysm start fights on demand; strong early, falls off." },
  vi: { kit: K(1, 0, 1, 3, 0, 0, 2, 0, 1, 2, 0, [3, 3, 2]), why: "Point-click ultimate onto a backliner." },
  "lee-sin": { kit: K(1, 0, 1, 2, 2, 1, 1, 1, 1, 2, 1, [3, 2, 1]), why: "Kick can start or stop a fight but needs Q or ward setup; early-game champion." },
  nocturne: { fightStart: "catch", damageByRole: { JUNGLE: D(2, S(1, 0)) }, kit: K(1, 0, 1, 3, 0, 0, 2, 0, 1, 3, 0, [2, 3, 2], true),
    why: "Global-range dive onto one target; his value is almost all ultimate." },
  qiyana: { kit: K(2, 0, 0, 2, 0, 0, 2, 2, 2, 3, 1, [3, 3, 1]), why: "Terrain ultimate is a game-winning AoE when positioned; assassin otherwise." },
  maokai: { fightStart: "primary", damageByRole: { JUNGLE: D(1, S(0, 1)), SUPPORT: D(1, S(0, 1)) }, kit: K(1, 0, 1, 1, 2, 2, 2, 3, 0, 1, 0, [2, 3, 2]),
    why: "Point-click root plus a wide ultimate zone that both starts and stops fights." },
  "xin-zhao": { fightStart: "catch", damageByRole: { JUNGLE: D(2, S(1, 0)) }, kit: K(1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 0, [3, 2, 1]),
    why: "Dash-knockup on one target; ultimate can shove divers off a carry." },
  wukong: { fightStart: "primary", damageByRole: { JUNGLE: D(2, S(1, 0)), TOP: D(2, S(1, 0)) }, kit: K(1, 0, 1, 2, 0, 0, 3, 3, 1, 2, 0, [2, 3, 2]),
    why: "AoE knockup ultimate starts and layers onto engages." },

  // ---------- mid ----------
  orianna: { kit: K(3, 2, 1, 1, 1, 1, 3, 3, 2, 2, 2, [1, 3, 3]), why: "Shockwave is the best follow-up in the pool once someone carries the ball in." },
  viktor: { fightStart: "follow-up", damageByRole: { MID: D(3, S(0, 1)) }, kit: K(3, 2, 1, 0, 0, 1, 2, 2, 3, 1, 0, [1, 3, 3]),
    why: "Zone-control mage with fast waveclear; immobile; wants gold." },
  syndra: { kit: K(3, 2, 0, 1, 1, 1, 2, 1, 2, 1, 0, [2, 3, 2]), why: "Burst mage; E stun picks or peels." },
  akali: { fightStart: "none", damageByRole: { MID: D(3, S(0, 1)), TOP: D(3, S(0, 1)) }, kit: K(2, 0, 1, 3, 0, 0, 2, 0, 2, 1, 0, [2, 3, 2]),
    why: "Assassin who reaches backliners; no CC." },
  "twisted-fate": { fightStart: "catch", damageByRole: { MID: D(2, S(0, 1)), TOP: D(2, S(0, 1)) }, kit: K(2, 2, 0, 1, 0, 0, 1, 0, 1, 2, 0, [2, 3, 2], true),
    why: "Map pressure through Destiny and a point-click stun; modest fight damage." },
  ryze: { fightStart: "follow-up", damageByRole: { MID: D(3, S(0, 1)) }, kit: K(3, 1, 2, 0, 1, 0, 2, 0, 3, 0, 0, [1, 2, 3]),
    why: "Gold-hungry scaling DPS mage; short range for a mage; single-target root." },
  ahri: { fightStart: "catch", damageByRole: { MID: D(3, S(0, 1)) }, kit: K(2, 1, 0, 2, 0, 0, 2, 0, 2, 1, 0, [2, 3, 2]),
    why: "Charm picks one target; ultimate gives reach." },
  azir: { fightStart: "catch", damageByRole: { MID: D(3, S(0, 1)) }, kit: K(3, 2, 2, 1, 2, 2, 2, 2, 3, 2, 0, [1, 2, 3]),
    why: "Sustained-DPS control mage; Shuffle can start, peel or turn a fight; gold-hungry." },
  lissandra: { fightStart: "primary", damageByRole: { MID: D(2, S(0, 1)) }, kit: K(2, 1, 0, 2, 1, 3, 3, 3, 1, 2, 0, [2, 3, 2]),
    why: "Point-click ultimate engage and self-cast turn-around." },
  corki: { kit: K(2, 2, 2, 0, 0, 0, 1, 0, 3, 0, 0, [1, 3, 3]), why: "Ranged hybrid carry; poke with Package." },

  // ---------- bot ----------
  sivir: { fightStart: "none", damageByRole: { BOT: D(3, S(1, 0)) }, kit: K(3, 2, 2, 0, 1, 0, 1, 0, 3, 0, 1, [1, 2, 3]),
    why: "Wave-clear DPS carry; her ultimate speeds the team in or out, but she starts nothing herself." },
  ziggs: { kit: K(3, 3, 1, 0, 1, 0, 1, 1, 2, 0, 2, [2, 3, 2]), why: "Artillery siege mage; needs a fight starter." },
  kaisa: { fightStart: "none", damageByRole: { BOT: D(3, S(0.5, 0.5)) }, kit: K(2, 1, 2, 3, 0, 0, 3, 0, 3, 2, 1, [1, 3, 3]),
    why: "Mixed-damage carry who follows dives onto marked targets; short range, needs peel." },
  jinx: { fightStart: "none", damageByRole: { BOT: D(3, S(1, 0)) }, kit: K(2, 2, 2, 0, 0, 0, 1, 1, 3, 0, 1, [1, 2, 3]),
    why: "Immobile hypercarry; resets once she gets a takedown." },
  jhin: { kit: K(2, 3, 0, 0, 0, 0, 2, 1, 2, 1, 2, [2, 3, 2]), why: "Long-range follow-up roots; needs setup." },
  caitlyn: { kit: K(2, 3, 1, 0, 0, 0, 1, 0, 3, 0, 0, [3, 2, 2]), why: "Range bully; traps for siege and follow-up." },
  ezreal: { fightStart: "none", damageByRole: { BOT: D(3, S(0.8, 0.2)) }, kit: K(2, 3, 1, 0, 0, 0, 1, 0, 3, 0, 0, [2, 3, 2]),
    why: "Safe skillshot poke carry; low CC, low teamfight follow-up." },

  // ---------- support ----------
  lulu: { kit: K(0, 2, 0, 0, 3, 2, 1, 1, 0, 1, 0, [2, 2, 3]), why: "Peel and disengage specialist; makes one carry unkillable." },
  karma: { kit: K(1, 2, 0, 0, 2, 1, 1, 1, 0, 0, 0, [3, 2, 1]), why: "Lane-bully enchanter with team speed and poke; peaks early." },
  milio: { fightStart: "none", damageByRole: { SUPPORT: D(0, S(0, 1)) }, kit: K(0, 2, 0, 0, 3, 2, 0, 1, 0, 2, 0, [2, 2, 3]),
    why: "Pure protect-the-carry enchanter: range, cleanse, heals." },
  rell: { fightStart: "primary", damageByRole: { SUPPORT: D(1, S(0, 1)) }, kit: K(0, 0, 0, 2, 0, 1, 3, 3, 0, 1, 0, [2, 3, 2]),
    why: "Layered AoE engage tank." },
  thresh: { kit: K(0, 1, 0, 1, 2, 2, 2, 2, 0, 1, 2, [2, 3, 2]), why: "Hook catch, lantern and flay peel." },
  pyke: { fightStart: "catch", damageByRole: { SUPPORT: D(2, S(0.7, 0, 0.3)) }, kit: K(0, 0, 0, 2, 0, 0, 2, 1, 1, 1, 2, [3, 2, 1]),
    why: "Hook assassin support; physical and execute damage; no frontline." },
  nautilus: { kit: K(0, 0, 0, 2, 0, 1, 2, 2, 0, 1, 0, [2, 3, 2]), why: "Point-click ultimate start; hook catch." },
  braum: { fightStart: "follow-up", damageByRole: { SUPPORT: D(0, S(0, 1)) }, kit: K(0, 0, 0, 0, 3, 3, 2, 2, 0, 1, 0, [2, 2, 2]),
    why: "Anti-dive: shield blocks projectiles, ultimate turns engages around; cannot start a fight on demand." },
  leona: { fightStart: "primary", damageByRole: { SUPPORT: D(1, S(0, 1)) }, kit: K(0, 0, 0, 2, 0, 1, 2, 2, 0, 1, 0, [3, 3, 1]),
    why: "All-in engage tank; little peel once she has committed." },
  bard: { fightStart: "catch", damageByRole: { SUPPORT: D(1, S(0, 1)) }, kit: K(0, 2, 0, 1, 2, 1, 1, 2, 0, 2, 1, [2, 3, 2]),
    why: "Roaming catch support; ultimate can start, stop or ruin a fight; high execution." },
  alistar: { fightStart: "primary", damageByRole: { SUPPORT: D(1, S(0, 1)) }, kit: K(0, 0, 0, 2, 2, 2, 2, 2, 0, 1, 0, [2, 3, 2]),
    why: "Engage tank whose combo also peels a diver off the carry." },
  rakan: { fightStart: "primary", damageByRole: { SUPPORT: D(1, S(0, 1)) }, kit: K(0, 0, 0, 3, 1, 1, 3, 3, 0, 1, 0, [2, 3, 2]),
    why: "Fast AoE engage that reaches the backline; light peel through E shields." },
  nami: { kit: K(0, 2, 0, 0, 2, 1, 2, 2, 0, 1, 1, [2, 2, 2]), why: "Bubble catch, wave disengages or follows up." },
};

/** Builds the converted champions: v1 data plus the v2 fightStart / damageByRole (reused from samples.ts) and the kit. */
export function convertKits(champions: Champion[]): ChampionKit[] {
  const samples = { ...REPRESENTATIVE, ...EXAMPLE_ONLY } as Record<string, { fightStart: FightStart; damageByRole: ChampionKit["damageByRole"] }>;
  return Object.entries(KITS).map(([id, k]) => {
    const c = champions.find((x) => x.id === id);
    if (!c) throw new Error(`unknown champion ${id}`);
    const fightStart = k.fightStart ?? samples[id]?.fightStart;
    const damageByRole = k.damageByRole ?? samples[id]?.damageByRole;
    if (!fightStart || !damageByRole) throw new Error(`${id}: no fightStart / damageByRole`);
    const { engage: _engage, ...attrs } = c.attrs;
    return { id: c.id, name: c.name, aliases: c.aliases, roles: c.roles, flags: c.flags, reviewed: false, attrs, fightStart, damageByRole, kit: { ...k.kit, selfPeel: SELF_PEEL[id] ?? 0 } };
  });
}
