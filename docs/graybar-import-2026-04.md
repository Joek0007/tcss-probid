# Graybar Pricebook Import — April 2026 (done 2026-09-26)

Source: `TCSS_Graybar_Pricebook_4-2026.xlsx` (sheet "TCSS Cust"), 226 line items across 14 Graybar categories, each with manufacturer, Graybar material #, mfr catalog #, terse description, customer price, and UoM.

## What was done

**Overlap check (by part number):** 226 Graybar items → **65 already in the catalog** (30 matched on Graybar material #, 35 on mfr catalog #), **161 new**.

**Descriptions rewritten:** Graybar's shorthand ("12IN CABLE RWAY TUBE GRY", cryptic reel part-codes) was expanded into plain-language descriptions the techs can read. Joe reviewed and approved them. A review spreadsheet (`TCSS_Graybar_Import_Review.xlsx`) with status + improved descriptions was delivered.

**161 new items imported** into BOTH `inventory` and `catalog`:
- qty = 0, min_qty = 0 (quantities intentionally not imported)
- cost = Graybar "Cust Price" (`inventory.unit_cost` / `catalog.default_cost`)
- `part_num` = mfr catalog #; `notes` = "Graybar #<material> | Mfr: <mfr> <catalog#> | Vendor: Graybar"
- category = cleaned Graybar category (e.g. "Racks & Cable Runway", "Fiber Hardware")
- name = the improved description
- **batch tag `import_batch = 'graybar-2026-04'`** on every row (reversible)
- Import cost sum: **$29,467.56**. Catalog now **546 active**, inventory **488 active** — live-verified in-app after Joe re-signed in (new items render with costs; counts confirmed).

**Price refresh on the 65 existing items:** Joe asked to update the Graybar cost where it differs. Of 65, 63 differed — but **7 were unit/pack mismatches, not price changes** (copying Graybar's price would have inflated per-each/per-foot items 8–1000×). Only the **56 like-for-like** changes were applied (to both `inventory.unit_cost` and `catalog.default_cost`); prior costs saved in `public._bk_graybar_priceupd_20260926` (56 inventory + 56 catalog rows). Spot-verified: 45U open rack $788.40→$821.04, butt-splice kit $9.80→$11.74, 19in rack $208.59→$207.98; J-hook untouched at $3.91.

## The 7 skipped (left as-is by Joe's decision)

Unit/pack basis differs between Graybar and the existing catalog item, so no price change was made:
- CAT6 CMP cable, blue & white — his per-foot (~$0.30) vs Graybar $283.32 per 1000ft reel (already consistent)
- 2in cable J-hook — $3.91 each vs Graybar $295.81 per box of ~100
- Low-voltage mounting bracket (Caddy) — $2.57 each vs Graybar $194.29 per box
- B-Drop aluminum wire holder — $0.93 each vs Graybar $162.01 per reel/box
- EZ-RJ45 Cat6 plugs — $0.77/ea in a 100-pk vs Graybar $79.28 per box of 100 (already consistent)
- Media converter MM LC — $34.80 vs Graybar $298.60 (8.6× — flagged to verify; not a clean like-for-like)

## Cable & fiber converted to PER-FOOT pricing (done 2026-09-26)

Joe confirmed his team quotes cable/fiber by the foot, so the 21 new cable/fiber items (of the 161)
were converted from Graybar's per-reel price to per-foot, using the **UoM column as the exact divisor**
(not a guess — Graybar states the pricing basis): copper cable UoM=1000 → ÷1000; fiber cut-reels
UoM=100 → ÷100 or UoM=1000 → ÷1000. Examples: Cat6 $283.32/1000 = **$0.2833/ft**, RG6 $82.59/1000 =
**$0.0826/ft**, Corning 12-strand $1693.73/1000 = **$1.6937/ft**, Berk-Tek 6-strand $228.10/100 =
**$2.281/ft**. `unit` set to **`ft`** on all 21 (both tables). The two copper items that were "already in
list" were left untouched (already per-foot).

**Precision fix (root cause):** `catalog.default_cost` was `numeric(10,2)` while `inventory.unit_cost`
is `numeric(10,4)`, so per-foot catalog costs were truncating to whole cents (RG6 $0.08259 → $0.08,
~3% low). Widened `catalog.default_cost` to `numeric(10,4)` (non-destructive) and re-wrote the 21
per-foot values at full precision. Catalog now matches inventory precision for all future per-foot/
per-unit vendor costs. Live-verified in-app: Cat6 renders "| ft | Mat: $0.28" (stored 0.2833), Corning
fiber "| ft | Mat: $1.69" (stored 1.6937) — display rounds to cents, quote math uses full precision.

**Reversibility:** old per-reel costs + divisors saved in `public._bk_graybar_reel_20260926` (21
inventory + 21 catalog rows).

## Reversibility (all changes)

- Remove the 161 new items: `delete from inventory where import_batch='graybar-2026-04';` and same for `catalog` (or soft-delete via `is_active=false`).
- Roll back the 56 price updates: restore `old_cost` from `public._bk_graybar_priceupd_20260926` by row id.
- Roll back the per-foot conversion: restore `old_cost` from `public._bk_graybar_reel_20260926` by row id (and set `unit` back if desired).
