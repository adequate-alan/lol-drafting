import blg from "@/assets/teams/blg.webp";
import geng from "@/assets/teams/geng.webp";
import { BASE_PATH } from "@/lib/site";

// Team logos for the Worlds 2026 Finals hub (alan, 2026-11-14). Each team's own mark, read from Wikipedia's file
// pages on 2026-11-14: Gen.G's shield (File:Gen.G Logo.svg, public domain, trademarked) and Bilibili Gaming's current
// logo (File:Bilibili Gaming logo (2021).png, a non-free logo there). Shown unaltered, only to name the two finalists,
// on an ivory tile in both themes so the black Gen.G lettering stays readable. Fixed size in markup: nothing shifts.
const LOGOS = { geng: { img: geng, name: "Gen.G" }, blg: { img: blg, name: "Bilibili Gaming" } };

export function TeamLogo({ team, size = 56 }: { team: keyof typeof LOGOS; size?: number }) {
  const { img, name } = LOGOS[team];
  const inner = size - 12; // the tile is `--team-logo` (56px) with 6px of ivory around the mark
  const scale = Math.min(inner / img.width, inner / img.height);
  const src = img.src.startsWith(BASE_PATH) || /^https?:/.test(img.src) ? img.src : `${BASE_PATH}${img.src}`;
  return (
    <span className="team-logo" data-team={team}>
      <img src={src} width={Math.round(img.width * scale)} height={Math.round(img.height * scale)} alt={`${name} logo`} draggable={false} />
    </span>
  );
}
