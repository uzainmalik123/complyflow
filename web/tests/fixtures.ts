// Fixed, deterministic sample data for component tests (shapes mirror the
// LedgerRow / InvoiceDetail types in web/lib/db.ts).
import type {
  AuditEntry,
  ComplianceCheck,
  InvoiceDetail,
  LedgerRow,
  LineItem,
} from "@/lib/db";

export const sampleInvoices: LedgerRow[] = [
  {
    invoice_id: "INV-1001",
    vendor_id: "V-001",
    vendor_name: "Acme Office Supplies",
    invoice_date: "2026-09-01",
    due_date: "2026-09-30",
    total_amount: 2700.0,
    po_number: "PO-4501",
    status: "auto_approved",
    decision: "auto_approved",
    decision_reason: "All compliance checks passed.",
  },
  {
    invoice_id: "INV-1002",
    vendor_id: "V-002",
    vendor_name: "CloudNet Hosting",
    invoice_date: "2026-09-03",
    due_date: "2026-09-17",
    total_amount: 8500.0,
    po_number: null,
    status: "flagged_for_review",
    decision: "flagged_for_review",
    decision_reason: "Invoice is missing a PO number.",
  },
  {
    invoice_id: "INV-1003",
    vendor_id: "V-001",
    vendor_name: "Acme Office Supplies",
    invoice_date: "2026-09-01",
    due_date: "2026-09-30",
    total_amount: 2700.0,
    po_number: "PO-4501",
    status: "rejected",
    decision: "rejected",
    decision_reason: "Duplicate of INV-1001.",
  },
];

export const sampleLineItems: LineItem[] = [
  { description: "Office chairs x10", quantity: 10, unit_price: 120.0, total: 1200.0 },
  { description: "Standing desks x5", quantity: 5, unit_price: 300.0, total: 1500.0 },
];

export const sampleCompliance: ComplianceCheck[] = [
  { check_name: "vendor_approved", passed: 1, detail: "Vendor is on the approved master list." },
  { check_name: "budget_limit", passed: 1, detail: "2700.00 is within the 5000.00 budget." },
  { check_name: "duplicate_check", passed: 1, detail: "No matching prior invoice." },
  { check_name: "totals_match", passed: 1, detail: "Line items total matches the invoice total." },
  { check_name: "po_present", passed: 0, detail: "Invoice is missing a PO number." },
];

export const sampleAudit: AuditEntry[] = [
  { agent_name: "extraction", action: "extract_fields", timestamp: "2026-09-24 10:00:00" },
  { agent_name: "compliance", action: "run_checks", timestamp: "2026-09-24 10:00:01" },
  { agent_name: "approval", action: "make_decision", timestamp: "2026-09-24 10:00:02" },
];

export const sampleDetail: InvoiceDetail = {
  ...sampleInvoices[0],
  line_items: sampleLineItems,
  compliance: sampleCompliance,
  audit: sampleAudit,
};