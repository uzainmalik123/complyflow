# ComplyFlow — Design Brief

## Subject

ComplyFlow processes enterprise invoices through a chain of AI agents
(Extraction → Compliance → Approval) and produces an auditable decision
trail. The people who'd actually use something like this are AP/finance
ops staff and compliance reviewers — people who work with case files,
ledgers, and audit trails all day. This is not a consumer SaaS product;
it's closer to a registry or records office than a startup dashboard.

**Design concept: the digital ledger / case file.** Every invoice is a
case file moving through a registry. A decision isn't a colored pill —
it's a stamp on the file. The audit log isn't a notification feed — it's
a chain of custody.

## Color

Paper-and-ink palette, not SaaS-card colors. No pure black, no cream +
terracotta (the generic AI-default combo).

| Token         | Hex       | Use                                          |
|---------------|-----------|-----------------------------------------------|
| `paper`       | `#EDEAE1` | Page background — manila/ledger paper tone    |
| `ink`         | `#201D1A` | Primary text — warm near-black, not pure #000 |
| `ledger-line` | `#C9C2B3` | Hairline dividers, table rules, borders       |
| `brass`       | `#8C6D28` | Primary accent — links, active states, focus  |
| `stamp-green` | `#3F6B4F` | Approved status only                          |
| `stamp-red`   | `#A23E2E` | Rejected status only                          |
| `stamp-amber` | `#B8862F` | Flagged-for-review status only                |

Status colors are used ONLY on stamps/decision marks — never as decorative
accents elsewhere. `brass` is the only interactive accent color.

## Type

Two families, clearly distinct roles — no default system-ui/Inter stack:

- **IBM Plex Sans** — all UI chrome: headers, labels, buttons, nav. Weights
  500/600 for headings, 400 for body. Chosen because Plex has an
  institutional, documentation-grade character that fits a records-office
  feel without going cold.
- **IBM Plex Mono** — every number: invoice IDs, amounts, dates,
  timestamps, vendor IDs. Ledger data is always monospace and
  right-aligned when tabular. This is the single most important type
  decision in the brief — it's what makes rows read like a ledger instead
  of a card list.

Line length under 80 characters for any paragraph text (there won't be
much — this is a data-dense interface, not an editorial one).

## Layout

```
+------------------------------------------------------------------+
| COMPLYFLOW                                    [search invoices]  |
+------------+-------------------------------------------------------+
|            | STATUS  INVOICE    VENDOR                  AMOUNT    |
| Registry   | -----------------------------------------------------|
| Flagged    | [APPRV] INV-1001   Acme Office Supplies    $2,700.00  |
| Rejected   | [REJCT] INV-1002   CloudNet Hosting Serv.  $8,500.00  |
| All        | [REJCT] INV-1003   Acme Office Supplies    $2,700.00  |
|            | [FLAG ] INV-1007   Bright Legal Partners   $3,499.99  |
|            | ...                                                   |
+------------+-------------------------------------------------------+
```

- Left rail: thin, quiet navigation by status (Registry / Flagged /
  Rejected / All) — plain text links, no icons-as-decoration, active
  item marked with a `brass` left-border tick, not a filled pill.
- Main area: the ledger table. Rows separated by hairline `ledger-line`
  rules, no shadows, no rounded cards. Status shown as a small stamped
  badge — rectangular, thin border in the status color, slightly
  uppercase text, NOT a soft rounded pill.
- Clicking a row opens a **detail drawer** (slides in from the right,
  the one deliberate motion moment in the whole UI) showing:
  - the invoice's extracted fields
  - the 5 compliance checks as a vertical list, each with a pass/fail
    mark and its `detail` reasoning text
  - the full audit trail (`agent_audit_log` rows for that invoice) laid
    out as a simple chronological chain: agent name → action → timestamp
- Alignment: left-aligned throughout. No centered hero, no marketing
  language — this is a working tool, not a landing page.

## Principles

1. **Numbers are always monospace, right-aligned in tables.** This one
   rule does more to sell the "ledger" feeling than anything else.
2. **Decisions are stamps, not pills.** Rectangular, bordered, slightly
   uppercase, status-colored border and text on a paper background — not
   a filled rounded badge.
3. **One motion moment:** the detail drawer slide-in. Nothing else
   animates. No hover-lift on rows, no fade-in-on-scroll.
4. **No card-kit.** Sections are divided by hairline rules on the paper
   background, not by white rounded boxes with soft shadows.
5. **The audit trail is the hero feature.** When judges/reviewers open a
   flagged or rejected invoice, the chain-of-custody trail should be the
   most visually clear, well-laid-out part of the whole UI — it's the
   "production-grade, enterprise-scale" proof point for this project.
6. Empty states and errors are written plainly, in the interface's own
   voice ("No invoices in this view yet" — not "Oops! Nothing here 👀").
