import Link from "next/link";
import { BASE_PATH } from "@/lib/site";

// A static host can't send a server redirect, so the page forwards itself to the Bot tab.
export default function FirstPickIndex() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${BASE_PATH}/first-pick/bot/`} />
      <p className="small muted">Opening <Link href="/first-pick/bot">First Pick: Bot</Link>…</p>
    </>
  );
}
