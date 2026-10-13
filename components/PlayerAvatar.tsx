// A professional player's portrait (alan, 2026-10-12): the checked photograph from lib/player-portraits.ts, or the
// player's initials. Never a champion icon. Fixed size in markup and CSS, so nothing shifts while the image loads; no
// tooltip (alan, 2026-10-13: the portrait and name beside it say it all); the credit lives in data/player-portraits.json
// and the Pinned Players "Photo credits" Disclosure.
import { initials, portraitOf } from "@/lib/player-portraits";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";
const PX: Record<AvatarSize, number> = { xs: 20, sm: 24, md: 36, lg: 48, xl: 104, hero: 144 }; // the --avatar-* tokens

export function PlayerAvatar({ id, name, size = "sm", className = "" }: { id?: number | string; name: string; size?: AvatarSize; className?: string }) {
  const p = portraitOf(id);
  const px = PX[size];
  // The initials are drawn by CSS (content: attr), so they never join the player's name in text selection or innerText.
  if (!p) return <span className={`player-avatar ${size} initials ${className}`} data-initials={initials(name)} aria-hidden="true" />;
  return (
    <span className={`player-avatar ${size} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, already a small local crop */}
      <img src={p.src} width={px} height={px} alt={name} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
