# Employee-as-customer cleanup (TCSS) — 2026-10-11  ✅ COMPLETE

## Background
The legacy CRM required every work entity to be an "account," so each employee was
created as a **customer** record named `<Person> / TCSS`. ProBid now has a proper,
separate Team roster (20 people) plus a vehicle/fleet module, so employees no longer
need to exist in the customer list. These leftover accounts were showing up in the
Work Order / quote customer pickers (searching "TCSS" surfaced them), which is what
prompted the cleanup.

## Scope (verified against Supabase, the source of truth)
- **31** employee-as-customer accounts matching `<Person> / TCSS`
  (regex `name ~* '/\s*/?\s*TCSS\s*$' and name !~* '^\s*TCSS'`).
- The real company accounts — **TCSS**, **TCSS Stock Orders**, the **TCSS Equipment #**
  and **TCSS Trailer #** accounts, etc. (17 total) — were EXCLUDED and untouched.
- References across the whole system: **0** invoices, **0** quotes, **0** jobs,
  **0** recurring contracts; **10** contacts (employees-as-contacts under their own
  accounts); **2** work orders — `102876` (Matthew Small, Completed) and
  `WO-1013` (Alejandro Tzintzun-Ramirez, Void). Checking Supabase surfaced the 2nd WO
  that the browser working-set didn't have.

## Backup (taken BEFORE any change)
`TCSS_employee-account_backup_2026-10-11.json` — full authoritative rows for all 31
customers, 10 contacts, and both work orders. Saved to the owner's Downloads + delivered.

## What was done (all reversible)
1. Re-pointed WOs `102876` and `WO-1013` onto the TCSS internal account
   (`7570d553-c702-4314-b04e-3e65cb35eb33`); original tech name preserved in each WO's
   internal notes.
2. Soft-deleted the 10 contacts.
3. Soft-deleted the 31 employee-as-customer accounts.

Soft-delete = `is_active=false` (+ `deleted_at`/`deleted_by`): rows retained, shown in the
Recycle Bin, restorable by an owner/manager. App pulls filter `is_active=true`, so they drop
out of all pickers.

## How it was executed (important for next time)
Raw SQL **cannot** soft-delete these: the trigger `guard_isactive_softdelete()` rejects any
`is_active` change not made through the authorized RPCs by a logged-in user with the right
role (SQL editor runs as "role (none)" → `ERROR 42501`). Intentional protection.

So the archive ran through the app's own RPCs (`soft_delete_customer` / `soft_delete_contact`)
**as the owner**, via a one-time script pasted into the ProBid browser console
(`employee-account-cleanup-RUN-IN-BROWSER.js`), followed by a hard-refresh.
(Claude's own writes — admin SQL and in-app JS — were gated by the session safety mode, so
the owner ran the authorized path; verification was read-only.)

## Verification (live, post-change)
- Supabase: customers_archived=31, customers_active=0, wos_on_tcss=2, contacts_archived=10.
- Live app after fresh load: 0 employee accounts in the customer list; 17 real TCSS company
  accounts present; total customers 1921 → 1890 (exactly 31 removed).
- Customer picker typing "TCSS" now returns only company accounts — no employee names.

## Status
- [x] Analysis + reference mapping
- [x] Backup taken + delivered
- [x] WOs re-pointed (102876, WO-1013 → TCSS)
- [x] 10 contacts + 31 accounts archived via authorized RPCs
- [x] Verified live (Supabase + app picker)

## Undo (if ever needed)
Restore from the Recycle Bin, or:
`update customers set is_active=true, deleted_at=null, deleted_by=null where name ~* '/\s*/?\s*TCSS\s*$' and name !~* '^\s*TCSS';`
(and the analogous contacts update) — run as owner via the app path, not raw SQL. WO re-points
are reversible from the JSON backup.
