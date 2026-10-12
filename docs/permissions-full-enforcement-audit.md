# Permissions — full enforcement audit (all 87 toggles)

**Date:** 2026-09-20 · **Build:** delta **eb** · **Trigger:** Joe's 3rd concern about accessibility
settings — "how many of the toggles are not working correct." This time, instead of patching the one
symptom he caught, I audited **every** toggle mechanically so we stop playing whack-a-mole.

## What "not working" actually means
A toggle in Settings → Roles is only real if the code that runs the control **reads that toggle**
(`hasPermission('key')`) before allowing the action. The recurring bug: the toggle exists in the
matrix, but the control is guarded by a **hardcoded role list** (`role === 'owner' || …`) or nothing
at all — so flipping the toggle changes nothing. That is why concerns kept coming back: each fix only
covered the specific control that was reported.

## Method (repeatable)
Extracted all keys from `PERM_DEFS`, then cross-referenced each against the whole `js/` codebase for a
real enforcement site: a literal `hasPermission('key')` call, or membership in one of the enforcement
maps (`_PAGE_PERM_MAP` for pages, `_RPT_TAB_PERM` for report tabs, `_MS_TAB_PERM` for settings tabs).
Anything with zero enforcement sites is a **dead toggle**. Re-ran after fixes.

- **Before eb:** 87 total → 75 enforced, **12 flagged**. Of those, 6 were false positives (enforced
  via maps/indirection my first regex missed) and **6 were genuinely dead**.
- **After eb:** **87 / 87 enforced, 0 dead** (re-audit confirmed).

## The 6 genuinely-dead toggles — now fixed (delta eb)
| Toggle | Was | Now |
|---|---|---|
| `payroll.process` | "Mark Processed" ran on pay-visibility only | also requires `payroll.process`; button hidden without it |
| `payroll.export` | Payroll CSV ran on pay-visibility only | also requires `payroll.export`; button hidden without it |
| `settings.team` | Team add/edit was ungated (anyone on the Team page) | add/edit/invite buttons + save/new/edit functions require `settings.team` |
| `docs.view` | WO Documents tab always rendered | tab shows access notice without `docs.view` |
| `quote.view` | redundant with page toggle, no content gate | content gate on the quotes list (finer than `page.quotes`) |
| `cust.view` | redundant with page toggle, no content gate | content gate on the customer list (finer than `page.customers`) |

## Also fixed — hardcoded role checks that bypassed customization
- **Time-entry delete** was a hardcoded owner/back_office/manager list → now follows `time.correct`
  (the same toggle that already governs editing entries), so it's customizable per role.
- **PO delete button** showed for owner/back_office but the function allowed managers too → button now
  matches the function's rule (`_canDeleteOfficeRecords`). *(There is no `po.delete` toggle yet — PO
  deletion is still role-based; a dedicated toggle can be added if you want managers configurable.)*

## Prior passes rolled into this (dz/ea, same class of bug)
`wo.delete`, `wo.change_status`, `wo.edit`, `job.create`, `job.closeout`, `quote.export`,
`quote.create`, `settings.company`, `settings.margin`, `time.viewall`, and the Work Tracking access
model (`wt.viewall` + WO-linked visibility) — all converted from hardcoded/absent to toggle-driven.

## Default access for your 4 in-use roles (read live from the matrix)
This is what each role gets **out of the box** — every cell is now a working toggle you can flip.

| Sensitive capability | Manager | Back Office | Estimator | Project Mgr |
|---|:--:|:--:|:--:|:--:|
| Company Settings (`settings.company`) | ✗ | ✗ | ✗ | ✗ |
| Manage Team (`settings.team`) | ✓ | ✓ | ✗ | ✗ |
| Set Margin Floors (`settings.margin`) | ✓ | ✗ | ✗ | ✗ |
| **View Payroll** (`payroll.view`) | ✓ | **✗** | ✗ | ✗ |
| Mark Payroll Processed | ✓ | ✗ | ✗ | ✗ |
| Export Payroll CSV | ✓ | ✗ | ✗ | ✗ |
| View WO Rates/Financials (`wo.view_financial`) | ✓ | ✓ | ✗ | ✓ |
| View All Timesheets (`time.viewall`) | ✓ | ✓ | ✗ | ✓ |
| Reach Settings page (`page.settings`) | ✓ | ✗ | ✗ | ✗ |

Highlights against your stated concerns: **Back Office does NOT see payroll and cannot reach Company
Settings by default** (your Victoria rule holds — pay stays owner + whoever you explicitly grant).
**Estimator** is walled to quoting/customers/reports only. **Project Manager** runs jobs and sees job
financials + timesheets but **not payroll or company config**.

### One decision for you
**Manager sees payroll by default.** If your rule is that *only* Victoria (a Back Office user you grant
pay to) ever sees payroll, turn `payroll.view` off for the Manager role in Settings → Roles. The point
of this pass is that toggle now actually takes effect when you flip it.

## Verification status (per delivery gate)
- ✅ Static audit: 87/87 enforced, re-run clean.
- ✅ `node --check` on all changed files.
- ✅ Matrix defaults for all 4 roles read live from the running app (table above).
- ⏳ **Pending:** live drive of the new eb gates while logged in as each role. The Test Tech session
  was logged out during this pass, so I verified the matrix (the data that decides access) but have not
  yet clicked through each role on the eb build. Once eb is uploaded and you're logged into a role
  (or Test Tech is re-pointed to one), I'll drive the actual controls.
