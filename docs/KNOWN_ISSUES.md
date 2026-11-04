# ComplyFlow: Known Issues

> Open risks, unknowns and problems, worked through one at a time. Take the highest-severity issue that blocks the next TBD feature in [PRD.md](PRD.md).
> **Severity:** `Blocker` (a decision can't be trusted or the demo breaks) · `Major` (hurts auditability or correctness) · `Minor`
> **Status:** `Open` · `Investigating` · `Resolved` (add the date and what fixed it) · `Accepted` (we live with it)
> Add new issues at the bottom with the next ID. Don't delete resolved ones.
>
> KI-01 to KI-15 were found on 2026-11-04 while reviewing the code for PR #1 and the policy-version question. Each one was checked against the code at that point.

| ID | Issue | Severity | Blocks | Status |
|---|---|---|---|---|
| KI-01 | Deployed Foundry prompts aren't versioned or checked against `agents.md`; they still have the pre-PR #1 text | Major | F11, demo | Open |
| KI-02 | No decision records which policy produced it | Blocker | F11 | Open |
| KI-03 | Vendor rows (limits, approval) are edited in place, so past decisions lose the limit they were judged against | Major | F11, F21 | Open |
| KI-04 | Audit summaries are cut to 300 characters; agent inputs can't be reconstructed | Major | F14 | Open |
| KI-05 | `budget_limit`, `duplicate_check`, `po_present`, `vendor_approved` and the decision itself are still decided by the model | Major | F12, F13 | Open |
| KI-06 | Amounts are stored as SQLite `REAL` and parsed as JS `Number` | Minor | F17 | Open |
| KI-07 | `agents.md` promises "retry once"; neither pipeline retries | Minor | F16 | Open |
| KI-08 | The pipelines leave different DB state on failure (CLI: partial rows + `error`; web: nothing) | Minor | F15, F16 | Open |
| KI-09 | The CLI doesn't write `invoice_line_items`; the drawer falls back to `mock_invoices.json` for seeded invoices | Minor | F15 | Open |
| KI-10 | The printed invoice number isn't extracted; live invoices get `INV-<timestamp>` | Minor | F19, F12 | Open |
| KI-11 | `duplicate_check` only compares against approved or flagged invoices, not rejected or in-flight ones | Minor | F12 | Accepted |
| KI-12 | An invoice with no extractable line items or total now fails `totals_match` and is flagged | Minor | F09 | Accepted |
| KI-13 | No auth on the dashboard or `/api/process-invoice`; PRs get a Vercel preview deploy | Major | F20, any deploy | Open |
| KI-14 | The CLI doesn't validate agent replies the way the web pipeline does | Minor | F15 | Open |
| KI-15 | Python and TS round negative half-cents differently in the totals check | Minor | F15 | Open |

---

### KI-01: Deployed Foundry prompts aren't versioned · Major · Open
- **Problem:** the prompts that actually run live in Foundry (D-01). `agents.md` is a hand-kept copy. PR #1 changed the extraction and compliance prompts in `agents.md` (D-09), but the deployed agents still ask for `totals_match`.
- **Why it matters:** nothing tells you which prompt text produced a decision, and the copy in git can be wrong without anyone noticing. F11 can't hash "the policy" until it can read the deployed one.
- **Next action:**
  1. Paste the updated prompts from `agents.md` into the three Foundry agents.
  2. Find out what the Foundry API returns for an agent: its instructions, a version ID, the model deployment. Note whether a response says which agent version served it.
  3. Record the answer in D-13 and move it to `Accepted` or revise it.

### KI-02: No decision records which policy produced it · Blocker · Open
- **Problem:** `decisions` has `decision`, `reason` and `decided_at` only.
- **Why it matters:** an auditor asking "why was INV-1006 rejected, and under which rules?" gets an answer only while nothing has changed since. This is the main gap for a compliance product.
- **Fix:** F11 (D-13).

### KI-03: Vendor rows are edited in place · Major · Open
- **Problem:** `budget_limit` and `is_approved` are plain columns. Raising CloudNet's limit from 15000 to 25000 overwrites it.
- **Why it matters:** INV-1006's reason still says it exceeded the budget, but the limit it was measured against is gone. The audit log has only the first 300 characters of the compliance input (KI-04), so it isn't there either.
- **Fix:** F11 snapshots the vendor rows per decision; F21 keeps vendor history.

### KI-04: Audit summaries are truncated · Major · Open
- **Problem:** `log_audit` and `summarize` cut input and output to 300 characters (D-05). The compliance input is a JSON blob of the invoice, vendor list and processed invoices, so it's nearly always cut.
- **Why it matters:** you can see *that* the compliance agent was called, not exactly *what* it was shown.
- **Fix:** F14.

### KI-05: Most checks and the decision are still the model's · Major · Open
- **Problem:** after F09, only `totals_match` is computed in code. Budget comparisons, duplicate matching, PO presence and applying the D-06 rules are still done by LLMs.
- **Why it matters:** these are comparisons and lookups. Run the same invoice twice and the model may answer differently; that's a weak basis for "auto-approved".
- **Next action:** F12, then F13. `vendor_approved` stays with the model because the fuzzy name match ("CloudNet Hosting Services" = "CloudNet Hosting") is real judgement; its matched `vendor_id` becomes an input to the code checks.

### KI-06: Amounts are stored as floats · Minor · Open
- **Problem:** `total_amount`, `unit_price` and `total` are `REAL`.
- **Why it matters:** the totals check is exact (it converts to cents or `Decimal` first), but stored values like `3499.99` aren't exactly representable, and anything that compares stored floats directly can be off.
- **Fix:** F17.

### KI-07: Retry-once isn't implemented · Minor · Open
- **Problem:** the orchestrator section of `agents.md` says to retry a failed or malformed agent call once. `orchestrator.py` marks the invoice `error` on the first exception; `pipeline.ts` rolls back and reports the error.
- **Fix:** F16.

### KI-08: Pipelines leave different state on failure · Minor · Open
- **Problem:** D-08. On a compliance failure the CLI leaves the invoice row, the extraction audit row and status `error`; the web pipeline deletes everything.
- **Why it matters:** the same failure looks different depending on which front-end ran it, and the CLI's partial trail has no decision.
- **Next action:** cover it in F15's golden cases, then decide in F16 whether to unify.

### KI-09: The CLI doesn't store line items · Minor · Open
- **Problem:** only the web pipeline writes `invoice_line_items`. For seeded invoices processed by the CLI, the drawer reads line items from `mock_invoices.json` (`COMPLYFLOW_MOCK_DATA_PATH`), not from what the agent extracted.
- **Why it matters:** the drawer can show line items the pipeline never saw, which matters once F09's check is the thing being audited.
- **Next action:** have the CLI write extracted line items too (F15 parity).

### KI-10: Invoice number isn't extracted · Minor · Open
- **Problem:** the extraction prompt asks for vendor, dates, total, PO and line items, not the invoice number. The web pipeline assigns `INV-<Date.now()>`.
- **Why it matters:** the ledger shows an internal ID instead of the vendor's number, and duplicate detection can't use the most obvious key.
- **Fix:** F19.

### KI-11: Duplicate scope is approved and flagged invoices only · Minor · Accepted
- **Problem:** `already_processed_invoices` contains only `auto_approved` and `flagged_for_review` rows. A resubmission of a rejected invoice isn't a "duplicate", and neither is an invoice still in flight in the same batch.
- **Why accepted:** a rejected invoice resubmitted unchanged is rejected again by the check that failed it first. Revisit in F12, when the rule moves to code.

### KI-12: Missing line items now flag the invoice · Minor · Accepted
- **Problem:** since F09, an invoice where extraction finds no line items or no total fails `totals_match` ("could not be verified") and is flagged for review. Before, the model could pass it.
- **Why accepted:** an invoice whose total can't be checked shouldn't be auto-approved. Watch for single-line invoices the model extracts without line items; if that happens often, fix the prompt rather than the rule.

### KI-13: No auth, and PRs deploy a preview · Major · Open
- **Problem:** the dashboard and `POST /api/process-invoice` have no sign-in. Vercel builds a preview of each PR (seen on PR #1).
- **Why it matters:** if a deployed instance can reach Foundry, anyone with the URL can submit invoices, spending agent calls and writing to the DB. Whether the Vercel preview can actually reach Foundry or a writable `erp.db` is unverified.
- **Next action:** check what the preview does on submit. Until F20, keep deployments private (Vercel deployment protection) or with no Foundry credentials.

### KI-14: The CLI doesn't validate agent replies · Minor · Open
- **Problem:** `pipeline.ts` checks that extraction is an object, compliance is a list, and the decision is one of three values with a non-empty reason (`toRecord`, `toChecks`, `toDecision`). `orchestrator.py` only parses JSON; an unknown decision string is written as the invoice status, and a non-list compliance reply fails with an unrelated `AttributeError`.
- **Next action:** port the same validation to Python as part of F15.

### KI-15: Negative half-cent rounding differs between pipelines · Minor · Open
- **Problem:** in the totals check, Python uses `ROUND_HALF_UP` (away from zero: −0.005 → −0.01) and TS uses `Math.round` (towards +∞: −0.5 cents → −0). A credit-note line with a fractional-cent `quantity × unit_price` could pass in one pipeline and fail in the other.
- **Why it matters:** rare, but it's exactly the kind of one-cent difference F09 exists to get right.
- **Next action:** round half away from zero in TS too (`Math.sign(x) * Math.round(Math.abs(x))`), and add a negative-line case to F15's shared fixture.
