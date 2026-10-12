# TCSS ProBid — User Manual

*Business Management System for Field Service Operations*

Total Communications Systems & Solutions, Inc.  ·  Asheboro, NC  ·  336-629-7474

**Version 9 · October 2026 Update** — Updated October 12, 2026 · Software build v20260919jr

> This Markdown copy is the living, project-stored version of the manual. The polished Word (.docx) version is generated from the same source (`build_manual.js`); keep both in step when updating.

---


## What's New in This Version

If you have used ProBid before, here is a quick tour of what changed since the last manual. Every item below is explained in full in its own chapter.

### Big changes

- **An Expenses review workspace.** The office can now review every expense techs log across all work orders from one page — approve them, flag off-policy charges (which alerts the office), track out-of-pocket reimbursements, filter and export. See **Expenses & Per-Diem**.
- **A Per-Diem tracker.** Track overnight travel pay owed to techs at a flat rate per night, record partial payments by check / digital / cash with a running balance, and optionally link a per-diem to a work order so it counts toward that job's cost. See **Expenses & Per-Diem**.
- **Configurable expense categories + office expense alerts.** The expense-category list techs pick from is now editable (add / remove / reorder) in Managed Services, and the office is alerted in the notification bell when a tech logs an expense or an expense is flagged. See **Expenses & Per-Diem** and **Emails & Notifications**.
- **A redesigned sidebar.** The menu is now grouped into six plain-English sections — Sales, Jobs, Billing, Contacts, Field & Time, and Office / Admin — with the Dashboard as a standalone Home link at the very top.
- **A menu you control.** Star your most-used pages to a Favorites group, drag items into the order you like, collapse sections you rarely open, and hide pages you never use. Owners can save a starting layout for the whole company.
- **A dashboard you arrange.** Show or hide the tiles and panels you care about, drag them where you want, and stretch a panel taller to see more at once. A Reset button always brings back the clean default.
- **The browser Back and Forward buttons work.** You are no longer trapped on a screen — Back returns you to the previous page, and you can right-click a menu item to open it in a new tab.
- **A client approval portal.** Send a customer a link to review their proposal in plain English and approve it (or request changes) with an online signature — no printing, no clipboard copy-and-paste.
- **Send proposals straight from ProBid.** “Email to Customer” now opens a **Review & Send** window with a live preview and editable recipients, and sends the proposal — with the PDF attached — from your own company email address, so customers can just hit Reply. See **Quotes**.
- **Proposal response alerts — email and text.** When a client approves or requests changes, ProBid alerts the office by **email and/or text**, to as many people as you choose (and, if you like, the person who built the quote), on top of the in-app bell. You set it all up in **Settings → Notifications → Proposal Response Alerts**. See **Emails & Notifications**.
- **“No Margin” pricing.** Managers can price a specific quote at cost, on purpose and on the record, without fighting the margin warnings.
- **Roles and permissions that actually work — and eight of them.** Every permission checkbox now truly governs what a role can do (buttons, pages, and the action behind them), there are eight built-in roles plus any custom roles you create, and changing someone’s role takes effect for them live, without them signing out. See **Roles, Permissions & User Access**.
- **Editable Executive Summary on quotes.** ProBid writes a professional summary from your line items automatically, and clicking Edit now shows you that exact text so you can fine-tune it for one quote. See **Quotes**.
- **Tool assemblies (kits).** Group a set of tools that travel together — a drill/impact combo, a meter with its leads — under one asset tag so the whole kit checks out and comes back as a unit. See **Tools, Inventory & Purchase Orders**.
- **A Vehicles / Fleet area.** Your company vehicles are now first-class records (not fake “customers”): log work orders against a vehicle, track per-vehicle cost, let techs report vehicle problems from the field, and get warned when a registration or insurance is about to expire. See **Vehicles / Fleet**.
- **A rebuilt Inventory module.** Inventory and the price catalog are now one item master, so every item carries a real cost, an item type (Stock / Non-stock / One-off / Service), unit of measure, manufacturer, vendor, and photos. On top of that you get: a **Quantity Correction** tool with an audit log, an **Add-Item picker** that pulls parts onto work orders and bills them, **per-location reorder points** that drive a par-aware **Buy List**, **one-click truck replenishment**, **reserved (committed) stock**, **buy-by-the-box / stock-by-the-foot** unit conversion, **kits/bundles**, **multiple photos with a grid view**, **bin/shelf locations**, **serial/lot tracking with warranty**, **guided cycle counts**, and **offline-safe scanning**. See the new **Inventory (Stock, Parts & Counts)** chapter.
- **Truthful Team “Login Status.”** The Team page now shows accurately who actually has a sign-in — ✓ Active, ⏳ Invite Sent, or No Login — matched to real login accounts, instead of always reading “No Login.” See **Team**.

> **TIP:** Right after any update, press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac) once to load the newest version. If something looks like it is behaving the old way, that is almost always the fix.

## Getting Started

### What ProBid Is

TCSS ProBid is the all-in-one system for running the business — from the first quote to the final invoice. It handles quotes, work orders, dispatch, field time tracking, invoicing, managed-services contracts, and team communication, all in one place that everyone shares.

> **NOTE:** ProBid runs in your web browser. Use Google Chrome for the best experience. It works on a desktop, a laptop, a tablet, and a phone — the layout adjusts to the screen.

### Signing In

1. Open Chrome and go to **https://joek0007.github.io/tcss-probid/**
2. Sign in with your TCSS email and password.
3. What you can see and do depends on your role — see **Roles, Permissions & User Access**.

> **NOTE:** New accounts do not get in automatically. A new person can sign in but only sees an “Account Pending Approval” screen until an owner approves them and assigns a role. See **Signing Up & Account Approval**.

#### First-time sign-in with an invite link

If the office invites you by email, you’ll get a one-time sign-in link. The first time you use it, ProBid asks you to **set your own password** before you reach the app — so your account is yours from the start. After that you sign in normally with your email and that password.

> **NOTE:** For your security, ProBid signs you out automatically after **8 hours** of no activity — long enough to work a full day without interruption, but a shared or forgotten device won’t stay open indefinitely. Just sign back in to continue.

### Finding Your Way Around

The left sidebar is your main menu. At the very top is a standalone **Dashboard** (your home screen). Below it, every page is grouped into six sections that follow the flow of the work:

- **Sales** — Quick Quote, Quotes, Price Catalog, Job Templates.
- **Jobs** — Active Jobs, Work Orders, Dispatch Board, Work Tracking, Calendar.
- **Billing** — Invoices, Contracts, Managed Services, Purchase Orders.
- **Contacts** — Customers, Contacts, Team, Vendors.
- **Field & Time** — Field Activity, Timesheet, Inventory, Tools, Scanner, Vehicles.
- **Office / Admin** — Reports, Audit Log, Recycle Bin, Settings.

The top bar shows your name, the notification bell, and a shortcut to start a new quote. Click any menu item to go to that page.

#### The Back button works now

Your browser’s **Back** and **Forward** buttons move you between the pages you have visited, just like any website. If you were on Work Orders and jump to Invoices, Back returns you to Work Orders with your list intact. You can also **right-click** (or Ctrl+click / middle-click) a menu item to open that page in a new browser tab — handy when the office wants two screens open at once.

> **NOTE:** If you have an unsaved quote or work order and try to leave, ProBid still stops you with a “stay or leave” message so you don’t lose your work. That safety net is unchanged.

### Making the Menu Your Own

You can shape the sidebar to match how you work. Your changes are saved to your account and follow you to any device or browser you sign in on.

- **Favorites.** Hover a menu row and click the star to add that page to a **Favorites** group that floats to the top. Stars appear on hover so the menu stays clean.
- **Reorder by dragging.** Use the small grip handle to drag favorites into the order you want, and (in the Customize Menu panel) drag pages within a section or reorder the sections themselves.
- **Collapse sections.** Click a section heading to fold it closed; click again to open it. Use **Collapse all / Expand all** at the top to do it in one move. Your choices are remembered.
- **Hide pages you never use.** Open **Customize Menu**, uncheck any page to hide it, and click **Reset to default** any time to bring everything back. (The Dashboard can never be hidden, so the menu can’t be emptied.)
- **Quick-add “+” shortcuts.** Many menu items show a small “+” on the right. Click it to jump straight into creating that kind of record — the “+” on Quotes opens a new Quick Quote, the one on Customers starts a new customer, and so on.

> **TIP:** Owners can set a starting layout for everyone. Arrange the menu the way most of the crew should see it, then use **Save as company default** in the Customize Menu footer. New people inherit it, and anyone can still personalize their own on top.

> **NOTE:** Personalizing the menu never gives anyone access they aren’t allowed to have. It can only tidy up the pages a role already sees — it can never reveal a page your role is not permitted to open.

### After an Update: Hard Refresh

Whenever ProBid is updated, do a hard refresh so your browser loads the newest version: **Ctrl+Shift+R** on Windows, **Cmd+Shift+R** on a Mac. If something looks wrong, stuck, or missing right after an update, a hard refresh is almost always the fix.

## The Dashboard

The Dashboard is your home screen and daily starting point — a real-time snapshot of the business without clicking into each module.

### What the Tiles Show

- **Total Quotes** — quotes in the system across all statuses.
- **Revenue Won** — total value of quotes marked Won.
- **Active Jobs** — jobs currently open and in progress.
- **Clocked In** — how many techs are on the clock; click to open Field Activity.
- **Avg Project %** — average completion across active projects.
- **Tools Out** — tools currently checked out.
- **Follow-Ups Due** — quotes that need a follow-up today.
- **Open Flags** — items flagged for attention.
- **Open WOs** — work orders currently open.

### The Panels

- **Field Activity** — every tech with their current status (Not Started, Clocked In, On-Site). Click a name to see their assignment.
- **Quote Pipeline** — a visual funnel: Draft → Sent → Follow-Up → Won → Lost. Click a bar to filter quotes by that status.
- **Active Jobs & Project Progress** — current jobs with customer, techs, and completion percentages, with budget-vs-actual tracking.

### Personalizing Your Dashboard

The dashboard is yours to arrange — like the menu, your layout is saved to your account.

- **Show or hide** any tile or panel with the **⚙ Customize** button, so you only see what matters to you.
- **Drag to move** a panel by its grip handle, and **drag the top KPI tiles** into the order you prefer.
- **Resize and stretch.** Drag a panel’s side to make it wider or its bottom edge to make it taller. A stretched panel shows more — Field Activity, for example, reveals more employees instead of just adding blank space.
- **Reset** returns the dashboard to the clean default at any time, so you can experiment freely.

> **TIP:** Check the Dashboard first thing every morning. **Follow-Ups Due** and **Open Flags** are your priority signals for the day. Owners can also **Save as company default** to give everyone a sensible starting dashboard.

## Quotes

The Quotes module handles the full lifecycle from a first estimate to an approved job. **Quick Quote** is the fast version for phone calls and walk-ins; the full Quotes page manages every quote over its life.

### Creating a Quote

1. Click **+ New Quote** (top right), or use the **+** beside **Quotes** in the sidebar for a Quick Quote.
2. Select or create the customer.
3. Add line items — description, quantity, unit price.
4. Set payment terms and the number of days the quote is valid.
5. Save as **Draft**, or send it to the customer.

### Your Work Is Protected

Quotes guard against accidental loss at every step:

- A toast confirms when a new quote begins.
- A couple of seconds after you fill in both **Customer** and **Job Name**, the quote auto-saves with a quote number — even before you add a single line item — and a green toast confirms “your work is protected.”
- If you click away by accident, an in-app warning lets you stay or leave; your draft is already saved.
- If your session times out, a blue **“Unfinished quote — Resume”** banner appears when you sign back in so you can pick up exactly where you left off.

### Rich-Text Scope of Work

The **Scope of Work** field (and Work Requested / Work Performed on work orders) has a full formatting toolbar — click inside the field to reveal it. You can apply bold, italics, and underline, build bulleted and numbered lists, set Header or Normal styles, and indent. The toolbar hides when you click away.

> **TIP:** Formatting your scope with short bullet points reads clearly for the customer — and the client approval portal now shows it in clean, plain English rather than raw text (see **The Client Approval Portal**).

### The Executive Summary

Every proposal opens with an **Executive Summary** — a short, professional paragraph that introduces the project to the customer. ProBid writes one for you automatically, reading the actual line items on the quote: it names the systems involved (cameras, access control, structured wiring, and so on), counts things like cameras and doors, and adjusts the tone to the job’s environment. This is what prints on the proposal unless you replace it.

To tailor it for a specific quote, click the **Executive Summary** heading (the ✏️ pencil) on the quote, or **Edit Summary** on the print preview. The editor now opens showing the **exact summary that will print** — the auto-written text — so you can tweak a sentence or rewrite it entirely instead of starting from a blank box.

- **Leave it unchanged** and it keeps auto-generating — if you add or change equipment later, the summary updates to match.
- **Edit the wording** and your version is saved as a custom summary for **that one quote** only; it no longer changes when the line items change.
- **Clear the box** (or use Reset) to drop your custom text and go back to the auto-written summary.

> **NOTE:** The Executive Summary is per-quote — editing one quote never changes any other quote or a company-wide default. Assumptions and Exclusions, by contrast, are company-wide defaults set once for all proposals.

### Quote Statuses

- **Draft** — not yet sent to the customer.
- **Sent** — emailed or delivered.
- **Follow-Up** — awaiting response; shows on the Dashboard.
- **Won** — approved; creates an Active Job.
- **Lost** — customer went elsewhere or declined.
- **Declined** — customer explicitly rejected.

### Quote Aging at a Glance

The Quotes list has an **Age** column showing how many days old each quote is, color-coded so stale quotes stand out — green when fresh, amber and orange as they age, red once past 30 days. Sent quotes count their age from the day they were sent, so you can see how long a customer has been sitting on a proposal. Use the Sort menu’s **Aging (Oldest First)** to bring the oldest to the top.

> **TIP:** In the quote list, a customer’s name is a link — click it to open that customer’s **profile page**: their Overview with quotes, jobs, contacts, and activity, a Primary Contact card, and an **Edit** button to change their details. It’s the same profile you reach from the Customers list.

### The Quote-Row Action Buttons

Each row in the Quotes list carries the actions for that quote, kept compact so the list stays scannable: **View** (👁) and **Dup** (⧉, duplicate) as small icon buttons; **Edit**; a green **▶ Convert** icon (Mark Won & create the job); a green **📧** icon (email the proposal to the customer); **📧 Approve** (send the client approval link); and **Del**. When a quote is already converted, the ▶ button turns into a muted grey chip so you can see at a glance it isn’t available.

### Duplicating a Quote

Use **Duplicate** to start a new quote from an existing one — handy for a repeat customer or a similar job. The copy comes over as a fresh **Draft** with a brand-new quote number, and its dates are reset to today: a new quote date, a valid-until date recalculated from your default, and no sent/approval history carried over. So a duplicate never inherits the original’s age or a long-past expiration — it starts clean, as a new quote should.

### Pricing: Target Margin and “No Margin”

Each quote has a **Target Margin** (or markup) that drives its pricing. New quotes start at your company default (35% unless you change it in Settings).

- If you **clear** the margin field, the quote prices at **0%** for that field — it no longer quietly falls back to a hidden default. Type a number to set the margin you want.
- **No Margin (price at cost).** A permission-gated switch under the Target Margin field lets an owner or manager deliberately price a quote at cost. When it’s on, the field shows “—”, the total is at cost, the margin warnings step aside, and the quote records who set it and when. This is separate from **Lump Sum**, which only controls how the quote is presented (a single line vs. itemized) and does not change the price.

> **NOTE:** Who can use No Margin is controlled in the permission grid (owner and manager by default). Another company using ProBid could withhold it from junior estimators — nothing is hard-coded.

### Adding Catalog Items & Kits to a Quote

When you add items to a quote from the price catalog, a **kit/bundle** expands automatically into its component lines (see **Inventory → Kits**), each priced at the quote’s own margin — so quoting a “Camera Drop Kit” drops in every piece it contains in one step.

### Sending a Quote to a Customer

From any quote, click **Email to Customer** (the **📧 Email** button). Instead of jumping straight to your email program, ProBid opens a **Review & Send** window so you can check everything before a single message goes out:

- **A live preview** of exactly what the customer will receive — a clean, branded proposal email with your logo, the project details, an investment summary, and your signature.
- **Who it’s going to.** The **To** box is pre-filled with the customer’s email; add more recipients (separated by commas) or fill in **CC** to copy anyone else.
- **The subject**, ready to edit.
- **The PDF proposal is attached automatically** — you don’t have to save and attach anything by hand.

When it looks right, click **Send Proposal**. ProBid sends it for you — from your own company email address, with the customer able to simply hit Reply to reach you — and marks the quote **Sent**. Nothing goes out until you click Send, so you always get the last look.

> **TIP:** Set a follow-up date when you send a quote — ProBid surfaces it under Dashboard → Follow-Ups Due so it doesn’t slip. For exactly which address a send uses and how it’s delivered, see **Emails & Notifications — How They Work**.

## The Client Approval Portal

The approval portal lets a customer review their proposal online and approve it — or request changes — with an online signature. No printing, no clipboard copy-and-paste, and the office is notified automatically when they respond.

### Sending an Approval Link

1. Open the quote (from the Quotes list or Reports).
2. Click **📧 Approve** (“Email the client an approval link”).
3. ProBid opens your email program with a short message and the secure approval link pre-filled to the customer. Review it and send.

> **NOTE:** The link goes to the best email on file: the email captured on the quote, or if that’s blank, the customer’s **Invoicing Email**, or finally the customer’s main email. Set the Invoicing Email on the customer record and old quotes will find it automatically. Full detail is in **Emails & Notifications — How They Work**.

### What the Customer Sees

The customer opens a clean, branded page showing the proposal. The page shows **your** company’s name and logo (pulled from Settings), and the **Scope of Work** and **Terms** appear in readable plain English — bullet points and line breaks intact, not raw formatting codes. From that page they can:

- **Approve** the proposal and sign online, or
- **Request changes**, with a note describing what they’d like adjusted.

### When a Customer Responds

As soon as the customer acts, ProBid updates the quote and alerts the office:

- **Approved** → the quote moves toward Won, and the approval (with the signer’s name) is recorded on the quote.
- **Changes requested** → the quote moves to Follow-Up so you can revise and resend.
- The office is notified by **email and/or text** to everyone you choose, plus an **in-app bell** notification. The bell checks for new responses when you sign in and every few minutes after.

### Setting Up Response Alerts

Choose who gets alerted, and how, in **Settings → Notifications → Proposal Response Alerts** — the same card covers both approvals and change requests. It’s covered in full under **Emails & Notifications — How They Work**; in short you can:

- Turn alerts **on for approvals**, **on for change requests**, or both.
- **Notify the quoter** (whoever built the quote) — with a switch to choose Email, Text, or both.
- Build a **list of people to notify** — add teammates straight from your Team list or type someone in — and check **Email**, **Text**, or both for each person individually.

> **TIP:** The approval email’s subject reads, for example: “Review & approve your proposal Q-2052 from ( TCSS ) -- Total Communications Systems & Solutions, Inc.” The short name in parentheses comes from the **Short Name / Abbreviation** field in Settings → Company Information.

## Work Orders

Work orders are the operational heart of every job — a WO tracks everything from assignment to completion.

### Creating a Work Order

1. Go to **Work Orders** and click **+ New WO**, or convert a Won quote, or use the **+** beside Work Orders in the sidebar.
2. Set the customer, contact, and service type.
3. Describe the work requested and set the job-site address.
4. Set the scheduled date.
5. Assign techs with **Assign Techs** — they receive an SMS automatically.
6. **Save Work Order.**

> **NOTE:** A work order can be for a **customer** or for **one of your own fleet vehicles**. Don’t start fleet work here — start it from the **Vehicles** area, where it opens a lean, customer-free form (you just pick the truck, and the Service Type is set to Vehicle Maintenance for you). See **Vehicles / Fleet → Logging Work on a Vehicle**.

### The Work Order Screen

- A work order opens **full-screen** beside your left menu — the menu stays visible so you can jump elsewhere — with a single clean scrollbar.
- The **status bar** at the top shows Customer and Contact on the left; Status, Service Type, and Priority on the right. The contact’s phone and email show right there — tap to call or email.
- The **left column** holds the big fields (Job Site Address, Work Requested, Work Performed); the **right column** holds reference number, schedule, team, dates, labor rate, notes, and expense/document summaries.
- **Arrow buttons** on the right edge move you to the next or previous record by number — no need to close and reopen from the list. They gray out at the first or last record.
- **Print** is in both the header and the footer.

### Your Edits Are Protected

If you change a work order and then click a menu item before saving, ProBid asks whether to **Stay**, **Discard & Leave**, or **Save & Leave** — so you can’t lose work by navigating away by accident.

### Tabs Inside a Work Order

- **Field Log** — auto-generated log of tech activity (clock-ins, check-ins, notes).
- **Labor** — time entries from tech clock-in/out; feeds the invoice automatically.
- **Expenses** — materials and other costs charged to the job. If any per-diem is linked to this work order, the tab also shows a **Per-Diem (linked)** line and a combined job cost including it (internal — not billed to the customer).
- **Parts** — parts used on the job, each with a unit cost so the job’s material cost is real. You add parts through the **Add-Item picker** (see **Inventory**), which can pull from stock, order a part, add a non-stock/special-order item, or a one-off — and can **reserve** stock to the job.
- **Checklist** — completion checklist items.
- **Phases** — multi-phase project tracking.
- **Comments** — internal notes between office and techs.
- **Documents** — attached files, photos, and signed documents.

### Tap-to-Call from the List

Every work order in the list shows the customer’s phone number as a tap-to-call link under their name — handy in the field, without opening the work order first.

### Creating an Invoice from a Work Order

1. Open the work order.
2. Click the **🧾 Create Invoice** button at the top right of the WO (next to Save).
3. The Invoice Editor opens — review labor, materials, and totals.
4. Confirm the **Invoicing Email** in the Bill To section.
5. Click **📧 Email Invoice** to send it, or **🖨 Print** for a PDF.

> **NOTE:** WO invoices now include the hours your techs **clocked** on the job, not just manually entered labor. A job whose time was all clocked used to be able to produce a $0.00 invoice — that’s fixed, and the notes show manual and clocked hours separately.

> **TIP:** The Invoicing Email auto-fills from the customer record. If it’s blank, open the customer and add it in the blue Invoicing section so it fills in automatically next time.

## Dispatch Board

The Dispatch Board is how the office manages daily tech assignments — all open work orders organized by priority, with drag-to-assign.

### Three Workflow Buckets

- **Timeline (Scheduled)** — WOs with a date and at least one tech assigned; confirmed and going out.
- **Scheduled — Needs a Tech** — WOs with a date but no tech yet; assign someone before the day.
- **Unscheduled Backlog** — WOs with no date; schedule these as capacity allows.

### Assigning a Tech

1. Find the WO card in the right bucket.
2. Find the tech in the tech pool on the right.
3. Drag the tech’s name onto the WO card.
4. The tech is assigned and gets an SMS dispatch text automatically.

### SMS Dispatch Notifications

When a tech is assigned (by drag or from the WO), they get a text with the WO number and customer, the first part of the job description, the scheduled date, and the job-site address (with “Reply STOP to opt out”).

> **NOTE:** SMS requires the tech’s mobile number in their Team record and their SMS toggle switched on. See the **Team** chapter.

> **TIP:** Do dispatch the afternoon before, not the morning of — it gives techs time to plan their route and review the job.

## Invoices

The Invoices module shows all regular job invoices (WO / T&M / quoted work). Managed-services invoices have their own history inside that module.

### Invoice List

Each row shows the invoice number, job description, customer, date, amount due, and status. Click anywhere on a row to open it for editing.

### Invoice Editor

- **Bill To** — customer name and invoicing email, auto-filled from the customer record.
- **Line Items** — labor, materials, and other charges; labor rolls up automatically from time entries.
- **Tax** — applied as a percentage if set.
- **Notes / Payment Instructions** — visible on the printed invoice.

### Parts on an Invoice (cost + markup)

Parts pulled onto a job bill onto its invoice as line items priced **cost + markup**. The markup comes from a **global default** you set in Settings, which a **customer-level markup** can override, and which an individual line can override at invoice time — but only for people with the **“Change parts markup at invoice”** permission (owner-only by default). One-off parts bill at the price you entered.

### Emailing an Invoice

Open the invoice, confirm the Invoicing Email in Bill To, and click **📧 Email Invoice**. ProBid generates the PDF and sends it directly from **invoicing@tcss.com** with the PDF attached — the client gets a professionally formatted email. If no Invoicing Email is on file, you’ll be prompted to enter one; add it to the customer record so it fills in next time.

### Invoice Statuses

- **Unpaid** — sent, payment not yet received.
- **Paid** — click **✓ Paid** on any invoice to mark it.
- **Overdue** — past due and still unpaid; shows on the Dashboard.

## Managed Services

Managed Services handles all recurring contract billing — monthly, quarterly, and annual contracts for services like VoIP maintenance, IT support, and equipment monitoring.

### Contracts

Each contract holds the client and invoicing contact, service type, billing cycle, line items, next billing date, contract end date, auto-renew setting, and delivery method (Email or US Mail).

### Running Billing

1. Click **Run Billing** (top right of Managed Services).
2. Set the **Run Date** (which contracts are due) and the **Invoice Date** (printed on invoices).
3. Review the contract list — check or uncheck contracts to include.
4. Click **🖨 Print Control Sheet FIRST** — print and verify before running.
5. Click **▶ Execute Billing Run**.
6. The Email Queue appears with all generated invoices — print or email each to the client.

### Control Sheet

The Control Sheet is a printed summary of every contract in a run — a unique Control Number (CTRL-YYYYMMDD-NNN), the run and invoice dates, contracts grouped by service type with subtotals, a grand total, and Prepared-by / Verified-by / Date signature lines. File the signed sheet for every run.

### Invoice History

Click **Invoice History** to see all past invoices grouped by run date. You can filter by client, print individual invoices, or click **Print All** on a run date to batch-print everything from that run.

### Contract Statuses

- **Active (green)** — billing normally.
- **Paused (orange)** — temporarily suspended; skipped in runs.
- **Cancelled (red)** — terminated by the client.
- **Expired (red)** — end date passed with auto-renew off (system-set).
- **Do Not Bill (🚫)** — active but excluded from runs; used for courtesy holds.

> **TIP:** Always print and sign a Control Sheet before executing a run — the office uses it to verify the count and total before any invoices go out. Use **Do Not Bill** for clients on payment hold rather than cancelling the contract.

## Expenses & Per-Diem

Two office tools in the Billing group help you keep on top of what a job really costs: the **Expenses** review workspace, where the office reviews every expense techs log on work orders, and the **Per-Diem** tracker for overnight travel pay. Both are office-only.

### The Expenses Review Page

**Expenses** (in the Billing group) is one place to see and review every expense logged across all work orders — no opening each WO one at a time. It opens showing everything; the summary tiles across the top — Pending review, Flagged, and Owed (reimburse) — are clickable shortcuts that filter the list.

#### Reviewing and approving

- Each expense shows its date, who logged it, category, description, amount, how it was paid, the work order (click to open it), whether a receipt is attached, and its review status.
- **Approve** an expense once you've checked it, or **Flag** it if it's off-policy — a personal charge, no pre-approval, a missing receipt. Flagging asks for a short note.
- Review many at once: tick the checkboxes and use **Approve selected** or **Flag selected**.
- Sort by any column, and narrow with the filters: a date range (with This week / This month / Last month / All quick-presets), one or more **people** (picked from your active team roster — you can select several and the picker stays open), pay type, category, a search box, and quick filters for **Flagged**, **Needs reimbursement**, and **Missing receipt**.
- **Export CSV** gives you the current list for your records or a spreadsheet.

#### Reimbursing out-of-pocket costs

When a tech pays out of pocket — an expense marked **Employee Paid Cash** — it shows as **Owed** in the Reimburse column. When you pay them back, click **$ Reimbursed** on that row; it stamps the date and flips the row to paid. The **Owed (reimburse)** tile totals what you still owe across the current view.

#### What flagging does

Flagging sets the expense to **Flagged**, saves your note, and records who flagged it and when — it stays visible to everyone on the page in red with the note. It also alerts the office (owner, manager, and back-office) in their notification bell, so an off-policy charge gets seen.

> **NOTE:** Who can open the Expenses page is set by the **Expenses Page** permission — owner, manager, and back-office by default.

### Configurable Expense Categories

The list of expense categories techs pick from when logging an expense is yours to edit. In **Managed Services → Work Orders → Expense Categories**, add a category, remove one, or use the up/down arrows to set the order they appear in. The order here is the order of the dropdown, and changes save for everyone.

### The Per-Diem Tracker

**Per-Diem** (in the Billing group) tracks overnight travel pay owed to techs. It's built for a flat rate per overnight stay — your rate, **$40** by default — where the office may pay some up front by check and settle the rest later, sometimes digitally if a tech is out longer than planned.

#### Adding a per-diem

1. Click **+ New per-diem**, pick the tech, and optionally a trip name.
2. Enter the number of **nights** and the **rate per night** ($40 by default) — the screen shows the total owed. If you enter start and end dates, it suggests the nights for you.
3. Optionally link it to a **work order** so it counts toward that job's cost (see below).
4. Save. The entry shows the tech, the math (nights × rate = owed), how much is still owed, and when it was added.

#### Recording payments

A per-diem can be paid in pieces. Click **$ Record payment**, enter the amount, the date, and the method — **Paper Check**, **Digital**, or **Cash** — plus a note if you like (a check number, for example). Each payment is listed on the entry and the **balance owed** updates. So if you cut a $400 check for ten nights and the tech ends up staying thirteen, the entry shows $120 still owed; record that $120 (say, digitally) and it reads **Paid in full**.

- The tiles across the top total what's **owed** across everyone and how many entries are still open.
- Filter by tech, and tick **Show paid-off** to include entries already settled (they're hidden by default so you focus on what's outstanding).
- Each entry carries an **age stamp** (for example, “Added Oct 8 · 3 days ago”) that turns amber once it's over two weeks old — handy on long jobs so an unpaid per-diem doesn't get forgotten.

#### Linking a per-diem to a work order

If you link a per-diem to a work order, that job's **Expenses** tab shows a **Per-Diem (linked)** line with the tech's name and folds it into the job's total cost — so you see the true cost of the job including travel. This is **internal cost tracking only**: per-diem is **never** added to the customer's invoice.

> **NOTE:** Who can open the Per-Diem page is set by the **Per-Diem Page** permission — owner, manager, and back-office by default.

## Work Tracking (Field Check-offs)

For larger projects, Work Tracking breaks a job into buildings → floors → rooms → items, and field techs mark items complete (“check-offs”) from their phones.

- **Check-offs** — a tech marks an item done; office or lead can confirm it (which locks it).
- **Reopen** — the office can unlock a confirmed check-off if something needs redoing.
- **Reworks** — log a rework on an item that must be redone.
- **Flags** — a tech flags a difficult item; office or manager resolves it.
- **Leaderboard** — a per-tech completion leaderboard (office/lead).
- **QR Room Labels** — print QR labels for every room (**Print QR Labels**) so techs scan straight to the right room.

A Work Tracking project is linked to a work order. Field techs see the projects for the work orders they’re assigned to; office, project-manager, and owner roles can be given a single toggle to see every project without being on each work order. So access to a project follows access to its job.

> **NOTE:** Each of these actions is governed by its own permission in the grid — see **Roles, Permissions & User Access**.

## Customers

The Customers module is your client database. Every quote, work order, and invoice links to a customer record.

### Customer Record Fields

- **Customer / Company Name** — the billing name on all documents.
- **Phone / Email** — general contact info.
- **Invoicing Contact Name** — the AP person who handles invoices.
- **Invoicing Email** — where invoices and approval links go. This auto-fills on every document for this customer. **Set it for every client.**
- **Address** — billing address on invoices.
- **Payment Terms** — default terms (Net 30, etc.).
- **Tax Exempt** — toggle to skip tax for this customer.
- **Parts Markup %** — an optional per-customer default markup applied to parts billed on this customer’s invoices (overrides the global default).
- **Notes** — general internal notes.
- **Hot Note (Tech)** — critical info shown to techs when they open a WO for this customer (access codes, parking, key contacts).
- **Hot Note (Office)** — internal billing or collection notes.

> **IMPORTANT:** Always fill in the **Invoicing Email**. It’s the address ProBid uses for invoices and for client approval links, and it saves you from being prompted for an email every time. See **Emails & Notifications — How They Work**.

### Finding a Customer (How Search Works)

The search box above the customer list finds a company as you type. It looks inside **four** fields on each customer, not just the name:

- **Company name**
- **Phone**
- **Email** (the main email — not the separate invoicing email)
- **Address** — note this is the whole street + city + state + ZIP stored as one line.

It matches your letters **anywhere** inside those fields, so a short search can pull in more than you expect — most often through the **address**. Typing “Old”, for example, also matches a customer whose address is on “Old Mill Rd” or in a town like “Goldsboro”, because the letters o‑l‑d appear there.

To keep that from getting in your way, results are **ranked by where the match is**. Companies whose **name** matches come first (names that *start* with what you typed lead the list), and matches found only in the phone, email, or address fall below them. When a result matched on something other than the name, a small **“🔎 matched in address”** (or phone/email) note appears under the company name so you can see why it showed up.

> **TIP:** Type a little more to narrow fast. Searching “Old” lists every “Old Dominion …” at the top, followed by unrelated companies that only match on their address; adding a letter or two — “Old D” — drops the address coincidences and leaves just what you want.

> **NOTE:** Long lists are shown **100 at a time** with **← Prev / Next →** buttons at the bottom; the summary tiles at the top still count your **whole** list, not just the page on screen. Search is instant even with thousands of records.

### Adding a New Customer

Click **+ New Customer** (or a customer is created automatically when you save a new quote). Enter the company name (required), phone and general email, the Invoicing Contact Name and Invoicing Email in the blue Invoicing section, the address, and default payment terms, then Save.

## Contacts

Contacts are the individual people linked to your customers and jobs, and their details now show throughout the app.

- **Two phone numbers** with type labels (Mobile, Office, Direct, Fax).
- **Contact address** (if different from the company address).
- **Default contact flag** — mark one contact per customer as the default; it pre-selects automatically in Quick Quotes and Work Orders.
- **Click-to-call everywhere** — phone numbers are tap-to-call from Quick Quote, Work Order, the Contacts page, and the Customer profile.

### Finding a Contact (How Search Works)

The Contacts search works like the customer search, but over **five** fields: **name, company, phone, email,** and **role/title**. Results are ranked so name matches come first, then company matches, then matches found only in the phone, email, or role — with a small **“🔎 matched in …”** note when a result matched on something other than the name or company.

## Team

Team records are for your field technicians and office staff — each controls how ProBid communicates with and tracks that person, and (for people who sign in) what they’re allowed to do.

### Team Member Fields

- **Name** — used for dispatch assignments and SMS lookup.
- **Access Level (role)** — determines what the person can see and do. The dropdown lists every role — the eight built-in roles plus any custom role you’ve created in Settings → Roles — so a new role appears here automatically. **Only the owner can change a person’s role.**
- **Phone** — mobile number; required for SMS dispatch.
- **Email** — used for login and invitations.
- **Labor Rate** — hourly billing rate. (Hidden from anyone who isn’t allowed to see pay.)
- **SMS Dispatch Notifications** — when checked, this tech gets a text when assigned to a WO.

> **NOTE:** Setting a person’s Access Level here also sets their **login role** — the roster and the login are kept in step automatically, so you set a role in one place, not two. If you don’t see the pay-rate field, your role isn’t permitted to view pay.

### SMS Notification Toggle

Each tech has an individual SMS on/off switch, so you control who gets dispatch texts without affecting anyone else. New techs default to SMS ON.

> **TIP:** During setup or testing, turn SMS off for everyone except yourself, then flip them back on when you’re ready to go live.

### Login Status

The Team list has a **Login Status** column that tells you, truthfully, whether each person can actually sign in to ProBid — because being on the roster is not the same as having a login account:

- **✓ Active** — this person’s email is matched to a real login account; they can sign in.
- **⏳ Invite Sent** — you’ve emailed them a sign-in invite but they haven’t finished setting up their login yet.
- **No Login** — a roster record only, with no account and no invite sent. This is normal and fine for field techs whose time you clock for them; they simply can’t log in themselves.

To give someone a login, use the **✉ Invite** button on their row (it emails a one-time sign-in link; it only appears when the row has an email address and the person doesn’t already have a login), or approve them in the owner-only **User Login Access** panel below the team table. On rows where an invite isn’t applicable — the person already has a login, or has no email on file — the Invite button appears greyed out so the list stays evenly aligned.

> **NOTE:** A roster row shows ✓ Active when its **email** matches a login account, so make sure a person’s Team email is the same address they sign in with.

## Tools, Inventory & Purchase Orders

- **Tools & Assets** — check tools out to techs, transfer them between people, and inspect on return. Each action (edit, checkout, transfer, inspect) has its own permission, so you can let field techs check tools in and out without letting them add or edit the tool records.
- **Assemblies (kits)** — group tools that travel together under one asset tag: a drill/impact combo, a meter with its leads, a ladder with its stabilizer. Add each piece as a **linked item** (with a name, quantity, and photo) so the whole kit checks out as one unit and the tech confirms every piece is back at check-in.
- **Inventory** — a full stock-and-parts module unified with your price catalog. It has grown well beyond a simple stock list — see the dedicated **Inventory (Stock, Parts & Counts)** chapter next.
- **Purchase Orders & Vendors** — create POs to vendors; received PO items can flow to a work order’s parts. Vendor payment terms are saved and shown, and a duplicate or mistaken vendor can be removed (existing POs keep their own vendor details). Adding, editing, and removing vendors is limited to office roles.

> **TIP:** When you set a tool up, name it brand + model + type (so it’s searchable), give it a real photo of the actual tool, and use one asset tag per tool. For a kit, use one tag for the whole assembly and list every piece as a linked item.

> **NOTE:** The Purchase Order list has been tidied so its columns and action buttons line up cleanly down the page for easier scanning.

## Inventory (Stock, Parts & Counts)

The Inventory module was rebuilt from the ground up to commercial standards. Its foundation is a single **item master**: your price catalog and your physical inventory are now one list, so every item carries a real cost plus the fields a serious inventory needs. Open it under **Field & Time → Inventory**.

### One Item Master

Every item has an **Item Type** — **Stock** (you keep it on hand and count it), **Non-stock / special order** (you buy it per job), **One-off** (a typed-in line for a single job), or **Service / Labor**. Only Stock items are counted. Each item also carries a Unit of Measure, Manufacturer + Mfr Part #, a preferred Vendor, an Active/Discontinued flag, notes, and photos. Bulk consumables no longer get an automatic asset tag — tags are for serialized tools and assets.

The item list has a **☰ Table / ▦ Grid** toggle. The grid is a Sortly-style photo view — each item as a card with its main photo, quantity, and a favorite star. **Favorites** (the ★) float your most-used items to the top of the Add-Item picker for fast adding.

### Quantities & Locations

Stock is tracked **per location** — the Main Shop plus each truck. Manage your locations under **Settings → Inventory Locations**, where a vehicle location can be **linked to a Fleet vehicle** so it shows the truck’s real name/number everywhere; the **🚚 Sync from Fleet** button sets that up for your whole active fleet in one click.

- **Bin / Shelf** — each item can record where it physically lives at each location (e.g. “Aisle 3 · Shelf B”), shown on the list, the grid card, the Add-Item picker, and the location breakdown so techs find gear fast.
- **Quantity Correction** — the **± Adjust** button opens a per-location correction with a required reason (Count, Damaged, Lost, Found, Initial, Other). Every correction is written to an **adjustment log** (old → new, who, when) and pushed to the cloud. This is how the office fixes truck counts with an audit trail. It’s gated to the **“Adjust inventory counts”** permission (owner by default; grant it to others as needed).

### Reordering & Buying

- **Reorder point & par** — set a global reorder point and “reorder up to” (par) per item, and optionally **per location** (a truck can carry its own min/par).
- **Buy List** — the old low-stock tab is now a par-aware **🛒 Buy List**: every item below its reorder point, grouped by vendor, showing available / reorder-point / par / on-order / suggested quantity and estimated cost, with a one-click **Create Draft PO** per vendor.
- **On-Order** — an item shows how many units are already on open purchase orders, so you don’t double-order.
- **Truck replenishment** — the **🚚 Replenish Truck** button builds a one-action plan to restock a truck up to its par from shop stock (with a guard so it won’t drain the shop below its own reorder point), and can seed a draft PO for anything the shop can’t cover.

### Reserved (Committed) Stock

You can **reserve** stock for a job without using it yet. In the Add-Item picker on a work order, **◷ Reserve** holds the quantity for that WO — it lowers the item’s **Available** (on-hand minus reserved) everywhere (Buy List and replenishment respect it) but doesn’t decrement on-hand until the part is actually used. On the WO’s Parts tab, reserved parts sit in a “Committed” group where you **✓ Use** them (which decrements stock) or **✕ Release** them back. Reserved parts don’t bill until they’re used.

### Buy by the Box, Stock by the Foot (Unit Conversion)

An item can be **bought in one unit and stocked/issued in another** — buy a box of cable, stock and issue it by the foot. Set a **Purchase Unit** and how many stock units are in one purchase unit; when you receive a PO, ProBid converts automatically (receive 2 boxes → 200 ft land in stock) while the PO stays in the units you bought.

### Kits / Bundles

Make an item a **Kit / Bundle** and give it a component list. Adding the kit expands it into its parts in one step: on a **work order** the components are added as parts (each quantity multiplied by the kit quantity, issued from stock where available), and on a **quote** the components drop in as line items priced at the quote’s own margin.

### Multiple Photos

An item can hold **several photos** (a main shot plus details), managed with a thumbnail strip in the item editor. The first photo is the one shown on list rows and grid cards.

### Serial / Lot Tracking & Warranty

Mark an item **🔢 Serialized** to track individual units. The **🔢 Serials** button opens a registry where you add serial numbers (one at a time or paste a list for bulk), record a **lot**, a **location**, and a **warranty expiration** per unit, and mark a unit **Installed** — which lets you pick the work order it went on and auto-fills the customer. Warranty badges flag units **expiring within 60 days** or **expired**, with a rollup on the item row, so you always know which physical unit is where and whether it’s still covered.

### Guided Cycle Counts

The **📋 Cycle Counts** tab runs a real physical count without stopping the business:

1. **+ New Count** — pick a location and optional category, and (optionally) assign it to someone. ProBid snapshots the current system quantity for every matching item onto a count sheet.
2. **Count** — whoever’s counting enters what’s physically on the shelf, with a live **red/green variance** against the system and a running “X of N counted” progress. A **✓ Match remaining** shortcut marks the rest as matching.
3. **Review** — a gate that shows **only the variances** and the net impact, so nothing posts by surprise.
4. **Post** — applies each correction through the same audited adjustment log the ± Adjust tool uses. Items that matched, and items left uncounted, are never touched. A posted count becomes a read-only record.

> **NOTE:** Creating and posting counts is gated to the **“Adjust inventory counts”** permission.

### The Scanner & Offline Mode

The **Scanner** page handles check-out, check-in, and transfers with a phone-camera barcode reader. Every stock move — from the scanner, from receiving a PO, from truck replenishment, or from issuing a part on a WO — is now **offline-safe**: the change applies on your device immediately (so the app keeps working with no signal) and its cloud update is queued and **synced automatically the moment you’re back online**. The Scanner shows an offline / pending banner with a **Sync now** button and the list of anything still waiting to sync.

## Vehicles / Fleet

The Vehicles page (under **Field & Time**) is where TCSS tracks its own fleet — trucks, vans, trailers, and other assets. Company vehicles are real vehicle records now, not fake “customers,” so the work you do on them stays out of your customer counts, revenue, and reports while still being fully tracked.

### The Vehicles List

Each vehicle shows its number and name, status (Active, In Shop, Sold, Inactive), the assigned tech, its work-order count, and a running cost figure. Summary tiles across the top count Total Vehicles, Active, In Shop, Open Issues, and Reg/Ins Expiring. Search by number, make, model, plate, VIN, or tech; sort by number, total cost, or cost this year.

### Adding & Editing a Vehicle

Click **+ New Vehicle** (office roles) and fill in the number/name, type, make, model, year, color, VIN, plate, status, assigned tech, home base, odometer, purchase date and cost, and — importantly — the **registration** and **insurance expiration dates**. Save.

### The Vehicle Profile

- **Overview** — the vehicle’s details, an all-time cost total (Parts + Expenses + Labor) with a per-year breakdown, and its registration/insurance dates.
- **Work Orders** — every work order logged against this vehicle, loaded on demand.
- **Photos** & **Documents** — attach pictures, the registration, insurance card, receipts, and inspection docs; the Documents tab also gathers receipts from the vehicle’s work orders.
- **Issues** — problems reported from the field (see below).

### Logging Work on a Vehicle

Start a fleet work order **from the Vehicles area**, not the Work Orders page — that way it’s tied to the truck and never mixed in with customer jobs. Any of these opens one:

- The **🔨＋** button on a vehicle’s row, **🔨 ＋ Work Order** inside the vehicle (**✏ Edit**), or **+ New Work Order** in the vehicle’s **profile** (**Open**) — each starts a work order already attached to **that** vehicle.
- The **＋ New Work Order** button at the top of the Vehicles page, or the **＋** next to **Vehicles** in the sidebar menu — these open a fleet work order and let you pick the vehicle.

However you start it, the work order opens straight into **fleet mode**: there’s no customer or contact to fill in (the “customer” is always your own fleet), you choose the truck from a simple **vehicle dropdown**, and the **Service Type defaults to “Vehicle Maintenance.”** The form is trimmed to just what fleet work needs — the job-site address, billing rate/tax, and the Field Log / Phases / Field Docs tabs are tucked away. The vehicle’s labor, parts, and expenses roll up into that vehicle’s cost so you can see what each truck really costs to keep on the road.

### Field-Reported Vehicle Issues

From the **Field** page a tech can tap **Report Vehicle Issue**, pick the vehicle, set a severity, describe the problem, and snap a photo. The office sees an Open Issues count and a ⚠️ badge on that vehicle, and can Acknowledge it, Resolve it with a note, or **Convert it to a Work Order** — which opens a new vehicle work order with the issue details prefilled and links the two together.

### Registration & Insurance Expiration Alerts

Once a vehicle has registration or insurance expiration dates entered, ProBid watches them for you:

- The Vehicles list shows a badge on any vehicle whose registration or insurance is **expiring within 30 days** (amber “📅 Reg in 12d”) or **already expired** (red “⛔”), and the **Reg/Ins Expiring** tile counts them.
- The office gets an **in-app bell alert** for each one, so a lapse doesn’t sneak up on you. Enter a renewed date and it clears (and will alert again when that date gets close).

> **IMPORTANT:** The expiration alerts only work once someone enters each vehicle’s registration and insurance dates on the vehicle record (Edit Vehicle). It’s worth doing for the whole fleet once — then ProBid keeps watch automatically.

> **TIP:** You can make a truck’s inventory location *be* that fleet vehicle — see **Inventory → Quantities & Locations** — so stock counts and the fleet record share one name.

## Field Techs: Working in the Field

Field techs use the same web address on their phone or tablet and see a view built for the job site.

### What Field Techs Can Do

- Clock in and out for their shift.
- View their assigned work orders for the day.
- Add field-log entries — notes, observations, issues.
- Log labor time on specific work orders.
- Log materials and parts used.
- Mark checklist items complete.
- Add comments for the office.
- Take photos and attach them to WOs via the Documents tab.
- Report a problem with a company **vehicle** (see **Vehicles / Fleet**).

### Clocking In

Open ProBid on your phone, clock in when your shift starts, confirm your location if geofencing is on, and you’re on the clock — your status shows on the Dashboard.

### Field Log

The Field Log is a timestamped journal of everything that happens on a job. Techs add entries throughout the day and the office sees them in real time.

> **NOTE:** Field logs are permanent records — write clearly, as they may be referenced in billing disputes or warranty claims.

## Time Clock, Time Off & Payroll

### Clocking Yourself

Field techs clock themselves in and out (travel, on-site, breaks, lunch, clock out), with GPS where enabled. This now syncs to the cloud so the office sees it on any device.

### Clocking a Teammate

Owners, managers, back office, and lead techs can clock a teammate in or out — useful when a lead runs the crew. On the Timesheet page, click **⏱ Clock Teammate**, pick the person, and Clock In or Clock Out. The entry is recorded under that teammate’s name and stamped with who did it.

> **NOTE:** This simple version records the shift to the timesheet (no live GPS). A fuller “run a teammate’s whole GPS shift” version is planned for later.

### Requesting Time Off

Anyone can submit a time-off request (vacation, PTO, unpaid) with dates and hours. It syncs to the cloud so the office sees it. Same-day call-outs are separate — they’re informational, show on the dispatch board, and don’t need approval.

### Approving Time Off

Users with the **Approve Time Off** permission see a pending-requests queue with Approve and Deny buttons. Approving a vacation/PTO request also records the paid hours toward payroll; denials can include a reason.

### Timesheets & Corrections

The Timesheet page shows time entries by tech and date, in a detail or all-employees summary view. Office roles can **+ Add Entry** for any tech and correct existing entries. Editing an existing entry is a **correction** — a separate permission — and keeps an audit trail (who changed what, when, and the original values). By default only office/manager/owner can correct; lead techs can clock the crew but not rewrite history. Seeing everyone’s timesheets (the **All Timesheets** tab) is its own permission too.

### Payroll

The Payroll tab totals hours by pay period, and marking a period “processed” is logged. Payroll data now syncs across devices.

> **IMPORTANT:** Payroll — and every pay rate — is hidden unless a person is specifically allowed to see it. By default **only the owner** sees payroll; managers do not. To let one office person (for example, whoever runs payroll) see it, turn on their **“Sees Pay”** switch in User Login Access — it’s granted per person, not by making them a manager.

## Reports

The Reports page has tabs: **Overview, Pipeline, Margins, Job Performance, Technicians, Tool Utilization,** and **Payroll Summary**. Each tab respects its own permission — a role that isn’t allowed to see, say, Payroll or Margins simply won’t see that tab. Owners set who sees which report in the permission grid.

> **NOTE:** The average-margin figure excludes **No Margin** quotes, so pricing a job at cost on purpose doesn’t drag your reported margin toward zero.

## Roles, Permissions & User Access

ProBid has a full, owner-controlled permission system. Instead of a few fixed roles, there are eight built-in roles, room to add your own custom roles, and a live permission grid you control.

### The Built-In Roles

- **Owner** — full access to everything; manages users and permissions; the only role that sees payroll by default.
- **Manager** — broad operational and supervisory access (everything except company settings and payroll).
- **Back Office** — office/administrative access: quotes, customers, timesheets, corrections, approvals, team management. No payroll and no company settings by default.
- **Estimator** — quoting-focused: quotes, price catalog, customers, and reports.
- **Project Manager** — runs jobs: work orders, dispatch, job financials, timesheets, work tracking, and closeout — no payroll or settings.
- **Lead Tech** — a field tech with extra crew responsibilities (confirm check-offs, clock the crew, close out jobs).
- **Helper Tech** — a field tech doing their own daily work (clock in/out, check-offs, reworks, request time off).
- **Subcontractor** — the most limited: field check-off and work tracking on their assigned work only.

> **TIP:** Need a role that isn’t on this list — a “Senior Estimator,” a “Warehouse Manager”? Add a custom role in **Settings → Roles**; it appears in the permission grid and in the Access Level dropdown automatically, and you set exactly what it can do.

### The Permission Grid

On the **Team** page, open the role-permissions area. You’ll see every action down the side and your roles across the top, with a checkbox in each cell. Check or uncheck a cell and it takes effect immediately — no code change needed. Every checkbox genuinely governs its control: the button, the page, and the action behind them all follow the box. This is how you tailor ProBid to how your crew actually works.

> **NOTE:** Inventory adds two permissions worth knowing: **“Adjust inventory counts”** (the ± Adjust tool and cycle-count posting) and **“Change parts markup at invoice.”** Both are owner-only by default; grant them per role as your process needs.

> **NOTE:** Two more page permissions control the Billing-group office tools: **Expenses Page** and **Per-Diem Page** (owner, manager, and back-office by default).

> **IMPORTANT:** Permission checkboxes are real security — the destructive and financial ones are enforced on the server, not just hidden on the screen. A user cannot get around a restriction, even with technical tricks.

> **TIP:** The defaults are already sensible (field techs do their daily work; supervisory and financial actions stay with office/manager/owner). Only change a cell if your process differs.

### User Login Access (Owner only)

On the Team page, owners see a **User Login Access** panel listing everyone who can sign in. From here you can approve a new signup, assign someone’s role, revoke access for someone who has left, or turn on a person’s **“Sees Pay”** switch so they (and only they) can view payroll and pay rates.

> **NOTE:** Change a role and it applies **live**. The person doesn’t have to sign out and back in — their screen updates within a few seconds (or the moment they click back to the tab), and if you’ve just removed their access to the page they were on, ProBid moves them to the Dashboard automatically. The database always re-checks the real role on every action, so a stale screen can never do more than the new role allows.

### New-User Access Policy

At the top of the Roles area, owners can set the **New-User Access Policy** — how a brand-new person gets in. **Invite-only** (the recommended default) means only people the office invites can request an account; **open request** lets anyone who reaches the app ask for access. Either way, a new account still lands in Pending Approval until an owner approves it and assigns a role.

### Signing Up & Account Approval

New people no longer get access automatically:

1. The new person signs up (or is invited) and creates their login. An invited person sets their own password the first time they use their link.
2. Their account lands in **Pending Approval** — they can sign in but see only an “Account Pending Approval” screen and can’t touch any data.
3. An owner opens User Login Access, approves them, and assigns a role.
4. They now have exactly the access their role allows.

> **NOTE:** This is deliberate: a stranger who finds your app can’t get in, and a departed employee can be shut off instantly.

## Recycle Bin

Owners and managers get a Recycle Bin showing recently deleted records — quotes, customers, contacts, jobs, deleted time entries, and deleted job photos — each with who deleted it and when, and a one-click **Restore**. Restores are permission-checked and logged.

> **NOTE:** Deleting a record is a soft-delete — it’s hidden, not destroyed — so an accidental deletion can be recovered here rather than lost for good. That now includes job photos: delete a photo from a job and it moves to the Recycle Bin, where it can be restored.

## Settings

Settings controls your company information and system integrations. Open it from the gear icon (Office / Admin → Settings). Which tabs you see depends on your role — the **Company** and **Roles & Permissions** tabs are owner-level, so a manager who opens Settings lands on the tabs they’re allowed to use.

### Company Information

- Company name, address, phone, email — these appear on invoices and quotes.
- **Short Name / Abbreviation** — a brief version of your company name (e.g. “TCSS”) used in the client approval email subject line and on customer-facing messages.
- Logo — upload your company logo for documents and the client approval page.
- Default labor rate, tax rate, and payment terms.

### Inventory Settings

Under **Settings → Inventory** you manage your **stock locations** (Main Shop + trucks), link vehicle locations to Fleet vehicles (**🚚 Sync from Fleet**), set the global **Allow negative stock** toggle (whether issuing more than on-hand is blocked or allowed as a backorder), and set the global **Parts markup %** used when parts bill onto invoices.

### Defaults & Lists

Seven system lists are fully configurable in **Master Settings → Defaults & Lists**: Contact Title/Role, Contact Type, Best Contact Method, Quote Job Type, Project Environment, WO Service Type, and WO Priority. Add, remove, and drag to reorder items; click **Set Default** to mark which option pre-selects; double-click **Reset** to restore the system defaults.

### Proposal Response Alerts

Under **Settings → Notifications**, the **Proposal Response Alerts** card controls who is told when a client approves a proposal or requests changes — by email, by text, or both. Turn alerts on for approvals and/or change requests, switch on notifying the quoter (with Email/Text choices), and build a list of people to notify (from your Team or typed in) with per-person Email/Text checkboxes. Full detail is in **Emails & Notifications — How They Work**.

### SMS Settings (ClickSend)

- ClickSend username and API key — for dispatch texts and text alerts.
- Toll-free number: +1 (833) 527-2709 (carrier approved).
- Alpha Tag: TCSS — the sender name on texts.
- **Test SMS** button — sends a test text to your phone.

### Mailgun (Email Service)

The Mailgun API key powers ProBid’s outgoing email — invoices from **invoicing@tcss.com**, proposals sent from your own address, and the office approval/change alerts. Enter the key from your Mailgun account and save.

## Emails & Notifications — How They Work

This chapter is the single place that answers “which email does ProBid use, how does it go out, and where do I set it?” Read it once and the rest is obvious.

### The Customer Email Fields

Every customer record has two email fields, and they do different jobs:

- **Invoicing Email** — the primary billing address. This is what ProBid uses for invoices and for client approval links. Set it for every customer.
- **Email (main)** — the general contact email, used as a backup if no invoicing email is set.

A quote can also carry the email that was on file **when it was created**. Older quotes often have that field empty — which is why an old quote used to say “no email set up” even after you’d filled in the customer’s invoicing email. That’s fixed: ProBid now falls back to the customer record.

#### The address ProBid picks, in order

- The email captured **on the quote**, if there is one; otherwise
- the customer’s **Invoicing Email**; otherwise
- the customer’s **main Email**.

> **IMPORTANT:** The customer’s **Invoicing Email** is the setup place. Fill it in on the customer record and both invoices and approval links will find it — including on old quotes that never captured an email.

### Which Email Each Send Uses

| What you’re sending | Address it uses | Where to set it |
| --- | --- | --- |
| Proposal ( 📧 Email to Customer ) | Quote email → customer Invoicing Email → customer main Email | Customers → open customer → Invoicing Email |
| Client approval link ( 📧 Approve ) | Same order as above | Customers → Invoicing Email |
| Invoice ( 📧 Email Invoice ) | Customer Invoicing Email (Bill To); editable at send | Customers → Invoicing Email |
| Office alert when a client approves / requests changes | Everyone on your Proposal Response Alerts list, plus the quoter if enabled | Settings → Notifications → Proposal Response Alerts |
| Dispatch text to a tech | The tech’s mobile number | Team → tech record → Phone (SMS toggle on) |

### How Each Email Is Sent

- **Proposals** now send straight from ProBid, from your own company email address, through the Mailgun email service — with the PDF attached automatically. You get a **Review & Send** window first (preview, recipients, subject) and nothing goes out until you click Send. Because it comes from your address, the customer can just hit Reply to reach you. See **Sending a Quote to a Customer**.
- **Client approval links** open your own email program with the message and secure link pre-filled — you review and hit send.
- **Invoices** send directly and automatically from **invoicing@tcss.com** through Mailgun, with the PDF attached — no email program needed.
- **Office approval / change alerts** are sent automatically by ProBid — email through Mailgun and/or text through ClickSend — when a client responds.
- **Dispatch texts** go out automatically over SMS (ClickSend) when a tech is assigned.

> **NOTE:** For proposals to send from your @yourcompany address and land in inboxes rather than junk, your email domain has to authorize the sending service (SPF and DKIM DNS records). That’s a one-time setup handled by whoever manages your website’s domain; once it’s done, sending is automatic.

### Expense Alerts

Two expense alerts reach the office in the in-app notification bell. When a field tech logs an expense on a work order, the office (owner, manager, back-office) is notified — you can turn this off under Settings → Notifications (“Alert office when tech logs an expense”). And when someone flags an expense on the Expenses review page, the office is alerted with the flag note. See Expenses & Per-Diem.

### Office Notifications When a Client Responds

When a customer approves a proposal or requests changes on the approval portal, ProBid alerts your office automatically. You control exactly who hears about it, and how, in the **Proposal Response Alerts** card under **Settings → Notifications**:

- **Notify on approval** and **Notify on change requests** — turn each event on or off.
- **Notify the quoter** — a switch to alert whoever built the quote, with its own **Email** and **Text** checkboxes. (Texting the quoter needs a cell number on their Team profile.)
- **People to notify** — a list you build. Click **+ Add from Team** to drop in a teammate (their email and cell fill in automatically), or **+ Add person manually** to type in anyone. For each person, check **Email**, **Text**, or both — so one person can get a text, another an email, another both.

On top of those email and text alerts, every response also shows in the **in-app notification bell** for the office roles.

> **TIP:** Add yourself with both Email and Text checked and send yourself a test approval — it’s the quickest way to confirm the alerts reach you the way you want before you rely on them. (Texts do cost per message through ClickSend.)

### The In-App Notification Bell

The bell in the top bar collects in-app alerts — including client approvals and change requests, and vehicle registration/insurance expirations. ProBid checks for new items when you sign in and periodically after, so the office sees them even if no one is watching email.

### Absence & Urgent-Job Texts

Two more office alerts go out by text (ClickSend), and both are off until you turn them on in **Settings → Notifications**: an **absence / call-out alert** to the office when a tech reports out or late, and an **urgent work-order alert** to a list you choose when a WO is saved at Urgent priority. Both use your company’s name from Settings, so each company that uses ProBid shows its own name.

### Vehicle Expiration Alerts

When a company vehicle’s registration or insurance is within 30 days of expiring (or already expired), the office gets an in-app bell alert and the Vehicles page flags it. See **Vehicles / Fleet**. This needs each vehicle’s dates entered on its record.

### Approval Email Subject Line

The client approval email’s subject is built for you, for example:

> **NOTE:** Review & approve your proposal Q-2052 from ( TCSS ) -- Total Communications Systems & Solutions, Inc.

The short name in parentheses comes from **Short Name / Abbreviation** in Settings → Company Information; the full name follows. If you leave the short name blank, the subject simply uses your full company name.

## Everyday Workflows

### New Job — Start to Invoice

1. Customer calls with a request.
2. Create a **Quote** with labor and materials estimated.
3. Email the quote, or send an **approval link** and let the customer approve online.
4. Customer approves → mark **Won** → an Active Job is created.
5. Create a **Work Order** from the job.
6. **Dispatch Board** → assign techs → they receive an SMS.
7. Techs clock in, do the work, and log time and materials.
8. Work completed → close the WO.
9. Open WO → **🧾 Create Invoice** → verify totals → **📧 Email Invoice**.
10. Customer pays → click **✓ Paid**.

### Monthly Managed-Services Billing

1. Go to **Managed Services** → **Run Billing**.
2. Set the Run Date to today and the Invoice Date to the 1st.
3. Review contracts — uncheck any on hold.
4. **🖨 Print Control Sheet** — print and verify the count and total.
5. Have someone check and sign the sheet.
6. **▶ Execute Billing Run**.
7. Email or print each invoice from the queue.
8. File the signed Control Sheet.

### Dispatching for Tomorrow

1. End of day → **Dispatch Board**.
2. Review the **Scheduled — Needs a Tech** bucket.
3. Drag techs onto WOs — they receive an SMS immediately.
4. Review **Timeline** to confirm all of tomorrow’s jobs are covered.
5. Decide whether any backlog work fits tomorrow.

### A Physical Inventory Count

1. **Inventory → 📋 Cycle Counts → + New Count** — pick the location (and a category to keep it small), assign it if you like.
2. Walk the shelves and enter counts; watch the red/green variance.
3. **Review →** to see only what’s off.
4. **Post** — the corrections apply and are logged; matches and uncounted items are left alone.

## Tips & Best Practices

### Invoicing & Emails

- Set the **Invoicing Email** on every customer — it feeds invoices and approval links and saves time on every send.
- Use **Invoice History** in Managed Services for your filing run — batch print covers a whole run at once.
- Never delete an invoice — mark it **Paid** or add a note instead.

### Dispatch & Work Orders

- Keep WO descriptions specific — techs read them before arriving on site.
- Use **Hot Notes** for critical site info (door codes, parking, contacts).
- Close WOs promptly — open WOs inflate your dashboard numbers.

### Managed Services

- Print and sign a Control Sheet for every run and file them chronologically.
- Use **Do Not Bill** for clients on payment hold rather than cancelling.
- Set auto-renew on active contracts to prevent accidental expiration.

### Inventory

- Set a **reorder point** (and truck pars) on the items you actually restock — that’s what powers the Buy List and truck replenishment.
- Enter a **bin/shelf** on your fast-movers so anyone can find them.
- Run a **cycle count** by category a little at a time rather than shutting down for a full count.
- Mark cameras/NVRs and other serialized gear **Serialized** and log serials + warranty at receiving — future warranty claims become a lookup.

### Team & SMS

- Keep tech phone numbers current — no number means no dispatch text.
- Check Field Activity first thing to see who’s on the clock.
- If a tech has app trouble, have them hard-refresh: Ctrl+Shift+R.

### Fleet

- Enter every vehicle’s registration and insurance expiration dates once — then ProBid warns you before they lapse.
- Log shop and maintenance work as work orders **against the vehicle** so you can see the true cost of each truck.

## Getting Help

### Reporting an Issue

For bugs or feature requests, contact your ProBid administrator. Note what you were trying to do, what happened instead, the WO / invoice / customer if relevant, and the browser and device you used.

### Hard Refresh

If ProBid looks wrong, seems stuck, or is missing features after an update, press **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac) to reload all files fresh. This fixes most display and feature issues.

### The Back Button

If you ever felt “trapped” on a screen in older versions, that’s gone — your browser’s Back and Forward buttons now move between pages normally, and you can open pages in new tabs.

### Logging Out

Click your initials in the top-right corner and select **Log Out**. Always log out on shared computers. ProBid stays signed in on personal devices, and signs everyone out automatically after 8 hours of inactivity.

## About Your Data & Syncing

A major focus of recent updates was making sure everything saves to the cloud, not just to the device you’re on. Time and payroll, time-off requests, work-order parts, and inventory now sync like the rest of your data, so what you see is the same on every device.

- **Deletes are safe.** A deleted record is hidden, not destroyed, and can be restored from the Recycle Bin — it can’t quietly reappear on the next sync.
- **Numbers are assigned by the server.** Quote, work-order, invoice, and PO numbers are handed out centrally, so two people working at once can’t end up with the same number.
- **Your settings follow you.** Your menu and dashboard layout are saved to your account and appear on any device you sign in on.
- **Your access follows you.** Your role and permissions are read from the cloud, so a change an owner makes reaches you on every device — and applies live, without a sign-out.
- **Stock moves survive a dead zone.** Scanner and inventory changes made offline are saved on the device and sync automatically when you’re back online.
