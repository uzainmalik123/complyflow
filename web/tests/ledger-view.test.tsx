import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LedgerView } from "@/components/ledger-view";
import { StatusStamp } from "@/components/status-stamp";
import { getInvoiceDetailAction } from "@/lib/actions";
import { sampleDetail, sampleInvoices } from "./fixtures";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/actions", () => ({
  getInvoiceDetailAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInvoiceDetailAction).mockResolvedValue(sampleDetail);
});

afterEach(cleanup);

describe("LedgerView", () => {
  it("renders every invoice passed to it", () => {
    render(<LedgerView invoices={sampleInvoices} />);
    for (const inv of sampleInvoices) {
      expect(screen.getByText(inv.invoice_id)).toBeInTheDocument();
      expect(screen.getAllByText(inv.vendor_name).length).toBeGreaterThan(0);
    }
  });

  it("renders an empty-state message (plain voice, no generic 'Oops') when there are no invoices", () => {
    render(<LedgerView invoices={[]} />);
    expect(screen.getByText("No invoices in this view yet.")).toBeInTheDocument();
  });

  it("formats amounts right-aligned in monospace as USD currency", () => {
    render(<LedgerView invoices={sampleInvoices} />);
    for (const amount of screen.getAllByText("$2,700.00")) {
      const cell = amount.closest("td");
      expect(cell).toHaveClass("text-right");
      expect(cell).toHaveClass("font-mono");
    }
    expect(screen.getByText("$8,500.00")).toBeInTheDocument();
  });

  it.each([
    ["auto_approved", "APPRV", "text-stamp-green", "border-stamp-green"],
    ["flagged_for_review", "FLAG", "text-stamp-amber", "border-stamp-amber"],
    ["rejected", "REJCT", "text-stamp-red", "border-stamp-red"],
  ])(
    "stamps decision %s as %s with the design.md token colors in the table",
    (_decision, label, textToken, borderToken) => {
      render(<LedgerView invoices={sampleInvoices} />);
      const stamp = screen.getByText(label);
      expect(stamp).toHaveClass(textToken);
      expect(stamp).toHaveClass(borderToken);
    }
  );

  describe("status filters", () => {
    it("filters to flagged invoices only", () => {
      render(<LedgerView invoices={sampleInvoices} />);
      fireEvent.click(screen.getByRole("button", { name: "Flagged" }));
      expect(screen.getByText("INV-1002")).toBeInTheDocument();
      expect(screen.queryByText("INV-1001")).not.toBeInTheDocument();
      expect(screen.queryByText("INV-1003")).not.toBeInTheDocument();
    });

    it("filters to rejected invoices only", () => {
      render(<LedgerView invoices={sampleInvoices} />);
      fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
      expect(screen.getByText("INV-1003")).toBeInTheDocument();
      expect(screen.queryByText("INV-1001")).not.toBeInTheDocument();
    });

    it("compact 'Registry' shows only auto-approved invoices", () => {
      render(<LedgerView invoices={sampleInvoices} />);
      fireEvent.click(screen.getByRole("button", { name: "Registry" }));
      expect(screen.getByText("INV-1001")).toBeInTheDocument();
      expect(screen.queryByText("INV-1002")).not.toBeInTheDocument();
    });

    it("resets back to every row on 'All'", () => {
      render(<LedgerView invoices={sampleInvoices} />);
      fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
      fireEvent.click(screen.getByRole("button", { name: "All" }));
      for (const inv of sampleInvoices) {
        expect(screen.getByText(inv.invoice_id)).toBeInTheDocument();
      }
    });
  });

  describe("detail drawer interaction", () => {
    it("opens the drawer when a row is clicked and closes on the close action", async () => {
      render(<LedgerView invoices={sampleInvoices} />);
      fireEvent.click(screen.getByRole("button", { name: /INV-1001/ }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
    });
  });
});

describe("StatusStamp", () => {
  it.each([
    ["auto_approved", "APPRV", "text-stamp-green", "border-stamp-green"],
    ["flagged_for_review", "FLAG", "text-stamp-amber", "border-stamp-amber"],
    ["rejected", "REJCT", "text-stamp-red", "border-stamp-red"],
  ])(
    "maps decision %s to the %s stamp with the design.md stamp-* token colors",
    (decision, label, textToken, borderToken) => {
      const { container } = render(<StatusStamp decision={decision} />);
      expect(container.firstChild).toHaveClass(textToken, borderToken);
      expect(container.firstChild).toHaveTextContent(label);
    }
  );

  it("renders an em dash for decisions with no stamp (e.g. not-yet-processed invoices)", () => {
    const { container } = render(<StatusStamp decision={null} />);
    expect(container.firstChild).toHaveTextContent("—");
  });
});