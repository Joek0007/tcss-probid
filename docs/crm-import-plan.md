# CRM Data Import — plan & handoff

**Status:** **Phase 1 (Customers + Contacts) COMPLETE and field-by-field CERTIFIED (2026-09-15).** Phase 2 (history) not started.
**Last updated:** 2026-09-15.

## Goal
Migrate Joe's data out of his **existing CRM** (Leverage / crmsoftwarecloud.com) and into ProBid.
Scope: **Customers, Contacts, AND history (quotes / jobs / invoices).** Phased: Phase 1 = Customers +
Contacts; Phase 2 = history.

## ✅ Phase 1 — Customers + Contacts — DONE & CERTIFIED (2026-09-15)
Loaded the full active/real customer + contact set from the legacy CRM into the ProBid Supabase DB
(project `jzvoksidbelxibzbizvi`) and certified every row field-by-field against the source of truth.

- **Loaded:** **1,818 customers** and **2,410 contacts** (import_batch `legacy-2026-09`,
  created_by `0fd5c637-…`). Every row idempotent (`on conflict (id) do nothing`), so re-runs are safe.
- **Reversible:** everything tagged `import_batch='legacy-2026-09'` — the whole import can be removed
  with a single delete on that tag without touching Joe's 42 pre-existing customers / 43 pre-existing
  contacts.
- **Totals now in DB:** customers 1,860 (1,818 imported + 42 pre-existing; 1,852 active, 8 inactive);
  contacts 2,453 (2,410 imported + 43 pre-existing). Customer `type`='Customer' for all imported rows.
- **Invoicing rule honored:** the CRM "Invoicing Orders" contact email was written to each customer's
  `invoicing_email` (+ `invoicing_contact`) and kept OUT of the contacts list, per Joe's instruction.
- **Pre-import backup:** `scratchpad/backup/probid_customers_contacts_backup_2026-09-15.json`
  (the 42 customers + 43 contacts that existed before the import), delivered to Joe.

### Certification (the "solidness" guarantee)
After loading, exported all imported rows back from the DB and ran a **bidirectional, field-by-field
diff against the source file** (`scratchpad/import_full.json`, 1,818 customers + 2,410 contacts, all
unique ids). Result: **0 missing, 0 extra, 0 field mismatches** across every compared field
(customers: name/type/email/phone/phone_alt/address/street/city/state/zip/default_terms/tax_exempt/
hot_note_office/invoicing_email/invoicing_contact/is_active; contacts: customer_id/name/title/role/
email/phone/phone_alt/is_primary/company/is_active).

Two transcription defects were caught by the diff and fixed to exact source, then re-certified clean:
1. 8 "Brent Ferrell / Old Dominion" contacts were dropped by a duplicated line during the batch-44
   hand-transcription — re-inserted from source.
2. Contact `211279e1…` (Old Dominion Freight Lines / Corporate) had the wrong title/role/company from
   the same batch-44 slip — corrected.
3. Customer `1e2a1f80…` camera note had its non-breaking spaces (U+00A0) normalized to regular spaces
   — restored to byte-identical source.

## ⚠️→✅ App load cap fix (web cf, 2026-09-15) — REQUIRED to SEE the import — UPLOADED & CONFIRMED
After the import, ProBid displayed only **~1,025 customers / ~1,032 contacts** even after hard
refreshes. Root cause: **Supabase/PostgREST returns at most 1,000 rows per request**, and the cloud
sync (`js/auth.js`) pulled every list table with a bare `.select()` and **no `.range()` pagination**,
so any table over 1,000 rows loaded only its first 1,000. This was invisible before the import (42/43
rows) and surfaced the moment the tables crossed 1,000. **The data was always complete and correct in
the DB — this was purely a display/load bug.** Joe uploaded cf and confirmed all records now show.

Fix (**web `v20260915cf`**, `index.html` + `js/auth.js`):
- Added `_sbSelectAll(build)` — a paginated fetch that loops `.range(from, from+999)` until a short
  page, returning the FULL set (returns `{data,error}` like a normal select; on a mid-page error it
  returns what it gathered plus the error, so the callers' "don't drop local rows on error" guards
  still hold).
- Routed **every multi-row list pull** through it: customers, contacts, quotes, catalog, templates,
  jobs, team, time_entries, app_work_days, app_invoices, comms_log, invoice_payments, work_orders,
  wo_labor/parts/checklist/expenses, inventory, vendors, recurring_contracts, contracts,
  purchase_orders (+ po_line_items join), app_state, wt_projects, wt_templates, and the push-time
  customer-dedup select. (Only `margin_floors`, a tiny config table, left as-is.)
- Removed the now-wrong "cloud complete = count < 1000" heuristic on quotes/customers/contacts
  (pagination returns the full set, so complete = fetched-with-no-error AND non-empty).

## ✅ List performance at scale (web cg, 2026-09-15) — UPLOAD PENDING
Once all ~1,850 customers / ~2,450 contacts were showing, the **Customers and Contacts list screens**
were the place that could feel lag. Both `renderCustomers`/`renderContacts` (js/quotes.js) recomputed
every row's cross-references — quotes/jobs/WOs/invoices/contacts per customer; customer lookup +
last-quote per contact — on **every render, including every search keystroke** (an O(rows × records)
nested scan, millions of iterations), and drew **all** rows into the DOM at once.

Fix (**web `v20260915cg`**, `index.html` + `js/quotes.js`):
- **Linear aggregation:** one pass per dataset, each quote/job/WO/invoice/contact attributed to a
  single customer via id-or-name lookup maps (O(N+M) instead of O(N×M)); contacts build a
  customer-by-id map + a last-quote-by-contact map once. Summary tiles still reflect the full set.
- **Debounced search** (160 ms) so typing doesn't re-render on every keystroke.
- **Pagination** (100 rows/page) with a Prev/Next pager; page resets on search/sort/filter change.
- **Verified:** new counts identical to the old nested-scan logic across 25 random datasets; both
  functions executed in a sandbox against 1,900/2,450 rows drawing 100/page with correct pager,
  page-nav, and search; `node --check` clean. Live confirmation pending Joe's upload of cg.

### Next for Phase 1
Phase 1 data is loaded, certified, and displaying (cf uploaded). Remaining: Joe uploads **cg** for the
list-screen speedups, then Phase 1 is fully signed off.

## Phase 2 — History (quotes / jobs / invoices) — NOT STARTED
Design after Phase 1 is signed off. Line items, statuses, totals, cross-record links; ProBid assigns
its own sequential numbers via the server-side `next_number` sequences, so map carefully. Invoices
already have a cloud table (`app_invoices`). The `.bak` (SQL Server, ~660 MB) is the likely source for
history and must be worked in place on Joe's PC via the remote-devices bridge (see mechanism below).
NOTE: with the cf pagination fix in place, large history tables (quotes/jobs/invoices) will also load
fully — the 1,000-row cap would otherwise have hit them too. The **localStorage cache** is the next
scaling concern as history volume grows; plan to lazy-load history rather than cache it all locally.

## ProBid target fields (what an importer maps TO)
- **Customers** (`DB.customers`, `js/quotes.js` `_buildCustomerData`): name, phone, email,
  invoicingContact, invoicingEmail, street, city, state, zip, defaultTerms, taxExempt, notes,
  hotNoteTech, hotNoteOffice; id = makeUUID().
- **Contacts** (`DB.contacts`, `js/crm.js` `saveContact`): name, company (links to customer by name),
  customerId, title/role, phone, phoneType, phone2, phone2Type, email, contactType, contactPref,
  street, city, state, zip, notes; customer.defaultContactId marks the default. id = makeUUID().
- **History** (Phase 2): quotes, jobs, invoices (`app_invoices`).

## Mechanism for the `.bak` (Phase 2, once connected to the right PC)
1. Confirm the `.bak` is visible in a connected folder; check its size and free disk space.
2. It's a SQL Server `.bak` — needs SQL Server. Use SQL Server on Joe's PC, or install
   `mssql-server` + `sqlcmd`/`mssql-tools` in the device VM. `RESTORE DATABASE` the `.bak`.
3. Profile everything: tables, columns/types, row counts, samples → plain-English inventory for Joe.
4. Export the relevant tables to CSV, stage into the cloud workspace, build the import from there.

## Delivery model reminder (unchanged)
Web changes are delivered as cumulative **delta zips** Joe uploads to GitHub himself (repo
`joek0007/tcss-probid`; pushes from here 403 by design). SQL/data changes applied directly via the
Supabase MCP. Version cursor now **v20260915cg** (cf = 1000-row pull fix, cg = list-screen speedups;
prior ce). Standing directives: best practices, multi-tenant/config-not-hardcode, "solidness" (a
non-coder can trust the data), reversible imports, and verify as a real user first then confirm data.
