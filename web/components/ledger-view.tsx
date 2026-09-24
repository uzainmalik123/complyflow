"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LedgerRow, ProcessResult } from "@/lib/db";
import { StatusStamp } from "@/components/status-stamp";
import { DetailDrawer } from "@/components/detail-drawer";
import { NewInvoicePanel } from "@/components/new-invoice-panel";

type Filter = "all" | "auto_approved" | "flagged_for_review" | "rejected";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "auto_approved", label: "Registry" },
  { key: "flagged_for_review", label: "Flagged" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatAmount(value: number | null): string {
  return value === null ? "—" : currency.format(value);
}

export function LedgerView({ invoices: initialInvoices }: { invoices: LedgerRow[] }) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [showPanel, setShowPanel] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const lastOpenedRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    setInvoices(initialInvoices);
  }, [initialInvoices]);

  const rows = useMemo(
    () =>
      filter === "all"
        ? invoices
        : invoices.filter((row) => row.decision === filter),
    [filter, invoices]
  );

  function openRow(row: LedgerRow) {
    lastOpenedRef.current = rowRefs.current.get(row.invoice_id) ?? null;
    setSelected(row);
  }

  function handleRowKeyDown(event: React.KeyboardEvent, row: LedgerRow) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRow(row);
    }
  }

  function closeDrawer() {
    setSelected(null);
    lastOpenedRef.current?.focus();
  }

  function handleProcessed(result: ProcessResult) {
    setInvoices((prev) => [...prev, result.invoice]);
    setShowPanel(false);
    openRow(result.invoice);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <header className="flex items-center justify-between border-b border-ledger-line pb-4">
        <h1 className="font-sans text-sm font-semibold uppercase text-ink">
          ComplyFlow
        </h1>
        <button
          type="button"
          onClick={() => setShowPanel((open) => !open)}
          aria-expanded={showPanel}
          aria-controls="new-invoice-panel"
          className="font-sans text-sm text-ink hover:text-brass focus:outline-none focus-visible:outline focus-visible:outline-brass"
        >
          {showPanel ? "Close" : "New invoice"}
        </button>
      </header>

      {showPanel && (
        <div id="new-invoice-panel">
          <NewInvoicePanel
            onSuccess={handleProcessed}
            onCancel={() => setShowPanel(false)}
          />
        </div>
      )}

      <div className="flex gap-12 pt-8">
        <aside className="w-40 shrink-0">
          <nav aria-label="Filter by status" className="flex flex-col gap-1">
            {FILTERS.map(({ key, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={active}
                  className={`border-l-2 py-1.5 pl-3 text-left font-sans text-sm transition-none ${
                    active
                      ? "border-brass font-medium text-brass"
                      : "border-transparent text-ink hover:text-brass"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <p className="pt-8 font-sans text-sm text-ink/60">
              No invoices in this view yet.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-ledger-line">
                  <th className="pb-2 pr-6 text-left font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
                    Status
                  </th>
                  <th className="pb-2 pr-6 text-left font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
                    Invoice
                  </th>
                  <th className="pb-2 pr-6 text-left font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
                    Vendor
                  </th>
                  <th className="pb-2 text-right font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-line">
                {rows.map((row) => (
                  <tr
                    key={row.invoice_id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.invoice_id, el);
                    }}
                    tabIndex={0}
                    role="button"
                    aria-haspopup="dialog"
                    aria-expanded={selected?.invoice_id === row.invoice_id}
                    onClick={() => openRow(row)}
                    onKeyDown={(event) => handleRowKeyDown(event, row)}
                    className="cursor-pointer focus:outline-none focus-visible:bg-ink/[0.03] focus-visible:outline focus-visible:outline-brass hover:bg-ink/[0.03]"
                  >
                    <td className="py-3 pr-6 align-middle">
                      <StatusStamp decision={row.decision} />
                    </td>
                    <td className="py-3 pr-6 font-mono text-sm text-ink">
                      {row.invoice_id}
                    </td>
                    <td className="py-3 pr-6 font-sans text-sm text-ink">
                      {row.vendor_name}
                    </td>
                    <td className="py-3 text-right font-mono text-sm text-ink tabular-nums">
                      {formatAmount(row.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>

      {selected && <DetailDrawer invoice={selected} onClose={closeDrawer} />}
    </div>
  );
}