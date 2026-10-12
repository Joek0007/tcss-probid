# Vehicles / Fleet Assets Module

**Status: LIVE (build `co`) + data migration COMPLETE & CERTIFIED — 2026-09-19**
**Attachments + field-reported issues in `cp`; email alerts in `cq`; alert-card placement fix in `cr`.**
**Parts pricing + real cost model (Parts+Expenses+Labor) + per-year + fleet comparison in `db` — 2026-09-19.**
**Registration/insurance expiration alerts in `ew` — 2026-09-26 (LIVE-VERIFIED).**

## What it is
A first-class **Vehicles/Assets** area so TCSS can log work on its own fleet without faking
a "customer" per vehicle. Work orders now attach to **a customer OR a vehicle**. This keeps
vehicles out of customer counts, revenue, and reports.

## Data model
- New table `public.assets` (id `text` PK, `number`, `name`, `type`, `make`, `model`, `year`,
  `color`, `vin`, `plate`, `status` [active/in_shop/sold/inactive], `assigned_tech`, `home_base`,
  `odometer`, `purchase_date`, `purchase_cost`, `registration_expires`, `insurance_expires`,
  `notes`, `is_active` soft-delete, `created_by`, `created_at`, `updated_at`). RLS: "assets
  authenticated all".
- `public.work_orders.vehicle_id text` (nullable) + index. A WO is for a customer OR a vehicle.
- `public.vehicle_wo_rollup()` SECURITY DEFINER → per-vehicle WO count for the list card.
- Migration file: `migrations/2026-09-19_20_assets-fleet.sql`.

## App (build `co`)
- `js/vehicles.js` — list (search/paginate, summary tiles), new/edit/save (upsert direct to
  `assets`), soft-delete, profile overlay (Overview + Work Orders tab, load-on-demand via
  `fetchWorkOrdersCloud({vehicleId})`, cost rollup from `wo_expenses`).
- Nav item 🚚 Vehicles; `#page-vehicles`, `#modal-vehicle`, `#vehicle-profile-overlay`.
- WO modal has a vehicle picker beside the customer picker; save gate accepts either.
- Edits in `core.js`, `auth.js` (assets sync + WO vehicle_id map/filter), `workorders.js`.

## Attachments + field-reported issues (build `cp`)
Migration `migrations/2026-09-19_21_vehicle-attachments-issues.sql`:
- `public.asset_documents` — photos & docs attached to a vehicle (doc_type: photo / registration /
  insurance / receipt / purchase / inspection / other). Mirrors `wo_documents`; files in the private
  `job-photos` bucket; soft-delete via `deleted`. Rendered with `data-sp` so the existing signed-URL
  layer (`hydrateSignedMedia` in core.js) serves private files.
- `public.asset_issues` — a tech's field-reported problem: asset_id, title, description, severity
  (low/normal/high/urgent), status (open → acknowledged → in_progress → resolved), photo, reporter,
  and `wo_id` when converted. `vehicle_open_issue_rollup()` powers the open-issue badge.

App:
- Vehicle profile gains **Photos**, **Documents**, and **Issues** tabs. `uploadAssetDocument()`
  mirrors `uploadWODocument()`. Documents tab also **surfaces receipts/docs from that vehicle's work
  orders** (read from `DB.woDocuments`). Photos = image docs with doc_type `photo`.
- **Field page** (`field.js`/`index.html`): "Report Vehicle Issue" card + `#modal-vehicle-issue` —
  pick vehicle, severity, description, snap/attach a photo, submit → inserts `asset_issues`. Persistent
  **open-issue badge** on the Vehicles nav item + per-vehicle ⚠️ badges + an "Open Issues" summary tile.
- **Office Issues tab**: Acknowledge, Resolve (with note), Convert to Work Order (opens a new WO for
  the vehicle with the issue text prefilled; issue → in_progress).
- Permissions (`dispatch.js` PERM_DEFS): `page.vehicles`, `vehicles.manage`, `vehicles.report_issue`
  (techs on by default), `vehicles.issues.manage`.

**VERIFIED LIVE 2026-09-19:** field report (Vehicle #01, with photo optional) → `asset_issues` row +
in-app office notification → office sees "1 Open Issue" tile + per-vehicle ⚠️ badge → Convert to Work
Order builds a vehicle-linked WO. **Issue→WO hard-link is DONE** (confirmed 2026-09-26): `saveWorkOrder`
stamps `wo_id` + status='in_progress' back onto the `asset_issues` row via the `_convertingIssueId`
flag (workorders.js) — the earlier "known minor gap" is closed.

## Email alerts to the fleet manager (build `cq`, placement corrected in `cr`)
**Email channel = Mailgun**, NOT SendGrid. Edge function **`notify-vehicle-issue`** (DEPLOYED):
checks `settings_json.vehIssueEmailEnabled`, sends via Mailgun to `vehIssueEmailTo`, attaches the
tech's photo. **Location: Settings → 🔔 Notifications tab.** Ships OFF; enable + set recipients there.
_Currently OFF (confirmed 2026-09-19: `vehIssueEmailEnabled` unset, no recipient) — the in-app office
notification fires regardless; the email only sends once the toggle is on._

## Registration / insurance expiration alerts (build `ew`, 2026-09-26) — LIVE-VERIFIED
Surfaces upcoming (and past) vehicle registration & insurance expirations — the dates were already
stored on `assets` (`registration_expires` / `insurance_expires`) but nothing warned anyone. No schema
change; purely client-side rendering + an in-app check.
- **`_vehExpiryInfo(dateStr, thresholdDays)`** (core.js) — shared helper returning
  `{days, level, label}` where level is `expired` (past), `soon` (≤ threshold), or null. Threshold =
  `DB.settings.vehExpiryDays` (default **30** days).
- **In-app bell alert** — `_checkVehicleExpirations()` (core.js), office-only, fires `addNotification`
  once per vehicle+field+expiry-date via a localStorage seen-map (`tcss_vehexp_seen`; the date is in the
  key so a renewed date re-alerts). Wired into `_startNotificationChecks` (on load + every 6h). Honors
  `DB.settings.vehExpiryAlertsEnabled` (default on).
- **Vehicles list** — per-vehicle badge: amber "📅 Reg/Ins in Nd" (soon) or red "⛔ Reg/Ins" (expired);
  new **"Reg/Ins Expiring" summary tile** (`vs-expiring`) counting vehicles with reg or insurance
  expiring soon or already expired.
- **Profile Overview** — the Registration Exp / Insurance Exp rows now show "— in Nd" / "— EXPIRED Nd
  ago".
- **LIVE-VERIFIED 2026-09-26 on deployed `ew`:** seeded Vehicle #01 with registration = today+10 and
  insurance = today−5 → the "Reg/Ins Expiring" tile showed **1**, the card showed **📅 Reg in 10d**
  (amber) + **⛔ Ins** (red/expired), and the notification bell incremented (the office alert fired).
  Test dates then cleared → tile back to 0, badge gone. Logic also unit-verified (expired / today / ≤30 /
  >30 / null-safe). **No vehicles have reg/insurance dates entered yet** (the migrated fleet came from
  customer records without them), so it reads 0 in normal use until the team fills those dates in via
  Edit Vehicle.

## Vehicle cost model (build `db`, 2026-09-19)
**How the vehicle cost tile works and what it counts.** A vehicle has no stored balance — its cost is
**computed live** each time you open it (and for the fleet list, via a server-side rollup), by walking
the vehicle → its work orders → their line items. Cost = **Parts + Expenses + Labor**:
- **Parts** = Σ (quantity × unit_cost) from `wo_parts`.
- **Expenses** = Σ amount from `wo_expenses`.
- **Labor** = Σ (hours × rate) from `wo_labor`, where rate falls back to the WO's `labor_rate`, then 125.

**Parts pricing was added here** (parts previously had no dollar value at all). Migration
`2026-09-19_23_wo_parts_unit_cost` adds `wo_parts.unit_cost`. The WO **Parts tab** now has a Unit $
input (office), an editable unit-cost per part row, per-line totals, and a Parts Total. Parts push
inline to the cloud on add/edit (`_pushWOPartToCloud`) and `unit_cost` is in the full-push mapping.

**Profile Overview:** the cost tile shows the all-time total with a P/E/L sub-line, plus a **Cost by
Year** table (Parts / Expenses / Labor / Total per year, with an all-years footer). Parts/expenses/
labor for the vehicle's WOs are loaded on demand (`ensureWOPartsForIds` / `ensureWOExpensesForIds` /
`ensureWOLaborForIds` in auth.js) so older work orders outside the sync window are included.

**Fleet comparison:** `public.vehicle_cost_rollup()` (migration `2026-09-19_24_vehicle_cost_rollup`,
SECURITY DEFINER) returns per-vehicle parts/expenses/labor totals + this-year (YTD), computed in the
DB so the whole fleet can be ranked without loading every line item. The **Vehicles list** shows a
cost figure per vehicle (hover for the P/E/L + YTD breakdown) and a **Sort: Total Cost / Cost This
Year** control so vehicles can be compared directly.

**Verification:** RPC math confirmed live — a test WO with a $100 part (2×$50) + $30 expense + $250
labor (2h×$125) moved a vehicle's rollup by exactly $380, with the correct P/E/L split; test data
removed. Full UI (parts pricing input, cost tile, per-year table, list column/sort) verifies after the
`db` build is uploaded to GitHub.

_Note on historical numbers:_ the migrated CRM work orders brought expenses across but **no priced
parts and little/no labor**, so a vehicle's lifetime total mostly reflects expenses until the crew
starts logging priced parts and labor on vehicle WOs going forward.

## Data migration (certified)
Migrated **all 33** legacy "TCSS Vehicle #…" customer accounts. assets created: 33; work orders
re-pointed: 188 (0 still carry a customer); vehicle customers still active: 0. Reversible via
`veh-legacy-%` prefix. 21 orphaned placeholder contacts soft-deleted; 4 real driver names preserved
onto the vehicle's `assigned_tech` (Wayne Langley #10, Chad Fulghum #15, Joe Kucinski #25, Larry
Voncannon #34). (Live count 2026-09-26: 33 assets active, 189 WOs on vehicles, 0 vehicle customers.)

## Out of scope (future)
Maintenance/PM reminders (mileage- or date-based service intervals — distinct from the reg/insurance
expirations shipped in `ew`). Optional: SMS alert option via ClickSend for vehicle-issue + expiration
alerts (email works today); relabel the "Email Settings (SendGrid)" header to Mailgun (cosmetic);
inline cloud push for the completed-day clock summary.
