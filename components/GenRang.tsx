import face from "@/assets/genrang-face.webp";
import full from "@/assets/genrang.webp";
import { BASE_PATH } from "@/lib/site";

// GenRang, Gen.G's tiger mascot, cropped from Gen.G's own artwork (figure only, no sponsor marks). A brand accent:
// the sidebar, the Gen.G page and empty states, never inside cards. Served from the build, so it follows the base path.
export function GenRang({ variant = "face", size, className = "" }: { variant?: "face" | "full"; size: number; className?: string }) {
  const img = variant === "face" ? face : full;
  const height = variant === "face" ? size : Math.round((size * img.height) / img.width);
  // Imported images resolve to /_next/static/...; make sure the GitHub Pages base path is on it exactly once.
  const src = img.src.startsWith(BASE_PATH) || /^https?:/.test(img.src) ? img.src : `${BASE_PATH}${img.src}`;
  return <img className={`genrang ${className}`} src={src} width={size} height={height} alt="" aria-hidden="true" draggable={false} />;
}
