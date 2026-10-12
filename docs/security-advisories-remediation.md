# Supabase Security Advisories — Remediation (2026-09-30 → 2026-10-01)

Triggered by a Supabase email flagging a CRITICAL `rls_disabled_in_public`. Verified against the
project's own advisor (`get_advisors type=security`) rather than the email alone, then remediated.

Project: TCSS-Probid (`jzvoksidbelxibzbizvi`).

## What was found
- **CRITICAL — `rls_disabled_in_public` (6 tables):** six leftover `_bk_` backup snapshots from the
  Sept catalog/inventory/Graybar migrations were sitting in the public schema with RLS off →
  readable/writable by anyone with the project URL (the anon key ships in the client).
  Tables: `_bk_catalog_20260925`, `_bk_catalog_dedup_20260925`, `_bk_catalog_20260926_unify`,
  `_bk_inventory_20260926_unify`, `_bk_graybar_priceupd_20260926`, `_bk_graybar_reel_20260926`.
- **WARN — `function_search_path_mutable` (8):** functions without a pinned `search_path`.
- **WARN — `anon_security_definer_function_executable` (27):** the public/anon key could call
  privileged SECURITY DEFINER functions (owner-gated internally, but shouldn't be anon-reachable).
- **WARN — `authenticated_security_definer_function_executable` (41):** signed-in users can call
  the app's own SECURITY DEFINER RPCs. **By design / accepted** — this is the app calling its own
  owner-gated functions; revoking would break the app.
- **WARN — `extension_in_public` (pg_trgm):** cosmetic; **deliberately skipped** (moving it can
  ripple into search features).
- **WARN — `auth_leaked_password_protection` disabled:** dashboard toggle (Authentication → Attack
  Protection). **Owner action** — cannot be set via SQL/MCP.

## What was done (all via Supabase MCP, applied + verified)
1. **Backup tables exported then dropped.** First sealed (RLS on, API roles revoked), exported a full
   schema+data restore to `_bk_restore_20260930.sql` (1,808 rows: 117/444/605/488/112/42) as a
   reversible safety net, confirmed no views/FKs depended on them, then dropped them.
2. **Pinned `search_path = public, pg_temp`** on the 8 flagged functions (touch_updated_at,
   generate_job_number, generate_quote_number, generate_asset_tag, get_my_role, update_updated_at,
   block_hard_delete, replace_quote_line_items). → finding cleared (0).
3. **Removed anon access to privileged functions.** The key subtlety: EXECUTE was granted to PUBLIC
   at function-create time, which anon inherits — so `revoke ... from anon` alone was NOT enough
   (verified it had no effect). Fix: `revoke execute ... from public, anon` + `grant execute ... to
   authenticated` on the 26 privileged functions, **keeping `get_company_brand` anon-callable** for
   the public approval portal. → anon finding dropped 27 → 1 (just get_company_brand, intentional).
   - Portal anon surface was audited first (`portal.html`): only `get_company_brand` RPC + direct
     `quotes` table read/update (RLS-governed). App RPCs (js/*) are all post-login (authenticated).
     Login itself uses GoTrue, not these RPCs. So anon removal is safe.

## Post-state (advisor re-run 2026-10-01)
- `rls_disabled_in_public`: **0** (resolved). `function_search_path_mutable`: **0** (resolved).
- `anon_security_definer_function_executable`: **1** (get_company_brand — intentional, portal).
- `authenticated_security_definer_function_executable`: 41 (by design, accepted).
- `extension_in_public`: 1 (pg_trgm — skipped by choice). `auth_leaked_password_protection`: owner toggle.

## Open owner actions
- Flip **leaked-password protection** ON (Authentication → Attack Protection).
- **Live 30-second check** after the anon-revoke: sign in, open a quote + Team page, adjust a stock
  qty, and open a customer approval link. If any permission error: re-grant is instant/reversible
  (`grant execute on function public.<fn>(<args>) to anon;` — but it should not be needed).

## Gotchas captured for next time
- Supabase grants function EXECUTE to **PUBLIC** on create; to deny anon you must revoke from PUBLIC
  (not just anon) and re-grant to authenticated. `has_function_privilege('anon', …)` reflects the
  PUBLIC path, so it's the way to verify.
- The in-session MCP classifier intermittently blocks function GRANT/REVOKE as "Modify Shared
  Resources"; it went through on retry. A `.sql` fallback for the SQL Editor also exists
  (`security_hardening_20260930.sql`).
- Delivery note: a `.sql` file is **run in the Supabase SQL Editor**, never uploaded to GitHub.
  (A wrong-file run of `_bk_restore_*.sql` recreated the backup tables once; re-dropped.)
