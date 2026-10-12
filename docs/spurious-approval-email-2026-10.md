# Spurious "quote approved" email — diagnosis + fix (2026-10-04)

## Incident
Joe opened Q-2047, copied its scope of work, moved to another quote to work on formatting,
and — without clicking Approve — got an email saying he'd approved Q-2047 under "Jay Keigh"
(his alias). He was alarmed it approved itself / someone else acted.

## Diagnosis (from live DB — nothing unauthorized happened)
- Q-2047 was **genuinely approved on 2026-09-22** (`approved_at`=2026-09-22 22:04,
  `approved_by_name`='Jay Keigh') — Joe's own **test** when the approval-email feature was built.
  Joe confirmed he did that test.
- No approval action occurred today: `probid_audit` has **no approval event** for Q-2047 today
  (only the Dawn/Lisa roster churn). But the quote's `updated_at` was "now."
- Mechanism of the ghost email:
  1. Email is sent by trigger `trg_notify_quote_approval` = `AFTER UPDATE OF approval_status`.
     In Postgres that fires whenever an UPDATE **targets** that column, and the function sends
     when `NEW.approval_status is distinct from OLD` and is approved/changes_requested.
  2. Joe's browser still held the Sept-22 local 'approved' state for Q-2047. Opening the quote
     flagged it dirty; working in the other quote triggered a save that flushed ALL dirty quotes,
     pushing Q-2047's full row (incl. the stale 'approved').
  3. On the server the status wasn't 'approved' at that instant, so the push was a real
     transition → distinct → the approval email re-fired, carrying the stale Sept-22 name.
- So: a stale-local-state re-sync re-notified; not a new approval, not a breach, not the
  formatting tools. Timing with the paste was coincidental (the paste's save flushed it).

## Fix 1 — email freshness guard (DB migration `notify_quote_approval_freshness_guard_20261004`, certified)
`notify_quote_approval_change()` now only emails on approval when the approval is **recent**
(`coalesce(approved_at, approval_approved_at) > now() - interval '15 minutes'`). A stale
re-sync of an old approval can no longer fire the customer-facing email. `changes_requested`
left unchanged (never used yet; confirm which timestamp it sets before guarding it the same way).

## Fix 2 — ROOT CAUSE, server-authoritative guard (DB: `guard_quote_approval_fields()` + trigger `trg_guard_quote_approval`, certified 2026-10-04)
Instead of patching the client (any browser could still re-push), the decision is enforced at the
data layer, per engineering-standards #1. **Only the public approval portal (`auth.role()='anon'`)
may move a quote INTO a decided state.** A BEFORE UPDATE trigger reverts any non-anon update
(the signed-in app / bulk sync / even service_role) that tries to set `approval_status` to
`approved`/`changes_requested`, and preserves the decision stamps (`approved_at`,
`approved_by_name`, `approval_approved_at/by`, `approval_action/note`, margin/total_at_time).
- The app can still set pre-decision states (draft/pending/sent), generate approval tokens, and
  clear approval on duplicate — none of that is touched (only the two decided values are gated).
- **Verified:** forced Q-2026-1000 to `approved`/'GUARD TEST' as service_role → it stayed `null`
  (reverted), and no email fired. Portal (anon) approvals still work.
- **Implication to note:** there is now NO internal "approve on behalf" by staff — approval can
  only come from the customer portal. If an internal approve is ever wanted, build it as a
  dedicated secure path (e.g. an owner-gated RPC), don't loosen this guard.
- Ops note: `CREATE TRIGGER` on `quotes` kept timing out via multi-statement apply_migration;
  creating the function alone, then the trigger as a SINGLE statement via execute_sql, worked.

## Outcome
Both the visible harm (bogus emails) and the root cause (client resurrecting/forcing approval
state) are now closed entirely server-side — no app delta/upload required. Q-2047 remains
'approved' (correct — real Sept-22 test). No client code changed.
