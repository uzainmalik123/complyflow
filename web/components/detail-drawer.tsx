"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuditEntry,
  ComplianceCheck,
  InvoiceDetail,
  LedgerRow,
  LineItem,
} from "@/lib/db";
import { getInvoiceDetailAction } from "@/lib/actions";
import { CheckResult, StatusStamp } from "@/components/status-stamp";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatAmount(value: number | null): string {
  return value === null ? "—" : currency.format(value);
}

type SectionProps = { title: string; children: React.ReactNode };

function Section({ title, children }: SectionProps) {
  return (
    <section className="mt-6 border-t border-ledger-line pt-4 first:mt-0">
      <h2 className="font-sans text-sm font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-t border-ledger-line py-2 first:border-t-0">
      <dt className="font-sans text-xs text-ink/50">{label}</dt>
      <dd className={`text-sm text-ink ${mono ? "font-mono" : "font-sans"}`}>{value}</dd>
    </div>
  );
}

function LineItemsTable({ items }: { items: LineItem[] }) {
  return (
    <table className="mt-3 w-full border-collapse">
      <thead>
        <tr className="border-b border-ledger-line">
          <th className="pb-2 pr-4 text-left font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
            Description
          </th>
          <th className="pb-2 pr-4 text-right font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
            Qty
          </th>
          <th className="pb-2 pr-4 text-right font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
            Unit
          </th>
          <th className="pb-2 text-right font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
            Total
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ledger-line">
        {items.map((item, i) => (
          <tr key={i}>
            <td className="py-2 pr-4 font-sans text-sm text-ink">{item.description}</td>
            <td className="py-2 pr-4 text-right font-mono text-sm text-ink tabular-nums">
              {item.quantity}
            </td>
            <td className="py-2 pr-4 text-right font-mono text-sm text-ink tabular-nums">
              {currency.format(item.unit_price)}
            </td>
            <td className="py-2 text-right font-mono text-sm text-ink tabular-nums">
              {currency.format(item.total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChecksList({ checks }: { checks: ComplianceCheck[] }) {
  return (
    <div className="mt-3">
      {checks.map((check) => (
        <div key={check.check_name} className="border-t border-ledger-line py-3 first:border-t-0">
          <div className="flex items-center gap-3">
            <CheckResult passed={check.passed} />
            <span className="font-mono text-sm text-ink">{check.check_name}</span>
          </div>
          {check.detail && (
            <p className="mt-1.5 pl-[3rem] font-sans text-sm text-ink/75">{check.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function AuditTrail({ audit }: { audit: AuditEntry[] }) {
  return (
    <div className="mt-3">
      {audit.map((entry, i) => (
        <div
          key={i}
          className="grid grid-cols-[7.5rem_1fr_auto] items-baseline gap-4 border-t border-ledger-line py-3.5 first:border-t-0"
        >
          <span className="font-sans text-[11px] font-semibold uppercase text-ink">
            {entry.agent_name}
          </span>
          <span className="font-mono text-sm text-ink">{entry.action}</span>
          <time className="font-mono text-xs text-ink/60">{entry.timestamp}</time>
        </div>
      ))}
    </div>
  );
}

export function DetailDrawer({
  invoice,
  onClose,
}: {
  invoice: LedgerRow;
  onClose: () => void;
}) {
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getInvoiceDetailAction(invoice.invoice_id)
      .then((detail) => {
        if (!cancelled) setData(detail);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this invoice.");
      });
    return () => {
      cancelled = true;
    };
  }, [invoice.invoice_id]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const startClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setOpen(false);
    window.setTimeout(onClose, 300);
  }, [closing, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        startClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [startClose]
  );

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={startClose}
        className={`absolute inset-0 bg-ink/30 transition-opacity duration-300 ${
          open && !closing ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-heading"
        onKeyDown={handleKeyDown}
        className={`absolute right-0 top-0 flex h-full w-[30rem] max-w-full flex-col border-l border-ledger-line bg-paper transition-transform duration-300 ease-out ${
          open && !closing ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-baseline justify-between border-b border-ledger-line px-6 py-4">
          <div>
            <h2 id="drawer-heading" className="font-mono text-sm text-ink">
              {invoice.invoice_id}
            </h2>
            <p className="mt-0.5 font-sans text-xs text-ink/60">{invoice.vendor_name}</p>
          </div>
          <div className="flex items-center gap-4">
            <StatusStamp decision={invoice.decision} />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={startClose}
              className="font-sans text-sm text-ink hover:text-brass"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="font-sans text-sm text-ink/75">{error}</p>
          ) : !data ? (
            <p className="font-sans text-sm text-ink/60">Loading invoice detail…</p>
          ) : (
            <>
              <Section title="Extracted fields">
                <dl className="mt-3">
                  <FieldRow label="Vendor" value={data.vendor_name} />
                  <FieldRow label="Invoice date" value={data.invoice_date ?? "—"} mono />
                  <FieldRow label="Due date" value={data.due_date ?? "—"} mono />
                  <FieldRow label="Total amount" value={formatAmount(data.total_amount)} mono />
                  <FieldRow label="PO number" value={data.po_number ?? "—"} mono />
                </dl>
              </Section>

              <Section title="Line items">
                {data.line_items.length > 0 ? (
                  <LineItemsTable items={data.line_items} />
                ) : (
                  <p className="mt-3 font-mono text-sm text-ink/60">No line items on file.</p>
                )}
              </Section>

              <Section title="Compliance checks">
                {data.compliance.length > 0 ? (
                  <ChecksList checks={data.compliance} />
                ) : (
                  <p className="mt-3 font-sans text-sm text-ink/60">
                    No compliance checks on record for this invoice.
                  </p>
                )}
              </Section>

              <Section title="Audit trail">
                {data.audit.length > 0 ? (
                  <AuditTrail audit={data.audit} />
                ) : (
                  <p className="mt-3 font-sans text-sm text-ink/60">
                    No audit entries for this invoice.
                  </p>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}