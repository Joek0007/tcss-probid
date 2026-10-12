# TCSS ProBid — Multi-Tenancy Plan (path to licensing multiple companies)

> **Purpose.** This is the deliberate, staged plan for the single biggest item between
> ProBid-as-it-is-today and ProBid-as-a-product you license to other companies. It is written
> so Joe (owner, non-coder) can make the call on **which path** and **when**, and so any future
> session has the full picture. Grounded in the live database as of build `as` (2026-09-05).

> ## ✅ DECISION (2026-09-05, Joe)
> **Solid-first. Defer the multi-tenancy build.** Get the software working properly for the single
> company first; serve the near-term additional companies (TCSS + 2) on **separate deployments**
> (own copy + own database each — absolute isolation, zero new code). Build true shared
> multi-tenancy only in the near future, *after* the app is solid — or sooner **only if** a future
> session finds a genuine reason the infrastructure must change first.
>
> **Claude's engineering verdict on that decision:** correct, and not a "should have done it long
> ago" situation — doing it prematurely would have been the mistake. Rationale: separate
> deployments are stronger isolation (physical, not software); the retrofit is mechanical and the
> hard foundations (server-side authz + per-row sync) already exist; data volume is tiny; and
> keeping each company in its own DB avoids any commingling debt. The **guardrail** that keeps the
> deferral cheap: keep building to the Engineering Standards — server-side authorization, per-row
> sync, and per-company behavior via **config, not hard-coded values** — so the eventual retrofit
> stays mechanical. Numbering sequences become per-tenant at that point (already flagged in
> migration _17). Claude will raise it immediately if anything ever genuinely needs tenant_id sooner.

---

## 1. The one decision this document is for

**How do you want to serve more than one company?** There are two legitimate answers, and the
right one depends on *how many* companies and *how soon*.

| | **Separate deployments** (available TODAY) | **True multi-tenancy** (a build) |
|---|---|---|
| What it is | Each company gets its own copy of the site + its own Supabase database | One shared app + one database; every row tagged with which company owns it |
| Data isolation | **Absolute** — the databases physically cannot see each other | Enforced in software (tenant-scoped security rules) |
| New code needed | **None** — it works with today's code | The plan below (a real, staged project) |
| Cost to run | N databases, N deployments (more monthly cost + more upkeep per company) | One database, one deployment (cheap per company) |
| Good for | 2–5 companies, starting now | Many companies, economically |
| Effort to add a company | Clone a deployment, seed it (an afternoon) | Fill in a form (once built) |

**Chosen path (see DECISION above):** separate deployments for the first companies now; this shared
multi-tenancy build stays on the shelf, ready to green-light, until the app is solid and going wider
is worth it.

Why not just build multi-tenancy immediately? Because it touches **every table and every security
rule in the system**. Done deliberately it's safe; rushed, it's the one change that could leak one
company's data to another — the worst possible bug for a product like this. Separate deployments buy
you the ability to start earning while the shared model is built and verified properly later.

---

## 2. Where the code is today (the honest starting line)

- **~30 active tables** carry the real business data (quotes, quote_line_items ≈9,100 rows,
  jobs ≈1,170, customers, contacts, catalog, team, work orders + children, time/payroll,
  invoices, POs, recurring contracts, work-tracking, settings). Another ~50 tables exist but are
  empty or vestigial (e.g. `work_days`, `timeoff_requests`, `recurring_invoices`, several `wq_*`
  and legacy `projects/buildings/...`) — those get retired or ignored, not migrated.
- **No `tenant_id` exists anywhere.** Every row today implicitly belongs to "the one company."
- **Security rules (RLS):** 83 tables have row-level security on. **49 policies are wide-open
  `using(true)`** (any signed-in user can read/write) — correct for one-company-per-database, and
  exactly what must become tenant-scoped for a shared database. The other ~87 policies are the
  role/authorization guards already added (deletes, payments, permission matrix, etc.) — those
  stay, with a tenant check added alongside.
- **Identity:** Supabase Auth + a `profiles` row per user (holds role + is_active). A
  `current_app_role()` function already reads the caller's role server-side. This is the natural
  place to also carry **which tenant** a user belongs to.
- **Client:** one browser-side `DB` cache; `pushAllToCloud()` / `syncAllFromCloud()` (auth.js) move
  data. Today they sync "everything"; under multi-tenancy they sync "everything for my tenant" —
  which the server enforces regardless, so the client change is small.

The good news: the recent campaign already built the two hardest prerequisites — **server-side
authorization** (RLS + SECURITY DEFINER RPCs + `current_app_role()`) and a **clean per-row sync
model**. Multi-tenancy slots into those rather than fighting them.

---

## 3. Target architecture (what "done" looks like)

1. **A `tenants` table** — one row per company (id, name, plan, created_at, active). This is the
   backbone everything else points at.
2. **`tenant_id` on every business table** — a column that says which company owns the row.
3. **The caller's tenant is known server-side** — stored on their `profiles` row and, ideally,
   stamped into their auth token (JWT claim) so security rules can read it cheaply.
4. **Every security rule becomes tenant-scoped** — `using (tenant_id = my_tenant())` replaces
   `using (true)`, layered *with* the existing role checks. A user can only ever see or touch rows
   for their own company, enforced in the database, not the browser.
5. **New rows get stamped automatically** — a default/trigger sets `tenant_id = my_tenant()` on
   insert so the client can't set it wrong or forge another tenant's id.
6. **One shared app** serves everyone; each login lands in its own company's data with no code fork.
7. **Per-company customization stays config, not code** — `company_settings`, roles/permission
   matrix, service types, statuses, terminology, branding all key off `tenant_id` (the foundation
   is already data-driven — see Engineering Standards).

---

## 4. The staged build (each stage shippable and verified before the next)

Ordering matters: **add the machinery invisibly first, backfill, then flip enforcement on** — so the
running company never breaks and the switch is one reversible step.

**Stage 0 — Prep & safety net.** Stand up a staging Supabase project that mirrors prod. Build a
seeded two-tenant test fixture (Company A + Company B with overlapping data) that every later stage
is verified against — "Company B can never see Company A" becomes a repeatable test, not a hope.
*Risk: none (separate project). Verify: fixture loads; both companies visible only to their own users.*

**Stage 1 — `tenants` table + tenant on identity.** Create `tenants`; add `tenant_id` to `profiles`;
add a `my_tenant()` SECURITY DEFINER function (mirrors the existing `current_app_role()`). Backfill:
one tenant row for TCSS, stamp every existing profile with it. *Risk: low (additive). Verify:
`my_tenant()` returns the right id per user.*

**Stage 2 — Add `tenant_id` columns everywhere (nullable, unenforced).** Add the column to every
active business table. Backfill all existing rows to the TCSS tenant. Do **not** enforce yet — the
app keeps working exactly as now. *Risk: low (columns are invisible until used). Verify: every row
has a tenant_id; app behaves identically.*

**Stage 3 — Auto-stamp new rows.** Add insert defaults/triggers so any new row gets the caller's
tenant automatically, and the sync layer includes tenant_id. Still no read-restriction. *Risk: low.
Verify: new records created in the app land with the correct tenant_id.*

**Stage 4 — Flip enforcement on (the real switch).** Replace the `using(true)` policies with
tenant-scoped ones (kept alongside the role guards), and stamp tenant into the JWT. This is the
moment isolation becomes real. Done per-table-group with the Stage 0 fixture proving isolation after
each group. *Risk: HIGH — this is the data-isolation boundary; it gets the most verification
(denial-path tests: log in as Company B, confirm zero Company A rows are reachable by UI **and** by
raw query). Reversible per policy.*

**Stage 5 — Tenant onboarding flow.** Owner-of-a-new-company provisioning: create the tenant, its
first owner login, and seed starter config (default catalog, statuses, permission matrix). Turns
"add a company" into a form. **Provisioning MUST include configuring that tenant's transactional
email / SMTP sender (see Section 8) — a new tenant whose owner can't receive an invite or password
link is dead on arrival.** *Risk: medium. Verify: provision a fresh tenant end-to-end, confirm it
starts empty and isolated, and confirm a real invite email is delivered from the tenant's sender.*

**Stage 6 — Per-tenant customization & branding polish.** Company name/logo, terminology, and any
per-company toggles read from that tenant's settings. *Risk: low. Verify: two tenants show their own
branding/config side by side.*

**Cross-cutting:** retire the vestigial empty tables before Stage 2 (fewer tables to migrate); every
stage verified **as a real user in the UI, then confirmed in the database** (the standing standard);
each stage is its own migration(s) + web build, delivered the usual way.

---

## 5. The biggest risks and how we defuse them

- **Cross-tenant leak (the one that matters).** Mitigated by: enforcing in the database (not the
  browser), the two-tenant fixture proving isolation after every Stage-4 group, denial-path tests
  from a real Company-B login, and default-deny (a table with RLS on and no matching policy shows
  *nothing* rather than everything).
- **Breaking the running TCSS office mid-build.** Mitigated by the additive-first ordering — Stages
  1–3 change nothing the user sees; only Stage 4 flips behavior, and it's reversible per policy.
- **A table missed during the sweep.** Mitigated by a checklist generated from the live table list
  (this doc's Section 2) and a query that flags any RLS-on table still carrying a `using(true)`
  policy after Stage 4.
- **Forged tenant_id from the client.** Mitigated by server-set defaults/triggers — the client never
  supplies its own tenant_id; the database stamps it from the verified identity.
- **Email that silently doesn't send (per deployment).** Every separate deployment ships with
  Supabase's demo email sender, which is capped at ~2 messages/hour regardless of paid plan and
  can *only* be raised by configuring custom SMTP. A deployment left on the default will appear to
  work in light testing, then fail invites / password resets / magic links under real use. Mitigated
  by making custom SMTP a required, checked provisioning step (Section 8).

---

## 6. Rough effort & sequencing

This is a **deliberate multi-week build**, not a patch — but it's mostly mechanical (the same column
+ policy change repeated across tables) once the pattern is set on the first few tables. The
intellectually hard parts (server-side auth, per-row sync, role model) already exist. Realistic
sequence: Stage 0–1 first (foundation), then 2–3 (safe, bulk, mechanical), then 4 (careful, the
verification-heavy switch), then 5–6 (onboarding + polish). Each stage lands and is verified before
the next; the whole thing can pause safely between any two stages.

---

## 7. Recommendation, in one paragraph

Serve the first 2–3 companies on **separate deployments now** — it's free of new risk and you can
start this week. Green-light the **staged multi-tenancy build** above when you want to go wider than
a handful of companies or stop paying for N databases; it reuses the security and sync foundations
already in place, and it's built additive-first so the TCSS office never goes dark during the work.
When you're ready, say the word and I'll start at Stage 0 (staging project + two-tenant test
fixture) and drive each stage with the same real-user-then-database verification we've been using.
**(This is the chosen direction as of 2026-09-05 — see DECISION at top.)**

---

## 8. Transactional email / SMTP — a REQUIRED setup step (per deployment)

**Added 2026-09-24 after TCSS hit Supabase's built-in email rate limit while testing invites.**

**The problem.** Every Supabase project ships with a built-in email sender that Supabase documents
as "for demonstration purposes only," rate-limited to roughly **2 emails per hour**, best-effort
delivery. This limit is **not tied to the plan** — upgrading from Free to a paid Supabase tier does
**not** raise it. Per Supabase's docs it "can only be changed with a custom SMTP setup." Every auth
email rides this sender: **member invites (magic links), password resets, and the mandatory
set-password gate.** So on the default sender, onboarding more than a couple of people in an hour
fails with a rate-limit error — exactly what TCSS hit.

**The fix.** Configure **custom SMTP** in each Supabase project, pointed at a real email provider.
TCSS already uses **Mailgun** (domain `tcss.com`, US region — the app calls `api.mailgun.net`) for
invoice and quote-proposal email, so the same Mailgun account is the natural sender. After custom
SMTP is configured, Supabase's default auth-email limit becomes **30 new users/hour** and is
adjustable upward in **Authentication → Rate Limits**. It also means invites/resets come **from the
company's own domain**, which lands in inboxes far more reliably than Supabase's shared demo sender.

**Setup (Supabase Dashboard → Authentication → Emails → SMTP Settings → Enable Custom SMTP):**
Sender email (e.g. `no-reply@tcss.com`), Sender name (e.g. `TCSS ProBid`), Host `smtp.mailgun.org`,
Port `587`, Username = the Mailgun SMTP login for the domain (e.g. `postmaster@tcss.com`),
Password = the Mailgun SMTP password (Mailgun → Send → Domains → the domain → SMTP credentials).
Credentials are entered by the owner, not by Claude. Then optionally raise the email rate limit
under Authentication → Rate Limits.

**Why it belongs in this plan.**
- **Separate-deployments model (today):** each company = its own Supabase project = its own Auth
  email config. So **custom SMTP must be configured once per company deployment.** It is now a
  required line on the per-company provisioning checklist — a deployment without it will silently
  fail onboarding under real use.
- **Shared multi-tenancy model (future):** custom SMTP is configured **once** for the single shared
  project (Stage 5). The *sender identity* can still be branded per tenant (per-tenant from-address
  / sending domain in Mailgun) so each company's invites appear to come from that company — that
  per-tenant "from" belongs with the Section 7 per-tenant config, but the SMTP transport itself is
  one project-wide setup.

**Status:** TCSS's own project — custom SMTP setup **in progress (2026-09-24)**; until it's live,
keep test-invite volume under ~2/hour to avoid the limit.

*(Companion docs: Engineering Standards — the quality bar and the two-paths framing; Risk Ledger —
what's already hardened; Sync Audit — the per-row sync model this builds on.)*
