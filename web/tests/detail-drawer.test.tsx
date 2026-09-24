import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { DetailDrawer } from "@/components/detail-drawer";
import { getInvoiceDetailAction } from "@/lib/actions";
import { sampleAudit, sampleCompliance, sampleDetail, sampleInvoices } from "./fixtures";

vi.mock("@/lib/actions", () => ({
  getInvoiceDetailAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInvoiceDetailAction).mockResolvedValue(sampleDetail);
});

afterEach(cleanup);

describe("DetailDrawer", () => {
  it("renders the invoice's extracted fields", async () => {
    render(<DetailDrawer invoice={sampleInvoices[0]} onClose={() => {}} />);

    expect((await screen.findAllByText("Acme Office Supplies")).length).toBeGreaterThan(0);
    expect(screen.getByText("Invoice date")).toBeInTheDocument();
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("Due date")).toBeInTheDocument();
    expect(screen.getByText("2026-09-30")).toBeInTheDocument();
    expect(screen.getByText("Total amount")).toBeInTheDocument();
    expect(screen.getByText("$2,700.00")).toBeInTheDocument();
    expect(screen.getByText("PO number")).toBeInTheDocument();
    expect(screen.getByText("PO-4501")).toBeInTheDocument();
  });

  it("lists all 5 compliance checks with PASS/FAIL marks and their reasons", async () => {
    render(<DetailDrawer invoice={sampleInvoices[0]} onClose={() => {}} />);

    await screen.findByText("Compliance checks");
    for (const check of sampleCompliance) {
      expect(screen.getByText(check.check_name)).toBeInTheDocument();
      expect(screen.getByText(check.detail ?? "")).toBeInTheDocument();
    }
    const passCount = sampleCompliance.filter((c) => c.passed === 1).length;
    const failCount = sampleCompliance.filter((c) => c.passed === 0).length;
    expect(screen.getAllByText("PASS")).toHaveLength(passCount);
    expect(screen.getAllByText("FAIL")).toHaveLength(failCount);
  });

  it("lays out the audit trail in chronological order", async () => {
    render(<DetailDrawer invoice={sampleInvoices[0]} onClose={() => {}} />);

    const trail = await screen.findByText("Audit trail");
    const section = trail.closest("section");
    expect(section).not.toBeNull();

    const timestamps = within(section as HTMLElement).getAllByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(timestamps.map((el) => el.textContent)).toEqual(
      sampleAudit.map((entry) => entry.timestamp)
    );

    const actions = within(section as HTMLElement).getAllByText(
      /^extract_fields$|^run_checks$|^make_decision$/
    );
    expect(actions.map((el) => el.textContent)).toEqual([
      "extract_fields",
      "run_checks",
      "make_decision",
    ]);
  });

  it("moves focus into the drawer when it opens (accessibility)", async () => {
    render(<DetailDrawer invoice={sampleInvoices[0]} onClose={() => {}} />);
    const closeButton = screen.getByRole("button", { name: "Close" });
    await waitFor(() => expect(closeButton).toHaveFocus());
  });
});