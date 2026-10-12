# ProBid User Manual — maintenance notes

**What lives here**
- `claude/probid-user-manual.md` — the living, readable manual (renders in claude.ai). This is the human-facing copy of the current content.
- `claude/manual-src/build_manual.js` — the **single source of truth**. Running it produces BOTH the polished Word file and the Markdown twin above, from the same content, so they never drift.

**Current version:** Version 9 · October 2026 · aligned to app software build **v20260919jr** (updated 2026-10-12). Latest docx: `TCSS_ProBid_User_Manual_20261012_vjr.docx`.

**Page numbers:** the .docx now has a footer on every page — `TCSS ProBid User Manual   Page N of M` (centered). It uses `titlePage: true` with an empty `footers.first` so the **cover page carries no number**, and `footers.default` with `PageNumber.CURRENT` / `PageNumber.TOTAL_PAGES`. Footer page numbers count the cover as page 1, so the Contents page numbers (which cite physical pages) line up with the footer.

**How to update the manual (do this whenever a user-facing feature ships):**
1. Read `claude/manual-src/build_manual.js` and edit the relevant chapter's content (the `A(H2(...))`, `A(body(...))`, `A(bullets([...]))`, `A(callout(...))` calls read top-to-bottom in document order).
2. Bump the version/build stamp: the cover line and footer line near the top and bottom of the script, the MD header line, and the output filename (`TCSS_ProBid_User_Manual_<date>_v<build>.docx`).
3. Rebuild:
   ```
   node build_manual.js          # writes the .docx AND TCSS_ProBid_User_Manual.md
   ```
   (docx-js: if `require('docx')` fails, `npm install docx` in the working dir — note `require('docx/package.json')` is blocked by its exports map, so version-check another way.)
4. If content shifted pages, refresh the static Contents page numbers. Reliable recipe (worked again 2026-10-12):
   ```
   soffice --headless --convert-to pdf --outdir . <the>.docx     # direct soffice; the skill's soffice.py timed out
   pdfinfo <pdf> | awk '/^Pages:/{print $2}'                     # page count
   # per chapter: loop pages 3..N with `pdftotext -f P -l P -layout <pdf> -`
   #   a chapter's page = first page >2 whose lines contain the exact H1 title (monotonic — never step back a page)
   ```
   Update the `TOC = [...]` array with the new numbers and rebuild once. (Editing only the digits — not adding/removing rows — does not repaginate, so one rebuild is enough. Adding a NEW chapter row can shift pages, so measure after adding it, then update digits + rebuild once more.)
5. Re-store both outputs in the project:
   - `project_write claude/probid-user-manual.md` (local_path = the regenerated `.md`)
   - `project_write claude/manual-src/build_manual.js` (local_path = the edited script)
   - Deliver the regenerated `.docx` to the user with SendUserFile (the Projects API can't store binary `.docx`, so the Word file is delivered in-conversation, not stored here).

**Engineering Standards doc:** `claude/manual-src/build_engineering_doc.js` is a small companion generator (same branding/palette as the manual) that converts `claude/engineering-standards.md` into a branded `TCSS_ProBid_Engineering_Standards_<date>.docx` for Joe's records. It is a generic Markdown→docx converter (headings, bullets, numbered steps, blockquote→NOTE callout, inline `**bold**` and `` `code` ``), so to refresh it: re-store the latest `engineering-standards.md` locally, run `node build_engineering_doc.js engineering-standards.md`, and deliver the docx with SendUserFile.

**Style:** plain-English for all staff (office + field); TIP / NOTE / IMPORTANT callouts via `callout(...)`; chapters are self-contained (fold new features into the relevant chapter, don't append "New in..." sections).

**History:**
- 2026-09-21 (v20260919eg): folded in the full 8-role permission system (was 5) + custom roles, live role changes with no sign-out, owner-only role assignment, pay-visibility (owner-only + "Sees Pay"), the editable Executive Summary on quotes, tool assemblies (kits), the absence/urgent-WO texts, and Work-Tracking access following the linked work order.
- 2026-09-23 (v20260919em): client approval portal, send-proposal-from-ProBid (Review & Send), proposal response alerts (email/text), and the "Emails & Notifications — How They Work" chapter.
- 2026-09-26 (v20260919ew): **added page numbers** (footer, cover excluded); **new Vehicles / Fleet chapter** (fleet list, vehicle profile, logging WOs against a vehicle, field-reported vehicle issues, registration/insurance expiration alerts); folded in first-time invite password set + 8-hour idle sign-out, the New-User Access Policy, job-photo delete→Recycle Bin, WO vehicle picker, priced WO parts, and office-only vendor management. TOC grew from 25 to 26 chapters.
- 2026-09-27 (v20260919fz): **new Inventory (Stock, Parts & Counts) chapter** (unified item master, Add-Item picker, par-aware Buy List, truck replenishment, reserved/committed stock, buy-by-the-box unit conversion, kits/bundles, bin/shelf locations, serial/lot tracking with warranty, guided cycle counts, offline-safe scanning) inserted as chapter 15 between Tools and Vehicles; Team "Login Status" section; Quotes "Quote-Row Action Buttons" + "Adding Catalog Items & Kits"; Invoices "Parts on an Invoice (cost + markup)"; Customers "Parts Markup %"; Settings "Inventory Settings"; a "Physical Inventory Count" workflow; new inventory tips. TOC grew from 26 to 27 chapters; page numbers re-measured. Also added the companion Engineering Standards generator (see above).
- 2026-10-08 (v20260919jc): new **Expenses & Per-Diem** chapter (Expenses review workspace — approve/flag/reimburse, filters, CSV; configurable expense categories; Per-Diem tracker — flat nightly rate, partial payments, WO link as internal job cost). Folded expense alerts into Emails & Notifications, the per-diem rollup into Work Orders, and the Expenses/Per-Diem page permissions into Roles. TOC grew from 27 to 28 chapters.
- 2026-10-12 (v20260919jr): documented the **streamlined fleet work-order flow** in the Work Orders and Vehicles / Fleet chapters. Fleet work orders now start from the Vehicles area (a vehicle's 🔨＋ / in-vehicle 🔨 ＋ Work Order / profile + New Work Order, the Vehicles-page **＋ New Work Order** button, or the sidebar **＋** on Vehicles) and open straight into **fleet mode**: no customer/contact (it's the company fleet), pick the truck from a vehicle dropdown, **Service Type defaults to Vehicle Maintenance**, and the customer-only fields/tabs are hidden (job-site address, labor rate/tax, Field Docs card, and the Field Log / Phases / Field Docs tabs). Rewrote the WO "Creating a Work Order" NOTE and the Vehicles "Logging Work on a Vehicle" section. No chapters added; only the final chapter shifted (page 31 → 32), so one TOC digit was re-measured and updated.
