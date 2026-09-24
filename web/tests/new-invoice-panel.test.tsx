import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ProcessResult } from "@/lib/db";
import { LedgerView } from "@/components/ledger-view";
import { getInvoiceDetailAction } from "@/lib/actions";
import { sampleAudit, sampleCompliance, sampleDetail, sampleInvoices } from "./fixtures";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/actions", () => ({
  getInvoiceDetailAction: vi.fn(),
}));

const newInvoice: ProcessResult = {
  invoice: {
    invoice_id: "INV-9001",
    vendor_id: "V-014",
    vendor_name: "Metro Print & Design",
    invoice_date: "2026-09-24",
    due_date: "2026-10-24",
    total_amount: 640.0,
    po_number: "PO-9001",
    status: "auto_approved",
    decision: "auto_approved",
    decision_reason: "All compliance checks passed.",
  },
  compliance: sampleCompliance,
  decision: { decision: "auto_approved", reason: "All compliance checks passed." },
  audit: sampleAudit,
};

function sseResponse(payload: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}`;
}

// The pipeline streams stage events first, then a done event on a later read.
function stagedDone(result: ProcessResult): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`${sseEvent("stage", { label: "Extracting fields..." })}\n\n`)
      );
      setTimeout(() => {
        controller.enqueue(
          encoder.encode(`${sseEvent("done", { result })}\n\n`)
        );
        controller.close();
      }, 100);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function openPanelAndSubmit(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "New invoice" }));
  fireEvent.change(screen.getByLabelText("Raw invoice text"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit invoice" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInvoiceDetailAction).mockResolvedValue(sampleDetail);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Submit invoice flow", () => {
  it("renders the form and streams stage text while processing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stagedDone(newInvoice)));
    render(<LedgerView invoices={[sampleInvoices[0]]} />);

    openPanelAndSubmit("METRO PRINT & DESIGN\nTotal: $640.00");

    expect(await screen.findByRole("status")).toHaveTextContent("Extracting fields...");
  });

  it("appends the new invoice to the table and opens its drawer on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stagedDone(newInvoice)));
    render(<LedgerView invoices={[sampleInvoices[0]]} />);

    openPanelAndSubmit("METRO PRINT & DESIGN\nTotal: $640.00");

    // The new row lands in the ledger, and the same invoice appears in the
    // drawer that opened for it.
    expect((await screen.findAllByText("INV-9001")).length).toBeGreaterThan(0);
    expect(screen.getByText("$640.00")).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByText("INV-9001").length).toBeGreaterThan(0);
  });

  it("disables the submit button while the request is in flight and re-enables it after", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    render(<LedgerView invoices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "New invoice" }));
    const submit = screen.getByRole("button", { name: "Submit invoice" });
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Raw invoice text"), {
      target: { value: "INVOICE\nAcme Office Supplies\nTotal: $2700.00" },
    });
    fireEvent.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());

    resolveFetch(
      sseResponse(`${sseEvent("error", { message: "The duplicate invoice was already rejected." })}\n\n`)
    );

    await waitFor(() => expect(submit).toBeEnabled());
  });

  it("shows the endpoint's plain error message on an error event (not a generic 'Oops')", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(`${sseEvent("error", { message: "The duplicate invoice was already rejected." })}\n\n`)
      )
    );
    render(<LedgerView invoices={[sampleInvoices[0]]} />);

    openPanelAndSubmit("INVOICE\nAcme Office Supplies\nTotal: $2700.00");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The duplicate invoice was already rejected.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Raw invoice text")).toBeInTheDocument();
  });

  it("surfaces a plain error on a 400 response from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "No invoice text was provided." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    render(<LedgerView invoices={[]} />);

    openPanelAndSubmit("INVOICE\nAcme Office Supplies\nTotal: $2700.00");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No invoice text was provided.");
  });

  it("uses a plain fallback for a 500 response with an unparseable body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 }))
    );
    render(<LedgerView invoices={[]} />);

    openPanelAndSubmit("INVOICE\nAcme\nTotal: $1.00");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The invoice endpoint did not accept the request (HTTP 500).");
  });

  it("shows a plain message when the pipeline is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    render(<LedgerView invoices={[]} />);

    openPanelAndSubmit("INVOICE\nAcme\nTotal: $1.00");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Could not reach the invoice pipeline. Check that the dev server is running."
    );
  });
});