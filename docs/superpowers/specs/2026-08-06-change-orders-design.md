# Change Orders — Design

**Date:** 2026-08-06
**Status:** Approved, ready for implementation planning

## Problem

The app lets Sergey build pre-signing scope revisions (`Exhibit A`, `B`, `C`).
It has no way to add scope *after* the contract is signed.

Per Alina, the distinction is signing:

- **Addendum / Exhibit** — pre-signing. Sergey may build two or three before
  landing on the contract he signs.
- **Change Order** — post-signing. Additional scope on a job already underway,
  issued as its own simple document.

## Facts established against the live JobTread account

These were verified via the Pave API, not assumed. They constrain the design.

1. **JobTread has no native change-order type.** `documentType` is only
   `bidRequest | customerOrder | customerInvoice | vendorOrder | vendorBill`.
   A change order is a `customerOrder` — the same type as a Proposal. The
   difference is entirely the template.

2. **A stock Change Order template already exists** (`22PEaNuVctbg`):
   `customerOrder`, `includeInBudget: true`, `requireSignature: true`,
   `showQuantity: false`, `showChildCosts: false`. Its footer already carries
   the correct post-signing terms:

   > "This Change Order constitutes a formal amendment to the existing contract.
   > The total amount of this Change Order is *in addition to the original
   > contract price* and any previously approved change orders. This change may
   > extend the project schedule. All other terms and conditions of the original
   > Agreement remain in full force and effect."

3. **The app never creates documents.** `submitToJobTread()` creates a cost
   group on the job budget and writes scope lines into it, then tells Sergey to
   open JobTread to generate the proposal. The customer-facing document is built
   by hand. This design keeps that division.

4. **Documents copy cost items; they do not reference them.** `createCostGroup`
   accepts either a `jobId` or a `documentId`, never both. When a document is
   built from a budget group, JobTread writes a second copy owned by the
   document. Theresa Wilson has two `Exhibit A` groups — one with
   `document: null`, one with `document: {Proposal}`.

5. **The duplicate does not double-count the budget.** Filtering the job's cost
   items to `document == null` returns exactly the contract price ($19,879 on
   Theresa Wilson vs. a raw sum of $39,758). Confirmed visually: the JobTread
   budget view shows one `Exhibit A`, not two.

6. **`positionAfter` accepts a cost item**, not just a cost group:
   `{type: "costGroup" | "costItem", id}`. `NOTES` is a top-level cost *item*
   in Elite's data (`costGroup: null`), so a cost group can be positioned
   directly beneath it.

## Design

### 1. Structure — flat, not nested

```
Exhibit A
Exhibit B
NOTES
Change Order 1        ← top-level, positionAfter the NOTES cost item
Change Order 2        ← positionAfter Change Order 1
```

Cost groups are top-level (`parentCostGroupId: null`). Scope lines are cost
items inside `Change Order N`, with the lump sum and `isTaxable` on the last
line — identical to the existing Exhibit write path.

JobTread's own sample data nests these under a parent `Change Orders` group.
**We deliberately do not.** Reasons:

- **Document building is safer flat.** With nesting, selecting the parent
  `Change Orders` would pull *every* change order into one document. Each change
  order needs its own signature, so that selection must be impossible to make.
  Flat means one group = one document.
- **Sergey builds these himself, on a phone.** Nesting adds a level he has to
  get right in the field.
- **It reuses the proven code path.** Same top-level `createCostGroup` +
  `positionAfter` call the app already makes. Nesting would require
  `parentCostGroupId` plus lazy parent creation — a branch that runs once per
  job, which is where bugs hide.

Naming is `Change Order 1` (title case, no `#`), matching `Exhibit A`.

### 2. Numbering

Next number = scan the job's **budget** cost groups, match
`/^Change Order (\d+)$/`, take max + 1. Mirrors `nextExhibitLetter()`.

**The scan must filter `document == null`.** After Alina builds the change order
document, a second `Change Order 1` group exists owned by that document. Without
the filter the app can number off a document's copy.

The existing exhibit scan (`index.html:1465`) does not filter this. It survives
by accident — it keys its map by letter, so duplicates collapse. Add the filter
to both paths rather than rely on that.

### 3. Mode detection

On job select, check whether any `customerOrder` document on the job has
`status: "approved"`. Observed statuses: `draft | pending | approved | denied`.

- approved exists → **change-order mode**
- otherwise → **exhibit mode**

This uses the signing event itself, which is Alina's actual definition. It was
chosen over reading the Pipeline Stage field specifically because stage-based
logic depends on a human moving a card — the failure mode that broke the
GoHighLevel → JobTread sync stage.

**The banner is tappable to override.** Detection fails in one known direction:
Sergey collects a signature in the field before Alina marks the document
approved, and gets exhibit mode.

### 4. UI

Same three-step flow, no new screens. Only strings change:

|        | Exhibit mode                              | Change-order mode                            |
| ------ | ----------------------------------------- | -------------------------------------------- |
| Banner | `Creating Exhibit C`                      | `Contract signed · Creating Change Order 2`   |
| Button | `Post Exhibit to JobTread`                | `Post Change Order to JobTread`               |
| Toast  | `…Open JobTread to generate the proposal.`| `…Open JobTread to send the change order.`    |

Per-job draft storage must record the mode. Otherwise a change-order draft
reappears as an exhibit after a refresh.

### 5. Notes

Change orders write **no NOTES item**, and the job-level `NOTES` item is left
untouched.

The standard boilerplate includes "Price is subject to change if not accepted
within 15 days of bid date" — a bid term that is wrong post-signing. Rather than
write a second boilerplate block, the change order relies on the template footer
(fact 2), which already states the correct terms. Editing the job-level NOTES
would also retroactively alter notes attached to a signed contract.

### 6. Template settings

Leave the stock Change Order template as-is. All four relevant settings are
already correct:

- **`includeInBudget: true`** — keep on. Approved change-order dollars should
  raise the job's contract value. Off makes the job look over budget once the
  extra costs land.
- **`requireSignature: true`** — the entire point of a post-signing document.
- **`showQuantity: false`** — matches the lump-sum style.
- **`showChildCosts: false`** — does not expose cost to the customer.

If Elite branding is wanted, duplicate the template as was done for Proposal
(`22PVEkn2ERDb`) rather than editing the stock one.

### 7. What stays manual

Alina creates the Change Order document in JobTread, selects the
`Change Order N` group, and sends it for signature — the same habit that already
works for proposals.

## Risks

- **Never run end-to-end.** No real change order has been issued from this
  account. Budget behavior of an approved change order is reasoned from the
  schema, not observed. `PROJECT_BRIEF.md` explicitly says not to add
  change-order UI until Sergey has been watched doing one. Consider running one
  manually in JobTread before building.
- **Mode detection depends on document status hygiene.** If proposals are never
  marked approved, no job ever enters change-order mode. The override covers
  this, but it is worth checking that approved status is actually being set.

## Out of scope

Payment tracking — see `2026-08-06-payment-tracking-parked.md`.
