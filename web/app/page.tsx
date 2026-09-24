import { getLedger } from "@/lib/db";
import { LedgerView } from "@/components/ledger-view";

export const dynamic = "force-dynamic";

export default function Home() {
  const invoices = getLedger();
  return <LedgerView invoices={invoices} />;
}