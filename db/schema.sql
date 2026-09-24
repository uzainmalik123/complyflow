-- Mock ERP schema for the invoice agent pipeline
-- SQLite-compatible

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id TEXT PRIMARY KEY,
    vendor_name TEXT NOT NULL,
    is_approved INTEGER NOT NULL DEFAULT 0,   -- 1 = on approved vendor master list
    budget_limit REAL DEFAULT NULL            -- max single-invoice amount for this vendor, NULL = no cap
);

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    invoice_date TEXT,
    due_date TEXT,
    total_amount REAL,
    po_number TEXT,
    status TEXT NOT NULL DEFAULT 'received',  -- received -> extracted -> compliance_checked -> approved/rejected/flagged
    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id)
);

CREATE TABLE IF NOT EXISTS compliance_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    check_name TEXT NOT NULL,       -- e.g. 'vendor_approved', 'duplicate_check', 'budget_limit', 'total_matches_line_items'
    passed INTEGER NOT NULL,        -- 1 = pass, 0 = fail
    detail TEXT,
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
);

CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    decision TEXT NOT NULL,         -- 'auto_approved', 'flagged_for_review', 'rejected'
    reason TEXT,
    decided_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
);

-- Audit log: every agent action gets logged here for the "observability" demo
CREATE TABLE IF NOT EXISTS agent_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT,
    agent_name TEXT NOT NULL,       -- 'orchestrator', 'extraction', 'compliance', 'approval'
    action TEXT NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Extra line items for invoices processed live through the web app (drawer display)
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    description TEXT,
    quantity REAL,
    unit_price REAL,
    total REAL
);

-- Seed vendor master list (used by compliance agent)
INSERT OR IGNORE INTO vendors (vendor_id, vendor_name, is_approved, budget_limit) VALUES
    ('V-001', 'Acme Office Supplies', 1, 5000.00),
    ('V-002', 'CloudNet Hosting', 1, 15000.00),
    ('V-014', 'Metro Print & Design', 1, 2000.00),
    ('V-021', 'Bright Legal Partners', 1, 10000.00);
    -- Note: V-999 (Quantum Consulting Group) intentionally NOT in this list -> triggers non-approved-vendor flag
