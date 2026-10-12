# Checkouts Per-Row — Proper Schema Design + Cutover (Oct 2026)

> **STATUS: ✅ CUTOVER COMPLETE & VERIFIED LIVE — 2026-10-06.** Per-row custody is now the default for everyone (`_checkoutsPerRow()` returns `true`). Checkout data no longer rides the clobber-prone whole-array blob. Emergency rollback: append `?coperrow=0` to the URL (or `localStorage['checkouts_perrow']='0'`) to fall back to the blob path with no redeploy.

_Hardened the tool checkout / custody records to per-row, to the SAME typed standard as the tools migration (real columns for real fields; jsonb only for genuine snapshots/extras). Decision: reuse and extend the pre-built `tool_checkouts` table rather than a throwaway blob-in-a-row — "stitches," not a band-aid._

## Verification (what proved it, not "all is good")

- **Self-test harness** (`staging/selftest.html`): **17/17 green** against the live DB, including two-writers-different (both survive), two-writers-same (stale REJECTED, no clobber), full pending→accept hand-off with a real stays-behind split, return→verify, as-is chain, and auto-cleanup. Re-run green after each deploy and after cutover.
- **Real-app dry run** (the actual `saveCheckoutModal` / `_executeTransferMove` functions, flag on then default-on): checkout persisted per-row linked to the real tool; sender released; receiver holds it peer-accepted; split stored as a real row (`is_group_split`, real `tool_id`, no `_groups`); active-holder lookup shows receiver only; return persisted; cleanup left 0 active rows.
- DB left clean: 0 active checkouts, 0 active SELFTEST rows (soft-deleted test rows remain `is_active=false`, invisible to the app).

## Two bugs caught in LIVE testing (would not surface in the harness alone)

1. **RLS blocked name-based checkouts.** `tool_checkouts` had only a login-based permissive INSERT policy (`checked_out_to_id = auth.uid() …`); custody goes to names, so both id columns are null and every insert was refused. **Fix:** replaced the narrow public policies with active-user policies (read = authenticated; insert/update = `is_active_user()`), matching the tools model. The restrictive `active_users_only` gate still limits writes to active company members. Hard DELETE stays blocked (soft-delete only).
2. **Engine couldn't see the app's data.** The app's `DB` is module-scoped, NOT on `window`; `checkouts_db.js` was reading `window.DB.tools`, which is undefined in the real app, so tool-id resolution returned nothing and saves would fail. **Fix:** resolve tools through the global `getTools()` accessor (self-test harness fallback to `window.DB.tools` kept). The harness missed this because it defines its own `window.DB` — hence the live run mattered.

## Schema (additive columns run in SQL editor — DONE)

Name columns (`to_name`, `transferred_from_name`, `verified_by_name`, `return_submitted_by_name`); `checked_out_to_id` made nullable; `job_name`; transfer detail (`transfer_mode`, `transfer_to_name`, `transfer_by_name`, `transfer_expires_at`, `transfer_note`, `transfer_travel` jsonb, `transfer_stay` jsonb, `accepted_by_name`, `accepted_at`, `brokered_by_name`, `brokered_at`, `approved_by_name`, `accept_condition`, `transfer_prior_id`, `transfer_dispute_by/reason/at`); as-is (`taken_as_is`, `as_is_from_name`, `as_is_ack_by`, `as_is_approved_by`, `as_is_prior_id`); split (`is_group_split`, `split_from_tool_id`); lifecycle (`checkout_date`, `is_active`). Fields without a column ride `legacy_extra` (jsonb) — genuine history detail only; each checkout is still its own row, so no cross-record clobber.

## Status mapping (app → `tool_status` enum)

| app `status` | → table `status` |
|---|---|
| checked_out | checked_out |
| pending_verify | pending_verification |
| verified (closed) | closed_verified |
| verified + discrepancy | closed_with_discrepancy |
| as_is_released | reissued_assumed_responsibility |

## How the per-row layer works (same pattern as tools)

- `CheckoutsDB.load()` → read active checkouts (`is_active=true`), map rows back to the app's checkout objects, resolve `tool_id` uuid → app legacy id via `getTools()`, populate `DB.toolCheckouts`.
- `CheckoutsDB.save(co)` → insert or optimistic update (one row, `.eq('updated_at', _rev)` guard). Different checkouts never collide; same-checkout stale write → `{conflict:true}`, caller reloads.
- `tools.js` write points (checkout, return, send/accept/dispute/cancel/broker/one-way transfer, expired-sweep, as-is, verify, personal-borrow) call `_coPersist(co)` right after `saveDB()`. No-op when flag off.
- `auth.js` load path and both blob-push loops skip `toolCheckouts` when the flag is on (keeps the key in `_BLOB_KEYS` so `?coperrow=0` reverts instantly).
- Split: real `tool_id` + `is_group_split=true` (synthetic `_groups` id removed); every active-holder lookup (tools list, dashboard, barcode, transfer, delete-guard) excludes split rows.

## Files

`js/checkouts_db.js` (engine), `js/tools.js` (write wiring + split-id drop + lookup exclusions + defensive tool-flag per-row persist in verify), `js/auth.js` (load + push skips), `staging/selftest.html` (checkout tests), `index.html` (script tag + cache token). Shipped dormant, verified, then cut over by flipping `_checkoutsPerRow()` to `return true`.

## Still on the blob (future, not done)

`checkoutLog` (append-only audit) and `toolLoans` (personal borrows) were intentionally left on the blob this pass — both currently 0 rows, lower churn. Candidates for the same per-row treatment later (see data-integrity hardening roadmap). Inventory locations/transfers and the settings blob also remain.
