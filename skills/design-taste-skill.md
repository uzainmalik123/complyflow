# Design Taste — Instructions for the Build Agent

Paste this alongside `design.md` when prompting whatever AI tool builds
the UI. `design.md` is the specific brief for ComplyFlow; this file is
general taste guidance so the output doesn't drift into generic
AI-generated patterns.

## Ground everything in the subject

Don't design a generic dashboard and skin it with the ComplyFlow colors
afterward. Every layout and type choice should come from the actual
subject matter — invoices, audits, ledgers, compliance decisions — not
from "what a SaaS admin panel usually looks like." If a choice in
`design.md` seems arbitrary, ask why it's there before overriding it;
it's tied to the ledger/case-file concept on purpose.

## Avoid these — they are the default AI-generated tells, not choices

- A warm cream background with a terracotta/clay accent (`#D97757`-ish) —
  this is the single most overused AI-generated palette right now.
- Pure near-black backgrounds (`#0B0B0B`, `#111`) with one neon accent.
- The "SaaS-card kit": everything chopped into identical rounded cards
  with the same soft grey drop-shadow and one border-radius applied
  everywhere regardless of what the content actually is.
- Tracked-out ALL-CAPS eyebrow labels above every heading.
- Meta text joined with middle dots ("A · B · C") or em-dashes
  ("WORD — fragment").
- A "→" tacked onto every button/link label.
- Monospace used only for tiny data labels as a decorative flourish —
  in this project monospace has a real job (see `design.md`), not a
  decorative one.
- Fade-and-slide-up entrance animation on every section, hover-lift on
  every card. Motion should be rare and mean something (see "One motion
  moment" in `design.md`).

## Typography rules

- Two type families max, with clearly distinct roles (already specified
  in `design.md`: IBM Plex Sans for UI, IBM Plex Mono for all numbers/
  data). Don't introduce a third family.
- Don't bold/italicize/recolor a single word inside a heading for
  emphasis — a common AI tic. If something needs emphasis, that's a
  layout or hierarchy decision, not a mid-sentence styling one.
- Line length under ~80 characters for any prose.

## Structure carries meaning

Borders, dividers, numbering, and badges should encode real information,
not decorate. In this project: hairline rules separate ledger rows
because rows ARE a sequence of records; stamps are bordered rectangles
because a stamp is a literal physical metaphor being used on purpose —
don't "soften" it into a rounded pill because that's the default
component in whatever UI kit is being used.

## Process

1. Read `design.md` fully before writing any code.
2. Build the ledger table and detail drawer first — those two views ARE
   the product. Get those right before touching anything else (settings,
   extra nav items, empty states).
3. After building, self-check against the "Avoid these" list above. If
   anything on that list crept in, fix it before calling the UI done.
4. Keep it responsive and keyboard-accessible by default — this isn't
   optional polish, it's baseline quality.

## One-line summary if you need to compress this to a short prompt

"Build this as a paper-ledger / case-file registry, not a SaaS
dashboard — hairline rules not card shadows, monospace numbers
right-aligned, status shown as bordered stamps not colored pills, one
motion moment only (the detail drawer), no cream+terracotta or
neon-on-black defaults."
