"""Tests for the Python orchestrator pipeline.

Every agent call is mocked (never hits a real Foundry agent / real LLM output),
so the tests exercise ask_agent, log_audit, and process_invoice for real against
an in-memory SQLite database.
"""
import json
import sqlite3

import pytest

import orchestrator
from conftest import invoice_row, load_schema

# --- Fixed, deterministic sample agent replies (shapes from agents.md) --------

EXTRACTED = {
    "vendor_name": "Acme Office Supplies",
    "vendor_id": "V-001",
    "invoice_date": "2026-09-01",
    "due_date": "2026-09-30",
    "total_amount": 2700.0,
    "po_number": "PO-4501",
    "totals_match": True,
    "line_items": [
        {"description": "Office chairs x10", "quantity": 10, "unit_price": 120.0, "total": 1200.0},
        {"description": "Standing desks x5", "quantity": 5, "unit_price": 300.0, "total": 1500.0},
    ],
}

# 5 real compliance check shapes from agents.md. duplicate_check has
# `passed: null` on purpose — it must be stored as 0, not crash.
COMPLIANCE = [
    {"check_name": "vendor_approved", "passed": True, "detail": "Vendor is on the approved master list."},
    {"check_name": "budget_limit", "passed": True, "detail": "2700.00 is within the 5000.00 budget."},
    {"check_name": "duplicate_check", "passed": None, "detail": "No matching prior invoice."},
    {"check_name": "totals_match", "passed": True, "detail": "Line items total matches the invoice total."},
    {"check_name": "po_present", "passed": True, "detail": "PO number is present."},
]

APPROVAL = {"decision": "auto_approved", "reason": "All compliance checks passed."}


# --- Fake Foundry client for ask_agent tests ---------------------------------


class FakeResponses:
    def __init__(self, text):
        self._text = text

    def create(self, input):
        return FakeResponse(self._text)


class FakeResponse:
    def __init__(self, text):
        self.output_text = text


class FakeOpenAIClient:
    def __init__(self, text):
        self.responses = FakeResponses(text)


class FakeClient:
    """Returns a canned reply regardless of which agent is being asked."""

    def __init__(self, text):
        self._text = text

    def get_openai_client(self, agent_name):
        return FakeOpenAIClient(self._text)


@pytest.fixture
def in_memory_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    load_schema(conn)
    return conn


# --- ask_agent ---------------------------------------------------------------


class TestAskAgent:
    def test_strips_json_code_fences(self):
        client = FakeClient('```json\n{"invoice_id": "INV-1"}\n```')
        assert orchestrator.ask_agent(client, "extraction-agent", "text") == {"invoice_id": "INV-1"}

    def test_strips_bare_backtick_fences(self):
        client = FakeClient('```\n{"vendor": "Acme"}\n```')
        assert orchestrator.ask_agent(client, "extraction-agent", "text") == {"vendor": "Acme"}

    def test_parses_plain_json_without_fences(self):
        client = FakeClient('{"po_number": "PO-4501"}')
        assert orchestrator.ask_agent(client, "extraction-agent", "text") == {"po_number": "PO-4501"}

    def test_raises_clear_error_on_empty_response(self):
        client = FakeClient("")
        with pytest.raises(RuntimeError, match="Empty response from agent 'extraction-agent'"):
            orchestrator.ask_agent(client, "extraction-agent", "text")

    def test_raises_clear_error_on_whitespace_only_response(self):
        client = FakeClient("   \n\t ")
        with pytest.raises(RuntimeError, match="Empty response from agent"):
            orchestrator.ask_agent(client, "extraction-agent", "text")

    def test_malformed_json_raises_instead_of_silently_failing(self):
        client = FakeClient("this is definitely not json")
        with pytest.raises(json.JSONDecodeError):
            orchestrator.ask_agent(client, "extraction-agent", "text")


# --- log_audit ---------------------------------------------------------------


class TestLogAudit:
    def test_writes_row_with_all_fields(self, in_memory_db):
        orchestrator.log_audit(
            in_memory_db, "INV-1001", "extraction", "extract_fields", "raw...", {"vendor": "Acme"}
        )
        row = in_memory_db.execute(
            "SELECT invoice_id, agent_name, action, input_summary, output_summary FROM agent_audit_log"
        ).fetchone()
        assert dict(row) == {
            "invoice_id": "INV-1001",
            "agent_name": "extraction",
            "action": "extract_fields",
            "input_summary": "raw...",
            "output_summary": str({"vendor": "Acme"}),
        }

    def test_long_summaries_are_truncated_to_300_chars(self, in_memory_db):
        long_input = "x" * 500
        long_output = "y" * 1000
        orchestrator.log_audit(in_memory_db, "INV-1001", "approval", "make_decision", long_input, long_output)
        row = in_memory_db.execute(
            "SELECT input_summary, output_summary FROM agent_audit_log"
        ).fetchone()
        assert len(row["input_summary"]) == 300
        assert len(row["output_summary"]) == 300

    def test_non_string_summaries_are_stringified(self, in_memory_db):
        orchestrator.log_audit(in_memory_db, "INV-1001", "compliance", "run_checks", 12345, None)
        row = in_memory_db.execute(
            "SELECT input_summary, output_summary FROM agent_audit_log"
        ).fetchone()
        assert row["input_summary"] == "12345"
        assert row["output_summary"] == "None"


# --- process_invoice ---------------------------------------------------------


class TestProcessInvoice:
    def test_end_to_end_writes_correct_rows(self, in_memory_db, mocker):
        mock_ask_agent = mocker.patch(
            "orchestrator.ask_agent", side_effect=[EXTRACTED, COMPLIANCE, APPROVAL]
        )
        in_memory_db.execute(
            """INSERT INTO invoices (invoice_id, vendor_id, vendor_name, invoice_date,
               due_date, total_amount, po_number, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'received')""",
            ("INV-1001", "V-001", "Acme Office Supplies", "2026-09-01", "2026-09-30", 2700.0, "PO-4501"),
        )
        in_memory_db.commit()

        orchestrator.process_invoice(FakeClient("n/a"), in_memory_db, invoice_row(), "raw invoice text")

        # Three agent calls in the right order.
        assert [call.args[1] for call in mock_ask_agent.call_args_list] == [
            "extraction-agent",
            "compliance-agent",
            "approval-agent",
        ]

        # invoices row: extracted -> compliance_checked -> final decision.
        invoice = in_memory_db.execute("SELECT * FROM invoices WHERE invoice_id = 'INV-1001'").fetchone()
        assert dict(invoice)["status"] == "auto_approved"

        # compliance_results rows match the five checks.
        checks = in_memory_db.execute(
            "SELECT check_name, passed, detail FROM compliance_results WHERE invoice_id = 'INV-1001' ORDER BY id"
        ).fetchall()
        assert len(checks) == 5
        for check, expected in zip(checks, COMPLIANCE):
            assert check["check_name"] == expected["check_name"]
            assert check["detail"] == expected["detail"]

        # decisions row.
        decision = in_memory_db.execute(
            "SELECT decision, reason FROM decisions WHERE invoice_id = 'INV-1001'"
        ).fetchone()
        assert decision["decision"] == "auto_approved"
        assert decision["reason"] == "All compliance checks passed."

        # audit trail: one row per stage, in order.
        audit = in_memory_db.execute(
            "SELECT agent_name, action FROM agent_audit_log WHERE invoice_id = 'INV-1001' ORDER BY id"
        ).fetchall()
        assert [(a["agent_name"], a["action"]) for a in audit] == [
            ("extraction", "extract_fields"),
            ("compliance", "run_checks"),
            ("approval", "make_decision"),
        ]

    def test_compliance_check_with_passed_null_is_stored_as_zero(self, in_memory_db, mocker):
        checks_with_null = [
            {"check_name": "vendor_approved", "passed": True, "detail": "ok"},
            {"check_name": "bogus_check", "passed": None, "detail": "no signal from the agent"},
        ]
        mocker.patch(
            "orchestrator.ask_agent",
            side_effect=[EXTRACTED, checks_with_null, {"decision": "rejected", "reason": "Bogus check failed."}],
        )
        in_memory_db.execute(
            "INSERT INTO invoices (invoice_id, vendor_id, vendor_name, invoice_date, due_date, total_amount, po_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'received')",
            ("INV-1001", "V-001", "Acme", "2026-09-01", "2026-09-30", 2700.0, "PO-4501"),
        )
        in_memory_db.commit()

        orchestrator.process_invoice(FakeClient("n/a"), in_memory_db, invoice_row(), "raw")

        rows = in_memory_db.execute(
            "SELECT check_name, passed FROM compliance_results WHERE invoice_id = 'INV-1001' ORDER BY id"
        ).fetchall()
        by_name = {r["check_name"]: r["passed"] for r in rows}
        assert by_name["vendor_approved"] == 1
        assert by_name["bogus_check"] == 0

    def test_compliance_prompt_only_includes_processed_invoices(self, in_memory_db, mocker):
        # Other invoices already in flight: one processed, one rejected, one fresh.
        for data in [
            ("INV-W1", "V-001", "Acme Office Supplies", "auto_approved"),
            ("INV-W2", "V-002", "CloudNet Hosting", "flagged_for_review"),
            ("INV-W3", "V-001", "Acme Office Supplies", "rejected"),
            ("INV-W4", "V-002", "CloudNet Hosting", "received"),
        ]:
            in_memory_db.execute(
                "INSERT INTO invoices (invoice_id, vendor_id, vendor_name, invoice_date, due_date, total_amount, po_number, status) VALUES (?, ?, ?, '2026-01-01', '2026-01-31', 100.0, 'PO-00', ?)",
                data,
            )
        in_memory_db.executemany(
            "INSERT INTO decisions (invoice_id, decision, reason) VALUES (?, ?, ?)",
            [
                ("INV-W1", "auto_approved", "clean"),
                ("INV-W2", "flagged_for_review", "missing PO"),
                ("INV-W3", "rejected", "duplicate"),
            ],
        )
        in_memory_db.commit()

        mock_ask_agent = mocker.patch(
            "orchestrator.ask_agent", side_effect=[EXTRACTED, COMPLIANCE, APPROVAL]
        )

        orchestrator.process_invoice(FakeClient("n/a"), in_memory_db, invoice_row(invoice_id="INV-1001"), "raw")

        # The compliance prompt is the second call's payload.
        compliance_prompt = mock_ask_agent.call_args_list[1].args[2]
        payload = json.loads(compliance_prompt)
        processed = payload["already_processed_invoices"]
        processed_ids = {row["invoice_id"] for row in processed}
        assert processed_ids == {"INV-W1", "INV-W2"}
        assert "INV-W3" not in processed_ids
        assert "INV-W4" not in processed_ids
        for row in processed:
            assert set(row.keys()) == {"invoice_id", "vendor_id", "vendor_name", "total_amount", "po_number"}