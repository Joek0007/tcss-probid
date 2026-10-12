# Work Orders — Bug Sweep & Hardening (2026-10)

Triggered after several user-facing Work Order bugs surfaced one at a time. Did a
systematic sweep for the two recurring bug *classes* instead of waiting for them to
be hit in production.

## Bug class A — a function is CALLED but never DEFINED (ReferenceError)
Static analysis: extracted every `ident(` call in each JS file, cross-checked against
all definitions across `js/*.js` **and `index.html` inline scripts** (the analyzer
must include index.html — e.g. `woRtfLoad/woRtfRead/_woRtfPlaceholder` are defined
there), plus a browser/JS built-ins whitelist.

Found & fixed in Work Orders:
- `formatDateFriendly` — Field Log tab. A bare `formatDateFriendly ? …` guard threw
  because the identifier was never defined; killed the whole Field Log render and left
  it stuck on "Loading field log…" whenever a WO actually had log entries. On WOs with
  no logs it fell back to a blank screen that looked like the empty Field Docs tab —
  which is why they appeared to "show the same information." Fixed with a `typeof`
  guard + readable date fallback. (build `ip`)
- `newWorkOrder()` in `confirmCreateChangeOrder` — unguarded call to a non-existent
  function → **`ReferenceError: newWorkOrder is not defined`**, which broke
  change-order creation entirely. Correct function is `openNewWorkOrder()`. (build `iq`)
- `wtShowNewProjectWizard()` in `woCreateWTProject` — non-existent function (guarded,
  so no crash, but the "Create New WT Project" button on the Phases tab silently did
  nothing). Rewrote to use the proven `openNewProjectWizard()` + `wiz-name/wiz-cust`
  prefill pattern from `wtOpenFromWorkOrder()`. (build `iq`)

False positives / harmless (for the record): `woRtf*` and `populateDynamicSelects`
(defined in index.html), `onProceed` (a function parameter), built-ins (`Uint8Array`,
`BarcodeDetector`, `html2canvas`), and the `_*PerRow` flags (defined in the
`*_db.js` files).

Outside Work Orders — swept app-wide and resolved (build `ir`):
- `_pushCustomerToSupabase` (crm.js `saveCPAlerts`) — **REAL BUG, FIXED.** Wrong name;
  the real function is `_pushCustomerToCloud` (used by every other customer-save site,
  defined in auth.js). Saving Customer Portal alerts (hot notes, per-module alerts)
  skipped the reliable targeted push and rode only on the heavy debounced
  `pushAllToCloud`, which per the 2026-10-06 note "frequently never lands" on a large
  dataset — so saved alerts could silently never reach the cloud. Renamed to
  `_pushCustomerToCloud`. Verified live: `saveCPAlerts()` on a test customer fired the
  push with the right customer, data unchanged.
- `renderMsTimeSettings` (dispatch.js) — **NOT a bug.** The Managed Services "Time" tab
  shows a deliberate "Time & Payroll settings coming in next build phase" placeholder
  in `#ms-time-content`; the `typeof` guard is the correct deferred-feature pattern.
  Left as-is.
- `wtRenderTechNotifications` (reports.js) — **NOT a bug.** Optional notifications
  section in the tech dashboard; unbuilt, so it renders empty via its `typeof ? : ''`
  guard. Graceful. Left as-is.
- `loadTemplate` (worktracking dispatcher) — **dead/unreachable.** No UI element
  dispatches `data-action="loadTemplate"`, and `wrap('loadTemplate')` only decorates an
  already-existing function (no-op here). Cannot fire. Left as-is.

## Bug class B — a null id matches orphaned records on a NEW (unsaved) WO
A brand-new WO has `_woCurrentId = null`. Any `filter(x => x.woId === null)` then
matches orphaned records, and worst of all `timeEntries.filter(t => t.jobId === null)`
matched **every un-jobbed clock punch** → thousands of bogus hours on a blank WO.

Fixed:
- `renderWOChangeOrders(null)` — was matching every ordinary WO (the "Change Orders
  (502)" bug). Guarded: returns empty when `!woId`. (earlier build)
- `switchWOTab` — single guard: a WO with no id shows "Save this work order first"
  for ALL data tabs (Labor/Expenses/Parts/Checklist/Photos) instead of running the
  filters. This is what killed the "5,155 hrs on a new WO" Labor bug. (build `io`)

Already safe (self-guarded, left as-is): `refreshWOQuickStats` (`if(!woId) return`),
`printWorkOrder` / `createWOInvoice` (guard with `if(!wo) return` before filtering).

## Verification
All fixes verified live in the real browser against the deployed build (not just
`node --check`): Field Log renders its entry; the change-order path throws on the old
build and runs clean with the fix; new-WO tabs show the save-first message with zero
bogus hours; `saveCPAlerts` fires the customer cloud push on `ir`.

## Reusable method (run this when bugs recur)
1. `grep -rnoE '([A-Za-z_][A-Za-z0-9_]*) \? \1\(' js/` → broken existence guards.
2. Analyzer: all `ident(` calls minus all definitions (js/ **+ index.html**) minus
   built-ins → called-but-undefined. Triage: unguarded = crash risk; `typeof`-guarded
   = dead feature (check if the intended function exists under another name before
   assuming it's deferred — `_pushCustomerToSupabase` vs `_pushCustomerToCloud`).
3. `grep` for `=== woId` / `=== _woCurrentId` filters; confirm each caller either
   guards `if(!wo) return` or is funneled through the `switchWOTab` `!id` guard.

Version token flow: `ip` (Field Log) → `iq` (change-order crash + WT button) →
`ir` (CRM customer-alert cloud push).
