# ProBid Risk Ledger — code-health audit findings (baseline v20260904s)

Produced by a 5-pass static audit (silent write failures, schema drift, authorization,
data-integrity/sync, correctness/duplication), deduplicated and ranked. Severity is an
engineering judgment: **Critical** = silent data loss or a destructive/financial action that
can fire unseen.

**STATUS (2026-09-05, build `av`): every audit finding, every planned follow-up, the payroll-sync
structural item, all seven RED gaps from the separate full sync audit, server-side numbering, AND the
post-audit hardening items (vendor delete, blank-margin fix, No-Margin at-cost pricing) are resolved
and verified. The remaining list is optional/next-level feature work only — see "Remaining work."**

## Active initiative — Inventory module rebuild (see `claude/inventory-module-plan.md`)
Multi-wave rebuild to commercial/multi-tenant standards. **Step 0 (catalog+inventory unified) + Wave 1
DONE + LIVE-VERIFIED on build `fd` (migrations _22–_26).** **WAVE 2 COMPLETE (2a–2f) + LIVE-VERIFIED on
build `fk` (migrations _27–_30; 2b/2c needed none).** 2a per-location reorder thresholds + par-aware Buy
List; 2b truck replenishment to par; 2c reserved/committed stock; 2d UoM purchase→stock conversion; 2e
kits/material bundles; 2f multi-photo + photo-grid view. **WAVE 2 LOOSE ENDS DONE on build `fl`:** kit
expansion inside the QUOTE builder shipped; the leftover "1U Cable Management Ring" test part removed
from WO 105798. **Next: Wave 3** (cycle-count sessions, serial/lot, offline scanning, fleet-location
assets link) + flagship roadmap (distributor catalog, smart reorder point) — NOT started, awaiting Joe's
go-ahead. Locked decisions + competitive scan are in the plan doc.

**WAVE 3 COMPLETE (2026-09-27) + LIVE-VERIFIED.** All five drops shipped as sequential deltas: 3a vehicle
locations → Fleet assets link (`fm`, no migration); 3b bin/shelf within a location (`fn`, migration _31);
3c serial/lot + warranty (`fo`, migration _32); 3d guided cycle-count sessions / flagship (`fp`, migration
_33); 3e offline scanning (`fq`, no migration). Each was sandbox-tested on the real functions, driven live
as a real user with cloud round-trips confirmed, and cleaned back to baseline (545 active / 487 tracked).
**Next: flagship roadmap** (distributor catalog integration, smart recommended reorder point) — NOT
started, awaiting Joe's go-ahead.

## Fixed log (chronological)
- **DUP-1, DUP-2** — v20260904t, verified live.
- **AZ-1, AZ-2, SF-2** — v20260904u + migrations _06/_07; Postgres + live verified.
- **SD-1..SD-5** — v20260904w→z (+ _09), LIVE-VERIFIED. **(Theme 02 fully closed.)**
- **SF-1** — aa + _10, LIVE-VERIFIED. **SF-3/4/5** — ab, LIVE-VERIFIED. **(Theme 01 fully closed.)**
- **AZ-3** — ad + _12. **AZ-4** — ac + _11. Both owner + DENIAL-path live-verified (rolled-back RLS sim).
- **AZ-5** — ae/af/ag + **ak** (WT/leave gates) + **am** (the last phantom keys). LIVE-VERIFIED.
- **AZ-6 onboarding** — migration _13 + web **v20260904ai**. LIVE-VERIFIED.
- **DUP-3** — ah, dead-code removal.
- **SC-1, SC-2, SC-3 (Theme 05)** — web **v20260904aj**, code-only. LIVE-VERIFIED. **(Theme 05 fully closed.)**
- **Cleanup + AZ-5 WT/leave gates + password-reset form** — web **v20260904ak**. LIVE-VERIFIED.
- **WO child-record delete-guard hardening (labor/expenses/checklist)** — web **v20260904al**, code-only. LIVE-VERIFIED. **Last data-safety item.**
- **Remaining permission features + simple team clock + QR-labels port** — web **v20260904am**, code-only. LIVE-VERIFIED. Wires leave.approve, time.clockteam, time.correct, rpt.*; adds a simple Clock-Teammate; ports printQRLabels (DUP-4).
- **SD-6 — deleted time entries → Recycle Bin** — migration **_14** + web **v20260904an**. LIVE-VERIFIED end-to-end.
- **Payroll (workDays) cloud sync** — migration **_15** (app_work_days table + RLS, APPLIED to prod) + web **v20260904ao**. LIVE-VERIFIED end-to-end (see "payroll verification"). Closes the last structural gap: payroll data was local-only/per-device; now cloud-synced per-row.
- **Full sync-audit RED gaps #1–#7** — web **ap** (WO expenses/labor/checklist + payroll side-records) → **aq** (WO + Managed-Services settings round-trip; supersedes ap) → **ar** + migration **_16** (invoices). LIVE-VERIFIED for RED #1 (WO expense) and RED #4 (invoices, full round-trip). See "Full sync audit" section below.
- **Server-side atomic numbering** — web **as** + migration **_17** (number_sequences + next_number RPC). LIVE-VERIFIED as a real user for quote/WO/invoice/PO + asset-tag decoupling. See "Server-side numbering" section below.
- **Vendor delete (soft-delete)** — web **at**. Vendors carried an `active` flag and renderVendors already hid inactive ones, but there was no way to remove a vendor (duplicate/typo). deleteVendor sets active=false + flips is_active=false in the cloud; pull only fetches is_active=true and pushAllToCloud never re-pushes vendors, so it can't resurrect; existing POs keep their own vendor-name copy. (Vendor management is not role-gated server-side today — noted as future hardening.)
- **Blank margin/markup field = 0, not a silent 35%** — web **au**. Reproduced live in the owner's workflow: clearing the Target Margin / Markup % (instead of typing 0) left the field blank, and getMarginDecimal() treated the blank NaN as a 35% default — so the quote silently priced at 35% and every recalc (incl. a dropdown change) re-applied it. Fixed so blank = 0 everywhere the % is read (core.js getMarginDecimal, reports.js getQData targetMargin, quotes.js saveAsTemplate). New quotes unaffected (still pre-filled with the 35% default; blank only when deliberately cleared). LIVE-VERIFIED.
- **No Margin (price at cost) per-quote override** — web **av** + migration **_18**. See "No Margin" section below. LIVE-VERIFIED full round-trip.
- **Client-side hash routing (browser Back/Forward) + retired the back-button trap** — web **aw**, code-only (no migration). See "Client-side routing" section below. VERIFIED in a real browser (headless) against the built files.
- **Quick-Quote "Leave anyway" infinite-loop fix** — web **ax**, index.html only. Pre-existing bug (in av and earlier): the unsaved-quote nav-warning's "Leave anyway" called goPage() without clearing _qqDirty, so the guard re-fired and the modal re-showed forever. Fixed to clear the dirty flag first (mirrors woNavWarnDiscard, which was already correct). Found while live-verifying aw as a real user. LIVE-VERIFIED (headless: Leave-anyway now navigates + clears dirty, no loop).
- **Sidebar nav items open in a new tab** — web **ay**, index.html + worktracking.js. Converted the 27 sidebar `.nav-item` elements from `<div data-page>` to `<a class="nav-item" data-page href="#/<page>">` so the browser offers "Open in new tab/window" on right-click and honors Ctrl/Cmd/middle-click; the nav click handler now routes only plain left-clicks in-app (keeps the dirty guards) and lets modified/non-primary clicks fall through. .nav-item already had display:flex + text-decoration:none so rendering + role CSS unchanged. VERIFIED in real Chromium (25 assertions incl. a genuine Ctrl+click new tab). Builds on aw hash routing. (Completes Joe's second nav ask — multi-tab workflow for office staff.)
- **Customizable left menu (favorites / collapsible sections / hide unused) + bigger font** — web **az** + migration **_19**. Per-user menu personalization layered on role permissions. See "Menu customization" section below. VERIFIED in real Chromium (18 assertions).
- **Menu / dashboard polish series ba..ce** — see prior detail; all VERIFIED. (Menu slide/chevrons, stars hover-only, sidebar regroup, company-default menu, dashboard personalization + drag/snap-resize grid, favorites drag, quick-add "+", PO list alignment, client-approval portal plain-English + email link + Mailgun notifications (migration _20), approval subject/abbrev, quote-list customer profile link, absence-card wording, app-wide phone/email normalization + typo suggestions, customer modal sizing/scroll.)

### This session (2026-09-25 → 2026-09-27): builds et → fl
> NOTE: builds cf..es (between `ce` and `et`) predate this session and are not individually
> logged here; the entries below cover only work done in the 2026-09-25/27 session.
- **Catalog cost/hours round-trip fix (the "costs disappear" bug)** — web **et**, auth.js. The catalog sync layer read/wrote `default_cost`/`default_hours`, but the UI reads/writes `mc`/`lh`. On pull, costs never reached the UI fields; on push, UI-edited costs never reached the cloud — so edited catalog costs appeared to vanish after a sync. Fixed the pull map (`mc:item.default_cost, lh:item.default_hours` plus legacy `cost`/`hours`) and the push map (`default_cost` from `mc??cost`, `default_hours` from `lh??hours`). Also widened `catalog.default_cost` from numeric(10,2) → **numeric(10,4)** so per-foot cable/fiber costs aren't truncated, and re-wrote values from the pre-change backup. Root cause behind Joe's repeated "costs disappear" reports. LIVE-VERIFIED.
- **Idle-logout window 30 min → 8 hours** — web **eu**, auth.js. `SESSION_TIMEOUT = 8*60*60*1000`; `SESSION_WARN` = 60s before. LIVE-VERIFIED.
- **Time-off requests: blob → per-row cloud sync + job-photo soft-delete → Recycle Bin** — web **ev**, auth.js + worktracking.js + calendar.js + recyclebin.js + `time_off_requests` table. Per-row time-off (`tor_active_all` RLS); job_photos.deleted soft-delete + Recycle Bin section.
- **Vehicles / Fleet reg/insurance expiration alerts** — web **ew**, core.js + vehicles.js + index.html. Office-only `_checkVehicleExpirations()` + summary tile + per-vehicle badges. (Assets/fleet module itself built prior — see `claude/vehicles-fleet-module.md`; migrations 2026-09-19_20_assets-fleet, _21_vehicle-attachments-issues.)
- **Inventory unification — Step 0 (catalog + inventory → one item master)** — DB migrations **2026-09-26_22** (add item-master columns to catalog + backfill/classify) + **2026-09-26_23** (adjust_item_stock RPC); web **ex** → **ey**. LIVE-VERIFIED as a real user. See "Inventory unification — Step 0" section below.
- **Inventory rebuild — Wave 1 (Joe's three asks + free wins)** — DB migrations **_24/_25/_26**; web **ez** → **fd**. LIVE-VERIFIED as a real user, all test data cleaned back to baseline. See "Inventory rebuild — Wave 1" section below.
- **Inventory rebuild — Wave 2a (per-location reorder + Buy List)** — DB migration **_27**; web **fe** → **ff**. LIVE-VERIFIED. See "Inventory rebuild — Wave 2a" section below.
- **Inventory rebuild — Wave 2b (truck replenishment to par)** — no migration; web **fg**. LIVE-VERIFIED. See "Inventory rebuild — Wave 2b".
- **Inventory rebuild — Wave 2c (reserved/committed stock)** — no migration; web **fh**. LIVE-VERIFIED. See "Inventory rebuild — Wave 2c".
- **Inventory rebuild — Wave 2d (UoM purchase→stock conversion)** — DB migration **_28**; web **fi**. LIVE-VERIFIED. See "Inventory rebuild — Wave 2d".
- **Inventory rebuild — Wave 2e (kits / material bundles)** — DB migration **_29**; web **fj**. LIVE-VERIFIED. See "Inventory rebuild — Wave 2e".
- **Inventory rebuild — Wave 2f (multi-photo + photo-grid)** — DB migration **_30**; web **fk**. LIVE-VERIFIED. See "Inventory rebuild — Wave 2f".
- **Inventory rebuild — Wave 2 loose ends (kit-on-quotes + test-part cleanup)** — no migration; web **fl**. Kit expansion wired into the Quick-Quote builder; leftover "1U Cable Management Ring" test part removed from WO 105798. LIVE-VERIFIED. See "Inventory rebuild — Wave 2 loose ends" section below.
- **Data imports this session (see `claude/graybar-import-2026-04.md`):** PriceBook 327-item import certified; 56 catalog dups cleaned; Graybar prices updated for like-for-like units only (7 unit/pack mismatches left as-is); 21 cable/fiber items → per-foot. Backups `_bk_catalog_*`, `_bk_graybar_*`.

## Inventory unification — Step 0 DONE (ex/ey + migrations _22/_23) — LIVE-VERIFIED
Merged the two overlapping stores (price-book `catalog` + physical `inventory`) into ONE item master
by extending `catalog`. Data reality at migration: all 488 inventory items name-matched a catalog item,
every qty was 0 (no stock to lose), costs aligned except one fiber. Fully reversible; `inventory` table
left intact; backups `_bk_catalog_20260926_unify` / `_bk_inventory_20260926_unify`.

- **Migration _22:** added `item_type, tracked, part_num, barcode, manufacturer, mfr_part, vendor,
  photo_url, returnable, locations(jsonb), min_qty, reorder_qty, reorder_max` to catalog + indexes;
  backfilled — canonical (latest) catalog row per stocked name → `item_type='stock', tracked=true`
  carrying part#/returnable; rest classified service (hours,no cost) / nonstock. Result: **545 active
  master items = 487 tracked stock + 58 non-stock.** Duplicate Berk-Tek OM3 per-ft fiber row deactivated
  (canonical kept at Joe's chosen $2.2810/ft).
- **Migration _23 — `adjust_item_stock(p_id,p_locations)` RPC (SECURITY DEFINER):** ACCESS FIX. Catalog
  writes are owner/back_office-only, but the old inventory table let ANY active user move stock (scanner
  check-out/in/transfer, receiving). RPC lets any active user change ONLY stock columns
  (locations/tracked), never price — tighter than before. Rolled-back RLS sim proved: helper can move
  stock via RPC, still cannot write default_cost directly.
- **Client (ex→ey):** catalog pull carries the new columns + derives `DB.inventory =
  DB.catalog.filter(tracked)` (`_deriveInventoryFromCatalog`); separate inventory-table pull removed;
  inventory item save writes the master (office-gated upsert), quantity moves go through the RPC
  (`_pushStockQtyToCloud`, used by adjustItemQty → scanner/receiving); "Delete" on the inventory page
  now UNTRACKS (stays in price book); no more auto asset-tags on consumables. 19/19 sandbox assertions.
- **LIVE-VERIFIED (owner, build ey):** inventory page shows 487 tracked; add item → cloud master row;
  edit qty/cost → persists, price-book fields (unit/hours) preserved; adjustItemQty +3 → RPC wrote
  locations to cloud; untrack → leaves inventory, stays in price book; test items cleaned up. Baseline
  545 active / 487 tracked.

## Inventory rebuild — Wave 1 DONE (ez→fd + migrations _24/_25/_26) — LIVE-VERIFIED
All of Wave 1 built on the unified master, sandbox-tested on the REAL extracted functions, then driven
live as a real user with cloud round-trips confirmed and every test item cleaned to baseline.

- **1a — Quantity Correction modal (`inv.adjust`).** `#modal-inv-adjust`: per-location Set-to / +/− with a
  required reason. Writes `inventory_adjustments` log (migration **_24**) via `record_stock_adjustment`
  RPC (only changed locations). Owner-auto, others via `inv.adjust`. 8/8 sandbox.
- **1b — Add-Item picker.** `#modal-wo-additem`: From stock (decrement) / Order it / Non-stock / one-off.
  Honors `allowNegativeStock`. wo_parts gained item_id/source/from_location (migration **_25**). Fixed a
  pre-existing bug where the wo_parts full pull dropped unit_cost. 18/18 sandbox.
- **1c — Parts → invoice billing (`invoice.adjustmarkup`).** cost + markup (global → customer → line);
  customer override `customers.parts_markup_pct` (migration **_26**) + global default in settings_json. 15/15.
- **1d — Item modal rebuild.** Item Type, UoM, Mfr/MPN, Vendor, single Photo, Active, On-Order. 17/17.
- **1e — Favorites / fast-add.** `DB.settings.invFavorites` (settings_json, no migration). 6/6.
- **Perm keys:** `inv.adjust`, `invoice.adjustmarkup` (owner-only default; toggle per role).
- **LIVE-VERIFIED (build fd):** all five drops driven live; baseline clean.

## Inventory rebuild — Wave 2a DONE (fe→ff + migration _27) — LIVE-VERIFIED
Per-location reorder thresholds + a par-aware Buy List that replaces the old "Low Stock" tab.
- **Migration _27:** `catalog.loc_pars jsonb` — maps `locId → {min: reorder point, max: par}`. Global
  `min_qty`/`reorder_max` are the fallback where a location has no override.
- **Engine `getReorderList()`:** per-location shortfall where `loc_pars` set (avail ≤ min → suggest
  par−avail), else total-level (avail ≤ min_qty → suggest reorder_max−avail−onOrder). Runs off AVAILABLE
  (on-hand − reserved). `renderDashReorderAlert()` + dashboard link are par-aware.
- **Buy List tab (`renderBuyList()`):** grouped by vendor; avail/reorder-pt/par/on-order/suggested + est
  cost; per-vendor **Create Draft PO** (`createPOFromBuyList()`) with tolerant vendor match (exact →
  contains). Item modal gained Reorder Point / Reorder Up To + collapsible per-location editor. Stat card
  relabeled "To Reorder" (removed the qty≤1 fallback noise). buylist 18/18 + form 4/4.
- **Two fixes caught live (fe→ff):** stat-card fallback removed; PO vendor tolerant preselect.
- **LIVE-VERIFIED (ff):** reorder pt/par/vendor → cloud → Buy List → Draft PO w/ vendor preselected;
  per-location par (V1 3/8) → Vehicle-1 row suggest 8, cloud `loc_pars:{loc-v1:{min:3,max:8}}`. Clean.

## Inventory rebuild — Wave 2b DONE (fg, no migration) — LIVE-VERIFIED
One-action truck restock to per-location par, on 2a's `loc_pars`.
- **`_replenishPlan(truckId, protectShop)`:** need = par − onTruck; spare = shopAvail − (protectShop ?
  shop reorder point : 0); transfer = min(need, spare); short = need − transfer. **"🚚 Replenish Truck"**
  button → `#modal-replenish`; `commitReplenish()` transfers shop→truck (RPC), logs `invTransfers`, caps
  to shop on-hand when negative off, optional shortfall→draft PO with tolerant vendor. replenish 15/15.
- **LIVE-VERIFIED (fg):** shop 20 + V1 par 10 → transfer 10 (shop 20→10 / truck 0→10, cloud confirmed);
  shortfall (shop 3 vs 10) → transfer 3, flag 7, PO seeded qty 7 + vendor. Clean.

## Inventory rebuild — Wave 2c DONE (fh, no migration) — LIVE-VERIFIED
Reserved/committed stock — makes AVAILABLE real everywhere. Reserved = a wo_part with source 'stock' +
status 'reserved' (existing columns; no schema change).
- **`_reservedStockAt(itemId, locId)`:** sums reserved stock wo_parts at a location on OPEN WOs only
  (`_woIsClosed` excludes billed/void/cancel). Activated the `_reservedAtLocation` stub → Buy List +
  replenishment net out committed stock automatically.
- **Picker:** **◷ Reserve** (no decrement); detail shows "X available (Y reserved of Z)"; Reserve and
  "Add from Stock" validate against AVAILABLE. **WO Parts tab:** "◷ Reserved — Committed" group with
  **✓ Use** (decrement + 'used') and **✕ Release** (tombstoned delete). Reserved EXCLUDED from billing
  until Used. Inventory list shows "N reserved · M avail". reserved 18/18; all earlier suites green.
- **LIVE-VERIFIED (fh, WO 105798):** reserve 4 → on-hand 10, avail 6, cloud stored; Use → 10→6 (cloud);
  Release → removed, stock untouched. Also cleaned pre-existing ZZ-PICK-TEST junk parts from the cloud.
  > The leftover non-ZZ "1U Cable Management Ring" test part (qty 2, $0, used) that had remained on WO
  > 105798 was removed in build `fl` (see Wave 2 loose ends).

## Inventory rebuild — Wave 2d DONE (fi + migration _28) — LIVE-VERIFIED
UoM purchase→stock conversion (buy a box, stock/issue by the foot).
- **Migration _28:** `catalog.purchase_unit text` + `catalog.conversion_factor numeric default 1`. The
  existing `unit` stays the STOCK/issue unit; `purchase_unit` = how you buy; `conversion_factor` = stock
  units per one purchase unit (1 = no conversion; existing items unaffected).
- **Item modal:** Purchase Unit + Stock-Units-per-Purchase-Unit fields with a live "1 Box = 100 ft" hint
  (`_updateConvHint`). Sync carries purchaseUnit/conversionFactor (pull + both pushes).
- **Receiving (`confirmReceiving`):** received quantities are PURCHASE units; stock added = qty × factor;
  material received to a WO converts too. PO line qtyReceived stays in purchase units. The receiving
  modal shows the conversion per line. Cost handling stays per-stock-unit (landed cost still out of scope).
  uom 7/7 sandbox.
- **LIVE-VERIFIED (fi):** set J-HOOK to Box/ft/100 (hint + cloud confirmed); received a 2-box PO → 200 ft
  landed in stock (cloud 200), PO qtyReceived stayed 2. Reverted to baseline (ea / factor 1 / shop 0).

## Inventory rebuild — Wave 2e DONE (fj + migration _29) — LIVE-VERIFIED
Kits / material bundles.
- **Migration _29:** `catalog.kit_components jsonb default '[]'`. A kit is an item with `item_type='kit'`
  (not stock-tracked) and `kit_components = [{itemId, name, qty}]`.
- **Item modal:** new "Kit / Bundle" type → components editor (search catalog + qty; `addKitComponent`/
  `renderKitEditor`/`_kitDraft`). Sync carries kitComponents (pull + both pushes).
- **WO Add-Item picker:** kits show a 📦 marker; selecting shows a component preview + **"📦 Add Kit —
  expands to N items"** (`addKitToWO`) → each component added as a wo_part (component qty × kit qty),
  tracked components issue from shop stock when available (decrement) else non-stock, each tagged
  "Kit: <name>". Nested kits not recursed. kits 10/10 sandbox. (Kit expansion inside the QUOTE builder
  shipped in build `fl` — see Wave 2 loose ends.)
- **LIVE-VERIFIED (fj):** built "ZZTEST Camera Kit" (J-HOOK ×50 + faceplate ×2), added to WO 105798 →
  50 from stock (shop 500→450, cloud), 2 faceplate non-stock (short), both tagged. Test kit + parts
  deleted; baseline clean (0 kits).

## Inventory rebuild — Wave 2f DONE (fk + migration _30) — LIVE-VERIFIED  ⇒ WAVE 2 COMPLETE
Multiple photos per item + a Sortly-style photo-grid view.
- **Migration _30:** `catalog.photos jsonb default '[]'` (array of resized data-URL strings). `photo_url`
  stays the PRIMARY (first) photo for row thumbnails / back-compat.
- **Item modal:** photo input is now `multiple` (cap 6); thumbnail strip with the first marked "main" and
  per-photo × remove (`_photoDraft`, `onInvPhotoChange` appends, `removeInvPhoto`, `_syncPrimaryPhoto`).
  Sync carries photos (pull + both pushes); save mirrors photos[0] → photoUrl.
- **Photo-grid view:** ☰ Table / ▦ Grid toggle on the All Items tab (`setInvView`/`_invView`);
  `renderInvGrid` cards show the primary photo (or 📦 placeholder), name, category, qty badge, favorite
  star, a photo-count chip when >1, quick ± Adjust, and open-on-click. photos 8/8 sandbox.
- **LIVE-VERIFIED (fk):** added 2 photos to an item (strip + main badge), saved → cloud photos length 2 +
  primary set; grid view rendered the photo card with the "2" chip and placeholders for the rest.
  Reverted (0 photos). Final baseline: 545 active / 487 tracked, 0 items with photos.

## Inventory rebuild — Wave 2 loose ends DONE (fl, no migration) — LIVE-VERIFIED
The two items left open after 2f, now closed. No schema change.
- **Kit expansion inside the QUOTE builder.** 2e wired kit expansion into the WO Add-Item picker only;
  the Quick-Quote builder uses a different add flow (`addCatToQQ`/`addFromCatalog`/`renderCPick`). Added
  `_expandKitToQuoteRows(kit, kitQty)` — when a kit is added from the catalog picker on a quote, it
  expands to one quote row per component (`addRow(newLI(...))`, component qty × kit qty), priced by the
  **quote's own margin** (decision #3: quote parts price at the quote's margin, not cost+markup), not the
  WO cost+markup path. Component cost pulls `mc` (fallback cost), labor pulls `lh`/hours from the catalog
  row. quote-kits 5/5 sandbox; all earlier suites still green.
- **"1U Cable Management Ring" test-part removal.** The leftover non-ZZ test part (qty 2, $0, used) that
  Wave 2c had left on WO 105798 "on Joe's word" was removed from the cloud. WO 105798 back to a clean
  baseline.
- **LIVE-VERIFIED (fl):** added a multi-component kit to a quote → each component landed as its own quote
  line at the quote's margin (cloud round-trip confirmed); WO 105798 confirmed clear of the ring part.
  Test rows cleaned; baseline restored (545 active / 487 tracked).

## Inventory rebuild — Wave 3a DONE (fm, no migration) — LIVE-VERIFIED
Vehicle inventory locations can link to a Fleet `assets` record (one source of truth for the truck).
- **Model:** a vehicle-type location carries an optional `assetId` pointing at a `DB.vehicles` row. Rides
  on the blob-synced `invLocations` array (app_state key `invLocations`) — NO migration.
- **`getLocationName(id)`** resolves to the fleet vehicle's number/name when linked (`_fleetVehicleLabel`:
  "number · name" → number → name → year/make/model), falling back to the location's own name if the link
  is stale. Every UI location label routes through this, so the fleet name propagates app-wide (Scanner,
  Inventory, Buy List, replenishment) automatically.
- **Settings → Inventory Locations:** per-vehicle-row Fleet link picker (`linkLocationToVehicle`; active
  fleet only — excludes sold/inactive) + **🚚 Sync from Fleet** (`syncLocationsFromFleet`): gives every
  active fleet vehicle a stock location, ADOPTING existing unlinked vehicle locations first (preserves id +
  any stock already there), creating new `loc-veh-<id>` only when no free slot remains; additive/idempotent.
- **Sandbox:** fleetlink 19/19 (label formatting, active-fleet filter, link/unlink, stale-link fallback,
  adopt-vs-create, idempotency, settings render).
- **LIVE-VERIFIED (fm, owner):** picker linked loc-v1 → real vehicle "Vehicle #01"; getLocationName
  resolved to the fleet label; app_state `invLocations` round-tripped (`linked:1`, correct assetId) in
  Supabase; restored to baseline (16 locations, 0 linked, cloud clean). NOTE: the blob push rides
  pushAllToCloud's debounce + `_pushInProgress` lock (existing behavior for all invLocations edits).

## Inventory rebuild — Wave 3b DONE (fn + migration _31) — LIVE-VERIFIED
Bin/shelf sub-location within a stock location, so techs find gear fast.
- **Migration _31:** `catalog.bins jsonb not null default '{}'` — map `locId → "Aisle 3 · Shelf B"`. Purely
  a "where is it" label per location; stock qty (`catalog.locations`) is unchanged.
- **Item modal:** prominent top-level **📍 Bin / Shelf** field for the Main Shop (`#inv-bin-shop`, where
  most items live) + a Bin column added to the per-location editor for trucks (the shop row shows
  "set above ↑"). `_readInvBinsFromForm` merges shop + truck bins (blank/space dropped). Toggle relabeled
  "Per-location bins & reorder levels (trucks)".
- **Display (routes through `getItemBin`/`_primaryBin`):** inventory list Location cell, photo-grid card,
  Add-Item picker (header line + per-location stock chips), and location breakdown all show 📍 bin.
- **Sync:** `bins` carried on catalog pull + both push sites (single-item `_pushInventoryToCloud` + bulk).
- **Sandbox:** bins 20/20 (read from form, blank-drop, getItemBin/_primaryBin resolution, editor render
  with shop "set above" + truck prefill, breakdown display, save wiring, non-stock → empty bins).
- **LIVE-VERIFIED (fn, owner):** set "Aisle 7 · Shelf C" on a real J-HOOK via the real edit+save path →
  master + cloud `catalog.bins` round-tripped; inventory list row rendered the 📍 bin (screenshot);
  restored to baseline (item bins {}, and 0 catalog rows carry bins cloud-wide).

## Inventory rebuild — Wave 3c DONE (fo + migration _32) — LIVE-VERIFIED
Serial/lot + warranty tracking (full unit registry). Joe chose the full serial registry option.
- **Migration _32:** `catalog.serialized boolean default false` + new `item_serials` table (id, item_id,
  serial, lot, status[in_stock|installed|returned|defective], location, wo_id, customer_id, customer_name,
  install_date, warranty_expires, cost, notes, deleted tombstone, created_by/at). RLS "authenticated all"
  (operational-table model). Indexes on item_id/status/wo_id.
- **Engine (`DB.itemSerials`):** `_serialsFor`/`_serialCounts`/`isSerialized`; `_warrantyState(date)` →
  none/active/expiring(≤60d)/expired with color+label; `_warrantyRollup` counts expiring/expired per item.
- **Registry modal `#modal-serials` (`openSerials`):** add one or bulk-paste serials (dup serials on the
  same item skipped; blank serial allowed for unknown-serial units), per-unit lot/location/warranty; status
  dropdown — setting **installed** reveals a WO picker (`assignSerialWO`) that auto-fills customer + install
  date; reverting clears WO/customer. Remove tombstones (DB.deletedIds.itemSerials).
- **Item modal:** "🔢 Serialized" checkbox (`catalog.serialized`) + a "🔢 Manage Serials (N)" button
  (visible when serialized + saved). Inventory list row shows a serial-count chip (N serials · installed ·
  expiring/expired) + a 🔢 Serials button for serialized items.
- **Sync:** `serialized` on catalog pull + both push sites; `item_serials` per-row upsert + tombstone in
  pushAllToCloud + per-row pull merge (mirrors time_off_requests). Mappers `_serialToRow`/`_serialRowToObj`.
- **Sandbox:** serials 26/26 (isSerialized, warranty states, bulk add + dup skip, install→WO→customer
  auto-fill, revert clears, remove/tombstone, warranty rollup, list render, mapper round-trip).
- **LIVE-VERIFIED (fo, owner):** marked a real J-HOOK serialized (cloud `serialized=true`); registered 2
  units (warranty 30d → expiring), installed one to WO 105798 → customer auto-filled; `item_serials`
  round-tripped in Supabase (installed row carried wo_id + customer_name); list chip + registry modal
  rendered correctly (screenshot). Cleaned to baseline: 0 serials, 0 serialized items cloud-wide.
  > NOTE (same as invLocations): the per-row push rides pushAllToCloud's `_pushInProgress` lock/debounce;
  > the write path itself is proven (direct upsert 201 + identical loop to time_off_requests).

## Inventory rebuild — Wave 3d DONE (fp + migration _33) — LIVE-VERIFIED
Guided cycle-count sessions (the flagship): assignable count sheets, live variance, a review gate, and
audited posting.
- **Migration _33:** `count_sessions` table (id, name, location[locId], scope[category|all], status
  [open|review|posted|cancelled], assigned_to/name, `lines jsonb`, notes, posted_at, deleted tombstone).
  RLS authenticated-all. lines = [{itemId,name,cat,bin,expected,counted}].
- **Workflow:** "📋 Cycle Counts" tab → **+ New Count** (`newCountSession`/`createCountSession`) picks
  location + category + optional assignee and snapshots expected qty per matching tracked item (counted
  null). Count sheet: per-line counted input with live red/green variance + progress + **✓ Match
  remaining**. **Review →** (`gotoReview`) shows ONLY variances + net unit impact. **Post** (`postCount`,
  gated `inv.adjust`) sets each variance item's on-hand at the counted location via the **audited
  `record_stock_adjustment` RPC** (reason "Cycle count: <name>") — matches AND uncounted lines untouched;
  status → posted (read-only record). Cancel/delete tombstone.
- **Sync:** per-row upsert + tombstone in pushAllToCloud + per-row pull merge; mappers
  `_countToRow`/`_countRowToObj`. `DB.countSessions`.
- **Sandbox:** counts 30/30 (candidate filter, snapshot lines, count/variance/progress, review gate,
  post writes ONLY variances through the RPC + leaves matches/uncounted alone, matchAll, delete/tombstone,
  render, mapper round-trip).
- **LIVE-VERIFIED (fp, owner):** created a 21-line count scoped to WIRE MANAGEMENT, entered one variance
  (J-HOOK 0→3), review gate showed only that line (+3, net +3), posted → cloud `catalog` qty became 3 AND
  an `inventory_adjustments` row logged "Cycle count: …"; session row round-tripped. Cleaned to baseline
  (qty reverted, session + adjustment row removed, 545 active / 487 tracked).
  > NOTE: `inventory_adjustments` is append-only under RLS (client DELETE silently no-ops — correct for an
  > audit log); test row was removed via the admin connection. Also cleared a stray "ZZTEST Quote Kit"
  > left over from the fl kit-on-quotes verification (non-tracked; active count back to 545).

## Inventory rebuild — Wave 3e DONE (fq, no migration) — LIVE-VERIFIED  ⇒ WAVE 3 COMPLETE
Offline-resilient stock moves. Layered at `_pushStockQtyToCloud`, so EVERY stock move (scanner check-out/
in/transfer, receiving, replenishment, WO issue) gets it for free.
- **Queue (`DB.stockSyncQueue`):** the local change always applies immediately (works offline). The cloud
  write goes through the `adjust_item_stock` RPC; if offline (`navigator.onLine===false`) or the RPC fails,
  the move is queued as one entry per item id holding the latest ABSOLUTE location map (replay is
  idempotent). Persisted by saveDB → survives reload/offline. `_enqueueStockSync`/`_dequeueStockSync`.
- **Auto-sync:** `flushStockSync()` replays the queue (successes cleared, failures kept); wired to the
  `window 'online'` event and also drained inside pushAllToCloud (every normal sync). A successful online
  write dequeues that item.
- **Scanner UI:** offline/pending banner (`#scan-sync-status`, `_updateOfflineIndicator`) showing offline
  state, the pending count + queued item names, and a **Sync now** button (`syncStockNow`); auto-refresh on
  online/offline events + on scanner render.
- **Sandbox:** offline 20/20 (online success→no queue, offline→queue + local applied, per-item dedup keeps
  latest, rpc-fail→queue, recover→dequeue, flush replay, flush-offline no-op, partial-failure kept,
  indicator offline/pending/hidden states).
- **LIVE-VERIFIED (fq, owner):** forced `navigator.onLine=false`, adjusted a real J-HOOK +2 → applied
  locally (0→2), queued 1, cloud NOT written (still 0), offline banner shown listing the item (screenshot);
  dispatched `online` → queue drained, cloud updated to 2, banner cleared. Reverted to baseline (0);
  cloud-wide clean (545/487, 0 sessions, 0 serials, 0 test items). NOTE: offline moves use the stock RPC,
  not `record_stock_adjustment`, so they write no audit-log rows.

## ★ Authorization DENIAL-PATH live-verified (2026-09-05)
Rolled-back RLS-simulation (BEGIN…ROLLBACK) impersonating the real helper_tech and owner OBSERVED
the database: helper delete WO/PO → 0 rows; hard-delete quote/customer (full-priv) → raises "not
permitted"; helper payment expr → false, owner → true; helper matrix edit → reverted; helper
time-entry soft-delete → reverted; owner control → allowed.

## Theme 01 — Unchecked cloud writes — FULLY CLOSED (SF-1..SF-5)
## Theme 02 — Soft-delete resurrection / data loss — FULLY CLOSED (SD-1..SD-6)

## Theme 03 — Authorization — FULLY CLOSED (AZ-1..AZ-6; all phantom keys now wired)
- [x] **AZ-1, AZ-2** — team delete + payments, DB-enforced (RPCs/RLS + audit). Postgres + live (allow+deny).
- [x] **AZ-3** — restrictive DELETE policies + time-entry guard (_12) + client gates. Owner + denial live-verified.
- [x] **AZ-4** — permission-matrix guard trigger (_11) + owner-only client gates. Owner + denial live-verified.
- [x] **AZ-5 — FULLY WIRED (ae/af/ag/ak/am), LIVE-VERIFIED.** No phantom permission keys remain except quote.bypass (wired to No-Margin in `av`).
- [x] **AZ-6 — DONE (migration _13 + web ai), LIVE-VERIFIED.** Pending-profile onboarding; active-aware current_app_role(); owner-only set_user_role/deactivate_user/list_user_profiles.

### AZ-5 ak — owner-approved role×action defaults (real 5-role enum)
| Action (perm key) | owner | manager | back_office | lead_tech | helper_tech |
|---|:--:|:--:|:--:|:--:|:--:|
| Mark check-offs (wt.checkoff) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Confirm check-offs (wt.confirm) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Reopen confirmed (wt.reopen) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Log reworks (wt.rework) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Resolve flags (wt.flags) | ✓ | ✓ | ✓ | ✗ | ✗ |
| View leaderboard (wt.leaderboard) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Request time off (leave.request) | ✓ | ✓ | ✓ | ✓ | ✓ |
### am — additional keys (owner-approved), live-verified in getPermMatrix
| Action (perm key) | owner | manager | back_office | lead_tech | helper_tech |
|---|:--:|:--:|:--:|:--:|:--:|
| Clock team in/out + add team time (time.clockteam) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Correct/edit existing entries (time.correct) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Approve/deny time off (leave.approve) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Reports: quotes/jobs/tech/tools/payroll (rpt.*) | ✓ | ✓ | ✓ | ✗* | ✗* |
| Bypass Margin Floor / No Margin (quote.bypass) | ✓ | ✓ | ✗ | ✗ | ✗ |
### Wave-1 inventory keys (owner-approved), live in getPermMatrix
| Action (perm key) | owner | manager | back_office | lead_tech | helper_tech |
|---|:--:|:--:|:--:|:--:|:--:|
| Adjust/correct inventory counts (inv.adjust) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Change parts markup at invoice (invoice.adjustmarkup) | ✓ | ✗ | ✗ | ✗ | ✗ |
Owner can change any cell live in Settings. (Both default owner-only; granted to other roles manually per Joe's decision #4.)

## Theme 04 — Duplicate/shadowed functions — CLOSED
- [x] **DUP-1..DUP-4** resolved. (Legacy quotes.js saveInventoryItem now aliases saveInventoryItemV2 after Step 0b.)

## Theme 05 — Frontend↔DB schema drift — FULLY CLOSED (aj) — LIVE-VERIFIED
- [x] SC-1 vendors payment_terms. SC-2 removed work_tracking orphan push. SC-3a/b WO job/quote/parts. SC-4 text-id/uuid.
- [x] **SC-5 (et)** catalog cost/hours round-trip mapped both directions; `catalog.default_cost` → numeric(10,4). LIVE-VERIFIED.

## Delete-guard hardening — DONE (al) — LIVE-VERIFIED
## SD-6 — deleted time entries in the Recycle Bin — DONE (an + migration _14) — LIVE-VERIFIED
## Job-photo delete → Recycle Bin — DONE (ev) — code-verified
## Time-off requests: blob → per-row — DONE (ev + time_off_requests table) — code-verified

## Payroll (workDays) cloud sync — DONE (ao + migration _15) — LIVE-VERIFIED
- **Note:** clock-out/PTO ids use Date.now(); a one-time duplicate-day scan is advisable after full-team rollout.

## Full sync audit — all 7 RED gaps closed (ap/aq/ar + migration _16) — RED #1/#4 LIVE-VERIFIED
| # | Area | Fix | Build |
|---|------|-----|-------|
| 1 | WO Expenses | per-row upsert + enriched pull | ap (LIVE) |
| 2 | WO Labor | per-row upsert | ap |
| 3 | WO Checklist | push/pull completedBy/At | ap |
| 4 | Invoices | app_invoices table + per-row | ar + _16 (LIVE) |
| 5 | WO Settings | settings_json _woSettings | aq |
| 6 | Managed-Services Settings | settings_json _msSettings | aq |
| 7 | Payroll & tool side-records | _blobKeys | ap |

## Server-side numbering — DONE (as + migration _17) — LIVE-VERIFIED as a real user
## No Margin (price at cost) — DONE (av + migration _18) — LIVE-VERIFIED full round-trip
## Client-side routing — DONE (aw) — VERIFIED (Back/Forward + retired back-button trap; ax/ay follow-ups)
## Menu customization — DONE (az + migration _19) — VERIFIED (polish ba..bq)

## Multi-tenancy decision (2026-09-05)
Solid-first: defer shared multi-tenancy; serve near-term additional companies on separate deployments.
See `claude/multi-tenancy-plan.md`. Guardrail: keep building to the standards (config not hard-coded,
server-side authz, per-row sync) so the retrofit stays mechanical. The inventory rebuild follows this
(item_type/tracked flags, RPC-gated stock moves, global+customer markup settings).

## Known limitations / optional future work (no live holes)
- [ ] **Blob-synced groups (whole-array, last-write-wins)** — tools/checkouts/logs, inventory
  locations/transfers, absences, payroll/tool side-records. (time-off DONE `ev`.) NOTE: inventory
  on-hand is per-location jsonb on the master; reserved stock (2c) is derived from per-row wo_parts (not
  blob). A normalized per-location stock ledger remains a future option (Wave 3+).
- [ ] **Full GPS-shift-on-behalf team clock ("Option 2")** — owner-requested near-future feature.
- [ ] **Payroll-sync polish:** one-time duplicate person-day scan after full-team rollout.
- [ ] **Write-but-not-read-back:** WO field logs, tech journal, raw clock sessions/events read on-demand only.
- [x] **Working delete for job photos** — DONE (`ev`). WO **documents** still have no working delete.
- [ ] **Offline numbering fallback** — two offline devices could briefly pick the same number; online path atomic.
- [x] **Vendor management role-gated server-side** — DONE (office-only RLS).
- [x] **Catalog ↔ inventory unified** — DONE (Step 0, ey).
- [x] **Inventory Wave 1** — DONE (fd, migrations _24/_25/_26).
- [x] **Inventory Wave 2a** — DONE (ff, migration _27). Per-location reorder + par-aware Buy List.
- [x] **Inventory Wave 2b** — DONE (fg, no migration). Truck replenishment to par.
- [x] **Inventory Wave 2c** — DONE (fh, no migration). Reserved/committed stock.
- [x] **Inventory Wave 2d** — DONE (fi, migration _28). UoM purchase→stock conversion.
- [x] **Inventory Wave 2e** — DONE (fj, migration _29). Kits / material bundles (WO picker; quote-side DONE fl).
- [x] **Inventory Wave 2f** — DONE (fk, migration _30). Multi-photo + photo-grid view. **WAVE 2 COMPLETE.**
- [x] **Kit expansion inside the QUOTE builder** — DONE (fl, no migration). Kits added on a quote expand to
  component rows priced at the quote's own margin.
- [ ] **Landed / weighted-average cost** — deliberately skipped; 2d converts quantity only, cost stays per-stock-unit.
- [ ] **Optional tidy:** worktracking shim block; WO child-record edit-sync parity; RC-/contract numbers self-heal client-side.
- [ ] **Fleet maintenance/PM reminders** + SMS option for vehicle alerts (date alerts DONE `ew`).

## Remaining work, by priority
1. **Inventory rebuild Wave 3 + flagship roadmap** — guided cycle-count sessions (assignable sheets, live
   variance, review gate); serial/lot + warranty; bin/shelf within a location; offline scanning; vehicle
   locations → Fleet `assets` link; then flagship: distributor catalog integration (Graybar/Anixter/Wesco
   spike) + smart recommended reorder point (needs usage history). See plan doc. NOT started.
2. **Full GPS team clock ("Option 2")**.
3. **Blob → per-row** for remaining churn groups (tools/checkouts; inventory locations/transfers ledger).
4. **Payroll duplicate-day scan**; fleet PM reminders + SMS; optional tidy; landed cost (if needed).

## Migrations applied (forward-only, idempotent, in migrations/)
_01.._05 (quote/CRM authz + audit), _06 (team authz), _07 (payment authz), _08 (team.id text +
block_hard_delete), _09 (time_entries schema), _10 (atomic quote line items), _11 (permission-matrix
guard), _12 (delete authorization), _13 (onboarding), _14 (restore_time_entry — SD-6),
_15 (app_work_days — payroll sync), _16 (app_invoices — invoice sync), _17 (number_sequences +
next_number RPC), _18 (quotes.margin_bypass — No Margin), _19 (user_ui_prefs — menu customization),
_20 (pg_net + quote-approval notify trigger → notify-quote-approval edge function),
_22 (catalog item-master columns + backfill — Step 0), _23 (adjust_item_stock RPC — Step 0),
_24 (inventory_adjustments table + record_stock_adjustment RPC — Wave 1a),
_25 (wo_parts item_id/source/from_location — Wave 1b),
_26 (customers.parts_markup_pct — Wave 1c),
_27 (catalog.loc_pars — Wave 2a per-location reorder thresholds),
_28 (catalog.purchase_unit + conversion_factor — Wave 2d UoM conversion),
_29 (catalog.kit_components — Wave 2e kits),
_30 (catalog.photos — Wave 2f multi-photo),
_31 (catalog.bins — Wave 3b bin/shelf),
_32 (catalog.serialized + item_serials table — Wave 3c serial/lot + warranty),
_33 (count_sessions table — Wave 3d guided cycle counts),
_34 (team.invited_at + login_account_emails RPC — Team Login Status fix).
> Wave 2b + 2c + the fl loose ends + Wave 3a + Wave 3e needed NO migration (2b uses existing transfer machinery; 2c rides
> existing wo_parts columns; fl kit-on-quotes reuses the existing quote add-row path).
> NOTE: the vehicles session added `2026-09-19_20_assets-fleet.sql` and `_21_vehicle-attachments-issues.sql`
> (the dir sequence diverged from the ledger's internal _NN numbering — both exist).

### DB objects added this session (2026-09-25/27), applied directly via Supabase MCP
- **`time_off_requests` table** + RLS `tor_active_all` (build `ev`).
- **`job_photos.deleted` column** (build `ev`).
- **Vendor server-side authz** — `vendors_ins_office` / `_upd_office` / `_del_office`.
- **`wt_assign_del_supervisory`** — wt_assignments delete RLS.
- **`catalog.default_cost` widened → numeric(10,4)** (build `et`).
- **Inventory Step 0:** migrations **_22** (catalog item-master columns + backfill: 545 active = 487
  tracked + 58 nonstock) and **_23** (`adjust_item_stock` RPC). Backups `_bk_catalog_20260926_unify` /
  `_bk_inventory_20260926_unify`; legacy `inventory` table retained (no longer synced). Builds ex→ey.
- **Inventory Wave 1:** **_24** (`inventory_adjustments` + RLS + `record_stock_adjustment` RPC), **_25**
  (wo_parts item_id/source/from_location), **_26** (`customers.parts_markup_pct`). Builds ez→fd.
- **Inventory Wave 2a:** **_27** (`catalog.loc_pars jsonb`). Builds fe→ff.
- **Inventory Wave 2b + 2c:** NO migration. 2b (fg) reuses transfers + adjust_item_stock RPC + loc_pars;
  2c (fh) reserved stock = wo_parts source 'stock' + status 'reserved'.
- **Inventory Wave 2d:** **_28** (`catalog.purchase_unit text` + `catalog.conversion_factor numeric
  default 1`). Build fi.
- **Inventory Wave 2e:** **_29** (`catalog.kit_components jsonb default '[]'`). Build fj.
- **Inventory Wave 2f:** **_30** (`catalog.photos jsonb default '[]'`). Build fk.
- **Inventory Wave 2 loose ends:** NO migration (build fl). Kit-on-quotes + removed the 1U Cable
  Management Ring test part from WO 105798.
- **Backup snapshots:** `_bk_catalog_20260925`, `_bk_catalog_dedup_20260925`, `_bk_graybar_priceupd_20260926`, `_bk_graybar_reel_20260926`.
- **Assets / fleet objects** created in the prior Vehicles session — see `claude/vehicles-fleet-module.md`.

## Team Login Status fix — DONE (fr + migration _34) — LIVE-VERIFIED
The Team page "Login Status" column always read **No Login** for everyone — including the owner, who was
signed in. Root cause: the badge read `t.authUserId`, a field nothing ever set (the `team` table had no
`auth_user_id` column and no link to the login accounts in `profiles`); the team pull didn't map any
login field either; and the ✉ Invite button wrote `invited_at` to a non-existent column (silent fail).
- **Migration _34:** `team.invited_at timestamptz` (so a sent magic-link invite persists) + RPC
  `login_account_emails()` → lowercased emails of all login accounts (`profiles` ⋈ `auth.users`), office
  roles only (owner/manager/back_office), SECURITY DEFINER, granted to authenticated.
- **Client:** the badge is now computed by matching a roster row's email to a real login account
  (`_teamHasLogin` against `_loginEmails`, loaded once via the RPC in `renderTeam`, re-renders on arrival).
  Team pull maps `invitedAt: m.invited_at`. Edit-modal status uses the same match. Invite button shows only
  to team-managers on No-Login rows ("Re-invite" once invited). The magic-link invite itself already worked.
- **Sandbox:** loginstatus 14/14 (email match exact/case-insensitive/trim, empty/missing → false, set load
  + re-render, idempotent, badge state selection, empty-set graceful).
- **LIVE-VERIFIED (fr, owner):** Team page now shows **4 ✓ Active** (Joe Kucinski, Jordan Davis, TEST TECH,
  Test Tech #2 — the emails with real logins) and **16 No Login**; Invite button only on No-Login rows
  (screenshot). Read-only display logic — no test data written.
## Team page — button conformity + Jordan Davis role — DONE (fs) — LIVE-VERIFIED
- **Button conformity (fs, quotes.js):** hiding the ✉ Invite button on Active/no-email rows collapsed the
  row and misaligned the action columns (surfaced once the Login Status fix made 4 rows Active). Now the
  Invite button is ALWAYS rendered for team-managers; on rows that already have a login (or have no email)
  it's muted + disabled (`opacity:.5;cursor:not-allowed` + explanatory title) — the app's standard
  "not an option" pattern. All rows keep Edit · Journal · Review · Invite · Del in the same positions.
  LIVE-VERIFIED (4 muted Invite buttons on the Active rows; columns aligned; screenshot).
- **Jordan Davis role mismatch (DB fix, no migration):** his login `profiles.role` was `helper_tech`
  while his roster said manager. Corrected to `manager` (mirrors what `set_user_role` does: updated
  `profiles.role` + synced `team.role` by email). Applied via admin SQL because the owner-guarded RPC
  can't run under the MCP service connection (`current_app_role()` is null there). LIVE-VERIFIED: Team page
  shows Jordan as Manager (title + access + Active). His effective permissions upgrade on his next sync.

## UI polish — muted-button harmony, quote-list restyle (ft→fz) — LIVE-VERIFIED (owner-confirmed)
Iterative visual polish, no migrations. New reusable button classes added to index.html:
`btn-soft-blue`, `btn-soft-green`, `btn-outline-green`, `btn-ico` (icon button, min-width 34, centered).
- **ft/fu/fv:** the muted Team **Invite** chip: opacity fade (washed-out) → solid light-grey chip → final
  `background:#eceff1;border:1px solid #607d8b;color:#455a64` (slate border + text at the depth of the
  neighboring blue text). House "not-an-option" style.
- **fw:** same muted grey chip on the **Quote list** ▶ convert button when already converted (replaced
  its `opacity:.3` fade).
- **fx:** Quote-list **View/Dup** → `btn-outline` (crisp blue) to match Edit.
- **fy:** quote-list buttons → Option C soft-fill (later revised).
- **fz (current):** quote-list adopted **Option B** — View/Dup/▶/📧 are compact **icon** buttons
  (`btn-ico`, tooltips), only Edit/Approve keep labels; greens use crisp **btn-outline-green** (fixed the
  too-pale soft-green); **Del kept solid red** (btn-danger). Also: customer-name link deepened
  (`.cust-link` #1565c0→#0d3c78, +600 weight) and the **Total cell** set `white-space:nowrap` so the "$"
  no longer wraps above the number. reports.js + index.html.
  > OWNER FEEDBACK (open, not yet actioned): page still "not exactly on the spot" — deferred. Candidates
  > for a future crisp-up pass: soften the solid-red Del so it stops dominating the row; tone the red
  > status sub-notes (Needs Work/Critical/Aging) + red 0.0% margins to amber (reserve red for critical);
  > even out row height; consolidate the 3-line status. Joe said "I can live with that for now."

## Web version cursor
Latest: **v20260919fz** (Quote-list Option B icon buttons + darker customer name + Total nowrap).
Prior: **fy** (quote-list Option C soft-fill), **fx** (View/Dup outlined), **fw** (▶ muted chip),
**fv/fu/ft** (Team muted Invite chip iterations),
**fs** (Team button conformity — muted Invite button; + Jordan Davis role fix in DB),
**fr** (Team Login Status fix — truthful Active/No-Login badge; migration _34),
**fq** (Inventory Wave 3e — offline scanning; no migration; **WAVE 3 COMPLETE**),
**fp** (Wave 3d — guided cycle-count sessions; migration _33),
**fo** (Wave 3c — serial/lot + warranty; migration _32),
**fn** (Wave 3b — bin/shelf within a location; migration _31),
**fm** (Wave 3a — vehicle locations → Fleet assets link; no migration),
**fl** (Wave 2 loose ends — kit-on-quotes + removed the 1U Cable Management Ring test part),
**fk** (2f multi-photo + photo-grid; WAVE 2 COMPLETE), **fj** (2e kits), **fi** (2d UoM
conversion), **fh** (2c reserved stock), **fg** (2b truck replenishment), **ff** (2a per-location
reorder + Buy List; fe first cut), **fd** (Wave 1 complete), **ez→fd** (Wave 1), **ex/ey** (Step 0),
**ew** (vehicle reg/ins alerts), **ev** (time-off per-row + job-photo delete), **eu** (8-hour idle),
**et** (catalog cost round-trip + numeric(10,4)).
> Builds cf..es fall between `ce` and `et`; made in sessions not captured here.
Bump trailing letters per web release; SQL migrations run before the matching web files (or apply
directly via the Supabase connection).

## Verification method note
Highest-confidence items verified by live observation (real round-trips; rolled-back RLS/role
simulation; live getPermMatrix reads; direct Supabase MCP checks). Standing practice (Engineering
Standards): verify AS A REAL USER through the UI first, then confirm the data. Recent features
(numbering, No Margin, catalog imports, inventory unification, inventory Wave 1, Wave 2a–2f, the fl
kit-on-quotes loose end) were each driven through the running build in the browser and watched in the
live DB before being marked verified.
