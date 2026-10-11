import { Sidebar } from "@/components/Sidebar";
import { TipLayer } from "@/components/TipLayer";
import { UpdateNotice } from "@/components/UpdateNotice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main-col">
        <main className="main">{children}</main>
        <footer className="site-foot">
          Draft Assistant was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using assets owned by Riot Games.
          Riot Games does not endorse or sponsor this project. Gen.G and GenRang are trademarks of Gen.G Esports; this
          project is not affiliated with Gen.G.
        </footer>
      </div>
      <UpdateNotice />
      <TipLayer />
    </div>
  );
}
