# Phase 2 — History Import Plan — COMPLETE (2026-09-16)

**Phase 1** (customers + contacts) and **Phase 2** (full CRM history) both done & certified.
Every dataset loaded, field-by-field certified (0 discrepancies), reversible by id-prefix / import batch.

## Final loaded tallies (certified)
| Data | Table | Rows | Notes |
|---|---|---|---|
| Invoices | app_invoices | **11,930** | Σ $23,899,270.50; 23 note-junk + Void excluded; surfaced (profile tab + list rollup) |
| Service Orders → Work Orders | work_orders | **7,741** | 494 Void excluded; surfaced (profile tab + list rollup) |
| Purchase Orders | purchase_orders | **1,484** | Σ $12,980,488.47; 70 Void excluded; wo_id-linked |
| PO line items | po_line_items | **7,068** | Σ $6,108,271.22 |
| Contracts | recurring_contracts | **242** | do_not_bill=true; active 141/cancelled 50/expired 51 |
| Company Expenses | wo_expenses | **8,277** | Σ $1,104,033.29; 69 non-WO-linked skipped |
| Time Logs | time_entries | **19,207** | **2024–present only** (Joe's choice); tagged approved/paid/manual; 98,057 hrs |
| Customers (Phase 1 + restored) | customers | 1,964 | incl. orphan-with-history restores |

## Web builds shipped (Joe uploads to GitHub `joek0007/tcss-probid`)
- `ci` invoice load-on-demand · `ck` invoice profile/card surfacing · `cl` work-order load-on-demand ·
  `cm` work-order profile/card surfacing · `cn` time-entries load-on-demand. (Current live: **cn**.)
- Local commits only (push is 403 by design); deltas delivered as zips.

## Load method that worked
Org egress blocks the assistant container from Supabase, and the admin SQL MCP can't take bulk inline,
so **Joe ran prepared `.sql` files in the Supabase SQL Editor**. Rules that made it reliable:
- Files **≤ ~550–800 KB** (editor rejects ~1.6 MB; ~1 MB cap).
- **Parent + child rows in the same file** (FK order-proof) — learned from the PO line-item FK error.
- Browser paste converts `\n`→`\r\n` in text fields (cosmetic); normalized post-load with `replace(col,E'\r','')`.
- Idempotent `on conflict do nothing`; admin role (RLS bypassed). Small fixes/DDL/certification via MCP.
- **Check real columns before generating** (e.g. recurring_contracts has no updated_at; time_entries not-null id/deleted).

## On-demand UI pattern (established)
Bounded working set in memory + `fetch*Cloud`/`fetch*ById`; list-card counts via SECURITY DEFINER rollup
RPCs (`customer_invoice_rollup`, `customer_wo_rollup`); profile detail tabs fetch by customerId with a
stale-load guard. Applied to invoices, work orders, and time entries (recent 180d + unsettled working set).

## Not loaded / deferred (by decision)
- **Time Logs 2017–2023 (~37k)** — Joe chose recent-only (2024+). Full-history files were generated
  (`scratchpad/time_final/TIME_*_of_32.sql`) and remain available if ever wanted.
- **69 Company Expenses** with no work-order link (wo_expenses requires wo_id) — parked.
- Invoice **line-item detail** — CRM CSVs are header-level; would need the SQL Server `.bak`.
- POs have no customer link in ProBid (vendor/WO oriented) → no customer-profile PO tab.

## Reversibility (one-liners)
`delete from app_invoices where data->>'importBatch'='legacy-2026-09';`
`delete from work_orders where id like 'wo-legacy-%';`
`delete from po_line_items where id like 'poli-legacy-%'; delete from purchase_orders where id like 'po-legacy-%';`
`delete from recurring_contracts where id like 'rc-legacy-%';`
`delete from wo_expenses where id like 'woexp-legacy-%';`
`delete from time_entries where id like 'time-legacy-%';`
Restored customers by `import_batch='legacy-2026-09'` (some inactive, incl. TCSS fleet vehicles Joe may drop).
Rollup functions (`customer_invoice_rollup`, `customer_wo_rollup`) are additive/droppable.

## Remaining optional follow-ups
- Enable billing on specific imported recurring contracts if/when wanted (all currently do_not_bill).
- Decide whether to drop the 9 TCSS fleet-vehicle "customers".
- Load older time logs (2017–2023) if ever needed (files ready).
- Keep the user manual updated for the new history views.
