# ProBid Data-Integrity Hardening Roadmap (Oct 2026)

_Written 2026-10-06 after the tool-records cutover (`hd`); updated through the tool-custody (`id`), inventory-locations (`if`), settings-merge (`ih`), and generic-collections (`ij`) cutovers. **As of `ij`, every blob that could hold data is per-row. The blob-clobber class is closed.**_

## The principle (why this exists)

ProBid stored data two ways:

- **Per-row tables (safe):** each record is its own database row with a stable id; writes/updates/deletes touch only that row, guarded by `updated_at` optimistic concurrency. Two people editing different records never collide; two editing the *same* record → stale one rejected, never silently overwritten.
- **Whole-list / whole-object "blob" (unsafe):** a whole collection (or one big config object) stored as one JSON value, saved wholesale ("last writer wins"). Any second open copy that saved overwrote everyone else's changes. **This was the root cause of the "my work disappeared" problem since May 2026 — now eliminated.**

The fix: per-row table + optimistic guard for collections; **field-level merge** for the single settings object; **generic per-row store** for the small leftover collections. **Acceptance test (met for each):** two concurrent writers on the real DB — different records/keys both survive; same record → stale rejected (or last-writer-wins for a single settings value).

## Now safe (all done)

quotes & line items · customers · contacts · jobs · work orders, labor, expenses · purchase orders & lines · invoices · catalog / price list · inventory items (976 rows) · templates · team · time entries (19k+) · clock sessions/events · assets · recurring contracts · time-off requests · item serials · **tools + tool linked-groups (`hd`)** · **tool checkouts / custody / hand-off (`id`)** · **inventory locations (`if`)** · **company settings — field-level merge (`ih`)** · **invTransfers, checkoutLog, toolLoans, absences, lunchFlags, timeCorrections, payrollLog, leaveForfeiture — generic per-row store (`ij`, 2026-10-07)**.

**No ProBid collection writes to a whole-array / whole-object blob anymore.** (The `app_state` blob rows are retained but bypassed, so every `?...=0` revert still works.)

## Remaining work

| # | Item | Status | Why |
|---|---|---|---|
| 1 | Weekly off-site backup → Google Drive | **HIGH — awaiting Joe** | Supabase Pro backs up the DB, not Storage files (tool & job photos). Edge function + Drive folder done; needs Joe's Google service-account setup + 3 secrets (see photo-backup-setup doc), then test + schedule. |
| 2 | Multi-day soak + live-UI conflict-message click-through | LOW — observe in use | The engines are proven by the harness + live dry-runs; just hasn't run multi-day with the whole office yet. |
| 3 | Purge inactive `SELFTEST`/`PROOF-`/`PR2-` test rows | LOW — housekeeping | Harmless (filtered by `is_active`); a hard-delete timed out before, retry off-hours. |

## The cutovers — engines, flags, reverts

| Area | Engine / mechanism | Flag (default on) | Emergency revert |
|---|---|---|---|
| Tools + linked groups | `tools_db.js` `ToolsDB` | `_toolsPerRow()` | `?perrow=0` |
| Tool checkouts / custody | `checkouts_db.js` `CheckoutsDB` | `_checkoutsPerRow()` | `?coperrow=0` |
| Inventory locations | `inventory_locations_db.js` `InvLocationsDB` | `_invLocPerRow()` | `?invloc=0` |
| Company settings | `auth.js` + `merge_company_settings()` RPC | `_settingsMerge()` | `?setmerge=0` |
| Leftover collections (×8) | `collections_db.js` `CollectionsDB` (generic, keyed by collection+item_id) | `_collectionsPerRow()` | `?colperrow=0` |

All reverts are no-redeploy: the `app_state` blob keys remain in `_BLOB_KEYS` with a flag-skip, so turning a flag off falls straight back to the blob path.

## Settings merge — specifics (`ih`)

- `merge_company_settings(delta jsonb, remove_keys text[])` (SECURITY DEFINER, gated to `is_active_user()`): atomic `settings_json = settings_json || delta`, keeps typed `ma_*` columns in step, `remove_keys` deletes keys.
- Client snapshots settings on load (`__settingsBaseline`); each push sends only changed keys. Legacy mirrored typed columns (`company_name`/`default_labor_rate`/`default_target_margin`) are no longer written by the merge path and are NOT read while `settings_json` exists; extend the RPC to set them from the delta if a server-side consumer ever needs them live.

## Generic collections — specifics (`ij`)

- Table `app_collections(collection, item_id, data jsonb, is_active, …)`, unique `(collection, item_id)`. One table serves all 8 leftover collections.
- `CollectionsDB.load / syncArray / retire`. Wired entirely at the sync layer (`auth.js`): load per collection + snapshot a per-collection id baseline; on push, `syncArray` upserts present items and retires only ids this session loaded then removed — so a concurrent add by another session is never clobbered. No individual write sites were touched.
- All 8 were empty at cutover, so no migration was needed.

## Pattern / build order (proven 5×)

1. Confirm/extend the target table + `legacy_id` / `legacy_extra` (lossless). **DDL via MCP is classifier-blocked — hand Joe the SQL for the editor.**
2. Build the per-row layer (load / save-with-guard / retire), flag-gated, **resolving app data through global accessors (`getTools()`, `getLocations()`), not `window.DB`** (module-scoped — `id` lesson).
3. Check RLS insert/update/select fit the name-based / office model first (`id` lesson). New tables: restrictive `active_users_only` + permissive active-user read/insert/update, no DELETE policy (soft-delete only).
4. Add a `staging/selftest.html` section; prove the two-writer acceptance test on the real DB.
5. Migrate existing blob data (idempotent via `legacy_id`) **before** flipping — from a flag-OFF load; verify counts. (Skip if the blob is empty.)
6. Cut over (flip the engine's flag `return` to `true`), keep the key in `_BLOB_KEYS` with a flag-skip so `?...=0` reverts, re-run the harness live.

## Operational notes carried forward

- Removal is **soft-delete** (`is_active=false`) — client hard-DELETE is RLS-blocked by design.
- Do **not** re-run `migrateFromBlob` for tools — the blob's Fluke is photo-less and would overwrite the re-attached photo. Tables are authoritative now.
- Supabase **Pro**: daily DB backups (7-day), no PITR. Storage files are **not** backed up — remaining item #1 covers that.
- Device-bridge commit is flaky on first write — verify on disk (`git status`) after committing; a second commit lands it. New files must be ticked in GitHub Desktop or they won't push.
- CDN serves cached HTML (index.html / selftest.html) for a minute or two after a push — re-check with a fresh `?cb=` before concluding a deploy failed.
- The self-test (`staging/selftest.html`) now covers tools, checkouts, inventory locations, settings merge, and the generic collections store — **33 checks, all green** as of `ij`. Re-runnable anytime by Joe.
