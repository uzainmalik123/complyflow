import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import OpenAI from "openai";
import { DefaultAzureCredential } from "@azure/identity";
import {
  DB_PATH,
  type AuditEntry,
  type ComplianceCheck,
  type LedgerRow,
  type LineItem,
  type ProcessResult,
} from "@/lib/db";

const TOKEN_SCOPE = "https://ai.azure.com/.default";

function loadRootEnv(): void {
  if (process.env.FOUNDRY_PROJECT_ENDPOINT) return;
  const envFile = path.resolve(process.cwd(), "..", ".env");
  if (!fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

let endpoint: string | null = null;

function foundryEndpoint(): string {
  if (endpoint) return endpoint;
  loadRootEnv();
  const raw = process.env.FOUNDRY_PROJECT_ENDPOINT;
  if (!raw) {
    throw new Error(
      "FOUNDRY_PROJECT_ENDPOINT is not set. Copy the project .env from .env.example and fill it in."
    );
  }
  endpoint = raw.replace(/\/+$/, "");
  return endpoint;
}

async function acquireToken(): Promise<string> {
  const token = await new DefaultAzureCredential().getToken(TOKEN_SCOPE);
  if (!token) {
    throw new Error("Azure authentication returned no token for the Foundry project.");
  }
  return token.token;
}

function openAiClient(agentName: string, token: string): OpenAI {
  return new OpenAI({
    baseURL: `${foundryEndpoint()}/agents/${agentName}/endpoint/protocols/openai`,
    apiKey: token,
    defaultQuery: { "api-version": "v1" },
  });
}

function stripFences(text: string): string {
  return text.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
}

async function askAgent(agent: OpenAI, input: string, label: string): Promise<unknown> {
  const response = await agent.responses.create({ input });
  const reply = (response.output_text ?? "").trim();
  if (!reply) {
    throw new Error(`Agent '${label}' returned an empty reply.`);
  }
  try {
    return JSON.parse(stripFences(reply));
  } catch {
    throw new Error(`Agent '${label}' did not return valid JSON.`);
  }
}

function openWriter(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = OFF");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL,
      description TEXT,
      quantity REAL,
      unit_price REAL,
      total REAL
    )
  `);
  return db;
}

function sqlTimestamp(base: Date, index: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(
    base.getDate()
  )} ${pad(base.getHours())}:${pad(base.getMinutes())}:${pad(base.getSeconds())}`;
  return index === 0 ? stamp : `${stamp}.${String(index).padStart(3, "0")}`;
}

function summarize(value: unknown): string {
  return String(value ?? "").slice(0, 300);
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toRecord(raw: unknown, label: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`The ${label} agent did not return a JSON object.`);
  }
  return raw as Record<string, unknown>;
}

function toChecks(raw: unknown): ComplianceCheck[] {
  if (!Array.isArray(raw)) {
    throw new Error("The compliance agent did not return a list of checks.");
  }
  return raw.map((item) => {
    const obj = (typeof item === "object" && item !== null ? item : {}) as Record<
      string,
      unknown
    >;
    return {
      check_name: asString(obj.check_name) ?? "unknown",
      passed: obj.passed ? 1 : 0,
      detail: asString(obj.detail) ?? "",
    };
  });
}

function isDecision(
  value: string
): value is "auto_approved" | "flagged_for_review" | "rejected" {
  return (
    value === "auto_approved" ||
    value === "flagged_for_review" ||
    value === "rejected"
  );
}

function toDecision(raw: unknown): { decision: string; reason: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("The approval agent did not return a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  const decision = asString(obj.decision);
  const reason = asString(obj.reason) ?? "";
  if (!decision || !isDecision(decision)) {
    throw new Error(`The approval agent returned an invalid decision ('${decision}').`);
  }
  if (!reason) {
    throw new Error("The approval agent returned no reason for its decision.");
  }
  return { decision, reason };
}

function lineItemsFrom(extracted: Record<string, unknown>): LineItem[] {
  if (!Array.isArray(extracted.line_items)) return [];
  return extracted.line_items
    .map((raw) => {
      const item = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
        string,
        unknown
      >;
      const total = asNumber(item.total) ?? 0;
      let quantity = asNumber(item.quantity) ?? 0;
      let unitPrice = asNumber(item.unit_price) ?? 0;
      if (quantity === 0 && unitPrice === 0 && total > 0) {
        quantity = 1;
        unitPrice = total;
      }
      return {
        description: asString(item.description) ?? "",
        quantity,
        unit_price: unitPrice,
        total,
      };
    })
    .filter((item) => item.description !== "" || item.total !== 0);
}

const TOTALS_CHECK = "totals_match";

// Money is compared in integer cents so float noise (500 * 1.2 = 600.0000000000001)
// can't hide or invent a one-cent difference.
function cents(value: number): number {
  return Math.round(value * 100);
}

function dollars(valueInCents: number): string {
  return (valueInCents / 100).toFixed(2);
}

// Deterministic replacement for the model's totals_match judgement: each line's
// quantity x unit_price must equal its total, and the line totals must sum to the
// invoice total, to the cent. The model only reads the numbers off the invoice.
export function checkTotals(extracted: Record<string, unknown>): ComplianceCheck {
  const result = (passed: boolean, detail: string): ComplianceCheck => ({
    check_name: TOTALS_CHECK,
    passed: passed ? 1 : 0,
    detail,
  });
  const items = Array.isArray(extracted.line_items) ? extracted.line_items : [];
  if (items.length === 0) {
    return result(false, "No line items were extracted, so the total could not be verified.");
  }
  const invoiceTotal = asNumber(extracted.total_amount);
  if (invoiceTotal === null) {
    return result(false, "No invoice total was extracted, so it could not be verified.");
  }

  const problems: string[] = [];
  let sum = 0;
  items.forEach((raw, index) => {
    const item = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const label = asString(item.description) ?? `Line ${index + 1}`;
    const total = asNumber(item.total);
    if (total === null) {
      problems.push(`${label} has no line total`);
      return;
    }
    sum += cents(total);
    const quantity = asNumber(item.quantity);
    const unitPrice = asNumber(item.unit_price);
    if (quantity !== null && unitPrice !== null && cents(quantity * unitPrice) !== cents(total)) {
      problems.push(
        `${label}: ${quantity} x ${unitPrice} = ${dollars(cents(quantity * unitPrice))}, but the line total is ${dollars(cents(total))}`
      );
    }
  });

  const expected = cents(invoiceTotal);
  if (sum !== expected) {
    problems.push(
      `Line items sum to ${dollars(sum)}, but the invoice total is ${dollars(expected)} (off by ${dollars(Math.abs(sum - expected))})`
    );
  }

  if (problems.length > 0) return result(false, `${problems.join("; ")}.`);
  return result(true, `Line items sum to ${dollars(sum)}, matching the invoice total to the cent.`);
}

// The model's own totals_match verdict is discarded in favour of checkTotals.
function withTotalsCheck(checks: ComplianceCheck[], totals: ComplianceCheck): ComplianceCheck[] {
  const index = checks.findIndex((check) => check.check_name === TOTALS_CHECK);
  const others = checks.filter((check) => check.check_name !== TOTALS_CHECK);
  others.splice(index === -1 ? others.length : index, 0, totals);
  return others;
}

export function plainMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return message;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Something went wrong while processing the invoice.";
}

export async function processInvoice(
  rawText: string,
  onStage?: (label: string) => void
): Promise<ProcessResult> {
  const token = await acquireToken();
  const extraction = openAiClient("extraction-agent", token);
  const compliance = openAiClient("compliance-agent", token);
  const approval = openAiClient("approval-agent", token);

  const db = openWriter();
  const invoiceId = `INV-${Date.now()}`;
  const started = new Date();
  const audit: AuditEntry[] = [];

  try {
    onStage?.("Extracting fields...");
    const extracted = toRecord(await askAgent(extraction, rawText, "extraction"), "extraction");

    const vendorName = asString(extracted.vendor_name) ?? "Unknown vendor";
    const matchedVendor = db
      .prepare("SELECT vendor_id FROM vendors WHERE LOWER(vendor_name) = LOWER(?)")
      .pluck()
      .get(vendorName) as string | undefined;
    const vendorId = asString(extracted.vendor_id) ?? matchedVendor ?? "V-000";
    const invoiceDate = asString(extracted.invoice_date);
    const dueDate = asString(extracted.due_date);
    const poNumber = asString(extracted.po_number);

    const lineItems = lineItemsFrom(extracted);
    const total =
      asNumber(extracted.total_amount) ??
      (lineItems.length > 0
        ? lineItems.reduce((sum, item) => sum + item.total, 0)
        : null);
    if (lineItems.length === 0 && total !== null) {
      lineItems.push({ description: "Invoice total", quantity: 1, unit_price: total, total });
    }

    const insertInvoice = db.prepare(
      `INSERT INTO invoices
         (invoice_id, vendor_id, vendor_name, invoice_date, due_date, total_amount, po_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'received')`
    );
    const updateStatus = db.prepare(
      `UPDATE invoices SET status = ? WHERE invoice_id = ?`
    );
    const insertLineItem = db.prepare(
      `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total)
       VALUES (?, ?, ?, ?, ?)`
    );
    const insertCheck = db.prepare(
      `INSERT INTO compliance_results (invoice_id, check_name, passed, detail)
       VALUES (?, ?, ?, ?)`
    );
    const insertAudit = db.prepare(
      `INSERT INTO agent_audit_log
         (invoice_id, agent_name, action, input_summary, output_summary, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const addAudit = (
      agentName: string,
      action: string,
      input: unknown,
      output: unknown,
      index: number
    ): AuditEntry => {
      const timestamp = sqlTimestamp(started, index);
      insertAudit.run(
        invoiceId,
        agentName,
        action,
        summarize(input),
        summarize(output),
        timestamp
      );
      return { agent_name: agentName, action, timestamp };
    };

    insertInvoice.run(
      invoiceId,
      vendorId,
      vendorName,
      invoiceDate,
      dueDate,
      total,
      poNumber
    );
    updateStatus.run("extracted", invoiceId);
    audit.push(addAudit("extraction", "extract_fields", rawText, extracted, 0));
    for (const item of lineItems) {
      insertLineItem.run(invoiceId, item.description, item.quantity, item.unit_price, item.total);
    }

    const compliancePayload = {
      invoice: extracted,
      vendor_master_list: db
        .prepare(
          "SELECT vendor_id, vendor_name, is_approved, budget_limit FROM vendors ORDER BY vendor_id"
        )
        .all(),
      already_processed_invoices: db
        .prepare(
          `SELECT invoice_id, vendor_id, vendor_name, total_amount, po_number
           FROM invoices
           WHERE status = 'auto_approved' OR status = 'flagged_for_review'
           ORDER BY invoice_id`
        )
        .all(),
    };

    onStage?.("Running compliance checks...");
    const complianceResults = withTotalsCheck(
      toChecks(await askAgent(compliance, JSON.stringify(compliancePayload), "compliance")),
      checkTotals(extracted)
    );
    const writeChecks = db.transaction((checks: ComplianceCheck[]) => {
      for (const check of checks) {
        insertCheck.run(invoiceId, check.check_name, check.passed, check.detail ?? "");
      }
    });
    writeChecks(complianceResults);
    updateStatus.run("compliance_checked", invoiceId);
    audit.push(addAudit("compliance", "run_checks", compliancePayload, complianceResults, 1));

    const approvalPayload = {
      invoice_id: invoiceId,
      compliance_results: complianceResults,
    };
    onStage?.("Deciding...");
    const decision = toDecision(
      await askAgent(approval, JSON.stringify(approvalPayload), "approval")
    );

    db.prepare(
      `INSERT INTO decisions (invoice_id, decision, reason) VALUES (?, ?, ?)`
    ).run(invoiceId, decision.decision, decision.reason);
    updateStatus.run(decision.decision, invoiceId);
    audit.push(addAudit("approval", "make_decision", approvalPayload, decision, 2));

    const invoice: LedgerRow = {
      invoice_id: invoiceId,
      vendor_id: vendorId,
      vendor_name: vendorName,
      invoice_date: invoiceDate,
      due_date: dueDate,
      total_amount: total,
      po_number: poNumber,
      status: decision.decision,
      decision: decision.decision,
      decision_reason: decision.reason,
    };

    return { invoice, compliance: complianceResults, decision, audit };
  } catch (reason) {
    const removeRows = db.transaction(() => {
      for (const table of [
        "invoice_line_items",
        "compliance_results",
        "decisions",
        "agent_audit_log",
        "invoices",
      ]) {
        db.prepare(`DELETE FROM ${table} WHERE invoice_id = ?`).run(invoiceId);
      }
    });
    removeRows();
    throw new Error(plainMessage(reason));
  } finally {
    db.close();
  }
}