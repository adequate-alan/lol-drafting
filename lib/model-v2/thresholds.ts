// Every threshold the v2 warnings use, in one place for review. All values are deterministic constants.
export const THRESHOLDS = {
  // Damage balance. Contribution = damageThreat (for the slot's role) × damageSplit share.
  damage: {
    minPicks: 4,              // damage warnings wait until at least this many picks are locked
    dominantShare: 0.8,       // too much AD / AP: this share or more of total contribution is one type
    strongIndividual: 2.0,    // one pick with this much magic (or physical) contribution is a real threat on its own
    meaningfulCombined: 2.5,  // combined magic (or physical) contribution that counts even with no strong individual
  },
  // Fight start.
  engage: {
    minPicks: 4,              // team-wide engage warnings wait until at least this many picks are locked
    setupMinPicks: 2,         // "needs a fight starter" (Jhin, Miss Fortune, Ziggs) checks from this many picks
  },
  // General Logic fixes.
  fixes: {
    damageContribution: 1.5,  // a candidate "adds magic / physical damage" only with at least this contribution in its role
  },
} as const;

// Comp analysis (lib/model-v2/analyze.ts). Draft heuristics on the 0–3 kit scales, not measurements.
export const ANALYSIS = {
  earlyRead: 2,               // 2–3 picks: "Early read"; team-wide weaknesses wait for teamRules
  teamRules: 4,               // weaknesses about the whole comp need this many picks
  carryThreat: 2,             // damageThreat at or above this makes a pick a damage source
  concentration: { major: 0.6, moderate: 0.5, onlySource: 0.42 }, // one pick's share of the team's damage threat; onlySource when it is the only sustained damage
  followUpNeeded: 5,          // allies' combined followUp an engage needs behind it (4+ picks)
  followUpRich: 5,            // combined followUp that makes "follow-up without engage" the right label
  tankDamage: { best: 2, total: 5 },
  shortRangeCarries: 3,       // damage sources at range 0–1
  weakEarly: 1.5, weakLate: 1.5, // mean curve value at or below this is a weak stage
  resourceHungry: 3,          // picks with resourceDemand 3
  waveclearTotal: 6,          // team waveclear at or below this (4+ picks) is a siege weakness
  frontlineHeavy: { frontliners: 3, maxDamage: 8 }, // 3+ frontliners and summed damage threat under this
  identity: { secondaryShare: 0.6, minScore: 4 },
  enemy: { rangeGap: 0.7, curveGap: 0.6, objectiveGap: 3 },
  needsShown: 3, weakShown: 3,
} as const;
