# ComplyFlow

Multi-agent enterprise invoice compliance pipeline, built on Microsoft
Foundry, with a full audit trail of every agent decision.

**Extraction agent → Compliance agent → Approval agent**, orchestrated in
Python (CLI) or live from a web dashboard (Next.js + TypeScript). Every run
writes machine-readable results plus an `agent_audit_log` trace back to a
local SQLite database, so you can show *why* an invoice was approved, flagged,
or rejected — not just the answer.

## Features

- **3-agent pipeline** — dedicated Foundry agents for extracting fields,
  running compliance checks, and making the final decision (agent prompts in
  `agents.md`).
- **Fully auditable** — every agent call is logged to `agent_audit_log` with
  timestamps and input/output summaries.
- **5 policy checks per invoice** — vendor approval, budget limit, duplicate
  detection, line-item totals match, and PO presence.
- **Live web dashboard** — a "paper ledger" view of the invoice queue with
  status stamps, filters, and a slide-in detail drawer.
- **Submit invoices from the browser** — paste raw invoice text, watch the
  three pipeline stages stream live, and the new invoice appears in the
  ledger with its decision and full audit trail.
- **Two ways to run the pipeline**:
  - `python orchestrator.py` — pull every `received` invoice and process all
    of them in one go.
  - Web API — process a single pasted invoice on demand.

## Architecture

```
                 ┌──────────────────────────┐
   raw invoice ─▶│        Foundry           │
                 │  extraction-agent        │
                 │  compliance-agent        │
                 │  approval-agent          │
                 └───────────┬──────────────┘
                             │
              writes ┌───────▼────────┐
                     │  db/erp.db     │  SQLite (vendors, invoices,
                     │  (SQLite)      │  compliance_results, decisions,
                     └───────┬────────┘  agent_audit_log)
                             │
                 ┌───────────▼──────────┐
                 │  queries             │
                 │  web dashboard       │  Next.js App Router, server
                 │  (Next.js + TS)      │  components + client components
                 └──────────────────────┘
```

The Python orchestrator and the web pipeline are independent front-ends to
the same agents and the same database. Both authenticate with
`DefaultAzureCredential` (e.g. `az login`), and both target the agents by
name over each agent's OpenAI-compatible endpoint.

## Repository layout

```
├── agents.md                 # System prompts for the 3 agents (+ demo notes)
├── data/
│   └── mock_invoices.json    # 7 sample invoices with built-in compliance issues
├── db/
│   ├── schema.sql            # Mock ERP schema (SQLite)
│   └── seed.py               # Seeds the database from mock_invoices.json
├── orchestrator.py           # Python CLI: processes every 'received' invoice
├── requirements.txt          # Python dependencies
├── requirements-dev.txt      # Test deps (pytest, pytest-mock)
├── tests/                    # Python test suite (pytest)
├── .env / .env.example       # Foundry configuration (see below)
└── web/                      # Next.js 14 dashboard + live submit flow
    ├── app/
    │   ├── layout.tsx        # Fonts + base styles (self-hosted IBM Plex)
    │   ├── page.tsx          # Ledger page (server-rendered, force-dynamic)
    │   └── api/process-invoice/route.ts   # SSE endpoint for the live flow
    ├── components/
    │   ├── ledger-view.tsx   # Ledger table, filters, "New invoice" entry point
    │   ├── status-stamp.tsx  # APPRV / REJCT / FLAG stamps + PASS/FAIL checks
    │   ├── detail-drawer.tsx # Slide-in drawer with full invoice detail
    │   └── new-invoice-panel.tsx          # Raw-text submit form + stage status
    ├── lib/
    │   ├── db.ts             # SQLite read layer (ledger + invoice detail)
    │   ├── actions.ts        # Server action backing the detail drawer
    │   └── pipeline.ts       # TypeScript mirror of orchestrator.py
    ├── tests/                # Vitest + React Testing Library suite
    ├── fonts/                # Self-hosted IBM Plex Sans / Mono
    ├── package.json          # npm scripts (dev / build / start / lint / typecheck / test)
    └── .tool-versions        # Node 22 pin
```

## Prerequisites

- **Python 3.10+** and `pip`
- **Node.js 22** (a `.tool-versions` file pins it for `mise`; install with
  `mise install node@22`). Do *not* use Node 26 with Next.js 14 — it breaks
  the dev server.
- **Azure CLI** logged in (`az login`) so `DefaultAzureCredential` can obtain
  tokens.

## Quick start

```bash
# 1. Python dependencies (pipeline CLI)
pip install -r requirements.txt

# 2. Node dependencies (web dashboard)
cd web && npm install

# 3. Configure Foundry
cp .env.example .env        # then fill in your project endpoint (see below)

# 4. Authenticate
az login

# 5. Seed the mock database (once, or to reset)
python db/seed.py

# 6a. Run the CLI pipeline (processes every 'received' invoice)
python orchestrator.py

# 6b. Or run the web dashboard (http://localhost:3000)
cd web && npm run dev
```

## Configuration

Copy `env.example` to `.env` in the repo root and fill in your project
endpoint from the Foundry portal (Project overview → "Endpoint"):

```
FOUNDRY_PROJECT_ENDPOINT=https://<your-project>.services.ai.azure.com/api/projects/<project-name>
```

Both `orchestrator.py` (via `load_dotenv()`) and the web `/api/process-invoice`
route read this file automatically. Keep `.env` out of version control;
**do not commit real endpoints or keys**.

The web app also supports two optional overrides (defaults are shown):

| Variable                   | Default                         | Purpose                          |
| -------------------------- | ------------------------------- | -------------------------------- |
| `FOUNDRY_PROJECT_ENDPOINT` | *(from repo-root `.env`)*       | Foundry project endpoint         |
| `COMPLYFLOW_DB_PATH`       | `../db/erp.db`                  | SQLite database path             |
| `COMPLYFLOW_MOCK_DATA_PATH`| `../data/mock_invoices.json`    | Mock-invoices line-item fallback |

## Agents

Create three agents in the Foundry portal (ai.azure.com) using the prompts in
`agents.md`. They must be named exactly:

- `extraction-agent`
- `compliance-agent`
- `approval-agent`

Test each one in its playground before wiring up the code. The pipeline
targets them by name over the OpenAI-compatible endpoint
`{endpoint}/agents/{agent_name}/endpoint/protocols/openai` with an Entra
bearer token and `api-version=v1`, exactly as the Azure AI Projects Python
SDK does.

## Running the CLI pipeline

```
python orchestrator.py
```

Reads every invoice with status `received`, then for each one:

1. **Extraction** — sends the raw invoice text to `extraction-agent` and gets
   structured fields (vendor, dates, totals, PO, line items).
2. **Compliance** — sends the extracted fields plus the vendor master list
   and already-processed invoices to `compliance-agent`, which returns
   pass/fail checks.
3. **Approval** — sends the compliance results to `approval-agent`, which
   returns `{decision, reason}` (`auto_approved`, `flagged_for_review`, or
   `rejected`).

Results, compliance rows, the decision, and every agent call are written back
to `db/erp.db`. Failures are marked `status='error'` and reported on stdout.

## Running the web dashboard

```bash
cd web
npm run dev        # dev server  -> http://localhost:3000
npm run build      # production build
npm run start      # run the production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

### The ledger

The home page is a server-rendered ledger of all invoices with:

- **Status stamps** — APPRV (auto-approved), FLAG (flagged for review),
  REJCT (rejected).
- **Filters** — Registry / Flagged / Rejected / All (left-hand nav).
- **Detail drawer** — click any row to slide in the full detail: extracted
  fields, line items, per-check PASS/FAIL results with reasons, and the
  three-step audit trail (extraction → compliance → approval).

Keyboard users can open rows with <kbd>Enter</kbd>/<kbd>Space</kbd>, and the
drawer traps focus and closes with <kbd>Esc</kbd>.

### Submitting an invoice live

1. Click **New invoice** in the header — an inline form (no modal) opens.
2. Paste raw invoice text into the textarea and click **Submit invoice**.
3. The form streams the pipeline progress live:
   `Extracting fields...` → `Running compliance checks...` → `Deciding...` .
4. On success the form closes, the new invoice is appended to the ledger, and
   its detail drawer opens immediately showing the decision, checks, and
   audit trail.
5. On failure a plain-language error is shown and the form stays open so you
   can retry.

### API

`POST /api/process-invoice`

Request:

```json
{ "rawText": "INVOICE\nAcme Office Supplies\n..." }
```

Response: a `text/event-stream` with `stage`, `done`, or `error` events:

```
event: stage
data: {"label": "Extracting fields..."}

event: done
data: {"result": {"invoice": {...}, "compliance": [...], "decision": {...}, "audit": [...]}}
```

Invalid or empty bodies return `400` with `{"error": "..."}`.

The new invoice is written to the same `db/erp.db` with the same schema and
audit trail the Python orchestrator produces, so both front-ends stay in sync.
Extracted line items are persisted to `invoice_line_items` so the drawer can
show them for live-submitted invoices (seeded invoices fall back to
`mock_invoices.json`).

## Database

`db/erp.db` is a SQLite file created from `db/schema.sql` and seeded by
`db/seed.py`. Tables:

| Table                  | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `vendors`              | Approved vendor master list (name, approval, budget) |
| `invoices`             | One row per invoice, final status                    |
| `compliance_results`   | Pass/fail rows per check                             |
| `decisions`            | Final decision + reason                              |
| `agent_audit_log`      | Every agent action with timestamp + summaries        |
| `invoice_line_items`   | Line items for invoices processed through the web app|

Invoice status flow: `received` → `extracted` → `compliance_checked` →
`auto_approved` / `flagged_for_review` / `rejected`.

## Mock dataset

`data/mock_invoices.json` contains 7 invoices engineered to exercise every
check:

- INV-1001, INV-1005 — clean, auto-approved
- INV-1002 — missing PO → flagged
- INV-1007 — line-item totals mismatch → flagged
- INV-1003 — duplicate of INV-1001 → rejected
- INV-1004 — vendor not on approved list → rejected
- INV-1006 — over the vendor's budget limit → rejected

## Testing

Both pipelines ship with automated test suites. No test hits a real Foundry
agent or asserts on real LLM output — the agent-calling functions
(`ask_agent` in Python, `responses.create` in the web pipeline) are mocked
with fixed sample JSON, and every database test runs against an in-memory or
throwaway temp database so `db/erp.db` is never touched.

### Python (pytest)

```bash
pip install -r requirements-dev.txt   # pytest, pytest-mock

# from the repo root
pytest tests/          # or: .venv/bin/python -m pytest tests/
```

Covers `orchestrator.py` (JSON-fence stripping and error handling in
`ask_agent`, `log_audit` truncation, end-to-end `process_invoice` writes to
`invoices` / `compliance_results` / `decisions`, the `passed: null → 0`
mapping, and the compliance prompt's `already_processed_invoices` filter) and
`db/seed.py` (7 received invoices, the 4 approved vendors with their budget
limits).

### Web (Vitest + React Testing Library)

```bash
cd web
npm test              # vitest run (single pass)
npm run test:watch    # vitest watch mode
```

Covers the ledger table (rendering, status-stamp token colors, right-aligned
currency amounts, filters), the detail drawer (extracted fields, the 5
compliance checks with PASS/FAIL marks, chronological audit trail, focus
management), the live submit flow (mocked `fetch` to the API route — success
row + drawer, plain error messages, disabled submit while busy), and the
pipeline behind the API route (real DB writes from fixed mock agent responses,
malformed-agent-JSON rejection and rollback, SSE `done`/`error` framing).

## Troubleshooting

- **`Missing required query parameter: api-version`** — the web pipeline
  appends `?api-version=v1` to agent calls, matching the Python SDK. If you
  see this elsewhere, verify the request includes that parameter.
- **`FOREIGN KEY constraint failed`** — the web write-connection disables
  foreign keys to match the Python `sqlite3` defaults, so submissions for
  vendors not in `vendors` are allowed (they still fail
  `vendor_approved`).
- **`Could not find a production build in the '.next' directory`** — run
  `npm run build` before `npm run start`; if `.next` is stale, delete it
  (`rm -rf web/.next`) and rebuild.
- **Fonts don't load** — Google Fonts is unreachable from some networks; the
  dashboard self-hosts IBM Plex in `web/fonts/`, so no network is needed.
- **Node version errors** — use Node 22 (`mise use node@22` in `web/`).