// @vitest-environment node
//
// Tests for POST /api/process-invoice and its backing pipeline. The only thing
// mocked is the agent-calling layer (openai responses.create + Azure token);
// everything else — JSON parsing, schema writes to erp.db, SSE framing — runs
// for real against a throwaway temp database. No real LLM output is involved.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { processInvoice } from "@/lib/pipeline";
import { POST } from "@/app/api/process-invoice/route";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => {
  class MockOpenAI {
    responses = { create: mockCreate };
  }
  return { default: MockOpenAI };
});

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {
    async getToken() {
      return { token: "test-token" };
    }
  },
}));

const dbPath = process.env.COMPLYFLOW_DB_PATH as string;
const schemaSql = fs.readFileSync(
  path.resolve(process.cwd(), "..", "db", "schema.sql"),
  "utf8"
);

function openDb(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = OFF");
  return db;
}

function resetDb(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    } catch {
      // ignore
    }
  }
  const db = openDb();
  db.exec(schemaSql);
  db.close();
}

// --- Fixed, deterministic sample agent replies (shapes from agents.md) --------

const EXTRACTION = {
  vendor_name: "Acme Office Supplies",
  vendor_id: "V-001",
  invoice_date: "2026-09-01",
  due_date: "2026-09-30",
  total_amount: 2700.0,
  po_number: "PO-4501",
  totals_match: true,
  line_items: [
    { description: "Office chairs x10", quantity: 10, unit_price: 120.0, total: 1200.0 },
    { description: "Standing desks x5", quantity: 5, unit_price: 300.0, total: 1500.0 },
  ],
};

// duplicate_check has `passed: null` on purpose — toChecks must store 0.
const COMPLIANCE = [
  { check_name: "vendor_approved", passed: true, detail: "Vendor is on the approved master list." },
  { check_name: "budget_limit", passed: true, detail: "2700.00 is within the 5000.00 budget." },
  { check_name: "duplicate_check", passed: null, detail: "No matching prior invoice." },
  { check_name: "totals_match", passed: true, detail: "Line items total matches the invoice total." },
  { check_name: "po_present", passed: true, detail: "PO number is present." },
];

const APPROVAL = { decision: "auto_approved", reason: "All compliance checks passed." };

function mockAgentReplies(
  extraction: unknown,
  compliance: unknown,
  approval: unknown
): void {
  mockCreate
    .mockResolvedValueOnce({ output_text: JSON.stringify(extraction) })
    .mockResolvedValueOnce({ output_text: JSON.stringify(compliance) })
    .mockResolvedValueOnce({ output_text: JSON.stringify(approval) });
}

// Same as mockAgentReplies but with the agent output supplied verbatim, so tests
// can exercise fence / whitespace handling on the raw reply text.
function mockAgentRawText(
  extraction: string,
  compliance: string,
  approval: string
): void {
  mockCreate
    .mockResolvedValueOnce({ output_text: extraction })
    .mockResolvedValueOnce({ output_text: compliance })
    .mockResolvedValueOnce({ output_text: approval });
}

function postRequest(rawText: string): Request {
  return new Request("http://localhost/api/process-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });
}

beforeEach(() => {
  resetDb();
  mockCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  mockCreate.mockReset();
});

describe("processInvoice", () => {
  it("writes the correct rows to erp.db for fixed mock agent responses", async () => {
    mockAgentReplies(EXTRACTION, COMPLIANCE, APPROVAL);

    const result = await processInvoice("INVOICE\nAcme Office Supplies\nTotal: $2700.00");

    expect(result.invoice.vendor_name).toBe("Acme Office Supplies");
    expect(result.invoice.vendor_id).toBe("V-001");
    expect(result.invoice.total_amount).toBe(2700.0);
    expect(result.invoice.status).toBe("auto_approved");
    expect(result.invoice.po_number).toBe("PO-4501");
    expect(result.compliance).toHaveLength(5);
    expect(result.decision).toEqual(APPROVAL);
    expect(result.audit.map((a) => a.agent_name)).toEqual([
      "extraction",
      "compliance",
      "approval",
    ]);

    const db = openDb();
    try {
      const invoice = db
        .prepare("SELECT * FROM invoices WHERE invoice_id = ?")
        .get(result.invoice.invoice_id) as Record<string, unknown>;
      expect(invoice.vendor_name).toBe("Acme Office Supplies");
      expect(invoice.total_amount).toBe(2700.0);
      expect(invoice.status).toBe("auto_approved");

      const checks = db
        .prepare(
          "SELECT check_name, passed, detail FROM compliance_results WHERE invoice_id = ? ORDER BY id"
        )
        .all(result.invoice.invoice_id) as { check_name: string; passed: number; detail: string }[];
      expect(checks).toHaveLength(5);
      expect(checks.map((c) => c.check_name)).toEqual([
        "vendor_approved",
        "budget_limit",
        "duplicate_check",
        "totals_match",
        "po_present",
      ]);

      const decision = db
        .prepare("SELECT decision, reason FROM decisions WHERE invoice_id = ?")
        .get(result.invoice.invoice_id) as { decision: string; reason: string };
      expect(decision).toEqual({ decision: "auto_approved", reason: "All compliance checks passed." });

      const audit = db
        .prepare("SELECT agent_name, action FROM agent_audit_log WHERE invoice_id = ? ORDER BY id")
        .all(result.invoice.invoice_id) as { agent_name: string; action: string }[];
      expect(audit.map((a) => `${a.agent_name}:${a.action}`)).toEqual([
        "extraction:extract_fields",
        "compliance:run_checks",
        "approval:make_decision",
      ]);

      const lineItems = db
        .prepare("SELECT description, total FROM invoice_line_items WHERE invoice_id = ? ORDER BY id")
        .all(result.invoice.invoice_id) as { description: string; total: number }[];
      expect(lineItems.map((i) => i.description)).toEqual([
        "Office chairs x10",
        "Standing desks x5",
      ]);
    } finally {
      db.close();
    }
  });

  it("stores a compliance check with passed: null as 0", async () => {
    mockAgentReplies(EXTRACTION, COMPLIANCE, APPROVAL);
    const result = await processInvoice("INVOICE\nAcme Office Supplies\nTotal: $2700.00");

    const db = openDb();
    try {
      const duplicate = db
        .prepare(
          "SELECT passed FROM compliance_results WHERE invoice_id = ? AND check_name = 'duplicate_check'"
        )
        .get(result.invoice.invoice_id) as { passed: number };
      expect(duplicate.passed).toBe(0);
    } finally {
      db.close();
    }
  });

  it("only feeds auto-approved / flagged invoices to the compliance prompt's already_processed list", async () => {
    const db = openDb();
    try {
      const insert = db.prepare(
        `INSERT INTO invoices (invoice_id, vendor_id, vendor_name, invoice_date, due_date,
           total_amount, po_number, status)
         VALUES (?, ?, ?, '2026-01-01', '2026-01-31', 100.0, 'PO-00', ?)`
      );
      insert.run("INV-W1", "V-001", "Acme Office Supplies", "auto_approved");
      insert.run("INV-W2", "V-002", "CloudNet Hosting", "flagged_for_review");
      insert.run("INV-W3", "V-001", "Acme Office Supplies", "rejected");
      insert.run("INV-W4", "V-002", "CloudNet Hosting", "received");

      const insertDecision = db.prepare(
        "INSERT INTO decisions (invoice_id, decision, reason) VALUES (?, ?, ?)"
      );
      insertDecision.run("INV-W1", "auto_approved", "clean");
      insertDecision.run("INV-W2", "flagged_for_review", "missing PO");
      insertDecision.run("INV-W3", "rejected", "duplicate");
    } finally {
      db.close();
    }

    mockAgentReplies(EXTRACTION, COMPLIANCE, APPROVAL);
    await processInvoice("INVOICE\nAcme Office Supplies\nTotal: $2700.00");

    // The compliance call is the second responses.create call.
    const complianceInput = JSON.parse(mockCreate.mock.calls[1][0].input as string) as {
      already_processed_invoices: { invoice_id: string }[];
    };
    expect(complianceInput.already_processed_invoices.map((r) => r.invoice_id)).toEqual([
      "INV-W1",
      "INV-W2",
    ]);
  });

  it("parses fenced JSON from agents, matching the Python ask_agent fence handling", async () => {
    mockAgentRawText(
      `\`\`\`json\n${JSON.stringify(EXTRACTION)}\n\`\`\``,
      JSON.stringify(COMPLIANCE),
      JSON.stringify(APPROVAL)
    );
    const result = await processInvoice("INVOICE\nAcme Office Supplies\nTotal: $2700.00");
    expect(result.invoice.vendor_name).toBe("Acme Office Supplies");
  });

  it("rejects and rolls back its writes when the agent returns malformed JSON", async () => {
    mockCreate
      .mockResolvedValueOnce({ output_text: JSON.stringify(EXTRACTION) })
      .mockResolvedValueOnce({ output_text: "not json {" });

    await expect(processInvoice("INVOICE\nAcme Office Supplies\nTotal: $2700.00")).rejects.toThrow(
      "did not return valid JSON"
    );

    const db = openDb();
    try {
      const count = db.prepare("SELECT COUNT(*) AS c FROM invoices").get() as { c: number };
      expect(count.c).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe("POST /api/process-invoice", () => {
  it("emits a plain 400 for a non-JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/process-invoice", {
        method: "POST",
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The request body was not valid JSON." });
  });

  it("emits a plain 400 when no invoice text is provided", async () => {
    const res = await POST(postRequest("   "));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No invoice text was provided." });
  });

  it("streams a done event and persists the pipeline result on success", async () => {
    mockAgentReplies(EXTRACTION, COMPLIANCE, APPROVAL);

    const res = await POST(postRequest("INVOICE\nAcme Office Supplies\nTotal: $2700.00"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain("event: stage");
    expect(text).toContain("event: done");

    const doneChunk = text.split("event: done\ndata: ")[1].split("\n\n")[0];
    const done = JSON.parse(doneChunk) as { result: { invoice: { invoice_id: string; status: string } } };
    expect(done.result.invoice.status).toBe("auto_approved");
    expect(done.result.invoice.invoice_id).toMatch(/^INV-/);

    // Rows survived the round trip in the shared temp database.
    const db = openDb();
    try {
      const count = db
        .prepare("SELECT COUNT(*) AS c FROM decisions WHERE invoice_id = ?")
        .get(done.result.invoice.invoice_id) as { c: number };
      expect(count.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it("handles malformed agent JSON without crashing and streams a plain error event", async () => {
    mockCreate.mockResolvedValue({ output_text: "this is not json" });

    const res = await POST(postRequest("INVOICE\nAcme Office Supplies\nTotal: $2700.00"));
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain("event: error");

    const errorChunk = text.split("event: error\ndata: ")[1].split("\n\n")[0];
    const message = (JSON.parse(errorChunk) as { message: string }).message;
    expect(message).toMatch(/did not return valid JSON/);
    // Principle (design.md): errors are written plainly, not a generic "Oops".
    expect(message).not.toContain("Something went wrong");
  });

  it("does not leave partial rows behind when an agent fails mid-pipeline", async () => {
    // Extraction succeeds (invoice row + audit written), compliance fails.
    mockCreate
      .mockResolvedValueOnce({ output_text: JSON.stringify(EXTRACTION) })
      .mockResolvedValueOnce({ output_text: "{ broken json" });

    const res = await POST(postRequest("INVOICE\nAcme Office Supplies\nTotal: $2700.00"));
    const text = await res.text();
    expect(text).toContain("event: error");

    const db = openDb();
    try {
      const tableCounts = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM invoices) AS invoices,
            (SELECT COUNT(*) FROM compliance_results) AS compliance,
            (SELECT COUNT(*) FROM decisions) AS decisions,
            (SELECT COUNT(*) FROM agent_audit_log) AS audit`
        )
        .get() as { invoices: number; compliance: number; decisions: number; audit: number };
      expect(tableCounts).toEqual({ invoices: 0, compliance: 0, decisions: 0, audit: 0 });
    } finally {
      db.close();
    }
  });
});