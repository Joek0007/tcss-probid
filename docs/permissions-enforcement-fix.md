# Client-side permission enforcement — real-device tech audit (2026-09-20)

**Trigger:** Joe logged in as **Test Tech** (role `helper_tech`) on a real phone during the rollout
readiness pass and found it could see/do things a field tech shouldn't. Investigated live in the
actual Test Tech browser session (Chrome), owner in Edge.

## Root cause (the real one)
The permission **matrix and profiles were correct** — `helper_tech` is granted exactly the right 5
pages and a tight capability set; Test Tech's profile was clean (`helper_tech`, `can_view_pay=false`,
no per-user overrides). The bug was in **enforcement**: `enforceNavPermissions()` only **hid nav
items**, while `goPage()` would **render any page it was pointed at** — so a field tech could reach
Customers, Reports, Team, Invoices, Settings, Purchase Orders, Audit Log, etc. by any navigation
path (typed `#/hash`, Back/Forward, deep link, quick-add). **Confirmed live:** as `helper_tech` the
Customers page rendered fully — 1,917 customers and **$76,462 total won revenue** with a "+ New
Customer" button. The prior authorization audit (Theme 03) was DB/RLS-focused and did not catch this
client-side navigation hole.

## Second root cause — inert toggles (the "how many toggles don't work" class)
Beyond the nav hole, many individual capability toggles were **defined in the matrix but never
consulted** by the control they name — the code enforced with a **hardcoded role check** (or nothing)
instead of `hasPermission(key)`. That means an admin flipping the toggle in Settings → Roles had **no
effect**, and per Joe the point of licensing to other companies is that "my way of thinking may not be
theirs" — every toggle must actually govern. Delta **dz** wires them.

## Fixes shipped
- **dx — page-access guard (js/core.js):** added `_PAGE_PERM_MAP` + `_canAccessPage()`; `goPage()` now
  blocks navigation to any page the role/user lacks `page.*` permission for and redirects to the
  Dashboard with a toast. Owner bypasses; dashboard always allowed; unmapped pages (recyclebin) deny
  for non-owner. **Verified live** in the Test Tech session: allows only the 6 field pages, blocks
  ~20 others (Customers navigation bounced to Dashboard).
- **dx — quick-add "+" gating (js/core.js):** each `QUICK_ADD` entry now carries a create-permission
  key; the "+" is only injected when the user has it, and `quickAdd()` guards the action. Verified:
  helper_tech no longer sees "+" on Work Orders or Tools.
- **dx — assigned-only work orders (js/workorders.js):** `wo.view_assigned_only` was defined
  (helper_tech/subcontractor) but **never applied**. `renderWorkOrders()` now filters to WOs the
  current user is assigned to. Verified live: Test Tech sees only its **2** assigned WOs
  (WO-1005, WO-1003), not all 500.
- **dx — Tools locked to check-out/in (js/tools.js):** per Joe, field techs check tools out/in only,
  not create/edit/delete. Hid the "+ Add Tool" button, per-row Edit/Del buttons, and the detail Edit
  button unless `tool.edit`; guarded `newToolItem()`/`delTool()` (`saveToolItem` was already guarded).
  Checkout/return/transfer unchanged (`tool.checkout`). Verified live: no Add/Edit/Del for the tech.
- **dy — Work Tracking "+ New Project" hidden (js/worktracking.js):** create actions
  (`openNewProjectWizard`/`wtCreateProject`) were already guarded by `wt.create`; hid the button too.

## Delta dz — toggle-wiring pass (2026-09-20, code-complete)
Every item below replaces a hardcoded role check (or a missing gate) with `hasPermission(key)`, so the
matrix toggle actually governs. Both the **function body** and the **button/UI** are gated (defense in
depth — a forced call still refuses).

| Toggle / key | Control(s) now wired | File(s) |
|---|---|---|
| `wo.delete` | `deleteWorkOrder()` body + row-menu Delete item | workorders.js |
| `wo.change_status` | `cycleWOStatus()` body | workorders.js |
| `wo.edit` | row-menu Edit item | workorders.js |
| `job.create` | `newJob/editJob/saveJob` bodies + "New Job" header button + Jobs row Edit btn | quotes.js, worktracking.js, index.html |
| `job.closeout` | `openCloseout/saveCloseout` bodies + closeout button | worktracking.js |
| `quote.export` | `exportCSV()` body + "Export CSV" button | quotes.js, reports.js, index.html |
| `quote.create` | "New Quote" button (renderQuotes) | reports.js, index.html |
| `settings.company` | Settings **Company** + **Roles & Permissions** sub-tabs (button hidden + `switchMsTab` guard + settings page lands on first allowed tab) | dispatch.js, core.js |
| `settings.margin` | Settings **Quoting** sub-tab | dispatch.js, core.js |
| `time.viewall` | **All Timesheets** tab body (was hardcoded owner/manager/back_office) + tab button hidden | field.js, index.html |
| pay-visibility (`_canViewPay`) | **Payroll** timesheet tab button hidden (body already gated) | field.js, index.html |

### Work Tracking access model (Joe's design) — RESOLVED
Joe's rule: *"when you create a project it gets linked to a work order; if an employee has access to the
work order they have access to the WT project. Project managers, managers, back office, owners shouldn't
have to be linked directly on the work order — their access should be a toggle."*

Implemented in **dz**:
- New toggle **`wt.viewall`** ("View All WT Projects") — defaults on for owner/manager/back_office/
  project_manager, off for field roles. Holders (and owner) see every project.
- For everyone else, access **flows from the linked work order**: `wtIsAssigned(projId)` now finds the
  project's linked WO (`project.jobId` === work order id) and grants access if the current user is in
  that WO's `assignedTechs`; falls back to a direct WT-project assignment. The old version hardcoded
  owner/manager/back_office/lead_tech to `true` (inert to any toggle).
- `wtRenderProjectList()` now actually applies `wtGetVisibleProjects()` (previously it rendered
  `DB.wtProjects` unfiltered — the filter function existed but was never called, which is why a field
  tech saw **all** project names). This resolves the "WT project list visibility" open item below.
- Logic unit-tested (8/8) against the fixture: owner→all, viewall→all, field tech→only linked-WO +
  directly-assigned projects, other tech→none.

## Swept and clean
- **Calendar (helper_tech):** no dollar figures, no customer list — shows the schedule/assigned job. OK.
- **Work Tracking (helper_tech):** no financials; create hidden; project list now filtered (dz).

## Open items / to review
- **~~WT project list visibility~~** — RESOLVED in dz (see Work Tracking access model above).
- **Live-verify dz** in the Test Tech session after upload: confirm New Job/Export CSV/closeout gone,
  Settings sub-tabs limited, All Timesheets tab hidden, and the WT project list shows only the tech's
  linked-WO project(s).
- **Other roles not yet real-device tested:** only `helper_tech` was walked live. The page-access
  guard now protects all roles uniformly, but a targeted pass of **subcontractor** (most restricted)
  and **back_office** (must NOT see pay — gated by `_canViewPay`; must NOT see Company/Roles settings —
  gated by dz) is worth doing before wide rollout.
- **Server-side note:** these are client-side UI/nav protections. DB-level RLS/guards (Theme 03) remain
  the hard floor for destructive/financial actions. Read-exposure of list pages was client-gated here;
  if a tech account is ever a real security boundary against a determined user, add RLS read policies
  for the sensitive tables too.

## Verification method
Driven live in the actual Test Tech (`helper_tech`) browser session via Claude-in-Chrome: matrix +
profile inspected, navigation-block confirmed (Customers → Dashboard), quick-add "+" gone, WO list =
2 of 500, Tools Add/Edit/Del absent. dz is code-verified (`node --check` on all 8 changed files) and
the WT access logic is unit-tested (8/8); live confirmation pending Joe's upload of delta dz.
