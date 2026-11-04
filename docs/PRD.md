# ComplyFlow: Product Requirements (PRD)

> Last updated: 2026-11-04 · Owner: team · Target: hackathon demo, then a credible enterprise invoice-compliance pipeline
> Overview: [README.md](../README.md) · Agent prompts: [agents.md](../agents.md) · Design brief: [design.md](../design.md) · Decisions: [DECISIONS.md](DECISIONS.md) · Issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md)

## How to use this doc

- **This is where every future feature goes.** A new idea gets the next free `F` ID, a row in the status board and a section under its priority, even if it's only a user story so far. Nothing gets built that isn't in here.
- **Status:** `TBD` (not done yet) · `Done` (built _and_ its "Done when" checks pass) · `Scrapped` (deliberately not built; the reason is kept).
- **Priority:** `High` = without it a decision can't be trusted or audited. `Med` = makes it production-credible. `Low` = only if time allows.
- **Order of work:** follow the **Build order** column, not the IDs. IDs are stable so that decisions (`D-xx`) and issues (`KI-xx`) keep pointing at the right feature.
- **Scopes don't overlap.** Each feature has an **Owns** line. Anything not listed there belongs to the feature named under **Not this feature**. If you find yourself building something another feature owns, stop and move the work there.
- **Two pipelines, one behaviour.** The Python CLI (`orchestrator.py`) and the web pipeline (`web/lib/pipeline.ts`) are independent implementations of the same flow (D-04). A feature that touches the pipeline is only `Done` when both sides do it and both test suites prove it.
- **F01–F08 were built before this PRD existed** (commit `459f9a9`, 2026-09-24). Their sections are reconstructed from the code and README so later features have something to point at.
- When a feature's status changes, update the table **and** the feature section, and add a line to the changelog at the bottom.

## Status board

| Build order | ID | Feature | Priority | Status | Depends on |
|---|---|---|---|---|---|
| 1 | F01 | Mock ERP & Dataset (schema, seed, 7 mock invoices) | High | Done | n/a |
| 2 | F02 | Extraction Agent | High | Done | n/a |
| 3 | F03 | Compliance Agent (5 checks) | High | Done | F01, F02 |
| 4 | F04 | Approval Agent | High | Done | F03 |
| 5 | F05 | Python Orchestrator CLI | High | Done | F01–F04 |
| 6 | F06 | Agent Audit Trail | High | Done | F05 |
| 7 | F07 | Ledger Dashboard & Detail Drawer | High | Done | F01, F06 |
| 8 | F08 | Live Invoice Submit (web pipeline + SSE) | High | Done | F02–F04, F07 |
| 9 | F09 | Deterministic Totals Check | High | Done (PR #1, D-09) | F03, F05, F08 |
| 10 | F10 | Test Suites & CI | High | Done (PR #1, D-11) | F05, F08 |
| 11 | F11 | **Policy Version on Every Decision** | High | TBD (D-13 Proposed; KI-01, KI-02, KI-03) | F06, F09 |
| 12 | F12 | Deterministic Budget, Duplicate & PO Checks | High | TBD | F09 |
| 13 | F13 | Deterministic Approval Rules | High | TBD | F12 |
| 14 | F14 | Full Audit Payloads | Med | TBD | F06, F11 |
| 15 | F15 | Pipeline Parity Suite | Med | TBD | F10 |
| 16 | F16 | Agent Retry & Error Handling | Med | TBD | F15 |
| 17 | F17 | Exact Money Storage | Med | TBD | F09 |
| 18 | F18 | Human Review Queue | Med | TBD | F11 |
| 19 | F19 | Invoice Number Extraction | Med | TBD | F02, F12 |
| 20 | F20 | Dashboard Auth & Roles | Low | TBD | F18 |
| 21 | F21 | Vendor Master Editing with History | Low | TBD | F11 |
| 22 | F22 | PDF & Image Invoice Ingestion | Low | TBD | F02 |
| n/a | F23 | LLM Orchestrator Agent | n/a | Scrapped | n/a |
| n/a | F24 | LLM-computed line-item totals | n/a | Scrapped | n/a |

**Minimum trustworthy product:** build orders 1–13. That's every decision reproducible from code plus a recorded policy version, with the model doing only reading and fuzzy matching.

---

## HIGH

### F01: Mock ERP & Dataset · High · Done

> 2026-09-24: done in `459f9a9`.

**Owns:** `db/schema.sql` (vendors, invoices, compliance_results, decisions, agent_audit_log, invoice_line_items), `db/seed.py`, `data/mock_invoices.json`.
**Not this feature:** schema changes for policy versions (F11) · money column types (F17).

- **User story:** As a demo presenter, I want a small, realistic ERP with invoices that each exercise one check, so every outcome (approve, flag, reject) shows up in one run.
- **Constraints:**
  - SQLite, one file (`db/erp.db`), gitignored, rebuilt by `python db/seed.py`.
  - 4 approved vendors with budget limits; V-999 deliberately missing.
  - Fixtures must not hint at the expected outcome (D-10).
- **Done when:** seeding gives 7 `received` invoices and 4 approved vendors (`tests/test_seed.py`).

### F02: Extraction Agent · High · Done

> 2026-09-24: done. 2026-11-04: prompt no longer asks for `totals_match` (F09).

**Owns:** the `extraction-agent` prompt in `agents.md` and its call in both pipelines.
**Not this feature:** any arithmetic or judgement on the extracted numbers (F09, F12).

- **User story:** As the pipeline, I want raw invoice text turned into structured fields (vendor, dates, total, PO, line items) so the checks have something exact to work on.
- **Constraints:** returns raw JSON only; amounts copied exactly as printed, never corrected (D-09).
- **Done when:** both pipelines parse its reply, fenced or not, and reject malformed JSON (pytest `TestAskAgent`, vitest fence tests).

### F03: Compliance Agent · High · Done

> 2026-09-24: done with five LLM-judged checks. 2026-11-04: `totals_match` moved to code (F09); four remain with the model until F12.

**Owns:** the `compliance-agent` prompt and the `compliance_results` rows.
**Not this feature:** the deterministic checks (F09, F12) · the final decision (F04, F13).

- **User story:** As a finance reviewer, I want each invoice run through the same named policy checks, with a pass/fail and a reason per check, so I can see exactly which rule an invoice broke.
- **Checks:** `vendor_approved` (fuzzy name match), `budget_limit`, `duplicate_check`, `totals_match` (code since F09), `po_present`.
- **Done when:** the mock run gives the expected failure per invoice (see README § Mock dataset).

### F04: Approval Agent · High · Done

> 2026-09-24: done.

**Owns:** the `approval-agent` prompt and the `decisions` row.
**Not this feature:** encoding the rules in code (F13).

- **User story:** As a finance lead, I want a single decision per invoice (`auto_approved`, `flagged_for_review`, `rejected`) with a human-readable reason, so reviewers only see what needs them.
- **Rules (D-06):** all pass → approve; exactly one of `po_present` / `totals_match` failed → flag; `vendor_approved` or `duplicate_check` failed, or 2+ failures → reject.
- **Done when:** both pipelines reject an invalid decision or an empty reason.

### F05: Python Orchestrator CLI · High · Done

> 2026-09-24: done.

**Owns:** `orchestrator.py`: process every `received` invoice through the three agents and write results back.
**Not this feature:** retries (F16) · parity with the web pipeline (F15).

- **User story:** As an operator, I want one command that processes the whole queue, so a batch demo is a single step.
- **Done when:** `python orchestrator.py` moves every `received` invoice to a final status, or `error` with the failure on stdout.

### F06: Agent Audit Trail · High · Done

> 2026-09-24: done, with summaries truncated to 300 characters (KI-04).

**Owns:** `agent_audit_log` writes (one row per agent call, with timestamp and input/output summaries).
**Not this feature:** full payload storage (F14) · policy versions (F11).

- **User story:** As an auditor, I want every agent call for an invoice in order, so I can see *why* it was approved, not just that it was.
- **Done when:** each processed invoice has exactly three rows in order: extraction, compliance, approval.

### F07: Ledger Dashboard & Detail Drawer · High · Done

> 2026-09-24: done.

**Owns:** `web/app/page.tsx`, `ledger-view.tsx`, `status-stamp.tsx`, `detail-drawer.tsx`, `web/lib/db.ts` (read layer).
**Not this feature:** the review actions (F18) · auth (F20).

- **User story:** As a reviewer, I want a paper-ledger view of every invoice with status stamps and filters, and a drawer with fields, line items, checks and the audit trail.
- **Constraints:** design brief in `design.md`; keyboard operable (Enter/Space opens a row, focus trapped in the drawer, Esc closes).
- **Done when:** vitest ledger and drawer suites pass.

### F08: Live Invoice Submit · High · Done

> 2026-09-24: done.

**Owns:** `web/lib/pipeline.ts`, `POST /api/process-invoice` (SSE), `new-invoice-panel.tsx`.
**Not this feature:** batch processing (F05).

- **User story:** As a presenter, I want to paste an invoice and watch it go through the three stages live, then see it land in the ledger with its decision.
- **Constraints:** on any failure every row written for that invoice is deleted (D-08); errors are shown in plain language.
- **Done when:** vitest pipeline tests prove the DB writes, malformed-reply rollback and SSE framing.

### F09: Deterministic Totals Check · High · Done

> 2026-11-04: done in PR #1 (D-09). `check_totals` (Python, `Decimal`) and `checkTotals` (TS, integer cents) replace the model's `totals_match`. INV-1007 fails with "off by 0.01" from the numbers alone; the hint in its raw text is gone (D-10).

**Owns:** `check_totals` / `with_totals_check` in `orchestrator.py`, `checkTotals` / `withTotalsCheck` in `pipeline.ts`.
**Not this feature:** other checks (F12) · money storage types (F17).

- **User story:** As a finance reviewer, I want a one-cent mismatch caught every time, not whenever the model happens to add correctly.
- **Rules:**
  - Each line: `quantity × unit_price` equals the line total, to the cent.
  - The line totals sum to `total_amount`, to the cent.
  - No line items or no total → fail ("could not be verified"), so the invoice is flagged, not passed.
  - The model's own `totals_match` is replaced in place before the approval agent sees it.
- **Done when:** tests in both suites cover INV-1007 failing, the other six passing, float noise, a bad line, currency strings, missing data and the model being overridden.

### F10: Test Suites & CI · High · Done

> 2026-09-24: test suites done. 2026-11-04: GitHub Actions added in PR #1 (D-11); green on first run.

**Owns:** `tests/`, `web/tests/`, `.github/workflows/ci.yml`.
**Not this feature:** cross-pipeline golden cases (F15).

- **User story:** As the team, we want every PR checked the same way locally and in CI, without ever calling a real agent.
- **Constraints:** no real Foundry calls in tests, no secrets in CI (D-07). CI must not need `db/erp.db`.
- **Done when:** the `Python (pytest)` and `Web (lint, typecheck, test, build)` jobs pass on PRs and on pushes to `main`.

### F11: Policy Version on Every Decision · High · TBD

> 2026-11-04: added. Approach proposed in D-13; blocked on confirming what Foundry returns for an agent's deployed prompt and version (KI-01).

**Owns:** the `policy_version` on every decision, the `policy_snapshots` table, the canonical policy hash in both pipelines, the schema migration for existing DBs, and the "Policy" line in the detail drawer.
**Not this feature:** storing full agent inputs and outputs (F14) · editing vendors (F21) · the code checks themselves (F09, F12, F13).

- **User story:** As an auditor, I want every decision to say exactly which rules produced it, so that when a prompt, a vendor limit or a check changes, I can still explain an old decision against the rules that were in force at the time.
- **What counts as "the policy":**
  1. The compliance and approval agents as deployed: prompt text, agent version and model, as reported by Foundry (not `agents.md`, which can drift, KI-01).
  2. The vendor rows sent to the compliance agent (`vendor_id`, `vendor_name`, `is_approved`, `budget_limit`).
  3. A version constant for each code check (`totals_match` from F09; later F12 and F13), bumped whenever its rule changes.
- **User flow:**
  1. At the start of each invoice, the pipeline builds the policy object above.
  2. It serialises it as canonical JSON (sorted keys, no whitespace, amounts as strings) and hashes it with SHA-256. That hash is the `policy_version`.
  3. `INSERT OR IGNORE INTO policy_snapshots (policy_version, created_at, snapshot)` stores the full object once per distinct version.
  4. The `decisions` row gets the `policy_version`.
  5. The drawer shows `Policy 3f9a1c…` (first 12 hex); expanding it shows the snapshot.
- **Constraints:**
  - Python and TS must produce the **same hash for the same policy**. One shared fixture (`data/policy_version_cases.json`) is hashed by both suites.
  - Existing databases migrate in place: `ALTER TABLE decisions ADD COLUMN policy_version TEXT` and create `policy_snapshots`, run at pipeline start; old rows keep `NULL` and the drawer shows "Policy: not recorded".
  - If the deployed prompt can't be fetched, the run fails rather than silently hashing `agents.md`. A deliberate `--policy-source agents.md` fallback may exist for offline demos, and it's recorded in the snapshot as `prompt_source: "agents.md (unverified)"`.
  - Snapshots are append-only; nothing updates or deletes them.
- **Done when:**
  - Every decision from both pipelines has a non-null `policy_version` with a matching snapshot.
  - Changing CloudNet's `budget_limit` from 15000 to 25000 gives a new version; INV-1006's snapshot still shows 15000.
  - The same policy hashes identically in pytest and vitest (shared fixture).
  - Bumping the `totals_match` check version changes the hash.
  - Editing a prompt in Foundry changes the hash (live check, tracked in KI-01).
  - A pre-F11 `erp.db` migrates with no rows lost.

### F12: Deterministic Budget, Duplicate & PO Checks · High · TBD

> 2026-11-04: added. Follows D-09: arithmetic and lookups belong in code.

**Owns:** `budget_limit`, `duplicate_check` and `po_present` computed in code in both pipelines, replacing the model's verdicts the same way F09 does.
**Not this feature:** `vendor_approved`, which needs fuzzy name matching and stays with the model for now · the decision rules (F13).

- **User story:** As a finance lead, I want "over budget", "duplicate" and "missing PO" to give the same answer every run, because they're comparisons, not judgement calls.
- **Constraints:**
  - The vendor match from the compliance agent (which `vendor_id` it matched) is an input; `budget_limit` uses that vendor's limit in exact cents.
  - `duplicate_check` compares vendor + total (cents) + PO against `auto_approved` / `flagged_for_review` invoices, as today (KI-11), and the invoice number once F19 exists.
- **Done when:** INV-1002, INV-1003 and INV-1006 fail their checks from code alone in both suites, with the model's reply saying the opposite.

### F13: Deterministic Approval Rules · High · TBD

> 2026-11-04: added.

**Owns:** the D-06 rules as a pure function in both pipelines (`decide(checks) → {decision, reason}`).
**Not this feature:** human overrides (F18).

- **User story:** As an auditor, I want the decision to follow mechanically from the checks, so the same checks always give the same decision.
- **Constraints:** the approval agent is either removed or kept only to word the `reason`; the decision itself comes from code and its version goes into the F11 policy.
- **Done when:** every combination of check results maps to the D-06 decision in a table-driven test in both suites.

---

## MED

### F14: Full Audit Payloads · Med · TBD

**Owns:** storing complete agent inputs and outputs (not 300-char summaries) with a content hash per row.
**Not this feature:** policy snapshots (F11).

- **User story:** As an auditor, I want to replay exactly what each agent was sent and what it returned.
- **Constraints:** summaries stay for the UI; full payloads go in a new column or table. Size is bounded by the invoice, so no truncation is needed.
- **Done when:** for any decision, the stored compliance input reproduces the same prompt byte for byte (KI-04 resolved).

### F15: Pipeline Parity Suite · Med · TBD

**Owns:** golden cases (agent replies in, rows out) run by both pytest and vitest.
**Not this feature:** changing either pipeline's behaviour; this feature only exposes differences.

- **User story:** As the team, we want to know the moment the Python and web pipelines disagree.
- **Done when:** the shared cases cover the 7 mock invoices, a failed agent call (KI-08) and a negative line item (KI-15), and both suites pass them.

### F16: Agent Retry & Error Handling · Med · TBD

**Owns:** one retry per failed or malformed agent call, as `agents.md` promises, and identical failure handling in both pipelines.
**Not this feature:** rollback rules (D-08), unless parity requires changing them.

- **User story:** As an operator, I want a transient Foundry error to cost one retry, not a failed invoice.
- **Done when:** a mocked agent that fails once then succeeds gives a normal decision in both suites; failing twice gives the same end state in both (KI-07, KI-08).

### F17: Exact Money Storage · Med · TBD

**Owns:** storing amounts as integer cents (or decimal text) in the schema, with a migration.
**Not this feature:** the totals arithmetic (F09), which is already exact.

- **User story:** As a finance reviewer, I want stored amounts to be exactly what the invoice says.
- **Done when:** a round trip of every mock amount through the DB is exact, and old `REAL` rows migrate (KI-06).

### F18: Human Review Queue · Med · TBD

**Owns:** approve / reject actions on `flagged_for_review` invoices from the drawer, recorded as a new decision row with reviewer, time and note.
**Not this feature:** who is allowed to review (F20).

- **User story:** As a reviewer, I want to clear a flagged invoice from the drawer and have my decision sit in the same audit trail as the agents'.
- **Done when:** a flagged invoice can be resolved in the UI and its drawer shows the agent decision, the human decision and both policy versions.

### F19: Invoice Number Extraction · Med · TBD

**Owns:** extracting the printed invoice number and storing it alongside the internal ID.
**Not this feature:** the duplicate rule itself (F12).

- **User story:** As a reviewer, I want live-submitted invoices to show their real number, and duplicates to be caught by it.
- **Done when:** a pasted INV-1003 is stored with its printed number and the ledger shows it (KI-10).

---

## LOW

### F20: Dashboard Auth & Roles · Low · TBD

**Owns:** sign-in for the dashboard and API, and reviewer vs viewer roles.
- **User story:** As an admin, I want only my team to submit invoices (each one costs agent calls) or resolve flags.
- **Done when:** unauthenticated requests to `/api/process-invoice` are refused (KI-13).

### F21: Vendor Master Editing with History · Low · TBD

**Owns:** editing vendors from the UI, with every change kept as a new version rather than an overwrite.
- **User story:** As a finance lead, I want to raise a vendor's budget limit without rewriting history.
- **Depends on F11,** so past decisions keep pointing at the old limit.

### F22: PDF & Image Invoice Ingestion · Low · TBD

**Owns:** turning PDF or image uploads into the raw text the extraction agent already reads.
- **User story:** As an operator, I want to drop in the invoice file I actually received.

---

## SCRAPPED

### F23: LLM Orchestrator Agent · Scrapped
- `agents.md` describes a fourth, LLM-driven orchestrator. The pipelines orchestrate in plain code instead (D-02).
- Sequencing, retries and DB writes have to be deterministic to be auditable.

### F24: LLM-computed line-item totals · Scrapped
- The extraction agent used to compute `totals_match`. Replaced by F09 (D-09).

---

## Changelog

- 2026-09-24: F01–F08 built (`459f9a9`). No PRD yet.
- 2026-11-04: PRD, DECISIONS and KNOWN_ISSUES created. F01–F08 recorded as Done from the code. **F09 Done** (PR #1, D-09). **F10 Done**: CI green on GitHub Actions (PR #1, D-11). **F11 Policy Version** added as the next High feature (D-13 Proposed), with F12–F22 as the backlog. F23 and F24 recorded as Scrapped.
