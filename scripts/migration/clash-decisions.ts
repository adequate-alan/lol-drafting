// alan's explicit decisions (2026-10-10) that override or extend the workbook during migration.
// Each entry records why it differs from the sheet. After migration, /data is canonical.

export interface BotDecision {
  clashDefault?: string[];
  alternatives?: string[];
  alternativeNotes?: Record<string, string>;
  // champions the sheet cites as pro variants that are not in a recorded draft
  extraObservedClaims?: string[];
  logicWarning?: string;
  why: string;
}

export const BOT_DECISIONS: Record<string, BotDecision> = {
  Sivir: {
    clashDefault: ["Lulu"],
    alternatives: ["Karma", "Bard", "Rakan", "Seraphine"],
    alternativeNotes: { Karma: "Observed playoff / tempo alternative, not the Clash default." },
    why: "Sheet listed 'Lulu / Karma' as a joint default. alan: Lulu is the default; Karma's recent pro usage does not make it the default.",
  },
  Ezreal: {
    clashDefault: ["Karma"],
    alternatives: ["Seraphine", "Bard", "Milio", "Neeko", "Nautilus"],
    why: "Sheet listed 'Karma / Seraphine' as a joint default. alan: Karma is the default; Seraphine and Nautilus are alternatives only.",
  },
  Yunara: {
    alternatives: ["Braum", "Milio", "Renata Glasc"],
    alternativeNotes: { Braum: "Anti-dive / protection option." },
    why: "alan: keep Braum available as the anti-dive option.",
  },
  Ziggs: {
    clashDefault: ["Nautilus", "Leona"],
    alternatives: [],
    extraObservedClaims: ["Camille"],
    logicWarning: "Ziggs needs reliable engage or catch somewhere else in the composition if support is not providing it.",
    why: "Sheet secondary column held Camille, Bard, Karma. alan: no Clash alternatives; Pyke and Camille are observed pro variants only; Bard and Karma removed.",
  },
};

export interface MidJungleDecision {
  clashDefault?: string[];
  alternatives?: string[];
  history?: { partner: string; era: "earlier-2026"; note: string }[];
  why: string;
}

export const MID_JUNGLE_DECISIONS: Record<string, MidJungleDecision> = {
  Azir: {
    clashDefault: ["Jarvan IV"],
    alternatives: ["Vi", "Xin Zhao"],
    history: [{ partner: "Skarner", era: "earlier-2026", note: "Azir+Skarner was the go-to pairing earlier in 2026. Not the current Gen.G default: Azir had 2 playoff picks and went 0-2." }],
    why: "Sheet primary was 'Skarner / Jarvan IV'. alan: Azir+Skarner must not be presented as current, so Skarner moves to history.",
  },
};
