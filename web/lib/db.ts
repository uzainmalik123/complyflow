import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface LedgerRow {
  invoice_id: string;
  vendor_id: string;
  vendor_name: string;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  po_number: string | null;
  status: string;
  decision: string | null;
  decision_reason: string | null;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface ComplianceCheck {
  check_name: string;
  passed: number;
  detail: string | null;
}

export interface AuditEntry {
  agent_name: string;
  action: string;
  timestamp: string;
}

export interface InvoiceDetail extends LedgerRow {
  line_items: LineItem[];
  compliance: ComplianceCheck[];
  audit: AuditEntry[];
}

export interface ProcessResult {
  invoice: LedgerRow;
  compliance: ComplianceCheck[];
  decision: { decision: string; reason: string };
  audit: AuditEntry[];
}

export const DB_PATH =
  process.env.COMPLYFLOW_DB_PATH ??
  path.resolve(process.cwd(), "..", "db", "erp.db");

const MOCK_DATA_PATH =
  process.env.COMPLYFLOW_MOCK_DATA_PATH ??
  path.resolve(process.cwd(), "..", "data", "mock_invoices.json");

const INVOICE_SELECT = `
  SELECT
    i.invoice_id,
    i.vendor_id,
    i.vendor_name,
    i.invoice_date,
    i.due_date,
    i.total_amount,
    i.po_number,
    i.status,
    d.decision,
    d.reason AS decision_reason
  FROM invoices i
  LEFT JOIN decisions d ON d.id = (
    SELECT id FROM decisions
    WHERE invoice_id = i.invoice_id
    ORDER BY decided_at DESC, id DESC
    LIMIT 1
  )
`;

let _db: Database.Database | null = null;
let _lineItems: Map<string, LineItem[]> | undefined;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

function getLineItemMap(): Map<string, LineItem[]> {
  if (_lineItems !== undefined) return _lineItems;
  _lineItems = new Map();
  const raw = JSON.parse(
    fs.readFileSync(MOCK_DATA_PATH, "utf8")
  ) as { invoice_id: string; line_items: LineItem[] }[];
  for (const inv of raw) {
    _lineItems.set(inv.invoice_id, inv.line_items ?? []);
  }
  return _lineItems;
}

export function getLedger(): LedgerRow[] {
  return getDb()
    .prepare(`${INVOICE_SELECT} ORDER BY i.invoice_id ASC`)
    .all() as LedgerRow[];
}

export function getInvoiceDetail(invoiceId: string): InvoiceDetail | null {
  const row = getDb()
    .prepare(`${INVOICE_SELECT} WHERE i.invoice_id = ?`)
    .get(invoiceId) as LedgerRow | undefined;

  if (!row) return null;

  const compliance = getDb()
    .prepare(
      `SELECT check_name, passed, detail
       FROM compliance_results
       WHERE invoice_id = ?
       ORDER BY id ASC`
    )
    .all(invoiceId) as ComplianceCheck[];

  const audit = getDb()
    .prepare(
      `SELECT agent_name, action, timestamp
       FROM agent_audit_log
       WHERE invoice_id = ?
       ORDER BY timestamp ASC, id ASC`
    )
    .all(invoiceId) as AuditEntry[];

  let storedLineItems: LineItem[] = [];
  try {
    storedLineItems = getDb()
      .prepare(
        `SELECT description, quantity, unit_price, total
         FROM invoice_line_items
         WHERE invoice_id = ?
         ORDER BY id ASC`
      )
      .all(invoiceId) as LineItem[];
  } catch {
    storedLineItems = [];
  }

  return {
    ...row,
    line_items:
      storedLineItems.length > 0
        ? storedLineItems
        : (getLineItemMap().get(invoiceId) ?? []),
    compliance,
    audit,
  };
}