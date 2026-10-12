# TCSS ProBid — Rollout Readiness Checklist

**Purpose:** prove the everyday workflows hold up under real use *before* the crew touches it.
Each item is driven **live in the app as a real user** and confirmed in the database.
Status: ⏳ not yet tested · ✅ works · ⚠️ works with a caveat · ❌ broken (needs fix).

_Started 2026-09-19. Core workflows verified through build **dw** + portal (2026-09-20). Permissions &
role system hardened and validated through build **ef** + migration `2026-09-21_role-sync` (2026-09-21)._

## Method
- Drive the actual UI, then confirm the row in Supabase. Test records named **`ZZTEST …`** and removed at the end. Native dialogs clicked by Joe.

## Core workflows (the daily drivers)

### 1. Work Orders — [x] ✅ open/create/labor/expense/priced-part/checklist/prev-next/create-invoice (F9); [x] ✅ Urgent-priority WO → texts configured list via ClickSend (verified live)
### 2. Quotes → Job — [x] ✅ create quote+items; convert→job(+WO); add-contact-from-quote → dual-phone modal + links back (dl)
### 3. Invoicing — [x] ✅ generate invoice; [x] ✅ record a payment → invoice_payments row, invoice paid
### 4. Time clock / Field — [x] ✅ vehicle issue→WO; [x] ✅ clock in/out (F7); [x] ✅ field log → wo_field_logs; [x] ✅ call-out/absence alert → texts office via ClickSend (verified live)
### 5. Dispatch — [x] ✅ assign tech → assigned_techs synced (F11); [x] ✅ assignment SMS via ClickSend (auto paths); [x] ✅ manual 💬 resend button (dq) — verified live
### 6. Customers / Contacts — [x] ✅ create customer; [x] ✅ add contact linked+unlinked (F5, dual-phone modal); [x] ✅ edit customer
### 7. Vehicles / Fleet — [x] ✅ vehicle cost rollup; [x] ✅ convert issue→WO links back onto issue (F6, verified live); [x] ✅ issue-report email alert (F8, verified live)
### 8. Purchase Orders — [x] ✅ create PO; [x] ✅ receive → WO + inventory sync (F13, verified 8→12→10)

## Permissions & Roles — [x] ✅ FULLY VALIDATED (2026-09-21)
See `claude/permissions-full-enforcement-audit.md` and `claude/role-validation-results.md` for detail.
- [x] ✅ **All 87 permission toggles enforce** — every toggle in Settings → Roles actually governs its
  control (builds dx/dy/dz/eb wired the ones that were hardcoded or dead; static audit = 0 dead toggles).
- [x] ✅ **Page-access lockdown** — `goPage()` blocks navigation to any page a role can't access (not just
  hiding nav); verified live (a field tech forced to Customers bounces to Dashboard).
- [x] ✅ **All 8 roles validated** — engine + page-access + nav cross-checked against the LIVE config for
  every role: **0 mismatches** (owner/manager/back_office/estimator/lead_tech/project_manager/helper_tech/
  subcontractor). Live UI driven per role with screenshots.
- [x] ✅ **Pay visibility** — only the Owner sees payroll (managers included = NO); per-person grant via
  "Sees Pay". Confirmed intended by Joe 2026-09-21.
- [x] ✅ **Work Tracking access model** — access flows from the linked work order; `wt.viewall` toggle for
  office/PM. Verified live.
- [x] ✅ **Role/access change is live** — changing a role in Team page or Users panel updates BOTH the
  roster and the login (write-through by email, migration `2026-09-21_role-sync`), and the affected user's
  open session updates within ~30s / on tab focus with no reload; bounces them off pages they lose access
  to. Verified live end-to-end (Project Manager).
- [x] ✅ **Access Level dropdown** lists all roles incl. custom ones (names only); role change is owner-only.
- [x] ✅ **All 8 built-in roles are assignable login roles** (enum widened from 5 → 8).

## Cross-cutting (reliability)
- [x] ✅ No save freezes; instant cloud sync; search works
- [x] ✅ Time-entry "link to WO" dropdown shows all open WOs (F10, dn) — verified live.
- [x] ✅ Open/closed WO state correct — unknown legacy statuses treated as closed (F14) — 32 open / 468 closed of 500.
- [x] ✅ **Multi-tenant outbound (no hard-coded "TCSS")** — every customer/tech-facing message + the approval portal pull the company name from settings. Verified live.
- [x] ✅ **Notification set complete** — vehicle-issue email (F8), absence/call-out SMS (ds), urgent-WO SMS (dw). Tenant-safe, off by default, verified live.

## Findings — all resolved
F1–F14 fixed & verified live. F3: component verified (one $0-WO invoice click for the full-flow tick).
F4: investigated — Change Orders panel already filters to the WO's children; awaiting a screen if still seen.

## Remaining before / at go-live (none block the pilot)
- **Real separate-device tech pass — [ ] (Joe/Dawn):** 5-minute phone loop delivered
  (`TCSS-ProBid-Phone-Test-Checklist`): clock in → field log w/ photo → clock out → verify office-side →
  offline-sync test. Needs a real phone on cellular (can't be done from desktop).
- **Stray root `workorders.js` — [ ] (Joe):** removed from the working copy; delete the top-level
  `workorders.js` on GitHub (keep `js/workorders.js`). Not loaded, harmless — housekeeping only.
- **Flip crew SMS on at go-live — [ ] (go-live action):** 20 of 22 techs have `smsEnabled=false` on
  purpose so testing didn't text the crew. Flip on at go-live (Claude can do it in one step on request).
- **Mailgun SPF/DKIM DNS for tcss.com (task #105):** add `include:mailgun.org` + Mailgun DKIM; no MX; DMARC p=none — gets alert emails out of junk.

## Future — commercialization / multi-tenancy (post-pilot, for licensing to other companies)
- **Per-company outbound email domain** — invoices send from `invoicing@tcss.com`; `notify-vehicle-issue`
  is branded "TCSS ProBid" server-side. Each licensed company needs its own verified Mailgun domain +
  `settings_json.mgFrom`/`mgDomain`. Not a string swap.
- **Per-company PWA app name + asset-tag prefix** — currently "TCSS ProBid" / "TCSS-001"; should pull from
  company settings.
- **Custom-role server-side enforcement** — custom roles work at the screen level today, but ~40 RLS rules
  are hardcoded to the 8 built-in roles. Making a custom role a fully-enforced login role means driving RLS
  from the permission matrix. This is the deeper permissions project.

## Rollout verdict
**GO for the Dawn pilot.** Every daily-driver workflow verified live; F1–F14 resolved; full notification
set working (crew muted until go-live); all outbound messaging tenant-safe; and the permission/role system
is now fully wired and validated across all 8 roles. Remaining items are Joe's go-live actions (phone test,
delete one file, flip crew SMS, Mailgun DNS) plus the future multi-tenancy track for licensing.
