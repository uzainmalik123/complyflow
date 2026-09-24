"""
ComplyFlow Orchestrator

Pulls every invoice with status='received' from erp.db, runs it through
Extraction -> Compliance -> Approval (each a separate Foundry agent), and
writes results + a full audit trail back to the database.

Setup:
    1. cp .env.example .env   and fill in your project endpoint
    2. pip install -r requirements.txt
    3. az login
    4. python orchestrator.py

Requires the 3 agents (extraction-agent, compliance-agent, approval-agent)
to already exist in your Foundry project, using the prompts from agents.md,
named exactly those 3 strings.
"""
import json
import os
import sqlite3
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "db" / "erp.db"
DATA_PATH = ROOT / "data" / "mock_invoices.json"

PROJECT_ENDPOINT = os.environ["FOUNDRY_PROJECT_ENDPOINT"]


def get_client():
    # allow_preview=True is required to target a specific agent by name
    return AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=DefaultAzureCredential(),
        allow_preview=True,
    )


def ask_agent(client, agent_name: str, prompt: str) -> dict:
    """Send one prompt to one named agent, return its reply parsed as JSON."""
    openai_client = client.get_openai_client(agent_name=agent_name)
    response = openai_client.responses.create(input=prompt)
    reply_text = response.output_text.strip()

    if not reply_text:
        raise RuntimeError(f"Empty response from agent '{agent_name}'")

    # Agents are prompted to return raw JSON, but strip code-fences just in case
    cleaned = reply_text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


def log_audit(conn, invoice_id, agent_name, action, input_summary, output_summary):
    conn.execute(
        """INSERT INTO agent_audit_log
           (invoice_id, agent_name, action, input_summary, output_summary)
           VALUES (?, ?, ?, ?, ?)""",
        (invoice_id, agent_name, action, str(input_summary)[:300], str(output_summary)[:300]),
    )
    conn.commit()


def process_invoice(client, conn, invoice_row, raw_text: str):
    invoice_id = invoice_row["invoice_id"]
    print(f"\n--- Processing {invoice_id} ---")

    # 1. Extraction
    extracted = ask_agent(client, "extraction-agent", raw_text)
    log_audit(conn, invoice_id, "extraction", "extract_fields", raw_text, extracted)
    conn.execute("UPDATE invoices SET status='extracted' WHERE invoice_id=?", (invoice_id,))
    conn.commit()
    print(f"Extracted: {extracted}")

    # 2. Compliance
    vendors = conn.execute("SELECT * FROM vendors").fetchall()
    vendor_list = [dict(v) for v in vendors]

    already_processed = conn.execute(
        """SELECT invoice_id, vendor_id, vendor_name, total_amount, po_number
           FROM invoices WHERE status = 'auto_approved' OR status = 'flagged_for_review'"""
    ).fetchall()
    already_processed_list = [dict(r) for r in already_processed]

    compliance_prompt = json.dumps({
        "invoice": extracted,
        "vendor_master_list": vendor_list,
        "already_processed_invoices": already_processed_list,
    })
    compliance_results = ask_agent(client, "compliance-agent", compliance_prompt)
    log_audit(conn, invoice_id, "compliance", "run_checks", compliance_prompt, compliance_results)

    for check in compliance_results:
        conn.execute(
            """INSERT INTO compliance_results (invoice_id, check_name, passed, detail)
               VALUES (?, ?, ?, ?)""",
            (invoice_id, check.get("check_name", "unknown"), int(bool(check.get("passed"))), check.get("detail", "")),
        )
    conn.execute("UPDATE invoices SET status='compliance_checked' WHERE invoice_id=?", (invoice_id,))
    conn.commit()
    print(f"Compliance: {compliance_results}")

    # 3. Approval
    approval_prompt = json.dumps({"invoice_id": invoice_id, "compliance_results": compliance_results})
    decision = ask_agent(client, "approval-agent", approval_prompt)
    log_audit(conn, invoice_id, "approval", "make_decision", approval_prompt, decision)

    conn.execute(
        "INSERT INTO decisions (invoice_id, decision, reason) VALUES (?, ?, ?)",
        (invoice_id, decision["decision"], decision["reason"]),
    )
    conn.execute("UPDATE invoices SET status=? WHERE invoice_id=?", (decision["decision"], invoice_id))
    conn.commit()
    print(f"Decision: {decision['decision']} — {decision['reason']}")


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    raw_texts = {inv["invoice_id"]: inv["raw_text"] for inv in json.loads(DATA_PATH.read_text())}

    client = get_client()

    rows = conn.execute("SELECT * FROM invoices WHERE status='received'").fetchall()
    print(f"Found {len(rows)} invoices to process.")

    for row in rows:
        try:
            process_invoice(client, conn, row, raw_texts[row["invoice_id"]])
        except Exception as e:
            print(f"ERROR on {row['invoice_id']}: {e}")
            conn.execute("UPDATE invoices SET status='error' WHERE invoice_id=?", (row["invoice_id"],))
            conn.commit()

    conn.close()
    print("\nDone. Query db/erp.db to see results, or check agent_audit_log for the full trace.")


if __name__ == "__main__":
    main()
