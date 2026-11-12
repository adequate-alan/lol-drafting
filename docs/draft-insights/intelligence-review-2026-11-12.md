# Draft Room Intelligence Review (2026-11-12)

How the four TheRealRaven videos (see `research-2026-11-12.md`) should change the Draft Room's recommendations, Comp
Check and next-pick guidance.

Ground rules kept: pro data never scores or orders; DPM counters stay labels; enemy roles stay confirmed / likely /
conditional; saved Synergies are never touched; a creator's opinion is never an unconditional rule. Every "today"
output below was produced by the current code (`recommend`, `analyzePlan`) on 2026-11-12.

## The scope the research supports

The videos are solo-queue lane guides: archetypes, lane matchups, bot duo fit, and when a pick is meant to win. They do
not cover pick order, blind versus counter timing, bans, flex picks, revealing a comp early, or pro draft priority. So
the early-draft questions in alan's brief (blind safety, priority by remaining roles, revealing too much) get no new
rules from this research; the Draft Room's existing pro-based starting picks and blind labels stay as they are.

## Lesson by lesson

| Lesson | Problem it addresses | Model today | Data needed | Data present? | Proposed effect | Fails when | Test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Type gives plan, champion decides matchup | Over-trusting class labels | Already right: Counters are per champion (DPM), no class counters | — | — | None | — | Existing counters tests |
| Abilities against abilities | Matchups that hinge on one interaction | Counter kit read says it can't see interactions | Per-ability interaction facts | No | "Learn why" link on the Counter card's no-reason read (shipped) | — | `tests/draft-insights.test.ts` |
| Melee into ranged: close the gap | Kiting vs reach | Kit range, selfPeel, backlineAccess; Counter read names range / mobility | Reach and escape per kit | Partly | None | — | — |
| Projectile blockers lose to walk-in engage | Braum vs Nautilus vs Rell | Not modelled (`fightStart` has no shape) | Start shape per support | No | Kit fact, explanation only (D3) | Projectile shields beyond Braum, Yasuo wall | proposed |
| Disengage is a cooldown | Over-valuing one cancel | disengage and counterEngage kept apart; anti-engage plan job | — | Yes | "Learn why" on `plan:anti-engage` (shipped) | — | — |
| Immobile mages lose to reach | Mage vs engage | Enemy `needs-peel` drives "Can dive X"; Lux and other mage supports aren't flagged | Immobile enemy carry or mage | Partly (selfPeel) | Possible reason line, not proposed now (see below) | Mage with self-peel (Seraphine, Neeko) | — |
| Match the support to the ADC | Duo goals | Duo reads for engage / follow-up / peel | Curves, fightStart, followUp | Yes | One rule correction (D1); no mismatch warning (D2) | Pro duos that break it | below |
| Convert the lead | Early comps without a way to use it | Tempo plan, timing, `plan:lanes` | — | Yes | "Learn why" on `plan:lanes` (shipped) | — | — |
| Lose lane by design | Misreading scalers and tanks | Curves, resourceDemand, scaling plan, `plan:survive` | — | Yes | "Learn why" on `plan:survive` (shipped) | — | — |
| Tempo has a deadline | Early comps vs scaling | Timing curve in Comp Check | — | Yes | None | — | — |

## Scenarios: today's output and what the research says

Top three per scenario, with the leading reasons the Draft Room shows today.

1. **Galio mid + Ezreal bot, jungle next** (alan's example). Today: Naafiri (saved default; "Follows up on Galio's
   engage", fixes follow-up; tradeoff "Falls off late"), Vi, Jarvan IV. Plan: early front-to-back read. The videos say
   nothing about Galio or mid/jungle, so no change. The reasons already say why, and the tradeoff shows.
2. **Engage without follow-up** (Ornn, Sejuani, Leona, Ezreal; mid open). Today: Yone, Ryze, Brand, each "Fixes second
   damage threat and sustained damage", Brand with a proposed-synergy reason. Plan: "Needed from the mid: Frontline
   without damage". Sensible; no change.
3. **Follow-up without a start** (Gnar, Orianna, Jinx, Lulu; jungle open). Today: Jarvan IV, Vi, Skarner, each "Fixes
   primary engage: Follow-up without engage". Sensible; no change.
4. **Dive into front-to-back** (Camille, Vi, Ahri vs Ornn, Sejuani, Orianna, Jinx, Lulu; bot open). Today: Miss Fortune
   ("Fixes range: They outrange us"), Jhin, Tristana, tradeoff "Low disengage". No video principle applies beyond what
   is shown; no change.
5. **Scaling into early pressure** (Kayle, Azir, Jinx, Lulu vs Lee Sin, Renekton, Draven, Leona; jungle open). Today:
   Jarvan IV (saved; fixes frontline, engage, early jungle), Maokai ("Peel or disengage against Leona's engage"),
   Skarner. This is the videos' "lose lane by design, survive to the spike" lesson; the model already asks for early
   safety. No change.
6. **Lane bully, support next** (Draven alone). Today: Nautilus, Rell, Alistar (saved), "Strong 2v2 lane pressure" and
   "Nautilus's engage gives Draven a target". Exactly the creator's advice. But once the five are locked, the plan read
   calls Draven + Leona "Engage gets ranged follow-up, not an all-in" (see D1).
7. **Kalista vs Lux, support next.** Today: Renata Glasc (saved default), Alistar, Nautilus. The creator says engage
   beats mage supports; the ranking doesn't use that, and Renata stays first because it is alan's saved default, which
   no lesson may override. The Counter label still appears if DPM supports a counter.
8. **Final pick** (Renekton, Lee Sin, Azir, Kalista; support open vs Ornn, Sejuani, Orianna, Jinx, Lulu). Today:
   Alistar ("Fixes primary engage", "Can dive Jinx, who needs peel"), Nautilus, Rell, each with "Into their draft: They
   can disengage our dive". The tradeoff is the disengage lesson in action. No change.
9. **Enemy flex uncertainty.** Nothing proposed here reads an enemy role, so the confirmed / likely / conditional
   handling is untouched.

## Decisions for alan

**D1. Bully + engage should not read as a weak duo (display only, but it changes an approved rule).**
The 2026-10-14 `followOf` rule calls any carry without follow-up 2+ "ranged follow-up, not an all-in" next to an engage
support. That fires on Draven + Leona, Caitlyn + Neeko and Lucian + Nautilus, the very pairs the videos (and the saved
Draven defaults) treat as ideal, and it fires the same way as Ezreal + Nautilus, which the creator's data puts at 42%.
Proposal: a lane bully (early curve 3 and lane pressure 3) counts as finishing its support's lane all-in with its own
early damage, so the minor finding stays on Ezreal, Corki, Ziggs and Senna with engage and goes from Draven, Caitlyn
and Lucian. No score, kit or order changes. Tests: those five pairs; the existing `comp-plan` and `fourth-pick` suites
unchanged.

**D2. No "bully without an engage support" warning (recommendation: don't add it).**
Tried against all 408 recorded pro lineups: it would fire on 80, led by Lucian + Milio (42 lineups) and Kalista +
Renata Glasc (36, alan's saved default). Pro picks aren't proof of what is optimal, but a warning that contradicts the
two most common pro bully pairs and a saved default is a false alarm, not a lesson. The lesson keeps this as a
solo-queue heuristic and says so.

**D3. Projectile versus walk-in engage as a kit fact (optional, explanation only).**
A `startShape` (projectile, dash, walk, point-click) for supports would let the Counter card explain edges like Braum
over Nautilus. Explanation only, never a score; needs alan's per-champion kit review (about 40 supports). Recommendation:
defer until a Counter card actually shows an unexplained support edge that this would explain.

**No scoring change is proposed.** The ranking has no lane-matchup scoring (DPM counters are labels by rule), and every
duo or archetype rule the videos suggest either duplicates an existing read or breaks on recorded pro drafts (D2). If
alan wants enemy-aware reach ("engage support into an immobile mage support"), that would be a new scored matchup
factor and would come back with its own before/after first.

## Shipped without scoring changes

- Draft Insights section (`/insights/`): 17 lessons, 5 topics, 4 video pages, filters by topic, champion, video and
  text.
- "Learn why" links in Comp Check on duo findings, anti-engage, early safety and lane priority, and on the Counter
  card's "no clear kit reason" line. Links only: no finding, tier, score or order changes (`tests/draft-insights.test.ts`
  checks that only these files read the lessons).
