"""Shared pytest fixtures and environment setup.

The orchestrator reads FOUNDRY_PROJECT_ENDPOINT from the environment at import
time, so it must be present before any test module imports it. This conftest is
loaded by pytest before the test modules in this directory.
"""
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Never talk to a real Foundry endpoint during tests.
os.environ.setdefault("FOUNDRY_PROJECT_ENDPOINT", "https://test-project.services.ai.azure.com/api/projects/test")

SCHEMA_PATH = ROOT / "db" / "schema.sql"


def load_schema(conn: sqlite3.Connection) -> None:
    """Run the real schema (including the seeded vendor master list)."""
    conn.executescript(SCHEMA_PATH.read_text())


def invoice_row(invoice_id: str = "INV-1001", **overrides) -> dict:
    """A minimal invoice row shaped like sqlite3.Row from the lifecycle."""
    row = {
        "invoice_id": invoice_id,
        "vendor_id": "V-001",
        "vendor_name": "Acme Office Supplies",
        "invoice_date": "2026-09-01",
        "due_date": "2026-09-30",
        "total_amount": 2700.00,
        "po_number": "PO-4501",
        "status": "received",
    }
    row.update(overrides)
    return row