"""Tests for db/seed.py.

seed.main() writes to its module-level DB_PATH; every test redirects that to a
temp file so the real db/erp.db is never touched.
"""
import sqlite3

import db.seed as seed


def test_seed_creates_all_seven_received_invoices(tmp_path, monkeypatch):
    db_file = tmp_path / "erp.db"
    monkeypatch.setattr(seed, "DB_PATH", db_file)

    seed.main()

    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    try:
        invoices = conn.execute("SELECT * FROM invoices ORDER BY invoice_id").fetchall()
        assert len(invoices) == 7
        assert {inv["invoice_id"] for inv in invoices} == {
            "INV-1001", "INV-1002", "INV-1003", "INV-1004",
            "INV-1005", "INV-1006", "INV-1007",
        }
        assert all(inv["status"] == "received" for inv in invoices)
    finally:
        conn.close()


def test_seed_loads_the_four_approved_vendors(tmp_path, monkeypatch):
    db_file = tmp_path / "erp.db"
    monkeypatch.setattr(seed, "DB_PATH", db_file)

    seed.main()

    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    try:
        vendors = conn.execute("SELECT * FROM vendors ORDER BY vendor_id").fetchall()
        assert len(vendors) == 4

        expected = {
            "V-001": ("Acme Office Supplies", 1, 5000.0),
            "V-002": ("CloudNet Hosting", 1, 15000.0),
            "V-014": ("Metro Print & Design", 1, 2000.0),
            "V-021": ("Bright Legal Partners", 1, 10000.0),
        }
        for vendor in vendors:
            name, approved, budget = expected[vendor["vendor_id"]]
            assert vendor["vendor_name"] == name
            assert vendor["is_approved"] == approved
            assert vendor["budget_limit"] == budget
    finally:
        conn.close()


def test_seed_runs_against_a_fresh_file_every_time(tmp_path, monkeypatch):
    # Running twice against the same path wipes and rebuilds instead of
    # accumulating rows (seed unlinks the DB first).
    db_file = tmp_path / "erp.db"
    monkeypatch.setattr(seed, "DB_PATH", db_file)

    seed.main()
    seed.main()

    conn = sqlite3.connect(db_file)
    try:
        count = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
        assert count == 7
    finally:
        conn.close()