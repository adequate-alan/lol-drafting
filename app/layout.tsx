import type { Metadata } from "next";
import localFont from "next/font/local";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

// Space Grotesk (SIL OFL 1.1, github.com/floriankarsten/space-grotesk; license in assets/fonts) for titles, navigation,
// tabs, buttons, labels and champion names. Self-hosted and preloaded by the build; nothing loads from a font CDN.
const grotesk = localFont({
  src: "../assets/fonts/SpaceGrotesk-Variable.woff2",
  weight: "300 700",
  variable: "--font-grotesk",
  display: "swap",
  fallback: ["Inter Variable", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "Draft Assistant", template: "%s · Draft Assistant" },
  description: "League of Legends drafting tool. Fan project, not endorsed by Riot Games.",
  robots: { index: false, follow: false },
};

// Runs before first paint so a saved (or OS) theme never flashes the other one.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={grotesk.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
