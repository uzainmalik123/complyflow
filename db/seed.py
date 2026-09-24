"""
Builds erp.db from schema.sql, then loads data/mock_invoices.json
into the invoices table with status='received'.

Run from the invoice-agent/ root:
    python db/seed.py
"""
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "erp.db"
SCHEMA_PATH = ROOT / "db" / "schema.sql"
DATA_PATH = ROOT / "data" / "mock_invoices.json"


def main():
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_PATH.read_text())

    invoices = json.loads(DATA_PATH.read_text())
    for inv in invoices:
        conn.execute(
            """INSERT INTO invoices
               (invoice_id, vendor_id, vendor_name, invoice_date, due_date,
                total_amount, po_number, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'received')""",
            (
                inv["invoice_id"],
                inv["vendor_id"],
                inv["vendor_name"],
                inv["invoice_date"],
                inv["due_date"],
                inv["total_amount"],
                inv["po_number"],
            ),
        )
    conn.commit()

    count = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
    print(f"Seeded erp.db with {count} invoices at status='received'.")
    conn.close()


if __name__ == "__main__":
    main()
