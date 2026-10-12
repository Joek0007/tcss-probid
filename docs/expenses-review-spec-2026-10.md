# Expenses Review page — spec (2026-10)

## Why
Office needs to review expenses techs log, flag off-policy ones (unapproved food,
unapproved tool buys) up to owners/managers, and track reimbursement when a purchase
wasn't on a TCSS card. Today expenses are only visible inside each work order — there
is no central list, no review status, and no reimbursed tracking.

## What already exists (build on this)
- `wo_expenses` rows per WO: category, description, amount, payment_type, expense_date,
  logged_by, receipt (url/doc), created_at. Targeted cloud push (`_pushWOExpenseToCloud`),
  on-demand load (`ensureWOExpensesLoaded`). Flows into `createWOInvoice`.
- Payment types already separate company-paid vs employee-paid:
  Company Credit Card / Company Gas Card / Billed to Company Account / **Employee Paid Cash**
  (the reimbursable bucket).
- Categories already include **Meals** and **Equipment Purchase** (the two flagged cases).
- `addNotification(...)` exists for pinging the office/owner.

## Decisions (Joe, 2026-10)
- **Post-hoc review** (no pre-approval gate).
- **Anyone in the office** (back_office, manager, owner) can approve/flag.
- **Reimbursement = simple** paid/not-paid + date.

## Schema change (additive, to `wo_expenses`) — APPLIED
- `review_status` text default 'pending'   -- pending | approved | flagged
- `review_note`   text                      -- note shown to owner when flagged
- `reviewed_by`   text                      -- who acted
- `reviewed_at`   timestamptz
- `reimbursed`    boolean default false      -- only meaningful for Employee Paid Cash
- `reimbursed_at` date

App-side expense object gained: reviewStatus, reviewNote, reviewedBy, reviewedAt,
reimbursed, reimbursedAt. Wired into `_pushWOExpenseToCloud` upsert + the load mappings in
`ensureWOExpensesLoaded` / `ensureWOExpensesForIds` + addWOExpense defaults.

## The page — SHIPPED (js/expenses.js)
Nav item "Expenses" in the Billing group, gated by `page.expenses`
(owner/manager/back_office on; field techs off — see PERM_DEFS in dispatch.js).
`renderExpensesPage()` wired into goPage; `loadAllExpenses()` pulls the whole
`wo_expenses` table into DB.woExpenses (merge, not clobber).
- Columns: date, logged_by, category, description, amount, payment type, WO# + customer
  (click-through), receipt link, review-status chip, reimbursed chip.
- Filters: date range, person, payment type, category, status, text search, and a
  "Needs reimbursement" toggle (Employee Paid Cash AND not reimbursed).
- Totals bar: $ + count shown, # pending, # flagged, **$ owed for reimbursement**.
- Row actions (any office role): Approve · Flag (prompts a note → sets flagged +
  addNotification to owners) · Clear flag · Mark reimbursed (date=today). Each persists
  via `_pushWOExpenseToCloud` (same reliable targeted path as every other expense write).
- Export CSV (filtered set).
- **Perf:** table caps at the 400 most recent matching rows with a banner; totals and
  filters still operate on the full set. Needed because live data is ~8,282 expenses.

## Verification (live, build `it`)
- Page loads 8,282 real expenses; renders 400 with the cap banner; totals cover all.
- Flag → `review_status='flagged'`, note + reviewer persisted to cloud; owner
  notification fires ("🚩 Expense Flagged — WO-1015"). Mark reimbursed →
  `reimbursed=true` + date persisted. Test row reverted to original; no real data changed,
  no real notification sent.
- Dawn Brown's expenses appear immediately — solved the original "how do I see them".

## Status
SHIPPED & verified 2026-10. Version token flow: `ir` → `is` (page + schema wiring) →
`it` (400-row render cap). Schema applied in Supabase.

## Possible follow-ups (not built)
- Default the page to a recent window (e.g. last 90 days) or add paging instead of the
  flat 400 cap, if the office wants to scroll deeper without filtering.
- "Billed vs unbilled" flag (whether an expense made it onto an invoice) at close-out.
- Receipt thumbnail preview inline (currently a 🧾 link that opens the stored file).
