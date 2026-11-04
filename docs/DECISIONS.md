# ComplyFlow: Decisions

> A record of important decisions. Add new ones at the bottom with the next ID. To change a decision, don't edit it: add a new one and mark the old one `Superseded by D-xx`.
> Status values: `Accepted` · `Proposed` (needs team sign-off) · `Superseded`
>
> **D-01 to D-08 were made while building the first version** (`459f9a9`, 2026-09-24) and were never written down at the time. They're reconstructed from the code, README and `agents.md` on 2026-11-04, so their "Context" is our best reading of why, not a quote. D-09 onward were recorded as they were made.

| ID | Decision | Status |
|---|---|---|
| D-01 | Agents run on Microsoft Foundry, called by name over the OpenAI-compatible endpoint with `DefaultAzureCredential` | Accepted |
| D-02 | Three narrow agents (extraction, compliance, approval); orchestration is plain code, not an LLM agent | Accepted |
| D-03 | One local SQLite file is the mock ERP and the single store for everything; unknown vendors are stored, not refused | Accepted |
| D-04 | Two independent front-ends (Python CLI, Next.js web) share the agents and the DB; `pipeline.ts` mirrors `orchestrator.py` | Accepted |
| D-05 | Every agent call is logged to `agent_audit_log` with 300-char input/output summaries | Accepted (truncation revisited in F14, KI-04) |
| D-06 | Approval rules: all pass → approve; one minor failure → flag; hard failure or 2+ → reject | Accepted (moves to code in F13) |
| D-07 | Tests never call a real agent or touch `db/erp.db`: mocked replies, temp or in-memory DBs | Accepted |
| D-08 | Failure handling: the web pipeline deletes every row for a failed invoice; the CLI marks it `error` | Accepted (parity in F16, KI-08) |
| D-09 | Line-item arithmetic is deterministic code, never the model; the model only reads the numbers (F09) | Accepted |
| D-10 | Mock fixtures must not hint at the expected outcome | Accepted |
| D-11 | CI on GitHub Actions: pytest, plus web lint, typecheck, vitest and `next build` (F10) | Accepted |
| D-12 | Local agent-tool folders (`.claude/`, `.opencode/`) and `/brag` output are not committed | Accepted |
| D-13 | Every decision records a `policy_version`: a SHA-256 over the deployed prompts, vendor rows and code-check versions, with an append-only snapshot (F11) | Proposed |

---

### D-01: Agents run on Microsoft Foundry
- **Context:** the project is built around Foundry agents. Prompts are managed in the Foundry portal and the code only needs to call them.
- **Decision:**
  - Three agents named exactly `extraction-agent`, `compliance-agent`, `approval-agent`.
  - Both pipelines call `{endpoint}/agents/{name}/endpoint/protocols/openai` with an Entra token and `api-version=v1`, matching the Azure AI Projects Python SDK.
  - The endpoint comes from `FOUNDRY_PROJECT_ENDPOINT` in the repo-root `.env`.
- **Consequences:**
  - The deployed prompts live in Foundry, not in git. `agents.md` is a copy that can drift (KI-01).
  - Running anything needs `az login`.

### D-02: Three narrow agents; orchestration is code
- **Context:** `agents.md` describes four agents, including an LLM orchestrator. Sequencing, retries and DB writes don't need judgement, and an auditor needs them to happen the same way every time.
- **Decision:**
  - Each agent does one job and returns raw JSON.
  - The orchestrator is `orchestrator.py` / `pipeline.ts`, not a model.
- **Consequences:**
  - F23 (LLM Orchestrator Agent) is scrapped.
  - The orchestrator section of `agents.md` describes behaviour the code is meant to have, including "retry once", which isn't built yet (KI-07, F16).

### D-03: One SQLite file is the ERP
- **Decision:**
  - `db/erp.db`, created from `db/schema.sql` and seeded by `db/seed.py`; gitignored.
  - The web write connection turns foreign keys off to match Python's `sqlite3` default, so an invoice from a vendor not in `vendors` is stored and then fails `vendor_approved`.
- **Why:** zero setup for a demo, and an unknown vendor is exactly the case the pipeline should report, not crash on.
- **Consequences:** amounts are `REAL` (KI-06, F17). Vendor rows are edited in place (KI-03, F21).

### D-04: Two front-ends, one behaviour
- **Decision:**
  - `python orchestrator.py` processes every `received` invoice in a batch.
  - The web app processes one pasted invoice through `POST /api/process-invoice` and streams the stages over SSE.
  - Both write the same tables with the same shapes.
- **Consequences:**
  - Every pipeline change is made twice. They have already diverged on failure handling (KI-08) and reply validation (KI-14).
  - F15 adds a parity suite so the next divergence fails a test.

### D-05: Every agent call is in the audit log
- **Decision:** one `agent_audit_log` row per agent call (agent, action, input summary, output summary, timestamp), with summaries cut to 300 characters.
- **Why:** the drawer shows a three-step trace, and short summaries kept the table readable.
- **Consequences:** the full compliance input, including the vendor list, isn't recoverable from the log (KI-04, F14).

### D-06: Approval rules
- **Decision:**
  - All checks passed → `auto_approved`.
  - Exactly one check failed and it's `po_present` or `totals_match` → `flagged_for_review`.
  - `vendor_approved` or `duplicate_check` failed, or 2+ checks failed → `rejected`.
  - Every decision has a reason naming the checks that drove it.
- **Why:** missing paperwork and arithmetic slips are fixable by a person; unknown vendors and duplicates are policy violations that shouldn't pass silently.
- **Consequences:** the rules are applied by the approval agent today, so they're only as reliable as the model (F13).

### D-07: Tests never call a real agent
- **Decision:**
  - Python mocks `ask_agent`; vitest mocks `openai` and `@azure/identity`.
  - DB tests run against in-memory SQLite (pytest) or a throwaway temp file (vitest).
- **Why:** tests have to be free, fast, deterministic and runnable in CI without secrets.

### D-08: Failure handling differs by front-end
- **Decision:**
  - Web: any error deletes every row written for that invoice (`invoices`, `invoice_line_items`, `compliance_results`, `decisions`, `agent_audit_log`) and shows a plain-language error, so the user can retry.
  - CLI: the invoice is marked `status='error'`; rows already written stay.
- **Why:** a pasted invoice that fails should leave no trace; a batch item that fails should stay visible for re-processing.
- **Consequences:** the CLI keeps a partial audit trail and the web keeps none. Tracked in KI-08; F16 decides whether to unify.

### D-09: Line-item arithmetic is deterministic code (F09)
- **Context:** 2026-11-04 review question: "Did you do the line-item math deterministically or leave it to the model?" It was the model: the extraction agent computed `totals_match` and the compliance agent echoed it. Catching INV-1007's $0.01 difference depended on the model adding correctly.
- **Decision:**
  - `check_totals` (Python, `Decimal`, `ROUND_HALF_UP`) and `checkTotals` (TS, integer cents via `Math.round`) check each line's `quantity × unit_price` against its total and the line sum against `total_amount`, to the cent.
  - Currency strings (`"$8,500.00"`) are parsed.
  - No line items or no total → the check fails ("could not be verified").
  - The model's `totals_match` is replaced in place (same position in the list) before the approval agent sees it; if the model omits it, the code's check is appended.
  - The extraction prompt now says to copy amounts exactly and not recompute; the compliance prompt no longer reports `totals_match`.
- **Consequences:**
  - An invoice with no extractable line items is now flagged, not approved (KI-12).
  - The deployed Foundry prompts still have the old text until someone pastes the new ones (KI-01). The override makes the result correct either way.
  - Python and TS round negative half-cents differently (KI-15).
  - F12 and F13 apply the same principle to the remaining checks and the decision.

### D-10: Mock fixtures must not hint at the expected outcome
- **Context:** INV-1007's raw text ended with "(Note: line item total and invoice total do not match)", so a model could flag it by reading the note.
- **Decision:** the note is removed, and a test in each suite fails if it comes back. New fixtures describe the invoice, not the expected result.

### D-11: CI on GitHub Actions (F10)
- **Decision:**
  - `.github/workflows/ci.yml` runs on every pull request and every push to `main`.
  - Job `Python (pytest)`: Python 3.12, `pip install -r requirements.txt -r requirements-dev.txt`, `pytest tests/`.
  - Job `Web (lint, typecheck, test, build)`: Node 22 (as in `web/.tool-versions`), `npm ci`, lint, typecheck, vitest, `next build`.
  - Read-only permissions; in-progress runs on the same ref are cancelled.
- **Why:** the totals fix needed a gate, and the build was confirmed to work without `db/erp.db`.

### D-12: Local agent-tool folders aren't committed
- **Context:** a commit on PR #1 briefly added `.claude/` and `.opencode/` (the `/brag` skill: 319 files, ~46k lines, ~30 MB of audio). It was removed from the branch before merge.
- **Decision:** `.gitignore` covers `.claude/`, `.opencode/`, `brag-output/` and `brag-output-*/`.

### D-13: Every decision records a policy version (F11) · Proposed
- **Context:** 2026-11-04 question: "Does ComplyFlow log the policy version behind each decision?" No. A decision stores only the decision, reason and timestamp. Prompts change in Foundry with no trace (KI-01), vendor limits are overwritten in place (KI-03), and the audit log truncates the vendor list (KI-04). An old rejection can't be explained against the rules that produced it (KI-02).
- **Proposal:**
  - The policy is: the deployed compliance and approval prompts with their Foundry agent version and model; the vendor rows sent; and a version constant per code check.
  - `policy_version` = SHA-256 of that object as canonical JSON (sorted keys, no whitespace, amounts as strings).
  - `policy_snapshots(policy_version PRIMARY KEY, created_at, snapshot)`, insert-or-ignore, never updated.
  - `decisions.policy_version`, added by an in-place migration; pre-F11 rows stay `NULL`.
  - Both pipelines must hash identically (shared fixture).
  - If the deployed prompt can't be fetched, fail the run rather than hash `agents.md` silently.
- **Open:** what Foundry exposes for an agent's deployed instructions and version (KI-01). Needs team sign-off before F11 starts.
