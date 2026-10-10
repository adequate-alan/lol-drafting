import { NavLinks } from "@/components/NavLinks";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">Clash Draft Room</div>
        <NavLinks />
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
