import { Sidebar } from "@/components/Sidebar";
import { UpdateNotice } from "@/components/UpdateNotice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main-col">
        <main className="main">{children}</main>
        <footer className="site-foot">
          Draft Assistant was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using assets owned by Riot Games.
          Riot Games does not endorse or sponsor this project.
        </footer>
      </div>
      <UpdateNotice />
    </div>
  );
}
