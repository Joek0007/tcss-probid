# Dawn Pilot — Access & Onboarding Decisions

_Context: Dawn Brown (dawnb@tcss.com), TCSS's #1 back office, is the first non-owner to
use ProBid — testing Monday. Lisa Lammonds joins ~a day after (also Back Office). Captured
here so the access model is durable across sessions._

## Role model
- Office staff = **Back Office** (`back_office`). The DB `profiles.role` enum only allows
  `owner, back_office, manager, lead_tech, helper_tech` — `office` is NOT valid.
- The DB's RLS gates every office WRITE (customers, jobs, contacts, quotes, projects,
  inventory, etc.) on `role IN ('owner','back_office')`. Manager is NOT in those write
  policies. => office admins MUST be `back_office` to function; a new "finance" enum role
  would be denied writes across ~20 policies (that's why we did NOT add one).
- New logins: `handle_new_user` trigger creates them `helper_tech` + `is_active=false`
  (pending). Owner approves + sets role in **Team → 🔑 User Login Access** (`set_user_role`).

## Pay visibility (delivered: delta df + dg, migration _25)
Decision (Joe): no back office person sees pay rates or paycheck totals — **except the
payroll person (Victoria)**.
- `back_office` role defaults = 0 for `payroll.view/process/export` and `rpt.payroll`.
- `_canViewPay()` (dispatch.js) is the single gate = role payroll perm **OR** per-user
  `profiles.can_view_pay` flag. Used by: Team rate column + Hourly Rate field, payroll
  page, payroll process/export, Reports payroll tab.
- **Victoria** stays `back_office` (office writes work) and gets `can_view_pay=true`.
  Owner toggles it in the User Login Access panel ("Sees Pay" ON/off; owner = Always).
  RPC `set_pay_visibility(uuid,bool)` (owner-only, audited); `list_user_profiles()` returns
  the flag. Set it once Victoria has signed in and been approved — she isn't in the Monday test.
- Team rate column also hidden via `body.role-back-office .team-rate-col` CSS (defense).
- HARDENING (not done): `team.rate`, `pto_balances`, `holiday_pay_records` are still
  readable at the DB by any back_office (RLS is office-level, not pay-level). UI is gated;
  true server-side pay masking is a future item.

## Quoting (delivered: delta df)
- `quote.create`=1 for back_office (draft/edit). `quote.send` + `quote.convert` stay
  owner/manager only = interim "approval before it goes out" (Dawn drafts, owner sends).

## Other Back Office access (delivered: delta dh)
- **Scanner**: `page.scanner` back_office 0 -> 1 (Joe: full scanner access). No sub-gates.
- **Inventory pricing**: already available — back_office has `page.inventory`=1 and the
  Inventory page has NO cost/price gate (Unit Cost + Price Book import open to it). No change
  needed; Dawn can view/edit inventory pricing today.
- OPEN QUESTION for Joe: editing the master **Price Catalog** page is separate
  (`settings.catalog`, currently back_office=0 → view-only). If "handles pricing" should
  include editing catalog prices, flip that too. Not changed yet — awaiting Joe.

## Onboarding (delivered: delta df)
- In-app one-time welcome for back_office on first login (`_maybeShowBackOfficeWelcome`).
- Printable "Welcome Dawn" one-pager delivered (pay-rates mention removed; catalog wording fixed).

## Remaining fast-follow (confirm before building)
1. **Full quote-send approval workflow** — Dawn marks a quote "ready" → owner notified →
   approves → send unlocks. NOTE: a `quote_approval_log` table + RLS already exist in the
   DB (scaffolding present). New feature; recommend after pilot feedback.
2. **Server-side pay masking** (see hardening note above) — post-pilot.
3. **Price Catalog edit for back_office** — pending Joe's call (see Other Access above).

## Email / invites
- Invite = `sendInviteToMember` → `signInWithOtp` (magic link) → **Supabase Auth email**.
  Joe reports Mailgun is set up. TO CONFIRM: Mailgun is wired into Supabase → Authentication
  → Custom SMTP (not just a standalone Mailgun account), sending domain verified, and one
  live test send lands (watch `auth_logs`).

## Delivered deltas this thread
- **df**: pay hidden from back_office + quote drafting + welcome note.
- **dg**: per-user pay-visibility flag + owner "Sees Pay" toggle (migration _25 applied).
- **dh**: Back Office scanner access.
