"use client";
// Analyst perspectives (alan, 2026-11-01): a collapsed row inside an open Pro Drafts game, shown only when the game has
// commentary. Opening it loads the commentary chunk once (lib/analyst-commentary-bundle.ts) and lists each analyst's
// paraphrased observations, draft before post-game, each linked to its exact video moment, with a quiet note where
// another analyst answers the same question the same way or differently. Disagreements are shown, never resolved.
// Attributed opinion only: separate from Pro Evidence and General Draft Logic, and read by nothing that scores.
import { useEffect, useState } from "react";
import { ChampIcon } from "@/components/ChampIcon";
import { Disclosure } from "@/components/Disclosure";
import { CHECK_LABEL, KIND_LABEL, mentionLabel, perspectivesFor, type CreatorBlock } from "@/lib/analyst-commentary";

let loaded: Promise<typeof import("@/lib/analyst-commentary-bundle")> | undefined;
const load = () => (loaded ??= import("@/lib/analyst-commentary-bundle"));

type Side = "blue" | "red";

export function AnalystPerspectives({ game, count, teams, picks, names }: {
  game: number; count: number; teams: Record<Side, string>; picks: Record<Side, string[]>; names: Record<string, string>;
}) {
  if (!count) return null;
  return (
    <Disclosure className="analyst-perspectives" summary="Analyst perspectives" meta={count} lazy>
      <Body game={game} teams={teams} picks={picks} names={names} />
    </Disclosure>
  );
}

function Body({ game, teams, picks, names }: { game: number; teams: Record<Side, string>; picks: Record<Side, string[]>; names: Record<string, string> }) {
  const [blocks, setBlocks] = useState<CreatorBlock[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load().then((m) => live && setBlocks(perspectivesFor(m.commentary, game)), () => live && setFailed(true));
    return () => { live = false; };
  }, [game]);
  if (failed) return <p className="small caution-text">The commentary could not be loaded. Reload the page to try again.</p>;
  if (!blocks) return <p className="small muted">Loading…</p>;
  return (
    <div className="ap">
      <p className="xs muted ap-intro">Analysts' opinions from their streams, paraphrased, with the moment they said it. Opinions, not recorded evidence; they never change a recommendation.</p>
      {blocks.map((b) => (
        <section key={b.creator} className="ap-creator" aria-label={b.name}>
          <h3 className="ap-name">{b.name} <a className="xs muted ap-video" href={b.video.url} target="_blank" rel="noreferrer" title={b.video.title}>Video ↗</a></h3>
          <ol className="ap-list">
            {b.items.map((o) => (
              <li key={o.id} className="ap-item">
                <div className="ap-meta xs">
                  <a className="ap-time num" href={o.href} target="_blank" rel="noreferrer" aria-label={`${b.name} at ${o.time} (opens the video)`}>{o.time}</a>
                  {o.phase === "post-game" && o.kind !== "reflection" && <span className="ap-phase">Post-game</span>}
                  <span className="ap-kind">{KIND_LABEL[o.kind]}</span>
                </div>
                <p className="ap-text">{o.text}</p>
                {o.champions.length > 0 && (
                  <ul className="ap-champs" aria-label="Champions mentioned">
                    {o.champions.map((m) => (
                      <li key={`${m.id}-${m.as}-${m.side}`} className="ap-champ xs">
                        <ChampIcon id={m.id} name={names[m.id] ?? m.id} size="xs" />
                        <span>{names[m.id] ?? m.id}</span>
                        <span className="muted">{mentionLabel(m, teams, picks)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {o.check && (
                  <p className={`xs ap-check ${o.check.status}`}>
                    <b>{CHECK_LABEL[o.check.status]}:</b> {o.check.claim} <span className="muted">{o.check.evidence}</span>
                  </p>
                )}
                {o.relations.map((r) => (
                  <p key={r.creator} className="xs muted ap-relation">
                    {r.name} {r.agrees ? "agrees" : "differs"} · {r.question}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
