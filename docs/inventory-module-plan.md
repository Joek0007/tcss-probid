# Inventory Module — Professional Review & Build Plan
**TCSS ProBid · drafted 2026-09-26 · status: WAVE 1 + WAVE 2 + WAVE 3 COMPLETE + LIVE-VERIFIED (build `fq`) — flagship roadmap is next**

Two jobs: (1) an honest review of the inventory item modal vs. how the national leaders build a
stock item, and (2) a concrete spec for Joe's three asks — correct quantities, pull an item onto a
WO/invoice, and add a one-off / non-stock item (incl. zero on hand). Joe's answers are in
"DECISIONS LOCKED." The competitive scan and the final scope call are in Sections 5–6. **Build status
is tracked in Section 7 (bottom).**

---

## DECISIONS LOCKED (2026-09-26, from Joe)

1. **Item Type (Stock / Non-stock / One-off / Service): YES** — the keystone.
2. **Zero/negative stock when issuing: a global SETUP TOGGLE.** OFF (default) = block issuing more
   than on-hand and offer to add it as one-off/non-stock so the line still lands; ON = allow, letting
   stock go negative (backorder).
3. **Parts billing = cost + markup:**
   - **Quote:** the quote's own margin/markup % (unchanged).
   - **WO → invoice:** markup from a **customer-level default** that overrides a new **global default**
     (global % → customer % → line).
   - **Adjust markup at invoice time:** allowed, **permission-gated** (`invoice.adjustmarkup`). An
     editable markup % on the invoice, pre-filled customer→global, locked unless permitted.
4. **Who can adjust counts:** managerial. Owner auto; every other role granted manually via
   `inv.adjust` (default off for non-owners).
5. **Catalog ↔ inventory: UNIFY** into one item master.
6. **Item-master fields: my call** — intuitive + powerful. Item Type, Photo, Unit of Measure,
   Manufacturer + Mfr Part #, Vendor, Active/Discontinued, plus the existing common fields, laid out
   so the quick path stays simple and power fields don't clutter it.

**New settings/permissions:** `allowNegativeStock` (toggle), `partsMarkupPct` (global) + customer
override, `inv.adjust`, `invoice.adjustmarkup`.

---

## 1. What exists today (grounded in the code)

**Item modal** captures: Name*, Category (free text), Part/Item #, Barcode/UPC, Min Stock (def. 1),
Unit Cost, Returnable, Main Shop Qty, Notes; hidden auto asset-tag + a dead "legacy" location field.

**Good machinery already here:** multi-location (shop + 15 trucks); checkout/check-in/transfer
**scanner** w/ phone-camera barcode; **split PO receiving** (job vs stock, per location); low-stock
dashboard alert; CSV price-book import; QR label printing.

**Three things that shape Joe's asks:** (1) quantities only correctable for Main Shop, via the full
Edit modal, no log; (2) the WO "Request a Part" form is free text and never touches inventory —
only the scanner issues stock; (3) parts don't bill onto invoices (code: *"parts are not
auto-priced into invoices yet"*).

---

## 2. Review — what's wrong / missing

### 2a. Actually wrong
- **Catalog and inventory are two disconnected stores** → **UNIFY (decision #5).** ✅ done (Step 0)
- **Receiving matches by item *name*** → silent stock loss; match on barcode/part#/SKU. (still open)
- **Every stock item gets an asset tag** → tags are for serialized assets, not bulk consumables. ✅ (Wave 1d)
- **Inventory "locations" are hardcoded, separate from the Fleet module** → point vehicle locations
  at the Fleet `assets` table. ✅ done (Wave 3a, fm)
- **Reorder point is one global number (def. 1)** → not per-location. ✅ done (Wave 2a)

### 2b. Missing vs. leaders (★ = non-negotiable for a paid product)
Item **photo** ★ ✅; **UoM + purchase→stock conversion** ★ ✅ (Wave 2d); **Manufacturer + Mfr Part #** ★ ✅;
**preferred/multi-vendor sourcing** ★ ✅ (preferred vendor); **Active/Discontinued** ★ ✅; reorder qty/Max
✅ (Wave 2a); bin/shelf ✅ (Wave 3b); serial/lot + warranty ✅ (Wave 3c); offline scanning ✅ (Wave 3e);
lead time + safety stock (roadmap); richer cost model; structured description, taxable, sell price;
**managed Category list**.

---

## 3. Joe's three asks — spec

Keystone = **Item Type: Stock · Non-stock · One-off · Service.**

**3a. Quantity Correction modal (Ask #1).** Dedicated modal (not Edit Item), "Adjust Qty" per list
row, gated to `inv.adjust`. Shows qty at **every** location (shop + trucks), **Set to** a count or
**+/−** a delta per location, required **reason** (Count/Damaged/Lost/Found/Initial/Other), writes an
**adjustment log** (old→new, delta, reason, who, when) + immediate cloud push.

**3b. Add-Item picker (Asks #2 & #3).** One shared picker for the WO Parts tab and the invoice line
editor: search the unified master → pick → see on-hand per location + cost → From stock (decrement),
Order it, Non-stock/special order, or + one-off. Zero/negative follows the `allowNegativeStock` toggle.

**3c. Parts bill (decision #3).** Parts become billable invoice lines priced cost + markup per the
rules in DECISIONS. One-off lines bill at their entered price.

---

## 4. Decisions — all six answered (see top).

---

## 5. Competitive scan → net-new ideas (2026-09-26)

Scanned ServiceTitan, Sortly, inFlow, Fishbowl, and a field-service roundup (Jobber, Housecall Pro,
BuildOps, ServiceTrade). **Strategic finding:** Jobber and Housecall Pro don't do real inventory —
both outsource to the same third-party (Ply) — and *no one* has a native distributor-catalog
connector. A strong native module + distributor integration is a genuine differentiator.

| Idea | Source pattern | Placement |
|---|---|---|
| **Reserved / committed stock** | ServiceTitan, BuildOps | **Wave 2c ✅** |
| **On-Order on the item** | ServiceTitan | **Wave 1 ✅** |
| **Favorites / fast-add** | Housecall Pro | **Wave 1 ✅** |
| **Kits / material bundles** | Fishbowl BOM, ServiceTitan | **Wave 2e ✅ (WO + quote fl)** |
| **Truck replenishment "to par"** | ServiceTitan, BuildOps | **Wave 2b ✅** |
| **UoM purchase→stock conversion** | inFlow | **Wave 2d ✅** |
| **Multi-photo + photo-grid view** | Sortly | **Wave 2f ✅** |
| **Guided cycle-count sessions** | inFlow, ServiceTitan | **Wave 3d ✅ (fp)** |
| **Serial/lot + warranty** | Fishbowl, inFlow | **Wave 3c ✅ (fo)** |
| **Bin/shelf within a location** | Fishbowl, inFlow | **Wave 3b ✅ (fn)** |
| **Vehicle locations → Fleet assets link** | (TCSS-specific) | **Wave 3a ✅ (fm)** |
| **Offline scanning + scan→stack→swipe** | Sortly, BuildOps | **Wave 3e ✅ (fq)** |
| **Smart recommended reorder point** | inFlow | Flagship roadmap (needs usage history) |
| **Distributor catalog integration** | ServiceTitan P2P | **Flagship roadmap** (spike first) |
| Weighted-average / landed cost; rich label designer | Fishbowl, Sortly | **Skip for now** |

---

## 6. PARTNER SCOPE DECISION (Claude, as 50/50 partner — 2026-09-26)

Principle: **ship Joe's asks + the unification they sit on + only the cheap adds that ride along for
free; deliver fast, verify each drop live, then layer power features** — as sequential delta drops.

**Step 0 — unify catalog + inventory.** ✅ DONE (ex→ey).
**Wave 1 — Joe's asks + free wins.** ✅ DONE (ez→fd).
**Wave 2 — operational power** (UoM, reserved stock, per-location reorder + Buy List, truck replenish,
kits, multi-photo). ✅ DONE (fe→fl, incl. fl loose ends).

**Wave 3 — depth.** ✅ COMPLETE (fm→fq).
- **3a — Vehicle locations point at the Fleet `assets` table.** ✅ (fm, no migration).
- **3b — Bin/shelf within a location.** ✅ (fn, migration _31).
- **3c — Serial/lot + warranty.** ✅ (fo, migration _32).
- **3d — Guided cycle-count sessions (flagship).** ✅ (fp, migration _33).
- **3e — Offline scanning.** ✅ (fq, no migration).

**Flagship roadmap (own phase, NEXT — awaiting Joe's go-ahead):**
- Distributor catalog integration (Graybar/Anixter/Wesco) — feasibility spike first.
- Smart recommended reorder point + optional auto-PO — once usage history has accrued.
- Weighted-average / landed cost — only if a real need shows up.

**Deliberately skipped for now:** weighted-average cost, rich label designer.

Every wave shipped the usual way — delta zip for web files, SQL applied directly and certified,
verified live as a real user before handoff.

---

## 7. BUILD LOG — Step 0 + Wave 1 + Wave 2 + Wave 3 COMPLETE (2026-09-26/27, builds `ex` → `fq`)

**Everything in Step 0, Wave 1, Wave 2 (incl. fl loose ends), and Wave 3 (3a–3e) is built, sandbox-tested
on the real functions, and live-verified as a real user in the running app, with cloud round-trips
confirmed in Supabase and all test data cleaned back to the baseline (545 active master / 487 tracked).**
Full engineering detail is in `claude/risk-ledger.md`; the summary:

**Step 0 — item-master unification (`ex`→`ey`, migrations _22/_23).** `catalog` is the single item
master; `DB.inventory` derived from `DB.catalog.filter(tracked)`; stock moves through the
`adjust_item_stock` SECURITY DEFINER RPC. LIVE-VERIFIED.

**Wave 1 (`ez`→`fd`, migrations _24/_25/_26).** 1a Quantity Correction + `inv.adjust` + adjustment log;
1b Add-Item picker; 1c parts→invoice billing + markup + `invoice.adjustmarkup`; 1d item-modal rebuild;
1e Favorites. All LIVE-VERIFIED.

**Wave 2 (`fe`→`fl`, migrations _27/_28/_29/_30; 2b/2c + fl needed none).** 2a per-location reorder + Buy
List; 2b truck replenishment; 2c reserved stock; 2d UoM conversion; 2e kits; 2f multi-photo + photo grid;
fl kit-on-quotes. All LIVE-VERIFIED.

**Wave 3 (`fm`→`fq`, migrations _31/_32/_33; 3a + 3e needed none):**
- **3a — Vehicle locations → Fleet assets link** (fm, no migration). `assetId` on the blob-synced
  `invLocations`; `getLocationName` resolves to the fleet name; Settings picker + "🚚 Sync from Fleet".
  fleetlink 19/19. LIVE-VERIFIED.
- **3b — Bin/shelf** (fn, migration _31 `catalog.bins`). Per-location bin map; shop bin field + truck bins
  in the per-location editor; shows on list/grid/picker/breakdown. bins 20/20. LIVE-VERIFIED.
- **3c — Serial/lot + warranty** (fo, migration _32 `catalog.serialized` + `item_serials`). Unit registry
  (add/bulk/install→WO auto-fills customer), warranty state badges + rollup, list chip. serials 26/26.
  LIVE-VERIFIED.
- **3d — Guided cycle-count sessions** (fp, migration _33 `count_sessions`). Assignable count sheets, live
  variance, review gate, post through the audited `record_stock_adjustment` RPC (matches/uncounted
  untouched). counts 30/30. LIVE-VERIFIED.
- **3e — Offline scanning** (fq, no migration). Every stock move applies locally + queues its cloud write
  when offline/failed (`DB.stockSyncQueue`, per-item idempotent), auto-flush on reconnect + inside
  pushAllToCloud; scanner offline/pending banner + Sync now. offline 20/20. LIVE-VERIFIED.

**Sandbox suites (all green):** unify 19, adjust 8, picker 18, billing 15, itemmodal 17, favorites 6,
buylist 18, replenish 15, reserved 18, uom 7, kits 10, photos 8, quote-kits 5, fleetlink 19, bins 20,
serials 26, counts 30, offline 20. **Migrations applied:** _22–_33. **Version cursor: `fq`.**

**NEXT: flagship roadmap** — distributor catalog integration (spike first); smart recommended reorder
point (needs usage history); landed/weighted-average cost only if needed. Not started — awaiting go-ahead.

**Deferred / noted:** managed Category list + receiving-match-on-part# (Wave 1 item-modal); serial
auto-consume in the Add-Item picker (registry "mark installed" covers the WO/customer link today).

---

### Sources (competitive scan)
ServiceTitan (inventory items, P2P procurement, counts, reserved/staged/on-site model); Sortly
(photo-first grid, custom fields, mobile quick-actions, labels); inFlow (recommended reorder point,
3-role UoM conversion, color-coded counts, transfer-to-truck); Fishbowl (auto-PO, BOM/kits,
serial/lot/warranty, landed cost); Housecall Pro (price-book favorites, cost/price split);
Jobber & Housecall Pro both outsource inventory to Ply (validates a native module).
