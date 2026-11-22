# TCSS ProBid — Engineering Standards (Joe's Standing Directive)

> This is a standing instruction from Joe, the product owner. It applies to ALL work on
> this codebase in every session. Read it before writing or changing code. When a request
> and this document conflict, raise the conflict — do not quietly cut a corner.

## ⛔ Pre-delivery reliability gate (added 2026-09-19 — the standard I broke)

Context, stated honestly: the "verify as a real user through the UI" directive below already
existed, and I still shipped a run of builds (cs/ct/cv, the sync-perf + nav work) verified
ONLY by `node --check`, sandbox tests, and DB row counts — never by driving the actual screen.
Joe became the tester and hit avoidable rough edges (the nav lag persisted through three
guess-patches; an import placeholder overlap). That is the sloppiness. This gate exists so it
does not repeat.

**No build is handed to Joe until every box is true (or the miss is stated up front):**
1. **Driven live, as a user.** The exact flow that changed was exercised in the running app
   in the browser (Joe signs in once, Claude drives) — click the button, watch the toast/list/
   next screen — for the change AND the obvious things it could break. If a flow could not be
   driven, say so IN THE DELIVERY MESSAGE, name what is unverified, and give Joe the 30-second
   check to run. Never imply "done/verified" for something only checked by code or DB.
2. **No guessing.** A cause is measured or observed before a fix is written. If it cannot be
   verified from this environment, STOP and say so plainly (with the way to get the data),
   rather than shipping a hypothesis. Three guess-patches in a row is the anti-pattern to kill.
3. **Blast-radius named.** When shared/core code changes (sync, WO/PO open, numbering,
   settings), list what else it touches and check those too — not just the target.
4. **Fewer, trusted builds.** One verified build beats three rapid patches. Don't bump the
   version and ship on a hunch.
5. **Regression note in the delivery.** Say what was verified, how (live vs. code-only), and
   what remains unverified. Honesty about the edges is part of the deliverable.
6. **Standards & state updated — SAME session, non-skippable.** If the change touches anything
   structural — DB schema, a sync pattern, CI/tests, the staging↔prod split, a deploy rule, a new
   reusable pattern, or any new standing rule we agree on — then **before you call it done**: (a)
   update this engineering-standards doc and the project's `claude/_READ-FIRST-session-protocol.md`;
   (b) **mirror any schema migration to staging** (`dkqucgditvcthjgreeqd`), not just prod; (c) when a
   decision was made at a fork in the road, write the decision down here as a rule — do not leave it
   in one session's memory. A change that isn't written into the standards did not really happen, and
   the next session will take the wrong fork. "I'll document it later" is how the drift starts.

This gate is the near-term stand-in for the automated test suite (standard #8) that does not
exist yet. Until that exists, live real-user verification IS the safety net, and skipping it
is not acceptable.

> **THIS FILE IS AN EXPORT, NOT THE MASTER.** The authoritative engineering standards live in the
> claude.ai **project** as `claude/engineering-standards.md` (the full law — the Lens, the Enemies,
> the Guarantees, the 16 standards) plus its addendum
> `claude/engineering-standards-ADDENDUM-r124-r232-CI-staging.md`. This `docs/engineering-standards.md`
> and the Word (.docx) version are records generated from those; if they disagree, the project docs win.
> (There were briefly two drifting copies — this is the reconciliation.)
>
> **How every session stays on top of this (the continuity contract).** The ONE thing injected into
> every new session is this Project's **custom instructions** (set in the claude.ai Project settings).
> They point to `claude/_READ-FIRST-session-protocol.md`, which points to the master + addendum and
> carries the current build, deploy mechanism, the two Supabase projects, and the non-negotiables.
> **Session start:** read `_READ-FIRST-session-protocol.md` and the master, confirm the current
> build/deploy state, before touching anything. **Session end / each delivery:** apply gate item 6 —
> update the master (or addendum) and the READ-FIRST doc in the same session. That loop is what keeps
> continuity airtight.

## The Operating Principle

Design and build everything to **best industry practices**, as if this app will be
**licensed and rolled out to a hundred separate companies as a commercial multi-tenant
SaaS product.** That is the quality bar for every decision, even while it is still running
in Joe's single office.

No band-aid patches. No "just make it work for now" fixes that create future problems.
When code is encountered that does not meet this standard, say so plainly and propose the
correct fix — do not build new features on top of known-sloppy foundations, because future
add-ons inheriting that sloppiness cause unexpected results. Correctness and maintainability
come before speed of delivery.

## The concrete near-term reality (added 2026-09-05)

This is not hypothetical. Joe intends to offer this app to **at least 3 separate, unconnected
companies** he has an interest in (TCSS today, plus two others) — as a real cost-saving
alternative to the expensive cloud apps those companies would otherwise pay for. So
"multi-tenant SaaS" is the actual destination, not a thought experiment. The app must reach
a bar of **solidness** (a non-coder owner can trust the data is correct and safe) and
**customizability** (each company can tailor roles, terminology, service types, statuses,
permissions, and workflow to their own processes without a code fork).

Two legitimate paths to serving multiple companies — name which one any given plan targets:
- **Separate deployments (available today):** each company gets its own copy + its own
  Supabase database. Isolation is absolute (their data physically cannot touch). This is a
  valid, secure way to serve 3 companies right now, at the cost of running N deployments.
- **True multi-tenancy (the scale target):** one deployment, all companies' data in shared
  tables partitioned by `tenant_id` with tenant-scoped RLS (standard #2). Required before
  serving many companies economically; a deliberate build, not a patch.

## Standing practice: verify systematically, never reactively (added 2026-09-05)

The most unsettling class of problem we have hit is data that appeared to save but was only
stored locally and never synced to the cloud (payroll/workDays, time-off, WO parts). The
owner reasonably ASSUMED sync was happening; it wasn't, because sync is wired per-feature and
some features got the local save but missed the cloud step — and because it looked right on
screen, the gap stayed invisible. To make sure there are no more unknowns like this:

- Every data entity must have a known, verified answer to: does CREATE, EDIT, and DELETE each
  reach the cloud and come back correctly on another device? This is tracked deliberately, not
  discovered by accident.
- Prefer proactive, complete audits (an entity-by-entity sync/round-trip matrix) over
  reactive one-at-a-time fixes. Give the owner a plain-language map (solid vs. gap), then fix.
- When verifying, prefer live observation (real round-trips, rolled-back DB simulations,
  direct DB checks) over "the code looks right." "Verified by construction" is weaker than
  "verified by observation."

**Applied example (2026-09-21):** the permission system was validated exactly this way — the
real `hasPermission`/`getPermMatrix` engine was cross-checked against the live matrix across
87 permissions × 8 roles (0 mismatches), page-access and nav were cross-checked for every
role (0 mismatches), and the in-use roles were driven through the real UI. That is the
systematic-not-reactive standard in practice; see the Roles & permissions section below.

### Verify AS A REAL USER, through the UI (Joe's explicit directive, 2026-09-05)

A database check or a code read can pass while the button that is supposed to trigger it is
broken, mis-wired, or hidden by a permission gate — so those checks alone are NOT enough.
The strongest and required form of verification is to **drive the running app in the browser
as an end user would**: navigate to the screen, click the actual button, fill the real form,
watch the on-screen result (the toast, the updated list, the next page), THEN confirm the
data in the cloud. This proves the whole path end-to-end — UI wiring + save + sync — the way
the owner (a non-coder who trusts what he sees on screen) actually experiences it.

- Claude can and should drive the app itself via browser automation on a tab Joe is signed
  into (Joe signs in once — Claude never enters credentials — then hands over the wheel).
- The one manual touchpoint: native browser "Are you sure?" confirm/alert dialogs. Claude's
  click fires them but cannot safely auto-dismiss them (the page-script override is blocked,
  and an un-dismissed native dialog freezes the browser link). Joe clicks OK on those; Claude
  does everything else. Design note: app-level custom modals (not native confirm/alert) would
  remove even this touchpoint and are the better long-term pattern anyway.
- Combine: real-user click-through in the UI for the behavior, plus a direct DB read to prove
  the data landed (and, for deletes, a reload to prove the tombstone held and it didn't
  resurrect). That create → cloud → reload → delete → stays-deleted loop is the gold standard.
- End-to-end UI testing is a supplement to — not a replacement for — an eventual automated
  test suite (standard #8). Until that exists, real-user click-through IS the safety net.

## What "best practice" means concretely for this app

**1. Security & authorization is server-authoritative.**
The client is never trusted. Hiding a button in JavaScript is UX, not security. Every
destructive or privileged operation must be enforced at the database layer (Supabase RLS),
with the client-side permission check as a convenience layer on top — never as the only
gate. A user with a login and a console must not be able to do what their role forbids.
CURRENT STATE (2026-09-21): the client-side layer was hardened so it is honest UX — a
page-access guard blocks navigation (not just nav hiding) and all 87 permission toggles now
govern their control. Destructive/financial operations remain server-enforced via RLS/RPCs;
role-change RPCs are owner-gated and audited. This is the convenience layer done right on top
of the server floor, not a replacement for it.

**2. Multi-tenant data isolation is non-negotiable for licensing.**
Every table carries a `tenant_id` (org/company id). RLS policies scope every read and
write to the caller's tenant so Company A can never see or touch Company B's data. Role is
stored server-side (DB row or JWT claim), and destructive-action policies check it. A
single shared table with `using(true)` is acceptable ONLY as a temporary single-tenant
stopgap and must be flagged as tech debt, never left as the end state.
CURRENT STATE (be honest): most tables are still `using(true)` (fine for one-company-per-
deployment; NOT ready for shared multi-tenancy). Destructive/privileged ops in the audited
areas are now server-enforced (RPCs, restrictive delete policies, guard triggers). Full
tenant_id partitioning is not yet built — it is the biggest single item on the road to true
multi-tenancy.

**3. One source of truth.**
The cloud database is authoritative; localStorage is an offline cache, not the primary
store. Sync must have deterministic conflict resolution. Hand-rolled tombstone/sync logic
is a known bug source (the delete-resurrection class of bug) and should migrate toward a
proper offline-sync approach over time.

**4. Deletes: soft-delete + audit by default.**
All entities use the same soft-delete pattern (`is_active`/`deleted_at`), consistently —
no mix of hard-delete for some entities and soft-delete for others. Every create/update/
delete of a business record writes an append-only audit entry (who, what, when, before →
after). Hard purges happen only via a separate, deliberate retention/compliance job.

**5. Schema changes are versioned migrations.**
Database changes are tracked, versioned migration scripts committed to the repo — not
one-off SQL typed into the dashboard. A hundred deployments must be able to reach an
identical schema state reproducibly.

**6. Code hygiene.**
No duplicate/shadowed function definitions (e.g. a function defined in two modules where
load order silently decides the winner). No logic-bearing wrapper functions inline in
index.html that make the real implementation hard to find or verify. Clear module
boundaries and separation of concerns. Prefer approaches that a build step and a type
checker can validate.

**7. Build & release discipline.**
Automated version stamping (no manual find-replace of `?v=` across 17 script tags),
a real build/bundle step, and a repeatable deploy. Version numbers are generated, not
hand-edited. CURRENT STATE: still manual (hand-bumped `?v=` + hand-uploaded files). A real
build/deploy pipeline is unbuilt and is on the SaaS roadmap.

**8. Automated testing.**
A test suite (unit + integration, and end-to-end for critical flows) so a change in one
module cannot silently break another. Manual browser testing is a supplement, not the
safety net. CURRENT STATE: no automated suite yet; verification is live/manual (including
real-user UI click-through, see the verification section). This is a key gap for the SaaS
bar — a change today can only be trusted as far as it is manually or live-verified.

**9. Observability.**
Centralized error logging/monitoring so a bug hitting a licensed customer is visible to
the vendor without the customer having to report it. CURRENT STATE: not built.

## Customizability (for the multi-tenant target)

Each company must be able to tailor the app to its own processes via CONFIGURATION, not a
code fork: roles + the permission matrix (already data-driven — good foundation), service
types / statuses / billing cycles (already partly data-driven), terminology/labels, company
branding, and workflow options. New per-company behavior should read from settings/config,
never be hard-coded to one company. This keeps one codebase serving all tenants.

## Roles & permissions — enforced and validated (added 2026-09-21)

The permission system is now the concrete proof of the Customizability standard — hardened
and verified live end-to-end. This is the state future work builds on:

- **Every toggle governs its control.** All 87 permission keys in the matrix are enforced at
  their actual control (the button, the page, AND the action behind them), not merely reflected
  by a hidden nav item. A page-access guard blocks navigation to any page a role lacks — hiding
  the nav item was never enough on its own. Dead or hardcoded role checks were replaced with
  `hasPermission(key)`. Audit: 0 dead toggles.
- **Eight built-in roles + custom roles.** The login-role enum was widened from 5 to 8 (added
  estimator, project_manager, subcontractor) so every built-in role is a real, assignable login
  role; owners can add custom roles in Settings → Roles, which flow into the permission grid and
  the Access-Level dropdown automatically. Custom roles are fully enforced at the UI/matrix
  layer today. **Remaining gap:** RLS policies are still written around the built-in roles, so a
  brand-new custom role is not yet enforced at the database layer — making RLS matrix-driven is a
  scoped follow-on (the deeper permissions project), not done.
- **Role assignment is owner-only and stays in sync.** The Team roster role and the login role
  are two separate stores; they are kept in step by an owner-only, audited write-through matched
  on email, so changing a role in either place updates both. (Migration `2026-09-21_role-sync`.)
- **Role changes apply live.** A logged-in user's session re-reads its role in the background
  (poll + tab-focus) and re-applies permissions without a sign-out; a user who loses access to
  the page they're on is moved to the Dashboard. Server-side RLS still re-checks the real role on
  every action, so a stale screen can never exceed the new role.
- **Pay visibility is owner-only by default,** granted per-person via a `can_view_pay` flag
  ("Sees Pay"), never by making someone a manager.
- **Validated live, all 8 roles.** Engine cross-checked against the live matrix across 87
  permissions × 8 roles (0 mismatches); page-access and nav cross-checked for every role (0
  mismatches); in-use roles driven through the real UI. See `claude/role-validation-results.md`
  and `claude/permissions-full-enforcement-audit.md`.

## Session / authentication policy (added 2026-09-26)

Governing principle: **"logged in" and "on the clock" are two independent systems, and payroll
must never depend on whether a session happened to stay alive.** They are separate levers today
and must stay separate.

- **Idle auto-logout = 8 hours (build `eu`, 2026-09-26).** The client-side inactivity timer in
  `js/auth.js` (`SESSION_TIMEOUT`) was raised from 30 minutes to **8 hours** (a workday), warning
  1 minute before at 7h59m. Rationale: a 30-min idle logout is a shared-kiosk/office-security
  pattern that nuisance-logs-out field crews on their own devices (physical work = no screen
  taps); 8h keeps an overnight safety cutoff for a lost/unattended device without the daytime
  friction. The timer resets only on real interaction in the app tab (mousedown/keydown/
  touchstart/scroll). Per-tenant/role-based idle windows (short for office/shared machines, long
  for field) are the future best-practice refinement if a company needs it.
- **Supabase session is fine on its own.** The client is created with default options, so
  `autoRefreshToken`/`persistSession` are on; the token auto-refreshes on an active tab. The
  repeated logouts seen 2026-09-25/26 were this app-level idle timer, NOT token expiry.
- **`signOut` is lossless.** It pushes all pending data to the cloud before reloading, so an
  auto-logout never drops unsynced work.
- **Timekeeping accuracy comes from explicit clock-in/out, not idle detection.** Best practice is
  to NOT auto-clock-out on inactivity (it under-counts real labor). Catch the real failure mode —
  forgetting to clock out — with guardrails (a max-shift auto-flag for review, the existing
  clock-in reminders/anomaly alerts). When the per-tech self-clock-in module is built
  (`restoreClockSession` is currently a stub), add a max-shift flag rather than idle auto-clock-out.

## Outbound communications — email & SMS infrastructure (added 2026-09-23)

The app now sends real customer-facing and office-facing messages. The governing rule: **send
credentials (Mailgun API key, ClickSend user/key) live server-side only and are never placed in
any client the customer can view.** The public approval portal (`portal.html`) holds no keys —
it only writes to the database; the actual sending happens in a service-role Supabase Edge
Function. Handling of keys client-side, or in the public portal, is prohibited. Full operational
reference: `claude/quote-email-setup.md`.

**Proposal email — "send as the user" (delivered 2026-09-23, delta el).**
- `js/quotes.js` `buildEmailBodyHTML(q)` renders an **email-safe** HTML proposal (table layout +
  inline styles for Outlook/Gmail — no `<style>` blocks, no flexbox reliance). The company logo
  is loaded from a **hosted asset** (`assets/email-logo.png`, referenced by the app's own runtime
  base URL), NOT a `data:` URL — Gmail/Outlook strip base64 images, so hosted is required.
- **Human-in-the-loop before any customer send:** clicking Email opens a **Review & Send** modal
  (`#modal-email-quote`) with a live preview, editable To + CC (multi-recipient), and subject.
  Nothing sends until the user confirms. This is the correct pattern for customer-facing sends.
- Sends via **Mailgun** from the logged-in user's `@tcss.com` address (`Reply-To` = same), with
  the proposal PDF attached; the quote flips to **Sent** only on a successful send. Verified live
  end-to-end (a real proposal reached the inbox).

**Proposal response alerts — approvals & change requests (delivered 2026-09-23, delta em).**
- Pipeline: customer acts on the portal → `quotes.approval_status` update → DB trigger
  `trg_notify_quote_approval` → `notify_quote_approval_change()` (SECURITY DEFINER) →
  `net.http_post` to the **`notify-quote-approval` edge function** (v3). Keys stay in the edge
  function's server context (it reads `company_settings.settings_json` with the service role).
- The edge function sends **email (Mailgun) and SMS (ClickSend)** to a de-duplicated recipient
  set built from: `settings.notifyRecipients[] = {name,email,phone,sendEmail,sendSms}`
  (per-person channels), the legacy single `notifyEmail` (back-compat), and the **quoter**
  (`notifyQuoterOn` + per-channel; email via `auth.admin.getUserById(created_by)`, cell via
  `profiles.phone`). Event gates: `notifyApprovalOn` / `notifyChangesOn`.
- UI: **Settings → Notifications → "Proposal Response Alerts"** card (`js/core.js`,
  `saveNotificationSettings`/`loadNotificationSettings` + the recipient-list editor) — add from
  Team or manually, per-person Email/Text, quoter toggle + channels.
- Verified: edge fn deployed (v3) and smoke-tested (auth gate + clean boot); settings card
  rendered and its add/read/remove exercised in a sandbox. The live delivery of a real alert is
  Joe's to confirm (stated honestly at handoff) — it needs configured recipients + a real portal
  action, which can't be driven from the build environment.

**Deliverability / DNS (a per-tenant setup step, not a code concern).**
For mail sent as `@tcss.com` via Mailgun to pass authentication and reach inboxes, the domain's
DNS must authorize Mailgun: **SPF** `v=spf1 include:spf.protection.outlook.com include:mailgun.org
-all` and a **Mailgun DKIM** TXT (`mailo._domainkey`). tcss.com DNS is at SiteGround (registrar
Domains Priced Right; mailboxes Microsoft 365 — its MX and `selector1/2._domainkey` DKIM stay).
Both records verified live 2026-09-23. **Multi-tenant implication:** each licensed company needs
its own verified sending domain (its own SPF include + DKIM) and its own
`mgKey/mgFrom/mgDomain/csUser/csKey/csFrom` — this is tenant configuration, same shape as above.

**Correctness fix — duplicate quote (delivered 2026-09-22, delta eh).** `dupQuote()` was
deep-cloning a quote including its dates, so a duplicate inherited the original's age and a
long-past valid-until (appearing "expired 106 days ago"). Rewritten to reset the copy to a fresh
Draft: new quote number, `dt`/`createdDate` = today, `vu` recomputed from the source's valid-day
span (or the settings default), and `sentDate`/`wonDate`/`followupDate`/`approval`/`approvalToken`
cleared. A duplicate now starts clean — the correct behavior for a new quote.

## Expenses Review & Per-Diem (2026-10)

### Data-safety isolation
The Expenses Review page (`js/expenses.js`) keeps its OWN authoritative snapshot of all expenses (`_expRows`), loaded fresh from the cloud, SEPARATE from the sync-managed `DB.woExpenses`. It never writes through `saveDB()` / `pushAllToCloud()` (which re-upload the whole expense array and could clobber the cloud with a stale copy). All review writes are per-row via `_pushWOExpenseToCloud(e)`, mirroring changed fields into `DB.woExpenses` only when that row is already loaded there. The Per-Diem module (`js/perdiem.js`) follows the same discipline with its own `_pdRows` / `_pdPays` snapshot and direct per-row `_sb` writes — never `saveDB`.

### Paginated load
`loadAllExpenses()` pages through `wo_expenses` with `.range(from, from+PAGE-1)` (PAGE=1000) to defeat PostgREST's 1,000-row default cap; a plain `select('*')` silently returned only the first 1,000 rows and made totals wrong.

### Schema
- `wo_expenses` gained review columns: `review_status` (pending|approved|flagged), `review_note`, `reviewed_by`, `reviewed_at`, `reimbursed` (bool), `reimbursed_at`.
- `per_diem`: `id` uuid, `tech_name`, `tech_user_id` uuid, `trip_label`, `start_date`, `end_date`, `nights` int, `rate` numeric (default 40), `wo_id` **text** (links to `work_orders.id`, which is text like `wo-<timestamp>` — NOT uuid; this was a real bug: wo_id was first created uuid and rejected the value), `notes`, `created_at`, `created_by`.
- `per_diem_payments`: `id` uuid, `per_diem_id` uuid (on delete cascade), `amount` numeric, `paid_on` date, `method` text (Paper Check|Digital|Cash), `note`, `created_at`, `created_by`.
- RLS on both per_diem tables: `active_users_only` (ALL, authenticated, `is_active_user()`), matching the rest of the app.

### Office notifications
`notifyOfficeCloud(type, title, message, excludeSelf)` (`js/worktracking.js`) inserts a `wt_notifications` row per office recipient. Recipients come from the **`profiles`** table (its `id` = auth user id = the value `wt_notifications.user_id` is read by), filtered `role in (owner, manager, back_office)` and `is_active = true`, de-duped by id, excluding the current user. NOT from `DB.team` — team rows don't carry the auth `user_id`, so targeting off them notifies no one (the pre-existing `notifyFollowUpNeeded` / `addWOAssignmentNotifications` share that latent gap). `role` is a Postgres enum; the legacy alias `'office'` is NOT a valid enum value and must be excluded from the `.in()` filter or the whole query errors. The expense-flag path (`expenses.js _applyFlag`) and the tech-logged-expense path (`workorders.js addWOExpense`, gated by `DB.settings.notifExpenseEnabled`) both call it.
> NOTE: `addNotification()` is local-only (the bell on the current browser); cloud delivery to other users requires a `wt_notifications` insert keyed to the recipient's auth id.

### WO cost rollup (internal, never billed)
Per-diem linked to a WO (`per_diem.wo_id`) surfaces on the WO Expenses tab via `woPerDiemRollup(woId, expenseTotal)` and in the WO summary tile via `woPerDiemTile(...)`, both in `perdiem.js`, both display-only. `createWOInvoice()` is untouched, so per-diem never enters billing. The Expenses tab renders twice (first paint, then again after `ensureWOExpensesLoaded` resolves), so the rollup is (re)triggered from `refreshWOQuickStats()` — which runs after the load settles — to win the race against the re-render rather than relying on a first-paint `setTimeout`.

### Settings-driven categories
Expense categories live on `DB.woSettings.expenseCats` (the key both the expense-entry form and the review page read) and are edited in Managed Services (`dispatch.js renderMsWOExpenses`): add / remove / reorder, pushed to cloud via `_pushSettingsToSupabase()`. An older editor wrote `expenseCategories` (which nothing read) — consolidated onto `expenseCats`.

### Permissions wiring
`page.expenses` and `page.perdiem` added to `PERM_DEFS` (dispatch.js), to `_PAGE_PERM_MAP` + `PAGE_TITLES` + the `goPage` dispatch (core.js), and to the `enforceNavPermissions` pageMap (auth.js). The auth.js map had been missing `expenses` entirely, which hid the nav item for non-owner office roles (owner skips all hiding, so it only surfaced for manager/back-office logins).

## November 2026 build run (r165–r232) — architecture & decisions

This is the running record of the work after the October update. It is written so a future session can pick up the same patterns without re-deriving them. Build numbers are the `APP_BUILD`/`SHELL_VERSION` revision (`v9 · rNNN`).

### Deploy & verification reality (do not relearn this the hard way)
- **This is NOT a git repo for deploys.** The app ships by editing files → zipping the app folder → `SendUserFile` → Joe drops the zip through **GitHub Desktop** → GitHub Pages serves it → Joe says "up." A Stop-hook message about "uncommitted changes / commit and push" is a **false alarm** — ignore it; there is nothing to commit here.
- **Version bump every deploy:** `sw.js` `SHELL_VERSION`, `window.APP_BUILD` in `index.html`, and the `?v=` cache-bust token on every changed `js/*.js` in `index.html`. The service worker is network-first for HTML and cache-first for the versioned JS.
- **GitHub Pages propagation lag + SW cache** mean the first reload after "up" often still serves the previous build. To verify live, hard-reload to a **fresh query string** (e.g. `…/?rNNNx#/route`) and wait; a second fresh-query reload usually lands the new build. A heavy fresh boot can also freeze the renderer (big sync) for 20–40s — wait, then reload to a new query to unstick.
- **The pre-delivery reliability gate at the top of this file is in force for all of the below.** Every one of these builds was driven live as a real user in the browser before "done," and test data was cleaned up after.

### Standing workflow rules reaffirmed this run (see the `claude/WORKFLOW-RULE-*` project docs)
- **Click-through test as a real user on EVERY change** — including features that are "already done" or "already wired." *Saved ≠ works; existing ≠ wired.* The customer-alerts work proved it: code that called the fire function still did nothing on imported invoices (wrong match field) until clicked.
- **MAP every angle before building** — a short map/plan doc first (stored under `claude/MAP-*`), then build, then verify.
- **Notifications need both a firing trigger and seeded defaults** — a rule that exists but is never fired does nothing.

### Quote line-item labor (r168–r170)
Each quote line gained `laborMult` (1 / 1.5 / 2 / 0=custom), `laborRate` (custom $/hr, null otherwise), and `flatLabor` ($/unit). Hours and flat are **mutually exclusive per line** (entering one zeros the other, on commit). Labor sell is the **sum of each line's labor**, not totalHours × one rate, so the summary band reconciles with the grid. These per-line fields can't ride the `replace_quote_line_items` RPC (fixed columns: sort_order/description/category/qty/material_cost/labor_hours), so they sync via **`quote_extras.lineLabor`** — a parallel array by index — merged back onto `q.items` in `_applyQuoteExtras`. **This parallel-array pattern is the standard way to persist per-line fields** and was reused later for MSRP.

### Purchase-order receiving (r165–r184)
Receiving added to POs: per-line and bulk ("receive all") entry, a per-PO **receipt history**, **corrections/reversals**, and a **manager reopen**. Legacy PO statuses were normalized to a canonical `Received`. Packing slips get an **office-review** step with a 3-way mode picker (inbox/corrector/no-lookup). A **PO view-only** permission (`po.view` vs `po.edit`) lets some roles see without editing. POs carry structured columns (not a jsonb blob).

### Material-to-job billing (r194–r196)
Parts bought on a PO for a job carry cost onto the WO and bill with markup (phase 1 cost-carry + markup; phase 2 PO→job guardrail so costs land on the right job; phase 3 WO rollup + customer-profile surfacing).

### DCC brand system (Option A, pass-through) (r186–r216)
A second company identity (Davis Coastal Cabling) issued per document. `_brandFor(q)` resolves identity by `q.brand`; `DB.settings.dccBrand` holds `{defaultForEmails, logoDataUrl, cname, caddr, cphone, cemail}`; TCSS identity is the existing `DB.settings.*`. `brand` is a per-document field on quotes (`quote_extras.brand`), invoices (`app_invoices.data`), work orders (`work_orders.brand` column + `_mapWORow`/`_WO_HASH_KEYS`), and POs (`purchase_orders.brand` column + per-PO toggle, r216). Printouts/emails for all four are brand-aware (logo + remit block), and WO/PO **lists filter by brand** with a DCC badge. Switching brand is gated by the **`quote.switch_brand`** permission. WO brand can override the invoice brand (r214).

### Invoice redesign (r189–r213)
`buildInvoiceHTML` made **logo-first for both brands** (was a hardcoded TCSS text wordmark in the TCSS branch — the "only wired one path" mistake). Professional redesign, output 15% larger, logo auto-shrink, remit block, and the TCSS invoice logo **wired to the Settings graphic** rather than hardcoded.

### Notifications (r175, r205–r209)
Default alert rules are **seeded** on load; the post-send toast is **honest** about what actually sent; notification history was revamped; app-lock reload fixed. A rule with no firing trigger is inert by design.

### Margin floors (r217–r218)
Push now **propagates deletes + reconciles** (removes cloud rows not in local), and the pull is **authoritative** (REPLACE local with cloud, not additive merge) so a since-deleted floor can't resurrect from a stale device. Dead `jobTypes`/`projectEnvs` settings removed. Note: **margin floors ARE the job-type list** — `populateJTDropdown()` reads `_getMFList()`.

### Customer module alerts (r222–r224)
`customers.module_alerts` (jsonb) holds a note per module: `customer`/`quote`/`workorder`/`invoice`/`purchaseorder`, plus a tech "hot note." `_fireCustomerModuleAlert(cust, key, …)` shows `_showHotNotesQueue([...])`, office-roles-only (`owner/manager/back_office/estimator`). Wired into all six open paths. **The bug that proved "wired ≠ fires":** the invoice path first resolved the customer by `inv.billName` only, which is empty on imported invoices — fixed with a `billName → inv.job.customer → customerName` fallback (r224). Lesson in the project docs: verify each firing path by click-through, not by code reading.

### Primary contact (r219–r221)
Added `customers.default_contact_id` (+ push/pull mapping). Inline "change primary contact" picker at the top of the contact list; `_setInlinePrimaryContact` sets it + pushes + re-renders + `_refreshOpenCustomerProfile` for a **live** update (no hard refresh). **`_buildCustomerData` uses `Object.assign({}, existing, {…form…})`** so a save never wipes non-form fields (default_contact_id, moduleAlerts, created*). This Object.assign-from-existing guard is the fix pattern for every "quick edit form that rebuilds a record."

### WO status colors by hex + RGB (r225)
Status color stored as a 6-digit hex in `settings_json._woSettings.statuses[].color`. The Settings row shows a native picker + an **editable hex field** + a read-only **RGB** readout, all synced; `_normHex` normalizes (`#abc`→`#aabbcc`, adds `#`, lowercases, rejects junk), `_hexToRgbStr` derives RGB; invalid entry reverts and flashes. Also dropped the dead, unused `wo_settings` table (statuses actually live in `company_settings.settings_json._woSettings`).

### Vendor MSRP catalog (r226)
`catalog` gained `msrp numeric` and `price_mode text default 'cost'`. Pull/push mapping carry `msrp`/`priceMode` (inventory push + bulk push + the `catalog` pull map). The quick catalog editor (`saveCatalogItem`) rebuilt to **Object.assign from existing** (was wiping vendor/part/msrp — same bug class as r221). **237 real items loaded** (Verkada 126, Rhombus 111) with `price_mode='msrp'` and `default_cost=msrp` (the 0%-discount baseline); Verkada per-device licenses loaded with blank MSRP. Source MSRP captured in `claude/VENDOR-verkada-*` / `claude/VENDOR-rhombus-*`. Verkada from verkada.com/pricing (official); Rhombus from the ALJP 2026 contract price list (base price = MSRP).

### Deal-registration discount (r227–r228)
Per-quote `quoteVendorDiscounts` global (core.js), e.g. `{Verkada:0.42, Rhombus:0.35}`. For an MSRP line of vendor V, `line.mc = round2(msrp × (1 − discount))`; the existing markup/margin then produces the sell (calcTotals unchanged — it already prices off `mc`). UI: `renderDealRegPanel()` (called at the end of `renderLI`) shows one %-off-MSRP input per vendor present. Persistence rides `quote_extras`: top-level **`vendorDiscounts`** + a **`lineMsrp`** parallel array (vendor/msrp/priceMode), merged in `_applyQuoteExtras`; `getQData` emits `vendorDiscounts`; `editQuote` restores it. **Gotcha:** `calcTotals()` updates the pricing panel + header total but **not** the sticky footer bar — `setVendorDiscount` must also call `updateQQStage3UI()` (r228), the same refresh `addRow` uses.

### Price Catalog table + typeahead (r229–r232)
`renderCatalog` rewritten from cards to a **sortable table** (`catSort`/`_catSortKey`/`_catSortDir`; numeric sort for MSRP/Cost/Labor, null MSRP low; sticky header; internal scroll; Price Update Mode inline inputs; filters + search preserved). Quote-side **typeahead** (`#qq-ta-input`): `qqTypeaheadInput/Render/Add/Close/Key`; adds via **`addCatToQQ(id, true)`** — the `skipNav` param (r231) stops the view jumping to the top on each add; relevance ranking (r232): exact part# > part# prefix > name prefix > part# contains > other, so "R520" surfaces the camera before the "for R520" accessory.

### The quote_extras parallel-array pattern (reusable)
Fixed-column RPCs (`replace_quote_line_items`) can't carry new per-line fields. The established pattern: store a **parallel array by index** in `quote_extras` (`lineLabor`, `lineMsrp`) and merge it back onto `q.items` in `_applyQuoteExtras`; store **top-level** per-quote fields (`vendorDiscounts`, `brand`, `proposalClauses`, `claimedBy`) as plain keys in the same bundle. `_quoteExtras(q)` is the single source of truth that both push sites and the pull read — add a field there and in `_applyQuoteExtras`, nothing else.

## Testing, CI, and the staging / production split (read this before touching the schema or wondering why CI is red)

This section exists because a future session (or Joe leading one) needs to know what runs behind the scenes. Treat it as standing directive.

### The two Supabase projects — and the golden rule
There are **two** Supabase projects in the same org:
- **Production:** `jzvoksidbelxibzbizvi` ("TCSS-Probid", us-east-1) — the real company data. The live app at `joek0007.github.io/tcss-probid` uses it.
- **Staging:** `dkqucgditvcthjgreeqd` ("TCSS STAGING", us-west-2) — a throwaway test backend. The app points here when `localStorage.probid_env === 'staging'`. Used only by the CI browser smoke test, with throwaway test accounts. Safe to migrate, seed, and delete in.

> **GOLDEN RULE — mirror every schema change to BOTH projects.** Any `ALTER TABLE` / new table / new column applied to **production must be applied to staging too**, in the same step, with the same type/default. If you migrate only prod, the app (which the smoke test drives against staging) tries to write the new column, **staging rejects it with HTTP 400**, the write silently fails, and the browser-smoke job goes red. This is exactly what happened in the Nov run: five columns (`work_orders.brand`, `purchase_orders.brand`, `customers.default_contact_id`, `catalog.msrp`, `catalog.price_mode`) were added to prod but not staging, so a WO status change 400'd on staging and the smoke test read "NEW." The fix was to add the five columns to staging. **When you add a column to prod, immediately run the same migration on `dkqucgditvcthjgreeqd`.**

### The CI workflow (`.github/workflows/ci.yml`, "CI — ProBid tests")
Runs on **every push** (and PRs, and manual dispatch), both jobs inside the Playwright image. **Every push = one CI run = one email to Joe if it fails.** A day of 8 builds is 8 emails if CI is red — that is the "gazillion errors" symptom; it means CI has been red, not that something new broke each time.

- **Job 1 — "Logic + handler tests (offline)"** = `npm run test:logic` = `bash tests/run_clock_tests.sh`. Deterministic, no network, ~59 node test files. **REQUIRED — a failure reddens the commit and emails Joe.** The script uses `set -e`, so it **stops at the first failing test** — one stale test reddens the whole job and hides the rest.
- **Job 2 — "Browser smoke — full lifecycle on staging"** = `npm run test:browser-staging` = `node tests/wo_lifecycle_browser.staging.test.js`. Opens the real app, forces staging, logs in with staging test accounts, drives the office↔field WO lifecycle, asserts the cloud, cleans up. It has **`continue-on-error: true`**, so it **does NOT redden the run or email** — it only shows a note in the Actions tab. (Removing that one line in ci.yml makes it a required/blocking check — Joe's call, once it's reliably green.)

So: **the failure emails come from Job 1 (the offline suite), never Job 2.** If Joe is getting CI emails, a logic test is red. If the Actions tab shows a red mark but there's no email, it's the smoke job (non-blocking).

### Test maintenance discipline (why tests go stale)
Most of these tests assert on **exact implementation strings** (regexes against the source of a render function). They are brittle by design — they lock behavior — but that means **when you change a feature's UI or behavior, you must update its test in the same change**, or it goes stale and (being in the required job) reddens every push. The Nov emails were one stale test: `po_list_actions.test.js` still expected the pre-receiving Receive button rule (`['Sent','Partially Received']`) after the receiving rework made Draft receivable (`['Draft','Sent','Partially Received']`). Prefer **resilient assertions** (match the essential intent, tolerate an added status) over pinning an exact array, so a later extension doesn't re-break the test.

### How to diagnose red CI from a session (no GitHub repo access needed)
This session's `gh` cannot reach the repo (needs `add_repo`, and GraphQL is blocked), **but the workflow and the full test suite live in the local app copy**, so diagnose locally:
- **Offline suite (the one that emails):** `bash tests/run_clock_tests.sh` — but it stops at the first failure. To see *all* failures, loop: `for t in tests/*.test.js <root .js>; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done`.
- **Browser smoke:** `node tests/wo_lifecycle_browser.staging.test.js` — the sandbox has Playwright + network to the live app and staging, so it runs for real. It exits `2` (not a real fail) if the network is blocked. 400s in its console = **schema drift on staging** (see the golden rule). It seeds and deletes its own WO, keyed on ID, in staging only.

### Deploy mechanics that affect CI (see also the deploy section above)
- **This is NOT a git repo locally; deploy = zip → GitHub Desktop → push.** A Stop-hook "commit and push" message is a false alarm.
- **`tests/` IS included in the deploy zip**, so a test fix reaches the repo through a normal deploy (and the push it causes reruns CI).
- **`.github/` is NOT in the zip** (the zip excludes dotfiles: `-x '.*' -x '*/.*'`), so **changes to `ci.yml` cannot ship via a deploy** — they must be made directly on GitHub (or with repo push access). Know this before promising a workflow change.
- A **test-only** fix does **not** need an `APP_BUILD`/`SHELL_VERSION` bump (no app behavior changes); just ship the zip so the test file updates in the repo.

### Quieting CI the right way
To stop failure emails: **fix the red logic test** (keeps the safety net) — not by disabling the workflow or muting GitHub notifications (which throws away the integrity check we built). Disable/pause the workflow only as a deliberate, temporary choice Joe makes, never as the default fix.
