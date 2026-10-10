import { Sidebar } from "@/components/Sidebar";
import { UpdateNotice } from "@/components/UpdateNotice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">{children}</main>
      <UpdateNotice />
    </div>
  );
}
