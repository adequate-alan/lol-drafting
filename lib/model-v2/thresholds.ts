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
