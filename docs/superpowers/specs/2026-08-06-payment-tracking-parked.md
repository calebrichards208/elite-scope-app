# Payment Tracking — Parked

**Date:** 2026-08-06
**Status:** Parked. Not a scope-app project. Revisit only if Sergey pushes.

Sergey asked to track the payment schedule and what customers have paid. This
note records why we stopped, so the reasoning does not have to be rebuilt.

## Current state, verified against the live account

- **Zero customer invoices in JobTread.** All 89 documents are Proposals, plus
  one Change Order. The entire AR side is unused.
- **Two payments recorded**, $10 and $236, both unattached to any document.
  Strays, almost certainly from the Rude Family sample job.
- **QuickBooks is not linked, and Sergey does not want it linked.** Olga
  (bookkeeper) invoices and reconciles in QuickBooks. That stays.

## How JobTread models this

- `createPayment` is **org-level** — `amount`, `paidAt`, `type`
  (`credit`/`debit`), `description`. It is not tied to a job.
- `createDocumentPayment` then links a payment to a document. `isLinkedToQbo`
  defaults to false, so payments can be recorded with no QuickBooks connection.
- No `amountPaid` or `balance` rollup exists on `job` or `document`. A
  paid/remaining figure would have to be summed from `documentPayments`.
- Invoices appear to require their own template (Caleb's read), so recording
  payments likely means creating invoice documents per milestone.
- **Payment schedules** live on the proposal as `scheduledDocuments`, taking
  either `percentage` or a flat `amount` per named milestone.

## The decision

**Do the payment schedule. Do not log payments.**

Caleb is editing the Proposal template to include the schedule, pending Sergey's
approval. A screenshot from 2026-08-06 shows it working with percentages
(25/35/30/10 on a $10,763.75 contract), with JobTread computing the dollar
amounts — so "every job is different" is handled without per-job math.

The schedule costs nothing ongoing: no process change, no new data entry, and it
prints terms on the document the customer signs. Logging actual payments is the
part that costs someone daily effort, and it was rejected.

## Why logging payments was rejected

Without a QuickBooks sync, "what's been paid" can only appear in JobTread if
someone types it there. Caleb's three objections, all sound:

1. **It opens the QuickBooks can of worms.** "Show me paid/remaining" is one
   step from "why doesn't this sync with QuickBooks" — a large project wearing a
   small project's clothes.
2. **The maintenance gets dropped.** Approving and logging payments is recurring
   manual work with no forcing function. It will be forgotten, and stale numbers
   are worse than no numbers.
3. **Invoices may diverge from the contract.** If Olga invoices an amount that
   differs from the schedule the customer signed, it manufactures a dispute that
   did not previously exist.

## Open item: the template contradicts itself

The Proposal template's Terms and Conditions currently read:

> "Down payment of at least 10% followed by either weekly progress payments or
> according to the progress of the job."

That directly contradicts a fixed 25/35/30/10 schedule printed above it. If the
schedule is adopted, this paragraph must be rewritten to point at the table
rather than state competing terms. This is the cheapest mitigation for risk 3.

Related: milestones should be agreed with Olga before going on a template, not
set by Sergey at the kitchen table.

## Interaction with change orders

An approved change order does **not** retroactively resize an existing payment
schedule. A $1,860 change order sits outside a 25/35/30/10 split and must be
billed separately. Normal, but Sergey will ask the first time it happens.

## If this is revisited

Two questions were never answered, both about five minutes of clicking in
JobTread rather than API work:

1. Can a payment be applied directly to a **Proposal** (`customerOrder`), or
   does JobTread require a `customerInvoice` to apply it to?
2. Does the customer portal surface paid/remaining without extra setup?

If it is ever built, the scope app should at most *display* a read-only
`Contract / Paid / Remaining` line. Payment entry belongs to Alina/Olga on a
desktop, not in Sergey's voice-to-scope tool — the app has to stay handoff-able
per `PROJECT_BRIEF.md`.
