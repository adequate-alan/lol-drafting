import { NavLinks } from "@/components/NavLinks";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">Clash Draft Room</div>
        <NavLinks />
        <div className="spacer" />
        <form method="post" action="/api/logout">
          <button type="submit">Sign out</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
