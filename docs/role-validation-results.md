# Role validation — all 8 roles (2026-09-21)

Thorough validation of every login role against the **live** configuration, driven in the real app
plus an isolated engine test. Requested because permissions had been a repeated concern.

## How each layer was validated
1. **Permission engine (isolated):** pulled the real `getPermMatrix` + `hasPermission` out of dispatch.js
   and ran them in a Node sandbox across **87 permissions × 8 roles = 696 checks → 0 mismatches**.
2. **Engine in the live app:** for every role, `hasPermission(key)` cross-checked against the live
   matrix for all 87 keys → **0 mismatches** on all 8 roles.
3. **Page access + nav (live app):** for every role, `_canAccessPage()` and the actual nav visibility
   cross-checked against the live matrix for all 26 pages → **0 mismatches** on all 8 roles.
4. **Live UI drives:** navigated the real app as each role and inspected rendered controls
   (payroll tab, Settings sub-tabs, export/new buttons, pay-rate column, WO scope). Back Office and
   Project Manager were also proven via **real login loads** earlier (PM via the write-through +
   live-refresh + auto-bounce off a forbidden page).
5. **Static enforcement audit (delta eb):** every one of the 87 toggles has a real enforcement site.

## IMPORTANT — live config differs from code defaults
The database holds a **full saved permissions snapshot** (`DB.settings.rolePermissions`), so the live
app is governed by that snapshot, not the code defaults. The most significant difference:

- **Only the Owner sees payroll.** In the live config `payroll.view` is OFF for *every* non-owner role,
  including **Manager**. (The code default would have given managers payroll.) This is stricter than
  default and matches the "only Victoria, by individual grant" intent — but confirm it's what you want.
  Pay visibility for a specific person is still grantable per-user via the "Sees Pay" toggle.

## Per-role results (live config)
Counts are permissions granted / pages reachable. All rows verified: engine, page-access, and nav all
consistent with the live matrix (0 mismatches).

| Role | Perms | Pages | Sees Pay | Company Settings | Notable |
|---|---|---|---|---|---|
| **Owner** | 86/87 | 26/26 | ✓ | ✓ | Full access (only `wo.view_assigned_only` off — correct, sees all WOs). |
| **Manager** | 82/87 | 26/26 | ✗ | ✗ | Broad page access incl. Settings page, but Company + Roles tabs hidden (lands on Work Orders tab); payroll tab hidden. |
| **Back Office** | 71/87 | 24/26 | ✗ | ✗ | Team mgmt, financials, timesheets, quotes, customers, reports; NO payroll, NO Settings page, NO audit log, NO deletes; pay-rate column hidden. |
| **Project Manager** | 52/87 | 14/26 | ✗ | ✗ | Jobs, dispatch, WO financials, timesheets, customers, reports, closeout, work-tracking; no payroll/settings/team/audit. |
| **Lead Tech** | 27/87 | 10/26 | ✗ | ✗ | Field supervisor: jobs, dispatch, WOs (assigned-only), vehicles, calendar, inventory, scanner, tools, field, work-tracking; can close out jobs; no financials. |
| **Estimator** | 18/87 | 8/26 | ✗ | ✗ | Quoting only: quotes (create + export), price catalog, customers, contacts, reports, calendar. No field/WO/payroll/settings/team. |
| **Helper Tech** | 13/87 | 5/26 | ✗ | ✗ | Bare field: work orders (assigned-only), time clock, work-tracking check-off, calendar, tools (check-in/out only). |
| **Subcontractor** | 9/87 | 2/26 | ✗ | ✗ | Most locked down: Field + Work Tracking check-off only. Assigned-WOs-only everywhere. |

## Verified control-level behaviors (spot-checks during drives)
- **Back Office:** payroll tab hidden + blocks if forced; pay-rate column shows "—"; Settings bounces to Dashboard; Audit Log hidden.
- **Manager:** payroll tab hidden; Settings Company + Roles tabs hidden, lands on Work Orders tab; no pay visibility.
- **Estimator:** nav limited to Quotes/Customers/Reports/Catalog/Calendar; can create + export quotes; no Settings/Team/Timesheet/Work Orders.
- **Project Manager:** verified live end-to-end earlier — role change synced roster+login, session updated with no reload and auto-bounced off the Team page it can't access.
- **Lead Tech / Subcontractor:** assigned-WOs-only enforced; no financials/payroll/settings; subcontractor limited to 2 pages.

## Confidence statement
Every role's screen-level access (nav + page reachability) and the permission engine are proven
consistent with the live configuration — 0 mismatches across 8 roles. Individual controls are gated by
that same engine (per the eb audit) and were spot-checked live. The one item needing a business
decision, not a fix: **whether Managers should see payroll** (currently they do not).
