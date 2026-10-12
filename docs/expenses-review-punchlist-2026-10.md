# Expenses Review — v2 punch list + outcome (2026-10)

v2 shipped and verified live (builds iv → iw). Status after each item.

## CRITICAL — correctness — DONE
1. **1,000-row load cap → FIXED.** `loadAllExpenses` now pages through ALL rows with
   `.range()`. Verified: loads all 8,282; counts correct.
2. **Stale statuses → FIXED** (see data-safety note below).

## DATA SAFETY — caught during the live click-through, FIXED (build iw)
The v2 page was dumping all ~8k expenses into the app's shared `DB.woExpenses`. The app's
full sync (`pushAllToCloud`) re-uploads that array, so a stale load risked clobbering the
cloud. Cloud never actually got clobbered (verified held at 1 pending), partly because
`pushAllToCloud`'s expense upsert does NOT write the review columns (`review_status`,
`reviewed_by`, `reimbursed`, …) — so those are safe from the full push regardless.
**Fix:** the review page now keeps its OWN snapshot (`_expRows`), separate from
`DB.woExpenses`, and writes changes ONE ROW AT A TIME via `_pushWOExpenseToCloud` — it
never calls `saveDB()`/the full sync. Also fixed the stale-count display race (page showed
1,739 pending from old localStorage; now shows cloud truth = 1).
Verified live: approve→cloud shows 1 row changed (pending 1→0), revert→back to 1; waited
past the 2s sync window — cloud stable at 1 pending / 8,281 approved, no clobber.

## HIGH — reviewer workflow — DONE (verified live, build iv/iw)
3. Opens on the **Pending** queue; clickable summary tiles + SHOW chips switch views. ✓
4. **Sort by column** (Amount/Date/Person/Category/Status). Verified sort-by-amount surfaced
   the biggest charges first. ✓
5. **Bulk** select → Approve / Flag selected; select-all. ✓
6. **Person filter: multi-select + clear**, sourced from the ACTIVE 20-person roster, with a
   "former/historical names (34)" toggle. Verified: chip + filter work. ✓
7. **Flag UX**: in-app flag box (no more `window.prompt`); flag reason shown INLINE. ✓

## MEDIUM/LOW — DONE in v2
- Date presets (This week / month / Last month / All dates). ✓
- Quick views: Flagged / Approved / Needs reimbursement / **Missing receipt** (⚠ marker on
  rows with no receipt). ✓
- Right-aligned Amount; search matches amounts; Export CSV with row count toast. ✓

## Still open (follow-ups, not blocking)
- Per-person / per-category subtotals.
- Inline edit of amount/category (currently open the WO to fix).
- Upload a receipt from the review page.
- One-time tidy: this browser's localStorage still holds ~8,284 expenses in `DB.woExpenses`
  from pre-fix testing — harmless (full push doesn't write review cols), clears on its own
  over normal use; other users/browsers are unaffected (normal lazy-load).
- Name-hygiene: `logged_by` mismatches vs roster (Ernie/Ernest, Lammonds/Lamonds, Chris/
  Christopher) — normalize old records if person-filtering history needs to be complete.

Version flow: ir → is → it → iu (search focus) → iv (v2 features) → iw (data-safety fix).
