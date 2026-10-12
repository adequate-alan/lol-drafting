// A professional player's portrait (alan, 2026-10-12): the checked photograph from lib/player-portraits.ts, or the
// player's initials. Never a champion icon. Fixed size in markup and CSS, so nothing shifts while the image loads; the
// credit is in the tooltip (Commons licenses ask for attribution) and in the Pinned Players photo credits.
import { initials, portraitOf } from "@/lib/player-portraits";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
const PX: Record<AvatarSize, number> = { xs: 20, sm: 24, md: 36, lg: 48, xl: 104 }; // the --avatar-* tokens

export function PlayerAvatar({ id, name, size = "sm", className = "" }: { id?: number | string; name: string; size?: AvatarSize; className?: string }) {
  const p = portraitOf(id);
  const px = PX[size];
  if (!p) return <span className={`player-avatar ${size} initials ${className}`} aria-hidden="true">{initials(name)}</span>;
  return (
    <span className={`player-avatar ${size} ${className}`} title={`${name}\n${p.credit}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, already a small local crop */}
      <img src={p.src} width={px} height={px} alt={name} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
