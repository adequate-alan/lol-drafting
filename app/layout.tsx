import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { TYPEKIT_CSS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Draft Assistant",
  description: "League of Legends drafting tool. Fan project, not endorsed by Riot Games.",
  robots: { index: false, follow: false },
};

// Runs before first paint so a saved (or OS) theme never flashes the other one.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href={TYPEKIT_CSS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
